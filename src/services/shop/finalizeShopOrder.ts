import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import User from "@/models/User";
import Order from "@/models/Order";
import { ShopOrderService } from "@/services/shop/ShopOrderService";

/**
 * Fulfil a paid shop order.
 *
 * Runs from `payment_intent.succeeded`. The order already exists (`pending`,
 * created by /api/shop/checkout with server-read prices), so this does not build
 * one from Stripe metadata — it finds it, marks it paid, takes stock, and clears
 * the cart.
 *
 * ORDER OF OPERATIONS MATTERS AND IS DELIBERATE:
 *
 *   1. markPaid  — idempotent; a redelivered webhook stops here
 *   2. stock     — atomic; can still fail under concurrency
 *   3. clear cart — only after the order is safely marked
 *
 * The cart is cleared last so that a failure anywhere above leaves the customer
 * holding their cart rather than losing both the cart and the order.
 */

export type FinalizeShopOrderStatus =
  | "fulfilled"
  | "already_processed"
  | "order_not_found"
  | "refunded_stock_lost";

export interface FinalizeShopOrderResult {
  status: FinalizeShopOrderStatus;
  orderNumber?: string;
}

export async function finalizeShopOrder(
  paymentIntent: Stripe.PaymentIntent
): Promise<FinalizeShopOrderResult> {
  const orderId = paymentIntent.metadata?.orderId;
  if (!orderId) {
    console.error("[shop] payment_intent.succeeded with no orderId in metadata", {
      paymentIntentId: paymentIntent.id,
    });
    return { status: "order_not_found" };
  }

  // Idempotency gate. The filter requires status "pending", so a redelivered
  // Stripe event updates nothing and returns null — no double stock decrement,
  // no second cart clear.
  const order = await ShopOrderService.markPaid(orderId, paymentIntent.id);
  if (!order) {
    const existing = await Order.findById(orderId).select("orderNumber status");
    if (!existing) {
      console.error("[shop] order referenced by a paid PaymentIntent does not exist", {
        orderId,
        paymentIntentId: paymentIntent.id,
      });
      return { status: "order_not_found" };
    }
    return { status: "already_processed", orderNumber: existing.orderNumber };
  }

  // Stock is taken AFTER payment, because a print-to-order catalog mostly has
  // none to take and holding inventory before payment would block real buyers.
  // The trade-off is this branch: paid, but we cannot supply it.
  const { failed } = await ShopOrderService.decrementStock(order);

  if (failed.length > 0) {
    // We have the customer's money and cannot fulfil. Refund immediately rather
    // than leaving them to notice — and mark the order cancelled so no one
    // picks it up for fulfilment in the meantime.
    console.error("[shop] stock lost after payment — refunding", {
      orderNumber: order.orderNumber,
      failed,
    });

    await stripe.refunds
      .create({
        payment_intent: paymentIntent.id,
        reason: "requested_by_customer",
        metadata: { reason: "shop_stock_lost_after_payment", orderNumber: order.orderNumber },
      })
      .catch((err) => {
        // A failed refund must be loud: the customer has paid for something we
        // are not sending, and only a human can resolve it from here.
        console.error("[shop] REFUND FAILED after stock loss — manual action required", {
          orderNumber: order.orderNumber,
          paymentIntentId: paymentIntent.id,
          err,
        });
      });

    order.status = "cancelled";
    order.notes = `Auto-refunded: out of stock after payment (${failed.join(", ")})`;
    await order.save();

    return { status: "refunded_stock_lost", orderNumber: order.orderNumber };
  }

  // Clear only the PRODUCT lines. A customer may hold mini-draw tickets in the
  // same cart, and those are a separate purchase path that this payment did not
  // cover — wiping them would silently discard something they still intend to buy.
  await User.updateOne(
    { _id: order.user },
    { $pull: { cart: { type: "product" } } }
  ).catch((err) => {
    // Non-fatal: the order is paid and will be fulfilled. A stale cart line is
    // an annoyance, not a lost sale, and must not fail the webhook.
    console.error("[shop] failed to clear cart after successful order", {
      orderNumber: order.orderNumber,
      err,
    });
  });

  return { status: "fulfilled", orderNumber: order.orderNumber };
}
