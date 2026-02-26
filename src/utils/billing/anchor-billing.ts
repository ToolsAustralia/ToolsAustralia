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
export const BILLING_ANCHOR_RULE_VERSION = 1;

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
