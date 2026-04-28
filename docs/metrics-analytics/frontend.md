# Metrics-Analytics — Frontend

## Hooks

See [architecture.md](./architecture.md#hooks) — `useUserMetrics`, `useDailyUserMetrics`, `useMetricsFormatting`, `useUserMajorDrawComparison`.

## Dashboard helpers

- [src/utils/dashboard-entry-hold.ts](../../src/utils/dashboard-entry-hold.ts) — entry-hold UX state
- [src/utils/dashboard-landing-session.ts](../../src/utils/dashboard-landing-session.ts) — landing-session UX state

## Pages

The actual dashboard pages live under [dashboard-account](../dashboard-account/) (`/my-account/`).

## State conventions

- TanStack Query for metric reads
- Formatting via `useMetricsFormatting` (so display is consistent)
