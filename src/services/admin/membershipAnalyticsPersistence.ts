import type Stripe from "stripe";
import mongoose from "mongoose";
import MembershipRenewalCycle from "@/models/MembershipRenewalCycle";
import MembershipStatusHistory from "@/models/MembershipStatusHistory";
import type { MembershipAnalyticsActor, MembershipNormalizedStatus } from "@/types/admin/membershipAnalytics";
import { paidAtDateFromStripeInvoice } from "@/utils/affiliate/affiliate-recurring-invoice";
import type { IUser } from "@/models/User";

/** Minimal shape from cancel subscription flow (avoid circular import with CancelSubscriptionService). */
export interface CancellationAnalyticsResult {
  cancelledImmediately: boolean;
  subscriptionId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  endDate: string | null;
  isPastDue: boolean;
}

function invoicePeriodEndDate(invoice: Stripe.Invoice): Date | null {
  const pe = invoice.period_end;
  if (typeof pe !== "number" || !Number.isFinite(pe)) return null;
  return new Date(pe * 1000);
}

/**
 * Upsert renewal cycle when a subscription_cycle invoice is paid.
 */
export async function upsertRenewalCycleFromPaidInvoice(input: {
  invoice: Stripe.Invoice;
  userId: mongoose.Types.ObjectId;
  stripeSubscriptionId?: string;
}): Promise<void> {
  const { invoice, userId, stripeSubscriptionId } = input;
  const invoiceId = invoice.id;
  if (!invoiceId) return;
  if (invoice.billing_reason !== "subscription_cycle") return;

  const dueAt = invoicePeriodEndDate(invoice);
  if (!dueAt) return;

  const succeededAt = paidAtDateFromStripeInvoice(invoice) ?? new Date();
  const amountDueCents = invoice.amount_due ?? 0;
  const amountPaidCents = invoice.amount_paid ?? 0;

  const invWithPi = invoice as Stripe.Invoice & { payment_intent?: string | Stripe.PaymentIntent };
  const pi = invWithPi.payment_intent;
  const paymentIntentId =
    typeof pi === "string" ? pi : pi && typeof pi === "object" && "id" in pi ? (pi as Stripe.PaymentIntent).id : undefined;

  await MembershipRenewalCycle.findOneAndUpdate(
    { stripeInvoiceId: invoiceId },
    {
      $set: {
        userId,
        stripeSubscriptionId,
        billingReason: invoice.billing_reason ?? "subscription_cycle",
        status: "succeeded",
        dueAt,
        amountDueCents,
        amountPaidCents,
        succeededAt,
        failedAt: null,
        paymentIntentId,
        confidence: "stripe",
      },
    },
    { upsert: true, new: true }
  );
}

/**
 * Upsert renewal cycle when a subscription_cycle invoice payment fails.
 */
export async function upsertRenewalCycleFromFailedInvoice(input: {
  invoice: Stripe.Invoice;
  userId: mongoose.Types.ObjectId;
  stripeSubscriptionId?: string;
}): Promise<void> {
  const { invoice, userId, stripeSubscriptionId } = input;
  const invoiceId = invoice.id;
  if (!invoiceId) return;
  if (invoice.billing_reason !== "subscription_cycle") return;

  const dueAt = invoicePeriodEndDate(invoice);
  if (!dueAt) return;

  const amountDueCents = invoice.amount_due ?? invoice.total ?? 0;
  const failedAt = new Date();

  await MembershipRenewalCycle.findOneAndUpdate(
    { stripeInvoiceId: invoiceId },
    {
      $set: {
        userId,
        stripeSubscriptionId,
        billingReason: invoice.billing_reason ?? "subscription_cycle",
        status: "failed",
        dueAt,
        amountDueCents,
        failedAt,
        confidence: "stripe",
      },
    },
    { upsert: true, new: true }
  );
}

export async function appendMembershipStatusHistory(input: {
  userId: mongoose.Types.ObjectId;
  effectiveAt: Date;
  membershipStatus: MembershipNormalizedStatus;
  actor: MembershipAnalyticsActor;
  source: string;
  dedupeKey?: string;
  subscriptionPackageId?: string;
  autoRenew?: boolean;
  endDate?: Date;
  cancelledAt?: Date;
  pastDueAt?: Date;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await MembershipStatusHistory.create(input);
  } catch (err: unknown) {
    const code = err && typeof err === "object" && "code" in err ? (err as { code: number }).code : undefined;
    if (code === 11000 && input.dedupeKey) {
      return;
    }
    throw err;
  }
}

/**
 * Record cancellation from shared CancelSubscriptionService (user or admin API).
 */
export async function recordCancellationAnalytics(
  user: IUser,
  result: CancellationAnalyticsResult,
  analytics?: { actor: "user" | "admin"; adminUserId?: string }
): Promise<void> {
  if (!user?._id) return;

  const userId = new mongoose.Types.ObjectId(String(user._id));
  const actor: MembershipAnalyticsActor = analytics?.actor === "admin" ? "admin" : "user";
  const source = analytics?.actor === "admin" ? "cancel_api_admin" : "cancel_api_user";
  const pkgId = user.subscription?.packageId != null ? String(user.subscription.packageId) : undefined;

  const membershipStatus: MembershipNormalizedStatus = result.cancelledImmediately
    ? "canceled"
    : "scheduled_cancel";

  const dedupeKey = `${source}_${userId.toString()}_${result.subscriptionId}_${user.subscription?.cancelledAt?.getTime() ?? Date.now()}`;

  await appendMembershipStatusHistory({
    userId,
    effectiveAt: new Date(),
    membershipStatus,
    actor,
    source,
    dedupeKey,
    subscriptionPackageId: pkgId,
    autoRenew: user.subscription?.autoRenew,
    endDate: user.subscription?.endDate ?? undefined,
    cancelledAt: user.subscription?.cancelledAt ?? undefined,
    metadata: {
      cancelAtPeriodEnd: result.cancelAtPeriodEnd,
      cancelledImmediately: result.cancelledImmediately,
      isPastDue: result.isPastDue,
      stripeStatus: result.status,
      ...(analytics?.adminUserId ? { adminUserId: analytics.adminUserId } : {}),
    },
  });
}

/**
 * Append an "active" or "trialing" history row when a subscription becomes active.
 * Idempotent via stable dedupeKey. Safe to call from webhook + service paths.
 */
export async function appendActivationStatus(input: {
  userId: mongoose.Types.ObjectId;
  effectiveAt: Date;
  source: string;
  subscriptionPackageId?: string;
  isTrialing?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const status: MembershipNormalizedStatus = input.isTrialing ? "trialing" : "active";
  const dedupeKey = `${input.source}_${input.userId.toString()}_${input.effectiveAt.getTime()}_${status}`;

  await appendMembershipStatusHistory({
    userId: input.userId,
    effectiveAt: input.effectiveAt,
    membershipStatus: status,
    actor: "stripe",
    source: input.source,
    dedupeKey,
    subscriptionPackageId: input.subscriptionPackageId,
    metadata: input.metadata,
  });
}
