/**
 * provider.test.ts
 *
 * Unit tests for src/lib/support-chat/provider.ts.
 * NO live API calls — all model construction is stubbed.
 * No ANTHROPIC_API_KEY required; CI-safe.
 *
 * Run: npm run test:chat-provider
 */

import assert from "node:assert/strict";

import {
  getChatModel,
  isFallbackEligibleError,
  withModelFallback,
} from "../provider";
import { APICallError } from "@ai-sdk/provider";
import type { LanguageModel } from "ai";

// ─── helpers ─────────────────────────────────────────────────────────────────

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

function expectTrue(label: string, value: boolean): void {
  expect(label, value, true);
}

function expectFalse(label: string, value: boolean): void {
  expect(label, value, false);
}

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

/**
 * Builds a minimal fake LanguageModel with an identifiable modelId field.
 * The real @ai-sdk/anthropic model object exposes `modelId` on its
 * LanguageModelV3 shape. We fake just enough shape for testing.
 */
function makeStubModel(
  id: string
): LanguageModel & { modelId: string; specificationVersion: string } {
  return {
    specificationVersion: "v3",
    modelId: id,
    provider: "test",
    defaultObjectGenerationMode: undefined,
  } as unknown as LanguageModel & { modelId: string; specificationVersion: string };
}

/**
 * Build a fake APICallError with a given statusCode.
 * We use the constructor directly (the class is exported from @ai-sdk/provider).
 */
function makeApiCallError(statusCode: number, message: string): APICallError {
  return new APICallError({
    message,
    url: "https://api.anthropic.com/v1/messages",
    requestBodyValues: {},
    statusCode,
    isRetryable: statusCode >= 500,
  });
}

// ─── getChatModel ─────────────────────────────────────────────────────────────

function testGetChatModel() {
  console.log("\ngetChatModel");

  const savedPrimary = process.env.CHAT_MODEL_PRIMARY;
  const savedEscalation = process.env.CHAT_MODEL_ESCALATION;

  try {
    // Default IDs when env vars are unset
    setEnv({
      CHAT_MODEL_PRIMARY: undefined,
      CHAT_MODEL_ESCALATION: undefined,
    });

    const primaryDefault = getChatModel("primary");
    const escalationDefault = getChatModel("escalation");

    // @ai-sdk/anthropic exposes modelId on the returned object
    const primaryId = (primaryDefault as { modelId?: string }).modelId;
    const escalationId = (escalationDefault as { modelId?: string }).modelId;

    expect("default primary modelId is claude-haiku-4-5", primaryId, "claude-haiku-4-5");
    expect("default escalation modelId is claude-sonnet-4-6", escalationId, "claude-sonnet-4-6");

    // Custom model IDs via env
    setEnv({
      CHAT_MODEL_PRIMARY: "claude-haiku-4-5-20251001",
      CHAT_MODEL_ESCALATION: "claude-sonnet-4-6",
    });

    const primaryCustom = getChatModel("primary");
    const escalationCustom = getChatModel("escalation");

    const primaryCustomId = (primaryCustom as { modelId?: string }).modelId;
    const escalationCustomId = (escalationCustom as { modelId?: string }).modelId;

    expect(
      "custom CHAT_MODEL_PRIMARY is respected",
      primaryCustomId,
      "claude-haiku-4-5-20251001"
    );
    expect(
      "custom CHAT_MODEL_ESCALATION is respected",
      escalationCustomId,
      "claude-sonnet-4-6"
    );
  } finally {
    setEnv({
      CHAT_MODEL_PRIMARY: savedPrimary,
      CHAT_MODEL_ESCALATION: savedEscalation,
    });
  }
}

// ─── isFallbackEligibleError ──────────────────────────────────────────────────

function testIsFallbackEligibleError() {
  console.log("\nisFallbackEligibleError");

  // 429 rate-limit → eligible
  expectTrue(
    "APICallError 429 → eligible",
    isFallbackEligibleError(makeApiCallError(429, "rate limit exceeded"))
  );

  // 529 overloaded → eligible
  expectTrue(
    "APICallError 529 → eligible",
    isFallbackEligibleError(makeApiCallError(529, "overloaded"))
  );

  // APICallError with 'overloaded' in message (even non-529 status)
  expectTrue(
    "APICallError with 'overloaded' in message → eligible",
    isFallbackEligibleError(
      makeApiCallError(503, "Anthropic API is currently overloaded")
    )
  );

  // Plain Error with 'overloaded' in message
  expectTrue(
    "plain Error 'overloaded' → eligible",
    isFallbackEligibleError(new Error("Service overloaded, try again"))
  );

  // Plain Error with 'refusal' in message (stop_reason: "refusal" surfaced as error)
  expectTrue(
    "plain Error 'refusal' → eligible",
    isFallbackEligibleError(new Error("Request ended with refusal"))
  );

  // 400 bad request → NOT eligible
  expectFalse(
    "APICallError 400 → NOT eligible",
    isFallbackEligibleError(makeApiCallError(400, "invalid_request_error"))
  );

  // 401 auth → NOT eligible
  expectFalse(
    "APICallError 401 → NOT eligible",
    isFallbackEligibleError(makeApiCallError(401, "authentication_error"))
  );

  // 403 forbidden → NOT eligible
  expectFalse(
    "APICallError 403 → NOT eligible",
    isFallbackEligibleError(makeApiCallError(403, "permission_error"))
  );

  // Generic Error (no overloaded/refusal) → NOT eligible
  expectFalse(
    "generic Error (no keyword) → NOT eligible",
    isFallbackEligibleError(new Error("Something went wrong"))
  );

  // Non-Error thrown → NOT eligible
  expectFalse(
    "string thrown → NOT eligible",
    isFallbackEligibleError("some string error")
  );

  // null thrown → NOT eligible
  expectFalse("null → NOT eligible", isFallbackEligibleError(null));
}

// ─── withModelFallback ────────────────────────────────────────────────────────

async function testWithModelFallback() {
  console.log("\nwithModelFallback");

  const stubPrimary = makeStubModel("stub-primary");
  const stubEscalation = makeStubModel("stub-escalation");

  const stubGetModel: (tier: "primary" | "escalation") => LanguageModel = (
    tier
  ) => (tier === "primary" ? stubPrimary : stubEscalation);

  // 1. Happy path: fn succeeds on primary → result returned, escalation not called
  {
    let calledWith: Array<{ modelId: string; tier: string }> = [];
    const result = await withModelFallback(
      async (model, tier) => {
        calledWith.push({ modelId: (model as { modelId: string }).modelId, tier });
        return "primary-result";
      },
      { getModel: stubGetModel }
    );
    expect("happy path returns primary result", result, "primary-result");
    expect("happy path calls fn once", calledWith.length, 1);
    expect("happy path calls with primary tier", calledWith[0].tier, "primary");
  }

  // 2. Fallback-eligible error on primary → retried on escalation
  {
    let calledWith: Array<{ modelId: string; tier: string }> = [];
    const err429 = makeApiCallError(429, "rate limit");

    const result = await withModelFallback(
      async (model, tier) => {
        calledWith.push({ modelId: (model as { modelId: string }).modelId, tier });
        if (tier === "primary") throw err429;
        return "escalation-result";
      },
      { getModel: stubGetModel }
    );

    expect("fallback returns escalation result", result, "escalation-result");
    expect("fallback calls fn twice", calledWith.length, 2);
    expect("first call is primary", calledWith[0].tier, "primary");
    expect("second call is escalation", calledWith[1].tier, "escalation");
    expect(
      "second call uses escalation model",
      calledWith[1].modelId,
      "stub-escalation"
    );
  }

  // 3. Fallback-eligible (529) on primary → retried on escalation
  {
    const err529 = makeApiCallError(529, "overloaded");
    let secondCallTier = "";

    const result = await withModelFallback(
      async (model, tier) => {
        if (tier === "primary") throw err529;
        secondCallTier = tier;
        return "escalation-ok";
      },
      { getModel: stubGetModel }
    );

    expect("529 escalates correctly", result, "escalation-ok");
    expect("529 escalation tier label is 'escalation'", secondCallTier, "escalation");
  }

  // 4. Non-eligible error (400) → NOT retried; error is rethrown
  {
    const err400 = makeApiCallError(400, "invalid_request_error");
    let callCount = 0;
    let caught: unknown = null;

    try {
      await withModelFallback(
        async (_model, _tier) => {
          callCount++;
          throw err400;
        },
        { getModel: stubGetModel }
      );
    } catch (e) {
      caught = e;
    }

    expect("400 is NOT retried (called only once)", callCount, 1);
    expectTrue("400 is rethrown", caught === err400);
  }

  // 5. Non-eligible plain Error → NOT retried
  {
    const plainErr = new Error("Something completely unexpected");
    let callCount = 0;
    let caught: unknown = null;

    try {
      await withModelFallback(
        async (_model, _tier) => {
          callCount++;
          throw plainErr;
        },
        { getModel: stubGetModel }
      );
    } catch (e) {
      caught = e;
    }

    expect("non-eligible plain Error is NOT retried", callCount, 1);
    expectTrue("non-eligible plain Error is rethrown", caught === plainErr);
  }

  // 6. Escalation also throws → that error propagates to caller
  {
    const err429 = makeApiCallError(429, "rate limit");
    const escalationErr = new Error("escalation also failed");
    let caught: unknown = null;

    try {
      await withModelFallback(
        async (_model, tier) => {
          if (tier === "primary") throw err429;
          throw escalationErr;
        },
        { getModel: stubGetModel }
      );
    } catch (e) {
      caught = e;
    }

    expectTrue(
      "when escalation also throws, the escalation error propagates",
      caught === escalationErr
    );
  }
}

// ─── runner ───────────────────────────────────────────────────────────────────

async function run() {
  testGetChatModel();
  testIsFallbackEligibleError();
  await testWithModelFallback();

  console.log(`\n${"─".repeat(60)}`);
  if (failures > 0) {
    console.error(`provider tests FAILED — ${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("provider tests passed");
  process.exit(0);
}

void run().catch((err) => {
  console.error(err);
  process.exit(1);
});
