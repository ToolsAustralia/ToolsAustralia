# Promo Landing Default-Theme A/B Split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run a 50/50 experiment on `/promotions/*` that sends half of new visitors through with **dark** as their default theme (control = light), without ever showing a light→dark snap.

**Architecture:** The promo page already resolves an active experiment server-side at ISR time; we bake a second, sentinel-targeted experiment id into the same static HTML. A client hook makes one `POST /api/ab-testing/assign` call, and an **overlay** gate holds a full-screen loader *on top of* the real (still server-rendered) page until the theme is applied. Theme is written to the global `ta-theme` store, so it sticks site-wide and across visits; a manual toggle wins permanently.

**Tech Stack:** Next.js 15 App Router (ISR), React 19, zustand + persist, Mongoose, Zod, `tsx` standalone test scripts.

## Global Constraints

- **No test runner.** Tests are standalone `tsx` scripts under `src/**/__tests__/*.test.ts`, each wired to its own `package.json` script. **An unwired test file is undiscoverable** — always add the `test:*` entry in the same task.
- **Commits require explicit authorization** (repo rule 1). At time of writing, commits are **not** authorized this session. Ask before running any `git commit`. The commit steps below are written out but must not run until authorized.
- **Docs land with their task** (repo rule 2). The doc-sync `Stop` hook blocks a turn that edits `src/` or `scripts/` without updating the matching `docs/<domain>/`. Each task below names its doc file.
- **`/promotions/[slug]` must stay ISR-static.** `dynamicParams = false`, `revalidate = 60`, marketing CSP class. Verify with the `next build` route table after any middleware or page change.
- **Never edit the CSP-hashed inline snippets.** `npm run test:csp-inline-hashes` must stay green.
- **`userManualOverride` is never persisted as `false`.** Absent until a toggle sets it `true`. A stored `false` makes both readers demote dark→light.
- **Customer-facing copy:** no new customer strings in this work. If any appear, rule 11 applies (free-entry framing, never gambling).
- Sentinel slug constant value: `"__promo-theme__"`.

**Spec:** [`docs/superpowers/specs/2026-07-28-promo-theme-split-design.md`](../specs/2026-07-28-promo-theme-split-design.md)

## File Structure

| File | Responsibility |
|---|---|
| `src/models/ab-testing/Variant.ts` | `VariantConfig.promoTheme` **interface only** (`config` is `Mixed`) |
| `src/services/ab-testing/VariantConfigService.ts` | Merge / default / validate the new key — **without this the test is an A/A** |
| `src/components/admin/ab-testing/VariantConfigEditor.tsx` | Round-trip the key through admin saves + expose a control |
| `src/repositories/ab-testing/ExperimentRepository.ts` | `findActiveBySentinelSlug` — exact match, no `"*"` |
| `src/services/ab-testing/ExperimentService.ts` | `getActiveExperimentForSentinelSlug` passthrough |
| `src/utils/ab-testing/get-user-experiment-assignment.ts` | Register `__promo-theme__` as a non-conversion sentinel |
| `src/stores/useThemeStore.ts` | v2 + `userManualOverride`, set only by user gestures |
| `src/contexts/ThemeContext.tsx` | `[theme]` sync promoted to `useLayoutEffect` |
| `src/lib/ab-testing/anon-id-cookie.ts` | **New.** Edge-safe cookie name/TTL/validation shared by middleware + service |
| `src/middleware.ts` | Mint `ta_anon_id` once so concurrent `/assign` calls share one identity |
| `src/hooks/ab-testing/usePromoThemeExperiment.ts` | **New.** Resolve the arm; synchronous short-circuits |
| `src/components/ab-testing/PromoThemeExperimentGate.tsx` | **New.** Overlay hold + the ordered reveal sequence |
| `src/components/sections/promo/PromoHero.tsx` | Withhold theme-forked art until settled |
| `src/app/promotions/[slug]/page.tsx`, `_components/ToolsetLandingPage.tsx` | Bake sentinel id, mount gate, skip unfair preload |
| `scripts/seed-promo-theme-experiment.ts` | **New.** Draft experiment + 2 variants |

---

### Task 1: Plumb `promoTheme` through the variant config

**This is the blocking task.** `mergeVariantConfig` rebuilds config from a hard-coded six-key literal with no spread, so an unwired `promoTheme` is stripped between Mongo and the client and **both arms render light while the dashboard shows a healthy 50/50 test**. `tsc` cannot catch it — the field is optional.

**Files:**
- Modify: `src/models/ab-testing/Variant.ts` (interface only, after `membershipTheme`)
- Modify: `src/services/ab-testing/VariantConfigService.ts:11-34, 40-82, ~237-250`
- Test: `src/services/ab-testing/__tests__/variantConfigService.membershipTheme.test.ts`
- Docs: `docs/ab-testing/architecture.md`

**Interfaces:**
- Produces: `VariantConfig.promoTheme?: { defaultTheme?: "light" | "dark" }`; `getDefaultConfig().promoTheme.defaultTheme === "light"`.

- [ ] **Step 1: Write the failing test**

Append inside `run()` in `variantConfigService.membershipTheme.test.ts`, before the final `console.log`:

```ts
  // promoTheme (promo landing default-theme experiment).
  // Guards the merge whitelist: mergeVariantConfig rebuilds config from an explicit
  // key list, so a new key that isn't added there is silently dropped on read —
  // which would make the theme experiment an A/A with plausible-looking data.
  assert.equal(def.promoTheme?.defaultTheme, "light", "default promoTheme is light");

  const darkArm = VariantConfigService.mergeVariantConfig(def, {
    promoTheme: { defaultTheme: "dark" },
  });
  assert.equal(darkArm.promoTheme?.defaultTheme, "dark", "merged promoTheme survives as dark");

  const lightArm = VariantConfigService.mergeVariantConfig(def, {
    promoTheme: { defaultTheme: "light" },
  });
  assert.equal(lightArm.promoTheme?.defaultTheme, "light", "explicit light arm survives merge");

  const controlArm = VariantConfigService.mergeVariantConfig(def, {});
  assert.equal(controlArm.promoTheme?.defaultTheme, "light", "empty config falls back to light");

  const okTheme = VariantConfigService.validateVariantConfig({
    promoTheme: { defaultTheme: "dark" },
  });
  assert.equal(okTheme.valid, true, `valid promoTheme should pass: ${okTheme.errors.join(", ")}`);

  const badTheme = VariantConfigService.validateVariantConfig({
    promoTheme: { defaultTheme: "purple" },
  });
  assert.equal(badTheme.valid, false, "unknown defaultTheme should fail validation");
  assert.ok(
    badTheme.errors.some((e) => e.includes("defaultTheme")),
    "error message mentions defaultTheme",
  );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:variant-config-membership-theme`
Expected: FAIL on the first new assertion — `default promoTheme is light` (actual `undefined`).

- [ ] **Step 3: Add the interface field**

In `src/models/ab-testing/Variant.ts`, immediately after the `membershipTheme` block and before the closing `}` of `interface VariantConfig`:

```ts
  /**
   * A/B test: the theme a bucketed visitor is defaulted into on promo landings.
   * Applied only when the visitor has never used the theme toggle; a manual
   * toggle wins permanently. Control carries "light" explicitly so the admin
   * UI reads unambiguously rather than relying on an absent key.
   *
   * NOTE: `config` is Schema.Types.Mixed, so there is no schema-side change —
   * but this key MUST also be added to VariantConfigService (merge + default +
   * validate) or it is stripped before it reaches the client.
   */
  promoTheme?: {
    defaultTheme?: "light" | "dark";
  };
```

- [ ] **Step 4: Add the default**

In `getDefaultConfig()`, after the `membershipTheme` entry:

```ts
      promoTheme: {
        defaultTheme: "light",
      },
```

- [ ] **Step 5: Add the merge branch**

In `mergeVariantConfig()`, after the `membershipTheme` entry:

```ts
      promoTheme: {
        ...baseConfig.promoTheme,
        ...variantConfig.promoTheme,
      },
```

- [ ] **Step 6: Add validation**

In `validateVariantConfig()`, after the `membershipTheme` block and before `return {`:

```ts
    // Validate promoTheme config (promo landing default-theme A/B test)
    if (cfg.promoTheme !== undefined) {
      if (typeof cfg.promoTheme !== "object" || cfg.promoTheme === null) {
        errors.push("PromoTheme config must be an object");
      } else {
        const promoTheme = cfg.promoTheme as Record<string, unknown>;
        if (
          promoTheme.defaultTheme !== undefined &&
          promoTheme.defaultTheme !== "light" &&
          promoTheme.defaultTheme !== "dark"
        ) {
          errors.push('PromoTheme defaultTheme must be "light" or "dark"');
        }
      }
    }
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm run test:variant-config-membership-theme`
Expected: PASS, ending `variantConfigService.membershipTheme + disableVideo: all assertions passed`

- [ ] **Step 8: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 9: Update docs**

In `docs/ab-testing/architecture.md`, add a section documenting `promoTheme.defaultTheme` and stating the whitelist footgun: *a new `VariantConfig` key must be added to `mergeVariantConfig`, `getDefaultConfig` and `validateVariantConfig`, or it is silently dropped on read; `tsc` cannot catch it because config keys are optional.*

- [ ] **Step 10: Commit** *(only if authorized — see Global Constraints)*

```bash
git add src/models/ab-testing/Variant.ts src/services/ab-testing/VariantConfigService.ts src/services/ab-testing/__tests__/variantConfigService.membershipTheme.test.ts docs/ab-testing/architecture.md
git commit -m "feat(ab-testing): plumb promoTheme through variant config merge/default/validate"
```

---

### Task 2: Stop admin saves from wiping `promoTheme`

`VariantConfigEditor`'s form state is built from the **same six-key whitelist**, and `handleSubmit` PATCHes `config` wholesale — so the spec's own rollout step ("seed as draft, review in admin") deletes the field again even after Task 1.

**Files:**
- Modify: `src/components/admin/ab-testing/VariantConfigEditor.tsx:83-90` and the `membershipTheme` FormSection (~`:693-715`)
- Docs: `docs/admin/`

**Interfaces:**
- Consumes: `VariantConfig.promoTheme` (Task 1).

- [ ] **Step 1: Make the initializer preserve unknown keys**

Replace the `config:` initializer object so stored keys survive round-trip. Keep the explicit keys (other code reads them as always-present) but spread first:

```ts
    config: {
      ...(variant?.config ?? {}),
      hero: variant?.config?.hero ?? {},
      banner: variant?.config?.banner ?? {},
      packages: variant?.config?.packages ?? {},
      membershipModal: variant?.config?.membershipModal ?? {},
      packageColors: variant?.config?.packageColors ?? { oneTime: {}, membership: {} },
      membershipTheme: variant?.config?.membershipTheme ?? {},
      promoTheme: variant?.config?.promoTheme ?? {},
    },
```

- [ ] **Step 2: Add the control**

After the closing `</FormSection>` of "Membership Section Theme", add:

```tsx
      {/* Promo Landing Default Theme (A/B theme-split test) */}
      <FormSection title="Promo Landing Default Theme" icon={Palette}>
        <div className="space-y-4">
          <Select
            id="promoDefaultTheme"
            name="promoDefaultTheme"
            value={formData.config.promoTheme?.defaultTheme ?? "light"}
            onChange={(e) =>
              setFormData({
                ...formData,
                config: {
                  ...formData.config,
                  promoTheme: {
                    ...formData.config.promoTheme,
                    defaultTheme: e.target.value as "light" | "dark",
                  },
                },
              })
            }
            options={[
              { value: "light", label: "Light (control)" },
              { value: "dark", label: "Dark" },
            ]}
            label="Default theme for bucketed visitors"
            description="A/B test: the theme a visitor is sent through with on promo landings. Applied only to visitors who have never used the theme toggle; a manual toggle always wins. Set 'Light (control)' for the control variant."
          />
        </div>
      </FormSection>
```

If no `Select` primitive is imported in this file, check its sibling imports and use the same select component the rest of the editor uses; otherwise fall back to a native `<select>` styled like the neighbouring fields. Do **not** invent a new UI primitive.

- [ ] **Step 3: Type-check and lint**

Run: `npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual round-trip check**

Start `npm run dev`, open admin → A/B Testing → any draft experiment → edit a variant, set the new select to **Dark**, save, reopen. Expected: the select still reads **Dark**. This is the check Task 1's unit test cannot make — it exercises the PATCH path.

- [ ] **Step 5: Update docs**

In `docs/admin/`, document the new variant-config control and note that the editor's `config` initializer must spread stored config so unknown keys survive a save.

- [ ] **Step 6: Commit** *(only if authorized)*

```bash
git add src/components/admin/ab-testing/VariantConfigEditor.tsx docs/admin/
git commit -m "fix(admin): preserve unknown variant config keys on save; add promo theme control"
```

---

### Task 3: Exact-match sentinel lookup

`findActiveBySlug` matches `slugTargets: { $in: [slug, "*"] }` sorted `createdAt: -1`, and admin offers one-click "All Pages" → `["*"]`. So any **wildcard** experiment created after the theme experiment is returned for the sentinel lookup — it would hold all promo traffic on a config with no `promoTheme` and inject `page_view` rows tagged `__promo-theme__` into an unrelated experiment. `findOne` means post-filtering cannot fix it.

**Files:**
- Modify: `src/repositories/ab-testing/ExperimentRepository.ts` (after `findActiveBySlug`)
- Modify: `src/services/ab-testing/ExperimentService.ts` (after `getActiveExperimentForSlug`)
- Modify: `src/app/api/ab-testing/membership-theme-experiment/route.ts` (same latent bug)
- Create: `src/repositories/ab-testing/__tests__/experimentQuery.test.ts`
- Modify: `package.json`
- Docs: `docs/ab-testing/gotchas.md`, `docs/ab-testing/architecture.md`

**Interfaces:**
- Produces: `buildActiveExperimentQuery(slug: string, opts: { allowWildcard: boolean }, now: Date): Record<string, unknown>`; `ExperimentRepository.findActiveBySentinelSlug(slug: string): Promise<IExperiment | null>`; `ExperimentService.getActiveExperimentForSentinelSlug(slug: string)`.

- [ ] **Step 1: Write the failing test**

Create `src/repositories/ab-testing/__tests__/experimentQuery.test.ts`:

```ts
import assert from "node:assert/strict";
import { buildActiveExperimentQuery } from "../ExperimentRepository";

function run() {
  const now = new Date("2026-07-28T00:00:00.000Z");

  // Page-targeted lookups still match a wildcard experiment — existing behaviour.
  const page = buildActiveExperimentQuery("milwaukee-gearwrench", { allowWildcard: true }, now);
  assert.deepEqual(
    page.slugTargets,
    { $in: ["milwaukee-gearwrench", "*"] },
    "page lookup keeps wildcard matching",
  );

  // Sentinel lookups must NOT match "*", or a wildcard experiment hijacks the
  // sentinel: findOne would return it, and the theme gate would bake its id.
  const sentinel = buildActiveExperimentQuery("__promo-theme__", { allowWildcard: false }, now);
  assert.deepEqual(sentinel.slugTargets, "__promo-theme__", "sentinel lookup is exact match");
  assert.equal(
    JSON.stringify(sentinel).includes('"*"'),
    false,
    "sentinel query must contain no wildcard anywhere",
  );

  assert.equal(page.status, "active", "only active experiments match");
  assert.equal(sentinel.status, "active", "only active experiments match");

  console.log("experimentQuery: all assertions passed");
}

run();
```

- [ ] **Step 2: Wire the test script**

In `package.json` `scripts`, beside the other `test:*` entries:

```json
    "test:experiment-query": "tsx src/repositories/ab-testing/__tests__/experimentQuery.test.ts",
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:experiment-query`
Expected: FAIL — `buildActiveExperimentQuery` is not exported.

- [ ] **Step 4: Extract the query builder and add the sentinel method**

In `ExperimentRepository.ts`, add above the class:

```ts
/**
 * Build the "active experiment" match for a slug.
 *
 * `allowWildcard` is the whole point of this helper. Page lookups must keep
 * matching `"*"` (an "All Pages" experiment legitimately applies to a prize
 * page). Sentinel lookups must NOT: `findOne` returns the newest match, so an
 * active wildcard experiment would be returned for `__promo-theme__`, and the
 * caller would bake an unrelated experiment's id — holding promo traffic on a
 * config with no promoTheme and polluting that experiment with sentinel-tagged
 * page_view rows. Post-filtering cannot recover from it.
 */
export function buildActiveExperimentQuery(
  slug: string,
  opts: { allowWildcard: boolean },
  now: Date,
): Record<string, unknown> {
  return {
    status: "active",
    slugTargets: opts.allowWildcard ? { $in: [slug, "*"] } : slug,
    $and: [
      { $or: [{ startDate: { $exists: false } }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: { $exists: false } }, { endDate: { $gte: now } }] },
    ],
  };
}
```

Then replace the body of `findActiveBySlug` and add the sibling:

```ts
  async findActiveBySlug(slug: string): Promise<IExperiment | null> {
    await connectDB();
    return Experiment.findOne(buildActiveExperimentQuery(slug, { allowWildcard: true }, new Date()))
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Find an active experiment by SENTINEL slug (e.g. `__promo-theme__`).
   * Exact array-membership only — never matches `"*"`. See the note on
   * buildActiveExperimentQuery.
   */
  async findActiveBySentinelSlug(slug: string): Promise<IExperiment | null> {
    await connectDB();
    return Experiment.findOne(buildActiveExperimentQuery(slug, { allowWildcard: false }, new Date()))
      .sort({ createdAt: -1 })
      .exec();
  }
```

- [ ] **Step 5: Add the service passthrough**

In `ExperimentService.ts`, after `getActiveExperimentForSlug`:

```ts
  /**
   * Find an active experiment by sentinel slug (site-wide cosmetic tests).
   * Exact match — a wildcard ("*") experiment must never resolve here.
   */
  async getActiveExperimentForSentinelSlug(slug: string) {
    return ExperimentRepository.findActiveBySentinelSlug(slug);
  }
```

- [ ] **Step 6: Fix the same latent bug in the membership-theme route**

In `src/app/api/ab-testing/membership-theme-experiment/route.ts`, change
`experimentService.getActiveExperimentForSlug(MEMBERSHIP_THEME_SLUG)` to
`experimentService.getActiveExperimentForSentinelSlug(MEMBERSHIP_THEME_SLUG)`.

- [ ] **Step 7: Run test to verify it passes**

Run: `npm run test:experiment-query && npm run type-check`
Expected: PASS, then no type errors.

- [ ] **Step 8: Update docs**

`docs/ab-testing/architecture.md` currently claims the sentinel gives "zero collision" — correct it to: the sentinel prevents *prize-slug → sentinel* collisions only; sentinel lookups must use `findActiveBySentinelSlug` because `findActiveBySlug` also matches `"*"`. Add the same correction to `docs/ab-testing/gotchas.md`.

- [ ] **Step 9: Commit** *(only if authorized)*

```bash
git add src/repositories/ab-testing/ src/services/ab-testing/ExperimentService.ts src/app/api/ab-testing/membership-theme-experiment/route.ts package.json docs/ab-testing/
git commit -m "fix(ab-testing): sentinel lookups must not match wildcard experiments"
```

---

### Task 4: Register `__promo-theme__` as a non-conversion sentinel

`attributionRank` returns `0` (top tier) unless **every** slug target is in `NON_CONVERSION_SENTINEL_SLUGS`, which holds only `__membership-theme__`. Unregistered, the newest active experiment wins the single purchase stamp and starves the co-running `static-vs-video-hero` test's legacy event-count surfaces.

**Files:**
- Modify: `src/utils/ab-testing/get-user-experiment-assignment.ts:6`
- Create: `src/utils/ab-testing/__tests__/attributionRank.test.ts`
- Modify: `package.json`
- Docs: `docs/ab-testing/gotchas.md`

**Interfaces:**
- Consumes: exported `NON_CONVERSION_SENTINEL_SLUGS`, `attributionRank` from `get-user-experiment-assignment.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/ab-testing/__tests__/attributionRank.test.ts`:

```ts
import assert from "node:assert/strict";
import { attributionRank, NON_CONVERSION_SENTINEL_SLUGS } from "../get-user-experiment-assignment";

function run() {
  assert.equal(attributionRank(["milwaukee-gearwrench"]), 0, "page-targeted ranks highest");
  assert.equal(attributionRank(["*"]), 1, "wildcard ranks below page-targeted");
  assert.equal(attributionRank(["__membership-theme__"]), 2, "known sentinel is excluded");

  // Without this, the theme test outranks real promo experiments and steals the
  // single purchase stamp — the co-running slug experiment's legacy conversion
  // and revenue panels silently read zero.
  assert.equal(attributionRank(["__promo-theme__"]), 2, "promo theme sentinel is excluded");
  assert.ok(
    NON_CONVERSION_SENTINEL_SLUGS.has("__promo-theme__"),
    "promo theme sentinel is registered",
  );

  console.log("attributionRank: all assertions passed");
}

run();
```

- [ ] **Step 2: Wire the test script**

```json
    "test:attribution-rank": "tsx src/utils/ab-testing/__tests__/attributionRank.test.ts",
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:attribution-rank`
Expected: FAIL — `attributionRank(["__promo-theme__"])` returns `0`, expected `2`.

- [ ] **Step 4: Register the sentinel**

```ts
export const NON_CONVERSION_SENTINEL_SLUGS = new Set([
  "__membership-theme__",
  "__promo-theme__",
]);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:attribution-rank`
Expected: PASS.

- [ ] **Step 6: Update docs**

In `docs/ab-testing/gotchas.md`, extend the sentinel-attribution note: `__promo-theme__` is registered, so **score it from the Bayesian / `ExperimentMetricsService` card only — its legacy event-count conversion and revenue panels read zero by design.** State *why* this does not blind the test: `ExperimentMetricsService` finds purchases via `$or: [{experimentId}, {userId: {$in: assignedUserObjIds}}]` and attributes by assignment authority, and anonymous assignments are merged to `userId` at purchase time before attribution. Without this sentence a future reader will "fix" the registration back out.

- [ ] **Step 7: Commit** *(only if authorized)*

```bash
git add src/utils/ab-testing/ package.json docs/ab-testing/gotchas.md
git commit -m "fix(ab-testing): register __promo-theme__ as a non-conversion sentinel"
```

---

### Task 5: Theme store v2 + synchronous theme sync

Two traps. zustand calls `migrate(persisted, version)` **once with the stored version** — it does not chain — so a surviving **v0** record (`{theme:"dark", userManualOverride:false}`, written by the removed auto-switcher) hits the v2 function directly. And `useThemeStore` has no `partialize`, so a `userManualOverride: false` would be persisted and make **both** readers demote dark→light, silently evaporating the dark arm on every hard load.

**Files:**
- Modify: `src/stores/useThemeStore.ts`
- Modify: `src/contexts/ThemeContext.tsx:47-58`
- Create: `src/stores/__tests__/themeStore.test.ts`
- Modify: `package.json`
- Docs: `docs/theme/`

**Interfaces:**
- Produces: `ThemeStore.userManualOverride?: true`; exported `migrateThemeState(persisted: unknown, version: number): Partial<ThemeStore>`.

- [ ] **Step 1: Write the failing test**

Create `src/stores/__tests__/themeStore.test.ts`:

```ts
import assert from "node:assert/strict";
import { migrateThemeState } from "../useThemeStore";

function run() {
  // v0: the removed time-based auto-switcher wrote dark for users who never chose
  // it. Those carry userManualOverride === false and MUST be demoted to light.
  // zustand does not chain migrations, so the v2 function receives v0 records
  // directly — dropping this predicate resurrects the old auto-dark bug.
  assert.deepEqual(
    migrateThemeState({ theme: "dark", userManualOverride: false }, 0),
    { theme: "light" },
    "v0 auto-dark demotes to light",
  );

  assert.deepEqual(
    migrateThemeState({ theme: "dark", userManualOverride: true }, 0),
    { theme: "dark", userManualOverride: true },
    "v0 user-chosen dark is preserved and marked",
  );

  assert.deepEqual(
    migrateThemeState({ theme: "dark" }, 1),
    { theme: "dark" },
    "v1 dark carries forward",
  );

  assert.deepEqual(
    migrateThemeState({ theme: "light" }, 1),
    { theme: "light" },
    "v1 light carries forward",
  );

  // A persisted `false` makes BOTH readers (inline snippet `o !== false`, and
  // readThemeFromPersistStorage) demote dark to light. The key must be absent.
  for (const [input, version] of [
    [{ theme: "dark", userManualOverride: false }, 0],
    [{ theme: "light" }, 1],
    [{}, 1],
  ] as const) {
    const out = migrateThemeState(input, version) as Record<string, unknown>;
    assert.equal(
      Object.prototype.hasOwnProperty.call(out, "userManualOverride") &&
        out.userManualOverride === false,
      false,
      "userManualOverride is never persisted as false",
    );
  }

  assert.deepEqual(migrateThemeState(null, 0), { theme: "light" }, "null persists as light");

  console.log("themeStore: all assertions passed");
}

run();
```

- [ ] **Step 2: Wire the test script**

```json
    "test:theme-store": "tsx src/stores/__tests__/themeStore.test.ts",
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:theme-store`
Expected: FAIL — `migrateThemeState` is not exported.

- [ ] **Step 4: Rewrite the store**

Replace `src/stores/useThemeStore.ts`:

```ts
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark";

interface ThemeStore {
  theme: Theme;
  /**
   * `true` once the visitor has picked a theme themselves. Set ONLY by
   * setTheme/toggleTheme (the header toggle, the promo toggle, the account
   * ThemePicker). Never written as `false`: a stored `false` makes both readers
   * — the CSP-hashed inline snippet (`o !== false`) and
   * readThemeFromPersistStorage — demote dark to light, which would silently
   * evaporate the dark arm of the promo theme experiment on every hard load.
   * Bootstrapping and the experiment both write through setState, which
   * bypasses these actions and therefore leaves the flag untouched.
   */
  userManualOverride?: true;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

/**
 * Migrate a persisted theme record to v2.
 *
 * zustand calls this ONCE with the stored version and does not chain, so this
 * function must handle a v0 record directly. v0 ran a time-based auto-switcher
 * that wrote `theme: "dark"` for users who never chose it (those carry
 * `userManualOverride === false`); honour dark only when the user actually
 * toggled, otherwise fall back to the light default.
 */
export function migrateThemeState(persisted: unknown, _version: number): Partial<ThemeStore> {
  const prev = (persisted ?? {}) as { theme?: unknown; userManualOverride?: unknown };
  const userChoseDark = prev.theme === "dark" && prev.userManualOverride !== false;
  const next: Partial<ThemeStore> = { theme: userChoseDark ? "dark" : "light" };
  if (prev.userManualOverride === true) next.userManualOverride = true;
  return next;
}

/**
 * App theme store. Light is the hard default. The theme changes when the user
 * toggles it, or when the promo default-theme experiment assigns one — the
 * latter writes via `useThemeStore.setState`, so it never sets
 * `userManualOverride` and never overrides a real choice.
 */
export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: "light",
      setTheme: (theme) => set({ theme, userManualOverride: true }),
      toggleTheme: () =>
        set((state) => ({
          theme: state.theme === "light" ? "dark" : "light",
          userManualOverride: true,
        })),
    }),
    {
      name: "ta-theme",
      version: 2,
      migrate: migrateThemeState,
    }
  )
);
```

- [ ] **Step 5: Promote the theme sync to a layout effect**

In `src/contexts/ThemeContext.tsx`, change the `useEffect` that syncs `[theme]` to `useLayoutEffect` so `html.dark` is applied before paint rather than after:

```tsx
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    const root = document.documentElement;

    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);
```

`useLayoutEffect` is already imported in this file. This is defensive — the gate in Task 8 does its own synchronous `classList` write and does not rely on this.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test:theme-store && npm run test:csp-inline-hashes && npm run type-check`
Expected: all PASS. The CSP test proves the inline snippet was not disturbed.

- [ ] **Step 7: Update docs**

In `docs/theme/`, document the v2 shape, the never-`false` rule and why, the no-chaining migration behaviour, and that `setState` is the deliberate unmarked write path used by bootstrapping and the experiment.

- [ ] **Step 8: Commit** *(only if authorized)*

```bash
git add src/stores/ src/contexts/ThemeContext.tsx package.json docs/theme/
git commit -m "feat(theme): store v2 with userManualOverride; sync html.dark pre-paint"
```

---

### Task 6: Mint `ta_anon_id` in middleware

The gate's `/assign` POST fires in the same effect flush as `useVariantAssignment`'s POST. `getOrCreateAnonymousId` generates a fresh `anon_<uuid>` per request and cannot persist it, so each handler `Set-Cookie`s its own and last-write-wins. The unique index is `(experimentId, anonymousId)`, so **both rows are legal** and the visitor counts as two exposures, then gets re-bucketed.

**Files:**
- Create: `src/lib/ab-testing/anon-id-cookie.ts`
- Modify: `src/middleware.ts`
- Docs: `docs/ab-testing/architecture.md`, `docs/security-csp/architecture.md`

**Interfaces:**
- Produces: `ANON_ID_COOKIE_NAME`, `ANON_ID_MAX_AGE`, `isValidAnonymousId(id: string): boolean`, `generateAnonymousId(): string` — all edge-safe (Web Crypto only).

- [ ] **Step 1: Create the edge-safe cookie contract**

`AnonymousIdService` imports `next/headers` and node `crypto`, so it **cannot** be imported into middleware. Create `src/lib/ab-testing/anon-id-cookie.ts`:

```ts
/**
 * Edge-safe anonymous-id cookie contract.
 *
 * `AnonymousIdService` owns the same cookie but imports `next/headers` and node
 * `crypto`, neither of which is available in middleware's edge runtime — hence
 * this tiny shared module rather than a re-export. Keep the name, TTL and
 * validation rule identical to AnonymousIdService or assignments will split
 * across two ids for the same visitor.
 */
export const ANON_ID_COOKIE_NAME = "ta_anon_id";
export const ANON_ID_MAX_AGE = 90 * 24 * 60 * 60; // 90 days, matches AnonymousIdService

export function isValidAnonymousId(id: string): boolean {
  return id.startsWith("anon_") && id.length > 5 && id.length < 100;
}

/** Web Crypto only — `crypto.randomUUID` is available in the edge runtime. */
export function generateAnonymousId(): string {
  return `anon_${crypto.randomUUID()}`;
}
```

- [ ] **Step 2: Mint the cookie in middleware**

In `src/middleware.ts`, import the module and set the cookie on the `NextResponse.next()` response, immediately after `const response = NextResponse.next();`:

```ts
    // Mint the A/B anonymous id ONCE per visitor, here, so that concurrent
    // /assign calls on the same page share one identity. Each API handler
    // otherwise generates its own `anon_<uuid>` and Set-Cookies it (last write
    // wins), which produces two legal VariantAssignment rows — the unique index
    // is (experimentId, anonymousId) — and counts one visitor as two exposures.
    const existingAnonId = req.cookies.get(ANON_ID_COOKIE_NAME)?.value;
    if (!existingAnonId || !isValidAnonymousId(existingAnonId)) {
      response.cookies.set({
        name: ANON_ID_COOKIE_NAME,
        value: generateAnonymousId(),
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: ANON_ID_MAX_AGE,
        path: "/",
      });
    }
```

- [ ] **Step 3: Verify the static route class is intact**

Run: `npm run build`
Expected: build succeeds, and in the route table `/promotions/[slug]` is still marked static (`●`/`SSG`), **not** `ƒ`/dynamic. If it flipped to dynamic, stop — the CSP route-class invariant is broken and the CDN cache is lost.

- [ ] **Step 4: Verify the cookie is set once**

Start `npm run dev`, open a promo page in a fresh private window, and check DevTools → Application → Cookies. Expected: exactly one `ta_anon_id`, and it does **not** change on reload.

- [ ] **Step 5: Update docs**

Document in `docs/ab-testing/architecture.md` that `ta_anon_id` is minted in middleware and why (concurrent-assign identity split), and note the edge-runtime constraint in `docs/security-csp/architecture.md`.

- [ ] **Step 6: Commit** *(only if authorized)*

```bash
git add src/lib/ab-testing/ src/middleware.ts docs/
git commit -m "fix(ab-testing): mint ta_anon_id in middleware so concurrent assigns share one identity"
```

---

### Task 7: `usePromoThemeExperiment` hook

**Files:**
- Create: `src/hooks/ab-testing/usePromoThemeExperiment.ts`
- Docs: `docs/ab-testing/frontend.md`

**Interfaces:**
- Consumes: `VariantConfig.promoTheme` (Task 1).
- Produces: `PROMO_THEME_SLUG = "__promo-theme__"`; `usePromoThemeExperiment(experimentId: string | null): { settled: boolean; theme: "light" | "dark" | null }`; `promoThemeMarkerKey(experimentId: string): string`.

- [ ] **Step 1: Write the hook**

```ts
"use client";

import { useEffect, useRef, useState } from "react";
import type { VariantConfig } from "@/models/ab-testing/Variant";
import { readThemeFromPersistStorage } from "@/utils/themeBootstrap";

/** Sentinel slug target. Must match the experiment's slugTargets and the seed script. */
export const PROMO_THEME_SLUG = "__promo-theme__";

/** Device-scoped marker: this device already resolved this experiment. */
export function promoThemeMarkerKey(experimentId: string): string {
  return `ta_promo_theme_${experimentId}`;
}

interface Resolved {
  settled: boolean;
  theme: "light" | "dark" | null;
}

/** True when the visitor has picked a theme themselves — they are not in the test. */
function hasManualThemeChoice(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem("ta-theme");
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { state?: { userManualOverride?: unknown } } | null;
    return parsed?.state?.userManualOverride === true;
  } catch {
    return false;
  }
}

/**
 * Resolve the promo landing default-theme arm for this visitor.
 *
 * Returns `settled: true` SYNCHRONOUSLY (before any request) when the visitor is
 * not in the test — no active experiment, a manual theme choice, or this device
 * already resolved it. That matters: the gate derives its initial state from
 * `settled`, so a synchronous `true` means the overlay never enters the DOM at
 * all for the common case, rather than mounting and unmounting.
 *
 * `theme` is non-null only when a NEW decision needs applying; a returning
 * device gets `null` because the theme is already in `ta-theme` and the
 * CSP-hashed bootstrap snippet applied it before paint.
 */
export function usePromoThemeExperiment(experimentId: string | null): Resolved {
  const [state, setState] = useState<Resolved>(() => {
    if (typeof window === "undefined") return { settled: false, theme: null };
    if (!experimentId) return { settled: true, theme: null };
    if (hasManualThemeChoice()) return { settled: true, theme: null };
    try {
      if (localStorage.getItem(promoThemeMarkerKey(experimentId))) {
        return { settled: true, theme: null };
      }
    } catch {
      /* storage unavailable — fall through and resolve over the network */
    }
    return { settled: false, theme: null };
  });

  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    if (state.settled) return;
    if (!experimentId) {
      setState({ settled: true, theme: null });
      return;
    }

    let aborted = false;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch("/api/ab-testing/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ experimentId, slug: PROMO_THEME_SLUG }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`assign ${res.status}`);
        const data = (await res.json()) as { variantConfig: VariantConfig | null };
        const assigned = data.variantConfig?.promoTheme?.defaultTheme;
        const theme = assigned === "dark" ? "dark" : "light";
        try {
          localStorage.setItem(promoThemeMarkerKey(experimentId), theme);
        } catch {
          /* ignore quota errors — worst case the hold recurs next session */
        }
        if (!aborted) setState({ settled: true, theme });
      } catch {
        // Network/abort/admin-excluded -> control. Reveal in light rather than
        // holding the page: a stuck loader is worse than a control impression.
        if (!aborted) setState({ settled: true, theme: "light" });
      }
    })();

    return () => {
      aborted = true;
      controller.abort();
    };
    // `state.settled` is read once for the early-out; re-running on its change
    // would re-fire the request. The ranRef guard makes this effect single-shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experimentId]);

  // Guard: if the visitor toggled the theme in another tab between mount and
  // resolution, drop the assignment rather than overriding their choice.
  if (state.theme !== null && hasManualThemeChoice()) {
    return { settled: true, theme: null };
  }
  return state;
}
```

Note the hook reads `ta-theme` directly rather than via `readThemeFromPersistStorage`: that helper deliberately returns only the resolved theme, not the `userManualOverride` flag this hook needs. Do **not** import it here.

- [ ] **Step 2: Type-check and lint**

Run: `npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 3: Update docs**

Add a section to `docs/ab-testing/frontend.md` describing the hook, the three synchronous short-circuits, and the device marker.

- [ ] **Step 4: Commit** *(only if authorized)*

```bash
git add src/hooks/ab-testing/usePromoThemeExperiment.ts docs/ab-testing/frontend.md
git commit -m "feat(ab-testing): usePromoThemeExperiment hook for the promo default-theme split"
```

---

### Task 8: `PromoThemeExperimentGate` — overlay hold and ordered reveal

**Files:**
- Create: `src/components/ab-testing/PromoThemeExperimentGate.tsx`
- Docs: `docs/ab-testing/frontend.md`

**Interfaces:**
- Consumes: `usePromoThemeExperiment`, `PROMO_THEME_SLUG` (Task 7); `useThemeStore` (Task 5).
- Produces: `<PromoThemeExperimentGate experimentId={string | null}>{children}</PromoThemeExperimentGate>`; context value `usePromoThemeSettled(): boolean` for `PromoHero` (Task 9).

- [ ] **Step 1: Write the gate**

```tsx
"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import DashboardLoader from "@/components/loading/DashboardLoader";
import { useThemeStore } from "@/stores/useThemeStore";
import { usePromoThemeExperiment } from "@/hooks/ab-testing/usePromoThemeExperiment";

/** True once the theme decision is final and promo content may paint. */
const PromoThemeSettledContext = createContext(true);
export function usePromoThemeSettled(): boolean {
  return useContext(PromoThemeSettledContext);
}

interface Props {
  experimentId: string | null;
  children: ReactNode;
}

/**
 * Hold the promo landing on a full-screen loader until the default-theme arm is
 * decided, so a bucketed visitor never sees light snap to dark.
 *
 * OVERLAY, not replacement. `/promotions/[slug]` is ISR-static and deliberately
 * server-renders eight sections for SEO; returning a loader INSTEAD of children
 * would make the shared CDN document a spinner for every visitor, both arms, and
 * for crawlers. So children always render and the loader sits on top
 * (`.ta-loader-root` is already `fixed inset-0` and opaque).
 */
export function PromoThemeExperimentGate({ experimentId, children }: Props) {
  const { settled, theme } = usePromoThemeExperiment(experimentId);
  const [revealed, setRevealed] = useState(() => settled);
  const appliedRef = useRef(false);

  useEffect(() => {
    if (!settled || appliedRef.current) return;
    appliedRef.current = true;

    // ORDER IS LOAD-BEARING. Nothing applies `.dark` synchronously on a theme
    // change: ThemeContext does it in an effect, and useThemeStore.setState
    // lands on a different lane from setRevealed. Writing the class by hand
    // FIRST, then committing the reveal inside flushSync, guarantees the content
    // and the loader teardown paint in one frame with the final theme already
    // on <html>. Persisting via setState must come LAST — it is bookkeeping,
    // not the mechanism.
    const resolved = theme ?? (document.documentElement.classList.contains("dark") ? "dark" : "light");
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    root.style.colorScheme = resolved;

    flushSync(() => setRevealed(true));

    if (theme !== null) {
      useThemeStore.setState({ theme });
    }
  }, [settled, theme]);

  return (
    <PromoThemeSettledContext.Provider value={revealed}>
      <div inert={!revealed ? "" : undefined} aria-hidden={!revealed ? true : undefined}>
        {children}
      </div>
      {!revealed && <DashboardLoader label="Loading the giveaway…" />}
    </PromoThemeSettledContext.Provider>
  );
}
```

If the installed React types reject the string form of `inert`, use `{...(!revealed ? { inert: "" as const } : {})}` on the wrapper `div` instead. Do not drop the attribute — without it the occluded page is still keyboard-focusable during the hold.

- [ ] **Step 2: Verify the loader overlays rather than replaces**

Confirm `.ta-loader-root` in `src/app/globals.css` is `position: fixed; inset: 0;` with an opaque background. If it is not, wrap `<DashboardLoader />` in a `fixed inset-0 z-[100]` container with `bg-white dark:bg-neutral-950` rather than editing the shared loader.

- [ ] **Step 3: Type-check and lint**

Run: `npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 4: Update docs**

In `docs/ab-testing/frontend.md`, document the overlay decision, the exact reveal ordering and why each step is where it is, and the `usePromoThemeSettled` context.

- [ ] **Step 5: Commit** *(only if authorized)*

```bash
git add src/components/ab-testing/PromoThemeExperimentGate.tsx docs/ab-testing/frontend.md
git commit -m "feat(ab-testing): overlay gate holding promo landings until the theme arm is decided"
```

---

### Task 9: Withhold theme-forked hero art until settled

The original spec claimed the hero could not paint before JS. **That was wrong.** `PromoHero` gates only the `<video>` on post-mount `viewport`; pre-mount both containers fall through to the still branch, whose `src` is `getImageForMode(landingHeroPaths, themeMode, …)`, and the `isLoading` stage background is `resolveLandingHeroBackground(themeMode)`. Because Task 8 renders children underneath the overlay, those images **still download** — reintroducing the dark-arm handicap Task 10 removes.

**Files:**
- Modify: `src/components/sections/promo/PromoHero.tsx`
- Docs: `docs/promo/`

**Interfaces:**
- Consumes: `usePromoThemeSettled` (Task 8).

- [ ] **Step 1: Read the current hero render**

Run: `sed -n '60,215p' src/components/sections/promo/PromoHero.tsx`
Identify the `isLoading` early-return block and the still-image branch in the main JSX.

- [ ] **Step 2: Consume the settled flag**

Add the import and read it beside the existing `themeMode` line:

```tsx
import { usePromoThemeSettled } from "@/components/ab-testing/PromoThemeExperimentGate";
```

```tsx
  const themeSettled = usePromoThemeSettled();
```

- [ ] **Step 3: Hold theme-forked art**

Insert a new early return **immediately above** the existing `if (isLoading) {` block. Do not modify the `isLoading` block itself — leave it byte-identical.

```tsx
  // Hold theme-forked art until the default-theme experiment has decided. The
  // gate overlays rather than replaces the page (SEO), so a mounted <Image>
  // here would still be fetched — a dark-arm visitor would download the light
  // hero and discard it, exactly the handicap the preload skip removes. This
  // returns the same reserved box as the isLoading stage, minus the two
  // theme-forked <Image>s, so there is no layout shift when it resolves.
  if (!themeSettled) {
    return (
      <section className="relative flex flex-col items-center overflow-visible pt-20 sm:pt-40 aspect-[1080/1164] min-h-[clamp(380px,228px+38vw,520px)] lg:aspect-[2560/1044] lg:min-h-0">
        <div className="absolute inset-0 z-0 bg-white dark:bg-neutral-950" />
      </section>
    );
  }

  if (isLoading) {
    // ...existing block, unchanged...
```

The context default is `true`, so **any `PromoHero` rendered outside the gate behaves exactly as it does today** — this branch is dead code on every non-promo surface.

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 5: Update docs**

In `docs/promo/`, correct any statement that the hero cannot paint before mount, and document that theme-forked art is withheld until `usePromoThemeSettled()` is true.

- [ ] **Step 6: Commit** *(only if authorized)*

```bash
git add src/components/sections/promo/PromoHero.tsx docs/promo/
git commit -m "fix(promo): withhold theme-forked hero art until the theme arm is decided"
```

---

### Task 10: Wire the pages — bake the id, mount the gate, skip the unfair preload

**Files:**
- Modify: `src/app/promotions/[slug]/page.tsx:128-132, ~150-162, 194-260`
- Modify: `src/app/promotions/_components/ToolsetLandingPage.tsx`
- Docs: `docs/promo/`

**Interfaces:**
- Consumes: `getActiveExperimentForSentinelSlug` (Task 3), `PROMO_THEME_SLUG` (Task 7), `PromoThemeExperimentGate` (Task 8).

- [ ] **Step 1: Resolve the sentinel experiment at ISR time**

Extend the existing `Promise.all` (it already runs three lookups in parallel, so this adds no latency):

```ts
  const [effectivePromos, majorDraw, activeExperiment, themeExperiment] = await Promise.all([
    getEffectivePromosForDisplay().catch(() => []),
    getCurrentMajorDrawServer().catch(() => null),
    ExperimentService.getActiveExperimentForSlug(slug).catch(() => null),
    ExperimentService.getActiveExperimentForSentinelSlug(PROMO_THEME_SLUG).catch(() => null),
  ]);
```

Add beside the existing `experimentId` derivation:

```ts
  const themeExperimentId = themeExperiment?._id
    ? (themeExperiment._id instanceof mongoose.Types.ObjectId
        ? themeExperiment._id.toString()
        : String(themeExperiment._id))
    : null;
```

- [ ] **Step 2: Skip the unfair hero preload while the test is live**

The preload uses `landingForPrize.desktop / .mobile` — the **light** paths; the server has no theme so `getImageForMode` is never consulted. With the test live a dark-arm visitor downloads the light hero, discards it, then fetches the dark one — a systematic LCP handicap on one arm only.

```ts
  // A theme experiment makes the server's light-path preload a coin flip: half
  // of visitors would download a hero they never display. Skipping it costs both
  // arms equally, which is the only fair option — a biased preload would read as
  // "dark converts worse".
  const heroImagePreload =
    heroVideo || themeExperimentId
      ? null
      : {
          mobile: getImageProps({ src: heroImagePaths.mobile, alt: "", fill: true, sizes: "100vw" }).props,
          desktop: getImageProps({ src: heroImagePaths.desktop, alt: "", fill: true, sizes: "100vw" }).props,
        };
```

- [ ] **Step 3: Mount the gate**

Wrap the existing children **inside** `VariantAssignmentWrapper` (so the slug experiment context is unaffected):

```tsx
      <VariantAssignmentWrapper experimentId={experimentId}>
        <PromoThemeExperimentGate experimentId={themeExperimentId}>
          <PromoThemeInitializer slug={prize.slug} />
          {/* ...existing children unchanged... */}
        </PromoThemeExperimentGate>
      </VariantAssignmentWrapper>
```

- [ ] **Step 4: Repeat for the toolset landing**

Apply steps 1–3 to `src/app/promotions/_components/ToolsetLandingPage.tsx`, which has the same `VariantAssignmentWrapper`, preload block and hero.

- [ ] **Step 5: Verify the static route class and SSR content survive**

Run: `npm run build`
Expected: `/promotions/[slug]` still static in the route table. Then:

```bash
npx serve .next/server/app/promotions 2>/dev/null || true
grep -c "id=\"packages\"" .next/server/app/promotions/*.html | head
```

Expected: the prerendered HTML still contains the packages markup — i.e. the overlay did **not** empty the document. If the grep returns 0, the gate is replacing rather than overlaying; go back to Task 8.

- [ ] **Step 6: Update docs**

In `docs/promo/`, document the baked sentinel id, the gate mount point, and the preload-skip rule.

- [ ] **Step 7: Commit** *(only if authorized)*

```bash
git add src/app/promotions/ docs/promo/
git commit -m "feat(promo): bake theme experiment id, mount the gate, skip the biased hero preload"
```

---

### Task 11: Seed script

**Files:**
- Create: `scripts/seed-promo-theme-experiment.ts`
- Modify: `package.json`
- Docs: `docs/ab-testing/testing.md`

**Interfaces:**
- Consumes: `PROMO_THEME_SLUG` value `"__promo-theme__"` (Task 7) — hard-code the literal here; `scripts/` must not import client modules.

- [ ] **Step 1: Write the seed script**

Model it on `scripts/seed-static-vs-video-hero-experiment.ts` — read that file first and mirror its structure exactly (dry-run default-safe, `--force`, refusal on non-draft, `connectOpsDb`, explicit exit codes).

```ts
/**
 * Seed: "Promo landing — default theme (light vs dark)" A/B experiment.
 *
 * Creates ONE Experiment (status="draft" — activate in admin → A/B Testing) and
 * TWO Variants (50/50):
 *   • "Light (control)" — promoTheme.defaultTheme = "light" (today's default)
 *   • "Dark"            — promoTheme.defaultTheme = "dark"
 *
 * Targets the SENTINEL slug `__promo-theme__`, never real prize slugs, so it
 * cannot shadow a slug-targeted promo experiment (findActiveBySlug is a findOne).
 *
 * PRE-ACTIVATION CHECK — do not skip: POST /api/ab-testing/assign for each
 * variant id and assert `variantConfig.promoTheme.defaultTheme` is present.
 * `mergeVariantConfig` is a key whitelist; if promoTheme is not wired there, both
 * arms render light while the dashboard shows a healthy 50/50 test.
 *
 * Usage:
 *   npm run seed:promo-theme:dry   # preview, no writes
 *   npm run seed:promo-theme       # create the draft experiment
 *   npm run seed:promo-theme -- --force
 */

import { config } from "dotenv";
import path from "node:path";
import { connectOpsDb } from "./connect-ops-db";

config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

const EXPERIMENT_NAME = "Promo landing — default theme (light vs dark)";
const PROMO_THEME_SLUG = "__promo-theme__";

const LIGHT_CONFIG = { promoTheme: { defaultTheme: "light" } };
const DARK_CONFIG = { promoTheme: { defaultTheme: "dark" } };

async function main(): Promise<void> {
  await connectOpsDb(`Seed promo default theme — ${DRY_RUN ? "DRY-RUN" : "APPLY"}`);

  const { default: Experiment } = await import("../src/models/ab-testing/Experiment");
  const { default: Variant } = await import("../src/models/ab-testing/Variant");
  const { default: User } = await import("../src/models/User");

  const variants = [
    { name: "Light (control)", trafficPercentage: 50, isControl: true, config: LIGHT_CONFIG },
    { name: "Dark", trafficPercentage: 50, isControl: false, config: DARK_CONFIG },
  ];

  const existing = await Experiment.findOne({ name: EXPERIMENT_NAME }).exec();

  if (existing) {
    if (existing.status !== "draft") {
      console.log(`↩️  "${EXPERIMENT_NAME}" exists in status="${existing.status}" — locked. Skipping.`);
      process.exit(0);
    }
    const variantCount = await Variant.countDocuments({ experimentId: existing._id });
    if (variantCount > 0 && !FORCE) {
      console.log(`↩️  Already has ${variantCount} variant(s). Skipping (re-run with --force).`);
      process.exit(0);
    }
    if (DRY_RUN) {
      console.log(`[dry-run] Would populate draft "${EXPERIMENT_NAME}" (id=${existing._id}):`);
      console.log(`[dry-run]   slugTargets: [${PROMO_THEME_SLUG}]; variants: Light (control, 50%) + Dark (50%)`);
      if (variantCount > 0 && FORCE) console.log(`[dry-run]   would DELETE ${variantCount} existing variant(s)`);
      process.exit(0);
    }
    if (variantCount > 0 && FORCE) {
      const del = await Variant.deleteMany({ experimentId: existing._id });
      console.log(`🗑️  --force: deleted ${del.deletedCount} existing variant(s)`);
    }
    existing.slugTargets = [PROMO_THEME_SLUG];
    await existing.save();
    await Variant.create(variants.map((v) => ({ ...v, experimentId: existing._id })));
    console.log(`✅ Populated draft "${EXPERIMENT_NAME}" (id=${existing._id}) with 2 variants.`);
    process.exit(0);
  }

  const adminUser = await User.findOne({ role: "admin" }).select("_id email").lean().exec();
  if (!adminUser) {
    console.error("❌ No admin user found (Experiment requires createdBy). Seed an admin first.");
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("[dry-run] Would create Experiment:");
    console.log(`  name        : ${EXPERIMENT_NAME}`);
    console.log(`  status      : draft`);
    console.log(`  slugTargets : [${PROMO_THEME_SLUG}]`);
    console.log(`  createdBy   : ${adminUser._id} (${adminUser.email})`);
    console.log("  variants    : Light (control, 50%) + Dark (50%)");
    process.exit(0);
  }

  const experiment = await Experiment.create({
    name: EXPERIMENT_NAME,
    status: "draft",
    slugTargets: [PROMO_THEME_SLUG],
    createdBy: adminUser._id,
  });
  await Variant.create(variants.map((v) => ({ ...v, experimentId: experiment._id })));

  console.log(`✅ Created Experiment "${EXPERIMENT_NAME}"`);
  console.log(`   id          : ${experiment._id}`);
  console.log(`   status      : draft (activate in admin → A/B Testing)`);
  console.log(`   variants    : Light (control, 50%) · Dark (50%)`);
  console.log(`\n⚠️  Before activating: POST /api/ab-testing/assign per variant and assert`);
  console.log(`   variantConfig.promoTheme.defaultTheme is present. mergeVariantConfig is a`);
  console.log(`   whitelist — an unwired key yields a silent A/A.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ seed-promo-theme-experiment failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Wire the npm scripts**

```json
    "seed:promo-theme": "tsx scripts/seed-promo-theme-experiment.ts",
    "seed:promo-theme:dry": "tsx scripts/seed-promo-theme-experiment.ts --dry-run",
```

- [ ] **Step 3: Dry-run it**

Run: `npm run seed:promo-theme:dry`
Expected: prints the plan, writes nothing, exits 0.

- [ ] **Step 4: Update docs**

Document the seed command and the pre-activation probe in `docs/ab-testing/testing.md`.

- [ ] **Step 5: Commit** *(only if authorized)*

```bash
git add scripts/seed-promo-theme-experiment.ts package.json docs/ab-testing/testing.md
git commit -m "feat(ab-testing): seed script for the promo default-theme split"
```

---

### Task 12: End-to-end verification

**Files:**
- Create: `e2e/specs/marketing/promo-theme-split.spec.ts`
- Docs: `docs/e2e/`

- [ ] **Step 1: Write the no-snap spec**

```ts
import { test, expect } from "@playwright/test";

const SLUG = "milwaukee-gearwrench";

/**
 * The whole point of the gate: a dark-arm visitor must never see a light frame.
 * We stub /assign so the arm is deterministic, then sample <html> class from the
 * first paint onward and assert we never observed light-then-dark.
 */
test("dark arm never paints light before dark", async ({ page }) => {
  await page.route("**/api/ab-testing/assign", async (route) => {
    const body = route.request().postDataJSON() as { slug?: string };
    if (body?.slug !== "__promo-theme__") return route.continue();
    await new Promise((r) => setTimeout(r, 250)); // realistic latency
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        variantId: "stub-dark",
        variantConfig: { promoTheme: { defaultTheme: "dark" } },
      }),
    });
  });

  await page.addInitScript(() => {
    (window as unknown as { __themeSamples: string[] }).__themeSamples = [];
    const sample = () => {
      const w = window as unknown as { __themeSamples: string[] };
      w.__themeSamples.push(document.documentElement.classList.contains("dark") ? "dark" : "light");
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  await page.goto(`/promotions/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.locator("html")).toHaveClass(/dark/, { timeout: 30_000 });
  await page.waitForTimeout(1500);

  const samples: string[] = await page.evaluate(
    () => (window as unknown as { __themeSamples: string[] }).__themeSamples,
  );

  // The overlay must be up for every light sample: a light frame is only
  // acceptable while the loader covers the page.
  const firstDark = samples.indexOf("dark");
  expect(firstDark, "theme resolved to dark").toBeGreaterThanOrEqual(0);
  expect(samples.slice(firstDark).every((s) => s === "dark"), "no dark→light regression").toBe(true);
});

test("control arm HTML is server-rendered, not a spinner", async ({ page }) => {
  const res = await page.goto(`/promotions/${SLUG}`, { waitUntil: "domcontentloaded" });
  const html = (await res?.text()) ?? "";
  expect(html.length, "server HTML is substantial, not a loader shell").toBeGreaterThan(20_000);
});
```

- [ ] **Step 2: Run the spec**

Run: `npx playwright test e2e/specs/marketing/promo-theme-split.spec.ts --project=chromium`
Expected: both tests PASS.

- [ ] **Step 3: Run the full guard set**

Run:
```bash
npm run test:variant-config-membership-theme && \
npm run test:experiment-query && \
npm run test:attribution-rank && \
npm run test:theme-store && \
npm run test:csp-inline-hashes && \
npm run type-check && npm run lint
```
Expected: all PASS.

- [ ] **Step 4: Update docs**

Add the new spec to `docs/e2e/`.

- [ ] **Step 5: Commit** *(only if authorized)*

```bash
git add e2e/specs/marketing/promo-theme-split.spec.ts docs/e2e/
git commit -m "test(e2e): assert the promo theme split never snaps and keeps SSR HTML"
```

---

## Activation runbook (after all tasks)

1. `npm run seed:promo-theme:dry`, then `npm run seed:promo-theme`.
2. Review the draft in admin → A/B Testing. Confirm both variants show the right `Default theme`.
3. **Pre-activation probe.** Set the admin preview cookie `ta_ab_preview_<experimentId>` to each variant id and `POST /api/ab-testing/assign` with `{ experimentId, slug: "__promo-theme__" }`. Assert `variantConfig.promoTheme.defaultTheme` matches the arm. **If it is `undefined`, stop — Task 1 did not land and the test would be a silent A/A.**
4. Measure the p99 of `POST /api/ab-testing/assign` in production. Record it, and re-tune `ASSIGN_BACKSTOP_MS` (`src/hooks/ab-testing/usePromoThemeExperiment.ts`, currently a generous provisional `6000`) from that measurement — it is the basis for judging the hold.
5. Activate. Watch: assignment split ≈50/50, the timeout/error branch rate, the backstop-firing rate (a non-trivial rate means the run is contaminated — see docs/ab-testing/frontend.md), and LCP on `/promotions/*`.
6. On conclusion, ship the winner as the unconditional default, set the experiment to `ended`, and write a runbook in `docs/ab-testing/` matching `promo-packages-design-runbook.md`. **Record the honest caveat in that runbook:** while this test ran, the control arm was not equivalent to pre-experiment "today" — both arms lost the hero preload (see the preload-fairness rule in `docs/promo/frontend.md`) and both waited behind `PromoThemeExperimentGate`'s loader. The light-vs-dark comparison between the two arms is valid; either arm's absolute conversion rate against a historical, pre-experiment baseline is not.

## Self-review notes

- **Spec coverage:** every spec section maps to a task — config plumbing (1, 2), sentinel isolation (3), attribution (4), theme store v2 (5), anon-id identity (6), hook (7), overlay gate + reveal ordering (8), hero asset hold (9), page wiring + preload fairness (10), seeding (11), verification (12).
- **Ordering** follows the spec's dependency constraints: config before seeding, theme store before the hook can write, gate shape before hero changes, sentinel + attribution before activation.
- **Deliberately deferred:** `deliveredAt` on `VariantAssignment` is out of scope unless the error/timeout branch proves to fire often (spec §Out of scope). The fixed 1200 ms *guillotine* from the first draft is **not** implemented — but a real backstop **is**: `ASSIGN_BACKSTOP_MS = 6000` in `usePromoThemeExperiment.ts`, a `Promise.race` against the `/assign` fetch (no `AbortController`), reveals in light with no error thrown. This is a deliberately generous, provisional value — not the 1200 ms guillotine, and not yet the measured-p99 value either. Re-tune it from the production p99 of `POST /api/ab-testing/assign` per the activation runbook below; a non-trivial backstop-firing rate means the arms are not comparable and the run should be treated as contaminated, not scored as-is. Regression coverage for the initializer-ordering bug this hook is most exposed to lives at `src/hooks/ab-testing/__tests__/promoThemeInitialState.test.ts` (`npm run test:promo-theme-initial-state`), extracted from the hook as the pure `resolveInitialPromoThemeState`.
