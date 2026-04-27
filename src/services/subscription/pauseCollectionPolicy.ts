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
