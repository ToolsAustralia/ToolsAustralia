/**
 * Error Handling Utilities
 *
 * This file contains utilities for handling errors consistently across the application.
 */

import { useCallback } from "react";
import { ApiError } from "@/lib/queries";

export interface ErrorHandler {
  handleError: (error: unknown, context?: string) => void;
  handleApiError: (error: ApiError, context?: string) => void;
  handleNetworkError: (error: Error, context?: string) => void;
  handleValidationError: (error: Error, context?: string) => void;
}

/**
 * Hook for consistent error handling throughout the application
 */
export const useErrorHandling = (): ErrorHandler => {
  const handleError = useCallback((error: unknown, context?: string) => {
    console.error(`Error${context ? ` in ${context}` : ""}:`, error);

    // Log to external service in production
    if (process.env.NODE_ENV === "production") {
      // You can integrate with services like Sentry, LogRocket, etc.
      // logError(error, context);
    }

    // Show user-friendly error message
    const message = getErrorMessage(error);
    showUserError(message);
  }, []);

  const handleApiError = useCallback((error: ApiError, context?: string) => {
    console.error(`API Error${context ? ` in ${context}` : ""}:`, {
      message: error.message,
      status: error.status,
      data: error.data,
    });

    // Handle specific HTTP status codes
    switch (error.status) {
      case 401:
        // Unauthorized - redirect to login
        handleUnauthorized();
        break;
      case 403:
        // Forbidden - show access denied message
        showUserError("You do not have permission to perform this action.");
        break;
      case 404:
        // Not found - show not found message
        showUserError("The requested resource was not found.");
        break;
      case 429:
        // Rate limited - show rate limit message
        showUserError("Too many requests. Please try again later.");
        break;
      case 500:
        // Server error - show generic error message
        showUserError("A server error occurred. Please try again later.");
        break;
      default:
        // Show the error message from the API
        showUserError(error.message || "An unexpected error occurred.");
    }
  }, []);

  const handleNetworkError = useCallback((error: Error, context?: string) => {
    console.error(`Network Error${context ? ` in ${context}` : ""}:`, error);

    // Check if it's a network connectivity issue
    if (error.message.includes("fetch") || error.message.includes("network")) {
      showUserError("Network connection error. Please check your internet connection and try again.");
    } else {
      showUserError("A network error occurred. Please try again.");
    }
  }, []);

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
  // Clear any stored authentication data
  localStorage.removeItem("auth-token");
  sessionStorage.clear();

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
