/**
 * RetentionUnsubscribeService
 *
 * Applies a marketing unsubscribe when a member accepts the
 * `unsubscribe_marketing` cancellation-flow retention offer.
 *
 * ## What "unsubscribe" means here
 *
 * This stops MARKETING email AND MARKETING SMS only. Transactional / account
 * emails (receipts, renewal notices, password resets, draw results) are NOT
 * affected — they are not marketing and are not gated by
 * `acceptsPromotionalEmail`.
 *
 * ## Distinction from pause/discount offers
 *
 * | Dimension          | pause_30d / discount_50_2mo   | unsubscribe_marketing       |
 * |--------------------|-------------------------------|-----------------------------|
 * | One-time gated     | yes (retentionOffersConsumed) | NO — not in ONE_TIME map    |
 * | Past-due guard     | yes (blocked when past-due)   | NO — harmless when past-due |
 * | Stripe side-effect | yes                           | none                        |
 * | Idempotent         | n/a (consumed flag)           | yes (set flag false again)  |
 *
 * There is intentionally no consumed-flag and no past-due guard: unsubscribing
 * from marketing is harmless and valid even for a past-due member, and is
 * naturally idempotent (re-applying simply sets the same flag/Klaviyo state).
 *
 * ## Source of truth & Klaviyo eventual-consistency
 *
 * The DB flag `acceptsPromotionalEmail = false` is the authoritative record of
 * the member's preference. The Klaviyo sync is best-effort: it NEVER throws
 * (returns `{ success, error? }`). If it reports `success: false` we log via
 * `console.error` (production-surviving) but still treat the retention action
 * as a success — Klaviyo eventual-consistency is acceptable; the DB flag is
 * what the rest of the app reads.
 *
 * @see docs/subscription/cancellation-flow.md
 */

import type { IUser } from "@/models/User";

// Heavy server-side imports are deferred to the function body so this module is
// safe to import in unit-test environments lacking env vars (MONGODB_URI, etc).

export interface ApplyMarketingUnsubscribeResult {
  ok: true;
}

/**
 * Unsubscribe the member from marketing email + SMS.
 *
 * 1. Loads the user (full Mongoose doc — the Klaviyo sync expects an `IUser`
 *    shape, mirroring the admin route which passes `User.findById(...)`).
 *    Throws `Error("user not found")` if missing — the route maps to 404.
 * 2. Persists `acceptsPromotionalEmail = false` via an atomic `updateOne`
 *    (`$set` dot-path style, matching RetentionPauseService).
 * 3. Calls `syncKlaviyoEmailMarketingFromAdminPreference(userDoc, false)` —
 *    unsubscribes marketing email + SMS. Non-fatal: a `success: false` result
 *    is logged but does NOT fail the action (DB flag is source of truth).
 * 4. Returns `{ ok: true }`.
 */
export async function applyMarketingUnsubscribe(
  userId: string
): Promise<ApplyMarketingUnsubscribeResult> {
  const { default: connectDB } = await import("@/lib/mongodb");
  const { default: User } = await import("@/models/User");
  const { syncKlaviyoEmailMarketingFromAdminPreference } = await import(
    "@/utils/integrations/klaviyo/klaviyo-profile-sync"
  );

  await connectDB();

  // Full doc (no .lean()) — the Klaviyo sync expects an IUser, matching the
  // admin route's `User.findById(userId)` (no lean) usage.
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("user not found");
  }

  // Persist the preference atomically. This is the authoritative record.
  await User.updateOne(
    { _id: user._id },
    { $set: { acceptsPromotionalEmail: false } }
  );

  // Best-effort Klaviyo sync (email + SMS marketing). Never throws; a
  // success:false is logged but does not fail the retention action.
  const kSync = await syncKlaviyoEmailMarketingFromAdminPreference(
    user as IUser,
    false
  );
  if (!kSync.success) {
    console.error(
      "[RetentionUnsubscribeService] DB flag persisted but Klaviyo marketing unsubscribe reported failure for user",
      userId,
      kSync.error
    );
    // Intentionally not throwing — the DB flag IS persisted (source of truth).
  }

  return { ok: true };
}
