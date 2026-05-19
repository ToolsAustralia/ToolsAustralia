import assert from "node:assert/strict";
import { shouldClearRetentionMarker } from "../cancellation-retention-resume/route";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PAST = new Date("2026-01-01T00:00:00.000Z");
const NOW = new Date("2026-05-18T10:00:00.000Z");
const FUTURE = new Date("2026-06-01T00:00:00.000Z");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function testNonRetentionPauseReturnsFalse() {
  // Any pauseReason other than "retention" must be a no-op.
  assert.equal(
    shouldClearRetentionMarker({
      pauseReason: undefined,
      pauseResumesAtIso: PAST.toISOString(),
      pauseCollectionPresent: false,
      now: NOW,
    }),
    false,
    "undefined pauseReason → false"
  );

  assert.equal(
    shouldClearRetentionMarker({
      pauseReason: "keep_as_draft",
      pauseResumesAtIso: PAST.toISOString(),
      pauseCollectionPresent: false,
      now: NOW,
    }),
    false,
    "recovery-pause marker → false (must never be treated as retention)"
  );

  assert.equal(
    shouldClearRetentionMarker({
      pauseReason: "",
      pauseResumesAtIso: PAST.toISOString(),
      pauseCollectionPresent: false,
      now: NOW,
    }),
    false,
    "empty string pauseReason (already cleared) → false (idempotent no-op)"
  );
}

function testRetentionWithFutureWindowAndStillPausedReturnsFalse() {
  // Pause is active (pause_collection present) and the window has not elapsed.
  // Must NOT clear — the member is in their 30-day voluntary pause.
  assert.equal(
    shouldClearRetentionMarker({
      pauseReason: "retention",
      pauseResumesAtIso: FUTURE.toISOString(),
      pauseCollectionPresent: true,
      now: NOW,
    }),
    false,
    "retention + future window + pause still active → false (do not clear mid-window)"
  );
}

function testRetentionWithPastWindowAndPauseStillPresentReturnsTrue() {
  // Window has elapsed but Stripe hasn't auto-resumed yet (or hasn't fired
  // the webhook) — clear metadata AND defensively call resume.
  assert.equal(
    shouldClearRetentionMarker({
      pauseReason: "retention",
      pauseResumesAtIso: PAST.toISOString(),
      pauseCollectionPresent: true,
      now: NOW,
    }),
    true,
    "retention + elapsed window + pause still active → true (clear stale marker + defensive resume)"
  );
}

function testRetentionWithPauseAlreadyClearedByStripeReturnsTrue() {
  // Stripe auto-resumed (pause_collection is null) but metadata marker is still
  // present. This is the primary production scenario — always clear.
  assert.equal(
    shouldClearRetentionMarker({
      pauseReason: "retention",
      pauseResumesAtIso: PAST.toISOString(),
      pauseCollectionPresent: false,
      now: NOW,
    }),
    true,
    "retention + pause already cleared by Stripe → true (stale marker cleanup)"
  );

  // Also true when pauseResumesAt is missing — Stripe cleared the pause so the
  // window metadata is irrelevant.
  assert.equal(
    shouldClearRetentionMarker({
      pauseReason: "retention",
      pauseResumesAtIso: undefined,
      pauseCollectionPresent: false,
      now: NOW,
    }),
    true,
    "retention + pause already cleared + no resumesAt metadata → true"
  );
}

function testRetentionWithInvalidDateStringReturnsFalse() {
  // An unparseable pauseResumesAt with an active pause is treated conservatively
  // as NOT elapsed — do nothing rather than accidentally clear a live marker.
  assert.equal(
    shouldClearRetentionMarker({
      pauseReason: "retention",
      pauseResumesAtIso: "not-a-date",
      pauseCollectionPresent: true,
      now: NOW,
    }),
    false,
    "retention + invalid date + pause active → false (conservative: treat as not elapsed)"
  );
}

function testRetentionWithWindowExactlyNowReturnsTrue() {
  // Boundary: resumesAt === now → elapsed (<=).
  assert.equal(
    shouldClearRetentionMarker({
      pauseReason: "retention",
      pauseResumesAtIso: NOW.toISOString(),
      pauseCollectionPresent: true,
      now: NOW,
    }),
    true,
    "retention + resumesAt exactly now + pause active → true (window is elapsed at boundary)"
  );
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function run() {
  testNonRetentionPauseReturnsFalse();
  testRetentionWithFutureWindowAndStillPausedReturnsFalse();
  testRetentionWithPastWindowAndPauseStillPresentReturnsTrue();
  testRetentionWithPauseAlreadyClearedByStripeReturnsTrue();
  testRetentionWithInvalidDateStringReturnsFalse();
  testRetentionWithWindowExactlyNowReturnsTrue();
  console.log("shouldClearRetentionMarker tests passed");
}

try {
  run();
} catch (err) {
  console.error(err);
  process.exit(1);
}
