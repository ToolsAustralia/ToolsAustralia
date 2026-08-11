// src/lib/internal-norm/schemas/tiktok-ads.ts
//
// Norm response schema for the TikTok insights endpoint. Mirrors the admin
// `getTikTokAdInsights` shape (spend + TikTok-reported conversions/revenue/ROAS + totals,
// grouped at campaign / ad-set / ad level). The TikTok analogue of the Facebook `insights`
// schema. No PII — campaign/ad-set/ad names and numbers only.
import { z } from "zod";

const TikTokAdInsightsRowSchema = z.object({
  campaignId: z.string().nullable(),
  campaignName: z.string().nullable(),
  adsetId: z.string().nullable(),
  adsetName: z.string().nullable(),
  // NULL above ad level. The id/name fields ABOVE the requested level stay populated (an
  // ad-set row still names its campaign); the ones BELOW it are null, because that group
  // spans many children and naming one of them would be a lie.
  adId: z.string().nullable(),
  adName: z.string().nullable(),
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
  level: z
    .enum(["campaign", "adset", "ad"])
    .describe(
      "Granularity these rows are grouped at, uniform across the array. Defaults to `ad` when the request omits it. Totals are IDENTICAL at every level — each stored row is one ad-day, so it lands in exactly one bucket whichever level is asked for.",
    ),
  rows: z.array(TikTokAdInsightsRowSchema),
  totals: TikTokAdInsightsTotalsSchema,
  dateRange: z.object({
    startDate: z.string(), // YYYY-MM-DD
    endDate: z.string(), // YYYY-MM-DD
  }),
});
