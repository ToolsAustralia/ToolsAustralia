/**
 * Pure helpers for selecting the chargeable invoice on a user's current subscription.
 *
 * No Stripe SDK or Mongoose imports — testable without env vars.
 *
 * Extracted from chargePastDueShared so it can be unit-tested in isolation.
 */

import type Stripe from "stripe";
import { pickOpenInvoiceForFailedRenewal } from "@/utils/payment/failed-invoice-selection";

/**
 * Resolve the subscription ID from a Stripe Invoice object, compatible with
 * both the legacy API shape (invoice.subscription) and the 2025-04-01+ shape
 * where the field moved to invoice.parent.subscription_details.subscription.
 */
export function resolveInvoiceSubId(
  inv: Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
    parent?: { subscription_details?: { subscription?: string | null } | null } | null;
  }
): string | null | undefined {
  return (
    inv.parent?.subscription_details?.subscription ??
    (typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id)
  );
}

/**
 * Reduce a customer's open invoices to the single invoice we should charge —
 * the one attached to the user's current subscription. Older or duplicate
 * cycle invoices (created when pause_collection didn't fire in time) are
 * returned separately so the caller can log them as skipped.
 *
 * Returns `target: null` when no invoice on the current subscription is chargeable.
 *
 * Compatible with both Stripe API <2025-04-01 (invoice.subscription) and
 * >=2025-04-01 (invoice.parent.subscription_details.subscription).
 */
export function selectCurrentSubscriptionChargeable(
  invoices: Stripe.Invoice[],
  userStripeSubscriptionId: string | null | undefined
): { target: Stripe.Invoice | null; skipped: Stripe.Invoice[] } {
  if (!userStripeSubscriptionId) {
    return { target: null, skipped: invoices };
  }
  const onCurrentSub = invoices.filter((inv) => {
    const withSub = inv as Stripe.Invoice & {
      subscription?: string | Stripe.Subscription | null;
      parent?: { subscription_details?: { subscription?: string | null } | null } | null;
    };
    const invSubId = resolveInvoiceSubId(withSub);
    return invSubId === userStripeSubscriptionId;
  });
  const target = pickOpenInvoiceForFailedRenewal(onCurrentSub);
  const skipped = invoices.filter((inv) => inv.id !== target?.id);
  return { target, skipped };
}
