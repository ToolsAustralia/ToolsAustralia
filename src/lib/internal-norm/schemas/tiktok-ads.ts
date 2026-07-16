// src/lib/internal-norm/schemas/tiktok-ads.ts
//
// Norm response schema for the TikTok per-ad insights endpoint. Mirrors the admin
// `getTikTokAdInsights` shape (per-ad spend + TikTok-reported conversions/revenue/ROAS
// + totals). The TikTok analogue of the Facebook `insights` schema. No PII — ad names
// and numbers only.
import { z } from "zod";

const TikTokAdInsightsRowSchema = z.object({
  adId: z.string(),
  adName: z.string().nullable(),
  campaignName: z.string().nullable(),
  adsetName: z.string().nullable(),
  spend: z.number(), // AUD dollars
  impressions: z.number(),
  clicks: z.number(),
  conversions: z.number(), // TikTok-reported
  revenue: z.number(), // AUD dollars, TikTok-reported
  roas: z.number(), // revenue / spend; 0 when spend is 0
});

const TikTokAdInsightsTotalsSchema = z.object({
  spend: z.number(),
  impressions: z.number(),
  clicks: z.number(),
  conversions: z.number(),
  revenue: z.number(),
  roas: z.number(),
});

export const NormTikTokAdsInsightsSchema = z.object({
  // false when the TikTok Marketing-API creds are unset → no data synced yet.
  configured: z.boolean(),
  rows: z.array(TikTokAdInsightsRowSchema),
  totals: TikTokAdInsightsTotalsSchema,
  dateRange: z.object({
    startDate: z.string(), // YYYY-MM-DD
    endDate: z.string(), // YYYY-MM-DD
  }),
});
