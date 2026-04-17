"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Calendar, CheckCircle2, ChevronLeft, ChevronRight, Gift, History, Loader2, Sparkles, Tag, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useRedeemableRedemption, useRedeemablesWallet } from "@/hooks/queries";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import { useMajorDrawPurchaseGate } from "@/hooks/useMajorDrawPurchaseGate";
import { useSidebar } from "@/contexts/SidebarContext";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import {
  hasSeenRewardsSpotlight,
  markRewardsSpotlightSeen,
} from "@/utils/rewards-widget-spotlight-storage";
import { MODAL_DURATION_ENTER_S } from "@/utils/motion/modalPresets";
import { getViewportScrollbarWidthPx } from "@/utils/dom/getScrollbarWidth";

interface RewardsFloatingWidgetProps {
  userId: string;
  /** When true, positions the FAB above the bottom nav (e.g. on my-account dashboard) */
  positionAboveBottomNav?: boolean;
  /** When true, hides the first-time spotlight overlay (e.g. while dashboard landing modals run). */
  suppressSpotlight?: boolean;
}

/** Default Tradie subscription plan for membership-only campaign unlocks */
const DEFAULT_TRADIE_PLAN: LocalMembershipPlan = {
  id: "tradie-subscription",
  name: "Tradie",
  price: 20,
  period: "mo",
  features: [
    { text: "15 Free Accumulated Entries" },
    { text: "50% Access to Partner Discounts" },
    { text: "Mini Draws" },
  ],
  buttonText: "Get Started",
  buttonStyle: "secondary",
  isMemberOnly: false,
  metadata: { entriesCount: 15 },
};

export default function RewardsFloatingWidget({
  userId,
  positionAboveBottomNav = false,
  suppressSpotlight = false,
}: RewardsFloatingWidgetProps) {
  const { showToast } = useToast();
  const { isAnySidebarOpen } = useSidebar();
  const requestModal = useModalPriorityStore((state) => state.requestModal);
  const { whenGatesOpenElseGateModal } = useMajorDrawPurchaseGate();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"claimable" | "past">("claimable");
  const [claimablePage, setClaimablePage] = useState(1);
  const [pastPage, setPastPage] = useState(1);
  const redemptionMutation = useRedeemableRedemption(userId);

  const claimableQuery = useRedeemablesWallet(userId, { page: claimablePage, limit: 6, status: "claimable" });
  const pastQuery = useRedeemablesWallet(userId, { page: pastPage, limit: 6, status: "past" });

  const currentQuery = activeTab === "claimable" ? claimableQuery : pastQuery;
  const claimableCount = claimableQuery.data?.total || 0;
  const rawItems = currentQuery.data?.wallet || [];
  // Only display rewards that are active/available; hide inactive or unavailable
  const items =
    activeTab === "claimable"
      ? rawItems.filter((i) => i.isRedeemableNow)
      : rawItems;
  const totalPages = currentQuery.data?.totalPages || 1;
  const currentPage = currentQuery.data?.page || 1;

  const buttonShadowClass = useMemo(
    () =>
      claimableCount > 0
        ? "shadow-[0_8px_24px_rgba(238,0,0,0.35)]"
        : "shadow-[0_12px_28px_rgba(0,0,0,0.3)]",
    [claimableCount]
  );

  const openSpecialPackagesModal = (code?: string) => {
    whenGatesOpenElseGateModal(() => {
      const normalizedCode = code?.trim().toUpperCase();
      requestModal("special-packages", true, normalizedCode ? { initialCouponCode: normalizedCode } : undefined);
      setIsOpen(false);
    });
  };

  const openMembershipModalWithTradie = (code?: string) => {
    whenGatesOpenElseGateModal(() => {
      const normalizedCode = code?.trim().toUpperCase();
      window.dispatchEvent(
        new CustomEvent("openMembershipModal", {
          detail: {
            referralCode: normalizedCode || undefined,
            plan: DEFAULT_TRADIE_PLAN,
          },
        })
      );
      setIsOpen(false);
    });
  };

  const onRedeem = async (issuanceId: string) => {
    try {
      const response = await redemptionMutation.mutateAsync({ issuanceId });
      if (!response.success) {
        throw new Error(response.error || "Redemption failed");
      }
      showToast({
        type: "success",
        title: "Reward Claimed",
        message: `${response.data?.entriesGranted || 0} entries added to your account.`,
      });
    } catch (error) {
      showToast({
        type: "error",
        title: "Unable to claim",
        message: error instanceof Error ? error.message : "Please try again shortly.",
      });
    }
  };

  const hasUnclaimed = claimableCount > 0;
  const isReady = claimableQuery.isSuccess;

  const fabRef = useRef<HTMLButtonElement>(null);
  const [fabRect, setFabRect] = useState<{ x: number; y: number } | null>(null);
  const showSpotlight =
    hasUnclaimed &&
    isReady &&
    !isOpen &&
    !hasSeenRewardsSpotlight(userId) &&
    !isAnySidebarOpen &&
    !suppressSpotlight;

  const [spotlightDismissed, setSpotlightDismissed] = useState(false);
  const showSpotlightActive =
    showSpotlight && !spotlightDismissed;

  const dismissSpotlight = useCallback(() => {
    markRewardsSpotlightSeen(userId);
    setSpotlightDismissed(true);
  }, [userId]);

  const handleFabClick = useCallback(() => {
    if (showSpotlightActive) dismissSpotlight();
    setIsOpen(true);
  }, [showSpotlightActive, dismissSpotlight]);

  // Compute FAB center from known fixed CSS values (avoids measuring during animation).
  // FAB: left-4 sm:left-6, w-14 h-14 (56px). bottom varies by positionAboveBottomNav.
  useLayoutEffect(() => {
    if (!showSpotlightActive) return;
    const computePosition = () => {
      if (typeof window === "undefined") return;
      const isMobile = window.innerWidth < 640;
      const hasBottomNav = positionAboveBottomNav && window.innerWidth < 1024;
      const left = isMobile ? 16 : 24; // left-4 = 16px, sm:left-6 = 24px
      const bottom = hasBottomNav ? 88 : isMobile ? 40 : 24; // above nav: 88px, else bottom-10/bottom-6
      const size = 56; // w-14 h-14
      setFabRect({
        x: left + size / 2,
        y: window.innerHeight - bottom - size / 2,
      });
    };
    computePosition();
    window.addEventListener("resize", computePosition);
    return () => window.removeEventListener("resize", computePosition);
  }, [showSpotlightActive, positionAboveBottomNav]);

  useEffect(() => {
    if (!showSpotlight) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismissSpotlight();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showSpotlight, dismissSpotlight]);

  useEffect(() => {
    if (!isOpen) return;

    // Match ModalContainer / mobile menu: `overflow: hidden` alone is not enough on iOS Safari;
    // fixed body + negative top preserves scroll position and removes the viewport scrollbar.
    const isBodyAlreadyLocked = document.body.style.position === "fixed";
    if (isBodyAlreadyLocked) {
      return () => {};
    }

    const savedScrollY = window.scrollY;
    const html = document.documentElement;
    const prevHtmlScrollbarGutter = html.style.scrollbarGutter;

    html.style.scrollbarGutter = "auto";
    const scrollbarWidth = getViewportScrollbarWidthPx();

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${savedScrollY}px`;
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

        window.scrollTo(0, savedScrollY);
      }
    };
  }, [isOpen]);

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const handler = () => setPrefersReducedMotion(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <>
      {/* Screen reader announcement when spotlight is active */}
      {showSpotlightActive && (
        <div
          className="sr-only"
          aria-live="polite"
          aria-atomic="true"
        >
          You have claimable rewards. Tap the gift icon to view or claim them.
        </div>
      )}

      {/* Spotlight overlay: dark blurred background with radial cutout */}
      <AnimatePresence>
        {showSpotlightActive && fabRect && (
          <motion.div
            key="rewards-spotlight"
            className="fixed inset-0 z-[68] bg-black/80 backdrop-blur-md cursor-pointer"
            style={{
              maskImage: `radial-gradient(circle 72px at ${fabRect.x}px ${fabRect.y}px, transparent 0%, transparent 72px, black 72px)`,
              WebkitMaskImage: `radial-gradient(circle 72px at ${fabRect.x}px ${fabRect.y}px, transparent 0%, transparent 72px, black 72px)`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            onClick={dismissSpotlight}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Tooltip callout above FAB */}
      <AnimatePresence>
        {showSpotlightActive && fabRect && (
          <motion.div
            key="rewards-spotlight-tooltip"
            className="fixed z-[69] max-w-[280px] px-4 py-3 rounded-2xl bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 shadow-2xl"
            style={{
              left: Math.max(16, Math.min(fabRect.x - 140, typeof window !== "undefined" ? window.innerWidth - 296 : 0)),
              bottom: typeof window !== "undefined" ? window.innerHeight - fabRect.y + 56 + 16 : 80,
            }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.3, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="text-base font-bold text-white mb-1">Claim your rewards</p>
            <p className="text-sm text-gray-300">
              View or claim coupons here for additional entries to the draw.
            </p>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  dismissSpotlight();
                }}
                className="px-3 py-1.5 text-sm font-semibold text-red-400 hover:text-red-300 transition-colors"
              >
                Got it
              </button>
            </div>
            {/* Arrow pointing down */}
            <div
              className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-gray-900/95"
              style={{ filter: "drop-shadow(0 1px 0 rgba(55,65,81,0.5))" }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isOpen && isReady && !isAnySidebarOpen && (
          <motion.button
            ref={fabRef}
            key="rewards-fab"
            onClick={handleFabClick}
            className={`fixed left-4 sm:left-6 z-[70] group w-14 h-14 rounded-2xl border border-white/35 bg-gradient-to-br from-red-600 via-red-600 to-red-800 text-white backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:from-red-500 hover:to-red-700 active:scale-95 ${positionAboveBottomNav ? "bottom-24 lg:bottom-6" : "bottom-10 sm:bottom-6"} ${buttonShadowClass} ${showSpotlightActive ? "shadow-[0_0_40px_rgba(238,0,0,0.4)]" : ""}`}
            aria-label={showSpotlightActive ? "You have claimable rewards. Tap the gift icon to view them." : "Open claimable rewards"}
            initial={{ opacity: 0, scale: 0.92, y: 10 }}
            animate={{
              opacity: 1,
              scale: showSpotlightActive && !prefersReducedMotion ? 1.15 : 1,
              y: 0,
            }}
            exit={{ opacity: 0, scale: 0.94, y: 4 }}
            transition={{
              duration: 0.45,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
        <span className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/22 via-transparent to-transparent" />
        <span className="relative flex items-center justify-center w-full h-full">
          <motion.span
            animate={hasUnclaimed && !prefersReducedMotion ? { rotate: [0, 4, -4, 0] } : { rotate: 0 }}
            transition={
              hasUnclaimed && !prefersReducedMotion
                ? { duration: 2.5, repeat: Infinity, repeatDelay: 2, ease: [0.25, 0.1, 0.25, 1] }
                : { duration: 0.2 }
            }
            className="inline-flex"
          >
            <Gift className="w-7 h-7 text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)] group-hover:scale-105 transition-transform" strokeWidth={2.4} />
          </motion.span>
          {hasUnclaimed && (
            <motion.span
              className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-amber-300 text-[10px] leading-5 font-black text-gray-900 shadow-[0_6px_14px_rgba(0,0,0,0.35)] ring-2 ring-white/75"
              animate={prefersReducedMotion ? { scale: 1 } : { scale: [1, 1.1, 1] }}
              transition={
                prefersReducedMotion
                  ? { duration: 0.2 }
                  : { duration: 1.5, repeat: Infinity, repeatDelay: 1.5, ease: [0.25, 0.1, 0.25, 1] }
              }
            >
              {claimableCount > 99 ? "99+" : claimableCount}
            </motion.span>
          )}
        </span>
      </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-50 touch-none overscroll-none bg-black/50 backdrop-blur-sm"
            style={{ touchAction: "none" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: MODAL_DURATION_ENTER_S, ease: "easeOut" }}
            onClick={() => setIsOpen(false)}
          >
            <motion.div
              className="absolute right-0 top-0 flex h-full w-full max-h-[100dvh] touch-auto flex-col bg-gradient-to-br from-gray-50 to-white shadow-[-8px_0_32px_rgba(0,0,0,0.12)] dark:from-neutral-950 dark:to-neutral-900 dark:shadow-[-8px_0_32px_rgba(0,0,0,0.45)] sm:w-[480px]"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 280, mass: 0.8 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Gradient Header */}
              <div className="relative bg-gradient-to-br from-red-600 via-red-600 to-red-700 px-5 py-6 shadow-lg">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjAzIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-40" />
                <div className="relative flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-base sm:text-xl font-bold text-white">Claimable Rewards</h3>
                      {claimableCount > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-white/20 backdrop-blur-sm border border-white/30">
                          <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-300" />
                          <span className="text-[10px] sm:text-xs font-bold text-white">{claimableCount}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-white/90">Active campaigns and monthly rewards</p>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 text-white hover:bg-white/20 flex items-center justify-center transition-colors"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Tab Bar */}
              <div className="px-3 sm:px-4 pt-3 sm:pt-4 pb-2">
                <div className="inline-flex w-full rounded-xl bg-gray-100 p-1.5 shadow-inner">
                  <button
                    onClick={() => setActiveTab("claimable")}
                    className={`flex-1 h-11 sm:h-12 px-4 sm:px-5 text-sm sm:text-base font-semibold rounded-lg transition-all duration-200 ${
                      activeTab === "claimable"
                        ? "bg-white text-red-600 shadow-sm"
                        : "text-gray-600 dark:text-neutral-400 hover:text-gray-900"
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Gift className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                      <span className="truncate">Claimable ({claimableQuery.data?.total || 0})</span>
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab("past")}
                    className={`flex-1 h-11 rounded-lg px-4 text-sm font-semibold transition-all duration-200 sm:h-12 sm:px-5 sm:text-base ${
                      activeTab === "past"
                        ? "bg-[#ffffff] text-gray-900 shadow-sm dark:bg-neutral-950 dark:text-neutral-50 dark:shadow-[0_1px_3px_rgba(0,0,0,0.4)]"
                        : "text-gray-600 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <History className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                      <span className="truncate">Past Rewards</span>
                    </span>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 sm:px-4 py-2 sm:py-3 space-y-2 sm:space-y-3 pb-safe">
                {currentQuery.isLoading ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-500 dark:text-neutral-400">
                    <Loader2 className="h-6 w-6 animate-spin text-red-600 dark:text-red-400" />
                    <p className="text-sm font-medium">Loading rewards...</p>
                  </div>
                ) : items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="relative mb-4">
                      <div className="absolute inset-0 rounded-full bg-red-100 opacity-50 blur-xl dark:bg-red-900/40 dark:opacity-70" />
                      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950/80 dark:to-red-900/50">
                        <Gift className="h-8 w-8 text-red-600 dark:text-red-400" />
                      </div>
                    </div>
                    <p className="mb-1 text-base font-semibold text-gray-900 dark:text-neutral-100">No rewards yet</p>
                    <p className="max-w-[280px] text-center text-sm text-gray-500 dark:text-neutral-400">
                      {activeTab === "claimable"
                        ? "When new campaigns are available, they'll appear here"
                        : "Your claimed rewards will be shown here"}
                    </p>
                  </div>
                ) : (
                  items.map((item) => (
                    <article
                      key={item.issuanceId}
                      className={`group relative overflow-hidden rounded-xl border border-gray-200 bg-[#ffffff] p-2.5 transition-all duration-200 hover:shadow-lg dark:border-neutral-700 dark:bg-neutral-900 sm:rounded-2xl sm:border-2 sm:p-4 ${
                        activeTab === "claimable" && item.isRedeemableNow
                          ? "border-red-200 hover:border-red-300 dark:border-red-800/80 dark:hover:border-red-600/60"
                          : "border-gray-200 hover:border-gray-300 dark:border-neutral-700 dark:hover:border-neutral-600"
                      }`}
                    >
                      {/* Left accent bar */}
                      <div
                        className={`absolute bottom-2 left-0 top-2 w-0.5 rounded-r-full sm:bottom-4 sm:top-4 sm:w-1 ${
                          activeTab === "claimable" && item.isRedeemableNow
                            ? "bg-gradient-to-b from-red-500 to-red-600"
                            : "bg-gray-300 dark:bg-neutral-600"
                        }`}
                      />

                      <div className="flex items-start justify-between gap-2 sm:gap-3 pl-2 sm:pl-3">
                        <div className="flex-1 min-w-0">
                          {/* Title */}
                          <h4 className="mb-1 text-xs font-bold leading-tight text-gray-900 dark:text-neutral-100 sm:mb-1.5 sm:text-base">
                            {item.displayLabel || item.campaignName || `Reward ${item.monthKey}`}
                          </h4>

                          {/* Entries amount */}
                          <p className="mb-1 text-[11px] font-semibold text-gray-900 dark:text-neutral-100 sm:mb-2 sm:text-sm">
                            <span className="text-red-600 dark:text-red-400">{item.entriesAmount.toLocaleString()}</span>{" "}
                            free entries
                          </p>

                          {/* Meta info - expiry only; code is on the button so no duplicate */}
                          <div className="flex items-center gap-x-2 text-[10px] text-gray-500 dark:text-neutral-400 sm:text-xs">
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                              {item.neverExpires
                                ? "No expiry"
                                : item.expiresAt
                                ? `Expires ${new Date(item.expiresAt).toLocaleDateString()}`
                                : "No expiry"}
                            </span>
                          </div>
                        </div>

                        {/* Action button or Past status */}
                        {activeTab === "claimable" && item.isRedeemableNow ? (
                          item.purchaseRequirement !== "none" ? (
                            (() => {
                              const unlockCode = (item.campaignCode || item.code || "").trim().toUpperCase();
                              const code = item.campaignCode || item.code;
                              const isMembershipOnly = item.purchaseRequirement === "membership";
                              return (
                                <button
                                  onClick={() =>
                                    isMembershipOnly ? openMembershipModalWithTradie(code) : openSpecialPackagesModal(code)
                                  }
                                  className="shrink-0 inline-flex items-center justify-center gap-1 h-9 sm:h-11 min-w-[80px] sm:min-w-[100px] px-2.5 sm:px-4 rounded-lg sm:rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white text-[11px] sm:text-sm font-bold shadow-md hover:shadow-lg hover:from-amber-600 hover:to-amber-700 transition-all duration-200 active:scale-95"
                                >
                                  <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={2.5} />
                                  {unlockCode ? `USE ${unlockCode}` : "USE CODE"}
                                </button>
                              );
                            })()
                          ) : (
                            <button
                              onClick={() => onRedeem(item.issuanceId)}
                              disabled={redemptionMutation.isPending}
                              className="shrink-0 inline-flex items-center justify-center gap-1 h-9 sm:h-11 min-w-[80px] sm:min-w-[100px] px-2.5 sm:px-4 rounded-lg sm:rounded-xl bg-gradient-to-br from-red-600 to-red-700 text-white text-[11px] sm:text-sm font-bold shadow-md hover:shadow-lg hover:from-red-700 hover:to-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-95"
                            >
                              {redemptionMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <>
                                  <CheckCircle2 className="w-4 h-4" strokeWidth={2.5} />
                                  Redeem
                                </>
                              )}
                            </button>
                          )
                        ) : activeTab === "past" ? (
                          <span className="inline-flex h-9 min-w-[80px] shrink-0 items-center justify-center gap-1 rounded-lg bg-emerald-100 px-2.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 sm:h-11 sm:min-w-[100px] sm:rounded-xl sm:px-4 sm:text-sm">
                            <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={2.5} />
                            {item.status === "redeemed" ? "Claimed" : item.status === "expired" ? "Expired" : item.status || "Claimed"}
                          </span>
                        ) : null}
                      </div>

                      {/* Purchase note - full width at bottom */}
                      {item.purchaseRequirement !== "none" && (
                        <div className="-mx-2.5 -mb-2.5 mt-2 w-full rounded-b-xl border-t border-amber-200/50 bg-amber-50/80 px-2.5 pb-2 pt-2 dark:border-amber-700/40 dark:bg-amber-950/45 sm:-mx-4 sm:-mb-4 sm:rounded-b-2xl sm:px-4 sm:pb-3">
                          <div className="flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-medium text-amber-800 dark:text-amber-200/95 sm:text-xs">
                            <Tag className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400 sm:h-3.5 sm:w-3.5" />
                            {item.purchaseRequirement === "membership" && "Code for membership purchase"}
                            {item.purchaseRequirement === "one-time" && "Code for one-time purchase"}
                            {item.purchaseRequirement === "any" && "Coupon valid for any purchase"}
                          </div>
                        </div>
                      )}
                    </article>
                  ))
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-200 bg-[#ffffff]/90 px-4 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-950/95 dark:shadow-[0_-4px_12px_rgba(0,0,0,0.25)]">
                  <button
                    onClick={() => (activeTab === "claimable" ? setClaimablePage((p) => p - 1) : setPastPage((p) => p - 1))}
                    disabled={currentPage <= 1 || currentQuery.isLoading}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-gray-300 bg-[#ffffff] px-4 text-sm font-semibold text-gray-700 transition-all hover:border-gray-400 hover:bg-gray-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-neutral-500 dark:hover:bg-neutral-800"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Prev
                  </button>
                  <span className="px-3 text-sm font-semibold text-gray-700 dark:text-neutral-200">
                    Page <span className="text-red-600 dark:text-red-400">{currentPage}</span> of {totalPages}
                  </span>
                  <button
                    onClick={() => (activeTab === "claimable" ? setClaimablePage((p) => p + 1) : setPastPage((p) => p + 1))}
                    disabled={currentPage >= totalPages || currentQuery.isLoading}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-gray-300 bg-[#ffffff] px-4 text-sm font-semibold text-gray-700 transition-all hover:border-gray-400 hover:bg-gray-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-neutral-500 dark:hover:bg-neutral-800"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
