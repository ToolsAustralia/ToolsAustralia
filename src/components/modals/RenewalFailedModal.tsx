"use client";

/**
 * RenewalFailedModal Component
 *
 * Modal for handling failed subscription renewal payments.
 * Allows users to pay their existing failed invoice using the existing PaymentIntent.
 *
 * Features:
 * - Shows failed renewal information
 * - Auto-confirms payment if default payment method exists
 * - Shows Payment Element if no default payment method
 * - Automatically saves new payment methods and sets as default
 * - Handles success/error states
 * - Can be closed and reopened from settings
 */

import React, { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { ModalContainer, ModalHeader, ModalContent, Button } from "@/components/modals/ui";
import { useToast } from "@/components/ui/Toast";
import { AlertTriangle, CreditCard, Loader2, CheckCircle, XCircle } from "lucide-react";
import { usePayFailedInvoice } from "@/hooks/queries/useSubscriptionQueries";
import { useSavedPaymentMethods } from "@/hooks/useSavedPaymentMethods";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

// Initialize Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface RenewalFailedModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Payment Form Component (for Payment Element)
 * Handles payment confirmation when no default payment method exists
 */
const PaymentForm: React.FC<{
  clientSecret: string;
  amount: number;
  currency: string;
  onPaymentSuccess: (paymentMethodId?: string) => void;
  onPaymentError: (error: string) => void;
  onCancel: () => void;
}> = ({ clientSecret, onPaymentSuccess, onPaymentError, onCancel }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { showToast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const { savePaymentMethod } = useSavedPaymentMethods();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      // Submit form to validate
      const { error: submitError } = await elements.submit();

      if (submitError) {
        throw new Error(submitError.message || "Please complete all required fields.");
      }

      // Confirm payment
      const confirmResult = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          payment_method_data: {
            billing_details: {
              address: {
                country: "AU",
                state: "NSW",
                city: "Sydney",
                postal_code: "2000",
                line1: "1 Martin Place",
              },
            },
          },
          return_url: window.location.href,
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

        onPaymentSuccess(paymentIntent.payment_method as string | undefined);
      } else {
        throw new Error("Payment was not successful");
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Payment could not be processed. Please try again.";
      onPaymentError(errorMessage);
      showToast({
        type: "error",
        title: "Payment Failed",
        message: errorMessage,
        duration: 10000,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="border border-gray-200 rounded-lg p-4">
        {!stripe || !elements ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
            <span className="ml-3 text-gray-600">Loading payment form...</span>
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
              fields: {
                billingDetails: "never",
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

      <div className="flex space-x-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isProcessing} className="flex-1">
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!stripe || !elements || isProcessing}
          className="flex-1 bg-red-600 hover:bg-red-700"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="w-4 h-4 mr-2" />
              Pay Now
            </>
          )}
        </Button>
      </div>

      <div className="text-xs text-gray-500 text-center">
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

  // State management
  const [paymentState, setPaymentState] = useState<{
    requiresConfirmation: boolean;
    clientSecret?: string;
    amount?: number;
    currency?: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setPaymentState(null);
      setIsLoading(false);
      setIsSuccess(false);
      setError(null);
      // Trigger payment attempt when modal opens
      handlePayNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Handle "Pay Now" button click or auto-trigger
  const handlePayNow = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await payFailedInvoiceMutation.mutateAsync();

      if (response.success) {
        // Payment was successful (default payment method was used)
        setIsSuccess(true);
        // Invalidate queries to refresh user data
        queryClient.invalidateQueries({ queryKey: queryKeys.users.detail("current") });
        queryClient.invalidateQueries({ queryKey: queryKeys.users.account("current") });

        // Close modal after a short delay
        setTimeout(() => {
          onClose();
        }, 2000);
      } else if (response.requiresPaymentConfirmation && response.data?.paymentIntent?.clientSecret) {
        // Payment requires confirmation via Payment Element
        setPaymentState({
          requiresConfirmation: true,
          clientSecret: response.data.paymentIntent.clientSecret,
          amount: response.data.paymentIntent.amount,
          currency: response.data.paymentIntent.currency || "aud",
        });
      } else {
        throw new Error(response.message || "Failed to process payment");
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to process payment. Please try again.";
      setError(errorMessage);
      showToast({
        type: "error",
        title: "Payment Error",
        message: errorMessage,
        duration: 10000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle payment success from Payment Element
  const handlePaymentSuccess = async () => {
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
  const handlePaymentError = (errorMessage: string) => {
    setError(errorMessage);
  };

  if (!isOpen) return null;

  // Success state
  if (isSuccess) {
    return (
      <ModalContainer isOpen={isOpen} onClose={onClose} size="md">
        <ModalHeader title="Payment Successful" onClose={onClose} />
        <ModalContent className="p-6">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Subscription Reactivated!</h3>
            <p className="text-gray-600">
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
      <ModalContainer isOpen={isOpen} onClose={onClose} size="md" closeOnBackdrop={false}>
        <ModalHeader title="Complete Payment" onClose={onClose} />
        <ModalContent className="p-6">
          {/* Alert Banner */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-red-900 mb-1">Subscription Renewal Failed</h4>
                <p className="text-sm text-red-700">
                  Your subscription renewal payment failed. Please complete the payment below to reactivate your
                  subscription.
                </p>
              </div>
            </div>
          </div>

          {/* Payment Amount */}
          {paymentState.amount && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Amount Due:</span>
                <span className="text-lg font-bold text-gray-900">
                  ${((paymentState.amount || 0) / 100).toFixed(2)} {paymentState.currency?.toUpperCase() || "AUD"}
                </span>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <span className="text-red-700 text-sm">{error}</span>
            </div>
          )}

          {/* Payment Element */}
          <Elements
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
              amount={paymentState.amount || 0}
              currency={paymentState.currency || "aud"}
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
    <ModalContainer isOpen={isOpen} onClose={onClose} size="md" closeOnBackdrop={false}>
      <ModalHeader title="Subscription Renewal Failed" onClose={onClose} />
      <ModalContent className="p-6">
        {/* Alert Banner */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-red-900 mb-1">Payment Required</h4>
              <p className="text-sm text-red-700">
                Your subscription renewal payment failed. Please complete the payment to reactivate your subscription
                and restore your benefits.
              </p>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span className="text-red-700 text-sm">{error}</span>
          </div>
        )}

        {/* Loading or Pay Now Button */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="w-8 h-8 text-red-600 animate-spin mb-4" />
            <p className="text-gray-600">Processing payment...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <Button
              onClick={handlePayNow}
              disabled={isLoading}
              className="w-full bg-red-600 hover:bg-red-700"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Pay Now
            </Button>
            <Button onClick={onClose} variant="outline" disabled={isLoading} className="w-full">
              Close
            </Button>
          </div>
        )}

        <div className="mt-6 text-xs text-gray-500 text-center">
          You can close this modal and resolve the payment issue later from your account settings.
        </div>
      </ModalContent>
    </ModalContainer>
  );
};

export default RenewalFailedModal;

