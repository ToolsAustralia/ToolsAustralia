# Force-Charge Past-Due Subscriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin "Force Charge" tool + user self-serve "Pay overdue amount" + diagnostic + test script for past-due users with no chargeable invoice on their current subscription. All paths funnel through one shared primitive that finalizes/pays an existing invoice (never creates new).

**Architecture:** Server-side `forceChargeCurrentCycle` primitive. Three callers: admin endpoint, user self-serve endpoint, CLI scripts. Always pays existing invoices (open or finalized-from-draft) so `billing_reason: "subscription_cycle"` is preserved end-to-end and the webhook's full renewal pipeline runs normally.

**Tech Stack:** Next.js 15 App Router, Stripe SDK, Mongoose, Zod, NextAuth, React 19 + Tailwind, `tsx` test scripts with `node:assert/strict`.

**Spec:** [docs/superpowers/specs/2026-05-05-force-charge-past-due-design.md](../specs/2026-05-05-force-charge-past-due-design.md)

**Critical safety property:** Never create new manual invoices. Manual invoices have `billing_reason: "manual"` which the webhook dispatch ladder ([stripe/webhook/route.ts:3598-3618](../../src/app/api/stripe/webhook/route.ts#L3598-L3618)) does not recognize, breaking the renewal pipeline. By only finalizing/paying invoices Stripe created (which have `subscription_cycle`), the pipeline runs as normal.

---

## File Structure

| Path | Type | Responsibility |
|---|---|---|
| `src/server/admin/forceChargePastDuePolicy.ts` | Create | Pure helpers: target picker, period-paid check, lock predicate, idempotency key |
| `src/server/admin/__tests__/forceChargePastDuePolicy.test.ts` | Create | Unit tests for pure helpers |
| `src/server/admin/forceChargePastDue.ts` | Create | Orchestrator + eligibility-check function |
| `src/server/admin/recoverStrandedPastDue.ts` | Modify | Remove create-new fallback; add `no_held_draft` reason |
| `src/server/admin/recoverStrandedPastDuePolicy.ts` | Modify | (No changes — flagged for awareness) |
| `src/app/api/admin/users/[id]/recover-past-due-invoice/route.ts` | Modify | Add `no_held_draft` to `statusByReason` map |
| `src/app/api/admin/users/[id]/force-charge/route.ts` | Create | Admin endpoint (POST, type "FORCE CHARGE") |
| `src/app/api/stripe/force-charge-overdue/route.ts` | Create | User self-serve endpoint |
| `src/components/admin/ChargePastDueUserModal.tsx` | Modify | Force Charge fallback when 0 eligible + user past_due |
| `src/components/modals/RenewalFailedModal.tsx` | Modify | Force Charge fallback when "no payable invoice" |
| `scripts/find-stuck-paused-users.ts` | Create | Diagnostic CSV |
| `scripts/test-force-charge.ts` | Create | Per-user dry-run + live CLI |
| `package.json` | Modify | Add npm scripts for tests + diagnostic + test-force-charge |
| `docs/admin/api.md`, `backend.md`, `frontend.md` | Modify | Document new endpoints, primitive, UI |
| `docs/admin/testing.md` | Modify | Add new test script |

---

### Task 1: Webhook audit (read-only research)

**Files:** None modified. Output recorded as a comment block in `src/server/admin/forceChargePastDue.ts` (added in Task 4).

This task confirms the design's safety property by verifying the webhook handler treats finalized-from-draft invoices (which preserve `billing_reason: "subscription_cycle"`) the same as Stripe-cycle-billed invoices.

- [ ] **Step 1: Grep the webhook for billing_reason gates**

```powershell
npx tsx --eval "import('@grep-tools')" 2>$null  # placeholder; use the Grep tool / VSCode search
```

Use ripgrep or VSCode search:
```
billing_reason ===
billing_reason !==
billing_reason in
```
across `src/app/api/stripe/webhook/route.ts` and the wider codebase.

Document each match in a temporary text file (e.g. `audit-billing-reason.txt`) with the file:line and what's gated.

- [ ] **Step 2: Document expected behavior for finalized-from-draft invoices**

For each gate found in Step 1, determine:
- Does it accept `subscription_cycle`? (Drafts created by Stripe under `keep_as_draft` have this billing_reason — finalize preserves it.)
- Are there other guards (e.g. `recordMembershipRecurringAffiliate`) that may diverge?

Expected outcome: ALL gates that need to fire for a normal renewal accept `subscription_cycle`. The codebase-investigator agent already verified this; Step 2 is sanity-check confirmation.

- [ ] **Step 3: Record audit findings**

Save findings as a comment block at the top of `src/server/admin/forceChargePastDue.ts` (the file you'll create in Task 4). Format:

```typescript
/**
 * WEBHOOK AUDIT (verified 2026-05-05):
 *
 * Force Charge ALWAYS finalizes/pays an existing invoice. Stripe-created
 * cycle invoices (whether finalized as `open` or held as `draft` under
 * pause_collection) have `billing_reason: "subscription_cycle"`, which is
 * preserved by `finalizeInvoice()`. This billing_reason hits all webhook
 * branches that drive the renewal pipeline:
 *   - route.ts:3295  upsertRenewalCycleFromPaidInvoice (subscription_cycle)
 *   - route.ts:3598-3618  dispatch ladder → processPaymentBenefits
 *   - route.ts:4114  Klaviyo "Renewed" event (via recordMembershipRecurringAffiliate)
 *   - route.ts:4283  endDate sync
 *   - route.ts:3395  pause_collection clear (also has `prev === past_due` fallback)
 *
 * If we ever support creating a new manual invoice (V2), the webhook
 * ladder needs a metadata-based fallback because billing_reason: "manual"
 * is not currently handled. See spec section "Why no manual invoices".
 */
```

- [ ] **Step 4: No commit needed for this task**

The audit findings are embedded in Task 4's file. Nothing to commit yet.

---

### Task 2: Pure helpers — write failing test

**Files:**
- Create: `src/server/admin/__tests__/forceChargePastDuePolicy.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// src/server/admin/__tests__/forceChargePastDuePolicy.test.ts
import assert from "node:assert/strict";
import type Stripe from "stripe";
import {
  buildForceChargeFinalizeIdempotencyKey,
  pickForceChargeTarget,
  isCurrentPeriodAlreadyPaid,
  hasRecentSuccessfulChargeOnSubscription,
} from "../forceChargePastDuePolicy";

function testFinalizeKey() {
  assert.equal(buildForceChargeFinalizeIdempotencyKey("in_x"), "force-finalize-in_x");
  assert.notEqual(
    buildForceChargeFinalizeIdempotencyKey("in_a"),
    buildForceChargeFinalizeIdempotencyKey("in_b")
  );
}

function testPickTargetPrefersOpenOverDraft() {
  const open = [
    { id: "in_o1", status: "open", collection_method: "charge_automatically", amount_remaining: 4000, created: 200 } as Stripe.Invoice,
  ];
  const draft = [
    { id: "in_d1", status: "draft", amount_due: 4000, created: 300 } as Stripe.Invoice,
  ];
  const t = pickForceChargeTarget(open, draft, 4000);
  assert.equal(t?.invoice.id, "in_o1");
  assert.equal(t?.kind, "open");
}

function testPickTargetFallsBackToMatchingDraft() {
  const t = pickForceChargeTarget(
    [],
    [
      { id: "in_d1", status: "draft", amount_due: 2000, created: 100 } as Stripe.Invoice,
      { id: "in_d2", status: "draft", amount_due: 4000, created: 300 } as Stripe.Invoice,
      { id: "in_d3", status: "draft", amount_due: 4000, created: 200 } as Stripe.Invoice,
    ],
    4000
  );
  // newest matching draft wins
  assert.equal(t?.invoice.id, "in_d2");
  assert.equal(t?.kind, "draft");
}

function testPickTargetReturnsNullWhenNeitherFits() {
  // No open invoices, no draft matching expected amount
  const t = pickForceChargeTarget(
    [],
    [{ id: "in_d1", status: "draft", amount_due: 2000, created: 100 } as Stripe.Invoice],
    4000
  );
  assert.equal(t, null);
}

function testPickTargetSkipsManualCollection() {
  // open invoice with collection_method: "send_invoice" must not be picked
  const open = [
    { id: "in_o1", status: "open", collection_method: "send_invoice", amount_remaining: 4000, created: 200 } as Stripe.Invoice,
  ];
  const t = pickForceChargeTarget(open, [], 4000);
  assert.equal(t, null);
}

function testPickTargetSkipsZeroRemaining() {
  const open = [
    { id: "in_o1", status: "open", collection_method: "charge_automatically", amount_remaining: 0, created: 200 } as Stripe.Invoice,
  ];
  const t = pickForceChargeTarget(open, [], 4000);
  assert.equal(t, null);
}

function testPeriodAlreadyPaidWhenInvoiceCoversCurrentEnd() {
  const paid = [
    {
      id: "in_p1",
      status: "paid",
      period: { start: 1714867200, end: 1717545600 }, // May 5 - Jun 5
    } as unknown as Stripe.Invoice,
  ];
  // Current period: May 6 - Jun 6
  assert.equal(
    isCurrentPeriodAlreadyPaid(paid, 1714953600, 1717632000),
    true
  );
}

function testPeriodNotPaidWhenNoOverlap() {
  const paid = [
    {
      id: "in_p1",
      status: "paid",
      period: { start: 1712188800, end: 1714867200 }, // April
    } as unknown as Stripe.Invoice,
  ];
  // Current period: May 6 - Jun 6
  assert.equal(
    isCurrentPeriodAlreadyPaid(paid, 1714953600, 1717632000),
    false
  );
}

function testPeriodNotPaidWhenNoPaidInvoices() {
  assert.equal(isCurrentPeriodAlreadyPaid([], 1714953600, 1717632000), false);
}

function testRecentSuccessLockBlocksWithinWindow() {
  const now = new Date("2026-05-05T12:00:00.000Z");
  const rows = [
    {
      attemptedAt: new Date("2026-05-05T05:00:00.000Z"), // 7h ago
      status: "success" as const,
      result: { subscriptionId: "sub_target" },
    },
  ];
  assert.equal(hasRecentSuccessfulChargeOnSubscription(rows, "sub_target", now), true);
}

function testRecentSuccessLockAllowsAfterWindow() {
  const now = new Date("2026-05-05T12:00:00.000Z");
  const rows = [
    {
      attemptedAt: new Date("2026-05-04T11:00:00.000Z"), // 25h ago
      status: "success" as const,
      result: { subscriptionId: "sub_target" },
    },
  ];
  assert.equal(hasRecentSuccessfulChargeOnSubscription(rows, "sub_target", now), false);
}

function testRecentSuccessLockIgnoresFailedRows() {
  const now = new Date("2026-05-05T12:00:00.000Z");
  const rows = [
    {
      attemptedAt: new Date("2026-05-05T05:00:00.000Z"),
      status: "failed" as const,
      result: { subscriptionId: "sub_target" },
    },
  ];
  assert.equal(hasRecentSuccessfulChargeOnSubscription(rows, "sub_target", now), false);
}

function testRecentSuccessLockIgnoresOtherSubscriptions() {
  const now = new Date("2026-05-05T12:00:00.000Z");
  const rows = [
    {
      attemptedAt: new Date("2026-05-05T05:00:00.000Z"),
      status: "success" as const,
      result: { subscriptionId: "sub_other" },
    },
  ];
  assert.equal(hasRecentSuccessfulChargeOnSubscription(rows, "sub_target", now), false);
}

function run() {
  testFinalizeKey();
  testPickTargetPrefersOpenOverDraft();
  testPickTargetFallsBackToMatchingDraft();
  testPickTargetReturnsNullWhenNeitherFits();
  testPickTargetSkipsManualCollection();
  testPickTargetSkipsZeroRemaining();
  testPeriodAlreadyPaidWhenInvoiceCoversCurrentEnd();
  testPeriodNotPaidWhenNoOverlap();
  testPeriodNotPaidWhenNoPaidInvoices();
  testRecentSuccessLockBlocksWithinWindow();
  testRecentSuccessLockAllowsAfterWindow();
  testRecentSuccessLockIgnoresFailedRows();
  testRecentSuccessLockIgnoresOtherSubscriptions();
  console.log("forceChargePastDuePolicy tests passed");
}

run();
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
npx tsx src/server/admin/__tests__/forceChargePastDuePolicy.test.ts
```
Expected: FAIL with "Cannot find module '../forceChargePastDuePolicy'".

---

### Task 3: Pure helpers — implement

**Files:**
- Create: `src/server/admin/forceChargePastDuePolicy.ts`

- [ ] **Step 1: Write the implementation**

```typescript
// src/server/admin/forceChargePastDuePolicy.ts
/**
 * Pure helpers for the Force Charge past-due flow.
 *
 * No Stripe SDK or Mongoose imports — testable without env vars.
 *
 * The orchestrator pairs an open or held-draft invoice with the user's
 * current subscription, finalizes if needed, and pays via the existing
 * payOpenInvoiceAsPastDueAdmin primitive. Critical: never create new
 * invoices manually — the webhook does not recognize `billing_reason: "manual"`.
 */

import type Stripe from "stripe";

/** Stable Stripe idempotency key for the finalize step. */
export function buildForceChargeFinalizeIdempotencyKey(invoiceId: string): string {
  return `force-finalize-${invoiceId}`;
}

export type ForceChargeTarget =
  | { kind: "open"; invoice: Stripe.Invoice }
  | { kind: "draft"; invoice: Stripe.Invoice };

/**
 * Pick the single best invoice on the user's current subscription to charge.
 * - Prefers an `open` invoice (collection_method=charge_automatically, amount_remaining>0)
 * - Else picks the newest `draft` invoice whose amount_due matches expectedAmountCents
 * - Returns null when neither fits (caller must BLOCK with "no_chargeable_invoice")
 *
 * Never returns a candidate that would require creating a new invoice — the design
 * explicitly disallows that.
 */
export function pickForceChargeTarget(
  openInvoices: Stripe.Invoice[],
  draftInvoices: Stripe.Invoice[],
  expectedAmountCents: number
): ForceChargeTarget | null {
  // Open candidates first
  const eligibleOpen = openInvoices.filter(
    (inv) =>
      inv.collection_method === "charge_automatically" &&
      (inv.amount_remaining ?? 0) > 0
  );
  if (eligibleOpen.length > 0) {
    eligibleOpen.sort((a, b) => b.created - a.created);
    return { kind: "open", invoice: eligibleOpen[0]! };
  }

  // Draft fallback — must match expected cycle amount
  const eligibleDrafts = draftInvoices.filter(
    (d) => d.status === "draft" && d.amount_due === expectedAmountCents
  );
  if (eligibleDrafts.length > 0) {
    eligibleDrafts.sort((a, b) => b.created - a.created);
    return { kind: "draft", invoice: eligibleDrafts[0]! };
  }

  return null;
}

type StripeInvoiceWithPeriod = Stripe.Invoice & {
  period?: { start?: number; end?: number };
};

/**
 * Whether any paid invoice in the given list overlaps the current billing period.
 * Used as the Stripe-side double-billing guard. Period values are Unix seconds.
 */
export function isCurrentPeriodAlreadyPaid(
  paidInvoices: Stripe.Invoice[],
  currentPeriodStart: number,
  currentPeriodEnd: number
): boolean {
  for (const raw of paidInvoices) {
    const inv = raw as StripeInvoiceWithPeriod;
    if (inv.status !== "paid") continue;
    const start = inv.period?.start;
    const end = inv.period?.end;
    if (typeof start !== "number" || typeof end !== "number") continue;
    // Overlap test (closed intervals on both ends)
    if (start <= currentPeriodEnd && end >= currentPeriodStart) {
      return true;
    }
  }
  return false;
}

type ChargeLogRowForLock = {
  attemptedAt: Date;
  status: "success" | "failed" | "skipped";
  result?: unknown;
};

/**
 * 24h success-status lock predicate. True if a successful Force Charge
 * attempt against the same subscription happened within the last 24h.
 *
 * Reads `result.subscriptionId` from each row — the orchestrator stamps that
 * value into every InvoiceChargeLog row it writes for force-charge attempts.
 */
export function hasRecentSuccessfulChargeOnSubscription(
  rows: ChargeLogRowForLock[],
  subscriptionId: string,
  now: Date = new Date()
): boolean {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  for (const row of rows) {
    if (row.status !== "success") continue;
    if (row.attemptedAt < cutoff) continue;
    const sub = extractSubscriptionId(row.result);
    if (sub === subscriptionId) return true;
  }
  return false;
}

function extractSubscriptionId(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const record = result as Record<string, unknown>;
  if (typeof record.subscriptionId === "string") return record.subscriptionId;
  return null;
}
```

- [ ] **Step 2: Run test to verify it passes**

```powershell
npx tsx src/server/admin/__tests__/forceChargePastDuePolicy.test.ts
```
Expected: `forceChargePastDuePolicy tests passed`.

- [ ] **Step 3: Wire test into package.json**

Open `package.json`, find the existing `test:past-due-admin-charge` script. Add this line right after it:

```json
"test:force-charge-policy": "tsx src/server/admin/__tests__/forceChargePastDuePolicy.test.ts",
```

- [ ] **Step 4: Verify the npm script works**

```powershell
npm run test:force-charge-policy
```
Expected: `forceChargePastDuePolicy tests passed`.

- [ ] **Step 5: Commit (after user authorizes)**

```powershell
git add src/server/admin/forceChargePastDuePolicy.ts src/server/admin/__tests__/forceChargePastDuePolicy.test.ts package.json
git commit -m "feat(admin): add pure helpers for force-charge past-due flow"
```

---

### Task 4: Patch existing recovery flow — remove create-new fallback

**Files:**
- Modify: `src/server/admin/recoverStrandedPastDue.ts`
- Modify: `src/app/api/admin/users/[id]/recover-past-due-invoice/route.ts`

The existing recovery flow has a foot-gun: when no held draft is found, it creates a new manual invoice via `stripe.invoices.create()`. That manual invoice would skip the renewal pipeline (verified via webhook audit). Replace the create-new branch with a clean error.

- [ ] **Step 1: Add `no_held_draft` reason to the type union**

In `src/server/admin/recoverStrandedPastDue.ts`, find the `RecoverStrandedResult` type. Add `"no_held_draft"` to the reason union:

```typescript
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
        | "invoice_subscription_mismatch"
        | "invoice_still_chargeable"
        | "invoice_already_paid"
        | "invoice_unknown_status"
        | "recent_recovery_attempt"
        | "void_failed"
        | "draft_create_failed"
        | "no_held_draft"
        | "no_payment_method"
        | "finalize_failed";
      message: string;
    };
```

- [ ] **Step 2: Replace the create-new branch in step 5 of the orchestrator**

Find the existing block in `recoverStrandedPastDueInvoice`:

```typescript
// ─── 5. Find or create a draft for the missed cycle ───
let draftInvoice: Stripe.Invoice | null = null;
let usedExistingDraft = false;
try {
  const drafts = await stripe.invoices.list({
    subscription: user.stripeSubscriptionId,
    status: "draft",
    limit: 10,
  });
  draftInvoice = pickHeldDraftForRecovery(drafts.data, expectedAmountCents);
  if (draftInvoice) usedExistingDraft = true;
} catch (err) {
  console.error("[recoverStrandedPastDue] listing drafts failed:", err);
}

if (!draftInvoice) {
  try {
    draftInvoice = await stripe.invoices.create(
      // ... full create block
    );
    // ... invoiceItems.create
  } catch (err) {
    // ... error handling
  }
}
```

Replace the entire find-or-create block with:

```typescript
// ─── 5. Find a held draft for the missed cycle ───
// CRITICAL: never create new manual invoices. Stripe-cycle drafts preserve
// `billing_reason: "subscription_cycle"`, which the webhook needs to fire
// the full renewal pipeline. A manually-created invoice would have
// `billing_reason: "manual"` and silently skip the pipeline.
let draftInvoice: Stripe.Invoice | null = null;
try {
  const drafts = await stripe.invoices.list({
    subscription: user.stripeSubscriptionId,
    status: "draft",
    limit: 10,
  });
  draftInvoice = pickHeldDraftForRecovery(drafts.data, expectedAmountCents);
} catch (err) {
  console.error("[recoverStrandedPastDue] listing drafts failed:", err);
}

if (!draftInvoice) {
  await InvoiceChargeLog.create({
    ...baseLogFields,
    invoiceId: originalInvoiceId,
    status: "skipped",
    attemptedAt: new Date(),
    errorMessage:
      "No held draft found on the subscription; recovery cannot proceed without one (manual invoices break the webhook renewal pipeline)",
    result: { recovery: { step: "create", originalInvoiceId } },
  });
  return {
    ok: false,
    reason: "no_held_draft",
    message:
      "No held draft invoice exists on the subscription. Stripe must have a cycle-billed invoice to finalize and pay; manual invoices break the renewal pipeline.",
  };
}
```

Then immediately after, the existing code that records the create step can be simplified (since we no longer have the "created fresh" branch):

```typescript
const newInvoiceId = draftInvoice.id;
// Defensive: Stripe always returns an id on Invoice.create, but the type allows null.
// Narrow before passing to downstream calls that require a string.
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
  errorMessage: `Used existing held draft ${newInvoiceId}`,
  result: { recovery: { step: "create", originalInvoiceId, newInvoiceId } },
});
```

(Note: removing the `usedExistingDraft` flag entirely since there's only one path now.)

- [ ] **Step 3: Remove unused imports**

Check the imports at the top of `recoverStrandedPastDue.ts`. After this edit, `buildRecoveryCreateIdempotencyKey` and `buildRecoveryItemIdempotencyKey` are no longer used. Remove them from the import list.

The corresponding exports in `recoverStrandedPastDuePolicy.ts` can stay — they're still exported but unused; future refactors can prune them. Leaving them avoids a separate API change for this commit.

- [ ] **Step 4: Add `no_held_draft` to the route's status map**

In `src/app/api/admin/users/[id]/recover-past-due-invoice/route.ts`, find the `statusByReason` map. Add the new reason:

```typescript
const statusByReason: Record<typeof result.reason, number> = {
  // ... existing entries ...
  no_held_draft: 409,
  no_payment_method: 409,
  finalize_failed: 502,
};
```

(Place `no_held_draft: 409` in alphabetical order alongside the existing entries.)

- [ ] **Step 5: Verify type-check + tests**

```powershell
npm run type-check; npm run test:recover-stranded-past-due-policy; npm run test:past-due-admin-charge
```

All must pass.

- [ ] **Step 6: Commit (after user authorizes)**

```powershell
git add src/server/admin/recoverStrandedPastDue.ts src/app/api/admin/users/[id]/recover-past-due-invoice/route.ts
git commit -m "fix(admin): remove create-new fallback from stranded recovery (manual invoices skip webhook)"
```

---

### Task 5: Force Charge orchestrator + eligibility check

**Files:**
- Create: `src/server/admin/forceChargePastDue.ts`

- [ ] **Step 1: Write the orchestrator file**

```typescript
// src/server/admin/forceChargePastDue.ts
/**
 * WEBHOOK AUDIT (verified 2026-05-05):
 *
 * Force Charge ALWAYS finalizes/pays an existing invoice. Stripe-created
 * cycle invoices (whether finalized as `open` or held as `draft` under
 * pause_collection) have `billing_reason: "subscription_cycle"`, which is
 * preserved by `finalizeInvoice()`. This billing_reason hits all webhook
 * branches that drive the renewal pipeline:
 *   - route.ts:3295  upsertRenewalCycleFromPaidInvoice (subscription_cycle)
 *   - route.ts:3598-3618  dispatch ladder → processPaymentBenefits
 *   - route.ts:4114  Klaviyo "Renewed" event (via recordMembershipRecurringAffiliate)
 *   - route.ts:4283  endDate sync
 *   - route.ts:3395  pause_collection clear (also has `prev === past_due` fallback)
 *
 * If we ever support creating a new manual invoice (V2), the webhook
 * ladder needs a metadata-based fallback because billing_reason: "manual"
 * is not currently handled. See spec section "Why no manual invoices".
 */

import mongoose from "mongoose";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import InvoiceChargeLog from "@/models/InvoiceChargeLog";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import {
  buildForceChargeFinalizeIdempotencyKey,
  hasRecentSuccessfulChargeOnSubscription,
  isCurrentPeriodAlreadyPaid,
  pickForceChargeTarget,
  type ForceChargeTarget,
} from "./forceChargePastDuePolicy";
import {
  payOpenInvoiceAsPastDueAdmin,
  type PastDueChargeResultRow,
} from "./chargePastDueShared";

/** A read-only diagnostic of the user's force-charge eligibility. */
export type ForceChargeEligibility =
  | {
      eligible: true;
      target: ForceChargeTarget;
      expectedAmountCents: number;
      subscriptionId: string;
    }
  | {
      eligible: false;
      reason:
        | "user_not_found"
        | "subscription_inactive"
        | "not_past_due"
        | "package_not_found"
        | "recent_charge_attempt"
        | "period_already_paid"
        | "no_chargeable_invoice";
      message: string;
    };

export type ForceChargeResult =
  | { ok: true; row: PastDueChargeResultRow; chargedInvoiceId: string }
  | {
      ok: false;
      reason: ForceChargeEligibility extends { eligible: false; reason: infer R } ? R : never
        | "finalize_failed"
        | "pay_failed";
      message: string;
    };

/**
 * Read-only check used by the test/diagnostic scripts and by the orchestrator
 * itself. Single source of truth for "can we Force Charge this user right now?"
 */
export async function checkForceChargeEligibility(params: {
  userId: string;
}): Promise<ForceChargeEligibility> {
  const { userId } = params;

  const user = await User.findById(userId)
    .select("_id email stripeCustomerId stripeSubscriptionId subscription")
    .lean();
  if (!user) {
    return { eligible: false, reason: "user_not_found", message: "User not found" };
  }

  const subStatus = (user.subscription as { status?: string } | undefined)?.status;
  if (subStatus !== "past_due") {
    return {
      eligible: false,
      reason: "not_past_due",
      message: `Subscription status is "${subStatus ?? "(missing)"}", not past_due`,
    };
  }
  if (!user.stripeCustomerId || !user.stripeSubscriptionId) {
    return {
      eligible: false,
      reason: "subscription_inactive",
      message: "User has no active Stripe subscription/customer",
    };
  }

  const packageId = (user.subscription as { packageId?: string } | undefined)?.packageId;
  const pkg = packageId ? getPackageById(packageId) : undefined;
  if (!pkg || !pkg.isActive || typeof pkg.price !== "number") {
    return {
      eligible: false,
      reason: "package_not_found",
      message: `MembershipPackage "${packageId ?? ""}" not found or inactive`,
    };
  }
  const expectedAmountCents = Math.round(pkg.price * 100);

  // 1. DB 24h lock check
  const recentRows = await InvoiceChargeLog.find({
    userId: new mongoose.Types.ObjectId(userId),
    attemptedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  })
    .select({ attemptedAt: 1, status: 1, result: 1 })
    .lean();
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

  // 2. Stripe paid-period check
  const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
  const subWithPeriod = subscription as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };
  const cps = subWithPeriod.current_period_start;
  const cpe = subWithPeriod.current_period_end;
  if (typeof cps !== "number" || typeof cpe !== "number") {
    return {
      eligible: false,
      reason: "subscription_inactive",
      message: "Subscription has no current_period window",
    };
  }
  const paidList = await stripe.invoices.list({
    subscription: user.stripeSubscriptionId,
    status: "paid",
    limit: 5,
  });
  if (isCurrentPeriodAlreadyPaid(paidList.data, cps, cpe)) {
    return {
      eligible: false,
      reason: "period_already_paid",
      message: "Current billing period is already settled by a paid invoice",
    };
  }

  // 3. Find the target invoice
  const [openList, draftList] = await Promise.all([
    stripe.invoices.list({
      subscription: user.stripeSubscriptionId,
      status: "open",
      limit: 10,
    }),
    stripe.invoices.list({
      subscription: user.stripeSubscriptionId,
      status: "draft",
      limit: 10,
    }),
  ]);

  const target = pickForceChargeTarget(openList.data, draftList.data, expectedAmountCents);
  if (!target) {
    return {
      eligible: false,
      reason: "no_chargeable_invoice",
      message:
        "No chargeable invoice on current subscription (no open invoice, no held draft matching expected amount)",
    };
  }

  return {
    eligible: true,
    target,
    expectedAmountCents,
    subscriptionId: user.stripeSubscriptionId,
  };
}

/**
 * Force Charge orchestrator. Used by admin endpoint, user self-serve endpoint,
 * and the live mode of test-force-charge.ts.
 */
export async function forceChargeCurrentCycle(params: {
  userId: string;
  triggeredBy: "admin" | "user";
  /** When triggeredBy === "admin", the admin's User._id. When "user", pass the user's own _id. */
  adminId: string;
}): Promise<ForceChargeResult> {
  const { userId, adminId } = params;

  const eligibility = await checkForceChargeEligibility({ userId });
  if (!eligibility.eligible) {
    return {
      ok: false,
      reason: eligibility.reason,
      message: eligibility.message,
    };
  }

  const { target, expectedAmountCents, subscriptionId } = eligibility;

  // Re-fetch user for the write path (user could have changed between eligibility and execution).
  const user = await User.findById(userId)
    .select("_id email stripeCustomerId")
    .lean();
  if (!user || !user.stripeCustomerId) {
    return { ok: false, reason: "user_not_found", message: "User vanished mid-execution" };
  }

  // Step 1: Finalize the draft if needed
  let payableInvoice: Stripe.Invoice = target.invoice;
  if (target.kind === "draft") {
    const targetId = target.invoice.id;
    if (!targetId) {
      return {
        ok: false,
        reason: "finalize_failed",
        message: "Draft invoice missing id",
      };
    }
    try {
      payableInvoice = await stripe.invoices.finalizeInvoice(
        targetId,
        { expand: ["payment_intent"] },
        { idempotencyKey: buildForceChargeFinalizeIdempotencyKey(targetId) }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await InvoiceChargeLog.create({
        invoiceId: targetId,
        customerId: user.stripeCustomerId,
        userId: new mongoose.Types.ObjectId(userId),
        adminId: new mongoose.Types.ObjectId(adminId),
        status: "failed",
        amount: expectedAmountCents,
        attemptedAt: new Date(),
        errorMessage: `force-charge finalize failed: ${message}`,
        result: { forceCharge: { step: "finalize" }, subscriptionId },
      });
      return { ok: false, reason: "finalize_failed", message };
    }
  }

  const chargedInvoiceId = payableInvoice.id;
  if (!chargedInvoiceId) {
    return {
      ok: false,
      reason: "pay_failed",
      message: "Payable invoice missing id",
    };
  }

  // Step 2: Pay via the existing primitive
  const paymentMethodId =
    typeof payableInvoice.default_payment_method === "string"
      ? payableInvoice.default_payment_method
      : payableInvoice.default_payment_method?.id;

  let resolvedPmId = paymentMethodId ?? null;
  if (!resolvedPmId) {
    const customer = await stripe.customers.retrieve(user.stripeCustomerId);
    if (!customer.deleted) {
      const c = customer as Stripe.Customer & {
        invoice_settings?: { default_payment_method?: string | Stripe.PaymentMethod };
      };
      const dpm = c.invoice_settings?.default_payment_method;
      resolvedPmId = typeof dpm === "string" ? dpm : dpm?.id ?? null;
    }
  }

  if (!resolvedPmId) {
    await InvoiceChargeLog.create({
      invoiceId: chargedInvoiceId,
      customerId: user.stripeCustomerId,
      userId: new mongoose.Types.ObjectId(userId),
      adminId: new mongoose.Types.ObjectId(adminId),
      status: "failed",
      amount: expectedAmountCents,
      attemptedAt: new Date(),
      errorMessage: "force-charge pay failed: no payment method",
      result: { forceCharge: { step: "pay" }, subscriptionId },
    });
    return {
      ok: false,
      reason: "pay_failed",
      message: "No payment method on invoice or customer default",
    };
  }

  const row = await payOpenInvoiceAsPastDueAdmin({
    invoice: payableInvoice,
    paymentMethodId: resolvedPmId,
    customerId: user.stripeCustomerId,
    user: { _id: user._id, email: user.email },
    adminId,
  });

  // Stamp subscriptionId into the most-recently-created log row so the 24h lock
  // can find it next time. (payOpenInvoiceAsPastDueAdmin writes its own row that
  // includes invoiceId; we add a tag for the lock.)
  await InvoiceChargeLog.updateOne(
    {
      invoiceId: chargedInvoiceId,
      userId: new mongoose.Types.ObjectId(userId),
    },
    {
      $set: {
        "result.subscriptionId": subscriptionId,
        "result.forceCharge.step": "pay",
        "result.forceCharge.triggeredBy": params.triggeredBy,
      },
    },
    { sort: { attemptedAt: -1 } }
  );

  return {
    ok: row.status === "success" || row.status === "skipped" ? true : false as never,
    row,
    chargedInvoiceId,
  } as ForceChargeResult;
}
```

- [ ] **Step 2: Verify type-check passes**

```powershell
npm run type-check
```
Expected: PASS.

If you encounter unexpected typing issues, fix them with cleanly-scoped intersection casts (matching the codebase pattern in `chargePastDueShared.ts`). Do NOT use `any` or `// @ts-ignore`.

- [ ] **Step 3: Commit (after user authorizes)**

```powershell
git add src/server/admin/forceChargePastDue.ts
git commit -m "feat(admin): force-charge orchestrator + eligibility check"
```

---

### Task 6: Admin endpoint

**Files:**
- Create: `src/app/api/admin/users/[id]/force-charge/route.ts`

- [ ] **Step 1: Write the route handler**

```typescript
// src/app/api/admin/users/[id]/force-charge/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { z } from "zod";
import {
  forceChargeCurrentCycle,
  type ForceChargeResult,
} from "@/server/admin/forceChargePastDue";

const bodySchema = z.object({
  confirmation: z.literal("FORCE CHARGE"),
});

const statusByReason: Record<
  Exclude<ForceChargeResult, { ok: true }>["reason"],
  number
> = {
  user_not_found: 404,
  subscription_inactive: 409,
  not_past_due: 409,
  package_not_found: 409,
  recent_charge_attempt: 409,
  period_already_paid: 409,
  no_chargeable_invoice: 409,
  finalize_failed: 502,
  pay_failed: 502,
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: userId } = await params;

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          message: 'Body must be { confirmation: "FORCE CHARGE" }',
        },
        { status: 400 }
      );
    }

    const result = await forceChargeCurrentCycle({
      userId,
      triggeredBy: "admin",
      adminId: session.user.id,
    });

    if (!result.ok) {
      return NextResponse.json(
        { success: false, reason: result.reason, message: result.message },
        { status: statusByReason[result.reason] ?? 500 }
      );
    }

    return NextResponse.json({
      success: true,
      chargedInvoiceId: result.chargedInvoiceId,
      row: result.row,
    });
  } catch (error) {
    console.error("force-charge admin route error:", error);
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

- [ ] **Step 2: Verify type-check + lint**

```powershell
npm run type-check; npm run lint
```

- [ ] **Step 3: Commit (after user authorizes)**

```powershell
git add src/app/api/admin/users/[id]/force-charge/route.ts
git commit -m "feat(admin): add force-charge endpoint"
```

---

### Task 7: User self-serve endpoint

**Files:**
- Create: `src/app/api/stripe/force-charge-overdue/route.ts`

- [ ] **Step 1: Write the route handler**

```typescript
// src/app/api/stripe/force-charge-overdue/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import {
  forceChargeCurrentCycle,
  type ForceChargeResult,
} from "@/server/admin/forceChargePastDue";

const statusByReason: Record<
  Exclude<ForceChargeResult, { ok: true }>["reason"],
  number
> = {
  user_not_found: 404,
  subscription_inactive: 409,
  not_past_due: 409,
  package_not_found: 409,
  recent_charge_attempt: 429,
  period_already_paid: 409,
  no_chargeable_invoice: 409,
  finalize_failed: 502,
  pay_failed: 502,
};

export async function POST(_request: NextRequest) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // User triggers force-charge for themselves. adminId === userId — the
    // InvoiceChargeLog row is "self-served" and the result tag carries
    // triggeredBy: "user" so audit can distinguish.
    const result = await forceChargeCurrentCycle({
      userId: session.user.id,
      triggeredBy: "user",
      adminId: session.user.id,
    });

    if (!result.ok) {
      return NextResponse.json(
        { success: false, reason: result.reason, message: result.message },
        { status: statusByReason[result.reason] ?? 500 }
      );
    }

    return NextResponse.json({
      success: true,
      chargedInvoiceId: result.chargedInvoiceId,
      paymentStatus: result.row.status,
      amount: result.row.amount,
    });
  } catch (error) {
    console.error("force-charge-overdue user route error:", error);
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

- [ ] **Step 2: Verify type-check + lint**

```powershell
npm run type-check; npm run lint
```

- [ ] **Step 3: Commit (after user authorizes)**

```powershell
git add src/app/api/stripe/force-charge-overdue/route.ts
git commit -m "feat(stripe): add user self-serve force-charge endpoint"
```

---

### Task 8: Diagnostic script — find stuck-paused users

**Files:**
- Create: `scripts/find-stuck-paused-users.ts`

- [ ] **Step 1: Write the script**

```typescript
#!/usr/bin/env npx tsx

/**
 * List MongoDB users in past_due state whose current Stripe subscription
 * has no chargeable invoice (no open + no matching draft). These are the
 * "stuck-paused" users who can't be settled by the existing tools and
 * need Force Charge.
 *
 * Usage:
 *   npx tsx scripts/find-stuck-paused-users.ts [--limit=N] [--include-orphans]
 *
 * --include-orphans flag also lists open invoices on the customer's expired
 * subscriptions (those need manual void in Stripe Dashboard).
 *
 * Output: CSV to stdout. Progress to stderr.
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Math.max(1, parseInt(LIMIT_ARG.split("=")[1] || "200", 10)) : 200;
const INCLUDE_ORPHANS = process.argv.includes("--include-orphans");

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
  const { pickForceChargeTarget } = await import("../src/server/admin/forceChargePastDuePolicy");
  const { getPackageById } = await import("../src/data/membershipPackages");

  await mongoose.connect(process.env.MONGODB_URI);

  console.error(`Searching past_due users (limit ${LIMIT})…`);
  const users = await User.find({
    stripeSubscriptionId: { $exists: true, $nin: [null, ""] },
    "subscription.status": "past_due",
  })
    .select("_id email stripeCustomerId stripeSubscriptionId subscription")
    .limit(LIMIT)
    .lean();

  console.error(`Found ${users.length} past_due users to inspect.`);
  console.log(
    "email,userId,stripeCustomerId,stripeSubscriptionId,packageId,expectedAmountCents,openCount,draftCount,verdict,orphans"
  );

  let stuck = 0;
  let chargeable = 0;
  let unknown = 0;

  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    if (i % 10 === 0) {
      console.error(`  progress: ${i}/${users.length}`);
    }

    const subId = (u.stripeSubscriptionId as string) || "";
    const customerId = (u.stripeCustomerId as string) || "";
    const packageId = (u.subscription as { packageId?: string } | undefined)?.packageId || "";
    const pkg = packageId ? getPackageById(packageId) : undefined;
    const expectedAmount =
      pkg && typeof pkg.price === "number" ? Math.round(pkg.price * 100) : 0;

    let openCount = 0;
    let draftCount = 0;
    let verdict = "unknown";
    let orphansLabel = "";

    try {
      const [openList, draftList] = await Promise.all([
        stripe.invoices.list({ subscription: subId, status: "open", limit: 10 }),
        stripe.invoices.list({ subscription: subId, status: "draft", limit: 10 }),
      ]);
      openCount = openList.data.length;
      draftCount = draftList.data.length;
      const target = pickForceChargeTarget(openList.data, draftList.data, expectedAmount);
      if (target) {
        verdict = `chargeable_${target.kind}`;
        chargeable++;
      } else {
        verdict = "stuck";
        stuck++;
      }

      if (INCLUDE_ORPHANS && customerId) {
        const customerInvoices = await stripe.invoices.list({
          customer: customerId,
          status: "open",
          limit: 20,
        });
        const orphans = customerInvoices.data.filter((inv) => {
          const invSub =
            typeof inv.subscription === "string"
              ? inv.subscription
              : (inv.subscription as { id?: string } | null | undefined)?.id;
          return invSub !== subId;
        });
        if (orphans.length > 0) {
          orphansLabel = orphans.map((o) => o.id).join("|");
        }
      }
    } catch (err) {
      verdict = `error:${err instanceof Error ? err.message : String(err)}`;
      unknown++;
    }

    const csvRow = [
      u.email || "",
      String(u._id),
      customerId,
      subId,
      packageId,
      expectedAmount,
      openCount,
      draftCount,
      verdict,
      orphansLabel,
    ]
      .map((v) =>
        String(v).includes(",") || String(v).includes('"')
          ? `"${String(v).replace(/"/g, '""')}"`
          : String(v)
      )
      .join(",");
    console.log(csvRow);
  }

  console.error(
    `\nDone. ${chargeable} chargeable | ${stuck} stuck | ${unknown} errored | ${users.length} total`
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm script**

In `package.json`, add to the `scripts` block:

```json
"find:stuck-paused-users": "tsx scripts/find-stuck-paused-users.ts"
```

- [ ] **Step 3: Smoke test (no commit yet)**

Don't actually run against production Mongo + Stripe yet — that happens during rollout (Task 12). Just verify the file compiles:

```powershell
npm run type-check
```
Expected: PASS.

- [ ] **Step 4: Commit (after user authorizes)**

```powershell
git add scripts/find-stuck-paused-users.ts package.json
git commit -m "feat(scripts): add find-stuck-paused-users diagnostic"
```

---

### Task 9: Test script — per-user dry-run + live

**Files:**
- Create: `scripts/test-force-charge.ts`

- [ ] **Step 1: Write the script**

```typescript
#!/usr/bin/env npx tsx

/**
 * Test Force Charge against a single user. Resolves user by email or
 * stripeCustomerId, prints their state and what Force Charge would do,
 * and (with --live) actually executes.
 *
 * Usage:
 *   # Dry-run by email
 *   npx tsx scripts/test-force-charge.ts --email=user@example.com
 *
 *   # Dry-run by Stripe customer id
 *   npx tsx scripts/test-force-charge.ts --customer=cus_xxx
 *
 *   # Live execution (requires --admin-email to log against)
 *   npx tsx scripts/test-force-charge.ts --email=user@example.com --live --admin-email=admin@example.com
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
  const { checkForceChargeEligibility, forceChargeCurrentCycle } = await import(
    "../src/server/admin/forceChargePastDue"
  );

  await mongoose.connect(process.env.MONGODB_URI);

  // Resolve user
  let user: { _id: unknown; email?: string | null } | null = null;
  if (email) {
    user = await User.findOne({ email })
      .select("_id email stripeCustomerId stripeSubscriptionId subscription")
      .lean();
  } else if (customerId) {
    user = await User.findOne({ stripeCustomerId: customerId })
      .select("_id email stripeCustomerId stripeSubscriptionId subscription")
      .lean();
  }

  if (!user) {
    console.error(`No user found for email=${email ?? ""} customer=${customerId ?? ""}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const userId = String(user._id);
  console.log("=== Target user ===");
  console.log(`  email:           ${user.email ?? "(none)"}`);
  console.log(`  userId (Mongo):  ${userId}`);
  console.log("");

  console.log("=== Eligibility ===");
  const eligibility = await checkForceChargeEligibility({ userId });
  console.log(JSON.stringify(eligibility, null, 2));
  console.log("");

  if (!eligibility.eligible) {
    console.log(`Verdict: BLOCKED (${eligibility.reason})`);
    await mongoose.disconnect();
    return;
  }

  if (!live) {
    console.log("=== Plan (dry-run) ===");
    console.log(`  Will ${eligibility.target.kind === "draft" ? "FINALIZE then PAY" : "PAY"}`);
    console.log(`  invoice id: ${eligibility.target.invoice.id ?? "(none)"}`);
    console.log(`  expected amount (cents): ${eligibility.expectedAmountCents}`);
    console.log("");
    console.log("Pass --live to execute. Requires --admin-email.");
    await mongoose.disconnect();
    return;
  }

  // Live: resolve admin
  const admin = await User.findOne({ email: adminEmail, role: "admin" })
    .select("_id email")
    .lean();
  if (!admin) {
    console.error(`No admin user found for email=${adminEmail}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log("=== LIVE execution ===");
  console.log(`  admin: ${admin.email} (${admin._id})`);
  const result = await forceChargeCurrentCycle({
    userId,
    triggeredBy: "admin",
    adminId: String(admin._id),
  });
  console.log(JSON.stringify(result, null, 2));

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm scripts**

In `package.json` add to the `scripts` block:

```json
"test:force-charge:dry": "tsx scripts/test-force-charge.ts",
"test:force-charge:live": "tsx scripts/test-force-charge.ts --live"
```

(The user passes `--email=...` or `--customer=...` after the npm script; npm forwards extra args.)

- [ ] **Step 3: Verify it compiles**

```powershell
npm run type-check
```

- [ ] **Step 4: Commit (after user authorizes)**

```powershell
git add scripts/test-force-charge.ts package.json
git commit -m "feat(scripts): add per-user test-force-charge with dry/live modes"
```

---

### Task 10: Admin UI — extend ChargePastDueUserModal

**Files:**
- Modify: `src/components/admin/ChargePastDueUserModal.tsx`

When the preview returns `eligibleCount: 0` AND the target user is `past_due` in DB, show a Force Charge fallback path instead of the disabled "Confirm charge (0)" button.

- [ ] **Step 1: Add Force Charge state and helper**

In `ChargePastDueUserModal.tsx`, near the existing `useState` hooks, add:

```typescript
const [forceChargeMode, setForceChargeMode] = useState(false);
const [forceConfirmation, setForceConfirmation] = useState("");
const [forceProcessing, setForceProcessing] = useState(false);
const [forceResult, setForceResult] = useState<{
  success: boolean;
  chargedInvoiceId?: string;
  reason?: string;
  message?: string;
  amount?: number;
  paymentStatus?: string;
} | null>(null);
```

- [ ] **Step 2: Add the handleForceCharge submit handler**

Inside the component body (before the return):

```typescript
const handleForceCharge = async () => {
  if (forceConfirmation !== "FORCE CHARGE") return;
  setForceProcessing(true);
  try {
    const res = await fetch(`/api/admin/users/${targetUserId}/force-charge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "FORCE CHARGE" }),
    });
    const data = await res.json();
    setForceResult({
      success: !!data.success,
      chargedInvoiceId: data.chargedInvoiceId,
      reason: data.reason,
      message: data.message,
      amount: data.row?.amount,
      paymentStatus: data.row?.status,
    });
  } catch (err) {
    setForceResult({
      success: false,
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    setForceProcessing(false);
  }
};
```

- [ ] **Step 3: Render the Force Charge fallback in the preview state**

Find the existing `state === "preview"` render block. At the bottom of the preview block (after the existing "Type CHARGE to confirm" panel), conditionally render the Force Charge fallback when `preview?.preview.eligibleCount === 0`:

```tsx
{state === "preview" && preview && preview.preview.eligibleCount === 0 && !forceChargeMode && (
  <div className="bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-200 dark:border-amber-800/50 rounded-lg p-4">
    <div className="flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <h4 className="font-semibold text-amber-800 dark:text-amber-200 mb-1">
          No chargeable invoice on this user&apos;s current subscription
        </h4>
        <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
          The user may have a held draft from <code>pause_collection</code> that needs finalizing.
          Force Charge will finalize and pay an existing draft (or pay an existing open invoice)
          on the current subscription. It never creates new manual invoices.
        </p>
        <button
          type="button"
          onClick={() => setForceChargeMode(true)}
          className="inline-flex items-center gap-2 rounded-md bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 text-xs font-semibold dark:bg-amber-600 dark:hover:bg-amber-700"
        >
          Switch to Force Charge
        </button>
      </div>
    </div>
  </div>
)}

{forceChargeMode && !forceResult && (
  <div className="bg-red-50 dark:bg-red-950/25 rounded-lg p-4 border border-red-200 dark:border-red-900/45">
    <label className="block text-sm font-medium text-red-800 dark:text-red-200 mb-2">
      Type <strong>FORCE CHARGE</strong> to confirm:
    </label>
    <input
      type="text"
      value={forceConfirmation}
      onChange={(e) => setForceConfirmation(e.target.value)}
      placeholder="FORCE CHARGE"
      className="w-full px-3 py-2 rounded-md text-sm uppercase text-gray-900 dark:text-neutral-100 placeholder:text-gray-500 dark:placeholder:text-neutral-500 bg-white dark:bg-neutral-900 border border-red-300 dark:border-red-800 focus:outline-none focus:ring-2 focus:ring-red-500"
      autoFocus
    />
  </div>
)}

{forceProcessing && (
  <div className="flex flex-col items-center justify-center py-8 space-y-4">
    <Loader2 className="w-8 h-8 animate-spin text-amber-600 dark:text-amber-500" />
    <p className="text-gray-700 dark:text-neutral-300 text-sm">Force charging…</p>
  </div>
)}

{forceResult && forceResult.success && (
  <div className="bg-green-50 dark:bg-green-950/25 border border-green-200 dark:border-green-900/45 rounded-lg p-4">
    <div className="flex items-center gap-2">
      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
      <h4 className="font-semibold text-green-800 dark:text-green-200">Force charge complete</h4>
    </div>
    <p className="text-sm text-green-700 dark:text-green-300 mt-2">
      Invoice {forceResult.chargedInvoiceId} → {forceResult.paymentStatus} ({forceResult.amount ? formatCurrency(forceResult.amount) : "—"})
    </p>
  </div>
)}

{forceResult && !forceResult.success && (
  <div className="bg-red-50 dark:bg-red-950/25 border border-red-200 dark:border-red-900/45 rounded-lg p-4">
    <div className="flex items-start gap-3">
      <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
      <div>
        <h4 className="font-semibold text-red-800 dark:text-red-200 mb-1">
          Force charge failed
        </h4>
        <p className="text-sm text-red-700 dark:text-red-300">
          {forceResult.message || "Unknown error"}
        </p>
        {forceResult.reason && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-mono">
            reason: {forceResult.reason}
          </p>
        )}
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Replace the existing footer Confirm Charge button when in force mode**

Find the existing footer:

```tsx
{state === "preview" && (
  <Button
    onClick={() => void handleConfirm()}
    ...
  >
    Confirm charge ({preview?.preview.eligibleCount ?? 0})
  </Button>
)}
```

Wrap with a conditional that renders Force Charge button instead when `forceChargeMode && !forceResult`:

```tsx
{state === "preview" && !forceChargeMode && (
  <Button
    onClick={() => void handleConfirm()}
    variant="secondary"
    className="flex-1 bg-red-600 hover:bg-red-700 text-white"
    disabled={confirmation !== "CHARGE" || preview?.preview.eligibleCount === 0}
  >
    Confirm charge ({preview?.preview.eligibleCount ?? 0})
  </Button>
)}
{forceChargeMode && !forceResult && (
  <Button
    onClick={() => void handleForceCharge()}
    variant="secondary"
    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-600 dark:hover:bg-amber-700"
    disabled={forceConfirmation !== "FORCE CHARGE" || forceProcessing}
  >
    Force Charge
  </Button>
)}
```

- [ ] **Step 5: Reset Force Charge state on close**

In the existing `handleClose`, add the new state resets alongside the existing ones:

```typescript
setForceChargeMode(false);
setForceConfirmation("");
setForceProcessing(false);
setForceResult(null);
```

- [ ] **Step 6: Verify type-check + lint**

```powershell
npm run type-check; npm run lint
```

- [ ] **Step 7: Commit (after user authorizes)**

```powershell
git add src/components/admin/ChargePastDueUserModal.tsx
git commit -m "feat(admin): Force Charge fallback in ChargePastDueUserModal"
```

---

### Task 11: User UI — extend RenewalFailedModal

**Files:**
- Modify: `src/components/modals/RenewalFailedModal.tsx`

When the existing pay-failed-invoice flow returns an error matching "no payable invoice" or "this bill can't be paid here", swap the CTA to Pay Overdue Amount which calls the user-self-serve endpoint.

- [ ] **Step 1: Read the existing modal first**

```powershell
# Open in editor, identify the pay-failed-invoice fetch call and the
# error-display branch.
```

Identify:
- The `fetch(...)` call that hits `/api/stripe/pay-failed-invoice`
- The state variable that holds the error message
- The button(s) currently shown after an error

- [ ] **Step 2: Add Force Charge state and helper**

Near the existing `useState` hooks in the modal:

```typescript
const [forceChargeProcessing, setForceChargeProcessing] = useState(false);
const [forceChargeResult, setForceChargeResult] = useState<{
  success: boolean;
  chargedInvoiceId?: string;
  paymentStatus?: string;
  amount?: number;
  reason?: string;
  message?: string;
} | null>(null);

function isNoPayableInvoiceError(errMsg: string | null | undefined): boolean {
  const m = (errMsg || "").toLowerCase();
  return (
    m.includes("no longer be paid") ||
    m.includes("no longer payable") ||
    m.includes("can't be paid") ||
    m.includes("cannot be paid") ||
    m.includes("no payable invoice")
  );
}

const handlePayOverdue = async () => {
  setForceChargeProcessing(true);
  try {
    const res = await fetch("/api/stripe/force-charge-overdue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const data = await res.json();
    setForceChargeResult({
      success: !!data.success,
      chargedInvoiceId: data.chargedInvoiceId,
      paymentStatus: data.paymentStatus,
      amount: data.amount,
      reason: data.reason,
      message: data.message,
    });
  } catch (err) {
    setForceChargeResult({
      success: false,
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    setForceChargeProcessing(false);
  }
};
```

- [ ] **Step 3: Render the Pay Overdue CTA**

Find the error-display branch in the modal (where the "this bill can't be paid here" message is shown to the user). Conditionally render the Pay Overdue CTA when `isNoPayableInvoiceError(currentError)`:

```tsx
{isNoPayableInvoiceError(error) && !forceChargeResult && (
  <div className="mt-4 flex flex-col gap-3">
    <p className="text-sm text-gray-700 dark:text-neutral-300">
      We can settle your overdue cycle by finalizing your held cycle invoice.
      One-click recovery — no card update needed.
    </p>
    <button
      type="button"
      onClick={() => void handlePayOverdue()}
      disabled={forceChargeProcessing}
      className="inline-flex items-center justify-center gap-2 rounded-md bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
    >
      {forceChargeProcessing ? "Paying overdue amount…" : "Pay overdue amount"}
    </button>
  </div>
)}

{forceChargeResult && forceChargeResult.success && (
  <div className="mt-4 bg-green-50 dark:bg-green-950/25 border border-green-200 dark:border-green-900/45 rounded-lg p-4">
    <p className="text-sm text-green-800 dark:text-green-200">
      Payment received. Your subscription is now up to date.
    </p>
  </div>
)}

{forceChargeResult && !forceChargeResult.success && (
  <div className="mt-4 bg-red-50 dark:bg-red-950/25 border border-red-200 dark:border-red-900/45 rounded-lg p-4">
    <p className="text-sm text-red-800 dark:text-red-200">
      {forceChargeResult.message || "Could not pay overdue amount. Please contact support."}
    </p>
  </div>
)}
```

- [ ] **Step 4: Verify type-check + lint**

```powershell
npm run type-check; npm run lint
```

- [ ] **Step 5: Commit (after user authorizes)**

```powershell
git add src/components/modals/RenewalFailedModal.tsx
git commit -m "feat(modals): Pay-overdue CTA in RenewalFailedModal"
```

---

### Task 12: Documentation

**Files:**
- Modify: `docs/admin/api.md`
- Modify: `docs/admin/backend.md`
- Modify: `docs/admin/frontend.md`
- Modify: `docs/admin/testing.md`
- Modify: `CLAUDE.md` (manifest `lastVerified`)

- [ ] **Step 1: Update `docs/admin/api.md`**

Add new sections for the two new endpoints. Format for each: full path, body schema, success response shape, error reasons table mapped to HTTP status. Use the existing recovery endpoint section as a pattern.

For `POST /api/admin/users/[id]/force-charge`:
- Body: `{ "confirmation": "FORCE CHARGE" }`
- Success: `{ "success": true, "chargedInvoiceId": "in_xxx", "row": { ... } }`
- Errors table with all 9 reasons from `forceChargePastDue.ts`

For `POST /api/stripe/force-charge-overdue`:
- Body: `{}` (no confirmation)
- Same reasons as admin endpoint, with `recent_charge_attempt: 429` (rate limit) instead of 409

- [ ] **Step 2: Update `docs/admin/backend.md`**

Add a new H2 section after the existing "Stranded past-due invoice recovery" section:

```markdown
## Force Charge for stuck-paused subscriptions

When `pause_collection: keep_as_draft` was applied (or the user has cancelled-and-resubscribed leaving orphan invoices), the user's current subscription may have no chargeable open invoice — only held drafts. Force Charge finalizes such a draft (or pays an existing open invoice) on the current subscription.

The orchestrator [`forceChargeCurrentCycle`](../../src/server/admin/forceChargePastDue.ts):

1. Verify state — admin (or self) auth, `subscription.status === "past_due"`, customer/sub ids present, package found, expected amount derived.
2. DB 24h lock — `hasRecentSuccessfulChargeOnSubscription` from [`forceChargePastDuePolicy.ts`](../../src/server/admin/forceChargePastDuePolicy.ts).
3. Stripe paid-period check — `isCurrentPeriodAlreadyPaid` against `stripe.invoices.list({ status: "paid" })` for the current `current_period`.
4. Pick target — `pickForceChargeTarget` returns either an open invoice or a held draft matching expected amount (never null + create — see "Critical safety property").
5. Finalize the draft if needed (idempotency key `force-finalize-${invoiceId}`).
6. Pay via existing `payOpenInvoiceAsPastDueAdmin` — preserves `billing_reason: "subscription_cycle"`, triggers full webhook renewal pipeline.

### Critical safety property

Force Charge never creates new manual invoices. The webhook's [`invoice.payment_succeeded`](../../src/app/api/stripe/webhook/route.ts#L3598-L3618) dispatch ladder rejects unknown `billing_reason` values, so a manually-created invoice (`billing_reason: "manual"`) would charge the customer but skip the renewal pipeline (no status flip, no entries, no Klaviyo event). By only paying invoices Stripe created (which retain `subscription_cycle`), the pipeline runs as normal.

If no chargeable invoice exists on the current sub, the orchestrator returns `reason: "no_chargeable_invoice"` and the admin/user is prompted to contact support.

### Idempotency model

| Step | Stripe key | DB lock |
|---|---|---|
| Finalize | `force-finalize-${invoiceId}` | (covered by InvoiceChargeLog 24h success-status lock keyed on subscription) |
| Pay | `admin-charge-${invoiceId}` (existing) | (existing per-invoice 24h lock) |

Concurrent admin + user fires deduplicate via stable Stripe idempotency keys.
```

- [ ] **Step 3: Update `docs/admin/frontend.md`**

Add a new H2 section:

```markdown
## Force Charge UI

### Admin trigger
[`ChargePastDueUserModal.tsx`](../../src/components/admin/ChargePastDueUserModal.tsx) — when the preview returns 0 eligible invoices AND the user is `past_due` in DB, the modal offers a "Switch to Force Charge" button. Clicking it swaps the confirmation input from `CHARGE` to `FORCE CHARGE` and the submit calls `/api/admin/users/[id]/force-charge`.

### User self-serve trigger
[`RenewalFailedModal.tsx`](../../src/components/modals/RenewalFailedModal.tsx) — when the existing `pay-failed-invoice` flow returns an error matching "no payable invoice" or similar, the modal renders a "Pay overdue amount" CTA that calls `/api/stripe/force-charge-overdue`.

Both flows surface success/failure inline. Light + dark mode parity matches the existing recovery-modal styling.
```

- [ ] **Step 4: Update `docs/admin/testing.md`**

Add to the test scripts table:

```markdown
| `npm run test:force-charge-policy` | `src/server/admin/__tests__/forceChargePastDuePolicy.test.ts` | pure helpers for force-charge: target picker, period-paid check, 24h lock |
```

Add to the diagnostic + test-script row (sibling to the audit script):

```markdown
| `npm run find:stuck-paused-users [-- --limit=N --include-orphans]` | `scripts/find-stuck-paused-users.ts` | CSV audit of past_due users with no chargeable invoice on current sub |
| `npm run test:force-charge:dry -- --email=user@example.com` | `scripts/test-force-charge.ts` | dry-run eligibility + plan for one user |
| `npm run test:force-charge:live -- --email=... --admin-email=...` | `scripts/test-force-charge.ts` | live execution against one user |
```

- [ ] **Step 5: Bump manifest `lastVerified`**

Open `CLAUDE.md`. In the `admin` block of the Domain Manifest, ensure `"lastVerified": "2026-05-05"`. Same for `billing-stripe` if you also touched that domain (check final diff).

- [ ] **Step 6: Run doc-sync hook**

```powershell
node .claude/hooks/doc-sync.mjs
```

If it reports `BLOCKED` for files we created in this plan, add them to the appropriate domain's `paths` glob in the manifest.

- [ ] **Step 7: Commit (after user authorizes)**

```powershell
git add docs/admin/api.md docs/admin/backend.md docs/admin/frontend.md docs/admin/testing.md CLAUDE.md
git commit -m "docs(admin): document Force Charge primitive, endpoints, scripts, UI"
```

---

### Task 13: Production rollout (manual — controller responsibility, not subagent)

This task is NOT delegated to an implementation subagent. It is the controller's (= you, the human or the controlling Claude) job to run, after all coding tasks are complete and committed.

- [ ] **Step 1: Run all tests**

```powershell
npm run test:force-charge-policy; npm run test:recover-stranded-past-due-policy; npm run test:past-due-admin-charge; npm run test:stripe-collection-pause; npm run lint; npm run type-check
```

All must pass.

- [ ] **Step 2: Diagnostic audit**

```powershell
npm run find:stuck-paused-users -- --limit=200 > stuck-paused-audit-2026-05-05.csv
```

Review the CSV. Count the stuck users. Verify the verdict column. Use this to plan the rollout.

- [ ] **Step 3: Sandbox/staging smoke test**

In a Stripe sandbox account, create a test user in stuck-paused state (subscription with `pause_collection: keep_as_draft`, draft invoice held). Run:

```powershell
npm run test:force-charge:dry -- --email=test+stuck@example.com
```

Verify the eligibility output looks correct. Then:

```powershell
npm run test:force-charge:live -- --email=test+stuck@example.com --admin-email=admin@example.com
```

Verify in Stripe Dashboard: draft finalized → invoice paid → webhook fired. Verify in Mongo: subscription status flipped, entries accumulated, endDate advanced, pause cleared.

- [ ] **Step 4: Production: test on Tyler Johnson first**

Tyler is the named user from the spec. Single subject. Run live:

```powershell
npm run test:force-charge:live -- --email=tyler.lkjohnson@gmail.com --admin-email=<admin email>
```

Verify all webhook side effects ran:
- DB: `user.subscription.status === "active"`
- DB: `subscription.endDate` advanced
- Stripe: `pause_collection` cleared
- Klaviyo: renewal event arrived
- Entries: counter incremented

**Wait at least 24 hours** before processing more users. Watch for any anomalies in webhook handling, accounting, or analytics.

- [ ] **Step 5: Process the rest of the stuck-paused backlog**

Either:
- Use the admin UI's Force Charge button per-user (matches the existing per-row recovery pattern), OR
- Use `npm run test:force-charge:live` per-user from the diagnostic CSV

The 24h DB lock prevents accidental double-execution.

- [ ] **Step 6: Enable user-facing self-serve**

Once admin path is proven, the user dashboard's `RenewalFailedModal` already includes the Pay Overdue CTA from Task 11 — it activates whenever `isNoPayableInvoiceError` matches. No deploy gate needed beyond the standard ship.

---

## Self-review

**Spec coverage:**
- Force Charge orchestrator → Tasks 2, 3, 5
- Admin endpoint → Task 6
- User endpoint → Task 7
- Diagnostic script → Task 8
- Test script → Task 9
- Admin UI → Task 10
- User UI → Task 11
- Patch existing recovery → Task 4
- Webhook audit → Task 1 (research) + audit comment block in Task 5
- Documentation → Task 12
- Rollout → Task 13

**Placeholder scan:** None of the "TBD/handle edge cases/similar to Task N" patterns. All code shown in full. The user-UI task (11) has a "read the existing modal first" step but immediately follows it with concrete code blocks.

**Type consistency:**
- `ForceChargeResult.reason` union in Task 5 ↔ `statusByReason` map in Tasks 6 + 7 — match (9 reasons).
- `pickForceChargeTarget` test signature (Task 2) ↔ implementation signature (Task 3) — match.
- `ForceChargeTarget` type used by orchestrator in Task 5 — defined in policy file (Task 3).
- Modal state variables follow the same naming as recovery modal counterparts (`forceChargeMode`, `forceConfirmation`, etc.) — consistent with existing patterns.

**One known gap:** the orchestrator (Task 5) is not unit-tested directly. By design — the codebase pattern tests only pure helpers, and orchestrator integration is verified via the staged rollout in Task 13.

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-05-05-force-charge-past-due.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session via `executing-plans`, batched checkpoints for review.

Which approach?
