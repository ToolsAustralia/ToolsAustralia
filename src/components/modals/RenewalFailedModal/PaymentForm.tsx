"use client";

import React, { useState } from "react";
import { PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { CreditCard, Loader2 } from "lucide-react";
import { cn } from "@/utils/cn";
import styles from "./styles.module.css";
import { useToast } from "@/components/ui/Toast";
import { useSavedPaymentMethods, type SavedPaymentMethod } from "@/hooks/useSavedPaymentMethods";
import { useUserContext } from "@/contexts/UserContext";
import { formatDisplayName } from "@/utils/display-name";
import { formatPaymentError } from "@/utils/payment/stripe/payment-error-messages";
import { paymentIntentIdFromClientSecret } from "@/utils/payment/stripe/stripe-excessive-retry";

interface PaymentFormProps {
  clientSecret: string;
  paymentIntentId?: string | null;
  amount: number;
  currency: string;
  selectedPaymentMethod?: SavedPaymentMethod | null;
  onPaymentSuccess: (paymentMethodId?: string) => void;
  onPaymentError: (
    error: string,
    details?: string,
    meta?: { requiresDifferentPaymentMethod?: boolean }
  ) => void;
  onCancel: () => void;
}

const PaymentForm: React.FC<PaymentFormProps> = ({
  clientSecret,
  paymentIntentId,
  selectedPaymentMethod,
  onPaymentSuccess,
  onPaymentError,
  onCancel,
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const { showToast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const { savePaymentMethod } = useSavedPaymentMethods();
  const { userData } = useUserContext();

  const buildBillingDetails = () => {
    const fullName =
      formatDisplayName(userData?.firstName, userData?.lastName) ||
      userData?.email ||
      "Customer";
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
    if (!stripe || !elements) return;

    setIsProcessing(true);

    try {
      if (selectedPaymentMethod) {
        const confirmResult = await stripe.confirmCardPayment(clientSecret, {
          payment_method: selectedPaymentMethod.paymentMethodId,
        });

        if (confirmResult.error) throw new Error(confirmResult.error.message || "Payment failed");

        if (
          confirmResult.paymentIntent &&
          confirmResult.paymentIntent.status === "succeeded"
        ) {
          onPaymentSuccess(selectedPaymentMethod.paymentMethodId);
          return;
        }

        throw new Error("Payment was not successful");
      }

      const { error: submitError } = await elements.submit();
      if (submitError) throw new Error(submitError.message || "Please complete all required fields.");

      const billingDetailsData = buildBillingDetails();
      const { getReturnUrlForPaymentTypeClient } = await import(
        "@/utils/payment/stripe/payment-intent-config"
      );

      const confirmResult = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          payment_method_data: { billing_details: billingDetailsData },
          return_url: getReturnUrlForPaymentTypeClient("subscription"),
        },
        redirect: "if_required",
      });

      if (confirmResult.error) throw new Error(confirmResult.error.message || "Payment failed");

      const paymentIntent = confirmResult.paymentIntent;
      if (paymentIntent && paymentIntent.status === "succeeded") {
        if (paymentIntent.payment_method) {
          const paymentMethodId =
            typeof paymentIntent.payment_method === "string"
              ? paymentIntent.payment_method
              : paymentIntent.payment_method.id;
          try {
            await savePaymentMethod(paymentMethodId, true);
          } catch (saveError) {
            console.warn("Could not save payment method:", saveError);
          }
        }
        onPaymentSuccess(paymentIntent.payment_method as string | undefined);
      } else {
        throw new Error("Payment was not successful");
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Payment could not be processed. Please try again.";
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
          /* fall back to generic error */
        }
      }
      const toastPayload = requiresDifferentPm
        ? formatPaymentError({ requiresDifferentPaymentMethod: true })
        : null;
      onPaymentError(errorMessage, undefined, {
        requiresDifferentPaymentMethod: requiresDifferentPm,
      });
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
    <form onSubmit={handleSubmit} className="space-y-4">
      {selectedPaymentMethod && (
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-600 flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold text-neutral-900 text-xs sm:text-sm">
                {selectedPaymentMethod.card?.brand?.toUpperCase() || "Card"} ••••{" "}
                {selectedPaymentMethod.card?.last4 || ""}
              </p>
              <p className="text-2xs sm:text-xs text-neutral-500">Using saved payment method</p>
            </div>
          </div>
        </div>
      )}

      {!selectedPaymentMethod && (
        <div className="border border-neutral-200 rounded-xl p-3 sm:p-4 bg-white">
          {!stripe || !elements ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-red-600" />
              <span className="ml-3 text-neutral-600 text-sm">Loading payment form...</span>
            </div>
          ) : (
            <PaymentElement
              options={{
                layout: "tabs",
                wallets: { applePay: "auto", googlePay: "auto" },
                paymentMethodOrder: ["card", "apple_pay", "google_pay"],
                fields: {
                  billingDetails: {
                    name: "never",
                    email: "never",
                    phone: "never",
                    address: "never",
                  },
                },
                terms: { card: "never", applePay: "never", googlePay: "never" },
              }}
              id="payment-element"
            />
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr] gap-2 sm:gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          className={cn(
            "inline-flex items-center justify-center px-[14px] py-[11px] rounded-[10px] font-extrabold text-[13px] tracking-[0.01em] leading-[1.2] bg-white text-neutral-600 border-[1.5px] border-neutral-200 disabled:opacity-60 disabled:cursor-not-allowed hover:[&:not(:disabled)]:bg-[#fafafa] hover:[&:not(:disabled)]:border-neutral-400",
            styles.btn
          )}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || (!elements && !selectedPaymentMethod) || isProcessing}
          className={cn(
            "inline-flex items-center justify-center px-[14px] py-[11px] rounded-[10px] font-extrabold text-[13px] tracking-[0.01em] leading-[1.2] bg-gradient-to-b from-[#ee0000] to-[#b91c1c] text-white border-[1.5px] border-[#b91c1c] shadow-[0_8px_18px_rgba(238,0,0,0.32)] disabled:opacity-60 disabled:cursor-not-allowed",
            styles.btn,
            styles.btnPrimary
          )}
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2 animate-spin" />
              Processing…
            </>
          ) : (
            <>
              <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2" />
              Pay now
            </>
          )}
        </button>
      </div>

      <div className="text-2xs sm:text-xs text-neutral-500 text-center">
        Your payment is secured by Stripe. Card details are never stored on our servers.
      </div>
    </form>
  );
};

export default PaymentForm;
