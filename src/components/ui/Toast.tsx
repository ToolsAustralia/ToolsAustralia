"use client";

import { usePathname } from "next/navigation";

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
import { Z_INDEX } from "@/constants/z-index";
import { TOAST_TRANSITION_MS } from "@/utils/motion/modalPresets";
import { cn } from "@/utils/cn";

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
const Toast: React.FC<
  ToastProps & { onRemove: () => void; index: number; bottomLeft?: boolean }
> = ({
  type,
  title,
  message,
  duration = 8000, // Increased default duration from 5s to 8s
  action,
  onRemove,
  index,
  /** Set by the container from the route — decides which way the toast enters. */
  bottomLeft = false,
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
      setTimeout(onRemove, TOAST_TRANSITION_MS); // Wait for exit animation to complete
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
        return <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />;
      case "error":
        return <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />;
      case "warning":
        return <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />;
      case "info":
        return <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
      default:
        return <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />;
    }
  };

  /**
   * Get background colors and styles based on toast type
   */
  const getStyles = () => {
    switch (type) {
      case "success":
        return {
          bg: "bg-white dark:bg-neutral-900/95",
          border: "border-green-200 dark:border-green-800/60",
          shadow:
            "shadow-lg shadow-green-100 dark:shadow-xl dark:shadow-black/40 dark:ring-1 dark:ring-green-900/30",
          iconBg: "bg-green-100 dark:bg-green-950/50",
        };
      case "error":
        return {
          bg: "bg-white dark:bg-neutral-900/95",
          border: "border-red-200 dark:border-red-800/55",
          shadow:
            "shadow-lg shadow-red-100 dark:shadow-xl dark:shadow-black/40 dark:ring-1 dark:ring-red-900/25",
          iconBg: "bg-red-100 dark:bg-red-950/45",
        };
      case "warning":
        return {
          bg: "bg-white dark:bg-neutral-900/95",
          border: "border-yellow-200 dark:border-yellow-800/50",
          shadow:
            "shadow-lg shadow-yellow-100 dark:shadow-xl dark:shadow-black/40 dark:ring-1 dark:ring-yellow-900/20",
          iconBg: "bg-yellow-100 dark:bg-yellow-950/45",
        };
      case "info":
        return {
          bg: "bg-white dark:bg-neutral-900/95",
          border: "border-blue-200 dark:border-blue-800/55",
          shadow:
            "shadow-lg shadow-blue-100 dark:shadow-xl dark:shadow-black/40 dark:ring-1 dark:ring-blue-900/25",
          iconBg: "bg-blue-100 dark:bg-blue-950/45",
        };
      default:
        return {
          bg: "bg-white dark:bg-neutral-900/95",
          border: "border-green-200 dark:border-green-800/60",
          shadow:
            "shadow-lg shadow-green-100 dark:shadow-xl dark:shadow-black/40 dark:ring-1 dark:ring-green-900/30",
          iconBg: "bg-green-100 dark:bg-green-950/50",
        };
    }
  };

  const styles = getStyles();

  const handleClose = () => {
    setVisible(false);
    setTimeout(onRemove, TOAST_TRANSITION_MS);
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
      /*
        The entrance follows the corner. A bottom-anchored toast RISES into place;
        a top-right one slides in from the right as it always has. Playing the
        right-hand slide from the bottom left reads as the toast crossing the page
        to get where it is going.
      */
      className={`w-full max-w-[calc(100vw-1rem)] transform transition-all ease-out sm:max-w-sm ${
        visible
          ? "translate-x-0 translate-y-0 opacity-100 scale-100"
          : bottomLeft
            ? "translate-y-3 opacity-0 scale-95"
            : "translate-x-full opacity-0 scale-95"
      }`}
      style={{
        transitionDuration: `${TOAST_TRANSITION_MS}ms`,
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
        className={cn(styles.bg, styles.border, styles.shadow, "border-2 rounded-lg sm:rounded-xl p-2 sm:p-4 backdrop-blur-sm")}
      >
        <div className="flex items-start gap-2 sm:gap-3">
          {/* Icon with background */}
          <div className={cn("flex-shrink-0", styles.iconBg, "rounded-md sm:rounded-lg p-1.5 sm:p-2")}>{getIcon()}</div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h4 className="text-xs sm:text-base font-semibold text-gray-900 dark:text-neutral-100 leading-tight">{title}</h4>
            {message && (
              <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-gray-600 dark:text-neutral-300 leading-snug sm:leading-relaxed">
                {message}
              </p>
            )}

            {/* Report Problem Button (only for error toasts with reportable=true) */}
            {type === "error" && reportable && errorContext && onReportProblem && (
              <button
                onClick={() => {
                  onReportProblem(errorContext);
                  // Don't close toast when reporting - let user see the report was triggered
                }}
                className="mt-1 sm:mt-2 flex items-center gap-1 text-xs sm:text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors"
              >
                <Bug className="w-3 h-3 sm:w-4 sm:h-4" />
                Report Problem
              </button>
            )}
          </div>

          {/*
            THE ACTION IS A BUTTON, ON THE RIGHT.

            It was a blue text link stacked under the message, where it read as part
            of the copy rather than the thing to press — and on the add-to-cart toast
            that link IS the point: adding used to be a dead end and this is the route
            out of it. A solid control on the right is the difference between a
            notification and an offer.

            Outside the content column so a long product name cannot push it out of
            reach, and shrink-0 so it never compresses.
          */}
          {action && (
            <button
              onClick={() => {
                action.onClick();
                handleClose();
              }}
              className="ml-auto mt-0.5 inline-flex h-8 shrink-0 items-center rounded-lg bg-red-600 px-3 text-xs font-bold text-white transition-colors hover:bg-red-700 sm:h-[34px] sm:px-4 sm:text-[13px]"
            >
              {action.label}
            </button>
          )}

          {/* Close Button - Increased size on mobile for easier tapping */}
          <button
            onClick={handleClose}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:text-neutral-500 dark:hover:text-neutral-200 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-md sm:rounded-lg transition-all p-1.5 sm:p-1 -m-0.5 sm:-m-1"
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
 * Renders all active toasts in a stack.
 *
 * TOP RIGHT everywhere, BOTTOM LEFT on the shop.
 *
 * The shop is the one surface whose toast carries an action worth pressing — the
 * add-to-cart "View cart" — so it wants to sit near the goods rather than up by
 * the header. Bottom LEFT rather than right because the bottom right is Cobber's
 * corner, and a toast there lands on top of the support bubble.
 *
 * Everywhere else keeps the top-right position it has always had: those toasts are
 * mostly errors and confirmations, they are read and dismissed, and moving every
 * one of them to chase a shop interaction would be a site-wide change to fix a
 * single page.
 *
 * When bottom-anchored the newest sits closest to the edge (`flex-col-reverse`) —
 * the eye starts at the edge, so the most recent message should be the first it
 * reaches. Top-anchored keeps the original order for the same reason.
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

  // Route-scoped, not a prop: the provider is mounted once at the app root, so a
  // prop would have to be threaded from a layout that knows nothing about which
  // page is rendering. Covers /shop and every product page beneath it.
  const pathname = usePathname();
  const bottomLeft = pathname?.startsWith("/shop") ?? false;

  return (
    <div
      className={cn(
        "pointer-events-none fixed",
        bottomLeft
          ? "inset-x-3 bottom-3 sm:inset-x-auto sm:bottom-6 sm:left-6 sm:max-w-md"
          : "right-1 top-1 max-w-[calc(100vw-0.5rem)] sm:right-4 sm:top-4 sm:max-w-md"
      )}
      style={{ zIndex: Z_INDEX.TOAST_LOADING }}
    >
      <div
        className={cn(
          "pointer-events-auto flex gap-1 sm:gap-2",
          bottomLeft ? "flex-col-reverse" : "flex-col"
        )}
      >
        {visibleToasts.map((toast, index) => (
          <Toast
            key={toast.id}
            {...toast}
            index={index}
            bottomLeft={bottomLeft}
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
