import { z } from "zod";

// ─── Debug payload ──────────────────────────────────────────────────────────
// Engineer-facing debug endpoint. Shape mirrors the admin route but is documented
// here for Norm-side parsing. Contents may change without notice — values are
// for diagnostic use only, not for analytical reporting.

export const NormMetricsDebugSchema = z.object({
  dateRange: z.object({
    start: z.string().describe("ISO 8601 UTC"),
    end: z.string().describe("ISO 8601 UTC"),
    days: z.number().int().nonnegative(),
  }),
  paymentEvents: z.object({
    count: z.number().int().nonnegative(),
    totalRevenue: z.number().describe("AUD dollars — sum across the sample only"),
    sample: z.array(
      z.object({
        timestamp: z.string().describe("ISO 8601 UTC"),
        price: z.number().nullable().optional().describe("AUD dollars"),
        packageType: z.string().nullable().optional(),
      })
    ).describe("Up to 10 BenefitsGranted PaymentEvents"),
  }),
  facebookAds: z.object({
    note: z.string(),
  }),
  note: z.string(),
});

// ─── User metrics aggregate ─────────────────────────────────────────────────

const SignupSourceSchema = z.object({
  affiliate: z.number().int().nonnegative(),
  referral: z.number().int().nonnegative(),
  direct: z.number().int().nonnegative(),
  organic: z.number().int().nonnegative(),
  social: z.number().int().nonnegative(),
});

const MembershipStatusSchema = z.object({
  active: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  pastDue: z.number().int().nonnegative(),
  renewed: z.number().int().nonnegative(),
});

const MembershipByPackageRowSchema = z.object({
  packageId: z.string(),
  packageName: z.string(),
  total: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  pastDue: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
});

const PurchaseHistorySchema = z.object({
  totalPurchases: z.number().int().nonnegative(),
  totalRevenue: z.number().describe("AUD dollars"),
  averageOrderValue: z.number().describe("AUD dollars per purchase"),
  byPackageType: z.record(z.string(), z.number().int().nonnegative()),
});

export const NormUserMetricsSchema = z.object({
  dateRange: z.object({
    start: z.string().describe("ISO 8601 UTC"),
    end: z.string().describe("ISO 8601 UTC"),
  }),
  totalUsers: z
    .number()
    .int()
    .nonnegative()
    .describe("Sum of signupSource buckets — users created in range"),
  signupSource: SignupSourceSchema,
  profession: z
    .record(z.string(), z.number().int().nonnegative())
    .describe("Normalized profession label → count; long tail bucketed by service"),
  state: z
    .record(z.string(), z.number().int().nonnegative())
    .describe("AU state code (NSW/VIC/QLD/WA/SA/TAS/ACT/NT) or 'Unknown'"),
  ageGroup: z
    .record(
      z.enum(["18-24", "25-34", "35-44", "45-54", "55-64", "65+", "Unknown"]),
      z.number().int().nonnegative()
    )
    .describe("Age bucket → count; under-18 / missing falls into 'Unknown'"),
  membershipStatus: MembershipStatusSchema,
  membershipByPackage: z.array(MembershipByPackageRowSchema),
  purchaseHistory: PurchaseHistorySchema,
});

// ─── User major-draw comparison ─────────────────────────────────────────────

const UserDrawTotalsSchema = z.object({
  totalUsers: z.number().int().nonnegative(),
  newSignups: z.number().int().nonnegative(),
  activeMemberships: z.number().int().nonnegative(),
  cancelledMemberships: z.number().int().nonnegative(),
  expiredMemberships: z.number().int().nonnegative(),
  renewedMemberships: z.number().int().nonnegative(),
  totalPurchases: z.number().int().nonnegative(),
  totalRevenue: z.number().describe("AUD dollars"),
  averageOrderValue: z.number().describe("AUD dollars per purchase"),
});

const ComparisonMetricSchema = z.object({
  value: z.number().describe("current − previous"),
  percentage: z.number().describe("Percent change (0 when previous is 0)"),
  direction: z.enum(["up", "down", "neutral"]),
});

const UserComparisonMetricsSchema = z.object({
  totalUsers: ComparisonMetricSchema,
  newSignups: ComparisonMetricSchema,
  activeMemberships: ComparisonMetricSchema,
  totalPurchases: ComparisonMetricSchema,
  totalRevenue: ComparisonMetricSchema,
  averageOrderValue: ComparisonMetricSchema,
});

const DrawInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  drawDate: z.string().describe("ISO 8601 UTC"),
  activationDate: z.string().describe("ISO 8601 UTC"),
});

export const NormUserMajorDrawComparisonSchema = z.object({
  currentDrawInfo: DrawInfoSchema,
  previousDrawInfo: DrawInfoSchema,
  currentDrawTotal: UserDrawTotalsSchema,
  previousDrawTotal: UserDrawTotalsSchema,
  comparison: UserComparisonMetricsSchema,
});
