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
