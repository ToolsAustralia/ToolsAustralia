# Advertising card — per-platform source breakdown drill-down

**Date:** 2026-06-04
**Branch:** feature/mer-table
**Status:** Design — awaiting review
**Scope:** Admin Overview. New live read (service + route + hook) + Advertising-card interaction (hover popover) + a new drill-down modal, **plus a Norm mirror** of the new read. Domains: `admin` (docs/admin/) and `internal-norm` (docs/internal-norm/).
**Relationship to existing specs:** Extends [Part A — True-ROAS Overview card](2026-06-02-advertising-true-roas-design.md) and obeys the cross-cutting invariants in the [Advertising Analytics Suite master spec](2026-06-03-advertising-analytics-suite-master-spec.md) §3.1. This drill-down is a **new addition** not in the original A/B/C/D decomposition.

## Problem

The Overview "Advertising" card shows each channel's attributed revenue + true ROAS, but a row is a dead end — you can see Facebook drove `$56,603.12 / 1,729 new`, but not **what** that revenue is made of (memberships? one-time packs? upsells?). The existing "Revenue breakdown" card answers "what" globally (across all channels) and already drills into a per-category user list via `RevenueDetailModal`. We want the same "what's inside this number" drill-down, but **scoped to one ad platform**.

## What we're building (locked in brainstorming)

1. **Hover** a platform row → a small popover showing that platform's attributed revenue split across the 5 **acquisition** source categories (bars + $ + count), via the existing `BarList`.
2. **Click** a platform row → a modal that shows those same **breakdown bars on top**, plus a **searchable user/purchase list** below with a **category filter** (All / Membership New / One-Time First / One-Time Add'l / Mini Draws / Upsells).
3. **All rows are interactive** — Meta, TikTok, Snapchat, Klaviyo Email, Klaviyo SMS, and Direct. (e.g. "what is Direct revenue actually made of".)
4. **Renewals excluded** — acquisition-only, so the breakdown sums to the row's attributed total and matches the card.

## Key constraints honored (master-spec §3.1)

- **Platform basis = `convertingPlatform`**, never `data.utmSource`. The new query filters/aggregates on `convertingPlatform`. *(invariant #1)*
- **Renewal exclusion = `packageType==='membership' && data.billingReason==='subscription_cycle'`**, never the `isRenewal` flag. This matches `getRevenueDetails`' existing `membership-purchase` filter. *(invariant #2)*
- **Refunds = whole-row Option B** — reuse `fetchNetBenefitsGrantedWithMatch`, which already nets against the all-time `RefundProcessed` set. Partial refunds remain not-subtracted (known carry-forward limitation). *(invariant #4)*
- **Category definitions mirror the snapshot bucketer** `classifyRevenueBucket` (dashboard-stats/snapshotSchema.ts) — the classifier that drives the card's per-platform revenue — so the drill-down bars reconcile with the snapshot-driven Advertising + Revenue-breakdown cards. (Deliberately the snapshot rule, **not** `getRevenueDetails`' narrower `-pack$` one-time matcher; a test asserts the lockstep.)

## Design

### 1. Service — `src/services/admin/platformRevenueBreakdown.ts` (new)

A single function powering hover popover, modal bars, and modal list:

```ts
getPlatformRevenueBreakdown(input: {
  platform: AttributedPlatformKey;          // meta | tiktok | snapchat | klaviyo_email | klaviyo_sms | google | direct | other
  startDate: Date; endDate: Date;
  category?: AcquisitionCategory;           // 5-value type defined in this module; omitted → list spans all 5 (with a category label per row)
  page: number; limit: number;
  summaryOnly?: boolean;                    // hover path — skip user hydration
}): Promise<PlatformRevenueBreakdownData>
```

Logic:
1. **One** `fetchNetBenefitsGrantedWithMatch` query: `eventType:'BenefitsGranted'`, `timestamp` in range, `convertingPlatform: platform`, acquisition package types only (`membership` non-renewal, `one-time`, `mini-draw`, `upsell`), renewals excluded by `data.billingReason !== 'subscription_cycle'`.
2. Classify each event **in memory** via a shared pure helper `classifyAcquisitionCategory(event)` → one of the 5 categories (or `null` = exclude). This is the single source of truth for the buckets.
3. `byCategory`: 5 zero-filled entries `{ category, revenue, purchaseCount, userCount }`.
4. If `category` set, keep only that bucket's events for the list.
5. Group by user → paginate → hydrate via the shared `hydrateRevenueUserRows` helper in `dashboardSlices.ts` (also used by `getRevenueDetails`, so the two buyer lists can't drift).
6. `summaryOnly` returns after step 3 (no user query).

Returns `{ platform, byCategory, totalRevenue, totalPurchases, totalUsers, users[], pagination }`. `users[]` rows reuse the existing `RevenueDetailsUserRow` shape so the modal can reuse `RevenueDetailModal`'s `UserList`.

**`getRevenueDetails` keeps its exact output** — refactored to call the shared `hydrateRevenueUserRows` helper (behavior-preserving); the Norm `/revenue-details` route now shares the `toNormRevenueUserRow` PII projection. Output shape + `NormRevenueDetailsSchema` are unchanged (verified by `norm:smoke`).

### 2. API — `src/app/api/admin/dashboard/revenue-details/by-platform/route.ts` (new)

`GET ?platform=&dateRange=&startDate=&endDate=&category?=&page=&limit=&summaryOnly=`.
Thin handler: `requirePermission("overview.view")` (same as siblings) → validate `platform` ∈ the 8 `ConvertingPlatform` values and `category?` ∈ the 5 acquisition categories → reuse `resolveRevenueDetailsRange` → delegate → return `{ success, data }`.

### 3. Hook — `usePlatformRevenueBreakdown(...)` in `src/hooks/queries/useAdminQueries.ts`

TanStack Query alongside `useRevenueDetails`, keyed by `platform + dateRange + (start/end) + category + page + summaryOnly`. The hover (`summaryOnly`) variant uses a longer `staleTime`; `enabled` gated on an open/hovered platform so it doesn't fetch for every row at once.

### 4. UI

- **`AdvertisingPlatformCard.tsx`** — rows become interactive for **all** platforms incl. Direct:
  - `onClick` → open `PlatformRevenueModal` for that platform.
  - `onMouseEnter` (pointer-fine only) → fetch + show a `BarList` popover anchored to the row.
  - Thread `dateRange / startDate / endDate / onUserClick` in as props from `DashboardOverview` (the same props `RevenueBreakdownCard` already receives) so the modal/hook know the active window. Touch/mobile users get the bars inside the modal (hover is a pointer-fine enhancement only).
- **`PlatformRevenueModal`** (new, under `src/components/modals/`) — composes the already-extracted `RevenueDetailModal/` primitives (`ModalContainer`, `ModalHeader`, `FilterToolbar`, `UserList`, `Pagination`) + `BarList` for the top breakdown + a category filter control (All + 5). The modal **opens with the filter on "All"** (full acquisition list for the platform, category column shown); selecting a category re-scopes the list while the bars stay full. Leaves `RevenueDetailModal` itself unchanged (lower risk). Header shows `platform label — $total · N new`.

### 5. Reconciliation

The live per-platform acquisition sum should equal the card's `attributedRevenue[platform].newRevenue` (snapshot) for **settled** ranges (last-draw, past custom ranges), because both use the same `convertingPlatform` grouping + `billingReason` renewal predicate + all-time refund set (master-spec invariants #1/#2/#4). For the **still-accumulating current day**, the live read may differ slightly from the snapshot by in-flight events (snapshot lag) — acceptable and consistent with how "today" is already handled elsewhere; surface a subtle note only if a visible mismatch is observed during verification.

## Files

| File | Change |
|------|--------|
| `src/services/admin/platformRevenueBreakdown.ts` | **New.** `getPlatformRevenueBreakdown` + `classifyAcquisitionCategory` + types. |
| `src/app/api/admin/dashboard/revenue-details/by-platform/route.ts` | **New.** Thin permission-gated GET → service. |
| `src/hooks/queries/useAdminQueries.ts` | Add `usePlatformRevenueBreakdown` + its response type. |
| `src/app/admin/component/overview/sections/AdvertisingPlatformCard.tsx` | Row click/hover; popover; new props threaded from `DashboardOverview`. |
| `src/app/admin/component/overview/sections/advertisingCardModel.ts` | Add `platformKey` to the row VM + export shared `ACQUISITION_CATEGORY_META` / `moneyExact` (reused by card + modal). |
| `src/components/admin/ui/DataTable.tsx` | Add optional `onRowMouseEnter` / `onRowMouseLeave` (backward-compatible) for the hover popover. |
| `src/app/admin/component/overview/DashboardOverview.tsx` | Pass `dateRange/startDate/endDate/onUserClick` into `AdvertisingPlatformCard`. |
| `src/components/modals/PlatformRevenueModal/*` | **New.** Bars + filterable user list, composed from `RevenueDetailModal/` primitives. |
| `src/lib/internal-norm/classification.ts` | Add the `dashboard.revenue-details.by-platform` registry entry. |
| `src/lib/internal-norm/schemas/dashboard.ts` | Add `NormPlatformRevenueBreakdownSchema`. |
| `src/app/api/internal/norm/v1/dashboard/revenue-details/by-platform/route.ts` | **New.** `withNorm` wrapper → same service, PII-safe projection. |
| `src/generated/normToolsManifest.json` | Regenerated by `npm run build:norm-manifest`. |
| `docs/internal-norm/norm-context.md` | Describe the new Norm tool (CLAUDE §10 lockstep). |
| `docs/admin/*` | Document the new read + the drill-down (required by the doc-sync Stop hook for `src/app/admin/**` + `src/app/api/admin/**`). |
| `src/services/admin/__tests__/platformRevenueBreakdown.test.ts` + `package.json` `test:*` entry | **New.** Classifier + reconciliation test. |

No model changes, no migration, no new dependency, no snapshot/aggregator change.

## Rule 10 / Norm — mirrored (in scope)

This read **is** mirrored to Norm, so the assistant can answer "what is platform X's revenue made of" in **one** pre-aggregated call instead of fanning out many `revenue-details` calls (which today can't even filter by platform) and computing the split itself — saving context and avoiding a wrong derivation.

Lockstep work (all in this task, per CLAUDE §10):
1. **Registry** — add a `dashboard.revenue-details.by-platform` (read tier, `overview.view`) entry to `src/lib/internal-norm/classification.ts`.
2. **Schema** — add `NormPlatformRevenueBreakdownSchema` to `src/lib/internal-norm/schemas/dashboard.ts` (validated at runtime by `withNorm`; a schema↔output mismatch is a 500 `tsc` can't catch).
3. **Route** — `src/app/api/internal/norm/v1/dashboard/revenue-details/by-platform/route.ts`, `withNorm({ tier:"read", registryKey, requiredPermission:"overview.view", responseSchema })`, wrapping the **same** `getPlatformRevenueBreakdown` service (satisfies the `norm-must-import-service` eslint rule). **PII-safe projection:** `byCategory` + totals + a user list of `firstName` (only) + opaque `userId`, mirroring the existing `revenue-details` Norm route.
4. **Manifest** — `npm run build:norm-manifest` (regenerates `src/generated/normToolsManifest.json`).
5. **Context** — update `docs/internal-norm/norm-context.md` describing the new tool.
6. **Verify** — `npm run norm:smoke` (catches schema/output drift).

**Existing Norm surface unchanged (output):** `getRevenueDetails` was refactored behavior-preservingly (shared `hydrateRevenueUserRows`) and the `/revenue-details` Norm route now shares the `toNormRevenueUserRow` projection; the emitted shape + `NormRevenueDetailsSchema` are unchanged. The new tool is additive.

## Testing

- `tsx` test for `classifyAcquisitionCategory` covering each category + renewal/other exclusion (membership renewal, additional- one-time, mini-draw, upsell, no-packageId one-time).
- **Reconciliation test:** the summed `byCategory` revenue for a platform over a fixed window equals the acquisition revenue computed the snapshot way (same refund set + `billingReason` predicate + `convertingPlatform`) — the guardrail that the drill-down agrees with the card.

## Verification

- `npm run type-check`, `npm run lint`, the new `test:*`, and `npm run norm:smoke` all clean.
- Manual: hover Facebook → popover bars; click → modal with bars on top summing to `$56,603.12`, filter switches the user list; Direct and Klaviyo rows also drill in; switching the date filter re-scopes both bars and list.

## Non-goals / future

- Reusing this modal for the MER table's per-platform expand (possible later; not built now — YAGNI).
- A persisted platform×category rollup (live read is index-bounded via `{ convertingPlatform: 1, timestamp: -1 }`; no snapshot change).
- Including renewals in the drill-down (excluded by design to reconcile with the acquisition-only card).
- Subtracting partial refunds / fees / COGS (inherits the suite's whole-row Option-B refund limitation).
