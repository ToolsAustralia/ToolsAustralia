"use client";

import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "../ui";

interface AddPaymentFormProps {
  clientSecret: string;
  onSuccess: (paymentMethodId: string) => void;
  onCancel: () => void;
  userEmail?: string;
  userName?: string;
  userPhone?: string;
}

const AddPaymentForm: React.FC<AddPaymentFormProps> = ({
  clientSecret,
  onSuccess,
  onCancel,
  userEmail,
  userName,
  userPhone,
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(submitError.message || "Please check your card details");
        setIsSubmitting(false);
        return;
      }

      // Pass name, email, phone, and address in confirmParams since we're hiding those fields
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
                country: "AU", // Default to Australia (country is auto-detected in form)
                line1: "1 Martin Place", // Default address line
                city: "Sydney",
                state: "NSW",
                postal_code: "2000",
              },
            },
          },
        },
      });

      if (confirmError) {
        setError(confirmError.message || "Failed to save payment method");
        setIsSubmitting(false);
        return;
      }

      if (setupIntent?.payment_method) {
        const paymentMethodId =
          typeof setupIntent.payment_method === "string"
            ? setupIntent.payment_method
            : setupIntent.payment_method.id;

        onSuccess(paymentMethodId);
      } else {
        setError("Payment method not found");
        setIsSubmitting(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
      <div className="rounded-lg border border-gray-300 dark:border-neutral-600 p-2 sm:p-3 [&_iframe]:!min-h-[200px] sm:[&_iframe]:!min-h-[auto]">
        <PaymentElement
          options={{
            layout: "tabs",
            fields: {
              billingDetails: {
                name: "never" as const,
                email: "never" as const,
                phone: "never" as const,
                address: {
                  country: "auto" as const, // Auto-detect country based on user location
                  line1: "never" as const,
                  line2: "never" as const,
                  city: "never" as const,
                  state: "never" as const,
                  postalCode: "never" as const,
                },
              },
            },
            terms: {
              card: "never" as const, // Hide the "By providing your card information..." terms text
              applePay: "never" as const,
              googlePay: "never" as const,
            },
          }}
        />
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-3 sm:px-4 py-2 sm:py-3 rounded-lg text-xs sm:text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          type="submit"
          disabled={isSubmitting || !stripe}
          className="w-full sm:w-auto bg-gradient-to-r from-red-600 to-red-400 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold hover:from-red-675 hover:to-red-650 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Payment Method"
          )}
        </Button>
        <Button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="w-full sm:w-auto border border-gray-300 dark:border-neutral-600 text-gray-700 dark:text-neutral-300 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold hover:bg-gray-50 dark:hover:bg-neutral-700 disabled:opacity-60"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
};

export default AddPaymentForm;
