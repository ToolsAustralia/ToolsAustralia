"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { usePromoByType } from "@/hooks/queries/usePromoQueries";
import { useSidebar } from "@/contexts/SidebarContext";
import { useMajorDrawCountdown } from "@/hooks/queries/useMajorDrawQueries";
import { useActivePromoBannerText } from "@/hooks/queries/usePromoBannerTextQueries";
import { useQueryClient } from "@tanstack/react-query";
import { getNextMidnightAEST, convertUTCToAEST, formatDateInAEST, getNowInAEST } from "@/utils/common/timezone";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import type { ServerPromo } from "@/utils/database/queries/promo-queries";
import { calculateFontSize } from "@/utils/promo-banner/font-size-calculator";
import { getAlternatingDefaultText } from "@/utils/promo-banner/default-text-manager";

// Helper function to get current timezone abbreviation (AEST or AEDT)
const getTimezoneAbbr = (): string => {
  try {
    const now = new Date();
    const AEST_TIMEZONE = "Australia/Sydney";
    const formatter = new Intl.DateTimeFormat("en-AU", {
      timeZone: AEST_TIMEZONE,
      timeZoneName: "short",
    });
    const parts = formatter.formatToParts(now);
    const tzPart = parts.find((part) => part.type === "timeZoneName");
    return tzPart?.value || "AEDT"; // Default to AEDT if not found
  } catch {
    // Fallback: check offset to determine AEST (UTC+10) vs AEDT (UTC+11)
    const now = new Date();
    const AEST_TIMEZONE = "Australia/Sydney";
    const zonedDate = toZonedTime(now, AEST_TIMEZONE);
    const utcTime = now.getTime();
    const zonedTime = zonedDate.getTime();
    const offsetHours = (utcTime - zonedTime) / (1000 * 60 * 60);
    return offsetHours === -10 ? "AEST" : "AEDT";
  }
};

/**
 * PromoBanner Component
 * Displays a promo banner with countdown timer
 * - Syncs with MembershipSection active tab (membership or one-time)
 * - Shows appropriate promo based on active tab
 * - Hides when sidebar is open or on 404 page
 * - Accepts initial data from server-side for faster initial render
 */
interface PromoBannerProps {
  initialMembershipPromo?: ServerPromo | null;
  initialOneTimePromo?: ServerPromo | null;
}

export default function PromoBanner({ initialMembershipPromo, initialOneTimePromo }: PromoBannerProps) {
  const pathname = usePathname();
  const { isAnySidebarOpen } = useSidebar();
  const { targetDateMs, currentDraw } = useMajorDrawCountdown();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"membership" | "one-time">("membership");

  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  const [freezeTimeLeft, setFreezeTimeLeft] = useState({
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  const [isScrolled, setIsScrolled] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);
  const [bannerHeight, setBannerHeight] = useState<number | null>(null);
  const [timezoneAbbr, setTimezoneAbbr] = useState<string>("AEDT");
  const [isMobile, setIsMobile] = useState(false);

  // Fetch active scheduled banner text
  const { data: activeBannerTextData } = useActivePromoBannerText();
  const activeScheduledText = activeBannerTextData?.data?.text;

  // Store alternating default text in state - only updates once per day (AEST)
  const [alternatingDefault, setAlternatingDefault] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return getAlternatingDefaultText();
    }
    return "BIGGEST BONUS"; // Default for SSR
  });

  // Detect mobile viewport for font sizing
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640); // sm breakpoint
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Get promos for each type (use initial data if available, fallback to client-side fetch)
  const { data: membershipPromoClient } = usePromoByType("membership-packages");
  const { data: oneTimePromoClient } = usePromoByType("one-time-packages");

  // Use initial data if available, otherwise use client-fetched data
  const membershipPromo = initialMembershipPromo || membershipPromoClient;
  const oneTimePromo = initialOneTimePromo || oneTimePromoClient;

  // Get timezone abbreviation on mount and update periodically
  useEffect(() => {
    setTimezoneAbbr(getTimezoneAbbr());
    // Update timezone every hour in case DST changes
    const interval = setInterval(() => {
      setTimezoneAbbr(getTimezoneAbbr());
    }, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Automatic midnight AEST/AEDT detection and update
  // This ensures banner text updates automatically at midnight without manual intervention
  useEffect(() => {
    if (typeof window === "undefined") return;

    const scheduleMidnightUpdate = () => {
      const now = new Date();
      const nextMidnight = getNextMidnightAEST();
      const msUntilMidnight = nextMidnight.getTime() - now.getTime();

      // Schedule update exactly at midnight AEST/AEDT
      const timeoutId = setTimeout(() => {
        // Invalidate React Query cache to force refetch of active scheduled text
        queryClient.invalidateQueries({ queryKey: ["promo-banner-text", "active"] });
        
        // Update alternating default text for new day
        setAlternatingDefault(getAlternatingDefaultText());
        
        // Reschedule for next midnight
        scheduleMidnightUpdate();
      }, Math.max(0, msUntilMidnight)); // Ensure non-negative

      return timeoutId;
    };

    // Initial schedule
    let timeoutId = scheduleMidnightUpdate();

    // Fallback: Check every minute to catch any missed updates
    const fallbackInterval = setInterval(() => {
      const nowAEST = getNowInAEST();
      const currentDateStr = `${nowAEST.getFullYear()}-${String(nowAEST.getMonth() + 1).padStart(2, "0")}-${String(nowAEST.getDate()).padStart(2, "0")}`;
      const lastCheckedDate = sessionStorage.getItem("lastBannerCheckDate");
      
      if (lastCheckedDate !== currentDateStr) {
        // Day changed - update everything
        sessionStorage.setItem("lastBannerCheckDate", currentDateStr);
        queryClient.invalidateQueries({ queryKey: ["promo-banner-text", "active"] });
        setAlternatingDefault(getAlternatingDefaultText());
        
        // Reschedule midnight timeout
        clearTimeout(timeoutId);
        timeoutId = scheduleMidnightUpdate();
      }
    }, 60 * 1000); // Check every minute

    // Initialize last checked date
    const nowAEST = getNowInAEST();
    const currentDateStr = `${nowAEST.getFullYear()}-${String(nowAEST.getMonth() + 1).padStart(2, "0")}-${String(nowAEST.getDate()).padStart(2, "0")}`;
    sessionStorage.setItem("lastBannerCheckDate", currentDateStr);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(fallbackInterval);
    };
  }, [queryClient]);

  // Countdown strategy:
  // - If within 48h of freeze/draw, show precise countdown to freeze (24h tiles but hours can run >24).
  // - Otherwise keep the 24h business-day loop to next midnight AEST.
  useEffect(() => {
    const fortyEightHoursMs = 48 * 60 * 60 * 1000;

    const updateCountdown = () => {
      const now = Date.now();
      const freezeMs = targetDateMs ? Math.max(0, targetDateMs - now) : 0;

      if (!targetDateMs || freezeMs > fortyEightHoursMs) {
        // Business-day loop to next midnight AEST
        const nextMidnight = getNextMidnightAEST();
        const diffMs = Math.max(0, nextMidnight.getTime() - now);
        const totalSeconds = Math.floor(diffMs / 1000);
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;

        setTimeLeft((prev) =>
          prev.hours === h && prev.minutes === m && prev.seconds === s
            ? prev
            : { days: 0, hours: h, minutes: m, seconds: s }
        );
        return;
      }

      // Within 48h: precise freeze countdown (aggregate hours for clarity)
      const totalSeconds = Math.floor(freezeMs / 1000);
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;

      setTimeLeft((prev) =>
        prev.hours === h && prev.minutes === m && prev.seconds === s
          ? prev
          : { days: 0, hours: h, minutes: m, seconds: s }
      );
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [targetDateMs]);

  // Separate countdown for freeze time when draw is tonight
  useEffect(() => {
    if (!currentDraw?.freezeEntriesAt) return;

    const updateFreezeCountdown = () => {
      const now = Date.now();
      const freezeDate = new Date(currentDraw.freezeEntriesAt!).getTime();
      const freezeMs = Math.max(0, freezeDate - now);

      const totalSeconds = Math.floor(freezeMs / 1000);
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;

      setFreezeTimeLeft((prev) =>
        prev.hours === h && prev.minutes === m && prev.seconds === s
          ? prev
          : { hours: h, minutes: m, seconds: s }
      );
    };

    updateFreezeCountdown();
    const timer = setInterval(updateFreezeCountdown, 1000);
    return () => clearInterval(timer);
  }, [currentDraw?.freezeEntriesAt]);

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

  // Helper function to determine if draw is today or tomorrow (in AEST)
  const getDrawDateStatus = (): "today" | "tomorrow" | null => {
    if (!currentDraw?.drawDate) return null;

    const drawDateUTC = new Date(currentDraw.drawDate);
    const drawDateAEST = convertUTCToAEST(drawDateUTC);
    const nowAEST = convertUTCToAEST(new Date());

    // Compare calendar days (YYYY-MM-DD)
    const drawDateStr = `${drawDateAEST.getFullYear()}-${String(drawDateAEST.getMonth() + 1).padStart(2, "0")}-${String(drawDateAEST.getDate()).padStart(2, "0")}`;
    const todayStr = `${nowAEST.getFullYear()}-${String(nowAEST.getMonth() + 1).padStart(2, "0")}-${String(nowAEST.getDate()).padStart(2, "0")}`;

    // Calculate tomorrow's date string
    const tomorrowAEST = new Date(nowAEST);
    tomorrowAEST.setDate(tomorrowAEST.getDate() + 1);
    const tomorrowStr = `${tomorrowAEST.getFullYear()}-${String(tomorrowAEST.getMonth() + 1).padStart(2, "0")}-${String(tomorrowAEST.getDate()).padStart(2, "0")}`;

    if (drawDateStr === todayStr) {
      return "today";
    } else if (drawDateStr === tomorrowStr) {
      return "tomorrow";
    }

    return null;
  };

  // Determine badge text based on priority:
  // 1. Draw status ("DRAWN TONIGHT" / "DRAWN TOMORROW") - Highest priority
  // 2. Active scheduled text (from service layer, resolved in AEST)
  // 3. Alternating default texts ("BIGGEST BONUS" / "FIRST 500 PEOPLE")
  const getBadgeText = (): string => {
    // Priority 1: Draw status (highest priority)
    const drawStatus = getDrawDateStatus();
    if (drawStatus === "today") {
      return "DRAWN TONIGHT";
    } else if (drawStatus === "tomorrow") {
      return "DRAWN TOMORROW";
    }

    // Priority 2: Active scheduled text
    if (activeScheduledText) {
      return activeScheduledText;
    }

    // Priority 3: Alternating default fallback (use state, not function call)
    // This prevents the text from changing on every render
    return alternatingDefault;
  };

  // Calculate dynamic font size based on text length
  const badgeText = getBadgeText();
  const fontSize = calculateFontSize(badgeText, isMobile);

  // Get formatted draw time for display
  const getDrawTimeText = (): string | null => {
    if (!currentDraw?.drawDate) return null;
    return formatDateInAEST(new Date(currentDraw.drawDate), "h:mm a");
  };

  // Measure banner height to prevent layout shift when it becomes fixed
  useEffect(() => {
    const measureBanner = () => {
      if (bannerRef.current) {
        const height = bannerRef.current.offsetHeight;
        setBannerHeight(height);
      }
    };

    // Measure on mount and when scrolled state changes
    measureBanner();

    // Also measure on resize to handle responsive changes
    window.addEventListener("resize", measureBanner);
    return () => window.removeEventListener("resize", measureBanner);
  }, [isScrolled, activePromo, multiplier]);

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
      {/* Spacer div to prevent layout shift when banner becomes fixed */}
      {isScrolled && bannerHeight !== null && (
        <div
          style={{
            height: `${bannerHeight}px`,
            width: "100%",
          }}
          aria-hidden="true"
        />
      )}

      <motion.div
        ref={bannerRef}
        layout
        className={` ${
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
        }}
        transition={{
          duration: 0.5,
          ease: "easeInOut",
          layout: { duration: 0.5, ease: "easeInOut" },
        }}
      >
        <motion.div className="min-h-16 sm:min-h-20 pt-2 pb-1.5 sm:py-2.5 flex items-center justify-center px-4 sm:px-6 lg:px-8 relative overflow-hidden">
          {/* Main Content */}
          <div className="relative z-10 flex items-center justify-between w-full">
            {/* Left Side - Vertical Stack Layout */}
            <div className="flex flex-col items-start">
              {/* Wrapper to match widths */}
              <div className="flex flex-col items-start w-fit gap-0 ">
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

                    {/* Text content - centered with dynamic font size */}
                    <span
                      className="relative z-10 text-white font-black tracking-wider uppercase whitespace-nowrap"
                      style={{
                        fontSize: fontSize,
                        textShadow: `
                        0 0 6px rgba(255, 255, 255, 0.8),
                        0 0 12px rgba(255, 240, 180, 0.6),
                        0 1px 3px rgba(0, 0, 0, 0.8),
                        0 2px 6px rgba(0, 0, 0, 0.6)
                      `,
                        filter: "drop-shadow(0 0 3px rgba(255, 255, 255, 0.5))",
                      }}
                    >
                      {badgeText}
                    </span>
                  </div>
                </div>

                {/* Second Line - "GET 2x ENTRIES" with Metallic Text */}
                {/* Second Line - "GET 2x ENTRIES" - Matches width of first line */}
                <div className="w-full">
                  <span className="font-black uppercase text-[16px] sm:text-[18px] tracking-wide ps-1.5">
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

            {/* Right Side - Draw Date Text or Countdown */}
            {(() => {
              const drawStatus = getDrawDateStatus();
              const drawTime = getDrawTimeText();

              // If draw is tonight, show countdown to freeze time
              if (drawStatus === "today" && currentDraw?.freezeEntriesAt) {
                return (
                  <div className="flex flex-col items-center justify-center gap-1">
                    <div className="flex items-center justify-center gap-1 sm:gap-2 lg:gap-3">
                      {/* Countdown to freeze time */}
                      <div className="bg-gradient-to-br from-red-500 via-red-600 to-red-700 rounded-lg shadow-lg ring-2 ring-red-300/20 text-center w-12 sm:w-12 lg:w-20 px-2 sm:px-2 lg:px-4 py-1 sm:py-1 lg:py-3">
                        <div className="text-white font-black font-['Poppins'] drop-shadow-md text-sm sm:text-sm lg:text-xl">
                          {freezeTimeLeft.hours.toString().padStart(2, "0")}
                        </div>
                        <div className="text-red-100 font-medium text-[10px] sm:text-[10px] lg:text-sm">HRS</div>
                      </div>
                      <div className="bg-gradient-to-br from-red-500 via-red-600 to-red-700 rounded-lg shadow-lg ring-2 ring-red-300/20 text-center w-12 sm:w-12 lg:w-20 px-2 sm:px-2 lg:px-4 py-1 sm:py-1 lg:py-3">
                        <div className="text-white font-black font-['Poppins'] drop-shadow-md text-sm sm:text-sm lg:text-xl">
                          {freezeTimeLeft.minutes.toString().padStart(2, "0")}
                        </div>
                        <div className="text-red-100 font-medium text-[10px] sm:text-[10px] lg:text-sm">MINS</div>
                      </div>
                      <div className="bg-gradient-to-br from-red-500 via-red-600 to-red-700 rounded-lg shadow-lg ring-2 ring-red-300/20 text-center w-12 sm:w-12 lg:w-20 px-2 sm:px-2 lg:px-4 py-1 sm:py-1 lg:py-3">
                        <div className="text-white font-black font-['Poppins'] drop-shadow-md text-sm sm:text-sm lg:text-xl">
                          {freezeTimeLeft.seconds.toString().padStart(2, "0")}
                        </div>
                        <div className="text-red-100 font-medium text-[10px] sm:text-[10px] lg:text-sm">SECS</div>
                      </div>
                    </div>
                  </div>
                );
              }

              // If draw is tomorrow, show text with time
              if (drawStatus === "tomorrow" && drawTime) {
                return (
                  <div className="flex items-center justify-center">
                    <div className="bg-gradient-to-br from-red-500 via-red-600 to-red-700 rounded-lg shadow-lg ring-2 ring-red-300/20 text-center px-2 sm:px-4 lg:px-6 py-1.5 sm:py-2.5 lg:py-3">
                      <div className="text-white font-black font-['Poppins'] drop-shadow-md">
                        {/* Always stack vertically in 2 rows */}
                        <div className="flex flex-col items-center gap-0.5 sm:gap-1">
                          <div className="text-xs sm:text-sm lg:text-base whitespace-nowrap">
                            DRAWN TOMORROW
                          </div>
                          <div className="text-xs sm:text-sm lg:text-base whitespace-nowrap">
                            {drawTime} {timezoneAbbr}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              // Otherwise, show the countdown timer
              return (
                <div className="flex flex-col items-center justify-center gap-1">
                  <div className="flex items-center justify-center gap-1 sm:gap-2 lg:gap-3">
                    {/* 24-hour countdown only shows hours, minutes, seconds (no days) */}
                    {/* Fixed width classes to prevent size changes on load */}
                    <div className="bg-gradient-to-br from-red-500 via-red-600 to-red-700 rounded-lg shadow-lg ring-2 ring-red-300/20 text-center w-12 sm:w-12 lg:w-20 px-2 sm:px-2 lg:px-4 py-1 sm:py-1 lg:py-3">
                      <div className="text-white font-black font-['Poppins'] drop-shadow-md text-sm sm:text-sm lg:text-xl">
                        {timeLeft.hours.toString().padStart(2, "0")}
                      </div>
                      <div className="text-red-100 font-medium text-[10px] sm:text-[10px] lg:text-sm">HRS</div>
                    </div>
                    <div className="bg-gradient-to-br from-red-500 via-red-600 to-red-700 rounded-lg shadow-lg ring-2 ring-red-300/20 text-center w-12 sm:w-12 lg:w-20 px-2 sm:px-2 lg:px-4 py-1 sm:py-1 lg:py-3">
                      <div className="text-white font-black font-['Poppins'] drop-shadow-md text-sm sm:text-sm lg:text-xl">
                        {timeLeft.minutes.toString().padStart(2, "0")}
                      </div>
                      <div className="text-red-100 font-medium text-[10px] sm:text-[10px] lg:text-sm">MINS</div>
                    </div>
                    <div className="bg-gradient-to-br from-red-500 via-red-600 to-red-700 rounded-lg shadow-lg ring-2 ring-red-300/20 text-center w-12 sm:w-12 lg:w-20 px-2 sm:px-2 lg:px-4 py-1 sm:py-1 lg:py-3">
                      <div className="text-white font-black font-['Poppins'] drop-shadow-md text-sm sm:text-sm lg:text-xl">
                        {timeLeft.seconds.toString().padStart(2, "0")}
                      </div>
                      <div className="text-red-100 font-medium text-[10px] sm:text-[10px] lg:text-sm">SECS</div>
                    </div>
                  </div>
                 
                </div>
              );
            })()}
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}
