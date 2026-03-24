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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Meta returns 429, or 400/403 with code 4/17/32 or "Application request limit reached" in the body. */
function isInsightsRateLimit(response: Response, errorData: FacebookApiError): boolean {
  if (response.status === 429) return true;
  const code = errorData.error?.code;
  if (code === 4 || code === 17 || code === 32) return true;
  const msg = (errorData.error?.message || "").toLowerCase();
  return (
    msg.includes("request limit") ||
    msg.includes("rate limit") ||
    msg.includes("too many calls") ||
    msg.includes("reduce the amount")
  );
}

const INSIGHTS_PAGE_MAX_RETRIES = 10;
/** Small pause between pagination `next` requests to reduce burst rate-limit hits on large syncs. */
const INSIGHTS_PAGE_DELAY_MS = 250;
/**
 * Meta defaults Insights GET to 25 rows/page, which is very slow for large syncs.
 * Higher = fewer HTTP round-trips (subject to Meta caps / timeouts).
 */
const INSIGHTS_FETCH_PAGE_LIMIT = 500;

/**
 * GET one insights URL with retries when Meta applies app/user rate limits during pagination.
 */
async function fetchInsightsPageResilient(
  url: string,
  options?: { onRateLimitWait?: (info: { attempt: number; waitMs: number }) => void }
): Promise<Response> {
  let lastMessage = "";
  for (let attempt = 0; attempt < INSIGHTS_PAGE_MAX_RETRIES; attempt++) {
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (response.ok) {
      return response;
    }

    const errorData: FacebookApiError = await response.json().catch(() => ({
      error: {
        message: `HTTP ${response.status}: ${response.statusText}`,
        type: "HTTPError",
        code: response.status,
      },
    }));

    if (response.status === 401) {
      throw new Error("Facebook access token expired or invalid. Please update the token.");
    }

    lastMessage = errorData.error?.message || `Facebook API error: ${response.statusText}`;

    if (isInsightsRateLimit(response, errorData)) {
      const retryAfter = response.headers.get("Retry-After");
      const parsedRetry = retryAfter ? parseFloat(retryAfter) * 1000 : NaN;
      const baseWait = !Number.isNaN(parsedRetry) && parsedRetry > 0
        ? parsedRetry
        : Math.min(120_000, 2000 * Math.pow(2, attempt));
      const jitter = Math.floor(Math.random() * 500);
      const waitMs = baseWait + jitter;
      options?.onRateLimitWait?.({ attempt: attempt + 1, waitMs });
      await sleep(waitMs);
      continue;
    }

    throw new Error(lastMessage);
  }

  throw new Error(
    `${lastMessage || "Facebook API rate limit"} — gave up after ${INSIGHTS_PAGE_MAX_RETRIES} retries. Try a shorter date range or sync again in a few minutes.`
  );
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
  // Use 7-day click attribution window (7d_click) - Meta's current best practice (2024+)
  // 28-day window was deprecated in October 2020
  // 7-day click balances accuracy with recency and aligns with Meta's default attribution model
  // Single window prevents duplicate counting while maintaining accurate revenue reporting
  const params = new URLSearchParams({
    access_token: accessToken,
    fields:
      "spend,impressions,clicks,actions,action_values,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,date_start,date_stop",
    time_range: JSON.stringify({
      since: dateRange.since,
      until: dateRange.until,
    }),
    level: level,
    action_attribution_windows: JSON.stringify(["7d_click"]), // 7-day click attribution window (Meta best practice)
  });

  const url = `${baseUrl}?${params.toString()}`;

  try {
    const allInsights: FacebookInsightData[] = [];
    let nextUrl: string | null = url;

    // Paginate through all results so summary totals match across Campaign/Ad Set/Ad levels
    while (nextUrl) {
      const response = await fetch(nextUrl, {
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

      if (data.data && data.data.length > 0) {
        allInsights.push(...data.data);
      }

      nextUrl = data.paging?.next ?? null;
    }

    if (allInsights.length === 0) {
      // Return empty metrics if no data
      return [
        {
          metrics: {
            spend: 0,
            revenue: 0,
            impressions: 0,
            clicks: 0,
            conversions: 0,
            landingPageView: 0,
            profit: 0,
            roas: 0,
            ctr: 0,
            cpc: 0,
          },
        },
      ];
    }

    // Process each insight data point with breakdown information
    return allInsights.map((insight) => ({
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
export function processInsightData(insight: FacebookInsightData): ProcessedInsightMetrics {
  // Parse spend (Facebook returns as string, in dollars)
  // We convert to cents for consistent storage (matching PaymentEvent model)
  const spend = parseFloat(insight.spend || "0") * 100; // Convert dollars to cents

  // Parse impressions and clicks
  const impressions = parseInt(insight.impressions || "0", 10);
  const clicks = parseInt(insight.clicks || "0", 10);

  // Extract revenue from action_values (purchase events)
  // Handle both "purchase" and "purchase.{window}" formats to catch all purchase events
  let revenue = 0;
  let conversions = 0;

  if (insight.action_values) {
    // Filter for purchase events - handle both "purchase" and "purchase.{attribution_window}" formats
    const purchaseActions = insight.action_values.filter(
      (action) => action.action_type === "purchase" || action.action_type?.startsWith("purchase.")
    );
    if (purchaseActions.length > 0) {
      // Facebook returns revenue in dollars, convert to cents for consistent storage
      // Sum all purchase action values (in case there are multiple attribution windows)
      revenue = purchaseActions.reduce((sum, action) => sum + parseFloat(action.value || "0"), 0) * 100;
    }
  }

  // Extract conversion count from actions
  // Handle both "purchase" and "purchase.{window}" formats
  if (insight.actions) {
    const purchaseActions = insight.actions.filter(
      (action) => action.action_type === "purchase" || action.action_type?.startsWith("purchase.")
    );
    if (purchaseActions.length > 0) {
      // Sum all purchase action counts
      conversions = purchaseActions.reduce((sum, action) => sum + parseInt(action.value || "0", 10), 0);
    }
  }

  // Extract landing page view count from actions (same 7d_click attribution as other actions)
  let landingPageView = 0;
  if (insight.actions) {
    const lpvActions = insight.actions.filter(
      (action) =>
        action.action_type === "landing_page_view" || action.action_type?.startsWith("landing_page_view.")
    );
    if (lpvActions.length > 0) {
      landingPageView = lpvActions.reduce((sum, action) => sum + parseInt(action.value || "0", 10), 0);
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
    landingPageView,
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
    adId: insight.ad_id,
    adName: insight.ad_name,
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

/** Optional progress for long paginated Insights downloads (CLI / verbose sync). */
export interface FetchFacebookAdInsightsDailyOptions {
  /** Fires after each Insights API page (includes rate-limit retries completing a page). */
  onPage?: (info: { page: number; rowsThisPage: number; totalRows: number }) => void;
  /** Fires before sleeping due to Meta app/user rate limits (so long silent waits are explained). */
  onRateLimitWait?: (info: { attempt: number; waitMs: number }) => void;
}

/**
 * Fetch ad-level insights with one row per ad per calendar day (time_increment=1).
 * Used for spend-by-destination-URL attribution (sync to Mongo).
 */
export async function fetchFacebookAdInsightsDaily(
  adAccountId: string,
  accessToken: string,
  dateRange: { since: string; until: string },
  options?: FetchFacebookAdInsightsDailyOptions
): Promise<FacebookInsightData[]> {
  const apiVersion = "v21.0";
  const baseUrl = `https://graph.facebook.com/${apiVersion}/${adAccountId}/insights`;

  const params = new URLSearchParams({
    access_token: accessToken,
    fields:
      "spend,impressions,clicks,actions,action_values,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,date_start,date_stop",
    time_range: JSON.stringify({
      since: dateRange.since,
      until: dateRange.until,
    }),
    level: "ad",
    time_increment: "1",
    action_attribution_windows: JSON.stringify(["7d_click"]),
    limit: String(INSIGHTS_FETCH_PAGE_LIMIT),
  });

  const url = `${baseUrl}?${params.toString()}`;
  const allInsights: FacebookInsightData[] = [];
  let nextUrl: string | null = url;
  let pageIndex = 0;

  while (nextUrl) {
    if (pageIndex > 0) {
      await sleep(INSIGHTS_PAGE_DELAY_MS);
    }
    const response = await fetchInsightsPageResilient(nextUrl, {
      onRateLimitWait: options?.onRateLimitWait,
    });
    const data: FacebookInsightsResponse = await response.json();
    const rowsThisPage = data.data?.length ?? 0;
    if (data.data?.length) {
      allInsights.push(...data.data);
    }
    options?.onPage?.({
      page: pageIndex + 1,
      rowsThisPage,
      totalRows: allInsights.length,
    });
    nextUrl = data.paging?.next ?? null;
    pageIndex++;
  }

  return allInsights;
}

/**
 * Hourly insight data from Facebook API (with hourly breakdown)
 */
export interface HourlyInsightData {
  hour: number; // 0-23
  hourLabel: string; // e.g. "00:00:00 - 00:59:59"
  spend: number; // in cents
  impressions: number;
  clicks: number;
}

/**
 * Fetch hourly insights from Facebook Marketing API
 * Returns spend, impressions, and clicks aggregated by hour of day (AEST timezone)
 * Note: Purchase/conversions are NOT available with hourly breakdown (off-Meta restriction)
 *
 * @param adAccountId - Facebook ad account ID (format: act_123456789)
 * @param accessToken - Facebook access token
 * @param dateRange - Date range for insights
 * @returns Array of 24 hourly insights (0-23), one per hour
 */
export async function fetchFacebookInsightsHourly(
  adAccountId: string,
  accessToken: string,
  dateRange: { since: string; until: string }
): Promise<HourlyInsightData[]> {
  const apiVersion = "v21.0";
  const baseUrl = `https://graph.facebook.com/${apiVersion}/${adAccountId}/insights`;

  // Build query parameters with hourly breakdown
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: "spend,impressions,clicks", // Only on-Meta metrics work with hourly breakdown
    time_range: JSON.stringify({
      since: dateRange.since,
      until: dateRange.until,
    }),
    level: "account",
    breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone",
    action_attribution_windows: JSON.stringify(["7d_click"]),
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

    const data: {
      data: Array<{
        spend?: string;
        impressions?: string;
        clicks?: string;
        hourly_stats_aggregated_by_advertiser_time_zone?: string;
      }>;
    } = await response.json();

    // Initialize array with 24 hours (0-23), all zeros
    const hourlyData: HourlyInsightData[] = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      hourLabel: `${String(hour).padStart(2, "0")}:00:00 - ${String(hour).padStart(2, "0")}:59:59`,
      spend: 0,
      impressions: 0,
      clicks: 0,
    }));

    // Parse and populate data from Facebook response
    if (data.data && data.data.length > 0) {
      for (const item of data.data) {
        const hourLabel = item.hourly_stats_aggregated_by_advertiser_time_zone;
        if (!hourLabel) continue;

        // Extract hour from label (e.g. "00:00:00 - 00:59:59" -> 0)
        const hourMatch = hourLabel.match(/^(\d{2}):/);
        if (!hourMatch) continue;

        const hour = parseInt(hourMatch[1], 10);
        if (hour < 0 || hour > 23) continue;

        // Parse metrics (Facebook returns as strings)
        const spend = parseFloat(item.spend || "0") * 100; // Convert dollars to cents
        const impressions = parseInt(item.impressions || "0", 10);
        const clicks = parseInt(item.clicks || "0", 10);

        // Update the corresponding hour
        hourlyData[hour] = {
          hour,
          hourLabel,
          spend,
          impressions,
          clicks,
        };
      }
    }

    return hourlyData;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to fetch Facebook hourly insights: Unknown error");
  }
}

export type HourlyFilterLevel = "campaign" | "adset" | "ad";

/**
 * Fetch hourly insights for a single campaign or ad set by ID.
 * Calls {entity_id}/insights directly for accurate per-entity data.
 */
async function fetchHourlyInsightsForEntity(
  entityId: string,
  accessToken: string,
  dateRange: { since: string; until: string },
  apiVersion: string = "v21.0"
): Promise<HourlyInsightData[]> {
  const baseUrl = `https://graph.facebook.com/${apiVersion}/${entityId}/insights`;
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: "spend,impressions,clicks",
    time_range: JSON.stringify({
      since: dateRange.since,
      until: dateRange.until,
    }),
    breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone",
    action_attribution_windows: JSON.stringify(["7d_click"]),
  });

  const response = await fetch(`${baseUrl}?${params.toString()}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    const errorData: FacebookApiError = await response.json().catch(() => ({
      error: {
        message: `HTTP ${response.status}: ${response.statusText}`,
        type: "HTTPError",
        code: response.status,
      },
    }));

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

  const data: {
    data: Array<{
      spend?: string;
      impressions?: string;
      clicks?: string;
      hourly_stats_aggregated_by_advertiser_time_zone?: string;
    }>;
  } = await response.json();

  const hourlyData: HourlyInsightData[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    hourLabel: `${String(hour).padStart(2, "0")}:00:00 - ${String(hour).padStart(2, "0")}:59:59`,
    spend: 0,
    impressions: 0,
    clicks: 0,
  }));

  if (data.data && data.data.length > 0) {
    for (const item of data.data) {
      const hourLabel = item.hourly_stats_aggregated_by_advertiser_time_zone;
      if (!hourLabel) continue;

      const hourMatch = hourLabel.match(/^(\d{2}):/);
      if (!hourMatch) continue;

      const hour = parseInt(hourMatch[1], 10);
      if (hour < 0 || hour > 23) continue;

      const spend = parseFloat(item.spend || "0") * 100;
      const impressions = parseInt(item.impressions || "0", 10);
      const clicks = parseInt(item.clicks || "0", 10);

      hourlyData[hour].spend += spend;
      hourlyData[hour].impressions += impressions;
      hourlyData[hour].clicks += clicks;
    }
  }

  return hourlyData;
}

/**
 * Fetch hourly insights filtered by specific campaign or ad set IDs.
 * When filterIds is empty, falls back to account-level (all).
 * Uses per-entity API calls ({entity_id}/insights) for accurate data when filtering.
 *
 * @param adAccountId - Facebook ad account ID (format: act_123456789)
 * @param accessToken - Facebook access token
 * @param dateRange - Date range for insights
 * @param options - Filter options: level (campaign|adset) and filterIds (array of IDs)
 */
export async function fetchFacebookInsightsHourlyFiltered(
  adAccountId: string,
  accessToken: string,
  dateRange: { since: string; until: string },
  options: { level: HourlyFilterLevel; filterIds: string[] }
): Promise<HourlyInsightData[]> {
  const { level: _level, filterIds } = options;

  // No filter or select all: use account-level
  if (!filterIds || filterIds.length === 0) {
    return fetchFacebookInsightsHourly(adAccountId, accessToken, dateRange);
  }

  const apiVersion = "v21.0";

  // Fetch hourly insights for each entity directly (campaign_id/insights or adset_id/insights)
  // This ensures accurate data without pagination/filtering issues
  const results = await Promise.allSettled(
    filterIds.map((entityId) =>
      fetchHourlyInsightsForEntity(entityId.trim(), accessToken, dateRange, apiVersion)
    )
  );

  // Aggregate across all successful entities by hour (skip failed ones)
  const hourlyData: HourlyInsightData[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    hourLabel: `${String(hour).padStart(2, "0")}:00:00 - ${String(hour).padStart(2, "0")}:59:59`,
    spend: 0,
    impressions: 0,
    clicks: 0,
  }));

  for (const result of results) {
    if (result.status === "fulfilled") {
      const entityHourly = result.value;
      for (let h = 0; h < 24; h++) {
        hourlyData[h].spend += entityHourly[h].spend;
        hourlyData[h].impressions += entityHourly[h].impressions;
        hourlyData[h].clicks += entityHourly[h].clicks;
      }
    }
    // Silently skip rejected (e.g. deleted/inaccessible entity)
  }

  return hourlyData;
}












