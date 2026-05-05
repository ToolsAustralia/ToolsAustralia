# Past-Due Charge History — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an admin tab that audits every past-due-charge run (bulk + per-user manual retries) with date, who, totals, revenue, and drill-in to per-invoice attempts. Adds a late "still past-due?" re-check inside the shared charge function so neither path can charge a user whose status flipped mid-run.

**Architecture:** New `ChargeJobRun` model captures one document per bulk run; `InvoiceChargeLog` gains a sparse `chargeRunId` linking each per-invoice row back to its run. Bulk route `POST /api/admin/invoices/charge-past-due` inserts the run on start, sweeps prior orphans, finalizes totals at end. Three thin admin GET endpoints feed three TanStack Query hooks driving a single page component with two tables (bulk runs, manual retries) plus a drill-in drawer.

**Tech Stack:** Next.js 15 App Router, MongoDB/Mongoose, NextAuth (admin role), TanStack Query v5, Stripe SDK 18.5, tsx test scripts.

**Important — auto-commit gate:** This repo's `.claude/hooks/no-auto-commit.mjs` blocks `git commit` / `git add` / `git push` unless the most recent user message contains an explicit keyword (`commit`, `push`, etc.). Each task's commit step is **the orchestrator's job, not the subagent's** — the subagent should implement+test, then return for review. The orchestrator pauses for the user's commit keyword between tasks. **Do not have a subagent run `git commit`.**

**Spec:** [docs/superpowers/specs/2026-05-05-past-due-charge-history-design.md](../specs/2026-05-05-past-due-charge-history-design.md)

---

## File map

**Create:**
- `src/models/ChargeJobRun.ts` — new model
- `src/server/admin/charge-past-due-totals.ts` — pure aggregation/orphan helpers
- `src/server/admin/__tests__/charge-past-due-totals.test.ts` — helper tests
- `src/services/admin/chargePastDueHistory.ts` — read-side service
- `src/services/admin/__tests__/chargePastDueHistory.test.ts` — service helper tests
- `src/app/api/admin/charge-past-due/runs/route.ts` — list runs
- `src/app/api/admin/charge-past-due/runs/[runId]/route.ts` — run detail
- `src/app/api/admin/charge-past-due/manual-retries/route.ts` — manual retries list
- `src/hooks/queries/admin/useChargePastDueRuns.ts`
- `src/hooks/queries/admin/useChargePastDueRunDetail.ts`
- `src/hooks/queries/admin/useChargePastDueManualRetries.ts`
- `src/app/admin/component/PastDueChargeHistory.tsx` — page component
- `src/app/admin/component/PastDueChargeHistoryDrawer.tsx` — drill-in drawer

**Modify:**
- `src/models/InvoiceChargeLog.ts` — add `chargeRunId` field + sparse index
- `src/server/admin/chargePastDueShared.ts` — accept `chargeRunId` param, write it on every log row, add late "still past-due?" check
- `src/app/api/admin/invoices/charge-past-due/route.ts` — orphan sweep + insert run + finalize
- `src/app/admin/[tab]/page.tsx`, `src/app/admin/component/AdminPage.tsx`, `src/app/admin/component/AdminSidebar.tsx` — wire `past-due-history` tab
- `package.json` — add `test:past-due-history` script
- `CLAUDE.md` Domain Manifest — add `ChargeJobRun.ts`, `ChargeJobLock.ts`, and `chargePastDueHistory.ts` paths to admin domain
- `docs/admin/{backend,frontend,api,models}.md` — describe new surfaces
- `docs/billing-stripe/gotchas.md` — cross-link from runbook

---

## Task 1: Add `chargeRunId` to InvoiceChargeLog

**Files:**
- Modify: `src/models/InvoiceChargeLog.ts`

- [ ] **Step 1: Add the field, type, and sparse index**

In `src/models/InvoiceChargeLog.ts`:

```ts
// Update the IInvoiceChargeLog interface — add chargeRunId between result and the interface end:
export interface IInvoiceChargeLog extends Document {
  invoiceId: string;
  customerId: string;
  userId: mongoose.Types.ObjectId;
  adminId: mongoose.Types.ObjectId;
  status: "success" | "failed" | "skipped";
  errorCode?: string;
  errorMessage?: string;
  amount: number;
  attemptedAt: Date;
  canRetryAt?: Date;
  nextPaymentAttempt?: Date;
  result?: Record<string, unknown>;
  chargeRunId?: mongoose.Types.ObjectId | null; // null/absent for per-user manual retries
}
```

In the schema definition (after the `result` field, before the closing `}` of the schema fields object), add:

```ts
    chargeRunId: {
      type: Schema.Types.ObjectId,
      ref: "ChargeJobRun",
      required: false,
      default: null,
    },
```

After the existing index declarations, add:

```ts
// Sparse index for run drill-in (chargeRunId set) and manual-retries filter (chargeRunId null)
InvoiceChargeLogSchema.index(
  { chargeRunId: 1, attemptedAt: -1 },
  { sparse: true }
);
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 3 (orchestrator only): Commit**

```bash
git add src/models/InvoiceChargeLog.ts
git commit -m "feat(billing): add chargeRunId link from InvoiceChargeLog to ChargeJobRun"
```

---

## Task 2: Create `ChargeJobRun` model

**Files:**
- Create: `src/models/ChargeJobRun.ts`

- [ ] **Step 1: Write the model**

Create `src/models/ChargeJobRun.ts`:

```ts
import mongoose, { Document, Schema } from "mongoose";

export type ChargeJobRunStatus = "running" | "completed" | "failed" | "aborted";

export interface ChargeJobRunSkippedBreakdown {
  total: number;
  recentlyAttempted: number;
  noLongerPastDue: number;
  alreadyPaid: number;
  missingPaymentMethod: number;
  other: number;
}

export interface ChargeJobRunTotals {
  eligibleCount: number;
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: ChargeJobRunSkippedBreakdown;
  revenueCents: number;
}

export interface IChargeJobRun extends Document {
  adminId: mongoose.Types.ObjectId;
  startedAt: Date;
  finishedAt: Date | null;
  status: ChargeJobRunStatus;
  totals: ChargeJobRunTotals;
  error: string | null;
}

const SkippedBreakdownSchema = new Schema<ChargeJobRunSkippedBreakdown>(
  {
    total: { type: Number, required: true, default: 0 },
    recentlyAttempted: { type: Number, required: true, default: 0 },
    noLongerPastDue: { type: Number, required: true, default: 0 },
    alreadyPaid: { type: Number, required: true, default: 0 },
    missingPaymentMethod: { type: Number, required: true, default: 0 },
    other: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const TotalsSchema = new Schema<ChargeJobRunTotals>(
  {
    eligibleCount: { type: Number, required: true, default: 0 },
    attempted: { type: Number, required: true, default: 0 },
    succeeded: { type: Number, required: true, default: 0 },
    failed: { type: Number, required: true, default: 0 },
    skipped: { type: SkippedBreakdownSchema, required: true, default: () => ({}) },
    revenueCents: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const ChargeJobRunSchema = new Schema<IChargeJobRun>(
  {
    adminId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    startedAt: { type: Date, required: true, default: Date.now },
    finishedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["running", "completed", "failed", "aborted"],
      required: true,
      default: "running",
    },
    totals: { type: TotalsSchema, required: true, default: () => ({}) },
    error: { type: String, default: null },
  },
  { timestamps: false }
);

ChargeJobRunSchema.index({ startedAt: -1 });
ChargeJobRunSchema.index({ adminId: 1, startedAt: -1 });
ChargeJobRunSchema.index({ status: 1, startedAt: 1 });

const modelName = "ChargeJobRun";
if (mongoose.models[modelName]) {
  delete mongoose.models[modelName];
}

export default mongoose.model<IChargeJobRun>(modelName, ChargeJobRunSchema);
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 3 (orchestrator only): Commit**

```bash
git add src/models/ChargeJobRun.ts
git commit -m "feat(admin): add ChargeJobRun model for past-due charge audit history"
```

---

## Task 3: Pure aggregation + orphan helpers (TDD)

**Files:**
- Create: `src/server/admin/charge-past-due-totals.ts`
- Create: `src/server/admin/__tests__/charge-past-due-totals.test.ts`
- Modify: `package.json` (add `test:past-due-history` script)

- [ ] **Step 1: Write the failing test**

Create `src/server/admin/__tests__/charge-past-due-totals.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  ORPHAN_RUN_THRESHOLD_MS,
  aggregateRunTotals,
  isOrphanRun,
  type ChargeLogRowForAggregation,
} from "../charge-past-due-totals";

function row(overrides: Partial<ChargeLogRowForAggregation>): ChargeLogRowForAggregation {
  return {
    status: "success",
    amount: 0,
    skipReason: undefined,
    ...overrides,
  };
}

function testEmptyRowsZeroes() {
  const t = aggregateRunTotals([]);
  assert.equal(t.attempted, 0);
  assert.equal(t.succeeded, 0);
  assert.equal(t.failed, 0);
  assert.equal(t.skipped.total, 0);
  assert.equal(t.revenueCents, 0);
}

function testSucceededAndRevenueSum() {
  const t = aggregateRunTotals([
    row({ status: "success", amount: 1500 }),
    row({ status: "success", amount: 2500 }),
  ]);
  assert.equal(t.attempted, 2);
  assert.equal(t.succeeded, 2);
  assert.equal(t.revenueCents, 4000);
}

function testFailedExcludedFromRevenue() {
  const t = aggregateRunTotals([
    row({ status: "success", amount: 1000 }),
    row({ status: "failed", amount: 9999 }), // amount on failed row must NOT count
  ]);
  assert.equal(t.succeeded, 1);
  assert.equal(t.failed, 1);
  assert.equal(t.revenueCents, 1000);
}

function testSkippedBreakdown() {
  const t = aggregateRunTotals([
    row({ status: "skipped", skipReason: "recently_attempted", amount: 100 }),
    row({ status: "skipped", skipReason: "recently_attempted", amount: 200 }),
    row({ status: "skipped", skipReason: "no_longer_past_due", amount: 300 }),
    row({ status: "skipped", skipReason: "already_paid", amount: 400 }),
    row({ status: "skipped", skipReason: "missing_payment_method", amount: 500 }),
    row({ status: "skipped", skipReason: "weird_reason_we_dont_recognise", amount: 600 }),
    row({ status: "skipped", skipReason: undefined, amount: 700 }),
  ]);
  assert.equal(t.skipped.total, 7);
  assert.equal(t.skipped.recentlyAttempted, 2);
  assert.equal(t.skipped.noLongerPastDue, 1);
  assert.equal(t.skipped.alreadyPaid, 1);
  assert.equal(t.skipped.missingPaymentMethod, 1);
  assert.equal(t.skipped.other, 2); // unrecognised + undefined
  assert.equal(t.attempted, 0); // skipped never count toward attempted
  assert.equal(t.revenueCents, 0); // skipped never contribute revenue
}

function testAttemptedExcludesSkipped() {
  const t = aggregateRunTotals([
    row({ status: "success", amount: 100 }),
    row({ status: "failed" }),
    row({ status: "skipped", skipReason: "recently_attempted" }),
  ]);
  assert.equal(t.attempted, 2); // success + failed only
}

function testOrphanThresholdConstant() {
  assert.equal(ORPHAN_RUN_THRESHOLD_MS, 35 * 60 * 1000);
}

function testIsOrphanRunPositive() {
  const now = new Date("2026-05-05T12:00:00Z");
  const startedAt = new Date(now.getTime() - 36 * 60 * 1000); // 36min ago
  assert.equal(isOrphanRun({ status: "running", startedAt }, now), true);
}

function testIsOrphanRunNotOrphanIfRecent() {
  const now = new Date("2026-05-05T12:00:00Z");
  const startedAt = new Date(now.getTime() - 10 * 60 * 1000); // 10min ago
  assert.equal(isOrphanRun({ status: "running", startedAt }, now), false);
}

function testIsOrphanRunNotOrphanIfFinished() {
  const now = new Date("2026-05-05T12:00:00Z");
  const startedAt = new Date(now.getTime() - 60 * 60 * 1000); // 1h ago
  assert.equal(isOrphanRun({ status: "completed", startedAt }, now), false);
  assert.equal(isOrphanRun({ status: "failed", startedAt }, now), false);
  assert.equal(isOrphanRun({ status: "aborted", startedAt }, now), false);
}

function run() {
  testEmptyRowsZeroes();
  testSucceededAndRevenueSum();
  testFailedExcludedFromRevenue();
  testSkippedBreakdown();
  testAttemptedExcludesSkipped();
  testOrphanThresholdConstant();
  testIsOrphanRunPositive();
  testIsOrphanRunNotOrphanIfRecent();
  testIsOrphanRunNotOrphanIfFinished();
  console.log("charge-past-due-totals tests passed");
}

run();
```

- [ ] **Step 2: Add npm script**

In `package.json`, add (alphabetical-ish near existing test:past-due-admin-charge):

```json
"test:past-due-history": "tsx src/server/admin/__tests__/charge-past-due-totals.test.ts",
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:past-due-history`
Expected: FAIL with "Cannot find module '../charge-past-due-totals'".

- [ ] **Step 4: Implement the helpers**

Create `src/server/admin/charge-past-due-totals.ts`:

```ts
/**
 * Pure helpers for ChargeJobRun aggregation + orphan detection.
 *
 * Stripe-free + Mongoose-free so they can be unit-tested without env vars or DB.
 */

import type { ChargeJobRunTotals } from "@/models/ChargeJobRun";

/** Orphan-run cleanup window — 30min lock auto-expiry + 5min skew buffer. */
export const ORPHAN_RUN_THRESHOLD_MS = 35 * 60 * 1000;

/** Minimal row shape needed for totals aggregation — matches InvoiceChargeLog. */
export interface ChargeLogRowForAggregation {
  status: "success" | "failed" | "skipped";
  amount: number;
  skipReason?: string;
}

const KNOWN_SKIP_REASONS = new Set([
  "recently_attempted",
  "no_longer_past_due",
  "already_paid",
  "missing_payment_method",
]);

function bumpSkipBucket(
  totals: ChargeJobRunTotals,
  reason: string | undefined
): void {
  totals.skipped.total += 1;
  switch (reason) {
    case "recently_attempted":
      totals.skipped.recentlyAttempted += 1;
      break;
    case "no_longer_past_due":
      totals.skipped.noLongerPastDue += 1;
      break;
    case "already_paid":
      totals.skipped.alreadyPaid += 1;
      break;
    case "missing_payment_method":
      totals.skipped.missingPaymentMethod += 1;
      break;
    default:
      // Unknown skipReason or undefined — count as "other" so we never lose a row.
      if (!reason || !KNOWN_SKIP_REASONS.has(reason)) {
        totals.skipped.other += 1;
      }
      break;
  }
}

/** Build a fresh empty totals object — no shared references. */
export function emptyTotals(eligibleCount: number = 0): ChargeJobRunTotals {
  return {
    eligibleCount,
    attempted: 0,
    succeeded: 0,
    failed: 0,
    skipped: {
      total: 0,
      recentlyAttempted: 0,
      noLongerPastDue: 0,
      alreadyPaid: 0,
      missingPaymentMethod: 0,
      other: 0,
    },
    revenueCents: 0,
  };
}

/**
 * Aggregate per-invoice attempt rows into ChargeJobRun totals.
 *
 * Rules:
 * - `attempted` counts success + failed only (skipped never reached Stripe).
 * - `revenueCents` sums `amount` only when `status === "success"`.
 * - Skip reasons are bucketed; unknown / missing reasons land in `other`.
 */
export function aggregateRunTotals(
  rows: readonly ChargeLogRowForAggregation[],
  eligibleCount: number = 0
): ChargeJobRunTotals {
  const totals = emptyTotals(eligibleCount);
  for (const r of rows) {
    if (r.status === "success") {
      totals.attempted += 1;
      totals.succeeded += 1;
      totals.revenueCents += r.amount;
    } else if (r.status === "failed") {
      totals.attempted += 1;
      totals.failed += 1;
    } else {
      bumpSkipBucket(totals, r.skipReason);
    }
  }
  return totals;
}

/** True when a `running` ChargeJobRun has aged past the cleanup threshold. */
export function isOrphanRun(
  run: { status: "running" | "completed" | "failed" | "aborted"; startedAt: Date },
  now: Date = new Date()
): boolean {
  if (run.status !== "running") return false;
  return now.getTime() - run.startedAt.getTime() >= ORPHAN_RUN_THRESHOLD_MS;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:past-due-history`
Expected: PASS — "charge-past-due-totals tests passed".

- [ ] **Step 6: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 7 (orchestrator only): Commit**

```bash
git add src/server/admin/charge-past-due-totals.ts \
        src/server/admin/__tests__/charge-past-due-totals.test.ts \
        package.json
git commit -m "test(admin): add pure helpers for ChargeJobRun totals + orphan detection"
```

---

## Task 4: Plumb `chargeRunId` through `payOpenInvoiceAsPastDueAdmin`

**Files:**
- Modify: `src/server/admin/chargePastDueShared.ts`

This adds an optional `chargeRunId` param that gets stamped on every `InvoiceChargeLog` row written inside the function (success / failed / skipped paths, including the existing `recently_attempted` short-circuit). Per-user route keeps calling without the param → rows write `null`.

- [ ] **Step 1: Update the param type and propagate to all log writes**

In `src/server/admin/chargePastDueShared.ts`, find the `payOpenInvoiceAsPastDueAdmin` function. Change the params type:

```ts
export async function payOpenInvoiceAsPastDueAdmin(params: {
  invoice: Stripe.Invoice;
  paymentMethodId: string;
  customerId: string;
  user: LeanPastDueUser;
  adminId: string;
  chargeRunId?: mongoose.Types.ObjectId | null;
}): Promise<PastDueChargeResultRow> {
  const { invoice, paymentMethodId, customerId, user, adminId, chargeRunId = null } = params;
  // ... rest unchanged
```

Then in **every** `InvoiceChargeLog.create(...)` call inside this function (there are four — recently_attempted skip, success, already_paid skip, failed), add `chargeRunId,` to the document. For example, the recently_attempted block becomes:

```ts
  if (recentAttempt) {
    await InvoiceChargeLog.create({
      invoiceId,
      customerId,
      userId: new mongoose.Types.ObjectId(userIdStr),
      adminId: new mongoose.Types.ObjectId(adminId),
      status: "skipped",
      amount,
      attemptedAt: new Date(),
      errorMessage: `Skipped: prior attempt at ${recentAttempt.attemptedAt.toISOString()} within ${RECENT_ATTEMPT_WINDOW_HOURS}h window`,
      chargeRunId,
    });
    // ...
  }
```

Apply the same `chargeRunId,` addition to the success path's `InvoiceChargeLog.create`, the `resource_already_exists` / already-paid catch path's `InvoiceChargeLog.create`, and the generic failure path's `InvoiceChargeLog.create`. Do not change the `skipReason` strings.

Also: in the recently_attempted skip path, **standardise the `skipReason` string to** `"recently_attempted"` (it should already be that — verify; this is the value the totals helper buckets).

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 3: Run existing tests to confirm no regression**

Run: `npm run test:past-due-admin-charge && npm run test:past-due-history && npm run test:stripe-collection-pause`
Expected: all PASS.

- [ ] **Step 4 (orchestrator only): Commit**

```bash
git add src/server/admin/chargePastDueShared.ts
git commit -m "feat(admin): propagate chargeRunId through payOpenInvoiceAsPastDueAdmin log writes"
```

---

## Task 5: Add late "still past-due?" check (TDD)

**Files:**
- Modify: `src/server/admin/past-due-charge-idempotency.ts` (add pure predicate + skip-reason constant)
- Modify: `src/server/admin/__tests__/chargePastDueShared.test.ts` (add test for predicate)
- Modify: `src/server/admin/chargePastDueShared.ts` (call the check before stripe.invoices.pay)

The integration with `User.findById` is the orchestration's job and stays untested (codebase pattern). The pure predicate `shouldSkipForNotPastDue(status)` is testable.

- [ ] **Step 1: Write the failing test**

In `src/server/admin/__tests__/chargePastDueShared.test.ts`, add at the bottom (before `run()`):

```ts
import { shouldSkipForNotPastDue, SKIP_REASON_NO_LONGER_PAST_DUE } from "../past-due-charge-idempotency";

function testSkipReasonConstantStable() {
  assert.equal(SKIP_REASON_NO_LONGER_PAST_DUE, "no_longer_past_due");
}

function testShouldSkipWhenStatusActive() {
  assert.equal(shouldSkipForNotPastDue("active"), true);
}

function testShouldSkipWhenStatusUndefined() {
  assert.equal(shouldSkipForNotPastDue(undefined), true);
  assert.equal(shouldSkipForNotPastDue(null), true);
  assert.equal(shouldSkipForNotPastDue(""), true);
}

function testShouldNotSkipWhenStatusPastDue() {
  assert.equal(shouldSkipForNotPastDue("past_due"), false);
}

function testShouldNotSkipWhenStatusPastDueWithUppercase() {
  // Defensive: normalise like the existing renewal flow does
  assert.equal(shouldSkipForNotPastDue("Past_Due"), false);
}
```

Then add to the `run()` body:

```ts
  testSkipReasonConstantStable();
  testShouldSkipWhenStatusActive();
  testShouldSkipWhenStatusUndefined();
  testShouldNotSkipWhenStatusPastDue();
  testShouldNotSkipWhenStatusPastDueWithUppercase();
```

- [ ] **Step 2: Run test — expect failure**

Run: `npm run test:past-due-admin-charge`
Expected: FAIL — `shouldSkipForNotPastDue` / `SKIP_REASON_NO_LONGER_PAST_DUE` not exported.

- [ ] **Step 3: Implement the helper**

Append to `src/server/admin/past-due-charge-idempotency.ts`:

```ts
/** Skip-reason value written to InvoiceChargeLog when the late re-check fires. */
export const SKIP_REASON_NO_LONGER_PAST_DUE = "no_longer_past_due" as const;

/**
 * Pure predicate gating the late `subscription.status` re-check inside
 * payOpenInvoiceAsPastDueAdmin. Returns true when the user is no longer
 * eligible for an admin-driven charge attempt.
 */
export function shouldSkipForNotPastDue(
  status: string | null | undefined
): boolean {
  if (!status) return true;
  return status.toLowerCase() !== "past_due";
}
```

- [ ] **Step 4: Run test — expect pass**

Run: `npm run test:past-due-admin-charge`
Expected: PASS.

- [ ] **Step 5: Wire the check into the orchestration**

In `src/server/admin/chargePastDueShared.ts`, near the top imports add:

```ts
import User from "@/models/User";
import {
  RECENT_ATTEMPT_WINDOW_HOURS,
  SKIP_REASON_NO_LONGER_PAST_DUE,
  buildAdminChargeIdempotencyKey,
  cutoffForRecentAttempt,
  shouldSkipForNotPastDue,
} from "./past-due-charge-idempotency";
```

(Update the existing `re-export` block too so `shouldSkipForNotPastDue` and `SKIP_REASON_NO_LONGER_PAST_DUE` get re-exported.)

Inside `payOpenInvoiceAsPastDueAdmin`, **after** the existing `recentAttempt` skip block and **before** the `try { const paidInvoiceResponse = await stripe.invoices.pay(...)` call, add:

```ts
  // Late re-check — user's subscription.status may have flipped from past_due
  // to active mid-run (Stripe's own retry won, or pay-failed-invoice succeeded
  // in another tab). Skip rather than charge a now-current customer.
  const freshUser = await User.findById(userIdStr)
    .select({ "subscription.status": 1 })
    .lean();

  if (shouldSkipForNotPastDue(freshUser?.subscription?.status as string | undefined)) {
    await InvoiceChargeLog.create({
      invoiceId,
      customerId,
      userId: new mongoose.Types.ObjectId(userIdStr),
      adminId: new mongoose.Types.ObjectId(adminId),
      status: "skipped",
      amount,
      attemptedAt: new Date(),
      errorMessage: `Skipped: subscription.status is "${freshUser?.subscription?.status ?? "(missing)"}", no longer past_due`,
      chargeRunId,
    });

    return {
      invoiceId,
      customerId,
      userId: userIdStr,
      userEmail,
      status: "skipped",
      skipReason: SKIP_REASON_NO_LONGER_PAST_DUE,
      amount,
    };
  }
```

- [ ] **Step 6: Type-check + tests**

Run: `npm run type-check && npm run test:past-due-admin-charge && npm run test:past-due-history`
Expected: all green.

- [ ] **Step 7 (orchestrator only): Commit**

```bash
git add src/server/admin/past-due-charge-idempotency.ts \
        src/server/admin/__tests__/chargePastDueShared.test.ts \
        src/server/admin/chargePastDueShared.ts
git commit -m "feat(admin): late \"still past-due?\" re-check before stripe.invoices.pay"
```

---

## Task 6: Bulk route — orphan sweep + ChargeJobRun lifecycle

**Files:**
- Modify: `src/app/api/admin/invoices/charge-past-due/route.ts`

The route currently has the structure: admin auth → mutex → list invoices → filter → batch loop. We're inserting four new things: orphan sweep right after lock acquisition, run insert right after the eligible-invoice filter, runId pass-through into `payOpenInvoiceAsPastDueAdmin`, and run finalize after the batch loop (with try/catch wrap).

- [ ] **Step 1: Add imports + helpers**

Top of `src/app/api/admin/invoices/charge-past-due/route.ts`, add:

```ts
import ChargeJobRun from "@/models/ChargeJobRun";
import InvoiceChargeLog from "@/models/InvoiceChargeLog";
import {
  ORPHAN_RUN_THRESHOLD_MS,
  aggregateRunTotals,
  type ChargeLogRowForAggregation,
} from "@/server/admin/charge-past-due-totals";
```

(`ChargeJobLock` import is already there.)

- [ ] **Step 2: Insert the orphan sweep**

Right after the `await ChargeJobLock.create(...)` / `await lock.save()` block (the spot where the lock is acquired) and BEFORE `try { // 4. Fetch eligible invoices ...`, add:

```ts
    // Orphan sweep: any prior ChargeJobRun stuck in "running" past the lock window
    // was almost certainly killed by a process crash. Mark them aborted so the
    // history view doesn't show indefinite "running" rows.
    await ChargeJobRun.updateMany(
      {
        status: "running",
        startedAt: { $lt: new Date(Date.now() - ORPHAN_RUN_THRESHOLD_MS) },
      },
      {
        $set: {
          status: "aborted",
          finishedAt: new Date(),
          error: "Aborted by orphan sweep — exceeded lock window without finalize",
        },
      }
    );
```

- [ ] **Step 3: Insert the run record**

Find the line `// 7. Filter invoices based on all criteria` and the `eligibleInvoices.filter(...)` block. **After** the filter completes and `eligibleInvoices` is populated, but **before** the `for (let i = 0; i < eligibleInvoices.length; i += BATCH_SIZE)` loop, add:

```ts
      // Insert the run record — status="running" until finalize block runs.
      // Captures eligible count even if no invoices end up attempted.
      const chargeRun = await ChargeJobRun.create({
        adminId: new mongoose.Types.ObjectId(adminId),
        startedAt: new Date(),
        status: "running",
        totals: { eligibleCount: eligibleInvoices.length },
      });
      const chargeRunId = chargeRun._id;
```

- [ ] **Step 4: Pass `chargeRunId` to every per-invoice call**

Find the `payOpenInvoiceAsPastDueAdmin({ invoice, paymentMethodId, customerId, user: ..., adminId })` call in the batch loop. Add the new field:

```ts
            const row = await payOpenInvoiceAsPastDueAdmin({
              invoice,
              paymentMethodId,
              customerId,
              user: { _id: user._id, email: user.email },
              adminId,
              chargeRunId,
            });
```

- [ ] **Step 5: Wrap the batch loop in try/finally that finalizes the run**

Wrap the batch loop section in a try/catch/finally. Find the existing `for (let i = 0; ...)` loop and the lines AFTER it that release the lock (before the `return NextResponse.json(...)` at the end of the success path). Restructure to:

```ts
      try {
        // existing for (let i = 0; ...) batch loop stays here unchanged
        // ...

        // Finalize: aggregate authoritative totals from InvoiceChargeLog
        const logRows = await InvoiceChargeLog.find({ chargeRunId })
          .select({ status: 1, amount: 1, errorMessage: 1, _id: 0 })
          .lean();

        const aggregationRows: ChargeLogRowForAggregation[] = logRows.map((r) => {
          // Decode skipReason from errorMessage prefix the shared function writes,
          // OR fall back to mapping by errorMessage content. The shared function
          // writes errorMessage like 'Skipped: <prefix>...' for skip rows; for
          // simplicity we re-fetch results[] from the in-memory `results` array below.
          return {
            status: r.status,
            amount: r.amount,
            skipReason: undefined, // placeholder — replaced below
          };
        });

        // Pull skipReason from the in-memory `results` array, which has it explicitly.
        const skipReasonByInvoice = new Map(
          results
            .filter((r) => r.status === "skipped")
            .map((r) => [r.invoiceId, r.skipReason])
        );
        for (let i = 0; i < aggregationRows.length; i++) {
          const row = aggregationRows[i];
          if (row.status === "skipped") {
            // Match by index — logRows order matches the InvoiceChargeLog write order
            // for this run, but we don't have invoiceId in the projection. Re-project.
          }
        }

        // Simpler: aggregate directly from the in-memory `results` array, which has
        // both status and skipReason. logRows is only used as a sanity cross-check.
        const aggregationFromResults: ChargeLogRowForAggregation[] = results.map((r) => ({
          status: r.status,
          amount: r.amount ?? 0,
          skipReason: r.skipReason,
        }));

        const finalTotals = aggregateRunTotals(
          aggregationFromResults,
          eligibleInvoices.length
        );

        await ChargeJobRun.updateOne(
          { _id: chargeRunId },
          {
            $set: {
              finishedAt: new Date(),
              status: "completed",
              totals: finalTotals,
            },
          }
        );
      } catch (runError) {
        const message = runError instanceof Error ? runError.message : String(runError);
        await ChargeJobRun.updateOne(
          { _id: chargeRunId },
          {
            $set: {
              finishedAt: new Date(),
              status: "failed",
              error: message,
            },
          }
        );
        throw runError;
      }
```

(Note: the simpler approach — aggregating from the in-memory `results` array — is correct because that array is what the route already builds for the response. We don't need to re-query `InvoiceChargeLog`.)

Drop the placeholder `aggregationRows`/`skipReasonByInvoice` block — the cleaner version is just:

```ts
      try {
        // existing for (let i = 0; ...) batch loop stays here unchanged
        // ...

        const aggregationRows: ChargeLogRowForAggregation[] = results.map((r) => ({
          status: r.status,
          amount: r.amount ?? 0,
          skipReason: r.skipReason,
        }));
        const finalTotals = aggregateRunTotals(
          aggregationRows,
          eligibleInvoices.length
        );

        await ChargeJobRun.updateOne(
          { _id: chargeRunId },
          {
            $set: {
              finishedAt: new Date(),
              status: "completed",
              totals: finalTotals,
            },
          }
        );
      } catch (runError) {
        const message = runError instanceof Error ? runError.message : String(runError);
        await ChargeJobRun.updateOne(
          { _id: chargeRunId },
          {
            $set: {
              finishedAt: new Date(),
              status: "failed",
              error: message,
            },
          }
        );
        throw runError;
      }
```

The lock-release and final response code stays after this try/catch, untouched.

- [ ] **Step 6: Type-check + lint**

Run: `npm run type-check && npx eslint src/app/api/admin/invoices/charge-past-due/route.ts`
Expected: no errors.

- [ ] **Step 7: Run existing tests**

Run: `npm run test:past-due-admin-charge && npm run test:past-due-history`
Expected: all PASS.

- [ ] **Step 8 (orchestrator only): Commit**

```bash
git add src/app/api/admin/invoices/charge-past-due/route.ts
git commit -m "feat(admin): record ChargeJobRun lifecycle in past-due bulk endpoint"
```

---

## Task 7: Read-side service — `chargePastDueHistory.ts`

**Files:**
- Create: `src/services/admin/chargePastDueHistory.ts`
- Create: `src/services/admin/__tests__/chargePastDueHistory.test.ts`
- Modify: `package.json` (extend the existing `test:past-due-history` script to include this new test, OR add a new `test:past-due-history-service` script)

The service has three functions: `listChargeRuns`, `getChargeRunDetail`, `listManualRetries`. The query-building logic (date range, admin filter, status filter) is pure and unit-testable; the actual Mongoose calls go through the model directly.

- [ ] **Step 1: Write the failing test**

Create `src/services/admin/__tests__/chargePastDueHistory.test.ts`:

```ts
import assert from "node:assert/strict";
import { Types } from "mongoose";
import {
  buildRunsFilter,
  buildManualRetriesFilter,
  formatDurationMs,
  type RunsFilterInput,
  type ManualRetriesFilterInput,
} from "../chargePastDueHistory";

function testRunsFilterEmptyReturnsEmptyObject() {
  const f = buildRunsFilter({});
  assert.deepEqual(f, {});
}

function testRunsFilterDateRange() {
  const f = buildRunsFilter({
    startDate: new Date("2026-05-01T00:00:00Z"),
    endDate: new Date("2026-05-05T23:59:59Z"),
  });
  assert.ok(f.startedAt);
  assert.equal((f.startedAt as { $gte: Date }).$gte.toISOString(), "2026-05-01T00:00:00.000Z");
  assert.equal((f.startedAt as { $lte: Date }).$lte.toISOString(), "2026-05-05T23:59:59.000Z");
}

function testRunsFilterAdminId() {
  const id = new Types.ObjectId();
  const f = buildRunsFilter({ adminId: id });
  assert.equal(String((f.adminId as Types.ObjectId)), String(id));
}

function testRunsFilterStatus() {
  const f = buildRunsFilter({ status: "completed" });
  assert.equal(f.status, "completed");
}

function testRunsFilterIgnoresInvalidStatus() {
  // unknown status strings must NOT poison the filter
  const f = buildRunsFilter({ status: "garbage" as RunsFilterInput["status"] });
  assert.equal(f.status, undefined);
}

function testManualRetriesFilterAlwaysSetsChargeRunIdNull() {
  const f = buildManualRetriesFilter({});
  assert.equal(f.chargeRunId, null);
}

function testManualRetriesFilterDateRange() {
  const f = buildManualRetriesFilter({
    startDate: new Date("2026-05-01T00:00:00Z"),
    endDate: new Date("2026-05-05T23:59:59Z"),
  });
  assert.ok(f.attemptedAt);
}

function testFormatDurationMs() {
  assert.equal(formatDurationMs(null), "—");
  assert.equal(formatDurationMs(0), "0s");
  assert.equal(formatDurationMs(30 * 1000), "30s");
  assert.equal(formatDurationMs(2 * 60 * 1000), "2m");
  assert.equal(formatDurationMs(2 * 60 * 1000 + 30 * 1000), "2m 30s");
  assert.equal(formatDurationMs(60 * 60 * 1000), "1h");
}

function run() {
  testRunsFilterEmptyReturnsEmptyObject();
  testRunsFilterDateRange();
  testRunsFilterAdminId();
  testRunsFilterStatus();
  testRunsFilterIgnoresInvalidStatus();
  testManualRetriesFilterAlwaysSetsChargeRunIdNull();
  testManualRetriesFilterDateRange();
  testFormatDurationMs();
  console.log("chargePastDueHistory tests passed");
}

run();
```

- [ ] **Step 2: Update the test:past-due-history script in package.json**

Change the existing entry to chain both:

```json
"test:past-due-history": "tsx src/server/admin/__tests__/charge-past-due-totals.test.ts && tsx src/services/admin/__tests__/chargePastDueHistory.test.ts",
```

- [ ] **Step 3: Run test — expect failure**

Run: `npm run test:past-due-history`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the service**

Create `src/services/admin/chargePastDueHistory.ts`:

```ts
import type { FilterQuery, Types } from "mongoose";
import ChargeJobRun, {
  type IChargeJobRun,
  type ChargeJobRunStatus,
} from "@/models/ChargeJobRun";
import InvoiceChargeLog, { type IInvoiceChargeLog } from "@/models/InvoiceChargeLog";
import User from "@/models/User";

const VALID_RUN_STATUSES: ReadonlySet<ChargeJobRunStatus> = new Set([
  "running",
  "completed",
  "failed",
  "aborted",
]);

export interface RunsFilterInput {
  startDate?: Date;
  endDate?: Date;
  adminId?: Types.ObjectId | string;
  status?: ChargeJobRunStatus;
}

export interface ManualRetriesFilterInput {
  startDate?: Date;
  endDate?: Date;
  adminId?: Types.ObjectId | string;
  status?: IInvoiceChargeLog["status"];
}

export function buildRunsFilter(input: RunsFilterInput): FilterQuery<IChargeJobRun> {
  const f: FilterQuery<IChargeJobRun> = {};
  if (input.startDate || input.endDate) {
    const range: { $gte?: Date; $lte?: Date } = {};
    if (input.startDate) range.$gte = input.startDate;
    if (input.endDate) range.$lte = input.endDate;
    f.startedAt = range;
  }
  if (input.adminId) f.adminId = input.adminId;
  if (input.status && VALID_RUN_STATUSES.has(input.status)) {
    f.status = input.status;
  }
  return f;
}

export function buildManualRetriesFilter(
  input: ManualRetriesFilterInput
): FilterQuery<IInvoiceChargeLog> {
  const f: FilterQuery<IInvoiceChargeLog> = { chargeRunId: null };
  if (input.startDate || input.endDate) {
    const range: { $gte?: Date; $lte?: Date } = {};
    if (input.startDate) range.$gte = input.startDate;
    if (input.endDate) range.$lte = input.endDate;
    f.attemptedAt = range;
  }
  if (input.adminId) f.adminId = input.adminId;
  if (input.status && ["success", "failed", "skipped"].includes(input.status)) {
    f.status = input.status;
  }
  return f;
}

export function formatDurationMs(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}

interface AdminLookupRow {
  _id: Types.ObjectId;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

function adminLabel(u: AdminLookupRow | null | undefined): string {
  if (!u) return "(unknown admin)";
  const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return name || u.email || "(unknown admin)";
}

export interface ListedRun {
  _id: string;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  adminId: string;
  adminName: string;
  status: ChargeJobRunStatus;
  totals: IChargeJobRun["totals"];
}

export async function listChargeRuns(
  input: RunsFilterInput & { limit?: number; offset?: number }
): Promise<{ runs: ListedRun[]; total: number }> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);
  const filter = buildRunsFilter(input);

  const [runs, total] = await Promise.all([
    ChargeJobRun.find(filter).sort({ startedAt: -1 }).skip(offset).limit(limit).lean(),
    ChargeJobRun.countDocuments(filter),
  ]);

  const adminIds = [...new Set(runs.map((r) => String(r.adminId)))];
  const admins = await User.find({ _id: { $in: adminIds } })
    .select({ firstName: 1, lastName: 1, email: 1 })
    .lean();
  const adminMap = new Map(admins.map((a) => [String(a._id), a]));

  return {
    runs: runs.map((r) => ({
      _id: String(r._id),
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      durationMs: r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : null,
      adminId: String(r.adminId),
      adminName: adminLabel(adminMap.get(String(r.adminId)) as AdminLookupRow | undefined),
      status: r.status,
      totals: r.totals,
    })),
    total,
  };
}

export interface RunDetailRow {
  invoiceId: string;
  customerId: string;
  userId: string;
  userEmail: string;
  status: IInvoiceChargeLog["status"];
  amount: number;
  attemptedAt: Date;
  errorCode?: string;
  errorMessage?: string;
}

export interface RunDetail {
  run: ListedRun;
  rows: RunDetailRow[];
}

export async function getChargeRunDetail(runId: string): Promise<RunDetail | null> {
  const run = await ChargeJobRun.findById(runId).lean();
  if (!run) return null;

  const [admin, logRows] = await Promise.all([
    User.findById(run.adminId).select({ firstName: 1, lastName: 1, email: 1 }).lean(),
    InvoiceChargeLog.find({ chargeRunId: run._id })
      .sort({ attemptedAt: 1 })
      .select({
        invoiceId: 1,
        customerId: 1,
        userId: 1,
        status: 1,
        amount: 1,
        attemptedAt: 1,
        errorCode: 1,
        errorMessage: 1,
      })
      .lean(),
  ]);

  const userIds = [...new Set(logRows.map((r) => String(r.userId)))];
  const users = await User.find({ _id: { $in: userIds } })
    .select({ email: 1 })
    .lean();
  const emailMap = new Map(users.map((u) => [String(u._id), u.email ?? ""]));

  return {
    run: {
      _id: String(run._id),
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      durationMs: run.finishedAt ? run.finishedAt.getTime() - run.startedAt.getTime() : null,
      adminId: String(run.adminId),
      adminName: adminLabel(admin as AdminLookupRow | null),
      status: run.status,
      totals: run.totals,
    },
    rows: logRows.map((r) => ({
      invoiceId: r.invoiceId,
      customerId: r.customerId,
      userId: String(r.userId),
      userEmail: emailMap.get(String(r.userId)) ?? "",
      status: r.status,
      amount: r.amount,
      attemptedAt: r.attemptedAt,
      errorCode: r.errorCode,
      errorMessage: r.errorMessage,
    })),
  };
}

export interface ManualRetryRow extends RunDetailRow {
  adminId: string;
  adminName: string;
}

export async function listManualRetries(
  input: ManualRetriesFilterInput & { limit?: number; offset?: number }
): Promise<{ rows: ManualRetryRow[]; total: number }> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);
  const filter = buildManualRetriesFilter(input);

  const [logRows, total] = await Promise.all([
    InvoiceChargeLog.find(filter)
      .sort({ attemptedAt: -1 })
      .skip(offset)
      .limit(limit)
      .select({
        invoiceId: 1,
        customerId: 1,
        userId: 1,
        adminId: 1,
        status: 1,
        amount: 1,
        attemptedAt: 1,
        errorCode: 1,
        errorMessage: 1,
      })
      .lean(),
    InvoiceChargeLog.countDocuments(filter),
  ]);

  const userIds = [...new Set(logRows.map((r) => String(r.userId)))];
  const adminIds = [...new Set(logRows.map((r) => String(r.adminId)))];
  const [users, admins] = await Promise.all([
    User.find({ _id: { $in: userIds } })
      .select({ email: 1 })
      .lean(),
    User.find({ _id: { $in: adminIds } })
      .select({ firstName: 1, lastName: 1, email: 1 })
      .lean(),
  ]);
  const emailMap = new Map(users.map((u) => [String(u._id), u.email ?? ""]));
  const adminMap = new Map(admins.map((a) => [String(a._id), a]));

  return {
    rows: logRows.map((r) => ({
      invoiceId: r.invoiceId,
      customerId: r.customerId,
      userId: String(r.userId),
      userEmail: emailMap.get(String(r.userId)) ?? "",
      status: r.status,
      amount: r.amount,
      attemptedAt: r.attemptedAt,
      errorCode: r.errorCode,
      errorMessage: r.errorMessage,
      adminId: String(r.adminId),
      adminName: adminLabel(adminMap.get(String(r.adminId)) as AdminLookupRow | undefined),
    })),
    total,
  };
}
```

- [ ] **Step 5: Run test — expect pass**

Run: `npm run test:past-due-history`
Expected: BOTH suites PASS.

- [ ] **Step 6: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 7 (orchestrator only): Commit**

```bash
git add src/services/admin/chargePastDueHistory.ts \
        src/services/admin/__tests__/chargePastDueHistory.test.ts \
        package.json
git commit -m "feat(admin): add chargePastDueHistory service for runs + manual-retries reads"
```

---

## Task 8: Three admin GET endpoints

**Files:**
- Create: `src/app/api/admin/charge-past-due/runs/route.ts`
- Create: `src/app/api/admin/charge-past-due/runs/[runId]/route.ts`
- Create: `src/app/api/admin/charge-past-due/manual-retries/route.ts`

Each is a thin handler: parse query → admin auth → delegate to service → return JSON. Match existing admin route conventions.

- [ ] **Step 1: List runs handler**

Create `src/app/api/admin/charge-past-due/runs/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { listChargeRuns } from "@/services/admin/chargePastDueHistory";
import type { ChargeJobRunStatus } from "@/models/ChargeJobRun";

const VALID_STATUS: readonly ChargeJobRunStatus[] = ["running", "completed", "failed", "aborted"];

function parseDate(s: string | null): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const status = statusParam && (VALID_STATUS as readonly string[]).includes(statusParam)
    ? (statusParam as ChargeJobRunStatus)
    : undefined;

  const result = await listChargeRuns({
    startDate: parseDate(searchParams.get("startDate")),
    endDate: parseDate(searchParams.get("endDate")),
    adminId: searchParams.get("adminId") || undefined,
    status,
    limit: Number(searchParams.get("limit")) || 50,
    offset: Number(searchParams.get("offset")) || 0,
  });

  return NextResponse.json(result);
}
```

- [ ] **Step 2: Run detail handler**

Create `src/app/api/admin/charge-past-due/runs/[runId]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { getChargeRunDetail } from "@/services/admin/chargePastDueHistory";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();

  const { runId } = await params;
  const detail = await getChargeRunDetail(runId);
  if (!detail) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}
```

- [ ] **Step 3: Manual retries handler**

Create `src/app/api/admin/charge-past-due/manual-retries/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { listManualRetries } from "@/services/admin/chargePastDueHistory";

const VALID_STATUS = ["success", "failed", "skipped"] as const;
type Status = (typeof VALID_STATUS)[number];

function parseDate(s: string | null): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const status = statusParam && (VALID_STATUS as readonly string[]).includes(statusParam)
    ? (statusParam as Status)
    : undefined;

  const result = await listManualRetries({
    startDate: parseDate(searchParams.get("startDate")),
    endDate: parseDate(searchParams.get("endDate")),
    adminId: searchParams.get("adminId") || undefined,
    status,
    limit: Number(searchParams.get("limit")) || 50,
    offset: Number(searchParams.get("offset")) || 0,
  });

  return NextResponse.json(result);
}
```

- [ ] **Step 4: Type-check + lint**

Run: `npm run type-check && npx eslint src/app/api/admin/charge-past-due/`
Expected: no errors.

- [ ] **Step 5 (orchestrator only): Commit**

```bash
git add src/app/api/admin/charge-past-due/
git commit -m "feat(admin): add charge-past-due history GET endpoints (runs/detail/manual-retries)"
```

---

## Task 9: TanStack Query hooks (3)

**Files:**
- Create: `src/hooks/queries/admin/useChargePastDueRuns.ts`
- Create: `src/hooks/queries/admin/useChargePastDueRunDetail.ts`
- Create: `src/hooks/queries/admin/useChargePastDueManualRetries.ts`

Match existing patterns in `src/hooks/queries/admin/` (look at `useBlockedCards.ts` and `useAllowlistActions.ts` for shape if unsure).

- [ ] **Step 1: Runs list hook**

Create `src/hooks/queries/admin/useChargePastDueRuns.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import type { ChargeJobRunStatus, IChargeJobRun } from "@/models/ChargeJobRun";

export interface RunsFilter {
  startDate?: string;
  endDate?: string;
  adminId?: string;
  status?: ChargeJobRunStatus;
  limit?: number;
  offset?: number;
}

export interface ListedRunDTO {
  _id: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  adminId: string;
  adminName: string;
  status: ChargeJobRunStatus;
  totals: IChargeJobRun["totals"];
}

export interface RunsResponse {
  runs: ListedRunDTO[];
  total: number;
}

function toQs(filter: RunsFilter): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  return p.toString();
}

export function useChargePastDueRuns(filter: RunsFilter) {
  return useQuery<RunsResponse>({
    queryKey: ["admin", "charge-past-due", "runs", filter],
    queryFn: async () => {
      const qs = toQs(filter);
      const res = await fetch(`/api/admin/charge-past-due/runs${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error(`Failed to load runs (${res.status})`);
      return res.json();
    },
  });
}
```

- [ ] **Step 2: Run detail hook**

Create `src/hooks/queries/admin/useChargePastDueRunDetail.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import type { ListedRunDTO } from "./useChargePastDueRuns";
import type { IInvoiceChargeLog } from "@/models/InvoiceChargeLog";

export interface RunDetailRowDTO {
  invoiceId: string;
  customerId: string;
  userId: string;
  userEmail: string;
  status: IInvoiceChargeLog["status"];
  amount: number;
  attemptedAt: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface RunDetailResponse {
  run: ListedRunDTO;
  rows: RunDetailRowDTO[];
}

export function useChargePastDueRunDetail(runId: string | null) {
  return useQuery<RunDetailResponse>({
    queryKey: ["admin", "charge-past-due", "run", runId],
    enabled: Boolean(runId),
    queryFn: async () => {
      const res = await fetch(`/api/admin/charge-past-due/runs/${runId}`);
      if (!res.ok) throw new Error(`Failed to load run (${res.status})`);
      return res.json();
    },
  });
}
```

- [ ] **Step 3: Manual retries hook**

Create `src/hooks/queries/admin/useChargePastDueManualRetries.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import type { RunDetailRowDTO } from "./useChargePastDueRunDetail";
import type { IInvoiceChargeLog } from "@/models/InvoiceChargeLog";

export interface ManualRetriesFilter {
  startDate?: string;
  endDate?: string;
  adminId?: string;
  status?: IInvoiceChargeLog["status"];
  limit?: number;
  offset?: number;
}

export interface ManualRetryRowDTO extends RunDetailRowDTO {
  adminId: string;
  adminName: string;
}

export interface ManualRetriesResponse {
  rows: ManualRetryRowDTO[];
  total: number;
}

function toQs(filter: ManualRetriesFilter): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  return p.toString();
}

export function useChargePastDueManualRetries(filter: ManualRetriesFilter) {
  return useQuery<ManualRetriesResponse>({
    queryKey: ["admin", "charge-past-due", "manual-retries", filter],
    queryFn: async () => {
      const qs = toQs(filter);
      const res = await fetch(`/api/admin/charge-past-due/manual-retries${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error(`Failed to load manual retries (${res.status})`);
      return res.json();
    },
  });
}
```

- [ ] **Step 4: Type-check + lint**

Run: `npm run type-check && npx eslint src/hooks/queries/admin/useChargePastDue*.ts`
Expected: no errors.

- [ ] **Step 5 (orchestrator only): Commit**

```bash
git add src/hooks/queries/admin/useChargePastDue*.ts
git commit -m "feat(admin): add TanStack hooks for charge-past-due history"
```

---

## Task 10: Page component — `PastDueChargeHistory.tsx`

**Files:**
- Create: `src/app/admin/component/PastDueChargeHistory.tsx`

The component owns: filter bar, bulk runs table, manual retries table, and a state hook for which run is open in the drawer (drawer itself is Task 11). Uses Tailwind + matches the existing admin component visual style — borrow patterns from `BlockedTransactionsManagement.tsx` if helpful.

- [ ] **Step 1: Implement the component**

Create `src/app/admin/component/PastDueChargeHistory.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useChargePastDueRuns } from "@/hooks/queries/admin/useChargePastDueRuns";
import { useChargePastDueManualRetries } from "@/hooks/queries/admin/useChargePastDueManualRetries";
import { formatDurationMs } from "@/services/admin/chargePastDueHistory";
import PastDueChargeHistoryDrawer from "./PastDueChargeHistoryDrawer";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-AU", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PastDueChargeHistory() {
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [openRunId, setOpenRunId] = useState<string | null>(null);

  const filter = { startDate: startDate || undefined, endDate: endDate || undefined };

  const runsQuery = useChargePastDueRuns(filter);
  const retriesQuery = useChargePastDueManualRetries(filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <label className="flex flex-col text-sm">
          <span className="mb-1 text-gray-600 dark:text-gray-300">Start date</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
          />
        </label>
        <label className="flex flex-col text-sm">
          <span className="mb-1 text-gray-600 dark:text-gray-300">End date</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
          />
        </label>
        {(startDate || endDate) && (
          <button
            type="button"
            onClick={() => {
              setStartDate("");
              setEndDate("");
            }}
            className="text-sm text-gray-600 underline hover:text-gray-900 dark:text-gray-300"
          >
            Clear
          </button>
        )}
      </div>

      {/* Bulk Runs */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Bulk Runs</h2>
        {runsQuery.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {runsQuery.isError && (
          <p className="text-sm text-red-600">Failed to load runs.</p>
        )}
        {runsQuery.data && runsQuery.data.runs.length === 0 && (
          <p className="text-sm text-gray-500">No bulk runs in this date range.</p>
        )}
        {runsQuery.data && runsQuery.data.runs.length > 0 && (
          <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2">Started</th>
                  <th className="px-3 py-2">Admin</th>
                  <th className="px-3 py-2 text-right">Eligible</th>
                  <th className="px-3 py-2 text-right">Attempted</th>
                  <th className="px-3 py-2 text-right">Succeeded</th>
                  <th className="px-3 py-2 text-right">Failed</th>
                  <th className="px-3 py-2 text-right">Skipped</th>
                  <th className="px-3 py-2 text-right">Revenue</th>
                  <th className="px-3 py-2">Duration</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                {runsQuery.data.runs.map((r) => (
                  <tr
                    key={r._id}
                    onClick={() => setOpenRunId(r._id)}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <td className="px-3 py-2 text-sm">{formatDate(r.startedAt)}</td>
                    <td className="px-3 py-2 text-sm">{r.adminName}</td>
                    <td className="px-3 py-2 text-right text-sm">{r.totals.eligibleCount}</td>
                    <td className="px-3 py-2 text-right text-sm">{r.totals.attempted}</td>
                    <td className="px-3 py-2 text-right text-sm text-green-700">{r.totals.succeeded}</td>
                    <td className="px-3 py-2 text-right text-sm text-red-700">{r.totals.failed}</td>
                    <td className="px-3 py-2 text-right text-sm text-gray-600">{r.totals.skipped.total}</td>
                    <td className="px-3 py-2 text-right text-sm font-medium">{formatCents(r.totals.revenueCents)}</td>
                    <td className="px-3 py-2 text-sm">{formatDurationMs(r.durationMs)}</td>
                    <td className="px-3 py-2 text-sm">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Manual Retries */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Manual Retries (per-user)</h2>
        {retriesQuery.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {retriesQuery.isError && (
          <p className="text-sm text-red-600">Failed to load manual retries.</p>
        )}
        {retriesQuery.data && retriesQuery.data.rows.length === 0 && (
          <p className="text-sm text-gray-500">No manual retries in this date range.</p>
        )}
        {retriesQuery.data && retriesQuery.data.rows.length > 0 && (
          <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Admin</th>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Invoice</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                {retriesQuery.data.rows.map((r) => (
                  <tr key={`${r.invoiceId}-${r.attemptedAt}`}>
                    <td className="px-3 py-2 text-sm">{formatDate(r.attemptedAt)}</td>
                    <td className="px-3 py-2 text-sm">{r.adminName}</td>
                    <td className="px-3 py-2 text-sm">{r.userEmail || r.userId}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.invoiceId}</td>
                    <td className="px-3 py-2 text-sm">{r.status}</td>
                    <td className="px-3 py-2 text-right text-sm">{formatCents(r.amount)}</td>
                    <td className="px-3 py-2 text-xs text-red-700">{r.errorCode ?? r.errorMessage ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PastDueChargeHistoryDrawer runId={openRunId} onClose={() => setOpenRunId(null)} />
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npm run type-check && npx eslint src/app/admin/component/PastDueChargeHistory.tsx`
Expected: no errors. (Will fail until Task 11 creates the drawer file — proceed to Task 11 then come back to verify.)

- [ ] **Step 3 (orchestrator only): Commit (after Task 11 lands)**

Bundle this commit with Task 11 since the component imports the drawer; alternatively land them under one commit message.

---

## Task 11: Drill-in drawer + tab wiring

**Files:**
- Create: `src/app/admin/component/PastDueChargeHistoryDrawer.tsx`
- Modify: `src/app/admin/component/AdminPage.tsx` (add `selectedTab === "past-due-history"` branch + subtitle line)
- Modify: `src/app/admin/component/AdminSidebar.tsx` (add sidebar entry)

- [ ] **Step 1: Implement the drawer**

Create `src/app/admin/component/PastDueChargeHistoryDrawer.tsx`:

```tsx
"use client";

import { useChargePastDueRunDetail } from "@/hooks/queries/admin/useChargePastDueRunDetail";
import { formatDurationMs } from "@/services/admin/chargePastDueHistory";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-AU");
}

export default function PastDueChargeHistoryDrawer({
  runId,
  onClose,
}: {
  runId: string | null;
  onClose: () => void;
}) {
  const detailQuery = useChargePastDueRunDetail(runId);

  if (!runId) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-3xl overflow-y-auto bg-white shadow-xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
          <h3 className="text-lg font-semibold">Run detail</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-900 dark:hover:text-white"
          >
            Close
          </button>
        </div>

        {detailQuery.isLoading && <p className="p-4 text-sm text-gray-500">Loading…</p>}
        {detailQuery.isError && <p className="p-4 text-sm text-red-600">Failed to load run.</p>}

        {detailQuery.data && (
          <div className="space-y-4 p-4">
            <section className="rounded border border-gray-200 p-3 dark:border-gray-700">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>Started:</div>
                <div>{formatDate(detailQuery.data.run.startedAt)}</div>
                <div>Finished:</div>
                <div>
                  {detailQuery.data.run.finishedAt
                    ? formatDate(detailQuery.data.run.finishedAt)
                    : "(still running)"}
                </div>
                <div>Duration:</div>
                <div>{formatDurationMs(detailQuery.data.run.durationMs)}</div>
                <div>Admin:</div>
                <div>{detailQuery.data.run.adminName}</div>
                <div>Status:</div>
                <div>{detailQuery.data.run.status}</div>
                <div>Eligible:</div>
                <div>{detailQuery.data.run.totals.eligibleCount}</div>
                <div>Attempted:</div>
                <div>{detailQuery.data.run.totals.attempted}</div>
                <div>Succeeded:</div>
                <div className="text-green-700">{detailQuery.data.run.totals.succeeded}</div>
                <div>Failed:</div>
                <div className="text-red-700">{detailQuery.data.run.totals.failed}</div>
                <div>Revenue:</div>
                <div className="font-medium">{formatCents(detailQuery.data.run.totals.revenueCents)}</div>
              </div>

              <div className="mt-3 border-t border-gray-200 pt-3 text-sm dark:border-gray-700">
                <div className="font-medium">Skip breakdown</div>
                <ul className="ml-4 list-disc">
                  <li>Recently attempted (24h): {detailQuery.data.run.totals.skipped.recentlyAttempted}</li>
                  <li>No longer past_due: {detailQuery.data.run.totals.skipped.noLongerPastDue}</li>
                  <li>Already paid: {detailQuery.data.run.totals.skipped.alreadyPaid}</li>
                  <li>Missing payment method: {detailQuery.data.run.totals.skipped.missingPaymentMethod}</li>
                  <li>Other: {detailQuery.data.run.totals.skipped.other}</li>
                </ul>
              </div>
            </section>

            <section>
              <h4 className="mb-2 text-sm font-semibold">Per-invoice attempts ({detailQuery.data.rows.length})</h4>
              <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    <tr>
                      <th className="px-3 py-2">When</th>
                      <th className="px-3 py-2">User</th>
                      <th className="px-3 py-2">Invoice</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                    {detailQuery.data.rows.map((r) => (
                      <tr key={`${r.invoiceId}-${r.attemptedAt}`}>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.attemptedAt)}</td>
                        <td className="px-3 py-2">{r.userEmail || r.userId}</td>
                        <td className="px-3 py-2 font-mono text-xs">{r.invoiceId}</td>
                        <td className="px-3 py-2">{r.status}</td>
                        <td className="px-3 py-2 text-right">{formatCents(r.amount)}</td>
                        <td className="px-3 py-2 text-xs text-red-700">{r.errorCode ?? r.errorMessage ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </aside>
    </>
  );
}
```

- [ ] **Step 2: Wire the tab in AdminPage.tsx**

In `src/app/admin/component/AdminPage.tsx`:

Add the import near the others:

```tsx
import PastDueChargeHistory from "./PastDueChargeHistory";
```

In the subtitle block (around line 181), add:

```tsx
                  {selectedTab === "past-due-history" && "History of bulk and manual past-due charge attempts"}
```

In the render switch block (after `{selectedTab === "blocked-transactions" && <BlockedTransactionsManagement />}`):

```tsx
          {selectedTab === "past-due-history" && <PastDueChargeHistory />}
```

- [ ] **Step 3: Add the sidebar entry**

In `src/app/admin/component/AdminSidebar.tsx`, find the existing `blocked-transactions` entry in the navigation array and add a sibling immediately after it. Use the same shape as the surrounding entries (icon, label, key). Example shape (adapt to whatever the file actually uses):

```tsx
  {
    key: "past-due-history",
    label: "Past-Due Charges",
    href: "/admin/past-due-history",
    icon: ClockIcon, // or whatever the existing entries import; pick a billing/clock icon
  },
```

If the file uses a different shape (object literal vs JSX), follow the existing pattern.

- [ ] **Step 4: Type-check + lint**

Run: `npm run type-check && npx eslint src/app/admin/component/PastDueChargeHistory*.tsx src/app/admin/component/AdminPage.tsx src/app/admin/component/AdminSidebar.tsx`
Expected: no errors.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev` and navigate to `http://localhost:3000/admin/past-due-history`. Verify:
- Page renders with two empty-state messages (no runs / no manual retries) for a fresh DB.
- Filter inputs render and clear button appears when a date is set.
- No console errors.

Stop the dev server when done.

- [ ] **Step 6 (orchestrator only): Commit Tasks 10 + 11 together**

```bash
git add src/app/admin/component/PastDueChargeHistory.tsx \
        src/app/admin/component/PastDueChargeHistoryDrawer.tsx \
        src/app/admin/component/AdminPage.tsx \
        src/app/admin/component/AdminSidebar.tsx
git commit -m "feat(admin): past-due charge history page with drill-in drawer"
```

---

## Task 12: Manifest + docs + final verify

**Files:**
- Modify: `CLAUDE.md` (Domain Manifest JSON block)
- Modify: `docs/admin/{backend,frontend,api,models}.md`
- Modify: `docs/billing-stripe/gotchas.md`

- [ ] **Step 1: Update Domain Manifest**

In `CLAUDE.md`, find the `admin` domain entry. Add these paths to its `paths` array (the manifest is JSON inside a fenced block):

```
"src/services/admin/chargePastDueHistory.ts",
"src/models/ChargeJobRun.ts",
"src/models/ChargeJobLock.ts",
```

Bump the manifest's `lastModified` field to today's date. Bump the admin domain's `lastVerified` to today.

- [ ] **Step 2: Update docs/admin/models.md**

Add a section describing `ChargeJobRun` (one document per bulk run, totals shape, lifecycle states). Cross-reference `InvoiceChargeLog`'s new `chargeRunId` field.

- [ ] **Step 3: Update docs/admin/api.md**

Document the three new endpoints: `GET /api/admin/charge-past-due/runs`, `GET /api/admin/charge-past-due/runs/[runId]`, `GET /api/admin/charge-past-due/manual-retries`. Include query params, response shapes, and admin-only auth note.

- [ ] **Step 4: Update docs/admin/backend.md**

Add a paragraph under the existing `chargePastDueShared.ts` entry describing:
- The new `chargeRunId` plumbing from bulk route → shared function → log writes
- The late "still past-due?" re-check via `shouldSkipForNotPastDue`
- The new `chargePastDueHistory.ts` service with `listChargeRuns` / `getChargeRunDetail` / `listManualRetries`

- [ ] **Step 5: Update docs/admin/frontend.md**

Add a section for the `past-due-history` tab: the page component, the drawer, and the three TanStack hooks.

- [ ] **Step 6: Update docs/billing-stripe/gotchas.md**

In the "Charge past-due — runbook" section, add a final bullet linking to the new history view at `/admin/past-due-history` for run audit, and note that the late "still past-due?" re-check is implemented inside `payOpenInvoiceAsPastDueAdmin`.

- [ ] **Step 7: Run full verify suite**

```bash
npm run lint
npm run type-check
npm run test:past-due-admin-charge
npm run test:past-due-history
npm run test:stripe-collection-pause
```

Expected: all green.

- [ ] **Step 8: Manual smoke test in dev**

Run `npm run dev`. As an admin user:
1. Navigate to `/admin/past-due-history` — page loads, both tables show empty state.
2. (If you have a test invoice in past_due) Trigger `POST /api/admin/invoices/charge-past-due` via curl or the existing admin trigger UI. Refresh the history page — the run appears in "Bulk Runs" with eligible/attempted/succeeded/failed/revenue populated.
3. Click the run row — drawer opens, shows skip breakdown and per-invoice list.
4. (If you have a test user in past_due) Hit `POST /api/admin/users/[id]/charge-past-due`. Verify the row appears in "Manual Retries" (chargeRunId null), not in any bulk run drill-in.

- [ ] **Step 9 (orchestrator only): Commit**

```bash
git add CLAUDE.md docs/admin/ docs/billing-stripe/gotchas.md
git commit -m "docs: register past-due charge history in manifest + domain docs"
```

---

## Self-review checklist

**Spec coverage** — every spec section has a task:
- ✅ ChargeJobRun model (Task 2)
- ✅ chargeRunId on InvoiceChargeLog (Task 1)
- ✅ Bulk route lifecycle (orphan sweep + insert + finalize) (Task 6)
- ✅ payOpenInvoiceAsPastDueAdmin signature change (Task 4)
- ✅ Late "still past-due?" re-check (Task 5)
- ✅ Three GET endpoints (Task 8)
- ✅ Three TanStack hooks (Task 9)
- ✅ Page component + drawer + tab wiring (Tasks 10, 11)
- ✅ Pure helpers + tests for totals + orphan + filters (Tasks 3, 7)
- ✅ Manifest + docs (Task 12)

**Placeholder scan** — none. Every code step shows the actual code; every test step shows the assertions; every command step shows the exact command and expected output.

**Type consistency** — `ChargeJobRunTotals` shape matches across model (Task 2), aggregation helper (Task 3), service (Task 7), hooks (Task 9), and components (Tasks 10, 11). `chargeRunId` typing as `mongoose.Types.ObjectId | null` is consistent in the model (Task 1), shared function (Task 4), and route (Task 6). Skip-reason strings (`"recently_attempted"`, `"no_longer_past_due"`, `"already_paid"`, `"missing_payment_method"`) are used consistently between the shared function (Tasks 4, 5) and the totals helper (Task 3).
