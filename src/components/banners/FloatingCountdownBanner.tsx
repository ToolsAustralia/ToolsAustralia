"use client";

import React, { useState, useEffect, Suspense } from "react";
import { m, AnimatePresence } from "framer-motion";
import { X, Lock } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { DEFAULT_PRIZE_SLUG } from "@/config/prize-summaries";
import { useMajorDrawCountdown } from "@/hooks/useMajorDrawCountdown";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { MajorDrawCountdownLeaf } from "@/components/banners/MajorDrawCountdownLeaf";
import PromoBadgeImage from "@/components/ui/PromoBadgeImage";
import type { PromoMultiplier } from "@/types/promo-multiplier";
import { cn } from "@/utils/cn";
import { addRAFScrollListener } from "@/utils/dom/listenerHelpers";

interface FloatingCountdownBannerProps {
  className?: string;
}

const FloatingCountdownBannerInner: React.FC<FloatingCountdownBannerProps> = ({ className = "" }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false); // For hover/click override
  const [isDismissed, setIsDismissed] = useState(false);
  const [isVisibleOnScroll, setIsVisibleOnScroll] = useState(false); // For my-account: hide at top, show when scrolled
  const [isAtBottom, setIsAtBottom] = useState(false); // For my-account: hide at bottom
  const [heroInView, setHeroInView] = useState(true); // Suppressed while the hero owns the CTA

  // What we count down to, and what we call it — shared with the hero's in-flow CTA so the two
  // clocks on this page can never disagree. See useMajorDrawCountdown.
  const { targetMs, gatesClosed, drawName, nextDrawName, isReady } = useMajorDrawCountdown();

  // Same entries multiplier the package cards and the hero CTA show — one hook, so a promo
  // lights up every surface at once. Only rendered above 1x: "1x PROMO" advertises nothing.
  const membershipMultiplier = useResolvedMultiplier("membership-packages", "display");
  const hasMultiplier = typeof membershipMultiplier === "number" && membershipMultiplier > 1;

  /**
   * Stay out of the way while the hero is on screen (2026-09-03).
   *
   * The hero renders its own countdown CTA (`HeroGiveawayCta`), so a fixed overlay on top of it
   * is both duplicated and in the way — on desktop it covered the brand marquee, on mobile a
   * large slice of the first screen. Observing the hero element is what makes "past the hero"
   * mean the actual hero rather than a hard-coded scroll number that breaks the moment the hero
   * changes height (it is `min-h-screen-svh`, so it already differs per device).
   *
   * No hero on the page (any future host) → nothing to wait for, so default to visible.
   */
  useEffect(() => {
    const hero = document.querySelector(".hero-section");
    if (!hero) {
      setHeroInView(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setHeroInView(entry.isIntersecting),
      // A sliver of hero still showing is not "past the hero" — require most of it to be gone.
      { threshold: 0, rootMargin: "-25% 0px 0px 0px" }
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  // On my-account: hide at top, only show when user has scrolled
  const isMyAccountPage = pathname === "/my-account";
  const topScrollThreshold = 150;

  // Scroll detection - collapse at 200px, and on my-account hide at top/bottom
  useEffect(() => {
    const handleScroll = (scrollY: number) => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollBottom = scrollY + windowHeight;
      const bottomThreshold = 100;
      const atBottom = scrollBottom >= documentHeight - bottomThreshold;

      setIsCollapsed(scrollY > 200);

      if (isMyAccountPage) {
        setIsVisibleOnScroll(scrollY >= topScrollThreshold);
        setIsAtBottom(atBottom);
      } else {
        setIsVisibleOnScroll(true); // Always visible on other pages
        setIsAtBottom(false);
      }
    };
    handleScroll(window.scrollY); // Initial check
    return addRAFScrollListener(window, handleScroll);
  }, [isMyAccountPage]);

  // Dismiss handler
  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDismissed(true);
  };

  // Navigate to the DEFAULT prize page, not the `/promotions` showroom (owner,
  // 2026-07-22 — reverses the 2026-07-08 change): the entry CTA should land on a page
  // that sells, and the showroom is now reachable only from the footer Quick Links.
  const handleViewDetails = () => {
    // Preserve affiliate code from URL if present (App Router compatible)
    const affiliateCode = searchParams.get("aff");
    const target = `/promotions/${DEFAULT_PRIZE_SLUG}`;
    router.push(affiliateCode ? `${target}?aff=${affiliateCode}` : target);
  };

  // Don't render if dismissed, not ready, or while the hero's own CTA is on screen
  if (isDismissed || !isReady || heroInView) {
    return null;
  }

  // On my-account: hide at top or at bottom
  if (isMyAccountPage && (!isVisibleOnScroll || isAtBottom)) {
    return null;
  }

  const isCollapsedState = isCollapsed && !isExpanded;

  return (
    <AnimatePresence>
      {isReady && !isDismissed && !heroInView && (
        <m.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className={cn("fixed bottom-10 sm:bottom-12 left-0 right-0 z-50 flex justify-center pointer-events-none", className)}
        >
          <m.div
            // Obstacle contract sits on the PILL, not the full-width centering wrapper —
            // measuring the wrapper made the corner controls dodge a centered banner that
            // never actually reaches them. This is what makes the documented
            // "desktop: max-w-4xl never reaches the corner → no lift" behaviour real.
            data-floating-widget="true"
            animate={{
              scale: isCollapsedState ? 0.95 : 1,
            }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            // Hover expands the COLLAPSED pill — that is the only state where expanding does
            // anything. The old guard was `!isCollapsed && setIsExpanded(true)`, i.e. it only
            // fired when the banner was already expanded, so hovering the pill did nothing and
            // a click was the only way to open it (owner, 2026-09-03). Click stays for touch,
            // where there is no hover at all.
            onMouseEnter={() => setIsExpanded(true)}
            onMouseLeave={() => setIsExpanded(false)}
            onClick={() => {
              if (isCollapsed) setIsExpanded(!isExpanded);
            }}
            className={`relative pointer-events-auto bg-gradient-to-r from-gray-900 via-gray-800 to-black rounded-xl shadow-2xl border ${
              gatesClosed ? "border-yellow-500/50" : "border-red-500/50"
            } overflow-visible w-full mx-4 ${
              isCollapsedState ? "max-w-md" : "max-w-4xl"
            }`}
          >
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-10 pattern-dots-white"></div>

            {/* X Button */}
            <button
              onClick={handleDismiss}
              type="button"
              aria-label="Dismiss countdown"
              className="absolute -top-3 -right-4 z-20 bg-white hover:bg-red-50 rounded-full p-1.5 transition-all duration-300 hover:scale-110 hover:shadow-lg group"
            >
              <X className="w-5 h-5 text-red-400 group-hover:text-red-600 transition-colors duration-300" />
            </button>

            <div className="relative z-10 p-4 sm:p-6">
              {/* Collapsed State - Show only text with pulsing indicator */}
              {isCollapsedState ? (
                <div className="flex items-center justify-center gap-3 py-2">
                  {/* Status indicator - Yellow/Orange when gates closed, Green when open.
                      Static in the collapsed pill (perf Tier-2 Task 1): the collapsed state
                      persists for the whole scroll session, so no always-on ping/pulse here. */}
                  <div className="relative">
                    <div className={cn("w-3 h-3", gatesClosed ? "bg-yellow-400" : "bg-green-400", "rounded-full")}></div>
                  </div>

                  {/* Text - Only title, no subtitle */}
                  <div className="text-center">
                    <h3 className="text-sm sm:text-base font-bold text-white font-poppins leading-tight">
                      {gatesClosed ? "GATES CLOSED" : "WIN THE BEST TRADIE SETUP"}
                    </h3>
                  </div>
                </div>
              ) : (
                /* Expanded State - Desktop */
                <div className="hidden sm:block">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 sm:gap-6 items-center">
                    {/* Left Column - Text */}
                    <div className="text-center sm:text-left sm:col-span-4">
                      <div className="flex items-center justify-center sm:justify-start gap-3 mb-2">
                        {gatesClosed && (
                          <Lock className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                        )}
                        <h3 className="text-sm sm:text-base font-bold text-white font-poppins leading-tight break-words">
                          {gatesClosed ? "GATES CLOSED" : "WIN THE BEST TRADIE SETUP"}
                        </h3>
                      </div>
                      <p className="text-sm sm:text-base font-semibold text-yellow-400">
                        {gatesClosed 
                          ? (nextDrawName ? `Next Draw: ${nextDrawName}` : "Come back when the next draw opens")
                          : (drawName || "UNTIL NEXT LIVE DRAW")
                        }
                      </p>
                    </div>

                    {/* Center Column - Countdown */}
                    <div className="text-center sm:col-span-5">
                      <MajorDrawCountdownLeaf
                        targetMs={targetMs}
                        render={({ timeLeft, isExpired }) =>
                          isExpired ? (
                            <div className="text-center">
                              <div className="text-2xl sm:text-3xl font-bold text-red-400 mb-2 font-poppins">
                                DRAW IN PROGRESS!
                              </div>
                              <a
                                href="https://www.facebook.com/toolsaust"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors underline"
                              >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                </svg>
                                Watch Live Stream
                              </a>
                            </div>
                          ) : (
                            <div className="grid grid-cols-4 gap-2 sm:gap-2">
                              {/* Days */}
                              <div className={cn("bg-gradient-to-br", gatesClosed ? "from-yellow-500 via-orange-500 to-orange-600" : "from-red-500 via-red-600 to-red-700", "rounded-lg px-2 py-2 sm:px-4 sm:py-2 shadow-lg w-full ring-2", gatesClosed ? "ring-yellow-300/20" : "ring-red-300/20")}>
                                <div className="text-lg sm:text-xl font-bold text-white mb-0.5 font-poppins drop-shadow-md">
                                  {timeLeft.days.toString().padStart(2, "0")}
                                </div>
                                <div className={cn("text-xs", gatesClosed ? "text-yellow-100" : "text-red-100", "font-medium")}>DAYS</div>
                              </div>

                              {/* Hours */}
                              <div className={cn("bg-gradient-to-br", gatesClosed ? "from-yellow-500 via-orange-500 to-orange-600" : "from-red-500 via-red-600 to-red-700", "rounded-lg px-2 py-2 sm:px-4 sm:py-2 shadow-lg w-full ring-2", gatesClosed ? "ring-yellow-300/20" : "ring-red-300/20")}>
                                <div className="text-lg sm:text-xl font-bold text-white mb-0.5 font-poppins drop-shadow-md">
                                  {timeLeft.hours.toString().padStart(2, "0")}
                                </div>
                                <div className={cn("text-xs", gatesClosed ? "text-yellow-100" : "text-red-100", "font-medium")}>HRS</div>
                              </div>

                              {/* Minutes */}
                              <div className={cn("bg-gradient-to-br", gatesClosed ? "from-yellow-500 via-orange-500 to-orange-600" : "from-red-500 via-red-600 to-red-700", "rounded-lg px-2 py-2 sm:px-4 sm:py-2 shadow-lg w-full ring-2", gatesClosed ? "ring-yellow-300/20" : "ring-red-300/20")}>
                                <div className="text-lg sm:text-xl font-bold text-white mb-0.5 font-poppins drop-shadow-md">
                                  {timeLeft.minutes.toString().padStart(2, "0")}
                                </div>
                                <div className={cn("text-xs", gatesClosed ? "text-yellow-100" : "text-red-100", "font-medium")}>MINS</div>
                              </div>

                              {/* Seconds */}
                              <div className={cn("bg-gradient-to-br", gatesClosed ? "from-yellow-500 via-orange-500 to-orange-600" : "from-red-500 via-red-600 to-red-700", "rounded-lg px-2 py-2 sm:px-4 sm:py-2 shadow-lg w-full ring-2", gatesClosed ? "ring-yellow-300/20" : "ring-red-300/20")}>
                                <div className="text-lg sm:text-xl font-bold text-white mb-0.5 font-poppins drop-shadow-md">
                                  {timeLeft.seconds.toString().padStart(2, "0")}
                                </div>
                                <div className={cn("text-xs", gatesClosed ? "text-yellow-100" : "text-red-100", "font-medium")}>SECS</div>
                              </div>
                            </div>
                          )
                        }
                      />
                    </div>

                    {/* Right Column - Action Button */}
                    <div className="relative flex justify-center sm:justify-end sm:col-span-3">
                      {/* Entries multiplier, pinned to the CTA's top-right corner. */}
                      {hasMultiplier && (
                        <span className="pointer-events-none absolute -top-4 right-0 z-20 rotate-6 sm:-right-2">
                          <PromoBadgeImage
                            multiplier={membershipMultiplier as PromoMultiplier}
                            size="small"
                            className="h-10 w-auto drop-shadow-lg"
                          />
                        </span>
                      )}
                      {/* Brighter + heavier than the rest of the panel so the one thing that
                          converts is the one thing you see first. Matches HeroGiveawayCta's CTA
                          — same action, same weight, wherever the countdown happens to be. The
                          sheen sweep is `motion-safe:` only (CLAUDE.md §4 reduced-motion gate). */}
                      <button
                        onClick={handleViewDetails}
                        className="group relative overflow-hidden bg-gradient-to-r from-amber-300 via-yellow-400 to-orange-500 text-black px-6 py-3 rounded-xl font-extrabold text-sm shadow-[0_6px_20px_rgba(251,191,36,0.45)] hover:shadow-[0_10px_28px_rgba(251,191,36,0.65)] ring-2 ring-white/70 hover:ring-white transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-1 w-[200px] sm:w-auto focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-200"
                      >
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 to-transparent motion-safe:group-hover:translate-x-full motion-safe:transition-transform motion-safe:duration-700"
                        />
                        <span className="relative">{gatesClosed ? "Visit Page" : "Enter Now"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Mobile State - Only show when not collapsed */}
              {!isCollapsedState && (
                <div className="sm:hidden">
                  {/* Mobile Expanded */}
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      {/* Pulsing Indicator - Yellow/Orange when gates closed, Green when open.
                          ta-countdown-dot: globals.css freezes the ping/pulse on
                          mobile/tablet/save-data tiers (perf Tier-2 Task 1). */}
                      <div className="relative">
                        <div className={cn("ta-countdown-dot w-3 h-3", gatesClosed ? "bg-yellow-400" : "bg-green-400", "rounded-full animate-pulse")}></div>
                        <div className={cn("ta-countdown-dot absolute inset-0 w-3 h-3", gatesClosed ? "bg-yellow-400" : "bg-green-400", "rounded-full animate-ping opacity-75")}></div>
                      </div>
                      {gatesClosed && <Lock className="w-3 h-3 text-yellow-400 flex-shrink-0" />}
                      <p className="text-sm sm:text-base font-semibold text-yellow-400 font-poppins">
                        {gatesClosed
                          ? (nextDrawName ? `Next Draw: ${nextDrawName}` : "Come back when the next draw opens")
                          : (drawName || "UNTIL NEXT LIVE DRAW")}
                      </p>
                    </div>

                    <MajorDrawCountdownLeaf
                      targetMs={targetMs}
                      render={({ timeLeft, isExpired }) =>
                        isExpired ? (
                          <div className="text-center">
                            <div className="text-xl font-bold text-red-400 mb-2 font-poppins">DRAW IN PROGRESS!</div>
                            <a
                              href="https://www.facebook.com/toolsaust"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors underline"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                              </svg>
                              Watch Live Stream
                            </a>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-2 mb-4">
                            {/* Countdown Timer - 4 columns in one row */}
                            <div className="grid grid-cols-4 gap-1 flex-1">
                              {/* Days */}
                              <div className={cn("bg-gradient-to-br", gatesClosed ? "from-yellow-500 via-orange-500 to-orange-600" : "from-red-500 via-red-600 to-red-700", "rounded px-1 py-1 shadow-lg ring-1", gatesClosed ? "ring-yellow-300/20" : "ring-red-300/20")}>
                                <div className="text-sm font-bold text-white mb-0.5 font-poppins drop-shadow-md">
                                  {timeLeft.days.toString().padStart(2, "0")}
                                </div>
                                <div className={cn("text-2xs", gatesClosed ? "text-yellow-100" : "text-red-100", "font-medium")}>DAYS</div>
                              </div>

                              {/* Hours */}
                              <div className={cn("bg-gradient-to-br", gatesClosed ? "from-yellow-500 via-orange-500 to-orange-600" : "from-red-500 via-red-600 to-red-700", "rounded px-1 py-1 shadow-lg ring-1", gatesClosed ? "ring-yellow-300/20" : "ring-red-300/20")}>
                                <div className="text-sm font-bold text-white mb-0.5 font-poppins drop-shadow-md">
                                  {timeLeft.hours.toString().padStart(2, "0")}
                                </div>
                                <div className={cn("text-2xs", gatesClosed ? "text-yellow-100" : "text-red-100", "font-medium")}>HRS</div>
                              </div>

                              {/* Minutes */}
                              <div className={cn("bg-gradient-to-br", gatesClosed ? "from-yellow-500 via-orange-500 to-orange-600" : "from-red-500 via-red-600 to-red-700", "rounded px-1 py-1 shadow-lg ring-1", gatesClosed ? "ring-yellow-300/20" : "ring-red-300/20")}>
                                <div className="text-sm font-bold text-white mb-0.5 font-poppins drop-shadow-md">
                                  {timeLeft.minutes.toString().padStart(2, "0")}
                                </div>
                                <div className={cn("text-2xs", gatesClosed ? "text-yellow-100" : "text-red-100", "font-medium")}>MINS</div>
                              </div>

                              {/* Seconds */}
                              <div className={cn("bg-gradient-to-br", gatesClosed ? "from-yellow-500 via-orange-500 to-orange-600" : "from-red-500 via-red-600 to-red-700", "rounded px-1 py-1 shadow-lg ring-1", gatesClosed ? "ring-yellow-300/20" : "ring-red-300/20")}>
                                <div className="text-sm font-bold text-white mb-0.5 font-poppins drop-shadow-md">
                                  {timeLeft.seconds.toString().padStart(2, "0")}
                                </div>
                                <div className={cn("text-2xs", gatesClosed ? "text-yellow-100" : "text-red-100", "font-medium")}>SECS</div>
                              </div>
                            </div>

                            {/* Visit Page/Enter Now Button - Same size as countdown cards */}
                            <span className="relative flex-shrink-0">
                              {hasMultiplier && (
                                <span className="pointer-events-none absolute -top-4 -right-3 z-20 rotate-6">
                                  <PromoBadgeImage
                                    multiplier={membershipMultiplier as PromoMultiplier}
                                    size="small"
                                    className="h-9 w-auto drop-shadow-lg"
                                  />
                                </span>
                              )}
                              <button
                                onClick={handleViewDetails}
                                className="px-4 py-3 text-xs whitespace-nowrap bg-gradient-to-r from-amber-300 via-yellow-400 to-orange-500 text-black rounded-lg font-extrabold shadow-[0_4px_14px_rgba(251,191,36,0.5)] ring-2 ring-white/70 active:translate-y-px transition-all"
                              >
                                {gatesClosed ? "Visit Page" : "Enter Now"}
                              </button>
                            </span>
                          </div>
                        )
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
};

// Suspense self-wrap: useSearchParams requires a boundary for prerendered (marketing-class) pages — docs/security-csp/rules.md R8.
export default function FloatingCountdownBanner(props: FloatingCountdownBannerProps) {
  return (
    <Suspense fallback={null}>
      <FloatingCountdownBannerInner {...props} />
    </Suspense>
  );
}
