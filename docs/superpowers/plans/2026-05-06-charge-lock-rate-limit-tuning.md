# Charge Lock Rate-Limit Tuning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current 24h-per-invoice charge lock with a 6h window + per-path attempt budgets (1 for batch paths, 3 for human-initiated paths). Add a 30-second debounce for spam-click protection.

**Architecture:** Pure constants and predicates in `past-due-charge-idempotency.ts`. `payOpenInvoiceAsPastDueAdmin` accepts optional `idempotencyKey` and `attemptBudgetCheck` callback parameters; defaults preserve the existing 1-per-window behavior for batch paths. Force Charge orchestrator computes per-path attempt numbers and supplies per-attempt idempotency keys plus a budget-check callback.

**Tech Stack:** TypeScript, Mongoose, Stripe SDK, `tsx` test scripts with `node:assert/strict`.

**Spec:** [docs/superpowers/specs/2026-05-06-charge-lock-rate-limit-tuning-design.md](../specs/2026-05-06-charge-lock-rate-limit-tuning-design.md)

**Critical safety property:** Per-attempt idempotency keys for Force Charge paths mean every "retry" is a real Stripe call. Worst-case bound: 7 fresh decline attempts per invoice per 6h (1 bulk + 3 admin FC + 3 user). Per-path budgets are tracked separately via `result.forceCharge.triggeredBy` already stored by Force Charge.

---

## File Structure

| Path | Type | Responsibility |
|---|---|---|
| `src/server/admin/past-due-charge-idempotency.ts` | Modify | Drop window 24→6, add new constants + helpers |
| `src/server/admin/__tests__/chargePastDueShared.test.ts` | Modify | Update assertions for new window value |
| `src/server/admin/__tests__/chargeLockRateLimitPolicy.test.ts` | Create | Unit tests for new pure helpers (debounce, budget, key builder) |
| `src/server/admin/chargePastDueShared.ts` | Modify | Add `idempotencyKey` + `attemptBudgetCheck` params; add 30s debounce |
| `src/server/admin/forceChargePastDue.ts` | Modify | Compute per-path attempt N, supply key + budget callback |
| `package.json` | Modify | Add `test:charge-lock-rate-limit` script |
| `docs/admin/api.md`, `docs/admin/backend.md` | Modify | Document new lock semantics |

No new endpoint files. No new orchestrator files. Single change pattern: enrich existing primitive with optional params, route Force Charge through them.

---

### Task 1: Pure helpers — write failing test

**Files:**
- Create: `src/server/admin/__tests__/chargeLockRateLimitPolicy.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// src/server/admin/__tests__/chargeLockRateLimitPolicy.test.ts
import assert from "node:assert/strict";
import {
  RECENT_ATTEMPT_WINDOW_HOURS,
  MAX_FORCE_CHARGE_ATTEMPTS_PER_WINDOW,
  MIN_SECONDS_BETWEEN_ATTEMPTS,
  cutoffForDebounce,
  buildForceChargeIdempotencyKey,
  countForceChargeAttempts,
  hasForceChargeBudgetExhausted,
  isDebouncedTooSoon,
} from "../past-due-charge-idempotency";

function testWindowConstant() {
  assert.equal(RECENT_ATTEMPT_WINDOW_HOURS, 6);
}

function testForceChargeBudgetConstant() {
  assert.equal(MAX_FORCE_CHARGE_ATTEMPTS_PER_WINDOW, 3);
}

function testDebounceConstant() {
  assert.equal(MIN_SECONDS_BETWEEN_ATTEMPTS, 30);
}

function testCutoffForDebounce() {
  const now = new Date("2026-05-06T12:00:00.000Z");
  const cutoff = cutoffForDebounce(now);
  assert.equal(cutoff.toISOString(), "2026-05-06T11:59:30.000Z");
}

function testBuildForceChargeKeyAdmin() {
  assert.equal(
    buildForceChargeIdempotencyKey("in_x", "admin", 1),
    "admin-charge-in_x-fc-admin-1"
  );
  assert.equal(
    buildForceChargeIdempotencyKey("in_x", "admin", 3),
    "admin-charge-in_x-fc-admin-3"
  );
}

function testBuildForceChargeKeyUser() {
  assert.equal(
    buildForceChargeIdempotencyKey("in_x", "user", 2),
    "admin-charge-in_x-fc-user-2"
  );
}

function testKeysAreDistinctAcrossPathsAndAttempts() {
  const keys = [
    buildForceChargeIdempotencyKey("in_x", "admin", 1),
    buildForceChargeIdempotencyKey("in_x", "admin", 2),
    buildForceChargeIdempotencyKey("in_x", "admin", 3),
    buildForceChargeIdempotencyKey("in_x", "user", 1),
    buildForceChargeIdempotencyKey("in_x", "user", 2),
    buildForceChargeIdempotencyKey("in_x", "user", 3),
  ];
  assert.equal(new Set(keys).size, 6);
}

function testCountForceChargeAttemptsZeroOnEmpty() {
  assert.equal(countForceChargeAttempts([], "admin"), 0);
}

function testCountForceChargeAttemptsAdminOnly() {
  const now = new Date("2026-05-06T12:00:00.000Z");
  const rows = [
    { attemptedAt: new Date("2026-05-06T10:00:00.000Z"), result: { forceCharge: { triggeredBy: "admin" } } },
    { attemptedAt: new Date("2026-05-06T11:00:00.000Z"), result: { forceCharge: { triggeredBy: "user" } } },
    { attemptedAt: new Date("2026-05-06T11:30:00.000Z"), result: { forceCharge: { triggeredBy: "admin" } } },
  ];
  assert.equal(countForceChargeAttempts(rows, "admin", now), 2);
  assert.equal(countForceChargeAttempts(rows, "user", now), 1);
}

function testCountForceChargeAttemptsExcludesOutsideWindow() {
  const now = new Date("2026-05-06T12:00:00.000Z");
  // 7h ago — outside the 6h window
  const rows = [
    { attemptedAt: new Date("2026-05-06T05:00:00.000Z"), result: { forceCharge: { triggeredBy: "admin" } } },
    // 5h ago — inside
    { attemptedAt: new Date("2026-05-06T07:00:00.000Z"), result: { forceCharge: { triggeredBy: "admin" } } },
  ];
  assert.equal(countForceChargeAttempts(rows, "admin", now), 1);
}

function testCountForceChargeAttemptsIgnoresUntaggedRows() {
  const now = new Date("2026-05-06T12:00:00.000Z");
  // Bulk past-due charger row — no forceCharge tag
  const rows = [
    { attemptedAt: new Date("2026-05-06T10:00:00.000Z"), result: {} },
    { attemptedAt: new Date("2026-05-06T11:00:00.000Z") }, // no result at all
  ];
  assert.equal(countForceChargeAttempts(rows, "admin", now), 0);
  assert.equal(countForceChargeAttempts(rows, "user", now), 0);
}

function testHasBudgetExhaustedFalseAtTwo() {
  const now = new Date("2026-05-06T12:00:00.000Z");
  const rows = [
    { attemptedAt: new Date("2026-05-06T10:00:00.000Z"), result: { forceCharge: { triggeredBy: "admin" } } },
    { attemptedAt: new Date("2026-05-06T11:00:00.000Z"), result: { forceCharge: { triggeredBy: "admin" } } },
  ];
  assert.equal(hasForceChargeBudgetExhausted(rows, "admin", now), false);
}

function testHasBudgetExhaustedTrueAtThree() {
  const now = new Date("2026-05-06T12:00:00.000Z");
  const rows = [
    { attemptedAt: new Date("2026-05-06T09:00:00.000Z"), result: { forceCharge: { triggeredBy: "admin" } } },
    { attemptedAt: new Date("2026-05-06T10:00:00.000Z"), result: { forceCharge: { triggeredBy: "admin" } } },
    { attemptedAt: new Date("2026-05-06T11:00:00.000Z"), result: { forceCharge: { triggeredBy: "admin" } } },
  ];
  assert.equal(hasForceChargeBudgetExhausted(rows, "admin", now), true);
}

function testHasBudgetExhaustedSeparatePerPath() {
  const now = new Date("2026-05-06T12:00:00.000Z");
  // 3 admin attempts but 0 user attempts — admin exhausted, user not
  const rows = [
    { attemptedAt: new Date("2026-05-06T09:00:00.000Z"), result: { forceCharge: { triggeredBy: "admin" } } },
    { attemptedAt: new Date("2026-05-06T10:00:00.000Z"), result: { forceCharge: { triggeredBy: "admin" } } },
    { attemptedAt: new Date("2026-05-06T11:00:00.000Z"), result: { forceCharge: { triggeredBy: "admin" } } },
  ];
  assert.equal(hasForceChargeBudgetExhausted(rows, "admin", now), true);
  assert.equal(hasForceChargeBudgetExhausted(rows, "user", now), false);
}

function testIsDebouncedTooSoonTrueWithin30s() {
  const now = new Date("2026-05-06T12:00:00.000Z");
  const rows = [
    { attemptedAt: new Date("2026-05-06T11:59:50.000Z") }, // 10s ago
  ];
  assert.equal(isDebouncedTooSoon(rows, now), true);
}

function testIsDebouncedTooSoonFalseAfter30s() {
  const now = new Date("2026-05-06T12:00:00.000Z");
  const rows = [
    { attemptedAt: new Date("2026-05-06T11:59:00.000Z") }, // 60s ago
  ];
  assert.equal(isDebouncedTooSoon(rows, now), false);
}

function testIsDebouncedTooSoonFalseOnEmpty() {
  assert.equal(isDebouncedTooSoon([]), false);
}

function run() {
  testWindowConstant();
  testForceChargeBudgetConstant();
  testDebounceConstant();
  testCutoffForDebounce();
  testBuildForceChargeKeyAdmin();
  testBuildForceChargeKeyUser();
  testKeysAreDistinctAcrossPathsAndAttempts();
  testCountForceChargeAttemptsZeroOnEmpty();
  testCountForceChargeAttemptsAdminOnly();
  testCountForceChargeAttemptsExcludesOutsideWindow();
  testCountForceChargeAttemptsIgnoresUntaggedRows();
  testHasBudgetExhaustedFalseAtTwo();
  testHasBudgetExhaustedTrueAtThree();
  testHasBudgetExhaustedSeparatePerPath();
  testIsDebouncedTooSoonTrueWithin30s();
  testIsDebouncedTooSoonFalseAfter30s();
  testIsDebouncedTooSoonFalseOnEmpty();
  console.log("chargeLockRateLimitPolicy tests passed");
}

run();
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
npx tsx src/server/admin/__tests__/chargeLockRateLimitPolicy.test.ts
```
Expected: FAIL with import error or `assert.equal(RECENT_ATTEMPT_WINDOW_HOURS, 6)` failure (current value is 24 and the new exports don't exist yet).

---

### Task 2: Pure helpers — implement in `past-due-charge-idempotency.ts`

**Files:**
- Modify: `src/server/admin/past-due-charge-idempotency.ts`

- [ ] **Step 1: Replace the file content**

Replace the entire file with this content (drop window 24→6, add new constants and helpers, preserve existing exports):

```typescript
/**
 * Pure helpers governing the admin-driven past-due charge cadence and
 * the Force Charge per-path attempt budgets.
 *
 * Kept in their own module (no Stripe SDK imports) so they can be unit-tested
 * without `STRIPE_SECRET_KEY` being present in the environment.
 */

/**
 * Window for any attempt-counting on InvoiceChargeLog.
 * Tightened from 24h on 2026-05-06 to allow same-day human-driven retries
 * (Force Charge admin / user self-serve). Per-path budgets cap the worst case.
 */
export const RECENT_ATTEMPT_WINDOW_HOURS = 6;

/** Max attempts per 6h window for each Force Charge path (admin and user counted separately). */
export const MAX_FORCE_CHARGE_ATTEMPTS_PER_WINDOW = 3;

/** Minimum seconds between any two attempts on the same invoice (spam-click debounce). */
export const MIN_SECONDS_BETWEEN_ATTEMPTS = 30;

/** Earliest `attemptedAt` that still counts as "recent" for skip-eligibility checks. */
export function cutoffForRecentAttempt(now: Date = new Date()): Date {
  return new Date(now.getTime() - RECENT_ATTEMPT_WINDOW_HOURS * 60 * 60 * 1000);
}

/** Earliest `attemptedAt` that still counts as "too soon" for the debounce check. */
export function cutoffForDebounce(now: Date = new Date()): Date {
  return new Date(now.getTime() - MIN_SECONDS_BETWEEN_ATTEMPTS * 1000);
}

/**
 * Stripe idempotency key for admin-driven `invoices.pay`. Stable per invoice so a
 * rapid double-submit returns Stripe's cached first response. Used by bulk past-due
 * charger and the regular per-user admin retry — both are 1-per-window paths.
 */
export function buildAdminChargeIdempotencyKey(invoiceId: string): string {
  return `admin-charge-${invoiceId}`;
}

/**
 * Stripe idempotency key for Force Charge paths. Per-attempt within the 6h window
 * so each of the 3 allowed attempts hits Stripe fresh. Separate `triggeredBy`
 * namespaces keep admin and user budgets independent.
 */
export function buildForceChargeIdempotencyKey(
  invoiceId: string,
  triggeredBy: "admin" | "user",
  attemptNumber: number
): string {
  return `admin-charge-${invoiceId}-fc-${triggeredBy}-${attemptNumber}`;
}

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

type ChargeLogRowForBudget = {
  attemptedAt: Date;
  result?: unknown;
};

function extractTriggeredBy(result: unknown): "admin" | "user" | null {
  if (!result || typeof result !== "object") return null;
  const record = result as Record<string, unknown>;
  const fc = record.forceCharge;
  if (!fc || typeof fc !== "object") return null;
  const triggered = (fc as Record<string, unknown>).triggeredBy;
  if (triggered === "admin" || triggered === "user") return triggered;
  return null;
}

/**
 * Count how many Force Charge attempts on this path have been made within the
 * 6h window. Admin and user paths are counted separately based on
 * `result.forceCharge.triggeredBy` (set by `forceChargeCurrentCycle` post-pay).
 */
export function countForceChargeAttempts(
  rows: ChargeLogRowForBudget[],
  triggeredBy: "admin" | "user",
  now: Date = new Date()
): number {
  const cutoff = cutoffForRecentAttempt(now);
  let count = 0;
  for (const row of rows) {
    if (row.attemptedAt < cutoff) continue;
    if (extractTriggeredBy(row.result) === triggeredBy) count++;
  }
  return count;
}

/**
 * Whether the per-path Force Charge budget for this 6h window is exhausted.
 * Returns true at >= MAX_FORCE_CHARGE_ATTEMPTS_PER_WINDOW prior attempts.
 */
export function hasForceChargeBudgetExhausted(
  rows: ChargeLogRowForBudget[],
  triggeredBy: "admin" | "user",
  now: Date = new Date()
): boolean {
  return countForceChargeAttempts(rows, triggeredBy, now) >= MAX_FORCE_CHARGE_ATTEMPTS_PER_WINDOW;
}

/**
 * Whether ANY attempt happened within the debounce window (default 30s). Used
 * uniformly across all paths to prevent spam-click double-submissions.
 */
export function isDebouncedTooSoon(
  rows: ChargeLogRowForBudget[],
  now: Date = new Date()
): boolean {
  const cutoff = cutoffForDebounce(now);
  return rows.some((row) => row.attemptedAt >= cutoff);
}
```

- [ ] **Step 2: Run the new test to verify it passes**

```powershell
npx tsx src/server/admin/__tests__/chargeLockRateLimitPolicy.test.ts
```
Expected: `chargeLockRateLimitPolicy tests passed`.

- [ ] **Step 3: Add npm script**

In `package.json` `scripts` block, after the existing `test:past-due-admin-charge` line, add:

```json
"test:charge-lock-rate-limit": "tsx src/server/admin/__tests__/chargeLockRateLimitPolicy.test.ts",
```

Then run:

```powershell
npm run test:charge-lock-rate-limit
```
Expected: `chargeLockRateLimitPolicy tests passed`.

- [ ] **Step 4: Commit (after user authorizes)**

```powershell
git add src/server/admin/past-due-charge-idempotency.ts src/server/admin/__tests__/chargeLockRateLimitPolicy.test.ts package.json
git commit -m "feat(admin): add 6h window + per-path attempt budget + debounce helpers"
```

---

### Task 3: Update existing tests for new window value

**Files:**
- Modify: `src/server/admin/__tests__/chargePastDueShared.test.ts`

This file currently asserts the window is 24h and the cutoff math uses 24h. Both need updating since the constant is now 6.

- [ ] **Step 1: Update the window assertion**

Find the existing test:

```typescript
function testWindowConstant() {
  assert.equal(RECENT_ATTEMPT_WINDOW_HOURS, 24);
}
```

Change `24` to `6`:

```typescript
function testWindowConstant() {
  assert.equal(RECENT_ATTEMPT_WINDOW_HOURS, 6);
}
```

- [ ] **Step 2: Update the cutoff math test**

Find:

```typescript
function testCutoffIs24hBeforeNow() {
  const now = new Date("2026-05-05T12:00:00.000Z");
  const cutoff = cutoffForRecentAttempt(now);
  assert.equal(cutoff.toISOString(), "2026-05-04T12:00:00.000Z");
}
```

Replace function name and body to reflect 6h:

```typescript
function testCutoffIs6hBeforeNow() {
  const now = new Date("2026-05-05T12:00:00.000Z");
  const cutoff = cutoffForRecentAttempt(now);
  assert.equal(cutoff.toISOString(), "2026-05-05T06:00:00.000Z");
}
```

Update the call inside `run()` to match.

- [ ] **Step 3: Update the cutoff-moves-with-now test**

Find:

```typescript
function testCutoffMovesWithNow() {
  const earlier = cutoffForRecentAttempt(new Date("2026-05-05T00:00:00.000Z"));
  const later = cutoffForRecentAttempt(new Date("2026-05-06T00:00:00.000Z"));
  assert.ok(later.getTime() > earlier.getTime());
  assert.equal(later.getTime() - earlier.getTime(), 24 * 60 * 60 * 1000);
}
```

The `24 * 60 * 60 * 1000` here is the DELTA between two `now` values 24h apart — that's what's being asserted (the cutoff moves linearly). It's NOT the window constant. **Leave this assertion as-is.** The two now-values are still 24h apart in the test fixture; what moves is the cutoff, which moves by the same 24h. Test still valid.

(Sanity check: `cutoffForRecentAttempt(now1)` returns `now1 - 6h`, `cutoffForRecentAttempt(now2)` returns `now2 - 6h`. Difference is `now2 - now1` regardless of window value. So the test is valid.)

- [ ] **Step 4: Run the test to verify it passes**

```powershell
npm run test:past-due-admin-charge
```
Expected: `chargePastDueShared helpers tests passed` (and any siblings the script runs).

- [ ] **Step 5: Commit (after user authorizes)**

```powershell
git add src/server/admin/__tests__/chargePastDueShared.test.ts
git commit -m "test(admin): update window assertions to new 6h value"
```

---

### Task 4: Update `payOpenInvoiceAsPastDueAdmin` — params + debounce

**Files:**
- Modify: `src/server/admin/chargePastDueShared.ts`

Add two optional parameters and inject the 30s debounce check.

- [ ] **Step 1: Update the function signature**

Find the function declaration:

```typescript
export async function payOpenInvoiceAsPastDueAdmin(params: {
  invoice: Stripe.Invoice;
  paymentMethodId: string;
  customerId: string;
  user: LeanPastDueUser;
  adminId: string;
  chargeRunId?: mongoose.Types.ObjectId | null;
}): Promise<PastDueChargeResultRow> {
```

Replace with:

```typescript
export async function payOpenInvoiceAsPastDueAdmin(params: {
  invoice: Stripe.Invoice;
  paymentMethodId: string;
  customerId: string;
  user: LeanPastDueUser;
  adminId: string;
  chargeRunId?: mongoose.Types.ObjectId | null;
  /**
   * Override the default `admin-charge-${invoiceId}` Stripe idempotency key.
   * Force Charge paths supply per-attempt keys to allow real retries within
   * the 6h budget window (otherwise Stripe returns the cached first response).
   */
  idempotencyKey?: string;
  /**
   * Override the default 1-per-window lock check. When provided, the function
   * calls this instead of running its own `findOne` on InvoiceChargeLog.
   * Force Charge paths supply a callback that counts per-path Force Charge
   * attempts and allows up to 3 per 6h window.
   *
   * Returns `allowed: true` to proceed or `allowed: false` with a reason/message
   * to skip. Independent of the 30s debounce check, which always runs first.
   */
  attemptBudgetCheck?: () => Promise<
    { allowed: true } | { allowed: false; reason: string; message: string }
  >;
}): Promise<PastDueChargeResultRow> {
```

- [ ] **Step 2: Destructure new params**

Find the existing param destructuring at the top of the function body:

```typescript
const { invoice, paymentMethodId, customerId, user, adminId, chargeRunId = null } = params;
```

Update to:

```typescript
const {
  invoice,
  paymentMethodId,
  customerId,
  user,
  adminId,
  chargeRunId = null,
  idempotencyKey,
  attemptBudgetCheck,
} = params;
```

- [ ] **Step 3: Add 30s debounce check + budget check before the existing `findOne` lock**

Find this existing block (around the start of the try after the early validations):

```typescript
  // 24h skip — protects against repeat decline fees when an admin (or two admins,
  // or the per-user retry endpoint and the bulk endpoint) hits the same invoice
  // within Stripe's idempotency window. The Stripe key below is the second line of
  // defence; this DB check is the first because it avoids the Stripe call entirely.
  const recentAttempt = await InvoiceChargeLog.findOne({
    invoiceId,
    attemptedAt: { $gte: cutoffForRecentAttempt() },
  })
    .select({ _id: 1, status: 1, attemptedAt: 1 })
    .lean();

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
```

Replace with:

```typescript
  // 30s spam-click debounce — fires before any other lock check.
  const recentRowsForDebounce = await InvoiceChargeLog.find({
    invoiceId,
    attemptedAt: { $gte: cutoffForDebounce() },
  })
    .select({ attemptedAt: 1 })
    .lean();

  if (recentRowsForDebounce.length > 0) {
    await InvoiceChargeLog.create({
      invoiceId,
      customerId,
      userId: new mongoose.Types.ObjectId(userIdStr),
      adminId: new mongoose.Types.ObjectId(adminId),
      status: "skipped",
      amount,
      attemptedAt: new Date(),
      errorMessage: `Skipped: another attempt within last ${MIN_SECONDS_BETWEEN_ATTEMPTS} seconds (debounce)`,
      chargeRunId,
    });

    return {
      invoiceId,
      customerId,
      userId: userIdStr,
      userEmail,
      status: "skipped",
      skipReason: "too_soon",
      amount,
    };
  }

  // Window-based budget check. Default: 1-per-window (any prior attempt blocks).
  // Force Charge paths inject `attemptBudgetCheck` for per-path 3-per-window budgets.
  if (attemptBudgetCheck) {
    const budget = await attemptBudgetCheck();
    if (!budget.allowed) {
      await InvoiceChargeLog.create({
        invoiceId,
        customerId,
        userId: new mongoose.Types.ObjectId(userIdStr),
        adminId: new mongoose.Types.ObjectId(adminId),
        status: "skipped",
        amount,
        attemptedAt: new Date(),
        errorMessage: `Skipped: ${budget.message}`,
        chargeRunId,
      });

      return {
        invoiceId,
        customerId,
        userId: userIdStr,
        userEmail,
        status: "skipped",
        skipReason: budget.reason,
        amount,
      };
    }
  } else {
    const recentAttempt = await InvoiceChargeLog.findOne({
      invoiceId,
      attemptedAt: { $gte: cutoffForRecentAttempt() },
    })
      .select({ _id: 1, status: 1, attemptedAt: 1 })
      .lean();

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

- [ ] **Step 4: Use the provided idempotency key in `stripe.invoices.pay`**

Find the call to `stripe.invoices.pay`:

```typescript
    const paidInvoiceResponse = await stripe.invoices.pay(
      invoiceId,
      {
        payment_method: paymentMethodId,
        off_session: true,
      },
      { idempotencyKey: buildAdminChargeIdempotencyKey(invoiceId) }
    );
```

Replace the idempotency key line:

```typescript
    const paidInvoiceResponse = await stripe.invoices.pay(
      invoiceId,
      {
        payment_method: paymentMethodId,
        off_session: true,
      },
      { idempotencyKey: idempotencyKey ?? buildAdminChargeIdempotencyKey(invoiceId) }
    );
```

- [ ] **Step 5: Update imports**

At the top of `chargePastDueShared.ts`, find the existing import block from `./past-due-charge-idempotency`:

```typescript
import {
  RECENT_ATTEMPT_WINDOW_HOURS,
  SKIP_REASON_NO_LONGER_PAST_DUE,
  buildAdminChargeIdempotencyKey,
  cutoffForRecentAttempt,
  shouldSkipForNotPastDue,
} from "./past-due-charge-idempotency";
```

Add `cutoffForDebounce` and `MIN_SECONDS_BETWEEN_ATTEMPTS` to the imports:

```typescript
import {
  MIN_SECONDS_BETWEEN_ATTEMPTS,
  RECENT_ATTEMPT_WINDOW_HOURS,
  SKIP_REASON_NO_LONGER_PAST_DUE,
  buildAdminChargeIdempotencyKey,
  cutoffForDebounce,
  cutoffForRecentAttempt,
  shouldSkipForNotPastDue,
} from "./past-due-charge-idempotency";
```

Also extend the existing re-export block (which currently re-exports the old names) to include the new ones, so callers can import from `chargePastDueShared`:

```typescript
export {
  MIN_SECONDS_BETWEEN_ATTEMPTS,
  RECENT_ATTEMPT_WINDOW_HOURS,
  SKIP_REASON_NO_LONGER_PAST_DUE,
  buildAdminChargeIdempotencyKey,
  cutoffForDebounce,
  cutoffForRecentAttempt,
  shouldSkipForNotPastDue,
};
```

- [ ] **Step 6: Verify type-check + tests**

```powershell
npm run type-check; npm run test:past-due-admin-charge; npm run test:charge-lock-rate-limit; npm run test:force-charge-policy
```

All must pass.

- [ ] **Step 7: Commit (after user authorizes)**

```powershell
git add src/server/admin/chargePastDueShared.ts
git commit -m "feat(admin): add idempotencyKey + attemptBudgetCheck params + 30s debounce to pay primitive"
```

---

### Task 5: Force Charge orchestrator — per-attempt key + budget callback

**Files:**
- Modify: `src/server/admin/forceChargePastDue.ts`

The orchestrator already counts prior force-charge attempts via `hasRecentSuccessfulChargeOnSubscription` (success-only lock for the SAME subscription). We add: per-path budget counting on the SAME invoice, per-attempt idempotency key, budget callback for the pay primitive.

- [ ] **Step 1: Update imports**

At the top of the file, find:

```typescript
import {
  buildForceChargeFinalizeIdempotencyKey,
  hasRecentSuccessfulChargeOnSubscription,
  isCurrentPeriodAlreadyPaid,
  pickForceChargeTarget,
  type ForceChargeTarget,
} from "./forceChargePastDuePolicy";
```

Add the new helpers and constants from `past-due-charge-idempotency.ts`:

```typescript
import {
  buildForceChargeFinalizeIdempotencyKey,
  hasRecentSuccessfulChargeOnSubscription,
  isCurrentPeriodAlreadyPaid,
  pickForceChargeTarget,
  type ForceChargeTarget,
} from "./forceChargePastDuePolicy";
import {
  MAX_FORCE_CHARGE_ATTEMPTS_PER_WINDOW,
  RECENT_ATTEMPT_WINDOW_HOURS,
  buildForceChargeIdempotencyKey,
  countForceChargeAttempts,
  cutoffForRecentAttempt,
  hasForceChargeBudgetExhausted,
} from "./past-due-charge-idempotency";
```

(If `cutoffForRecentAttempt` was already imported, leave the existing import alone and just add the new names.)

- [ ] **Step 2: Update the eligibility-check error message**

Find this block in `checkForceChargeEligibility`:

```typescript
  if (
    hasRecentSuccessfulChargeOnSubscription(
      recentRows.map((r) => ({
        attemptedAt: r.attemptedAt,
        status: r.status as "success" | "failed" | "skipped",
        result: r.result,
      })),
      user.stripeSubscriptionId
    )
  ) {
    return {
      eligible: false,
      reason: "recent_charge_attempt",
      message: "A successful charge for this subscription happened within the last 24h",
    };
  }
```

Update the message string to use the constant:

```typescript
  if (
    hasRecentSuccessfulChargeOnSubscription(
      recentRows.map((r) => ({
        attemptedAt: r.attemptedAt,
        status: r.status as "success" | "failed" | "skipped",
        result: r.result,
      })),
      user.stripeSubscriptionId
    )
  ) {
    return {
      eligible: false,
      reason: "recent_charge_attempt",
      message: `A successful charge for this subscription happened within the last ${RECENT_ATTEMPT_WINDOW_HOURS}h`,
    };
  }
```

- [ ] **Step 3: Add per-path budget check inside `forceChargeCurrentCycle`**

Find the start of `forceChargeCurrentCycle`. After the existing eligibility check returns its `{ eligible: true, ... }` payload (or its early-return on ineligibility), and after the user re-fetch, BEFORE the finalize step, add the per-path budget check.

Specifically, find this block (the eligibility call + early-return):

```typescript
  const eligibility = await checkForceChargeEligibility({ userId });
  if (!eligibility.eligible) {
    return {
      ok: false,
      reason: eligibility.reason,
      message: eligibility.message,
    };
  }

  const { target, expectedAmountCents, subscriptionId } = eligibility;
```

Just AFTER the destructure on the last line (and before the user re-fetch), insert:

```typescript
  // Per-path Force Charge budget: count prior force-charge attempts on this
  // invoice + this triggeredBy path within the 6h window.
  const targetInvoiceId = target.invoice.id;
  if (!targetInvoiceId) {
    return {
      ok: false,
      reason: "pay_failed",
      message: "Target invoice missing id",
    };
  }
  const priorAttemptRows = await InvoiceChargeLog.find({
    invoiceId: targetInvoiceId,
    attemptedAt: { $gte: cutoffForRecentAttempt() },
  })
    .select({ attemptedAt: 1, result: 1 })
    .lean();
  const priorPathRows = priorAttemptRows.map((r) => ({
    attemptedAt: r.attemptedAt,
    result: r.result,
  }));
  if (hasForceChargeBudgetExhausted(priorPathRows, params.triggeredBy)) {
    return {
      ok: false,
      reason: "recent_charge_attempt",
      message: `Force Charge budget for ${params.triggeredBy} exhausted (max ${MAX_FORCE_CHARGE_ATTEMPTS_PER_WINDOW} per ${RECENT_ATTEMPT_WINDOW_HOURS}h). Try again later.`,
    };
  }
  const attemptNumber =
    countForceChargeAttempts(priorPathRows, params.triggeredBy) + 1;
```

- [ ] **Step 4: Build and pass the per-attempt key + budget callback**

Find the call to `payOpenInvoiceAsPastDueAdmin` near the end of `forceChargeCurrentCycle`:

```typescript
  const row = await payOpenInvoiceAsPastDueAdmin({
    invoice: payableInvoice,
    paymentMethodId: resolvedPmId,
    customerId: user.stripeCustomerId,
    user: { _id: user._id, email: user.email },
    adminId,
  });
```

Replace with the version that includes the new params:

```typescript
  const idempotencyKey = buildForceChargeIdempotencyKey(
    targetInvoiceId,
    params.triggeredBy,
    attemptNumber
  );

  // TOCTOU recheck: re-validate the budget right before the Stripe call.
  // Cheap (one indexed query) and protects against concurrent Force Charges
  // racing past the initial check.
  const attemptBudgetCheck = async () => {
    const freshRows = await InvoiceChargeLog.find({
      invoiceId: targetInvoiceId,
      attemptedAt: { $gte: cutoffForRecentAttempt() },
    })
      .select({ attemptedAt: 1, result: 1 })
      .lean();
    const freshPathRows = freshRows.map((r) => ({
      attemptedAt: r.attemptedAt,
      result: r.result,
    }));
    if (hasForceChargeBudgetExhausted(freshPathRows, params.triggeredBy)) {
      return {
        allowed: false as const,
        reason: "recent_charge_attempt",
        message: `Force Charge budget for ${params.triggeredBy} exhausted (max ${MAX_FORCE_CHARGE_ATTEMPTS_PER_WINDOW} per ${RECENT_ATTEMPT_WINDOW_HOURS}h)`,
      };
    }
    return { allowed: true as const };
  };

  const row = await payOpenInvoiceAsPastDueAdmin({
    invoice: payableInvoice,
    paymentMethodId: resolvedPmId,
    customerId: user.stripeCustomerId,
    user: { _id: user._id, email: user.email },
    adminId,
    idempotencyKey,
    attemptBudgetCheck,
  });
```

- [ ] **Step 5: Verify type-check + tests**

```powershell
npm run type-check; npm run test:past-due-admin-charge; npm run test:charge-lock-rate-limit; npm run test:force-charge-policy; npm run test:recover-stranded-past-due-policy
```

All must pass.

- [ ] **Step 6: Commit (after user authorizes)**

```powershell
git add src/server/admin/forceChargePastDue.ts
git commit -m "feat(admin): per-path Force Charge attempt budget + per-attempt idempotency key"
```

---

### Task 6: Documentation updates

**Files:**
- Modify: `docs/admin/api.md`
- Modify: `docs/admin/backend.md`

- [ ] **Step 1: Update `docs/admin/backend.md`**

Find the "Force Charge for stuck-paused subscriptions" section. After its existing "Idempotency model" subsection, add (or replace if already present):

```markdown
### Window + budget model (effective 2026-05-06)

The 24h-per-invoice lock was tightened to 6h with per-path attempt budgets:

| Path | Window | Max attempts per window | Idempotency key |
|---|---|---|---|
| Bulk past-due charger | 6h | 1 | Static `admin-charge-${invoiceId}` |
| Per-user admin retry | 6h | 1 | Static `admin-charge-${invoiceId}` |
| Admin Force Charge | 6h | 3 | Per-attempt `admin-charge-${invoiceId}-fc-admin-${N}` |
| User self-serve | 6h | 3 | Per-attempt `admin-charge-${invoiceId}-fc-user-${N}` |

Admin and user budgets are tracked **separately** via `result.forceCharge.triggeredBy` on the InvoiceChargeLog rows the orchestrator writes after pay.

**30-second debounce:** independent of budget. Any second attempt on the same invoice within 30s of the prior attempt is blocked with `skipReason: "too_soon"`. Applies uniformly across all paths to absorb spam-clicks.

**Per-attempt idempotency keys** mean Force Charge retries are real Stripe calls (not cached). Stripe still caches each unique key for 24h, so an exhausted budget doesn't accidentally re-charge from a prior window.

**Worst-case decline-fee bound per invoice per 6h:** 1 (bulk) + 3 (admin FC) + 3 (user) = 7 fresh attempts.

### `recent_charge_attempt` reason — expanded semantics

The reason name is unchanged but its meaning differs by caller:
- Bulk / regular admin retry: any prior attempt within 6h.
- Admin Force Charge: 3+ admin Force Charge attempts within 6h.
- User self-serve: 3+ user-triggered attempts within 6h.

The error message string distinguishes them.
```

- [ ] **Step 2: Update `docs/admin/api.md`**

Find both endpoint sections (admin Force Charge and user self-serve). For each `recent_charge_attempt` row in the error reasons table, expand the description to reflect the new semantics:

For `POST /api/admin/users/[id]/force-charge`:

| Find | Replace |
|---|---|
| `recent_charge_attempt` row, description "A successful charge for this subscription happened within the last 24h" | description "Either: (a) per-path Force Charge admin budget exhausted (3 per 6h), or (b) a successful charge for this subscription happened within the last 6h. Message text distinguishes." |

For `POST /api/stripe/force-charge-overdue`:

Same edit; HTTP status remains 429 for user self-serve.

Also update any mention of "24h" to "6h" in surrounding prose.

- [ ] **Step 3: Verify doc-sync hook**

```powershell
node .claude/hooks/doc-sync.mjs
```

If it reports `BLOCKED` for files we touched, ensure the manifest covers them (it should — they're in the admin domain).

- [ ] **Step 4: Commit (after user authorizes)**

```powershell
git add docs/admin/api.md docs/admin/backend.md
git commit -m "docs(admin): document 6h window + per-path budgets + 30s debounce"
```

---

### Task 7: Manual rollout (controller-level — not subagent)

This task is the controller's (= human or controlling Claude) job, not a subagent's.

- [ ] **Step 1: Run all tests**

```powershell
npm run test:charge-lock-rate-limit
npm run test:past-due-admin-charge
npm run test:force-charge-policy
npm run test:recover-stranded-past-due-policy
npm run test:stripe-collection-pause
npm run lint
npm run type-check
```

All must pass.

- [ ] **Step 2: Sandbox synthetic test**

In a Stripe sandbox account:
1. Create a test customer with a past-due subscription and a card that always declines (Stripe's `4000 0000 0000 0002`).
2. Run admin Force Charge live via `npm run test:force-charge:live -- --email=test+stuck@example.com --admin-email=admin@example.com`.
3. Immediately re-run within 30 seconds → should return `skipReason: "too_soon"`.
4. Wait 30s, run again → should attempt fresh charge (key has `-fc-admin-2`); declines.
5. Run a third time → attempt key `-fc-admin-3`; declines.
6. Run a fourth time → blocked with `reason: "recent_charge_attempt"` and message about budget exhausted.

Verify in `InvoiceChargeLog` that 3 rows were written tagged with `forceCharge.triggeredBy: admin` and the failed attempts each have unique idempotency keys captured in their `result`.

- [ ] **Step 3: Production: retry Tyler**

Tyler's prior 24h lock should have cleared by now. Run:

```powershell
npx tsx scripts/test-force-charge.ts --email=tyler.lkjohnson@gmail.com --live --admin-email=hello@toolsaustralia.com.au
```

If it succeeds: full webhook side-effects verification (status flip, endDate, Klaviyo, entries, pause cleared).
If it fails (`card_declined`): admin can retry within 6h up to 2 more times if there's reason (e.g. customer claims they updated the card). Otherwise send card-update flow.

- [ ] **Step 4: Wait 24h before processing more users**

Watch dashboards for any anomalies in webhook handling, accounting, or analytics.

- [ ] **Step 5: Process backlog gradually**

Use the diagnostic CSV from prior session, prioritize `chargeable_open` rows with low `attempt_count`. Process one-by-one through admin UI or test script.

---

## Self-review

**Spec coverage:**
- 6h window constant change → Task 2
- New constants `MAX_FORCE_CHARGE_ATTEMPTS_PER_WINDOW`, `MIN_SECONDS_BETWEEN_ATTEMPTS` → Task 2
- `cutoffForDebounce` helper → Task 2
- `buildForceChargeIdempotencyKey` helper → Task 2
- `countForceChargeAttempts`, `hasForceChargeBudgetExhausted`, `isDebouncedTooSoon` predicates → Task 2 (with tests in Task 1)
- Update existing tests for new window → Task 3
- `payOpenInvoiceAsPastDueAdmin` `idempotencyKey` + `attemptBudgetCheck` params → Task 4
- 30s debounce in primitive → Task 4
- Force Charge orchestrator per-path budget check → Task 5
- Force Charge orchestrator per-attempt key → Task 5
- TOCTOU recheck via `attemptBudgetCheck` callback → Task 5
- Documentation → Task 6
- Rollout → Task 7

**Placeholder scan:** None. All code shown verbatim. No "similar to Task N" or "TODO".

**Type consistency:**
- `attemptBudgetCheck` return shape `{ allowed: true } | { allowed: false; reason: string; message: string }` is consistent in Task 4 (signature) and Task 5 (callback implementation).
- `idempotencyKey?: string` parameter consistent.
- Helper signatures in Task 2 (impl) match calls in Task 5 (orchestrator).

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-05-06-charge-lock-rate-limit-tuning.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review per task.

**2. Inline Execution** — execute tasks in this session via `executing-plans`, batch checkpoints.

Which approach?
