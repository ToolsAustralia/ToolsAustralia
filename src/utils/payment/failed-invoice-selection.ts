import type Stripe from "stripe";

/**
 * Prefer the best open, chargeable invoice for failed renewal recovery.
 * When collection is paused, `latest_invoice` may be a newer draft; open invoices are the real retry target.
 */
export function pickOpenInvoiceForFailedRenewal(openInvoices: Stripe.Invoice[]): Stripe.Invoice | null {
  const candidates = openInvoices.filter(
    (inv) =>
      inv.collection_method === "charge_automatically" &&
      (inv.amount_remaining ?? 0) > 0
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.created - a.created);
  return candidates[0] ?? null;
}
