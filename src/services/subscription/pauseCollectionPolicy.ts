import type Stripe from "stripe";

/**
 * Whether to clear Stripe `pause_collection` after a successful paid membership invoice.
 * See `SubscriptionCollectionPauseService` for the imperative resume API.
 */
export function shouldClearPauseCollectionAfterPaidInvoice(params: {
  billingReason: string | null | undefined;
  previousSubscriptionDbStatus: string | undefined;
}): boolean {
  const br = params.billingReason ?? "";
  const prev = (params.previousSubscriptionDbStatus ?? "").toLowerCase();
  if (prev === "past_due" || prev === "unpaid") {
    return true;
  }
  if (
    br === "subscription_cycle" ||
    br === "subscription_threshold" ||
    br === "subscription_update"
  ) {
    return true;
  }
  return false;
}

/**
 * Inputs for the full "should we clear pause_collection after a paid invoice" decision.
 * Mirrors the real decision at `stripe-webhook-handlers/index.ts:3430-3436`.
 */
export interface ClearPauseInput {
  billingReason: string | undefined;
  previousSubscriptionDbStatus: string | undefined;
  /** `subscription.pause_collection != null` — the moved non-null clause. */
  pauseCollectionPresent: boolean;
  /** `subscription.metadata.pauseReason` — a "retention" pause is never cleared here. */
  pauseReason: string | undefined;
  recordMembershipRecurringAffiliate?: boolean;
}

/**
 * Owns the WHOLE clear decision for the paid-invoice / failed-renewal-recovery path:
 *   shouldClearPauseCollectionAfterPaidInvoice(...) || recordMembershipRecurringAffiliate
 *     || subscription.pause_collection != null
 * plus the retention exclusion. Delegates the legacy sub-decision to the existing
 * `shouldClearPauseCollectionAfterPaidInvoice` (unchanged) rather than reimplementing it.
 */
export function decideClearPause(i: ClearPauseInput): boolean {
  // A retention pause is never cleared by the recovery/paid-invoice path.
  if (i.pauseReason === "retention") return false;
  if (
    shouldClearPauseCollectionAfterPaidInvoice({
      billingReason: i.billingReason,
      previousSubscriptionDbStatus: i.previousSubscriptionDbStatus,
    })
  ) {
    return true;
  }
  if (i.recordMembershipRecurringAffiliate) return true;
  return i.pauseCollectionPresent;
}

/**
 * Human-readable label for `pause_collection` on a Stripe subscription (for logs/scripts).
 */
export function describePauseCollection(subscription: {
  pause_collection?: Stripe.Subscription.PauseCollection | null;
}): string {
  const p = subscription.pause_collection;
  if (p == null) return "none";
  if (typeof p === "object" && p && "behavior" in p) {
    const b = p.behavior;
    if (b === "void") return "void";
    if (b === "mark_uncollectible") return "mark_uncollectible";
    return "keep_as_draft";
  }
  return "paused";
}
