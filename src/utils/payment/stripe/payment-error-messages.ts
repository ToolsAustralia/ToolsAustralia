/**
 * Payment Error Messages Utility
 * 
 * Centralized error message formatting for ALL payment errors.
 * Ensures consistent, user-friendly messaging with actionable guidance.
 */

import { categorizeError, extractPaymentErrorCodes } from "./payment-error-detection";

/**
 * Stripe decline_code / card error code → short, direct user guidance.
 *
 * Keep every message to 1–2 short sentences with ONE clear next step — the
 * user is mid-checkout, not reading a manual. Codes are the same vocabulary
 * as the admin catalog in src/utils/billing/declineCodeLabels.ts.
 *
 * Sensitive codes (lost_card, stolen_card, pickup_card, fraudulent) are
 * deliberately NOT mapped — per Stripe guidance, never reveal the real
 * reason; they fall through to the generic decline message.
 */
const DECLINE_CODE_GUIDANCE: Record<string, { title: string; message: string }> = {
  insufficient_funds: {
    title: "Card Declined",
    message: "Not enough funds on this card. Try another card.",
  },
  expired_card: {
    title: "Card Expired",
    message: "This card has expired. Use a different card.",
  },
  incorrect_cvc: {
    title: "Incorrect CVC",
    message: "The security code (CVC) is wrong. Check the code on your card and try again.",
  },
  invalid_cvc: {
    title: "Incorrect CVC",
    message: "The security code (CVC) is wrong. Check the code on your card and try again.",
  },
  incorrect_number: {
    title: "Invalid Card Number",
    message: "The card number is incorrect. Check it and try again.",
  },
  invalid_number: {
    title: "Invalid Card Number",
    message: "The card number is incorrect. Check it and try again.",
  },
  invalid_expiry_month: {
    title: "Invalid Expiry Date",
    message: "The expiry date is incorrect. Check it and try again.",
  },
  invalid_expiry_year: {
    title: "Invalid Expiry Date",
    message: "The expiry date is incorrect. Check it and try again.",
  },
  invalid_account: {
    title: "Card Declined",
    message: "This card is linked to a closed or invalid account. Use a different card, or contact your bank.",
  },
  card_velocity_exceeded: {
    title: "Card Limit Reached",
    message: "This card has hit its spending limit. Try another card, or contact your bank.",
  },
  withdrawal_count_limit_exceeded: {
    title: "Card Limit Reached",
    message: "This card has hit its spending limit. Try another card, or contact your bank.",
  },
  processing_error: {
    title: "Processing Issue",
    message: "Your bank couldn't process this. Wait a moment and try again.",
  },
  try_again_later: {
    title: "Processing Issue",
    message: "Your bank couldn't process this. Wait a moment and try again.",
  },
  reenter_transaction: {
    title: "Processing Issue",
    message: "Your bank couldn't process this. Wait a moment and try again.",
  },
  issuer_not_available: {
    title: "Processing Issue",
    message: "Your bank couldn't process this. Wait a moment and try again.",
  },
  transaction_not_allowed: {
    title: "Card Not Supported",
    message: "This card doesn't support this payment. Use a different card.",
  },
  card_not_supported: {
    title: "Card Not Supported",
    message: "This card doesn't support this payment. Use a different card.",
  },
  service_not_allowed: {
    title: "Card Not Supported",
    message: "This card doesn't support this payment. Use a different card.",
  },
  currency_not_supported: {
    title: "Card Not Supported",
    message: "This card doesn't support this payment. Use a different card.",
  },
  authentication_required: {
    title: "Verification Needed",
    message: "Your bank needs to verify this payment. Try again and complete the verification step.",
  },
};

const GENERIC_DECLINE_GUIDANCE = {
  title: "Card Declined",
  message: "Your card was declined. Try a different card, or contact your bank.",
};

/**
 * Short, direct guidance for a card decline. Looks up decline_code first,
 * then the card error code (bad-CVC/expiry/number errors carry the reason in
 * `code` with no decline_code). Unknown or sensitive decline codes get the
 * generic decline message. Returns null for non-card codes so callers fall
 * through to their normal handling.
 */
export function getCardDeclineGuidance(
  declineCode?: string | null,
  errorCode?: string | null
): { title: string; message: string } | null {
  if (declineCode && DECLINE_CODE_GUIDANCE[declineCode]) return DECLINE_CODE_GUIDANCE[declineCode];
  if (errorCode && DECLINE_CODE_GUIDANCE[errorCode]) return DECLINE_CODE_GUIDANCE[errorCode];
  // Any decline code (incl. unmapped/sensitive ones) is still a card decline.
  if (declineCode || errorCode === "card_declined") return GENERIC_DECLINE_GUIDANCE;
  return null;
}

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

  // Card declines: prefer specific, concise guidance from the server-provided
  // code/decline_code (the 400 "Payment failed" shape) over the generic
  // category messages below. Recovery/blocked states keep priority — their
  // next step ("use a different card", "contact support") is more specific
  // than the decline reason.
  if (
    errorType !== "stripe_excessive_retry" &&
    errorType !== "invoice_collection_blocked" &&
    errorType !== "setup_intent_unexpected_state" &&
    errorType !== "payment_intent_unexpected_state"
  ) {
    const { code, declineCode } = extractPaymentErrorCodes(error);
    const declineGuidance = getCardDeclineGuidance(declineCode, code);
    if (declineGuidance) {
      return {
        title: declineGuidance.title,
        message: declineGuidance.message,
        shouldIncludeTryAgain: false,
      };
    }
  }
  
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
        title: GENERIC_DECLINE_GUIDANCE.title,
        message: GENERIC_DECLINE_GUIDANCE.message,
        shouldIncludeTryAgain: false,
      };

    case "stripe_excessive_retry":
      return {
        title: "Card Temporarily Blocked",
        message:
          "This card was declined too many times, so the card network is blocking further attempts for a while. Please use a different card or payment method. Retrying the same card usually will not work until the block clears. More detail: https://support.stripe.com/questions/payment-blocked-due-to-excessive-retries",
        shouldIncludeTryAgain: false,
      };

    case "invoice_collection_blocked":
      return {
        title: "This bill can’t be paid here",
        message:
          "Your renewal invoice can’t be collected through this screen anymore (it may have been closed or replaced in billing). Please contact support so we can reset your invoice or help you pay. If your card was blocked after many declines, you may need a different card once billing is reopened.",
        shouldIncludeTryAgain: false,
      };

    case "insufficient_funds":
      return {
        title: DECLINE_CODE_GUIDANCE.insufficient_funds.title,
        message: DECLINE_CODE_GUIDANCE.insufficient_funds.message,
        shouldIncludeTryAgain: false,
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
