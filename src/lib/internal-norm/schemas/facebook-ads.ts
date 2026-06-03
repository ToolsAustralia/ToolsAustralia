// src/lib/internal-norm/schemas/facebook-ads.ts
//
// Norm response schemas for the Facebook ads detail endpoints. Distinct from
// the `roas` schemas — those project a thin headline ROAS summary; these
// project the richer admin shape (per-item breakdown rows, hourly buckets,
// purchase-audit reconciliation).
import { z } from "zod";

// ─── /v1/facebook-ads/insights ───────────────────────────────────────────────
// Summary + breakdown over a date range. Matches the admin `data` shape from
// `FacebookAdsInsightsService.getInsights`, minus `cached` (always false today).

const FacebookAdsSummarySchema = z.object({
  spend: z.number(),                  // AUD dollars
  revenue: z.number(),                // AUD dollars
  profit: z.number(),                 // AUD dollars
  roas: z.number(),                   // ratio (revenue / spend); 0 when spend is 0
  conversions: z.number(),            // count
  impressions: z.number(),            // count
  clicks: z.number(),                 // count (all clicks)
  linkClicks: z.number(),             // count (inline_link_clicks)
  landingPageView: z.number(),        // count
  ctr: z.number(),                    // percent (clicks/impressions × 100)
  cpc: z.number(),                    // AUD dollars per click
  linkCtr: z.number(),                // percent (linkClicks/impressions × 100)
  linkCpc: z.number(),                // AUD dollars per link click
});

const FacebookAdsBreakdownItemSchema = z.object({
  level: z.enum(["account", "campaign", "adset", "ad"]),
  campaignId: z.string().optional(),
  campaignName: z.string().optional(),
  adsetId: z.string().optional(),
  adsetName: z.string().optional(),
  adId: z.string().optional(),
  adName: z.string().optional(),
  spend: z.number(),
  revenue: z.number(),
  profit: z.number(),
  roas: z.number(),
  conversions: z.number(),
  impressions: z.number(),
  clicks: z.number(),
  linkClicks: z.number(),             // count (inline_link_clicks)
  landingPageView: z.number(),
  ctr: z.number(),
  cpc: z.number(),
  linkCtr: z.number(),                // percent (linkClicks/impressions × 100)
  linkCpc: z.number(),                // AUD dollars per link click
});

export const NormFacebookAdsInsightsSchema = z.object({
  summary: FacebookAdsSummarySchema,
  breakdown: z.array(FacebookAdsBreakdownItemSchema),
  dateRange: z.object({
    start: z.string(),                // AEST YYYY-MM-DD (Facebook API format)
    end: z.string(),                  // AEST YYYY-MM-DD (Facebook API format)
  }),
  syncedAt: z.string(),               // ISO 8601 UTC of when the upstream fetch completed
});

// ─── /v1/facebook-ads/hourly-insights ───────────────────────────────────────
// 24 hour-of-day buckets merging Facebook spend/impressions/clicks with local
// PaymentEvent revenue/conversions for the AEST calendar range.

const HourlyInsightItemSchema = z.object({
  hour: z.number().int().min(0).max(23),
  label: z.string(),                  // e.g. "1:00 PM"
  spend: z.number(),                  // AUD dollars (from Facebook)
  impressions: z.number(),            // from Facebook
  clicks: z.number(),                 // from Facebook (Clicks All)
  linkClicks: z.number(),             // inline_link_clicks (from Facebook)
  lpv: z.number(),                    // landing_page_view action count (from Meta actions array)
  revenue: z.number(),                // AUD dollars (server-side meta-attributed PaymentEvents)
  conversions: z.number(),            // count (server-side meta-attributed PaymentEvents)
  profit: z.number(),                 // revenue − spend
  roas: z.number(),                   // ratio (revenue / spend); 0 when spend is 0
  ctr: z.number(),                    // percent (clicks/impressions × 100)
  cpc: z.number(),                    // AUD dollars per click
  linkCtr: z.number(),                // percent (linkClicks/impressions × 100)
  linkCpc: z.number(),                // AUD dollars per link click
});

export const NormFacebookAdsHourlyInsightsSchema = z.object({
  hourly: z.array(HourlyInsightItemSchema),
  totalConversions: z.number(),       // sum of hourly.conversions
  totalRevenue: z.number(),           // AUD dollars; sum of hourly.revenue
  dateRange: z.object({
    start: z.string(),                // AEST YYYY-MM-DD
    end: z.string(),                  // AEST YYYY-MM-DD
  }),
});

// ─── /v1/facebook-ads/purchase-audit ────────────────────────────────────────
// Reconciliation between local PaymentEvent (non-renewal) revenue and Meta
// Insights purchase revenue for the same AEST window.

export const NormFacebookAdsPurchaseAuditSchema = z.object({
  range: z.enum(["today", "7d", "30d"]),
  window: z.object({
    start: z.string(),                // ISO 8601 UTC (start of AEST window)
    end: z.string(),                  // ISO 8601 UTC (end of AEST window)
  }),
  facebookInsightsRange: z.object({
    since: z.string(),                // AEST YYYY-MM-DD
    until: z.string(),                // AEST YYYY-MM-DD
  }),
  local: z.object({
    benefitsGrantedNonRenewalCount: z.number(),  // count of qualifying PaymentEvent rows
    revenueAud: z.number(),                       // AUD dollars
    note: z.string(),                             // human-readable exclusion note
  }),
  meta: z.object({
    purchaseRevenueAud: z.number().nullable(),    // null when Meta credentials unavailable
    purchaseConversions: z.number().nullable(),   // null when Meta credentials unavailable
    error: z.string().nullable(),                 // upstream / config error message
  }),
  reconciliation: z.object({
    differenceMetaMinusLocalAud: z.number().nullable(), // meta − local; null when meta unavailable
    interpretation: z.string(),       // human-readable summary of the diff
  }),
});
