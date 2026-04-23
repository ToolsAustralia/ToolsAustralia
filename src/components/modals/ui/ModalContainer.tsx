"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Z_INDEX } from "@/constants/z-index";
import { useHtmlDarkForUi } from "@/hooks/useHtmlDarkForUi";
import {
  backdropVariants,
  dialogNestedPanelVariants,
  dialogPanelVariants,
  MODAL_DURATION_EXIT_S,
  reducedBackdropVariants,
  reducedPanelVariants,
  sheetPanelVariants,
} from "@/utils/motion/modalPresets";
import { getViewportScrollbarWidthPx } from "@/utils/dom/getScrollbarWidth";

export type ModalPresentation = "dialog" | "sheet";

export interface ModalContainerProps {
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
  /**
   * When true, uses a higher z-index so this modal appears above other modals.
   * Use when opening a modal from within another modal (e.g. View User from Revenue Breakdown).
   */
  nested?: boolean;
  /**
   * Highest stacking tier (e.g. confirmations opened on top of nested modals).
   */
  nestedSecondary?: boolean;
  /**
   * `dialog` = centered scale/fade. `sheet` = slide from bottom (e.g. mobile package picker).
   */
  presentation?: ModalPresentation;
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
  nested = false,
  nestedSecondary = false,
  presentation = "dialog",
}) => {
  const isDarkMode = useHtmlDarkForUi();
  const reduceMotion = useReducedMotion();

  const [isLocked, setIsLocked] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setIsLocked(true);
    }
  }, [isOpen]);

  const modalBlocking = isOpen || isLocked;

  const handlePanelAnimationComplete = useCallback(() => {
    if (!isOpen) {
      setIsLocked(false);
    }
  }, [isOpen]);

  // If exit animation never completes (Framer / reduced-motion edge cases), avoid leaving the
  // portal mounted with body scroll-lock stuck indefinitely.
  useEffect(() => {
    if (isOpen || !isLocked) return;
    const fallbackMs = Math.round(MODAL_DURATION_EXIT_S * 1000) + 150;
    const id = window.setTimeout(() => setIsLocked(false), fallbackMs);
    return () => window.clearTimeout(id);
  }, [isOpen, isLocked]);

  // Track if we've pushed a history state for this modal instance
  const historyStatePushed = useRef(false);
  const backButtonPressed = useRef(false);
  const savedScrollPosition = useRef<number>(0);
  const modalContentRef = useRef<HTMLDivElement>(null);
  const modalId = useRef<string>(`modal-${Date.now()}-${Math.random()}`);
  const isHandlingPopState = useRef(false);
  const isInAppBrowser = useRef<boolean | null>(null);

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

  const heightStyles = {
    auto: "max-h-[95dvh]",
    screen: "h-screen-dvh",
    fixed: fixedHeight || "h-[90dvh]",
  };

  const isSheet = presentation === "sheet";

  const backdropV = reduceMotion ? reducedBackdropVariants : backdropVariants;
  const panelV = reduceMotion
    ? reducedPanelVariants
    : isSheet
      ? sheetPanelVariants
      : nested
        ? dialogNestedPanelVariants
        : dialogPanelVariants;

  const resolveZIndex = () => {
    if (nestedSecondary) return Z_INDEX.MODAL_NESTED_SECONDARY;
    if (nested) return Z_INDEX.MODAL_NESTED;
    return Z_INDEX.MODAL_BASE;
  };

  const findScrollableElement = (container: HTMLElement): HTMLElement | null => {
    const style = window.getComputedStyle(container);
    if (style.overflowY === "auto" || style.overflowY === "scroll") {
      return container;
    }

    const scrollableChild = container.querySelector(
      '[class*="overflow-y-auto"], [class*="overflow-y-scroll"]'
    ) as HTMLElement;
    if (scrollableChild) {
      const childStyle = window.getComputedStyle(scrollableChild);
      if (childStyle.overflowY === "auto" || childStyle.overflowY === "scroll") {
        return scrollableChild;
      }
    }

    return container;
  };

  useEffect(() => {
    if (!modalBlocking || !modalContentRef.current) return;

    const modalContainer = modalContentRef.current;

    const handleInputFocus = (event: FocusEvent) => {
      const target = event.target as HTMLElement;

      if (!target || !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }

      setTimeout(() => {
        target.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
      }, 100);
    };

    modalContainer.addEventListener("focusin", handleInputFocus);

    return () => {
      modalContainer.removeEventListener("focusin", handleInputFocus);
    };
  }, [modalBlocking]);

  useEffect(() => {
    if (!modalBlocking || !modalContentRef.current) return;

    const modalContainer = modalContentRef.current;
    const scrollableElement = findScrollableElement(modalContainer);

    if (!scrollableElement) return;

    const isInsideDropdownList = (el: EventTarget | null) =>
      el && (el as Element).closest?.("[data-dropdown-list]");

    const handleWheel = (e: WheelEvent) => {
      if (isInsideDropdownList(e.target)) return;
      const { scrollTop, scrollHeight, clientHeight } = scrollableElement;
      const isAtTop = scrollTop === 0;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;

      if ((isAtTop && e.deltaY < 0) || (isAtBottom && e.deltaY > 0)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    let touchStartY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (isInsideDropdownList(e.target)) return;
      touchStartY = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!scrollableElement) return;
      if (isInsideDropdownList(e.target)) return;

      const touchY = e.touches[0].clientY;
      const deltaY = touchStartY - touchY;
      const { scrollTop, scrollHeight, clientHeight } = scrollableElement;

      const isAtTop = scrollTop === 0;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;

      if ((isAtTop && deltaY < 0) || (isAtBottom && deltaY > 0)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    scrollableElement.addEventListener("wheel", handleWheel, { passive: false });
    scrollableElement.addEventListener("touchstart", handleTouchStart, { passive: true });
    scrollableElement.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      scrollableElement.removeEventListener("wheel", handleWheel);
      scrollableElement.removeEventListener("touchstart", handleTouchStart);
      scrollableElement.removeEventListener("touchmove", handleTouchMove);
    };
  }, [modalBlocking]);

  const detectInAppBrowser = (): boolean => {
    if (isInAppBrowser.current !== null) {
      return isInAppBrowser.current;
    }

    if (typeof window === "undefined") {
      return false;
    }

    const userAgent = window.navigator.userAgent || "";
    const isStandalone = (window.navigator as { standalone?: boolean }).standalone;

    const isFacebook = userAgent.includes("FBAN") || userAgent.includes("FBAV");
    const isInstagram = userAgent.includes("Instagram");
    const isTwitter = userAgent.includes("Twitter");
    const isLinkedIn = userAgent.includes("LinkedInApp");
    const isLine = userAgent.includes("Line");
    const isWeChat = userAgent.includes("MicroMessenger");
    const isWebView = userAgent.includes("wv");

    const referrer = document.referrer || "";
    const fromExternalApp =
      referrer.includes("facebook.com") ||
      referrer.includes("instagram.com") ||
      referrer.includes("twitter.com") ||
      referrer.includes("linkedin.com");

    isInAppBrowser.current =
      isFacebook ||
      isInstagram ||
      isTwitter ||
      isLinkedIn ||
      isLine ||
      isWeChat ||
      isWebView ||
      fromExternalApp ||
      (isStandalone === false && window.history.length <= 1);

    return isInAppBrowser.current;
  };

  useEffect(() => {
    if (!modalBlocking || !preventBackButton) {
      historyStatePushed.current = false;
      backButtonPressed.current = false;
      isHandlingPopState.current = false;
      return;
    }

    const inAppBrowser = detectInAppBrowser();

    modalId.current = `modal-${Date.now()}-${Math.random()}`;

    const currentState = window.history.state || {};
    const historyState = {
      ...currentState,
      modalOpen: true,
      modalId: modalId.current,
      timestamp: Date.now(),
      ...(inAppBrowser && { inAppBrowser: true }),
    };

    if (currentState?.modalOpen) {
      window.history.replaceState(historyState, "");
    } else {
      window.history.pushState(historyState, "");
    }

    historyStatePushed.current = true;
    backButtonPressed.current = false;
    isHandlingPopState.current = false;

    const handlePopState = (event: PopStateEvent) => {
      if (isHandlingPopState.current) {
        return;
      }

      const eventState = event.state;
      const isOurModalState =
        eventState?.modalId === modalId.current ||
        (historyStatePushed.current && (!eventState || !eventState.modalOpen));

      const shouldIntercept = inAppBrowser
        ? historyStatePushed.current
        : isOurModalState && historyStatePushed.current;

      if (shouldIntercept) {
        isHandlingPopState.current = true;

        backButtonPressed.current = true;

        try {
          const targetState = event.state || {};
          const newHistoryState = {
            ...targetState,
            modalOpen: true,
            modalId: modalId.current,
            timestamp: Date.now(),
            preventNavigation: true,
            ...(inAppBrowser && { inAppBrowser: true }),
          };

          window.history.pushState(newHistoryState, "");
          historyStatePushed.current = true;

          setTimeout(() => {
            isHandlingPopState.current = false;
            onClose();
          }, 0);
        } catch (error) {
          console.warn("Could not prevent navigation on back button:", error);
          isHandlingPopState.current = false;
          onClose();
        }
      }
    };

    window.addEventListener("popstate", handlePopState, { capture: true });

    return () => {
      window.removeEventListener("popstate", handlePopState, { capture: true });

      if (historyStatePushed.current && !backButtonPressed.current && !isHandlingPopState.current) {
        const currentHistoryState = window.history.state;
        if (currentHistoryState?.modalId === modalId.current || currentHistoryState?.modalOpen) {
          try {
            const cleanedState: Record<string, unknown> = {};

            if (currentHistoryState?.__NA !== undefined) cleanedState.__NA = currentHistoryState.__NA;
            if (currentHistoryState?._N !== undefined) cleanedState._N = currentHistoryState._N;
            if (currentHistoryState?.__PRIVATE_NEXTJS_INTERNALS_TREE !== undefined) {
              cleanedState.__PRIVATE_NEXTJS_INTERNALS_TREE = currentHistoryState.__PRIVATE_NEXTJS_INTERNALS_TREE;
            }

            const finalState = Object.keys(cleanedState).length > 0 ? cleanedState : null;
            window.history.replaceState(finalState, "");
          } catch (error) {
            console.warn("Could not clean up modal history state:", error);
            try {
              window.history.replaceState(null, "");
            } catch (e) {
              console.warn("Failed to replace history state:", e);
            }
          }
        }
        historyStatePushed.current = false;
      }

      backButtonPressed.current = false;
      isHandlingPopState.current = false;
    };
  }, [modalBlocking, preventBackButton, onClose]);

  useEffect(() => {
    if (!modalBlocking) return;

    const isBodyAlreadyLocked = document.body.style.position === "fixed";

    if (isBodyAlreadyLocked) {
      return () => {};
    }

    savedScrollPosition.current = window.scrollY;

    const html = document.documentElement;
    const prevHtmlScrollbarGutter = html.style.scrollbarGutter;

    // `scrollbar-gutter: stable` (globals.css) keeps an empty lane when the root scrollbar is
    // suppressed — looks like content jumped left with a dead strip on the right. Release gutter
    // while locked, then measure the real scrollbar width before body `fixed` removes it.
    html.style.scrollbarGutter = "auto";
    const scrollbarWidth = getViewportScrollbarWidthPx();

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${savedScrollPosition.current}px`;
    document.body.style.width = "100%";

    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
      html.style.setProperty("--scrollbar-width", `${scrollbarWidth}px`);
      html.setAttribute("data-modal-scroll-lock", "");
    }

    return () => {
      if (document.body.style.position === "fixed") {
        html.style.scrollbarGutter = prevHtmlScrollbarGutter;
        document.body.style.overflow = "";
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.width = "";
        document.body.style.paddingRight = "";
        html.style.removeProperty("--scrollbar-width");
        html.removeAttribute("data-modal-scroll-lock");

        window.scrollTo(0, savedScrollPosition.current);
      }
    };
  }, [modalBlocking]);

  if (!isLocked) return null;

  const modalZIndex = resolveZIndex();

  const outerFlex = isSheet
    ? "items-end justify-center pt-2 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:items-center sm:p-2 sm:pb-2"
    : "items-center justify-center p-2";

  const panelShape = isSheet
    ? `rounded-t-2xl rounded-b-none sm:rounded-2xl sm:rounded-b-2xl w-full ${sizeStyles[size]}`
    : `rounded-2xl w-full ${sizeStyles[size]}`;

  const modalContent = (
    <div
      className={`fixed inset-0 flex ${outerFlex} pointer-events-none`}
      style={{ zIndex: modalZIndex }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <motion.div
        className={`absolute inset-0 bg-black/50 touch-none ${isOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        variants={backdropV}
        initial="closed"
        animate={isOpen ? "open" : "closed"}
        aria-hidden="true"
        style={{ touchAction: "none" }}
        onClick={closeOnBackdrop ? onClose : undefined}
      />

      <motion.div
        ref={modalContentRef}
        className={`
        relative overflow-hidden flex flex-col ${isOpen ? "pointer-events-auto" : "pointer-events-none"} mx-auto
        ${
          isDarkMode
            ? "dark bg-neutral-900 border border-neutral-800 shadow-2xl shadow-black/50"
            : "bg-white border border-gray-200/90 shadow-2xl shadow-gray-900/10"
        }
        ${panelShape}
        ${heightStyles[height]}
        ${className}
      `}
        role="document"
        variants={panelV}
        initial="closed"
        animate={isOpen ? "open" : "closed"}
        onClick={(e) => e.stopPropagation()}
        onAnimationComplete={handlePanelAnimationComplete}
        style={{
          minHeight: 0,
        }}
      >
        {children}
      </motion.div>
    </div>
  );

  if (typeof document !== "undefined" && document.body) {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};

export default ModalContainer;
