import assert from "node:assert/strict";
import { nextWatermark, SYSTEMIC_FAILURE_RATIO } from "../KlaviyoProfileReconciliationService";
import {
  classifyKlaviyoFailure,
  isPhoneNumberRejection,
} from "@/utils/integrations/klaviyo/klaviyo-profile-sync";

const T0 = new Date("2026-08-26T00:00:00.000Z");
const T1 = new Date("2026-08-26T00:05:00.000Z");

/** Shorthand for the outcome triple `nextWatermark` takes. */
const outcome = (processed: number, retryableFailures = 0, permanentFailures = 0) => ({
  processed,
  retryableFailures,
  permanentFailures,
});

// ── Watermark movement ────────────────────────────────────────────────────────────────────

function testCleanRunAdvances() {
  assert.equal(nextWatermark(T0, T1, outcome(10)).toISOString(), T1.toISOString());
}

// A retryable failure holds so the next run re-covers the window. An outage becomes a delay,
// not a silent permanent gap.
function testRetryableFailureHolds() {
  assert.equal(nextWatermark(T0, T1, outcome(10, 1)).toISOString(), T0.toISOString());
  assert.equal(nextWatermark(T0, T1, outcome(10, 47)).toISOString(), T0.toISOString());
}

// THE 2026-08-27 INCIDENT.
// One profile returned a hard 400 (SMS-ineligible phone number). Because every failure held
// the watermark, that single profile pinned the cursor for over an hour and the backlog stopped
// draining at ~29,500. A permanent failure MUST be stepped over — holding for something that
// can never succeed is a deadlock, not resilience.
function testASinglePermanentFailureDoesNotPinTheCursor() {
  assert.equal(nextWatermark(T0, T1, outcome(103, 0, 1)).toISOString(), T1.toISOString());
}

// The opposite trap: a revoked API key makes EVERY user fail permanently. Marching the cursor
// through 57,000 users while syncing none of them would be far worse than stalling, so a high
// permanent-failure RATE is treated as configuration, not data.
function testSystemicPermanentFailureHolds() {
  assert.equal(nextWatermark(T0, T1, outcome(0, 0, 100)).toISOString(), T0.toISOString());
  assert.equal(nextWatermark(T0, T1, outcome(10, 0, 90)).toISOString(), T0.toISOString());
}

// Right at the boundary the sweep must keep moving — the ratio is a "most of the batch" guard,
// not a hair trigger.
function testRatioBoundaryStillAdvances() {
  const half = outcome(50, 0, 50); // exactly 0.5, not greater than
  assert.equal(50 / 100, SYSTEMIC_FAILURE_RATIO);
  assert.equal(nextWatermark(T0, T1, half).toISOString(), T1.toISOString());
}

// A retryable failure outranks the permanent-failure logic: if anything might succeed later,
// re-cover the window.
function testRetryableWinsOverPermanent() {
  assert.equal(nextWatermark(T0, T1, outcome(10, 1, 1)).toISOString(), T0.toISOString());
}

function testEmptyBatchHoldsPosition() {
  assert.equal(nextWatermark(T0, null, outcome(0)).toISOString(), T0.toISOString());
}

function testNeverGoesBackwards() {
  const earlier = new Date("2026-08-25T00:00:00.000Z");
  assert.equal(nextWatermark(T0, earlier, outcome(10)).toISOString(), T0.toISOString());
}

function testEqualTimestampHoldsPosition() {
  assert.equal(nextWatermark(T0, new Date(T0.getTime()), outcome(10)).toISOString(), T0.toISOString());
}

// ── Failure classification ────────────────────────────────────────────────────────────────

function testRetryableErrorsAreClassifiedRetryable() {
  for (const e of [
    "Klaviyo API error: 429 - throttled",
    "Klaviyo API error: 500 - server error",
    "Klaviyo API error: 502 - bad gateway",
    "Klaviyo API error: 503 - unavailable",
    "Klaviyo API timeout after 30000ms",
    "Klaviyo API network error: fetch failed (cause: UND_ERR_SOCKET - other side closed)",
  ]) {
    assert.equal(classifyKlaviyoFailure(e).retryable, true, e);
  }
}

function testHard4xxIsPermanent() {
  for (const e of [
    'Klaviyo API error: 400 - {"errors":[{"code":"invalid","title":"Invalid input."}]}',
    "Klaviyo API error: 401 - authentication failed",
    "Klaviyo API error: 403 - forbidden",
    "Klaviyo API error: 422 - unprocessable",
  ]) {
    assert.equal(classifyKlaviyoFailure(e).retryable, false, e);
  }
}

// An unrecognised failure shape must default to RETRYABLE — stepping past a profile we do not
// understand would silently skip a real customer, which is the failure this service exists to
// remove. Better to retry needlessly than to drop someone.
function testUnknownFailuresDefaultToRetryable() {
  assert.equal(classifyKlaviyoFailure("something we have never seen").retryable, true);
  assert.equal(classifyKlaviyoFailure(undefined).retryable, true);
  assert.equal(classifyKlaviyoFailure("").retryable, true);
}

// A 429 body can contain other numbers; the rate-limit signal must win.
function testRateLimitWinsOverIncidentalDigits() {
  assert.equal(
    classifyKlaviyoFailure("Klaviyo API error: 429 - retry after 400 seconds").retryable,
    true
  );
}

// ── Phone-number recovery ─────────────────────────────────────────────────────────────────

// The real production body, so the matcher is pinned against the shape Klaviyo actually sends.
const REAL_PHONE_REJECTION =
  'Klaviyo API error: 400 - {"errors":[{"id":"8dec5e54","status":400,"code":"invalid",' +
  '"title":"Invalid input.","detail":"The phone number provided either does not exist or is ' +
  'ineligible to receive ChannelType.SMS","source":{"pointer":"/data/attributes/phone_number"}}]}';

function testPhoneRejectionIsRecognised() {
  assert.equal(isPhoneNumberRejection(REAL_PHONE_REJECTION), true);
}

function testOtherRejectionsAreNotTreatedAsPhoneProblems() {
  assert.equal(
    isPhoneNumberRejection(
      'Klaviyo API error: 400 - {"errors":[{"source":{"pointer":"/data/attributes/email"}}]}'
    ),
    false
  );
  assert.equal(isPhoneNumberRejection("Klaviyo API error: 500 - server error"), false);
  assert.equal(isPhoneNumberRejection(undefined), false);
}

function run() {
  testCleanRunAdvances();
  testRetryableFailureHolds();
  testASinglePermanentFailureDoesNotPinTheCursor();
  testSystemicPermanentFailureHolds();
  testRatioBoundaryStillAdvances();
  testRetryableWinsOverPermanent();
  testEmptyBatchHoldsPosition();
  testNeverGoesBackwards();
  testEqualTimestampHoldsPosition();
  testRetryableErrorsAreClassifiedRetryable();
  testHard4xxIsPermanent();
  testUnknownFailuresDefaultToRetryable();
  testRateLimitWinsOverIncidentalDigits();
  testPhoneRejectionIsRecognised();
  testOtherRejectionsAreNotTreatedAsPhoneProblems();
  console.log("klaviyo-reconciliation tests passed");
}

run();
