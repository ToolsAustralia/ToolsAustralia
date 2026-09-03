# Admin dashboard: renewals cohort card, header date filter, collapsible sidebar

- **Date:** 2026-09-02
- **Branch:** `feature/admin-dashboard-ux` (worktree `.worktrees/admin-dashboard-ux`, port 3047)
- **Status:** awaiting sign-off on §1–§2
- **Domains touched:** `admin`, `subscription`, `internal-norm`

---

## In plain English

Three changes to the admin panel, all on the same branch because they touch the same screen.

**1. The renewals card tells you how the day is actually going.** Today it says
"40 renewed · 20 past due". Those two numbers count *different groups of people*, so
you cannot divide one into the other and you cannot tell whether the day is going well.

The new card picks one group — **the members whose renewal was due in the range you're
looking at** — and shows what happened to that same group: how many landed, how many
failed, how many are still to come. Right now that reads "31 of 102 due today" with a bar
underneath split green / red / grey.

There is also a percentage, and it deliberately measures something narrower: **of the
renewals actually attempted so far, how many were collected** — 61% today. The obvious
alternative (31 out of 102 = 30%) would read like a disaster every morning purely because
the day hasn't finished, and would climb to a healthy-looking number by midnight regardless
of how collection actually went. The bar already shows progress through the day; the
percentage shows whether the cards are working.

Getting the "102" was the interesting part. There is a database field already called
`expectedRenewalsInRange`, and it is **not** a forecast — renewal records only get written
after Stripe sends an invoice, so at noon it only knows about renewals that already fired.
I checked production: there is not one renewal record dated in the future. The real forward
schedule lives on each member's own record, in their subscription end date. So "expected
today" is the two halves added together: 51 already invoiced + 51 still scheduled = 102.
I checked the member IDs in both halves and they do not overlap by a single person.

Two things the design deliberately dodges. Stripe finalises a renewal invoice about an hour
after the cycle boundary, so a renewal due at 11:30pm gets charged tomorrow — which is
exactly why "payments that landed today" can't be put over "renewals due today". And today
there were 124 failure events but only 20 of them belong to renewals actually due today;
the rest are automatic retries on older invoices. The card counts each member once, on the
day their renewal was due.

One consequence worth knowing: **history improves.** When a failed renewal is later
recovered by Stripe's retries, that same record flips to succeeded, so last week's failure
count gets better over time. That is what you want ("did they eventually pay?"), but it does
mean a screenshot from Monday won't match the same screen on Friday.

**2. The date filter moves into the page header.** On desktop it is currently pinned inside
the scrolling area, which is why it floats over your cards as you scroll. Mobile already
solves this by putting it in the header. Desktop now uses the same slot. This deletes code
rather than adding it, and frees up the strip of page the floating bar was covering.

**3. The sidebar can collapse to an icon rail.** Click a small toggle on the sidebar's edge
and it shrinks to 60px of icons — one icon per section (Core, Analytics, Draws, Billing…),
because that is how the menu is already organised. Hover an icon and that section's pages
appear in a small panel beside it. Red attention dots stay visible when collapsed, so
collapsing can never hide a warning. Your choice is remembered. Phones are untouched — they
keep the full-width drawer, since hovering means nothing on a touchscreen.

**Not covered:** the "Upcoming renewals" list card is unchanged; the current-billing-cycle
line ("Cycle: 7.7% · 442/5,726") keeps its existing meaning and existing code; nothing on
the customer-facing site changes.

---

## 1. Problem and done

The Renewals KPI cannot answer "how is today's renewal run going?" — its headline
(`succeededDistinctMembers`) and its aside (`becamePastDueInRange`) are drawn from two
different cohorts over two different clocks, so neither divides into the other. Separately,
the desktop date filter floats over page content while scrolling, and the 280px sidebar is
permanently fixed on a screen full of wide analytics tables.

**Done when:**

| # | Observable |
|---|---|
| D1 | The Renewals card shows `landed / expected` for the selected range, plus a three-way split (landed, failed, still to come) drawn from one cohort. |
| D2 | For 2026-09-02 at ~12:00 AEST the card reads `31 of 102 due today` · 31 landed · 20 failed · 51 to come · 61% collected of those attempted. |
| D3 | The date filter is visible in the admin header at all scroll positions on desktop; no element in the scroll container uses `position: sticky` for it. |
| D4 | The desktop sidebar collapses to a 60px icon rail with hover/focus flyouts; the choice survives a reload; attention dots remain visible collapsed. |

**Failure looks like:** the card shows a fraction whose numerator and denominator come from
different cohorts (the bug we are fixing, restated), or a denominator that shrinks as the
day progresses, or a collapsed sidebar that hides an attention dot.

---

## 2. Decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| K1 | What anchors the Renewals card | The **`dueAt` cohort**: members whose renewal fell due inside the selected range | Only anchor where numerator and denominator describe the same people. `succeededAt` drifts across midnight (§3 F3). |
| K2 | How "expected" is computed for an in-progress range | `cyclesDueInRange` ∪ `activeMembersScheduledInRemainder` | `MembershipRenewalCycle` has **zero** future rows (§3 F2), so it cannot forecast alone. Measured overlap between the two sets is 0 (§3 F5). |
| K3 | The "still to come" window | **The whole range** — `[rangeStart, rangeEnd]`, never anchored to `now`, never skipped for a closed range | *(Revised during implementation — the original `[max(now, rangeStart), rangeEnd]` shipped a moving denominator; see F12.)* Over the full range the two sets stay disjoint and their union is stable: a member leaves the scheduled set exactly when they enter the cycle set. One formula covers today, current-draw, all-time and past ranges, with no `switch` on `DateRange` and no `isOpen` branch in the query. |
| K3b | What `isOpen` controls | The **label only** ("still to come" vs "did not renew") | Letting it also gate the query is what caused F12. A closed range's pending count settles to ~0 on its own; when it does not, the leftover is a real anomaly worth showing rather than defining away. |
| K4 | Label for the remainder on a closed range | "did not renew" (vs "to come" while open) | A past range has no pending members; the grey segment is then genuinely non-renewers. |
| K5 | What counts as "failed" | Cohort rows with `status: "failed"`, **not** `failedAt in range` | `failedAt` is rewritten by every dunning retry: 124 failure events today vs 20 renewals actually due today (§3 F4). |
| K6 | Fate of the current headline (`40 renewed`) | Moves into the card's click-through popover as "Payments received in range" | It ties to the Revenue card's `membershipRenewal` row and is worth keeping, but it is a different cohort and must not sit beside the fraction. |
| K7 | Fate of `expectedRenewalsInRange` | **Removed**, replaced by `dueInRange` + `landedInRange` / `failedInRange` / `pendingInRange` | The existing name asserts a forecast the data cannot support. Leaving it would keep misleading Norm (§5 R6). |
| K7b | Fate of `failedInvoicesInRange` (`failedAt`-based, retry-inflated) | **Kept and renamed** `failedInvoiceAttemptsInRange` | It is a real ops signal (dunning volume) and Norm's only failure figure, so removing it loses information. But sitting unrenamed beside `failedInRange` it reads as a contradiction — 124 vs 20 for the same day. The name must say "attempts". |
| K7c | The rate shown on the card | `collectionRate = landed / (landed + failed)`, **not** `landed / dueInRange` | Over the full denominator the rate can only reach 100% at day's end, so it reads as failure all morning. Over *attempted* it is time-of-day independent and is the actual collection-health number. The bar already conveys progress against the full denominator. |
| K8 | Snapshot version bump | **Not needed** | The membership-analytics bundle is computed live at `MembershipAnalyticsService.ts:83-98`; only *revenue* comes from `DashboardStatsDailySnapshot` (`DashboardStatsService.ts:209`). |
| K9 | Card UI mechanism | Add optional `footer?: ReactNode` to `MetricCard` + a new `SegmentedBar` in the admin UI kit | Cheaper than forking the card; both are reusable. Rejected: a bespoke `RenewalsCard` duplicating the whole tile. |
| K10 | Desktop date filter placement | Reuse the **existing** mobile portal slot, drop the `lg:hidden` and the desktop sticky branch | Removes `AdminDateRangeToolbar.tsx:87-96` and both documented ways stickiness silently breaks. Net code deletion. |
| K11 | Sidebar rail granularity | One icon per **group** (8), flyout lists that group's tabs | One icon per tab is 25 icons and needs scrolling, defeating the point. Groups + `groupIcon` already exist (`adminTabs.ts:54-56`). |
| K12 | Sidebar collapse persistence | `localStorage`, key `admin-sidebar-collapsed` | Chrome preference should outlive the tab. Group expansion stays in `sessionStorage` — different lifetime, deliberately not merged. |
| K13 | Mobile sidebar | Unchanged | The rail's affordance is hover; on touch it would be a dead control. |

---

## 3. Starting state (verified)

### Renewals data

| Ref | Fact | Provenance |
|---|---|---|
| F1 | The card's headline is `membershipRenewals.succeededDistinctMembers`, its aside `becamePastDueInRange`, its sub `renewalProgress` (current billing cycle, range-independent) | `verified` — `KpiGrid.tsx:259-272`, rendered at `:383` |
| F2 | `MembershipRenewalCycle` rows are written **only** from paid/failed Stripe invoice webhooks; `stripeInvoiceId` is `required, unique`. **Zero rows have `dueAt` in the future.** | `verified` — `MembershipRenewalCycle.ts:28`; writers `membershipAnalyticsPersistence.ts:35-77` (paid) and `:80-113` (failed); probe: `dueAt > end-of-today` → **0**, control query `countDocuments({})` over the same collection → **17,578**, so the collection is populated and the zero is real absence, not a broken query. Second control: `grep -rn 'status: "expected"' src/ scripts/` → 0 hits, so nothing pre-creates forecast rows either |
| F3 | `dueAt = invoice.period_end` (the cycle boundary); Stripe finalises ~1h later, so `succeededAt` is consistently ~1h after `dueAt` | `verified` — `membershipAnalyticsPersistence.ts:21-25`; probe sample: `dueAt 10:53 → succeededAt 11:54`, `10:35 → 11:36`, `09:57 → 10:59` (5/5) |
| F4 | `failedAt` is rewritten by dunning retries. 2026-09-02: **124** rows with `failedAt` today, but only **20** with `dueAt` today | `verified` — probe `count failedAt today = 124` vs `dueAt IN today: {failed: 20}` |
| F5 | Cohort docs == distinct users (51/51, 139/139, 82/82 over three days); cohort ∩ forward schedule = **0** users | `verified` — probe distinct-`userId` intersection |
| F6 | Forward schedule = `User.subscription.endDate` filtered by `getActiveSubscriptionFilter()` = `{subscription.isActive, autoRenew ≠ false, status ∈ [active, trialing], isActive}` | `verified` — `userFilterBuilder.ts:121`; probe printed the filter object |
| F7 | `expectedRenewalsInRange` already flows end-to-end and is **never rendered** | `verified` — computed `MembershipAnalyticsService.ts:83-88`, shaped `DashboardStatsService.ts:598`, typed `useAdminQueries.ts:101`; control search: `grep -rn "expectedRenewalsInRange" src/` returns 6 hits, none in a `.tsx` render path |
| F8 | `MembershipRenewalCycle` holds 17,578 rows from 2026-01-26 onward, all `confidence: "stripe"`, all `billingReason: "subscription_cycle"`; statuses observed are only `succeeded` (15,120) and `failed` (2,458) | `verified` — probe aggregate |
| F9 | Renewal metrics are computed **live**, never read from `DashboardStatsDailySnapshot`; only revenue buckets are snapshot-backed | `verified` — `MembershipAnalyticsService.ts:83-98` (live `countDocuments`) vs `DashboardStatsService.ts:209` (`readStatsForRange`) |
| F10 | `recovered` / `refunded` are permitted enum values that never occur; a recovered failure flips the **same row** to `succeeded` | `verified` — enum `MembershipRenewalCycle.ts:5`; zero rows (F8); `upsertRenewalCycleFromPaidInvoice` sets `status: "succeeded"` on the existing row (`membershipAnalyticsPersistence.ts:63`) |
| F11 | Anchoring the pending window to `now` makes the denominator **shrink through the day**. Between the cycle boundary and Stripe's ~1h finalisation a member is past a now-anchored window but has no cycle row yet, so they fall out of both sets | `verified` — observed live through the built service: `dueInRange` 102 → 98 over a few minutes on 2026-09-02. Fixed per K3; re-probed after the fix: 99 at two samples 90s apart, unchanged |
| F12 | With the whole-range window, the closed-range pending count settles to 0 without a branch | `verified` — 2026-09-01 via the built service: `pendingInRange: 0`, remainder 0, 89 landed + 50 failed = 139 due |

**Latent issue this surfaces:** Norm already publishes `expectedInRange` to an external AI
(`schemas/dashboard.ts:21-22`, `norm/v1/dashboard/stats/route.ts:37-41`) under a name that
asserts a forecast the data cannot support. Norm is answering questions about it today.

### Date filter

| Ref | Fact | Provenance |
|---|---|---|
| F11 | Three mutually exclusive placements; desktop is inline + `sticky top-0` with negative insets cancelling the scroll container's padding | `verified` — `AdminDateRangeToolbar.tsx:87-96` |
| F12 | The mobile portal target is `<div className="lg:hidden" id={ADMIN_MOBILE_DATE_TOOLBAR_SLOT_ID} />`, inside the `flex-shrink-0` header, **above** the `flex-1 overflow-y-auto` scroll pane | `verified` — `AdminPage.tsx:195` (slot) vs `:203` (scroll container) |
| F13 | 8 tabs opt in via `ADMIN_TABS_WITH_MOBILE_LAYOUT_DATE_TOOLBAR` | `verified` — `adminMobileDateToolbarSlot.ts:6-15` |
| F14 | The component's own doc-comment names two silent ways the sticky breaks (short parent; clipping/transform ancestor) | `verified` — `AdminDateRangeToolbar.tsx:30-40` |

### Sidebar

| Ref | Fact | Provenance |
|---|---|---|
| F15 | Desktop sidebar is a fixed-width wrapper: `hidden lg:block w-[17.5rem] shrink-0` | `verified` — `AdminPage.tsx:130` |
| F16 | 8 groups, each with a `groupIcon`; 25 tabs total, each permission-gated via `has(t.requires)` | `verified` — `adminTabs.ts:54-161`, filter at `AdminSidebar.tsx:~223` |
| F17 | Group expansion persists in `sessionStorage["admin-sidebar-expanded"]`; scroll position in `sessionStorage["admin-sidebar-scroll-top"]` | `verified` — `AdminSidebar.tsx:61, 86, 97-105` |
| F18 | Attention dots are computed in the sidebar from two polled endpoints (60s) and rendered on the **group** button | `verified` — `AdminSidebar.tsx:127-160`, `operationsNeedsAttention` / `drawsNeedsAttention` |
| F19 | `SidebarContext` is the **site** sidebar (cart + mobile menu), unrelated to admin | `verified` — `src/contexts/SidebarContext.tsx` |

---

## 4. Design

### 4.1 Renewal cohort — service

New method on `MembershipAnalyticsService`, replacing the three-line block at `:83-88`:

```
getRenewalCohort(startDate, endDate) -> RenewalCohort
```

```ts
export interface RenewalCohort {
  dueInRange: number;      // cyclesDue + pendingInRange (K2)
  landedInRange: number;   // cohort rows, status ∈ {succeeded, recovered}
  failedInRange: number;   // cohort rows, status ∈ {failed}   (K5 — not failedAt)
  pendingInRange: number;  // forward schedule in [max(now,start), end]
  isOpen: boolean;         // endDate > now → remainder is "to come", else "did not renew"
  collectionRate: number | null; // landed / (landed + failed), 1dp, null when attempted === 0 (K7c)
}
```

Two queries, run in parallel:

| Query | Shape |
|---|---|
| cohort by status | `MembershipRenewalCycle.aggregate([{$match: {billingReason: "subscription_cycle", dueAt: {$gte: start, $lte: end}}}, {$group: {_id: "$status", n: {$sum: 1}}}])` |
| `pendingInRange` | `User.countDocuments({ ...getActiveSubscriptionFilter(), "subscription.endDate": {$gte: start, $lte: end} })` — the **whole range**, never anchored to `now`, never skipped (K3) |

Derived from the aggregation:

```
cyclesDueInRange = Σ n            over every status bucket
landedInRange    = n(succeeded) + n(recovered)
failedInRange    = n(failed)
dueInRange       = cyclesDueInRange + pendingInRange
```

> **`dueInRange` is NOT `landed + failed + pending`.** It sums *every* status bucket, so a
> status that is in neither numerator — `refunded` today, anything added later — stays in
> the denominator and shows up as an unexplained slice of the bar rather than silently
> vanishing from the day's total. Writing the identity the other way round is the bug this
> note exists to prevent: it would make a refunded renewal disappear from the day entirely.
> The bar's grey segment is therefore `dueInRange − landedInRange − failedInRange`, which
> on an open range is pending plus any such residue.

Index `{dueAt:1, billingReason:1, status:1}` already exists (`MembershipRenewalCycle.ts:50`)
and covers the aggregation's `$match` + `$group`. `pendingInRange` needs `User` index coverage
on `subscription.endDate` — **check before merge** (§9 O1); `getUpcomingRenewals` already runs
the same query shape (`dashboardSlices.ts:912-916`), so any index gap is pre-existing, not new.

`refunded` sits in the denominator but neither numerator on purpose: a refunded renewal did
not land, and it did not fail to collect either. It is currently unobserved in production
(F10) — this is defensive, and cheap because the aggregation returns it for free.

### 4.2 Renewal cohort — transport

`DashboardStatsService.ts:597-602` gains the cohort under the existing
`users.membershipRenewals` object. Existing keys are **kept** so the Revenue-card tie
(`succeededDistinctMembers`) and Norm's current consumers keep working:

```ts
membershipRenewals: {
  dueInRange, landedInRange, failedInRange, pendingInRange, isOpen, collectionRate, // new
  succeededInRange, succeededDistinctMembers, becamePastDueInRange,                 // kept
  failedInvoiceAttemptsInRange,   // was failedInvoicesInRange — renamed, semantics unchanged (K7b)
  // expectedInRange → REMOVED (K7)
}
```

`succeededInRange` **must** be kept: `periodComparisonModel.ts:300` reads it for the Period
Comparison card. `verified` — control search `grep -rn "succeededInRange" src/` returns 6 hits,
one of them that read.

The `catch` fallback at `DashboardStatsService.ts:568-576` must gain the new keys, or a
membership-analytics failure yields `undefined` where the UI expects numbers.

### 4.3 Renewal cohort — UI

`MetricCard` gains `footer?: ReactNode` rendered under `sub`. New
`src/components/admin/ui/SegmentedBar.tsx` takes `segments: {value, className, label}[]`
and renders a flex row of proportional widths with an `aria-label` summarising the split.

Card face (Option A, approved):

```
RENEWALS                      ▲ 12.4%
31  of 102 due today
[■■■■■■■□□□□□□□············]
● 31 landed  ● 20 failed  ○ 51 to come
61% collected of those attempted          ← collectionRate (K7c)
```

Click-through popover (`KpiCard`'s existing `Popover`) lists: Landed, Failed, Still to come /
Did not renew, plus **Payments received in range — 40** (K6) and the existing cycle line.

> **`KpiCard`'s breakdown rows hard-format as money** (`moneyExact(row.value)`,
> `KpiGrid.tsx:139`). Counts rendered through that path would display as `$40`. The
> renewals popover must use a count formatter — see §5 R5.

### 4.4 Date filter

1. `AdminPage.tsx:195` — drop `lg:hidden` from the slot div.
2. `AdminDateRangeToolbar.tsx` — delete the `isLgUp` desktop branch (`:87-96`); portal
   whenever `slotEl` exists, at any breakpoint. `leading` renders inline in both cases.
3. `useAdminMobileDateToolbarSlot` still returns `isLgUp` for the pre-mount fallback paint.
4. Rename `ADMIN_MOBILE_DATE_TOOLBAR_SLOT_ID` → `ADMIN_DATE_TOOLBAR_SLOT_ID` and
   `ADMIN_TABS_WITH_MOBILE_LAYOUT_DATE_TOOLBAR` → `ADMIN_TABS_WITH_LAYOUT_DATE_TOOLBAR`
   (the `MOBILE` in the name becomes false).

The `AdminMobileLayoutDateRangeShell` wrapper (`:12` lines) sizes for a narrow header;
verify it does not stretch on desktop, and constrain it there if it does.

### 4.5 Sidebar

**State lives in `AdminPage`** (`useState` + `localStorage`), not in `AdminSidebar` and not in
a new context. The collapsed width sits on the wrapper at `AdminPage.tsx:130`, so `AdminPage`
must know the state anyway; owning it there avoids lifting it later. `AdminSidebar` receives
`collapsed: boolean` + `onToggleCollapsed: () => void` as props and stays presentational,
matching how it already receives `isMobile` / `onClose`.

- `AdminPage.tsx:130` wrapper width becomes conditional: `w-[17.5rem]` / `w-[3.75rem]`, with
  `transition-[width]`.
- Collapsed: group renders only its `groupIcon`; a `group-hover:` / `focus-within:` flyout
  (absolute, `left-full`, `z-[80]`) lists that group's permission-filtered tabs.
- Attention dots reposition to the icon's top-right corner with a ring in the sidebar's
  background colour (F18 — collapsing must never hide one).
- Toggle: a 22px circular button on the sidebar's right edge, `aria-expanded`.

**The flyout must not be clipped.** `AdminSidebar`'s nav is `overflow-y-auto`
(`AdminSidebar.tsx:226`), which clips an absolutely-positioned child. Either render the
flyout outside that scroll container (fixed-position, offset computed from the icon's
`getBoundingClientRect()`), or drop `overflow-y-auto` in collapsed mode — 8 group icons fit
in any `lg` viewport without scrolling. **Take the second option**: no measurement code, no
scroll-desync, and it retires the `admin-sidebar-scroll-top` restore (`AdminSidebar.tsx:97-105`)
for the collapsed case only.

### 4.6 Edge cases

| Case | Behaviour |
|---|---|
| `dueInRange === 0` (e.g. a quiet pre-draw day — 2026-08-27 had 1) | Card shows `0`, no bar, sub reads "No renewals due"; `collectionRate` is `null`, never `0%` |
| `dueInRange > 0` but nothing attempted yet (all pending) | Bar is all grey; `collectionRate` is `null` → sub reads "None attempted yet", never "0% collected" |
| Range entirely before 2026-01-26 (F8) | Same as above. The table has no rows; that is genuine absence, not an error |
| `all-time` | `endDate` is now-ish → `isOpen` true, `pendingInRange` covers only the remainder of today. Denominator is ~17.6k lifetime cycles + today's remainder |
| Range spanning "now" (current-draw) | Handled by K3's `max(now, start)` with no branch |
| `now` between the cycle boundary and invoice finalisation (F3) | Member stays in `pendingInRange` (the window is the whole range, not `[now, end]`) until the cycle row appears, then moves to landed/failed. **Total stable, segments move** — this is exactly what F11 got wrong the first time |
| Closed range where a member's renewal date passed and Stripe never invoiced | Counted in `pendingInRange`, surfaced as the grey "did not renew" slice. Rare — 0 for 2026-09-01 (F12) — but a real anomaly rather than something to branch away |
| Failed renewal later recovered | Same row flips `failed → succeeded` (F10). A past range's failure count **decreases** over time. Documented on the card's popover as "outcomes update as retries resolve" |
| Member cancels mid-range | Drops out of `pendingInRange` (`autoRenew ≠ false`, F6), so the denominator shrinks slightly. Correct: they were never going to renew |
| Mongo timeout on any cohort query | `getAnalyticsBundle`'s existing `try/catch` (`DashboardStatsService.ts:566`) returns the zero-filled fallback; card renders "No renewals due" rather than a wrong fraction |
| Sidebar collapsed + `localStorage` throws (private mode) | `try/catch`, default expanded |
| Sidebar collapsed on a narrow desktop (`lg` ≈ 1024px) | Rail is strictly narrower; no new overflow risk |
| Flyout opened near the viewport bottom | Anchor `top` to the icon and allow it to extend upward via `max-height` + `bottom` clamp |

---

## 5. Threading checklist

| # | Where | What to add | Miss it and… | Mode |
|---|---|---|---|---|
| R1 | `src/types/admin/membershipAnalytics.ts:26-32` | `RenewalCohort` fields on `MembershipRenewalMetrics`; update the semantics comment block at `:5-9` | `tsc` fails at the service | **loud** |
| R2 | `MembershipAnalyticsService.ts:163-172` return | New keys in the returned bundle | `tsc` fails | **loud** |
| R3 | `DashboardStatsService.ts:597-602` | New keys in `membershipRenewals` | Client reads `undefined`; card renders `NaN of undefined` | **silent** |
| R4 | `DashboardStatsService.ts:568-576` **catch fallback** | Same new keys, zero-valued | Only on a membership-analytics failure — the exact moment nobody is watching. Card renders `NaN` | **silent** |
| R5 | `KpiGrid.tsx:139` `moneyExact(row.value)` | A count formatter for the renewals popover rows | Counts render as `$31`, `$20` — plausible and wrong | **silent** |
| R6 | `src/lib/internal-norm/schemas/dashboard.ts:21-24` | Drop `expectedInRange`, rename `failedInvoicesInRange` → `failedInvoiceAttemptsInRange`, add the cohort fields | Zod `responseSchema` mismatch → **runtime 500** on the Norm route; `tsc` cannot see it | **silent** |
| R7 | `src/app/api/internal/norm/v1/dashboard/stats/route.ts:37-41` | Same three changes in the projection | Same 500 as R6 | **silent** |
| R7b | `failedRenewalInvoicesInRange` rename call sites: `MembershipAnalyticsService.ts:83,167`, `types/admin/membershipAnalytics.ts:7,30`, `DashboardStatsService.ts:572,601`, `useAdminQueries.ts:104`, plus the comment at `periodComparisonModel.ts:309` | Rename to `failedInvoiceAttemptsInRange` | `tsc` fails on all but the comment; the comment silently keeps describing a field name that no longer exists | **loud** (comment: silent) |
| R8 | `docs/internal-norm/norm-context.md` | Describe the cohort semantics **and** that `failedInvoiceAttemptsInRange` counts retries, not members | Norm keeps answering with the old (wrong) meaning of "expected", and reads 124 failures as 124 members | **silent** |
| R9 | `npm run build:norm-manifest` | Regenerate `src/generated/normToolsManifest.json` | Published manifest drifts from the live schema | **silent** |
| R10 | `adminMobileDateToolbarSlot.ts` consumers | Both renamed exports, all import sites | `tsc` fails | **loud** |
| R11 | `AdminPage.tsx:195` | Drop `lg:hidden` | Desktop portals into a `display:none` slot → **the filter vanishes entirely on desktop** | **silent** |
| R12 | `AdminSidebar.tsx` collapsed branch | Attention-dot repositioning (F18) | A red flag disappears when collapsed; nobody notices the thing they were meant to notice | **silent** |
| R13 | `AdminSidebar.tsx` nav container | Remove `overflow-y-auto` in collapsed mode (§4.5) | Flyout is clipped by the scroll container; renders but is invisible | **silent** |
| R14 | Domain manifest / doc-sync | `docs/admin/`, `docs/subscription/`, `docs/internal-norm/` | Stop hook BLOCKS the turn | **loud** |

Control check on R6/R7: `grep -rn "membershipRenewals" src/lib/internal-norm/ src/app/api/internal/` → 2 files, 5 hits, both listed above. Control search `grep -rn "renewalProgress" src/lib/internal-norm/` → 0 hits, so `renewalProgress` is *not* mirrored to Norm and needs no lockstep.

---

## 6. Tests

No test runner; each suite is a `tsx` script with its own `test:*` script (CLAUDE.md).

| Test | File | Asserts | Covers |
|---|---|---|---|
| `test:renewal-cohort` (new) | `src/services/admin/__tests__/renewalCohort.test.ts` | Pure cohort-shaping fn over a status-bucket map: `collectionRate` is `null` (not `0`) both at `due === 0` and when `landed + failed === 0`; `isOpen` false when `end ≤ now`; pending window collapses to empty for a past range (K3) | R1–R2, §4.6 rows 1–5 |
| `test:renewal-cohort` | same | **A `refunded` bucket keeps `dueInRange` unchanged while appearing in neither numerator** — i.e. `due > landed + failed + pending` is a legal state, and an unknown future status behaves the same way | §4.1 (the identity trap) |
| `test:renewal-progress` (existing) | `src/utils/admin/__tests__/renewalProgress.test.ts` | Unchanged — the cycle line keeps its meaning (K13 boundary) | regression |
| `test:dashboard-stats` (extend) | `src/services/admin/__tests__/DashboardStatsService.test.ts` | The **catch fallback** object contains every new key with `0` | **R4** |
| `test:norm-dashboard-shape` (new) | `src/lib/internal-norm/__tests__/dashboardSchema.test.ts` | The Norm route's projection parses against `schemas/dashboard.ts` — the mismatch `tsc` cannot catch | **R6, R7** |
| `npm run norm:smoke` | existing script | End-to-end 200 on `/dashboard/stats` | R6–R9 |
| Manual, recorded in the PR | — | Desktop: filter visible in header at scroll top **and** bottom, on `overview` + one other tab; sidebar collapse survives reload; flyout not clipped; attention dot visible collapsed | R11, R12, R13 |

Coverage of the **silent** rows in §5, stated exhaustively so nothing hides in a summary:

| Row | Covered by |
|---|---|
| R4 | `test:dashboard-stats` fallback assertion |
| R6, R7 | `test:norm-dashboard-shape` + `norm:smoke` |
| R11, R12, R13 | manual pass (each is the row's whole failure mode: filter vanishes, dot vanishes, flyout invisible) |
| R3, R5 | manual pass — both fail visibly (`NaN of undefined`, `$31`) the first time the card renders |
| R8, R9, R7b-comment | doc/manifest artefacts; review + `norm:smoke` |

R1, R2, R10 and R7b's code sites are **loud** — `tsc` blocks the build.

`npm run lint && npm run type-check` gate every phase.

---

## 7. Phases

| # | Ships | User-visible win | Depends on |
|---|---|---|---|
| P1 | `RenewalCohort` type + service method + unit test | — (foundation; ships behind no flag because nothing reads it yet) | — |
| P2 | Transport: `DashboardStatsService` + client types + catch fallback; Norm schema, route, `norm-context.md`, manifest, smoke | Norm stops reporting a misnamed "expected" figure | P1 |
| P3 | `MetricCard.footer` + `SegmentedBar` + the new Renewals card face and popover | **The card answers the original question** | P2 |
| P4 | Date filter into the header; delete the sticky branch; renames | Filter stops covering content; page gains vertical space | — (independent) |
| P5 | Sidebar collapse: toggle, rail, flyouts, dot repositioning, persistence | Wide analytics tables get ~220px back | — (independent) |

P4 and P5 do not depend on P1–P3 and can be reordered freely. Docs (`docs/admin/`,
`docs/subscription/`, `docs/internal-norm/`) update inside the phase that changes the code,
per CLAUDE.md rule 2 — not as a trailing phase.

---

## 8. Rollback

No feature flags (CLAUDE.md rule 4 — commits are the rollback unit). Each phase is one
commit on `feature/admin-dashboard-ux`; nothing merges to `main` except via PR, so the
rollback for anything unmerged is dropping the branch.

| Phase | Revert consequence | In-flight work |
|---|---|---|
| P1–P3 | Card returns to `40 renewed · 20 past due`. **Read-only feature — no data is written, so there is nothing to reconcile.** | None |
| P2 | Norm's `expectedInRange` returns; `norm-context.md` must revert in the same commit or Norm describes a field that no longer exists | None |
| P4 | Sticky bar returns. Watch: `AdminPage.tsx` and `AdminDateRangeToolbar.tsx` must revert **together** — reverting only the toolbar leaves a desktop-visible slot with nothing portalled into it | None |
| P5 | Sidebar returns to fixed width. A stale `localStorage["admin-sidebar-collapsed"]` is then read by nothing — harmless, no cleanup needed | None |

**Recovery surface:** none required. Every change here is a read path over data written
elsewhere; there is no half-completed state a human would need to repair.

---

## 9. Open dependencies

| # | Item | Owner | Asked | Expected | Blocks |
|---|---|---|---|---|---|
| O1 | Confirm `User` index coverage for `{subscription.status, subscription.autoRenew, subscription.endDate}` — the `pendingInRange` count runs on every dashboard load. If uncovered, add the index before P3 | Claude (check via `explain()` on the prod-shaped query) | 2026-09-02 | before P3 | P1 → P3 |
| O2 | Confirm DJ wants historical failure counts to **improve** as dunning recovers them (F10), rather than freezing at day's end | DJ | 2026-09-02 | before P3 | P3 copy only |

Neither is a hard blocker: O1 degrades to a slow query (measurable, fixable in place), and
O2 changes one line of popover copy, not the data model.
