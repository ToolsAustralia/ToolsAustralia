import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import AnonymousIdService from "@/services/ab-testing/AnonymousIdService";
import PromoAnalyticsService from "@/services/promo-analytics/PromoAnalyticsService";
import PromoAnalyticsVisit from "@/models/PromoAnalyticsVisit";
import { extractAttributionParams } from "@/utils/tracking/utm-helpers";
import { parseReferrer } from "@/utils/tracking/referrer-helpers";

const promoPageVisitSchema = z.object({
  pageType: z.enum(["evergreen", "toolset"]),
  slug: z.string().min(1).max(100),
  referrerSlug: z.string().min(1).max(50).optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
});

/**
 * POST /api/tracking/promo-page-visit
 *
 * Track promotion page visits for analytics attribution.
 * No auth required. Uses anonymousId cookie for session attribution.
 * Deduplication: one visit per slug per anonymousId within 1 minute.
 *
 * Why the DB work runs in `after()`:
 *   This beacon fires from promo/ad-landing pages — the highest-traffic path.
 *   When ad traffic bursts, fresh serverless instances race to acquire Mongo
 *   connections (small pool + Atlas new-connection rate limit), and the dedup
 *   read + recordVisit write previously ran on the request's critical path —
 *   so a stalled connection blew the function `maxDuration` and returned a 504
 *   to the caller (observed in prod). Moving the work to `after()` returns the
 *   response immediately and lets Vercel keep the function alive to finish the
 *   write, so DB latency can no longer 504 the beacon or drop the visit.
 *   We use `after()` (not the floating-promise `executeBackgroundJob` helper)
 *   precisely because `after()` is guaranteed to run to completion on Vercel —
 *   a bare un-awaited promise can be dropped when the instance freezes, which
 *   is the exact high-load moment we need the attribution write to survive.
 *
 * @see docs/PROMO_PAGE_ANALYTICS.md
 */
export async function POST(request: NextRequest) {
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

  // Record the visit off the response path so DB latency can't 504 the beacon.
  after(async () => {
    try {
      // Deduplication: prevent duplicate visits within 1 minute (handles refresh).
      // Bounded with maxTimeMS so a slow read can't hold the function open to maxDuration.
      if (anonymousId) {
        const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
        const recentVisit = await PromoAnalyticsVisit.findOne({
          anonymousId,
          slug: validatedData.slug.toLowerCase().trim(),
          pageType: validatedData.pageType,
          timestamp: { $gte: oneMinuteAgo },
        })
          .maxTimeMS(5000)
          .lean();

        if (recentVisit) return; // duplicate within the window — already tracked
      }

      const referrerInfo = parseReferrer(referrerHeader);
      const attribution = extractAttributionParams(url);

      // Prefer utm_* from URL; fallback to campaign_id for Facebook ads when utm_campaign is missing
      const utmCampaign =
        validatedData.utmCampaign ??
        attribution.utm_campaign ??
        (attribution.campaign_id ? `fb_${attribution.campaign_id}` : undefined);

      const result = await PromoAnalyticsService.recordVisit({
        pageType: validatedData.pageType,
        slug: validatedData.slug,
        referrerSlug: validatedData.referrerSlug,
        anonymousId,
        referrer: referrerInfo.referrer || undefined,
        utmSource: validatedData.utmSource ?? attribution.utm_source,
        utmMedium: validatedData.utmMedium ?? attribution.utm_medium,
        utmCampaign,
      });

      if (!result.success) {
        console.error("[promo-page-visit] recordVisit failed:", result.error ?? "unknown");
      }
    } catch (error) {
      console.error("[promo-page-visit] deferred tracking error:", error);
    }
  });

  return NextResponse.json({ success: true, message: "Visit tracked" });
}
