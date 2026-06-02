/**
 * Error Handling Utilities
 *
 * This file contains utilities for handling errors consistently across the application.
 * Now includes integration with error reporting system for reportable errors.
 */

import { useCallback } from "react";
import { ApiError } from "@/lib/queries";
import { useToast } from "@/components/ui/Toast";
import { collectErrorContext } from "@/utils/error-reporting/collect-error-context";

export interface ErrorHandler {
  handleError: (error: unknown, context?: string) => void;
  handleApiError: (error: ApiError, context?: string) => void;
  handleNetworkError: (error: Error, context?: string) => void;
  handleValidationError: (error: Error, context?: string) => void;
}

/**
 * Hook for consistent error handling throughout the application
 * Now includes toast integration with error reporting capabilities
 */
export const useErrorHandling = (): ErrorHandler => {
  const { showToast } = useToast();

  const handleError = useCallback(
    async (error: unknown, context?: string) => {
      console.error(`Error${context ? ` in ${context}` : ""}:`, error);

      // Log to external service in production
      if (process.env.NODE_ENV === "production") {
        // You can integrate with services like Sentry, LogRocket, etc.
        // logError(error, context);
      }

      // Show user-friendly error message
      const message = getErrorMessage(error);

      // Collect error context for reportable errors (client-side only)
      let errorContext;
      if (typeof window !== "undefined") {
        try {
          errorContext = await collectErrorContext(error);
        } catch (contextError) {
          // Silently fail if context collection fails
          console.warn("Failed to collect error context:", contextError);
        }
      }

      // Show error toast with reporting capability
      if (errorContext) {
        showToast({
          type: "error",
          title: "Error",
          message,
          reportable: true,
          errorContext,
        });
      } else {
        // Fallback to console if context collection fails
        showUserError(message);
      }
    },
    [showToast]
  );

  const handleApiError = useCallback(
    (error: ApiError, context?: string) => {
      console.error(`API Error${context ? ` in ${context}` : ""}:`, {
        message: error.message,
        status: error.status,
        data: error.data,
      });

      // Determine if error should be reportable
      // Don't make auth errors (401, 403) reportable as they're expected
      // Don't make validation errors (400) reportable as they're user input issues
      const isReportable = error.status >= 500 || error.status === 0; // Server errors and network errors

      // Handle specific HTTP status codes
      switch (error.status) {
        case 401:
          // Unauthorized - redirect to login
          handleUnauthorized();
          return; // Don't show toast for auth errors
        case 403:
          // Forbidden - show access denied message (not reportable)
          showToast({
            type: "error",
            title: "Access Denied",
            message: "You do not have permission to perform this action.",
            reportable: false,
          });
          return;
        case 404:
          // Not found - show not found message (not reportable)
          showToast({
            type: "error",
            title: "Not Found",
            message: "The requested resource was not found.",
            reportable: false,
          });
          return;
        case 429:
          // Rate limited - show rate limit message (not reportable)
          showToast({
            type: "warning",
            title: "Too Many Requests",
            message: "Too many requests. Please try again later.",
            reportable: false,
          });
          return;
        case 500:
        case 502:
        case 503:
        case 504:
          // Server error - show generic error message (reportable)
          showToast({
            type: "error",
            title: "Server Error",
            message: error.message || "A server error occurred. Please try again later.",
            reportable: isReportable,
            errorContext: error.errorContext,
          });
          return;
        default:
          // Show the error message from the API
          showToast({
            type: "error",
            title: "Error",
            message: error.message || "An unexpected error occurred.",
            reportable: isReportable,
            errorContext: error.errorContext,
          });
      }
    },
    [showToast]
  );

  const handleNetworkError = useCallback(
    async (error: Error, context?: string) => {
      console.error(`Network Error${context ? ` in ${context}` : ""}:`, error);

      // Collect error context for network errors (client-side only)
      let errorContext;
      if (typeof window !== "undefined") {
        try {
          errorContext = await collectErrorContext(error);
        } catch (contextError) {
          // Silently fail if context collection fails
          console.warn("Failed to collect error context:", contextError);
        }
      }

      // Check if it's a network connectivity issue
      const message = error.message.includes("fetch") || error.message.includes("network")
        ? "Network connection error. Please check your internet connection and try again."
        : "A network error occurred. Please try again.";

      // Show error toast with reporting capability
      if (errorContext) {
        showToast({
          type: "error",
          title: "Network Error",
          message,
          reportable: true,
          errorContext,
        });
      } else {
        showUserError(message);
      }
    },
    [showToast]
  );

  const handleValidationError = useCallback((error: Error, context?: string) => {
    console.error(`Validation Error${context ? ` in ${context}` : ""}:`, error);
    showUserError(error.message || "Please check your input and try again.");
  }, []);

  return {
    handleError,
    handleApiError,
    handleNetworkError,
    handleValidationError,
  };
};

/**
 * Get user-friendly error message from any error
 */
const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "An unexpected error occurred. Please try again.";
};

/**
 * Show error message to user
 * This can be integrated with your toast notification system
 */
const showUserError = (message: string) => {
  // You can integrate with toast libraries like react-hot-toast, react-toastify, etc.
  console.error("User Error:", message);

  // Example with react-hot-toast:
  // toast.error(message);

  // Example with custom notification system:
  // notificationService.showError(message);
};

/**
 * Handle unauthorized access
 */
const handleUnauthorized = () => {
  // Clear ONLY stored authentication data. Do NOT call sessionStorage.clear() —
  // it nukes attribution (tools-aus:utm-attribution), A/B assignment, promo-link,
  // referral, affiliate, and upsell keys, silently destroying ad attribution for
  // an unauthenticated ad-clicker who hits a single 401 before purchasing.
  // NextAuth's session cookie is the real auth state, not sessionStorage.
  localStorage.removeItem("auth-token");

  // Redirect to login page
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
};

/**
 * Hook for handling form validation errors
 */
export const useFormErrorHandling = () => {
  // const { handleValidationError } = useErrorHandling(); // TODO: Implement validation error handling

  const handleFieldError = useCallback((field: string, error: string) => {
    console.error(`Field validation error for ${field}:`, error);
    // You can integrate with form libraries like react-hook-form, formik, etc.
    // setFieldError(field, error);
  }, []);

  const handleFormError = useCallback(
    (errors: Record<string, string>) => {
      console.error("Form validation errors:", errors);
      Object.entries(errors).forEach(([field, error]) => {
        handleFieldError(field, error);
      });
    },
    [handleFieldError]
  );

  return {
    handleFieldError,
    handleFormError,
  };
};

/**
 * Hook for handling async operation errors
 */
export const useAsyncErrorHandling = () => {
  const { handleError, handleApiError, handleNetworkError } = useErrorHandling();

  const handleAsyncError = useCallback(
    async (
      asyncFn: () => Promise<unknown>,
      context?: string,
      options?: {
        showError?: boolean;
        fallbackValue?: unknown;
      }
    ) => {
      try {
        return await asyncFn();
      } catch (error) {
        handleError(error, context);

        if (options?.fallbackValue !== undefined) {
          return options.fallbackValue;
        }

        throw error;
      }
    },
    [handleError]
  );

  return {
    handleAsyncError,
    handleApiError,
    handleNetworkError,
  };
};

/**
 * Error boundary hook for React components
 */
export const useErrorBoundary = () => {
  const { handleError } = useErrorHandling();

  const captureError = useCallback(
    (error: Error, errorInfo?: unknown) => {
      console.error("Error Boundary caught an error:", error, errorInfo);
      handleError(error, "Error Boundary");
    },
    [handleError]
  );

  return { captureError };
};
