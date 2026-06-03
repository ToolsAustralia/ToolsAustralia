// src/lib/internal-norm/schemas/analytics-spend.ts
//
// Norm response schemas for the analytics.spend-by-url read endpoints.
// Aggregates ad spend and delivery metrics per canonical landing URL — pure
// numbers, no PII. The list endpoint sums materialized `LandingPageMetricsDaily`
// rows per canonical URL for a date range; the detail endpoint breaks the same
// data down per ad for one or more canonical URLs.
import { z } from "zod";

// ─── list ───────────────────────────────────────────────────────────────────

const SpendByUrlListRowSchema = z.object({
  canonicalUrl: z.string(),                    // canonical destination URL (or `unknown://meta-ad/<id>` placeholder)
  spend: z.number(),                           // AUD dollars (= spendCents / 100, rounded)
  // The cent / count fields are stored as `Number` in MetaAdInsightsDaily and
  // LandingPageMetricsDaily — upstream Meta returns fractional cents on some
  // rows, so summed values are NOT guaranteed integers. Treat as `number`.
  spendCents: z.number(),
  impressions: z.number(),
  clicks: z.number(),
  conversions: z.number(),
  revenue: z.number(),                         // AUD dollars
  revenueCents: z.number(),
  cpc: z.number(),                             // AUD per click; 0 when clicks is 0
  roas: z.number(),                            // ratio (revenue / spend); 0 when spend is 0
  adIds: z.array(z.string()),                  // distinct Facebook ad ids that contributed to this URL bucket
});

export const NormAnalyticsSpendByUrlListSchema = z.object({
  meta: z.object({
    startDate: z.string(),                     // YYYY-MM-DD (the bounds passed by the caller)
    endDate: z.string(),                       // YYYY-MM-DD
    currency: z.literal("AUD"),
    adAccountId: z.string(),                   // Meta ad account id; non-secret
  }),
  rows: z.array(SpendByUrlListRowSchema),
});

// ─── detail ─────────────────────────────────────────────────────────────────

const SpendByUrlDetailRowSchema = z.object({
  adId: z.string(),                            // Facebook ad id
  adName: z.string().optional(),               // Facebook ad name (may be absent)
  spend: z.number(),                           // AUD dollars
  // The cent / count fields can carry fractional values (upstream Meta returns
  // fractional cents on some rows; summed per-ad totals therefore are not
  // guaranteed integers).
  spendCents: z.number(),
  impressions: z.number(),
  clicks: z.number(),
  conversions: z.number(),
  revenue: z.number(),                         // AUD dollars
  revenueCents: z.number(),
  cpc: z.number(),                             // AUD per click; 0 when clicks is 0
  roas: z.number(),                            // ratio; 0 when spend is 0
  adFormat: z.enum(["video", "static", "carousel", "unknown"]),
});

export const NormAnalyticsSpendByUrlDetailSchema = z.object({
  meta: z.object({
    canonicalUrls: z.array(z.string()),        // canonical URLs requested (deduped, non-empty)
    canonicalUrl: z.string(),                  // first of canonicalUrls; kept for single-URL clients
    startDate: z.string(),                     // YYYY-MM-DD
    endDate: z.string(),                       // YYYY-MM-DD
    currency: z.literal("AUD"),
    adAccountId: z.string(),
  }),
  rows: z.array(SpendByUrlDetailRowSchema),
});

// ─── hourly revenue ───────────────────────────────────────────────────────────
//
// Hour-of-day (0-23, Australia/Sydney) revenue + conversions + ad spend for a date
// range, merged into one 24-bucket series for the selected platform group.

const HourlyRevenueBucketSchema = z.object({
  hour: z.number().int().min(0).max(23),        // hour-of-day in Australia/Sydney (AEST)
  revenue: z.number().describe("AUD dollars; payment-attributed acquisition revenue for this hour bucket"),
  conversions: z.number(),                      // count of attributed conversions in this hour bucket
  spend: z
    .number()
    .nullable()
    .describe("AUD dollars; ad spend for this hour. null = no ad-spend source for this platform group (e.g. snapchat, klaviyo)"),
});

export const NormHourlyRevenueSchema = z.object({
  hourly: z.array(HourlyRevenueBucketSchema),   // always 24 buckets, hour 0..23
  totalRevenue: z.number().describe("AUD dollars; sum of hourly revenue"),
  totalConversions: z.number(),                 // sum of hourly conversions
  totalSpend: z
    .number()
    .nullable()
    .describe("AUD dollars; sum of hourly spend. null = no ad-spend source for this platform group"),
  platform: z.string(),                         // the resolved platform group (meta|tiktok|snapchat|klaviyo|ad-channels|all)
  dateRange: z.object({
    start: z.string(),                          // YYYY-MM-DD
    end: z.string(),                            // YYYY-MM-DD
  }),
});
