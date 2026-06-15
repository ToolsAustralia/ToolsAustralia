/**
 * Affiliate Commission Reversal Utility
 *
 * Reverses affiliate commissions when a payment is refunded — across EVERY
 * commission type. The previous version matched only `stripePaymentIntentId`,
 * so `membership-recurring` rows (which store `stripeInvoiceId` only, no PI)
 * could never be reversed — a refunded renewal kept paying the affiliate
 * (confirmed live in prod). It also missed `membership-first` rows, whose PI is
 * stored normalized as `invoice_in_…` while the refund passes a raw `pi_…`.
 *
 * Storage conventions matched here (see `affiliate-attribution.ts`):
 *  - one-time / upsell / mini-draw → `stripePaymentIntentId = pi_…` (raw)
 *  - membership-first              → `stripePaymentIntentId = invoice_in_…`
 *  - membership-recurring          → `stripeInvoiceId = in_…`
 */

import connectDB from "@/lib/mongodb";
import Affiliate from "@/models/Affiliate";
import AffiliateCommission from "@/models/AffiliateCommission";
import {
  normalizeStripePaymentIntentKeyForCommission,
  stripeInvoiceIdLookupVariants,
} from "./affiliate-attribution";
import mongoose from "mongoose";

/**
 * PURE: from a refund's payment-intent id and/or invoice id, build the candidate
 * id sets to match every commission storage convention. Unit-tested.
 */
export function buildCommissionReversalIds(
  paymentIntentId?: string,
  invoiceId?: string
): { piCandidates: string[]; invoiceCandidates: string[] } {
  const piSet = new Set<string>();
  const pi = paymentIntentId?.trim();
  if (pi) {
    piSet.add(pi); // raw pi_… (one-time / upsell / mini-draw)
    piSet.add(normalizeStripePaymentIntentKeyForCommission(pi)); // in_… → invoice_in_…
  }

  const invoiceCandidates = invoiceId ? stripeInvoiceIdLookupVariants(invoiceId) : [];
  // membership-first stores the invoice as stripePaymentIntentId = invoice_in_…
  for (const v of invoiceCandidates) {
    piSet.add(v.startsWith("invoice_") ? v : `invoice_${v}`);
  }

  return { piCandidates: [...piSet], invoiceCandidates };
}

/**
 * Reverse affiliate commissions linked to a refunded payment.
 *
 * @param paymentIntentId - the refunded Stripe PaymentIntent id (raw pi_… or in_…)
 * @param userId - optional referred-user filter
 * @param invoiceId - the Stripe invoice id (in_…) for subscription refunds — REQUIRED
 *                    to reach membership-first / membership-recurring rows.
 */
export async function reverseAffiliateCommissions(
  paymentIntentId: string,
  userId?: string,
  invoiceId?: string
): Promise<{ success: boolean; reversed: number; alreadyPaid: number; error?: string }> {
  try {
    await connectDB();

    const { piCandidates, invoiceCandidates } = buildCommissionReversalIds(paymentIntentId, invoiceId);

    const or: Record<string, unknown>[] = [];
    if (piCandidates.length) or.push({ stripePaymentIntentId: { $in: piCandidates } });
    if (invoiceCandidates.length) or.push({ stripeInvoiceId: { $in: invoiceCandidates } });
    if (or.length === 0) {
      return { success: true, reversed: 0, alreadyPaid: 0 };
    }

    const query: Record<string, unknown> = { $or: or };
    if (userId) query.referredUserId = new mongoose.Types.ObjectId(userId);

    const commissions = await AffiliateCommission.find(query);
    if (commissions.length === 0) {
      return { success: true, reversed: 0, alreadyPaid: 0 };
    }

    let reversedCount = 0;
    let alreadyPaidCount = 0;

    for (const commission of commissions) {
      if (commission.status === "paid") {
        // Already paid out — requires manual clawback. console.error survives the
        // prod console-strip so ops actually see it (and /review can flag it).
        console.error("⚠️ Affiliate commission already PAID on a refunded payment — manual clawback needed:", {
          commissionId: commission._id?.toString(),
          affiliateId: commission.affiliateId?.toString(),
          commissionType: commission.commissionType,
          amountDollars: (commission.commissionAmount / 100).toFixed(2),
          payoutId: commission.payoutId?.toString(),
          stripePaymentIntentId: commission.stripePaymentIntentId,
          stripeInvoiceId: commission.stripeInvoiceId,
        });
        alreadyPaidCount++;
        continue;
      }

      if (commission.status === "cancelled") continue;

      commission.status = "cancelled";
      await commission.save();

      await Affiliate.findByIdAndUpdate(commission.affiliateId, {
        $inc: {
          totalSales: -commission.purchaseAmount,
          totalCommissions: -commission.commissionAmount,
        },
      });

      reversedCount++;
    }

    return { success: true, reversed: reversedCount, alreadyPaid: alreadyPaidCount };
  } catch (error) {
    console.error(`❌ ERROR in reverseAffiliateCommissions:`, error);
    return {
      success: false,
      reversed: 0,
      alreadyPaid: 0,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
