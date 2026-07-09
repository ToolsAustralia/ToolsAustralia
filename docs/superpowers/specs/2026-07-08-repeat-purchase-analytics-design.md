# Repeat Purchase Analytics (one-time package reconversion) — Design

**Date:** 2026-07-08 · **Status:** awaiting owner approval · **Branch:** `feature/admin-analytics`

## 1. Problem

The business tracks MRR-style analytics for subscriptions (MembershipAnalyticsService, Renewal
Rate, projected income) but has **nothing** for the one-time-package side of the revenue engine:
users who buy a one-time pack and **come back and buy again**. One-time entries don't carry
forward (Terms §5.3), so a one-time buyer must re-buy every draw cycle — repeat purchase *is*
the one-time equivalent of renewal. The admin needs:

1. KPI-level view: how many one-time buyers return, how fast, and what it's worth.
2. Time-to-reconversion distribution with windows: 1 day / 1 week / 1 month / 2 / 3 / 6 months.
3. A **fetchable user list** per window/segment (the actionable marketing cohort), with
   drill-down into the existing admin User Detail modal.
4. UI that is native to the existing admin pages — no new visual language.

## 2. Verified data foundation (production, probed read-only 2026-07-08)

- Source of truth: `paymentevents` — `eventType: "BenefitsGranted"`, `packageType: "one-time"`
  (single writer: `processPaymentBenefits` → `src/utils/payment/payment-processing.ts:493-512`;
  exactly one row per successful charge, enforced by unique `{paymentIntentId, eventType}`).
- Production volume: 29.6K events total; **3,081 one-time purchases by 2,349 distinct users**;
  396 repeat buyers (16.9%); repeat purchases are 36.6% of one-time volume. First→second gap:
  ~20% same-day, ~70% within 30 days.
- Data hygiene (verified): 0 admin-granted one-time rows, 0 zero/missing prices, 0 legacy
  eventType rows (`UpsellProcessed` etc. exist only as enum values, never in data). `data.price`
  is **dollars**. `packageName` is not canonical (legacy variants) — key on `packageId`.
- Refunds: 11 one-time `RefundProcessed` events. Netting convention "Option B" (exclude the whole
  BenefitsGranted row when a RefundProcessed shares its `paymentIntentId`) already exists:
  `src/utils/payment/payment-event-net-queries.ts` / precomputed-set variant in
  `src/services/admin/dashboard-stats/revenueAggregator.ts:119-122`.
- Heaviest per-user group/bucket pipeline runs in **~240 ms** against production. Indexes
  `{packageType, timestamp}` and `{userId, timestamp}` already exist.

## 3. Metric definitions (the contract)

**Countable one-time purchase** — `eventType: "BenefitsGranted" && packageType: "one-time"`,
minus rows whose `paymentIntentId` is in the all-time `RefundProcessed` set. No `processedBy`
or `price > 0` filter (verified unnecessary in production; filtering would risk undercounting
real purchases). Includes both public packs (`apprentice-pack` … `vip-pack`) and Additional
packs (`additional-*-pack`) — Additional pricing is literally the built-in repeat mechanic.

**Excluded from both anchor and comeback:** `packageType: "upsell"` (same-session appendage of
a base purchase — counting it would create false "<1 day comebacks"; the trigger linkage lives
only in `User.upsellPurchases[].triggeringPaymentIntentId`, not on PaymentEvent),
`packageType: "mini-draw"` (separate product, separate entry pool, $1–$10 price points would
dominate counts), `packageType: "membership"` (tracked by the existing membership analytics).

**First purchase (anchor)** — the user's earliest countable one-time purchase, all-time (data
begins at site launch 2025-11-27). If the first purchase was refunded, the earliest
*unrefunded* purchase becomes the anchor (falls out of the definition automatically).

**Repeat purchase (comeback)** — any later countable one-time purchase by the same `userId`.
`daysToReturn` = difference in **AEST calendar days** (`Australia/Sydney`, the repo-wide
convention) between anchor and the user's second countable purchase.

**Buckets (first→second gap):** `Same day` · `1–7d` · `7–30d` · `30–60d` · `60–90d` ·
`90–180d` · `180d+`. Same-day repeats are ~20% of repeat buyers in production — they are shown
as their own bucket, not silently dropped or merged.

**Return rate by window (matured denominators)** — for each window W ∈ {1, 7, 30, 60, 90, 180}
days: `eligible(W)` = users whose anchor is ≥ W days old (AEST); `returned(W)` = eligible users
whose second purchase came within W days; `rate = returned/eligible`. This avoids the
left-censoring lie (site is 7.4 months old — the 180d window has a tiny matured cohort). Same
"matured vs pending" concept as `Retention90Split` in cancellation analytics.

**`becameMember` flag (per user)** — true when a `packageType: "membership"` BenefitsGranted
with `data.billingReason !== "subscription_cycle"` (the established new-membership
discriminator, `revenueAggregator.ts:84-86`) exists after the anchor. Surfaced as a flag +
summary count, NOT an exclusion — one-time → member conversion is a different success story
the owner will want visible.

**Known limitation (documented in UI footnote):** identity is `userId`; the same human on two
emails counts as two users (no account-merge machinery exists in the codebase).

## 4. Architecture decision

**Chosen: live aggregation service (Approach A).**

- A) **Live aggregation** — one lean projected find over one-time BenefitsGranted (3,081 docs)
  + JS Map accumulation per user (the `revenueAggregator.ts` pattern), refund set precomputed,
  one auxiliary query for membership-conversion flags. ~240 ms measured; safe at 10–50×.
- B) **Daily snapshot precompute** (DashboardStatsDailySnapshot pattern) — REJECTED: repeat
  metrics are distinct-user/cross-day classifications, which this codebase already establishes
  as non-snapshot-summable (`DashboardStatsSnapshotReader.ts:259-263` recomputes distinct users
  live for exactly this reason). A snapshot would add a cron + model + backfill + drift-check
  for zero benefit. Revisit only if an all-time request ever exceeds ~2s.
- C) **Materialized per-user rollup** (fields on User / new collection maintained at payment
  time) — REJECTED: touches the payment write path (risk), duplicates derivable data, needs a
  backfill, unnecessary at this scale.

## 5. Naming

No existing identifier names this concept. Closest in-repo precedent:
`AffiliateCommission.isFirstTimePurchase` whose comment calls the inverse **"repeat
purchases"**. Feature name: **repeat-purchases / RepeatPurchase\***. Explicitly avoided
(vocabulary collisions verified): `returning` (= authenticated upsell segment), `retention`
(= cancellation-save offers), `winback`/`comeback` (= cancelled-membership funnel),
`reconversion`/`rebuy` (no precedent). This is a new coinage — flagged per the global
one-concept-one-name rule — used identically everywhere: tab id `repeat-purchases`, service
`repeatPurchaseAnalytics`, hook `useRepeatPurchaseAnalytics`.

## 6. Components

Layering follows `app → services → lib/models` exactly like cancellation-flow analytics.

### 6a. Service — `src/services/admin/repeatPurchaseAnalytics.ts`
Function-style module (sibling convention: `cancellationFlowAnalytics.ts`): a **pure shaper**
(events in → summary/rows out; unit-testable, no I/O) plus thin I/O wrappers. DTOs colocated
in the file. Computation:
1. `loadRefundedPaymentIntentIds()` (reuse from dashboard-stats).
2. Lean find: one-time BenefitsGranted, projected `{userId, packageId, packageName,
   data.price, timestamp, paymentIntentId}`, sorted by timestamp; drop refunded.
3. JS Map by userId → per-user rollup: anchor, second purchase, daysToReturn (AEST calendar
   days), count, totalSpent.
4. Cohort filter: optional `[startDate, endDate]` applied to the **anchor date**.
5. Membership-conversion flags: one query for new-membership events (`billingReason !==
   "subscription_cycle"`), Map userId → earliest date, flag if after anchor.
6. Shape: summary (KPIs, buckets, matured window rates) + paged user rows (filter by
   segment `returned | not-returned | all` and bucket; JS pagination — precedent:
   `UserAdminQueryService` computed-sort path).

### 6b. API — two thin routes under the existing analytics namespace
- `GET /api/admin/analytics/repeat-purchases` → summary.
- `GET /api/admin/analytics/repeat-purchases/users` → paged rows (`segment`, `bucket`, `page`,
  `limit ≤ 100`, `sort`).
Both: `export const dynamic = "force-dynamic"; export const runtime = "nodejs"`,
`requirePermission("pageAnalytics.view")` guard-instanceof pattern, Zod query schema with the
`^\d{4}-\d{2}-\d{2}$` date regex, AEST→UTC conversion exactly as the cancellation-flow route,
respond `{ success: true, data }` (the `analytics/*` sibling envelope). Returning
email/firstName/lastName in the drill-down under an analytics permission has direct precedent
(cancellation-flow `users-by-reason`).

**Permission: reuse `pageAnalytics.view`** for tab AND routes (consistent, unlike the
cancellation-flow tab/route mismatch). Precedent: analytics tabs reuse existing `.view`
permissions; the "Ads Manager" starter role already holds it; avoids a `permissions.ts` edit
(catalog change + BUSINESS.md trigger + custom-role re-grants). Alternative if the owner
prefers: `overview.view` (used by mer-by-draw / hourly-revenue).

### 6c. Client hooks — `src/hooks/queries/admin/useRepeatPurchaseAnalytics.ts`
Two hooks in one file (precedent: `useCancellationFlowAnalytics.ts`): summary +
users list. Keys `["admin", "analytics", "repeat-purchases", …]`, `enabled` gated on resolved
dates, staleTime ~5 min, unwrap `{success,data}`.

### 6d. UI — `src/components/admin/RepeatPurchaseAnalytics.tsx`
One tab component, structure cloned from `AllPlatformsManagement.tsx` / sibling analytics tabs:
- `useAdminDateFilter("all-time")` + `<AdminDateRangeToolbar filter={df} />` (cohort window =
  first-purchase date; "today" is meaningless for a cohort metric, so default all-time).
- KPI grid (`MetricCard`, the variant All-Platforms uses): One-time buyers · Repeat buyers ·
  Repeat rate · Median days to return · Repeat revenue (2nd+ purchases $) · Became members.
- Card "Time to second purchase": `BarList` of the 7 buckets (count + share).
- Card "Return rate by window": compact table `within 1d/7d/30d/60d/90d/180d — eligible /
  returned / rate`, footnote explaining matured denominators.
- Card "Users": `Segmented` (All / Returned / Not yet returned) + bucket filter, `DataTable`
  columns: User (`ClickableUserDisplay` → existing User Detail modal) · First purchase
  (date + pack) · Next purchase · Days to return · One-time purchases · Total spent · Member?
  Load-more pagination. Standard loading pulses / empty state / red error banner.
- Footnote: definitions (AEST days, refund-excluded, upsell/mini-draw excluded, per-account
  identity caveat). All styling = paired light/`dark:` Tailwind, kit from
  `@/components/admin/ui`, no chart library (none exists in the repo).

### 6e. Registration (3-file wiring + mobile slot)
`adminTabs.ts` → `{ id: "repeat-purchases", label: "Repeat Purchases", icon: Repeat,
requires: "pageAnalytics.view" }` in the `analytics` group; `AdminPage.tsx` → import +
conditional render + header subtitle line; `adminMobileDateToolbarSlot.ts` → add
`"repeat-purchases"` so the date dropdown portals into the mobile header.

### 6f. Test
tsx test for the pure shaper (synthetic events: same-day double-buy, refunded anchor,
membership interleave, maturity edges) + `test:repeat-purchase-analytics` script in
package.json (repo convention: every test file needs its npm script).

### 6g. Norm mirror (CLAUDE.md rule 10)
The analytics family is comprehensively mirrored (`analytics.hourly-revenue`,
`analytics.mer-by-draw`, cancellation-flow, …). Plan: **mirror the summary endpoint in the
same task** (registry entry + Zod schema + `/api/internal/norm/v1/analytics/repeat-purchases`
route + `npm run build:norm-manifest` + `norm-context.md` + `npm run norm:smoke`). The
users-list endpoint is mirrored only with the PII-safe projection (firstName + opaque userId)
— or deferred with an explicit flag if the owner prefers.

### 6h. Docs (hook-enforced)
`docs/admin/` (backend/frontend/api as applicable), `docs/client-state/` (new query hook),
`docs/internal-norm/norm-context.md` (if mirrored), one-line BUSINESS.md touch (new admin
analytics KPI surface).

## 7. Out of scope (deliberately)
- **Klaviyo activation (approved direction, phase 2):** add `first_one_time_purchase_date` +
  `last_one_time_purchase_date` to the existing profile sync (`klaviyo-helpers.ts` — today's
  `first/last_purchase_date` mix one-time + mini-draw + upsell dates) plus a dry-run-first
  backfill script (`backfill-klaviyo-membership-properties.ts` pattern). No pushed derivations
  (repeat flags/buckets) — Klaviyo derives targeting natively from `Placed Order`
  (`package_type` always emitted) + these dates; the winback flow itself is built in Klaviyo's
  UI with zero code. Trips the CUSTOMER.md hook (third-party data change) — update in-task.
- CSV export of the cohort (`users.export`-gated route + blob download) — cheap follow-up if
  wanted.
- Mini-draw comebacks as an opt-in toggle.
- Third/Nth-purchase gap analytics (first→second is the decision-driving metric).
- Per-package cohort split (packageId filter) — add later if used.
- Any snapshot/cron infrastructure (see §4).

## 8. Error handling
Service throws typed errors only for invalid ranges; routes map through `handleApiError` /
400-on-Zod-failure like siblings. Query failures surface as the standard red banner + retry
via TanStack defaults. Aggregations use `.lean()` and bounded projections; `allowDiskUse` not
needed at current volume but harmless to keep on the group query.

## 9. Verification plan
`npm run lint` · `npm run type-check` · `npm run test:repeat-purchase-analytics` ·
`npm run norm:smoke` (if mirrored) · manual: tab renders in light+dark, date presets, bucket
filters, user modal opens, numbers cross-checked against the production probe figures
(2,349 buyers / 396 repeat / bucket distribution) at all-time range.
