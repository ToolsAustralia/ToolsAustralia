import { NextRequest, NextResponse, after } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import AnonymousIdService from "@/services/ab-testing/AnonymousIdService";
import PartnerDiscountAnalyticsService from "@/services/partner-discount-analytics/PartnerDiscountAnalyticsService";
import PartnerDiscountVisit from "@/models/PartnerDiscountVisit";
import connectDB from "@/lib/mongodb";
import { recordDiscountVisit } from "@/utils/partner-discounts/record-discount-visit";
import { createRateLimiter, getClientIdentifier } from "@/utils/security/rateLimiter";
import { readAttributionCookieFromRequest } from "@/utils/tracking/attribution-cookie";

/**
 * One visit per anonymousId + surface inside this window. Matches the promo visit beacon:
 * long enough to absorb a refresh or a double-mount, short enough that a genuine return
 * visit later in the session still counts.
 */
const DEDUP_WINDOW_MS = 60 * 1000;

const discountPageVisitSchema = z.object({
  surface: z.enum(["discount", "catalogue"]),
  /**
   * The visitor's effective partner-access % as the page computed it.
   *
   * Client-reported and clamped to 0-100 server-side. It is a DISPLAY value with no
   * authority — resolving the tier again here would mean a `User` read on the hot path of a
   * fire-and-forget beacon to reproduce a number the page has already rendered. Identity
   * (`userId`, `signedIn`) is NOT taken from the client; both come from the session below,
   * because those two are what every join in the funnel keys on.
   */
  accessPct: z.number().int().min(0).max(100).optional(),
});

/**
 * Insert-only, unauthenticated, keyed on a format-checked cookie — so abuse inflates visit
 * counts rather than rewriting existing rows. Still capped.
 *
 * Budgeted per VISITOR, not per IP. Australian carriers put very large numbers of users
 * behind one CGNAT egress IP, so an IP-keyed budget lets one traffic burst silently suppress
 * genuine visit rows for everyone behind it — and suppressed rows undercount visits and every
 * rate derived from them. 60/5min matches the repo's public-endpoint precedent. Distinct
 * bucket key from the sibling engagement beacon so neither can exhaust the other's budget.
 */
const discountPageVisitRateLimiter = createRateLimiter("discount-page-visit", {
  windowMs: 5 * 60 * 1000,
  maxRequests: 60,
});

/**
 * POST /api/tracking/discount-page-visit
 *
 * Records a visit to a partner-discount catalogue surface (`/discount` or
 * `/my-account/rewards/catalogue`). No auth required — the public page's whole purpose is
 * signed-out visitors — but the session is read when present so member visits carry a
 * `userId`.
 *
 * UTM IS RESOLVED ENTIRELY SERVER-SIDE, unlike the promo visit beacon which also accepts
 * client-supplied overrides. The durable first-touch `_ta_attr` cookie wins; the landing URL
 * (from `x-forwarded-url` / `referer`, which for a same-origin POST carries the full page URL
 * including its query string) is the fallback. Nothing about attribution is taken on trust
 * from the body, so there is no unbounded attacker-controlled string being written to Mongo.
 *
 * Why the DB work runs in `after()`: a stalled Mongo connection must never 504 a beacon. The
 * response returns immediately and Vercel keeps the function alive to finish the write —
 * which a bare un-awaited promise would not guarantee. See the long note in
 * `promo-page-visit/route.ts`.
 *
 * @see docs/tracking/api.md
 * @see docs/partner/analytics.md
 */
export async function POST(request: NextRequest) {
  const anonymousId = AnonymousIdService.extractAnonymousId(request) ?? undefined;
  // Prefer the visitor cookie over the IP so shared/CGNAT egress IPs do not share one budget.
  // Note the argument order: `getClientIdentifier(ip, forwardedFor)` returns arg 1 verbatim
  // when truthy, so `x-real-ip` must come first.
  const identifier =
    anonymousId ??
    getClientIdentifier(request.headers.get("x-real-ip"), request.headers.get("x-forwarded-for"));
  const rateLimitResult = discountPageVisitRateLimiter.check(identifier);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Too many requests",
        retryAfterSeconds: rateLimitResult.retryAfterSeconds,
      },
      { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfterSeconds) } }
    );
  }

  let validatedData: z.infer<typeof discountPageVisitSchema>;
  try {
    const body = await request.json();
    validatedData = discountPageVisitSchema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  // Everything below is read from `request` SYNCHRONOUSLY — it must not be touched inside
  // `after()`, where the response has already been sent. That includes the session: it is
  // resolved from the request's cookies, so it is awaited here rather than deferred.
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? undefined;
  const referrerHeader = request.headers.get("referer") || "";
  const url =
    request.headers.get("x-forwarded-url") || request.headers.get("referer") || request.url || "";
  const firstTouch = readAttributionCookieFromRequest(request);

  after(async () => {
    try {
      const outcome = await recordDiscountVisit(
        {
          surface: validatedData.surface,
          anonymousId,
          userId,
          signedIn: Boolean(userId),
          accessPct: validatedData.accessPct,
          referrerHeader,
          url,
          firstTouchUtmSource: firstTouch?.utm_source,
          firstTouchUtmMedium: firstTouch?.utm_medium,
          firstTouchUtmCampaign: firstTouch?.utm_campaign,
        },
        {
          // connectDB() first: nothing upstream of this read opens the Mongo connection, and
          // mongoose does NOT auto-connect — on a cold instance a bare findOne just buffers
          // and the visit dies silently. maxTimeMS bounds server-side execution only;
          // connectDB's own timeouts cover connection acquisition.
          hasRecentVisit: async ({ anonymousId: aid, surface }) => {
            await connectDB();
            const windowStart = new Date(Date.now() - DEDUP_WINDOW_MS);
            const recent = await PartnerDiscountVisit.findOne({
              anonymousId: aid,
              surface,
              timestamp: { $gte: windowStart },
            })
              .maxTimeMS(5000)
              .lean();
            return !!recent;
          },
          createVisit: (payload) => PartnerDiscountAnalyticsService.recordVisit(payload),
        }
      );

      if (!outcome.recorded && outcome.reason !== "duplicate") {
        console.error("[discount-page-visit] recordVisit failed:", outcome.reason);
      }
    } catch (error) {
      console.error("[discount-page-visit] deferred tracking error:", error);
    }
  });

  return NextResponse.json({ success: true, message: "Visit tracked" });
}
