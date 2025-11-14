"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { WifiOff, AlertCircle, RefreshCw } from "lucide-react";
import { ApiError } from "@/lib/queries";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: ApiError, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: ApiError | null;
  errorInfo: ErrorInfo | null;
}

export class ApiErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Only catch API errors
    if (error instanceof ApiError) {
      return {
        hasError: true,
        error,
        errorInfo: null,
      };
    }

    // Re-throw non-API errors
    throw error;
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (error instanceof ApiError) {
      this.setState({
        error,
        errorInfo,
      });

      // Log error to console in development
      if (process.env.NODE_ENV === "development") {
        console.error("ApiErrorBoundary caught an API error:", error, errorInfo);
      }

      // Call custom error handler if provided
      if (this.props.onError) {
        this.props.onError(error, errorInfo);
      }
    }
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  getErrorMessage = (error: ApiError): string => {
    switch (error.status) {
      case 0:
        return "Network connection error. Please check your internet connection.";
      case 401:
        return "You need to log in to access this content.";
      case 403:
        return "You don't have permission to access this content.";
      case 404:
        return "The requested content was not found.";
      case 429:
        return "Too many requests. Please wait a moment and try again.";
      case 500:
        return "Server error. Please try again later.";
      default:
        return error.message || "An unexpected error occurred.";
    }
  };

  getErrorIcon = (error: ApiError) => {
    if (error.status === 0) {
      return <WifiOff className="h-12 w-12 text-red-500" />;
    }
    return <AlertCircle className="h-12 w-12 text-red-500" />;
  };

  render() {
    if (this.state.hasError && this.state.error) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error } = this.state;
      const isNetworkError = error.status === 0;

      return (
        <div className="min-h-[200px] flex items-center justify-center bg-gray-50 px-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
            <div className="flex justify-center mb-4">{this.getErrorIcon(error)}</div>

            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              {isNetworkError ? "Connection Error" : "API Error"}
            </h2>

            <p className="text-gray-600 mb-6">{this.getErrorMessage(error)}</p>

            {process.env.NODE_ENV === "development" && (
              <div className="mb-6 p-4 bg-red-50 rounded-lg text-left">
                <h3 className="text-sm font-medium text-red-800 mb-2">Error Details:</h3>
                <div className="text-xs text-red-700 space-y-1">
                  <div>
                    <strong>Status:</strong> {error.status}
                  </div>
                  <div>
                    <strong>Message:</strong> {error.message}
                  </div>
                  {error.data != null && (
                    <div>
                      <strong>Data:</strong> Available in console
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Try Again
              </button>

              {error.status === 401 && (
                <button
                  onClick={() => (window.location.href = "/login")}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Log In
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook for handling API errors in functional components
export function useApiErrorBoundary() {
  const [error, setError] = React.useState<ApiError | null>(null);

  const resetError = React.useCallback(() => {
    setError(null);
  }, []);

  const captureError = React.useCallback((error: ApiError) => {
    setError(error);
  }, []);

  React.useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  return { captureError, resetError };
}
