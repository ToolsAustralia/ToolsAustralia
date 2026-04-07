/**
 * Payment Error Messages Utility
 * 
 * Centralized error message formatting for ALL payment errors.
 * Ensures consistent, user-friendly messaging with actionable guidance.
 */

import { categorizeError } from "./payment-error-detection";

/**
 * Format payment error message with user-friendly language and actionable guidance
 * Always includes "Try again" or specific instructions
 */
export function formatPaymentError(error: unknown): {
  title: string;
  message: string;
  shouldIncludeTryAgain: boolean;
} {
  const { errorType } = categorizeError(error);
  
  // Extract original error message for context
  let originalMessage = "";
  if (error instanceof Error) {
    originalMessage = error.message;
  } else if (typeof error === "object" && error !== null) {
    const err = error as Record<string, unknown>;
    if (err.response && typeof err.response === "object") {
      const response = err.response as Record<string, unknown>;
      if (response.data && typeof response.data === "object") {
        const data = response.data as Record<string, unknown>;
        if (typeof data.error === "string") originalMessage = data.error;
        else if (typeof data.details === "string") originalMessage = data.details;
        else if (typeof data.message === "string") originalMessage = data.message;
      }
    } else if (typeof err.error === "string") {
      originalMessage = err.error;
    } else if (typeof err.message === "string") {
      originalMessage = err.message;
    }
  } else if (typeof error === "string") {
    originalMessage = error;
  }
  
  const lowerMessage = originalMessage.toLowerCase();
  
  // Handle specific error types with user-friendly messages
  switch (errorType) {
    case "setup_intent_unexpected_state":
      // ✅ NEW: Handle SetupIntent with last_setup_error (from status check)
      if (lowerMessage.includes("setup_intent_has_error_retry") || 
          lowerMessage.includes("has a previous error") ||
          lowerMessage.includes("creating a new one")) {
        return {
          title: "Payment Setup Error",
          message: "The payment form has a previous error. We're creating a new form for you. Please try again with your correct card details.",
          shouldIncludeTryAgain: true,
        };
      }
      if (lowerMessage.includes("already succeeded") || lowerMessage.includes("succeeded")) {
        return {
          title: "Payment Setup Already Completed",
          message: "This payment method setup was already completed. Creating a new one. Please try again.",
          shouldIncludeTryAgain: true,
        };
      }
      return {
        title: "Payment Setup Error",
        message: "Payment method setup is in an unexpected state. Please try again.",
        shouldIncludeTryAgain: true,
      };
    
    case "payment_intent_unexpected_state":
      if (lowerMessage.includes("already succeeded") || lowerMessage.includes("succeeded")) {
        return {
          title: "Payment Already Completed",
          message: "This payment was already completed. Please try again.",
          shouldIncludeTryAgain: true,
        };
      }
      return {
        title: "Payment Error",
        message: "Payment is in an unexpected state. Please try again.",
        shouldIncludeTryAgain: true,
      };
    
    case "payment_failed":
      return {
        title: "Payment Failed",
        message: "Payment failed. Please check your card details and try again.",
        shouldIncludeTryAgain: true,
      };
    
    case "payment_processing_error":
      return {
        title: "Payment Processing Error",
        message: "A payment processing error occurred. Please try again.",
        shouldIncludeTryAgain: true,
      };
    
    case "card_declined":
      return {
        title: "Card Declined",
        message: "Your card was declined. Please check your card details or try a different payment method.",
        shouldIncludeTryAgain: true,
      };

    case "stripe_excessive_retry":
      return {
        title: "Card Temporarily Blocked",
        message:
          "This card was declined too many times, so the card network is blocking further attempts for a while. Please use a different card or payment method. Retrying the same card usually will not work until the block clears. More detail: https://support.stripe.com/questions/payment-blocked-due-to-excessive-retries",
        shouldIncludeTryAgain: false,
      };

    case "insufficient_funds":
      return {
        title: "Insufficient Funds",
        message: "Insufficient funds. Please ensure you have sufficient balance and try again.",
        shouldIncludeTryAgain: true,
      };
    
    case "network_error":
      return {
        title: "Connection Error",
        message: "Connection error. Please check your internet and try again.",
        shouldIncludeTryAgain: true,
      };
    
    case "unknown":
    default:
      // For unknown errors, use original message if available, otherwise generic
      if (originalMessage && originalMessage.trim()) {
        // Ensure original message includes "Try again" if not already present
        const hasTryAgain = 
          lowerMessage.includes("try again") ||
          lowerMessage.includes("please try") ||
          lowerMessage.includes("retry");
        
        return {
          title: "Payment Error",
          message: hasTryAgain 
            ? originalMessage 
            : `${originalMessage} Please try again.`,
          shouldIncludeTryAgain: !hasTryAgain,
        };
      }
      
      return {
        title: "Payment Error",
        message: "An unexpected error occurred. Please try again.",
        shouldIncludeTryAgain: true,
      };
  }
}

/**
 * Get error title only
 */
export function getPaymentErrorTitle(error: unknown): string {
  return formatPaymentError(error).title;
}

/**
 * Get error message only
 */
export function getPaymentErrorMessage(error: unknown): string {
  return formatPaymentError(error).message;
}
