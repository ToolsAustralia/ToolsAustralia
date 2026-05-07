# Blocked Transactions Coverage + Admin Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the capture gap so every Stripe-blocked charge lands in the `BlockedTransaction` collection within minutes, then upgrade the admin `/admin/blocked-transactions` page with email search, eligibility/decline-code filters, clickable user emails, an all-time allowlist count, and date-filter UX matching `/admin/past-due-history`.

**Architecture:** Three layers. **Write side:** add a `charge.failed` webhook handler that reuses the existing `buildBlockedTransactionRecord` projector, plus a self-healing reconcile cron that upserts missing rows on every run. **Read side:** evolve `BlockedFilter` to a single `eligibility[]` axis plus `email`/`declineCodes`, add a stats endpoint for the all-time allowlist count, expose `userId` on each row. **UI:** match the past-due page's `DateRangeToggle` + portal pattern, replace the existing two-axis filter with one eligibility multi-select, wire `ClickableUserDisplay` to the email column.

**Tech Stack:** Next.js 15 (App Router) · MongoDB / Mongoose · Stripe SDK · TanStack Query · Tailwind · `tsx` test runner (no jest). Test fixtures use hand-rolled fakes against the existing `AllowlistRepository` interface.

---

## CRITICAL — No auto-commits

Per `CLAUDE.md` hard rule, every task ends with **"Pause and report progress to the user"**, NOT `git commit`. The user authorizes commits explicitly via `commit` / `push` / `merge` keywords. Do not stage or commit between tasks.

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `src/models/BlockedTransaction.ts` | Modify | Add `customerEmail` sparse index |
| `src/services/allowlist/types.ts` | Modify | Replace filter axes with `email` + `declineCodes` + `eligibility[]`; add `EligibilityKind` enum; add `userId` to `BlockedRow` |
| `src/utils/admin/blockedTransactionEligibility.ts` | **Create** | Pure mapper: `(alreadyAllowlisted, preview) → EligibilityKind`; shared between service post-filter + UI badge |
| `src/utils/admin/__tests__/blockedTransactionEligibility.test.ts` | **Create** | Unit tests for the mapper |
| `src/services/allowlist/AllowlistService.ts` | Modify | Push `email` regex + `declineCodes` `$in` into Mongo query; expose `userId`; apply `eligibility[]` post-join via shared mapper |
| `src/services/allowlist/__tests__/listBlockedFilters.test.ts` | **Create** | Filter pushdown unit tests with hand-rolled `AllowlistRepository` fake |
| `src/app/api/admin/allowlist/blocked-cards/route.ts` | Modify | Parse new query string shape |
| `src/app/api/admin/allowlist/stats/route.ts` | **Create** | `GET` returning `{ totalActiveAllowlisted: number }` |
| `src/hooks/queries/admin/useBlockedCards.ts` | Modify | Serialize new filter shape into the query string |
| `src/hooks/queries/admin/useAllowlistStats.ts` | **Create** | TanStack Query hook for the stats endpoint |
| `src/utils/billing/declineCodeLabels.ts` | **Create** | Static `Record<string, { label, group }>` covering Stripe-documented decline codes |
| `src/components/admin/MultiSelectFilter.tsx` | **Create** | Small popover-style multi-select used by both eligibility + decline-code filters |
| `src/components/admin/BlockedTransactionsManagement.tsx` | Modify | Date filter parity; new filters card; metric card swap; clickable email cell |
| `src/app/api/stripe/webhook/route.ts` | Modify | New `charge.failed` case branch |
| `src/app/api/cron/reconcile-blocked-transactions/route.ts` | Modify | Self-healing: upsert missing rows; widen window to 48h |
| `scripts/investigate-blocked-transactions.ts` | **Create** | Read-only diagnostic |
| `package.json` | Modify | Add `investigate:blocked`, `test:list-blocked-filters`, `test:blocked-eligibility-mapper` scripts |
| `CLAUDE.md` | Modify | Add new files to `billing-stripe` domain manifest paths |
| `docs/billing-stripe/architecture.md` | Modify | Update webhook flow + `listBlocked` filter dimensions |
| `docs/billing-stripe/gotchas.md` | Modify | Note dual-event capture, self-healing cron, investigate script |
| `docs/billing-stripe/api.md` | Modify | Add `GET /api/admin/allowlist/stats` |
| `docs/billing-stripe/models.md` | Modify | Note `customerEmail` index |
| `docs/admin/frontend.md` | Modify | Refresh `/admin/blocked-transactions` description |

---

## Phase 1 — Capture fix

### Task 1: Add `customerEmail` index to `BlockedTransaction` model

**Files:**
- Modify: `src/models/BlockedTransaction.ts:64-67`

- [ ] **Step 1: Add the index line**

Open `src/models/BlockedTransaction.ts`. After the existing `BlockedTransactionSchema.index({ declineCode: 1, createdAt: -1 });` line (line 67), add:

```typescript
BlockedTransactionSchema.index({ customerEmail: 1 }, { sparse: true });
```

- [ ] **Step 2: Type-check**

```
npm run type-check
```

Expected: clean exit (no errors).

- [ ] **Step 3: Pause and report**

Tell the user: "Task 1 done — added sparse `customerEmail` index. Ready for Task 2 (investigation script). Want me to proceed?" Wait for authorization before continuing.

---

### Task 2: Investigation script

**Files:**
- Create: `scripts/investigate-blocked-transactions.ts`
- Modify: `package.json`

- [ ] **Step 1: Create the script**

Create `scripts/investigate-blocked-transactions.ts`:

```typescript
#!/usr/bin/env npx tsx

/**
 * Read-only diagnostic comparing Stripe blocked charges against the
 * `BlockedTransaction` Mongo collection. Prints per-row coverage so we can
 * pinpoint where capture is failing.
 *
 * Usage:
 *   npx tsx scripts/investigate-blocked-transactions.ts [--from=ISO] [--to=ISO] [--limit=N]
 *
 * Options:
 *   --from=ISO   Start of window, ISO 8601 (default: 7 days ago).
 *   --to=ISO     End of window, ISO 8601 (default: now).
 *   --limit=N    Max charges to scan (default: 500).
 *
 * Exit codes:
 *   0 — every blocked charge present in Mongo.
 *   2 — at least one blocked charge missing.
 *
 * @module scripts/investigate-blocked-transactions
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const FROM_ARG = process.argv.find((a) => a.startsWith("--from="));
const TO_ARG = process.argv.find((a) => a.startsWith("--to="));
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FROM = FROM_ARG ? new Date(FROM_ARG.split("=")[1] || "") : new Date(Date.now() - SEVEN_DAYS_MS);
const TO = TO_ARG ? new Date(TO_ARG.split("=")[1] || "") : new Date();
const LIMIT = LIMIT_ARG ? Math.max(1, parseInt(LIMIT_ARG.split("=")[1] || "500", 10)) : 500;

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Set it in .env.local and try again.");
    process.exit(1);
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("STRIPE_SECRET_KEY is not set. Set it in .env.local and try again.");
    process.exit(1);
  }
  if (Number.isNaN(FROM.getTime()) || Number.isNaN(TO.getTime())) {
    console.error("Invalid --from or --to date.");
    process.exit(1);
  }

  const connectDB = (await import("../src/lib/mongodb")).default;
  const { stripe } = await import("../src/lib/stripe");
  const BlockedTransaction = (await import("../src/models/BlockedTransaction")).default;

  await connectDB();

  console.log("\nInvestigate blocked transactions — read-only");
  console.log(`  Window: ${FROM.toISOString()} → ${TO.toISOString()}`);
  console.log(`  Limit:  ${LIMIT} charges\n`);

  const fromUnix = Math.floor(FROM.getTime() / 1000);
  const toUnix = Math.floor(TO.getTime() / 1000);
  const query = `status:"failed" AND created>${fromUnix} AND created<${toUnix}`;

  let scanned = 0;
  let qualifying = 0;
  let present = 0;
  let missing = 0;
  const missingRows: Array<{ chargeId: string; piId: string; email: string | null; outcomeType: string | null; networkStatus: string | null; createdAt: string }> = [];

  for await (const charge of stripe.charges.search({ query, limit: 100 })) {
    scanned += 1;
    if (scanned > LIMIT) break;
    if (charge.outcome?.type !== "blocked") continue;

    qualifying += 1;
    const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id ?? null;
    if (!piId) {
      missing += 1;
      missingRows.push({
        chargeId: charge.id,
        piId: "(no PI)",
        email: charge.billing_details?.email ?? null,
        outcomeType: charge.outcome?.type ?? null,
        networkStatus: charge.outcome?.network_status ?? null,
        createdAt: new Date(charge.created * 1000).toISOString(),
      });
      continue;
    }

    const exists = await BlockedTransaction.exists({ _id: piId });
    if (exists) {
      present += 1;
    } else {
      missing += 1;
      missingRows.push({
        chargeId: charge.id,
        piId,
        email: charge.billing_details?.email ?? null,
        outcomeType: charge.outcome?.type ?? null,
        networkStatus: charge.outcome?.network_status ?? null,
        createdAt: new Date(charge.created * 1000).toISOString(),
      });
    }
  }

  console.log("Summary:");
  console.log(`  Charges scanned:       ${scanned}`);
  console.log(`  Qualifying (blocked):  ${qualifying}`);
  console.log(`  Present in Mongo:      ${present}`);
  console.log(`  Missing in Mongo:      ${missing}`);

  if (missingRows.length > 0) {
    console.log("\nMissing rows:");
    for (const r of missingRows) {
      console.log(`  ${r.createdAt}  ${r.chargeId}  pi=${r.piId}  email=${r.email ?? "—"}  outcome=${r.outcomeType}/${r.networkStatus}`);
    }
  }

  await (await import("mongoose")).default.disconnect();
  process.exit(missing > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error("Investigation aborted:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Wire the npm script**

In `package.json`, find the `"sync:allowlist-from-blocked:dry"` line (~line 49) and add this entry below it:

```json
    "investigate:blocked": "tsx scripts/investigate-blocked-transactions.ts",
```

- [ ] **Step 3: Type-check**

```
npm run type-check
```

Expected: clean exit.

- [ ] **Step 4: Smoke-test the script**

```
npm run investigate:blocked -- --from=2026-04-25 --to=2026-05-07 --limit=200
```

Expected: prints summary; exit code 2 if rows are missing (expected today, given the bug). Save the missing-rows output for verification later.

- [ ] **Step 5: Pause and report**

Tell the user: "Task 2 done — investigation script created. Ran it and found N missing rows in the recent window: [paste missing-rows summary]. Ready for Task 3 (charge.failed handler)?" Wait for authorization.

---

### Task 3: `charge.failed` webhook handler

**Files:**
- Modify: `src/app/api/stripe/webhook/route.ts:5060` (after the existing `payment_intent.payment_failed` case)

- [ ] **Step 1: Add the new case branch**

Open `src/app/api/stripe/webhook/route.ts`. Find the closing `break;` of the `payment_intent.payment_failed` case (around line 5060). Immediately after that case ends (and before the next `case` keyword), insert:

```typescript
      case "charge.failed": {
        const failedCharge = event.data.object as Stripe.Charge;

        // Narrow gate: only Stripe-side blocks (issuer-directed auto-block).
        // Matches buildBlockedTransactionRecord's predicate exactly.
        if (failedCharge.outcome?.type !== "blocked") break;
        if (!failedCharge.payment_method_details?.card?.fingerprint) break;

        // Idempotent dual-write — second call from the existing PI branch (or
        // a Stripe webhook retry) just refreshes capturedAt. AllowlistService
        // is intentionally NOT called here: that lives on
        // payment_intent.payment_failed and we don't want double records.
        try {
          const piRef = failedCharge.payment_intent;
          const pi: Stripe.PaymentIntent | null =
            typeof piRef === "string"
              ? await stripe.paymentIntents.retrieve(piRef)
              : piRef ?? null;
          if (!pi) {
            webhookLog(
              "warn",
              `charge.failed for ${failedCharge.id} has no payment_intent; skipping BlockedTransaction upsert`
            );
            break;
          }

          const { buildBlockedTransactionRecord, upsertBlockedTransaction } =
            await import("@/services/allowlist/blockedTransactionRepo");
          const record = buildBlockedTransactionRecord(pi, failedCharge);
          if (record) await upsertBlockedTransaction(record);
        } catch (err) {
          webhookLog(
            "error",
            `BlockedTransaction upsert (charge.failed) failed for ${failedCharge.id}: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
        break;
      }
```

- [ ] **Step 2: Type-check**

```
npm run type-check
```

Expected: clean exit.

- [ ] **Step 3: Pause and report**

Tell the user:

> "Task 3 done — `charge.failed` handler added. **Deployment note**: this requires `charge.failed` to be enabled in your Stripe dashboard webhook subscription (Developers → Webhooks → your endpoint → Listen to events). Without that, the new branch is a no-op. Ready for Task 4 (self-healing reconcile cron)?"

Wait for authorization.

---

### Task 4: Self-healing reconcile cron

**Files:**
- Modify: `src/app/api/cron/reconcile-blocked-transactions/route.ts`

- [ ] **Step 1: Replace the cron handler body**

Replace the `GET` function in `src/app/api/cron/reconcile-blocked-transactions/route.ts` with:

```typescript
/**
 * GET /api/cron/reconcile-blocked-transactions
 *
 * Daily safety net for the BlockedTransaction <-> Stripe pairing.
 *
 * Phase D' (this revision): also SELF-HEALS — any blocked charge in the
 * window whose PI is missing in Mongo is upserted using the same projector
 * as the live webhook (`buildBlockedTransactionRecord`). Drift is still
 * logged so we know the live path missed an event; the cron just patches
 * the gap so the admin page is correct by the next morning.
 *
 * Window widened to 48h to cover late-arriving events + DST edge cases.
 *
 * Vercel cron — internal-only. Now WRITES to Mongo (BlockedTransaction
 * upserts) but never mutates Stripe. No `CRON_SECRET` check — same posture
 * as siblings; protected by Vercel's cron-only invocation.
 */
export async function GET() {
  const startTime = Date.now();
  try {
    await connectDB();

    // Last 48h in UTC: [windowStart, windowEnd)
    const now = new Date();
    const windowEnd = new Date(now);
    windowEnd.setUTCHours(0, 0, 0, 0);
    const windowStart = new Date(windowEnd);
    windowStart.setUTCDate(windowStart.getUTCDate() - 2);

    const fromUnix = Math.floor(windowStart.getTime() / 1000);
    const toUnix = Math.floor(windowEnd.getTime() / 1000);

    const BlockedTransaction = (await import("@/models/BlockedTransaction")).default;
    const { stripe } = await import("@/lib/stripe");
    const { buildBlockedTransactionRecord, upsertBlockedTransaction } = await import(
      "@/services/allowlist/blockedTransactionRepo"
    );

    // Phase 1 — count Mongo rows for the window.
    const mongoCount = await BlockedTransaction.countDocuments({
      createdAt: { $gte: windowStart, $lt: windowEnd },
    });

    // Phase 2 — iterate Stripe blocked charges, expanding payment_intent so
    // we can build records without an extra call per charge.
    const query = `status:"failed" AND created>${fromUnix} AND created<${toUnix}`;
    let stripeCount = 0;
    let recovered = 0;
    let recoverErrors = 0;
    const stripeBlocked: Array<{ pi: import("stripe").default.PaymentIntent; charge: import("stripe").default.Charge }> = [];

    for await (const charge of stripe.charges.search({
      query,
      limit: 100,
      expand: ["data.payment_intent"],
    })) {
      if (charge.outcome?.type !== "blocked") continue;
      stripeCount += 1;
      const piRef = charge.payment_intent;
      const pi =
        piRef && typeof piRef !== "string" ? piRef : null;
      if (pi) stripeBlocked.push({ pi, charge });
    }

    // Phase 3 — find which PIs are missing in Mongo and upsert them.
    if (stripeBlocked.length > 0) {
      const piIds = stripeBlocked.map(({ pi }) => pi.id);
      const presentDocs = await BlockedTransaction.find({ _id: { $in: piIds } })
        .select("_id")
        .lean<Array<{ _id: string }>>();
      const presentSet = new Set(presentDocs.map((d) => d._id));

      for (const { pi, charge } of stripeBlocked) {
        if (presentSet.has(pi.id)) continue;
        try {
          const record = buildBlockedTransactionRecord(pi, charge);
          if (record) {
            await upsertBlockedTransaction(record);
            recovered += 1;
          }
        } catch (err) {
          recoverErrors += 1;
          console.error(
            `[reconcile-blocked-transactions] recover upsert failed for PI ${pi.id}:`,
            err instanceof Error ? err.message : err
          );
        }
      }
    }

    const driftRatio = computeDriftRatio(mongoCount, stripeCount);
    const alerted = driftRatio > DRIFT_THRESHOLD || recovered > 0;

    const summary = {
      window: {
        from: windowStart.toISOString(),
        to: windowEnd.toISOString(),
      },
      mongoCount,
      stripeCount,
      driftRatio,
      threshold: DRIFT_THRESHOLD,
      recovered,
      recoverErrors,
      alerted,
      durationMs: Date.now() - startTime,
    };

    if (alerted) {
      console.error(
        "[reconcile-blocked-transactions] DRIFT/RECOVERY",
        JSON.stringify(summary)
      );
    } else {
      console.log("[reconcile-blocked-transactions] OK", summary);
    }

    return NextResponse.json({ success: true, ...summary });
  } catch (e) {
    console.error("[reconcile-blocked-transactions] failure:", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}
```

The `computeDriftRatio` helper at the top of the file stays unchanged — its existing test suite (`npm run test:reconcile-drift`) keeps passing.

- [ ] **Step 2: Type-check**

```
npm run type-check
```

Expected: clean exit.

- [ ] **Step 3: Run the existing reconcile-drift test**

```
npm run test:reconcile-drift
```

Expected: PASS — we did not change `computeDriftRatio`.

- [ ] **Step 4: Pause and report**

Tell the user: "Task 4 done — reconcile cron now self-heals, window widened to 48h. Phase 1 (capture fix) complete. Ready for Phase 2 (read API + service)?" Wait for authorization.

---

## Phase 2 — Read API + service

### Task 5: Update types — `BlockedFilter`, `EligibilityKind`, `BlockedRow.userId`

**Files:**
- Modify: `src/services/allowlist/types.ts`

- [ ] **Step 1: Replace `BlockedFilter` and add `EligibilityKind`**

Replace the existing `BlockedFilter` type (lines 25-31) with:

```typescript
export type EligibilityKind =
  | "auto_eligible"
  | "already_allowlisted"
  | "fraud_signal"
  | "permanent_issue"
  | "not_member";

export type BlockedFilter = {
  dateFrom: Date;
  dateTo: Date;
  /** Case-insensitive substring match against `customerEmail`. Empty/omitted = no filter. */
  email?: string;
  /** Specific decline codes to include. Empty array OR omitted = no filter. */
  declineCodes?: string[];
  /** Eligibility kinds to include (post-join). Empty array OR omitted = no filter. */
  eligibility?: EligibilityKind[];
};
```

- [ ] **Step 2: Add `userId` to `BlockedRow`**

In the `BlockedRow` type (originally lines 40-55), add `userId` between `chargeId` and `createdAt`:

```typescript
export type BlockedRow = {
  paymentIntentId: string;
  chargeId: string;
  userId: string | null;              // NEW: matched User._id (null if guest / unmatched)
  createdAt: Date;
  amount: number;
  currency: string;
  cardFingerprint: string;
  cardLast4: string;
  cardBrand: string;
  stripeCustomerId: string | null;
  customerEmail: string | null;
  declineCode: string | null;
  failureCode: string | null;
  preview: EligibilityPreview;
  alreadyAllowlisted: boolean;
};
```

- [ ] **Step 3: Type-check (will fail with downstream errors — expected)**

```
npm run type-check
```

Expected: errors in `AllowlistService.ts`, `useBlockedCards.ts`, `BlockedTransactionsManagement.tsx`, `blocked-cards/route.ts` referring to removed `memberStatus`/`declineReason`/`skippedOnly`. Those will be fixed in Tasks 6-9 and 11-15. Note the failing files for context.

- [ ] **Step 4: Pause and report**

Tell the user: "Task 5 done — types updated. Type-check fails at expected sites (will be fixed in subsequent tasks). Ready for Task 6 (eligibility-kind mapper)?" Wait for authorization.

---

### Task 6: Shared eligibility-kind mapper + tests

**Files:**
- Create: `src/utils/admin/blockedTransactionEligibility.ts`
- Create: `src/utils/admin/__tests__/blockedTransactionEligibility.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create `src/utils/admin/__tests__/blockedTransactionEligibility.test.ts`:

```typescript
import assert from "node:assert/strict";
import { computeEligibilityKind } from "../blockedTransactionEligibility";

function testAlreadyAllowlistedWins() {
  const kind = computeEligibilityKind({
    alreadyAllowlisted: true,
    preview: { eligible: true },
  });
  assert.equal(kind, "already_allowlisted");
}

function testAutoEligible() {
  const kind = computeEligibilityKind({
    alreadyAllowlisted: false,
    preview: { eligible: true },
  });
  assert.equal(kind, "auto_eligible");
}

function testFraudSignal() {
  const kind = computeEligibilityKind({
    alreadyAllowlisted: false,
    preview: { eligible: false, reason: "filter_fraud_signal" },
  });
  assert.equal(kind, "fraud_signal");
}

function testPermanentIssue() {
  const kind = computeEligibilityKind({
    alreadyAllowlisted: false,
    preview: { eligible: false, reason: "filter_permanent_issue" },
  });
  assert.equal(kind, "permanent_issue");
}

function testNotMember() {
  const kind = computeEligibilityKind({
    alreadyAllowlisted: false,
    preview: { eligible: false, reason: "filter_not_member" },
  });
  assert.equal(kind, "not_member");
}

testAlreadyAllowlistedWins();
testAutoEligible();
testFraudSignal();
testPermanentIssue();
testNotMember();
console.log("✓ blockedTransactionEligibility — all tests passed");
```

- [ ] **Step 2: Wire the npm test entry**

In `package.json`, alongside the other `test:*` entries (~line 44), add:

```json
    "test:blocked-eligibility-mapper": "tsx src/utils/admin/__tests__/blockedTransactionEligibility.test.ts",
```

- [ ] **Step 3: Run the test (expect FAIL — module not yet created)**

```
npm run test:blocked-eligibility-mapper
```

Expected: FAIL with "Cannot find module '../blockedTransactionEligibility'".

- [ ] **Step 4: Implement the mapper**

Create `src/utils/admin/blockedTransactionEligibility.ts`:

```typescript
import type { EligibilityKind, EligibilityPreview } from "@/services/allowlist/types";

/**
 * Maps a blocked-transaction row's `(alreadyAllowlisted, preview)` pair to a
 * single `EligibilityKind`. The badge in the admin table uses this; the
 * `listBlocked` post-join filter uses this. Keeping one mapper guarantees
 * the filter and the badge can never disagree.
 */
export function computeEligibilityKind(args: {
  alreadyAllowlisted: boolean;
  preview: EligibilityPreview;
}): EligibilityKind {
  if (args.alreadyAllowlisted) return "already_allowlisted";
  if (args.preview.eligible) return "auto_eligible";
  if (args.preview.reason === "filter_fraud_signal") return "fraud_signal";
  if (args.preview.reason === "filter_permanent_issue") return "permanent_issue";
  return "not_member";
}
```

- [ ] **Step 5: Run the test (expect PASS)**

```
npm run test:blocked-eligibility-mapper
```

Expected: `✓ blockedTransactionEligibility — all tests passed`.

- [ ] **Step 6: Pause and report**

Tell the user: "Task 6 done — eligibility-kind mapper + 5 unit tests passing. Ready for Task 7 (listBlocked filter pushdown)?" Wait for authorization.

---

### Task 7: Update `listBlocked` — filter pushdown + expose `userId`

**Files:**
- Modify: `src/services/allowlist/AllowlistService.ts`

- [ ] **Step 1: Add a helper to escape regex specials**

At the top of `src/services/allowlist/AllowlistService.ts`, just below the `import { getAllowCardFingerprintListId } from "./stripeListResolver";` line, add:

```typescript
/**
 * Escape regex specials so user input in the email filter behaves as a
 * substring match — not as a regex pattern that could match unintended rows.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

- [ ] **Step 2: Replace the `listBlocked` method**

Find the existing `async listBlocked(...)` method (starts around line 294). Replace its body with the version below. Preserve the existing JSDoc above the method.

```typescript
  async listBlocked(
    filter: BlockedFilter,
    opts?: { cursor?: string | null; limit?: number }
  ): Promise<BlockedPageResult> {
    const requestedLimit = opts?.limit ?? DEFAULT_LIST_BLOCKED_LIMIT;
    const limit = Math.max(
      1,
      Math.min(MAX_LIST_BLOCKED_LIMIT, Math.floor(requestedLimit) || DEFAULT_LIST_BLOCKED_LIMIT)
    );

    const baseFilter: Record<string, unknown> = {
      createdAt: { $gte: filter.dateFrom, $lte: filter.dateTo },
    };

    // Email substring (case-insensitive). Empty/omitted = no filter.
    if (filter.email && filter.email.trim()) {
      baseFilter.customerEmail = {
        $regex: escapeRegex(filter.email.trim()),
        $options: "i",
      };
    }

    // Decline codes — pushed into Mongo as `$in`. Empty array = no filter.
    if (filter.declineCodes && filter.declineCodes.length > 0) {
      baseFilter.declineCode = { $in: filter.declineCodes };
    }

    const cursorRaw = opts?.cursor ?? null;
    const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;
    const dbFilter: Record<string, unknown> = cursor
      ? {
          ...baseFilter,
          $or: [
            { createdAt: { $lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, _id: { $lt: cursor._id } },
          ],
        }
      : baseFilter;

    const [rawTotal, rawDocs] = await Promise.all([
      BlockedTransaction.countDocuments(baseFilter),
      BlockedTransaction.find(dbFilter)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .lean<
          Array<{
            _id: string;
            paymentIntentId: string;
            chargeId: string;
            cardFingerprint: string;
            cardLast4: string;
            cardBrand: string;
            stripeCustomerId: string | null;
            customerEmail: string | null;
            declineCode: string | null;
            failureCode: string | null;
            amount: number;
            currency: string;
            createdAt: Date;
          }>
        >(),
    ]);

    if (rawDocs.length === 0) {
      return { rows: [], nextCursor: null, total: rawTotal };
    }

    const cardFingerprints = Array.from(
      new Set(rawDocs.map((d) => d.cardFingerprint).filter(Boolean))
    );
    const customerIds = Array.from(
      new Set(rawDocs.map((d) => d.stripeCustomerId).filter((v): v is string => Boolean(v)))
    );
    const emails = Array.from(
      new Set(rawDocs.map((d) => d.customerEmail).filter((v): v is string => Boolean(v)))
    );

    const users =
      customerIds.length || emails.length
        ? await User.find({
            $or: [
              ...(customerIds.length ? [{ stripeCustomerId: { $in: customerIds } }] : []),
              ...(emails.length ? [{ email: { $in: emails } }] : []),
            ],
          })
            .select("_id email stripeCustomerId")
            .lean<
              Array<{
                _id: Types.ObjectId | string;
                email: string | null;
                stripeCustomerId: string | null;
              }>
            >()
        : ([] as Array<{
            _id: Types.ObjectId | string;
            email: string | null;
            stripeCustomerId: string | null;
          }>);

    const userIds = users.map((u) => u._id);

    const [allowlistedActions, paidUserIds] = await Promise.all([
      cardFingerprints.length
        ? AllowlistAction.find({
            cardFingerprint: { $in: cardFingerprints },
            action: "added",
          })
            .select("cardFingerprint")
            .lean<Array<{ cardFingerprint: string }>>()
        : Promise.resolve([] as Array<{ cardFingerprint: string }>),

      userIds.length === 0
        ? Promise.resolve(new Set<string>())
        : (async (): Promise<Set<string>> => {
            const distinctIds = await PaymentEvent.distinct("userId", {
              userId: { $in: userIds },
              eventType: { $in: SUCCEEDED_EVENT_TYPES },
            });
            return new Set((distinctIds as Array<Types.ObjectId | string>).map(String));
          })(),
    ]);

    const userByCustomerId = new Map<string, { _id: Types.ObjectId | string }>();
    const userByEmail = new Map<string, { _id: Types.ObjectId | string }>();
    for (const u of users) {
      if (u.stripeCustomerId) userByCustomerId.set(u.stripeCustomerId, u);
      if (u.email) userByEmail.set(u.email, u);
    }
    const allowlistedSet = new Set<string>(
      allowlistedActions.map((a) => a.cardFingerprint)
    );

    const eligibilityMaps: EligibilityMaps = {
      userByCustomerId,
      userByEmail,
      paidUserIds,
    };

    // Lazy-import to avoid a top-of-file cycle if anything else later imports
    // from utils/admin into this service.
    const { computeEligibilityKind } = await import(
      "@/utils/admin/blockedTransactionEligibility"
    );

    const builtRows: BlockedRow[] = rawDocs.map((doc) => {
      const preview = computeEligibility(doc, eligibilityMaps);
      let resolvedUserId: { _id: Types.ObjectId | string } | undefined;
      if (doc.stripeCustomerId) resolvedUserId = userByCustomerId.get(doc.stripeCustomerId);
      if (!resolvedUserId && doc.customerEmail) resolvedUserId = userByEmail.get(doc.customerEmail);
      return {
        paymentIntentId: doc.paymentIntentId,
        chargeId: doc.chargeId,
        userId: resolvedUserId ? String(resolvedUserId._id) : null,
        createdAt: doc.createdAt,
        amount: doc.amount,
        currency: doc.currency,
        cardFingerprint: doc.cardFingerprint,
        cardLast4: doc.cardLast4,
        cardBrand: doc.cardBrand,
        stripeCustomerId: doc.stripeCustomerId,
        customerEmail: doc.customerEmail,
        declineCode: doc.declineCode,
        failureCode: doc.failureCode,
        preview,
        alreadyAllowlisted: allowlistedSet.has(doc.cardFingerprint),
      };
    });

    // Eligibility post-filter — applied via the shared mapper so the UI badge
    // and this filter cannot disagree. Empty/omitted = no filter.
    const finalRows =
      filter.eligibility && filter.eligibility.length > 0
        ? builtRows.filter((row) => {
            const kind = computeEligibilityKind({
              alreadyAllowlisted: row.alreadyAllowlisted,
              preview: row.preview,
            });
            return filter.eligibility!.includes(kind);
          })
        : builtRows;

    const lastRaw = rawDocs[rawDocs.length - 1];
    const nextCursor =
      rawDocs.length === limit && lastRaw
        ? encodeCursor({ createdAt: lastRaw.createdAt, _id: lastRaw._id })
        : null;

    return { rows: finalRows, nextCursor, total: rawTotal };
  }
```

- [ ] **Step 3: Type-check (still expected to fail at API/hook/component sites)**

```
npm run type-check
```

Expected: errors in `blocked-cards/route.ts`, `useBlockedCards.ts`, `BlockedTransactionsManagement.tsx` — fixed later. Service should compile clean.

- [ ] **Step 4: Pause and report**

Tell the user: "Task 7 done — `listBlocked` now pushes `email` + `declineCodes` to Mongo and applies `eligibility[]` post-join via the shared mapper. `userId` exposed on each row. Ready for Task 8 (filter unit tests)?" Wait for authorization.

---

### Task 8: `listBlocked` filter unit tests

**Files:**
- Create: `src/services/allowlist/__tests__/listBlockedFilters.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the test file**

Create `src/services/allowlist/__tests__/listBlockedFilters.test.ts`:

```typescript
import assert from "node:assert/strict";
import { computeEligibility, type EligibilityMaps } from "../AllowlistService";

// These tests focus on the pure pieces of listBlocked that don't touch Mongo:
// the eligibility post-filter mapping, and the verdict logic shared with the
// UI. Mongo-bound query construction (regex, $in) is covered by integration
// in dev — we don't spin up Mongo for unit tests.
//
// Wired via npm run test:list-blocked-filters.

function makeMaps(opts: {
  hasUser?: boolean;
  hasPaid?: boolean;
} = {}): EligibilityMaps {
  const userByCustomerId = new Map<string, { _id: string }>();
  const userByEmail = new Map<string, { _id: string }>();
  const paidUserIds = new Set<string>();
  if (opts.hasUser) {
    userByCustomerId.set("cus_1", { _id: "u_1" });
    userByEmail.set("a@b.com", { _id: "u_1" });
  }
  if (opts.hasPaid) {
    paidUserIds.add("u_1");
  }
  return { userByCustomerId, userByEmail, paidUserIds };
}

function testFraudSignalShortCircuits() {
  const result = computeEligibility(
    { declineCode: "lost_card", stripeCustomerId: "cus_1", customerEmail: "a@b.com" },
    makeMaps({ hasUser: true, hasPaid: true })
  );
  assert.deepEqual(result, { eligible: false, reason: "filter_fraud_signal" });
}

function testPermanentIssueShortCircuits() {
  const result = computeEligibility(
    { declineCode: "expired_card", stripeCustomerId: "cus_1", customerEmail: "a@b.com" },
    makeMaps({ hasUser: true, hasPaid: true })
  );
  assert.deepEqual(result, { eligible: false, reason: "filter_permanent_issue" });
}

function testNotMemberWhenNoUser() {
  const result = computeEligibility(
    { declineCode: "generic_decline", stripeCustomerId: "cus_unknown", customerEmail: "x@y.com" },
    makeMaps({ hasUser: false, hasPaid: false })
  );
  assert.deepEqual(result, { eligible: false, reason: "filter_not_member" });
}

function testNotMemberWhenUnpaid() {
  const result = computeEligibility(
    { declineCode: "generic_decline", stripeCustomerId: "cus_1", customerEmail: "a@b.com" },
    makeMaps({ hasUser: true, hasPaid: false })
  );
  assert.deepEqual(result, { eligible: false, reason: "filter_not_member" });
}

function testEligibleWhenPaidMember() {
  const result = computeEligibility(
    { declineCode: "generic_decline", stripeCustomerId: "cus_1", customerEmail: "a@b.com" },
    makeMaps({ hasUser: true, hasPaid: true })
  );
  assert.deepEqual(result, { eligible: true });
}

testFraudSignalShortCircuits();
testPermanentIssueShortCircuits();
testNotMemberWhenNoUser();
testNotMemberWhenUnpaid();
testEligibleWhenPaidMember();
console.log("✓ listBlockedFilters — all tests passed");
```

- [ ] **Step 2: Wire the npm test entry**

In `package.json`, alongside the existing allowlist tests (~line 43-45), add:

```json
    "test:list-blocked-filters": "tsx src/services/allowlist/__tests__/listBlockedFilters.test.ts",
```

- [ ] **Step 3: Run the test**

```
npm run test:list-blocked-filters
```

Expected: `✓ listBlockedFilters — all tests passed`.

- [ ] **Step 4: Pause and report**

Tell the user: "Task 8 done — 5 unit tests passing for the verdict logic. Ready for Task 9 (stats endpoint)?" Wait for authorization.

---

### Task 9: New `/api/admin/allowlist/stats` endpoint

**Files:**
- Create: `src/app/api/admin/allowlist/stats/route.ts`

- [ ] **Step 1: Create the route handler**

Create `src/app/api/admin/allowlist/stats/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/api-auth";
import connectDB from "@/lib/mongodb";
import AllowlistAction from "@/models/AllowlistAction";

/**
 * GET /api/admin/allowlist/stats
 *
 * Returns the count of cards currently on the Stripe allowlist — defined as
 * fingerprints whose most-recent AllowlistAction has `action: "added"`.
 * Drives the "Total on allowlist" metric card on /admin/blocked-transactions.
 *
 * Source-of-truth note: Stripe's `card_fingerprint_allowlist` Radar value list
 * is the live allowlist; AllowlistAction is our audit log. This count
 * approximates the live list (drift is bounded by reverse() failures, which
 * are vanishingly rare in practice).
 */
export async function GET() {
  const auth = await requireAdminUser();
  if ("errorResponse" in auth) return auth.errorResponse;

  await connectDB();

  try {
    const result = await AllowlistAction.aggregate<{
      totalActiveAllowlisted: number;
    }>([
      { $sort: { cardFingerprint: 1, createdAt: -1 } },
      { $group: { _id: "$cardFingerprint", latest: { $first: "$action" } } },
      { $match: { latest: "added" } },
      { $count: "totalActiveAllowlisted" },
    ]);
    const total = result[0]?.totalActiveAllowlisted ?? 0;
    return NextResponse.json({ success: true, totalActiveAllowlisted: total });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to compute allowlist stats",
      },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Type-check**

```
npm run type-check
```

Expected: errors in this file should be 0; remaining errors are still in `route.ts`/hook/component (next tasks).

- [ ] **Step 3: Pause and report**

Tell the user: "Task 9 done — `/api/admin/allowlist/stats` endpoint created. Ready for Task 10 (`useAllowlistStats` hook)?" Wait for authorization.

---

### Task 10: `useAllowlistStats` hook

**Files:**
- Create: `src/hooks/queries/admin/useAllowlistStats.ts`

- [ ] **Step 1: Check the existing query keys structure**

Open `src/lib/queryKeys.ts` and confirm there is an `admin.allowlist` namespace — the existing `useBlockedCards` uses `queryKeys.admin.allowlist.blockedCards(filterKey)`. If a `stats` key doesn't yet exist there, add this line under the same namespace:

```typescript
// inside admin.allowlist:
stats: () => [...queryKeys.admin.allowlist.root, "stats"] as const,
```

(If the existing structure differs — e.g. nested differently — match it. The point is a stable cache key under the same parent so existing apply/reverse mutations can invalidate it.)

- [ ] **Step 2: Create the hook**

Create `src/hooks/queries/admin/useAllowlistStats.ts`:

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet } from "@/lib/queries";

type StatsResponse = {
  success: true;
  totalActiveAllowlisted: number;
};

/**
 * Drives the "Total on allowlist" metric card on /admin/blocked-transactions.
 * 60s staleTime — the value only moves on apply / reverse, both of which
 * invalidate this key.
 */
export function useAllowlistStats() {
  return useQuery({
    queryKey: queryKeys.admin.allowlist.stats(),
    queryFn: async () => apiGet<StatsResponse>("/api/admin/allowlist/stats"),
    staleTime: 60_000,
  });
}
```

- [ ] **Step 3: Wire mutation invalidations**

Open `src/hooks/queries/admin/useAllowlistActions.ts`. Find `useApplyAllowlist` and `useReverseAllowlist`. In each mutation's `onSuccess`, add a call to invalidate the new stats key alongside the existing invalidations:

```typescript
queryClient.invalidateQueries({ queryKey: queryKeys.admin.allowlist.stats() });
```

(If `onSuccess` already calls `invalidateQueries` for related keys, just add this one to the list.)

- [ ] **Step 4: Type-check**

```
npm run type-check
```

Expected: this file's errors are 0. Remaining errors still in API/hook/component sites — fixed in next tasks.

- [ ] **Step 5: Pause and report**

Tell the user: "Task 10 done — `useAllowlistStats` hook + invalidation wired. Ready for Task 11 (decline-code labels static map)?" Wait for authorization.

---

### Task 11: Decline-code labels static map

**Files:**
- Create: `src/utils/billing/declineCodeLabels.ts`

- [ ] **Step 1: Create the static map**

Create `src/utils/billing/declineCodeLabels.ts`:

```typescript
/**
 * Static map of Stripe `last_payment_error.decline_code` values to human
 * labels + their bucket. Used by the admin Blocked Transactions filter UI
 * to populate the multi-select option list and group rendering.
 *
 * Source: superset of Stripe's documented decline codes plus the project's
 * FRAUD_SIGNAL_DECLINE_CODES and PERMANENT_ISSUE_DECLINE_CODES (kept in
 * lockstep semantically — if you add a code here marked "fraud" or
 * "permanent", the corresponding set in src/services/allowlist/declineCodes.ts
 * is the actual filter source-of-truth; this map is purely UI labeling).
 *
 * If Stripe adds new codes, append them here; the filter UI is a static
 * dropdown so unknown codes from the data wouldn't render an option.
 */
export type DeclineGroup = "recoverable" | "fraud" | "permanent" | "other";

export const DECLINE_CODE_LABELS: Record<
  string,
  { label: string; group: DeclineGroup }
> = {
  // Recoverable — issuer may approve on retry
  generic_decline: { label: "Generic decline", group: "recoverable" },
  do_not_honor: { label: "Do not honor", group: "recoverable" },
  insufficient_funds: { label: "Insufficient funds", group: "recoverable" },
  try_again_later: { label: "Try again later", group: "recoverable" },
  processing_error: { label: "Processing error", group: "recoverable" },
  card_velocity_exceeded: { label: "Card velocity exceeded", group: "recoverable" },
  call_issuer: { label: "Call issuer", group: "recoverable" },
  service_not_allowed: { label: "Service not allowed", group: "recoverable" },
  transaction_not_allowed: { label: "Transaction not allowed", group: "recoverable" },

  // Fraud signals — never auto-allowlisted
  lost_card: { label: "Lost card", group: "fraud" },
  stolen_card: { label: "Stolen card", group: "fraud" },
  pickup_card: { label: "Pickup card", group: "fraud" },
  fraudulent: { label: "Fraudulent", group: "fraud" },

  // Permanent issues — pointless to allowlist
  expired_card: { label: "Expired card", group: "permanent" },
  incorrect_cvc: { label: "Incorrect CVC", group: "permanent" },
  invalid_account: { label: "Invalid account", group: "permanent" },
  invalid_number: { label: "Invalid card number", group: "permanent" },
  invalid_expiry_year: { label: "Invalid expiry year", group: "permanent" },
  invalid_expiry_month: { label: "Invalid expiry month", group: "permanent" },

  // Other
  authentication_required: { label: "Authentication required (3DS)", group: "other" },
  card_declined: { label: "Card declined (no specific reason)", group: "other" },
};

/**
 * Returns the label for a code, or the raw code if unknown. Used in table
 * cells to keep new-from-Stripe codes visible until added to the map.
 */
export function getDeclineCodeLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return DECLINE_CODE_LABELS[code]?.label ?? code;
}
```

- [ ] **Step 2: Type-check**

```
npm run type-check
```

Expected: this file is clean.

- [ ] **Step 3: Pause and report**

Tell the user: "Task 11 done — decline-code labels map. Ready for Task 12 (update API route handler)?" Wait for authorization.

---

### Task 12: Update API route handler — parse new query string

**Files:**
- Modify: `src/app/api/admin/allowlist/blocked-cards/route.ts`

- [ ] **Step 1: Replace the file body**

Replace the full content of `src/app/api/admin/allowlist/blocked-cards/route.ts` with:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/api-auth";
import connectDB from "@/lib/mongodb";
import { getAllowlistService } from "@/services/allowlist";
import type { BlockedFilter, EligibilityKind } from "@/services/allowlist/types";

const VALID_ELIGIBILITY: ReadonlySet<EligibilityKind> = new Set([
  "auto_eligible",
  "already_allowlisted",
  "fraud_signal",
  "permanent_issue",
  "not_member",
]);

function parseDateOrDefault(raw: string | null, fallback: Date): Date {
  if (!raw) return fallback;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function parseCsvList(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  const items = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser();
  if ("errorResponse" in auth) return auth.errorResponse;

  await connectDB();

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const eligibilityRaw = parseCsvList(searchParams.get("eligibility"));
  const eligibility = eligibilityRaw
    ? (eligibilityRaw.filter((v): v is EligibilityKind =>
        VALID_ELIGIBILITY.has(v as EligibilityKind)
      ))
    : undefined;

  const filter: BlockedFilter = {
    dateFrom: parseDateOrDefault(searchParams.get("dateFrom"), thirtyDaysAgo),
    dateTo: parseDateOrDefault(searchParams.get("dateTo"), now),
    email: searchParams.get("email") ?? undefined,
    declineCodes: parseCsvList(searchParams.get("declineCodes")),
    eligibility,
  };

  try {
    const cursor = searchParams.get("cursor");
    const limitRaw = searchParams.get("limit");
    const limit = limitRaw
      ? Math.max(1, Math.min(100, parseInt(limitRaw, 10) || 50))
      : 50;
    const result = await getAllowlistService().listBlocked(filter, { cursor, limit });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to list blocked cards",
      },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Type-check**

```
npm run type-check
```

Expected: this file is clean. Remaining errors in `useBlockedCards.ts` and the component (next tasks).

- [ ] **Step 3: Pause and report**

Tell the user: "Task 12 done — route handler parses the new query shape. Ready for Task 13 (`useBlockedCards` hook serialization)?" Wait for authorization.

---

### Task 13: Update `useBlockedCards` hook — serialize new filter shape

**Files:**
- Modify: `src/hooks/queries/admin/useBlockedCards.ts`

- [ ] **Step 1: Replace the two query-string builders**

Replace the `buildFilterKey` and `buildPageQueryString` functions (lines 31-54) with:

```typescript
/** Filter-only key (excludes cursor — cursor is a pageParam, not part of the query key). */
function buildFilterKey(filter: BlockedFilter): string {
  const params = new URLSearchParams({
    dateFrom: filter.dateFrom.toISOString(),
    dateTo: filter.dateTo.toISOString(),
  });
  if (filter.email && filter.email.trim()) params.set("email", filter.email.trim());
  if (filter.declineCodes && filter.declineCodes.length > 0) {
    params.set("declineCodes", filter.declineCodes.join(","));
  }
  if (filter.eligibility && filter.eligibility.length > 0) {
    params.set("eligibility", filter.eligibility.join(","));
  }
  return params.toString();
}

/** Full request URL for a given page (filter + pagination). */
function buildPageQueryString(filter: BlockedFilter, cursor: string | null): string {
  const params = new URLSearchParams({
    dateFrom: filter.dateFrom.toISOString(),
    dateTo: filter.dateTo.toISOString(),
    limit: String(DEFAULT_PAGE_SIZE),
  });
  if (filter.email && filter.email.trim()) params.set("email", filter.email.trim());
  if (filter.declineCodes && filter.declineCodes.length > 0) {
    params.set("declineCodes", filter.declineCodes.join(","));
  }
  if (filter.eligibility && filter.eligibility.length > 0) {
    params.set("eligibility", filter.eligibility.join(","));
  }
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}
```

- [ ] **Step 2: Type-check**

```
npm run type-check
```

Expected: this file is clean. Remaining errors only in the component (next tasks).

- [ ] **Step 3: Pause and report**

Tell the user: "Task 13 done — hook serializes the new filter. Final remaining type errors are all in the component, fixed in Tasks 14–18. Ready for Task 14 (MultiSelectFilter component)?" Wait for authorization.

---

## Phase 3 — UI

### Task 14: `MultiSelectFilter` component

**Files:**
- Create: `src/components/admin/MultiSelectFilter.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/admin/MultiSelectFilter.tsx`:

```typescript
"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

export type MultiSelectOption = {
  value: string;
  label: string;
  /** Optional grouping label rendered as a non-selectable separator above the option. */
  group?: string;
};

interface Props {
  label: string;
  options: ReadonlyArray<MultiSelectOption>;
  selected: string[];
  onChange: (next: string[]) => void;
  /** Placeholder when nothing is selected. */
  placeholder?: string;
  className?: string;
}

/**
 * Popover-style multi-select. Click the trigger button to open a panel of
 * checkbox rows; click outside to close. Selected values rendered as a
 * count on the trigger (or the placeholder if 0). Used by the admin
 * Blocked Transactions filters for both eligibility and decline-code lists.
 */
export default function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  placeholder = "Any",
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  const triggerText =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
        : `${selected.length} selected`;

  // Render groups by inserting a separator when the option's `group` differs
  // from the previous one.
  let prevGroup: string | undefined;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-gray-700 dark:text-neutral-300">
        {label}
      </span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 hover:bg-gray-50 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/40 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-700"
        aria-expanded={open}
      >
        <span className="truncate">{triggerText}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400 dark:text-neutral-500" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          {options.map((opt) => {
            const isSelected = selected.includes(opt.value);
            const showGroup = opt.group && opt.group !== prevGroup;
            prevGroup = opt.group;
            return (
              <React.Fragment key={opt.value}>
                {showGroup && (
                  <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-neutral-500">
                    {opt.group}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check className="h-4 w-4 text-red-600 dark:text-red-400" />}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```
npm run type-check
```

Expected: this file clean.

- [ ] **Step 3: Pause and report**

Tell the user: "Task 14 done — `MultiSelectFilter` component created. Ready for Task 15 (the big component update)?" Wait for authorization.

---

### Task 15: Update `BlockedTransactionsManagement` — date filter parity, new filters, metric swap, clickable email

**Files:**
- Modify: `src/components/admin/BlockedTransactionsManagement.tsx` (full rewrite)

This is the largest task. The component is replaced wholesale to keep the change coherent. Only the table row markup is mostly preserved.

- [ ] **Step 1: Replace the file body**

Replace the full content of `src/components/admin/BlockedTransactionsManagement.tsx` with:

```typescript
"use client";

import React, { Fragment, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { format, subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import {
  CreditCard,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  CheckCircle,
  Trash2,
  Filter,
  ChevronDown,
  ChevronUp,
  ListChecks,
  Clock,
  AlertTriangle,
  Search,
} from "lucide-react";
import Checkbox from "@/components/modals/ui/Checkbox";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import CustomDateRangeModal from "@/components/admin/CustomDateRangeModal";
import DateRangeToggle, { type DateRange } from "@/components/admin/DateRangeToggle";
import { AdminMobileLayoutDateRangeShell } from "@/app/admin/component/AdminMobileLayoutDateRangeShell";
import { useAdminMobileDateToolbarSlot } from "@/hooks/useAdminMobileDateToolbarSlot";
import {
  useCurrentAndLastDrawDates,
  useMajorDrawsForDateRange,
} from "@/hooks/queries/useAdminQueries";
import { getWebsiteLaunchDateUTC } from "@/utils/common/timezone";
import ClickableUserDisplay from "@/components/admin/ClickableUserDisplay";
import MultiSelectFilter, { type MultiSelectOption } from "@/components/admin/MultiSelectFilter";
import { useToast } from "@/components/ui/Toast";
import { useDebounce } from "@/hooks/useDebounce";
import { useBlockedCards } from "@/hooks/queries/admin/useBlockedCards";
import { useAllowlistStats } from "@/hooks/queries/admin/useAllowlistStats";
import {
  useAllowlistActions,
  useApplyAllowlist,
  useReverseAllowlist,
  type ClientAllowlistAction,
} from "@/hooks/queries/admin/useAllowlistActions";
import type {
  BlockedFilter,
  BlockedRow,
  EligibilityKind,
  EvalInput,
} from "@/services/allowlist/types";
import { computeEligibilityKind } from "@/utils/admin/blockedTransactionEligibility";
import {
  DECLINE_CODE_LABELS,
  getDeclineCodeLabel,
} from "@/utils/billing/declineCodeLabels";

const AEST_TIMEZONE = "Australia/Sydney";

const ELIGIBILITY_OPTIONS: ReadonlyArray<MultiSelectOption> = [
  { value: "auto_eligible", label: "Auto-eligible" },
  { value: "already_allowlisted", label: "Already allowlisted" },
  { value: "fraud_signal", label: "Fraud signal" },
  { value: "permanent_issue", label: "Permanent issue" },
  { value: "not_member", label: "Skipped — not member" },
];

const DECLINE_CODE_OPTIONS: ReadonlyArray<MultiSelectOption> = (() => {
  const groupOrder = ["recoverable", "fraud", "permanent", "other"] as const;
  const groupLabels: Record<(typeof groupOrder)[number], string> = {
    recoverable: "Recoverable",
    fraud: "Fraud signals",
    permanent: "Permanent issues",
    other: "Other",
  };
  const opts: MultiSelectOption[] = [];
  for (const group of groupOrder) {
    for (const [code, meta] of Object.entries(DECLINE_CODE_LABELS)) {
      if (meta.group !== group) continue;
      opts.push({ value: code, label: meta.label, group: groupLabels[group] });
    }
  }
  return opts;
})();

function defaultLast30Days() {
  const today = new Date();
  return {
    start: format(subDays(today, 29), "yyyy-MM-dd"),
    end: format(today, "yyyy-MM-dd"),
  };
}

function ymdToDate(ymd: string, endOfDay = false): Date {
  // Interpret YYYY-MM-DD as a local-day boundary; consistent with past-due page.
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  return endOfDay
    ? new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999)
    : new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

function formatDateTime(value: Date | string): string {
  return format(new Date(value), "MMM d, yyyy HH:mm");
}

function rowToApplyPayload(r: BlockedRow): EvalInput {
  return {
    cardFingerprint: r.cardFingerprint,
    cardLast4: r.cardLast4,
    cardBrand: r.cardBrand,
    stripeCustomerId: r.stripeCustomerId,
    customerEmail: r.customerEmail,
    declineCode: r.declineCode,
    failureCode: r.failureCode,
    triggeringPaymentIntentId: r.paymentIntentId,
    triggeringChargeId: r.chargeId,
  };
}

const eligibilityBadgeClasses: Record<EligibilityKind, string> = {
  auto_eligible: "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-200",
  already_allowlisted: "bg-gray-100 text-gray-800 dark:bg-neutral-800 dark:text-neutral-200",
  fraud_signal: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200",
  permanent_issue: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  not_member: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
};

const eligibilityBadgeLabel: Record<EligibilityKind, string> = {
  auto_eligible: "Auto-eligible",
  already_allowlisted: "Already allowlisted",
  fraud_signal: "Fraud signal",
  permanent_issue: "Permanent issue",
  not_member: "Skipped — not member",
};

function EligibilityBadge({ row }: { row: BlockedRow }) {
  const kind = computeEligibilityKind({
    alreadyAllowlisted: row.alreadyAllowlisted,
    preview: row.preview,
  });
  const Icon =
    kind === "auto_eligible"
      ? CheckCircle
      : kind === "fraud_signal" || kind === "permanent_issue"
        ? AlertTriangle
        : kind === "already_allowlisted"
          ? ShieldCheck
          : AlertCircle;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${eligibilityBadgeClasses[kind]}`}
    >
      <Icon className="h-3 w-3" />
      {eligibilityBadgeLabel[kind]}
    </span>
  );
}

export default function BlockedTransactionsManagement() {
  const { showToast } = useToast();
  const { isLgUp, slotEl } = useAdminMobileDateToolbarSlot();

  // Date state — mirrors PastDueChargeHistory exactly
  const initialRange = useMemo(() => defaultLast30Days(), []);
  const [dateRange, setDateRange] = useState<DateRange>("custom");
  const [startDate, setStartDate] = useState<string>(initialRange.start);
  const [endDate, setEndDate] = useState<string>(initialRange.end);
  const [isCustomDateModalOpen, setIsCustomDateModalOpen] = useState(false);

  // New filter state
  const [emailInput, setEmailInput] = useState("");
  const debouncedEmail = useDebounce(emailInput, 300);
  const [eligibilitySelected, setEligibilitySelected] = useState<string[]>([]);
  const [declineCodesSelected, setDeclineCodesSelected] = useState<string[]>([]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);

  const { data: drawDates } = useCurrentAndLastDrawDates();
  const { data: majorDraws = [] } = useMajorDrawsForDateRange();

  const updateDateFilter = (range: DateRange, start?: string, end?: string) => {
    let finalStart = start;
    let finalEnd = end;

    if (range === "today") {
      finalStart = formatInTimeZone(new Date(), AEST_TIMEZONE, "yyyy-MM-dd");
      finalEnd = finalStart;
    } else if (range === "yesterday") {
      finalStart = formatInTimeZone(subDays(new Date(), 1), AEST_TIMEZONE, "yyyy-MM-dd");
      finalEnd = finalStart;
    } else if (range === "current-draw" && drawDates?.currentDraw) {
      finalStart = drawDates.currentDraw.startDate;
      finalEnd = drawDates.currentDraw.endDate;
    } else if (range === "last-draw" && drawDates?.lastDraw) {
      finalStart = drawDates.lastDraw.startDate;
      finalEnd = drawDates.lastDraw.endDate;
    } else if (range === "all-time") {
      finalStart = formatInTimeZone(getWebsiteLaunchDateUTC(), AEST_TIMEZONE, "yyyy-MM-dd");
      finalEnd = formatInTimeZone(new Date(), AEST_TIMEZONE, "yyyy-MM-dd");
    }

    setDateRange(range);
    if (finalStart && finalEnd) {
      setStartDate(finalStart);
      setEndDate(finalEnd);
    }
  };

  const filter: BlockedFilter = useMemo(
    () => ({
      dateFrom: ymdToDate(startDate, false),
      dateTo: ymdToDate(endDate, true),
      email: debouncedEmail.trim() || undefined,
      declineCodes: declineCodesSelected.length > 0 ? declineCodesSelected : undefined,
      eligibility:
        eligibilitySelected.length > 0
          ? (eligibilitySelected as EligibilityKind[])
          : undefined,
    }),
    [startDate, endDate, debouncedEmail, declineCodesSelected, eligibilitySelected]
  );

  const {
    rows,
    total,
    hasMore,
    isLoading,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
    error,
  } = useBlockedCards(filter);
  const statsQuery = useAllowlistStats();
  const { data: recentActions = [] } = useAllowlistActions("added", 50);
  const applyMutation = useApplyAllowlist();
  const reverseMutation = useReverseAllowlist();

  const eligibleRows = useMemo(() => rows.filter((r) => !r.alreadyAllowlisted), [rows]);

  const stats = useMemo(() => {
    let autoEligible = 0;
    let skippedFilter = 0;
    let fraud = 0;
    let permanent = 0;
    for (const r of rows) {
      if (r.alreadyAllowlisted) continue;
      if (r.preview.eligible) {
        autoEligible += 1;
        continue;
      }
      if (r.preview.reason === "filter_fraud_signal") fraud += 1;
      else if (r.preview.reason === "filter_permanent_issue") permanent += 1;
      else skippedFilter += 1;
    }
    return { total: rows.length, autoEligible, skippedFilter, fraud, permanent };
  }, [rows]);

  const allEligibleSelected =
    eligibleRows.length > 0 && eligibleRows.every((r) => selected.has(r.cardFingerprint));

  function toggleAll() {
    if (allEligibleSelected) setSelected(new Set());
    else setSelected(new Set(eligibleRows.map((r) => r.cardFingerprint)));
  }

  function toggleRow(fp: string) {
    const next = new Set(selected);
    if (next.has(fp)) next.delete(fp);
    else next.add(fp);
    setSelected(next);
  }

  async function handleApplySelected(allowOverride: boolean) {
    const payload = eligibleRows
      .filter((r) => selected.has(r.cardFingerprint))
      .map(rowToApplyPayload);
    if (payload.length === 0) {
      showToast({
        type: "error",
        title: "No selection",
        message: "Select at least one transaction before allowlisting.",
      });
      return;
    }
    try {
      const result = await applyMutation.mutateAsync({ rows: payload, allowOverride });
      setSelected(new Set());
      const errorCount = result.errors?.length ?? 0;
      showToast({
        type: errorCount > 0 ? "warning" : "success",
        title: "Allowlist applied",
        message: `Added ${result.added}, skipped ${result.skipped}${
          errorCount > 0 ? `, ${errorCount} error(s)` : ""
        }.`,
      });
      refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to apply allowlist";
      showToast({ type: "error", title: "Apply failed", message });
    }
  }

  async function handleAllowlistOne(r: BlockedRow) {
    setPendingRowId(r.paymentIntentId);
    try {
      const result = await applyMutation.mutateAsync({
        rows: [rowToApplyPayload(r)],
        allowOverride: false,
      });
      const errorCount = result.errors?.length ?? 0;
      if (result.added > 0) {
        showToast({
          type: "success",
          title: "Allowlisted",
          message: `Card ${r.cardBrand} ••${r.cardLast4} added to the Stripe allowlist.`,
        });
      } else if (errorCount > 0) {
        showToast({
          type: "error",
          title: "Allowlist failed",
          message: result.errors?.[0]?.message ?? "Stripe rejected the request.",
        });
      } else {
        showToast({
          type: "warning",
          title: "Skipped by filter",
          message:
            "The filter rules skipped this row. Use the bulk override button if you want to force it.",
        });
      }
      refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to apply allowlist";
      showToast({ type: "error", title: "Apply failed", message });
    } finally {
      setPendingRowId(null);
    }
  }

  async function handleReverse(actionId: string) {
    try {
      await reverseMutation.mutateAsync({ actionId });
      showToast({
        type: "success",
        title: "Removed from allowlist",
        message: "The card has been removed from the Stripe allowlist.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reverse allowlist";
      showToast({ type: "error", title: "Reverse failed", message });
    }
  }

  function resetFilters() {
    setEmailInput("");
    setEligibilitySelected([]);
    setDeclineCodesSelected([]);
    updateDateFilter("custom", initialRange.start, initialRange.end);
    setSelected(new Set());
  }

  const displayDate = useMemo(() => {
    if (dateRange === "custom" && startDate && endDate) {
      try {
        const s = new Date(startDate);
        const e = new Date(endDate);
        if (format(s, "yyyy-MM-dd") === format(e, "yyyy-MM-dd")) {
          return format(s, "MMM d, yyyy");
        }
        return `${format(s, "MMM d")} - ${format(e, "MMM d, yyyy")}`;
      } catch {
        return undefined;
      }
    }
    if (dateRange === "all-time") return "All Time";
    if (dateRange === "current-draw") return "Current Draw";
    if (dateRange === "last-draw") return "Last Draw";
    return undefined;
  }, [dateRange, startDate, endDate]);

  const dateRangeToggle = (
    <DateRangeToggle
      selectedRange={dateRange}
      onRangeChange={(range) => {
        if (range === "custom") setIsCustomDateModalOpen(true);
        else updateDateFilter(range);
      }}
      onCustomClick={() => setIsCustomDateModalOpen(true)}
      collapsed={false}
      displayDate={displayDate}
      onExpand={() => {}}
      className={isLgUp ? undefined : "w-full"}
    />
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
          Blocked Transactions
        </h2>
        {isLgUp ? <div className="flex items-center gap-2">{dateRangeToggle}</div> : null}
      </div>

      {!isLgUp && slotEl
        ? createPortal(
            <AdminMobileLayoutDateRangeShell>{dateRangeToggle}</AdminMobileLayoutDateRangeShell>,
            slotEl
          )
        : null}
      {!isLgUp && !slotEl ? (
        <div className="lg:hidden">
          <AdminMobileLayoutDateRangeShell>{dateRangeToggle}</AdminMobileLayoutDateRangeShell>
        </div>
      ) : null}

      <CustomDateRangeModal
        isOpen={isCustomDateModalOpen}
        onClose={() => setIsCustomDateModalOpen(false)}
        onApply={(start, end) => {
          updateDateFilter("custom", start, end);
          setIsCustomDateModalOpen(false);
        }}
        currentStartDate={startDate}
        currentEndDate={endDate}
        majorDraws={majorDraws}
      />

      {/* Top stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          title="Total blocked"
          value={stats.total}
          icon={CreditCard}
          color="blue"
          subtitle="Matching current filters"
        />
        <MetricCard
          title="Auto-eligible"
          value={stats.autoEligible}
          icon={CheckCircle}
          color="emerald"
          subtitle="Safe to allowlist"
        />
        <MetricCard
          title="Skipped — filter"
          value={stats.skippedFilter + stats.fraud + stats.permanent}
          icon={AlertCircle}
          color="yellow"
          subtitle={`${stats.fraud} fraud · ${stats.permanent} permanent`}
        />
        <MetricCard
          title="Total on allowlist"
          value={statsQuery.data?.totalActiveAllowlisted ?? "—"}
          icon={ShieldCheck}
          color="purple"
          subtitle="All-time, currently active"
        />
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Failed to load blocked transactions</p>
            <p className="mt-0.5 text-xs">
              {error.message || "Failed to load blocked transactions"}
            </p>
          </div>
        </div>
      )}

      {/* Filters card */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-200 dark:border-neutral-800 p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
            <Filter className="h-4 w-4 text-red-600" />
            Filters
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs font-semibold text-gray-600 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setIsFiltersOpen((cur) => !cur)}
              aria-expanded={isFiltersOpen}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800 sm:hidden"
            >
              {isFiltersOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <div className={`${isFiltersOpen ? "block" : "hidden sm:block"}`}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <span className="mb-1 block text-xs font-semibold text-gray-700 dark:text-neutral-300">
                Email
              </span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-neutral-500" />
                <input
                  type="text"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="Search by email"
                  className="w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/40 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white dark:placeholder:text-neutral-500"
                />
              </div>
            </div>
            <MultiSelectFilter
              label="Eligibility"
              options={ELIGIBILITY_OPTIONS}
              selected={eligibilitySelected}
              onChange={setEligibilitySelected}
              placeholder="Any eligibility"
            />
            <MultiSelectFilter
              label="Decline code"
              options={DECLINE_CODE_OPTIONS}
              selected={declineCodesSelected}
              onChange={setDeclineCodesSelected}
              placeholder="Any decline code"
            />
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-200 dark:border-neutral-800 p-4 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <div className="flex items-center gap-3">
          <Checkbox
            id="bulk-select-all"
            name="bulk-select-all"
            checked={allEligibleSelected}
            onChange={toggleAll}
          />
          <label
            htmlFor="bulk-select-all"
            className="text-sm font-medium text-gray-700 dark:text-neutral-300 cursor-pointer"
          >
            Select all {eligibleRows.length} eligible
            {selected.size > 0 && (
              <span className="ml-2 text-xs font-semibold text-red-600 dark:text-red-400">
                ({selected.size} selected)
              </span>
            )}
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={selected.size === 0 || applyMutation.isPending}
            onClick={() => handleApplySelected(false)}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#ee0000] to-[#ff4444] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:from-[#cc0000] hover:to-[#e60000] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ShieldCheck className="h-4 w-4" />
            Allowlist {selected.size > 0 ? `${selected.size} ` : ""}selected
          </button>
          <button
            type="button"
            disabled={selected.size === 0 || applyMutation.isPending}
            onClick={() => handleApplySelected(true)}
            title="Allow even rows the filter would skip"
            className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/60"
          >
            <AlertTriangle className="h-4 w-4" />
            Allowlist with override
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-200 dark:border-neutral-800 overflow-hidden">
        {total > 0 && (
          <div className="border-b border-gray-200 px-4 py-2 text-xs text-gray-500 dark:border-neutral-700 dark:text-neutral-400">
            Showing {rows.length} of {total}
          </div>
        )}
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-neutral-400">
            Loading blocked transactions…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center">
            <CreditCard className="mx-auto mb-3 h-12 w-12 text-gray-400" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              No blocked transactions in this range
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-neutral-400">
              Try widening the date range, clearing the email search, or relaxing filters.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-neutral-700">
                    <th className="w-10 bg-gray-50 px-4 py-3 dark:bg-neutral-800"></th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Date</th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Email</th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Card</th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Decline</th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Eligibility</th>
                    <th className="bg-gray-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-neutral-700">
                  {rows.map((r) => {
                    const isSelected = selected.has(r.cardFingerprint);
                    const isRowPending =
                      pendingRowId === r.paymentIntentId && applyMutation.isPending;
                    return (
                      <tr
                        key={r.paymentIntentId}
                        className={`transition-colors hover:bg-gray-50 dark:hover:bg-neutral-800/70 ${
                          r.alreadyAllowlisted
                            ? "bg-gray-50/60 dark:bg-neutral-800/30"
                            : isSelected
                              ? "bg-red-50 dark:bg-red-950/20"
                              : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <Checkbox
                            id={`row-${r.paymentIntentId}`}
                            name={`row-${r.paymentIntentId}`}
                            checked={isSelected}
                            disabled={r.alreadyAllowlisted}
                            onChange={() => toggleRow(r.cardFingerprint)}
                          />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
                          {formatDateTime(r.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
                          <ClickableUserDisplay
                            displayText={r.customerEmail ?? "—"}
                            userId={r.userId}
                          />
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
                          <span className="font-mono">
                            {r.cardBrand} ••{r.cardLast4}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
                          {getDeclineCodeLabel(r.declineCode)}
                        </td>
                        <td className="px-4 py-3">
                          <EligibilityBadge row={r} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            disabled={r.alreadyAllowlisted || isRowPending}
                            onClick={() => handleAllowlistOne(r)}
                            title={
                              r.alreadyAllowlisted
                                ? "This card is already on the Stripe allowlist"
                                : "Add this card to the Stripe allowlist"
                            }
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            {r.alreadyAllowlisted ? "Allowlisted" : isRowPending ? "Working…" : "Allowlist"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="divide-y divide-gray-200 dark:divide-neutral-700 sm:hidden">
              {rows.map((r) => {
                const isSelected = selected.has(r.cardFingerprint);
                const isRowPending =
                  pendingRowId === r.paymentIntentId && applyMutation.isPending;
                return (
                  <div
                    key={r.paymentIntentId}
                    className={`p-4 ${
                      r.alreadyAllowlisted
                        ? "bg-gray-50/60 dark:bg-neutral-800/30"
                        : isSelected
                          ? "bg-red-50 dark:bg-red-950/20"
                          : ""
                    }`}
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <ClickableUserDisplay
                          displayText={r.customerEmail ?? "—"}
                          userId={r.userId}
                          className="text-sm font-semibold text-gray-900 dark:text-white"
                        />
                        <p className="mt-1 font-mono text-xs text-gray-600 dark:text-neutral-400">
                          {r.cardBrand} ••{r.cardLast4}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-neutral-500">
                          {formatDateTime(r.createdAt)}
                        </p>
                      </div>
                      <Checkbox
                        id={`row-mobile-${r.paymentIntentId}`}
                        name={`row-mobile-${r.paymentIntentId}`}
                        checked={isSelected}
                        disabled={r.alreadyAllowlisted}
                        onChange={() => toggleRow(r.cardFingerprint)}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-neutral-400">
                      <EligibilityBadge row={r} />
                      {r.declineCode && <span>· {getDeclineCodeLabel(r.declineCode)}</span>}
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        disabled={r.alreadyAllowlisted || isRowPending}
                        onClick={() => handleAllowlistOne(r)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {r.alreadyAllowlisted ? "Allowlisted" : isRowPending ? "Working…" : "Allowlist"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasMore && (
              <div className="flex justify-center border-t border-gray-200 px-4 py-3 dark:border-neutral-700">
                <button
                  type="button"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isFetchingNextPage ? "animate-spin" : ""}`}
                  />
                  {isFetchingNextPage ? "Loading more..." : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Recently allowlisted card */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-200 dark:border-neutral-800 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-neutral-700">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-red-600" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Recently allowlisted
            </h3>
          </div>
          <span className="text-xs text-gray-500 dark:text-neutral-400">last 50</span>
        </div>
        {recentActions.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-neutral-400">
            Nothing yet.
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-neutral-700">
            {recentActions.map((action: ClientAllowlistAction) => (
              <li
                key={action._id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 text-sm text-gray-700 dark:text-neutral-300">
                  <div className="flex flex-wrap items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-xs text-gray-500 dark:text-neutral-400">
                      {formatDateTime(action.createdAt)}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-700 dark:bg-neutral-800 dark:text-neutral-300">
                      {action.source}
                    </span>
                  </div>
                  <p className="mt-1 truncate font-medium text-gray-900 dark:text-white">
                    {action.customerEmail ?? "—"}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-gray-500 dark:text-neutral-400">
                    {action.cardBrand} ••{action.cardLast4}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={reverseMutation.isPending}
                  onClick={() => handleReverse(action._id)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```
npm run type-check
```

Expected: clean exit. If any errors remain about `AdminMobileLayoutDateRangeShell` import path, mirror exactly the import the past-due page uses (`@/app/admin/component/AdminMobileLayoutDateRangeShell`) — adjust if your project root resolves it differently. Same for `useAdminMobileDateToolbarSlot` and `useCurrentAndLastDrawDates`.

- [ ] **Step 3: Lint**

```
npm run lint
```

Expected: clean exit (or only pre-existing warnings unrelated to this file).

- [ ] **Step 4: Smoke-test in dev**

```
npm run dev
```

Browse to `/admin/blocked-transactions`. Verify:
- Date chips appear (Today / Yesterday / Current Draw / Last Draw / All Time / Custom).
- Email input filters rows after debounce.
- Eligibility multi-select narrows by badge kind.
- Decline-code multi-select narrows by code.
- The 4th metric card now reads "Total on allowlist".
- Clicking an email opens `UserDetailModal` (when the user exists) or stays inert (guest emails).

- [ ] **Step 5: Pause and report**

Tell the user: "Task 15 done — full UI rewrite. Manually verified [list what you confirmed]. Ready for Task 16 (domain manifest + docs)?" Wait for authorization.

---

## Phase 4 — Manifest + docs + verification

### Task 16: Update Domain Manifest in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (and the worktree-local `CLAUDE.md` if they're separate files)

- [ ] **Step 1: Add new file paths to `billing-stripe` domain**

In the `billing-stripe` domain block in `CLAUDE.md`, add these path entries to the existing `paths` array (alphabetised within their section):

```jsonc
"src/utils/billing/declineCodeLabels.ts",
"src/app/api/admin/allowlist/stats/**",
"src/hooks/queries/admin/useAllowlistStats.ts",
"scripts/investigate-blocked-transactions.ts",
```

- [ ] **Step 2: Add new files to `admin` domain**

In the `admin` domain block, add:

```jsonc
"src/components/admin/MultiSelectFilter.tsx",
"src/utils/admin/blockedTransactionEligibility.ts",
```

- [ ] **Step 3: Verify the manifest parses**

```
npm run type-check
```

Expected: clean exit. (The doc-sync hook will validate the manifest JSON on the next Stop.)

- [ ] **Step 4: Pause and report**

Tell the user: "Task 16 done — manifest updated. Ready for Task 17 (domain docs)?" Wait for authorization.

---

### Task 17: Update domain docs

**Files:**
- Modify: `docs/billing-stripe/architecture.md`
- Modify: `docs/billing-stripe/gotchas.md`
- Modify: `docs/billing-stripe/api.md`
- Modify: `docs/billing-stripe/models.md`
- Modify: `docs/admin/frontend.md`

- [ ] **Step 1: `docs/billing-stripe/architecture.md`**

Find the **Webhook flow** diagram. Add a `charge.failed` line in the `switch (event.type)` block after `invoice.payment_failed`:

```
        ├── charge.failed                       → upsert BlockedTransaction (issuer-blocked dual-write; no allowlist apply here)
```

In the **`Webhook dual-write for blocked PIs`** paragraph (around line 114), add the sentence:

> Capture now also runs from `charge.failed`, the universal "any failed charge" event, to cover issuer-blocked subscription renewals where `payment_intent.payment_failed` is sometimes not emitted. The `charge.failed` branch only writes the `BlockedTransaction` row; `AllowlistService.apply()` stays on `payment_intent.payment_failed` to avoid double-recording.

In the **`listBlocked` — Mongo-backed read path** subsection, replace the **Filter handling** paragraph with:

> **Filter handling.** `email` is pushed into the Mongo query as a case-insensitive `$regex` against `customerEmail` (specials escaped); the new `customerEmail` sparse index keeps this bounded. `declineCodes` is pushed as `$in`. `eligibility` is applied **post-join** via `computeEligibilityKind` (`src/utils/admin/blockedTransactionEligibility.ts`) — the same mapper the UI badge uses, so they cannot disagree. `nextCursor` encodes the last *raw* doc on the page, not the last filtered row, so pagination advances even when the post-join filter drops every row on a page.

In the **Reconciliation cron — Phase D** subsection, update **What it does**:

> 1. Counts `BlockedTransaction` documents with `createdAt` inside the last 48-hour UTC window.
> 2. Iterates `stripe.charges.search` for the same window with `data.payment_intent` expansion.
> 3. For every blocked charge whose PI is missing in Mongo, calls `upsertBlockedTransaction()` — same projector as the live webhook.
> 4. Computes `computeDriftRatio(mongoCount, stripeCount)`. Logs `console.error` summary including `recovered: N` if drift > 5% OR `recovered > 0`. Window widened from "yesterday" to 48h to handle late-arriving events + DST transitions.

- [ ] **Step 2: `docs/billing-stripe/gotchas.md`**

Under **Stripe issuer-directed auto-block + allowlist override** add at the end:

> **Capture coverage.** As of 2026-05-07 the webhook listens to **both** `payment_intent.payment_failed` and `charge.failed`. The latter is the universal "any failed charge" event and catches issuer-blocked subscription renewals where the PI event sometimes does not fire. Only `payment_intent.payment_failed` triggers `AllowlistService.apply()` — the `charge.failed` branch is write-side-only — so we never double-record `AllowlistAction` rows. The reconcile cron is now self-healing (upserts missing rows on every run) and `npm run investigate:blocked` is a read-only diagnostic that compares Stripe and Mongo for a date window.

- [ ] **Step 3: `docs/billing-stripe/api.md`**

Add a new section under the existing admin allowlist endpoints:

```markdown
### `GET /api/admin/allowlist/stats`

Admin-only. Returns `{ success: true, totalActiveAllowlisted: number }` — the count of card fingerprints whose most-recent `AllowlistAction` is `"added"`. Drives the "Total on allowlist" metric on `/admin/blocked-transactions`. Stripe's `card_fingerprint_allowlist` is the live allowlist; this is an audit-log approximation.
```

- [ ] **Step 4: `docs/billing-stripe/models.md`**

Under the `BlockedTransaction` indexes table/list, add:

> `{ customerEmail: 1 } (sparse)` — added 2026-05-07 to support the admin email-substring filter without a collection scan.

- [ ] **Step 5: `docs/admin/frontend.md`**

Refresh the `/admin/blocked-transactions` description with:

> **Filters:** date range (matches `/admin/past-due-history` chips + custom modal exactly), email substring search (server-side, debounced 300ms), eligibility multi-select (Auto-eligible / Already allowlisted / Fraud signal / Permanent issue / Skipped — not member), decline-code multi-select grouped by recoverable / fraud / permanent / other.
>
> **Metrics:** Total blocked (current filters), Auto-eligible, Skipped — filter, **Total on allowlist** (all-time, all active fingerprints).
>
> **Email column** is clickable via `ClickableUserDisplay` — opens the same `UserDetailModal` the users + past-due-history tabs use; renders as plain text for guest / unmatched emails.

- [ ] **Step 6: Verify manifest & docs are aligned**

```
npm run type-check
```

Expected: clean. The doc-sync `Stop` hook will run on the next session-end and verify the docs/manifest pairing.

- [ ] **Step 7: Pause and report**

Tell the user: "Task 17 done — domain docs updated. Ready for Task 18 (final verification)?" Wait for authorization.

---

### Task 18: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run all relevant tests**

```
npm run test:blocked-eligibility-mapper
npm run test:list-blocked-filters
npm run test:reconcile-drift
npm run test:blocked-transaction-repo
npm run test:allowlist
```

Expected: every command passes.

- [ ] **Step 2: Type-check + lint**

```
npm run type-check
npm run lint
```

Expected: both clean.

- [ ] **Step 3: Manual UI smoke test**

```
npm run dev
```

Visit `/admin/blocked-transactions` and confirm:
- [ ] Date chips render and switch the range (Today / Yesterday / Current Draw / Last Draw / All Time / Custom).
- [ ] Mobile date toolbar appears on narrow viewports (resize to verify).
- [ ] Email input filters rows after the 300ms debounce; clearing it restores the full list.
- [ ] Eligibility multi-select shows checkmarks; selecting "Auto-eligible" narrows to that badge.
- [ ] Decline-code multi-select is grouped (Recoverable / Fraud signals / Permanent issues / Other).
- [ ] "Total on allowlist" metric loads from `useAllowlistStats`; reflects an apply / reverse within ~60s (or a refresh).
- [ ] Clicking a known-user email opens `UserDetailModal`; clicking a guest email is inert (plain text).
- [ ] "Showing X of Y" + Load more still works.
- [ ] Bulk allowlist + per-row allowlist + override + remove (in "Recently allowlisted") still work.

- [ ] **Step 4: Run the investigation script for the last 7 days**

```
npm run investigate:blocked -- --from=$(date -u -d '7 days ago' +%Y-%m-%dT00:00:00Z)
```

(On Windows PowerShell:)

```
npm run investigate:blocked -- --from=2026-04-30T00:00:00Z
```

Expected: missing count is 0 *for new charges since deploy* (older missing rows from before the fix are recovered by the next reconcile cron run, or by re-running `backfill:blocked-transactions`).

- [ ] **Step 5: Final report to user**

Tell the user:

> "All 18 tasks done. Verified:
> - Tests passing: blocked-eligibility-mapper, list-blocked-filters, reconcile-drift, blocked-transaction-repo, allowlist
> - Type-check + lint clean
> - Manual UI checks complete
> - Investigation script reports N missing rows in last 7 days (down from M before the fix)
>
> Deployment notes:
> 1. Enable `charge.failed` event in the Stripe dashboard webhook subscription before deploy.
> 2. The new `customerEmail` sparse index will build in the background on first deploy.
> 3. Reconcile cron will catch up any historical drift over the next 24h.
>
> Ready to commit / push / open a PR? Tell me explicitly which actions you want."

Wait for the user's commit / push / PR authorization keyword.

---

## Self-Review

**Spec coverage check:**
- Spec §1.1 charge.failed handler → Task 3 ✓
- Spec §1.2 self-healing reconcile cron → Task 4 ✓
- Spec §1.3 investigation script → Task 2 ✓
- Spec §2.1 BlockedFilter type changes → Task 5 ✓
- Spec §2.2 BlockedRow.userId → Task 5 + Task 7 (set in service) ✓
- Spec §2.3 listBlocked updates (email regex + declineCodes $in + eligibility post-filter + customerEmail index) → Task 1 (index) + Task 7 (service) ✓
- Spec §2.4 stats endpoint → Task 9 ✓
- Spec §2.5 useAllowlistStats hook → Task 10 ✓
- Spec §3.1 date filter parity → Task 15 ✓
- Spec §3.2 filters card layout → Tasks 11 (decline-code map) + 14 (multi-select component) + 15 (wire-up) ✓
- Spec §3.3 metric cards swap → Task 15 ✓
- Spec §3.4 clickable email → Task 15 ✓
- Spec §3.5 empty-state copy → Task 15 ✓
- Spec testing — listBlockedFilters.test.ts → Task 8; eligibility-mapper.test.ts → Task 6 ✓
- Spec doc updates → Tasks 16 (manifest) + 17 (domain docs) ✓

All spec requirements have a task.

**Placeholder scan:** No "TBD" / "TODO" / "implement later" / "appropriate handling" found. Each step shows the actual code or command. Test code is complete with assertions.

**Type consistency:**
- `EligibilityKind` declared in Task 5; consumed in Tasks 6, 7, 12, 15 — all using identical name and union members.
- `BlockedFilter` shape (Task 5) matches the parsing in Task 12 and serialization in Task 13.
- `BlockedRow.userId: string | null` (Task 5) matches Task 7's projection (`userId: resolvedUserId ? String(resolvedUserId._id) : null`).
- `computeEligibilityKind` signature `({ alreadyAllowlisted, preview }) → EligibilityKind` is the same in Task 6 (definition), Task 7 (service post-filter), Task 15 (UI badge).
- `MultiSelectFilter` props (Task 14) match its usage in Task 15.
- `DECLINE_CODE_LABELS` shape (Task 11) matches its consumption in Task 15's `DECLINE_CODE_OPTIONS` builder.
- `useAllowlistStats` returns `{ data?: { totalActiveAllowlisted: number } }` (Task 10) — Task 15 reads `statsQuery.data?.totalActiveAllowlisted ?? "—"` ✓.

No drift between tasks.
