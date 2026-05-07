# Dashboard-Account — Architecture

## Pages

- `src/app/(site)/my-account/` — main account area
- [`src/app/(site)/my-account/orders/page.tsx`](../../src/app/(site)/my-account/orders/page.tsx) — order history list (TanStack Query → `/api/orders`)
- [`src/app/(site)/my-account/orders/[orderNumber]/page.tsx`](../../src/app/(site)/my-account/orders/[orderNumber]/page.tsx) — order detail with status timeline + AusPost tracking link

## Components

- [src/app/(site)/components/LandingPageTrigger.tsx](../../src/app/(site)/components/LandingPageTrigger.tsx) — triggers landing-page experiences
- [`RecentOrdersWidget`](../../src/app/(site)/my-account/components/RecentOrdersWidget.tsx) — top-3 recent orders surfaced on the dashboard, links to `/my-account/orders` and per-order detail.

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
