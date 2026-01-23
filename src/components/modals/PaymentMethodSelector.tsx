"use client";

import React, { useState, useEffect } from "react";
import { CreditCard, Plus, ChevronRight } from "lucide-react";
import { useSavedPaymentMethods, type SavedPaymentMethod } from "@/hooks/useSavedPaymentMethods";
import SavedPaymentMethodsModal from "./SavedPaymentMethodsModal";
import { PaymentElement, useStripe, useElements, Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { autoLogStripeError } from "@/utils/error-reporting/auto-log-error";
import { collectErrorContext } from "@/utils/error-reporting/collect-error-context";
import { ErrorLoggingService } from "@/services/error-reporting/ErrorLoggingService";
import { useToast } from "@/components/ui/Toast";
import { ToolLoadingSpinner } from "@/components/ui/ToolLoadingSpinner";
import { categorizeError, isRecoverableError, getRecoveryStrategy } from "@/utils/payment/stripe/payment-error-detection";
import { formatPaymentError } from "@/utils/payment/stripe/payment-error-messages";
import { getStatePreservationInstructions } from "@/utils/payment/stripe/payment-state-preservation";

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
    confirmSetup: () => Promise<{ 
      paymentMethodId?: string; 
      paymentIntentId?: string; 
      error?: string;
      setupIntentAlreadySucceeded?: boolean;
      needsRecovery?: boolean; // NEW: Flag for automatic recovery
      lastSetupError?: {        // NEW: Last error details
        code?: string;
        message?: string;
        decline_code?: string;
      };
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
  isCreatingSubscription?: boolean; // NEW: Loading state for subscription creation API call
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
  // ✅ FIX: Remount key to force Elements remount when clientSecret changes
  elementsRemountKey?: number;
  // ✅ STRIPE BEST PRACTICE: Callback to notify parent when payment method type changes
  onPaymentMethodTypeChange?: (type: "card" | "wallet" | null) => void;
  // ✅ NEW: Callback to trigger purchase flow when wallet payment is clicked
  onWalletPaymentClick?: () => void;
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
    onPaymentMethodTypeChange?: (type: "card" | "wallet" | null) => void; // ✅ STRIPE BEST PRACTICE: Callback for payment method type changes
    onWalletPaymentClick?: () => void; // ✅ NEW: Callback to trigger purchase flow when wallet payment is clicked
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
    onPaymentMethodTypeChange,
    onWalletPaymentClick,
    },
    ref
  ) => {
    const stripe = useStripe();
    const elements = useElements();
    const [isStripeLoading, setIsStripeLoading] = useState(true);
    const [elementsReady, setElementsReady] = useState(false);
    const { showToast } = useToast();
    // ✅ STRIPE BEST PRACTICE: Track selected payment method type to prevent form submit for wallet payments
    const [selectedPaymentMethodType, setSelectedPaymentMethodType] = useState<"card" | "wallet" | null>(null);
    // ✅ STRIPE BEST PRACTICE: Form ref for form-based submission (maintains user activation chain)
    const formRef = React.useRef<HTMLFormElement>(null);
    // Store confirmation result for ref access
    const confirmationResultRef = React.useRef<{
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
    } | null>(null);

    // ✅ CRITICAL FIX: Handle Stripe loading state and wait for Elements session to be ready
    // The Elements session API call (elements/sessions) is made automatically by Stripe.js
    // We need to wait for both stripe and elements to be ready before rendering PaymentElement
    useEffect(() => {
      if (stripe && elements) {
        // ✅ NEW: Wait a brief moment for Elements session to initialize
        // This ensures the internal elements/sessions API call completes
        const initTimeout = setTimeout(() => {
          setIsStripeLoading(false);
          setElementsReady(true);
        }, 100); // Small delay to allow Elements session to initialize

        return () => clearTimeout(initTimeout);
      } else {
        setIsStripeLoading(true);
        setElementsReady(false);
        
        // Check if Stripe failed to load after a timeout
        const timeout = setTimeout(async () => {
          if (!stripe || !elements) {
            // Auto-log Stripe loading failure
            console.error("Stripe Elements failed to load", {
              stripeLoaded: !!stripe,
              elementsLoaded: !!elements,
              clientSecretPrefix: clientSecret ? `${clientSecret.split("_secret_")[0]}...` : "none",
            });
            await autoLogStripeError(new Error("Stripe Elements failed to load"), {
              component: "StripeCardForm",
              stripeLoaded: !!stripe,
              elementsLoaded: !!elements,
            });

            // Show user-friendly error toast with report option
            try {
              const errorContext = await collectErrorContext(
                new Error("Stripe payment form failed to load"),
                {
                  url: window.location.href,
                  method: "GET",
                }
              );

              showToast({
                type: "error",
                title: "Payment Form Error",
                message: "Failed to load payment form. Please refresh the page and try again.",
                reportable: true,
                errorContext,
              });
            } catch (error) {
              // Fallback if context collection fails
              showToast({
                type: "error",
                title: "Payment Form Error",
                message: "Failed to load payment form. Please refresh the page and try again.",
              });
            }
          }
        }, 5000); // 5 second timeout

        return () => clearTimeout(timeout);
      }
    }, [stripe, elements, showToast, clientSecret]);

    // Inject custom CSS for wallet payment method layout (icons and text on same row)
    // Note: Stripe uses shadow DOM, so we inject styles that target the iframe content
    useEffect(() => {
      // Add custom styles for Stripe PaymentElement wallet tabs
      const styleId = "stripe-wallet-layout-fix";
      if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
          /* Fix wallet payment method tabs - ensure icons and text are on same row */
          /* Target Stripe PaymentElement tabs container */
          iframe[data-testid="payment-element"] ~ *,
          [data-testid="payment-element"] {
            /* These styles will be applied to the container */
          }
          /* Use a more aggressive approach - target all potential Stripe containers */
          div[id*="stripe"],
          div[class*="StripeElement"] {
            /* Ensure tab content is flex row */
          }
        `;
        document.head.appendChild(style);
      }

      // Note: Stripe uses shadow DOM and iframes, so direct CSS injection has limitations
      // The appearance.rules configuration above is the primary method for styling
      // Cross-origin restrictions prevent direct iframe styling, so we rely on Stripe's API

      // Cleanup on unmount
      return () => {
        const existingStyle = document.getElementById(styleId);
        if (existingStyle) {
          existingStyle.remove();
        }
      };
    }, []);

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

    // ✅ DEBUG: Log wallet configuration for troubleshooting
    useEffect(() => {
      if (shouldEnableWallets) {
        console.log("✅ Wallet payment configuration:", {
          shouldEnableWallets,
          intentType,
          amount,
          amountInDollars: amount ? `$${(amount / 100).toFixed(2)}` : "N/A",
          packageName,
          hasClientSecret: !!clientSecret,
          paymentRequestConfigured: !!paymentRequestConfig,
          paymentRequestDetails: paymentRequestConfig,
        });
      } else {
        console.log("ℹ️ Wallets disabled:", {
          shouldEnableWallets,
          intentType,
          amount,
          reason: intentType !== "payment" ? "Not a PaymentIntent" : !amount || amount <= 0 ? "Invalid amount" : "Unknown",
        });
      }
    }, [shouldEnableWallets, intentType, amount, packageName, clientSecret, paymentRequestConfig]);

    // Build PaymentElement options object (moved before conditional return to ensure hooks are called consistently)
    // ✅ STRIPE BEST PRACTICE: PaymentElement wallet configuration
    // - Wallets are set to "auto" which allows PaymentElement to automatically handle wallet button clicks
    // - When wallet button is clicked, PaymentElement internally calls confirmPayment() - we don't need to do anything
    // - paymentRequest is included to provide amount/currency info for wallet UIs
    // - This configuration allows wallet buttons to work automatically without manual intervention
    const paymentElementOptions = {
      layout: "tabs" as const,
      // ✅ CRITICAL: Only enable wallets when PaymentIntent is ready with correct amount
      // This prevents $0.00 display in Google Pay/Apple Pay wallet sheets
      wallets: shouldEnableWallets
        ? {
            applePay: "auto" as const, // ✅ PaymentElement automatically handles Apple Pay button clicks
            googlePay: "auto" as const, // ✅ PaymentElement automatically handles Google Pay button clicks
          }
        : undefined, // Disable wallets until PaymentIntent is ready
      paymentMethodOrder: shouldEnableWallets ? ["card", "apple_pay", "google_pay"] : ["card"],
      // ✅ CRITICAL: paymentRequest provides amount/currency for wallet UIs
      // PaymentElement uses this to display correct amount in wallet sheets
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

    // ✅ STRIPE BEST PRACTICE: Core confirmation logic (extracted for reuse in form onSubmit and ref)
    const performConfirmation = async () => {
        if (!stripe || !elements) {
          return { error: "Stripe not loaded" };
        }

        // ✅ STRIPE BEST PRACTICE: Check if wallet payment is selected
        // ALL wallet payments (Google Pay, Apple Pay, Link, etc.) must be initiated by clicking the wallet button directly
        // Calling confirmPayment() from a form submit button breaks the user activation chain
        if (selectedPaymentMethodType === "wallet") {
          return {
            error: "Please click the wallet payment button (Google Pay, Apple Pay, etc.) directly in the payment form to complete your payment. Do not use the main submit button."
          };
        }

        try {
          const billingDetailsData = buildBillingDetails();

          // Handle PaymentIntent (for wallet payments with amount display)
          if (intentType === "payment") {
            // ✅ CRITICAL: Stripe REQUIRES elements.submit() before confirmPayment()
            // However, for wallet payments, submit() may return wallet-specific errors
            // We need to call submit() to maintain user activation chain (called from button click)
            // But proceed with confirmPayment() even if submit() fails with wallet errors
            
            const submitResult = await elements.submit();
            
            // Check if this is a wallet payment error (not a card validation error)
            const isWalletPaymentError = submitResult.error && (
              submitResult.error.code === "google_pay.payment_exception" ||
              submitResult.error.code === "apple_pay.payment_exception" ||
              String(submitResult.error.type || "").toLowerCase().includes("google_pay") ||
              String(submitResult.error.type || "").toLowerCase().includes("apple_pay") ||
              submitResult.error.message?.toLowerCase().includes("google pay") ||
              submitResult.error.message?.toLowerCase().includes("apple pay") ||
              submitResult.error.message?.toLowerCase().includes("wallet") ||
              submitResult.error.message?.toLowerCase().includes("payment_exception") ||
              submitResult.error.message?.toLowerCase().includes("unable to show")
            );

            // Block only if it's a real card validation error (not wallet payment error)
            if (submitResult.error && !isWalletPaymentError) {
              console.error("PaymentElement validation error:", submitResult.error);
              return { error: submitResult.error.message || "Please complete all required fields." };
            }

            // For wallet payment errors, proceed - confirmPayment() will handle wallet payments

            // ✅ STRIPE BEST PRACTICE: Subscriptions use invoice PaymentIntent only
            // No upfront PaymentIntent exists - this is the only PaymentIntent for the subscription payment

            // ✅ CRITICAL: Must call confirmPayment() after submit() (Stripe requirement)
            // For wallet payments, confirmPayment() will handle the wallet UI
            // For card payments, confirmPayment() will process the validated card
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
              
              // ✅ NEW: Auto-log error for monitoring
              ErrorLoggingService.logPaymentError(error, {
                endpoint: "/api/stripe/confirm-payment",
                component: "PaymentMethodSelector",
                flow: "payment-confirmation",
                paymentIntentId: clientSecret?.split("_secret_")[0],
                intentType: "payment",
              }).catch((logError) => {
                console.warn("Failed to auto-log error:", logError);
              });
              
              // ✅ CRITICAL FIX: Handle canceled PaymentIntent error
              if (error.code === "payment_intent_unexpected_state") {
                const errorMessage = error.message || "";
                
                // Check if PaymentIntent was canceled
                if (errorMessage.includes("canceled") || errorMessage.includes("canceled")) {
                  // ✅ STRIPE BEST PRACTICE: Subscriptions use invoice PaymentIntent only
                  // If canceled, return error for automatic recovery
                  return { 
                    error: "PAYMENT_INTENT_CANCELED_RETRY: This payment attempt was canceled. Creating a new payment form..." 
                  };
                }
              }
              
              // ✅ ADD: Better error handling for Google Pay sandbox errors
              const errorCode = error.code || "";
              const errorType = String(error.type || "").toLowerCase();
              const errorMessage = error.message?.toLowerCase() || "";
              
              if (
                errorCode === "google_pay.payment_exception" ||
                errorType.includes("google_pay") ||
                errorMessage.includes("google pay") ||
                errorMessage.includes("notallowederror") ||
                errorMessage.includes("delegation is not allowed without transient user activation") ||
                errorMessage.includes("failed to open window")
              ) {
                return { 
                  error: "Google Pay requires a direct click on the Google Pay button. Please click the Google Pay button directly in the payment form, not the main submit button. If the issue persists, try using a card payment instead." 
                };
              }
              if (
                errorCode === "apple_pay.payment_exception" ||
                errorType.includes("apple_pay") ||
                errorMessage.includes("apple pay")
              ) {
                return { 
                  error: "Apple Pay failed to open. Please try again or use a different payment method. If the issue persists, try using a card payment instead." 
                };
              }
              
              return { error: error.message || "Payment confirmation failed." };
            } else if (paymentIntent?.payment_method) {
              // ✅ STRIPE BEST PRACTICE: Subscriptions use invoice PaymentIntent only
              // No upfront PaymentIntent exists - this PaymentIntent is the one that should be charged
              console.log("✅ PaymentIntent succeeded:", paymentIntent);
              return {
                paymentMethodId: paymentIntent.payment_method as string,
                paymentIntentId: paymentIntent.id,
              };
            } else {
              throw new Error("Unexpected error during payment confirmation.");
            }
          } else {
            // Handle SetupIntent (backward compatibility - card-only, always validate)
            // ✅ RETRY FIX: Check SetupIntent status before confirmation to handle already-succeeded cases
            if (intentType === "setup" && clientSecret) {
              try {
                const response = await fetch("/api/stripe/check-setup-intent-status", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ clientSecret }),
                });

                const result = await response.json();
                if (result.success && result.data) {
                  const statusResult = result.data;

                  // ✅ NEW: Detect SetupIntent with last_setup_error - needs recovery
                  if (statusResult.hasLastSetupError && statusResult.status === "requires_payment_method") {
                    console.log("⚠️ SetupIntent has last_setup_error, needs recovery:", statusResult.lastSetupError);
                    // Return special flag to trigger automatic recovery
                    return {
                      error: "SETUP_INTENT_HAS_ERROR_RETRY: SetupIntent has a previous error. Creating a new one. Please try again.",
                      needsRecovery: true,
                      lastSetupError: statusResult.lastSetupError,
                    };
                  }

                  // If SetupIntent already succeeded, extract payment method and return it
                  if (statusResult.status === "succeeded" && statusResult.paymentMethodId) {
                    console.log("✅ SetupIntent already succeeded, extracting payment method:", statusResult.paymentMethodId);
                    return { paymentMethodId: statusResult.paymentMethodId };
                  }

                  // If SetupIntent is in an unexpected state but has a payment method, try to extract it
                  if (statusResult.setupIntent?.payment_method) {
                    const paymentMethodId =
                      typeof statusResult.setupIntent.payment_method === "string"
                        ? statusResult.setupIntent.payment_method
                        : statusResult.setupIntent.payment_method.id;

                    if (paymentMethodId) {
                      console.log("✅ SetupIntent has payment method, extracting:", paymentMethodId);
                      return { paymentMethodId };
                    }
                  }
                }
              } catch (checkError) {
                console.error("Failed to check SetupIntent status:", checkError);
                // Continue with normal flow if check fails
              }
            }

            const { error: submitError } = await elements.submit();

            if (submitError) {
              console.error("PaymentElement validation error:", submitError);
              return { error: submitError.message || "Please complete all required fields." };
            }

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

              // ✅ NEW: Auto-log error for monitoring
              ErrorLoggingService.logPaymentError(error, {
                endpoint: "/api/stripe/confirm-setup",
                component: "PaymentMethodSelector",
                flow: "setup-intent-confirmation",
                setupIntentId: clientSecret?.split("_secret_")[0],
                intentType: "setup",
              }).catch((logError) => {
                console.warn("Failed to auto-log error:", logError);
              });

              // ✅ EXPERT ERROR HANDLING: Categorize error and handle gracefully
              const errorCategorization = categorizeError(error);
              const isRecoverable = isRecoverableError(error);
              const recoveryStrategy = getRecoveryStrategy(error);
              const statePreservation = getStatePreservationInstructions(error);
              
              // ✅ RETRY FIX: Handle setup_intent_unexpected_state error gracefully
              if (error.code === "setup_intent_unexpected_state") {
                const errorMessage = error.message || "";
                
                // If SetupIntent already succeeded, try to extract payment method
                if (errorMessage.includes("already succeeded") || errorMessage.includes("succeeded")) {
                  console.log("⚠️ SetupIntent already succeeded, attempting to extract payment method...");
                  
                  try {
                    const response = await fetch("/api/stripe/check-setup-intent-status", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ clientSecret }),
                    });

                    const result = await response.json();
                    if (result.success && result.data?.paymentMethodId) {
                      console.log("✅ Extracted payment method from succeeded SetupIntent:", result.data.paymentMethodId);
                      // ✅ Use formatted error message with "Try again" guidance
                      const formattedError = formatPaymentError(error);
                      // Return special flag to indicate SetupIntent was already succeeded
                      // This allows parent component to decide: use existing PM or create new SetupIntent
                      return { 
                        paymentMethodId: result.data.paymentMethodId,
                        setupIntentAlreadySucceeded: true,
                        error: formattedError.message
                      };
                    }
                  } catch (retrieveError) {
                    console.error("Failed to retrieve SetupIntent:", retrieveError);
                  }
                }
              }

              // ✅ Use formatted error message for all errors
              const formattedError = formatPaymentError(error);
              return { 
                error: formattedError.message,
                errorCategory: errorCategorization.category,
                errorType: errorCategorization.errorType,
                isRecoverable,
                recoveryStrategy,
                shouldPreserveState: statePreservation.shouldPreservePaymentMethod,
              };
            } else if (setupIntent?.payment_method) {
              console.log("✅ SetupIntent succeeded:", setupIntent);
              return { paymentMethodId: setupIntent.payment_method as string };
            } else {
              throw new Error("Unexpected error during payment method setup.");
            }
          }
        } catch (err: unknown) {
          console.error("Error in performConfirmation:", err);
          const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
          return { error: errorMessage };
        }
    };

    // ✅ STRIPE BEST PRACTICE: Form onSubmit handler - maintains user activation chain for card payments
    const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      // ✅ CRITICAL: Wallet payments must be initiated ONLY by clicking the wallet button directly
      // Do NOT process wallet payments through form submit - Stripe handles this internally
      // When user clicks wallet button (Google Pay/Apple Pay), Stripe's Payment Element:
      // 1. Creates PaymentMethod
      // 2. Attaches to customer
      // 3. Confirms PaymentIntent internally
      // 4. Backend webhook (invoice.paid or payment_intent.succeeded) handles subscription activation
      // 5. May redirect to return_url if configured (Stripe handles this internally)
      // Our code never calls confirmPayment() for wallet - it's entirely Stripe-driven
      if (selectedPaymentMethodType === "wallet") {
        console.log("⚠️ Wallet payment selected - form submit ignored. User must click wallet button directly.");
        confirmationResultRef.current = {
          error: "Please click the wallet payment button (Google Pay, Apple Pay, etc.) directly in the payment form to complete your payment. Do not use the main submit button."
        };
        return;
      }

      // ✅ STRIPE BEST PRACTICE: Only process card payments through form submit
      // This maintains the user activation chain required by Stripe
      if (!stripe || !elements) {
        const error = "Stripe not loaded. Please refresh and try again.";
        onCardElementChange({ error: { message: error } });
        confirmationResultRef.current = { error };
        return;
      }

      // Perform confirmation for card payments
      const result = await performConfirmation();
      confirmationResultRef.current = result;
      
      if (result.error) {
        onCardElementChange({ error: { message: result.error } });
      } else {
        console.log("✅ Payment confirmed via form submit:", result);
      }
    };

    // Expose confirmSetup function via ref - handles both PaymentIntent and SetupIntent
    // ✅ STRIPE BEST PRACTICE: For backward compatibility, but prefer form submit for card payments
    React.useImperativeHandle(ref, () => ({
      confirmSetup: async () => {
        // ✅ STRIPE BEST PRACTICE: Check if wallet payment is selected
        // ALL wallet payments (Google Pay, Apple Pay, Link, etc.) must be initiated by clicking the wallet button directly
        // Calling confirmPayment() from a form submit button breaks the user activation chain
        if (selectedPaymentMethodType === "wallet") {
          return {
            error: "Please click the wallet payment button (Google Pay, Apple Pay, etc.) directly in the payment form to complete your payment. Do not use the main submit button."
          };
        }

        // ✅ STRIPE BEST PRACTICE: If form exists and we want to maintain user activation chain,
        // we could trigger form.requestSubmit(), but that would require waiting for async result.
        // For backward compatibility with existing code that expects immediate result, call performConfirmation directly.
        // The parent should ideally use form submit (wrapping PaymentElement in form with type="submit" button),
        // but this ref method maintains compatibility.
        return await performConfirmation();
      },
    }));

    // Show skeleton loading while Stripe is loading or Elements session is initializing
    // IMPORTANT: Conditional return must come AFTER all hooks are called
    // ✅ CRITICAL: Wait for Elements session API call to complete before rendering PaymentElement
    if (isStripeLoading || !elementsReady) {
      return (
        <div className="space-y-0">
          <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-0">
            <CreditCard className="w-4 h-4 text-red-600" />
            Payment Details
          </h4>
          <div className="p-3 border border-gray-300 rounded-lg bg-gray-50 mt-0">
            <ToolLoadingSpinner
              message={isStripeLoading ? "Loading payment form..." : "Initializing payment session..."}
              size="md"
              variant="gear"
              className="py-4"
            />
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-0">
        <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-2">
          <CreditCard className="w-4 h-4 text-red-600" />
          Payment Details
        </h4>
        {/* ✅ STRIPE BEST PRACTICE: Wrap Payment Element in form with onSubmit for proper user activation chain */}
        <form
          ref={formRef}
          id="payment-form"
          onSubmit={handleFormSubmit}
          className="mt-0"
        >
          <div className="p-3 border border-gray-300 rounded-lg bg-white">
            <PaymentElement
            key={`payment-element-${clientSecret?.split("_secret_")[0] || "default"}-${amount || 0}-${packageName || "default"}`}
            options={paymentElementOptions}
            onReady={() => {
              // PaymentElement is ready - Elements session API call has completed
              setElementsReady(true);
              
              // ✅ DEBUG: Log wallet button availability for troubleshooting
              if (shouldEnableWallets && elements) {
                console.log("✅ PaymentElement ready with wallet support:", {
                  hasClientSecret: !!clientSecret,
                  intentType,
                  amount,
                  packageName,
                  walletsEnabled: shouldEnableWallets,
                  paymentRequestConfigured: !!paymentRequestConfig,
                });
              }
            }}
            onLoadError={(error) => {
              // ✅ ERROR HANDLING: Elements session API call failed
              console.error("❌ PaymentElement load error - Elements session failed:", error, {
                clientSecretPrefix: clientSecret ? `${clientSecret.split("_secret_")[0]}...` : "none",
                intentType,
              });
              autoLogStripeError(error, {
                component: "StripeCardForm",
                stripeLoaded: !!stripe,
                elementsLoaded: !!elements,
              }).catch(() => {});
              
              showToast({
                type: "error",
                title: "Payment Form Error",
                message: "Failed to initialize payment form. Please refresh and try again.",
              });
            }}
            onChange={(event) => {
              // Handle PaymentElement change events
              // PaymentElement onChange provides completion status
              // Errors are handled separately via onReady callback or element state
              
              // ✅ STRIPE BEST PRACTICE: Detect payment method type to prevent form submit for wallet payments
              const paymentMethodType = event.value?.type;
              
              // ✅ DEBUG: Log payment method type changes for wallet troubleshooting
              if (shouldEnableWallets && paymentMethodType) {
                console.log("🔍 PaymentElement onChange - payment method type:", {
                  type: paymentMethodType,
                  complete: event.complete,
                  isEmpty: event.empty,
                  hasClientSecret: !!clientSecret,
                });
              }
              
              // ✅ Detect ALL wallet payments (Google Pay, Apple Pay, Link, and any other wallet methods)
              // Wallet payment types include: google_pay, apple_pay, link, and potentially others
              const isWalletPayment = 
                paymentMethodType === "google_pay" || 
                paymentMethodType === "apple_pay" || 
                paymentMethodType === "link" ||
                (paymentMethodType && typeof paymentMethodType === "string" && paymentMethodType.includes("pay")); // Catch-all for other wallet methods
              
              if (isWalletPayment) {
                setSelectedPaymentMethodType("wallet");
                onPaymentMethodTypeChange?.("wallet");
                console.log("✅ Wallet payment method selected - Stripe will handle payment automatically");
                // ✅ STRIPE BEST PRACTICE: With wallets: "auto", Stripe handles payment confirmation internally
                // We should NOT programmatically trigger handleSubmit() as it breaks the user activation chain
                // The wallet button click itself initiates the payment flow, and Stripe handles everything
                // The webhook will handle subscription activation after payment succeeds
              } else if (paymentMethodType === "card") {
                setSelectedPaymentMethodType("card");
                onPaymentMethodTypeChange?.("card");
              } else {
                setSelectedPaymentMethodType(null);
                onPaymentMethodTypeChange?.(null);
              }
              
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
        </form>
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
  isCreatingSubscription = false,
  billingDetails,
  amount,
  packageName,
  elementsRemountKey = 0,
  onPaymentMethodTypeChange,
  onWalletPaymentClick,
}) => {
  // Determine which clientSecret to use (PaymentIntent takes priority for wallet payments)
  const activeClientSecret = paymentIntentClientSecret || setupIntentClientSecret;
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
          {isCreatingIntent || (!activeClientSecret && !cardFormError) ? (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-red-600" />
                Card Details
              </h4>
              <div className="p-3 border border-gray-300 rounded-lg bg-white">
                <ToolLoadingSpinner
                  message={isCreatingIntent ? "Setting up payment form..." : "Preparing payment form..."}
                  size="sm"
                  variant="gear"
                  className="py-2"
                />
              </div>
            </div>
          ) : activeClientSecret && activeIntentType ? (
            <Elements
              key={`elements-${activeIntentType}-${packageType}-${activeClientSecret?.split("_secret_")[0] || "default"}-${amount || 0}-${packageName || "default"}-remount${elementsRemountKey}`}
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
                    // Match coupon code input size on mobile
                    fontSizeBase: "14px", // text-sm equivalent
                  },
                  rules: {
                    // Match coupon code input field size on mobile
                    ".Input": {
                      fontSize: "14px", // text-sm
                      padding: "10px", // py-2 equivalent
                    },
                    ".Input--empty": {
                      fontSize: "14px",
                    },
                    ".Input--invalid": {
                      fontSize: "14px",
                    },
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
                onPaymentMethodTypeChange={onPaymentMethodTypeChange}
                onWalletPaymentClick={onWalletPaymentClick}
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
                  type="button"
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
                type="button"
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
              {isCreatingIntent || (!activeClientSecret && !cardFormError) ? (
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
                  key={`elements-${activeIntentType}-${packageType}-${activeClientSecret?.split("_secret_")[0] || "default"}-${amount || 0}-${packageName || "default"}-remount${elementsRemountKey}`}
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
                        // Match coupon code input size on mobile
                        fontSizeBase: "14px", // text-sm equivalent
                      },
                      rules: {
                        // Ensure wallet payment method tabs have icon and text on same row
                        ".Tab": {
                          display: "flex",
                          alignItems: "center",
                          flexDirection: "row",
                          gap: "8px",
                        },
                        ".Tab--selected": {
                          display: "flex",
                          alignItems: "center",
                          flexDirection: "row",
                          gap: "8px",
                        },
                        // Target tab button content
                        "button[role='tab']": {
                          display: "flex",
                          alignItems: "center",
                          flexDirection: "row",
                          gap: "8px",
                        },
                        // Ensure icons are inline
                        ".TabIcon, svg, img": {
                          display: "inline-flex",
                          alignItems: "center",
                          flexShrink: "0",
                          marginRight: "0",
                        },
                        // Ensure payment method labels are inline with icons
                        ".TabLabel, span": {
                          display: "inline-flex",
                          alignItems: "center",
                        },
                        // Match coupon code input field size on mobile
                        ".Input": {
                          fontSize: "14px", // text-sm
                          padding: "10px",
                          minHeight: "auto",
                        },
                        ".Input--empty": {
                          fontSize: "14px",
                        },
                        ".Input--focus": {
                          fontSize: "14px",
                        },
                        ".Input--invalid": {
                          fontSize: "14px",
                        },
                        // Card number, expiration, and CVC inputs
                        "input[data-elements-stable-field-name='cardNumber']": {
                          fontSize: "14px",
                          padding: "8px",
                        },
                        "input[data-elements-stable-field-name='cardExpiry']": {
                          fontSize: "14px",
                          padding: "8px",
                        },
                        "input[data-elements-stable-field-name='cardCvc']": {
                          fontSize: "14px",
                          padding: "8px",
                        },
                        // Input container
                        ".InputElement": {
                          fontSize: "14px",
                          padding: "8px",
                          minHeight: "auto",
                        },
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
                    onPaymentMethodTypeChange={onPaymentMethodTypeChange}
                    onWalletPaymentClick={onWalletPaymentClick}
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
