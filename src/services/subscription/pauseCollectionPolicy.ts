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
 * Owns the WHOLE clear decision for the paid-invoice / failed-renewal-recovery path.
 *
 * The decision it encodes was:
 *   !retention && ( shouldClearPauseCollectionAfterPaidInvoice(...)
 *                   || recordMembershipRecurringAffiliate
 *                   || subscription.pause_collection != null )
 *
 * which reduces to `pauseCollectionPresent && !retention` once you require something to
 * actually be paused — see the precondition below. Every clause in the old disjunction was
 * ORed with `pauseCollectionPresent`, so adding the precondition changes the outcome in exactly
 * one situation: no pause is set and a legacy clause said "clear". Clearing a pause that does
 * not exist is a Stripe no-op (`resumeAfterSuccessfulRenewalPayment` is documented idempotent),
 * so nothing a member or an admin can observe changes.
 */
export function decideClearPause(i: ClearPauseInput): boolean {
  // PRECONDITION (2026-08-24 renewal surge, RC-3): only write to Stripe when there is a pause to
  // clear. `billing_reason: "subscription_cycle"` matched the legacy clause, so EVERY renewal —
  // including the overwhelming majority that were never paused — spent a `/v1/subscriptions`
  // WRITE on `pause_collection: ""` that changed nothing. That endpoint ran at ~73 req/sec
  // against Stripe's 25/sec per-endpoint cap on 23 Aug; this is one of the three calls removed.
  //
  // `pauseCollectionPresent` is read from the same subscription object the caller is about to
  // act on, so it is as fresh as the retrieve that would have preceded the write.
  if (!i.pauseCollectionPresent) return false;

  // A retention pause is never cleared by the recovery/paid-invoice path.
  if (i.pauseReason === "retention") return false;

  // A non-retention pause IS present — which is itself the third disjunct of the legacy
  // decision, so the other two clauses can no longer change the answer. They are retained on
  // ClearPauseInput (and in `shouldClearPauseCollectionAfterPaidInvoice`, still exported and
  // tested) because they document WHICH signal put a paid invoice on this path, and the admin /
  // renew-subscription recovery paths call the resume helper on their own terms.
  return true;
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

/** Inputs for the re-bill anchor-24 clamp decision. Pure — no Stripe client, no date/timezone math. */
export interface RebillReanchorGateInput {
  /** The paid invoice is a mint RE-BILL (isRebillPayment): subscription_update, not an upgrade, past-due. */
  isRebill: boolean;
  invoiceIsPaid: boolean;
  /** `isJoinDateAnchoredTo24(recoveryDate)` — recovery landed on the 25th/26th/27th (AEST). Computed by the
   *  caller so this predicate stays pure/date-free. */
  recoveryDayIsAnchorWindow: boolean;
  cancelAtPeriodEnd: boolean;
  autoRenew: boolean | undefined;
  /** `user.subscription.lastReanchoredInvoiceId` — cheap pre-filter (the atomic claim is authoritative). */
  alreadyReanchoredInvoiceId: string | undefined;
  invoiceId: string;
}

/**
 * Whether a paid past-due RE-BILL (`mintCurrentCycleInvoice`, `billing_reason "subscription_update"`)
 * should additionally be clamped to the anchor-24 renewal day.
 *
 * The held-draft recovery path (`subscription_cycle`) reanchors via {@link shouldReanchorAfterRecovery},
 * which pulls a 25/26/27 recovery back to the 24th (≥3-day buffer before the 27th major draw). A mint
 * re-bill is `subscription_update`, so it SKIPS that gate — its own `billing_cycle_anchor:'now'` moves the
 * renewal ~1 month out but does NOT apply the clamp, so a re-bill collected on the 25/26/27 would renew on
 * that very day (0–2 days before the draw). This predicate re-applies the SAME clamp via the SAME
 * `reanchorAfterPastDueRecovery`.
 *
 * ONLY fires when the clamp actually changes the date (`recoveryDayIsAnchorWindow`). On every other day the
 * mint's anchor already lands the renewal a clean ~1 month out, so a reanchor would only add a needless $0
 * trial invoice + flip the member to "trialing" for no date benefit. Mirrors the ending / autoRenew-off
 * guards of `shouldReanchorAfterRecovery` so a member who is cancelling is never silently extended.
 */
export function shouldReanchorRebillToAnchor24(i: RebillReanchorGateInput): boolean {
  if (!i.isRebill) return false;
  if (!i.invoiceIsPaid) return false;
  if (!i.recoveryDayIsAnchorWindow) return false; // 25/26/27 only — where the clamp moves the date
  if (i.cancelAtPeriodEnd === true) return false; // member is ending — do not extend
  if (i.autoRenew === false) return false;
  if (i.alreadyReanchoredInvoiceId === i.invoiceId) return false;
  return true;
}

/**
 * What a subscription object actually TELLS us about `pause_collection`.
 *
 * The three states are deliberately distinct, because `null` is an ANSWER and `undefined` is a
 * MISSING answer:
 *
 * - `"paused"`     — the field came back with a pause object. Clear it.
 * - `"not_paused"` — the field came back **explicitly `null`**. Stripe is telling us there is no
 *                   pause; trust it and skip the write. This is the common renewal case, and it is
 *                   where the saving in {@link decideClearPause}'s precondition comes from.
 * - `"unknown"`    — the field is **absent** from the object. That is not "no pause", it is "we
 *                   were not told". A caller holding a subscription it got by EXPANSION rather than
 *                   by `subscriptions.retrieve` must re-read it before deciding: for a genuinely
 *                   paused member who has just paid, the `invoice.payment_succeeded` webhook is the
 *                   only automatic clearer we have (`pay-failed-invoice` does not resume, and
 *                   `prepareRecoveredCycleInvoice` never resumes), so guessing "not paused" here
 *                   would leave a paying member collection-paused indefinitely.
 *
 * Verified live (invoice `in_1U7b0KJ3N9Ka6RJMcLvhPOHe`, expanded through
 * `parent.subscription_details.subscription`): the field IS returned, as `null`. So `"unknown"`
 * should be unreachable in practice — it exists so that being wrong about that costs one extra
 * retrieve instead of a stuck member. The cohort it protects cannot be observed today: a scan of
 * ~1,200 live subscriptions found zero with `pause_collection` set.
 */
export type PauseCollectionReadout = "paused" | "not_paused" | "unknown";

export function readPauseCollection(subscription: {
  pause_collection?: Stripe.Subscription.PauseCollection | null;
}): PauseCollectionReadout {
  // Widened read: the SDK type says `PauseCollection | null`, but the entire point of this helper
  // is the case where the key is not on the wire object at all.
  const raw = (subscription as { pause_collection?: unknown }).pause_collection;
  if (raw === undefined) return "unknown";
  if (raw === null) return "not_paused";
  return "paused";
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
