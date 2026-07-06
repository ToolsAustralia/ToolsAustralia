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
 * | resumes_at          | (none — manual resume)          | now + 30 days               |
 * | Webhook handling    | Cleared on next paid invoice    | Never auto-cleared (Task 11)|
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
 * Compute the Unix timestamp (seconds) at which the retention pause should
 * resume: `now + RETENTION_PAUSE_DAYS days`.
 *
 * Stripe's `resumes_at` field is Unix seconds (not milliseconds).
 */
export function computeResumeAt(now: Date): number {
  return Math.floor((now.getTime() + RETENTION_PAUSE_DAYS * 86_400_000) / 1000);
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

  const now = new Date();
  const resumesAtUnix = computeResumeAt(now);
  const resumesAtIso = new Date(resumesAtUnix * 1000).toISOString();

  // Step 3: Apply the pause on Stripe FIRST (see ordering rationale in file header).
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

  // Step 4: Persist the consumed flag atomically. Failure is non-fatal (pause is live).
  try {
    await User.updateOne(
      { _id: user._id },
      { $set: { "retentionOffersConsumed.pause30d": true } }
    );
  } catch (err) {
    console.error(
      "[RetentionPauseService] Stripe pause applied but failed to persist consumed flag for user",
      userId,
      err
    );
    // Intentionally not re-throwing — the Stripe pause IS active.
  }

  return { resumesAt: resumesAtIso };
}
