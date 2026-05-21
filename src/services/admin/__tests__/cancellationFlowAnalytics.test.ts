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
      reasonText: "  needed to pause for a month  ", // trimmed on intake
      startedAt: new Date(NOW.getTime() - 1000),
    }),
    // 13. in_progress "other" with free text, old enough to be abandoned
    ev({
      reason: "other",
      offersShown: [],
      outcome: "in_progress",
      reasonText: "site keeps crashing",
      startedAt: TWO_HOURS_AGO,
    }),
    // 14. cancelled "other" with empty reasonText → must NOT appear in list
    ev({
      reason: "other",
      offersShown: [],
      outcome: "cancelled",
      reasonText: "   ", // whitespace-only
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
    assert.equal(r.accepted, 0);
    assert.equal(r.cancelled, 0);
    assert.equal(r.abandoned, 0);
  }
  assert.deepEqual(s.retention90, { retained: 0, churned: 0, pending: 0 });
  assert.equal(s.pastDueExcludedFromOfferConversion, 0);
  assert.deepEqual(s.otherReasonTexts, []);
}

function testTriggeredAndReasonShares() {
  const s = summarizeCancellationEvents(sample(), NOW);
  // Reason×outcome work added events 13-14 (other-reason in_progress + cancelled) → 12 → 14.
  assert.equal(s.triggered, 14);
  assert.equal(s.byReason.too_expensive.count, 2);
  assert.equal(s.byReason.too_expensive.sharePct, 14.3); // 2/14 → 14.285 → 14.3
  assert.equal(s.byReason.havent_won.count, 2);
  assert.equal(s.byReason.prefer_cheaper.count, 2);
  assert.equal(s.byReason.dont_use_benefits.count, 1);
  assert.equal(s.byReason.dont_use_benefits.sharePct, 7.1); // 1/14 → 7.142 → 7.1
  assert.equal(s.byReason.too_many_messages.count, 1);
  assert.equal(s.byReason.other.count, 6); // events 9-14
  assert.equal(s.byReason.other.sharePct, 42.9); // 6/14 → 42.857 → 42.9
  assert.equal(s.byReason.joined_for_giveaway.count, 0);
}

function testOutcomeByReason() {
  const s = summarizeCancellationEvents(sample(), NOW);
  // too_expensive: events 1, 2 saved
  assert.deepEqual(
    { a: s.byReason.too_expensive.accepted, c: s.byReason.too_expensive.cancelled, ab: s.byReason.too_expensive.abandoned },
    { a: 2, c: 0, ab: 0 }
  );
  // dont_use_benefits: event 5 cancelled
  assert.deepEqual(
    { a: s.byReason.dont_use_benefits.accepted, c: s.byReason.dont_use_benefits.cancelled, ab: s.byReason.dont_use_benefits.abandoned },
    { a: 0, c: 1, ab: 0 }
  );
  // prefer_cheaper: event 6 abandoned in_progress, event 7 recent in_progress (not abandoned)
  assert.deepEqual(
    { a: s.byReason.prefer_cheaper.accepted, c: s.byReason.prefer_cheaper.cancelled, ab: s.byReason.prefer_cheaper.abandoned },
    { a: 0, c: 0, ab: 1 }
  );
  // other: 9,10,11,12 saved + 13 abandoned in_progress + 14 cancelled
  assert.deepEqual(
    { a: s.byReason.other.accepted, c: s.byReason.other.cancelled, ab: s.byReason.other.abandoned },
    { a: 4, c: 1, ab: 1 }
  );
}

function testOtherReasonTexts() {
  const s = summarizeCancellationEvents(sample(), NOW);
  // Event 14's whitespace-only reasonText is excluded; events 12 + 13 retained.
  assert.equal(s.otherReasonTexts.length, 2);
  // Trimmed; sorted by startedAt desc (event 12 startedAt = NOW-1s, event 13 = TWO_HOURS_AGO).
  assert.equal(s.otherReasonTexts[0].text, "needed to pause for a month");
  assert.equal(s.otherReasonTexts[0].outcome, "saved");
  assert.equal(s.otherReasonTexts[1].text, "site keeps crashing");
  assert.equal(s.otherReasonTexts[1].outcome, "in_progress");
}

function testFunnel() {
  const s = summarizeCancellationEvents(sample(), NOW);
  assert.equal(s.funnel.reachedReason, 14);
  // reachedOffer: events 1-7 (7) + 9,10,11,12 (4) have offers shown & not pastDue;
  // events 8 (pastDue), 13, 14 (no offers shown) excluded. = 11.
  assert.equal(s.funnel.reachedOffer, 11);
  // accepted: events 1,2,3,4,8,9,10,11,12 = 9 (unchanged)
  assert.equal(s.funnel.accepted, 9);
  // cancelled: events 5, 14
  assert.equal(s.funnel.cancelled, 2);
  // abandoned: event 6 + event 13 (both old in_progress); event 7 still recent
  assert.equal(s.funnel.abandoned, 2);
}

function testSaveRate() {
  const s = summarizeCancellationEvents(sample(), NOW);
  // accepted 9 / (9 + 2 + 2) = 9/13
  assert.equal(s.saveRate, 9 / 13);
  assert.equal(s.saveRatePct, 69.2); // round(9/13*100,1) = 69.23 → 69.2
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
  testOutcomeByReason();
  testOtherReasonTexts();
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
