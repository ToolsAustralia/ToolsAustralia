"use client";

/**
 * PaymentForm — two sub-components that handle Stripe payment confirmation.
 *
 * CRITICAL STRIPE PRESERVATION RULES (do not alter without code review):
 * 1. `getStripePromise()` is called lazily inside `PaymentFormWithoutElements`
 *    (via `useMemo(() => getStripePromise(), [])`), NOT at module scope — a
 *    module-scope call would boot Stripe.js for every visitor who downloads
 *    this chunk, even ones who never open the modal (2026-07 perf audit).
 *    `getStripePromise()` itself still returns a module-level cached
 *    singleton (`src/lib/stripe-client.ts`) — Stripe prohibits
 *    re-instantiation per render — so `stripePromise` identity is stable
 *    across renders even though the call site is now inside the component.
 *    `PaymentFormWithElements` doesn't need it — it uses `useStripe()`/
 *    `useElements()` from the surrounding `<Elements>` provider instead.
 * 2. <Elements key={clientSecret || "no-secret"}> re-mount key is required for Stripe correctness.
 * 3. All useStripe(), useElements(), stripe.confirmPayment(), stripe.confirmCardPayment() calls
 *    are preserved byte-identically from the original StripePaymentModal.tsx.
 * 4. All error handling, retry logic, and billing details composition are preserved.
 * 5. All useEffect cancelled guards are preserved.
 *
 * Visual presentation uses Plan 4 Button primitive + Payment Element matching the
 * RenewalFailedModal pattern.
 */

import React, { useState, useMemo } from "react";
import { Stripe } from "@stripe/stripe-js";
import { PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { CreditCard, CheckCircle, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { type SavedPaymentMethod } from "@/hooks/useSavedPaymentMethods";
import { getStripePromise } from "@/lib/stripe-client";
import { paymentIntentIdFromClientSecret } from "@/lib/payment/payment-intent-id";
import { formatPaymentError } from "@/utils/payment/stripe/payment-error-messages";
import { type StripeBillingAddress } from "@/lib/payment/defaultBillingAddress";
import PaymentMethodSelector from "@/components/modals/PaymentMethodSelector";

/** Upgrade completed server-side with no PaymentIntent to poll */
export const IMMEDIATE_UPGRADE_NO_PI = "IMMEDIATE_UPGRADE_NO_PI";

export type { StripeBillingAddress };

// ============================================================
// Shared props interface
// ============================================================

export interface PaymentFormProps {
  clientSecret: string;
  packageName: string;
  packageId: string;
  amount: number;
  onPaymentSuccess: (paymentIntentId: string) => void;
  onClose: () => void;
  showCardForm: boolean;
  setShowCardForm: (show: boolean) => void;
  selectedPaymentMethod: SavedPaymentMethod | null;
  setSelectedPaymentMethod: (method: SavedPaymentMethod | null) => void;
  stripeBillingAddress: StripeBillingAddress;
  upgradeInfo?: {
    fromPackage: { name: string; price: number };
    toPackage: { name: string; price: number };
    billingInfo?: {
      currentBillingDate: string;
      nextBillingDate: string;
      nextBillingAmount: number;
      billingDateStays: boolean;
    };
  };
}

// ============================================================
// PaymentFormWithoutElements — used when a saved payment method is selected
// ============================================================

export const PaymentFormWithoutElements: React.FC<PaymentFormProps> = ({
  clientSecret,
  packageName,
  packageId,
  amount,
  onPaymentSuccess,
  onClose,
  showCardForm,
  setShowCardForm,
  selectedPaymentMethod,
  setSelectedPaymentMethod,
  stripeBillingAddress: _stripeBillingAddress,
  upgradeInfo,
}) => {
  const { showToast } = useToast();
  // Lazy Stripe boot — see the header comment's invariant #1. getStripePromise()
  // itself returns a module-level cached singleton, so this identity is stable
  // across renders.
  const stripePromise = useMemo(() => getStripePromise(), []);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [stripeInstance, setStripeInstance] = useState<Stripe | null>(null);
  // State for upgrade info - dynamically updated from API response
  const [_currentUpgradeInfo, setCurrentUpgradeInfo] = useState(upgradeInfo);

  React.useEffect(() => {
    stripePromise.then((stripe) => setStripeInstance(stripe));
  }, [stripePromise]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripeInstance) {
      return;
    }

    setIsProcessing(true);

    try {
      if (selectedPaymentMethod && !showCardForm) {
        let finalClientSecret = "";

        // ✅ FIX: Create upgrade payment when payment is confirmed
        if (clientSecret && clientSecret.length > 0) {
          finalClientSecret = clientSecret;
        } else {
          // ✅ FIX: Create upgrade payment when no existing payment intent
          const response = await fetch("/api/stripe/upgrade-subscription-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              newPackageId: packageId,
              paymentMethodId: selectedPaymentMethod.paymentMethodId,
            }),
          });

          const result = await response.json();

          if (!response.ok) {
            // Carry the body on `.data` (ApiError shape) so formatPaymentError
            // can show decline-specific guidance from code/decline_code.
            const apiError = new Error(result.error || result.details || "Failed to create upgrade payment");
            Object.assign(apiError, { data: result });
            throw apiError;
          }

          // ✅ UPDATE: Set upgrade info from API response
          if (result.data?.upgrade) {
            setCurrentUpgradeInfo({
              fromPackage: result.data.upgrade.fromPackage,
              toPackage: result.data.upgrade.toPackage,
              billingInfo: result.data.upgrade.billingInfo,
            });
          }

          // Check if payment was processed immediately (no PaymentIntent needed)
          if (result.data?.subscription && !result.data?.paymentIntent) {
            setIsProcessing(false);
            onPaymentSuccess(IMMEDIATE_UPGRADE_NO_PI);
            return;
          }

          // Get client secret from API response
          finalClientSecret = result.data?.paymentIntent?.clientSecret;
        }
        if (!finalClientSecret) {
          throw new Error("No payment intent received from server");
        }

        const piFromSecret = paymentIntentIdFromClientSecret(finalClientSecret);
        if (piFromSecret) {
          onPaymentSuccess(piFromSecret);
        }

        // Import client-side return URL utility
        const { getReturnUrlForPaymentTypeClient } = await import("@/utils/payment/stripe/payment-intent-config");

        const confirmResult = await stripeInstance.confirmPayment({
          clientSecret: finalClientSecret,
          confirmParams: {
            payment_method: selectedPaymentMethod.paymentMethodId,
            return_url: getReturnUrlForPaymentTypeClient("subscription"),
          },
        });

        if (confirmResult.error) {
          console.error("Stripe payment error:", confirmResult.error);
          throw new Error(confirmResult.error.message || "Payment failed");
        }

        const paymentIntent = (confirmResult as { paymentIntent?: { id: string; status: string } }).paymentIntent;

        if (paymentIntent && paymentIntent.status === "succeeded") {
          setIsSuccess(true);
        }
      } else {
        // If user wants to add new card, switch to Elements version
        setShowCardForm(true);
      }
    } catch (err: unknown) {
      console.error("Payment failed:", err);
      // Central payment-error copy: concise decline guidance when the API 400
      // carries code/decline_code, generic message otherwise.
      const formatted = formatPaymentError(err);
      showToast({
        type: "error",
        title: formatted.title,
        message: formatted.message,
        duration: 10000,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-6">
        <CheckCircle className="w-16 h-16 text-green-500 dark:text-green-400 mb-4" />
        <h3 className="text-xl font-semibold text-gray-900 dark:text-neutral-100 mb-2">Payment Successful!</h3>
        <p className="text-gray-600 dark:text-neutral-400 text-center mb-6">
          Your upgrade to {packageName} has been processed. Your new benefits are now active!
        </p>
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 dark:border-green-400"></div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-4">
        {/* Payment Method Selection */}
        <PaymentMethodSelector
          onPaymentMethodSelect={setSelectedPaymentMethod}
          onAddNewPaymentMethod={() => setShowCardForm(true)}
          selectedPaymentMethod={selectedPaymentMethod}
          isAuthenticated={true}
          showCardForm={showCardForm}
          setupIntentClientSecret={null}
          cardFormRef={{ current: null }}
          onCardElementChange={() => {}}
          cardFormError={null}
          isCreatingSetupIntent={false}
          amount={amount}
          packageName={packageName}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr] gap-2 sm:gap-3 pt-1">
        <Button
          type="button"
          variant="outline"
          tone="neutral"
          size="md"
          onClick={onClose}
          disabled={isProcessing}
          className="w-full"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          tone="red"
          size="md"
          loading={isProcessing}
          disabled={!stripeInstance || (!selectedPaymentMethod && !showCardForm) || isProcessing}
          className="w-full"
        >
          {!isProcessing && <CreditCard className="w-4 h-4" aria-hidden />}
          Pay ${(amount / 100).toFixed(2)}
        </Button>
      </div>

      <p className="text-xs text-neutral-500 text-center">
        Your payment is secured by Stripe.
      </p>
    </form>
  );
};

// ============================================================
// PaymentFormWithElements — used when entering a new card
// ============================================================

export const PaymentFormWithElements: React.FC<PaymentFormProps> = ({
  clientSecret,
  packageName,
  packageId,
  amount,
  onPaymentSuccess,
  onClose,
  stripeBillingAddress,
  upgradeInfo,
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const { showToast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [elementsError, setElementsError] = useState<string | null>(null);
  const [_currentUpgradeInfo, setCurrentUpgradeInfo] = useState(upgradeInfo);

  // Debug logging and timeout
  React.useEffect(() => {
    // Check if clientSecret is valid (but allow empty for dynamic creation)
    if (clientSecret && !clientSecret.includes("_secret_")) {
      console.error("Invalid clientSecret format:", clientSecret);
      setElementsError("Invalid payment configuration");
    }

    // Set a timeout to show error if Elements doesn't load within 10 seconds
    const timeout = setTimeout(() => {
      if (!stripe || !elements) {
        setElementsError("Payment form is taking longer than expected to load. Please try again.");
      }
    }, 10000);

    return () => clearTimeout(timeout);
  }, [stripe, elements, clientSecret]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      let secretToConfirm = clientSecret;

      // ✅ NEW: Check if payment intent already exists (created when modal opened)
      if (clientSecret && clientSecret.length > 0) {
        // Using existing payment intent
      } else {
        // First, create the upgrade payment (API call)
        const response = await fetch("/api/stripe/upgrade-subscription-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ newPackageId: packageId }),
        });

        const result = await response.json();

        if (!response.ok) {
          // Carry the body on `.data` (ApiError shape) so formatPaymentError
          // can show decline-specific guidance from code/decline_code.
          const apiError = new Error(result.error || result.details || "Failed to create upgrade payment");
          Object.assign(apiError, { data: result });
          throw apiError;
        }

        // ✅ UPDATE: Set upgrade info from API response
        if (result.data?.upgrade) {
          setCurrentUpgradeInfo({
            fromPackage: result.data.upgrade.fromPackage,
            toPackage: result.data.upgrade.toPackage,
            billingInfo: result.data.upgrade.billingInfo,
          });
        }

        // Check if payment was processed immediately (no PaymentIntent needed)
        if (result.data?.subscription && !result.data?.paymentIntent) {
          setIsProcessing(false);
          onPaymentSuccess(IMMEDIATE_UPGRADE_NO_PI);
          return;
        }

        secretToConfirm = result.data?.paymentIntent?.clientSecret ?? "";
      }

      // Now confirm the payment with the client secret
      if (!secretToConfirm) {
        throw new Error("No payment intent received from server");
      }

      const piFromSecret = paymentIntentIdFromClientSecret(secretToConfirm);
      if (piFromSecret) {
        onPaymentSuccess(piFromSecret);
      }

      // ✅ CRITICAL: PaymentElement requires elements.submit() before confirmPayment()
      // This validates the form and prepares it for confirmation
      const { error: submitError } = await elements.submit();

      if (submitError) {
        throw new Error(submitError.message || "Please complete all required fields.");
      }

      // ✅ CRITICAL: When billingDetails: "never" is set, we must provide complete billing details here
      // Stripe requires all address fields (country, state, city, postal_code, line1) when fields.billingDetails is "never"
      const { getReturnUrlForPaymentTypeClient } = await import("@/utils/payment/stripe/payment-intent-config");

      const confirmResult = await stripe.confirmPayment({
        clientSecret: secretToConfirm,
        confirmParams: {
          payment_method_data: {
            billing_details: {
              address: {
                country: stripeBillingAddress.country,
                state: stripeBillingAddress.state,
                city: stripeBillingAddress.city,
                postal_code: stripeBillingAddress.postal_code,
                line1: stripeBillingAddress.line1,
              },
            },
          },
          return_url: getReturnUrlForPaymentTypeClient("subscription"),
        },
        redirect: "if_required",
      });

      // For Elements, we need to check the payment intent status
      const paymentIntent = confirmResult.paymentIntent;
      if (paymentIntent && paymentIntent.status === "succeeded") {
        setIsSuccess(true);
      }
    } catch (err: unknown) {
      console.error("Payment failed:", err);
      // Central payment-error copy: concise decline guidance when the API 400
      // carries code/decline_code, generic message otherwise.
      const formatted = formatPaymentError(err);
      showToast({
        type: "error",
        title: formatted.title,
        message: formatted.message,
        duration: 10000,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-6">
        <CheckCircle className="w-16 h-16 text-green-500 dark:text-green-400 mb-4" />
        <h3 className="text-xl font-semibold text-gray-900 dark:text-neutral-100 mb-2">Payment Successful!</h3>
        <p className="text-gray-600 dark:text-neutral-400 text-center mb-6">
          Your upgrade to {packageName} has been processed. Your new benefits are now active!
        </p>
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 dark:border-green-400"></div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-4">
        <div className="flex items-center space-x-2 text-sm text-neutral-600">
          <CreditCard className="w-4 h-4" />
          <span>Enter new card details</span>
        </div>

        <div className="border border-neutral-200 dark:border-neutral-700 rounded-xl p-4 bg-white dark:bg-neutral-900">
          {elementsError ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="text-red-500 mb-2">Payment Form Error</div>
                <div className="text-sm text-neutral-600 mb-4">{elementsError}</div>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : !stripe || !elements ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-7 h-7 border-b-2 text-red-600 animate-spin" />
              <span className="ml-3 text-neutral-600 text-sm">Loading payment form...</span>
            </div>
          ) : (
            <PaymentElement
              options={{
                layout: "tabs",
                wallets: {
                  applePay: "auto",
                },
                paymentMethodOrder: ["card", "apple_pay"],
                fields: {
                  billingDetails: "never",
                },
                terms: {
                  card: "never",
                  applePay: "never",
                },
              }}
              id="payment-element"
              onLoadError={(error) => {
                console.error("PaymentElement load error:", error);
                setElementsError("Failed to load payment form");
              }}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr] gap-2 sm:gap-3 pt-1">
        <Button
          type="button"
          variant="outline"
          tone="neutral"
          size="md"
          onClick={onClose}
          disabled={isProcessing}
          className="w-full"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          tone="red"
          size="md"
          loading={isProcessing}
          disabled={!stripe || !elements || isProcessing}
          className="w-full"
        >
          {!isProcessing && <CreditCard className="w-4 h-4" aria-hidden />}
          Pay ${(amount / 100).toFixed(2)}
        </Button>
      </div>

      <p className="text-xs text-neutral-500 text-center">
        Your payment is secured by Stripe.
      </p>
    </form>
  );
};
