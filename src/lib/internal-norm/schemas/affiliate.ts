import { z } from "zod";

// ─── PII redaction policy ────────────────────────────────────────────────────
// Affiliate records contain real PII — name, email, phone, username,
// affiliate-code, bank-detail block, plus a hashed login password.
//
// The Norm projection intentionally OMITS:
//   - email                   (PII; userId / affiliateCode remain as identifiers)
//   - phone                   (PII)
//   - bankDetails             (PII — BSB, account number, holder name)
//   - password                (already not exposed via .select("-password"))
// And KEEPS the business-relevant identifiers + numeric stats:
//   - id, name (business handle the admin sets)
//   - affiliateCode + affiliateLink (the affiliate's PUBLIC link — not PII)
//   - username (public-facing login handle, used in their dashboard URL)
//   - isActive, totalSignups, totalSales, totalCommissions
//   - unpaidCommissions, unpaidAmount, commissionRate
//   - createdAt, updatedAt
//
// Referred-user rows in the detail endpoint follow the same redaction:
// userId is exposed (opaque correlation key), email + phone + names are stripped.
// Commission rows are not PII per-se; the embedded `referredUser` block is
// reduced to userId only.

const AffiliateListRowSchema = z.object({
  id: z.string().describe("Mongo Affiliate._id"),
  name: z.string().describe("Display name set by admin"),
  username: z.string().describe("Public-facing login handle"),
  affiliateCode: z.string().describe("Unique code used in the affiliate's tracking link"),
  affiliateLink: z.string().describe("Full public affiliate link"),
  isActive: z.boolean(),
  totalSignups: z.number().int().nonnegative().describe("All-time count of referred users"),
  totalSales: z
    .number()
    .nonnegative()
    .describe("All-time referred sales total (Stripe cents)"),
  totalCommissions: z
    .number()
    .nonnegative()
    .describe(
      "All-time commissions earned in Stripe cents (resets to 0 after each payout — unpaid only)",
    ),
  unpaidCommissions: z
    .number()
    .int()
    .nonnegative()
    .describe("Count of AffiliateCommission rows with status='pending'"),
  unpaidAmount: z
    .number()
    .nonnegative()
    .describe("Sum of pending commission amounts (Stripe cents)"),
  createdAt: z.string().describe("ISO 8601 UTC"),
  updatedAt: z.string().describe("ISO 8601 UTC"),
});

export const NormAffiliateListSchema = z.object({
  affiliates: z.array(AffiliateListRowSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

// ─── Detail ────────────────────────────────────────────────────────────────

const AffiliateDetailHeaderSchema = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string(),
  affiliateCode: z.string(),
  affiliateLink: z.string(),
  isActive: z.boolean(),
  commissionRate: z
    .number()
    .describe("Commission rate as decimal (0.30 = 30%); default 0.3 when unset"),
  totalSignups: z.number().int().nonnegative(),
  totalSales: z.number().nonnegative().describe("Stripe cents"),
  totalCommissions: z
    .number()
    .nonnegative()
    .describe("Stripe cents — unpaid portion (resets after payout)"),
  createdAt: z.string().describe("ISO 8601 UTC"),
  updatedAt: z.string().describe("ISO 8601 UTC"),
});

const ReferredUserRowSchema = z.object({
  id: z.string().describe("Mongo User._id of the referred user (opaque correlation key)"),
  referredAt: z.string().describe("ISO 8601 UTC"),
});

const CommissionRowSchema = z.object({
  id: z.string().describe("Mongo AffiliateCommission._id"),
  type: z
    .string()
    .describe(
      "Commission type: one-time-package | upsell | membership-first | membership-recurring | mini-draw-package",
    ),
  packageName: z
    .string()
    .describe("Resolved package display name (falls back to type-specific label)"),
  purchaseAmount: z
    .number()
    .nonnegative()
    .describe("Underlying purchase amount in Stripe cents"),
  commissionAmount: z.number().nonnegative().describe("Stripe cents"),
  status: z.string().describe("pending | paid | cancelled"),
  earnedAt: z.string().describe("ISO 8601 UTC"),
  paidAt: z
    .string()
    .nullable()
    .describe("ISO 8601 UTC; null when status is not 'paid'"),
  referredUserId: z
    .string()
    .nullable()
    .describe("Mongo User._id of the referred user; null if the user record is missing"),
});

const PayoutRowSchema = z.object({
  id: z.string().describe("Mongo AffiliatePayout._id"),
  totalAmount: z.number().nonnegative().describe("Stripe cents"),
  commissionCount: z.number().int().nonnegative(),
  paidAt: z.string().describe("ISO 8601 UTC"),
  processedByUserId: z
    .string()
    .nullable()
    .describe("Mongo User._id of the processing admin; null if the admin record is missing"),
  notes: z.string().nullable(),
});

export const NormAffiliateDetailSchema = z.object({
  affiliate: AffiliateDetailHeaderSchema,
  referredUsers: z.array(ReferredUserRowSchema),
  referredUsersPagination: z.object({
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalPages: z.number().int().nonnegative(),
  }),
  commissions: z.array(CommissionRowSchema),
  commissionsPagination: z.object({
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalPages: z.number().int().nonnegative(),
    sort: z.string(),
    order: z.enum(["asc", "desc"]),
    q: z.string().optional(),
  }),
  pendingCommissionsSummary: z.object({
    count: z.number().int().nonnegative(),
    totalAmount: z.number().nonnegative().describe("Stripe cents"),
  }),
  payouts: z.array(PayoutRowSchema),
});
