# Rewards-Redeemables — Frontend

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
