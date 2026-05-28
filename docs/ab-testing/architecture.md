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

## Per-slug hero image overrides

One experiment can run across multiple landing slugs (e.g. `/promotions/dewalt`
toolset landing + `/promotions/dewalt-milwaukee` evergreen prize page) and show
a different hero on each page. The variant carries
`hero.imageSrcBySlug: Record<slug, { desktop?, mobile? }>`. Each viewport is
**independently optional** — leaving `desktop` blank for a row means desktop
visitors on that slug see the theme-aware default landing image, while mobile
visitors still see the override. This supports mobile-only or desktop-only A/B
tests without forcing the other viewport into the experiment.

Resolution order per `(slug, viewport)` in [PromoHero.tsx](../../src/components/sections/promo/PromoHero.tsx):

1. `variantConfig.hero.imageSrcBySlug[slug].{desktop|mobile}` if set
2. The theme-aware default from `getLandingHeroImagePaths(slug)` (handles
   missing light/dark variants via `resolveLandingHeroImage`'s opposite-mode
   fallback — important for slugs like `*-sidchrome` that only ship `-dark`)
3. The multiplier/urgency-aware standard promo hero

Slug keys must match the experiment's `slugTargets` exactly. The admin editor at
[VariantConfigEditor.tsx](../../src/components/admin/ab-testing/VariantConfigEditor.tsx)
exposes a `PerSlugImageMapEditor` subcomponent for managing the map — each row
has independently-optional Desktop and Mobile path inputs.

### Non-hero consumers of the same per-slug map

The hook [`usePerSlugHeroOverride(slug)`](../../src/hooks/ab-testing/usePerSlugHeroOverride.ts)
returns the variant's `{ desktop?, mobile? }` override for a slug (or `null`
when no experiment is active / no override is set). It exists so non-hero
components that also render the brand-specific landing image stay visually
consistent with `PromoHero` for an A/B-bucketed visitor. Current consumers:

- [`PrizeShowcase`](../../src/components/sections/promo/PrizeShowcase.tsx) — first
  carousel slide. Uses the override's `mobile` slot (per product, this slide
  uses mobile art on both viewports).
- [`PrizeSpecificationsModal/Hero`](../../src/components/modals/PrizeSpecificationsModal/Hero.tsx)
  — modal hero strip. Uses the override's `desktop` slot. When no override is
  set, falls back to the legacy "dark desktop" pick.
- [`DrawResultsHero`](../../src/app/(site)/draw-results/components/DrawResultsHero.tsx)
  and [`/login`](../../src/app/login/page.tsx) — use the `"cash-prize"` slug
  key (the canonical slug for the evergreen `all-prizes` collage; see
  `LANDING_HERO_MAP` in [`promo-landing-slugs.ts`](../../src/config/promo-landing-slugs.ts)).
  Forward-wired only — these pages don't currently sit under a
  `VariantAssignmentWrapper`, and `variation{1,2}-{desktop,mobile}/all-prizes.webp`
  assets don't exist yet, so the override is a no-op today. To activate later:
  (a) deliver those assets, (b) add a `cash-prize` row to each variant's
  `imageSrcBySlug`, (c) wrap the pages in a variant context that does a
  read-only lookup of the visitor's existing experiment assignment.

When adding a new component that renders a landing-image-resolver path, call
`usePerSlugHeroOverride` first and prefer its slot before the default resolver.
For evergreen/all-prizes images, use `"cash-prize"` as the slug key.

## Site-wide membership dark-mode experiment (historical — winner shipped)

The "no theme" arm won. `MembershipSection` now passes `theme="light"`
unconditionally; the hook + API route + VariantConfig field are dormant. The
section below documents the pattern for future site-wide cosmetic tests.

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
