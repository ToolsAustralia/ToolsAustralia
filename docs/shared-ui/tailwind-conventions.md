# Tailwind Conventions

> **Manifest note (2026-07-30):** [`tailwind.config.ts`](../../tailwind.config.ts) was an
> **orphan** — matched by no domain in the Domain Manifest, so edits to it triggered no
> doc-sync requirement at all. It is now mapped to **shared-ui**, beside
> `src/app/globals.css`: the two are the halves of one styling layer, and an edit to the
> config is almost always a design-system change (colour, screen, font) whose documentation
> belongs in this file. Precedent for a root config living outside `infrastructure` is
> `next.config.ts`, which the manifest assigns to `security-csp`.

This doc captures the rules that the UI/Tailwind cleanup work locked in. Future code follows these.

**Sibling docs:**
- [component-decomposition-criteria.md](./component-decomposition-criteria.md) — when to split a component into a folder
- [frontend-architecture-principles.md](./frontend-architecture-principles.md) — how the whole frontend is organized (atomic design, SRP, composition, props discipline, folder conventions, a11y, performance, testing)

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

## 9. Mobile-viewport sizing rules (iOS, 2026-06-09)

- **Focusable inputs must be ≥16px (`text-base`) to avoid iOS focus zoom.** iOS Safari auto-zooms a focused input whose computed font-size is <16px (`text-sm` = 14px). Never ship a `<input>`/`<textarea>`/Stripe Element field below `text-base`.
- **Size modal content with `svh`, not `dvh`.** `dvh` is throttled by WebKit and janks/clips as the mobile browser chrome shows/hides; `svh` (smallest viewport) is stable. The modal body's own `overflow-y-auto` handles overflow.
- **Fixed-bottom CTAs add the safe-area inset**: `bottom-[calc(env(safe-area-inset-bottom)+1rem)]` so they clear the iOS home indicator (the app sets `viewport-fit=cover`).

See [gotchas.md](./gotchas.md) "Mobile-UX hardening pass" for the per-file fix list and the WebKit bug reference.

## 10. Fonts: use `font-poppins`, never `font-['Poppins']` (2026-07-20)

`next/font/google` registers Poppins under a **hashed family name** exposed only via the
CSS variable `--font-poppins` (wired to the `font-poppins` utility in `tailwind.config.ts`
→ `fontFamily.poppins = [var(--font-poppins), "Poppins", "sans-serif"]`). It does **not**
register a global `@font-face` named `Poppins`.

So the arbitrary class **`font-['Poppins']` compiles to `font-family: Poppins`** — a bare
family the browser can't resolve to the loaded face, so those elements silently render a
**fallback** font. The **fallback-suffixed** form `font-['Poppins',sans-serif]` has the same
defect (the first family, `Poppins`, still doesn't resolve). The Tier-2 codemod
**`npm run sweep:font-poppins`** (dry-run default; `scripts/codemods/sweep-font-poppins.ts`)
matches **both** forms and rewrote **300 occurrences across 95 files** (296 bare + 4
fallback-suffixed `<h1>` hero titles — incl. the flagship homepage "Tools Australia" title)
→ `font-poppins`, so they now render the **actual loaded Poppins**. This is an **intended,
sitewide visual change** (headings, buttons, labels, form inputs, chart labels, badges).

- **Rule:** to apply Poppins, use `font-poppins` (or the `font-display` utility, also mapped
  to `--font-poppins`). Never `font-['Poppins']` / `font-['Poppins',sans-serif]` / `font-[Poppins]`.
- **`.form-input`** (globals.css `@layer components`) and the global `h1–h6` rule use the
  same `--font-poppins` var. `h1–h6` is pinned to `font-weight: 900` (a **loaded** weight)
  with `font-synthesis: none` — previously it requested 800, which was unloaded at the time and
  font-matched up to 900 anyway, so this is intent==render, not a visual change.
- **Poppins loads 400/500/600/700/800/900** in [`src/app/layout.tsx`](../../src/app/layout.tsx).
  **800 was added 2026-07-21** for the prize builder, whose card titles, CTA and chips are
  specified at `font-extrabold` — without it, `font-synthesis: none` font-matched every 800 up to
  900 and flattened the type hierarchy. The h1–h6 pin stays at 900 (unaffected).
- **The weight set is NOT trimmable:** every loaded weight has live `font-poppins` consumers —
  `font-normal`/`medium`/`semibold`/`bold`/`extrabold`(=800, prize builder + specs modal)/
  `black`(=900), plus the h1–h6 (900) and `.ta-loader-status` (700). Dropping any would
  misweight real content.

## 11. Scoped design-token blocks for a self-contained surface (2026-07-30)

Most surfaces style directly with Tailwind utilities and `dark:` pairs. That stops scaling
when a surface arrives with a **complete external design system** — the admin draws revamp
ships ~40 colour tokens and ~30 layout tokens that all switch at one breakpoint. Expressed
as utilities, every element becomes `text-[#4b5565] dark:text-[#a3a3ac]` and the design's
"change one token, change everywhere" property is lost.

For that case only, define the tokens as CSS custom properties in a **scoped block** and
consume them via arbitrary values.

**Reference:** [`src/components/admin/draws/tokens.css`](../../src/components/admin/draws/tokens.css),
imported once at the top of [`globals.css`](../../src/app/globals.css).

### Rules

1. **Scope to a class, never `:root`.** Token names from an external design system are
   generic — `--panel`, `--line`, `--text`, `--accent`. On `:root` they apply to every page
   and collide with any future global of the same name. `.admin-draws` keeps the blast
   radius to the four draws pages. One component (`DrawsPageShell`) carries the class and is
   the token scope boundary; nothing renders outside it.
2. **The `@import` must be the first statement in `globals.css`**, above the `@tailwind`
   directives. CSS requires `@import` to precede all other statements.
3. **Compose along the two axes the design defines.** Light/dark share every *layout* token;
   desktop/mobile share every *colour* token. So: base block = mobile layout + light colour,
   `.dark .admin-draws` overrides colour only, `@media (min-width: 900px)` overrides layout
   only. Do not duplicate a token into more than one block.
4. **Named breakpoint, not a literal.** The design's single breakpoint is registered as the
   `draws` screen in [`tailwind.config.ts`](../../tailwind.config.ts) so components write
   `draws:grid-cols-2`, never `min-[900px]:grid-cols-2`. Keep the screen and the `@media`
   block in the token file in lockstep — they are two expressions of one number.
5. **Control heights are tokens, not literals.** Every interactive element reads
   `--m-btn-h` / `--m-btn-sm` / `--m-field` / `--m-icon` / `--m-cardBtn`. All five resolve to
   44px below the breakpoint, which makes the mobile tap-target minimum hold *by
   construction* rather than by review. A control with a hardcoded height is the bug.
6. **Gate any always-on animation.** The shimmer and spinner keyframes in the token file sit
   behind `@media (prefers-reduced-motion: reduce)`.

### When NOT to do this

A handful of one-off colours, or a surface that already reads the app's palette. This
pattern costs a second styling vocabulary living beside Tailwind's `dark:` classes — it only
pays when an external design system defines the whole surface and the token count is high
enough that utilities would bury it.

### Verifying it compiles

The token file is inert until an element carries the class, so a broken import fails
silently in dev. Compile and assert the values landed:

```bash
npx tailwindcss -i ./src/app/globals.css -o /tmp/tw-check.css
grep -c -e "--m-tblCols" /tmp/tw-check.css   # tokens present
grep -E '\:grid-cols-2\b' /tmp/tw-check.css # the named-screen variant emits
```
## 12. Viewport-height utilities, and why one of them adds an overhang (2026-07-30)

`globals.css` `@layer utilities` owns the `svh`/`dvh` helpers, each written as two
declarations so browsers without `svh`/`dvh` still get a `vh` fallback: `.h-screen-svh`,
`.min-h-screen-svh`, `.h-screen-dvh`, `.min-h-screen-dvh`. Use these rather than a bare
Tailwind `min-h-screen` when the box must survive mobile browser-chrome changes — and note
an arbitrary class like `min-h-[calc(100svh+96px)]` **cannot** carry the fallback, so an
older browser drops the declaration entirely rather than degrading.

`.min-h-screen-svh-newsletter` is the same reservation **plus the height `NewsletterSection`
overhangs upward**. That component is `absolute top-0 -translate-y-1/2`, so it paints half
its own height above the block it follows; a flat `100svh` leaves that half inside the
viewport and it shifts away when content streams in. The overhang is responsive because the
card is — measured 120 / 140 / 188px tall at `<640` / `640–1023` / `≥1024`, reserved via a
`--ta-newsletter-overhang` custom property at 64 / 72 / 96px.

**`pb-*` is not an alternative.** `min-height` resolves against the border box, so bottom
padding is absorbed by the reservation instead of extending it — the box stays exactly
100svh and the layout shift is unchanged. A commit that tried this was reverted after
measurement. Full geometry and the before/after numbers:
[docs/promo/gotchas.md](../promo/gotchas.md) → "A viewport of reservation is 92px too short".

## `animate-dropdown-in` vs `animate-fade-in` (2026-08-12)

`animate-fade-in` is `fadeIn 0.5s ease-in-out`. That is fine for a full-screen surface, and wrong
for a **hover-opened** menu: the pointer is already travelling toward the item it wants, so a
half-second fade means the user arrives before the panel is legible. The header's five desktop
dropdown panels read as sluggish for exactly this reason.

`animate-dropdown-in` (`dropdownIn 0.12s ease-out`, opacity + a 4px rise) is the token for
trigger-anchored panels. Use it for anything that opens under a cursor; keep `animate-fade-in`
for full-bleed surfaces (the mobile sidebar, its scrims) where a slower fade still reads well.

Pair it with `motion-reduce:animate-none` — a one-shot reveal is cheap, but the OS signal is free
to honour.
