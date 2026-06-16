# Bulk Stranded-Invoice Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin-triggered, preview-first, capped batch that recovers "stranded" past-due members — those whose bulk charge fails with "this invoice can no longer be paid" — by voiding their stale open cycle invoices and finalizing+paying the current cycle's held draft (one cycle), never charging anyone twice.

**Architecture:** A pure classifier decides, per member, which invoices are the current held draft (to pay), stale opens (to void), and superseded drafts (to delete). A read-only preview surfaces the worklist + totals. An execute path acquires the global `ChargeJobLock`, creates a `ChargeJobRun(kind:"recover")`, and per member voids/deletes/finalizes/pays — reusing the existing `payOpenInvoiceAsPastDueAdmin` primitive (Stripe idempotency keys + audit). Double-charge safety is structural: a paid draft is no longer a draft, so a recovered member drops out of the worklist permanently.

**Tech Stack:** Next.js 15 App Router, Stripe (Basil `2025-08-27`), Mongoose, `tsx` tests.

**Spec:** [docs/superpowers/specs/2026-06-16-bulk-stranded-recovery-design.md](../specs/2026-06-16-bulk-stranded-recovery-design.md)

---

## File Structure

- **Create** `src/server/admin/recoverStrandedBulkPolicy.ts` — pure classifier (no Stripe/Mongo imports beyond the `Stripe` type). One responsibility: given a member's invoices + current period end + expected amount, return the classification + the invoice buckets.
- **Create** `src/server/admin/__tests__/recoverStrandedBulkPolicy.test.ts` — `tsx` unit test of the classifier.
- **Create** `src/server/admin/recoverStrandedBulk.ts` — detector (`previewStrandedRecovery`) + orchestrator (`runStrandedRecovery`). Owns Stripe reads/writes + Mongo.
- **Create** `src/app/api/admin/invoices/recover-stranded/route.ts` — `GET` (preview) + `POST` (execute). Mirrors `charge-past-due/route.ts`.
- **Modify** `src/models/ChargeJobRun.ts` — add optional `kind: "charge" | "recover"` (default `"charge"`).
- **Modify** `docs/admin/backend.md` + `docs/admin/api.md` — document the new flow (admin domain doc-sync).
- **Modify** `BUSINESS.md` — note the new admin recovery action under the past-due recovery flow (rule 5: admin tool guardrails).
- **Modify** `package.json` — add `test:recover-stranded-bulk`.
- **(Final task) Create** `src/components/admin/RecoverStrandedPanel.tsx` + wire into the existing charge-past-due admin page — endpoint-first, UI last.

---

### Task 1: Pure classifier `recoverStrandedBulkPolicy.ts`

**Files:**
- Create: `src/server/admin/recoverStrandedBulkPolicy.ts`
- Test: `src/server/admin/__tests__/recoverStrandedBulkPolicy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/server/admin/__tests__/recoverStrandedBulkPolicy.test.ts
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { classifyMemberForRecovery } from "../recoverStrandedBulkPolicy";

// Minimal invoice factory — only the fields the classifier reads.
function inv(p: {
  id: string;
  status: Stripe.Invoice["status"];
  amount_due?: number;
  attempt_count?: number;
  next_payment_attempt?: number | null;
  periodEnd?: number; // lines.data[0].period.end
}): Stripe.Invoice {
  return {
    id: p.id,
    status: p.status,
    amount_due: p.amount_due ?? 4000,
    amount_remaining: p.amount_due ?? 4000,
    attempt_count: p.attempt_count ?? 0,
    next_payment_attempt: p.next_payment_attempt ?? null,
    lines: { data: p.periodEnd ? [{ period: { end: p.periodEnd, start: 0 } }] : [] },
  } as unknown as Stripe.Invoice;
}

const CURRENT_END = 1783813563; // current period end
const AMT = 4000;

function run() {
  // jessendan0 shape: 3 stale opens (exhausted) + 1 superseded draft + 1 current draft
  const r = classifyMemberForRecovery(
    [
      inv({ id: "open_feb", status: "open", attempt_count: 9, next_payment_attempt: null, periodEnd: 1770853563 }),
      inv({ id: "open_mar", status: "open", attempt_count: 9, next_payment_attempt: null, periodEnd: 1773272763 }),
      inv({ id: "open_apr", status: "open", attempt_count: 1, next_payment_attempt: null, periodEnd: 1778543163 }),
      inv({ id: "draft_may", status: "draft", periodEnd: 1781221563 }),
      inv({ id: "draft_jun", status: "draft", periodEnd: CURRENT_END }),
      inv({ id: "paid_jan", status: "paid", periodEnd: 1768175163 }),
    ],
    CURRENT_END,
    AMT
  );
  assert.equal(r.classification, "RECOVERABLE", "has a current draft + stale opens");
  assert.equal(r.currentDraft?.id, "draft_jun", "current draft = the one matching current period end");
  assert.deepEqual(r.staleOpens.map((i) => i.id).sort(), ["open_apr", "open_feb", "open_mar"], "all exhausted opens");
  assert.deepEqual(r.supersededDrafts.map((i) => i.id), ["draft_may"], "older draft superseded");

  // NOT_STRANDED: a still-chargeable current open invoice (Stripe is still retrying)
  const ns = classifyMemberForRecovery(
    [inv({ id: "open_now", status: "open", attempt_count: 1, next_payment_attempt: 9999999999, periodEnd: CURRENT_END })],
    CURRENT_END,
    AMT
  );
  assert.equal(ns.classification, "NOT_STRANDED", "still-retrying open → normal charger handles it");

  // BLOCKED_NO_DRAFT: stale opens but no current held draft
  const bl = classifyMemberForRecovery(
    [inv({ id: "open_old", status: "open", attempt_count: 9, next_payment_attempt: null, periodEnd: 1770853563 })],
    CURRENT_END,
    AMT
  );
  assert.equal(bl.classification, "BLOCKED_NO_DRAFT", "no current draft to pay");

  // NOT_STRANDED: nothing actionable (all paid)
  const clean = classifyMemberForRecovery([inv({ id: "p", status: "paid", periodEnd: CURRENT_END })], CURRENT_END, AMT);
  assert.equal(clean.classification, "NOT_STRANDED", "no stranded invoices");

  console.log("recoverStrandedBulkPolicy tests passed");
}
run();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx src/server/admin/__tests__/recoverStrandedBulkPolicy.test.ts`
Expected: FAIL — `classifyMemberForRecovery` is not a function / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/admin/recoverStrandedBulkPolicy.ts
/**
 * Pure classifier for bulk stranded-invoice recovery. No Stripe SDK / Mongo imports
 * (type-only), so it unit-tests without STRIPE_SECRET_KEY or a DB.
 *
 * A "stranded" member is past_due with a held DRAFT for the current cycle blocked
 * behind stale OPEN cycle invoices Stripe refuses ("no longer be paid"). See
 * docs/superpowers/specs/2026-06-16-bulk-stranded-recovery-design.md.
 */
import type Stripe from "stripe";
import { isOriginalInvoiceEligibleForRecovery } from "./recoverStrandedPastDuePolicy";

export type MemberRecoveryClassification = "RECOVERABLE" | "BLOCKED_NO_DRAFT" | "NOT_STRANDED";

export interface MemberRecoveryPlan {
  classification: MemberRecoveryClassification;
  /** The current-cycle held draft to finalize + pay (exactly one). */
  currentDraft: Stripe.Invoice | null;
  /** Open-but-exhausted cycle invoices to void (write off missed months). */
  staleOpens: Stripe.Invoice[];
  /** Older held drafts to delete (never paid). */
  supersededDrafts: Stripe.Invoice[];
}

/** Period end of an invoice (Basil: read the single subscription line's period). */
function invoicePeriodEnd(invoice: Stripe.Invoice): number | undefined {
  return invoice.lines?.data?.[0]?.period?.end;
}

/**
 * @param invoices       all invoices on the member's current subscription
 * @param currentPeriodEnd  subscription's current item period end (seconds)
 * @param expectedAmountCents  one cycle at the current package price
 */
export function classifyMemberForRecovery(
  invoices: Stripe.Invoice[],
  currentPeriodEnd: number,
  expectedAmountCents: number
): MemberRecoveryPlan {
  const drafts = invoices.filter((i) => i.status === "draft");
  const opens = invoices.filter((i) => i.status === "open");

  // The current cycle's held draft: a draft for the current period at the expected amount.
  const currentDraft =
    drafts.find((d) => invoicePeriodEnd(d) === currentPeriodEnd && d.amount_due === expectedAmountCents) ?? null;
  const supersededDrafts = drafts.filter((d) => d.id !== currentDraft?.id);

  // Opens split into "still chargeable" (Stripe still retrying) vs "exhausted" (dead).
  const staleOpens = opens.filter((o) => isOriginalInvoiceEligibleForRecovery(o).eligible);
  const chargeableOpens = opens.filter((o) => !isOriginalInvoiceEligibleForRecovery(o).eligible);

  // A still-chargeable open invoice means the NORMAL bulk charger handles them — not us.
  if (chargeableOpens.length > 0) {
    return { classification: "NOT_STRANDED", currentDraft: null, staleOpens: [], supersededDrafts: [] };
  }
  if (currentDraft) {
    return { classification: "RECOVERABLE", currentDraft, staleOpens, supersededDrafts };
  }
  if (staleOpens.length > 0) {
    return { classification: "BLOCKED_NO_DRAFT", currentDraft: null, staleOpens, supersededDrafts };
  }
  return { classification: "NOT_STRANDED", currentDraft: null, staleOpens: [], supersededDrafts };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx src/server/admin/__tests__/recoverStrandedBulkPolicy.test.ts`
Expected: PASS — `recoverStrandedBulkPolicy tests passed`.

- [ ] **Step 5: Add the npm script + commit**

Add to `package.json` scripts (after `test:subscription-period`):
```json
"test:recover-stranded-bulk": "tsx src/server/admin/__tests__/recoverStrandedBulkPolicy.test.ts",
```
```bash
git add src/server/admin/recoverStrandedBulkPolicy.ts src/server/admin/__tests__/recoverStrandedBulkPolicy.test.ts package.json
git commit -m "feat(admin): pure classifier for bulk stranded-invoice recovery"
```

---

### Task 2: `ChargeJobRun.kind` discriminator

**Files:**
- Modify: `src/models/ChargeJobRun.ts`

- [ ] **Step 1: Add the field to the interface + schema**

In `IChargeJobRun` (after `adminId`):
```ts
  kind: "charge" | "recover";
```
In `ChargeJobRunSchema` (after `adminId`):
```ts
    kind: { type: String, enum: ["charge", "recover"], required: true, default: "charge", index: true },
```

- [ ] **Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no new errors in `ChargeJobRun.ts` (existing `temp/` errors are excluded).

- [ ] **Step 3: Commit**

```bash
git add src/models/ChargeJobRun.ts
git commit -m "feat(admin): ChargeJobRun.kind discriminator (charge|recover)"
```

---

### Task 3: Detector + orchestrator `recoverStrandedBulk.ts`

**Files:**
- Create: `src/server/admin/recoverStrandedBulk.ts`

This file has two exports: `previewStrandedRecovery()` (read-only) and `runStrandedRecovery(...)` (destructive). Both share `scanStrandedMembers()`.

- [ ] **Step 1: Write the shared scanner + preview**

```ts
// src/server/admin/recoverStrandedBulk.ts
import mongoose from "mongoose";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import User from "@/models/User";
import ChargeJobLock from "@/models/ChargeJobLock";
import ChargeJobRun from "@/models/ChargeJobRun";
import { getPackageById } from "@/data/membershipPackages";
import { getSubscriptionPeriodEnd } from "@/utils/payment/stripe/subscription-period";
import {
  fetchCustomerWithRetry,
  payOpenInvoiceAsPastDueAdmin,
  resolveInvoicePaymentMethodId,
  type PastDueChargeResultRow,
} from "./chargePastDueShared";
import { buildRecoveryVoidIdempotencyKey, buildRecoveryFinalizeIdempotencyKey } from "./recoverStrandedPastDuePolicy";
import { classifyMemberForRecovery, type MemberRecoveryPlan } from "./recoverStrandedBulkPolicy";

type PastDueUserLean = {
  _id: mongoose.Types.ObjectId;
  email?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  subscription?: { status?: string | null; packageId?: string | null };
};

export interface StrandedPreviewRow {
  userId: string;
  email: string;
  customerId: string;
  subscriptionId: string;
  classification: MemberRecoveryPlan["classification"];
  currentDraftId: string | null;
  staleOpenIds: string[];
  supersededDraftIds: string[];
  amountCents: number;
}

export interface StrandedPreview {
  recoverable: StrandedPreviewRow[];
  blockedNoDraft: StrandedPreviewRow[];
  totals: { recoverable: number; blockedNoDraft: number; scanned: number; recoverableRevenueCents: number };
}

/** Read-only: scan past_due members and classify each. Rate-limited. */
async function scanStrandedMembers(): Promise<StrandedPreviewRow[]> {
  const users = await User.find({
    "subscription.status": "past_due",
    stripeSubscriptionId: { $exists: true, $ne: null },
    stripeCustomerId: { $exists: true, $ne: null },
  })
    .select("_id email stripeCustomerId stripeSubscriptionId subscription.status subscription.packageId")
    .lean<PastDueUserLean[]>();

  const rows: StrandedPreviewRow[] = [];
  const BATCH = 10;
  const DELAY = 250;
  for (let i = 0; i < users.length; i += BATCH) {
    const batch = users.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      batch.map(async (u): Promise<StrandedPreviewRow | null> => {
        if (!u.stripeSubscriptionId || !u.stripeCustomerId) return null;
        const pkg = u.subscription?.packageId ? getPackageById(u.subscription.packageId) : undefined;
        if (!pkg || typeof pkg.price !== "number") return null;
        const expected = Math.round(pkg.price * 100);

        const sub = await stripe.subscriptions.retrieve(u.stripeSubscriptionId);
        const currentPeriodEnd = getSubscriptionPeriodEnd(sub);
        if (typeof currentPeriodEnd !== "number") return null;

        const invoices = await stripe.invoices.list({ subscription: u.stripeSubscriptionId, limit: 100 });
        const plan = classifyMemberForRecovery(invoices.data, currentPeriodEnd, expected);
        if (plan.classification === "NOT_STRANDED") return null;

        return {
          userId: String(u._id),
          email: u.email ?? "",
          customerId: u.stripeCustomerId,
          subscriptionId: u.stripeSubscriptionId,
          classification: plan.classification,
          currentDraftId: plan.currentDraft?.id ?? null,
          staleOpenIds: plan.staleOpens.map((i) => i.id!).filter(Boolean),
          supersededDraftIds: plan.supersededDrafts.map((i) => i.id!).filter(Boolean),
          amountCents: expected,
        };
      })
    );
    for (const s of settled) if (s.status === "fulfilled" && s.value) rows.push(s.value);
    if (i + BATCH < users.length) await new Promise((r) => setTimeout(r, DELAY));
  }
  return rows;
}

export async function previewStrandedRecovery(): Promise<StrandedPreview> {
  const rows = await scanStrandedMembers();
  const recoverable = rows.filter((r) => r.classification === "RECOVERABLE");
  const blockedNoDraft = rows.filter((r) => r.classification === "BLOCKED_NO_DRAFT");
  return {
    recoverable,
    blockedNoDraft,
    totals: {
      recoverable: recoverable.length,
      blockedNoDraft: blockedNoDraft.length,
      scanned: rows.length,
      recoverableRevenueCents: recoverable.reduce((s, r) => s + r.amountCents, 0),
    },
  };
}
```

- [ ] **Step 2: Add the orchestrator `runStrandedRecovery` to the same file**

```ts
export interface RunStrandedRecoveryResult {
  chargeRunId: string;
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
  revenueCents: number;
  rows: Array<PastDueChargeResultRow & { subscriptionId: string }>;
}

const RECOVER_LOCK_ID = "charge-job-lock"; // SAME lock as bulk charge — they must not overlap.

/**
 * Recover up to `limit` stranded members. Destructive: voids stale opens, deletes
 * superseded drafts, finalizes + pays the current draft (one cycle). Double-charge
 * safety: a paid draft is no longer a draft, so a recovered member is gone from the
 * next scan; the pay uses Stripe idempotency `admin-charge-${draftId}`.
 */
export async function runStrandedRecovery(params: {
  adminId: string;
  limit: number;
  userIds?: string[];
}): Promise<RunStrandedRecoveryResult> {
  const { adminId, limit } = params;
  const adminObjId = new mongoose.Types.ObjectId(adminId);

  // 1. Acquire the global mutex atomically (same pattern as charge-past-due).
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + 30 * 60 * 1000);
  await ChargeJobLock.findOneAndUpdate(
    { _id: RECOVER_LOCK_ID, $or: [{ isLocked: { $ne: true } }, { lockedUntil: { $lte: now } }] },
    { $set: { isLocked: true, lockedUntil, lockedBy: adminObjId, lockedAt: now } },
    { new: true, upsert: true }
  ); // E11000 (lock held) bubbles to the route → 409

  const run = await ChargeJobRun.create({
    adminId: adminObjId,
    kind: "recover",
    startedAt: new Date(),
    status: "running",
    totals: { eligibleCount: 0 },
  });
  const chargeRunId = run._id as mongoose.Types.ObjectId;

  const rows: Array<PastDueChargeResultRow & { subscriptionId: string }> = [];
  let succeeded = 0,
    failed = 0,
    skipped = 0,
    revenueCents = 0;

  try {
    // 2. Re-scan LIVE (authoritative; never trust a stale preview before charging).
    let worklist = (await scanStrandedMembers()).filter((r) => r.classification === "RECOVERABLE");
    // Dedupe by userId (defensive) then apply optional allowlist + cap.
    const seen = new Set<string>();
    worklist = worklist.filter((r) => (seen.has(r.userId) ? false : (seen.add(r.userId), true)));
    if (params.userIds?.length) worklist = worklist.filter((r) => params.userIds!.includes(r.userId));
    worklist = worklist.slice(0, limit);

    await ChargeJobRun.updateOne({ _id: chargeRunId }, { $set: { "totals.eligibleCount": worklist.length } });

    for (const row of worklist) {
      try {
        // 3. Void stale opens (idempotency-keyed; tolerate already-void).
        for (const openId of row.staleOpenIds) {
          try {
            await stripe.invoices.voidInvoice(openId, undefined, { idempotencyKey: buildRecoveryVoidIdempotencyKey(openId) });
          } catch (e) {
            if (!(e instanceof Stripe.errors.StripeError && /already.*void|no longer/i.test(e.message))) throw e;
          }
        }
        // 4. Delete superseded drafts (best-effort).
        for (const draftId of row.supersededDraftIds) {
          try {
            await stripe.invoices.del(draftId);
          } catch (e) {
            console.error(`[recover-stranded] del draft ${draftId} failed:`, e);
          }
        }
        // 5. Finalize the current draft → open.
        if (!row.currentDraftId) {
          skipped++;
          rows.push({ invoiceId: "", customerId: row.customerId, userId: row.userId, userEmail: row.email, status: "skipped", skipReason: "no_current_draft", amount: row.amountCents, subscriptionId: row.subscriptionId });
          continue;
        }
        const finalized = await stripe.invoices.finalizeInvoice(
          row.currentDraftId,
          { expand: ["payment_intent"] },
          { idempotencyKey: buildRecoveryFinalizeIdempotencyKey(row.currentDraftId) }
        );
        // 6. Resolve payment method.
        const customer = await fetchCustomerWithRetry(row.customerId);
        const cws = customer as (Stripe.Customer & { invoice_settings?: { default_payment_method?: string | Stripe.PaymentMethod } }) | null;
        const dpm = cws?.invoice_settings?.default_payment_method;
        const customerDefaultPmId = typeof dpm === "string" ? dpm : dpm?.id ?? null;
        const paymentMethodId = resolveInvoicePaymentMethodId(finalized, customerDefaultPmId);
        if (!paymentMethodId) {
          skipped++;
          rows.push({ invoiceId: finalized.id ?? "", customerId: row.customerId, userId: row.userId, userEmail: row.email, status: "skipped", skipReason: "no_payment_method", amount: row.amountCents, subscriptionId: row.subscriptionId });
          continue;
        }
        // 7. Pay (idempotent: admin-charge-${finalizedId}). bypassRecentAttemptLock:true
        //    is REQUIRED — the recovery's own finalize log row would otherwise block it.
        const payRow = await payOpenInvoiceAsPastDueAdmin({
          invoice: finalized,
          paymentMethodId,
          customerId: row.customerId,
          user: { _id: new mongoose.Types.ObjectId(row.userId), email: row.email },
          adminId,
          chargeRunId,
          bypassRecentAttemptLock: true,
        });
        if (payRow.status === "success") {
          succeeded++;
          revenueCents += row.amountCents;
        } else if (payRow.status === "failed") failed++;
        else skipped++;
        rows.push({ ...payRow, subscriptionId: row.subscriptionId });
      } catch (memberErr) {
        failed++;
        rows.push({ invoiceId: row.currentDraftId ?? "", customerId: row.customerId, userId: row.userId, userEmail: row.email, status: "failed", error: memberErr instanceof Error ? memberErr.message : String(memberErr), amount: row.amountCents, subscriptionId: row.subscriptionId });
      }
      await new Promise((r) => setTimeout(r, 300)); // gentle rate-limit between members
    }

    await ChargeJobRun.updateOne(
      { _id: chargeRunId },
      { $set: { finishedAt: new Date(), status: "completed", totals: { eligibleCount: worklist.length, attempted: rows.length, succeeded, failed, skipped: { total: skipped, recentlyAttempted: 0, noLongerPastDue: 0, alreadyPaid: 0, missingPaymentMethod: 0, other: skipped }, revenueCents } } }
    );
  } catch (err) {
    await ChargeJobRun.updateOne({ _id: chargeRunId }, { $set: { finishedAt: new Date(), status: "failed", error: err instanceof Error ? err.message : String(err) } });
    throw err;
  } finally {
    await ChargeJobLock.findByIdAndUpdate(RECOVER_LOCK_ID, { isLocked: false });
  }

  return { chargeRunId: String(chargeRunId), attempted: rows.length, succeeded, failed, skipped, revenueCents, rows };
}
```

- [ ] **Step 3: Type-check + commit**

Run: `npx tsc --noEmit` — expected: no new errors in `recoverStrandedBulk.ts`.
```bash
git add src/server/admin/recoverStrandedBulk.ts
git commit -m "feat(admin): stranded-recovery detector + double-charge-safe orchestrator"
```

---

### Task 4: Endpoint `recover-stranded/route.ts`

**Files:**
- Create: `src/app/api/admin/invoices/recover-stranded/route.ts`

- [ ] **Step 1: Implement GET (preview) + POST (execute)**

```ts
import { NextRequest, NextResponse } from "next/server";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import connectDB from "@/lib/mongodb";
import { previewStrandedRecovery, runStrandedRecovery } from "@/server/admin/recoverStrandedBulk";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/** GET — read-only worklist + totals (no Stripe writes). */
export async function GET(request: NextRequest) {
  const guard = await requirePermissionWithAudit("users.view", request);
  if (guard instanceof NextResponse) return guard;
  try {
    await connectDB();
    const preview = await previewStrandedRecovery();
    return NextResponse.json({ success: true, preview });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Failed to build stranded preview", message: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

/** POST — destructive: void stale opens + finalize/pay current draft, capped. */
export async function POST(request: NextRequest) {
  const guard = await requirePermissionWithAudit("users.charge", request);
  if (guard instanceof NextResponse) return guard;
  const { session, log } = guard;
  try {
    await connectDB();
    const body = await request.json();
    if (body.confirmation !== "RECOVER") {
      return NextResponse.json({ error: "Invalid confirmation", message: 'You must type "RECOVER" to confirm this action.' }, { status: 400 });
    }
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(body.limit) || DEFAULT_LIMIT));
    const userIds = Array.isArray(body.userIds) ? body.userIds.map(String) : undefined;

    const result = await runStrandedRecovery({ adminId: session.user.id, limit, userIds });
    await log(200);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) {
      await log(409);
      return NextResponse.json({ error: "Operation in progress", message: "Another bulk charge/recover is running. Try again later." }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: "Recovery failed", message: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify lint + type-check**

Run: `npx eslint src/app/api/admin/invoices/recover-stranded/route.ts src/server/admin/recoverStrandedBulk.ts src/server/admin/recoverStrandedBulkPolicy.ts` → expected: clean.
Run: `npx tsc --noEmit` → expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/invoices/recover-stranded/route.ts
git commit -m "feat(admin): recover-stranded endpoint (GET preview, POST RECOVER-confirmed execute)"
```

---

### Task 5: Docs (admin domain) + BUSINESS.md + manifest

**Files:**
- Modify: `docs/admin/backend.md`, `docs/admin/api.md`, `BUSINESS.md`

- [ ] **Step 1: Document in `docs/admin/backend.md`** — add a "Bulk stranded-invoice recovery" subsection: what stranded means (past_due + stale open cycle invoices + current held draft), the void→finalize→pay sequence, current-cycle-only + cap 25 + typed `RECOVER`, and the double-charge guards (paid draft drops out of the scan; Stripe idempotency; ChargeJobLock shared with bulk charge). Reference `recoverStrandedBulk.ts` + `recoverStrandedBulkPolicy.ts`.

- [ ] **Step 2: Document in `docs/admin/api.md`** — add `GET/POST /api/admin/invoices/recover-stranded` (preview shape + POST body `{ confirmation:"RECOVER", limit, userIds? }` + result shape).

- [ ] **Step 3: Note in `BUSINESS.md`** — under the past-due recovery flow, add one line: admins can bulk-recover stranded members (void unpayable old invoices, charge the current cycle), capped per run. (Rule 5: admin tool guardrails / past-due recovery flow.)

- [ ] **Step 4: Commit**

```bash
git add docs/admin/backend.md docs/admin/api.md BUSINESS.md
git commit -m "docs(admin): document bulk stranded-invoice recovery + business note"
```

> Note: `src/app/api/admin/invoices/recover-stranded/**` and `src/server/admin/**` are already covered by the `admin` manifest domain — no manifest edit needed. This is a WRITE/action endpoint, so the read-only Norm gateway does NOT mirror it (no Norm change).

---

### Task 6 (final): Admin UI panel — endpoint-first, UI last

**Files:**
- Create: `src/components/admin/RecoverStrandedPanel.tsx`
- Modify: the existing charge-past-due admin page to render the panel.

- [ ] **Step 1: Build a panel** with a "Preview" button (`GET`) showing: # recoverable, # blocked-no-draft, total $; a table of recoverable rows (email, sub, amount, # opens to void); and a "Recover N" control (number input default 25, max 100) gated behind a typed `RECOVER` input. On submit → `POST` with `{ confirmation:"RECOVER", limit }`; render the returned per-member summary. Reuse existing admin table/modal styling from the charge-past-due page (match `ChargePastDueUserModal.tsx` patterns).

- [ ] **Step 2: Manual verification (staging/prod, read-only first)** — load the panel, click Preview, confirm the worklist matches the run-log "no longer be paid" cohort (~376). Do NOT execute yet.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/RecoverStrandedPanel.tsx <admin-page-file>
git commit -m "feat(admin): Recover Stranded panel (preview + capped RECOVER-confirmed execute)"
```

---

## Rollout (manual, after merge)

1. **Preview only** on prod (`GET`) — eyeball the recoverable count + total $.
2. Recover **one** member (jessendan0, via `userIds:["<id>"]`, `limit:1`) → verify on Stripe: stale opens voided, current draft paid, `pause_collection` cleared, subscription flips `active`, member no longer in the next preview. **Hold 24h.**
3. Batches of **25**, reviewing `ChargeJobRun(kind:"recover")` + `InvoiceChargeLog` between runs.

---

## Self-Review

- **Spec coverage:** detection (Task 3 `scanStrandedMembers`/preview), classification incl. open-exhausted + current-draft + no-draft (Task 1), void+delete+finalize+pay current cycle only (Task 3), cap 25 / typed RECOVER / ChargeJobLock / chargeRunId (Tasks 3–4), double-charge guards (Task 3 — paid-draft-drops-out, idempotency keys, dedup, lock; documented Task 5), out-of-scope card failures + no-draft (classified BLOCKED_NO_DRAFT, not actioned), tests (Task 1), UI (Task 6). ✅
- **Placeholder scan:** `<admin-page-file>` in Task 6 is the one intentional lookup (the engineer locates the existing charge-past-due admin page); everything else is concrete. No TBD/TODO in code.
- **Type consistency:** `classifyMemberForRecovery` / `MemberRecoveryPlan` / `StrandedPreviewRow` / `runStrandedRecovery` names match across Tasks 1, 3, 4. `payOpenInvoiceAsPastDueAdmin` params (`chargeRunId`, `bypassRecentAttemptLock`) match its real signature. `ChargeJobRun.kind` added in Task 2 is used in Task 3.
