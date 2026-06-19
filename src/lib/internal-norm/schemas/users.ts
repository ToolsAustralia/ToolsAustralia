import { z } from "zod";

// ─── PII redaction policy ────────────────────────────────────────────────────
// The Users domain is the most PII-sensitive surface in this codebase. The Norm
// projection deliberately omits every PII field across ALL endpoints in this
// file:
//   ❌ email, lastName, mobile, address (full street), dateOfBirth, bankDetails
//   ❌ password*, *Token*, smsOtpCode (already stripped server-side via .select())
//   ❌ savedPaymentMethods Stripe lookups (PCI-adjacent metadata)
//   ❌ raw paymentEvent.data blobs (may contain customer email/IP in some shapes)
// What IS exposed:
//   ✅ opaque userId (Mongo User._id string — correlation key only)
//   ✅ firstName (low-PII display label)
//   ✅ state (Australian state code — operational signal)
//   ✅ booleans/counts/dates and subscription package metadata
//
// Norm cannot enumerate emails. If the operator needs to find user X by email,
// the operator must supply the email; Norm calls /v1/users/search?q=<email>
// and gets back opaque userIds. The email itself is NEVER round-tripped to Norm
// in the response (only the user's firstName + opaque id).

const UserSubscriptionSchema = z.object({
  packageId: z.string().describe("Membership package id slug, e.g. 'tradie-subscription'"),
  packageName: z.string().nullable().describe("Resolved display name; null if package unknown"),
  isActive: z.boolean(),
  startDate: z.string().describe("ISO 8601 UTC"),
  endDate: z.string().nullable().describe("ISO 8601 UTC; null when subscription has no scheduled end"),
  status: z.string().nullable().describe("Stripe-style status: active | trialing | past_due | incomplete | cancelled"),
  autoRenew: z.boolean().nullable().describe("Whether the subscription will auto-renew on its anchor day"),
  lastMonthAccumulatedEntries: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .describe(
      "Membership accumulated entries carried forward into the next draw on renewal; preserved through cancellation for resubscribe. Distinct from top-level accumulatedEntries (lifetime total).",
    ),
});

const UserListRowSchema = z.object({
  userId: z.string().describe("Opaque Mongo User._id correlation key"),
  firstName: z.string().nullable().describe("First name only — lastName intentionally stripped"),
  state: z.string().nullable().describe("Australian state code (NSW/VIC/QLD/WA/SA/TAS/ACT/NT) or null"),
  role: z.string().describe("user | admin"),
  isActive: z.boolean(),
  isEmailVerified: z.boolean(),
  isMobileVerified: z.boolean().nullable(),
  profileSetupCompleted: z.boolean().nullable(),
  createdAt: z.string().describe("ISO 8601 UTC"),
  lastLogin: z.string().nullable().describe("ISO 8601 UTC; null if user has never logged in"),
  subscription: UserSubscriptionSchema.nullable(),
  totalSpent: z
    .number()
    .nonnegative()
    .describe(
      "Refund-net lifetime spend in AUD dollars (excludes BenefitsGranted with matching RefundProcessed)",
    ),
  majorDrawEntries: z
    .number()
    .int()
    .nonnegative()
    .describe("Entries in the currently-active MajorDraw only (not accumulated)"),
  miniDrawCount: z
    .number()
    .int()
    .nonnegative()
    .describe("Count of mini-draws the user is currently participating in (isActive !== false)"),
  rewardsPoints: z.number().int().nonnegative(),
  accumulatedEntries: z.number().int().nonnegative(),
});

const UserListStatsSchema = z.object({
  totalUsers: z.number().int().nonnegative().describe("All-time isActive=true users"),
  activeSubscriptions: z
    .number()
    .int()
    .nonnegative()
    .describe("Subscriptions matching the active+autoRenew filter — projected-income basis"),
  verifiedUsers: z.number().int().nonnegative(),
  conversions: z
    .number()
    .int()
    .nonnegative()
    .describe("Users who have ever processed at least one payment"),
});

const PaginationSchema = z.object({
  currentPage: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  hasNextPage: z.boolean(),
  hasPrevPage: z.boolean(),
});

export const NormUsersListSchema = z.object({
  users: z.array(UserListRowSchema),
  stats: UserListStatsSchema,
  pagination: PaginationSchema,
});

// ─── Search ────────────────────────────────────────────────────────────────

const UserSearchRowSchema = z.object({
  userId: z.string(),
  firstName: z.string().nullable(),
  state: z.string().nullable(),
  role: z.string(),
  isActive: z.boolean(),
  createdAt: z.string().describe("ISO 8601 UTC"),
  lastLogin: z.string().nullable(),
  currentDrawEntries: z
    .object({
      totalEntries: z.number().int().nonnegative(),
      entriesBySource: z.record(z.string(), z.number()),
    })
    .nullable(),
});

const SearchPaginationSchema = z.object({
  currentPage: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  hasNextPage: z.boolean(),
  hasPrevPage: z.boolean(),
  limit: z.number().int().positive(),
});

export const NormUsersSearchSchema = z.object({
  users: z.array(UserSearchRowSchema),
  pagination: SearchPaginationSchema,
  searchInfo: z.object({
    /** The free-text search string, or null when filtering by draw ID only. */
    query: z.string().nullable(),
    resultsFound: z.number().int().nonnegative(),
    currentDraw: z
      .object({
        id: z.string(),
        name: z.string(),
        status: z.string(),
        type: z.enum(["major", "mini"]),
      })
      .nullable(),
  }),
});

// ─── Export (aggregate-only) ───────────────────────────────────────────────

export const NormUsersExportAggregateSchema = z.object({
  totalCount: z
    .number()
    .int()
    .nonnegative()
    .describe("Total users matched by the filter — equals the row count of the admin CSV/Excel export"),
  byState: z.array(
    z.object({
      state: z.string().describe("Australian state code or 'unknown' when missing"),
      count: z.number().int().nonnegative(),
    }),
  ),
  byPackage: z.array(
    z.object({
      packageId: z.string().describe("Membership package id slug, or 'none' for users without a subscription"),
      packageName: z.string().nullable(),
      count: z.number().int().nonnegative(),
    }),
  ),
  bySubscriptionStatus: z.array(
    z.object({
      status: z.string().describe("active | trialing | past_due | incomplete | cancelled | none"),
      count: z.number().int().nonnegative(),
    }),
  ),
  segment: z
    .string()
    .nullable()
    .describe(
      "When 'top20MajorDraw', the export segment was applied (top 20% of users by entry count in the active major draw, including ties at threshold). null = standard filter set.",
    ),
});

// ─── Get-by-id ─────────────────────────────────────────────────────────────

export const NormUsersGetSchema = z.object({
  userId: z.string().describe("Opaque Mongo User._id"),
  firstName: z.string().nullable(),
  state: z.string().nullable(),
  role: z.string(),
  isActive: z.boolean(),
  isEmailVerified: z.boolean(),
  isMobileVerified: z.boolean().nullable(),
  profileSetupCompleted: z.boolean().nullable(),
  acceptsPromotionalEmail: z.boolean().nullable(),
  createdAt: z.string().describe("ISO 8601 UTC"),
  updatedAt: z.string().describe("ISO 8601 UTC"),
  lastLogin: z.string().nullable(),
  subscription: z
    .object({
      packageId: z.string().nullable(),
      packageName: z.string().nullable(),
      isActive: z.boolean(),
      startDate: z.string().nullable(),
      endDate: z.string().nullable(),
      status: z.string().nullable(),
      autoRenew: z.boolean().nullable(),
      lastMonthAccumulatedEntries: z
        .number()
        .int()
        .nonnegative()
        .nullable()
        .describe(
          "Membership accumulated entries carried forward into the next draw on renewal; preserved through cancellation for resubscribe. Distinct from top-level accumulatedEntries (lifetime total).",
        ),
    })
    .nullable(),
  statistics: z.object({
    totalSpent: z.number().nonnegative().describe("AUD dollars; refund-net"),
    totalOrders: z.number().int().nonnegative().describe("Count of Order rows"),
    totalOrderValue: z.number().nonnegative().describe("AUD dollars summed across Order.totalAmount"),
    currentDrawEntries: z.number().int().nonnegative(),
    accountAgeDays: z.number().int().nonnegative(),
    daysSinceLastLogin: z.number().int().nonnegative().nullable(),
    paymentEventsTotal: z.number().int().nonnegative(),
  }),
  rewardsPoints: z.number().int().nonnegative(),
  accumulatedEntries: z.number().int().nonnegative(),
});

// ─── Deletion summary ──────────────────────────────────────────────────────
// Counts-only — NO raw PII rows. The "winnerDraws" subarray exposes draw names
// + types (no winner-user fields).

export const NormUsersDeletionSummarySchema = z.object({
  majorDrawEntries: z.number().int().nonnegative(),
  miniDrawEntries: z.number().int().nonnegative(),
  affiliateCommissions: z.number().int().nonnegative(),
  paymentEvents: z.number().int().nonnegative(),
  orders: z.number().int().nonnegative(),
  winners: z.number().int().nonnegative(),
  referralEvents: z.object({
    asReferrer: z.number().int().nonnegative(),
    asInvitee: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  ticketEntries: z.number().int().nonnegative(),
  warnings: z.object({
    hasActiveSubscription: z.boolean(),
    isWinner: z.boolean(),
    winnerDraws: z
      .array(z.object({ drawName: z.string(), drawType: z.enum(["major", "mini"]) }))
      .optional(),
  }),
});

// ─── Charge past-due preview ───────────────────────────────────────────────
// Invoice metadata only — no email per row.

export const NormUsersChargePastDuePreviewSchema = z.object({
  eligibleCount: z.number().int().nonnegative(),
  totalInvoices: z.number().int().nonnegative(),
  filterStats: z.object({
    wrongCollectionMethod: z.number().int().nonnegative(),
    noAmountRemaining: z.number().int().nonnegative(),
    noPaymentMethod: z.number().int().nonnegative(),
    noCustomerId: z.number().int().nonnegative(),
    userNotFound: z.number().int().nonnegative(),
    notPastDue: z.number().int().nonnegative(),
    duplicateOrStaleCycle: z.number().int().nonnegative(),
  }),
  invoices: z.array(
    z.object({
      invoiceId: z.string(),
      amountCents: z.number().int().nonnegative(),
      currency: z.string(),
      willRecover: z.boolean().describe("True iff the bulk job would recover (re-open) the invoice instead of retrying the charge directly"),
    }),
  ),
});

// ─── Recover past-due invoice preview ──────────────────────────────────────
// Returns eligibility verdict + minimal invoice metadata. The admin route
// `checkRecoveryEligibility` returns an "ok | reason | message" shape — Norm
// mirrors it without exposing customer email/name.

export const NormUsersRecoverPastDueInvoicePreviewSchema = z.object({
  ok: z.boolean(),
  reason: z.string().nullable().describe("Eligibility verdict code when ok=false"),
  message: z.string().nullable().describe("Human-readable explanation"),
  invoice: z
    .object({
      invoiceId: z.string(),
      amountCents: z.number().int().nonnegative(),
      currency: z.string(),
      status: z.string().nullable(),
      collectionMethod: z.string().nullable(),
      subscriptionId: z.string().nullable(),
    })
    .nullable(),
});

// ─── Payment events (per-user, paged) ──────────────────────────────────────
// Scoped to one user already — caller knows the user. No PII per row.

const UserPaymentEventRowSchema = z.object({
  id: z.string().describe("PaymentEvent._id"),
  eventType: z.string().describe("BenefitsGranted | RefundProcessed | RefundPartial | …"),
  paymentIntentId: z.string().nullable(),
  hasRefundProcessed: z
    .boolean()
    .describe("True for BenefitsGranted with a matching RefundProcessed under the same paymentIntentId"),
  refundProcessedAt: z.string().nullable().describe("ISO 8601 UTC; only set on hasRefundProcessed=true rows"),
  timestamp: z.string().describe("ISO 8601 UTC"),
  packageType: z.string().nullable().describe("membership | one-time | upsell | mini-draw"),
  packageId: z.string().nullable(),
  packageName: z.string().nullable(),
  amount: z.number().nullable().describe("AUD dollars; null when the event has no monetary leg"),
  stripeChargeId: z.string().nullable(),
});

export const NormUsersPaymentEventsListSchema = z.object({
  events: z.array(UserPaymentEventRowSchema),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
