# Stranded Past-Due Invoice Recovery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-user admin-triggered recovery for stranded past-due subscriptions whose original invoice has aged into `uncollectible` or `void` (the "This invoice can no longer be paid" error).

**Architecture:** Pure-helpers + impure-orchestrator + thin route handler + UI modal. Recovery sequence is `void → find/create draft → finalize → pay`, where the pay step delegates to the existing `payOpenInvoiceAsPastDueAdmin` primitive so we inherit its `InvoiceChargeLog`, idempotency, and `resumeAfterSuccessfulRenewalPayment` wiring. Pure helpers live in their own file so they can be tested without Stripe SDK in the env.

**Tech Stack:** Next.js 15 App Router, Mongoose, Stripe Node SDK, NextAuth, React 19 + Tailwind, `tsx` test scripts with `node:assert/strict`.

**Spec:** [docs/superpowers/specs/2026-05-05-stranded-past-due-invoice-recovery-design.md](../specs/2026-05-05-stranded-past-due-invoice-recovery-design.md)

**Out of scope:** Any error other than "This invoice can no longer be paid" (e.g. `incorrect_number`, `card_declined`, `expired_card`). Bulk recovery. Phase B (switch to Stripe-native "Mark as unpaid" dashboard setting).

---

## File Structure

| Path | Type | Responsibility |
|---|---|---|
| `src/server/admin/recoverStrandedPastDuePolicy.ts` | Create | Pure helpers: idempotency keys, eligibility predicate, draft matcher, 24h lock check |
| `src/server/admin/__tests__/recoverStrandedPastDuePolicy.test.ts` | Create | Unit tests for the pure helpers |
| `src/server/admin/recoverStrandedPastDue.ts` | Create | Impure orchestrator: void → find/create draft → finalize → delegate to `payOpenInvoiceAsPastDueAdmin` |
| `src/app/api/admin/users/[id]/charge-past-due/route.ts` | Modify | Pre-filter to the invoice attached to `user.stripeSubscriptionId`, skip duplicates |
| `src/app/api/admin/invoices/charge-past-due/route.ts` | Modify | Same per-user single-invoice filter applied inside the bulk loop |
| `src/app/api/admin/users/[userId]/recover-past-due-invoice/route.ts` | Create | Thin handler: auth, validate body, delegate, return JSON |
| `src/components/admin/RecoverInvoiceModal.tsx` | Create | Modal with type-`RECOVER` confirmation, calls endpoint, shows result |
| `src/app/admin/component/PastDueChargeHistory.tsx` | Modify | Add "Recover" button on Manual Retries rows whose error matches `/no longer be paid/i` |
| `src/components/admin/ChargePastDueUserModal.tsx` | Modify | Auto-fallback: when response error is "no longer be paid", swap CTA to "Recover" |
| `package.json` | Modify | Add `test:recover-stranded-past-due-policy` npm script |
| `docs/admin/api.md` | Modify | Document new endpoint |
| `docs/admin/backend.md` | Modify | Document recovery flow + idempotency model |
| `docs/admin/frontend.md` | Modify | Document modal + triggers |

No Domain Manifest changes — all paths covered by existing `admin` domain entries.

---

### Task 1: Pure helpers — write tests

**Files:**
- Create: `src/server/admin/__tests__/recoverStrandedPastDuePolicy.test.ts`

The tests describe the four pure helpers we'll implement next. We're following the existing test pattern from [chargePastDueShared.test.ts](../../../src/server/admin/__tests__/chargePastDueShared.test.ts) — `tsx` script, `node:assert/strict`, no mocking framework.

- [ ] **Step 1: Write the failing test file**

```typescript
// src/server/admin/__tests__/recoverStrandedPastDuePolicy.test.ts
import assert from "node:assert/strict";
import type Stripe from "stripe";
import {
  buildRecoveryVoidIdempotencyKey,
  buildRecoveryCreateIdempotencyKey,
  buildRecoveryFinalizeIdempotencyKey,
  isOriginalInvoiceEligibleForRecovery,
  pickHeldDraftForRecovery,
  hasRecentRecoveryAttempt,
} from "../recoverStrandedPastDuePolicy";

function testIdempotencyKeysAreStableAndDistinct() {
  assert.equal(buildRecoveryVoidIdempotencyKey("in_x"), "recover-void-in_x");
  assert.equal(buildRecoveryCreateIdempotencyKey("in_x"), "recover-create-in_x");
  assert.equal(buildRecoveryFinalizeIdempotencyKey("in_y"), "recover-finalize-in_y");
  assert.notEqual(
    buildRecoveryVoidIdempotencyKey("in_a"),
    buildRecoveryVoidIdempotencyKey("in_b")
  );
}

function testEligibleWhenUncollectible() {
  const inv = { status: "uncollectible", amount_remaining: 4000 } as Stripe.Invoice;
  assert.equal(isOriginalInvoiceEligibleForRecovery(inv).eligible, true);
}

function testEligibleWhenAlreadyVoid() {
  const inv = { status: "void", amount_remaining: 4000 } as Stripe.Invoice;
  assert.equal(isOriginalInvoiceEligibleForRecovery(inv).eligible, true);
}

function testNotEligibleWhenStillOpen() {
  const inv = { status: "open", amount_remaining: 4000 } as Stripe.Invoice;
  const result = isOriginalInvoiceEligibleForRecovery(inv);
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "still_chargeable");
}

function testNotEligibleWhenAlreadyPaid() {
  const inv = { status: "paid", amount_remaining: 0 } as Stripe.Invoice;
  const result = isOriginalInvoiceEligibleForRecovery(inv);
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "already_paid");
}

function testNotEligibleWhenDraft() {
  const inv = { status: "draft", amount_remaining: 4000 } as Stripe.Invoice;
  const result = isOriginalInvoiceEligibleForRecovery(inv);
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "still_chargeable");
}

function testPickHeldDraftMatchesAmount() {
  const drafts = [
    { id: "in_d1", status: "draft", amount_due: 2000, created: 100 } as Stripe.Invoice,
    { id: "in_d2", status: "draft", amount_due: 4000, created: 200 } as Stripe.Invoice,
    { id: "in_d3", status: "draft", amount_due: 4000, created: 300 } as Stripe.Invoice,
  ];
  const picked = pickHeldDraftForRecovery(drafts, 4000);
  assert.equal(picked?.id, "in_d3"); // newest matching
}

function testPickHeldDraftReturnsNullWhenNoMatch() {
  const drafts = [
    { id: "in_d1", status: "draft", amount_due: 2000, created: 100 } as Stripe.Invoice,
  ];
  assert.equal(pickHeldDraftForRecovery(drafts, 4000), null);
}

function testPickHeldDraftReturnsNullOnEmptyList() {
  assert.equal(pickHeldDraftForRecovery([], 4000), null);
}

function testRecentLockBlocksWithinWindow() {
  const now = new Date("2026-05-05T12:00:00.000Z");
  const rows = [
    {
      attemptedAt: new Date("2026-05-05T05:00:00.000Z"), // 7h ago
      result: { recovery: { originalInvoiceId: "in_orig" } },
    },
  ];
  assert.equal(hasRecentRecoveryAttempt(rows, "in_orig", now), true);
}

function testRecentLockAllowsAfterWindow() {
  const now = new Date("2026-05-05T12:00:00.000Z");
  const rows = [
    {
      attemptedAt: new Date("2026-05-04T11:59:59.000Z"), // 24h+ ago
      result: { recovery: { originalInvoiceId: "in_orig" } },
    },
  ];
  assert.equal(hasRecentRecoveryAttempt(rows, "in_orig", now), false);
}

function testRecentLockIgnoresDifferentInvoice() {
  const now = new Date("2026-05-05T12:00:00.000Z");
  const rows = [
    {
      attemptedAt: new Date("2026-05-05T05:00:00.000Z"),
      result: { recovery: { originalInvoiceId: "in_other" } },
    },
  ];
  assert.equal(hasRecentRecoveryAttempt(rows, "in_orig", now), false);
}

function testRecentLockIgnoresRowsWithoutRecoveryTag() {
  const now = new Date("2026-05-05T12:00:00.000Z");
  const rows = [
    { attemptedAt: new Date("2026-05-05T05:00:00.000Z"), result: {} },
    { attemptedAt: new Date("2026-05-05T05:00:00.000Z") },
  ];
  assert.equal(hasRecentRecoveryAttempt(rows, "in_orig", now), false);
}

function run() {
  testIdempotencyKeysAreStableAndDistinct();
  testEligibleWhenUncollectible();
  testEligibleWhenAlreadyVoid();
  testNotEligibleWhenStillOpen();
  testNotEligibleWhenAlreadyPaid();
  testNotEligibleWhenDraft();
  testPickHeldDraftMatchesAmount();
  testPickHeldDraftReturnsNullWhenNoMatch();
  testPickHeldDraftReturnsNullOnEmptyList();
  testRecentLockBlocksWithinWindow();
  testRecentLockAllowsAfterWindow();
  testRecentLockIgnoresDifferentInvoice();
  testRecentLockIgnoresRowsWithoutRecoveryTag();
  console.log("recoverStrandedPastDuePolicy tests passed");
}

run();
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
npx tsx src/server/admin/__tests__/recoverStrandedPastDuePolicy.test.ts
```
Expected: FAIL with "Cannot find module '../recoverStrandedPastDuePolicy'".

---

### Task 2: Pure helpers — implement

**Files:**
- Create: `src/server/admin/recoverStrandedPastDuePolicy.ts`

- [ ] **Step 1: Write the implementation**

```typescript
// src/server/admin/recoverStrandedPastDuePolicy.ts
/**
 * Pure helpers governing the per-user "recover stranded past-due" flow.
 *
 * Kept in their own module (no Stripe SDK / Mongo imports) so they can be unit-tested
 * without `STRIPE_SECRET_KEY` or a DB connection in the environment.
 *
 * Stripe idempotency keys live here because each step in the recovery sequence
 * needs its own stable key — using a single key for all four calls would cause
 * Stripe to return cached responses across step boundaries.
 */

import type Stripe from "stripe";
import { RECENT_ATTEMPT_WINDOW_HOURS, cutoffForRecentAttempt } from "./past-due-charge-idempotency";

export { RECENT_ATTEMPT_WINDOW_HOURS } from "./past-due-charge-idempotency";

/** Stable idempotency key for the void step. */
export function buildRecoveryVoidIdempotencyKey(originalInvoiceId: string): string {
  return `recover-void-${originalInvoiceId}`;
}

/** Stable idempotency key for the one-off invoice create step (keyed by ORIGINAL id). */
export function buildRecoveryCreateIdempotencyKey(originalInvoiceId: string): string {
  return `recover-create-${originalInvoiceId}`;
}

/** Stable idempotency key for the finalize step (keyed by NEW invoice id). */
export function buildRecoveryFinalizeIdempotencyKey(newInvoiceId: string): string {
  return `recover-finalize-${newInvoiceId}`;
}

export type EligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: "still_chargeable" | "already_paid" | "unknown_status" };

/**
 * Recovery is only valid when the original invoice has aged out of payable state.
 * - `uncollectible` / `void` → eligible (the "stranded" case)
 * - `open` / `draft` → still chargeable; admin should use the existing flow
 * - `paid` → already paid; nothing to recover
 */
export function isOriginalInvoiceEligibleForRecovery(invoice: Stripe.Invoice): EligibilityResult {
  switch (invoice.status) {
    case "uncollectible":
    case "void":
      return { eligible: true };
    case "open":
    case "draft":
      return { eligible: false, reason: "still_chargeable" };
    case "paid":
      return { eligible: false, reason: "already_paid" };
    default:
      return { eligible: false, reason: "unknown_status" };
  }
}

/**
 * Find a held draft on the subscription whose amount matches the expected cycle.
 * Picks the newest matching draft (Stripe creates one per missed cycle while paused;
 * we want the most recent so subsequent cycles' drafts can age out naturally).
 */
export function pickHeldDraftForRecovery(
  drafts: Stripe.Invoice[],
  expectedAmountCents: number
): Stripe.Invoice | null {
  const matches = drafts.filter(
    (d) => d.status === "draft" && d.amount_due === expectedAmountCents
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.created - a.created);
  return matches[0] ?? null;
}

type RecoveryLogRow = {
  attemptedAt: Date;
  result?: unknown;
};

/**
 * 24h lock predicate. Returns true if any prior recovery attempt on the same
 * original invoice happened within the window. Reuses `RECENT_ATTEMPT_WINDOW_HOURS`
 * from the existing past-due idempotency module.
 */
export function hasRecentRecoveryAttempt(
  rows: RecoveryLogRow[],
  originalInvoiceId: string,
  now: Date = new Date()
): boolean {
  const cutoff = cutoffForRecentAttempt(now);
  for (const row of rows) {
    if (row.attemptedAt < cutoff) continue;
    const recovery = extractRecoveryTag(row.result);
    if (recovery?.originalInvoiceId === originalInvoiceId) return true;
  }
  return false;
}

function extractRecoveryTag(
  result: unknown
): { originalInvoiceId?: string } | null {
  if (!result || typeof result !== "object") return null;
  const record = result as Record<string, unknown>;
  const recovery = record.recovery;
  if (!recovery || typeof recovery !== "object") return null;
  return recovery as { originalInvoiceId?: string };
}
```

- [ ] **Step 2: Run test to verify it passes**

```powershell
npx tsx src/server/admin/__tests__/recoverStrandedPastDuePolicy.test.ts
```
Expected: `recoverStrandedPastDuePolicy tests passed`.

- [ ] **Step 3: Wire the test into package.json**

Open `package.json`, find the `scripts` section. After line 62 (`"test:past-due-admin-charge"`), add:

```json
"test:recover-stranded-past-due-policy": "tsx src/server/admin/__tests__/recoverStrandedPastDuePolicy.test.ts",
```

- [ ] **Step 4: Verify the npm script works**

```powershell
npm run test:recover-stranded-past-due-policy
```
Expected: `recoverStrandedPastDuePolicy tests passed`.

- [ ] **Step 5: Commit (after user authorizes — see CLAUDE.md hard rule #1)**

When user authorizes:
```powershell
git add src/server/admin/recoverStrandedPastDuePolicy.ts src/server/admin/__tests__/recoverStrandedPastDuePolicy.test.ts package.json
git commit -m "feat(admin): add pure helpers for stranded past-due invoice recovery"
```

---

### Task 3: Orchestrator — write helper signature and TODOs

**Files:**
- Create: `src/server/admin/recoverStrandedPastDue.ts`

This task only writes the function shell + types. The actual Stripe orchestration is added in Task 4 to keep diffs small.

- [ ] **Step 1: Write the orchestrator skeleton**

```typescript
// src/server/admin/recoverStrandedPastDue.ts
import mongoose from "mongoose";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import InvoiceChargeLog from "@/models/InvoiceChargeLog";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import {
  buildRecoveryVoidIdempotencyKey,
  buildRecoveryCreateIdempotencyKey,
  buildRecoveryFinalizeIdempotencyKey,
  hasRecentRecoveryAttempt,
  isOriginalInvoiceEligibleForRecovery,
  pickHeldDraftForRecovery,
  RECENT_ATTEMPT_WINDOW_HOURS,
} from "./recoverStrandedPastDuePolicy";
import {
  payOpenInvoiceAsPastDueAdmin,
  type PastDueChargeResultRow,
} from "./chargePastDueShared";
import { cutoffForRecentAttempt } from "./past-due-charge-idempotency";

export type RecoverStrandedResult =
  | { ok: true; row: PastDueChargeResultRow; newInvoiceId: string }
  | {
      ok: false;
      reason:
        | "user_not_found"
        | "subscription_inactive"
        | "not_past_due"
        | "package_not_found"
        | "invoice_not_found"
        | "invoice_owner_mismatch"
        | "invoice_still_chargeable"
        | "invoice_already_paid"
        | "invoice_unknown_status"
        | "recent_recovery_attempt"
        | "void_failed"
        | "draft_create_failed"
        | "finalize_failed";
      message: string;
    };

export async function recoverStrandedPastDueInvoice(params: {
  userId: string;
  originalInvoiceId: string;
  adminId: string;
}): Promise<RecoverStrandedResult> {
  // Filled in by Task 4
  void params;
  throw new Error("not implemented");
}
```

- [ ] **Step 2: Verify it compiles**

```powershell
npm run type-check
```
Expected: PASS.

---

### Task 4: Orchestrator — implement the recovery sequence

**Files:**
- Modify: `src/server/admin/recoverStrandedPastDue.ts`

- [ ] **Step 1: Replace the stub with the full orchestration**

Replace the entire body of `recoverStrandedPastDueInvoice` with:

```typescript
export async function recoverStrandedPastDueInvoice(params: {
  userId: string;
  originalInvoiceId: string;
  adminId: string;
}): Promise<RecoverStrandedResult> {
  const { userId, originalInvoiceId, adminId } = params;

  // ─── 1. Load user + verify state ───
  const user = await User.findById(userId)
    .select("_id email stripeCustomerId stripeSubscriptionId subscription")
    .lean();
  if (!user) return { ok: false, reason: "user_not_found", message: "User not found" };

  const subStatus = (user.subscription as { status?: string } | undefined)?.status;
  if (subStatus !== "past_due") {
    return {
      ok: false,
      reason: "not_past_due",
      message: `Subscription status is "${subStatus ?? "(missing)"}", not past_due`,
    };
  }
  if (!user.stripeCustomerId || !user.stripeSubscriptionId) {
    return {
      ok: false,
      reason: "subscription_inactive",
      message: "User has no active Stripe subscription/customer",
    };
  }

  const packageId = (user.subscription as { packageId?: string } | undefined)?.packageId;
  const pkg = packageId ? getPackageById(packageId) : undefined;
  if (!pkg || !pkg.isActive || typeof pkg.price !== "number") {
    return {
      ok: false,
      reason: "package_not_found",
      message: `MembershipPackage "${packageId ?? ""}" not found or inactive`,
    };
  }
  const expectedAmountCents = Math.round(pkg.price * 100);

  // ─── 2. Fetch original invoice and verify eligibility ───
  let originalInvoice: Stripe.Invoice;
  try {
    originalInvoice = await stripe.invoices.retrieve(originalInvoiceId);
  } catch (err) {
    return {
      ok: false,
      reason: "invoice_not_found",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const invoiceCustomerId =
    typeof originalInvoice.customer === "string"
      ? originalInvoice.customer
      : originalInvoice.customer?.id;
  if (invoiceCustomerId !== user.stripeCustomerId) {
    return {
      ok: false,
      reason: "invoice_owner_mismatch",
      message: "Original invoice customer does not match user's stripeCustomerId",
    };
  }

  // Tighter check: the invoice must belong to the user's current subscription,
  // not an old (canceled-and-resubscribed) one. Prevents accidental recovery
  // of legacy invoices that the admin shouldn't be touching.
  const invoiceSubscriptionId =
    typeof originalInvoice.subscription === "string"
      ? originalInvoice.subscription
      : (originalInvoice.subscription as Stripe.Subscription | null | undefined)?.id;
  if (invoiceSubscriptionId !== user.stripeSubscriptionId) {
    return {
      ok: false,
      reason: "invoice_owner_mismatch",
      message: "Original invoice does not belong to user's current subscription",
    };
  }

  const eligibility = isOriginalInvoiceEligibleForRecovery(originalInvoice);
  if (!eligibility.eligible) {
    return {
      ok: false,
      reason:
        eligibility.reason === "still_chargeable"
          ? "invoice_still_chargeable"
          : eligibility.reason === "already_paid"
            ? "invoice_already_paid"
            : "invoice_unknown_status",
      message: `Original invoice status is "${originalInvoice.status}"; not stranded`,
    };
  }

  // ─── 3. 24h lock check ───
  const recentRows = await InvoiceChargeLog.find({
    userId: new mongoose.Types.ObjectId(userId),
    attemptedAt: { $gte: cutoffForRecentAttempt() },
  })
    .select({ attemptedAt: 1, result: 1 })
    .lean();

  if (hasRecentRecoveryAttempt(recentRows, originalInvoiceId)) {
    return {
      ok: false,
      reason: "recent_recovery_attempt",
      message: `A recovery attempt for this invoice happened within the last ${RECENT_ATTEMPT_WINDOW_HOURS}h`,
    };
  }

  const baseLogFields = {
    customerId: user.stripeCustomerId,
    userId: new mongoose.Types.ObjectId(userId),
    adminId: new mongoose.Types.ObjectId(adminId),
    amount: expectedAmountCents,
  };

  // ─── 4. Void original (idempotent) ───
  if (originalInvoice.status === "uncollectible") {
    try {
      await stripe.invoices.voidInvoice(originalInvoiceId, undefined, {
        idempotencyKey: buildRecoveryVoidIdempotencyKey(originalInvoiceId),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await InvoiceChargeLog.create({
        ...baseLogFields,
        invoiceId: originalInvoiceId,
        status: "failed",
        attemptedAt: new Date(),
        errorMessage: `void failed: ${message}`,
        result: { recovery: { step: "void", originalInvoiceId } },
      });
      return { ok: false, reason: "void_failed", message };
    }
  }
  await InvoiceChargeLog.create({
    ...baseLogFields,
    invoiceId: originalInvoiceId,
    status: "skipped",
    attemptedAt: new Date(),
    errorMessage:
      originalInvoice.status === "void"
        ? "Original already void; skipped void step"
        : "Voided original invoice",
    result: { recovery: { step: "void", originalInvoiceId } },
  });

  // ─── 5. Find or create a draft for the missed cycle ───
  let draftInvoice: Stripe.Invoice | null = null;
  try {
    const drafts = await stripe.invoices.list({
      subscription: user.stripeSubscriptionId,
      status: "draft",
      limit: 10,
    });
    draftInvoice = pickHeldDraftForRecovery(drafts.data, expectedAmountCents);
  } catch (err) {
    // Listing failed; fall through to create
    console.warn("[recoverStrandedPastDue] listing drafts failed:", err);
  }

  if (!draftInvoice) {
    try {
      draftInvoice = await stripe.invoices.create(
        {
          customer: user.stripeCustomerId,
          subscription: user.stripeSubscriptionId,
          collection_method: "charge_automatically",
          auto_advance: false,
          pending_invoice_items_behavior: "exclude",
        },
        { idempotencyKey: buildRecoveryCreateIdempotencyKey(originalInvoiceId) }
      );

      // Add the cycle line item
      await stripe.invoiceItems.create({
        customer: user.stripeCustomerId,
        invoice: draftInvoice.id,
        amount: expectedAmountCents,
        currency: "aud",
        description: `Recovery for ${pkg.name} (replaces ${originalInvoiceId})`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await InvoiceChargeLog.create({
        ...baseLogFields,
        invoiceId: originalInvoiceId,
        status: "failed",
        attemptedAt: new Date(),
        errorMessage: `create failed: ${message}`,
        result: { recovery: { step: "create", originalInvoiceId } },
      });
      return { ok: false, reason: "draft_create_failed", message };
    }
  }

  const newInvoiceId = draftInvoice.id;
  if (!newInvoiceId) {
    return {
      ok: false,
      reason: "draft_create_failed",
      message: "Stripe returned a draft without an id",
    };
  }
  await InvoiceChargeLog.create({
    ...baseLogFields,
    invoiceId: newInvoiceId,
    status: "skipped",
    attemptedAt: new Date(),
    errorMessage: draftInvoice.status === "draft" && draftInvoice.amount_due === expectedAmountCents
      ? `Used existing held draft ${newInvoiceId}`
      : `Created fresh draft ${newInvoiceId}`,
    result: { recovery: { step: "create", originalInvoiceId, newInvoiceId } },
  });

  // ─── 6. Finalize the draft ───
  let finalizedInvoice: Stripe.Invoice;
  try {
    finalizedInvoice = await stripe.invoices.finalizeInvoice(
      newInvoiceId,
      { expand: ["payment_intent"] },
      { idempotencyKey: buildRecoveryFinalizeIdempotencyKey(newInvoiceId) }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await InvoiceChargeLog.create({
      ...baseLogFields,
      invoiceId: newInvoiceId,
      status: "failed",
      attemptedAt: new Date(),
      errorMessage: `finalize failed: ${message}`,
      result: { recovery: { step: "finalize", originalInvoiceId, newInvoiceId } },
    });
    return { ok: false, reason: "finalize_failed", message };
  }
  await InvoiceChargeLog.create({
    ...baseLogFields,
    invoiceId: newInvoiceId,
    status: "skipped",
    attemptedAt: new Date(),
    errorMessage: `Finalized; status=${finalizedInvoice.status}`,
    result: { recovery: { step: "finalize", originalInvoiceId, newInvoiceId } },
  });

  // ─── 7. Pay via the existing primitive (writes its own log row + resumes pause) ───
  const paymentMethodId =
    typeof finalizedInvoice.default_payment_method === "string"
      ? finalizedInvoice.default_payment_method
      : finalizedInvoice.default_payment_method?.id;

  if (!paymentMethodId) {
    // Fall back to customer default
    const customer = await stripe.customers.retrieve(user.stripeCustomerId);
    if (!customer.deleted) {
      const customerWithSettings = customer as Stripe.Customer & {
        invoice_settings?: { default_payment_method?: string | Stripe.PaymentMethod };
      };
      const dpm = customerWithSettings.invoice_settings?.default_payment_method;
      const fallbackId = typeof dpm === "string" ? dpm : dpm?.id;
      if (fallbackId) {
        const row = await payOpenInvoiceAsPastDueAdmin({
          invoice: finalizedInvoice,
          paymentMethodId: fallbackId,
          customerId: user.stripeCustomerId,
          user: { _id: user._id, email: user.email },
          adminId,
        });
        return { ok: true, row, newInvoiceId };
      }
    }
    return {
      ok: false,
      reason: "draft_create_failed",
      message: "Finalized invoice has no payment method",
    };
  }

  const row = await payOpenInvoiceAsPastDueAdmin({
    invoice: finalizedInvoice,
    paymentMethodId,
    customerId: user.stripeCustomerId,
    user: { _id: user._id, email: user.email },
    adminId,
  });

  return { ok: true, row, newInvoiceId };
}
```

- [ ] **Step 2: Verify it compiles**

```powershell
npm run type-check
```
Expected: PASS.

- [ ] **Step 3: Commit (after user authorizes)**

```powershell
git add src/server/admin/recoverStrandedPastDue.ts
git commit -m "feat(admin): orchestrate stranded past-due invoice recovery"
```

---

### Task 5a: Single-invoice filter in existing chargers (NEW — inserted)

**Files:**
- Modify: `src/app/api/admin/users/[id]/charge-past-due/route.ts`
- Modify: `src/app/api/admin/invoices/charge-past-due/route.ts`

**Why:** Both chargers currently iterate every open invoice on a customer. Customers whose `pause_collection` didn't fire in time end up with multiple open cycle invoices, and we attempt to pay each one — which produces "no longer be paid" errors on the older ones whose PaymentIntents Stripe has already canceled. Constraint from the user: **charge only the invoice attached to `user.stripeSubscriptionId`**.

This task uses the existing [`pickOpenInvoiceForFailedRenewal`](../../src/utils/payment/failed-invoice-selection.ts) helper, which the customer-facing flow already uses for exactly this purpose.

- [ ] **Step 1: Add a shared filter helper**

In `src/server/admin/chargePastDueShared.ts`, add this exported function near `resolveInvoicePaymentMethodId`:

```typescript
import { pickOpenInvoiceForFailedRenewal } from "@/utils/payment/failed-invoice-selection";

/**
 * Reduce a customer's open invoices to the single invoice we should charge —
 * the one attached to the user's current subscription. Older or duplicate
 * cycle invoices (created when pause_collection didn't fire in time) are
 * returned separately so the caller can log them as skipped.
 *
 * Returns `target: null` when no invoice on the current subscription is chargeable.
 */
export function selectCurrentSubscriptionChargeable(
  invoices: Stripe.Invoice[],
  userStripeSubscriptionId: string | null | undefined
): { target: Stripe.Invoice | null; skipped: Stripe.Invoice[] } {
  if (!userStripeSubscriptionId) {
    return { target: null, skipped: invoices };
  }
  const onCurrentSub = invoices.filter((inv) => {
    const invSubId =
      typeof inv.subscription === "string"
        ? inv.subscription
        : (inv.subscription as Stripe.Subscription | null | undefined)?.id;
    return invSubId === userStripeSubscriptionId;
  });
  const target = pickOpenInvoiceForFailedRenewal(onCurrentSub);
  const skipped = invoices.filter((inv) => inv.id !== target?.id);
  return { target, skipped };
}
```

Add `Stripe` to the existing imports if not already present.

- [ ] **Step 2: Apply in the per-user charger**

In `src/app/api/admin/users/[id]/charge-past-due/route.ts`, after the existing `eligibleInvoices` filter (line 253-267) and BEFORE the `for (const invoice of eligibleInvoices)` loop (line 275), insert:

```typescript
// Scope to current subscription only — prevents charging duplicate cycle invoices
// that accumulate when pause_collection didn't fire in time.
const { target, skipped: nonCurrentInvoices } = selectCurrentSubscriptionChargeable(
  eligibleInvoices,
  user.stripeSubscriptionId
);
const invoicesToCharge = target ? [target] : [];

// Log skipped duplicates so audit stays honest about what we saw vs charged
for (const dup of nonCurrentInvoices) {
  if (!dup.id) continue;
  skipped++;
  results.push({
    invoiceId: dup.id,
    customerId,
    userId: String(user._id),
    userEmail: user.email || "N/A",
    status: "skipped",
    skipReason: "duplicate_or_stale_cycle_invoice",
    amount: dup.amount_remaining || 0,
  });
}
```

Then change the loop on line 275 from `for (const invoice of eligibleInvoices)` to `for (const invoice of invoicesToCharge)`.

Also: `user.stripeSubscriptionId` isn't in the existing `loadPastDueUserForCharge` SELECT list (line 35). Update that line to include it:

```typescript
.select("_id email firstName lastName stripeCustomerId stripeSubscriptionId subscription.status")
```

And update `LeanChargeUser` type (line 17-24) to include `stripeSubscriptionId?: string | null;`.

Add `selectCurrentSubscriptionChargeable` to the existing `chargePastDueShared` import at line 9-13.

- [ ] **Step 3: Apply in the bulk charger**

In `src/app/api/admin/invoices/charge-past-due/route.ts`, the bulk filter at line 347-375 builds `eligibleInvoices` from ALL customers' invoices in one flat list. We need to scope per-user.

After the existing `eligibleInvoices` filter (line 375), and before the run record creation (line 379), insert:

```typescript
// Scope each customer to their current-subscription invoice only.
const eligibleByUserSub: Stripe.Invoice[] = [];
const skippedDuplicates: Array<{ invoice: Stripe.Invoice; user: typeof users[number] }> = [];

const invoicesByCustomer = new Map<string, Stripe.Invoice[]>();
for (const inv of eligibleInvoices) {
  const cid = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
  if (!cid) continue;
  if (!invoicesByCustomer.has(cid)) invoicesByCustomer.set(cid, []);
  invoicesByCustomer.get(cid)!.push(inv);
}

for (const [cid, custInvoices] of invoicesByCustomer) {
  const u = userMap.get(cid);
  if (!u) continue;
  const { target, skipped: dups } = selectCurrentSubscriptionChargeable(
    custInvoices,
    (u as typeof users[number] & { stripeSubscriptionId?: string }).stripeSubscriptionId
  );
  if (target) eligibleByUserSub.push(target);
  for (const d of dups) skippedDuplicates.push({ invoice: d, user: u });
}
```

Replace the loop variable `eligibleInvoices` in lines 408-475 with `eligibleByUserSub`. Keep the same processing pipeline.

After the loop completes, log the skipped duplicates (before `aggregateRunTotals`):

```typescript
for (const { invoice, user: u } of skippedDuplicates) {
  if (!invoice.id) continue;
  skipped++;
  results.push({
    invoiceId: invoice.id,
    customerId: typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id || "",
    userId: String(u._id),
    userEmail: u.email || "N/A",
    status: "skipped",
    skipReason: "duplicate_or_stale_cycle_invoice",
    amount: invoice.amount_remaining || 0,
  });
}
```

Update the user query at line 332-337 to include `stripeSubscriptionId`:

```typescript
const users = await User.find({
  stripeCustomerId: { $in: customerIds },
  "subscription.status": "past_due",
})
  .select("_id email firstName lastName stripeCustomerId stripeSubscriptionId subscription.status")
  .lean();
```

Update the `selectCurrentSubscriptionChargeable` import in the existing `from "@/server/admin/chargePastDueShared"` group (line 11-14).

- [ ] **Step 4: Apply same filter to GET preview endpoints**

Both routes have GET handlers that show what would be charged. Apply the same filter so the preview matches the actual POST behavior:

In `src/app/api/admin/users/[id]/charge-past-due/route.ts` GET handler around line 134-176, replace the `for (const invoice of allInvoices)` body to use `selectCurrentSubscriptionChargeable` similarly. Show only the target invoice in the preview's `users` array. Show the duplicate count in `filterStats` under a new key (e.g. `duplicateOrStaleCycle`).

In `src/app/api/admin/invoices/charge-past-due/route.ts` GET handler (around line 26-201), apply the same per-customer scoping.

- [ ] **Step 5: Verify type-check and lint**

```powershell
npm run type-check
npm run lint
```
Expected: PASS for both. No new errors introduced by these changes.

- [ ] **Step 6: Smoke test in dev**

```powershell
npm run dev
```
- Open the per-user charge modal for a stacked customer (e.g. Heath in your screenshots)
- Confirm preview now shows **1 invoice** instead of 3
- Confirm `filterStats.duplicateOrStaleCycle` (or equivalent) shows the skipped count
- Don't confirm-charge a real customer; this is preview verification only

- [ ] **Step 7: Commit (after user authorizes)**

```powershell
git add src/server/admin/chargePastDueShared.ts src/app/api/admin/users/[id]/charge-past-due/route.ts src/app/api/admin/invoices/charge-past-due/route.ts
git commit -m "fix(admin): scope past-due chargers to current-subscription invoice only"
```

---

### Task 5: API endpoint

**Files:**
- Create: `src/app/api/admin/users/[userId]/recover-past-due-invoice/route.ts`

- [ ] **Step 1: Write the route handler**

```typescript
// src/app/api/admin/users/[userId]/recover-past-due-invoice/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { z } from "zod";
import { recoverStrandedPastDueInvoice } from "@/server/admin/recoverStrandedPastDue";

const bodySchema = z.object({
  confirmation: z.literal("RECOVER"),
  originalInvoiceId: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId } = await params;

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          message:
            'Body must be { confirmation: "RECOVER", originalInvoiceId: "in_..." }',
        },
        { status: 400 }
      );
    }

    const result = await recoverStrandedPastDueInvoice({
      userId,
      originalInvoiceId: parsed.data.originalInvoiceId,
      adminId: session.user.id,
    });

    if (!result.ok) {
      const statusByReason: Record<typeof result.reason, number> = {
        user_not_found: 404,
        subscription_inactive: 409,
        not_past_due: 409,
        package_not_found: 409,
        invoice_not_found: 404,
        invoice_owner_mismatch: 403,
        invoice_subscription_mismatch: 403,
        invoice_still_chargeable: 409,
        invoice_already_paid: 409,
        invoice_unknown_status: 409,
        no_payment_method: 409,
        recent_recovery_attempt: 409,
        void_failed: 502,
        draft_create_failed: 502,
        finalize_failed: 502,
      };
      return NextResponse.json(
        { success: false, reason: result.reason, message: result.message },
        { status: statusByReason[result.reason] }
      );
    }

    return NextResponse.json({
      success: true,
      newInvoiceId: result.newInvoiceId,
      row: result.row,
    });
  } catch (error) {
    console.error("recover-past-due-invoice route error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify it compiles**

```powershell
npm run type-check
```
Expected: PASS.

- [ ] **Step 3: Lint check**

```powershell
npm run lint
```
Expected: no new errors in the new file.

- [ ] **Step 4: Commit (after user authorizes)**

```powershell
git add src/app/api/admin/users/[userId]/recover-past-due-invoice/route.ts
git commit -m "feat(admin): add recover-past-due-invoice endpoint"
```

---

### Task 6: RecoverInvoiceModal component

**Files:**
- Create: `src/components/admin/RecoverInvoiceModal.tsx`

This is a focused single-action modal — no preview step like `ChargePastDueUserModal`, since by the time the admin opens it they already saw the failed row.

- [ ] **Step 1: Write the modal**

```typescript
// src/components/admin/RecoverInvoiceModal.tsx
"use client";

import React, { useState, useEffect } from "react";
import { AlertTriangle, X, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Z_INDEX } from "@/constants/z-index";
import { Button } from "../modals/ui";

export interface RecoverInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userEmail: string;
  originalInvoiceId: string;
  /** Cents — display only; server re-derives from package */
  expectedAmountCents?: number;
  onRecovered?: () => void;
}

type State = "idle" | "processing" | "success" | "error";

interface RecoverResponse {
  success: boolean;
  newInvoiceId?: string;
  row?: {
    invoiceId: string;
    status: "success" | "failed" | "skipped";
    error?: string;
    amount?: number;
    skipReason?: string;
    resumeCollectionError?: string;
  };
  reason?: string;
  message?: string;
  error?: string;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(cents / 100);
}

const RecoverInvoiceModal: React.FC<RecoverInvoiceModalProps> = ({
  isOpen,
  onClose,
  userId,
  userEmail,
  originalInvoiceId,
  expectedAmountCents,
  onRecovered,
}) => {
  const [confirmation, setConfirmation] = useState("");
  const [state, setState] = useState<State>("idle");
  const [response, setResponse] = useState<RecoverResponse | null>(null);

  useEffect(() => {
    if (isOpen) {
      setConfirmation("");
      setState("idle");
      setResponse(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (confirmation !== "RECOVER") return;
    setState("processing");
    try {
      const res = await fetch(`/api/admin/users/${userId}/recover-past-due-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "RECOVER", originalInvoiceId }),
      });
      const data: RecoverResponse = await res.json();
      setResponse(data);
      setState(data.success ? "success" : "error");
      if (data.success && onRecovered) onRecovered();
    } catch (err) {
      setResponse({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
      setState("error");
    }
  };

  const handleClose = () => {
    if (state === "processing") return;
    onClose();
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-2 sm:p-4"
      style={{ zIndex: Z_INDEX.MODAL_NESTED_SECONDARY }}
    >
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-white dark:bg-neutral-900 dark:border dark:border-neutral-800 rounded-lg sm:rounded-xl shadow-2xl w-full max-w-lg mx-auto max-h-[90dvh] overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-neutral-700">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500" />
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-neutral-100">
                Recover stranded invoice
              </h3>
              <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">{userEmail}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={state === "processing"}
            className="text-gray-400 hover:text-gray-600 dark:text-neutral-400 p-1 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          {state === "idle" && (
            <>
              <div className="bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-200 dark:border-amber-800/50 rounded-lg p-4">
                <h4 className="font-semibold text-amber-800 dark:text-amber-200 mb-2">
                  This will:
                </h4>
                <ol className="text-sm text-amber-700 dark:text-amber-300 list-decimal pl-5 space-y-1">
                  <li>
                    Void the dead invoice <span className="font-mono">{originalInvoiceId}</span>
                  </li>
                  <li>Use a held draft if one exists, else create a fresh invoice</li>
                  <li>Finalize and attempt one charge against the customer&apos;s saved card</li>
                  <li>On success, clear pause_collection so next anchor bills normally</li>
                </ol>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-3 italic">
                  Voiding cannot be undone. If the charge fails, the customer ends up with a
                  fresh open invoice that can be retried via the existing flow.
                </p>
              </div>

              {expectedAmountCents !== undefined && (
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-lg p-3 text-sm text-blue-800 dark:text-blue-200">
                  Expected charge: <strong>{formatCurrency(expectedAmountCents)}</strong>
                </div>
              )}

              <div className="bg-red-50 dark:bg-red-950/25 border border-red-200 dark:border-red-900/45 rounded-lg p-4">
                <label className="block text-sm font-medium text-red-800 dark:text-red-200 mb-2">
                  Type <strong>RECOVER</strong> to confirm:
                </label>
                <input
                  type="text"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder="RECOVER"
                  className="w-full px-3 py-2 rounded-md text-sm uppercase text-gray-900 dark:text-neutral-100 placeholder:text-gray-500 dark:placeholder:text-neutral-500 bg-white dark:bg-neutral-900 border border-red-300 dark:border-red-800 focus:outline-none focus:ring-2 focus:ring-red-500"
                  autoFocus
                />
              </div>
            </>
          )}

          {state === "processing" && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-amber-600 dark:text-amber-500" />
              <p className="text-gray-600 dark:text-neutral-400">
                Voiding, recreating, finalizing, charging…
              </p>
            </div>
          )}

          {state === "success" && response?.row && (
            <div className="bg-green-50 dark:bg-green-950/25 border border-green-200 dark:border-green-900/45 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                <h4 className="font-semibold text-green-800 dark:text-green-200">
                  Recovery complete
                </h4>
              </div>
              <dl className="text-sm grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
                <dt className="text-green-700 dark:text-green-300">New invoice</dt>
                <dd className="font-mono text-green-900 dark:text-green-100">
                  {response.newInvoiceId}
                </dd>
                <dt className="text-green-700 dark:text-green-300">Charge status</dt>
                <dd className="text-green-900 dark:text-green-100">{response.row.status}</dd>
                {response.row.amount !== undefined && (
                  <>
                    <dt className="text-green-700 dark:text-green-300">Amount</dt>
                    <dd className="text-green-900 dark:text-green-100">
                      {formatCurrency(response.row.amount)}
                    </dd>
                  </>
                )}
                {response.row.error && (
                  <>
                    <dt className="text-amber-700 dark:text-amber-300">Pay error</dt>
                    <dd className="text-amber-900 dark:text-amber-100">{response.row.error}</dd>
                  </>
                )}
                {response.row.resumeCollectionError && (
                  <>
                    <dt className="text-amber-700 dark:text-amber-300">Resume error</dt>
                    <dd className="text-amber-900 dark:text-amber-100">
                      {response.row.resumeCollectionError}
                    </dd>
                  </>
                )}
              </dl>
            </div>
          )}

          {state === "error" && (
            <div className="bg-red-50 dark:bg-red-950/25 border border-red-200 dark:border-red-900/45 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-red-800 dark:text-red-200 mb-1">
                    Recovery failed
                  </h4>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {response?.message || response?.error || "Unknown error"}
                  </p>
                  {response?.reason && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-mono">
                      reason: {response.reason}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 sm:gap-3 p-4 sm:p-6 pt-0 border-t border-gray-200 dark:border-neutral-800 bg-gray-50/80 dark:bg-neutral-950/80">
          <Button
            onClick={handleClose}
            variant="secondary"
            className="flex-1"
            disabled={state === "processing"}
          >
            {state === "success" || state === "error" ? "Close" : "Cancel"}
          </Button>
          {state === "idle" && (
            <Button
              onClick={() => void handleSubmit()}
              variant="secondary"
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
              disabled={confirmation !== "RECOVER"}
            >
              Recover
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecoverInvoiceModal;
```

- [ ] **Step 2: Verify it compiles**

```powershell
npm run type-check
```
Expected: PASS.

- [ ] **Step 3: Commit (after user authorizes)**

```powershell
git add src/components/admin/RecoverInvoiceModal.tsx
git commit -m "feat(admin): add RecoverInvoiceModal for stranded invoice recovery"
```

---

### Task 7: Trigger A — Recover button on Manual Retries rows

**Files:**
- Modify: `src/app/admin/component/PastDueChargeHistory.tsx`

- [ ] **Step 1: Add a helper that detects stranded errors**

In `src/app/admin/component/PastDueChargeHistory.tsx`, after the `formatDateTime` function (around line 49), add:

```typescript
function isStrandedError(errorMessage?: string | null, errorCode?: string | null): boolean {
  const msg = (errorMessage || "").toLowerCase();
  if (msg.includes("no longer be paid") || msg.includes("no longer payable")) return true;
  // Stripe surfaces this under various codes; the message check above is the reliable signal.
  return errorCode === "invoice_not_payable";
}
```

- [ ] **Step 2: Add state for the recovery modal**

In the `PastDueChargeHistory` function body, near the other `useState` hooks (around line 102, after `openRunId`):

```typescript
const [recoverTarget, setRecoverTarget] = useState<{
  userId: string;
  userEmail: string;
  originalInvoiceId: string;
} | null>(null);
```

- [ ] **Step 3: Import the modal**

At the top of the file (after the existing imports around line 28):

```typescript
import RecoverInvoiceModal from "@/components/admin/RecoverInvoiceModal";
```

- [ ] **Step 4: Add an "Action" column to the Manual Retries table**

Find the `<thead>` of the manual retries table (line 427). After the "Error" `<th>` (line 449), add:

```typescript
<th className="bg-gray-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
  Action
</th>
```

- [ ] **Step 5: Render the Recover button on stranded rows**

Find the `<tr>` rendering the row (line 454). After the Error `<td>` (line 478), add:

```typescript
<td className="px-4 py-3 text-right text-sm">
  {r.status === "failed" && isStrandedError(r.errorMessage, r.errorCode) && r.userId ? (
    <button
      type="button"
      onClick={() => {
        setRecoverTarget({
          userId: r.userId!,
          userEmail: r.userEmail || r.userId!,
          originalInvoiceId: r.invoiceId,
        });
      }}
      className="rounded-md bg-amber-100 hover:bg-amber-200 text-amber-800 px-2 py-1 text-xs font-semibold dark:bg-amber-950/50 dark:hover:bg-amber-900/60 dark:text-amber-200"
    >
      Recover
    </button>
  ) : null}
</td>
```

- [ ] **Step 6: Render the modal at component root**

Just before the closing `</div>` of the outermost return (around line 504, after the existing `<PastDueChargeHistoryDrawer />`):

```typescript
{recoverTarget && (
  <RecoverInvoiceModal
    isOpen={true}
    onClose={() => setRecoverTarget(null)}
    userId={recoverTarget.userId}
    userEmail={recoverTarget.userEmail}
    originalInvoiceId={recoverTarget.originalInvoiceId}
    onRecovered={() => {
      retriesQuery.refetch?.();
    }}
  />
)}
```

(If `retriesQuery.refetch` is not exposed, omit the `onRecovered` callback — the modal still works.)

- [ ] **Step 7: Verify the file compiles and passes lint**

```powershell
npm run type-check
npm run lint
```
Expected: PASS for both.

- [ ] **Step 8: Commit (after user authorizes)**

```powershell
git add src/app/admin/component/PastDueChargeHistory.tsx
git commit -m "feat(admin): add Recover button on stranded Manual Retries rows"
```

---

### Task 8: Trigger D — auto-fallback in ChargePastDueUserModal

**Files:**
- Modify: `src/components/admin/ChargePastDueUserModal.tsx`

When the per-user retry returns a row with the "no longer be paid" error, the modal should offer a "Recover" CTA.

- [ ] **Step 1: Import the recovery modal at the top of the file**

Around line 7, after the existing imports:

```typescript
import RecoverInvoiceModal from "./RecoverInvoiceModal";
```

- [ ] **Step 2: Add a helper near the existing helpers**

After the existing `formatCurrency` function (around line 167), add:

```typescript
function rowIsStrandedError(row: ChargeResult): boolean {
  const msg = (row.error || "").toLowerCase();
  return msg.includes("no longer be paid") || msg.includes("no longer payable");
}
```

- [ ] **Step 3: Add recovery state**

Near the existing `useState` hooks (around line 92), add:

```typescript
const [recoverTarget, setRecoverTarget] = useState<{
  invoiceId: string;
  userEmail: string;
} | null>(null);
```

- [ ] **Step 4: Render Recover buttons on stranded result rows**

Find the results table body (line 410, the `paginatedResults.map`). The `<td>` for "Detail" currently shows error/skipReason. Replace lines 422-424 with:

```typescript
<td className="px-3 py-2 text-gray-600 dark:text-neutral-400 text-xs">
  <div className="flex items-center justify-between gap-2">
    <span>{result.error || result.skipReason || "-"}</span>
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

- [ ] **Step 5: Render the recovery modal at the bottom of the main component return**

Just before the final closing `</div>` of the main wrapper (line 500, before `</div>\n    </div>\n  );`), add:

```typescript
{recoverTarget && (
  <RecoverInvoiceModal
    isOpen={true}
    onClose={() => setRecoverTarget(null)}
    userId={targetUserId}
    userEmail={recoverTarget.userEmail}
    originalInvoiceId={recoverTarget.invoiceId}
  />
)}
```

- [ ] **Step 6: Verify the file compiles and passes lint**

```powershell
npm run type-check
npm run lint
```
Expected: PASS for both.

- [ ] **Step 7: Commit (after user authorizes)**

```powershell
git add src/components/admin/ChargePastDueUserModal.tsx
git commit -m "feat(admin): auto-fallback Recover CTA in ChargePastDueUserModal"
```

---

### Task 9: Documentation updates (doc-sync hook will block without these)

**Files:**
- Modify: `docs/admin/api.md`
- Modify: `docs/admin/backend.md`
- Modify: `docs/admin/frontend.md`

Per CLAUDE.md hard rule #2, code edits must be paired with doc updates in the matching `docs/<domain>/` folder. The `Stop` hook will block otherwise.

- [ ] **Step 1: Update `docs/admin/api.md`**

Find the section that documents `/api/admin/invoices/charge-past-due` (the bulk past-due endpoint) and add a new sibling section after it:

```markdown
### `POST /api/admin/users/[userId]/recover-past-due-invoice`

Recover a stranded past-due invoice (status `uncollectible` or `void` — the "This invoice can no longer be paid" error). Voids the dead invoice, finds or creates a fresh draft for one cycle, finalizes, and pays via `payOpenInvoiceAsPastDueAdmin`.

**Auth:** admin only.

**Body:**

```json
{ "confirmation": "RECOVER", "originalInvoiceId": "in_..." }
```

**Success:**

```json
{
  "success": true,
  "newInvoiceId": "in_xxx",
  "row": { "invoiceId": "in_xxx", "status": "success", "amount": 4000, "...": "PastDueChargeResultRow shape" }
}
```

**Error reasons (response shape `{ success: false, reason, message }`):**

| reason | HTTP | meaning |
|---|---|---|
| `user_not_found` | 404 | userId did not match a Mongo user |
| `invoice_not_found` | 404 | Stripe didn't return the original invoice |
| `invoice_owner_mismatch` | 403 | Original invoice's customer differs from `user.stripeCustomerId` |
| `invoice_subscription_mismatch` | 403 | Original invoice belongs to a different subscription than `user.stripeSubscriptionId` |
| `not_past_due` | 409 | `user.subscription.status !== "past_due"` |
| `subscription_inactive` | 409 | User missing customer/subscription id |
| `package_not_found` | 409 | `subscription.packageId` not found in static membershipPackages |
| `invoice_still_chargeable` | 409 | Original is `open`/`draft`; admin should use existing flow |
| `invoice_already_paid` | 409 | Original is `paid`; nothing to recover |
| `invoice_unknown_status` | 409 | Original has an unexpected Stripe status |
| `recent_recovery_attempt` | 409 | Another recovery for this invoice happened within 24h |
| `no_payment_method` | 409 | Finalized invoice has no payment method (on invoice or customer default) |
| `void_failed` | 502 | Stripe rejected the void call |
| `draft_create_failed` | 502 | Stripe rejected the create call |
| `finalize_failed` | 502 | Stripe rejected the finalize call |

**Audit:** Each step writes one `InvoiceChargeLog` row. The void/create/finalize rows are tagged with `result.recovery.{step,originalInvoiceId,newInvoiceId?}`. The pay step writes its own row via the standard past-due primitive (no `recovery` tag). To trace a recovery, query by `result.recovery.originalInvoiceId`, then by `newInvoiceId` for the pay row.
```

- [ ] **Step 2: Update `docs/admin/backend.md`**

Add a new top-level section near the existing past-due charge section:

```markdown
## Stranded past-due invoice recovery

When Stripe's smart retries exhaust, the original past-due invoice transitions to `uncollectible` (or `void`). At that point both the bulk past-due charger and the per-user retry surface "This invoice can no longer be paid" because `stripe.invoices.pay()` rejects non-`open` invoices.

The recovery flow lives in [`src/server/admin/recoverStrandedPastDue.ts`](../../src/server/admin/recoverStrandedPastDue.ts) and runs the sequence:

1. Verify state — admin auth, user `subscription.status === "past_due"`, original invoice in `uncollectible`/`void`, customer/subscription ids match.
2. 24h lock — query `InvoiceChargeLog` for any prior recovery on the same original invoice via `hasRecentRecoveryAttempt` from [`recoverStrandedPastDuePolicy.ts`](../../src/server/admin/recoverStrandedPastDuePolicy.ts).
3. Void original (skipped if already `void`).
4. Find or create a held draft. The codebase prefers an existing held draft (Stripe creates one per missed cycle while paused) matching the expected cycle amount; falls back to `stripe.invoices.create()` + `invoiceItems.create()` if none.
5. `stripe.invoices.finalizeInvoice()` — this is the same battle-tested path used in [`pay-failed-invoice/route.ts:150`](../../src/app/api/stripe/pay-failed-invoice/route.ts#L150) and [`invoice-payment-intent.ts:163`](../../src/utils/payment/stripe/invoice-payment-intent.ts#L163). Manual finalize bypasses `pause_collection: keep_as_draft`.
6. Delegate to `payOpenInvoiceAsPastDueAdmin` ([`chargePastDueShared.ts`](../../src/server/admin/chargePastDueShared.ts)) for the actual charge — inherits its log row + idempotency key + `resumeAfterSuccessfulRenewalPayment` on success.

Pure helpers live in [`recoverStrandedPastDuePolicy.ts`](../../src/server/admin/recoverStrandedPastDuePolicy.ts) so they're testable without `STRIPE_SECRET_KEY`. Tests: `npm run test:recover-stranded-past-due-policy`.

### Idempotency model

| Step | Stripe key | DB lock |
|---|---|---|
| Void | `recover-void-${originalInvoiceId}` | — |
| Create | `recover-create-${originalInvoiceId}` | 24h via `result.recovery.originalInvoiceId` |
| Finalize | `recover-finalize-${newInvoiceId}` | — |
| Pay | `admin-charge-${newInvoiceId}` (existing) | 24h via `invoiceId` (existing) |

The 24h DB lock checks for any `InvoiceChargeLog` row tagged `result.recovery.originalInvoiceId === <id>`; the pay step's lock continues to work via the standard past-due window since the new invoice id is fresh.

### Failure semantics

Each step is naturally idempotent. If a step fails mid-sequence, the customer is no worse than before:

- Void fails → no state change
- Create fails → original voided, no new invoice (admin retries; void is a no-op)
- Finalize fails → original voided, draft exists (admin retries; create finds existing draft)
- Pay fails → original voided, fresh `open` invoice (admin uses existing per-user retry)
```

- [ ] **Step 3: Update `docs/admin/frontend.md`**

Add or extend the section about past-due UI:

```markdown
## Stranded invoice recovery UI

The recovery action is exposed in two places (both call the same modal):

- **Trigger A** — `Manual Retries (per-user)` table in [`PastDueChargeHistory.tsx`](../../src/app/admin/component/PastDueChargeHistory.tsx). Rows whose error matches `/no longer be paid|no longer payable/i` get a `Recover` button in a new Action column.
- **Trigger D** — auto-fallback in [`ChargePastDueUserModal.tsx`](../../src/components/admin/ChargePastDueUserModal.tsx). When a single-user retry returns a stranded-error row, that row gets an inline `Recover` button alongside the error text.

Both triggers open [`RecoverInvoiceModal.tsx`](../../src/components/admin/RecoverInvoiceModal.tsx), which:

- Shows the recovery sequence in plain English
- Requires the admin to type `RECOVER` exactly
- POSTs to `/api/admin/users/[userId]/recover-past-due-invoice`
- Displays the per-step result (new invoice id, charge status, amount)

The modal is intentionally narrower than `ChargePastDueUserModal` — by the time the admin opens it they have already seen the failed row, so there's no preview step.
```

- [ ] **Step 4: Bump the manifest's `lastVerified` for the admin domain**

Open `CLAUDE.md`, find the `admin` block in the Domain Manifest. Update its `lastVerified` to today's date:

```json
"admin": {
  "docs": "docs/admin/",
  "paths": [ ... ],
  "lastVerified": "2026-05-05"
}
```

- [ ] **Step 5: Run doc-sync to verify nothing else is stale**

```powershell
node .claude/hooks/doc-sync.mjs
```
Expected: no `BLOCKED` output. If it reports orphans for files unrelated to this change, fix them per CLAUDE.md hard rule #2.

- [ ] **Step 6: Commit (after user authorizes)**

```powershell
git add docs/admin/api.md docs/admin/backend.md docs/admin/frontend.md CLAUDE.md
git commit -m "docs(admin): document stranded past-due invoice recovery flow"
```

---

### Task 10: End-to-end verification (no code change — manual rollout)

This is the rollout gate from the spec. Do not skip.

- [ ] **Step 1: Run all test suites that touch nearby code**

```powershell
npm run test:recover-stranded-past-due-policy
npm run test:past-due-admin-charge
npm run test:stripe-collection-pause
npm run lint
npm run type-check
```
Expected: all PASS.

- [ ] **Step 2: Start dev server and smoke-test the UI**

```powershell
npm run dev
```
- Open the admin Past-Due Charge History page
- Confirm the new "Action" column renders on Manual Retries rows
- Confirm the Recover button appears ONLY on rows with the stranded error
- Click Recover → modal opens with the right user/invoice → Cancel without confirming

(Do not hit Confirm on a real customer yet.)

- [ ] **Step 3: Production rollout — Evan first**

Per the spec's rollout plan, run recovery on a single chosen user (Evan from the screenshot, invoice `in_1Skr7wJ3N9Ka6RJMNOrFahip`).

After the recovery completes:
- Verify in Stripe Dashboard: original `void`, new invoice `paid`, subscription `pause_collection` cleared
- Verify in Mongo: `User.subscription.isActive === true` and `subscription.status === "active"` (set by the existing `invoice.payment_succeeded` webhook)
- Verify in `InvoiceChargeLog`: 4 rows for this user in the last few minutes — three with `result.recovery.step` (void/create/finalize) and one standard pay row
- **Wait at least 24h before recovering more users.** Watch for any anomalies in webhook handling, accounting, or analytics dashboards.

- [ ] **Step 4: Run for the rest of the stranded backlog**

Once Evan's recovery is verified clean, proceed with the remaining stranded users one-by-one via the admin UI. Stop immediately if any unexpected failure pattern emerges.

---

## Self-review

**Spec coverage:**
- Recovery sequence (5 steps) → Tasks 3-4
- 24h lock + type RECOVER + reuse InvoiceChargeLog → Task 4 (lock + log) + Task 6 (modal confirmation) + Task 5 (route validation)
- Trigger A → Task 7
- Trigger D → Task 8
- Test plan → Tasks 1-2 (pure helpers); orchestrator verified via the rollout plan in Task 10
- Rollout plan (sandbox → Evan → general) → Task 10
- Confidence breakdown → preserved in spec; doc updates in Task 9 link back

**Placeholder scan:** None of the "TBD/TODO/handle edge cases" patterns. All code shown in full. No "similar to Task N" — every modification has its own exact code.

**Type consistency:**
- `RecoverStrandedResult` reasons in Task 3 match the `statusByReason` map in Task 5 ✓
- `PastDueChargeResultRow` import path in Task 4 matches its export in `chargePastDueShared.ts` ✓
- `pickHeldDraftForRecovery` test signature (Task 1) matches implementation (Task 2) ✓
- Modal prop `expectedAmountCents` is optional in component (Task 6) and not passed by Trigger D (Task 8); Trigger A (Task 7) also omits it — consistent ✓

**One known gap:** the orchestrator (Task 4) is not unit-tested directly. This is by design — it does Stripe + Mongo writes, and the codebase pattern is to test pure helpers separately and verify integration via staged rollout. Task 10 is the integration verification; if you want to add an orchestrator test with a stripe-mock layer later, that's a separate plan.

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-05-05-stranded-past-due-invoice-recovery.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration, protects main session context.

**2. Inline Execution** — execute tasks in this session using `executing-plans`, batch execution with checkpoints for review.

Which approach?
