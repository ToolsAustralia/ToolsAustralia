import { subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { fetchFacebookInsights } from "@/lib/facebook-marketing";
import { getStartOfTodayInAEST } from "@/utils/common/timezone";
import type {
  FacebookAdsInsightsResponse,
  FacebookAdsBreakdownItem,
  ProcessedInsightMetrics,
  InsightLevel,
} from "@/types/facebook-ads";

/**
 * Fetcher signature — mirrors `fetchFacebookInsights` so callers can inject
 * a fake implementation in tests without hitting the Facebook API.
 */
type Fetcher = typeof fetchFacebookInsights;

export interface FacebookAdsInsightsServiceInput {
  dateRange: "today" | "yesterday" | "custom";
  level?: InsightLevel;
  /** ISO date string; required when `dateRange === "custom"`. */
  startDate?: string;
  /** ISO date string; required when `dateRange === "custom"`. */
  endDate?: string;
}

/**
 * Service wrapping the orchestration that was previously inlined in
 * `src/app/api/admin/facebook-ads/insights/route.ts`:
 *  - resolves the date range (today/yesterday/custom) in AEST
 *  - checks Facebook Marketing API env-vars
 *  - calls `fetchFacebookInsights`
 *  - aggregates metrics across campaigns/ad-sets/ads
 *  - converts monetary fields from cents to dollars in the response
 *
 * The route handler is responsible for HTTP-specific concerns (auth, Zod
 * validation, NextResponse error shapes); this service throws plain Errors
 * for the caller to translate.
 */
export class FacebookAdsInsightsService {
  constructor(
    private deps: {
      fetchInsights?: Fetcher;
      accessToken?: string;
      adAccountId?: string;
    } = {}
  ) {}

  async getInsights(
    input: FacebookAdsInsightsServiceInput
  ): Promise<NonNullable<FacebookAdsInsightsResponse["data"]>> {
    const accessToken = this.deps.accessToken ?? process.env.FACEBOOK_MARKETING_ACCESS_TOKEN;
    const adAccountId = this.deps.adAccountId ?? process.env.FACEBOOK_AD_ACCOUNT_ID;
    const fetcher = this.deps.fetchInsights ?? fetchFacebookInsights;

    if (!accessToken || !adAccountId) {
      throw new Error("Facebook Marketing API not configured (token or account ID missing)");
    }

    const level: InsightLevel = input.level ?? "account";
    const range = this.resolveDateRange(input);

    const insightsData = await fetcher(adAccountId, accessToken, range.api, level);

    let metrics: ProcessedInsightMetrics;
    let breakdownItems: FacebookAdsBreakdownItem[] = [];

    if (insightsData && insightsData.length > 0) {
      if (level === "account") {
        // Account level: Facebook returns a single aggregated insight.
        metrics = insightsData[0].metrics;
      } else {
        // Campaign / ad-set / ad level: aggregate for the summary and
        // build a per-row breakdown for the table display.
        metrics = aggregate(insightsData.map((d) => d.metrics));
        breakdownItems = insightsData.map((item) => ({
          level,
          campaignId: item.breakdown?.campaignId,
          campaignName: item.breakdown?.campaignName,
          adsetId: item.breakdown?.adsetId,
          adsetName: item.breakdown?.adsetName,
          adId: item.breakdown?.adId,
          adName: item.breakdown?.adName,
          spend: item.metrics.spend / 100, // cents → dollars
          revenue: item.metrics.revenue / 100,
          profit: item.metrics.profit / 100,
          roas: item.metrics.spend > 0 ? item.metrics.revenue / item.metrics.spend : 0,
          conversions: item.metrics.conversions,
          impressions: item.metrics.impressions,
          clicks: item.metrics.clicks,
          linkClicks: item.metrics.linkClicks,
          landingPageView: item.metrics.landingPageView,
          ctr: item.metrics.ctr, // already a percentage
          cpc: item.metrics.cpc / 100, // cents → dollars
          linkCtr: item.metrics.linkCtr, // already a percentage
          linkCpc: item.metrics.linkCpc / 100, // cents → dollars
        }));
      }
    } else {
      metrics = {
        spend: 0,
        revenue: 0,
        impressions: 0,
        clicks: 0,
        linkClicks: 0,
        conversions: 0,
        landingPageView: 0,
        profit: 0,
        roas: 0,
        ctr: 0,
        cpc: 0,
        linkCtr: 0,
        linkCpc: 0,
        reach: 0,
        frequency: 0,
        cpmCents: 0,
      };
    }

    return {
      summary: {
        spend: metrics.spend / 100, // cents → dollars
        revenue: metrics.revenue / 100,
        profit: metrics.profit / 100,
        roas: metrics.roas, // ratio, no conversion
        conversions: metrics.conversions,
        impressions: metrics.impressions,
        clicks: metrics.clicks,
        linkClicks: metrics.linkClicks,
        landingPageView: metrics.landingPageView,
        ctr: metrics.ctr, // percentage, no conversion
        cpc: metrics.cpc / 100,
        linkCtr: metrics.linkCtr, // percentage, no conversion
        linkCpc: metrics.linkCpc / 100, // cents → dollars
      },
      breakdown: breakdownItems,
      dateRange: { start: range.api.since, end: range.api.until },
      syncedAt: new Date().toISOString(),
      cached: false,
    };
  }

  private resolveDateRange(input: FacebookAdsInsightsServiceInput) {
    const AEST = "Australia/Sydney";
    const startOfToday = getStartOfTodayInAEST();

    const fmt = (d: Date) => formatInTimeZone(d, AEST, "yyyy-MM-dd");

    if (input.dateRange === "today") {
      const today = fmt(new Date());
      return { api: { since: today, until: today } };
    }
    if (input.dateRange === "yesterday") {
      const y = subDays(startOfToday, 1);
      const yStr = fmt(y);
      return { api: { since: yStr, until: yStr } };
    }
    // custom
    if (!input.startDate || !input.endDate) {
      throw new Error("startDate and endDate required for custom range");
    }
    return {
      api: { since: fmt(new Date(input.startDate)), until: fmt(new Date(input.endDate)) },
    };
  }
}

/**
 * Aggregate a list of per-row metrics (all values in cents) into a single
 * summary. Derived metrics (roas, ctr, cpc) are recomputed from the
 * aggregated totals — they cannot be averaged directly.
 */
function aggregate(arr: ProcessedInsightMetrics[]): ProcessedInsightMetrics {
  const a = arr.reduce(
    (acc, m) => ({
      spend: acc.spend + m.spend,
      revenue: acc.revenue + m.revenue,
      profit: acc.profit + m.profit,
      impressions: acc.impressions + m.impressions,
      clicks: acc.clicks + m.clicks,
      linkClicks: acc.linkClicks + m.linkClicks,
      conversions: acc.conversions + m.conversions,
      landingPageView: acc.landingPageView + m.landingPageView,
      reach: acc.reach + m.reach,
      frequency: 0, // recomputed below (impressions / reach)
      cpmCents: 0, // recomputed below
      roas: 0,
      ctr: 0,
      cpc: 0,
      linkCtr: 0, // recomputed below
      linkCpc: 0, // recomputed below
    }),
    {
      spend: 0,
      revenue: 0,
      profit: 0,
      impressions: 0,
      clicks: 0,
      linkClicks: 0,
      conversions: 0,
      landingPageView: 0,
      reach: 0,
      frequency: 0,
      cpmCents: 0,
      roas: 0,
      ctr: 0,
      cpc: 0,
      linkCtr: 0,
      linkCpc: 0,
    }
  );
  a.roas = a.spend > 0 ? a.revenue / a.spend : 0;
  a.ctr = a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0;
  a.cpc = a.clicks > 0 ? a.spend / a.clicks : 0;
  // Link CTR and Link CPC (based on inline_link_clicks)
  a.linkCtr = a.impressions > 0 ? (a.linkClicks / a.impressions) * 100 : 0;
  a.linkCpc = a.linkClicks > 0 ? a.spend / a.linkClicks : 0;
  // Frequency: average impressions per unique user (impressions / reach)
  a.frequency = a.reach > 0 ? a.impressions / a.reach : 0;
  // CPM in cents: (spend / impressions) * 1000
  a.cpmCents = a.impressions > 0 ? (a.spend / a.impressions) * 1000 : 0;
  return a;
}
