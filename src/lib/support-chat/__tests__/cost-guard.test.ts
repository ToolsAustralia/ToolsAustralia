/**
 * cost-guard.test.ts
 *
 * Unit tests for src/lib/support-chat/costGuard.ts.
 * No live DB — all async paths use injected stubs.
 *
 * Run: npm run test:chat-cost-guard
 */

import assert from "node:assert/strict";

import {
  estimateCostUsd,
  evaluateBudget,
  assertWithinBudget,
  recordUsage,
  utcDayKey,
} from "../costGuard";

// ─── helpers ─────────────────────────────────────────────────────────────────

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

let failures = 0;

function expect(label: string, actual: unknown, expected: unknown): void {
  try {
    assert.deepStrictEqual(actual, expected);
    console.log(`  PASS  ${label}`);
  } catch {
    failures++;
    console.error(
      `  FAIL  ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`
    );
  }
}

// ─── estimateCostUsd ─────────────────────────────────────────────────────────

function testEstimateCostUsd() {
  console.log("\nestimateCostUsd");

  // haiku: 1M input × $1.00/M + 0 output = $1.00
  expect(
    "haiku 1M input, 0 output → $1.00",
    estimateCostUsd("claude-haiku-4-5", 1_000_000, 0),
    1.0
  );

  // haiku: 0 input + 1M output × $5.00/M = $5.00
  expect(
    "haiku 0 input, 1M output → $5.00",
    estimateCostUsd("claude-haiku-4-5", 0, 1_000_000),
    5.0
  );

  // sonnet: 0 input + 1M output × $15.00/M = $15.00
  expect(
    "sonnet 0 input, 1M output → $15.00",
    estimateCostUsd("claude-sonnet-4-6", 0, 1_000_000),
    15.0
  );

  // sonnet: 1M input × $3.00/M + 0 output = $3.00
  expect(
    "sonnet 1M input, 0 output → $3.00",
    estimateCostUsd("claude-sonnet-4-6", 1_000_000, 0),
    3.0
  );

  // opus: 1M input × $5.00/M + 1M output × $25.00/M = $30.00
  expect(
    "opus 1M in + 1M out → $30.00",
    estimateCostUsd("claude-opus-4-8", 1_000_000, 1_000_000),
    30.0
  );

  // unknown model falls back to opus rates (fail-expensive):
  //   1M input × $5.00/M = $5.00
  expect(
    "unknown model 1M input, 0 output → opus rate $5.00",
    estimateCostUsd("some-future-model", 1_000_000, 0),
    5.0
  );

  // unknown model: 0 input + 1M output × $25.00/M = $25.00
  expect(
    "unknown model 0 input, 1M output → opus rate $25.00",
    estimateCostUsd("some-future-model", 0, 1_000_000),
    25.0
  );

  // fractional: 500k input with haiku = $0.50
  expect(
    "haiku 500k input, 0 output → $0.50",
    estimateCostUsd("claude-haiku-4-5", 500_000, 0),
    0.5
  );

  // ── Gemini prices ──────────────────────────────────────────────────────────

  // gemini-2.5-flash-lite: 1M input × $0.10/M = $0.10
  expect(
    "gemini-2.5-flash-lite 1M input, 0 output → $0.10",
    estimateCostUsd("gemini-2.5-flash-lite", 1_000_000, 0),
    0.10
  );

  // gemini-2.5-flash-lite: 0 input + 1M output × $0.40/M = $0.40
  expect(
    "gemini-2.5-flash-lite 0 input, 1M output → $0.40",
    estimateCostUsd("gemini-2.5-flash-lite", 0, 1_000_000),
    0.40
  );

  // gemini-2.5-flash: 1M input × $0.30/M = $0.30
  expect(
    "gemini-2.5-flash 1M input, 0 output → $0.30",
    estimateCostUsd("gemini-2.5-flash", 1_000_000, 0),
    0.30
  );

  // gemini-2.5-flash: 0 input + 1M output × $2.50/M = $2.50
  expect(
    "gemini-2.5-flash 0 input, 1M output → $2.50",
    estimateCostUsd("gemini-2.5-flash", 0, 1_000_000),
    2.50
  );
}

// ─── evaluateBudget ──────────────────────────────────────────────────────────

function testEvaluateBudget() {
  console.log("\nevaluateBudget");

  // Under budget, no kill-switch → ok
  expect(
    "under budget → ok:true",
    evaluateBudget({ killSwitch: false, spentUsd: 2.5, budgetUsd: 5.0 }),
    { ok: true }
  );

  // At zero spend → ok
  expect(
    "zero spend → ok:true",
    evaluateBudget({ killSwitch: false, spentUsd: 0, budgetUsd: 5.0 }),
    { ok: true }
  );

  // Kill-switch on → blocked, regardless of spend
  expect(
    "kill-switch on → reason kill_switch",
    evaluateBudget({ killSwitch: true, spentUsd: 0, budgetUsd: 5.0 }),
    { ok: false, reason: "kill_switch" }
  );

  // Kill-switch wins even when also over budget
  expect(
    "kill-switch on + over budget → reason kill_switch (kill-switch wins)",
    evaluateBudget({ killSwitch: true, spentUsd: 10, budgetUsd: 5.0 }),
    { ok: false, reason: "kill_switch" }
  );

  // Exactly at budget → blocked
  expect(
    "spentUsd == budgetUsd → reason daily_budget",
    evaluateBudget({ killSwitch: false, spentUsd: 5.0, budgetUsd: 5.0 }),
    { ok: false, reason: "daily_budget" }
  );

  // Over budget → blocked
  expect(
    "spentUsd > budgetUsd → reason daily_budget",
    evaluateBudget({ killSwitch: false, spentUsd: 6.0, budgetUsd: 5.0 }),
    { ok: false, reason: "daily_budget" }
  );
}

// ─── utcDayKey ───────────────────────────────────────────────────────────────

function testUtcDayKey() {
  console.log("\nutcDayKey");

  const fixed = new Date("2026-06-24T15:30:00.000Z");
  expect("fixed UTC date → YYYY-MM-DD string", utcDayKey(fixed), "2026-06-24");

  // Midnight boundary: 2026-01-01T00:00:00Z
  expect(
    "UTC midnight boundary → correct date",
    utcDayKey(new Date("2026-01-01T00:00:00.000Z")),
    "2026-01-01"
  );

  // End of day: 2026-12-31T23:59:59Z
  expect(
    "UTC end-of-day → correct date",
    utcDayKey(new Date("2026-12-31T23:59:59.000Z")),
    "2026-12-31"
  );

  // Single-digit month/day padding
  expect(
    "single-digit month and day are zero-padded",
    utcDayKey(new Date("2026-03-07T10:00:00.000Z")),
    "2026-03-07"
  );

  // Format check: must match YYYY-MM-DD
  const key = utcDayKey(new Date("2026-06-24T00:00:00.000Z"));
  expect(
    "format is YYYY-MM-DD (length 10)",
    key.length,
    10
  );
  expect(
    "format has dashes at positions 4 and 7",
    key[4] === "-" && key[7] === "-",
    true
  );
}

// ─── assertWithinBudget (injected stubs — no live DB) ────────────────────────

async function testAssertWithinBudget() {
  console.log("\nassertWithinBudget");

  const savedKillSwitch = process.env.CHAT_KILL_SWITCH;
  const savedBudget = process.env.CHAT_DAILY_TOKEN_BUDGET_USD;

  try {
    // Under budget → ok
    setEnv({ CHAT_KILL_SWITCH: undefined, CHAT_DAILY_TOKEN_BUDGET_USD: "5" });
    const r1 = await assertWithinBudget({
      readSpendUsd: async () => 2.5,
    });
    expect("under budget → ok:true", r1, { ok: true });

    // Over budget → daily_budget
    setEnv({ CHAT_KILL_SWITCH: undefined, CHAT_DAILY_TOKEN_BUDGET_USD: "5" });
    const r2 = await assertWithinBudget({
      readSpendUsd: async () => 6.0,
    });
    expect("over budget → reason daily_budget", r2, {
      ok: false,
      reason: "daily_budget",
    });

    // Exactly at budget → daily_budget
    setEnv({ CHAT_KILL_SWITCH: undefined, CHAT_DAILY_TOKEN_BUDGET_USD: "5" });
    const r3 = await assertWithinBudget({
      readSpendUsd: async () => 5.0,
    });
    expect("at budget → reason daily_budget", r3, {
      ok: false,
      reason: "daily_budget",
    });

    // Kill-switch via env → kill_switch (even at $0 spend)
    setEnv({ CHAT_KILL_SWITCH: "true", CHAT_DAILY_TOKEN_BUDGET_USD: "5" });
    const r4 = await assertWithinBudget({
      readSpendUsd: async () => 0,
    });
    expect("CHAT_KILL_SWITCH=true → reason kill_switch", r4, {
      ok: false,
      reason: "kill_switch",
    });

    // Kill-switch with 'TRUE' (uppercase) variant
    setEnv({ CHAT_KILL_SWITCH: "TRUE", CHAT_DAILY_TOKEN_BUDGET_USD: "5" });
    const r5 = await assertWithinBudget({
      readSpendUsd: async () => 0,
    });
    expect("CHAT_KILL_SWITCH=TRUE → reason kill_switch", r5, {
      ok: false,
      reason: "kill_switch",
    });

    // Kill-switch off (explicit 'false') → not triggered
    setEnv({ CHAT_KILL_SWITCH: "false", CHAT_DAILY_TOKEN_BUDGET_USD: "5" });
    const r6 = await assertWithinBudget({
      readSpendUsd: async () => 0,
    });
    expect("CHAT_KILL_SWITCH=false → ok:true", r6, { ok: true });

    // readSpendUsd throws → fail closed: reason 'error'
    setEnv({ CHAT_KILL_SWITCH: undefined, CHAT_DAILY_TOKEN_BUDGET_USD: "5" });
    const r7 = await assertWithinBudget({
      readSpendUsd: async () => {
        throw new Error("DB unavailable");
      },
    });
    expect("readSpendUsd throws → reason error (fail-closed)", r7, {
      ok: false,
      reason: "error",
    });

    // Default budget is 5 when env var missing
    setEnv({
      CHAT_KILL_SWITCH: undefined,
      CHAT_DAILY_TOKEN_BUDGET_USD: undefined,
    });
    const r8 = await assertWithinBudget({
      readSpendUsd: async () => 4.99,
    });
    expect("no budget env var → default $5, under budget → ok:true", r8, {
      ok: true,
    });

    const r9 = await assertWithinBudget({
      readSpendUsd: async () => 5.0,
    });
    expect(
      "no budget env var → default $5, at $5 spend → daily_budget",
      r9,
      { ok: false, reason: "daily_budget" }
    );

    // NaN guard: non-numeric budget env var falls back to $5 default
    setEnv({ CHAT_KILL_SWITCH: undefined, CHAT_DAILY_TOKEN_BUDGET_USD: "abc" });
    const rNaN = await assertWithinBudget({
      readSpendUsd: async () => 5.01, // over the default $5 fallback
    });
    expect(
      "CHAT_DAILY_TOKEN_BUDGET_USD=abc → falls back to $5 default → over budget → daily_budget",
      rNaN,
      { ok: false, reason: "daily_budget" }
    );

    // now() injection: ensure utcDayKey is called with the injected time
    // (we can't inspect the dayKey passed to readSpendUsd without a spy, but
    // we can confirm the gate still runs correctly with a custom now)
    setEnv({ CHAT_KILL_SWITCH: undefined, CHAT_DAILY_TOKEN_BUDGET_USD: "5" });
    const r10 = await assertWithinBudget({
      readSpendUsd: async () => 1.0,
      now: () => new Date("2026-06-24T23:59:59.000Z"),
    });
    expect("custom now() injection → ok:true", r10, { ok: true });
  } finally {
    setEnv({
      CHAT_KILL_SWITCH: savedKillSwitch,
      CHAT_DAILY_TOKEN_BUDGET_USD: savedBudget,
    });
  }
}

// ─── recordUsage (injected stub — no live DB) ────────────────────────────────

async function testRecordUsage() {
  console.log("\nrecordUsage");

  // Capture what was passed to incrementSpend
  type Call = {
    dayKey: string;
    spentUsd: number;
    tokensIn: number;
    tokensOut: number;
  };

  let calls: Call[] = [];
  const stub = async (
    dayKey: string,
    spentUsd: number,
    tokensIn: number,
    tokensOut: number
  ) => {
    calls.push({ dayKey, spentUsd, tokensIn, tokensOut });
  };

  // haiku 1M in, 0 out → cost $1.00
  calls = [];
  await recordUsage("claude-haiku-4-5", 1_000_000, 0, {
    incrementSpend: stub,
    now: () => new Date("2026-06-24T12:00:00.000Z"),
  });
  expect("recordUsage calls incrementSpend once", calls.length, 1);
  expect("recordUsage passes correct dayKey", calls[0].dayKey, "2026-06-24");
  expect("recordUsage passes correct spentUsd", calls[0].spentUsd, 1.0);
  expect("recordUsage passes correct tokensIn", calls[0].tokensIn, 1_000_000);
  expect("recordUsage passes correct tokensOut", calls[0].tokensOut, 0);

  // sonnet 0 in, 200k out → $15 * 0.2 = $3.00
  calls = [];
  await recordUsage("claude-sonnet-4-6", 0, 200_000, {
    incrementSpend: stub,
    now: () => new Date("2026-06-24T12:00:00.000Z"),
  });
  expect("sonnet 200k output cost = $3.00", calls[0].spentUsd, 3.0);

  // Best-effort: incrementSpend throwing must NOT propagate (recordUsage swallows)
  let threw = false;
  try {
    await recordUsage("claude-haiku-4-5", 100, 100, {
      incrementSpend: async () => {
        throw new Error("DB write failed");
      },
    });
  } catch {
    threw = true;
  }
  expect("recordUsage swallows incrementSpend errors (best-effort)", threw, false);
}

// ─── runner ──────────────────────────────────────────────────────────────────

async function run() {
  testEstimateCostUsd();
  testEvaluateBudget();
  testUtcDayKey();
  await testAssertWithinBudget();
  await testRecordUsage();

  console.log(`\n${"─".repeat(60)}`);
  if (failures > 0) {
    console.error(`cost-guard tests FAILED — ${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("cost-guard tests passed");
  process.exit(0);
}

void run().catch((err) => {
  console.error(err);
  process.exit(1);
});
