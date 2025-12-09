"use client";

import React, { useEffect, useRef } from "react";

interface ModalContainerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "full";
  height?: "auto" | "screen" | "fixed";
  fixedHeight?: string;
  closeOnBackdrop?: boolean;
  className?: string;
  /**
   * Whether to prevent browser back button from navigating away.
   * When true (default), back button will close the modal instead.
   */
  preventBackButton?: boolean;
}

const ModalContainer: React.FC<ModalContainerProps> = ({
  isOpen,
  onClose,
  children,
  size = "lg",
  height = "auto",
  fixedHeight,
  closeOnBackdrop = true,
  className = "",
  preventBackButton = true,
}) => {
  // Track if we've pushed a history state for this modal instance
  const historyStatePushed = useRef(false);
  // Track if back button was pressed (to avoid cleanup issues)
  const backButtonPressed = useRef(false);
  // Track saved scroll position for body scroll prevention
  const savedScrollPosition = useRef<number>(0);
  // Ref to modal content container for scroll handling
  const modalContentRef = useRef<HTMLDivElement>(null);
  // Unique identifier for this modal instance to track history state
  const modalId = useRef<string>(`modal-${Date.now()}-${Math.random()}`);
  // Track if we're currently handling a popstate event to prevent infinite loops
  const isHandlingPopState = useRef(false);

  // Size variants
  const sizeStyles = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "3xl": "max-w-3xl",
    "4xl": "max-w-4xl",
    full: "max-w-full",
  };

  // Height variants
  const heightStyles = {
    auto: "max-h-[95dvh]",
    screen: "h-screen-dvh",
    fixed: fixedHeight || "h-[90dvh]",
  };

  /**
   * Find the scrollable element within the modal
   * This searches for the element with overflow-y-auto (typically ModalContent)
   */
  const findScrollableElement = (container: HTMLElement): HTMLElement | null => {
    // Check if container itself is scrollable
    const style = window.getComputedStyle(container);
    if (style.overflowY === "auto" || style.overflowY === "scroll") {
      return container;
    }

    // Search for scrollable child element
    const scrollableChild = container.querySelector(
      '[class*="overflow-y-auto"], [class*="overflow-y-scroll"]'
    ) as HTMLElement;
    if (scrollableChild) {
      const childStyle = window.getComputedStyle(scrollableChild);
      if (childStyle.overflowY === "auto" || childStyle.overflowY === "scroll") {
        return scrollableChild;
      }
    }

    // Fallback: return container if no scrollable child found
    return container;
  };

  /**
   * Handle input focus to ensure smooth scrolling into view
   * When an input is focused, scroll it into view smoothly
   */
  useEffect(() => {
    if (!isOpen || !modalContentRef.current) return;

    const modalContainer = modalContentRef.current;

    /**
     * Handle focus events on input elements
     * Scrolls the focused input into view with smooth behavior
     */
    const handleInputFocus = (event: FocusEvent) => {
      const target = event.target as HTMLElement;

      // Only handle input, textarea, and select elements
      if (!target || !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }

      // Small delay to allow keyboard animation to start
      setTimeout(() => {
        // Use scrollIntoView with smooth behavior and block: 'center'
        // This ensures the input is centered in the visible area
        target.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
      }, 100); // Small delay for keyboard animation
    };

    // Listen for focus events on all inputs within modal
    modalContainer.addEventListener("focusin", handleInputFocus);

    return () => {
      modalContainer.removeEventListener("focusin", handleInputFocus);
    };
  }, [isOpen]);

  /**
   * Prevent body scroll and handle modal scroll boundaries
   * This ensures that when modal reaches top/bottom, body doesn't scroll
   */
  useEffect(() => {
    if (!isOpen || !modalContentRef.current) return;

    const modalContainer = modalContentRef.current;
    const scrollableElement = findScrollableElement(modalContainer);

    if (!scrollableElement) return;

    /**
     * Prevent scroll propagation when modal is at boundaries
     * This stops the body from scrolling when user tries to scroll past modal limits
     */
    const handleWheel = (e: WheelEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = scrollableElement;
      const isAtTop = scrollTop === 0;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;

      // If at top and scrolling up, or at bottom and scrolling down, prevent default
      if ((isAtTop && e.deltaY < 0) || (isAtBottom && e.deltaY > 0)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    /**
     * Prevent touch scroll propagation when modal is at boundaries
     * This is crucial for mobile devices
     */
    let touchStartY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!scrollableElement) return;

      const touchY = e.touches[0].clientY;
      const deltaY = touchStartY - touchY;
      const { scrollTop, scrollHeight, clientHeight } = scrollableElement;

      const isAtTop = scrollTop === 0;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;

      // If at top and trying to scroll up, or at bottom and trying to scroll down, prevent
      if ((isAtTop && deltaY < 0) || (isAtBottom && deltaY > 0)) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    // Add event listeners to the scrollable element
    scrollableElement.addEventListener("wheel", handleWheel, { passive: false });
    scrollableElement.addEventListener("touchstart", handleTouchStart, { passive: true });
    scrollableElement.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      scrollableElement.removeEventListener("wheel", handleWheel);
      scrollableElement.removeEventListener("touchstart", handleTouchStart);
      scrollableElement.removeEventListener("touchmove", handleTouchMove);
    };
  }, [isOpen]);

  /**
   * Handle browser back button press
   * This prevents accidental navigation when modal is open on mobile devices
   *
   * Works in:
   * - Regular mobile browsers (Chrome, Safari, Firefox, etc.)
   * - In-app browsers (Facebook, Instagram, Twitter, LinkedIn, etc.)
   * - WebViews and embedded browsers
   *
   * Strategy:
   * 1. When modal opens, push a history state with a unique identifier
   * 2. When back button is pressed, popstate event fires
   * 3. Immediately push the state back to prevent navigation
   * 4. Close the modal
   * 5. Clean up history state when modal closes normally
   *
   * Uses standard Web APIs (popstate, pushState, replaceState) that are
   * supported across all modern browsers and WebView environments.
   */
  useEffect(() => {
    if (!isOpen || !preventBackButton) {
      // Reset flags when modal is closed or preventBackButton is disabled
      historyStatePushed.current = false;
      backButtonPressed.current = false;
      isHandlingPopState.current = false;
      return;
    }

    // Generate a unique identifier for this modal instance
    modalId.current = `modal-${Date.now()}-${Math.random()}`;

    // Push a history state when modal opens to intercept back button
    // This creates a history entry that we can listen for
    // Use a unique identifier to track this specific modal instance
    // Preserve Next.js internal state if it exists to avoid conflicts
    const currentState = window.history.state || {};
    const historyState = {
      ...currentState, // Preserve existing state (including Next.js internal state)
      modalOpen: true,
      modalId: modalId.current,
      timestamp: Date.now(),
    };

    // Use replaceState if we're already on a modal state (prevents history stack buildup)
    // Otherwise use pushState to create a new entry
    if (currentState?.modalOpen) {
      window.history.replaceState(historyState, "");
    } else {
      window.history.pushState(historyState, "");
    }

    historyStatePushed.current = true;
    backButtonPressed.current = false;
    isHandlingPopState.current = false;

    /**
     * Handle popstate event (triggered by back button)
     * When user presses back button, prevent navigation and close modal instead
     */
    const handlePopState = (event: PopStateEvent) => {
      // Prevent infinite loops - if we're already handling a popstate, ignore it
      if (isHandlingPopState.current) {
        return;
      }

      // Check if this popstate is for our modal
      // If the state is null or doesn't have our modalId, it might be a different navigation
      const currentState = event.state;
      const isOurModalState =
        currentState?.modalId === modalId.current ||
        (historyStatePushed.current && (!currentState || !currentState.modalOpen));

      if (isOurModalState && historyStatePushed.current) {
        // Mark that we're handling this popstate to prevent infinite loops
        isHandlingPopState.current = true;

        // Mark that back button was pressed
        backButtonPressed.current = true;

        try {
          // Immediately push the state back to prevent navigation
          // This must happen synchronously to prevent the browser from navigating away
          // Preserve Next.js internal state from the event state (the state we're navigating to)
          // This ensures Next.js router stays in sync
          const targetState = event.state || {};
          const newHistoryState = {
            ...targetState, // Preserve state from event (including Next.js internal state)
            modalOpen: true,
            modalId: modalId.current,
            timestamp: Date.now(),
            preventNavigation: true,
          };

          // Push state back immediately (synchronously) to prevent navigation
          window.history.pushState(newHistoryState, "");
          historyStatePushed.current = true;

          // Close the modal after preventing navigation
          // Use setTimeout to ensure this happens after the current execution context
          // This allows the history state to be properly set
          setTimeout(() => {
            isHandlingPopState.current = false;
            onClose();
          }, 0);
        } catch (error) {
          // If history manipulation fails, just close the modal
          console.warn("Could not prevent navigation on back button:", error);
          isHandlingPopState.current = false;
          onClose();
        }
      }
    };

    // Listen for back button press
    // Use capture phase to ensure we handle it before other listeners
    window.addEventListener("popstate", handlePopState);

    // Cleanup: Remove event listener and history state if modal closes normally
    return () => {
      window.removeEventListener("popstate", handlePopState);

      // If modal closes normally (not via back button), remove the history state we added
      // Only clean up if back button wasn't pressed (which already popped the state)
      if (historyStatePushed.current && !backButtonPressed.current && !isHandlingPopState.current) {
        // Check if current state is the one we pushed
        const currentState = window.history.state;
        if (currentState?.modalId === modalId.current || currentState?.modalOpen) {
          // Remove our modal properties but preserve Next.js internal state
          try {
            // Create a new state without our modal properties
            // Preserve Next.js internal properties (__NA, __PRIVATE_NEXTJS_INTERNALS_TREE, etc.)
            const cleanedState: Record<string, unknown> = {};

            // Preserve Next.js internal state properties
            if (currentState?.__NA !== undefined) cleanedState.__NA = currentState.__NA;
            if (currentState?._N !== undefined) cleanedState._N = currentState._N;
            if (currentState?.__PRIVATE_NEXTJS_INTERNALS_TREE !== undefined) {
              cleanedState.__PRIVATE_NEXTJS_INTERNALS_TREE = currentState.__PRIVATE_NEXTJS_INTERNALS_TREE;
            }

            // Replace state with cleaned version (or null if no Next.js state to preserve)
            const finalState = Object.keys(cleanedState).length > 0 ? cleanedState : null;
            window.history.replaceState(finalState, "");
          } catch (error) {
            // If history manipulation fails, just replace the state
            // This can happen in some edge cases with Next.js router
            console.warn("Could not clean up modal history state:", error);
            try {
              window.history.replaceState(null, "");
            } catch (e) {
              // If even this fails, just log and continue
              console.warn("Failed to replace history state:", e);
            }
          }
        }
        historyStatePushed.current = false;
      }

      // Reset flags for next time
      backButtonPressed.current = false;
      isHandlingPopState.current = false;
    };
  }, [isOpen, preventBackButton, onClose]);

  /**
   * Prevent body scrolling when modal is open
   * Saves and restores scroll position to prevent visual jump
   */
  useEffect(() => {
    if (!isOpen) return;

    // Save current scroll position before locking
    savedScrollPosition.current = window.scrollY;

    // Lock body scroll and maintain visual position
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${savedScrollPosition.current}px`;
    document.body.style.width = "100%";

    // Cleanup: Restore body scroll and position when modal closes
    return () => {
      // Restore body styles
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";

      // Restore scroll position
      window.scrollTo(0, savedScrollPosition.current);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-2"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop with touch-action to prevent scrolling on mobile */}
      <div
        className="absolute inset-0 bg-black/50 touch-none"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
        style={{ touchAction: "none" }}
      />

      {/* Modal */}
      <div
        ref={modalContentRef}
        className={`
        relative bg-white rounded-2xl shadow-2xl w-full mx-auto overflow-hidden flex flex-col
        ${sizeStyles[size]}
        ${heightStyles[height]}
        ${className}
      `}
        role="document"
        onClick={(e) => e.stopPropagation()}
        style={{
          // Ensure proper height constraint for flex children
          minHeight: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default ModalContainer;
