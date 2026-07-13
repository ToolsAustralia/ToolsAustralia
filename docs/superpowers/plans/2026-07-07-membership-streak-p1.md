# Membership Streak — Phase 1 Implementation Plan (dark counter + backfill)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Repo hard rule 1:** commit steps in this plan require the owner to have authorized commits this session (keywords: commit/push/merge/PR). If not authorized, complete the work and SKIP commit steps; ask the owner at the end.

**Goal:** Ship the durable, replay-proof streak counter (`streakMonths` / `streakGeneration`) written by the Stripe webhook, plus the launch backfill — dark (no UI, no grants yet).

**Architecture:** All streak *decisions* live in one pure util (`src/utils/subscription/streak.ts`) so they are unit-testable without Mongo. The webhook applies decisions at two verified hook points: the renewal-cycle upsert (increment, gated on the ledger pre-image) and the `subscription_create` grant block (start/reset, guarded by an invoice-id marker). The backfill runner is a thin wrapper over the same pure walker.

**Tech Stack:** Next.js 15 / Mongoose / Stripe webhooks; tests are standalone `tsx` scripts wired as `test:*` npm entries (no jest).

**Spec:** `docs/superpowers/specs/2026-07-07-membership-streak-design.md`

## Global Constraints

- Join = **month 0**; each *paid* `billing_reason === "subscription_cycle"` invoice increments by 1; counts paid cycles, not calendar months.
- Continuity: recovered past-due keeps; retention pause freezes (emergent — no code); grace-window (30 days from `subscription.endDate`) resubscribe continues; upgrade/downgrade never touches; only out-of-grace `create_new` resets (generation +1 when a prior streak > 0 existed).
- Idempotency: increment fires only when the `MembershipRenewalCycle` upsert transitions a row INTO paid (pre-image absent/`expected`/`failed`); start/reset guarded by `subscription.lastStreakStartInvoiceId $ne invoiceId`. Never a bare `$inc` beside a replayable upsert.
- After every DB write, mirror the value onto the in-memory `user` doc (later `user.save()` calls in the same handler must not regress it).
- The backfill is **re-runnable** (idempotent `$set`) and doubles as the drift-repair tool. No retroactive grants exist in P1 (grants are P2).
- No `any`; `console.error` for errors that must survive prod builds; ops script follows writing-ops-script conventions (dry-run default, CSV audit, progress with denominator/rate/ETA, 3-tier exit codes).
- Doc-sync (same task as code): `docs/subscription/`, `docs/billing-stripe/`, `docs/infrastructure/` + BUSINESS.md & CUSTOMER.md touches (User.ts + webhook are trigger paths).

---

### Task 1: Pure streak decision logic (TDD)

**Files:**
- Create: `src/utils/subscription/streak.ts`
- Test: `src/utils/subscription/__tests__/streak.test.ts`
- Modify: `package.json` (add `"test:streak": "tsx src/utils/subscription/__tests__/streak.test.ts"` beside the other `test:*` entries)

**Interfaces (later tasks rely on these exact names):**
- `RESUBSCRIBE_GRACE_DAYS = 30`
- `isFirstTimePaidCycle(previousStatus: string | null | undefined): boolean`
- `decideStreakOnSubscriptionCreate(params): StreakCreateDecision` — `{ action: "none" } | { action: "continue" } | { action: "start"; streakMonths: 0; streakGeneration: number }`

- [ ] **Step 1: Write the failing test** (`src/utils/subscription/__tests__/streak.test.ts`, assert-based like `zero-trial-invoice-guard.test.ts`)

```ts
import assert from "node:assert";
import {
  RESUBSCRIBE_GRACE_DAYS,
  isFirstTimePaidCycle,
  decideStreakOnSubscriptionCreate,
} from "../streak";

const NOW = new Date("2026-08-10T00:00:00Z");
const days = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
let passed = 0;
function t(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✅ ${name}`);
}

// --- isFirstTimePaidCycle ---
t("no pre-image row → first paid", () => assert.equal(isFirstTimePaidCycle(null), true));
t("undefined pre-image → first paid", () => assert.equal(isFirstTimePaidCycle(undefined), true));
t("expected → first paid", () => assert.equal(isFirstTimePaidCycle("expected"), true));
t("failed → first paid (past-due recovery increments, late)", () =>
  assert.equal(isFirstTimePaidCycle("failed"), true));
t("succeeded → replay, no increment", () => assert.equal(isFirstTimePaidCycle("succeeded"), false));
t("recovered → replay, no increment", () => assert.equal(isFirstTimePaidCycle("recovered"), false));

// --- decideStreakOnSubscriptionCreate ---
const base = {
  billingReason: "subscription_create" as string | null | undefined,
  isUpgrade: false,
  isResubscribe: false,
  previousEndDate: null as Date | null,
  currentStreakMonths: 0,
  currentStreakGeneration: 1,
  now: NOW,
};
t("renewal invoice → none (handled by cycle writer)", () =>
  assert.equal(decideStreakOnSubscriptionCreate({ ...base, billingReason: "subscription_cycle" }).action, "none"));
t("upgrade (Mode B new-sub) → none — streak untouched", () =>
  assert.equal(decideStreakOnSubscriptionCreate({ ...base, isUpgrade: true }).action, "none"));
t("fresh join → start at 0, generation kept", () => {
  const d = decideStreakOnSubscriptionCreate(base);
  assert.equal(d.action, "start");
  if (d.action === "start") {
    assert.equal(d.streakMonths, 0);
    assert.equal(d.streakGeneration, 1);
  }
});
t("resubscribe within 30-day grace → continue (counter preserved)", () => {
  const d = decideStreakOnSubscriptionCreate({
    ...base, isResubscribe: true, previousEndDate: days(29), currentStreakMonths: 7,
  });
  assert.equal(d.action, "continue");
});
t("resubscribe exactly at grace boundary → continue", () => {
  const d = decideStreakOnSubscriptionCreate({
    ...base, isResubscribe: true, previousEndDate: days(RESUBSCRIBE_GRACE_DAYS), currentStreakMonths: 7,
  });
  assert.equal(d.action, "continue");
});
t("resubscribe past grace with prior streak → reset + generation bump", () => {
  const d = decideStreakOnSubscriptionCreate({
    ...base, isResubscribe: true, previousEndDate: days(31),
    currentStreakMonths: 7, currentStreakGeneration: 2,
  });
  assert.equal(d.action, "start");
  if (d.action === "start") assert.equal(d.streakGeneration, 3);
});
t("resubscribe past grace, prior streak 0 → start, generation kept (no issuances to collide)", () => {
  const d = decideStreakOnSubscriptionCreate({
    ...base, isResubscribe: true, previousEndDate: days(90), currentStreakMonths: 0,
  });
  assert.equal(d.action, "start");
  if (d.action === "start") assert.equal(d.streakGeneration, 1);
});
t("resubscribe with NO endDate on record → reset (conservative) + bump when prior streak", () => {
  const d = decideStreakOnSubscriptionCreate({
    ...base, isResubscribe: true, previousEndDate: null, currentStreakMonths: 4,
  });
  assert.equal(d.action, "start");
  if (d.action === "start") assert.equal(d.streakGeneration, 2);
});

console.log(`\n${passed} streak decision tests passed`);
```

- [ ] **Step 2: Run to verify it fails** — `npx tsx src/utils/subscription/__tests__/streak.test.ts` → FAIL: cannot find module `../streak`.

- [ ] **Step 3: Minimal implementation** (`src/utils/subscription/streak.ts`)

```ts
/**
 * Membership Streak — pure decision logic (no DB, no Stripe).
 * Spec: docs/superpowers/specs/2026-07-07-membership-streak-design.md
 * Streak = consecutive paid renewals. Join = month 0. Only subscription_cycle
 * invoices increment; only an out-of-grace create_new resets.
 */

export const RESUBSCRIBE_GRACE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A paid cycle invoice increments the streak only when the renewal-cycle
 * ledger row transitions INTO paid: pre-image absent (fresh insert) or a
 * not-yet-paid status. A replayed webhook sees "succeeded"/"recovered" → no-op.
 */
export function isFirstTimePaidCycle(previousStatus: string | null | undefined): boolean {
  return previousStatus == null || previousStatus === "expected" || previousStatus === "failed";
}

export type StreakCreateDecision =
  | { action: "none" }
  | { action: "continue" }
  | { action: "start"; streakMonths: 0; streakGeneration: number };

export function decideStreakOnSubscriptionCreate(params: {
  billingReason: string | null | undefined;
  isUpgrade: boolean;
  isResubscribe: boolean;
  previousEndDate: Date | null | undefined;
  currentStreakMonths: number;
  currentStreakGeneration: number;
  now: Date;
}): StreakCreateDecision {
  const {
    billingReason, isUpgrade, isResubscribe, previousEndDate,
    currentStreakMonths, currentStreakGeneration, now,
  } = params;

  if (billingReason !== "subscription_create") return { action: "none" };
  // Mode-B upgrades arrive as subscription_create on a new sub — streak continuity, no write.
  if (isUpgrade) return { action: "none" };

  if (isResubscribe && previousEndDate instanceof Date) {
    const gapDays = (now.getTime() - previousEndDate.getTime()) / DAY_MS;
    if (gapDays <= RESUBSCRIBE_GRACE_DAYS) return { action: "continue" };
  }

  // Fresh join, or resubscribe past grace (incl. missing endDate — conservative reset).
  return {
    action: "start",
    streakMonths: 0,
    streakGeneration: currentStreakMonths > 0 ? currentStreakGeneration + 1 : currentStreakGeneration,
  };
}
```

- [ ] **Step 4: Run tests** — `npx tsx src/utils/subscription/__tests__/streak.test.ts` → all pass.
- [ ] **Step 5: Add the npm entry** in `package.json` beside the other test entries: `"test:streak": "tsx src/utils/subscription/__tests__/streak.test.ts"` — then `npm run test:streak` → PASS.
- [ ] **Step 6: Commit** (only if authorized): `git add src/utils/subscription/streak.ts src/utils/subscription/__tests__/streak.test.ts package.json && git commit -m "feat(streak): pure streak decision logic + tests"`

---

### Task 2: User model fields

**Files:**
- Modify: `src/models/User.ts` — subscription interface (~line 85, after `lastResubscribedAt?: Date;`) and subscription schema (~line 594, after the `lastResubscribedAt` schema block)

**Interfaces:** later tasks read/write `user.subscription.streakMonths`, `user.subscription.streakGeneration`, `user.subscription.lastStreakStartInvoiceId`.

- [ ] **Step 1: Interface** — inside the `subscription?: { ... }` block, immediately after `lastResubscribedAt?: Date;`:

```ts
    /** Membership Streak: consecutive paid renewals (join = month 0). Written ONLY by the
     *  Stripe webhook writers + the backfill script. See docs/superpowers/specs/2026-07-07-membership-streak-design.md */
    streakMonths?: number;
    /** Increments on each out-of-grace resubscribe reset; scopes milestone re-earning. */
    streakGeneration?: number;
    /** Invoice id of the last subscription_create the streak start/reset writer consumed (idempotency marker). */
    lastStreakStartInvoiceId?: string;
```

- [ ] **Step 2: Schema** — inside the subscription schema object, immediately after the `lastResubscribedAt` block:

```ts
      // Membership Streak (see interface comments). Defaults keep legacy docs valid.
      streakMonths: {
        type: Number,
        required: false,
        default: 0,
        min: [0, "Streak months cannot be negative"],
      },
      streakGeneration: {
        type: Number,
        required: false,
        default: 1,
        min: [1, "Streak generation starts at 1"],
      },
      lastStreakStartInvoiceId: {
        type: String,
        required: false,
      },
```

- [ ] **Step 3: Type-check** — `npm run type-check` → clean.
- [ ] **Step 4: Commit** (if authorized): `git commit -m "feat(streak): streak counter fields on User.subscription"`

---

### Task 3: `upsertRenewalCycleFromPaidInvoice` returns the paid-transition signal

**Files:**
- Modify: `src/services/admin/membershipAnalyticsPersistence.ts:29-70`

**Interfaces:**
- Produces: `upsertRenewalCycleFromPaidInvoice(input): Promise<{ firstTimeSucceeded: boolean }>` (was `Promise<void>` — the only current caller is webhook index.ts:3436, updated in Task 4).
- Consumes: `isFirstTimePaidCycle` from Task 1.

- [ ] **Step 1: Change the function** — return type `Promise<{ firstTimeSucceeded: boolean }>`; early returns become `return { firstTimeSucceeded: false };`. Replace the `findOneAndUpdate` call so the PRE-IMAGE decides:

```ts
import { isFirstTimePaidCycle } from "@/utils/subscription/streak";
// ...
  const previous = await MembershipRenewalCycle.findOneAndUpdate(
    { stripeInvoiceId: invoiceId },
    {
      $set: {
        userId,
        stripeSubscriptionId,
        billingReason: invoice.billing_reason ?? "subscription_cycle",
        status: "succeeded",
        dueAt,
        amountDueCents,
        amountPaidCents,
        succeededAt,
        failedAt: null,
        paymentIntentId,
        confidence: "stripe",
      },
    },
    { upsert: true, new: false } // pre-image: null on fresh insert
  );
  return { firstTimeSucceeded: isFirstTimePaidCycle(previous?.status ?? null) };
```

- [ ] **Step 2: Type-check** — `npm run type-check` → clean (the void-consuming caller compiles unchanged until Task 4).
- [ ] **Step 3: Commit** (if authorized): `git commit -m "feat(streak): renewal-cycle upsert reports first-paid transition"`

---

### Task 4: Webhook — increment on true renewal

**Files:**
- Modify: `src/services/stripe-webhook-handlers/index.ts:3434-3444` (the `subscription_cycle` upsert call inside `handleInvoicePaymentSucceeded`; anchor: `await upsertRenewalCycleFromPaidInvoice({`)

**Interfaces:** consumes Task 3's return; `User` model is already imported in this file.

- [ ] **Step 1: Replace the call block** with (increment in its OWN try/catch — a failed increment must be loud, and must not be swallowed by the non-blocking ledger catch):

```ts
    if (expandedInvoice.billing_reason === "subscription_cycle" && expandedInvoice.id) {
      let firstTimePaidCycle = false;
      try {
        ({ firstTimeSucceeded: firstTimePaidCycle } = await upsertRenewalCycleFromPaidInvoice({
          invoice: expandedInvoice,
          userId: new mongoose.Types.ObjectId(String(user._id)),
          stripeSubscriptionId: subscriptionId,
        }));
      } catch (cycleErr) {
        webhookLog("warn", `Membership renewal cycle (paid) persist failed (non-blocking): ${cycleErr}`);
      }
      if (firstTimePaidCycle) {
        try {
          await User.updateOne({ _id: user._id }, { $inc: { "subscription.streakMonths": 1 } });
          if (user.subscription) {
            // Keep the in-memory doc fresh so any later user.save() in this handler can't regress the counter.
            user.subscription.streakMonths = (user.subscription.streakMonths ?? 0) + 1;
          }
          webhookLog("info", `Streak +1 → ${user.subscription?.streakMonths} (cycle invoice ${expandedInvoice.id})`);
        } catch (streakErr) {
          // Counter drift is repairable by re-running scripts/backfill-membership-streaks.ts --live
          console.error(`Streak increment failed for user ${user._id} invoice ${expandedInvoice.id}:`, streakErr);
        }
      }
    }
```

- [ ] **Step 2: Type-check + regression suites** — `npm run type-check && npm run test:zero-trial-guard && npm test` → all pass ($0-trial guard returns before this block for its invoices; join charges are `subscription_create` and never enter it).
- [ ] **Step 3: Commit** (if authorized): `git commit -m "feat(streak): increment streak on first-paid renewal cycles"`

---

### Task 5: Webhook — start/reset writer on `subscription_create`

**Files:**
- Modify: `src/services/stripe-webhook-handlers/index.ts` — insert immediately AFTER the `const isUpgrade = Boolean(...)` block (~line 3692; anchor: `invoice.billing_reason !== "subscription_cycle" // ✅ CRITICAL: Renewals should NOT be treated as upgrades`)

**Interfaces:** consumes `decideStreakOnSubscriptionCreate` from Task 1; uses locals already in scope: `expandedInvoice`, `user`, `isResubscribe` (line 3673), `isUpgrade` (line 3688).

- [ ] **Step 1: Insert the writer**

```ts
    // Membership Streak: start/continue/reset on subscription_create (upgrades excluded — continuity).
    // Renewal increments live beside the renewal-cycle upsert above. Idempotent per invoice id.
    try {
      const streakDecision = decideStreakOnSubscriptionCreate({
        billingReason: expandedInvoice.billing_reason,
        isUpgrade,
        isResubscribe,
        previousEndDate: user.subscription?.endDate ?? null,
        currentStreakMonths: user.subscription?.streakMonths ?? 0,
        currentStreakGeneration: user.subscription?.streakGeneration ?? 1,
        now: new Date(),
      });
      if (streakDecision.action === "start" && expandedInvoice.id) {
        const res = await User.updateOne(
          { _id: user._id, "subscription.lastStreakStartInvoiceId": { $ne: expandedInvoice.id } },
          {
            $set: {
              "subscription.streakMonths": streakDecision.streakMonths,
              "subscription.streakGeneration": streakDecision.streakGeneration,
              "subscription.lastStreakStartInvoiceId": expandedInvoice.id,
            },
          }
        );
        if (res.modifiedCount === 1 && user.subscription) {
          user.subscription.streakMonths = streakDecision.streakMonths;
          user.subscription.streakGeneration = streakDecision.streakGeneration;
          user.subscription.lastStreakStartInvoiceId = expandedInvoice.id;
          webhookLog(
            "info",
            `Streak ${isResubscribe ? "reset (out-of-grace resubscribe)" : "started"} — generation ${streakDecision.streakGeneration} (invoice ${expandedInvoice.id})`
          );
        }
      } else if (streakDecision.action === "continue") {
        webhookLog("info", `Streak continues at ${user.subscription?.streakMonths ?? 0} (grace-window resubscribe)`);
      }
    } catch (streakErr) {
      console.error(`Streak start writer failed for user ${user._id}:`, streakErr);
    }
```

Import at top of file (beside other `@/utils` imports): `import { decideStreakOnSubscriptionCreate } from "@/utils/subscription/streak";`

- [ ] **Step 2: Type-check + suites** — `npm run type-check && npm run test:streak && npm run test:zero-trial-guard && npm test` → pass.
- [ ] **Step 3: Commit** (if authorized): `git commit -m "feat(streak): start/reset streak on subscription_create with invoice-id idempotency"`

---

### Task 6: Backfill walker (pure, TDD)

**Files:**
- Modify: `src/utils/subscription/streak.ts` (append), `src/utils/subscription/__tests__/streak.test.ts` (append)

**Interfaces:**
- Produces: `computeStreakFromHistory(params): { streakMonths: number; streakGeneration: number; breaks: number; confidence: "ledger-complete" | "history-incomplete" }`
- `MAX_CYCLE_GAP_DAYS = 35`

- [ ] **Step 1: Append failing tests**

```ts
import { computeStreakFromHistory } from "../streak";
const d = (s: string) => new Date(s);

t("continuous 5 cycles → streak 5, gen 1", () => {
  const r = computeStreakFromHistory({
    joinDate: d("2026-01-10"), coverageStart: d("2025-01-01"),
    cycles: ["2026-02-10", "2026-03-10", "2026-04-10", "2026-05-10", "2026-06-10"].map((x) => ({ dueAt: d(x) })),
    cancelDates: [], isCurrentlyActive: true, now: d("2026-06-20"),
  });
  assert.equal(r.streakMonths, 5);
  assert.equal(r.streakGeneration, 1);
  assert.equal(r.confidence, "ledger-complete");
});
t("60-day gap WITH intervening cancel → generation break, count restarts at 1", () => {
  const r = computeStreakFromHistory({
    joinDate: d("2026-01-10"), coverageStart: d("2025-01-01"),
    cycles: [{ dueAt: d("2026-02-10") }, { dueAt: d("2026-03-10") }, { dueAt: d("2026-05-15") }],
    cancelDates: [d("2026-03-20")], isCurrentlyActive: true, now: d("2026-05-20"),
  });
  assert.equal(r.streakMonths, 1);
  assert.equal(r.streakGeneration, 2);
  assert.equal(r.breaks, 1);
});
t("60-day gap WITHOUT cancel (recovery/pause lag) → continues, missed months don't count", () => {
  const r = computeStreakFromHistory({
    joinDate: d("2026-01-10"), coverageStart: d("2025-01-01"),
    cycles: [{ dueAt: d("2026-02-10") }, { dueAt: d("2026-03-10") }, { dueAt: d("2026-05-15") }],
    cancelDates: [], isCurrentlyActive: true, now: d("2026-05-20"),
  });
  assert.equal(r.streakMonths, 3);
  assert.equal(r.streakGeneration, 1);
});
t("two cycles in one calendar month (reanchor) both count", () => {
  const r = computeStreakFromHistory({
    joinDate: d("2026-01-10"), coverageStart: d("2025-01-01"),
    cycles: [{ dueAt: d("2026-02-10") }, { dueAt: d("2026-03-02") }, { dueAt: d("2026-03-24") }],
    cancelDates: [], isCurrentlyActive: true, now: d("2026-03-28"),
  });
  assert.equal(r.streakMonths, 3);
});
t("cancel within grace of next cycle does NOT break", () => {
  const r = computeStreakFromHistory({
    joinDate: d("2026-01-10"), coverageStart: d("2025-01-01"),
    cycles: [{ dueAt: d("2026-02-10") }, { dueAt: d("2026-03-08") }],
    cancelDates: [d("2026-02-20")], isCurrentlyActive: true, now: d("2026-03-15"),
  });
  assert.equal(r.streakMonths, 2);
  assert.equal(r.streakGeneration, 1);
});
t("history-incomplete + active + no breaks → rounds UP to whole months since join", () => {
  const r = computeStreakFromHistory({
    joinDate: d("2025-09-10"), coverageStart: d("2026-04-29"), // joined before ledger coverage
    cycles: [{ dueAt: d("2026-05-10") }, { dueAt: d("2026-06-10") }],
    cancelDates: [], isCurrentlyActive: true, now: d("2026-06-20"),
  });
  assert.equal(r.confidence, "history-incomplete");
  assert.equal(r.streakMonths, 9); // whole months Sep 10 → Jun 20, generous per spec §3
});
t("history-incomplete but a break was detected → walked value only (no round-up across a break)", () => {
  const r = computeStreakFromHistory({
    joinDate: d("2025-09-10"), coverageStart: d("2026-04-29"),
    cycles: [{ dueAt: d("2026-05-10") }, { dueAt: d("2026-08-20") }],
    cancelDates: [d("2026-05-25")], isCurrentlyActive: true, now: d("2026-08-25"),
  });
  assert.equal(r.streakMonths, 1);
  assert.equal(r.streakGeneration, 2);
});
t("no cycles at all, active member joined mid-coverage → streak 0 (month 0)", () => {
  const r = computeStreakFromHistory({
    joinDate: d("2026-06-25"), coverageStart: d("2025-01-01"),
    cycles: [], cancelDates: [], isCurrentlyActive: true, now: d("2026-07-07"),
  });
  assert.equal(r.streakMonths, 0);
  assert.equal(r.confidence, "ledger-complete");
});
```

- [ ] **Step 2: Run → FAIL** (`computeStreakFromHistory` not exported).
- [ ] **Step 3: Implement** (append to `streak.ts`)

```ts
export const MAX_CYCLE_GAP_DAYS = 35;

export interface StreakBackfillInput {
  /** subscription.startDate (or earliest evidence) — month 0 anchor. */
  joinDate: Date | null;
  /** Earliest date the renewal-cycle ledger is trusted from (~2026-04-29 per MembershipStatusHistory coverage). */
  coverageStart: Date;
  /** Paid cycles (status succeeded/recovered), sorted ascending by dueAt. */
  cycles: Array<{ dueAt: Date }>;
  /** MembershipStatusHistory rows with membershipStatus "canceled" (effectiveAt), ascending. */
  cancelDates: Date[];
  isCurrentlyActive: boolean;
  now: Date;
}

export interface StreakBackfillResult {
  streakMonths: number;
  streakGeneration: number;
  breaks: number;
  confidence: "ledger-complete" | "history-incomplete";
}

function wholeMonthsBetween(a: Date, b: Date): number {
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  return Math.max(months, 0);
}

/**
 * Reconstruct streakMonths/streakGeneration from the renewal ledger.
 * Break rule (spec §3): a gap > MAX_CYCLE_GAP_DAYS between paid cycles WITH an
 * intervening "canceled" history row that fell outside the resubscribe grace of
 * the next paid cycle = a generation break; the next cycle is renewal #1 of the
 * new generation. Gaps without cancel evidence (recovery lag, retention pause)
 * continue without crediting the missed months.
 * Round-up rule: history-incomplete (join predates coverage) + currently active
 * + zero detected breaks → round UP to whole months since join (never
 * under-credit veterans; owner-approved).
 */
export function computeStreakFromHistory(input: StreakBackfillInput): StreakBackfillResult {
  const { joinDate, coverageStart, cycles, cancelDates, isCurrentlyActive, now } = input;
  let count = 0;
  let generation = 1;
  let breaks = 0;
  let prevAt: Date | null = joinDate;

  for (const cycle of cycles) {
    const gapDays = prevAt ? (cycle.dueAt.getTime() - prevAt.getTime()) / (24 * 60 * 60 * 1000) : 0;
    const cancelBetween = prevAt
      ? cancelDates.find((c) => prevAt !== null && c > prevAt && c < cycle.dueAt)
      : undefined;
    const cancelOutsideGrace =
      cancelBetween !== undefined &&
      (cycle.dueAt.getTime() - cancelBetween.getTime()) / (24 * 60 * 60 * 1000) > RESUBSCRIBE_GRACE_DAYS;

    if (prevAt && gapDays > MAX_CYCLE_GAP_DAYS && cancelOutsideGrace) {
      generation += 1;
      breaks += 1;
      count = 1; // this paid cycle is renewal #1 of the new generation
    } else {
      count += 1;
    }
    prevAt = cycle.dueAt;
  }

  const historyIncomplete = joinDate !== null && joinDate < coverageStart;
  let streakMonths = count;
  if (historyIncomplete && isCurrentlyActive && breaks === 0 && joinDate) {
    streakMonths = Math.max(count, wholeMonthsBetween(joinDate, now));
  }

  return {
    streakMonths,
    streakGeneration: generation,
    breaks,
    confidence: historyIncomplete ? "history-incomplete" : "ledger-complete",
  };
}
```

- [ ] **Step 4: Run** — `npm run test:streak` → all pass (decision + walker suites).
- [ ] **Step 5: Commit** (if authorized): `git commit -m "feat(streak): pure backfill walker with break detection + generous round-up"`

---

### Task 7: Backfill runner script

**Files:**
- Create: `scripts/backfill-membership-streaks.ts`
- Modify: `package.json` scripts: `"backfill:membership-streaks": "tsx scripts/backfill-membership-streaks.ts --live"`, `"backfill:membership-streaks:dry": "tsx scripts/backfill-membership-streaks.ts"`

**Interfaces:** consumes `computeStreakFromHistory`. Mirror the connection/progress/CSV patterns of `scripts/backfill-klaviyo-membership-properties.ts` (reference implementation named in CLAUDE.md) — same dotenv + `dbConnect` from `@/lib/mongodb`, same adaptive ~20-line progress cadence.

- [ ] **Step 1: Write the script.** Requirements (all mandatory, per writing-ops-script + CLAUDE.md ops conventions):
  - **Dry-run by default**; `--live` opts into writes; `--user <id>` scopes to one user for verification.
  - Selection: users with `subscription` present AND (`subscription.isActive: true` OR `subscription.lastMonthAccumulatedEntries` exists) — active members plus lapsed-with-history (their preserved counter matters for grace-window continuation).
  - Per user: load `MembershipRenewalCycle` rows `status ∈ {succeeded, recovered}` sorted `dueAt` asc; load `MembershipStatusHistory` rows `membershipStatus: "canceled"` sorted `effectiveAt` asc; `coverageStart = new Date("2026-04-29")`; run `computeStreakFromHistory`; write `$set { "subscription.streakMonths", "subscription.streakGeneration" }` (live only).
  - **Anomaly tier:** if `computed.streakMonths > wholeMonthsSince(joinDate) + 1` log CSV anomaly and exit tier 1 at the end.
  - **CSV audit** (append mode): `userId,email,previousStreak,computedStreak,generation,breaks,confidence,cyclesCounted` to `backfill-membership-streaks-audit.csv`.
  - **Progress:** up-front total (denominator), ~20 adaptive progress lines `processed/total (%) · rate/sec · ETA`, final summary (updated / unchanged / anomalies / by-confidence counts).
  - **Exit codes:** 0 clean · 1 completed-with-anomalies · 2 fatal.
  - **Re-runnable:** pure `$set` from recomputation — this script IS the drift-repair tool (referenced by Task 4's error path).
- [ ] **Step 2: Dry-run against dev DB** — `npm run backfill:membership-streaks:dry` → prints summary, writes CSV, **modifies nothing** (verify a sampled user's `streakMonths` unchanged).
- [ ] **Step 3: Spot-verify 3 sampled users** from the CSV against their raw `MembershipRenewalCycle` rows (manual sanity: counts and generations match expectations).
- [ ] **Step 4: Commit** (if authorized): `git commit -m "feat(streak): re-runnable membership-streak backfill script (dry-run default)"`

---

### Task 8: Full verification sweep

- [ ] `npm run type-check` → clean
- [ ] `npm run lint` → no new errors
- [ ] `npm run test:streak` → pass (14+ assertions)
- [ ] `npm run test:zero-trial-guard` → pass (the $0-trial invoice can never touch the counter)
- [ ] `npm test` (anchor-billing) → pass
- [ ] `npm run test:subscription-entries-calculator` → pass (entries math untouched)
- [ ] Adversarial self-review of the two webhook edits against the transition matrix in the spec (§2/§5): join, renewal, replay, recovery, upgrade A/B, downgrade, pause, grace reactivate, out-of-grace resubscribe, $0-trial, deletion-preservation.

### Task 9: Documentation sync (same task as code — hook-enforced)

- [ ] `docs/subscription/models.md` — the three new `User.subscription` fields + semantics.
- [ ] `docs/subscription/backend.md` — streak counter: writers, idempotency guards, grace rule, generation model, repair path (re-run backfill).
- [ ] `docs/subscription/gotchas.md` — (1) never bare-`$inc` beside the replayable upsert; (2) in-memory mirror requirement; (3) upgrade/delete handlers preserve streak fields because they mutate field-by-field — do not convert them to subdoc replacement.
- [ ] `docs/billing-stripe/backend.md` — the two webhook hook points.
- [ ] `docs/infrastructure/README.md` — the backfill script + npm entries.
- [ ] `BUSINESS.md` — add Membership Streak to §16 Coming soon ("P1 dark infrastructure shipped; ladder 2/4/6/8/10/12 renewals → 100–600 free entries + Founding badge; P2/P3 pending").
- [ ] `CUSTOMER.md` — customer-model addition (streak fields; lifecycle interaction: pause freezes, recovery keeps, grace continues, lapse resets).

## Self-review notes

- Spec coverage: §2.1-2.3 (Tasks 1/4/5), §3 backfill (6/7), §4 fields (2), §5 write paths (3/4/5 — §5.4 refund decrement is deliberately deferred to P2 where the issuance ledger it depends on is built; noted in spec as P2 scope), §8 P1 tests (1/6/8), docs (9).
- Type consistency: `firstTimeSucceeded` (Task 3 → 4); `decideStreakOnSubscriptionCreate` signature identical in Tasks 1/5; walker signature identical in Tasks 6/7.
- No placeholders; every code step contains the code.
