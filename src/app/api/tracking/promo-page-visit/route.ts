import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import AnonymousIdService from "@/services/ab-testing/AnonymousIdService";
import PromoAnalyticsService from "@/services/promo-analytics/PromoAnalyticsService";
import PromoAnalyticsVisit from "@/models/PromoAnalyticsVisit";
import { extractUTMParams } from "@/utils/tracking/utm-helpers";
import { parseReferrer } from "@/utils/tracking/referrer-helpers";

const promoPageVisitSchema = z.object({
  pageType: z.enum(["evergreen", "toolset"]),
  slug: z.string().min(1).max(100),
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
 * @see docs/PROMO_PAGE_ANALYTICS.md
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = promoPageVisitSchema.parse(body);

    const anonymousId = AnonymousIdService.extractAnonymousId(request) ?? undefined;

    // Deduplication: prevent duplicate visits within 1 minute (handles refresh)
    if (anonymousId) {
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
      const recentVisit = await PromoAnalyticsVisit.findOne({
        anonymousId,
        slug: validatedData.slug.toLowerCase().trim(),
        pageType: validatedData.pageType,
        timestamp: { $gte: oneMinuteAgo },
      }).lean();

      if (recentVisit) {
        return NextResponse.json({
          success: true,
          message: "Visit already tracked (duplicate prevented)",
          duplicate: true,
        });
      }
    }

    const referrerHeader = request.headers.get("referer") || "";
    const referrerInfo = parseReferrer(referrerHeader);
    const url = request.headers.get("x-forwarded-url") || request.headers.get("referer") || request.url || "";
    const utmParams = extractUTMParams(url);

    const result = await PromoAnalyticsService.recordVisit({
      pageType: validatedData.pageType,
      slug: validatedData.slug,
      anonymousId,
      referrer: referrerInfo.referrer || undefined,
      utmSource: validatedData.utmSource ?? utmParams.utm_source,
      utmMedium: validatedData.utmMedium ?? utmParams.utm_medium,
      utmCampaign: validatedData.utmCampaign ?? utmParams.utm_campaign,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error ?? "Invalid request" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, message: "Visit tracked" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }
    console.error("[promo-page-visit] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to track visit" },
      { status: 500 }
    );
  }
}
