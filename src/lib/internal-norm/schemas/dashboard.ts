import { z } from "zod";
import { NormDateRangeSchema } from "./common";

const RevenueBucketSchema = z.object({
  revenue: z.number(),
  purchaseCount: z.number(),
  userCount: z.number(),
});

export const NormDashboardStatsSchema = z.object({
  dateRange: NormDateRangeSchema,
  users: z.object({
    total: z.number(),
    activeSubscriptions: z.number(),
    newInRange: z.number(),
    cancelledMemberships: z.number(),
    totalScheduledCancellation: z.number(),
    dropOffRate: z.number(),
    periodChurnRate: z.number().nullable(),
    membershipRenewals: z.object({
      expectedInRange: z.number(),
      succeededInRange: z.number(),
      failedInvoicesInRange: z.number(),
      becamePastDueInRange: z.number(),
    }),
  }),
  revenue: z.object({
    total: z.number(),
    breakdown: z.object({
      membershipPurchase: RevenueBucketSchema,
      membershipRenewal: RevenueBucketSchema,
      oneTimePurchase: RevenueBucketSchema,
      additionalOneTimePurchase: RevenueBucketSchema,
      miniDraw: RevenueBucketSchema,
      upsell: RevenueBucketSchema,
    }),
  }),
  majorDraw: z.object({
    totalEntries: z.number(),
    activeDraws: z.number(),
  }),
  conversionRate: z.number(),
  facebookAds: z.object({
    spend: z.number(),
    roas: z.number(),
  }),
});

export const NormRevenueBreakdownSchema = z.object({
  dateRange: NormDateRangeSchema,
  total: z.number(),
  breakdown: NormDashboardStatsSchema.shape.revenue.shape.breakdown,
});

// ─── dashboard.membership-by-package ─────────────────────────────────────────
// Mirrors MembershipAnalyticsService.getMembershipByPackageLive() / Snapshot().
// Live-only Norm projection: drops the internal `snapshotPartial` / `snapshotMissing`
// flags (those describe internal fallback state, not the data Norm should see).

const NormMembershipByPackageRowSchema = z.object({
  packageId: z.string(),
  packageName: z.string(),
  activeCount: z.number().int().nonnegative(),
  cancelledCount: z.number().int().nonnegative().describe(
    "Active subs with autoRenew=false and an endDate set (scheduled-cancel)"
  ),
  pastDueCount: z.number().int().nonnegative(),
  activeRevenue: z.number().describe("AUD; activeCount × package.price"),
  pastDueRevenue: z.number().describe("AUD; pastDueCount × package.price"),
});

export const NormMembershipByPackageSchema = z.object({
  packages: z.array(NormMembershipByPackageRowSchema),
  summary: z.object({
    totalActiveCount: z.number().int().nonnegative(),
    totalPastDueCount: z.number().int().nonnegative(),
    totalActiveRevenue: z.number(),
    totalPastDueRevenue: z.number(),
  }),
  meta: z.object({
    membershipAsOfMode: z.enum(["live", "snapshot"]),
    asOf: z.string().nullable().describe("ISO 8601 UTC end-of-AEST-day for snapshot mode; null for live"),
  }),
});

// ─── dashboard.projected-income ──────────────────────────────────────────────
// All monetary fields in AUD (not cents).

export const NormProjectedIncomeSchema = z.object({
  projectedIncome: z.number().describe(
    "AUD; sum of package.price across active subs with autoRenew != false"
  ),
  activeSubscriptions: z.number().int().nonnegative(),
  nextMonthStart: z.string().describe("ISO 8601 UTC"),
  nextMonthEnd: z.string().describe("ISO 8601 UTC"),
  renewingOn27thCount: z.number().int().nonnegative().describe(
    "Active auto-renewing subs whose endDate falls between today (AEST midnight) and the upcoming 27th 8pm AEST"
  ),
  renewingOn27thRevenue: z.number().describe("AUD"),
  renewingOn27thDate: z.string().describe("ISO 8601 UTC; midnight AEST of the upcoming 27th"),
  pastDueCount: z.number().int().nonnegative(),
  pastDueRevenue: z.number().describe("AUD; at-risk revenue from past-due subs"),
});

// ─── dashboard.recent-activities ─────────────────────────────────────────────
// PII-safe activity feed projection:
//   - firstName only (NO lastName)
//   - opaque userId (Mongo User._id)
//   - NO email, NO mobile
// Mirrors the admin activity feed but stripped to what Norm needs to reason
// about volume + recency.

const NormRecentActivityTypeSchema = z.enum([
  "user_signup",
  "membership_purchase",
  "one_time_purchase",
  "draw_complete",
  "high_value_order",
  "system_alert",
  "membership_upgrade",
  "subscription_past_due",
]);

const NormRecentActivityStatusSchema = z.enum(["success", "info", "warning", "error"]);

const NormRecentActivityRowSchema = z.object({
  id: z.string().describe("Stable per-activity ID for dedup"),
  type: NormRecentActivityTypeSchema,
  firstName: z
    .string()
    .nullable()
    .describe("Actor firstName only; null for System events. lastName is intentionally stripped."),
  userId: z
    .string()
    .nullable()
    .describe("Opaque Mongo User._id; null for System events"),
  action: z.string().describe(
    "Human-readable action label; may include the affiliate / referral code or the mini-draw name"
  ),
  time: z.string().describe('Relative time-ago label (e.g. "3 min ago")'),
  timestamp: z.string().describe("ISO 8601 UTC"),
  status: NormRecentActivityStatusSchema,
  amount: z.number().nullable().describe("AUD; null when not a money-movement activity"),
  miniDrawId: z.string().nullable().describe("Mongo MiniDraw._id for mini-draw entries; null otherwise"),
});

export const NormRecentActivitiesSchema = z.object({
  activities: z.array(NormRecentActivityRowSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  }),
});

// ─── dashboard.revenue-details ───────────────────────────────────────────────
// Per-user contribution rows for one revenue category over a date range.
// PII-safe projection: firstName + opaque userId only — no lastName, NO email,
// NO mobile.

const NormRevenueDetailsCategorySchema = z.enum([
  "membership-purchase",
  "membership-renewal",
  "one-time-purchase",
  "additional-one-time",
  "mini-draw",
  "upsell",
]);

const NormRevenueDetailsPurchaseSchema = z.object({
  paymentEventId: z.string(),
  timestamp: z.string().describe("ISO 8601 UTC"),
  amount: z.number().describe("AUD"),
  packageId: z.string().nullable(),
  packageName: z.string().nullable(),
  billingReason: z
    .string()
    .nullable()
    .describe("Stripe billing_reason (e.g. subscription_cycle) when available"),
});

const NormRevenueDetailsUserRowSchema = z.object({
  userId: z.string().describe("Opaque Mongo User._id"),
  firstName: z
    .string()
    .describe('Actor firstName; "Unknown" when the User row could not be joined'),
  purchases: z.array(NormRevenueDetailsPurchaseSchema),
  totalContributed: z.number().describe("AUD"),
  purchaseCount: z.number().int().nonnegative(),
});

export const NormRevenueDetailsSchema = z.object({
  category: NormRevenueDetailsCategorySchema,
  totalRevenue: z.number().describe("AUD"),
  totalPurchases: z.number().int().nonnegative(),
  totalUsers: z.number().int().nonnegative(),
  users: z.array(NormRevenueDetailsUserRowSchema),
  pagination: z.object({
    currentPage: z.number().int().positive(),
    totalPages: z.number().int().nonnegative(),
    totalCount: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    hasNextPage: z.boolean(),
    hasPrevPage: z.boolean(),
  }),
});

// ─── dashboard.upcoming-renewals ─────────────────────────────────────────────
// Subscriptions due to renew within the selected window.
// PII-safe projection: customerName/customerEmail stripped, only opaque
// identifiers (userId, subscriptionId, customerId) plus the amount + date.

const NormUpcomingRenewalRowSchema = z.object({
  userId: z.string().describe("Opaque Mongo User._id"),
  subscriptionId: z.string().describe("Stripe subscription ID; empty string if none"),
  customerId: z.string().describe("Stripe customer ID; empty string if none"),
  renewalDate: z.string().describe("ISO 8601 UTC; empty string when subscription.endDate is missing/invalid"),
  renewalDateFormatted: z.string().describe('AEST-formatted label e.g. "May 27, 2026 8:00 PM" or "—"'),
  amountCents: z.number().int().nonnegative().describe("Stripe cents; package.price * 100"),
});

export const NormUpcomingRenewalsSchema = z.object({
  renewals: z.array(NormUpcomingRenewalRowSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  totalRevenue: z.number().describe("AUD; sum across the full filter (not just this page)"),
});
