import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import User from "@/models/User";
import Order, { type IOrder } from "@/models/Order";
import { ShopOrderService } from "@/services/shop/ShopOrderService";
import { processPaymentBenefits } from "@/utils/payment/payment-processing";
import { sendShopOrderConfirmation } from "@/services/shop/sendOrderConfirmation";
import { trackPixelPurchase } from "@/utils/tracking/pixel-purchase-tracking";
import { trackShopPlacedOrder } from "@/utils/integrations/klaviyo/klaviyo-revenue-service";
import { normalizeEpochToUnixSeconds } from "@/lib/tracking/canonical-event";
import { loadShopEntryMultipliers } from "@/services/shop/resolveShopEntryMultiplier";
import { entriesForLine, resolveEntryMultiplierFor } from "@/utils/shop/entry-multiplier";

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
  /** Entries actually credited, after the multiplier. `undefined` = the grant did not run. */
  entriesGranted?: number;
}

export interface FinalizeShopOrderOptions {
  /**
   * Click ids and IP/UA recovered from the PaymentIntent's metadata by the
   * webhook. The webhook has no cookies, so without this hand-off the server
   * Purchase reaches Meta and TikTok with no click id and cannot be attributed.
   */
  requestContext?: Record<string, string | undefined>;
}

/**
 * Credit the order's free entries.
 *
 * Entries are a free inclusion with the garment — never sold, never priced per
 * unit (CLAUDE.md rule 11). The base count is snapshotted per line at checkout,
 * so an admin editing the catalog mid-flight cannot change what this buyer was
 * promised; the multiplier is applied here, at fulfilment, exactly as the
 * one-time pack path does it.
 *
 * No eligibility check, deliberately. Entries are granted to every buyer; SA/ACT
 * exclusion is applied by the Major Draw export when a winner is picked, which is
 * where every other entry source is filtered. A point-of-sale skip would be a
 * second, weaker copy of a working filter and would silently withhold entries
 * from anyone whose profile data is merely incomplete.
 */
async function grantShopEntries(
  order: IOrder,
  paymentIntentId: string
): Promise<number | undefined> {
  // One read for the whole order rather than one per line.
  //
  // On failure this returns NO caps, i.e. inherit unchanged — never a cap of 1.
  // A database blip must not silently withhold entries the product page promised;
  // it can only ever grant what the promo already permits.
  const multipliers = await loadShopEntryMultipliers();

  // Per line, NOT sum-then-multiply. Two products can carry different
  // multipliers, and a single scalar cannot honour both — it would silently
  // apply one line's rate to the other, with no error anywhere.
  //
  // The product's own rate comes off the LINE, not the product record: it was
  // frozen at checkout with the rest of the snapshot, so an admin editing the
  // catalogue mid-flight cannot change what this buyer was shown. The category
  // and shop-wide rates are config and resolve live, here.
  let entries = 0;
  for (const line of order.products) {
    const applied = resolveEntryMultiplierFor(line, multipliers);
    // Recorded per line so support can answer "why did this item give three"
    // for a mixed order. Saved by the order.save() on either path below.
    line.entryMultiplierApplied = applied;
    entries += entriesForLine(line.includedEntries ?? 0, line.quantity, applied);
  }

  /*
    NO EARLY RETURN ON ZERO (changed 2026-08-21).

    This used to `return 0` before processPaymentBenefits whenever the order was
    worth no entries, on the reasoning that a zero grant should change nothing.
    But processPaymentBenefits is also what writes the `BenefitsGranted`
    PaymentEvent, and PaymentEvent is the SINGLE authoritative source of revenue in
    this codebase — the daily snapshot aggregates it, and Order is never summed for
    money anywhere.

    Product.includedEntries defaults to 0, so that early return fired on EVERY merch
    order ever placed. The consequence was not a missing entry grant, which was
    intended; it was that shop revenue did not exist. Merchandise is income and has
    to be counted as income.

    The zero-entry case is now handled where it belongs — addToMajorDraw returns
    immediately on entries <= 0, so no draw is touched and no `no active major draw`
    error is logged for an order that never wanted a draw.
  */

  try {
    const result = await processPaymentBenefits(
      paymentIntentId,
      order.user.toString(),
      {
        packageType: "shop",
        packageId: order.orderNumber,
        packageName: `Merchandise order ${order.orderNumber}`,
        entries,
        points: 0,
        price: order.totalAmount,
      },
      "webhook"
    );

    if (!result.success) {
      // Money is taken and the garment is on its way. Do NOT throw — failing the
      // webhook would retry the whole fulfilment, not just the grant. Leaving
      // entriesGranted undefined is what makes this findable: the reconcile cron
      // and a human both distinguish "never ran" from a granted zero.
      console.error("[shop] entry grant failed — order fulfilled, entries owed", {
        orderNumber: order.orderNumber,
        paymentIntentId,
        entries,
        code: result.code,
        error: result.error,
      });
      return undefined;
    }

    order.entriesGranted = entries;
    await order.save().catch((err) => {
      console.error("[shop] entries granted but recording them on the order failed", {
        orderNumber: order.orderNumber,
        entries,
        err,
      });
    });
    return entries;
  } catch (err) {
    console.error("[shop] entry grant threw — order fulfilled, entries owed", {
      orderNumber: order.orderNumber,
      paymentIntentId,
      entries,
      err,
    });
    return undefined;
  }
}

export async function finalizeShopOrder(
  paymentIntent: Stripe.PaymentIntent,
  { requestContext }: FinalizeShopOrderOptions
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
    const existing = await Order.findById(orderId);
    if (!existing) {
      console.error("[shop] order referenced by a paid PaymentIntent does not exist", {
        orderId,
        paymentIntentId: paymentIntent.id,
      });
      return { status: "order_not_found" };
    }

    // This redelivery is the ONLY retry a failed grant will ever get, so it does
    // not return early any more.
    //
    // Once a grant succeeds it writes a `BenefitsGranted-{pi}` PaymentEvent, and
    // handlePaymentSuccess short-circuits on isPaymentProcessed() BEFORE it ever
    // reaches the shop branch — so no later delivery gets here at all. The window
    // this covers is the one in between: a previous delivery marked the order paid
    // and then died (or the grant itself failed), leaving money taken and entries
    // owed with nothing to re-run them.
    //
    // Retrying is safe: processPaymentBenefits is idempotent on that same
    // PaymentEvent id, and a grant that already landed is a no-op.
    if (existing.status === "cancelled") {
      // Auto-refunded for lost stock. Never grant against a refunded order.
      return { status: "already_processed", orderNumber: existing.orderNumber };
    }

    const entriesGranted =
      existing.entriesGranted === undefined
        ? await grantShopEntries(existing, paymentIntent.id)
        : existing.entriesGranted;

    return { status: "already_processed", orderNumber: existing.orderNumber, entriesGranted };
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

  // Clear only THIS ORDER'S lines — matched on (productId, sku), not "every product
  // line".
  //
  // Two reasons. Mini-draw tickets share the cart and are a separate purchase path
  // this payment did not cover. And webhooks are asynchronous: a customer who adds a
  // new item while the previous order's webhook is still in flight would have that
  // new item silently wiped by a blanket $pull. Surfaced by two e2e specs running
  // back to back, where the first purchase's late webhook emptied the second test's
  // cart — a narrow race, but a real one a fast customer can hit.
  const purchasedLines = order.products.map((line) => ({
    type: "product" as const,
    productId: line.product,
    // A line with no sku is a product without variants; matching on absence keeps
    // that case exact rather than pulling every sku of the same product.
    ...(line.sku ? { sku: line.sku } : {}),
  }));

  /*
    Clear the purchased lines AND remember the delivery address, in one write.

    The address is saved HERE — on a paid order — rather than at checkout-start, so an
    abandoned attempt can never overwrite the address that actually received goods. It
    is what prefills the next checkout, so the customer types it once.

    Field-for-field from the order's own snapshot, which is already Zod-validated at
    the route boundary (AU state enum, 4-digit postcode), so nothing unvalidated
    reaches the user document.
  */
  const remembered = order.shippingAddress
    ? {
        firstName: order.shippingAddress.firstName,
        lastName: order.shippingAddress.lastName,
        phone: order.shippingAddress.phone,
        addressLine1: order.shippingAddress.addressLine1,
        addressLine2: order.shippingAddress.addressLine2,
        city: order.shippingAddress.city,
        state: order.shippingAddress.state,
        postalCode: order.shippingAddress.postalCode,
        country: order.shippingAddress.country,
        deliveryInstructions: order.shippingAddress.deliveryInstructions,
      }
    : null;

  await User.updateOne(
    { _id: order.user },
    {
      $pull: { cart: { $or: purchasedLines } },
      ...(remembered ? { $set: { shippingAddress: remembered } } : {}),
    }
  ).catch((err) => {
    // Non-fatal: the order is paid and will be fulfilled. A stale cart line is
    // an annoyance, not a lost sale, and must not fail the webhook.
    console.error("[shop] failed to clear cart after successful order", {
      orderNumber: order.orderNumber,
      err,
    });
  });

  // Entries LAST, and only on the fulfilled path.
  //
  // Last, because a successful grant writes a PaymentEvent that makes every later
  // redelivery short-circuit before this function runs. Anything sequenced after
  // the grant would therefore lose its only retry.
  //
  // Only on the fulfilled path, because the stock-loss branch above refunds the
  // customer in full and returns — granting before that check would leave a fully
  // refunded order holding its entries, and the refund reversal cannot clean it
  // up (it fails closed when the BenefitsGranted row is not yet committed).
  const entriesGranted = await grantShopEntries(order, paymentIntent.id);

  // Receipt AFTER the grant, so it can state the entries the customer actually
  // received. Sending it earlier would read order.entriesGranted before it was set
  // and silently omit the entries block from every confirmation — invisible today
  // while merchandise ships at 0 entries, and wrong the day the permit lands.
  //
  // Safe to sequence here: grantShopEntries catches its own failures and never
  // throws, so a failed grant still produces a receipt. Best-effort — an SMTP
  // problem must never fail the webhook, which would retry the whole fulfilment.
  await sendShopOrderConfirmation(order).catch((err) => {
    console.error("[shop] order confirmation email failed", {
      orderNumber: order.orderNumber,
      err,
    });
  });

  // The canonical Purchase, server-side (docs/tracking/rules.md R1).
  //
  // HERE, and not hung off processPaymentBenefits: that returns early while
  // includedEntries is 0, which is every merch order today, so hanging Purchase
  // off it would mean no merch sale is ever reported.
  //
  // On the fulfilled path only. The stock-loss branch above refunds in full and
  // returns before this, and a redelivered webhook stops at markPaid, so this
  // runs exactly once per order that was actually shipped.
  //
  // Keyed on orderNumber to match the browser fire from CheckoutSuccessClient, so
  // Meta merges the pair rather than counting the sale twice. Every other server
  // emitter keys on paymentIntentId, which is precisely why the shop was excluded
  // from the shared path.
  const buyer = await User.findById(order.user)
    .select("email firstName lastName mobile state")
    .lean<{ email?: string; firstName?: string; lastName?: string; mobile?: string; state?: string } | null>()
    .catch(() => null);

  await trackPixelPurchase({
    value: order.totalAmount,
    currency: "AUD",
    orderId: order.orderNumber,
    packageType: "shop",
    packageId: order.orderNumber,
    packageName: `Merchandise order ${order.orderNumber}`,
    userId: order.user.toString(),
    userEmail: buyer?.email,
    userPhone: buyer?.mobile,
    userFirstName: buyer?.firstName,
    userLastName: buyer?.lastName,
    userState: buyer?.state,
    userCountry: "AU",
    paymentIntentId: paymentIntent.id,
    content_type: "product",
    content_ids: order.products.map((line) => line.sku ?? line.product.toString()),
    num_items: order.products.reduce((n, line) => n + line.quantity, 0),
    ...(requestContext ? { requestContext } : {}),
    // There is no browser here -- this runs from the Stripe webhook -- so the event
    // must say so. Left unset it defaulted to a website event carrying a fabricated
    // source URL, which is both untrue and worse for matching.
    actionSource: "system_generated" as const,
    // Meta books the conversion at event_time. Without this the sale is dated by
    // when the webhook happened to be processed, so a purchase paid at 23:59 lands
    // on the next day whenever delivery is delayed.
    eventTimeUnixSeconds: normalizeEpochToUnixSeconds(
      paymentIntent.created ? paymentIntent.created * 1000 : undefined
    ),
  }).catch((err) => {
    // Never throw: failing the webhook would retry the whole fulfilment.
    console.error("[shop] Purchase tracking failed", { orderNumber: order.orderNumber, err });
  });

  try {
    trackShopPlacedOrder({
      email: buyer?.email,
      userId: order.user.toString(),
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
      items: order.products.map((line) => ({
        productId: line.product.toString(),
        sku: line.sku,
        name: line.name ?? "Merchandise",
        quantity: line.quantity,
        price: line.price,
        size: line.size,
        colour: line.colour,
      })),
    });
  } catch (err) {
    console.error("[shop] Klaviyo Placed Order failed", { orderNumber: order.orderNumber, err });
  }

  return { status: "fulfilled", orderNumber: order.orderNumber, entriesGranted };
}
