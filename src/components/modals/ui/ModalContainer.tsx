"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { m, useReducedMotion } from "framer-motion";
import { Z_INDEX } from "@/constants/z-index";
import { useHtmlDarkForUi } from "@/hooks/useHtmlDarkForUi";
import {
  backdropVariants,
  dialogNestedPanelVariants,
  dialogPanelVariants,
  drawerPanelVariants,
  MODAL_DURATION_EXIT_S,
  reducedBackdropVariants,
  reducedPanelVariants,
  sheetPanelVariants,
} from "@/utils/motion/modalPresets";
import { useScrollLock } from "@/hooks/useModalBlocking";
import { cn } from "@/utils/cn";

export type ModalPresentation = "dialog" | "sheet" | "drawer";

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
   * Override the resolved z-index. Use ONLY when this modal must sit in a
   * non-standard micro-stack outside the Z_INDEX scale (e.g. CancellationUpsellModal
   * uses `zIndex={80}` to sit above its parent SubscriptionManagementModal).
   */
  zIndex?: number;
  /**
   * `dialog` = centered scale/fade. `sheet` = slide up from the bottom (e.g. mobile package
   * picker). `drawer` = full-height panel sliding in from the RIGHT below `lg`, reverting to a
   * centered dialog at `lg`+ (the prize details sheet).
   */
  presentation?: ModalPresentation;
  /**
   * When true, below the `lg` breakpoint (mobile + tablet) the panel renders
   * near-fullscreen: full viewport width, flush to the bottom, with only a ~5%
   * gap at the top (`h-[95dvh]`). At `lg` and up it falls back to the normal
   * centered dialog at the given `size`. Opt-in; default false leaves every
   * existing modal byte-for-byte unchanged.
   */
  mobileFullBleed?: boolean;
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
  zIndex,
  presentation = "dialog",
  mobileFullBleed = false,
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

  // Mobile keyboard avoidance: while a modal is open, expose the visualViewport height as a CSS
  // custom property `--ta-vv-height` on <html>. Modal content that needs to keep its bottom
  // controls visible above the soft keyboard can opt in via:
  //   style={{ maxHeight: "var(--ta-vv-height, 100vh)" }}
  // We don't force this on existing modals — only set the var; opt-in keeps current layouts intact.
  useEffect(() => {
    if (!isOpen) return;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const update = () => {
      document.documentElement.style.setProperty("--ta-vv-height", `${vv.height}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.documentElement.style.removeProperty("--ta-vv-height");
    };
  }, [isOpen]);

  // Track if we've pushed a history state for this modal instance
  const historyStatePushed = useRef(false);
  const backButtonPressed = useRef(false);
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

  /**
   * `mobileFullBleed` needs the `lg:`-prefixed form of the same widths. These MUST be
   * written out as literal strings: Tailwind scans source text, so an interpolated
   * `` `lg:${sizeStyles[size]}` `` only works when that exact class happens to appear
   * literally somewhere else in the codebase — which silently left `lg:max-w-4xl`
   * ungenerated and stretched full-bleed panels edge-to-edge on desktop.
   */
  const lgSizeStyles = {
    sm: "lg:max-w-sm",
    md: "lg:max-w-md",
    lg: "lg:max-w-lg",
    xl: "lg:max-w-xl",
    "2xl": "lg:max-w-2xl",
    "3xl": "lg:max-w-3xl",
    "4xl": "lg:max-w-4xl",
    full: "lg:max-w-full",
  };

  // Size modal content with `svh` (stable smallest viewport) rather than `dvh`,
  // which is throttled and janks/clips as the browser chrome shows/hides on
  // iOS Safari + Android Chrome (WebKit bug 266835). Tall content scrolls inside
  // the modal body's own overflow-y-auto region, so it never depends on the unit.
  const heightStyles = {
    auto: "max-h-[88svh] max-xs:max-h-[92svh]",
    screen: "h-screen-svh",
    fixed: fixedHeight || "h-[90svh]",
  };

  const isSheet = presentation === "sheet";
  const isDrawer = presentation === "drawer";

  const backdropV = reduceMotion ? reducedBackdropVariants : backdropVariants;
  const panelV = reduceMotion
    ? reducedPanelVariants
    : isDrawer
      ? drawerPanelVariants
      : isSheet
        ? sheetPanelVariants
        : nested
          ? dialogNestedPanelVariants
          : dialogPanelVariants;

  const resolveZIndex = () => {
    if (zIndex !== undefined) return zIndex;
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

    // NOTE: wheel and touchmove are intentionally non-passive — they call e.preventDefault() to
    // implement modal scroll-lock at the boundaries (so wheel/touch overscroll does not propagate
    // to the body behind the modal). touchstart is passive (read-only). Do not flip these to
    // passive without rethinking the boundary-stop behaviour.
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

  /**
   * Page scroll lock. This used to be ~40 lines inline here, and the recipe was right — save
   * scrollY, pin the body `fixed` at `top: -Y`, compensate the scrollbar, restore on release.
   * `useScrollLock` is that exact recipe, lifted verbatim; the only change is WHO decides to
   * release it.
   *
   * The inline version guarded against double-LOCKING (`if (document.body.style.position ===
   * "fixed") return`) but not against premature UNLOCKING. With two of these modals open at
   * once, the second deferred correctly — and then the FIRST one to close ran its cleanup,
   * saw `position === "fixed"` (which it had set), and unlocked the page while the second was
   * still on screen. Reference counting makes the last holder the one that releases, which is
   * the only version of this that is correct with 58 consumers and a stacking modal system.
   */
  useScrollLock(modalBlocking);

  if (!isLocked) return null;

  const modalZIndex = resolveZIndex();

  const outerFlex = isDrawer
    ? "items-stretch justify-end p-0 lg:items-center lg:justify-center lg:p-2"
    : mobileFullBleed
      ? "items-end justify-center p-0 lg:items-center lg:justify-center lg:p-2"
      : isSheet
        ? "items-end justify-center pt-2 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:items-center sm:p-2 sm:pb-2"
        : "items-center justify-center p-2";

  const panelShape = isDrawer
    ? `w-full max-w-none rounded-none ${lgSizeStyles[size]} lg:rounded-2xl`
    : mobileFullBleed
    ? `w-full max-w-none rounded-t-2xl rounded-b-none ${lgSizeStyles[size]} lg:rounded-2xl`
    : isSheet
      ? `rounded-t-2xl rounded-b-none sm:rounded-2xl sm:rounded-b-2xl w-full ${sizeStyles[size]}`
      : `rounded-2xl w-full ${sizeStyles[size]}`;

  // Full-bleed below lg = 95svh (5% top gap, bottom-flush); normal at lg+.
  // svh (not dvh) so the panel doesn't resize/clip as the mobile chrome toggles.
  const panelHeight = isDrawer
    ? "h-full lg:h-auto lg:max-h-[88svh]"
    : mobileFullBleed
      ? "h-[95svh] lg:h-auto lg:max-h-[88svh]"
      : heightStyles[height];

  const modalContent = (
    <div
      className={cn("fixed inset-0 flex", outerFlex, "pointer-events-none")}
      style={{ zIndex: modalZIndex }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <m.div
        className={cn("absolute inset-0 bg-black/85 backdrop-blur-md touch-none", isOpen ? "pointer-events-auto" : "pointer-events-none")}
        variants={backdropV}
        initial="closed"
        animate={isOpen ? "open" : "closed"}
        aria-hidden="true"
        style={{ touchAction: "none" }}
        onClick={closeOnBackdrop ? onClose : undefined}
      />

      <m.div
        ref={modalContentRef}
        className={`
        relative overflow-hidden flex flex-col ${isOpen ? "pointer-events-auto" : "pointer-events-none"} mx-auto
        ${
          isDarkMode
            ? "dark bg-neutral-900 border border-neutral-800 shadow-2xl shadow-black/50"
            : "bg-white border border-gray-200/90 shadow-2xl shadow-gray-900/10"
        }
        ${panelShape}
        ${panelHeight}
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
          // Drawers translate a full-height, image-heavy subtree across the whole viewport
          // while a `backdrop-blur` backdrop fades behind them. Promoting the panel to its
          // own compositor layer keeps that a pure GPU transform instead of a per-frame
          // repaint of the subtree. Bounded cost: the portal only stays mounted while the
          // modal is open or mid-exit (`isLocked`), so `will-change` is never left standing.
          ...(isDrawer ? { willChange: "transform", backfaceVisibility: "hidden" as const } : {}),
        }}
      >
        {children}
      </m.div>
    </div>
  );

  if (typeof document !== "undefined" && document.body) {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};

export default ModalContainer;
