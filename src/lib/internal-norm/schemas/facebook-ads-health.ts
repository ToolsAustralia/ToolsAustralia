// src/lib/internal-norm/schemas/facebook-ads-health.ts
//
// Norm response schemas for the Facebook Ads Health view (verdict engine).
// Distinct from `facebook-ads.ts` (raw insights / hourly / purchase-audit) —
// these carry per-row verdicts ("scale | hold | investigate | cut") and the
// tunable-threshold settings. No PII (ad-account entities only).
import { z } from "zod";

// ─── /v1/facebook-ads/health/insights ───────────────────────────────────────

const VerdictReasonSchema = z.object({
  section: z.string(),
  rule: z.string(),
  source: z.enum(["meta", "tunable"]),
  passed: z.union([z.boolean(), z.literal("info")]),
  value: z.string(),
});

const HealthInsightDailySchema = z.object({
  date: z.string(),                  // yyyy-mm-dd
  spendCents: z.number(),
  conversions: z.number(),
  revenueCents: z.number(),
  linkClicks: z.number(),
  impressions: z.number(),
  linkCtr: z.number(),               // percent (linkClicks / impressions × 100)
  costPerLinkClick: z.number(),      // cents per link click
  roas: z.number(),                  // revenueCents / spendCents; 0 when spend is 0
});

const HealthInsightRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  campaignId: z.string().optional(),
  campaignName: z.string().optional(),
  adsetId: z.string().optional(),
  adsetName: z.string().optional(),
  learningStatus: z.enum(["Active", "Learning", "LearningLimited", "Unknown"]),
  metaRawStatus: z.enum(["LEARNING", "SUCCESS", "FAIL"]).nullable(),
  effectiveStatus: z.string(),       // Meta delivery-status bucket (ACTIVE / PAUSED / COMPLETED / …)
  daily: z.array(HealthInsightDailySchema),
  window: z.object({
    spendCents: z.number(),
    conversions: z.number(),
    revenueCents: z.number(),
    linkClicks: z.number(),
    impressions: z.number(),
  }),
  last7d: z.object({
    conversions: z.number(),
    roas: z.number(),
    prev7dRoas: z.number().nullable(),
  }),
  lastSignificantEdit: z.string().nullable(),       // ISO 8601 UTC
  daysSinceLastSignificantEdit: z.number().nullable(),
  createdTime: z.string().nullable(),               // ISO 8601 UTC
  conversionsSinceLastSignificantEdit: z.number().nullable(),
  lastBudgetChangePct: z.number().nullable(),
  daysAtZero: z.number(),
  verdict: z.enum(["scale", "hold", "investigate", "cut"]),
  verdictReasons: z.array(VerdictReasonSchema),
  actionText: z.string(),            // human-readable recommended action
  metaAdsManagerUrl: z.string(),     // deep link into Meta Ads Manager
});

export const NormFacebookAdsHealthInsightsSchema = z.object({
  rows: z.array(HealthInsightRowSchema),
  alertCount: z.object({
    investigate: z.number().int().nonnegative(),
    cut: z.number().int().nonnegative(),
  }),
});

// ─── /v1/facebook-ads/health/settings (GET) ─────────────────────────────────
// The tunable verdict-engine thresholds. PUT is roadmap-only (write_safe).

export const NormFacebookAdsHealthSettingsSchema = z.object({
  breakevenRoas: z.number(),
  targetCpaAud: z.number(),                 // AUD
  zeroConvSpendMultiplier: z.number(),
  roasDropTriggerPct: z.number(),           // percent
  postEditWaitHours: z.number(),
  spendIncreaseAlertPct: z.number(),        // percent
});
