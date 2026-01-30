/**
 * Unit tests for anchor-billing module.
 * Run with: npx tsx src/utils/billing/__tests__/anchor-billing.test.ts
 */

import { createAESTDateAsUTC } from "../../common/timezone";
import {
  ANCHOR_DAY_OF_MONTH,
  ANCHOR_JOIN_DAYS,
  BILLING_ANCHOR_RULE_VERSION,
  getCalendarDayInAEST,
  getNextAnchorTimestamp,
  getSubscriptionCreateParamsForAnchor,
  isJoinDateAnchoredTo24,
} from "../anchor-billing";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function runTests(): void {
  // --- Constants ---
  assertEqual(ANCHOR_DAY_OF_MONTH, 24, "ANCHOR_DAY_OF_MONTH");
  assert(ANCHOR_JOIN_DAYS.includes(25) && ANCHOR_JOIN_DAYS.includes(26) && ANCHOR_JOIN_DAYS.includes(27), "ANCHOR_JOIN_DAYS");
  assertEqual(BILLING_ANCHOR_RULE_VERSION, 1, "BILLING_ANCHOR_RULE_VERSION");

  // --- getCalendarDayInAEST: use noon AEST to avoid midnight edges ---
  assertEqual(getCalendarDayInAEST(createAESTDateAsUTC(2025, 1, 24, 12, 0)), 24, "day 24");
  assertEqual(getCalendarDayInAEST(createAESTDateAsUTC(2025, 1, 25, 12, 0)), 25, "day 25");
  assertEqual(getCalendarDayInAEST(createAESTDateAsUTC(2025, 1, 26, 12, 0)), 26, "day 26");
  assertEqual(getCalendarDayInAEST(createAESTDateAsUTC(2025, 1, 27, 12, 0)), 27, "day 27");
  assertEqual(getCalendarDayInAEST(createAESTDateAsUTC(2025, 1, 28, 12, 0)), 28, "day 28");

  // --- isJoinDateAnchoredTo24: 24 and 28 false, 25–27 true ---
  assert(!isJoinDateAnchoredTo24(createAESTDateAsUTC(2025, 1, 24, 12, 0)), "24th should not anchor");
  assert(isJoinDateAnchoredTo24(createAESTDateAsUTC(2025, 1, 25, 12, 0)), "25th should anchor");
  assert(isJoinDateAnchoredTo24(createAESTDateAsUTC(2025, 1, 26, 12, 0)), "26th should anchor");
  assert(isJoinDateAnchoredTo24(createAESTDateAsUTC(2025, 1, 27, 12, 0)), "27th should anchor");
  assert(!isJoinDateAnchoredTo24(createAESTDateAsUTC(2025, 1, 28, 12, 0)), "28th should not anchor");

  // --- getNextAnchorTimestamp: Jan 31 → Feb 24 (next month); Feb 27 → Mar 24 (next month) ---
  const jan31AEST = createAESTDateAsUTC(2025, 1, 31, 12, 0);
  const feb24AEST = createAESTDateAsUTC(2025, 2, 24, 0, 0);
  const nextAnchorJan31 = getNextAnchorTimestamp(jan31AEST);
  assertEqual(nextAnchorJan31, Math.floor(feb24AEST.getTime() / 1000), "Jan 31 → next anchor Feb 24");

  const feb27AEST = createAESTDateAsUTC(2025, 2, 27, 12, 0);
  const mar24AEST = createAESTDateAsUTC(2025, 3, 24, 0, 0);
  const nextAnchorFeb27 = getNextAnchorTimestamp(feb27AEST);
  assertEqual(nextAnchorFeb27, Math.floor(mar24AEST.getTime() / 1000), "Feb 27 → next anchor Mar 24");

  // Normal case: Jan 15 → next anchor Jan 24 (same month)
  const jan15AEST = createAESTDateAsUTC(2025, 1, 15, 12, 0);
  const jan24AEST = createAESTDateAsUTC(2025, 1, 24, 0, 0);
  const nextAnchorJan15 = getNextAnchorTimestamp(jan15AEST);
  assertEqual(nextAnchorJan15, Math.floor(jan24AEST.getTime() / 1000), "Jan 15 → next anchor Jan 24");

  // On the 24th we get next month's 24th (never current month's 24th in the past)
  const jan24NoonAEST = createAESTDateAsUTC(2025, 1, 24, 12, 0);
  const nextAnchorJan24 = getNextAnchorTimestamp(jan24NoonAEST);
  assertEqual(nextAnchorJan24, Math.floor(createAESTDateAsUTC(2025, 2, 24, 0, 0).getTime() / 1000), "Jan 24 → next anchor Feb 24");

  // --- getSubscriptionCreateParamsForAnchor: non-empty only on 25–27 ---
  const params24 = getSubscriptionCreateParamsForAnchor(createAESTDateAsUTC(2025, 1, 24, 12, 0));
  assert(Object.keys(params24).length === 0, "24th should return empty params");

  const params25 = getSubscriptionCreateParamsForAnchor(createAESTDateAsUTC(2025, 1, 25, 12, 0));
  assert(Object.keys(params25).length > 0, "25th should return anchor params");
  assert("billing_cycle_anchor_config" in params25, "params should include billing_cycle_anchor_config");
  assert(
    (params25.billing_cycle_anchor_config as { day_of_month: number })?.day_of_month === 24,
    "day_of_month should be 24"
  );
  assert(!("billing_cycle_anchor" in params25), "should not set billing_cycle_anchor when using config");

  const params27 = getSubscriptionCreateParamsForAnchor(createAESTDateAsUTC(2025, 1, 27, 12, 0));
  assert(Object.keys(params27).length > 0, "27th should return anchor params");

  const params28 = getSubscriptionCreateParamsForAnchor(createAESTDateAsUTC(2025, 1, 28, 12, 0));
  assert(Object.keys(params28).length === 0, "28th should return empty params");

  console.log("All anchor-billing tests passed.");
}

runTests();
