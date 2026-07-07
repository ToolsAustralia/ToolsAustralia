# Past-Due Charge — Phase 0 Allowlist Sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before a bulk past-due charge run charges anything, allowlist every *eligible* blocked card belonging to that run's customers, so their `invoices.pay` retry reaches the issuer instead of dying at Stripe's Radar/issuer block.

**Architecture:** Extract the sweep currently inlined in `scripts/sync-allowlist-from-blocked-transactions.ts` into a reusable `reconcileAllowlistFromBlocked` service in `src/services/allowlist/`. Wire it as **Phase 0** inside `startChargePastDueJob` (after the worklist snapshot, before any chunk charges), scoped to the run's Stripe customers. Refactor the existing script to call the same service. No cron (deferred). No change to `payOpenInvoiceAsPastDueAdmin`.

**Tech Stack:** Next.js 15 App Router, MongoDB/Mongoose, Stripe (Radar value lists), TypeScript, standalone `tsx` test scripts (no jest/vitest).

## Global Constraints

- **No auto-commit (CLAUDE.md §1).** Commit steps are the intended rhythm, but the executing agent MUST have explicit user authorization (`commit`/`push`/`ship it`/etc.) before running `git commit`. If not yet authorized, complete the task's code + tests and ask before committing.
- **Layering (`.cursorrules`).** `app/server → services → models`. The allowlist service must never import from `server/admin` or route handlers. No business logic in route handlers or components.
- **Console stripping.** Production/serverless builds strip `console.log/info/debug/warn`. Cron/route/webhook code that must log uses `console.error`. `scripts/*.ts` run via `tsx` (not stripped) — `console.log` is fine there.
- **Eligibility gate is fixed.** Reuse `AllowlistService.evaluate/apply` exactly: paying member AND not fraud-signal AND not permanent-issue. `allowOverride` stays **false** for Phase 0 and the script.
- **Idempotency.** `apply()` already short-circuits fingerprints already on the list; re-running is safe.
- **Naming (user global rule).** Reuse existing terms: `allowlist`, `BlockedTransaction`, `cardFingerprint`, `admin_bulk`, `EvalInput`, `ReconcileSummary`. Do not coin synonyms.

---

## File Structure

- **Create** `src/services/allowlist/reconcileAllowlistFromBlocked.ts` — the reusable sweep: scope → blocked fingerprints → eligibility-gated allowlist, returns a tally. One responsibility: reconcile the Radar allowlist from `BlockedTransaction` for a given scope.
- **Create** `src/services/allowlist/__tests__/reconcileAllowlistFromBlocked.test.ts` — unit tests for the core loop with a fake applier.
- **Modify** `src/services/allowlist/AllowlistService.ts` — add a small public `isAllowlisted(fingerprint)` read method.
- **Modify** `scripts/sync-allowlist-from-blocked-transactions.ts` — call the shared service instead of holding its own aggregation + apply loop.
- **Modify** `src/server/admin/chargePastDueJob.ts` — run Phase 0 inside `startChargePastDueJob`; extend `StartChargeJobResult`.
- **Modify** `src/components/admin/ChargePastDueModal.tsx` — surface the Phase 0 summary.
- **Modify** `package.json` — add `test:allowlist-reconcile`.
- **Modify** `docs/billing-stripe/gotchas.md`, `docs/admin/*`, `BUSINESS.md` — doc sync.

---

## Task 1: Core reconcile loop + `isAllowlisted` (pure, unit-tested)

**Files:**
- Modify: `src/services/allowlist/AllowlistService.ts` (add method after `getStats`, ~line 533)
- Create: `src/services/allowlist/reconcileAllowlistFromBlocked.ts`
- Create: `src/services/allowlist/__tests__/reconcileAllowlistFromBlocked.test.ts`
- Modify: `package.json` (scripts section)

**Interfaces:**
- Consumes: `EvalInput`, `EvalResult`, `ApplySource` from `../types`; `IAllowlistAction`; `AllowlistService.evaluate/apply`.
- Produces:
  - `AllowlistService.isAllowlisted(cardFingerprint: string): Promise<boolean>`
  - `type ReconcileScope = { kind: "customers"; stripeCustomerIds: string[]; emails?: string[] } | { kind: "window"; since?: Date; limit?: number }`
  - `type ReconcileSummary = { evaluated: number; added: number; alreadyAllowlisted: number; skipped: { fraud: number; permanent: number; notMember: number }; errored: number }`
  - `interface AllowlistApplier { isAllowlisted; evaluate; apply }`
  - `reconcileBlockedFingerprints(inputs: EvalInput[], opts: ReconcileOptions): Promise<ReconcileSummary>`
  - `type ReconcileOptions = { performedByUserId: Types.ObjectId | null; dryRun?: boolean; throttleMs?: number; maxRetries429?: number; service?: AllowlistApplier; onProgress?; onItem?; sleepFn? }`

- [ ] **Step 1: Add `isAllowlisted` to `AllowlistService`**

In `src/services/allowlist/AllowlistService.ts`, add this method inside the class (e.g. right after `getStats`):

```ts
  /**
   * True if this card fingerprint currently has an active "added" AllowlistAction
   * (i.e. it is on Stripe's allowlist). Read-only; used by the reconcile sweep to
   * count "already allowlisted" and skip a redundant apply().
   */
  async isAllowlisted(cardFingerprint: string): Promise<boolean> {
    const existing = await this.repo.findActiveAddedActionByFingerprint(cardFingerprint);
    return !!existing;
  }
```

- [ ] **Step 2: Write the core module**

Create `src/services/allowlist/reconcileAllowlistFromBlocked.ts`:

```ts
import type { Types } from "mongoose";
import BlockedTransaction from "@/models/BlockedTransaction";
import type { IAllowlistAction } from "@/models/AllowlistAction";
import type { ApplySource, EvalInput, EvalResult } from "./types";
import { getAllowlistService } from "./index";

/** Scope of a reconcile sweep. Phase 0 uses "customers"; script/future cron use "window". */
export type ReconcileScope =
  | { kind: "customers"; stripeCustomerIds: string[]; emails?: string[] }
  | { kind: "window"; since?: Date; limit?: number };

export type ReconcileSummary = {
  evaluated: number;
  added: number;
  alreadyAllowlisted: number;
  skipped: { fraud: number; permanent: number; notMember: number };
  errored: number;
};

/** The subset of AllowlistService the loop needs — lets tests pass a fake. */
export interface AllowlistApplier {
  isAllowlisted(cardFingerprint: string): Promise<boolean>;
  evaluate(input: EvalInput): Promise<EvalResult>;
  apply(
    input: EvalInput,
    source: ApplySource,
    performedByUserId: Types.ObjectId | null,
    allowOverride?: boolean
  ): Promise<IAllowlistAction>;
}

export type ReconcileItemOutcome = "added" | "already" | "skipped" | "errored";

export type ReconcileOptions = {
  performedByUserId: Types.ObjectId | null;
  /** true → call evaluate() only (no Stripe/DB writes). */
  dryRun?: boolean;
  /** Delay between live applies (Stripe rate-limit headroom). Default 100ms. */
  throttleMs?: number;
  /** App-level 429 retry budget per fingerprint. Default 3. */
  maxRetries429?: number;
  /** Injectable for tests. Defaults to the process singleton. */
  service?: AllowlistApplier;
  onProgress?: (p: { processed: number; total: number; added: number }) => void;
  onItem?: (r: { input: EvalInput; outcome: ReconcileItemOutcome; reason?: string }) => void;
  /** Injectable for tests (avoid real delays). */
  sleepFn?: (ms: number) => Promise<void>;
};

const DEFAULT_THROTTLE_MS = 100;
const DEFAULT_MAX_RETRIES_429 = 3;
const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function getRetryAfterMs(err: unknown, attempt: number): number {
  const raw =
    err && typeof err === "object" && "raw" in err
      ? (err as { raw?: { headers?: Record<string, string> } }).raw
      : undefined;
  const retryAfter = raw?.headers?.["retry-after"];
  if (retryAfter != null) {
    const sec = parseInt(retryAfter, 10);
    if (!Number.isNaN(sec)) return Math.min(sec * 1000, 60_000);
  }
  return 5000 * Math.pow(2, attempt);
}

function bucketReason(reason: string, s: ReconcileSummary["skipped"]): void {
  if (reason === "filter_fraud_signal") s.fraud += 1;
  else if (reason === "filter_permanent_issue") s.permanent += 1;
  else if (reason === "filter_not_member") s.notMember += 1;
}

type BlockedLatest = {
  paymentIntentId: string;
  chargeId: string;
  cardFingerprint: string;
  cardLast4: string;
  cardBrand: string;
  stripeCustomerId: string | null;
  customerEmail: string | null;
  declineCode: string | null;
  failureCode: string | null;
};

/**
 * Aggregate `blockedtransactions` down to one EvalInput per unique card
 * fingerprint (most-recent block wins — freshest customer/decline context).
 */
export async function loadBlockedFingerprints(scope: ReconcileScope): Promise<EvalInput[]> {
  const match: Record<string, unknown> = {};
  if (scope.kind === "customers") {
    const or: Array<Record<string, unknown>> = [];
    if (scope.stripeCustomerIds.length) or.push({ stripeCustomerId: { $in: scope.stripeCustomerIds } });
    if (scope.emails?.length) or.push({ customerEmail: { $in: scope.emails } });
    if (or.length === 0) return [];
    match.$or = or;
  } else if (scope.since) {
    match.createdAt = { $gte: scope.since };
  }

  const pipeline: Record<string, unknown>[] = [
    { $match: match },
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$cardFingerprint", latest: { $first: "$$ROOT" } } },
  ];
  if (scope.kind === "window" && scope.limit && Number.isFinite(scope.limit)) {
    pipeline.push({ $limit: scope.limit });
  }

  const groups = await BlockedTransaction.aggregate<{ _id: string; latest: BlockedLatest }>(pipeline);
  return groups.map((g) => ({
    cardFingerprint: g.latest.cardFingerprint,
    cardLast4: g.latest.cardLast4,
    cardBrand: g.latest.cardBrand,
    stripeCustomerId: g.latest.stripeCustomerId,
    customerEmail: g.latest.customerEmail,
    declineCode: g.latest.declineCode,
    failureCode: g.latest.failureCode,
    triggeringPaymentIntentId: g.latest.paymentIntentId,
    triggeringChargeId: g.latest.chargeId,
  }));
}

/**
 * Core loop: for each unique fingerprint, skip if already allowlisted, else
 * apply() (or evaluate() in dryRun). Eligibility gating + Stripe write live in
 * apply(). Pure w.r.t. Mongo — takes pre-loaded inputs and an injectable service.
 */
export async function reconcileBlockedFingerprints(
  inputs: EvalInput[],
  opts: ReconcileOptions
): Promise<ReconcileSummary> {
  const service = opts.service ?? getAllowlistService();
  const throttleMs = opts.throttleMs ?? DEFAULT_THROTTLE_MS;
  const maxRetries429 = opts.maxRetries429 ?? DEFAULT_MAX_RETRIES_429;
  const sleepFn = opts.sleepFn ?? realSleep;
  const dryRun = opts.dryRun ?? false;

  const summary: ReconcileSummary = {
    evaluated: 0,
    added: 0,
    alreadyAllowlisted: 0,
    skipped: { fraud: 0, permanent: 0, notMember: 0 },
    errored: 0,
  };

  for (const input of inputs) {
    summary.evaluated += 1;

    if (await service.isAllowlisted(input.cardFingerprint)) {
      summary.alreadyAllowlisted += 1;
      opts.onItem?.({ input, outcome: "already" });
      opts.onProgress?.({ processed: summary.evaluated, total: inputs.length, added: summary.added });
      continue;
    }

    if (dryRun) {
      try {
        const r = await service.evaluate(input);
        if (r.eligible) {
          summary.added += 1;
          opts.onItem?.({ input, outcome: "added" });
        } else {
          bucketReason(r.reason, summary.skipped);
          opts.onItem?.({ input, outcome: "skipped", reason: r.reason });
        }
      } catch (err) {
        summary.errored += 1;
        opts.onItem?.({ input, outcome: "errored", reason: err instanceof Error ? err.message : String(err) });
      }
      opts.onProgress?.({ processed: summary.evaluated, total: inputs.length, added: summary.added });
      continue;
    }

    // Live: apply() with app-level 429 retry.
    let attempt = 0;
    for (;;) {
      try {
        const action = await service.apply(input, "admin_bulk", opts.performedByUserId, false);
        if (action.action === "added") {
          summary.added += 1;
          opts.onItem?.({ input, outcome: "added" });
        } else if (action.action === "skipped") {
          bucketReason(action.reason, summary.skipped);
          opts.onItem?.({ input, outcome: "skipped", reason: action.reason });
        }
        break;
      } catch (err) {
        const status =
          (err as { statusCode?: number; status?: number } | null)?.statusCode ??
          (err as { statusCode?: number; status?: number } | null)?.status;
        if (status === 429 && attempt < maxRetries429) {
          attempt += 1;
          await sleepFn(getRetryAfterMs(err, attempt));
          continue;
        }
        summary.errored += 1;
        opts.onItem?.({ input, outcome: "errored", reason: err instanceof Error ? err.message : String(err) });
        break;
      }
    }
    await sleepFn(throttleMs);
    opts.onProgress?.({ processed: summary.evaluated, total: inputs.length, added: summary.added });
  }

  return summary;
}

/** Load the scope's blocked fingerprints, then reconcile them. */
export async function reconcileAllowlistFromBlocked(
  scope: ReconcileScope,
  opts: ReconcileOptions
): Promise<ReconcileSummary> {
  const inputs = await loadBlockedFingerprints(scope);
  return reconcileBlockedFingerprints(inputs, opts);
}
```

- [ ] **Step 3: Write the failing test**

Create `src/services/allowlist/__tests__/reconcileAllowlistFromBlocked.test.ts`:

```ts
import assert from "node:assert/strict";
import { Types } from "mongoose";
import type { IAllowlistAction } from "@/models/AllowlistAction";
import type { EvalInput, EvalResult } from "../types";
import {
  reconcileBlockedFingerprints,
  type AllowlistApplier,
} from "../reconcileAllowlistFromBlocked";

const noSleep = async () => {};

function makeInput(overrides: Partial<EvalInput> = {}): EvalInput {
  return {
    cardFingerprint: "fp_1",
    cardLast4: "4242",
    cardBrand: "visa",
    stripeCustomerId: "cus_1",
    customerEmail: "u@example.com",
    declineCode: "do_not_honor",
    failureCode: null,
    triggeringPaymentIntentId: "pi_1",
    triggeringChargeId: "ch_1",
    ...overrides,
  };
}

function addedAction(reason: IAllowlistAction["reason"] = "manual_admin"): IAllowlistAction {
  return { action: "added", reason } as unknown as IAllowlistAction;
}
function skippedAction(reason: IAllowlistAction["reason"]): IAllowlistAction {
  return { action: "skipped", reason } as unknown as IAllowlistAction;
}

function fakeService(overrides: Partial<AllowlistApplier> = {}): {
  service: AllowlistApplier;
  calls: { isAllowlisted: number; evaluate: number; apply: number };
} {
  const calls = { isAllowlisted: 0, evaluate: 0, apply: 0 };
  const service: AllowlistApplier = {
    isAllowlisted: async (fp) => {
      calls.isAllowlisted += 1;
      return overrides.isAllowlisted ? overrides.isAllowlisted(fp) : false;
    },
    evaluate: async (input) => {
      calls.evaluate += 1;
      return overrides.evaluate
        ? overrides.evaluate(input)
        : ({ eligible: true, userId: null } as EvalResult);
    },
    apply: async (input, source, performedBy, allowOverride) => {
      calls.apply += 1;
      return overrides.apply
        ? overrides.apply(input, source, performedBy, allowOverride)
        : addedAction();
    },
  };
  return { service, calls };
}

async function testEligibleLiveAdds() {
  const { service, calls } = fakeService();
  const s = await reconcileBlockedFingerprints([makeInput()], {
    performedByUserId: null,
    sleepFn: noSleep,
    service,
  });
  assert.equal(s.evaluated, 1);
  assert.equal(s.added, 1);
  assert.equal(calls.apply, 1);
}

async function testAlreadyAllowlistedShortCircuits() {
  const { service, calls } = fakeService({ isAllowlisted: async () => true });
  const s = await reconcileBlockedFingerprints([makeInput()], {
    performedByUserId: null,
    sleepFn: noSleep,
    service,
  });
  assert.equal(s.alreadyAllowlisted, 1);
  assert.equal(s.added, 0);
  assert.equal(calls.apply, 0, "must not call apply for already-allowlisted");
}

async function testSkipBucketsByReason() {
  const { service } = fakeService({
    apply: async (input) =>
      input.declineCode === "lost_card"
        ? skippedAction("filter_fraud_signal")
        : skippedAction("filter_not_member"),
  });
  const s = await reconcileBlockedFingerprints(
    [makeInput({ cardFingerprint: "fp_a", declineCode: "lost_card" }), makeInput({ cardFingerprint: "fp_b", declineCode: "do_not_honor" })],
    { performedByUserId: null, sleepFn: noSleep, service }
  );
  assert.equal(s.skipped.fraud, 1);
  assert.equal(s.skipped.notMember, 1);
  assert.equal(s.added, 0);
}

async function testErrorCounts() {
  const { service } = fakeService({
    apply: async () => {
      throw new Error("boom");
    },
  });
  const s = await reconcileBlockedFingerprints([makeInput()], {
    performedByUserId: null,
    sleepFn: noSleep,
    service,
  });
  assert.equal(s.errored, 1);
  assert.equal(s.added, 0);
}

async function testRetriesOn429ThenSucceeds() {
  let n = 0;
  const { service, calls } = fakeService({
    apply: async () => {
      n += 1;
      if (n === 1) {
        const err = new Error("rate limited") as Error & { statusCode?: number };
        err.statusCode = 429;
        throw err;
      }
      return addedAction();
    },
  });
  const s = await reconcileBlockedFingerprints([makeInput()], {
    performedByUserId: null,
    sleepFn: noSleep,
    service,
  });
  assert.equal(s.added, 1, "429 then success → added");
  assert.equal(s.errored, 0);
  assert.equal(calls.apply, 2, "one retry");
}

async function testDryRunUsesEvaluateNotApply() {
  const { service, calls } = fakeService({
    evaluate: async () => ({ eligible: false, reason: "filter_permanent_issue" }),
  });
  const s = await reconcileBlockedFingerprints([makeInput({ declineCode: "expired_card" })], {
    performedByUserId: null,
    dryRun: true,
    sleepFn: noSleep,
    service,
  });
  assert.equal(calls.apply, 0, "dryRun must not apply");
  assert.equal(calls.evaluate, 1);
  assert.equal(s.skipped.permanent, 1);
}

async function testTalliesAreConsistent() {
  const { service } = fakeService({
    isAllowlisted: async (fp) => fp === "fp_already",
    apply: async (input) =>
      input.cardFingerprint === "fp_ok" ? addedAction() : skippedAction("filter_not_member"),
  });
  const inputs = [
    makeInput({ cardFingerprint: "fp_already" }),
    makeInput({ cardFingerprint: "fp_ok" }),
    makeInput({ cardFingerprint: "fp_skip" }),
  ];
  const s = await reconcileBlockedFingerprints(inputs, {
    performedByUserId: null,
    sleepFn: noSleep,
    service,
  });
  const bucketSum = s.skipped.fraud + s.skipped.permanent + s.skipped.notMember;
  assert.equal(s.evaluated, 3);
  assert.equal(s.added + s.alreadyAllowlisted + bucketSum + s.errored, s.evaluated);
}

async function run() {
  await testEligibleLiveAdds();
  await testAlreadyAllowlistedShortCircuits();
  await testSkipBucketsByReason();
  await testErrorCounts();
  await testRetriesOn429ThenSucceeds();
  await testDryRunUsesEvaluateNotApply();
  await testTalliesAreConsistent();
  console.log("reconcileAllowlistFromBlocked tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Add the test script to `package.json`**

Add next to the other `test:*` entries:

```json
    "test:allowlist-reconcile": "tsx src/services/allowlist/__tests__/reconcileAllowlistFromBlocked.test.ts",
```

- [ ] **Step 5: Run the test — verify it passes**

Run: `npm run test:allowlist-reconcile`
Expected: `reconcileAllowlistFromBlocked tests passed` (exit 0).

- [ ] **Step 6: Type-check**

Run: `npm run type-check`
Expected: no new errors.

- [ ] **Step 7: Commit** (only if commits are authorized this session — see Global Constraints)

```bash
git add src/services/allowlist/reconcileAllowlistFromBlocked.ts src/services/allowlist/__tests__/reconcileAllowlistFromBlocked.test.ts src/services/allowlist/AllowlistService.ts package.json
git commit -m "feat(allowlist): reusable reconcileAllowlistFromBlocked sweep + isAllowlisted"
```

---

## Task 2: Refactor the sync script onto the shared service

Proves the extraction: after this, `npm run sync:allowlist-from-blocked:dry` against prod must reproduce the same buckets it does today (baseline 2026-07-03: 455 unique / 422 already / 9 would-add / 2 fraud / 22 not-member / 0 error).

**Files:**
- Modify: `scripts/sync-allowlist-from-blocked-transactions.ts`

**Interfaces:**
- Consumes: `reconcileAllowlistFromBlocked`, `ReconcileScope`, `ReconcileSummary` from `../src/services/allowlist/reconcileAllowlistFromBlocked`.

- [ ] **Step 1: Replace the script body's aggregation + apply loop with a call to the service**

Keep the file's CLI shell (arg parsing for `--dry-run` / `--limit` / `--no-limit`, `formatDuration`, env guards, `connectDB`). Replace the section from the `BlockedTransaction.aggregate(...)` pipeline through the per-card loop and counters (roughly the current lines 134–283) with:

```ts
  const { reconcileAllowlistFromBlocked } = await import(
    "../src/services/allowlist/reconcileAllowlistFromBlocked"
  );

  const startMs = Date.now();
  let lastLoggedAt = 0;

  const summary = await reconcileAllowlistFromBlocked(
    { kind: "window", limit: NO_LIMIT ? undefined : LIMIT },
    {
      performedByUserId: null,
      dryRun: DRY_RUN,
      throttleMs: DELAY_BETWEEN_APPLIES_MS,
      maxRetries429: MAX_RETRIES_429,
      onItem: ({ input, outcome, reason }) => {
        if (outcome === "added") {
          console.log(
            `${DRY_RUN ? "[dry] would ADD " : "  ADDED  "} ${input.cardFingerprint} ${input.cardBrand} ••${input.cardLast4} ${input.customerEmail ?? "—"}`
          );
        } else if (outcome === "skipped" && DRY_RUN) {
          console.log(
            `[dry] would SKIP  ${input.cardFingerprint} ${input.cardBrand} ••${input.cardLast4} reason=${reason}`
          );
        } else if (outcome === "errored") {
          console.error(`  ERROR for ${input.cardFingerprint}: ${reason}`);
        }
      },
      onProgress: ({ processed, total, added }) => {
        const now = Date.now();
        if (processed !== total && now - lastLoggedAt < 2000) return; // adaptive cadence
        lastLoggedAt = now;
        const fraction = processed / Math.max(1, total);
        const elapsedMs = Math.max(1, now - startMs);
        const etaMs = fraction > 0.005 ? Math.max(0, elapsedMs / fraction - elapsedMs) : 0;
        console.log(
          `  [${(fraction * 100).toFixed(1)}%] processed=${processed}/${total} added=${added} elapsed=${formatDuration(elapsedMs)} eta=${fraction > 0.005 ? formatDuration(etaMs) : "—"}`
        );
      },
    }
  );

  const totalSkipped = summary.skipped.fraud + summary.skipped.permanent + summary.skipped.notMember;
  console.log("\nSummary:");
  console.log(`  Elapsed:                ${formatDuration(Date.now() - startMs)}`);
  console.log(`  Unique fingerprints:    ${summary.evaluated}`);
  console.log(`  Added to allowlist:     ${summary.added}${DRY_RUN ? " (would-add, dry-run)" : ""}`);
  console.log(`  Already allowlisted:    ${summary.alreadyAllowlisted}`);
  console.log(`  Skipped (filter):       ${totalSkipped}`);
  console.log(`    fraud signal:         ${summary.skipped.fraud}`);
  console.log(`    permanent issue:      ${summary.skipped.permanent}`);
  console.log(`    not member:           ${summary.skipped.notMember}`);
  console.log(`  Errored:                ${summary.errored}`);

  await (await import("mongoose")).default.disconnect();
  process.exit(summary.errored > 0 ? 2 : 0);
```

Remove now-unused locals (`getRetryAfterMs`, `sleep`, `EligibilityBucket`, the `skipBucket` map, `AllowlistAction`/`getAllowlistService`/`BlockedTransaction` imports if no longer referenced). Keep `DELAY_BETWEEN_APPLIES_MS`, `MAX_RETRIES_429`, `formatDuration`, `LIMIT`, `NO_LIMIT`, `DRY_RUN`.

- [ ] **Step 2: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: no errors (fix any unused-var lint per `docs/UNUSED-VARS-CONVENTIONS.md` — delete, don't `_`-prefix).

- [ ] **Step 3: Verify against prod (read-only) — buckets must match baseline**

Run (Git Bash; prod creds pre-exported so dotenv's `.env.local` load does not override them):

```bash
MONGODB_URI="$(grep -E '^MONGODB_URI=' .env.production | head -1 | sed -E 's/^MONGODB_URI=//; s/\r$//; s/^"(.*)"$/\1/')" \
STRIPE_SECRET_KEY="$(grep -E '^STRIPE_SECRET_KEY=' .env.production | head -1 | sed -E 's/^STRIPE_SECRET_KEY=//; s/\r$//; s/^"(.*)"$/\1/')" \
npx tsx scripts/sync-allowlist-from-blocked-transactions.ts --dry-run --no-limit 2>&1 | grep -vE '^\[dry\] would '
```

Expected summary (±small drift as new blocks arrive): `Unique fingerprints: ~455`, `Already allowlisted: ~422`, `Added: ~9`, `fraud: 2`, `not member: ~22`, `Errored: 0`.

- [ ] **Step 4: Commit** (if authorized)

```bash
git add scripts/sync-allowlist-from-blocked-transactions.ts
git commit -m "refactor(allowlist): sync script delegates to reconcileAllowlistFromBlocked"
```

---

## Task 3: Phase 0 inside `startChargePastDueJob`

**Files:**
- Modify: `src/server/admin/chargePastDueJob.ts`

**Interfaces:**
- Consumes: `reconcileAllowlistFromBlocked`, `ReconcileSummary`.
- Produces: `StartChargeJobResult.allowlist?: ReconcileSummary` (flows through the route via the existing `...result` spread — no route change).

- [ ] **Step 1: Import the service + extend the result type**

Add import near the top of `src/server/admin/chargePastDueJob.ts`:

```ts
import {
  reconcileAllowlistFromBlocked,
  type ReconcileSummary,
} from "@/services/allowlist/reconcileAllowlistFromBlocked";
```

Extend `StartChargeJobResult`:

```ts
export interface StartChargeJobResult {
  runId: string;
  total: number;
  /** True when there was nothing eligible — the run is finalized immediately. */
  done: boolean;
  /** Phase 0 sweep summary. Absent if the run was empty or the sweep threw. */
  allowlist?: ReconcileSummary;
}
```

- [ ] **Step 2: Run Phase 0 after the worklist snapshot, before returning**

In `startChargePastDueJob`, after `ChargeJobWorklist.create({ runId, items: worklistItems })` and the empty-worklist early return, and before `return { runId: String(runId), total: worklistItems.length, done: false };`, insert:

```ts
    // PHASE 0 — allowlist eligible blocked cards for THIS run's customers before
    // any chunk charges them. Best-effort: a sweep failure must never abort the
    // run (allowlisting is an optimization, collection is the job). Runs inside
    // the lock; bounded by the run's blocked-and-not-yet-allowlisted subset.
    let allowlist: ReconcileSummary | undefined;
    try {
      const stripeCustomerIds = Array.from(
        new Set(worklistItems.map((i) => i.customerId).filter(Boolean))
      );
      allowlist = await reconcileAllowlistFromBlocked(
        { kind: "customers", stripeCustomerIds },
        { performedByUserId: new mongoose.Types.ObjectId(adminId) }
      );
    } catch (sweepErr) {
      console.error(
        `[chargePastDue] Phase 0 allowlist sweep failed for run ${String(runId)}:`,
        sweepErr instanceof Error ? sweepErr.message : sweepErr
      );
    }

    return { runId: String(runId), total: worklistItems.length, done: false, allowlist };
```

Note: `console.error` (not `console.log`) — this runs in a serverless build where `console.log` is stripped.

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 4: Verify existing charge-job tests still pass (if any exist)**

Run: `grep -l "charge-past-due\|chargePastDue" package.json` then run any matching `test:*` script. If none exist, skip.
Expected: pass.

- [ ] **Step 5: Commit** (if authorized)

```bash
git add src/server/admin/chargePastDueJob.ts
git commit -m "feat(admin): Phase 0 allowlist sweep before bulk past-due charge"
```

---

## Task 4: Surface the Phase 0 summary in the modal

**Files:**
- Modify: `src/components/admin/ChargePastDueModal.tsx`

**Interfaces:**
- Consumes: `start.allowlist` (shape = `ReconcileSummary`) from the `start` POST response (line ~220).

- [ ] **Step 1: Extend the `StartResponse` interface**

Find the `StartResponse` interface (near line 81) and add the optional field:

```ts
  allowlist?: {
    evaluated: number;
    added: number;
    alreadyAllowlisted: number;
    skipped: { fraud: number; permanent: number; notMember: number };
    errored: number;
  };
```

- [ ] **Step 2: Add state + capture it from the start response**

Add state near the other `useState` calls (~line 118):

```tsx
  const [allowlistSummary, setAllowlistSummary] = useState<StartResponse["allowlist"] | null>(null);
```

Immediately after `const start: StartResponse = await post({ action: "start", confirmation: "CHARGE" });` (line ~220):

```tsx
      setAllowlistSummary(start.allowlist ?? null);
```

Reset it in the reset handler (near `setState("idle")`, ~line 281 and where results reset, ~line 288):

```tsx
    setAllowlistSummary(null);
```

- [ ] **Step 3: Render a summary line**

In the completed/results view (near the results summary block, ~line 499), render when present:

```tsx
              {allowlistSummary && allowlistSummary.added > 0 && (
                <div className="mb-3 text-sm text-blue-700 dark:text-blue-300">
                  Allowlisted {allowlistSummary.added} previously-blocked{" "}
                  {allowlistSummary.added === 1 ? "card" : "cards"} before charging
                  {allowlistSummary.alreadyAllowlisted > 0
                    ? ` (${allowlistSummary.alreadyAllowlisted} already on the list)`
                    : ""}
                  .
                </div>
              )}
```

- [ ] **Step 4: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit** (if authorized)

```bash
git add src/components/admin/ChargePastDueModal.tsx
git commit -m "feat(admin): show Phase 0 allowlist summary in charge-past-due modal"
```

---

## Task 5: Docs, BUSINESS.md, manifest

**Files:**
- Modify: `docs/billing-stripe/gotchas.md`
- Modify: `docs/admin/backend.md` (and `docs/admin/gotchas.md` if it references the flow)
- Modify: `BUSINESS.md`

- [ ] **Step 1: Update `docs/billing-stripe/gotchas.md`**

In the "Past-due bulk charge hitting blocked-card failures (Phase B.5 sweep)" section, add a note that the manual pre-run sync is now **automated as Phase 0** of the charge run (`reconcileAllowlistFromBlocked` scoped to the run's customers, inside `startChargePastDueJob`), and that the one-time script remains the full-history catch-up. Keep the incident history intact.

- [ ] **Step 2: Update `docs/admin/backend.md`**

Document that `startChargePastDueJob` runs a best-effort Phase 0 allowlist sweep before chunk charging, returns `allowlist: ReconcileSummary` in the `start` response, and the modal surfaces it. Note it never blocks the run.

- [ ] **Step 3: Update `BUSINESS.md` §9**

The past-due recovery flow now allowlists eligible blocked cards before charging. Add one line to §9 (past-due recovery). This satisfies CLAUDE.md §5 (past-due-recovery-flow change is a business trigger). Verify the doc-sync `Stop` hook is satisfied (it requires a root doc touch when a business-material source path changed).

- [ ] **Step 4: Run doc-sync + full verification**

Run: `npm run type-check && npm run lint && npm run test:allowlist-reconcile`
Then trigger the doc-sync check per repo convention (the `Stop` hook runs automatically; if it blocks with `STALE BUSINESS DOCS` or `Stale docs`, address the listed files).
Expected: all pass; no stale-doc block.

- [ ] **Step 5: Commit** (if authorized)

```bash
git add docs/billing-stripe/gotchas.md docs/admin/backend.md docs/admin/gotchas.md BUSINESS.md
git commit -m "docs: Phase 0 allowlist sweep in past-due charge flow"
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- Core reusable `reconcileAllowlistFromBlocked` → Task 1. ✓
- Refactor script onto it (dedup) → Task 2. ✓
- Phase 0 in `startChargePastDueJob`, scoped to run's customers, before chunks → Task 3. ✓
- Ordering guarantee (whole sweep in `start`, before any `chunk`) → Task 3 (structural). ✓
- Best-effort, never blocks collection → Task 3 Step 2 (inner try/catch). ✓
- Same eligibility gate, `allowOverride: false` → Task 1 (apply call), Task 3. ✓
- Observability (summary returned + modal) → Task 3 result field + Task 4. ✓
- Expected-result verification → Task 2 Step 3 (prod dry-run buckets). ✓
- Docs / BUSINESS / Norm (no change) → Task 5. ✓
- Non-goals (no cron, no webhook retry queue, no `charge.failed` allowlisting) → not implemented, by design. ✓

**Type consistency:** `ReconcileSummary`, `ReconcileScope`, `AllowlistApplier`, `reconcileBlockedFingerprints`, `reconcileAllowlistFromBlocked`, `isAllowlisted`, `StartChargeJobResult.allowlist` are used identically across tasks. Skip buckets `{ fraud, permanent, notMember }` consistent in service, script summary, modal. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Open risk carried from spec:** `start` request duration — Phase 0 runs inside the 300s `start` request, bounded by the run's blocked-and-not-yet-allowlisted subset (single digits today). If it ever grows large, promote Phase 0 to its own client-driven pre-chunk action. Not needed now.
