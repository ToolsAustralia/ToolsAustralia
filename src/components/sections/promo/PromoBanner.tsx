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
  const bgColorClass = "bg-gradient-to-r from-gray-900 via-gray-800 to-black";

  return (
    <>
      {/* Placeholder div to maintain space and prevent layout shift when banner becomes fixed */}
      {isScrolled && <div className="h-16 sm:h-20" aria-hidden="true" />}

      <motion.div
        layout
        className={`${
          isScrolled
            ? "fixed top-4 left-2 right-2 sm:left-8 sm:right-8 lg:left-16 lg:right-16 z-50"
            : "relative w-full mt-0 z-30"
        } ${bgColorClass} shadow-2xl border-b-2 border-red-500/50`}
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
          className="h-16 sm:h-20 flex items-center justify-center px-4 sm:px-6 lg:px-8 relative overflow-hidden"
          animate={{
            paddingLeft: isScrolled ? "1rem" : "1rem",
            paddingRight: isScrolled ? "1rem" : "1rem",
          }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        >
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-10 pattern-dots-white"></div>

          {/* Main Content */}
          <div className="relative z-10 flex items-center justify-between w-full">
            {/* Left Side - Alert Message with Enhanced Styling */}
            <div className="flex items-center gap-3">
              <p className="text-left text-[15px] lg:text-[30px] font-['Poppins'] leading-tight">
                <span className="text-white font-black tracking-wide uppercase">FIRST 500 PEOPLE</span>
                <br />
                <span className="text-yellow-300 font-bold uppercase">GET {multiplier}X ENTRIES</span>
              </p>
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
