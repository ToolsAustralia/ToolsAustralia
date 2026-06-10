/**
 * Error Severity Classifier Utility
 * 
 * Automatically determines error severity based on error category and characteristics.
 * Used for prioritizing error reports and determining appropriate handling.
 * 
 * Severity Levels:
 * - critical: Payment failures, data loss, security issues
 * - high: API errors, authentication failures, recovery failures
 * - medium: Network errors, validation errors, non-critical system errors
 */

import { ErrorCategory, detectErrorCategory } from "./error-category-detector";

export type ErrorSeverity = "critical" | "high" | "medium";

export interface ErrorSeverityResult {
  severity: ErrorSeverity;
  reason: string;
}

/**
 * Check if error is a security-related error
 */
function isSecurityError(error: unknown, errorMessage: string, errorCode: string): boolean {
  const securityIndicators = [
    "unauthorized",
    "forbidden",
    "authentication",
    "authorization",
    "token",
    "session",
    "jwt",
    "security",
    "permission",
    "access denied",
  ];

  return (
    securityIndicators.some((indicator) => errorMessage.includes(indicator)) ||
    errorCode.includes("unauthorized") ||
    errorCode.includes("forbidden") ||
    errorCode.includes("auth")
  );
}

/**
 * Check if error is an authentication error
 */
function isAuthError(error: unknown, errorMessage: string, errorCode: string): boolean {
  const authIndicators = [
    "authentication",
    "unauthorized",
    "token",
    "session",
    "login",
    "signin",
    "credentials",
  ];

  return (
    authIndicators.some((indicator) => errorMessage.includes(indicator)) ||
    errorCode.includes("auth") ||
    errorCode === "unauthorized"
  );
}

/**
 * Check if error indicates data loss
 */
function isDataLossError(error: unknown, errorMessage: string): boolean {
  const dataLossIndicators = [
    "data loss",
    "corruption",
    "database",
    "transaction",
    "rollback",
    "integrity",
  ];

  return dataLossIndicators.some((indicator) => errorMessage.includes(indicator));
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
    
    if (err.response && typeof err.response === "object") {
      const response = err.response as Record<string, unknown>;
      if (response.data && typeof response.data === "object") {
        const data = response.data as Record<string, unknown>;
        if (typeof data.error === "string") return data.error;
        if (typeof data.details === "string") return data.details;
        if (typeof data.message === "string") return data.message;
      }
    }
    
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
  
  if (typeof err.code === "string") return err.code;

  return undefined;
}

/**
 * Stripe card-error `code` values that represent an EXPECTED, user-side card
 * decline (the issuer said no) rather than a payment-system failure.
 */
const EXPECTED_DECLINE_ERROR_CODES = new Set<string>([
  "card_declined",
  "insufficient_funds",
  "expired_card",
  "incorrect_cvc",
  "invalid_cvc",
  "incorrect_number",
  "invalid_number",
  "incorrect_zip",
  "invalid_expiry_month",
  "invalid_expiry_year",
  "processing_error",
  "generic_decline",
  "authentication_required",
  "card_decline_rate_limit_exceeded",
]);

/** Message phrasings that indicate an expected card decline (used when no structured code is present). */
const EXPECTED_DECLINE_MESSAGE_HINTS = [
  "declined",
  "insufficient funds",
  "card has expired",
  "expired card",
  "security code is incorrect",
  "incorrect card number",
  "card number is incorrect",
  "do not honor",
  "lost card",
  "stolen card",
  "pickup card",
  "try a different card",
];

/**
 * True when a payment error is an expected, user-side card decline (NOT a system failure).
 *
 * A non-empty Stripe `decline_code` only ever exists on an issuer decline, so it's the
 * strongest signal; falls back to known card-error `code`s, then to message phrasing.
 * Declines are routine, high-volume, and not engineering-actionable (the user needs a
 * different card, not a bug fix) — so callers downgrade them out of "critical".
 */
export function isExpectedPaymentDecline(opts: {
  errorCode?: string;
  declineCode?: string;
  message?: string;
}): boolean {
  if (opts.declineCode && opts.declineCode.trim().length > 0) return true;
  const code = (opts.errorCode ?? "").toLowerCase().trim();
  if (code && EXPECTED_DECLINE_ERROR_CODES.has(code)) return true;
  const msg = (opts.message ?? "").toLowerCase();
  return msg.length > 0 && EXPECTED_DECLINE_MESSAGE_HINTS.some((h) => msg.includes(h));
}

/**
 * Classify error severity based on category and characteristics
 * 
 * @param error - The error object to classify
 * @param category - The error category (from detectErrorCategory)
 * @param context - Optional context for additional information
 * @returns Error severity with reason
 */
export function classifyErrorSeverity(
  error: unknown,
  category: ErrorCategory,
  _context?: {
    endpoint?: string;
    component?: string;
    isPaymentRelated?: boolean;
  }
): ErrorSeverityResult {
  const errorMessage = extractErrorMessage(error).toLowerCase();
  const errorCode = extractErrorCode(error)?.toLowerCase() || "";

  // Payment errors: critical by default (direct revenue impact) — EXCEPT expected
  // card declines (insufficient funds, expired card, etc.), which are routine
  // user-side events, not system failures. Those are "medium" so they stop
  // drowning genuine payment-system failures (Stripe load failure, API errors) in
  // the "critical" bucket. Mirrors the named-4xx capture policy (classifyHttpRejection).
  if (category === "payment") {
    if (isExpectedPaymentDecline({ errorCode, message: errorMessage })) {
      return {
        severity: "medium",
        reason: "Expected card decline (user-side) — not a payment-system failure",
      };
    }
    return {
      severity: "critical",
      reason: "Payment system errors directly impact revenue and user experience",
    };
  }

  if (category === "system") {
    if (isSecurityError(error, errorMessage, errorCode)) {
      return {
        severity: "critical",
        reason: "Security-related errors require immediate attention",
      };
    }

    if (isDataLossError(error, errorMessage)) {
      return {
        severity: "critical",
        reason: "Data loss errors are critical and require immediate action",
      };
    }
  }

  // High severity: API errors, authentication failures, recovery failures
  if (category === "api") {
    if (isAuthError(error, errorMessage, errorCode)) {
      return {
        severity: "high",
        reason: "Authentication errors prevent user access",
      };
    }

    // Check for 5xx errors (server errors)
    if (errorCode.includes("500") || errorCode.includes("502") || errorCode.includes("503")) {
      return {
        severity: "high",
        reason: "Server errors indicate system issues",
      };
    }

    return {
      severity: "high",
      reason: "API errors indicate integration or validation issues",
    };
  }

  if (category === "recovery") {
    return {
      severity: "high",
      reason: "Recovery failures prevent automatic error resolution",
    };
  }

  if (category === "system") {
    return {
      severity: "high",
      reason: "System errors indicate infrastructure or configuration issues",
    };
  }

  // Medium severity: Network errors, validation errors
  if (category === "network") {
    return {
      severity: "medium",
      reason: "Network errors are often transient and may resolve automatically",
    };
  }

  // Default to high for unknown cases
  return {
    severity: "high",
    reason: "Unknown error type - defaulting to high severity",
  };
}

/**
 * Convenience function to detect category and classify severity in one call
 */
export function detectCategoryAndSeverity(
  error: unknown,
  context?: {
    endpoint?: string;
    component?: string;
    errorCode?: string;
    isPaymentRelated?: boolean;
  }
): {
  category: ErrorCategory;
  severity: ErrorSeverity;
  categoryResult: ReturnType<typeof detectErrorCategory>;
  severityResult: ErrorSeverityResult;
} {
  const categoryResult = detectErrorCategory(error, context);
  const severityResult = classifyErrorSeverity(error, categoryResult.category, context);

  return {
    category: categoryResult.category,
    severity: severityResult.severity,
    categoryResult,
    severityResult,
  };
}
