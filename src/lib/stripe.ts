import Stripe from "stripe";
import { createDefaultStripeHttpClient, createRateLimitedHttpClient } from "./stripe-rate-limiter";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-08-27.basil",
  typescript: true,
  // Auto-retry transient network errors. NOTE: this is NOT cover for 429 —
  // `RequestSender._shouldRetry` (node_modules/stripe/cjs/RequestSender.js:138) has no
  // branch on status 429 (it retries connection errors, 409 and >=500). It does honour a
  // `stripe-should-retry: true` response header, which Stripe MAY send on a rate-limit
  // response — but that is Stripe's choice, not ours, so it cannot be relied on. That is
  // why the rate limiter below is required rather than optional. The SDK only retries
  // safely-idempotent reads and writes that carry an Idempotency-Key.
  maxNetworkRetries: 2,
  // Client-side token bucket in front of every request this singleton makes, so a
  // renewal burst is metered instead of being rejected by Stripe. It sits at the HTTP
  // layer, below the resource methods, so it is invisible to all ~83 call sites:
  // return shapes (including the auto-paginating ApiListPromise), per-call options
  // such as `{ idempotencyKey }`, the synchronous `stripe.webhooks.constructEvent`,
  // and every error class reach callers exactly as before.
  // Per-INSTANCE, not global — see the header of ./stripe-rate-limiter.
  httpClient: createRateLimitedHttpClient(createDefaultStripeHttpClient()),
});

export const formatAmountForStripe = (amount: number, currency: string): number => {
  const numberFormat = new Intl.NumberFormat(["en-AU"], {
    style: "currency",
    currency: currency,
    currencyDisplay: "symbol",
  });
  const parts = numberFormat.formatToParts(amount);
  let zeroDecimalCurrency = true;
  for (const part of parts) {
    if (part.type === "decimal") {
      zeroDecimalCurrency = false;
    }
  }
  return zeroDecimalCurrency ? amount : Math.round(amount * 100);
};

export const formatAmountFromStripe = (amount: number, currency: string): number => {
  const numberFormat = new Intl.NumberFormat(["en-AU"], {
    style: "currency",
    currency: currency,
    currencyDisplay: "symbol",
  });
  const parts = numberFormat.formatToParts(100);
  let zeroDecimalCurrency = true;
  for (const part of parts) {
    if (part.type === "decimal") {
      zeroDecimalCurrency = false;
    }
  }
  return zeroDecimalCurrency ? amount : amount / 100;
};

export interface CreatePaymentIntentParams {
  amount: number;
  currency: string;
  customerId?: string;
  paymentMethodId?: string;
  metadata?: Record<string, string>;
}

export const createStripePaymentIntent = async (params: CreatePaymentIntentParams): Promise<Stripe.PaymentIntent | null> => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: params.amount,
      currency: params.currency,
      customer: params.customerId,
      payment_method: params.paymentMethodId,
      metadata: params.metadata || {},
      automatic_payment_methods: {
        enabled: true,
      },
    });

    return paymentIntent;
  } catch (error) {
    console.error("Failed to create payment intent:", error);
    return null;
  }
};
