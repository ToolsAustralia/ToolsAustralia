"use client";

import { useMemo, useState } from "react";
import {
  Elements,
  ExpressCheckoutElement,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
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

/**
 * The delivery address, in Stripe's shape.
 *
 * Required because PaymentElement's own address fields are hidden — we already
 * collected and validated an Australian address on the checkout page, and Stripe's
 * duplicate country selector defaulted off IP (a Sydney buyer was offered
 * "Philippines").
 */
export interface ShopBillingDetails {
  name?: string;
  phone?: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
}

interface PayFormProps {
  totalLabel: string;
  /** Needed on the 3DS return_url — see the confirmParams comment below. */
  orderId: string;
  billingDetails?: ShopBillingDetails;
  onPaid: () => void;
}

function PayForm({ totalLabel, orderId, billingDetails, onPaid }: PayFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isPaying, setIsPaying] = useState(false);
  /**
   * Whether any wallet actually rendered.
   *
   * Apple Pay needs Safari + HTTPS + a domain registered with Stripe; Google Pay needs
   * a card in the browser profile. On a machine with neither, ExpressCheckoutElement
   * renders NOTHING — so the "or pay by card" divider has to be conditional, or every
   * desktop Firefox user sees a divider under an empty space.
   */
  const [hasWallets, setHasWallets] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The single confirm path, shared by the wallet buttons and the card button.
   *
   * Two entry points, one implementation: a wallet payment and a card payment differ
   * only in which Element collected the details, and duplicating the confirm is how
   * the two drift on return_url, error handling or the success signal.
   */
  const handleConfirm = async (source: "card" | "wallet") => {
    if (!stripe || !elements) return;

    setIsPaying(true);
    setError(null);

    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        /*
          CARD PATH ONLY.

          Required on the card path because PaymentElement's own address fields are
          hidden — Stripe rejects the confirm with a missing billing_details error
          otherwise. NOT sent on the wallet path: Apple Pay and Google Pay supply their
          own billing details from the device, and overriding them with ours is both
          unnecessary and a source of confirm-time conflicts.
        */
        ...(source === "card" && billingDetails
          ? { payment_method_data: { billing_details: billingDetails } }
          : {}),
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleConfirm("card");
  };

  return (
    <form onSubmit={handleSubmit} className="relative space-y-4">
      {/*
        A real overlay while stripe.confirmPayment is in flight, not just a
        spinner inside the button.

        This wait is genuinely open-ended — a 3DS challenge can take tens of
        seconds — and a card form that still looks editable invites a second
        submit. It covers the form rather than replacing it so the Element is
        never unmounted mid-confirm.
      */}
      {isPaying && (
        <div className="pointer-events-auto absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-xl bg-white/85 backdrop-blur-sm dark:bg-neutral-900/85">
          <Loader2 className="h-7 w-7 animate-spin text-red-600 dark:text-red-400" />
          <p className="text-sm font-semibold text-gray-900 dark:text-neutral-100">
            Processing your payment…
          </p>
          <p className="max-w-[16rem] text-center text-xs text-gray-500 dark:text-neutral-400">
            Do not close this page. Your bank may ask you to confirm.
          </p>
        </div>
      )}
      {/*
        WALLETS FIRST — Apple Pay / Google Pay / Link, one tap, no typing.

        This is a separate Element from PaymentElement below, deliberately: rendering
        wallets as tabs INSIDE the payment element buries them behind a click, and the
        whole value of a wallet is that it skips the form. Both elements share the one
        PaymentIntent, so whichever the buyer uses confirms the same payment.

        `onConfirm` still calls stripe.confirmPayment with the same return_url as the
        card path, so a wallet payment that needs 3DS comes back to the success page
        with its orderId intact.
      */}
      <div className={hasWallets ? "space-y-4" : "hidden"}>
        <ExpressCheckoutElement
          options={{ buttonHeight: 48 }}
          onReady={(event) => {
            // `availablePaymentMethods` is undefined when nothing is available.
            setHasWallets(Boolean(event.availablePaymentMethods));
          }}
          onConfirm={() => handleConfirm("wallet")}
        />
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-gray-200 dark:bg-neutral-700" />
          <span className="text-xs font-medium text-gray-500 dark:text-neutral-400">
            or pay by card
          </span>
          <span className="h-px flex-1 bg-gray-200 dark:bg-neutral-700" />
        </div>
      </div>

      {/*
        The buyer's saved cards appear here when the Customer Session was created (see
        startShopCheckout), with a new-card form underneath and a save checkbox — so a
        card entered once is offered back next time.

        `fields.billingDetails.address: "never"` removes Stripe's own country/postcode
        block: we already collected a validated Australian delivery address on this
        page, and asking for it twice is the opposite of the point. The address is
        handed to Stripe in confirmParams instead — which is REQUIRED once the fields
        are hidden, or confirmation fails with a missing billing_details error.
      */}
      <PaymentElement
        options={{
          layout: "tabs",
          fields: { billingDetails: { address: "never" } },
        }}
      />

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
  /**
   * Stripe Customer Session secret. Present = the buyer's saved cards are
   * offered above the card form. Absent (the session call failed) = a normal
   * card form, which still takes payment.
   */
  customerSessionClientSecret?: string | null;
  /** Pre-formatted, e.g. "$89.95". */
  totalLabel: string;
  onPaid: () => void;
  /** Passed through to the 3DS return_url. */
  orderId: string;
  /** The validated delivery address, forwarded to Stripe as billing details. */
  billingDetails?: ShopBillingDetails;
}

export default function ShopCheckoutPaymentElement({
  clientSecret,
  customerSessionClientSecret,
  totalLabel,
  orderId,
  billingDetails,
  onPaid,
}: ShopCheckoutPaymentElementProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Remounting <Elements> resets the customer's typed card details, so the
  // options object must be referentially stable across re-renders.
  const options = useMemo(
    () => ({
      clientSecret,
      // Spread rather than set to undefined: Stripe rejects the key being
      // present-but-undefined, and it is legitimately absent whenever the
      // customer-session call failed.
      ...(customerSessionClientSecret
        ? { customerSessionClientSecret }
        : {}),
      appearance: buildAppearance(isDark),
    }),
    [clientSecret, customerSessionClientSecret, isDark]
  );

  return (
    <Elements stripe={getStripePromise()} options={options}>
      <PayForm
        totalLabel={totalLabel}
        orderId={orderId}
        billingDetails={billingDetails}
        onPaid={onPaid}
      />
    </Elements>
  );
}
