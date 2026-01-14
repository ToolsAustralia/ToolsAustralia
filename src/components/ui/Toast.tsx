"use client";

/**
 * Enhanced Toast Notification System
 *
 * Features:
 * - Centralized toast management via ToastProvider
 * - Automatic stacking and queue management
 * - Auto-dismiss with configurable duration
 * - Multiple toast variants (success, error, warning, info)
 * - Smooth animations and transitions
 * - Mobile-responsive design
 *
 * Usage:
 * 1. Wrap your app with <ToastProvider>
 * 2. Use the useToast() hook anywhere in your components
 * 3. Call showToast() to display notifications
 *
 * @example
 * ```tsx
 * const { showToast } = useToast();
 *
 * showToast({
 *   type: "success",
 *   title: "Success!",
 *   message: "Your action completed successfully",
 *   duration: 5000
 * });
 * ```
 */

import React, { useState, useEffect, useContext, createContext, useCallback } from "react";
import { CheckCircle, AlertCircle, XCircle, Info, X, Bug } from "lucide-react";
import { ErrorContext } from "@/types/error-reporting";

export interface ToastProps {
  id?: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message?: string;
  duration?: number; // Auto-dismiss duration in milliseconds (default: 5000, set to 0 for no auto-dismiss)
  action?: {
    label: string;
    onClick: () => void;
  };
  onClose?: () => void;
  // Error reporting features
  reportable?: boolean; // Whether this error can be reported
  errorContext?: ErrorContext; // Error context for reporting
  onReportProblem?: (errorContext: ErrorContext) => void; // Callback to open report modal
}

interface ToastState extends ToastProps {
  id: string;
  visible: boolean;
}

// Toast Context interface
interface ToastContextType {
  showToast: (toast: Omit<ToastProps, "id">) => void;
  hideToast: (id: string) => void;
  clearAllToasts: () => void;
}

// Toast Context for managing toasts globally
export const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
  hideToast: () => {},
  clearAllToasts: () => {},
});

/**
 * Individual Toast Component
 * Renders a single toast notification with animations and auto-dismiss functionality
 */
const Toast: React.FC<ToastProps & { onRemove: () => void; index: number }> = ({
  type,
  title,
  message,
  duration = 8000, // Increased default duration from 5s to 8s
  action,
  onRemove,
  index,
  reportable = false,
  errorContext,
  onReportProblem,
}) => {
  const [visible, setVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [remainingTime, setRemainingTime] = useState(duration);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  // Swipe-to-dismiss state
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [swipeDistance, setSwipeDistance] = useState(0);
  const minSwipeDistance = 100; // Minimum distance in pixels to trigger swipe

  useEffect(() => {
    // Show toast with animation after a slight delay
    const showTimer = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(showTimer);
  }, []);

  useEffect(() => {
    if (duration <= 0 || !visible) return;

    // If hovering, don't start/continue the timer
    if (isHovered) {
      return;
    }

    // Calculate time to wait
    const timeToWait = remainingTime > 0 ? remainingTime : duration;

    const startTime = Date.now();
    const hideTimer = setTimeout(() => {
      setVisible(false);
      setTimeout(onRemove, 300); // Wait for exit animation to complete
    }, timeToWait);

    return () => {
      clearTimeout(hideTimer);
      // Calculate remaining time when effect cleans up
      if (isHovered) {
        const elapsed = Date.now() - startTime;
        setRemainingTime((prev) => Math.max(0, prev - elapsed));
      }
    };
  }, [duration, visible, isHovered, onRemove, remainingTime]);

  // Handle pause/resume logic separately
  useEffect(() => {
    if (isHovered && pausedAt === null) {
      // Start pause
      setPausedAt(Date.now());
    } else if (!isHovered && pausedAt !== null) {
      // Resume from pause
      const pauseDuration = Date.now() - pausedAt;
      setRemainingTime((prev) => Math.max(0, prev - pauseDuration));
      setPausedAt(null);
    }
  }, [isHovered, pausedAt]);

  /**
   * Get icon based on toast type
   */
  const getIcon = () => {
    switch (type) {
      case "success":
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case "error":
        return <XCircle className="w-5 h-5 text-red-600" />;
      case "warning":
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case "info":
        return <Info className="w-5 h-5 text-blue-600" />;
      default:
        return <CheckCircle className="w-5 h-5 text-green-600" />;
    }
  };

  /**
   * Get background colors and styles based on toast type
   */
  const getStyles = () => {
    switch (type) {
      case "success":
        return {
          bg: "bg-white",
          border: "border-green-200",
          shadow: "shadow-lg shadow-green-100",
          iconBg: "bg-green-100",
        };
      case "error":
        return {
          bg: "bg-white",
          border: "border-red-200",
          shadow: "shadow-lg shadow-red-100",
          iconBg: "bg-red-100",
        };
      case "warning":
        return {
          bg: "bg-white",
          border: "border-yellow-200",
          shadow: "shadow-lg shadow-yellow-100",
          iconBg: "bg-yellow-100",
        };
      case "info":
        return {
          bg: "bg-white",
          border: "border-blue-200",
          shadow: "shadow-lg shadow-blue-100",
          iconBg: "bg-blue-100",
        };
      default:
        return {
          bg: "bg-white",
          border: "border-green-200",
          shadow: "shadow-lg shadow-green-100",
          iconBg: "bg-green-100",
        };
    }
  };

  const styles = getStyles();

  const handleClose = () => {
    setVisible(false);
    setTimeout(onRemove, 300);
  };

  // Swipe-to-dismiss handlers
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null); // Reset touch end
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const currentTouch = e.targetTouches[0].clientX;
    const distance = currentTouch - touchStart;
    setSwipeDistance(distance);
    setTouchEnd(currentTouch);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd; // Positive = swipe left (dismiss)

    // If swipe right (negative distance) exceeds threshold, dismiss toast
    if (distance > minSwipeDistance) {
      handleClose();
    }

    // Reset swipe state
    setTouchStart(null);
    setTouchEnd(null);
    setSwipeDistance(0);
  };

  // Calculate transform for swipe animation
  const swipeTransform = swipeDistance > 0 ? Math.min(swipeDistance, 200) : 0;

  return (
    <div
      className={`max-w-[calc(100vw-1rem)] sm:max-w-sm w-full transform transition-all duration-300 ease-in-out ${
        visible ? "translate-x-0 opacity-100 scale-100" : "translate-x-full opacity-0 scale-95"
      }`}
      style={{
        marginTop: index * 4 + "px", // Stack toasts with compact spacing on mobile
        transform: swipeDistance > 0 ? `translateX(${swipeTransform}px)` : undefined,
        opacity: swipeDistance > 0 ? Math.max(0.3, 1 - swipeDistance / 200) : undefined,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        className={`${styles.bg} ${styles.border} ${styles.shadow} border-2 rounded-lg sm:rounded-xl p-2 sm:p-4 backdrop-blur-sm`}
      >
        <div className="flex items-start gap-2 sm:gap-3">
          {/* Icon with background */}
          <div className={`flex-shrink-0 ${styles.iconBg} rounded-md sm:rounded-lg p-1.5 sm:p-2`}>{getIcon()}</div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h4 className="text-xs sm:text-base font-semibold text-gray-900 leading-tight">{title}</h4>
            {message && (
              <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-gray-600 leading-snug sm:leading-relaxed">
                {message}
              </p>
            )}

            {/* Optional Action Button */}
            {action && (
              <button
                onClick={() => {
                  action.onClick();
                  handleClose();
                }}
                className="mt-1 sm:mt-2 text-xs sm:text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                {action.label}
              </button>
            )}

            {/* Report Problem Button (only for error toasts with reportable=true) */}
            {type === "error" && reportable && errorContext && onReportProblem && (
              <button
                onClick={() => {
                  onReportProblem(errorContext);
                  // Don't close toast when reporting - let user see the report was triggered
                }}
                className="mt-1 sm:mt-2 flex items-center gap-1 text-xs sm:text-sm font-medium text-red-600 hover:text-red-800 transition-colors"
              >
                <Bug className="w-3 h-3 sm:w-4 sm:h-4" />
                Report Problem
              </button>
            )}
          </div>

          {/* Close Button - Increased size on mobile for easier tapping */}
          <button
            onClick={handleClose}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md sm:rounded-lg transition-all p-1.5 sm:p-1 -m-0.5 sm:-m-1"
            aria-label="Close toast"
          >
            <X className="w-5 h-5 sm:w-4 sm:h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Toast Container Component
 * Renders all active toasts in a stacked layout at the top-right corner
 *
 * Note: onRemove is a client-side callback (not a Server Action) since this
 * is a "use client" component. The linter warning can be safely ignored.
 */
export const ToastContainer: React.FC<{
  toasts: ToastState[];
  onRemove: (id: string) => void;
  onReportProblem?: (errorContext: ErrorContext) => void;
}> = ({ toasts, onRemove, onReportProblem }) => {
  // Limit maximum visible toasts to prevent overflow
  const MAX_VISIBLE_TOASTS = 5;
  const visibleToasts = toasts.slice(0, MAX_VISIBLE_TOASTS);

  return (
    <div className="fixed top-1 right-1 sm:top-4 sm:right-4 z-[9999] pointer-events-none max-w-[calc(100vw-0.5rem)] sm:max-w-md">
      <div className="flex flex-col gap-1 sm:gap-2 pointer-events-auto">
        {visibleToasts.map((toast, index) => (
          <Toast
            key={toast.id}
            {...toast}
            index={index}
            onRemove={() => onRemove(toast.id)}
            onReportProblem={onReportProblem}
          />
        ))}
      </div>
    </div>
  );
};

/**
 * Toast Provider Component
 * Wraps the application to provide global toast functionality
 *
 * @example
 * ```tsx
 * // In your root layout or App component
 * <ToastProvider>
 *   <YourAppContent />
 * </ToastProvider>
 * ```
 */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportErrorContext, setReportErrorContext] = useState<ErrorContext | null>(null);

  /**
   * Show a new toast notification
   * Automatically generates a unique ID and adds it to the queue
   */
  const showToast = useCallback((toast: Omit<ToastProps, "id">) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setToasts((prev) => [...prev, { ...toast, id, visible: false }]);
  }, []);

  /**
   * Hide a specific toast by ID
   */
  const hideToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  /**
   * Clear all toasts
   */
  const clearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  /**
   * Handle report problem button click
   * Opens the report problem modal with the error context
   */
  const handleReportProblem = useCallback((errorContext: ErrorContext) => {
    setReportErrorContext(errorContext);
    setReportModalOpen(true);
  }, []);

  /**
   * Close report problem modal
   */
  const handleCloseReportModal = useCallback(() => {
    setReportModalOpen(false);
    setReportErrorContext(null);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, hideToast, clearAllToasts }}>
      {children}
      <ToastContainer
        toasts={toasts}
        onRemove={hideToast}
        onReportProblem={handleReportProblem}
      />
      {/* Report Problem Modal */}
      {reportErrorContext && (
        <ReportProblemModalWrapper
          isOpen={reportModalOpen}
          onClose={handleCloseReportModal}
          errorContext={reportErrorContext}
        />
      )}
    </ToastContext.Provider>
  );
};

/**
 * Lazy-loaded Report Problem Modal wrapper
 * This prevents the modal from being included in the initial bundle
 */
const ReportProblemModalWrapper: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  errorContext: ErrorContext;
}> = ({ isOpen, onClose, errorContext }) => {
  const [ModalComponent, setModalComponent] = useState<React.ComponentType<{ isOpen: boolean; onClose: () => void; errorContext: ErrorContext }> | null>(null);

  useEffect(() => {
    if (isOpen && !ModalComponent) {
      // Dynamically import the modal component
      import("@/components/modals/ReportProblemModal").then((mod) => {
        setModalComponent(() => mod.default);
      });
    }
  }, [isOpen, ModalComponent]);

  if (!ModalComponent) return null;

  return <ModalComponent isOpen={isOpen} onClose={onClose} errorContext={errorContext} />;
};

/**
 * Hook for using toasts
 * Provides access to toast functions from anywhere in the component tree
 *
 * @returns {ToastContextType} Toast functions (showToast, hideToast, clearAllToasts)
 *
 * @example
 * ```tsx
 * const { showToast } = useToast();
 *
 * showToast({
 *   type: "success",
 *   title: "Saved!",
 *   message: "Your changes have been saved successfully",
 *   duration: 5000
 * });
 * ```
 */
export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }

  return context;
};

export default Toast;
