/**
 * Pure helpers for Stripe refund amounts (cents). Used by webhooks and tests.
 */

export type RefundLike = { status?: string | null; amount?: number | null };

/** Sum of refund.amount for rows with status === "succeeded". */
export function sumSucceededRefundAmountCents(refunds: RefundLike[]): number {
  return refunds
    .filter((r) => r.status === "succeeded")
    .reduce((sum, r) => sum + (r.amount ?? 0), 0);
}

export function isFullRefundByAmounts(succeededRefundCents: number, chargeAmountCents: number): boolean {
  if (chargeAmountCents <= 0) return false;
  return succeededRefundCents >= chargeAmountCents;
}
