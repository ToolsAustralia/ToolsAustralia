# A/B Testing — Backend

## Services

[src/services/ab-testing/](../../src/services/ab-testing/) — assignment service, conversion-tracking service, metrics aggregation.

## Repositories

[src/repositories/ab-testing/](../../src/repositories/ab-testing/) — data access. Per `docs/AB_TESTING_DATABASE_OPTIMIZATION.md`, this layer has DB-optimized queries (indexes, projections) for dashboard performance.

## Metrics calculation

> **Being replaced (2026-06 redesign).** The legacy model reconstructed conversion
> rate and revenue from `ExperimentEvent` rows (which are TTL-deleted at 30 days)
> and counted *events* as if they were per-user outcomes. That produced wrong
> all-time numbers and invalid significance. See the new measurement core below;
> the remediation plan is `docs/superpowers/plans/2026-06-12-ab-affiliate-remediation.md`.

### Measurement core v2 — user-level, durable (Phase 1)

The analysis unit is the **user**, the denominator is the set of **exposed users**
(the durable `VariantAssignment` table), and conversion + revenue are measured
**per-user within a conversion window** after first exposure — matching how
GrowthBook / Eppo / Statsig compute experiment metrics.

- **Pure core:** [`src/utils/ab-testing/experiment-metrics-core.ts`](../../src/utils/ab-testing/experiment-metrics-core.ts)
  — DB-free `computeExperimentMetrics(...)`. Rules: denominator = distinct exposed
  identities; a **conversion** is a non-refunded first purchase within
  `conversionWindowDays` (default **14**); attribution follows the user's **assigned**
  variant (not the payment's stamped `variantId`); **renewals** (`isRenewal`) are a
  **separate `recurringRevenue` line**, never a conversion; revenue is **net of
  partial + full refunds** and **per-user winsorized** (default p99 over converters).
  Fully unit-tested: `npm run test:experiment-metrics`
  ([test](../../src/utils/ab-testing/__tests__/experiment-metrics-core.test.ts)).
- **DB wrapper:** [`src/services/ab-testing/ExperimentMetricsService.ts`](../../src/services/ab-testing/ExperimentMetricsService.ts)
  — loads variants + assignments (optionally cohort-filtered by `assignedAt`) +
  the relevant durable `PaymentEvent` rows (BenefitsGranted stamped to the experiment
  **or** made by an assigned user, plus their refunds), and feeds the pure core.
  Because both source tables are durable, **all-time and any date range return
  consistent numbers** (no TTL truncation, no 30-day hybrid boundary).

The legacy `ExperimentAnalyticsService` / `aggregateEvents` path still powers the
dashboard until Phases 2–4 wire this service into the analytics routes and the
Bayesian engine.

### Statistics engine v2 — Bayesian chance-to-win (Phase 2)

[`src/utils/ab-testing/bayesian-test.ts`](../../src/utils/ab-testing/bayesian-test.ts)
is a pure, deterministic `StatsEngine` (no RNG). Each variant's conversion is a
Beta-Binomial posterior `Beta(α₀+converters, β₀+exposed−converters)`;
**chance-to-beat-control** = `P(variant rate > control rate)` via deterministic
numerical integration (Simpson's rule over the two Beta posteriors). It is valid
under continuous peeking by construction — no "don't look early" rule. The
designated **`isControl`** variant is the baseline (not insertion order), every
challenger is compared to it (3+ variants supported), and a `minConvertersPerArm`
noise gate yields `keep_running` until each arm has enough data. Unit-tested:
`npm run test:bayesian`
([test](../../src/utils/ab-testing/__tests__/bayesian-test.test.ts)). Swappable:
a future sequential/always-valid engine implements the same `StatsEngine` interface.

[`ExperimentAnalyticsService.getBayesianExperimentSummary(experimentId, opts)`](../../src/services/ab-testing/ExperimentAnalyticsService.ts)
runs `ExperimentMetricsService` → `bayesianStatsEngine` and returns per-variant
`{ exposedUsers, converters, conversionRate, chanceToBeatControl, credibleInterval,
relativeLift, firstPurchaseRevenue, revenuePerUser, recurringRevenue }` plus a
`recommendation` (`ship_variant` / `keep_control` / `keep_running` / `inconclusive`).

**Wired (Phase 4c, additive).** `getExperimentAnalyticsSummary` now embeds this as
a `bayesian` field (defensive — a failure degrades to `bayesian: null`, never a
500). It surfaces in the admin analytics route, the
[`ExperimentResultsDashboard`](../../src/components/admin/ab-testing/ExperimentResultsDashboard.tsx)
(a prominent user-level result card above the legacy chi-square section), and the
**Norm** analytics endpoint — `bayesian` added to `NormExperimentAnalyticsSchema`
in lockstep (`npm run build:norm-manifest`, `norm:smoke`). The legacy event-count
fields stay during migration so nothing breaks; they are slated for removal once
the new card is validated in production.

## Routes

[src/app/api/ab-testing/](../../src/app/api/ab-testing/) — assignment endpoint, conversion tracking endpoint, dashboard data.

> _TODO: read each handler._

### VariantConfig.membershipTheme

`VariantConfig` (src/models/ab-testing/Variant.ts) has an optional
`membershipTheme?: { forceLight?: boolean }`. `VariantConfigService`
defaults it to `{ forceLight: false }`, merges it, and validates that
`forceLight` is a boolean. Treatment variant sets `forceLight: true` to force
the membership section to light mode.
