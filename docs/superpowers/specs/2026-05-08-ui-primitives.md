# UI Primitives — Spec

**Date:** 2026-05-08
**Owner:** DJ (autonomous-author: Claude)
**Surface:** `src/components/ui/` — atomic-design layer
**Status:** Spec → Plan 4

## Problem

The codebase mixes atomic primitives with domain organisms in `src/components/ui/`. There's no shared `<Button>` typed via CVA — each modal/page rolls its own. There's no `<Badge>`, `<Card>`, or `<Modal>` primitive consumable across domains. Plan 6 (modal design uplift) needs these primitives to compose against, otherwise we re-decompose the same patterns per-modal.

The decomposition spec (`2026-05-08-ui-tailwind-cleanup-design.md`) Phase 4 outlined:
> Build out `src/components/ui/` with: `<Button>`, `<Badge>`, `<Card>`, `<Modal>` as CVA primitives. **Don't force-migrate.** Let new code adopt them; migrate old code when touched.

## Goals

- Ship 4 typed primitives in `src/components/ui/`: `Button`, `Badge`, `Card`, `Modal` (the latter as a thin re-export of `ModalContainer`).
- Each primitive uses CVA for variants, accepts a `className` override (resolved via `cn()` so user classes win), and includes JSDoc on every variant axis.
- Zero forced migrations. Existing `MetallicButton`, `BestValueBadge`, etc. stay as-is. Plan 5 / future work migrates opportunistically.
- A smoke test per primitive (renderToString in each variant combo, asserts non-empty markup, no a11y violations from missing `type` on `<button>` etc.).
- Storybook is **out of scope**; manual gallery items in `ModalsGalleryClient.tsx` cover the primitives' demonstrability.
- Documentation in `docs/shared-ui/` matching the `frontend-architecture-principles.md` atomic-design tier.

## Non-goals

- Replacing `MetallicButton` (it's a domain-specific asset; stays).
- Replacing `modals/ui/Button.tsx` (the modal-internal button; deferred).
- Building a complete design-system library (Input/Select/Tabs/Tooltip/Popover etc. — out of scope; Plan 4 is the four primitives that unblock Plan 6).
- Dependency upgrades.
- Storybook setup.

## Architecture

```
src/components/ui/
  Button.tsx       # NEW — CVA(variant, size, tone) + asChild via Slot
  Badge.tsx        # NEW — CVA(tone, size)
  Card.tsx         # NEW — Card + Card.Header + Card.Body + Card.Footer compound
  Modal.tsx        # NEW — re-export of ModalContainer with sane defaults
  __tests__/
    Button.test.ts
    Badge.test.ts
    Card.test.ts
```

Primitives use design tokens from Plan 1 (`red-*`, `brand-tier-*`, `text-2xs`/`text-3xs`, etc.). They accept and forward `className` via `cn()` (Plan 1 utility).

`Button` adopts the shadcn `asChild` pattern via `@radix-ui/react-slot` (already in the lucide-react dep tree — verify; if not present we install it, ~3KB).

## Variants summary

**Button** — the most-used primitive. Variants:
- `variant`: `primary` (red gradient) | `outline` (red border, white bg) | `ghost` (neutral) | `link` (text-only, underline)
- `size`: `sm` (h-8) | `md` (h-10, default) | `lg` (h-12)
- `tone`: `red` (default) | `tier-tradie` | `tier-foreman` | `tier-boss` | `neutral`
- `loading`: boolean (renders `Loader2` spinner, disables interaction)

**Badge** — small label/pill. Variants:
- `tone`: `red` | `gold` | `tier-tradie` | `tier-foreman` | `tier-boss` | `neutral` | `success` | `warning` | `info`
- `size`: `sm` (text-3xs px-1.5) | `md` (text-2xs px-2)

**Card** — content container. Compound with `Card.Header`, `Card.Body`, `Card.Footer`. Single variant axis:
- `padding`: `sm` | `md` (default) | `lg` | `none`

**Modal** — re-export of `ModalContainer` (already exists at `src/components/modals/ui/ModalContainer.tsx`) with import path normalized to `@/components/ui/Modal` for atomic-design discoverability. No behavioural change.

## Testing

Each primitive gets a smoke test (4-8 prop combos via `react-dom/server.renderToString`). Pattern matches Plan 2/3 modal tests. Tests live at `src/components/ui/__tests__/`.

`package.json` gets one umbrella script: `test:ui-primitives` runs all 3 (Button + Badge + Card; Modal smoke is part of the existing modal tests).

## Open decisions (auto-decided per user trust)

1. **`@radix-ui/react-slot` for `asChild`?** YES — adds ~3KB, enables `<Button asChild><Link href=...>...</Link></Button>` pattern. Standard shadcn move.
2. **`Modal` is just a re-export, not a new component?** YES — ModalContainer already does the job; the `ui/Modal` re-export gives the atomic-design path discoverable.
3. **No Input/Select/Tabs/etc.?** Out of scope; Plan 6 needs Button/Badge/Card/Modal; the others can be added when needed.

## Risks

- `Button` adoption tempting in production code → defer all migrations to Plan 5+; Plan 4 is primitive-creation only.
- `@radix-ui/react-slot` install adds a dep — small but real.
- CVA variant explosion on `Button` (4 × 3 × 5 × 2 = 120 combinations) → CVA emits CSS only for combinations actually used; bundle stays small.
