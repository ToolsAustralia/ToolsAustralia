/**
 * Detect Stripe's auto-generated $0 "Trial period" invoice.
 *
 * Whenever `trial_end` is set on an EXISTING subscription — the past-due reanchor
 * (`reanchorAfterPastDueRecovery`), the `migrate-anchor-billing-24` migration, and join-anchoring
 * (25/26/27 → 24) — Stripe automatically creates a separate invoice with
 * `billing_reason === "subscription_update"` and a single $0 "Trial period for X" line, and marks it
 * paid (it's $0). That fires a second `invoice.payment_succeeded`.
 *
 * It is NOT a real payment. Granting membership benefits for it **double-counts renewal entries**
 * (the real renewal is a separate `subscription_cycle` invoice) and produces a spurious
 * "Subscribed to X Membership Package" admin activity row. The webhook must skip these invoices.
 *
 * Deliberately narrow so legitimate cases still grant:
 * - A 100%-off renewal is `subscription_cycle` (not `subscription_update`) → not matched → still grants.
 * - A real upgrade proration is `subscription_update` with `total > 0` → not matched → still grants.
 */
export function isZeroAmountTrialUpdateInvoice(invoice: {
  billing_reason?: string | null;
  total?: number | null;
  amount_paid?: number | null;
}): boolean {
  return (
    invoice.billing_reason === "subscription_update" &&
    (invoice.total ?? 0) === 0 &&
    (invoice.amount_paid ?? 0) === 0
  );
}
