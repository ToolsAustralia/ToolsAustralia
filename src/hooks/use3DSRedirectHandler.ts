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
import { useStripe } from "@stripe/react-stripe-js";
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
export function use3DSRedirectHandler(): Use3DSRedirectHandlerResult {
  const searchParams = useSearchParams();
  const stripe = useStripe();
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("idle");
  const [paymentIntent, setPaymentIntent] = useState<PaymentIntent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handle3DSRedirect = async () => {
      // Extract client secret from URL query params
      const clientSecret = searchParams.get("payment_intent_client_secret");
      
      if (!clientSecret) {
        // No 3DS redirect - normal flow
        setPaymentStatus("idle");
        return;
      }

      if (!stripe) {
        setError("Stripe not loaded");
        setPaymentStatus("failed");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Retrieve PaymentIntent to check status
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
  }, [searchParams, stripe]);

  return {
    paymentStatus,
    paymentIntent,
    isLoading,
    error,
  };
}
