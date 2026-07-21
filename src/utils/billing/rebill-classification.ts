/**
 * A **re-bill** is the recovery re-charge of a PAST-DUE member's current cycle
 * (`mintCurrentCycleInvoice`, `billing_cycle_anchor:'now'`). Stripe stamps its invoice
 * `billing_reason` as **`subscription_update`** — the SAME value a tier UPGRADE gets — but a re-bill is
 * functionally a **RENEWAL**, not a new purchase or an upgrade. Every consumer of `billing_reason`
 * (admin activity/history labels, new-vs-renewal revenue + ROAS analytics, Meta/Klaviyo conversion
 * tracking, the `isRenewal` flag, entry math) must treat it as a renewal — otherwise a recovered
 * renewal is wrongly counted as new ad-driven acquisition revenue and shows as "Subscribed to X".
 *
 * This predicate identifies a re-bill so the webhook can normalize its EFFECTIVE billing_reason to
 * `"subscription_cycle"` (see stripe-webhook-handlers/index.ts, handleInvoicePaymentSucceeded).
 *
 * Signal (all must hold):
 *  - `billing_reason === "subscription_update"` — the shape a mint re-bill and an upgrade share.
 *  - NOT an upgrade — an upgrade sets `subscription.metadata.upgradeFrom` (→ `isUpgrade`); the mint
 *    CLEARS those markers, so `!isUpgrade` keeps a genuine tier change labelled "subscription_update".
 *  - a recovery re-charge — recognised by the mint's durable `billing_anchor_rule: "rebill_current_cycle"`
 *    subscription-metadata marker (race-free; set on the mint's `subscriptions.update`), OR — belt-and-
 *    suspenders — the member being `past_due`/`unpaid` when the payment landed (a re-bill only ever
 *    targets a past-due member; upgrades are blocked while past_due).
 *
 * INVARIANT / caveat (2026-07-21 review): the `billing_anchor_rule` marker is DURABLE — Stripe MERGES
 * metadata and nothing clears it after a successful re-bill. The marker path is what makes this race-
 * proof for the re-bill's OWN success event (which can arrive AFTER `customer.subscription.updated`
 * flipped the DB status to `active`, so the past_due fallback alone would miss it). The price is that
 * the marker path trusts the invariant that NO live flow emits a non-zero `subscription_update` that is
 * NOT an upgrade on a subscription that previously re-billed. Verified true today: the only non-upgrade
 * non-zero `subscription_update` candidate is a DOWNGRADE — it sets `downgradedFrom` (not `upgradeFrom`,
 * so `isUpgrade` is false) but uses `proration_behavior:'none'` so it emits NO `invoice.payment_succeeded`
 * → this predicate is never reached for it. If a future flow DOES charge such an invoice on a re-billed
 * sub, it would be silently mislabeled a renewal — then either clear the marker single-use on the re-bill
 * success, or gate the marker path on a per-event signal. See docs/billing-stripe/gotchas.md.
 */
export function isRebillPayment(params: {
  billingReason: string | null | undefined;
  isUpgrade: boolean;
  billingAnchorRule: string | null | undefined;
  previousSubscriptionStatus: string | null | undefined;
}): boolean {
  if (params.billingReason !== "subscription_update") return false;
  if (params.isUpgrade) return false;
  return (
    params.billingAnchorRule === "rebill_current_cycle" ||
    params.previousSubscriptionStatus === "past_due" ||
    params.previousSubscriptionStatus === "unpaid"
  );
}

/**
 * The EFFECTIVE billing_reason to thread downstream: a re-bill collapses to `"subscription_cycle"` so
 * it is treated as a renewal everywhere; everything else passes through unchanged.
 */
export function effectiveBillingReasonForRebill(
  rawBillingReason: string | null | undefined,
  isRebill: boolean
): string | undefined {
  if (isRebill) return "subscription_cycle";
  return rawBillingReason ?? undefined;
}
