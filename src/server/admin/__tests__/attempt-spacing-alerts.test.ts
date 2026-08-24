/**
 * Two guards on the automated past-due charge run:
 *
 * 1. THE PROACTIVE PER-INVOICE ATTEMPT CAP (`shouldSkipForBulkAttemptSpacing`).
 *
 *    Stripe's Adaptive Acceptance blocks a card with `previously_declined_do_not_retry`
 *    "based on prior network decline or advice codes", and Stripe support named the
 *    cause as *"too many payment attempts were made in a short time window"*, with the
 *    recommendation to **wait 2-3 days between retries of the same transaction**. 835 of
 *    1,024 blocked transactions on this account (82%) carry that reason, and the Radar
 *    allow list cannot override it. See docs/billing-stripe/gotchas.md.
 *
 *    Measured before this rule existed: individual invoices reached 24 submissions in 30
 *    days (100 invoices at 17, 76 at 18). The existing `EXCESSIVE_RETRY_COOLDOWN_DAYS`
 *    cooldown could not have prevented any of them — it is REACTIVE (needs a
 *    `BlockedTransaction` row to already exist) and fails OPEN.
 *
 *    The load-bearing detail is that only `success`/`failed` rows count. Counting this
 *    rule's OWN `skipped` rows would push the next eligible date forward on every run
 *    and the invoice would never be charged again.
 *
 * 2. RUN ALERTING (`buildChargeRunAlerts`). Runs finalized `aborted` at ~48% of their
 *    worklist for five consecutive days with nothing reporting it. The success-rate
 *    floor is pinned here against the five real runs it must fire on.
 */

import assert from "node:assert/strict";
import {
  BULK_ATTEMPT_SPACING_DAYS,
  SKIP_REASON_ATTEMPT_SPACING,
  cutoffForBulkAttemptSpacing,
  shouldSkipForBulkAttemptSpacing,
} from "../past-due-charge-idempotency";
import {
  LOW_SUCCESS_RATE_FLOOR,
  LOW_SUCCESS_RATE_MIN_ATTEMPTS,
  aggregateRunTotals,
  buildChargeRunAlerts,
  emptyTotals,
} from "../charge-past-due-totals";
import {
  KNOWN_SKIP_REASONS,
  SKIP_BUCKET_LABELS,
  SKIP_BUCKET_ORDER,
  classifySkipBucketFromMessage,
  classifySkipReasonFromMessage,
  skipReasonToBucket,
} from "@/utils/admin/chargeSkipReasons";

const NOW = new Date("2026-08-24T08:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS);
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 60 * 60 * 1000);

// ─── 1. The attempt cap ──────────────────────────────────────────────────────

function testNeverAttemptedIsChargedImmediately() {
  // The 229 members never attempted in 30 days must not be held back by this rule.
  for (const last of [null, undefined]) {
    assert.equal(
      shouldSkipForBulkAttemptSpacing({ lastRealAttemptAt: last, now: NOW }).skip,
      false,
      "an invoice with no prior real attempt must be charged"
    );
  }
}

function testAttemptYesterdayIsHeldBack() {
  const d = shouldSkipForBulkAttemptSpacing({ lastRealAttemptAt: daysAgo(1), now: NOW });
  assert.equal(d.skip, true, "a card submitted yesterday must sit out");
  if (!d.skip) throw new Error("unreachable");
  assert.equal(d.retryAfter.getTime(), daysAgo(1).getTime() + BULK_ATTEMPT_SPACING_DAYS * DAY_MS);
  assert.equal(d.daysRemaining, 2);
  assert.equal(d.lastAttemptAt.getTime(), daysAgo(1).getTime());
}

function testDailyCadenceIsBrokenAtEveryPointInsideTheWindow() {
  // The measured 17-24 attempts-per-invoice-per-30-days pattern is exactly this:
  // every day inside the window must be refused.
  for (const hours of [0, 1, 6, 24, 47, 48, 71, 71.99]) {
    assert.equal(
      shouldSkipForBulkAttemptSpacing({ lastRealAttemptAt: hoursAgo(hours), now: NOW }).skip,
      true,
      `an attempt ${hours}h ago must still hold the card back`
    );
  }
}

function testBoundaryIsInclusiveAtExactlyThreeDays() {
  // >= retryAfter proceeds. A run that starts a few seconds early on day 3 must not be
  // pushed to day 4 — that would silently stretch a 3-day rule into a 4-day one.
  const exact = daysAgo(BULK_ATTEMPT_SPACING_DAYS);
  assert.equal(
    shouldSkipForBulkAttemptSpacing({ lastRealAttemptAt: exact, now: NOW }).skip,
    false,
    "exactly at the boundary must proceed"
  );
  assert.equal(
    shouldSkipForBulkAttemptSpacing({
      lastRealAttemptAt: new Date(exact.getTime() + 1000),
      now: NOW,
    }).skip,
    true,
    "one second inside the window must still hold back"
  );
  assert.equal(
    shouldSkipForBulkAttemptSpacing({ lastRealAttemptAt: daysAgo(4), now: NOW }).skip,
    false
  );
  assert.equal(
    shouldSkipForBulkAttemptSpacing({ lastRealAttemptAt: daysAgo(30), now: NOW }).skip,
    false,
    "a long-dormant invoice must be reachable again — blocked cards decay (17% eventually pay)"
  );
}

function testDaysRemainingIsNeverZero() {
  // Surfaced to admins as "Eligible again ... (N days)". A floor of 1 keeps that honest
  // for a card that clears in under an hour.
  const almost = new Date(NOW.getTime() - (BULK_ATTEMPT_SPACING_DAYS * DAY_MS - 60 * 1000));
  const d = shouldSkipForBulkAttemptSpacing({ lastRealAttemptAt: almost, now: NOW });
  assert.equal(d.skip, true);
  if (!d.skip) throw new Error("unreachable");
  assert.equal(d.daysRemaining, 1);
}

function testCapCeilingIsTenAttemptsPerThirtyDays() {
  // Walk 30 daily runs against the rule and count real submissions. Before this
  // existed, individual invoices hit 24. Under a 3-day gap the ceiling is 10.
  let lastRealAttemptAt: Date | null = null;
  let submissions = 0;
  for (let day = 0; day < 30; day++) {
    const now = new Date(NOW.getTime() + day * DAY_MS);
    if (!shouldSkipForBulkAttemptSpacing({ lastRealAttemptAt, now }).skip) {
      submissions++;
      lastRealAttemptAt = now;
    }
  }
  assert.equal(submissions, 10, "30 daily runs must yield at most 10 submissions per invoice");
}

function testCutoffMatchesTheSpacingWindow() {
  // The Mongo query uses this cutoff; the predicate uses the window. If they disagree,
  // rows outside the query are never seen and the rule silently stops firing.
  assert.equal(
    cutoffForBulkAttemptSpacing(NOW).getTime(),
    NOW.getTime() - BULK_ATTEMPT_SPACING_DAYS * DAY_MS
  );
  // Any row the query CAN return must be inside the predicate's window.
  const oldestReturnable = new Date(cutoffForBulkAttemptSpacing(NOW).getTime() + 1);
  assert.equal(
    shouldSkipForBulkAttemptSpacing({ lastRealAttemptAt: oldestReturnable, now: NOW }).skip,
    true,
    "query cutoff and predicate window must agree"
  );
}

function testSpacingDaysIsOverridable() {
  assert.equal(
    shouldSkipForBulkAttemptSpacing({ lastRealAttemptAt: daysAgo(2), now: NOW, spacingDays: 2 })
      .skip,
    false
  );
  assert.equal(cutoffForBulkAttemptSpacing(NOW, 1).getTime(), NOW.getTime() - DAY_MS);
}

// ─── 2. The skip-reason vocabulary the cap writes through ────────────────────

function testAttemptSpacingBucketsAsItselfNotAsRecentlyAttempted() {
  // The real message the job writes. VERIFIED by mutation: delete the attempt_spacing
  // branch from classifySkipReasonFromMessage and this falls through every remaining
  // test into `other` — the largest bucket in every automated run, silently unlabelled.
  // Keeping the branch FIRST also makes it immune to rewording: the message names a
  // prior attempt time, so a future edit containing "within" or "prior attempt" would
  // otherwise be claimed by `recently_attempted` below, which is the 6h HUMAN-retry
  // window and means something else entirely to an operator.
  const message =
    `Skipped: ${SKIP_REASON_ATTEMPT_SPACING} — last submitted to Stripe at ` +
    `2026-08-23T21:10:04.000Z; this card sits out ${BULK_ATTEMPT_SPACING_DAYS} days ` +
    `between attempts. Eligible again 2026-08-26T21:10:04.000Z (2 days).`;

  assert.equal(classifySkipReasonFromMessage(message), SKIP_REASON_ATTEMPT_SPACING);
  assert.equal(classifySkipBucketFromMessage(message), "attemptSpacing");

  // The fail-closed message must bucket identically — it is the same rule holding back.
  const failClosed =
    `Skipped: ${SKIP_REASON_ATTEMPT_SPACING} — could not read this invoice's attempt ` +
    `history, so it was held back rather than risk an extra submission to Stripe.`;
  assert.equal(classifySkipBucketFromMessage(failClosed), "attemptSpacing");
}

function testSiblingSkipReasonsStillBucketCorrectly() {
  // The new branch runs FIRST, so prove it did not steal any existing message.
  assert.equal(
    classifySkipBucketFromMessage(
      "Skipped: prior attempt at 2026-08-24T00:00:00.000Z within 6h window"
    ),
    "recentlyAttempted"
  );
  assert.equal(
    classifySkipBucketFromMessage(
      "Skipped: excessive_retry_cooldown — Stripe is blocking this card after repeated attempts. Retry in 3 days."
    ),
    "excessiveRetryCooldown"
  );
  assert.equal(classifySkipBucketFromMessage("Skipped: no held draft to re-bill"), "noHeldDraft");
  assert.equal(classifySkipBucketFromMessage("Skipped: already paid"), "alreadyPaid");
  assert.equal(
    classifySkipBucketFromMessage('Skipped: subscription.status is "active", no longer past_due'),
    "noLongerPastDue"
  );
  assert.equal(
    classifySkipBucketFromMessage("No payment method found on invoice or customer"),
    "missingPaymentMethod"
  );
  assert.equal(classifySkipBucketFromMessage("Skipped: something unmapped"), "other");
}

function testBucketVocabularyIsInLockstep() {
  assert.equal(skipReasonToBucket(SKIP_REASON_ATTEMPT_SPACING), "attemptSpacing");
  assert.ok(KNOWN_SKIP_REASONS.has(SKIP_REASON_ATTEMPT_SPACING));
  assert.ok(SKIP_BUCKET_ORDER.includes("attemptSpacing"));
  assert.equal(typeof SKIP_BUCKET_LABELS.attemptSpacing, "string");
  // Every bucket key must exist as a totals field — `bumpSkipBucket` indexes the
  // breakdown BY the bucket key, so a key with no field is a silent NaN.
  const totals = emptyTotals(0);
  for (const key of SKIP_BUCKET_ORDER) {
    assert.equal(typeof totals.skipped[key], "number", `skipped.${key} must exist`);
  }
}

function testHeldRowsAreCountedAsSkippedNotAttempted() {
  // eligible = attempted + skipped, with no silent remainder — the run audit must
  // still balance once two thirds of a run are held back.
  const totals = aggregateRunTotals(
    [
      { status: "success", amount: 2000 },
      { status: "failed", amount: 2000 },
      { status: "skipped", amount: 2000, skipReason: SKIP_REASON_ATTEMPT_SPACING },
      { status: "skipped", amount: 2000, skipReason: SKIP_REASON_ATTEMPT_SPACING },
      { status: "skipped", amount: 2000, skipReason: "no_held_draft" },
    ],
    5
  );
  assert.equal(totals.attempted, 2, "held rows must never count as attempts");
  assert.equal(totals.skipped.attemptSpacing, 2);
  assert.equal(totals.skipped.total, 3);
  assert.equal(totals.attempted + totals.skipped.total, totals.eligibleCount);
  assert.equal(totals.revenueCents, 2000);
}

// ─── 3. Run alerting ─────────────────────────────────────────────────────────

function totalsWith(attempted: number, succeeded: number) {
  return {
    ...emptyTotals(attempted),
    attempted,
    succeeded,
    failed: attempted - succeeded,
    revenueCents: succeeded * 2000,
  };
}

function testLowRateFloorFiresOnAllFiveRealRuns() {
  // The five runs immediately before this shipped. Any floor that does not fire on
  // every one of them is set too low.
  const observed: Array<[string, number, number]> = [
    ["20/8", 425, 11],
    ["21/8", 419, 25],
    ["22/8", 427, 20],
    ["23/8", 420, 15],
    ["24/8", 376, 21],
  ];
  for (const [label, attempted, succeeded] of observed) {
    const alerts = buildChargeRunAlerts({
      runId: `run-${label}`,
      status: "completed",
      totals: totalsWith(attempted, succeeded),
    });
    assert.ok(
      alerts.some((a) => a.kind === "low_success_rate"),
      `${label} (${succeeded}/${attempted}) must trip the low-rate alert`
    );
  }
  // 5.97% (25/419) is the best of the five, so the floor must clear it with headroom.
  assert.ok(LOW_SUCCESS_RATE_FLOOR > 25 / 419, "floor must sit above the best observed run");
}

function testZeroCollectionIncidentShapeFires() {
  // 2026-06-29: a stable idempotency key made Stripe replay 656/668 prior declines
  // and the run collected $0. That is the catastrophic shape this must never miss.
  const alerts = buildChargeRunAlerts({
    runId: "replay-incident",
    status: "completed",
    totals: totalsWith(668, 0),
  });
  assert.ok(alerts.some((a) => a.kind === "low_success_rate"));
}

function testHealthyRunIsSilent() {
  const alerts = buildChargeRunAlerts({
    runId: "healthy",
    status: "completed",
    totals: totalsWith(386, 60), // 15.5%
  });
  assert.deepEqual(alerts, [], "a healthy completed run must not alert");
}

function testTinyRunIsNotJudgedOnRate() {
  // 0/6 is 0% and means nothing. Only the minimum-attempts floor stops that firing.
  const alerts = buildChargeRunAlerts({
    runId: "tiny",
    status: "completed",
    totals: totalsWith(LOW_SUCCESS_RATE_MIN_ATTEMPTS - 1, 0),
  });
  assert.deepEqual(alerts, [], "a sub-floor run must not be judged on its rate");
  // ...but exactly at the floor it IS judged.
  assert.ok(
    buildChargeRunAlerts({
      runId: "at-floor",
      status: "completed",
      totals: totalsWith(LOW_SUCCESS_RATE_MIN_ATTEMPTS, 0),
    }).some((a) => a.kind === "low_success_rate")
  );
}

function testAbortedRunAlwaysAlerts() {
  // The exact five-day shape: aborted mid-run at ~48% of the worklist.
  const alerts = buildChargeRunAlerts({
    runId: "swept",
    status: "aborted",
    trigger: "cron",
    error: "Aborted by orphan sweep — no progress for 36 min (totals recomputed from logs)",
    totals: { ...totalsWith(420, 15), eligibleCount: 868 },
  });
  assert.ok(alerts.some((a) => a.kind === "aborted"), "an aborted run must alert");
  const aborted = alerts.find((a) => a.kind === "aborted")!;
  assert.ok(aborted.message.includes("[chargePastDue][ALERT]"), "must carry the greppable prefix");
  assert.ok(aborted.message.includes("orphan sweep"), "must carry the abort reason");
  assert.ok(aborted.message.includes("eligible=868"), "must carry the coverage numbers");
  assert.ok(aborted.message.includes("trigger=cron"));
}

function testAbortedRunWithGoodRateStillAlertsOnce() {
  const alerts = buildChargeRunAlerts({
    runId: "swept-ok-rate",
    status: "aborted",
    error: "stopped",
    totals: totalsWith(200, 40), // 20% — well clear of the floor
  });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].kind, "aborted");
}

function testRunningRunIsNeverJudged() {
  // Mid-run totals are partial by definition; judging them would alert on chunk 1.
  assert.deepEqual(
    buildChargeRunAlerts({ runId: "mid", status: "running", totals: totalsWith(60, 0) }),
    []
  );
}

function testMalformedTotalsDoNotThrow() {
  // Legacy runs predate several skip buckets; the emitter sits in the money path.
  for (const totals of [null, undefined, {}, { eligibleCount: 3 }]) {
    assert.doesNotThrow(() =>
      buildChargeRunAlerts({ runId: "legacy", status: "aborted", error: "x", totals: totals as never })
    );
  }
}

function run() {
  testNeverAttemptedIsChargedImmediately();
  testAttemptYesterdayIsHeldBack();
  testDailyCadenceIsBrokenAtEveryPointInsideTheWindow();
  testBoundaryIsInclusiveAtExactlyThreeDays();
  testDaysRemainingIsNeverZero();
  testCapCeilingIsTenAttemptsPerThirtyDays();
  testCutoffMatchesTheSpacingWindow();
  testSpacingDaysIsOverridable();

  testAttemptSpacingBucketsAsItselfNotAsRecentlyAttempted();
  testSiblingSkipReasonsStillBucketCorrectly();
  testBucketVocabularyIsInLockstep();
  testHeldRowsAreCountedAsSkippedNotAttempted();

  testLowRateFloorFiresOnAllFiveRealRuns();
  testZeroCollectionIncidentShapeFires();
  testHealthyRunIsSilent();
  testTinyRunIsNotJudgedOnRate();
  testAbortedRunAlwaysAlerts();
  testAbortedRunWithGoodRateStillAlertsOnce();
  testRunningRunIsNeverJudged();
  testMalformedTotalsDoNotThrow();

  console.log("attempt-spacing + run-alert tests passed");
}

run();
