# Promotions Package-Design A/B Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a DB-driven A/B test on all promotions pages comparing the current promo package design (`MembershipSection`) against the `/membership` tier + one-time-packs design, with automatic purchase-conversion attribution.

**Architecture:** A single `packages.design` discriminator on the existing `VariantConfig` steers one branch in `PromoPackages` (the one choke-point both promo route families share) between the control `MembershipSection` and a new `PromoMembershipDesign` treatment wrapper that reuses the `/membership` design. Purchase conversion attributes automatically via the existing user-level metric system (System A / Bayesian); a diagnostic CTA-click event is emitted on both arms. A seed script creates the experiment straight-to-active with an overlap guard.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, MongoDB/Mongoose, Tailwind, framer-motion. Tests are standalone `tsx` scripts (no jest/vitest) using `node:assert/strict`, each wired to an `npm run test:<name>` script.

**Spec:** `docs/superpowers/specs/2026-07-01-promo-packages-design-ab-test-design.md`

## Global Constraints

- **Metric authority:** the winner is decided by **System A** — `ExperimentMetricsService` → Bayesian (`VariantAssignment ⋈ PaymentEvent BenefitsGranted`, refund-aware, renewals separated, 14-day window). The primary metric needs **no new attribution code**. Ignore the legacy chi-square panel when reading results.
- **Member offer-parity = Option A:** the treatment shows *members* (active subscription OR current major-draw entries) the same `isAdditional` packs the control shows, so we measure design not offer.
- **Slug targeting:** `slugTargets = listPrizes().map(p => p.slug)` — covers both `[slug]` prize pages and toolset pages (which resolve on `getDefaultPrizeForToolsetSlug(slug)` = a prize slug). No `["*"]` wildcard.
- **Config field values:** `packages.design` ∈ `"promo"` (control / default / absent) | `"membership"` (treatment). Exact strings, no synonyms.
- **CTA click event:** `trackEvent(experimentId, variantId, "click", { element: "package_cta", packageId })` — `element` is always the literal `"package_cta"`. Diagnostic only; never the winner metric.
- **Providers:** all required providers are already present on promo routes — do NOT add wrappers.
- **Naming:** reuse existing terms — `isAdditional`, `hasAdditionalPackageAccess`, `PromoPackages`, `MembershipTierChooser`, `useMembershipCardCta`. Do not coin new vocabulary.
- **Commits:** per the user's instruction, do **not** commit per-task. Each task ends at "verify green." A single combined commit (this work + the earlier `isAdditional` rename + spec + plan) happens in the final task, and only after confirming with the user (CLAUDE.md hard rule #1: no auto-commit).
- **Docs:** editing `src/`/`scripts/` requires updating the matching `docs/<domain>/` in the same work (doc-sync Stop hook). Domains touched: `ab-testing`, `subscription`, `shared-ui`, `admin`, `promo`, `infrastructure`.

---

### Task 1: Add the `packages.design` config field (interface + validation + admin selector)

**Files:**
- Modify: `src/models/ab-testing/Variant.ts` (the `packages` object in `VariantConfig`, ~line 80)
- Modify: `src/services/ab-testing/VariantConfigService.ts` (`validateVariantConfig` packages block, ~line 193)
- Modify: `src/components/admin/ab-testing/VariantConfigEditor.tsx` (Packages Configuration section, ~line 544)
- Create: `src/services/ab-testing/__tests__/variant-config-design.test.ts`
- Modify: `package.json` (add `test:variant-config-design`)

**Interfaces:**
- Produces: `VariantConfig["packages"]["design"]?: "promo" | "membership"` — consumed by Task 3 (`PromoPackages`) and Task 5 (seed).
- No change to `mergeVariantConfig` (scalar on the already-spread `packages` key merges automatically) or `getDefaultConfig` (absence = control).

- [ ] **Step 1: Write the failing test**

Create `src/services/ab-testing/__tests__/variant-config-design.test.ts`:

```ts
import assert from "node:assert/strict";
import variantConfigService from "../VariantConfigService";

function run() {
  // Absent design → valid (control by default)
  assert.equal(variantConfigService.validateVariantConfig({ packages: {} }).valid, true, "absent design valid");

  // "promo" and "membership" → valid
  assert.equal(variantConfigService.validateVariantConfig({ packages: { design: "promo" } }).valid, true, "promo valid");
  assert.equal(variantConfigService.validateVariantConfig({ packages: { design: "membership" } }).valid, true, "membership valid");

  // Unknown value → invalid with a helpful error
  const bad = variantConfigService.validateVariantConfig({ packages: { design: "fancy" } });
  assert.equal(bad.valid, false, "unknown design invalid");
  assert.ok(bad.errors.some((e) => e.includes("Packages design")), "error mentions Packages design");

  // Merge: a scalar design on the spread packages key survives the merge untouched
  const merged = variantConfigService.mergeVariantConfig(
    variantConfigService.getDefaultConfig(),
    { packages: { design: "membership" } }
  );
  assert.equal(merged.packages?.design, "membership", "design survives merge");

  console.log("variant-config-design: all assertions passed");
}

run();
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add alongside the other `test:*` entries:

```json
"test:variant-config-design": "tsx src/services/ab-testing/__tests__/variant-config-design.test.ts",
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:variant-config-design`
Expected: FAIL — the `"fancy"` case currently passes (allow-by-omission), so `bad.valid` is `true` and the assertion throws.

- [ ] **Step 4: Add the interface field**

In `src/models/ab-testing/Variant.ts`, extend the `packages` object in `VariantConfig`:

```ts
  packages?: {
    displayOrder?: string[]; // Reorder package IDs
    highlightPackage?: string; // Package ID to highlight/emphasize
    hidePackages?: string[]; // Package IDs to hide
    /**
     * A/B: which package DESIGN renders on promotions pages.
     * "promo" (default / absent) = current MembershipSection.
     * "membership" = the /membership tier + one-time-packs design (PromoMembershipDesign).
     */
    design?: "promo" | "membership";
  };
```

- [ ] **Step 5: Add the validation branch**

In `src/services/ab-testing/VariantConfigService.ts`, inside the existing `if (cfg.packages) { … } else { const packages = … }` block (after the `hidePackages` check, ~line 206):

```ts
        if (
          packages.design !== undefined &&
          (typeof packages.design !== "string" || !["promo", "membership"].includes(packages.design as string))
        ) {
          errors.push('Packages design must be "promo" or "membership"');
        }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test:variant-config-design`
Expected: PASS — prints `variant-config-design: all assertions passed`.

- [ ] **Step 7: Add the admin selector**

In `src/components/admin/ab-testing/VariantConfigEditor.tsx`, inside the `Packages Configuration` `FormSection` (before the `highlightPackage` `Input`, ~line 546), add a native select mirroring the existing `setFormData` shape:

```tsx
          <div>
            <label htmlFor="packagesDesign" className="mb-1 block text-sm font-medium">
              Package Design (A/B)
            </label>
            <select
              id="packagesDesign"
              name="packagesDesign"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={formData.config.packages?.design || "promo"}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  config: {
                    ...formData.config,
                    packages: {
                      ...formData.config.packages,
                      design: e.target.value as "promo" | "membership",
                    },
                  },
                })
              }
            >
              <option value="promo">promo (control — current MembershipSection)</option>
              <option value="membership">membership (treatment — /membership design)</option>
            </select>
          </div>
```

- [ ] **Step 8: Verify types and lint**

Run: `npm run type-check`
Expected: no new errors.
Run: `npx eslint src/models/ab-testing/Variant.ts src/services/ab-testing/VariantConfigService.ts src/components/admin/ab-testing/VariantConfigEditor.tsx`
Expected: clean.

---

### Task 2: Member offer-parity (pure helper + wire into `useMembershipCardCta`)

**Files:**
- Modify: `src/utils/membership/additional-package-mapping.ts` (add `selectOneTimeDrawerPackages`)
- Create: `src/utils/membership/__tests__/select-one-time-drawer-packages.test.ts`
- Modify: `package.json` (add `test:one-time-drawer-packages`)
- Modify: `src/hooks/useMembershipCardCta.ts` (signature + `oneTimePlans`, ~lines 54, 96-106)

**Interfaces:**
- Produces: `selectOneTimeDrawerPackages<T extends { isAdditional?: boolean }>(pkgs: T[], opts: { hasAdditionalAccess: boolean; includeAdditional: boolean }): T[]` — used by the hook.
- Produces: `useMembershipCardCta({ includeAdditionalForMembers?: boolean }): MembershipCardCta` — default `false` (unchanged behavior for all existing callers); Task 3 passes `true`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/membership/__tests__/select-one-time-drawer-packages.test.ts`:

```ts
import assert from "node:assert/strict";
import { selectOneTimeDrawerPackages } from "../additional-package-mapping";

type Pkg = { _id: string; isAdditional?: boolean };

function run() {
  const pkgs: Pkg[] = [
    { _id: "tradie-pack" },
    { _id: "vip-pack" },
    { _id: "additional-tradie-pack", isAdditional: true },
    { _id: "additional-vip-pack", isAdditional: true },
  ];

  // Non-member → public ladder only (default /membership behavior)
  const guest = selectOneTimeDrawerPackages(pkgs, { hasAdditionalAccess: false, includeAdditional: false });
  assert.deepEqual(guest.map((p) => p._id), ["tradie-pack", "vip-pack"], "guest sees public packs");

  // Member but flag off → still public ladder (unchanged /membership page)
  const memberFlagOff = selectOneTimeDrawerPackages(pkgs, { hasAdditionalAccess: true, includeAdditional: false });
  assert.deepEqual(memberFlagOff.map((p) => p._id), ["tradie-pack", "vip-pack"], "member + flag off sees public packs");

  // Member + flag on → Additional packs (parity with control MembershipSection)
  const memberFlagOn = selectOneTimeDrawerPackages(pkgs, { hasAdditionalAccess: true, includeAdditional: true });
  assert.deepEqual(memberFlagOn.map((p) => p._id), ["additional-tradie-pack", "additional-vip-pack"], "member + flag on sees Additional packs");

  // Non-member + flag on → still public ladder (never show non-members locked Additional packs)
  const guestFlagOn = selectOneTimeDrawerPackages(pkgs, { hasAdditionalAccess: false, includeAdditional: true });
  assert.deepEqual(guestFlagOn.map((p) => p._id), ["tradie-pack", "vip-pack"], "non-member + flag on sees public packs");

  console.log("select-one-time-drawer-packages: all assertions passed");
}

run();
```

- [ ] **Step 2: Add the npm script**

In `package.json`:

```json
"test:one-time-drawer-packages": "tsx src/utils/membership/__tests__/select-one-time-drawer-packages.test.ts",
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:one-time-drawer-packages`
Expected: FAIL — `selectOneTimeDrawerPackages` is not exported yet (import error).

- [ ] **Step 4: Add the pure helper**

In `src/utils/membership/additional-package-mapping.ts`, add (after `filterPackagesForUser`):

```ts
/**
 * Select which one-time packs the "Not subscribing?" drawer shows.
 * Mirrors the control MembershipSection's member behavior so an A/B treatment can
 * reach OFFER PARITY: a member (additional-package access) sees the Additional packs;
 * everyone else sees the public ladder. `includeAdditional` is the opt-in — when off,
 * behavior is the historical /membership one (public ladder for all).
 */
export function selectOneTimeDrawerPackages<T extends { isAdditional?: boolean }>(
  packages: T[],
  opts: { hasAdditionalAccess: boolean; includeAdditional: boolean }
): T[] {
  const showAdditional = opts.includeAdditional && opts.hasAdditionalAccess;
  return showAdditional
    ? packages.filter((p) => p.isAdditional === true)
    : packages.filter((p) => !p.isAdditional);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:one-time-drawer-packages`
Expected: PASS — prints `select-one-time-drawer-packages: all assertions passed`.

- [ ] **Step 6: Wire the helper into the hook (opt-in param)**

In `src/hooks/useMembershipCardCta.ts`:

Change the import block to add the helper (alongside the existing `has-additional-package-access` import):

```ts
import { selectOneTimeDrawerPackages } from "@/utils/membership/additional-package-mapping";
```

Change the signature (line 54):

```ts
export function useMembershipCardCta(
  { includeAdditionalForMembers = false }: { includeAdditionalForMembers?: boolean } = {},
) {
```

Replace the `oneTimePlans` memo (lines 96-106) with:

```ts
  const oneTimePlans = useMemo(() => {
    return selectOneTimeDrawerPackages(oneTimePackages, {
      hasAdditionalAccess: hasAccessToAdditional,
      includeAdditional: includeAdditionalForMembers,
    }).map((raw) => {
      const local = convertToLocalPlan(raw);
      const days = daysByName.get(raw.name);
      const withDays =
        days != null ? { ...local, metadata: { ...local.metadata, partnerDiscountDays: days } } : local;
      return applyPromo(withDays, oneTimeMultiplier);
    });
  }, [oneTimePackages, oneTimeMultiplier, daysByName, hasAccessToAdditional, includeAdditionalForMembers]);
```

- [ ] **Step 7: Verify types and lint (existing callers unchanged)**

Run: `npm run type-check`
Expected: no errors — `useMembershipCardCta()` still valid with no args (default `{}`), so `MembershipPageClient` and all other callers are unaffected.
Run: `npx eslint src/utils/membership/additional-package-mapping.ts src/hooks/useMembershipCardCta.ts`
Expected: clean.

---

### Task 3: Treatment wrapper + tier-chooser `sectionId` + `PromoPackages` branch

**Files:**
- Modify: `src/components/sections/membership/MembershipTierChooser.tsx` (add `sectionId` prop, ~line 148-151)
- Create: `src/components/sections/promo/PromoMembershipDesign.tsx`
- Modify: `src/components/sections/promo/PromoPackages.tsx` (branch on `design`)

**Interfaces:**
- Consumes: `useMembershipCardCta({ includeAdditionalForMembers: true })` (Task 2); `VariantConfig["packages"]["design"]` (Task 1); `useVariantContext(): { experimentId, variantId, variantConfig }`; `useExperimentTracking(): { trackEvent }`.
- Produces: `PromoMembershipDesign` (default export) rendered by `PromoPackages` when `design === "membership"`.

- [ ] **Step 1: Add the `sectionId` prop to `MembershipTierChooser`**

In `src/components/sections/membership/MembershipTierChooser.tsx`, change the component signature and the section id (lines 148-151):

```tsx
export default function MembershipTierChooser({
  cta,
  sectionId = "membership",
}: {
  cta: MembershipCardCta;
  sectionId?: string;
}) {
  return (
    <section
      id={sectionId}
      className="relative overflow-hidden bg-page py-16 sm:py-20 lg:py-24"
```

(Everything else in the component is unchanged; `/membership` keeps the default `id="membership"`.)

- [ ] **Step 2: Create the treatment wrapper**

Create `src/components/sections/promo/PromoMembershipDesign.tsx`:

```tsx
"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useMembershipCardCta, type MembershipCardCta } from "@/hooks/useMembershipCardCta";
import { useVariantContext } from "@/components/ab-testing/VariantProvider";
import { useExperimentTracking } from "@/hooks/ab-testing/useExperimentTracking";
import MembershipTierChooser from "@/components/sections/membership/MembershipTierChooser";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";

// MembershipModal bundles Stripe + payment forms; lazy-load it (mirrors MembershipPageClient).
const MembershipModal = dynamic(() => import("@/components/modals/MembershipModal"), { ssr: false });

/**
 * A/B TREATMENT for the promotions package section: the /membership tier + one-time-packs
 * design, dropped onto promo pages. Mirrors MembershipPageClient — one useMembershipCardCta
 * instance owning one MembershipModal — but:
 *   • passes includeAdditionalForMembers so members see the same Additional packs the control
 *     (MembershipSection) shows (offer parity — measure design, not offer);
 *   • wraps onSelect to emit a diagnostic A/B "click" event (no-ops outside an experiment);
 *   • uses sectionId="packages" so the promo #packages scroll anchor is preserved and there is
 *     no duplicate #membership id on the page.
 */
export default function PromoMembershipDesign() {
  const baseCta = useMembershipCardCta({ includeAdditionalForMembers: true });
  const { experimentId, variantId } = useVariantContext();
  const { trackEvent } = useExperimentTracking();

  const cta: MembershipCardCta = useMemo(
    () => ({
      ...baseCta,
      onSelect: (plan: LocalMembershipPlan) => {
        if (experimentId && variantId) {
          trackEvent(experimentId, variantId, "click", { element: "package_cta", packageId: plan.id });
        }
        baseCta.onSelect(plan);
      },
    }),
    [baseCta, experimentId, variantId, trackEvent],
  );

  return (
    <>
      <MembershipTierChooser cta={cta} sectionId="packages" />
      <MembershipModal
        isOpen={cta.membershipModal.isModalOpen}
        onClose={cta.membershipModal.closeModal}
        selectedPlan={cta.membershipModal.selectedPlan}
        onPlanChange={cta.membershipModal.selectPlan}
      />
    </>
  );
}
```

- [ ] **Step 3: Branch `PromoPackages`**

Replace `src/components/sections/promo/PromoPackages.tsx` with:

```tsx
"use client";

import MembershipSection from "@/components/sections/MembershipSection";
import { useVariantContext } from "@/components/ab-testing/VariantProvider";
import { SectionContainer } from "@/components/ui";
import PromoMembershipDesign from "./PromoMembershipDesign";

export default function PromoPackages() {
  // Get variant config from context
  const { variantConfig } = useVariantContext();

  // Extract packages config (passed to MembershipSection when it supports it)
  const packagesConfig = variantConfig?.packages;

  // A/B TREATMENT: render the /membership tier + one-time-packs design.
  // MembershipTierChooser (via PromoMembershipDesign) owns its own full-bleed <section id="packages">,
  // so we do NOT wrap it in the control's section/container.
  if (packagesConfig?.design === "membership") {
    return <PromoMembershipDesign />;
  }

  // CONTROL: current promo package block (unchanged).
  return (
    <>
      {/* Packages Section with scroll target */}
      <section id="packages" className="bg-white dark:bg-neutral-900/50">
        <SectionContainer>
          <MembershipSection
            title="Choose Your Entry Package"
            padding="py-4 sm:py-8"
            variantConfig={packagesConfig}
          />
        </SectionContainer>
      </section>
    </>
  );
}
```

- [ ] **Step 4: Verify types, lint, and build**

Run: `npm run type-check`
Expected: no errors.
Run: `npx eslint src/components/sections/membership/MembershipTierChooser.tsx src/components/sections/promo/PromoMembershipDesign.tsx src/components/sections/promo/PromoPackages.tsx`
Expected: clean.
Run: `npm run build`
Expected: build succeeds (this also proves the RSC/`"use client"` boundary is valid and the dynamic import resolves).

- [ ] **Step 5: Manual render verification (both arms)**

Because there is no React-render test harness, verify manually with `npm run dev`:
- Temporarily seed/point a variant to `design: "membership"` OR force it locally (e.g. in the browser React devtools set the context, or run the Task 5 seed against a scratch DB). On a promo page (`/promotions/<a-prize-slug>` and a brand page like `/promotions/dewalt`):
  - Control (`design` absent/`"promo"`): renders the existing package block under `#packages`.
  - Treatment (`design: "membership"`): renders the tier chooser + one-time drawer; the section carries `id="packages"`; clicking a CTA opens `MembershipModal`; there is exactly one `#packages` and no duplicate `#membership`.
- Confirm no console errors and the modal opens/closes.

---

### Task 4: Control-arm CTA click event (`MembershipSection`)

**Files:**
- Modify: `src/components/sections/MembershipSection.tsx` (imports, `useVariantContext` destructure at ~line 65, `openModal(plan)` site at ~line 260)

**Interfaces:**
- Consumes: `useVariantContext(): { variantConfig, experimentId, variantId }` (already imported); `useExperimentTracking(): { trackEvent }` (new import).
- Emits the same `{ element: "package_cta", packageId }` click event as the treatment, so both arms share a comparable funnel signal. No-ops when the section renders outside an experiment (the 15+ non-promo pages), because `experimentId` is then `null`.

- [ ] **Step 1: Add the tracking import**

In `src/components/sections/MembershipSection.tsx`, add near the other hook imports:

```ts
import { useExperimentTracking } from "@/hooks/ab-testing/useExperimentTracking";
```

- [ ] **Step 2: Read the experiment ids from context**

Change the destructure at line 65 from:

```ts
  const { variantConfig: contextVariantConfig } = useVariantContext();
```

to:

```ts
  const { variantConfig: contextVariantConfig, experimentId, variantId } = useVariantContext();
  const { trackEvent } = useExperimentTracking();
```

- [ ] **Step 3: Emit the click after the modal opens**

In the plan-select handler (`handlePlanSelect`, the function passed as `onSelect` that calls `membershipModal.openModal(plan)` at ~line 260), add immediately after that `openModal(plan)` call:

```ts
      // A/B diagnostic: package CTA click (no-ops outside an experiment).
      if (experimentId && variantId) {
        trackEvent(experimentId, variantId, "click", { element: "package_cta", packageId: plan.id });
      }
```

- [ ] **Step 4: Verify types and lint**

Run: `npm run type-check`
Expected: no errors.
Run: `npx eslint src/components/sections/MembershipSection.tsx`
Expected: clean.

- [ ] **Step 5: Confirm no double-fire and no off-experiment noise**

Read the surrounding handler to confirm: the emit sits on the same path as `openModal(plan)` (new-subscription / one-time / guest), NOT on the `router.push("/my-account")` early-return paths — so it fires once per genuine package-selection intent, and only when an experiment is active.

---

### Task 5: Seed script (straight-to-active) + overlap guard + npm entries

**Files:**
- Create: `scripts/seed-promo-packages-design-experiment.ts`
- Modify: `package.json` (`seed:promo-packages-design`, `seed:promo-packages-design:dry`)

**Interfaces:**
- Consumes: `listPrizes()` from `@/config/prizes` (returns `PrizeCatalogEntry[]` with `.slug`); `Experiment`, `Variant`, `User` models; `connectDB`.
- Produces: one active Experiment named `"promo packages design (promo vs membership)"` with two 50/50 variants whose configs are `{ packages: { design: "promo" } }` (control) and `{ packages: { design: "membership" } }` (treatment).

- [ ] **Step 1: Write the seed script**

Create `scripts/seed-promo-packages-design-experiment.ts`:

```ts
/**
 * Seed: "promo packages design (promo vs membership)" A/B experiment.
 *
 * Control  = { packages: { design: "promo" } }      → current MembershipSection
 * Treatment= { packages: { design: "membership" } } → /membership tier + one-time-packs design
 *
 * Targets ALL promotions pages: slugTargets = every prize slug from listPrizes(). Both the
 * dynamic [slug] prize pages and the toolset/brand pages resolve on a prize slug
 * (getDefaultPrizeForToolsetSlug → {brand}-milwaukee), so this covers both with no exclusions.
 *
 * NOTE — seeds status="active" directly (startDate=now). This is a deliberate, authorized
 * deviation from the other seeds (which create "draft" for manual admin activation).
 *
 * Idempotent + safe:
 *   • If the experiment already exists and is NOT draft → skip (never touch a live/edited one).
 *   • Overlap guard: refuses to activate if another ACTIVE experiment already targets any of
 *     these slugs (getActiveExperimentForSlug returns one experiment per slug — an overlap
 *     would make one test silently shadow the other). Override knowingly with --force-overlap.
 *
 * Usage:
 *   npx tsx scripts/seed-promo-packages-design-experiment.ts            (live, straight to active)
 *   npx tsx scripts/seed-promo-packages-design-experiment.ts --dry-run  (preview)
 *   npx tsx scripts/seed-promo-packages-design-experiment.ts --force-overlap   (activate despite overlap)
 *
 * Env: .env.local must have MONGODB_URI. Requires at least one admin User (used as createdBy).
 */

import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE_OVERLAP = process.argv.includes("--force-overlap");

const EXPERIMENT_NAME = "promo packages design (promo vs membership)";

const CONTROL_CONFIG = { packages: { design: "promo" as const } };
const TREATMENT_CONFIG = { packages: { design: "membership" as const } };

async function main(): Promise<void> {
  if (!process.env.MONGODB_URI) {
    console.error("❌ MONGODB_URI not set in .env.local");
    process.exit(1);
  }

  const connectDB = (await import("../src/lib/mongodb")).default;
  const { default: Experiment } = await import("../src/models/ab-testing/Experiment");
  const { default: Variant } = await import("../src/models/ab-testing/Variant");
  const { default: User } = await import("../src/models/User");
  const { listPrizes } = await import("../src/config/prizes");

  await connectDB();

  const slugTargets = Array.from(new Set(listPrizes().map((p) => p.slug)));
  console.log(`Target slugs (${slugTargets.length}): ${slugTargets.join(", ")}`);

  // Idempotency: refuse to clobber a non-draft experiment of the same name.
  const existing = await Experiment.findOne({ name: EXPERIMENT_NAME }).exec();
  if (existing && existing.status !== "draft") {
    console.log(`↩️  Experiment "${EXPERIMENT_NAME}" already exists (status=${existing.status}, id=${existing._id}). Skipping.`);
    process.exit(0);
  }

  // Overlap guard: any OTHER active experiment targeting one of our slugs (or wildcard "*").
  const activeOthers = await Experiment.find({
    status: "active",
    ...(existing ? { _id: { $ne: existing._id } } : {}),
  })
    .select("_id name slugTargets")
    .lean()
    .exec();
  const overlaps = activeOthers.filter(
    (e) =>
      Array.isArray(e.slugTargets) &&
      e.slugTargets.some((s: string) => s === "*" || slugTargets.includes(s)),
  );
  if (overlaps.length > 0) {
    console.log("⚠️  Overlapping ACTIVE experiment(s) already target these slugs:");
    for (const o of overlaps) console.log(`   - ${o.name} (id=${o._id}) → ${(o.slugTargets as string[]).join(", ")}`);
    if (!FORCE_OVERLAP) {
      console.error("❌ Refusing to activate — one test would shadow the other. Re-run with --force-overlap to proceed knowingly.");
      process.exit(1);
    }
    console.log("… proceeding anyway (--force-overlap).");
  }

  const adminUser = await User.findOne({ role: "admin" }).select("_id email").lean().exec();
  if (!adminUser) {
    console.error("❌ No admin user found — Experiment.createdBy requires a real user. Seed an admin first.");
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("[dry-run] Would create ACTIVE Experiment:");
    console.log(`  name        : ${EXPERIMENT_NAME}`);
    console.log(`  status      : active (startDate = now)`);
    console.log(`  slugTargets : ${slugTargets.length} prize slugs`);
    console.log(`  createdBy   : ${adminUser._id} (${adminUser.email})`);
    console.log("[dry-run] Variants (50/50):");
    console.log(`  - Control   "promo design"      isControl=true  config=${JSON.stringify(CONTROL_CONFIG)}`);
    console.log(`  - Treatment "membership design" isControl=false config=${JSON.stringify(TREATMENT_CONFIG)}`);
    process.exit(0);
  }

  const experiment =
    existing ??
    (await Experiment.create({
      name: EXPERIMENT_NAME,
      status: "active",
      slugTargets,
      startDate: new Date(),
      createdBy: adminUser._id,
    }));

  if (existing) {
    existing.status = "active";
    existing.slugTargets = slugTargets;
    existing.startDate = existing.startDate ?? new Date();
    await existing.save();
    await Variant.deleteMany({ experimentId: existing._id });
  }

  await Variant.create([
    { experimentId: experiment._id, name: "promo design", trafficPercentage: 50, isControl: true, config: CONTROL_CONFIG },
    { experimentId: experiment._id, name: "membership design", trafficPercentage: 50, isControl: false, config: TREATMENT_CONFIG },
  ]);

  console.log(`✅ Seeded ACTIVE experiment "${EXPERIMENT_NAME}" (id=${experiment._id})`);
  console.log(`   slugTargets : ${slugTargets.length} prize slugs`);
  console.log(`   variants    : promo design (control, 50%), membership design (50%)`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ seed-promo-packages-design-experiment failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the npm scripts**

In `package.json`, alongside the other `seed:*` entries:

```json
"seed:promo-packages-design": "tsx scripts/seed-promo-packages-design-experiment.ts",
"seed:promo-packages-design:dry": "tsx scripts/seed-promo-packages-design-experiment.ts --dry-run",
```

- [ ] **Step 3: Type-check and lint the script**

Run: `npm run type-check`
Expected: no errors. (If `Experiment`/`Variant` `.lean()` typings surface a `slugTargets` type issue, keep the `Array.isArray` guard — it already narrows.)
Run: `npx eslint scripts/seed-promo-packages-design-experiment.ts`
Expected: clean.

- [ ] **Step 4: Dry-run against the DB**

Run: `npm run seed:promo-packages-design:dry`
Expected: prints the target slug list (each toolset's `{brand}-milwaukee` present), the admin `createdBy`, the two variant configs, and any overlap warning. No writes.

> Do NOT run the live `seed:promo-packages-design` here — activation is a deliberate go-live step the user triggers when ready (it starts bucketing real traffic). Leave it to the final rollout.

---

### Task 6: Docs + doc-sync (all touched domains) + winner-swap runbook

**Files:**
- Modify: `docs/ab-testing/` — add the experiment + the "reading results & winner-swap" runbook (spec §7)
- Modify: `docs/promo/`, `docs/subscription/`, `docs/shared-ui/`, `docs/admin/`, `docs/infrastructure/` — one-line notes for the touched files
- Possibly modify: `README.md` / `BUSINESS.md` only if the doc-sync hook flags a business trigger (this change is presentation-only; expected: no business-fact change)

- [ ] **Step 1: Update `docs/ab-testing/`**

Add an entry documenting: the `packages.design` config field; that the experiment is seeded straight-to-active via `scripts/seed-promo-packages-design-experiment.ts`; and the **winner-swap runbook** verbatim from spec §7 — including "read the user-level **Bayesian** panel, ignore the legacy chi-square card," the 14-day window caveat, and the cleanup checklist (config field, validation branch, admin selector, `includeAdditionalForMembers` flag, seed script, this plan/spec).

- [ ] **Step 2: Update the other domain docs**

- `docs/promo/` — `PromoPackages` now branches on `packages.design`; new `PromoMembershipDesign` treatment wrapper.
- `docs/subscription/` — `useMembershipCardCta` gains the opt-in `includeAdditionalForMembers`; new pure helper `selectOneTimeDrawerPackages`.
- `docs/shared-ui/` — `MembershipTierChooser` gains an optional `sectionId` prop; `MembershipSection` emits the diagnostic A/B `package_cta` click.
- `docs/admin/` — `VariantConfigEditor` gains the Package Design selector.
- `docs/infrastructure/` — new seed script + `seed:promo-packages-design[:dry]`, plus the two new `test:*` entries.

- [ ] **Step 3: Run the doc-sync check**

Run: `npm run build` (the Stop hook `doc-sync.mjs` runs on session stop, but building confirms compilation). Then finish the turn so the Stop hook validates docs coverage.
Expected: no `BLOCKED: Stale docs`. If it blocks, add the listed `docs/<domain>/` note. If it blocks with `STALE BUSINESS DOCS`, make a one-line clarifying touch to the relevant `BUSINESS.md` section noting this is a presentation-only A/B test (no tier/price/access change).

---

### Task 7: Full verification + combined commit (gated on user)

**Files:** none (verification + commit)

- [ ] **Step 1: Full type-check + lint**

Run: `npm run type-check`
Expected: clean.
Run: `npm run lint`
Expected: clean.

- [ ] **Step 2: Run the new + affected tests**

Run: `npm run test:variant-config-design`
Run: `npm run test:one-time-drawer-packages`
Run: `npm run test:additional-pack-discount`
Run: `npm run test:package-selection`
Run: `npm run test:special-packages`
Expected: all print their `all assertions passed` lines (the last three confirm the earlier `isAdditional` rename is still green).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Combined commit (ASK FIRST)**

Per the user's instruction, everything ships in **one** commit: the `isMemberOnly → isAdditional` rename (already staged conceptually), this A/B implementation, the spec, and this plan. **Do not run `git commit` without confirming with the user in-session** (CLAUDE.md hard rule #1). When authorized:

```bash
git add -A
git commit -m "feat(ab-testing): promo package-design A/B test (promo vs membership) + isAdditional rename"
```

Expected: hooks pass (`no-auto-commit` authorized; `doc-sync` green). Do not push unless the user says so.

---

## Self-Review

**Spec coverage:**
- §2.3 config field → Task 1 ✓
- §5 member parity (Option A) → Task 2 ✓
- §2.1 branch point + §2.5 treatment wrapper + §4.3 duplicate-anchor fix → Task 3 ✓
- §6 CTA click event, both arms → Task 3 (treatment) + Task 4 (control) ✓
- §2.4 metric = automatic (no code) → Global Constraints + Task 6 runbook (no task needed — verified as a non-requirement) ✓
- §4.5 seed straight-to-active + slug targeting + overlap guard → Task 5 ✓
- §7 winner-swap runbook → Task 6 ✓
- §11 docs → Task 6 ✓

**Placeholder scan:** none — every code step shows complete code; every command shows expected output.

**Type consistency:** `selectOneTimeDrawerPackages(pkgs, { hasAdditionalAccess, includeAdditional })` is defined in Task 2 and called identically in Task 2 Step 6. `useMembershipCardCta({ includeAdditionalForMembers })` defined in Task 2, called in Task 3. `trackEvent(experimentId, variantId, "click", { element: "package_cta", packageId })` identical in Task 3 and Task 4. `packages.design: "promo" | "membership"` consistent across Tasks 1, 3, 5. `sectionId` prop consistent across Tasks 3 (definition + usage).
