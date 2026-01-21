/**
 * Error Category Detector Utility
 * 
 * Automatically detects error category based on error characteristics.
 * Used for proper error classification and routing to appropriate handlers.
 * 
 * Categories:
 * - payment: Payment failures, card declines, Stripe errors
 * - network: Fetch failures, timeouts, connection errors
 * - api: API endpoint errors, validation failures
 * - system: Database errors, authentication failures
 * - recovery: Automatic recovery failures
 */

export type ErrorCategory = "payment" | "network" | "api" | "system" | "recovery";

export interface ErrorCategoryResult {
  category: ErrorCategory;
  confidence: "high" | "medium" | "low";
  indicators: string[];
}

/**
 * Extract error message from various error formats
 */
function extractErrorMessage(error: unknown): string {
  if (!error) return "";
  
  if (error instanceof Error) {
    return error.message || "";
  }
  
  if (typeof error === "string") {
    return error;
  }
  
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
 * Detect error category based on error characteristics
 * 
 * @param error - The error object to categorize
 * @param context - Optional context (endpoint, component, etc.)
 * @returns Error category with confidence level
 */
export function detectErrorCategory(
  error: unknown,
  context?: {
    endpoint?: string;
    component?: string;
    errorCode?: string;
  }
): ErrorCategoryResult {
  const errorMessage = extractErrorMessage(error).toLowerCase();
  const errorCode = extractErrorCode(error)?.toLowerCase() || context?.errorCode?.toLowerCase() || "";
  const indicators: string[] = [];
  let category: ErrorCategory = "api"; // Default
  let confidence: "high" | "medium" | "low" = "low";

  // Payment errors detection
  const paymentIndicators = [
    "payment",
    "stripe",
    "card",
    "declined",
    "insufficient",
    "expired",
    "cvc",
    "payment_intent",
    "setup_intent",
    "payment_method",
    "invoice",
    "subscription",
    "charge",
    "customer",
  ];
  
  const paymentCodes = [
    "card_declined",
    "insufficient_funds",
    "expired_card",
    "incorrect_cvc",
    "processing_error",
    "generic_decline",
    "payment_intent",
    "setup_intent",
    "payment_method",
    "invoice",
  ];

  if (
    paymentIndicators.some((indicator) => errorMessage.includes(indicator)) ||
    paymentCodes.some((code) => errorCode.includes(code)) ||
    context?.endpoint?.includes("/stripe/") ||
    context?.endpoint?.includes("/payment") ||
    context?.component?.toLowerCase().includes("payment")
  ) {
    category = "payment";
    confidence = "high";
    indicators.push("payment-related keywords", "stripe endpoint", "payment component");
  }

  // Network errors detection
  const networkIndicators = [
    "fetch",
    "network",
    "connection",
    "timeout",
    "failed to fetch",
    "networkerror",
    "network error",
    "connection error",
    "connection refused",
    "dns",
    "econnrefused",
    "enotfound",
  ];

  if (
    networkIndicators.some((indicator) => errorMessage.includes(indicator)) ||
    (error instanceof TypeError && errorMessage.includes("fetch"))
  ) {
    category = "network";
    confidence = "high";
    indicators.push("network-related keywords", "fetch error", "connection error");
  }

  // Recovery errors detection
  const recoveryIndicators = [
    "recovery",
    "retry",
    "automatic recovery",
    "recovery failed",
    "setup_intent_has_error_retry",
    "payment_intent_has_error_retry",
    "recovery error",
  ];

  if (
    recoveryIndicators.some((indicator) => errorMessage.includes(indicator)) ||
    errorCode.includes("recovery") ||
    errorCode.includes("retry")
  ) {
    category = "recovery";
    confidence = "high";
    indicators.push("recovery-related keywords", "retry error");
  }

  // System errors detection
  const systemIndicators = [
    "database",
    "mongodb",
    "mongoose",
    "connection",
    "authentication",
    "authorization",
    "session",
    "token",
    "jwt",
    "unauthorized",
    "forbidden",
    "internal server error",
    "500",
  ];

  const systemCodes = [
    "database_error",
    "connection_error",
    "authentication_error",
    "authorization_error",
    "session_expired",
    "token_invalid",
  ];

  if (
    systemIndicators.some((indicator) => errorMessage.includes(indicator)) ||
    systemCodes.some((code) => errorCode.includes(code)) ||
    errorCode === "unauthorized" ||
    errorCode === "forbidden"
  ) {
    // Only set as system if not already categorized as network
    if (category !== "network") {
      category = "system";
      confidence = "high";
      indicators.push("system-related keywords", "database error", "auth error");
    }
  }

  // API errors detection (default, but can be refined)
  if (category === "api" && context?.endpoint) {
    confidence = "medium";
    indicators.push("API endpoint context");
  }

  // If no strong indicators, default to API with low confidence
  if (indicators.length === 0) {
    category = "api";
    confidence = "low";
    indicators.push("default category");
  }

  return {
    category,
    confidence,
    indicators,
  };
}
