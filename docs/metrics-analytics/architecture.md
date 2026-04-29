# Metrics-Analytics — Architecture

## Layers

| Layer | Path |
|---|---|
| Services | [src/services/metrics/](../../src/services/metrics/), [src/services/analytics/](../../src/services/analytics/) |
| Utils | [src/utils/metrics/](../../src/utils/metrics/) |
| Schemas | [src/schemas/metrics/](../../src/schemas/metrics/) |
| Models | [src/models/LandingPageMetricsDaily.ts](../../src/models/LandingPageMetricsDaily.ts) |

## Data flow

```
Raw events (PaymentEvent, MembershipRenewalCycle, MembershipStatusHistory, etc.)
                    │
                    ▼
        Daily aggregation (cron / scheduled)
                    │
                    ▼
        LandingPageMetricsDaily (materialised)
                    │
                    ▼
        Dashboard hooks read this for fast UI
```

## Hooks

| Hook | Source |
|---|---|
| `useUserMetrics()` | [src/hooks/useUserMetrics.ts](../../src/hooks/useUserMetrics.ts) |
| `useDailyUserMetrics()` | [src/hooks/useDailyUserMetrics.ts](../../src/hooks/useDailyUserMetrics.ts) |
| `useMetricsFormatting()` | [src/hooks/useMetricsFormatting.ts](../../src/hooks/useMetricsFormatting.ts) |
| `useUserMajorDrawComparison()` | [src/hooks/useUserMajorDrawComparison.ts](../../src/hooks/useUserMajorDrawComparison.ts) |

## Dashboard helpers

[src/utils/dashboard-entry-hold.ts](../../src/utils/dashboard-entry-hold.ts), [src/utils/dashboard-landing-session.ts](../../src/utils/dashboard-landing-session.ts) — UX-side helpers for the dashboard.

## Membership snapshot dispatch (added 2026-04-29)

The admin dashboard's membership-related cards (KPI Membership Statuses, per-package breakdown, Cancellations card, Lifecycle chart) read **point-in-time** counts when the selected date range ends in the past.

`parseAdminDashboardDateRange` ([src/utils/admin/dashboardDateRange.ts](../../src/utils/admin/dashboardDateRange.ts)) computes:
- `membershipAsOfMode = "live"` when the range ends today, in the future, or covers all time.
- `membershipAsOfMode = "snapshot"` and `asOfDate = end of the range's last day in Australia/Sydney` otherwise.

Three routes dispatch on this:

| Route | Standing reads switch on `mode` | Range-delta reads stay live |
|---|---|---|
| `/api/admin/dashboard/membership-by-package` | All counts | — |
| `/api/admin/dashboard/stats` | `totalScheduledCancellation`, `cancellationImpact.estimatedMonthlyRevenue` | `cancelledMemberships` (cancellations IN range), all renewal range counts, `periodChurnRate` |
| `/api/admin/metrics/users` | `membershipStatus.{active, cancelled, pastDue}` (Lifecycle chart standing buckets) | `membershipStatus.renewed` (range delta from PaymentEvent) |

Snapshot reads return `summary.snapshotMissing: true` and fall back to live counts when no snapshot row exists for the queried date — for example, any date before the cron's first successful run. The dashboard UI surfaces this via `MembershipBreakdownSection.snapshotLabel` ("Showing live counts (snapshot unavailable for this date)").

The KPI card title also flips dynamically — `Membership Statuses (as of MMM d)` when in snapshot mode, plain `Membership Statuses` otherwise.

See [docs/subscription/architecture.md](../subscription/architecture.md) for the snapshot writer (cron + health endpoint) and [docs/subscription/models.md](../subscription/models.md) for the `MembershipDailySnapshot` schema.

## Migrated from

- `docs/METRICS_DATA_SOURCES.md` — _TODO: read & merge_
- `docs/DATA_SOURCES_EXPLANATION.md` — _TODO: read & merge_
