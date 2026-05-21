# UI Cleanup — Plan 1: Foundation + Codemod Sweeps

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-05-08-ui-tailwind-cleanup-design.md](../specs/2026-05-08-ui-tailwind-cleanup-design.md) (Phase 0 + Phase 1)

**Goal:** Land design tokens, the `cn()` helper, and three codemod sweeps that mechanically convert ~750 hex/text-size/header-offset literals into named tokens — with **zero visual change anywhere**.

**Architecture:**
- Add 3 deps (`clsx`, `tailwind-merge`, `class-variance-authority`) and a `cn()` helper at `src/utils/cn.ts`
- Extend the existing `red.*` palette in `tailwind.config.ts` (do **not** create `brand-red.*`); add `brand-tier.*` colors, micro-text scale (`text-2xs`/`text-3xs`), custom `xs: '540px'` breakpoint, header-height CSS vars in `globals.css`
- Move 3 inline `@keyframes` (`spin-reverse`, `sparkle`, `memberBenefitFloat`) into `tailwind.config.ts`
- Add a `safelist` regex covering dynamic class builders in `prize-brand-colors.ts` / `brand-theme.ts` / `packageColorScheme.ts`
- Build 3 small TypeScript codemod scripts under `scripts/codemods/` with fixture-based tests
- Run each codemod: dry-run → review → apply → verify (build + spot-check)
- Hand-fix the `badgePulse` keyframe `rgba(238,0,0,…)` that the codemod can't see

**Tech Stack:** Next.js 15, Tailwind 3, TypeScript, `tsx` for codemod scripts. No new test framework — use existing `tsx` + a tiny `assert.deepStrictEqual` pattern (matching repo convention from `src/utils/billing/__tests__/anchor-billing.test.ts`).

**Hard requirements:**
- 100% visual parity (any pixel change is a bug)
- `npm run lint` clean after every task that touches `src/`
- `npm run type-check` clean after every task
- `npm run build` clean after every task that touches `src/` or config
- All commits gated on explicit user authorization (CLAUDE.md hard rule #1)

---

## File Structure

**Create:**
- `src/utils/cn.ts`
- `scripts/codemods/lib/walk-tsx.ts` — file walker shared by codemods
- `scripts/codemods/lib/replace-classname.ts` — regex-based className rewriter
- `scripts/codemods/lib/codemod-runner.ts` — shared CLI flag parsing + dry-run/apply harness
- `scripts/codemods/sweep-brand-red.ts`
- `scripts/codemods/sweep-micro-text.ts`
- `scripts/codemods/sweep-header-offsets.ts`
- `scripts/codemods/__tests__/sweep-brand-red.test.ts`
- `scripts/codemods/__tests__/sweep-micro-text.test.ts`
- `scripts/codemods/__tests__/sweep-header-offsets.test.ts`
- `docs/shared-ui/tailwind-conventions.md` — 1-pager rules

**Modify:**
- `package.json` — 3 deps, 9 npm scripts (3 codemods × `:dry`/`:apply`/test)
- `tailwind.config.ts` — extend `red.*`, add `brand-tier.*`, add `fontSize.{2xs,3xs}`, add `screens.xs`, move 3 keyframes in, fix `badgePulse` rgba, expand `safelist`
- `src/app/globals.css` — add `--app-header-h`, `--app-header-h-lg` CSS vars; fix `@apply focus:border-[#ee0000]` → `@apply focus:border-red-600`
- `src/components/ui/PaymentLoadingSpinner.tsx` — remove inline `<style>{ @keyframes spin-reverse }`
- `src/components/loading/SuccessScreen.tsx` — remove inline `<style jsx>{ @keyframes sparkle }`
- `src/components/sections/promo/PartnerBenefitsPromoSection.tsx` — remove inline `<style jsx>{ @keyframes memberBenefitFloat }`
- All `*.tsx`/`*.css` files matched by codemods (auto-edited; reviewed via dry-run)

**Domain manifest** (`CLAUDE.md`): Bump `lastModified` and `lastVerified` for `shared-ui`, `infrastructure`, `dev-tooling` after work completes.

---

## Pre-flight check

- [ ] **Step 0: Confirm clean working tree**

Run: `git status --short`
Expected: empty output (clean tree). If not, stash/commit unrelated work before starting.

Run: `git rev-parse --abbrev-ref HEAD`
Expected: `ui-improvements` (the worktree branch we're on).

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (auto-generated)

- [ ] **Step 1: Install runtime deps**

Run: `npm install clsx tailwind-merge class-variance-authority`

Expected: 3 packages added, 0 vulnerabilities (or unchanged), no peer warnings (`clsx` and `tailwind-merge` have minimal peer deps; `cva` has none).

- [ ] **Step 2: Verify package.json**

Read `package.json`. Confirm `dependencies` block contains:
```json
"clsx": "^2.x.x",
"tailwind-merge": "^2.x.x",
"class-variance-authority": "^0.7.x"
```
(Exact minor versions don't matter; major versions do.)

- [ ] **Step 3: Type-check passes**

Run: `npm run type-check`
Expected: clean exit (0). The new packages ship their own types; no separate `@types/*` needed.

- [ ] **Step 4: Build passes**

Run: `npm run build`
Expected: success in ~30-90s. No TypeScript errors, no Tailwind warnings.

- [ ] **Step 5: Commit (requires user authorization)**

If user has authorized commits in their most recent message (keyword: `commit`), run:
```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
deps: add clsx, tailwind-merge, class-variance-authority

Foundation for cn() helper and CVA-based component variants per
spec docs/superpowers/specs/2026-05-08-ui-tailwind-cleanup-design.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Otherwise: skip this step, ask user.

---

## Task 2: Create the `cn()` helper

**Files:**
- Create: `src/utils/cn.ts`

- [ ] **Step 1: Write the helper**

Create `src/utils/cn.ts` with this exact content:
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Compose Tailwind classNames safely.
 *
 * - `clsx` flattens conditional inputs (strings, objects, arrays).
 * - `twMerge` resolves conflicting utilities so the LAST class wins consistently
 *   (e.g. `cn("p-2", "p-4")` → `"p-4"`, never both).
 *
 * Use this everywhere instead of template-literal className concatenation.
 *
 * @example
 *   <button className={cn("rounded p-2", isPrimary && "bg-red-600", className)} />
 */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
```

- [ ] **Step 2: Type-check the new file**

Run: `npm run type-check`
Expected: clean. If `clsx` or `tailwind-merge` import errors, Task 1 didn't complete.

- [ ] **Step 3: Smoke-import in build**

Run: `npm run build`
Expected: success. The helper is unused so far, so the change is invisible.

- [ ] **Step 4: Commit (requires user authorization)**

```bash
git add src/utils/cn.ts
git commit -m "$(cat <<'EOF'
feat(utils): add cn() helper for Tailwind className composition

Wraps clsx + tailwind-merge so utility conflicts resolve consistently.
Replaces ad-hoc template-literal className patterns going forward.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Extend `tailwind.config.ts`

**Files:**
- Modify: `tailwind.config.ts` (lines 6-152 — almost everywhere)

- [ ] **Step 1: Read the current config**

Read `tailwind.config.ts`. Note current state:
- `safelist` (line 6-8) targets `premium-gold` only
- `colors.red` (lines 30-32) overrides `red-600 = '#ee0000'` (only that one shade)
- `colors.brand` exists for dewalt/makita/milwaukee/ryobi
- `fontSize` extends only `agency-title`, `6xl`, `7xl`, `8xl`, `9xl`
- `screens` is NOT customized (uses Tailwind defaults)
- `keyframes` defines `fadeIn`, `slideUp`, `lineExpand`, `fadeSlideUp`, `badgePulse`
- `badgePulse` (lines 144-147) uses `rgba(238, 0, 0, …)` — flag for fix

- [ ] **Step 2: Replace the config with the extended version**

Apply this Edit to `tailwind.config.ts`. Replace the entire `extend` block PLUS the `safelist` so the file becomes:

```ts
import type { Config } from "tailwindcss";
import { BRAND_THEMES } from "./src/config/brand-theme";

const config: Config = {
  darkMode: "class",
  safelist: [
    { pattern: /^(text|bg|border|shadow|ring)-premium-gold(\/[\d]+)?$/ },
    // Dynamic class builders in prize-brand-colors.ts / brand-theme.ts /
    // packageColorScheme.ts construct `[#hex]` arbitraries at runtime.
    // Tailwind's JIT can't see them — safelist them so they're never purged.
    {
      pattern: /^(text|bg|border|from|to|via|shadow|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\](\/\d+)?$/,
      variants: ["hover", "focus", "focus-within", "group-hover", "dark"],
    },
  ],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/utils/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      screens: {
        // Custom breakpoint at 540px to match the modal `@media (max-width: 540px)`
        // queries we're porting off styled-jsx. Used as `max-xs:`/`xs:` variants.
        // Tailwind defaults sm=640px, so xs sits below that.
        xs: "540px",
      },
      colors: {
        primary: {
          50: "#fef2f2",
          100: "#fee2e2",
          200: "#fecaca",
          300: "#fca5a5",
          400: "#f87171",
          500: "#ef4444",
          600: "#dc2626",
          700: "#b91c1c",
          800: "#991b1b",
          900: "#7f1d1d",
        },
        // Brand red palette — extends Tailwind's defaults to cover the 13 distinct
        // brand-red shades found in the audit. red-600 stays as #ee0000 (existing
        // override). Codemod sweep-brand-red maps each [#hex] literal to a token here.
        red: {
          50: "#fef2f2",
          100: "#fee2e2",
          200: "#fecaca",
          300: "#fca5a5",
          400: "#ff4444",  // gradient companion (76 sites)
          500: "#ec0000",  // slightly darker (4 sites)
          600: "#ee0000",  // brand primary (existing override; 409 sites)
          650: "#e60000",  // reset-password gradient (30 sites)
          700: "#cc0000",  // hover/darker pair (68 sites)
          800: "#b91c1c",  // dark hover (27 sites)
          900: "#991b1b",  // very dark (14 sites)
          950: "#7f1d1d",  // deepest (1 site, completes the scale)
        },
        gray: {
          50: "#f9fafb",
          100: "#f3f4f6",
          200: "#e5e7eb",
          300: "#d1d5db",
          400: "#9ca3af",
          500: "#6b7280",
          600: "#4b5563",
          700: "#374151",
          800: "#1f2937",
          900: "#111827",
        },
        makita: {
          400: "#065255",
          500: "#008C95",
          600: "#00B8C2",
          700: "#065255",
          light: "#00B8C2",
          dark: "#065255",
        },
        "premium-gold": "#D4AF37",
        // Membership tier semantic colors — used by Cancellation/Renewal/Downgrade
        // modals and MembershipSection for tradie/foreman/boss theming via cva().
        "brand-tier": {
          tradie: "#00c2ed",   // makita teal
          foreman: "#ffd200",  // dewalt yellow
          boss: "#ee0000",     // boss red (= red-600)
        },
        brand: {
          dewalt: {
            primary: BRAND_THEMES.dewalt.light.primary,
            secondary: BRAND_THEMES.dewalt.light.secondary,
            accent: BRAND_THEMES.dewalt.light.accent,
          },
          makita: {
            primary: BRAND_THEMES.makita.light.primary,
            secondary: BRAND_THEMES.makita.light.secondary,
            accent: BRAND_THEMES.makita.light.accent,
          },
          milwaukee: {
            primary: BRAND_THEMES.milwaukee.light.primary,
            secondary: BRAND_THEMES.milwaukee.light.secondary,
            accent: BRAND_THEMES.milwaukee.light.accent,
          },
          ryobi: {
            primary: BRAND_THEMES.ryobi.light.primary,
            secondary: BRAND_THEMES.ryobi.light.secondary,
            accent: BRAND_THEMES.ryobi.light.accent,
          },
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "sans-serif"],
        poppins: ["var(--font-poppins)", "Poppins", "sans-serif"],
        agency: ["AgencyFB BlackWide", "sans-serif"],
        acumin: ["Acumin Pro Condensed", "sans-serif"],
      },
      fontWeight: {
        bold: "800",
        extrabold: "900",
        black: "900",
      },
      fontSize: {
        // Micro-text scale — sub-12px sizes used in dense UI (admin tables, modal
        // microcopy, badge labels). Eliminates 589 arbitrary `text-[Npx]` literals.
        // text-[9px] rounds to text-3xs (8px); text-[11px] rounds to text-2xs (10px).
        // Documented in docs/shared-ui/tailwind-conventions.md.
        "3xs": ["8px", { lineHeight: "1.2" }],
        "2xs": ["10px", { lineHeight: "1.3" }],
        "agency-title": ["2.8125rem", { lineHeight: "0.79" }],
        "6xl": ["3.75rem", { lineHeight: "1" }],
        "7xl": ["4.5rem", { lineHeight: "1" }],
        "8xl": ["6rem", { lineHeight: "1" }],
        "9xl": ["8rem", { lineHeight: "1" }],
      },
      spacing: {
        "18": "4.5rem",
        "88": "22rem",
        "128": "32rem",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      boxShadow: {
        xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        "2xl": "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-in-out",
        "slide-up": "slideUp 0.5s ease-out",
        "bounce-slow": "bounce 2s infinite",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        "glow-pulse-yellow": "glow-pulse-yellow 2s ease-in-out infinite",
        "glow-pulse-purple": "glow-pulse-purple 2s ease-in-out infinite",
        "glow-pulse-gold": "glow-pulse-gold 2s ease-in-out infinite",
        "glow-pulse-orange": "glow-pulse-orange 2s ease-in-out infinite",
        "border-glow-yellow": "border-glow-yellow 2s ease-in-out infinite",
        "border-glow-blue": "border-glow-blue 2s ease-in-out infinite",
        "border-glow-purple": "border-glow-purple 2s ease-in-out infinite",
        "border-glow-gold": "border-glow-gold 2s ease-in-out infinite",
        "border-glow-orange": "border-glow-orange 2s ease-in-out infinite",
        "badge-pulse": "badgePulse 1.5s ease-in-out infinite",
        // Migrated from inline <style> blocks per Phase 0 of the cleanup spec:
        "spin-reverse": "spin-reverse 1s linear infinite",
        "sparkle": "sparkle 2.5s ease-in-out infinite",
        "member-benefit-float": "memberBenefitFloat 6s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        lineExpand: {
          "0%": { opacity: "0", transform: "scaleX(0.3)" },
          "60%": { opacity: "1", transform: "scaleX(1)" },
          "100%": { opacity: "1", transform: "scaleX(1)" },
        },
        fadeSlideUp: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        badgePulse: {
          // Was rgba(238,0,0,…) — that's the same color as red-600 (#ee0000).
          // Hand-converted at Phase 0 because the codemod can't match rgb form.
          "0%, 100%": { transform: "scale(1)", boxShadow: "0 0 12px rgb(238 0 0 / 0.5)" },
          "50%": { transform: "scale(1.05)", boxShadow: "0 0 20px rgb(238 0 0 / 0.8)" },
        },
        // Migrated from src/components/ui/PaymentLoadingSpinner.tsx
        "spin-reverse": {
          from: { transform: "rotate(360deg)" },
          to: { transform: "rotate(0deg)" },
        },
        // Migrated from src/components/loading/SuccessScreen.tsx
        // Note: original used `var(--drift)` set inline by JSX. The migrated version
        // keeps that pattern — the keyframe references the var, JSX still sets it.
        sparkle: {
          "0%, 100%": { opacity: "0", transform: "translate(0,0) scale(0.6)" },
          "50%": { opacity: "1", transform: "translate(var(--drift, 0), -8px) scale(1)" },
        },
        // Migrated from src/components/sections/promo/PartnerBenefitsPromoSection.tsx
        memberBenefitFloat: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 3: Type-check passes**

Run: `npm run type-check`
Expected: clean exit. (`Config` type from `tailwindcss` accepts the extended fields.)

- [ ] **Step 4: Build passes**

Run: `npm run build`
Expected: success. Tailwind regenerates the utility classes including `text-2xs`, `text-3xs`, `bg-red-650`, `bg-brand-tier-boss`, `xs:`/`max-xs:` variants. Build time may increase by 1-3s due to the larger `safelist`.

- [ ] **Step 5: Verify the new tokens are emitted**

Run: `grep -E "\.text-(2|3)xs|\.bg-red-650|\.bg-brand-tier-tradie|max-xs|\.animate-spin-reverse" .next/static/css/*.css | head -10`

Expected: each pattern matches at least once in the generated CSS. If any are missing, the config is wrong — fix before continuing.

- [ ] **Step 6: Commit (requires user authorization)**

```bash
git add tailwind.config.ts
git commit -m "$(cat <<'EOF'
feat(tailwind): extend tokens — red palette, brand-tier, micro-text, xs breakpoint

Per Phase 0 of UI cleanup spec. Extends the existing red.* palette to cover
all 13 distinct brand-red shades from the audit (no parallel brand-red.*
namespace). Adds brand-tier.{tradie,foreman,boss} for membership theming.
Adds text-2xs (10px) and text-3xs (8px) to eliminate 589 arbitrary text-[Npx]
literals. Adds xs:540px breakpoint for modal mobile rules. Migrates 3 inline
@keyframes (spin-reverse, sparkle, memberBenefitFloat) into config. Expands
safelist to cover dynamic [#hex] class builders in prize-brand-colors.ts,
brand-theme.ts, and packageColorScheme.ts.

Hand-fixed badgePulse rgba(238,0,0,…) to use rgb()/hex equivalent (same color,
codemod-invisible form).

No visual change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add CSS variables and fix `@apply` in `globals.css`

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Read the current file**

Read `src/app/globals.css`. Note the current `:root` block (line 6-12) and the line ~608 `@apply ... focus:border-[#ee0000] ...` inside `.form-input`.

- [ ] **Step 2: Add header-height vars to `:root`**

Edit `src/app/globals.css`. Replace the `:root { ... }` block with:

```css
  :root {
    --bg-page: #f9fafb;
    --bg-surface: #ffffff;
    --text-primary: #111827;
    --text-muted: #6b7280;
    --border-default: #e5e7eb;
    /* Layout offsets — eliminates ~34 arbitrary pt-[86px]/pt-[106px] literals.
       Used as `pt-[var(--app-header-h)]` / `lg:pt-[var(--app-header-h-lg)]`. */
    --app-header-h: 86px;
    --app-header-h-lg: 106px;
  }
```

- [ ] **Step 3: Fix the `@apply` line**

Find the `.form-input` rule (around line 608). Replace `focus:border-[#ee0000]` with `focus:border-red-600`. **Do not** change anything else in that rule. The result should look like:

```css
  .form-input {
    @apply ... focus:border-red-600 ...;
  }
```

(Preserve every other utility in the `@apply` exactly — only the one classname changes.)

- [ ] **Step 4: Build passes**

Run: `npm run build`
Expected: success. The `@apply` resolves to the `red-600` token (`#ee0000`) — same color as before.

- [ ] **Step 5: Visual spot-check**

Run: `npm run dev` (in background or separate terminal).
Open `http://localhost:3000/login` (any page with form inputs). Click into the email field — confirm the focus border is red `#ee0000`. If grey or different red, the `@apply` swap broke it.

Stop the dev server.

- [ ] **Step 6: Commit (requires user authorization)**

```bash
git add src/app/globals.css
git commit -m "$(cat <<'EOF'
refactor(css): add --app-header-h vars; convert @apply hex to red-600 token

Adds two CSS variables for the page-header height (mobile/desktop) so the
~34 pt-[86px]/pt-[106px] arbitrary literals can be replaced by the
sweep-header-offsets codemod with pt-[var(--app-header-h)] etc.

Replaces `@apply focus:border-[#ee0000]` in .form-input with the
red-600 token — same color, codemod-safe.

No visual change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Move 3 inline `@keyframes` to use the config

**Files:**
- Modify: `src/components/ui/PaymentLoadingSpinner.tsx`
- Modify: `src/components/loading/SuccessScreen.tsx`
- Modify: `src/components/sections/promo/PartnerBenefitsPromoSection.tsx`

The keyframes themselves moved into `tailwind.config.ts` in Task 3. Now we remove the inline `<style>` blocks and switch consumers to the new `animate-*` utilities.

- [ ] **Step 1: Read `PaymentLoadingSpinner.tsx`**

Read `src/components/ui/PaymentLoadingSpinner.tsx`. Find the inline `<style>` block (~line 84) declaring `@keyframes spin-reverse`. Find where the keyframe is consumed (look for `animation: spin-reverse` in a `style={{}}` prop or className).

- [ ] **Step 2: Remove the inline style and use `animate-spin-reverse`**

Edit the file:
- Delete the entire `<style>` block containing `@keyframes spin-reverse`
- If there's an inline `style={{ animation: "spin-reverse 1s linear infinite" }}`, replace with `className={cn(existingClasses, "animate-spin-reverse")}` — adding the `cn` import: `import { cn } from "@/utils/cn";`
- If the animation was applied via inline CSS `animation` property elsewhere, switch to the `animate-spin-reverse` utility

- [ ] **Step 3: Build passes**

Run: `npm run build`
Expected: success. The `animate-spin-reverse` utility now resolves via the config.

- [ ] **Step 4: Visual spot-check**

Run: `npm run dev`. Open any page that mounts `<PaymentLoadingSpinner>` (e.g. trigger a checkout flow) — confirm the spinner still spins reverse. If no rotation or wrong direction, the swap is broken.

Stop dev server.

- [ ] **Step 5: Repeat for `SuccessScreen.tsx`**

Read `src/components/loading/SuccessScreen.tsx`. Find the inline `<style jsx>` block (~line 279) with `@keyframes sparkle`. Note: the original keyframe references `var(--drift)` set inline by the JSX — the new keyframe in the config preserves this pattern.

Edit:
- Delete the inline `<style jsx>` block
- Wherever the JSX applies the sparkle animation (look for a `style={{ animation: "sparkle ..." }}` or className `sparkle`), replace with `className="animate-sparkle"` (keep the inline `style={{ "--drift": ... }}` that sets the CSS var)

Run `npm run build` — expect success.

Run `npm run dev`, trigger a success screen (e.g. complete a test purchase or use the modal gallery) — confirm sparkles still drift in randomized directions.

Stop dev server.

- [ ] **Step 6: Repeat for `PartnerBenefitsPromoSection.tsx`**

Read `src/components/sections/promo/PartnerBenefitsPromoSection.tsx`. Find the inline `<style jsx>` block (~line 303) with `@keyframes memberBenefitFloat`.

Edit:
- Delete the inline `<style jsx>` block
- Wherever the float animation is applied, replace with `className="animate-member-benefit-float"`

Run `npm run build` — expect success.

Run `npm run dev`, navigate to a promo page that renders this section — confirm benefit cards still float.

Stop dev server.

- [ ] **Step 7: Commit (requires user authorization)**

```bash
git add src/components/ui/PaymentLoadingSpinner.tsx src/components/loading/SuccessScreen.tsx src/components/sections/promo/PartnerBenefitsPromoSection.tsx
git commit -m "$(cat <<'EOF'
refactor(animations): use config keyframes, remove inline <style> blocks

The 3 inline @keyframes (spin-reverse, sparkle, memberBenefitFloat) moved
into tailwind.config.ts in the previous commit. Components now consume them
via animate-spin-reverse / animate-sparkle / animate-member-benefit-float
utilities. Behavior preserved (sparkle still reads --drift CSS var set
inline by JSX).

No visual change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Write the Tailwind conventions doc

**Files:**
- Create: `docs/shared-ui/tailwind-conventions.md`

- [ ] **Step 1: Check if `docs/shared-ui/` exists**

Run: `ls docs/shared-ui/ 2>&1 | head`
Expected: directory exists with existing docs (per the manifest, `shared-ui` domain is already registered).

- [ ] **Step 2: Write the conventions doc**

Create `docs/shared-ui/tailwind-conventions.md`:

```markdown
# Tailwind Conventions

This doc captures the rules that the UI/Tailwind cleanup work locked in. Future code follows these.

## 1. No arbitrary values for things that have tokens

| Don't | Do | Why |
|---|---|---|
| `text-[#ee0000]` | `text-red-600` | Brand red is a token. 13 distinct red shades are mapped in `tailwind.config.ts` `colors.red.*` (50–950). |
| `text-[10px]` | `text-2xs` | Micro-text scale: `text-3xs` (8px), `text-2xs` (10px). Default `text-xs` (12px) and up are unchanged. |
| `text-[9px]` | `text-3xs` | We round 9→8 and 11→10 — 1px in dense UI rarely matters; rounding is documented and intentional. |
| `pt-[86px]` | `pt-[var(--app-header-h)]` (mobile) | Header offset is a CSS var declared in `globals.css` `:root`. |
| `pt-[106px]` | `pt-[var(--app-header-h-lg)]` (desktop) | Same — desktop variant. |

Arbitrary values are appropriate when the value is genuinely one-off (a unique shadow, a one-off `top-[7px]`). They're a smell when repeated 5+ times — that's a missing token.

## 2. Class composition uses `cn()`, not template literals

```tsx
// ❌ Don't
<div className={`base ${active ? "bg-red-600" : "bg-gray-100"} ${className}`} />

// ✅ Do
import { cn } from "@/utils/cn";

<div className={cn(
  "base",
  active ? "bg-red-600" : "bg-gray-100",
  className,
)} />
```

`cn` (= `clsx + tailwind-merge`) flattens conditional inputs and resolves utility conflicts so the LAST class always wins (e.g. `cn("p-2", "p-4")` → `"p-4"`, not both).

This matters because:
- Predictable override behavior — child components can override parent classes by passing a `className` prop
- No silent CSS-cascade surprises when consumers compose
- No string-template bugs (missing space, wrong interpolation)

## 3. Variants use `class-variance-authority` (CVA), not nested ternaries

For components with 2+ visual variants (button kinds, badge tones, tier theming):

```tsx
import { cva } from "class-variance-authority";

const button = cva(
  "rounded-md px-4 py-2 font-bold transition-colors", // base
  {
    variants: {
      tone: {
        primary: "bg-red-600 text-white hover:bg-red-700",
        ghost:   "bg-transparent text-red-600 hover:bg-red-50",
      },
      size: {
        sm: "text-sm",
        md: "text-base",
        lg: "text-lg",
      },
    },
    defaultVariants: { tone: "primary", size: "md" },
  }
);

<button className={button({ tone: "ghost", size: "lg" })} />
```

Variants are typed (`Tone = "primary" | "ghost"`); typos fail at compile time; the className soup never escapes the `cva()` definition.

## 4. Modals use the existing `<ModalContainer>`

`src/components/modals/ui/ModalContainer.tsx` provides portal, scroll-lock, back-button, z-tier props, and sheet/dialog presentations. Don't ship a new bespoke `<div className="fixed inset-0 z-[80]…">` shell.

If you need a custom z-index, use the `zIndex` prop (added when the cancellation modal pilot adopted ModalContainer). For modal stacking, use `nested`/`nestedSecondary` from the `Z_INDEX` scale.

## 5. No `<style jsx>` or inline `<style>` for new code

If a styling need genuinely doesn't fit Tailwind (composite multi-stop gradients, `::-webkit-scrollbar` rules, container queries), use a co-located CSS module (`Component.module.css`) — never `<style jsx>`. Modules are scoped, type-checked, and don't generate inline `<style>` tags at runtime.

## 6. No `!important` overrides

`tailwind-merge` resolves utility conflicts; you should never need `!`. If you find yourself reaching for `!important`, you've hit a class-ordering bug or a missing variant — fix the root cause.

The Phase 5 cleanup audited and removed every `!` override; new ones won't pass review.

## 7. Class names from JIT-invisible builders are safelisted

`prize-brand-colors.ts`, `brand-theme.ts`, and `packageColorScheme.ts` build `[#hex]` arbitraries at runtime via template literals. Tailwind's JIT can't see them. The `tailwind.config.ts` `safelist` covers them with a regex pattern.

If you add a new file that builds dynamic className strings: either prefer static classes (the JIT sees them and they tree-shake), or extend the safelist pattern.

## 8. Codemod-safe patterns

All className arbitraries should be regex-replaceable by `scripts/codemods/sweep-*`. That means:

- Static `className="..."` strings — codemod-safe ✅
- Static `className={"..."}`  — codemod-safe ✅
- Conditional via `cn()`: `className={cn("text-[#ee0000]", ...)}` — codemod-safe ✅
- Template literals with hex inside: `` className={`text-[${myColor}]`} `` — codemod-INVISIBLE ❌

Avoid the last form. Prefer either a static class or a CVA variant.
```

- [ ] **Step 3: Verify the doc lives in a manifest-registered path**

Read `CLAUDE.md` Domain Manifest (the JSON block at the bottom). Confirm `shared-ui` domain `docs` field is `"docs/shared-ui/"`. The new file is at `docs/shared-ui/tailwind-conventions.md` — covered.

- [ ] **Step 4: Commit (requires user authorization)**

```bash
git add docs/shared-ui/tailwind-conventions.md
git commit -m "$(cat <<'EOF'
docs(shared-ui): add tailwind-conventions.md

Captures the rules locked in by the UI cleanup work: no arbitrary values
where tokens exist, cn() over template literals, CVA for variants, no
<style jsx>, no !important, ModalContainer for modal shells.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 0 verification gate

- [ ] **Step 1: Full lint + type-check + build**

Run: `npm run lint && npm run type-check && npm run build`
Expected: all three clean. Total time ~1-2 min.

- [ ] **Step 2: Visual spot-check on top 5 pages**

Start `npm run dev`. Open these in a browser, scroll each top-to-bottom, look for any visual difference vs the main branch:

1. `/` (homepage)
2. `/login`
3. `/major-draw`
4. `/shop`
5. `/dev/modals` (modal gallery — no modal opens; just verify the index renders)

Expected: no perceptible visual change anywhere. If anything looks off, diagnose (likely the `@apply` swap, the `red-600` hex, or a keyframe consumer) before proceeding.

Stop dev server.

- [ ] **Step 3: Confirm Phase 0 complete**

Phase 0 (Foundation) is done. The codebase now has:
- `cn()` helper available
- Extended `red.*` palette (50-950 covering all 13 brand-red shades)
- `brand-tier.{tradie,foreman,boss}` semantic colors
- `text-3xs` (8px), `text-2xs` (10px) micro-text scale
- `xs: '540px'` breakpoint
- 3 keyframes migrated from inline `<style>` to config
- `--app-header-h` / `--app-header-h-lg` CSS vars
- Safelist covering dynamic class builders
- `tailwind-conventions.md` documenting the rules

Zero visual change. Ready for Phase 1 codemod sweeps.

---

## Task 7: Write the codemod shared utilities

**Files:**
- Create: `scripts/codemods/lib/walk-tsx.ts`
- Create: `scripts/codemods/lib/replace-classname.ts`
- Create: `scripts/codemods/lib/codemod-runner.ts`

These are the building blocks the 3 sweep scripts (Tasks 9, 11, 13) compose.

- [ ] **Step 1: Write `walk-tsx.ts` — the file walker**

Create `scripts/codemods/lib/walk-tsx.ts`:

```ts
import { promises as fs } from "node:fs";
import * as path from "node:path";

/**
 * Recursively walk a directory and yield every file matching one of `extensions`.
 * Skips `node_modules`, `.next`, `.git`, `dist`, `build`, hidden dirs, and any
 * path matching `excludeGlobs` (substring match — keep them simple).
 */
export async function* walk(
  root: string,
  extensions: readonly string[],
  excludeGlobs: readonly string[] = []
): AsyncGenerator<string> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    // Skip directories we never want to walk into
    if (entry.isDirectory()) {
      if (
        entry.name.startsWith(".") ||
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === "build"
      ) {
        continue;
      }
      yield* walk(fullPath, extensions, excludeGlobs);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!extensions.includes(ext)) continue;
    // Substring-match exclude (cross-platform: normalize separators)
    const normalized = fullPath.replace(/\\/g, "/");
    if (excludeGlobs.some((g) => normalized.includes(g))) continue;
    yield fullPath;
  }
}
```

- [ ] **Step 2: Write `replace-classname.ts` — the regex helpers**

Create `scripts/codemods/lib/replace-classname.ts`:

```ts
/**
 * Map a hex color literal (lowercase, with `#`) to a Tailwind token name.
 * Returns null if the hex is not in the snap map — caller decides what to do.
 */
export type HexSnapMap = Readonly<Record<string, string>>;

/**
 * Replace all matches of `[#hex]` arbitrary values in className strings.
 *
 * Matches:
 *   - bg-[#ee0000], text-[#cc0000], border-[#FF4444], from-[#ee0000]
 *   - With prefixes: hover:bg-[#ee0000], dark:text-[#ee0000], group-hover:from-[#cc0000]
 *   - With opacity modifiers: bg-[#ee0000]/50, text-[#ee0000]/80
 *   - Any leading variant chain: focus-within:dark:hover:bg-[#ee0000]/30
 *
 * Does NOT match:
 *   - Hex inside CSS gradient strings: `bg-[linear-gradient(180deg,#ee0000,#cc0000)]`
 *     (these are arbitrary CSS, not arbitrary color tokens; safelist covers them)
 *   - Hex inside template literals: `` `bg-[${color}]` `` (regex doesn't see them either way)
 *   - Hex in `style={{}}` JSX inline styles
 *
 * Returns the rewritten content and a list of replacements made.
 */
export interface Replacement {
  before: string;
  after: string;
  line: number;
}

export function rewriteHexArbitraries(
  content: string,
  snapMap: HexSnapMap,
  unmappedHexes: Set<string>
): { content: string; replacements: Replacement[] } {
  const replacements: Replacement[] = [];

  // Match: optional variant prefix chain (`a-b:`), utility name, `[#hex]`, optional `/opacity`
  // Utility name char class: lowercase + digits + hyphen (e.g. "bg", "text", "from", "to", "via",
  // "border", "ring", "shadow", "fill", "stroke", "outline", "decoration", "accent", "caret",
  // "divide", "placeholder", "selection")
  const re = /((?:[a-z][\w-]*:)*)([a-z][a-z0-9-]*)-\[(#[0-9a-fA-F]{3,8})\](\/[\d.]+)?/g;

  const newContent = content.replace(re, (match, prefixes: string, util: string, hex: string, opacity: string | undefined) => {
    const lowerHex = hex.toLowerCase();
    const token = snapMap[lowerHex];
    if (!token) {
      unmappedHexes.add(lowerHex);
      return match; // leave untouched
    }
    // The util prefix stays the same: bg-[#ee0000] → bg-red-600, from-[#ee0000] → from-red-600
    const out = `${prefixes}${util}-${token}${opacity ?? ""}`;
    // Track the replacement (line lookup happens below)
    replacements.push({ before: match, after: out, line: 0 });
    return out;
  });

  // Backfill line numbers — cheap to do once
  if (replacements.length > 0) {
    const lines = content.split("\n");
    let cursor = 0;
    for (const r of replacements) {
      cursor = content.indexOf(r.before, cursor);
      if (cursor === -1) continue;
      let lineNum = 1;
      let charCount = 0;
      for (const ln of lines) {
        if (charCount + ln.length + 1 > cursor) break;
        charCount += ln.length + 1;
        lineNum++;
      }
      r.line = lineNum;
      cursor += r.before.length;
    }
  }

  return { content: newContent, replacements };
}

/**
 * Replace all matches of `text-[Npx]` (or any single-utility size literal) in className.
 * Matches: text-[10px], hover:text-[10px], dark:text-[8px]/80
 * Generic enough to be reused for any utility/value pair.
 */
export interface SizeMap {
  utility: string;          // e.g. "text"
  values: Record<string, string>; // e.g. { "10px": "2xs", "8px": "3xs" }
}

export function rewriteArbitrarySizes(
  content: string,
  map: SizeMap,
  unmappedValues: Set<string>
): { content: string; replacements: Replacement[] } {
  const replacements: Replacement[] = [];
  const re = new RegExp(
    `((?:[a-z][\\w-]*:)*)(${map.utility})-\\[([^\\]]+)\\](\\/[\\d.]+)?`,
    "g"
  );
  const newContent = content.replace(re, (match, prefixes: string, util: string, value: string, opacity: string | undefined) => {
    const token = map.values[value];
    if (!token) {
      unmappedValues.add(value);
      return match;
    }
    const out = `${prefixes}${util}-${token}${opacity ?? ""}`;
    replacements.push({ before: match, after: out, line: 0 });
    return out;
  });
  return { content: newContent, replacements };
}

/**
 * Replace exact arbitrary values (no opacity modifier) for layout utilities.
 * Used by sweep-header-offsets: `pt-[86px]` → `pt-[var(--app-header-h)]`.
 */
export function rewriteExactArbitrary(
  content: string,
  utility: string,
  fromValue: string,
  toValue: string
): { content: string; replacements: Replacement[] } {
  const replacements: Replacement[] = [];
  // Escape regex metachars in fromValue
  const escaped = fromValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `((?:[a-z][\\w-]*:)*)(${utility})-\\[${escaped}\\]`,
    "g"
  );
  const newContent = content.replace(re, (match, prefixes: string, util: string) => {
    const out = `${prefixes}${util}-[${toValue}]`;
    replacements.push({ before: match, after: out, line: 0 });
    return out;
  });
  return { content: newContent, replacements };
}
```

- [ ] **Step 3: Write `codemod-runner.ts` — the CLI harness**

Create `scripts/codemods/lib/codemod-runner.ts`:

```ts
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { walk } from "./walk-tsx";

export interface FileChange {
  file: string;
  replacements: Array<{ before: string; after: string; line: number }>;
}

export interface CodemodConfig {
  /** Human name shown in CLI output */
  name: string;
  /** Roots to walk (relative to repo root) */
  roots: readonly string[];
  /** File extensions to consider (e.g. [".tsx", ".ts"]) */
  extensions: readonly string[];
  /** Path substrings to skip (cross-platform — / separators) */
  exclude: readonly string[];
  /** The transform: receives content, returns new content + replacements */
  transform: (content: string, file: string) => { content: string; replacements: FileChange["replacements"] };
}

/**
 * Run a codemod. Reads `--apply` / `--dry-run` from argv (default: dry-run).
 * Writes a summary to stdout.
 */
export async function runCodemod(config: CodemodConfig): Promise<void> {
  const apply = process.argv.includes("--apply");
  const verbose = process.argv.includes("--verbose");
  const repoRoot = process.cwd();

  console.log(`\n=== ${config.name} ===`);
  console.log(`Mode: ${apply ? "APPLY (will modify files)" : "DRY-RUN (no files modified)"}`);
  console.log(`Roots: ${config.roots.join(", ")}`);
  console.log(`Excludes: ${config.exclude.join(", ") || "(none)"}\n`);

  const changes: FileChange[] = [];
  let scanned = 0;

  for (const root of config.roots) {
    const absRoot = path.resolve(repoRoot, root);
    try {
      await fs.access(absRoot);
    } catch {
      console.warn(`  (skip: root not found: ${root})`);
      continue;
    }
    for await (const file of walk(absRoot, config.extensions, config.exclude)) {
      scanned++;
      const content = await fs.readFile(file, "utf8");
      const { content: newContent, replacements } = config.transform(content, file);
      if (replacements.length === 0) continue;
      const rel = path.relative(repoRoot, file);
      changes.push({ file: rel, replacements });
      if (apply) {
        await fs.writeFile(file, newContent, "utf8");
      }
    }
  }

  // Summary
  const totalReplacements = changes.reduce((sum, c) => sum + c.replacements.length, 0);
  console.log(`Scanned: ${scanned} files`);
  console.log(`Files affected: ${changes.length}`);
  console.log(`Total replacements: ${totalReplacements}`);

  if (verbose || !apply) {
    console.log("\n--- Replacements ---");
    for (const c of changes) {
      console.log(`\n${c.file}:`);
      // Group identical before→after pairs to keep output scannable
      const grouped = new Map<string, { line: number[]; count: number }>();
      for (const r of c.replacements) {
        const key = `${r.before}  →  ${r.after}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.line.push(r.line);
          existing.count++;
        } else {
          grouped.set(key, { line: [r.line], count: 1 });
        }
      }
      for (const [key, info] of grouped) {
        console.log(`  L${info.line.slice(0, 3).join(",")}${info.line.length > 3 ? `,…(${info.count} total)` : ""}: ${key}`);
      }
    }
  }

  if (!apply) {
    console.log(`\n(dry-run — re-run with --apply to write changes)`);
  } else {
    console.log(`\nApplied. Run \`npm run lint && npm run type-check && npm run build\` next.`);
  }
}
```

- [ ] **Step 4: Type-check the new files**

Run: `npx tsc --noEmit scripts/codemods/lib/walk-tsx.ts scripts/codemods/lib/replace-classname.ts scripts/codemods/lib/codemod-runner.ts`

Expected: clean. (Or run the full `npm run type-check` — should still pass since these files aren't imported into the app yet.)

- [ ] **Step 5: Commit (requires user authorization)**

```bash
git add scripts/codemods/lib/
git commit -m "$(cat <<'EOF'
feat(codemods): add shared utilities — walk, classname rewriter, CLI runner

Building blocks for the 3 Phase 1 codemod scripts (sweep-brand-red,
sweep-micro-text, sweep-header-offsets). Each codemod composes these:
file walking with excludes, regex-based className replacement that
respects variant prefixes and opacity modifiers, dry-run/apply harness
with grouped diff output.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Write fixture-based tests for the shared utilities

**Files:**
- Create: `scripts/codemods/__tests__/replace-classname.test.ts`

We test the regex helpers BEFORE building the sweeps on top of them. Use repo's standard `tsx` + `node:assert` test pattern.

- [ ] **Step 1: Write the test file**

Create `scripts/codemods/__tests__/replace-classname.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  rewriteHexArbitraries,
  rewriteArbitrarySizes,
  rewriteExactArbitrary,
} from "../lib/replace-classname";

const SNAP_MAP: Record<string, string> = {
  "#ee0000": "red-600",
  "#cc0000": "red-700",
  "#ff4444": "red-400",
  "#ec0000": "red-500",
  "#e60000": "red-650",
  "#b91c1c": "red-800",
  "#991b1b": "red-900",
  "#7f1d1d": "red-950",
  "#fef2f2": "red-50",
  "#fee2e2": "red-100",
  "#fecaca": "red-200",
};

let testsRun = 0;
let testsFailed = 0;

function test(name: string, fn: () => void): void {
  testsRun++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    testsFailed++;
    console.error(`  ✗ ${name}`);
    console.error(err instanceof Error ? err.message : String(err));
  }
}

function suite(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

// ---------------------------------------------------------------- rewriteHexArbitraries

suite("rewriteHexArbitraries — basic", () => {
  test("replaces simple bg-[#ee0000]", () => {
    const unmapped = new Set<string>();
    const { content, replacements } = rewriteHexArbitraries(
      `<div className="bg-[#ee0000]" />`,
      SNAP_MAP,
      unmapped,
    );
    assert.equal(content, `<div className="bg-red-600" />`);
    assert.equal(replacements.length, 1);
    assert.equal(unmapped.size, 0);
  });

  test("replaces text-[#cc0000]", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteHexArbitraries(
      `<span className="text-[#cc0000]">x</span>`,
      SNAP_MAP,
      unmapped,
    );
    assert.equal(content, `<span className="text-red-700">x</span>`);
  });

  test("preserves uppercase hex by snapping case-insensitively", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteHexArbitraries(
      `<div className="bg-[#EE0000]" />`,
      SNAP_MAP,
      unmapped,
    );
    assert.equal(content, `<div className="bg-red-600" />`);
  });
});

suite("rewriteHexArbitraries — with prefixes", () => {
  test("preserves single variant prefix (hover:)", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteHexArbitraries(
      `<button className="hover:bg-[#ee0000]" />`,
      SNAP_MAP,
      unmapped,
    );
    assert.equal(content, `<button className="hover:bg-red-600" />`);
  });

  test("preserves chained variant prefixes (group-hover:dark:)", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteHexArbitraries(
      `<div className="group-hover:dark:from-[#cc0000]" />`,
      SNAP_MAP,
      unmapped,
    );
    assert.equal(content, `<div className="group-hover:dark:from-red-700" />`);
  });

  test("handles focus-within:", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteHexArbitraries(
      `<input className="focus-within:ring-[#ee0000]" />`,
      SNAP_MAP,
      unmapped,
    );
    assert.equal(content, `<input className="focus-within:ring-red-600" />`);
  });
});

suite("rewriteHexArbitraries — with opacity modifier", () => {
  test("preserves /50 opacity", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteHexArbitraries(
      `<div className="bg-[#ee0000]/50" />`,
      SNAP_MAP,
      unmapped,
    );
    assert.equal(content, `<div className="bg-red-600/50" />`);
  });

  test("preserves /80 with prefix", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteHexArbitraries(
      `<div className="hover:bg-[#cc0000]/80" />`,
      SNAP_MAP,
      unmapped,
    );
    assert.equal(content, `<div className="hover:bg-red-700/80" />`);
  });

  test("preserves decimal opacity /12.5", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteHexArbitraries(
      `<div className="ring-[#ee0000]/12.5" />`,
      SNAP_MAP,
      unmapped,
    );
    assert.equal(content, `<div className="ring-red-600/12.5" />`);
  });
});

suite("rewriteHexArbitraries — gradient utilities", () => {
  test("replaces from-[#ee0000]", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteHexArbitraries(
      `<div className="from-[#ee0000]" />`,
      SNAP_MAP,
      unmapped,
    );
    assert.equal(content, `<div className="from-red-600" />`);
  });

  test("replaces via-[#ff4444] and to-[#cc0000] in same string", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteHexArbitraries(
      `<div className="from-[#ee0000] via-[#ff4444] to-[#cc0000]" />`,
      SNAP_MAP,
      unmapped,
    );
    assert.equal(content, `<div className="from-red-600 via-red-400 to-red-700" />`);
  });
});

suite("rewriteHexArbitraries — multiple replacements", () => {
  test("handles multiple matches across one className", () => {
    const unmapped = new Set<string>();
    const { content, replacements } = rewriteHexArbitraries(
      `<div className="bg-[#ee0000] hover:bg-[#cc0000] text-[#fef2f2]" />`,
      SNAP_MAP,
      unmapped,
    );
    assert.equal(content, `<div className="bg-red-600 hover:bg-red-700 text-red-50" />`);
    assert.equal(replacements.length, 3);
  });

  test("tracks unmapped hexes without replacing", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteHexArbitraries(
      `<div className="bg-[#deadbe] text-[#ee0000]" />`,
      SNAP_MAP,
      unmapped,
    );
    assert.equal(content, `<div className="bg-[#deadbe] text-red-600" />`);
    assert.equal(unmapped.size, 1);
    assert.ok(unmapped.has("#deadbe"));
  });
});

suite("rewriteHexArbitraries — edge cases that must NOT match", () => {
  test("ignores hex inside CSS gradient string (different syntax)", () => {
    // bg-[linear-gradient(...)] is valid Tailwind arbitrary CSS but the hex is
    // INSIDE the value, not at the [#hex] position. Our regex looks for `-[#...]`
    // immediately, so it won't match `[linear-gradient(180deg,#ee0000)]`.
    const unmapped = new Set<string>();
    const before = `<div className="bg-[linear-gradient(180deg,#ee0000,#cc0000)]" />`;
    const { content, replacements } = rewriteHexArbitraries(before, SNAP_MAP, unmapped);
    assert.equal(content, before, "gradient string must be untouched");
    assert.equal(replacements.length, 0);
  });

  test("ignores hex inside style={{ ... }}", () => {
    // The regex pattern doesn't match identifiers without a leading lowercase
    // utility-style name + `-[`. `style={{ color: "#ee0000" }}` has no
    // `<utility>-[#hex]` shape.
    const unmapped = new Set<string>();
    const before = `<div style={{ color: "#ee0000" }} />`;
    const { content } = rewriteHexArbitraries(before, SNAP_MAP, unmapped);
    assert.equal(content, before);
  });

  test("ignores template-literal classNames (regex sees the literal `${...}`)", () => {
    const unmapped = new Set<string>();
    const before = "<div className={`bg-[${color}]`} />";
    const { content } = rewriteHexArbitraries(before, SNAP_MAP, unmapped);
    // No #hex inside square brackets — regex doesn't match
    assert.equal(content, before);
  });
});

// ---------------------------------------------------------------- rewriteArbitrarySizes

suite("rewriteArbitrarySizes — text sizes", () => {
  const TEXT_MAP = { utility: "text", values: { "10px": "2xs", "8px": "3xs" } };

  test("replaces text-[10px]", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteArbitrarySizes(
      `<span className="text-[10px]" />`,
      TEXT_MAP,
      unmapped,
    );
    assert.equal(content, `<span className="text-2xs" />`);
  });

  test("replaces text-[8px]", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteArbitrarySizes(
      `<span className="text-[8px]" />`,
      TEXT_MAP,
      unmapped,
    );
    assert.equal(content, `<span className="text-3xs" />`);
  });

  test("preserves prefix on text-[10px]", () => {
    const unmapped = new Set<string>();
    const { content } = rewriteArbitrarySizes(
      `<span className="hover:text-[10px]" />`,
      TEXT_MAP,
      unmapped,
    );
    assert.equal(content, `<span className="hover:text-2xs" />`);
  });

  test("does not match utilities other than `text`", () => {
    const unmapped = new Set<string>();
    const before = `<div className="w-[10px]" />`;
    const { content } = rewriteArbitrarySizes(before, TEXT_MAP, unmapped);
    assert.equal(content, before);
  });

  test("tracks unmapped sizes without replacing", () => {
    const unmapped = new Set<string>();
    const before = `<span className="text-[13px]" />`;
    const { content } = rewriteArbitrarySizes(before, TEXT_MAP, unmapped);
    assert.equal(content, before);
    assert.ok(unmapped.has("13px"));
  });
});

// ---------------------------------------------------------------- rewriteExactArbitrary

suite("rewriteExactArbitrary — header offsets", () => {
  test("replaces pt-[86px] with pt-[var(--app-header-h)]", () => {
    const { content, replacements } = rewriteExactArbitrary(
      `<main className="pt-[86px]" />`,
      "pt",
      "86px",
      "var(--app-header-h)",
    );
    assert.equal(content, `<main className="pt-[var(--app-header-h)]" />`);
    assert.equal(replacements.length, 1);
  });

  test("replaces pt-[106px] with pt-[var(--app-header-h-lg)]", () => {
    const { content } = rewriteExactArbitrary(
      `<main className="lg:pt-[106px]" />`,
      "pt",
      "106px",
      "var(--app-header-h-lg)",
    );
    assert.equal(content, `<main className="lg:pt-[var(--app-header-h-lg)]" />`);
  });

  test("does not match similar-but-different values", () => {
    const before = `<main className="pt-[88px]" />`;
    const { content } = rewriteExactArbitrary(before, "pt", "86px", "var(--app-header-h)");
    assert.equal(content, before);
  });
});

// ---------------------------------------------------------------- run

console.log("\n========================================");
console.log(`Tests run: ${testsRun}, failed: ${testsFailed}`);
console.log("========================================");
process.exit(testsFailed > 0 ? 1 : 0);
```

- [ ] **Step 2: Add a test runner script to `package.json`**

Edit `package.json`. Find the existing `"scripts"` block. Add this entry alongside the other `test:*` entries:

```json
"test:codemods": "tsx scripts/codemods/__tests__/replace-classname.test.ts",
```

- [ ] **Step 3: Run the tests — should pass**

Run: `npm run test:codemods`

Expected: All test groups pass, exit code 0. Output shows `Tests run: 24, failed: 0`.

If anything fails: the regex in `replace-classname.ts` is broken — fix it before continuing. The tests are the contract.

- [ ] **Step 4: Commit (requires user authorization)**

```bash
git add scripts/codemods/__tests__/replace-classname.test.ts package.json
git commit -m "$(cat <<'EOF'
test(codemods): add fixture tests for className regex helpers

24 cases covering: simple replacements, variant prefix chains, opacity
modifiers, gradient utilities, multiple-per-string, unmapped tracking,
and the must-NOT-match cases (hex inside CSS gradients, style={{}},
template literals).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Write the `sweep-brand-red` codemod (Phase 1a)

**Files:**
- Create: `scripts/codemods/sweep-brand-red.ts`

- [ ] **Step 1: Write the codemod**

Create `scripts/codemods/sweep-brand-red.ts`:

```ts
import { runCodemod } from "./lib/codemod-runner";
import { rewriteHexArbitraries } from "./lib/replace-classname";

/**
 * Snap map: every brand-red hex literal currently in the codebase → its token.
 * Hexes NOT in this map are intentionally left untouched (e.g. #dc2626 and #ef4444
 * are Tailwind-default reds — the audit identified them as needing per-file visual
 * review in Phase 5; they're not safe to auto-convert).
 */
const HEX_TO_TOKEN: Record<string, string> = {
  "#ee0000": "red-600",   // brand primary (existing override)
  "#cc0000": "red-700",   // hover/darker pair
  "#ff4444": "red-400",   // gradient companion
  "#ec0000": "red-500",   // slightly darker
  "#e60000": "red-650",   // reset-password gradient
  "#b91c1c": "red-800",   // dark hover
  "#991b1b": "red-900",   // very dark
  "#7f1d1d": "red-950",   // deepest
  "#fef2f2": "red-50",
  "#fee2e2": "red-100",
  "#fecaca": "red-200",
  // Audit hits NOT mapped (intentional — Phase 5 visual review):
  //   #dc2626 (Tailwind-default red-600 — 48 sites — could be intentional)
  //   #ef4444 (Tailwind-default red-500 — 12 sites)
  //   #f30000 #ce2b05 #dd5358 #9a0c24 #c8102e #e02d42 (brand-theme.ts only — dynamic)
  //   #c20e0e (1 site, in globals.css gradient — not a className)
  //   #b30000 #990000 #7f0000 (LatestWinnersBadge inline style only)
};

async function main() {
  const unmapped = new Set<string>();

  await runCodemod({
    name: "sweep-brand-red — Phase 1a (hex→token)",
    roots: ["src"],
    extensions: [".tsx", ".ts", ".jsx", ".js"],
    exclude: [
      // Email templates — mail clients can't parse Tailwind
      "/components/email-preview/",
      "/lib/email/",
      "/components/invoice/InvoiceEmailTemplate",
      // Test files — fixtures may include literal hexes intentionally
      "/__tests__/",
      "/codemods/",
    ],
    transform: (content) => rewriteHexArbitraries(content, HEX_TO_TOKEN, unmapped),
  });

  if (unmapped.size > 0) {
    console.log("\n--- Unmapped hexes (left untouched) ---");
    for (const hex of [...unmapped].sort()) {
      console.log(`  ${hex}`);
    }
    console.log("\n  (These are NOT in the snap map. Either add them to HEX_TO_TOKEN");
    console.log("  in this script, or leave alone — they need human review.)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm scripts**

Edit `package.json` — add to `"scripts"`:

```json
"sweep:brand-red": "tsx scripts/codemods/sweep-brand-red.ts --apply",
"sweep:brand-red:dry": "tsx scripts/codemods/sweep-brand-red.ts",
```

- [ ] **Step 3: Run the dry-run**

Run: `npm run sweep:brand-red:dry > /tmp/brand-red-plan.txt 2>&1; cat /tmp/brand-red-plan.txt | head -100`

Expected: a long output listing every replacement grouped by file. Summary line should report "Total replacements: ~700" (give or take).

- [ ] **Step 4: Inspect the plan**

Read `/tmp/brand-red-plan.txt` end-to-end. Check:
- No replacement looks wrong (e.g. partial matches, prefix corruption)
- The "Unmapped hexes" section lists only the expected per-file-review hexes (`#dc2626`, `#ef4444`, etc.)
- File counts roughly match the audit (~80 files affected)

If anything looks off: fix `HEX_TO_TOKEN` or `replace-classname.ts`, re-run dry-run, repeat.

- [ ] **Step 5: Apply the codemod**

Run: `npm run sweep:brand-red`

Expected: same output as dry-run but with "APPLIED" footer. Files are now modified on disk.

- [ ] **Step 6: Verify build**

Run: `npm run lint && npm run type-check && npm run build`

Expected: all clean. The Tailwind utility classes resolve identically (`bg-red-600` produces the same CSS rule as `bg-[#ee0000]` did, because the config's `red.600 = '#ee0000'`).

- [ ] **Step 7: Visual spot-check on top 5 pages**

Run `npm run dev`. Compare against main branch (different terminal/window):

1. `/` (homepage) — confirm hero red CTA is identical
2. `/login` — focus border, primary button
3. `/major-draw` — entry CTA, prize cards
4. `/dev/modals` — open the cancellation modal (full red theming throughout)
5. `/admin` (if accessible) — any red badges or counters

Expected: zero perceptible difference. If anything looks off (subtle color shift, wrong shade), check that the snap map matches reality (e.g. is some hex `#dd0000` instead of `#cc0000`?).

Stop dev server.

- [ ] **Step 8: Commit (requires user authorization)**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(ui): codemod sweep — brand-red hex literals → red.* tokens

Phase 1a of UI cleanup. Replaces ~700 [#hex] arbitrary className values
with the named tokens added to tailwind.config.ts in Phase 0:
  #ee0000 → red-600    #cc0000 → red-700
  #ff4444 → red-400    #ec0000 → red-500
  #e60000 → red-650    #b91c1c → red-800
  #991b1b → red-900    #7f1d1d → red-950
  #fef2f2 → red-50     #fee2e2 → red-100
  #fecaca → red-200

Codemod respects variant prefix chains (hover:, dark:, group-hover:),
opacity modifiers (/50, /80), gradient utilities (from/via/to), and
all combinations.

Excluded paths: email templates, __tests__/, codemods/.

Hexes left untouched (Phase 5 per-file visual review):
  #dc2626, #ef4444 — Tailwind-default reds (48+12 sites)
  #f30000, #ce2b05, #dd5358, #9a0c24, #c8102e, #e02d42 — brand-theme dynamic
  #c20e0e — globals.css gradient

No visual change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Add safelist verification

The `tailwind.config.ts` `safelist` (Task 3) covers dynamic class builders. Verify it's actually working — the dynamic classes in `prize-brand-colors.ts` etc. should still render correctly after the build.

**Files:**
- Modify (verification only): no file changes if check passes

- [ ] **Step 1: Identify a dynamic class consumer**

Run: `grep -rE "from-\[\\\$\\{" src/utils/prize-brand-colors.ts src/config/brand-theme.ts | head -5`

Confirm files build template-literal classNames with `[#hex]` at runtime (audit said yes).

- [ ] **Step 2: Find a page that renders prize cards**

Likely candidates: `/major-draw`, `/winners`, `/promotions/*`, `/promotion/*`. Open one in `npm run dev`.

Inspect a prize card in DevTools. Confirm the dynamic gradient classes (`from-[#xxx]`, `to-[#xxx]`) ARE present in the DOM and the colors render. If the safelist regex is wrong, these classes will be stripped by Tailwind's purger and you'll see plain/grey cards.

- [ ] **Step 3: Build the production bundle**

Run: `npm run build`

Open the built CSS file (`.next/static/css/*.css` — find the largest one, that's the main app CSS).

Run: `grep -cE "\.from-\\\[#[0-9a-f]{6}\\\]" .next/static/css/*.css | head -3`

Expected: count > 50. The safelist generated dynamic-color utility classes for the brand-theme palette.

If 0: the safelist regex is malformed; fix in `tailwind.config.ts` and re-build.

- [ ] **Step 4: No commit needed (verification only)**

If everything checks out, proceed.

---

## Task 11: Write the `sweep-micro-text` codemod (Phase 1b)

**Files:**
- Create: `scripts/codemods/sweep-micro-text.ts`

- [ ] **Step 1: Write the codemod**

Create `scripts/codemods/sweep-micro-text.ts`:

```ts
import { runCodemod } from "./lib/codemod-runner";
import { rewriteArbitrarySizes } from "./lib/replace-classname";

/**
 * Micro-text rounding map. text-[9px] and text-[11px] round to the nearest
 * scale step per spec D8 — 1px in dense UI rarely matters and the rounding
 * is documented in docs/shared-ui/tailwind-conventions.md.
 *
 *   8px  → text-3xs (exact)
 *   9px  → text-3xs (rounded down 1px)
 *   10px → text-2xs (exact)
 *   11px → text-2xs (rounded down 1px)
 */
const TEXT_MAP = {
  utility: "text",
  values: {
    "8px": "3xs",
    "9px": "3xs",
    "10px": "2xs",
    "11px": "2xs",
  },
};

async function main() {
  const unmapped = new Set<string>();

  await runCodemod({
    name: "sweep-micro-text — Phase 1b (text-[Npx] → text-2xs/text-3xs)",
    roots: ["src"],
    extensions: [".tsx", ".ts", ".jsx", ".js"],
    exclude: [
      "/components/email-preview/",
      "/lib/email/",
      "/components/invoice/InvoiceEmailTemplate",
      "/__tests__/",
      "/codemods/",
    ],
    transform: (content) => rewriteArbitrarySizes(content, TEXT_MAP, unmapped),
  });

  if (unmapped.size > 0) {
    console.log("\n--- Unmapped sizes (left untouched) ---");
    for (const v of [...unmapped].sort()) {
      console.log(`  text-[${v}]`);
    }
    console.log("\n  (Sizes ≥12px stay as Tailwind defaults — text-xs, text-sm, etc.)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm scripts**

Edit `package.json`:
```json
"sweep:micro-text": "tsx scripts/codemods/sweep-micro-text.ts --apply",
"sweep:micro-text:dry": "tsx scripts/codemods/sweep-micro-text.ts",
```

- [ ] **Step 3: Run the dry-run**

Run: `npm run sweep:micro-text:dry > /tmp/micro-text-plan.txt 2>&1; head -100 /tmp/micro-text-plan.txt`

Expected: ~590 replacements across ~150 files. The "Unmapped sizes" section should list `12px`, `13px`, `14px`, `16px`, `18px`, `20px`, `24px` etc. — those are intentionally untouched (use `text-xs`/`text-sm`/`text-base` instead, but only when each file is touched anyway).

- [ ] **Step 4: Inspect the plan**

Read `/tmp/micro-text-plan.txt`. Check:
- Replacements look right (e.g. `text-[10px]` → `text-2xs`, `text-[8px]` → `text-3xs`)
- Variant prefixes preserved (e.g. `hover:text-[10px]` → `hover:text-2xs`)
- No false positives (e.g. `text-[10px]/80` → `text-2xs/80`)

- [ ] **Step 5: Apply**

Run: `npm run sweep:micro-text`

- [ ] **Step 6: Verify build**

Run: `npm run lint && npm run type-check && npm run build`
Expected: clean.

- [ ] **Step 7: Visual spot-check — focus on dense UI**

The 1px rounding is most visible in dense layouts. Run `npm run dev` and focus on:

1. `/admin/users` (or any admin table) — small label text, badges, tooltips
2. `/dev/modals` — open cancellation modal, the trust bar at bottom uses `text-[10px]` and the +100 BONUS badge uses `text-[8px]`
3. `/major-draw` — entry counters, fine-print labels
4. Any page with stat cards or metric labels

Acceptance test: "no perceptible visual change in dense lists/tables/admin grids." If text looks subtly different in a way that bothers you on a specific element, note the file + suggest an explicit `text-[9px]` arbitrary if you want byte-exact preservation there. (But the spec accepts the rounding.)

Stop dev server.

- [ ] **Step 8: Commit (requires user authorization)**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(ui): codemod sweep — text-[Npx] micro-sizes → text-2xs/text-3xs

Phase 1b of UI cleanup. Replaces ~590 arbitrary text-[Npx] literals
with the micro-text scale added to tailwind.config.ts in Phase 0:
  text-[8px], text-[9px]  → text-3xs (8px)
  text-[10px], text-[11px] → text-2xs (10px)

9px and 11px round down 1px per spec — documented in
docs/shared-ui/tailwind-conventions.md. Default text-xs (12px) and
above are unchanged.

Codemod handles variant prefixes (hover:, dark:) and opacity (/80).

Excluded paths: email templates, __tests__/, codemods/.

No perceptible visual change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Write the `sweep-header-offsets` codemod (Phase 1c)

**Files:**
- Create: `scripts/codemods/sweep-header-offsets.ts`

- [ ] **Step 1: Write the codemod**

Create `scripts/codemods/sweep-header-offsets.ts`:

```ts
import { runCodemod } from "./lib/codemod-runner";
import { rewriteExactArbitrary } from "./lib/replace-classname";

interface RepoChange { before: string; after: string; line: number }

async function main() {
  await runCodemod({
    name: "sweep-header-offsets — Phase 1c (pt-[86px]/pt-[106px] → CSS vars)",
    roots: ["src"],
    extensions: [".tsx", ".ts", ".jsx", ".js"],
    exclude: [
      "/components/email-preview/",
      "/lib/email/",
      "/components/invoice/InvoiceEmailTemplate",
      "/__tests__/",
      "/codemods/",
    ],
    transform: (content) => {
      // Two passes: 86px → mobile, 106px → desktop
      const pass1 = rewriteExactArbitrary(content, "pt", "86px", "var(--app-header-h)");
      const pass2 = rewriteExactArbitrary(pass1.content, "pt", "106px", "var(--app-header-h-lg)");
      const replacements: RepoChange[] = [...pass1.replacements, ...pass2.replacements];
      return { content: pass2.content, replacements };
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm scripts**

Edit `package.json`:
```json
"sweep:header-offsets": "tsx scripts/codemods/sweep-header-offsets.ts --apply",
"sweep:header-offsets:dry": "tsx scripts/codemods/sweep-header-offsets.ts",
```

- [ ] **Step 3: Run the dry-run**

Run: `npm run sweep:header-offsets:dry`

Expected: ~34 replacements across ~14 files (16 instances of `pt-[86px]`, 18 of `pt-[106px]`).

- [ ] **Step 4: Inspect the plan**

Confirm replacements look right. Each `pt-[86px]` becomes `pt-[var(--app-header-h)]`; each `pt-[106px]` becomes `pt-[var(--app-header-h-lg)]`.

Watch for any context where the offset isn't a header offset (e.g. some unrelated component happens to use `pt-[86px]` for spacing). If you see one, add it to the exclude list and re-run. (Audit didn't find any, but verify.)

- [ ] **Step 5: Apply**

Run: `npm run sweep:header-offsets`

- [ ] **Step 6: Verify build**

Run: `npm run lint && npm run type-check && npm run build`
Expected: clean.

- [ ] **Step 7: Visual spot-check — pages with the offset**

Run `npm run dev`. Open the pages that use `pt-[86px]` / `pt-[106px]` (the page-content offset for the fixed header). The `grep` from earlier shows these are typically site-shell layout files.

Open at desktop and mobile widths (resize browser or use DevTools device toolbar). Confirm the page content sits BELOW the fixed header at both sizes — same as before the codemod.

Stop dev server.

- [ ] **Step 8: Commit (requires user authorization)**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(ui): codemod sweep — pt-[86px]/pt-[106px] → CSS vars

Phase 1c of UI cleanup. Replaces ~34 arbitrary header-offset literals
with the CSS variables added to globals.css :root in Phase 0:
  pt-[86px]  → pt-[var(--app-header-h)]    (16 sites, mobile)
  pt-[106px] → pt-[var(--app-header-h-lg)] (18 sites, desktop)

Header heights are now defined in one place (globals.css). To change
them, edit the CSS var — no need to find-and-replace 34 files.

No visual change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Update domain manifest

**Files:**
- Modify: `CLAUDE.md` (the Domain Manifest JSON block)

- [ ] **Step 1: Read the current manifest**

Read the JSON block at the bottom of `CLAUDE.md`.

- [ ] **Step 2: Bump `lastModified` and `lastVerified` for affected domains**

This work touched:
- `infrastructure` — `tailwind.config.ts`, `package.json`, `scripts/codemods/`
- `shared-ui` — added `tailwind-conventions.md`
- `dev-tooling` — `scripts/codemods/__tests__/`
- Globally: many files via codemod (every domain that has Tailwind classes)

Update the JSON in `CLAUDE.md`:
- `"lastModified": "2026-05-08"` (top-level, was `2026-05-05`)
- `infrastructure.lastVerified`: `"2026-05-08"`
- `shared-ui.lastVerified`: `"2026-05-08"`
- `dev-tooling.lastVerified`: `"2026-05-08"`
- `admin.lastVerified`: `"2026-05-08"` (because admin files were touched by codemods)

For all OTHER domains (subscription, billing-stripe, payment, draws, etc.), the codemods touched their files too (className changes only, no logical changes). Bump `lastVerified` to `"2026-05-08"` for: `subscription`, `billing-stripe`, `payment`, `draws`, `rewards-redeemables`, `promo`, `affiliate`, `partner`, `cart-shop-products`, `error-reporting`, `auth`, `tracking`, `ab-testing`, `metrics-analytics`, `theme`, `client-state`, `dashboard-account`.

Don't bump `email` (excluded from codemods), `referrals` (no JSX), `mongodb` (no JSX), `security-csp` (no className changes), `contact` (small surface), `upsell` (config-and-data) unless those files were genuinely affected — check the codemod output.

Don't add or rename any `paths`. The manifest structure is unchanged.

- [ ] **Step 3: Doc-sync hook self-test**

Run: `git status --short`

Confirm `CLAUDE.md` is staged. The doc-sync `Stop` hook will run when this conversation ends; if you have any unstaged changes to `src/` or `scripts/`, it will block. All those should be committed by now (task commits) — `git status` should show only the `CLAUDE.md` edit (or nothing if you already committed).

- [ ] **Step 4: Commit (requires user authorization)**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(manifest): bump lastVerified across domains touched by Phase 0+1 cleanup

Phase 0 + Phase 1 of UI cleanup affected (via codemods or direct edits):
infrastructure, shared-ui, dev-tooling, admin, plus every domain whose
TSX files contained brand-red literals or text-[Npx] arbitraries
(subscription, billing-stripe, payment, draws, etc.).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 1 verification gate

- [ ] **Step 1: Full lint + type-check + build**

Run: `npm run lint && npm run type-check && npm run build`
Expected: all clean.

- [ ] **Step 2: Run the codemod tests one more time**

Run: `npm run test:codemods`
Expected: 24/24 passing.

- [ ] **Step 3: Confirm no leftover hex/text-size arbitraries (sanity)**

Run: `grep -rE "(text|bg|border|ring|from|to|via|fill|stroke|shadow)-\[#(ee|cc|ff4|ec|e6|b9|99|7f|fe[fe])" src/components src/app 2>/dev/null | grep -v "/__tests__/" | grep -v "/codemods/" | head -10`

Expected: empty (or only the deliberately-excluded sites: `#dc2626`, `#ef4444`, brand-theme dynamic builders).

Run: `grep -rE "text-\[(8|9|10|11)px\]" src/components src/app 2>/dev/null | grep -v "/__tests__/" | grep -v "/codemods/" | head -10`

Expected: empty.

Run: `grep -rE "pt-\[(86|106)px\]" src/components src/app 2>/dev/null | head -10`

Expected: empty.

- [ ] **Step 4: Comprehensive visual spot-check**

Run `npm run dev`. Walk these in a browser:

| Page | What to verify |
|---|---|
| `/` | Hero, CTAs, all reds |
| `/login` | Form input focus border, primary button |
| `/major-draw` | Prize cards, entry CTAs, counters |
| `/mini-draws` | Draw cards |
| `/shop` | Product cards, filter chips |
| `/winners` | Winner avatars, names, dates |
| `/dev/modals` | Open cancellation modal — full red theming, +100 BONUS badge text size, trust bar, downgrade card tier colors |
| `/admin` (if accessible) | Tables, badges, action buttons |
| `/promotions/*` (any promo page) | Brand-themed sections |

For each: zero perceptible visual change vs main branch.

Stop dev server.

- [ ] **Step 5: Confirm Plan 1 complete**

Phase 0 + Phase 1 done. Codebase state:
- ~700 brand-red hex literals → `red.*` tokens
- ~590 micro-text arbitraries → `text-2xs` / `text-3xs`
- ~34 header-offset arbitraries → CSS variables
- 3 inline `@keyframes` migrated to config
- Foundation for `cn()` + CVA in place
- Conventions documented at `docs/shared-ui/tailwind-conventions.md`
- Codemod scripts versioned at `scripts/codemods/` for re-use
- Domain manifest current

**Total replacements ~1,324. Total visual change: zero.**

Ready for Plan 2: Modal Pilot (CancellationUpsellModal).

---

## Risks and rollback

If anything goes visually wrong after a codemod:

1. **Identify the specific element.** Browser DevTools → inspect → see which class is wrong.
2. **Check the snap map.** Maybe the hex was actually `#ed0000` not `#ee0000` (off-by-one).
3. **Per-codemod rollback.** Each codemod is its own commit. `git revert <sha>` reverts only that sweep without losing the others.
4. **Per-file rollback.** `git checkout HEAD~N -- path/to/file.tsx` to restore one file from before the sweep.
5. **Re-run the codemod after fix.** The codemod is idempotent — running it twice produces the same result.

If `npm run build` fails after a codemod:
1. Read the error. Usually it's a malformed className the regex produced (e.g. `bg-red-600/`/with-trailing-slash).
2. Fix the regex in `replace-classname.ts`, add a test case in `replace-classname.test.ts`, run the codemod's `:dry` to verify the fix, then re-apply.
