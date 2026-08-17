# Rewards-Redeemables — Gotchas

## Membership Streak auto-grant path (P2, 2026-07-07)

- **Auto-grant is two-step, crash-safe by sweep, and COMPENSATES on delivery failure (2026-07-15)**: `checkAndIssueMilestones` creates the issuance `active`, then `RedemptionService.autoRedeemMilestoneIssuance` flips it `redeemed` atomically (the concurrency gate) and grants via `DrawGrantService(…, "streak", { skipMilestoneCheck: true })`. `grantMonthlyCouponEntries` now returns a boolean — `false` = no target draw (freeze window); persistence errors (VersionError on the hot draw doc) throw. On EITHER failure autoRedeem reverts the wallet `$inc` + history row, re-opens the issuance (`redeemed → active`), and the next check (payment webhook or nightly cron) retries delivery. The issuance is re-opened ONLY if the wallet revert succeeded (otherwise a retry would double-count); on that double-fault it stays `redeemed` with a loud `console.error`. Never delete the sweep branch or the compensation ordering.
- **New streak issuances are PAYMENT-COUPLED (2026-07-15)**: `checkAndIssueMilestones` only creates `streak-months` issuances when called with `{ allowStreakIssuance: true }` — passed ONLY by the paid-payment path (`payment-processing.ts`). The cron/mass evaluator and post-grant re-checks run with the default false: they can still SWEEP (re-deliver) existing active streak issuances but never newly issue from a possibly-stale `streakMonths` (lapsed member's counter, rung activated after the fact). This replaces the spec's cron circuit-breaker for the streak vector.
- **Legacy issuance rows must be generation-stamped before the index swap**: pre-streak `MilestoneIssuance` rows have no `streakGeneration`; Mongo's `{streakGeneration: 1}` query does NOT match missing fields, so unstamped rows are invisible to the dedupe query AND the generation-scoped unique index — every pre-launch issuance would re-issue (double-grant). `seed:streak-rewards` stage 1 stamps `streakGeneration: 1` onto them before `syncIndexes()`.
- **E11000 in the rung loop = "already issued", continue.** Three callers race (payment webhook, nightly cron, post-grant re-check); the generation-scoped unique index is the guarantee. An uncaught duplicate-key throw would abort the user's remaining rungs.
- **`skipMilestoneCheck` prevents re-entrancy** (grant → check → grant …) and streak-granted entries are **excluded from the `entries-gained` metric** in `MilestoneEvaluator` (free entries never compound into more free entries).
- **`totalEntriesGranted` semantics changed (P2):** it now sums **redeemed** issuances only (was: all rows, which would have counted zero-granted `backfilled` markers and unclaimed/expired issuances as "granted"). `issuedCount` excludes `backfilled`.
- **The claim wallet excludes `backfilled`** (`RedeemablesWalletService` filters `status ≠ backfilled`) — markers belong on the milestone ladder, not the claim list.
- **Streak reversal targets the `streak` bucket**: `unredeemMilestoneRedemption` picks the draw source by `milestoneType` — do not hardcode `bonus-entry-promo` back in.
- **Launch order is load-bearing (updated 2026-07-15)**: 1) `npx tsx scripts/backfill-membership-streaks.ts --live --roundup-incomplete` (P1 counters; round-up flag is LAUNCH-ONLY) → 2) `seed:streak-rewards` (generation stamp + index swap + rungs `isActive:false` + markers) → 3) `seed --live --activate` → 4) flip `DASHBOARD_FEATURES.loyaltyStreak`/`milestoneProgress` to true and deploy (the UI ships DARK so it never promises grants that aren't active). Activating before markers exist mass-grants historical rungs; showing the UI before activating stiffs members whose rung lands in the dark window (markers stamp it as pre-launch).

## Purchase gate: every leg is an EVENT check, never a state check (2026-07-07)

`hasQualifyingPurchase`'s `membership` leg used to be `subscription.isActive === true` — a STATE check. For
any campaign targeting `all-active-subscribers` with requirement `membership` or `any`, the gate was
tautological: every recipient could claim instantly with zero purchase (found via the owner's `testpurchase`
coupon — `purchaseRequirement: "any"`, redeemed 3 seconds after issuance). Now `membership` requires the
subscription to have been **purchased inside the campaign window** (`subscription.startDate` ∈
`[startsAt, endsAt|now]` — startDate is set on join/resubscribe, both charged). The intended flow for
EXISTING members is carrying the code **on** a purchase (one-time pack for `one-time`/`any`) — the webhook
redeems via this same predicate right after the purchase persists. Lockstep holds: `RedemptionService` (burn)
passes the full user doc; `RedeemablesWalletService` (isRedeemableNow) selects the full `subscription`
subdoc, so `startDate` flows to both. Known caveats (accepted, documented): a **downgrade** also resets
`startDate` without a charge (member-initiated, rare); a `membership`-required campaign targeted at existing
members is a config smell — they can't buy a second membership, so it's effectively a join-campaign
requirement. Regression-tested: `npm run test:redeemables-purchase-gate` (19 assertions incl. the
existing-member cases).

## Campaign audience: pins are authoritative; empty pin list = NOBODY (2026-07-06)

The audience predicate exists **twice** — cron path (`TargetingService.resolveTargetUserIds` → `resolveManualUsers`)
and lazy wallet-fetch path (`CampaignService.isUserEligibleForCampaign`, called via
`ensureActiveCampaignIssuancesForUser` on every wallet read; **the lazy path is the dominant gate in practice**).
Any semantics change must be applied to BOTH. Two divergences were found + fixed (2026-07-06):

1. **Empty-pin fallback (critical):** `manual-users`/`csv-users` with an empty `segmentConfig.includeUserIds`
   lazily issued to the **entire active-subscriber base** (`return hasActiveSubscription` fallback), while the
   cron issued to nobody. Now: empty pins ⇒ eligible for **no one**, and both the create route (zod
   `superRefine`) and `CampaignService.updateCampaign` (merged-state guard — PUT is partial, so it validates
   `payload ?? existing`) reject a manual/csv campaign without pins.
2. **Pinned non-subscribers were silently dropped:** the cron required `subscription.isActive` on manual
   resolution and the lazy path required `hasActiveSubscription` even for pinned users — yet the admin picker
   explicitly offers `subscriptionStatus: "inactive" | "any"`, and dynamic-segment pins already bypassed the
   check. Now **pins work regardless of subscription status in both paths** (deactivated accounts,
   `isActive: false`, stay excluded).

Known-but-unbuilt (flagged, not fixed): campaign edits don't propagate to issued coupons (`expiresAt` copied at
issue time; no revoke machinery — nothing ever sets issuance `status: "cancelled"`); the
`requiresRecentPurchaseDays` knob exists in the model/zod but is evaluated nowhere; `/api/redeemables/status`
returns every active campaign's shared code to any authed user regardless of targeting (not redeemable without
an issuance, but leaks existence); redeem-by-code never auto-issues (in-audience user gets `campaign_not_found`
until a wallet fetch materializes their issuance).

## Pause behaviour

(Migrated from `docs/rewards-pause.md`.)

> _TODO: read root file and merge._

Brief: when a user is "rewards-paused" (abuse handling), `rewardsGuard.ts` blocks new issuance and redemption but leaves existing wallet contents intact. Admin can revoke individually if needed.

## Prize catalog

(Migrated from `docs/prize-catalog.md`.)

> _TODO: read root file and merge._

## Already-redeemed reversal

When refunding a payment that issued redeemables, redeemed issuances do **not** survive: `MilestoneService.revokeIssuancesFromPaymentEvent` un-redeems a redeemed issuance first (clawing back its granted entries and draw entries via `RedemptionService.unredeemMilestoneRedemption`) and then sets `status: "revoked"`. A monthly coupon redeemed on the refunded purchase is auto-un-redeemed back to `active`. `RefundProcessed.data.reversalIssues[]` holds only the reversal steps that **failed** — those are what an admin must manually adjudicate; it is not a list of surviving redeemed grants.

## Lifetime `accumulatedEntries` is NOT a purchase proxy (fixed money-path bug)

Purchase-gated coupons (`purchaseRequirement` other than `"none"`) must be unlocked only by a **real qualifying purchase inside the campaign window** — checked via `hasQualifyingPurchase(...)` in [purchase-eligibility.ts](../../src/utils/redeemables/purchase-eligibility.ts).

Previously `RedemptionService.redeem()` used lifetime `user.accumulatedEntries === 0` (plus any active subscription) as a "has purchased" proxy. That granted "buy to unlock" coupons **for free** to any past purchaser, and to any active subscriber even when the requirement was `"one-time"`. Fixed: redeem now selects `oneTimePackages` and calls `hasQualifyingPurchase(...)`; the wallet's `isRedeemableNow` mirrors it exactly.

Two things to keep true:
- The qualifying-purchase floor is the campaign `startsAt` (a purchase made *during* the campaign), never lifetime history. Window bounds are inclusive of both `startsAt` and `endsAt`; a `neverExpires` campaign uses `now` as the ceiling.
- `redeem()` and `isRedeemableNow` must use the **same** predicate. If they drift, the "Claim" button and the endpoint disagree — a claimable-looking coupon 500s/`ineligible`s on submit, or a hidden coupon is still redeemable via the API.

**Wallet view buckets** (`getUserWallet` status filter, consumed by `RewardsClaimables`): a purchase-locked coupon is still `active` and unexpired, so `status: "claimable"` returns it (rendered as a disabled **"Purchase to unlock" / "Members only"** row — the Claim button gates on `isRedeemableNow`), and `status: "past"` is **terminal-only** (`status !== "active"` OR past expiry). Do NOT define "past" as `!isRedeemableNow` — that would mislabel a locked-but-active coupon as "recently claimed". The home rewards-count badge counts only `isRedeemableNow` items so it never overstates what can be claimed now.

## Top-percentile timing

`topMajorDrawPercentile.ts` queries draw participation. If run too early in the cycle (e.g. during `active` status), the percentile is incomplete. Best to run after `frozen` transitions. _TODO: verify whether the campaign scheduler enforces this._

## Cancellation upsell eligibility

`cancellation-upsell-eligibility.ts` decides who sees the cancel-upsell offer based on:
- Recent redeemable issuance history
- Subscription state
- _TODO: enumerate the full eligibility rules_

Wrong eligibility → user sees offer they don't qualify for, or doesn't see one they should — both have CS implications.

## CSV import scale

CSV bulk import is admin-triggered. For very large lists (>10k users), consider chunked processing. _TODO: confirm whether chunking is implemented or if the route times out at scale._

## `DrawGrantService` writes a `shop: 0` it can never grant — 2026-08-17

The fresh-row `entriesBySource` literal in
[`DrawGrantService.ts`](../../src/services/redeemables/DrawGrantService.ts) includes `shop: 0`, but
`DrawGrantSourceKey` is still `"bonus-entry-promo" | "streak"` — **deliberately not widened**. This
service never grants merchandise entries; the zero exists only so a brand-new participant row
carries every bucket, otherwise the first reader of that row hits a missing key.

Do not "tidy" the apparent inconsistency by adding `"shop"` to `DrawGrantSourceKey`. That would let
a caller pass `"shop"` into `grantMonthlyCouponEntries`, which is not how merchandise entries are
meant to be issued. Nothing produces a `shop` entry anywhere today — the grant is a later task
gated on a trade-promotion permit variation.

The mirror-image list of buckets also lives in `MajorDrawService.zeroEntriesBySource()` (admin) and
`EntriesBySourceSchema` (Norm); a new bucket needs all three, plus the `oneTimeEntries` sums in
`major-draw-queries.ts`.

## Terminology: `isAdditional` (was `isMemberOnly`) — 2026-07-01

The package flag `isMemberOnly` was renamed to **`isAdditional`** across the codebase. It marks packages that require *additional-package access* — an **active subscription OR current major-draw entries** (see `hasAdditionalPackageAccess`), which is broader than subscribers; it was never truly "member-only". The internal `-member` UI id-suffix (a row disambiguator) is intentionally unchanged. Full rationale: [subscription/gotchas.md](../subscription/gotchas.md).
