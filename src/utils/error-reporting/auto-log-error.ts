/**
 * Automatic Error Logging Utility
 * 
 * Automatically logs critical errors to the database without requiring user interaction.
 * This is especially important for payment-related errors that directly impact revenue.
 * 
 * Use Cases:
 * - Payment failures (card declined, insufficient funds, Stripe API errors)
 * - Critical system errors (StripeElements loading failures)
 * - Errors that users might not report but need tracking
 * 
 * This complements the manual "Report Problem" feature by ensuring critical errors
 * are always captured, even if users don't click the button.
 */

import { ErrorContext } from "@/types/error-reporting";
import { collectErrorContext } from "./collect-error-context";

/**
 * Automatically log an error to the database
 * This bypasses user interaction and directly creates an error report
 * 
 * @param error - The error that occurred
 * @param additionalContext - Additional context specific to this error
 * @param options - Options for automatic logging
 */
export async function autoLogError(
  error: unknown,
  additionalContext?: {
    category?: "payment" | "stripe" | "system" | "api" | "network" | "recovery";
    severity?: "critical" | "high" | "medium";
    paymentIntentId?: string;
    customerId?: string;
    amount?: number;
    packageId?: string;
    packageName?: string;
    userEmail?: string; // NEW: User email (authenticated or guest)
    guestEmail?: string; // NEW: Guest user email (for non-authenticated users)
    [key: string]: unknown;
  },
  options?: {
    skipRateLimit?: boolean; // Skip rate limiting for critical errors
    skipDeduplication?: boolean; // Skip deduplication for unique errors
  }
): Promise<void> {
  try {
    // Collect error context
    // ✅ ENHANCED: Pass guest email to context collection
    const errorContext = await collectErrorContext(error, {
      url: additionalContext?.apiEndpoint as string | undefined,
      method: additionalContext?.httpMethod as string | undefined,
      status: additionalContext?.httpStatus as number | undefined,
      guestEmail: additionalContext?.guestEmail, // ✅ NEW: Pass guest email
    });

    // ✅ ENHANCED: Handle user email prioritization
    // If userEmail is provided in additionalContext, use it (overrides context collection)
    // Otherwise, use guestEmail from context if available
    const finalUserEmail = additionalContext?.userEmail || errorContext.userEmail || errorContext.guestEmail;
    const finalGuestEmail = !errorContext.isAuthenticated ? (additionalContext?.guestEmail || errorContext.guestEmail) : undefined;

    // Enhance error context with additional information
    const enhancedContext: ErrorContext = {
      ...errorContext,
      // ✅ ENHANCED: Update user email fields
      userEmail: finalUserEmail,
      guestEmail: finalGuestEmail,
      // Add payment-specific context if available
      ...(additionalContext?.paymentIntentId && {
        errorMessage: `${errorContext.errorMessage} [PaymentIntent: ${additionalContext.paymentIntentId}]`,
      }),
      // Add category to error name
      errorName: additionalContext?.category
        ? `${additionalContext.category.toUpperCase()}_ERROR`
        : errorContext.errorName,
    };

    // Build request payload
    const payload: {
      errorContext: ErrorContext;
      userNotes?: string;
      autoLogged?: boolean;
      category?: string;
      severity?: string;
      skipRateLimit?: boolean;
      skipDeduplication?: boolean;
    } = {
      errorContext: enhancedContext,
      autoLogged: true, // Mark as automatically logged
      category: additionalContext?.category,
      severity: additionalContext?.severity || "high",
      ...(options?.skipRateLimit && { skipRateLimit: true }),
      ...(options?.skipDeduplication && { skipDeduplication: true }),
    };

    // Add user notes with payment context if available
    if (additionalContext) {
      const notes: string[] = [];
      if (additionalContext.paymentIntentId) {
        notes.push(`PaymentIntent ID: ${additionalContext.paymentIntentId}`);
      }
      if (additionalContext.customerId) {
        notes.push(`Customer ID: ${additionalContext.customerId}`);
      }
      if (additionalContext.amount) {
        notes.push(`Amount: $${(additionalContext.amount / 100).toFixed(2)}`);
      }
      if (additionalContext.packageId) {
        notes.push(`Package ID: ${additionalContext.packageId}`);
      }
      if (additionalContext.packageName) {
        notes.push(`Package: ${additionalContext.packageName}`);
      }
      if (notes.length > 0) {
        payload.userNotes = `[Auto-logged] ${notes.join(", ")}`;
      }
    }

    // Submit error report (fire and forget - don't block user flow)
    fetch("/api/error-reports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }).catch((fetchError) => {
      // Silently fail if auto-logging fails - don't disrupt user experience
      console.warn("Failed to auto-log error:", fetchError);
    });
  } catch (loggingError) {
    // Silently fail if error logging fails - don't disrupt user experience
    console.warn("Failed to auto-log error:", loggingError);
  }
}

/**
 * Auto-log payment-related errors
 * Convenience function specifically for payment errors
 */
export async function autoLogPaymentError(
  error: unknown,
  paymentDetails: {
    paymentIntentId?: string;
    customerId?: string;
    amount?: number;
    packageId?: string;
    packageName?: string;
    userEmail?: string; // NEW: User email (authenticated or guest)
    guestEmail?: string; // NEW: Guest user email
    errorCode?: string;
    declineCode?: string;
    errorMessage?: string;
  }
): Promise<void> {
  // Build user-friendly error message
  let errorMessage = "Payment failed";
  if (paymentDetails.errorMessage) {
    errorMessage = paymentDetails.errorMessage;
  } else if (paymentDetails.errorCode) {
    // Map common Stripe error codes to user-friendly messages
    const errorCodeMessages: Record<string, string> = {
      card_declined: "Your card was declined",
      insufficient_funds: "Insufficient funds",
      expired_card: "Your card has expired",
      incorrect_cvc: "Your card's security code is incorrect",
      processing_error: "An error occurred while processing your card",
      generic_decline: "Your card was declined",
    };

    const declineCodeMessages: Record<string, string> = {
      insufficient_funds: "Insufficient funds in your account",
      lost_card: "Your card was reported as lost",
      stolen_card: "Your card was reported as stolen",
      pickup_card: "Your card was declined - please contact your bank",
      restricted_card: "Your card has restrictions that prevent this payment",
      security_violation: "Your card was declined due to security reasons",
      service_not_allowed: "Your card does not support this type of purchase",
      stop_payment_order: "A stop payment order has been placed on this card",
      testmode_decline: "Your card was declined (test mode)",
      withdrawal_count_limit_exceeded: "You have exceeded the withdrawal limit for your account",
    };

    errorMessage =
      declineCodeMessages[paymentDetails.declineCode || ""] ||
      errorCodeMessages[paymentDetails.errorCode] ||
      `Payment failed: ${paymentDetails.errorCode}`;
  }

  // Create enhanced error with payment context
  const enhancedError = error instanceof Error ? error : new Error(errorMessage);
  if (error instanceof Error) {
    enhancedError.message = errorMessage;
    enhancedError.stack = error.stack;
  }

  await autoLogError(enhancedError, {
    category: "payment",
    severity: "critical",
    paymentIntentId: paymentDetails.paymentIntentId,
    customerId: paymentDetails.customerId,
    amount: paymentDetails.amount,
    packageId: paymentDetails.packageId,
    packageName: paymentDetails.packageName,
    userEmail: paymentDetails.userEmail, // ✅ NEW: Pass user email
    guestEmail: paymentDetails.guestEmail, // ✅ NEW: Pass guest email
    errorCode: paymentDetails.errorCode,
    declineCode: paymentDetails.declineCode,
  });
}

/**
 * Auto-log Stripe Elements loading errors
 */
export async function autoLogStripeError(
  error: unknown,
  context?: {
    component?: string;
    stripeLoaded?: boolean;
    elementsLoaded?: boolean;
  }
): Promise<void> {
  let errorMessage = "Stripe payment form failed to load";
  if (error instanceof Error) {
    errorMessage = error.message;
  }

  const enhancedError = new Error(errorMessage);
  if (error instanceof Error) {
    enhancedError.stack = error.stack;
  }

  await autoLogError(enhancedError, {
    category: "stripe",
    severity: "critical",
    component: context?.component,
    stripeLoaded: context?.stripeLoaded,
    elementsLoaded: context?.elementsLoaded,
  });
}

