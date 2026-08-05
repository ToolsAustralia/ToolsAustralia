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
| `usePrizeCatalog()` | Serves the lightweight `PrizeSummary` catalog (from `@/config/prize-summaries`, 2026-07-20 — NOT the deep spec entries; see [config-and-data architecture](../config-and-data/architecture.md)) | [src/hooks/usePrizeCatalog.ts](../../src/hooks/usePrizeCatalog.ts) |
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

> **2026-07-19 route-class note:** this domain's public page(s) under `src/app/(site)/` are **nonce-CSP route class** — they must render per-request. The blanket layout `force-dynamic` was removed site-wide, so the page now carries its own explicit dynamic declaration (directly, or via the `page.tsx` server shim + `page-client.tsx` pattern when the page is a client component — segment config is ignored in "use client" files). Do not remove it; see docs/security-csp/architecture.md "Route classes".

## 2026-07-20 — Tier-2 perf: Poppins codemod

Components in this domain were touched by the sitewide `font-'[Poppins]'` → `font-poppins`
codemod (`npm run sweep:font-poppins`). Their Poppins-classed text now renders **real Poppins**
instead of a browser fallback — an intended visual change. Details + rules:
docs/shared-ui/tailwind-conventions.md §10.

## Spotlight storage now serves two features (2026-08-01)

[`src/utils/rewards-widget-spotlight-storage.ts`](../../src/utils/rewards-widget-spotlight-storage.ts)
started as one-time-per-account storage for the rewards floating widget. It now holds two
independent pairs:

| Feature | Key | Read by |
|---|---|---|
| Rewards floating widget | `rewardsWidgetSpotlightSeen_${userId}` | `RewardsFloatingWidget` |
| Partner-catalogue nav dot | `partnerCatalogueSpotlightSeen_${userId}` | `my-account/components/PartnerCatalogueSpotlight` |

**Separate keys on purpose.** A member who dismissed the widget long ago must still be shown the
partner catalogue, which did not exist then — sharing one "seen" flag would silently suppress
every future feature nudge for the longest-standing members, who are exactly the ones worth
telling. Any third nudge should add its own pair rather than reuse either.

Both prefixes are registered in [`utils/auth/total-sign-out.ts`](../../src/utils/auth/total-sign-out.ts);
a per-user "seen" flag that survives sign-out hides the feature from the next member on a shared
device. Behaviour and the reduced-motion gate: [dashboard-account/frontend.md](../dashboard-account/frontend.md).

## Spotlight storage now also backs the Discounts nav badge (2026-08-05)

[`src/utils/rewards-widget-spotlight-storage.ts`](../../src/utils/rewards-widget-spotlight-storage.ts)
gained a third marker, `hasSeenDiscountNavNudge` / `markDiscountNavNudgeSeen`, for the "new"
badge on the header's **Discounts** item (`/discount`). It lives beside the rewards-widget and
partner-catalogue spotlights because it is the same mechanic; it is a **separate key** for the
same reason those two are separate — features must be retirable independently, and someone who
dismissed one should still be shown a surface that did not exist then.

Two differences from its siblings, both deliberate:

- **`userId` is nullable.** `/discount` is a public page, so the visitor most worth nudging has
  no account. Signed-out visitors share a `guest` bucket (`discountNavNudgeSeen_guest`);
  signing in moves them to their own key, so the badge fires once more for the same person as a
  member. That re-fire is intended — the page means something different once you have an access
  level to measure against.
- **The write is wrapped in try/catch.** It runs from a nav click handler, where a private-mode
  `QuotaExceededError` would otherwise throw inside navigation. A cosmetic repeat of the badge
  is a far better failure than a broken menu.

The `discountNavNudgeSeen_` prefix is registered in
[`utils/auth/total-sign-out.ts`](../../src/utils/auth/total-sign-out.ts) — see
[docs/auth/gotchas.md](../auth/gotchas.md). Consumed by
[`useNavNudges`](../../src/hooks/useNavNudges.ts); behaviour and the news-vs-status distinction
are documented in [docs/shared-ui/frontend.md](../shared-ui/frontend.md).
