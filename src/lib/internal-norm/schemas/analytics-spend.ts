// src/lib/internal-norm/schemas/analytics-spend.ts
//
// Norm response schemas for the analytics.spend-by-url read endpoints.
// Aggregates ad spend and delivery metrics per canonical landing URL — pure
// numbers, no PII. The list endpoint sums materialized `LandingPageMetricsDaily`
// rows per canonical URL for a date range; the detail endpoint breaks the same
// data down per ad for one or more canonical URLs.
import { z } from "zod";

// ─── list ───────────────────────────────────────────────────────────────────

// Per-focus subtotals carried on each list row's `packagesFocus` split. Narrower
// than the packages-focus endpoint's PackagesFocusTotalsSchema (no impressions /
// clicks) — it mirrors the list service's per-bucket rollup exactly.
const SpendByUrlFocusTotalsSchema = z.object({
  spend: z.number(),                           // AUD dollars
  spendCents: z.number(),                      // may carry fractional cents (Meta upstream)
  revenue: z.number(),                         // AUD dollars
  revenueCents: z.number(),
  conversions: z.number(),
  roas: z.number(),                            // ratio; 0 when spend is 0
});

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
  packagesFocus: z
    .object({
      membership: SpendByUrlFocusTotalsSchema,
      "one-time": SpendByUrlFocusTotalsSchema,
    })
    .optional(),                               // absent = row predates the split or is unknown:// (unclassified)
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
  campaignId: z.string().optional(),           // Meta campaign id (latest-non-null across the ad's insights rows)
  campaignName: z.string().optional(),
  adsetId: z.string().optional(),              // Meta adset id (latest-non-null)
  adsetName: z.string().optional(),
  packagesFocus: z.enum(["membership", "one-time", "unclassified"]), // landing-URL strategy; unclassified = destination unresolved
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

// ─── packages-focus breakdown ────────────────────────────────────────────────
//
// membership vs one-time landing-URL split of Meta ad spend. summary reads the
// materialized LandingPageMetricsDaily focus subtotals (any range); detail is a
// live MetaAdInsightsDaily × MetaAdDestination join (bounded by the ~60d
// insights TTL — `complete`/`availableSince` flag partial coverage). Pure ad
// metrics — no PII.

const PackagesFocusTotalsSchema = z.object({
  spend: z.number(),                           // AUD dollars
  spendCents: z.number(),                      // may carry fractional cents (Meta upstream)
  revenue: z.number(),                         // AUD dollars (Meta-reported action_values)
  revenueCents: z.number(),
  roas: z.number(),                            // ratio; 0 when spend is 0
  conversions: z.number(),
  impressions: z.number(),
  clicks: z.number(),
});

const PackagesFocusAdNodeSchema = z.object({
  adId: z.string(),
  adName: z.string().optional(),
  adFormat: z.enum(["video", "static", "carousel", "unknown"]),
  totals: PackagesFocusTotalsSchema,
});

const PackagesFocusAdsetNodeSchema = z.object({
  adsetId: z.string(),
  adsetName: z.string().optional(),
  totals: PackagesFocusTotalsSchema,
  ads: z.array(PackagesFocusAdNodeSchema),
});

const PackagesFocusCampaignNodeSchema = z.object({
  campaignId: z.string(),
  campaignName: z.string().optional(),
  totals: PackagesFocusTotalsSchema,
  adsets: z.array(PackagesFocusAdsetNodeSchema),
});

export const NormAnalyticsPackagesFocusSchema = z.object({
  platform: z.enum(["meta", "tiktok"]),
  supported: z.boolean(),                      // tiktok → false until its ad→URL resolver ships
  reason: z.literal("awaiting-url-mapping").optional(),
  meta: z.object({
    startDate: z.string(),                     // YYYY-MM-DD
    endDate: z.string(),                       // YYYY-MM-DD
    currency: z.literal("AUD"),
    adAccountId: z.string(),                   // "" for tiktok (no account concept yet)
  }),
  summary: z.object({
    membership: PackagesFocusTotalsSchema,
    "one-time": PackagesFocusTotalsSchema,
    unclassified: PackagesFocusTotalsSchema,   // unknown:// destinations + pre-feature aggregate rows
    total: PackagesFocusTotalsSchema,
  }),
  detail: z.object({
    complete: z.boolean(),                     // availableSince !== null && availableSince <= startDate
    // The account's TRUE retained-data floor: the oldest date MetaAdInsightsDaily
    // still holds ANY row for, from an unbounded lookup independent of the
    // requested range (NOT the oldest date within [startDate, endDate]). null =
    // the account has no insights rows at all. A range with zero in-range ad
    // activity but availableSince <= startDate still reports complete: true
    // with empty buckets — absence of delivery isn't the same as missing data.
    availableSince: z.string().nullable(),
    buckets: z.object({
      membership: z.array(PackagesFocusCampaignNodeSchema),
      "one-time": z.array(PackagesFocusCampaignNodeSchema),
      unclassified: z.array(PackagesFocusCampaignNodeSchema),
    }),
  }),
});
