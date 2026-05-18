# A/B Test — Disable Dark Mode on the Membership Section

**Date:** 2026-05-18
**Status:** Approved design (revised after deep code review) — ready for implementation planning
**Branch:** `ab-testing`

## Goal

Measure whether forcing the membership section to **light mode** improves
**membership purchase / subscription conversion** compared to the current
behavior, where the section follows the global dark-mode schedule and user
toggle. The experiment runs everywhere `MembershipSection` renders: the
homepage, the dedicated `/membership` page, and `/promotions/[slug]` landing
pages.

## Context (current system status)

The A/B testing subsystem is **live and working**, not stale as initially
suspected. It is DB-backed (experiments + variants in MongoDB, managed via the
admin UI), uses sticky SHA-256 variant assignment by `userId | anonymousId`,
tracks `page_view / click / conversion / purchase` events with multi-layer
dedup, aggregates daily, and computes chi-square / Wilson statistics
automatically via cron. Admins are excluded from assignment.

The only genuinely stale part is `docs/ab-testing/*.md`, which are empty TODO
stubs; the accurate documentation currently lives in the legacy
`docs/AB_TESTING_*.md` root files.

Key existing seams (verified against code):

- `src/components/sections/MembershipSection.tsx:58` —
  `const isDark = useThemeStore((s) => s.theme === "dark")` is the single line
  that controls light/dark for every `ElectricPackageCard`. Card theming is
  already decoupled from `html.dark` (the card reads a `theme` prop derived
  from this value).
- `POST /api/ab-testing/assign` (`src/app/api/ab-testing/assign/route.ts`)
  already does, for any `experimentId`: sticky assignment via
  `VariantAssignmentService`, admin exclusion, admin preview cookie, deduped
  `page_view` event (1-min window), `ta_anon_id` cookie, and the
  `ta_ab_assignment_<experimentId>` cookie that `pixel-purchase-tracking.ts`
  reads to attribute purchases. **The conversion funnel is reused as-is.**
- `ExperimentRepository.findActiveBySlug(slug)` queries
  `slugTargets: { $in: [slug, "*"] }`, sorted `createdAt: -1`. The promo page
  resolves its experiment via `getActiveExperimentForSlug(slug)`. Therefore an
  experiment with `slugTargets: ["*"]` would also be returned on promo pages
  and could **collide with / hijack live promo experiments** (newest
  `createdAt` wins). This experiment must NOT use `"*"`.

## Decisions (locked with user)

| Decision | Choice |
| --- | --- |
| Test surface | Site-wide — everywhere `MembershipSection` renders |
| Primary success metric | Membership purchase / subscription conversion |
| Control variant | Membership section follows current behavior (schedule/toggle) |
| Treatment variant | Membership section forced light, always |
| Confound handling | Raw comparison (current-behavior vs always-light) |
| Traffic split | Decided in admin UI at experiment creation; defaults 50/50 |
| Implementation approach | Approach A — component-local variant resolution |

### Note on the time-of-day confound

Dark mode is largely a proxy for "evening". Because assignment is randomized,
both arms get the same daytime/evening mix, so the raw comparison is **unbiased
for the product question actually asked** ("keep following dark mode, or always
light?"). The effect is **diluted, not biased** (arms only differ during dark
hours), so the test may take longer to reach significance. The user explicitly
accepted this. No segmentation infrastructure is built (see Out of scope).

## Architecture

### 1. The experiment (admin UI — no code)

Create one experiment via the existing admin UI:

- **`slugTargets: ["__membership-theme__"]`** — a dedicated sentinel slug, NOT
  `"*"` and not a real prize slug. This isolates the experiment: promo pages
  call `getActiveExperimentForSlug("<prize-slug>")` whose `$in: [slug, "*"]`
  query can never match `"__membership-theme__"`, so there is **zero collision**
  with promo experiments and **zero change** to `ExperimentService`,
  `ExperimentRepository`, or the promo page.
- Two variants:
  - **Control** — `isControl: true`, no theme override.
  - **Treatment** — `config.membershipTheme.forceLight = true`.
- `status: active`; traffic split set at creation (defaults 50/50).
- Statistical analysis runs automatically via the existing cron + analytics
  service. No change required.

### 2. Schema change — one optional field on `VariantConfig`

`src/models/ab-testing/Variant.ts` — extend the `VariantConfig` interface:

```ts
/** A/B: force the membership section to light mode regardless of site theme */
membershipTheme?: { forceLight?: boolean };
```

`config` is `Schema.Types.Mixed`, so there is no Mongoose migration.
`VariantConfigService.getDefaultConfig()` gains `membershipTheme: { forceLight: false }`
and `mergeVariantConfig()` merges the field, so control / unset config behaves
exactly as today.

### 3. Variant resolution — component-local (Approach A)

Only **one new route**, and it is read-only (no DB writes, no cookies → safe
for GET, immune to prefetch/bot inflation):

**`GET /api/ab-testing/membership-theme-experiment`** — thin handler that calls
`experimentService.getActiveExperimentForSlug("__membership-theme__")` and
returns `{ experimentId: string | null }`. No assignment, no tracking — all of
that is delegated to the existing `/assign` route.

New hook `src/hooks/ab-testing/useMembershipThemeExperiment.ts`:

1. `GET /api/ab-testing/membership-theme-experiment` → `experimentId` (cached
   in `sessionStorage`, keyed by a constant; null → return `{ forceLight: false }`).
2. If an `experimentId` exists, `POST /api/ab-testing/assign` with
   **`{ experimentId, slug: "__membership-theme__" }`** — a constant slug, not
   derived from pathname. This avoids the empty-slug → Zod-400 failure on the
   homepage and keeps `page_view` dedup keyed consistently site-wide. This call
   reuses the entire proven funnel (sticky assignment, admin exclusion, preview,
   page_view dedup, anon cookie, `ta_ab_assignment_<id>` attribution cookie).
3. Returns `{ forceLight: variantConfig?.membershipTheme?.forceLight ?? false }`.
   Any error / no experiment / admin → `forceLight: false` (today's behavior).

The hook owns a small fetch + sessionStorage cache + graceful-fallback. It does
not reuse `useVariantAssignment` because that hook derives the slug from
`pathname` (breaks on `/`) and caches per-slug (wrong for a site-wide test).

### 4. The behavior change — one line

`src/components/sections/MembershipSection.tsx:58`:

```ts
// before
const isDark = useThemeStore((s) => s.theme === "dark");

// after
const { forceLight } = useMembershipThemeExperiment();
const isDark = useThemeStore((s) => s.theme === "dark") && !forceLight;
```

Every `ElectricPackageCard` already derives light/dark from this value. Control
(`forceLight` false) is byte-for-byte today's behavior; Treatment forces
`isDark` false → always light.

### 5. Conversion tracking

No new tracking code. `pixel-purchase-tracking.ts` already attributes
`purchase` / `conversion` events to the variant via the
`ta_ab_assignment_<experimentId>` cookie that the reused `/assign` call sets.
`page_view` (the conversion-rate denominator) is recorded by the same `/assign`
call. The existing daily aggregation + chi-square / Wilson analysis applies
unchanged.

### 6. Documentation (CLAUDE.md rule 2)

Touching `src/...ab-testing/**` and `src/components/sections/**` requires
updating `docs/ab-testing/` and `docs/shared-ui/`. The relevant empty
`docs/ab-testing/*` stubs (architecture, API surface, this experiment) are
filled in rather than left as TODO.

## Files touched

| File | Change | New? |
| --- | --- | --- |
| `src/models/ab-testing/Variant.ts` | +1 optional `membershipTheme` field on `VariantConfig` | no |
| `src/services/ab-testing/VariantConfigService.ts` | default + merge for new field | no |
| `src/app/api/ab-testing/membership-theme-experiment/route.ts` | thin read-only discovery route | **yes** |
| `src/hooks/ab-testing/useMembershipThemeExperiment.ts` | client hook (discovery + reuse /assign + cache + fallback) | **yes** |
| `src/components/sections/MembershipSection.tsx` | 1-line behavior change | no |
| `src/components/admin/ab-testing/VariantConfigEditor.tsx` | admin toggle for new field | no |
| `docs/ab-testing/*`, `docs/shared-ui/*` | doc sync per manifest | no |

## Out of scope (YAGNI)

- No global `VariantProvider` on the site layout (Approach B/C rejected).
- No new endpoint that re-implements assignment/tracking — `/assign` is reused.
- No `slugTargets: ["*"]` (collision risk) and no changes to
  `ExperimentService` / `ExperimentRepository` / the promo page.
- No `sessionTheme` / time-of-day segmentation: it would require modifying the
  core `/assign` schema and metadata (not free), and the user chose raw
  comparison. Explicitly excluded.
- No new analytics math, no feature flag (a commit is the rollback unit).
- No changes to the global theme system, `html.dark`, or any other
  `useThemeStore` consumer.

## Risks & mitigations

- **Diluted statistical power** (arms differ only during dark hours) — accepted
  by the user; documented so results are read with this in mind.
- **Brief first-paint as control before client resolution** — treatment users
  may see a one-frame dark→light flip. Consistent with the existing system's
  documented client-resolution first-paint behavior; acceptable for a
  non-functional visual test.
- **Stray `dark:` Tailwind in `MembershipSection` edge UI** (e.g. "no packages"
  fallback, promo header) is not driven by the `theme` prop and stays
  schedule-driven even in treatment. These are non-card edge states; out of
  scope for the card-conversion question. Noted, not fixed.
- **Sentinel-slug convention** must be documented in `docs/ab-testing/` so a
  future engineer does not reuse `"__membership-theme__"` for an unrelated
  experiment or expect it to behave like a prize slug.

## Acceptance criteria

1. With no active `__membership-theme__` experiment, `MembershipSection`
   behaves exactly as today on all surfaces (home, `/membership`, promos).
2. With an active experiment: control users see schedule-driven theme;
   treatment users see the membership section always light, on all surfaces
   including the homepage (`/`).
3. A concurrently active promo experiment on `/promotions/[slug]` is unaffected
   (resolves its own experiment; no collision).
4. `purchase` / `conversion` events attribute to the correct variant; the
   experiment's admin analytics show non-zero `page_view` and conversion data
   for both arms.
5. Admin users are excluded (see control behavior) and can QA via the existing
   `ta_ab_preview_<id>` cookie.
6. `npm run lint` and `npm run type-check` pass; relevant `docs/ab-testing/`
   and `docs/shared-ui/` docs updated; doc-sync hook passes.
