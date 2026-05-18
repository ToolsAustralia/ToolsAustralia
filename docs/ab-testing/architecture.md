# A/B Testing — Architecture

## What this domain does

Run experiments on landing pages and key flows. Each user is sticky-assigned to one variant per experiment. Conversions are tracked via dedupe-aware aggregation.

## Layers

| Layer | Path |
|---|---|
| Services | [src/services/ab-testing/](../../src/services/ab-testing/) — assignment, conversion tracking |
| Components | [src/components/ab-testing/](../../src/components/ab-testing/) — variant rendering |
| Hooks | [src/hooks/ab-testing/](../../src/hooks/ab-testing/) — variant resolution in React |
| Repositories | [src/repositories/ab-testing/](../../src/repositories/ab-testing/) — data access (DB-optimized) |
| API | [src/app/api/ab-testing/](../../src/app/api/ab-testing/) — assignment endpoints |
| Models | [src/models/ab-testing/](../../src/models/ab-testing/) — experiment, assignment, conversion |

## Site-wide membership dark-mode experiment

Targets the membership section site-wide without a global VariantProvider:

- Uses the **sentinel slug target `__membership-theme__`** (NOT `*`).
  `ExperimentRepository.findActiveBySlug` matches `slugTargets: { $in: [slug, "*"] }`;
  `*` would also resolve on `/promotions/[slug]` and collide with promo
  experiments (newest `createdAt` wins). The sentinel can never match a real
  prize slug, so there is zero collision and zero change to ExperimentService /
  ExperimentRepository / the promo page.
- `GET /api/ab-testing/membership-theme-experiment` — read-only discovery,
  returns `{ experimentId | null }`, no DB writes.
- `useMembershipThemeExperiment()` discovers the id then POSTs the existing
  `/api/ab-testing/assign` with the CONSTANT slug `__membership-theme__`
  (the assign Zod schema requires a non-empty slug; a pathname-derived slug
  would 400 on `/`). Sticky assignment, admin exclusion, admin preview,
  deduped page_view, and the `ta_ab_assignment_<id>` attribution cookie are
  all reused.
- `VariantConfig.membershipTheme.forceLight` (default false) is the only new
  config field. `MembershipSection` ANDs `!forceLight` into its `isDark` line.
- Conversion = membership purchase, attributed via the existing
  pixel-purchase-tracking cookie path. No new tracking code.

## Migrated from `docs/AB_TESTING_*.md`

> _TODO: read all five root files and merge full content. Brief outline:_
> - Server-resolved variants to avoid flicker
> - Sticky assignment per (experimentId, userId)
> - Dedup at conversion-tracking level
> - Materialised metrics for fast dashboards
