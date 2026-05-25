"use client";

/**
 * CardFormSection — Stripe `<PaymentElement>` wrapper used inside the
 * `<Elements>` provider. Exposes `confirmStripeIntent` via `forwardRef` so the
 * orchestrator (and ultimately MembershipModal) can trigger confirmation from
 * the parent's submit click.
 *
 * INVARIANTS:
 * 1. The `<PaymentElement>` `key` is preserved verbatim from the original flat
 *    file. Changing the key forces a remount when the SetupIntent / amount /
 *    package label changes.
 * 2. All hooks are called BEFORE the `isStripeLoading` early return so React's
 *    rules-of-hooks invariant holds across the loading / loaded transition.
 * 3. The `useImperativeHandle` ref shape is a SUPERSET of every consumer's ref
 *    type. Do not narrow without auditing MembershipModal + StripePaymentModal.
 */

import React, { useState, useEffect, useRef } from "react";
import { PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { autoLogStripeError } from "@/utils/error-reporting/auto-log-error";
import { collectErrorContext } from "@/utils/error-reporting/collect-error-context";
import { useToast } from "@/components/ui/Toast";
import { categorizeError, isRecoverableError, getRecoveryStrategy } from "@/utils/payment/stripe/payment-error-detection";
import { formatPaymentError } from "@/utils/payment/stripe/payment-error-messages";
import { getStatePreservationInstructions } from "@/utils/payment/stripe/payment-state-preservation";
import { getReturnUrlForPaymentTypeClient } from "@/utils/payment/stripe/payment-intent-config";
import { usePixelTracking } from "@/hooks/usePixelTracking";
import type { MirrorUserData } from "@/utils/tracking/meta-capi-mirror";
import { paymentNotReadyReason } from "./paymentReadiness";

export interface CardFormSectionRef {
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
}

export interface CardFormSectionProps {
  clientSecret: string;
  intentType: "setup" | "payment";
  onCardElementChange: (event: { error?: { message?: string } }) => void;
  cardError: string | null;
  billingDetails?: {
    name?: string;
    email?: string;
    phone?: string;
    country?: string;
    state?: string;
    city?: string;
    postalCode?: string;
    line1?: string;
  };
  amount?: number;
  packageName?: string;
  onPaymentMethodTypeChange?: (type: string | null) => void;
  /** Fired with the PaymentElement's `ready` state so parents can gate submit. */
  onElementReady?: (ready: boolean) => void;
}

const CardFormSection = React.forwardRef<CardFormSectionRef, CardFormSectionProps>(
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
      onElementReady,
    },
    ref
  ) => {
    const stripe = useStripe();
    const elements = useElements();
    // Ref (not state) holds PaymentElement readiness: nothing here re-renders on
    // it; the imperative confirmStripeIntent() reads the live value and the parent
    // is notified via onElementReady so MembershipModal can gate the button.
    const isElementReadyRef = React.useRef(false);
    const [isStripeLoading, setIsStripeLoading] = useState(true);
    const { showToast } = useToast();
    const { trackAddPaymentInfo } = usePixelTracking();
    // Tracks whether AddPaymentInfo has fired for this PaymentElement mount.
    // Re-mounts (new clientSecret / amount / packageName key) reset this naturally.
    const addPaymentInfoFiredRef = useRef(false);

    // Handle Stripe loading state and validate StripeElements
    useEffect(() => {
      if (stripe && elements) {
        setIsStripeLoading(false);
      } else {
        // Check if Stripe failed to load after a timeout
        const timeout = setTimeout(async () => {
          if (!stripe || !elements) {
            // Auto-log Stripe loading failure
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
            } catch {
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
    }, [stripe, elements, showToast]);

    // Reset readiness on unmount so a remount (via the <Elements>/PaymentElement
    // `key` change) starts un-ready and the parent re-gates the Purchase button.
    React.useEffect(() => {
      return () => {
        isElementReadyRef.current = false;
        onElementReady?.(false);
      };
    }, [onElementReady]);

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
      paymentMethodOrder: shouldEnableWallets ? ["card", "apple_pay", "google_pay"] : ["card"],
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

    // Expose confirmStripeIntent via ref – handles PaymentIntent (subscription) and SetupIntent (one-time)
    React.useImperativeHandle(ref, () => ({
      confirmStripeIntent: async () => {
        const notReady = paymentNotReadyReason({ stripe, elements, isElementReady: isElementReadyRef.current });
        if (notReady) {
          return { error: notReady };
        }
        // notReady already guarantees stripe/elements are non-null; this explicit
        // guard restores the control-flow narrowing TypeScript needs below.
        if (!stripe || !elements) {
          return { error: "Stripe not loaded" };
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

            // For wallet payment errors, log but proceed - confirmPayment() will handle wallet payments
            if (isWalletPaymentError) {
              console.log("⚠️ Wallet payment error during submit (expected for wallet payments), proceeding with confirmPayment:", submitResult.error);
            }

            // ✅ STRIPE BEST PRACTICE: Subscriptions use invoice PaymentIntent only
            // No upfront PaymentIntent exists - this is the only PaymentIntent for the subscription payment
            console.log("🔍 Confirming PaymentIntent:", {
              clientSecretPrefix: clientSecret?.split("_secret_")[0],
              intentType,
            });

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
                return_url: getReturnUrlForPaymentTypeClient("subscription"),
              },
              redirect: "if_required",
            });

            if (error) {
              console.error("Stripe PaymentIntent error:", error);
              // Intentionally no auto-log here. The parent (MembershipModal's
              // `handlePaymentError`) already logs with full user identity
              // (userEmail / guestEmail / userId). Logging at this layer too
              // creates Anonymous duplicate rows because props don't carry
              // identity down to PaymentMethodSelector.

              // ✅ CRITICAL FIX: Handle canceled PaymentIntent error
              // Check both error code and PaymentIntent status for comprehensive detection
              const isCanceledPaymentIntent =
                (error.code === "payment_intent_unexpected_state" &&
                 (error.message?.includes("canceled") || error.message?.includes("canceled"))) ||
                error.payment_intent?.status === "canceled";

              if (isCanceledPaymentIntent) {
                // ✅ STRIPE BEST PRACTICE: Subscriptions use invoice PaymentIntent only
                // If canceled, return error for automatic recovery
                return {
                  error: "PAYMENT_INTENT_CANCELED_RETRY: This payment attempt was canceled. Creating a new payment form..."
                };
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

                  // ✅ STRIPE BEST PRACTICE: Only trigger recovery for canceled SetupIntent (terminal state)
                  // SetupIntent with requires_payment_method + last_setup_error is still valid and can be reused
                  if (statusResult.status === "canceled") {
                    console.log("⚠️ SetupIntent was canceled, needs recovery");
                    // Return special flag to trigger automatic recovery
                    return {
                      error: "SETUP_INTENT_CANCELED_RETRY: SetupIntent was canceled. Creating a new one. Please try again.",
                      needsRecovery: true,
                    };
                  }

                  // If SetupIntent already succeeded, signal that a new SetupIntent is needed for new card
                  // ✅ CRITICAL: A succeeded SetupIntent cannot be reused - user needs new SetupIntent for new card
                  if (statusResult.status === "succeeded" && statusResult.paymentMethodId) {
                    console.log("⚠️ SetupIntent already succeeded with payment method:", statusResult.paymentMethodId);
                    console.log("⚠️ User entered new card - new SetupIntent required");
                    // Return flag to trigger new SetupIntent creation
                    return {
                      setupIntentAlreadySucceeded: true,
                      paymentMethodId: statusResult.paymentMethodId, // Keep old for reference, but new one will be created
                    };
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
              // Intentionally no auto-log — see notes on the matching
              // confirmPayment branch above. Parent handler owns logging.

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
              // Note: Card decline errors are handled normally - SetupIntent can be reused with new payment method
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
          console.error("Error in confirmStripeIntent:", err);
          const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
          return { error: errorMessage };
        }
      },
    }));

    // Show skeleton loading while Stripe is loading
    // IMPORTANT: Conditional return must come AFTER all hooks are called
    if (isStripeLoading) {
      return (
        <div className="space-y-0">
          <div className="p-3 border border-gray-300 dark:border-neutral-600 rounded-lg bg-gray-50 dark:bg-neutral-950 mt-0">
            {/* Payment method tabs skeleton */}
            <div className="flex gap-2 mb-4">
              <div className="h-10 bg-gray-200 dark:bg-neutral-800 rounded animate-pulse flex-1"></div>
              {shouldEnableWallets && (
                <>
                  <div className="h-10 bg-gray-200 dark:bg-neutral-800 rounded animate-pulse w-24"></div>
                  <div className="h-10 bg-gray-200 dark:bg-neutral-800 rounded animate-pulse w-24"></div>
                </>
              )}
            </div>
            {/* Card Element Skeleton */}
            <div className="space-y-3">
              <div className="h-12 bg-gray-200 dark:bg-neutral-800 rounded animate-pulse"></div>
              <div className="flex gap-3">
                <div className="flex-1 h-12 bg-gray-200 dark:bg-neutral-800 rounded animate-pulse"></div>
                <div className="w-20 h-12 bg-gray-200 dark:bg-neutral-800 rounded animate-pulse"></div>
              </div>
            </div>
          </div>
          <div className="text-center">
            <div className="inline-flex items-center space-x-2 text-sm text-gray-500 dark:text-neutral-400">
              <div className="w-4 h-4 border-2 border-gray-300 dark:border-neutral-600 border-t-red-600 rounded-full animate-spin"></div>
              <span>Loading payment form...</span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-0">
        <div className="p-3 border border-gray-300 dark:border-neutral-600 rounded-lg bg-[#ffffff] dark:bg-neutral-950 mt-0">
          <PaymentElement
            key={`payment-element-${clientSecret?.split("_secret_")[0] || "default"}-${amount || 0}-${packageName || "default"}`}
            options={paymentElementOptions}
            onReady={() => {
              isElementReadyRef.current = true;
              onElementReady?.(true);
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
              // Option A (wallet UX): notify parent of selected payment method type so main Purchase can be hidden for wallets
              const value = (event as { value?: { payment_method?: { type?: string } | string } }).value;
              const pm = value?.payment_method;
              const type =
                pm == null ? null : typeof pm === "string" ? pm : (pm as { type?: string }).type ?? null;
              onPaymentMethodTypeChange?.(type ?? null);

              // When the user has entered valid card details, fire AddPaymentInfo once.
              // Meta uses this event as a high-intent signal for ad optimization.
              // PaymentMethodSelector receives `amount` (cents) and `packageName` but no
              // packageId; we derive packageType from intentType + amount (matches the
              // outer component's derivation). The ref guard keeps React Strict Mode
              // double-mounts from double-counting.
              if (event.complete && !addPaymentInfoFiredRef.current) {
                addPaymentInfoFiredRef.current = true;
                const derivedPackageType =
                  intentType === "payment" && typeof amount === "number" && amount > 0
                    ? "one-time"
                    : "membership";

                // Identity from the billing details the shopper just entered; empty
                // fields are stripped downstream (stripEmpty in the mirror).
                const [bdFirst, ...bdRest] = (billingDetails?.name ?? "").trim().split(/\s+/);
                const apiUserData: MirrorUserData = {
                  email: billingDetails?.email,
                  phone: billingDetails?.phone,
                  firstName: bdFirst || undefined,
                  lastName: bdRest.length ? bdRest.join(" ") : undefined,
                  city: billingDetails?.city,
                  state: billingDetails?.state,
                  zipCode: billingDetails?.postalCode,
                  country: billingDetails?.country,
                };

                // Dual Pixel + CAPI via a shared event_id (fireFunnelEvent), so
                // AddPaymentInfo gains an EMQ score and dedup coverage.
                trackAddPaymentInfo(
                  {
                    value: typeof amount === "number" ? amount / 100 : undefined,
                    currency: typeof amount === "number" ? "AUD" : undefined,
                    numItems: 1,
                    packageType: derivedPackageType,
                  },
                  undefined,
                  apiUserData,
                );
              }
            }}
          />
        </div>
        {cardError && <p className="text-red-600 dark:text-red-400 text-sm mt-2">{cardError}</p>}
      </div>
    );
  }
);

CardFormSection.displayName = "CardFormSection";

export default CardFormSection;
