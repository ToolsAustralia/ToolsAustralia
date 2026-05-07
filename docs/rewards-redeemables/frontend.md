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

## E2E test IDs

Added on `src/components/features/RewardsFloatingWidget.tsx`:

| testid | Element |
|---|---|
| `rewards-floating-widget` | The FAB (gift icon) button |
| `rewards-tab-claimable` | "Claimable" tab inside the drawer |
| `rewards-tab-past` | "Past Rewards" tab inside the drawer |
| `rewards-claim-button` | The in-card "Redeem" button (only when `purchaseRequirement === "none"` and `isRedeemableNow`) |

Specs under `e2e/rewards/`:

- `widget-visibility.spec.ts` — FAB renders on `/my-account`.
- `catalog.spec.ts` — drawer opens, tabs swap content.
- `claim-redeemable.spec.ts` — seeds a campaign + issuance via `getDb()`, clicks claim, asserts toast + DB state.
- `redeem-code.spec.ts` — narrowly verifies `/api/codes/validate` accepts a real campaign code and rejects bogus input. The endpoint validates only; redemption flows through `SpecialPackagesModal` / `MembershipModal`.
- `milestone-toast.spec.ts` — **BLOCKED/skipped**. `entry-reward-toast` only fires from client mutation `onSuccess` callbacks (mini-draw / major-draw / subscription renewal), not from any webhook side-effect. Deterministic reproduction would require a full purchase flow already covered elsewhere.

## RewardsFloatingWidget spotlight spec (added 2026-05-05)

`e2e/banners-widgets/rewards-widget-spotlight.spec.ts` (project: `chromium-fresh`) clears `localStorage` in `beforeEach` (via `addInitScript`) so the per-account `rewardsWidgetSpotlightSeen_<userId>` flag does not suppress the spotlight overlay. Navigates to `/my-account`, asserts the FAB mounts, and sniffs for the spotlight's screen-reader announcement (`"You have claimable rewards…"`). Tolerates the no-claimable-rewards branch — the fresh fixture has no seeded `RedeemableIssuance` so the spotlight typically remains dormant. Verifies the `seen` flag is still absent post-load (set only on tap/dismiss).
