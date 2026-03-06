/**
 * Promo Analytics Service
 *
 * Records promo page visits, links visits to users (future use), and aggregates metrics.
 *
 * @see docs/PROMO_PAGE_ANALYTICS.md
 */
import PromoAnalyticsRepository, {
  type PromoAnalyticsSummary,
  type PromoPageMetrics,
  type PromoAnalyticsByUTMSummary,
} from "@/repositories/PromoAnalyticsRepository";
import { isValidPromoSlug, getPageTypeFromSlug } from "@/utils/promo-analytics/validate-promo-slug";
import { isToolsetLandingSlug } from "@/config/promo-landing-slugs";
import type { PromoPageType } from "@/models/PromoAnalyticsVisit";
import type { PageDetailResult, ChannelDetailResult } from "@/types/promo-analytics";

export class PromoAnalyticsService {
  /**
   * Record a promotion page visit.
   * Validates slug before creating.
   */
  async recordVisit(data: {
    pageType: PromoPageType;
    slug: string;
    referrerSlug?: string;
    anonymousId?: string;
    referrer?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (!isValidPromoSlug(data.slug)) {
      return { success: false, error: "Invalid promotion slug" };
    }
    const pageType = getPageTypeFromSlug(data.slug);
    const referrerSlug =
      data.referrerSlug && isToolsetLandingSlug(data.referrerSlug)
        ? data.referrerSlug.toLowerCase().trim()
        : undefined;
    await PromoAnalyticsRepository.createVisit({
      ...data,
      pageType,
      slug: data.slug.toLowerCase().trim(),
      referrerSlug,
    });
    return { success: true };
  }

  /**
   * Link anonymous visits to a user when they register.
   */
  async linkVisitsToUser(anonymousId: string, userId: string): Promise<number> {
    return PromoAnalyticsRepository.linkVisitToUser(anonymousId, userId);
  }

  /**
   * Get aggregated metrics by promotion page for a date range.
   */
  async getAggregatedMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<PromoAnalyticsSummary> {
    return PromoAnalyticsRepository.getAggregatedByPage(startDate, endDate);
  }

  /**
   * Get aggregated metrics by UTM source (e.g. klaviyo, facebook) for channel attribution.
   */
  async getAggregatedByUTMSource(
    startDate: Date,
    endDate: Date
  ): Promise<PromoAnalyticsByUTMSummary> {
    return PromoAnalyticsRepository.getAggregatedByUTMSource(startDate, endDate);
  }

  /**
   * Get per-page detail: breakdown by (utmSource, utmMedium, utmCampaign).
   * Answers "which ads/emails drove traffic to this page?"
   */
  async getPageDetailMetrics(
    pageType: PromoPageType,
    slug: string,
    startDate: Date,
    endDate: Date
  ): Promise<PageDetailResult> {
    if (!isValidPromoSlug(slug)) {
      throw new Error(`Invalid promotion slug: ${slug}`);
    }
    return PromoAnalyticsRepository.getPageDetailByUTMCampaign(pageType, slug, startDate, endDate);
  }

  /**
   * Get channel detail: which pages received traffic from this channel
   * plus breakdown by campaign within the channel.
   */
  async getChannelDetailMetrics(
    utmSource: string,
    startDate: Date,
    endDate: Date
  ): Promise<ChannelDetailResult> {
    return PromoAnalyticsRepository.getChannelDetail(utmSource, startDate, endDate);
  }

  /**
   * Get top performing pages by conversion rate, signup rate, or revenue.
   */
  async getTopPerformingPages(
    startDate: Date,
    endDate: Date,
    limit: number = 10,
    sortBy: "conversionRate" | "signupRate" | "revenue" = "conversionRate"
  ): Promise<PromoPageMetrics[]> {
    return PromoAnalyticsRepository.getTopPerformingPages(
      startDate,
      endDate,
      limit,
      sortBy
    );
  }
}

const promoAnalyticsService = new PromoAnalyticsService();
export default promoAnalyticsService;
