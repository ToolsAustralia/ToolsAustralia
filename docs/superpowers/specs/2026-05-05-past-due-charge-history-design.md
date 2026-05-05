# Past-Due Charge History — Admin Audit Tab

**Date:** 2026-05-05
**Status:** Design approved, ready for implementation plan
**Owner:** DJ

## Goal

Give admins a durable audit view of every "Charge Past Due Customers" execution: when each run happened, who triggered it, what was attempted, what succeeded, what failed, and how much revenue it recovered. Drill into any run to see the per-invoice attempts. List per-user manual retries (`/api/admin/users/[id]/charge-past-due`) in a separate section so they're audit-visible without polluting the bulk-run summary.

## Why now

The integration audit (see `docs/billing-stripe/gotchas.md` "Charge past-due — runbook") flagged that there is no aggregation of decline-code frequency anywhere in this repo. Operators have a *vibe* about how often `insufficient_funds` and other declines fire, but not a number. This tab is the cheapest way to make every run accountable: each row is one click → who got charged, who declined, why.

Adjacent fix in this branch: [`src/server/admin/chargePastDueShared.ts`](../../src/server/admin/chargePastDueShared.ts) now enforces the documented 24h DB skip window and `admin-charge-${invoiceId}` Stripe idempotency key. The history tab makes it visible whether that fix is actually preventing repeat-attempt bursts in production.

## Non-goals

- Backfilling `ChargeJobRun` documents for runs that happened before this ships. Older `InvoiceChargeLog` rows have `chargeRunId: null`; they appear in the "Manual Retries" section by definition. We accept this asymmetry.
- Real-time live updates of an in-flight run's progress. The run record is written at start and finalized at end; the UI polls on demand via TanStack Query.
- Surfacing decline-code frequency as a separate metric (a histogram of error codes). The drill-in already exposes per-row error codes; a dashboard view is a future iteration.
- Cron-driven orphan-run cleanup. The next bulk run cleans up its predecessor's wreckage (see "Orphan handling" below).

---

## Data model

### New: `src/models/ChargeJobRun.ts`

One document per bulk run.

```ts
interface IChargeJobRun {
  _id: ObjectId;
  adminId: ObjectId;        // ref User; indexed
  startedAt: Date;          // indexed desc
  finishedAt: Date | null;
  status: "running" | "completed" | "failed" | "aborted";
  totals: {
    eligibleCount: number;          // after list-phase filter
    attempted: number;              // reached stripe.invoices.pay
    succeeded: number;
    failed: number;
    skipped: {
      total: number;
      recentlyAttempted: number;    // 24h DB window
      noLongerPastDue: number;      // late re-check fired
      alreadyPaid: number;          // Stripe race: invoice paid by something else
      missingPaymentMethod: number;
      other: number;
    };
    revenueCents: number;           // sum of `amount` where status === "success"
  };
  error: string | null;     // populated when status === "failed"
}
```

Indexes:
- `{ startedAt: -1 }` (list page sort)
- `{ adminId: 1, startedAt: -1 }` (filter by admin)
- `{ status: 1, startedAt: 1 }` (orphan sweep)

### Modified: `src/models/InvoiceChargeLog.ts`

```diff
+ chargeRunId?: ObjectId | null   // sparse indexed
```

The link powers drill-in (`InvoiceChargeLog.find({ chargeRunId })`) and the manual-retry filter (`{ chargeRunId: null }`). Per-user manual retries write `null`; bulk runs write the run's `_id`.

Sparse index: `{ chargeRunId: 1, attemptedAt: -1 }`.

---

## Write side — `POST /api/admin/invoices/charge-past-due`

The route's existing protections stay (admin auth, `ChargeJobLock`, confirmation token, rate limits). New flow:

```
1. Existing: admin auth, mutex, confirmation token
2. NEW: orphan sweep — mark any prior ChargeJobRun where
   status="running" AND startedAt < (now - 35min) as "aborted"
   (35min = lock window 30min + buffer)
3. Existing: list invoices, map to users, filter by subscription.status="past_due"
4. NEW: insert ChargeJobRun {
     adminId, startedAt: now, status: "running",
     totals: { eligibleCount: eligibleInvoices.length, ...zeros }
   } → capture runId
5. Existing: batch loop calls payOpenInvoiceAsPastDueAdmin(...)
   — pass new optional chargeRunId: runId param
6. NEW: after the loop, recompute totals from
   InvoiceChargeLog.aggregate({ chargeRunId }) and update the run with
   { finishedAt: now, status: "completed", totals }
7. NEW: route-level try/catch — on uncaught exception, update the run with
   { finishedAt: now, status: "failed", error: msg } before re-throwing
```

Why aggregate at finalize time rather than incrementing in JS: the batch uses `Promise.allSettled`, so partial-batch failures don't surface to the caller. `InvoiceChargeLog` is the authoritative record. Aggregating from it post-hoc keeps the run totals consistent with the audit log even when a batch member crashes.

### Orphan handling

If the route process crashes mid-run, the `ChargeJobRun` row stays at `status: "running"`. The next bulk run's step 2 sweep will mark it `"aborted"` based on `startedAt < now - 35min`. No cron required.

The 35min window matches the existing `ChargeJobLock` 30min auto-expiry + 5min buffer for clock skew. A run that legitimately exceeds 35min would be a problem the lock catches first.

### `payOpenInvoiceAsPastDueAdmin` signature change

```ts
payOpenInvoiceAsPastDueAdmin(params: {
  invoice: Stripe.Invoice;
  paymentMethodId: string;
  customerId: string;
  user: LeanPastDueUser;
  adminId: string;
  chargeRunId?: ObjectId | null;   // NEW
}): Promise<PastDueChargeResultRow>
```

When `chargeRunId` is set, every `InvoiceChargeLog.create(...)` inside the function (success / failed / skipped paths) writes it. Per-user route from `/api/admin/users/[id]/charge-past-due` keeps calling without it → rows have `chargeRunId: null` → they appear in the manual-retries section.

### Late "still past-due?" re-check

Inside `payOpenInvoiceAsPastDueAdmin`, after the existing 24h recently-attempted check and before `stripe.invoices.pay`:

```ts
const freshUser = await User.findById(userIdStr)
  .select({ "subscription.status": 1 })
  .lean();

if (freshUser?.subscription?.status !== "past_due") {
  await InvoiceChargeLog.create({
    invoiceId, customerId, userId, adminId,
    status: "skipped",
    skipReason: "no_longer_past_due",
    amount,
    attemptedAt: new Date(),
    chargeRunId,
  });
  return { ..., status: "skipped", skipReason: "no_longer_past_due" };
}
```

Why: the bulk job filter runs at list time (step 3). With 500ms inter-batch delay and 15 invoices per batch, a 200-invoice run is ~7 minutes of wall time. A user can flip from `past_due` → `active` mid-run (Stripe's own retry succeeds; `pay-failed-invoice` succeeds from another tab; webhook processes a settlement). Without the late re-check we'd attempt a redundant charge. The single-document Mongo find is cheap.

This lives in the shared function, so per-user retry inherits the protection too — and per-user is *more* vulnerable to the race because the admin may click "Retry" minutes after page load.

---

## Read API

Three endpoints under a new namespace `src/app/api/admin/charge-past-due/`. All admin-only (`role === "admin"`); all delegate to `src/services/admin/chargePastDueHistory.ts` per the layering rules.

### `GET /api/admin/charge-past-due/runs`

```
Query: { startDate?, endDate?, adminId?, status?, limit=50, offset=0 }
Returns: {
  runs: [
    {
      _id, startedAt, finishedAt, durationMs,
      adminId, adminName,
      status,
      totals: { eligibleCount, attempted, succeeded, failed,
                skipped: { total, ... }, revenueCents }
    }
  ],
  total: number
}
Sort: startedAt desc.
```

### `GET /api/admin/charge-past-due/runs/[runId]`

```
Returns: {
  run: { ...full ChargeJobRun fields, adminName },
  rows: [
    {
      invoiceId, customerId, userId, userEmail,
      status, amount, attemptedAt,
      errorCode, errorMessage, skipReason
    }
  ]
}
```

Joins `InvoiceChargeLog.find({ chargeRunId })` with `User` for email lookup (single `$in` query, not per-row).

### `GET /api/admin/charge-past-due/manual-retries`

```
Query: { startDate?, endDate?, adminId?, status?, limit=50, offset=0 }
Filter: InvoiceChargeLog.find({ chargeRunId: null, ...filters })
Returns: { rows: [...same shape as run-detail rows + adminName], total }
```

---

## UI

### Tab wiring

- Add `"past-due-history"` to `[tab]/page.tsx` switch and `AdminPage.tsx` (subtitle: "History of bulk and manual past-due charge attempts").
- Sidebar entry next to `blocked-transactions` (both billing-side admin views). Label: **"Past-Due Charges"**.

### Component: `src/app/admin/component/PastDueChargeHistory.tsx`

```
[Date range picker]   [Admin filter]   [Status filter]

┌─ Bulk Runs ──────────────────────────────────────────────────────┐
│ Started        Admin     Elig  Att  ✓   ✗   ⊘  Revenue   Dur Stat│
│ 2026-05-05…    DJ          47   43   31  12   4 $9,300    2m  ✓  │  ← row click → drawer
│ ...                                                              │
└──────────────────────────────────────────────────────────────────┘

┌─ Manual Retries (per-user) ──────────────────────────────────────┐
│ When         Admin   User           Invoice    Stat  Amount Error│
│ 2026-05-05…  DJ      bob@x.com      in_1A2B…   ✗     $300   ins…│
│ ...                                                              │
└──────────────────────────────────────────────────────────────────┘

[pagination per table]
```

The "skipped" column (⊘) shows the total. Drill-in expands the breakdown (recentlyAttempted / noLongerPastDue / alreadyPaid / missingPaymentMethod / other) so an operator can see *why* attempts skipped. A row showing `eligible 50, attempted 0, succeeded 0, skipped.noLongerPastDue 50` tells you immediately "Stripe's own retry beat us to every one — nothing to do."

Drill-in: right-side drawer (matches existing admin-tab UX). Drawer header repeats the run summary; body is the full per-invoice list.

### Hooks under `src/hooks/queries/admin/`

- `useChargePastDueRuns(filter)` — list
- `useChargePastDueRunDetail(runId)` — drill-in
- `useChargePastDueManualRetries(filter)` — retries section

Cache keys: `["admin", "charge-past-due", "runs", filter]`, `["admin", "charge-past-due", "run", runId]`, `["admin", "charge-past-due", "manual-retries", filter]`.

---

## Tests

All tsx-script style under `__tests__/`, wired into `package.json` as `test:past-due-history` (extends existing `test:past-due-admin-charge`).

- **`chargePastDueShared.test.ts`** (existing file, new cases):
  - "writes `chargeRunId` to every InvoiceChargeLog row when passed" — fakes `InvoiceChargeLog.create` capturing args, asserts `chargeRunId` is present on success/failed/skipped paths.
  - "skips with reason `no_longer_past_due` when user's subscription.status changed mid-run" — fakes `User.findById` to return `active`, asserts no Stripe call + correct skip reason logged.
- **New `chargePastDueHistory.test.ts`** (pure aggregation helpers):
  - "totals.skipped breakdown counts skip reasons correctly" — feeds fake `InvoiceChargeLog` rows, asserts breakdown sums match.
  - "revenueCents = sum of amount where status === 'success'" — including a row with `status: 'failed'` and `amount > 0` to assert it's excluded.
  - "isOrphanRun returns true when status='running' and startedAt < now - 35min" — pure predicate.

No integration tests against live Mongo or Stripe — same approach as the rest of the codebase.

---

## Domain Manifest impact

The manifest's `admin` domain currently lists `src/server/admin/**`, `src/app/admin/**`, `src/components/admin/**`, `src/app/api/admin/**`, `src/features/admin/**`, and `src/utils/admin/**` — but **not** `src/services/admin/**` (only two specific files in that folder are listed under the `subscription` domain). The new files land as follows:

- `src/models/ChargeJobRun.ts` → **add** to the `admin` domain `paths` (sibling of the new `chargePastDueHistory.ts` service). `ChargeJobLock.ts` is *also* not in any current entry — fix in the same edit.
- `src/services/admin/chargePastDueHistory.ts` → **add** `src/services/admin/chargePastDueHistory.ts` (or the broader glob `src/services/admin/chargePastDueHistory.ts` only — do not broaden to `src/services/admin/**` since the subscription domain already claims two files in that folder).
- `src/app/api/admin/charge-past-due/**` → already covered by `src/app/api/admin/**` in the `admin` domain. ✓
- `src/app/admin/component/PastDueChargeHistory.tsx` → already covered by `src/app/admin/**`. ✓
- `src/hooks/queries/admin/usePastDueChargeRuns.ts` etc → already covered by `src/hooks/queries/**` in the `client-state` domain. ✓

Verify with the `doc-sync` hook at the end of implementation. If the hook reports orphans, invoke `registering-new-domain`.

## Documentation impact

- `docs/admin/backend.md` — describe the new shared service + the route flow change.
- `docs/admin/frontend.md` — describe the new tab + component.
- `docs/admin/api.md` — document the three new endpoints.
- `docs/admin/models.md` — describe `ChargeJobRun`.
- `docs/billing-stripe/gotchas.md` — cross-link the audit tab from the existing "Charge past-due — runbook" section.
