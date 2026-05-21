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
