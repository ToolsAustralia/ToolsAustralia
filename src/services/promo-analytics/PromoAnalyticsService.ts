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
} from "@/repositories/PromoAnalyticsRepository";
import { isValidPromoSlug, getPageTypeFromSlug } from "@/utils/promo-analytics/validate-promo-slug";
import type { PromoPageType } from "@/models/PromoAnalyticsVisit";

export class PromoAnalyticsService {
  /**
   * Record a promotion page visit.
   * Validates slug before creating.
   */
  async recordVisit(data: {
    pageType: PromoPageType;
    slug: string;
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
    await PromoAnalyticsRepository.createVisit({
      ...data,
      pageType,
      slug: data.slug.toLowerCase().trim(),
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
