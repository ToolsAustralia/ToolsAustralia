# Renewal Surge Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop members being charged without receiving entries, get Stripe API usage under its published rate limits, and make the daily past-due charge job actually finish — before the 24 September renewal.

**Architecture:** Six independent phases against an existing Next.js 15 / MongoDB / Stripe app. Phase 0 is a one-off remediation script on its own branch (hard deadline). Phases 1–5 land on `feature/renewal-surge` in priority order 1 → 2 → 4 → 3 → 5. Each phase is independently shippable and independently revertable.

**Tech Stack:** Next.js 15 App Router, TypeScript, Mongoose 8.18.1, Stripe SDK 18.5.0 (`apiVersion: "2025-08-27.basil"`), Vercel Pro (UTC crons), MongoDB Atlas M10.

**Spec:** `docs/superpowers/specs/2026-08-24-renewal-surge-hardening-design.md`

## Global Constraints

- **No auto-commit beyond this plan's scope.** Commits are authorised for this work. **Do NOT push until every task is complete.** Never push to `main` — work stays on `feature/renewal-surge` (Phase 0 on its own branch).
- **Tests are standalone `tsx` scripts.** There is no jest/vitest. Every new test file needs a matching `test:*` entry in `package.json` or it is undiscoverable.
- **`console.log` is stripped from production builds** (`next.config.ts` `compiler.removeConsole`). Use `console.error` for anything that must survive in Vercel logs. Ops scripts under `scripts/` run via `tsx` and are NOT stripped.
- **Docs must be updated in the same task** as the code (CLAUDE.md rule 2). The `Stop` hook blocks otherwise. Domain map is the Domain Manifest in `CLAUDE.md`.
- **Customer-facing copy:** never "odds", "chances", "lottery", "raffle", "gamble", "bet". Entries are a FREE inclusion, never sold (CLAUDE.md rule 11). No task here should produce customer copy, but any log or admin string must still comply.
- **Stripe published limits:** 100 requests/sec globally per account; 25 requests/sec per individual endpoint.
- **Anchor-24 invariant:** only `trial_end` can land the clamped 24th. `billing_cycle_anchor` cannot target a future date. Per `docs/PAST_DUE_REANCHOR.md:42` — **do not "optimize" this to `billing_cycle_anchor`**.
- **Verification after every task:** `npm run type-check` and `npm run lint` must pass before commit.

---

## File Structure

**Create**
- `scripts/backfill-missing-renewal-grants.ts` — Phase 0 one-off remediation
- `src/services/reconciliation/renewalGrantReconciler.ts` — Stripe-anchored gap detector (pure-ish service)
- `src/app/api/cron/reconcile-renewal-grants/route.ts` — thin cron wrapper
- `src/lib/stripe-rate-limiter.ts` — shared token bucket
- `src/services/reconciliation/__tests__/renewalGrantReconciler.test.ts`
- `src/lib/__tests__/stripe-rate-limiter.test.ts`
- `src/server/admin/__tests__/orphan-progress.test.ts`

**Modify**
- `src/services/stripe-webhook-handlers/index.ts` — ack gate (`:5518-5530`), remove 3 Stripe calls (`:172`, `:3657`, `:3761`), missing else (`:4369`)
- `src/services/stripe-webhook-queue/processQueuedEvent.ts:50-57` — honour the gate
- `src/lib/stripe.ts:7` — wrap the singleton in the limiter
- `src/server/admin/charge-past-due-totals.ts:11,~100-113` — progress-based orphan detection
- `src/server/admin/chargePastDueJob.ts:188-191, 830` — sweep on progress; stamp progress
- `src/models/ChargeJobRun.ts` — add `lastProgressAt`
- `vercel.json` — cron reschedule + new cron
- `src/app/api/cron/membership-daily-snapshot/route.ts` — write-once guard
- `src/app/api/stripe/upgrade-subscription-payment/route.ts:227-269, 275-303, 321, 439, 493` — trial-aware upgrade
- `src/services/stripe-webhook-handlers/__tests__/zero-trial-invoice-guard.test.ts` — add Case D
- `package.json` — new `test:*` and `backfill:*` entries

---

# Phase 0 — Credit the 11 members

> **DEADLINE: 8:00pm AEST 27 Aug 2026.** After the freeze these members roll to the September draw having paid for August.
> **Own branch.** `git checkout -b fix/backfill-missing-renewal-grants` from `main`.

### Task 1: Backfill script for renewals that granted nothing

**Files:**
- Create: `scripts/backfill-missing-renewal-grants.ts`
- Modify: `package.json` (scripts block)
- Docs: `docs/draws/gotchas.md`, `docs/billing-stripe/gotchas.md`

**Interfaces:**
- Consumes: `MembershipRenewalCycle` (`stripeInvoiceId` unique), `PaymentEvent` (`_id` = `` `BenefitsGranted-invoice_${invoiceId}` ``), `processPaymentBenefits` from `src/utils/payment/payment-processing.ts`
- Produces: nothing importable — a standalone ops script

**Why the existing tools cannot do this:** replaying the Stripe event fails (`ProcessedStripeEvent.eventId` is unique and already written — that IS the bug). `scripts/fix-major-draw-renewal-entries.ts` starts from `BenefitsGranted` rows; these 11 have none.

- [ ] **Step 1: Branch from main**

```bash
git fetch origin
git checkout -b fix/backfill-missing-renewal-grants origin/main
```

- [ ] **Step 2: Write the gap query as a dry-run-only script**

Follow `scripts/backfill-klaviyo-membership-properties.ts` conventions exactly: `--dry-run` default, up-front total, adaptive progress line, final summary, 3-tier exit codes.

```ts
#!/usr/bin/env npx tsx
/**
 * Backfill renewals that were charged but granted nothing.
 *
 * Root cause: handleInvoicePaymentSucceeded's outer catch swallows a Stripe
 * error, the dispatcher still returns shouldMarkAsProcessed=true, and the queue
 * row is marked succeeded. No PaymentEvent is ever written, so
 * reconcile-major-draw-entries (which starts FROM PaymentEvent) cannot see it.
 *
 * Detection: MembershipRenewalCycle{status:"succeeded", billingReason:"subscription_cycle"}
 * LEFT JOIN PaymentEvent on _id === `BenefitsGranted-invoice_${stripeInvoiceId}` WHERE absent.
 *
 * SAFETY: dry-run by default. Idempotent — PaymentEvent._id is deterministic.
 * Grants use the ORIGINAL chargedAt so draw routing lands the correct draw.
 *
 * Usage:
 *   npm run backfill:missing-renewal-grants:dry
 *   npm run backfill:missing-renewal-grants -- --apply --since=2026-08-23T13:00:00Z
 */
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import MembershipRenewalCycle from "@/models/MembershipRenewalCycle";
import PaymentEvent from "@/models/PaymentEvent";

const APPLY = process.argv.includes("--apply");
const sinceArg = process.argv.find((a) => a.startsWith("--since="));
const SINCE = new Date(sinceArg ? sinceArg.split("=")[1] : "2026-08-23T13:00:00Z");

async function findGaps() {
  const cycles = await MembershipRenewalCycle.find(
    { createdAt: { $gte: SINCE }, status: "succeeded", billingReason: "subscription_cycle" },
    { stripeInvoiceId: 1, userId: 1, amountPaidCents: 1, succeededAt: 1, createdAt: 1 }
  ).lean();

  const ids = cycles.map((c) => `BenefitsGranted-invoice_${c.stripeInvoiceId}`);
  const found = new Set(
    (await PaymentEvent.find({ _id: { $in: ids } }, { _id: 1 }).lean()).map((d) => String(d._id))
  );
  return cycles.filter((c) => !found.has(`BenefitsGranted-invoice_${c.stripeInvoiceId}`));
}

async function main() {
  await connectDB();
  const gaps = await findGaps();
  console.log(`Scanned since ${SINCE.toISOString()}`);
  console.log(`TOTAL renewals missing a grant: ${gaps.length}`);
  const cents = gaps.reduce((s, g) => s + (g.amountPaidCents ?? 0), 0);
  console.log(`Collected without grant: $${(cents / 100).toFixed(2)}`);
  for (const g of gaps) {
    console.log(`  ${g.stripeInvoiceId}  $${((g.amountPaidCents ?? 0) / 100).toFixed(2)}  user=${g.userId}  charged=${g.succeededAt?.toISOString() ?? g.createdAt.toISOString()}`);
  }
  if (!APPLY) {
    console.log("\nDRY RUN — no writes. Re-run with --apply to grant.");
    await mongoose.disconnect();
    process.exit(gaps.length > 0 ? 2 : 0);
  }
  // --apply path added in Step 5.
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Wire the npm scripts**

Add to `package.json` scripts (alongside the other `backfill:*` entries):

```json
"backfill:missing-renewal-grants": "tsx scripts/backfill-missing-renewal-grants.ts",
"backfill:missing-renewal-grants:dry": "tsx scripts/backfill-missing-renewal-grants.ts --dry-run"
```

- [ ] **Step 4: Run the dry run and confirm it finds exactly 11 / $300.00**

Run: `npm run backfill:missing-renewal-grants:dry`
Expected: `TOTAL renewals missing a grant: 11`, `Collected without grant: $300.00`, and the 11 invoice ids from the spec's Appendix A. Exit code 2.

**If the count is not 11, STOP and report** — the detection query is wrong, or new gaps appeared, and granting on a wrong set is unsafe.

- [ ] **Step 5: Add the --apply path**

Grant through the normal path so the `PaymentEvent` is created correctly. Read `src/utils/payment/payment-processing.ts` for the exact `processPaymentBenefits` signature before writing this — **do not guess the parameter names**. The two non-negotiables:
1. Pass the **original** charge timestamp (`succeededAt ?? createdAt`), never `new Date()` — `getTargetMajorDraw` routes on `paymentMetadata.created` (`payment-processing.ts:2226-2229`), so a `now` timestamp would credit the September draw.
2. Log every grant to an append-mode CSV audit file before moving to the next row.

- [ ] **Step 6: Apply, then verify**

```bash
npm run backfill:missing-renewal-grants -- --apply
npm run backfill:missing-renewal-grants:dry   # must now report 0
npx tsx scripts/verify-major-draw-entries.ts
```
Expected: second dry run reports `TOTAL renewals missing a grant: 0` (exit 0); the 11 members appear in the August draw.

- [ ] **Step 7: Update docs and commit**

Add a section to `docs/draws/gotchas.md` and `docs/billing-stripe/gotchas.md` describing the failure mode and this script.

```bash
git add scripts/backfill-missing-renewal-grants.ts package.json docs/draws/gotchas.md docs/billing-stripe/gotchas.md
git commit -m "fix(draws): backfill renewals charged without granting entries"
```

---

# Phase 1 — Never charge without granting

### Task 2: Gate the "processed" ack on the grant actually succeeding

**Files:**
- Modify: `src/services/stripe-webhook-handlers/index.ts:5518-5530`, `:4369`
- Modify: `src/services/stripe-webhook-queue/processQueuedEvent.ts:17, 50-57`
- Test: `src/services/stripe-webhook-queue/__tests__/ack-gate.test.ts`

**Interfaces:**
- Consumes: `dispatchStripeEvent(event: Stripe.Event): Promise<{ shouldMarkAsProcessed: boolean }>` (`index.ts:5376`)
- Produces: same signature, but `shouldMarkAsProcessed` now reflects grant success for `invoice.payment_succeeded`

**The bug, precisely.** `processQueuedEvent.ts:56` calls `markSucceeded(eventId)` **unconditionally** on the non-throwing path — even when `shouldMarkAsProcessed === false`. And `index.ts:5527` sets `shouldMarkAsProcessed = true` unconditionally for `invoice.payment_succeeded`, regardless of whether the grant ran. The comment at `:5519-5521` already states the intent ("Let errors bubble to the worker's catch — it calls markFailed()"); the handler's own outer catch at `:4849-4851` prevents it.

The correct pattern already exists at `:5383` for `payment_intent.succeeded`:
```ts
shouldMarkAsProcessed = paymentProcessed !== false; // Only if actually processed
```

- [ ] **Step 1: Write the failing test**

Mirror `zero-trial-invoice-guard.test.ts` structure exactly — plain tsx, `dotenv` loaded first, dynamic `await import()` inside `run()`, accumulate failures, `process.exit`.

```ts
import assert from "node:assert/strict";
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function run() {
  const { processQueuedEvent } = await import("@/services/stripe-webhook-queue/processQueuedEvent");
  let failures = 0;
  function expect(label: string, actual: unknown, expected: unknown) {
    try { assert.deepEqual(actual, expected); console.log(`  PASS  ${label}`); }
    catch { failures++; console.error(`  FAIL  ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`); }
  }

  // A dispatch that reports the grant did NOT happen must NOT leave the row succeeded.
  const res = await processQueuedEvent("evt_ack_gate_test_001", {
    dispatch: async () => ({ shouldMarkAsProcessed: false }),
  });
  expect("un-granted event is not reported as processed", res.processed, false);

  if (failures > 0) { console.error(`ack-gate test FAILED (${failures})`); process.exit(1); }
  console.log("ack-gate test passed");
  process.exit(0);
}
run().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx tsx src/services/stripe-webhook-queue/__tests__/ack-gate.test.ts`
Expected: FAIL — today `processed: true` is returned regardless.

- [ ] **Step 3: Make `invoice.payment_succeeded` report grant success**

In `index.ts`, change the `invoice.payment_succeeded` case so `shouldMarkAsProcessed` reflects the handler's outcome instead of being hard-coded `true` at `:5527`. `handleInvoicePaymentSucceeded` currently returns `void` — change it to return a boolean (`false` when the grant did not complete) and mirror `:5383`:

```ts
const granted = await handleInvoicePaymentSucceeded(event.data.object);
shouldMarkAsProcessed = granted !== false;
```

Also fix `index.ts:4369` / its `else` at `:4765`. The else **exists** — it is
`webhookLog("error", \`Failed to process subscription benefits: ${result.error}\`)` and then falls
through, so a `{success: false}` is logged and still acked. Make that branch cause the handler to
report failure (return `false`), mirroring the payment_intent path at `:1511-1522`.

> Corrected 2026-08-24 after Task 1's implementer verified the file: an earlier draft of this step
> said "add the missing else". The consequence is unchanged; the fix is not.

**Do not remove the `isZeroAmountTrialUpdateInvoice` guard at `:3490`** — a skipped $0 trial invoice is a legitimate "nothing to grant" and must still ack `true`.

- [ ] **Step 4: Honour the gate in the worker**

In `processQueuedEvent.ts`, only `markSucceeded` when the event was genuinely handled; otherwise `markFailed` so the queue retries with backoff:

```ts
const { shouldMarkAsProcessed } = await deps.dispatch(payload);
if (shouldMarkAsProcessed) {
  await ackProcessedStripeEventOnce(payload);
  await markSucceeded(eventId);
  return { processed: true };
}
await markFailed(eventId, "handler reported grant did not complete");
return { processed: false, error: "not_granted" };
```

**Widen `ProcessDeps.dispatch` at `:17` if the return shape changes**, or `defaultDeps` at `:20` fails `tsc`.

> **Corrected 2026-08-24 during implementation — the snippet above is NOT what shipped.** Gating
> `markSucceeded` on `shouldMarkAsProcessed` would have dead-lettered almost the entire event
> surface: `shouldMarkAsProcessed` is initialised `false` at `index.ts:5429` and only the
> money-moving cases ever set it, so ~19 of the 21 subscribed event types (`invoice.created`,
> `customer.subscription.updated`, `charge.refunded`, …) legitimately return `false` on a fully
> successful run. The pre-existing `processQueuedEvent.test.ts` case (a) encodes exactly that
> contract. The two flags answer different questions, so `dispatchStripeEvent` now returns
> `{ shouldMarkAsProcessed, handlerFailed }` (exported as `StripeDispatchResult`) and the worker
> gates on **`handlerFailed`**, which only `invoice.payment_succeeded` sets. `ack-gate.test.ts`
> case B pins the non-payment path against this regression.
>
> Two further deviations, both deliberate: (1) the handler **re-throws** when an exception killed an
> ungranted invoice, so the real error text (Stripe's 429) reaches the row's `lastError` instead of
> a generic string — while an exception *after* the grant landed is still swallowed and acked, so a
> failing best-effort step cannot un-ack completed entries; (2) `payment_intent.succeeded` is
> deliberately left unchanged (out of Task 2's scope, and several of its `false` returns are
> metadata defects no retry can fix). See `docs/billing-stripe/STRIPE_WEBHOOK_QUEUE.md → The ACK gate`.

- [ ] **Step 5: Run the test and verify it passes**

Run: `npx tsx src/services/stripe-webhook-queue/__tests__/ack-gate.test.ts` → PASS
Run: `npm run test:zero-trial-guard` → must still PASS (Cases A/B/C unchanged)

- [ ] **Step 6: Wire the script, verify, commit**

Add `"test:ack-gate": "tsx src/services/stripe-webhook-queue/__tests__/ack-gate.test.ts"` to `package.json`.

```bash
npm run type-check && npm run lint && npm run test:ack-gate && npm run test:zero-trial-guard
git add -A
git commit -m "fix(billing): never ack a renewal whose entry grant did not complete"
```

Docs: update `docs/billing-stripe/gotchas.md` and `docs/billing-stripe/STRIPE_WEBHOOK_QUEUE.md`.

### Task 3: Stripe-anchored reconciler

**Files:**
- Create: `src/services/reconciliation/renewalGrantReconciler.ts`
- Create: `src/app/api/cron/reconcile-renewal-grants/route.ts`
- Create: `src/services/reconciliation/__tests__/renewalGrantReconciler.test.ts`
- Modify: `vercel.json`, `package.json`, `CLAUDE.md` (Domain Manifest — new paths)

**Interfaces:**
- Produces: `findUngrantedRenewals(since: Date, until: Date): Promise<UngrantedRenewal[]>` where `UngrantedRenewal = { stripeInvoiceId: string; userId: string; amountPaidCents: number; chargedAt: Date }`

**Why this is the control that matters.** `reconcile-major-draw-entries.ts:96-113` starts from `PaymentEvent.find({eventType:"BenefitsGranted"})` and can only heal rows that exist. This reconciler runs the opposite direction — from what Stripe says we were paid — and is therefore the only detector for Task 2's failure mode.

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function run() {
  const { findUngrantedRenewals } = await import("@/services/reconciliation/renewalGrantReconciler");
  const { default: connectDB } = await import("@/lib/mongodb");
  await connectDB();

  // A window with no known gaps must return an empty array, not throw.
  const rows = await findUngrantedRenewals(new Date("2026-07-01T00:00:00Z"), new Date("2026-07-02T00:00:00Z"));
  assert.ok(Array.isArray(rows), "returns an array");
  console.log(`reconciler test passed (window returned ${rows.length} gaps)`);
  process.exit(0);
}
run().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx tsx src/services/reconciliation/__tests__/renewalGrantReconciler.test.ts`
Expected: FAIL — `Cannot find module '@/services/reconciliation/renewalGrantReconciler'`

- [ ] **Step 3: Implement the service**

Same join as Phase 0's script, extracted so both the cron and any future ops script share one definition of "ungranted". Keep it Mongo-only (no Stripe call) — `MembershipRenewalCycle` already carries `status: "succeeded"` sourced from Stripe, so a Stripe round-trip per run would reintroduce the rate-limit problem this spec is fixing.

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx tsx src/services/reconciliation/__tests__/renewalGrantReconciler.test.ts` → PASS

- [ ] **Step 5: Add the cron route**

Copy the auth/response shape from a cron that HAS a secret check — **`reconcile-major-draw-entries/route.ts` takes no `request` argument and checks nothing**, so do not copy that one. Use `charge-past-due/route.ts:47-51` as the auth template:

```ts
const secret = process.env.CRON_SECRET;
if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

On finding gaps, `console.error` a single line naming the count and total cents so it is greppable and survives `removeConsole`.

- [ ] **Step 6: Schedule it away from the renewal hour**

Add to `vercel.json` crons — **not** `0 14` or `0 15`:
```json
{ "path": "/api/cron/reconcile-renewal-grants", "schedule": "40 3 * * *" }
```

- [ ] **Step 7: Register the new paths in the Domain Manifest**

Add `src/services/reconciliation/**` and `src/app/api/cron/reconcile-renewal-grants/**` to a domain in `CLAUDE.md`'s manifest (`billing-stripe` is the right home) or the doc-sync Stop hook will block.

- [ ] **Step 8: Verify and commit**

```bash
npm run type-check && npm run lint && npm run test:renewal-grant-reconciler
git add -A
git commit -m "feat(billing): add Stripe-anchored reconciler for ungranted renewals"
```

---

# Phase 2 — Get under Stripe's rate limits

### Task 4: Verify invoice metadata on DRAFT invoices (blocking gate)

**Files:** Modify `src/services/stripe-webhook-handlers/index.ts:163-185` (temporary logging only)

**This gates Task 5 and must be done first.** Stripe's SDK types (`node_modules/stripe/types/Invoices.d.ts:1043-1048`) say the metadata snapshot is taken **at finalization**, and `handleInvoiceCreated` fires on the **draft**. Confirmed present on finalized invoices; unconfirmed on drafts.

- [ ] **Step 1: Add temporary diagnostic logging**

In `handleInvoiceCreated`, before the existing `stripe.subscriptions.retrieve` call, add:

```ts
console.error(
  `[DRAFT-META-PROBE] invoice=${invoice.id} ` +
  `parentMeta=${JSON.stringify((invoice as unknown as { parent?: { subscription_details?: { metadata?: unknown } } }).parent?.subscription_details?.metadata ?? null)} ` +
  `lineMeta=${JSON.stringify(invoice.lines?.data?.[0]?.metadata ?? null)}`
);
```

`console.error`, not `console.log` — production strips the latter.

- [ ] **Step 2: Deploy to preview, trigger one renewal, read the log**

Run: `npm run type-check && npm run lint`, commit, push the branch, and read the preview deployment's logs for `DRAFT-META-PROBE`.

**Decision point:**
- `packageName` **present** on the draft → proceed with Task 5 as written.
- `packageName` **absent** → do NOT remove `:172`. Instead move the stamping from `invoice.created` to `invoice.finalized` (where metadata is guaranteed) and record that decision in `docs/billing-stripe/gotchas.md`.

- [ ] **Step 3: Remove the probe and commit the finding**

```bash
git add -A
git commit -m "chore(billing): record draft-invoice metadata availability finding"
```

### Task 5: Remove the three avoidable `/v1/subscriptions` calls

**Files:** Modify `src/services/stripe-webhook-handlers/index.ts:172`, `:3657`, `:3761`

**Why these three.** `/v1/subscriptions` ran at ~73 req/sec against a **25/sec per-endpoint cap** — 2.9× over, versus 1.8× over the global cap. This endpoint is what broke first.

- [ ] **Step 1: Remove `:172` — retrieve for one metadata field**

Replace the `stripe.subscriptions.retrieve(subscriptionId)` with a read of `parent.subscription_details.metadata.packageName` (falling back to line-item metadata). `resolveInvoiceSubscriptionId` (`:123-150`) already walks that exact object for the sibling `subscription` key, so the traversal helper exists. **Only if Task 4 confirmed availability.**

- [ ] **Step 2: Remove `:3657` — a shortcut that never fires**

The "fewer round trips" guard at `:3585-3586` tests the pre-Basil top-level `invoice.subscription`, which stripe@18.5.0's `Invoice` interface does not declare — so the shortcut never fires and the retrieve runs on **every** renewal. Read the surrounding code, then take the subscription id from the already-expanded invoice.

- [ ] **Step 3: Remove `:3761` — unconditional pause_collection write**

This writes `pause_collection: ""` for members who were never paused. Read `src/services/subscription/SubscriptionCollectionPauseService.ts:45-49` and the pause policy, then make the write **conditional on the member actually being paused**.

- [ ] **Step 4: Verify no behaviour change**

```bash
npm run type-check && npm run lint && npm run test:zero-trial-guard && npm run test:ack-gate && npm test
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "perf(billing): drop three avoidable /v1/subscriptions calls per renewal"
```

Docs: `docs/billing-stripe/gotchas.md` — record calls-per-renewal before/after.

### Task 6: Shared client-side token bucket

**Files:**
- Create: `src/lib/stripe-rate-limiter.ts`
- Create: `src/lib/__tests__/stripe-rate-limiter.test.ts`
- Modify: `src/lib/stripe.ts:7`

**Why this is required, not optional.** Task 5 takes `/v1/subscriptions` to ~18/sec (safe) but global only to **~109/sec against the 100/sec cap** — still over, with zero headroom for growth. `maxNetworkRetries: 2` does not help: the SDK's retry logic (`node_modules/stripe/cjs/RequestSender.js:138-172`) has **no 429 branch**.

**Interfaces:**
- Produces: `acquire(endpoint: string): Promise<void>` — resolves when a token is available for both the global and the per-endpoint bucket

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { createRateLimiter } from "../stripe-rate-limiter";

async function run() {
  // 2 requests/sec globally: the third acquire must wait.
  const limiter = createRateLimiter({ globalPerSecond: 2, perEndpointPerSecond: 2 });
  const t0 = Date.now();
  await limiter.acquire("/v1/subscriptions");
  await limiter.acquire("/v1/subscriptions");
  await limiter.acquire("/v1/subscriptions");
  const elapsed = Date.now() - t0;
  assert.ok(elapsed >= 400, `third acquire waited (elapsed ${elapsed}ms)`);
  console.log("stripe-rate-limiter tests passed");
}
run().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx tsx src/lib/__tests__/stripe-rate-limiter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the token bucket**

Two buckets: global (default 100/sec) and per-endpoint (default 25/sec), both configurable via env with those defaults. Keep it dependency-free and synchronous-state — no Redis, no Mongo. **Note the limiter is per-lambda-instance**; document that limitation in the file header, because N concurrent instances multiply the effective rate. Size the defaults conservatively (e.g. global 80, per-endpoint 20) to leave room for that multiplication.

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx tsx src/lib/__tests__/stripe-rate-limiter.test.ts` → PASS

- [ ] **Step 5: Wire it into the Stripe singleton**

Wrap the export at `src/lib/stripe.ts:7` so every call routes through `acquire()`. A `Proxy` around the singleton is the least invasive option — **every Stripe call in the app already goes through this one export**, so nothing else needs touching. Do not add an `httpClient` override without reading the SDK's contract first.

- [ ] **Step 6: Verify and commit**

```bash
npm run type-check && npm run lint && npm run test:stripe-rate-limiter && npm test
git add -A
git commit -m "feat(billing): add shared client-side Stripe rate limiter"
```

---

# Phase 3 — Clear the renewal hour

### Task 7: Move heavy crons off 14:00/15:00 UTC and stop the snapshot overwrite

**Files:**
- Modify: `vercel.json` (crons array)
- Modify: `src/app/api/cron/membership-daily-snapshot/route.ts:28-31, 41-59`
- Docs: `docs/admin/backend.md`, `docs/metrics-analytics/`

14:00 UTC is 00:00 AEST — the renewal minute. **15:00Z is the true peak** (3,551 events vs 2,235), because Stripe finalizes drafts ~1 hour after creation. Both hours must be cleared.

- [ ] **Step 1: Reschedule in `vercel.json`**

Move `dashboard-stats-daily-snapshot` and `membership-daily-snapshot` off `0 14` **and** `0 15`. Pick a quiet window (e.g. `0 18`, `0 19`) and keep the existing two-run-per-day pattern if it is deliberate.

- [ ] **Step 2: Write the failing test for the write-once guard**

Both scheduled runs resolve to the **same date key** (`route.ts:28-31`) and the upsert at `:41-59` has no existence or `computedAt` check — so the later run overwrites the earlier one with post-burst numbers. Write a test asserting a second same-day invocation does not overwrite.

- [ ] **Step 3: Run it and verify it fails**

- [ ] **Step 4: Add the write-once guard**

Guard the upsert on the row not already existing for that date key, or on `computedAt` being absent.

- [ ] **Step 5: Run the test and verify it passes**

- [ ] **Step 6: Verify and commit**

```bash
npm run type-check && npm run lint
git add -A
git commit -m "fix(admin): move heavy snapshots off the renewal hour and stop same-day overwrite"
```

---

# Phase 4 — Make the charge cron finish

### Task 8: Sweep on last progress, not on start time

**Files:**
- Modify: `src/models/ChargeJobRun.ts` (add `lastProgressAt`)
- Modify: `src/server/admin/charge-past-due-totals.ts:11, ~100-113` (`isOrphanRun`)
- Modify: `src/server/admin/chargePastDueJob.ts:188-191` (the sweep query), `:830` (stamp progress)
- Create: `src/server/admin/__tests__/orphan-progress.test.ts`

**The bug, measured.** `ORPHAN_RUN_THRESHOLD_MS = 35 * 60 * 1000` (`charge-past-due-totals.ts:11`) and `sweepOrphanRuns` (`chargePastDueJob.ts:188-191`) selects on `startedAt: { $lt: cutoff }` — **elapsed since start, not since last activity**. Production runs take 36.5–39.0 min, so every one is killed mid-flight by the next 5-minute tick, having attempted ~420 of ~868. Consequences: 94% of each day's attempts are the same users as the day before, and **229 of 1,157 past-due members have never been attempted in 30 days**.

The lock **is** renewed each chunk (`renewLock`, `:215`), so a correct liveness signal already exists — the sweep just doesn't use it.

**Do NOT simply raise the threshold.** That moves the cliff without removing it and breaks again as the past-due population grows.

- [ ] **Step 1: Write the failing test**

`charge-past-due-totals.ts` is deliberately Stripe-free and Mongoose-free so it unit-tests without env or DB. Keep it that way.

```ts
import assert from "node:assert/strict";
import { isOrphanRun, ORPHAN_RUN_THRESHOLD_MS } from "../charge-past-due-totals";

function run() {
  const now = new Date("2026-08-24T08:00:00Z");
  const startedLongAgo = new Date(now.getTime() - 60 * 60 * 1000); // 60 min ago

  // A run started 60 min ago but which reported progress 1 min ago is ALIVE.
  assert.equal(
    isOrphanRun({ status: "running", startedAt: startedLongAgo, lastProgressAt: new Date(now.getTime() - 60 * 1000) }, now),
    false,
    "actively-progressing long run is not an orphan"
  );

  // Same run with no progress for longer than the threshold IS an orphan.
  assert.equal(
    isOrphanRun({ status: "running", startedAt: startedLongAgo, lastProgressAt: new Date(now.getTime() - ORPHAN_RUN_THRESHOLD_MS - 1000) }, now),
    true,
    "stalled run is an orphan"
  );

  // Backwards compatible: a legacy run with no lastProgressAt falls back to startedAt.
  assert.equal(
    isOrphanRun({ status: "running", startedAt: startedLongAgo }, now),
    true,
    "legacy run without lastProgressAt falls back to startedAt"
  );

  console.log("orphan-progress tests passed");
}
run();
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx tsx src/server/admin/__tests__/orphan-progress.test.ts`
Expected: FAIL — `isOrphanRun` does not accept `lastProgressAt`.

- [ ] **Step 3: Add `lastProgressAt` to the model**

`ChargeJobRun.ts` — the field **does not exist today**. Add it as an optional `Date` so existing documents remain valid.

- [ ] **Step 4: Make `isOrphanRun` progress-aware**

Key on `lastProgressAt ?? startedAt`. Keep the exported name and the existing parameter shape additive — **`emptyTotals`, `normalizeRunTotals`, `aggregateRunTotals` signatures must not change**, and the file must stay Stripe-free and Mongoose-free.

- [ ] **Step 5: Run the test and verify it passes**

Run: `npx tsx src/server/admin/__tests__/orphan-progress.test.ts` → PASS

- [ ] **Step 6: Stamp progress and use it in the sweep**

At `chargePastDueJob.ts:830` — the mid-run progress write, already guarded on `status: "running"` and already running once per non-final chunk — add the heartbeat:

```ts
await ChargeJobRun.updateOne(
  { _id: runObjId, status: "running" },
  { $set: { totals, lastProgressAt: new Date() } }
);
```

Then change the sweep query at `:188-191` to select on stalled progress rather than `startedAt`, with a fallback for legacy rows that have no `lastProgressAt`.

- [ ] **Step 7: Verify and commit**

```bash
npm run type-check && npm run lint && npm run test:orphan-progress
git add -A
git commit -m "fix(admin): sweep charge runs on last progress, not elapsed time"
```

Docs: `docs/admin/backend.md`, `docs/CHARGE_PAST_DUE_CUSTOMERS.md`.

### Task 9: Stop the tail starving, and alert on failure

**Files:**
- Modify: `src/services/admin/previewChargePastDueInvoices.ts` (ordering)
- Modify: `src/app/api/cron/charge-past-due/route.ts` (alerting)

- [ ] **Step 1: Confirm the current ordering**

The worklist comes from `previewChargePastDueInvoices()` → `stripe.invoices.list`. Read the call and **state in the commit message whether ordering is Stripe's default (newest-first) or something else** — this was inferred, not traced, during the investigation.

- [ ] **Step 2: Make ordering fair**

229 members have never been attempted in 30 days while others are hit 17–18 times. Order by least-recently-attempted (from `InvoiceChargeLog`) so the tail drains.

**Pair this with a per-invoice attempt cap** — without one, fairer ordering just spreads the hammering. Stripe support's guidance (quoted in `docs/billing-stripe/gotchas.md`) is **2–3 days between retries of the same transaction**.

- [ ] **Step 3: Alert on aborted runs and low success rate**

`console.error` a greppable line when a run finalizes `aborted`, or when success rate is below a threshold (currently ~2.9%).

- [ ] **Step 4: Verify and commit**

```bash
npm run type-check && npm run lint
git add -A
git commit -m "fix(admin): fair charge-worklist ordering with per-invoice attempt cap"
```

---

# Phase 5 — Unblock trial upgrades

### Task 10: Trial-aware upgrade that preserves anchor-24

**Files:**
- Modify: `src/app/api/stripe/upgrade-subscription-payment/route.ts:227-269, 275-303, 321, 439, 493-494`
- Modify: `src/services/stripe-webhook-handlers/__tests__/zero-trial-invoice-guard.test.ts` (add Case D)
- Docs: `docs/subscription/`, `docs/PAST_DUE_REANCHOR.md`, `BUSINESS.md`, `CUSTOMER.md`

**Mandatory pre-flight.** Read `docs/PAST_DUE_REANCHOR.md:9-26` in full before writing any code. This change sets `trial_end` on an **existing** subscription — checklist item 1 states that is exactly the case that auto-spawns a separate $0 `subscription_update` invoice, and item 8 requires **both** a classifier and a regression test.

**Three constraints the investigation surfaced that will otherwise break this:**
1. The route reads `updatedSubscription.latest_invoice` at `:275` and derives `prorationAmount` at `:295`, then **hard-fails at `:303`** if the amount is under half the expected charge. The trial re-apply must happen **after** those reads, or the $0 invoice becomes `latest_invoice` and the upgrade returns HTTP 500 "Upgrade pricing error".
2. Re-applying the trial leaves `updatedSubscription.status === "trialing"`, which fails the success branch at `:321` and the fallback at `:439`, dropping to the HTTP 500 at `:493-494`. **Those status checks must be widened to accept `trialing`.**
3. `docs/PAST_DUE_REANCHOR.md:42` — only `trial_end` can land the clamped 24th. **Do not use `billing_cycle_anchor` for the re-anchor.**

- [ ] **Step 1: Add the failing regression case (Case D)**

Add to the existing `try` block in `zero-trial-invoice-guard.test.ts`, reusing `dispatchWith`. Case D asserts that the $0 `subscription_update` invoice spawned by the trial re-apply is skipped, while the real paid `subscription_update` upgrade invoice still grants. Cases A/B/C must continue to pass unchanged.

While editing, fix the stale doc-comment reference: it says the guard returns at `index.ts:3276`; it is **`:3490`** today.

- [ ] **Step 2: Run it and verify it fails**

Run: `npm run test:zero-trial-guard`
Expected: FAIL on Case D.

- [ ] **Step 3: Implement the trial-aware upgrade**

For a `trialing` member: end trial → charge now → re-apply the anchor-24 `trial_end` for the next cycle, **after** the `latest_invoice`/proration reads. Find the existing helper that computes the clamped 24th (used by the join-anchor rule and `migrate-anchor-billing-24`) and reuse it — **do not re-derive the date**.

- [ ] **Step 4: Widen the status checks**

`:321` and `:439` must accept `trialing` as a success state. Per `docs/PAST_DUE_REANCHOR.md:46`, a `trialing` member is fully paid and active, and the member UI already maps `trialing` → "Active".

- [ ] **Step 5: Run the tests and verify they pass**

```bash
npm run test:zero-trial-guard   # all four cases
npm run test:trial-invoice
npm test                        # anchor-billing
```

- [ ] **Step 6: Verify, update docs, commit**

Update `BUSINESS.md` and `CUSTOMER.md` — this changes the documented upgrade journey for a real cohort (CLAUDE.md rules 5 and 5b are hook-enforced and will block otherwise).

```bash
npm run type-check && npm run lint
git add -A
git commit -m "fix(subscription): allow tier upgrade for anchor-24 trialing members"
```

---

# Final: push

Only after **every** task above is complete and all checks pass.

- [ ] **Step 1: Full verification**

```bash
npm run type-check
npm run lint
npm test
npm run test:zero-trial-guard
npm run test:trial-invoice
npm run test:ack-gate
npm run test:renewal-grant-reconciler
npm run test:stripe-rate-limiter
npm run test:orphan-progress
npm run check:env
```

- [ ] **Step 2: Push both branches**

```bash
git push -u origin fix/backfill-missing-renewal-grants
git push -u origin feature/renewal-surge
```

- [ ] **Step 3: Open PRs** — do not merge without review. `main` auto-deploys to production.

---

## Notes for the executor

- **Phase 0 is time-boxed.** If it is past 8:00pm AEST 27 Aug, stop and report — the remediation still runs, but entries land in September and the member communication changes.
- **Task 4 gates Task 5.** Do not remove the `:172` call on the assumption metadata is present on drafts.
- **If the Phase 0 dry run does not report exactly 11 gaps, stop and report.**
- Two of the investigation's conclusions were reversed by adversarial verification (the "negative retry buffer" and "connection exhaustion"). If a step's premise does not match what you find in the code, **stop and report rather than adapting the code to the plan**.
