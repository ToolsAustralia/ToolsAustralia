/**
 * PaymentIntent Configuration Utility
 * 
 * Centralized configuration for Stripe PaymentIntents with proper 3D Secure support.
 * Provides type-safe configuration and consistent return URL management.
 */

import type Stripe from "stripe";
import { getBaseUrl } from "@/utils/url/get-base-url";

// Subscription's happy-path success is rendered in-modal client-side, but 3DS
// challenges force a real browser redirect — Stripe sends the user to
// `return_url` after the bank confirms. So subscription still needs a target.
// We point it at /my-account (where users land after a successful subscribe
// anyway) rather than a dedicated success page.
export type PaymentType = "subscription" | "one-time" | "upsell" | "mini-draw" | "shop";

export interface PaymentIntentConfigOptions {
  amount: number; // Amount in cents
  currency?: string;
  customer?: string;
  paymentMethod?: string;
  confirm?: boolean;
  paymentType: PaymentType;
  description?: string;
  metadata?: Record<string, string>;
  setupFutureUsage?: "off_session" | "on_session";
}

/**
 * Get return URL for a specific payment type (server-side)
 * 
 * @param paymentType - Type of payment (one-time, upsell, mini-draw, shop)
 * @returns Return URL path for the payment type
 */
export function getReturnUrlForPaymentType(paymentType: PaymentType): string {
  const baseUrl = getBaseUrl();
  
  const returnUrls: Record<PaymentType, string> = {
    subscription: `${baseUrl}/my-account`,
    "one-time": `${baseUrl}/purchase-success`,
    upsell: `${baseUrl}/upsell-success`,
    "mini-draw": `${baseUrl}/mini-draw-success`,
    shop: `${baseUrl}/shop/checkout/success`,
  };

  return returnUrls[paymentType];
}

/**
 * Get return URL for a specific payment type (client-side)
 * Uses window.location.origin for client-side components
 * 
 * @param paymentType - Type of payment (one-time, upsell, mini-draw, shop)
 * @returns Return URL path for the payment type
 */
export function getReturnUrlForPaymentTypeClient(paymentType: PaymentType): string {
  if (typeof window === "undefined") {
    throw new Error("getReturnUrlForPaymentTypeClient can only be used on the client side");
  }

  const baseUrl = window.location.origin;
  
  const returnUrls: Record<PaymentType, string> = {
    subscription: `${baseUrl}/my-account`,
    "one-time": `${baseUrl}/purchase-success`,
    upsell: `${baseUrl}/upsell-success`,
    "mini-draw": `${baseUrl}/mini-draw-success`,
    shop: `${baseUrl}/shop/checkout/success`,
  };

  return returnUrls[paymentType];
}

/**
 * Create PaymentIntent configuration with proper 3D Secure support
 * 
 * This function centralizes PaymentIntent creation parameters with:
 * - 3DS enabled via allow_redirects: "always"
 * - Appropriate return URLs based on payment type
 * - Consistent automatic_payment_methods configuration
 * 
 * @param options - PaymentIntent configuration options
 * @returns Stripe PaymentIntent create parameters
 */
export function createPaymentIntentConfig(
  options: PaymentIntentConfigOptions
): Stripe.PaymentIntentCreateParams {
  const {
    amount,
    currency = "aud",
    customer,
    paymentMethod,
    confirm = false,
    paymentType,
    description,
    metadata = {},
    setupFutureUsage,
  } = options;

  // ✅ CRITICAL: Stripe only allows return_url when confirm is true
  // When confirm is false, PaymentElement will handle confirmation and redirects
  // The return_url will be set in confirmPayment() call on the frontend
  const returnUrl = confirm ? getReturnUrlForPaymentType(paymentType) : undefined;

  const config: Stripe.PaymentIntentCreateParams = {
    amount,
    currency,
    ...(customer && { customer }),
    ...(paymentMethod && { payment_method: paymentMethod }),
    confirm,
    ...(returnUrl && { return_url: returnUrl }), // Only include if confirm is true
    automatic_payment_methods: {
      enabled: true,
      allow_redirects: "always", // ✅ Enable 3D Secure redirects
    },
    ...(description && { description }),
    ...(metadata && Object.keys(metadata).length > 0 && { metadata }),
    ...(setupFutureUsage && { setup_future_usage: setupFutureUsage }),
  };

  return config;
}
