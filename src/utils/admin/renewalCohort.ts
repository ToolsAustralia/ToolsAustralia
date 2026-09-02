import type { RenewalCohort } from "@/types/admin/membershipAnalytics";

/** Cycle statuses that mean the money arrived. `recovered` is a permitted enum value that is
 *  currently unobserved in production, but a recovered cycle is a landed one. */
const LANDED_STATUSES = new Set(["succeeded", "recovered"]);
const FAILED_STATUSES = new Set(["failed"]);

const clampCount = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);

/**
 * Shape raw per-status cycle counts plus a forward-schedule count into the display-ready cohort.
 *
 * `statusCounts` is keyed by `MembershipRenewalCycle.status` and may contain keys this function
 * does not recognise. Unrecognised statuses are counted in `dueInRange` and in NEITHER numerator —
 * that is the point: a status nobody has handled yet shows up as an unexplained slice of the bar
 * instead of quietly shrinking the day's total. Summing the numerators to get the denominator
 * instead would make a refunded renewal disappear from the day entirely.
 */
export function summarizeRenewalCohort(input: {
  statusCounts: Record<string, number>;
  pendingInRange: number;
  isOpen: boolean;
}): RenewalCohort {
  let cyclesDue = 0;
  let landedInRange = 0;
  let failedInRange = 0;

  for (const [status, rawCount] of Object.entries(input.statusCounts)) {
    const count = clampCount(rawCount);
    cyclesDue += count;
    if (LANDED_STATUSES.has(status)) landedInRange += count;
    else if (FAILED_STATUSES.has(status)) failedInRange += count;
  }

  const pendingInRange = clampCount(input.pendingInRange);
  const attempted = landedInRange + failedInRange;

  return {
    dueInRange: cyclesDue + pendingInRange,
    landedInRange,
    failedInRange,
    pendingInRange,
    isOpen: input.isOpen,
    collectionRate: attempted > 0 ? Math.round((landedInRange / attempted) * 1000) / 10 : null,
  };
}
