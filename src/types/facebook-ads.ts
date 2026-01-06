/**
 * TypeScript types for Facebook Ads Tracking Integration
 *
 * These types define the structure of data used throughout the Facebook Ads
 * tracking feature, including API responses, query parameters, and component props.
 */

/**
 * Date range options for fetching ad insights
 */
export type DateRangeOption = "today" | "yesterday" | "custom";

/**
 * Data granularity levels for ad insights
 */
export type InsightLevel = "account" | "campaign" | "adset" | "ad";

/**
 * Query parameters for fetching Facebook ad insights
 */
export interface FacebookAdsInsightsQueryParams {
  dateRange: DateRangeOption;
  startDate?: string; // ISO date string (required if dateRange === 'custom')
  endDate?: string; // ISO date string (required if dateRange === 'custom')
  level: InsightLevel;
  refresh?: boolean; // Force refresh, bypass cache
}

/**
 * Facebook API response structure for insights
 */
export interface FacebookInsightsResponse {
  data: FacebookInsightData[];
  paging?: {
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
    previous?: string;
  };
}

/**
 * Individual insight data from Facebook API
 */
export interface FacebookInsightData {
  spend: string; // Facebook returns as string
  impressions: string;
  clicks: string;
  actions?: FacebookAction[];
  action_values?: FacebookActionValue[];
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  date_start?: string;
  date_stop?: string;
}

/**
 * Facebook action (conversion) data
 */
export interface FacebookAction {
  action_type: string;
  value: string; // Count as string
}

/**
 * Facebook action value (revenue) data
 */
export interface FacebookActionValue {
  action_type: string;
  value: string; // Revenue as string
}

/**
 * Processed metrics from Facebook API
 */
export interface ProcessedInsightMetrics {
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  profit: number;
  roas: number;
  ctr: number; // Click-through rate
  cpc: number; // Cost per click
}

/**
 * Breakdown data for campaign/adset/ad level insights
 */
export interface InsightBreakdown {
  campaignId?: string;
  campaignName?: string;
  adsetId?: string;
  adsetName?: string;
  adId?: string;
  adName?: string;
}

/**
 * Summary data aggregated from insights
 */
export interface FacebookAdsSummary {
  spend: number;
  revenue: number;
  profit: number;
  roas: number;
  conversions: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
}

/**
 * Breakdown item for table display
 */
export interface FacebookAdsBreakdownItem {
  level: InsightLevel;
  campaignId?: string;
  campaignName?: string;
  adsetId?: string;
  adsetName?: string;
  spend: number;
  revenue: number;
  profit: number;
  roas: number;
  conversions: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
}

/**
 * API response structure for /api/admin/facebook-ads/insights
 */
export interface FacebookAdsInsightsResponse {
  success: boolean;
  data?: {
    summary: FacebookAdsSummary;
    breakdown: FacebookAdsBreakdownItem[];
    dateRange: {
      start: string;
      end: string;
    };
    syncedAt: string;
    cached: boolean;
  };
  error?: string;
  details?: string;
}

/**
 * Component props for FacebookAdsManagement
 * Component is self-contained and doesn't require any props
 * Using Record<string, never> to represent an empty object type
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface FacebookAdsManagementProps {
  // No props needed - component is self-contained
}

/**
 * Date range state for the component
 */
export interface DateRangeState {
  mode: DateRangeOption;
  startDate?: Date;
  endDate?: Date;
}
