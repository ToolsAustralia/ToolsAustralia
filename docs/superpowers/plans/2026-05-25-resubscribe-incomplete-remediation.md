# Resubscribe / Abandoned-Incomplete Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Commit policy (CLAUDE.md hard rule #1):** Do NOT run `git commit`/`git add`/`git push` unless the user has authorized commits this session with a keyword (`commit`, `push`, `ship it`, etc.). The commit steps below are written for completeness; if not authorized, pause and ask "Want me to commit this?" before running them.

**Goal:** Stop abandoned `incomplete` Stripe subscriptions from blocking/charging users — clean up the existing cohort, prevent re-accumulation at the source, and remove the duplicate error toast.

**Architecture:** One shared, unit-tested helper (`cancelIncompleteSubscriptionAndVoidInvoice`) performs the only Stripe mutation for abandoned checkouts; it is reused by a dry-run-first backfill script (existing cohort) and by the two create-subscription routes (prevent re-accumulation). A small frontend change suppresses the duplicate `EXISTING_SUBSCRIPTION` toast.

**Tech Stack:** Next.js 15 / TypeScript, Stripe Node SDK (`apiVersion 2025-08-27.basil`), Mongoose, standalone `tsx` tests (no jest/vitest).

**Spec:** [docs/superpowers/specs/2026-05-25-resubscribe-incomplete-remediation-design.md](../specs/2026-05-25-resubscribe-incomplete-remediation-design.md)

**Pre-req already done on this branch:** `findRecoverableSubscriptionForCustomer` re-validates real `.status` (core fix) — `npm run test:find-recoverable-subscription` is green.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/services/subscription/cancelIncompleteSubscription.ts` | The single Stripe-mutating helper for abandoned incompletes | Create |
| `src/services/subscription/__tests__/cancel-incomplete-subscription.test.ts` | Unit test for the helper (mock Stripe) | Create |
| `src/services/subscription/index.ts` | Re-export the helper | Modify |
| `scripts/cleanup-abandoned-incomplete-subscriptions.ts` | Dry-run-first cohort backfill (cancel + void + pointer repair/clear) | Create |
| `src/app/api/stripe/create-subscription/route.ts` | Reconcile stale pending incomplete before create | Modify |
| `src/app/api/stripe/create-subscription-existing-user/route.ts` | Same | Modify |
| `src/components/modals/MembershipModal/index.tsx` | Suppress duplicate `EXISTING_SUBSCRIPTION` toast | Modify |
| `package.json` | `test:*` + `cleanup:*` scripts | Modify |
| `docs/subscription/*`, `docs/infrastructure/testing.md`, `docs/shared-ui/*` | Doc-sync | Modify |

---

## Task 1: Shared helper `cancelIncompleteSubscriptionAndVoidInvoice`

**Files:**
- Create: `src/services/subscription/cancelIncompleteSubscription.ts`
- Test: `src/services/subscription/__tests__/cancel-incomplete-subscription.test.ts`
- Modify: `src/services/subscription/index.ts`, `package.json`

- [ ] **Step 1: Write the failing test**

Create `src/services/subscription/__tests__/cancel-incomplete-subscription.test.ts`:

```typescript
import assert from "node:assert/strict";
import type Stripe from "stripe";
import type * as Mod from "../cancelIncompleteSubscription";

type HelperClient = Parameters<typeof Mod.cancelIncompleteSubscriptionAndVoidInvoice>[1];

type Calls = { cancel: string[]; void: string[] };

/**
 * Mock Stripe with a fixed subscription + invoice. Records cancel/void calls so we
 * can assert the helper only mutates abandoned-incomplete subs and only voids OPEN
 * invoices. No live calls.
 */
function mockStripe(opts: {
  subStatus: string;
  invoiceId?: string | null;
  invoiceStatus?: string;
  calls: Calls;
}): HelperClient {
  const { subStatus, invoiceId = "in_1", invoiceStatus = "open", calls } = opts;
  return {
    subscriptions: {
      retrieve: async (id: string) =>
        ({ id, status: subStatus, latest_invoice: invoiceId }) as unknown as Stripe.Subscription,
      cancel: async (id: string) => {
        calls.cancel.push(id);
        return { id, status: "canceled" } as unknown as Stripe.Subscription;
      },
    },
    invoices: {
      retrieve: async (id: string) =>
        ({ id, status: invoiceStatus }) as unknown as Stripe.Invoice,
      voidInvoice: async (id: string) => {
        calls.void.push(id);
        return { id, status: "void" } as unknown as Stripe.Invoice;
      },
    },
  } as unknown as HelperClient;
}

async function testCancelsIncompleteAndVoidsOpenInvoice(mod: typeof Mod) {
  const calls: Calls = { cancel: [], void: [] };
  const stripe = mockStripe({ subStatus: "incomplete", invoiceStatus: "open", calls });
  const r = await mod.cancelIncompleteSubscriptionAndVoidInvoice("sub_1", stripe);
  assert.equal(r.cancelled, true, "incomplete sub must be cancelled");
  assert.equal(r.invoiceVoided, true, "open invoice must be voided");
  assert.deepEqual(calls.cancel, ["sub_1"], "cancel called once for the sub");
  assert.deepEqual(calls.void, ["in_1"], "void called once for the invoice");
}

async function testSkipsManageable(mod: typeof Mod) {
  const calls: Calls = { cancel: [], void: [] };
  const stripe = mockStripe({ subStatus: "trialing", invoiceStatus: "open", calls });
  const r = await mod.cancelIncompleteSubscriptionAndVoidInvoice("sub_2", stripe);
  assert.equal(r.action, "skipped", "trialing sub must be skipped");
  assert.equal(r.cancelled, false, "must not cancel a manageable sub");
  assert.deepEqual(calls.cancel, [], "no cancel for manageable sub");
  assert.deepEqual(calls.void, [], "no void for manageable sub");
}

async function testSkipsCanceled(mod: typeof Mod) {
  const calls: Calls = { cancel: [], void: [] };
  const stripe = mockStripe({ subStatus: "canceled", calls });
  const r = await mod.cancelIncompleteSubscriptionAndVoidInvoice("sub_3", stripe);
  assert.equal(r.action, "skipped", "canceled sub must be skipped");
  assert.deepEqual(calls.cancel, [], "no cancel for canceled sub");
}

async function testIncompleteExpiredDoesNotCancelAndDoesNotVoidVoided(mod: typeof Mod) {
  const calls: Calls = { cancel: [], void: [] };
  // incomplete_expired: Stripe has already voided the invoice.
  const stripe = mockStripe({ subStatus: "incomplete_expired", invoiceStatus: "void", calls });
  const r = await mod.cancelIncompleteSubscriptionAndVoidInvoice("sub_4", stripe);
  assert.equal(r.cancelled, false, "must not cancel an already-terminal sub");
  assert.equal(r.invoiceVoided, false, "must not void an already-void invoice");
  assert.deepEqual(calls.cancel, [], "no cancel for incomplete_expired");
  assert.deepEqual(calls.void, [], "no void for already-void invoice");
}

async function testIncompleteWithPaidInvoiceCancelsButDoesNotVoid(mod: typeof Mod) {
  const calls: Calls = { cancel: [], void: [] };
  const stripe = mockStripe({ subStatus: "incomplete", invoiceStatus: "paid", calls });
  const r = await mod.cancelIncompleteSubscriptionAndVoidInvoice("sub_5", stripe);
  assert.equal(r.cancelled, true, "incomplete sub still cancelled");
  assert.equal(r.invoiceVoided, false, "paid invoice must never be voided");
  assert.deepEqual(calls.void, [], "no void for paid invoice");
}

async function run() {
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy_for_unit_tests";
  const mod = await import("../cancelIncompleteSubscription");
  await testCancelsIncompleteAndVoidsOpenInvoice(mod);
  await testSkipsManageable(mod);
  await testSkipsCanceled(mod);
  await testIncompleteExpiredDoesNotCancelAndDoesNotVoidVoided(mod);
  await testIncompleteWithPaidInvoiceCancelsButDoesNotVoid(mod);
  console.log("cancel-incomplete-subscription tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the test script to `package.json`**

After the `test:find-recoverable-subscription` line:

```json
    "test:cancel-incomplete-subscription": "tsx src/services/subscription/__tests__/cancel-incomplete-subscription.test.ts",
```

- [ ] **Step 3: Run the test — verify it FAILS**

Run: `npm run test:cancel-incomplete-subscription`
Expected: FAIL — `Cannot find module '../cancelIncompleteSubscription'`.

- [ ] **Step 4: Write the helper**

Create `src/services/subscription/cancelIncompleteSubscription.ts`:

```typescript
/**
 * Safely retire an abandoned, unpaid checkout subscription.
 *
 * Cancels a subscription ONLY if its real status is `incomplete`, and voids its
 * initial invoice ONLY if that invoice is `open` (incomplete ⟹ unpaid). This is the
 * single place that mutates Stripe for abandoned incompletes — reused by the
 * cleanup backfill script and the create-subscription routes. Idempotent: re-running
 * on an already-canceled/terminal sub is a no-op. See docs/subscription/gotchas.md.
 */
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";

export type CancelIncompleteResult = {
  subscriptionId: string;
  action: "cancelled" | "skipped" | "already_terminal";
  cancelled: boolean;
  invoiceVoided: boolean;
  reason?: string;
};

export async function cancelIncompleteSubscriptionAndVoidInvoice(
  subscriptionId: string,
  stripeClient: Pick<typeof stripe, "subscriptions" | "invoices"> = stripe
): Promise<CancelIncompleteResult> {
  let sub: Stripe.Subscription;
  try {
    sub = await stripeClient.subscriptions.retrieve(subscriptionId);
  } catch (e) {
    return {
      subscriptionId,
      action: "skipped",
      cancelled: false,
      invoiceVoided: false,
      reason: `retrieve failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // Only ever act on an abandoned initial checkout. Never touch a live or
  // already-canceled membership.
  if (sub.status !== "incomplete" && sub.status !== "incomplete_expired") {
    return {
      subscriptionId,
      action: "skipped",
      cancelled: false,
      invoiceVoided: false,
      reason: `status ${sub.status} is not an abandoned incomplete`,
    };
  }

  // Cancel only a still-`incomplete` sub; `incomplete_expired` is already terminal.
  let cancelled = false;
  if (sub.status === "incomplete") {
    await stripeClient.subscriptions.cancel(subscriptionId);
    cancelled = true;
  }

  // Void the initial invoice only if it is still open (prevents a later dunning charge).
  let invoiceVoided = false;
  const invoiceId =
    typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id;
  if (invoiceId) {
    const invoice = await stripeClient.invoices.retrieve(invoiceId);
    if (invoice.status === "open") {
      await stripeClient.invoices.voidInvoice(invoiceId);
      invoiceVoided = true;
    }
  }

  return {
    subscriptionId,
    action: cancelled || invoiceVoided ? "cancelled" : "already_terminal",
    cancelled,
    invoiceVoided,
  };
}
```

- [ ] **Step 5: Re-export from the service barrel**

In `src/services/subscription/index.ts`, add (match the existing export style in that file):

```typescript
export { cancelIncompleteSubscriptionAndVoidInvoice } from "./cancelIncompleteSubscription";
export type { CancelIncompleteResult } from "./cancelIncompleteSubscription";
```

- [ ] **Step 6: Run the test — verify it PASSES**

Run: `npm run test:cancel-incomplete-subscription`
Expected: PASS — `cancel-incomplete-subscription tests passed`.

- [ ] **Step 7: Type-check + lint the new/changed files**

Run: `npx eslint src/services/subscription/cancelIncompleteSubscription.ts src/services/subscription/__tests__/cancel-incomplete-subscription.test.ts`
Expected: exit 0. (Project `npm run type-check` has pre-existing unrelated `*.webp` errors from a missing `next-env.d.ts`; confirm none of YOUR files appear.)

- [ ] **Step 8: Commit (if authorized)**

```bash
git add src/services/subscription/cancelIncompleteSubscription.ts src/services/subscription/__tests__/cancel-incomplete-subscription.test.ts src/services/subscription/index.ts package.json
git commit -m "feat(subscription): add cancelIncompleteSubscriptionAndVoidInvoice helper"
```

---

## Task 2: Prevent-at-source in the create-subscription routes

Wire the helper into both routes so each fresh resubscribe retires the user's stale
pending incomplete sub. **No new abstraction** — extend the existing
`cancelPreviousSubscriptionId` pattern.

**Files:**
- Modify: `src/app/api/stripe/create-subscription-existing-user/route.ts`
- Modify: `src/app/api/stripe/create-subscription/route.ts`

- [ ] **Step 1: existing-user route — import the helper**

In `src/app/api/stripe/create-subscription-existing-user/route.ts`, extend the existing import from `@/services/subscription`:

```typescript
import {
  shouldWriteCanonicalStripeSubscriptionId,
  stripeCustomerHasManageableSubscription,
  cancelIncompleteSubscriptionAndVoidInvoice,
} from "@/services/subscription";
```

- [ ] **Step 2: existing-user route — retire the stale pending sub after the guard, before create**

Locate the Stripe guard block (the `if (stripeCustomerHasManageableSubscription...)` that returns 409). Immediately AFTER that block and BEFORE `const subscription = await createSubscriptionWithIdempotencyRetry(...)`, insert:

```typescript
    // Hygiene: retire the user's stale pending incomplete sub so abandoned
    // checkouts don't accumulate (and their $20 invoice can't dun later). Safe:
    // a fresh create call means the previous pending attempt was abandoned — the
    // sub currently being paid is confirmed without re-calling this route.
    const stalePendingId = existingUser.subscription?.pendingStripeSubscriptionId;
    if (stalePendingId && stalePendingId !== validatedData.cancelPreviousSubscriptionId) {
      try {
        const reconciled = await cancelIncompleteSubscriptionAndVoidInvoice(stalePendingId);
        if (correlationId) {
          console.log("[create-subscription-existing-user] retired stale pending incomplete", {
            correlationId,
            ...reconciled,
          });
        }
      } catch (reconcileErr) {
        console.warn(
          "[create-subscription-existing-user] retire stale pending failed (non-fatal):",
          reconcileErr instanceof Error ? reconcileErr.message : String(reconcileErr)
        );
      }
    }
```

> Note: the subsequent `existingUser.subscription = { ... }` assignment already overwrites the pending fields with the new sub's id, so no extra clearing is needed.

- [ ] **Step 3: guest route — import the helper**

In `src/app/api/stripe/create-subscription/route.ts`, extend the existing import from `@/services/subscription` the same way (add `cancelIncompleteSubscriptionAndVoidInvoice`).

- [ ] **Step 4: guest route — retire the stale pending sub after the guard, before create**

In `src/app/api/stripe/create-subscription/route.ts`, after the `if (hasLiveStripeSubscription) { ... return 409 }` block and before `subscription = await createSubscriptionWithIdempotencyRetry(...)`, insert:

```typescript
    // Hygiene: retire the registered user's stale pending incomplete sub before
    // creating a new one (guest flow only has a user when registeredUser exists).
    const stalePendingId = registeredUser?.subscription?.pendingStripeSubscriptionId;
    if (stalePendingId && stalePendingId !== validatedData.cancelPreviousSubscriptionId) {
      try {
        const reconciled = await cancelIncompleteSubscriptionAndVoidInvoice(stalePendingId);
        if (correlationId) {
          console.log("[create-subscription] retired stale pending incomplete", {
            correlationId,
            ...reconciled,
          });
        }
      } catch (reconcileErr) {
        console.warn(
          "[create-subscription] retire stale pending failed (non-fatal):",
          reconcileErr instanceof Error ? reconcileErr.message : String(reconcileErr)
        );
      }
    }
```

- [ ] **Step 5: Verify**

Run: `npx eslint src/app/api/stripe/create-subscription/route.ts src/app/api/stripe/create-subscription-existing-user/route.ts`
Expected: exit 0. Confirm your two files do NOT appear in `npm run type-check` output (pre-existing `*.webp` errors are unrelated).

- [ ] **Step 6: Commit (if authorized)**

```bash
git add src/app/api/stripe/create-subscription/route.ts src/app/api/stripe/create-subscription-existing-user/route.ts
git commit -m "feat(subscription): retire stale pending incomplete sub on resubscribe"
```

---

## Task 3: Double-toast fix in MembershipModal

**Files:**
- Modify: `src/components/modals/MembershipModal/index.tsx`

- [ ] **Step 1: Suppress the auto-create-on-open `EXISTING_SUBSCRIPTION` toast**

In the auto-create-on-open effect's `onError` handler (the block that does
`if (errCode === "EXISTING_SUBSCRIPTION") { showToast({ title: "Existing Subscription", ... }) }`),
replace the `EXISTING_SUBSCRIPTION` branch so it logs instead of toasting — the
purchase-click handler remains the single source of this toast:

```typescript
          if (errCode === "EXISTING_SUBSCRIPTION") {
            // Background pre-warm: do NOT toast here. The purchase-click handler
            // ("Active Subscription Found") is the single source of this message,
            // so the user sees exactly one actionable toast.
            console.warn("[MembershipModal] pre-warm blocked by EXISTING_SUBSCRIPTION (toast deferred to purchase click)");
          } else {
            showToast({
              type: "error",
              title: "Subscription Error",
              message: errMsg,
              duration: 6000,
            });
          }
```

- [ ] **Step 2: Verify**

Run: `npx eslint src/components/modals/MembershipModal/index.tsx`
Expected: exit 0 (no new errors).

Manual check (after deploy/local run): open the modal as a user whose customer has a
genuinely active sub → exactly ONE "Active Subscription Found" toast on purchase click,
none on open.

- [ ] **Step 3: Commit (if authorized)**

```bash
git add src/components/modals/MembershipModal/index.tsx
git commit -m "fix(subscription): single EXISTING_SUBSCRIPTION toast in MembershipModal"
```

---

## Task 4: Cohort backfill script (dry-run first)

**Files:**
- Create: `scripts/cleanup-abandoned-incomplete-subscriptions.ts`
- Modify: `package.json` (`cleanup:abandoned-incomplete` + `:dry`)
- Modify: `docs/infrastructure/testing.md`

> **Harness reuse (not a placeholder):** copy the arg-parsing, `withStripeRateLimitRetry`,
> `sleep`, `formatDurationMs`, production-countdown, and Mongo-connect boilerplate verbatim
> from `scripts/repair-wrong-stripe-subscription-ids.ts`. The code below is the NOVEL logic
> (candidate scan, per-sub remediation, pointer repair/clear, and the observability layer).

- [ ] **Step 1: Write the observability helpers (top of script, after arg parsing)**

```typescript
const startedAt = Date.now();
function ts() { return new Date().toISOString(); }
function phase(n: number, total: number, msg: string) {
  console.error(`[${n}/${total}] ${ts()} ${msg}`);
}
// Time-based heartbeat so long Stripe pagination never looks frozen.
let lastHeartbeat = Date.now();
function heartbeat(done: number, label: string) {
  const now = Date.now();
  if (now - lastHeartbeat >= 10_000) {
    console.error(`   … still ${label} (${done} processed, ${formatDurationMs(now - startedAt)} elapsed)`);
    lastHeartbeat = now;
  }
}
```

- [ ] **Step 2: Write the candidate scan (Stripe-first, paginated, with progress)**

```typescript
const OLDER_THAN_HOURS_ARG = process.argv.find((a) => a.startsWith("--older-than-hours="));
const OLDER_THAN_HOURS = OLDER_THAN_HOURS_ARG
  ? Math.max(0, parseInt(OLDER_THAN_HOURS_ARG.split("=")[1] || "24", 10))
  : 24;
const cutoffEpoch = Math.floor((Date.now() - OLDER_THAN_HOURS * 3600_000) / 1000);

/** All `incomplete` subs older than the cutoff, grouped by customer. */
async function scanIncompleteSubs(
  stripe: typeof import("../src/lib/stripe").stripe
): Promise<Map<string, string[]>> {
  const byCustomer = new Map<string, string[]>();
  let startingAfter: string | undefined;
  let scanned = 0;
  phase(2, 4, `Scanning Stripe for incomplete subs older than ${OLDER_THAN_HOURS}h…`);
  for (;;) {
    const page = await withStripeRateLimitRetry("list incomplete", () =>
      stripe.subscriptions.list({
        status: "incomplete",
        limit: 100,
        ...(startingAfter && { starting_after: startingAfter }),
      })
    );
    for (const sub of page.data) {
      scanned++;
      if (sub.created > cutoffEpoch) continue; // too new — could be in-flight checkout
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
      if (!customerId) continue;
      const list = byCustomer.get(customerId) ?? [];
      list.push(sub.id);
      byCustomer.set(customerId, list);
      heartbeat(scanned, "scanning");
    }
    console.error(`   scanned ${scanned} incomplete subs so far | ${byCustomer.size} customers with stale incompletes`);
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1].id;
  }
  return byCustomer;
}
```

- [ ] **Step 3: Write the per-customer remediation (reuses the helper + the fixed finder)**

```typescript
import type { CancelIncompleteResult } from "../src/services/subscription/cancelIncompleteSubscription";

type Counters = {
  customers: number; cancelled: number; voided: number;
  pointersRepaired: number; pointersCleared: number; skipped: number; errors: number;
};

async function remediateCustomer(
  customerId: string,
  staleSubIds: string[],
  deps: {
    stripe: typeof import("../src/lib/stripe").stripe;
    User: typeof import("../src/models/User").default;
    cancelHelper: (id: string, c?: unknown) => Promise<CancelIncompleteResult>;
    findRecoverable: (id: string, c?: unknown) => Promise<import("stripe").Stripe.Subscription | null>;
    getPeriodEnd: (s: import("stripe").Stripe.Subscription) => number | null;
  },
  counters: Counters
): Promise<void> {
  // 1. Retire each stale incomplete sub (cancel + void open invoice).
  for (const subId of staleSubIds) {
    const r = DRY_RUN
      ? { subscriptionId: subId, action: "cancelled" as const, cancelled: true, invoiceVoided: true }
      : await deps.cancelHelper(subId);
    if (DRY_RUN) {
      console.log(`   [WOULD RETIRE] sub=${subId} (customer ${customerId})`);
    } else {
      if (r.cancelled) counters.cancelled++;
      if (r.invoiceVoided) counters.voided++;
      if (r.action === "skipped") counters.skipped++;
      console.log(`   [RETIRED] sub=${subId} cancelled=${r.cancelled} voided=${r.invoiceVoided}${r.reason ? ` (${r.reason})` : ""}`);
    }
  }

  // 2. Repair-or-clear the user's canonical pointer if it now points at a dead sub.
  const user = await deps.User.findOne({ stripeCustomerId: customerId }).select(
    "_id email stripeSubscriptionId subscription"
  );
  if (!user) return;

  const recoverable = await deps.findRecoverable(customerId);
  if (recoverable) {
    if (user.stripeSubscriptionId !== recoverable.id) {
      const periodEnd = deps.getPeriodEnd(recoverable);
      if (DRY_RUN) {
        console.log(`   [WOULD REPAIR POINTER] ${user.email}: ${user.stripeSubscriptionId} → ${recoverable.id}`);
      } else {
        user.stripeSubscriptionId = recoverable.id;
        if (user.subscription) {
          user.subscription.status = recoverable.status;
          user.subscription.isActive = recoverable.status === "active" || recoverable.status === "trialing";
          if (periodEnd != null) user.subscription.endDate = new Date(periodEnd * 1000);
          user.markModified("subscription");
        }
        await user.save();
        counters.pointersRepaired++;
        console.log(`   [POINTER REPAIRED] ${user.email}: → ${recoverable.id} (${recoverable.status})`);
      }
    }
    return;
  }

  // No recoverable sub → clear the dead pointer + mark inactive (honest state).
  const pointerIsDead = !!user.stripeSubscriptionId; // all subs are dead/incomplete here
  if (pointerIsDead || user.subscription?.isActive) {
    if (DRY_RUN) {
      console.log(`   [WOULD CLEAR POINTER] ${user.email}: ${user.stripeSubscriptionId} → (cleared), isActive → false`);
    } else {
      user.stripeSubscriptionId = undefined;
      if (user.subscription) {
        user.subscription.isActive = false;
        user.subscription.pendingStripeSubscriptionId = undefined;
        user.subscription.pendingStripeSubscriptionRequestId = undefined;
        user.subscription.pendingStripeSubscriptionCreatedAt = undefined;
        user.markModified("subscription");
      }
      await user.save();
      counters.pointersCleared++;
      console.log(`   [POINTER CLEARED] ${user.email}`);
    }
  }
}
```

- [ ] **Step 4: Write `main()` wiring + final summary**

```typescript
async function main() {
  // ...copy env checks + Mongo connect from repair-wrong-stripe-subscription-ids.ts...
  phase(1, 4, `Connecting (mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}, older-than ${OLDER_THAN_HOURS}h)`);
  const mongoose = await import("mongoose");
  const User = (await import("../src/models/User")).default;
  const { stripe } = await import("../src/lib/stripe");
  const { cancelIncompleteSubscriptionAndVoidInvoice } = await import("../src/services/subscription/cancelIncompleteSubscription");
  const { findRecoverableSubscriptionForCustomer } = await import("../src/services/subscription/SubscriptionReferenceService");
  const { getSubscriptionPeriodEnd } = await import("../src/utils/payment/stripe/subscription-period");
  await mongoose.connect(process.env.MONGODB_URI!);

  const byCustomer = await scanIncompleteSubs(stripe);
  phase(3, 4, `Planning: ${byCustomer.size} customers with stale incomplete subs`);

  const counters: Counters = { customers: byCustomer.size, cancelled: 0, voided: 0, pointersRepaired: 0, pointersCleared: 0, skipped: 0, errors: 0 };

  if (!DRY_RUN) {
    // ...copy production countdown from repair script (CONFIRM_BACKFILL_PRODUCTION)...
  }
  phase(4, 4, DRY_RUN ? "Listing planned actions (no writes)…" : "Applying…");

  let done = 0;
  for (const [customerId, subIds] of byCustomer) {
    try {
      await remediateCustomer(customerId, subIds, {
        stripe, User,
        cancelHelper: cancelIncompleteSubscriptionAndVoidInvoice,
        findRecoverable: findRecoverableSubscriptionForCustomer,
        getPeriodEnd: getSubscriptionPeriodEnd,
      }, counters);
    } catch (e) {
      counters.errors++;
      console.error(`   [ERROR] customer ${customerId}: ${e instanceof Error ? e.message : String(e)}`);
    }
    done++;
    if (done % 10 === 0 || done === byCustomer.size) {
      console.error(`Progress: ${done}/${byCustomer.size} customers | cancelled ${counters.cancelled} | voided ${counters.voided} | repaired ${counters.pointersRepaired} | cleared ${counters.pointersCleared} | errors ${counters.errors} | ${formatDurationMs(Date.now() - startedAt)} elapsed`);
    }
  }

  console.log("\n📊 Summary");
  console.table(counters);
  console.log(`Total duration: ${formatDurationMs(Date.now() - startedAt)}`);
  console.log(DRY_RUN ? "\nDRY RUN — re-run with --live to apply." : "\nDONE (live).");
  await mongoose.disconnect();
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 5: Add npm scripts**

In `package.json` (near the other `cleanup:*` entries):

```json
    "cleanup:abandoned-incomplete": "tsx scripts/cleanup-abandoned-incomplete-subscriptions.ts --live",
    "cleanup:abandoned-incomplete:dry": "tsx scripts/cleanup-abandoned-incomplete-subscriptions.ts --dry-run",
```

- [ ] **Step 6: Lint the script**

Run: `npx eslint scripts/cleanup-abandoned-incomplete-subscriptions.ts`
Expected: exit 0.

- [ ] **Step 7: Verify in TEST mode (no live data)**

With `.env.local` on a `sk_test` key, run: `npm run cleanup:abandoned-incomplete:dry`
Expected: phase banners `[1/4]…[4/4]`, a scan summary, and either "no candidates" or `[WOULD RETIRE]/[WOULD CLEAR POINTER]` lines, then the summary table — and it returns promptly (no endless silent wait).

- [ ] **Step 8: Commit (if authorized)**

```bash
git add scripts/cleanup-abandoned-incomplete-subscriptions.ts package.json
git commit -m "feat(scripts): cleanup-abandoned-incomplete-subscriptions backfill (dry-run default)"
```

> **LIVE run is operator-run, not part of implementation.** After review, the operator runs
> `npm run cleanup:abandoned-incomplete:dry` against production, eyeballs the output, then
> `CONFIRM_BACKFILL_PRODUCTION=1 npm run cleanup:abandoned-incomplete`.

---

## Task 5: Docs + final verification

**Files:** `docs/subscription/backend.md` (or `patterns.md`), `docs/subscription/gotchas.md`, `docs/infrastructure/testing.md`, `docs/shared-ui/` (a relevant page for MembershipModal), `package.json`.

- [ ] **Step 1: Document the helper + prevent-at-source** in `docs/subscription/backend.md` (or `patterns.md`): describe `cancelIncompleteSubscriptionAndVoidInvoice` (only acts on `incomplete`/`incomplete_expired`, voids only `open` invoices) and that both create routes call it before creating a new sub. Cross-link from `gotchas.md`.

- [ ] **Step 2: Document the script + tests** in `docs/infrastructure/testing.md`: add `npm run test:cancel-incomplete-subscription` and the `cleanup:abandoned-incomplete[:dry]` commands with the production-run note.

- [ ] **Step 3: Document the modal toast change** in the appropriate `docs/shared-ui/` page (MembershipModal maps to shared-ui): one actionable `EXISTING_SUBSCRIPTION` toast; pre-warm is silent.

- [ ] **Step 4: Run the full verification pass**

```bash
npm run test:find-recoverable-subscription
npm run test:cancel-incomplete-subscription
npm run cleanup:abandoned-incomplete:dry   # test-mode, expect prompt completion
npx eslint <all changed src + scripts files>
```
Expected: all tests print their success lines; lint exit 0. Note `npm run type-check`'s pre-existing `*.webp` errors are unrelated (missing `next-env.d.ts`).

- [ ] **Step 5: Run `/ship`** (definition of done: lint, type-check, scoped tests, manifest check, doc-sync). Resolve any `BLOCKED: Stale docs` by editing the named domain doc.

- [ ] **Step 6: Commit (if authorized)** — see commit policy banner at top.

---

## Self-review (completed)

- **Spec coverage:** Part 1 → Task 4; Part 2 → Task 2; Part 3 → Task 3; shared helper → Task 1; observability → Task 4 steps 1–2; tests → Tasks 1 & 5; docs → Task 5. ✓
- **Placeholder scan:** harness reuse is a concrete file reference, not a TODO; all novel code shown in full. ✓
- **Type consistency:** `cancelIncompleteSubscriptionAndVoidInvoice(subscriptionId, stripeClient?)` and `CancelIncompleteResult` used identically in Tasks 1, 2, 4. `findRecoverableSubscriptionForCustomer` signature matches the shipped core fix. ✓

## Risks (carried from spec)

1. Stripe cancel/void ordering for trial+incomplete — verify on one test-mode sub before live; helper re-checks status (Task 1 guards). 2. TOCTOU — helper re-retrieves. 3. In-flight 3DS sub — `--older-than-hours` (script) + "never cancel the just-created sub" (routes confirm, don't re-create). 4. Voiding a payable invoice — only `open` invoices. 5. Dead-pointer clear vs cancel flow — `resolveCancellableStripeSubscription` handles a missing pointer. 6. doc-sync — MembershipModal → `docs/shared-ui/`.
