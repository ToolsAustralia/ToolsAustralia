# Admin — Frontend

> **Prize catalog imports (2026-07-20, perf Tier-2):** admin client surfaces that only need
> slugs/labels (`PromoAnalyticsManagement`, `PromoPageDetailModal`, the ab-testing
> `ExperimentDetailModal`/`ExperimentFormModal`) now import from the lightweight
> `@/config/prize-summaries` (`listPrizeSummaries` / `getPrizeLabel`). The one admin surface that
> renders a deep field — `MajorDrawManagement`'s Prize Information card (`detailedDescription`) —
> deliberately keeps a static `@/config/prizes` import (admin-chunk only, never in the landing
> graph). See [config-and-data architecture](../config-and-data/architecture.md) "Prize catalog split".

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

[`PromoAnalyticsManagement`](../../src/components/admin/PromoAnalyticsManagement.tsx)'s per-page
table gained a **Builds** column, inserted immediately after the existing **Cross-visits** column
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

**Cross-visits was NOT removed.** An earlier draft of this task assumed the column (reads
`referrerSlug`) was structurally dead, since nothing has written a new `referrerSlug` since
2026-07-24 (its only writer, the "Explore other toolsets" carousel, was removed when the prize
builder's toolset reel took over that job). That premise was re-tested against the live DB and
found false: 174 of 712 visit rows (~24%) still carry `referrerSlug`, spanning June–July, and
remain inside the 90-day TTL — the column still renders real numbers for those date ranges. It
will decay to all-zero on its own as those rows age out (~late October 2026), at which point
dropping it becomes a safe one-line change. Until then it stays exactly as it was: same header,
same cell, same `crossVisits` sort key, same `crossVisitMap` aggregation in the repository.

## Promo Analytics — Switched-away % column + By Built Prize table (2026-07-28)

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
`data?.byBuiltPrize ?? []` (optional-chained the same way `data?.byUTMSource` already is in this
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

> **Not visually verified.** No admin session was available in the session that added this, so the
> structure was confirmed by `<th>`/`<td>` parity and type-check only. Confirm the rendered table
> before trusting the layout.

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
- **[src/components/admin/spend-by-url/CampaignTreeTable.tsx](../../src/components/admin/spend-by-url/CampaignTreeTable.tsx)** — shared expandable campaign → ad-set → ad tree (columns Name | Spend | Revenue | ROAS | Conv.; ROAS emerald ≥ 3 else amber; ad rows show adId mono over adName, an adFormat chip, and a focus `Badge` when the node carries `packagesFocus` — info "One-time" / neutral "Membership" / warning "Unclassified"). Node types come from `usePackagesFocusBreakdown`; consumed by `AdSpendFocusModal` (server-built tree) and `PrizePerformanceAdsModal` (client-grouped tree). Known kit limitation: `DataTable`/tree row clicks are mouse-only (no keyboard handler) — pre-existing, shared with `AdvertisingPlatformCard`.
- **Prize Performance row click → upgraded [`PrizePerformanceAdsModal`](../../src/components/modals/PrizePerformanceAdsModal.tsx)** — `PrizePerformanceCard` attaches each brand's `canonicalUrls` to its row (captured before the zero-row filter, so every rendered row carries them) and opens the modal via the kit `DataTable`'s `onRowClick`. The modal keeps its original props + `useSpendByUrlDetailMany` source and adds: brand-level Membership / One-time summary tiles (Unclassified only when present), focus chips (All / Membership / One-time / Unclassified) filtering ONE mixed tree (each ad badges with its own focus — unlike the KPI modal's pre-split buckets), platform chips (TikTok = awaiting box, no fetch), and the client-side grouper `groupSpendByUrlDetailRowsByCampaign` ([spendByUrlAdBreakdown.ts](../../src/utils/admin/spendByUrlAdBreakdown.ts)) producing the same node shape `CampaignTreeTable` renders.
- **Facebook Ads → Spend by URL surfaces** (`SpendByUrlSection.tsx`, `SpendByUrlAdBreakdownTable.tsx`): a non-interactive focus summary strip above the toolbar (Membership / One-time / + Unclassified tiles from `usePackagesFocusBreakdown`; hidden when the range isn't ready, on query error, or when total focus spend is 0), per-URL-row `M $x` / `OT $y` split chips under the URL (only when the row carries the `packagesFocus` split), and a focus `Badge` under the ad name in the per-ad drill-down table (membership/one-time only — no new column, COL_SPANs unchanged).

- **[src/components/admin/overview/DateRangeDropdown.tsx](../../src/components/admin/overview/DateRangeDropdown.tsx)** — clean dropdown replacing the old chip-bar `DateRangeToggle` inside `OverviewToolbar`. Reuses the existing `DateRange` type and the toolbar prop contract (`selectedRange`, `onRangeChange`, `onCustomClick`, `displayDate`). Ranges: Today / Yesterday / Current Draw / Last Draw / All Time, plus a "Custom range…" row that calls `onCustomClick` (opens the existing `CustomDateRangeModal`). Anchored via the kit `Popover`. The shared `src/components/admin/DateRangeToggle.tsx` is unchanged but, as of the 2026-06-02 unification (below), is **no longer rendered anywhere** — it survives only as the canonical home of the exported `DateRange` type.

- **[OverviewToolbar.tsx](../../src/app/admin/component/overview/OverviewToolbar.tsx)** now renders `DateRangeDropdown` in its shared `inner` block, so both `placement="page"` (desktop sticky) and `placement="layout"` (mobile portal) pick it up.

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

**Kept** (still in use): `overview/DashboardOverview.tsx`, `overview/OverviewToolbar.tsx`, `overview/DashboardSection.tsx` (used by `UsersBreakdownSection`), `overview/UsersBreakdownSection.tsx`, and all `overview/sections/*` redesign cards. The `my-account` `RecentOrders.tsx` (a different, live file) was untouched. Detail modals the deleted sections used (`RevenueDetailModal`, `MembershipByPackageDetailModal`, `PrizePerformanceAdsModal`) were left in place — they live under `src/components/admin/` and are out of scope for the Overview reskin.

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

## Chatbot (Cobber) — availability, cost & usage (2026-06-26, updated 2026-07-08)

[src/components/admin/ChatbotCostManagement.tsx](../../src/components/admin/ChatbotCostManagement.tsx) is the **`chatbot`** tab — relocated 2026-07-08 from the Analytics group to the **Team** group (below Norm) and renamed "Chatbot Cost" → "Chatbot", since the section now toggles availability, not just reports cost. Rendered by `AdminPage` on `selectedTab === "chatbot"` (URL `/admin/chatbot`; the H1 derives from the id via `capitalize`). Gated by `overview.view`. Read-only **except** two `PATCH` controls: the Cobber availability (pause) toggle and the AI model provider toggle (see below). The component file/class keep the `ChatbotCost*` name (still primarily the cost-analytics surface). No external chart library.

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
- **`AdvertisingPlatformCard`** (`overview/sections/`) — spend & return by platform (**Platform / Spend / Revenue / ROAS**). Revenue + ROAS are **server-side payment-attributed** (`stats.attributedRevenue`, keyed by `convertingPlatform`), **not** Meta pixel `spend × roas`; ad spend from the ads API. Row logic in the unit-tested `advertisingCardModel.ts` (`npm run test:advertising-card-model`) maps each platform to one of three classes: **paid + spend** (Meta — spend, revenue, true ROAS `revenue/adSpend`); **paid, spend not synced** (TikTok/Snapchat — revenue + conversions; spend "Awaiting sync", ROAS "Needs spend"); **owned** (Klaviyo Email/SMS — revenue + conversions; spend/ROAS "—"). Header = **Blended ROAS** (Σ revenue ÷ Σ spend over paid-with-spend channels; "—" when none) + total attributed acquisition revenue. **Money is shown in full** (`formatCurrency`, e.g. `$2,400.00` — not `fmtCompact`'s `$2.4k`) so exact spend/revenue is legible (2026-06-03). A **Direct** row (`buildDirectRow`, neutral globe logo) is **appended below the 5 channels** when the `direct` (unattributed — no fbclid/ttclid/Klaviyo tag) bucket has revenue, showing its acquisition revenue + count with spend/ROAS "—"; it is **deliberately excluded** from the header "attributed" total, blended ROAS, and `computeAggregate` (direct is unattributed, so it must not inflate ad metrics). `google`/`other` buckets are not surfaced as rows. Brand logos are inline SVG (`src/components/admin/ui/PlatformLogos.tsx`, now incl. `"direct"`). The dedicated Facebook Ads tab + ads-health views are untouched.
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

- **`TikTokAdBreakdownTable`** (`src/components/admin/`) — per-ad table, the TikTok analogue of the Meta "Ads" / Spend-by-URL per-ad tables. Columns: **Ad** (adName + a `campaignName · adsetName` sub-line, falling back to `Ad {adId}`) · **Spend** · **Impr.** · **Clicks** · **Conv.** · **TikTok rev.** · **ROAS** (`revenue ÷ spend`, `.toFixed(2)+"×"`), plus a totals `<tfoot>`. **Revenue is TikTok's OWN attributed value**, labelled **"TikTok rev."** exactly as the Meta table labels **"Meta rev."** — the platform's reported number, **NOT** first-party `PaymentEvent` sales. Money is `en-AU` AUD. Data via `useTikTokAdsInsights({ startDate, endDate })` ([`src/hooks/queries/admin/useTikTokAdsInsights.ts`](../../src/hooks/queries/admin/useTikTokAdsInsights.ts), mirrors `useFacebookAdsInsights`) → `GET /api/admin/tiktok-ads/insights` (gated `facebookAds.view`). Empty state splits on the `configured` flag: "No TikTok ad spend recorded for this range yet" when creds are set, else "Awaiting sync — set `TIKTOK_ADVERTISER_ID` + `TIKTOK_MARKETING_ACCESS_TOKEN`, then the nightly sync populates this." Fed nightly by the `/api/cron/sync-tiktok-ads` sync (infrastructure domain) into `TikTokAdInsightsDaily`; see [backend.md](./backend.md#tiktok-ad-level-insights-per-ad-spend-breakdown) + [api.md](./api.md#tiktok-ad-level-insights-per-ad-breakdown).

## Klaviyo analytics tab (Part C, 2026-06-03)

- **`KlaviyoAnalyticsManagement`** (`src/components/admin/`) — new **Klaviyo** tab (Analytics group, gated `facebookAds.view`). Balanced layout: (1) a "scheduled / about to send" strip (upcoming Scheduled campaigns + live Flows), (2) **Campaigns** + **Flows** revenue tables ranked by **Klaviyo-attributed** revenue with an **email / SMS** split, (3) the **server-side** Klaviyo hourly revenue (`useHourlyRevenue({ platform: "klaviyo" })`, SHARED-1) rendered via the shared **`HourlyBreakdownTable`** — Klaviyo is an owned channel, so Spend/Profit/ROAS render **"—"** (rows pass `null`). Data via `useKlaviyoAnalytics` → `GET /api/admin/klaviyo/analytics` (SHARED-2). A footnote makes clear the campaign/flow revenue is Klaviyo's own attribution and won't equal the server-side `convertingPlatform=klaviyo_*` hourly. **Date filter (2026-06-03):** a **relative-range pill selector** (Last 7 / 30 / 90 days / 12 months) — NOT the standard `DateRangeDropdown` — because Klaviyo's Reporting API is keyword-timeframe based (`KlaviyoTimeframeKey`). The selected keyword drives the campaign/flow tables natively **and** is converted to a trailing AEST `start/end` window (`aestRangeForKeyword`, `days-1` inclusive → today) for the hourly section, so one control moves both. No auto-refresh (Klaviyo reporting is throttled).

## All-Platforms aggregate tab (Part D, 2026-06-03)

- **`AllPlatformsManagement`** (`src/app/admin/component/`) — new **All Platforms** tab (first in the Analytics group, gated `facebookAds.view`). **Ad-effectiveness only (renewals excluded).** KPI rollup from **`computeAggregate(stats.attributedRevenue)`** (SHARED-3, client-side, unit-tested in `advertisingCardModel.test.ts`): Total Ad Spend, Attributed (acquisition) Revenue, **Overall ROAS** (paid channels with spend ÷ their revenue — mirrors the overview card's blended ROAS so they reconcile), **Contribution** (`revenue − ad spend`, sign-aware), Conversions. Below: the reused **`AdvertisingPlatformCard`** for the per-platform breakdown (so the Direct row + full-currency formatting appear here too), and the server-side hour-of-day table (`useHourlyRevenue({ platform: "ad-channels" })`, SHARED-1 — the 5 ad channels, matching the KPI scope so the two reconcile) rendered via the shared **`HourlyBreakdownTable`**. **Date filter (2026-06-03):** the standard `AdminDateRangeToolbar` (default **today**); KPI stats use `useAdminDashboardStats(df.dateRange, …)` (passing the preset, so the API self-resolves today/all-time/draw windows) and the hourly query uses the same resolved AEST `start/end`, so the two reconcile. All-source/total (incl. renewals) revenue stays on the Overview revenue card.

### Shared admin date filter (2026-06-03)

- **`useAdminDateFilter(initial)`** (`src/hooks/useAdminDateFilter.ts`) + **`AdminDateRangeToolbar`** (`src/components/admin/`) — packages the date-preset logic the Facebook Ads tab does inline so the **All-Platforms / TikTok / Snapchat** tabs share **one** source of truth for the AEST math (every preset — today / yesterday / current-draw / last-draw / all-time / custom — resolves to `yyyy-MM-dd` in `Australia/Sydney`; the initial preset resolves synchronously so date-gated queries enable on first paint, draw presets fill in via an effect once `useCurrentAndLastDrawDates` loads). The toolbar renders the shared `DateRangeDropdown` + `CustomDateRangeModal`, portaling into the mobile header slot when the tab is in `ADMIN_TABS_WITH_MOBILE_LAYOUT_DATE_TOOLBAR` (now includes `all-platforms`/`tiktok-ads`/`snapchat-ads`), else inline. Local state only (no URL sync). The **Klaviyo** tab does **not** use this — it has its own keyword selector (above).

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
