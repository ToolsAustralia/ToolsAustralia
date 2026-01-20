/**
 * Subscription Error Handler
 *
 * Centralized error handling for subscription flow.
 * Provides user-friendly error messages and proper error types.
 *
 * Best Practices:
 * - Centralized error handling
 * - User-friendly messages
 * - Proper error types
 * - Comprehensive error information
 *
 * @module subscription-error-handler
 */

/**
 * Subscription error types
 */
export enum SubscriptionErrorType {
  SUBSCRIPTION_CREATION_FAILED = "SUBSCRIPTION_CREATION_FAILED",
  PAYMENT_INTENT_NOT_READY = "PAYMENT_INTENT_NOT_READY",
  INVALID_RESPONSE = "INVALID_RESPONSE",
  NETWORK_ERROR = "NETWORK_ERROR",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

/**
 * Structured subscription error
 */
export interface SubscriptionError {
  type: SubscriptionErrorType;
  message: string; // Technical message for logging
  userMessage: string; // User-friendly message for UI
  originalError?: unknown; // Original error for debugging
  code?: string; // Error code from API (if available)
}

/**
 * Handles subscription creation errors
 *
 * Transforms various error types into a consistent SubscriptionError format.
 * Provides user-friendly messages while preserving technical details for logging.
 *
 * @param error - Error from subscription creation (unknown type for safety)
 * @returns Structured subscription error
 *
 * @example
 * ```typescript
 * try {
 *   const result = await createSubscriptionExistingUser({...});
 * } catch (error) {
 *   const subscriptionError = handleSubscriptionError(error);
 *   showToast({
 *     type: "error",
 *     message: subscriptionError.userMessage
 *   });
 * }
 * ```
 */
export function handleSubscriptionError(error: unknown): SubscriptionError {
  // Handle API errors with response structure
  if (error && typeof error === "object" && "response" in error) {
    const apiError = error as { response?: { data?: { error?: string; code?: string; details?: string } } };
    const errorData = apiError.response?.data;
    const errorMessage = errorData?.error || errorData?.details || "Failed to create subscription";
    const errorCode = errorData?.code;

    return {
      type: SubscriptionErrorType.SUBSCRIPTION_CREATION_FAILED,
      message: `Subscription creation failed: ${errorMessage}`,
      userMessage: errorMessage || "Unable to create subscription. Please try again.",
      originalError: error,
      code: errorCode,
    };
  }

  // Handle Error objects
  if (error instanceof Error) {
    // Check for network errors
    if (error.message.includes("fetch") || error.message.includes("network") || error.message.includes("Network")) {
      return {
        type: SubscriptionErrorType.NETWORK_ERROR,
        message: `Network error: ${error.message}`,
        userMessage: "Network error. Please check your connection and try again.",
        originalError: error,
      };
    }

    // Check for validation errors
    if (error.message.includes("validation") || error.message.includes("invalid")) {
      return {
        type: SubscriptionErrorType.VALIDATION_ERROR,
        message: `Validation error: ${error.message}`,
        userMessage: "Invalid input. Please check your information and try again.",
        originalError: error,
      };
    }

    // Generic error
    return {
      type: SubscriptionErrorType.SUBSCRIPTION_CREATION_FAILED,
      message: `Subscription creation error: ${error.message}`,
      userMessage: error.message || "Failed to create subscription. Please try again.",
      originalError: error,
    };
  }

  // Handle string errors
  if (typeof error === "string") {
    return {
      type: SubscriptionErrorType.SUBSCRIPTION_CREATION_FAILED,
      message: `Subscription creation error: ${error}`,
      userMessage: error || "Failed to create subscription. Please try again.",
      originalError: error,
    };
  }

  // Unknown error type
  return {
    type: SubscriptionErrorType.UNKNOWN_ERROR,
    message: "Unknown subscription creation error",
    userMessage: "An unexpected error occurred. Please try again.",
    originalError: error,
  };
}

/**
 * Handles PaymentIntent not ready errors
 *
 * Used when subscription is created but PaymentIntent client_secret is not yet available.
 *
 * @returns Structured subscription error for PaymentIntent not ready scenario
 */
export function handlePaymentIntentNotReadyError(): SubscriptionError {
  return {
    type: SubscriptionErrorType.PAYMENT_INTENT_NOT_READY,
    message: "PaymentIntent not ready - client_secret not available in response",
    userMessage: "Payment is being prepared. Please wait a moment and try again.",
    originalError: undefined,
  };
}

/**
 * Handles invalid response format errors
 *
 * Used when API response doesn't match expected format.
 *
 * @param response - The invalid response (for logging)
 * @returns Structured subscription error for invalid response
 */
export function handleInvalidResponseError(response: unknown): SubscriptionError {
  return {
    type: SubscriptionErrorType.INVALID_RESPONSE,
    message: "Invalid response format from subscription API",
    userMessage: "Received an invalid response. Please try again or contact support.",
    originalError: response,
  };
}

/**
 * Checks if error is retryable
 *
 * Determines if an error is likely to succeed on retry.
 *
 * @param error - Subscription error to check
 * @returns True if error is retryable
 */
export function isRetryableError(error: SubscriptionError): boolean {
  return (
    error.type === SubscriptionErrorType.NETWORK_ERROR ||
    error.type === SubscriptionErrorType.PAYMENT_INTENT_NOT_READY
  );
}
