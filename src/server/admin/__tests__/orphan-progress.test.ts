/**
 * Orphan sweep must key on LAST PROGRESS, not on elapsed time since start.
 *
 * REGRESSION GUARD (2026-08-24). `isOrphanRun` used to compare `now - startedAt`
 * against `ORPHAN_RUN_THRESHOLD_MS`, and `sweepOrphanRuns` duplicated that as a
 * `startedAt: { $lt: cutoff }` Mongo query. Production charge runs take 36.5-39.0
 * minutes against a 35-minute threshold, so EVERY run was marked `aborted` by the
 * next 5-minute cron tick while it was still actively charging:
 *
 *   20/8  39.0 min  eligible 813   attempted 425 (52%)
 *   21/8  38.2 min  eligible 846   attempted 419 (50%)
 *   22/8  38.1 min  eligible 864   attempted 427 (49%)
 *   23/8  36.5 min  eligible 868   attempted 420 (48%)
 *   24/8  39.0 min  eligible 1103  attempted 376 (34%)
 *
 * Once `aborted`, the resume path (`findOne({status:"running"})`) no longer finds
 * the run and the one-run-per-local-day guard blocks a fresh start, so the day
 * permanently stopped at ~48%. Consequences: 94% of each day's attempts were the
 * same members as the day before (which manufactures Stripe's excessive-retry
 * blocks), while 229 of 1,157 past-due members were never attempted in 30 days.
 *
 * Raising the threshold only moves the cliff — the eligible population grew
 * 813 -> 1103 in five days. The lock is already renewed per chunk, so a real
 * liveness signal exists: sweep on `lastProgressAt`, falling back to `startedAt`
 * for legacy rows written before the field existed.
 */

import assert from "node:assert/strict";
import { ORPHAN_RUN_THRESHOLD_MS, isOrphanRun, runLivenessAt } from "../charge-past-due-totals";

const NOW = new Date("2026-08-24T08:00:00Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60 * 1000);

/** The exact production shape: a 60-minute run that is still charging. */
function testLongRunWithRecentProgressIsAlive() {
  assert.equal(
    isOrphanRun(
      { status: "running", startedAt: minutesAgo(60), lastProgressAt: minutesAgo(1) },
      NOW
    ),
    false,
    "actively-progressing long run is not an orphan"
  );
}

/** Well past the threshold on elapsed time, but a chunk landed 30s ago. */
function testProgressJustNowBeatsAnyElapsedTime() {
  assert.equal(
    isOrphanRun(
      {
        status: "running",
        startedAt: minutesAgo(24 * 60),
        lastProgressAt: new Date(NOW.getTime() - 30 * 1000),
      },
      NOW
    ),
    false,
    "elapsed time alone must never mark a progressing run an orphan"
  );
}

/** A genuinely wedged run — no progress for longer than the window — IS swept. */
function testStalledRunIsOrphan() {
  assert.equal(
    isOrphanRun(
      {
        status: "running",
        startedAt: minutesAgo(60),
        lastProgressAt: new Date(NOW.getTime() - ORPHAN_RUN_THRESHOLD_MS - 1000),
      },
      NOW
    ),
    true,
    "stalled run is an orphan"
  );
}

/** Boundary: exactly at the threshold sweeps (>=), one ms under does not. */
function testStallBoundaryIsInclusive() {
  const at = new Date(NOW.getTime() - ORPHAN_RUN_THRESHOLD_MS);
  const justUnder = new Date(NOW.getTime() - ORPHAN_RUN_THRESHOLD_MS + 1);
  assert.equal(
    isOrphanRun({ status: "running", startedAt: minutesAgo(90), lastProgressAt: at }, NOW),
    true
  );
  assert.equal(
    isOrphanRun({ status: "running", startedAt: minutesAgo(90), lastProgressAt: justUnder }, NOW),
    false
  );
}

/** Legacy rows predate the field — fall back to startedAt so none stick `running`. */
function testLegacyRunWithoutLastProgressFallsBackToStartedAt() {
  assert.equal(
    isOrphanRun({ status: "running", startedAt: minutesAgo(60) }, NOW),
    true,
    "legacy run without lastProgressAt falls back to startedAt"
  );
  assert.equal(
    isOrphanRun({ status: "running", startedAt: minutesAgo(60), lastProgressAt: null }, NOW),
    true,
    "explicit null lastProgressAt falls back to startedAt"
  );
  assert.equal(
    isOrphanRun({ status: "running", startedAt: minutesAgo(10) }, NOW),
    false,
    "young legacy run is still alive"
  );
}

/** A run that has not yet finished its first chunk has no heartbeat yet. */
function testFreshRunBeforeFirstChunkIsAlive() {
  assert.equal(
    isOrphanRun({ status: "running", startedAt: minutesAgo(2) }, NOW),
    false,
    "brand-new run with no chunk completed yet is not an orphan"
  );
}

/** Only `running` runs are ever sweepable, however stale their heartbeat. */
function testFinishedRunsAreNeverOrphans() {
  for (const status of ["completed", "failed", "aborted"] as const) {
    assert.equal(
      isOrphanRun({ status, startedAt: minutesAgo(600), lastProgressAt: minutesAgo(600) }, NOW),
      false,
      `${status} run is never an orphan`
    );
  }
}

/**
 * `runLivenessAt` is the one rule shared by the sweep and the
 * `fix-stuck-charge-jobs` ops script. Pin it directly so a caller that reproduces
 * the fallback by hand can be diffed against it.
 */
function testRunLivenessAtPicksHeartbeatThenStartedAt() {
  const started = minutesAgo(60);
  const beat = minutesAgo(2);
  assert.equal(runLivenessAt({ startedAt: started, lastProgressAt: beat }).getTime(), beat.getTime());
  assert.equal(runLivenessAt({ startedAt: started }).getTime(), started.getTime());
  assert.equal(
    runLivenessAt({ startedAt: started, lastProgressAt: null }).getTime(),
    started.getTime()
  );
  // A heartbeat OLDER than startedAt still wins — it is the later fact recorded
  // about the run, and clamping would silently resurrect a stalled run.
  const stale = minutesAgo(120);
  assert.equal(runLivenessAt({ startedAt: started, lastProgressAt: stale }).getTime(), stale.getTime());
}

function run() {
  testRunLivenessAtPicksHeartbeatThenStartedAt();
  testLongRunWithRecentProgressIsAlive();
  testProgressJustNowBeatsAnyElapsedTime();
  testStalledRunIsOrphan();
  testStallBoundaryIsInclusive();
  testLegacyRunWithoutLastProgressFallsBackToStartedAt();
  testFreshRunBeforeFirstChunkIsAlive();
  testFinishedRunsAreNeverOrphans();
  console.log("orphan-progress tests passed");
}

run();
