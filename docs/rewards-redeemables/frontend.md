# Rewards-Redeemables — Frontend

## Locked-coupon unlock flow — purchase with the code carried (2026-07-06)

A **purchase-required coupon the user does NOT yet qualify for** (`isRedeemableNow: false`,
`purchaseRequirement !== "none"`) is now an actionable **Unlock CTA** on the dashboard rewards claimables
sheet (`RewardsClaimables` `onUnlock` prop, wired by `my-account/rewards/page.tsx` `onUnlockCoupon`),
opening the qualifying-purchase flow **with the coupon code carried** (freeze-gated via
`whenGatesOpenElseGateModal`):

- **`membership`-required** → the membership join flow (`membershipModal.openModal()` — membership
  packages) + the code sent via the `openMembershipModal` prefill event. Label: "Join to unlock".
- **`one-time` / `any`-required** → one-time packages: members with additional access get
  `requestModal("special-packages", { initialCouponCode })` (true auto-apply); everyone else gets the
  MembershipModal **one-time** flow (`openWithOneTimePlan()`) + the prefill event — `SpecialPackagesModal`
  renders `null` without additional access, and the locked cohort is usually exactly that cohort. Label:
  "Purchase to unlock".

**MembershipModal now AUTO-APPLIES codes arriving via the prefill event** (`pendingAutoApplyCode` one-shot
effect → `handleCouponApply("auto")`, mirroring SpecialPackagesModal's `initialCouponCode`). Previously the
event only prefilled the input with `couponApplied=false` — paying without a manual Apply click carried NO
code, so the coupon was never redeemed. After payment the webhook redeems the coupon off the qualifying
purchase (`checkAndRedeemCampaign` → `RedemptionService`, gate: `hasQualifyingPurchase`).

**Qualified** purchase-required coupons (`isRedeemableNow: true`) claim/redeem **directly** on every surface —
the gate is already satisfied. The legacy `/rewards` wallet's amber "Unlock" button for qualified items was a
silent no-op (`onRequirePurchase` was never passed by any call site) and is removed; those items now show the
normal Redeem button. `RewardsFloatingWidget` (unmounted since the dashboard revamp) retains the old inverted
gating — if ever remounted, port this flow first.

Known edge (flagged, not built — product decision): **mini-draw purchases never satisfy `one-time`/`any`**
(`hasQualifyingPurchase` reads only `oneTimePackages`; mini purchases persist to `miniDrawPackages`), yet the
modal doesn't block a campaign code on a mini pack — the webhook redeem then fails silently (warn-only).
Also: `neverExpires` campaigns with a stale `endsAt` stay active but one-time purchases after `endsAt` never
qualify (window ceiling is `endsAt` when present).

## Pages

- `src/app/(site)/rewards/` — main rewards page; user wallet view + redeem CTAs

## Hooks

| Hook | Purpose | Source |
|---|---|---|
| `usePrizeCatalog()` | Fetches the prize catalog for display | [src/hooks/usePrizeCatalog.ts](../../src/hooks/usePrizeCatalog.ts) |
| `useEntryRewardToast()` | Shows a toast when a user gets a reward via draw/campaign | [src/hooks/useEntryRewardToast.ts](../../src/hooks/useEntryRewardToast.ts) |

## Helpers

- [src/lib/rewardsGuard.ts](../../src/lib/rewardsGuard.ts) — gates whether a user can see/use rewards (paused, ineligible, etc.)
- [src/utils/rewards-widget-spotlight-storage.ts](../../src/utils/rewards-widget-spotlight-storage.ts) — localStorage helper for "you've seen this spotlight" UX

## Package tier swap in RewardsRedemption

`RewardsRedemption.tsx` applies the same mini-draw swap rule as the major-draw catalog:
- `hasAccess=false` (guest / no subscription / no current draw entries) → `getMiniDrawPackagesForViewer(false)` → Mini Pack 1–3.
- `hasAccess=true` (active subscription OR current draw entries) → `getMiniDrawPackagesForViewer(true)` → the five `additional-*-pack-mini` records.

`hasAccess` is derived via `hasAdditionalPackageAccess(user, userMajorDrawStats)` (same helper as the major-draw catalog). The `miniDrawPackages` useMemo is placed after the `useUserMajorDrawStats` call and the `hasAccess` derivation so it can depend on both.

## State conventions

- TanStack Query for wallet reads.
- Toast notifications via the entry-reward-toast hook (debounced).
- Spotlight state in localStorage (per-user, per-feature dismissal tracking).

## className conventions (2026-05-08)

Rewards components use `cn()` from `@/utils/cn` for conditional class composition. The `sweep-classname-template-literals` codemod (Plan 5 Phase 2) converted template-literal `className={`...`}` patterns to `className={cn(...)}`. Use `cn()` rather than template literals when adding new conditional classes.
