import { z } from "zod";
import { CHANNEL_KEYS } from "@/config/attribution-channels";

const PromoPageTypeSchema = z.enum(["evergreen", "toolset"]);

const ChannelKeySchema = z
  .enum(CHANNEL_KEYS)
  .describe(
    "Canonical acquisition channel. Raw utm_source forms are folded: facebook.com/ig/fb -> meta; klaviyo splits by utm_medium into klaviyo_email/klaviyo_sms."
  );

const PromoDateRangeSchema = z.object({
  start: z.string().describe("ISO 8601 UTC"),
  end: z.string().describe("ISO 8601 UTC"),
  visitsRetainedFrom: z
    .string()
    .describe(
      "ISO 8601 UTC. Visit rows are TTL-deleted after 90 days; User and PaymentEvent are not. Ranges are clamped to this so every number comes from one population."
    ),
  clampedToRetention: z
    .boolean()
    .describe("True when the requested start predated the retention floor and was moved up to it"),
});

const PromoPageMetricsSchema = z.object({
  pageType: PromoPageTypeSchema,
  slug: z.string(),
  visits: z.number().int().nonnegative(),
  buildVisitors: z
    .number()
    .int()
    .nonnegative()
    .describe(
      "Unique visitors who ended on SOME prize combination on this page (exposure). Effectively everyone who loaded the builder — the beacon records what was on screen whether or not it was touched."
    ),
  builds: z
    .number()
    .int()
    .nonnegative()
    .describe(
      "Of buildVisitors, those who actually CHANGED the build (engagement). Before 2026-07-31 this field was labelled engagement but measured exposure, because the tracking route never forwarded the interaction flag — treat earlier figures as exposure."
    ),
  buildChangeRate: z
    .number()
    .describe("builds / buildVisitors as a percent (0-100); 0 when nobody saw a combination"),
  topBuiltPrize: z
    .string()
    .nullable()
    .describe("Slug of the most-built combination on this page, or null if nobody built one"),
  buildDistribution: z
    .array(
      z.object({
        builtPrizeSlug: z.string(),
        visitors: z.number().int().nonnegative(),
      })
    )
    .describe(
      "Every combination built on this page, most-built first. Always present (an array), empty when nobody built one — do not confuse with topBuiltPrize's nullable single value."
    ),
  signups: z.number().int().nonnegative(),
  conversions: z.number().int().nonnegative(),
  revenue: z.number().nonnegative().describe("AUD dollars"),
  visitToSignupRate: z.number().describe("Percent (0-100)"),
  signupToConversionRate: z.number().describe("Percent (0-100)"),
  overallConversionRate: z.number().describe("Percent (0-100)"),
});

const BuiltPrizeMetricsSchema = z.object({
  builtPrizeSlug: z.string(),
  builders: z
    .number()
    .int()
    .nonnegative()
    .describe("Unique visitors who assembled this combination, on any landing page"),
  signups: z.number().int().nonnegative().describe("New accounts whose signupAttribution.builtPrizeSlug is this combination"),
  conversions: z.number().int().nonnegative().describe("Purchases whose PaymentEvent.data.builtPrizeSlug is this combination"),
  revenue: z.number().nonnegative().describe("AUD dollars"),
  builderToSignupRate: z.number().describe("Percent (0-100)"),
  signupToConversionRate: z.number().describe("Percent (0-100)"),
  overallConversionRate: z.number().describe("Percent (0-100)"),
});

const ChannelMetricsSchema = z.object({
  channel: ChannelKeySchema,
  channelLabel: z.string().describe("Human label, e.g. 'Facebook / Instagram', 'Klaviyo Email'"),
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
  byChannel: z.array(ChannelMetricsSchema),
  byBuiltPrize: z.array(BuiltPrizeMetricsSchema),
  byToolbox: z
    .array(
      z.object({
        toolboxId: z.string(),
        builders: z
          .number()
          .int()
          .nonnegative()
          .describe(
            "Unique visitors who ended on ANY combination using this toolbox, deduped ONCE per visitor. Deliberately NOT the sum of byBuiltPrize[].builders — those are deduped per combination, so summing them counts one visitor twice if they ended on two combinations sharing a toolbox."
          ),
        interactedBuilders: z.number().int().nonnegative(),
        signups: z.number().int().nonnegative(),
        conversions: z.number().int().nonnegative(),
        revenue: z.number().nonnegative().describe("AUD dollars"),
        builderToSignupRate: z.number().describe("Percent (0-100)"),
        signupToConversionRate: z.number().describe("Percent (0-100)"),
        overallConversionRate: z.number().describe("Percent (0-100)"),
      })
    )
    .describe("Toolbox lanes. `cash-prize` has no lane and is excluded, never bucketed."),
});

const UTMCampaignMetricsSchema = z.object({
  channel: ChannelKeySchema,
  channelLabel: z.string(),
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

const PrizeBuildMetricsSchema = z.object({
  builtPrizeSlug: z.string(),
  builders: z
    .number()
    .int()
    .nonnegative()
    .describe("Unique visitors whose final on-screen combination on THIS page was this one"),
  interactedBuilders: z
    .number()
    .int()
    .nonnegative()
    .describe("Of builders, those who changed the build rather than accepting what loaded"),
  signups: z.number().int().nonnegative(),
  conversions: z.number().int().nonnegative(),
  revenue: z.number().nonnegative().describe("AUD dollars"),
  builderToSignupRate: z.number().describe("Percent (0-100)"),
  signupToConversionRate: z.number().describe("Percent (0-100)"),
  overallConversionRate: z.number().describe("Percent (0-100)"),
  isPageDefault: z
    .boolean()
    .describe("True for the combination this page shows on first paint, before any interaction"),
});

const PageBuildBreakdownSchema = z.object({
  defaultBuiltPrizeSlug: z.string(),
  buildVisitors: z.number().int().nonnegative(),
  builds: z.number().int().nonnegative(),
  buildChangeRate: z.number().describe("Percent (0-100)"),
  byBuild: z
    .array(PrizeBuildMetricsSchema)
    .describe(
      "⚠️ buildVisitors/builds above are PAGE-LEVEL uniques and are NOT the column sums of this array. A visitor who landed twice on different combinations counts once above and twice here, so Σ builders ≥ buildVisitors. Never present these as a total."
    ),
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
  buildBreakdown: PageBuildBreakdownSchema,
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
  channel: ChannelKeySchema,
  channelLabel: z.string(),
  summary: SummaryTotalsSchema.describe(
    "visits is deduped ONCE channel-wide and is deliberately NOT the sum of byPage[].visits — one visitor can appear on several pages."
  ),
  byPage: z.array(ChannelPageMetricsSchema),
  byCampaign: z.array(ChannelCampaignMetricsSchema),
  rawSources: z
    .array(
      z.object({
        source: z.string().describe("Raw lowercase utm_source; '(none)' when absent"),
        visits: z.number().int().nonnegative(),
      })
    )
    .describe(
      "⚠️ PER-SOURCE uniques for auditing the fold (what merged into this channel). One visitor can arrive via ig and later facebook.com, so these MAY sum above summary.visits. Never an addend."
    ),
});
