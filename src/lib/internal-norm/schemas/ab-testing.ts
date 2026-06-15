import { z } from "zod";

// ─── Shared building blocks ──────────────────────────────────────────────────
// All experiment endpoints share the same status enum, ended-reason enum, and
// statistical-results sub-block. The Norm projection intentionally keeps these
// conservative — no raw event streams, no per-assignment rows, no variant
// VariantConfig payload (it can contain large image overrides). Aggregate
// metrics, statistical inference, stopping-rule state, and the winner
// determination are what's exposed.

const ExperimentStatusSchema = z.enum(["draft", "active", "paused", "ended"]);

const ExperimentEndedReasonSchema = z.enum([
  "manual",
  "date_reached",
  "stopping_rule_met",
  "auto_significant",
]);

const StoppingRulesConfigSchema = z
  .object({
    minConversions: z.number().nonnegative().optional(),
    confidenceThreshold: z.number().min(0).max(100).optional(),
    maxDuration: z.number().int().positive().optional().describe("Maximum duration in days"),
    autoEndEnabled: z.boolean().optional(),
  })
  .nullable()
  .optional();

const StatisticalResultsSchema = z
  .object({
    pValue: z.number().min(0).max(1).nullable().optional(),
    confidence: z.number().min(0).max(100).nullable().optional(),
    significant: z.boolean().nullable().optional(),
    lift: z.number().nullable().optional().describe("Percentage lift vs control"),
    confidenceInterval: z
      .object({ lower: z.number(), upper: z.number() })
      .nullable()
      .optional(),
    calculatedAt: z.string().nullable().optional().describe("ISO 8601 UTC"),
  })
  .nullable()
  .optional();

const ExperimentRowSchema = z.object({
  id: z.string().describe("Mongo Experiment._id"),
  name: z.string(),
  status: ExperimentStatusSchema,
  slugTargets: z
    .array(z.string())
    .describe("Prize slugs the experiment targets; ['*'] matches every prize page"),
  startDate: z.string().nullable().describe("ISO 8601 UTC; null when unset"),
  endDate: z.string().nullable().describe("ISO 8601 UTC; null when unset"),
  archived: z.boolean(),
  winnerVariantId: z
    .string()
    .nullable()
    .describe("Mongo Variant._id of the declared winner; null when unset"),
  endedReason: ExperimentEndedReasonSchema.nullable(),
  stoppingRules: StoppingRulesConfigSchema,
  statisticalResults: StatisticalResultsSchema,
  createdAt: z.string().describe("ISO 8601 UTC"),
  updatedAt: z.string().describe("ISO 8601 UTC"),
});

// ─── List ────────────────────────────────────────────────────────────────────

export const NormExperimentsListSchema = z.object({
  experiments: z.array(ExperimentRowSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

// ─── Detail (experiment + variants) ──────────────────────────────────────────
// Variants are returned with their metadata (name, traffic %, isControl) but
// NOT their VariantConfig payload — that can contain large overrides (image
// URLs, color maps, banner copy) the analyst doesn't need to see Norm-side.

const VariantSummarySchema = z.object({
  id: z.string().describe("Mongo Variant._id"),
  name: z.string(),
  trafficPercentage: z.number().min(0).max(100),
  isControl: z.boolean(),
  createdAt: z.string().describe("ISO 8601 UTC"),
  updatedAt: z.string().describe("ISO 8601 UTC"),
});

export const NormExperimentDetailSchema = z.object({
  experiment: ExperimentRowSchema,
  variants: z.array(VariantSummarySchema),
});

// ─── Analytics ───────────────────────────────────────────────────────────────
// Aggregate metrics + statistical inference + stopping-rule state. Two
// response shapes depending on whether `variantId` is supplied — the route
// returns a tagged union via the `kind` field.

const VariantMetricsSchema = z.object({
  pageViews: z.number().int().nonnegative(),
  uniqueVisitors: z.number().int().nonnegative().describe("Sample size for the variant"),
  clicks: z.number().int().nonnegative(),
  conversions: z.number().int().nonnegative(),
  leads: z.number().int().nonnegative(),
  purchases: z.number().int().nonnegative(),
  revenue: z.number().nonnegative().describe("Revenue in Stripe cents"),
  conversionRate: z.number().nonnegative().describe("Percent 0-100"),
  ctr: z.number().nonnegative().describe("Click-through rate, percent 0-100"),
  revenuePerUser: z.number().nonnegative().describe("Stripe cents per unique visitor"),
  roas: z.number().nonnegative().describe("Return on ad spend; 0 when ad-spend data unavailable"),
});

const FunnelMetricsSchema = z.object({
  pageViews: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  conversions: z.number().int().nonnegative(),
  clickRate: z.number().nonnegative().describe("Percent 0-100"),
  conversionRate: z.number().nonnegative().describe("Percent 0-100"),
});

const DropOffRatesSchema = z.object({
  pageViewToClick: z.number().describe("Percent 0-100"),
  clickToConversion: z.number().describe("Percent 0-100"),
  overallDropOff: z.number().describe("Percent 0-100"),
});

const ComparisonVariantSchema = z.object({
  variantId: z.string().describe("Mongo Variant._id"),
  variantName: z.string(),
  metrics: VariantMetricsSchema,
});

const ComparisonSchema = z.object({
  variants: z.array(ComparisonVariantSchema),
  totalPageViews: z.number().int().nonnegative(),
  totalConversions: z.number().int().nonnegative(),
  totalRevenue: z.number().nonnegative().describe("Stripe cents"),
});

const ConfidenceIntervalSchema = z.object({
  lower: z.number(),
  upper: z.number(),
});

const SignificanceSchema = z.object({
  significant: z.boolean(),
  pValue: z.number().min(0).max(1).describe("Chi-square p-value; 1 when undetermined"),
  confidence: z.number().min(0).max(100).describe("Percent (1 - pValue) * 100; 0 when undetermined"),
  lift: z.number().describe("Percentage lift of test vs control"),
  controlRate: z.number().nonnegative().describe("Control conversion rate, 0-1 fraction"),
  variantRate: z.number().nonnegative().describe("Test conversion rate, 0-1 fraction"),
  controlInterval: ConfidenceIntervalSchema,
  variantInterval: ConfidenceIntervalSchema,
  chiSquare: z.number().nonnegative().describe("Chi-square test statistic; 0 when undetermined"),
  message: z.string().optional(),
});

const StoppingRuleCheckSchema = z.object({
  met: z.boolean(),
  current: z.number(),
  required: z.number(),
});

const StoppingRulesEvaluationSchema = z.object({
  shouldStop: z.boolean(),
  reasons: z.array(z.string()),
  details: z.object({
    minConversions: StoppingRuleCheckSchema.optional(),
    confidenceThreshold: StoppingRuleCheckSchema.optional(),
    maxDuration: StoppingRuleCheckSchema.optional(),
  }),
});

const WinnerDeterminationSchema = z.object({
  winner: z
    .string()
    .describe("Winner verdict — 'control', 'variant', or 'inconclusive' (from determineWinner)"),
  reason: z.string().describe("Human-readable reason for the verdict"),
  significance: SignificanceSchema.nullable(),
});

// ─── Bayesian / user-level summary (2026-06 measurement redesign) ────────────
// User-level conversion + revenue from the durable assignment + PaymentEvent
// tables, within the conversion window, scored by the Bayesian chance-to-win
// engine. PII-safe (variantId/variantName only). Revenue in DOLLARS (the new
// model nets refunds + caps per user, so it is not the legacy cents figure).

const BayesianVariantSchema = z.object({
  variantId: z.string().describe("Mongo Variant._id"),
  variantName: z.string(),
  isControl: z.boolean(),
  exposedUsers: z.number().int().nonnegative().describe("Distinct exposed users (denominator), from the assignment table"),
  converters: z.number().int().nonnegative().describe("Distinct users with a first purchase in the conversion window"),
  conversionRate: z.number().describe("Posterior mean conversion rate, 0-1 fraction"),
  chanceToBeatControl: z.number().nullable().describe("P(variant rate > control rate), 0-1; null for the control"),
  credibleInterval: z.object({ lower: z.number(), upper: z.number() }).describe("95% credible interval on the conversion rate (0-1)"),
  relativeLift: z.number().nullable().describe("Relative lift of the posterior mean vs control; null for the control"),
  firstPurchaseRevenue: z.number().describe("Capped, refund-netted first-purchase revenue in DOLLARS"),
  revenuePerUser: z.number().describe("First-purchase revenue per exposed user, DOLLARS"),
  recurringRevenue: z.number().describe("Downstream renewal revenue (separate line), DOLLARS"),
});

const BayesianSummarySchema = z
  .object({
    engine: z.string().describe("Stats engine id, e.g. bayesian-beta-binomial"),
    windowDays: z.number().int().positive().describe("Conversion window after first exposure"),
    appliedCapDollars: z.number().nullable().describe("Per-user revenue cap actually applied, DOLLARS; null when none"),
    controlVariantId: z.string().nullable(),
    recommendation: z.enum(["ship_variant", "keep_control", "keep_running", "inconclusive"]),
    recommendedVariantId: z.string().nullable(),
    minSampleMet: z.boolean().describe("True once every arm has enough converters for a call"),
    winThreshold: z.number().describe("Chance-to-win threshold used for the recommendation, 0-1"),
    variants: z.array(BayesianVariantSchema),
  })
  .nullable()
  .describe("User-level, peeking-safe measurement; null if it could not be computed");

const AnalyticsExperimentShapeSchema = z.object({
  kind: z.literal("experiment"),
  comparison: ComparisonSchema,
  significance: SignificanceSchema,
  stoppingRules: StoppingRulesEvaluationSchema,
  winner: WinnerDeterminationSchema,
  bayesian: BayesianSummarySchema.optional(),
});

const AnalyticsVariantShapeSchema = z.object({
  kind: z.literal("variant"),
  variantId: z.string(),
  metrics: VariantMetricsSchema,
  funnel: FunnelMetricsSchema,
  dropOff: DropOffRatesSchema,
});

export const NormExperimentAnalyticsSchema = z.discriminatedUnion("kind", [
  AnalyticsExperimentShapeSchema,
  AnalyticsVariantShapeSchema,
]);

// ─── History ─────────────────────────────────────────────────────────────────
// One row per mutation event. The `changedBy` block is reduced to userId only;
// firstName/lastName/email are PII and stripped from the Norm projection.

const ExperimentHistoryActionSchema = z.enum([
  "created",
  "updated",
  "activated",
  "resumed",
  "paused",
  "ended",
  "variant_added",
  "variant_updated",
  "variant_deleted",
  "winner_declared",
]);

const ExperimentHistoryRowSchema = z.object({
  id: z.string().describe("Mongo ExperimentHistory._id"),
  experimentId: z.string().describe("Mongo Experiment._id"),
  action: ExperimentHistoryActionSchema,
  changedByUserId: z
    .string()
    .nullable()
    .describe("Mongo User._id of the admin who triggered the change; null if the User record is missing"),
  timestamp: z.string().describe("ISO 8601 UTC"),
});

export const NormExperimentHistorySchema = z.object({
  history: z.array(ExperimentHistoryRowSchema),
});

// ─── Winner GET ──────────────────────────────────────────────────────────────

export const NormExperimentWinnerSchema = z.object({
  winner: z.string().describe("Auto-determined winner: 'control' | 'variant' | 'inconclusive'"),
  reason: z.string().describe("Human-readable reason for the determination"),
  significance: SignificanceSchema.nullable(),
  comparison: ComparisonSchema,
  currentWinner: z
    .string()
    .nullable()
    .describe("Mongo Variant._id of the manually-declared winner; null when unset"),
});
