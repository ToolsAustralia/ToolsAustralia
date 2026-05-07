"use client";

/**
 * RenewalFailedModal Component
 *
 * Modal for handling failed subscription renewal payments.
 * Allows users to pay their existing failed invoice using the existing PaymentIntent.
 *
 * Features:
 * - Shows saved payment methods for selection
 * - Allows entering a new payment method
 * - Displays clear error messages (both error and details)
 * - Automatically saves new payment methods and sets as default
 * - Handles success/error states
 * - Can be closed and reopened from settings
 */

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { getStripePromise } from "@/lib/stripe-client";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { StripeInlineCardSetupForm } from "@/components/payment/StripeInlineCardSetupForm";
import { ModalContainer, ModalHeader, ModalContent, Button } from "@/components/modals/ui";
import { useToast } from "@/components/ui/Toast";
import { AlertTriangle, CreditCard, Loader2, CheckCircle, XCircle, Mail } from "lucide-react";
import {
  usePayFailedInvoice,
  useUpdateSubscriptionPaymentMethod,
  type PayFailedInvoiceFailureCode,
} from "@/hooks/queries/useSubscriptionQueries";
import { ApiError } from "@/lib/queries";
import { formatPaymentError } from "@/utils/payment/stripe/payment-error-messages";
import { paymentIntentIdFromClientSecret } from "@/utils/payment/stripe/stripe-excessive-retry";
import { useSavedPaymentMethods, type SavedPaymentMethod } from "@/hooks/useSavedPaymentMethods";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useUserContext } from "@/contexts/UserContext";
import { formatDisplayName } from "@/utils/display-name";
import { SUPPORT_EMAIL } from "@/lib/email/sender-identities";
import { useThemeStore } from "@/stores/useThemeStore";
import { buildMembershipStripeAppearance } from "@/utils/payment/stripe/membership-stripe-appearance";

const stripePromise = getStripePromise();

const RENEWAL_BILLING_SUPPORT_SUBJECT = encodeURIComponent("Subscription renewal – cannot pay invoice");
function renewalBillingSupportMailto(): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${RENEWAL_BILLING_SUPPORT_SUBJECT}`;
}

function errorPayloadSuggestsMissingDefaultPm(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (d.requiresNewCardPreflight === true) return true;
  const details = typeof d.details === "string" ? d.details : "";
  const err = typeof d.error === "string" ? d.error : "";
  const combined = `${details} ${err}`;
  return (
    combined.includes("default_payment_method") ||
    combined.includes("Default payment method") ||
    combined.includes("no `default_payment_method`")
  );
}

interface RenewalFailedModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Payment Form Component (for Payment Element)
 * Handles payment confirmation with Payment Element
 */
const PaymentForm: React.FC<{
  clientSecret: string;
  paymentIntentId?: string | null;
  amount: number;
  currency: string;
  selectedPaymentMethod?: SavedPaymentMethod | null;
  onPaymentSuccess: (paymentMethodId?: string) => void;
  onPaymentError: (error: string, details?: string, meta?: { requiresDifferentPaymentMethod?: boolean }) => void;
  onCancel: () => void;
}> = ({ clientSecret, paymentIntentId, selectedPaymentMethod, onPaymentSuccess, onPaymentError, onCancel }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { showToast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const { savePaymentMethod } = useSavedPaymentMethods();
  const { userData } = useUserContext();
  
  // Build billing details - MUST include name (Stripe requirement when billingDetails: "never")
  // This matches the pattern used in PaymentMethodSelector
  const buildBillingDetails = () => {
    const fullName = formatDisplayName(userData?.firstName, userData?.lastName) || userData?.email || "Customer";
    
    return {
      name: fullName,
      email: userData?.email,
      phone: userData?.mobile,
      address: {
        country: "AU",
        state: "NSW",
        city: "Sydney",
        postal_code: "2000",
        line1: "1 Martin Place",
      },
    };
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      // If a saved payment method is selected, use it directly
      if (selectedPaymentMethod) {
        const confirmResult = await stripe.confirmCardPayment(clientSecret, {
          payment_method: selectedPaymentMethod.paymentMethodId,
        });

        if (confirmResult.error) {
          throw new Error(confirmResult.error.message || "Payment failed");
        }

        if (confirmResult.paymentIntent && confirmResult.paymentIntent.status === "succeeded") {
          onPaymentSuccess(selectedPaymentMethod.paymentMethodId);
          return;
        }

        throw new Error("Payment was not successful");
      }

      // Otherwise, use Payment Element for new card entry
      // Submit form to validate
      const { error: submitError } = await elements.submit();

      if (submitError) {
        throw new Error(submitError.message || "Please complete all required fields.");
      }

            // Confirm payment
            // ✅ Provide billing_details in confirmParams since we set fields.billingDetails to "never"
            // Stripe requires this when billing details are hidden in Payment Element
            // MUST include name field (required by Stripe)
            const billingDetailsData = buildBillingDetails();
            // Import client-side return URL utility
            const { getReturnUrlForPaymentTypeClient } = await import("@/utils/payment/stripe/payment-intent-config");
            
            const confirmResult = await stripe.confirmPayment({
              elements,
              clientSecret,
              confirmParams: {
                payment_method_data: {
                  billing_details: billingDetailsData,
                },
                return_url: getReturnUrlForPaymentTypeClient("subscription"),
              },
              redirect: "if_required",
            });

      if (confirmResult.error) {
        throw new Error(confirmResult.error.message || "Payment failed");
      }

      const paymentIntent = confirmResult.paymentIntent;
      if (paymentIntent && paymentIntent.status === "succeeded") {
        // Extract payment method ID and save it
        if (paymentIntent.payment_method) {
          const paymentMethodId =
            typeof paymentIntent.payment_method === "string"
              ? paymentIntent.payment_method
              : paymentIntent.payment_method.id;

          // Automatically save payment method and set as default
          try {
            await savePaymentMethod(paymentMethodId, true);
          } catch (saveError) {
            console.warn("Could not save payment method:", saveError);
            // Don't fail the payment flow if saving fails
          }
        }

        // ✅ PaymentIntent is already attached to the invoice (via stripe.invoices.pay())
        // No need to manually pay the invoice - webhook will handle invoice.paid event
        // When PaymentIntent succeeds, Stripe will automatically mark the invoice as paid
        onPaymentSuccess(paymentIntent.payment_method as string | undefined);
      } else {
        throw new Error("Payment was not successful");
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Payment could not be processed. Please try again.";
      const piId = paymentIntentId ?? paymentIntentIdFromClientSecret(clientSecret);
      let requiresDifferentPm = false;
      if (piId) {
        try {
          const res = await fetch("/api/stripe/analyze-payment-intent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ paymentIntentId: piId }),
          });
          if (res.ok) {
            const body = (await res.json()) as { requiresDifferentPaymentMethod?: boolean };
            requiresDifferentPm = body.requiresDifferentPaymentMethod === true;
          }
        } catch {
          // ignore — fall back to generic error
        }
      }
      const toastPayload = requiresDifferentPm ? formatPaymentError({ requiresDifferentPaymentMethod: true }) : null;
      onPaymentError(errorMessage, undefined, { requiresDifferentPaymentMethod: requiresDifferentPm });
      showToast({
        type: "error",
        title: toastPayload?.title ?? "Payment Failed",
        message: toastPayload?.message ?? errorMessage,
        duration: 10000,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
      {/* Show selected payment method if one is selected */}
      {selectedPaymentMethod && (
        <div className="bg-gray-50 dark:bg-neutral-800/80 border border-gray-200 dark:border-neutral-700 rounded-lg p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-neutral-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-gray-900 dark:text-neutral-100 text-xs sm:text-sm">
                  {selectedPaymentMethod.card?.brand?.toUpperCase() || "Card"} •••• {selectedPaymentMethod.card?.last4 || ""}
                </p>
                <p className="text-[10px] sm:text-xs text-gray-500 dark:text-neutral-400">Using saved payment method</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Element - only show if no saved payment method selected */}
      {!selectedPaymentMethod && (
        <div className="border border-gray-200 dark:border-neutral-700 dark:bg-neutral-900/30 rounded-lg p-3 sm:p-4">
          {!stripe || !elements ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
              <span className="ml-3 text-gray-600 dark:text-neutral-400">Loading payment form...</span>
            </div>
          ) : (
            <PaymentElement
              options={{
                layout: "tabs",
                wallets: {
                  applePay: "auto",
                  googlePay: "auto",
                },
                paymentMethodOrder: ["card", "apple_pay", "google_pay"],
                // Don't hide billing details - Payment Element needs it when user enters new card
                // But we'll provide it in confirmParams
                fields: {
                  billingDetails: {
                    name: "never",
                    email: "never",
                    phone: "never",
                    address: "never",
                  },
                },
                terms: {
                  card: "never",
                  applePay: "never",
                  googlePay: "never",
                },
              }}
              id="payment-element"
            />
          )}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-2 sm:pt-4">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onCancel} 
          disabled={isProcessing} 
          className="flex-1 text-sm sm:text-base"
          size="sm"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!stripe || (!elements && !selectedPaymentMethod) || isProcessing}
          className="flex-1 bg-red-600 hover:bg-red-700 text-sm sm:text-base"
          size="sm"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2" />
              Pay Now
            </>
          )}
        </Button>
      </div>

      <div className="text-[10px] sm:text-xs text-gray-500 text-center">
        Your payment is secured by Stripe. Your card details are never stored on our servers.
      </div>
    </form>
  );
};

/**
 * Main RenewalFailedModal Component
 */
const RenewalFailedModal: React.FC<RenewalFailedModalProps> = ({ isOpen, onClose }) => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const payFailedInvoiceMutation = usePayFailedInvoice();
  const updateSubscriptionPaymentMethod = useUpdateSubscriptionPaymentMethod();
  const { paymentMethods, loading: _paymentMethodsLoading, savePaymentMethod } = useSavedPaymentMethods();
  const { userData } = useUserContext();
  const isDarkMode = useThemeStore((s) => s.theme === "dark");
  const membershipStripeAppearance = useMemo(() => buildMembershipStripeAppearance(isDarkMode), [isDarkMode]);

  // State management
  const [paymentState, setPaymentState] = useState<{
    requiresConfirmation: boolean;
    clientSecret?: string;
    paymentIntentId?: string;
    amount?: number;
    currency?: string;
    invoiceId?: string;
  } | null>(null);
  const [requiresDifferentPaymentMethod, setRequiresDifferentPaymentMethod] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<SavedPaymentMethod | null>(null);
  const [_showPaymentMethods, setShowPaymentMethods] = useState(false);
  /** invoice_not_payable / payment_intent_not_payable: same API cannot collect without billing repair */
  const [terminalCollectionFailure, setTerminalCollectionFailure] =
    useState<PayFailedInvoiceFailureCode | null>(null);
  /** No default PM on Stripe Customer (e.g. user removed all cards) — show SetupIntent inline before retry */
  const [showInlineCardSetup, setShowInlineCardSetup] = useState(false);
  const [setupIntentSecret, setSetupIntentSecret] = useState<string | null>(null);
  const [loadingSetupIntent, setLoadingSetupIntent] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setPaymentState(null);
      setIsLoading(false);
      setIsSuccess(false);
      setError(null);
      setErrorDetails(null);
      setSelectedPaymentMethod(null);
      setShowPaymentMethods(false);
      setRequiresDifferentPaymentMethod(false);
      setTerminalCollectionFailure(null);
      setShowInlineCardSetup(false);
      setSetupIntentSecret(null);
      setLoadingSetupIntent(false);
      // Don't auto-trigger - let user click "Resolve Payment Issue" button
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !showInlineCardSetup || setupIntentSecret) return;
    let cancelled = false;
    setLoadingSetupIntent(true);
    void (async () => {
      try {
        const res = await fetch("/api/stripe/create-setup-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const data = (await res.json()) as { success?: boolean; client_secret?: string; error?: string };
        if (cancelled) return;
        if (res.ok && data.success && data.client_secret) {
          setSetupIntentSecret(data.client_secret);
        } else {
          showToast({
            type: "error",
            title: "Could not load card form",
            message: data.error || "Try again or add a card in account settings.",
          });
        }
      } catch {
        if (!cancelled) {
          showToast({
            type: "error",
            title: "Could not load card form",
            message: "Please try again.",
          });
        }
      } finally {
        if (!cancelled) setLoadingSetupIntent(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, showInlineCardSetup, setupIntentSecret, showToast]);

  // Handle "Resolve Payment Issue" button click
  const handleResolvePayment = async () => {
    setIsLoading(true);
    setError(null);
    setErrorDetails(null);
    setTerminalCollectionFailure(null);

    try {
      const response = await payFailedInvoiceMutation.mutateAsync();

      if (response.success) {
        // Invoice already paid
        setIsSuccess(true);
        queryClient.invalidateQueries({ queryKey: queryKeys.users.detail("current") });
        queryClient.invalidateQueries({ queryKey: queryKeys.users.account("current") });
        setTimeout(() => {
          onClose();
        }, 2000);
      } else if (response.requiresPaymentConfirmation && response.data?.paymentIntent?.clientSecret) {
        // Payment requires confirmation via Payment Element
        setRequiresDifferentPaymentMethod(false);
        setPaymentState({
          requiresConfirmation: true,
          clientSecret: response.data.paymentIntent.clientSecret,
          paymentIntentId: response.data.paymentIntent.id,
          amount: response.data.paymentIntent.amount,
          currency: response.data.paymentIntent.currency || "aud",
          invoiceId: response.data.invoiceId,
        });
        setShowPaymentMethods(true);
      } else {
        // Extract error and details from response
        const errorMsg = (response as { error?: string; message?: string }).error || 
                        (response as { message?: string }).message || 
                        "Failed to process payment";
        const details = (response as { details?: string }).details;
        throw new Error(errorMsg + (details ? `: ${details}` : ""));
      }
    } catch (err: unknown) {
      if (err instanceof ApiError && err.data && typeof err.data === "object" && err.data !== null) {
        const d = err.data as Record<string, unknown>;
        if (
          d.requiresNewCardPreflight === true ||
          (errorPayloadSuggestsMissingDefaultPm(err.data) && d.requiresDifferentPaymentMethod !== true)
        ) {
          setShowInlineCardSetup(true);
          setError(null);
          setErrorDetails(null);
          setTerminalCollectionFailure(null);
          setRequiresDifferentPaymentMethod(false);
          setIsLoading(false);
          return;
        }
        if (d.requiresDifferentPaymentMethod === true) {
          setRequiresDifferentPaymentMethod(true);
          const formatted = formatPaymentError(err.data);
          setError(formatted.title);
          setErrorDetails(formatted.message);
          showToast({
            type: "error",
            title: formatted.title,
            message: formatted.message,
            duration: 12000,
          });
        } else if (
          d.failureCode === "invoice_not_payable" ||
          d.failureCode === "payment_intent_not_payable"
        ) {
          setTerminalCollectionFailure(d.failureCode as PayFailedInvoiceFailureCode);
          setRequiresDifferentPaymentMethod(false);
          const formatted = formatPaymentError(err.data);
          setError(formatted.title);
          setErrorDetails(formatted.message);
          showToast({
            type: "error",
            title: formatted.title,
            message: formatted.message,
            duration: 14000,
          });
        } else {
          const errorMsg =
            (typeof d.error === "string" && d.error) || err.message || "Failed to process payment";
          const details = typeof d.details === "string" ? d.details : null;
          setError(errorMsg);
          setErrorDetails(details);
          showToast({
            type: "error",
            title: errorMsg,
            message: details || errorMsg,
            duration: 10000,
          });
        }
      } else if (err && typeof err === "object") {
        // Check if it's an ApiError with data property
        const apiError = err as { 
          name?: string; 
          message?: string; 
          data?: { error?: string; details?: string } | string;
        };
        
        // Try to extract error and details from ApiError.data
        let errorMsg = apiError.message || "Failed to process payment";
        let details: string | null = null;
        
        if (apiError.data) {
          if (typeof apiError.data === "object" && apiError.data !== null) {
            errorMsg = apiError.data.error || errorMsg;
            details = apiError.data.details || null;
          } else if (typeof apiError.data === "string") {
            details = apiError.data;
          }
        }
        
        setError(errorMsg);
        setErrorDetails(details);
        showToast({
          type: "error",
          title: errorMsg,
          message: details || errorMsg,
          duration: 10000,
        });
      } else {
        const errorMessage = err instanceof Error ? err.message : "Failed to process payment. Please try again.";
        setError(errorMessage);
        setErrorDetails(null);
        showToast({
          type: "error",
          title: "Payment Error",
          message: errorMessage,
          duration: 10000,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleInlineCardSaved = async (paymentMethodId: string) => {
    setIsLoading(true);
    setError(null);
    setErrorDetails(null);
    try {
      const saved = await savePaymentMethod(paymentMethodId, true);
      if (!saved) {
        throw new Error("Could not save payment method");
      }
      await updateSubscriptionPaymentMethod.mutateAsync(paymentMethodId);
      if (userData?._id) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.paymentMethods.all(userData._id) });
      }
      setShowInlineCardSetup(false);
      setSetupIntentSecret(null);
      showToast({
        type: "success",
        title: "Card saved",
        message: "Retrying your renewal payment…",
        duration: 3000,
      });
      await handleResolvePayment();
    } catch (e) {
      showToast({
        type: "error",
        title: "Could not save card",
        message: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle payment success from Payment Element
  const handlePaymentSuccess = async (_paymentMethodId?: string) => {
    setIsSuccess(true);
    // Invalidate queries to refresh user data
    queryClient.invalidateQueries({ queryKey: queryKeys.users.detail("current") });
    queryClient.invalidateQueries({ queryKey: queryKeys.users.account("current") });

    showToast({
      type: "success",
      title: "Payment Successful",
      message: "Your subscription has been reactivated. Your benefits are now active.",
      duration: 5000,
    });

    // Close modal after a short delay
    setTimeout(() => {
      onClose();
    }, 2000);
  };

  // Handle payment error from Payment Element
  const handlePaymentError = (
    errorMessage: string,
    details?: string,
    meta?: { requiresDifferentPaymentMethod?: boolean }
  ) => {
    if (meta?.requiresDifferentPaymentMethod) {
      setRequiresDifferentPaymentMethod(true);
    }
    setError(errorMessage);
    setErrorDetails(details || null);
  };

  // Format card display
  const formatCardDisplay = (paymentMethod: SavedPaymentMethod) => {
    if (!paymentMethod.card) return "Payment Method";
    return `${paymentMethod.card.brand.toUpperCase()} •••• ${paymentMethod.card.last4}`;
  };

  // Success state
  if (isSuccess) {
    return (
      <ModalContainer isOpen={isOpen} onClose={onClose} size="md" testId="renewal-failed-modal">
        <ModalHeader title="Payment Successful" onClose={onClose} />
        <ModalContent className="p-6">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 dark:text-green-400 mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-neutral-100 mb-2">Subscription Reactivated!</h3>
            <p className="text-gray-600 dark:text-neutral-400">
              Your payment was successful. Your subscription is now active and your benefits have been restored.
            </p>
          </div>
        </ModalContent>
      </ModalContainer>
    );
  }

  // Payment Element state (requires confirmation)
  if (paymentState?.requiresConfirmation && paymentState.clientSecret) {
    return (
      <ModalContainer isOpen={isOpen} onClose={onClose} size="md" closeOnBackdrop={false} testId="renewal-failed-modal">
        <ModalHeader title="Complete Payment" onClose={onClose} />
        <ModalContent className="p-4 sm:p-6">
          {requiresDifferentPaymentMethod && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-700 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs sm:text-sm font-semibold text-amber-900 dark:text-amber-100 mb-1">
                    Use a different card
                  </h4>
                  <p className="text-xs sm:text-sm text-amber-800 dark:text-amber-200">
                    This card cannot be retried right now due to repeated declines. Select “Enter new payment method” or another saved card.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Alert Banner */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h4 className="text-xs sm:text-sm font-semibold text-red-900 mb-1">Payment Required</h4>
                <p className="text-xs sm:text-sm text-red-700">
                  Please complete the payment below to reactivate your subscription.
                </p>
              </div>
            </div>
          </div>

          {/* Payment Amount */}
          {paymentState.amount && (
            <div className="bg-gray-50 dark:bg-neutral-800/80 dark:border dark:border-neutral-700 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-neutral-200">Amount Due:</span>
                <span className="text-base sm:text-lg font-bold text-gray-900 dark:text-neutral-100">
                  ${((paymentState.amount || 0) / 100).toFixed(2)} {paymentState.currency?.toUpperCase() || "AUD"}
                </span>
              </div>
            </div>
          )}

          {/* Error Display - Show both error and details */}
          {(error || errorDetails) && (
            <div className="mb-3 sm:mb-4 p-3 sm:p-4 bg-red-50 dark:bg-red-950/25 border border-red-200 dark:border-red-900/45 rounded-lg">
              <div className="flex items-start gap-2">
                <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  {error && <p className="text-red-900 dark:text-red-200 font-semibold text-xs sm:text-sm mb-1">{error}</p>}
                  {errorDetails && (
                    <p className="text-red-700 dark:text-red-300 text-xs sm:text-sm">{errorDetails}</p>
                  )}
                  {!errorDetails && error && (
                    <p className="text-red-700 dark:text-red-300 text-xs sm:text-sm">{error}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Saved Payment Methods Selection */}
          {paymentMethods.length > 0 && (
            <div className="mb-4 sm:mb-6">
              <h4 className="text-xs sm:text-sm font-semibold text-gray-900 mb-2 sm:mb-3">Choose a Payment Method</h4>
              <div className="space-y-2">
                {paymentMethods.map((pm) => (
                  <button
                    key={pm.paymentMethodId}
                    type="button"
                    onClick={() => setSelectedPaymentMethod(pm)}
                    className={`w-full p-3 sm:p-4 border-2 rounded-lg text-left transition-colors ${
                      selectedPaymentMethod?.paymentMethodId === pm.paymentMethodId
                        ? "border-red-600 bg-red-50 dark:bg-red-950/30"
                        : "border-gray-200 dark:border-neutral-600 hover:border-gray-300 dark:hover:border-neutral-500 bg-white dark:bg-neutral-900/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-neutral-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 dark:text-neutral-100 text-xs sm:text-sm truncate">{formatCardDisplay(pm)}</p>
                          {pm.isDefault && (
                            <p className="text-[10px] sm:text-xs text-gray-500 dark:text-neutral-400">Default payment method</p>
                          )}
                        </div>
                      </div>
                      {selectedPaymentMethod?.paymentMethodId === pm.paymentMethodId && (
                        <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0">
                          <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-white"></div>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSelectedPaymentMethod(null)}
                  className={`w-full p-3 sm:p-4 border-2 rounded-lg text-left transition-colors ${
                    !selectedPaymentMethod
                      ? "border-red-600 bg-red-50 dark:bg-red-950/30"
                      : "border-gray-200 dark:border-neutral-600 hover:border-gray-300 dark:hover:border-neutral-500 bg-white dark:bg-neutral-900/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-neutral-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 dark:text-neutral-100 text-xs sm:text-sm">Enter new payment method</p>
                        <p className="text-[10px] sm:text-xs text-gray-500 dark:text-neutral-400">Use a different card</p>
                      </div>
                    </div>
                    {!selectedPaymentMethod && (
                      <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0">
                        <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-white"></div>
                      </div>
                    )}
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Payment Element */}
          <Elements
            key={paymentState.clientSecret || "no-secret"}
            stripe={stripePromise}
            options={{
              clientSecret: paymentState.clientSecret,
              appearance: {
                theme: "stripe",
                variables: {
                  colorPrimary: "#ee0000",
                  colorBackground: "#ffffff",
                  colorText: "#1f2937",
                  colorDanger: "#dc2626",
                  fontFamily: "system-ui, sans-serif",
                  spacingUnit: "4px",
                  borderRadius: "8px",
                  fontSizeBase: "14px",
                },
                rules: {
                  ".Tab": {
                    display: "flex",
                    alignItems: "center",
                    flexDirection: "row",
                    gap: "8px",
                  },
                  ".Tab--selected": {
                    display: "flex",
                    alignItems: "center",
                    flexDirection: "row",
                    gap: "8px",
                  },
                  "button[role='tab']": {
                    display: "flex",
                    alignItems: "center",
                    flexDirection: "row",
                    gap: "8px",
                  },
                  ".TabIcon, svg, img": {
                    display: "inline-flex",
                    alignItems: "center",
                    flexShrink: "0",
                    marginRight: "0",
                  },
                  ".TabLabel, span": {
                    display: "inline-flex",
                    alignItems: "center",
                  },
                  ".Input": {
                    fontSize: "14px",
                    padding: "10px",
                    minHeight: "auto",
                  },
                },
              },
            }}
          >
            <PaymentForm
              clientSecret={paymentState.clientSecret}
              paymentIntentId={paymentState.paymentIntentId}
              amount={paymentState.amount || 0}
              currency={paymentState.currency || "aud"}
              selectedPaymentMethod={selectedPaymentMethod}
              onPaymentSuccess={handlePaymentSuccess}
              onPaymentError={handlePaymentError}
              onCancel={onClose}
            />
          </Elements>
        </ModalContent>
      </ModalContainer>
    );
  }

  // Initial/Loading state
  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="md" closeOnBackdrop={false} testId="renewal-failed-modal">
      <ModalHeader title="Subscription Renewal Failed" onClose={onClose} />
      <ModalContent className="p-4 sm:p-6">
        {requiresDifferentPaymentMethod && (
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-700 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h4 className="text-xs sm:text-sm font-semibold text-amber-900 dark:text-amber-100 mb-1">
                  Use a different card
                </h4>
                <p className="text-xs sm:text-sm text-amber-800 dark:text-amber-200">
                  This card cannot be retried right now due to repeated declines. Add a new card in account settings, or contact support if you need help.
                </p>
              </div>
            </div>
          </div>
        )}

        {showInlineCardSetup && (
          <div className="mb-4 sm:mb-6 space-y-3 rounded-lg border-2 border-gray-200 dark:border-neutral-700 border-l-4 border-l-red-500 dark:border-l-red-400 p-3 sm:p-4 bg-gray-50 dark:bg-neutral-800/90 shadow-sm">
            <div className="flex items-start gap-2">
              <CreditCard className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Add a payment method</h4>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-400 mt-1">
                  There is no card on file for this renewal. Enter your new card below — we&apos;ll save it and retry your payment automatically.
                </p>
              </div>
            </div>
            {loadingSetupIntent && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-600 dark:text-neutral-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                Preparing secure form…
              </div>
            )}
            {setupIntentSecret && !loadingSetupIntent && (
              <Elements
                key={`${setupIntentSecret}-inline-${isDarkMode ? "d" : "l"}`}
                stripe={stripePromise}
                options={{
                  clientSecret: setupIntentSecret,
                  locale: "en",
                  appearance: membershipStripeAppearance,
                }}
              >
                <StripeInlineCardSetupForm
                  clientSecret={setupIntentSecret}
                  userEmail={userData?.email}
                  userName={formatDisplayName(userData?.firstName, userData?.lastName) || undefined}
                  userPhone={userData?.mobile}
                  onSuccess={handleInlineCardSaved}
                  disabled={isLoading}
                  submitLabel="Save card & retry payment"
                />
              </Elements>
            )}
          </div>
        )}

        {/* Alert Banner — shorter when terminal billing: detailed guidance is in error box below */}
        {!showInlineCardSetup && (
        <div
          className={
            terminalCollectionFailure
              ? "bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6"
              : "bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6"
          }
        >
          <div className="flex items-start gap-2">
            <AlertTriangle
              className={`w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 mt-0.5 ${
                terminalCollectionFailure ? "text-neutral-600 dark:text-neutral-400" : "text-red-600"
              }`}
            />
            <div className="flex-1 min-w-0">
              <h4
                className={`text-xs sm:text-sm font-semibold mb-1 ${
                  terminalCollectionFailure
                    ? "text-neutral-900 dark:text-neutral-100"
                    : "text-red-900"
                }`}
              >
                {terminalCollectionFailure ? "Renewal payment blocked" : "Payment Required"}
              </h4>
              <p
                className={`text-xs sm:text-sm ${
                  terminalCollectionFailure
                    ? "text-neutral-700 dark:text-neutral-300"
                    : "text-red-700"
                }`}
              >
                {terminalCollectionFailure
                  ? "We can’t start card payment for this renewal on this screen. Use Contact support or your account below."
                  : "Your subscription renewal payment failed. Please resolve the payment issue to reactivate your subscription."}
              </p>
            </div>
          </div>
        </div>
        )}

        {/* Error Display - Show both error and details */}
        {(error || errorDetails) && !showInlineCardSetup && (
          <div className="mb-3 sm:mb-4 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-2">
              <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                {error && <p className="text-red-900 font-semibold text-xs sm:text-sm mb-1">{error}</p>}
                {errorDetails && (
                  <p className="text-red-700 text-xs sm:text-sm">{errorDetails}</p>
                )}
                {!errorDetails && error && (
                  <p className="text-red-700 text-xs sm:text-sm">{error}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Loading or Action Buttons */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-6 sm:py-8">
            <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 text-red-600 animate-spin mb-3 sm:mb-4" />
            <p className="text-sm sm:text-base text-gray-600 dark:text-neutral-400">Loading payment options...</p>
          </div>
        ) : terminalCollectionFailure ? (
          <div className="space-y-2 sm:space-y-3">
            {/* Terminal billing (Stripe): invoice/session not collectible in-app without ops — see stripe-invoice-pay-errors + pay-failed-invoice */}
            <a
              href={renewalBillingSupportMailto()}
              className="w-full inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#ee0000]/40 px-3 py-2 text-sm bg-red-600 text-white hover:bg-red-700"
            >
              <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2" />
              Contact support
            </a>
            <Link
              href="/my-account"
              className="w-full inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-200 border-2 border-red-600 dark:border-red-500 text-red-600 dark:text-red-400 hover:bg-red-600 hover:text-white dark:hover:bg-red-600 dark:hover:text-white px-3 py-2 text-sm"
              onClick={() => onClose()}
            >
              Go to account
            </Link>
            <Button
              onClick={onClose}
              variant="ghost"
              disabled={isLoading}
              className="w-full text-sm sm:text-base"
              size="sm"
            >
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-2 sm:space-y-3">
            {!showInlineCardSetup && (
              <Button
                onClick={handleResolvePayment}
                disabled={isLoading}
                className="w-full bg-red-600 hover:bg-red-700 text-sm sm:text-base"
                size="sm"
              >
                <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2" />
                Resolve Payment Issue
              </Button>
            )}
            {showInlineCardSetup && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowInlineCardSetup(false);
                  setSetupIntentSecret(null);
                }}
                disabled={isLoading}
                className="w-full text-sm sm:text-base border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-100"
                size="sm"
              >
                Back
              </Button>
            )}
            <Button 
              onClick={onClose} 
              variant="outline" 
              disabled={isLoading} 
              className="w-full text-sm sm:text-base"
              size="sm"
            >
              Close
            </Button>
          </div>
        )}

        <div className="mt-4 sm:mt-6 text-[10px] sm:text-xs text-gray-500 dark:text-neutral-500 text-center">
          {terminalCollectionFailure
            ? "Our team may need to fix your invoice in billing before you can pay. You can still update saved cards under your account."
            : showInlineCardSetup
              ? "You can also close this modal and add a card later under account settings."
              : "You can close this modal and resolve the payment issue later from your account settings."}
        </div>
      </ModalContent>
    </ModalContainer>
  );
};

export default RenewalFailedModal;
