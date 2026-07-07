"use client";

import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

interface AddPaymentFormProps {
  clientSecret: string;
  onSuccess: (paymentMethodId: string) => void;
  onCancel: () => void;
  userEmail?: string;
  userName?: string;
  userPhone?: string;
}

const fieldClass =
  "w-full rounded-xl border border-token bg-page px-3.5 py-3 text-sm text-primary-token placeholder:text-muted-token focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/25 dark:text-white";
const labelClass = "mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-muted-token";

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
  const [nameOnCard, setNameOnCard] = useState(userName || "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(submitError.message || "Please check your card details");
        setIsSubmitting(false);
        return;
      }

      // Name comes from the field; email/phone/address hidden and passed here.
      const { error: confirmError, setupIntent } = await stripe.confirmSetup({
        elements,
        clientSecret,
        redirect: "if_required",
        confirmParams: {
          payment_method_data: {
            billing_details: {
              name: nameOnCard.trim() || userName || userEmail || "Customer",
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClass}>Card details</label>
        <PaymentElement
          options={{
            layout: "tabs",
            fields: { billingDetails: "never" as const },
            terms: { card: "never" as const, applePay: "never" as const, googlePay: "never" as const },
          }}
        />
      </div>

      <div>
        <label htmlFor="name-on-card" className={labelClass}>
          Name on card
        </label>
        <input
          id="name-on-card"
          type="text"
          value={nameOnCard}
          onChange={(e) => setNameOnCard(e.target.value)}
          placeholder="Name on card"
          autoComplete="cc-name"
          className={fieldClass}
        />
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1 rounded-full border border-token bg-surface py-3 text-sm font-bold text-primary-token transition-colors hover:bg-black/[.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-60 dark:text-white dark:hover:bg-white/[.05]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !stripe}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-b from-red-500 to-red-700 py-3 text-sm font-bold text-white transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-60 motion-safe:active:translate-y-px"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            "Add card"
          )}
        </button>
      </div>
    </form>
  );
};

export default AddPaymentForm;
