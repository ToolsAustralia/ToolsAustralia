# Renewal Rate metric — design (draw-aligned)

**Date:** 2026-05-29
**Status:** Approved (pending spec review)
**Domain:** `admin` (analytics dashboard) + reads from `subscription` models

## Problem

The admin dashboard has no honest **renewal rate**. The naive ratio
`renewal_revenue / status_revenue` (`107,720 / 130,940 = 82%`) is wrong: numerator and
denominator are different cohorts (renewals-this-range vs everyone-active-now-including-new).

We want: **of the members who started a draw period, what fraction renewed during it** —
counting card-decline (involuntary) and cancel-before-billing (voluntary) as non-renewals.

## Key realization: renewal is monthly ⇒ measure per draw, not per arbitrary range

A membership renews once a month. Arbitrary date ranges and "All Time" make the rate
meaningless (a 1-day window shows ~99%; All Time double-counts). And the source collections
only have reliable data from ~late April 2026 (see Data coverage). So the metric is
**draw-aligned** and only offered on monthly-cohort filters.

## Metric definition (validated against production)

**Base cohort (denominator)** = **active + past-due** subscription members **as of the first
day of the period**, read from `MembershipDailySnapshot` (sum `activeCount + pastDueCount`
across the 3 subscription packages). This is exactly the `N active · M past-due` already shown
on the statuses card. Including past-due (the "sleepers") is deliberate: they are live members
who owe a renewal, so a sleeper who pays during the draw is credited as renewed **and** was in
the denominator — which makes the rate **structurally ≤ 100%**. Using active-only would let a
wave of sleeper recoveries push the rate over 100%.

**Renewed (numerator)** = distinct base members with a **successful renewal payment landing in
the period** (`MembershipRenewalCycle` `status ∈ {succeeded, recovered/derived}`, **`succeededAt`
in period**). Payment-date (not due-date) matches the revenue card's renewal count and credits
sleeper recoveries whose original due date preceded the draw.

```
Renewal Rate = renewed / (active + past-due)   ∈ [0, 100%]
remainder = base − renewed − pending − churned   (= "expected to renew", still upcoming)
```

| Bucket | Source | Notes |
|---|---|---|
| **Base** | `MembershipDailySnapshot` `activeCount + pastDueCount` @ first day of period | denominator |
| **Renewed** | `MembershipRenewalCycle` succeeded/recovered, **`succeededAt` in period** | numerator (distinct users) |
| **Pending** | base members still `past_due`/`unpaid` at period end | in dunning |
| **Churned** | voluntary (`MembershipStatusHistory` cancel, `endDate` in period) + failed-permanent | lost |
| **Expected to renew** | `base − renewed − pending − churned` | not yet billed (current draw) |

`recovered` is **derived** (the status is never written — confirmed 0 stored): a failed cycle
counts as renewed if the user later has a succeeded cycle or returns to `active`/`trialing`.

### Per-filter behavior (Statuses card "as of" date + Renewal card visibility)

| Filter | Statuses card "as of" | Renewal Rate card |
|---|---|---|
| Today | today | hidden (sub-monthly) |
| Yesterday | yesterday | hidden |
| Last 30 Days | 30 days ago (base) | renewed in last 30d ÷ base |
| Current Draw | first day of current draw | renewed so far ÷ base, "+N expected" |
| Last Draw | first day of last draw | final rate |
| All Time | today | hidden |

**Tradeoff (accepted):** on a draw/30-day filter the Statuses card shows the period's
*starting* count, not today's live count. "Members right now" = Today or All Time.

### The burst pattern (important for the Current Draw card)

Billing anchors near the 24th; draws close on the 27th — so renewals happen in a **burst at
the end of each draw**. The current-draw % sits near ~3% for most of the month then jumps to
~90% in the final days. Therefore the **Current Draw card leads with the pipeline**
(`106 renewed · 3,752 expected`, progress bar) — not a misleading "2.7%". The **Last Draw**
(completed) card shows the meaningful final rate.

## Validation evidence (production)

Script: `scripts/find-renewal-rate.ts` (read-only). Modes: default (range buckets),
`--coverage`, `--draw` (current draw progress), `--last-draw` (final rate).

- **Last Draw (Apr 28–May 27):** base = active + past-due (Apr 29 snapshot, first day Apr 28
  not yet snapshotted) = **3,882** (3,503 active + 379 past-due). Renewed (payment in draw) =
  **3,178** (vs 3,185 by due-date — only 7 apart, so sleeper-recovery skew is small this month).
  **Final rate = 81.9%** (3,178 / 3,882). Active-only would read 90.7% but can exceed 100%.
  Naive `renewal_rev/status_rev` ≈ 82% was a coincidence on the wrong cohort.
- **Current Draw (2 days in):** base (May 27 snapshot) = 3,880 active, matching the dashboard.
  106 renewed (≈2.7%), rest expected — confirms the burst pattern and base reconstruction.
- **Data gap:** 0 cycles stored as `recovered`/`expected`; all recoveries derived.

## Data coverage (production — why per-draw only)

| Collection | Earliest reliable | Used by metric |
|---|---|---|
| `MembershipRenewalCycle` (subscription_cycle) | complete from **May 2026** (Apr partial, Jan–Mar failures-only) | yes |
| `MembershipStatusHistory` | **2026-04-28** | yes |
| `MembershipDailySnapshot` | **2026-04-29** | yes (base) |

Current Draw + Last Draw + Last 30 Days all fall inside this window. Older ranges would lie,
so they are not offered. No backfill in v1.

## Design

### Where the code goes (extend, don't add new patterns)
- **Service:** add a draw-aware `getRenewalProgress(periodStartDate, periodEndDate, baseDateKey)`
  alongside `MembershipAnalyticsService.getAnalyticsBundle()`
  ([MembershipAnalyticsService.ts:48](../../../src/services/admin/MembershipAnalyticsService.ts#L48)).
  Reuses: snapshot base sum = `activeCount + pastDueCount` (the service already reads
  `MembershipDailySnapshot`); renewed = distinct users with succeeded cycle `succeededAt`-in-period;
  voluntary churn via `MembershipStatusHistory` `endDate`-in-period. Logic mirrors
  `scripts/find-renewal-rate.ts` (`--last-draw`/`--draw` modes).
- **Type:** add `renewalProgress?: { base: number; renewed: number; pending: number; churned: number; expected: number; rate: number | null; isComplete: boolean }`
  to `MembershipAnalyticsBundle` ([types/admin/membershipAnalytics.ts](../../../src/types/admin/membershipAnalytics.ts)).
- **Statuses "as of" date:** the dashboard already resolves a per-filter date; extend that
  resolver so draw/30-day filters resolve to the period's first day (today for Today/All Time).
- **API:** no new route — rides existing `getAnalyticsBundle` consumers
  (`/api/admin/dashboard/stats`, `/api/admin/dashboard/membership-by-package`).
- **UI:** new "Renewal Rate" card (progress bar: renewed / expected / churned), shown only on
  Last 30 Days / Current Draw / Last Draw. Reuses existing card component + date filter.

### Performance
Snapshot base = one indexed `{date, packageId}` read. Cycle counts = indexed `dueAt` range.
Voluntary churn = indexed `endDate` range. Failed-cycle resolution batched (hundreds of rows).
No N+1.

## Out of scope (v1)
- Writing the `recovered`/`expected` cycle status (webhook change + backfill).
- Backfilling `MembershipRenewalCycle`/`MembershipStatusHistory` before the tracking window.
- Revenue-weighted (MRR) renewal rate — count-based only.
- Per-package renewal breakdown (Tradie/Foreman/Boss) — single blended rate.
- Renewal % on Today / Yesterday / All Time.

## Edge cases
- Joined-and-churned within the period: never had a renewal due ⇒ excluded (early-churn, separate metric).
- Period with zero base or zero due cycles: rate = `null`, card shows "—".
- Current draw very early: % near 0, "expected" dominates — by design (burst pattern).
- Base snapshot missing for the period's first day: fall back to nearest available snapshot day, label it.
