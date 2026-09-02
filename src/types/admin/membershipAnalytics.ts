/**
 * Admin membership analytics — metric definitions and API shapes.
 *
 * Semantics:
 * - renewalCohort: everything anchored to the renewals DUE in [start, end] (`dueAt`), so its
 *   numerator and denominator describe the same members. See
 *   docs/superpowers/specs/2026-09-02-admin-dashboard-ux-design.md.
 * - successfulRenewalsInRange: net membership BenefitsGranted with billingReason subscription_cycle in [start, end] (matches revenue card).
 *   A DIFFERENT cohort from renewalCohort.landedInRange — payment-time, not due-time. The two
 *   legitimately differ because Stripe finalises a renewal invoice ~1h after the cycle boundary,
 *   so a late-night renewal is charged the next day. Never divide one by the other.
 * - failedInvoiceAttemptsInRange: renewal cycles marked failed with failedAt in range. An ATTEMPT
 *   count, inflated by dunning retries (124 attempts vs 20 members due on 2026-09-02) — NOT a
 *   count of members. For members, use renewalCohort.failedInRange.
 * - becamePastDueInRange: distinct users who transitioned to past_due per MembershipStatusHistory in range.
 * - cancellationsInRange: users with subscription.cancelledAt in [start, end] (active accounts).
 * - cancelledMembershipRevenueImpact: sum of catalog membership prices for those users (MRR-style loss proxy).
 */

export type MembershipAnalyticsActor = "user" | "admin" | "stripe" | "system";

export type MembershipNormalizedStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "scheduled_cancel"
  | "incomplete"
  | "incomplete_expired"
  | "none";

/**
 * The renewals DUE in the selected range, and what became of them.
 *
 * Anchored to `MembershipRenewalCycle.dueAt` plus the live forward schedule on
 * `User.subscription.endDate`. Those two sources are disjoint by construction: a renewal that
 * lands rolls `endDate` forward a month, so a member sits in one or the other, never both.
 */
export interface RenewalCohort {
  /** Denominator: every renewal cycle due in range (ALL statuses) + those still scheduled.
   *  NOT landedInRange + failedInRange + pendingInRange — a status in neither numerator
   *  (e.g. `refunded`) stays here rather than vanishing from the day's total. */
  dueInRange: number;
  /** Cycles due in range with status `succeeded` or `recovered`. */
  landedInRange: number;
  /** Cycles due in range with status `failed`. Members, not retry attempts. */
  failedInRange: number;
  /** Active auto-renewing members scheduled in the remainder of the range; 0 once it closes. */
  pendingInRange: number;
  /** Range end is still in the future → the remainder is "to come", else "did not renew". */
  isOpen: boolean;
  /** landed / (landed + failed) as a 0–100 percentage (1 dp); null when nothing was attempted.
   *  Deliberately NOT landed/dueInRange — that only reaches 100% at day's end regardless of how
   *  collection actually went, so it reads as failure all morning. */
  collectionRate: number | null;
}

export interface MembershipRenewalMetrics {
  renewalCohort: RenewalCohort;
  successfulRenewalsInRange: number;
  successfulRenewalUserCount: number;
  failedInvoiceAttemptsInRange: number;
  becamePastDueInRange: number;
}

export interface CancellationRevenueMetrics {
  cancellationsInRange: number;
  cancelledMembershipRevenueImpact: number;
}

export interface RenewalProgress {
  /** Denominator: active + past-due members at the period's first day. */
  base: number;
  /** Numerator: distinct members whose renewal payment landed in the period. */
  renewed: number;
  /** renewed / base as a 0–100 percentage (1 dp); null when base is 0 / no snapshot. */
  rate: number | null;
  /** max(0, base − renewed). Labeled "expected" while open, "did not renew" when complete. */
  remaining: number;
  /** Snapshot day actually used for the base (YYYY-MM-DD, AEST); null if none found. */
  baseAsOf: string | null;
  /** True when the period is closed (last-draw) → remaining means "did not renew". */
  isComplete: boolean;
}

export interface MembershipAnalyticsBundle extends MembershipRenewalMetrics, CancellationRevenueMetrics {
  renewalProgress?: RenewalProgress;
}
