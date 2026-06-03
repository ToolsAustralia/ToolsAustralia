# Renewal Rate redesign + overview polish — design

**Date:** 2026-06-02
**Status:** Approved (pending spec review)
**Domain:** `admin` (dashboard overview) + reads from `subscription`/snapshot models

## Scope

Four independent changes to the post-revamp admin overview (`src/app/admin/component/overview/`):

1. **Renewal Rate card** — split into a cycle-anchored headline + a filter-driven slice.
2. **Membership Revenue tile → "MRR"** — relabel only.
3. **Upcoming Renewals** — show the (already-fetched) user count next to revenue.
4. **Layout** — move Advertising up under the KPI grid; Revenue Breakdown drops down.
5. **KPI card mobile sizing** — shrink value/icon/padding on mobile only.

Each is shippable on its own. Reference math: `scripts/find-renewal-rate.ts`.

---

## 1. Renewal Rate card

### Target UI
```
Renewal Rate                          ↻
81.9%  ·  3178/3882 renewed
──────────────────────────────────
Today: 12 renewed · 3 past due
```

Two zones with **different time bases**:

- **Headline (always the CURRENT draw cycle, filter-independent):**
  `{rate}%  ·  {renewed}/{base} renewed`
  - `base` = active + past-due members at cycle start, from `MembershipDailySnapshot` (nearest-day fallback). Same `getRenewalBaseAsOf` already in the service.
  - `renewed` = distinct members whose renewal payment landed between cycle start and now.
  - `rate` = `renewed/base`, capped ≤100%, null → "—" (existing `summarizeRenewalProgress`).
  - **Cycle window** = day after the last completed `MajorDraw.drawDate` (the 28th, since draws close on the 27th) → now, in AEST. Derived from draw data (auto-rolls monthly); never hardcode "27".
- **Slice (follows the selected date filter; label adapts):**
  `{RangeLabel}: {renewedInRange} renewed · {pastDueInRange} past due`
  - `renewedInRange` = `successfulRenewalUserCount` (already computed per-range in the bundle).
  - `pastDueInRange` = `becamePastDueInRange` (already computed per-range in the bundle).
  - `RangeLabel` = Today / Yesterday / Current Draw / Last Draw / All Time / the custom range, derived from `dateRange`.

### Removed from the earlier iteration
- "still expected" line (Upcoming-Renewals-derived) — dropped.
- Standing "currently past due" line — dropped (past-due now lives only in the slice).

Net effect: the card needs **no Upcoming-Renewals data** and only one genuinely new backend piece — the cycle-anchored headline (the slice reuses metrics already in the response).

### Backend changes
`MembershipAnalyticsService.getAnalyticsBundle` currently computes `renewalProgress` only for `dateRange ∈ {current-draw, last-draw}` (it reuses `startDate` as the cycle start). The headline must be cycle-anchored **regardless of filter**, so:

- Add a method `getCurrentCycleRenewalProgress(): Promise<RenewalProgress>` that:
  1. Resolves the current cycle window: `cycleStart` = (last completed `MajorDraw.drawDate` + 1 day, AEST midnight); `cycleEnd` = now. (Mirror `scripts/find-renewal-rate.ts --draw` and `/api/admin/major-draw/current-and-last`.)
  2. `base, baseAsOf` = `getRenewalBaseAsOf(cycleStart)`.
  3. `renewed` = distinct `userId` from `MembershipRenewalCycle` where `billingReason:"subscription_cycle"`, `status ∈ {succeeded, recovered}`, `succeededAt ∈ [cycleStart, now]`. (Payment-date window — matches the validated 3,178 number; do NOT reuse the filter-scoped `successfulRenewalUserCount` here, that's range-scoped.)
  4. Return `summarizeRenewalProgress({ base, renewed, baseAsOf, isComplete: false })` (current cycle is always open).
- In `getAnalyticsBundle`, replace the draw-gated `renewalProgress` block with an **always-on** call to `getCurrentCycleRenewalProgress()`. So `renewalProgress` is present on every response and always describes the current cycle.
- `successfulRenewalUserCount` and `becamePastDueInRange` already vary by the request's `dateRange` — these feed the slice. No new computation; they're already returned and already surfaced on `stats.users.membershipRenewals` (`succeededDistinctMembers`, `becamePastDueInRange`).

### Frontend changes (`sections/KpiGrid.tsx`)
- Headline reads `users.renewalProgress` (now always present): `value = rate%`, append `· {renewed}/{base} renewed` inline (one row, to save horizontal space).
- Slice reads `users.membershipRenewals.succeededDistinctMembers` (renewed) and `users.membershipRenewals.becamePastDueInRange` (past due) + a `dateRange→label` map. Drop the old `mr.succeededInRange/expectedInRange` fallback rate (headline no longer falls back — it's always cycle-anchored).
- The card now renders on every filter (no visibility gate).

### Known limitation (documented, not a bug)
Headline `renewed` (cycle invoice payments, includes past-due-then-paid) and the slice `past due` (status transitions) come from different sources/windows, so the slice and headline are intentionally different lenses — the slice is "what happened in the selected range," the headline is "cumulative cycle progress." They are not meant to sum.

---

## 2. Membership Revenue → "MRR"

`sections/KpiGrid.tsx` "Membership Revenue" tile already shows `summary.totalActiveRevenue` = `Σ(activeCount × monthly package price)` (packages confirmed monthly: tradie $20 / foreman $40 / boss $80). Pure relabel: title `"Membership Revenue"` → `"MRR"`. Keep value + `{active} active · {pastDue} past due` sub-line + breakdown. No recompute. Update README/BUSINESS only if either asserts the label (they don't — skip).

---

## 3. Upcoming Renewals — add user count

`GET /api/admin/dashboard/upcoming-renewals` already returns `total` (distinct users, `User.countDocuments(filter)`). `UpcomingRenewalsCard.tsx` renders only `totalRevenue`. Add the count next to revenue, e.g. `{money} expected · {total.toLocaleString("en-AU")} members`. No backend change.

---

## 4. Layout reorder (`DashboardOverview.tsx`)

Current order: KpiGrid → Charts(RevenueChart + MembershipCard) → [RevenueBreakdown | Advertising] row → PrizePerformance → [TopDraws | UpcomingRenewals] → [Activity | QuickActions] → UsersBreakdown.

Target: move `AdvertisingPlatformCard` to render **immediately after `<KpiGrid>`** (KpiGrid ends with the Users & Performance group). `RevenueBreakdownCard` drops to where the breakdown/charts row was. New order:
KpiGrid → **Advertising** → Charts → **Revenue Breakdown** → PrizePerformance → [TopDraws | UpcomingRenewals] → [Activity | QuickActions] → UsersBreakdown.
`AdvertisingPlatformCard` only needs `stats` + `loading` (both in scope). Decide full-width vs. its own row during implementation to match sibling spacing.

---

## 5. KPI card mobile sizing (`components/admin/ui/MetricCard.tsx`)

Mobile-only reductions; desktop (`sm:`) unchanged:

| Element | Current | New |
|---|---|---|
| Value | `text-2xl sm:text-[27px]` | `text-lg sm:text-[27px]` |
| Icon box | `w-9 h-9` | `w-7 h-7 sm:w-9 sm:h-9` |
| Icon glyph | `w-[18px] h-[18px]` | `w-4 h-4 sm:w-[18px] sm:h-[18px]` |
| Padding | `p-4 sm:p-[18px]` | `p-3 sm:p-[18px]` |

One file; applies uniformly to every KPI tile. The `Popover` value (`text-xl`) is unaffected.

---

## Out of scope
- Writing the `recovered`/`expected` `MembershipRenewalCycle` status; backfill.
- Revenue-weighted (MRR) renewal rate; per-package renewal breakdown.
- Reworking the Upcoming Renewals query (its active/auto-renew filter is left as-is; it is NOT used as the rate denominator).
- "still expected" / standing past-due lines on the card (explicitly cut).

## Edge cases
- No completed draw to anchor the cycle → headline base 0 → rate "—", card still renders the slice.
- Snapshot missing for cycle-start day → nearest-later-day fallback (existing).
- Slice on All Time → `becamePastDueInRange`/`succeededDistinctMembers` may be large; acceptable (counts, not a rate).
- Custom range with no label → show the formatted date range as the slice label.
