"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Calendar, CheckCircle2, ChevronLeft, ChevronRight, Gift, History, Loader2, Sparkles, Tag, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useRedeemableRedemption, useRedeemablesWallet } from "@/hooks/queries";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import {
  hasSeenRewardsSpotlight,
  markRewardsSpotlightSeen,
} from "@/utils/rewards-widget-spotlight-storage";

interface RewardsFloatingWidgetProps {
  userId: string;
}

/** Default Tradie subscription plan for membership-only campaign unlocks */
const DEFAULT_TRADIE_PLAN: LocalMembershipPlan = {
  id: "tradie-subscription",
  name: "Tradie",
  price: 20,
  period: "mo",
  features: [
    { text: "15 Free Accumulated Entries" },
    { text: "100% Access to Partner Discounts" },
    { text: "Mini Draws" },
  ],
  buttonText: "Get Started",
  buttonStyle: "secondary",
  isMemberOnly: false,
  metadata: { entriesCount: 15 },
};

export default function RewardsFloatingWidget({ userId }: RewardsFloatingWidgetProps) {
  const { showToast } = useToast();
  const requestModal = useModalPriorityStore((state) => state.requestModal);
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
    const normalizedCode = code?.trim().toUpperCase();
    requestModal("special-packages", true, normalizedCode ? { initialCouponCode: normalizedCode } : undefined);
    setIsOpen(false);
  };

  const openMembershipModalWithTradie = (code?: string) => {
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
    hasUnclaimed && isReady && !isOpen && !hasSeenRewardsSpotlight(userId);

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
  // FAB: left-4 sm:left-6, bottom-20 sm:bottom-6, w-14 h-14 (56px).
  useLayoutEffect(() => {
    if (!showSpotlightActive) return;
    const computePosition = () => {
      if (typeof window === "undefined") return;
      const isMobile = window.innerWidth < 640;
      const left = isMobile ? 16 : 24; // left-4 = 16px, sm:left-6 = 24px
      const bottom = isMobile ? 80 : 24; // bottom-20 = 80px, sm:bottom-6 = 24px
      const size = 56; // w-14 h-14
      setFabRect({
        x: left + size / 2,
        y: window.innerHeight - bottom - size / 2,
      });
    };
    computePosition();
    window.addEventListener("resize", computePosition);
    return () => window.removeEventListener("resize", computePosition);
  }, [showSpotlightActive]);

  useEffect(() => {
    if (!showSpotlight) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismissSpotlight();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showSpotlight, dismissSpotlight]);

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
        {!isOpen && isReady && (
          <motion.button
            ref={fabRef}
            key="rewards-fab"
            onClick={handleFabClick}
            className={`fixed bottom-20 sm:bottom-6 left-4 sm:left-6 z-[70] group w-14 h-14 rounded-2xl border border-white/35 bg-gradient-to-br from-red-600 via-red-600 to-red-800 text-white backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:from-red-500 hover:to-red-700 active:scale-95 ${buttonShadowClass} ${showSpotlightActive ? "shadow-[0_0_40px_rgba(238,0,0,0.4)]" : ""}`}
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
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={() => setIsOpen(false)}
          >
            <motion.div
              className="absolute right-0 top-0 h-full w-full sm:w-[480px] bg-gradient-to-br from-gray-50 to-white shadow-[-8px_0_32px_rgba(0,0,0,0.12)] flex flex-col"
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
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Gift className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                      <span className="truncate">Claimable ({claimableQuery.data?.total || 0})</span>
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab("past")}
                    className={`flex-1 h-11 sm:h-12 px-4 sm:px-5 text-sm sm:text-base font-semibold rounded-lg transition-all duration-200 ${
                      activeTab === "past"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
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
              <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-2 sm:py-3 space-y-2 sm:space-y-3 pb-safe">
                {currentQuery.isLoading ? (
                  <div className="py-16 flex flex-col items-center justify-center text-gray-500 gap-3">
                    <Loader2 className="w-6 h-6 animate-spin text-red-600" />
                    <p className="text-sm font-medium">Loading rewards...</p>
                  </div>
                ) : items.length === 0 ? (
                  <div className="py-16 flex flex-col items-center justify-center">
                    <div className="relative mb-4">
                      <div className="absolute inset-0 bg-red-100 rounded-full blur-xl opacity-50" />
                      <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center">
                        <Gift className="w-8 h-8 text-red-600" />
                      </div>
                    </div>
                    <p className="text-base font-semibold text-gray-900 mb-1">No rewards yet</p>
                    <p className="text-sm text-gray-500 text-center max-w-[280px]">
                      {activeTab === "claimable"
                        ? "When new campaigns are available, they'll appear here"
                        : "Your claimed rewards will be shown here"}
                    </p>
                  </div>
                ) : (
                  items.map((item) => (
                    <article
                      key={item.issuanceId}
                      className={`group relative rounded-xl sm:rounded-2xl border border-gray-200 sm:border-2 bg-white p-2.5 sm:p-4 transition-all duration-200 hover:shadow-lg overflow-hidden ${
                        activeTab === "claimable" && item.isRedeemableNow
                          ? "border-red-200 hover:border-red-300"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      {/* Left accent bar */}
                      <div
                        className={`absolute left-0 top-2 bottom-2 sm:top-4 sm:bottom-4 w-0.5 sm:w-1 rounded-r-full ${
                          activeTab === "claimable" && item.isRedeemableNow
                            ? "bg-gradient-to-b from-red-500 to-red-600"
                            : "bg-gray-300"
                        }`}
                      />

                      <div className="flex items-start justify-between gap-2 sm:gap-3 pl-2 sm:pl-3">
                        <div className="flex-1 min-w-0">
                          {/* Title */}
                          <h4 className="text-xs sm:text-base font-bold text-gray-900 leading-tight mb-1 sm:mb-1.5">
                            {item.displayLabel || item.campaignName || `Reward ${item.monthKey}`}
                          </h4>

                          {/* Entries amount */}
                          <p className="text-[11px] sm:text-sm font-semibold text-gray-900 mb-1 sm:mb-2">
                            <span className="text-red-600">{item.entriesAmount.toLocaleString()}</span> free entries
                          </p>

                          {/* Meta info - expiry only; code is on the button so no duplicate */}
                          <div className="flex items-center gap-x-2 text-[10px] sm:text-xs text-gray-500">
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
                          <span className="shrink-0 inline-flex items-center justify-center gap-1 h-9 sm:h-11 min-w-[80px] sm:min-w-[100px] px-2.5 sm:px-4 rounded-lg sm:rounded-xl bg-emerald-100 text-emerald-700 text-[11px] sm:text-sm font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={2.5} />
                            {item.status === "redeemed" ? "Claimed" : item.status === "expired" ? "Expired" : item.status || "Claimed"}
                          </span>
                        ) : null}
                      </div>

                      {/* Purchase note - full width at bottom */}
                      {item.purchaseRequirement !== "none" && (
                        <div className="w-full mt-2 pt-2 border-t border-amber-200/50 -mx-2.5 sm:-mx-4 -mb-2.5 sm:-mb-4 px-2.5 sm:px-4 pb-2 sm:pb-3 bg-amber-50/80 rounded-b-xl sm:rounded-b-2xl">
                          <div className="flex items-center justify-center gap-1.5 py-1.5 text-[10px] sm:text-xs font-medium text-amber-800">
                            <Tag className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 text-amber-600" />
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
                <div className="border-t border-gray-200 bg-white/80 backdrop-blur-sm px-4 py-4 flex items-center justify-between shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
                  <button
                    onClick={() => (activeTab === "claimable" ? setClaimablePage((p) => p - 1) : setPastPage((p) => p - 1))}
                    disabled={currentPage <= 1 || currentQuery.isLoading}
                    className="h-10 px-4 rounded-xl border-2 border-gray-300 bg-white text-sm font-semibold text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 hover:border-gray-400 transition-all inline-flex items-center gap-2 active:scale-95"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Prev
                  </button>
                  <span className="text-sm font-semibold text-gray-700 px-3">
                    Page <span className="text-red-600">{currentPage}</span> of {totalPages}
                  </span>
                  <button
                    onClick={() => (activeTab === "claimable" ? setClaimablePage((p) => p + 1) : setPastPage((p) => p + 1))}
                    disabled={currentPage >= totalPages || currentQuery.isLoading}
                    className="h-10 px-4 rounded-xl border-2 border-gray-300 bg-white text-sm font-semibold text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 hover:border-gray-400 transition-all inline-flex items-center gap-2 active:scale-95"
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
