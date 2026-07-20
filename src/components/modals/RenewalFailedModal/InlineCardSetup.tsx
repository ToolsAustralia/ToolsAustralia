"use client";

import React, { useMemo } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { CreditCard, Loader2 } from "lucide-react";
import { getStripePromise } from "@/lib/stripe-client";
import { StripeInlineCardSetupForm } from "@/components/payment/StripeInlineCardSetupForm";
import { formatDisplayName } from "@/utils/display-name";

interface InlineCardSetupProps {
  setupIntentSecret: string | null;
  loadingSetupIntent: boolean;
  isDarkMode: boolean;
  membershipStripeAppearance: object;
  userData: {
    email?: string;
    firstName?: string;
    lastName?: string;
    mobile?: string;
  };
  isLoading: boolean;
  /** Called with the new payment method ID once setup confirms successfully. */
  onSuccess: (pmId: string) => void;
}

const InlineCardSetup: React.FC<InlineCardSetupProps> = ({
  setupIntentSecret,
  loadingSetupIntent,
  isDarkMode,
  membershipStripeAppearance,
  userData,
  isLoading,
  onSuccess,
}) => {
  // Lazy Stripe boot — getStripePromise() returns a module-level cached singleton
  // (Stripe prohibits re-instantiation per render), so this identity is stable
  // across renders; calling it here (not at module scope) avoids booting Stripe.js
  // for every visitor who downloads this chunk (2026-07 perf audit).
  const stripePromise = useMemo(() => getStripePromise(), []);
  const userName =
    formatDisplayName(userData?.firstName, userData?.lastName) || undefined;

  return (
    <div className="mb-4 space-y-3 rounded-xl border-2 border-neutral-200 dark:border-neutral-700 border-l-4 border-l-red-600 p-3 sm:p-4 bg-neutral-50 dark:bg-neutral-900 shadow-sm">
      <div className="flex items-start gap-2">
        <CreditCard className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Add a payment method
          </h4>
          <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-300 mt-1">
            There&apos;s no card on file for this renewal. Enter a new card and
            we&apos;ll retry your payment automatically.
          </p>
        </div>
      </div>

      {loadingSetupIntent && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-neutral-600 dark:text-neutral-300">
          <Loader2 className="w-5 h-5 animate-spin" />
          Preparing secure form&hellip;
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
            userName={userName}
            userPhone={userData?.mobile}
            onSuccess={onSuccess}
            disabled={isLoading}
            submitLabel="Save card & retry payment"
          />
        </Elements>
      )}
    </div>
  );
};

export default InlineCardSetup;
