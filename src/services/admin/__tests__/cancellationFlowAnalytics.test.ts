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
    // 9. saved via discount, matured churned (gives discount_50_2mo a churned)
    ev({
      reason: "other",
      offersShown: ["discount_50_2mo"],
      offerAccepted: "discount_50_2mo",
      outcome: "saved",
      savedAt: HUNDRED_DAYS_AGO,
      retention90: "churned",
    }),
    // 10. saved via discount, not matured → pending (gives discount_50_2mo a pending)
    ev({
      reason: "other",
      offersShown: ["discount_50_2mo"],
      offerAccepted: "discount_50_2mo",
      outcome: "saved",
      savedAt: TEN_DAYS_AGO,
      retention90: "retained", // ignored: not matured
    }),
    // 11. saved via pause, matured retained (gives pause_30d a retained)
    ev({
      reason: "other",
      offersShown: ["pause_30d"],
      offerAccepted: "pause_30d",
      outcome: "saved",
      savedAt: HUNDRED_DAYS_AGO,
      retention90: "retained",
    }),
    // 12. saved via pause, not matured → pending (gives pause_30d a pending)
    ev({
      reason: "other",
      offersShown: ["pause_30d"],
      offerAccepted: "pause_30d",
      outcome: "saved",
      savedAt: TEN_DAYS_AGO,
      retention90: "churned", // ignored: not matured
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
  // Task 21 added events 9-12 (4 "other"-reason saved events) → triggered 8 → 12.
  assert.equal(s.triggered, 12);
  assert.equal(s.byReason.too_expensive.count, 2);
  assert.equal(s.byReason.too_expensive.sharePct, 16.7); // 2/12 = 16.666 → roundPct 16.7 (was 25 @ 2/8)
  assert.equal(s.byReason.havent_won.count, 2);
  assert.equal(s.byReason.prefer_cheaper.count, 2);
  assert.equal(s.byReason.dont_use_benefits.count, 1);
  assert.equal(s.byReason.dont_use_benefits.sharePct, 8.3); // 1/12 = 8.333 → roundPct 8.3 (was 12.5 @ 1/8)
  assert.equal(s.byReason.too_many_messages.count, 1);
  assert.equal(s.byReason.other.count, 4); // events 9-12 (Task 21)
  assert.equal(s.byReason.joined_for_giveaway.count, 0);
}

function testFunnel() {
  const s = summarizeCancellationEvents(sample(), NOW);
  assert.equal(s.funnel.reachedReason, 12); // was 8
  // reachedOffer: events 1-7 (7) + 9,10,11,12 (4) have offers shown & not pastDue;
  // event 8 pastDue excluded. = 11 (was 7).
  assert.equal(s.funnel.reachedOffer, 11);
  // accepted: saved events 1,2,3,4,8,9,10,11,12 = 9 (was 5)
  assert.equal(s.funnel.accepted, 9);
  // cancelled: event 5
  assert.equal(s.funnel.cancelled, 1);
  // abandoned: event 6 (old in_progress); event 7 recent is NOT abandoned
  assert.equal(s.funnel.abandoned, 1);
}

function testSaveRate() {
  const s = summarizeCancellationEvents(sample(), NOW);
  // accepted 9 / (9 + 1 + 1) = 9/11 (was 5/7)
  assert.equal(s.saveRate, 9 / 11);
  assert.equal(s.saveRatePct, 81.8); // round(9/11*100,1) = 81.818 → 81.8 (was 71.4)
}

function testByOfferAccepted() {
  const s = summarizeCancellationEvents(sample(), NOW);
  assert.equal(s.byOfferAccepted.discount_50_2mo, 3); // events 1,9,10 (was 1)
  assert.equal(s.byOfferAccepted.pause_30d, 3); // events 2,11,12 (was 1)
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
  // retained matured: event 1, event 8, event 11 = 3 (was 2)
  assert.equal(s.retention90.retained, 3);
  // churned matured: event 2, event 9 = 2 (was 1)
  assert.equal(s.retention90.churned, 2);
  // pending: event 3 (not matured), event 4 (retention90 null),
  // event 10 (not matured), event 12 (not matured) = 4 (was 2)
  assert.equal(s.retention90.pending, 4);
  // total saved == accepted == 9 (was 5)
  assert.equal(
    s.retention90.retained + s.retention90.churned + s.retention90.pending,
    s.funnel.accepted
  );
}

function testRetention90ByOffer() {
  const s = summarizeCancellationEvents(sample(), NOW);

  // discount_50_2mo: event 1 (matured retained), event 9 (matured churned),
  // event 10 (not matured → pending). All three states present.
  assert.deepEqual(s.retention90ByOffer.discount_50_2mo, {
    retained: 1,
    churned: 1,
    pending: 1,
  });

  // pause_30d: event 11 (matured retained), event 2 (matured churned),
  // event 12 (not matured → pending). All three states present.
  assert.deepEqual(s.retention90ByOffer.pause_30d, {
    retained: 1,
    churned: 1,
    pending: 1,
  });

  // bonus_entries_100: event 3 only (not matured) → pending.
  assert.deepEqual(s.retention90ByOffer.bonus_entries_100, {
    retained: 0,
    churned: 0,
    pending: 1,
  });

  // tier_downgrade: event 4 only (retention90 null, matured savedAt) → pending.
  assert.deepEqual(s.retention90ByOffer.tier_downgrade, {
    retained: 0,
    churned: 0,
    pending: 1,
  });

  // unsubscribe_marketing: event 8 only (past-due, matured retained). Past-due
  // saved events still contribute to the per-offer retention split (only the
  // offer-conversion funnel excludes past-due).
  assert.deepEqual(s.retention90ByOffer.unsubscribe_marketing, {
    retained: 1,
    churned: 0,
    pending: 0,
  });

  // joined_for_giveaway has no offer; every OfferType key is still present.
  // The per-offer totals must reconcile with the overall split (only saved
  // events with an offerAccepted contribute — every sample saved event has one).
  let r = 0;
  let c = 0;
  let p = 0;
  for (const split of Object.values(s.retention90ByOffer)) {
    r += split.retained;
    c += split.churned;
    p += split.pending;
  }
  assert.equal(r, s.retention90.retained);
  assert.equal(c, s.retention90.churned);
  assert.equal(p, s.retention90.pending);
}

function testRetention90ByOfferEmptyGuard() {
  const s = summarizeCancellationEvents([], NOW);
  // Every OfferType key present and zeroed (no divide-by-zero / undefined).
  for (const split of Object.values(s.retention90ByOffer)) {
    assert.deepEqual(split, { retained: 0, churned: 0, pending: 0 });
  }
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
  testRetention90ByOffer();
  testRetention90ByOfferEmptyGuard();
  testSaveRateAllAccepted();
  console.log("cancellationFlowAnalytics tests passed");
}

run();
