# Admin — Frontend

> **Prize catalog imports (2026-07-20, perf Tier-2):** admin client surfaces that only need
> slugs/labels (`PromoAnalyticsManagement`, `PromoPageDetailModal`, the ab-testing
> `ExperimentDetailModal`/`ExperimentFormModal`) now import from the lightweight
> `@/config/prize-summaries` (`listPrizeSummaries` / `getPrizeLabel`). The one admin surface that
> renders a deep field — `MajorDrawManagement`'s Prize Information card (`detailedDescription`) —
> deliberately keeps a static `@/config/prizes` import (admin-chunk only, never in the landing
> graph). See [config-and-data architecture](../config-and-data/architecture.md) "Prize catalog split".

## Shop group — Products / Orders / Entry Multipliers (2026-08-20)

Shop is its **own sidebar group**, not a tab inside Operations. It was one Products tab until
2026-08-20, by which point it stacked five unrelated panels in a single scroll: the printer
sync, the catalogue, the entry-multiplier control, the fulfilment queue and the full order
history.

Split by **job**, not by data type — which is why Orders holds two panels that look similar
but answer different questions:

| Tab | id | Panels | The job |
| --- | --- | --- | --- |
| Products | `products` | `PrintProviderSync`, `ProductManagement` | Stock the shelf — pull a garment from the printer, price it, publish it |
| Orders | `shop-orders` | `FulfilmentQueue`, `OrdersManagement` | Get it made and shipped, then find it again afterwards |
| Entry Multipliers | `shop-multipliers` | `ShopEntryMultiplierPanel` | Tune what a purchase grants during a promo |

All three are gated on `shop.view`; write actions inside each still check `shop.edit`
separately, so a read-only role sees the pages without the buttons.

**`products` deliberately keeps its id** even though its siblings are `shop-`prefixed. It is an
existing URL and an existing permission pairing; renaming it would break bookmarks and buy
nothing. A new reader should not take the inconsistency as a naming rule to copy — new shop
tabs get the `shop-` prefix.

**Why the fulfilment queue and the order history sit together rather than apart:** the queue
lists only what is still waiting to be sent. Support's actual question is usually about an
order that has *already* shipped, so the searchable history has to be one scroll away, not one
tab away.

### Products tab (2026-08-17)

Shop catalog management — the first admin surface for `Product`. Lives under
**Shop → Products**, gated on `shop.view`.

| File | Role |
|---|---|
| [ProductManagement.tsx](../../src/components/admin/ProductManagement.tsx) | List panel: cards, feedback banner, per-row action lock |
| [AdminProductModal.tsx](../../src/components/modals/AdminProductModal.tsx) | Create / edit form incl. the repeatable variant editor |

Follows `MilestoneRewardsPanel` exactly — plain `fetch` + `useState`/`useCallback`, **not**
TanStack Query, a `feedback` banner rather than toasts, `actionProductId` to disable one row's
buttons mid-request, and a sibling `Admin*Modal`. Match that panel, not the TanStack ones, if
you extend this.

**Three things that are deliberate, not accidents:**

1. **Price and "Free entries included" sit side by side in the form.** They are authored
   independently — an entry count must never be derived from price (rule 11) — so a repricing
   edit has to show both in one glance, or the two drift apart silently. This is the drift
   mitigation named in the entries spec.
2. **`trackInventory` defaults OFF in the create form** even though the schema default is
   `true`. New products here are print-to-order merch; a stocked product is the exception. The
   stock field only appears when the box is ticked.
3. **Edit/Delete buttons are hidden via `usePermissions().has(...)`, not just gated server-side**
   — per [rules.md](rules.md) R6, staff without the permission should never click into a 403.
   The tab itself is filtered out of the sidebar by `requires: "shop.view"`.

The modal refuses to submit while an image is still a `File` rather than a Cloudinary URL —
`ImageUpload` uploads on drop, so a pending upload would otherwise be dropped from the payload
on save.

## Bonus Code Status panel (2026-09-01, reworked)

`BonusCodeAudiencePanel` (`src/components/admin/BonusCodeAudiencePanel.tsx`) is mounted above
`MonthlyRedeemablesCampaignPanel` in `PromoManagement`'s "Redeemables" tab — the same place the
existing coupon analytics live. Read-only, self-contained `fetch` (same pattern as its sibling
panel, not a TanStack Query hook): calls `GET /api/admin/monthly-coupon/trigger-audience`.

**Leads with real issuance state (the owner's own ask), not the forecast.** Per trigger
(`cancel-click` / `checkout-start` / `one-time-purchase`), four primary tiles: **Minted**
(`issuance.issuedCount` — granted, any status, "they have access to it"), **Still redeemable**
(green), **Redeemed** (red, plus entries granted), **Expired / lapsed** (amber — the number that
tells the owner the flow is minting faster than customers act). Each of the three states below
"Minted" has its own expandable, bounded (25 max) sample table with name/email/entries/date.

**All-zeros empty state.** All three campaigns sit at 0 issuances in production as of
2026-09-01 — when `issuance.issuedCount === 0`, the panel renders a plain dashed-border "No
{CODE} codes minted yet" message instead of zero-filled tiles, so it reads as "nothing yet, not
broken."

**The addressable-population forecast (the panel's ENTIRE content in the first version) is
demoted, not deleted** — a native `<details>` "Potential reach (forecast, not current
holders) ▸" section per row, collapsed by default, holding the same last-30/90-day + all-time
figures, the `checkout-start` calibration caveat, and its own bounded sample. Full contract:
[docs/rewards-redeemables/api.md](../rewards-redeemables/api.md#get-apiadminmonthly-coupontrigger-audience--bonus-code-status-2026-09-01-reworked).
This view cannot mint, issue, or redeem anything.

## Monthly Redeemables Campaign panel — `validForHours` (2026-08-25; renamed from `validForDays` 2026-08-26)

`MonthlyRedeemablesCampaignPanel` (Admin > Redeemable Coupons, `src/components/admin/MonthlyRedeemablesCampaignPanel.tsx`)
lists `MonthlyEntryCampaign` rows from `GET /api/admin/monthly-coupon/campaign`, which now also
returns `validForHours` (per-customer window, in HOURS from the issuing instant) and `issuanceCount` (total
`RedeemableIssuance` rows for the campaign, any status).

- A shared `renderExpiryLabel()` helper renders at all three expiry display sites (the mobile
  card, the desktop table's Window column, and the desktop name-column subtext) so an operator
  can tell a fixed-end campaign from a rolling one at a glance:
  `{n}-hour window per customer (stops issuing {formatted endsAt})` when `validForHours` is set
  (checked via the imported `personalWindowGoverns` predicate from
  `src/utils/redeemables/bonus-code-policy.ts` — never re-derived inline), else the existing
  `neverExpires` / `formatDateTime(endsAt)` behavior. **Reworded 2026-08-27** ("backstop" → "stops
  issuing") and given an open-ended branch — see [the two-clocks section
  below](#monthly-coupon-campaigns--the-expiry-column-reads-two-clocks-2026-08-27). The mobile
  card's line prefix also changed from `End:` to `Expiry:`, because the value is no longer always
  a date.
- Delete is now always a soft delete (`isActive: false`) server-side — the confirm copy was
  updated to say so plainly rather than the old "if issuances exist" hedge.

The create/edit form itself is `AdminMonthlyRedeemablesModal` — **rebuilt 2026-08-27 around one
question ("How this coupon ends") with three shapes**; see
[shared-ui/frontend.md](../shared-ui/frontend.md#adminmonthlyredeemablesmodal--how-this-coupon-ends-rewritten-2026-08-27)
(it lives under `src/components/modals/**`, which the Domain Manifest routes to `shared-ui`, not
`admin`, despite being admin-only).

## Repeat Purchases tab (2026-07-09)

`repeat-purchases` — a new **Analytics** group tab (`RepeatPurchaseAnalytics`, `src/components/admin/RepeatPurchaseAnalytics.tsx`), gated by `pageAnalytics.view`. Measures one-time-package buyers who came back and bought again (the one-time equivalent of renewal analytics). Structure mirrors `AllPlatformsManagement`: a right-aligned `AdminDateRangeToolbar` (default `all-time`; cohort filter = first-purchase date) → a 6-tile `MetricCard` KPI grid (one-time buyers / repeat buyers / repeat rate / median days to return / repeat revenue / became members) → a `BarList` of first→second-purchase gap buckets + a "return rate by window" table (matured denominators) → a Users `Card` with a `Segmented` (All / Returned / Not yet returned) + bucket chips + `DataTable` whose User cell is a `ClickableUserDisplay` opening the shared User Detail modal. Loading = `MetricCard` skeletons + pulse bars; empty/error = inline messages. All styling is paired light/`dark:` Tailwind from the `@/components/admin/ui` kit (no chart library). Registered in `adminTabs.ts` (Analytics group), rendered + subtitled in `AdminPage.tsx`, and added to `ADMIN_TABS_WITH_MOBILE_LAYOUT_DATE_TOOLBAR` so the date dropdown portals into the mobile header. Data via `useRepeatPurchaseSummary` / `useRepeatPurchaseUsers` (see [client-state](../client-state/patterns.md)).

**Users table specifics.** Two `Segmented` filters (return status: All / Returned / Not yet returned, and membership: Any / Members / Non-members — the latter filters on the `becameMember` conversion flag so it reconciles with the "Became members" KPI) plus bucket chips; all combine and drive both the list and the CSV export. Columns: User · First purchase · Days to return · One-time buys · **Last purchase** · Total spent · Member?. It shows First + **Last** (most-recent) purchase rather than First + Second, because for the ~65% of repeat buyers with exactly two purchases the second *is* the last, so two date columns would duplicate — "Days to return" already carries the reconversion timing. `DataTable` sort works because each table row exposes **primitive sort-keys** matching the column keys (`first`/`days`/`count`/`last`/`spent` as numbers) with the source row carried on `src` for `renderCell` (not-returned users sort their `days` to the end via a `MAX_SAFE_INTEGER` sentinel). The list pages 50-at-a-time with a **Load more** button (`useInfiniteQuery` facade). An **Export CSV** button in the card header downloads the whole current-filter cohort via `/users/export` (blob + `content-disposition` filename, the `UserExportModal` download idiom).

**Clickable buckets (2026-07-09).** The bucket bars in the "How soon they bought again" chart are `<button>`s: clicking one sets (toggles) the Users-table `bucket` filter via `selectBucket` and scrolls the Users `Card` (`usersRef`) into view — reusing the exact `/users` + `/users/export` wiring the bucket chips already drive, so no new route/query/export was needed. A gap-bucket only exists for a *returned* buyer, so a click resets the return-status `Segmented` from "Not yet returned" → "All" (mirrors the chips' `disabled={segment === "not-returned"}` guard). The scroll respects `prefers-reduced-motion`.

**By one-time package card (2026-07-10).** Between the two mid-page cards and the Users table, a `Package`-iconed `Card` renders `summary.packages` as a grouped-header table: **Started with this pack** (Buyers · Repeat rate · Became member · Downstream $ — anchor-grouped, per buyer whose *first* pack was this) vs **All purchases** (Purchases · Gross $ — per-purchase). Answers "which entry pack brings buyers back / converts to members, and which just sells." **Rates lead** (bold, each with its `n of N` denominator); revenue + counts are muted. Reads the summary the tab already loads — **no new route/query/hook**. Low-n guard: rows with `startedBuyers < LOW_N` (15) are dimmed + tagged *small sample*; packs with **0 starters** (the `additional-*` top-up packs that only appear as later buys) are tagged *add-on only* and show `—` for the anchor rates. Copy is plain/free-entry framing (no gambling/probability language, per legal rule #11).

> **Loader (2026-07-03):** the admin auth/loading states (`admin/page.tsx`, `admin/layout.tsx`
> Suspense fallback, `admin/[tab]/page.tsx`) now render the shared [`DashboardLoader`](../../src/components/loading/DashboardLoader.tsx)
> — the Claude Design "Dashboard Loader" medallion (theme-adaptive; adapts via the `.dark` class
> `AdminThemeContext` sets on `<html>`) with a static `label="Loading admin…"` — replacing the bare
> red-arc spinner. See [shared-ui/frontend.md § DashboardLoader](../shared-ui/frontend.md#dashboardloader-ported-from-claude-design-2026-07-03).

> **Sign-out (2026-07-02):** `AdminSidebar`'s sign-out now calls `totalSignOut()`
> ([src/utils/auth/total-sign-out.ts](../../src/utils/auth/total-sign-out.ts)) — clears user-scoped
> client storage before ending the session (keeps `ta-admin-theme` + admin UI-layout keys). See
> [auth/frontend.md](../auth/frontend.md#total-sign-out-2026-07-02).

## Prize performance card — totals row (2026-08-11)

The table now ends in a **Total** row: summed spend, revenue and conversions, plus a ROAS
recomputed as **`total revenue ÷ total spend`**.

**Not an average of the per-row ROAS values** — that would weight an $11 prize the same as a
$276 one and produce a number matching nothing. Computed this way the footer reconciles
exactly with the ad platform's own account-level figure, which is the point of showing it: on
2026-08-10 the TikTok tab summed to $411 spend / $90 revenue / 3 conversions / **0.219**,
matching TikTok Ads Manager to the cent.

It renders through a new optional **`footer`** prop on the shared `DataTable`
([`src/components/admin/ui/DataTable.tsx`](../../src/components/admin/ui/DataTable.tsx)) — a
real `<tfoot>`, so it stays column-aligned and is announced as a footer rather than as one
more data row, and it is **not** sorted with the body. The prop takes the `<tr>`/`<td>`s from
the caller and deliberately computes nothing: a table's totals are rarely a plain column sum,
as the ROAS case above shows. Optional, so every existing `DataTable` consumer is unchanged.

⚠️ **The blended caveat still applies.** Under "All platforms" the revenue column adds each
platform's OWN attribution, so a purchase claimed by both Meta and TikTok is counted twice and
the total ROAS reads high — same warning already shown beneath the table. The per-platform tabs
are the figures that reconcile.

### The Total row is a drill-down too (2026-08-11)

Clicking it opens `PrizePerformanceAdsModal` across **every** prize rather than one brand, so
you can see the whole account's campaign → ad-set → ad tree in one place.

It works because the modal already takes `canonicalUrlsByPlatform` (a per-platform URL *list*)
and `useSpendByUrlDetailMany` sends them as repeated `canonicalUrl` params in **one** request —
so the Total row is the same code path with a bigger URL set, not a new fetch shape. The route
imposes no cap and dedupes server-side.

Three things to preserve:

- **The URL union is deduped client-side with a `Set`.** Two prizes can advertise the same URL
  (a combo page like `/promotions/milwaukee-milwaukee` appears under more than one brand).
  Passing it twice would double-count that URL's ads, and the drill-down would then disagree
  with the Total row that opened it.
- **It is built from `rows`, not the full catalogue**, so it always matches whatever the
  platform chips are currently showing.
- **It opens on one platform** (chips' selection, else Meta) for the same reason a mixed brand
  row does — ad ids are only unique WITHIN a platform, so a merged tree would be ambiguous.

The row carries `role="button"`, `tabIndex={0}` and an Enter/Space handler, matching how
`DataTable` makes its body rows keyboard-reachable when `onRowClick` is set (panel F-017) —
the footer is rendered by the card, not by `DataTable`, so it has to do that itself.

## Prize performance card — brands derived from the source of truth (2026-06-30)

`PrizePerformanceCard` `PROMOTION_BRANDS` is now **derived** from `TOOLSET_LANDING_SLUGS`
([`src/config/promo-landing-slugs.ts`](../../src/config/promo-landing-slugs.ts)) instead of a
private hardcoded 4-brand array, so **HiKOKI** (and any future brand) appears automatically once
it has Meta spend on its `/promotions/<slug>` URL. Display names come from a `BRAND_DISPLAY_NAME`
map typed `Record<ToolsetLandingSlug, string>` — adding a brand to the source of truth without a
display name is a **compile error**, not silent drift. The forked array was exactly why HiKOKI was
missing here while every other surface already had it. Logo path is derived by convention
(`/images/brands/name/<slug>Text.svg`). Full checklist: config-and-data/patterns.md → "Adding a promotion brand".

## Prize performance card — SVG brand logos (2026-06-22)

`PrizePerformanceCard` `PROMOTION_BRANDS` logos now point at the shared SVG wordmarks
(`/images/brands/name/*.svg`), rendered with `<Image unoptimized>`. The per-brand
`logoScale` nudge (and the `logoScale` field on `PrizeRow`) was removed — the wordmark SVGs
are pre-normalised to a uniform frame, so all brand logos read at equal size in the table
without compensation. See `docs/promo/frontend.md` for the asset normalisation details.

## Promo Analytics table — Builds column added; Cross-visits deliberately kept (2026-07-28)

> **Superseded 2026-07-31** — Cross-visits was removed, and **Builds** changed meaning (it now
> reads engagement, with exposure on the sub-label). Sorting no longer takes `keyof PromoPageMetrics`.
> See [Page Analytics rebuild](#page-analytics-rebuild-2026-07-31). Kept for the history of why the
> column was retained in July.

[`PromoAnalyticsManagement`](../../src/components/admin/PromoAnalyticsManagement.tsx)'s per-page
table gained a **Builds** column, inserted immediately after the then-existing **Cross-visits** column
(same order in both the `<thead>` and each `<tbody>` row, so header and cell stay aligned). Cell
shows `formatNumber(row.builds)` with a `Top: {label}` sub-label line rendering the top combination
(`getPrizeLabel(row.topBuiltPrize) ?? row.topBuiltPrize`) when one exists — the `Top:` prefix makes
the caption self-explanatory without a hover (panel-review F-005, fixed 2026-07-28). The sub-label
is `truncate`d to one line at `max-w-[110px]` so it can't wrap into a multi-line staircase and
balloon row height on narrow admin widths (panel-review F-011, fixed 2026-07-28 — measured at
390px: an untruncated 44-char label wrapped to 8 lines / +39.5px row height); the full name stays
reachable via the cell/header `title` attributes, which explain both states ("Nobody built a prize
on this page in this period" when `topBuiltPrize` is `null` — never rendered as the literal string
"null"). Sortable via the same
`handleSort` / `getSortIcon` pair as every other numeric column — no separate `SortKey` type
exists; both take `keyof PromoPageMetrics` directly, and `"builds"` is now a valid value of that
union automatically since `builds` was added to the `PromoPageMetrics` interface. Data comes from the
new `builds` / `topBuiltPrize` fields on `PromoPageMetrics` — see
[docs/promo/backend.md](../promo/backend.md#prize-build-admin-surfacing--builds--topbuiltprize-2026-07-28)
for the aggregation.

**Cross-visits was NOT removed *at the time*.** An earlier draft of this task assumed the column
(reads `referrerSlug`) was structurally dead, since nothing has written a new `referrerSlug` since
2026-07-24 (its only writer, the "Explore other toolsets" carousel, was removed when the prize
builder's toolset reel took over that job). That premise was re-tested against the live DB and
found false at the time: 174 of 712 visit rows (~24%) still carried `referrerSlug`, spanning
June–July, inside the 90-day TTL. **That window has since closed** — the last row carrying
`referrerSlug` is dated 2026-07-22, so by 2026-07-31 the column was a structural zero for every
reachable range and it was removed along with the field, the index declaration and the
`visitsFrom` panel in `PromoPageDetailModal`.

## Promo Analytics — Switched-away % column + By Built Prize table (2026-07-28)

> **Partly superseded 2026-07-31.** The "Switched away % of Builds" column and its
> `getSwitchAwayRate` / `getPageDefaultPrizeSlug` client-side derivation are **gone**, replaced by
> a server-computed **Changed %** (`buildChangeRate`) whose numerator and denominator are both
> page-level uniques — so the unit mismatch that produced 250% is structurally impossible rather
> than merely corrected. `getPageDefaultPrizeSlug` moved to `src/config/promo-landing-slugs.ts` so
> the server can use it. The **By Built Prize** and **By Toolbox** tables below are unchanged. See
> [Page Analytics rebuild](#page-analytics-rebuild-2026-07-31).

Surfaces the two read-side additions from
[docs/promo/backend.md](../promo/backend.md#read-side-gap-closure--builddistribution--getaggregatedbybuiltprize-2026-07-28)
(`buildDistribution` on `PromoPageMetrics`, `PromoAnalyticsService.getAggregatedByBuiltPrize` /
`data.byBuiltPrize` on `GET /api/admin/promo-analytics`) in the admin UI. Both additions are
in [`PromoAnalyticsManagement.tsx`](../../src/components/admin/PromoAnalyticsManagement.tsx).

**a) "Switched away % of Builds" column** — new trailing column on the existing per-page table
(after `Conv %`; same `hidden md:table-cell` treatment and non-sortable static-text style as the
other three rate columns — it isn't a stored field on `PromoPageMetrics`, it's derived
client-side, so it follows the convention already used by `visitToSignupRate` et al. of never
getting a sort button). The header text spells out the denominator ("of Builds") instead of
relying on the `title` tooltip alone — the un-suffixed "Switched away %" read as a share of
`visits` on a skim, a much larger and more alarming base than the real denominator (`builds`);
matches the sibling By Built Prize table's `B→S %` naming convention of putting the ratio in the
visible label (panel-review F-004, fixed 2026-07-28). Header + cell count: **11 `<th>` / 11
`<td>`** (was 10/10 before this task).

Derivation (`getSwitchAwayRate` + `getPageDefaultPrizeSlug`, both module-level pure functions
above the component): the page's OWN default combination is what a visitor sees without
touching a reel — `getDefaultPrizeForToolsetSlug(row.slug)` for a toolset landing slug,
`row.slug` itself when `isToolsetLandingSlug(row.slug)` is false (evergreen pages' `slug` already
IS a prize slug). "Switched away" sums `buildDistribution` visitor counts for every entry whose
`builtPrizeSlug` differs from that default, as a percentage of `builds` (NOT `visits` — `builds`
is the meaningful denominator: "of the people who built something, how many picked something
other than the default"). **`builds === 0` renders an em dash** (`—`), never `"0%"` or `"NaN%"` —
those would misleadingly read as "nobody switches" rather than "nobody built anything to measure
switching on." The `title` tooltip on the non-zero-builds cell spells out the raw counts (e.g.
"3 of 8 builders picked a different combination than this page's default (Milwaukee Kincrome)");
the zero-builds cell's tooltip reads "Nobody built a prize on this page in this period", matching
the existing Builds-column tooltip idiom.

**b) "By Built Prize" table** — new table rendered below the per-page table, from
`data?.byBuiltPrize ?? []` (optional-chained the same way `data?.byChannel` — then named
`data?.byUTMSource` — already is in this
file, even though the API always includes the key — matches existing sibling-field convention).
Mirrors the Channel Attribution table's structure (static IIFE-computed `rows`, explicit
empty-state div — "No builds recorded for this period." — never a bare header with an empty
`<tbody>`, non-sortable, `hidden md:table-cell` on the three rate columns). Columns: Built prize
(via `getPrizeLabel(row.builtPrizeSlug) ?? row.builtPrizeSlug`, matching every other slug→label
cell in this file), Builders, Registrations, Conversions, Revenue, B→S %, S→C %, Conv %. **8
`<th>` / 8 `<td>`**. No row click / detail modal — not requested, and `byBuiltPrize` rows don't
map to a single landing page the way `PromoPageDetailModal` expects.

Full-file count after this task: **27 `<th>` / 27 `<td>`** across all three tables (UTM Channel
Attribution 8/8 + per-page 11/11 + By Built Prize 8/8) — verified by direct regex count, not by
inspection.

## Promo Analytics — By Toolbox rollup (2026-07-28, panel finding F-006)

A fourth table below **By Built Prize**, answering the one question the panel graded PARTIAL:
*"do Kincrome-box builders convert better than Milwaukee-box builders?"* `byBuiltPrize` groups by the
FULL combination (`milwaukee-kincrome`, `ryobi-kincrome`, `makita-kincrome`, …), so reading a
per-toolbox rate previously meant summing five rows by hand.

**Derived client-side on purpose.** The rollup is computed in a `useMemo` over the existing
`byBuiltPrize` array — no new API field, no repository change. That deliberately avoids dragging the
CLAUDE.md rule-10 Norm lockstep (schema + route + manifest + `norm-context.md`) along for a number
the client can derive from data it already receives. Norm still gets `byBuiltPrize` and can roll it
up itself.

Three things about it that are easy to get wrong, and are therefore load-bearing:

1. **The toolbox is resolved via `fromPrizeSlug()`** (`prize-selection/prize-builder-model.ts`),
   which matches BOTH slug segments against the `TOOLSETS`/`TOOLBOXES` registries — not
   `slug.split("-").pop()`. Positional splitting happens to work today (no toolset or toolbox id
   contains a hyphen), but the registry lookup stays correct if that ever changes, and it is already
   covered by `test:prize-builder`.
2. **`cash-prize` is excluded.** `fromPrizeSlug` returns `null` for it (cash is the opt-out, not a
   toolbox) and for any unrecognised slug, so neither can land in a bogus toolbox bucket.
3. **Rates are recomputed from the SUMMED totals, never averaged.** Averaging per-combination rates
   weights a 1-builder combo the same as a 100-builder one. Worked example:
   `milwaukee-kincrome {builders:10, signups:4}` + `ryobi-kincrome {builders:5, signups:1}` rolls up
   to `builders:15, signups:5` → **33.33%**, not the mean of 40% and 20% (30%). Zero-builder
   toolboxes render `0`/an em dash, never `NaN` or `Infinity`.

Sorted builders descending, toolbox name ascending as a deterministic tie-break. Toolbox names come
from the `TOOLBOXES` registry so the column reads "Kincrome", not `kincrome`. Empty state renders a
message rather than a bare header, matching the sibling tables. **8 `<th>` / 8 `<td>`.**

Full-file count after this addition: **35 `<th>` / 35 `<td>`** across all four tables (UTM Channel
Attribution 8/8 + per-page 11/11 + By Built Prize 8/8 + By Toolbox 8/8).

> **Now visually verified (2026-07-28).** Rendered on staging with a temporarily-promoted throwaway
> account. All four tables display correctly, and the By Toolbox rollup correctly attributed a real
> test purchase: `GearWrench · 2 builders · 1 registration · 1 conversion · $20.00`.

## Switched-away % — the denominator must come from the distribution (2026-07-28, F-013)

Staging showed **250%** in this column. The cause is worth remembering, because it is easy to
reintroduce: `row.builds` and `buildDistribution` count **different units**.

| | Counts |
|---|---|
| `row.builds` | unique **visitors** who built anything, deduped across the page |
| `buildDistribution[].visitors` | unique visitors **per combination** |

A visitor gets one visit row per page load, and each row keeps its own final build. So one person
who lands four times and settles on a different combination each time contributes **1** to `builds`
but **4** to the distribution. Summing distribution entries for the numerator and dividing by
`builds` therefore lets the ratio exceed 100%. Real data: `makita` on 2026-07-28 had 5 recorded
builds from 2 unique visitors — 5 ÷ 2 = 250%.

`getSwitchAwayRate` now divides the distribution by **its own total**, so both sides are in the
same unit and the value is bounded at 100%. The column reads "% of builds" — **records, not
people** — and the tooltip states that explicitly.

> Every automated test missed this. The unit suite, the seeded accuracy proof and the local browser
> runs all used **one row per visitor**, which is the one shape that cannot reproduce it. If you add
> coverage here, make a single visitor produce several different builds.

**Norm lockstep (CLAUDE.md rule 10).** `buildDistribution` and `byBuiltPrize` are now mirrored to
Norm — see
[docs/internal-norm/norm-context.md](../internal-norm/norm-context.md#get-v1promo-analytics),
which closes the "Not yet mirrored to Norm" gap flagged in the backend task's note. Wiring
`byBuiltPrize` into the Norm response required a small addition to
[`src/app/api/internal/norm/v1/promo-analytics/route.ts`](../../src/app/api/internal/norm/v1/promo-analytics/route.ts)
(a third parallel `PromoAnalyticsService.getAggregatedByBuiltPrize` call + one field on the
response, mirroring the admin route's own already-verified wiring three lines above it) —
without it, declaring `byBuiltPrize` as a required schema field while the route never returned it
would have made `withNorm`'s `responseSchema` validation genuinely 500 on every call to this
previously-working endpoint.

## Page Analytics rebuild (2026-07-31)

The `promo-analytics` tab ([`PromoAnalyticsManagement.tsx`](../../src/components/admin/PromoAnalyticsManagement.tsx)
plus [`ChannelDetailModal`](../../src/components/modals/ChannelDetailModal.tsx) and
[`PromoPageDetailModal`](../../src/components/modals/PromoPageDetailModal.tsx)) was rebuilt against
a corrected API. Backend rationale for every item: [docs/promo/backend.md](../promo/backend.md#page-analytics-repair--2026-07-31).

**Table counts after this change: 34 `<th>` / 34 `<td>`** — Channel Attribution 8/8, per-page
**10/10** (was 11/11: `Cross-visits` removed, `Switched away % of Builds` replaced 1-for-1 by
`Changed %`), By Built Prize 8/8, By Toolbox 8/8. _(By Built Prize is **9/9** and the total **35/35**
as of 2026-08-13 — see "Chose it" below.)_ The new
[`PrizeBuildBreakdownTable`](../../src/components/admin/promo-analytics/PrizeBuildBreakdownTable.tsx)
adds **8/8** inside `PromoPageDetailModal` — Combination · Builders · Changed · Signups · Conv ·
Rev · B→S · Conv %, the first six sortable (`builders` descending by default), the last two
`hidden md:table-cell` like every other rate column on this tab. `isPageDefault` is a badge inside
the Combination cell, not a column of its own.

**a) Local interface copies deleted.** `PromoPageMetrics`, `BuiltPrizeMetrics` and the local
`UTMSourceMetrics` were re-declared inside the component; they are now **type-only imports** from
`@/repositories/PromoAnalyticsRepository` (erased at build, so the data layer is never bundled —
see `eslint/rules/no-models-in-client.js`). The local copies had already drifted from the API once,
which compiles fine and renders `undefined` as `"0"`.

**b) Sorting is a closed union, not `keyof`.** `sortColumn` / `handleSort` / `getSortIcon` take
`SortablePageColumn = "visits" | "builds" | "signups" | "conversions" | "revenue"` instead of
`keyof PromoPageMetrics`, which lets the `as number` cast in the comparator go away — a
non-numeric column can no longer be wired into a sort header by accident.

**c) Retention banner.** When `data.dateRange.clampedToRetention` is true, an amber `Info` callout
above the tables states that visitor numbers start at `visitsRetainedFrom` (rendered in AEST via
`formatInTimeZone`) even though a longer range is selected, and that registrations / conversions /
revenue are not trimmed so rates against visitors read high for the clipped part of the period.

**d) Channel Attribution table.** Renders `data.byChannel` keyed on `row.channel`, displaying
`row.channelLabel`. The chip class comes from `CHANNEL_CHIP_CLASS[channelKind(row.channel)]`
(exported from `UTMCampaignBreakdownTable` so both tables paint the same chip from one source) —
the previous code branched on the literal string `"Direct"`, which silently stopped working the
moment labels moved into config and painted every channel paid-indigo. The row click passes the
**key** to `ChannelDetailModal`, never the label; the label rides along separately for display.

**e) Builds column now shows engagement over exposure.** Cell renders `formatNumber(row.builds)`
with an always-present sub-label `of {buildVisitors} shown` (em dash when `buildVisitors === 0`).
The old `Top: {label}` sub-label moved into the cell `title`. The trailing rate column is
**Changed %** = `row.buildChangeRate`, computed server-side from two page-level uniques, so unlike
the `getSwitchAwayRate` it replaces it cannot exceed 100% (F-013's 250%).

**f) `PromoPageDetailModal` — "Prize builds" section.** The `visitsFrom` panel is gone; in its
place a bordered card with three chips (**Saw a combination** = `buildVisitors`, **Changed it** =
`builds` + `buildChangeRate`, **Page default** = the default combination's label) above
`PrizeBuildBreakdownTable`. The card's own copy states that the chips are deliberately **not** the
column totals, because a visitor who landed more than once can appear under two combinations —
`Σ builders ≥ buildVisitors` (see [promo/gotchas.md](../promo/gotchas.md#page-level-uniques-are-not-the-column-sums-of-a-per-combination-breakdown)).

**g) `ChannelDetailModal` — `channel` + `channelLabel` props, and a "Traffic sources" strip.**
`channel` (a `ConvertingPlatform`) is what the query filters on; `channelLabel` is every string a
human reads. The new strip renders `data.rawSources` as chips (raw `utm_source` + visit count,
`(none)` for absent) so an operator can audit what folded into e.g. Facebook / Instagram, with
inline copy stating they may sum above the visit total. The campaign rows now spread
`data.channel` / `data.channelLabel` onto each row rather than omitting the field — the Channel
column stays hidden here (`showSourceColumn={false}`) since it would repeat the modal title.

**h) `UTMCampaignBreakdownTable` takes the shared `UTMCampaignMetrics` type** from
`@/types/promo-analytics` instead of a local `CampaignRow`, and keys rows on `row.channel`.

## Page Analytics — "Chose it" column + honest dedup copy (2026-08-13)

Two accuracy fixes in [`PromoAnalyticsManagement.tsx`](../../src/components/admin/PromoAnalyticsManagement.tsx),
both about numbers that were **correct but read as something they were not**.

**a) By Built Prize gained a "Chose it" column (9 `<th>` / 9 `<td>`; page total 35/35).** It renders
`interactedBuilders` with `chosenRate` as a sub-label, beside the existing `builders`. The build
beacon fires at **unload** and reports whatever combination was on screen touched or not (F-018 —
it must, or `builders` and `signups` count different populations), so `builders` is **exposure**:
on production only 10.6% of builders had changed anything, and the top row by exposure
(`milwaukee-milwaukee`) was chosen by 5.6% because it is the default on the busiest evergreen page.
Ranked by `builders` alone the table answered *"which page got traffic"* while being read as
*"which prize do people want"*. **The sort stays on `builders`** — signups, conversions and revenue
are all counted over the builder population, so sorting on a column scoped differently would put
the sort and the funnel on different footings. See
[promo/gotchas.md](../promo/gotchas.md#builders-is-exposure--the-built-prize-table-ranks-traffic-unless-you-read-the-right-column)
for the same-combination-two-pages proof (48.9% vs 2.0% at near-identical builder counts).

**b) Dedup copy corrected in two places** — the visits column `title` and the `totalVisits`
MetricCard `hint` claimed uniqueness was per *browser or signed-in user*. `PromoAnalyticsVisit.userId`
is set on **0** rows (`linkVisitToUser` has no callers), so it is per **browser** (`ta_anon_id`),
full stop: one person on a phone and a laptop is two visitors. Both strings now say so and warn
that ranges reaching before ~2026-08 read high, because 57.9% of all-time rows predate reliable
cookie minting and each falls back to a per-row placeholder visitor. Recent days are 97–99.5%
cookie-bearing, so **forward accuracy is fine; wide historical ranges inflate**.

## Pages

- `src/app/admin/page.tsx` — entry. Auth guard uses `usePermissions().isStaff` (Task 12, 2026-05-20). The legacy `useEffect` redirect and `session.user?.role !== "admin"` early-return have been removed; the component now checks `isLoading` / `isStaff` directly and calls `router.push("/")` when not staff. The admin layout's server-side guard (Task 14) is the primary gating mechanism; this is belt-and-suspenders for the client render.
- `src/app/admin/layout.tsx` — admin layout (sidebar, header)
- `src/app/admin/[tab]/` — tabbed feature views
- `src/app/admin/component/` — likely subroute for component-driven views

## A/B testing results dashboard — user-level Bayesian card (2026-06-12)

[`ExperimentResultsDashboard`](../../src/components/admin/ab-testing/ExperimentResultsDashboard.tsx)
now renders a **user-level result card** at the top, fed by the additive
`bayesian` field on `GET /api/admin/ab-testing/experiments/[id]/analytics`: per-variant
exposed users, converters, conversion rate, **chance-to-beat-control**, 95%
credible interval, capped **first-purchase** revenue/user and a **separate
recurring** column, plus a ship/keep **recommendation** badge. The legacy
chi-square "Statistical Significance" section is kept below during migration and
is slated for removal. See `docs/ab-testing/backend.md` "Statistics engine v2".

## Revenue overview — "Exclude renewals" toggle (2026-06-15)

The Overview [`RevenueChartCard`](../../src/app/admin/component/overview/sections/RevenueChartCard.tsx)
replaced the "Tracking up / down" badge with an **Exclude renewals** checkbox.
When checked, each point's series value becomes `total − membershipRenewals`, so
recurring (membership renewal) revenue is removed and the chart shows new revenue
only — e.g. a day spiking at $33.3k that is mostly renewals drops to its real
new-sales figure. The subtraction is **client-side** (no refetch) and the chart
y-axis auto-rescales; the toggle only appears when the window actually contains
renewal revenue.

Data side: [`GET /api/admin/dashboard/revenue-breakdown`](../../src/app/api/admin/dashboard/revenue-breakdown/route.ts)
now returns a per-point `membershipRenewals` (the renewal subset of `memberships`,
i.e. `data.billingReason === "subscription_cycle"` — the same discriminator the
KPI revenue breakdown uses) plus a `totals.membershipRenewals`. This is the admin
time-series endpoint only; the Norm `dashboard.revenue-breakdown` endpoint is a
separate single-period shape and is unaffected.

## UserDetailModal — header status badge, partner-access ring, renewal-entries preview (2026-07-09)

Three at-a-glance additions so an admin understands the account without digging:

- **Membership status badge** (header, next to the name): `renderMembershipStatusBadge(user.subscription)`
  ([AdminBadge.tsx](../../src/components/admin/ui/AdminBadge.tsx)) driven by the shared pure derivation
  [`deriveMembershipDisplayStatus`](../../src/utils/subscription/subscription-helpers.ts) — states (labels):
  **Active** (incl. `trialing`, the anchor-day artifact — never shown as "trial") / **Cancels {endDate}**
  (active + `autoRenew: false`) / **Past Due** (`past_due`/`unpaid`; wins over cancelled-while-past-due) /
  **Paused** (retention `pause_30d` freeze window — `subscription.status === "paused"` + `isActive: false`;
  sky/`PauseCircle` badge) / **Cancelled** / **Guest — no membership** (incomplete/none). The route now
  also projects `subscription.cancelledAt` (was declared on `AdminUserDetail` but never sent). Regression
  test: `npm run test:membership-display-status`.
- **Users-list row badge** (`renderSubscriptionStateBadge`, the coarse per-row status): now also renders a
  **Paused** badge (sky `info` / `PauseCircle`) for `status === "paused"` members — previously they fell
  through to the red **Inactive** fallback. Matches the detail-header badge style above so the list and the
  detail panel agree.
- **No editable Auto-Renew checkbox.** The admin subscription editor (`UserDetailModal`) exposes `status`,
  `isActive`, and the dates, but **not** an `autoRenew` toggle — it was removed (2026-07) because it wrote
  the DB flag with **no Stripe call**, so an admin could flip it and silently desync from Stripe
  `cancel_at_period_end` until a webhook re-synced. The read-only "Auto Renew: Enabled/Disabled" line stays;
  to schedule (or undo) a cancellation an admin uses the Stripe-backed cancel modal
  (`/api/admin/users/[id]/cancel-subscription`), which keeps DB + Stripe in lockstep. `autoRenew` was also
  dropped from the admin user-update payload/schema (`admin-user-update.ts`, `types/admin.ts`) so no admin
  save re-writes it; the list-filter (`autoRenew=true|false`) and export column are reads and remain.
- **Resume pause (admin).** When a member is retention-`paused`, the subscription actions row shows a sky
  **"Resume pause"** button (`users.cancelSubscription` permission) → `POST /api/admin/users/[id]/resume-pause`
  → lifts the Stripe pause immediately (bills the next cycle now if past the period end; a failed charge →
  past_due). For support un-pausing a member who asked to come back early; mirrors the member's own dashboard
  "Resume now".
- **Partner-access ring**: the SAME instrument the member sees on the /my-account hero — percent ring while
  access is live ("{N} left" caption for one-time windows), amber `ShieldAlert` "Paused" ring while past-due
  (membership access pauses; a paid one-time window is kept). **Placement (2026-07-09):** on **desktop** (`sm+`)
  it renders on the right of the header (before the close button) with its label; on **mobile** it **replaces
  the avatar** in the left slot (the mobile header has no room for both) — falling back to the avatar when the
  member has no partner access. Rendered once via a local `renderPartnerRing(size, showLabel)` so both
  placements stay in sync. Server-derived as `partnerAccessRing` on `AdminUserDetail` via
  [`resolvePartnerAccessRing`](../../src/utils/partner-discounts/partner-access-ring.ts) — queue-aware,
  downgrade-preservation aware, same precedence (pastdue > active > onetime > none) and primitives as
  `useDashboardState`; **no access logic in the JSX**. Renders the shared
  [`AccessRing`](../../src/components/ui/AccessRing.tsx).
- **Next-renewal entries preview** (Overview → "Major Draw Entries" card): a green pill **badge** "N on
  renewal · {date}" (active) / "N on recovery" (past-due). **(2026-07-15)** dropped the leading "+" and the
  `TrendingUp` icon, and the active badge now appends the **renewal-landing date** ("15 Jul", day+short-month,
  no year — renewals are monthly so the year is redundant), formatted client-side from `subscription.endDate`
  — the **same** field the draw gate reads (`renewalDateForDrawGate` → `renewalLandsInCurrentDraw`), so the
  shown date always agrees with the "lands in this draw" gate. Past-due "on recovery" carries no date (settling
  grants immediately). The stat cards were also made `flex flex-col` with a `flex-1` body so the coloured accent
  bar sits **flush at the card bottom** on every card — previously a card without the badge (Total Spent /
  Rewards / Engagement) left blank space below its bar when the grid stretched it to the taller badge card's
  height. Server-derived as `subscription.nextRenewalEntries` via
  the shared [`resolveNextRenewalEntries`](../../src/utils/subscription/next-renewal-entries.ts) (carry-forward
  + monthly base, never promo-multiplied) — the same number the member's dashboard note, the renewal-failure
  email, and Klaviyo show. **Draw-cycle gated (2026-07-09):** the active-member badge shows ONLY when
  `subscription.renewalLandsInCurrentDraw` is true — i.e. the renewal falls before the current active draw's
  entry freeze, so the grant actually lands in the draw whose count the card shows. A renewal that falls after
  the current draw closes belongs to a **future** draw (the member's current-draw entries reset to 0 for the
  new cycle), so showing "+N on renewal" against this draw would mislead — the badge is hidden. The gate is
  computed server-side (`renewalEntriesLandInCurrentDraw(renewalDate, activeDraw)`, freeze fetched independently
  of the user-scoped participation query). Past-due keeps its badge (settling adds entries to the current draw
  immediately). Rendering the value as a compact pill (not a truncating text line) also fixes the "+255 on
  renewal · 11 …" overflow. `undefined` (no badge) when no renewal is coming or it's a future-draw grant.

**Server parity + Norm (2026-07-09):** `partnerAccessRing`, `subscription.nextRenewalEntries`, and
`subscription.cancelledAt` are computed once by the shared resolvers and returned by BOTH the admin
`/api/admin/users/[id]` route (inline `buildAdminUserProfile`) and the Norm `users.get` service
[`getAdminUserDetail`](../../src/services/admin/UserAdminQueryService.ts) — so the admin UI and the Norm
projection report identical values by construction. The three fields are mirrored into
`NormUsersGetSchema` + the `/v1/users/:id` route and documented in
[docs/internal-norm/norm-context.md](../internal-norm/norm-context.md); they are non-PII derived signals
(tier %, entry count, ISO date). Verified against the live schema with a per-user `NormUsersGetSchema.parse()`
sweep (the runtime-500 check `norm:smoke` would catch).

## UserDetailModal — Partner Discount Access section (2026-06-16)

The Activity tab of [`UserDetailModal`](../../src/components/admin/UserDetailModal.tsx) now shows a
**Partner Discount Access** card (between Mini Draw Packages and Draw Participation): the currently
active period (source, package, time remaining, end/renew date — recurring for memberships) plus the
**queued/upcoming** periods (duration, queue position, purchase + 12-month use-by dates) and totals.

**Source of truth is server-side and reconciled.** The card renders a new
`partnerDiscountSummary` field on `AdminUserDetail` — there is **no access logic in the JSX**.
[`buildAdminUserProfile`](../../src/app/api/admin/users/[id]/route.ts) computes it via
`getReconciledPartnerDiscountSummary(user)` ([partner-discount-queue.ts](../../src/utils/partner-discounts/partner-discount-queue.ts)),
which sweeps an in-memory **clone** (expire elapsed, activate due, reconcile tiers) so the admin sees
the user's **true current entitlement** — not the possibly-stale stored queue `status`. This is the
read side of the *reconcile-then-read* rule (see [partner/gotchas.md](../partner/gotchas.md)); the GET
stays side-effect-free (the clone is never persisted — the canonical sweep is the cron + the member's
own `/api/partner-discount/queue`). The raw `partnerDiscountQueue` is still in the payload for full
history, but the card uses the reconciled summary.

> **Partially mirrored to Norm.** The 2026-07-09 additions `partnerAccessRing`,
> `subscription.nextRenewalEntries`, and `subscription.cancelledAt` are now on Norm's
> `/v1/users/{id}` — see [docs/internal-norm/norm-context.md](../internal-norm/norm-context.md).
> `partnerDiscountSummary` itself is still **not** mirrored: it's on the admin
> `buildAdminUserProfile` shape, which Norm's `users.get` does not consume (Norm uses a separate
> projection). It could be exposed to Norm (counts + dates are PII-safe) — flagged, not wired.

## A/B VariantConfigEditor — "Static hero image only (disable hero video)" (2026-06-15)

[`VariantConfigEditor`](../../src/components/admin/ab-testing/VariantConfigEditor.tsx)
gained a Hero-section checkbox bound to `config.hero.disableVideo`. This is the
admin control for the **static-image-vs-video** experiment: ON = the variant
suppresses the brand hero video and shows the still only (PromoHero gates on
`!variantConfig.hero.disableVideo`); OFF = video plays. Without this control the
flag was only settable via `seed:static-vs-video-hero`. The brand hero video only
exists for brand prize slugs, so the toggle is a no-op on slugs with no video.
Note admins are excluded from assignment, so to see a variant either browse as a
non-admin or use admin **Preview**.

## A/B VariantConfigEditor — config initializer now spreads stored config; "Promo Landing Default Theme" control (2026-07-28)

[`VariantConfigEditor`](../../src/components/admin/ab-testing/VariantConfigEditor.tsx)'s
`config:` initializer previously built the form's starting state from an explicit
six-key whitelist (`hero` / `banner` / `packages` / `membershipModal` /
`packageColors` / `membershipTheme`). Any key on `VariantConfig` outside that list —
including the promo-theme-split experiment's `promoTheme` (added to the model in the
same change) — was silently dropped the first time an admin opened a variant and hit
Save, even though it correctly round-tripped through the API/service layer. The
initializer now **spreads `variant?.config ?? {}` first**, then re-asserts the six
explicit keys (plus the new `promoTheme` key) on top of the spread — the explicit
keys must come after the spread, not before, since other code in this file reads them
as always-present objects. This pattern (spread stored config, then re-assert
known keys) is now the template for adding any future `VariantConfig` key here:
add the key to the spread-preserving initializer AND surface a control for it,
or it round-trips silently unless an admin never re-saves the variant.

A new **"Promo Landing Default Theme"** `FormSection` (placed directly after
"Membership Section Theme") is the admin control for `config.promoTheme.defaultTheme`
— the theme-split A/B test that picks a bucketed visitor's default light/dark theme on
promo landing pages (see [ab-testing/architecture.md § Promo landing default-theme
experiment](../ab-testing/architecture.md) for the field/resolution rule: applies only
to visitors who have never used the manual theme toggle). It uses the same `Select` primitive
(`@/components/modals/ui`) as the neighbouring "Countdown behaviour" and package-color
controls; `Select` has no `description` prop (only per-option descriptions), so the
explanatory copy is a plain `<p className="text-xs text-gray-500 dark:text-neutral-500">`
underneath, matching the caption style `Checkbox` renders for its own `description`
prop elsewhere in this file. Options are `"light"` (labelled "Light (control)") and
`"dark"`; defaults to `"light"` when unset, mirroring the service-layer default.

## Components

[src/components/admin/](../../src/components/admin/):
- `UserDetailModal.tsx` — user detail / edit (Subscription tab is here, with Cancel button)
- `ChargePastDueModal.tsx` — bulk past-due retry. **Self-drives the chunked job loop:** on confirm (`CHARGE`) it POSTs `{ action: "start" }`, then loops `{ action: "chunk", runId }` until `done`, rendering a **live progress bar** (processed / total) with succeeded / failed / skipped counts and collected revenue. A **Stop** button (and closing the modal mid-run) flips a `stoppedRef` that breaks the loop and fires `{ action: "abort" }` so the lock is released. The completed view is fed by `loadRunResults(runId)` → `GET /api/admin/charge-past-due/runs/[runId]` (run totals + per-invoice rows). Prop is now **`onCompleted?`** (was `onConfirm`) — called once the run finishes or stops so the parent ([`UsersManagement.tsx`](../../src/components/admin/UsersManagement.tsx)) can refresh the user list. See [api.md](./api.md#post-apiadmininvoicescharge-past-due--chunked-charge-job).
- `BlockedTransactionsManagement.tsx` — blocked-card / Stripe allowlist admin UI. Mongo-backed: reads via `useBlockedCards(filter)` (cursor-paginated against the persisted `BlockedTransaction` collection). Hook returns `{ rows, total, hasMore, isLoading, isFetching, isFetchingNextPage, fetchNextPage, refetch, error }`. The table card shows a "Showing X of Y" counter and a "Load more" button at the bottom. Query errors surface in an amber banner above the filters card. Eligibility badges: auto-eligible / already-allowlisted / fraud-signal / permanent-issue / not-member. The "Allowlist with override" button bypasses every filter (records `manual_admin_override`). The dataset uses the narrower `outcome.type === "blocked"` filter (matches Stripe Dashboard's "Blocked" pill). Service contract: [billing-stripe/architecture.md](../billing-stripe/architecture.md#service-inventory--allowlistservice).
  - **Filters (2026-05-07)**: date range matches `/admin/past-due-history` exactly — `DateRangeToggle` chips (Today / Yesterday / Current Draw / Last Draw / All Time / Custom) with `useAdminMobileDateToolbarSlot()` portaling on mobile, draw-aware presets via `useCurrentAndLastDrawDates()`, custom range via `CustomDateRangeModal` with `useMajorDrawsForDateRange()` highlighting. Plus an **email substring search** (debounced 300ms, server-side regex), an **eligibility multi-select** (auto-eligible / already-allowlisted / fraud-signal / permanent-issue / skipped — not member), and a **decline-code multi-select** grouped by Recoverable / Fraud signals / Permanent issues / Other (options from [src/utils/billing/declineCodeLabels.ts](../../src/utils/billing/declineCodeLabels.ts)).
  - **Metric cards**: Total blocked (current filters) · Auto-eligible · Skipped — filter · **Total on allowlist** (all-time, all active fingerprints, driven by `useAllowlistStats()` against `GET /api/admin/allowlist/stats`).
  - **Email column** is clickable via `ClickableUserDisplay` — opens the same `UserDetailModal` the users + past-due-history tabs use. `BlockedRow.userId` is resolved server-side in `listBlocked` (joins `User` by `stripeCustomerId` then `customerEmail`); guests render as plain text.
  - **Eligibility verdict** is computed by the shared mapper [src/utils/admin/blockedTransactionEligibility.ts](../../src/utils/admin/blockedTransactionEligibility.ts) so the post-join filter and the in-row badge can never disagree.
  - **MultiSelectFilter** popover component lives at [src/components/admin/MultiSelectFilter.tsx](../../src/components/admin/MultiSelectFilter.tsx) and powers both the eligibility and decline-code multi-selects.
- `PromoPurchaseEntriesPreview.tsx` — read-only preview table rendered inside `AdminPromoToggle`. Accepts a `PromoMultiplierSnapshot` (`{ membershipPackages, oneTimePackages, miniPackages }`) and renders three collapsible sections (Membership / One-Time + Additional / Mini) showing base → multiplied entry counts per package. The Mini section appends a note that mini upsells are immune to the multiplier. Data is computed purely from static package data via `src/utils/admin/promo-purchase-entries-preview.ts` — no API calls.
- (other admin-specific components)

> _TODO: enumerate full component list._

## Error Reports view (Admin > Error Reports) — 2026-05-11

[src/components/admin/ErrorReportsManagement.tsx](../../src/components/admin/ErrorReportsManagement.tsx) is the unified triage UI. Reports come from `GET /api/admin/error-reports` (see [error-reporting/api.md](../error-reporting/api.md) for query-param contract).

**Header** — page title + subtitle only. Action buttons (Show Analytics / CSV Page / JSON Page / Refresh) were removed 2026-05-11 — analytics view, CSV/JSON export, and manual refresh are intentionally unsupported here. The query refetches automatically on filter change and after bulk mutations.

**Triage cards (top row)** — Needs Attention / Critical Unresolved / New Last 24h / Repeated Errors / Affected Users. The first three are buttons that apply a triage filter (status/severity/dateRange) and show an `aria-pressed` active state with red ring when their linked filter is currently applied. Repeated Errors / Affected Users are non-interactive stat displays (they previously toggled the now-removed analytics view). Grid is `grid-cols-2 lg:grid-cols-3 xl:grid-cols-5` — pairs cleanly on mobile, three-up on tablet, five-up on wide.

**Filter bar (grouped 2026-05-11)** — full-width search input + mobile Filters toggle on top, then three labelled sections inside the collapsible:
- **Categorise** — `Status / Category / Severity / Source` dropdowns.
- **Where & who** — `User email / API endpoint / Page URL` text inputs (all debounced 350ms).
- **When** — `Start date / End date`.

The **API endpoint** input filters on `apiEndpoint` (the route that failed). The **Page URL** input filters on `route` OR `currentUrl` (the page the user was on). These are intentionally separate — see [error-reporting/gotchas.md#page-url-vs-api-endpoint](../error-reporting/gotchas.md#page-url-vs-api-endpoint). The "Clear All Filters" button appears below when any filter is active.

**Desktop table columns** — checkbox / Error (with secondary "Auto-logged · {pageUrl}" line) / Category / Severity / Status / User / API / Date / Actions (right-aligned). The API column shows `{httpMethod}` in a small chip + `apiEndpoint`; an em-dash placeholder renders when no API was involved. Page URL is rendered inline under the error message instead of in its own column to keep the table from growing too wide.

**Status column (list view, 2026-05-25)** — the "Status" column in the list table and mobile card row now shows the **HTTP status code** instead of the workflow-status badge (e.g. `HTTP 409`). The badge is color-coded: 5xx → red, 4xx → amber, none → `—` (desktop) / "No status" (mobile). The column header is plain (non-sortable). The **workflow status** (new / investigating / resolved / dismissed) is preserved in the detail modal and the Status filter — it has not been removed from the codebase.

**Mobile cards (sm:hidden)** — error message + auto-logged/timestamp metadata at top, badges row (severity / category / HTTP status), then a `<dl>` with explicit `User / API / Page` rows. Full-width red "View Investigation" CTA at the bottom with adequate touch target.

**Detail modal (ErrorReportDetailModal)** — slide-up bottom-sheet on mobile (`items-end` + `rounded-t-2xl`), centred dialog on `sm+`. The info section is a 4-up grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`) of User / API / Page / Environment panels — split from the previous combined Route+API panel. Diagnostic "Copy Context" string includes both API and Page on separate lines.

**Long-content panels in the modal (Stack Trace + Console Logs / Notes)** must use `min-w-0` on the grid item, `overflow-x-hidden` (or `overflow: auto`) on the scroll container, and `whitespace-pre-wrap break-all` on the inner text. Without these, long JSON / URL payloads in `consoleErrors[].message` blow out the grid column and burst the modal on small screens.

**Note: `ErrorReportsAnalytics` component was deleted 2026-05-11.** The server still returns `analytics` in the response payload (the API contract is unchanged), but the client no longer consumes or renders it. If you reintroduce an analytics view, the data is already on the response — restore an `analytics` field on the `ErrorReportsResponse` type and render it.

## User Metrics view (Admin > Users) — refactored 2026-05-04

[src/components/admin/metrics/UserMetricsView.tsx](../../src/components/admin/metrics/UserMetricsView.tsx) is now **all-time only**. It calls `useUserMetrics()` with no arguments — there is no date filter, month selector, custom-date modal, comparison-mode toggle, or major-draw selector inside this view. The Chart vs Table view-mode toggle is preserved (persisted in `?metricsViewMode=`).

The view header has been reduced to just the right-aligned `ViewSwitcher`; the previous "User Metrics" / "All-time snapshot" title block has been removed. Stat cards (Total Users / Active Memberships / Total Revenue / Average Order Value) still render below the switcher.

`ViewSwitcher` ([src/components/admin/metrics/shared/ViewSwitcher.tsx](../../src/components/admin/metrics/shared/ViewSwitcher.tsx)) only exposes `"table" | "chart"` — the third `side-by-side` ("Compare") mode was removed; no callers used it.

### Chart mode

Renders four charts stacked vertically:
- [`MembershipPackageBreakdown.tsx`](../../src/components/admin/metrics/users/MembershipPackageBreakdown.tsx) — Recharts stacked bar chart (active / pastDue / cancelled per package), sorted by total descending. Counterpart to `MembershipPackageBreakdownTable` used in table mode.
- [`AgeBreakdown.tsx`](../../src/components/admin/metrics/users/AgeBreakdown.tsx) — Recharts bar chart, chronological order. Single **Users** series (red). The **"Unknown"** age bucket is split out and rendered as a small header note (count + % of all) instead of a bar, so the dominant unknown segment does not flatten the visible age cohorts.
- [`StateBreakdown.tsx`](../../src/components/admin/metrics/users/StateBreakdown.tsx) — Recharts single-series bar chart for AU state/territory codes, sorted descending by user count. The synthetic `"Unknown"` bucket (users with no `state` value) is excluded from the bars and surfaced as a header note. Data comes from `aggregateData.state` (see `UserMetrics["state"]`).
- [`ProfessionBreakdown.tsx`](../../src/components/admin/metrics/users/ProfessionBreakdown.tsx) — bar cap is **20** (the service pre-buckets via `bucketUnmatched`, capping the dataset around 17). The aggregated `"Other"` bucket is excluded from the bars and shown as a header note for the same anti-domination reason as `Unknown` above.

### Table mode

Renders four tables:
- [`MembershipPackageBreakdownTable.tsx`](../../src/components/admin/metrics/users/MembershipPackageBreakdownTable.tsx) — see column meanings below.
- [`AgeBreakdownTable.tsx`](../../src/components/admin/metrics/users/AgeBreakdownTable.tsx) — chronological row order with a totals row. Columns: `Age`, `Users`, `%`. The **`Unknown`** row is omitted from the body and shown as a header note (`Unknown excluded: N (X% of all)`); the totals row reflects only the visible rows so percentages sum to 100%.
- [`StateBreakdownTable.tsx`](../../src/components/admin/metrics/users/StateBreakdownTable.tsx) — sorted descending by user count, with rank column and friendly long-form state names alongside the code. Same `Unknown` exclusion/header-note pattern as the age table.
- [`ProfessionBreakdownTable.tsx`](../../src/components/admin/metrics/users/ProfessionBreakdownTable.tsx) — sorted descending by count, includes a rank column. The aggregated `"Other"` bucket is excluded from the body and surfaced as a header note.

All four breakdown components accept an optional `bare` prop (defaults `false`). When `bare={true}` the outer card wrapper (rounded-xl + shadow + border + padding) is dropped so the table can sit flush inside an already-card-shaped container. `UserMetricsView` leaves it false (each table keeps its own card per the toggle design); `UsersBreakdownSection` (dashboard overview) passes `bare` so the inner cards don't double up inside its `DashboardSection` shell — rows are separated by `divide-y` instead.

### `MembershipPackageBreakdownTable` columns

One row per subscription-type membership package, plus a grand-total row. Columns: `Package`, `Total`, `Active`, `Past Due`, `Cancelled`, `Active %`, `Past Due %`.

| Column | Meaning |
|---|---|
| Active | Currently subscribed (paying / `subscription.status === "active"` and no scheduled cancel). |
| Past Due | Payment failure, no scheduled cancel — Stripe `subscription.status === "past_due"`. |
| Cancelled | Scheduled cancel-at-period-end **OR** legacy cancelled (cancelled-with-`endDate`). |

The classification ladder mirrors the flat `membershipStatus` aggregation in `UserMetricsService` (cancelled-with-`endDate` → `past_due` → `active` → legacy-cancelled), so per-package totals always reconcile with the standing `membershipStatus` rollup.

A synthetic **"Other / Unknown"** row appears only when a classified subscription's `packageId` doesn't match any known subscription package — typically legacy `ObjectId` values stored in the `Mixed`-typed field, deleted packages, or one-time `packageId`s in the subscription slot. The row stays hidden when its total is zero. If it appears with a non-zero count, it's a data-cleanup signal — but the per-package totals still reconcile with the flat `membershipStatus` rollup.

### Removed (this refactor) — components left on disk for potential reuse

The following components are **no longer referenced** by `UserMetricsView` but were not deleted: `SignupSourceChart.tsx`, `MembershipLifecycleChart.tsx`, `DailyUserMetricsTable.tsx`, `ComparisonModeToggle.tsx`, `MajorDrawSelector.tsx`, `MetricsDateFilter.tsx`, `CustomDateRangeModal.tsx`. If you reintroduce date-scoped or comparison views, prefer reviving these over rebuilding.

## Admin > Users — "Top 20%" filter + `users.viewDetail` row gating (2026-08-13)

**a) Top 20% of major-draw entry holders is now a FILTER, not export-only.** A `Top holders`
dropdown sits beside the `Major draw` one in
[UsersManagement.tsx](../../src/components/admin/UsersManagement.tsx), backed by a new
`UserFilters.segment` (`"top20MajorDraw" | ""`). It reuses the **same `segment` param name and the
same segment id** the users export already used — so "filter the list, then export" and "export the
segment" resolve to the identical people, which is the whole point of not coining a second name.

Three things worth knowing:

- **It composes; the export's version replaces.** The filter is pushed onto `$and` inside
  `buildUserFilter` like every other `_id` constraint, so *top 20% in VIC on the Tradie package* is
  a valid query. The **export** route's segment branch still deliberately ignores the other filters
  (documented in its own header) — that asymmetry is pre-existing, not introduced here.
- **Ties at the cut are included**, so the segment can return slightly over 20% of holders. With
  100 holders and 15 people tied on the 20th-highest entry count, it returns 34. Cutting at exactly
  20 would make membership depend on Mongo's document order, which is not stable.
- **No active draw ⇒ empty result, not "all users".** The filter pushes `{ _id: { $in: [] } }`.
  Falling back to unfiltered would read as the filter being ignored.

The logic behind it lives in **one** place now — `resolveTop20MajorDrawSegment()` in
[userFilterBuilder.ts](../../src/utils/admin/userFilterBuilder.ts). It previously existed as two
hand-copies (the export route and `aggregateUserExport` for Norm) which had **already drifted** on
the threshold read (`entryCounts[takeCount - 1]!.count` vs `?.count ?? 0`); adding a third copy for
this filter would have meant three features labelled "top 20%" able to disagree about who that is.

**b) Rows only open when the viewer holds `users.viewDetail`.** `users.view` now grants the roster
only; the detail modal is a separate grant (see
[auth/permissions-catalog.md](../auth/permissions-catalog.md#viewdetail--splitting-pii-depth-out-of-view-2026-08-13)).
Without it the `<tr>` drops its `onClick` and `cursor-pointer` and carries a `title` explaining why,
rather than opening a modal that then 403s on its own fetch.
[`ClickableUserDisplay`](../../src/components/admin/ClickableUserDisplay.tsx) — the modal's *other*
entry point, rendered on overview, promo analytics, affiliates and draw surfaces — falls back to
plain text under the same check. Both are presentation only; the endpoints enforce independently.

## UsersManagement header (Admin > Users) — 2026-05-04

[src/components/admin/UsersManagement.tsx](../../src/components/admin/UsersManagement.tsx) drives the Users / Metrics segmented control via URL param `?viewMode=users|metrics` and `handleViewModeChange()`. Header layout:

- **Desktop (`sm+`)** — keeps the existing `users | metrics` segmented pill toggle on the right.
- **Desktop (`sm+`)** — `KlaviyoSyncButton` is wrapped in `<div className="hidden sm:block">` so it only shows on tablet and up.
- **Mobile (`sm:hidden`)** — a new compact button replaces the Klaviyo sync button. It calls `handleViewModeChange(viewMode === "metrics" ? "users" : "metrics")` (toggle to the inverse) and renders a `Users` icon + "Users" label when currently in metrics, or a `BarChart3` icon + "Metrics" label otherwise.

`Charge Past Due` and `Export` buttons remain visible on both breakpoints.

## KPIMetricsGrid — Renewal Rate card (2026-05-29, redesigned 2026-06-02)

[src/app/admin/component/overview/KPIMetricsGrid.tsx](../../src/app/admin/component/overview/KPIMetricsGrid.tsx) previously rendered a Renewal Rate card only when the active date filter was `current-draw` or `last-draw`. **This card has been superseded by the `KpiGrid` Renewal Rate tile** (see Overview redesign — KpiGrid + DateRangeDropdown below); `KPIMetricsGrid` was deleted in Phase 5b.

## KPIMetricsGrid — Revenue by Platform section (2026-06-01)

[src/app/admin/component/overview/KPIMetricsGrid.tsx](../../src/app/admin/component/overview/KPIMetricsGrid.tsx) renders a **Revenue by Platform** section at the bottom of the "Ads Group", directly after `advertisingBreakdownSection`. The section iterates `dashboardStats.attributedRevenue` entries and renders one row per platform. It is gated: if `attributedRevenue` is `undefined` or empty, nothing is rendered.

Section subtitle: "Acquisition revenue per channel · ROAS = ad revenue ÷ spend · renewals excluded" — makes the ROAS definition explicit inline.

Per-platform row shows:
- Human label (meta → "Meta", tiktok → "TikTok", snapchat → "Snapchat", klaviyo_email → "Klaviyo Email", klaviyo_sms → "Klaviyo SMS", google → "Google", direct → "Direct / Organic", other → "Other")
- **"Ad revenue"** label + acquisition revenue (`data.revenue`) in AUD with optional `revenueTrend` chip (arrow + %). This is the ROAS numerator (initial subs + one-time + upsell + mini-draw; `isRenewal=false` only).
- Renewal revenue muted sub-line — rendered only when `data.renewalRevenue > 0`: `+ $X recurring renewals · not in ROAS`. Uses the same currency formatter and the same `text-2xs text-gray-500 dark:text-neutral-400` muted class as the confidence line. Renewals are deliberately excluded from ROAS; this line makes that transparent.
- Confidence split: `$X click · $Y estimated` where estimated = `utm_only + inferred_backfill`
- Conversion count
- True ROAS (e.g. `2.14x`) with optional `trueRoasTrend` chip — only rendered when `trueRoas` is present (i.e. the platform has ad spend data). ROAS is computed as `revenue / adSpend` (acquisition revenue only).

- **Metric displayed:** `renewalRate` as a percentage (e.g. "74%"), with a sub-line showing `renewed / base` counts.
- **Remaining members** are labeled "Expected to renew" (`current-draw`) or "Did not renew" (`last-draw`).
- When `snapshotMissing: true` the card renders an amber note that the base was estimated from the nearest available snapshot.
- For other date filters the card is hidden entirely — renewal rate is only meaningful for a full draw period.

Data flows from `AdminDashboardStats.users.renewalProgress` (`RenewalProgress | undefined`). See [backend.md](./backend.md#renewal-rate-kpi-2026-05-29) for service-layer and API details.

## Overview redesign — KpiGrid + DateRangeDropdown (Phase 2, 2026-06-01)

Part of the admin Overview reskin (plan `docs/superpowers/plans/2026-06-01-admin-overview-redesign.md`). Presentation now uses the kit primitives in [src/components/admin/ui/](../../src/components/admin/ui/) (`MetricCard`, `TrendPill`, `Popover`, etc. — documented in [shared-ui](../shared-ui/)).

- **[src/app/admin/component/overview/sections/KpiGrid.tsx](../../src/app/admin/component/overview/sections/KpiGrid.tsx)** — replaces the old `KPIMetricsGrid` at the top of `DashboardOverview`. Pure presentation: receives `stats` (`AdminDashboardStats`), `membership` (`MembershipByPackageData`) and `dateRange` as props (fetched in `DashboardOverview`, not here). Renders two labelled groups:
  - **Revenue** (`grid grid-cols-2 lg:grid-cols-4`): Revenue (emerald, clickable), Ad Spend (blue), ROAS (green), **MRR** (red, clickable — formerly "Membership Revenue"). _(Order updated 2026-06-03 — MRR moved last so the ad-performance trio sits next to Revenue.)_
  - **Users & Performance** (`grid grid-cols-2 lg:grid-cols-5`): Total Users (indigo) _or_ New Signups (blue) [date-range conditional], Conversion (violet), **New-Member ROAS** (indigo, `TrendingUp`, 2026-06-04 — placed right after Conversion), **Renewals** (emerald, always rendered), Cancellations (red, `invert`). _(Renewals/Cancellations order swapped 2026-06-03 — Renewals 3rd, Cancellations 4th.)_ **New-Member ROAS** shows new-membership revenue ÷ ad spend as a ROAS multiplier (`breakdownRevenue(revenue.breakdown.membershipPurchase)` ÷ `facebookAds.spend`, `toFixed(2)+"x"`; "—" when spend is 0). It reuses values already on `stats` — a NEW card only; it does **not** modify the Revenue-group Ad Spend / ROAS cards.
  - Data/formatting/trend logic is ported verbatim from the old `KPIMetricsGrid`: money tiles use whole-dollar `$n.toLocaleString("en-AU")`, ROAS `toFixed(2)+"x"`, Conversion `toFixed(1)+"%"`. Trend is converted from the `{ value, direction }` `TrendData` into a **signed numeric %** by `trendPct` and handed to the kit's `TrendPill`, which applies the good/bad colouring itself. Cancellations passes `invert` (not a pre-inverted value) so a drop reads green. **`trendPct` bug fixed 2026-06-03:** `TrendData.value` from `TrendCalculationService` is ALREADY signed (negative = decrease), so `trendPct` now returns it **verbatim**. The old `direction === "down" ? -value : value` double-negated every decrease into a positive — that's why a day with *lower* revenue than yesterday rendered a green ↑ (the magnitude was right, the sign was inverted on all metrics). `trendPct` also returns `null` when `previousValue === 0` (no prior-period baseline) so a forced `+100%` no longer masquerades as growth, and `TrendPill` now renders a value within ±0.05% as neutral grey with a dash (so a true 0.0% isn't painted green up).
  - Only Revenue + MRR tiles are clickable _(superseded 2026-07-17: Ad Spend + ROAS are now also clickable — they open `AdSpendFocusModal` instead of a popover; see "Packages-focus drill-downs" below)_. Each clickable tile (`KpiCard`) owns a `useRef` anchor + `open` state and passes `active={open}` to `MetricCard`; the `Popover` anchors to that ref. The popover shows a header (title + value + `TrendPill`) and a breakdown list (colour dot + label + **exact money** via the local `moneyExact` helper — `$${n.toLocaleString("en-AU", { maximumFractionDigits: 2 })}`, not `fmtCompact`, as of 2026-06-03 so the popover shows the real figure not `$50.2k`): Revenue → top-4 of `revenue.breakdown` (normalised number|object); MRR → tiers from `membership.packages` (`packageName`, `activeRevenue`, dot colour from `brand-tier` hex by package-id substring). **No per-KPI sparkline** — the dashboard-stats hook returns no spark series, so the sparkline panel is omitted (not fabricated).
  - **Renewals tile (zones swapped 2026-06-02):** the headline and sub-line were **inverted** from the earlier 2026-06-02 iteration so the filter-driven activity is prominent. **Headline** = renewals in the SELECTED date range: only the renewed **count** is the big value (`value="{renewed}"`); the words ride along as small muted `valueAside="renewed · {pastDue} past due"` so "renewed" doesn't dominate the tile. Both drawn from `stats.users.membershipRenewals.succeededDistinctMembers` / `.becamePastDueInRange`. **Sub-line** = the **current billing-cycle** progress (filter-independent): `Cycle: {rate}% · {renewed}/{base}` from `stats.users.renewalProgress` (always populated — see backend.md; cycle anchored to the last completed `MajorDraw.drawDate` + 1 day AEST → now). Falls back to `Cycle: {rate}%` when no base, or `No active cycle` when `renewalProgress` is absent. Title is `Renewals` (no longer "Renewal Rate", since the headline is now a count, not a rate) plus the date tag (below). **Note:** headline (range) and sub (cycle) are intentionally different lenses and don't sum.
  - **Date tag — moved to section headers (2026-06-03):** the `rangeLabel` parenthetical was **lifted off the individual cards onto the two group headers** so the cards stay clean — the section labels now read `Revenue (Today)` and `Users & Performance (Today)` (the `rangeTag` is appended to the two `<p>` header strings; every card title is now a plain literal like `Revenue` / `Ad Spend` / `Renewals`). `KpiGrid` still receives the resolved string via the `rangeLabel?: string` prop; `DashboardOverview` computes it (today/yesterday literals, draw `name` from `useCurrentAndLastDrawDates`, all-time `${format(stats.dateRange.start,"MMM yyyy")} – present`, custom `MMM d – MMM d`). _(Previously, 2026-06-02, the tag was appended per-card; that's superseded.)_
  - **MRR trend (2026-06-03):** the MRR tile now shows a `TrendPill` driven by `membership.summary.totalActiveRevenueTrend` (`trendPct(...)`). Baseline = MRR at the **previous comparable period** (same `getComparisonPeriod` window the other tiles use — for "Today" that's all of yesterday), computed server-side in the membership-by-package route from the daily membership snapshot; see [api.md](./api.md#membership-by-package-mrr-trend-2026-06-03). Omitted for all-time and when the baseline day has no snapshot.
  - **`MetricCard` changes (2026-06-02):** gained an optional `valueAside?: string` prop rendered as small muted text inline next to the headline value. Mobile sizing reduced (value text, icon, and padding shrink on mobile; desktop layout unchanged).

## Packages-focus drill-downs (2026-07-17)

Membership vs one-time landing-URL split surfaced across the Overview (data contract: [api.md — packages-focus](./api.md); domain background: `docs/metrics-analytics/`).

- **Ad Spend + ROAS KPI tiles are now clickable** (`KpiGrid.tsx`): both share one `adSpendFocusOpen` state (both show the `active` ring while open) and open **[src/components/modals/AdSpendFocusModal.tsx](../../src/components/modals/AdSpendFocusModal.tsx)** — platform chips (Meta live / TikTok renders a dashed "awaiting URL mapping" box), Membership / One-time summary tiles (spend headline; revenue · ROAS · conversions subline; Unclassified tile only when its spend > 0) doubling as the focus-tab selector (default **One-time**), then a campaign → ad-set → ad tree for the selected bucket. An amber notice renders when `detail.complete === false` ("per-campaign detail covers {availableSince} onwards" — the per-ad insights TTL floor); the summary tiles always cover the full range. Revenue is Meta-reported, same basis as the ROAS KPI headline. `KpiGrid` gained `startDate?/endDate?` props (passed by `DashboardOverview` as `customStartDate || undefined` etc.) and resolves the concrete AEST window via [src/utils/admin/resolveAestDateWindow.ts](../../src/utils/admin/resolveAestDateWindow.ts) — the same helper `PrizePerformanceCard` now uses (its two inline date memos were extracted into it, behavior-identical).
- **[src/components/admin/spend-by-url/CampaignTreeTable.tsx](../../src/components/admin/spend-by-url/CampaignTreeTable.tsx)** — shared expandable campaign → ad-set → ad tree (columns Name | Spend | Revenue | ROAS | Conv.; ROAS emerald ≥ 3 else amber; ad rows show adId mono over adName, an adFormat chip, and a focus `Badge` when the node carries `packagesFocus` — info "One-time" / neutral "Membership" / warning "Unclassified"). Node types come from `usePackagesFocusBreakdown`; consumed by `AdSpendFocusModal` (server-built tree) and `PrizePerformanceAdsModal` (client-grouped tree). ~~Known kit limitation: `DataTable`/tree row clicks are mouse-only (no keyboard handler).~~ **Fixed 2026-07-24 (panel F-017)** in `DataTable` itself: when (and only when) an `onRowClick` is supplied, rows get `tabIndex=0`, `role="button"`, an Enter/Space `onKeyDown` (Space `preventDefault`s so it activates instead of scrolling), and a `focus-visible` ring. Non-interactive tables stay out of the tab order. Every `DataTable` consumer — including `AdvertisingPlatformCard` — inherits this; `CampaignTreeTable`'s own custom tree rows are separate and still need the same treatment if they gain click handlers. **Ad-URL mismatch check + Ads Manager link added 2026-09-01** — see "Ad-URL mismatch check + Ads Manager deep link" below.
- **Prize Performance row click → upgraded [`PrizePerformanceAdsModal`](../../src/components/modals/PrizePerformanceAdsModal.tsx)** — `PrizePerformanceCard` attaches each brand's `canonicalUrls` to its row (captured before the zero-row filter, so every rendered row carries them) and opens the modal via the kit `DataTable`'s `onRowClick`. The modal keeps its original props + `useSpendByUrlDetailMany` source and adds: brand-level Membership / One-time summary tiles (Unclassified only when present), focus chips (All / Membership / One-time / Unclassified) filtering ONE mixed tree (each ad badges with its own focus — unlike the KPI modal's pre-split buckets), platform chips (TikTok = awaiting box, no fetch), and the client-side grouper `groupSpendByUrlDetailRowsByCampaign` ([spendByUrlAdBreakdown.ts](../../src/utils/admin/spendByUrlAdBreakdown.ts)) producing the same node shape `CampaignTreeTable` renders.
- **Facebook Ads → Spend by URL surfaces** (`SpendByUrlSection.tsx`, `SpendByUrlAdBreakdownTable.tsx`): a non-interactive focus summary strip above the toolbar (Membership / One-time / + Unclassified tiles from `usePackagesFocusBreakdown`; hidden when the range isn't ready, on query error, or when total focus spend is 0), per-URL-row `M $x` / `OT $y` split chips under the URL (only when the row carries the `packagesFocus` split), and a focus `Badge` under the ad name in the per-ad drill-down table (membership/one-time only — no new column, COL_SPANs unchanged).

- **[src/components/admin/overview/DateRangeDropdown.tsx](../../src/components/admin/overview/DateRangeDropdown.tsx)** — clean dropdown replacing the old chip-bar `DateRangeToggle` inside `OverviewToolbar` _(that wrapper was deleted 2026-08-19; the dropdown is now rendered by `AdminDateRangeToolbar`)_. Reuses the existing `DateRange` type and the toolbar prop contract (`selectedRange`, `onRangeChange`, `onCustomClick`, `displayDate`). Ranges: Today / Yesterday / Current Draw / Last Draw / All Time, plus a "Custom range…" row that calls `onCustomClick` (opens the existing `CustomDateRangeModal`). Anchored via the kit `Popover`. The shared `src/components/admin/DateRangeToggle.tsx` is unchanged but, as of the 2026-06-02 unification (below), is **no longer rendered anywhere** — it survives only as the canonical home of the exported `DateRange` type.

- **OverviewToolbar.tsx** _(deleted 2026-08-19 — the Overview now renders the shared `AdminDateRangeToolbar`; see the last section of this doc)_ rendered `DateRangeDropdown` in its shared `inner` block, so both `placement="page"` (desktop sticky) and `placement="layout"` (mobile portal) pick it up.

- **[DashboardOverview.tsx](../../src/app/admin/component/overview/DashboardOverview.tsx)** wrapper is now `space-y-5 md:space-y-6`; `KpiGrid` renders at the top. The remaining legacy breakdown sections (`RevenueBreakdownSection`, `RenewalsDashboardSection`, `AdvertisingBreakdownSection`) are temporarily rendered directly below it (extracted from being `KPIMetricsGrid` children) so the page keeps working until later phases replace them. The dead `handleRevenue*` toggles, `statsError`, and the unused users-performance toggle state were removed. **Section order (as of 2026-06-02):** KPI grid → Revenue Breakdown + Advertising (one row, `grid grid-cols-1 md:grid-cols-2`) → charts row (Revenue overview + Active memberships) → Prize performance → rows 4/5. The Breakdown+Advertising row sits **above** the charts per user request (it was briefly full-width-separated in the cycle-anchored-renewal polish).

## Date filter unification — DateRangeDropdown everywhere (2026-06-02)

Every admin page that previously rendered the chip-bar `DateRangeToggle` now renders the same [DateRangeDropdown](../../src/components/admin/overview/DateRangeDropdown.tsx) the Overview uses, so the date control looks identical across the dashboard. Swapped (toggle → dropdown):

- [CancellationFlowAnalytics.tsx](../../src/components/admin/CancellationFlowAnalytics.tsx)
- [PromoAnalyticsManagement.tsx](../../src/components/admin/PromoAnalyticsManagement.tsx)
- [BlockedTransactionsManagement.tsx](../../src/components/admin/BlockedTransactionsManagement.tsx)
- [PastDueChargeHistory.tsx](../../src/app/admin/component/PastDueChargeHistory.tsx)
- [FacebookAdsManagement.tsx](../../src/components/admin/FacebookAdsManagement.tsx) (all three render spots — mobile portal, mobile inline, desktop)

Mechanics of the swap, identical at every call site:
- The toggle-only props (`collapsed`, `onExpand`, `className`) are dropped — `DateRangeDropdown` owns its own open state and is content-sized. The mobile full-width treatment came from `className="w-full"`; it's gone, matching how the Overview already renders the dropdown content-sized inside `AdminMobileLayoutDateRangeShell`.
- `onRangeChange` simplifies to `(range) => updateDateFilter(range)` — the dropdown never emits `"custom"` through `onRangeChange` (the "Custom range…" row fires `onCustomClick`), so the old `if (range === "custom") …` branch is removed as dead.
- `displayDate`, `selectedRange`, `onCustomClick` (→ `CustomDateRangeModal`) are unchanged. Accent stays the dropdown default red, matching the Overview.

`MetricsDateFilter.tsx` was **not** touched — it's already unreferenced dead code (see "components left on disk for potential reuse" above), not a live filter. `DateRangeToggle.tsx` is now rendered nowhere; it's retained only as the export site of the `DateRange` type (imported by the dropdown and the Overview section cards).

## Overview redesign — charts row: revenue area chart + membership donut (Phase 3, 2026-06-01)

The charts row renders immediately after `KpiGrid` inside `DashboardOverview` as a `grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6` (revenue card `lg:col-span-2 min-w-0`, membership card `lg:col-span-1 min-w-0`). Both cards are pure presentation over existing hooks and use the kit primitives in [src/components/admin/ui/](../../src/components/admin/ui/).

- **[src/app/admin/component/overview/sections/tierColors.ts](../../src/app/admin/component/overview/sections/tierColors.ts)** — shared `tierColorByPackageId(packageId)` helper returning the `brand-tier` hex (tradie `#00c2ed` / foreman `#ffd200` / boss `#ee0000`, neutral-slate fallback) by package-id substring (spec D4). Extracted from `KpiGrid`'s former local `tierColor`; now consumed by both `KpiGrid` (membership-breakdown popover dots) and `MembershipCard` (donut segments + legend dots).

- **[src/app/admin/component/overview/sections/RevenueChartCard.tsx](../../src/app/admin/component/overview/sections/RevenueChartCard.tsx)** — wraps the kit `RevenueAreaChart` in a `Card p-5` with a `SectionTitle` ("Revenue overview" / "Hover the line for exact daily figures" / `LineChart` icon) and a "Tracking up/down" `Badge` (`success`/`danger` by `last >= first`). Calls `useRevenueBreakdown(period, …)` with `period = dateRange === "all-time" ? "months" : "days"`. **The series is intentionally decoupled from the single-day KPI range** so it never renders a degenerate 1-point chart: the `days` window mirrors the legacy `RevenueOverview` days-view windowing — the current AEST month capped at `getWebsiteLaunchDateUTC()` (start) and now (end) — and `months` filters `chartData` to the current AEST year. `data = points.map(p => p.total)`, `ticks` = up to ~7 evenly-sampled `p.date` labels, `axisLabel = period === "months" ? "Month" : "Day"`, `accent="#ee0000"`, `valueFmt={fmtCompact}`. Renders an empty-state row when fewer than 2 points are available. **Replaces** the deleted `src/components/admin/RevenueOverview.tsx`.

- **[src/app/admin/component/overview/sections/MembershipCard.tsx](../../src/app/admin/component/overview/sections/MembershipCard.tsx)** — `Card p-5 h-full` with a `SectionTitle` ("Active memberships" / "Live distribution by tier" / `Crown` icon). Props: `{ data: MembershipByPackageData | undefined }` (the `useMembershipByPackage` result, passed down from `DashboardOverview` — also reused by `KpiGrid`). Builds donut `segments` from `data.packages[]` (`value`/`count` = `activeCount`, colour from `tierColorByPackageId`); donut centre = total active count / "active", swapping to the hovered tier on hover. Legend rows (`space-y-2.5 mt-4`): colour dot, `packageName` + `$price/mo` (price from `getPackageById(packageId)?.price` in static [src/data/membershipPackages.ts](../../src/data/membershipPackages.ts) — omitted if not found), `activeCount`, then `moneyExact(activeRevenue)` right-aligned (exact money as of 2026-06-03 — local `moneyExact` helper, `w-20` column, no `fmtCompact` `$50.2k` rounding). Past-due / Paused tiles (`grid grid-cols-2 gap-2 mt-4 pt-4 border-t`): **Past due** = `data.summary.totalPastDueCount` (live, red); **Paused** = static "Coming soon" (amber, muted — no `paused` field exists anywhere). **Replaces** the legacy `MembershipBreakdownSection` (its import/render were removed from `DashboardOverview`; the file remains on disk for Phase 5 cleanup).

## Overview redesign — revenue breakdown + advertising + prize performance (Phase 4, 2026-06-01)

Rows 3 + 3b of the admin Overview reskin. Row 3 is a `grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6` pairing `RevenueBreakdownCard` + `AdvertisingPlatformCard` (paired at `md` so a narrow split dev/browser pane still gets one row; full-width stack below `md`); row 3b is the full-width `PrizePerformanceCard`. Row 3 now renders **before** the Phase 3 charts row (directly under the KPI grid) per user request; row 3b stays after the charts. All use the kit primitives in [src/components/admin/ui/](../../src/components/admin/ui/).

- **[src/app/admin/component/overview/sections/RevenueBreakdownCard.tsx](../../src/app/admin/component/overview/sections/RevenueBreakdownCard.tsx)** — `Card p-5 h-full` with `SectionTitle` ("Revenue breakdown" / `${fmtCompact(total)} across 6 sources` / `BarChart3` icon) over the kit `BarList`. Props: `{ stats: AdminDashboardStats | undefined }` (the `useAdminDashboardStats` result, passed down from `DashboardOverview`). Builds 6 `BarItem`s from `stats.revenue.breakdown`, normalising each entry the same way the legacy `RevenueBreakdownSection.getRevenueData` did (`number | { revenue, purchaseCount, userCount, trend? }`). Labels / colours / units: Membership New (`#f97316`, subscriptions), Membership Renewal (`#eab308`, renewals), One-Time First (`#3b82f6`, purchases), One-Time Add'l (`#6366f1`, purchases), Mini Draws (`#a855f7`, entries), Upsells (`#ec4899`, purchases). `value` = revenue, `count` = `purchaseCount`. **Money is shown exact** (2026-06-03): both the bar rows (`BarList` `fmt`) and the header total use a local `moneyExact` = `$${n.toLocaleString("en-AU", { maximumFractionDigits: 2 })}` — full figure with thousands separators, no `fmtCompact` `$2.1k`/`$1.0k` rounding and no forced `.00`. `fmtCount={formatNumber}` still formats the count column. **Bar fill is proportional to value** (each bar's coloured width = `value / max`, so the top-earning source fills the track and `$0` sources read as an empty track) — the `equalLength` flag was removed 2026-06-03 because uniformly-full bars misrepresented the data (e.g. a single $80 renewal next to five $0 sources all showed full). **Replaces** the legacy `RevenueBreakdownSection` (6-up `MetricCard` grid + `RevenueDetailModal`); the redesign drops the per-source detail modal. The legacy file stays on disk for Phase 5 cleanup.

- **[src/app/admin/component/overview/sections/AdvertisingPlatformCard.tsx](../../src/app/admin/component/overview/sections/AdvertisingPlatformCard.tsx)** — `Card p-5 h-full` with `SectionTitle` ("Advertising" / "Spend & return by platform" / `TrendingUp` icon). Props: `{ stats: AdminDashboardStats | undefined }`. Header `right` shows the blended ROAS (= Facebook ROAS, the only live platform) as `{fbRoas.toFixed(2)}x`. Renders a kit `DataTable` with cols Platform (left) / Spend (right) / ROAS (right). Rows: Facebook Ads = LIVE (`stats.facebookAds?.spend` / `.roas`, falling back to 0 when the optional `facebookAds` block is absent); TikTok Ads + Snapchat Ads = `comingSoon: true`. Rows carry a `comingSoon` flag and numeric `spend`/`roas` placeholders (0) so the table row type is uniform — `renderCell` decides display: coming-soon rows show a muted "Coming soon" in Spend and `—` in ROAS; the FB row shows `fmtCompact(spend)` (semibold) and `roas.toFixed(2)x` (emerald if ≥3 else amber). Platform cell = `w-2.5 h-2.5 rounded-sm` swatch (FB `#1877f2`, TikTok `#000000`, Snapchat `#eab308`) + name. **Replaces** the legacy platform-level slice of the advertising section.

- **Advertising card — platform drill-down (2026-06-04):** `AdvertisingPlatformCard` gained row-level click and hover interactions after the initial Phase 4 release:
  - **`platformKey: AttributedPlatformKey`** was added to every `AdvertisingRowVM` (including the Direct footnote row built by `buildDirectRow`) so all rows — Meta, TikTok, Snapchat, Klaviyo Email/SMS, Google, Direct, Other — carry the correct `convertingPlatform` key for the drill-down query.
  - **Hover popover (pointer-fine devices only):** hovering any row fires a `usePlatformRevenueBreakdown(..., summaryOnly: true)` fetch and renders a fixed-position portal overlay (`createPortal(document.body)`) showing a `BarList` of the 5 acquisition source bars (`ACQUISITION_CATEGORY_META` labels/colours from `advertisingCardModel.ts`). The popover is pointer-events-none (no click-trap).
  - **Click → `PlatformRevenueModal`:** clicking a row opens `PlatformRevenueModal` ([src/components/modals/PlatformRevenueModal/index.tsx](../../src/components/modals/PlatformRevenueModal/index.tsx)) for that platform. `DashboardOverview` threads `dateRange`/`startDate`/`endDate`/`onUserClick` down via new props so the modal scope matches the card scope.
  - **[src/components/modals/PlatformRevenueModal/index.tsx](../../src/components/modals/PlatformRevenueModal/index.tsx)** — `ModalContainer` (`size="4xl"`, `height="fixed"`) with: (1) a `BarList` of the 5 category bars (click a bar to filter the list); (2) category filter chips (All + 5 individual); (3) a name/email/mobile search input (debounced 300ms); (4) a `UserList` + `Pagination` composing the existing `RevenueDetailModal` primitives; (5) column-sort via `TableHeader` (`SortKey`: name/count/date/amount, default amount desc). State resets on modal close. The `usePlatformRevenueBreakdown` hook (`summaryOnly: false`) drives server-side pagination (page size 50; server page resets on category/search change). `ACQUISITION_CATEGORY_META` and `moneyExact` are imported from `advertisingCardModel.ts` to keep the bar colours/labels consistent between the popover and the modal.

- **[src/app/admin/component/overview/sections/PrizePerformanceCard.tsx](../../src/app/admin/component/overview/sections/PrizePerformanceCard.tsx)** — `Card p-5` (full width) with `SectionTitle` ("Prize performance" / "Spend & return by prize" / `Trophy` icon). Props: `{ dateRange: DateRange; startDate?: string; endDate?: string }`. **Data logic ported verbatim from the legacy `AdvertisingBreakdownSection`**: derives the AEST (`Australia/Sydney`) calendar-day `startDate`/`endDate` window the same way (today/yesterday → that AEST day; all-time → launch→today; custom → passed dates), calls `useSpendByUrlAnalytics(startDate, endDate)`, then groups/sums the returned `rows` per promotion brand (Ryobi / Milwaukee / Dewalt / Makita) by canonical-URL `/promotions/<slug>` match, with `roas = revenue / spend`, filtering to brands with any spend/revenue/conversions. Renders a kit `DataTable` (Prize left / ROAS / Spend / Revenue / Conversions right): ROAS emerald if ≥3 else amber (`toFixed(2)x`); Spend/Revenue via `fmtCompact`; Conversions via `formatNumber`; Prize cell shows the brand `.webp` logo (`next/image`, `object-contain`, optional `logoScale`) + name. **The redesign drops the "Sync from Meta" button** (sync buttons removed site-wide in the reskin; later restored — see the 2026-06-04 note below). **The row-click `PrizePerformanceAdsModal` detail drill-down was omitted at the time — re-added 2026-07-17** (see "Packages-focus drill-downs"): row click now opens the upgraded modal with a campaign → ad-set → ad tree + membership/one-time focus split. Loading / error / empty states render inline. **Replaces** the prize-level slice of the legacy `AdvertisingBreakdownSection`; the legacy file stays on disk for Phase 5 cleanup.

- **[DashboardOverview.tsx](../../src/app/admin/component/overview/DashboardOverview.tsx)** now renders rows 3 + 3b after the charts row and **no longer imports or renders** `RevenueBreakdownSection` or `AdvertisingBreakdownSection`. The now-unused `isRevenueBreakdownExpanded` / `setIsRevenueBreakdownExpanded` state, the `isAdvertisingBreakdownExpanded` state, the `revenueBreakdownShown` derived flag, the `collapseRevenueGroup` helper, and the `useAdminUserModal()` / `openUserModal` dependency (only consumed by the old breakdown section's `onUserClick`) were all pruned. `RenewalsDashboardSection`, `UsersBreakdownSection`, `QuickActionsPanel`, `RecentActivityFeed` still render (Phase 5 replaces them).

## Overview redesign — rows 4 + 5: top draws / renewals / activity / quick actions (Phase 5a, 2026-06-01)

Final content rows of the admin Overview reskin. Row 4 is a `grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6` pairing `TopDrawsCard` (`lg:col-span-2`) + `UpcomingRenewalsCard` (`lg:col-span-1`); row 5 pairs `ActivityCard` (`lg:col-span-2`) + `QuickActionsCard` (`lg:col-span-1`). `UsersBreakdownSection` is moved to be the **last** content row (after row 5, before `CustomDateRangeModal`). All four cards use the kit primitives in [src/components/admin/ui/](../../src/components/admin/ui/).

- **[src/app/admin/component/overview/sections/TopDrawsCard.tsx](../../src/app/admin/component/overview/sections/TopDrawsCard.tsx)** — `Card p-5 h-full` + `SectionTitle` ("Top mini draws" / "Active draws · closest to drawing" / `Trophy` icon, "View all" → `/admin/mini-draws` in `right`). No props. Fetches the active pool via `useTopMiniDraws(50, canViewMiniDraws)` ([useAdminMiniDrawsList.ts](../../src/hooks/queries/admin/useAdminMiniDrawsList.ts)), ranks client-side by fill ratio (entries ÷ capacity), shows top 5 with a fill bar; rows deep-link to `/admin/mini-draws?search=<name>`. **Permission-gated (2026-07-09):** the list route requires `miniDraws.view`, so the card checks `usePermissions().has("miniDraws.view")` — when missing it disables the query (`enabled: false`), hides "View all", and renders a quiet "Requires the mini-draws permission" state. Before this gate, staff roles without `miniDraws.view` (e.g. Ads Manager) fired a guaranteed 403 through `apiGet` on every Overview mount — which, combined with the old 403-force-logout in `lib/queries.ts`, auto-signed them out seconds after login (see [client-state/gotchas.md](../client-state/gotchas.md)).

- **[src/app/admin/component/overview/sections/UpcomingRenewalsCard.tsx](../../src/app/admin/component/overview/sections/UpcomingRenewalsCard.tsx)** — `Card p-5 h-full` + `SectionTitle` ("Upcoming renewals" / `${data.total} members · ${formatCurrency(totalRevenue)} expected · next 3 days` / `RefreshCw` icon; `formatCurrency` from `useMetricsFormatting`). The subtitle now shows the member count (`data.total`) next to the expected revenue. No props. Calls `useUpcomingRenewals(3, 1, 5)` (range = next 3 days, page 1, limit 5) → `{ renewals[], total, totalRevenue }`. List rows (`space-y-2`): a `w-9 h-9` neutral-slate (`#64748b`) avatar with initials from `customerName`/`customerEmail` (the `UpcomingRenewalItem` type exposes no tier/package field, so no `tierColorByPackageId` tint applies), middle column = name + `renewalDateFormatted`, right = `amountFormatted`. **The name preserves the legacy click-to-open-user-modal UX by reusing [`ClickableUserDisplay`](../../src/components/admin/ClickableUserDisplay.tsx)** (`displayText` + `userId={r.userId ?? null}`), which wraps `useAdminUserModal().openUserModal(userId)` and falls back to plain text for guests — the same component the legacy `UpcomingRenewalsSection` used. Empty state renders when no renewals. **Replaces** the legacy `RenewalsDashboardSection` "Upcoming schedule" tab (the period-performance tab is dropped).

- **[src/app/admin/component/overview/sections/ActivityCard.tsx](../../src/app/admin/component/overview/sections/ActivityCard.tsx)** — `Card p-5 h-full` + `SectionTitle` ("Recent activity" / "Live event stream" / `Activity` icon, with a "View all" → `/admin/activity-log` button + `ArrowRight` icon in `right`). No props. **Ports the legacy `RecentActivityFeed` data + behavior verbatim**: `useActivityLogInfinite(15)` (90-day window source, not the capped preview API), `IntersectionObserver` infinite scroll on a `ref` sentinel, mini-draw link-ification of the `action` (splits on `"` and links the quoted name to `/mini-draws/<miniDrawId>` when `miniDrawId` is present), and the clickable user via `ClickableUserDisplay` (same `useAdminUserModal` modal). Restyled to the timeline: scroll region `max-h-[360px] overflow-y-auto admin-scrollbar pr-1` → `space-y-0`; each item = marker column (`StatusDot` colored by the **emitted `status` field** — `success`/`info`/`warning`/`error`, never branching on `type` — plus a `w-px` connector line for non-last items) + body (`action` + `user · time` meta). **Replaces** `RecentActivityFeed`.

- **[src/app/admin/component/overview/sections/QuickActionsCard.tsx](../../src/app/admin/component/overview/sections/QuickActionsCard.tsx)** — `Card p-5 h-full` + `SectionTitle` ("Quick actions" / "Common admin tasks" / `Zap` icon) over a `grid grid-cols-2 sm:grid-cols-3 gap-2.5` of tone-chipped buttons. Props: `{ onRefreshStats: () => void }`. **Ports the two wired actions from the legacy `QuickActionsPanel`**: **Create Major Draw** opens [`AdminMajorDrawModal`](../../src/components/modals/AdminMajorDrawModal/index.tsx) (`onSuccess → onRefreshStats`); **Export Participants** opens an inline export modal that fetches `/api/admin/major-draw/export?format=csv|excel` and triggers a blob download. **Add Product** and **Send Broadcast** are rendered as `disabled` buttons with a muted "Coming soon" line (they are stubs today — Add Product only console.logged, Send Broadcast had no handler — and are intentionally not wired). Tone chips: Create Major Draw red, Export Participants emerald, Add Product blue, Send Broadcast violet. **Replaces** `QuickActionsPanel` (the legacy `AdminProductModal` wiring is dropped along with the dead `handleCreateProduct`).

- **[DashboardOverview.tsx](../../src/app/admin/component/overview/DashboardOverview.tsx)** now renders rows 4 + 5 and **no longer imports or renders** `RenewalsDashboardSection`, `QuickActionsPanel`, or `RecentActivityFeed`. `UsersBreakdownSection` is moved to be the last content row. The now-unused `isUpcomingRenewalsExpanded` / `setIsUpcomingRenewalsExpanded` state and the `statsLoading` destructure (only consumed by the removed `RenewalsDashboardSection`) were pruned.

## Overview redesign — dead-code cleanup (Phase 5b, 2026-06-02)

After the reskin, the legacy Overview sections and their now-orphaned siblings were **deleted** (each verified to have no remaining live importer). The "remains on disk for cleanup" notes in the Phase 3/4/5a sections above are superseded by this step. Removed files:

- Replaced Overview sections: `KPIMetricsGrid.tsx`, `RevenueBreakdownSection.tsx`, `MembershipBreakdownSection.tsx`, `AdvertisingBreakdownSection.tsx`, `RenewalsDashboardSection.tsx`, `UpcomingRenewalsSection.tsx`, `MembershipRenewalPeriodStats.tsx`, `RecentActivityFeed.tsx`, `QuickActionsPanel.tsx` (all under `src/app/admin/component/overview/`).
- Orphan-dead component-level files reachable only through the unused barrel: `src/app/admin/component/MembershipStats.tsx` (hardcoded mock), `AdminStatsCard.tsx`, `RecentOrders.tsx`, `TopProducts.tsx`, and the dead barrel `src/app/admin/component/index.ts` itself (zero importers — the components it re-exported that are still live, e.g. `AdminPage`, are imported by direct path).
- Earlier in the reskin, `src/components/admin/RevenueOverview.tsx` was deleted (replaced by `RevenueChartCard`).

**Kept** (still in use): `overview/DashboardOverview.tsx`, `overview/OverviewToolbar.tsx` _(deleted 2026-08-19 — replaced by the shared `AdminDateRangeToolbar`)_, `overview/DashboardSection.tsx` (used by `UsersBreakdownSection`), `overview/UsersBreakdownSection.tsx`, and all `overview/sections/*` redesign cards. The `my-account` `RecentOrders.tsx` (a different, live file) was untouched. Detail modals the deleted sections used (`RevenueDetailModal`, `MembershipByPackageDetailModal`, `PrizePerformanceAdsModal`) were left in place — they live under `src/components/admin/` and are out of scope for the Overview reskin.

## DashboardOverview — Users Breakdown section — 2026-05-04

[src/app/admin/component/overview/DashboardOverview.tsx](../../src/app/admin/component/overview/DashboardOverview.tsx) renders a new collapsible `UsersBreakdownSection` (the legacy `RevenueOverview` chart that previously followed it was removed in the Phase 3 redesign and replaced by `RevenueChartCard` in the charts row — see above).

- State: `isUsersBreakdownExpanded` — local `useState(false)`, toggled via the section's own chevron.
- Component: [src/app/admin/component/overview/UsersBreakdownSection.tsx](../../src/app/admin/component/overview/UsersBreakdownSection.tsx) — wraps a `DashboardSection` (`title="Users Breakdown"`, `subtitle="Age groups, professions and state across all users"`, `collapsible`).
- Data: calls `useUserMetrics({ enabled: isExpanded })` so the all-time aggregation only fetches when the section is opened.
- Body when loaded: a `divide-y` stack rendering `<AgeBreakdownTable bare … />`, `<StateBreakdownTable bare … />`, `<ProfessionBreakdownTable bare … />` — the same components used in the metrics tab's table mode, with `bare` passed so the inner card chrome is suppressed inside the parent `DashboardSection`. Rows separated by horizontal dividers instead of nested cards.
- Loading shows a spinner row; when `data` is null after load, a "No breakdown data available." placeholder renders.

## Past-due charge history tab (`/admin/past-due-history`)

### Components

- [src/app/admin/component/PastDueChargeHistory.tsx](../../src/app/admin/component/PastDueChargeHistory.tsx) — top-level page component. UI mirrors the rest of admin: page-title row with a `DateRangeToggle` on desktop (portaled into `useAdminMobileDateToolbarSlot()` on mobile), four `MetricCard`s (Bulk runs / Invoices attempted / Succeeded / Revenue recovered) summarising the runs in the selected range, then two stacked card tables — **Bulk Runs** (from `GET /api/admin/charge-past-due/runs`) and **Manual Retries** (from `GET /api/admin/charge-past-due/manual-retries`) — both wrapped in the standard `bg-white dark:bg-neutral-900 rounded-xl shadow-sm border` shell with header row + count. Run/retry status badges use the same emerald/red/amber palette as `BlockedTransactionsManagement`. The "Custom Range" preset opens [`CustomDateRangeModal`](../../src/components/admin/CustomDateRangeModal.tsx); presets `today`/`yesterday`/`current-draw`/`last-draw`/`all-time` are wired the same way as `PromoAnalyticsManagement` (AEST timezone via `formatInTimeZone`, `getWebsiteLaunchDateUTC()` for `all-time`, draw dates from `useCurrentAndLastDrawDates`). Default range is **Last 30 days** (initial state: `dateRange: "custom"` with `startDate = subDays(today, 29)` and `endDate = today`). Clicking a bulk-run row opens `PastDueChargeHistoryDrawer`.

  **Manual Retries — grouped-by-user UX.** Rows are no longer flat; they're collapsed into one row per user via `groupChargeAttemptsByUser` from [src/utils/admin/groupChargeAttemptsByUser.ts](../../src/utils/admin/groupChargeAttemptsByUser.ts). The summary row shows last-attempt time, admin label, user (rendered with `<ClickableUserDisplay>` so clicking the email opens `UserDetailModal`), attempt count + per-status breakdown (`N✓ N✗ N⏭`), latest-status badge, and total amount. A chevron toggles a nested table with per-attempt rows (When / Invoice / Status / Amount / Error / Action). Stranded-error rows still expose the `Recover` button + checkbox; the group-row checkbox toggles all stranded attempts for that user (supports `indeterminate` state).

  **Server-side user search.** A debounced `<input type="search">` next to the bulk-recover button drives a `userSearch` query param sent to `GET /api/admin/charge-past-due/manual-retries`. `useDebounce(input, 300)` smooths typing; the `filter` memo is keyed on the debounced value so changing the search resets pagination from offset 0. The Bulk Runs query receives the same `filter` object but the API ignores `userSearch`.

  **"Loaded attempts only" hint.** When the manual-retries query has more pages, a small line `"Per-user counts reflect loaded attempts only. Click \"Load more\" to widen the view."` renders above the Load-more button — per-user totals only aggregate over the currently-fetched pages, not the unbounded server-side total.

  **Error column precedence.** Both per-attempt error cells render `r.declineCode ?? r.errorCode ?? r.errorMessage ?? ""` so the most specific Stripe signal wins (e.g. `do_not_honor` over the generic `card_declined` bucket).

- [src/app/admin/component/PastDueChargeHistoryDrawer.tsx](../../src/app/admin/component/PastDueChargeHistoryDrawer.tsx) — slide-in drawer for a single run. Fetches `GET /api/admin/charge-past-due/runs/[runId]` via `useChargePastDueRunDetail` and displays a status-badged Summary card (started / finished / duration / admin / eligible / attempted / succeeded / failed / revenue) with a Skip-breakdown subsection, plus a Per-invoice attempts card-table. Uses the admin neutral palette (`dark:bg-neutral-900`, `dark:border-neutral-800`) and the same `RunStatusBadge` / `RetryStatusBadge` colours as the parent page.

  **Per-invoice attempts — grouped-by-user UX.** Same `groupChargeAttemptsByUser` grouping as the parent page, with a chevron-driven collapsible per-user row. Rows are augmented with the run's `adminName` (one admin per run, so the DTO doesn't carry it per-row) before grouping. A **client-side** email search input (no debounce, no API call) filters `groupedAttempts` by `userEmail.includes(query.toLowerCase())` — search is local because the entire run's row set is already in memory. Header shows `{groupedAttempts.length} users` instead of a row count. User emails render via `<ClickableUserDisplay>`.

  **Status filter chips.** Next to the email search the header renders three multi-select toggle chips — `Succeeded` / `Failed` / `Skipped` (emerald/red/amber, matching `RetryStatusBadge`; dimmed when off) — backed by `activeStatuses: Set<AttemptStatus>` initialised to all three. The filter uses **"any matching attempt"** semantics: after grouping, a user is kept if any of their attempts has a status in the active set (checked via the group's `successCount` / `failedCount` / `skippedCount`, so a mixed user can match more than one chip). It composes with the email search via AND. The filter only narrows the *user list* — once a user is shown, their expanded per-invoice rows are NOT filtered, so bulk-recover selection logic is unaffected. An empty set is treated as "no filter" (shows all users) rather than blanking the list; when all chips are off the count line appends ` (no status filter)`.

  **Dropped "When" column.** All attempts in a single run share approximately the same time, so the per-attempt table inside the expanded row no longer renders a When column — only Invoice / Status / Amount / Error. The Error cell uses the same `declineCode ?? errorCode ?? errorMessage` precedence as the parent page.

  **Multi-select bulk recovery (Phase 3).** The "Per-invoice attempts" section supports multi-select on stranded `failed` rows (matched via `isStrandedError`). The header's "Recover selected (N)" button opens `BulkRecoverInvoicesModal`, which POSTs to `/api/admin/invoices/recover-past-due` in batches of 10 — same path the manual-retries section uses. On completion the drawer's run-detail query is invalidated so row statuses refresh in place. Per-row checkboxes are enabled only when the row's `status === "failed"`, the error matches `isStrandedError(errorMessage, errorCode)`, AND the group has a `userId`; otherwise they're disabled with a `title` tooltip explaining why. Each checkbox carries `aria-label="Select invoice <id> for bulk recover"`.

Both components import `formatDurationMs` and `isStrandedError` from [src/utils/admin/chargePastDueFormat.ts](../../src/utils/admin/chargePastDueFormat.ts) — Mongoose-free pure helpers. Importing them from `services/admin/chargePastDueHistory.ts` would transitively pull `mongoose` into the client bundle and crash hydration on `mongoose.models[...]`. `isStrandedError` was hoisted out of a local copy in `PastDueChargeHistory.tsx` (Phase 3) so the drawer and the manual-retries table share one matcher.

### Hooks

Three TanStack Query hooks under `src/hooks/queries/admin/`:

| Hook | Endpoint | Shape |
|---|---|---|
| `useChargePastDueRuns(filter)` | `GET /api/admin/charge-past-due/runs` | `useInfiniteQuery` — offset paging, page size 50. Returns `{ runs, total, hasMore, isLoading, isFetching, isFetchingNextPage, isError, fetchNextPage }`. **Polls while any loaded run is `running`** so the history view shows live progress. |
| `useChargePastDueRunDetail(runId)` | `GET /api/admin/charge-past-due/runs/[runId]` | `useQuery` — single run + all its `InvoiceChargeLog` rows. **Polls while the run is `running`** (live chunk progress). |
| `useChargePastDueManualRetries(filter)` | `GET /api/admin/charge-past-due/manual-retries` | `useInfiniteQuery` — offset paging, page size 50. Returns `{ rows, total, hasMore, isLoading, isFetching, isFetchingNextPage, isError, fetchNextPage }`. |

All three are admin-only. Query keys are prefixed `["admin", "charge-past-due", ...]`. The two `useInfiniteQuery` hooks key on the full `filter` object so changing date range (or any other filter field) resets paging from offset 0. `getNextPageParam` returns `loaded < total ? loaded : undefined`. The Bulk Runs and Manual Retries cards each render a "Load more" button at the bottom (matching `BlockedTransactionsManagement`'s pattern); the table header shows `Showing X of Y`. Summary `MetricCard`s aggregate across **loaded** pages only — clicking "Load more" updates them.

### Decline-code summary panel

`PastDueChargeHistory.tsx` renders a "Why charges declined" panel between the top cards and the Bulk Runs section. Powered by `useChargePastDueDeclineSummary`, scoped to the current date filter. Each row shows the code, count, a proportional bar, and percent. Loading state = 5 skeleton bars; empty state = single "No failed attempts in selected range." line.

### Top cards (reduced)

Two cards only: **Succeeded** (count) and **Revenue recovered** (currency). Both aggregate Bulk Runs only — Manual Retries deliberately don't roll up here. Subtitle on Revenue recovered says "From bulk runs" to make this scope explicit.

### Shared `AttemptsBreakdown` component

`src/components/admin/AttemptsBreakdown.tsx` is the single source of stacked count-plus-chips rendering. Used in four places:

- Bulk Runs row (size `cell`, with `eligibleHint`)
- Manual Retries grouped row (size `cell`, no hint)
- Drawer Summary `<dd>` (size `block`, with `eligibleHint`)
- Drawer per-invoice section, per-user grouped row (size `cell`, no hint) — the inner per-attempt table is unchanged

If any of those four breakdowns drift visually, fix the component — don't fork.

## Force Charge fallback in ChargePastDueUserModal

[`ChargePastDueUserModal.tsx`](../../src/components/admin/ChargePastDueUserModal.tsx) includes a Force Charge fallback path for the case where the standard preview returns `eligibleCount: 0` (no chargeable open invoices found by the normal past-due filter). This happens when the user is still `past_due` in the DB but their current subscription cycle invoice is a held draft under `pause_collection` — which the normal filter excludes.

**UI flow:**

1. Preview loads and shows `eligibleCount: 0`.
2. An amber warning panel appears: "No chargeable invoice on this user's current subscription" with a **Switch to Force Charge** button.
3. Clicking the button enters `forceChargeMode`. The normal "Confirm charge (0)" button in the footer is replaced with an amber **Force Charge** button.
4. A confirmation input requires the admin to type `FORCE CHARGE` exactly (uppercase) before the button enables.
5. On submit, POSTs to `POST /api/admin/users/[id]/force-charge` with `{ confirmation: "FORCE CHARGE" }`.
6. Success shows a green panel with the charged invoice ID, payment status, and amount. Failure shows a red panel with the error message and optional `reason` code.

**State variables added:** `forceChargeMode`, `forceConfirmation`, `forceProcessing`, `forceResult`. All are reset in `handleClose`.

**Color scheme:** amber (`bg-amber-600`) distinguishes Force Charge from the standard red (`bg-red-600`) charge path. Light/dark parity is maintained throughout.

## Force Charge UI (user self-serve)

[`RenewalFailedModal.tsx`](../../src/components/modals/RenewalFailedModal.tsx) — when the existing `pay-failed-invoice` flow returns an error matching "no payable invoice" or similar phrases (matched by `isNoPayableInvoiceError(error)`), the modal renders a "Pay overdue amount" CTA that calls `POST /api/stripe/force-charge-overdue`.

**UI flow:**
1. User sees the renewal-failed modal and clicks "Resolve Payment Issue".
2. The `pay-failed-invoice` mutation returns an error whose message contains "no payable invoice" (or related phrases).
3. The amber "Pay overdue amount" button appears below the error box.
4. On click, the button shows "Paying overdue amount…" while the request runs.
5. On success, a green panel confirms "Payment received. Your subscription is now up to date."
6. On failure, a red panel shows the error message from the API (or a generic contact-support message).

**State variables added:** `forceChargeProcessing`, `forceChargeResult`. Both are reset when the modal opens.

## Stranded invoice recovery UI

The recovery action is exposed in three places:

- **Trigger A** — `Manual Retries (per-user)` table in [`PastDueChargeHistory.tsx`](../../src/app/admin/component/PastDueChargeHistory.tsx). Rows whose error matches `/no longer be paid|no longer payable/i` get a `Recover` button in the Action column (per-row) **and** a checkbox in a new Select column. When one or more stranded rows are checked, a **Recover Selected (N)** button appears in the Manual Retries section header — clicking it opens `BulkRecoverInvoicesModal`.
- **Trigger D** — auto-fallback in [`ChargePastDueUserModal.tsx`](../../src/components/admin/ChargePastDueUserModal.tsx). When a single-user retry returns a stranded-error row, that row gets an inline `Recover` button alongside the error text.

Per-row recovery opens [`RecoverInvoiceModal.tsx`](../../src/components/admin/RecoverInvoiceModal.tsx), which:

- On open, immediately fires `GET /api/admin/users/[userId]/recover-past-due-invoice?invoiceId=…` (the pre-flight eligibility check) and shows "Checking eligibility…" while it runs.
  - If ineligible: shows a red-bordered panel with the blocking reason and message; the Recover button is hidden (only Cancel is shown). The admin cannot proceed without dismissing.
  - If eligible: shows the recovery sequence in plain English, the RECOVER confirmation input, and the Recover button.
- Requires the admin to type `RECOVER` exactly before submitting.
- POSTs to `/api/admin/users/[userId]/recover-past-due-invoice` with `{ confirmation: "RECOVER", originalInvoiceId }`.
- Displays the per-step result (new invoice id, charge status, amount).

The modal is intentionally narrower than `ChargePastDueUserModal` — by the time the admin opens it they have already seen the failed row, so there's no preview step.

### Bulk stranded-invoice recovery

[`BulkRecoverInvoicesModal.tsx`](../../src/components/admin/BulkRecoverInvoicesModal.tsx) handles N-row recovery in one operation:

- Accepts `items: BulkRecoverItem[]` (userId, userEmail, originalInvoiceId, amount).
- Shows a warning panel listing all selected invoices (scrollable preview table).
- Requires the admin to type `RECOVER ALL` (uppercase, exact) before enabling the Recover button.
- POSTs to `POST /api/admin/invoices/recover-past-due` with `{ confirmation: "RECOVER ALL", items }`.
- Shows a spinner while the server processes rows sequentially (300ms delay between rows; request holds open until all rows complete).
- On completion shows a 3-column summary card (Total / Succeeded / Failed). Each summary card is a filter toggle — clicking one filters the results table below to that subset.
- Results table: original invoice ID (truncated), outcome label, detail (error string or reason).
- On successful completion, calls `onCompleted()` which clears the checkbox selection in `PastDueChargeHistory`.
- Hard cap: 50 items per call (enforced by Zod on the server and implicitly by the checkbox UX which only shows on stranded rows in the current view).

**Selection state in `PastDueChargeHistory`:**

- `selectedRows: Set<string>` — keys are `${userId}-${invoiceId}`.
- `strandedRows` memo — filters `retriesQuery.rows` to those that pass `isStrandedError()` and have a `userId`.
- `selectedItems` memo — maps `strandedRows` entries whose key is in `selectedRows` to `BulkRecoverItem[]`.
- Checkboxes only render for stranded rows; all other rows have an empty cell.

### Recover Stranded panel

[`RecoverStrandedPanel.tsx`](../../src/components/admin/RecoverStrandedPanel.tsx) is the scan-based bulk recovery surface (Preview → Recover). After **Preview Stranded** (`GET /api/admin/invoices/recover-stranded`) it renders summary cards (Scanned / Recoverable / Blocked (no draft) / Revenue at stake) and a recoverable-members table.

- **Auto-loop recovery (no re-clicking):** the **Recover all N** action (gated by typing `RECOVER`) drains the entire recoverable set automatically. It POSTs `{ confirmation: "RECOVER", limit: 30 }` repeatedly — the server is idempotent (a recovered member drops from the next live scan), so it loops until a batch attempts nothing, the admin stops, or the `MAX_ITERATIONS = 60` safety ceiling is hit. A **live progress bar** + Stop button render while running; the per-batch responses are accumulated into one `runResult` summary. The old per-run `limit` input was **removed**. (Server still clamps each batch to `MAX_LIMIT = 30` — see [backend.md](./backend.md#safety-model).)
- **Clickable summary cards → inspector popup:** the **Recoverable** and **Blocked (no draft)** cards are now buttons (when non-empty) that open `StrandedMembersInspector` — a popup listing those members (email, subscription, amount, and stale-opens-to-void for recoverable / classification for blocked) with a **Copy emails** button.
- Defensive response parsing (`res.text()` → `JSON.parse` in try/catch) so a Vercel timeout shows a real message, not a parser error — see [gotchas.md](./gotchas.md#recover-stranded-runs-in-30-member-batches-vercel-300s-cap).

### Light/dark mode parity

The footer uses explicit paired classes throughout:
- **Cancel button**: `bg-gray-200 hover:bg-gray-300 text-gray-800` (light) / `dark:bg-neutral-700 dark:hover:bg-neutral-600 dark:text-gray-100` (dark)
- **Recover button**: `bg-amber-600 hover:bg-amber-700 text-white` — amber works in both modes, dark overrides repeat the same values for explicitness.
- Footer background: `bg-gray-50 dark:bg-neutral-950/80`

Success (green) and error (red) panels use `{color}-50` light backgrounds with `{color}-800`/`{color}-900` text in light mode for sufficient contrast, and `{color}-950/25` dark backgrounds with `{color}-200`/`{color}-300` text in dark mode.

## Upsell Multiplier panel (PromoManagement > Upsell Multipliers tab — 2026-05-14)

[src/components/admin/UpsellMultiplierPanel.tsx](../../src/components/admin/UpsellMultiplierPanel.tsx) — editable form for the singleton `UpsellMultiplierConfig` document. Mounted as the `"upsell-multipliers"` tab inside `PromoManagement`.

**Shell features:**
- Three `<select>` controls (Membership / One-Time / Additional) whose options come from `PROMO_MULTIPLIERS`.
- Draft state — changes are held in `useState` until the admin clicks Save, letting the preview update instantly without persisting.
- Save calls `PUT /api/admin/upsell-multipliers` via `useUpsellMultipliersMutation()`; Cancel resets draft to the last-saved values.
- Active-promo banner reads `useAdminActivePromos()` and shows the current multiplier for each of the three promo types (membership-packages / one-time-packages / mini-packages). Renders "no active promo" when none are active.

**Preview component** ([src/components/admin/UpsellMultiplierPanel.preview.tsx](../../src/components/admin/UpsellMultiplierPanel.preview.tsx)):
- Accepts `{ membership, oneTime, additional }` props and renders four responsive tables: Membership / One-Time / Additional / Mini.
- Per-row entry count = `multiplier × base`, where `base` is resolved via `getPackageById(record.baseTemplatePackageId)` (subscription → `entriesPerMonth`, one-time → `totalEntries`).
- Mini table is static (no knob) — annotated "fixed 1:1 entries"; uses the hard-coded `MINI_ROWS` constant matching the `MINI_TIERS` in `upsellPackages.ts`.

**TanStack Query hooks** ([src/hooks/queries/admin/useUpsellMultipliers.ts](../../src/hooks/queries/admin/useUpsellMultipliers.ts)):
- `useUpsellMultipliersQuery()` — `useQuery` against `GET /api/admin/upsell-multipliers`. Query key: `["admin", "upsell-multipliers"]`. Uses `apiGet` from `@/lib/queries` for consistent auth + error handling.
- `useUpsellMultipliersMutation()` — `useMutation` + `apiPut`; invalidates the query key on success.

## Hooks

| Hook | Purpose |
|---|---|
| `useAdminMobileDateToolbarSlot()` | Admin-specific date toolbar mobile UX |
| `useUpsellMultipliersQuery()` | GET singleton upsell multiplier config |
| `useUpsellMultipliersMutation()` | PUT updated multiplier triple, invalidates query |
| (admin queries via `useAdminQueries.ts`) | TanStack Query hooks for admin data |

## Theme

Admin uses [AdminThemeContext](../theme/architecture.md#three-contexts) — separate from member theme.

## A/B variant editor — membership section theme

`VariantConfigEditor` has a "Membership Section Theme" section with a
**Force light mode on the membership section** checkbox bound to
`config.membershipTheme.forceLight`. The site-wide membership dark-mode test
has shipped (light won — see [shared-ui/frontend.md](../shared-ui/frontend.md))
and `MembershipSection` no longer reads this field, but the checkbox stays in
the editor for future revival.

## A/B variant editor — package design (removed)

Historical note: `VariantConfigEditor` previously had a **Package Design (A/B)**
`<select>` (`config.packages.design`) for the 2026-07 promo packages-design
experiment. The experiment concluded 2026-07-06 — control won — and the
selector, the `packages.design` config key, and its validation were removed.
The remaining Packages Configuration inputs (`hidePackages`, `displayOrder`,
`highlightPackage`) are unaffected.

## A/B variant editor — per-slug hero image map

`VariantConfigEditor` also exposes a **Per-slug hero overrides** editor inside
the Hero Configuration section, backed by the `PerSlugImageMapEditor`
subcomponent in the same file. It manages
`config.hero.imageSrcBySlug: Record<slug, { desktop?, mobile? }>` — one variant
can carry per-page hero creatives so a single experiment covers multiple
landing slugs.

Each row's **Desktop** and **Mobile** path inputs are independently optional.
Leaving Desktop blank keeps desktop visitors on the theme-aware default landing
image while mobile visitors see the override — this is the mobile-only A/B test
shape. The editor strips empty strings before saving so the persisted config
carries only meaningful overrides. Slug keys MUST match the experiment's
`slugTargets` exactly; empty rows or rows with both paths blank are rejected
by `VariantConfigService.validateVariantConfig`.

## A/B experiment edit (Pencil icon in list)

`ABTestingManagement.tsx` row actions include a **Pencil (Edit)** button shown
only when (a) the viewer has `abTesting.edit` permission and (b) the experiment
status is `draft` or `paused`. Clicking it opens `ExperimentFormModal` in **edit
mode** — same component as Create, but the `experiment` prop pre-populates the
form, the title becomes "Edit A/B Testing Experiment", and submit calls
`useUpdateExperiment()` → `PATCH /api/admin/ab-testing/experiments/[id]`.

Locked statuses (`active`, `ended`) intentionally hide the Edit button — both
the server (`ExperimentService.canEditExperiment`) and the API
(`updateExperimentSchema`) refuse edits to locked experiments anyway. Variants
are still edited from the experiment detail view's variant section, not from
this modal.

## Cancellation Flow Analytics view (Admin > Analytics > Cancellation Flow) — Task 18

[src/components/admin/CancellationFlowAnalytics.tsx](../../src/components/admin/CancellationFlowAnalytics.tsx) is a **read-only** panel mounted as the `cancellation-flow` tab in the Analytics sidebar group (`AdminSidebar` group `analytics`, rendered by `AdminPage` on `selectedTab === "cancellation-flow"`). No mutations, no charts library. Styled with the standard analytics primitives — `MetricCard` for top stats, `bg-white … rounded-lg sm:rounded-xl shadow-sm … border` section wrappers, `bg-gray-50` table heads, `font-mono tabular-nums` numeric cells — to keep visual parity with `PromoAnalyticsManagement` and the rest of the Analytics group.

**Date filter.** The tab is registered in `ADMIN_TABS_WITH_MOBILE_LAYOUT_DATE_TOOLBAR` ([adminMobileDateToolbarSlot.ts](../../src/app/admin/component/adminMobileDateToolbarSlot.ts)) so it gets the shared mobile date strip under the admin header. Component owns `dateRange` / `startDate` / `endDate` state synced with URL params (same pattern as `PromoAnalyticsManagement`); default range is **today**. `current-draw` / `last-draw` hydrate from `useCurrentAndLastDrawDates`; `custom` opens `CustomDateRangeModal`. The component sends AEST `yyyy-MM-dd` values via the hook; the route handler converts them to UTC bounds (`startDate` → start of day AEST, `endDate` → start of next AEST day for the exclusive upper bound).

Sections: three top cards (Triggered / Save rate / Saved); funnel with four CSS bars (Reached offer → Accepted → Cancelled → Abandoned; the "Reached reason" step is omitted because it is always equal to Triggered); a **Reason × outcome** table (count, share %, Saved, Cancelled, Abandoned per reason) — **rows with `count > 0` are clickable** and open `CancellationReasonUsersModal` (see below) scoped to the currently-selected date range; an **"Other" reasons (free text)** table listing every `reason === "other"` event's `reasonText` with outcome chip, AEST timestamp, and **a User column** that renders a `ClickableUserDisplay` (email + optional name subtext) opening the standard `AdminUserModal` via `useAdminUserModal` — falls back to a plain "—" when the event has no `userId`; a 2-card retention summary (Retained 90d %, Pending); and a **90-day retention by offer** table (offer | saved | retained | churned | pending | retained %) showing which offers produce durable saves vs delayed churn. Retained % = `retained ÷ (retained + churned)` over matured saves (“—” when none matured). Short note under the funnel surfaces `pastDueExcludedFromOfferConversion` when non-zero.

**Reason drill-down modal** ([src/components/admin/CancellationReasonUsersModal.tsx](../../src/components/admin/CancellationReasonUsersModal.tsx)): paginated (20/page) user-level event list for a single cancellation reason. Toolbar has four outcome filter chips (`All` / `Saved` / `Cancelled` / `In progress`; resets to `All` whenever the modal opens for a new reason). Columns: Outcome chip, Started (AEST `yyyy-MM-dd HH:mm`), User (`ClickableUserDisplay` → opens `AdminUserModal`; "—" for guest/legacy events with no `userId`), and either **Free text** when the reason is `"other"` or **Offer accepted** for every other reason. Filter changes reset to page 1. Backed by `useCancellationFlowUsersByReason` (see below).

Data hooks: [src/hooks/queries/admin/useCancellationFlowAnalytics.ts](../../src/hooks/queries/admin/useCancellationFlowAnalytics.ts) — both hooks live in this file, follow the `useChargePastDueDeclineSummary` admin-hook pattern (inline key, `{ data, isLoading, isError }`):
- `useCancellationFlowAnalytics(filter)` — TanStack `useQuery`, queryKey `["admin", "cancellation-flow-analytics", filter]`.
- `useCancellationFlowUsersByReason(filter | null, { enabled? })` — TanStack `useQuery`, queryKey `["admin", "cancellation-flow-analytics", "users-by-reason", filter]`. Caller passes `null` filter or `enabled: false` to prevent fetching when the modal is closed. Returns `{ rows: ReasonUserRow[], totalCount }`.

Endpoints + aggregation rules: [api.md](./api.md#cancellation-flow-analytics).

**Client-safe constant copies.** `CancellationFlowAnalytics.tsx` declares its own module-local `CANCELLATION_REASONS` and `OFFER_TYPES` constants (identical values and order to the model) instead of importing them from `@/models/CancellationFlowEvent`. That module is a Mongoose model file — runtime-evaluating it in a client component crashes (`mongoose` is `serverExternalPackages`, so `models.CancellationFlowEvent` is undefined in the browser). The type-only imports (`import type { CancellationReason, OfferType }`) remain safe because types are fully erased at build time. Keep the local constants in sync by hand whenever the model's `CANCELLATION_REASONS` or `OFFER_TYPES` arrays change. This is the same pattern used elsewhere on this branch for the same class of crash.

## Chatbot (Cobber) — availability, cost & usage (2026-06-26, updated 2026-08-10)

**Tab container (2026-08-10).** `AdminPage` now renders [src/components/admin/ChatbotManagement.tsx](../../src/components/admin/ChatbotManagement.tsx) on `selectedTab === "chatbot"`, not `ChatbotCostManagement` directly. It is a thin container owning one `Segmented` sub-view switch so each leaf view stays a single concern:

| Sub-view | Component | Permission |
|---|---|---|
| **Usage & cost** (default) | `ChatbotCostManagement` | `overview.view` (the tab gate) |
| **Conversations** | `ChatbotConversations` | **`submissions.view`** |

The two sub-views deliberately differ in gate. The tab is granted by `overview.view`, which is right for aggregate cost numbers — but transcripts contain what individual customers typed. `ChatbotManagement` calls `usePermissions().has("submissions.view")` and, when absent, renders `ChatbotCostManagement` alone with **no switch at all**, so a user never clicks a sub-tab into a 403. Keep this in lockstep with the `requirePermission("submissions.view")` in both `/api/admin/chatbot-conversations` routes.

### Usage & cost sub-view

[src/components/admin/ChatbotCostManagement.tsx](../../src/components/admin/ChatbotCostManagement.tsx) is the **`chatbot`** tab's default view — relocated 2026-07-08 from the Analytics group to the **Team** group (below Norm) and renamed "Chatbot Cost" → "Chatbot", since the section now toggles availability, not just reports cost. Reached via `AdminPage` → `ChatbotManagement` on `selectedTab === "chatbot"` (URL `/admin/chatbot`; the H1 comes from `adminTabLabel`). Gated by `overview.view`. Read-only **except** two `PATCH` controls: the Cobber availability (pause) toggle and the AI model provider toggle (see below). The component file/class keep the `ChatbotCost*` name (still primarily the cost-analytics surface). No external chart library.

**Headline KPI: Deflection rate** — the share of requests answered free (via FAQ deflection) with no LLM/AI spend. Higher = lower cost.

**Range switcher.** A `Segmented` control lets the admin pick 7 / 30 / 90 days. State is local (`useState`) — no URL sync needed for a cost dashboard.

**Cobber availability (pause) toggle — the primary on/off control (a `Power`-icon `Card`, above Budget status).** A `Segmented` (size `sm`) **Live / Paused** switch wired to `useSetChatKillSwitch()` (`PATCH /api/admin/chatbot-settings { killSwitch }`). Paused = the DB `ChatSettings.killSwitch`, which hides the chat bubble site-wide (via `GET /api/chat/config`) **and** blocks the generative path server-side (costGuard). Reads a **dedicated** `useChatbotSettings()` GET (`{ activeProvider, killSwitch, killSwitchEnvForced }`) — NOT the cost-analytics `config.killSwitch` (env-only). When `killSwitchEnvForced` (the `CHAT_KILL_SWITCH` env break-glass is set), the toggle is locked with an amber note (env wins over the DB toggle). A red "Paused" pill shows in the header when effectively paused. Full mechanics: [docs/ai-chatbot/gotchas.md](../ai-chatbot/gotchas.md).

**Budget status panel (below the availability card).** A `Card` showing today's spend vs the configured daily cap — `fmtUsd(todayUsd) / fmtUsd(dailyBudgetUsd)` — with a horizontal `ProgressBar` (green < 50%, amber 50–80%, red > 80%), percent-used label, and a projected monthly spend line (`last7Usd / 7 * 30` when 7+ days of data, else `last30Usd`). If loading, the bar renders at 0%. (The old read-only `ShieldOff` "KILL SWITCH ON" badge that used to live in this header was removed 2026-07-08 — pause state now lives in the availability card above.)

**AI model provider toggle (the one interactive control, below the budget panel — always visible, even with zero traffic).** A `Card` with a `Bot`-icon header and a `Segmented` (size `sm`) switching Cobber's live LLM provider between **Claude Haiku** (`anthropic`) and **Gemini Flash-Lite** (`google`). Shows the current resolved `config.model` inline. Wired to `useSetChatProvider()` (`src/hooks/queries/admin/useChatbotSettings.ts`) — a TanStack mutation that `PATCH`es `/api/admin/chatbot-settings` and invalidates `["admin", "chatbot-cost"]` so the model name refetches. **Optimistic display:** `displayedProvider` shows `setProvider.variables` (the target) while `isPending`, reconciling to server truth on refetch; on error it auto-reverts (pending clears → falls back to `config.activeProvider`) and an inline red message shows. The `Segmented` is wrapped in a `pointer-events-none opacity-60` div while pending/loading (it has no `disabled` prop). The switch is DB-backed (`ChatSettings` singleton) and takes effect server-side on the next chat request. Deflected FAQ answers are free on either provider.

**Metric cards (top row):** Cost today (USD) · Cost 30-day · **Deflection rate %** (highlighted emerald) · Escalations · Total tokens (in + out).

**Saved by deflection MetricCard (below metric cards, inside `hasData` block).** Shows `~fmtUsd(estSaved)` where `estSaved = deflectedCount × (last30Usd / llmCount)`. If `llmCount === 0`, shows `$0.00`. Subtitle: "est. vs answering everything with AI (last 30 days)". This is an estimate — the label includes `~`.

**Daily cost area chart.** `RevenueAreaChart` over the `daily` array from the API (ascending, filled in for zero-spend days). Amber accent to match a "money" visual language.

**Breakdowns (donuts).** Both breakdowns use a local `DonutBreakdown` helper (donut on the left via the shared `Donut` from `@/components/admin/ui`, a labelled legend with count + % on the right) — replaced the previous horizontal `BarList`s for a clearer share-of-total read. Donut center label = total requests; segments carry `count` for the hover readout. **Padding note:** the shared `Card` has **no built-in padding** (it only sets radius/border/bg — callers add their own), so every `Card` on this page — `DonutBreakdown`, the daily-spend chart, the empty state, the budget panel, and the provider toggle — passes `className="p-4"`. Omitting it renders content flush to the card edge.
- **Request type breakdown.** Deflected (FAQ / free, green) vs LLM calls (paid, orange). Footer: total requests · conversations count (distinct `conversationId`s, if > 0) · avg response; second line: Cost / AI answer · Cost / conversation (both guarded, only shown if denominator > 0).
- **Actor breakdown.** Members (indigo) vs anonymous (slate) requesters. No footer — the legend already shows each share's % (dropped the old redundant "Members X% · Anonymous Y%" line and its now-unused `memberPct`/`anonPct` derivations).

**Config strip (small/muted, bottom of `hasData` block).** A `Settings`-icon row showing: `Daily budget: {fmtUsd(dailyBudgetUsd)} · Limit: {generativeLimitMax} AI answers / {generativeLimitWindowSeconds/60} min per user`. The model name is no longer here — it moved to the AI model provider toggle card above. Uses `bg-neutral-50 dark:bg-neutral-800/50` with a border.

**ProgressBar component.** `src/components/admin/ui/ProgressBar.tsx` — a minimal `h-2` horizontal bar, colour driven by `pct` (0–100, clamped), exported from the barrel. Not a chart-library component.

**Empty state.** When `usage.totalRequests === 0` a friendly card renders: "No chatbot activity recorded yet."

**Data hooks:** `useChatbotCostAnalytics(days)` — TanStack `useQuery`, inline queryKey `["admin", "chatbot-cost", days]`, fetches `/api/admin/chatbot-cost?days=${days}`. The returned `ChatbotCostData` includes `config` (incl. `config.activeProvider`) and `usage.conversationsCount`. `useSetChatProvider()` — TanStack `useMutation` (`src/hooks/queries/admin/useChatbotSettings.ts`), `PATCH`es `/api/admin/chatbot-settings` then invalidates `["admin", "chatbot-cost"]` (partial-prefix match reconciles every range cache).

**Service:** `src/services/admin/chatbotCostAnalytics.ts`. Pure shaper `summarizeAuditRows` (no Mongo) is tested separately via `npm run test:chat-admin-usage`. The DB entry point `getChatbotCostAnalytics({ days })` queries `ChatDailyBudget` for cost rows and `ChatAuditLog` for request audit rows (now including `conversationId` in the `.select()` projection), fills zero-day gaps in the daily array, and reads `config` from env vars server-side.

**Client-safe constant note.** `ChatbotCostManagement.tsx` does not import from `@/models/ChatAuditLog`; the `actorKind` literal tuple is re-declared locally with a "keep in sync" comment — same pattern as `CancellationFlowAnalytics.tsx`.

Endpoint: `GET /api/admin/chatbot-cost` — see [api.md](./api.md).

### Conversations sub-view — transcript browser (2026-08-10)

[src/components/admin/ChatbotConversations.tsx](../../src/components/admin/ChatbotConversations.tsx) answers "what are people actually asking Cobber, and how did it reply" — the read surface for the transcripts that `ChatService` has been persisting since Cobber went live (2026-07-08). Cost analytics reads `ChatAuditLog` aggregates only and never showed message content; this view reads `ChatConversation` + `ChatMessage`.

**Two screens in one component,** switched by local `selectedId` state (no routing — the tab has no URL sub-segment):

**1. List.** Filter `Card` (all `Segmented`, size `sm`) + a search form, then a result `Card`:
- **Range** 7 / 30 / 90 days (90 = the TTL ceiling; the API clamps anything higher).
- **Status** All / Open / Escalated / Closed · **Who** Everyone / Members / Guests · **Answered by** All / FAQ only / AI answered.
- **Search** — a *submit-on-enter* form (not debounced-as-you-type), matching redacted message content. Note it matches **assistant** messages too, so a term Cobber uses in its own replies ("entries") matches far more conversations than a term only customers type.
- Every filter change resets `page` to 1 via a `resetAnd` wrapper — otherwise a narrowed filter can strand the user on a now-empty page 7.
- Rows show actor + firstName, status/`FAQ only` badges, the **first user message** (the "why did they open Cobber" signal), message counts and tokens. Rows are `<button>`s, so keyboard access comes free.
- Pagination is prev/next with `page / totalPages`, hidden when `totalPages <= 1`.

**2. Detail.** Header card (actor, status, models used, tokens, escalation link, TTL-truncation warning), the message thread, then a per-turn table.
- **Message bubbles** are role-coloured (user indigo/right, assistant amber/left, tool grey) and render two grounding affordances that are the whole point of the view: **`citations`** — the FAQ `docId`s Cobber's answer was grounded on (green chips) — and **`toolCalls`** (blue = ok, red = failed, with duration). A confidently-worded answer with **zero citations** is the signal to go fix the FAQ corpus.
- **Per-turn table** — one row per `ChatAuditLog` entry: time, *Answered by* (Escalated / FAQ (free) / AI), model, tokens, latency, HTTP status (≥400 in red).

**Data hooks:** `src/hooks/queries/admin/useChatbotConversations.ts` — `useChatbotConversations(filters)` (queryKey `["admin","chatbot-conversations",days,status,actor,kind,q,page]`, `placeholderData: keepPreviousData` so paging doesn't flash an empty table) and `useChatbotConversation(id)` (queryKey `["admin","chatbot-conversation",id]`, `enabled: Boolean(id)`). Both are read-only — there are no mutations on this surface, so nothing invalidates.

**Privacy posture.** Message content was already PII-redacted at write time by `redactPII()` in `ChatService` (`[email]` / `[phone]` / `[card]`), so this layer has no raw PII to leak — verified against production: **0** stored messages match a raw email pattern. Identity is the Norm projection only: `firstName` + the opaque `userId`. Do not widen it to email/full name/phone.

Endpoints: `GET /api/admin/chatbot-conversations` and `GET /api/admin/chatbot-conversations/[id]` — see [api.md](./api.md). Service: `src/services/admin/chatTranscripts.ts` (see [backend.md](./backend.md)).

## Facebook Ads Management — Health view tab (Task 29, 2026-05-27)

`FacebookAdsManagement` (`src/components/admin/FacebookAdsManagement.tsx`) now supports a third `viewMode` value: `"health"`.

**State / URL changes:**
- `viewMode` type widened from `"ads" | "spend-by-url"` to `"ads" | "spend-by-url" | "health"`.
- `urlViewMode` cast and `setViewMode` cast updated to include `"health"`.
- `handleViewModeChange` signature updated to `"ads" | "spend-by-url" | "health"`.
- The URL-sync `useEffect` now accepts `"health"` as a valid persisted value (legacy `"metrics"` → `"ads"` redirect is unchanged).
- The date-filter portal/render guard (`viewMode === "ads" || viewMode === "spend-by-url"`) now also includes `viewMode === "health"` so the date picker remains available when in health mode. (The filter itself is now `DateRangeDropdown` — see the 2026-06-02 unification note above.)

**Render:**
- A third tab button (`Health`) is added to the switcher next to `Ads` and `Spend by URL`.
- `{viewMode === "health" && <FacebookAdsHealthView startDate={startDate} endDate={endDate} />}` renders the orchestrator below the tab bar.
- The account-level summary cards and `CustomDateRangeModal` continue to only render for `"ads"` and `"spend-by-url"` modes.

**Orchestrator:** `src/components/admin/facebook-ads-health/FacebookAdsHealthView.tsx` — wires `useFacebookAdsHealth` to the four health sub-components (`FacebookAdsHealthTopBar`, `FacebookAdsHealthFilters`, `FacebookAdsHealthPivotTable`, `FacebookAdsHealthSettingsModal`). Local state: `metric`, `verdictFilter`, `statusFilter`, `minSpend`, `campaignFilter`, `search`, `settingsOpen`. `campaignOptions` derived from `data.rows` via `useMemo`.

**Client-side filtering (2026-05-27):** `verdict`, `learningStatus`, `minSpend`, and `search` are applied in a `useMemo` over the cached row set — they never reach the server and are excluded from the TanStack `queryKey`. Only `campaign` (data-slice) and `level`/`startDate`/`endDate` (aggregation grain) remain server-side. `filteredAlertCount` is also recomputed client-side from `displayedRows` so the banner reflects what's actually visible in the table.

## className conventions (2026-05-08)

All admin components use `cn()` from `@/utils/cn` for conditional class composition. The `sweep-classname-template-literals` codemod (Plan 5 Phase 2) converted template-literal `className={`...`}` patterns to `className={cn(...)}` across this domain. When adding new conditional classes, use `cn()` rather than template literals.

## Overview redesign — feedback iteration (round 2, 2026-06-02)

UI-kit additions in [src/components/admin/ui/](../../src/components/admin/ui/): **`Segmented`** (pill toggle, generic over `string | number`) and **`RevenueAreaChart`** now supports a horizontal-scroll mode (`minPointPx` prop) with a fixed left y-gutter so dense series scroll instead of compressing.

Overview section changes:
- **`KpiGrid`** — *Users & Performance* collapsed from 5 tiles to **4**: Total Users + Signups merged into one tile (all-time → "Total Users"; any other range → that period's signups with total-users as subtext). **Renewal Rate** tile always renders, showing today's progressive rate to 1 dp (`renewalProgress.rate`, falling back to `membershipRenewals.succeeded/expected`). Revenue detail popover now lists **all 6** breakdown sources (incl. Mini Draws + Upsells), and the Membership-revenue popover uses **package icons** (`getPackageIcon`) instead of color dots.
- **`MembershipCard`** — legend uses package icons; Past-due + **Paused** render as text `Badge`s in the SectionTitle right slot (bottom tiles removed). Paused count comes from `summary.totalPausedCount`.
- **`UpcomingRenewalsCard`** — initials avatar removed; a `Today / To 27th` `Segmented` toggle drives `useUpcomingRenewals(0 | 27, …)`.
- **`PrizePerformanceCard`** — Prize cell shows the brand logo only (name dropped; moved to `alt`); a manual **Sync** button hits `POST /api/admin/analytics/spend-by-url/sync` and invalidates the spend-by-url query. _(2026-06-04: table cells (ROAS/spend/revenue/conversions) use `text-xs sm:text-sm` to match the Revenue Breakdown mobile sizing; the Milwaukee wordmark is bumped to `scale-[1.35]` (from `scale-125`) since its asset reads smaller than the other brand logos.)_
- **`QuickActionsCard`** — navigation-first: Create Major Draw (modal) + Export (modal) kept; Add Product / Send Broadcast removed; nav actions (Create Mini Draw, Launch Promo, Users, Affiliates, Draw Results, Manage Team, Submissions) route to `/admin/<tab>`. Up to 9 desktop (3×3), top 4 on mobile (`hidden sm:flex` on 5–9).
- **`RevenueChartCard`** — `Days / Months / Years` `Segmented` toggle; each period plots its window (scrollable). **2026-06-03:** the toggle uses `size={isLgUp ? "md" : "sm"}` so it isn't oversized on mobile, and the chart is now **horizontally scrollable on mobile too** — `minPointPx` is `isLgUp ? 24 : 30` (was `0` on mobile, which fit-to-width and disabled scroll). The `RevenueAreaChart` plot now uses `touch-action: pan-x pan-y` and only scrubs on the initial touch (`onTouchStart`, not `onTouchMove`), so a horizontal drag **scrolls** the chart and a **tap** reads a point's value (the old drag-to-scrub is replaced by tap-to-read on touch; desktop hover-scrub is unchanged).
- **`UsersBreakdownSection`** — rebuilt on the kit (`Card` + `SectionTitle` + three `BarList` blocks for Age/State/Profession), Overview-only; keeps the lazy `useUserMetrics({ enabled })` gate. The shared `*BreakdownTable` components (still used by `UserMetricsView`) and `DashboardSection` were NOT modified.
- **`AdminPage`** / **`OverviewToolbar`** — the mobile date filter now renders **inline in the header row beside the theme toggle** (the separate centered date row was removed; `OverviewToolbar` `layout` placement renders the dropdown content-sized).

Backend/data:
- **`MembershipAnalyticsService`** — adds `totalPausedCount` (distinct `userId` in `CancellationFlowEvent` with `offerAccepted:"pause_30d"`, `outcome:"saved"`, `savedAt` within 30 days — a proxy; true live pause state lives in Stripe `pause_collection`, not mirrored).
- **`activity-log` route** — new event types `upsell_accepted` (from `PaymentEvent.packageType==="upsell"`, beats the ≥$300 high-value override), `cancellation_offer_accepted` (from `CancellationFlowEvent`), `admin_role_update` (from `StaffActivity` staff PATCHes), `affiliate_payout` (from `AffiliatePayout`, amount in cents → /100). `subscription_past_due` already emitted. `ActivityLogManagement` type-filter extended.
- **`adChannelProviders`** (dashboard-stats) — the Facebook provider now skips days in the future (fixes `(#100) since cannot be in the future` when a range runs to a future draw date).

## Overview redesign — perf, loaders, charts, modals, top-draws (rounds 3–4, 2026-06-02)

Performance / correctness:
- **`RevenueChartCard`** no longer forces a launch→now window every load (that pulled the full payment-event history each render → slow dashboard). Uses the revenue-breakdown API's per-period defaults (Days = last 30, Months = last 12, Years = since launch). Adds per-point `pointLabels` so the hover tooltip shows the real date (was the sampled axis tick → repeated dates). Header is `flex-col sm:flex-row` so the **period toggle drops to its own row on mobile**; toggle uses the larger default `Segmented` size. Mobile passes `minPointPx={0}` so the chart fits to width and **touch-drag scrubs the focus** (`RevenueAreaChart` gained touch handlers + `touch-action: pan-y`). The tooltip **flips below** near the top, which let us drop the `pt-12 -mt-12` headroom hack that was overlapping/stealing clicks from the header toggle. Skeleton while loading.
- **`DashboardStatsSnapshotReader`** — live-day computation (All-Time exceeds the 90-day snapshot window) is **parallelized with a bounded pool (8)**, order-independent reduce, single refund-set load — byte-identical output, far less wall-clock. Clamps enumeration to today. Reader-test fixture moved `2099`→`2024` (the clamp skips future days); 10/10 pass.
- **Skeleton loaders** restored: `MetricCard` has a `loading` prop; `KpiGrid`/`MembershipCard`/`RevenueBreakdownCard`/`AdvertisingPlatformCard` accept `loading` and skeleton **only when no cached data yet** (`loading && !data`). `DashboardOverview` passes `statsLoading`/`membershipLoading`.

Cards:
- **`KpiGrid`** — Today's Revenue tile gained `sub="From all sources"` (height parity); "Conversion" → **"Conversion Rate"**.
- **`AdvertisingPlatformCard`** (`overview/sections/`) — spend & return by platform (**Platform / Spend / Revenue / ROAS · server / ROAS · platform**, 2026-07-24; previously a single ROAS column).
  **Two ROAS columns (2026-07-24).** Labelled by SOURCE, not by quality: **`ROAS · server`** is our payment-attributed figure (`trueRoas`) and stays the colour-coded one (emerald ≥ 3, else amber) because it is the number to act on; **`ROAS · platform`** is what the ad platform itself reports (`platformRoas`), rendered in neutral weight with the platform-reported dollar value beneath and an explanatory `title`. The platform column is deliberately **not** colour-coded — two colour-coded ROAS figures side by side read as a pass/fail pair, when the platform number is context rather than a verdict. States: `value` · `noData` (spend, but the platform reported no conversion value — distinct from "not applicable") · `na` (owned channels / no spend). The two figures **disagree by design** and the gap is the point; see [backend.md](./backend.md#dual-roas-on-attributedrevenue-2026-07-24).
  **Signups per platform (2026-07-24).** The Revenue cell's sub-line now reads `{conversions} new · {signups} signups` (the signups clause appears only when > 0), from `attributedRevenue[platform].signups`. Click-verified where a paid click id was present at registration, else UTM-derived, else `direct` — same basis as the conversions beside it. A platform with signups but zero revenue still renders a row. Revenue + ROAS are **server-side payment-attributed** (`stats.attributedRevenue`, keyed by `convertingPlatform`), **not** Meta pixel `spend × roas`; ad spend from the ads API. Row logic in the unit-tested `advertisingCardModel.ts` (`npm run test:advertising-card-model`) maps each platform to one of three classes: **paid + spend** (Meta — and TikTok once its nightly sync has rows, via `tiktokAdChannelProvider` 2026-07-24 — spend, revenue, true ROAS `revenue/adSpend`); **paid, spend not synced** (Snapchat, or TikTok pre-data — revenue + conversions; spend "Awaiting sync", ROAS "Needs spend"); **owned** (Klaviyo Email/SMS — revenue + conversions; spend/ROAS "—"). **Truthful awaiting state** (panel F-002): while the TikTok cell is "awaiting", the card checks `syncHealth` (via `useTikTokAdsInsights`, same-day range, query disabled once real spend arrives) and renders a red "Sync failing" (title = TikTok's error message) instead of the benign amber label when the nightly sync is actually erroring. The amber `AWAITING` token is **`text-amber-700`** in light mode (panel F-010) — the previous `amber-600/80` measured **2.51:1** on white at 10px, under the WCAG AA 4.5:1 floor; amber-700 measures **5.02:1**. Dark mode was already compliant (5.74:1) and is unchanged. `MerByDrawCard` uses the identical token — keep the two in step.

**Hover popover placement** (panel F-016): the portalled source-breakdown popover is fixed-position at coordinates captured on mouse-enter. It now **flips above the row** when `r.bottom + gap + POPOVER_MAX_HEIGHT` would exceed the viewport (lower rows were clipped by the bottom edge, and since scrolling closes the popover you could never reach the cut-off part), clamps to an 8px top margin, and clamps `left` so the 300px panel stays inside the right edge. The box also carries `maxHeight: POPOVER_MAX_HEIGHT` + `overflowY: auto` so an unusually tall breakdown scrolls internally instead of overflowing. `POPOVER_WIDTH`/`POPOVER_MAX_HEIGHT` are shared constants so the fit math and the rendered box can't drift apart.

**Page header title** (panel F-018): the header reads `adminTabLabel(selectedTab)` from [`adminTabs.ts`](../../src/app/admin/component/adminTabs.ts) — the **same** label the sidebar renders. It previously re-derived the title from the slug (`selectedTab.replace("-", " ")` + CSS `capitalize`), which mangles brand casing: `tiktok-ads` rendered as "Tiktok Ads" while the sidebar said "TikTok Ads". Brand names are not derivable from slugs. `adminTabLabel` falls back to the old slug transform for ids with no tab entry (deep-link-only views), and the `capitalize` class is gone since real labels are already cased. Header = **Blended ROAS** (Σ revenue ÷ Σ spend over paid-with-spend channels; "—" when none) + total attributed acquisition revenue. **Money is shown in full** (`formatCurrency`, e.g. `$2,400.00` — not `fmtCompact`'s `$2.4k`) so exact spend/revenue is legible (2026-06-03). A **Direct** row (`buildDirectRow`, neutral globe logo) is **appended below the 5 channels** when the `direct` (unattributed — no fbclid/ttclid/Klaviyo tag) bucket has revenue, showing its acquisition revenue + count with spend/ROAS "—"; it is **deliberately excluded** from the header "attributed" total, blended ROAS, and `computeAggregate` (direct is unattributed, so it must not inflate ad metrics). `google`/`other` buckets are not surfaced as rows. Brand logos are inline SVG (`src/components/admin/ui/PlatformLogos.tsx`, now incl. `"direct"`). The dedicated Facebook Ads tab + ads-health views are untouched.
- **`MembershipCard`** — past-due badge shows `{n} past due · {moneyExact(totalPastDueRevenue)}` (exact money as of 2026-06-03; was `fmtCompact`). The header's past-due + paused badges **stack vertically on mobile** (`flex flex-col items-end … sm:flex-row`) so "paused" sits below "past due" instead of crowding beside it; they return to a row at `sm`. Donut arcs (`Donut.onSegmentClick`) + legend rows open `MembershipByPackageDetailModal` for that tier; users open via `useAdminUserModal`.
- **`RevenueBreakdownCard`** — bar rows (`BarList.onItemClick`) open `RevenueDetailModal` (`category` = source key); gets `dateRange`/`startDate`/`endDate`/`onUserClick` from `DashboardOverview`. Passes `equalLength` to `BarList` so every source renders a **full-length, uniform** bar (the per-source comparison is read from the `$value` + `count unit` labels, not bar length). `BarList` (2026-06-02): added an `equalLength?: boolean` prop (fill `100%` vs proportional `value/max`); the trailing `count + unit` label shows the **full** unit (no `slice(0,4)`) in a fixed `w-28 truncate` column (the bar track is `flex-1 min-w-0`, so the fixed label column keeps all tracks — and thus all bars — equal length).
- **`TopDrawsCard`** — wired via `useTopMiniDraws` (returns the full **active pool**, not a server top-5). **Ranked client-side by fill ratio** (`entries ÷ capacity`, uncapped, entries as tiebreak) and sliced to the top 5 — the draws **closest to drawing (100%)** surface first, not the ones with the most raw entries (the list route has no fill-ratio sort key). Subtitle: "Active draws · closest to drawing". Columns: **Mini Draw** (name + capacity bar + `fill%` underneath, bar capped at 100%) · **Entries** · **Status** (the `● Open` / `● At capacity` badge, moved out from under the name into its own right-aligned column). The capacity bar now renders on **mobile too** (the `hidden sm:block` was dropped). **Rows are clickable (2026-06-03):** clicking a row deep-links to `/admin/mini-draws?search=<encoded name>`; `MiniDrawManagement` reads `?search=` via `useSearchParams()` into its `searchTerm` initial state, so the draw is pre-filtered. Wired through a new optional `onRowClick?: (row) => void` prop on the kit `DataTable` (opt-in: adds `cursor-pointer` + a row `onClick`; other `DataTable` users are unaffected). Per-draw revenue isn't derivable, so omitted; "View all" → `/admin/mini-draws`.
- **`PrizePerformanceCard`** — manual **Sync** now syncs a bounded **last-14-day** window (Meta 500'd after 31s pulling all-time).

## Per-platform hourly breakdown — analytics tabs (Part B, 2026-06-03)

- **`PlatformHourlyRevenueSection`** (`src/components/admin/`) — shared hour-of-day section for an ad-platform tab. Takes the AEST window as **`startDate`/`endDate` props** (owned by the parent `TikTokAdsManagement`/`SnapchatAdsManagement` via `useAdminDateFilter` — see the date-filter section below), calls `useHourlyRevenue({ platform, startDate, endDate })` (SHARED-1 endpoint, which now also returns per-hour **spend**), and renders four `MetricCard`s (Ad Spend, Attributed Revenue, Conversions, ROAS) + a 24-row hourly table (profit = revenue − spend, ROAS = revenue ÷ spend). Where a platform has **no spend source** (Snapchat, or TikTok before its creds), Spend/Profit/ROAS render **"—"** (not 0) and the subtitle notes spend arrives with the Marketing-API sync. **TikTok spend** comes from `src/services/admin/tiktok/tiktokHourlySpend.ts` (graceful — inert without `TIKTOK_ADVERTISER_ID`/`TIKTOK_MARKETING_ACCESS_TOKEN`; **unverified against the live API** until creds exist).
- **`HourlyBreakdownTable`** (exported from `PlatformHourlyRevenueSection.tsx`, **shared by TikTok/Snapchat, Klaviyo, and All-Platforms**) — the hourly table is a **hand-rolled `<table>` styled to match the Facebook Ads `HourlyBreakdownSection`** (NOT the generic `DataTable`), so the four tabs stay visually in lockstep with Facebook. **Mobile single-view (no horizontal scroll):** the five columns **Hour · Spend · Rev · ROAS · Conv** are always visible; **Profit** sits behind a `sm:hidden` **"Show more / fewer columns"** toggle (`hidden sm:table-cell`), exactly like Facebook. **Threshold colors copied verbatim from Facebook:** profit ≥ 0 → `text-emerald-600 dark:text-emerald-400`, < 0 → `text-red-600 dark:text-red-400`; ROAS ≥ 2 → emerald, ≥ 1 → default (`text-gray-900 dark:text-white`), < 1 → red; Revenue is `font-semibold` default. Text sizes/padding match FB (`text-xs sm:text-sm`, `py-1.5 px-0.5 sm:py-3 sm:px-4`, `min-w-[300px] sm:min-w-[560px]`). Each caller still builds its own rows (`{ id, label, spend, revenue, profit, roas, conversions }`) from the SHARED-1 buckets; owned/no-spend rows pass `null` spend/profit/roas → "—". Presentation-only — no data/hook changes.
- **Facebook Ads tab — hourly section**: its `HourlyBreakdownSection` is unchanged in the UI, but `/api/admin/facebook-ads/hourly-insights` now sources per-hour **revenue + conversions** from the server-side `meta` slice of SHARED-1 (`convertingPlatform === "meta"`, exclusive `$lt` AEST bounds), **not** `utm_source`. Its FB-spend merge and the **separate Meta-reported insights table are untouched** (kept for pixel/CAPI-vs-server comparison).

## TikTok Ads tab — per-ad spend breakdown (2026-07-16)

`TikTokAdsManagement` (`src/components/admin/`) now renders **two** views over the same `useAdminDateFilter` AEST window: the existing `PlatformHourlyRevenueSection` (attributed revenue by hour) **and** the new **`TikTokAdBreakdownTable`** below it.

- **`TikTokAdBreakdownTable`** (`src/components/admin/`) — spend table, the TikTok analogue of the Meta "Ads" / Spend-by-URL tables **and their level switcher**.

  **Campaign / Ad set / Ad switcher (2026-08-11).** A segmented control in the section header regroups the same window; `level` is part of the React Query key, since the rows are a different grouping of identical data and sharing a key would serve campaign rows to the ad view until refetch. Three details worth preserving:
  - The header, the first column label and the row identity all render against **`data.level` (what came back), never the selected level** — otherwise the headers flip to "Campaign" while the previous level's rows are still on screen.
  - `rowIdentity()` derives the title and sub-line together in one function, so the two lines can never disagree about which level is being shown: at ad-set level the title is the ad set and the sub-line is its campaign; at campaign level there is no parent to show.
  - **The totals row does not change between levels** — by construction, each stored row is one ad-day landing in exactly one bucket. Switching level changes the split, never the money.

  Columns: **Ad / Ad set / Campaign** (name + a parent sub-line, falling back to `Ad {adId}`) · **Spend** · **Impr.** · **Clicks** · **Conv.** · **TikTok rev.** · **ROAS** (`revenue ÷ spend`, `.toFixed(2)+"×"`), plus a totals `<tfoot>`. **Revenue is TikTok's OWN attributed value**, labelled **"TikTok rev."** exactly as the Meta table labels **"Meta rev."** — the platform's reported number, **NOT** first-party `PaymentEvent` sales. Money is `en-AU` AUD. Data via `useTikTokAdsInsights({ startDate, endDate, level })` ([`src/hooks/queries/admin/useTikTokAdsInsights.ts`](../../src/hooks/queries/admin/useTikTokAdsInsights.ts), mirrors `useFacebookAdsInsights`) → `GET /api/admin/tiktok-ads/insights` (gated `facebookAds.view`). **Truthful empty states** (2026-07-24, panel F-002 — driven by the response's `syncHealth`, via `emptyStateMessage()`): not configured → "TikTok Marketing API isn't connected yet…" (never surfaces raw env-var names to staff); last run errored → red "TikTok spend sync is FAILING — last attempt {AEST time}: {TikTok message} (code {N})"; last run ok but zero rows → "Synced {AEST time} — no TikTok ad spend recorded for this range."; configured with no run yet → "Waiting for the first TikTok spend sync (runs nightly)." When rows EXIST but the latest sync attempt failed, an amber banner above the table flags the figures as possibly stale. Fed nightly by the `/api/cron/sync-tiktok-ads` sync (infrastructure domain) into `TikTokAdInsightsDaily`; see [backend.md](./backend.md#tiktok-ad-level-insights-per-ad-spend-breakdown) + [api.md](./api.md#tiktok-ad-level-insights-per-ad-breakdown).

## TikTok Ads tab — Ads / Spend-by-URL sub-views (2026-07-29)

`TikTokAdsManagement` now mirrors the Facebook Ads tab's view switcher with two sub-views over the same `useAdminDateFilter` AEST window:

- **Ads** — the existing `PlatformHourlyRevenueSection` + `TikTokAdBreakdownTable`.
- **Spend by URL** — **the same `SpendByUrlSection` component the Facebook tab renders**, passed `platform="tiktok"`.

`SpendByUrlSection` gained an optional `platform?: SpendByUrlPlatform` prop (default `"meta"`, so the Facebook tab is byte-identical). It threads that platform through all three of its queries (`useSpendByUrlAnalytics`, `useSpendByUrlDetail`, `usePackagesFocusBreakdown`), through the sync POST body, and through its user-visible labels ("Sync from TikTok", "TikTok revenue"). **Sharing the component rather than forking it is the point**: a fix to that table lands on both platforms, and the two tabs cannot drift into disagreeing about the same underlying `LandingPageMetricsDaily` rollup.

**There is no TikTok Health sub-view, deliberately.** Meta's verdict engine
([`src/services/facebook-ads-health/verdictEngine.ts`](../../src/services/facebook-ads-health/verdictEngine.ts)) reads `learningStatusBucket`, `learningStatusRaw`, `daysSinceLastSignificantEdit`, `daysInLearningLimited` and `lastBudgetChangePct` — all sourced from Meta's `learning_stage_info` / `last_significant_edit` adset metadata. TikTok's Marketing API exposes no equivalent, so a TikTok health tab would either be missing its primary signal or silently substitute a weaker one and present it with the same confidence. Left out until the inputs exist; `src/services/facebook-ads-health/types.ts` already notes that other platforms define their own equivalents.

For reference, a live probe of TikTok's `/report/integrated/get/` on 2026-07-29 confirmed **33** additional metric names are available beyond the 11 currently synced — including `cpc`, `cpm`, `ctr`, `reach`, `frequency`, `cost_per_conversion`, `conversion_rate`, `result` / `cost_per_result` / `result_rate`, `total_landing_page_view`, `landing_page_view_rate`, `initiate_checkout`, and the video-engagement family (`video_watched_2s/6s`, `average_video_play`, `engaged_view`). `add_to_cart` and `cost_per_add_to_cart` are **not** valid for this account (code 40002). None of these are synced yet — they are recorded here so the next person doesn't have to re-probe.

## Klaviyo analytics tab (Part C, 2026-06-03)

- **`KlaviyoAnalyticsManagement`** (`src/components/admin/`) — new **Klaviyo** tab (Analytics group, gated `facebookAds.view`). Balanced layout: (1) a "scheduled / about to send" strip (upcoming Scheduled campaigns + live Flows), (2) **Campaigns** + **Flows** revenue tables ranked by **Klaviyo-attributed** revenue with an **email / SMS** split, (3) the **server-side** Klaviyo hourly revenue (`useHourlyRevenue({ platform: "klaviyo" })`, SHARED-1) rendered via the shared **`HourlyBreakdownTable`** — Klaviyo is an owned channel, so Spend/Profit/ROAS render **"—"** (rows pass `null`). Data via `useKlaviyoAnalytics` → `GET /api/admin/klaviyo/analytics` (SHARED-2). A footnote makes clear the campaign/flow revenue is Klaviyo's own attribution and won't equal the server-side `convertingPlatform=klaviyo_*` hourly. **Date filter (2026-06-03):** a **relative-range pill selector** (Last 7 / 30 / 90 days / 12 months) — NOT the standard `DateRangeDropdown` — because Klaviyo's Reporting API is keyword-timeframe based (`KlaviyoTimeframeKey`). The selected keyword drives the campaign/flow tables natively **and** is converted to a trailing AEST `start/end` window (`aestRangeForKeyword`, `days-1` inclusive → today) for the hourly section, so one control moves both. No auto-refresh (Klaviyo reporting is throttled).

## All-Platforms aggregate tab (Part D, 2026-06-03)

- **`AllPlatformsManagement`** (`src/app/admin/component/`) — new **All Platforms** tab (first in the Analytics group, gated `facebookAds.view`). **Ad-effectiveness only (renewals excluded).** KPI rollup from **`computeAggregate(stats.attributedRevenue)`** (SHARED-3, client-side, unit-tested in `advertisingCardModel.test.ts`): Total Ad Spend, Attributed (acquisition) Revenue, **Overall ROAS** (paid channels with spend ÷ their revenue — mirrors the overview card's blended ROAS so they reconcile), **Contribution** (`revenue − ad spend`, sign-aware), Conversions. Below: the reused **`AdvertisingPlatformCard`** for the per-platform breakdown (so the Direct row + full-currency formatting appear here too), and the server-side hour-of-day table (`useHourlyRevenue({ platform: "ad-channels" })`, SHARED-1 — the 5 ad channels, matching the KPI scope so the two reconcile) rendered via the shared **`HourlyBreakdownTable`**. **Date filter (2026-06-03):** the standard `AdminDateRangeToolbar` (default **today**); KPI stats use `useAdminDashboardStats(df.dateRange, …)` (passing the preset, so the API self-resolves today/all-time/draw windows) and the hourly query uses the same resolved AEST `start/end`, so the two reconcile. All-source/total (incl. renewals) revenue stays on the Overview revenue card.

### Shared admin date filter (2026-06-03)

- **`useAdminDateFilter(initial)`** (`src/hooks/useAdminDateFilter.ts`) + **`AdminDateRangeToolbar`** (`src/components/admin/`) — packages the date-preset logic the Facebook Ads tab does inline so the **All-Platforms / TikTok / Snapchat** tabs share **one** source of truth for the AEST math (every preset — today / yesterday / current-draw / last-draw / all-time / custom — resolves to `yyyy-MM-dd` in `Australia/Sydney`; the initial preset resolves synchronously so date-gated queries enable on first paint, draw presets fill in via an effect once `useCurrentAndLastDrawDates` loads). The toolbar renders the shared `DateRangeDropdown` + `CustomDateRangeModal`, portaling into the mobile header slot when the tab is in `ADMIN_TABS_WITH_MOBILE_LAYOUT_DATE_TOOLBAR` (now includes `all-platforms`/`tiktok-ads`/`snapchat-ads`), else inline. Local state only (no URL sync). _(Superseded 2026-08-19 — URL sync is now opt-in via `{ syncToUrl: true }`, the Overview uses it, and the toolbar is sticky on desktop.)_ The **Klaviyo** tab does **not** use this — it has its own keyword selector (above).

## Overview MER card — platform selector + mobile text sizing (2026-06-04)

Presentation-only tweaks to four Overview section cards under `src/app/admin/component/overview/sections/`. No data/hook/route changes.

- **`MerByDrawCard`** — the platform selector (TikTok / Meta / Snapchat) is now the shared admin **`Dropdown`** (`src/components/modals/ui/Dropdown.tsx`, `compact`) instead of the `Segmented` pill toggle, matching the dropdown style used by `UsersManagement` / `ErrorReportsManagement` filters. Same `value={platform}` / `onChange` (cast back to `MerAdPlatform`), same `MER_TOGGLE_OPTIONS`. The `Segmented` import was dropped from this card.
- **Mobile text shrink** — the four cards' mobile (pre-`sm:`) text now matches the Revenue Breakdown card (titles `text-[15px] sm:text-base` via shared `SectionTitle`; row labels / `$`-values `text-xs` on mobile). Changes are responsive (`text-xs sm:text-sm`, `text-base sm:text-lg`) so desktop sizing is unchanged:
  - `AdvertisingPlatformCard` — Blended-ROAS value `text-lg` → `text-base sm:text-lg`; platform/spend/revenue/ROAS cells gained `text-xs sm:text-sm`.
  - `MerByDrawCard` — main table `text-sm` → `text-xs sm:text-sm` (header `th` cells and the expanded breakdown sub-table keep their explicit `text-2xs`/`text-xs`).
  - `TopDrawsCard` — draw-name + entries cells gained `text-xs sm:text-sm`.
  - `UpcomingRenewalsCard` — member-name + amount values `text-sm` → `text-xs sm:text-sm`.
  - The shared `SectionTitle` (in `Card.tsx`), `DataTable`, and the `KpiGrid` Ad-Spend/ROAS tiles were **not** touched.

## 2026-07-20 — Tier-2 perf: Poppins codemod

Components in this domain were touched by the sitewide `font-'[Poppins]'` → `font-poppins`
codemod (`npm run sweep:font-poppins`). Their Poppins-classed text now renders **real Poppins**
instead of a browser fallback — an intended visual change. Details + rules:
docs/shared-ui/tailwind-conventions.md §10.

## Overview KPIs: Ad Spend / ROAS are all-platform (2026-07-29)

The **Ad Spend**, **ROAS**, and **New-Member ROAS** cards in `KpiGrid.tsx` read `stats.adTotals` (every ad channel with a spend feed) instead of `stats.facebookAds` (Meta only). Before TikTok's spend sync went live those were the same number; now they are not, and the Meta-only version understated company ad spend.

- **Ad Spend** — subtitle names the platforms actually contributing spend (e.g. "Meta + TikTok ad spend"), derived from which `attributedRevenue` entries carry `adSpend > 0`, so the headline is never ambiguous about what it includes. Falls back to "All ad platforms".
- **ROAS** — subtitle "Platform-reported · all ads". Deliberately still the platform-reported figure (see [backend.md](./backend.md#adtotals--all-platform-ad-spend--roas-for-the-headline-kpis-2026-07-29)); the server-attributed view lives on the Advertising card as **Blended ROAS** and the **ROAS · server** column.
- **New-Member ROAS** — its denominator was Meta-only while its numerator counted new-membership revenue from every channel; now uses `adTotals.spend`.

`KpiGrid` deliberately does **not** read `stats.facebookAds` — that field stays Meta-scoped for the Norm gateway.

## A/B experiment results — sentinel experiments hide the legacy panels (2026-07-29)

`ExperimentResultsDashboard` renders three result blocks, but only the top one is current:
the **user-level Bayesian** card reads durable tables, while **Variant Comparison** and the
**Statistical Significance** / **Winner Determination** blocks below it are the previous
generation, computed from TTL'd `ExperimentEvent` rows.

For a **non-conversion sentinel** experiment (`__promo-theme__`, `__membership-theme__`)
the legacy blocks can never have data — those experiments are deliberately excluded from
purchase attribution — so the chi-square divided by zero and rendered a red
`Lift 0.00% — Decline vs control` immediately beneath a Bayesian card reporting a 97%
chance to win.

The dashboard now takes an optional `slugTargets` prop and, via
`isNonConversionSentinelExperiment()`, suppresses the two guaranteed-misleading blocks and
the conversion/revenue rows in Variant Comparison, replacing them with a short explanation.
**Engagement figures (visitors, clicks, CTR) still render** — they are real, and the
Bayesian card does not show them. Nothing changes for wildcard or slug-targeted
experiments.

The experiment list's target label also special-cases sentinels: `slugTargets.length` made
a site-wide experiment read as "1 page(s)", so sentinel targets now render
"Site-wide (promo pages)".

The sentinel registry lives in `src/lib/ab-testing/non-conversion-sentinels.ts` — a module
that imports nothing, so both the admin UI and the server-side attribution logic can read
it. Do **not** import it from `src/utils/ab-testing/get-user-experiment-assignment.ts` in a
client component: that module pulls in mongoose and the repositories. See
[docs/ab-testing/gotchas.md](../ab-testing/gotchas.md).

## Draws modals grouped under `modals/draws/` (2026-07-30)

The eight modals reachable from the four draws tabs (`major-draw`, `mini-draws`,
`draw-results`, `upcoming-draws`) moved out of the flat `src/components/modals/` list into
[`src/components/modals/draws/`](../../src/components/modals/draws/), behind an `index.ts`
barrel. Pure relocation — no behaviour changed. The convention is documented in
[shared-ui architecture → Modal folder layout](../shared-ui/architecture.md).

| Modal | Opened from |
|---|---|
| `WinnerSelectionModal` | Major Draw, Mini Draws card, Draw Results row |
| `WinnerEditModal` | Major Draw, Mini Draws card, Draw Results |
| `ParticipantsModal` | Major Draw → View participants; Mini Draws card → **People** (2026-08-13) |
| `ExportModal` | Draw Results row → Export |
| `AdminMajorDrawModal` | Overview → Quick actions (create) |
| `MajorDrawEditModal` | Draw Results, Upcoming Draws (edit) |
| `AdminMiniDrawModal` | Mini Draws toolbar (create) |
| `MiniDrawEditModal` | Mini Draws card (edit) |

Import from the barrel, not a deep path:

```ts
import { WinnerSelectionModal, type WinnerSelectionData } from "@/components/modals/draws";
```

**Create and edit stay separate for major draws — this is deliberate, do not "simplify" it.**
`AdminMajorDrawModal` owns the `/api/admin/major-draw/scheduled-months` restriction (so a
month cannot be double-booked), the 8:30 PM AEST draw-date default, the activation-date
derivation from the previous draw, the −30-minute freeze derivation, and the 30-minute
freeze↔draw discrepancy warning. `MajorDrawEditModal` owns `configurationLocked` gating and
has **none** of that. There is no shared behaviour to collapse, so a `mode` prop would fork
most of the component and put a live create flow and a live edit flow in one blast radius.
They share **field sections**, not a mode flag. The same reasoning does *not* apply to the
mini-draw pair, whose field sets are identical.

`ConfirmationModal` deliberately stayed at `src/components/modals/` — 20+ non-draws callers.

## Draws pages revamp — shared primitives under `components/admin/draws/` (2026-07-30)

The four draws tabs (`major-draw`, `mini-draws`, `draw-results`, `upcoming-draws`) were rebuilt to
the `design_handoff_admin_draws` specification. **No routing, permission or schema change** — the
tabs still render inside `AdminPage.tsx` via the `[tab]` dynamic route.

### What the shell does and does not own

`AdminPage.tsx` keeps the 280px sidebar, mobile drawer, hamburger, top bar and scroll container —
those are shared with 25 other tabs and were **not** rebuilt. The revamp lives entirely inside the
tab components plus [`src/components/admin/draws/`](../../src/components/admin/draws/).

| File | Owns |
|---|---|
| `tokens.css` | The `.admin-draws` scoped custom-property block (see [shared-ui tailwind-conventions §11](../shared-ui/tailwind-conventions.md)) |
| `DrawsPageShell` | Padding/gap rhythm **and the `.admin-draws` class** — the token scope boundary |
| `DrawsListPage` | KPI strip → toolbar → split view; mobile detail sheet |
| `DrawsTable` | 7-column grid, sticky header + group headers, all four data states |
| `DrawInspector` | The fixed 320px panel / mobile sheet content |
| `DrawsToolbar` | Search input, filter dropdowns, action buttons |
| `DrawsKpiStrip`, `DrawStatusPill` | KPI cells; the 21px status pill |
| `MiniDrawCard` | One mini-draw card (extracted from the 935-line page component) |
| `DrawStatusRibbon`, `DrawGatesCard`, `EntryPoolCard` | Major Draw page pieces |

**These own layout only.** Fetching, filter state, pagination and every modal stay in the page
containers — they already owned that logic and splitting it would put one piece of state in two
files. There is deliberately no `useDrawsListState` hook.

### `DrawsPageShell` cancels AdminPage's padding — and must

It applies `-m-4 lg:-m-6` to cancel `AdminPage`'s own `p-4 lg:p-6`, so `--m-pad` is the single
source of padding truth (the design specifies 20px desktop / 14px mobile). Note the negative
margin uses **`lg:`** (1024px), mirroring AdminPage's own breakpoint — *not* the `draws:` (900px)
breakpoint. They must match AdminPage's, or the two paddings stop cancelling between 900–1024px.

### Draw Results and Upcoming Draws are one component, two configs

Both render `DrawsListPage`. Differences are config only: KPI labels, filter sets, grouping
(Results by year; Upcoming by Live now / Scheduled), column 6 header (`Winner` vs `Gate`), and the
inspector primary. If a change to one needs a new shared component, that is a signal the split is
wrong — fix the primitive rather than forking.

**Upcoming keeps its two-call fetch.** "All" (queued + active) fans out into two parallel requests
because the API's Zod schema takes a single status enum. `stats.totalRevenue` is summed across both
responses, like every other stat on that path.

### Desktop rows and mobile cards are separate markup, one handler

`DrawsTable` renders a `DesktopRow` and a `MobileCard` per row, both calling the same `onSelect`.
The handoff flags this as the defect most likely to ship — wire only one and the other silently
goes dead. Same for the inspector: the desktop panel and the mobile bottom sheet render the *same*
`DrawInspector` with the same props.

### The four table states are built together

`loading` (six skeletons on the real column grid, `aria-busy`), `empty` (names the filter as the
cause + `Clear filters`, which clears the **search query too**), `error` (reassures that retrying
is safe, shows the **real** endpoint — the handoff's sample `/api/admin/draws` does not exist here),
and `ready`. The shell, KPI strip, toolbar and inspector do not move between them.

### Deliberate divergences from the design

| Design says | We ship | Why |
|---|---|---|
| KPI delta chips (`+9%`) | No deltas | No prior-period data exists; a fabricated movement figure on an ops dashboard is worse than none |
| Entries sub-line `+2,714 in 24 h` | Omitted | Same — no 24-hour delta in the data |
| `Edit prize` on Major Draw | Omitted | The card renders the **static** `src/config/prizes` prize; `MajorDraw.prize` is `@deprecated`. The button would edit a different field than the one shown |
| Participants list read-only | Rows stay clickable | They open the admin user modal today; losing a working drill-through to match a visual spec is a net regression |
| Mini-draw card: 2 actions | 4 actions | `CSV` and `Edit winner & testimony` exist and are used on draw night |
| No slot for `Remove winner` | Subordinated danger row in the inspector | Hairline-separated, `--danger`, only when a winner exists — keeps the design's three actions intact |

### Capabilities preserved (verify these after any further change)

Draw Results: Select Winner · Edit Winner · **Remove winner** (incl. the "Winner record ID not
found" fallback) · Edit Draw · Export · Status/Winner/Sort filters · search · pagination · winner →
admin user modal. Mini Draws: Winner · CSV · Edit winner & testimony · card→edit · delete ·
**reorder** (drag, Save order, Discard, dirty guard) · the `?search=` deep link from Overview.
Major Draw: winner gating by status · export gated off `cancelled` · winner display · edit-winner ·
permission gates · lock notice.

### Locked draws route through one guard

`UpcomingDraws.openDrawEditor()` is the single edit gate: a `configurationLocked` draw opens
[`DrawLockedModal`](../../src/components/modals/draws/DrawLockedModal.tsx) instead of the form.
Inspector primary and the `Edit draw` secondary both call it. Add a new edit entry point and it
must call this, not `setIsEditModalOpen` directly.

### Search is server-side and debounced

All three search boxes hit the API so results span every page, not just the loaded one. The fetch
callback is keyed on the **debounced** value (300ms) — without that, a five-letter query fires five
requests.

## All eight draws modals on `DrawModalShell` (2026-07-30)

Every modal reachable from the four draws tabs now renders through
[`DrawModalShell`](../../src/components/modals/draws/DrawModalShell.tsx): one header
(eyebrow + title + close), one scrolling body, one `--panel2` footer with the actions
right-aligned, one pending treatment, and the mobile bottom-sheet presentation.

| Modal | Title | Primary |
|---|---|---|
| `WinnerSelectionModal` | Record the winner | Publish winner |
| `WinnerEditModal` | Edit winner & testimony | Save changes |
| `AdminMajorDrawModal` | Create major draw | Create draw |
| `MajorDrawEditModal` | Edit draw | Save draw |
| `AdminMiniDrawModal` | New mini draw | Create mini draw |
| `MiniDrawEditModal` | Edit mini draw | Save mini draw |
| `ExportModal` | Export participants | Download CSV / XLSX |
| `ParticipantsModal` | Participants | Close |
| `DrawLockedModal` | This draw is locked | Got it |

### What moved, and what deliberately did not

The **actions** moved out of each form's body into the shell footer. Because the shell's
primary sits **outside** the `<form>`, each `handleSubmit` lost its `FormEvent` parameter and
is now invoked directly (`onPrimary={() => void handleSubmit()}`). The validation and submit
bodies are otherwise untouched.

**Transport was not unified.** Create and edit still differ per pair and that is intentional:

| | Create | Edit |
|---|---|---|
| Major | fetches `/scheduled-months`, derives activation + freeze from the draw date, warns on a ≠30-minute gap | `configurationLocked` gating; no derivation |
| Mini | `File[]` → `multipart/form-data`, self-submits | `string[]` URLs → JSON, delegates via `onSave` |

Collapsing either pair behind a `mode` prop would fork the image handling, body encoding and
submit ownership — everything except the labels. See the Task 11 note in
[the plan](../superpowers/plans/2026-07-30-admin-draws-revamp.md).

Shared **presentation** is factored into [`fields.tsx`](../../src/components/modals/draws/fields.tsx)
(`FieldLabel` / `FieldHint` / `FieldError` / `TextField` / `SelectField` / `FormSection` /
`FieldRow`) — markup only, no submit logic, which is why it is safe to share where a form
component is not.

### Mobile tap targets in the forms

The draws forms reuse `src/components/modals/ui` `Input` / `Select` / `DateTimePicker`, which
render ~42px and are used by 50+ other modals. Rather than edit those, `tokens.css` sets a
`min-height: var(--m-field)` floor **scoped to `.admin-draws`** below 900px. Two deliberate
exclusions:

- `input[type="search"]` — those sit `align-self: stretch` inside an already-44px bordered row,
  so the row is the target; a floor would push it past 44px.
- `<button>` — the `RichTextEditor` formatting toolbar is ~32px by design. A dense
  bold/italic/align toolbar is not the control class the 44px rule addresses, and stretching it
  would wreck the editor.

Verified in the browser at 390px: **60 form fields across all eight modals, zero under 44px.**

### Sort dropdowns removed from the list pages

Draw Results and Upcoming Draws no longer expose a Sort control. Results is always
newest-draw-first and Upcoming soonest-first — the only orders those screens are read in — so
the dropdown cost toolbar width without earning it. `sortBy` / `sortOrder` are still sent to
the API, fixed as `DEFAULT_SORT_BY` / `DEFAULT_SORT_ORDER` in each container.

## Product variants — size-run quick add (2026-08-17)

`AdminProductModal` adds apparel variants a size **run** at a time: pick a colour, tick the
sizes, and rows are generated with a consistent SKU (`STAP-TEE-BLK-L`, derived from the product
name and colour). Re-running it for a second colour keeps everything already entered and skips
SKUs that already exist.

It replaced hand-typing one row per size. A tee in five sizes meant five near-identical rows and
getting the SKU pattern right five times — slow, and the easiest place in the form to typo.

### What each variant field actually controls

| Field | Owned by | Consequence of getting it wrong |
|---|---|---|
| `sku` | **Us.** Identifies the line on an order and the receipt; the cart keys a product line on `(productId, sku)` | Two sizes collapse into one cart line, or a duplicate is rejected on save |
| `size` / `colour` | **Us**, but constrained by what the print provider stocks | These are what the customer picks on the product page **and** what the shop's Size/Colour filter rail is built from — an empty colour means the product never appears under a colour filter |
| `gtin` | **The print provider.** Their catalogue decides which blanks exist | **An incorrect GTIN prints the wrong garment.** Check it against their catalogue rather than guessing. Blank is safe — it is only needed to submit an order for printing |

### Where merchandise actually comes from

Worth stating because it is easy to assume the reverse: **products are authored here, not
imported from the print provider.** Name, price, images, description, included entries and which
size/colour combinations to sell all live in our catalogue. The provider's role is fulfilment —
we send them an order referencing a **GTIN** plus artwork we host.

So the provider's catalogue constrains *which colours are possible*; it does not supply the
product page. Changing a colour offering is an admin edit here (add or deactivate a variant),
not a sync. See [print-provider-fulfilment spec](../superpowers/specs/2026-08-17-print-provider-fulfilment-design.md)
— note that spec records the order API as unreachable, which was true when written and was
corrected on 2026-08-20: order submission is available on the provider's GraphQL surface. Either
way it never blocked authoring or selling, only automated order submission.

## Send to printer — the fulfilment queue (2026-08-17)

`FulfilmentQueue` sits under the catalogue on the **Products** tab. It is the manual hand-off to
the print provider. It was built because the provider's order API appeared unreachable — every
GraphQL path 404'd while our key authenticated fine.

**That is no longer true (2026-08-20).** The provider resolved the 404 and confirmed order
creation lives on GraphQL (`createOrder` / `createOrderFromGtin`) behind a second key,
`RIVERR_GRAPHQL_API_KEY`, with `RIVERR_SHOP_ID` now populated. An API adapter would sit behind
the same service boundary this queue uses, so replacing the manual step changes
`fulfilmentExport.ts` and not this screen. **Until that adapter exists and has been tested,
CSV remains the real path** — nothing below has changed.

The loop: **Download CSV → upload it on their site → Mark as sent.**

### Download and Mark are two buttons, deliberately

Marking on download would hide a paid order from the next export whenever a download failed or
was cancelled — a garment that silently never gets printed. Making the admin confirm the upload
actually happened trades that for a possible double upload, which is visible and recoverable.

`Mark as sent` stamps `submittedAt`, which is what the export filter excludes on, so it is the
guard against printing the same garment twice. It asks for confirmation because a reprint costs a
real garment and real freight, and it is gated on `shop.edit` (the download only needs
`shop.view`) and audited server-side.

### Missing GTINs are surfaced before the download

A variant with no `gtin` exports with an empty `product_id`, which the provider cannot match. The
panel counts those lines and names the first eight, so the gap is fixed in Products *before* the
upload rather than discovered as a rejected file on their site. The order is still exported —
withholding a paid order silently is the worse failure.

### What it does not do

Tracking does not come back automatically. "Ship through the app" means labels are created on
their side; nothing tells this database an order shipped, so status stays `processing` until
someone updates it. That is the next gap to close if this workflow stays.

## Tracking numbers close the CSV loop (2026-08-17)

The `Orders` panel takes a tracking number inline per row. `PATCH /api/admin/shop/orders`
persists it and **flips the status to `shipped` automatically** when a tracking number arrives
without an explicit status — a human who has just pasted a tracking number should not have to
remember a second field for the customer to see the right thing.

This closes the gap the CSV fulfilment path leaves open. The print provider creates labels on
their side and nothing tells this database the parcel moved, so without it an order sits at
`processing` forever and the customer is never told it shipped. The number then renders on the
customer's own order page.

Audited (`requirePermissionWithAudit`, `shop.edit`) because it is what a customer sees, and "who
marked this shipped" is a real support question.

Draft values are held per order id in local state, so typing in one row never disturbs another
mid-edit.

## Orders in the dashboard nav

`/my-account/orders` is in `DASHBOARD_NAV` with `desktopOnly: true`.

The mobile bottom bar is a fixed five-item layout built around a raised centre item; a sixth
entry does not fit and squeezing one in degrades every other tap target. So the sidebar shows it
on desktop, and mobile reaches it from a Package button in `DashboardHero` beside Settings —
exactly the pattern Settings itself already uses for a route that is not in the bar. The button is
hidden for guests, who have no orders and would land on an empty page.

`BottomNav` filters `desktopOnly` items out; `DeskNav` renders the full list.

## Shop orders: detail, refund, and the Stripe id (2026-08-19)

`OrdersManagement` used to declare its own local `OrderRow` type. That duplicate
is why adding `paymentIntentId` to the service projection changed nothing — the
field was serialised on every admin page and thrown away. It now imports
`OrderListItem` from `orderQueries`, so a field added to the service reaches the
UI without a second edit.

`OrderDetailModal` carries the detail view and the refund flow. Refund is gated
`shop.delete` on both sides — the same permission
`POST /api/admin/shop/orders/refund` enforces, so a staff member who cannot
refund never sees a button that will 403.

**Full-vs-partial comes from the server.** The modal used to infer it from what
it asked for, but a "partial" refund typed at exactly the order total IS a full
refund in `refundShopOrder`, and cancels the order out of the fulfilment queue.
The response now carries `wasFull` and the modal reports that, so staff are never
told an order is still live when it has just been cancelled.

**Known gap:** the delivery address is still not visible. `listOrders` projects
only `shippingAddress.firstName` and `.lastName`, so once an order is stamped
submitted — which removes it from the fulfilment CSV — nothing in admin can
answer "where was this sent?". Closing it means adding the rest of
`shippingAddress` to the `isAdminSurface` branch of the projection; the modal's
Delivery section is already built and says plainly what is missing rather than
rendering a blank that reads as a data fault.

## Merchandise entry multiplier panel (2026-08-20)

`components/admin/ShopEntryMultiplierPanel.tsx`, the whole of **Shop → Entry Multipliers**.

**All three tiers are editable on this one page** — whole shop, per category, and per product —
and they save together on one button through one endpoint. The per-product ceiling *also*
appears on each product's edit form, which is the natural place to set it while editing that
product; the list here exists so an admin can see every ceiling at once rather than opening
eight modals to find out which products are capped.

Saving all tiers through a single `PUT` is deliberate: writing product ceilings through the
product routes instead would mean one request per changed row, and a partial failure would
leave the page showing ceilings that were never written.

Controls are [`SelectMenu`](../../src/components/ui/SelectMenu.tsx), the repo's custom dropdown,
not a native `<select>` — matching every other admin surface. It has no `disabled` prop, so a
read-only admin (`shop.view` without `shop.edit`) gets the resolved value as plain text rather
than a dropdown that silently refuses to do anything.

It has a page to itself because it is a promo-shaped decision rather than a catalogue edit,
and it applies across the whole shop rather than to any one product. (The **per-product**
ceiling is a field on the product modal instead, next to `includedEntries`, because that one
genuinely is a per-product decision.)

Sets a **ceiling** on the promo multiplier for merchandise, shop-wide or per category (the
per-product one lives on the product modal). Merchandise inherits the one-time pack multiplier;
a ceiling can only hold it *below* that, never lift it above — which is what keeps a garment from
becoming a cheaper route into a draw than the packs, and why three tiers of control are safe
rather than three ways to get it wrong.

Categories are **offered from the catalogue, never typed**. `Product.category` is free text with
no enum and the data is already forked (`"Apparel"` beside `"power-tools"`), so a hand-typed key
would silently match nothing. The select's blank option is "No ceiling", and saving a blank
removes the row — a panel that can add a ceiling but not remove one is worse than no panel.

Reads `shop.view`, writes `shop.edit`; the save button is hidden without the latter.

## Destructive actions use ConfirmationModal, never window.confirm (2026-08-20)

`ProductManagement` (delete) and `FulfilmentQueue` (mark-as-sent, undo) asked through
`window.confirm`. That dialog is chrome-styled — it renders "localhost:3000 says", ignores the
admin theme entirely, and **blocks the JS thread** while open. It also cannot say *which* row is
about to go, which matters on a list that renders a Delete button per product.

They now use [`ConfirmationModal`](../../src/components/modals/ConfirmationModal.tsx).

**The porting trap:** `window.confirm` returns a boolean *inline*, so the handler could ask and act
in one function. A real modal cannot. Each pending action moves into state (`pendingDelete`,
`pendingAction`), the button only opens the modal, and the handler runs from `onConfirm` — it no
longer asks at all.

Type choice is deliberate: product delete is `type="delete"`; the fulfilment actions are
`type="warning"`, because neither destroys anything. Marking as sent moves orders out of the queue
(reversible via Undo) and Undo puts one back — the risk is a **duplicate print**, not a loss, and
the copy says so.

**Still outstanding:** roughly ten other admin components still call native `confirm()` — A/B
testing, affiliates, alternating multipliers, bonus-entry promos, error reports. Out of scope for
the shop work; listed here so the inconsistency is known rather than discovered.

## Products: search, filters and drag reordering (2026-08-20)

Ported from `MiniDrawManagement`, which already had all three — same `@dnd-kit` sensors, same
reorder-mode toggle with save/cancel, same client-side filtering.

**Search covers name, brand, category AND sku.** The sku matters most in practice: an admin
looking up a product usually has it from an order line or the printer's CSV, not the display name.

**Reorder mode is disabled while filtered**, and the button says why on hover. Positions are saved
as 1..N over the list being shown, so dragging a filtered subset would silently reposition every
row the admin cannot see. Entering reorder mode also hides the filter bar, and `visibleProducts`
falls back to the unfiltered list as a second guard.

**The drag handle is a separate control, not the whole card.** Product cards carry Edit /
Deactivate / Delete buttons, and a card-wide drag listener swallows their clicks.

`SortableProductRow` is declared at module scope: a component defined during render is a new type
every render, which would remount every card mid-drag.

Nothing is written until **Save order**; Cancel refetches, so the server stays the source of truth.

## Entry Multipliers — rates, not ceilings (2026-08-20)

Supersedes the ceiling description above. **Merchandise no longer inherits the one-time pack
multiplier**, so the panel sets the merch rate outright rather than capping an inherited one.

Same three tiers, same one-button save, same normalised category keys. What changed is the
meaning: a value here IS the multiplier, and the default is 1× rather than "whatever the promo
is doing".

**The panel no longer protects the pricing ladder.** Under the ceiling design it was impossible
to set merch above the pack rate. Now it is a number an admin types, so a rate that makes a
garment better value per entry than a pack is reachable. Worth a warning in this panel; there
is not one yet.

## Editing a 383-variant garment (2026-08-20)

`AdminProductModal` grouped every variant into one flat list. The Staple Tee carries **383
variants** — 51 colours by roughly 7 sizes — which mounted about 1,900 form controls and made the
modal unusable on staging.

Variants are now **grouped by colour, one group open at a time**, because the colour is the unit
an admin actually edits: a garment is stocked as a colour with a size run. A collapsed group is a
single summary button (`Black · 7 sizes · 7 active`), so the cost is 51 buttons rather than 383
forms. Measured after the change: **14 mounted inputs**, 49 with a group expanded.

A search box appears above 6 groups and matches **colour or SKU** — an admin arrives holding one
or the other, usually the SKU off an order line.

**Grouping is a display concern only.** Each row keeps its `index` in the flat `variants` array,
because that index is what `updateVariant` and `removeVariant` address. Reordering the array to
match the grouping would silently rewrite which variant an in-flight edit lands on. Verified by
editing one SKU inside a searched, expanded group and reading the document back: exactly one row
changed, it was the right one (Vapour / XS), and every other group was intact.

## Shop, not Merchandise (2026-08-21)

`ShopEntryMultiplierPanel`'s heading now reads **Shop entry multiplier**, and the
activity feed logs `Shop order (SHOP-…)`. See `docs/cart-shop-products/backend.md`
for the full rename and why already-written `PaymentEvent`s keep the old string.
## Mini draws: view participants in place, and jump to the live page (2026-08-13)

Two additions to the `/admin/mini-draws` card, both answering questions staff previously had to
leave the admin to answer.

### "People" — the entry-pool roster

Checking whether one person had entered meant **downloading a CSV of every entrant**, opening it,
and searching it. That is a spreadsheet of live customer PII on a laptop to answer a yes/no
question, and it happens most on draw night.

The card's **People** action now opens the same
[`ParticipantsModal`](../../src/components/modals/draws/ParticipantsModal.tsx) the Major Draw page
uses — searchable by name / email / mobile, 8 per page, rows drilling through to the admin user
record via `useAdminUserModal`.

**One component, two sources.** `ParticipantsModal` took `majorDrawId` / `majorDrawName`; it now
takes `drawId` / `drawName` / `drawType: "major" | "mini"` and picks the endpoint. The two APIs
were written to an identical response envelope specifically so this did not fork — a
`MiniDrawParticipantsModal` copy would drift the first time either side gained a column. The only
shape difference is `entriesBySource`, which is optional and major-draw-only: mini-draw entry is
package-only, so there is no source split to report.

The modal is mounted only while a draw is selected (`participantsDraw && <ParticipantsModal …>`),
so its fetch is always keyed to a real id rather than an empty-string placeholder.

Backed by `GET /api/admin/mini-draw/[id]/participants` — see [api.md](api.md).

### The external-link button

The card image tile carries a small `ExternalLink` button (top-right) that opens
`/mini-draws/{id}` — the live customer-facing page — in a new tab. It sits on the tile rather than
in the footer because it is navigation, not a draw action, and the footer is already four items
wide on a five-across grid. It `stopPropagation`s so it does not also fire the card's edit
handler, and it is hidden in reorder mode along with the rest of the actions.

### Permission gating

Both the roster and the CSV export are gated on **`miniDraws.viewParticipants`**, not
`miniDraws.view` — they return identical personal data, so `onViewParticipants` and `onExportCsv`
are both `undefined` without it and the buttons do not render. `MiniDrawCard` types both as
optional for that reason. UI gating is not the boundary: the routes enforce it independently.

Full rationale, and why this shipped with a backfill migration rather than as a plain new
permission: [auth/permissions-catalog.md](../auth/permissions-catalog.md).

## Mini draws: sort + brand filter (2026-08-13)

The page had a search box and four status chips and nothing else — no way to ask
"which draws are earning?" or "which are about to fill and need a winner queued?".
Both now run through `DrawsToolbar`'s existing dropdown mechanism, which
`MiniDrawManagement` previously passed no-ops to.

| Dropdown | Options |
|---|---|
| **Sort** | Display order · Most entries · Fewest entries · Closest to capacity · Furthest from capacity · Name (A–Z) |
| **Brand** | `All brands` + only the brands present in the lineup |

Four rules that keep it honest:

1. **"Display order" is the default and must stay first.** It is the drag-ordered
   lineup the customer site renders, and the only order reorder mode can safely
   write back.
2. **Reorder mode pins the grid to display order and hides the dropdowns.** The
   guard is in `filteredMiniDraws` (`if (isReorderMode || sortKey === "order") return rows`),
   not only on entry, so picking a sort *while already reordering* can't desync it
   either. See the gotcha below for what this prevents.
3. **The Brand dropdown is derived from the data** and renders only when the
   lineup actually holds more than one brand — no dead options, no pointless
   control on a single-brand lineup.
4. **Ties on fill % break by raw entries**, so a wall of 0% draws still ranks
   usefully instead of falling back to insertion order.

A "Showing N of M · sorted by …" line plus one **Clear filters** button appears
whenever anything is active. Sort and brand are far less visible than the status
chips (which carry their own counts), so without it an operator can be looking at
a subset without realising. The empty state's reset routes through the same
`clearFilters` — clearing only search + status would leave a brand filter on and
the button would appear not to work.

## Users breakdown — gender block + answered denominators (2026-08-17)

[`UsersBreakdownSection`](../../src/app/admin/component/overview/UsersBreakdownSection.tsx) now renders **four** blocks (`md:grid-cols-2 lg:grid-cols-4`): Age · State · Profession · **Gender**.

Every block states an **answered denominator** above its bars — `N of M answered (P%)` — because all four are driven by *optional* profile fields. Without it, a 12-person bar reads as 12 of every member when it is really 12 of however many answered. `M` is computed the same way the API's `meta.totalUsers` is (sum of `signupSource`) so the two cannot drift.

**The `answered` figure is not uniform across the four**, and this is deliberate:

| Block | Excluded bucket | Is the excluded bucket an answer? |
|---|---|---|
| Age | `Unknown` | No — no birthdate on record |
| State | `Unknown` | No — missing/unrecognised |
| Profession | `Other` | **Yes** — it is the long-tail bucket from `bucketUnmatched()`. Members with no profession are dropped by the service entirely, so the block's `grandTotal` is *already* the answered population |
| Gender | `Not set` | No — and it conflates "declined" with "never asked" |

**Why the bars are scoped this way rather than filtering the endpoint.** The request was to leave incomplete-profile users out of the breakdown. That is applied at **chart level only**. `signupSource`, `membershipStatus`, `membershipByPackage` and `purchaseHistory` still count **every** member, because the same `users` array feeds them: filtering the query would drop an active paying member who never set a birthdate out of the **active-member count**, and `meta.totalUsers` is the sum of `signupSource`, so the reported total would silently fall too — making `/admin` disagree with every other dashboard. A user-document filter would also not have helped performance meaningfully (the two `PaymentEvent` queries don't read that array at all, and the user query measures ~150ms for all 927 users).

## One date filter for every analytics tab — sticky, URL-synced (2026-08-19)

Phase 1 of the [Brand Performance spec](../superpowers/specs/2026-08-19-admin-analytics-brand-performance-design.md). The admin analytics surface carried **two** implementations of the same control; this collapses them to one.

**Removed:** `src/app/admin/component/overview/OverviewToolbar.tsx` (deleted), plus `DashboardOverview`'s own date state — four `useState`s, a `searchParams` sync effect, a ~40-line `updateDateFilter` with duplicated draw-preset branches, its `CustomDateRangeModal` instance, and its `useMajorDrawsForDateRange` call. All of it now lives in the shared hook + toolbar.

**The single control** is `AdminDateRangeToolbar` + `useAdminDateFilter`, now used by **every** date-filtered tab including the Overview.

- **Sticky on desktop.** The `isLgUp` branch is `sticky top-0 z-30` with `-mx-4 lg:-mx-6 -mt-4 lg:-mt-6` + matching padding, cancelling the scroll container's `p-4 lg:p-6` so the pinned bar spans the full content width and rows scroll *under* it. Previously only the Overview was sticky; All-Platforms / TikTok / Snapchat / Repeat-Purchases scrolled their filter off-screen.
- **Mobile is unchanged** and always-visible by construction — the dropdown portals into `ADMIN_MOBILE_DATE_TOOLBAR_SLOT_ID`, which `AdminPage` renders in the header *above* the scroll container.
- **`leading` prop.** Tabs with their own controls on that row (TikTok's Ads / Spend-by-URL switch) pass them as `leading` so they ride *inside* the sticky bar. See the footgun below for why they cannot simply share a wrapper.

⚠️ **Render `AdminDateRangeToolbar` as a DIRECT child of the tab's root element.** A sticky element can only travel within its own parent's box, so the old `<div className="flex justify-end">{toolbar}</div>` wrapper — sized to the control itself — pins it to nothing. All four consumers had that wrapper and all four were unwrapped. The second way to lose it silently is a clipping/containing ancestor (`overflow` ≠ `visible`, or `transform`/`filter`/`contain`). Neither failure throws; verify visually when adding a new tab.

The `backdrop-blur-sm` on the sticky bar *does* create a containing block for absolutely-positioned descendants, but `DateRangeDropdown` renders through the kit `Popover`, which already portals to `document.body` with `position: fixed` and re-places on scroll capture — so it escapes correctly. A future control added inside this bar must do the same.

**URL sync** is opt-in: `useAdminDateFilter("today", { syncToUrl: true })`. Only the Overview passes it, preserving the deep-linkable `?dateRange=&startDate=&endDate=` it already had; the other tabs keep local-only state. See [client-state](../client-state/patterns.md).

**AEST resolution is no longer forked.** `resolveAestDateWindow` (`src/utils/admin/`) is now the only preset → `yyyy-MM-dd` mapping; the hook's private `resolveRange` copy is gone and the util gained an optional 4th `drawDates` argument for the `current-draw`/`last-draw` presets. Dependency direction is util ← hook, never the reverse — the hook is `"use client"` and must never become a dependency of a plain util.

**Behaviour note:** the Overview's custom-range *trigger label* is now the hook's compact `"1 Jun – 30 Jun"` rather than its old `"Jun 1 - Jun 30, 2025"` — the same string the other four tabs already showed. The longer form is still used for the per-card KPI tag (`formatAbbreviatedDate`, kept local to `DashboardOverview`).

**Klaviyo and A/B Testing are deliberately still absent** from `ADMIN_TABS_WITH_MOBILE_LAYOUT_DATE_TOOLBAR`: neither uses this filter (Klaviyo drives its own `hourRange`; A/B Testing has no date filter). Adding them would mount an empty header slot.

## Prize performance → Brand performance (2026-08-19)

Phase 2 of the [Brand Performance spec](../superpowers/specs/2026-08-19-admin-analytics-brand-performance-design.md). `overview/sections/PrizePerformanceCard.tsx` is **deleted**; `overview/sections/BrandPerformanceCard.tsx` takes its slot in `DashboardOverview`.

**What changed and why.** The old card covered only the **toolset** lane (it parsed the first path segment of `/promotions/<slug>` and deliberately discarded the `-<toolbox>` suffix), and its revenue was **platform-reported** — so the four toolbox brands had no ROAS surface at all, and no view could answer "how much of this brand's return is new membership?".

**Three `Segmented` controls plus a Compare toggle**, no explanatory paragraphs:

| Control | Values | What it changes |
|---|---|---|
| Lane | Toolset / Toolbox | which brand axis groups the rows |
| Basis | Landing page / Built prize / Platform | where the OUTCOME figures come from |
| Platform | All / Meta / TikTok | spend scope (and revenue scope under the platform basis) |
| Compare | on/off | adds Δ chips vs the same span one month earlier (`compare=previous-period`) |

Columns: **Brand · ROAS · Spend · Revenue · Purchases · New members · New memb %**. Purchases counts all five acquisition categories; New members counts `membership-purchase` only.

⚠️ **Milwaukee is in BOTH lanes** — same wordmark, different population. The brand cell renders the wordmark alone (name on `alt`), so the active Lane pill is the only thing distinguishing a Milwaukee-the-toolset row from a Milwaukee-the-toolbox one. Do not weaken that control.

**Spend is always URL-derived, for every basis** — ad platforms cannot see which combination a visitor built (`canonicalizeLandingUrl` strips the query). Under the two non-landing-page bases the Spend column header therefore reads **"Spend · URL"**, and the basis `Segmented` carries a `title` explaining the join. One tooltip, not a paragraph.

**Under `basis=platform`**, New members / New memb % render **`—`**, never `0` — platform data has no membership split, and a zero would read as "we sold none". With `platform=all` the response sets `meta.blendedPlatformRevenue` and the card shows the double-counting caveat (the same purchase can be claimed by Meta and TikTok).

**The Unattributed footer row** carries spend whose URL resolved to no lane (`unknown://meta-ad/…` placeholders, non-promotion pages, `cash-prize` under the toolbox lane) *and* revenue whose event has no `promotionSlug`/`builtPrizeSlug`. It is included in the Total. Without it the Total would silently disagree with both the ad account and the Overview revenue card.

**`PrizePerformanceAdsModal` is unchanged** and still the row drill-down — it is URL-keyed per-ad detail, which stays correct regardless of basis.

**Display registry moved.** `BRAND_DISPLAY_NAME` used to live inside the card and covered only 5 of the 9 lanes. It is now `TOOLSET_LANE_DISPLAY` / `TOOLBOX_LANE_DISPLAY` + `getBrandLaneDisplay()` in `src/config/promo-landing-slugs.ts`, typed as `Record<ToolsetLandingSlug|ToolboxLaneId, …>` so a new brand fails compilation until its label and wordmark exist.

**`ProgressBar` gained `tone`.** The New memb % bar passes `tone="neutral"`; the default `"risk"` scale (green<50 / amber / red>80) is a *budget* scale and would paint a healthy 85% share red. Existing callers are unaffected.

## Period comparison — selected window vs the same span one month earlier (2026-08-19, semantics changed 2026-08-20)

Phase 3 of the [Brand Performance spec](../superpowers/specs/2026-08-19-admin-analytics-brand-performance-design.md). `overview/sections/PeriodComparisonCard.tsx` + `periodComparisonModel.ts`, mounted on `DashboardOverview` directly above Brand performance.

**Two comparison mechanisms now exist, deliberately, with different meanings:**

| | Window | Used by |
|---|---|---|
| `trendCalculationService.getComparisonPeriod` | equal-length window immediately preceding the selection | KPI trend arrows |
| `resolvePreviousPeriodAest` | the SAME span one calendar month earlier, current side truncated at today, AEST | this card + Brand Performance |

An arrow wants "vs the previous equivalent stretch"; this table wants a **stable month-on-month benchmark that does not move when the reader changes the range**. Neither replaces the other, and the card names both windows in its subheading so nobody has to guess which is which.

**No new aggregation.** The comparison window is a second call to the *same* `useAdminDashboardStats` the dashboard already uses (`dateRange="custom"` + the resolved month bounds). The card introduces **no second definition of revenue** — it re-presents numbers the dashboard already computes. The selected window's payload is passed in as a prop from `DashboardOverview` rather than re-fetched.

⚠️ **Length asymmetry is real and is surfaced, not hidden.** "Today" against a whole calendar month is not like-for-like. When the two windows differ in length a **Per day** column appears (current vs previous rate) alongside the raw figures, and a one-line note names both day counts. Ratio metrics (ROAS) are never normalised — they are already rates.

**`deltaPct` is `null` when the prior value was 0**, and renders as "new" rather than ∞ or a flat 100%. A change from nothing has no meaningful percentage; showing one would read as a real measurement.

**Card vs drawer.** The card shows the `headline` subset (total revenue, new memberships, purchases, new accounts, ad spend, ROAS). The corner **All metrics** button opens a right-hand drawer (same overlay/sticky-header pattern as `PastDueChargeHistoryDrawer`) with every metric grouped Revenue / Customers / Advertising, plus a **Biggest movers** toggle that flattens and sorts by |Δ%|. Metrics with no comparable percentage sort last rather than to either extreme. The drawer reuses the card's already-loaded data — no second fetch.

**Why the table is hand-rolled rather than the kit `DataTable`.** The rows are *metrics*, not records: the label column is a `<th scope="row">`, each row formats its value differently (currency / count / ratio), and column sorting would be meaningless. Reusing `DataTable` would mean fighting its record-shaped API for no gain.

**`RevenueBreakdownItem` is a live union** (bare number on older payloads, object on newer). Every read goes through the model's `itemRevenue` / `itemCount` helpers — reading `.purchaseCount` off the numeric form would yield `NaN`. Guarded by `npm run test:period-comparison`.

**Deliberately absent: a "Contribution" / profit row.** `revenue.total` includes renewals while ad spend only buys acquisition, so `revenue − spend` here would flatter. The honest version of that metric is acquisition-scoped and already lives on the **All Platforms** tab (master spec §2). Adding an ambiguous second one would be a new source of truth, which is the thing this work exists to reduce.

### Membership rows added 2026-08-25: Renewals, Became past due, Total memberships

Three rows joined the **Customers** group. The first two are pure model additions — `users.membershipRenewals` was already on the payload and already range-scoped, it simply was not surfaced here:

| Row | Source | Notes |
|---|---|---|
| **Renewals** | `users.membershipRenewals.succeededInRange` | The count behind the existing *Renewal revenue* row, from the same bucket, so the two can never disagree. Equals the "N renewed" on the Renewals KPI tile for the same window. |
| **Became past due** | `users.membershipRenewals.becamePastDueInRange` | DISTINCT members entering `past_due` (`MembershipStatusHistory`, invoice-payment-failed webhook) — not failed invoices. One member retried three times counts once; `failedInvoicesInRange` is the invoice-level figure. **Inverts** — a rise is bad news, like Cancellations. |
| **Total memberships** | `users.activeMembershipsAtEnd` | New field. See below — this is the one with a trap. |

⚠️ **"Total memberships" is NOT `users.activeSubscriptions`, and that distinction is load-bearing.** `activeSubscriptions` is a live standing count with no date bound, so both windows read the *same* number and the row would render "4,504 vs 4,504 · 0%" — one number shown twice, dressed as a finding about history. That row was removed once already and the model still carries a comment forbidding it.

`activeMembershipsAtEnd` (computed in `DashboardStatsService`) measures each window **at its own end date**, so the Δ is two genuine measurements:

- Window ends **today** → the live count *is* the end-of-window state, and it is already loaded.
- Otherwise → sum `activeCount` across the three subscription packages in `MembershipDailySnapshot` for that AEST day. Verified 2026-08-25 to be the same population as the live count (same `getActiveSubscriptionFilter`, and only the three subscription package IDs exist).
- **No snapshot for a past day → the field is omitted and the row disappears entirely.** Falling back to the live count would label today's number as that period's. A 0 would print a −100% collapse of the member base that never happened. Expect the row to be absent for ~3.5h after AEST midnight, before `membership-daily-snapshot`'s 17:30 UTC fire.

**Total memberships is a STOCK, not a flow** — a level at an instant, not an amount accumulated over the window. It carries `stock: true`, which opts it out of per-day normalisation exactly as `format: "ratio"` does: "4,504 members ÷ 30 days = 150.1/day" is meaningless. Any future level-type metric (standing counts, balances) needs the same flag. Pinned by `test:period-comparison` (`testTotalMembershipsIsAStockAndNeverNormalises`, `testTotalMembershipsOnlyAppearsWhenBothWindowsMeasuredIt`, `testRenewalAndPastDueCountsComeFromMembershipRenewals`).

`activeMembershipsAtEnd` is **not** mirrored to Norm — the Norm dashboard route projects its fields explicitly, so the addition cannot affect its output. Worth mirroring if Norm ever needs "how many members did we have on date X".

## Rendered verification + two fixes it caught (2026-08-19)

The Brand Performance and Period Comparison work was verified **on screen** via the e2e harness (`npm run e2e:env`, isolated seeded DB at :3799, Playwright as `e2e.admin@e2e.local`) rather than by reasoning about the DOM. Two things only surfaced there:

**1. Per-day normalisation was being applied to a stock metric.** "Active memberships" rendered as `1 vs 0.032 per day` — a point-in-time *level* divided by a day count, which is meaningless. It was first fixed with a `stock` flag on `ComparisonMetric`; the row was then **removed entirely** in the pre-merge audit (below), which made the flag unnecessary.

**2. `PrizePerformanceAdsModal` was a naming fork.** The card became `BrandPerformanceCard` but the modal (and four code comments) still said `PrizePerformance*`, referencing a file that no longer exists. Renamed to `BrandPerformanceAdsModal`; comments in `spendByUrlAdBreakdown.ts`, `spend-by-url/route.ts`, `CampaignTreeTable.tsx` and `LandingPageMetricsDaily.ts` updated.

**Confirmed working in the browser:**

- **Sticky filter** — scrolled the admin container 2000px; the toolbar held at a constant 24px offset from the container top and stayed visible, with content scrolling *under* it. Ancestor chain verified: sticky bar → `space-y-5` parent (3240px) → `overflow-y-auto` container (827px), no `transform`/`filter`/`contain` in between.
- **Period comparison** — both windows named ("Today vs 2026-07-01 → 2026-07-31"), per-day column appears on unequal lengths with the "1d vs 31d" note, `deltaPct === null` renders "new" rather than ∞, ROAS shows `—` for per-day.
- **Drawer** — opens, groups Revenue / Customers / Advertising, carries Acquisition revenue + Contribution, "Biggest movers" sort present.
- **Brand Performance** — all three `Segmented` controls plus Compare render; all 8 toggle combinations clicked with **zero console errors** and the card still mounted.

⚠️ Not covered: the seeded e2e DB has no ad-spend rows, so Brand Performance was exercised only in its empty state. The populated table, the observed-mix split note and the Δ chips have been verified against production data through the API (see the Norm smoke) but not visually.

## Mobile + dark verification, and the two bugs it found (2026-08-19)

Both surfaces were rendered on a 390×844 viewport and in dark mode via the e2e harness, not reasoned about.

**Dark mode needed no changes.** Measured rather than eyeballed — the active `Segmented` pill computes to `rgb(10,10,10)` on a `rgb(23,23,23)` card with white text; the Compare / Sync / All-metrics buttons all resolve to `neutral-900` surfaces with `neutral-300/400` text; the asymmetry note and Δ chips keep contrast. Every new class already carried a paired `dark:` variant.

**Mobile found two real bugs:**

**1. The Δ column was scrolled off-screen.** The comparison table scrolls horizontally on a phone, and Δ was 5th — behind the optional per-day column — so the single most important number was hidden by default. **Column order is now load-bearing:** `Metric · Selected · Last month · Δ · Per day`. Δ sits immediately after the two values it compares; per-day is supporting detail and trails it. This is better at every width, not just on mobile.

**2. The drawer sat 20px below the viewport.** `PeriodComparisonCard` is a child of `DashboardOverview`'s `space-y-5` stack, and **`space-y-*` applies `margin-top` to every child after the first — including `position: fixed` ones.** The overlay and drawer inherited `margin: 20px 0 0`, so both rendered 20px down and left a strip of the admin header uncovered. Both are now portaled to `document.body`, which removes the margin and also guarantees they can never be trapped by a future transform/filter ancestor — the same reason the kit's `Popover` portals.

⚠️ **General rule this exposes:** never render a `fixed` overlay as a direct child of a `space-y-*` / `gap` container. It looks correct in the JSX and silently offsets at runtime.

**`DataTable` gained an opt-in `stickyFirstColumn`.** Default off, so no existing table changes (verified in-browser: Advertising and MER are untouched). Brand Performance turns it on — seven columns scroll on a phone, and without pinning the brand wordmark, which is the *only* thing identifying a row, scrolls away leaving anonymous numbers.

**Confirmed on device:** no page-level horizontal scroll; the date filter portals into the always-visible header slot; wide tables scroll inside their own containers; the pinned metric column holds at `left:0` with an opaque matching background through a full horizontal scroll; the drawer fills the viewport at `top:0`.

The `NEXTJS-PORTAL` element that paints over the drawer header under `npm run dev` is the Next.js dev-tools overlay — dev-only, not present in production builds.

## Users: mini-draw filters (2026-08-20)

Two new dropdowns on the Users tab, and both flow into the export.

| Filter | Param | Means |
|---|---|---|
| Mini pack | `miniDrawPackage=yes\|no` | Ever bought a Mini Pack — a lifetime purchase fact |
| Mini draw | `inActiveMiniDraw=yes\|no` | Holds entries in a draw that is active **right now** |

**Two dropdowns rather than one**, because they answer different questions and compose. "Bought a Mini Pack but is NOT currently in a draw" is a re-engagement segment, and neither filter alone can express it.

⚠️ **`inActiveMiniDraw` resolves from the MiniDraw collection (`status: "active"`), NOT from `miniDrawParticipation[].isActive`** — even though that flag is indexed and would be cheaper. The flag is only cleared when a **winner is selected**; an admin changing a draw's status via `/api/admin/mini-draw/update` does not cascade to participants, so it goes stale and would report people as being in a draw that was cancelled or completed without a winner. `MiniDraw.isActive` is itself marked "backward compatibility — should use status instead". This mirrors how `inActiveMajorDraw` resolves its cohort from the draw rather than a cache.

**Query shape matters and is tested** (`npm run test:user-mini-draw-filters`): both use `$elemMatch` so the draw-id and entry-count predicates land on the **same** array element, and the "no" variants use `$not: { $elemMatch }` so users with no `miniDrawParticipation` array at all still match. With `inActiveMiniDraw=yes` and no active draws, the filter matches **nobody** rather than silently falling back to everybody — the same deliberate choice `inActiveMajorDraw` makes.

**Export changes:**
- Both filters apply (shared `buildUserFilter`) and appear in the export modal's filter summary and the generated filename.
- **"Mini Draw Count" → "Active Mini Draws"**, and it now counts against the currently-active draw ids so it **agrees with the list filter**. It previously used the stale `isActive` flag, which meant filtering "in an active mini draw" and exporting produced a count column that disagreed with the rows it described.
- New **"Mini Pack Entries"** column — lifetime entries from Mini Pack purchases. A purchase fact, so unlike the count it does not drop to zero when a draw completes.

The active-draw ids are resolved **once per export**, not per user, and only when the column is selected.

### Correction: the Mini Pack filter reads the purchase ledger (2026-08-20)

The first cut of `miniDrawPackage` keyed off `miniDrawParticipation[].entriesBySource["mini-draw-package"]`. An audit prompted by DJ's question ("packs 4–8 are now normal package names — are those still mini packs?") showed that bucket is wrong in **both** directions, so the filter now reads **`User.miniDrawPackages`** — the purchase ledger — instead.

**Answer to the question that started it: yes, all tiers count.** Nothing in the grant path branches on package id. A mini-draw checkout stamps `packageType: "mini-draw"` and `grantBenefits` routes on that string alone, so `mini-pack-1`, the deactivated `mini-pack-7`, and `additional-vip-pack-mini` are indistinguishable to it. `test:user-mini-draw-filters` asserts the predicate hard-codes no package id, so a future rename cannot silently drop buyers.

**Why the old bucket was wrong:**

| Direction | Cause |
|---|---|
| **False negative** | `mini-draw/[id]/select-winner` sets `entriesBySource.mini-draw-package: 0` for every participant of the drawn cycle — a genuine buyer reads as "never bought" the moment their draw is drawn |
| **False negative** | `addToMiniDraw` returns early on the capacity guard, so the money is captured but nothing is written. The additional packs carry 25–500 entries vs 1/5/10, so they hit the ceiling far more often |
| **False positive** | Mini-draw **upsells** write the same hard-coded key (`payment-processing.ts:1167-1171`) |
| **False positive** | Admin "Add Entry" edits force-write it via `syncMiniDrawParticipation`, so a staff grant reads as a purchase |

**`User.miniDrawPackages` has none of that:** `$push`ed only under `packageType === "mini-draw"` and *before* the capacity guard can bail, untouched by winner selection, and `$pull`ed by `stripePaymentIntentId` on refund — so it means "bought **and kept**". `packageId` is `required: true`, so `{ "miniDrawPackages.packageId": { $exists: true } }` is exactly "has at least one purchase row", and it is a pure User predicate with no foreign lookup.

**Export follows the same source.** "Mini Pack Entries" now sums `miniDrawPackages[].entriesGranted` (lifetime, refund-net) rather than the resettable bucket, and a new **"Mini Packs Bought"** column counts the rows. The `entriesBySource` bucket is still used by "Active Mini Draws", which is correct — that column is about *current* participation, which is exactly what the bucket tracks.

⚠️ Note the bucket is not a per-tier signal either way: it stores no package identity. `miniDrawPackages[].packageId` does, so splitting the filter into "Mini Pack 1–3" vs "additional-* tiers" is now possible if it's ever wanted.

### Three corrections from reading production data (2026-08-20)

DJ read the live dashboard and found three things wrong. All were confidently wrong — plausible numbers pointing the wrong way — which is the worst failure mode for an analytics surface.

**1. Δ measured the calendar, not the business.** "Today" against a whole calendar month compared **raw totals**, so every flow read ≈ −97% simply because one day is ≈ 3% of thirty-one. It also **inverted** the answer: 197 new accounts today against July's 161.7/day is **+22%**, rendered as **−96.1%**.

Δ is now computed from **per-day rates** whenever the windows differ in length, via `rateDelta` in `periodComparisonModel.ts` — shared by the Period Comparison card *and* Brand Performance's Compare chips, so one dashboard has one definition of Δ. Ratios (ROAS) still compare raw: they are already rates, and dividing one by days would invent a swing. The header reads **"Δ / day"** when normalised. Pinned by `testDeltaNormalisesAcrossUnequalWindows` with the exact production figures.

**2. The platform chips didn't scope revenue.** Selecting Meta or TikTok narrowed *spend* while leaving revenue at every channel's, so the same $770 appeared under both, and per-platform ROAS was all-channel revenue ÷ one platform's spend — **8.95×** on a table whose true blended figure was **0.97×**.

The server bases now add `convertingPlatform` to the `PaymentEvent` match when a single platform is selected — the canonical platform basis per master spec §3.1.1, never `data.utmSource`. `platform=all` stays unfiltered by design (whole-picture), so **Meta + TikTok do not sum to All**; the gap is revenue no ad bought, and the card now says so.

**3. Toolbox spend and revenue were keyed differently** — see the entry in `docs/metrics-analytics/backend.md`.

**Also:** Brand Performance's three `Segmented` groups plus Compare wrapped onto four rows on a phone and pushed the table below the fold. They now collapse behind a summary button that names the active state (`Toolset · Landing page · All · Compare`), expanded on tap and always open from `sm` up.

## Pre-merge audit: three ways the comparison still lied (2026-08-20)

Found by auditing the branch against its own claims before merge. All three are in
`periodComparisonModel.ts` and its two consumers, and all three are pinned by `test:period-comparison`.

**1. Day counts were nominal, not elapsed.** `inclusiveDayCount` counted the whole window even when
part of it hadn't happened. The "Current draw" preset ends on the **draw date**, which is in the
future while the draw is running: on 20 Aug, a 28 Jul → 27 Aug window is 31 nominal days but 24
elapsed. Dividing current-window totals by 31 while the fully-elapsed previous draw divided by its
true length manufactured a ~23% decline out of the calendar — a smaller version of the exact bug the
normalisation was added to kill. `inclusiveDayCount(start, end, clampEndTo?)` now truncates at
`clampEndTo`; both cards pass `aestToday()`. The previous calendar month is always closed, so the
clamp is a no-op on that side and the two windows stay like-for-like. Also affects "This month" and
any custom range with a future end date.

**2. Δ had no polarity, on a page that already had one.** The drawer coloured on direction alone
(`up ? emerald : red`), so a **rising cancellation count rendered green** — directly below the
Cancellations KPI tile, which passes `invert` to `TrendPill` and renders the same movement **red**.
`ComparisonMetric` now carries `invert` (same name as `TrendPill`, one concept one name) and the Δ
cell colours on `good = invert ? !up : up` while the arrow keeps following the number.

**3. "Active memberships" compared a number against itself.** `users.activeSubscriptions` is
`User.countDocuments(getActiveSubscriptionFilter())` — a live standing count with **no date bound**
(`DashboardStatsService`). Both windows therefore read the identical number, so the row rendered
"1,234 vs 1,234 · 0%" and invited the reader to conclude memberships were flat across the two
periods. That is one number shown twice, dressed as a finding about history. The row was removed;
the movement it seemed to promise is already present, honestly and date-scoped, as **New
memberships** (in) and **Cancellations** (out). `testEveryRowIsDateScoped` keeps it out.

## The comparison window follows the selection (2026-08-20)

Superseding the "previous calendar month" benchmark described above.

**What was wrong.** The benchmark was FIXED at the whole of last month, whatever the reader had selected. On 20 Aug, "Today" was compared against 1–31 July: **one day of revenue next to thirty-one days of it**. The earlier per-day normalisation (`rateDelta`) made that *readable* — but it was still answering a question nobody asked. The reader picks a window because that is the window they care about; the benchmark has to follow it.

**The rule now:** `resolvePreviousPeriodAest(selected)` → **the same span, one calendar month earlier**, with the current side **truncated at today**.

| Selected | Compared against |
|---|---|
| Today, 20 Aug | 20 Jul |
| Current draw, 28 Jul → 27 Aug | **28 Jun → 20 Jul** |
| This month, 1 → 31 Aug | 1 Jul → 20 Jul |
| Custom, 31 Jul → 7 Aug | 30 Jun → 7 Jul |
| Last draw, 28 Jun → 27 Jul | 28 May → 27 Jun |

**Truncate first, then shift.** A draw window ends on the DRAW DATE, which is in the future while the draw runs. Shifting the *full* window gives 28 Jun → 27 Jul and pits 24 days of live data against 31 days of history — the same calendar artefact, one layer down. See [metrics-analytics/backend.md](../metrics-analytics/backend.md) for the resolver's full contract.

**Both surfaces move together.** The Period Comparison card and Brand Performance's Compare toggle resolve through the same function, and for Brand Performance it happens SERVER-side (`compare=previous-period` on `/api/admin/analytics/brand-performance` and on the Norm mirror) — a client cannot pick its own benchmark, so two cards on one screen cannot disagree.

**Knock-on effects, all good:**

- The windows are now almost always **equal length**, so `rateDelta` compares raw totals and the "Δ / day" header plus the length-asymmetry footnote only appear in the one case that still differs — a month-end clamp (31 Jul → 30 Jun). The normalisation stays; it is now a safety net rather than the main path.
- When there is nothing honest to compare — unresolved draw bounds, an inverted range, a window entirely in the future — the resolver returns `null`, the comparison fetch is disabled (`enabled: Boolean(previous)`) and the header reads "no comparable earlier period" instead of rendering a fabricated Δ.
- The comparison query key now **moves with the selection**, so changing preset costs one fetch where the fixed benchmark cost none. Worth it: a benchmark that ignores your selection is not a benchmark. The closed-window freshness overrides (1h `staleTime`, no polling) still apply.

## Brand ink, the per-ad landing URL, and two label fixes (2026-08-20)

**Brand wordmarks are painted, not just rendered.** The SVGs under `/images/brands/name/` are flat black, so rendering them as plain `<img>` made every toolbox brand look identical and cost Kincrome the blue it carries everywhere else on the site. `BrandLaneDisplay` (`src/config/promo-landing-slugs.ts`) now carries `markColor: {light, dark}`, and the table paints the wordmark with a **CSS mask** — the same technique the customer-facing /promotions prize selector uses. The values are copied from `TOOLBOXES` in `src/components/sections/promo/prize-selection/constants.ts` **with their reasons**, so the admin table and the customer selector cannot drift.

- Kincrome is the one brand needing a genuine per-theme pair (`#0047BB` / `#4A7ED4`) — blue is perceptually much darker than the two reds, so the deep official blue disappears on a dark surface.
- **GearWrench is the exception and gets no `markColor`.** Its mark is two-tone ("GEAR" in theme ink, "WRENCH" in Molten Orange, plus an orange gear badge); a flat mask paints one colour and physically cannot render that. It ships `logoPathLight` instead and the cell swaps images per theme.
- Resolved **client-side** from `laneId`, not plumbed through the API — a colour in the response would have meant a Norm schema change for something purely presentational.
- Two spans / two images with `dark:` classes rather than a JS theme read, so the right ink is present on first paint.

**Each ad now shows the landing URL it bought.** A brand drill-down unions several URLs into one ad list — the modal header said "5 landing URLs" but nothing told you which ad used which, the one thing the table is for. `canonicalUrl` now travels `SpendByUrlAggregationService` → `getSpendByUrlDetailFormatted` → `groupSpendByUrlDetailRowsByCampaign` → `CampaignTreeTable`, shown as the path only (the origin is identical on every row) with the full URL in `title`. ⚠️ The formatter uses an **explicit include-list**, so a field added upstream is silently dropped unless it is named there too.

**Labels:** the `built-prize` basis now reads **"By prize"** — the internal value is unchanged, per the backend-term/UI-term split. The **NEW MEMB %** progress bar was removed: a share-of-total across five brands is read by comparing the numbers down the column, and the bar only added visual weight to the widest column.

## Monthly coupon campaigns — the expiry column reads TWO clocks (2026-08-27)

`MonthlyRedeemablesCampaignPanel` renders one "Expiry" label per campaign, and the value it prints
comes from two different clocks that the underlying fields do not distinguish:

- **The campaign's clock** — `endsAt` / `neverExpires`: how long we keep handing the code out to
  *new* people.
- **The customer's clock** — `validForHours`: how long *that one person* has once the code lands in
  their account.

`renderExpiryLabel` therefore has three branches, in `resolveIssuanceExpiry`'s precedence order:

| Campaign shape | Label |
|---|---|
| `neverExpires` | "Never Expires" (the mobile card adds a separate "No expiration" line below it) |
| `validForHours` set, `endsAt` = the open-ended sentinel | "{n}-hour window per customer · issuing until switched off" |
| `validForHours` set, real `endsAt` | "{n}-hour window per customer (stops issuing {date})" |
| neither | the `endsAt` date, or "Issuing until switched off" when it is the sentinel |

**The open-ended sentinel is detected by `isOpenEndedDate`, a YEAR THRESHOLD — never an equality
test** (`src/utils/redeemables/bonus-code-policy.ts`). The admin form binds `endsAt` to a
`datetime-local` input whose value is parsed as **local** time, so a round-trip through the picker in
Sydney turns `9999-12-31T23:59:59.999Z` into `9999-12-31T12:59:00.000Z` — and west of UTC it rolls
into year 10000. An equality check would then silently print "stops issuing 31 Dec 9999" on a
campaign that has no backstop at all.

**The `neverExpires` branch stays first.** It only reads backwards against `resolveIssuanceExpiry`'s
precedence if the `neverExpires` / `validForHours` mutual-exclusion guard is deleted — and that guard
exists in six places and is not being removed, so the pair can never coexist and the order can never
lie. If a future change ever does remove it, this branch order must be revisited in the same edit.

## Ad-URL mismatch check + Ads Manager deep link (2026-09-01)

**The problem.** `Draw 10 | Sales | STIHL | Sep 2026` sent 567 visits (98% of that campaign) to
`/promotions/makita` in production — verified by hand, invisible in the admin. A naive
campaign-name-vs-URL comparison flags ~90% false positives, because prizes have TWO independent
brand axes (toolset: ryobi/milwaukee/dewalt/makita/hikoki/stihl; toolbox:
sidchrome/kincrome/milwaukee/gearwrench) and the toolbox half is expressed either as a second
slug segment (`/promotions/milwaukee-kincrome`) or a `?toolbox=`/`?toolset=` query param
(`/promotions/milwaukee?toolbox=kincrome`) — both mean the same thing, and a URL simply not
committing to a toolbox is normal, not a finding. Full decision record: `docs/superpowers/specs/
2026-09-01-coupon-audience-and-ad-url-check-design.md`, section B.

**Pure check, in `src/utils/admin/adUrlMismatchCheck.ts`.** `resolveAdUrlBrands(url)` returns the
brand set from slug segments AND query params, unioned. `checkAdUrlMismatch({ campaignName,
adName, urls })` returns `{ verdict: "ok" | "mismatch" | "unknown", campaignBrand?, urlBrands
}`. `mismatch` fires ONLY on a positive contradiction: naming resolves to exactly one brand, at
least one URL resolves a brand at all, and none of the URLs either name that brand or are silent
about its axis (a toolbox-only brand like GearWrench whose URL never commits to a toolbox is
`ok`, never `mismatch` — a toolset brand's axis is always present on a resolvable
`/promotions/<slug>` URL, so it has no equivalent leniency). Everything else (0-or-2+ brands in
the naming, no resolvable URL brand anywhere — including `unknown://meta-ad/<id>` placeholders,
multi-URL/carousel ads where no URL matches vs. any URL matching) resolves to `unknown` or `ok`.
The brand list (`AD_URL_CHECK_BRANDS`) is derived from `TOOLSET_LANDING_SLUGS` +
`TOOLBOX_LANE_ORDER` (`src/config/promo-landing-slugs.ts`), never hand-restated — a brand
missing from that registry would silently read "unknown" forever. Tests:
`src/utils/admin/__tests__/adUrlMismatchCheck.test.ts` (`npm run test:ad-url-mismatch`),
including the real STIHL case, the GearWrench false positive, and a mutation check proving a
naive campaign-name-only comparator WOULD flag GearWrench while this rule does not.

**Reads `rawUrls`, never `canonicalUrl`.** `canonicalizeLandingUrl` deliberately strips the query
for spend grouping, so a `?toolbox=`/`?toolset=` selection is invisible on `canonicalUrl`. Data
change: `SpendByUrlAggregationService`'s `SpendByUrlDetailRow`/`SpendByUrlDetailAggRow` gained a
`rawUrls?: string[]` field, populated from the SAME `AdDestination` doc `canonicalUrl` already
came from (`getSpendByUrlDetailForCanonicalUrls`) — the `AdDestination.find()` query there has no
`.select()`, so `rawUrls` was already being fetched, just never emitted. `rawUrls` then threads
`SpendByUrlDetailRow` (hook) → `PackagesFocusAdNode` (`usePackagesFocusBreakdown.ts`) →
`groupSpendByUrlDetailRowsByCampaign` (`spendByUrlAdBreakdown.ts`) → `CampaignTreeTable`. It is
present ONLY on ad nodes built by the mixed-brand tree (`BrandPerformanceAdsModal`'s per-ad
detail rows, which always carry `packagesFocus`) — the KPI modal's per-bucket trees
(`PackagesFocusBreakdownService`) never populate per-ad URL data, so `CampaignTreeTable` gates
the whole URL/link/icon block on `ad.packagesFocus !== undefined` and renders nothing there,
same as before.

**`CampaignTreeTable` renders three things per ad row**, gated on that same URL-data presence:
1. **The real URL(s)**, RAW form (path + query, host trimmed) — a carousel/multi-URL ad shows
   every URL, not just the first.
2. **"Ads Manager" link** (`buildAdsManagerAdUrl`, exported from `CampaignTreeTable.tsx`) —
   `https://adsmanager.facebook.com/adsmanager/manage/ads?act=<adAccountId, act_ prefix
   stripped>&selected_ad_ids=<adId>`, opened `target="_blank" rel="noopener noreferrer"`. Gated
   on `platform === "meta"` (Meta-only deep link) AND `adAccountId` being present — the table
   gained both as new optional props, threaded from `BrandPerformanceAdsModal`'s
   `data.meta.adAccountId` (already returned by the detail endpoint; nothing new fetched).
   **`assumed`, not verified against a live account** — flagged to the owner; the shape lives in
   exactly one place so a correction is a one-line change.
3. **The verdict icon** — `mismatch`: a red `AlertTriangle` with an accessible title naming both
   brands ("Campaign names Stihl; URL points at Makita"). `unknown`: a muted grey `HelpCircle`,
   deliberately quiet. `ok`: nothing — the entire point is that a warning is rare and therefore
   believed; a table that decorates every "ok" row trains the reader to ignore the icon.

**Not wired into `SpendByUrlAdBreakdownTable.tsx`** (the OTHER per-URL drill-down table, reached
from the main Spend by URL section rather than the Brand Performance modal) — out of scope for
this change; the 46 `unknown://` Meta ads that table can show are unaffected. `AD_URL_CHECK_BRANDS`
and `checkAdUrlMismatch` are exported and reusable if that surface wants the same check later.

**Validated against production, same day:** run against 665 live ads, 8 `mismatch`es — all the
genuine STIHL case — and **zero false positives** (GearWrench correctly stayed clean). That is
the bar the spec set (B3/B4), met on real data, not just the fixture set.

### Second signal: unrecognised `?toolbox=`/`?toolset=` values (2026-09-01)

Running the check against production surfaced a second, independent defect class: **84 ads carry
`?toolbox=milwakee`** — a misspelling of "milwaukee" — out of 1,406 ads carrying a toolbox/toolset
param (448 `kincrome`, 394 `gearwrench`, 364 `sidchrome`, 116 `milwaukee`, **84 `milwakee`**, 29
`toolset=milwaukee`, 12 `toolset=dewalt`). This is a DIFFERENT problem from a brand mismatch: the
URL shape is right and the param is doing its job of pre-selecting a toolbox, but the value names
no brand, so the landing page silently falls back to its default instead of the toolbox the ad
promised — a live conversion leak, on 6% of parameterised ads, invisible to both the brand-mismatch
check above (URL shape is fine) and to `resolveAdUrlBrands` alone (an unrecognised value was always
silently dropped, indistinguishable from the param being absent).

**`findUnrecognisedAdUrlParams(url)`** (also in `adUrlMismatchCheck.ts`) returns every
`{ param: "toolbox" | "toolset", value }` pair present in a URL that matches no known brand.
`?toolbox=cash` — the prize-builder's legitimate opt-out (`CASH_OPTION` in
`src/components/sections/promo/prize-selection/constants.ts`) — is explicitly excluded; it names
no brand on purpose and must never read as a typo. `CheckAdUrlMismatchResult` gained
`unrecognisedParamValues: UnrecognisedParamValue[]` (always an array, never `undefined`) — a
**companion field, not a fourth verdict**: it is computed once, independent of `verdict`, and
spliced unchanged into every return branch, so a typo can surface alongside a clean `ok` (a good
brand match with a broken param still needs fixing) or a genuine `mismatch` (both problems can
coexist on one ad, and neither is allowed to hide the other). Absence of the param is still never
a finding — the same B4 rule, now proven by an explicit mutation-style test showing
`resolveAdUrlBrands` alone cannot tell `?toolbox=milwakee` apart from no param at all; only
`findUnrecognisedAdUrlParams` can.

`CampaignTreeTable` renders it as a fourth, visually distinct affordance — an amber `SpellCheck2`
icon (never red, so it reads as "different kind of problem" from the mismatch `AlertTriangle` at
a glance) with a title naming the offending value, e.g. `Unrecognised toolbox value: 'milwakee'`.
It sits beside, not instead of, the mismatch icon when both apply.

⚠️ **Both signals share `AD_URL_CHECK_BRANDS` as their one brand registry**
(`TOOLSET_LANDING_SLUGS` + `TOOLBOX_LANE_ORDER` in `src/config/promo-landing-slugs.ts`, derived
not restated — same T3 threading risk as the brand-mismatch check). A brand genuinely missing
from those two constants would make EVERY `?toolbox=`/`?toolset=` value naming it read as
"unrecognised" here — i.e. all of that brand's parameterised ads would report as typo'd, even
though every one of them is spelled correctly. Add the brand to `promo-landing-slugs.ts` first;
both checks pick it up automatically.

Tests (same file, `npm run test:ad-url-mismatch`): the real production case
(`/promotions/makita?toolbox=milwakee`) reports the typo; a clean `?toolbox=kincrome` and a bare
URL with no param at all both report nothing; `?toolbox=cash` is never flagged; an ad that is
BOTH a brand mismatch and typo'd surfaces both signals in one result; and the mutation test
proving the pre-change code (brand-set resolution alone) cannot distinguish a typo from an
absent param.
