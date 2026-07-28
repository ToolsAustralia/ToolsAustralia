import { z } from "zod";

const PromoPageTypeSchema = z.enum(["evergreen", "toolset"]);

const PromoDateRangeSchema = z.object({
  start: z.string().describe("ISO 8601 UTC"),
  end: z.string().describe("ISO 8601 UTC"),
});

const PromoPageMetricsSchema = z.object({
  pageType: PromoPageTypeSchema,
  slug: z.string(),
  visits: z.number().int().nonnegative(),
  crossVisits: z
    .number()
    .int()
    .nonnegative()
    .describe("Visitors who arrived from another toolset landing page"),
  builds: z
    .number()
    .int()
    .nonnegative()
    .describe("Unique visitors who assembled a prize in the Build your prize configurator (same dedup as visits)"),
  topBuiltPrize: z
    .string()
    .nullable()
    .describe("Slug of the most-built combination on this page, or null if nobody built one"),
  signups: z.number().int().nonnegative(),
  conversions: z.number().int().nonnegative(),
  revenue: z.number().nonnegative().describe("AUD dollars"),
  visitToSignupRate: z.number().describe("Percent (0-100)"),
  signupToConversionRate: z.number().describe("Percent (0-100)"),
  overallConversionRate: z.number().describe("Percent (0-100)"),
});

const UTMSourceMetricsSchema = z.object({
  utmSource: z.string().describe("Lowercase utm_source; 'direct' when empty/null"),
  visits: z.number().int().nonnegative(),
  signups: z.number().int().nonnegative(),
  conversions: z.number().int().nonnegative(),
  revenue: z.number().nonnegative().describe("AUD dollars"),
  visitToSignupRate: z.number().describe("Percent (0-100)"),
  signupToConversionRate: z.number().describe("Percent (0-100)"),
  overallConversionRate: z.number().describe("Percent (0-100)"),
});

export const NormPromoAnalyticsSummarySchema = z.object({
  dateRange: PromoDateRangeSchema,
  totalVisits: z.number().int().nonnegative(),
  totalSignups: z.number().int().nonnegative(),
  totalConversions: z.number().int().nonnegative(),
  totalRevenue: z.number().nonnegative().describe("AUD dollars"),
  byPage: z.array(PromoPageMetricsSchema),
  byUTMSource: z.array(UTMSourceMetricsSchema),
});

const UTMCampaignMetricsSchema = z.object({
  utmSource: z.string(),
  utmMedium: z.string(),
  utmCampaign: z.string(),
  visits: z.number().int().nonnegative(),
  signups: z.number().int().nonnegative(),
  conversions: z.number().int().nonnegative(),
  revenue: z.number().nonnegative().describe("AUD dollars"),
  visitToSignupRate: z.number().describe("Percent (0-100)"),
  signupToConversionRate: z.number().describe("Percent (0-100)"),
  overallConversionRate: z.number().describe("Percent (0-100)"),
});

const VisitsFromMetricSchema = z.object({
  referrerSlug: z.string(),
  visits: z.number().int().nonnegative(),
});

const SummaryTotalsSchema = z.object({
  visits: z.number().int().nonnegative(),
  signups: z.number().int().nonnegative(),
  conversions: z.number().int().nonnegative(),
  revenue: z.number().nonnegative().describe("AUD dollars"),
});

export const NormPromoAnalyticsPageDetailSchema = z.object({
  pageType: PromoPageTypeSchema,
  slug: z.string(),
  pageLabel: z.string(),
  summary: SummaryTotalsSchema,
  byCampaign: z.array(UTMCampaignMetricsSchema),
  visitsFrom: z.array(VisitsFromMetricSchema).optional(),
});

const ChannelPageMetricsSchema = z.object({
  pageType: PromoPageTypeSchema,
  slug: z.string(),
  pageLabel: z.string(),
  visits: z.number().int().nonnegative(),
  signups: z.number().int().nonnegative(),
  conversions: z.number().int().nonnegative(),
  revenue: z.number().nonnegative().describe("AUD dollars"),
  visitToSignupRate: z.number().describe("Percent (0-100)"),
  signupToConversionRate: z.number().describe("Percent (0-100)"),
  overallConversionRate: z.number().describe("Percent (0-100)"),
});

const ChannelCampaignMetricsSchema = z.object({
  utmCampaign: z.string(),
  utmMedium: z.string(),
  visits: z.number().int().nonnegative(),
  signups: z.number().int().nonnegative(),
  conversions: z.number().int().nonnegative(),
  revenue: z.number().nonnegative().describe("AUD dollars"),
  visitToSignupRate: z.number().describe("Percent (0-100)"),
  signupToConversionRate: z.number().describe("Percent (0-100)"),
  overallConversionRate: z.number().describe("Percent (0-100)"),
});

export const NormPromoAnalyticsChannelDetailSchema = z.object({
  utmSource: z.string(),
  summary: SummaryTotalsSchema,
  byPage: z.array(ChannelPageMetricsSchema),
  byCampaign: z.array(ChannelCampaignMetricsSchema),
});
