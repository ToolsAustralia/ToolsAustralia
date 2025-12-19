import { useMutation } from "@tanstack/react-query";

interface CreatePaymentIntentResponse {
  success: boolean;
  client_secret?: string;
  payment_intent_id?: string;
  error?: string;
  details?: unknown;
}

interface CreatePaymentIntentParams {
  amount: number; // Amount in cents
  currency?: string; // Defaults to "aud"
  packageId?: string;
  packageName?: string;
  userEmail?: string; // ✅ NEW: User email for finding registered user's customer
  packageType?: "one-time" | "membership"; // ✅ NEW: Package type for proper metadata
}

/**
 * Custom hook for creating PaymentIntents for wallet payments
 * PaymentIntent is required to display correct amounts in Google Pay/Apple Pay
 * Automatically saves payment method via setup_future_usage
 */
export const usePaymentIntent = () => {
  return useMutation<CreatePaymentIntentResponse, Error, CreatePaymentIntentParams>({
    mutationFn: async (params: CreatePaymentIntentParams) => {
      const response = await fetch("/api/stripe/create-payment-intent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          amount: params.amount,
          currency: params.currency || "aud",
          packageId: params.packageId,
          packageName: params.packageName,
          userEmail: params.userEmail,
          packageType: params.packageType,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to create payment intent");
      }

      return result;
    },
    onError: (error) => {
      console.error("PaymentIntent creation failed:", error);
    },
  });
};
