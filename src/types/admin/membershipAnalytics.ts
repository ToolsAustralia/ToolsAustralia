/**
 * Admin membership analytics — metric definitions and API shapes.
 *
 * Semantics:
 * - expectedRenewalsInRange: renewal cycles (Stripe subscription_cycle) with billing period end (`dueAt`) in [start, end].
 * - successfulRenewalsInRange: net membership BenefitsGranted with billingReason subscription_cycle in [start, end] (matches revenue card).
 * - failedRenewalInvoicesInRange: renewal cycles marked failed with failedAt in range.
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

export interface MembershipRenewalMetrics {
  expectedRenewalsInRange: number;
  successfulRenewalsInRange: number;
  successfulRenewalUserCount: number;
  failedRenewalInvoicesInRange: number;
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
