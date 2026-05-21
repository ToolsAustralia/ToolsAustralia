"use client";

import React from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Elements } from "@stripe/react-stripe-js";
import type { Stripe } from "@stripe/stripe-js";
import { StripeInlineCardSetupForm } from "@/components/payment/StripeInlineCardSetupForm";
import { buildMembershipStripeAppearance } from "@/utils/payment/stripe/membership-stripe-appearance";

interface PaymentSectionProps {
  showInlineCardSetup: boolean;
  loadingSetupIntent: boolean;
  setupIntentSecret: string | null;
  stripePromise: Promise<Stripe | null>;
  membershipStripeAppearance: ReturnType<typeof buildMembershipStripeAppearance>;
  isDarkMode: boolean;
  userEmail?: string;
  userName?: string;
  userPhone?: string;
  isProcessing: boolean;
  upsellPriceLabel: string;
  onCardSaved: (paymentMethodId: string) => Promise<void> | void;
}

const PaymentSection: React.FC<PaymentSectionProps> = ({
  showInlineCardSetup,
  loadingSetupIntent,
  setupIntentSecret,
  stripePromise,
  membershipStripeAppearance,
  isDarkMode,
  userEmail,
  userName,
  userPhone,
  isProcessing,
  upsellPriceLabel,
  onCardSaved,
}) => {
  return (
    <>
      {showInlineCardSetup && (
        <div className="mb-3 space-y-3 rounded-lg border-2 border-gray-200 dark:border-neutral-700 border-l-4 border-l-red-500 dark:border-l-red-400 p-3 sm:p-4 bg-gray-50 dark:bg-neutral-800/90 shadow-sm">
          <div className="flex items-start gap-2">
            <CreditCard className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Add a payment method</h4>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-400 mt-1">
                No saved card on file. Enter your card below — we&apos;ll save it and charge this offer.
              </p>
            </div>
          </div>
          {loadingSetupIntent && (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-gray-600 dark:text-neutral-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              Preparing secure form…
            </div>
          )}
          {setupIntentSecret && !loadingSetupIntent && (
            <Elements
              key={`${setupIntentSecret}-up-${isDarkMode ? "d" : "l"}`}
              stripe={stripePromise}
              options={{
                clientSecret: setupIntentSecret,
                locale: "en",
                appearance: membershipStripeAppearance,
              }}
            >
              <StripeInlineCardSetupForm
                clientSecret={setupIntentSecret}
                userEmail={userEmail}
                userName={userName}
                userPhone={userPhone}
                onSuccess={onCardSaved}
                disabled={isProcessing}
                submitLabel={`Save card & purchase — $${upsellPriceLabel}`}
              />
            </Elements>
          )}
        </div>
      )}
    </>
  );
};

export default PaymentSection;
