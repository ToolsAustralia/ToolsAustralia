# Dashboard-Account — Architecture

## Pages

- `src/app/(site)/my-account/` — main account area

## Components

- [src/app/(site)/components/LandingPageTrigger.tsx](../../src/app/(site)/components/LandingPageTrigger.tsx) — triggers landing-page experiences

## Hooks

| Hook | Purpose | Source |
|---|---|---|
| `useDashboardEntryDisplay()` | Entry display logic | [src/hooks/useDashboardEntryDisplay.ts](../../src/hooks/useDashboardEntryDisplay.ts) |
| `useDashboardLandingOrchestration()` | Coordinates landing-page experience | [src/hooks/useDashboardLandingOrchestration.ts](../../src/hooks/useDashboardLandingOrchestration.ts) |

## Data sources

The dashboard reads from many feature domains:
- [subscription](../subscription/) — membership status, package, renewal
- [payment](../payment/) — saved payment methods
- [draws](../draws/) — entry counts, participation
- [rewards-redeemables](../rewards-redeemables/) — wallet, redemptions
- [metrics-analytics](../metrics-analytics/) — user metrics, daily stats

This domain is the **consumer view**, not a feature owner. Most logic lives in the source domains.

## `gender` reaches the client via the projection (2026-08-17)

`MY_ACCOUNT_USER_FIELDS` in [my-account-projection.ts](../../src/utils/dashboard/my-account-projection.ts) is an explicit **include-list**, so a new `User` field is invisible to the account UI until it is added there. `gender` was added for the Settings → Profile tab.

This is the same include-list guarded by `npm run test:my-account-projection` (bans wire-bloat arrays and auth secrets); `gender` is a short scalar and passes. It also flows to `UserContext` → `useUserQueries.UserData`, which is what makes gender available to Meta browser Advanced Matching without a second fetch.
