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
 *
 * RECENCY BUCKETING (2026-09-01, coordinator correction). An ALL-TIME count
 * overstates the actionable pool by an order of magnitude — Klaviyo's own
 * "Started Checkout" flow fires 2.5–17 days after the customer qualifies
 * (`docs/rewards-redeemables/patterns.md` P7), so a customer who qualified
 * months ago is not reachable by any future send; the flow already fired (or
 * didn't) for them long ago. So every builder below can be date-scoped by an
 * optional `qualifiedSince` — pass a cutoff to count only customers who
 * qualified on/after it, omit it for the all-time ceiling. Each trigger's
 * "qualifying instant" is picked from what that trigger's data actually offers
 * — see `BonusCodeAudienceService` for which field and why per trigger.
 *
 * WHAT THE OWNER ACTUALLY WANTS IS ISSUANCE STATE, NOT THE FORECAST
 * (2026-09-01, second correction — the coordinator's first read of the ask was
 * wrong, not the owner's). Everything above this paragraph answers "how many
 * customers COULD this trigger reach" — useful context, but demoted to a
 * secondary "potential reach" section. The owner's actual want, in his own
 * words: "those who already minted it... those already have access to it...
 * and number of who redeemed." That is `RedeemableIssuance` state, not the
 * addressable population — see `buildStillRedeemableIssuanceFilter` /
 * `buildRedeemedIssuanceFilter` / `buildExpiredOrLapsedIssuanceFilter` below.
 */
import type { FilterQuery } from "mongoose";
import type mongoose from "mongoose";
import type { IUser } from "@/models/User";
import type { IRedeemableIssuance } from "@/models/RedeemableIssuance";

/** The two recency windows the admin card leads with (all-time is the ceiling, unbounded). */
export const RECENCY_WINDOW_DAYS = { last30: 30, last90: 90 } as const;

/** Pure — `now` is always injected, never read from the ambient clock. */
export function cutoffDate(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * Shared "does not currently hold an active subscription" clause. Same shape as
 * the `"inactive"` branch of `buildCampaignAudienceMongoFilter`
 * (`campaignAudienceFilter.ts`) — reused verbatim rather than re-spelled so the
 * two admin audience surfaces agree on what "not an active subscriber" means.
 *
 * Used by `checkout-start` and `one-time-purchase` only. Do NOT reuse this for
 * `cancel-click` — see `hasNotResubscribedOr` below for why the two questions
 * are different for that trigger specifically.
 */
export function notCurrentlyActiveSubscriberOr(): FilterQuery<IUser>[] {
  return [
    { subscription: { $exists: false } },
    { subscription: null },
    { "subscription.isActive": { $ne: true } },
  ] as FilterQuery<IUser>[];
}

/**
 * "Has NOT resubscribed since committing a cancellation" — cancel-click's own
 * version of the question `notCurrentlyActiveSubscriberOr` answers, and
 * deliberately NOT the same clause.
 *
 * WHY THEY DIFFER. `verified` — `CancelSubscriptionService.cancelSubscription`
 * (`src/services/subscription/CancelSubscriptionService.ts:142,169,202-209`)
 * defaults to `cancelAtPeriodEnd: true`. On that (default, self-service) path
 * it sets `subscription.autoRenew = false` and `subscription.cancelledAt`
 * immediately, but only sets `subscription.isActive = false` when
 * `shouldCancelImmediately` is true (past-due, or an explicit immediate
 * cancel) — otherwise `isActive` stays `true` until the already-paid period
 * actually lapses, which can be up to a full billing cycle later. So
 * `"subscription.isActive": { $ne: true }` — correct for the OTHER two
 * triggers, where "still has access" is exactly the disqualifying fact —
 * would wrongly exclude every cancel-at-period-end customer for as long as
 * their grace window lasts, which is precisely the population this trigger
 * exists to reach (verified against production: it cut the last-30-day
 * cancel-click count from what should be several hundred down to double
 * digits — see the report). `subscription.autoRenew` is the field that
 * actually flips back to `true` on a genuine resubscribe (every
 * create/renew-subscription route sets it), so `{ $ne: true }` on THAT field
 * is "has not turned renewal back on" — true for a customer still finishing
 * out a cancelled period AND for one whose access has already ended, false
 * only for someone who is actually renewing again.
 */
export function hasNotResubscribedOr(): FilterQuery<IUser>[] {
  return [
    { subscription: { $exists: false } },
    { subscription: null },
    { "subscription.autoRenew": { $ne: true } },
  ] as FilterQuery<IUser>[];
}

/**
 * checkout-start -> LOCKIN100 (see module header for the approximation this makes).
 * An active, registered account that is not a current subscriber and has never
 * accumulated an entry — the codebase's own "plain account" / never-converted
 * signal (`isPlainAccount`, `src/app/api/auth/register/route.ts`).
 *
 * Qualifying instant: `User.createdAt` (registration). This proxy's whole
 * premise is "a guest who registered with a package selected" — registration
 * IS the checkout-start moment for the guest path this proxy stands in for, so
 * it is the only timestamp available that means anything close to "qualified".
 */
export function buildCheckoutStartAudienceFilter(options?: {
  qualifiedSince?: Date;
}): FilterQuery<IUser> {
  return {
    isActive: true,
    ...(options?.qualifiedSince ? { createdAt: { $gte: options.qualifiedSince } } : {}),
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
 *
 * Qualifying instant: `oneTimePackages[].purchaseDate` — a real event date, not
 * a proxy. With `qualifiedSince` set, matches a user with AT LEAST ONE purchase
 * on/after the cutoff (a Mongo dotted-path match against an array field is an
 * implicit `$elemMatch` on that one field, so this needs no `$elemMatch` or
 * `.0.exists` alongside it — the match itself proves an element exists).
 */
export function buildOneTimePurchaseAudienceFilter(options?: {
  qualifiedSince?: Date;
}): FilterQuery<IUser> {
  return {
    isActive: true,
    $or: notCurrentlyActiveSubscriberOr(),
    ...(options?.qualifiedSince
      ? { "oneTimePackages.purchaseDate": { $gte: options.qualifiedSince } }
      : { "oneTimePackages.0": { $exists: true } }),
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
 *
 * Qualifying instant: `endedAt` — `verified` (`CancellationFlowService.recordOutcome`,
 * `src/services/subscription/CancellationFlowService.ts:144-167`) sets
 * `endedAt: now` in the SAME `$set` as `outcome`, for every terminal outcome,
 * and `recordOutcome` is the only writer of `outcome: "cancelled"` anywhere in
 * this codebase (confirmed by grep). So `endedAt` is reliably the exact
 * instant the cancellation was committed — not `startedAt` (flow entry, which
 * can precede the commit by as long as the customer takes to decide) and not
 * `createdAt`/`updatedAt` (document bookkeeping, not the domain event).
 * Unlike the other two builders, this filter is intentionally NOT date-scoped
 * here — `BonusCodeAudienceService` pulls every `(userId, endedAt)` pair once
 * (`$group` by `userId`, `$max` of `endedAt`) and buckets in application code,
 * because the population then needs a second, User-side eligibility pass this
 * collection cannot express on its own (see step 2 below).
 */
export const CANCEL_CLICK_FLOW_EVENT_FILTER = { outcome: "cancelled" } as const;

/**
 * cancel-click -> BACKIN200, step 2 of 2. Narrows the committed-cancellation
 * user ids down to accounts that have not since RESUBSCRIBED — using
 * `hasNotResubscribedOr` (autoRenew), never `notCurrentlyActiveSubscriberOr`
 * (isActive) — see that function's doc comment for why the distinction is
 * load-bearing here. A member who genuinely came back no longer needs winning
 * back, and the owner's ask was specifically "the numbers that can renew";
 * a member still finishing out a cancelled period very much still does.
 */
export function buildCancelClickUserFilter(
  userIds: mongoose.Types.ObjectId[]
): FilterQuery<IUser> {
  return {
    _id: { $in: userIds },
    isActive: true,
    $or: hasNotResubscribedOr(),
  } as FilterQuery<IUser>;
}

// ─── ISSUANCE STATE — the PRIMARY view (2026-09-01) ────────────────────────
//
// "Those who already minted it... already have access to it... and who
// redeemed." Three exhaustive, non-overlapping buckets over a campaign's
// `RedeemableIssuance` rows, every row landing in exactly one:
//
//   redeemed            — status === "redeemed"
//   stillRedeemable     — status === "active" AND this row's own window is
//                         still open AND the CAMPAIGN itself is still
//                         redeemable (isCampaignRedeemable — never hand-rolled)
//   expiredOrLapsed     — everything else: status === "expired", status ===
//                         "cancelled", a status === "active" row whose own
//                         window has closed, OR (when the campaign itself is
//                         no longer redeemable) EVERY non-redeemed row
//                         regardless of its own window — matching
//                         `isCampaignRedeemable`'s own precedence, where an
//                         inactive/ended campaign overrides a per-row deadline.
//
// `campaignRedeemable` is evaluated ONCE per campaign via
// `isCampaignRedeemable(campaign, now)` (`@/utils/redeemables/bonus-code-policy`)
// and threaded into `buildExpiredOrLapsedIssuanceFilter` — never re-derived
// here. That is the exact hand-rolled-copy mistake fixed on this branch at
// `d9350a23` (see docs/rewards-redeemables/rules.md R12): a second, partial
// reimplementation of campaign redeemability drifted from the real one and
// showed 188 members an enabled Claim button the server would refuse.
//
// purchaseRequirement / redeemedEverAt are DELIBERATELY not folded in here —
// `verified` in production 2026-09-01: all three trigger campaigns carry
// `purchaseRequirement: "none"`, so `hasQualifyingPurchase` always passes and
// adding it would be dead code; `redeemedEverAt` only diverges from `status`
// on a refunded-then-restored row, which cannot coexist with `status:
// "active"` under normal operation. If a future campaign sets a real
// `purchaseRequirement`, this predicate would need `hasQualifyingPurchase`
// added — flagged here so it is not silently wrong later.

/** "Still redeemable" — this row's own half of the check. Campaign redeemability
 *  is a SEPARATE, single evaluation (see module comment above), not folded in
 *  here, because it is a per-CAMPAIGN fact, not a per-issuance Mongo clause. */
export function buildStillRedeemableIssuanceFilter(
  campaignId: mongoose.Types.ObjectId,
  now: Date
): FilterQuery<IRedeemableIssuance> {
  return {
    campaignId,
    status: "active",
    expiresAt: { $gt: now },
  } as FilterQuery<IRedeemableIssuance>;
}

export function buildRedeemedIssuanceFilter(
  campaignId: mongoose.Types.ObjectId
): FilterQuery<IRedeemableIssuance> {
  return { campaignId, status: "redeemed" } as FilterQuery<IRedeemableIssuance>;
}

/**
 * Everything issued that is neither still-redeemable nor redeemed. Must stay
 * the exact logical complement of the other two filters over `{ campaignId }`
 * — see the reconciliation test (`issuedCount === stillRedeemableCount +
 * redeemedCount + expiredOrLapsedCount`) in `bonus-code-audience.test.ts`.
 */
export function buildExpiredOrLapsedIssuanceFilter(
  campaignId: mongoose.Types.ObjectId,
  now: Date,
  campaignRedeemable: boolean
): FilterQuery<IRedeemableIssuance> {
  if (!campaignRedeemable) {
    // The campaign itself is done (inactive, not yet started, or past its
    // legacy endsAt) — every non-redeemed row is lapsed, regardless of its
    // own per-row window, matching isCampaignRedeemable's own precedence.
    return { campaignId, status: { $ne: "redeemed" } } as FilterQuery<IRedeemableIssuance>;
  }
  return {
    campaignId,
    $or: [{ status: "expired" }, { status: "cancelled" }, { status: "active", expiresAt: { $lte: now } }],
  } as FilterQuery<IRedeemableIssuance>;
}
