"use client";

import { useState, useCallback, useRef } from "react";
import { useToast } from "@/components/ui/Toast";

/**
 * Error Recovery Hook
 *
 * Provides comprehensive error handling with automatic retry logic,
 * exponential backoff, and user-friendly error messages
 */

interface ErrorRecoveryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  retryCondition?: (error: Error) => boolean;
  onRetrySuccess?: () => void;
  onRetryFailure?: (error: Error, retryCount: number) => void;
  onMaxRetriesReached?: () => void;
}

interface ErrorRecoveryState {
  error: Error | null;
  isRetrying: boolean;
  retryCount: number;
  canRetry: boolean;
}

export const useErrorRecovery = (options: ErrorRecoveryOptions = {}) => {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    retryCondition = defaultRetryCondition,
    onRetrySuccess,
    onRetryFailure,
    onMaxRetriesReached,
  } = options;

  const [state, setState] = useState<ErrorRecoveryState>({
    error: null,
    isRetrying: false,
    retryCount: 0,
    canRetry: true,
  });

  const retryTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const { showToast } = useToast();

  // Default retry condition - retry on network errors and 5xx server errors
  function defaultRetryCondition(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("connection") ||
      message.includes("fetch") ||
      message.includes("500") ||
      message.includes("502") ||
      message.includes("503") ||
      message.includes("504")
    );
  }

  // Calculate delay with exponential backoff
  const calculateDelay = useCallback(
    (retryCount: number): number => {
      const delay = baseDelay * Math.pow(2, retryCount);
      return Math.min(delay, maxDelay);
    },
    [baseDelay, maxDelay]
  );

  // Clear any pending retry
  const clearRetry = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = undefined;
    }
  }, []);

  // Execute retry with exponential backoff
  const executeRetry = useCallback(
    async <T>(operation: () => Promise<T>, retryCount: number): Promise<T> => {
      if (retryCount >= maxRetries) {
        setState((prev) => ({ ...prev, canRetry: false }));
        onMaxRetriesReached?.();
        showToast({
          type: "error",
          title: "Max Retries Reached",
          message: "Please try again later or contact support",
          duration: 5000,
        });
        throw new Error("Max retries reached");
      }

      const delay = calculateDelay(retryCount);

      return new Promise((resolve, reject) => {
        retryTimeoutRef.current = setTimeout(async () => {
          try {
            setState((prev) => ({ ...prev, isRetrying: true, retryCount: retryCount + 1 }));

            const result = await operation();

            // Success - reset error state
            setState({
              error: null,
              isRetrying: false,
              retryCount: 0,
              canRetry: true,
            });

            onRetrySuccess?.();
            showToast({
              type: "success",
              title: "Retry Successful",
              message: "The operation completed successfully",
              duration: 3000,
            });

            resolve(result);
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));

            setState((prev) => ({
              ...prev,
              error: err,
              isRetrying: false,
            }));

            onRetryFailure?.(err, retryCount + 1);

            // Check if we should retry again
            if (retryCondition(err) && retryCount + 1 < maxRetries) {
              showToast({
                type: "warning",
                title: "Retry Failed",
                message: `Attempt ${retryCount + 1} of ${maxRetries} failed. Retrying...`,
                duration: 2000,
              });

              // Recursive retry
              executeRetry(operation, retryCount + 1)
                .then(resolve)
                .catch(reject);
            } else {
              showToast({
                type: "error",
                title: "Operation Failed",
                message: err.message || "An unexpected error occurred",
                duration: 5000,
              });
              reject(err);
            }
          }
        }, delay);
      });
    },
    [maxRetries, calculateDelay, retryCondition, onRetrySuccess, onRetryFailure, onMaxRetriesReached, showToast]
  );

  // Execute operation with error recovery
  const executeWithRecovery = useCallback(
    async <T>(
      operation: () => Promise<T>,
      options?: {
        immediate?: boolean;
        showErrorToast?: boolean;
      }
    ): Promise<T> => {
      const { immediate = false, showErrorToast = true } = options || {};

      try {
        // Clear any previous error
        setState((prev) => ({ ...prev, error: null }));

        const result = await operation();
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        setState((prev) => ({
          ...prev,
          error: err,
          retryCount: 0,
        }));

        if (showErrorToast) {
          showToast({
            type: "error",
            title: "Operation Failed",
            message: err.message || "An unexpected error occurred",
            duration: 5000,
          });
        }

        // Auto-retry if conditions are met
        if (!immediate && retryCondition(err)) {
          return executeRetry<T>(operation, 0);
        }

        throw err;
      }
    },
    [retryCondition, executeRetry, showToast]
  );

  // Manual retry function
  const retry = useCallback(
    async <T>(operation: () => Promise<T>): Promise<T> => {
      clearRetry();
      return executeRetry<T>(operation, state.retryCount);
    },
    [executeRetry, state.retryCount, clearRetry]
  );

  // Reset error state
  const reset = useCallback(() => {
    clearRetry();
    setState({
      error: null,
      isRetrying: false,
      retryCount: 0,
      canRetry: true,
    });
  }, [clearRetry]);

  // Get error type for UI components
  const getErrorType = useCallback((): "network" | "server" | "validation" | "unknown" => {
    if (!state.error) return "unknown";

    const message = state.error.message.toLowerCase();

    if (message.includes("network") || message.includes("connection") || message.includes("timeout")) {
      return "network";
    }

    if (message.includes("500") || message.includes("502") || message.includes("503") || message.includes("504")) {
      return "server";
    }

    if (message.includes("validation") || message.includes("invalid") || message.includes("required")) {
      return "validation";
    }

    return "unknown";
  }, [state.error]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      clearRetry();
    };
  }, [clearRetry]);

  return {
    // State
    error: state.error,
    isRetrying: state.isRetrying,
    retryCount: state.retryCount,
    canRetry: state.canRetry,
    errorType: getErrorType(),

    // Actions
    executeWithRecovery,
    retry,
    reset,
    clearRetry,
  };
};

// Import React for useEffect
import React from "react";
