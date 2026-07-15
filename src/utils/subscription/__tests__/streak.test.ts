/**
 * Membership Streak — pure decision logic tests.
 * Run: npm run test:streak  (tsx src/utils/subscription/__tests__/streak.test.ts)
 * Spec: docs/superpowers/specs/2026-07-07-membership-streak-design.md
 */
import assert from "node:assert";
import {
  RESUBSCRIBE_GRACE_DAYS,
  isFirstTimePaidCycle,
  decideStreakOnSubscriptionCreate,
  computeStreakFromHistory,
  carryStreakAcrossSubscriptionReplace,
} from "../streak";

const NOW = new Date("2026-08-10T00:00:00Z");
const days = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
let passed = 0;
function t(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✅ ${name}`);
}

console.log("\n— isFirstTimePaidCycle (renewal increment gate) —");
t("no pre-image row → first paid", () => assert.equal(isFirstTimePaidCycle(null), true));
t("undefined pre-image → first paid", () => assert.equal(isFirstTimePaidCycle(undefined), true));
t("expected → first paid", () => assert.equal(isFirstTimePaidCycle("expected"), true));
t("failed → first paid (past-due recovery increments, late)", () =>
  assert.equal(isFirstTimePaidCycle("failed"), true));
t("succeeded → replay, no increment", () => assert.equal(isFirstTimePaidCycle("succeeded"), false));
t("recovered → replay, no increment", () => assert.equal(isFirstTimePaidCycle("recovered"), false));

console.log("\n— decideStreakOnSubscriptionCreate (start/continue/reset) —");
const base = {
  billingReason: "subscription_create" as string | null | undefined,
  isUpgrade: false,
  isResubscribe: false,
  previousEndDate: null as Date | null,
  currentStreakMonths: 0,
  currentStreakGeneration: 1,
  now: NOW,
};
t("renewal invoice → none (handled by cycle writer)", () =>
  assert.equal(
    decideStreakOnSubscriptionCreate({ ...base, billingReason: "subscription_cycle" }).action,
    "none"
  ));
t("upgrade (Mode B new-sub) → none — streak untouched", () =>
  assert.equal(decideStreakOnSubscriptionCreate({ ...base, isUpgrade: true }).action, "none"));
t("fresh join → start at 0, generation kept", () => {
  const d = decideStreakOnSubscriptionCreate(base);
  assert.equal(d.action, "start");
  if (d.action === "start") {
    assert.equal(d.streakMonths, 0);
    assert.equal(d.streakGeneration, 1);
  }
});
t("resubscribe within 30-day grace → continue (counter preserved)", () => {
  const d = decideStreakOnSubscriptionCreate({
    ...base,
    isResubscribe: true,
    previousEndDate: days(29),
    currentStreakMonths: 7,
  });
  assert.equal(d.action, "continue");
});
t("resubscribe exactly at grace boundary → continue", () => {
  const d = decideStreakOnSubscriptionCreate({
    ...base,
    isResubscribe: true,
    previousEndDate: days(RESUBSCRIBE_GRACE_DAYS),
    currentStreakMonths: 7,
  });
  assert.equal(d.action, "continue");
});
t("resubscribe past grace with prior streak → reset + generation bump", () => {
  const d = decideStreakOnSubscriptionCreate({
    ...base,
    isResubscribe: true,
    previousEndDate: days(31),
    currentStreakMonths: 7,
    currentStreakGeneration: 2,
  });
  assert.equal(d.action, "start");
  if (d.action === "start") assert.equal(d.streakGeneration, 3);
});
t("resubscribe past grace, prior streak 0 → start, generation kept (no issuances to collide)", () => {
  const d = decideStreakOnSubscriptionCreate({
    ...base,
    isResubscribe: true,
    previousEndDate: days(90),
    currentStreakMonths: 0,
  });
  assert.equal(d.action, "start");
  if (d.action === "start") assert.equal(d.streakGeneration, 1);
});
t("resubscribe with NO endDate on record → reset (conservative) + bump when prior streak", () => {
  const d = decideStreakOnSubscriptionCreate({
    ...base,
    isResubscribe: true,
    previousEndDate: null,
    currentStreakMonths: 4,
  });
  assert.equal(d.action, "start");
  if (d.action === "start") assert.equal(d.streakGeneration, 2);
});

console.log("\n— computeStreakFromHistory (backfill walker) —");
const d = (s: string) => new Date(s);

t("continuous 5 cycles → streak 5, gen 1", () => {
  const r = computeStreakFromHistory({
    joinDate: d("2026-01-10"), coverageStart: d("2025-01-01"),
    cycles: ["2026-02-10", "2026-03-10", "2026-04-10", "2026-05-10", "2026-06-10"].map((x) => ({ dueAt: d(x) })),
    cancelDates: [], isCurrentlyActive: true, now: d("2026-06-20"),
  });
  assert.equal(r.streakMonths, 5);
  assert.equal(r.streakGeneration, 1);
  assert.equal(r.confidence, "ledger-complete");
});
t("66-day gap WITH intervening cancel → generation break, count restarts at 1", () => {
  const r = computeStreakFromHistory({
    joinDate: d("2026-01-10"), coverageStart: d("2025-01-01"),
    cycles: [{ dueAt: d("2026-02-10") }, { dueAt: d("2026-03-10") }, { dueAt: d("2026-05-15") }],
    cancelDates: [d("2026-03-20")], isCurrentlyActive: true, now: d("2026-05-20"),
  });
  assert.equal(r.streakMonths, 1);
  assert.equal(r.streakGeneration, 2);
  assert.equal(r.breaks, 1);
});
t("66-day gap WITHOUT cancel (recovery/pause lag) → continues, missed months don't count", () => {
  const r = computeStreakFromHistory({
    joinDate: d("2026-01-10"), coverageStart: d("2025-01-01"),
    cycles: [{ dueAt: d("2026-02-10") }, { dueAt: d("2026-03-10") }, { dueAt: d("2026-05-15") }],
    cancelDates: [], isCurrentlyActive: true, now: d("2026-05-20"),
  });
  assert.equal(r.streakMonths, 3);
  assert.equal(r.streakGeneration, 1);
});
t("scheduled-cancel CLICK before the last paid dueAt (lookback) still counts as break evidence", () => {
  // Member clicks cancel on Mar 1 (scheduled_cancel row), last paid period ends Mar 10,
  // lapses, resubscribes late — next ledger row (new sub's first renewal) Jun 20.
  const r = computeStreakFromHistory({
    joinDate: d("2026-01-10"), coverageStart: d("2025-01-01"),
    cycles: [{ dueAt: d("2026-02-10") }, { dueAt: d("2026-03-10") }, { dueAt: d("2026-06-20") }],
    cancelDates: [d("2026-03-01")], isCurrentlyActive: true, now: d("2026-06-25"),
  });
  assert.equal(r.streakMonths, 1);
  assert.equal(r.streakGeneration, 2);
  assert.equal(r.breaks, 1);
});
t("60-day gap WITH cancel evidence → NOT a break (in-grace return is still possible)", () => {
  // Scheduled cancel + came back within the 30-day grace: gap ≈ grace + one cycle ≈ 60d.
  const r = computeStreakFromHistory({
    joinDate: d("2026-01-10"), coverageStart: d("2025-01-01"),
    cycles: [{ dueAt: d("2026-02-10") }, { dueAt: d("2026-03-10") }, { dueAt: d("2026-05-09") }],
    cancelDates: [d("2026-03-05")], isCurrentlyActive: true, now: d("2026-05-15"),
  });
  assert.equal(r.streakMonths, 3);
  assert.equal(r.streakGeneration, 1);
  assert.equal(r.breaks, 0);
});
t("two cycles in one calendar month (reanchor) both count", () => {
  const r = computeStreakFromHistory({
    joinDate: d("2026-01-10"), coverageStart: d("2025-01-01"),
    cycles: [{ dueAt: d("2026-02-10") }, { dueAt: d("2026-03-02") }, { dueAt: d("2026-03-24") }],
    cancelDates: [], isCurrentlyActive: true, now: d("2026-03-28"),
  });
  assert.equal(r.streakMonths, 3);
});
t("cancel within grace of next cycle does NOT break", () => {
  const r = computeStreakFromHistory({
    joinDate: d("2026-01-10"), coverageStart: d("2025-01-01"),
    cycles: [{ dueAt: d("2026-02-10") }, { dueAt: d("2026-03-08") }],
    cancelDates: [d("2026-02-20")], isCurrentlyActive: true, now: d("2026-03-15"),
  });
  assert.equal(r.streakMonths, 2);
  assert.equal(r.streakGeneration, 1);
});
t("history-incomplete + active + no breaks → rounds UP to whole months since join", () => {
  const r = computeStreakFromHistory({
    joinDate: d("2025-09-10"), coverageStart: d("2026-04-29"),
    cycles: [{ dueAt: d("2026-05-10") }, { dueAt: d("2026-06-10") }],
    cancelDates: [], isCurrentlyActive: true, now: d("2026-06-20"),
  });
  assert.equal(r.confidence, "history-incomplete");
  assert.equal(r.streakMonths, 9);
});
t("history-incomplete but a break was detected → walked value only (no round-up across a break)", () => {
  const r = computeStreakFromHistory({
    joinDate: d("2025-09-10"), coverageStart: d("2026-04-29"),
    cycles: [{ dueAt: d("2026-05-10") }, { dueAt: d("2026-08-20") }],
    cancelDates: [d("2026-05-25")], isCurrentlyActive: true, now: d("2026-08-25"),
  });
  assert.equal(r.streakMonths, 1);
  assert.equal(r.streakGeneration, 2);
});
t("no cycles at all, active member joined mid-coverage → streak 0 (month 0)", () => {
  const r = computeStreakFromHistory({
    joinDate: d("2026-06-25"), coverageStart: d("2025-01-01"),
    cycles: [], cancelDates: [], isCurrentlyActive: true, now: d("2026-07-07"),
  });
  assert.equal(r.streakMonths, 0);
  assert.equal(r.confidence, "ledger-complete");
});
t("REPAIR mode (roundUpIncomplete:false) → walked value only, no calendar credit", () => {
  const r = computeStreakFromHistory({
    joinDate: d("2025-09-10"), coverageStart: d("2026-04-29"),
    cycles: [{ dueAt: d("2026-05-10") }, { dueAt: d("2026-06-10") }],
    cancelDates: [], isCurrentlyActive: true, now: d("2026-06-20"),
    roundUpIncomplete: false,
  });
  assert.equal(r.confidence, "history-incomplete");
  assert.equal(r.streakMonths, 2); // NOT 9 — repair runs never credit unwalked months
});

console.log("\n— carryStreakAcrossSubscriptionReplace (API subdoc replacement) —");
t("no prior subscription → fresh defaults (0, gen 1)", () => {
  const c = carryStreakAcrossSubscriptionReplace(null, NOW);
  assert.equal(c.streakMonths, 0);
  assert.equal(c.streakGeneration, 1);
});
t("prior subscription still ACTIVE → carry untouched (upgrade-style replacement)", () => {
  const c = carryStreakAcrossSubscriptionReplace(
    { isActive: true, endDate: days(-20), streakMonths: 7, streakGeneration: 2, lastStreakStartInvoiceId: "in_x" },
    NOW
  );
  assert.deepEqual(c, { streakMonths: 7, streakGeneration: 2, lastStreakStartInvoiceId: "in_x" });
});
t("inactive, resubscribe WITHIN grace → carry untouched (streak continues)", () => {
  const c = carryStreakAcrossSubscriptionReplace(
    { isActive: false, endDate: days(RESUBSCRIBE_GRACE_DAYS - 5), streakMonths: 7, streakGeneration: 1 },
    NOW
  );
  assert.equal(c.streakMonths, 7);
  assert.equal(c.streakGeneration, 1);
});
t("inactive, resubscribe PAST grace with prior streak → reset 0 + generation bump", () => {
  const c = carryStreakAcrossSubscriptionReplace(
    { isActive: false, endDate: days(RESUBSCRIBE_GRACE_DAYS + 40), streakMonths: 7, streakGeneration: 1 },
    NOW
  );
  assert.equal(c.streakMonths, 0);
  assert.equal(c.streakGeneration, 2);
});
t("inactive, past grace, prior streak 0 → start, generation kept", () => {
  const c = carryStreakAcrossSubscriptionReplace(
    { isActive: false, endDate: days(120), streakMonths: 0, streakGeneration: 1 },
    NOW
  );
  assert.equal(c.streakMonths, 0);
  assert.equal(c.streakGeneration, 1);
});
t("inactive, NO endDate on record → conservative reset + bump when prior streak", () => {
  const c = carryStreakAcrossSubscriptionReplace(
    { isActive: false, endDate: null, streakMonths: 3, streakGeneration: 1 },
    NOW
  );
  assert.equal(c.streakMonths, 0);
  assert.equal(c.streakGeneration, 2);
});
t("missing streak fields on a legacy subdoc → treated as 0/gen 1", () => {
  const c = carryStreakAcrossSubscriptionReplace({ isActive: false, endDate: days(10) }, NOW);
  assert.equal(c.streakMonths, 0);
  assert.equal(c.streakGeneration, 1);
});

console.log(`\n${passed} streak tests passed`);
