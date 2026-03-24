import type Stripe from "stripe";

/**
 * True if this invoice is the first paid invoice (amount_paid > 0) on the subscription,
 * ordered by Stripe `created` time.
 */
export async function isFirstPaidSubscriptionInvoice(
  stripe: Stripe,
  subscriptionId: string,
  currentInvoiceId: string
): Promise<boolean> {
  const list = await stripe.invoices.list({
    subscription: subscriptionId,
    limit: 100,
  });

  const paid = list.data
    .filter((inv) => inv.status === "paid" && (inv.amount_paid ?? 0) > 0)
    .sort((a, b) => a.created - b.created);

  if (paid.length === 0) return true;
  return paid[0].id === currentInvoiceId;
}

/**
 * Whether we should record a membership-recurring affiliate commission for this paid invoice.
 * Handles Stripe edge cases where renewals are not always `billing_reason === subscription_cycle`
 * (e.g. test clocks, duplicate subscription_create, subscription_update after first invoice).
 */
export async function shouldRecordMembershipRecurringAffiliateCharge(
  stripe: Stripe,
  invoice: Stripe.Invoice,
  subscriptionId: string
): Promise<boolean> {
  const amountPaid = invoice.amount_paid ?? 0;
  if (amountPaid <= 0) return false;

  const br = invoice.billing_reason;

  if (br === "subscription_cycle" || br === "subscription_threshold") {
    return true;
  }

  // Second or later paid invoice on the same subscription (renewal / follow-on charge)
  if (br === "subscription_create" || br === "subscription_update") {
    const isFirst = await isFirstPaidSubscriptionInvoice(stripe, subscriptionId, invoice.id);
    return !isFirst;
  }

  return false;
}
