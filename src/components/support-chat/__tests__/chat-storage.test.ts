/**
 * chat-storage.test.ts
 *
 * Tests that clearSupportChatStorage() removes chat keys and leaves device-pref keys,
 * and that loadPersistedMessages / savePersistedMessages round-trip correctly.
 * Uses an in-memory localStorage stub — no jsdom needed.
 */

import {
  clearSupportChatStorage,
  CHAT_STORAGE_KEYS,
  loadPersistedMessages,
  savePersistedMessages,
} from "../../../lib/support-chat/chatStorage";
import type { UIMessage } from "ai";

// ── localStorage stub ────────────────────────────────────────────────────────
const store: Record<string, string> = {};

const localStorageStub = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => {
    store[key] = value;
  },
  removeItem: (key: string) => {
    delete store[key];
  },
  clear: () => {
    for (const k of Object.keys(store)) delete store[k];
  },
};

// Patch global window.localStorage for the test
Object.defineProperty(global, "window", {
  value: { localStorage: localStorageStub },
  writable: true,
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function seed(extra: Record<string, string> = {}) {
  localStorageStub.clear();
  for (const key of Object.values(CHAT_STORAGE_KEYS)) {
    store[key] = "test-value";
  }
  store["theme"] = "dark";
  store["topBarHidden"] = "1";
  Object.assign(store, extra);
}

function makeMessage(id: string, role: "user" | "assistant" = "user"): UIMessage {
  return {
    id,
    role,
    parts: [{ type: "text", text: `Message ${id}` }],
  };
}

function pass(label: string) {
  console.log(`✅ ${label}`);
}
function fail(label: string, detail?: unknown): never {
  console.error(`❌ ${label}`, detail);
  process.exit(1);
}

// ── clearSupportChatStorage tests ─────────────────────────────────────────────

seed();
clearSupportChatStorage();

// 1. Chat keys removed
for (const key of Object.values(CHAT_STORAGE_KEYS)) {
  if (store[key] !== undefined) fail(`Chat key still present after clear: ${key}`);
}
pass("All chat keys removed (including MESSAGES)");

// 2. Device-pref keys preserved
if (store["theme"] !== "dark") fail("theme key was removed — should be kept");
pass("theme key preserved");

if (store["topBarHidden"] !== "1")
  fail("topBarHidden key was removed — should be kept");
pass("topBarHidden key preserved");

// 3. Idempotent — second call must not throw
seed();
clearSupportChatStorage();
clearSupportChatStorage();
pass("Second clearSupportChatStorage() call is safe (idempotent)");

// 4. Fault-tolerant — a failing removeItem must not throw
{
  const faultyStore: Record<string, string> = {};
  const faultyLocalStorage = {
    ...localStorageStub,
    removeItem: (key: string) => {
      if (key === CHAT_STORAGE_KEYS.CONVERSATION_ID) {
        throw new Error("storage quota exceeded");
      }
      delete faultyStore[key];
    },
  };
  Object.defineProperty(global, "window", {
    value: { localStorage: faultyLocalStorage },
    writable: true,
  });
  try {
    clearSupportChatStorage(); // must not throw
    pass("Fault-tolerant: faulty removeItem does not throw");
  } catch (e) {
    fail("clearSupportChatStorage threw when removeItem failed", e);
  }
  // Restore
  Object.defineProperty(global, "window", {
    value: { localStorage: localStorageStub },
    writable: true,
  });
}

// ── savePersistedMessages / loadPersistedMessages tests ────────────────────────

// 5. Round-trip
{
  localStorageStub.clear();
  const messages: UIMessage[] = [
    makeMessage("1", "user"),
    makeMessage("2", "assistant"),
    makeMessage("3", "user"),
  ];
  savePersistedMessages(messages);
  const loaded = loadPersistedMessages();
  if (loaded.length !== messages.length)
    fail(`Round-trip length mismatch: expected ${messages.length}, got ${loaded.length}`);
  for (let i = 0; i < messages.length; i++) {
    if (loaded[i]?.id !== messages[i]?.id)
      fail(`Round-trip id mismatch at index ${i}: expected ${messages[i]?.id}, got ${loaded[i]?.id}`);
  }
  pass("savePersistedMessages → loadPersistedMessages round-trip");
}

// 6. 50-message cap: save 60 messages → load returns last 50
{
  localStorageStub.clear();
  const messages60: UIMessage[] = Array.from({ length: 60 }, (_, i) =>
    makeMessage(String(i + 1))
  );
  savePersistedMessages(messages60);
  const loaded = loadPersistedMessages();
  if (loaded.length !== 50)
    fail(`Cap not enforced: expected 50 messages, got ${loaded.length}`);
  // First loaded message should be index 10 (id "11")
  if (loaded[0]?.id !== "11")
    fail(`Cap kept wrong messages: expected first id "11", got "${loaded[0]?.id}"`);
  // Last loaded message should be index 59 (id "60")
  if (loaded[49]?.id !== "60")
    fail(`Cap kept wrong messages: expected last id "60", got "${loaded[49]?.id}"`);
  pass("50-message cap enforced (save 60 → load returns last 50)");
}

// 7. Parse failure returns []
{
  localStorageStub.clear();
  store[CHAT_STORAGE_KEYS.MESSAGES] = "NOT_VALID_JSON{{";
  const loaded = loadPersistedMessages();
  if (!Array.isArray(loaded) || loaded.length !== 0)
    fail(`Parse failure should return [], got: ${JSON.stringify(loaded)}`);
  pass("Parse failure returns []");
}

// 8. Empty storage returns []
{
  localStorageStub.clear();
  const loaded = loadPersistedMessages();
  if (!Array.isArray(loaded) || loaded.length !== 0)
    fail(`Empty storage should return [], got: ${JSON.stringify(loaded)}`);
  pass("Empty storage returns []");
}

// 9. Non-array JSON returns []
{
  localStorageStub.clear();
  store[CHAT_STORAGE_KEYS.MESSAGES] = JSON.stringify({ not: "an array" });
  const loaded = loadPersistedMessages();
  if (!Array.isArray(loaded) || loaded.length !== 0)
    fail(`Non-array JSON should return [], got: ${JSON.stringify(loaded)}`);
  pass("Non-array JSON returns []");
}

// 10. MESSAGES key included in clearSupportChatStorage()
{
  localStorageStub.clear();
  const msgs: UIMessage[] = [makeMessage("x")];
  savePersistedMessages(msgs);
  if (!store[CHAT_STORAGE_KEYS.MESSAGES])
    fail("MESSAGES key not set before clear");
  clearSupportChatStorage();
  if (store[CHAT_STORAGE_KEYS.MESSAGES] !== undefined)
    fail("MESSAGES key still present after clearSupportChatStorage()");
  pass("MESSAGES key cleared by clearSupportChatStorage()");
}

console.log("\n✅ All chat-storage tests passed");
