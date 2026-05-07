"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import type { Appearance } from "@stripe/stripe-js";
import { Lock } from "lucide-react";
import type { ShippingAddressInput } from "@/services/shop/createShopPurchase.service";
import { useTheme } from "@/contexts/ThemeContext";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export interface ShopCheckoutPaymentElementProps {
  items: { productId: string; quantity: number }[];
  shippingAddress: ShippingAddressInput;
  /** Total in dollars (AUD). Rendered on the Pay button. */
  totalAmount: number;
  onPaymentInfoEntered?: () => void; // for Pixel AddPaymentInfo
}

function buildAppearance(theme: "light" | "dark"): Appearance {
  const base: Appearance = {
    theme: theme === "dark" ? "night" : "stripe",
    variables: {
      colorPrimary: "#dc2626",
      borderRadius: "10px",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      spacingUnit: "5px",
    },
  };

  if (theme === "dark") {
    return {
      ...base,
      variables: {
        ...base.variables,
        colorBackground: "#0a0a0a", // neutral-950 — matches the section card
        colorText: "#f5f5f5", // neutral-100
        colorTextSecondary: "#a3a3a3", // neutral-400
        colorTextPlaceholder: "#737373", // neutral-500
        colorDanger: "#ef4444",
      },
      rules: {
        ".Input": {
          border: "1px solid #404040", // neutral-700
          backgroundColor: "#171717", // neutral-900
          boxShadow: "none",
        },
        ".Input:focus": {
          border: "1px solid #dc2626",
          boxShadow: "0 0 0 1px #dc2626",
        },
        ".Tab": {
          backgroundColor: "#171717",
          border: "1px solid #404040",
        },
        ".Tab--selected": {
          backgroundColor: "#1f1f1f",
          border: "1px solid #dc2626",
        },
        ".Label": {
          color: "#d4d4d4", // neutral-300
        },
        ".Block": {
          backgroundColor: "#171717",
          border: "1px solid #404040",
        },
      },
    };
  }

  return {
    ...base,
    variables: {
      ...base.variables,
      colorText: "#1f2937",
      colorBackground: "#ffffff",
    },
    rules: {
      ".Input": {
        border: "1px solid #e5e7eb",
        boxShadow: "none",
      },
      ".Input:focus": {
        border: "1px solid #dc2626",
        boxShadow: "0 0 0 1px #dc2626",
      },
    },
  };
}

function PayForm({
  totalAmount,
  onPaymentInfoEntered,
}: {
  totalAmount: number;
  onPaymentInfoEntered?: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setErrorMsg(null);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/shop/checkout/success`,
      },
    });
    if (result.error) {
      setErrorMsg(result.error.message ?? "Payment failed");
      setSubmitting(false);
    }
    // Otherwise: browser redirected to return_url
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <PaymentElement
        onChange={() => onPaymentInfoEntered?.()}
        options={{
          layout: { type: "tabs", defaultCollapsed: false },
          fields: { billingDetails: { address: { country: "auto" } } },
        }}
      />
      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {errorMsg}
        </div>
      )}
      <button
        type="submit"
        disabled={submitting || !stripe || !elements}
        className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-red-700 px-6 py-4 font-semibold text-white shadow-lg shadow-red-600/20 transition-all duration-200 hover:from-red-700 hover:to-red-800 hover:shadow-xl active:scale-[0.99] disabled:cursor-not-allowed disabled:from-gray-400 disabled:to-gray-500 disabled:shadow-none"
      >
        <Lock className="h-4 w-4" />
        {submitting ? "Processing…" : `Pay $${totalAmount.toFixed(2)} AUD`}
      </button>
      <p className="text-center text-xs text-gray-500 dark:text-neutral-500">
        Secure payment by Stripe · You&apos;ll receive a tax invoice via email.
      </p>
    </form>
  );
}

export function ShopCheckoutPaymentElement(props: ShopCheckoutPaymentElementProps) {
  const { theme } = useTheme();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const appearance = useMemo(() => buildAppearance(theme), [theme]);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      const res = await fetch("/api/stripe/create-shop-purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          items: props.items,
          shippingAddress: props.shippingAddress,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (!cancelled) setLoadError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      if (!cancelled) setClientSecret(data.clientSecret);
    }
    start();
    return () => {
      cancelled = true;
    };
  }, [props.items, props.shippingAddress]);

  if (loadError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
        Couldn&apos;t start payment: {loadError}
      </div>
    );
  }
  if (!clientSecret) {
    return (
      <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-neutral-400">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
        Loading payment options…
      </div>
    );
  }

  return (
    // key forces remount when theme switches so Stripe re-applies the new appearance
    <Elements
      key={theme}
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance,
      }}
    >
      <PayForm totalAmount={props.totalAmount} onPaymentInfoEntered={props.onPaymentInfoEntered} />
    </Elements>
  );
}
