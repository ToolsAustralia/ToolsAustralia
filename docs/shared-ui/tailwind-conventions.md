# Tailwind Conventions

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
  same `--font-poppins` var. `h1–h6` is pinned to `font-weight: 900` (a **loaded** weight;
  Poppins loads 400/500/600/700/900 in `src/app/layout.tsx`) with `font-synthesis: none` —
  previously it requested the **unloaded** 800, which font-matched up to 900 anyway, so this
  is intent==render, not a visual change.
- **Poppins weight set is NOT trimmable:** every loaded weight (400/500/600/700/900) has live
  `font-poppins` consumers post-codemod — `font-normal`/`medium`/`semibold`/`bold`(=800→900)/
  `black`(=900) plus the h1–h6 (900) and `.ta-loader-status` (700). Dropping any would
  misweight real content.
