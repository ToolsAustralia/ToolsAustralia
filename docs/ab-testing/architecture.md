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

- [`/login`](../../src/app/login/page-client.tsx) — uses the `"cash-prize"` slug
  key (the canonical slug for the evergreen `all-prizes` collage; see
  `LANDING_HERO_MAP` in [`promo-landing-slugs.ts`](../../src/config/promo-landing-slugs.ts)).
  Forward-wired only — this page doesn't currently sit under a
  `VariantAssignmentWrapper`, and `variation{1,2}-{desktop,mobile}/all-prizes.webp`
  assets don't exist yet, so the override is a no-op today. To activate later:
  (a) deliver those assets, (b) add a `cash-prize` row to each variant's
  `imageSrcBySlug`, (c) wrap the pages in a variant context that does a
  read-only lookup of the visitor's existing experiment assignment.

> **Removed 2026-07-21.** `PrizeShowcase` (which consumed the `mobile` slot for its first
> carousel slide) and `PrizeSpecificationsModal/Hero` (the `desktop` slot, falling back to the
> legacy "dark desktop" pick) were both consumers until the prize-showcase rewrite. The showcase
> is now the [prize builder](../promo/frontend.md#prize-builder--build-your-prize-configurator-2026-07-21)
> and renders the combination composite `{toolset}-set/{toolset}-{toolbox}.webp`, not
> landing-hero art; the modal's `Hero.tsx` was deleted outright. Neither surface has a
> landing-image path left to override, so no replacement wiring is needed — but note the
> per-slug map now reaches **fewer** surfaces than when an experiment was last designed against
> it.

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
  prize slug, so a page-targeted promo experiment can never shadow it — but
  that is only a **prize-slug → sentinel** guarantee, not zero collision
  overall: `findActiveBySlug` still matches `$in: [slug, "*"]`, so an active
  **wildcard** ("All Pages") experiment created after the sentinel one would
  still be the newest match and hijack the sentinel lookup. Site-wide sentinel
  lookups (e.g. `__membership-theme__`, `__promo-theme__`) MUST go through
  `ExperimentRepository.findActiveBySentinelSlug` /
  `ExperimentService.getActiveExperimentForSentinelSlug`, which use
  `buildActiveExperimentQuery(slug, { allowWildcard: false }, now)` — an exact
  match on `slugTargets` that never matches `"*"`. `findActiveBySlug` (used by
  page-targeted lookups) is unchanged and still legitimately matches `"*"`.
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

## Promo landing default-theme experiment

`VariantConfig.promoTheme.defaultTheme` (`"light" | "dark"`) is the theme a
bucketed visitor is defaulted into on promo landing pages. It is applied only
when the visitor has never used the theme toggle — a manual toggle wins
permanently. Control carries `defaultTheme: "light"` **explicitly** (not an
absent key) so the admin config UI and `getDefaultConfig()` read
unambiguously. Conversion + wiring for this experiment are covered by later
tasks in this plan; this section documents the config field itself.

### The merge-whitelist footgun

`VariantConfigService.mergeVariantConfig` does **not** spread `baseConfig`/
`variantConfig` wholesale — it rebuilds the returned object key-by-key from a
hard-coded literal. `getDefaultConfig()` and `validateVariantConfig()` are
built the same explicit way. This means:

> Any new `VariantConfig` key **must** be added to all three of
> `mergeVariantConfig`, `getDefaultConfig`, and `validateVariantConfig`, or it
> is **silently stripped** between MongoDB and the browser on every
> `POST /api/ab-testing/assign` response.

`tsc` cannot catch this — every `VariantConfig` field is optional, so a
variant config carrying a key that `mergeVariantConfig` doesn't know about
still type-checks fine and simply vanishes at runtime. The practical failure
mode is worse than a crash: assignments and page views still record
normally, the admin dashboard still shows a healthy 50/50 split, but every
arm renders identically — a silent A/A test producing confident, wrong
conclusions. When adding a new experiment config field, add it to all three
functions in the same change, and cover it with an assertion (see
`variantConfigService.membershipTheme.test.ts` for the `promoTheme` guard
pattern) rather than relying on type-checking alone.

## Anonymous visitor identity (`ta_anon_id`) — minted in middleware (2026-07-28)

A promo landing page can fire **two concurrent** `POST /api/ab-testing/assign`
calls in the same effect flush — one for the page's slug-targeted experiment,
one for the site-wide theme experiment (`__promo-theme__`, see above).
`AnonymousIdService.getOrCreateAnonymousId` mints a fresh `anon_<uuid>` **per
request** and cannot persist it (it runs inside a route handler, which can
only `Set-Cookie` its own response) — so with no shared mint, each handler
would generate its own id and Set-Cookie it, last write wins. The
`VariantAssignment` unique index is `(experimentId, anonymousId)`, so **both**
resulting rows are legal: the visitor is silently counted as two exposures
and gets re-bucketed on a later visit when the surviving cookie doesn't match
either assignment.

Fix: `src/middleware.ts` mints the `ta_anon_id` cookie **once**, before either
`/assign` handler runs, immediately after `const response = NextResponse.next();`
in the "all other routes" path. Both concurrent `/assign` calls then read the
same already-set cookie via `AnonymousIdService.extractAnonymousId` /
`getOrCreateAnonymousId` and agree on one identity. The cookie contract (name,
90-day TTL, `anon_` + length validation) is duplicated — not re-exported —
in the edge-safe [`src/lib/ab-testing/anon-id-cookie.ts`](../../src/lib/ab-testing/anon-id-cookie.ts),
because `AnonymousIdService` imports `next/headers` and node `crypto`, neither
of which is available in middleware's edge runtime (see
[docs/security-csp/architecture.md](../security-csp/architecture.md)). Keep
the two modules' cookie name/TTL/validation rule identical by hand — if they
drift, assignments split across two ids for the same visitor again, which is
exactly the bug this fixes.

### `ta_anon_id_pub` — a read-only mirror for browser pixels (2026-07-31)

`ta_anon_id` is `httpOnly`, deliberately: assignment identity must not be forgeable
from page JS. But the browser conversion pixels need a stable anonymous id they can
**read**, to send to TikTok as `external_id` — coverage on anonymous browser page
views was 3%, and TikTok explicitly sanctions a first-party cookie id for this.

So middleware also writes **`ta_anon_id_pub`**: the **same value**, same 90-day TTL,
same `sameSite`/`secure`/`path`, but `httpOnly: false`. Its name constant lives beside
the original in [`anon-id-cookie.ts`](../../src/lib/ab-testing/anon-id-cookie.ts).

Three properties keep this from weakening anything, and they must stay true:

1. **It is never authoritative.** It is written *from* `ta_anon_id`, never the reverse.
   When a visitor already has a valid `ta_anon_id` but the mirror is missing or has
   drifted, middleware backfills the mirror — it never re-mints `ta_anon_id`, because
   that would split their assignments.
2. **Nothing reads it server-side.** `AnonymousIdService.extractAnonymousId` reads
   `ta_anon_id` only. A forged `ta_anon_id_pub` therefore cannot influence bucketing;
   the worst it can do is send a junk `external_id` to an ad platform for that browser.
3. **It is one concept, not two identities.** Do not introduce a second anonymous id.
   If the two ever diverge in value, that is a bug in the mint/backfill branch.

> Known drift: `/api/ab-testing/assign` re-sets `ta_anon_id` with a fresh 90-day
> max-age on every call and does **not** touch the mirror, so the two expiries can
> drift apart. Harmless today (the mirror is backfilled on the next page navigation,
> and the value never changes), but worth knowing before adding another writer.

## Migrated from `docs/AB_TESTING_*.md`

> _TODO: read all five root files and merge full content. Brief outline:_
> - Server-resolved variants to avoid flicker
> - Sticky assignment per (experimentId, userId)
> - Dedup at conversion-tracking level
> - Materialised metrics for fast dashboards
