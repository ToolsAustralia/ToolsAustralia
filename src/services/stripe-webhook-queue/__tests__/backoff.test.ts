import assert from "node:assert/strict";
import { computeNextAttempt, BACKOFF_SCHEDULE_MS, MAX_ATTEMPTS } from "../backoff";

function testInitialEnqueueIsImmediate() {
  const now = new Date("2026-05-12T00:00:00.000Z");
  const next = computeNextAttempt(0, now);
  assert.equal(next instanceof Date, true);
  assert.equal((next as Date).toISOString(), now.toISOString());
}

function testEachAttemptUsesScheduledOffset() {
  const now = new Date("2026-05-12T00:00:00.000Z");
  const expected = [
    0,                  // attempts=0 → now
    60 * 1000,          // attempts=1 → +1m
    5 * 60 * 1000,      // attempts=2 → +5m
    15 * 60 * 1000,     // attempts=3 → +15m
    60 * 60 * 1000,     // attempts=4 → +1h
    6 * 60 * 60 * 1000, // attempts=5 → +6h
  ];
  expected.forEach((offsetMs, attempts) => {
    const next = computeNextAttempt(attempts, now);
    assert.ok(next instanceof Date, `attempts=${attempts} should return a Date`);
    assert.equal(
      (next as Date).getTime() - now.getTime(),
      offsetMs,
      `attempts=${attempts} should be +${offsetMs}ms`
    );
  });
}

function testReachingCapReturnsDead() {
  const now = new Date("2026-05-12T00:00:00.000Z");
  assert.equal(computeNextAttempt(MAX_ATTEMPTS, now), "dead");
  assert.equal(computeNextAttempt(MAX_ATTEMPTS + 5, now), "dead");
}

function testScheduleLengthMatchesMaxAttempts() {
  // The schedule has one entry per attempt count from 0 up to MAX_ATTEMPTS - 1.
  assert.equal(BACKOFF_SCHEDULE_MS.length, MAX_ATTEMPTS);
}

function run() {
  testInitialEnqueueIsImmediate();
  testEachAttemptUsesScheduledOffset();
  testReachingCapReturnsDead();
  testScheduleLengthMatchesMaxAttempts();
  console.log("backoff tests passed");
}

run();
