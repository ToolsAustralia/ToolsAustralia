import { useState } from "react";
import { StripeCardElement } from "@stripe/stripe-js";
import { getStripePromise } from "@/lib/stripe-client";
import { useAttribution } from "@/hooks/useAttribution";
import { completePendingAuthentication } from "@/utils/payment/stripe/complete-pending-authentication";
// TYPE-ONLY. `attach-typed-code` is server-only (Stripe secret key, the User
// model); `import type` is fully erased, so nothing from it reaches the bundle.
import type { TypedCodeCheckoutTarget, CheckoutCodeSlot } from "@/utils/payment/attach-typed-code";

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
          data?: unknown;
          response?: { data?: { error?: string; code?: string } };
        };
        apiError.code = result.code;
        apiError.response = { data: { error: result.error, code: result.code } };
        // Carry the full body on `.data` (ApiError shape) so formatPaymentError
        // can show decline-specific guidance from code/decline_code/details.
        apiError.data = result;
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
        // Carry the full body on `.data` (ApiError shape) so formatPaymentError
        // can show decline-specific guidance from code/decline_code/details.
        const apiError = new Error(result.error || result.details || "Failed to create purchase") as Error & {
          code?: string;
          data?: unknown;
        };
        apiError.code = result.code;
        apiError.data = result;
        throw apiError;
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create purchase";
      setError(errorMessage);
      console.error("One-time purchase creation error:", err);
      // Re-throw (was: return null) so MembershipModal's catch can show the
      // real decline reason instead of a generic "Failed to create account".
      throw err;
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
          data?: unknown;
          response?: { data?: { error?: string; code?: string } };
        };
        apiError.code = result.code;
        apiError.response = { data: { error: result.error, code: result.code } };
        // Carry the full body on `.data` (ApiError shape) so formatPaymentError
        // can show decline-specific guidance from decline_code / the
        // requiresDifferentPaymentMethod excessive-retry flag.
        apiError.data = result;

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

      // `success: true` does NOT mean the money moved: the route answers that with
      // `paymentIntent.status: "requires_action"` when the buyer's bank wants authentication.
      // Present the challenge and let it throw if the payment does not go through, so callers
      // never celebrate a charge Stripe is still holding as Incomplete.
      await completePendingAuthentication(result.paymentIntent, {
        packageId: data.packageId,
        packageName: result.data?.packageName,
      });

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

  /**
   * Stamps the customer's applied campaign code onto the checkout object the
   * PURCHASE click is about to charge.
   *
   * MUST be awaited BEFORE `confirmStripeIntent()`. The webhook reads the code
   * off the object as of the moment payment succeeded, so a write after the
   * confirm is a race the browser usually loses — and on a redirecting confirm
   * (3-D Secure) it never happens at all.
   *
   * NEVER THROWS, and never blocks the sale. The caller charges either way, and
   * a genuine holder keeps the unspent issuance in their rewards wallet.
   * Blocking a membership sale because a bonus lookup timed out is the worse
   * trade — the entries are recoverable, the sale is not.
   *
   * `outcome` exists because those failures are NOT equivalent to whoever reads
   * the logs. `"refused"` means the server answered and did not write the code:
   * a customer was charged without it. `"unknown"` means we stopped listening —
   * the request may well have succeeded (observed live: the server answered
   * `200 in 8089ms` against an 8s cap, having written the code). Reporting the
   * second as the first makes the one production alarm for this defect
   * untrustworthy, which is the state that hid the original bug.
   */
  const attachTypedCode = async (body: {
    target: TypedCodeCheckoutTarget;
    /** The RAW string the customer typed, or null to clear. The SERVER decides its kind. */
    code: string | null;
  }): Promise<{
    success: boolean;
    /** The canonical code the server wrote, or null when it wrote none. */
    code: string | null;
    /**
     * Which metadata key it landed in. This is the ONLY trustworthy basis for
     * telling the customer a code applied: the browser guessed the type, the
     * server decided it, and only "attached" plus a slot means it reached Stripe.
     */
    slot: CheckoutCodeSlot | null;
    outcome: "attached" | "refused" | "unknown";
  }> => {
    // Hard cap. The customer has already clicked PURCHASE and is watching a
    // spinner, so a few extra seconds is far cheaper than silently losing
    // money-equivalent entries — but it still must not stall checkout forever.
    // 15s is sized on what the server actually does: rate-limit check ->
    // request.json() -> getServerSession (DB) -> connectDB -> Stripe retrieve
    // with expand -> User.findOne -> two campaign/issuance reads -> Stripe
    // update. Two Stripe round trips plus three DB reads on a cold lambda does
    // not fit in 8s under load.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("/api/stripe/attach-typed-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({
          code: body.code,
          ...(body.target.kind === "subscription"
            ? {
                subscriptionId: body.target.subscriptionId,
                subscriptionRequestId: body.target.subscriptionRequestId,
              }
            : {
                paymentIntentId: body.target.paymentIntentId,
                clientSecret: body.target.clientSecret,
              }),
        }),
      });
      // The server answered. Whatever it said, it is a definite answer.
      if (!response.ok) return { success: false, code: null, slot: null, outcome: "refused" };
      const result = (await response.json()) as {
        success?: boolean;
        code?: string | null;
        slot?: CheckoutCodeSlot | null;
      };
      return result?.success === true
        ? { success: true, code: result.code ?? null, slot: result.slot ?? null, outcome: "attached" }
        : { success: false, code: null, slot: null, outcome: "refused" };
    } catch {
      // An abort or a dropped connection. The request may already have been
      // served — we simply stopped listening, so this is NOT evidence of loss.
      return { success: false, code: null, slot: null, outcome: "unknown" };
    } finally {
      clearTimeout(timer);
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
    attachTypedCode,
    confirmPayment,
    createPaymentMethod,
    loading,
    error,
    clearError: () => setError(null),
  };
}
