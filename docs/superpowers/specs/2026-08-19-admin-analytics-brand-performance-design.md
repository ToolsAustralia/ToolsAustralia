# Admin Analytics — Brand Performance, Period Comparison & Filter Unification — Design Spec

**Date:** 2026-08-19
**Status:** Implemented — phases 1-3 shipped on `feature/prize-performance` (2026-08-19). See §13 for what each commit covered and §12 for the one test deliberately not built.
**Branch:** `feature/prize-performance`
**Extends:** [Advertising Analytics Suite — Master Spec](./2026-06-03-advertising-analytics-suite-master-spec.md) (§3.1 invariants are binding here)

---

## 1. Problem

Three complaints, one root cause.

1. **Prize Performance only sees half the brand map.** [`PrizePerformanceCard`](../../../src/app/admin/component/overview/sections/PrizePerformanceCard.tsx) rolls up the **toolset** lane only (`ryobi|milwaukee|dewalt|makita|hikoki`), deliberately discarding the `-<toolbox>` suffix. The four **toolbox** brands (`sidchrome|kincrome|milwaukee|gearwrench`) have no ROAS surface at all. And its revenue is **platform-reported** (Meta/TikTok pixel attribution), so it cannot answer the question that actually drives spend decisions: *how much of this brand's return is new membership?*

2. **No period comparison.** The dashboard has trend arrows (equal-length preceding period, via `trendCalculationService.getComparisonPeriod`) but no table that puts a chosen window beside last month and shows the deltas.

3. **Date filters scroll away.** On desktop, only the Overview toolbar is sticky. Every other analytics tab renders `<AdminDateRangeToolbar>` inside a plain `flex justify-end` that scrolls out of the viewport ([AllPlatformsManagement.tsx:81](../../../src/app/admin/component/AllPlatformsManagement.tsx#L81), and the same in TikTok / Snapchat / Repeat Purchases).

Underneath all three: **the admin analytics surface has grown two of everything.** Two date-filter systems, two date-window resolvers, a brand display-name table forked into a component, and ~15 files each hand-rolling their own `PaymentEvent` revenue `$match`. This spec's constraint is that it must leave the codebase with **fewer** sources of truth than it found, not more.

---

## 2. Locked decisions (brainstorm with DJ, 2026-08-19)

| # | Decision |
|---|---|
| 1 | **Revenue basis = server-side.** Brand Performance takes revenue, purchase counts and new-membership counts from our own `PaymentEvent` records, not from platform-reported attribution. Spend still comes from the ad platform — it is the only source that has it. |
| 2 | **Two toggles, one service.** Grouping toggle (`Toolset ⇄ Toolbox`) and attribution-basis toggle (`Landing page ⇄ Built prize ⇄ Platform reported`). One aggregation service parameterised by both — never separate code paths. |
| 2b | **Platform-reported stays available** as a third basis, so the ads team can see what Meta/TikTok themselves are claiming next to our server truth. It is the *existing* Prize Performance behaviour, preserved rather than deleted. |
| 3 | **"Last month" = previous calendar month.** Literal 1st→last day of the prior calendar month in AEST, independent of the selected range. |
| 4 | **Comparison appears in both places**, reading one service response: a card on the Overview *and* inline deltas on Brand Performance rows. Plus a full-screen drawer for the complete metric table. |
| 5 | **Deltas are opt-in.** The default table shows clean figures; a `Compare` toggle reveals delta chips. Full period-vs-period detail lives in the drill-down. |
| 6 | **Page Analytics and Brand Performance both stay.** A page and a dashboard section are not redundant surfaces. The requirement is that they must never show *conflicting* numbers — enforced by a shared lane mapping both surfaces import, not by deleting a surface (see §9). |
| 7 | **UI over prose.** Minimise explanatory copy; carry meaning in layout, grouping and affordances. |
| 8 | **No new permission.** Reuse `facebookAds.view`, consistent with every sibling analytics route. |

---

## 3. The forcing constraint (read this before questioning the two-toggle design)

> **Ad spend can only ever be keyed on the URL the ad pointed at. What the visitor actually built can only ever be known server-side. These are two different keys, permanently.**

Verified, not assumed:

- `PrizeShowcase` **does** write the visitor's selection to the URL — `?toolbox=kincrome`, `?toolset=makita` — via `window.history.replaceState` ([PrizeShowcase.tsx:256](../../../src/components/sections/promo/PrizeShowcase.tsx#L256)), and parses them back on load (`parseToolboxQueryParam` / `parseToolsetQueryParam`, [prize-selection/utils.ts](../../../src/components/sections/promo/prize-selection/utils.ts)).
- But [`canonicalizeLandingUrl`](../../../src/utils/metrics/canonicalize-landing-url.ts) **strips the query entirely** — `LandingPageMetricsDaily.canonicalUrl` is `origin + path`. The selection is therefore invisible to every spend rollup. (This is the same constraint that forced the embedded `packagesFocus` subdocument in the 2026-07-17 spec.)
- The selection **is** captured server-side, and already with exactly the semantics DJ asked for: `PromoAnalyticsVisit.builtPrizeSlug` records whatever combination was on screen — the **page default** if the visitor never touched the builder, the **chosen** combination if they did — and flows to `signupAttribution.builtPrizeSlug` → `PaymentEvent.data.builtPrizeSlug`. `BUILD_INTERACTED_FLAG` ([PromoAnalyticsRepository.ts:210](../../../src/repositories/PromoAnalyticsRepository.ts#L210)) already separates "saw the default" from "deliberately chose".

**No new capture work is required.** The behaviour DJ described ("if they didn't select anything use the default; if they picked kincrome, use kincrome") *is* the existing meaning of `builtPrizeSlug`.

Both reels are switchable — the toolset is **not** locked on `/promotions/<toolset>` pages (`toolsetMode` only affects the evergreen-restore effect, [PrizeShowcase.tsx:325](../../../src/components/sections/promo/PrizeShowcase.tsx#L325)). So drift between "URL the ad bought" and "brand the buyer chose" occurs on **both** axes, not just toolbox. That drift is not noise to be hidden — it is the signal that tells the ads team when targeting and demand have diverged. The basis toggle is how the reader sees it.

---

## 4. Naming

No new vocabulary is coined. Every term below already exists in the codebase and is reused character-for-character:

| Term | Meaning | Source of truth |
|---|---|---|
| **toolset** | Power-tool brand lane — `ryobi \| milwaukee \| dewalt \| makita \| hikoki` | `TOOLSET_LANDING_SLUGS`, `ToolsetLandingSlug` |
| **toolbox** | Storage brand lane — `sidchrome \| kincrome \| milwaukee \| gearwrench` | `TOOLBOX_LANE_ORDER`, `ToolboxLaneId` |
| **lane** | Either of the two above, as a grouping axis | `PRIZE_LANE_SLUGS` |
| **basis** | Where outcome figures come from — `landing-page` \| `built-prize` \| `platform` | new parameter name; the first two values reuse `promotionSlug` / `builtPrizeSlug`, the third reuses `LandingPageMetricsDaily.revenueCents` |
| **acquisition category** | `membership-purchase \| one-time-purchase \| additional-one-time \| mini-draw \| upsell` | `AcquisitionCategory` |

All five brand lanes plus all four toolbox lanes ship a wordmark already: `public/images/brands/name/{ryobi,milwaukee,dewalt,makita,hikoki,sidchrome,kincrome,gearwrench}Text.svg` (+ `gearwrenchText-light.svg` for dark mode).

⚠️ **Milwaukee is both a toolset and a toolbox.** A row labelled "Milwaukee" means a different population under each grouping toggle. The toggle state must be visually unambiguous at all times (see §7.3).

---

## 5. Shared foundations — what this reuses instead of rebuilding

This table is the anti-redundancy contract. **Any implementation that hand-rolls one of these instead of importing it is a spec violation.**

| Concern | Canonical implementation — import this |
|---|---|
| New-membership vs one-time vs additional vs mini-draw vs upsell | `classifyAcquisitionCategory` + `buildByCategory` — [platformRevenueBreakdown.ts:54](../../../src/services/admin/platformRevenueBreakdown.ts#L54) |
| Renewal exclusion | `packageType === "membership" && data.billingReason === "subscription_cycle"` — **never** the top-level `isRenewal` flag (master spec §3.1.2) |
| Refund netting (whole-row, Option B) | `excludeRefundedBenefitsGrantedStages()` — [payment-event-net-queries.ts](../../../src/utils/payment/payment-event-net-queries.ts) |
| ROAS | recompute from **summed** spend ÷ **summed** revenue; never average per-row ROAS (master spec §3.1.3) |
| Brand lane registries | `PRIZE_LANE_SLUGS`, `TOOLSET_LANDING_SLUGS`, `TOOLBOX_LANE_ORDER`, `getPageDefaultPrizeSlug` — [promo-landing-slugs.ts](../../../src/config/promo-landing-slugs.ts) |
| AEST day bounds (exclusive `$lt`, DST-safe) | `aestDayBounds` — [DashboardStatsSnapshotWriter.ts:36](../../../src/services/admin/dashboard-stats/DashboardStatsSnapshotWriter.ts#L36) |
| Spend per canonical URL per day | `LandingPageMetricsDaily` + `SpendByUrlAggregationService` |
| Prior-period resolution | `trendCalculationService.getComparisonPeriod` (extended, not replaced — §8.1) |
| Table / card / segmented-control UI | `@/components/admin/ui` — `Card`, `DataTable`, `SectionTitle`, `Segmented`, `MetricCard` |

⚠️ **Server-safety boundary.** `TOOLBOXES` / `TOOLSETS` live in `src/components/sections/promo/prize-selection/constants.ts` and must **not** be imported by services or repositories. The server-safe registry is `PRIZE_LANE_SLUGS` in `src/config/promo-landing-slugs.ts` — this is already documented there and the new resolver honours it.

---

## 6. Phase 1 — Collapse two date-filter systems into one

**Ships:** date filters pinned in view on every analytics tab, desktop and mobile. **Net change: one fewer component, one fewer state system, one fewer date resolver.**

### 6.1 The duplication being removed

| Today | |
|---|---|
| `OverviewToolbar` | own sticky wrapper, `placement` prop, used by Overview only |
| `AdminDateRangeToolbar` | portal + inline variants, **not sticky**, used by 4 tabs |
| `DashboardOverview` | ~90 lines of bespoke date state + URL sync + preset resolution |
| `useAdminDateFilter` | the same preset resolution, without URL sync |
| `resolveAestDateWindow` | a **third** copy of the same preset→AEST mapping, for card-level consumers |

### 6.2 Target

1. **`useAdminDateFilter` gains optional URL sync** — `useAdminDateFilter(initial, { syncToUrl: true })`. Reads `dateRange` / `startDate` / `endDate` search params on mount, writes them with `router.replace(..., { scroll: false })` on change. Behaviour when `syncToUrl` is omitted is byte-identical to today, so the four existing consumers are untouched.
2. **`DashboardOverview` adopts it** and deletes its own state, its `updateDateFilter`, and its `CustomDateRangeModal` wiring (the toolbar already hosts one).
3. **One preset→AEST mapping.** The canonical resolver lives in the **util** (`src/utils/admin/resolveAestDateWindow.ts`), and `useAdminDateFilter` imports it — *not* the reverse. The hook is `"use client"`, so a util depending on it would be backwards and would poison any server-side caller. Concretely: the hook's private `resolveRange` is deleted and re-expressed in terms of the util, which gains the two draw presets (`current-draw` / `last-draw`) it currently lacks as an optional `drawDates` argument. `resolveAestDateWindow`'s existing exported signature is preserved for the card-level callers that pass raw props (`PrizePerformanceCard`, its successor, and the KPI drill-downs).
4. **Sticky moves into `AdminDateRangeToolbar`.** The desktop branch gains `sticky top-0 z-30` with the negative-margin/padding bleed the Overview toolbar already uses (so the pinned bar covers content edge-to-edge inside the `p-4 lg:p-6` scroll container at [AdminPage.tsx:195](../../../src/app/admin/component/AdminPage.tsx#L195)). Every consumer gets it with no per-tab change.
5. **`OverviewToolbar` is deleted.**
6. **Mobile needs no change.** `ADMIN_TABS_WITH_MOBILE_LAYOUT_DATE_TOOLBAR` already lists every tab that renders a shared date toolbar, and mobile is always-visible by construction (the slot renders in the header, *above* the scroll container). Verified: `klaviyo` and `ab-testing` are absent from that list **correctly** — neither uses `useAdminDateFilter`/`AdminDateRangeToolbar` (Klaviyo drives its own `hourRange`; A/B Testing has no date filter). Adding them would mount an empty slot. Bringing those two onto the shared filter is a separate change, out of scope here.

### 6.3 Risks

- **Sticky containment.** `position: sticky` fails silently under an ancestor with `overflow` other than `visible`, or any `transform`/`filter`/`contain`. The scroll container is the intended sticky ancestor; each of the 9 analytics tabs must be visually verified, not assumed.
- **Backdrop blur + portaled popovers.** `FacebookAdsHealthFilters` already documents having to portal its dropdown to `document.body` to escape a sticky toolbar. `DateRangeDropdown` must be checked for the same class of bug once its parent becomes sticky.
- **URL-sync loop.** The existing `DashboardOverview` effect reads search params on every `searchParams` change and calls `setState`. Writing back with `router.replace` inside the same hook must not re-enter — guard by comparing against current state before writing.

---

## 7. Phase 2 — Brand Performance

**Ships:** `PrizePerformanceCard` is replaced by `BrandPerformanceCard`, covering both brand lanes with server-side outcome metrics and true ROAS.

### 7.1 The lane resolver — one function, both sides of the join

New pure util: **`src/utils/metrics/brand-lane.ts`** (sibling of `packages-focus.ts` and `canonicalize-landing-url.ts`; metrics-analytics domain).

```ts
export type BrandLane = "toolset" | "toolbox";

/**
 * Resolve a promotion slug to its brand lane id.
 * Applied to BOTH the ad-side canonical URL and the server-side promotionSlug,
 * so spend and outcomes bucket identically by construction.
 */
export function resolveBrandLaneFromPromoSlug(
  slug: string,
  lane: BrandLane
): string | null;

/** Same, from a canonical landing URL (extracts the /promotions/<slug> segment first). */
export function resolveBrandLaneFromCanonicalUrl(
  canonicalUrl: string,
  lane: BrandLane
): string | null;

/** Same, from a built-prize slug (exact — both halves are present). */
export function resolveBrandLaneFromBuiltPrize(
  builtPrizeSlug: string,
  lane: BrandLane
): string | null;
```

Rules:

- **toolset** — the segment before the first `-`. `/promotions/ryobi-milwaukee` → `ryobi`. Identical to today's `promotionsToolsetSlug`, which this replaces.
- **toolbox** — the segment after the first `-`, when present. When absent (a bare `/promotions/ryobi` toolset landing page), resolve through **`getPageDefaultPrizeSlug`** → `ryobi-milwaukee` → `milwaukee`. This attributes the spend to the toolbox the visitor actually saw on first paint, and it matches what the server side records for a visitor who never touched the builder — the two agree by construction rather than by coincidence.
- **Unrecognised → `null`, dropped.** `cash-prize` has no toolbox lane; `unknown://meta-ad/<id>` placeholder rows have no lane at all. Neither is bucketed somewhere plausible-looking. Dropped spend is surfaced as an `Unattributed` footer row so totals still reconcile (see §7.3).
- Toolbox membership is validated against `PRIZE_LANE_SLUGS`, so a future brand needs no change here.

⚠️ **Known and accepted skew:** the page-default fallback concentrates bare-toolset-URL spend on whichever toolbox is the default (today, Milwaukee on every toolset page — `getDefaultPrizeForToolsetSlug` prefers the Milwaukee toolbox). The toolbox table will therefore read Milwaukee-heavy on the spend column. This is not a bug to correct — it is the literal truth of what was advertised — and the `Built prize` basis is precisely the lens that shows how demand redistributes away from it.

### 7.2 Aggregation service & API

**`src/services/analytics/BrandPerformanceService.ts`** — new file justified: a different aggregation axis from `SpendByUrlAggregationService` (~480 lines, per-URL) and from `PackagesFocusBreakdownService` (per-focus). Same folder, same conventions.

```
GET /api/admin/analytics/brand-performance
    ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
    &lane=toolset|toolbox
    &basis=landing-page|built-prize|platform
    &compare=previous-calendar-month   (optional)
    &platform=meta|tiktok|all          (spend scope; also revenue scope when basis=platform)
```

Thin route under `src/app/api/admin/analytics/`, `requirePermission("facebookAds.view")`, delegating entirely to the service — matching its `spend-by-url` and `packages-focus` siblings.

**Spend side** (always URL-keyed, for every basis):

- Read `LandingPageMetricsDaily` over the AEST window, per platform.
- Bucket each row via `resolveBrandLaneFromCanonicalUrl(row.canonicalUrl, lane)`.
- `platform=all` **sums spend only** — never platform-reported revenue. Spend is additive across platforms; platform-reported revenue is each platform's own attribution and double-counts. This preserves the existing rule stated in the `spend-by-url` route docblock.

**Outcome side — the only thing `basis` changes.**

| basis | source | lane key | membership split |
|---|---|---|---|
| `landing-page` | `PaymentEvent` (server) | `data.promotionSlug` | ✅ full 5-category split |
| `built-prize` | `PaymentEvent` (server) | `data.builtPrizeSlug` | ✅ full 5-category split |
| `platform` | `LandingPageMetricsDaily.revenueCents` / `.conversions` | canonical URL | ❌ not available — renders `—` |

For the two **server** bases:

- `$match`: `eventType: "BenefitsGranted"`, `timestamp` within `aestDayBounds`, plus the attribution key existing.
- `...excludeRefundedBenefitsGrantedStages()`.
- Bucket by lane from `data.promotionSlug` or `data.builtPrizeSlug`.
- Classify each event with `classifyAcquisitionCategory`, which returns `null` for renewals and drops them — satisfying master spec §3.1.2 with **zero new classification logic**.
- `$group` by `{ lane, category }`, summing `data.price` and counting.

For the **platform** basis, no `PaymentEvent` query runs at all: revenue and conversions come from the same `LandingPageMetricsDaily` rows already read for spend, so it is strictly cheaper than the server bases and reproduces today's Prize Performance figures exactly. `platform=all` under this basis keeps today's blended-ROAS caveat — the same purchase can be claimed by both platforms, so combined revenue reads high; the card surfaces that on the row rather than silently blending (see §7.3).

This is why `basis` is a service parameter and not a second service: spend, lane resolution, comparison windows, totals and percentage maths are shared verbatim across all three; only the outcome-source branch differs.

**Row shape:**

```ts
interface BrandPerformanceRow {
  laneId: string;              // "ryobi" | "sidchrome" | ...
  displayName: string;
  logoPath: string;
  spend: number;               // AUD, URL-keyed, summed across selected platforms
  revenue: number;             // AUD, server-side, acquisition-only, refund-netted
  roas: number;                // revenue / spend; 0 when spend is 0
  purchases: number;           // count across ALL 5 acquisition categories
  newMemberships: number;      // count of "membership-purchase" only
  newMembershipRevenue: number;
  newMembershipCountPct: number;   // newMemberships / purchases
  newMembershipRevenuePct: number; // newMembershipRevenue / revenue
  byCategory: PlatformByCategoryEntry[]; // the full 5-bucket split, for the drill-down
  platforms: SpendByUrlPlatform[];
  comparison?: BrandPerformanceRow;  // same shape, previous calendar month
}
```

`newMembership*Pct` denominators are **within the brand row**, not across the table — "of this brand's return, how much is new membership". Zero-denominator rows report `0`, never `NaN`.

Totals row: `roas` recomputed from summed spend ÷ summed revenue; percentages recomputed from summed numerators/denominators. Never averaged (§3.1.3).

### 7.3 UI — `BrandPerformanceCard`

Replaces `PrizePerformanceCard.tsx` at the same position in `DashboardOverview`. Reuses `Card`, `SectionTitle`, `DataTable`, `Segmented` from the admin UI kit.

**Controls (three `Segmented` groups + the existing Sync button), no explanatory paragraphs:**

```
Brand Performance                                       [ Sync ]
┌ Toolset │ Toolbox ┐  ┌ Landing page │ Built prize │ Platform ┐  ┌ All │ Meta │ TikTok ┐  [ Compare ]
```

**Columns:** `Brand · Spend · Revenue · ROAS · Purchases · New members · New memb %`

- **Brand** renders the wordmark only (name on `alt`) — the pattern the existing card already uses, and the reason the lane toggle must be unmistakable: Milwaukee's wordmark is identical in both lanes. The active `Segmented` pill plus a lane-coloured left rule on the table carry that state visually.
- **ROAS** keeps the existing green ≥3 / amber threshold colouring.
- **New memb %** renders as a mini bar — the count sits in the adjacent column, so the bar carries the ratio without a second number. This reuses the kit's `ProgressBar`, **extended** with an optional `tone?: "risk" | "neutral"` prop defaulting to `"risk"` (today's behaviour, unchanged for existing callers). The default green<50 / amber / red>80 scale is a *budget* scale — on a share-of-revenue metric a healthy 85% would render red — so this column passes `tone="neutral"`. Extending the kit component rather than hand-rolling a second bar keeps one bar in the codebase.
- Under `basis=platform`, **New members / New memb % render `—`** (platform data has no membership split) and, when `platform=all`, the ROAS cell carries the existing blended-attribution caveat as a marker rather than a paragraph.
- **Compare ON** adds a delta chip beneath each figure (green up / red down, arrow + `%`). Nothing else changes; no columns are added.
- **Row click** opens the drill-down.
- **Unattributed footer row** carries **both sides**: spend whose URL resolved to no lane (`unknown://` placeholders, non-promotion pages, `cash-prize` under the toolbox lane) **and** acquisition revenue/purchases whose event has no `promotionSlug`/`builtPrizeSlug` (pre-attribution-capture purchases, direct/organic buyers who never touched a promo page). Present only when non-zero. This is what makes the Total reconcile with both the ad account and the Overview revenue card — without it, a reader comparing the two would find a silent gap.

**Basis affordance without prose:** under `Built prize`, the Spend column header carries a small `URL` tag and the ROAS cell a subtle dotted underline, both with a `title`/tooltip explaining that spend is URL-derived while outcomes follow the built prize. One tooltip, no paragraph.

**Drill-down.** Row click keeps `PrizePerformanceAdsModal` (URL-keyed campaign → ad set → ad tree; still correct and unchanged), and adds a second panel above it: the 5-category acquisition split for the row from `byCategory`, plus the period-vs-period columns when Compare is on.

### 7.4 Performance

This card sits on the Overview, which already fires a dozen queries on load, and Compare doubles its outcome aggregation. Two things to watch:

- **`excludeRefundedBenefitsGrantedStages()` runs a `$lookup` per row.** Acceptable at current volumes (`getAggregatedByToolbox` already does exactly this), but on an all-time range with a comparison window it is the likeliest hot spot. If it measures slow, the mitigation already exists in-repo: `loadRefundedPaymentIntentIds()` ([revenueAggregator.ts:119](../../../src/services/admin/dashboard-stats/revenueAggregator.ts#L119)) loads the refunded-intent Set once and filters with `$nin` — same Option-B semantics, one lookup instead of N. **Measure before switching**; do not pre-optimise.
- **No index on `data.promotionSlug` / `data.builtPrizeSlug`.** `data` is `Mixed`, and these queries lean on the existing `{ eventType: 1, timestamp: -1 }` index then filter. Same as the existing toolbox aggregation, so no regression — but if the range scan dominates, add a partial index mirroring the `signupAttribution.builtPrizeSlug` one on `User` rather than widening the compound index.

### 7.5 Display registry — removing a fork

`BRAND_DISPLAY_NAME` currently lives **inside** `PrizePerformanceCard.tsx`, covering toolsets only. It moves to `src/config/promo-landing-slugs.ts` as **`BRAND_LANE_DISPLAY`**, covering all nine lanes with `{ label, logoPath }`, typed as `Record<ToolsetLandingSlug, …>` and `Record<ToolboxLaneId, …>` so adding a brand to either registry fails compilation until its display entry exists — preserving the compile-time guard that the current fork already provides (and that caught the missing HiKOKI row).

---

## 8. Phase 3 — Period comparison

### 8.1 "Last month" resolution

New export beside the existing resolver in **`src/utils/admin/resolveAestDateWindow.ts`** (no new file):

```ts
/** 1st → last day of the previous calendar month, in AEST, as yyyy-MM-dd. */
export function resolvePreviousCalendarMonthAest(now?: Date): { startDate: string; endDate: string };
```

AEST-anchored via `date-fns-tz` (`formatInTimeZone`, `startOfMonth`/`endOfMonth` on the zoned date), consistent with every other date-bounded admin query. `trendCalculationService.getComparisonPeriod` is **untouched** — the KPI trend arrows keep their equal-length-preceding-period semantics, which is correct for a trend arrow. The two coexist with distinct, documented meanings; the comparison table labels its column **"Last month"** with the concrete date range beneath it, so the reader is never guessing which is which.

⚠️ **Length asymmetry is real.** Comparing "Today" against a whole calendar month is not like-for-like. The UI states the two windows' actual dates and, where a range is shorter than the comparison window, shows a per-day normalised figure alongside the raw delta rather than suppressing the comparison or silently misleading.

### 8.2 Overview comparison card

New `PeriodComparisonCard` in `src/app/admin/component/overview/sections/`. Rows = metrics, columns = `Selected │ Last month │ Δ │ Δ%`.

Metrics: Revenue · New memberships · Purchases · Ad spend · ROAS · Contribution (revenue − spend, labelled honestly per master spec §2, never bare "Profit").

Sourced from the **existing** `useAdminDashboardStats` payload plus one comparison-window call — the dashboard stats service already accepts a comparison window and computes trends (`DashboardStatsService.ts:73-79`). No new revenue truth is introduced; the card is a presentation of numbers the service already produces.

### 8.3 Full-screen comparison drawer

The card's corner expand opens a drawer with the complete metric set, following the existing `PastDueChargeHistoryDrawer` pattern (sticky header, `admin-scrollbar`, escape/overlay close). Same data, no second fetch — the drawer receives the card's already-loaded response. Sortable by Δ% so the biggest movers surface first.

### 8.4 Brand Performance deltas

When `compare=previous-calendar-month` is passed, the service returns `comparison` on each row (§7.2) and the card renders the delta chips described in §7.3. One request, one response, one truth — the Overview card and the brand rows cannot disagree because they are literally the same numbers from the same service call where they overlap.

---

## 9. Non-conflict guarantee with Page Analytics (locked decision 6)

Page Analytics (`/admin/promo-analytics`) keeps its per-page funnel — visits → builds → signups → conversions — which Brand Performance does not and should not replicate. But `PromoAnalyticsRepository.getAggregatedByToolbox` and Brand Performance's `Toolbox × Built prize` view answer overlapping questions from the same underlying rows, so they must agree.

They already share three of the four rules — `getAggregatedByToolbox` uses `excludeRefundedBenefitsGrantedStages()`, the `$nor` renewal exclusion, and `PRIZE_LANE_SLUGS`. What differs is only *where the lane mapping is written*: it has a local `$switch` built from `PRIZE_LANE_SLUGS`, and Brand Performance would add a second one.

**Action (done):** the `$switch` builder lives in `brand-lane.ts` as `brandLaneSwitchExpr(field, lane)`, and `getAggregatedByToolbox` imports it. One lane mapping in the codebase, used by both surfaces — not two copies kept in step by review.

**Guard (done):** two tests, together closing the loop.

- `test:brand-lane` asserts the Mongo `$switch` and the JS resolver produce an identical mapping for every registry entry, in both lanes.
- `test:brand-performance-reconciliation` feeds BOTH code paths the same canned event set and asserts the per-lane conversions/revenue match exactly, and — crucially — **captures the pipeline** `getAggregatedByToolbox` passes to Mongo and checks its `$switch` branches against the shared resolver. Without that capture the test would be circular (both sides deriving lanes from the same helper). Verified to actually fail: sabotaging the repository with a drifted local `$switch` makes it exit 1.

_(An earlier draft of this spec claimed the repo had no unit-test database and cut this test on that basis. That was wrong and unverified — `test:promo-analytics-aggregation` had long established the pattern of stubbing `model.aggregate` with canned rows, inside the very file being modified.)_

---

## 10. Norm lockstep (CLAUDE.md rule 10)

`promo-analytics` is already mirrored to Norm ([src/app/api/internal/norm/v1/promo-analytics/route.ts](../../../src/app/api/internal/norm/v1/promo-analytics/route.ts), schemas in `src/lib/internal-norm/schemas/promo-analytics.ts`).

- §9 changes the *internals* of `getAggregatedByToolbox` but **not its output shape** — no Norm schema change, but `npm run norm:smoke` must still pass (a schema↔output mismatch is a runtime 500 invisible to `tsc`).
- `brand-performance` is a **new admin read** that Norm could usefully expose. Per rule 10 this is **flagged, not silently skipped**: → *DJ, do you want `analytics.brand-performance` mirrored to Norm in this branch, or as a follow-up?* If yes, it needs a `classification.ts` entry, a Zod schema, the v1 route, `npm run build:norm-manifest`, and a `norm-context.md` update in the same task. Brand rows carry no PII, so the projection is trivial.

---

## 11. Docs to update (same task)

| Doc | Why |
|---|---|
| `docs/admin/` (frontend + api) | Brand Performance card, comparison card/drawer, sticky toolbar, new endpoint |
| `docs/metrics-analytics/` | `brand-lane.ts` resolver, the URL-vs-build basis rule |
| `docs/config-and-data/` | `BRAND_LANE_DISPLAY`; update the "Adding a promotion brand" checklist |
| `docs/promo/` | `getAggregatedByToolbox` now delegates its lane mapping |
| `docs/client-state/` | `useAdminDateFilter` URL-sync option |
| `docs/internal-norm/norm-context.md` | only if decision 10 is "mirror now" |
| `BUSINESS.md` / `CUSTOMER.md` | **Not triggered.** Admin-internal analytics only — no membership tier, price, perk, draw mechanic, customer field, or customer-facing surface changes. If the doc-sync hook flags a `BUSINESS_TRIGGER_GLOBS` path, make a one-line clarifying touch per rule 5 rather than inventing a business-level change. |
| Cobber (rule 5c) | **Not triggered** — nothing customer-visible changes. |

---

## 12. Tests

No test runner exists; tests are standalone `tsx` scripts with their own `package.json` entry (`npm run test:<scope>`).

| Test | Asserts |
|---|---|
| `test:brand-lane` | `resolveBrandLane*` — toolset segment extraction; toolbox from explicit suffix; toolbox from page default on bare toolset URLs; `cash-prize` → null under toolbox; `unknown://meta-ad/…` → null; every `PRIZE_LANE_SLUGS` entry maps to a valid lane in both directions |
| `test:brand-performance` | ROAS recomputed from totals not averaged; renewals excluded via `billingReason`; refunded rows excluded; `newMembership*Pct` = 0 (not `NaN`) on zero denominators; `platform=all` sums spend but not platform revenue; unattributed spend appears in the footer so Total reconciles |
| `test:brand-performance-reconciliation` | §9 — both surfaces agree per lane on identical canned input, AND `getAggregatedByToolbox` still buckets via the shared `$switch` (pipeline captured and compared to the resolver) |
| `test:previous-calendar-month` | AEST correctness across a DST transition and across a year boundary; January → previous December |

Existing suites that must still pass: `npm run test:chat-faqs` (unaffected), plus `npm run lint`, `npm run type-check`, `npm run norm:smoke`.

---

## 13. Sequencing — as shipped

| Phase | Commit | Ships |
|---|---|---|
| 1 | `5ac48152` | One sticky, URL-synced date filter for every analytics tab. `OverviewToolbar` deleted, `DashboardOverview`'s bespoke date state deleted, one preset→AEST resolver. |
| 2 | `24190eff` | Brand Performance replaces Prize Performance — both lanes, three bases, server-side new-membership figures. `getAggregatedByToolbox` shares the lane mapping. |
| 3 | this commit | Period comparison vs previous calendar month: Overview card + full-metric drawer, plus per-brand deltas via the `Compare` toggle shipped in phase 2. |

Tests added: `test:brand-lane`, `test:brand-performance`, `test:previous-calendar-month`, `test:period-comparison`.

### Original sequencing rationale

Each phase is independently shippable and independently reviewable.

1. **Phase 1 — filter unification.** No data changes. Immediately visible win. Lowest risk, so it goes first and de-risks the toolbar surface every later phase renders into.
2. **Phase 2 — Brand Performance.** The bulk of the work. Depends on Phase 1 only for the toolbar it sits under.
3. **Phase 3 — period comparison.** Depends on Phase 2 for the per-brand delta half; the Overview card half could ship independently if Phase 2 slips.

---

## 14. Non-goals

- **No new spend source.** TikTok/Snapchat spend coverage is whatever `LandingPageMetricsDaily` already holds; the UI must never imply coverage that isn't there (master spec §3.1.6).
- **No historical backfill.** Brand Performance reads existing `PaymentEvent` and `LandingPageMetricsDaily` rows. Purchases predating `signupAttribution` capture have no `promotionSlug`/`builtPrizeSlug` and land in `Unattributed` — visible, not hidden.
- **No partial-refund handling.** `RefundPartial` is still not subtracted, consistent with every other revenue surface (master spec §3.1.4). Carried forward deliberately, not silently "fixed" differently here.
- **No new permission, no new admin tab.**
- **Not rewriting the ~15 other `PaymentEvent` aggregations.** This spec adds none and shares where it touches; the wider consolidation is a separate project.

---

## 15. Addendum (2026-08-19, post-review)

Three items from DJ's review of the shipped phases.

### 15.1 Toolbox spend skew — corrected, not accepted

§7.1 originally documented the page-default fallback as a "known, accepted skew". It is no longer accepted. `allocateBrandLanes` now splits a bare toolset page's spend across toolbox lanes **in proportion to the toolbox mix its visitors actually built** (`PromoAnalyticsRepository.getToolboxMixByToolsetPage`), falling back to the page default only when the window has no visit data. `meta.toolboxSpendModel` reports which model ran.

Measured on production (1 Jul – 19 Aug 2026): `/promotions/makita` splits milwaukee 60% / gearwrench 20% / kincrome 20%, so its $1,373.51 now divides $824.11 / $274.70 / $274.70 rather than landing entirely on Milwaukee. Total spend is identical whichever lane you group by (verified: `16762.5000` both ways), so the split creates and loses nothing.

⚠️ New caveat, surfaced in the UI rather than buried: builder beacons are far sparser than ad impressions, so the split can rest on a very small sample — the production window above divided thousands of dollars on 2–6 visitors per page. `meta.toolboxMixVisitors` reports the sample and the card renders it in amber below 30.

### 15.2 The two items cut from the original plan — both restored

Both were cut for reasons that did not hold:

- **Reconciliation test.** The spec claimed the repo had no unit-test database. That was asserted without checking and was false — `test:promo-analytics-aggregation` already stubbed `model.aggregate` with canned rows, in the very file being modified. Now built (see §9), and verified to actually fail when the mapping drifts.
- **Contribution row.** The objection was that `revenue.total` includes renewals — a reason not to build it *that way*, not a reason to skip it. Now built as `acquisitionRevenue − adSpend`, summing the five acquisition buckets so renewals are excluded per master spec §2, and labelled as the subtraction it is rather than "Profit".

### 15.3 Norm mirror — wired

`analytics.brand-performance` → `/v1/analytics/brand-performance`, wrapping the same service (§10's open question resolved: yes, in this branch). Registry entry, Zod schema, route, regenerated manifest and `norm-context.md` all updated in lockstep. Smoke-tested live against production data on all three bases, both lanes and with `compare` — all 200 OK, which is the only way to catch a schema↔output mismatch (`tsc` cannot see it).
