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

## Formatter reference (`src/utils/metrics/formatters.ts`)

| Function | Signature | Output examples |
|---|---|---|
| `formatCurrency` | `(amount, currency?)` | `$1,234.56` (AUD Intl) |
| `formatPercentage` | `(value, decimals?)` | `12.3%` |
| `formatPercentageOrDash` | `(value, denominator, decimals?)` | `12.3%`, or `—` when `denominator <= 0` |
| `formatNumber` | `(value)` | `1,234` (en-AU Intl) |
| `formatROAS` | `(roas, decimals?)` | `4.50x` |
| `formatPercentageChange` | `(percentage, decimals?)` | `+5.2%` / `-3.1%` |
| `fmtCompact` | `(value)` | `$4.22M`, `$214.8k`, `$820`, `-$1.5k` |

`fmtCompact` is a compact AUD money formatter for chart axes and KPI totals. It handles negative values with a leading minus sign before the `$`. All formatters are re-exported from `useMetricsFormatting` for consistent display across components. Test: `npm run test:fmt-compact`.

### `formatPercentageOrDash` — use it for any rate that can have no denominator (2026-07-31)

Rates are computed server-side as `denominator > 0 ? (n / d) * 100 : 0`, so a bucket with **no**
denominator reaches the UI as the number `0` and `formatPercentage` renders it `0.0%`. That is a
false statement rather than a neutral one, and it shipped: a Page Analytics channel with traffic
but zero registrations displayed `S→C 0.0%` — asserting that none of its signups converted —
while the adjacent Conversions cell showed a non-zero count. "No signups yet" and "signups that
never converted" are different facts and must not share a rendering.

Pass the **denominator**, not a precomputed boolean, so a caller cannot forget the guard:

```tsx
formatPercentageOrDash(row.signupToConversionRate, row.signups)   // "—" when signups === 0
formatPercentageOrDash(row.visitToSignupRate, row.visits)
formatPercentageOrDash(row.builderToSignupRate, row.builders)     // build tables: builders, not visits
```

Watch the denominator when copying a cell between tables: the per-combination and per-toolbox
build tables are denominated in `builders`, not `visits`, and a blanket find-and-replace across
the Page Analytics tables initially got that wrong (caught by `tsc`, because the row types
genuinely have no `visits` field). Em dash `—` is this repo's existing convention for an
undefined rate.

## User breakdown components (admin)

[src/components/admin/metrics/users/](../../src/components/admin/metrics/users/) — `AgeBreakdown(Table)`, `StateBreakdown(Table)`, `ProfessionBreakdown(Table)`, `MembershipPackageBreakdown(Table)`. See [admin/frontend.md](../admin/frontend.md#chart-mode) for how they're composed in `UserMetricsView` (toggle) vs `UsersBreakdownSection` (dashboard overview).

Cross-cutting conventions for the four user-breakdown components:

- **Dominant-bucket exclusion** — Age, State and Profession breakdowns each split out a single "dominant" bucket (`Unknown` for Age/State, `Other` for Profession) and render it as a small header note (`<bucket> excluded: N (P% of all)`) instead of as a row/bar. This prevents an outlier bucket — typically the long tail of users with missing data — from dwarfing the meaningful cohorts in the chart and flattening the visible bars. The footer/total reflects only the visible (non-excluded) rows so the visible percentages sum to 100%.
- **`bare` prop (tables only)** — `AgeBreakdownTable`, `StateBreakdownTable`, `ProfessionBreakdownTable` accept `bare?: boolean` (defaults `false`). When `true`, the outer card chrome (rounded-xl, shadow, border, padding) is dropped so the table can sit flush inside a parent container without doubling up cards. Used by `UsersBreakdownSection` (the dashboard overview already wraps everything in a `DashboardSection` card); not used by `UserMetricsView` (each table keeps its own card per the chart-vs-table toggle design).
- **Density** — body text is `text-xs` with `py-1.5 px-2` cell padding; headers use a single border line (no double border) and a translucent grey row to keep the table compact.
