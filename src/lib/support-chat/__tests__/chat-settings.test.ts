/**
 * chat-settings.test.ts
 *
 * Unit tests for src/lib/support-chat/chatSettings.ts.
 * All DB access is deps-injected — no real Mongo required.
 * CI-safe.
 *
 * Run: npm run test:chat-settings
 */

import assert from "node:assert/strict";
import {
  getActiveChatProvider,
  setActiveChatProvider,
} from "../chatSettings";
import type { ChatProvider } from "../chatSettings";

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

// ─── getActiveChatProvider ────────────────────────────────────────────────────

async function testGetActiveChatProvider() {
  console.log("\ngetActiveChatProvider");

  // 1. findOne returns null → default "anthropic"
  {
    const result = await getActiveChatProvider({
      findOne: async () => null,
    });
    expect(
      "findOne returns null → default 'anthropic'",
      result,
      "anthropic"
    );
  }

  // 2. findOne throws → fail-safe returns "anthropic"
  {
    const result = await getActiveChatProvider({
      findOne: async () => {
        throw new Error("DB unavailable");
      },
    });
    expect(
      "findOne throws → fail-safe returns 'anthropic'",
      result,
      "anthropic"
    );
  }

  // 3. findOne returns { activeProvider: "google" } → returns "google"
  {
    const result = await getActiveChatProvider({
      findOne: async () => ({ activeProvider: "google" as ChatProvider }),
    });
    expect(
      "findOne returns { activeProvider: 'google' } → 'google'",
      result,
      "google"
    );
  }

  // 4. findOne returns { activeProvider: "anthropic" } → returns "anthropic"
  {
    const result = await getActiveChatProvider({
      findOne: async () => ({ activeProvider: "anthropic" as ChatProvider }),
    });
    expect(
      "findOne returns { activeProvider: 'anthropic' } → 'anthropic'",
      result,
      "anthropic"
    );
  }
}

// ─── setActiveChatProvider ────────────────────────────────────────────────────

async function testSetActiveChatProvider() {
  console.log("\nsetActiveChatProvider");

  // 5. setActiveChatProvider("google", { upsert: stub }) → calls upsert with "google"
  {
    let upsertCalledWith: ChatProvider | undefined;
    await setActiveChatProvider("google", {
      upsert: async (provider) => {
        upsertCalledWith = provider;
      },
    });
    expect(
      "setActiveChatProvider('google') → upsert called with 'google'",
      upsertCalledWith,
      "google"
    );
  }

  // 6. setActiveChatProvider("anthropic", { upsert: stub }) → calls upsert with "anthropic"
  {
    let upsertCalledWith: ChatProvider | undefined;
    await setActiveChatProvider("anthropic", {
      upsert: async (provider) => {
        upsertCalledWith = provider;
      },
    });
    expect(
      "setActiveChatProvider('anthropic') → upsert called with 'anthropic'",
      upsertCalledWith,
      "anthropic"
    );
  }

  // 7. upsert stub is called exactly once
  {
    let upsertCallCount = 0;
    await setActiveChatProvider("google", {
      upsert: async () => {
        upsertCallCount++;
      },
    });
    expect(
      "setActiveChatProvider → upsert called exactly once",
      upsertCallCount,
      1
    );
  }
}

// ─── runner ───────────────────────────────────────────────────────────────────

async function run() {
  await testGetActiveChatProvider();
  await testSetActiveChatProvider();

  console.log(`\n${"─".repeat(60)}`);
  if (failures > 0) {
    console.error(`chat-settings tests FAILED — ${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("chat-settings tests passed");
  void expectTrue; // suppress "never used" warning
  process.exit(0);
}

void run().catch((err) => {
  console.error(err);
  process.exit(1);
});
