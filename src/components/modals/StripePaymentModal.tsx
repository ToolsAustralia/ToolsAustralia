import React, { useState, useRef } from "react";
import { Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useSession } from "next-auth/react";
import { ModalContainer, ModalHeader, ModalContent, Button } from "@/components/modals/ui";
import { useToast } from "@/components/ui/Toast";
import { CreditCard, Loader2, CheckCircle } from "lucide-react";
import PaymentMethodSelector from "./PaymentMethodSelector";
import PaymentProcessingScreen from "@/components/loading/PaymentProcessingScreen";
import { type SavedPaymentMethod } from "@/hooks/useSavedPaymentMethods";
import { getStripePromise } from "@/lib/stripe-client";
import { paymentIntentIdFromClientSecret } from "@/lib/payment/payment-intent-id";
import { resolveBillingAddress, type StripeBillingAddress } from "@/lib/payment/defaultBillingAddress";

const stripePromise = getStripePromise();

/** Upgrade completed server-side with no PaymentIntent to poll */
export const IMMEDIATE_UPGRADE_NO_PI = "IMMEDIATE_UPGRADE_NO_PI";

// Debug: Log Stripe configuration
// console.log("Stripe publishable key:", process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ? "✅ Set" : "❌ Missing");

interface StripePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientSecret: string;
  packageName: string;
  packageId: string;
  amount: number;
  onPaymentSuccess: (paymentIntentId: string) => void;
  // Upgrade info (no proration)
  upgradeInfo?: {
    fromPackage: { name: string; price: number };
    toPackage: { name: string; price: number };
    billingInfo?: {
      currentBillingDate: string;
      nextBillingDate: string;
      nextBillingAmount: number;
      billingDateStays: boolean;
    };
  };
}

interface PaymentFormProps {
  clientSecret: string;
  packageName: string;
  packageId: string;
  amount: number;
  onPaymentSuccess: (paymentIntentId: string) => void;
  onClose: () => void;
  showCardForm: boolean;
  setShowCardForm: (show: boolean) => void;
  selectedPaymentMethod: SavedPaymentMethod | null;
  setSelectedPaymentMethod: (method: SavedPaymentMethod | null) => void;
  stripeBillingAddress: StripeBillingAddress;
  // Upgrade information (no proration)
  upgradeInfo?: {
    fromPackage: { name: string; price: number };
    toPackage: { name: string; price: number };
    billingInfo?: {
      currentBillingDate: string;
      nextBillingDate: string;
      nextBillingAmount: number;
      billingDateStays: boolean;
    };
  };
}

// Component for when Elements is NOT needed (saved payment methods only)
const PaymentFormWithoutElements: React.FC<PaymentFormProps> = ({
  clientSecret,
  packageName,
  packageId,
  amount,
  onPaymentSuccess,
  onClose,
  showCardForm,
  setShowCardForm,
  selectedPaymentMethod,
  setSelectedPaymentMethod,
  stripeBillingAddress: _stripeBillingAddress,
  upgradeInfo, // ✅ NEW: Upgrade information
}) => {
  const { showToast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [stripeInstance, setStripeInstance] = useState<Stripe | null>(null);
  // State for upgrade info - dynamically updated from API response and rendered in payment summary (lines 402-432)
  const [_currentUpgradeInfo, setCurrentUpgradeInfo] = useState(upgradeInfo);

  React.useEffect(() => {
    stripePromise.then((stripe) => setStripeInstance(stripe));
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripeInstance) {
      return;
    }

    setIsProcessing(true);

    try {
      if (selectedPaymentMethod && !showCardForm) {
        let finalClientSecret = "";

        // ✅ FIX: Create upgrade payment when payment is confirmed
        if (clientSecret && clientSecret.length > 0) {
          // console.log("✅ Using existing payment intent from modal opening");
          finalClientSecret = clientSecret;
        } else {
          // ✅ FIX: Create upgrade payment when no existing payment intent
          // console.log("💰 Creating upgrade payment...");
          const response = await fetch("/api/stripe/upgrade-subscription-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              newPackageId: packageId,
              paymentMethodId: selectedPaymentMethod.paymentMethodId,
            }),
          });

          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.error || result.details || "Failed to create upgrade payment");
          }

          // console.log("✅ Upgrade API response:", result);

          // ✅ UPDATE: Set upgrade info from API response
          if (result.data?.upgrade) {
            setCurrentUpgradeInfo({
              fromPackage: result.data.upgrade.fromPackage,
              toPackage: result.data.upgrade.toPackage,
              billingInfo: result.data.upgrade.billingInfo,
            });
          }

          // Check if payment was processed immediately (no PaymentIntent needed)
          if (result.data?.subscription && !result.data?.paymentIntent) {
            setIsProcessing(false);
            onPaymentSuccess(IMMEDIATE_UPGRADE_NO_PI);
            return;
          }

          // Get client secret from API response
          finalClientSecret = result.data?.paymentIntent?.clientSecret;
        }
        if (!finalClientSecret) {
          throw new Error("No payment intent received from server");
        }

        const piFromSecret = paymentIntentIdFromClientSecret(finalClientSecret);
        if (piFromSecret) {
          onPaymentSuccess(piFromSecret);
        }

        // Import client-side return URL utility
        const { getReturnUrlForPaymentTypeClient } = await import("@/utils/payment/stripe/payment-intent-config");
        
        const confirmResult = await stripeInstance.confirmPayment({
          clientSecret: finalClientSecret,
          confirmParams: {
            payment_method: selectedPaymentMethod.paymentMethodId,
            return_url: getReturnUrlForPaymentTypeClient("subscription"),
          },
        });

        // console.log("Payment confirmation result:", confirmResult);

        if (confirmResult.error) {
          console.error("Stripe payment error:", confirmResult.error);
          throw new Error(confirmResult.error.message || "Payment failed");
        }

        const paymentIntent = (confirmResult as { paymentIntent?: { id: string; status: string } }).paymentIntent;

        if (paymentIntent && paymentIntent.status === "succeeded") {
          setIsSuccess(true);
        }
      } else {
        // If user wants to add new card, switch to Elements version
        setShowCardForm(true);
      }
    } catch (err: unknown) {
      console.error("Payment failed:", err);
      const errorMessage = err instanceof Error ? err.message : "Payment could not be processed. Please try again.";
      showToast({
        type: "error",
        title: "Payment Failed",
        message: errorMessage,
        duration: 10000, // Show for 10 seconds for error messages
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-6">
        <CheckCircle className="w-16 h-16 text-green-500 dark:text-green-400 mb-4" />
        <h3 className="text-xl font-semibold text-gray-900 dark:text-neutral-100 mb-2">Payment Successful!</h3>
        <p className="text-gray-600 dark:text-neutral-400 text-center mb-6">
          Your upgrade to {packageName} has been processed. Your new benefits are now active!
        </p>
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 dark:border-green-400"></div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-gray-50 dark:bg-neutral-800/80 dark:border dark:border-neutral-700 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-neutral-200">Upgrading to:</span>
          <span className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{packageName}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 dark:text-neutral-200">Amount:</span>
          <span className="text-lg font-bold text-gray-900 dark:text-neutral-100">${(amount / 100).toFixed(2)} AUD</span>
        </div>
      </div>

      <div className="space-y-4">
        {/* Payment Method Selection */}
        <PaymentMethodSelector
          onPaymentMethodSelect={setSelectedPaymentMethod}
          onAddNewPaymentMethod={() => setShowCardForm(true)}
          selectedPaymentMethod={selectedPaymentMethod}
          isAuthenticated={true}
          showCardForm={showCardForm}
          setupIntentClientSecret={null}
          cardFormRef={{ current: null }}
          onCardElementChange={() => {}}
          cardFormError={null}
          isCreatingSetupIntent={false}
          amount={amount}
          packageName={packageName}
        />
      </div>

      <div className="flex space-x-3 pt-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={isProcessing} className="flex-1">
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!stripeInstance || (!selectedPaymentMethod && !showCardForm) || isProcessing}
          className="flex-1 bg-green-600 hover:bg-green-700"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="w-4 h-4 mr-2" />
              Pay ${(amount / 100).toFixed(2)}
            </>
          )}
        </Button>
      </div>

      <div className="text-xs text-gray-500 text-center">
        Your payment is secured by Stripe. Your card details are never stored on our servers.
      </div>
    </form>
  );
};

// Component for when Elements IS needed (new card form)
const PaymentFormWithElements: React.FC<PaymentFormProps> = ({
  clientSecret,
  packageName,
  packageId,
  amount,
  onPaymentSuccess,
  onClose,
  stripeBillingAddress,
  upgradeInfo, // ✅ NEW: Upgrade information
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const { showToast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [elementsError, setElementsError] = useState<string | null>(null);
  const [currentUpgradeInfo, setCurrentUpgradeInfo] = useState(upgradeInfo); // ✅ State for upgrade info

  // Debug logging and timeout
  React.useEffect(() => {
    // console.log("PaymentFormWithElements - Stripe loaded:", !!stripe);
    // console.log("PaymentFormWithElements - Elements loaded:", !!elements);
    // console.log("PaymentFormWithElements - ClientSecret:", clientSecret);

    // Check if clientSecret is valid (but allow empty for dynamic creation)
    if (clientSecret && !clientSecret.includes("_secret_")) {
      console.error("Invalid clientSecret format:", clientSecret);
      setElementsError("Invalid payment configuration");
    }

    // Set a timeout to show error if Elements doesn't load within 10 seconds
    const timeout = setTimeout(() => {
      if (!stripe || !elements) {
        // console.warn("Elements taking too long to load");
        setElementsError("Payment form is taking longer than expected to load. Please try again.");
      }
    }, 10000);

    return () => clearTimeout(timeout);
  }, [stripe, elements, clientSecret]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      let secretToConfirm = clientSecret;

      // ✅ NEW: Check if payment intent already exists (created when modal opened)
      if (clientSecret && clientSecret.length > 0) {
        // console.log("✅ Using existing payment intent from modal opening (Elements)");
      } else {
        // First, create the upgrade payment (API call)
        // console.log("💰 Creating upgrade payment (Elements)...");
        const response = await fetch("/api/stripe/upgrade-subscription-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ newPackageId: packageId }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || result.details || "Failed to create upgrade payment");
        }

        // console.log("✅ Upgrade API response (Elements):", result);

        // ✅ UPDATE: Set upgrade info from API response
        if (result.data?.upgrade) {
          setCurrentUpgradeInfo({
            fromPackage: result.data.upgrade.fromPackage,
            toPackage: result.data.upgrade.toPackage,
            billingInfo: result.data.upgrade.billingInfo,
          });
        }

        // Check if payment was processed immediately (no PaymentIntent needed)
        if (result.data?.subscription && !result.data?.paymentIntent) {
          setIsProcessing(false);
          onPaymentSuccess(IMMEDIATE_UPGRADE_NO_PI);
          return;
        }

        secretToConfirm = result.data?.paymentIntent?.clientSecret ?? "";
      }

      // Now confirm the payment with the client secret
      if (!secretToConfirm) {
        throw new Error("No payment intent received from server");
      }

      const piFromSecret = paymentIntentIdFromClientSecret(secretToConfirm);
      if (piFromSecret) {
        onPaymentSuccess(piFromSecret);
      }

      // ✅ CRITICAL: PaymentElement requires elements.submit() before confirmPayment()
      // This validates the form and prepares it for confirmation
      const { error: submitError } = await elements.submit();

      if (submitError) {
        throw new Error(submitError.message || "Please complete all required fields.");
      }

      // Update the Elements with the new client secret
      // ✅ CRITICAL: When billingDetails: "never" is set, we must provide complete billing details here
      // Stripe requires all address fields (country, state, city, postal_code, line1) when fields.billingDetails is "never"
      // Import client-side return URL utility
      const { getReturnUrlForPaymentTypeClient } = await import("@/utils/payment/stripe/payment-intent-config");
      
      const confirmResult = await stripe.confirmPayment({
        clientSecret: secretToConfirm,
        confirmParams: {
          payment_method_data: {
            billing_details: {
              address: {
                country: stripeBillingAddress.country,
                state: stripeBillingAddress.state,
                city: stripeBillingAddress.city,
                postal_code: stripeBillingAddress.postal_code,
                line1: stripeBillingAddress.line1,
              },
            },
          },
          return_url: getReturnUrlForPaymentTypeClient("subscription"),
        },
        redirect: "if_required",
      });

      // console.log("Elements payment confirmation result:", confirmResult);

      // For Elements, we need to check the payment intent status
      const paymentIntent = confirmResult.paymentIntent;
      if (paymentIntent && paymentIntent.status === "succeeded") {
        setIsSuccess(true);
      }
    } catch (err: unknown) {
      console.error("Payment failed:", err);
      const errorMessage = err instanceof Error ? err.message : "Payment could not be processed. Please try again.";
      showToast({
        type: "error",
        title: "Payment Failed",
        message: errorMessage,
        duration: 10000, // Show for 10 seconds for error messages
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-6">
        <CheckCircle className="w-16 h-16 text-green-500 dark:text-green-400 mb-4" />
        <h3 className="text-xl font-semibold text-gray-900 dark:text-neutral-100 mb-2">Payment Successful!</h3>
        <p className="text-gray-600 dark:text-neutral-400 text-center mb-6">
          Your upgrade to {packageName} has been processed. Your new benefits are now active!
        </p>
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 dark:border-green-400"></div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ✅ Enhanced Payment Summary with Proration Details */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/25 dark:to-emerald-950/25 rounded-lg p-5 mb-6 border border-green-200 dark:border-green-900/45">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-green-200 dark:border-green-900/40">
          <span className="text-sm font-medium text-gray-700 dark:text-neutral-200">Upgrading to:</span>
          <span className="text-base font-bold text-gray-900 dark:text-neutral-100">{packageName}</span>
        </div>

        {/* Show upgrade summary (no proration) */}
        {currentUpgradeInfo ? (
          <div className="space-y-3">
            {/* Upgrade Breakdown */}
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between text-gray-600 dark:text-neutral-400">
                <span>Current Plan:</span>
                <span className="font-medium">
                  {currentUpgradeInfo.fromPackage.name} (${currentUpgradeInfo.fromPackage.price}/month)
                </span>
              </div>
              <div className="flex items-center justify-between text-gray-600 dark:text-neutral-400">
                <span>New Plan:</span>
                <span className="font-medium text-green-700 dark:text-green-300">
                  {currentUpgradeInfo.toPackage.name} (${currentUpgradeInfo.toPackage.price}/month)
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-green-200 dark:border-green-900/40">
                <span className="font-medium text-gray-700 dark:text-neutral-200">Prorated Charge (Today):</span>
                <span className="text-sm text-gray-700 dark:text-neutral-200">Billing cycle restarts today</span>
              </div>
            </div>

            {/* Billing Info */}
            {currentUpgradeInfo.billingInfo && (
              <div className="bg-white/60 rounded-lg p-3 mt-3 text-xs text-gray-600 dark:text-neutral-400">
                <div className="flex items-center justify-between mb-1">
                  <span>Next Billing Date:</span>
                  <span className="font-medium text-gray-900">{currentUpgradeInfo.billingInfo.nextBillingDate}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Next Billing Amount:</span>
                  <span className="font-medium text-gray-900">
                    ${currentUpgradeInfo.billingInfo.nextBillingAmount}/month
                  </span>
                </div>
                <p className="mt-2 text-gray-500 italic">✓ Your billing date stays the same for consistency</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-neutral-200">Total Amount:</span>
            <span className="text-lg font-bold text-gray-900 dark:text-neutral-100">${(amount / 100).toFixed(2)} AUD</span>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-neutral-400">
          <CreditCard className="w-4 h-4" />
          <span>Enter new card details</span>
        </div>

        <div className="border border-gray-200 dark:border-neutral-700 dark:bg-neutral-900/30 rounded-lg p-4">
          {elementsError ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="text-red-500 mb-2">⚠️ Payment Form Error</div>
                <div className="text-sm text-gray-600 dark:text-neutral-400 mb-4">{elementsError}</div>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : !stripe || !elements ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
              <span className="ml-3 text-gray-600 dark:text-neutral-400">Loading payment form...</span>
            </div>
          ) : (
            <PaymentElement
              options={{
                layout: "tabs",
                wallets: {
                  applePay: "auto",
                },
                paymentMethodOrder: ["card", "apple_pay"],
                fields: {
                  billingDetails: "never", // Hide country, address, and postal code fields
                },
                terms: {
                  card: "never", // Hide the "By providing your card information..." terms text
                  applePay: "never",
                },
              }}
              id="payment-element"
              onLoadError={(error) => {
                console.error("PaymentElement load error:", error);
                setElementsError("Failed to load payment form");
              }}
            />
          )}
        </div>
      </div>

      <div className="flex space-x-3 pt-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={isProcessing} className="flex-1">
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!stripe || !elements || isProcessing}
          className="flex-1 bg-green-600 hover:bg-green-700"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="w-4 h-4 mr-2" />
              Pay ${(amount / 100).toFixed(2)}
            </>
          )}
        </Button>
      </div>

      <div className="text-xs text-gray-500 text-center">
        Your payment is secured by Stripe. Your card details are never stored on our servers.
      </div>
    </form>
  );
};

const StripePaymentModal: React.FC<StripePaymentModalProps> = ({
  isOpen,
  onClose,
  clientSecret,
  packageName,
  packageId,
  amount,
  onPaymentSuccess,
  upgradeInfo, // ✅ NEW: Proration info
}) => {
  const { data: session } = useSession();
  const stripeBillingAddress = resolveBillingAddress(session?.user);
  const activePaymentIntentRef = useRef<string | null>(null);

  const [showCardForm, setShowCardForm] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<SavedPaymentMethod | null>(null);

  // PaymentProcessingScreen states
  const [showPaymentProcessing, setShowPaymentProcessing] = useState(false);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);

  const handlePaymentSuccess = (id: string) => {
    if (id === IMMEDIATE_UPGRADE_NO_PI) {
      activePaymentIntentRef.current = null;
      setShowPaymentProcessing(false);
      setPaymentIntentId(null);
      onPaymentSuccess(id);
      onClose();
      return;
    }
    activePaymentIntentRef.current = id;
    setPaymentIntentId(id);
    setShowPaymentProcessing(true);
  };

  const handleProcessingSuccess = () => {
    const pi = activePaymentIntentRef.current;
    activePaymentIntentRef.current = null;
    setShowPaymentProcessing(false);
    setPaymentIntentId(null);
    onPaymentSuccess(pi || "");
    onClose();
  };

  const handleProcessingError = (error: string) => {
    console.error("Payment processing error:", error);
    activePaymentIntentRef.current = null;
    setShowPaymentProcessing(false);
    setPaymentIntentId(null);
  };

  const handleProcessingTimeout = () => {
    activePaymentIntentRef.current = null;
    setShowPaymentProcessing(false);
    setPaymentIntentId(null);
    onClose();
  };

  // Show PaymentProcessingScreen if payment is being processed
  if (isOpen && showPaymentProcessing && paymentIntentId) {
    return (
      <PaymentProcessingScreen
        paymentIntentId={paymentIntentId}
        packageName={packageName}
        packageType="membership"
        packageId={packageId || undefined}
        isVisible={showPaymentProcessing}
        onSuccess={handleProcessingSuccess}
        onError={handleProcessingError}
        onTimeout={handleProcessingTimeout}
        onStillProcessingDismiss={handleProcessingTimeout}
      />
    );
  }

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="md" closeOnBackdrop={false}>
      <ModalHeader title="Complete Payment" onClose={onClose} showLogo={false} />
      <ModalContent className="max-w-md mx-auto">
        {showCardForm && clientSecret ? (
          <Elements
            key={clientSecret || "no-secret"}
            stripe={stripePromise}
            options={{
              clientSecret,
              locale: "en",
              appearance: {
                theme: "stripe",
                variables: {
                  colorPrimary: "#059669",
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
            <PaymentFormWithElements
              clientSecret={clientSecret}
              packageName={packageName}
              packageId={packageId}
              amount={amount}
              onPaymentSuccess={handlePaymentSuccess}
              onClose={onClose}
              showCardForm={showCardForm}
              setShowCardForm={setShowCardForm}
              selectedPaymentMethod={selectedPaymentMethod}
              setSelectedPaymentMethod={setSelectedPaymentMethod}
              stripeBillingAddress={stripeBillingAddress}
              upgradeInfo={upgradeInfo} // ✅ Pass upgrade info
            />
          </Elements>
        ) : (
          <PaymentFormWithoutElements
            clientSecret={clientSecret}
            packageName={packageName}
            packageId={packageId}
            amount={amount}
            onPaymentSuccess={handlePaymentSuccess}
            onClose={onClose}
            showCardForm={showCardForm}
            setShowCardForm={setShowCardForm}
            selectedPaymentMethod={selectedPaymentMethod}
            setSelectedPaymentMethod={setSelectedPaymentMethod}
            stripeBillingAddress={stripeBillingAddress}
            upgradeInfo={upgradeInfo} // ✅ Pass upgrade info
          />
        )}
      </ModalContent>
    </ModalContainer>
  );
};

export default StripePaymentModal;
