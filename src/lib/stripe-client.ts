/**
 * Stripe Client Singleton
 * 
 * Provides a single shared instance of Stripe.js to avoid multiple
 * initializations and reduce r.stripe.com/b beacon calls.
 * 
 * Usage:
 * ```typescript
 * import { getStripePromise } from '@/lib/stripe-client';
 * 
 * const stripePromise = getStripePromise();
 * ```
 */

import { loadStripe, Stripe } from "@stripe/stripe-js";

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripePromise(): Promise<Stripe | null> {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    stripePromise = key ? loadStripe(key) : Promise.resolve(null);
  }
  return stripePromise;
}
