import { useState } from "react";
import { StripeCardElement } from "@stripe/stripe-js";
import { getStripePromise } from "@/lib/stripe-client";
import { useAttribution } from "@/hooks/useAttribution";

/**
 * Subscription creation data for new users
 * 
 * @remarks
 * Subscriptions use invoice PaymentIntent created automatically by Stripe.
 * No upfront PaymentIntent is needed - the invoice PaymentIntent will be returned
 * in the subscription creation response.
 */
export interface SubscriptionData {
  userEmail: string;
  firstName: string;
  lastName: string;
  mobile?: string;
  packageId: string;
  password?: string; // Made optional for passwordless users
  paymentMethodId?: string; // Optional for Option A: first payment uses invoice PaymentIntent only
  subscriptionRequestId?: string; // Idempotency/correlation; used as Stripe idempotency key
  idempotencyKey?: string;
  cancelPreviousSubscriptionId?: string; // When user switches package: cancel this incomplete subscription before creating new one
  referralCode?: string;
  affiliateCode?: string;
  promoLinkCode?: string;
  campaignCode?: string;
}

export interface OneTimePurchaseData {
  userEmail: string;
  firstName: string;
  lastName: string;
  mobile?: string;
  packageId: string;
  password?: string; // Made optional for passwordless users
  paymentMethodId: string;
  paymentIntentId?: string; // Optional PaymentIntent ID if already confirmed upfront
  referralCode?: string;
  affiliateCode?: string;
  promoLinkCode?: string;
  campaignCode?: string;
}

/**
 * Subscription creation data for existing users
 * 
 * @remarks
 * Subscriptions use invoice PaymentIntent created automatically by Stripe.
 * No upfront PaymentIntent is needed - the invoice PaymentIntent will be returned
 * in the subscription creation response with the correct amount for wallet display.
 */
export interface ExistingUserSubscriptionData {
  packageId: string;
  paymentMethodId?: string; // Optional for Option A: first payment uses invoice PaymentIntent only
  subscriptionRequestId?: string; // Idempotency/correlation; used as Stripe idempotency key
  idempotencyKey?: string;
  cancelPreviousSubscriptionId?: string; // When user switches package: cancel this incomplete subscription before creating new one
  referralCode?: string;
  affiliateCode?: string;
  promoLinkCode?: string;
  campaignCode?: string;
}

export interface ExistingUserOneTimePurchaseData {
  packageId: string;
  paymentMethodId?: string;
  referralCode?: string;
  affiliateCode?: string;
  promoLinkCode?: string;
  campaignCode?: string;
}

export interface SubscriptionResult {
  success: boolean;
  data?: {
    subscriptionId?: string;
    paymentIntentId?: string; // Added for one-time purchases
    customerId: string;
    userId: string;
    clientSecret?: string;
    status: string;
    packageName: string;
    entriesPerMonth?: number;
    totalEntries?: number;
    // Auto-login fields
    user?: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: string;
      subscription?: {
        packageId: string;
        isActive: boolean;
        status: string;
      };
      entryWallet: number;
      rewardsPoints: number;
    };
    autoLogin?: boolean;
  };
  subscription?: {
    id: string;
    status: string;
    clientSecret?: string;
  };
  paymentIntent?: {
    id: string;
    status: string;
    clientSecret?: string;
  };
  user: {
    id: string;
    email: string;
    subscription?: {
      packageId: string;
      startDate: string;
      isActive: boolean;
      autoRenew: boolean;
    };
    oneTimePackages: Array<{
      packageId: string;
      purchaseDate: string;
      startDate: string;
      endDate: string;
      isActive: boolean;
      entriesGranted: number;
    }>;
    entryWallet: number;
    rewardsPoints: number;
  };
}

export function useStripeSubscription() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attribution = useAttribution();

  const createSubscription = async (data: SubscriptionData): Promise<SubscriptionResult> => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/stripe/create-subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...data,
          ...(attribution && { attribution: attribution }),
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        const apiError = new Error(result.error || result.details || `HTTP ${response.status}: Failed to create subscription`) as Error & {
          code?: string;
          response?: { data?: { error?: string; code?: string } };
        };
        apiError.code = result.code;
        apiError.response = { data: { error: result.error, code: result.code } };
        throw apiError;
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create subscription";
      setError(errorMessage);
      console.error("Subscription creation error:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const createOneTimePurchase = async (data: OneTimePurchaseData): Promise<SubscriptionResult | null> => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/stripe/create-one-time-purchase", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...data,
          ...(attribution && { attribution: attribution }),
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || result.details || "Failed to create purchase");
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create purchase";
      setError(errorMessage);
      console.error("One-time purchase creation error:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const createSubscriptionExistingUser = async (data: ExistingUserSubscriptionData): Promise<SubscriptionResult> => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/stripe/create-subscription-existing-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Include cookies for session authentication
        body: JSON.stringify({
          ...data,
          ...(attribution && { attribution: attribution }),
        }),
      });

      const result = await response.json();

      console.log("🔍 useStripeSubscription API response:", {
        success: result.success,
        error: result.error,
        code: result.code,
        status: response.status,
        result,
      });

      if (!result.success) {
        // Create an error object that preserves the API response structure
        const apiError = new Error(result.error || result.details || "Failed to create subscription") as Error & {
          code?: string;
          response?: { data?: { error?: string; code?: string } };
        };
        apiError.code = result.code;
        apiError.response = { data: { error: result.error, code: result.code } };

        console.log("🔍 Throwing API error:", {
          message: apiError.message,
          code: apiError.code,
          response: apiError.response,
        });

        throw apiError;
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create subscription";
      setError(errorMessage);
      console.error("Existing user subscription creation error:", err);
      // Re-throw the error so it can be handled by the calling component
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const createOneTimePurchaseExistingUser = async (
    data: ExistingUserOneTimePurchaseData
  ): Promise<SubscriptionResult | null> => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/stripe/create-one-time-purchase-existing-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Include cookies for session authentication
        body: JSON.stringify({
          ...data,
          ...(attribution && { attribution: attribution }),
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || result.details || "Failed to create purchase");
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create purchase";
      setError(errorMessage);
      console.error("Existing user one-time purchase creation error:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const confirmPayment = async (clientSecret: string, paymentMethod: string) => {
    try {
      const stripe = await getStripePromise();
      if (!stripe) {
        throw new Error("Stripe not loaded");
      }

      // Import client-side return URL utility
      const { getReturnUrlForPaymentTypeClient } = await import("@/utils/payment/stripe/payment-intent-config");
      
      const result = await stripe.confirmPayment({
        clientSecret,
        confirmParams: {
          payment_method: paymentMethod,
          return_url: getReturnUrlForPaymentTypeClient("subscription"),
        },
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Payment confirmation failed";
      setError(errorMessage);
      console.error("Payment confirmation error:", err);
      throw err;
    }
  };

  const createPaymentMethod = async (cardElement: StripeCardElement) => {
    try {
      const stripe = await getStripePromise();
      if (!stripe) {
        throw new Error("Stripe not loaded");
      }

      const result = await stripe.createPaymentMethod({
        type: "card",
        card: cardElement,
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      return result.paymentMethod;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create payment method";
      setError(errorMessage);
      console.error("Payment method creation error:", err);
      throw err;
    }
  };

  return {
    createSubscription,
    createOneTimePurchase,
    createSubscriptionExistingUser,
    createOneTimePurchaseExistingUser,
    confirmPayment,
    createPaymentMethod,
    loading,
    error,
    clearError: () => setError(null),
  };
}
