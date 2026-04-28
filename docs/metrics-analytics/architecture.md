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

## Migrated from

- `docs/METRICS_DATA_SOURCES.md` — _TODO: read & merge_
- `docs/DATA_SOURCES_EXPLANATION.md` — _TODO: read & merge_
