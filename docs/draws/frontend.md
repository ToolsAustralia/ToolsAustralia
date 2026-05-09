# Draws — Frontend

## Pages

| Path | Purpose |
|---|---|
| `src/app/(site)/major-draw/page.tsx` | Current major draw landing — hero, countdown, entry CTA |
| `src/app/(site)/mini-draws/[id]/` | Individual mini-draw detail page |
| `src/app/(site)/mini-draw-success/` | Post-purchase success for mini-draw entry |
| `src/app/(site)/draw-results/` | Past major draws |
| `src/app/(site)/winners/` | Winner gallery |

## Key components

| Component | Purpose |
|---|---|
| `src/app/(site)/mini-draws/[id]/components/MiniDrawCountdown.tsx` | Countdown timer to mini-draw end |
| `src/app/(site)/mini-draws/[id]/components/ShareButton.tsx` | Social-share for mini-draw |
| _other major-draw components_ | _TODO: enumerate from src/components/ that map to draws (per the manifest, draws-domain components are not pulled out separately — they live near pages)._ |

## Hooks

| Hook | Purpose | Source |
|---|---|---|
| `useMajorDrawEntryCta()` | CTA state for the major-draw entry button | [src/hooks/useMajorDrawEntryCta.ts](../../src/hooks/useMajorDrawEntryCta.ts) |
| `useMajorDrawPurchaseGate()` | Gating logic — should the user be allowed to purchase right now? | [src/hooks/useMajorDrawPurchaseGate.ts](../../src/hooks/useMajorDrawPurchaseGate.ts) |
| `useMiniDrawTrigger()` | Trigger / opening mini-draw modals or flows | [src/hooks/useMiniDrawTrigger.ts](../../src/hooks/useMiniDrawTrigger.ts) |
| `usePastDrawsData()` | Fetch list of past draws for results page | [src/hooks/usePastDrawsData.ts](../../src/hooks/usePastDrawsData.ts) |

> _TODO: verify each hook's contract by reading source._

## Client state

- All draw reads via TanStack Query.
- Countdown components compute their own `now()` ticks — server-rendered draw end-dates are the source of truth.
- No Zustand for draws.

## Display formatting

- Winner names are rendered via [src/utils/winner-name-formatter.ts](../../src/utils/winner-name-formatter.ts) — privacy convention (first name + last initial).
- Eligibility messaging via [src/utils/giveaway-eligibility.ts](../../src/utils/giveaway-eligibility.ts).

## Cross-domain notes

### Winner testimony display

The cinematic Hear From Our Winners section + Read Full Story modal live under [src/components/sections/winner-testimony/](../../src/components/sections/winner-testimony/) — owned by the **shared-ui** domain (see [docs/shared-ui/frontend.md](../shared-ui/frontend.md#sectionswinner-testimony--hear-from-our-winners)). Draws-domain code (the `Winner` model, `WinnerSummary` type, [src/utils/winners.ts](../../src/utils/winners.ts) helpers) feeds it; the visual layout is owned by shared-ui.

Refactored 2026-05-04: the photo is now used as a full-bleed cinematic background (not a centered display image) and the modal uses a magazine-article layout. No data-shape, API, or business-logic changes.

## className conventions (2026-05-08)

Draw components use `cn()` from `@/utils/cn` for conditional class composition. The `sweep-classname-template-literals` codemod (Plan 5 Phase 2) converted template-literal `className={`...`}` patterns to `className={cn(...)}`. Use `cn()` rather than template literals when adding new conditional classes.
