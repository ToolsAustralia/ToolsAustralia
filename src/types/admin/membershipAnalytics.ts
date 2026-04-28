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

export interface MembershipAnalyticsBundle extends MembershipRenewalMetrics, CancellationRevenueMetrics {}
