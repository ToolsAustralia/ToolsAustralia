# Admin Draws Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the four admin draws pages (`/admin/major-draw`, `/admin/mini-draws`, `/admin/draw-results`, `/admin/upcoming-draws`) and their modals to the `design_handoff_admin_draws` specification, without changing routing, permissions, or any existing capability — and add the one thing the design needs that the app cannot currently produce: **per-draw revenue**.

**Architecture:** The admin shell (280px sidebar, mobile drawer, top bar, theme toggle, scroll container) already exists in `AdminPage.tsx` and is shared by 25 other tabs — it is **not** rebuilt. The revamp lives entirely inside the four tab components plus a new set of shared draws primitives. Design tokens become CSS custom properties scoped to a `.admin-draws` root so nothing leaks into other tabs. Draw Results and Upcoming Draws collapse into **one** `DrawsListPage` driven by two configs (the prototype's own `isList` branch proves they are the same screen). All draws modals move into `src/components/modals/draws/` behind a barrel, and the four create/edit modal pairs merge into two mode-driven forms.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind (class dark mode), Mongoose, TanStack Query, `@dnd-kit` (already a dependency), `tsx` test scripts with `node:assert/strict`.

## Global Constraints

- **No schema, permission, or route changes.** New reads reuse existing models. `requirePermission("majorDraw.view")` / `"miniDraws.view"` gating stays exactly as-is on every route touched.
- **The URLs stay `/admin/<tab>`**, served by [`src/app/admin/[tab]/page.tsx`](../../../src/app/admin/[tab]/page.tsx) → `AdminPage.tsx`. Do **not** create `src/app/admin/major-draw/page.tsx` — the handoff's source map is wrong about this repo (see "Handoff corrections" below).
- **Do not port `DirectionM.dc.html`.** It is a design reference. Its inline styles, `sc-for`/`sc-if` tags and `renderVals()` are prototype scaffolding.
- **Do not port the prototype's sidebar.** It shows 4 nav items; the real `AdminSidebar` has 6 groups / 25 tabs driven by `ADMIN_TAB_GROUPS`.
- **Tokens, not literals.** Every colour and control height reads a CSS variable from Task 1. `if you add a control, give it a token, not a pixel value.`
- **Match the design copy verbatim**, with one exception: the error state's `GET /api/admin/draws · 504` must show the real endpoint (`/api/admin/major-draw/history`) and the real status.
- **Prefilled inputs use `defaultValue`, not `value`** — unless there is an `onChange`. A `value` prop with no `onChange` renders a field the admin cannot type into. Twelve fields in this design open with a value.
- **Desktop rows and mobile rows are separate markup for the same list.** Wire both to the same handler or one silently goes dead.
- **Console output:** production builds strip `console.log`/`info`/`debug`/`warn`. Use `console.error` for anything that must survive, including debugging on Vercel previews.
- **Docs are hook-enforced.** Every task touching `src/**` must update the matching `docs/<domain>/` file in the same commit. These tasks touch the **admin** domain (`docs/admin/`), plus **draws** (`docs/draws/`) and **shared-ui** (`docs/shared-ui/`) where noted. A `Stop` hook blocks otherwise.
- **No commits without authorization.** Rule 1 in `CLAUDE.md`. Commit steps below are written out, but only run them once the user has said `commit` / `push` / `ship it` this session.

---

## Handoff corrections (read before Task 1)

The design handoff's **Source map** names five files that do not exist in this repo. The real targets:

| Handoff says | Actual file |
|---|---|
| `src/app/admin/major-draw/page.tsx` + 3 siblings | [`src/app/admin/component/MajorDrawManagement.tsx`](../../../src/app/admin/component/MajorDrawManagement.tsx), [`MiniDrawManagement.tsx`](../../../src/app/admin/component/MiniDrawManagement.tsx), [`DrawResults.tsx`](../../../src/app/admin/component/DrawResults.tsx), [`UpcomingDraws.tsx`](../../../src/app/admin/component/UpcomingDraws.tsx) |
| `src/components/admin/AdminSidebar.tsx` | [`src/app/admin/component/AdminSidebar.tsx`](../../../src/app/admin/component/AdminSidebar.tsx) |
| `src/components/admin/MiniDrawCard.tsx` | Does not exist — private `MiniDrawCard` at `MiniDrawManagement.tsx:754` |
| `src/components/admin/QuickActionsCard.tsx` | [`src/app/admin/component/overview/sections/QuickActionsCard.tsx`](../../../src/app/admin/component/overview/sections/QuickActionsCard.tsx) |
| `src/app/api/admin/draws/select-winner/route.ts` | [`src/app/api/admin/major-draw/select-winner/route.ts`](../../../src/app/api/admin/major-draw/select-winner/route.ts) |
| `src/components/modals/WinnerSelectionModal.tsx` | Folder: [`src/components/modals/WinnerSelectionModal/index.tsx`](../../../src/components/modals/WinnerSelectionModal/index.tsx) |

## Decisions already made (do not re-litigate)

1. **Per-draw revenue: BUILD IT.** Task 2. Derived from `PaymentEvent`, refund-netted, windowed to match entry routing exactly.
2. **The KPI deltas (`+9%` / `+7%`) are DROPPED.** No prior-period comparison exists and inventing one is out of scope. Render the figure without a delta chip.
3. **Major Draw's "Edit prize" button is OMITTED.** The card renders the prize from the static `src/config/prizes` file; `MajorDraw.prize` in the DB is `@deprecated`. A button that edits a different, deprecated field than the one displayed is a trap. The prize card ships read-only.
4. **Participant rows STAY CLICKABLE.** The design specifies a read-only list; today the rows open the admin user modal via `useAdminUserModal`. Keep the click-through and the focus ring — losing a working drill-through to match a visual spec is a net regression.
5. **The Mini Draws card keeps all four actions.** The design's footer shows `Winner` + delete. `CSV export` and `Edit winner & testimony` also exist today and stay. The two-action footer is a visual target, not permission to delete working tools off a draw-night screen.
6. **`Remove winner` is a subordinated danger row in the inspector.** A hairline-separated ghost button below the two secondaries, `--danger` text, no fill, rendered only when `draw.winner?.userId` exists. The design's three actions (full-width primary over two secondaries) stay exactly as specified; the destructive action reads as clearly separate without being hidden behind a menu. It routes to the existing `ConfirmationModal`.
7. **The dead `useMajorDrawStats()` hook is deleted.** In scope — see the Cleanup task. It fetches `/api/major-draw/stats`, which does not exist, and nothing calls it. Its `MajorDrawStats` type (with `totalRevenue`, `topParticipants`) is what made per-draw revenue *look* implemented during the audit; leaving it is leaving the same trap for the next reader.

---

## File structure

**New — shared draws primitives** (`src/components/admin/draws/`). One responsibility each; all four pages consume them.

| File | Responsibility |
|---|---|
| `tokens.css` | The `.admin-draws` custom-property block (light + dark + desktop/mobile control heights). Imported once by `globals.css`. |
| `DrawsPageShell.tsx` | Page frame: `--m-pad` padding, `--m-gap` gaps, optional notice strip slot, content slot. |
| `DrawsToolbar.tsx` | Search input + filter dropdowns + action buttons row. Used by 3 pages. |
| `DrawsKpiStrip.tsx` | The 4-cell (2 on mobile) divider strip. |
| `DrawsTable.tsx` | Grid table + sticky header + sticky group headers + the four data states. |
| `DrawInspector.tsx` | The fixed 320px right panel (desktop) / bottom sheet (mobile). |
| `DrawStatusPill.tsx` | 21px status pill (Active green / Queued amber / Completed neutral). |

`DrawsPageShell` looks thin (padding + gap + a notice slot) but earns its file: it is the element that carries the `.admin-draws` class, so it is the **token scope boundary**. Every draws page must mount inside it or the tokens resolve to nothing.

There is deliberately **no** `useDrawsListState` hook. `DrawResults.tsx` and `UpcomingDraws.tsx` already own their `filters` / `pagination` state and their fetch callbacks; lifting half of that into a shared hook would split one piece of state across two files for no gain. The containers keep their state and pass it down.

**New — revenue** (`src/services/admin/drawRevenue.ts` + test). Pure window/bucket functions plus one thin DB wrapper.

**Moved — draws modals** (`src/components/modals/draws/`). Names are **preserved**; only the location changes, plus two merges. `src/components/modals/ui/**` primitives stay where they are and stay shared.

| New path | Was |
|---|---|
| `draws/index.ts` | new barrel |
| `draws/DrawModalShell.tsx` | new — eyebrow/title/close header, scrolling body, `--panel2` footer, pending + validation + bottom-sheet behaviour |
| `draws/WinnerSelectionModal/` | `modals/WinnerSelectionModal/` |
| `draws/WinnerEditModal.tsx` | `modals/WinnerEditModal.tsx` |
| `draws/AdminMajorDrawModal/` | `modals/AdminMajorDrawModal/` — **kept**, create-only (see Task 11) |
| `draws/MajorDrawEditModal.tsx` | `modals/MajorDrawEditModal.tsx` — **kept**, edit-only |
| `draws/sections/` | the major-draw field sections, lifted out of `AdminMajorDrawModal/` and shared by both |
| `draws/MiniDrawFormModal.tsx` | **merge** of `modals/AdminMiniDrawModal.tsx` (create) + `modals/MiniDrawEditModal.tsx` (edit) |
| `draws/ExportModal.tsx` | `modals/ExportModal.tsx` |
| `draws/ParticipantsModal.tsx` | `modals/ParticipantsModal.tsx` |
| `draws/DrawLockedModal.tsx` | new |

`ConfirmationModal.tsx` stays at `modals/` — it is used by 20+ non-draws callers.

**Modified:** the four tab components, `src/app/globals.css`, `tailwind.config.ts`, `src/app/api/admin/major-draw/history/route.ts`, `src/app/api/admin/major-draw/participants/route.ts`, `src/components/dev/ModalsGalleryClient.tsx`, `package.json`, `docs/admin/*`, `docs/draws/*`.

---

## Phase map

| Phase | Ships | Tasks |
|---|---|---|
| 0 | Draws modals grouped under `modals/draws/`. Mechanical, no visual change. | **10 — run this FIRST** |
| 1 | Token layer + revenue service + the two API gaps closed. Draw Results fully redesigned and working. | 1–5 |
| 2 | Upcoming Draws on the same component; Create-major-draw moved onto its toolbar. | 6–7 |
| 3 | Mini Draws card grid, keeping reorder / CSV / edit-winner. | 8 |
| 4 | Major Draw ribbon, gates, entry pool, rules. | 9 |
| 5 | `DrawModalShell`, the de-duplication, the locked notice, mobile. | 11–13 |

**Task 10 runs before Task 1**, despite its number. It is a pure `git mv` + import sweep with no visual change. Doing it first means Phases 1–4 write the final import paths once; doing it last means every page touched in those phases gets its imports rewritten a second time, for no benefit, in a commit that is already large. The number is left at 10 so it stays adjacent to the other modal tasks in this document.

---

# Phase 1 — Foundation + Draw Results

### Task 1: Design token layer

**Files:**
- Create: `src/components/admin/draws/tokens.css`
- Modify: `src/app/globals.css` (add one `@import`)
- Modify: `tailwind.config.ts` (add the `draws` screen)
- Docs: `docs/shared-ui/tailwind-conventions.md`

**Interfaces:**
- Produces: a `.admin-draws` class that exposes every token in `tokens.json` as a CSS custom property, and a Tailwind screen named `draws` at 900px. Later tasks consume tokens as `bg-[var(--panel)]`, `h-[var(--m-btn-h)]`, and the breakpoint as `draws:grid-cols-[minmax(0,1fr)_320px]`.

**Why a scoped class and not `:root`:** these token names (`--panel`, `--line`, `--accent`) are generic. Putting them on `:root` would collide with any future global of the same name and would apply to the other 25 admin tabs. Scoping to `.admin-draws` means the blast radius is exactly the four pages.

- [ ] **Step 1: Create the token stylesheet**

Values are copied verbatim from `tokens.json`. `--accent` is the only colour that differs by theme.

```css
/* src/components/admin/draws/tokens.css
 *
 * Design tokens for the four admin draws pages, from
 * design_handoff_admin_draws/tokens.json (read verbatim).
 *
 * Scoped to .admin-draws — NOT :root — because these names are generic
 * (--panel, --line, --accent) and the other 25 admin tabs must not inherit them.
 *
 * Layout tokens are shared by light/dark; colour tokens are shared by
 * desktop/mobile. The mobile block only overrides sizing, per the handoff:
 * "Mobile enlarges targets, not type."
 */

.admin-draws {
  /* ── colour · light ─────────────────────────────────────────── */
  --bg: #f5f6f8;
  --panel: #ffffff;
  --panel2: #f3f4f7;
  --line: #e3e6eb;
  --line2: #eef0f4;
  --text: #101828;
  --text2: #4b5565;
  --text3: #6b7280;
  --accent: #ee0000;
  --accent-soft: #fef2f2;
  --accent-line: #fecaca;
  --ok: #067647;
  --ok-bg: #ecfdf3;
  --ok-line: #abefc6;
  --warn: #b54708;
  --warn-bg: #fffaeb;
  --warn-line: #fedf89;
  --info: #175cd3;
  --info-bg: #eff8ff;
  --info-line: #b2ddff;
  --danger: #b42318;
  --danger-bg: #fef3f2;
  --danger-line: #fecdca;
  --input-bg: #ffffff;
  --hover: #f9fafb;
  --shadow: 0 1px 2px rgba(16, 24, 40, 0.05);
  --avatarRing: #fee2e2;
  --ribbon: #101828;
  --ribbonLine: rgba(255, 255, 255, 0.13);
  --ribbonText: #ffffff;
  --ribbonSub: rgba(255, 255, 255, 0.62);

  /* ── elevation (theme-independent recipes) ──────────────────── */
  --shadow-inspector: 0 12px 30px -18px rgba(16, 24, 40, 0.35);
  --shadow-modal: 0 30px 70px -30px rgba(0, 0, 0, 0.45);
  --shadow-dropdown: 0 14px 34px -18px rgba(16, 24, 40, 0.45);
  --shadow-drawer: 14px 0 40px -20px rgba(0, 0, 0, 0.5);
  --shadow-toast: 0 18px 40px -20px rgba(16, 24, 40, 0.5);

  /* ── layout · mobile-first (the ≤899px values) ──────────────── */
  --m-pad: 14px;
  --m-gap: 12px;
  --m-radius: 12px;
  --m-h1: 17px;
  --m-statcols: 2;
  --m-listcols: 2;
  --m-galCols: 2;
  --m-majorCols: minmax(0, 1fr);
  --m-splitCols: minmax(0, 1fr);
  --m-modalCols: minmax(0, 1fr);
  --m-tblCols: 1fr;
  --m-poolCols: minmax(0, 1fr) 62px;
  --m-cols2: minmax(0, 1fr);
  --m-cols3: minmax(0, 1fr);
  --m-photoCols: minmax(0, 1fr);
  --m-prizeDir: column;
  --m-prizeImgW: 100%;
  --m-prizeImgH: 140px;
  --m-searchMin: 100%;
  --m-searchMax: none;
  --m-ribbonBtnDir: column;
  --m-ribbonBtnW: 100%;
  --m-sheetAlign: flex-end;
  --m-sheetW: 100%;
  --m-sheetRadius: 18px 18px 0 0;
  --m-scrimPad: 0px;

  /* ── control heights · all 44px on mobile ───────────────────── */
  --m-btn-h: 44px;
  --m-btn-sm: 44px;
  --m-field: 44px;
  --m-icon: 44px;
  --m-cardBtn: 44px;
  --m-slimH: 44px;
}

/* ── colour · dark ────────────────────────────────────────────── */
.dark .admin-draws {
  --bg: #0a0a0a;
  --panel: #171717;
  --panel2: #212124;
  --line: #2c2c30;
  --line2: #232326;
  --text: #fafafa;
  --text2: #a3a3ac;
  --text3: #9a9aa3;
  /* Lifted from the brand #ee0000 so it clears contrast on #0a0a0a. */
  --accent: #ff4444;
  --accent-soft: rgba(255, 68, 68, 0.13);
  --accent-line: rgba(255, 68, 68, 0.4);
  --ok: #4ade80;
  --ok-bg: rgba(6, 118, 71, 0.2);
  --ok-line: rgba(74, 222, 128, 0.28);
  --warn: #fbbf24;
  --warn-bg: rgba(181, 71, 8, 0.22);
  --warn-line: rgba(251, 191, 36, 0.28);
  --info: #60a5fa;
  --info-bg: rgba(23, 92, 211, 0.22);
  --info-line: rgba(96, 165, 250, 0.28);
  --danger: #f87171;
  --danger-bg: rgba(180, 35, 24, 0.24);
  --danger-line: rgba(248, 113, 113, 0.3);
  --input-bg: #101012;
  --hover: #1f1f22;
  /* Dark has no shadow — depth comes from --line. */
  --shadow: none;
  --avatarRing: rgba(238, 0, 0, 0.45);
  --ribbon: #000000;
  --ribbonLine: rgba(255, 255, 255, 0.13);
  --ribbonText: #fafafa;
  --ribbonSub: rgba(255, 255, 255, 0.55);
}

/* ── desktop overrides · single breakpoint at 900px ───────────── */
/* 900px = 280px sidebar + 320px inspector + a usable table. */
@media (min-width: 900px) {
  .admin-draws {
    --m-pad: 20px;
    --m-gap: 14px;
    --m-h1: 20px;
    --m-statcols: 4;
    --m-listcols: 5;
    --m-galCols: 4;
    --m-majorCols: minmax(0, 1.42fr) minmax(0, 1fr);
    --m-splitCols: minmax(0, 1fr) 320px;
    --m-modalCols: minmax(0, 1fr) minmax(0, 1fr);
    --m-tblCols: minmax(0, 1.25fr) 104px 84px 88px 92px minmax(0, 1.2fr) 40px;
    --m-poolCols: minmax(0, 1.5fr) minmax(0, 1.15fr) 74px;
    --m-cols2: minmax(0, 1fr) minmax(0, 1fr);
    --m-cols3: repeat(3, minmax(0, 1fr));
    --m-photoCols: 120px minmax(0, 1fr);
    --m-prizeDir: row;
    --m-prizeImgW: 116px;
    --m-prizeImgH: 116px;
    --m-searchMin: 130px;
    --m-searchMax: 280px;
    --m-ribbonBtnDir: row;
    --m-ribbonBtnW: auto;
    --m-sheetAlign: center;
    --m-sheetW: 640px;
    --m-sheetRadius: 14px;
    --m-scrimPad: 28px;

    --m-btn-h: 36px;
    --m-btn-sm: 31px;
    --m-field: 38px;
    --m-icon: 34px;
    --m-cardBtn: 29px;
    --m-slimH: 40px;
  }
}

/* Every figure in the draws pages is tabular. */
.admin-draws [data-figure] {
  font-variant-numeric: tabular-nums;
}

/* Focus is visible everywhere: 2px solid accent at 2px offset. */
.admin-draws :focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@keyframes admin-draws-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.admin-draws-skeleton {
  background: linear-gradient(90deg, var(--panel2) 25%, var(--hover) 50%, var(--panel2) 75%);
  background-size: 200% 100%;
  animation: admin-draws-shimmer 1.15s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .admin-draws-skeleton { animation: none; }
}
```

- [ ] **Step 2: Import it from globals.css**

Add next to the existing imports at the top of `src/app/globals.css`:

```css
@import "../components/admin/draws/tokens.css";
```

- [ ] **Step 3: Add the named breakpoint**

In `tailwind.config.ts`, inside `theme.extend.screens`, next to the existing `xs` entry:

```ts
      screens: {
        // Custom breakpoint at 540px to match the modal `@media (max-width: 540px)`
        // queries we're porting off styled-jsx. Used as `max-xs:`/`xs:` variants.
        // Tailwind defaults sm=640px, so xs sits below that.
        xs: "540px",
        // Admin draws revamp: the single breakpoint the design specifies.
        // 280px sidebar + 320px inspector + a usable table = 900px. Named so no
        // component hardcodes `min-[900px]:` — same reason control heights are tokens.
        draws: "900px",
      },
```

- [ ] **Step 4: Verify the build still compiles and nothing else moved**

```bash
npm run type-check && npm run lint
```

Expected: PASS. Then `npm run dev`, open `/admin/overview` and confirm it is visually unchanged (the tokens are inert until a `.admin-draws` element exists).

- [ ] **Step 5: Update docs and commit**

Add a section to `docs/shared-ui/tailwind-conventions.md` describing the `draws` screen and the `.admin-draws` scoped-token pattern (why it is scoped, and the "controls take a token, never a literal" rule).

```bash
git add src/components/admin/draws/tokens.css src/app/globals.css tailwind.config.ts docs/shared-ui/tailwind-conventions.md
git commit -m "feat(admin-draws): add scoped design-token layer and 900px breakpoint"
```

---

### Task 2: Per-draw revenue service

**Files:**
- Create: `src/services/admin/drawRevenue.ts`
- Create: `src/services/admin/__tests__/drawRevenue.test.ts`
- Modify: `package.json` (add `test:draw-revenue`)
- Docs: `docs/admin/api.md`, `docs/draws/` (revenue derivation)

**Interfaces:**
- Consumes: `aggregateNetRevenueSumWithMatch` and `fetchNetBenefitsGrantedWithMatch` from [`src/utils/payment/payment-event-net-queries.ts`](../../../src/utils/payment/payment-event-net-queries.ts).
- Produces:
  - `type DrawWindowInput = { _id: string; activationDate?: Date | string | null; freezeEntriesAt?: Date | string | null; drawDate?: Date | string | null }`
  - `type DrawRevenueWindow = { drawId: string; start: Date; end: Date }`
  - `buildDrawRevenueWindows(draws: DrawWindowInput[]): DrawRevenueWindow[]`
  - `assignRevenueToWindows(events: LeanRevenueRow[], windows: DrawRevenueWindow[]): Map<string, number>`
  - `type LeanRevenueRow = { timestamp?: Date | string; data?: { price?: number } }`
  - `getRevenueByDraw(draws: DrawWindowInput[]): Promise<Map<string, number>>`

**Why these window boundaries.** Entry routing is decided by [`getTargetMajorDraw`](../../../src/utils/draws/major-draw-helpers.ts): a payment created **before** `freezeEntriesAt` lands in the currently-active draw; a payment created at or after it is deferred to the next queued draw. So the revenue window that exactly matches the entries a draw actually holds is **`[previousDraw.freezeEntriesAt, thisDraw.freezeEntriesAt)`** — chained boundaries, not `[activation, draw)`. Chaining also correctly absorbs the gap period between one draw's freeze and the next draw's activation, which an `activationDate`-based window would silently drop on the floor. The earliest draw in the set has no predecessor, so it falls back to its own `activationDate`.

- [ ] **Step 1: Write the failing test**

Create `src/services/admin/__tests__/drawRevenue.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  buildDrawRevenueWindows,
  assignRevenueToWindows,
  type DrawWindowInput,
  type LeanRevenueRow,
} from "../drawRevenue";

const d = (iso: string) => new Date(iso);

function run() {
  // ── buildDrawRevenueWindows ────────────────────────────────────────────
  const draws: DrawWindowInput[] = [
    // deliberately out of order — the builder must sort
    { _id: "jul", activationDate: d("2026-06-28T00:00:00Z"), freezeEntriesAt: d("2026-07-27T10:00:00Z") },
    { _id: "may", activationDate: d("2026-04-28T00:00:00Z"), freezeEntriesAt: d("2026-05-27T10:00:00Z") },
    { _id: "jun", activationDate: d("2026-05-28T00:00:00Z"), freezeEntriesAt: d("2026-06-27T10:00:00Z") },
  ];

  const windows = buildDrawRevenueWindows(draws);
  assert.equal(windows.length, 3);
  assert.deepEqual(windows.map((w) => w.drawId), ["may", "jun", "jul"], "sorted ascending by freeze");

  // Earliest draw has no predecessor → falls back to its own activationDate.
  assert.equal(windows[0].start.toISOString(), "2026-04-28T00:00:00.000Z");
  assert.equal(windows[0].end.toISOString(), "2026-05-27T10:00:00.000Z");

  // Later draws chain off the previous freeze, NOT their own activationDate —
  // this is what absorbs the gap period (27th 10:00 → 28th 00:00).
  assert.equal(windows[1].start.toISOString(), "2026-05-27T10:00:00.000Z", "chains off may's freeze");
  assert.equal(windows[2].start.toISOString(), "2026-06-27T10:00:00.000Z", "chains off jun's freeze");

  // Windows are contiguous and non-overlapping.
  assert.equal(windows[0].end.getTime(), windows[1].start.getTime());
  assert.equal(windows[1].end.getTime(), windows[2].start.getTime());

  // A draw with no usable dates is dropped rather than producing an Invalid Date window.
  assert.equal(
    buildDrawRevenueWindows([{ _id: "ghost", activationDate: null, freezeEntriesAt: null, drawDate: null }]).length,
    0,
    "undated draw dropped"
  );

  // freezeEntriesAt missing → fall back to drawDate so legacy rows still bucket.
  const legacy = buildDrawRevenueWindows([
    { _id: "old", activationDate: d("2025-01-01T00:00:00Z"), drawDate: d("2025-01-27T10:30:00Z") },
  ]);
  assert.equal(legacy[0].end.toISOString(), "2025-01-27T10:30:00.000Z", "drawDate is the freeze fallback");

  // ISO strings from a lean/JSON read are accepted, not just Date objects.
  const fromStrings = buildDrawRevenueWindows([
    { _id: "s", activationDate: "2026-04-28T00:00:00Z", freezeEntriesAt: "2026-05-27T10:00:00Z" },
  ]);
  assert.equal(fromStrings[0].start.toISOString(), "2026-04-28T00:00:00.000Z");

  // ── assignRevenueToWindows ─────────────────────────────────────────────
  const events: LeanRevenueRow[] = [
    { timestamp: d("2026-05-01T00:00:00Z"), data: { price: 20 } }, // may
    { timestamp: d("2026-05-26T23:59:00Z"), data: { price: 30 } }, // may
    { timestamp: d("2026-05-27T10:00:00Z"), data: { price: 50 } }, // boundary → jun (end is EXCLUSIVE)
    { timestamp: d("2026-06-27T09:59:00Z"), data: { price: 25 } }, // jun
    { timestamp: d("2026-07-01T00:00:00Z"), data: { price: 100 } }, // jul
    { timestamp: d("2026-01-01T00:00:00Z"), data: { price: 999 } }, // before all windows → dropped
    { timestamp: d("2026-12-01T00:00:00Z"), data: { price: 999 } }, // after all windows → dropped
    { timestamp: d("2026-07-02T00:00:00Z") }, // missing price → counts as 0, not NaN
  ];

  const byDraw = assignRevenueToWindows(events, windows);
  assert.equal(byDraw.get("may"), 50, "20 + 30");
  assert.equal(byDraw.get("jun"), 75, "boundary row lands in jun: 50 + 25");
  assert.equal(byDraw.get("jul"), 100, "missing price contributes 0");

  // Every window is present, zero-filled — the UI must never see `undefined`.
  const emptyResult = assignRevenueToWindows([], windows);
  assert.deepEqual([...emptyResult.values()], [0, 0, 0], "zero-filled");
  assert.deepEqual([...emptyResult.keys()], ["may", "jun", "jul"]);

  console.log("✅ drawRevenue: all assertions passed");
}

run();
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx tsx src/services/admin/__tests__/drawRevenue.test.ts
```

Expected: FAIL — `Cannot find module '../drawRevenue'`.

- [ ] **Step 3: Write the implementation**

Create `src/services/admin/drawRevenue.ts`:

```ts
// src/services/admin/drawRevenue.ts
//
// Per-major-draw net revenue. There is no revenue field on the MajorDraw model —
// this derives it from PaymentEvent, refund-netted, using the SAME window that
// decides which draw an entry lands in.
//
// Window rule (must stay in lockstep with getTargetMajorDraw in
// src/utils/draws/major-draw-helpers.ts): a payment created BEFORE a draw's
// freezeEntriesAt enters that draw; at or after it, the entry is deferred to the
// next queued draw. So a draw's revenue window is
//
//     [ previousDraw.freezeEntriesAt , thisDraw.freezeEntriesAt )
//
// Chaining off the PREVIOUS freeze (rather than this draw's own activationDate) is
// what absorbs the gap period between one draw freezing and the next activating —
// money taken in that gap belongs to the next draw, and an activation-based window
// would silently drop it.
//
// Figures are DOLLARS (PaymentEvent.data.price is in dollars by application
// convention; see payment-event-net-queries.ts). Whole rows are excluded when a
// RefundProcessed exists for the same paymentIntentId, so units never mix.

import { fetchNetBenefitsGrantedWithMatch } from "@/utils/payment/payment-event-net-queries";

/** The date fields this module needs off a draw. Accepts lean/JSON reads. */
export type DrawWindowInput = {
  _id: string;
  activationDate?: Date | string | null;
  freezeEntriesAt?: Date | string | null;
  drawDate?: Date | string | null;
};

/** A half-open `[start, end)` revenue window for one draw. */
export type DrawRevenueWindow = {
  drawId: string;
  start: Date;
  end: Date;
};

/** Lean projection of a net BenefitsGranted row. */
export type LeanRevenueRow = {
  timestamp?: Date | string;
  data?: { price?: number };
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Build contiguous, non-overlapping revenue windows for a set of draws.
 *
 * Pure. Draws with no usable end boundary are dropped rather than producing an
 * Invalid Date window that would swallow every event.
 */
export function buildDrawRevenueWindows(draws: DrawWindowInput[]): DrawRevenueWindow[] {
  const dated = draws
    .map((draw) => ({
      drawId: String(draw._id),
      // freezeEntriesAt is the real routing boundary; drawDate is the legacy
      // fallback for historical rows written before the freeze field existed.
      end: toDate(draw.freezeEntriesAt) ?? toDate(draw.drawDate),
      activation: toDate(draw.activationDate),
    }))
    .filter((d): d is { drawId: string; end: Date; activation: Date | null } => d.end !== null)
    .sort((a, b) => a.end.getTime() - b.end.getTime());

  const windows: DrawRevenueWindow[] = [];
  for (let i = 0; i < dated.length; i++) {
    const current = dated[i];
    const previous = i > 0 ? dated[i - 1] : null;
    // Chain off the previous freeze. The earliest draw in the set has no
    // predecessor, so it uses its own activation; if that is missing too, the
    // window opens at the epoch and simply collects everything before its freeze.
    const start = previous ? previous.end : (current.activation ?? new Date(0));
    if (start.getTime() >= current.end.getTime()) continue; // degenerate; skip
    windows.push({ drawId: current.drawId, start, end: current.end });
  }
  return windows;
}

/**
 * Sum event prices into their window. Pure, zero-filled, `[start, end)`.
 *
 * Windows are contiguous and ascending, so a linear scan over sorted events would
 * also work; a per-event binary search keeps it correct even if a caller passes
 * unsorted events.
 */
export function assignRevenueToWindows(
  events: LeanRevenueRow[],
  windows: DrawRevenueWindow[]
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const w of windows) totals.set(w.drawId, 0);
  if (windows.length === 0) return totals;

  for (const event of events) {
    const ts = toDate(event.timestamp);
    if (!ts) continue;
    const t = ts.getTime();

    let lo = 0;
    let hi = windows.length - 1;
    let hit: DrawRevenueWindow | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const w = windows[mid];
      if (t < w.start.getTime()) hi = mid - 1;
      else if (t >= w.end.getTime()) lo = mid + 1;
      else {
        hit = w;
        break;
      }
    }
    if (!hit) continue; // outside every window (e.g. the gap before the first draw)

    totals.set(hit.drawId, (totals.get(hit.drawId) ?? 0) + (event.data?.price ?? 0));
  }
  return totals;
}

/**
 * Net revenue per draw, zero-filled for every draw that produced a window.
 *
 * ONE aggregation for the whole page: the windows are contiguous, so a single
 * `[earliest.start, latest.end)` fetch covers them all and the bucketing happens
 * in memory. Do not call this per row.
 */
export async function getRevenueByDraw(draws: DrawWindowInput[]): Promise<Map<string, number>> {
  const windows = buildDrawRevenueWindows(draws);
  if (windows.length === 0) return new Map();

  const rangeStart = windows[0].start;
  const rangeEnd = windows[windows.length - 1].end;

  const events = (await fetchNetBenefitsGrantedWithMatch(
    { timestamp: { $gte: rangeStart, $lt: rangeEnd } },
    { timestamp: 1, "data.price": 1 }
  )) as LeanRevenueRow[];

  return assignRevenueToWindows(events, windows);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx tsx src/services/admin/__tests__/drawRevenue.test.ts
```

Expected: `✅ drawRevenue: all assertions passed`

- [ ] **Step 5: Register the test script**

In `package.json`, alongside the other `test:*` entries:

```json
    "test:draw-revenue": "tsx src/services/admin/__tests__/drawRevenue.test.ts",
```

Verify with `npm run test:draw-revenue`. A test file with no `test:*` entry is undiscoverable in this repo — that registration is not optional.

- [ ] **Step 6: Update docs and commit**

Add a "Per-draw revenue" section to `docs/admin/api.md` and `docs/draws/` stating: derived not stored; window is `[prev.freeze, this.freeze)`; refund-netted whole rows; dollars; **must stay in lockstep with `getTargetMajorDraw`**.

```bash
git add src/services/admin/drawRevenue.ts src/services/admin/__tests__/drawRevenue.test.ts package.json docs/admin/api.md docs/draws/
git commit -m "feat(admin-draws): derive per-draw net revenue from PaymentEvent windows"
```

---

### Task 3: Expose revenue on the history API

**Files:**
- Modify: `src/app/api/admin/major-draw/history/route.ts`
- Docs: `docs/admin/api.md`

**Interfaces:**
- Consumes: `getRevenueByDraw` from Task 2.
- Produces: each row in `data.draws[]` gains `revenue: number` and `revenuePerEntry: number | null`; `data.stats` gains `totalRevenue: number`.

**Scope guard:** additive only. Do not remove or rename any existing field — `DrawResults.tsx` and `UpcomingDraws.tsx` both read this response today and Phase 1 only rewires one of them.

**Critical: revenue must be scoped to the FILTER, not the PAGE.** Every existing `stats.*` key is aggregated over `filter` (the whole matching set), not the 20 rows on screen. If `stats.totalRevenue` summed only the current page, the KPI strip would read `31 completed draws · 812,406 entries · $X revenue` where `$X` covered 20 of the 31 — a figure that silently disagrees with the two beside it. So the window set is built from **all draws matching the filter**, and the per-row values are read out of that same map.

- [ ] **Step 1: Import the service**

At the top of the route:

```ts
import { getRevenueByDraw } from "@/services/admin/drawRevenue";
```

- [ ] **Step 2: Compute revenue over the whole filtered set**

Immediately after the `processedDraws` loop closes (currently ends around line 308), before the pagination calculation:

```ts
    // Per-draw net revenue. See src/services/admin/drawRevenue.ts for the window rule.
    //
    // Scoped to the FILTER, not the page: the sibling stats (totalDraws, totalEntries,
    // totalPrizeValue) are all filter-wide aggregates, so a page-wide revenue figure
    // would sit in the same KPI strip contradicting them. This is a lean projection of
    // three date fields over at most a few hundred draws, then ONE PaymentEvent
    // aggregation across the combined span — not a query per row.
    //
    // Failure here must not take the list down: revenue is a supporting figure, the
    // draws are the payload.
    let revenueByDraw = new Map<string, number>();
    try {
      const windowSource = await MajorDraw.find(filter)
        .select("_id activationDate freezeEntriesAt drawDate")
        .lean();
      revenueByDraw = await getRevenueByDraw(
        windowSource.map((d) => ({
          _id: String(d._id),
          activationDate: d.activationDate,
          freezeEntriesAt: d.freezeEntriesAt,
          drawDate: d.drawDate,
        }))
      );
    } catch (revenueError) {
      // console.error survives the production build; console.warn does not.
      console.error("[major-draw/history] revenue aggregation failed, returning zeros:", revenueError);
    }

    const drawsWithRevenue: DrawWithRevenue[] = processedDraws.map((draw) => {
      const revenue = revenueByDraw.get(draw._id) ?? 0;
      return {
        ...draw,
        revenue,
        revenuePerEntry: draw.totalEntries > 0 ? revenue / draw.totalEntries : null,
      };
    });

    // Filter-wide, matching how every other stat on this response is scoped.
    const totalRevenue = [...revenueByDraw.values()].reduce((sum, v) => sum + v, 0);
```

- [ ] **Step 3: Return the new fields**

Add the row type above the handler:

```ts
type DrawWithRevenue = ProcessedDraw & { revenue: number; revenuePerEntry: number | null };
```

Change `draws: processedDraws` to `draws: drawsWithRevenue`, and add the total to `stats`:

```ts
        stats: {
          totalDraws: summaryStats.totalDraws,
          totalEntries: summaryStats.totalEntries,
          totalPrizeValue: summaryStats.totalPrizeValue,
          // Filter-wide, like its siblings. The UI labels it "Draw revenue".
          totalRevenue,
          drawsWithWinners: summaryStats.drawsWithWinners,
          drawsWithoutWinners: summaryStats.drawsWithoutWinners,
          winnerSelectionRate:
            summaryStats.totalDraws > 0
              ? Math.round((summaryStats.drawsWithWinners / summaryStats.totalDraws) * 100)
              : 0,
        },
```

Note the interaction with the `hasWinner` filter: it is applied *after* the Mongo query, inside the `processedDraws` loop, so `windowSource` will include draws that `hasWinner` later removes. That already applies to `summaryStats` today (`totalDraws` is likewise pre-`hasWinner`), so `totalRevenue` is consistent with its siblings. Do not "fix" one without the others.

Also extend the `ProcessedDraw` type with `revenue: number; revenuePerEntry: number | null;` — or introduce `type DrawWithRevenue = ProcessedDraw & { revenue: number; revenuePerEntry: number | null }` and type `drawsWithRevenue` as `DrawWithRevenue[]`. Prefer the latter; it keeps `ProcessedDraw` honest about what the loop builds.

- [ ] **Step 4: Verify end to end**

```bash
npm run type-check
```

Then `npm run dev`, sign in as an admin, and hit the endpoint in the browser:

`/api/admin/major-draw/history?limit=5&status=completed`

Expected: every row has a numeric `revenue`; `stats.totalRevenue` equals the sum of the rows' `revenue`; `revenuePerEntry` is `null` for any draw with `totalEntries: 0` (never `Infinity` or `NaN`). Confirm `/admin/draw-results` and `/admin/upcoming-draws` still render — they ignore the new fields, so they must be unaffected.

- [x] **Step 5: Norm lockstep — CHECKED 2026-07-30, no action required**

Rule 10 in `CLAUDE.md`: this changes an admin route's response shape. Findings:

`major-draw.history` **is** mirrored (`classification.ts:844`, route at `src/app/api/internal/norm/v1/major-draw/history/route.ts`). But the Norm route does **not** share the code changed here — it calls `getMajorDrawHistory()` from `src/services/admin/MajorDrawService.ts`, while `src/app/api/admin/major-draw/history/route.ts` carries its own inline implementation. Two separate code paths reading the same collection.

So there is **no schema↔output mismatch risk** from this change: `NormMajorDrawHistorySchema` validates the service's output, which is untouched. `tsc` clean.

Two things this surfaced, both **flagged to the user, neither actioned here**:

1. **Norm could expose per-draw revenue too.** It would mean adding the same `getRevenueByDraw` call inside `getMajorDrawHistory`, extending `NormMajorDrawHistorySchema`, `npm run build:norm-manifest`, updating `docs/internal-norm/norm-context.md`, and `npm run norm:smoke`. Not done — rule 10's sanctioned path for a new read is to ask, not to assume.
2. **Pre-existing duplication (tech debt, not this branch's job).** `getMajorDrawHistory` and the admin route handler are near-identical reads — same filter construction, same `.select("-entries -__v")`, same winner map, same post-query `hasWinner` filter. They can drift, and this change made them drift by one field. They are *not* trivially mergeable: the admin route returns the full winner record (email, `selectedBy`, `imageUrl`, `drawResultUrl`) while the Norm projection is deliberately PII-bounded to `firstName` + opaque `userId`. Collapsing them means giving the service a projection mode — a real refactor with real regression surface across a live admin page and a live external gateway. Worth its own ticket; out of scope for a UI revamp.

- [ ] **Step 6: Update docs and commit**

```bash
git add src/app/api/admin/major-draw/history/route.ts docs/admin/api.md
git commit -m "feat(admin-draws): return per-draw revenue and revenue-per-entry from history API"
```

---

### Task 4: Fix the two participants-API gaps

**Files:**
- Modify: `src/app/api/admin/major-draw/participants/route.ts`
- Docs: `docs/admin/api.md`

**Interfaces:**
- Produces: `?limit=3` now returns the genuine top three entrants by `totalEntries`; search matches `mobile` as well as name and email.

**Two independent bugs, both blocking design elements:**
1. The route slices for pagination at line ~130 and *then* sorts at line ~173, so it sorts **within the page** rather than globally. Page 1 is therefore not the top N. The Major Draw "Entry pool" card asks for the top three entrants — today that request returns the first three in array insertion order.
2. Search covers `firstName`, `lastName`, `email`. The design's participants modal says "Search by name / email / mobile".

This also fixes the *existing* ParticipantsModal, whose ordering has been wrong all along.

- [ ] **Step 1: Sort before paginating**

Move the sort above the slice. Replace the pagination block:

```ts
    // Sort by total entries (descending) BEFORE paginating — sorting the page slice
    // instead of the set made page 1 "the first 20 in insertion order, sorted",
    // not "the top 20". The Entry pool card's top-3 read depends on this.
    entries = [...entries].sort(
      (a: MajorDrawEntry, b: MajorDrawEntry) => (b.totalEntries || 0) - (a.totalEntries || 0)
    );

    // Calculate pagination
    const totalCount = entries.length;
    const totalPages = Math.ceil(totalCount / limit);
    const skip = (page - 1) * limit;
    const paginatedEntries = entries.slice(skip, skip + limit);
```

Then **delete** the now-redundant post-map sort:

```ts
    // DELETE THIS — superseded by the pre-pagination sort above.
    // participants.sort((a, b) => b.totalEntries - a.totalEntries);
```

- [ ] **Step 2: Add mobile to the search**

In the `User.find({ $or: [...] })` block, add a `mobile` clause alongside the existing three:

```ts
        $or: [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { email: searchRegex },
          // The design's participants modal searches "name / email / mobile" —
          // and admins paste unspaced mobiles, so match the raw stored value.
          { mobile: searchRegex },
          {
            $expr: {
              $regexMatch: {
                input: { $concat: ["$firstName", " ", "$lastName"] },
                regex: searchQuery.trim(),
                options: "i",
              },
            },
          },
        ],
```

- [ ] **Step 3: Verify**

```bash
npm run type-check
```

Then in the browser as an admin:
- `/api/admin/major-draw/participants?majorDrawId=<id>&limit=3` → the three highest `totalEntries` in the whole draw, descending.
- `/api/admin/major-draw/participants?majorDrawId=<id>&search=<a real mobile>` → returns that participant.
- Open `/admin/major-draw` → **View Participants** and page through: ordering must now be monotonically descending *across* pages, not just within one.

- [ ] **Step 4: Update docs and commit**

```bash
git add src/app/api/admin/major-draw/participants/route.ts docs/admin/api.md
git commit -m "fix(admin-draws): sort participants before paginating and search by mobile"
```

---

### Task 5: `DrawsListPage` + Draw Results

**Files:**
- Create: `src/components/admin/draws/DrawsPageShell.tsx`
- Create: `src/components/admin/draws/DrawsKpiStrip.tsx`
- Create: `src/components/admin/draws/DrawsToolbar.tsx`
- Create: `src/components/admin/draws/DrawStatusPill.tsx`
- Create: `src/components/admin/draws/DrawsTable.tsx`
- Create: `src/components/admin/draws/DrawInspector.tsx`
- Create: `src/components/admin/draws/DrawsListPage.tsx`
- Modify: `src/app/admin/component/DrawResults.tsx` (becomes a thin config + data container)
- Docs: `docs/admin/frontend.md`

**Interfaces:**
- Consumes: tokens from Task 1; `revenue` / `revenuePerEntry` / `stats.totalRevenue` from Task 3.
- Produces:
  - `type DrawsListVariant = "results" | "upcoming"`
  - `type DrawRow = { id: string; name: string; kind: string; date: string; status: DrawStatus; entries: number; revenue: number; revenuePerEntry: number | null; prizeValue: number | null; trailing: string; trailingSub: string; locked: boolean }`
  - `type DrawGroup = { label: string; meta: string; rows: DrawRow[] }`
  - `type DrawsDataState = "ready" | "loading" | "empty" | "error"`
  - `<DrawsListPage variant rows groups kpis dataState errorDetail onRetry onSelect selectedId inspector />`

Task 7 reuses every one of these for Upcoming Draws — that is the whole point of the split, so keep the config in the *caller* and the layout in these components.

**Table grid.** Seven columns from `--m-tblCols`, in this order: Draw · Draw date · Status · Entries (right) · Revenue (right) · Winner|Gate · (row action). The five middle columns are fixed px so figures stay aligned as the pane resizes; only Draw and Winner/Gate flex.

- [ ] **Step 1: Build the four table states first**

Build `loading` / `empty` / `error` **at the same time as** `ready`. The design specifies all four, and the shell, KPI strip, toolbar and inspector must not move between them — retrofitting states later is how that invariant gets broken.

Exact copy, verbatim from the prototype:

| State | Content |
|---|---|
| `loading` | Six skeleton rows on the real column grid, `admin-draws-skeleton` shimmer, `aria-busy="true"` on the container |
| `empty` | Funnel icon; title `No results match these filters` (Results) / `No draws match these filters` (Upcoming); when a search is active the title becomes `No draws match “<query>”`; body `No completed draw matches this status and winner combination. Clear the filters to see all 31 results.` (Results) / `Nothing is queued under the status and category you picked. Clear the filters to see all six scheduled draws.` (Upcoming) — substitute the real counts; then a `Clear filters` button |
| `error` | Red alert icon; `Couldn't load draws`; `The request to the draws service timed out. Nothing has changed — retrying is safe.`; the endpoint and status in monospace — **the real one**, e.g. `GET /api/admin/major-draw/history · 504`; then `Try again` (primary) and `Contact support` |
| `ready` | The grouped rows |

`Clear filters` clears the search query **and** every dropdown filter — not just the dropdowns.

- [ ] **Step 2: Row selection must drive both surfaces**

`onSelect(rowId)` is called from the desktop `<tr>`-equivalent **and** the mobile card. Desktop repopulates `DrawInspector`; mobile opens the same content as a bottom sheet. One handler, two call sites — the handoff calls this out explicitly as the defect most likely to ship.

The selected row gets `box-shadow: inset 3px 0 0 var(--accent)` plus an `--accent-soft` fill.

- [ ] **Step 3: Wire Draw Results**

`DrawResults.tsx` keeps its existing data layer verbatim — the `fetchDraws` callback, filter state, pagination, and every modal handler (`handleSelectWinner`, `handleEditWinner`, `handleWinnerSelected`, `handleConfirmRemoveWinner`, `handleExport`, `handleEditDraw`, `handleSaveDraw`). Only the render tree is replaced.

**Capabilities that must survive the rewrite** — verify each one by hand before marking this task done:

- [ ] Select Winner (frozen/completed draws with no winner)
- [ ] Edit Winner
- [ ] **Remove winner** (with its `ConfirmationModal` and the "Winner record ID not found" fallback path)
- [ ] Edit Draw
- [ ] Export
- [ ] Status / Winner / Category / Sort filters
- [ ] Search
- [ ] Pagination (first / prev / next / last)
- [ ] `ClickableUserDisplay` on the winner — it opens the admin user modal

Map them onto the new surface: the inspector's primary is `Edit winner & testimony`, with `Edit draw` + `Export` beneath it.

`Remove winner` has no slot in the design. Per decision 6 it becomes a **subordinated danger row** — the three spec'd actions are untouched:

```
┌─ INSPECTOR — 320px ────────────────┐
│ …stat grid, winner block, thumbs…  │
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │
│ ┃  Edit winner & testimony      ┃  │  full-width primary, --accent
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │
│ ┌─────────────┐ ┌──────────────┐   │
│ │  Edit draw  │ │   Export     │   │  two secondaries
│ └─────────────┘ └──────────────┘   │
│ ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈  │  1px --line
│        Remove winner               │  ghost, --danger text, no fill
└────────────────────────────────────┘
```

Rules: renders **only** when `draw.winner?.userId` exists; `min-height: var(--m-btn-sm)`; routes to the existing `ConfirmationModal` with its current copy and its "Winner record ID not found" fallback path intact.

- [ ] **Step 4: Group by year**

Results groups by year (`2026`, `2025`), each group header carrying a meta line: `6 draws · $272,000 revenue · 1 winner outstanding`. Compute all three from the rows; use `stats.totalRevenue` only for the KPI strip. Group headers are sticky beneath the sticky column header.

When a search is active, collapse the grouped view into a single `Search results` group whose meta reads `1 draw matches “jason”` / `3 draws match “jason”` (singular/plural on the count).

- [ ] **Step 5: Verify**

```bash
npm run lint && npm run type-check
```

Then `npm run dev` → `/admin/draw-results`, and check:
- All four table states — force `loading` and `error` by throttling/blocking the request in devtools.
- Light and dark (the header theme toggle).
- 1440px and 390px, and specifically **899px vs 901px** — the layout must switch cleanly at the boundary.
- Every capability in the Step 3 checklist.
- Keyboard: Tab reaches every row and control; focus ring is `2px solid var(--accent)` at 2px offset; Escape closes an open dropdown before it closes anything else.

- [ ] **Step 6: Update docs and commit**

Document the new `src/components/admin/draws/` primitives in `docs/admin/frontend.md` — what each one owns, and that Results/Upcoming are one component with two configs.

```bash
git add src/components/admin/draws docs/admin/frontend.md src/app/admin/component/DrawResults.tsx
git commit -m "feat(admin-draws): add shared list primitives and rebuild Draw Results"
```

---

# Phase 2 — Upcoming Draws

### Task 6: Upcoming Draws on `DrawsListPage`

**Files:**
- Modify: `src/app/admin/component/UpcomingDraws.tsx`
- Docs: `docs/admin/frontend.md`

**Interfaces:**
- Consumes: every primitive from Task 5. **No new components.** If this task needs a new shared component, that is a signal Task 5's split was wrong — fix Task 5 rather than forking.

Differences from Results, and only these: KPI labels (`Scheduled draws`, `Entries in flight`, `Revenue in flight`, `Prize value queued`); filters (Status / Category / Sort instead of Status / Winner / Sort); grouping (`Live now` / `Scheduled` instead of by year); column 6 header is `Gate` not `Winner`; inspector primary is `Edit this draw`.

- [ ] **Step 1: Preserve the two-call combined status fetch**

`UpcomingDraws.tsx` fetches `status=queued` and `status=active` in parallel and merges them, because the API's Zod schema takes a single status enum. Keep that logic exactly as-is — it is load-bearing for the default view. Note in a comment that `stats.totalRevenue` must be **summed across both responses**, the same way the other stats already are.

- [ ] **Step 2: Route locked draws to the locked notice**

A draw with `configurationLocked: true` must not open the edit form. Every entry point — inspector primary, row action, and (Phase 5) the mobile bar — routes through one guard:

```ts
const openDrawEditor = (draw: UpcomingDraw) => {
  if (draw.configurationLocked) {
    setLockedNoticeDraw(draw);
    return;
  }
  handleEditDraw(draw);
};
```

Until Task 12 lands `DrawLockedModal`, keep the existing inline amber banner as the fallback. Do not leave an entry point that bypasses the check.

- [ ] **Step 3: Verify**

`/admin/upcoming-draws` at both viewports, both themes, all four states. Confirm `Edit Draw` still saves through `/api/admin/major-draw/update?id=…`, and that a locked draw cannot reach the form from any entry point.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/component/UpcomingDraws.tsx docs/admin/frontend.md
git commit -m "feat(admin-draws): rebuild Upcoming Draws on the shared list page"
```

---

### Task 7: Move "Create major draw" onto the Upcoming toolbar

**Files:**
- Modify: `src/app/admin/component/UpcomingDraws.tsx`
- Modify: `src/app/admin/component/overview/sections/QuickActionsCard.tsx` (leave the Overview entry point in place)
- Docs: `docs/admin/frontend.md`

`AdminMajorDrawModal` already exists and works — it posts to `/api/admin/major-draw/create`. This is purely a second mount point, not a new capability. Gate it on `usePermissions().has("majorDraw.edit")`, matching how the other draws actions gate.

Leave the Overview quick action alone. Two entry points to a create flow is normal; silently removing one an admin already uses is not.

- [ ] **Step 1: Mount it**

Add the `New major draw` button to `DrawsToolbar`'s actions slot on the Upcoming variant, and mount `AdminMajorDrawModal` with `onSuccess` calling the existing `fetchDraws(pagination.currentPage)`.

- [ ] **Step 2: Verify**

Create a draw from `/admin/upcoming-draws`; confirm it appears in the `Scheduled` group without a manual refresh, and that the Overview quick action still works.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/component/UpcomingDraws.tsx docs/admin/frontend.md
git commit -m "feat(admin-draws): add Create major draw to the Upcoming Draws toolbar"
```

---

# Phase 3 — Mini Draws

### Task 8: Mini Draws card grid

**Files:**
- Create: `src/components/admin/draws/MiniDrawCard.tsx` (extracted from the private component at `MiniDrawManagement.tsx:754`)
- Modify: `src/app/admin/component/MiniDrawManagement.tsx`
- Docs: `docs/admin/frontend.md`

**Interfaces:**
- Consumes: `DrawsPageShell`, `DrawsToolbar`, `DrawStatusPill`.
- Produces: `<MiniDrawCard draw reorderMode onEdit onDelete onSelectWinner onExportCsv onEditLatestWinner … />` — the existing prop contract, preserved.

Extracting the card into its own file is what the handoff's source map assumed already existed, and the page component is 935 lines. Keep the `@dnd-kit` `useSortable` wiring inside the extracted card.

**Design:** amber notice strip when draws have hit their threshold (with a `Review` button); toolbar with search + status chips carrying counts (`All` / `Active` / `At capacity` / `Completed`) + `Reorder` + `New mini draw`; `repeat(auto-fill, minmax(0,1fr))` grid at `--m-listcols` (5 desktop / 2 mobile); card = 11px radius, 4:3 image tile with a status pill top-left and brand tag bottom-right, name clamped to 2 lines, entries fraction + percentage, 5px progress bar, footer with `Winner` and a delete icon button.

- [ ] **Step 1: Derive the chip counts**

`At capacity` is not a stored status — the model's enum is `active | completed | cancelled`. Derive it:

```ts
const isAtCapacity = (d: MiniDraw) =>
  d.status === "active" && d.minimumEntries > 0 && d.totalEntries >= d.minimumEntries;
```

The same predicate drives the amber notice strip's visibility and its count. Do not add a status to the model.

- [ ] **Step 2: Keep every existing action**

The design's card footer shows only `Winner` and delete. These exist today and must survive:

- [ ] `Winner` → `WinnerSelectionModal` (disabled at `totalEntries === 0`)
- [ ] **`CSV` export** per card
- [ ] **`Edit winner & testimony`** — only when `draw.latestWinner` exists
- [ ] Card body click → edit form
- [ ] Delete → confirm
- [ ] **Reorder mode** — drag, Save Order, Discard Changes, and the dirty-state guard

Put `CSV` and `Edit winner & testimony` in the card footer alongside `Winner` and delete. The design's two-action footer is a *visual* target, not a licence to delete working tools from a draw-night screen.

- [ ] **Step 3: Search across name, brand and status**

The current filter matches `name` only. The design filters cards by product name, brand **and** status:

```ts
const haystack = `${draw.name} ${getBrandMeta(draw.brandId)?.label ?? ""} ${draw.status}`.toLowerCase();
```

No match falls through to a Mini-Draws-specific empty state titled `No mini draw matches “<query>”` with a `Clear search` button.

- [ ] **Step 4: Verify**

`/admin/mini-draws` at both viewports and themes. Walk every item in the Step 2 checklist. Confirm the `?search=` deep link from the Overview "Top mini draws" card still pre-fills the box.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/draws/MiniDrawCard.tsx src/app/admin/component/MiniDrawManagement.tsx docs/admin/frontend.md
git commit -m "feat(admin-draws): rebuild the Mini Draws card grid and extract MiniDrawCard"
```

---

# Phase 4 — Major Draw

### Task 9: Major Draw ribbon, gates, entry pool and rules

**Files:**
- Create: `src/components/admin/draws/DrawStatusRibbon.tsx`
- Create: `src/components/admin/draws/DrawGatesCard.tsx`
- Create: `src/components/admin/draws/EntryPoolCard.tsx`
- Modify: `src/app/admin/component/MajorDrawManagement.tsx`
- Docs: `docs/admin/frontend.md`

**Interfaces:**
- Consumes: `useCurrentMajorDraw`; the top-3 read from Task 4's fixed participants route; per-draw revenue via the history API (Task 3) filtered to the current draw.

**Ribbon:** full-width `--ribbon` card, 14px radius, 14px/18px padding. Eyebrow = 8px `#18a94d` dot + `ENTRIES OPEN · CONFIG UNLOCKED` (drive both halves off the real `status` and `configurationLocked`). Title = draw name, 26px/1.15 Poppins 700. Actions right: `Export pool` (ghost on dark) and `Record winner` (solid `--accent`), both 38px tall, 9px radius. Four-stat strip with `rgba(255,255,255,.08)` dividers: Participants · Entries · Draw revenue (`#4ade80`) · Draws in (`#ff6b6b`). Progress bar at the bottom: 4px, `rgba(255,255,255,.12)` track, red→amber gradient fill.

- [ ] **Step 1: Source each ribbon stat honestly**

| Stat | Source | Sub-line |
|---|---|---|
| Participants | `majorDraw.totalParticipants` | `<entries/participants> avg entries` — compute, or omit if participants is 0 |
| Entries | `majorDraw.totalEntries` | The design shows `+2,714 in 24 h`. **There is no 24-hour delta available.** Omit the sub-line rather than inventing one. |
| Draw revenue | Task 3 | `$X.XX per entry` from `revenuePerEntry`; render `—` when it is `null` |
| Draws in | `formatCountdown(drawDate − now)` | `freezes <freezeEntriesAt in AEST>` |

Do not fabricate the entries delta. An admin dashboard that shows a made-up movement figure is worse than one that shows none.

- [ ] **Step 2: Gates from real dates**

Four timeline rows, each a 9px ring marker on a 1px connector line: entries open (`activationDate`), entries freeze (`freezeEntriesAt`), draw live (`drawDate`), next draw opens (the next queued draw's `activationDate`).

Fetch the next draw with the existing endpoint — no new route:

```
/api/admin/major-draw/history?status=queued&sortBy=drawDate&sortOrder=asc&limit=1
```

If there is no queued draw, render the fourth row in a muted state with `Not scheduled` rather than hiding it — a missing next draw is exactly the thing an admin needs to notice.

- [ ] **Step 3: Entry pool card**

Top three entrants with entry counts, plus a `View participants` button opening `ParticipantsModal`. Read the top three from:

```
/api/admin/major-draw/participants?majorDrawId=<id>&limit=3
```

This is correct **only because of Task 4** — do not attempt this before that task lands.

- [ ] **Step 4: Prize card is read-only**

Render `getPrizeBySlug(DEFAULT_PRIZE_SLUG)` — 96×96 image tile, prize name 17px Poppins 700, description 13px/1.6, prize value and combination count as a 2-up definition row.

**Omit the `Edit prize` text button.** The card shows the static config prize; `MajorDraw.prize` is `@deprecated`. Wiring the button would edit a different field than the one displayed. Leave a comment saying so, so the next person does not "fix" it back in.

- [ ] **Step 5: Rules card**

The five business rules as a bulleted list, 12.5px/1.7, verbatim:

```
Export is available at any status except cancelled.
Entries freeze automatically 30 minutes before the draw.
Winner can only be recorded once the draw is frozen or completed.
Configuration locks the moment entries freeze.
Renewals paid between 8:00 PM and midnight route into the next month's draw.
```

- [ ] **Step 6: Preserve existing behaviour**

- [ ] `canSelectWinner` gate — frozen/completed **and** no current winner
- [ ] `canExport` — any status except cancelled
- [ ] The `currentWinner` fetch chain and the Winner Display block
- [ ] `WinnerEditModal` when `currentWinner.winnerId` exists and `majorDraw.edit` is held
- [ ] The `majorDraw.selectWinner` / `majorDraw.edit` permission gates
- [ ] The `configurationLocked` notice

Note: `handleExport` currently exports directly from two buttons. The design routes `Export pool` through `ExportModal` (two format cards, accent ring on the selected one). Keep `handleExport` as the download implementation and let the modal call it.

- [ ] **Step 7: Verify**

`/admin/major-draw` at both viewports and themes, and against a draw in each status: `queued`, `active`, `frozen`, `completed`, `cancelled`. The ribbon eyebrow, the action availability and the gates must each read correctly in all five.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/draws src/app/admin/component/MajorDrawManagement.tsx docs/admin/frontend.md
git commit -m "feat(admin-draws): rebuild the Major Draw ribbon, gates, entry pool and rules"
```

---

# Phase 5 — Modals and mobile

### Task 10: Group the draws modals

**Files:**
- Create: `src/components/modals/draws/index.ts`
- Move: 6 modals into `src/components/modals/draws/` (git mv — preserve history)
- Modify: every importer
- Docs: `docs/shared-ui/`, `docs/admin/frontend.md`

`src/components/modals/` is 62 flat entries. Every draws modal is in there with no marker that they belong together, which is what makes the set hard to reason about and hard to extend.

**Naming:** the folder is `draws/`, matching the existing `draws` domain in the Domain Manifest — not a new synonym. **Component names do not change.** `WinnerSelectionModal` stays `WinnerSelectionModal` even though the design titles it "Record winner": the design string is user-visible copy, the identifier is codebase vocabulary, and renaming both at once forks the vocabulary for no functional gain.

- [ ] **Step 1: Move, don't rewrite**

```bash
git mv src/components/modals/WinnerSelectionModal src/components/modals/draws/WinnerSelectionModal
git mv src/components/modals/WinnerEditModal.tsx src/components/modals/draws/WinnerEditModal.tsx
git mv src/components/modals/ParticipantsModal.tsx src/components/modals/draws/ParticipantsModal.tsx
git mv src/components/modals/ExportModal.tsx src/components/modals/draws/ExportModal.tsx
git mv src/components/modals/AdminMajorDrawModal src/components/modals/draws/AdminMajorDrawModal
git mv src/components/modals/MajorDrawEditModal.tsx src/components/modals/draws/MajorDrawEditModal.tsx
git mv src/components/modals/AdminMiniDrawModal.tsx src/components/modals/draws/AdminMiniDrawModal.tsx
git mv src/components/modals/MiniDrawEditModal.tsx src/components/modals/draws/MiniDrawEditModal.tsx
```

`ConfirmationModal.tsx` stays put — 20+ non-draws callers.

- [ ] **Step 2: Add the barrel**

```ts
// src/components/modals/draws/index.ts
//
// Every modal reachable from the four admin draws pages. Grouped so the set is
// discoverable and extendable — `src/components/modals/` is otherwise 60+ flat
// entries with no signal about which belong together.
//
// Shared primitives (Button, Input, ModalContainer, …) stay in
// `src/components/modals/ui/` — they are not draws-specific.
// ConfirmationModal stays at `src/components/modals/` — 20+ non-draws callers.

export { default as WinnerSelectionModal } from "./WinnerSelectionModal";
export type { WinnerSelectionData } from "./WinnerSelectionModal";
export { default as WinnerEditModal } from "./WinnerEditModal";
export { default as ParticipantsModal } from "./ParticipantsModal";
export { default as ExportModal } from "./ExportModal";

// Create and edit are separate components on purpose — create owns the
// scheduled-months restriction and the date auto-derivation, edit owns the
// configurationLocked gating. They share field sections, not a `mode` prop.
// See Task 11 for the measurements behind that call.
export { default as AdminMajorDrawModal } from "./AdminMajorDrawModal";
export { default as MajorDrawEditModal } from "./MajorDrawEditModal";

// The mini-draw pair DID collapse — identical field sets, different submit target.
export { default as MiniDrawFormModal } from "./MiniDrawFormModal";
export { default as DrawLockedModal } from "./DrawLockedModal";
```

At Task 10 time, `MiniDrawFormModal` and `DrawLockedModal` do not exist yet — export `AdminMiniDrawModal` and `MiniDrawEditModal` instead and swap those two lines when Tasks 11–12 land.

- [ ] **Step 3: Update every importer**

```bash
grep -rln "modals/WinnerSelectionModal\|modals/WinnerEditModal\|modals/ParticipantsModal\|modals/ExportModal\|modals/AdminMajorDrawModal\|modals/MajorDrawEditModal\|modals/AdminMiniDrawModal\|modals/MiniDrawEditModal" src/
```

Known importers: the four tab components, `overview/sections/QuickActionsCard.tsx`, and `src/components/dev/ModalsGalleryClient.tsx` — which also carries a **path map** (`"admin-major-draw-create": "src/components/modals/AdminMajorDrawModal.tsx"`) that must be corrected, not just the import.

- [ ] **Step 4: Verify nothing dangles**

```bash
npm run type-check && npm run lint
```

Then open `/dev` modals gallery and confirm every draws modal still opens and its source path label is right.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/modals docs/
git commit -m "refactor(admin-draws): group draws modals under modals/draws with a barrel"
```

---

### Task 11: `DrawModalShell` + de-duplicate the create/edit pairs

**Files:**
- Create: `src/components/modals/draws/DrawModalShell.tsx`
- Create: `src/components/modals/draws/sections/` — the shared major-draw field sections
- Create: `src/components/modals/draws/MiniDrawFormModal.tsx` (merges `AdminMiniDrawModal` + `MiniDrawEditModal`)
- Modify: `src/components/modals/draws/AdminMajorDrawModal/`, `MajorDrawEditModal.tsx` — both consume the shared sections; **both survive**
- Delete: `AdminMiniDrawModal.tsx`, `MiniDrawEditModal.tsx` once every caller is migrated
- Docs: `docs/admin/frontend.md`

**Interfaces:**
- Produces:
  - `<DrawModalShell eyebrow title onClose footer isSubmitting errorCount>{body}</DrawModalShell>`
  - `<MiniDrawFormModal mode="create" | "edit" miniDraw={…|null} onSave onClose isSaving />`

#### The two pairs are not the same problem — treat them differently

An earlier draft of this plan said "merge both create/edit pairs into one mode-driven form each." That is **wrong for the major-draw pair.** Verified against the code:

| | `AdminMajorDrawModal` (create) | `MajorDrawEditModal` (edit) |
|---|---|---|
| Fetches `/scheduled-months` for restricted months | yes | **no** |
| Defaults draw date to 8:30 PM AEST (today or tomorrow) | yes | no |
| Auto-derives `activationDate` from the previous draw | yes | no |
| Auto-derives `freezeEntriesAt` (−30 min) | yes | no |
| 30-minute freeze↔draw discrepancy warning | yes | no |
| Terms section | yes | no |
| `configurationLocked` gating | no | yes |

`grep -c` for that create-only cluster returns **12 hits in create, 0 in edit**. A `mode` prop would fork the date section, the restricted-months fetch, the terms section, the lock gating and the submit target — that is most of the component. The result is one file with two disjoint halves behind conditionals: harder to read than two files, with a much larger regression surface across a create flow and an edit flow that are both live. **Do not merge them.**

What *is* duplicated between them is the **field markup** — and only the create side has it factored out (`BasicInfoSection`, `PrizeDetailsSection`, `DateConfigSection`, `PrizeImageUpload`), while `MajorDrawEditModal` is a 558-line monolith that re-inlines the same fields. So the correct de-duplication is to lift the sections up and have the edit modal consume them. Same fields, one definition; two workflows, two components.

**UPDATE 2026-07-30 — the mini-draw pair does NOT merge either.** The plan said it did, on the basis that both render the identical field set (name, description, `prize.name`, `prize.description`, `brandId`, `prize.value`, images, `minimumEntries`, `status`). That was read off the field *labels*. Reading the *contracts* shows they differ where it matters:

| | `AdminMiniDrawModal` (create) | `MiniDrawEditModal` (edit) |
|---|---|---|
| Image type | `File[]` — not-yet-uploaded | `string[]` — already-hosted URLs |
| Transport | `multipart/form-data` via `FormData` | JSON payload |
| Who submits | Itself → `POST /api/admin/mini-draw/create` | Delegates `onSave(payload)`; the **parent** PUTs |

A `mode` prop would have to fork the image handling, the body encoding and the submit ownership — i.e. everything except the labels. Merging means unifying the upload transport across two live flows, which is a real migration, not a tidy-up.

**Both pairs therefore stay as separate components.** The lesson generalises: matching field labels are not evidence of a duplicate; matching *contracts* are. Where the real duplication lives (the field markup) the fix is the same for both pairs — extract shared field sections, leave each modal owning its own transport. That work is deferred rather than half-done, because the image-type split (`File[]` vs `string[]`) means the shared component needs a union image prop and both live flows re-tested.

`DrawModalShell` wraps the existing `ModalContainer` — it does not replace it. `ModalContainer` already provides the portal, the `bg-black/85 backdrop-blur-md` scrim that matches the spec exactly, mobile bottom-sheet presentation, and focus handling. `DrawModalShell` adds only what is missing: the eyebrow+title+close header, the `--panel2` right-aligned footer, the `N field needs attention` hint, and the pending-state treatment.

- [ ] **Step 1: Build the shell's four behaviours**

| Behaviour | Spec |
|---|---|
| Validation | Required fields validate **on submit, not on blur**. An empty field gets a red border + `0 0 0 3px var(--accent-soft)` ring, an inline message below it, and a `1 field needs attention` hint in the footer (pluralise). Typing clears the error immediately. |
| Pending | The primary swaps its label for a 13px spinner + `Saving…` / `Deleting…`, drops to `.82` opacity and `cursor: progress`, and ignores further clicks. Drive it from the real request, not a timer. |
| Success | On resolve the modal closes and a toast appears bottom-centre: green, 11px radius, check icon, one sentence naming what happened, a dismiss button, 3.6s auto-dismiss. Use the existing `useToast()` — do not build a second toast system. |
| Mobile | Bottom sheet with a 38×4 grab handle and `--m-sheetRadius`. `ModalContainer` already does the sheet; add the handle. |

- [ ] **Step 2a: Lift the major-draw field sections (no merge)**

`git mv` `BasicInfoSection.tsx`, `PrizeDetailsSection.tsx`, `DateConfigSection.tsx`, `PrizeImageUpload.tsx` out of `AdminMajorDrawModal/` into `draws/sections/`, generalising each to take its values and change handler as props. Then rewrite `MajorDrawEditModal`'s inline fields to consume the same sections.

Per the design, the sections are: Basic information (name, status, description) · Prize details (name, value, description, 25-image gallery with cover badge) · Important dates (activation / freeze / draw) · Draw links (result + watch).

Keep create-only behaviour where it lives: the restricted-months fetch, the date auto-derivation and the 30-minute warning stay inside `AdminMajorDrawModal`; `configurationLocked` gating stays inside `MajorDrawEditModal`. `DateConfigSection` must therefore accept its dates as controlled props and stay ignorant of *how* they were derived.

Both keep their existing endpoints: create posts `/api/admin/major-draw/create`, edit PUTs `/api/admin/major-draw/update?id=…`.

- [ ] **Step 2b: Merge the mini-draw pair**

Diff the two field sets and take the **union** before deleting either file. `MiniDrawFormModal` renders one body; `mode` selects the submit target (`/api/admin/mini-draw/create` vs `/api/admin/mini-draw/update`), the title (`New mini draw` / `Edit mini draw`), the CTA (`Create mini draw` / `Save mini draw`), and whether `displayOrder` + the lock notice render.

- [ ] **Step 3: Prefilled fields use `defaultValue`**

Twelve fields in this design open with a value. A `value` prop with no `onChange` renders a field the admin cannot type into — the single easiest defect to ship here. Audit every field in both merged forms.

- [ ] **Step 4: Extend `ImageUpload` for the prize gallery**

`ImageUpload` already supports `maxImages` (default 4), drop-or-browse, and the `n/max` count. The design needs three additions:
- `maxImages={25}` — a prop, no change needed
- a `Cover` badge on the first tile
- drag-to-reorder — use `@dnd-kit`, already a dependency (`MiniDrawManagement` uses it)

Live hint line: `3 of 25 images · drag to reorder · first image is the cover`.

- [ ] **Step 5: Verify every caller**

```bash
npm run type-check && npm run lint
```

Create **and** edit a major draw; create **and** edit a mini draw. Confirm the Overview quick action still creates. Confirm no field present in the old create form went missing in the merge — this is the step where a silent field loss would slip through.

- [ ] **Step 6: Commit**

```bash
git add -A src/components/modals/draws docs/admin/frontend.md
git commit -m "refactor(admin-draws): add DrawModalShell and merge the create/edit modal pairs"
```

---

### Task 12: `DrawLockedModal` + restyle the remaining modals

**Files:**
- Create: `src/components/modals/draws/DrawLockedModal.tsx`
- Modify: `WinnerSelectionModal`, `WinnerEditModal`, `ParticipantsModal`, `ExportModal` — restyle onto `DrawModalShell`
- Modify: `src/app/admin/component/UpcomingDraws.tsx` (replace the Task 6 fallback banner)
- Docs: `docs/admin/frontend.md`

- [ ] **Step 1: `DrawLockedModal`**

Lock icon, an explanation of why config locks, and a table of what is still editable. Primary: `Got it`. Every edit entry point on a locked draw routes here instead of the form — inspector primary, row action, mobile bar, all through the single guard from Task 6 Step 2.

- [ ] **Step 2: Restyle the four remaining modals**

| Modal | Body |
|---|---|
| Record winner | Entrant search that filters live · radio-style entrant list with entry counts · prize field · winner photo tile · testimony editor · draw-result link. Primary `Publish winner`. |
| Edit winner & testimony | Same, pre-filled. Primary `Save changes`. |
| Export participants | Two format cards (CSV per-entry, Excel summary); the selected card gets an accent ring. Primary `Download CSV` / `Download XLSX`. |
| Participants | Search by name / email / mobile · participant rows with entry chips · pagination footer. Primary `Close`. |

- [ ] **Step 3: Participants list — one deliberate divergence**

The design specifies read-only rows. **Keep the existing click-through** to the admin user modal (`useAdminUserModal`), the pointer cursor and the focus ring. Leave a comment recording that this is an intentional divergence so a future reader does not "correct" it toward the spec.

Everything else in the design's participants spec applies: 8 per page, `Previous`/`Next` dimmed to `.6` with `cursor: not-allowed` at the ends, a live `Showing 9–16 of 4,182 participants` range, and the no-match state — search icon, `No participant matches that search`, and a sentence suggesting a partial surname, an email domain, or an unspaced mobile.

- [ ] **Step 4: Verify**

Open all eight draws modals at both viewports and both themes. Check: Escape closes the topmost layer (dropdown → modal → drawer); Tab cycles within an open modal and does not escape it; opening a modal focuses its first control.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/modals/draws src/app/admin/component/UpcomingDraws.tsx docs/admin/frontend.md
git commit -m "feat(admin-draws): add the locked-draw notice and restyle the draws modals"
```

---

### Task 13: Mobile pass

**Files:**
- Modify: the four tab components and the `src/components/admin/draws/` primitives
- Docs: `docs/admin/frontend.md`

Everything below 900px. The sidebar drawer and hamburger already exist in `AdminPage.tsx` — do not rebuild them.

- [ ] **Step 1: Per-page mobile layouts**

| Page | Mobile |
|---|---|
| Major Draw | Ribbon collapses to a single card with three labelled stats (entries / revenue / to freeze) stacked over a 44px full-width `Record winner`. Prize and gates cards stack. A 60px bottom action bar is pinned. |
| Mini Draws | Chip row scrolls horizontally; cards go 2-up. |
| Results / Upcoming | Table becomes a card list; tapping a card opens the same content as a bottom sheet. |

- [ ] **Step 2: Audit the tap targets**

Every interactive element must be ≥44px. All five height tokens resolve to 44px on mobile, so a control that reads lower is a control that hardcoded a pixel value — fix it by giving it a token, not by patching the height.

The one legitimate exception: the bare `<input>` inside a bordered search row is `align-self: stretch` in a 44px wrapper, so its content box measures 41.8px while the tappable row is the full 44px.

- [ ] **Step 3: Verify**

390×844 on every page, both themes, all four table states. Confirm the mobile card list and the desktop rows both call the same `onSelect`. Re-check 899px vs 901px.

- [ ] **Step 4: Run the full definition of done**

```bash
npm run lint && npm run type-check && npm run test:draw-revenue && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add -A src docs
git commit -m "feat(admin-draws): mobile layouts, sheets and bottom action bar"
```

---

## Definition of done

- [ ] `npm run lint` clean
- [ ] `npm run type-check` clean
- [ ] `npm run test:draw-revenue` passes
- [ ] `npm run build` succeeds
- [ ] All four pages at 390 / 899 / 901 / 1440, light and dark
- [ ] All four table states reachable and correct on both list pages
- [ ] Every capability listed in Task 5 Step 3, Task 8 Step 2 and Task 9 Step 6 verified by hand
- [ ] `docs/admin/frontend.md` and `docs/admin/api.md` updated; doc-sync hook passes
- [ ] Norm lockstep decision made and recorded (Task 3 Step 5)
- [ ] No `value`-without-`onChange` on any prefilled field
- [ ] No control with a hardcoded height

## Explicitly out of scope

- Any change to `MajorDraw`, `MiniDraw`, `Winner` or `PaymentEvent` schemas
- Any change to permissions or to `ADMIN_TAB_GROUPS`
- Rebuilding the admin shell, sidebar, or mobile drawer
- The `+9%` / `+7%` KPI deltas (no prior-period data — decision 2)
- An `Edit prize` button on Major Draw (decision 3)
- Making participant rows read-only (decision 4)
- Trimming the Mini Draws card to the design's two actions (decision 5)
- **Reviving** `/api/major-draw/stats` — the hook that calls it is deleted instead (decision 7 / Cleanup task)

---

## Cleanup task: delete the dead major-draw stats hook

**Files:**
- Modify: `src/hooks/queries/useMajorDrawQueries.ts`
- Docs: `docs/metrics-analytics/` or `docs/draws/` depending on where the hook is documented

`useMajorDrawStats()` fetches `/api/major-draw/stats`. That route does not exist — `ls src/app/api/major-draw/` returns `completed`, `next`, `route.ts`, `select-winner`, `user-entries`. Nothing imports the hook. Its `MajorDrawStats` interface declares `totalRevenue`, `topParticipants` and `dailyEntries[].revenue`, which is precisely what made per-draw revenue look implemented during the audit.

Run this **after** Task 3, so the real revenue path exists before the fake one is removed.

- [ ] **Step 1: Re-confirm it is dead before deleting**

```bash
grep -rn "useMajorDrawStats\|MajorDrawStats\b" src/ --include=*.ts --include=*.tsx | grep -v "useMajorDrawQueries.ts"
```

Expected: only `UserMajorDrawStats` hits (a **different**, live type — `useUserMajorDrawStats` is used by `my-account`, `RewardsRedemption` and `Header`). If anything references `MajorDrawStats` or `useMajorDrawStats` itself, stop and report instead of deleting.

- [ ] **Step 2: Delete the hook and its interface**

Remove the `MajorDrawStats` interface (around lines 63–86) and the `useMajorDrawStats` hook (around line 178). Leave `UserMajorDrawStats` and `useUserMajorDrawStats` completely alone — the names are one word apart and deleting the wrong one breaks three live surfaces.

Also check `queryKeys` for an orphaned key the hook was the only consumer of, and remove it if so.

- [ ] **Step 3: Verify**

```bash
npm run type-check && npm run lint
```

Then smoke `/my-account`, `/rewards` and the header entry-count badge — the three `useUserMajorDrawStats` consumers.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/queries/useMajorDrawQueries.ts docs/
git commit -m "chore(admin-draws): remove dead useMajorDrawStats hook and its unbacked type"
```

## Notes on rule 11 (customer-facing copy)

These are admin-only surfaces, so the free-entry / no-gambling copy rules do not bind the UI strings here. But `WinnerSelectionModal` and `WinnerEditModal` author the **testimony** and **prize** text that renders publicly on `/winners`. Do not add helper text, placeholders or examples to those fields that model gambling framing — no "odds", "chances", "lottery", "raffle". Placeholder copy in an admin field becomes customer-facing copy the moment someone accepts the suggestion.
