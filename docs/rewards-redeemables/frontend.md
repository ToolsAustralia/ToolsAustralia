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

## State conventions

- TanStack Query for wallet reads.
- Toast notifications via the entry-reward-toast hook (debounced).
- Spotlight state in localStorage (per-user, per-feature dismissal tracking).
