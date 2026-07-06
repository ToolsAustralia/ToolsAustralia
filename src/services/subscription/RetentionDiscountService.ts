/**
 * RetentionDiscountService
 *
 * Applies a "50% off for 2 months" retention discount to a Stripe subscription
 * when a member accepts the `discount_50_2mo` cancellation-flow retention offer.
 *
 * ## Stable singleton coupon
 *
 * The discount is delivered via a single, stable Stripe coupon whose `id` is a
 * fixed string (`RETENTION_COUPON_ID = "retention-50off-2mo"`). The coupon is a
 * 50%-off, `duration: "repeating"`, `duration_in_months: 2` coupon. We never
 * create a fresh coupon per member — instead `applyRetentionDiscount` ensures the
 * singleton exists (idempotent: retrieve, create-if-missing) and attaches it to
 * the member's live subscription. Reusing one coupon keeps the Stripe dashboard
 * clean and makes the offer trivially auditable.
 *
 * ### Idempotent + race-safe coupon ensure
 *
 * `stripe.coupons.retrieve(RETENTION_COUPON_ID)`:
 * - succeeds → coupon already exists, use it.
 * - throws a Stripe "resource_missing" / 404 → create it via
 *   `stripe.coupons.create(buildCouponParams())`.
 * - throws anything else → rethrow (real Stripe/network failure).
 *
 * Concurrent first-use race: two requests may both see the coupon missing and
 * both call `create` with the same fixed `id`. Stripe rejects the second create
 * with a duplicate / "already exists" / idempotency error. That is treated as
 * success — the coupon now exists, which is the post-condition we wanted. Any
 * other create error is rethrown.
 *
 * ## `discounts` REPLACES existing discounts (intentional, known behavior)
 *
 * We attach the coupon with the modern `discounts: [{ coupon }]` array form of
 * `stripe.subscriptions.update` (NOT the deprecated top-level `coupon` param).
 * Setting `discounts` REPLACES the subscription's existing discount set — if the
 * member already had some other discount, it is overwritten by the retention
 * coupon. This is acceptable and intentional here: the member is in the act of
 * cancelling and is taking the strongest save offer; the retention 50%/2mo is
 * deliberately the discount that wins.
 *
 * ## Ordering rationale: Stripe FIRST, then consumed-flag persist
 *
 * We update Stripe before we persist the `retentionOffersConsumed.discount50_2mo`
 * flag. If Stripe succeeds but the Mongo write fails, the member got a real
 * discount but can theoretically re-offer (they would see the offer again next
 * time). This is a better failure mode than the inverse: if we wrote the flag
 * first and Stripe then failed, the member would be permanently marked consumed
 * with no discount applied. The consumed-flag failure is logged via
 * `console.error` (production-surviving) but does NOT re-throw — the discount IS
 * applied; a stale consumed flag is a recoverable nuisance, not a data-integrity
 * failure. (Same rationale as RetentionPauseService.)
 */

import type { IUser } from "@/models/User";
import { hasFailedRenewal } from "@/utils/subscription/subscription-helpers";

// Heavy server-side imports are deferred to function bodies so that this module
// can be safely imported in test environments that lack env vars (STRIPE_SECRET_KEY,
// MONGODB_URI). Only `applyRetentionDiscount` (which is never called in unit tests)
// reaches these imports at runtime.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fixed Stripe coupon id — stable singleton, never per-member. */
export const RETENTION_COUPON_ID = "retention-50off-2mo";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Build the Stripe.CouponCreateParams for the retention singleton coupon:
 * 50% off, repeating for 2 months, with the fixed id.
 *
 * Pure (no Stripe/DB) so it is unit-testable with exact-value assertions.
 */
export function buildCouponParams(): {
  id: string;
  percent_off: number;
  duration: "repeating";
  duration_in_months: number;
  name: string;
} {
  return {
    id: RETENTION_COUPON_ID,
    percent_off: 50,
    duration: "repeating",
    duration_in_months: 2,
    name: "50% off for 2 months (retention)",
  };
}

/**
 * Guard decision: returns a non-null string reason when the user must NOT receive
 * the retention discount, or `null` when they are eligible.
 *
 * Extracted as a pure helper so guards are unit-testable without Stripe or DB.
 *
 * Order matters — most critical exclusion first:
 * 1. Past-due: the retention discount must never stack on a failed-renewal scenario.
 * 2. Scheduled to cancel: an already-cancelling member un-cancels via "Resume membership", not a discount.
 * 3. Already consumed: the offer is one-time only.
 * 4. No Stripe subscription ID: cannot apply a discount to what doesn't exist.
 */
export function retentionDiscountBlockReason(
  user: Pick<IUser, "subscription" | "retentionOffersConsumed" | "stripeSubscriptionId">
): string | null {
  if (hasFailedRenewal(user as IUser)) {
    return "past-due: retention discount not allowed";
  }
  // Already scheduled to cancel: a 2-month coupon bills nothing before Stripe cancels at period end, so
  // the member is recorded "saved" yet still churns. Retention offers are for members still DECIDING to
  // cancel; the explicit un-cancel path is the dashboard "Resume membership" button.
  if (user.subscription?.autoRenew === false) {
    return "scheduled to cancel: retention discount not allowed";
  }
  if (user.retentionOffersConsumed?.discount50_2mo) {
    return "retention discount already used";
  }
  if (!user.stripeSubscriptionId) {
    return "no active subscription";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Internal: Stripe error classification (matches SubscriptionReferenceService)
// ---------------------------------------------------------------------------

function stripeErrorCode(e: unknown): string {
  return e && typeof e === "object" && "code" in e ? String((e as { code?: string }).code) : "";
}

function stripeErrorStatus(e: unknown): number | undefined {
  return e && typeof e === "object" && "statusCode" in e
    ? (e as { statusCode?: number }).statusCode
    : undefined;
}

/** True for a Stripe "this resource does not exist" error (404 / resource_missing). */
function isStripeResourceMissing(e: unknown): boolean {
  const code = stripeErrorCode(e);
  return code === "resource_missing" || code === "resource_missing_deleted" || stripeErrorStatus(e) === 404;
}

/**
 * True when `stripe.coupons.create` failed because a coupon with the fixed id
 * already exists (concurrent first-use race). Stripe returns an invalid-request
 * error; we also accept an idempotency-conflict classification defensively.
 */
function isStripeAlreadyExists(e: unknown): boolean {
  const code = stripeErrorCode(e);
  if (code === "resource_already_exists" || code === "idempotency_key_in_use") {
    return true;
  }
  const message = e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase();
  return message.includes("already exists");
}

// ---------------------------------------------------------------------------
// Main service function
// ---------------------------------------------------------------------------

export interface ApplyRetentionDiscountResult {
  couponId: string;
}

/**
 * Apply the 50%-off-for-2-months retention discount to the member's Stripe
 * subscription.
 *
 * 1. Loads the user; throws if not found.
 * 2. Runs eligibility guards (past-due / consumed / no subscription).
 * 3. Ensures the stable singleton coupon exists (retrieve; create-if-missing;
 *    race-safe — a duplicate-create from a concurrent first use is treated as
 *    success).
 * 4. Attaches the coupon to the live subscription via the modern
 *    `discounts: [{ coupon }]` array (this REPLACES existing discounts — see
 *    file header; intentional for a cancelling member taking the save offer).
 * 5. Persists `retentionOffersConsumed.discount50_2mo = true` via atomic
 *    `updateOne`. On persist failure, logs `console.error` but does NOT re-throw
 *    (the discount is live).
 * 6. Returns `{ couponId: RETENTION_COUPON_ID }`.
 */
export async function applyRetentionDiscount(
  userId: string
): Promise<ApplyRetentionDiscountResult> {
  const { default: connectDB } = await import("@/lib/mongodb");
  const { stripe } = await import("@/lib/stripe");
  const { default: User } = await import("@/models/User");

  await connectDB();

  const user = await User.findById(userId);
  if (!user) {
    throw new Error("user not found");
  }

  const blockReason = retentionDiscountBlockReason(user);
  if (blockReason !== null) {
    throw new Error(blockReason);
  }

  // TypeScript narrowing: blockReason === null guarantees stripeSubscriptionId is set.
  const subscriptionId = user.stripeSubscriptionId as string;

  // Step 3: Idempotent + race-safe singleton-coupon ensure.
  try {
    await stripe.coupons.retrieve(RETENTION_COUPON_ID);
  } catch (retrieveErr) {
    if (!isStripeResourceMissing(retrieveErr)) {
      // Real Stripe/network error retrieving the coupon — surface it.
      throw retrieveErr;
    }
    // Coupon does not exist yet — create the stable singleton.
    try {
      await stripe.coupons.create(buildCouponParams());
    } catch (createErr) {
      if (!isStripeAlreadyExists(createErr)) {
        throw createErr;
      }
      // Concurrent first-use race: another request created it between our
      // retrieve and create. Post-condition (coupon exists) is satisfied.
    }
  }

  // Step 4: Attach the coupon to the live subscription. Modern `discounts`
  // array form (NOT the deprecated top-level `coupon`). This REPLACES any
  // existing discounts on the subscription — intentional (see file header).
  // Stripe FIRST (see ordering rationale in file header).
  await stripe.subscriptions.update(subscriptionId, {
    discounts: [{ coupon: RETENTION_COUPON_ID }],
  });

  // Step 5: Persist the consumed flag atomically. Failure is non-fatal
  // (discount is live).
  try {
    await User.updateOne(
      { _id: user._id },
      { $set: { "retentionOffersConsumed.discount50_2mo": true } }
    );
  } catch (err) {
    console.error(
      "[RetentionDiscountService] Stripe discount applied but failed to persist consumed flag for user",
      userId,
      err
    );
    // Intentionally not re-throwing — the Stripe discount IS active.
  }

  return { couponId: RETENTION_COUPON_ID };
}
