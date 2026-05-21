import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { sendConversion } from "@/lib/tracking/dispatch";
import type { CanonicalEvent, RequestContext } from "@/lib/tracking/types";
import { eventTimeNow } from "@/lib/tracking/canonical-event";
import { extractRequestContext } from "@/utils/tracking/facebook-helpers";

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
    externalId: z.string().optional(),
    birthdate: z.union([z.string(), z.date()]).optional(),
    clientIpAddress: z.string().optional(),
    clientUserAgent: z.string().optional(),
    fbc: z.string().optional(),
    fbp: z.string().optional(),
    ttclid: z.string().optional(),
    scid: z.string().optional(),
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
  eventName: z.string().min(1),
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
  // to ship raw PII. Server-injected fields (email/phone/firstName/lastName/state/
  // country/externalId/birthdate) take priority over client-supplied values; the
  // client retains authority for browser-only signals (fbc/fbp/clientUserAgent).
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

  // Extract fbc/fbp from request cookies and IP/UA from headers — without this,
  // funnel CAPI mirror events arrive with empty fbc/fbp and EMQ tanks. The browser
  // mirror deliberately omits these from the POST body (they're same-origin cookies
  // the server reads more reliably). See:
  // https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc
  const reqCtx = extractRequestContext(request);

  const userData: CanonicalEvent["userData"] = {
    ...sessionUserData,
    // Server-derived browser identifiers (fbc/fbp/IP/UA) are authoritative — they
    // come from the same-origin request the client cannot tamper with as easily.
    ...(reqCtx.fbc && { fbc: reqCtx.fbc }),
    ...(reqCtx.fbp && { fbp: reqCtx.fbp }),
    ...(reqCtx.client_ip_address && { clientIpAddress: reqCtx.client_ip_address }),
    ...(reqCtx.client_user_agent && { clientUserAgent: reqCtx.client_user_agent }),
    ...parsed.userData, // client-supplied overrides last (e.g. a deliberate override in tests)
  };

  const event: CanonicalEvent = {
    eventName: parsed.eventName,
    eventId: parsed.eventId,
    eventTime: parsed.eventTime ?? eventTimeNow(),
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
  };

  const results = await sendConversion(event, ctx);
  const ok = Object.values(results).some(Boolean);
  return NextResponse.json({ ok, results }, { status: 200 });
}
