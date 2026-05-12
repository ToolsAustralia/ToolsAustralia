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

## User breakdown components (admin)

[src/components/admin/metrics/users/](../../src/components/admin/metrics/users/) — `AgeBreakdown(Table)`, `StateBreakdown(Table)`, `ProfessionBreakdown(Table)`, `MembershipPackageBreakdown(Table)`. See [admin/frontend.md](../admin/frontend.md#chart-mode) for how they're composed in `UserMetricsView` (toggle) vs `UsersBreakdownSection` (dashboard overview).

Cross-cutting conventions for the four user-breakdown components:

- **Dominant-bucket exclusion** — Age, State and Profession breakdowns each split out a single "dominant" bucket (`Unknown` for Age/State, `Other` for Profession) and render it as a small header note (`<bucket> excluded: N (P% of all)`) instead of as a row/bar. This prevents an outlier bucket — typically the long tail of users with missing data — from dwarfing the meaningful cohorts in the chart and flattening the visible bars. The footer/total reflects only the visible (non-excluded) rows so the visible percentages sum to 100%.
- **`bare` prop (tables only)** — `AgeBreakdownTable`, `StateBreakdownTable`, `ProfessionBreakdownTable` accept `bare?: boolean` (defaults `false`). When `true`, the outer card chrome (rounded-xl, shadow, border, padding) is dropped so the table can sit flush inside a parent container without doubling up cards. Used by `UsersBreakdownSection` (the dashboard overview already wraps everything in a `DashboardSection` card); not used by `UserMetricsView` (each table keeps its own card per the chart-vs-table toggle design).
- **Density** — body text is `text-xs` with `py-1.5 px-2` cell padding; headers use a single border line (no double border) and a translucent grey row to keep the table compact.
