/**
 * Safely retire an abandoned, unpaid checkout subscription.
 *
 * Cancels a subscription ONLY if its real status is `incomplete`, and voids its
 * initial invoice ONLY if that invoice is `open` (incomplete ⟹ unpaid). This is the
 * single place that mutates Stripe for abandoned incompletes — reused by the
 * cleanup backfill script and the create-subscription routes. Idempotent: re-running
 * on an already-canceled/terminal sub is a no-op. See docs/subscription/gotchas.md.
 */
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";

export type CancelIncompleteResult = {
  subscriptionId: string;
  action: "cancelled" | "skipped" | "already_terminal";
  cancelled: boolean;
  invoiceVoided: boolean;
  reason?: string;
};

export async function cancelIncompleteSubscriptionAndVoidInvoice(
  subscriptionId: string,
  stripeClient: Pick<typeof stripe, "subscriptions" | "invoices"> = stripe
): Promise<CancelIncompleteResult> {
  let sub: Stripe.Subscription;
  try {
    sub = await stripeClient.subscriptions.retrieve(subscriptionId);
  } catch (e) {
    return {
      subscriptionId,
      action: "skipped",
      cancelled: false,
      invoiceVoided: false,
      reason: `retrieve failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // Only ever act on an abandoned initial checkout. Never touch a live or
  // already-canceled membership.
  if (sub.status !== "incomplete" && sub.status !== "incomplete_expired") {
    return {
      subscriptionId,
      action: "skipped",
      cancelled: false,
      invoiceVoided: false,
      reason: `status ${sub.status} is not an abandoned incomplete`,
    };
  }

  // Cancel only a still-`incomplete` sub; `incomplete_expired` is already terminal.
  let cancelled = false;
  if (sub.status === "incomplete") {
    await stripeClient.subscriptions.cancel(subscriptionId);
    cancelled = true;
  }

  // Best-effort: void the initial invoice only if it is still open (prevents a later
  // dunning charge). A failure here must NOT throw — the subscription is already retired.
  let invoiceVoided = false;
  let reason: string | undefined;
  const invoiceId =
    typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id;
  if (invoiceId) {
    try {
      const invoice = await stripeClient.invoices.retrieve(invoiceId);
      if (invoice.status === "open") {
        await stripeClient.invoices.voidInvoice(invoiceId);
        invoiceVoided = true;
      }
    } catch (e) {
      reason = `invoice step failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  return {
    subscriptionId,
    action: cancelled ? "cancelled" : "already_terminal",
    cancelled,
    invoiceVoided,
    ...(reason ? { reason } : {}),
  };
}
