/**
 * 3D Secure Redirect Handler Hook
 * 
 * Handles 3DS redirect returns on success pages by:
 * - Extracting payment_intent_client_secret from URL query params
 * - Retrieving PaymentIntent status using Stripe SDK
 * - Managing loading, success, and error states
 */

"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getStripePromise } from "@/lib/stripe-client";
import type { PaymentIntent } from "@stripe/stripe-js";

export type PaymentStatus = "idle" | "loading" | "succeeded" | "failed" | "processing" | "requires_action";

export interface Use3DSRedirectHandlerResult {
  paymentStatus: PaymentStatus;
  paymentIntent: PaymentIntent | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook for handling 3DS redirects on success pages
 * 
 * When Stripe redirects back after 3DS authentication, it includes
 * payment_intent_client_secret in the URL query params. This hook:
 * 1. Extracts the client secret from the URL
 * 2. Retrieves the PaymentIntent status
 * 3. Provides the status and payment intent to the component
 * 
 * @returns Payment status, PaymentIntent object, loading state, and error
 */
/**
 * Exchange the redirect's client secret for a session.
 *
 * Best-effort and deliberately silent: the payment already succeeded, so a
 * sign-in hiccup must never surface as a payment error. The worst case is the
 * member sees the success page logged out — exactly today's behaviour — and the
 * SMS/email sign-in paths remain available to them.
 *
 * Retries the `202 pending` case, which is the webhook race: a one-time buyer who
 * never registered has no account until the Stripe webhook creates one.
 */
async function establishSessionFromPayment(clientSecret: string): Promise<void> {
  const DELAYS_MS = [0, 1500, 3000, 5000];

  for (const delay of DELAYS_MS) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      const res = await fetch("/api/auth/session-from-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIntentClientSecret: clientSecret }),
      });
      const data = await res.json();

      if (res.ok && data.token) {
        const { signIn } = await import("next-auth/react");
        await signIn("auto-login", { token: data.token, redirect: false });
        return;
      }
      // 202 = account not created yet; anything else is terminal.
      if (res.status !== 202) return;
    } catch {
      return;
    }
  }
}

export function use3DSRedirectHandler(): Use3DSRedirectHandlerResult {
  const searchParams = useSearchParams();
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("idle");
  const [paymentIntent, setPaymentIntent] = useState<PaymentIntent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handle3DSRedirect = async () => {
      const clientSecret = searchParams.get("payment_intent_client_secret");

      if (!clientSecret) {
        setPaymentStatus("idle");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const stripe = await getStripePromise();
        if (!stripe) {
          setError("Stripe not loaded");
          setPaymentStatus("failed");
          setIsLoading(false);
          return;
        }

        const { paymentIntent: retrievedPaymentIntent, error: retrieveError } =
          await stripe.retrievePaymentIntent(clientSecret);

        if (retrieveError) {
          console.error("Error retrieving payment intent:", retrieveError);
          setError(retrieveError.message || "Failed to retrieve payment status");
          setPaymentStatus("failed");
          setIsLoading(false);
          return;
        }

        if (!retrievedPaymentIntent) {
          setError("Payment intent not found");
          setPaymentStatus("failed");
          setIsLoading(false);
          return;
        }

        setPaymentIntent(retrievedPaymentIntent);

        // Map Stripe PaymentIntent status to our PaymentStatus type
        const status = retrievedPaymentIntent.status;
        if (status === "succeeded") {
          setPaymentStatus("succeeded");
          // A 3DS buyer arrives here having lost all in-page state (including the
          // `guestUserData` bridge) to Stripe's redirect, so nothing could sign
          // them in — they finished PAYING and stayed logged OUT, never reaching
          // profile setup. Establish the session from proof of payment.
          void establishSessionFromPayment(clientSecret);
        } else if (status === "processing") {
          setPaymentStatus("processing");
        } else if (status === "requires_action") {
          setPaymentStatus("requires_action");
        } else if (status === "canceled" || status === "requires_capture" || status === "requires_confirmation" || status === "requires_payment_method") {
          setPaymentStatus("failed");
          setError("Payment was canceled or requires additional action");
        } else {
          setPaymentStatus("failed");
          setError(`Unexpected payment status: ${status}`);
        }
      } catch (err) {
        console.error("Error handling 3DS redirect:", err);
        const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
        setError(errorMessage);
        setPaymentStatus("failed");
      } finally {
        setIsLoading(false);
      }
    };

    handle3DSRedirect();
  }, [searchParams]);

  return {
    paymentStatus,
    paymentIntent,
    isLoading,
    error,
  };
}
