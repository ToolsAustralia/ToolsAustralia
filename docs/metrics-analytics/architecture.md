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

## User-metrics utilities (added 2026-05-04)

Two pure utilities under [src/utils/metrics/](../../src/utils/metrics/) drive the user-metrics aggregation:

### `age-grouping.ts`

Exports `getAgeGroup(birthdate, asOf?)`, `AGE_GROUP_ORDER`, and the `AgeGroupLabel` type. Buckets are `18-24`, `25-34`, `35-44`, `45-54`, `55-64`, `65+`, `Unknown`.

- `Unknown` covers null/undefined birthdates, `NaN`-time Dates, future birthdates, and ages `< 18` (signup floor — anything younger is treated as dirty data).
- Age uses the **calendar method** (UTC year/month/day comparison). Never use millisecond division — that breaks across leap years and DST.
- `asOf` defaults to `new Date()`, so values reflect the user's age **today**, not their age at signup. Pass an explicit `asOf` only in tests.
- `AGE_GROUP_ORDER` is the single source of chronological order for chart/table rendering.

### `profession-normalize.ts`

Exports `normalizeProfession(raw)`, `bucketUnmatched(counts, topN=5)`, and the `PROFESSION_SYNONYMS` map (Readonly Record).

Normalization pipeline:

1. **Sanitize** — collapse whitespace, strip trailing punctuation.
2. **Synonym map** — Aussie trade nicknames and common typos fold into canonical labels (e.g. `sparky → Electrician`, `chippy/chippie/carpenter → Builder`, `brickie → Bricklayer`, `welda → Welder`, `concretor → Concreter`).
3. **Canonical match** — case-insensitive lookup against `PROFESSIONS` from [src/data/professions.ts](../../src/data/professions.ts).
4. **Plural-strip retry** — drop trailing `s` and re-run the synonym + canonical lookup.
5. **Title-case fallback** — return the cleaned input title-cased (gets bucketed downstream).

`bucketUnmatched` separates canonical labels (kept individually) from non-canonical ones; the top-N non-canonical entries (default 5) are kept by frequency and the long tail is summed into a single `"Other (custom)"` bucket.

> The dropdown choice **`"Other"`** (a real `PROFESSIONS` value) is preserved as a distinct canonical bucket — it is **not** the same as the rolled-up **`"Other (custom)"`** bucket produced by `bucketUnmatched`. Two different bars on the chart.

## `UserMetrics` shape additions (2026-05-04)

[src/types/metrics/UserMetrics.ts](../../src/types/metrics/UserMetrics.ts) gained these fields:

- `ageGroup: Record<AgeGroupLabel, number>` — per-bucket counts keyed by `AgeGroupLabel`.
- `state: Record<string, number>` — counts keyed by AU state/territory code (the eight valid codes accepted by `User.state`), plus an `Unknown` bucket for users with no recorded state. All valid codes are pre-seeded to `0` so empty cells still render.
- `membershipByPackage: MembershipPackageBreakdown[]` where `MembershipPackageBreakdown = { packageId, packageName, total, active, pastDue, cancelled }` — one row per `MembershipPackage` of `type === "subscription"`.

### Aggregation pipeline (in `UserMetricsService.getUserMetrics`)

- User documents are projected with `birthdate` and `state` selected so age and state-of-residence can be computed at read time.
- An `ageGroup` accumulator is initialised from `AGE_GROUP_ORDER` (every label starts at `0`, including `Unknown`).
- A `state` accumulator is initialised with all eight valid AU state codes set to `0` plus an `Unknown` bucket. Each user's `state` is uppercased and trimmed; any value not in the validator's allowlist (including `null`/empty) routes to `Unknown`.
- Each user's profession is routed through `normalizeProfession` before counting; the final `profession` map is then passed through `bucketUnmatched(profession, 5)` so the chart caps at canonical + top-5 unmatched + `"Other (custom)"`.
- A per-subscription-package counter is initialised from the `MembershipPackage` collection (filtered to `type === "subscription"`). Each user's subscription is then classified using the **same ladder** the flat `membershipStatus` aggregation uses, and the result is mirrored into the matching package's `{ active, pastDue, cancelled }` counts. This keeps `membershipByPackage` totals consistent with the standing `membershipStatus` rollup.

### Membership classification ladder

For each user with a `subscription` field, the service walks this ordered chain (first match wins) — both `membershipStatus` flat totals and `membershipByPackage` per-package counts use this same ladder:

1. **Scheduled cancel-at-period-end** → `cancelled`: `status` is `"active"`, `"trialing"`, or `"past_due"` **AND** `autoRenew === false` **AND** `endDate` is set.
2. **Past Due** → `pastDue`: `status === "past_due"` (and not matched above).
3. **Active** → `active`: `isActive === true` **AND** `status` is `"active"` or `"trialing"`.
4. **Legacy cancelled** → `cancelled`: `status === "canceled"` or `"cancelled"`.

> **Why trialing counts as active:** trialing users are paying-customers-in-grace and are counted as active by both the per-user "Active" badge ([src/components/admin/ui/AdminBadge.tsx](../../src/components/admin/ui/AdminBadge.tsx), which only checks `subscription.isActive`) and the dashboard "Membership by Package" KPI ([src/utils/admin/userFilterBuilder.ts](../../src/utils/admin/userFilterBuilder.ts), `ACTIVE_SUBSCRIPTION_STATUSES = ["active","trialing"]`). The metrics ladder must include `"trialing"` in branch 3 for the User Metrics view's "Active Memberships" card to reconcile with these other numbers; branch 1 must accept `"trialing"` as well so a trialing user with `autoRenew === false` is bucketed as scheduled-cancel rather than active.

> **Why `autoRenew === false` is required for branch 1:** the Stripe webhook ([src/app/api/stripe/webhook/route.ts](../../src/app/api/stripe/webhook/route.ts)) writes `endDate` on **every** active/trialing subscription as the next billing-period end. An `endDate`-only check therefore matches every active sub and miscounts them as cancelled — `autoRenew === false` is the canonical "user hit cancel" signal. This mirrors the canonical filter in [src/services/admin/MembershipAnalyticsService.ts](../../src/services/admin/MembershipAnalyticsService.ts) and [src/utils/admin/userFilterBuilder.ts](../../src/utils/admin/userFilterBuilder.ts).

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
