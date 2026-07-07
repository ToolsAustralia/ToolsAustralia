# A/B Testing — Promo Package-Design Experiment (CONCLUDED — control won)

> **Status: concluded 2026-07-06.** The experiment was ended in admin and the winner (control, the original "promo design") is now baked in permanently. This file is a historical record; the live runbook content (seeding commands, winner-swap steps, cleanup checklist) has been removed because the scripts and code paths it referenced were deleted in the teardown.

## What the experiment tested

Package **design** on all promo pages. The discriminator was `VariantConfig.packages.design` (field removed with the teardown):

| Value | Arm | Component | Notes |
|---|---|---|---|
| `"promo"` (default) | **Control** | `MembershipSection` (the original promo design) | **Winner** — now rendered unconditionally |
| `"membership"` | **Treatment** | `PromoMembershipDesign` (the `/membership` tier + one-time-packs design) | Deleted with the teardown |

The branch lived in `src/components/sections/promo/PromoPackages.tsx`, which read `variantConfig.packages.design` and rendered the appropriate component. It now unconditionally renders the control (`<section id="packages">` + `SectionContainer` + `MembershipSection title="Choose Your Entry Package"`), still passing `variantConfig?.packages` through for `hidePackages` / `displayOrder`.

## Outcome

**Control ("promo design") won.**

| Arm | Visitors | Conversions | Conversion rate | Revenue (AUD) |
|---|---|---|---|---|
| Control — "promo design" (`MembershipSection`) | 2,847 | 99 | **3.11%** | **$3,066.89** |
| Treatment — "membership design" (`PromoMembershipDesign`) | 2,853 | 84 | 2.65% | $2,340.92 |

- Ended: **2026-07-06**, stopped by the owner in admin before the code teardown (per the end-first rule) based on the variant-comparison numbers above.

## Teardown performed (2026-07-06)

Removed from code:

| Item | File |
|---|---|
| Treatment component `PromoMembershipDesign` | `src/components/sections/promo/PromoMembershipDesign.tsx` — **deleted** |
| Design branch (control now unconditional) | `src/components/sections/promo/PromoPackages.tsx` |
| `VariantConfig.packages.design` field | `src/models/ab-testing/Variant.ts` |
| Validation branch for `packages.design` | `src/services/ab-testing/VariantConfigService.ts` |
| Admin "Package Design (A/B)" `<select>` | `src/components/admin/ab-testing/VariantConfigEditor.tsx` |
| Treatment-only hook options `forcedTab` + `onPackageCtaClick` | `src/hooks/useMembershipCardCta.ts` |
| `PackCard` props `ctaLabel` + `colorHex` (CTA-footer render block) | `src/components/sections/membership/MembershipOneTimePacks.tsx` |
| `TierCard` export (now internal-only; sole external importer was the deleted treatment) | `src/components/sections/membership/MembershipTierChooser.tsx` |
| Test `variant-config-design.test.ts` + `test:variant-config-design` script | `src/services/ab-testing/__tests__/` + `package.json` |
| Seed + cleanup scripts and their `package.json` entries (`seed:promo-packages-design`, `seed:promo-packages-design:dry`, `cleanup:promo-packages-design`, `cleanup:promo-packages-design:apply`) | `scripts/seed-promo-packages-design-experiment.ts`, `scripts/cleanup-promo-packages-design-experiment.ts` — **deleted** |
| Spec + plan documents | `docs/superpowers/plans/2026-07-01-promo-packages-design-ab-test.md`, `docs/superpowers/specs/2026-07-01-promo-packages-design-ab-test-design.md` — **deleted** |

Kept (deliberately — not part of the teardown):

- All generic experiment plumbing on promotions pages: `VariantAssignmentWrapper`, `getActiveExperimentForSlug`, `getServerVariantAssignment` — ready for future experiments.
- `packages.hidePackages` / `displayOrder` / `highlightPackage` config keys (see [models.md](./models.md)).
- `useOpenMembershipModalListener`, `parseMembershipPackagesTab` (still used by `MembershipSection`, `PromoBanner`, `useMajorDrawEntryCta`).
- `includeAdditionalForMembers` on `useMembershipCardCta` (the my-account membership page `src/app/(site)/my-account/membership/page.tsx` passes it) + `selectOneTimeDrawerPackages` and its test (`test:one-time-drawer-packages`).
- The `package_cta` click tracking in `MembershipSection` (guarded by `experimentId`, no-op when no experiment is active).

## Historical footnote — how results were read

The winner was decided by **System A — the user-level Bayesian panel** ("Result — user-level · Bayesian" in `ExperimentResultsDashboard`; source: `VariantAssignment ⋈ PaymentEvent` — refund-aware, renewals separated, 14-day attribution window). The legacy "Winner Determination" chi-square card was ignored — its `pageViews` denominator inflated exposure and was not comparable between the two arms.
