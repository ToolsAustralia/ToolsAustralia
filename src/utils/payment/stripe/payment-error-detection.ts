/**
 * Payment Error Detection & Categorization Utility
 * 
 * Centralized logic to detect and categorize ALL payment errors across all endpoints.
 * Provides expert error classification for appropriate handling.
 */

export type ErrorCategory = "recoverable" | "retryable" | "non-recoverable";

export type ErrorType =
  | "setup_intent_unexpected_state"
  | "payment_intent_unexpected_state"
  | "payment_processing_error"
  | "payment_failed"
  | "card_declined"
  | "insufficient_funds"
  | "network_error"
  | "unknown";

export type RecoveryStrategy =
  | "setup_intent_recovery"
  | "payment_intent_recovery"
  | "api_retry"
  | "manual_retry"
  | "none";

export interface ErrorDetectionResult {
  isRecoverable: boolean;
  category: ErrorCategory;
  errorType: ErrorType;
  recoveryStrategy: RecoveryStrategy;
  shouldPreserveState: boolean;
}

/**
 * Extract error message from various error formats
 */
function extractErrorMessage(error: unknown): string {
  if (!error) return "";
  
  // Handle Error objects
  if (error instanceof Error) {
    return error.message || "";
  }
  
  // Handle API response errors
  if (typeof error === "object" && error !== null) {
    const err = error as Record<string, unknown>;
    
    // Check for nested error structures
    if (err.response && typeof err.response === "object") {
      const response = err.response as Record<string, unknown>;
      if (response.data && typeof response.data === "object") {
        const data = response.data as Record<string, unknown>;
        if (typeof data.error === "string") return data.error;
        if (typeof data.details === "string") return data.details;
        if (typeof data.message === "string") return data.message;
      }
    }
    
    // Check direct properties
    if (typeof err.error === "string") return err.error;
    if (typeof err.message === "string") return err.message;
    if (typeof err.details === "string") return err.details;
  }
  
  return String(error);
}

/**
 * Extract error code from various error formats
 */
function extractErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  
  const err = error as Record<string, unknown>;
  
  // Check for nested error structures
  if (err.response && typeof err.response === "object") {
    const response = err.response as Record<string, unknown>;
    if (response.data && typeof response.data === "object") {
      const data = response.data as Record<string, unknown>;
      if (typeof data.code === "string") return data.code;
      if (data.error && typeof data.error === "object") {
        const errorObj = data.error as Record<string, unknown>;
        if (typeof errorObj.code === "string") return errorObj.code;
      }
    }
  }
  
  // Check direct properties
  if (typeof err.code === "string") return err.code;
  
  return undefined;
}

/**
 * Determine if an error is recoverable (can be automatically fixed)
 */
export function isRecoverableError(error: unknown): boolean {
  const errorMessage = extractErrorMessage(error).toLowerCase();
  const errorCode = extractErrorCode(error)?.toLowerCase() || "";
  
  // ✅ NEW: Check for recovery flags from status checks
  if (typeof error === "object" && error !== null) {
    const err = error as Record<string, unknown>;
    if (err.needsRecovery === true || 
        (typeof err.error === "string" && (
          err.error.includes("SETUP_INTENT_HAS_ERROR_RETRY") ||
          err.error.includes("PAYMENT_INTENT_HAS_ERROR_RETRY")
        ))) {
      return true;
    }
  }
  
  // Recoverable errors: SetupIntent/PaymentIntent already succeeded
  if (
    errorCode === "setup_intent_unexpected_state" ||
    errorCode === "payment_intent_unexpected_state"
  ) {
    if (
      errorMessage.includes("already succeeded") ||
      errorMessage.includes("succeeded") ||
      errorMessage.includes("cannot confirm")
    ) {
      return true;
    }
  }
  
  // Payment processing errors might be recoverable (intermittent issues)
  if (
    errorMessage.includes("payment processing error") ||
    errorCode === "payment_processing_error"
  ) {
    return true;
  }
  
  return false;
}

/**
 * Categorize error for appropriate handling
 */
export function categorizeError(error: unknown): {
  category: ErrorCategory;
  errorType: ErrorType;
  shouldPreserveState: boolean;
} {
  const errorMessage = extractErrorMessage(error).toLowerCase();
  const errorCode = extractErrorCode(error)?.toLowerCase() || "";
  
  // ✅ NEW: Check for recovery flags from status checks (SetupIntent with last_setup_error)
  if (typeof error === "object" && error !== null) {
    const err = error as Record<string, unknown>;
    if (err.needsRecovery === true || 
        (typeof err.error === "string" && err.error.includes("SETUP_INTENT_HAS_ERROR_RETRY"))) {
      return {
        category: "recoverable",
        errorType: "setup_intent_unexpected_state",
        shouldPreserveState: true,
      };
    }
    if (typeof err.error === "string" && err.error.includes("PAYMENT_INTENT_HAS_ERROR_RETRY")) {
      return {
        category: "recoverable",
        errorType: "payment_intent_unexpected_state",
        shouldPreserveState: true,
      };
    }
  }
  
  // SetupIntent/PaymentIntent unexpected state (already succeeded)
  if (
    errorCode === "setup_intent_unexpected_state" ||
    (errorMessage.includes("setup_intent") && errorMessage.includes("unexpected"))
  ) {
    return {
      category: "recoverable",
      errorType: "setup_intent_unexpected_state",
      shouldPreserveState: true,
    };
  }
  
  if (
    errorCode === "payment_intent_unexpected_state" ||
    (errorMessage.includes("payment_intent") && errorMessage.includes("unexpected"))
  ) {
    return {
      category: "recoverable",
      errorType: "payment_intent_unexpected_state",
      shouldPreserveState: true,
    };
  }
  
  // Payment processing errors (might be recoverable)
  if (
    errorMessage.includes("payment processing error") ||
    errorCode === "payment_processing_error"
  ) {
    return {
      category: "recoverable",
      errorType: "payment_processing_error",
      shouldPreserveState: true,
    };
  }
  
  // Payment failed (retryable but not automatically recoverable)
  if (
    errorMessage.includes("payment failed") ||
    errorMessage.includes("payment_failed") ||
    errorCode === "payment_failed"
  ) {
    return {
      category: "retryable",
      errorType: "payment_failed",
      shouldPreserveState: true,
    };
  }
  
  // Card declined (retryable but not automatically recoverable)
  if (
    errorCode === "card_declined" ||
    errorMessage.includes("card_declined") ||
    errorMessage.includes("card was declined")
  ) {
    return {
      category: "retryable",
      errorType: "card_declined",
      shouldPreserveState: true,
    };
  }
  
  // Insufficient funds (retryable but not automatically recoverable)
  if (
    errorCode === "insufficient_funds" ||
    errorMessage.includes("insufficient") ||
    errorMessage.includes("insufficient_funds")
  ) {
    return {
      category: "retryable",
      errorType: "insufficient_funds",
      shouldPreserveState: true,
    };
  }
  
  // Network errors (retryable but not automatically recoverable)
  if (
    errorMessage.includes("network") ||
    errorMessage.includes("connection") ||
    errorMessage.includes("fetch failed") ||
    errorMessage.includes("timeout")
  ) {
    return {
      category: "retryable",
      errorType: "network_error",
      shouldPreserveState: true,
    };
  }
  
  // Unknown errors (non-recoverable but still retryable)
  return {
    category: "non-recoverable",
    errorType: "unknown",
    shouldPreserveState: true, // Always preserve state for retry
  };
}

/**
 * Determine recovery strategy based on error type
 */
export function getRecoveryStrategy(error: unknown): RecoveryStrategy {
  const categorization = categorizeError(error);
  
  if (categorization.category === "recoverable") {
    switch (categorization.errorType) {
      case "setup_intent_unexpected_state":
        return "setup_intent_recovery";
      case "payment_intent_unexpected_state":
        return "payment_intent_recovery";
      case "payment_processing_error":
        return "api_retry";
      default:
        return "manual_retry";
    }
  }
  
  if (categorization.category === "retryable") {
    return "manual_retry";
  }
  
  return "none";
}

/**
 * Check if state should be preserved for this error
 * State should ALWAYS be preserved unless recovery explicitly requires clearing
 */
export function shouldPreserveState(_error: unknown): boolean {
  // Always preserve state - only clear if recovery explicitly requires it
  // Recovery utilities will handle clearing state when creating new SetupIntent/PaymentIntent
  return true;
}

/**
 * Comprehensive error detection with all information
 */
export function detectPaymentError(error: unknown): ErrorDetectionResult {
  const isRecoverable = isRecoverableError(error);
  const categorization = categorizeError(error);
  const recoveryStrategy = getRecoveryStrategy(error);
  const preserveState = shouldPreserveState(error);
  
  return {
    isRecoverable,
    category: categorization.category,
    errorType: categorization.errorType,
    recoveryStrategy,
    shouldPreserveState: preserveState,
  };
}
