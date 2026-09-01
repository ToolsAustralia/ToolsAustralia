/**
 * bonusCodeAudienceFilter.ts — pure Mongo-filter builders for the "addressable
 * population" of each webhook-minted bonus-code trigger.
 *
 * WHY THIS EXISTS. `docs/superpowers/specs/2026-09-01-coupon-audience-and-ad-url-check-design.md`
 * §A: the owner asked "how many customers can this trigger reach" — a FORECAST,
 * not a count of current `RedeemableIssuance` holders (all three campaigns sit at
 * 0 issuances / 0 webhook calls in production as of 2026-09-01, per the spec's
 * verified starting state). `BonusCodeAudienceService` is the only caller; these
 * builders are kept pure and DB-free so the shape of each filter is testable
 * without a live Mongo connection.
 *
 * A TRIGGER IS THE TARGETING (`src/services/redeemables/__tests__/trigger-eligibility.test.ts:33`,
 * `docs/rewards-redeemables/patterns.md` P7). `isUserEligibleForCampaign` answers
 * "yes" for almost any active account once a trigger is supplied — the campaign's
 * own `targetingMode` (`all-active-subscribers` on all three live codes) is
 * vestigial for a trigger campaign. So the eligibility function does NOT define
 * who is addressable; the real-world ACT each trigger fires for does. These three
 * builders encode that act using only OUR OWN collections (spec decision A4),
 * per the authoritative descriptions already written in BUSINESS.md / CUSTOMER.md
 * ("Flow | Who enters it | Code"):
 *
 *   cancel-click       -> "A member who committed a self-service cancellation
 *                          (not a retention save, not an admin cancel, not a
 *                          past-due tier switch)"                    -> BACKIN200
 *   one-time-purchase  -> "Someone who bought a one-time pack while NOT holding
 *                          an active membership"                     -> EXTRA100
 *   checkout-start     -> "A guest who registered with a package selected"
 *                                                                     -> LOCKIN100
 *
 * checkout-start is the one APPROXIMATION here, and it is worth stating plainly:
 * there is no persisted "Started Checkout" event log in Mongo. The guest-path
 * emit (`fireKlaviyoStartedCheckoutForGuestRegistration` in
 * `src/app/api/auth/register/route.ts`) is fire-and-forget straight to Klaviyo —
 * `validatedData.packageId` is read from the request body to build the event and
 * is never written onto the `User` document, so "which registered guests had a
 * package selected" cannot be reconstructed after the fact. The nearest signal
 * OUR data holds is the same one `isPlainAccount` (same file) already uses to mean
 * "never converted": an active account with zero `accumulatedEntries` and no
 * active subscription. That is a slight OVER-count (it also matches a guest who
 * registered via Google OAuth or an affiliate link with no package in sight) —
 * flagged here and in the service doc comment rather than silently assumed exact.
 */
import type { FilterQuery } from "mongoose";
import type mongoose from "mongoose";
import type { IUser } from "@/models/User";

/**
 * Shared "does not currently hold an active subscription" clause. Same shape as
 * the `"inactive"` branch of `buildCampaignAudienceMongoFilter`
 * (`campaignAudienceFilter.ts`) — reused verbatim rather than re-spelled so the
 * two admin audience surfaces agree on what "not an active subscriber" means.
 */
export function notCurrentlyActiveSubscriberOr(): FilterQuery<IUser>[] {
  return [
    { subscription: { $exists: false } },
    { subscription: null },
    { "subscription.isActive": { $ne: true } },
  ] as FilterQuery<IUser>[];
}

/**
 * checkout-start -> LOCKIN100 (see module header for the approximation this makes).
 * An active, registered account that is not a current subscriber and has never
 * accumulated an entry — the codebase's own "plain account" / never-converted
 * signal (`isPlainAccount`, `src/app/api/auth/register/route.ts`).
 */
export function buildCheckoutStartAudienceFilter(): FilterQuery<IUser> {
  return {
    isActive: true,
    $and: [
      { $or: notCurrentlyActiveSubscriberOr() },
      { $or: [{ accumulatedEntries: { $exists: false } }, { accumulatedEntries: 0 }] },
    ],
  } as FilterQuery<IUser>;
}

/**
 * one-time-purchase -> EXTRA100. "Someone who bought a one-time pack while NOT
 * holding an active membership." `User.oneTimePackages` (not a separate
 * `PaymentEvent` query) is the authoritative field here — it is what
 * `hasQualifyingPurchase` / R8 (`purchase-eligibility.ts`) already treats as the
 * fact "this person made a one-time purchase" elsewhere in this exact domain;
 * querying `PaymentEvent` directly would be a second, potentially-diverging
 * definition of the same fact.
 */
export function buildOneTimePurchaseAudienceFilter(): FilterQuery<IUser> {
  return {
    isActive: true,
    $or: notCurrentlyActiveSubscriberOr(),
    "oneTimePackages.0": { $exists: true },
  } as FilterQuery<IUser>;
}

/**
 * cancel-click -> BACKIN200, step 1 of 2. `CancellationFlowEvent.outcome ===
 * "cancelled"` is the flow's own record of a COMMITTED self-service
 * cancellation — as opposed to `"in_progress"` (abandoned mid-flow) or `"saved"`
 * (a retention offer worked, so the member never left and does not need a
 * win-back nudge). An admin-initiated cancel never creates a
 * `CancellationFlowEvent` row at all, so this filter naturally excludes it too —
 * matching "not a retention save, not an admin cancel" from BUSINESS.md's own
 * description of this trigger.
 */
export const CANCEL_CLICK_FLOW_EVENT_FILTER = { outcome: "cancelled" } as const;

/**
 * cancel-click -> BACKIN200, step 2 of 2. Narrows the committed-cancellation
 * user ids down to accounts that are not CURRENTLY an active subscriber — i.e.
 * have not since resubscribed. A member who came back on their own no longer
 * needs winning back, and the owner's ask was specifically "the numbers that
 * can renew".
 */
export function buildCancelClickUserFilter(
  userIds: mongoose.Types.ObjectId[]
): FilterQuery<IUser> {
  return {
    _id: { $in: userIds },
    isActive: true,
    $or: notCurrentlyActiveSubscriberOr(),
  } as FilterQuery<IUser>;
}
