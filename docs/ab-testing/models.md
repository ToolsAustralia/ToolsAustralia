# A/B Testing — Models

[src/models/ab-testing/](../../src/models/ab-testing/) — likely contains:
- `Experiment` — experiment definition (variants, ratios, status)
- `Assignment` — user → variant assignment row
- `Conversion` (or similar) — conversion events

> _TODO: enumerate and pull each schema from the source files._

## VariantAssignment — sticky uniqueness (2026-06)

[`VariantAssignment`](../../src/models/ab-testing/VariantAssignment.ts) is the
**durable source of truth for exposed users** (the denominator in the v2
measurement model). It now carries two **unique partial** indexes —
`uniq_experiment_user` on `(experimentId, userId)` and `uniq_experiment_anon` on
`(experimentId, anonymousId)` — guaranteeing exactly one assignment per identity
per experiment (prevents "split-brain" where concurrent first-loads bucket one
identity into two variants and corrupt every metric).

- **Building in prod requires de-duping first.** Run
  `npm run migrate:dedupe-variant-assignments:dry` then the live variant
  **before** deploying this model change, or the index build silently fails.
- **Login merge** ([`VariantAssignmentRepository.mergeAnonymousToUser`](../../src/repositories/ab-testing/VariantAssignmentRepository.ts))
  respects the index: if the user already has an assignment for an experiment the
  anon row also covers, the anon duplicate is **deleted** (user row wins) rather
  than converted — which would violate uniqueness. This also fixes the
  one-human-counted-twice issue (finding M5).

## VariantConfig.hero.imageSrcBySlug

Optional `Record<string, { desktop?: string; mobile?: string }>` map on
`VariantConfig.hero`. Used when one experiment spans multiple landing slugs and
each page needs its own creative. Both `desktop` and `mobile` are independently
optional — a row that sets only `mobile` keeps desktop on the theme-aware
default landing image, enabling mobile-only A/B tests.

Slug keys must match the experiment's `slugTargets` exactly. `PromoHero`
composes desktop and mobile independently, falling through to the standard
landing-image resolver for any missing field. Validated by
`VariantConfigService.validateVariantConfig` — at least one of `desktop` /
`mobile` must be present per row.

## VariantConfig.hero.disableVideo

Boolean (default false). When true, `PromoHero` suppresses the brand hero video
and renders the theme-aware still — the lever for the **"static image vs video"**
A/B test (control = false → video; treatment = true → still). Independent of
`imageSrcBySlug` (which also kills the video, but by pinning a custom still).
Defaulted + merged + boolean-validated by `VariantConfigService`. Seed an
experiment with `npm run seed:static-vs-video-hero`.

## VariantConfig.packages.design

Optional `"promo" | "membership"` scalar on `VariantConfig.packages`
(default / absent = `"promo"`). The lever for the **promo package-design** A/B
test: `PromoPackages` branches on it — `"promo"` renders the current
`MembershipSection`; `"membership"` renders `PromoMembershipDesign` (the
`/membership` tier + one-time-packs design). Because it is a scalar on the
already-spread `packages` key, it merges through `mergeVariantConfig` with no
change to that function; `validateVariantConfig` rejects any value other than
`"promo"`/`"membership"`. Seed an experiment (straight to active) with
`npm run seed:promo-packages-design`. Winner metric = System A (user-level
Bayesian conversion); read the Bayesian panel, not the legacy chi-square card.
