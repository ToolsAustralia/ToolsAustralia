/**
 * Billing anchor rules for subscriptions.
 *
 * Business reason: Major draw period is 28th–27th. Anchoring users who join on
 * the 25th, 26th, or 27th to renew on the 24th gives at least 3 days to resolve
 * failed renewals before the draw.
 *
 * This anchor rule applies only to direct subscriptions created via
 * stripe.subscriptions.create(), not to subscriptions created or managed via
 * Subscription Schedules.
 *
 * We use trial_end + proration_behavior: none so renewal anchors to the 24th
 * (AEST). Callers add add_invoice_items with full package price so users pay
 * immediately at signup rather than waiting until the 24th.
 */

import { formatInTimeZone } from "date-fns-tz";
import { createAESTDateAsUTC } from "@/utils/common/timezone";

const AEST_TIMEZONE = "Australia/Sydney";

/** Day of month on which anchored subscriptions renew (24th). */
export const ANCHOR_DAY_OF_MONTH = 24;

/** Calendar days of month that trigger anchor-to-24th (25, 26, 27). */
export const ANCHOR_JOIN_DAYS = [25, 26, 27] as const;

/** Version for audits and support; bump when the rule or params change. */
export const BILLING_ANCHOR_RULE_VERSION = 2;

/**
 * Returns the calendar day of the month in AEST for a given date.
 * Never use new Date().getDate() (UTC) for billing logic — use this helper
 * so midnight and DST edges are consistent with MajorDraw/user-facing logic.
 */
export function getCalendarDayInAEST(date: Date): number {
  const dayStr = formatInTimeZone(date, AEST_TIMEZONE, "d");
  return parseInt(dayStr, 10);
}

/**
 * Returns true if the join date (in AEST) is 25, 26, or 27, so we should
 * anchor this subscription to renew on the 24th.
 */
export function isJoinDateAnchoredTo24(joinDate: Date): boolean {
  const day = getCalendarDayInAEST(joinDate);
  return (ANCHOR_JOIN_DAYS as readonly number[]).includes(day);
}

/**
 * Returns Unix timestamp (seconds) for the next occurrence of the anchor day
 * (24th) in AEST at or after referenceDate. Used for migration scripts that
 * update existing subscriptions (e.g. trial_end).
 *
 * - If referenceDate is before the 24th (AEST): returns the 24th of the same month.
 * - If referenceDate is on or after the 24th (AEST): returns the 24th of the
 *   following month (year rollover handled). So the result is always in the
 *   future when run on or after the 24th, never the current month's 24th in the past.
 *
 * Stripe handles short months when using billing_cycle_anchor_config; this
 * is for explicit timestamp use cases (e.g. trial_end).
 */
export function getNextAnchorTimestamp(referenceDate: Date): number {
  const year = parseInt(formatInTimeZone(referenceDate, AEST_TIMEZONE, "yyyy"), 10);
  const month = parseInt(formatInTimeZone(referenceDate, AEST_TIMEZONE, "M"), 10);
  const day = parseInt(formatInTimeZone(referenceDate, AEST_TIMEZONE, "d"), 10);

  let anchorYear = year;
  let anchorMonth = month;
  if (day >= ANCHOR_DAY_OF_MONTH) {
    anchorMonth += 1;
    if (anchorMonth > 12) {
      anchorMonth = 1;
      anchorYear += 1;
    }
  }
  const anchorMidnightAEST = createAESTDateAsUTC(anchorYear, anchorMonth, ANCHOR_DAY_OF_MONTH, 0, 0);
  return Math.floor(anchorMidnightAEST.getTime() / 1000);
}

/**
 * Returns Stripe subscription create params when the join date qualifies for
 * anchor-to-24th (25th, 26th, or 27th in AEST). Otherwise returns {}.
 * Uses trial_end (AEST-based) so renewal displays correctly as the 24th.
 * Callers must add add_invoice_items with full package price for immediate charge.
 */
export function getSubscriptionCreateParamsForAnchor(joinDate: Date): Record<string, unknown> {
  if (!isJoinDateAnchoredTo24(joinDate)) {
    return {};
  }
  return {
    trial_end: getNextAnchorTimestamp(new Date()),
    proration_behavior: "none",
    metadata: { billing_anchor_rule: "join_25_27_to_24" },
  };
}

/** Leap-safe number of days in a 1-12 month (UTC). The single canonical days-in-month helper. */
export function daysInMonthUTC(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/**
 * Clamp a recovery-landing day to the anchor window: AEST 25/26/27 -> 24, else the day itself.
 * Only ever lowers or keeps the day, never raises it.
 */
export function clampReanchorDay(date: Date): number {
  const day = getCalendarDayInAEST(date);
  return (ANCHOR_JOIN_DAYS as readonly number[]).includes(day) ? ANCHOR_DAY_OF_MONTH : day;
}

/**
 * Unix seconds (for Stripe `trial_end`) of the clamped recovery day at midnight AEST, at the NEXT
 * occurrence STRICTLY AFTER recoveryDate (instant comparison, not day-integer). Short months use the
 * last day (e.g. kept 31 -> Feb 28/29). `createAESTDateAsUTC` does NOT clamp overflow days (returns
 * Invalid Date), so the Math.min(clampedDay, lastDay) step is mandatory. Throws on invalid input;
 * the caller aborts the reanchor non-fatally.
 */
export function getReanchorTrialEndTimestamp(recoveryDate: Date): number {
  if (!Number.isFinite(recoveryDate.getTime()) || recoveryDate.getTime() <= 0) {
    throw new Error("getReanchorTrialEndTimestamp: invalid recoveryDate");
  }
  const recoveryUnix = Math.floor(recoveryDate.getTime() / 1000);
  const clampedDay = clampReanchorDay(recoveryDate);
  let year = parseInt(formatInTimeZone(recoveryDate, AEST_TIMEZONE, "yyyy"), 10);
  let month = parseInt(formatInTimeZone(recoveryDate, AEST_TIMEZONE, "M"), 10); // 1-12

  const build = (y: number, m: number): Date => {
    const billDay = Math.min(clampedDay, daysInMonthUTC(y, m));
    const dt = createAESTDateAsUTC(y, m, billDay, 0, 0);
    if (Number.isNaN(dt.getTime())) {
      throw new Error(`getReanchorTrialEndTimestamp: invalid date ${y}-${m}-${billDay}`);
    }
    return dt;
  };

  let candidate = build(year, month);
  while (Math.floor(candidate.getTime() / 1000) <= recoveryUnix) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    candidate = build(year, month);
  }
  return Math.floor(candidate.getTime() / 1000);
}
