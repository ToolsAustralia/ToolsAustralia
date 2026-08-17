// src/lib/internal-norm/schemas/receipts.ts
//
// Norm projection of the admin Receipts ledger (src/services/admin/receipts.ts).
//
// ⚠️ PII BOUNDARY. The admin table shows first name, last name, email and the Stripe
// CUSTOMER id. This projection deliberately carries **firstName + opaque userId only** —
// the same boundary `dashboard.revenue-details.by-platform` and `winners.get` hold. Do not
// widen it: `lastName`, `email` and `stripeCustomerId` must never appear here.
//
// The Stripe OBJECT id (the payment / invoice the money moved through) IS exposed, matching
// `users.payment-events.list`, which already returns `paymentIntentId` / `stripeChargeId`.
// It identifies a transaction, not a person. The dashboard URLs the admin UI renders are
// omitted — they are an operator-console affordance and carry the live/test mode of the
// server key.

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
  firstName: z.string().describe("First name only. Last name and email are NOT exposed"),
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
