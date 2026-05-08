# UI Cleanup — Plan 3: Modal Sweep

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-05-08-ui-tailwind-cleanup-design.md](../specs/2026-05-08-ui-tailwind-cleanup-design.md) (Phase 3)

**Predecessors:**
- Plan 1 (Foundation + Codemods) — committed at `63ec206`.
- Plan 2 (CancellationUpsellModal pilot) — committed at `d0a2dd2`. Establishes the decomposition pattern this plan applies to other modals.

**Goal:** Apply the Plan 2 decomposition pattern to the remaining 4 styled-jsx files in scope: `RenewalFailedModal` (1,292 LOC), `DowngradeConfirmModal` (611 LOC), `ProductFilters.tsx` (slider thumb special case), and `my-account/layout.tsx` (global `display:none !important` hack). Net result: zero `<style jsx>` in any non-email-template file in the codebase.

**Architecture:**
- **Phase 1 + 2:** Apply the `CancellationUpsellModal/` folder template (orchestrator + sub-components + co-located CSS module + smoke test) to RenewalFailedModal and DowngradeConfirmModal. CVA encodes their variant axes (RenewalFailed: `tone: 'danger' | 'success'`; DowngradeConfirm: `tier: 'tradie' | 'foreman' | 'boss'`). lucide-react replaces inline SVGs. `:global()` selectors → `data-*` attributes. z-index micro-stack preserved exactly.
- **Phase 3:** ProductFilters keeps its slider-thumb pseudo-element styles in `slider.module.css` (Tailwind has no `::-webkit-slider-thumb` utilities). Other styled-jsx rules port to Tailwind utilities.
- **Phase 4:** `my-account/layout.tsx` global hide is refactored to use a body data attribute opt-in (`body[data-account-layout]`) declared in `globals.css`. Less fragile than the cross-tree class-hook hack while preserving identical visual behaviour.

**Tech Stack:** Same as Plan 2 — React 19, Next.js 15, Tailwind 3, CVA, clsx + tailwind-merge (`cn()`), lucide-react, CSS modules, `tsx` for smoke tests.

**Hard requirements (per phase):**
- 100% visual parity at desktop and mobile (≤540px) breakpoints
- 100% behavioural parity: public prop interfaces unchanged; effects, callbacks, Stripe flows, optimistic updates all preserved
- z-index values preserved exactly per modal (existing micro-stack assumptions)
- `npm run lint && npm run type-check && npm run build` clean after each phase
- Smoke test for each refactored modal (covers all meaningful prop combos)
- Per-phase commit (one commit per modal/file, NOT mixed)

---

## File Structure (Plan 3 footprint)

**Phase 1 creates:**
- `src/components/modals/RenewalFailedModal/` (folder)
  - `index.tsx` — orchestrator (state, Stripe payment hooks, callbacks, prop assembly)
  - Sub-components: identified during Task 1.1 audit (~5-7 components based on RenewalFailed's section structure)
  - `*.module.css` — composite gradients, scrollbar (Tailwind-hostile rules)
  - `__tests__/RenewalFailedModal.test.ts` — smoke test
- Plus deletes: `src/components/modals/RenewalFailedModal.tsx`

**Phase 2 creates:**
- `src/components/modals/DowngradeConfirmModal/` (folder)
  - `index.tsx` — orchestrator
  - Sub-components: identified during Task 2.1 audit (~3-5 components — it's a smaller modal)
  - `*.module.css` if needed for tier-themed gradients
  - `__tests__/DowngradeConfirmModal.test.ts` — smoke test
- Plus deletes: `src/components/modals/DowngradeConfirmModal.tsx`

**Phase 3 creates:**
- `src/components/features/ProductFilters/` OR co-located `src/components/features/product-filters.module.css`
  - Decision: if ProductFilters scores 3+ on decomposition criteria, decompose into folder. If not, just extract the CSS module alongside the .tsx.
- Plus modifies: `src/components/features/ProductFilters.tsx` (remove styled-jsx, import the module)

**Phase 4 modifies:**
- `src/app/(site)/my-account/layout.tsx` — drop the `<style jsx global>` block, add the body data attribute via useEffect
- `src/app/globals.css` — add the body[data-account-layout] selector for the chrome-hide rule

**Per-phase manifest update:**
- `CLAUDE.md` — bump `lastVerified` for the affected domain in each phase's commit:
  - Phase 1: `subscription` (where renewal modal lives) + `dev-tooling` (gallery)
  - Phase 2: `subscription` + `dev-tooling`
  - Phase 3: cart-shop-products (where ProductFilters lives) — verify in audit
  - Phase 4: `dashboard-account` + `shared-ui`

**Files NOT in scope for Plan 3** (despite spec mention):
- `src/components/modals/MembershipModal.tsx` — the spec listed this but the audit (2026-05-08) confirms it no longer contains `<style jsx>`. Either Plan 1's codemod sweeps absorbed the cleanup or the file was already migrated separately. No work needed.
- `src/components/sections/promo/UnlockDiscounts.tsx` — same situation. No `<style jsx>` present today.
- `src/components/email-preview/{InvoicePreview,PaymentFailedPreview,SubscriptionRenewalPreview}.tsx` — explicitly out of scope (mail clients can't parse Tailwind; email templates use plain inline `<style>` and stay).

---

## Pre-flight check

- [ ] **Step 0: Confirm clean working tree on `ui-improvements` branch with Plans 1 + 2 committed**

Run:
```bash
git status --short
git log -3 --oneline
```

Expected:
- `git status` is clean (or only the pre-existing 2 unrelated modifications if they reappeared).
- `git log` shows `d0a2dd2 refactor(ui): decompose CancellationUpsellModal...` and `63ec206 plan 1 committed` in the recent commits.

If anything else is dirty: stash or commit before starting Plan 3.

---

# Phase 1 — RenewalFailedModal decomposition

`src/components/modals/RenewalFailedModal.tsx` is 1,292 LOC with 3 separate `<style jsx>` blocks (~258 LOC total). It's the second-most complex modal in the codebase, with full Stripe payment integration baked in (lines 46-66 contain `stripePromise`, `RENEWAL_BILLING_SUPPORT_SUBJECT`, `renewalBillingSupportMailto`, `errorPayloadSuggestsMissingDefaultPm`).

The modal uses `--tone-glow` and `--tone-accent` CSS custom properties to switch between **danger** (red, the failed state) and **success** (green, post-recovery state) themes. These become a CVA `tone: 'danger' | 'success'` variant.

## Task 1.1: Audit RenewalFailedModal structure + identify sub-sections

**Files:**
- Read-only: `src/components/modals/RenewalFailedModal.tsx`

- [ ] **Step 1: Read the file end-to-end and identify the visual sections**

Run:
```bash
wc -l src/components/modals/RenewalFailedModal.tsx
sed -n '1,100p' src/components/modals/RenewalFailedModal.tsx     # imports, props, helpers
sed -n '570,700p' src/components/modals/RenewalFailedModal.tsx   # component start, hooks, top JSX
sed -n '147,321p' src/components/modals/RenewalFailedModal.tsx   # first style block
sed -n '526,562p' src/components/modals/RenewalFailedModal.tsx   # second style block
sed -n '1242,1287p' src/components/modals/RenewalFailedModal.tsx # third style block
```

Identify the natural visual sections (e.g. Hero with status badge, Issue summary card, Payment method card, Resolution actions, Support contact, Trust bar). Each section becomes a sub-component file in the new folder.

- [ ] **Step 2: Document the audit in a temporary scratchpad**

Write a brief note (2-3 paragraphs, plus a list of identified sub-components) to `/tmp/renewal-failed-audit.md` (NOT into the repo). The note should answer:
- What are the 5-7 visual sections?
- What CSS custom properties / tone variants exist? (`--tone-glow`, `--tone-accent`, anything else?)
- What `:global()` selectors are used? (each becomes a `data-*` rename)
- What inline SVG factory functions exist? (each maps to a lucide icon)
- What composite gradients / scrollbar / pseudo-elements need a CSS module?
- What's the public prop interface? (Lines 67-95 of original)
- What hooks/effects/Stripe integrations does the orchestrator need to preserve?
- What z-index does the modal currently use?

This audit becomes the input for Task 1.3.

## Task 1.2: Set up RenewalFailedModal folder + CSS module

**Files:**
- Create: `src/components/modals/RenewalFailedModal/`
- Create: `src/components/modals/RenewalFailedModal/styles.module.css`

- [ ] **Step 1: Create the folder**

```bash
mkdir -p src/components/modals/RenewalFailedModal
```

- [ ] **Step 2: Write `styles.module.css`** with ONLY the Tailwind-hostile rules from the original `<style jsx>` blocks. Reference Plan 2's `hero.module.css` as the structural template.

The exact contents depend on Task 1.1's audit. At minimum, expect:
- Composite multi-stop radial gradients used by the hero
- `::-webkit-scrollbar` rules for the modal frame
- Any `repeating-linear-gradient` overlays
- The `--tone-glow` and `--tone-accent` CSS variables AS CSS-module-scoped custom properties (since they vary per-instance via the CVA variant)

Use the actual values from the original file's style blocks (lines 147-321, 526-562, 1242-1287). Do not invent new values.

- [ ] **Step 3: Verify build**

```bash
npm run type-check 2>&1 | tail -3
npm run build 2>&1 | tail -5
```
Both exit 0. The new module is unused so far so build is unchanged.

## Task 1.3: Build the sub-components

**Files:**
- Create: `src/components/modals/RenewalFailedModal/<SubComponent>.tsx` (one per identified section from Task 1.1)

This task expands into 5-7 sub-tasks (one per section). For EACH sub-component:

- [ ] **Step 1: Write the component file**

Pattern to follow (from Plan 2's sub-components):
- `"use client";` directive
- Import lucide icons (per the icon mapping from Task 1.1's audit)
- Import `cn` from `@/utils/cn`
- Import `cva` from `class-variance-authority` if the component has variants
- Import the CSS module if the component uses Tailwind-hostile styles
- Define a clear props interface (flat, ≤8 props per component)
- Render JSX using Tailwind utilities + lucide icons + `data-*` attributes (NOT `:global` classnames)
- For tone-themed elements: use CVA with `tone: 'danger' | 'success'` variants

Reference: `src/components/modals/CancellationUpsellModal/Hero.tsx`, `LoseGrid.tsx`, `Banner.tsx`, `ActionRow.tsx`, `DowngradeCard.tsx`, `TrustBar.tsx` — read these as templates.

- [ ] **Step 2: Verify type-check + build after each sub-component**

```bash
npm run type-check 2>&1 | tail -3
npm run build 2>&1 | tail -5
```
Both exit 0 after EACH sub-component file is written. If a Tailwind class is unrecognized, substitute (document the substitution: e.g. `py-2.25` → `py-[9px]`) and re-build.

Do NOT continue to the next sub-component if the previous one's build fails. Fix first.

## Task 1.4: Build orchestrator (`index.tsx`) + atomic swap

**Files:**
- Create: `src/components/modals/RenewalFailedModal/index.tsx`
- Delete: `src/components/modals/RenewalFailedModal.tsx`

- [ ] **Step 1: Write `index.tsx`**

The orchestrator owns:
- Public props interface (BYTE-IDENTICAL to original lines 67-95)
- All `useState`, `useEffect`, custom hooks from the original
- Stripe payment integration (`stripePromise`, payment intent flow, error handling)
- All callbacks (handleResolve, handleSupportClick, etc. — names per Task 1.1's audit)
- The bespoke modal wrapper preserving the original z-index (likely `z-[80]` like CancellationUpsellModal — confirm in audit)
- Composition of sub-components

Reference: `src/components/modals/CancellationUpsellModal/index.tsx` — same pattern.

CRITICAL: preserve the `useEffect` for body scroll lock + Escape key handler (mirrors original — lines TBD per audit).

- [ ] **Step 2: Type-check + build**

```bash
npm run type-check 2>&1 | tail -3
npm run build 2>&1 | tail -5
```
Both exit 0.

- [ ] **Step 3: Delete the old monolith file**

```bash
rm src/components/modals/RenewalFailedModal.tsx
```

- [ ] **Step 4: Verify import resolution**

```bash
grep -rnE "from .@/components/modals/RenewalFailedModal" src --include="*.tsx" --include="*.ts"
```
Expected: hits in `ModalsGalleryClient.tsx` (line 52) plus any production caller. The folder/index.tsx pattern resolves them automatically — no callsite changes needed.

- [ ] **Step 5: Final phase build**

```bash
npm run lint 2>&1 | tail -5
npm run type-check 2>&1 | tail -3
npm run build 2>&1 | tail -8
```
All three exit 0. Lint may have pre-existing errors in `scripts/codemod-dark-text.js` etc. — those are OK.

## Task 1.5: Add smoke test for RenewalFailedModal

**Files:**
- Create: `src/components/modals/RenewalFailedModal/__tests__/RenewalFailedModal.test.ts`
- Modify: `package.json` (add npm script)

- [ ] **Step 1: Write the smoke test**

Use the Plan 2 template at `src/components/modals/CancellationUpsellModal/__tests__/CancellationUpsellModal.test.ts` as the structural reference. The test MUST:
- Import `CancellationUpsellModal` test's `asset-stubs.cjs` preload (or duplicate the stub if needed)
- Use `react-dom/server`'s `renderToString`
- Wrap with `SessionProvider`, `QueryClientProvider`, `LoadingProvider`, `ToastProvider`
- Render the modal in 4-6 meaningful prop combos:
  1. Default (`isOpen=true`, no past-due context)
  2. With Stripe payment intent failure (mock the intent state)
  3. With success state (post-recovery)
  4. With missing default payment method (per `errorPayloadSuggestsMissingDefaultPm`)
  5. `isOpen=false` (renders null)
- Each combo asserts the renderToString output is a non-empty string for `isOpen=true` (or empty for `isOpen=false`)

If a hook fails on missing context, add the missing provider.

- [ ] **Step 2: Add npm script**

Edit `package.json`. Add to `"scripts"`:
```json
"test:renewal-failed": "tsx --require ./scripts/codemods/__tests__/asset-stubs.cjs src/components/modals/RenewalFailedModal/__tests__/RenewalFailedModal.test.ts",
```

(Adjust the `--require` path if Plan 2's `asset-stubs.cjs` was placed differently — verify by reading `package.json` `test:cancellation-upsell` for the exact pattern.)

- [ ] **Step 3: Run the test**

```bash
npm run test:renewal-failed
```
Expected: all combos pass. If a combo throws, that's a real bug — STOP and report BLOCKED.

## Task 1.6: Update manifest + visual parity verification

**Files:**
- Modify: `CLAUDE.md` (Domain Manifest)

- [ ] **Step 1: Update manifest**

Edit `CLAUDE.md`. In the `subscription` domain entry:
- Add `"src/components/modals/RenewalFailedModal/**"` to `paths` if not already covered by a wildcard
- Bump `lastVerified` to `"2026-05-08"`

In the `dev-tooling` domain entry:
- Bump `lastVerified` to `"2026-05-08"`

Validate JSON:
```bash
sed -n '/^```json$/,/^```$/{/^```/d; p}' CLAUDE.md | node -e "let s=''; process.stdin.on('data',c=>s+=c); process.stdin.on('end',()=>{try{JSON.parse(s); console.log('VALID');}catch(e){console.error('INVALID:', e.message); process.exit(1);}})"
```
Expected: `VALID`.

- [ ] **Step 2: Visual parity verification (manual — controller/user task)**

Start dev server (`npm run dev`). Open `/dev/modals`. Click "RenewalFailedModal" gallery item. Verify the modal renders byte-equivalently to the pre-refactor version:
- Hero with status badge (danger tone — red glow)
- Issue summary card content
- Payment method section (if applicable)
- Resolution action buttons
- Trust bar / footer
- Mobile (≤540px): all sections collapse correctly

If a real production caller exists (find via grep), trigger the actual flow and verify production rendering too.

- [ ] **Step 3: Commit Phase 1**

User-authorized: ask the user explicitly. Suggested commit message:

```
refactor(modals): decompose RenewalFailedModal — 1292 LOC monolith → folder

Plan 3 Phase 1. Applies the Plan 2 decomposition template to
RenewalFailedModal: 7 sub-components (TBD per Task 1.1 audit) + CSS module
+ smoke test in src/components/modals/RenewalFailedModal/.

CVA encodes the tone variant (danger/success — was --tone-glow/--tone-accent
CSS vars). lucide-react replaces inline SVG factories. data-* attributes
replace :global() selectors. Stripe payment integration preserved
byte-identically in the orchestrator.

Smoke test: 4-6 prop combos all passing.

Verified: lint, type-check, build, smoke test all exit 0.
Visual parity confirmed in /dev/modals.
```

---

# Phase 2 — DowngradeConfirmModal decomposition

`src/components/modals/DowngradeConfirmModal.tsx` is 611 LOC with one large `<style jsx>` block (~432 LOC) — the densest style block of the remaining modals. It's tier-themed (`tradie`/`foreman`/`boss`) with **11 CSS custom properties × 3 tiers = 33 theme values**. These all become CVA variants.

## Task 2.1: Audit DowngradeConfirmModal structure

**Files:**
- Read-only: `src/components/modals/DowngradeConfirmModal.tsx`

- [ ] **Step 1: Read the file end-to-end**

```bash
wc -l src/components/modals/DowngradeConfirmModal.tsx
sed -n '1,170p' src/components/modals/DowngradeConfirmModal.tsx   # imports, props, helpers, hooks
sed -n '174,606p' src/components/modals/DowngradeConfirmModal.tsx # the single large style block
```

Identify the visual sections. Likely candidates: Header (tier badge + title), Plan-from card, Plan-to card, Comparison row (entries before/after), Action row, Trust bar. Document in `/tmp/downgrade-confirm-audit.md`.

- [ ] **Step 2: Document the audit**

Same fields as Task 1.1 Step 2. Specifically capture:
- The 11 CSS custom properties used per tier (likely `--tier-color`, `--tier-glow-1`, `--tier-glow-2`, `--tier-card-bg`, `--tier-cta-bg`, `--tier-cta-shadow`, `--tier-icon-bg`, `--tier-border`, etc. — confirm exact names by reading the style block)
- All 3 tiers' color values (compare against Plan 1's `brand-tier.{tradie,foreman,boss}` and `red-*` palette to see what's reusable vs. needs arbitrary `[#hex]` values)
- The from/to card structure (likely a "Switching from X plan to Y plan" comparison)
- The "what stays" / "what changes" copy structure

## Task 2.2: Set up DowngradeConfirmModal folder + CSS module (if needed)

**Files:**
- Create: `src/components/modals/DowngradeConfirmModal/`
- Create (optional): `src/components/modals/DowngradeConfirmModal/styles.module.css` — only if there are composite gradients or pseudo-elements that don't fit Tailwind utilities

- [ ] **Step 1: Create the folder**

```bash
mkdir -p src/components/modals/DowngradeConfirmModal
```

- [ ] **Step 2: Decide on CSS module**

If Task 2.1 audit identifies composite gradients, repeating patterns, or `::-webkit-scrollbar` rules: write `styles.module.css` with those values verbatim from the original style block.

If everything translates cleanly to Tailwind utilities: skip this step. Most tier theming will translate to CVA-driven Tailwind classes; only the truly composite parts (e.g. multi-layer radial gradients) need a module.

- [ ] **Step 3: Verify build (if module created)**

```bash
npm run type-check 2>&1 | tail -3
npm run build 2>&1 | tail -5
```

## Task 2.3: Build the sub-components

**Files:**
- Create: `src/components/modals/DowngradeConfirmModal/<SubComponent>.tsx` (one per identified section)

Same pattern as Task 1.3. For each sub-component:
- Write the component using Tailwind utilities + lucide + CVA for tier variants where applicable
- Type-check + build after each one
- The TIER-THEMED sub-components (likely the from/to plan cards, the comparison row) get CVA definitions like:

```ts
const planCard = cva(
  "rounded-xl p-4 border bg-gradient-to-br ...",
  {
    variants: {
      tier: {
        tradie:  "from-brand-tier-tradie/10 to-transparent border-brand-tier-tradie/30 ...",
        foreman: "from-brand-tier-foreman/10 to-transparent border-brand-tier-foreman/30 ...",
        boss:    "from-brand-tier-boss/10 to-transparent border-brand-tier-boss/30 ...",
      },
    },
  }
);
```

Reference: Plan 2's `DowngradeCard.tsx` already has 5 CVAs × 3 tiers — same pattern, applied at component scope here.

## Task 2.4: Build orchestrator + atomic swap

**Files:**
- Create: `src/components/modals/DowngradeConfirmModal/index.tsx`
- Delete: `src/components/modals/DowngradeConfirmModal.tsx`

Same pattern as Task 1.4. The orchestrator:
- Public props (lines 10-26 of original — preserve EXACTLY)
- TIER_FROM_NAME helper (lines 28-34) — keep in orchestrator OR move to a `lib/tier.ts` if it's used elsewhere (audit: probably only here; keep inline)
- All hooks/effects from the original component body
- The bespoke modal wrapper with original z-index preserved
- Composition of sub-components

After write: type-check, build, delete old file, verify imports.

## Task 2.5: Smoke test for DowngradeConfirmModal

**Files:**
- Create: `src/components/modals/DowngradeConfirmModal/__tests__/DowngradeConfirmModal.test.ts`
- Modify: `package.json` (add npm script `test:downgrade-confirm`)

Same pattern as Task 1.5. Cover combos:
1. Tradie → Foreman downgrade
2. Foreman → Boss downgrade
3. Boss → Tradie downgrade (bigger downgrade — tests all 3 tier renderings)
4. With saveLabel
5. Without saveLabel
6. `isOpen=false`

## Task 2.6: Manifest + visual parity + commit

Same pattern as Task 1.6. Bump `lastVerified` for `subscription` and `dev-tooling`. Manual visual A/B in `/dev/modals` for all 3 tier combos × 2 breakpoints. Commit Phase 2 with user authorization.

---

# Phase 3 — ProductFilters slider migration

`src/components/features/ProductFilters.tsx` is 447 LOC with 48 LOC of styled-jsx covering the dual-handle range slider. The slider uses `::-webkit-slider-thumb`, `::-moz-range-thumb`, `::-webkit-slider-track`, and `::-moz-range-track` pseudo-elements — none of which have Tailwind utilities. The styled-jsx also has `:global(html.dark) .slider-thumb::-webkit-slider-thumb` rules for dark mode.

This file is too small to decompose into a folder. The right move: extract the styled-jsx into a co-located CSS module, leave the rest of the file alone.

## Task 3.1: Extract slider CSS module

**Files:**
- Create: `src/components/features/product-filters.module.css`
- Modify: `src/components/features/ProductFilters.tsx` (remove `<style jsx>`, import the module)

- [ ] **Step 1: Read the styled-jsx block**

```bash
sed -n '127,180p' src/components/features/ProductFilters.tsx
```

Confirm the rules:
- `.slider-thumb` (base wrapper)
- `.slider-thumb::-webkit-slider-thumb`
- `.slider-thumb::-moz-range-thumb`
- `.slider-thumb::-webkit-slider-track`
- `.slider-thumb::-moz-range-track`
- `:global(html.dark) .slider-thumb::-webkit-slider-thumb` (dark mode override)
- `:global(html.dark) .slider-thumb::-moz-range-thumb`

- [ ] **Step 2: Write `product-filters.module.css`**

Use Write tool. Copy each CSS rule from the styled-jsx block VERBATIM (same selectors, same values), but adapt the syntax for CSS Modules:
- Drop the `:global(...)` wrapper for `html.dark` — instead use `:global(html.dark)` selector wrap (CSS Modules supports `:global()`)
- The `.slider-thumb` class becomes the module's exported class — JSX uses `styles.sliderThumb`

Exact content shape:
```css
/* ProductFilters dual-handle range slider — webkit/moz pseudo-elements
 * that don't have Tailwind utilities. Imported as a CSS module by
 * ProductFilters.tsx.
 */

.sliderThumb {
  /* base wrapper styles from original .slider-thumb (lines TBD) */
}

.sliderThumb::-webkit-slider-thumb {
  /* values from original */
}

.sliderThumb::-moz-range-thumb {
  /* values from original */
}

.sliderThumb::-webkit-slider-track {
  /* values from original */
}

.sliderThumb::-moz-range-track {
  /* values from original */
}

:global(html.dark) .sliderThumb::-webkit-slider-thumb {
  /* dark mode override values */
}

:global(html.dark) .sliderThumb::-moz-range-thumb {
  /* dark mode override values */
}
```

Use the actual values from the original file. Do not invent.

- [ ] **Step 3: Modify `ProductFilters.tsx`**

- Remove the entire `<style jsx>{ ... }</style>` block (lines ~127-180)
- Add import at top: `import styles from "./product-filters.module.css";`
- Replace `className="slider-thumb ..."` with `className={cn(styles.sliderThumb, "...")}` (or inline `className={\`${styles.sliderThumb} ...\`}` if the component doesn't already use `cn`)
- Verify no other references to the literal class name `slider-thumb` exist outside ProductFilters

- [ ] **Step 4: Verify**

```bash
npm run type-check 2>&1 | tail -3
npm run build 2>&1 | tail -5
```
Both exit 0. The slider should still render identically — same CSS, just module-scoped.

- [ ] **Step 5: Visual verification**

`/dev/modals` doesn't show ProductFilters. Find a real page that renders it (likely a /shop or /products page):
```bash
grep -rn "ProductFilters" src/app --include="*.tsx" | head -5
```
Open that page in dev server. Verify:
- Slider thumbs render with correct color/size
- Dark mode toggle changes thumb color (test by toggling theme)
- Slider behaves identically (drag works, keyboard works)

- [ ] **Step 6: Manifest + commit**

Bump `lastVerified` for `cart-shop-products` (verify ProductFilters is in that domain's paths; if not, add to the right domain). Commit Phase 3 with user authorization.

---

# Phase 4 — `my-account/layout.tsx` chrome-hide refactor

`src/app/(site)/my-account/layout.tsx` uses `<style jsx global>{ display: none !important }` to hide `.site-header`, `.site-footer`, `.newsletter-section` when on /my-account routes. This is a fragile cross-tree class-hook coupling.

The fix: use a body data attribute opt-in. The layout sets `body[data-account-layout]` via `useEffect`; `globals.css` defines the hide rules under that selector. Same visual behaviour, more discoverable, and the hide can be opt-in/out cleanly.

## Task 4.1: Refactor my-account layout chrome-hide

**Files:**
- Modify: `src/app/(site)/my-account/layout.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add the body data attribute selectors to globals.css**

Edit `src/app/globals.css`. Add at the end (or in the existing layout-related section):

```css
/* my-account layout opts out of site chrome (header, footer, newsletter section).
 * Set via useEffect in src/app/(site)/my-account/layout.tsx so the opt-in is
 * explicit and reversible (cleanup runs on unmount). The data-attribute scope
 * is more discoverable than the previous .site-header/.site-footer global hide. */
body[data-account-layout] .site-header,
body[data-account-layout] .site-footer,
body[data-account-layout] .newsletter-section {
  display: none !important;
}
```

- [ ] **Step 2: Refactor `my-account/layout.tsx`**

Replace the entire file with:

```tsx
"use client";

import React, { useEffect } from "react";
import BottomNav from "./components/BottomNav";

export default function MyAccountLayout({ children }: { children: React.ReactNode }) {
  /** Opt out of site-wide chrome (header/footer/newsletter section) while on
   * /my-account routes. The hide rules live in globals.css under the
   * body[data-account-layout] selector — set/cleared here. */
  useEffect(() => {
    document.body.setAttribute("data-account-layout", "");
    return () => {
      document.body.removeAttribute("data-account-layout");
    };
  }, []);

  return (
    <div className="min-h-screen-svh w-full min-w-0 max-w-full overflow-x-hidden bg-gray-50 dark:bg-neutral-950 flex flex-col">
      <main className="flex-1 w-full min-w-0 max-w-full overflow-x-hidden pb-16 lg:pb-0">
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
```

The `<style jsx global>` block is gone; the `useEffect` does the equivalent body-attribute toggle.

- [ ] **Step 3: Verify build**

```bash
npm run type-check 2>&1 | tail -3
npm run build 2>&1 | tail -5
```
Both exit 0.

- [ ] **Step 4: Visual verification**

Start dev server. Visit `/my-account` (any sub-route). Verify:
- Site header is hidden
- Site footer is hidden
- Newsletter section is hidden
- BottomNav is visible
- Page content renders inside `<main>`

Then navigate to a non-`/my-account` route (e.g. `/`). Verify:
- Site header reappears
- Site footer reappears
- Newsletter section reappears
- BottomNav is gone

The cleanup runs on unmount → the data attribute is removed → the chrome reappears. If chrome stays hidden after navigation, the cleanup didn't fire — fix the useEffect.

- [ ] **Step 5: Manifest + commit**

Bump `lastVerified` for `dashboard-account` (where my-account lives) and `shared-ui` (where globals.css lives — verify in manifest). Commit Phase 4 with user authorization.

Suggested commit message:
```
refactor(my-account): use body data attribute for chrome opt-out

Replaces <style jsx global> { .site-header,.site-footer,.newsletter-section
{ display: none !important } } in my-account/layout.tsx with body[data-account-layout]
selectors in globals.css + a useEffect that sets/clears the data attribute on
mount/unmount.

Same visual behaviour. Less fragile cross-tree coupling — the opt-out is now
explicit (data attribute), discoverable (single grep finds both layout setter
and CSS rule), and reversible (cleanup runs on unmount, not relying on the
component being unmounted at all).

Trade-off: still uses !important to override potential header/footer visibility
rules. Removing !important is Phase 5 work (audit and remove all 86 site-wide
!important overrides).
```

---

## Plan 3 final verification gate

After all 4 phases done:

- [ ] **Step 1: Confirm zero `<style jsx>` in non-email-template files**

```bash
grep -rlE "<style( jsx)?[ >]" src/components src/app --include="*.tsx" --include="*.jsx" 2>/dev/null
```
Expected output (only the 3 email previews):
```
src/components/email-preview/InvoicePreview.tsx
src/components/email-preview/PaymentFailedPreview.tsx
src/components/email-preview/SubscriptionRenewalPreview.tsx
```

If anything else appears, that's a missed file — investigate.

- [ ] **Step 2: Run all tests**

```bash
npm run test:codemods
npm run test:cancellation-upsell
npm run test:renewal-failed
npm run test:downgrade-confirm
```
All exit 0.

- [ ] **Step 3: Final lint + type-check + build**

```bash
npm run lint 2>&1 | tail -5
npm run type-check 2>&1 | tail -3
npm run build 2>&1 | tail -8
```
All exit 0.

- [ ] **Step 4: Confirm Plan 3 done**

Codebase state after Plan 3:
- 0 `<style jsx>` blocks in `src/components` or `src/app` (only 3 email-preview files use plain `<style>` — out of scope for this cleanup)
- 4 modals refactored using the Plan 2 decomposition pattern
- 3 modals (CancellationUpsell from Plan 2, RenewalFailed + DowngradeConfirm from Plan 3) have smoke tests
- ProductFilters slider rules in a co-located CSS module
- my-account layout uses body data attribute opt-out
- Manifest current

Ready for Plan 4 (UI primitives) and Plan 5 (debt cleanup).

---

## Risks and rollback

- **RenewalFailedModal Stripe integration breakage:** the orchestrator must preserve the Stripe payment hook chain exactly. If smoke tests pass but production rendering breaks (e.g. Stripe Elements don't mount), check that `stripePromise` is initialized at the same point in the lifecycle.
- **DowngradeConfirmModal tier theming:** the original used 11 CSS vars per tier. CVA encodes them as Tailwind classes. If a tier's color comes out wrong, audit the original style block's `--tier-*` values and verify each CVA variant maps correctly.
- **ProductFilters slider drag broken:** if dragging stops working after the CSS module migration, the issue is likely a missing `appearance: none` or `pointer-events` rule. Check the original styled-jsx for those properties.
- **my-account chrome-hide leak:** if header/footer stay hidden after navigating away, the useEffect cleanup didn't fire. Verify the cleanup function is returned correctly and the useEffect deps are `[]` (not omitted, not a stale closure).
- **Per-phase rollback:** each phase commits separately. Reverting one phase doesn't affect the others. `git revert <sha>` is the rollback escape hatch.

## Doc updates required (per phase)

Per the doc-sync hook, each phase must update the affected domain's docs:
- Phase 1: `docs/subscription/` — note the modal decomposition
- Phase 2: `docs/subscription/` — same
- Phase 3: `docs/cart-shop-products/` — note the slider module extraction
- Phase 4: `docs/dashboard-account/` — note the body-attribute pattern, `docs/shared-ui/` — note the new globals.css selector

The doc-sync hook will block if these aren't updated. The implementer subagent (or a follow-up `domain-doc-updater` agent dispatch) handles per-phase doc refresh.
