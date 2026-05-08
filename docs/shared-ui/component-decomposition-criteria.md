# Component Decomposition Criteria

Companion to [tailwind-conventions.md](./tailwind-conventions.md) and the strategic [frontend-architecture-principles.md](./frontend-architecture-principles.md). This doc is the *tactical* tool: use it to decide **when** a single file is overdue for decomposition into a folder of focused sub-components, and **when not to bother**. For the broader architectural principles (atomic design, SRP, composition, etc.) read `frontend-architecture-principles.md`.

## TL;DR scoring

A component is a **decomposition candidate** when it hits one **strong signal** — or two or more **weaker signals**. Components hitting **3+ signals total** belong on the decomposition backlog. **5+ signals = top priority.**

Run the scoring during code review, when adding a feature to an existing component, or as a one-shot audit (see [§Screening tool](#screening-tool) — produced by Plan 5).

## Strong signals (any one of these = decompose)

| Signal | Why it matters | How to spot |
|---|---|---|
| `<style jsx>` / `<style>` block > 200 LOC | The visual rules are dominating the file. Tailwind utilities or a co-located `*.module.css` belongs in scope. | Grep `<style` in the file; eyeball the block size. |
| `:global(...)` selectors targeting children | Hidden coupling — child elements being styled across component boundaries. After styled-jsx removal, those generic class names collide globally. | Grep `:global(` |
| 3+ inline SVG icon factory functions at file bottom | Reinventing `lucide-react`. Pure noise, drift-prone. | Grep `function .*Icon\(` near bottom of file. |
| Distinct visual sections rendered in one big `return` | Each section probably has its own props, conditionals, and concern. Decomposing makes them independently testable. | Read the JSX tree; count top-level sections separated by comments or whitespace. |
| Variant explosion via nested ternaries `isA ? (isB ? X : Y) : Z` | CVA territory — the variants want to be a typed discriminator, not nested conditionals. | Grep `\?` count in JSX; smell at 5+. |
| Mixed concerns: data fetching + business logic + presentation + helper functions in one file | Each layer wants its own home. | Look for hooks, fetch calls, helper consts, and JSX all jumbled. |

## Weaker signals (combine 2+ to justify)

| Signal | Threshold |
|---|---|
| Total file LOC | >500 (investigate); >800 (almost certainly decompose) |
| className arbitrary-value count (`-[…]`) | High count = brittle styling, missing tokens. Per-file `>20` is high. |
| `className=` attribute length | Any single attr >300 chars; a file with multiple such attrs is a red flag |
| Conditional render branches (top-level `?:` in return) | 4+ |
| Long inline `style={{}}` objects | 5+ properties at multiple call sites |
| Repeated literal magic values | Same hex/size used 5+ times in the file (missed token) |
| Number of distinct `useState` / `useReducer` calls | 5+ separate state slices in one file usually means multiple concerns |

## Anti-signals (do NOT decompose)

| Signal | Why |
|---|---|
| Single coherent algorithm or state machine | Splitting fragments the logic. Long is fine when cohesive. |
| Sub-component would be used in 1 place with only prop passthrough | Just noise — keep inline. |
| Splitting by technical layer (state.ts, handlers.ts, jsx.tsx) | Co-location beats separation. Split by responsibility, not by category. |
| Component is on the deletion list anyway | Don't refactor what you're about to remove. |
| Chasing aesthetic line counts on something that works | "It's 600 lines but reads top-to-bottom" — leave it. |

## Decomposition pattern (when you decide to)

```
src/components/<Domain>/<ComponentName>/
  index.tsx          ← orchestrator: state, effects, API, prop assembly. ~150-250 LOC.
  <Section1>.tsx     ← one visual section (e.g. Hero, Header, Body, Footer)
  <Section2>.tsx
  …
  <styles>.module.css ← only for what doesn't fit Tailwind utilities (composite gradients,
                        ::-webkit-scrollbar, container queries, complex pseudo-element math)
  __tests__/<ComponentName>.test.ts ← smoke regression for all meaningful prop combos
```

**Rules of thumb:**

- The folder's `index.tsx` is the orchestrator — it owns the public prop interface, all hooks, all effects, all callbacks. It composes sub-components and wires them with prop assembly.
- Each sub-component takes flat props (not a context object). If a sub-component needs 8+ props, it's probably owning state that belongs in the orchestrator.
- Each sub-component is ≤120 LOC. If it grows beyond that, it has an internal section that itself wants extracting.
- Re-export the type interface (e.g. `export type Tier = …`) from the sub-component that defines the variant axis; the orchestrator imports it.
- The folder/`index.tsx` resolves the same import path as the previous file (Next.js + TypeScript do this automatically: `@/components/Foo` → `Foo/index.tsx` if `Foo/` is a directory). No callsites change.

## Examples

### Cancellation modal (the pilot — see [Plan 2](../superpowers/plans/2026-05-08-ui-cleanup-plan-2-cancellation-modal-pilot.md))

`src/components/modals/CancellationUpsellModal.tsx` (1,495 LOC, pre-refactor) — scored **7/7 strong signals**:

| Signal | Hit |
|---|---|
| `<style jsx>` >200 LOC | ✅ ~900 LOC |
| `:global()` selectors | ✅ 30+ |
| Inline SVG icon factories | ✅ 9 |
| Distinct visual sections | ✅ 6 (Hero, LoseGrid, Banner, ActionRow, DowngradeCard, TrustBar) |
| Variant ternaries | ✅ tier × isPastDue × hasEntries — multiple nested branches |
| Mixed concerns | ✅ API call + cache update + toast + UI + animation + 9 SVGs |
| File LOC >800 | ✅ 1,495 |

Decomposed into 8 files in a folder, totaling ~750 LOC distributed.

### Counter-example: a 600-LOC form that's coherent

A form like `src/components/payment/PaymentMethodForm.tsx` might be 600 LOC but consist of:
- 1 large schema definition
- 1 useState for form state
- 1 submit handler with branching logic
- 1 return with a tall vertical layout of inputs

Score:
- File LOC: 600 (weak signal)
- `<style jsx>`: 0
- `:global()`: 0
- SVG factories: 0
- Visual sections: 1 (a single form)
- Variant ternaries: maybe 2 (validation states)
- Mixed concerns: minor (state + handler + JSX is fine for a form)

Total: ~1 weak signal. **Don't decompose.** It's a long-but-coherent form.

## Screening tool

Plan 5 ships `scripts/codemods/audit-component-decomposition.ts` — a one-shot audit that walks `src/components/` + `src/app/` and scores each component against the criteria above. Output: `docs/shared-ui/decomposition-backlog.md` — a ranked list of candidates with their scores.

The backlog is the work queue for incremental decomposition. Pick from the top down as time permits. Don't blanket-refactor; high-score components yield the most value.

Run the audit periodically (when adding features, before a major release) to catch new offenders.

## Workflow

When you (or an AI session) adds a component:
1. Eyeball the criteria — if it scores 3+ during writing, it's already big enough to decompose. Do it now.
2. If it scores below 3 but you can foresee it growing (e.g. a flow that's expected to gain steps): decide whether to pre-decompose or just file a note for future review.

When reviewing PRs:
1. Apply the criteria to changed files. Did this PR push a 2-signal file to a 3-signal file?
2. If yes: ask the author to consider decomposition before merge, OR file as backlog if the change is time-sensitive.
3. If no: ship.

When auditing the codebase (one-shot):
1. Run `npm run audit:decomposition` (Plan 5 wires this up).
2. Read `docs/shared-ui/decomposition-backlog.md`.
3. Prioritize: high-score (5+) components first, especially if they're in actively-edited paths.
4. Decompose one at a time using the [Plan 2 pattern](../superpowers/plans/2026-05-08-ui-cleanup-plan-2-cancellation-modal-pilot.md) as the template.
