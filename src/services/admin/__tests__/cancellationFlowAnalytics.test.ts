import assert from "node:assert/strict";
import { summarizeCancellationEvents } from "../cancellationFlowAnalytics";
import type { ICancellationFlowEvent } from "@/models/CancellationFlowEvent";

const NOW = new Date("2026-05-18T12:00:00.000Z");
const TWO_HOURS_AGO = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);
const THIRTY_MIN_AGO = new Date(NOW.getTime() - 30 * 60 * 1000);
const HUNDRED_DAYS_AGO = new Date(NOW.getTime() - 100 * 24 * 60 * 60 * 1000);
const TEN_DAYS_AGO = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000);

// Minimal event factory — only the fields the pure shaper reads.
function ev(partial: Partial<ICancellationFlowEvent>): ICancellationFlowEvent {
  return {
    reason: "other",
    offersShown: [],
    offerAccepted: null,
    outcome: "in_progress",
    pastDue: false,
    startedAt: NOW,
    ...partial,
  } as ICancellationFlowEvent;
}

function sample(): ICancellationFlowEvent[] {
  return [
    // 1. saved via discount, matured retained
    ev({
      reason: "too_expensive",
      offersShown: ["discount_50_2mo"],
      offerAccepted: "discount_50_2mo",
      outcome: "saved",
      savedAt: HUNDRED_DAYS_AGO,
      retention90: "retained",
    }),
    // 2. saved via pause, matured churned
    ev({
      reason: "too_expensive",
      offersShown: ["pause_30d"],
      offerAccepted: "pause_30d",
      outcome: "saved",
      savedAt: HUNDRED_DAYS_AGO,
      retention90: "churned",
    }),
    // 3. saved via bonus, not matured (savedAt within 90d) → pending
    ev({
      reason: "havent_won",
      offersShown: ["bonus_entries_100"],
      offerAccepted: "bonus_entries_100",
      outcome: "saved",
      savedAt: TEN_DAYS_AGO,
      retention90: "retained", // ignored: not matured
    }),
    // 4. saved but retention90 absent → pending
    ev({
      reason: "havent_won",
      offersShown: ["tier_downgrade"],
      offerAccepted: "tier_downgrade",
      outcome: "saved",
      savedAt: HUNDRED_DAYS_AGO,
      retention90: null,
    }),
    // 5. cancelled
    ev({
      reason: "dont_use_benefits",
      offersShown: ["pause_30d"],
      outcome: "cancelled",
    }),
    // 6. in_progress, old → abandoned
    ev({
      reason: "prefer_cheaper",
      offersShown: ["discount_50_2mo"],
      outcome: "in_progress",
      startedAt: TWO_HOURS_AGO,
    }),
    // 7. in_progress, recent → NOT abandoned
    ev({
      reason: "prefer_cheaper",
      offersShown: ["discount_50_2mo"],
      outcome: "in_progress",
      startedAt: THIRTY_MIN_AGO,
    }),
    // 8. past-due saved (excluded from reachedOffer even though offers shown)
    ev({
      reason: "too_many_messages",
      offersShown: ["unsubscribe_marketing"],
      offerAccepted: "unsubscribe_marketing",
      outcome: "saved",
      savedAt: HUNDRED_DAYS_AGO,
      retention90: "retained",
      pastDue: true,
    }),
  ];
}

function testEmptyArrayGuardsDivideByZero() {
  const s = summarizeCancellationEvents([], NOW);
  assert.equal(s.triggered, 0);
  assert.equal(s.saveRate, 0);
  assert.equal(s.saveRatePct, 0);
  for (const r of Object.values(s.byReason)) {
    assert.equal(r.count, 0);
    assert.equal(r.sharePct, 0);
  }
  assert.deepEqual(s.retention90, { retained: 0, churned: 0, pending: 0 });
  assert.equal(s.pastDueExcludedFromOfferConversion, 0);
}

function testTriggeredAndReasonShares() {
  const s = summarizeCancellationEvents(sample(), NOW);
  assert.equal(s.triggered, 8);
  assert.equal(s.byReason.too_expensive.count, 2);
  assert.equal(s.byReason.too_expensive.sharePct, 25); // 2/8
  assert.equal(s.byReason.havent_won.count, 2);
  assert.equal(s.byReason.prefer_cheaper.count, 2);
  assert.equal(s.byReason.dont_use_benefits.count, 1);
  assert.equal(s.byReason.dont_use_benefits.sharePct, 12.5); // 1/8
  assert.equal(s.byReason.too_many_messages.count, 1);
  assert.equal(s.byReason.joined_for_giveaway.count, 0);
}

function testFunnel() {
  const s = summarizeCancellationEvents(sample(), NOW);
  assert.equal(s.funnel.reachedReason, 8);
  // reachedOffer: events 1-7 have offers shown & not pastDue (7); event 8 pastDue excluded.
  assert.equal(s.funnel.reachedOffer, 7);
  // accepted: saved events 1,2,3,4,8 = 5
  assert.equal(s.funnel.accepted, 5);
  // cancelled: event 5
  assert.equal(s.funnel.cancelled, 1);
  // abandoned: event 6 (old in_progress); event 7 recent is NOT abandoned
  assert.equal(s.funnel.abandoned, 1);
}

function testSaveRate() {
  const s = summarizeCancellationEvents(sample(), NOW);
  // accepted 5 / (5 + 1 + 1) = 5/7
  assert.equal(s.saveRate, 5 / 7);
  assert.equal(s.saveRatePct, 71.4); // round(5/7*100,1)
}

function testByOfferAccepted() {
  const s = summarizeCancellationEvents(sample(), NOW);
  assert.equal(s.byOfferAccepted.discount_50_2mo, 1); // event 1
  assert.equal(s.byOfferAccepted.pause_30d, 1); // event 2
  assert.equal(s.byOfferAccepted.bonus_entries_100, 1); // event 3
  assert.equal(s.byOfferAccepted.tier_downgrade, 1); // event 4
  assert.equal(s.byOfferAccepted.unsubscribe_marketing, 1); // event 8 (past-due still counts here)
}

function testPastDueExcludedCount() {
  const s = summarizeCancellationEvents(sample(), NOW);
  assert.equal(s.pastDueExcludedFromOfferConversion, 1); // event 8
}

function testRetention90Split() {
  const s = summarizeCancellationEvents(sample(), NOW);
  // retained matured: event 1, event 8 = 2
  assert.equal(s.retention90.retained, 2);
  // churned matured: event 2 = 1
  assert.equal(s.retention90.churned, 1);
  // pending: event 3 (not matured), event 4 (retention90 null) = 2
  assert.equal(s.retention90.pending, 2);
  // total saved == accepted == 5
  assert.equal(
    s.retention90.retained + s.retention90.churned + s.retention90.pending,
    s.funnel.accepted
  );
}

function testSaveRateAllAccepted() {
  // A single saved event → accepted 1, cancelled 0, abandoned 0, so the
  // denominator is 1 (NOT the zero-denominator path — that is covered by
  // testEmptyArrayGuardsDivideByZero). saveRate must be a clean 1.0 / 100%.
  const s = summarizeCancellationEvents(
    [ev({ outcome: "saved", savedAt: TEN_DAYS_AGO, retention90: null })],
    NOW
  );
  assert.equal(s.saveRate, 1); // 1 / (1+0+0)
  assert.equal(s.saveRatePct, 100);
}

function run() {
  testEmptyArrayGuardsDivideByZero();
  testTriggeredAndReasonShares();
  testFunnel();
  testSaveRate();
  testByOfferAccepted();
  testPastDueExcludedCount();
  testRetention90Split();
  testSaveRateAllAccepted();
  console.log("cancellationFlowAnalytics tests passed");
}

run();
