import assert from "node:assert/strict";
import {
  buildPurchaseEvent,
  eventTimeNow,
  normalizeEpochToUnixSeconds,
  resolveEventTime,
} from "../canonical-event";

/** Compare against "now" with slack so a slow test run can't flake. */
function assertIsNow(actual: number, label: string) {
  assert.ok(Math.abs(actual - eventTimeNow()) <= 2, `${label}: expected ~now, got ${actual}`);
}

function testNormalizeSecondsPassThrough() {
  const s = 1_751_896_800;
  assert.equal(normalizeEpochToUnixSeconds(s), s, "unix seconds pass through unchanged");
  assert.equal(normalizeEpochToUnixSeconds(s + 0.9), s, "fractional seconds are floored");
}

function testNormalizeMillisecondsDetected() {
  // The webhook handlers store paymentMetadata.created in MILLISECONDS
  // (e.g. paymentIntent.created * 1000). Sending that raw as event_time would
  // read as year ~57k and Meta rejects the whole /events request.
  assert.equal(normalizeEpochToUnixSeconds(1_751_896_800_123), 1_751_896_800, "ms epoch converts to seconds");
}

function testNormalizeGarbage() {
  assert.equal(normalizeEpochToUnixSeconds(undefined), undefined, "undefined stays undefined");
  assert.equal(normalizeEpochToUnixSeconds(Number.NaN), undefined, "NaN rejected");
  assert.equal(normalizeEpochToUnixSeconds(0), undefined, "zero rejected");
  assert.equal(normalizeEpochToUnixSeconds(-5), undefined, "negative rejected");
  assert.equal(normalizeEpochToUnixSeconds(Number.POSITIVE_INFINITY), undefined, "Infinity rejected");
}

function testResolveHonorsRecentPast() {
  const fiveMinAgo = eventTimeNow() - 300;
  assert.equal(resolveEventTime(fiveMinAgo), fiveMinAgo, "a recent charge time is used as-is");
  const sixDaysAgo = eventTimeNow() - 6 * 24 * 60 * 60;
  assert.equal(resolveEventTime(sixDaysAgo), sixDaysAgo, "6 days old is inside Meta's 7-day window");
}

function testResolveFallsBackToNowOutsideWindow() {
  assertIsNow(resolveEventTime(undefined), "undefined");
  assertIsNow(resolveEventTime(Number.NaN), "NaN");
  assertIsNow(resolveEventTime(eventTimeNow() + 3600), "1h in the future");
  assertIsNow(resolveEventTime(eventTimeNow() - 8 * 24 * 60 * 60), "8 days old (past Meta's 7-day limit)");
  // A raw ms epoch that skipped normalizeEpochToUnixSeconds must never reach Meta.
  assertIsNow(resolveEventTime(Date.now()), "raw ms epoch");
}

function testResolveFloorsFractions() {
  const t = eventTimeNow() - 100;
  assert.equal(resolveEventTime(t + 0.7), t, "fractional seconds are floored");
}

function testBuildPurchaseEventUsesProvidedTime() {
  const chargedAt = eventTimeNow() - 120;
  const evt = buildPurchaseEvent({
    value: 100,
    currency: "aud",
    eventId: "pi_test_123",
    eventTimeUnixSeconds: chargedAt,
  });
  assert.equal(evt.eventTime, chargedAt, "eventTime must be the charge time, not the send time");
}

function testBuildPurchaseEventDefaultsToNow() {
  const evt = buildPurchaseEvent({ value: 25, currency: "AUD", eventId: "pi_test_456" });
  assertIsNow(evt.eventTime, "no eventTimeUnixSeconds");
}

function testBuildPurchaseEventGuardsGarbageTime() {
  const evt = buildPurchaseEvent({
    value: 25,
    currency: "AUD",
    eventId: "pi_test_789",
    eventTimeUnixSeconds: Date.now(), // ms epoch passed by mistake
  });
  assertIsNow(evt.eventTime, "ms epoch falls back to now instead of poisoning the request");
}

function run() {
  testNormalizeSecondsPassThrough();
  testNormalizeMillisecondsDetected();
  testNormalizeGarbage();
  testResolveHonorsRecentPast();
  testResolveFallsBackToNowOutsideWindow();
  testResolveFloorsFractions();
  testBuildPurchaseEventUsesProvidedTime();
  testBuildPurchaseEventDefaultsToNow();
  testBuildPurchaseEventGuardsGarbageTime();
  console.log("purchase event-time tests passed");
}

try {
  run();
} catch (e) {
  console.error(e);
  process.exit(1);
}
