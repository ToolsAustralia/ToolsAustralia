"use client";

import React, { useState } from "react";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/modals/ui";
import { MEMBERSHIP_SETUP_INTENT_PAYMENT_ELEMENT_OPTIONS } from "@/utils/payment/stripe/membership-stripe-appearance";

export interface StripeInlineCardSetupFormProps {
  clientSecret: string;
  userEmail?: string;
  userName?: string;
  userPhone?: string;
  onSuccess: (paymentMethodId: string) => void;
  disabled?: boolean;
  /** Shown on the primary submit button (e.g. retry renewal vs complete purchase). */
  submitLabel?: string;
}

/**
 * SetupIntent + PaymentElement: collect a new card and return the payment method id (no charge).
 */
export const StripeInlineCardSetupForm: React.FC<StripeInlineCardSetupFormProps> = ({
  clientSecret,
  userEmail,
  userName,
  userPhone,
  onSuccess,
  disabled,
  submitLabel = "Save card & continue",
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || disabled) return;
    setIsSubmitting(true);
    setLocalError(null);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setLocalError(submitError.message || "Check your card details");
        setIsSubmitting(false);
        return;
      }
      const { error: confirmError, setupIntent } = await stripe.confirmSetup({
        elements,
        clientSecret,
        redirect: "if_required",
        confirmParams: {
          payment_method_data: {
            billing_details: {
              name: userName || userEmail || "Customer",
              email: userEmail,
              phone: userPhone || undefined,
              address: {
                country: "AU",
                line1: "1 Martin Place",
                city: "Sydney",
                state: "NSW",
                postal_code: "2000",
              },
            },
          },
        },
      });
      if (confirmError) {
        setLocalError(confirmError.message || "Could not save card");
        setIsSubmitting(false);
        return;
      }
      const pm = setupIntent?.payment_method;
      const paymentMethodId =
        typeof pm === "string" ? pm : pm && typeof pm === "object" && "id" in pm ? pm.id : null;
      if (!paymentMethodId) {
        setLocalError("Payment method not returned");
        setIsSubmitting(false);
        return;
      }
      onSuccess(paymentMethodId);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Match PaymentMethodSelector / StripeCardForm: white or dark container, no country field */}
      <div className="p-3 border border-gray-300 dark:border-neutral-600 rounded-lg bg-[#ffffff] dark:bg-neutral-950 mt-0">
        <PaymentElement options={MEMBERSHIP_SETUP_INTENT_PAYMENT_ELEMENT_OPTIONS} />
      </div>
      {localError && <p className="text-xs text-red-600 dark:text-red-400">{localError}</p>}
      <Button
        type="submit"
        disabled={!stripe || isSubmitting || disabled}
        className="w-full bg-red-600 hover:bg-red-700 text-sm sm:text-base"
        size="sm"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Saving card…
          </>
        ) : (
          <>
            <CreditCard className="w-4 h-4 mr-2" />
            {submitLabel}
          </>
        )}
      </Button>
    </form>
  );
};
