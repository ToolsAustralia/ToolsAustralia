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
const recurring12 = { isRecurring: true, threshold: 12 };
t("below threshold → 0 cycles (rung does not fire)", () => assert.equal(computeCycles(nonRecurring, 5), 0));
t("at threshold, non-recurring → exactly 1", () => assert.equal(computeCycles(nonRecurring, 6), 1));
t("far past threshold, non-recurring → still 1 (fires once)", () => assert.equal(computeCycles(nonRecurring, 60), 1));
t("recurring at 12 → cycle 1 (the Founding rung)", () => assert.equal(computeCycles(recurring12, 12), 1));
t("recurring at 23 → still 1 (anniversary not yet reached)", () => assert.equal(computeCycles(recurring12, 23), 1));
t("recurring at 24 → 2 (first anniversary)", () => assert.equal(computeCycles(recurring12, 24), 2));
t("recurring at 36 → 3", () => assert.equal(computeCycles(recurring12, 36), 3));
t("recurring below threshold → 0", () => assert.equal(computeCycles(recurring12, 11), 0));

console.log("\n— ladder integration sanity (spec ladder × the two helpers) —");
const LADDER = [
  { threshold: 2, amt: 100, isRecurring: false },
  { threshold: 4, amt: 200, isRecurring: false },
  { threshold: 6, amt: 300, isRecurring: false },
  { threshold: 8, amt: 400, isRecurring: false },
  { threshold: 10, amt: 500, isRecurring: false },
  { threshold: 12, amt: 600, isRecurring: true },
];
function totalGrantedAt(streak: number): number {
  return LADDER.reduce((sum, rung) => sum + computeCycles(rung, streak) * rung.amt, 0);
}
t("streak 1 → nothing", () => assert.equal(totalGrantedAt(1), 0));
t("streak 2 → +100", () => assert.equal(totalGrantedAt(2), 100));
t("streak 7 → 100+200+300 = 600", () => assert.equal(totalGrantedAt(7), 600));
t("streak 12 → full first-year ladder = 2,100", () => assert.equal(totalGrantedAt(12), 2100));
t("streak 24 → 2,100 + one +600 anniversary = 2,700", () => assert.equal(totalGrantedAt(24), 2700));

console.log(`\n${passed} streak-milestone tests passed`);
