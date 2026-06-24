/**
 * chat-storage.test.ts
 *
 * Tests that clearSupportChatStorage() removes chat keys and leaves device-pref keys.
 * Uses an in-memory localStorage stub — no jsdom needed.
 */

import { clearSupportChatStorage, CHAT_STORAGE_KEYS } from "../../../lib/support-chat/chatStorage";

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

function pass(label: string) {
  console.log(`✅ ${label}`);
}
function fail(label: string, detail?: unknown): never {
  console.error(`❌ ${label}`, detail);
  process.exit(1);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

seed();
clearSupportChatStorage();

// 1. Chat keys removed
for (const key of Object.values(CHAT_STORAGE_KEYS)) {
  if (store[key] !== undefined) fail(`Chat key still present after clear: ${key}`);
}
pass("All chat keys removed");

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

console.log("\n✅ All chat-storage tests passed");
