# A/B Test — Disable Dark Mode on the Membership Section — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **COMMIT GATE (CLAUDE.md rule 1):** Do NOT run `git add/commit/push` unless the user has explicitly authorized commits this session (keywords: commit, push, merge, make a PR, ship it). If not authorized, complete the code/test/verify steps and SKIP the commit step, telling the user the task is ready to commit. The no-auto-commit hook will block unauthorized commits anyway.

**Goal:** Run a site-wide A/B test that forces the membership section to light mode for a treatment group, so we can measure dark-mode's effect on membership purchase conversion.

**Architecture:** Reuse the existing live A/B infrastructure. Add one optional `membershipTheme.forceLight` field to `VariantConfig`. A dedicated sentinel-slug experiment (`__membership-theme__`) is discovered by a thin read-only route; assignment/tracking/attribution are delegated entirely to the existing `POST /api/ab-testing/assign`. `MembershipSection` reads the resolved flag via a new hook and ANDs it into its single `isDark` line. No global provider, no new tracking, no schema migration (config is `Mixed`).

**Tech Stack:** Next.js 15 App Router, MongoDB/Mongoose, React 19, Zustand, TypeScript. Tests are standalone `tsx` scripts (`node:assert/strict`) wired into `package.json` as `test:<scope>` (no jest/vitest).

---

## File Structure

| File | Responsibility | New? |
| --- | --- | --- |
| `src/models/ab-testing/Variant.ts` | `VariantConfig` type — add `membershipTheme` | modify |
| `src/services/ab-testing/VariantConfigService.ts` | default + merge + validate the new field | modify |
| `src/services/ab-testing/__tests__/variantConfigService.membershipTheme.test.ts` | unit test for default/merge/validate | **create** |
| `package.json` | wire the new `test:` script | modify |
| `src/app/api/ab-testing/membership-theme-experiment/route.ts` | thin read-only experiment discovery | **create** |
| `src/hooks/ab-testing/useMembershipThemeExperiment.ts` | discover + reuse `/assign` + return `forceLight` | **create** |
| `src/components/sections/MembershipSection.tsx` | 1-line behavior change at line 58 | modify |
| `src/components/admin/ab-testing/VariantConfigEditor.tsx` | admin toggle for the new field | modify |
| `docs/ab-testing/*`, `docs/shared-ui/*` | doc sync (CLAUDE.md rule 2) | modify |

---

## Task 1: `VariantConfig.membershipTheme` field + service default/merge/validate

**Files:**
- Modify: `src/models/ab-testing/Variant.ts:63-67`
- Modify: `src/services/ab-testing/VariantConfigService.ts`
- Create: `src/services/ab-testing/__tests__/variantConfigService.membershipTheme.test.ts`
- Modify: `package.json` (test scripts block, near line 25-26)

- [ ] **Step 1: Add the field to the `VariantConfig` interface**

In `src/models/ab-testing/Variant.ts`, the interface currently ends:

```ts
  /** Package color overrides for split testing - one slot maps to one COLOR_KEYS value */
  packageColors?: {
    oneTime?: Partial<Record<OneTimePackageSlot, COLOR_KEYS>>;
    membership?: Partial<Record<MembershipPackageSlot, COLOR_KEYS>>;
  };
}
```

Add the new optional field immediately before the closing brace of `VariantConfig`:

```ts
  /** Package color overrides for split testing - one slot maps to one COLOR_KEYS value */
  packageColors?: {
    oneTime?: Partial<Record<OneTimePackageSlot, COLOR_KEYS>>;
    membership?: Partial<Record<MembershipPackageSlot, COLOR_KEYS>>;
  };
  /**
   * A/B test: when forceLight is true, the membership section renders in light
   * mode regardless of the global dark-mode schedule/toggle.
   */
  membershipTheme?: {
    forceLight?: boolean;
  };
}
```

- [ ] **Step 2: Add default + merge + validation in `VariantConfigService.ts`**

In `getDefaultConfig()`, add `membershipTheme` after `packageColors`:

```ts
      packageColors: {
        oneTime: {},
        membership: {},
      },
      membershipTheme: {
        forceLight: false,
      },
    };
  }
```

In `mergeVariantConfig()`, add a `membershipTheme` merge block after the `packageColors` block (before the closing `};`):

```ts
      packageColors: {
        oneTime: {
          ...baseConfig.packageColors?.oneTime,
          ...variantConfig.packageColors?.oneTime,
        },
        membership: {
          ...baseConfig.packageColors?.membership,
          ...variantConfig.packageColors?.membership,
        },
      },
      membershipTheme: {
        ...baseConfig.membershipTheme,
        ...variantConfig.membershipTheme,
      },
    };
  }
```

In `validateVariantConfig()`, add a validation block right before the final `return { valid: errors.length === 0, errors };`:

```ts
    // Validate membershipTheme config (A/B dark-mode test)
    if (cfg.membershipTheme !== undefined) {
      if (typeof cfg.membershipTheme !== "object" || cfg.membershipTheme === null) {
        errors.push("MembershipTheme config must be an object");
      } else {
        const membershipTheme = cfg.membershipTheme as Record<string, unknown>;
        if (
          membershipTheme.forceLight !== undefined &&
          typeof membershipTheme.forceLight !== "boolean"
        ) {
          errors.push("MembershipTheme forceLight must be a boolean");
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
```

- [ ] **Step 3: Write the failing test**

Create `src/services/ab-testing/__tests__/variantConfigService.membershipTheme.test.ts`:

```ts
import assert from "node:assert/strict";
import VariantConfigService from "../VariantConfigService";

function run() {
  // Default config has forceLight=false (control behaves as today)
  const def = VariantConfigService.getDefaultConfig();
  assert.equal(def.membershipTheme?.forceLight, false, "default forceLight is false");

  // Control variant (empty config) merges to forceLight=false
  const control = VariantConfigService.mergeVariantConfig(def, {});
  assert.equal(control.membershipTheme?.forceLight, false, "control merged forceLight is false");

  // Treatment variant overrides forceLight=true
  const treatment = VariantConfigService.mergeVariantConfig(def, {
    membershipTheme: { forceLight: true },
  });
  assert.equal(treatment.membershipTheme?.forceLight, true, "treatment merged forceLight is true");

  // Validation: valid boolean passes
  const ok = VariantConfigService.validateVariantConfig({ membershipTheme: { forceLight: true } });
  assert.equal(ok.valid, true, `valid membershipTheme should pass: ${ok.errors.join(", ")}`);

  // Validation: non-boolean forceLight fails
  const bad = VariantConfigService.validateVariantConfig({ membershipTheme: { forceLight: "yes" } });
  assert.equal(bad.valid, false, "non-boolean forceLight should fail validation");
  assert.ok(
    bad.errors.some((e) => e.includes("forceLight")),
    "error message mentions forceLight",
  );

  console.log("variantConfigService.membershipTheme: all assertions passed");
}

run();
```

- [ ] **Step 4: Wire the test into `package.json`**

In `package.json`, in the scripts block next to the other `test:` entries (e.g. after line 26 `"test:electric-scheme": ...`), add:

```json
    "test:variant-config-membership-theme": "tsx src/services/ab-testing/__tests__/variantConfigService.membershipTheme.test.ts",
```

- [ ] **Step 5: Run the test — expect PASS**

Run: `npm run test:variant-config-membership-theme`
Expected: `variantConfigService.membershipTheme: all assertions passed` and exit code 0.
(If it fails, the assertion message names the broken case — fix Step 1/2 accordingly.)

- [ ] **Step 6: Commit** (only if commits authorized — see COMMIT GATE)

```bash
git add src/models/ab-testing/Variant.ts src/services/ab-testing/VariantConfigService.ts src/services/ab-testing/__tests__/variantConfigService.membershipTheme.test.ts package.json
git commit -m "feat(ab-testing): add membershipTheme.forceLight to VariantConfig

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Read-only experiment-discovery route

**Files:**
- Create: `src/app/api/ab-testing/membership-theme-experiment/route.ts`

**Context:** `ExperimentRepository.findActiveBySlug(slug)` matches `slugTargets: { $in: [slug, "*"] }`. Passing the sentinel `"__membership-theme__"` finds only an experiment whose `slugTargets` contains that exact string (or `"*"`, which we never create). Promo pages call `getActiveExperimentForSlug("<prize-slug>")`, which can never match the sentinel — no collision. This route does NOT assign or track (that is the existing `/assign` route's job), so it performs no DB writes and is safe as a GET.

- [ ] **Step 1: Create the route**

Create `src/app/api/ab-testing/membership-theme-experiment/route.ts`:

```ts
import { NextResponse } from "next/server";
import experimentService from "@/services/ab-testing/ExperimentService";

/** Sentinel slug target that isolates the site-wide membership dark-mode test
 *  from slug-targeted promo experiments. Must match the experiment's
 *  slugTargets in the admin UI. Documented in docs/ab-testing/. */
const MEMBERSHIP_THEME_SLUG = "__membership-theme__";

/**
 * GET /api/ab-testing/membership-theme-experiment
 * Returns the active site-wide membership dark-mode experiment id (or null).
 * Read-only: assignment/tracking is delegated to POST /api/ab-testing/assign.
 */
export async function GET() {
  try {
    const experiment = await experimentService.getActiveExperimentForSlug(
      MEMBERSHIP_THEME_SLUG,
    );
    return NextResponse.json({
      experimentId: experiment ? String(experiment._id) : null,
    });
  } catch (error) {
    console.error("Error resolving membership-theme experiment:", error);
    // Fail soft: no experiment -> membership section keeps today's behavior.
    return NextResponse.json({ experimentId: null });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: exit 0, no errors referencing this file. (`experimentService` default export and `getActiveExperimentForSlug` exist in `src/services/ab-testing/ExperimentService.ts`.)

- [ ] **Step 3: Manual smoke (no experiment yet → null)**

Run: `npm run dev`, then in another shell:
`curl -s http://localhost:3000/api/ab-testing/membership-theme-experiment`
Expected JSON: `{"experimentId":null}` (no active sentinel experiment exists yet).

- [ ] **Step 4: Commit** (only if commits authorized — see COMMIT GATE)

```bash
git add src/app/api/ab-testing/membership-theme-experiment/route.ts
git commit -m "feat(ab-testing): add read-only membership-theme experiment discovery route

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `useMembershipThemeExperiment` hook

**Files:**
- Create: `src/hooks/ab-testing/useMembershipThemeExperiment.ts`

**Context:** The hook discovers the experiment id, then reuses `POST /api/ab-testing/assign` with a CONSTANT slug `"__membership-theme__"`. A constant (non-empty) slug is required because the existing `/assign` Zod schema enforces `slug.min(1)` — deriving slug from pathname would 400 on the homepage (`/`). The `/assign` call performs sticky assignment, admin exclusion, admin preview, deduped `page_view`, the `ta_anon_id` cookie, and the `ta_ab_assignment_<id>` attribution cookie that `pixel-purchase-tracking.ts` reads. The hook returns `forceLight=false` during SSR / loading / any failure / admin (graceful = today's behavior).

- [ ] **Step 1: Create the hook**

Create `src/hooks/ab-testing/useMembershipThemeExperiment.ts`:

```ts
"use client";

import { useEffect, useRef, useState } from "react";
import type { VariantConfig } from "@/models/ab-testing/Variant";

/** Must match the route + the experiment's slugTargets in the admin UI. */
const MEMBERSHIP_THEME_SLUG = "__membership-theme__";
const CACHE_KEY = "ab_membership_theme_v1";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface Resolved {
  forceLight: boolean;
}

interface CacheShape extends Resolved {
  timestamp: number;
}

function readCache(): Resolved | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheShape;
    if (Date.now() - parsed.timestamp > CACHE_TTL) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return { forceLight: !!parsed.forceLight };
  } catch {
    return null;
  }
}

function writeCache(value: Resolved): void {
  if (typeof window === "undefined") return;
  try {
    const payload: CacheShape = { ...value, timestamp: Date.now() };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / serialization errors
  }
}

/**
 * Resolves whether the membership section should be forced to light mode for
 * the current visitor under the site-wide membership dark-mode A/B test.
 * Returns { forceLight: false } unless the visitor is bucketed into a
 * treatment variant whose config has membershipTheme.forceLight === true.
 */
export function useMembershipThemeExperiment(): Resolved {
  const [forceLight, setForceLight] = useState(false);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const cached = readCache();
    if (cached) {
      setForceLight(cached.forceLight);
      return;
    }

    let aborted = false;
    const controller = new AbortController();

    (async () => {
      try {
        // 1. Discover the active site-wide experiment.
        const discRes = await fetch(
          "/api/ab-testing/membership-theme-experiment",
          { signal: controller.signal },
        );
        if (!discRes.ok) return;
        const { experimentId } = (await discRes.json()) as {
          experimentId: string | null;
        };
        if (!experimentId) {
          writeCache({ forceLight: false });
          return;
        }

        // 2. Reuse the existing assignment + tracking + attribution funnel.
        const assignRes = await fetch("/api/ab-testing/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ experimentId, slug: MEMBERSHIP_THEME_SLUG }),
          signal: controller.signal,
        });
        if (!assignRes.ok) return;
        const data = (await assignRes.json()) as {
          variantConfig: VariantConfig | null;
        };
        const resolved: Resolved = {
          forceLight: data.variantConfig?.membershipTheme?.forceLight === true,
        };
        writeCache(resolved);
        if (!aborted) setForceLight(resolved.forceLight);
      } catch {
        // Network/abort -> keep today's behavior (forceLight stays false).
      }
    })();

    return () => {
      aborted = true;
      controller.abort();
    };
  }, []);

  return { forceLight };
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: exit 0. (`VariantConfig.membershipTheme` exists from Task 1.)

- [ ] **Step 3: Commit** (only if commits authorized — see COMMIT GATE)

```bash
git add src/hooks/ab-testing/useMembershipThemeExperiment.ts
git commit -m "feat(ab-testing): add useMembershipThemeExperiment hook

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Wire the flag into `MembershipSection`

**Files:**
- Modify: `src/components/sections/MembershipSection.tsx` (imports block + line 58)

- [ ] **Step 1: Add the import**

In `src/components/sections/MembershipSection.tsx`, add this import alongside the other hook imports (near the top, with the other `@/hooks` imports):

```ts
import { useMembershipThemeExperiment } from "@/hooks/ab-testing/useMembershipThemeExperiment";
```

- [ ] **Step 2: Change the single theme line (line 58)**

Replace exactly this line:

```ts
  const isDark = useThemeStore((s) => s.theme === "dark");
```

with:

```ts
  const { forceLight } = useMembershipThemeExperiment();
  const isDark = useThemeStore((s) => s.theme === "dark") && !forceLight;
```

Leave every other line (including `useVariantContext()` at line 64) untouched. Every `ElectricPackageCard` already derives light/dark from `isDark`.

- [ ] **Step 3: Type-check + lint**

Run: `npm run type-check`
Expected: exit 0.
Run: `npm run lint -- src/components/sections/MembershipSection.tsx src/hooks/ab-testing/useMembershipThemeExperiment.ts`
Expected: no errors.

- [ ] **Step 4: Manual verification (no experiment → unchanged)**

With `npm run dev` and NO active sentinel experiment: open `/`, `/membership`, and a `/promotions/<slug>` page. The membership section must look exactly as before (dark in dark hours, light in light hours). Confirm `curl .../api/ab-testing/membership-theme-experiment` returns `{"experimentId":null}`.

- [ ] **Step 5: Commit** (only if commits authorized — see COMMIT GATE)

```bash
git add src/components/sections/MembershipSection.tsx
git commit -m "feat(ab-testing): gate membership section dark mode behind forceLight flag

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Admin toggle in `VariantConfigEditor`

**Files:**
- Modify: `src/components/admin/ab-testing/VariantConfigEditor.tsx:83-89` (formData init)
- Modify: `src/components/admin/ab-testing/VariantConfigEditor.tsx:632-655` (new FormSection)

- [ ] **Step 1: Seed `membershipTheme` into form state**

In the `useState<CreateVariantPayload>` initializer `config` block (lines 83-89), add `membershipTheme` after `packageColors`:

```ts
    config: {
      hero: variant?.config?.hero ?? {},
      banner: variant?.config?.banner ?? {},
      packages: variant?.config?.packages ?? {},
      membershipModal: variant?.config?.membershipModal ?? {},
      packageColors: variant?.config?.packageColors ?? { oneTime: {}, membership: {} },
      membershipTheme: variant?.config?.membershipTheme ?? {},
    },
```

- [ ] **Step 2: Add the toggle UI**

Immediately AFTER the closing `</FormSection>` of the "Membership Modal Configuration" block (after line 655, before the `{/* Error Display */}` comment), add a new section:

```tsx
      {/* Membership Section Theme (A/B dark-mode test) */}
      <FormSection title="Membership Section Theme" icon={Palette}>
        <div className="space-y-4">
          <Checkbox
            id="membershipForceLight"
            name="membershipForceLight"
            checked={formData.config.membershipTheme?.forceLight ?? false}
            onChange={(e) =>
              setFormData({
                ...formData,
                config: {
                  ...formData.config,
                  membershipTheme: {
                    ...formData.config.membershipTheme,
                    forceLight: e.target.checked,
                  },
                },
              })
            }
            label="Force light mode on the membership section"
            description="A/B test: when enabled, the membership section always renders in light mode for this variant, ignoring the site's dark-mode schedule/toggle. Leave OFF for the control variant."
          />
        </div>
      </FormSection>
```

(`Palette` is already imported on line 4; `Checkbox` and `FormSection` are already imported on line 5. If TypeScript reports `CreateVariantPayload.config` does not allow `membershipTheme`, confirm Task 1 Step 1 was applied — `CreateVariantPayload.config` is typed as `VariantConfig`.)

- [ ] **Step 3: Type-check + lint**

Run: `npm run type-check`
Expected: exit 0.
Run: `npm run lint -- src/components/admin/ab-testing/VariantConfigEditor.tsx`
Expected: no errors.

- [ ] **Step 4: Commit** (only if commits authorized — see COMMIT GATE)

```bash
git add src/components/admin/ab-testing/VariantConfigEditor.tsx
git commit -m "feat(ab-testing): admin toggle for membership section forceLight

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Documentation + final verification

**Files:**
- Modify: `docs/ab-testing/architecture.md`, `docs/ab-testing/gotchas.md`, `docs/ab-testing/README.md` (fill the relevant TODO stubs)
- Modify: the membership-section doc under `docs/shared-ui/` (the file describing `src/components/sections/`)
- Modify: a file under `docs/admin/` (required — `VariantConfigEditor.tsx` is in the **admin** domain per the Domain Manifest; doc-sync blocks otherwise)
- Modify: a file under `docs/infrastructure/` (required — the new `package.json` `test:` script is in the **infrastructure** domain; doc-sync blocks otherwise)

**Why four domains:** the doc-sync Stop hook groups every non-trivial touched
source/config file by Domain Manifest path and requires a changed doc in EACH
affected domain. Touched: ab-testing (`Variant.ts`, `VariantConfigService.ts`,
test, route, hook), shared-ui (`MembershipSection.tsx`), admin
(`VariantConfigEditor.tsx`), infrastructure (`package.json`). All four need a
doc edit in the same working tree before Stop.

- [ ] **Step 1: Document the experiment + sentinel-slug convention**

Append to `docs/ab-testing/architecture.md` (replace the `TODO` stub content if it is only a stub):

```markdown
## Site-wide membership dark-mode experiment

A site-wide experiment can target the membership section without a global
VariantProvider. Mechanism:

- The experiment uses the **sentinel slug target `__membership-theme__`** (NOT
  `*`). `ExperimentRepository.findActiveBySlug` matches
  `slugTargets: { $in: [slug, "*"] }`; using `*` would make the experiment
  resolve on `/promotions/[slug]` too and collide with promo experiments
  (newest `createdAt` wins). The sentinel can never match a real prize slug.
- `GET /api/ab-testing/membership-theme-experiment` is a read-only discovery
  route returning `{ experimentId | null }`. It performs no writes.
- `useMembershipThemeExperiment()` discovers the id, then POSTs the existing
  `/api/ab-testing/assign` with the CONSTANT slug `__membership-theme__`
  (the assign Zod schema requires a non-empty slug; a pathname-derived slug
  would 400 on `/`). Assignment, admin exclusion, preview, deduped page_view,
  and the `ta_ab_assignment_<id>` attribution cookie are all reused.
- `VariantConfig.membershipTheme.forceLight` (default false) is the only new
  config field. `MembershipSection` ANDs `!forceLight` into its `isDark` line.
- Conversion = membership purchase, attributed via the existing
  `pixel-purchase-tracking.ts` cookie path. No new tracking code.
```

Append to `docs/ab-testing/gotchas.md`:

```markdown
- **Never reuse the `__membership-theme__` sentinel slug** for an unrelated
  experiment, and never give the membership dark-mode experiment `slugTargets`
  of a real prize slug or `*` — `*` collides with promo experiments.
- The membership dark-mode test is **diluted, not biased**: control only
  differs from treatment during dark hours, so it needs more samples to reach
  significance. This is expected and was an accepted product trade-off.
- Stray `dark:` Tailwind in `MembershipSection` edge UI (e.g. "no packages"
  fallback, promo header) is NOT driven by the `theme` prop and stays
  schedule-driven even for the treatment variant. Out of scope by design.
```

In `docs/ab-testing/README.md`, replace any `TODO` stub line with a one-line
pointer: `See architecture.md "Site-wide membership dark-mode experiment".`

- [ ] **Step 2: Update the shared-ui membership doc**

In the `docs/shared-ui/` doc that documents `src/components/sections/`, add a
note under the membership section description:

```markdown
`MembershipSection` light/dark is controlled by the single `isDark` value
(line ~58), which feeds the `theme` prop of every `ElectricPackageCard`. It is
gated by the site-wide A/B flag `useMembershipThemeExperiment().forceLight`
(see docs/ab-testing/architecture.md). With no active experiment, behavior is
unchanged (schedule/toggle driven).
```

- [ ] **Step 3: Update the admin + infrastructure domain docs (doc-sync requirement)**

In the most relevant file under `docs/admin/` (the one documenting
`src/components/admin/` editors — likely `frontend.md`), add:

```markdown
### A/B variant editor — membership section theme

`VariantConfigEditor` has a "Membership Section Theme" section with a
**Force light mode on the membership section** checkbox
(`config.membershipTheme.forceLight`). Leave OFF for the control variant; ON
for the treatment variant of the site-wide membership dark-mode A/B test.
See docs/ab-testing/architecture.md.
```

In the most relevant file under `docs/infrastructure/` (the one documenting
`package.json` scripts — likely `commands.md` or `README.md`), add:

```markdown
- `npm run test:variant-config-membership-theme` — unit test for
  `VariantConfig.membershipTheme.forceLight` default/merge/validation
  (A/B membership dark-mode test). Standalone `tsx` script.
```

If a more appropriate file exists in either domain folder, edit that instead —
the requirement is only that at least one file under `docs/admin/` and one
under `docs/infrastructure/` is changed with accurate content.

- [ ] **Step 4: Full verification pass**

Run each and confirm:
- `npm run test:variant-config-membership-theme` → `all assertions passed`
- `npm run type-check` → exit 0
- `npm run lint` → exit 0 (no new errors)

- [ ] **Step 5: doc-sync hook check**

The `Stop` hook (`.claude/hooks/doc-sync.mjs`) verifies docs match touched
source across ALL affected domains (ab-testing, shared-ui, admin,
infrastructure). Confirm no `BLOCKED: Stale docs`. If blocked, update the exact
doc files it lists for the exact domains it names.

- [ ] **Step 6: Commit** (only if commits authorized — see COMMIT GATE)

```bash
git add docs/ab-testing docs/shared-ui docs/admin docs/infrastructure docs/superpowers
git commit -m "docs(ab-testing): document site-wide membership dark-mode experiment

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Post-implementation: how to actually run the experiment (no code)

This is operator action, not an implementation step. After the code ships,
in the A/B admin UI:

1. Create an experiment, `slugTargets = ["__membership-theme__"]`, status
   `draft` → `active`, with start/end dates as desired.
2. Add two variants:
   - **Control**: `isControl = true`, "Force light mode" OFF.
   - **Treatment**: "Force light mode" ON.
3. Set the traffic split (default 50/50) so it sums to 100%.
4. QA as admin via the existing `ta_ab_preview_<experimentId>` cookie (admins
   are excluded from real assignment).
5. Read results in the existing experiment analytics (chi-square / Wilson,
   auto-aggregated). Interpret with the dilution caveat from gotchas.md.

---

## Self-Review (completed by plan author)

- **Spec coverage:** schema field (Task 1) ✓; default/merge/validate (Task 1) ✓;
  read-only discovery route + sentinel slug, no `*` (Task 2) ✓; hook reusing
  `/assign` with constant slug (Task 3) ✓; one-line `MembershipSection` change
  (Task 4) ✓; admin toggle (Task 5) ✓; conversion reuse — no new code, covered
  by Task 3 reuse + documented (Task 6) ✓; docs incl. sentinel convention
  (Task 6) ✓; acceptance criteria exercised by Task 4 Step 4 + Task 6 Step 3 ✓.
  Out-of-scope items (no global provider, no sessionTheme, no promo-page change)
  are respected — no task touches them.
- **doc-sync coverage (10x review fix):** verified `.claude/hooks/doc-sync.mjs`
  groups every non-trivial touched file by Domain Manifest path and requires a
  changed doc per domain. Task 6 updates all four affected domains —
  ab-testing, shared-ui, admin (`VariantConfigEditor.tsx`), infrastructure
  (`package.json` test script) — so the Stop hook will not block.
- **CreateVariantPayload (10x review check):** `useABTestingQueries`
  `CreateVariantPayload.config` is `Variant["config"]` which is `VariantConfig`
  — the new `membershipTheme` field propagates; Task 5 is type-safe.
- **Placeholder scan:** no TBD/TODO-as-instruction; all code blocks complete;
  doc steps contain literal content to paste, not "update docs".
- **Type consistency:** `membershipTheme?: { forceLight?: boolean }` used
  identically in Variant.ts, VariantConfigService, the hook
  (`data.variantConfig?.membershipTheme?.forceLight === true`), and the admin
  editor (`formData.config.membershipTheme?.forceLight`). Slug constant
  `"__membership-theme__"` is identical in the route, the hook, and the docs.
  Route uses `experimentService` default export + `_id` (matches
  `ExperimentService`/`ExperimentRepository`).
