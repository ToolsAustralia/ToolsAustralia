import { z } from "zod";

const SampleUserSchema = z.object({
  userId: z.string(),
  email: z.string(),
  name: z.string().optional(),
});

export const NormKlaviyoDrawResetPreviewSchema = z.object({
  targetDraw: z.object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
    activationDate: z.string().describe("ISO 8601 UTC"),
  }),
  cutoffDate: z.string().describe("ISO 8601 UTC"),
  totalUsers: z.number().int().nonnegative(),
  totalParticipants: z.number().int().nonnegative(),
  skippedUsers: z.number().int().nonnegative(),
  reductionPercentage: z.number(),
  sampleUsers: z.array(SampleUserSchema),
});

export const NormKlaviyoDrawResetProgressSchema = z
  .object({
    isRunning: z.boolean(),
    total: z.number().int().nonnegative(),
    processed: z.number().int().nonnegative(),
    synced: z.number().int().nonnegative(),
    errors: z.number().int().nonnegative(),
    currentUserEmail: z.string().optional(),
    startTime: z.number().optional(),
  })
  .nullable();

const KlaviyoTimeframeSchema = z.enum([
  "last_7_days",
  "last_30_days",
  "last_90_days",
  "last_12_months",
]);

const KlaviyoChannelStatSchema = z.object({
  revenue: z.number().describe("Klaviyo-attributed conversion value, in AUD dollars"),
  conversions: z.number(),
});

const KlaviyoEntityValuesFields = {
  entityId: z.string().describe("campaign_id or flow_id"),
  email: KlaviyoChannelStatSchema,
  sms: KlaviyoChannelStatSchema,
  total: KlaviyoChannelStatSchema.describe("email + sms + any other channel (push/unknown)"),
};

const KlaviyoCampaignRowSchema = z.object({
  ...KlaviyoEntityValuesFields,
  name: z.string(),
  status: z.string(),
  scheduledAt: z.string().nullable().describe("ISO 8601, or null if not scheduled"),
});

const KlaviyoFlowRowSchema = z.object({
  ...KlaviyoEntityValuesFields,
  name: z.string(),
  status: z.string(),
  triggerType: z.string(),
});

export const NormKlaviyoAnalyticsSchema = z.object({
  range: KlaviyoTimeframeSchema,
  metricId: z.string().describe("Conversion metric id used for the values reports"),
  campaigns: z.array(KlaviyoCampaignRowSchema),
  flows: z.array(KlaviyoFlowRowSchema),
  scheduled: z.object({
    upcomingCampaigns: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        channel: z.enum(["email", "sms"]),
        scheduledAt: z.string().describe("ISO 8601"),
      }),
    ),
    liveFlows: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        triggerType: z.string(),
      }),
    ),
  }),
  truncated: z.boolean().describe("True if a list hit the page cap (coverage may be partial)"),
});
