import assert from "node:assert/strict";
import { reconcilePersistedAttribution } from "../reconcilePersistedAttribution";

// The leak we are fixing: edge-only resolution returned `direct` (no paid click, no
// owned-channel COOKIE), but the user's Klaviyo touch is in the persisted signup UTM.
// Reconcile must recover klaviyo_email rather than leave it buried in `direct`.
assert.deepEqual(
  reconcilePersistedAttribution({
    edgePlatform: "direct",
    edgeConfidence: "utm_only",
    persistedUtmSource: "Klaviyo", // capital K — normalizeUtmToPlatform lowercases
    persistedUtmMedium: "email",
  }),
  { platform: "klaviyo_email", confidence: "utm_only" }
);

assert.deepEqual(
  reconcilePersistedAttribution({
    edgePlatform: "direct",
    edgeConfidence: "utm_only",
    persistedUtmSource: "klaviyo",
    persistedUtmMedium: "sms",
  }),
  { platform: "klaviyo_sms", confidence: "utm_only" }
);

// A real paid click already won at the edge → keep it (tier 1 > owned channel).
assert.deepEqual(
  reconcilePersistedAttribution({
    edgePlatform: "meta",
    edgeConfidence: "click",
    persistedUtmSource: "klaviyo",
    persistedUtmMedium: "email",
  }),
  { platform: "meta", confidence: "click" }
);

// Edge `direct` + a PAID persisted UTM (no click) → stay `direct`. A real paid click
// in-window would already have won at the edge, so we do NOT resurrect a stale paid UTM.
assert.deepEqual(
  reconcilePersistedAttribution({
    edgePlatform: "direct",
    edgeConfidence: "utm_only",
    persistedUtmSource: "facebook",
    persistedUtmMedium: "cpc",
  }),
  { platform: "direct", confidence: "utm_only" }
);

// Edge `direct` + no persisted UTM → stay `direct`.
assert.deepEqual(
  reconcilePersistedAttribution({
    edgePlatform: "direct",
    edgeConfidence: "utm_only",
  }),
  { platform: "direct", confidence: "utm_only" }
);

// No edge decision at all (route stamped no metadata) → preserve the prior UTM fallback:
// any recognised persisted UTM wins, including paid-via-UTM.
assert.deepEqual(
  reconcilePersistedAttribution({
    edgePlatform: null,
    edgeConfidence: null,
    persistedUtmSource: "facebook",
    persistedUtmMedium: "paid",
  }),
  { platform: "meta", confidence: "utm_only" }
);

assert.deepEqual(
  reconcilePersistedAttribution({
    edgePlatform: null,
    edgeConfidence: null,
    persistedUtmSource: "klaviyo",
    persistedUtmMedium: "email",
  }),
  { platform: "klaviyo_email", confidence: "utm_only" }
);

assert.deepEqual(
  reconcilePersistedAttribution({ edgePlatform: null, edgeConfidence: null }),
  { platform: "direct", confidence: "utm_only" }
);

// Edge owned-channel cookie last-touch is a positive signal → trust it unchanged.
assert.deepEqual(
  reconcilePersistedAttribution({
    edgePlatform: "klaviyo_email",
    edgeConfidence: "utm_only",
    persistedUtmSource: "facebook",
    persistedUtmMedium: "cpc",
  }),
  { platform: "klaviyo_email", confidence: "utm_only" }
);

// ---- Recency window ----
const NOW = 1_800_000_000_000; // fixed epoch ms for deterministic windowing
const DAY = 24 * 60 * 60 * 1000;

// Within the 5-day Klaviyo window → recovered.
assert.deepEqual(
  reconcilePersistedAttribution({
    edgePlatform: "direct",
    edgeConfidence: "utm_only",
    persistedUtmSource: "klaviyo",
    persistedUtmMedium: "email",
    persistedTouchAt: NOW - 2 * DAY,
    now: NOW,
  }),
  { platform: "klaviyo_email", confidence: "utm_only" }
);

// Outside the 5-day window (stale signup) → falls back to direct. This is the truthful case:
// "joined via Klaviyo months ago, no recent click → direct".
assert.deepEqual(
  reconcilePersistedAttribution({
    edgePlatform: "direct",
    edgeConfidence: "utm_only",
    persistedUtmSource: "klaviyo",
    persistedUtmMedium: "email",
    persistedTouchAt: NOW - 60 * DAY,
    now: NOW,
  }),
  { platform: "direct", confidence: "utm_only" }
);

// Exactly at the 5-day boundary → still within.
assert.deepEqual(
  reconcilePersistedAttribution({
    edgePlatform: "direct",
    edgeConfidence: "utm_only",
    persistedUtmSource: "klaviyo",
    persistedUtmMedium: "sms",
    persistedTouchAt: NOW - 5 * DAY,
    now: NOW,
  }),
  { platform: "klaviyo_sms", confidence: "utm_only" }
);

// Session-sourced touch (touchAt === now) is always in-window.
assert.deepEqual(
  reconcilePersistedAttribution({
    edgePlatform: "direct",
    edgeConfidence: "utm_only",
    persistedUtmSource: "klaviyo",
    persistedUtmMedium: "email",
    persistedTouchAt: NOW,
    now: NOW,
  }),
  { platform: "klaviyo_email", confidence: "utm_only" }
);

// Window enabled (now provided) but touchAt unknown → credited rather than buried.
assert.deepEqual(
  reconcilePersistedAttribution({
    edgePlatform: "direct",
    edgeConfidence: "utm_only",
    persistedUtmSource: "klaviyo",
    persistedUtmMedium: "email",
    persistedTouchAt: null,
    now: NOW,
  }),
  { platform: "klaviyo_email", confidence: "utm_only" }
);

// Future touchAt (clock skew / bad data) is treated as out-of-window → direct (age < 0).
assert.deepEqual(
  reconcilePersistedAttribution({
    edgePlatform: "direct",
    edgeConfidence: "utm_only",
    persistedUtmSource: "klaviyo",
    persistedUtmMedium: "email",
    persistedTouchAt: NOW + 3 * DAY,
    now: NOW,
  }),
  { platform: "direct", confidence: "utm_only" }
);

// Legacy (no `now`) → windowing disabled, behaves as before (always recovers).
assert.deepEqual(
  reconcilePersistedAttribution({
    edgePlatform: "direct",
    edgeConfidence: "utm_only",
    persistedUtmSource: "klaviyo",
    persistedUtmMedium: "email",
    persistedTouchAt: NOW - 365 * DAY,
  }),
  { platform: "klaviyo_email", confidence: "utm_only" }
);

console.log("reconcilePersistedAttribution: all assertions passed");
