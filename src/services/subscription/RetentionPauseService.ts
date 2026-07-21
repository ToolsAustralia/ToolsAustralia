/**
 * RetentionPauseService
 *
 * Applies a 30-day "retention pause" to a Stripe subscription when a member
 * accepts the `pause_30d` cancellation-flow retention offer.
 *
 * ## Distinction from recovery pauses (SubscriptionCollectionPauseService)
 *
 * | Dimension           | Recovery pause                  | Retention pause             |
 * |---------------------|---------------------------------|-----------------------------|
 * | Trigger             | Failed renewal invoice          | Member accepts pause offer  |
 * | behavior            | keep_as_draft                   | void                        |
 * | metadata.pauseReason| (none set)                      | "retention"                 |
 * | resumes_at          | (none — manual resume)          | period_end + 30 days        |
 * | Webhook handling    | Cleared on next paid invoice    | Flip→paused at period end   |
 *
 * ## The `paused` membership state (real DB state)
 *
 * The pause is TIMED to the member's period end: they keep the paid period they already bought,
 * then freeze for ~30 days. During the window `[subscription.pausedFrom, subscription.pausedUntil)`
 * the member is set `status="paused"` + `isActive=false` — no charge, no access/perks, no NEW entry
 * accrual (existing accumulated entries are untouched; they were paid for). The active→paused flip
 * is driven by the Stripe webhook (fires at the period roll) with the `cancellation-retention-resume`
 * cron as the backstop. At `pausedUntil` Stripe AUTO-resumes + bills the next cycle; a successful
 * charge restores `active`, a failed one → `past_due`. `resumeRetentionPause` lets a member (or admin)
 * resume early.
 *
 * `decideClearPause` in `pauseCollectionPolicy.ts` uses `metadata.pauseReason === "retention"`
 * to distinguish and protect retention pauses from the recovery-clear path.
 *
 * ## Entry accrual during pause
 *
 * No extra code is needed to "freeze" entries. Entries only accrue when a paid
 * subscription renewal invoice is created. A `void`-behavior pause causes Stripe to
 * void (discard) invoices during the pause window — no paid invoice means no renewal
 * webhook means no entries are added. Existing accumulated entries on the member's
 * account are untouched.
 *
 * ## Ordering rationale: Stripe FIRST, then consumed-flag persist
 *
 * We update Stripe before we persist the `retentionOffersConsumed.pause30d` flag.
 * If Stripe succeeds but the Mongo write fails, the member got a real pause but can
 * theoretically re-offer (they would see the offer again next time). This is a better
 * failure mode than the inverse: if we wrote the flag first and Stripe then failed,
 * the member would be permanently marked consumed with no pause applied. The
 * consumed-flag failure is logged via `console.error` (production-surviving) but does
 * NOT re-throw — the pause IS applied; a stale consumed flag is a recoverable nuisance,
 * not a data-integrity failure.
 */

import type { IUser } from "@/models/User";
import { hasFailedRenewal } from "@/utils/subscription/subscription-helpers";

// Heavy server-side imports are deferred to function bodies so that this module
// can be safely imported in test environments that lack env vars (STRIPE_SECRET_KEY,
// MONGODB_URI). Only `applyRetentionPause` (which is never called in unit tests)
// reaches these imports at runtime.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const RETENTION_PAUSE_DAYS = 30;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Compute the Unix timestamp (seconds) at which the retention pause resumes:
 * `base + RETENTION_PAUSE_DAYS days`. Callers pass the member's PERIOD END as the base —
 * the pause begins when their paid period ends — so resume = period_end + 30d.
 *
 * Stripe's `resumes_at` field is Unix seconds (not milliseconds).
 */
export function computeResumeAt(base: Date): number {
  return Math.floor((base.getTime() + RETENTION_PAUSE_DAYS * 86_400_000) / 1000);
}

/**
 * Guard decision: returns a non-null string reason when the user must NOT receive
 * a retention pause, or `null` when they are eligible.
 *
 * Extracted as a pure helper so guards are unit-testable without Stripe or DB.
 *
 * Order matters — most critical exclusion first:
 * 1. Past-due: retention pauses must never stack on a failed-renewal scenario.
 * 2. Scheduled to cancel: an already-cancelling member un-cancels via "Resume membership", not a pause.
 * 3. Already consumed: the offer is one-time only.
 * 4. No Stripe subscription ID: cannot update what doesn't exist.
 */
export function retentionPauseBlockReason(
  user: Pick<IUser, "subscription" | "retentionOffersConsumed" | "stripeSubscriptionId">
): string | null {
  if (hasFailedRenewal(user as IUser)) {
    return "past-due: retention pause not allowed";
  }
  // Already scheduled to cancel (autoRenew off / cancel_at_period_end true): a pause would be silently
  // overridden by Stripe cancelling at period end, recording a false "saved". Retention offers are for
  // members still DECIDING to cancel; the explicit un-cancel path is the dashboard "Resume membership".
  if (user.subscription?.autoRenew === false) {
    return "scheduled to cancel: retention pause not allowed";
  }
  if (user.retentionOffersConsumed?.pause30d) {
    return "retention pause already used";
  }
  if (!user.stripeSubscriptionId) {
    return "no active subscription";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main service function
// ---------------------------------------------------------------------------

export interface ApplyRetentionPauseResult {
  resumesAt: string; // ISO-8601
}

/**
 * Apply a 30-day retention pause to the member's Stripe subscription.
 *
 * 1. Loads the user; throws if not found.
 * 2. Runs eligibility guards (past-due / consumed / no subscription).
 * 3. Calls `stripe.subscriptions.update` with:
 *    - `pause_collection.behavior: "void"` (discard invoices during pause)
 *    - `pause_collection.resumes_at: <unix seconds, now + 30d>`
 *    - `metadata.pauseReason: "retention"` — the webhook guard key
 *    - `metadata.pauseResumesAt: <ISO string>` — human-readable audit field
 * 4. Persists `retentionOffersConsumed.pause30d = true` via atomic `updateOne`.
 *    On persist failure, logs `console.error` but does NOT re-throw (pause is live).
 * 5. Returns `{ resumesAt: <ISO string> }`.
 */
export async function applyRetentionPause(userId: string): Promise<ApplyRetentionPauseResult> {
  const { default: connectDB } = await import("@/lib/mongodb");
  const { stripe } = await import("@/lib/stripe");
  const { default: User } = await import("@/models/User");

  await connectDB();

  const user = await User.findById(userId);
  if (!user) {
    throw new Error("user not found");
  }

  const blockReason = retentionPauseBlockReason(user);
  if (blockReason !== null) {
    throw new Error(blockReason);
  }

  // TypeScript narrowing: blockReason === null guarantees stripeSubscriptionId is set.
  const subscriptionId = user.stripeSubscriptionId as string;

  // The 30-day freeze begins at the member's PERIOD END (they keep the paid period they already
  // bought), so resume = period_end + 30d — NOT now + 30d. Prefer the DB endDate (synced from
  // Stripe for active members); fall back to the live Stripe period end.
  const dbEndDate = user.subscription?.endDate ? new Date(user.subscription.endDate) : null;
  let periodEnd: Date;
  if (dbEndDate && !Number.isNaN(dbEndDate.getTime()) && dbEndDate.getTime() > Date.now()) {
    periodEnd = dbEndDate;
  } else {
    const { getSubscriptionPeriodEnd } = await import("@/utils/payment/stripe/subscription-period");
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const periodEndUnix = getSubscriptionPeriodEnd(sub);
    periodEnd = periodEndUnix ? new Date(periodEndUnix * 1000) : new Date();
  }

  const pausedFrom = periodEnd;
  const resumesAtUnix = computeResumeAt(pausedFrom);
  const pausedUntil = new Date(resumesAtUnix * 1000);
  const resumesAtIso = pausedUntil.toISOString();

  // Step 3: Apply the pause on Stripe FIRST (see ordering rationale in file header). resumes_at is
  // when Stripe AUTO-resumes collection + bills the next cycle — the automatic un-pause the member
  // gets if they don't resume early.
  await stripe.subscriptions.update(subscriptionId, {
    pause_collection: {
      behavior: "void",
      resumes_at: resumesAtUnix,
    },
    metadata: {
      pauseReason: "retention",
      pauseResumesAt: resumesAtIso,
    },
  });

  // Step 4: Persist the consumed flag + the pause window atomically. The window drives the
  // active->paused flip (webhook + cron backstop) and the "Paused · resumes {date}" display.
  // Failure is non-fatal (the Stripe pause IS live).
  try {
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          "retentionOffersConsumed.pause30d": true,
          "subscription.pausedFrom": pausedFrom,
          "subscription.pausedUntil": pausedUntil,
        },
      }
    );
  } catch (err) {
    console.error(
      "[RetentionPauseService] Stripe pause applied but failed to persist consumed flag / pause window for user",
      userId,
      err
    );
    // Intentionally not re-throwing — the Stripe pause IS active.
  }

  return { resumesAt: resumesAtIso };
}

// ---------------------------------------------------------------------------
// Early / admin resume
// ---------------------------------------------------------------------------

export interface ResumeRetentionPauseResult {
  resumed: true;
  /** True when the member was already in the frozen window (an immediate bill follows). */
  wasFrozen: boolean;
}

/**
 * Resume a retention-paused member — powers the member's dashboard "Resume now" AND the admin
 * resume control (when a member asks support to un-pause). Lifts the Stripe `pause_collection`
 * so collection resumes immediately: if the member is already in the frozen window (past their
 * period end) Stripe bills the next cycle NOW, and the restore to `active` follows the resulting
 * `invoice.payment_succeeded` — a FAILED charge lands them in `past_due` (the same
 * "benefits back only after a successful payment" rule as the natural resume). If they resume
 * while still inside their paid period, it simply cancels the scheduled pause.
 *
 * Clears the pause window + retention metadata so the flip-cron won't re-pause. Throws
 * `"no active pause"` when the member has no retention pause to resume.
 */
export async function resumeRetentionPause(userId: string): Promise<ResumeRetentionPauseResult> {
  const { default: connectDB } = await import("@/lib/mongodb");
  const { stripe } = await import("@/lib/stripe");
  const { default: User } = await import("@/models/User");

  await connectDB();

  const user = await User.findById(userId);
  if (!user) throw new Error("user not found");
  if (!user.stripeSubscriptionId) throw new Error("no active subscription");

  const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
  const hasPauseWindow = user.subscription?.pausedUntil != null;
  const isRetentionPaused =
    sub.pause_collection != null && (sub.metadata?.pauseReason === "retention" || hasPauseWindow);
  if (!isRetentionPaused) {
    throw new Error("no active pause");
  }

  const wasFrozen = user.subscription?.status === "paused";

  // Lift the Stripe pause → collection resumes now (bills the next cycle if past period end).
  // Clearing the retention metadata lets the webhook restore-branch treat the next update as a
  // real resume (pause_collection == null → restore to active on the paid invoice).
  await stripe.subscriptions.update(user.stripeSubscriptionId, {
    pause_collection: "",
    metadata: { pauseReason: "", pauseResumesAt: "" },
  });

  // Clear the pause window so the flip-cron won't re-pause. The active-restore itself is
  // payment-driven (invoice.payment_succeeded → webhook), consistent with the natural resume.
  await User.updateOne(
    { _id: user._id },
    { $unset: { "subscription.pausedFrom": "", "subscription.pausedUntil": "" } }
  );

  return { resumed: true, wasFrozen };
}
