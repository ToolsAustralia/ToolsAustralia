# A/B Testing — Promo Package-Design Experiment Runbook

## What the experiment tests

Package **design** on all promo pages. The discriminator is `VariantConfig.packages.design`:

| Value | Arm | Component | Location |
|---|---|---|---|
| `"promo"` (default) | **Control** | `MembershipSection` (current design) | — |
| `"membership"` | **Treatment** | `PromoMembershipDesign` (the `/membership` tier + one-time-packs design) | `src/components/sections/promo/PromoMembershipDesign.tsx` |

The branch lives in [`src/components/sections/promo/PromoPackages.tsx`](../../src/components/sections/promo/PromoPackages.tsx), which reads `variantConfig.packages.design` and renders the appropriate component.

`VariantConfig.packages.design` is documented in [models.md](./models.md#variantconfigpackagesdesign). The admin selector is documented in [docs/admin/frontend.md](../admin/frontend.md).

---

## Seeding the experiment

```bash
npm run seed:promo-packages-design:dry   # preview — prints the plan; creates nothing
npm run seed:promo-packages-design       # activate the experiment (goes straight to active)
```

**Authorized deviation:** this seed creates the experiment **straight to `active`**, unlike other seeds which create a `draft` that you must activate in admin. This is intentional and authorized for this experiment — the `:dry` variant is the safe preview step.

**Coverage:** `slugTargets = every prize slug from listPrizes()` — covers:
- All dynamic `[slug]` prize pages.
- All toolset / brand pages, which resolve the experiment via `getDefaultPrizeForToolsetSlug(slug)` (returns e.g. `"hikoki-milwaukee"` — itself a prize slug).

**Overlap guard:** the seed refuses to activate if another active experiment already targets any of the same slugs. This is because `getActiveExperimentForSlug` returns **one** experiment per slug — an overlap would make one test silently shadow the other. To override: `npm run seed:promo-packages-design -- --force-overlap`.

---

## Members and offer parity

The treatment (`PromoMembershipDesign`) calls `useMembershipCardCta({ includeAdditionalForMembers: true })`. This means members (active subscription OR current draw entries) see the same `isAdditional` ("Additional") packs the control shows — matching the offer exactly so the test measures **design** only, not the offer.

See [`docs/subscription/frontend.md`](../subscription/frontend.md#usemembershipcardcta--includeadditionalformembers) for the hook parameter.

---

## Diagnostics: the `package_cta` click event

**Both arms** emit a `click` `ExperimentEvent` with `{ element: "package_cta" }` via `useExperimentTracking().trackEvent(...)` when a user clicks a CTA.

**This is System B — diagnostic / engagement only. Never use it as the winner metric.** It uses a `pageViews` denominator and is not comparable across designs.

---

## Reading results (CRITICAL — read before declaring a winner)

The winner is decided by **System A — the user-level Bayesian panel**:

- Label in the dashboard: **"Result — user-level · Bayesian"** in `ExperimentResultsDashboard`.
- Source: `VariantAssignment ⋈ PaymentEvent` — refund-aware, renewals separated, **14-day attribution window**.

**Ignore the legacy "Winner Determination" chi-square card.** Its conversion rate uses a `pageViews` denominator — which inflates exposure vs the user-level count — and is not comparable between the two arms. It exists for historical reasons; the Bayesian panel is the correct instrument.

No winner is auto-declared. A human clicks "declare winner" in admin. Wait for:
1. The **14-day attribution window** to close for the last exposed users.
2. **Adequate sample** (see `docs/ab-testing/rules.md` for significance thresholds).

---

## Winner-swap runbook

### End/archive first

Regardless of which arm wins: **end/archive the experiment in admin before touching code**. This stops new users being assigned to an arm you're about to delete.

---

### If treatment wins (`"membership"` design)

1. Make `"membership"` the default in `PromoPackages.tsx` — render `PromoMembershipDesign` unconditionally (remove the branch on `packages.design`).
2. If `MembershipSection` has no other promo consumer after this change, delete its promo-specific branch. (`MembershipSection` itself is still used by 15+ other pages — do not delete the component, only the promo-conditional path if it exists solely for the control arm.)
3. Keep `PromoMembershipDesign` (`src/components/sections/promo/PromoMembershipDesign.tsx`).
4. Remove (see cleanup checklist below): `packages.design` field, its validation branch, its admin selector.

---

### If control wins (`"promo"` design)

1. Delete `PromoMembershipDesign` (`src/components/sections/promo/PromoMembershipDesign.tsx`).
2. Remove (see cleanup checklist below): `packages.design` field, its validation branch, its admin selector, the `includeAdditionalForMembers` hook flag, `selectOneTimeDrawerPackages`, the seed script.

---

### Cleanup checklist (both outcomes share the removal of the experiment infrastructure)

| Item | File |
|---|---|
| `packages.design` field | `src/models/ab-testing/Variant.ts` |
| Validation branch for `packages.design` | `src/services/ab-testing/VariantConfigService.ts` |
| Admin selector UI | `src/components/admin/ab-testing/VariantConfigEditor.tsx` |
| `includeAdditionalForMembers` param + `selectOneTimeDrawerPackages` helper (control wins only) | `src/hooks/useMembershipCardCta.ts` / `src/utils/membership/additional-package-mapping.ts` |
| Seed script (control wins only) | `scripts/seed-promo-packages-design-experiment.ts` + `package.json` `seed:promo-packages-design` entries |
| Spec/plan | `docs/superpowers/` (the spec and plan filed under this experiment) |

Commit the removal in **one commit** after archiving in admin.
