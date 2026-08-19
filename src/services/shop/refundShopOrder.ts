import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import Order, { type IOrder } from "@/models/Order";

/**
 * Refund a merchandise order.
 *
 * Merch is print-to-order, so refunds should be rare by construction — nothing is
 * dispatched from stock and there is no change-of-mind return. This exists for the
 * cases that are not optional: a garment arrives faulty or wrong, a print is bad, a
 * parcel is lost. Handling those by hand in the Stripe dashboard is what created the
 * gap this closes — a dashboard refund moves the money and tells this database
 * nothing, so the order stays `processing`, stays in the fulfilment queue, and gets
 * printed and posted to someone who already has their money back.
 *
 * ORDER OF OPERATIONS IS DELIBERATE:
 *
 *   1. Read the order and refuse the states that must not be refunded
 *   2. Refund in Stripe — the money moves first
 *   3. Only then write our own status
 *
 * Money first, because a local status written before a failed refund is a lie that
 * removes the order from the queue while the customer is still out of pocket. If
 * step 3 fails after step 2 succeeded, the refund still happened and the note on the
 * order is the recovery trail; the reverse ordering has no recovery at all.
 *
 * Entries are NOT reversed here. That belongs to the existing refund-reversal path,
 * which runs from the Stripe refund webhook against the BenefitsGranted PaymentEvent
 * and already handles every package type. Reversing them here as well would
 * double-subtract. Merchandise ships at `includedEntries: 0` today, so nothing is
 * granted to reverse — but the note matters for the day the permit lands.
 */

export type RefundShopOrderStatus =
  | "refunded"
  | "order_not_found"
  | "not_refundable"
  | "already_refunded"
  | "no_payment"
  | "stripe_failed";

export interface RefundShopOrderResult {
  status: RefundShopOrderStatus;
  orderNumber?: string;
  /** Cents actually refunded, as Stripe reports it. */
  amountRefunded?: number;
  error?: string;
}

/** Statuses a refund may be issued from. */
const REFUNDABLE: readonly IOrder["status"][] = ["processing", "shipped", "delivered", "completed"];

export async function refundShopOrder(params: {
  orderId: string;
  /** Cents. Omit for a full refund. */
  amountCents?: number;
  /** Free text recorded on the order, e.g. "arrived with a cracked print". */
  reason?: string;
  /** Staff user id, for the note. The audit row is written by the route. */
  actorId?: string;
}): Promise<RefundShopOrderResult> {
  const order = await Order.findById(params.orderId);
  if (!order) return { status: "order_not_found" };

  if (order.status === "cancelled") {
    // The stock-loss path already refunds and sets cancelled. Refunding again would
    // attempt a second refund against the same PaymentIntent.
    return { status: "already_refunded", orderNumber: order.orderNumber };
  }
  if (!REFUNDABLE.includes(order.status)) {
    // `pending` is unpaid — there is nothing to give back.
    return { status: "not_refundable", orderNumber: order.orderNumber };
  }
  if (!order.paymentIntentId) {
    return { status: "no_payment", orderNumber: order.orderNumber };
  }

  let refund: Stripe.Refund;
  try {
    refund = await stripe.refunds.create({
      payment_intent: order.paymentIntentId,
      ...(params.amountCents ? { amount: params.amountCents } : {}),
      reason: "requested_by_customer",
      metadata: {
        reason: params.reason ?? "shop_refund",
        orderNumber: order.orderNumber,
        ...(params.actorId ? { actorId: params.actorId } : {}),
      },
    });
  } catch (err) {
    // Loud: the customer is expecting their money and only a human can resolve it.
    console.error("[shop] refund failed", {
      orderNumber: order.orderNumber,
      paymentIntentId: order.paymentIntentId,
      err,
    });
    return {
      status: "stripe_failed",
      orderNumber: order.orderNumber,
      error: err instanceof Error ? err.message : "Stripe refused the refund",
    };
  }

  // A partial refund leaves the order live — the customer still has the garment and
  // it may still need dispatching. Only a full refund cancels it, which is what takes
  // it out of the fulfilment queue.
  const isFull = !params.amountCents || params.amountCents >= Math.round(order.totalAmount * 100);
  const note = `Refunded ${(refund.amount / 100).toFixed(2)} AUD${params.reason ? ` — ${params.reason}` : ""}`;
  order.notes = order.notes ? `${order.notes}\n${note}` : note;
  if (isFull) order.status = "cancelled";

  try {
    await order.save();
  } catch (err) {
    // The money is already back with the customer. Losing this write means the order
    // still reads as live, so it must be findable — hence console.error with the ids.
    console.error("[shop] refund succeeded but the order could not be updated", {
      orderNumber: order.orderNumber,
      refundId: refund.id,
      err,
    });
  }

  return {
    status: "refunded",
    orderNumber: order.orderNumber,
    amountRefunded: refund.amount,
  };
}
