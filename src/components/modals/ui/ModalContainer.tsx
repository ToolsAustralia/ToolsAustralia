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
      }, 100); // Small delay for keyboard animation
    };

    // Listen for focus events on all inputs within modal
    modalContent.addEventListener("focusin", handleInputFocus);

    return () => {
      modalContent.removeEventListener("focusin", handleInputFocus);
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
        relative bg-white rounded-2xl shadow-2xl w-full mx-auto overflow-y-auto overflow-x-hidden flex flex-col
        ${sizeStyles[size]}
        ${heightStyles[height]}
        ${className}
      `}
        role="document"
        onClick={(e) => e.stopPropagation()}
        style={{
          // Smooth scrolling for better UX
          scrollBehavior: "smooth",
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default ModalContainer;
