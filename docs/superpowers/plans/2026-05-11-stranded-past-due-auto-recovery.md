# Stranded Past-Due Auto-Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Project-specific hard rule (CLAUDE.md):** NO auto-commits. The plan does NOT instruct you to `git commit` between tasks. Pause at the end of each phase and ask the user for explicit `commit`/`push` authorization before running any git write command. If a Stop hook blocks for stale docs, update the listed docs first, then ask.

**Goal:** Make the admin per-user "Charge past due" button succeed in one click on members whose only open invoice is in Stripe's "open-but-dead" state, and give admins a bulk path to clear the existing backlog from inside bulk-run details.

**Architecture:** Add a thin `chargeOrRecover` wrapper in `src/server/admin/` that switches on the existing `isOriginalInvoiceEligibleForRecovery` predicate and delegates either to `payOpenInvoiceAsPastDueAdmin` (existing) or `recoverStrandedPastDueInvoice` (existing). Wire it into the per-user admin route only — bulk cron job, Force Charge, and the per-invoice recover endpoint keep their current paths. Surface the recovery distinctly in the result UI. Add a `bypassRecentAttemptLock` / `bypassRecentRecoveryLock` parameter on the two primitives so all admin-initiated paths skip the 6-hour attempt budget (keeping the 30-second spam debounce). Extend the run-detail drawer with multi-select checkboxes that drive the existing `BulkRecoverInvoicesModal`. Ship a `tsx` verification script mirroring `test-force-charge.ts`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Stripe Node SDK, Mongoose, `tsx` for tests/scripts (no jest/vitest — every test is a standalone tsx script with `node:assert/strict`).

---

## Pre-flight reading (do this once before Task 1)

- [c:\Codes\ToolsAustralia\.worktrees\past-due-fix\CLAUDE.md](CLAUDE.md) — Hard rules 1 (no auto-commit), 2 (doc sync), 3 (manifest is truth), 4 (don't overengineer). Domain Manifest at the bottom.
- [src/server/admin/chargePastDueShared.ts](src/server/admin/chargePastDueShared.ts) — orchestrator with locks, retries, and post-pay logic. Read `payOpenInvoiceAsPastDueAdmin` (lines 265–666) end-to-end.
- [src/server/admin/recoverStrandedPastDue.ts](src/server/admin/recoverStrandedPastDue.ts) — recovery flow (void → pick draft → finalize → pay). Read `recoverStrandedPastDueInvoice` and `checkRecoveryEligibility`.
- [src/server/admin/recoverStrandedPastDuePolicy.ts](src/server/admin/recoverStrandedPastDuePolicy.ts) — `isOriginalInvoiceEligibleForRecovery` (the decision predicate the wrapper switches on).
- [src/server/admin/past-due-charge-idempotency.ts](src/server/admin/past-due-charge-idempotency.ts) — note `RECENT_ATTEMPT_WINDOW_HOURS = 6` (NOT 24). The user said "24 hour or hour rule" colloquially; the actual constant is 6 hours.
- [docs/admin/](docs/admin/) — backend.md, api.md, testing.md, frontend.md (you will update all four).
- [docs/billing-stripe/gotchas.md](docs/billing-stripe/gotchas.md), [docs/dev-tooling/](docs/dev-tooling/).

**Glossary of names this plan introduces:**

| Name | Where | What |
|---|---|---|
| `chooseChargeAction(invoice)` | `src/server/admin/chargeOrRecoverPolicy.ts` (new) | Pure decision function: returns `'recover'` or `'pay'`. |
| `chargeOrRecover(params)` | `src/server/admin/chargeOrRecover.ts` (new) | Orchestrator that calls either primitive based on the decision. |
| `bypassRecentAttemptLock` | new optional param on `payOpenInvoiceAsPastDueAdmin` | When true, skip the 6h 1-per-window budget. 30s debounce still fires. |
| `bypassRecentRecoveryLock` | new optional param on `recoverStrandedPastDueInvoice` and `checkRecoveryEligibility` | When true, skip the `hasRecentRecoveryAttempt` check. |
| `recovered`, `newInvoiceId` | new optional fields on `PastDueChargeResultRow` | Set when the wrapper took the recovery branch. UI renders a badge. |
| `willRecover` | new field on preview-row JSON returned by GET `/api/admin/users/[id]/charge-past-due` | True when the open invoice on the user's current subscription is stranded. |
| `isStrandedError` (hoisted) | from `PastDueChargeHistory.tsx` to `src/utils/admin/chargePastDueFormat.ts` | Already exists locally; just hoist it. |

---

# Phase 1 — Backend wrapper + manual lock bypass + recover badge + test script

This phase ships: admin clicks "Charge past due" on a stranded user → it succeeds in one click and shows a "Recovered" badge in the results. Admin can re-click immediately (no 6h lock). Dev can run `npm run test:recover-stranded:dry -- --email=foo@example.com` to verify eligibility before going live.

---

## Task 1.1 — Pure decision function `chooseChargeAction`

**Files:**
- Create: `src/server/admin/chargeOrRecoverPolicy.ts`
- Create: `src/server/admin/__tests__/chargeOrRecoverPolicy.test.ts`

This is a pure function with no Stripe SDK / Mongoose imports, so it can be unit-tested without env vars. It just re-uses `isOriginalInvoiceEligibleForRecovery` and wraps the result in a discriminated decision.

- [ ] **Step 1: Write the failing test**

Create `src/server/admin/__tests__/chargeOrRecoverPolicy.test.ts`:

```typescript
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { chooseChargeAction } from "../chargeOrRecoverPolicy";

function makeInvoice(overrides: Partial<Stripe.Invoice>): Stripe.Invoice {
  return {
    id: "in_test",
    status: "open",
    attempt_count: 0,
    next_payment_attempt: 1_700_000_000,
    amount_remaining: 2000,
    collection_method: "charge_automatically",
    ...overrides,
  } as Stripe.Invoice;
}

function testRoutesToPayForLiveOpenInvoice() {
  const decision = chooseChargeAction(makeInvoice({ status: "open" }));
  assert.equal(decision.kind, "pay");
}

function testRoutesToRecoverForOpenButExhaustedInvoice() {
  // Stripe quirk: open + attempt_count >= 1 + next_payment_attempt === null
  const decision = chooseChargeAction(
    makeInvoice({ status: "open", attempt_count: 3, next_payment_attempt: null })
  );
  assert.equal(decision.kind, "recover");
}

function testRoutesToRecoverForUncollectible() {
  const decision = chooseChargeAction(makeInvoice({ status: "uncollectible" }));
  assert.equal(decision.kind, "recover");
}

function testRoutesToRecoverForVoid() {
  const decision = chooseChargeAction(makeInvoice({ status: "void" }));
  assert.equal(decision.kind, "recover");
}

function testRoutesToPayForDraft() {
  // Draft is "still chargeable" per the recovery predicate; wrapper should pay it
  // (recovery would try to void + re-bill, which is wrong for a draft).
  const decision = chooseChargeAction(makeInvoice({ status: "draft" }));
  assert.equal(decision.kind, "pay");
}

function run() {
  testRoutesToPayForLiveOpenInvoice();
  testRoutesToRecoverForOpenButExhaustedInvoice();
  testRoutesToRecoverForUncollectible();
  testRoutesToRecoverForVoid();
  testRoutesToPayForDraft();
  console.log("chargeOrRecoverPolicy tests passed");
}

run();
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx tsx src/server/admin/__tests__/chargeOrRecoverPolicy.test.ts
```

Expected: FAIL with `Cannot find module '../chargeOrRecoverPolicy'`.

- [ ] **Step 3: Create the policy module**

Create `src/server/admin/chargeOrRecoverPolicy.ts`:

```typescript
/**
 * Pure decision function for the admin per-user past-due charge flow.
 *
 * Wraps `isOriginalInvoiceEligibleForRecovery` in a discriminated result that
 * downstream code can switch on without re-running the predicate. No Stripe SDK
 * or Mongoose imports — testable without env vars.
 */

import type Stripe from "stripe";
import { isOriginalInvoiceEligibleForRecovery } from "./recoverStrandedPastDuePolicy";

export type ChargeActionDecision =
  | { kind: "recover" }
  | { kind: "pay" };

/**
 * Decide whether a candidate invoice should be paid directly or routed through
 * the stranded-recovery flow. "recover" is selected for invoices Stripe has
 * given up on (status: open with no scheduled retry, plus uncollectible/void).
 */
export function chooseChargeAction(invoice: Stripe.Invoice): ChargeActionDecision {
  const eligibility = isOriginalInvoiceEligibleForRecovery(invoice);
  return eligibility.eligible ? { kind: "recover" } : { kind: "pay" };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx tsx src/server/admin/__tests__/chargeOrRecoverPolicy.test.ts
```

Expected: `chargeOrRecoverPolicy tests passed`.

- [ ] **Step 5: Wire a `test:*` script entry**

Edit `package.json`. Find the existing `test:recover-stranded-past-due-policy` entry and add a sibling immediately after it:

```json
"test:charge-or-recover-policy": "tsx src/server/admin/__tests__/chargeOrRecoverPolicy.test.ts",
```

Run it once to verify:

```bash
npm run test:charge-or-recover-policy
```

Expected: `chargeOrRecoverPolicy tests passed`.

---

## Task 1.2 — Add `bypassRecentAttemptLock` to `payOpenInvoiceAsPastDueAdmin`

**Files:**
- Modify: [src/server/admin/chargePastDueShared.ts](src/server/admin/chargePastDueShared.ts) — function `payOpenInvoiceAsPastDueAdmin` (lines 265–666)
- Modify: `src/server/admin/__tests__/chargePastDueShared.test.ts` — add new test cases (NB: the existing file only tests pure re-exports; we extend it minimally without introducing Mongo/Stripe mocks)

The lock we're bypassing is the `else` branch at [chargePastDueShared.ts:375–406](src/server/admin/chargePastDueShared.ts#L375-L406) (the "1-per-window" budget that fires when `attemptBudgetCheck` is not supplied). The 30s spam debounce immediately before it stays unchanged. We do NOT touch the `attemptBudgetCheck` callback path — Force Charge keeps its own per-path budget.

The cleanest path: extract a pure predicate `shouldSkipForRecentAttempt(rows, bypass)` so we can unit-test the bypass logic without mocking Mongo.

- [ ] **Step 1: Write the failing test for the predicate**

Append to `src/server/admin/__tests__/chargePastDueShared.test.ts` (before the `function run()` block):

```typescript
import { shouldSkipForRecentAttempt } from "../past-due-charge-idempotency";

function testRecentAttemptSkipBlocksByDefault() {
  const rows = [{ attemptedAt: new Date(), status: "failed" as const }];
  assert.equal(shouldSkipForRecentAttempt(rows, false), true);
}

function testRecentAttemptSkipAllowsWhenBypassed() {
  const rows = [{ attemptedAt: new Date(), status: "failed" as const }];
  assert.equal(shouldSkipForRecentAttempt(rows, true), false);
}

function testRecentAttemptSkipAllowsWhenNoRows() {
  assert.equal(shouldSkipForRecentAttempt([], false), false);
}
```

Add the three calls to `run()`:

```typescript
  testRecentAttemptSkipBlocksByDefault();
  testRecentAttemptSkipAllowsWhenBypassed();
  testRecentAttemptSkipAllowsWhenNoRows();
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:past-due-admin-charge
```

Expected: FAIL with `'shouldSkipForRecentAttempt' is not exported`.

- [ ] **Step 3: Add the predicate to `past-due-charge-idempotency.ts`**

Edit `src/server/admin/past-due-charge-idempotency.ts`. Append at the end:

```typescript
type ChargeLogRowForRecentCheck = {
  attemptedAt: Date;
  status?: "success" | "failed" | "skipped";
};

/**
 * Whether the default 1-per-window budget should skip this attempt.
 *
 * Returns false (proceed) when bypass=true — used by admin-initiated paths
 * (per-user charge button, manual recover endpoints) so explicit admin clicks
 * aren't gated by prior automated attempts. The 30s debounce check still fires
 * separately before this — bypass does NOT defeat double-click protection.
 *
 * Returns true (skip) when any prior row exists within the 6h window.
 */
export function shouldSkipForRecentAttempt(
  recentRows: ChargeLogRowForRecentCheck[],
  bypass: boolean
): boolean {
  if (bypass) return false;
  return recentRows.length > 0;
}
```

- [ ] **Step 4: Run test to verify the predicate passes**

```bash
npm run test:past-due-admin-charge
```

Expected: existing tests still pass + 3 new ones pass.

- [ ] **Step 5: Wire the bypass param into `payOpenInvoiceAsPastDueAdmin`**

Edit `src/server/admin/chargePastDueShared.ts`. Two changes:

**5a.** In the params type of `payOpenInvoiceAsPastDueAdmin` (around line 287, just below `attemptBudgetCheck`), add:

```typescript
  /**
   * When true, skip the default 1-per-window (6h) lock check. Admin-initiated
   * routes (per-user charge button, manual recover endpoints) set this so a
   * deliberate admin click isn't gated by the bulk cron job's prior attempt.
   * The 30s spam debounce immediately above this branch still fires.
   *
   * Mutually exclusive with `attemptBudgetCheck` (Force Charge supplies its own
   * per-path 3-per-window budget; do not pass both).
   */
  bypassRecentAttemptLock?: boolean;
```

**5b.** In the function body, replace the entire `else` block at lines 375–406 (the default budget check) with:

```typescript
  } else {
    const recentAttempt = await InvoiceChargeLog.findOne({
      invoiceId,
      attemptedAt: { $gte: cutoffForRecentAttempt() },
    })
      .select({ _id: 1, status: 1, attemptedAt: 1 })
      .lean();

    const recentRowsForCheck = recentAttempt
      ? [{ attemptedAt: recentAttempt.attemptedAt, status: recentAttempt.status as "success" | "failed" | "skipped" }]
      : [];

    if (shouldSkipForRecentAttempt(recentRowsForCheck, params.bypassRecentAttemptLock ?? false)) {
      await InvoiceChargeLog.create({
        invoiceId,
        customerId,
        userId: new mongoose.Types.ObjectId(userIdStr),
        adminId: new mongoose.Types.ObjectId(adminId),
        status: "skipped",
        amount,
        attemptedAt: new Date(),
        errorMessage: `Skipped: prior attempt at ${recentAttempt!.attemptedAt.toISOString()} within ${RECENT_ATTEMPT_WINDOW_HOURS}h window`,
        chargeRunId,
      });

      return {
        invoiceId,
        customerId,
        userId: userIdStr,
        userEmail,
        status: "skipped",
        skipReason: "recently_attempted",
        amount,
      };
    }
  }
```

Also add the import at the top of the file (around lines 7–15 with the other idempotency imports):

```typescript
  shouldSkipForRecentAttempt,
```

(Place it next to the other named imports from `./past-due-charge-idempotency`.)

- [ ] **Step 6: Type-check and re-run tests**

```bash
npm run type-check
npm run test:past-due-admin-charge
```

Expected: type-check passes, tests pass.

---

## Task 1.3 — Add `bypassRecentRecoveryLock` to `recoverStrandedPastDueInvoice`

**Files:**
- Modify: [src/server/admin/recoverStrandedPastDue.ts](src/server/admin/recoverStrandedPastDue.ts) — `recoverStrandedPastDueInvoice` and `checkRecoveryEligibility`
- Modify: [src/server/admin/recoverStrandedPastDuePolicy.ts](src/server/admin/recoverStrandedPastDuePolicy.ts) — extend `hasRecentRecoveryAttempt` with bypass arg (or add a wrapper predicate; we extend in-place for minimal surface)
- Modify: [src/server/admin/__tests__/recoverStrandedPastDuePolicy.test.ts](src/server/admin/__tests__/recoverStrandedPastDuePolicy.test.ts) — add bypass cases

- [ ] **Step 1: Read existing tests to match style**

```bash
cat src/server/admin/__tests__/recoverStrandedPastDuePolicy.test.ts | head -60
```

Note the existing pattern for `hasRecentRecoveryAttempt`. We will NOT change the signature of that function (a downstream tool may depend on it). Instead, the route-level code calls `hasRecentRecoveryAttempt(...)` ONLY when bypass is false.

- [ ] **Step 2: Add `bypassRecentRecoveryLock` param to `checkRecoveryEligibility`**

Edit `src/server/admin/recoverStrandedPastDue.ts`. Two changes:

**2a.** Change the `checkRecoveryEligibility` params type (around line 72):

```typescript
export async function checkRecoveryEligibility(params: {
  userId: string;
  originalInvoiceId: string;
  /**
   * When true, skip the 6h `hasRecentRecoveryAttempt` lock. Admin-initiated
   * routes (per-user manual recover, bulk recover from history page) set this
   * so an explicit admin click isn't gated by the bulk cron job's prior attempt.
   */
  bypassRecentRecoveryLock?: boolean;
}): Promise<RecoveryEligibilityResult> {
```

**2b.** Wrap the 24h-lock check at lines 168–182 in a bypass conditional:

```typescript
  // ─── 3. 6h lock check (bypassed for admin-initiated paths) ───
  if (!params.bypassRecentRecoveryLock) {
    const recentRows = await InvoiceChargeLog.find({
      userId: new mongoose.Types.ObjectId(userId),
      attemptedAt: { $gte: cutoffForRecentAttempt() },
    })
      .select({ attemptedAt: 1, result: 1 })
      .lean();

    if (hasRecentRecoveryAttempt(recentRows, originalInvoiceId)) {
      return {
        eligible: false,
        reason: "recent_recovery_attempt",
        message: `A recovery attempt for this invoice happened within the last ${RECENT_ATTEMPT_WINDOW_HOURS}h`,
      };
    }
  }
```

- [ ] **Step 3: Add `bypassRecentRecoveryLock` param to `recoverStrandedPastDueInvoice` and thread it through**

In the same file, change the signature of `recoverStrandedPastDueInvoice` (around line 187):

```typescript
export async function recoverStrandedPastDueInvoice(params: {
  userId: string;
  originalInvoiceId: string;
  adminId: string;
  /**
   * When true, skip the 6h recovery-lock check AND pass
   * `bypassRecentAttemptLock: true` to the final `payOpenInvoiceAsPastDueAdmin`
   * call so the recovered pay isn't gated by the very write that void/finalize
   * steps just made.
   */
  bypassRecentRecoveryLock?: boolean;
}): Promise<RecoverStrandedResult> {
```

Forward the bypass to `checkRecoveryEligibility` at line 195:

```typescript
  const eligibilityResult = await checkRecoveryEligibility({
    userId,
    originalInvoiceId,
    bypassRecentRecoveryLock: params.bypassRecentRecoveryLock,
  });
```

And to the final `payOpenInvoiceAsPastDueAdmin` call at line 377:

```typescript
  const row = await payOpenInvoiceAsPastDueAdmin({
    invoice: finalizedInvoice,
    paymentMethodId,
    customerId: user.stripeCustomerId,
    user: { _id: user._id, email: user.email },
    adminId,
    bypassRecentAttemptLock: params.bypassRecentRecoveryLock,
  });
```

- [ ] **Step 4: Add unit test for the bypass on the policy module's recent-attempt predicate**

Edit `src/server/admin/__tests__/recoverStrandedPastDuePolicy.test.ts`. The existing tests check `hasRecentRecoveryAttempt`. We do NOT change the signature — the bypass lives in `recoverStrandedPastDue.ts` orchestrator. But we add a test case proving the predicate is correct when no rows are present (defense-in-depth):

Find the existing `function run()` block. Add this test function before it:

```typescript
function testHasRecentRecoveryAttemptReturnsFalseForEmptyRows() {
  // Empty input must always return false — regression guard for the bypass
  // path which short-circuits before querying InvoiceChargeLog at all.
  const result = hasRecentRecoveryAttempt([], "in_anything");
  assert.equal(result, false);
}
```

Add the call inside `run()`. Verify the import for `hasRecentRecoveryAttempt` is already present at the top of the file (it should be).

- [ ] **Step 5: Run the recovery policy tests and type-check**

```bash
npm run test:recover-stranded-past-due-policy
npm run type-check
```

Expected: both pass.

---

## Task 1.4 — Build `chargeOrRecover` orchestrator (composition only)

**Files:**
- Create: `src/server/admin/chargeOrRecover.ts`

This is a thin composition function. No unit test here — the branching decision is unit-tested via `chargeOrRecoverPolicy`. The orchestrator itself will be integration-tested via the `test:recover-stranded` script in Task 1.9.

- [ ] **Step 1: Create the orchestrator file**

Create `src/server/admin/chargeOrRecover.ts`:

```typescript
import mongoose from "mongoose";
import type Stripe from "stripe";
import { chooseChargeAction } from "./chargeOrRecoverPolicy";
import { payOpenInvoiceAsPastDueAdmin, type PastDueChargeResultRow } from "./chargePastDueShared";
import { recoverStrandedPastDueInvoice } from "./recoverStrandedPastDue";

/**
 * Admin per-user composition: pay a live open invoice, or auto-recover a
 * "Stripe gave up" stranded invoice (void + finalize held draft + pay).
 *
 * Picks the branch via `chooseChargeAction`. The pay branch and the recovery
 * branch both end up writing InvoiceChargeLog rows and (on success) clearing
 * Stripe `pause_collection` — no caller-side bookkeeping required.
 *
 * Manual lock bypass: this composition exists for admin-initiated routes;
 * both branches pass `bypass*: true` so the 6h budget doesn't gate explicit
 * admin clicks. The 30s spam debounce still fires inside the pay primitive.
 */
export async function chargeOrRecover(params: {
  invoice: Stripe.Invoice;
  paymentMethodId: string;
  customerId: string;
  user: { _id: mongoose.Types.ObjectId | string; email?: string | null };
  adminId: string;
}): Promise<PastDueChargeResultRow & { recovered?: true; newInvoiceId?: string }> {
  const decision = chooseChargeAction(params.invoice);

  if (decision.kind === "pay") {
    return payOpenInvoiceAsPastDueAdmin({
      invoice: params.invoice,
      paymentMethodId: params.paymentMethodId,
      customerId: params.customerId,
      user: params.user,
      adminId: params.adminId,
      bypassRecentAttemptLock: true,
    });
  }

  // Recover branch: needs the original invoice ID + the user's Mongo _id.
  const originalInvoiceId = params.invoice.id;
  if (!originalInvoiceId) {
    return {
      invoiceId: "",
      customerId: params.customerId,
      userId: String(params.user._id),
      userEmail: params.user.email ?? "N/A",
      status: "skipped",
      skipReason: "missing_invoice_id",
      amount: params.invoice.amount_remaining ?? 0,
    };
  }

  const result = await recoverStrandedPastDueInvoice({
    userId: String(params.user._id),
    originalInvoiceId,
    adminId: params.adminId,
    bypassRecentRecoveryLock: true,
  });

  if (result.ok) {
    return {
      ...result.row,
      recovered: true,
      newInvoiceId: result.newInvoiceId,
    };
  }

  // Recovery refused or failed mid-flight. Surface as failed with the reason
  // baked into the error string so the result table can show it.
  return {
    invoiceId: originalInvoiceId,
    customerId: params.customerId,
    userId: String(params.user._id),
    userEmail: params.user.email ?? "N/A",
    status: "failed",
    error: `Recovery ${result.reason}: ${result.message}`,
    amount: params.invoice.amount_remaining ?? 0,
  };
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: passes.

---

## Task 1.5 — Wire the per-user `/charge-past-due` POST route to call `chargeOrRecover`

**Files:**
- Modify: [src/app/api/admin/users/[id]/charge-past-due/route.ts](src/app/api/admin/users/[id]/charge-past-due/route.ts) — POST handler, the loop at lines 308–344

- [ ] **Step 1: Add the new import and remove the now-unused one**

At the top of the file (around lines 10–15), the existing destructured import from `@/server/admin/chargePastDueShared` includes `payOpenInvoiceAsPastDueAdmin`. After this task, that name is no longer referenced in the file (the loop will call `chargeOrRecover` instead). Remove it from the destructured list and add the new import:

```typescript
import {
  batchFetchCustomers,
  resolveInvoicePaymentMethodId,
  selectCurrentSubscriptionChargeable,
} from "@/server/admin/chargePastDueShared";
import { chargeOrRecover } from "@/server/admin/chargeOrRecover";
```

(Drop `payOpenInvoiceAsPastDueAdmin` from the destructured list — keep the other names that are still used in the GET preview handler.)

- [ ] **Step 2: Update the `PastDueChargeResultRow` shape used in the route handler**

The route's `results` array currently holds `Awaited<ReturnType<typeof payOpenInvoiceAsPastDueAdmin>>`. Change it to `Awaited<ReturnType<typeof chargeOrRecover>>` at line 302:

```typescript
    const results: Awaited<ReturnType<typeof chargeOrRecover>>[] = [];
```

- [ ] **Step 3: Replace the `payOpenInvoiceAsPastDueAdmin` call inside the loop**

Replace lines 330–336:

```typescript
      const row = await payOpenInvoiceAsPastDueAdmin({
        invoice,
        paymentMethodId,
        customerId: invCustomerId,
        user: { _id: user._id, email: user.email },
        adminId,
      });
```

with:

```typescript
      const row = await chargeOrRecover({
        invoice,
        paymentMethodId,
        customerId: invCustomerId,
        user: { _id: user._id, email: user.email },
        adminId,
      });
```

- [ ] **Step 4: Type-check and lint**

```bash
npm run type-check
npm run lint -- src/app/api/admin/users
```

Expected: both pass.

---

## Task 1.6 — Wire per-invoice recover route to pass `bypassRecentRecoveryLock`

**Files:**
- Modify: [src/app/api/admin/users/[id]/recover-past-due-invoice/route.ts](src/app/api/admin/users/[id]/recover-past-due-invoice/route.ts) — POST handler (line 66) and GET handler (line 35)

- [ ] **Step 1: Pass `bypassRecentRecoveryLock: true` in POST**

At line 66, change:

```typescript
    const result = await recoverStrandedPastDueInvoice({
      userId,
      originalInvoiceId: parsed.data.originalInvoiceId,
      adminId: session.user.id,
    });
```

to:

```typescript
    const result = await recoverStrandedPastDueInvoice({
      userId,
      originalInvoiceId: parsed.data.originalInvoiceId,
      adminId: session.user.id,
      bypassRecentRecoveryLock: true,
    });
```

- [ ] **Step 2: Pass `bypassRecentRecoveryLock: true` in GET (eligibility preview)**

At line 35:

```typescript
  const result = await checkRecoveryEligibility({ userId, originalInvoiceId });
```

becomes:

```typescript
  const result = await checkRecoveryEligibility({
    userId,
    originalInvoiceId,
    bypassRecentRecoveryLock: true,
  });
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check
```

Expected: passes.

---

## Task 1.7 — Wire bulk recover route to pass `bypassRecentRecoveryLock`

**Files:**
- Modify: [src/app/api/admin/invoices/recover-past-due/route.ts](src/app/api/admin/invoices/recover-past-due/route.ts) — loop at lines 64–95

- [ ] **Step 1: Pass the bypass flag**

At line 65, change:

```typescript
      const result: RecoverStrandedResult = await recoverStrandedPastDueInvoice({
        userId: item.userId,
        originalInvoiceId: item.originalInvoiceId,
        adminId,
      });
```

to:

```typescript
      const result: RecoverStrandedResult = await recoverStrandedPastDueInvoice({
        userId: item.userId,
        originalInvoiceId: item.originalInvoiceId,
        adminId,
        bypassRecentRecoveryLock: true,
      });
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: passes.

---

## Task 1.8 — Surface `recovered` in the modal result row

**Files:**
- Modify: [src/components/admin/ChargePastDueUserModal.tsx](src/components/admin/ChargePastDueUserModal.tsx) — `ChargeResult` interface (lines 21–30) and the results table cell (lines 544–576)

- [ ] **Step 1: Extend the `ChargeResult` interface**

At lines 21–30, replace:

```typescript
interface ChargeResult {
  invoiceId: string;
  customerId: string;
  userId?: string;
  userEmail?: string;
  status: "success" | "failed" | "skipped";
  error?: string;
  amount?: number;
  skipReason?: string;
}
```

with:

```typescript
interface ChargeResult {
  invoiceId: string;
  customerId: string;
  userId?: string;
  userEmail?: string;
  status: "success" | "failed" | "skipped";
  error?: string;
  amount?: number;
  skipReason?: string;
  /** Set when the row took the stranded-recovery branch (void + re-bill). */
  recovered?: boolean;
  /** Set when `recovered`; points at the new finalized invoice that was paid. */
  newInvoiceId?: string;
}
```

- [ ] **Step 2: Render a "Recovered" badge in the results table**

Find the existing `<td>` that renders the status badge at line 551–553:

```tsx
                                <td className="px-3 py-2">
                                  <ChargeJobResultStatusBadge status={result.status} />
                                </td>
```

Replace with:

```tsx
                                <td className="px-3 py-2">
                                  <div className="flex flex-wrap items-center gap-1">
                                    <ChargeJobResultStatusBadge status={result.status} />
                                    {result.recovered ? (
                                      <span
                                        className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
                                        title={
                                          result.newInvoiceId
                                            ? `Recovered: void + re-bill via ${result.newInvoiceId}`
                                            : "Recovered: void + re-bill"
                                        }
                                      >
                                        Recovered
                                      </span>
                                    ) : null}
                                  </div>
                                </td>
```

- [ ] **Step 3: Show the new invoice id in the Detail column when present**

Find the Detail cell at lines 557–574 (the `<td>` containing `result.error || result.skipReason || "-"`). Replace with:

```tsx
                                <td className="px-3 py-2 text-gray-600 dark:text-neutral-400 text-xs">
                                  <div className="flex items-center justify-between gap-2">
                                    <span>
                                      {result.recovered && result.newInvoiceId
                                        ? `Recovered via ${result.newInvoiceId.slice(0, 12)}…`
                                        : result.error || result.skipReason || "-"}
                                    </span>
                                    {result.status === "failed" && rowIsStrandedError(result) && targetUserId && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setRecoverTarget({
                                            invoiceId: result.invoiceId,
                                            userEmail: result.userEmail || memberLabel || targetUserId,
                                          });
                                        }}
                                        className="rounded-md bg-amber-100 hover:bg-amber-200 text-amber-800 px-2 py-0.5 text-xs font-semibold dark:bg-amber-950/50 dark:hover:bg-amber-900/60 dark:text-amber-200 whitespace-nowrap"
                                      >
                                        Recover
                                      </button>
                                    )}
                                  </div>
                                </td>
```

- [ ] **Step 4: Type-check and lint**

```bash
npm run type-check
npm run lint -- src/components/admin/ChargePastDueUserModal.tsx
```

Expected: both pass.

- [ ] **Step 5: Visual smoke check**

```bash
npm run dev
```

Open the admin user-detail modal for any past_due user (test/staging account preferred) and click "Charge past due". For a stranded user, expect the result row to show both a green success badge and an amber "Recovered" badge. For a regular user, expect just success.

---

## Task 1.9 — Recovery test script + npm entries

**Files:**
- Create: `scripts/test-recover-stranded-past-due.ts`
- Modify: `package.json` — add `test:recover-stranded:dry` and `test:recover-stranded:live`

Pattern matches [scripts/test-force-charge.ts](scripts/test-force-charge.ts) exactly. Use that file as the structural template.

- [ ] **Step 1: Open the template for reference**

```bash
cat scripts/test-force-charge.ts | head -100
```

Note the CLI parsing (`get` and `has` helpers), env-loading (`dotenv` from `.env.local`), and dynamic imports after env validation.

- [ ] **Step 2: Create the script**

Create `scripts/test-recover-stranded-past-due.ts`:

```typescript
#!/usr/bin/env npx tsx

/**
 * Test stranded past-due recovery against a single user. Resolves user by
 * email or stripeCustomerId, finds an eligible stranded invoice, prints
 * eligibility, and (with --live) actually executes the recovery flow.
 *
 * Usage:
 *   # Dry-run by email — finds the user's stranded invoice and prints eligibility
 *   npx tsx scripts/test-recover-stranded-past-due.ts --email=user@example.com
 *
 *   # Dry-run with explicit invoice
 *   npx tsx scripts/test-recover-stranded-past-due.ts --email=user@example.com --invoice=in_xxx
 *
 *   # Live execution (requires --admin-email to log against; bypasses 6h lock)
 *   npx tsx scripts/test-recover-stranded-past-due.ts --email=user@example.com --live --admin-email=admin@example.com
 *
 * Always prints the eligibility result first. With --live, then runs the
 * orchestrator and prints the result row.
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const args = process.argv.slice(2);
const get = (key: string): string | undefined => {
  const flag = args.find((a) => a.startsWith(`--${key}=`));
  return flag ? flag.split("=").slice(1).join("=") : undefined;
};
const has = (key: string): boolean => args.includes(`--${key}`);

const email = get("email");
const customerId = get("customer");
const invoiceArg = get("invoice");
const live = has("live");
const adminEmail = get("admin-email");

if (!email && !customerId) {
  console.error("Usage: --email=<addr> or --customer=<cus_id>");
  process.exit(1);
}
if (live && !adminEmail) {
  console.error("--live requires --admin-email=<admin's email>");
  process.exit(1);
}

async function main(): Promise<void> {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set (.env.local).");
    process.exit(1);
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("STRIPE_SECRET_KEY is not set (.env.local).");
    process.exit(1);
  }

  const mongoose = await import("mongoose");
  const User = (await import("../src/models/User")).default;
  const { stripe } = await import("../src/lib/stripe");
  const { checkRecoveryEligibility, recoverStrandedPastDueInvoice } = await import(
    "../src/server/admin/recoverStrandedPastDue"
  );
  const { isOriginalInvoiceEligibleForRecovery } = await import(
    "../src/server/admin/recoverStrandedPastDuePolicy"
  );

  await mongoose.connect(process.env.MONGODB_URI);

  // Resolve target user
  type LeanUser = {
    _id: unknown;
    email?: string | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    subscription?: { status?: string | null } | null;
  };

  let user: LeanUser | null = null;
  if (email) {
    user = await User.findOne({ email })
      .select("_id email stripeCustomerId stripeSubscriptionId subscription")
      .lean<LeanUser | null>();
  } else if (customerId) {
    user = await User.findOne({ stripeCustomerId: customerId })
      .select("_id email stripeCustomerId stripeSubscriptionId subscription")
      .lean<LeanUser | null>();
  }

  if (!user) {
    console.error(`No user found for email=${email ?? ""} customer=${customerId ?? ""}`);
    await mongoose.disconnect();
    process.exit(2);
  }

  const userId = String(user._id);
  console.log(`User: ${user.email ?? userId}`);
  console.log(`  status:        ${user.subscription?.status ?? "(missing)"}`);
  console.log(`  customer:      ${user.stripeCustomerId ?? "(none)"}`);
  console.log(`  subscription:  ${user.stripeSubscriptionId ?? "(none)"}`);

  // Resolve target invoice
  let originalInvoiceId = invoiceArg;
  if (!originalInvoiceId) {
    if (!user.stripeCustomerId) {
      console.error("No customer id on user; pass --invoice=in_... explicitly.");
      await mongoose.disconnect();
      process.exit(3);
    }
    console.log("\nScanning open invoices for stranded candidates…");
    const list = await stripe.invoices.list({
      customer: user.stripeCustomerId,
      status: "open",
      limit: 100,
    });
    const stranded = list.data.find((inv) =>
      isOriginalInvoiceEligibleForRecovery(inv).eligible
    );
    if (!stranded?.id) {
      console.error(
        "No stranded open invoice found. User may not be in the 'Stripe gave up' state. Pass --invoice= to test against a specific invoice."
      );
      await mongoose.disconnect();
      process.exit(4);
    }
    originalInvoiceId = stranded.id;
    console.log(`  picked: ${originalInvoiceId} (attempt_count=${stranded.attempt_count}, next_payment_attempt=${stranded.next_payment_attempt ?? "null"})`);
  }

  // Eligibility check
  console.log("\nChecking eligibility…");
  const eligibility = await checkRecoveryEligibility({
    userId,
    originalInvoiceId,
    bypassRecentRecoveryLock: true,
  });
  console.log(JSON.stringify(eligibility, null, 2));

  if (!live) {
    console.log("\nDry run complete. Pass --live to actually execute.");
    await mongoose.disconnect();
    return;
  }

  if (!eligibility.eligible) {
    console.log("\nNot eligible — refusing to run live.");
    await mongoose.disconnect();
    process.exit(5);
  }

  // Resolve admin id
  const admin = await User.findOne({ email: adminEmail, role: "admin" })
    .select("_id email")
    .lean<{ _id: unknown; email?: string | null } | null>();
  if (!admin) {
    console.error(`No admin user found with email=${adminEmail ?? ""}`);
    await mongoose.disconnect();
    process.exit(6);
  }

  console.log("\nExecuting recovery…");
  const result = await recoverStrandedPastDueInvoice({
    userId,
    originalInvoiceId,
    adminId: String(admin._id),
    bypassRecentRecoveryLock: true,
  });
  console.log(JSON.stringify(result, null, 2));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(99);
});
```

- [ ] **Step 3: Add the npm entries**

Edit `package.json`. Find `test:force-charge:dry` and `test:force-charge:live`. Add the two new entries immediately after them:

```json
"test:recover-stranded:dry": "tsx scripts/test-recover-stranded-past-due.ts",
"test:recover-stranded:live": "tsx scripts/test-recover-stranded-past-due.ts --live",
```

- [ ] **Step 4: Smoke test the dry-run**

Choose a known past_due user from your data:

```bash
npm run test:recover-stranded:dry -- --email=wharekuru1@gmail.com
```

Expected: prints user state, scans open invoices, prints either "No stranded open invoice found" (if user already recovered) or the picked invoice + eligibility JSON.

---

## Task 1.10 — Doc updates for Phase 1

**Files:**
- Modify: [docs/admin/api.md](docs/admin/api.md)
- Modify: [docs/admin/backend.md](docs/admin/backend.md)
- Modify: [docs/admin/testing.md](docs/admin/testing.md)
- Modify: [docs/billing-stripe/gotchas.md](docs/billing-stripe/gotchas.md)
- Modify: [docs/dev-tooling/](docs/dev-tooling/) — whichever file lists `scripts/test-*.ts` (likely `api.md` or `README.md`)

- [ ] **Step 1: Open each doc and locate the existing section to extend**

Skim each file and find where the closest existing topic is described:

```bash
ls docs/admin/ docs/billing-stripe/ docs/dev-tooling/
```

For each:
- `docs/admin/api.md` — find the `POST /api/admin/users/[id]/charge-past-due` and `POST /api/admin/users/[id]/recover-past-due-invoice` and `POST /api/admin/invoices/recover-past-due` entries.
- `docs/admin/backend.md` — find the section describing `payOpenInvoiceAsPastDueAdmin` and `recoverStrandedPastDueInvoice`.
- `docs/admin/testing.md` — find the existing `test:past-due-admin-charge` and `test:recover-stranded-past-due-policy` entries.
- `docs/billing-stripe/gotchas.md` — find the section on Stripe's "open-but-dead" / stranded invoice quirk.
- `docs/dev-tooling/` — find where `scripts/test-force-charge.ts` is described.

- [ ] **Step 2: Update `docs/admin/backend.md`**

In the section describing the past-due charge flow, add a paragraph (place it after the existing `payOpenInvoiceAsPastDueAdmin` description):

```markdown
### Auto-recovery wrapper (`chargeOrRecover`)

The per-user admin "Charge past due" route ([src/app/api/admin/users/[id]/charge-past-due/route.ts](../../src/app/api/admin/users/[id]/charge-past-due/route.ts)) wraps the pay primitive in `chargeOrRecover` ([src/server/admin/chargeOrRecover.ts](../../src/server/admin/chargeOrRecover.ts)), which picks the branch via the pure `chooseChargeAction` decision function ([src/server/admin/chargeOrRecoverPolicy.ts](../../src/server/admin/chargeOrRecoverPolicy.ts)):

- **`'pay'`** — live `open` invoice with a scheduled retry; route to `payOpenInvoiceAsPastDueAdmin`.
- **`'recover'`** — invoice is `uncollectible`, `void`, or `open`-but-dead (`attempt_count >= 1 && next_payment_attempt == null`). Route to `recoverStrandedPastDueInvoice`.

When the recovery branch is taken the returned row carries `recovered: true` and `newInvoiceId: <in_…>`. The admin modal renders an amber "Recovered" badge.

Bulk cron job, Force Charge, and the per-invoice recover endpoint do NOT use `chargeOrRecover` — each keeps its existing primitive path.

### Manual-action lock bypass

`payOpenInvoiceAsPastDueAdmin` accepts `bypassRecentAttemptLock?: boolean`. When true, the default 1-per-window (6h) budget check is skipped; the 30s spam debounce still fires. `recoverStrandedPastDueInvoice` and `checkRecoveryEligibility` accept the analogous `bypassRecentRecoveryLock?: boolean`. All three admin-initiated routes (per-user charge-past-due POST, per-user recover-past-due-invoice POST/GET, bulk invoices/recover-past-due POST) pass `true`. Bulk cron job and Force Charge pass nothing (existing locks apply).
```

- [ ] **Step 3: Update `docs/admin/api.md`**

For the three endpoints, append a note describing the bypass:

```markdown
**Lock semantics:** Manual admin paths bypass the 6h recent-attempt budget. The 30s spam debounce still applies — back-to-back clicks within 30s are skipped.
```

For `POST /api/admin/users/[id]/charge-past-due`, add a note about the recovery branch:

```markdown
**Auto-recovery:** When the user's open invoice is in Stripe's "open-but-dead" state (`attempt_count >= 1 && next_payment_attempt == null`), the route automatically voids it and re-bills via a held draft. The result row carries `recovered: true` and `newInvoiceId`.
```

- [ ] **Step 4: Update `docs/admin/testing.md`**

Add entries for the new test scripts:

```markdown
| `test:charge-or-recover-policy` | Pure decision function — open-but-dead invoices route to recover; live opens route to pay. |
| `test:recover-stranded:dry` | Resolves a user by email/customer, scans open invoices for a stranded candidate, prints eligibility. No writes. |
| `test:recover-stranded:live` | Runs the full void → finalize draft → pay flow against a real user. Requires `--admin-email=`. Bypasses the 6h recovery lock so devs can re-run quickly during testing. |
```

- [ ] **Step 5: Update `docs/billing-stripe/gotchas.md`**

In the section about the stranded-invoice Stripe quirk, append:

```markdown
The admin per-user "Charge past due" button auto-detects this state and routes through the void + re-bill flow. See `docs/admin/backend.md` for the `chargeOrRecover` wrapper. The bulk cron job does NOT auto-recover (kept conservative to limit blast radius); admins drain the backlog from the Past-Due Charge History page's run-detail drawer (multi-select stranded rows → Recover Selected) after Phase 3 ships.
```

- [ ] **Step 6: Update `docs/dev-tooling/`**

In whichever file lists the test-* scripts, add an entry for `test-recover-stranded-past-due.ts` mirroring the existing `test-force-charge.ts` entry.

- [ ] **Step 7: Verify the doc-sync hook is happy**

This is what the `Stop` hook checks. Re-touch the lastVerified date at the bottom of the relevant manifest entries if the hook flags them. (The hook auto-bumps `lastVerified` when it sees the docs were updated — don't hand-edit unless asked.)

```bash
npm run lint
npm run type-check
```

- [ ] **Step 8: PHASE 1 STOP POINT — ask user for commit authorization**

Phase 1 is shippable on its own. Stop here and write a 2-3 sentence summary of what changed, then ask:

> "Phase 1 ready. Want me to commit?"

Do NOT run `git add`/`git commit`/`git push` until the user replies with one of the authorization keywords listed in CLAUDE.md.

---

# Phase 2 — Preview disclosure

This phase ships: when the admin opens the "Charge past due" modal, the preview shows an amber "Will void & re-bill via draft" callout before they type CHARGE.

---

## Task 2.1 — Add `willRecover` to the GET preview response

**Files:**
- Modify: [src/app/api/admin/users/[id]/charge-past-due/route.ts](src/app/api/admin/users/[id]/charge-past-due/route.ts) — GET handler at lines 90–235

- [ ] **Step 1: Add the import**

At the top of the file (with the other imports from `@/server/admin/`), add:

```typescript
import { chooseChargeAction } from "@/server/admin/chargeOrRecoverPolicy";
```

- [ ] **Step 2: Add `willRecover: boolean` to the preview row type**

At lines 124–132, change the inline type for the `preview` array. Replace:

```typescript
    const preview: Array<{
      invoiceId: string;
      customerId: string;
      userId: string;
      userEmail: string;
      userName: string;
      amount: number;
      currency: string;
    }> = [];
```

with:

```typescript
    const preview: Array<{
      invoiceId: string;
      customerId: string;
      userId: string;
      userEmail: string;
      userName: string;
      amount: number;
      currency: string;
      willRecover: boolean;
    }> = [];
```

- [ ] **Step 3: Populate `willRecover` when building each preview row**

Find the `preview.push(...)` call at lines 171–179 inside the eligible-invoice loop. Replace:

```typescript
      filterStats.eligible++;
      preview.push({
        invoiceId: invoice.id,
        customerId,
        userId: userIdStr,
        userEmail: user.email || "N/A",
        userName,
        amount: invoice.amount_remaining || 0,
        currency: invoice.currency || "aud",
      });
```

with:

```typescript
      filterStats.eligible++;
      const decision = chooseChargeAction(invoice);
      preview.push({
        invoiceId: invoice.id,
        customerId,
        userId: userIdStr,
        userEmail: user.email || "N/A",
        userName,
        amount: invoice.amount_remaining || 0,
        currency: invoice.currency || "aud",
        willRecover: decision.kind === "recover",
      });
```

- [ ] **Step 4: Type-check**

```bash
npm run type-check
```

Expected: passes.

---

## Task 2.2 — Render an amber callout in the modal when any preview row has `willRecover`

**Files:**
- Modify: [src/components/admin/ChargePastDueUserModal.tsx](src/components/admin/ChargePastDueUserModal.tsx) — `PreviewUser` type (lines 46–54) and the preview block (lines 260–356)

- [ ] **Step 1: Extend the `PreviewUser` type**

At lines 46–54, replace:

```typescript
interface PreviewUser {
  invoiceId: string;
  customerId: string;
  userId: string;
  userEmail: string;
  userName: string;
  amount: number;
  currency: string;
}
```

with:

```typescript
interface PreviewUser {
  invoiceId: string;
  customerId: string;
  userId: string;
  userEmail: string;
  userName: string;
  amount: number;
  currency: string;
  willRecover?: boolean;
}
```

- [ ] **Step 2: Render the amber callout above the CHARGE input when any preview row has `willRecover`**

Find the existing "Type CHARGE to confirm" block at lines 344–356. Immediately above the `<div className="bg-red-50 ...">` that wraps the input, add:

```tsx
              {preview.preview.users.some((u) => u.willRecover) && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-300 dark:border-amber-800/50 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-amber-800 dark:text-amber-200 mb-1">
                        This will void &amp; re-bill via a held draft
                      </h4>
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        Stripe has stopped retrying this invoice (smart retries
                        exhausted). Confirming will void the dead invoice and
                        finalize a held draft on the same subscription, then
                        charge that. The original invoice can&apos;t be paid
                        directly anymore.
                      </p>
                    </div>
                  </div>
                </div>
              )}
```

- [ ] **Step 3: Type-check, lint, visual smoke**

```bash
npm run type-check
npm run lint -- src/components/admin/ChargePastDueUserModal.tsx
npm run dev
```

Open the modal for a stranded past_due user. Expect the amber callout to render above the CHARGE input. Open it for a regular past_due user (still chargeable invoice) — callout should NOT render.

- [ ] **Step 4: PHASE 2 STOP POINT — ask user for commit authorization**

> "Phase 2 ready. Want me to commit?"

---

# Phase 3 — Bulk recover inside the run detail drawer

This phase ships: admin opens any bulk past-due run from the Past-Due Charge History page, sees a "Recover selected (N)" button on the per-invoice attempts section, multi-selects stranded rows, and bulk-recovers them via the existing `BulkRecoverInvoicesModal`.

---

## Task 3.1 — Hoist `isStrandedError` to a shared util

**Files:**
- Modify: [src/utils/admin/chargePastDueFormat.ts](src/utils/admin/chargePastDueFormat.ts) — add the function
- Modify: [src/app/admin/component/PastDueChargeHistory.tsx](src/app/admin/component/PastDueChargeHistory.tsx) — remove local copy, import from util

- [ ] **Step 1: Add to the shared util**

Open `src/utils/admin/chargePastDueFormat.ts` and append:

```typescript
/**
 * Match the Stripe "this invoice can no longer be paid" error pattern that
 * indicates the underlying invoice is in the open-but-dead state. Used by
 * both the manual-retries table and the run-detail drawer to decide which
 * failed rows are recoverable.
 */
export function isStrandedError(
  errorMessage?: string | null,
  errorCode?: string | null
): boolean {
  const msg = (errorMessage || "").toLowerCase();
  if (msg.includes("no longer be paid") || msg.includes("no longer payable")) return true;
  return errorCode === "invoice_not_payable";
}
```

- [ ] **Step 2: Remove the local copy from `PastDueChargeHistory.tsx`**

In [src/app/admin/component/PastDueChargeHistory.tsx](src/app/admin/component/PastDueChargeHistory.tsx) delete the local `isStrandedError` (lines 63–68) and add the import at the top of the file (near the other `@/utils/admin/chargePastDueFormat` import):

```typescript
import { formatDurationMs, isStrandedError } from "@/utils/admin/chargePastDueFormat";
```

(Merge into the existing `formatDurationMs` import.)

- [ ] **Step 3: Type-check and lint**

```bash
npm run type-check
npm run lint -- src/app/admin/component src/utils/admin
```

Expected: both pass.

---

## Task 3.2 — Add multi-select + Recover button to the drawer

**Files:**
- Modify: [src/app/admin/component/PastDueChargeHistoryDrawer.tsx](src/app/admin/component/PastDueChargeHistoryDrawer.tsx)

- [ ] **Step 1: Add imports**

At the top of `PastDueChargeHistoryDrawer.tsx`, add:

```typescript
import BulkRecoverInvoicesModal, { type BulkRecoverItem } from "@/components/admin/BulkRecoverInvoicesModal";
import { isStrandedError } from "@/utils/admin/chargePastDueFormat";
import { useQueryClient } from "@tanstack/react-query";
```

- [ ] **Step 2: Add selection state and bulk-modal state**

Inside `PastDueChargeHistoryDrawer` component (just below the existing `useState` hooks at lines 77–78), add:

```typescript
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const queryClient = useQueryClient();
```

Selection key per row: `${userId}__${invoiceId}` (must include userId because rows without it can't be recovered).

- [ ] **Step 3: Compute the list of selectable + selected items**

Inside the component body, after `groupedAttempts` is computed, add:

```typescript
  const selectableItems = useMemo<BulkRecoverItem[]>(() => {
    const items: BulkRecoverItem[] = [];
    for (const group of groupedAttempts) {
      if (!group.userId) continue;
      for (const attempt of group.attempts) {
        if (attempt.status !== "failed") continue;
        if (!isStrandedError(attempt.errorMessage, attempt.errorCode)) continue;
        items.push({
          userId: group.userId,
          userEmail: group.userEmail || "",
          originalInvoiceId: attempt.invoiceId,
          amount: attempt.amount,
        });
      }
    }
    return items;
  }, [groupedAttempts]);

  const selectedItems = useMemo<BulkRecoverItem[]>(() => {
    return selectableItems.filter((item) =>
      selectedKeys.has(`${item.userId}__${item.originalInvoiceId}`)
    );
  }, [selectableItems, selectedKeys]);

  const toggleRow = (userId: string, invoiceId: string) => {
    const key = `${userId}__${invoiceId}`;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
```

NOTE: the `attempt` row type must include `errorMessage` and `errorCode`. Open [src/hooks/queries/admin/useChargePastDueRunDetail.ts](src/hooks/queries/admin/useChargePastDueRunDetail.ts) and verify these fields are on the DTO. If not, this task expands to include adding them to the API + DTO. Run:

```bash
grep -nE "errorMessage|errorCode" src/hooks/queries/admin/useChargePastDueRunDetail.ts src/app/api/admin/charge-past-due/runs/\[runId\]/route.ts
```

If neither field is on the DTO, add them to the route's response shape and to the hook's DTO type. Otherwise proceed.

- [ ] **Step 4: Add the "Recover selected" button to the section header**

Find the section header (around lines 213–232 in the existing file — `<h4>Per-invoice attempts</h4>`). Add the button immediately to the right of the search input + user-count area:

```tsx
                  {selectableItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setBulkModalOpen(true)}
                      disabled={selectedItems.length === 0}
                      className="rounded-md bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 disabled:cursor-not-allowed text-white px-3 py-1 text-xs font-semibold dark:bg-amber-600 dark:hover:bg-amber-700"
                      title={
                        selectedItems.length === 0
                          ? "Select one or more stranded rows below"
                          : `Void + re-bill ${selectedItems.length} stranded invoice(s)`
                      }
                    >
                      Recover selected ({selectedItems.length})
                    </button>
                  )}
```

- [ ] **Step 5: Add a checkbox column on the expanded per-invoice rows**

Find the expanded row's inner table (around lines 281–311 in the existing file). Add a column header at the start of the `<thead>`:

```tsx
                                      <th className="px-2 py-2 text-left text-2xs uppercase text-gray-500 w-8"></th>
```

And a corresponding `<td>` at the start of each `<tr>` in the body — replace the existing `g.attempts.map((r) => …)` block with:

```tsx
                                    {g.attempts.map((r) => {
                                      const isStranded =
                                        r.status === "failed" &&
                                        isStrandedError(r.errorMessage, r.errorCode);
                                      const isSelectable = isStranded && !!g.userId;
                                      const key = g.userId ? `${g.userId}__${r.invoiceId}` : "";
                                      const checked = key ? selectedKeys.has(key) : false;
                                      return (
                                        <tr key={`${r.invoiceId}-${r.attemptedAt}`}>
                                          <td className="px-2 py-2 align-middle">
                                            <input
                                              type="checkbox"
                                              disabled={!isSelectable}
                                              checked={checked}
                                              onChange={() => {
                                                if (isSelectable && g.userId) {
                                                  toggleRow(g.userId, r.invoiceId);
                                                }
                                              }}
                                              title={
                                                !g.userId
                                                  ? "Cannot recover — row has no userId"
                                                  : !isStranded
                                                    ? "Only stranded failures are recoverable"
                                                    : "Select for bulk recover"
                                              }
                                              className="h-3.5 w-3.5 disabled:opacity-30"
                                            />
                                          </td>
                                          <td className="px-2 py-2 font-mono text-xs text-gray-700 dark:text-neutral-300">
                                            {r.invoiceId}
                                          </td>
                                          <td className="px-2 py-2 text-xs">
                                            <RetryStatusBadge status={r.status} />
                                          </td>
                                          <td className="px-2 py-2 text-right text-xs font-semibold text-gray-900 dark:text-white">
                                            {formatCents(r.amount)}
                                          </td>
                                          <td className="px-2 py-2 text-xs text-red-700 dark:text-red-400">
                                            {r.declineCode ?? r.errorCode ?? r.errorMessage ?? ""}
                                          </td>
                                        </tr>
                                      );
                                    })}
```

- [ ] **Step 6: Mount `BulkRecoverInvoicesModal` and wire invalidation**

At the bottom of the component's JSX (immediately before the closing `</aside>` at line 323), add:

```tsx
        {bulkModalOpen && selectedItems.length > 0 && (
          <BulkRecoverInvoicesModal
            isOpen={true}
            onClose={() => setBulkModalOpen(false)}
            items={selectedItems}
            onCompleted={() => {
              setSelectedKeys(new Set());
              // Refresh the run detail so recovered rows show updated status
              queryClient.invalidateQueries({ queryKey: ["adminChargePastDueRunDetail", runId] });
            }}
          />
        )}
```

NOTE: the exact query key (`["adminChargePastDueRunDetail", runId]`) must match what `useChargePastDueRunDetail` uses. Verify by:

```bash
grep -nE "queryKey" src/hooks/queries/admin/useChargePastDueRunDetail.ts
```

Adjust the invalidation key to match.

- [ ] **Step 7: Type-check, lint, visual smoke**

```bash
npm run type-check
npm run lint -- src/app/admin/component
npm run dev
```

Navigate to the Past-Due Charge History page, open any run that has stranded failures, expand a user, check a stranded row. Expect:
- Checkbox enabled only on stranded `failed` rows where the group has a userId.
- "Recover selected (N)" button in the section header reflects the count.
- Clicking the button opens the existing modal pre-loaded with the selected items.
- After confirming RECOVER ALL, the modal closes and the drawer's row statuses refresh.

---

## Task 3.3 — Doc updates for Phase 3

**Files:**
- Modify: [docs/admin/frontend.md](docs/admin/frontend.md) — describe the new drawer selection UI
- Modify: [docs/admin/api.md](docs/admin/api.md) — note that the existing `/api/admin/invoices/recover-past-due` endpoint is now also called from the drawer (no API change)

- [ ] **Step 1: Update `docs/admin/frontend.md`**

In the section describing `PastDueChargeHistoryDrawer`, append:

```markdown
The "Per-invoice attempts" section supports multi-select on stranded `failed`
rows (matched via `isStrandedError`). The header's "Recover selected (N)" button
opens `BulkRecoverInvoicesModal`, which POSTs to
`/api/admin/invoices/recover-past-due` in batches of 10 — same path the manual-
retries section uses. On completion the drawer's run-detail query is invalidated
so row statuses refresh in place.
```

- [ ] **Step 2: Update `docs/admin/api.md`**

Append a one-liner under `POST /api/admin/invoices/recover-past-due`:

```markdown
**Callers:** Manual-retries table on `PastDueChargeHistory` page, AND the per-invoice attempts table inside `PastDueChargeHistoryDrawer` (added Phase 3 of the auto-recovery work).
```

- [ ] **Step 3: PHASE 3 STOP POINT — ask user for commit authorization**

> "Phase 3 ready. Want me to commit?"

---

# Final verification across all phases

- [ ] **Run the full test suite**

```bash
npm run type-check
npm run lint
npm run test:charge-or-recover-policy
npm run test:past-due-admin-charge
npm run test:recover-stranded-past-due-policy
```

Expected: all pass.

- [ ] **Run the recovery test script live against ONE stranded user**

(Pick a real past_due user with a known stranded invoice, e.g. from your screenshot: `wharekuru1@gmail.com`. **Do this in staging if possible.** This will void a real invoice and charge a real card.)

```bash
npm run test:recover-stranded:dry -- --email=wharekuru1@gmail.com
# If eligibility checks pass:
npm run test:recover-stranded:live -- --email=wharekuru1@gmail.com --admin-email=your-admin@example.com
```

Expected: the dry-run prints eligibility=true with the picked invoice; the live run prints `{ ok: true, newInvoiceId: "in_...", row: { status: "success", … } }`.

- [ ] **Manual UI smoke**

1. Admin user-detail modal for the same user → "Charge past due" → result row shows green Success + amber Recovered badges. Re-click — no "skipped too soon" because the lock is bypassed for manual.
2. Past-Due Charge History page → open a recent run → expand a stranded user → check the row → click "Recover selected (1)" → confirm → row updates.

---

# Manifest check

All affected paths fall under existing manifest globs — no manifest edit required:

- `src/server/admin/**` → **admin** domain
- `src/app/api/admin/**` → **admin** domain
- `src/components/admin/**` → **admin** domain
- `src/app/admin/**` → **admin** domain
- `src/utils/admin/**` → **admin** domain
- `src/hooks/queries/admin/**` → **client-state** domain (only touched read-only in Task 3.2 verification)
- `scripts/test-*.ts` → **dev-tooling** domain
- `package.json` → **infrastructure** domain
- `docs/admin/**`, `docs/billing-stripe/**`, `docs/dev-tooling/**` are docs and not under any source glob

If Task 3.2's verification reveals that the run-detail API DTO needs to grow `errorMessage`/`errorCode` fields, those would touch [src/app/api/admin/charge-past-due/runs/[runId]/route.ts](src/app/api/admin/charge-past-due/runs/[runId]/route.ts) and [src/hooks/queries/admin/useChargePastDueRunDetail.ts](src/hooks/queries/admin/useChargePastDueRunDetail.ts) — both already covered by existing manifest entries.

---

# Risks

1. **Voiding is irreversible.** Mitigated by `isOriginalInvoiceEligibleForRecovery` only returning `eligible: true` for `void`/`uncollectible`/`open-but-exhausted`. Existing tests cover boundaries. A second guard: the GET preview (Phase 2) renders the amber callout so the admin knows what's about to happen.

2. **Surprise void on admin click.** Mitigated by Phase 2's preview disclosure.

3. **Partial recovery failure** (void OK, finalize fails). The dead invoice is gone, no new payable invoice exists, user is stuck until a new cycle invoice is generated by Stripe. The recovery primitive already returns specific reasons (`void_failed`, `no_held_draft`, `finalize_failed`) and logs each step to `InvoiceChargeLog`. `chargeOrRecover` surfaces these in the result row's `error` field.

4. **Manual repeat-charge enabled.** With the 6h budget bypassed, an admin could deliberately click "Charge past due" multiple times within hours. 30s debounce still protects against double-clicks. This is the intended UX per the user's request.

5. **Bulk cron job unchanged.** The bulk cron job will continue logging `failed` rows for stranded users every night. Admins drain those via the Phase 3 drawer multi-select. If the failure noise on the History page becomes a problem, a future change could either (a) auto-recover in the cron job (rejected this round — Vercel timeout risk) or (b) filter out known-stranded users from the bulk eligibility query.

6. **Drawer DTO might lack `errorMessage`/`errorCode`.** Task 3.2 Step 3 verifies and conditionally extends. Watch for that pivot.

7. **Doc-sync `Stop` hook.** Updating docs is enforced. Each phase ends with a doc-update task that aligns with the manifest. If the hook still complains, follow its hint to update the listed file before committing.
