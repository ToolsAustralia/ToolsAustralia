"use client";

import React, { useState, useEffect } from "react";
import { CreditCard, Plus, ChevronRight } from "lucide-react";
import { useSavedPaymentMethods, type SavedPaymentMethod } from "@/hooks/useSavedPaymentMethods";
import SavedPaymentMethodsModal from "./SavedPaymentMethodsModal";
import { PaymentElement, useStripe, useElements, Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

// Initialize Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

// CARD_ELEMENT_OPTIONS removed - PaymentElement handles styling automatically

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
    confirmSetup: () => Promise<{ paymentMethodId?: string; paymentIntentId?: string; error?: string }>;
  } | null>;
  onCardElementChange: (event: { error?: { message?: string } }) => void;
  cardFormError: string | null;
  isCreatingSetupIntent?: boolean;
  isCreatingPaymentIntent?: boolean; // NEW: Loading state for PaymentIntent creation
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
  // ✅ NEW: Flag to indicate if this is an upfront PaymentIntent for subscriptions (should be cancelled after payment method extraction)
  isUpfrontPaymentIntent?: boolean;
}

// Stripe Card Form Component - Now a ref-based component without buttons
// Supports both PaymentIntent (for wallet payments with amount) and SetupIntent (for backward compatibility)
const StripeCardForm = React.forwardRef<
  { confirmSetup: () => Promise<{ paymentMethodId?: string; paymentIntentId?: string; error?: string }> },
  {
    clientSecret: string;
    intentType: "setup" | "payment"; // Type of intent: "payment" for PaymentIntent, "setup" for SetupIntent
    onCardElementChange: (event: { error?: { message?: string } }) => void;
    cardError: string | null;
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
    amount?: number; // Amount in cents for wallet payment display
    packageName?: string; // Package name for payment request label
    isUpfrontPaymentIntent?: boolean; // ✅ NEW: Flag to indicate if this is an upfront PaymentIntent for subscriptions
  }
>(
  (
    {
      clientSecret,
      intentType,
      onCardElementChange,
      cardError,
      billingDetails,
      amount,
      packageName,
      isUpfrontPaymentIntent,
    },
    ref
  ) => {
    const stripe = useStripe();
    const elements = useElements();
    const [isStripeLoading, setIsStripeLoading] = useState(true);

    // Handle Stripe loading state
    useEffect(() => {
      if (stripe && elements) {
        setIsStripeLoading(false);
      }
    }, [stripe, elements]);

    // ✅ STRIPE BEST PRACTICE: Only enable wallet payments when PaymentIntent is ready with correct amount
    // This prevents Google Pay/Apple Pay from showing $0.00 when PaymentIntent hasn't been created yet
    // For subscriptions: PaymentIntent must be created before wallets can show correct amount
    // For one-time: PaymentIntent is created upfront, so wallets can be enabled immediately
    // Note: For SetupIntent (intentType === "setup"), wallets should be disabled as they show $0.00
    const shouldEnableWallets = intentType === "payment" && amount && amount > 0;

    // Build paymentRequest configuration - only include if amount is valid
    // This ensures PaymentElement shows correct amount in wallet UIs
    const paymentRequestConfig:
      | { country: string; currency: string; total: { label: string; amount: number } }
      | undefined = shouldEnableWallets
      ? {
          country: "AU",
          currency: "aud",
          total: {
            label: packageName || "Membership",
            amount: amount, // Amount in cents - only set when valid
          },
        }
      : undefined;

    // Build PaymentElement options object (moved before conditional return to ensure hooks are called consistently)
    const paymentElementOptions = {
      layout: "tabs" as const,
      // ✅ CRITICAL: Only enable wallets when PaymentIntent is ready with correct amount
      // This prevents $0.00 display in Google Pay/Apple Pay wallet sheets
      wallets: shouldEnableWallets
        ? {
            applePay: "auto" as const,
            googlePay: "auto" as const,
          }
        : undefined, // Disable wallets until PaymentIntent is ready
      paymentMethodOrder: shouldEnableWallets ? ["apple_pay", "google_pay", "card"] : ["card"],
      // Only include paymentRequest when amount is valid to prevent $0.00 display
      ...(paymentRequestConfig && { paymentRequest: paymentRequestConfig }),
      fields: {
        billingDetails: "never" as const, // Hide country, address, and postal code fields
      },
      terms: {
        card: "never" as const, // Hide the "By providing your card information..." terms text
        applePay: "never" as const,
        googlePay: "never" as const,
      },
    };

    // Debug logging for amount, packageName, and paymentRequest configuration
    // IMPORTANT: All hooks must be called before any conditional returns
    useEffect(() => {
      console.log("🔍 StripeCardForm Debug:", {
        amount,
        packageName,
        amountInCents: amount,
        amountInDollars: amount ? (amount / 100).toFixed(2) : "N/A",
        hasPaymentRequest: !!amount,
        paymentRequestConfig,
        elementKey: `payment-element-${amount || 0}-${packageName || "default"}`,
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [amount, packageName]);

    // Log PaymentElement options to verify paymentRequest is included
    useEffect(() => {
      console.log("🔍 PaymentElement Options:", {
        layout: paymentElementOptions.layout,
        wallets: paymentElementOptions.wallets,
        paymentMethodOrder: paymentElementOptions.paymentMethodOrder,
        paymentRequest: paymentRequestConfig,
        hasPaymentRequest: !!paymentRequestConfig,
        shouldEnableWallets,
        fields: paymentElementOptions.fields,
        terms: paymentElementOptions.terms,
      });

      // Detailed log for paymentRequest structure verification (only if paymentRequest exists)
      if (paymentRequestConfig) {
        console.log("🔍 PaymentRequest Structure (for wallet payments):", {
          country: paymentRequestConfig.country,
          currency: paymentRequestConfig.currency,
          total: {
            label: paymentRequestConfig.total.label,
            amount: paymentRequestConfig.total.amount,
            amountInDollars: (paymentRequestConfig.total.amount / 100).toFixed(2),
          },
          isValid: paymentRequestConfig.total.amount > 0,
        });
      } else {
        console.log("⚠️ PaymentRequest not configured - wallets disabled until PaymentIntent is ready");
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [amount, packageName, shouldEnableWallets]);

    // Build billing details object for confirmation
    const buildBillingDetails = () => {
      return billingDetails?.name
        ? {
            name: billingDetails.name,
            email: billingDetails.email,
            phone: billingDetails.phone,
            address: {
              country: billingDetails.country || "AU",
              state: billingDetails.state || "NSW",
              city: billingDetails.city || "Sydney",
              postal_code: billingDetails.postalCode || "2000",
              line1: billingDetails.line1 || "1 Martin Place",
            },
          }
        : {
            name: billingDetails?.email || "Customer",
            address: {
              country: billingDetails?.country || "AU",
              state: billingDetails?.state || "NSW",
              city: billingDetails?.city || "Sydney",
              postal_code: billingDetails?.postalCode || "2000",
              line1: billingDetails?.line1 || "1 Martin Place",
            },
          };
    };

    // Expose confirmSetup function via ref - handles both PaymentIntent and SetupIntent
    React.useImperativeHandle(ref, () => ({
      confirmSetup: async () => {
        if (!stripe || !elements) {
          return { error: "Stripe not loaded" };
        }

        try {
          // ✅ CRITICAL: PaymentElement requires elements.submit() before confirmation
          // This validates the form and prepares it for confirmation
          const { error: submitError } = await elements.submit();

          if (submitError) {
            console.error("PaymentElement validation error:", submitError);
            return { error: submitError.message || "Please complete all required fields." };
          }

          const billingDetailsData = buildBillingDetails();

          // Handle PaymentIntent (for wallet payments with amount display)
          if (intentType === "payment") {
            const { paymentIntent, error } = await stripe.confirmPayment({
              elements,
              clientSecret,
              confirmParams: {
                payment_method_data: {
                  billing_details: billingDetailsData,
                },
              },
              redirect: "if_required",
            });

            if (error) {
              console.error("Stripe PaymentIntent error:", error);
              return { error: error.message || "Payment confirmation failed." };
            } else if (paymentIntent?.payment_method) {
              // ✅ STRIPE BEST PRACTICE: For upfront PaymentIntents (subscriptions), cancel immediately after getting payment method
              // This prevents double charging - the upfront PaymentIntent is ONLY for wallet display
              // The invoice PaymentIntent (from Stripe Price catalog) is the one that should be charged
              if (isUpfrontPaymentIntent && paymentIntent.id) {
                try {
                  // Cancel the upfront PaymentIntent immediately to prevent it from being charged
                  // This must happen BEFORE the payment succeeds
                  const cancelResponse = await fetch("/api/stripe/cancel-payment-intent", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      paymentIntentId: paymentIntent.id,
                    }),
                  });

                  if (cancelResponse.ok) {
                    console.log(
                      `✅ Cancelled upfront PaymentIntent ${paymentIntent.id} immediately after payment method extraction`
                    );
                  } else {
                    console.warn(
                      `⚠️ Failed to cancel upfront PaymentIntent ${paymentIntent.id} - may cause double charge`
                    );
                  }
                } catch (cancelError) {
                  console.error(`❌ Error cancelling upfront PaymentIntent: ${cancelError}`);
                  // Continue - backend will also try to cancel it
                }
              }

              console.log("✅ PaymentIntent succeeded:", paymentIntent);
              return {
                paymentMethodId: paymentIntent.payment_method as string,
                paymentIntentId: paymentIntent.id,
              };
            } else {
              throw new Error("Unexpected error during payment confirmation.");
            }
          } else {
            // Handle SetupIntent (backward compatibility)
            const { setupIntent, error } = await stripe.confirmSetup({
              elements,
              clientSecret,
              confirmParams: {
                payment_method_data: {
                  billing_details: billingDetailsData,
                },
              },
              redirect: "if_required",
            });

            if (error) {
              console.error("Stripe SetupIntent error:", error);
              return { error: error.message || "Payment method setup failed." };
            } else if (setupIntent?.payment_method) {
              console.log("✅ SetupIntent succeeded:", setupIntent);
              return { paymentMethodId: setupIntent.payment_method as string };
            } else {
              throw new Error("Unexpected error during payment method setup.");
            }
          }
        } catch (err: unknown) {
          console.error("Error in confirmSetup:", err);
          const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
          return { error: errorMessage };
        }
      },
    }));

    // Show skeleton loading while Stripe is loading
    // IMPORTANT: Conditional return must come AFTER all hooks are called
    if (isStripeLoading) {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded animate-pulse w-24"></div>
          </div>
          <div className="p-3 border border-gray-300 rounded-lg bg-gray-50">
            {/* Card Element Skeleton */}
            <div className="h-12 bg-gray-200 rounded animate-pulse flex items-center px-3">
              <div className="flex items-center space-x-2 w-full">
                <div className="w-6 h-4 bg-gray-300 rounded animate-pulse"></div>
                <div className="flex-1 h-4 bg-gray-300 rounded animate-pulse"></div>
                <div className="w-8 h-4 bg-gray-300 rounded animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-red-600" />
          Payment Details
        </h4>
        <div className="p-3 border border-gray-300 rounded-lg bg-white">
          <PaymentElement
            key={`payment-element-${amount || 0}-${packageName || "default"}`}
            options={paymentElementOptions}
            onChange={(event) => {
              // Handle PaymentElement change events
              // PaymentElement onChange provides completion status
              // Errors are handled separately via onReady callback or element state
              if (!event.complete) {
                // Payment method is incomplete - clear any previous errors
                onCardElementChange({});
              } else {
                // Payment method is complete
                onCardElementChange({});
              }
            }}
          />
        </div>
        {cardError && <p className="text-red-500 text-sm mt-2">{cardError}</p>}
      </div>
    );
  }
);

StripeCardForm.displayName = "StripeCardForm";

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
  billingDetails,
  amount,
  packageName,
}) => {
  // Determine which clientSecret to use (PaymentIntent takes priority for wallet payments)
  const activeClientSecret = paymentIntentClientSecret || setupIntentClientSecret;
  // Use provided intentType or calculate from client secrets
  const activeIntentType: "setup" | "payment" | undefined =
    intentType || (paymentIntentClientSecret ? "payment" : setupIntentClientSecret ? "setup" : undefined);
  // ✅ FIX: Derive package type from intentType and amount for proper Elements remounting
  // PaymentIntent with amount = one-time, SetupIntent = subscription
  const packageType = paymentIntentClientSecret && amount && amount > 0 ? "one-time" : "subscription";
  const isCreatingIntent = isCreatingPaymentIntent || isCreatingSetupIntent;
  const { paymentMethods, loading } = useSavedPaymentMethods();
  const [showPaymentMethodsModal, setShowPaymentMethodsModal] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

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

  const getCardBrandIcon = (brand: string) => {
    const brandLower = brand.toLowerCase();
    if (brandLower.includes("visa")) return "💳";
    if (brandLower.includes("mastercard")) return "💳";
    if (brandLower.includes("amex") || brandLower.includes("american express")) return "💳";
    return "💳";
  };

  const formatCardDisplay = (paymentMethod: SavedPaymentMethod) => {
    if (!paymentMethod.card) return "Payment Method";
    return `${paymentMethod.card.brand.toUpperCase()} •••• ${paymentMethod.card.last4}`;
  };

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
      <div className={`space-y-2 sm:space-y-3 ${className}`}>
        {/* Payment Method Skeleton */}
        <div className="border border-gray-200 rounded-lg sm:rounded-xl p-3 sm:p-4">
          <div className="flex items-center space-x-3 sm:space-x-4">
            {/* Card Icon Skeleton */}
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-200 rounded-lg animate-pulse flex-shrink-0"></div>

            {/* Card Details Skeleton */}
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
              <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2"></div>
            </div>

            {/* Radio Button Skeleton */}
            <div className="w-5 h-5 bg-gray-200 rounded-full animate-pulse flex-shrink-0"></div>
          </div>
        </div>

        {/* Add New Payment Method Skeleton */}
        <div className="border border-gray-200 rounded-lg sm:rounded-xl p-3 sm:p-4">
          <div className="flex items-center space-x-3 sm:space-x-4">
            {/* Plus Icon Skeleton */}
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-200 rounded-lg animate-pulse flex-shrink-0"></div>

            {/* Add New Text Skeleton */}
            <div className="flex-1">
              <div className="h-4 bg-gray-200 rounded animate-pulse w-2/3"></div>
            </div>

            {/* Chevron Skeleton */}
            <div className="w-5 h-5 bg-gray-200 rounded animate-pulse flex-shrink-0"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-2 sm:space-y-3 ${className}`}>
      {/* Show card form directly for new users - no Payment Method section */}
      {!isAuthenticated && (
        <>
          {isCreatingIntent ? (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-red-600" />
                Card Details
              </h4>
              <div className="p-3 border border-gray-300 rounded-lg bg-white">
                {/* Card number skeleton */}
                <div className="animate-pulse bg-gray-200 h-6 rounded mb-3"></div>
                {/* Card details row skeleton */}
                <div className="flex gap-3">
                  <div className="flex-1 animate-pulse bg-gray-200 h-6 rounded"></div>
                  <div className="w-20 animate-pulse bg-gray-200 h-6 rounded"></div>
                </div>
              </div>
              <div className="text-center">
                <div className="inline-flex items-center space-x-2 text-sm text-gray-500">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-red-600 rounded-full animate-spin"></div>
                  <span>Setting up secure payment form...</span>
                </div>
              </div>
            </div>
          ) : activeClientSecret && activeIntentType ? (
            <Elements
              key={`elements-${activeIntentType}-${packageType}-${amount || 0}-${packageName || "default"}`}
              stripe={stripePromise}
              options={{
                clientSecret: activeClientSecret,
                locale: "en",
                appearance: {
                  theme: "stripe",
                  variables: {
                    colorPrimary: "#ee0000",
                    colorBackground: "#ffffff",
                    colorText: "#1f2937",
                    colorDanger: "#dc2626",
                    fontFamily: "system-ui, sans-serif",
                    spacingUnit: "4px",
                    borderRadius: "8px",
                  },
                },
              }}
            >
              <StripeCardForm
                ref={cardFormRef}
                clientSecret={activeClientSecret}
                intentType={activeIntentType}
                onCardElementChange={onCardElementChange}
                cardError={cardFormError}
                billingDetails={billingDetails}
                amount={amount}
                packageName={packageName}
              />
            </Elements>
          ) : cardFormError ? (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-red-600" />
                Card Details
              </h4>
              <div className="p-4 border border-red-300 rounded-lg bg-red-50">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 text-red-600">⚠️</div>
                  <div>
                    <p className="text-sm text-red-800 font-medium">Failed to load payment form</p>
                    <p className="text-xs text-red-600 mt-1">{cardFormError}</p>
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
          <h3 className="text-sm sm:text-lg font-semibold text-gray-900 flex items-center gap-1.5 sm:gap-2">
            <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
            Payment Method
          </h3>

          {/* Selected Payment Method */}
          {selectedPaymentMethod ? (
            <div className="border-2 border-blue-500 bg-blue-50 rounded-lg sm:rounded-xl p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="flex items-center justify-center w-8 h-5 sm:w-10 sm:h-6 bg-white rounded">
                    <span className="text-sm sm:text-lg">
                      {getCardBrandIcon(selectedPaymentMethod.card?.brand || "")}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 text-sm sm:text-base">
                      {formatCardDisplay(selectedPaymentMethod)}
                    </h4>
                    {selectedPaymentMethod.isDefault && (
                      <p className="text-xs text-blue-600 font-medium">✓ Default Payment Method</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setHasUserInteracted(true);
                    onPaymentMethodSelect(null);
                  }}
                  className="text-blue-600 hover:text-blue-800 text-xs sm:text-sm font-medium"
                >
                  Change
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 sm:space-y-3">
              {/* Use Default Payment Method */}
              {paymentMethods.length > 0 && (
                <button
                  onClick={handleUseDefaultPaymentMethod}
                  className="w-full border-2 border-gray-200 hover:border-blue-300 rounded-lg sm:rounded-xl p-3 sm:p-4 text-left transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 group-hover:text-blue-600" />
                      <div>
                        <h4 className="font-medium text-gray-900 text-sm sm:text-base">
                          <span className="sm:hidden">Use Default</span>
                          <span className="hidden sm:inline">Use Default Payment Method</span>
                        </h4>
                        <p className="text-xs sm:text-sm text-gray-600">
                          {paymentMethods.find((pm) => pm.isDefault)?.card
                            ? formatCardDisplay(paymentMethods.find((pm) => pm.isDefault)!)
                            : "No default payment method"}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 group-hover:text-blue-600" />
                  </div>
                </button>
              )}

              {/* Choose from Saved Methods */}
              {paymentMethods.length > 0 && (
                <button
                  onClick={() => {
                    setHasUserInteracted(true);
                    setShowPaymentMethodsModal(true);
                  }}
                  className="w-full border-2 border-gray-200 hover:border-blue-300 rounded-lg sm:rounded-xl p-3 sm:p-4 text-left transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 group-hover:text-blue-600" />
                      <div>
                        <h4 className="font-medium text-gray-900 text-sm sm:text-base">
                          <span className="sm:hidden">Saved Methods</span>
                          <span className="hidden sm:inline">Choose from Saved Methods</span>
                        </h4>
                        <p className="text-xs sm:text-sm text-gray-600">
                          {paymentMethods.length} saved payment method{paymentMethods.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 group-hover:text-blue-600" />
                  </div>
                </button>
              )}

              {/* Add New Payment Method */}
              <button
                onClick={() => {
                  setHasUserInteracted(true);
                  onAddNewPaymentMethod();
                }}
                className="w-full border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-lg sm:rounded-xl p-3 sm:p-4 text-left transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <Plus className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 group-hover:text-blue-600" />
                    <div>
                      <h4 className="font-medium text-gray-900 text-sm sm:text-base">
                        <span className="sm:hidden">Add New Card</span>
                        <span className="hidden sm:inline">Add New Payment Method</span>
                      </h4>
                      <p className="text-xs sm:text-sm text-gray-600">Enter new card details</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 group-hover:text-blue-600" />
                </div>
              </button>
            </div>
          )}

          {/* Show card form when adding new payment method for authenticated users */}
          {showCardForm && (
            <div className="space-y-4">
              {isCreatingIntent ? (
                // Intent Loading Skeleton
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-24"></div>
                  </div>
                  <div className="p-3 border border-gray-300 rounded-lg bg-gray-50">
                    <div className="h-12 bg-gray-200 rounded animate-pulse flex items-center px-3">
                      <div className="flex items-center space-x-2 w-full">
                        <div className="w-6 h-4 bg-gray-300 rounded animate-pulse"></div>
                        <div className="flex-1 h-4 bg-gray-300 rounded animate-pulse"></div>
                        <div className="w-8 h-4 bg-gray-300 rounded animate-pulse"></div>
                      </div>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="inline-flex items-center space-x-2 text-sm text-gray-500">
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-red-600 rounded-full animate-spin"></div>
                      <span>Setting up secure payment form...</span>
                    </div>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <div className="w-5 h-5 text-blue-600">⏳</div>
                      <div>
                        <p className="text-sm text-blue-800 font-medium">Creating secure payment setup...</p>
                        <p className="text-xs text-blue-600">This may take a few moments</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : activeClientSecret && activeIntentType ? (
                <Elements
                  key={`elements-${activeIntentType}-${packageType}-${amount || 0}-${packageName || "default"}`}
                  stripe={stripePromise}
                  options={{
                    clientSecret: activeClientSecret,
                    appearance: {
                      theme: "stripe",
                      variables: {
                        colorPrimary: "#ee0000",
                        colorBackground: "#ffffff",
                        colorText: "#1f2937",
                        colorDanger: "#dc2626",
                        fontFamily: "system-ui, sans-serif",
                        spacingUnit: "4px",
                        borderRadius: "8px",
                      },
                    },
                  }}
                >
                  <StripeCardForm
                    ref={cardFormRef}
                    clientSecret={activeClientSecret}
                    intentType={activeIntentType}
                    onCardElementChange={onCardElementChange}
                    cardError={cardFormError}
                    billingDetails={billingDetails}
                    amount={amount}
                    packageName={packageName}
                  />
                </Elements>
              ) : (
                // Fallback loading state
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-24"></div>
                  </div>
                  <div className="p-3 border border-gray-300 rounded-lg bg-gray-50">
                    <div className="h-12 bg-gray-200 rounded animate-pulse"></div>
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
