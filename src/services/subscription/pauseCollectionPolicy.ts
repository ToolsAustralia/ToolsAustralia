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

/** Inputs for the retention-`paused` membership-state transition decision. Pure — no Stripe/DB. */
export interface PauseTransitionInput {
  /** `subscription.pause_collection != null` — Stripe still shows a pause. */
  pauseCollectionPresent: boolean;
  /** `subscription.metadata.pauseReason` — only a `"retention"` pause drives the `paused` state. */
  pauseReason: string | undefined;
  /** DB `subscription.status` BEFORE this event. */
  dbStatus: string | undefined;
  /** DB `subscription.pausedFrom` — the freeze start (member's period end). */
  pausedFrom: Date | null | undefined;
  /** DB `subscription.pausedUntil` — the auto-resume date. */
  pausedUntil: Date | null | undefined;
  now: Date;
}

export type PauseTransition = "flip_to_paused" | "restore_from_paused" | "none";

/**
 * Pure decision for the app-owned retention-`paused` membership state, shared by the webhook
 * (`handleSubscriptionUpdated`) and the `cancellation-retention-resume` cron backstop so the two
 * can never drift. Stripe keeps ITS status `"active"` during a `pause_collection`, so the app owns
 * the DB `paused` value via this decision.
 *
 * - `flip_to_paused` — a live retention pause AND the freeze window has started (`now >= pausedFrom`)
 *   AND is not yet over (`now < pausedUntil`) AND we have not flipped yet (`dbStatus !== "paused"`).
 * - `restore_from_paused` — DB says `paused` but Stripe already resumed (`pause_collection` gone):
 *   the pause is over; the caller mirrors Stripe's live status + clears the window.
 * - `none` — no transition (incl. an already-`paused` member mid-window, who simply stays paused).
 *
 * NOTE: the webhook also restores on the paid resume invoice (`handleInvoicePaymentSucceeded`) —
 * that payment-gated restore is separate; this helper's `restore_from_paused` is the no-Stripe-event
 * safety net (cron) that mirrors Stripe once the pause has been lifted.
 */
export function decidePauseTransition(i: PauseTransitionInput): PauseTransition {
  const isRetentionPause = i.pauseCollectionPresent && i.pauseReason === "retention";
  const windowStarted = i.pausedFrom != null && new Date(i.pausedFrom).getTime() <= i.now.getTime();
  const windowNotOver = i.pausedUntil == null || i.now.getTime() < new Date(i.pausedUntil).getTime();

  if (isRetentionPause && i.dbStatus !== "paused" && windowStarted && windowNotOver) {
    return "flip_to_paused";
  }
  if (i.dbStatus === "paused" && !i.pauseCollectionPresent) {
    return "restore_from_paused";
  }
  return "none";
}

/** Inputs for the past-due reanchor trigger decision. Pure — no Stripe client. */
export interface ReanchorGateInput {
  billingReason: string | undefined;
  invoiceIsPaid: boolean;
  previousSubscriptionDbStatus: string | undefined;
  /** `subscription.pause_collection != null`, captured BEFORE resume clears it. */
  pauseCollectionPresentAtPayment: boolean;
  /** `invoice.attempt_count` — durable Stripe fact; > 1 means the cycle invoice already failed. */
  invoiceAttemptCount: number | undefined;
  /** `invoice.metadata.dunning_recovery === '1'` — durable marker stamped when the renewal FAILED.
   *  The only signal that survives the renew-subscription channel (which pre-flips DB status to
   *  active AND clears pause before the webhook; attempt_count stays 1 because pause blocks retries). */
  invoiceMetadataDunningRecovery: boolean;
  /** `subscription.metadata.pauseReason` — a "retention" pause is never a dunning recovery. */
  pauseReason: string | undefined;
  cancelAtPeriodEnd: boolean;
  autoRenew: boolean | undefined;
  /** `user.subscription.lastReanchoredInvoiceId` — cheap pre-filter (atomic claim is authoritative). */
  alreadyReanchoredInvoiceId: string | undefined;
  invoiceId: string;
}

/**
 * Whether a paid subscription_cycle invoice represents a past-due/unpaid RECOVERY that should
 * reanchor future renewals. Dunning is detected via ANY durable signal because no single signal
 * survives every recovery channel: the renew-subscription retry pre-flips DB status to active AND
 * clears pause_collection before the webhook, and `attempt_count` stays 1 because pause_collection
 * blocks Stripe's auto-retries — so the durable `invoiceMetadataDunningRecovery` marker (stamped on
 * the invoice when the renewal first failed) is what catches that channel.
 */
export function shouldReanchorAfterRecovery(i: ReanchorGateInput): boolean {
  if (i.billingReason !== "subscription_cycle") return false;
  if (!i.invoiceIsPaid) return false;
  if (i.cancelAtPeriodEnd === true) return false; // member is ending — do not extend
  if (i.autoRenew === false) return false;
  if (i.pauseReason === "retention") return false;
  if (i.alreadyReanchoredInvoiceId === i.invoiceId) return false;

  const prev = (i.previousSubscriptionDbStatus ?? "").toLowerCase();
  return (
    prev === "past_due" ||
    prev === "unpaid" ||
    i.pauseCollectionPresentAtPayment ||
    i.invoiceMetadataDunningRecovery ||
    // Secondary/weak: only fires if pause was somehow not set (pause blocks the retries that bump this).
    (typeof i.invoiceAttemptCount === "number" && i.invoiceAttemptCount > 1)
  );
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
