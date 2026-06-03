# Past-Due Reanchor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a past-due/unpaid membership recovers, reanchor future renewals to the recovery-payment date (AEST), clamping days 25/26/27 → 24, via a single Stripe `trial_end` update in the recovery webhook.

**Architecture:** Pure, unit-tested date math in `anchor-billing.ts`; a pure trigger predicate in `pauseCollectionPolicy.ts`; one imperative orchestrator `reanchorAfterPastDueRecovery()` in `SubscriptionCollectionPauseService.ts` (atomic idempotency claim → `stripe.subscriptions.update({trial_end})` → write `endDate` → re-push Klaviyo → audit row); wired once into `handleInvoicePaymentSucceeded`. No inline-route edits (all five recovery channels converge on that webhook).

**Tech Stack:** Next.js 15 / TypeScript, Mongoose, Stripe (Basil `2025-05-28`), `date-fns-tz`, standalone `tsx` test scripts (no jest/vitest).

---

## ⚠️ Execution rules for this repo

- **No auto-commit (CLAUDE.md §1).** Commit steps below are written for TDD discipline, but **do not run `git commit` unless DJ has authorized commits this session.** If unauthorized, treat each "Commit" step as a review checkpoint and pause.
- **Doc-sync Stop hook (CLAUDE.md §2).** Editing `src/**` requires updating the matching `docs/<domain>/` in the **same task**. This plan front-loads code but Phase 4 must land before the session ends or the Stop hook will block. Domains touched: `subscription`, `billing-stripe`, `tracking`.
- **Phase 3 is gated** on the Stripe test-mode probe (Task 7). Do not flip behavior before the probe passes.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/utils/billing/anchor-billing.ts` | Pure date math: clamp + next-occurrence trial_end + days-in-month | Modify |
| `src/utils/billing/__tests__/anchor-billing.test.ts` | Unit tests for the date math (also fixes the currently-broken `npm test`) | Create |
| `src/services/subscription/pauseCollectionPolicy.ts` | Pure `shouldReanchorAfterRecovery` trigger predicate | Modify |
| `src/services/subscription/__tests__/reanchor-gate.test.ts` | Unit tests for the predicate | Create |
| `src/models/User.ts` | `subscription.lastReanchoredInvoiceId` idempotency marker | Modify |
| `src/services/subscription/SubscriptionCollectionPauseService.ts` | `reanchorAfterPastDueRecovery()` orchestrator | Modify |
| `src/services/stripe-webhook-handlers/index.ts` | Capture pause flag pre-resume; call gate + reanchor | Modify |
| `package.json` | `test:reanchor-gate` script | Modify |
| `docs/PAST_DUE_REANCHOR.md` + domain/business docs | Documentation | Create/Modify |
| `scripts/probe-reanchor-trial-end.ts` (optional) | Test-mode Stripe behavior probe | Create |

---

# Phase 1 — Date math + tests (no behavior change)

### Task 1: Add the reanchor date helpers to `anchor-billing.ts`

**Files:**
- Test: `src/utils/billing/__tests__/anchor-billing.test.ts` (Create)
- Modify: `src/utils/billing/anchor-billing.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/utils/billing/__tests__/anchor-billing.test.ts`:

```ts
import assert from "node:assert/strict";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  ANCHOR_DAY_OF_MONTH,
  clampReanchorDay,
  daysInMonthUTC,
  getReanchorTrialEndTimestamp,
} from "../anchor-billing";

const AEST = "Australia/Sydney";

/** AEST wall-clock of a trial_end (unix seconds), e.g. "2026-06-10 00:00". */
function aestWall(ts: number): string {
  return formatInTimeZone(new Date(ts * 1000), AEST, "yyyy-MM-dd HH:mm");
}
/** Build a UTC Date from an AEST wall-clock string like "2026-05-10 09:30". */
function aest(wall: string): Date {
  return fromZonedTime(wall.replace(" ", "T") + ":00", AEST);
}

function testClamp() {
  assert.equal(clampReanchorDay(aest("2026-05-25 12:00")), ANCHOR_DAY_OF_MONTH); // 24
  assert.equal(clampReanchorDay(aest("2026-05-26 12:00")), 24);
  assert.equal(clampReanchorDay(aest("2026-05-27 12:00")), 24);
  assert.equal(clampReanchorDay(aest("2026-05-24 12:00")), 24);
  assert.equal(clampReanchorDay(aest("2026-05-23 12:00")), 23);
  assert.equal(clampReanchorDay(aest("2026-05-28 12:00")), 28);
  assert.equal(clampReanchorDay(aest("2026-05-01 12:00")), 1);
}

function testDaysInMonth() {
  assert.equal(daysInMonthUTC(2026, 2), 28); // Feb non-leap
  assert.equal(daysInMonthUTC(2028, 2), 29); // Feb leap
  assert.equal(daysInMonthUTC(2026, 4), 30); // Apr
  assert.equal(daysInMonthUTC(2026, 12), 31); // Dec
  assert.equal(daysInMonthUTC(2026, 1), 31); // Jan
}

function testNextOccurrenceAndSameDayRoll() {
  // Recovery same-day after midnight -> rolls to next month (instant comparison).
  assert.equal(aestWall(getReanchorTrialEndTimestamp(aest("2026-05-10 09:30"))), "2026-06-10 00:00");
  // Exact midnight also rolls forward (<= comparison).
  assert.equal(aestWall(getReanchorTrialEndTimestamp(aest("2026-05-01 00:00"))), "2026-06-01 00:00");
  // Clamp 26 -> 24, next 24th.
  assert.equal(aestWall(getReanchorTrialEndTimestamp(aest("2026-05-26 09:00"))), "2026-06-24 00:00");
}

function testShortMonths() {
  // Kept day 30 -> Feb 28 (non-leap).
  assert.equal(aestWall(getReanchorTrialEndTimestamp(aest("2026-01-30 12:00"))), "2026-02-28 00:00");
  // Kept day 31 -> Feb 29 (leap 2028).
  assert.equal(aestWall(getReanchorTrialEndTimestamp(aest("2028-01-31 12:00"))), "2028-02-29 00:00");
}

function testYearRollover() {
  // Clamp 26 -> 24 in Jan of next year.
  assert.equal(aestWall(getReanchorTrialEndTimestamp(aest("2026-12-26 10:00"))), "2027-01-24 00:00");
  // Kept day 31 -> Jan 31 next year.
  assert.equal(aestWall(getReanchorTrialEndTimestamp(aest("2026-12-31 10:00"))), "2027-01-31 00:00");
}

function testDstBoundaries() {
  // AEST->AEDT (Oct): target lands in Nov (AEDT). Wall-clock midnight must hold.
  assert.equal(aestWall(getReanchorTrialEndTimestamp(aest("2026-10-02 10:00"))), "2026-11-02 00:00");
  // AEDT->AEST (Apr): target lands in May (AEST).
  assert.equal(aestWall(getReanchorTrialEndTimestamp(aest("2026-04-03 10:00"))), "2026-05-03 00:00");
}

function testInvariants() {
  const recoveries = ["2026-02-15 23:59", "2026-07-24 00:01", "2026-09-29 12:00", "2026-11-30 18:00"];
  for (const w of recoveries) {
    const r = aest(w);
    const ts = getReanchorTrialEndTimestamp(r);
    assert.ok(Number.isFinite(ts), `finite for ${w}`);
    assert.ok(ts > Math.floor(r.getTime() / 1000), `strictly future for ${w}`);
    assert.match(aestWall(ts), /\d{4}-\d{2}-\d{2} 00:00/, `midnight AEST for ${w}`);
  }
}

function testInvalidInputThrows() {
  assert.throws(() => getReanchorTrialEndTimestamp(new Date(NaN)));
  assert.throws(() => getReanchorTrialEndTimestamp(new Date(0))); // epoch-0 guard
}

function run() {
  testClamp();
  testDaysInMonth();
  testNextOccurrenceAndSameDayRoll();
  testShortMonths();
  testYearRollover();
  testDstBoundaries();
  testInvariants();
  testInvalidInputThrows();
  console.log("anchor-billing tests passed");
}

run();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:anchor-billing`
Expected: FAIL — `clampReanchorDay` / `daysInMonthUTC` / `getReanchorTrialEndTimestamp` are not exported from `../anchor-billing`.

- [ ] **Step 3: Implement the helpers in `anchor-billing.ts`**

In `src/utils/billing/anchor-billing.ts`, bump the version constant:

```ts
/** Version for audits and support; bump when the rule or params change. */
export const BILLING_ANCHOR_RULE_VERSION = 2;
```

Then append these exports to the end of the file (it already imports `formatInTimeZone` and `createAESTDateAsUTC`, and defines `AEST_TIMEZONE`):

```ts
/** Leap-safe number of days in a 1-12 month (UTC). The single canonical days-in-month helper. */
export function daysInMonthUTC(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/**
 * Clamp a recovery-landing day to the anchor window: AEST 25/26/27 -> 24, else the day itself.
 * Only ever lowers or keeps the day, never raises it.
 */
export function clampReanchorDay(date: Date): number {
  const day = getCalendarDayInAEST(date);
  return (ANCHOR_JOIN_DAYS as readonly number[]).includes(day) ? ANCHOR_DAY_OF_MONTH : day;
}

/**
 * Unix seconds (for Stripe `trial_end`) of the clamped recovery day at midnight AEST, at the NEXT
 * occurrence STRICTLY AFTER recoveryDate (instant comparison, not day-integer). Short months use the
 * last day (e.g. kept 31 -> Feb 28/29). `createAESTDateAsUTC` does NOT clamp overflow days (returns
 * Invalid Date), so the Math.min(clampedDay, lastDay) step is mandatory. Throws on invalid input;
 * the caller aborts the reanchor non-fatally.
 */
export function getReanchorTrialEndTimestamp(recoveryDate: Date): number {
  if (!Number.isFinite(recoveryDate.getTime()) || recoveryDate.getTime() <= 0) {
    throw new Error("getReanchorTrialEndTimestamp: invalid recoveryDate");
  }
  const recoveryUnix = Math.floor(recoveryDate.getTime() / 1000);
  const clampedDay = clampReanchorDay(recoveryDate);
  let year = parseInt(formatInTimeZone(recoveryDate, AEST_TIMEZONE, "yyyy"), 10);
  let month = parseInt(formatInTimeZone(recoveryDate, AEST_TIMEZONE, "M"), 10); // 1-12

  const build = (y: number, m: number): Date => {
    const billDay = Math.min(clampedDay, daysInMonthUTC(y, m));
    const dt = createAESTDateAsUTC(y, m, billDay, 0, 0);
    if (Number.isNaN(dt.getTime())) {
      throw new Error(`getReanchorTrialEndTimestamp: invalid date ${y}-${m}-${billDay}`);
    }
    return dt;
  };

  let candidate = build(year, month);
  while (Math.floor(candidate.getTime() / 1000) <= recoveryUnix) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    candidate = build(year, month);
  }
  return Math.floor(candidate.getTime() / 1000);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:anchor-billing`
Expected: PASS — `anchor-billing tests passed`. (This also un-breaks `npm test`.)

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: no new errors.

- [ ] **Step 6: Commit** *(only if authorized — see Execution rules)*

```bash
git add src/utils/billing/anchor-billing.ts src/utils/billing/__tests__/anchor-billing.test.ts
git commit -m "feat(billing): add past-due reanchor date helpers + fix missing anchor-billing test"
```

---

# Phase 2 — Trigger predicate, model field, orchestrator

### Task 2: Add the `shouldReanchorAfterRecovery` predicate

**Files:**
- Test: `src/services/subscription/__tests__/reanchor-gate.test.ts` (Create)
- Modify: `src/services/subscription/pauseCollectionPolicy.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create `src/services/subscription/__tests__/reanchor-gate.test.ts`:

```ts
import assert from "node:assert/strict";
import { shouldReanchorAfterRecovery, type ReanchorGateInput } from "../pauseCollectionPolicy";

const base: ReanchorGateInput = {
  billingReason: "subscription_cycle",
  invoiceIsPaid: true,
  previousSubscriptionDbStatus: "past_due",
  pauseCollectionPresentAtPayment: true,
  invoiceAttemptCount: 2,
  pauseReason: undefined,
  cancelAtPeriodEnd: false,
  autoRenew: true,
  alreadyReanchoredInvoiceId: undefined,
  invoiceId: "in_123",
};

function t(over: Partial<ReanchorGateInput>): boolean {
  return shouldReanchorAfterRecovery({ ...base, ...over });
}

function run() {
  assert.equal(t({}), true, "happy past_due path");
  assert.equal(t({ billingReason: "subscription_create" }), false, "non-cycle excluded");
  assert.equal(t({ invoiceIsPaid: false }), false, "unpaid excluded");
  assert.equal(t({ cancelAtPeriodEnd: true }), false, "cancel-at-period-end excluded");
  assert.equal(t({ autoRenew: false }), false, "autoRenew off excluded");
  assert.equal(t({ pauseReason: "retention" }), false, "retention pause excluded");
  assert.equal(t({ alreadyReanchoredInvoiceId: "in_123" }), false, "already reanchored excluded");
  assert.equal(t({ previousSubscriptionDbStatus: "unpaid" }), true, "unpaid recovers");
  // renew-subscription channel: DB pre-flipped to active AND pause cleared -> survives via attempt_count.
  assert.equal(
    t({ previousSubscriptionDbStatus: "active", pauseCollectionPresentAtPayment: false, invoiceAttemptCount: 2 }),
    true,
    "renew-subscription pre-flip caught by attempt_count"
  );
  // normal on-time renewal: never past_due, pause clear, first attempt -> no reanchor.
  assert.equal(
    t({ previousSubscriptionDbStatus: "active", pauseCollectionPresentAtPayment: false, invoiceAttemptCount: 1 }),
    false,
    "normal on-time renewal excluded"
  );
  // dunning via pause only.
  assert.equal(
    t({ previousSubscriptionDbStatus: "active", pauseCollectionPresentAtPayment: true, invoiceAttemptCount: undefined }),
    true,
    "pause_collection arm"
  );
  console.log("reanchor-gate tests passed");
}

run();
```

- [ ] **Step 2: Add the test script to `package.json`**

Under the other `test:*` entries (after `"test:anchor-billing"`), add:

```json
    "test:reanchor-gate": "tsx src/services/subscription/__tests__/reanchor-gate.test.ts",
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:reanchor-gate`
Expected: FAIL — `shouldReanchorAfterRecovery` not exported.

- [ ] **Step 4: Implement the predicate in `pauseCollectionPolicy.ts`**

Append to `src/services/subscription/pauseCollectionPolicy.ts`:

```ts
/** Inputs for the past-due reanchor trigger decision. Pure — no Stripe client. */
export interface ReanchorGateInput {
  billingReason: string | undefined;
  invoiceIsPaid: boolean;
  previousSubscriptionDbStatus: string | undefined;
  /** `subscription.pause_collection != null`, captured BEFORE resume clears it. */
  pauseCollectionPresentAtPayment: boolean;
  /** `invoice.attempt_count` — durable Stripe fact; > 1 means the cycle invoice already failed. */
  invoiceAttemptCount: number | undefined;
  /** `subscription.metadata.pauseReason` — a "retention" pause is never a dunning recovery. */
  pauseReason: string | undefined;
  cancelAtPeriodEnd: boolean;
  autoRenew: boolean | undefined;
  /** `user.subscription.lastReanchoredInvoiceId` — cheap pre-filter (atomic claim is authoritative). */
  alreadyReanchoredInvoiceId: string | undefined;
  invoiceId: string;
}

/**
 * Whether a paid subscription_cycle invoice represents a past-due/unpaid RECOVERY that should
 * reanchor future renewals. Dunning is detected via ANY durable signal because no single signal
 * survives every recovery channel (the renew-subscription retry pre-flips DB status to active AND
 * clears pause_collection before the webhook — only `attempt_count > 1` catches it).
 */
export function shouldReanchorAfterRecovery(i: ReanchorGateInput): boolean {
  if (i.billingReason !== "subscription_cycle") return false;
  if (!i.invoiceIsPaid) return false;
  if (i.cancelAtPeriodEnd === true) return false; // member is ending — do not extend
  if (i.autoRenew === false) return false;
  if (i.pauseReason === "retention") return false;
  if (i.alreadyReanchoredInvoiceId === i.invoiceId) return false;

  const prev = (i.previousSubscriptionDbStatus ?? "").toLowerCase();
  return (
    prev === "past_due" ||
    prev === "unpaid" ||
    i.pauseCollectionPresentAtPayment ||
    (typeof i.invoiceAttemptCount === "number" && i.invoiceAttemptCount > 1)
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:reanchor-gate`
Expected: PASS — `reanchor-gate tests passed`.

- [ ] **Step 6: Commit** *(if authorized)*

```bash
git add src/services/subscription/pauseCollectionPolicy.ts src/services/subscription/__tests__/reanchor-gate.test.ts package.json
git commit -m "feat(subscription): add past-due reanchor trigger predicate"
```

---

### Task 3: Add the `lastReanchoredInvoiceId` idempotency marker to the User model

**Files:**
- Modify: `src/models/User.ts` (interface ~line 35 and schema ~line 475)

- [ ] **Step 1: Add the interface field**

In `src/models/User.ts`, inside the `subscription?: { … }` interface, immediately after the `pastDueAt?: Date;` line:

```ts
    /** Set when subscription first enters past_due (failed renewal); used for admin activity log */
    pastDueAt?: Date;
    /** Stripe invoice id of the last past-due recovery we reanchored for (idempotency marker). */
    lastReanchoredInvoiceId?: string;
```

- [ ] **Step 2: Add the schema field**

In the same file, inside the subscription schema definition, immediately after the `pastDueAt` schema block:

```ts
      pastDueAt: {
        type: Date,
        required: false,
      },
      lastReanchoredInvoiceId: {
        type: String,
        required: false,
      },
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: no new errors.

- [ ] **Step 4: Commit** *(if authorized)*

```bash
git add src/models/User.ts
git commit -m "feat(subscription): add lastReanchoredInvoiceId idempotency marker"
```

---

### Task 4: Add the `reanchorAfterPastDueRecovery()` orchestrator

**Files:**
- Modify: `src/services/subscription/SubscriptionCollectionPauseService.ts`

- [ ] **Step 1: Add imports and the orchestrator**

At the top of `src/services/subscription/SubscriptionCollectionPauseService.ts`, after `import { stripe } from "@/lib/stripe";`, add:

```ts
import type mongoose from "mongoose";
import User from "@/models/User";
import {
  clampReanchorDay,
  getCalendarDayInAEST,
  getReanchorTrialEndTimestamp,
} from "@/utils/billing/anchor-billing";
import { ensureUserProfileSynced } from "@/utils/integrations/klaviyo/klaviyo-profile-sync";
import { appendMembershipStatusHistory } from "@/services/admin/membershipAnalyticsPersistence";
```

Then append the orchestrator at the end of the file:

```ts
/**
 * Reanchor a recovered past-due/unpaid subscription's future renewals to the recovery-payment date.
 *
 * Idempotent via an atomic claim on `subscription.lastReanchoredInvoiceId`. Moves the Stripe billing
 * anchor with `trial_end` + `proration_behavior:'none'` (NO new charge), writes `endDate` from the
 * SAME computed `trial_end` (do not read it back — it can lag), re-pushes the Klaviyo profile, and
 * records an invoice-keyed audit row. Fully non-fatal: recovery already succeeded.
 */
export async function reanchorAfterPastDueRecovery(params: {
  subscriptionId: string;
  userId: mongoose.Types.ObjectId;
  recoveryDate: Date;
  invoiceId: string;
  packageId?: string | null;
}): Promise<{ reanchored: boolean }> {
  const { subscriptionId, userId, recoveryDate, invoiceId, packageId } = params;
  try {
    // 1. Atomic idempotency claim — only the first delivery for this invoice proceeds.
    const claimed = await User.findOneAndUpdate(
      { _id: userId, "subscription.lastReanchoredInvoiceId": { $ne: invoiceId } },
      { $set: { "subscription.lastReanchoredInvoiceId": invoiceId } },
      { new: true }
    );
    if (!claimed) return { reanchored: false };
    const oldEndDate = claimed.subscription?.endDate ?? null;

    // 2. Compute the clamped trial_end; abort non-fatally on bad math or a non-future result.
    let trialEndSeconds: number;
    try {
      trialEndSeconds = getReanchorTrialEndTimestamp(recoveryDate);
    } catch (mathErr) {
      console.error(`[reanchor] date math failed sub=${subscriptionId} invoice=${invoiceId}:`, mathErr);
      return { reanchored: false };
    }
    if (trialEndSeconds <= Math.floor(Date.now() / 1000)) {
      console.error(`[reanchor] computed trial_end not in the future sub=${subscriptionId}; aborting`);
      return { reanchored: false };
    }

    // 3. Move the Stripe billing anchor. proration_behavior:'none' => no immediate re-charge.
    await stripe.subscriptions.update(subscriptionId, {
      trial_end: trialEndSeconds,
      proration_behavior: "none",
      metadata: { billing_anchor_rule: "past_due_reanchor" },
    });

    // 4. Mirror endDate from the SAME trial_end we just set (never read it back — Stripe can lag).
    const newEndDate = new Date(trialEndSeconds * 1000);
    const updated = await User.findByIdAndUpdate(
      userId,
      { $set: { "subscription.endDate": newEndDate } },
      { new: true }
    );

    // 5. Re-push Klaviyo so next_renewal_date / subscription_end_date / past_due_renewal_entries refresh.
    if (updated) ensureUserProfileSynced(updated);

    // 6. Audit (invoice-keyed dedupeKey => exactly once even on a dashboard resend).
    await appendMembershipStatusHistory({
      userId,
      effectiveAt: recoveryDate,
      membershipStatus: "trialing",
      actor: "system",
      source: "webhook_past_due_reanchor",
      dedupeKey: `past_due_reanchor_${userId.toString()}_${invoiceId}`,
      subscriptionPackageId: packageId ?? undefined,
      endDate: newEndDate,
      metadata: {
        invoiceId,
        oldEndDate,
        newEndDate,
        oldAnchorDay: oldEndDate ? getCalendarDayInAEST(oldEndDate) : null,
        newAnchorDay: getCalendarDayInAEST(newEndDate),
        recoveryDay: getCalendarDayInAEST(recoveryDate),
        clampedDay: clampReanchorDay(recoveryDate),
      },
    });

    return { reanchored: true };
  } catch (err) {
    console.error(`[reanchor] non-fatal failure sub=${subscriptionId} invoice=${invoiceId}:`, err);
    return { reanchored: false };
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: no new errors. (If `User` is a default export mismatch, confirm `import User from "@/models/User"` matches the existing import style used elsewhere — it does in `membershipAnalyticsPersistence.ts`.)

- [ ] **Step 3: Commit** *(if authorized)*

```bash
git add src/services/subscription/SubscriptionCollectionPauseService.ts
git commit -m "feat(subscription): add reanchorAfterPastDueRecovery orchestrator"
```

---

# Phase 3 — Webhook wiring (behavior flip — GATED on Task 7 probe)

### Task 5: Wire the reanchor into `handleInvoicePaymentSucceeded`

**Files:**
- Modify: `src/services/stripe-webhook-handlers/index.ts` (around the existing pause-clear block at ~3429-3449)

- [ ] **Step 1: Confirm/add imports**

In `src/services/stripe-webhook-handlers/index.ts`, ensure these are imported (grep first; add what's missing):
- `paidAtDateFromStripeInvoice` from `@/utils/affiliate/affiliate-recurring-invoice` (used elsewhere; confirm at top of file).
- `shouldReanchorAfterRecovery` from `@/services/subscription/pauseCollectionPolicy` (the file already imports `decideClearPause` from there — add to that import).
- `reanchorAfterPastDueRecovery` from `@/services/subscription/SubscriptionCollectionPauseService` (the file already imports `resumeAfterSuccessfulRenewalPayment` from there — add to that import).

- [ ] **Step 2: Capture the pause flag BEFORE resume clears it**

Find the block that computes `invoiceIsPaid` (~line 3428-3429):

```ts
    const invoiceAmountPaid = expandedInvoice.amount_paid ?? 0;
    const invoiceIsPaid = expandedInvoice.status === "paid" && invoiceAmountPaid > 0;
```

Immediately after it, add the pre-resume snapshot:

```ts
    // Snapshot pause_collection BEFORE resumeAfterSuccessfulRenewalPayment clears it in Stripe.
    // The local `subscription` object is not mutated by resume, but capture explicitly for clarity.
    const pauseCollectionPresentAtPayment = subscription.pause_collection != null;
```

- [ ] **Step 3: Add the reanchor call AFTER the existing pause-clear block**

Find the end of the pause-clear block (the closing `}` of `if (invoiceIsPaid) { … decideClearPause … }` at ~line 3449). Immediately after it, add:

```ts
    // --- Past-due reanchor: move future renewals to the recovery-payment date ---
    if (invoiceIsPaid && expandedInvoice.id) {
      const reanchorGate = shouldReanchorAfterRecovery({
        billingReason: expandedInvoice.billing_reason ?? undefined,
        invoiceIsPaid,
        previousSubscriptionDbStatus: previousSubscriptionDbStatus ?? undefined,
        pauseCollectionPresentAtPayment,
        invoiceAttemptCount: expandedInvoice.attempt_count ?? undefined,
        pauseReason: (subscription.metadata?.pauseReason as string | undefined) ?? undefined,
        cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
        autoRenew: user.subscription?.autoRenew,
        alreadyReanchoredInvoiceId: user.subscription?.lastReanchoredInvoiceId,
        invoiceId: expandedInvoice.id,
      });
      if (reanchorGate) {
        const recoveryDate = paidAtDateFromStripeInvoice(expandedInvoice) ?? new Date();
        const result = await reanchorAfterPastDueRecovery({
          subscriptionId: subscription.id,
          userId: user._id,
          recoveryDate,
          invoiceId: expandedInvoice.id,
          packageId: user.subscription?.packageId ?? undefined,
        });
        if (result.reanchored) {
          webhookLog("info", `Reanchored subscription ${subscription.id} after past-due recovery (invoice ${expandedInvoice.id})`);
        }
      }
    }
```

> Note: `paidAtDateFromStripeInvoice` returns a `Date` derived from `status_transitions.paid_at` (unix seconds). Confirm its signature/return when adding the import; if it returns `Date | null`, the `?? new Date()` fallback above handles null.

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: no new errors.

- [ ] **Step 5: Re-run unit suites (no regressions)**

Run: `npm run test:anchor-billing` then `npm run test:reanchor-gate`
Expected: both PASS.

- [ ] **Step 6: Commit** *(if authorized)*

```bash
git add src/services/stripe-webhook-handlers/index.ts
git commit -m "feat(billing): reanchor renewals on past-due recovery in invoice.payment_succeeded"
```

---

### Task 6 (optional, defense-in-depth): Close the active/trialing Klaviyo re-push gap

The reanchor orchestrator already re-pushes Klaviyo. This task additionally fixes a pre-existing gap where a recovery that lands purely via `customer.subscription.updated` (active/trialing) syncs `endDate` but does not re-push Klaviyo. **Include only if DJ wants the broader fix** (it is outside the strict reanchor path).

**Files:** `src/services/stripe-webhook-handlers/index.ts` (the active/trialing branches at ~2151-2160 and the fast-path ~2063-2065).

- [ ] **Step 1:** After the `endDate` sync in the matched-id else branch (~2151-2160), where the past_due/unpaid branch calls `ensureUserProfileSynced` (~2199-2204), add a mirrored `ensureUserProfileSynced(user)` for the active/trialing recovery case. Match the existing call's argument shape exactly.
- [ ] **Step 2:** `npm run type-check` → no new errors.
- [ ] **Step 3:** Commit *(if authorized)*: `fix(tracking): re-push Klaviyo profile on active/trialing recovery`

---

### Task 7: Stripe test-mode probe (PRE-MERGE GATE for Phase 3)

Settle the three doc-unverifiable Stripe behaviors before the behavior flip ships (spec §9). This is a **manual procedure** (optionally scripted). Run against **test mode** with a real test subscription.

- [ ] **Step 1:** In Stripe test mode, create a monthly subscription; let its renewal invoice fail (test card `4000 0000 0000 0341` / `0002`) so the sub becomes `past_due` and the app sets `pause_collection`.
- [ ] **Step 2:** Recover it (pay the open invoice). Then call:

```ts
await stripe.subscriptions.update(subId, { trial_end: <future unix>, proration_behavior: "none" });
```

- [ ] **Step 3: Verify and record results:**
  - No NEW invoice is created and the recovery invoice stays `paid` (no proration/charge). ✅ required.
  - `stripe.subscriptions.retrieve(subId)` reports `status === "trialing"` and `items.data[0].current_period_end === trial_end`. ✅ required.
  - If the sub still had `pause_collection`, confirm whether `trial_end` applied or pause must be cleared first; adjust ordering (our flow clears pause at ~3440 before reanchor, so this should be clean). ✅ confirm.
  - Confirm `invoice.attempt_count > 1` on a recovered renewal for each of the 5 channels.

- [ ] **Step 4:** If any check fails, STOP and revisit the mechanism (e.g. add explicit pause-clear in the reanchor update, or switch the third gate arm to invoice/PI metadata `dunning_recovery:1`). Record outcomes in `docs/PAST_DUE_REANCHOR.md`.

---

# Phase 4 — Documentation + Definition of Done

### Task 8: Documentation (doc-sync + business docs)

**Files:** Create `docs/PAST_DUE_REANCHOR.md`; update domain + business docs.

- [ ] **Step 1: Create `docs/PAST_DUE_REANCHOR.md`** — canonical write-up: the rule (reanchor to recovery date, clamp 25/26/27→24), the single-hook location, the gate (3 durable dunning arms + cancel/autoRenew/retention exclusions), `trial_end` mechanism + future-floor, atomic idempotency marker, endDate-from-trial_end, Klaviyo re-push, audit (`dedupeKey`, metadata `billing_anchor_rule:'past_due_reanchor'`, `BILLING_ANCHOR_RULE_VERSION`), the two probe-verified Stripe behaviors, and the propagation map (auto-correct vs Klaviyo MUST-RESYNC). Link the spec.
- [ ] **Step 2: `docs/subscription/`** — `rules.md` (add recovery-reanchor rule; re-scope the join rule to "NEW joiners 25/26/27 → 24"), `architecture.md` (reanchor step in the pause-collection recovery lifecycle), `models.md` (note `User.subscription.lastReanchoredInvoiceId`), `gotchas.md` (`createAESTDateAsUTC` returns NaN on overflow; Stripe doesn't reject past `trial_end`).
- [ ] **Step 3: `docs/billing-stripe/`** — `architecture.md` / `backend.md`: reanchor hook in `handleInvoicePaymentSucceeded`, `trial_end` (not `billing_cycle_anchor`), future-floor, atomic marker.
- [ ] **Step 4: `docs/tracking/KLAVIYO_INTEGRATION.md`** — reanchor must re-push the profile (`next_renewal_date`/`subscription_end_date`/`past_due_renewal_entries` are static pushed properties).
- [ ] **Step 5: Root docs** — `docs/STRIPE_COLLECTION_PAUSE_RECOVERY.md` (recovery now also reanchors), `docs/CHARGE_PAST_DUE_CUSTOMERS.md` + `docs/FAILED_RENEWAL_PAY_NOW.md` (recovery reanchors, clamped), `docs/BILLING_ANCHOR_24.md` (second anchor-move trigger).
- [ ] **Step 6: `BUSINESS.md` §9 + `README.md`** (CLAUDE.md §5 trigger: past-due recovery flow changed) — describe reanchor-to-recovery-date; add `docs/PAST_DUE_REANCHOR.md` to the §9 source-of-truth list; reword README anchor/Past-Due bullets so they don't imply a permanently static anchor.
- [ ] **Step 7: Flag (do not edit) `src/app/(site)/terms/page.tsx` §4** to DJ for legal/product review of the customer-facing renewal-date wording.

- [ ] **Step 8: Definition of Done**

Run and confirm green:
```bash
npm run lint
npm run type-check
npm run test:anchor-billing
npm run test:reanchor-gate
```
Then run the manual-QA matrix from spec §7 (force a past_due sub; recover via each of the 5 channels; confirm exactly one reanchor fires; `endDate` + Klaviyo `next_renewal_date` correct for a **non-affiliate** member; cancel-at-period-end-during-dunning does NOT reanchor).

- [ ] **Step 9: Commit** *(if authorized)*

```bash
git add docs BUSINESS.md README.md
git commit -m "docs(subscription,billing-stripe,tracking): document past-due reanchor"
```

---

## Self-Review (completed during authoring)

- **Spec coverage:** §4.1 single hook → Task 5. §4.2 gate (3 arms + exclusions) → Task 2. §4.3 mechanism + future-floor → Tasks 1, 4. §4.4 date math → Task 1. §4.5 atomic marker → Tasks 3, 4. §4.6 endDate-from-trial_end → Task 4. §4.8 audit dedupe → Task 4. §4.9 Klaviyo re-push → Task 4 (+ optional Task 6). §5/§6 propagation/blast-radius → docs (Task 8). §7 tests → Tasks 1, 2, 8. §9 probe → Task 7. §10 phases → this structure. ✅ no gaps.
- **Placeholder scan:** every code step contains complete code; no TBD/TODO. ✅
- **Type consistency:** `ReanchorGateInput` fields match between predicate (Task 2), webhook call (Task 5). `reanchorAfterPastDueRecovery` params match between definition (Task 4) and call site (Task 5). Helper names (`clampReanchorDay`, `daysInMonthUTC`, `getReanchorTrialEndTimestamp`) consistent across Tasks 1/4. ✅
