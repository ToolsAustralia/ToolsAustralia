import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { sendConversion } from "@/lib/tracking/dispatch";
import type { CanonicalEvent, RequestContext } from "@/lib/tracking/types";
import { normalizeEpochToUnixSeconds, resolveEventTime } from "@/lib/tracking/canonical-event";
import { mirrorEventNameSchema } from "@/utils/tracking/mirror-event-names";
import { extractRequestContext } from "@/utils/tracking/facebook-helpers";
import { extractTikTokContext } from "@/utils/tracking/tiktok-helpers";
import AnonymousIdService from "@/services/ab-testing/AnonymousIdService";

const userDataSchema = z
  .object({
    email: z.string().optional(),
    phone: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
    country: z.string().optional(),
    birthdate: z.union([z.string(), z.date()]).optional(),
    clientIpAddress: z.string().optional(),
    clientUserAgent: z.string().optional(),
    // externalId / fbc / fbp / ttclid / ttp / scid are DELIBERATELY absent — do not add
    // them back. This endpoint is unauthenticated, so every key the schema accepts is
    // caller-controllable, and `...parsed.userData` is spread LAST when building `userData`
    // below — a body-supplied value silently beats the server-derived one.
    //
    // For the click ids that means a caller could attribute events to any ad click; they
    // are same-origin cookies the server reads itself (`extractRequestContext` /
    // `extractTikTokContext`), so a browser caller has no legitimate reason to send them.
    //
    // `externalId` is the same class and matters more now: the server resolves it below to
    // the session's `User._id`, else the `ta_anon_id` visitor id. Accepting it from the body
    // would let any caller overwrite BOTH — spoofing another member's identity into Meta's
    // and TikTok's user graphs, and defeating the anonymous-id fallback this route relies on
    // for its external-id coverage.
  })
  .optional();

const customDataSchema = z
  .object({
    contentIds: z.array(z.string()).optional(),
    contentType: z.string().optional(),
    contentName: z.string().optional(),
    contentCategory: z.string().optional(),
    numItems: z.number().optional(),
    orderId: z.string().optional(),
    packageType: z.string().optional(),
    searchString: z.string().optional(),
  })
  .optional();

const conversionBodySchema = z.object({
  // Funnel-event allowlist — this endpoint is unauthenticated, so value-bearing
  // events (Purchase, Subscribe, …) must not be constructible through it. Real
  // Purchases reach CAPI only via the Stripe webhook (verified payment).
  eventName: mirrorEventNameSchema,
  eventId: z.string().min(1),
  eventTime: z.number().optional(),
  value: z.number().optional(),
  currency: z.string().optional(),
  userData: userDataSchema,
  customData: customDataSchema,
  eventSourceUrl: z.string().optional(),
  providerData: z
    .object({
      facebook: z.record(z.string(), z.unknown()).optional(),
      tiktok: z.record(z.string(), z.unknown()).optional(),
      snapchat: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

function ipFromHeaders(req: NextRequest): string | undefined {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim();
  return req.headers.get("x-real-ip") ?? undefined;
}

export async function POST(request: NextRequest) {
  let parsed: z.infer<typeof conversionBodySchema>;
  try {
    parsed = conversionBodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Invalid event body", issues: err.issues },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  // Enrich userData from the authenticated session so the browser doesn't have
  // to ship raw PII. Session-derived PII (email/phone/firstName/lastName/state/
  // country/externalId/birthdate) is the trustworthy source, but the client may
  // still override it below — the card form legitimately sends the billing details
  // a shopper just typed, which can be better than a stale profile. Click/browser
  // ids are NOT client-overridable (see the schema note above).
  // Without this enrichment, funnel CAPI events would arrive with low EMQ when
  // the user is logged in but the browser snippet doesn't have the profile data.
  const sessionUserData: NonNullable<CanonicalEvent["userData"]> = {};
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (userId) {
      await connectDB();
      const user = await User.findById(userId)
        .select("email mobile firstName lastName state country birthdate _id")
        .lean<{
          _id: { toString(): string };
          email?: string;
          mobile?: string;
          firstName?: string;
          lastName?: string;
          state?: string;
          country?: string;
          birthdate?: Date;
        }>();
      if (user) {
        if (user.email) sessionUserData.email = user.email;
        if (user.mobile) sessionUserData.phone = user.mobile;
        if (user.firstName) sessionUserData.firstName = user.firstName;
        if (user.lastName) sessionUserData.lastName = user.lastName;
        if (user.state) sessionUserData.state = user.state;
        sessionUserData.country = user.country ?? "AU";
        sessionUserData.externalId = user._id.toString();
        if (user.birthdate) sessionUserData.birthdate = user.birthdate;
      }
    }
  } catch (sessionErr) {
    // Non-blocking — anonymous funnel events are still useful (fbc/fbp/IP/UA only).
    if (process.env.NODE_ENV === "development") {
      console.warn("[/api/tracking/conversion] Session lookup failed:", sessionErr);
    }
  }

  // external_id fallback for guests. The block above only sets `externalId` when a
  // session resolves to a User, so the guest-dominated events reached TikTok with
  // ~0-1% External ID coverage: the membership modal fires InitiateCheckout *before*
  // registration logs anyone in, and AddPaymentInfo fires from the Stripe card form,
  // which has no user id at all.
  //
  // TikTok explicitly sanctions a first-party cookie id as `external_id`, so we reuse
  // the anonymous id that already exists — `ta_anon_id` (`anon_<uuidv4>`, minted per
  // visitor in middleware, 90-day TTL) — rather than minting a second visitor identity.
  //
  // User._id stays preferred whenever a session exists: that is what holds
  // CompleteRegistration at 100% / Purchase at 96%, and it is how the rest of the
  // codebase identifies a known user. The consequence is that one visitor's external_id
  // DOES change at signup, `anon_<uuid>` → `User._id`. That is accepted, because the
  // existing /api/ab-testing/merge-user bridge already links those two ids server-side,
  // and TikTok merges identity-graph signals — the pre- and post-signup events still
  // resolve to one person rather than fragmenting.
  //
  // Sitting here (not per-event) this one fallback covers every event this endpoint
  // mirrors: ViewContent, AddToCart, InitiateCheckout, AddPaymentInfo, Lead, Search.
  if (!sessionUserData.externalId) {
    const anonymousId = AnonymousIdService.extractAnonymousId(request);
    if (anonymousId) sessionUserData.externalId = anonymousId;
  }

  // Extract fbc/fbp from request cookies and IP/UA from headers — without this,
  // funnel CAPI mirror events arrive with empty fbc/fbp and EMQ tanks. The browser
  // mirror deliberately omits these from the POST body (they're same-origin cookies
  // the server reads more reliably). See:
  // https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc
  const reqCtx = extractRequestContext(request);
  // TikTok click id (ttclid cookie, set on ad-click landing) + the pixel's _ttp
  // first-party cookie — the highest-value TikTok match signals for the Events API.
  const ttCtx = extractTikTokContext(request);

  const userData: CanonicalEvent["userData"] = {
    ...sessionUserData,
    // Server-derived browser identifiers, read from same-origin cookies/headers the client
    // cannot tamper with as easily. The click ids and externalId are now genuinely
    // unoverridable — `userDataSchema` does not accept them at all, so the client spread
    // below cannot reach them.
    //
    // IP/UA are the deliberate exception: they REMAIN client-overridable (the schema still
    // declares them and `ctx` below explicitly prefers the supplied value), because the
    // browser mirror is the only caller and a value it captured at event time is closer to
    // the truth than this request's headers. Do not read this block as "nothing here can be
    // spoofed" — only as "identity and attribution cannot".
    ...(reqCtx.fbc && { fbc: reqCtx.fbc }),
    ...(reqCtx.fbp && { fbp: reqCtx.fbp }),
    ...(ttCtx.ttclid && { ttclid: ttCtx.ttclid }),
    ...(ttCtx.ttp && { ttp: ttCtx.ttp }),
    ...(reqCtx.client_ip_address && { clientIpAddress: reqCtx.client_ip_address }),
    ...(reqCtx.client_user_agent && { clientUserAgent: reqCtx.client_user_agent }),
    // Client-supplied PII last — it can only reach the PII/IP/UA keys the schema still
    // declares, and a fresher just-typed value (billing details) beats a stale profile.
    ...parsed.userData,
  };

  const event: CanonicalEvent = {
    eventName: parsed.eventName,
    eventId: parsed.eventId,
    // Client clocks aren't trusted: normalize a possible ms epoch, then clamp to
    // Meta's accepted window (out-of-range event_time rejects the whole request).
    eventTime: resolveEventTime(normalizeEpochToUnixSeconds(parsed.eventTime)),
    value: parsed.value,
    currency: parsed.currency,
    userData,
    customData: parsed.customData,
    eventSourceUrl: parsed.eventSourceUrl,
    providerData: parsed.providerData,
  };

  const ctx: RequestContext = {
    clientIpAddress: parsed.userData?.clientIpAddress ?? ipFromHeaders(request),
    clientUserAgent: parsed.userData?.clientUserAgent ?? request.headers.get("user-agent") ?? undefined,
    eventSourceUrl: parsed.eventSourceUrl ?? request.headers.get("referer") ?? undefined,
    // TikTok `page.referrer`. Only ever the real `Referer` header — never derived from
    // eventSourceUrl, because a fabricated referrer is worse than none. Note this is the
    // referrer of the MIRROR POST, which for the browser mirror is the page the event
    // happened on, so it is the right value rather than a proxy for it.
    referrer: request.headers.get("referer") ?? undefined,
  };

  const results = await sendConversion(event, ctx);
  const ok = Object.values(results).some(Boolean);
  return NextResponse.json({ ok, results }, { status: 200 });
}
