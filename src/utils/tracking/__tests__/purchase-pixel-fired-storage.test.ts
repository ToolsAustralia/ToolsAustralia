import assert from "node:assert/strict";
import { markPurchasePixelFired, shouldSuppressPurchasePixel } from "../purchase-pixel-fired-storage";

type FakeStorageOpts = { throwOnSet?: boolean };

const HOURS_MS = 60 * 60 * 1000;

function makeFakeStorage(opts: FakeStorageOpts = {}) {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      if (opts.throwOnSet) throw new Error("QuotaExceededError");
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
  return { map, storage };
}

function withWindow(storage: unknown, fn: () => void) {
  (globalThis as Record<string, unknown>).window = { localStorage: storage };
  try {
    fn();
  } finally {
    delete (globalThis as Record<string, unknown>).window;
  }
}

function testNoWindowIsSafe() {
  // Node has no window — both helpers must be inert, never throw.
  assert.equal(shouldSuppressPurchasePixel("pi_a"), false, "no window → never suppress");
  markPurchasePixelFired("pi_a"); // must not throw
}

function testFreshMarkDoesNotSuppress() {
  // Within Meta's ~48h event_id dedup window a re-fire is merged, NOT double-counted —
  // so it must stay allowed: it recovers a first fire that was silently swallowed
  // (ad blocker, tab closed before fbevents.js drained). Suppression exists only for
  // re-fires past the window, which Meta would count as brand-new conversions.
  const { map, storage } = makeFakeStorage();
  withWindow(storage, () => {
    assert.equal(shouldSuppressPurchasePixel("pi_x"), false, "unfired id → no suppress");
    markPurchasePixelFired("pi_x");
    assert.equal(shouldSuppressPurchasePixel("pi_x"), false, "fresh mark (inside dedup window) → re-fire still allowed");
  });
  assert.equal(map.size, 1, "exactly one key written");
  const [key] = Array.from(map.keys());
  assert.ok(key.startsWith("purchasePixelFired_"), `key is namespaced, got ${key}`);
}

function testOldMarkSuppresses() {
  const { map, storage } = makeFakeStorage();
  map.set("purchasePixelFired_pi_old", String(Date.now() - 47 * HOURS_MS));
  map.set("purchasePixelFired_pi_recent", String(Date.now() - 45 * HOURS_MS));
  withWindow(storage, () => {
    assert.equal(shouldSuppressPurchasePixel("pi_old"), true, "47h-old mark (past the 46h margin) → suppress");
    assert.equal(shouldSuppressPurchasePixel("pi_recent"), false, "45h-old mark (inside margin) → allow");
    assert.equal(shouldSuppressPurchasePixel("pi_other"), false, "unknown id → allow");
  });
}

function testUnparsableMarkSuppresses() {
  // Conservative: an owned key with a garbage value means "fired at an unknown time" —
  // suppress (the failure mode we are fixing is inflation, not under-count).
  const { map, storage } = makeFakeStorage();
  map.set("purchasePixelFired_pi_corrupt", "not-a-number");
  withWindow(storage, () => {
    assert.equal(shouldSuppressPurchasePixel("pi_corrupt"), true, "unparsable mark → suppress");
  });
}

function testMarkPreservesFirstFireTimestamp() {
  // Meta's dedup window anchors at the FIRST received event; refreshing the mark on
  // every re-fire would let the suppression window slide and re-open >48h double counts.
  const { map, storage } = makeFakeStorage();
  const original = String(Date.now() - 10 * HOURS_MS);
  map.set("purchasePixelFired_pi_x", original);
  withWindow(storage, () => {
    markPurchasePixelFired("pi_x");
    assert.equal(map.get("purchasePixelFired_pi_x"), original, "re-mark must NOT move the first-fire anchor");
  });
}

function testStorageThrowingIsSwallowed() {
  const { storage } = makeFakeStorage({ throwOnSet: true });
  withWindow(storage, () => {
    markPurchasePixelFired("pi_quota"); // Safari private mode — must not throw
    assert.equal(shouldSuppressPurchasePixel("pi_quota"), false, "nothing stored when setItem throws");
  });
}

function testPruneRemovesOldEntries() {
  const { map, storage } = makeFakeStorage();
  const THIRTY_ONE_DAYS_MS = 31 * 24 * HOURS_MS;
  map.set("purchasePixelFired_pi_old", String(Date.now() - THIRTY_ONE_DAYS_MS));
  map.set("purchasePixelFired_pi_recent", String(Date.now() - 1000));
  map.set("purchasePixelFired_pi_corrupt", "not-a-number");
  map.set("unrelatedKey", "keep-me");
  withWindow(storage, () => {
    markPurchasePixelFired("pi_new");
    assert.equal(map.has("purchasePixelFired_pi_old"), false, "31-day-old entry pruned");
    assert.equal(map.has("purchasePixelFired_pi_corrupt"), false, "unparsable entry pruned");
    assert.equal(map.has("purchasePixelFired_pi_recent"), true, "recent entry kept");
    assert.equal(map.get("unrelatedKey"), "keep-me", "non-namespaced keys untouched");
    assert.equal(map.has("purchasePixelFired_pi_new"), true, "new mark present after prune");
  });
}

function run() {
  testNoWindowIsSafe();
  testFreshMarkDoesNotSuppress();
  testOldMarkSuppresses();
  testUnparsableMarkSuppresses();
  testMarkPreservesFirstFireTimestamp();
  testStorageThrowingIsSwallowed();
  testPruneRemovesOldEntries();
  console.log("purchase pixel fired-guard tests passed");
}

try {
  run();
} catch (e) {
  console.error(e);
  process.exit(1);
}
