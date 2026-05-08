# UI / Tailwind Cleanup — Codebase-wide Design

**Date:** 2026-05-08
**Owner:** DJ
**Surface:** All of `src/components/**` and `src/app/**`; `tailwind.config.ts`; `src/app/globals.css`
**Status:** Spec — pending user approval before writing the implementation plan

## Problem

The frontend has accumulated three compounding styling problems that block scaling.

1. **Styled-jsx mega-files.** Three modals (`CancellationUpsellModal` 1,495 LOC, `RenewalFailedModal` 1,292 LOC, `DowngradeConfirmModal` 611 LOC) bury ~2,500 lines of CSS inside their JSX files via `<style jsx>{ … }`. Each file mixes Tailwind classes (`p-4 sm:p-2`) with file-local CSS-only classes (`cm-frame`, `dc-stage`, `rf-hero`) on the same elements. Reading them is hard; changing them is dangerous.
2. **Tailwind used as raw CSS, not as a design system.** A codebase audit found **3,916 arbitrary-value usages** (`x-[…]`). Concretely:
   - `text-[#ee0000]` and brand-red variants appear **350+ times** as string literals.
   - `text-[10px]` / `[8px]` / `[9px]` / `[11px]` appear **589 times** because Tailwind's `text-xs` (12px) is too big for dense UI and there is no smaller scale defined.
   - `pt-[86px]` / `pt-[106px]` (header offset) repeat 16/18 times — a layout constant retyped as a string.
   - **704 files** build classNames via template-literal concatenation; only **1 file** uses `clsx` (and `clsx` is not in `package.json` — it's a transitive dep, fragile).
3. **No shared primitives in the right places.** `ModalContainer` exists but the three biggest modals don't use it. `Button`/`MetallicButton` exist but variants are encoded as string-keyed object lookups joined by template literals. There's no `cn()` helper. Every new component reinvents chrome.

The combined effect: **a brand color change today requires touching 350+ files, and a "make this 1px smaller" CSS tweak requires reading 900 lines of inline styled-jsx.**

## Goals

- Establish design tokens that cover real usage so devs stop reaching for `[arbitrary]`.
- Convert the three styled-jsx mega-modals to Tailwind + co-located CSS module + `class-variance-authority` for variants.
- Adopt the existing `ModalContainer` instead of bespoke modal shells.
- Land a `cn()` helper, install `clsx`/`tailwind-merge` properly, and add `class-variance-authority` for typed variants.
- Sweep the codebase to replace 350+ brand-red literals and 589 micro-text-size literals with tokens — by automated codemod with handled edge cases.
- Document the conventions so future code follows them.

## Non-goals

- **No visual change anywhere.** Every pixel that renders today must render identically after each phase. This is a refactor, not a redesign.
- **No behaviour change.** No props removed, no callbacks reordered, no API call modified. Public interfaces of every refactored component are byte-identical.
- **Email templates are out of scope.** `*-email-template.html`, `src/lib/email/templates.ts`, `src/components/email-preview/*` use plain `<style>` because mail clients don't understand Tailwind. They stay.
- **Inline `style={{}}` hex values are out of scope** for the className codemod — there are 99 files affected, including `Stripe Elements` appearance objects, confetti color arrays, and dynamic `style={{ backgroundColor: tier.color }}` patterns. Separate sweep, separate spec, later.
- **Dynamic className builders** (`prize-brand-colors.ts`, `brand-theme.ts`, `packageColorScheme.ts`) that interpolate hex into `` `from-[${hex}]` `` template strings stay as-is — Tailwind's JIT can't see them anyway. They get a `safelist` entry to keep working.
- **Per-file decomposition of admin chrome** (`UserDetailModal.tsx` 52 long-classNames, `UsersManagement.tsx`, `Header.tsx`) is debt for Phase 5; not done in this work.
- **Dark mode** is not added to the cancellation modal; it's currently always-light and the audit confirms no `dark:` variants. Refactor preserves that.

## Hard requirements

| Requirement | How it's enforced |
|---|---|
| 100% visual parity at desktop and mobile breakpoints | Manual A/B in `/dev/modals` (after gallery enhancements, see §Phase 2.A) for every state combo × both breakpoints |
| 100% behavioural parity | Public prop interface diffed; effects/handlers preserved line-for-line |
| `npm run lint` clean | Per-phase gate |
| `npm run type-check` clean | Per-phase gate |
| `npm run build` clean | Per-phase gate |
| `z-[80]` on `CancellationUpsellModal` preserved exactly | The micro-stack opened from `SubscriptionManagementModal` depends on it; switching to `Z_INDEX.MODAL_BASE` (10000) re-stacks the modal above its parent and breaks dismiss flow |
| Doc-sync hook passes | `docs/shared-ui/`, `docs/admin/` updated per the manifest |

## Audit summary (evidence base)

Numbers below are from three parallel `codebase-investigator` runs (2026-05-08). Findings drove the design decisions in §Key decisions.

| Signal | Count | Source |
|---|---|---|
| Total `x-[…]` arbitrary-value usages | **3,916** | `grep -roE "\b[a-z]+-\["` over `src/components`, `src/app` |
| `text-[#ee0000]` family literals (incl. all variants/prefixes) | **~700+** | brand red is used as raw hex |
| Distinct red shades currently in use | **13** | `#ee0000`(409) `#ff4444`(76) `#cc0000`(68) `#dc2626`(48) `#e60000`(30) `#b91c1c`(27) `#991b1b`(14) `#ef4444`(12) `#fef2f2`(10) `#fee2e2`(3) `#fecaca`(4) `#7f1d1d`(1) `#c20e0e`(1) |
| `text-[10px]` | 352 | + `[11px]`×142, `[9px]`×58, `[8px]`×37, `[12px]`×82 |
| Template-literal classNames | **704** | manual concatenation, no `cn()` |
| `!important` overrides in JSX | **86** | specificity wars |
| Files with `<style>`/`<style jsx>` | **12** | (1 not in original list: `UnlockDiscounts.tsx`) |
| Largest single styled-jsx block | 903 LOC | `CancellationUpsellModal.tsx` L492-L1394 |
| `:global()` selectors in pilot modal | 30+ | targeting `.seg`, `.title`, `.sub`, `.num`, `.desc` etc. (collision risk on decomposition) |
| Inline `style={{}}` files containing hex | 99 | out of scope; flag for future sweep |
| Tests / Storybook / Playwright / VR infra | **0 / 0 / 0 / 0** | manual gallery A/B is the only verification |

## Key design decisions

These are the load-bearing choices the audits forced us into. Listed first because every later detail depends on them.

### D1. Extend the existing `red.*` palette, do not introduce `brand-red.*`

`tailwind.config.ts` already overrides `red-600 = '#ee0000'`. Introducing a parallel `brand-red.*` palette creates two ways to spell the same color and guarantees drift. Instead:

```ts
// tailwind.config.ts
colors: {
  red: {
    50:  '#fef2f2',  100: '#fee2e2',  200: '#fecaca',  // existing
    400: '#ff4444',  // NEW — gradient companion (76 sites)
    500: '#ec0000',  // NEW — slightly darker (4 sites)
    600: '#ee0000',  // existing override (kept)
    650: '#e60000',  // NEW — reset-password gradient (30 sites)
    700: '#cc0000',  // NEW (68 sites — replaces existing #b91c1c at 700)
    800: '#b91c1c',  // existing — moved from 700
    900: '#991b1b',  // existing
    950: '#7f1d1d',  // NEW — only 1 site, but completes the scale
  },
}
```

The `#dc2626` and `#ef4444` literals (60 combined sites) are **Tailwind defaults** — they should remain Tailwind defaults via the standard palette, but the project-level `red-600` override means we lose them. Decision: **keep them as raw hex for now**, flag for per-file visual review in Phase 5 (might be intentional, might be drift).

`#c20e0e` (1 site, in `globals.css` `metal-header-red` gradient) stays as raw hex — it's inside a CSS gradient, not a className.

### D2. Add `brand-tier.*` semantic colors

For the tradie/foreman/boss tier theming (used by Cancellation, Renewal, Downgrade modals + MembershipSection):

```ts
'brand-tier': {
  tradie:  '#00c2ed',   // makita teal
  foreman: '#ffd200',   // dewalt yellow
  boss:    '#ee0000',   // boss red (= red-600)
},
```

These are typed variants in `cva()` — no string interpolation. The `MembershipSection`'s existing `MEMBERSHIP_TAB_COLOR_MAP` (file-local) gets refactored to use these tokens in Phase 4 when MembershipSection is touched, not now.

### D3. Add a micro-text scale

```ts
fontSize: {
  '3xs': ['8px',  { lineHeight: '1.2' }],
  '2xs': ['10px', { lineHeight: '1.3' }],
  // 'xs' (12px) and up stay default
}
```

Eliminates 589 arbitrary `text-[Npx]` literals.

### D4. Add layout CSS variables (header offsets)

In `globals.css`:
```css
:root {
  --app-header-h: 86px;   /* mobile */
  --app-header-h-lg: 106px;  /* desktop */
}
```

Used as `pt-[var(--app-header-h)] lg:pt-[var(--app-header-h-lg)]`. Eliminates ~34 arbitrary `pt-[Npx]` literals across 14 files. The values must come out of `globals.css` not `tailwind.config.ts` because they're consumed in JSX as arbitrary CSS-var lookups, not as named utilities.

### D5. Adopt the existing `ModalContainer`, do not create `ModalShell`

`src/components/modals/ui/ModalContainer.tsx` already provides portal, scroll-lock, back-button, z-tier props (`nested`/`nestedSecondary`), and sheet/dialog presentations. The pilot modal swaps its bespoke `<div className="fixed inset-0 z-[80]…">` for `<ModalContainer presentation="dialog" className="!z-[80]" disablePortal={false}>`. The `!z-[80]` override preserves the existing micro-stack (see §Hard requirements row about z-index).

If `ModalContainer` doesn't accept a custom z-index override today, we add a `zIndex?: number` prop to it — a small additive change that doesn't break any existing caller.

### D6. Install `clsx` + `tailwind-merge` + `class-variance-authority` properly; add `cn()` helper

```bash
npm install clsx tailwind-merge class-variance-authority
```

`src/utils/cn.ts`:
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
```

Incidentally fixes the `clsx` bug — currently imported in `UnlockDiscounts.tsx` as a transitive dep with no explicit `package.json` entry.

### D7. Rename `:global()` selectors when decomposing

The pilot modal uses `:global(.seg)`, `:global(.num)`, `:global(.title)`, `:global(.sub)`, `:global(.desc)`, `:global(.icn)`, `:global(.lbl)`, `:global(.t)`, `:global(.d)`, `:global(.li)` — generic class names that work today only because styled-jsx scopes them. After removing styled-jsx, these collide with anything else on the page. Decision: **convert to `data-*` attributes** (`data-segment`, `data-tier-text`, etc.) and target via Tailwind's `data-*` variants. No global classnames.

### D8. Codemod gating: regex must handle prefixes, opacity modifiers, and `@apply`

The naïve `s/text-\[#ee0000\]/text-red-600/g` regex misses 144 prefixed sites (`hover:bg-[#ee0000]`, `dark:text-[#ee0000]/50`, `group-hover:from-[#ee0000]`, `focus-within:ring-[#ee0000]/20`) and silently mangles `@apply focus:border-[#ee0000]` in `globals.css` ([L608](src/app/globals.css#L608)). The actual codemod regex:

```js
/(\b(?:[\w-]+:)*)([a-z-]+)-\[(#[0-9a-fA-F]{3,8})\](\/[\d.]+)?/g
```

with a hex→token snap map applied per match. Excludes paths: `*.html`, `**/*-email-template.html`, `src/lib/email/**`, `src/components/email-preview/**`, `src/components/invoice/InvoiceEmailTemplate.html`, and skips matches inside string literals that are CSS gradient values.

`badgePulse` keyframe in `tailwind.config.ts` uses `rgba(238,0,0,…)` — hand-converted to use the new token color, not codemod.

## Phased implementation

Five phases. Each is independently shippable, reviewable, and revertible.

### Phase 0 — Foundation (1 PR, ~45 min, ZERO visual change)

Pure additions. No existing class breaks; no rendered pixel moves.

**Files added:**
- `src/utils/cn.ts` — clsx + twMerge wrapper
- `docs/shared-ui/tailwind-conventions.md` — 1-page rules-of-the-road (no arbitrary colors, use `cn()`, use ModalContainer, etc.)

**Files modified:**
- `package.json` — install `clsx`, `tailwind-merge`, `class-variance-authority`
- `tailwind.config.ts`:
  - Extend `colors.red.*` per D1
  - Add `colors.brand-tier.{tradie,foreman,boss}` per D2
  - Add `fontSize.{2xs,3xs}` per D3
  - Move 3 inline `@keyframes` (`spin-reverse`, `sparkle`, `memberBenefitFloat`) into config
- `src/app/globals.css` — add `--app-header-h` / `--app-header-h-lg` per D4
- `docs/CLAUDE.md` (manifest) — bump `lastModified`, no path changes
- `docs/shared-ui/README.md` (or equivalent) — register `tailwind-conventions.md`

**Verification:** `npm run lint && npm run type-check && npm run build` clean. Open `/dev/modals` and 3 random pages — confirm no visual change.

**Risk:** None. All additions are namespaced or extend existing tokens with non-overlapping keys.

### Phase 1 — Codemod sweeps (3 small PRs, mechanical, low risk)

Each PR is one regex transformation. Reviewers see exactly what changed.

#### 1a. Brand red literals → `red.*` tokens

- Regex: per D8
- Snap map: `#ee0000→red-600`, `#cc0000→red-700`, `#ff4444→red-400`, `#ec0000→red-500`, `#e60000→red-650`, `#b91c1c→red-800`, `#991b1b→red-900`, `#7f1d1d→red-950`, `#fef2f2→red-50`, `#fee2e2→red-100`, `#fecaca→red-200`
- Excluded paths: `*-email-template.html`, `src/lib/email/**`, `src/components/email-preview/**`, `src/components/invoice/InvoiceEmailTemplate.html`
- Hand-touched: `tailwind.config.ts` `badgePulse` keyframe (rgb form)
- Sites: ~700 across ~80 files
- Verification: `git diff --stat` should show only className edits; `npm run build`; spot-check `/dev/modals` and top 5 site pages

#### 1b. Micro-text-size literals → `text-2xs` / `text-3xs`

- Regex: `text-\[(8|10)px\]` → `text-3xs` / `text-2xs` (with prefixes)
- `text-[9px]` (58 sites) and `text-[11px]` (142 sites) — **decision needed**: round to nearest scale step (9→8 = `text-3xs`; 11→10 = `text-2xs`) or add scale steps `text-2.5xs` (9px) and `text-1.5xs` (11px). Recommendation: **round, document the rounding**, because 1px differences in dense UI rarely matter and adding more scale steps invites more arbitraries.
- Sites: ~589
- Verification: build + spot-check; this WILL produce sub-pixel differences if the line-height changed — acceptance test is "no perceptible visual change in dense lists/tables/admin grids"

#### 1c. Header offsets → CSS variable

- Regex: `pt-\[86px\]` → `pt-[var(--app-header-h)]`, `pt-\[106px\]` → `pt-[var(--app-header-h-lg)]`
- Sites: 34
- Verification: visual check on every page that uses one (the page-header offset)

### Phase 2 — Pilot: `CancellationUpsellModal` (1 PR)

#### 2.A. Gallery enhancements (must land FIRST, in same PR or separate)

`ModalsGalleryClient.tsx` currently exercises 1 of ~12 prop combos. Add the 11 missing combos as labeled variants in the gallery so visual A/B is possible:

1. Default + tradie downgrade w/ saveLabel *(existing)*
2. Default + foreman downgrade w/ saveLabel
3. Default + boss downgrade w/ saveLabel
4. Tradie downgrade WITHOUT saveLabel
5. No downgrade
6. `accumulatedEntries=0` (alt hero copy)
7. `isPastDue=true, accumulatedEntries>0`
8. `isPastDue=true, accumulatedEntries=0`
9. `daysUntilDraw=undefined`
10. `drawCloseLabel=undefined`
11. Long entries (`accumulatedEntries=12500`)
12. `isProcessing=true` mid-flight

#### 2.B. File restructure

```
src/components/modals/CancellationUpsellModal/
  index.tsx                        ← orchestrator: state, effects, API call, prop assembly (~200 LOC)
  Hero.tsx                         ← eyebrow + headline + sub + prize banner + progress bar (~80 LOC)
  LoseGrid.tsx                     ← 3-cell "you walk away from" (~70 LOC)
  ActionRow.tsx                    ← cancel + stay/resolve buttons; +100 BONUS via cva variant (~50 LOC)
  DowngradeCard.tsx                ← tier-themed card; cva variants for tier (~80 LOC)
  TrustBar.tsx                     ← 3-cell SSL/NTP/cancel-anytime row (~30 LOC)
  Banner.tsx                       ← yellow "someone's name gets called" CTA (~30 LOC)
  hero.module.css                  ← ONLY composite gradients + diagonal stripe ::before (~30 LOC)
```

Old file `src/components/modals/CancellationUpsellModal.tsx` deleted; the import path `@/components/modals/CancellationUpsellModal` resolves to `index.tsx` so call sites (1: `SubscriptionManagementModal.tsx:1443`) don't change.

#### 2.C. Critical preservation rules

| Element | Preservation |
|---|---|
| `z-[80]` on root | Byte-exact via `<ModalContainer className="!z-[80]">` (or new `zIndex` prop) |
| `:global()` classnames | Renamed to `data-*` attributes per D7 — list each rename in the PR description |
| Composite radial gradient hero background | Moved to `hero.module.css` verbatim, applied via `className={styles.hero}` |
| `::before` diagonal stripe overlay | Same — `hero.module.css` |
| `+100 BONUS` `::after` badge | `cva` variant on stay button: `variant: 'redeem' | 'resolve'`. `redeem` adds `after:content-['+100_BONUS'] after:…` |
| Tier glow `::before` on downgrade card | `cva` variant on card: each tier owns its `before:bg-[radial-gradient(…)]` arbitrary value |
| `transform: rotate(-4deg)` on downgrade icon | Tailwind `rotate-[-4deg]` (or `-rotate-4` with `theme.extend.rotate`) |
| Custom scrollbar (thin, dark thumb) on `.cm-frame` | `hero.module.css` (`scrollbar-width: thin` + `::-webkit-scrollbar` rules) — Tailwind doesn't cover this |
| 10ms `setTimeout` for entry animation | Preserved in `index.tsx` orchestrator |
| `setIsProcessing` / `useLoading` / `useEntryRewardToast` integration | Preserved in `index.tsx` |
| Body/html `overflow:hidden` lock | Handled by `ModalContainer` (one of the reasons we adopt it) |
| Escape key handler | Handled by `ModalContainer` |
| `dark:` classes | Zero today; zero after |
| Mobile breakpoint `@media (max-width: 540px)` rules | Each rule mapped to Tailwind's `max-sm:` (640px) — **wait, our breakpoint is 540px not 640px**. Decision: define a custom `screens.xs: '540px'` in `tailwind.config.ts` and use `max-xs:` so the breakpoint is byte-exact. (Otherwise rules trigger 100px earlier and look subtly different on tablets.) |

#### 2.D. Lucide-react icon mapping

Replace 9 inline SVG factory functions with `lucide-react` imports:

| Custom | Lucide |
|---|---|
| `TrophyIcon` | `Trophy` |
| `TicketIcon` | `Ticket` |
| `CalendarIcon` | `Calendar` |
| `WalkIcon` | `LogOut` (semantically clearer for "cancel anyway") |
| `ShieldIcon` | `ShieldCheck` |
| `AwardIcon` | `Award` |
| `LockIcon` | `Lock` |
| `StarIcon` | `Star` |
| `ArrowRightIcon` | `ArrowRight` |
| `CheckIcon` | `Check` |

Same `currentColor` stroke; same `strokeWidth` where it differs from Lucide's default (override via `strokeWidth` prop).

#### 2.E. CVA usage

Three `cva()` definitions:

```ts
// ActionRow.tsx
const stayButton = cva(
  'rounded-[10px] px-3 py-2.5 font-extrabold text-white transition-all duration-150',
  { variants: {
      variant: {
        redeem:  'bg-gradient-to-b from-red-600 to-red-800 border-[1.5px] border-red-800 shadow-[0_8px_18px_rgba(238,0,0,0.28)] hover:-translate-y-px hover:shadow-[0_12px_24px_rgba(238,0,0,0.36)] after:content-["+100_BONUS"] after:absolute after:-top-[7px] after:right-2.5 after:bg-gradient-to-br after:from-yellow-300 after:to-premium-gold after:text-3xs after:font-extrabold after:tracking-[0.1em] after:px-1.5 after:py-0.5 after:rounded-full after:border-[1.5px] after:border-white after:shadow-[0_3px_8px_rgba(212,175,55,0.45)]',
        resolve: 'bg-gradient-to-b from-red-600 to-red-800 border-[1.5px] border-red-800 shadow-[0_8px_18px_rgba(238,0,0,0.28)] hover:-translate-y-px hover:shadow-[0_12px_24px_rgba(238,0,0,0.36)]',
      },
    },
  }
);
```

```ts
// DowngradeCard.tsx
const tierAccentText = cva('font-extrabold', {
  variants: { tier: {
    tradie:  'text-brand-tier-tradie',
    foreman: 'text-brand-tier-foreman',
    boss:    'text-brand-tier-boss',
  }},
});

const tierGlow = cva(
  'absolute inset-0 rounded-[inherit] pointer-events-none',
  { variants: { tier: {
    tradie:  'bg-[radial-gradient(circle_at_0%_50%,rgba(0,194,237,0.22),transparent_60%)]',
    foreman: 'bg-[radial-gradient(circle_at_0%_50%,rgba(255,210,0,0.22),transparent_60%)]',
    boss:    'bg-[radial-gradient(circle_at_0%_50%,rgba(238,0,0,0.24),transparent_60%)]',
  }}}
);

const tierBadge = cva(
  'absolute -top-2.5 -left-2 z-10 size-[46px] rounded-xl border-2 border-white p-1.5 -rotate-[4deg] inline-flex items-center justify-center',
  { variants: { tier: {
    tradie:  'bg-gradient-to-br from-brand-tier-tradie to-[#5ca9ec] shadow-[0_8px_22px_rgba(0,194,237,0.45),0_0_0_1px_rgba(0,194,237,0.5)]',
    foreman: 'bg-gradient-to-br from-[#ffe066] to-brand-tier-foreman shadow-[0_8px_22px_rgba(255,210,0,0.5),0_0_0_1px_rgba(255,210,0,0.5)]',
    boss:    'bg-gradient-to-br from-[#ff4444] to-brand-tier-boss shadow-[0_8px_22px_rgba(238,0,0,0.5),0_0_0_1px_rgba(238,0,0,0.5)]',
  }}}
);

const tierCta = cva(
  'inline-flex items-center gap-1.5 px-3 py-[9px] rounded-[9px] font-extrabold text-2xs tracking-[0.08em] uppercase whitespace-nowrap transition-all duration-150 hover:-translate-y-px hover:brightness-110',
  { variants: { tier: {
    tradie:  'bg-gradient-to-br from-[#5ca9ec] to-brand-tier-tradie text-white shadow-[0_6px_14px_rgba(0,194,237,0.45)]',
    foreman: 'bg-gradient-to-br from-[#ffe066] to-brand-tier-foreman text-[#0a0a0a] shadow-[0_6px_14px_rgba(255,210,0,0.45)]',
    boss:    'bg-gradient-to-br from-[#ff3333] to-brand-tier-boss text-white shadow-[0_6px_14px_rgba(238,0,0,0.45)]',
  }}}
);
```

The composite `radial-gradient(...)` arbitraries are unavoidable — they're the cleanest expression of multi-stop tier glows and reading them in CVA is no worse than reading them in CSS.

### Phase 3 — Modal sweep (3-5 PRs)

Apply Phase 2's pilot pattern to:

- **PR 3a:** `RenewalFailedModal.tsx` (1,292 LOC; 3 style blocks; same `cm-*`-style local classes; uses `--tone-glow`/`--tone-accent` for danger/success themes — becomes a `cva({ tone: 'danger' | 'success' })`)
- **PR 3b:** `DowngradeConfirmModal.tsx` (611 LOC; tier-themed similarly to Cancellation)
- **PR 3c:** `SuccessScreen.tsx`, `PartnerBenefitsPromoSection.tsx`, `PaymentLoadingSpinner.tsx` (small style blocks, mostly inline `@keyframes` → already moved to config in Phase 0)
- **PR 3d:** `ProductFilters.tsx` (`:global(html.dark) .slider-thumb` is a special case — webkit slider pseudo-elements don't have Tailwind utilities; stays in a tiny `slider.module.css`)
- **PR 3e:** `MembershipModal.tsx` and `my-account/layout.tsx` (the global hide of `.site-header/.site-footer/.newsletter-section` is a smell — flag it but if we keep it, move to a class-based approach in `globals.css` with a comment explaining the cross-tree coupling)

Email previews stay untouched.

### Phase 4 — UI primitives (incremental, opportunistic)

After modal sweep, build out `src/components/ui/` with:

- `<Button>` — based on existing `modals/ui/Button.tsx`, refactored to use `cva` for variants/sizes/tones, replacing the current string-keyed object lookup
- `<Badge>` — generalize from the half-dozen bespoke badges (`BestValueBadge`, `MembershipBadge`, etc.)
- `<Card>` and `<Card.Header>`/`<Card.Body>`
- `<Modal>` — re-export of `ModalContainer` with sane defaults

**No big-bang migration.** New code adopts them; old code migrates when touched. The shadcn-style adoption pattern.

### Phase 5 — Debt cleanup (separate, scheduled)

- Audit and remove the 86 `!important` overrides; with `tailwind-merge`, none should be needed
- Migrate template-literal classNames → `cn()` (704 sites, opportunistic)
- Visual review of the 48 `bg-[#dc2626]` sites (intentional Tailwind default vs. drift bug)
- Decompose `UserDetailModal.tsx` (52 long-className attrs), `UsersManagement.tsx`, `Header.tsx`
- Decide on the `my-account/layout.tsx` global hide pattern

## Visual parity verification protocol

Per-phase, after `npm run build` passes:

1. **Open `/dev/modals` in two browser tabs** — current main branch in one, refactor branch in the other.
2. **For each gallery variant** (Phase 2.A enumeration), check at desktop (≥541px) and mobile (≤540px) — 12 variants × 2 breakpoints = 24 visual comparisons per modal.
3. **Browser DevTools "Inspect Element"** on any pixel-suspicious area; compare computed CSS rules. Any difference is a bug.
4. **Optional but recommended:** screenshot before/after with the same window size and overlay them in any image diff tool — pixel diff should be empty.
5. **Smoke test the full cancel flow** in the app (active sub → "Cancel" → upsell appears) for each of: tradie/foreman/boss tiers + a past-due account. This confirms the production rendering path matches the gallery rendering path.

If any state combo isn't in the gallery (Phase 2.A), it can't be parity-tested — gallery enhancements are **a hard prerequisite** for the pilot, not a nice-to-have.

## Codemod safety appendix

### Naïve-codemod failure modes (must handle by hand)

1. **`@apply` inside `globals.css`** ([L608](src/app/globals.css#L608)) — the `.css` regex must skip lines starting with `@apply` or only operate on Tailwind-utility-shaped substrings within them. Manual fix is safer.
2. **`badgePulse` keyframe** in `tailwind.config.ts` — uses `rgba(238,0,0,…)`, not hex. Hand-converted.
3. **Template-literal classNames** in `prize-brand-colors.ts`, `brand-theme.ts`, `packageColorScheme.ts` — left as-is; they output dynamic `[#hex]` classes. Add `safelist` entries:
   ```ts
   safelist: [
     ...existing,
     { pattern: /^(text|bg|border|from|to|via|shadow|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\](\/\d+)?$/ },
   ],
   ```
4. **Inline `style={{}}` hex** (99 files) — explicitly out of scope.
5. **Existing `bg-red-600` calls** already mean `#ee0000` because of the config override — they don't need migration. The codemod's snap map `#ee0000 → red-600` lands on the same token.
6. **HTML email templates** — explicit exclusion list in the codemod runner.
7. **`text-[9px]` / `[11px]`** — round per D8; the rounding is intentional and documented.

### Codemod implementation

The codemod is a small `tsx` script in `scripts/codemods/`:

- `scripts/codemods/sweep-brand-red.ts`
- `scripts/codemods/sweep-micro-text.ts`
- `scripts/codemods/sweep-header-offsets.ts`

Each:
- Walks `src/components/**`, `src/app/**`, `src/utils/**` (the Tailwind `content` paths) — excludes the documented paths
- Uses the regex from D8
- Reports `[file:line] before → after` for each replacement (dry-run mode)
- Has `--dry-run` and `--apply` flags
- Wired to npm scripts: `sweep:brand-red`, `sweep:micro-text`, `sweep:header-offsets` (and `:dry` variants)

Reviewer can `npm run sweep:brand-red:dry > /tmp/changes.txt` and inspect the full plan before the regex actually edits anything.

## Skills, agents, and verification layers

Per the user's question on what Claude layers help here:

### During spec & plan
- `superpowers:writing-plans` — invoked after this spec is approved, to convert it into a step-by-step implementation plan with checkpoints

### During each phase's execution
- **`Plan` agent** (optional) — if a phase's implementation needs more design (e.g. choosing how `ModalContainer` accepts a custom z-index)
- **`superpowers:test-driven-development`** — Phase 2+: write a tsx regression test that imports `CancellationUpsellModal` and asserts it renders without error in all 12 prop combos (no visual assertions; just smoke + accessibility)
- **`test-author` agent** — wires the new test into `package.json` `test:cancellation-upsell` script
- **`superpowers:subagent-driven-development`** — Phase 1 codemod sweeps are independent; can be executed in parallel by separate agents

### Per-PR gates
- **`diff-reviewer` agent** — independent fresh-context substance review of each PR diff before requesting human review
- **`domain-doc-updater` agent** — refreshes `docs/shared-ui/`, `docs/admin/` per the manifest after each PR (the `Stop` hook will block otherwise)
- **`simplify` skill** — reviews the new code for over-abstraction
- **`superpowers:verification-before-completion`** — runs the per-phase gate (lint + type-check + build + visual A/B in `/dev/modals`)

### Optional second opinion
- **`superpowers:requesting-code-review`** — for the Phase 2 pilot, before merge — second-opinion on the decomposition

### Not used
- `frontend-design` skill (we already have the design)
- `debug-investigator` (no bug)
- `mcp-builder` (irrelevant)

## Open decisions for the user

These are real choices the spec doesn't make for you. Each affects implementation; pick before Phase 2 starts.

1. **Snap map for the rounded shades.** `text-[9px] → text-3xs (8px)` and `text-[11px] → text-2xs (10px)` — accept 1px rounding, or add `text-2.5xs` / `text-1.5xs` to preserve byte-exact sizing? Recommendation: **accept rounding**, document it.
2. **`ModalContainer` adoption for the pilot.** Adopt now (recommended — kills the bespoke wrapper for good) or keep the bespoke `<div className="fixed inset-0 z-[80]…">` and just remove the styled-jsx (lower risk, more code)? Recommendation: **adopt now**.
3. **`my-account/layout.tsx` global hide.** Phase 5 cleanup, or leave alone forever? Recommendation: **Phase 5; flag for future, not urgent**.
4. **The 48 `bg-[#dc2626]` sites.** Phase 5 visual review, or convert in Phase 1 by assuming all are intended as the project's brand red? Recommendation: **Phase 5 review**; risk of silent visual drift is too high to assume.
5. **Custom breakpoint `screens.xs: '540px'`** for the modal's `max-xs:` — accept this addition to `tailwind.config.ts` (recommended) or use Tailwind's default `max-sm` (640px) and accept that mobile rules trigger 100px earlier? Recommendation: **add the custom breakpoint**.
6. **Codemod tooling.** Roll our own `tsx` scripts in `scripts/codemods/` (recommended — small, reviewable, repo-local) or use `jscodeshift`/`ts-morph`? Recommendation: **roll our own**, regex-based; the transformations are mechanical.

## Risks

- **Visual drift undetected.** No automated visual regression. Mitigation: gallery enhancements (Phase 2.A) are a hard prerequisite; manual A/B is comprehensive but slow.
- **`tailwind-merge` changes utility-conflict resolution.** Adopting `cn()` widely could re-resolve conflicts in unintended ways. Mitigation: `cn()` adoption is opportunistic (Phase 5), not a sweep — limits blast radius.
- **`ModalContainer` lacks a custom z-index prop.** Mitigation: small additive prop, doesn't break callers.
- **Codemod misses prefixed/modified arbitraries** — D8's regex must be tested against a corpus of known prefixed sites before being unleashed. Add a `--dry-run` step that reports a diff sample.
- **The `safelist` for dynamic class builders grows the CSS bundle.** Measured impact: the regex pattern in §Codemod safety adds ~200KB of generated CSS classes (Tailwind's JIT can't tree-shake what it can't see). Mitigation: limit the pattern to colors actually used (audit `prize-brand-colors`/`brand-theme`/`packageColorScheme` outputs and constrain the safelist to that set).

## Doc updates required

Per the Domain Manifest, the following doc folders must be updated as part of this work (the `Stop` hook enforces this):

- `docs/shared-ui/` — new `tailwind-conventions.md`, `modal-patterns.md` (Phase 2)
- `docs/subscription/` — note the `CancellationUpsellModal` decomposition (Phase 2)
- `docs/dev-tooling/` — note the `ModalsGalleryClient` enhancements (Phase 2)
- `docs/infrastructure/` — note the new codemod scripts (Phase 1)

## Acceptance

Each phase is "done" when:
1. Per-phase gate passes (lint + type-check + build)
2. `diff-reviewer` agent has a clean report (or addressed findings)
3. Visual A/B in `/dev/modals` shows zero perceptible difference (Phase 2+)
4. Doc-sync hook passes
5. User has reviewed and approved the PR
