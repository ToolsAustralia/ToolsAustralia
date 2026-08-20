import type mongoose from "mongoose";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createPaymentIntentConfig } from "@/utils/payment/stripe/payment-intent-config";
import { ShopOrderService } from "@/services/shop/ShopOrderService";
import { resolveShopDiscountPercent, type ShopDiscountUserInput } from "@/utils/shop/member-discount";
import { resolveStripeCustomerId } from "@/services/shop/resolveStripeCustomer";
import { buildShopOrderDescription } from "@/utils/shop/order-description";
import type { ShippingAddressInput } from "@/services/shop/ShopOrderService";

/**
 * Start (or RESUME) a shop purchase.
 *
 * This used to live in the route handler, which CLAUDE.md forbids — but the move is
 * not cosmetic. The bug it fixes only exists because the two halves were adjacent:
 * the handler created an order and then created a PaymentIntent keyed
 * `shop_order_${order._id}`, an idempotency key derived from an order minted three
 * lines earlier in the same request. That key is unique per request by construction,
 * so it could only ever suppress the Stripe SDK's own retry of one in-flight call —
 * never a second POST. The comment claiming it deduplicated "a double-submitted
 * checkout form" was false for exactly the case it named.
 *
 * The customer supplies the second POST for free: the checkout client holds
 * `clientSecret` in React state only, so a refresh at the card step drops it,
 * re-enables the address fields and re-renders "Continue to payment" — the only
 * action the UI then offers is the one that duplicates the order.
 *
 * So this resolves an order first (reuse-or-create) and only then decides whether a
 * PaymentIntent is needed. With a stable order id, the idempotency key finally means
 * what its comment always claimed.
 *
 * NOT merely an analytics fix. `markPaid` gates on `{ _id, status: "pending" }`, i.e.
 * PER ORDER — so two orders with two intents that both confirmed would each fulfil,
 * decrementing stock twice and granting entries twice.
 */

/** A PaymentIntent in one of these states is still payable and may be handed back. */
const REUSABLE_INTENT_STATUSES: ReadonlySet<Stripe.PaymentIntent.Status> = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
]);

export interface StartShopCheckoutInput {
  /** The authenticated user document. Cart and identity are read from it, never from the request. */
  user: {
    _id: mongoose.Types.ObjectId | string;
    email: string;
    cart?: { type: string; productId?: { toString(): string }; sku?: string; quantity: number }[];
  } & ShopDiscountUserInput;
  shippingAddress: ShippingAddressInput;
  /** Click ids and request context for the Meta/TikTok CAPI hop through Stripe metadata. */
  trackingContext?: Record<string, string>;
}

export interface StartShopCheckoutResult {
  clientSecret: string | null;
  customerSessionClientSecret: string | null;
  orderId: string;
  orderNumber: string;
  totals: { subtotal: number; discount: number; shipping: number; gst: number; total: number };
  /** True when an in-progress checkout was resumed rather than started. */
  reused: boolean;
}

/**
 * Can this PaymentIntent still be handed to the buyer for THIS order?
 *
 * Amount and currency are checked, not just status: an intent holds the amount it was
 * created with, and a member tier change or a catalogue price edit between attempts
 * changes what is owed. Reusing a stale intent would charge yesterday's price.
 *
 * `processing`, `succeeded` and `canceled` are deliberately absent from the reusable
 * set — those belong to the webhook, and handing back a succeeded intent's secret
 * would show a paid order as unpaid.
 */
function canReuseIntent(intent: Stripe.PaymentIntent, totalCents: number): boolean {
  return (
    REUSABLE_INTENT_STATUSES.has(intent.status) &&
    intent.amount === totalCents &&
    intent.currency === "aud" &&
    Boolean(intent.client_secret)
  );
}

export async function startShopCheckout(
  input: StartShopCheckoutInput
): Promise<StartShopCheckoutResult> {
  // Only product lines check out here. Ticket lines are a different purchase path
  // entirely (mini-draw packs) and must not be swept into a shop order.
  const items = (input.user.cart ?? [])
    .filter((line) => line.type === "product")
    .map((line) => ({
      productId: line.productId!.toString(),
      sku: line.sku,
      quantity: line.quantity,
    }));

  const { order, totalCents, reused } = await ShopOrderService.resolvePendingOrder({
    userId: input.user._id,
    items,
    shippingAddress: input.shippingAddress,
    shopDiscountPercent: resolveShopDiscountPercent(input.user),
  });

  // Never pass a stored id straight through: a deleted or placeholder customer makes
  // paymentIntents.create throw `No such customer`, which the buyer sees as a 500 at
  // checkout with no way forward.
  const stripeCustomerId = await resolveStripeCustomerId(input.user);

  let clientSecret: string | null = null;

  // RESUME PATH. Only a reused order can have an intent worth reusing — a freshly
  // created one has no paymentIntentId yet.
  if (reused && order.paymentIntentId) {
    try {
      const existing = await stripe.paymentIntents.retrieve(order.paymentIntentId);
      if (canReuseIntent(existing, totalCents)) {
        clientSecret = existing.client_secret;
      } else if (REUSABLE_INTENT_STATUSES.has(existing.status)) {
        // Still payable but for the wrong amount — cancel it so it does not linger in
        // Stripe as a second open intent against the same order.
        await stripe.paymentIntents.cancel(existing.id).catch(() => {});
      }
    } catch {
      // A retrieve failure (deleted intent, transient Stripe error) must not fail the
      // buyer's checkout. Fall through and create a fresh intent.
    }
  }

  if (!clientSecret) {
    const config = createPaymentIntentConfig({
      amount: totalCents,
      currency: "aud",
      paymentType: "shop",
      customer: stripeCustomerId,
      // The item and its variant, not the order number — Stripe's payments list shows
      // this as its widest column, and the order number is already in metadata below.
      description: buildShopOrderDescription(order.products ?? [], order.orderNumber),
      metadata: {
        type: "shop",
        orderId: String(order._id),
        orderNumber: order.orderNumber,
        userId: String(input.user._id),
        // The webhook resolves the buyer by stripeCustomerId first, then falls back to
        // this email. Shop was the only payment type not sending it, so a customer id
        // that did not match at webhook time left the handler with no way to identify
        // the buyer — and it treats that as "processed", not "retry", so the paid order
        // and its entries were both lost silently.
        userEmail: input.user.email,
        ...(input.trackingContext ?? {}),
      },
    });

    const paymentIntent = await stripe.paymentIntents.create(config, {
      // NOW this key means what it says. The order id is stable across repeat POSTs
      // for the same cart, so a second submit reuses the first intent instead of
      // opening a second one against the same order.
      idempotencyKey: `shop_order_${order._id}`,
    });

    clientSecret = paymentIntent.client_secret;

    // Record the PaymentIntent immediately. If the webhook is delayed or lost, this is
    // the link that lets an operator reconcile the payment to the order.
    order.paymentIntentId = paymentIntent.id;
    await order.save();
  }

  /*
    A CUSTOMER SESSION is what makes the buyer's saved cards appear in PaymentElement,
    with "add a new card" still available underneath. It is Stripe's supported
    mechanism for this — the alternative is a hand-rolled saved-card picker that
    confirms with an explicit `payment_method`, which is what the membership modal
    does; bolting it on would mean two payment UIs for one checkout.
  */
  let customerSessionClientSecret: string | null = null;
  try {
    const customerSession = await stripe.customerSessions.create({
      customer: stripeCustomerId,
      components: {
        payment_element: {
          enabled: true,
          features: {
            payment_method_redisplay: "enabled",
            // A card entered here IS offered for saving, and a saved one is reusable
            // next time. The buyer chooses via the Element's own checkbox — nothing is
            // stored silently.
            payment_method_save: "enabled",
            payment_method_save_usage: "on_session",
            payment_method_remove: "enabled",
          },
        },
      },
    });
    customerSessionClientSecret = customerSession.client_secret;
  } catch (sessionError) {
    // Non-fatal by design. Without it PaymentElement still renders a normal card form,
    // so the buyer can always pay — they just have to type the card. Failing the whole
    // checkout because a convenience could not be set up is the wrong trade.
    console.error("[shop] customer session failed — falling back to card entry", sessionError);
  }

  return {
    clientSecret,
    customerSessionClientSecret,
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    totals: {
      subtotal: order.subtotal,
      discount: order.appliedDiscounts?.[0]?.amount ?? 0,
      shipping: order.shippingCost,
      gst: order.gstAmount,
      total: order.totalAmount,
    },
    reused,
  };
}
