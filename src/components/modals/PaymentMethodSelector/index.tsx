"use client";

/**
 * PaymentMethodSelector — decomposed from a 1052-LOC flat file into the
 * canonical orchestrator-folder pattern.
 *
 * NOTE: Despite living under `src/components/modals/`, this is NOT a modal —
 * it's an inline payment-method-picker panel embedded by MembershipModal and
 * StripePaymentModal. The component renders as a bare `<div>` (no
 * ModalContainer wrapper). The folder lives here for legacy reasons.
 *
 * Public API (props) is preserved byte-identically — all callers continue to
 * work without modification because the folder/index.tsx resolves as the same
 * import path.
 *
 * STRIPE PRESERVATION INVARIANTS:
 * 1. `stripePromise` is a module-scope singleton (Stripe prohibits
 *    re-instantiation per render). The Elements provider lives in this
 *    orchestrator; the promise is created exactly once at module load.
 * 2. The `<Elements>` `key` value
 *    `elements-${activeIntentType}-${packageType}-${secretPrefix}-${amount}-${packageName}-${theme}`
 *    is preserved verbatim — changing the key forces a fresh mount when the
 *    intent / package / amount / theme changes.
 * 3. The ref shape exposed by `<CardFormSection>` is forwarded via
 *    `cardFormRef` so MembershipModal's `cardFormRef.current.confirmStripeIntent()`
 *    call sites continue to work unchanged.
 * 4. The hidden-mount fallback (when `selectedPaymentMethod` is set but the
 *    invoice PaymentIntent still needs client-side confirmation) preserves
 *    the absolute-positioned offscreen container so MembershipModal can run
 *    `confirmStripeIntent` against a Stripe Elements instance that never
 *    became visible to the user.
 */

import React, { useState, useEffect, useMemo } from "react";
import { CreditCard, Cog } from "lucide-react";
import { useSavedPaymentMethods, type SavedPaymentMethod } from "@/hooks/useSavedPaymentMethods";
import SavedPaymentMethodsModal from "../SavedPaymentMethodsModal";
import { Elements } from "@stripe/react-stripe-js";
import { getStripePromise } from "@/lib/stripe-client";
import { useThemeStore } from "@/stores/useThemeStore";
import { buildMembershipStripeAppearance } from "@/utils/payment/stripe/membership-stripe-appearance";
import { cn } from "@/utils/cn";

import SavedCardPreview from "./SavedCardPreview";
import ChangeMethodRow from "./ChangeMethodRow";
import AddNewCardRow from "./AddNewCardRow";
import CardFormSection from "./CardFormSection";

// Module-scope Stripe singleton — Stripe prohibits re-instantiation per render.
const stripePromise = getStripePromise();

interface PaymentMethodSelectorProps {
  onPaymentMethodSelect: (paymentMethod: SavedPaymentMethod | null) => void;
  onAddNewPaymentMethod: () => void;
  selectedPaymentMethod?: SavedPaymentMethod | null;
  className?: string;
  isAuthenticated?: boolean;
  // New props for Stripe Elements integration
  showCardForm?: boolean;
  setupIntentClientSecret?: string | null; // Backward compatibility - kept for fallback
  paymentIntentClientSecret?: string | null; // NEW: PaymentIntent for wallet payments with amount
  intentType?: "setup" | "payment"; // NEW: Type of intent being used
  cardFormRef: React.Ref<{
    confirmStripeIntent: () => Promise<{
      paymentMethodId?: string;
      paymentIntentId?: string;
      error?: string;
      setupIntentAlreadySucceeded?: boolean;
      needsRecovery?: boolean;
      lastSetupError?: { code?: string; message?: string; decline_code?: string };
      errorCategory?: "recoverable" | "retryable" | "non-recoverable";
      errorType?: string;
      isRecoverable?: boolean;
      recoveryStrategy?: string;
      shouldPreserveState?: boolean;
    }>;
  } | null>;
  onCardElementChange: (event: { error?: { message?: string } }) => void;
  cardFormError: string | null;
  isCreatingSetupIntent?: boolean;
  isCreatingPaymentIntent?: boolean; // NEW: Loading state for PaymentIntent creation
  isCreatingSubscription?: boolean; // Loading state while invoice PaymentIntent is being created (subscription Payment Element)
  // Billing details for when billingDetails: "never" is set
  billingDetails?: {
    name?: string;
    email?: string;
    phone?: string;
    country?: string; // ISO country code (e.g., "AU" for Australia)
    state?: string; // State/Province code (e.g., "NSW" for New South Wales)
    city?: string; // City name
    postalCode?: string; // Postal/ZIP code
    line1?: string; // Address line 1
  };
  // Amount and package name for wallet payment display (Apple Pay/Google Pay)
  amount?: number; // Amount in cents
  packageName?: string; // Package name for payment request label
  /** Option A (wallet UX): parent uses this to hide/disable main Purchase when google_pay/apple_pay selected */
  onPaymentMethodTypeChange?: (type: string | null) => void;
}

const PaymentMethodSelector: React.FC<PaymentMethodSelectorProps> = ({
  onPaymentMethodSelect,
  onAddNewPaymentMethod,
  selectedPaymentMethod,
  className = "",
  isAuthenticated = false,
  showCardForm = false,
  setupIntentClientSecret = null,
  paymentIntentClientSecret = null,
  intentType,
  cardFormRef,
  onCardElementChange,
  cardFormError,
  isCreatingSetupIntent = false,
  isCreatingPaymentIntent = false,
  isCreatingSubscription = false,
  billingDetails,
  amount,
  packageName,
  onPaymentMethodTypeChange,
}) => {
  // Determine which clientSecret to use (PaymentIntent takes priority for wallet payments)
  const activeClientSecret = paymentIntentClientSecret || setupIntentClientSecret;
  // Stripe Elements requires a client_secret string; API may return { client_secret, type }
  const clientSecretForElements: string | null =
    typeof activeClientSecret === "string"
      ? activeClientSecret
      : activeClientSecret &&
        typeof activeClientSecret === "object" &&
        typeof (activeClientSecret as { client_secret?: string }).client_secret === "string"
        ? (activeClientSecret as { client_secret: string }).client_secret
        : null;
  // Use provided intentType or calculate from client secrets
  const activeIntentType: "setup" | "payment" | undefined =
    intentType || (paymentIntentClientSecret ? "payment" : setupIntentClientSecret ? "setup" : undefined);
  // ✅ FIX: Derive package type from intentType and amount for proper Elements remounting
  // PaymentIntent with amount = one-time, SetupIntent = subscription
  const packageType = paymentIntentClientSecret && amount && amount > 0 ? "one-time" : "membership";
  const isCreatingIntent = isCreatingPaymentIntent || isCreatingSetupIntent || isCreatingSubscription;
  const { paymentMethods, loading } = useSavedPaymentMethods();
  const [showPaymentMethodsModal, setShowPaymentMethodsModal] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const isDarkMode = useThemeStore((s) => s.theme === "dark");
  const stripeAppearance = useMemo(() => buildMembershipStripeAppearance(isDarkMode), [isDarkMode]);

  // Auto-select default payment method when component loads (only once)
  useEffect(() => {
    if (paymentMethods.length > 0 && !selectedPaymentMethod && !hasUserInteracted) {
      const defaultPaymentMethod = paymentMethods.find((pm) => pm.isDefault);
      if (defaultPaymentMethod) {
        onPaymentMethodSelect(defaultPaymentMethod);
      }
    }
  }, [paymentMethods, selectedPaymentMethod, onPaymentMethodSelect, hasUserInteracted]);

  // Log Elements key value when it changes to verify remounting
  useEffect(() => {
    const elementsKey = `elements-${amount || 0}-${packageName || "default"}`;
    console.log("🔍 Elements Key Debug:", {
      elementsKey,
      amount,
      packageName,
      keyChanged: true,
    });
  }, [amount, packageName]);

  const handleSelectPaymentMethod = (paymentMethod: SavedPaymentMethod) => {
    setHasUserInteracted(true);
    onPaymentMethodSelect(paymentMethod);
    setShowPaymentMethodsModal(false);
  };

  const handleUseDefaultPaymentMethod = () => {
    setHasUserInteracted(true);
    const defaultPaymentMethod = paymentMethods.find((pm) => pm.isDefault);
    if (defaultPaymentMethod) {
      onPaymentMethodSelect(defaultPaymentMethod);
    }
  };

  if (loading) {
    return (
      <div className={cn("space-y-2 sm:space-y-3", className)}>
        {/* Payment Method Skeleton */}
        <div className="border border-gray-200 dark:border-neutral-700 rounded-lg sm:rounded-xl p-3 sm:p-4">
          <div className="flex items-center space-x-3 sm:space-x-4">
            {/* Card Icon Skeleton */}
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-200 dark:bg-neutral-800 rounded-lg animate-pulse flex-shrink-0"></div>

            {/* Card Details Skeleton */}
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-neutral-800 rounded animate-pulse w-3/4"></div>
              <div className="h-3 bg-gray-200 dark:bg-neutral-800 rounded animate-pulse w-1/2"></div>
            </div>

            {/* Radio Button Skeleton */}
            <div className="w-5 h-5 bg-gray-200 dark:bg-neutral-800 rounded-full animate-pulse flex-shrink-0"></div>
          </div>
        </div>

        {/* Add New Payment Method Skeleton */}
        <div className="border border-gray-200 dark:border-neutral-700 rounded-lg sm:rounded-xl p-3 sm:p-4">
          <div className="flex items-center space-x-3 sm:space-x-4">
            {/* Plus Icon Skeleton */}
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-200 dark:bg-neutral-800 rounded-lg animate-pulse flex-shrink-0"></div>

            {/* Add New Text Skeleton */}
            <div className="flex-1">
              <div className="h-4 bg-gray-200 dark:bg-neutral-800 rounded animate-pulse w-2/3"></div>
            </div>

            {/* Chevron Skeleton */}
            <div className="w-5 h-5 bg-gray-200 dark:bg-neutral-800 rounded animate-pulse flex-shrink-0"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2 sm:space-y-3", className)}>
      {/* Show card form directly for new users - no Payment Method section */}
      {!isAuthenticated && (
        <>
          {isCreatingIntent ? (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-neutral-100 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-red-600" />
                Card Details
              </h4>
              <div className="p-4 sm:p-6 border border-gray-200 dark:border-neutral-600 rounded-lg sm:rounded-xl bg-gray-50 dark:bg-neutral-900 flex flex-col items-center justify-center gap-4 min-h-[120px]">
                <Cog className="w-8 h-8 sm:w-10 sm:h-10 text-red-600 animate-spin" aria-hidden />
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-neutral-100">Preparing secure checkout...</p>
                  <p className="text-xs text-gray-500 dark:text-neutral-400">Loading your payment form. This only takes a moment.</p>
                </div>
              </div>
            </div>
          ) : clientSecretForElements && activeIntentType ? (
            <Elements
              key={`elements-${activeIntentType}-${packageType}-${clientSecretForElements.split("_secret_")[0] || clientSecretForElements.slice(0, 24)}-${amount || 0}-${packageName || "default"}-${isDarkMode ? "dark" : "light"}`}
              stripe={stripePromise}
              options={{
                clientSecret: clientSecretForElements,
                locale: "en",
                appearance: stripeAppearance,
              }}
            >
              <CardFormSection
                ref={cardFormRef}
                clientSecret={clientSecretForElements}
                intentType={activeIntentType}
                onCardElementChange={onCardElementChange}
                cardError={cardFormError}
                billingDetails={billingDetails}
                amount={amount}
                packageName={packageName}
                onPaymentMethodTypeChange={onPaymentMethodTypeChange}
              />
            </Elements>
          ) : cardFormError ? (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-neutral-100 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-red-600" />
                Card Details
              </h4>
              <div className="p-4 border border-red-300 dark:border-red-800/60 rounded-lg bg-red-50 dark:bg-red-950/40">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 text-red-600 dark:text-red-400">⚠️</div>
                  <div>
                    <p className="text-sm text-red-800 dark:text-red-300 font-medium">Failed to load payment form</p>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{cardFormError}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}

      {/* For authenticated users, show Payment Method section */}
      {isAuthenticated && (
        <>
          <h3 className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-neutral-100 flex items-center gap-1.5 sm:gap-2">
            <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
            Payment Method
          </h3>

          {/* Selected Payment Method */}
          {selectedPaymentMethod ? (
            <SavedCardPreview
              paymentMethod={selectedPaymentMethod}
              onClearSelection={() => {
                setHasUserInteracted(true);
                onPaymentMethodSelect(null);
              }}
            />
          ) : (
            <div className="space-y-2 sm:space-y-3">
              <ChangeMethodRow
                paymentMethods={paymentMethods}
                onUseDefault={handleUseDefaultPaymentMethod}
                onOpenSavedMethods={() => {
                  setHasUserInteracted(true);
                  setShowPaymentMethodsModal(true);
                }}
              />

              <AddNewCardRow
                onAddNew={() => {
                  setHasUserInteracted(true);
                  onAddNewPaymentMethod();
                }}
              />
            </div>
          )}

          {/* Show card form when adding new payment method, OR mount hidden form for subscription invoice when using saved method (so confirmStripeIntent can run) */}
          {(showCardForm || (clientSecretForElements && activeIntentType === "payment")) && (
            <div
              className={cn("space-y-4", selectedPaymentMethod && !showCardForm ? "absolute -left-[9999px] w-[400px] h-[200px] overflow-hidden opacity-0 pointer-events-none" : "")}
              aria-hidden={!!(selectedPaymentMethod && !showCardForm)}
            >
              {isCreatingIntent ? (
                <div className="p-4 sm:p-6 border border-gray-200 dark:border-neutral-600 rounded-lg sm:rounded-xl bg-gray-50 dark:bg-neutral-900 flex flex-col items-center justify-center gap-4 min-h-[120px]">
                  <Cog className="w-8 h-8 sm:w-10 sm:h-10 text-red-600 animate-spin" aria-hidden />
                  <div className="text-center space-y-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-neutral-100">Preparing secure checkout...</p>
                    <p className="text-xs text-gray-500 dark:text-neutral-400">Loading your payment form. This only takes a moment.</p>
                  </div>
                </div>
              ) : clientSecretForElements && activeIntentType ? (
                <Elements
                  key={`elements-${activeIntentType}-${packageType}-${clientSecretForElements.split("_secret_")[0] || clientSecretForElements.slice(0, 24)}-${amount || 0}-${packageName || "default"}-${isDarkMode ? "dark" : "light"}`}
                  stripe={stripePromise}
                  options={{
                    clientSecret: clientSecretForElements,
                    locale: "en",
                    appearance: stripeAppearance,
                  }}
                >
                  <CardFormSection
                    ref={cardFormRef}
                    clientSecret={clientSecretForElements}
                    intentType={activeIntentType}
                    onCardElementChange={onCardElementChange}
                    cardError={cardFormError}
                    billingDetails={billingDetails}
                    amount={amount}
                    packageName={packageName}
                    onPaymentMethodTypeChange={onPaymentMethodTypeChange}
                  />
                </Elements>
              ) : (
                // Fallback loading state
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-gray-200 dark:bg-neutral-800 rounded animate-pulse"></div>
                    <div className="h-4 bg-gray-200 dark:bg-neutral-800 rounded animate-pulse w-24"></div>
                  </div>
                  <div className="p-3 border border-gray-300 dark:border-neutral-600 rounded-lg bg-gray-50 dark:bg-neutral-950">
                    <div className="h-12 bg-gray-200 dark:bg-neutral-800 rounded animate-pulse"></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Saved Payment Methods Modal */}
      <SavedPaymentMethodsModal
        isOpen={showPaymentMethodsModal}
        onClose={() => setShowPaymentMethodsModal(false)}
        onSelectPaymentMethod={handleSelectPaymentMethod}
        showAddNew={false}
        isAuthenticated={isAuthenticated}
      />
    </div>
  );
};

export default PaymentMethodSelector;
