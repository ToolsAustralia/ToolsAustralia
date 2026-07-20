"use client";

import React, { useState, useEffect, Suspense, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Lock } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCurrentMajorDraw, useNextDraw } from "@/hooks/queries/useMajorDrawQueries";
import { useLeafTimer } from "@/hooks/useLeafTimer";
import { cn } from "@/utils/cn";
import { addRAFScrollListener } from "@/utils/dom/listenerHelpers";

interface FloatingCountdownBannerProps {
  className?: string;
}

interface FloatingTimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

// Leaf component owning the 1s tick. Lives inside the host shell — host's
// scroll-visibility and other state stay in the host without being re-rendered
// on every tick. The leaf computes timeLeft + isExpired and passes them to the
// render prop.
function FloatingCountdownLeaf({
  targetMs,
  render,
}: {
  targetMs: number | null;
  render: (state: { timeLeft: FloatingTimeLeft; isExpired: boolean }) => ReactNode;
}) {
  const now = useLeafTimer(1000);
  let timeLeft: FloatingTimeLeft = { days: 0, hours: 0, minutes: 0, seconds: 0 };
  let isExpired = true;
  if (targetMs !== null && !Number.isNaN(targetMs)) {
    const difference = targetMs - now;
    if (difference > 0) {
      timeLeft = {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((difference % (1000 * 60)) / 1000),
      };
      isExpired = false;
    }
  }
  return <>{render({ timeLeft, isExpired })}</>;
}

const FloatingCountdownBannerInner: React.FC<FloatingCountdownBannerProps> = ({ className = "" }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false); // For hover/click override
  const [isDismissed, setIsDismissed] = useState(false);
  const [isReady, setIsReady] = useState(false); // Wait for data to load
  const [drawName, setDrawName] = useState<string | null>(null);
  const [nextDrawName, setNextDrawName] = useState<string | null>(null);
  const [isVisibleOnScroll, setIsVisibleOnScroll] = useState(false); // For my-account: hide at top, show when scrolled
  const [isAtBottom, setIsAtBottom] = useState(false); // For my-account: hide at bottom

  const { data: currentMajorDraw, isLoading } = useCurrentMajorDraw();
  const { data: nextDraw } = useNextDraw();

  // Determine gate state
  const gatesClosed = currentMajorDraw?.status !== "active";

  // Countdown target — the actual 1s tick happens inside <FloatingCountdownLeaf>
  // so this host doesn't re-render every second. When gates closed we count
  // down to the next draw's activationDate; otherwise to the current drawDate.
  const targetDateString =
    gatesClosed && nextDraw?.activationDate ? nextDraw.activationDate : currentMajorDraw?.drawDate;
  const targetMs = targetDateString ? new Date(targetDateString).getTime() : null;

  // Only show when data is ready
  useEffect(() => {
    if (currentMajorDraw && !isLoading) {
      // Add small delay to ensure first calculation completes
      setTimeout(() => setIsReady(true), 100);
    }
  }, [currentMajorDraw, isLoading]);

  // Fetch draw name for display
  useEffect(() => {
    if (gatesClosed && nextDraw) {
      // When gates closed, show next draw name
      setNextDrawName(nextDraw.name || null);
      setDrawName(null);
    } else if (currentMajorDraw) {
      // When gates open, show current draw name
      setDrawName(currentMajorDraw.name || null);
      setNextDrawName(null);
    } else {
      setDrawName(null);
      setNextDrawName(null);
    }
  }, [currentMajorDraw, nextDraw, gatesClosed]);

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

  // Navigate to the promotions gallery landing (not a specific prize slug).
  const handleViewDetails = () => {
    // Preserve affiliate code from URL if present (App Router compatible)
    const affiliateCode = searchParams.get("aff");
    const newUrl = affiliateCode ? `/promotions?aff=${affiliateCode}` : "/promotions";
    router.push(newUrl);
  };

  // Don't render if dismissed or not ready
  if (isDismissed || !isReady) {
    return null;
  }

  // On my-account: hide at top or at bottom
  if (isMyAccountPage && (!isVisibleOnScroll || isAtBottom)) {
    return null;
  }

  const isCollapsedState = isCollapsed && !isExpanded;

  return (
    <AnimatePresence>
      {isReady && !isDismissed && (
        <motion.div
          data-floating-widget="true"
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className={cn("fixed bottom-10 sm:bottom-12 left-0 right-0 z-50 flex justify-center pointer-events-none", className)}
        >
          <motion.div
            animate={{
              scale: isCollapsedState ? 0.95 : 1,
            }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            onMouseEnter={() => !isCollapsed && setIsExpanded(true)}
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
                    <h3 className="text-sm sm:text-base font-bold text-white font-['Poppins'] leading-tight">
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
                        <h3 className="text-sm sm:text-base font-bold text-white font-['Poppins'] leading-tight break-words">
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
                      <FloatingCountdownLeaf
                        targetMs={targetMs}
                        render={({ timeLeft, isExpired }) =>
                          isExpired ? (
                            <div className="text-center">
                              <div className="text-2xl sm:text-3xl font-bold text-red-400 mb-2 font-['Poppins']">
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
                                <div className="text-lg sm:text-xl font-bold text-white mb-0.5 font-['Poppins'] drop-shadow-md">
                                  {timeLeft.days.toString().padStart(2, "0")}
                                </div>
                                <div className={cn("text-xs", gatesClosed ? "text-yellow-100" : "text-red-100", "font-medium")}>DAYS</div>
                              </div>

                              {/* Hours */}
                              <div className={cn("bg-gradient-to-br", gatesClosed ? "from-yellow-500 via-orange-500 to-orange-600" : "from-red-500 via-red-600 to-red-700", "rounded-lg px-2 py-2 sm:px-4 sm:py-2 shadow-lg w-full ring-2", gatesClosed ? "ring-yellow-300/20" : "ring-red-300/20")}>
                                <div className="text-lg sm:text-xl font-bold text-white mb-0.5 font-['Poppins'] drop-shadow-md">
                                  {timeLeft.hours.toString().padStart(2, "0")}
                                </div>
                                <div className={cn("text-xs", gatesClosed ? "text-yellow-100" : "text-red-100", "font-medium")}>HRS</div>
                              </div>

                              {/* Minutes */}
                              <div className={cn("bg-gradient-to-br", gatesClosed ? "from-yellow-500 via-orange-500 to-orange-600" : "from-red-500 via-red-600 to-red-700", "rounded-lg px-2 py-2 sm:px-4 sm:py-2 shadow-lg w-full ring-2", gatesClosed ? "ring-yellow-300/20" : "ring-red-300/20")}>
                                <div className="text-lg sm:text-xl font-bold text-white mb-0.5 font-['Poppins'] drop-shadow-md">
                                  {timeLeft.minutes.toString().padStart(2, "0")}
                                </div>
                                <div className={cn("text-xs", gatesClosed ? "text-yellow-100" : "text-red-100", "font-medium")}>MINS</div>
                              </div>

                              {/* Seconds */}
                              <div className={cn("bg-gradient-to-br", gatesClosed ? "from-yellow-500 via-orange-500 to-orange-600" : "from-red-500 via-red-600 to-red-700", "rounded-lg px-2 py-2 sm:px-4 sm:py-2 shadow-lg w-full ring-2", gatesClosed ? "ring-yellow-300/20" : "ring-red-300/20")}>
                                <div className="text-lg sm:text-xl font-bold text-white mb-0.5 font-['Poppins'] drop-shadow-md">
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
                    <div className="flex justify-center sm:justify-end sm:col-span-3">
                      <button
                        onClick={handleViewDetails}
                        className="group bg-gradient-to-r from-yellow-500 via-yellow-600 to-orange-600 hover:from-yellow-600 hover:via-orange-600 hover:to-red-600 text-black px-6 py-2 sm:px-4 sm:py-2 rounded-lg font-semibold text-xs sm:text-sm shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105 flex items-center justify-center gap-1 w-[200px] sm:w-auto ring-2 ring-yellow-300/30"
                      >
                        <span>{gatesClosed ? "Visit Page" : "Enter Now"}</span>
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
                      <p className="text-sm sm:text-base font-semibold text-yellow-400 font-['Poppins']">
                        {gatesClosed
                          ? (nextDrawName ? `Next Draw: ${nextDrawName}` : "Come back when the next draw opens")
                          : (drawName || "UNTIL NEXT LIVE DRAW")}
                      </p>
                    </div>

                    <FloatingCountdownLeaf
                      targetMs={targetMs}
                      render={({ timeLeft, isExpired }) =>
                        isExpired ? (
                          <div className="text-center">
                            <div className="text-xl font-bold text-red-400 mb-2 font-['Poppins']">DRAW IN PROGRESS!</div>
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
                                <div className="text-sm font-bold text-white mb-0.5 font-['Poppins'] drop-shadow-md">
                                  {timeLeft.days.toString().padStart(2, "0")}
                                </div>
                                <div className={cn("text-2xs", gatesClosed ? "text-yellow-100" : "text-red-100", "font-medium")}>DAYS</div>
                              </div>

                              {/* Hours */}
                              <div className={cn("bg-gradient-to-br", gatesClosed ? "from-yellow-500 via-orange-500 to-orange-600" : "from-red-500 via-red-600 to-red-700", "rounded px-1 py-1 shadow-lg ring-1", gatesClosed ? "ring-yellow-300/20" : "ring-red-300/20")}>
                                <div className="text-sm font-bold text-white mb-0.5 font-['Poppins'] drop-shadow-md">
                                  {timeLeft.hours.toString().padStart(2, "0")}
                                </div>
                                <div className={cn("text-2xs", gatesClosed ? "text-yellow-100" : "text-red-100", "font-medium")}>HRS</div>
                              </div>

                              {/* Minutes */}
                              <div className={cn("bg-gradient-to-br", gatesClosed ? "from-yellow-500 via-orange-500 to-orange-600" : "from-red-500 via-red-600 to-red-700", "rounded px-1 py-1 shadow-lg ring-1", gatesClosed ? "ring-yellow-300/20" : "ring-red-300/20")}>
                                <div className="text-sm font-bold text-white mb-0.5 font-['Poppins'] drop-shadow-md">
                                  {timeLeft.minutes.toString().padStart(2, "0")}
                                </div>
                                <div className={cn("text-2xs", gatesClosed ? "text-yellow-100" : "text-red-100", "font-medium")}>MINS</div>
                              </div>

                              {/* Seconds */}
                              <div className={cn("bg-gradient-to-br", gatesClosed ? "from-yellow-500 via-orange-500 to-orange-600" : "from-red-500 via-red-600 to-red-700", "rounded px-1 py-1 shadow-lg ring-1", gatesClosed ? "ring-yellow-300/20" : "ring-red-300/20")}>
                                <div className="text-sm font-bold text-white mb-0.5 font-['Poppins'] drop-shadow-md">
                                  {timeLeft.seconds.toString().padStart(2, "0")}
                                </div>
                                <div className={cn("text-2xs", gatesClosed ? "text-yellow-100" : "text-red-100", "font-medium")}>SECS</div>
                              </div>
                            </div>

                            {/* Visit Page/Enter Now Button - Same size as countdown cards */}
                            <button
                              onClick={handleViewDetails}
                              className="px-3 py-3 text-xs bg-gradient-to-r from-yellow-500 via-yellow-600 to-orange-600 text-black rounded font-semibold"
                            >
                              {gatesClosed ? "Visit Page" : "Enter Now"}
                            </button>
                          </div>
                        )
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
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
