// src/lib/internal-norm/schemas/receipts.ts
//
// Norm projection of the admin Receipts ledger (src/services/admin/receipts.ts).
//
// ⚠️ PII BOUNDARY — WIDER HERE THAN ELSEWHERE, BY EXPLICIT OWNER DECISION (2026-08-17).
//
// CLAUDE.md rule 10 says to keep Norm projections to "firstName + opaque userId only", which
// is what `dashboard.revenue-details.by-platform` and `winners.get` hold. **This endpoint
// also returns `email`**, at the owner's explicit request, so Norm can answer questions about
// a named customer's payments without a second lookup.
//
// That is a deliberate widening, not an oversight: it makes every customer's email address
// reachable by the external assistant across the entire revenue history. It is recorded here,
// in docs/internal-norm/norm-context.md and in BUSINESS.md so it stays a visible decision.
// Anyone tightening the boundary again should remove `email` here first — the route maps
// fields explicitly, so the schema is the control point.
//
// `lastName` and the Stripe CUSTOMER id remain excluded. The Stripe OBJECT id (the payment /
// invoice the money moved through) IS exposed, matching `users.payment-events.list` which
// already returns `paymentIntentId` / `stripeChargeId` — it identifies a transaction, not a
// person. The dashboard URLs the admin UI renders are omitted: an operator-console affordance
// that also leaks the live/test mode of the server key.

import { z } from "zod";
import { NormDateRangeSchema } from "./common";

export const NormReceiptCategorySchema = z.enum([
  "membership-purchase",
  "membership-renewal",
  "one-time-purchase",
  "additional-one-time",
  "mini-draw",
  "upsell",
  "shop-order",
]);

const NormReceiptRowSchema = z.object({
  id: z.string().describe("PaymentEvent._id, or the Order._id for a shop row"),
  timestamp: z.string().describe("ISO 8601 UTC"),
  category: NormReceiptCategorySchema,
  packageName: z.string().describe("Package name, falling back to packageId"),
  amount: z.number().describe("Gross, AUD dollars"),
  refundStatus: z.enum(["none", "refunded", "partially-refunded"]),
  refundedAmount: z.number().describe("AUD dollars returned; equals `amount` on a full refund"),
  netAmount: z.number().describe("amount − refundedAmount, floored at 0. AUD dollars"),
  refundedAt: z.string().nullable().describe("ISO 8601 UTC; null when refundStatus is 'none'"),
  userId: z.string().nullable().describe("Opaque user id — usable with the users.* endpoints"),
  firstName: z.string().describe("First name only — last name is NOT exposed"),
  email: z
    .string()
    .describe(
      "Customer email. Exposed by explicit owner decision (2026-08-17) — a deliberate widening of the usual firstName-only Norm boundary. Treat as personal data: do not repeat it into any external system or message unless the operator asked for it specifically",
    ),
  stripeObjectId: z
    .string()
    .nullable()
    .describe("As Stripe knows it: pi_… for one-off payments, in_… for subscription renewals"),
});

export const NormReceiptsListSchema = z.object({
  dateRange: NormDateRangeSchema,
  category: NormReceiptCategorySchema.nullable().describe("null when no category filter was applied"),
  totals: z.object({
    gross: z.number().describe("AUD dollars before refunds, across the WHOLE filter (not just this page)"),
    refunded: z.number().describe("AUD dollars returned to customers across the whole filter"),
    net: z
      .number()
      .describe(
        "gross − refunded. Reconciles exactly with the dashboard's net revenue; it exceeds the dashboard's ACQUISITION revenue by precisely the membership-renewal total, which acquisition excludes by design",
      ),
    count: z.number().int().nonnegative().describe("Payments in the whole filter"),
  }),
  searchTruncated: z
    .boolean()
    .describe(
      "True when `search` matched more customers than the query expands to, so rows AND totals are a subset of reality. When true, say so — never present these figures as complete. Re-run with an exact email to get a definitive answer",
    ),
  rows: z.array(NormReceiptRowSchema),
  pagination: z.object({
    currentPage: z.number().int().positive(),
    totalPages: z.number().int().nonnegative(),
    totalCount: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    hasNextPage: z.boolean(),
    hasPrevPage: z.boolean(),
  }),
});
