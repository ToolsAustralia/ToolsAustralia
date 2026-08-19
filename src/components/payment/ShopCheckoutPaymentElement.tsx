"use client";

import { useMemo, useState } from "react";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import type { Appearance } from "@stripe/stripe-js";
import { Loader2, Lock } from "lucide-react";
import { getStripePromise } from "@/lib/stripe-client";
import { getReturnUrlForPaymentTypeClient } from "@/utils/payment/stripe/payment-intent-config";
import { useTheme } from "@/contexts/ThemeContext";

/**
 * Stripe Payment Element for shop checkout.
 *
 * Stripe is loaded via `getStripePromise()` from `@/lib/stripe-client`, NOT by
 * calling `loadStripe` here. Calling it at module scope injects js.stripe.com on
 * import — for every route that pulls this file into its graph, not just the ones
 * that render a payment form. That is CLAUDE.md performance footgun #2 and is
 * lint-enforced by `internal-norm/no-eager-stripe`.
 *
 * The appearance theming is adapted from the unmerged `claude/shop-setup` branch,
 * which had it right — Stripe's iframe cannot inherit our CSS, so dark mode has
 * to be handed over explicitly or the form renders a white box on a dark page.
 */

function buildAppearance(isDark: boolean): Appearance {
  const base: Appearance = {
    theme: isDark ? "night" : "stripe",
    variables: {
      colorPrimary: "#dc2626",
      borderRadius: "10px",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      spacingUnit: "5px",
    },
  };

  if (!isDark) {
    return {
      ...base,
      variables: { ...base.variables, colorText: "#1f2937", colorBackground: "#ffffff" },
      rules: {
        ".Input": { border: "1px solid #e5e7eb", boxShadow: "none" },
        ".Input:focus": { border: "1px solid #dc2626", boxShadow: "0 0 0 1px #dc2626" },
      },
    };
  }

  return {
    ...base,
    variables: {
      ...base.variables,
      colorBackground: "#0a0a0a",
      colorText: "#f5f5f5",
      colorTextSecondary: "#a3a3a3",
      colorTextPlaceholder: "#737373",
      colorDanger: "#ef4444",
    },
    rules: {
      ".Input": {
        border: "1px solid #404040",
        backgroundColor: "#171717",
        boxShadow: "none",
      },
      ".Input:focus": { border: "1px solid #dc2626", boxShadow: "0 0 0 1px #dc2626" },
      ".Tab": { backgroundColor: "#171717", border: "1px solid #404040" },
      ".Tab--selected": { backgroundColor: "#1f1f1f", border: "1px solid #dc2626" },
      ".Label": { color: "#d4d4d4" },
      ".Block": { backgroundColor: "#171717", border: "1px solid #404040" },
    },
  };
}

interface PayFormProps {
  totalLabel: string;
  /** Needed on the 3DS return_url — see the confirmParams comment below. */
  orderId: string;
  onPaid: () => void;
}

function PayForm({ totalLabel, orderId, onPaid }: PayFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsPaying(true);
    setError(null);

    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        // orderId MUST ride along. Only a 3DS challenge sends the buyer here, and
        // the success page reads orderId from the query string to load the order.
        // Without it the query is disabled, the page renders "Couldn't load
        // order" to someone who has just paid, and the Purchase pixel never
        // fires. Every non-3DS payment resolves in place and never uses this URL,
        // which is why the gap survived: it only breaks for the buyers whose bank
        // challenges them.
        return_url: `${getReturnUrlForPaymentTypeClient("shop")}?orderId=${encodeURIComponent(orderId)}`,
      },
      // Stay on the page unless the bank forces a 3DS redirect. Only then does
      // Stripe navigate away to `return_url`.
      redirect: "if_required",
    });

    if (stripeError) {
      setError(stripeError.message ?? "Payment failed. Please try again.");
      setIsPaying(false);
      return;
    }

    // succeeded | processing both mean Stripe has the payment; the webhook
    // finalises the order. Anything else means the customer must act again.
    if (paymentIntent && ["succeeded", "processing"].includes(paymentIntent.status)) {
      onPaid();
      return;
    }

    setError("Payment could not be completed. Please try another card.");
    setIsPaying(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-200"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || isPaying}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-400"
      >
        {isPaying ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Processing…
          </>
        ) : (
          <>
            <Lock className="h-4 w-4" />
            Pay {totalLabel}
          </>
        )}
      </button>

      <p className="text-center text-xs text-gray-500 dark:text-neutral-400">
        Payments are processed securely by Stripe. We never see your card details.
      </p>
    </form>
  );
}

export interface ShopCheckoutPaymentElementProps {
  clientSecret: string;
  /** Pre-formatted, e.g. "$89.95". */
  totalLabel: string;
  onPaid: () => void;
  /** Passed through to the 3DS return_url. */
  orderId: string;
}

export default function ShopCheckoutPaymentElement({
  clientSecret,
  totalLabel,
  orderId,
  onPaid,
}: ShopCheckoutPaymentElementProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Remounting <Elements> resets the customer's typed card details, so the
  // options object must be referentially stable across re-renders.
  const options = useMemo(
    () => ({ clientSecret, appearance: buildAppearance(isDark) }),
    [clientSecret, isDark]
  );

  return (
    <Elements stripe={getStripePromise()} options={options}>
      <PayForm totalLabel={totalLabel} orderId={orderId} onPaid={onPaid} />
    </Elements>
  );
}
