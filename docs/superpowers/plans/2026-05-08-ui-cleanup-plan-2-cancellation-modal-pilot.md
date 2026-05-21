# UI Cleanup — Plan 2: CancellationUpsellModal Pilot

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-05-08-ui-tailwind-cleanup-design.md](../specs/2026-05-08-ui-tailwind-cleanup-design.md) (Phase 2)

**Predecessor:** Plan 1 (Foundation + Codemods) committed at `63ec206`.

**Goal:** Decompose `src/components/modals/CancellationUpsellModal.tsx` (1,495 LOC; ~900 of `<style jsx>`) into a folder of 7 focused sub-components + 1 small CSS module, swap the bespoke modal shell for the existing `ModalContainer`, swap inline-SVG icon factories for `lucide-react`, encode tier/button variants via `class-variance-authority` — all with **byte-equivalent visual output and identical behaviour**.

**Architecture:**
- Adopt `src/components/modals/ui/ModalContainer.tsx` (add an additive `zIndex?: number` prop so we can preserve the modal's deliberate `z-[80]` micro-stack outside the standard `Z_INDEX` tiers).
- Decompose into `src/components/modals/CancellationUpsellModal/{index,Hero,LoseGrid,Banner,ActionRow,DowngradeCard,TrustBar}.tsx` + `hero.module.css`. The folder's `index.tsx` keeps the public import path `@/components/modals/CancellationUpsellModal` working — no callsite changes.
- Replace 9 inline SVG factory functions with `lucide-react` (already installed at ^0.544.0).
- Replace `:global(.seg)`, `.title`, `.sub`, `.num`, `.desc`, `.icn`, `.lbl`, `.t`, `.d`, `.li` selectors with `data-*` attributes (no global classnames after refactor).
- CVA encodes the stayButton variant (`redeem` adds `+100 BONUS` `::after`; `resolve` does not) and the downgradeCard tier (`tradie | foreman | boss`).
- Composite multi-stop radial gradients + diagonal stripe `::before` + `::-webkit-scrollbar` rules go in a co-located `hero.module.css` (Tailwind utilities don't cover these cleanly).

**Tech Stack:** React 19, Next.js 15, Tailwind 3 (post-Plan-1 token set), `class-variance-authority`, `clsx + tailwind-merge` (`cn()` helper at `src/utils/cn.ts`), `lucide-react`, CSS modules (Next.js built-in).

**Hard requirements:**
- 100% visual parity at desktop and mobile (≤540px) breakpoints in every state combo (verified via the gallery)
- 100% behavioural parity: public prop interface unchanged; effects, callbacks, optimistic cache updates, toasts, loading states, escape handler, scroll lock, prefetch invalidations all preserved
- `z-[80]` preserved exactly (micro-stack above SubscriptionManagementModal)
- `npm run lint` clean on touched files
- `npm run type-check` clean
- `npm run build` clean
- All commits batched at end of plan, on explicit user authorization (consistent with Plan 1)

---

## File Structure

**Create:**
- `src/components/modals/CancellationUpsellModal/index.tsx` — orchestrator: state, effects, API call, prop assembly, wires sub-components via `ModalContainer`
- `src/components/modals/CancellationUpsellModal/Hero.tsx` — eyebrow + headline + subcopy + prize banner image + progress bar
- `src/components/modals/CancellationUpsellModal/LoseGrid.tsx` — 3-cell "you walk away from" grid
- `src/components/modals/CancellationUpsellModal/Banner.tsx` — yellow "someone's name gets called next draw" CTA
- `src/components/modals/CancellationUpsellModal/ActionRow.tsx` — cancel + stay/resolve buttons (CVA variants)
- `src/components/modals/CancellationUpsellModal/DowngradeCard.tsx` — tier-themed card with corner badge + 3 checks (CVA tier variant)
- `src/components/modals/CancellationUpsellModal/TrustBar.tsx` — 3-cell SSL/NTP/cancel-anytime row
- `src/components/modals/CancellationUpsellModal/hero.module.css` — composite gradients + repeating-stripe + custom scrollbar
- `src/components/modals/CancellationUpsellModal/__tests__/CancellationUpsellModal.test.ts` — smoke regression test

**Modify:**
- `src/components/modals/ui/ModalContainer.tsx` — add additive `zIndex?: number` prop
- `src/components/dev/ModalsGalleryClient.tsx` — add 11 missing prop combos as labelled gallery variants (parity-testing surface)
- `package.json` — add `test:cancellation-upsell` npm script
- `CLAUDE.md` — bump `lastVerified` for `subscription` and `dev-tooling` domains

**Delete:**
- `src/components/modals/CancellationUpsellModal.tsx` — replaced by the new folder (Next.js + TypeScript module resolution will pick up `<folder>/index.tsx` for `@/components/modals/CancellationUpsellModal` imports)

**Domain manifest:** Refresh `subscription` (modal lives there per the manifest's `src/components/modals/**` reference — actually: check, the manifest's `subscription` block only lists specific modal files). If `CancellationUpsellModal` isn't in any domain's `paths`, this is a manifest bug from before Plan 2; fix by adding it to `subscription`. Verify in Task 13.

---

## Reference: lines & state combinations to preserve

**Source file (current, pre-refactor):** `src/components/modals/CancellationUpsellModal.tsx` (1,495 LOC).

**Behavioural elements to preserve (with line refs in current file):**

| Element | Lines | Preservation requirement |
|---|---|---|
| Public prop interface | L24-L41 | EXACT — no rename, no removal |
| `useEffect` scroll-lock + escape handler | L122-L137 | Preserved (or delegated to `ModalContainer` which provides equivalent behaviour) |
| `useEffect` query invalidation on open | L140-L147 | Preserved in orchestrator |
| `handleRedeem` async API call + cache update + toast | L149-L203 | Byte-identical |
| `handleDecline`, `handleSwitchPlan`, `handleResolvePayment` | L205-L217 | Byte-identical |
| `featuredPrize` random non-cash prize selection | L92-L102 | Byte-identical |
| `segments` always-positive progress bar (14 segs, 2nd-to-last filled) | L106-L109 | Byte-identical |
| 10ms `setTimeout` for entry animation | L113-L120 | Preserved (animation triggers via `data-visible` attribute) |
| `entriesLabelHero` / `heroEntriesCopy` past-due/no-renewal copy variants | L223-L230 | Byte-identical |
| `showSpotCell` conditional 3rd LOSE cell | L232 | Byte-identical |
| `drawCloseText` fallback string | L233-L235 | Byte-identical |

**Visual elements to preserve (CSS rules in `<style jsx>`, line refs):**

| Element | Lines in `<style jsx>` | Where it goes after refactor |
|---|---|---|
| Hero composite radial gradient (red + gold + linear black) | L545-L548 | `hero.module.css` (multi-layer too long for arbitrary value) |
| Hero diagonal repeating-stripe `::before` overlay | L553-L562 | `hero.module.css` |
| `cm-frame` `::-webkit-scrollbar` thin styling | L514-L520 | `hero.module.css` |
| Hero `cm-eyebrow .line` linear-gradient | L578-L583 | Tailwind arbitrary `bg-[linear-gradient(...)]` |
| `cm-headline` Anton font + size + spacing | L596-L618 | Tailwind utilities |
| `cm-prize-banner` border + composite background | L632-L641 | Tailwind utilities (single radial OK) |
| `cm-progress` grid + colors | L643-L711 | Tailwind utilities |
| `cm-lose` 3-cell layout with `::before` separators | L745-L770 | `before:` pseudo + `data-*` separators |
| `cm-lose-icon` red gradient bg | L771-L782 | Tailwind utilities |
| `cm-banner` (yellow CTA) gradient | L800-L809 | Tailwind utilities |
| `cm-banner-icon` star with shadow | L810-L821 | Tailwind utilities |
| `cm-btn` base + cancel + stay variants | L836-L912 | CVA `stayButton` + `cancelButton` |
| `cm-btn-stay::after` "+100 BONUS" badge | L913-L927 | CVA `stayButton({ variant: "redeem" })` adds `after:content-["+100_BONUS"]` |
| `cm-btn-stay--plain` (resolve variant, no badge) | L928-L930 | CVA `stayButton({ variant: "resolve" })` |
| `cm-downgrade-divider` "Not feeling the price?" with line | L932-L957 | Tailwind utilities + `before:` |
| `cm-downgrade` tier card + `::before` glow | L959-L975 | CVA `downgradeCard` per tier; glow via `before:` arbitrary radial-gradient |
| `cm-downgrade-icon` corner badge with rotation | L977-L993 | CVA `downgradeBadge` per tier; `-rotate-[4deg]` |
| `cm-downgrade-row` flex with offset | L994-L1002 | Tailwind utilities |
| `cm-downgrade-text` typography | L1003-L1021 | Tailwind utilities + tier accent text via CVA |
| `cm-downgrade-checks` 3-col grid with `nth-child` justify | L1023-L1052 | Tailwind utilities + `[&:nth-child(N)]:justify-...` arbitrary modifiers |
| `cm-downgrade-cta` tier CTA button | L1053-L1082 | CVA `downgradeCta` per tier |
| Tier theme blocks (`tradie`, `foreman`, `boss`) | L1085-L1117 | CVA variants own these per-tier |
| `cm-trust` 3-cell layout with `::before` separators | L1119-L1167 | Tailwind utilities + `before:` separators |
| `@media (max-width: 540px)` block (~230 lines of overrides) | L1170-L1399 | Tailwind `max-xs:` variants (Plan 1 added the `xs: 540px` breakpoint) |

**Icon mapping (replace inline SVG factory functions L1405-L1493):**

| Current factory | lucide-react | Used by |
|---|---|---|
| `TrophyIcon` (size 14, 20) | `Trophy` | Hero eyebrow + LoseGrid 2nd cell |
| `TicketIcon` (size 20) | `Ticket` | LoseGrid 1st cell |
| `CalendarIcon` (size 20) | `Calendar` | LoseGrid 3rd cell |
| `WalkIcon` (size 16) | `LogOut` | ActionRow cancel button |
| `ShieldIcon` (size 12) | `ShieldCheck` | TrustBar 1st cell |
| `AwardIcon` (size 12) | `Award` | TrustBar 2nd cell |
| `LockIcon` (size 12, 16) | `Lock` | TrustBar 3rd cell + ActionRow stay/resolve buttons |
| `StarIcon` (size 16) | `Star` (with `fill="currentColor"`) | Banner |
| `ArrowRightIcon` (size 12) | `ArrowRight` | DowngradeCard CTA |
| `CheckIcon` (size 11) | `Check` | DowngradeCard checks |

**Stroke widths from current factories (preserve via `strokeWidth` prop on lucide):**

- Trophy: 2.2 (lucide default 2)
- Ticket, Calendar, Walk, Shield, Award, Lock, ArrowRight: 2 (lucide default — no prop needed)
- Check: 3.5 (lucide default 2)
- Star: filled (use `fill="currentColor"`)
- ArrowRight: 2.5 (lucide default 2)

**Z-index:** preserve `z-[80]` exactly via the new `zIndex` prop on `ModalContainer` (Task 1).

---

## Pre-flight check

- [ ] **Step 0: Confirm clean working tree on `ui-improvements` branch with Plan 1 committed**

Run:
```bash
git status --short
git log -1 --oneline
```

Expected:
- `git status` shows ONLY the 2 pre-existing unrelated modifications (`.claude/settings.local.json`, `src/generated/upsellImageManifest.ts`) — NO Plan 1 changes still in working tree.
- `git log` shows `63ec206 plan 1 committed` (or whatever commit captured Plan 1).

If anything else is dirty: stash or commit before starting Plan 2.

---

## Task 1: Add `zIndex` prop to `ModalContainer`

**Files:**
- Modify: `src/components/modals/ui/ModalContainer.tsx` (around L40-L100 props interface; L129-L133 `resolveZIndex` function; L455 usage)

The cancellation modal sits in a deliberate `z-[80]` micro-stack above its parent `SubscriptionManagementModal`. Existing `nested`/`nestedSecondary` props use `Z_INDEX.MODAL_NESTED` (10100) / `MODAL_NESTED_SECONDARY` (10200) — wrong tier for our case. Add an escape hatch: `zIndex?: number` overrides the resolved value.

- [ ] **Step 1: Read the file to locate the props interface, `resolveZIndex` function, and z-index application site**

Run: `cat src/components/modals/ui/ModalContainer.tsx | head -100`

Confirm: there's a props interface (likely `ModalContainerProps`) somewhere in the top 100 lines. Find the field declarations including `nested?:` / `nestedSecondary?:`.

- [ ] **Step 2: Add `zIndex` to the props interface**

Use Edit. Find the interface field declaration block where `nested?: boolean` and `nestedSecondary?: boolean` live. Add a new field directly after them:
```ts
  /**
   * Override the resolved z-index. Use ONLY when this modal must sit in a
   * non-standard micro-stack outside the Z_INDEX scale (e.g. CancellationUpsellModal
   * uses `zIndex={80}` to sit above its parent SubscriptionManagementModal).
   */
  zIndex?: number;
```

- [ ] **Step 3: Add `zIndex` to the function's destructured props**

Find where the component destructures props from its parameters (should be near the function signature, e.g. `const ModalContainer = ({ children, isOpen, ..., nested = false, nestedSecondary = false, ... }) => {`). Add `zIndex` to the destructure (no default, since it's optional):

```ts
  zIndex,
```

- [ ] **Step 4: Use `zIndex` in `resolveZIndex`**

Find the `resolveZIndex` function (around L129-L133). Replace it with:
```ts
  const resolveZIndex = () => {
    if (zIndex !== undefined) return zIndex;
    if (nestedSecondary) return Z_INDEX.MODAL_NESTED_SECONDARY;
    if (nested) return Z_INDEX.MODAL_NESTED;
    return Z_INDEX.MODAL_BASE;
  };
```

- [ ] **Step 5: Type-check + build**

Run:
```bash
npm run type-check 2>&1 | tail -3
npm run build 2>&1 | tail -5
```

Expected: both exit 0. The change is purely additive — no existing caller breaks.

- [ ] **Step 6: Verify no regression in existing modal usage**

Run: `grep -rn "ModalContainer" src/components --include="*.tsx" | head -10`

Pick one existing consumer (e.g. `SubscriptionManagementModal.tsx`) and confirm it still type-checks. Existing callers don't pass `zIndex` so they fall through to the existing `Z_INDEX` resolution.

---

## Task 2: Enhance `ModalsGalleryClient.tsx` with 12 prop combos for CancellationUpsellModal

**Files:**
- Modify: `src/components/dev/ModalsGalleryClient.tsx` (around L988-L1002 — currently renders 1 prop combo)

Visual parity testing requires all meaningful state combos exercised in the gallery. The current gallery renders only 1. Add 11 more as separately-labelled gallery items so we can A/B each one.

- [ ] **Step 1: Read the current rendering**

Run: `sed -n '980,1010p' src/components/dev/ModalsGalleryClient.tsx`

Confirm the existing `<CancellationUpsellModal ... />` shape on lines 988-1002.

- [ ] **Step 2: Read the gallery's variant-registration mechanism**

Find how the gallery declares modal entries. The audit showed line 340: `{ id: "cancellation-upsell", label: "CancellationUpsellModal", category: "Commerce" }` and line 267: source path. Locate the array these live in.

Run: `grep -n "cancellation-upsell" src/components/dev/ModalsGalleryClient.tsx`

You should find ~3 occurrences: the source-path map entry, the gallery item entry (label/category), and the rendering site.

- [ ] **Step 3: Add 11 new gallery item entries**

In the array of gallery items (the one containing `{ id: "cancellation-upsell", label: "CancellationUpsellModal", category: "Commerce" }`), ADD these 11 new entries right after it (preserve commas correctly):

```ts
  { id: "cancellation-upsell-foreman", label: "CancellationUpsell — Foreman tier", category: "Commerce" },
  { id: "cancellation-upsell-boss", label: "CancellationUpsell — Boss tier", category: "Commerce" },
  { id: "cancellation-upsell-no-savelabel", label: "CancellationUpsell — Tradie no saveLabel", category: "Commerce" },
  { id: "cancellation-upsell-no-downgrade", label: "CancellationUpsell — no downgrade option", category: "Commerce" },
  { id: "cancellation-upsell-no-entries", label: "CancellationUpsell — 0 accumulated entries", category: "Commerce" },
  { id: "cancellation-upsell-past-due", label: "CancellationUpsell — past due (60 entries)", category: "Commerce" },
  { id: "cancellation-upsell-past-due-no-entries", label: "CancellationUpsell — past due (0 entries)", category: "Commerce" },
  { id: "cancellation-upsell-no-days", label: "CancellationUpsell — no daysUntilDraw", category: "Commerce" },
  { id: "cancellation-upsell-no-label", label: "CancellationUpsell — no drawCloseLabel", category: "Commerce" },
  { id: "cancellation-upsell-long-entries", label: "CancellationUpsell — 12,500 entries", category: "Commerce" },
  { id: "cancellation-upsell-processing", label: "CancellationUpsell — processing state", category: "Commerce" },
```

- [ ] **Step 4: If a source-path map exists, register the same source path for the new IDs**

If `"cancellation-upsell": "src/components/modals/CancellationUpsellModal.tsx"` is in a `Record<string, string>`, copy that mapping for each new ID:

```ts
  "cancellation-upsell-foreman": "src/components/modals/CancellationUpsellModal.tsx",
  "cancellation-upsell-boss": "src/components/modals/CancellationUpsellModal.tsx",
  // ... (same path for all 11 new IDs)
```

- [ ] **Step 5: Render each new gallery item with the appropriate prop combo**

Find the existing `<CancellationUpsellModal ...>` JSX (around L988-L1002). DUPLICATE it for each new combo. Each new render uses `isOpen={isOpen("<id>")}` and the prop variations below.

You may want to extract the 12 combos into a constant array and `.map()` them — a bit cleaner than 12 inline JSX blocks. Either approach works.

The 12 prop combinations to render:

```ts
// Combo 1: existing (unchanged) — id="cancellation-upsell"
{ accumulatedEntries: 60, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec",
  downgrade: { packageName: "Tradie", saveLabel: "Save $19/mo", onConfirm: close } }

// Combo 2: id="cancellation-upsell-foreman"
{ accumulatedEntries: 60, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec",
  downgrade: { packageName: "Foreman", saveLabel: "Save $9/mo", onConfirm: close } }

// Combo 3: id="cancellation-upsell-boss"
{ accumulatedEntries: 60, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec",
  downgrade: { packageName: "Boss", saveLabel: "Save $5/mo", onConfirm: close } }

// Combo 4: id="cancellation-upsell-no-savelabel" (Tradie tier, NO saveLabel — middle check disappears)
{ accumulatedEntries: 60, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec",
  downgrade: { packageName: "Tradie", onConfirm: close } }

// Combo 5: id="cancellation-upsell-no-downgrade"
{ accumulatedEntries: 60, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec" }

// Combo 6: id="cancellation-upsell-no-entries"
{ accumulatedEntries: 0, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec",
  downgrade: { packageName: "Tradie", saveLabel: "Save $19/mo", onConfirm: close } }

// Combo 7: id="cancellation-upsell-past-due"
{ isPastDue: true, accumulatedEntries: 60, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec",
  onResolvePayment: close,
  downgrade: { packageName: "Tradie", saveLabel: "Save $19/mo", onConfirm: close } }

// Combo 8: id="cancellation-upsell-past-due-no-entries"
{ isPastDue: true, accumulatedEntries: 0, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec",
  onResolvePayment: close }

// Combo 9: id="cancellation-upsell-no-days"
{ accumulatedEntries: 60, drawCloseLabel: "Fri 26 Dec",
  downgrade: { packageName: "Tradie", saveLabel: "Save $19/mo", onConfirm: close } }

// Combo 10: id="cancellation-upsell-no-label"
{ accumulatedEntries: 60, daysUntilDraw: 5,
  downgrade: { packageName: "Tradie", saveLabel: "Save $19/mo", onConfirm: close } }

// Combo 11: id="cancellation-upsell-long-entries"
{ accumulatedEntries: 12500, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec",
  downgrade: { packageName: "Tradie", saveLabel: "Save $19/mo", onConfirm: close } }

// Combo 12: id="cancellation-upsell-processing"
// NOTE: isProcessing is internal state; this combo just opens normally and the
// reviewer triggers "Keep me in the draw" to see the processing label swap.
// No special props needed — same as combo 1.
{ accumulatedEntries: 60, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec",
  downgrade: { packageName: "Tradie", saveLabel: "Save $19/mo", onConfirm: close } }
```

For each combo, the JSX pattern is:
```tsx
<CancellationUpsellModal
  isOpen={isOpen("cancellation-upsell-<suffix>")}
  onClose={close}
  onRedeem={close}
  onDecline={close}
  onResolvePayment={close}  // include for past-due combos; harmless to include always
  {...combo-specific props}
/>
```

- [ ] **Step 6: Type-check + build**

Run:
```bash
npm run type-check 2>&1 | tail -3
npm run build 2>&1 | tail -5
```

Expected: both exit 0. (Pre-Plan-2: the existing CancellationUpsellModal still serves these renders — no behavior change yet, just more gallery items.)

- [ ] **Step 7: Smoke-check the gallery**

The user will visit `/dev/modals` and confirm the 11 new entries appear in the sidebar. Each one opens a modal with the expected variation. (No code change in this step — just a visual sanity check.)

If you're a subagent: report DONE and let the controller do the visual smoke. Don't try to launch a browser.

---

## Task 3: Set up the `CancellationUpsellModal/` folder + write `hero.module.css`

**Files:**
- Create: `src/components/modals/CancellationUpsellModal/` (directory)
- Create: `src/components/modals/CancellationUpsellModal/hero.module.css`

Note: The OLD `src/components/modals/CancellationUpsellModal.tsx` file STAYS UNTOUCHED through this task. It continues to serve all imports. Only Task 10 atomically swaps it.

- [ ] **Step 1: Create the folder**

Use Bash:
```bash
mkdir -p src/components/modals/CancellationUpsellModal
```

- [ ] **Step 2: Write `hero.module.css`**

Use Write tool. EXACT content:

```css
/* CancellationUpsellModal — composite gradients, scrollbar, and stripe overlay
 * that don't translate cleanly to single Tailwind utilities. Imported as a
 * CSS module by Hero.tsx and the orchestrator (index.tsx).
 */

/* Hero — 3-layer composite background.
 * Original: `<style jsx>` lines 545-548 of the pre-refactor file.
 *   radial(red glow at top) + radial(gold glow at bottom) + linear(black gradient)
 */
.heroBg {
  background:
    radial-gradient(900px 360px at 50% -120px, rgba(238, 0, 0, 0.32), transparent 65%),
    radial-gradient(600px 300px at 50% 120%, rgba(212, 175, 55, 0.18), transparent 60%),
    linear-gradient(180deg, #0a0a0a 0%, #141416 60%, #0a0a0a 100%);
}

/* Hero pinstripe overlay applied via ::before.
 * Original: lines 553-562. The repeating-linear-gradient is a 14px/14px stripe.
 */
.heroStripeOverlay::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: repeating-linear-gradient(
    45deg,
    transparent 0 14px,
    rgba(255, 255, 255, 0.012) 14px 28px
  );
  pointer-events: none;
}

/* Custom scrollbar for the modal frame.
 * Original: lines 514-520 (`.cm-frame::-webkit-scrollbar`).
 * Tailwind doesn't have first-class utilities for ::-webkit-scrollbar.
 */
.scrollFrame {
  scrollbar-width: thin;
}
.scrollFrame::-webkit-scrollbar {
  width: 6px;
}
.scrollFrame::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 999px;
}

/* Mobile (<=540px) — hide scrollbar on small screens.
 * Original: lines 1174-1185 (the @media block's overrides).
 * Tailwind does not provide ::-webkit-scrollbar:max-xs: composite utilities,
 * so we keep this rule co-located in the module.
 */
@media (max-width: 540px) {
  .scrollFrame {
    scrollbar-width: none;
    -ms-overflow-style: none;
    scrollbar-gutter: auto;
  }
  .scrollFrame::-webkit-scrollbar {
    width: 0;
    height: 0;
    display: none;
  }
}
```

- [ ] **Step 3: Type-check + build**

Run:
```bash
npm run type-check 2>&1 | tail -3
npm run build 2>&1 | tail -5
```

Expected: both clean. The `.module.css` doesn't change anything yet (nothing imports it).

---

## Task 4: Build `Hero.tsx`

**Files:**
- Create: `src/components/modals/CancellationUpsellModal/Hero.tsx`

Reads (for reference, do not modify):
- `src/components/modals/CancellationUpsellModal.tsx` lines 263-312 (Hero JSX)
- `src/components/modals/CancellationUpsellModal.tsx` lines 543-711 (Hero CSS in `<style jsx>`)

This component renders the eyebrow row, headline, sub-copy, prize banner image, and progress bar. Uses lucide-react `Trophy` icon (replacing inline `TrophyIcon` factory).

- [ ] **Step 1: Define props interface + write the component**

Use Write tool. EXACT content for `src/components/modals/CancellationUpsellModal/Hero.tsx`:

```tsx
"use client";

import React from "react";
import Image from "next/image";
import { Trophy } from "lucide-react";
import { cn } from "@/utils/cn";
import styles from "./hero.module.css";

interface HeroProps {
  /** Hero copy: locked-in entries reminder OR no-renewal "hold up" copy. Already styled. */
  entriesCopy: React.ReactNode;
  /** Locked-in entries — the big number on the right of the progress bar. */
  accumulatedEntries: number;
}

const TOTAL_SEG = 14;
const SEGMENTS = Array.from({ length: TOTAL_SEG }, (_, i) => i < TOTAL_SEG - 1);

const Hero: React.FC<HeroProps> = ({ entriesCopy, accumulatedEntries }) => {
  return (
    <div className={cn("relative px-4 pt-3.5 pb-3 text-white overflow-hidden max-xs:px-3 max-xs:pt-3 max-xs:pb-2.5", styles.heroBg, styles.heroStripeOverlay)}>
      <div className="relative z-[2]">
        {/* Eyebrow */}
        <div className="flex items-center justify-center gap-2.5 mb-1.5 max-xs:gap-2 max-xs:mb-1">
          <span className="basis-8 grow-0 shrink-0 h-px bg-[linear-gradient(90deg,transparent,rgba(212,175,55,0.6))] max-xs:basis-[18px]" />
          <span className="text-premium-gold inline-flex"><Trophy size={14} strokeWidth={2.2} /></span>
          <span className="font-extrabold text-[11px] tracking-[0.22em] uppercase text-premium-gold max-xs:text-2xs max-xs:tracking-[0.18em]">Hold up, mate</span>
          <span className="text-premium-gold inline-flex"><Trophy size={14} strokeWidth={2.2} /></span>
          <span className="basis-8 grow-0 shrink-0 h-px bg-[linear-gradient(90deg,rgba(212,175,55,0.6),transparent)] max-xs:basis-[18px]" />
        </div>

        {/* Headline */}
        <h2 className="font-acumin font-normal text-[28px] leading-none tracking-[0.005em] text-center uppercase mb-1.5 max-xs:text-[22px]" id="cm-headline">
          <span className="block font-sans font-extrabold text-[11px] tracking-[0.14em] text-white/55 uppercase mb-1 max-xs:text-2xs max-xs:mb-0.5">You&apos;re already in.</span>
          Don&apos;t walk away from
          <br />
          <span className="text-premium-gold">your next win.</span>
        </h2>

        {/* Sub-copy */}
        <p className="text-center text-xs text-white/70 max-w-[440px] mx-auto mb-2 leading-snug max-xs:text-[11px] max-xs:mb-1.5 max-xs:leading-[1.35]" data-cm-sub>
          {entriesCopy}
        </p>

        {/* Prize banner */}
        <div className="mt-1.5 rounded-xl overflow-hidden border border-white/10 leading-none max-xs:mt-1 max-xs:rounded-[10px]" style={{
          background: "radial-gradient(600px 200px at 50% 50%, rgba(212, 175, 55, 0.1), transparent 70%), linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(0, 0, 0, 0.15))",
        }}>
          <Image
            src="/images/background/promo/landing/all-prizes/all-prizes.webp"
            alt="Major draw prize line-up"
            width={1200}
            height={400}
            sizes="(max-width: 640px) 92vw, 540px"
            style={{ width: "100%", height: "auto", display: "block" }}
            priority={false}
          />
        </div>

        {/* Progress */}
        <div className="mt-2.5 bg-white/[0.03] border border-white/[0.07] rounded-xl px-3 py-2 grid grid-cols-[1fr_auto] gap-3 items-center max-xs:mt-2 max-xs:px-2.5 max-xs:py-1.5 max-xs:gap-2 max-xs:rounded-[10px]">
          <div className="min-w-0">
            <div className="text-[10px] font-extrabold tracking-[0.18em] uppercase text-[#4ade80] mb-1.5 max-xs:text-[9px] max-xs:tracking-[0.14em] max-xs:mb-1">You&apos;re this close to a win</div>
            <div className="relative flex gap-[3px] h-2.5 items-center max-xs:h-2 max-xs:gap-0.5">
              {SEGMENTS.map((on, i) => (
                <span key={i} data-progress-seg className={cn("flex-1 h-2 bg-white/[0.06] rounded-[2px] max-xs:h-1.5", on && "bg-gradient-to-r from-green-600 to-green-500 shadow-[0_0_6px_rgba(34,197,94,0.4)]")} />
              ))}
              <span className="ml-1.5 text-white/60 text-[13px]" aria-hidden>→</span>
            </div>
          </div>
          <div className="text-center border-l border-white/[0.08] pl-4 flex flex-col items-center justify-center max-xs:pl-2.5">
            <div className="font-acumin text-[24px] text-white leading-none max-xs:text-[20px]">{accumulatedEntries.toLocaleString()}</div>
            <div className="text-[9px] font-extrabold tracking-[0.16em] uppercase text-white/55 mt-0.5 text-center whitespace-nowrap max-xs:text-3xs max-xs:mt-0.5">Active entries</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Hero;
```

- [ ] **Step 2: Verify it compiles in isolation**

Run: `npm run type-check 2>&1 | tail -3`
Expected: clean exit 0. No JSX or import errors.

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: clean. Tailwind picks up the new arbitrary classes from this file. The `hero.module.css` import is type-checked.

If build complains about an arbitrary value: it's likely a syntax issue in a `[...]` arbitrary — fix and rebuild.

---

## Task 5: Build `LoseGrid.tsx`

**Files:**
- Create: `src/components/modals/CancellationUpsellModal/LoseGrid.tsx`

Reads (for reference, do not modify):
- `src/components/modals/CancellationUpsellModal.tsx` lines 314-368 (LoseGrid JSX) and 713-798 (LoseGrid CSS)

This component renders the title row, then 3 cells (entries, prize shot, days/spot) with vertical separators. The 3rd cell has two variants based on `showSpotCell`. Uses lucide `Trophy`, `Ticket`, `Calendar`.

- [ ] **Step 1: Write the component**

Use Write tool. EXACT content for `src/components/modals/CancellationUpsellModal/LoseGrid.tsx`:

```tsx
"use client";

import React from "react";
import { Trophy, Ticket, Calendar } from "lucide-react";

interface LoseGridProps {
  isPastDue: boolean;
  hasMembershipEntries: boolean;
  accumulatedEntries: number;
  featuredPrizeShortLabel: string;
  daysUntilDraw: number | undefined;
  drawCloseText: string;
  showSpotCell: boolean;
}

const LoseGrid: React.FC<LoseGridProps> = ({
  isPastDue,
  hasMembershipEntries,
  accumulatedEntries,
  featuredPrizeShortLabel,
  daysUntilDraw,
  drawCloseText,
  showSpotCell,
}) => {
  const titleText = isPastDue ? "Settle up & you keep" : "Cancel now & you walk away from";

  return (
    <div className="bg-white px-4 pt-3 pb-3 max-xs:px-3 max-xs:pt-2.5 max-xs:pb-2.5">
      <div className="text-center font-extrabold text-2xs tracking-[0.18em] uppercase text-neutral-600 mb-2.5 relative before:content-[''] before:absolute before:top-1/2 before:left-1/2 before:w-7 before:h-px before:bg-neutral-200 before:[transform:translateX(calc(-100%-130px))] after:content-[''] after:absolute after:top-1/2 after:right-1/2 after:w-7 after:h-px after:bg-neutral-200 after:[transform:translateX(calc(100%+130px))] max-xs:text-[9px] max-xs:mb-2 max-xs:before:hidden max-xs:after:hidden">
        {titleText}
      </div>

      <div className="grid grid-cols-3 gap-0 items-stretch">
        {/* Cell 1: entries */}
        <div className="text-center px-2 pt-0.5 relative flex flex-col items-center max-xs:px-1">
          <div className="w-[34px] h-[34px] rounded-lg bg-gradient-to-b from-[#fff5f5] to-[#fef2f2] border border-red-100 text-red-700 inline-flex items-center justify-center mb-1.5 max-xs:w-7 max-xs:h-7 max-xs:rounded-md max-xs:mb-1">
            <Ticket size={20} strokeWidth={2} className="max-xs:size-4" />
          </div>
          <div className="font-extrabold text-xs text-neutral-950 mb-0.5 leading-[1.25] flex-1 max-xs:text-[11px] max-xs:mb-px" data-cell-num>
            {hasMembershipEntries ? (
              <>
                <span className="text-red-600 font-extrabold">{accumulatedEntries.toLocaleString()}</span>{" "}
                {isPastDue ? "accumulated entries" : "locked-in entries"}
              </>
            ) : (
              <>
                Your <span className="text-red-600 font-extrabold">accumulated</span> entries
              </>
            )}
          </div>
          <div className="text-2xs text-neutral-600 leading-[1.35] max-xs:text-[9px] max-xs:leading-[1.3]" data-cell-desc>
            {hasMembershipEntries
              ? isPastDue
                ? "Held while you sort the bill"
                : "Already in the current draw"
              : "Earned each cycle on your plan"}
          </div>
        </div>

        {/* Cell 2: prize shot */}
        <div className="text-center px-2 pt-0.5 relative flex flex-col items-center before:content-[''] before:absolute before:left-0 before:top-2 before:bottom-1.5 before:w-px before:bg-neutral-200 max-xs:px-1 max-xs:before:top-1 max-xs:before:bottom-1">
          <div className="w-[34px] h-[34px] rounded-lg bg-gradient-to-b from-[#fff5f5] to-[#fef2f2] border border-red-100 text-red-700 inline-flex items-center justify-center mb-1.5 max-xs:w-7 max-xs:h-7 max-xs:rounded-md max-xs:mb-1">
            <Trophy size={20} strokeWidth={2} className="max-xs:size-4" />
          </div>
          <div className="font-extrabold text-xs text-neutral-950 mb-0.5 leading-[1.25] flex-1 max-xs:text-[11px] max-xs:mb-px" data-cell-num>
            Your shot at the <span className="text-red-600 font-extrabold">{featuredPrizeShortLabel}</span>
          </div>
          <div className="text-2xs text-neutral-600 leading-[1.35] max-xs:text-[9px] max-xs:leading-[1.3]" data-cell-desc>Or $10,000 cash </div>
        </div>

        {/* Cell 3: days / spot — two variants */}
        <div className="text-center px-2 pt-0.5 relative flex flex-col items-center before:content-[''] before:absolute before:left-0 before:top-2 before:bottom-1.5 before:w-px before:bg-neutral-200 max-xs:px-1 max-xs:before:top-1 max-xs:before:bottom-1">
          <div className="w-[34px] h-[34px] rounded-lg bg-gradient-to-b from-[#fff5f5] to-[#fef2f2] border border-red-100 text-red-700 inline-flex items-center justify-center mb-1.5 max-xs:w-7 max-xs:h-7 max-xs:rounded-md max-xs:mb-1">
            <Calendar size={20} strokeWidth={2} className="max-xs:size-4" />
          </div>
          {showSpotCell ? (
            <>
              <div className="font-extrabold text-xs text-neutral-950 mb-0.5 leading-[1.25] flex-1 max-xs:text-[11px] max-xs:mb-px" data-cell-num>
                Your spot in {typeof daysUntilDraw === "number" ? <span className="text-red-600 font-extrabold">{daysUntilDraw} days</span> : <span className="text-red-600 font-extrabold">the draw</span>}
              </div>
              <div className="text-2xs text-neutral-600 leading-[1.35] max-xs:text-[9px] max-xs:leading-[1.3]" data-cell-desc>{drawCloseText}</div>
            </>
          ) : (
            <>
              <div className="font-extrabold text-xs text-neutral-950 mb-0.5 leading-[1.25] flex-1 max-xs:text-[11px] max-xs:mb-px" data-cell-num>
                Your spot {typeof daysUntilDraw === "number" ? <>in <span className="text-red-600 font-extrabold">{daysUntilDraw} days</span></> : <>in the draw</>}
              </div>
              <div className="text-2xs text-neutral-600 leading-[1.35] max-xs:text-[9px] max-xs:leading-[1.3]" data-cell-desc>
                {isPastDue ? "Settle up to keep it" : "Renew to keep it"}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoseGrid;
```

- [ ] **Step 2: Type-check + build**

Run:
```bash
npm run type-check 2>&1 | tail -3
npm run build 2>&1 | tail -5
```

Expected: clean.

---

## Task 6: Build `Banner.tsx`

**Files:**
- Create: `src/components/modals/CancellationUpsellModal/Banner.tsx`

Reads:
- `src/components/modals/CancellationUpsellModal.tsx` lines 370-376 (Banner JSX) and 800-834 (Banner CSS)

The yellow CTA banner with gold star icon, title, and sub-copy.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import React from "react";
import { Star } from "lucide-react";

const Banner: React.FC = () => {
  return (
    <div className="mt-2.5 bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-[10px] px-2.5 py-2 flex gap-2 items-center max-xs:mt-2 max-xs:px-2 max-xs:py-1.5 max-xs:gap-1.5 max-xs:rounded-lg">
      <span className="w-[26px] h-[26px] grow-0 shrink-0 basis-[26px] rounded-full bg-gradient-to-br from-[#f4cf6b] to-premium-gold text-neutral-950 inline-flex items-center justify-center shadow-[0_4px_10px_rgba(212,175,55,0.3)] max-xs:w-[22px] max-xs:h-[22px] max-xs:basis-[22px]">
        <Star size={16} fill="currentColor" className="max-xs:size-3" />
      </span>
      <div>
        <div className="text-xs font-extrabold text-neutral-950 leading-[1.25] max-xs:text-[11px]">Someone&apos;s name gets called next draw.</div>
        <div className="text-[11px] text-[#5b2a02] font-semibold mt-0.5 leading-[1.3] max-xs:text-2xs">Stick around — it could just as easily be yours.</div>
      </div>
    </div>
  );
};

export default Banner;
```

- [ ] **Step 2: Type-check + build**

```bash
npm run type-check 2>&1 | tail -3
npm run build 2>&1 | tail -5
```
Expected: clean.

---

## Task 7: Build `ActionRow.tsx` with CVA variants

**Files:**
- Create: `src/components/modals/CancellationUpsellModal/ActionRow.tsx`

Reads:
- `src/components/modals/CancellationUpsellModal.tsx` lines 378-421 (ActionRow JSX) and 836-930 (button CSS)

Two buttons in a 1fr / 1.25fr grid: cancel (left, neutral) + stay/resolve (right, red gradient). The `redeem` variant has a "+100 BONUS" `::after` badge; `resolve` doesn't.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import React from "react";
import { LogOut, Lock } from "lucide-react";
import { cva } from "class-variance-authority";
import { cn } from "@/utils/cn";

interface ActionRowProps {
  isPastDue: boolean;
  isProcessing: boolean;
  onDecline: () => void;
  /** Used in non-past-due flow ("Keep me in the draw"). */
  onRedeem: () => void;
  /** Used in past-due flow ("Resolve payment"). */
  onResolvePayment: () => void;
}

const stayButton = cva(
  "rounded-[10px] px-3 py-2.25 font-sans font-extrabold tracking-[0.01em] flex items-center gap-2 text-left transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed bg-gradient-to-b from-red-600 to-red-800 text-white border-[1.5px] border-red-800 relative shadow-[0_8px_18px_rgba(238,0,0,0.28)] hover:not-disabled:-translate-y-px hover:not-disabled:shadow-[0_12px_24px_rgba(238,0,0,0.36)] max-xs:px-2.5 max-xs:py-1.5 max-xs:rounded-[9px] max-xs:gap-1.5",
  {
    variants: {
      variant: {
        redeem: "after:content-['+100_BONUS'] after:absolute after:-top-[7px] after:right-2.5 after:bg-gradient-to-br after:from-[#f4cf6b] after:to-premium-gold after:text-neutral-950 after:text-3xs after:font-extrabold after:tracking-[0.1em] after:px-1.5 after:py-0.5 after:rounded-full after:border-[1.5px] after:border-white after:shadow-[0_3px_8px_rgba(212,175,55,0.45)] after:max-xs:text-[7px] after:max-xs:px-1.25 after:max-xs:py-0.5 after:max-xs:-top-[7px] after:max-xs:right-1.5 after:max-xs:tracking-[0.08em] after:max-xs:border",
        resolve: "",
      },
    },
  }
);

const ActionRow: React.FC<ActionRowProps> = ({ isPastDue, isProcessing, onDecline, onRedeem, onResolvePayment }) => {
  return (
    <div className="mt-3 grid grid-cols-[1fr_1.25fr] gap-2 max-xs:mt-2.5 max-xs:gap-1.5">
      {/* Cancel button */}
      <button
        type="button"
        onClick={onDecline}
        disabled={isProcessing}
        className="rounded-[10px] px-3 py-2.25 font-sans font-extrabold tracking-[0.01em] flex items-center gap-2 text-left transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed bg-white border-[1.5px] border-neutral-200 text-neutral-600 hover:not-disabled:bg-neutral-50 hover:not-disabled:border-neutral-400 hover:not-disabled:text-red-700 [&_[data-icn]]:hover:not-disabled:bg-red-50 [&_[data-icn]]:hover:not-disabled:text-red-700 max-xs:px-2.25 max-xs:py-1.75 max-xs:rounded-[9px] max-xs:gap-1.5"
      >
        <span data-icn className="w-7 h-7 rounded-[7px] inline-flex items-center justify-center grow-0 shrink-0 basis-7 bg-neutral-100 text-neutral-600 transition-colors duration-150 max-xs:w-6 max-xs:h-6 max-xs:basis-6 max-xs:rounded-md">
          <LogOut size={16} className="max-xs:size-3" />
        </span>
        <span>
          <span className="block text-xs leading-[1.15] max-xs:text-[11px]">
            No thanks,
            <br />
            cancel anyway
          </span>
        </span>
      </button>

      {/* Stay / Resolve button */}
      {isPastDue ? (
        <button
          type="button"
          onClick={onResolvePayment}
          disabled={isProcessing}
          className={cn(stayButton({ variant: "resolve" }))}
        >
          <span data-icn className="w-7 h-7 rounded-[7px] inline-flex items-center justify-center grow-0 shrink-0 basis-7 bg-white/15 text-white max-xs:w-6 max-xs:h-6 max-xs:basis-6 max-xs:rounded-md">
            <Lock size={16} className="max-xs:size-3" />
          </span>
          <span>
            <span className="block text-xs leading-[1.15] max-xs:text-[11px]">Resolve payment</span>
            <span className="block text-2xs font-medium opacity-75 mt-px tracking-normal max-xs:text-[9px]">Keep your spot in the draw</span>
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onRedeem}
          disabled={isProcessing}
          className={cn(stayButton({ variant: "redeem" }))}
        >
          <span data-icn className="w-7 h-7 rounded-[7px] inline-flex items-center justify-center grow-0 shrink-0 basis-7 bg-white/15 text-white max-xs:w-6 max-xs:h-6 max-xs:basis-6 max-xs:rounded-md">
            <Lock size={16} className="max-xs:size-3" />
          </span>
          <span>
            <span className="block text-xs leading-[1.15] max-xs:text-[11px]">{isProcessing ? "Adding bonus entries…" : "Keep me in the draw"}</span>
            <span className="block text-2xs font-medium opacity-75 mt-px tracking-normal max-xs:text-[9px]">Stay + 100 bonus entries</span>
          </span>
        </button>
      )}
    </div>
  );
};

export default ActionRow;
```

- [ ] **Step 2: Type-check + build**

```bash
npm run type-check 2>&1 | tail -3
npm run build 2>&1 | tail -5
```
Expected: clean.

---

## Task 8: Build `DowngradeCard.tsx` with CVA tier variants

**Files:**
- Create: `src/components/modals/CancellationUpsellModal/DowngradeCard.tsx`

Reads:
- `src/components/modals/CancellationUpsellModal.tsx` lines 423-471 (DowngradeCard JSX), 932-1082 (downgrade CSS), and 1085-1117 (tier theme blocks)

Tier-themed card with corner badge icon, switch-plan CTA, 3 checks at bottom. CVA encodes the 3 tiers: `tradie` (cyan), `foreman` (yellow), `boss` (red).

- [ ] **Step 1: Write the component**

```tsx
"use client";

import React from "react";
import Image from "next/image";
import { ArrowRight, Check } from "lucide-react";
import { cva } from "class-variance-authority";
import { cn } from "@/utils/cn";
import { type PackageIconData } from "@/utils/images/package-icons";

export type Tier = "tradie" | "foreman" | "boss";

interface DowngradeCardProps {
  tier: Tier;
  packageName: string;
  /** Optional savings copy, e.g. "Save $19/mo". Renders as middle check when present. */
  saveLabel?: string;
  hasMembershipEntries: boolean;
  accumulatedEntries: number;
  isProcessing: boolean;
  /** Tier icon (e.g. tool-belt graphic). */
  icon: PackageIconData | null;
  onSwitchPlan: () => void;
}

const card = cva(
  "relative rounded-[14px] px-3.5 py-3 pt-3.5 text-white before:absolute before:inset-0 before:rounded-[inherit] before:pointer-events-none max-xs:px-2.5 max-xs:py-2.5 max-xs:rounded-xl bg-gradient-to-b from-[#161618] to-neutral-950",
  {
    variants: {
      tier: {
        tradie: "before:bg-[radial-gradient(circle_at_0%_50%,rgba(0,194,237,0.22),transparent_60%)]",
        foreman: "before:bg-[radial-gradient(circle_at_0%_50%,rgba(255,210,0,0.22),transparent_60%)]",
        boss: "before:bg-[radial-gradient(circle_at_0%_50%,rgba(238,0,0,0.24),transparent_60%)]",
      },
    },
  }
);

const badge = cva(
  "absolute -top-2.5 -left-2 z-[3] w-[46px] h-[46px] rounded-xl border-2 border-white/95 inline-flex items-center justify-center p-[5px] -rotate-[4deg] max-xs:-top-2 max-xs:-left-1.5 max-xs:w-[38px] max-xs:h-[38px] max-xs:rounded-[10px] max-xs:p-[3px]",
  {
    variants: {
      tier: {
        tradie: "bg-gradient-to-br from-[#00c2ed] to-[#5ca9ec] shadow-[0_8px_22px_rgba(0,194,237,0.45),0_0_0_1px_rgba(0,194,237,0.5)]",
        foreman: "bg-gradient-to-br from-[#ffe066] to-[#ffd200] shadow-[0_8px_22px_rgba(255,210,0,0.5),0_0_0_1px_rgba(255,210,0,0.5)]",
        boss: "bg-gradient-to-br from-[#ff4444] to-red-600 shadow-[0_8px_22px_rgba(238,0,0,0.5),0_0_0_1px_rgba(238,0,0,0.5)]",
      },
    },
  }
);

const accent = cva("font-extrabold", {
  variants: {
    tier: {
      tradie: "text-[#5ce0ff]",
      foreman: "text-[#ffe066]",
      boss: "text-[#ff6b6b]",
    },
  },
});

const cta = cva(
  "grow-0 shrink-0 font-sans font-extrabold text-[11px] tracking-[0.08em] px-3 py-[9px] rounded-[9px] uppercase inline-flex items-center gap-1.5 whitespace-nowrap transition-all duration-150 hover:not-disabled:-translate-y-px hover:not-disabled:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed max-xs:text-2xs max-xs:px-2.5 max-xs:py-1.75 max-xs:tracking-[0.06em] max-xs:gap-0",
  {
    variants: {
      tier: {
        tradie: "bg-gradient-to-br from-[#5ca9ec] to-[#00c2ed] text-white shadow-[0_6px_14px_rgba(0,194,237,0.45)]",
        foreman: "bg-gradient-to-br from-[#ffe066] to-[#ffd200] text-neutral-950 shadow-[0_6px_14px_rgba(255,210,0,0.45)]",
        boss: "bg-gradient-to-br from-[#ff3333] to-red-600 text-white shadow-[0_6px_14px_rgba(238,0,0,0.45)]",
      },
    },
  }
);

const checkColor = cva("flex-shrink-0 basis-[11px]", {
  variants: {
    tier: {
      tradie: "text-[#5ce0ff]",
      foreman: "text-[#ffe066]",
      boss: "text-[#ff6b6b]",
    },
  },
});

const DowngradeCard: React.FC<DowngradeCardProps> = ({ tier, packageName, saveLabel, hasMembershipEntries, accumulatedEntries, isProcessing, icon, onSwitchPlan }) => {
  return (
    <>
      {/* Divider with centered text */}
      <div className="text-center text-[9px] font-extrabold tracking-[0.22em] uppercase text-neutral-600 my-3 mb-2 relative max-xs:my-2 max-xs:mb-1.5 max-xs:text-[8px] before:content-[''] before:absolute before:left-0 before:right-0 before:top-1/2 before:h-px before:bg-neutral-200 before:z-[1]">
        <span className="bg-white px-3 relative z-[2]">Not feeling the price?</span>
      </div>

      <div className={cn(card({ tier }))}>
        {/* Corner badge */}
        <div className={cn(badge({ tier }))} aria-hidden>
          {icon ? (
            <Image src={icon} alt="" width={48} height={48} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          ) : null}
        </div>

        {/* Row: text + CTA */}
        <div className="relative z-[2] flex items-center gap-2.5 pl-11 min-h-[36px] max-xs:pl-9 max-xs:gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-extrabold text-sm tracking-[0.02em] leading-tight mb-0.5 max-xs:text-xs">
              Switch to <span className={cn(accent({ tier }))}>{packageName}</span>
            </div>
            <div className="text-[11px] text-white/65 leading-[1.35] max-xs:text-2xs">Pay less, drop a tier — keep every entry.</div>
          </div>
          <button
            type="button"
            onClick={onSwitchPlan}
            disabled={isProcessing}
            className={cn(cta({ tier }))}
          >
            <span>Switch plan</span>
            <span className="inline-flex items-center max-xs:hidden" aria-hidden><ArrowRight size={12} strokeWidth={2.5} /></span>
          </button>
        </div>

        {/* Checks row — 3 ticks distributed start/center/end */}
        <div className="relative z-[2] mt-2.5 pt-2.5 border-t border-dashed border-white/10 grid grid-cols-3 gap-1.5 text-2xs text-white/85 max-xs:mt-2 max-xs:pt-2 max-xs:gap-1 max-xs:text-[9px]">
          <span className="inline-flex items-center gap-1 font-semibold whitespace-nowrap overflow-hidden text-ellipsis min-w-0 justify-self-start">
            <Check size={11} strokeWidth={3.5} className={cn(checkColor({ tier }))} />
            {hasMembershipEntries ? `${accumulatedEntries.toLocaleString()} entries stay` : "Entries stay"}
          </span>
          {saveLabel ? (
            <span className="inline-flex items-center gap-1 font-semibold whitespace-nowrap overflow-hidden text-ellipsis min-w-0 justify-self-center">
              <Check size={11} strokeWidth={3.5} className={cn(checkColor({ tier }))} />
              {saveLabel}
            </span>
          ) : (
            // Empty placeholder to keep grid alignment
            <span />
          )}
          <span className="inline-flex items-center gap-1 font-semibold whitespace-nowrap overflow-hidden text-ellipsis min-w-0 justify-self-end">
            <Check size={11} strokeWidth={3.5} className={cn(checkColor({ tier }))} />
            Cancel anytime
          </span>
        </div>
      </div>
    </>
  );
};

export default DowngradeCard;
```

- [ ] **Step 2: Type-check + build**

```bash
npm run type-check 2>&1 | tail -3
npm run build 2>&1 | tail -5
```
Expected: clean.

---

## Task 9: Build `TrustBar.tsx`

**Files:**
- Create: `src/components/modals/CancellationUpsellModal/TrustBar.tsx`

Reads:
- `src/components/modals/CancellationUpsellModal.tsx` lines 474-488 (TrustBar JSX) and 1119-1167 (TrustBar CSS)

3-cell grid with vertical separators. Each cell: icon + label (with strong + secondary line).

- [ ] **Step 1: Write the component**

```tsx
"use client";

import React from "react";
import { ShieldCheck, Award, Lock } from "lucide-react";

const TrustBar: React.FC = () => {
  return (
    <div className="bg-neutral-50 border-t border-neutral-200 px-4 py-2.5 grid grid-cols-3 gap-0 max-xs:px-2 max-xs:py-1.5">
      {/* Cell 1: SSL */}
      <div className="flex items-center gap-2 text-2xs text-neutral-600 leading-[1.3] px-2.5 relative max-xs:text-[8px] max-xs:gap-1 max-xs:px-1">
        <span className="grow-0 shrink-0 basis-5 w-5 h-5 rounded-[5px] bg-white border border-neutral-200 inline-flex items-center justify-center text-red-700 max-xs:basis-[18px] max-xs:w-[18px] max-xs:h-[18px] max-xs:rounded">
          <ShieldCheck size={12} className="max-xs:size-2.5" />
        </span>
        <span className="inline-flex flex-col min-w-0">
          <strong className="text-neutral-950 font-bold block">SSL secure</strong>
          Entries safe
        </span>
      </div>

      {/* Cell 2: NTP — separator on left */}
      <div className="flex items-center gap-2 text-2xs text-neutral-600 leading-[1.3] px-2.5 relative before:content-[''] before:absolute before:left-0 before:top-1 before:bottom-1 before:w-px before:bg-neutral-200 max-xs:text-[8px] max-xs:gap-1 max-xs:px-1">
        <span className="grow-0 shrink-0 basis-5 w-5 h-5 rounded-[5px] bg-white border border-neutral-200 inline-flex items-center justify-center text-red-700 max-xs:basis-[18px] max-xs:w-[18px] max-xs:h-[18px] max-xs:rounded">
          <Award size={12} className="max-xs:size-2.5" />
        </span>
        <span className="inline-flex flex-col min-w-0">
          <strong className="text-neutral-950 font-bold block">NTP/16264</strong>
          Govt-certified
        </span>
      </div>

      {/* Cell 3: Cancel anytime — separator on left */}
      <div className="flex items-center gap-2 text-2xs text-neutral-600 leading-[1.3] px-2.5 relative before:content-[''] before:absolute before:left-0 before:top-1 before:bottom-1 before:w-px before:bg-neutral-200 max-xs:text-[8px] max-xs:gap-1 max-xs:px-1">
        <span className="grow-0 shrink-0 basis-5 w-5 h-5 rounded-[5px] bg-white border border-neutral-200 inline-flex items-center justify-center text-red-700 max-xs:basis-[18px] max-xs:w-[18px] max-xs:h-[18px] max-xs:rounded">
          <Lock size={12} className="max-xs:size-2.5" />
        </span>
        <span className="inline-flex flex-col min-w-0">
          <strong className="text-neutral-950 font-bold block">Cancel anytime</strong>
          No commitment
        </span>
      </div>
    </div>
  );
};

export default TrustBar;
```

- [ ] **Step 2: Type-check + build**

```bash
npm run type-check 2>&1 | tail -3
npm run build 2>&1 | tail -5
```
Expected: clean.

---

## Task 10: Build `index.tsx` orchestrator + atomic swap (delete old file)

**Files:**
- Create: `src/components/modals/CancellationUpsellModal/index.tsx`
- Delete: `src/components/modals/CancellationUpsellModal.tsx`

The orchestrator: state, effects, API call, optimistic cache update, prop assembly. Wires sub-components via `ModalContainer` (using the new `zIndex` prop from Task 1). PRESERVES every effect, callback, and state-management detail from the original file.

- [ ] **Step 1: Read the original file's logic sections to mirror**

Run: `sed -n '1,260p' src/components/modals/CancellationUpsellModal.tsx`

Confirm you can identify:
- Imports (lines 1-12)
- Props interface (lines 24-41)
- Helper constants/utilities (lines 14-65)
- Component function (lines 66-77)
- All hooks: useState (78-79), useLoading (80), useEntryRewardToast (81), useToast (82), useSession (83), useQueryClient (84), userId (85)
- Helper computations (87-110): downgradeTier, downgradeIcon, featuredPrize, segments, hasMembershipEntries
- useEffect entry animation (113-120)
- useEffect scroll lock + escape (122-137) — moved to ModalContainer behaviour
- useEffect query invalidation (140-147)
- handleRedeem (149-203)
- handleDecline, handleSwitchPlan, handleResolvePayment (205-217)
- Early return on !isOpen (219)
- Computed view props (221-235): entriesLabelHero, heroEntriesCopy, showSpotCell, drawCloseText
- Render (237-490)

- [ ] **Step 2: Write the new orchestrator**

Use Write tool. EXACT content for `src/components/modals/CancellationUpsellModal/index.tsx`:

```tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useLoading } from "@/contexts/LoadingContext";
import { useEntryRewardToast } from "@/hooks/useEntryRewardToast";
import { useToast } from "@/components/ui/Toast";
import { queryKeys } from "@/lib/queryKeys";
import { getPackageIconByName, type PackageIconData } from "@/utils/images/package-icons";
import { PRIZE_CATALOG } from "@/config/prizes";
import { cn } from "@/utils/cn";
import Hero from "./Hero";
import LoseGrid from "./LoseGrid";
import Banner from "./Banner";
import ActionRow from "./ActionRow";
import DowngradeCard, { type Tier } from "./DowngradeCard";
import TrustBar from "./TrustBar";
import styles from "./hero.module.css";

const CANCELLATION_UPSELL_ENTRIES = 100;

interface DowngradeOption {
  packageName: string;
  saveLabel?: string;
  onConfirm: () => void;
}

interface CancellationUpsellModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRedeem: () => void;
  onDecline: () => void;
  /** Subscription is past_due / has a failed renewal. Switches CTA to "Resolve payment", drops the +100 bonus. */
  isPastDue?: boolean;
  /** Caller for the "Resolve payment" CTA when `isPastDue`. */
  onResolvePayment?: () => void;
  /** Locked-in entries the user has accumulated for the current major draw. */
  accumulatedEntries?: number;
  /** Days remaining until the next major draw closes. */
  daysUntilDraw?: number;
  /** Pretty draw close label, e.g. "Fri 26 Dec". */
  drawCloseLabel?: string;
  /** Downgrade target — render the tier-coloured "Switch plan" card. Tier is derived from `packageName`. */
  downgrade?: DowngradeOption;
}

const TIER_FROM_NAME = (name?: string): Tier => {
  const lower = (name || "").toLowerCase();
  if (lower.includes("boss")) return "boss";
  if (lower.includes("foreman")) return "foreman";
  return "tradie";
};

const TOOLSET_LABEL: Record<string, string> = {
  milwaukee: "Milwaukee",
  dewalt: "DeWalt",
  makita: "Makita",
  ryobi: "Ryobi",
};

/** "milwaukee-sidchrome" → "Milwaukee Combo + $5k cash". Drops the toolbox name to keep the label tight (3 lines max). */
const formatPrizeShortLabel = (slug: string): string => {
  const [tools] = slug.split("-");
  const toolsetLabel = TOOLSET_LABEL[tools] ?? tools;
  return `${toolsetLabel} Combo + $5k cash`;
};

const NON_CASH_PRIZE_SLUGS = PRIZE_CATALOG.map((p) => p.slug).filter((s) => s !== "cash-prize");

const CancellationUpsellModal: React.FC<CancellationUpsellModalProps> = ({
  isOpen,
  onClose,
  onRedeem,
  onDecline,
  isPastDue = false,
  onResolvePayment,
  accumulatedEntries = 0,
  daysUntilDraw,
  drawCloseLabel,
  downgrade,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { showLoading, hideLoading } = useLoading();
  const showEntryReward = useEntryRewardToast();
  const { showToast } = useToast();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const userId = session?.user?.id;

  const downgradeTier: Tier | null = downgrade ? TIER_FROM_NAME(downgrade.packageName) : null;
  const downgradeIcon: PackageIconData | null = downgrade
    ? getPackageIconByName(downgrade.packageName, "subscription")
    : null;

  /** Random non-cash prize per modal open — re-rolls each time the user re-opens the modal. */
  const featuredPrize = useMemo(() => {
    if (!isOpen) return null;
    const slug = NON_CASH_PRIZE_SLUGS[Math.floor(Math.random() * NON_CASH_PRIZE_SLUGS.length)];
    const entry = PRIZE_CATALOG.find((p) => p.slug === slug);
    return {
      slug,
      shortLabel: formatPrizeShortLabel(slug),
      image: entry?.cardBackgroundImage || entry?.gallery?.[0]?.src || "/images/majordraws/milwaukee-set/MILWAUKEE.webp",
    };
  }, [isOpen]);

  const hasMembershipEntries = accumulatedEntries > 0;

  /** Entry animation gate. */
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setIsVisible(true), 10);
      return () => clearTimeout(timer);
    }
    setIsVisible(false);
    return undefined;
  }, [isOpen]);

  /** Refresh user-facing data so we never show a stale entry count or stale downgrade options. */
  useEffect(() => {
    if (!isOpen) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.current });
    if (userId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.userStats(userId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.account(userId) });
    }
  }, [isOpen, userId, queryClient]);

  const handleRedeem = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    showLoading("Processing Reward", "", [
      "Verifying eligibility",
      "Granting free entries",
      "Adding entries to major draw",
      "Updating your dashboard",
    ]);

    try {
      const response = await fetch("/api/cancellation-upsell/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to redeem free entries");

      hideLoading();

      if (userId) {
        queryClient.setQueryData(queryKeys.majorDraw.userStats(userId), (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const o = old as Record<string, unknown>;
          return {
            ...o,
            totalEntries: (Number(o.totalEntries) || 0) + CANCELLATION_UPSELL_ENTRIES,
            currentDrawEntries: (Number(o.currentDrawEntries) || 0) + CANCELLATION_UPSELL_ENTRIES,
            oneTimeEntries: (Number(o.oneTimeEntries) || 0) + CANCELLATION_UPSELL_ENTRIES,
          };
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.userStats(userId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.users.account(userId) });
      }

      showEntryReward({
        entries: CANCELLATION_UPSELL_ENTRIES,
        drawType: "major",
        source: "cancellation-upsell-redeem",
      });
      onRedeem();
    } catch (error) {
      console.error("Failed to redeem free entries:", error);
      hideLoading();
      showToast({
        type: "error",
        title: "Couldn't redeem entries",
        message: error instanceof Error ? error.message : "Failed to redeem free entries. Please try again.",
        duration: 8000,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDecline = () => {
    onDecline();
    onClose();
  };

  const handleSwitchPlan = () => {
    if (!downgrade) return;
    downgrade.onConfirm();
  };

  const handleResolvePayment = () => {
    onResolvePayment?.();
  };

  if (!isOpen) return null;

  /** "Locked-in" copy varies by state — past-due / no-renewal members lose accumulated entries on cancel,
   *  not entries-already-in-the-draw, so the wording is softer. */
  const entriesLabelHero = isPastDue || !hasMembershipEntries ? "accumulated entries" : "entries";
  const heroEntriesCopy = hasMembershipEntries ? (
    <>
      You&apos;ve got <strong className="text-premium-gold font-bold">{accumulatedEntries.toLocaleString()} {entriesLabelHero}</strong> locked in the major draw.
    </>
  ) : (
    <>Hold up — there&apos;s still time to keep your spot in the major draw.</>
  );

  const showSpotCell = !isPastDue && hasMembershipEntries;
  const drawCloseText = drawCloseLabel
    ? `Draw closes ${drawCloseLabel}`
    : "Draw closes at the end of the cycle";

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-2 sm:p-4 overflow-hidden"
      style={{ zIndex: 80 }}
    >
      <div
        className={cn(
          "absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300",
          isVisible ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
        aria-hidden
      />

      <div
        className={cn(
          "relative transform transition-all duration-300 ease-out w-full max-w-[600px] font-sans text-neutral-950 antialiased max-h-[calc(100dvh-16px)] flex max-xs:max-h-[calc(100dvh-8px)]",
          isVisible ? "scale-100 opacity-100 translate-y-0" : "scale-95 opacity-0 translate-y-4"
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cm-headline"
      >
        {/* Close button */}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/55 text-white/95 inline-flex items-center justify-center border border-white/20 transition-all duration-150 backdrop-blur-md hover:bg-black/75 hover:text-white max-xs:top-2 max-xs:right-2 max-xs:w-[26px] max-xs:h-[26px]"
        >
          <X size={14} strokeWidth={2} />
        </button>

        {/* Frame: scrollable container with custom scrollbar */}
        <div className={cn("relative rounded-[22px] bg-white shadow-[0_30px_80px_rgba(0,0,0,0.45),0_8px_24px_rgba(0,0,0,0.2)] w-full max-h-full overflow-y-auto overflow-x-hidden [-webkit-overflow-scrolling:touch] max-xs:rounded-2xl", styles.scrollFrame)}>
          <Hero entriesCopy={heroEntriesCopy} accumulatedEntries={accumulatedEntries} />

          <LoseGrid
            isPastDue={isPastDue}
            hasMembershipEntries={hasMembershipEntries}
            accumulatedEntries={accumulatedEntries}
            featuredPrizeShortLabel={featuredPrize?.shortLabel ?? "major draw"}
            daysUntilDraw={daysUntilDraw}
            drawCloseText={drawCloseText}
            showSpotCell={showSpotCell}
          />

          <Banner />

          <div className="px-4 max-xs:px-3">
            <ActionRow
              isPastDue={isPastDue}
              isProcessing={isProcessing}
              onDecline={handleDecline}
              onRedeem={handleRedeem}
              onResolvePayment={handleResolvePayment}
            />
          </div>

          {downgrade && downgradeTier && (
            <div className="px-4 max-xs:px-3">
              <DowngradeCard
                tier={downgradeTier}
                packageName={downgrade.packageName}
                saveLabel={downgrade.saveLabel}
                hasMembershipEntries={hasMembershipEntries}
                accumulatedEntries={accumulatedEntries}
                isProcessing={isProcessing}
                icon={downgradeIcon}
                onSwitchPlan={handleSwitchPlan}
              />
            </div>
          )}

          <TrustBar />
        </div>
      </div>
    </div>
  );
};

export default CancellationUpsellModal;
```

NOTE: I'm intentionally NOT using `ModalContainer` for the OUTER wrapper — the cancellation modal has unique chrome (full-bleed dark hero, custom scroll behaviour, deliberate `z-[80]`) that doesn't fit ModalContainer's white-card-with-shadow shell. The body/html `overflow:hidden` lock and Escape key handler from the original are dropped here because we're handling them manually below. **CORRECTION**: actually the spec said adopt ModalContainer. Let me reconsider…

Actually re-reading the spec D5: "swaps its bespoke `<div className="fixed inset-0 z-[80]…">` for `<ModalContainer presentation="dialog" className="!z-[80]" disablePortal={false}>`." OK so the spec wants ModalContainer adoption.

But ModalContainer has a built-in white-card chrome that conflicts with the modal's full-bleed hero design. The right approach: pass the ModalContainer a `className` that overrides its default backgrounds, OR use a custom `presentation` mode if one exists.

This is genuinely tricky because the cancellation modal's outermost frame has a black hero at top + white sections below, while ModalContainer assumes white-bg + content-padding.

**Decision for the implementer:** Do NOT adopt ModalContainer in this Task 10 if the integration is non-trivial. Keep the bespoke wrapper as written above (with the new `zIndex={80}` style attribute). Add a brief code comment noting that ModalContainer adoption is deferred to a follow-up because the cancellation modal's full-bleed hero doesn't fit the standard chrome.

The spec's D5 was a DEFAULT recommendation; the reviewer's note about the modal having unique full-bleed chrome flagged exactly this concern. Defer adoption rather than force a bad fit.

If you (the implementer) DO want to attempt ModalContainer adoption: read ModalContainer.tsx in full to understand its presentation modes and content slots before wiring. If it accommodates a full-bleed presentation, use it. If not, defer.

For Task 10's actual deliverable: write the orchestrator AS SHOWN ABOVE (with bespoke wrapper). Add the comment. Move on.

- [ ] **Step 3: Re-add Escape key handler and body overflow lock**

The original used a useEffect at lines 122-137 to add an Escape listener and lock body scroll. This was OMITTED in the orchestrator code above. Add it back. After the existing `useEffect` blocks in the orchestrator (around the area with the entry animation effect), add:

```ts
  /** Body scroll lock + Escape key handler. Mirrors original L122-L137. */
  useEffect(() => {
    if (!isOpen) return;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEscape);
    return () => {
      // Always clear to empty — capturing the previous value risks perpetuating a bad state
      // left by another modal that didn't clean up. Matches SubscriptionManagementModal's pattern.
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onEscape);
    };
  }, [isOpen, onClose]);
```

- [ ] **Step 4: Delete the old file**

```bash
git rm src/components/modals/CancellationUpsellModal.tsx
```

(Or `rm` if you want to keep git status simple.)

- [ ] **Step 5: Verify imports still resolve**

Run: `grep -rn "from .@/components/modals/CancellationUpsellModal" src/ --include="*.tsx" --include="*.ts"`

Expected: 1 hit (`SubscriptionManagementModal.tsx:1443`) plus the gallery (`ModalsGalleryClient.tsx:48`). The import path resolves to the new `<folder>/index.tsx` automatically.

- [ ] **Step 6: Type-check + build**

```bash
npm run type-check 2>&1 | tail -3
npm run build 2>&1 | tail -10
```

Expected: clean. If TypeScript complains about the import resolving differently, check `tsconfig.json` `moduleResolution` (should be `bundler` or `node16` which both resolve folder/index.tsx).

If build complains about a `<style jsx>` no longer being scoped (e.g. global classname collision), find the source and either rename to a `data-*` attr or add a scoped className.

---

## Task 11: Visual parity verification (controller-only — manual A/B in browser)

**Files:** None modified.

This task is a checkpoint, not an implementation step. The controller (or human) walks the gallery in a browser to verify each of the 12 prop combos renders byte-equivalently.

- [ ] **Step 1: Start the dev server (if not already running)**

```bash
npm run dev
```

Wait for "Ready in Xms".

- [ ] **Step 2: Open `/dev/modals` in a browser**

URL: `http://localhost:3000/dev/modals` (or 3001 if 3000 is taken).

- [ ] **Step 3: Open each of the 12 CancellationUpsell variants from the gallery sidebar**

For each variant:
- Verify the modal opens
- Compare against the production rendering OR a screenshot of the original (whichever is available)
- Check at desktop (>540px) AND mobile (≤540px) widths
- Verify: hero composite gradient, eyebrow row, headline typography, prize banner image, progress bar with 13/14 segments filled, LoseGrid 3-cell layout with separators, banner gradient + star icon, ActionRow buttons (red gradient + cancel) with `+100 BONUS` badge on `redeem` variants only, DowngradeCard tier theming (cyan/yellow/red), TrustBar 3-cell row

- [ ] **Step 4: Functional test the cancel flow**

Click the "Keep me in the draw" button (in any non-past-due variant). Confirm:
- Loading state shows ("Processing Reward")
- (May fail with 401 since you're not authenticated — that's OK, this is a UI check)
- Loading hides on response
- For successful response: toast appears with "+100 entries"
- For error response: error toast appears

Click "Cancel anyway" — confirm onDecline runs and modal closes.

Click a "Switch plan" CTA on a downgrade variant — confirm onConfirm runs (modal stays open in the gallery; in production the parent handles).

- [ ] **Step 5: Browser DevTools spot-check on suspicious elements**

If any element looks off:
- Right-click → Inspect
- Compare computed CSS to what the original generated
- File the specific concern with file:line references

- [ ] **Step 6: Report status**

If everything looks parity: PROCEED.
If anything looks off: STOP, report the specific element + screenshot, fix in a follow-up subagent dispatch before proceeding.

---

## Task 12: Add smoke regression test

**Files:**
- Create: `src/components/modals/CancellationUpsellModal/__tests__/CancellationUpsellModal.test.ts`
- Modify: `package.json` (add npm script)

A smoke test that confirms the modal can be rendered (without throwing) in all 12 prop combinations. Catches obvious bugs (missing import, undefined access, broken JSX) without trying to verify visual output.

NOTE: This is a `tsx` test in the project's existing pattern, not jest/vitest.

- [ ] **Step 1: Write the test**

Use Write tool. EXACT content for `src/components/modals/CancellationUpsellModal/__tests__/CancellationUpsellModal.test.ts`:

```ts
/**
 * Smoke test for CancellationUpsellModal. Renders the component in all 12
 * meaningful prop combos via react-dom/server's renderToString — catches
 * import errors, undefined access, broken JSX, missing context providers.
 *
 * This does NOT assert on visual output. Visual parity is verified manually
 * via /dev/modals (see Task 11 of plan-2).
 */

import assert from "node:assert/strict";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import CancellationUpsellModal from "../index";

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

const noop = () => {};

interface Combo {
  name: string;
  props: React.ComponentProps<typeof CancellationUpsellModal>;
}

const combos: Combo[] = [
  {
    name: "default — Tradie downgrade with saveLabel",
    props: {
      isOpen: true, onClose: noop, onRedeem: noop, onDecline: noop,
      accumulatedEntries: 60, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec",
      downgrade: { packageName: "Tradie", saveLabel: "Save $19/mo", onConfirm: noop },
    },
  },
  {
    name: "Foreman downgrade",
    props: {
      isOpen: true, onClose: noop, onRedeem: noop, onDecline: noop,
      accumulatedEntries: 60, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec",
      downgrade: { packageName: "Foreman", saveLabel: "Save $9/mo", onConfirm: noop },
    },
  },
  {
    name: "Boss downgrade",
    props: {
      isOpen: true, onClose: noop, onRedeem: noop, onDecline: noop,
      accumulatedEntries: 60, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec",
      downgrade: { packageName: "Boss", saveLabel: "Save $5/mo", onConfirm: noop },
    },
  },
  {
    name: "no saveLabel (middle check disappears)",
    props: {
      isOpen: true, onClose: noop, onRedeem: noop, onDecline: noop,
      accumulatedEntries: 60, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec",
      downgrade: { packageName: "Tradie", onConfirm: noop },
    },
  },
  {
    name: "no downgrade option",
    props: {
      isOpen: true, onClose: noop, onRedeem: noop, onDecline: noop,
      accumulatedEntries: 60, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec",
    },
  },
  {
    name: "0 accumulated entries (no-renewal copy)",
    props: {
      isOpen: true, onClose: noop, onRedeem: noop, onDecline: noop,
      accumulatedEntries: 0, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec",
      downgrade: { packageName: "Tradie", saveLabel: "Save $19/mo", onConfirm: noop },
    },
  },
  {
    name: "past due with entries",
    props: {
      isOpen: true, onClose: noop, onRedeem: noop, onDecline: noop,
      isPastDue: true, onResolvePayment: noop,
      accumulatedEntries: 60, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec",
      downgrade: { packageName: "Tradie", saveLabel: "Save $19/mo", onConfirm: noop },
    },
  },
  {
    name: "past due with 0 entries",
    props: {
      isOpen: true, onClose: noop, onRedeem: noop, onDecline: noop,
      isPastDue: true, onResolvePayment: noop,
      accumulatedEntries: 0, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec",
    },
  },
  {
    name: "no daysUntilDraw",
    props: {
      isOpen: true, onClose: noop, onRedeem: noop, onDecline: noop,
      accumulatedEntries: 60, drawCloseLabel: "Fri 26 Dec",
      downgrade: { packageName: "Tradie", saveLabel: "Save $19/mo", onConfirm: noop },
    },
  },
  {
    name: "no drawCloseLabel",
    props: {
      isOpen: true, onClose: noop, onRedeem: noop, onDecline: noop,
      accumulatedEntries: 60, daysUntilDraw: 5,
      downgrade: { packageName: "Tradie", saveLabel: "Save $19/mo", onConfirm: noop },
    },
  },
  {
    name: "long entries (12,500)",
    props: {
      isOpen: true, onClose: noop, onRedeem: noop, onDecline: noop,
      accumulatedEntries: 12500, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec",
      downgrade: { packageName: "Tradie", saveLabel: "Save $19/mo", onConfirm: noop },
    },
  },
  {
    name: "isOpen=false (renders null without error)",
    props: {
      isOpen: false, onClose: noop, onRedeem: noop, onDecline: noop,
    },
  },
];

console.log("\nCancellationUpsellModal smoke test");

for (const combo of combos) {
  test(combo.name, () => {
    // Wrap in providers required by the modal's hooks.
    // We don't need a working session — just non-throwing context.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const tree = React.createElement(
      SessionProvider,
      { session: null },
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(CancellationUpsellModal, combo.props)
      )
    );
    // renderToString throws if any component crashes during render.
    // We don't compare the output — just verify it produces a string.
    const html = renderToString(tree);
    assert.ok(typeof html === "string", "renderToString must return a string");
    if (combo.props.isOpen) {
      assert.ok(html.length > 0, "isOpen=true should produce non-empty markup");
    }
  });
}

console.log("\n========================================");
console.log(`Tests run: ${testsRun}, failed: ${testsFailed}`);
console.log("========================================");
process.exit(testsFailed > 0 ? 1 : 0);
```

NOTE: This test may need additional context providers (e.g. `LoadingContext`, `ToastContext`) if the hooks throw without them. If the test fails with "useLoading must be used within a LoadingProvider" or similar, wrap the tree with the missing providers. Find them in `src/contexts/` and `src/components/ui/Toast`.

- [ ] **Step 2: Add npm script**

Edit `package.json`. Add to `scripts`:

```json
"test:cancellation-upsell": "tsx src/components/modals/CancellationUpsellModal/__tests__/CancellationUpsellModal.test.ts",
```

- [ ] **Step 3: Run the test**

```bash
npm run test:cancellation-upsell
```

Expected: 12/12 passing, exit 0. If any throw on missing context, add providers and re-run.

If `react-dom/server` complains about server vs client component (the modal uses `"use client"`), this test approach may not work. Fallback: write a simpler test that just imports the component and asserts it's a function (i.e. the file's module exports validate). Adjust.

---

## Task 13: Update domain manifest + register the new test

**Files:**
- Modify: `CLAUDE.md` (Domain Manifest)

- [ ] **Step 1: Read the current `subscription` and `dev-tooling` domain entries**

Run: `grep -A 25 '"subscription":' CLAUDE.md | head -30`

Confirm `subscription.paths` includes the modals path or specifically `src/components/modals/CancellationUpsellModal*`. If not, the cancellation modal is currently uncovered by the manifest — fix.

- [ ] **Step 2: Ensure the new folder is covered**

If `subscription.paths` doesn't already cover `src/components/modals/CancellationUpsellModal/**`, add it:

```json
"subscription": {
  "docs": "docs/subscription/",
  "paths": [
    ...existing paths,
    "src/components/modals/CancellationUpsellModal/**"
  ],
  "lastVerified": "2026-05-08"
}
```

If it's already covered (e.g. by `src/components/modals/**`), just bump `lastVerified` to `"2026-05-08"`.

- [ ] **Step 3: Bump the affected domains**

Set `lastVerified: "2026-05-08"` for:
- `subscription` (modal lives there)
- `dev-tooling` (ModalsGalleryClient.tsx changes)
- `shared-ui` (ModalContainer.tsx zIndex prop)

Set top-level `lastModified: "2026-05-08"` (probably already that).

- [ ] **Step 4: Validate JSON**

```bash
sed -n '/^```json$/,/^```$/{/^```/d; p}' CLAUDE.md | node -e "let s=''; process.stdin.on('data',c=>s+=c); process.stdin.on('end',()=>{try{JSON.parse(s); console.log('VALID');}catch(e){console.error('INVALID:', e.message); process.exit(1);}})"
```

Expected: `VALID`.

- [ ] **Step 5: Final lint + type-check + build + tests**

```bash
npm run lint 2>&1 | tail -5
npm run type-check 2>&1 | tail -3
npm run build 2>&1 | tail -8
npm run test:codemods 2>&1 | tail -3
npm run test:cancellation-upsell 2>&1 | tail -3
```

All exit 0 (lint may have pre-existing scripts/ errors — that's OK).

---

## Plan 2 verification gate

- [ ] **Step 1: Confirm files**

```bash
ls -la src/components/modals/CancellationUpsellModal/
```

Expected:
```
Hero.tsx
LoseGrid.tsx
Banner.tsx
ActionRow.tsx
DowngradeCard.tsx
TrustBar.tsx
hero.module.css
index.tsx
__tests__/
```

And: `ls src/components/modals/CancellationUpsellModal.tsx 2>&1` → "No such file" (deleted).

- [ ] **Step 2: Confirm line counts**

Each sub-component should be ≤120 LOC. The orchestrator should be ≤220 LOC. Total folder size should be ~700-800 LOC (vs 1,495 for the original).

```bash
wc -l src/components/modals/CancellationUpsellModal/*.tsx src/components/modals/CancellationUpsellModal/__tests__/*.ts src/components/modals/CancellationUpsellModal/*.css
```

- [ ] **Step 3: Plan 2 done**

Working tree has accumulated changes (no commits during execution). Total diff vs Plan-1 head:
- 1 file deleted (the old monolith)
- ~10 files added (sub-components, CSS module, test)
- 2 files modified (ModalContainer, ModalsGalleryClient)
- 1 file modified (CLAUDE.md)
- 1 file modified (package.json — new npm script)

Ready for the user to review and authorize commits.

---

## Risks and rollback

- **If a sub-component's Tailwind output doesn't match the original CSS**: spot the diff in DevTools, fix the class string, re-test in the gallery. Each sub-component is small enough that fixes are surgical.
- **If the `:global()` → `data-*` rename causes child styling to drop**: check whether the original `<style jsx>` rules used `:global(.X)` to target child elements. Each such rule needs a corresponding `data-X` selector OR Tailwind utility on the child element. Audit rule-by-rule using lines 514-1167 of the original file.
- **If body scroll lock or Escape key handling breaks**: confirm Step 3 of Task 10 (re-adding the useEffect) was actually applied. The behavior must mirror lines 122-137 of the original.
- **If the test crashes on missing context**: add the missing provider to the test wrapper. Don't disable the test.
- **If visual parity fails on a SPECIFIC viewport (mobile or desktop)**: the `max-xs:` modifiers on each utility likely don't match the original `@media (max-width: 540px)` rules byte-for-byte. Audit the mobile block lines 1170-1399 of original; map each rule to the matching `max-xs:` Tailwind class.
- **If the codemod-introduced `red-675` token in a sub-component file isn't rendering**: the new sub-components don't have `red-675` since I'm using `red-600` and `red-700` in the CVA definitions. If a tier color came out wrong because I picked the wrong shade, fix in the CVA definition.
- **Atomic-swap rollback (Task 10 step 4)**: if the new `index.tsx` doesn't work, restore the old file with `git checkout HEAD -- src/components/modals/CancellationUpsellModal.tsx`. The old file is in HEAD (Plan 1 committed it).
