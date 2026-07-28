import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import AnonymousIdService from "@/services/ab-testing/AnonymousIdService";
import PromoAnalyticsService from "@/services/promo-analytics/PromoAnalyticsService";
import PromoAnalyticsVisit from "@/models/PromoAnalyticsVisit";
import connectDB from "@/lib/mongodb";
import { recordPromoVisit } from "@/utils/promo-analytics/record-promo-visit";
import { createRateLimiter, getClientIdentifier } from "@/utils/security/rateLimiter";

const promoPageVisitSchema = z.object({
  pageType: z.enum(["evergreen", "toolset"]),
  slug: z.string().min(1).max(100),
  referrerSlug: z.string().min(1).max(50).optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
});

// Unauthenticated + keyed only on a format-checked cookie (same gap as the sibling
// promo-prize-build beacon — see F-012). This route only ever INSERTS a new visit row, so
// abuse here is less dangerous than the sibling's in-place $set (it shows up as inflated
// visit counts rather than silently rewritten attribution), but it is still a free-write
// primitive worth capping. A real visitor fires this once per page view (there is already a
// 60s server-side dedup window below), so 20/5min leaves large headroom for genuine use.
// Distinct bucket key from "promo-prize-build" so the two beacons have independent budgets.
// See docs/tech-debt/panel-review-feature-drawn-tonight-tomorrow-july-assets.md F-012.
const promoPageVisitRateLimiter = createRateLimiter("promo-page-visit", {
  windowMs: 5 * 60 * 1000,
  maxRequests: 20,
});

/**
 * POST /api/tracking/promo-page-visit
 *
 * Track promotion page visits for analytics attribution.
 * No auth required. Uses anonymousId cookie for session attribution.
 * Deduplication: one visit per slug per anonymousId within 1 minute.
 *
 * Rate limited (20 req / 5 min per identifier, checked synchronously before the Zod parse and
 * before `after()` is scheduled) — distinct bucket key from the sibling `promo-prize-build`
 * beacon so traffic on one can't exhaust the other's budget. See F-012.
 *
 * Why the DB work runs in `after()`:
 *   This beacon fires from promo/ad-landing pages — the highest-traffic path.
 *   When ad traffic bursts, fresh serverless instances race to acquire Mongo
 *   connections (small pool + Atlas new-connection rate limit), and the dedup
 *   read + recordVisit write previously ran on the request's critical path —
 *   so a stalled connection blew the function `maxDuration` and returned a 504
 *   to the caller (observed in prod). Moving the work to `after()` returns the
 *   response immediately and lets Vercel keep the function alive to finish the
 *   write, so DB latency can no longer 504 the beacon, and the visit survives
 *   anything short of the function's own `maxDuration` (10s here — the
 *   vercel.json catch-all; after() work is killed at that limit too, it is NOT
 *   unbounded). We use `after()` (not the floating-promise
 *   `executeBackgroundJob` helper) because Vercel keeps the function alive for
 *   `after()` work, while a bare un-awaited promise can be dropped the moment
 *   the response is sent — the exact high-load moment we need the write to
 *   survive.
 *
 * @see docs/PROMO_PAGE_ANALYTICS.md
 */
export async function POST(request: NextRequest) {
  const clientIp = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? null;
  const identifier = getClientIdentifier(clientIp, request.headers.get("x-forwarded-for"));
  const rateLimitResult = promoPageVisitRateLimiter.check(identifier);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { success: false, error: "Too many requests", retryAfterSeconds: rateLimitResult.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfterSeconds) } }
    );
  }

  let validatedData: z.infer<typeof promoPageVisitSchema>;
  try {
    const body = await request.json();
    validatedData = promoPageVisitSchema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  // Capture everything we need from `request` synchronously — it must not be
  // read inside `after()`, where the response has already been sent.
  const anonymousId = AnonymousIdService.extractAnonymousId(request) ?? undefined;
  const referrerHeader = request.headers.get("referer") || "";
  const url =
    request.headers.get("x-forwarded-url") || request.headers.get("referer") || request.url || "";

  // Record the visit off the response path so DB latency can't 504 the beacon. The
  // orchestration (dedup -> attribution -> persist) lives in recordPromoVisit, which is
  // unit-testable because its side effects are injected here as deps.
  after(async () => {
    try {
      const outcome = await recordPromoVisit(
        {
          pageType: validatedData.pageType,
          slug: validatedData.slug,
          referrerSlug: validatedData.referrerSlug,
          anonymousId,
          referrerHeader,
          url,
          utmSource: validatedData.utmSource,
          utmMedium: validatedData.utmMedium,
          utmCampaign: validatedData.utmCampaign,
        },
        {
          // connectDB() first: nothing upstream of this read opens the Mongo
          // connection, and mongoose does NOT auto-connect — on a cold instance a
          // bare findOne just buffers for 10s and the visit dies silently.
          // maxTimeMS bounds server-side query execution only (not connection
          // acquisition — connectDB's own 10s timeouts cover that).
          hasRecentVisit: async ({ anonymousId: aid, slug, pageType }) => {
            await connectDB();
            const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
            const recent = await PromoAnalyticsVisit.findOne({
              anonymousId: aid,
              slug,
              pageType,
              timestamp: { $gte: oneMinuteAgo },
            })
              .maxTimeMS(5000)
              .lean();
            return !!recent;
          },
          recordVisit: (payload) => PromoAnalyticsService.recordVisit(payload),
        }
      );

      if (!outcome.recorded && outcome.reason !== "duplicate") {
        console.error("[promo-page-visit] recordVisit failed:", outcome.reason);
      }
    } catch (error) {
      console.error("[promo-page-visit] deferred tracking error:", error);
    }
  });

  return NextResponse.json({ success: true, message: "Visit tracked" });
}
