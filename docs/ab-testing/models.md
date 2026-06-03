# A/B Testing — Models

[src/models/ab-testing/](../../src/models/ab-testing/) — likely contains:
- `Experiment` — experiment definition (variants, ratios, status)
- `Assignment` — user → variant assignment row
- `Conversion` (or similar) — conversion events

> _TODO: enumerate and pull each schema from the source files._

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
