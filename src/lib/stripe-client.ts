/**
 * Stripe Client Singleton
 *
 * Uses "@stripe/stripe-js/pure" so importing this module NEVER injects
 * https://js.stripe.com — the script loads on the FIRST getStripePromise() call
 * (i.e. when a payment surface actually mounts). Do not import loadStripe from
 * "@stripe/stripe-js" anywhere else: the default entry injects on import.
 * Enforced by eslint internal-norm/no-eager-stripe.
 */

import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe } from "@stripe/stripe-js";

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripePromise(): Promise<Stripe | null> {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    stripePromise = key ? loadStripe(key) : Promise.resolve(null);
  }
  return stripePromise;
}
