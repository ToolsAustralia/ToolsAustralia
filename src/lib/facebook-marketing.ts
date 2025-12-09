/**
 * Facebook Marketing API Client
 *
 * Handles communication with Facebook's Graph API to fetch ad insights.
 * Includes rate limiting, error handling, and response parsing.
 */

import {
  FacebookInsightsResponse,
  FacebookInsightData,
  ProcessedInsightMetrics,
  InsightLevel,
  InsightBreakdown,
} from "@/types/facebook-ads";

/**
 * Facebook API error response structure
 */
interface FacebookApiError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

/**
 * Result type for Facebook insights with breakdown information
 */
export interface FacebookInsightResult {
  metrics: ProcessedInsightMetrics;
  breakdown?: InsightBreakdown;
}

/**
 * Fetch insights from Facebook Marketing API
 *
 * @param adAccountId - Facebook ad account ID (format: act_123456789)
 * @param accessToken - Facebook access token
 * @param dateRange - Date range for insights
 * @param level - Data granularity level
 * @returns Processed insights data with breakdown information
 */
export async function fetchFacebookInsights(
  adAccountId: string,
  accessToken: string,
  dateRange: { since: string; until: string },
  level: InsightLevel = "account"
): Promise<FacebookInsightResult[]> {
  const apiVersion = "v21.0";
  const baseUrl = `https://graph.facebook.com/${apiVersion}/${adAccountId}/insights`;

  // Build query parameters
  const params = new URLSearchParams({
    access_token: accessToken,
    fields:
      "spend,impressions,clicks,actions,action_values,campaign_id,campaign_name,adset_id,adset_name,date_start,date_stop",
    time_range: JSON.stringify({
      since: dateRange.since,
      until: dateRange.until,
    }),
    level: level,
    action_attribution_windows: JSON.stringify(["1d_click", "7d_click", "28d_click"]),
  });

  const url = `${baseUrl}?${params.toString()}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData: FacebookApiError = await response.json().catch(() => ({
        error: {
          message: `HTTP ${response.status}: ${response.statusText}`,
          type: "HTTPError",
          code: response.status,
        },
      }));

      // Handle specific error codes
      if (response.status === 401) {
        throw new Error("Facebook access token expired or invalid. Please update the token.");
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        throw new Error(
          `Rate limit exceeded. ${retryAfter ? `Retry after ${retryAfter} seconds.` : "Please try again later."}`
        );
      }

      throw new Error(errorData.error?.message || `Facebook API error: ${response.statusText}`);
    }

    const data: FacebookInsightsResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      // Return empty metrics if no data
      return [
        {
          metrics: {
            spend: 0,
            revenue: 0,
            impressions: 0,
            clicks: 0,
            conversions: 0,
            profit: 0,
            roas: 0,
            ctr: 0,
            cpc: 0,
          },
        },
      ];
    }

    // Process each insight data point with breakdown information
    return data.data.map((insight) => ({
      metrics: processInsightData(insight),
      breakdown: extractBreakdown(insight),
    }));
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to fetch Facebook insights: Unknown error");
  }
}

/**
 * Process raw Facebook insight data into structured metrics
 *
 * @param insight - Raw insight data from Facebook API
 * @returns Processed metrics
 */
function processInsightData(insight: FacebookInsightData): ProcessedInsightMetrics {
  // Parse spend (Facebook returns as string, in dollars)
  // We convert to cents for consistent storage (matching PaymentEvent model)
  const spend = parseFloat(insight.spend || "0") * 100; // Convert dollars to cents

  // Parse impressions and clicks
  const impressions = parseInt(insight.impressions || "0", 10);
  const clicks = parseInt(insight.clicks || "0", 10);

  // Extract revenue from action_values (purchase events)
  let revenue = 0;
  let conversions = 0;

  if (insight.action_values) {
    const purchaseActions = insight.action_values.filter((action) => action.action_type === "purchase");
    if (purchaseActions.length > 0) {
      // Facebook returns revenue in dollars, convert to cents for consistent storage
      revenue = purchaseActions.reduce((sum, action) => sum + parseFloat(action.value || "0"), 0) * 100;
    }
  }

  // Extract conversion count from actions
  if (insight.actions) {
    const purchaseActions = insight.actions.filter((action) => action.action_type === "purchase");
    if (purchaseActions.length > 0) {
      conversions = purchaseActions.reduce((sum, action) => sum + parseInt(action.value || "0", 10), 0);
    }
  }

  // Calculate derived metrics
  const profit = revenue - spend;
  const roas = spend > 0 ? revenue / spend : 0;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;

  return {
    spend,
    revenue,
    impressions,
    clicks,
    conversions,
    profit,
    roas,
    ctr,
    cpc,
  };
}

/**
 * Extract breakdown information from insight data
 *
 * @param insight - Raw insight data from Facebook API
 * @returns Breakdown information
 */
export function extractBreakdown(insight: FacebookInsightData): InsightBreakdown {
  return {
    campaignId: insight.campaign_id,
    campaignName: insight.campaign_name,
    adsetId: insight.adset_id,
    adsetName: insight.adset_name,
  };
}

/**
 * Format date for Facebook API (YYYY-MM-DD)
 *
 * @param date - Date object
 * @returns Formatted date string
 */
export function formatDateForFacebook(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get today's date range for Facebook API
 *
 * @returns Date range object with today's date
 */
export function getTodayDateRange(): { since: string; until: string } {
  const today = new Date();
  const dateStr = formatDateForFacebook(today);
  return {
    since: dateStr,
    until: dateStr,
  };
}




