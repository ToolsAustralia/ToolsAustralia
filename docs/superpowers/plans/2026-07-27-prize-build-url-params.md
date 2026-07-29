# Prize Build in URL Params — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Build your prize" selection stay in place on `/promotions/*` (no scroll jump, no navigation), mirror the chosen build into URL params, and carry that build through visit → signup → purchase analytics.

**Architecture:** React state owns the selection; the URL is a **write-mostly mirror** updated with `window.history.replaceState` (never `router.replace`, which triggers an RSC refetch and resets scroll). Params are read **once on mount** and win over the page slug. The pathname keeps meaning "the landing page"; the new `builtPrizeSlug` field is **additive** across `PromoAnalyticsVisit`, `User.signupAttribution` and `PaymentEvent.data`.

**Tech Stack:** Next.js 15.5.9 App Router, React 19, TypeScript, Mongoose, Zod, standalone `tsx` test scripts (no jest/vitest).

**Spec:** [`docs/superpowers/specs/2026-07-27-prize-build-url-params-design.md`](../specs/2026-07-27-prize-build-url-params-design.md)

## Global Constraints

- **Commits require explicit user authorization** (CLAUDE.md rule 1). The user has **not** authorized commits in the session that produced this plan. Before the first `git commit` step, **ask** — do not commit on your own. All commit steps below are gated on that authorization.
- **Doc-sync Stop hook is active** (CLAUDE.md rule 2). Every task that edits `src/**` must update the matching `docs/<domain>/` in the **same** task or the Stop hook blocks.
- **`src/models/User.ts` and `src/app/api/auth/**` are CUSTOMER.md triggers** (verified in `.claude/hooks/doc-sync.mjs:58-77`). Task 8 **must** touch `CUSTOMER.md`.
- **New files must be covered by the Domain Manifest** in `CLAUDE.md`, or the hook reports an orphan. Task 6 adds the one manifest entry this plan needs.
- **No new test runner.** Tests are standalone `tsx` scripts using `node:assert/strict` and the file's own `run(name, fn)` harness. Every new test file needs a matching `test:*` entry in `package.json` or it is undiscoverable.
- **Layering** (CLAUDE.md): no API calls from `src/components/**` — beacons live in `src/hooks/**`. Route handlers stay thin and delegate.
- **Customer-facing copy:** no new customer strings in this plan. If any are added, CLAUDE.md rule 11 applies (never "odds"/"chances"/"lottery"; entries are a free inclusion, never sold).
- **Pre-existing blocker:** an uncommitted `package.json` change already in this worktree makes the doc-sync hook report the `infrastructure` domain stale. Resolve that separately before landing Phase 1.

## File Structure

**Create**
| File | Responsibility |
|---|---|
| `src/hooks/usePrizeBuildTracking.ts` | Debounced build/engagement beacon. A hook because components must not call APIs. |
| `src/app/api/tracking/promo-prize-build/route.ts` | Thin shell: validate → `after()` → delegate. |
| `src/utils/promo-analytics/record-prize-build.ts` | Functional core with injected deps, mirroring `record-promo-visit.ts`. |
| `src/utils/promo-analytics/__tests__/record-prize-build.test.ts` | Unit test for the core. |

**Modify**
| File | Change |
|---|---|
| `src/components/sections/promo/prize-selection/utils.ts` | `?toolset=` vocabulary, selection href builder, shared slug resolver |
| `src/components/sections/promo/prize-selection/index.ts` | Re-export the new helpers |
| `src/components/sections/promo/PrizeShowcase.tsx` | `replaceState`, mount-only hydration, beacon wiring |
| `src/components/sections/promo/prize-selection/__tests__/prize-builder-model.test.ts` | Replace the `?toolbox=`-omission tests |
| `src/models/PromoAnalyticsVisit.ts` | 3 optional fields |
| `src/repositories/PromoAnalyticsRepository.ts` | `updateVisitBuild` + build aggregation |
| `src/services/promo-analytics/PromoAnalyticsService.ts` | `recordPrizeBuild` |
| `src/models/User.ts` | `signupAttribution.builtPrizeSlug` |
| `src/app/api/auth/register/route.ts` | Accept + persist `builtPrizeSlug` |
| `src/components/modals/MembershipModal/index.tsx` | Send `builtPrizeSlug` |
| `src/utils/payment/payment-processing.ts` | Copy `builtPrizeSlug` onto the payment event |
| `src/components/admin/PromoAnalyticsManagement.tsx` | Replace the dead Cross-visits column |
| `CLAUDE.md` | Manifest entry for the new hook |
| `package.json` | `test:prize-build` script |

**No new file for the param vocabulary.** `prize-selection/utils.ts` is already "slug parsing, `?toolbox=` handling" — CLAUDE.md rule 4 says use the existing file.

---

# Phase 1 — In-place selection + URL round-trip

Ships the UX win with zero backend work.

## Task 1: `?toolset=` vocabulary and the selection href builder

**Files:**
- Modify: `src/components/sections/promo/prize-selection/utils.ts`
- Modify: `src/components/sections/promo/prize-selection/index.ts`
- Test: `src/components/sections/promo/prize-selection/__tests__/prize-builder-model.test.ts:246-290`

**Interfaces:**
- Consumes: `TOOLBOXES`, `TOOLSETS`, `ToolboxType`, `ToolboxBrand`, `ToolsetType` from `./constants`; `PrizeSelection`, `fromPrizeSlug` from `./prize-builder-model` (verified no import cycle — `prize-builder-model.ts` imports only `@/config/prize-summaries` and `./constants`).
- Produces:
  - `TOOLSET_QUERY_PARAM: "toolset"`
  - `parseToolsetQueryParam(raw: string | null | undefined): ToolsetType | null`
  - `buildPrizeSelectionHref(pathname: string, currentSearchParams: URLSearchParams, selection: PrizeSelection): string`
  - `resolveBuiltPrizeSlug(params: URLSearchParams, fallbackSlug: string): string`
  - `TOOLBOX_QUERY_PARAM`, `parseToolboxQueryParam` unchanged in name and behaviour.
  - `buildToolsetLandingHref` is **removed** (replaced by `buildPrizeSelectionHref`).

- [ ] **Step 1: Replace the three `?toolbox=` round-trip tests with the new contract**

In `__tests__/prize-builder-model.test.ts`, replace the whole block from
`console.log("\nToolset landing pages — ?toolbox= round-trip");` through the end of the
`"the cash opt-out round-trips, and other query params survive"` block with:

```ts
/* -------------------------------------------------------------------------- */
console.log("\nPrize build — ?toolset= / ?toolbox= round-trip");
/* -------------------------------------------------------------------------- */

run("both lanes are always written explicitly, including the page default", () => {
  // Decision 5 of the spec: presence of params IS the engagement signal, so once the
  // visitor touches a reel we write BOTH lanes even when a value equals the default.
  // Omitting the default (the old behaviour) made "tried Milwaukee, switched back" look
  // identical to "never touched the reels".
  const href = buildPrizeSelectionHref("/promotions/makita", new URLSearchParams(), {
    toolbox: "milwaukee",
    toolset: "makita",
    isCash: false,
  });
  const params = new URLSearchParams(href.split("?")[1]);
  assert.equal(params.get(TOOLBOX_QUERY_PARAM), "milwaukee", "the default toolbox must still be written");
  assert.equal(params.get(TOOLSET_QUERY_PARAM), "makita", "the toolset lane must be written");
});

run("every lane value round-trips through its parser", () => {
  for (const toolbox of TOOLBOXES.map((b) => b.id)) {
    for (const toolset of TOOLSETS.map((s) => s.id)) {
      const href = buildPrizeSelectionHref("/promotions/makita", new URLSearchParams(), {
        toolbox,
        toolset,
        isCash: false,
      });
      const params = new URLSearchParams(href.split("?")[1]);
      assert.equal(parseToolboxQueryParam(params.get(TOOLBOX_QUERY_PARAM)), toolbox);
      assert.equal(parseToolsetQueryParam(params.get(TOOLSET_QUERY_PARAM)), toolset);
    }
  }
});

run("the cash opt-out round-trips, and other query params survive", () => {
  const href = buildPrizeSelectionHref("/promotions/makita", new URLSearchParams("aff=ABC"), {
    toolbox: "kincrome",
    toolset: "makita",
    isCash: true,
  });
  const params = new URLSearchParams(href.split("?")[1]);
  assert.equal(parseToolboxQueryParam(params.get(TOOLBOX_QUERY_PARAM)), "cash");
  assert.equal(params.get("aff"), "ABC", "an affiliate code must never be dropped by a build change");
});

run("switching replaces a value rather than appending a second one", () => {
  const href = buildPrizeSelectionHref(
    "/promotions/makita",
    new URLSearchParams("toolbox=sidchrome&toolset=ryobi&aff=ABC"),
    { toolbox: "kincrome", toolset: "dewalt", isCash: false }
  );
  const params = new URLSearchParams(href.split("?")[1]);
  assert.deepEqual(params.getAll(TOOLBOX_QUERY_PARAM), ["kincrome"]);
  assert.deepEqual(params.getAll(TOOLSET_QUERY_PARAM), ["dewalt"]);
  assert.equal(params.get("aff"), "ABC");
});

run("garbage lane values are rejected, not passed through", () => {
  assert.equal(parseToolsetQueryParam("garbage"), null);
  assert.equal(parseToolsetQueryParam(""), null);
  assert.equal(parseToolsetQueryParam(null), null);
  assert.equal(parseToolboxQueryParam("garbage"), null);
});

run("parsers accept every registry id — a new brand must not need a second edit", () => {
  // The old hand-written VALID_TOOLBOX_QUERY_VALUES set would silently reject a 4th
  // toolbox until someone remembered to edit it. Both parsers now derive from the registries.
  for (const b of TOOLBOXES) assert.equal(parseToolboxQueryParam(b.id), b.id);
  for (const s of TOOLSETS) assert.equal(parseToolsetQueryParam(s.id), s.id);
  assert.equal(parseToolboxQueryParam("cash"), "cash", "cash is the opt-out, not a registry brand");
});

/* -------------------------------------------------------------------------- */
console.log("\nBuilt prize slug resolution (shared by the card and the signup modal)");
/* -------------------------------------------------------------------------- */

run("no params means untouched — the page's own prize is the built prize", () => {
  assert.equal(
    resolveBuiltPrizeSlug(new URLSearchParams(), "makita-milwaukee"),
    "makita-milwaukee"
  );
});

run("params compose into the built prize slug", () => {
  assert.equal(
    resolveBuiltPrizeSlug(new URLSearchParams("toolset=ryobi&toolbox=kincrome"), "makita-milwaukee"),
    "ryobi-kincrome"
  );
});

run("one lane present falls back to the page's own value for the other", () => {
  assert.equal(
    resolveBuiltPrizeSlug(new URLSearchParams("toolset=ryobi"), "makita-milwaukee"),
    "ryobi-milwaukee"
  );
  assert.equal(
    resolveBuiltPrizeSlug(new URLSearchParams("toolbox=kincrome"), "makita-milwaukee"),
    "makita-kincrome"
  );
});

run("cash wins over both lanes", () => {
  assert.equal(
    resolveBuiltPrizeSlug(new URLSearchParams("toolset=ryobi&toolbox=cash"), "makita-milwaukee"),
    CASH_OPTION.slug
  );
});

run("a toolset landing fallback that is not a composite still resolves", () => {
  // `/promotions/makita` passes its DEFAULT PRIZE slug (makita-milwaukee), never the bare
  // brand — but guard the bare form so a caller mistake degrades instead of composing junk.
  assert.equal(resolveBuiltPrizeSlug(new URLSearchParams(), "makita"), "makita");
});

run("every resolvable build is a real catalog prize", () => {
  const catalogSlugs = new Set(PRIZE_SUMMARIES.map((p) => p.slug));
  for (const toolbox of TOOLBOXES.map((b) => b.id)) {
    for (const toolset of TOOLSETS.map((s) => s.id)) {
      const slug = resolveBuiltPrizeSlug(
        new URLSearchParams(`toolset=${toolset}&toolbox=${toolbox}`),
        "makita-milwaukee"
      );
      assert.ok(catalogSlugs.has(slug), `${slug} must exist in the catalog`);
    }
  }
});
```

Update the import block at the top of the test file (replace the `../utils` import line):

```ts
import {
  TOOLBOX_QUERY_PARAM,
  TOOLSET_QUERY_PARAM,
  buildPrizeSelectionHref,
  parseToolboxQueryParam,
  parseToolsetQueryParam,
  resolveBuiltPrizeSlug,
} from "../utils";
```

`TOOLSET_LANDING_SLUGS` / `getDefaultPrizeForToolsetSlug` are no longer used by this block —
if TypeScript reports them unused after the edit, delete them from the import (repo convention
prefers genuine deletion over `_` prefixing, per `docs/UNUSED-VARS-CONVENTIONS.md`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:prize-builder`
Expected: FAIL — `buildPrizeSelectionHref is not exported` / `parseToolsetQueryParam is not a function`.

- [ ] **Step 3: Implement the new vocabulary in `utils.ts`**

Replace the entire body of `src/components/sections/promo/prize-selection/utils.ts` below its
header comment with:

```ts
import { CASH_OPTION, TOOLBOXES, TOOLSETS, type ToolboxType, type ToolsetType } from "./constants";
import { fromPrizeSlug, type PrizeSelection } from "./prize-builder-model";

/** Query key for the toolbox lane, e.g. `?toolbox=kincrome`. `cash` is the opt-out. */
export const TOOLBOX_QUERY_PARAM = "toolbox";

/** Query key for the power-toolset lane, e.g. `?toolset=makita`. */
export const TOOLSET_QUERY_PARAM = "toolset";

// Derived from the registries, NOT hand-written: a hard-coded set silently rejects a newly
// added brand until someone remembers to edit it here too.
const VALID_TOOLBOX_QUERY_VALUES = new Set<string>([...TOOLBOXES.map((b) => b.id), "cash"]);
const VALID_TOOLSET_QUERY_VALUES = new Set<string>(TOOLSETS.map((s) => s.id));

/** Parses `?toolbox=`. Invalid or empty values return null (caller falls back to its default). */
export function parseToolboxQueryParam(raw: string | null | undefined): ToolboxType | null {
  if (raw == null || raw === "") return null;
  const normalized = raw.toLowerCase().trim();
  if (!VALID_TOOLBOX_QUERY_VALUES.has(normalized)) return null;
  return normalized as ToolboxType;
}

/** Parses `?toolset=`. Invalid or empty values return null (caller falls back to its default). */
export function parseToolsetQueryParam(raw: string | null | undefined): ToolsetType | null {
  if (raw == null || raw === "") return null;
  const normalized = raw.toLowerCase().trim();
  if (!VALID_TOOLSET_QUERY_VALUES.has(normalized)) return null;
  return normalized as ToolsetType;
}

/**
 * Writes BOTH lanes onto the current path, preserving every other param (`aff`, `packages`,
 * UTMs).
 *
 * Both lanes are written explicitly, including when a value equals the page's own default.
 * That is deliberate: the presence of these params is what distinguishes "engaged with the
 * reels" from "never touched them". The URL only stays clean while the visitor has not
 * interacted, because nothing calls this until the first selection.
 */
export function buildPrizeSelectionHref(
  pathname: string,
  currentSearchParams: URLSearchParams,
  selection: PrizeSelection
): string {
  const params = new URLSearchParams(currentSearchParams.toString());
  params.set(TOOLSET_QUERY_PARAM, selection.toolset);
  params.set(TOOLBOX_QUERY_PARAM, selection.isCash ? "cash" : selection.toolbox);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * The prize a visitor actually has on screen, from the URL params plus the page's own prize.
 *
 * Shared deliberately: `PrizeShowcase` and the signup modal must derive the built prize the
 * SAME way, or the visit row and the signup row would disagree and the funnel numbers would
 * silently drift.
 *
 * No params at all means the visitor never touched the reels, so the page's own prize IS the
 * build. Composition is pure string work over already-validated lane values; the catalog check
 * lives with the caller (`PrizeShowcase` sends the resolved `activeSlug`; the signup path is
 * gated server-side by `isValidPromoSlug`), which keeps the client prize catalog out of this
 * module's import graph.
 */
export function resolveBuiltPrizeSlug(params: URLSearchParams, fallbackSlug: string): string {
  const toolset = parseToolsetQueryParam(params.get(TOOLSET_QUERY_PARAM));
  const toolbox = parseToolboxQueryParam(params.get(TOOLBOX_QUERY_PARAM));
  if (!toolset && !toolbox) return fallbackSlug;
  if (toolbox === "cash") return CASH_OPTION.slug;

  const fromFallback = fromPrizeSlug(fallbackSlug);
  const resolvedToolset = toolset ?? fromFallback?.toolset;
  const resolvedToolbox = (toolbox as Exclude<ToolboxType, "cash"> | null) ?? fromFallback?.toolbox;
  if (!resolvedToolset || !resolvedToolbox) return fallbackSlug;
  return `${resolvedToolset}-${resolvedToolbox}`;
}
```

- [ ] **Step 4: Re-export from the barrel**

In `src/components/sections/promo/prize-selection/index.ts`, replace the `./utils` export block:

```ts
export {
  TOOLBOX_QUERY_PARAM,
  TOOLSET_QUERY_PARAM,
  parseToolboxQueryParam,
  parseToolsetQueryParam,
  buildPrizeSelectionHref,
  resolveBuiltPrizeSlug,
} from "./utils";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:prize-builder`
Expected: PASS, all assertions green.

- [ ] **Step 6: Type-check**

Run: `npm run type-check`
Expected: PASS. If it reports `buildToolsetLandingHref` missing, that is Task 2's job — proceed.

---

## Task 2: Wire `PrizeShowcase` to `replaceState` + mount-only hydration

**Files:**
- Modify: `src/components/sections/promo/PrizeShowcase.tsx`

**Interfaces:**
- Consumes: `buildPrizeSelectionHref`, `parseToolboxQueryParam`, `parseToolsetQueryParam`, `TOOLBOX_QUERY_PARAM`, `TOOLSET_QUERY_PARAM` from `./prize-selection` (Task 1).
- Produces: no new exports. `activeSlug` (already computed) becomes the value Phase 2's beacon sends.

- [ ] **Step 1: Swap the imports**

In the `./prize-selection` import block (`PrizeShowcase.tsx:29-46`), replace
`buildToolsetLandingHref` with `buildPrizeSelectionHref` and add
`parseToolsetQueryParam` and `TOOLSET_QUERY_PARAM`.

- [ ] **Step 2: Replace `syncToolboxQuery` with `syncSelectionQuery`**

Replace lines 198-207 (`const toolboxQueryValue = …` through the end of `syncToolboxQuery`) with:

```tsx
  const isPromoPage = pathname?.startsWith("/promotions/") ?? false;

  /**
   * Mirror the current build into the URL.
   *
   * `window.history.replaceState`, NOT `router.replace`: the router resets scroll to the top
   * even with `{ scroll: false }` — measured on production 2026-07-27, scrollY 2769 -> 0 about
   * 100ms after a reel click, with the page height unchanged and no route loader. The same
   * finding (an RSC refetch on every `router.replace`) is documented at
   * `useMembershipModalDeepLink.ts:97-107`. `replaceState` cannot scroll and adds no history
   * entry, so Back still leaves the page instead of undoing one reel spin at a time.
   *
   * Reads `window.location.search` rather than the `searchParams` snapshot: successive writes
   * must build on the URL as it actually is now, and `replaceState` does not refresh that hook.
   */
  const syncSelectionQuery = useCallback(
    (next: { toolbox: ToolboxBrand; toolset: ToolsetType; isCash: boolean }) => {
      if (!isPromoPage || !pathname) return;
      window.history.replaceState(
        null,
        "",
        buildPrizeSelectionHref(pathname, new URLSearchParams(window.location.search), next)
      );
    },
    [isPromoPage, pathname]
  );
```

- [ ] **Step 3: Replace the every-change hydration effect with a one-shot mount read**

Replace lines 209-220 (the `// Toolset landing pages: hydrate the toolbox lane…` effect) with:

```tsx
  /**
   * Mount-only URL hydration. Params WIN over the page's own prize, so a refresh, a Back, or a
   * shared link reopens the exact build.
   *
   * Deliberately one-shot. The previous version re-read `?toolbox=` on every change, creating a
   * URL -> state -> URL round trip; React state is the single owner and the URL is a
   * write-mostly mirror. On statically prerendered promo pages the first paint uses the page
   * default and this applies on hydration — the same accepted flip as `?packages=`.
   */
  const hydratedFromUrl = useRef(false);
  useEffect(() => {
    if (hydratedFromUrl.current || !isPromoPage) return;
    hydratedFromUrl.current = true;
    const params = new URLSearchParams(window.location.search);
    const toolboxFromUrl = parseToolboxQueryParam(params.get(TOOLBOX_QUERY_PARAM));
    const toolsetFromUrl = parseToolsetQueryParam(params.get(TOOLSET_QUERY_PARAM));
    if (!toolboxFromUrl && !toolsetFromUrl) return;
    setIsCash(toolboxFromUrl === "cash");
    setSelection((prev) => ({
      toolbox: toolboxFromUrl && toolboxFromUrl !== "cash" ? toolboxFromUrl : prev.toolbox,
      toolset: toolsetFromUrl ?? prev.toolset,
    }));
  }, [isPromoPage]);
```

- [ ] **Step 4: Clear stale params when the page's own prize changes**

Replace the body of the `appliedSlugProp` effect (lines 228-234) with:

```tsx
  useEffect(() => {
    if (!slugProp || slugProp === appliedSlugProp.current) return;
    appliedSlugProp.current = slugProp;
    const next = resolveStateForSlug(slugProp);
    setSelection(next.selection);
    setIsCash(next.isCash);
    // The page's own prize changed under us (a client transition inside `[slug]` reuses this
    // component). Any build params still in the URL describe the PREVIOUS page, so drop them —
    // otherwise page A's build leaks onto page B and is attributed there.
    if (isPromoPage && pathname) {
      const params = new URLSearchParams(window.location.search);
      if (params.has(TOOLBOX_QUERY_PARAM) || params.has(TOOLSET_QUERY_PARAM)) {
        params.delete(TOOLBOX_QUERY_PARAM);
        params.delete(TOOLSET_QUERY_PARAM);
        const qs = params.toString();
        window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
      }
    }
  }, [slugProp, isPromoPage, pathname]);
```

- [ ] **Step 5: Update the three selection handlers**

Replace lines 263-281 (`handleSelectToolbox` / `handleSelectToolset` / `handleSelectCash`) with:

```tsx
  const handleSelectToolbox = (id: ToolboxBrand) => {
    setSelection((prev) => ({ ...prev, toolbox: id }));
    setIsCash(false);
    rememberToolbox(id);
    syncSelectionQuery({ toolbox: id, toolset: selection.toolset, isCash: false });
  };

  const handleSelectToolset = (id: ToolsetType) => {
    setSelection((prev) => ({ ...prev, toolset: id }));
    setIsCash(false);
    // Picking from EITHER reel leaves cash mode, so this path must clear `?toolbox=cash` too.
    syncSelectionQuery({ toolbox: selection.toolbox, toolset: id, isCash: false });
  };

  const handleSelectCash = (next: boolean) => {
    setIsCash(next);
    syncSelectionQuery({ ...selection, isCash: next });
  };
```

- [ ] **Step 6: Remove the now-unused `router`**

`useRouter` was only used by `syncToolboxQuery`. Delete the `const router = useRouter();` line and
drop `useRouter` from the `next/navigation` import (keep `useSearchParams` and `usePathname` —
`searchParams` is still read elsewhere; if `type-check` reports it unused, delete it too).

- [ ] **Step 7: Type-check and lint**

Run: `npm run type-check && npm run lint`
Expected: PASS.

- [ ] **Step 8: Manual verification — the whole point of this phase**

Run: `npm run dev`, open `/promotions/makita`, scroll to "Build your prize".

| Check | Expected |
|---|---|
| Click a toolbox card | Page does **not** move. Run `let y=scrollY` in the console before, compare after — delta 0. |
| Click a toolset card | Same, and `?toolset=` appears |
| Watch the dev server terminal | **No** `GET /promotions/makita` RSC refetch on either click |
| Refresh after switching | Reopens on the same build |
| Open `…/makita?toolset=ryobi&toolbox=kincrome` | Card opens on Ryobi + Kincrome |
| Press Back after 6 spins | Leaves the page (one step) |
| Land, touch nothing | URL stays clean |
| `…/makita?aff=ABC&packages=one-time`, then switch | Both params survive |
| `…/makita?toolset=garbage&toolbox=garbage` | Falls back to the page default, no crash |
| Repeat the first two on `/promotions/milwaukee-kincrome` | Same behaviour on an evergreen prize page |

---

## Task 3: Phase 1 documentation

**Files:**
- Modify: `docs/promo/frontend.md` (the "Behaviour change: `/promotions/*` selection is now IN PLACE" section, ~line 400)
- Modify: `docs/promo/gotchas.md`
- Modify: `docs/shared-ui/frontend.md` and `docs/shared-ui/gotchas.md`

> **Both domains are required.** `src/components/sections/**` maps to the **shared-ui** domain in
> the CLAUDE.md manifest (line 676), not promo (line 425 covers only `src/components/promo/**`).
> The Stop hook keys off the manifest, so shared-ui docs are what unblocks it — but the
> prize-builder narrative lives in `docs/promo/frontend.md`, which is where a reader looks. The
> prize-builder redesign commit `87f18d78` updated both for exactly this reason. Put the full
> narrative in `docs/promo/` and a short pointer + the component-level note in `docs/shared-ui/`.

- [ ] **Step 1: Update `docs/promo/frontend.md`**

Replace the `**`?toolbox=` sync on toolset landing pages**` bullet with:

```markdown
- **`?toolset=` + `?toolbox=` sync on every `/promotions/*` page** (both brand landing pages and
  evergreen prize pages). Written with `window.history.replaceState` via
  `buildPrizeSelectionHref`, read back **once on mount** by `parseToolsetQueryParam` /
  `parseToolboxQueryParam`. Params win over the page's own prize, so a refresh or a shared link
  restores the exact build.
  - **Both lanes are always written, including the page default.** The old behaviour omitted
    `?toolbox=milwaukee` for a clean canonical URL, which made "tried another brand and switched
    back" indistinguishable from "never touched the reels". The URL stays clean until the first
    interaction instead — nothing is written until then.
  - **Never `router.replace`.** It resets scroll even with `{ scroll: false }` (see gotchas).
  - **Mount-only read.** Re-reading the URL on every change created a URL -> state -> URL round
    trip. React state owns the selection; the URL mirrors it.
```

- [ ] **Step 2: Add the gotcha to `docs/promo/gotchas.md`**

```markdown
### `router.replace` resets scroll on the prize builder — use `history.replaceState`

Picking a toolbox on `/promotions/makita` used to snap the visitor to the top of the page.
Measured on production 2026-07-27: `scrollY` 2769 -> 0 roughly 100ms after the click, with
`document.scrollHeight` unchanged (9122) and no route loader — so not a re-render collapse and
not a navigation. It is the App Router resetting scroll **despite** `{ scroll: false }`.

`PrizeShowcase` therefore mirrors the build with `window.history.replaceState`, which cannot
scroll and triggers no RSC refetch. Same root cause and same fix as the note at
`useMembershipModalDeepLink.ts:97-107`.

**Only the lanes that wrote to the URL ever jumped** — the toolbox lane and the cash opt-out.
The toolset lane wrote nothing, which is why it never jumped and also why the chosen brand was
invisible to analytics until the build params landed.

Use `replaceState`, never `pushState`: Back must leave the page, not step back through builds.
```

- [ ] **Step 3: Confirm the doc-sync hook is satisfied**

Run: `npm run type-check && npm run lint`
Then finish the turn and confirm the Stop hook does not report `promo` stale. If it reports the
pre-existing `infrastructure` / `package.json` staleness, that is the known blocker in Global
Constraints — resolve separately.

- [ ] **Step 4: Commit (ASK FIRST)**

Ask the user: *"Phase 1 is done and verified — want me to commit it?"* Only on an explicit yes:

```bash
git add src/components/sections/promo/PrizeShowcase.tsx \
        src/components/sections/promo/prize-selection/utils.ts \
        src/components/sections/promo/prize-selection/index.ts \
        src/components/sections/promo/prize-selection/__tests__/prize-builder-model.test.ts \
        docs/promo/frontend.md docs/promo/gotchas.md
git commit -m "fix(promo): keep prize-builder selection in place — replaceState, both lanes in the URL

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

# Phase 2 — Visit-level build + engagement

## Task 4: Visit model fields, repository update, service, functional core

**Files:**
- Modify: `src/models/PromoAnalyticsVisit.ts`
- Modify: `src/repositories/PromoAnalyticsRepository.ts`
- Modify: `src/services/promo-analytics/PromoAnalyticsService.ts`
- Create: `src/utils/promo-analytics/record-prize-build.ts`
- Create: `src/utils/promo-analytics/__tests__/record-prize-build.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `PromoPageType` from `@/models/PromoAnalyticsVisit`; `isValidPromoSlug`, `getPageTypeFromSlug` from `@/utils/promo-analytics/validate-promo-slug`.
- Produces:
  - `PromoAnalyticsRepository.updateVisitBuild(args: { anonymousId: string; slug: string; pageType: PromoPageType; builtPrizeSlug: string; toolboxSwitches: number; toolsetSwitches: number }): Promise<boolean>` — `true` when a row was updated.
  - `PromoAnalyticsService.recordPrizeBuild(data: same shape): Promise<{ success: boolean; error?: string }>`
  - `recordPrizeBuild(capture: PrizeBuildCapture, deps: PrizeBuildDeps): Promise<PrizeBuildOutcome>` from `record-prize-build.ts`
  - Types `PrizeBuildCapture`, `PrizeBuildDeps`, `PrizeBuildOutcome`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/promo-analytics/__tests__/record-prize-build.test.ts`:

```ts
/**
 * Prize-build recorder — regression guard for the build/engagement beacon's core.
 *
 * Run: `npm run test:prize-build`
 *
 * Side effects are injected, so this asserts the ORCHESTRATION with no DB:
 *  - a bogus built slug never reaches the database;
 *  - a missing visit row is a silent no-op and NEVER creates a row (that would inflate visits);
 *  - switch counts are passed through as absolute totals (the beacon is idempotent).
 */

import assert from "node:assert/strict";
import { recordPrizeBuild } from "../record-prize-build";

let failures = 0;
function run(name: string, fn: () => void | Promise<void>) {
  const done = (error?: unknown) => {
    if (error) {
      failures++;
      console.error(`  ✗ ${name}`);
      console.error(`    ${error instanceof Error ? error.message : String(error)}`);
    } else {
      console.log(`  ✓ ${name}`);
    }
  };
  try {
    const result = fn();
    if (result instanceof Promise) return result.then(() => done()).catch(done);
    done();
  } catch (error) {
    done(error);
  }
  return Promise.resolve();
}

// No `pageType` here on purpose: the core derives it from `slug`, so the two can never
// disagree. The assertion below checks the DERIVED value that reaches the database.
const baseCapture = {
  slug: "makita",
  builtPrizeSlug: "makita-kincrome",
  toolboxSwitches: 2,
  toolsetSwitches: 1,
  anonymousId: "anon-1" as string | undefined,
};

async function main() {
  console.log("\nPrize build recorder");

  await run("a valid build updates the visit row with absolute totals", async () => {
    const calls: unknown[] = [];
    const outcome = await recordPrizeBuild(baseCapture, {
      updateVisitBuild: async (payload) => {
        calls.push(payload);
        return true;
      },
    });
    assert.deepEqual(outcome, { recorded: true });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      anonymousId: "anon-1",
      slug: "makita",
      pageType: "toolset",
      builtPrizeSlug: "makita-kincrome",
      toolboxSwitches: 2,
      toolsetSwitches: 1,
    });
  });

  await run("an unknown built prize slug is rejected before any write", async () => {
    let called = false;
    const outcome = await recordPrizeBuild(
      { ...baseCapture, builtPrizeSlug: "not-a-real-prize" },
      {
        updateVisitBuild: async () => {
          called = true;
          return true;
        },
      }
    );
    assert.equal(outcome.recorded, false);
    assert.equal(called, false, "a bogus slug must never reach the database");
  });

  await run("an unknown LANDING slug is rejected before any write", async () => {
    let called = false;
    const outcome = await recordPrizeBuild(
      { ...baseCapture, slug: "not-a-real-page" },
      {
        updateVisitBuild: async () => {
          called = true;
          return true;
        },
      }
    );
    assert.equal(outcome.recorded, false);
    assert.equal(called, false);
  });

  await run("no anonymousId is a no-op — there is no row to attach the build to", async () => {
    let called = false;
    const outcome = await recordPrizeBuild(
      { ...baseCapture, anonymousId: undefined },
      {
        updateVisitBuild: async () => {
          called = true;
          return true;
        },
      }
    );
    assert.equal(outcome.recorded, false);
    assert.equal(called, false);
  });

  await run("no matching visit row is a silent no-op, never a create", async () => {
    const outcome = await recordPrizeBuild(baseCapture, {
      updateVisitBuild: async () => false,
    });
    assert.deepEqual(outcome, { recorded: false, reason: "no_visit_row" });
  });

  await run("a write failure is reported, not thrown", async () => {
    const outcome = await recordPrizeBuild(baseCapture, {
      updateVisitBuild: async () => {
        throw new Error("mongo down");
      },
    });
    assert.equal(outcome.recorded, false);
    assert.match(String((outcome as { reason: string }).reason), /mongo down/);
  });

  await run("negative or absurd switch counts are clamped", async () => {
    const calls: { toolboxSwitches: number; toolsetSwitches: number }[] = [];
    await recordPrizeBuild(
      { ...baseCapture, toolboxSwitches: -5, toolsetSwitches: 999_999 },
      {
        updateVisitBuild: async (p) => {
          calls.push(p);
          return true;
        },
      }
    );
    assert.equal(calls[0].toolboxSwitches, 0, "negative counts clamp to 0");
    assert.ok(calls[0].toolsetSwitches <= 1000, "absurd counts clamp to a sane ceiling");
  });

  console.log(failures === 0 ? "\nAll passed\n" : `\n${failures} failed\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
```

Register the script in `package.json` beside `test:promo-visit`:

```json
"test:prize-build": "tsx src/utils/promo-analytics/__tests__/record-prize-build.test.ts",
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:prize-build`
Expected: FAIL — cannot find module `../record-prize-build`.

- [ ] **Step 3: Add the three optional model fields**

In `src/models/PromoAnalyticsVisit.ts`, add to `IPromoAnalyticsVisit` after `referrerSlug`:

```ts
  /** Prize the visitor assembled in "Build your prize" (e.g. "makita-kincrome", "cash-prize"). */
  builtPrizeSlug?: string;
  /** How many times they changed the toolbox lane on this page. 0/absent = never engaged. */
  toolboxSwitches?: number;
  /** How many times they changed the power-toolset lane on this page. */
  toolsetSwitches?: number;
```

and to the schema after the `referrerSlug` field:

```ts
    builtPrizeSlug: {
      type: String,
      required: false,
      trim: true,
      lowercase: true,
    },
    toolboxSwitches: {
      type: Number,
      required: false,
      min: 0,
    },
    toolsetSwitches: {
      type: Number,
      required: false,
      min: 0,
    },
```

Add one index beside the existing ones (the Phase 4 breakdown groups on this):

```ts
PromoAnalyticsVisitSchema.index({ builtPrizeSlug: 1, timestamp: -1 });
```

All three are optional, so every existing document stays valid — no migration, no backfill.

- [ ] **Step 4: Add the repository update**

In `src/repositories/PromoAnalyticsRepository.ts`, add after `createVisit`:

```ts
  /**
   * Attach the built prize + engagement counters to a visitor's most recent visit row.
   *
   * `upsert: false` and sorted newest-first: this must NEVER create a row. The visit row is
   * created once on landing; creating another here would double-count visits, which is the one
   * number this whole feature must leave untouched. Returns false when there is nothing to
   * update (dedup race, expired TTL, or a visitor whose landing beacon never landed).
   *
   * `$set` with absolute totals, not `$inc`: the client sends cumulative counts, so a retry or
   * a double flush (debounce + pagehide) is harmless.
   */
  async updateVisitBuild(args: {
    anonymousId: string;
    slug: string;
    pageType: PromoPageType;
    builtPrizeSlug: string;
    toolboxSwitches: number;
    toolsetSwitches: number;
  }): Promise<boolean> {
    await connectDB();
    const result = await PromoAnalyticsVisit.findOneAndUpdate(
      {
        anonymousId: args.anonymousId,
        slug: args.slug.toLowerCase().trim(),
        pageType: args.pageType,
      },
      {
        $set: {
          builtPrizeSlug: args.builtPrizeSlug.toLowerCase().trim(),
          toolboxSwitches: args.toolboxSwitches,
          toolsetSwitches: args.toolsetSwitches,
        },
      },
      { sort: { timestamp: -1 }, new: false, upsert: false }
    )
      .maxTimeMS(5000)
      .lean();
    return result != null;
  }
```

- [ ] **Step 5: Add the service method**

In `src/services/promo-analytics/PromoAnalyticsService.ts`, add after `recordVisit`:

```ts
  /**
   * Attach a built prize + engagement counters to an existing visit row.
   * Validates BOTH slugs — the landing page and the built prize must be real.
   */
  async recordPrizeBuild(data: {
    anonymousId: string;
    slug: string;
    builtPrizeSlug: string;
    toolboxSwitches: number;
    toolsetSwitches: number;
  }): Promise<{ success: boolean; error?: string }> {
    if (!isValidPromoSlug(data.slug)) {
      return { success: false, error: "Invalid promotion slug" };
    }
    if (!isValidPromoSlug(data.builtPrizeSlug)) {
      return { success: false, error: "Invalid built prize slug" };
    }
    const updated = await PromoAnalyticsRepository.updateVisitBuild({
      anonymousId: data.anonymousId,
      slug: data.slug.toLowerCase().trim(),
      pageType: getPageTypeFromSlug(data.slug),
      builtPrizeSlug: data.builtPrizeSlug.toLowerCase().trim(),
      toolboxSwitches: data.toolboxSwitches,
      toolsetSwitches: data.toolsetSwitches,
    });
    return updated ? { success: true } : { success: false, error: "no_visit_row" };
  }
```

- [ ] **Step 6: Write the functional core**

Create `src/utils/promo-analytics/record-prize-build.ts`:

```ts
/**
 * Functional core for attaching a built prize to a promo visit: validate -> clamp -> persist.
 *
 * Side effects are INJECTED so this is unit-testable with no DB. The route is the imperative
 * shell and calls this inside Next's `after()`, mirroring `record-promo-visit.ts`.
 *
 * @see src/app/api/tracking/promo-prize-build/route.ts
 * @see docs/promo/backend.md
 */
import { getPageTypeFromSlug, isValidPromoSlug } from "@/utils/promo-analytics/validate-promo-slug";
import type { PromoPageType } from "@/models/PromoAnalyticsVisit";

/** Upper bound on a plausible per-page switch count; anything above is a bug or abuse. */
const MAX_SWITCHES = 1000;

export interface PrizeBuildCapture {
  /**
   * The LANDING page slug (pathname), never the built prize. `pageType` is deliberately NOT a
   * field here — it is derived from this slug, so the two can never disagree.
   */
  slug: string;
  /** The prize the visitor assembled. */
  builtPrizeSlug: string;
  toolboxSwitches: number;
  toolsetSwitches: number;
  anonymousId?: string;
}

export interface PrizeBuildDeps {
  updateVisitBuild: (payload: {
    anonymousId: string;
    slug: string;
    pageType: PromoPageType;
    builtPrizeSlug: string;
    toolboxSwitches: number;
    toolsetSwitches: number;
  }) => Promise<boolean>;
}

export type PrizeBuildOutcome = { recorded: true } | { recorded: false; reason: string };

const clamp = (n: number): number => {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), MAX_SWITCHES);
};

export async function recordPrizeBuild(
  capture: PrizeBuildCapture,
  deps: PrizeBuildDeps
): Promise<PrizeBuildOutcome> {
  // No anonymousId means there is no visit row to attach to. Never create one here: the visit
  // count is the number this feature must leave untouched.
  if (!capture.anonymousId) return { recorded: false, reason: "no_anonymous_id" };

  const slug = capture.slug.toLowerCase().trim();
  const builtPrizeSlug = capture.builtPrizeSlug.toLowerCase().trim();
  if (!isValidPromoSlug(slug)) return { recorded: false, reason: "invalid_slug" };
  if (!isValidPromoSlug(builtPrizeSlug)) return { recorded: false, reason: "invalid_built_slug" };

  try {
    const updated = await deps.updateVisitBuild({
      anonymousId: capture.anonymousId,
      slug,
      pageType: getPageTypeFromSlug(slug),
      builtPrizeSlug,
      toolboxSwitches: clamp(capture.toolboxSwitches),
      toolsetSwitches: clamp(capture.toolsetSwitches),
    });
    return updated ? { recorded: true } : { recorded: false, reason: "no_visit_row" };
  } catch (error) {
    return { recorded: false, reason: error instanceof Error ? error.message : "update_failed" };
  }
}
```

> `pageType` is derived from the landing slug inside the core, never accepted as input, so the
> two can never disagree. The Step 1 assertion checks the derived value `"toolset"`, which is
> what `getPageTypeFromSlug("makita")` returns.

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm run test:prize-build`
Expected: PASS, 7 assertions green.

- [ ] **Step 8: Verify nothing else regressed**

Run: `npm run test:promo-visit && npm run type-check`
Expected: PASS.

---

## Task 5: The beacon — route, hook, wiring, manifest

**Files:**
- Create: `src/app/api/tracking/promo-prize-build/route.ts`
- Create: `src/hooks/usePrizeBuildTracking.ts`
- Modify: `src/components/sections/promo/PrizeShowcase.tsx`
- Modify: `CLAUDE.md` (Domain Manifest)

**Interfaces:**
- Consumes: `recordPrizeBuild` + types from Task 4; `AnonymousIdService.extractAnonymousId`; `PromoAnalyticsService.recordPrizeBuild`.
- Produces: `usePrizeBuildTracking(args: { enabled: boolean; landingSlug: string | undefined; builtPrizeSlug: string; toolboxSwitches: number; toolsetSwitches: number }): void`

- [ ] **Step 1: Add the manifest entry FIRST**

`src/hooks/usePrizeBuildTracking.ts` matches no existing glob — the doc-sync hook would report it
as an orphan. In `CLAUDE.md`'s Domain Manifest, in the `promo` domain's `paths` array, add after
`"src/hooks/usePromoPageTracking.ts"`:

```json
        "src/hooks/usePrizeBuildTracking.ts",
```

Edit **only this worktree's** `CLAUDE.md`.

> **Corrected 2026-07-28.** An earlier draft of this step said to edit "both `CLAUDE.md` files".
> That was wrong. `C:/Codes/ToolsAustralia` is the **main-branch checkout of this same repo**
> (`git worktree list`), and `CLAUDE.md` is a tracked file — so editing it there would dirty
> main's working tree with a redundant uncommitted change that merging this branch makes anyway.
> One edit, in the branch, is correct and sufficient.

- [ ] **Step 2: Write the route (thin shell)**

Create `src/app/api/tracking/promo-prize-build/route.ts`:

```ts
import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import AnonymousIdService from "@/services/ab-testing/AnonymousIdService";
import PromoAnalyticsService from "@/services/promo-analytics/PromoAnalyticsService";
import { recordPrizeBuild } from "@/utils/promo-analytics/record-prize-build";

const promoPrizeBuildSchema = z.object({
  slug: z.string().min(1).max(100),
  builtPrizeSlug: z.string().min(1).max(100),
  toolboxSwitches: z.number().int().min(0).max(10_000),
  toolsetSwitches: z.number().int().min(0).max(10_000),
});

/**
 * POST /api/tracking/promo-prize-build
 *
 * Attaches the prize a visitor assembled in "Build your prize" — plus how much they engaged
 * with the reels — to the visit row created on landing. No auth; keyed by the anonymousId
 * cookie.
 *
 * This is deliberately a SECOND beacon rather than extra fields on
 * `/api/tracking/promo-page-visit`: visits must be recorded on landing regardless of whether
 * anyone interacts, so delaying that beacon to wait for a build would lose every bounced
 * visitor.
 *
 * DB work runs in `after()` for the same reason as the visit beacon — this fires from the
 * highest-traffic ad-landing path, and a stalled Mongo connection must never 504 it. See the
 * long note in `promo-page-visit/route.ts`.
 *
 * @see docs/promo/api.md
 */
export async function POST(request: NextRequest) {
  let validatedData: z.infer<typeof promoPrizeBuildSchema>;
  try {
    const body = await request.json();
    validatedData = promoPrizeBuildSchema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  // Read from `request` synchronously — it must not be touched inside `after()`.
  const anonymousId = AnonymousIdService.extractAnonymousId(request) ?? undefined;

  after(async () => {
    try {
      const outcome = await recordPrizeBuild(
        {
          slug: validatedData.slug,
          builtPrizeSlug: validatedData.builtPrizeSlug,
          toolboxSwitches: validatedData.toolboxSwitches,
          toolsetSwitches: validatedData.toolsetSwitches,
          anonymousId,
        },
        {
          updateVisitBuild: async (payload) => {
            const result = await PromoAnalyticsService.recordPrizeBuild({
              anonymousId: payload.anonymousId,
              slug: payload.slug,
              builtPrizeSlug: payload.builtPrizeSlug,
              toolboxSwitches: payload.toolboxSwitches,
              toolsetSwitches: payload.toolsetSwitches,
            });
            return result.success;
          },
        }
      );

      // "no_visit_row" is an expected outcome (dedup race, TTL, no landing beacon) — not an error.
      if (!outcome.recorded && outcome.reason !== "no_visit_row") {
        console.error("[promo-prize-build] recordPrizeBuild failed:", outcome.reason);
      }
    } catch (error) {
      console.error("[promo-prize-build] deferred tracking error:", error);
    }
  });

  return NextResponse.json({ success: true, message: "Build tracked" });
}
```

- [ ] **Step 3: Write the hook**

Create `src/hooks/usePrizeBuildTracking.ts`:

```ts
"use client";

import { useCallback, useEffect, useRef } from "react";

/** Settle window after the last reel change before the build is reported. */
const DEBOUNCE_MS = 1000;

interface UsePrizeBuildTrackingArgs {
  /** Only `/promotions/*` surfaces report a build — elsewhere there is no visit row. */
  enabled: boolean;
  /** The LANDING page slug (from the pathname), never the built prize. */
  landingSlug: string | undefined;
  /** Catalog-resolved slug of what is on screen. */
  builtPrizeSlug: string;
  toolboxSwitches: number;
  toolsetSwitches: number;
}

/**
 * Reports the prize a visitor assembled, plus how much they engaged with the reels.
 *
 * Debounced so flicking through five brands is one write, not five, and flushed on `pagehide`
 * so a fast bouncer is still captured. Counts are CUMULATIVE, and the server `$set`s them, so a
 * double flush (debounce landing and then `pagehide`) is idempotent.
 *
 * Sends nothing until the visitor has actually switched something — an untouched page already
 * has a correct visit row and a zero-switch write would be pure noise.
 *
 * Lives in a hook, not in `PrizeShowcase`, because components must not call APIs
 * (CLAUDE.md layering).
 *
 * @see docs/promo/frontend.md
 */
export function usePrizeBuildTracking({
  enabled,
  landingSlug,
  builtPrizeSlug,
  toolboxSwitches,
  toolsetSwitches,
}: UsePrizeBuildTrackingArgs): void {
  // Latest values, so the unload listeners never send a stale build. Written in an effect
  // rather than during render — a render-phase write is impure and can be discarded.
  const latest = useRef({ landingSlug, builtPrizeSlug, toolboxSwitches, toolsetSwitches });
  useEffect(() => {
    latest.current = { landingSlug, builtPrizeSlug, toolboxSwitches, toolsetSwitches };
  });

  const lastSent = useRef<string | null>(null);

  /**
   * Stable across renders (no reactive deps — everything is read from refs), so the unload
   * listeners below can be registered ONCE instead of being torn down and re-added on every
   * reel switch.
   */
  const send = useCallback((useBeacon: boolean) => {
    const { landingSlug: slug, builtPrizeSlug: built, toolboxSwitches: tb, toolsetSwitches: ts } =
      latest.current;
    if (!slug || !built) return;
    if (tb === 0 && ts === 0) return; // never engaged — the visit row is already correct
    const payload = JSON.stringify({
      slug,
      builtPrizeSlug: built,
      toolboxSwitches: tb,
      toolsetSwitches: ts,
    });
    if (payload === lastSent.current) return; // nothing changed since the last report
    lastSent.current = payload;

    const url = "/api/tracking/promo-prize-build";
    // `sendBeacon` survives the page going away; the debounced path uses `fetch` so the
    // request carries normal headers and is visible in the network tab during dev.
    if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
      return;
    }
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // Fire-and-forget: a lost build report must never surface to the visitor.
    });
  }, []);

  // Debounce: restarted on every change, so five quick switches are one write.
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => send(false), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [enabled, builtPrizeSlug, toolboxSwitches, toolsetSwitches, send]);

  /**
   * Unload flush, registered ONCE per mount.
   *
   * Deliberately a separate effect from the debounce above: if these listeners lived in that
   * effect they would be re-registered on every reel switch, and a handler added with an
   * inline arrow cannot be removed — one leaked `visibilitychange` listener per switch.
   * Both handlers are named so both are removed.
   */
  useEffect(() => {
    if (!enabled) return;
    const onPageHide = () => send(true);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") send(true);
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, send]);
}
```

> **Why two effects, not one:** the debounce must restart on every change, but the unload
> listeners must be registered once. Combining them re-registers the listeners on every switch,
> and the original inline-arrow `visibilitychange` handler could never be removed — leaking one
> listener per switch. Keep them separate.

- [ ] **Step 4: Count switches and call the hook in `PrizeShowcase`**

Add beside the other state (after `const [isCash, setIsCash] = useState(initial.isCash);`):

```tsx
  // Engagement counters — how much the visitor played with each lane on this page.
  // Absent/zero on the visit row means "never touched the reels", which is the thing the
  // always-write-both-params rule exists to keep distinguishable.
  const [toolboxSwitches, setToolboxSwitches] = useState(0);
  const [toolsetSwitches, setToolsetSwitches] = useState(0);
```

Increment inside the handlers from Task 2 — in `handleSelectToolbox` add
`setToolboxSwitches((n) => n + 1);`, in `handleSelectToolset` add
`setToolsetSwitches((n) => n + 1);`, and in `handleSelectCash` add
`setToolboxSwitches((n) => n + 1);` (cash is the toolbox lane's opt-out).

Then call the hook after `activeSlug` is available:

```tsx
  // `activeSlug` is the CATALOG-RESOLVED prize, so we never report a combination that has no
  // entry (`usePrizeCatalog` falls back). `slugProp` is the page's own prize; the landing slug
  // for attribution is the pathname segment, which is what the visit row was keyed on.
  const landingSlug = isPromoPage ? pathname?.split("/")[2] : undefined;
  usePrizeBuildTracking({
    enabled: isPromoPage,
    landingSlug,
    builtPrizeSlug: activeSlug,
    toolboxSwitches,
    toolsetSwitches,
  });
```

Add the import: `import { usePrizeBuildTracking } from "@/hooks/usePrizeBuildTracking";`

- [ ] **Step 5: Type-check and lint**

Run: `npm run type-check && npm run lint`
Expected: PASS.

- [ ] **Step 6: Manual end-to-end verification**

Run `npm run dev`, open `/promotions/makita`, switch the toolset twice and the toolbox once,
wait ~2s, then in a Mongo shell or Compass:

```js
db.promoanalyticsvisits.find({ slug: "makita" }).sort({ timestamp: -1 }).limit(2)
```

| Check | Expected |
|---|---|
| Row count for this anonymousId + slug | **exactly one** — the beacon must update, never create |
| `builtPrizeSlug` | matches what is on screen |
| `toolboxSwitches` / `toolsetSwitches` | 1 and 2 |
| Switch again, wait, re-query | same single row, counters incremented |
| Load the page and touch nothing | row exists with **no** `builtPrizeSlug` and no counters |

---

## Task 6: Phase 2 documentation

**Files:**
- Modify: `docs/promo/api.md`, `docs/promo/models.md`, `docs/promo/backend.md`, `docs/promo/frontend.md`, `docs/promo/testing.md`
- Modify: `docs/mongodb/` (the repository lives under the `mongodb` domain glob `src/repositories/PromoAnalyticsRepository.ts`)

- [ ] **Step 1: Document the endpoint in `docs/promo/api.md`**

Add a section covering: method + path, the Zod request shape, the `after()` deferral rationale,
that it **updates and never creates**, and that `no_visit_row` is an expected non-error outcome.

- [ ] **Step 2: Document the fields in `docs/promo/models.md`**

Add `builtPrizeSlug`, `toolboxSwitches`, `toolsetSwitches` to the `PromoAnalyticsVisit` table,
stating that `slug` remains the **landing page** and the build is **additive**, that all three
are optional so no migration is required, and that the `{ builtPrizeSlug: 1, timestamp: -1 }`
index backs the Phase 4 breakdown.

- [ ] **Step 3: Document the core + repository in `docs/promo/backend.md` and the `mongodb` domain docs**

Record why `updateVisitBuild` uses `upsert: false` + newest-first sort (creating a row would
inflate the visit count) and why it `$set`s absolute totals rather than `$inc` (idempotent
against the debounce/`pagehide` double-flush).

- [ ] **Step 4: Add the test to `docs/promo/testing.md`**

Add `npm run test:prize-build` beside `npm run test:promo-visit` with a one-line description.

- [ ] **Step 5: Commit (ASK FIRST)**

Ask before committing. On an explicit yes, commit Phase 2's source + docs together.

---

# Phase 3 — Signup + purchase attribution

## Task 7: Send and persist `builtPrizeSlug` at signup

**Files:**
- Modify: `src/components/modals/MembershipModal/index.tsx:1443-1500`
- Modify: `src/app/api/auth/register/route.ts:72, 208-245`
- Modify: `src/models/User.ts:259-275, 1036-1060`

**Interfaces:**
- Consumes: `resolveBuiltPrizeSlug` from `@/components/sections/promo/prize-selection` (Task 1).
- Produces: `User.signupAttribution.builtPrizeSlug?: string`; register accepts `builtPrizeSlug`.

- [ ] **Step 1: Add the field to the `User` model**

In the `signupAttribution` interface block, after `promotionSlug`:

```ts
    /** Prize the visitor had assembled in "Build your prize" when they registered. */
    builtPrizeSlug?: string;
```

and in the schema, after the `promotionSlug` field:

```ts
      builtPrizeSlug: {
        type: String,
        trim: true,
        lowercase: true,
      },
```

Add an index beside the existing signup-attribution one:

```ts
UserSchema.index({ "signupAttribution.builtPrizeSlug": 1, createdAt: 1 });
```

- [ ] **Step 2: Accept it at the register boundary**

In `src/app/api/auth/register/route.ts`, add to the Zod schema beside `promotionSlug`:

```ts
  builtPrizeSlug: z.string().optional(), // Prize assembled in "Build your prize" at signup
```

Change `buildSignupAttribution`'s signature and body:

```ts
function buildSignupAttribution(
  promotionSlug?: string,
  attribution?: AttributionParams,
  builtPrizeSlug?: string
): {
  promotionPageType?: "evergreen" | "toolset";
  promotionSlug?: string;
  builtPrizeSlug?: string;
  visitedAt: Date;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  campaignId?: string;
  adsetId?: string;
  adId?: string;
} | undefined {
```

Inside, after the existing `hasPromo` line add:

```ts
  // Validated exactly like promotionSlug — a hand-edited URL or a crawler must not be able to
  // write an arbitrary string into attribution.
  const hasBuiltPrize = !!builtPrizeSlug && isValidPromoSlug(builtPrizeSlug);
```

and in the returned object, immediately after the `...(hasPromo && { … })` spread:

```ts
    ...(hasBuiltPrize && { builtPrizeSlug: builtPrizeSlug!.toLowerCase().trim() }),
```

Update **ALL FOUR** call sites to pass the third argument:
`buildSignupAttribution(validatedData.promotionSlug, attribution, validatedData.builtPrizeSlug)`.

> **Corrected 2026-07-28.** An earlier draft named only `route.ts:487`. There are **four**
> distinct registration paths, each writing `signupAttribution`, and missing any one silently
> drops the build for that class of visitor (exactly the "walk through every possible user path"
> trap in CLAUDE.md rule 6):
>
> | Line | Path |
> |---|---|
> | 487 | existing **plain account**, matched on email AND mobile → update |
> | 627 | existing plain account, **email-only** match → update |
> | 720 | existing plain account, **mobile-only** match → update |
> | 803 | **no existing account** → create new user (the main new-visitor path) |
>
> Verify with `grep -n "buildSignupAttribution(" src/app/api/auth/register/route.ts` that exactly
> four call sites exist and all four were updated. If the count differs from four, stop and report
> — the file has changed since this plan was written.

> `hasBuiltPrize` deliberately does **not** join the `if (!hasPromo && !hasAttribution) return undefined;`
> guard: a built prize only ever exists alongside a promo slug, and widening that guard could
> start persisting attribution for visitors who previously had none.

- [ ] **Step 3: Send it from the modal**

In `src/components/modals/MembershipModal/index.tsx`, directly after the existing
`promotionSlug` extraction block (~line 1450), add:

```tsx
    // The build the visitor had on screen. Derived with the SAME helper the prize card uses —
    // two independent derivations would drift and the signup rows would stop agreeing with the
    // visit rows. Falls back to the page's own prize when they never touched the reels.
    let builtPrizeSlug: string | undefined;
    try {
      if (promotionSlug && typeof window !== "undefined") {
        builtPrizeSlug = resolveBuiltPrizeSlug(
          new URLSearchParams(window.location.search),
          promotionSlug
        );
      }
    } catch {
      // Non-blocking — never fail registration on attribution derivation.
    }
```

Add to the register POST body, after `promotionSlug: promotionSlug,`:

```tsx
          ...(builtPrizeSlug ? { builtPrizeSlug } : {}),
```

Add the import:

```tsx
import { resolveBuiltPrizeSlug } from "@/components/sections/promo/prize-selection";
```

> **Watch the bundle:** import from the barrel only if `type-check` shows no runtime pull-in of
> the reel components. If the barrel drags UI in, import directly from
> `@/components/sections/promo/prize-selection/utils` instead — that module imports only
> `constants` and `prize-builder-model`.

- [ ] **Step 4: Verify the fallback semantics against the real flow**

`/promotions/makita` passes `slug={defaultPrizeSlug}` = `makita-milwaukee`, but the **pathname**
segment is `makita`. `promotionSlug` here comes from the pathname, so an untouched page yields
`resolveBuiltPrizeSlug(<empty>, "makita")` → `"makita"`. That is a valid promo slug and records
"they were on the Makita landing page and had not built anything specific", which is correct and
consistent with the visit row.

Confirm by reading the code path — do not assume. Then check:

Run: `npm run type-check && npm run lint`
Expected: PASS.

- [ ] **Step 5: Manual verification**

Register a new account from `/promotions/makita?toolset=ryobi&toolbox=kincrome`, then:

```js
db.users.findOne({ email: "<the address>" }, { signupAttribution: 1 })
```

Expected: `signupAttribution.promotionSlug === "makita"` **and**
`signupAttribution.builtPrizeSlug === "ryobi-kincrome"`.

Repeat with no params: `builtPrizeSlug === "makita"`.
Repeat with `?toolbox=cash`: `builtPrizeSlug === "cash-prize"`.

---

## Task 8: Carry it onto the payment event + CUSTOMER.md

**Files:**
- Modify: `src/utils/payment/payment-processing.ts:159-164, 422-427`
- Modify: `CUSTOMER.md` (**required** — `User.ts` and `api/auth/**` are CUSTOMER triggers)
- Modify: `docs/auth/`, `docs/subscription/`, `docs/payment/`, `docs/shared-ui/`, `docs/promo/`

**Interfaces:**
- Consumes: `user.signupAttribution.builtPrizeSlug` (Task 7).
- Produces: `PaymentEvent.data.builtPrizeSlug`. **No `PaymentEvent` model change** — `data` is
  `Schema.Types.Mixed` with an index signature `[key: string]: string | number | boolean | undefined`
  (verified at `src/models/PaymentEvent.ts:19-24, 86-90`), so a string field flows through.

- [ ] **Step 1: Widen the local `signupAttribution` type**

In `payment-processing.ts`, add to the inline `signupAttribution` type (line ~159):

```ts
    builtPrizeSlug?: string;
```

- [ ] **Step 2: Copy it onto the event**

Extend the existing promotion-fields branch (line ~422):

```ts
        // Promotion fields (promotionSlug, promotionPageType, builtPrizeSlug) come from signup only
        if (signupAttr?.promotionSlug) {
          attributionData.promotionPageType = signupAttr.promotionPageType;
          attributionData.promotionSlug = signupAttr.promotionSlug;
          // The prize they had built when they signed up, so revenue follows the BUILD and not
          // just the landing page. Guarded separately: pre-feature users have the promo fields
          // but no build.
          if (signupAttr.builtPrizeSlug) {
            attributionData.builtPrizeSlug = signupAttr.builtPrizeSlug;
          }
        }
```

- [ ] **Step 3: Update CUSTOMER.md (hook-enforced)**

In the customer data-model section, add `signupAttribution.builtPrizeSlug` — the prize the
customer had assembled in "Build your prize" at registration. Note that it is derived from URL
params, is optional, and that the landing page is still recorded separately in `promotionSlug`.

- [ ] **Step 4: Update the domain docs the Stop hook will demand**

| Domain | File | Content |
|---|---|---|
| `auth` | `docs/auth/api.md` | register accepts `builtPrizeSlug`, validated by `isValidPromoSlug` |
| `subscription` | `docs/subscription/models.md` | new `signupAttribution.builtPrizeSlug` + its index |
| `payment` | `docs/payment/backend.md` | `PaymentEvent.data.builtPrizeSlug`, signup-sourced only |
| `shared-ui` | `docs/shared-ui/frontend.md` | MembershipModal sends the build, via the shared resolver |
| `promo` | `docs/promo/frontend.md` | the shared-resolver rule and **why** both callers must use it |

- [ ] **Step 5: Verify and commit (ASK FIRST)**

Run: `npm run type-check && npm run lint`
Then complete a real purchase in Stripe test mode from a build URL and confirm
`PaymentEvent.data.builtPrizeSlug`. Ask before committing.

---

# Phase 4 — Admin breakdown

## Task 9: Aggregate built prizes and replace the dead Cross-visits column

**Files:**
- Modify: `src/repositories/PromoAnalyticsRepository.ts` (beside `getAggregatedByPage`, line ~118)
- Modify: `src/components/admin/PromoAnalyticsManagement.tsx:548-560, 624-640`
- Modify: `docs/admin/frontend.md`, `docs/promo/backend.md`, `docs/mongodb/`

**Interfaces:**
- Consumes: `builtPrizeSlug` on visits (Task 4) and on users (Task 7).
- Produces: `PromoPageMetrics.builds: number` (unique visitors who built something) and
  `PromoPageMetrics.topBuiltPrize: string | null`.

**Context — ADD alongside, do NOT replace (corrected 2026-07-28).** An earlier draft of this task
assumed the existing **Cross-visits** column (`PromoAnalyticsManagement.tsx:553`, reading
`referrerSlug`) was structurally dead and could be replaced, on the strength of
`docs/promo/frontend.md` and `src/docs/PROMOTION_ANALYTICS.md:111` saying nothing writes that key
any more.

**That premise was tested against the live database and is false.** Of 712 visit rows, **174
(~24%) carry a `referrerSlug`** — 55 on 2026-06-22, 24 on 06-30, 22 on 07-01, trailing to 1–4/day,
last written **2026-07-24**, none since. So writes have indeed stopped, but ~90 days of history
remain inside the collection's TTL, and the column still renders real numbers for any June/July
date range. Removing it would delete a live historical view.

**User ruling (2026-07-28): add `Builds` alongside; keep `Cross-visits`.** It will drift to zero on
its own as rows age out (around late October), and can be dropped later in a one-line change.

- [ ] **Step 1: Re-confirm the current state before touching the table**

```js
db.promoanalyticsvisits.countDocuments({ referrerSlug: { $exists: true, $ne: "" } })
```

If this now returns **0**, note it in your report — but still do NOT remove the column; the ruling
above stands regardless. If it returns non-zero (expected), proceed with the additive change.

- [ ] **Step 2: Add the aggregation**

In `getAggregatedByPage`, after the cross-visit aggregation block (line ~139-161), add:

```ts
    // 1c. Built-prize engagement — unique visitors who actually assembled something, plus the
    // most-built combination per landing page. Visitors who never touched the reels have no
    // `builtPrizeSlug`, so they are correctly excluded from the numerator.
    const buildAgg = await PromoAnalyticsVisit.aggregate<
      { _id: { pageType: string; slug: string; builtPrizeSlug: string }; visitorIds: string[] }
    >([
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate },
          builtPrizeSlug: { $exists: true, $ne: "" },
        },
      },
      {
        $group: {
          _id: { pageType: "$pageType", slug: "$slug", builtPrizeSlug: "$builtPrizeSlug" },
          visitorIds: { $addToSet: VISITOR_ID_EXPR },
        },
      },
    ]).exec();

    const buildVisitorIds = new Map<string, Set<string>>();
    const topBuild = new Map<string, { slug: string; count: number }>();
    for (const r of buildAgg) {
      const key = `${r._id.pageType}:${r._id.slug}`;
      const ids = buildVisitorIds.get(key) ?? new Set<string>();
      for (const id of r.visitorIds) ids.add(id);
      buildVisitorIds.set(key, ids);

      const current = topBuild.get(key);
      if (!current || r.visitorIds.length > current.count) {
        topBuild.set(key, { slug: r._id.builtPrizeSlug, count: r.visitorIds.length });
      }
    }
```

In the per-page assembly loop (~line 238, beside `const crossVisits = …`) add:

```ts
      const builds = buildVisitorIds.get(key)?.size ?? 0;
      const topBuiltPrize = topBuild.get(key)?.slug ?? null;
```

and include `builds` and `topBuiltPrize` in the pushed `PromoPageMetrics` object (~line 257)
**alongside the existing `crossVisits`** — do not remove it. Add to the `PromoPageMetrics`
interface (line ~23), keeping `crossVisits: number;` exactly as it is:

```ts
  /** Unique visitors who assembled a prize on this page (touched at least one reel). */
  builds: number;
  /** The combination built by the most visitors on this page, or null if nobody built one. */
  topBuiltPrize: string | null;
```

**Keep** the existing cross-visit aggregation block and `crossVisitMap` exactly as they are — the
new build aggregation sits beside them, it does not replace them.

- [ ] **Step 3: ADD the Builds column (leave Cross-visits in place)**

Insert a new header immediately AFTER the existing Cross-visits header (which ends at line ~557):

```tsx
                  <th className="text-right p-3 font-semibold text-gray-800 dark:text-neutral-100">
                    <button
                      onClick={() => handleSort("builds")}
                      className="flex items-center justify-end gap-1 w-full hover:text-red-600 dark:hover:text-red-400"
                      title="Visitors who assembled a prize in Build your prize"
                    >
                      Builds {getSortIcon("builds")}
                    </button>
                  </th>
```

and insert a new cell immediately AFTER the existing Cross-visits cell (which ends at line ~633),
so header and cell order stay aligned:

```tsx
                    <td
                      className="p-3 text-right font-mono text-gray-900 dark:text-white tabular-nums"
                      title={
                        row.topBuiltPrize
                          ? `Most built here: ${row.topBuiltPrize}`
                          : "Nobody built a prize on this page in this period"
                      }
                    >
                      {formatNumber(row.builds ?? 0)}
                      {row.topBuiltPrize && (
                        <span className="block text-[10px] font-sans text-gray-500 dark:text-neutral-400">
                          {row.topBuiltPrize}
                        </span>
                      )}
                    </td>
```

Update the `handleSort` union type and any `SortKey` definition to **add** `"builds"` beside the
existing `"crossVisits"` — do not remove `"crossVisits"`. Confirm sorting works on both columns.

- [ ] **Step 4: Type-check, lint, verify**

Run: `npm run type-check && npm run lint`
Then open the admin promo analytics page and confirm: the Builds column renders, sorting works,
the sub-label shows the top combination, and Visits / Signups / Conversions / Revenue are
**unchanged** from before the phase (the regression bar from spec §7).

- [ ] **Step 5: Docs + commit (ASK FIRST)**

Update `docs/admin/frontend.md` (the NEW Builds column, and that Cross-visits was deliberately
KEPT because ~174 historical rows remain inside the 90-day TTL — it will reach zero around late
October, at which point it can be dropped), `docs/promo/backend.md` (the new aggregation), and the
`mongodb` domain docs. Ask before committing.

---

## Final verification (after all phases)

- [ ] `npm run type-check`
- [ ] `npm run lint`
- [ ] `npm run test:prize-builder`
- [ ] `npm run test:prize-build`
- [ ] `npm run test:promo-visit`
- [ ] `npm run test:prize-summaries`
- [ ] `npm run test:prize-builder-card`
- [ ] Re-run the full B1–B8 matrix from spec §7 on `/promotions/makita` **and**
      `/promotions/milwaukee-kincrome`, mobile + desktop, light + dark.
- [ ] Confirm the regression bar: visit / signup / revenue counts and their landing-page identity
      are unchanged; ad-spend matching in `PrizePerformanceCard` still resolves.
- [ ] Confirm the doc-sync Stop hook reports no stale domains.

## Deferred (spec §9 / §10 — do not build without a new decision)

- Klaviyo `builtPrizeSlug` profile property (enables an "abandoned build" flow).
- Full exploration path (an event per settled configuration).
- Any backfill — all new fields are optional by design.
