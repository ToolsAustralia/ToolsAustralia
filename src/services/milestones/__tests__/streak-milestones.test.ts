/**
 * Membership Streak P2 — milestone engine decision tests (pure, no Mongo).
 * Run: npm run test:streak-milestones
 * Spec: docs/superpowers/specs/2026-07-07-membership-streak-design.md §6
 */
import assert from "node:assert";
import { resolveMetricValue, computeCycles } from "../MilestoneService";
import type { UserMilestoneMetrics } from "../MilestoneEvaluator";

let passed = 0;
function t(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✅ ${name}`);
}

const METRICS: UserMilestoneMetrics = {
  spendAmount: 500,
  entriesGained: 1200,
  loyaltyDays: 400,
  streakMonths: 7,
  streakGeneration: 2,
  hasActiveSubscription: true,
};

console.log("\n— resolveMetricValue (explicit mapping, no fallthrough) —");
t("spend-amount → spendAmount", () => assert.equal(resolveMetricValue("spend-amount", METRICS), 500));
t("entries-gained → entriesGained", () => assert.equal(resolveMetricValue("entries-gained", METRICS), 1200));
t("loyalty-days → loyaltyDays", () => assert.equal(resolveMetricValue("loyalty-days", METRICS), 400));
t("streak-months → streakMonths (NEVER the loyalty-days fallthrough)", () => {
  assert.equal(resolveMetricValue("streak-months", METRICS), 7);
  assert.notEqual(resolveMetricValue("streak-months", METRICS), METRICS.loyaltyDays);
});

console.log("\n— computeCycles (rung firing math) —");
const nonRecurring = { isRecurring: false, threshold: 6 };
const legacyRecurring12 = { isRecurring: true, threshold: 12 }; // no period → legacy floor()
const annualRung2 = { isRecurring: true, threshold: 2, recurrencePeriod: 12 };
const annualRung12 = { isRecurring: true, threshold: 12, recurrencePeriod: 12 };
t("below threshold → 0 cycles (rung does not fire)", () => assert.equal(computeCycles(nonRecurring, 5), 0));
t("at threshold, non-recurring → exactly 1", () => assert.equal(computeCycles(nonRecurring, 6), 1));
t("far past threshold, non-recurring → still 1 (fires once)", () => assert.equal(computeCycles(nonRecurring, 60), 1));
t("LEGACY recurring (no period) at 24 → floor(24/12) = 2 (spend/entries rewards unchanged)", () =>
  assert.equal(computeCycles(legacyRecurring12, 24), 2));
t("annual rung 2 at streak 2 → cycle 1", () => assert.equal(computeCycles(annualRung2, 2), 1));
t("annual rung 2 at streak 4 → STILL 1 (repeats yearly, not every 2 renewals)", () =>
  assert.equal(computeCycles(annualRung2, 4), 1));
t("annual rung 2 at streak 13 → still 1", () => assert.equal(computeCycles(annualRung2, 13), 1));
t("annual rung 2 at streak 14 → cycle 2 (month 14 ≡ month 2 — the year-2 repeat)", () =>
  assert.equal(computeCycles(annualRung2, 14), 2));
t("annual rung 2 at streak 26 → cycle 3", () => assert.equal(computeCycles(annualRung2, 26), 3));
t("annual rung 12 at 12 → 1 (Founding), at 24 → 2, at 36 → 3", () => {
  assert.equal(computeCycles(annualRung12, 12), 1);
  assert.equal(computeCycles(annualRung12, 24), 2);
  assert.equal(computeCycles(annualRung12, 36), 3);
});
t("annual rung below threshold → 0", () => assert.equal(computeCycles(annualRung12, 11), 0));

console.log("\n— ladder integration sanity (annual-repeat ladder, owner-locked) —");
const LADDER = [
  { threshold: 2, amt: 100, isRecurring: true, recurrencePeriod: 12 },
  { threshold: 4, amt: 200, isRecurring: true, recurrencePeriod: 12 },
  { threshold: 6, amt: 300, isRecurring: true, recurrencePeriod: 12 },
  { threshold: 8, amt: 400, isRecurring: true, recurrencePeriod: 12 },
  { threshold: 10, amt: 500, isRecurring: true, recurrencePeriod: 12 },
  { threshold: 12, amt: 600, isRecurring: true, recurrencePeriod: 12 },
];
function totalGrantedAt(streak: number): number {
  return LADDER.reduce((sum, rung) => sum + computeCycles(rung, streak) * rung.amt, 0);
}
t("streak 1 → nothing", () => assert.equal(totalGrantedAt(1), 0));
t("streak 2 → +100", () => assert.equal(totalGrantedAt(2), 100));
t("streak 7 → 100+200+300 = 600", () => assert.equal(totalGrantedAt(7), 600));
t("streak 12 → full first-year ladder = 2,100", () => assert.equal(totalGrantedAt(12), 2100));
t("streak 14 → year-2 +100 landed = 2,200 cumulative", () => assert.equal(totalGrantedAt(14), 2200));
t("streak 24 → two full ladders = 4,200 cumulative", () => assert.equal(totalGrantedAt(24), 4200));
t("streak 36 → three full ladders = 6,300 cumulative", () => assert.equal(totalGrantedAt(36), 6300));

console.log(`\n${passed} streak-milestone tests passed`);
