import type Stripe from "stripe";

/**
 * When the payment actually settled (for affiliate `earnedAt` / reporting).
 * Prefer Stripe’s paid_at; fall back to invoice `created`.
 */
export function paidAtDateFromStripeInvoice(invoice: Stripe.Invoice): Date {
  const paid = invoice.status_transitions?.paid_at;
  if (paid != null && paid > 0) {
    return new Date(paid * 1000);
  }
  return new Date(invoice.created * 1000);
}

/**
 * List all paid invoices for a subscription (amount_paid > 0), oldest first.
 * Paginates past Stripe's default page size for long-lived subscriptions.
 */
export async function listAllPaidInvoicesForSubscription(
  stripe: Stripe,
  subscriptionId: string
): Promise<Stripe.Invoice[]> {
  const all: Stripe.Invoice[] = [];
  let startingAfter: string | undefined;

  for (;;) {
    const page = await stripe.invoices.list({
      subscription: subscriptionId,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    all.push(...page.data);
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1].id;
  }

  return all
    .filter((inv) => inv.status === "paid" && (inv.amount_paid ?? 0) > 0)
    .sort((a, b) => a.created - b.created);
}

/**
 * True if this invoice is the first paid invoice (amount_paid > 0) on the subscription,
 * ordered by Stripe `created` time.
 */
export async function isFirstPaidSubscriptionInvoice(
  stripe: Stripe,
  subscriptionId: string,
  currentInvoiceId: string
): Promise<boolean> {
  const paid = await listAllPaidInvoicesForSubscription(stripe, subscriptionId);

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

  const invoiceId = invoice.id;
  if (!invoiceId) return false;

  const br = invoice.billing_reason;

  if (br === "subscription_cycle" || br === "subscription_threshold") {
    return true;
  }

  // Second or later paid invoice on the same subscription (renewal / follow-on charge)
  if (br === "subscription_create" || br === "subscription_update") {
    const isFirst = await isFirstPaidSubscriptionInvoice(stripe, subscriptionId, invoiceId);
    return !isFirst;
  }

  return false;
}
