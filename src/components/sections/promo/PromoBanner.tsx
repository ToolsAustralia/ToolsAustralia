"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { usePromoByType } from "@/hooks/queries/usePromoQueries";
import { getNextMidnightAEST } from "@/utils/common/timezone";
import { useSidebar } from "@/contexts/SidebarContext";

/**
 * PromoBanner Component
 * Displays a promo banner with countdown timer
 * - Syncs with MembershipSection active tab (membership or one-time)
 * - Shows appropriate promo based on active tab
 * - Hides when sidebar is open or on 404 page
 */
export default function PromoBanner() {
  const pathname = usePathname();
  const { isAnySidebarOpen } = useSidebar();
  const [activeTab, setActiveTab] = useState<"membership" | "one-time">("membership");

  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  const [isScrolled, setIsScrolled] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  // Check if desktop viewport
  useEffect(() => {
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };

    checkDesktop();
    window.addEventListener("resize", checkDesktop);
    return () => window.removeEventListener("resize", checkDesktop);
  }, []);

  // Get promos for each type
  const { data: membershipPromo } = usePromoByType("membership-packages");
  const { data: oneTimePromo } = usePromoByType("one-time-packages");

  // 24-hour looping countdown timer (resets at midnight AEST - Australian business day)
  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      // Get next midnight in AEST timezone (Australian business day boundary)
      const nextMidnight = getNextMidnightAEST();

      const difference = nextMidnight.getTime() - now.getTime();

      // Calculate time remaining until next midnight AEST
      const totalSeconds = Math.max(0, Math.floor(difference / 1000));
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      setTimeLeft({
        days: 0, // Always 0 for 24-hour countdown
        hours,
        minutes,
        seconds,
      });
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);

    return () => clearInterval(timer);
  }, []);

  // Listen for tab changes from MembershipSection
  useEffect(() => {
    const handleTabChange = (event: CustomEvent<{ activeTab: "membership" | "one-time" }>) => {
      setActiveTab(event.detail.activeTab);
    };

    window.addEventListener("membershipTabChanged", handleTabChange as EventListener);

    return () => {
      window.removeEventListener("membershipTabChanged", handleTabChange as EventListener);
    };
  }, []);

  // Handle scroll detection - show fixed banner when user scrolls past threshold, revert when back to top
  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrollY = window.scrollY;
          // Trigger fixed position with minimal scroll on mobile, more on desktop
          const isMobile = window.innerWidth < 1024;
          const scrollThreshold = isMobile ? 100 : 200;

          // Toggle based on scroll position - can go back and forth
          setIsScrolled(scrollY > scrollThreshold);

          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Initial check

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Determine which promo to display based on active tab
  const getActivePromo = () => {
    if (activeTab === "membership") {
      return membershipPromo;
    } else {
      return oneTimePromo;
    }
  };

  const activePromo = getActivePromo();

  // Get multiplier for dynamic text (default to 10x if no promo)
  const multiplier = activePromo?.multiplier || 10;

  // Don't render if:
  // - On 404 page
  // - Sidebar is open
  // - No active promo for current context
  if (pathname === "/not-found" || isAnySidebarOpen || !activePromo) {
    return null;
  }

  // Keep the banner below the header by default; only float it once scrolled for visibility.
  // Use wrapper to prevent layout shift when banner becomes fixed
  const bgColorClass = "bg-black";

  return (
    <>
      <motion.div
        layout
        className={`${
          isScrolled
            ? "fixed top-4 left-2 right-2 sm:left-8 sm:right-8 lg:left-16 lg:right-16 z-50"
            : "relative w-full mt-0 z-30"
        } ${bgColorClass}`}
        style={{
          boxShadow: `
            0 10px 40px rgba(0, 0, 0, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.1),
            inset 0 -1px 0 rgba(0, 0, 0, 0.3)
          `,
          ...(isScrolled
            ? { border: "2px solid rgba(251, 191, 36, 0.5)" }
            : { borderBottom: "2px solid rgba(239, 68, 68, 0.6)" }),
        }}
        animate={{
          borderRadius: isScrolled ? "9999px" : "0px",
          padding: isScrolled ? "0.5rem" : "0",
        }}
        transition={{
          duration: 0.5,
          ease: "easeInOut",
          layout: { duration: 0.5, ease: "easeInOut" },
        }}
      >
        <motion.div
          className="min-h-16 sm:min-h-20 py-2 sm:py-2.5 flex items-center justify-center px-4 sm:px-6 lg:px-8 relative overflow-hidden"
          animate={{
            paddingLeft: isScrolled ? "1rem" : "1rem",
            paddingRight: isScrolled ? "1rem" : "1rem",
          }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        >
          {/* Main Content */}
          <div className="relative z-10 flex items-center justify-between w-full">
            {/* Left Side - Vertical Stack Layout */}
            <div className="flex flex-col items-start">
              {/* Wrapper to match widths */}
              <div className="flex flex-col items-start w-fit gap-1 sm:gap-4 lg:gap-2">
                {/* First Line - "FIRST 500 PEOPLE" Badge - Matches width of second line */}
                <div className="relative w-full">
                  {/* Outer glow effect - pulsing animation */}
                  <div
                    className="absolute inset-0 rounded-full animate-pulse"
                    style={{
                      background: `radial-gradient(circle, rgba(251, 191, 36, 0.5) 0%, rgba(245, 158, 11, 0.3) 40%, rgba(217, 119, 6, 0.15) 70%, transparent 100%)`,
                      filter: "blur(5px)",
                      transform: "scale(1.08)",
                      zIndex: 0,
                    }}
                  />

                  {/* Main badge container - Gold gradient with depth - Matches second line width */}
                  <div
                    className="relative w-full px-2 py-0.5 sm:px-2.5 sm:py-1 lg:px-3 lg:py-1.5 rounded-full flex items-center justify-center overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, 
                      #ffd700 0%, 
                      #ffed4e 20%, 
                      #fbbf24 40%, 
                      #f59e0b 60%, 
                      #d97706 80%, 
                      #b45309 100%
                    )`,
                      boxShadow: `
                      0 0 15px rgba(251, 191, 36, 0.6),
                      0 0 30px rgba(245, 158, 11, 0.3),
                      0 4px 16px rgba(0, 0, 0, 0.4),
                      inset 0 1px 4px rgba(255, 255, 255, 0.4),
                      inset 0 -1px 4px rgba(0, 0, 0, 0.3)
                    `,
                      border: "1.5px solid rgba(255, 255, 255, 0.3)",
                      zIndex: 1,
                    }}
                  >
                    {/* Metallic shine effect - matching BestChanceBadge style */}
                    <div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent transform -skew-x-12 rounded-full"
                      style={{
                        background: `linear-gradient(135deg, transparent 0%, rgba(255, 255, 255, 0.4) 25%, rgba(255, 255, 255, 0.6) 50%, rgba(255, 255, 255, 0.4) 75%, transparent 100%)`,
                        animation: "shimmer 2s infinite",
                        zIndex: 2,
                      }}
                    />

                    {/* Hot edge highlight - top and left edges */}
                    <div
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: `linear-gradient(135deg, 
                        rgba(255, 255, 255, 0.7) 0%, 
                        rgba(255, 240, 180, 0.6) 15%, 
                        transparent 30%, 
                        transparent 100%
                      )`,
                        zIndex: 2,
                      }}
                    />

                    {/* Text content - centered */}
                    <span
                      className="relative z-10 text-white font-black tracking-wider uppercase text-[13px] sm:text-[13px] lg:text-[16px] whitespace-nowrap"
                      style={{
                        textShadow: `
                        0 0 6px rgba(255, 255, 255, 0.8),
                        0 0 12px rgba(255, 240, 180, 0.6),
                        0 1px 3px rgba(0, 0, 0, 0.8),
                        0 2px 6px rgba(0, 0, 0, 0.6)
                      `,
                        filter: "drop-shadow(0 0 3px rgba(255, 255, 255, 0.5))",
                      }}
                    >
                      FIRST 500 PEOPLE
                    </span>
                  </div>
                </div>

                {/* Second Line - "GET 2x ENTRIES" with Metallic Text */}
                {/* Second Line - "GET 2x ENTRIES" - Matches width of first line */}
                <div className="w-full flex items-center justify-center">
                  <span className="font-black uppercase text-[15px] sm:text-[15px] lg:text-[18px] tracking-wide text-center">
                    {/* "GET" text - White */}
                    <span className="text-white">GET </span>

                    {/* "2X" with fiery effect - readable on dark background */}
                    <span className="text-red-500">{multiplier}X</span>

                    {/* "ENTRIES" text - White */}
                    <span className="text-white"> ENTRIES</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Right Side - Enhanced Countdown (24-hour looping timer) */}
            <motion.div
              className="flex items-center justify-center gap-1 sm:gap-2 lg:gap-3"
              layout
              transition={{ duration: 0.5, ease: "easeInOut" }}
            >
              {/* 24-hour countdown only shows hours, minutes, seconds (no days) */}
              <motion.div
                className="bg-gradient-to-br from-red-500 via-red-600 to-red-700 rounded-lg shadow-lg ring-2 ring-red-300/20 text-center"
                animate={{
                  width: isDesktop ? "5rem" : "3rem",
                  paddingLeft: isDesktop ? "1rem" : "0.5rem",
                  paddingRight: isDesktop ? "1rem" : "0.5rem",
                  paddingTop: isDesktop ? "0.75rem" : "0.25rem",
                  paddingBottom: isDesktop ? "0.75rem" : "0.25rem",
                }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
              >
                <div
                  className={`text-white font-black font-['Poppins'] drop-shadow-md ${
                    isScrolled ? "text-sm sm:text-sm lg:text-xl" : "text-sm sm:text-sm lg:text-xl"
                  }`}
                >
                  {timeLeft.hours.toString().padStart(2, "0")}
                </div>
                <div
                  className={`text-red-100 font-medium ${
                    isScrolled ? "text-[10px] sm:text-[10px] lg:text-sm" : "text-[10px] sm:text-[10px] lg:text-sm"
                  }`}
                >
                  HRS
                </div>
              </motion.div>
              <motion.div
                className="bg-gradient-to-br from-red-500 via-red-600 to-red-700 rounded-lg shadow-lg ring-2 ring-red-300/20 text-center"
                animate={{
                  width: isDesktop ? "5rem" : "3rem",
                  paddingLeft: isDesktop ? "1rem" : "0.5rem",
                  paddingRight: isDesktop ? "1rem" : "0.5rem",
                  paddingTop: isDesktop ? "0.75rem" : "0.25rem",
                  paddingBottom: isDesktop ? "0.75rem" : "0.25rem",
                }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
              >
                <div
                  className={`text-white font-black font-['Poppins'] drop-shadow-md ${
                    isScrolled ? "text-sm sm:text-sm lg:text-xl" : "text-sm sm:text-sm lg:text-xl"
                  }`}
                >
                  {timeLeft.minutes.toString().padStart(2, "0")}
                </div>
                <div
                  className={`text-red-100 font-medium ${
                    isScrolled ? "text-[10px] sm:text-[10px] lg:text-sm" : "text-[10px] sm:text-[10px] lg:text-sm"
                  }`}
                >
                  MINS
                </div>
              </motion.div>
              <motion.div
                className="bg-gradient-to-br from-red-500 via-red-600 to-red-700 rounded-lg shadow-lg ring-2 ring-red-300/20 text-center"
                animate={{
                  width: isDesktop ? "5rem" : "3rem",
                  paddingLeft: isDesktop ? "1rem" : "0.5rem",
                  paddingRight: isDesktop ? "1rem" : "0.5rem",
                  paddingTop: isDesktop ? "0.75rem" : "0.25rem",
                  paddingBottom: isDesktop ? "0.75rem" : "0.25rem",
                }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
              >
                <div
                  className={`text-white font-black font-['Poppins'] drop-shadow-md ${
                    isScrolled ? "text-sm sm:text-sm lg:text-xl" : "text-sm sm:text-sm lg:text-xl"
                  }`}
                >
                  {timeLeft.seconds.toString().padStart(2, "0")}
                </div>
                <div
                  className={`text-red-100 font-medium ${
                    isScrolled ? "text-[10px] sm:text-[10px] lg:text-sm" : "text-[10px] sm:text-[10px] lg:text-sm"
                  }`}
                >
                  SECS
                </div>
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}
