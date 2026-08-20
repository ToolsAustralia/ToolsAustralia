import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { requireAuthenticatedUserDoc } from "@/lib/api-auth";
import { requireSameOrigin } from "@/utils/security/requireSameOrigin";
import { CheckoutValidationError } from "@/services/shop/ShopOrderService";
import { startShopCheckout } from "@/services/shop/startShopCheckout";
import { extractRequestContext } from "@/utils/tracking/facebook-helpers";
import { extractTikTokContext } from "@/utils/tracking/tiktok-helpers";

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
 *
 * IDEMPOTENT for a repeat submit of the SAME cart — a refresh at the card step
 * resumes the existing order and its PaymentIntent rather than opening a second
 * one. All of that lives in `startShopCheckout`; this handler only parses,
 * authorises and shapes the response.
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

    // Click ids ride through Stripe metadata because Purchase fires from the webhook,
    // which has no cookies. Shop was the one payment type that did not do this, which
    // is why merch conversions reached Meta and TikTok unattributed.
    const ctx = { ...extractRequestContext(request), ...extractTikTokContext(request) };
    const trackingContext: Record<string, string> = {
      ...(ctx.client_ip_address ? { capi_client_ip: ctx.client_ip_address } : {}),
      ...(ctx.client_user_agent ? { capi_user_agent: ctx.client_user_agent } : {}),
      ...(ctx.fbc ? { capi_fbc: ctx.fbc } : {}),
      ...(ctx.fbp ? { capi_fbp: ctx.fbp } : {}),
      ...(ctx.ttclid ? { capi_ttclid: ctx.ttclid } : {}),
      ...(ctx.ttp ? { capi_ttp: ctx.ttp } : {}),
    };

    const result = await startShopCheckout({
      user: user as unknown as Parameters<typeof startShopCheckout>[0]["user"],
      shippingAddress,
      trackingContext,
    });

    return NextResponse.json({ success: true, data: result });
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
