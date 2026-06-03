import { z } from "zod";

// ─── Shared enums ────────────────────────────────────────────────────────────

const AllowlistActionKindSchema = z.enum(["added", "skipped", "removed"]);

const AllowlistActionReasonSchema = z.enum([
  "auto_eligible",
  "manual_admin",
  "manual_admin_override",
  "filter_not_member",
  "filter_fraud_signal",
  "filter_permanent_issue",
  "manual_reversal",
]);

const AllowlistActionSourceSchema = z.enum([
  "webhook",
  "admin_bulk",
  "admin_reversal",
]);

const EligibilityKindSchema = z.enum([
  "auto_eligible",
  "already_allowlisted",
  "fraud_signal",
  "permanent_issue",
  "not_member",
]);

// ─── allowlist.actions.list ──────────────────────────────────────────────────
// Audit feed row. PII stripped from the Norm projection:
//   - `customerEmail` is omitted
//   - `stripeCustomerId` is omitted
// Card fingerprint + brand + last4 are retained for unambiguous identification
// (the full PAN is never available to anyone server-side — Stripe doesn't expose it).
// `userId` (opaque Mongo ID) is retained so Norm can correlate without seeing PII.

const AllowlistActionRowSchema = z.object({
  id: z.string().describe("AllowlistAction _id"),
  cardFingerprint: z.string().describe("Stripe-generated fingerprint; opaque to Norm"),
  cardLast4: z.string().describe("Last 4 of card; never the full PAN"),
  cardBrand: z.string(),
  userId: z.string().nullable().describe("Mongo User._id, null if not yet matched"),
  action: AllowlistActionKindSchema,
  reason: AllowlistActionReasonSchema,
  declineCode: z.string().nullable(),
  failureCode: z.string().nullable(),
  triggeringPaymentIntentId: z.string().nullable(),
  triggeringChargeId: z.string().nullable(),
  stripeListItemId: z
    .string()
    .nullable()
    .describe("Stripe Radar value-list item ID; null if value_already_exists or skipped"),
  source: AllowlistActionSourceSchema,
  performedByUserId: z
    .string()
    .nullable()
    .describe("Mongo User._id of the admin who triggered the action; null for webhook source"),
  createdAt: z.string().describe("ISO 8601 UTC"),
});

export const NormAllowlistActionsListSchema = z.object({
  actions: z.array(AllowlistActionRowSchema),
});

// ─── allowlist.blocked-cards.list ────────────────────────────────────────────
// One page of blocked-transaction rows. PII stripped:
//   - `customerEmail` is omitted
//   - `stripeCustomerId` is omitted
// `userId` (opaque Mongo ID) is retained.

const EligibilityPreviewSchema = z.union([
  z.object({ eligible: z.literal(true) }),
  z.object({
    eligible: z.literal(false),
    reason: z.enum(["filter_not_member", "filter_fraud_signal", "filter_permanent_issue"]),
  }),
]);

const BlockedCardRowSchema = z.object({
  paymentIntentId: z.string(),
  chargeId: z.string(),
  userId: z.string().nullable().describe("Mongo User._id of the resolved customer, null if unmatched"),
  createdAt: z.string().describe("ISO 8601 UTC"),
  amount: z.number().describe("Stripe currency unit (cents)"),
  currency: z.string().describe("ISO 4217 lowercase, e.g. 'aud'"),
  cardFingerprint: z.string(),
  cardLast4: z.string(),
  cardBrand: z.string(),
  declineCode: z.string().nullable(),
  failureCode: z.string().nullable(),
  preview: EligibilityPreviewSchema.describe(
    "Server's verdict on whether this card is eligible for auto-allowlist"
  ),
  alreadyAllowlisted: z
    .boolean()
    .describe("True if the fingerprint already has an active 'added' AllowlistAction"),
  eligibilityKind: EligibilityKindSchema.describe(
    "Derived bucket combining preview + alreadyAllowlisted; same kinds the admin UI badge uses"
  ),
});

export const NormAllowlistBlockedCardsListSchema = z.object({
  rows: z.array(BlockedCardRowSchema),
  nextCursor: z.string().nullable().describe("Opaque cursor for the next page; null when no more results"),
  total: z.number().int().nonnegative().describe("Total rows matching the filter across all pages"),
});

// ─── allowlist.stats ─────────────────────────────────────────────────────────

export const NormAllowlistStatsSchema = z.object({
  totalActiveAllowlisted: z
    .number()
    .int()
    .nonnegative()
    .describe(
      "Count of card fingerprints whose most-recent AllowlistAction has action='added'"
    ),
});
