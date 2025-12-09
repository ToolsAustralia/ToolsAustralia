"use client";

import React, { useEffect, useRef, useState } from "react";

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
  // Track visual viewport height for keyboard handling
  const [visualViewportHeight, setVisualViewportHeight] = useState<number | null>(null);
  // Track if keyboard is visible
  const keyboardVisible = useRef(false);

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

  // Height variants - adjust for keyboard when visible
  const getHeightStyles = () => {
    const baseHeight =
      height === "auto" ? "max-h-[95dvh]" : height === "screen" ? "h-screen-dvh" : fixedHeight || "h-[90dvh]";

    // When keyboard is visible, use visual viewport height instead
    if (visualViewportHeight && keyboardVisible.current) {
      return `max-h-[${visualViewportHeight}px]`;
    }

    return baseHeight;
  };

  /**
   * Handle Visual Viewport changes (keyboard show/hide on mobile)
   * This ensures smooth scrolling when keyboard appears/disappears
   */
  useEffect(() => {
    if (!isOpen) return;

    // Check if Visual Viewport API is available (modern browsers)
    if (typeof window !== "undefined" && window.visualViewport) {
      const handleViewportResize = () => {
        const viewport = window.visualViewport;
        if (!viewport) return;

        const viewportHeight = viewport.height;
        const windowHeight = window.innerHeight;

        // Keyboard is visible if viewport is significantly smaller than window
        // Threshold: 150px difference (accounts for browser UI)
        const isKeyboardVisible = windowHeight - viewportHeight > 150;

        keyboardVisible.current = isKeyboardVisible;

        if (isKeyboardVisible) {
          setVisualViewportHeight(viewportHeight);
        } else {
          setVisualViewportHeight(null);
        }
      };

      // Listen for viewport resize (keyboard show/hide)
      window.visualViewport.addEventListener("resize", handleViewportResize);
      window.visualViewport.addEventListener("scroll", handleViewportResize);

      // Initial check
      handleViewportResize();

      return () => {
        window.visualViewport?.removeEventListener("resize", handleViewportResize);
        window.visualViewport?.removeEventListener("scroll", handleViewportResize);
      };
    } else {
      // Fallback for browsers without Visual Viewport API
      // Use window resize as fallback
      const handleResize = () => {
        const windowHeight = window.innerHeight;
        const screenHeight = window.screen.height;

        // Estimate keyboard visibility (less accurate but works)
        const isKeyboardVisible = windowHeight < screenHeight * 0.75;
        keyboardVisible.current = isKeyboardVisible;

        if (isKeyboardVisible) {
          setVisualViewportHeight(windowHeight);
        } else {
          setVisualViewportHeight(null);
        }
      };

      window.addEventListener("resize", handleResize);
      handleResize();

      return () => {
        window.removeEventListener("resize", handleResize);
      };
    }
  }, [isOpen]);

  /**
   * Handle input focus to ensure smooth scrolling into view
   * When an input is focused, scroll it into view smoothly
   */
  useEffect(() => {
    if (!isOpen || !modalContentRef.current) return;

    const modalContent = modalContentRef.current;

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

        // Additional check: if input is still not fully visible after scroll,
        // adjust the scroll position manually
        setTimeout(() => {
          const rect = target.getBoundingClientRect();
          const viewportHeight = window.visualViewport?.height || window.innerHeight;

          // Check if input is cut off at bottom
          if (rect.bottom > viewportHeight - 20) {
            const scrollOffset = rect.bottom - viewportHeight + 40; // 40px padding
            modalContent.scrollBy({
              top: scrollOffset,
              behavior: "smooth",
            });
          }
        }, 100);
      }, 300); // Wait for keyboard animation (typically 250-300ms)
    };

    /**
     * Prevent body scroll when modal reaches scroll boundaries
     * This prevents overscroll from propagating to the body
     */
    const handleModalScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target || target !== modalContent) return;

      const { scrollTop, scrollHeight, clientHeight } = modalContent;
      const isAtTop = scrollTop <= 0;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1; // 1px tolerance

      // If at boundaries, prevent default to stop overscroll
      if ((isAtTop && e.type === "wheel") || (isAtBottom && e.type === "wheel")) {
        // For wheel events, prevent if at boundaries
        const wheelEvent = e as WheelEvent;
        if ((isAtTop && wheelEvent.deltaY < 0) || (isAtBottom && wheelEvent.deltaY > 0)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };

    /**
     * Prevent touch overscroll on mobile
     */
    const handleTouchMove = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (!target || !modalContent.contains(target)) return;

      const { scrollTop, scrollHeight, clientHeight } = modalContent;
      const isAtTop = scrollTop <= 0;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;

      // Get touch direction
      const touch = e.touches[0];
      if (!touch) return;

      // Check if trying to scroll past boundaries
      if (isAtTop && touch.clientY > (e.target as HTMLElement).getBoundingClientRect().top) {
        e.preventDefault();
      }
      if (isAtBottom && touch.clientY < (e.target as HTMLElement).getBoundingClientRect().bottom) {
        e.preventDefault();
      }
    };

    // Listen for focus events on all inputs within modal
    modalContent.addEventListener("focusin", handleInputFocus);
    // Listen for scroll events to prevent overscroll
    modalContent.addEventListener("wheel", handleModalScroll, { passive: false });
    // Listen for touch events to prevent overscroll on mobile
    modalContent.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      modalContent.removeEventListener("focusin", handleInputFocus);
      modalContent.removeEventListener("wheel", handleModalScroll);
      modalContent.removeEventListener("touchmove", handleTouchMove);
    };
  }, [isOpen]);

  /**
   * Handle browser back button press
   * This prevents accidental navigation when modal is open on mobile devices
   */
  useEffect(() => {
    if (!isOpen || !preventBackButton) return;

    // Push a history state when modal opens to intercept back button
    // This creates a history entry that we can listen for
    window.history.pushState({ modalOpen: true }, "");
    historyStatePushed.current = true;

    /**
     * Handle popstate event (triggered by back button)
     * When user presses back button, close modal instead of navigating away
     */
    const handlePopState = () => {
      // Mark that back button was pressed (state was already popped by browser)
      backButtonPressed.current = true;
      historyStatePushed.current = false;
      // Close the modal when back button is pressed
      onClose();
    };

    // Listen for back button press
    window.addEventListener("popstate", handlePopState);

    // Cleanup: Remove event listener and history state if modal closes normally
    return () => {
      window.removeEventListener("popstate", handlePopState);

      // If modal closes normally (not via back button), remove the history state we added
      // Only clean up if back button wasn't pressed (which already popped the state)
      if (historyStatePushed.current && !backButtonPressed.current) {
        // Check if current state is the one we pushed
        if (window.history.state?.modalOpen) {
          // Replace current state to remove our modal state without navigating
          window.history.replaceState(null, "");
        }
        historyStatePushed.current = false;
      }

      // Reset back button flag for next time
      backButtonPressed.current = false;
    };
  }, [isOpen, preventBackButton, onClose]);

  /**
   * Prevent body scrolling when modal is open
   * Saves and restores scroll position to prevent visual jump
   * Re-applies lock when viewport changes (keyboard show/hide)
   */
  useEffect(() => {
    if (!isOpen) return;

    // Save current scroll position before locking
    savedScrollPosition.current = window.scrollY;

    // Lock body scroll and maintain visual position
    const lockBodyScroll = () => {
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${savedScrollPosition.current}px`;
      document.body.style.width = "100%";
      // Prevent overscroll behavior
      document.body.style.overscrollBehavior = "none";
    };

    lockBodyScroll();

    // Re-apply lock when viewport changes (keyboard show/hide)
    const handleViewportChange = () => {
      lockBodyScroll();
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleViewportChange);
      window.visualViewport.addEventListener("scroll", handleViewportChange);
    }

    // Cleanup: Restore body scroll and position when modal closes
    return () => {
      // Remove viewport listeners
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleViewportChange);
        window.visualViewport.removeEventListener("scroll", handleViewportChange);
      }

      // Restore body styles
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.body.style.overscrollBehavior = "";

      // Restore scroll position
      window.scrollTo(0, savedScrollPosition.current);
    };
  }, [isOpen, visualViewportHeight]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-2"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      style={{
        // Use visual viewport height when keyboard is visible
        height: visualViewportHeight && keyboardVisible.current ? `${visualViewportHeight}px` : "100%",
      }}
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
        relative bg-white rounded-2xl shadow-2xl w-full mx-auto overflow-y-auto overflow-x-hidden flex flex-col
        ${sizeStyles[size]}
        ${getHeightStyles()}
        ${className}
      `}
        role="document"
        onClick={(e) => e.stopPropagation()}
        style={{
          // Smooth scrolling for better UX
          scrollBehavior: "smooth",
          // Ensure modal doesn't exceed viewport when keyboard is visible
          maxHeight:
            visualViewportHeight && keyboardVisible.current
              ? `${visualViewportHeight - 16}px` // 16px for padding (8px top + 8px bottom)
              : undefined,
          // Prevent overscroll from propagating to body
          overscrollBehavior: "contain",
          // Prevent pull-to-refresh and overscroll on mobile
          touchAction: "pan-y",
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default ModalContainer;
