"use client";

import React, { useState, useCallback } from "react";
import { AlertCircle, RefreshCw, Wifi, WifiOff, XCircle } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

/**
 * Error Recovery System
 *
 * Strategy:
 * 1. Automatic retries for transient errors (network, server 5xx)
 * 2. Retry buttons for user-actionable errors (4xx, validation)
 * 3. Fallback content for non-critical failures
 */

interface ErrorRecoveryProps {
  error: Error | string;
  onRetry?: () => Promise<void> | void;
  onDismiss?: () => void;
  type?: "network" | "server" | "validation" | "unknown";
  showRetryButton?: boolean;
  autoRetry?: boolean;
  maxRetries?: number;
  className?: string;
}

export const ErrorRecovery: React.FC<ErrorRecoveryProps> = ({
  error,
  onRetry,
  onDismiss,
  type = "unknown",
  showRetryButton = true,
  autoRetry = false,
  maxRetries = 3,
  className = "",
}) => {
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const { showToast } = useToast();

  const errorMessage = typeof error === "string" ? error : error.message;

  const handleRetry = useCallback(async () => {
    if (!onRetry || isRetrying) return;

    setIsRetrying(true);
    setRetryCount((prev) => prev + 1);

    try {
      await onRetry();
      showToast({
        type: "success",
        title: "Retry Successful",
        message: "The operation completed successfully",
        duration: 3000,
      });
    } catch (retryError) {
      const retryErrorMessage = retryError instanceof Error ? retryError.message : "Retry failed";

      if (retryCount >= maxRetries - 1) {
        showToast({
          type: "error",
          title: "Max Retries Reached",
          message: "Please try again later or contact support",
          duration: 5000,
        });
      } else {
        showToast({
          type: "warning",
          title: "Retry Failed",
          message: `Attempt ${retryCount + 1} of ${maxRetries} failed`,
          duration: 3000,
        });
      }
    } finally {
      setIsRetrying(false);
    }
  }, [onRetry, isRetrying, retryCount, maxRetries, showToast]);

  // Auto-retry for transient errors
  React.useEffect(() => {
    if (autoRetry && type === "network" && retryCount < maxRetries) {
      const timer = setTimeout(() => {
        handleRetry();
      }, Math.pow(2, retryCount) * 1000); // Exponential backoff

      return () => clearTimeout(timer);
    }
  }, [autoRetry, type, retryCount, maxRetries, handleRetry]);

  const getErrorIcon = () => {
    switch (type) {
      case "network":
        return <WifiOff className="w-5 h-5" />;
      case "server":
        return <AlertCircle className="w-5 h-5" />;
      case "validation":
        return <XCircle className="w-5 h-5" />;
      default:
        return <AlertCircle className="w-5 h-5" />;
    }
  };

  const getErrorColor = () => {
    switch (type) {
      case "network":
        return "text-orange-600 bg-orange-50 border-orange-200";
      case "server":
        return "text-red-600 bg-red-50 border-red-200";
      case "validation":
        return "text-yellow-600 bg-yellow-50 border-yellow-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  const shouldShowRetryButton = showRetryButton && onRetry && retryCount < maxRetries;

  return (
    <div className={`rounded-lg border p-4 ${getErrorColor()} ${className}`}>
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">{getErrorIcon()}</div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium">
            {type === "network" && "Connection Error"}
            {type === "server" && "Server Error"}
            {type === "validation" && "Validation Error"}
            {type === "unknown" && "Something went wrong"}
          </h3>

          <p className="mt-1 text-sm opacity-90">{errorMessage}</p>

          {retryCount > 0 && (
            <p className="mt-1 text-xs opacity-75">
              Retry attempt {retryCount} of {maxRetries}
            </p>
          )}

          <div className="mt-3 flex space-x-2">
            {shouldShowRetryButton && (
              <button
                onClick={handleRetry}
                disabled={isRetrying}
                className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md transition-colors
                  bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRetrying ? (
                  <>
                    <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                    Retrying...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Retry
                  </>
                )}
              </button>
            )}

            {onDismiss && (
              <button
                onClick={onDismiss}
                className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md transition-colors
                  bg-white hover:bg-gray-50"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Network Error Recovery
 * Automatically retries with exponential backoff
 */
export const NetworkErrorRecovery: React.FC<{
  onRetry: () => Promise<void>;
  onDismiss?: () => void;
  className?: string;
}> = ({ onRetry, onDismiss, className }) => {
  return (
    <ErrorRecovery
      error="Unable to connect to the server. Please check your internet connection."
      type="network"
      onRetry={onRetry}
      onDismiss={onDismiss}
      autoRetry={true}
      maxRetries={3}
      className={className}
    />
  );
};

/**
 * Server Error Recovery
 * Shows retry button for server errors
 */
export const ServerErrorRecovery: React.FC<{
  error: string;
  onRetry: () => Promise<void>;
  onDismiss?: () => void;
  className?: string;
}> = ({ error, onRetry, onDismiss, className }) => {
  return (
    <ErrorRecovery
      error={error}
      type="server"
      onRetry={onRetry}
      onDismiss={onDismiss}
      showRetryButton={true}
      maxRetries={2}
      className={className}
    />
  );
};

/**
 * Validation Error Recovery
 * Shows retry button for validation errors
 */
export const ValidationErrorRecovery: React.FC<{
  error: string;
  onRetry: () => Promise<void>;
  onDismiss?: () => void;
  className?: string;
}> = ({ error, onRetry, onDismiss, className }) => {
  return (
    <ErrorRecovery
      error={error}
      type="validation"
      onRetry={onRetry}
      onDismiss={onDismiss}
      showRetryButton={true}
      maxRetries={1}
      className={className}
    />
  );
};

/**
 * Fallback Content Component
 * Shows when non-critical content fails to load
 */
export const FallbackContent: React.FC<{
  title: string;
  message: string;
  onRetry?: () => void;
  children?: React.ReactNode;
}> = ({ title, message, onRetry, children }) => {
  return (
    <div className="text-center py-12 px-4">
      <div className="max-w-md mx-auto">
        <Wifi className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
        <p className="text-gray-600 mb-4">{message}</p>

        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </button>
        )}

        {children}
      </div>
    </div>
  );
};

