# Admin Overview Redesign — Design Spec

_Date: 2026-06-01 · Branch: `feature/admin-dashboard-revamp` · Status: awaiting user review_

## 1. Goal

Reskin the admin **Overview** page (`/admin` → `overview` tab) to match the Claude Design mockup
(`Admin Dashboard Redesign.html`, the project's declared "canonical basis"), implemented **faithfully
("as it is")** so the data is legible at a glance and the layout **maximizes width from mobile → desktop**.

This is the first of a page-by-page rollout. Only the Overview page content + its date filter change in
this spec. The sidebar, header chrome, routing, auth, and the other 19 admin tabs are out of scope.

## 2. Locked decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Reuse all existing data hooks.** No data-layer rebuild. | The Overview already fetches ~90% of the mockup via TanStack hooks. |
| D2 | **Charts = port the mockup's hand-rolled SVG** (area chart, donut, sparkline). NOT recharts. | recharts can't reproduce the catmull-rom curve, dashed crosshair tooltip, or the donut center-hover swap. Pure SVG = pixel-faithful + zero new deps. recharts stays for other admin tabs. |
| D3 | **Advertising = show BOTH**: design's "by-platform" card (FB live; TikTok/Snapchat "Coming soon") **and** the existing per-prize table, both in the new card styling. | User wants the mockup look without losing the per-prize ROAS feature. |
| D4 | **Donut tier colors = `brand-tier` Tailwind tokens** (`tradie #00c2ed / foreman #ffd200 / boss #ee0000`). | These already exist in `tailwind.config.ts` AND match the mockup exactly — faithful + reuses an existing token. Do NOT use `getPackageColorScheme` (customer-facing DeWalt-yellow scheme) for the admin donut. |
| D5 | **Keep the existing shell** (sidebar, header, theme toggle, routing, auth). Only swap the floating date filter for the mockup's dropdown, in place. | User confirmed: keep sidebar + header, adopt the cleaner date dropdown. |
| D6 | **Tag unwired data "Coming soon"** rather than faking or dropping it. | User directive. |

## 3. Stack facts (verified)

- Tailwind v3, `darkMode: "class"`; admin dark mode via `AdminThemeContext` toggling `.dark` on `<html>`.
- `tailwind.config.ts` already defines: `red-600 = #ee0000`, `brand-tier.{tradie,foreman,boss}`, fonts
  `sans = var(--font-inter)` and `poppins = var(--font-poppins)`. **There is NO `display` font key** and
  **no `2xs` fontSize** — both must be added (§5).
- Inter + Poppins already loaded via `next/font` in `src/app/layout.tsx`.
- `lucide-react` installed → use it for all icons (mockup icons are Lucide-style).
- `recharts` installed (house chart lib) — **not** used for the new Overview charts (D2).
- Admin content area: `flex-1 overflow-y-auto p-4 lg:p-6`, **no max-width cap** (full-bleed). Page body is
  `<div className="space-y-6">` in `DashboardOverview.tsx`.
- Existing money/number formatters: `src/utils/metrics/formatters.ts` via `useMetricsFormatting()`
  (`formatCurrency` AUD **2dp**, `formatNumber`, `formatPercentage`, `formatROAS`). **No compact formatter
  exists** → add `fmtCompact` (§5).

## 4. Architecture

```
src/components/admin/ui/            ← NEW: presentational kit ported from the mockup primitives
  Card.tsx                          Card, SectionTitle
  Badge.tsx                         Badge, TrendPill
  MetricCard.tsx                    KPI tile (button) + tone map
  Popover.tsx                       portal-to-body anchored popover (re-anchors on scroll/resize)
  Sparkline.tsx                     inline SVG sparkline (popover only)
  BarList.tsx                       horizontal bar list
  Donut.tsx                         hand-rolled SVG donut w/ center hover-swap
  RevenueAreaChart.tsx              hand-rolled SVG area chart (crosshair + tooltip)
  DataTable.tsx                     sortable table
  StatusDot.tsx                     activity/status dot
  index.ts                          barrel

src/app/admin/component/overview/   ← REWORK in place (same files, same hooks, new JSX)
  DashboardOverview.tsx             new row layout; renders the kit
  KpiGrid.tsx (rename/replace KPIMetricsGrid)  two KPI groups
  RevenueChartCard.tsx              wraps RevenueAreaChart
  MembershipCard.tsx                donut + legend + pastDue/paused tiles
  RevenueBreakdownCard.tsx          BarList
  AdvertisingPlatformCard.tsx       NEW: by-platform table (FB live + coming soon)
  PrizePerformanceCard.tsx          per-prize table restyled (from AdvertisingBreakdownSection)
  TopDrawsCard.tsx                  NEW: "Coming soon" placeholder card
  UpcomingRenewalsCard.tsx          renewals list
  ActivityCard.tsx                  restyled rich activity feed
  QuickActionsCard.tsx              restyled quick actions
  DateRangeDropdown.tsx             NEW: replaces floating toggle (in OverviewToolbar's slot)
```

**Layering:** kit components are presentational only (props in, no hooks/API). Data stays in the section
components, which call the existing hooks and pass formatted props down — consistent with repo layering.

**Reuse the existing data hooks unchanged:** `useAdminDashboardStats`, `useMembershipByPackage`,
`useRevenueBreakdown`, `useSpendByUrlAnalytics`, `useUpcomingRenewals`, `useActivityLogInfinite`,
`useCurrentAndLastDrawDates`. Date-range state, URL sync, and `CustomDateRangeModal` stay in
`DashboardOverview.tsx`.

## 5. Infrastructure prerequisites (do FIRST — these silently break the look if missed)

1. **`tailwind.config.ts`** — add `fontFamily.display: ["var(--font-poppins)", ...]` (so the mockup's
   `font-display` classes resolve to Poppins). Add `fontSize["2xs"]: ["0.6875rem", { lineHeight: "0.95rem" }]`.
   (`brand-tier` and `red-600` already exist — leave them.)
2. **Admin CSS utilities** — port into `src/app/globals.css` (scoped so they don't leak): `.lift`, `.lift-lg`
   (card/popover shadows, light + `.dark` variants), `.fade-up` (popover entrance), `.num`
   (`font-variant-numeric: tabular-nums`). Reuse the existing thin-scrollbar utility (`admin-scrollbar`)
   instead of the mockup's `.frame-scroll`.
3. **`fmtCompact`** — add to `src/utils/metrics/formatters.ts` (e.g. `$4.2M`, `$214.8k`, `$820`) and expose
   via `useMetricsFormatting()`. Used for chart axis labels + the revenue-breakdown subtitle total.
   Keep KPI tile values as whole-dollar `$${n.toLocaleString("en-AU")}` (matches the existing tile style;
   `formatCurrency`'s 2dp is wrong for tiles).
4. **`Popover` must `createPortal` to `document.body`** and re-anchor on `scroll`(capture)/`resize` — the
   admin content is `overflow-y-auto`, so an in-flow popover would clip/drift. Same for the date dropdown panel.

> Doc-sync: changes under `src/` require the matching `docs/<domain>/` update. Tailwind/globals.css →
> `docs/shared-ui/`; formatters → `docs/metrics-analytics/`; everything under `src/app/admin/**` &
> `src/components/admin/**` → `docs/admin/`. Update these in the same task as the code.

## 6. Layout (top → bottom) + responsive recipes

Page wrapper: `space-y-5 md:space-y-6`. The mockup renders inside a fake ~420px phone frame and fakes
container queries with `.mobile-frame` overrides; in the real app the **default (unprefixed) classes ARE the
mobile state** and `lg:`/`xl:` are desktop. **`min-w-0` is mandatory on every grid child that holds a chart
or table** (or it overflows).

| Row | Components | Grid recipe |
|---|---|---|
| 1 | KPI group "Revenue" (4 tiles) | `grid grid-cols-2 lg:grid-cols-4 gap-3` |
| 1 | KPI group "Users & Performance" (5 tiles) | `grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3` |
| 2 | Revenue area chart (⅔) + Membership donut (⅓) | `grid grid-cols-1 lg:grid-cols-3` → children `lg:col-span-2 min-w-0` + `lg:col-span-1 min-w-0` |
| 3 | Revenue breakdown (½) + Advertising-by-platform (½) | `grid grid-cols-1 lg:grid-cols-2` |
| 3b | Prize performance (full width) | single card |
| 4 | Top mini draws (⅔, Coming soon) + Upcoming renewals (⅓) | `grid grid-cols-1 lg:grid-cols-3` → `lg:col-span-2 min-w-0` + `lg:col-span-1 min-w-0` |
| 5 | Recent activity (⅔) + Quick actions (⅓) | `grid grid-cols-1 lg:grid-cols-3` → `lg:col-span-2 min-w-0` + `lg:col-span-1 min-w-0` |
| 6 | Users breakdown (age/state/profession) — **collapsed by default** | full width; kept until the Users page is built (not in mockup) |

Row gap: hardcode `gap-5 md:gap-6` (the mockup's density-prop source is host-only; don't thread it).
KPI grids use `gap-3`. Tables use the kit `DataTable` (`overflow-x-auto` so 5-col tables scroll on mobile).

## 7. Component spec + data map

Tone/color tokens, exact class strings, spacing, radii (`rounded-2xl` cards / `rounded-xl` tiles), `.lift`
hover, and interaction details are captured verbatim from the mockup in the review appendix (see
`docs/admin/` after implementation). Data mapping per element:

### 7.1 KPI tiles (`MetricCard` + `KpiGrid`)
All live from `useAdminDashboardStats` (+ `useMembershipByPackage` for Membership Revenue). `TrendPill`
returns `null` when trend is `null` (all-time); `invert` on Cancellations (a drop = green).

| Tile | Source | Format |
|---|---|---|
| Revenue (clickable) | `stats.revenue.total` / `.totalTrend` | whole-dollar; popover = top-4 of `stats.revenue.breakdown` |
| Membership Revenue (clickable) | `membershipSummary.totalActiveRevenue`; sub = `totalActiveCount` active · `totalPastDueCount` past due | popover = tiers from `membershipByPackage.packages` |
| Ad Spend | `stats.facebookAds.spend` / `.spendTrend` | whole-dollar |
| ROAS | `stats.facebookAds.roas` / `.roasTrend` | `${roas.toFixed(2)}x` |
| Total Users | `stats.users.total` / `.totalTrend` | `toLocaleString` |
| New Signups | `stats.users.newInRange` / `.newInRangeTrend` | `toLocaleString` |
| Conversion Rate | `stats.conversionRate` / `.conversionRateTrend` | `${rate.toFixed(1)}%` (normalize the missing `toFixed`) |
| Cancellations (invert) | `stats.users.cancelledMemberships` / inverted trend; sub = `cancellationImpact.estimatedMonthlyRevenue` at risk | whole-dollar sub |
| Renewal Rate | `stats.users.renewalProgress.rate`; sub = `renewed of base`, `remaining` | `${rate}%` or `—` |

### 7.2 Revenue area chart (`RevenueAreaChart`)
- Source: `useRevenueBreakdown(period)` → `chartData[]`, each point `{ date, dateKey, oneTime, memberships,
  miniDraw, total }`. **Render a single area of `total`.**
- **The chart follows the dashboard date dropdown:** map `dateRange` → period (`today`/`yesterday`/draw/custom
  → `days`; `all-time` → `months`). Axis ticks + `axisLabel` derive from the points; values via `fmtCompact`.
- Faithful look: y-gutter (4 labels), gradient fill `0.26→0`, smooth catmull-rom line `stroke={accent}`,
  dashed hover crosshair + white ring dot, dark floating tooltip. Header `SectionTitle` "Revenue overview" /
  "Hover the line for exact daily figures" + a "Tracking up/down" `Badge`.
- **Replaces** `src/components/admin/RevenueOverview.tsx` (removed — see §9).

### 7.3 Membership donut (`MembershipCard` + `Donut`)
- Source: `useMembershipByPackage`. Segments = `packages[]` (Tradie/Foreman/Boss) using `activeCount`;
  colors from `brand-tier` tokens (D4). Center = `totalActiveCount` / "active", swaps to the hovered tier's
  count/label on hover.
- Legend row: tier name + `$price/mo` (price from **static `src/data/membershipPackages.ts`** via
  `getPackageById(packageId).price` — NOT the hook), `activeCount`, `activeRevenue`.
- Past-due / Paused tiles (`grid-cols-2`): Past due = `summary.totalPastDueCount` (live, red). **Paused =
  "Coming soon"** (amber tile, muted — no `paused` field exists anywhere).

### 7.4 Revenue breakdown (`RevenueBreakdownCard` + `BarList`)
- Source: `stats.revenue.breakdown` 6 entries (membershipPurchase, membershipRenewal, oneTimePurchase,
  additionalOneTimePurchase, miniDraw, upsell). Each → label (hardcoded), `revenue`, `purchaseCount` + unit,
  fixed color per row. Subtitle total via `fmtCompact`.

### 7.5 Advertising — two cards (D3)
- **AdvertisingPlatformCard** (by platform): columns Platform / Spend / ROAS. **Facebook row** =
  `stats.facebookAds.spend` + `.roas`. **TikTok + Snapchat rows = "Coming soon"** (muted, no numbers).
  Clicks/CPC columns **omitted** (no data; note for later). Header blended-ROAS = FB ROAS (only live row).
- **PrizePerformanceCard** (full width): the existing `useSpendByUrlAnalytics` per-prize table
  (Ryobi/Milwaukee/DeWalt/Makita) restyled into the kit `DataTable`. Columns Prize / ROAS (derived
  `revenue/spend`) / Spend / Revenue / Conversions. (Relabel the mockup's "Clicks" → the live `Conversions`.)

### 7.6 Top mini draws (`TopDrawsCard`) — **whole card "Coming soon"**
No ranked-mini-draw hook exists. Render the design's card chrome with a "Coming soon" empty state filling the
⅔ column (do not leave an empty 2/3 box). Wiring is a follow-up.

### 7.7 Upcoming renewals (`UpcomingRenewalsCard`)
- Source: `useUpcomingRenewals(range, page, limit)` → `renewals[]` (`customerName`, `amountFormatted`,
  `renewalDateFormatted`). Avatar tint by tier (`brand-tier`). Header total = `totalRevenue`.

### 7.8 Recent activity (`ActivityCard`)
- Source: `useActivityLogInfinite` (keep infinite scroll). Timeline with status dots colored by the emitted
  **`status`** field (success/warning/error/info). Keep the rich `action` text + mini-draw linkify.
- **Do NOT color-code by `type`** — renewal/cancellation/upsell/mini-draw collapse into
  `membership_purchase`/`membership_upgrade`/`one_time_purchase`; `system_alert` is never emitted.

### 7.9 Quick actions (`QuickActionsCard`)
- Keep the **wired** actions in the design's grid styling: Create Major Draw (live), Export Participants
  (live). **Add Product** (stub — only `console.log`s) and **Send Broadcast** (no `onClick`) → tag
  "Coming soon"/disabled. Do not ship dead buttons styled as live.

## 8. Date dropdown (`DateRangeDropdown`)

Replaces the floating `DateRangeToggle` **inside `OverviewToolbar` only** — do NOT edit the shared
`src/components/admin/DateRangeToggle.tsx` (facebook-ads / promo-analytics / cancellation-flow tabs may reuse
it). Contract to preserve exactly:

- Props: `selectedRange`, `onRangeChange`, `onCustomClick`, `displayDate` (drop-in for `DateRangeToggle`).
- Ranges = the live **6**: Today / Yesterday / Current Draw / Last Draw / All Time / Custom. **No "7d"** (the
  mockup's `7d` does not exist in the real `DateRange` type).
- Stay **URL-controlled** (selection derived from `?dateRange/startDate/endDate`). Non-custom/non-draw ranges
  must **delete** `startDate`/`endDate` (not blank them) — TanStack keys `[dateRange, startDate, endDate]`
  depend on it. Route `custom` → `onCustomClick`/`onRangeChange("custom")` (opens the existing modal); never
  call `updateDateFilter("custom")` with no dates.
- Render in all three placements `OverviewToolbar` covers: desktop sticky bar (`z-30`), mobile portal into
  `#admin-mobile-date-toolbar-slot`, and the pre-portal inline fallback. **Panel must portal to body /
  z-index above 30** so it isn't clipped by the sticky bar or the slot's `overflow`/`border-b`.

## 9. Cleanup / removals (verify-before-delete already done)

- **Delete** (confirmed orphan-dead, only re-exported by the unused barrel `src/app/admin/component/index.ts`):
  `MembershipStats.tsx`, `AdminStatsCard.tsx`, `RecentOrders.tsx`, `TopProducts.tsx`, and the dead barrel
  itself (keep direct-path components it re-exports).
- **Replace & remove** `src/components/admin/RevenueOverview.tsx` (live, overview-only) with the new area chart.
- **Do NOT touch** `src/app/(site)/my-account/components/RecentOrders.tsx` (different, live file).
- `AdvertisingBreakdownSection.tsx` → becomes `PrizePerformanceCard.tsx` (restyle, keep the hook).

## 10. Out of scope (explicit)

Sidebar/header restyle beyond the date dropdown; wiring TikTok/Snapchat, Top-mini-draws, Paused count,
Clicks/CPC, MRR; relocating Users breakdown to the Users tab; all other 19 admin tabs. Each is a later
page-by-page pass.

## 11. Phasing (each phase ships a visible win)

1. **Foundations** — UI kit primitives (Card, Badge/TrendPill, MetricCard, Popover, Sparkline, BarList,
   StatusDot, DataTable) + token/CSS/formatters prereqs (§5). No charts yet.
2. **KPIs + date dropdown** — `KpiGrid` (both groups, detail popovers) + `DateRangeDropdown`. Top of page live.
3. **Charts row** — `RevenueAreaChart` + `Donut`/`MembershipCard`; remove `RevenueOverview`.
4. **Breakdown + advertising + prize performance** — Revenue breakdown, Advertising-by-platform, Prize
   performance.
5. **Draws/renewals + activity/quick-actions + cleanup** — Top draws (Coming soon), Upcoming renewals,
   Activity, Quick actions; delete dead components; doc-sync (`docs/admin/`, `docs/shared-ui/`,
   `docs/metrics-analytics/`).

## 12. Risks / open items

- **Two-source ad ROAS:** KPI ROAS tile (`facebookAds.roas`, account-level) and the Prize-performance table
  ROAS (derived per-prize) are different measures and may not reconcile — this is intentional (different
  scopes); label them clearly. Not a blocker.
- **`xl:grid-cols-5`** for the 5 Users tiles only engages on wide screens (sidebar eats ~252px); at `lg`
  they're 4-up with the 5th wrapping — acceptable.
- **`display:contents` on the KPI wrapper** (so the tile is the grid item) — verify the active-ring renders
  without a wrapping box; if it doesn't, drop `contents` and make `MetricCard` the direct grid child.
- **Users breakdown** kept as a collapsed bottom section for now (not in the mockup) so the data isn't lost
  before the Users page exists — confirm this is acceptable.
