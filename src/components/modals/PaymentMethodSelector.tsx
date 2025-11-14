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
  setupIntentClientSecret?: string | null;
  cardFormRef: React.Ref<{ confirmSetup: () => Promise<{ paymentMethodId?: string; error?: string }> } | null>;
  onCardElementChange: (event: { error?: { message?: string } }) => void;
  cardFormError: string | null;
  isCreatingSetupIntent?: boolean;
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
}

// Stripe Card Form Component - Now a ref-based component without buttons
const StripeCardForm = React.forwardRef<
  { confirmSetup: () => Promise<{ paymentMethodId?: string; error?: string }> },
  {
    clientSecret: string;
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
  }
>(({ clientSecret, onCardElementChange, cardError, billingDetails }, ref) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isStripeLoading, setIsStripeLoading] = useState(true);

  // Handle Stripe loading state
  useEffect(() => {
    if (stripe && elements) {
      setIsStripeLoading(false);
    }
  }, [stripe, elements]);

  // Expose confirmSetup function via ref
  React.useImperativeHandle(ref, () => ({
    confirmSetup: async () => {
      if (!stripe || !elements) {
        return { error: "Stripe not loaded" };
      }

      try {
        // ✅ CRITICAL: PaymentElement requires elements.submit() before confirmSetup()
        // This validates the form and prepares it for confirmation
        const { error: submitError } = await elements.submit();

        if (submitError) {
          console.error("PaymentElement validation error:", submitError);
          return { error: submitError.message || "Please complete all required fields." };
        }

        // Now confirm the setup after successful submission
        // ✅ CRITICAL: When billingDetails: "never" is set, we must provide billing details here
        // Stripe requires billing_details.name and complete address fields (country, state, city, postal_code, line1)
        const { setupIntent, error } = await stripe.confirmSetup({
          elements,
          clientSecret,
          confirmParams: {
            payment_method_data: {
              billing_details: billingDetails?.name
                ? {
                    name: billingDetails.name,
                    email: billingDetails.email,
                    phone: billingDetails.phone,
                    address: {
                      country: billingDetails.country || "AU", // ✅ Required by Stripe, default to Australia
                      state: billingDetails.state || "NSW", // ✅ Required by Stripe, default to New South Wales
                      city: billingDetails.city || "Sydney", // ✅ Required by Stripe, default to Sydney
                      postal_code: billingDetails.postalCode || "2000", // ✅ Required by Stripe, default to Sydney CBD
                      line1: billingDetails.line1 || "1 Martin Place", // ✅ Required by Stripe, default address
                    },
                  }
                : {
                    // Fallback: provide minimal required name and complete address fields if not provided
                    name: billingDetails?.email || "Customer",
                    address: {
                      country: billingDetails?.country || "AU", // ✅ Default to Australia
                      state: billingDetails?.state || "NSW", // ✅ Default to New South Wales
                      city: billingDetails?.city || "Sydney", // ✅ Default to Sydney
                      postal_code: billingDetails?.postalCode || "2000", // ✅ Default to Sydney CBD
                      line1: billingDetails?.line1 || "1 Martin Place", // ✅ Default address
                    },
                  },
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
      } catch (err: unknown) {
        console.error("Error in confirmSetup:", err);
        const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
        return { error: errorMessage };
      }
    },
  }));

  // Show skeleton loading while Stripe is loading
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
          options={{
            layout: "tabs",
            wallets: {
              applePay: "auto",
            },
            paymentMethodOrder: ["apple_pay", "card"],
            fields: {
              billingDetails: "never", // Hide country, address, and postal code fields
            },
            terms: {
              card: "never", // Hide the "By providing your card information..." terms text
            },
          }}
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
});

StripeCardForm.displayName = "StripeCardForm";

const PaymentMethodSelector: React.FC<PaymentMethodSelectorProps> = ({
  onPaymentMethodSelect,
  onAddNewPaymentMethod,
  selectedPaymentMethod,
  className = "",
  isAuthenticated = false,
  showCardForm = false,
  setupIntentClientSecret = null,
  cardFormRef,
  onCardElementChange,
  cardFormError,
  isCreatingSetupIntent = false,
  billingDetails,
}) => {
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
          {isCreatingSetupIntent ? (
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
          ) : setupIntentClientSecret ? (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: setupIntentClientSecret,
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
                clientSecret={setupIntentClientSecret}
                onCardElementChange={onCardElementChange}
                cardError={cardFormError}
                billingDetails={billingDetails}
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
              {isCreatingSetupIntent ? (
                // Setup Intent Loading Skeleton
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
              ) : setupIntentClientSecret ? (
                <Elements
                  stripe={stripePromise}
                  options={{
                    clientSecret: setupIntentClientSecret,
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
                    clientSecret={setupIntentClientSecret}
                    onCardElementChange={onCardElementChange}
                    cardError={cardFormError}
                    billingDetails={billingDetails}
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
