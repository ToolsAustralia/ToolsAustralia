import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { stripe } from "@/lib/stripe";
import { requireAuthenticatedUserDoc } from "@/lib/api-auth";
import { requireSameOrigin } from "@/utils/security/requireSameOrigin";
import { createPaymentIntentConfig } from "@/utils/payment/stripe/payment-intent-config";
import { ShopOrderService, CheckoutValidationError } from "@/services/shop/ShopOrderService";
import { resolveShopDiscountPercent } from "@/utils/shop/member-discount";
import { resolveStripeCustomerId } from "@/services/shop/resolveStripeCustomer";

/**
 * Start a shop purchase.
 *
 * The request carries a delivery address and NOTHING about money — no amount, no
 * prices, no line totals. The cart is read from `user.cart`, every price is
 * re-read from the catalog, and the total is computed server-side. This is the
 * same price-integrity contract the one-time pack routes use.
 *
 * Returns a client secret for the Payment Element. Nothing is fulfilled here:
 * the order is created `pending`, and `payment_intent.succeeded` marks it paid.
 */

const AU_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"] as const;

const shippingAddressSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().email().optional(),
  phone: z.string().trim().max(32).optional(),
  addressLine1: z.string().trim().min(1).max(160),
  addressLine2: z.string().trim().max(160).optional(),
  city: z.string().trim().min(1).max(80),
  state: z.enum(AU_STATES),
  // AU postcodes are exactly four digits. A courier cannot deliver to "3000-A".
  postalCode: z.string().trim().regex(/^\d{4}$/, "Enter a 4-digit Australian postcode"),
  deliveryInstructions: z.string().trim().max(280).optional(),
});

const checkoutSchema = z.object({
  shippingAddress: shippingAddressSchema,
});

export async function POST(request: NextRequest) {
  try {
    const csrf = requireSameOrigin(request);
    if (csrf) return csrf;

    await connectDB();
    const auth = await requireAuthenticatedUserDoc();
    if ("errorResponse" in auth) return auth.errorResponse;
    const { user } = auth;

    const { shippingAddress } = checkoutSchema.parse(await request.json());

    // Only product lines check out here. Ticket lines are a different purchase
    // path entirely (mini-draw packs) and must not be swept into a shop order.
    const items = (user.cart ?? [])
      .filter((line: { type: string }) => line.type === "product")
      .map((line: { productId?: { toString(): string }; sku?: string; quantity: number }) => ({
        productId: line.productId!.toString(),
        sku: line.sku,
        quantity: line.quantity,
      }));

    const { order, totalCents } = await ShopOrderService.createPendingOrder({
      userId: user._id,
      items,
      shippingAddress,
      shopDiscountPercent: resolveShopDiscountPercent(user),
    });

    // Never pass the stored id straight through: a deleted or placeholder
    // customer makes paymentIntents.create throw `No such customer`, which the
    // buyer sees as a 500 at checkout with no way forward.
    const stripeCustomerId = await resolveStripeCustomerId(user);

    const config = createPaymentIntentConfig({
      amount: totalCents,
      currency: "aud",
      paymentType: "shop",
      customer: stripeCustomerId,
      description: `Tools Australia shop order ${order.orderNumber}`,
      metadata: {
        type: "shop",
        orderId: String(order._id),
        orderNumber: order.orderNumber,
        userId: String(user._id),
      },
    });

    const paymentIntent = await stripe.paymentIntents.create(config, {
      // Keyed on the order, so a double-submitted checkout form reuses one
      // PaymentIntent instead of creating a second charge.
      idempotencyKey: `shop_order_${order._id}`,
    });

    // Record the PaymentIntent immediately. If the webhook is delayed or lost,
    // this is the link that lets an operator reconcile the payment to the order.
    order.paymentIntentId = paymentIntent.id;
    await order.save();

    return NextResponse.json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        orderId: String(order._id),
        orderNumber: order.orderNumber,
        totals: {
          subtotal: order.subtotal,
          discount: order.appliedDiscounts?.[0]?.amount ?? 0,
          shipping: order.shippingCost,
          gst: order.gstAmount,
          total: order.totalAmount,
        },
      },
    });
  } catch (error) {
    // Cart problems are the customer's to fix, and they need to know WHICH item.
    if (error instanceof CheckoutValidationError) {
      return NextResponse.json(
        { success: false, error: error.message, details: error.errors },
        { status: 409 }
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Please check your delivery address", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error starting shop checkout:", error);
    return NextResponse.json(
      { success: false, error: "Failed to start checkout" },
      { status: 500 }
    );
  }
}
