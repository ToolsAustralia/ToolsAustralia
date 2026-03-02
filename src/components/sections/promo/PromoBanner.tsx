"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { usePromoByType, useEffectiveForBanner } from "@/hooks/queries/usePromoQueries";
import { useSidebar } from "@/contexts/SidebarContext";
import { useMajorDrawCountdown, useCurrentMajorDraw, useNextDraw } from "@/hooks/queries/useMajorDrawQueries";
import { useActivePromoBannerText } from "@/hooks/queries/usePromoBannerTextQueries";
import { useCurrentAlternatingMultipliers } from "@/hooks/queries/useAlternatingMultiplierQueries";
import { getNextMidnightAEST, convertUTCToAEST, formatDateInAEST } from "@/utils/common/timezone";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";

// AEST/AEDT timezone identifier (matches timezone.ts)
const AEST_TIMEZONE = "Australia/Sydney";
import type { ServerPromo } from "@/utils/database/queries/promo-queries";
import { calculateFontSize } from "@/utils/promo-banner/font-size-calculator";
import { getAlternatingDefaultText } from "@/utils/promo-banner/default-text-manager";
import { resolveBadgeText } from "@/utils/promo-banner/resolve-badge-text";
import { resolveCountdownDisplay, formatTimeLeft, MS_24H } from "@/utils/promo-banner/countdown-mode";
import { NO_PROMO_BADGE, NO_PROMO_MAIN_LINE, NO_PROMO_RIGHT_LABEL, GAP_PERIOD_BADGE_TEXT, GAP_PERIOD_MAIN_LINE } from "@/constants/promo-banner";
import { useVariantContext } from "@/components/ab-testing/VariantProvider";
import { UrgencyClockIcon } from "@/components/ui";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { useUserContext } from "@/contexts/UserContext";
import { useUserMajorDrawStats } from "@/hooks/queries/useMajorDrawQueries";
import { hasAdditionalPackageAccess } from "@/utils/membership/has-additional-package-access";

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
 *
 * @see docs/PROMO_BANNER_BEHAVIOUR.md — Full behaviour documentation
 */
interface PromoBannerProps {
  initialMembershipPromo?: ServerPromo | null;
  initialOneTimePromo?: ServerPromo | null;
}

export default function PromoBanner({ initialMembershipPromo, initialOneTimePromo }: PromoBannerProps) {
  const theme = usePromoTheme();
  const preferDark = theme.preferDarkBackground ?? false;
  const rightSectionTextClass = preferDark ? "text-black" : "text-white";
  const rightSectionLabelClass = preferDark ? "text-gray-800" : "text-red-100";
  const pathname = usePathname();
  const { isAnySidebarOpen } = useSidebar();
  const { targetDateMs, currentDraw } = useMajorDrawCountdown();
  const { isLoading: isDrawLoading } = useCurrentMajorDraw();
  const { data: nextDraw } = useNextDraw();

  // Gap period: gates closed (no active draw), next draw ~3.5hrs away
  const isGapPeriod = currentDraw?.status !== "active";
  const [activeTab, setActiveTab] = useState<"membership" | "one-time">("membership");

  // User context for member+one-time tab multiplier resolution (align with MembershipSection)
  const { userData } = useUserContext();
  const { data: userMajorDrawStats } = useUserMajorDrawStats(userData?._id);
  const hasAccessToAdditionalPackages = hasAdditionalPackageAccess(userData, userMajorDrawStats);

  // Get variant config from context (wait for variant to resolve so we know countdown mode etc.)
  const { variantConfig, isLoading: isVariantLoading } = useVariantContext();

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

  const [scheduledEndTimeLeft, setScheduledEndTimeLeft] = useState<{
    days?: number;
    hours: number;
    minutes: number;
    seconds: number;
  }>({ hours: 0, minutes: 0, seconds: 0 });

  const [gapPeriodTimeLeft, setGapPeriodTimeLeft] = useState({
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  const [isScrolled, setIsScrolled] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);
  const [bannerHeight, setBannerHeight] = useState<number | null>(null);
  const [timezoneAbbr, setTimezoneAbbr] = useState<string>("AEDT");
  const [isMobile, setIsMobile] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false); // 360px and below
  const [isContentReady, setIsContentReady] = useState(false);

  // Fetch active scheduled banner text
  const { data: activeBannerTextData } = useActivePromoBannerText();
  const activeScheduledText = activeBannerTextData?.data?.text;

  // Fetch current alternating multipliers
  const { data: currentAlternatingMultipliers } = useCurrentAlternatingMultipliers();

  // Store alternating default text in state - only updates once per day (AEST)
  // Always calculate correctly - getAlternatingDefaultText() works on both server and client
  const [alternatingDefault, setAlternatingDefault] = useState<string>(() => {
    return getAlternatingDefaultText();
  });

  // Store alternating multiplier in state - only updates once per day (AEST)
  // Initialize to null to avoid hydration mismatch (will be set in useEffect)
  const [alternatingMultiplier, setAlternatingMultiplier] = useState<number | null>(null);

  // Detect mobile and narrow viewport for font sizing and padding
  useEffect(() => {
    const checkViewport = () => {
      const w = window.innerWidth;
      setIsMobile(w < 640); // sm breakpoint
      setIsNarrow(w <= 360);
    };
    checkViewport();
    window.addEventListener("resize", checkViewport);
    return () => window.removeEventListener("resize", checkViewport);
  }, []);

  // Effective-for-banner: multiplier, source, scheduled meta (for countdown mode and badge)
  // When member toggles to one-time tab, they see additional packages which use membership promo
  const { data: effectiveForBanner, isLoading: isEffectiveForBannerLoading } = useEffectiveForBanner();
  const baseType = activeTab === "membership" ? "membership-packages" : "one-time-packages";
  const effectivePromoTypeForBanner =
    activeTab === "one-time" && hasAccessToAdditionalPackages ? "membership-packages" : baseType;
  const effectiveEntry = effectiveForBanner?.[effectivePromoTypeForBanner];

  // Promo "fully resolved" = we know for sure whether there is an active promo or no-promo state
  const isPromoResolved =
    !isEffectiveForBannerLoading && !isDrawLoading && !isVariantLoading;

  // Legacy: use initial data for "active promo" object when provided (e.g. promotions page SSR)
  const { data: membershipPromoClient } = usePromoByType("membership-packages");
  const { data: oneTimePromoClient } = usePromoByType("one-time-packages");
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

  // Helper function to get current date string in AEST (YYYY-MM-DD format)
  // Uses formatInTimeZone to ensure we get the correct AEST date, not local timezone
  const getCurrentDateStringAEST = (): string => {
    const now = new Date();
    return formatInTimeZone(now, AEST_TIMEZONE, "yyyy-MM-dd");
  };


  // Updates alternating default text when date changes
  useEffect(() => {
    if (typeof window === "undefined") return;

    let lastDateStr = getCurrentDateStringAEST();

    const checkDateChange = () => {
      const currentDateStr = getCurrentDateStringAEST();
      if (currentDateStr !== lastDateStr) {
        // Date changed - update alternating default text
        lastDateStr = currentDateStr;
        setAlternatingDefault(getAlternatingDefaultText());
      }
    };

    // Check immediately on mount and update state
    checkDateChange();
    
    // Also force an immediate update on mount to ensure correct text is shown
    // This handles cases where the page was loaded before date change
    setAlternatingDefault(getAlternatingDefaultText());

    // Set up interval to check for date changes (every minute is sufficient)
    // This ensures the text updates at midnight AEST
    const interval = setInterval(checkDateChange, 60 * 1000); // Check every minute

    // Development helper: Expose testing function to window
    if (process.env.NODE_ENV === "development") {
      type WindowWithTest = Window & {
        testPromoBannerDateChange?: () => { date: string; text: string };
      };
      (window as WindowWithTest).testPromoBannerDateChange = () => {
        const currentDateStr = getCurrentDateStringAEST();
        const currentText = getAlternatingDefaultText();
        setAlternatingDefault(currentText);
        console.log("✅ Manually triggered promo banner date change check");
        console.log("📅 Current AEST date:", currentDateStr);
        console.log("📝 Current alternating text:", currentText);
        console.log("🔄 Component state will update...");
        return {
          date: currentDateStr,
          text: currentText,
        };
      };
    }

    // Cleanup on unmount
    return () => {
      clearInterval(interval);
      
      // Remove test function in development mode
      if (process.env.NODE_ENV === "development") {
        type WindowWithTest = Window & {
          testPromoBannerDateChange?: () => { date: string; text: string };
        };
        const windowWithTest = window as WindowWithTest;
        if (windowWithTest.testPromoBannerDateChange) {
          delete windowWithTest.testPromoBannerDateChange;
        }
      }
    };
  }, []);

  // Determine which promo to display based on effective promo type (aligns with multiplier resolution)
  const getActivePromo = () => {
    if (effectivePromoTypeForBanner === "membership-packages") {
      return membershipPromo;
    }
    return oneTimePromo;
  };

  const activePromo = getActivePromo();

  // Update alternating multiplier when date changes or currentAlternatingMultipliers changes
  useEffect(() => {
    if (typeof window === "undefined") return;

    const current = currentAlternatingMultipliers?.data?.[effectivePromoTypeForBanner] ?? null;

    // Debug logging (development only)
    if (process.env.NODE_ENV === "development") {
      console.log("🔄 PromoBanner alternating multiplier update:", {
        activeTab,
        effectivePromoTypeForBanner,
        hasActivePromo: !!activePromo,
        currentAlternatingValue: current,
        currentAlternatingData: currentAlternatingMultipliers?.data,
      });
    }
    
    // Only update if there's no active promo (alternating only applies when no active promo)
    if (!activePromo) {
      // If there's an alternating multiplier available, use it
      if (current !== null && current !== undefined) {
        setAlternatingMultiplier(current);
        if (process.env.NODE_ENV === "development") {
          console.log("✅ Set alternating multiplier to:", current);
        }
      } else {
        // If no alternating multiplier is available, clear it
        setAlternatingMultiplier(null);
        if (process.env.NODE_ENV === "development") {
          console.log("⚠️ No alternating multiplier available for", effectivePromoTypeForBanner);
        }
      }
    } else {
      // Clear alternating multiplier when active promo exists
      setAlternatingMultiplier(null);
      if (process.env.NODE_ENV === "development") {
        console.log("🚫 Active promo exists, clearing alternating multiplier");
      }
    }
  }, [currentAlternatingMultipliers, effectivePromoTypeForBanner, activePromo]);

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

  // Countdown to next draw activation during gap period (gates closed)
  useEffect(() => {
    if (!nextDraw?.activationDate) return;

    const updateGapCountdown = () => {
      const now = Date.now();
      const activationMs = new Date(nextDraw.activationDate!).getTime();
      const remainingMs = Math.max(0, activationMs - now);
      const totalSeconds = Math.floor(remainingMs / 1000);
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;

      setGapPeriodTimeLeft((prev) =>
        prev.hours === h && prev.minutes === m && prev.seconds === s ? prev : { hours: h, minutes: m, seconds: s }
      );
    };

    updateGapCountdown();
    const timer = setInterval(updateGapCountdown, 1000);
    return () => clearInterval(timer);
  }, [nextDraw?.activationDate]);

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

  // Resolve multiplier: Variant config > Effective-for-banner for current tab
  const multiplier = useMemo(() => {
    if (variantConfig?.banner?.multiplier !== undefined) {
      return variantConfig.banner.multiplier;
    }
    // Fall back to alternating multiplier when there is no active promo scheduled/toggled
    // (alternating applies when no active promo exists for the current tab).
    return effectiveEntry?.multiplier ?? alternatingMultiplier ?? null;
  }, [variantConfig?.banner?.multiplier, effectiveEntry?.multiplier, alternatingMultiplier]);

  const isNoPromo = multiplier === null && variantConfig?.banner?.multiplier === undefined;

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

  // Scheduled promo state: badge "LAST CHANCE"/"ENDS TONIGHT" + right "PROMO ENDING"/countdown (split-test winner default)
  const scheduledPromoState = useMemo(() => {
    const hasScheduledPromo = effectiveEntry?.source === "scheduled" && effectiveEntry?.scheduledEndDate;
    if (!hasScheduledPromo) return { hasScheduledPromo: false as const, isUrgent: false };
    const endMs = new Date(effectiveEntry!.scheduledEndDate!).getTime();
    const timeLeftMs = endMs - Date.now();
    const isUrgent = timeLeftMs > 0 && timeLeftMs <= MS_24H;
    return { hasScheduledPromo: true, isUrgent };
  }, [effectiveEntry?.source, effectiveEntry?.scheduledEndDate]);

  // Badge text (gold pill): gap period → no-promo → draw status → variant override → scheduled promo default → 10x → scheduled text → alternating default
  const badgeText = useMemo(() => {
    if (isGapPeriod) return GAP_PERIOD_BADGE_TEXT;
    if (isNoPromo) return NO_PROMO_BADGE;
    const drawStatus = getDrawDateStatus();
    // Draw status takes priority (DRAWN TONIGHT / DRAWN TOMORROW)
    if (drawStatus === "today") return "DRAWN TONIGHT";
    if (drawStatus === "tomorrow") return "DRAWN TOMORROW";
    // Variant override (split test) — must run before scheduled promo default so split tests can override
    if (variantConfig?.banner?.badgeText?.trim()) {
      return variantConfig.banner.badgeText.trim();
    }
    // One-time: when there is no scheduled promo configured, keep the winning urgency copy
    // instead of falling back to the alternating default text.
    if (activeTab === "one-time" && !scheduledPromoState.hasScheduledPromo) {
      return "LAST CHANCE";
    }
    // Scheduled promo default: LAST CHANCE (>=24h) or ENDS TONIGHT (<24h) — AB test winner
    if (scheduledPromoState.hasScheduledPromo) {
      return scheduledPromoState.isUrgent ? "ENDS TONIGHT" : "LAST CHANCE";
    }
    return resolveBadgeText({
      variantBadgeText: undefined, // Already checked above
      drawStatus,
      activeScheduledText: activeScheduledText ?? undefined,
      alternatingDefault,
      multiplier,
    });
  }, [
    isGapPeriod,
    isNoPromo,
    activeTab,
    scheduledPromoState,
    variantConfig?.banner?.badgeText,
    currentDraw?.drawDate,
    activeScheduledText,
    alternatingDefault,
    multiplier,
  ]);

  // Countdown display: variant config drives behaviour; default is limited_time_only
  const countdownDisplay = useMemo(() => {
    const drawStatus = getDrawDateStatus();
    const resolved = resolveCountdownDisplay({
      countdownMode: variantConfig?.banner?.countdownMode ?? "limited_time_only",
      showCountdown: variantConfig?.banner?.showCountdown !== false,
      source: effectiveEntry?.source ?? "none",
      scheduledEndDate: effectiveEntry?.scheduledEndDate ?? undefined,
      durationMs: effectiveEntry?.durationMs ?? undefined,
      drawStatus,
      countdownLabel: variantConfig?.banner?.countdownLabel ?? undefined,
    });
    
    // One-time: when there is no scheduled promo configured, ensure the right-side label
    // uses the winning copy instead of the legacy "LIMITED TIME ONLY" default.
    if (activeTab === "one-time" && !scheduledPromoState.hasScheduledPromo && resolved.type === "static_urgency") {
      return { ...resolved, label: "PROMO ENDING" };
    }

    return resolved;
  }, [
    variantConfig?.banner?.countdownMode,
    variantConfig?.banner?.showCountdown,
    variantConfig?.banner?.countdownLabel,
    effectiveEntry?.source,
    effectiveEntry?.scheduledEndDate,
    effectiveEntry?.durationMs,
    currentDraw?.drawDate,
    activeTab,
    scheduledPromoState.hasScheduledPromo,
  ]);

  // Scheduled-end countdown ticker (when countdownDisplay.type === "scheduled_end")
  useEffect(() => {
    if (countdownDisplay.type !== "scheduled_end" || countdownDisplay.endMs == null) return;
    const update = () => {
      const now = Date.now();
      const remainingMs = Math.max(0, countdownDisplay.endMs! - now);
      const useDays = countdownDisplay.useDays ?? false;
      setScheduledEndTimeLeft(formatTimeLeft(remainingMs, useDays));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [countdownDisplay.type, countdownDisplay.endMs, countdownDisplay.useDays]);

  // Memoize font size calculation (smaller badge only when narrow AND scrolled/rounded)
  const fontSize = useMemo(
    () => calculateFontSize(badgeText, isMobile, isNarrow && isScrolled),
    [badgeText, isMobile, isNarrow, isScrolled]
  );

  // Mark content as ready once all data is loaded and font size is calculated
  // Reset when data changes to ensure we always show correct data with animation
  useEffect(() => {
    // Reset content ready state when data changes (badgeText, multiplier, or draw data)
    setIsContentReady(false);
    
    // Content is ready when:
    // 1. Badge text is available
    // 2. Font size is calculated
    // 3. Mobile detection is done
    // 4. Draw data has finished loading (to prevent showing fallback text before draw status is checked)
    if (badgeText && fontSize && typeof isMobile === "boolean" && !isDrawLoading) {
      // Small delay to ensure styles are applied
      const timer = setTimeout(() => {
        setIsContentReady(true);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [badgeText, fontSize, isMobile, isDrawLoading, multiplier]);

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
  }, [isScrolled, activePromo, multiplier, isGapPeriod]);

  // Don't render if: 404, sidebar open, promo not yet resolved, or (not no-promo and no badge and no multiplier and not gap period)
  if (pathname === "/not-found" || isAnySidebarOpen) return null;
  if (!isPromoResolved) return null; // Hide until we know active promo vs no-promo
  if (!isGapPeriod && !isNoPromo && !badgeText && !multiplier) return null;

  // Keep the banner below the header by default; only float it once scrolled for visibility.
  // Use wrapper to prevent layout shift when banner becomes fixed
  const bgColorClass = "bg-black";

  // Scroll to membership section on click (same pattern as FloatingGetEntriesButton → packages)
  const handleBannerClick = () => {
    const membershipSection = document.getElementById("membership");
    if (membershipSection) {
      membershipSection.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleBannerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleBannerClick();
    }
  };

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
        role="button"
        tabIndex={0}
        aria-label="Scroll to membership and packages"
        onClick={handleBannerClick}
        onKeyDown={handleBannerKeyDown}
        layout
        initial={{ opacity: 0 }}
        animate={{
          borderRadius: isScrolled ? "9999px" : "0px",
          opacity: 1,
        }}
        className={`cursor-pointer select-none ${
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
            ? { border: `2px solid ${theme.borderRgba}` }
            : { borderBottom: `2px solid ${theme.borderRgba}` }),
        } as React.CSSProperties}
        transition={{
          duration: 0.5,
          ease: "easeInOut",
          layout: { duration: 0.5, ease: "easeInOut" },
          opacity: { duration: 0.35, ease: "easeOut" },
        }}
      >
        <motion.div
          className={`min-h-16 sm:min-h-20 pt-2 pb-1.5 sm:py-2.5 flex items-center justify-center px-4 sm:px-6 lg:px-8 relative overflow-hidden ${isScrolled ? "max-[360px]:px-3 max-[360px]:pt-2 max-[360px]:pb-1.5" : ""}`}
        >
          {/* Main Content */}
          <div className="relative z-10 flex items-center justify-between w-full">
            {/* Left Side - Vertical Stack Layout */}
            <div className="flex flex-col items-start">
              {/* Wrapper to match widths */}
              <div className="flex flex-col items-start w-fit gap-0 ">
                {/* First Line - Badge (default: BONUS ENTRIES) - Matches width of second line */}
                <div className="relative w-full">
                  {/* Outer glow effect - pulsing animation */}
                  {isContentReady && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className="absolute inset-0 rounded-full animate-pulse"
                      style={{
                        background: `radial-gradient(circle, rgba(251, 191, 36, 0.5) 0%, rgba(245, 158, 11, 0.3) 40%, rgba(217, 119, 6, 0.15) 70%, transparent 100%)`,
                        filter: "blur(5px)",
                        transform: "scale(1.08)",
                        zIndex: 0,
                      }}
                    />
                  )}

                  {/* Main badge container - Gold gradient with depth - Matches second line width */}
                  {isContentReady ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className={`relative w-full px-2 py-0.5 sm:px-2.5 sm:py-1 lg:px-3 lg:py-1.5 rounded-full flex items-center justify-center overflow-hidden ${isScrolled ? "max-[360px]:px-2 max-[360px]:py-0.5" : ""}`}
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
                        suppressHydrationWarning
                      >
                        {badgeText}
                      </span>
                    </motion.div>
                  ) : (
                    // Placeholder to maintain layout - invisible but maintains space
                    <div
                      className={`relative w-full px-2 py-0.5 sm:px-2.5 sm:py-1 lg:px-3 lg:py-1.5 rounded-full flex items-center justify-center overflow-hidden opacity-0 ${isScrolled ? "max-[360px]:px-2 max-[360px]:py-0.5" : ""}`}
                      style={{ fontSize: fontSize }}
                      aria-hidden="true"
                    >
                      <span
                        className="relative z-10 text-white font-black tracking-wider uppercase whitespace-nowrap"
                        style={{ fontSize: fontSize }}
                      >
                        {badgeText || "BONUS ENTRIES"}
                      </span>
                    </div>
                  )}
                </div>

                {/* Second Line - "GET X ENTRIES" or no-promo main line */}
                {isContentReady ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, ease: "easeOut", delay: 0.1 }}
                    className="w-full"
                    suppressHydrationWarning
                  >
                    <span
                      className={`font-black uppercase text-[16px] sm:text-[18px] tracking-wide ps-1.5 ${isScrolled ? "max-[360px]:text-[14px] max-[360px]:ps-1 whitespace-nowrap" : ""}`}
                    >
                      {isGapPeriod ? (
                        <span className="text-white">{GAP_PERIOD_MAIN_LINE}</span>
                      ) : isNoPromo ? (
                        <span className="text-white">{NO_PROMO_MAIN_LINE}</span>
                      ) : (
                        <>
                          <span className="text-white">GET </span>
                          <span suppressHydrationWarning style={{ color: theme.primary }}>{multiplier}X</span>
                          <span className="text-white"> ENTRIES</span>
                        </>
                      )}
                    </span>
                  </motion.div>
                ) : (
                  <div className="w-full opacity-0" aria-hidden="true">
                    <span
                      className={`font-black uppercase text-[16px] sm:text-[18px] tracking-wide ps-1.5 ${isScrolled ? "max-[360px]:text-[14px] max-[360px]:ps-1 whitespace-nowrap" : ""}`}
                    >
                      <span className="text-white">GET </span>
                      <span style={{ color: theme.primary }}>10X</span>
                      <span className="text-white"> ENTRIES</span>
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Side - Draw Date Text or Countdown (uses simpler gradient) */}
            {(countdownDisplay.type !== "hidden" || isGapPeriod) && (
            <div className="relative flex items-center justify-center">
            {(() => {

              const drawTime = getDrawTimeText();
              const rightSectionTileStyle = { background: theme.gradientSolid, boxShadow: `0 0 12px ${theme.shadowRgba}` };

              // Gap period: "NEXT DRAW IN" label + countdown timer (compact padding to align with left height)
              if (isGapPeriod) {
                const tileClass = "rounded-lg shadow-lg ring-2 ring-white/20 text-center w-11 sm:w-12 lg:w-16 px-1.5 sm:px-2 lg:px-2 py-0.5 sm:py-0.5 lg:py-1.5";
                const labelClass = `${rightSectionLabelClass} font-medium text-[10px] sm:text-[10px] lg:text-sm`;
                return (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, ease: "easeOut", delay: 0.15 }}
                    className="flex flex-col items-center justify-center"
                  >
                    <div className={`${rightSectionLabelClass} font-semibold text-[9px] sm:text-[10px] uppercase tracking-wider`}>
                      NEXT DRAW IN
                    </div>
                    <div className="flex items-center justify-center gap-1 sm:gap-1.5 lg:gap-2">
                      <div className={tileClass} style={rightSectionTileStyle}>
                        <div className={`${rightSectionTextClass} font-black font-['Poppins'] drop-shadow-md text-xs sm:text-sm lg:text-base`}>
                          {gapPeriodTimeLeft.hours.toString().padStart(2, "0")}
                        </div>
                        <div className={labelClass}>HRS</div>
                      </div>
                      <div className={tileClass} style={rightSectionTileStyle}>
                        <div className={`${rightSectionTextClass} font-black font-['Poppins'] drop-shadow-md text-xs sm:text-sm lg:text-base`}>
                          {gapPeriodTimeLeft.minutes.toString().padStart(2, "0")}
                        </div>
                        <div className={labelClass}>MINS</div>
                      </div>
                      <div className={tileClass} style={rightSectionTileStyle}>
                        <div className={`${rightSectionTextClass} font-black font-['Poppins'] drop-shadow-md text-xs sm:text-sm lg:text-base`}>
                          {gapPeriodTimeLeft.seconds.toString().padStart(2, "0")}
                        </div>
                        <div className={labelClass}>SECS</div>
                      </div>
                    </div>
                  </motion.div>
                );
              }

              // No promo: show replacement label
              if (isNoPromo) {
                return (
                  <div className="flex items-center justify-center">
                    <div
                      className={`rounded-lg shadow-lg ring-2 text-center px-2 sm:px-4 lg:px-6 py-1.5 sm:py-2.5 lg:py-3 ${isScrolled ? "max-[360px]:px-2.5 max-[360px]:py-2" : ""}`}
                    style={rightSectionTileStyle}
                    >
                      <div
                        className={`${rightSectionTextClass} font-black font-['Poppins'] drop-shadow-md text-xs sm:text-sm lg:text-base whitespace-nowrap ${isScrolled ? "max-[360px]:text-sm" : ""}`}
                      >
                        {NO_PROMO_RIGHT_LABEL}
                      </div>
                    </div>
                  </div>
                );
              }

              if (countdownDisplay.type === "static_urgency" && countdownDisplay.label) {
                return (
                  <div className="flex items-center justify-center">
                    <div
                      className={`rounded-lg shadow-lg ring-2 text-center px-3 py-2.5 sm:px-4 sm:py-2.5 lg:px-6 lg:py-3 ${isScrolled ? "max-[360px]:px-2.5 max-[360px]:py-2" : ""}`}
                    style={rightSectionTileStyle}
                    >
                      <div
                        className={`flex items-center justify-center gap-1.5 ${rightSectionTextClass} font-black font-['Poppins'] drop-shadow-md text-sm sm:text-sm lg:text-base whitespace-nowrap ${isScrolled ? "max-[360px]:text-sm" : ""}`}
                      >
                        {countdownDisplay.label}
                        <UrgencyClockIcon className={rightSectionTextClass} size="md" />
                      </div>
                    </div>
                  </div>
                );
              }

              // Scheduled end countdown (DAYS HRS MINS or HRS MINS SECS)
              if (countdownDisplay.type === "scheduled_end") {
                const useDays = countdownDisplay.useDays ?? false;
                const tileClass = "rounded-lg shadow-lg ring-2 ring-white/20 text-center w-12 sm:w-12 lg:w-20 px-2 sm:px-2 lg:px-4 py-1 sm:py-1 lg:py-3";
                const labelClass = `${rightSectionLabelClass} font-medium text-[10px] sm:text-[10px] lg:text-sm`;
                return (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, ease: "easeOut", delay: 0.15 }}
                    className="flex flex-col items-center justify-center gap-1"
                  >
                    <div className="flex items-center justify-center gap-1 sm:gap-2 lg:gap-3">
                      {useDays && scheduledEndTimeLeft.days != null && (
                        <div className={tileClass} style={rightSectionTileStyle}>
                          <div className={`${rightSectionTextClass} font-black font-['Poppins'] drop-shadow-md text-sm sm:text-sm lg:text-xl`}>
                            {scheduledEndTimeLeft.days.toString().padStart(2, "0")}
                          </div>
                          <div className={labelClass}>DAYS</div>
                        </div>
                      )}
                      <div className={tileClass} style={rightSectionTileStyle}>
                        <div className={`${rightSectionTextClass} font-black font-['Poppins'] drop-shadow-md text-sm sm:text-sm lg:text-xl`}>
                          {scheduledEndTimeLeft.hours.toString().padStart(2, "0")}
                        </div>
                        <div className={labelClass}>HRS</div>
                      </div>
                      <div className={tileClass} style={rightSectionTileStyle}>
                        <div className={`${rightSectionTextClass} font-black font-['Poppins'] drop-shadow-md text-sm sm:text-sm lg:text-xl`}>
                          {scheduledEndTimeLeft.minutes.toString().padStart(2, "0")}
                        </div>
                        <div className={labelClass}>MINS</div>
                      </div>
                      {!useDays && (
                        <div className={tileClass} style={rightSectionTileStyle}>
                          <div className={`${rightSectionTextClass} font-black font-['Poppins'] drop-shadow-md text-sm sm:text-sm lg:text-xl`}>
                            {scheduledEndTimeLeft.seconds.toString().padStart(2, "0")}
                          </div>
                          <div className={labelClass}>SECS</div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              }

              // Draw tonight: countdown to freeze time
              if (countdownDisplay.type === "draw_tonight" && currentDraw?.freezeEntriesAt) {
                // Only show actual countdown when content is ready, otherwise show 00 00 00
                if (!isContentReady || isDrawLoading) {
                  return (
                    <div className="flex flex-col items-center justify-center gap-1">
                      <div className="flex items-center justify-center gap-1 sm:gap-2 lg:gap-3">
                        <div className="rounded-lg shadow-lg ring-2 ring-white/20 text-center w-12 sm:w-12 lg:w-20 px-2 sm:px-2 lg:px-4 py-1 sm:py-1 lg:py-3" style={rightSectionTileStyle}>
                          <div className={`${rightSectionTextClass} font-black font-['Poppins'] drop-shadow-md text-sm sm:text-sm lg:text-xl`}>00</div>
                          <div className={`${rightSectionLabelClass} font-medium text-[10px] sm:text-[10px] lg:text-sm`}>HRS</div>
                        </div>
                        <div className="rounded-lg shadow-lg ring-2 ring-white/20 text-center w-12 sm:w-12 lg:w-20 px-2 sm:px-2 lg:px-4 py-1 sm:py-1 lg:py-3" style={rightSectionTileStyle}>
                          <div className={`${rightSectionTextClass} font-black font-['Poppins'] drop-shadow-md text-sm sm:text-sm lg:text-xl`}>00</div>
                          <div className={`${rightSectionLabelClass} font-medium text-[10px] sm:text-[10px] lg:text-sm`}>MINS</div>
                        </div>
                        <div className="rounded-lg shadow-lg ring-2 ring-white/20 text-center w-12 sm:w-12 lg:w-20 px-2 sm:px-2 lg:px-4 py-1 sm:py-1 lg:py-3" style={rightSectionTileStyle}>
                          <div className={`${rightSectionTextClass} font-black font-['Poppins'] drop-shadow-md text-sm sm:text-sm lg:text-xl`}>00</div>
                          <div className={`${rightSectionLabelClass} font-medium text-[10px] sm:text-[10px] lg:text-sm`}>SECS</div>
                        </div>
                      </div>
                    </div>
                  );
                }
                
                return (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, ease: "easeOut", delay: 0.15 }}
                    className="flex flex-col items-center justify-center gap-1"
                  >
                    <div className="flex items-center justify-center gap-1 sm:gap-2 lg:gap-3">
                      {/* Countdown to freeze time */}
                      <div className="rounded-lg shadow-lg ring-2 ring-white/20 text-center w-12 sm:w-12 lg:w-20 px-2 sm:px-2 lg:px-4 py-1 sm:py-1 lg:py-3" style={rightSectionTileStyle}>
                        <div className={`${rightSectionTextClass} font-black font-['Poppins'] drop-shadow-md text-sm sm:text-sm lg:text-xl`}>
                          {freezeTimeLeft.hours.toString().padStart(2, "0")}
                        </div>
                        <div className={`${rightSectionLabelClass} font-medium text-[10px] sm:text-[10px] lg:text-sm`}>HRS</div>
                      </div>
                      <div className="rounded-lg shadow-lg ring-2 ring-white/20 text-center w-12 sm:w-12 lg:w-20 px-2 sm:px-2 lg:px-4 py-1 sm:py-1 lg:py-3" style={rightSectionTileStyle}>
                        <div className={`${rightSectionTextClass} font-black font-['Poppins'] drop-shadow-md text-sm sm:text-sm lg:text-xl`}>
                          {freezeTimeLeft.minutes.toString().padStart(2, "0")}
                        </div>
                        <div className={`${rightSectionLabelClass} font-medium text-[10px] sm:text-[10px] lg:text-sm`}>MINS</div>
                      </div>
                      <div className="rounded-lg shadow-lg ring-2 ring-white/20 text-center w-12 sm:w-12 lg:w-20 px-2 sm:px-2 lg:px-4 py-1 sm:py-1 lg:py-3" style={rightSectionTileStyle}>
                        <div className={`${rightSectionTextClass} font-black font-['Poppins'] drop-shadow-md text-sm sm:text-sm lg:text-xl`}>
                          {freezeTimeLeft.seconds.toString().padStart(2, "0")}
                        </div>
                        <div className={`${rightSectionLabelClass} font-medium text-[10px] sm:text-[10px] lg:text-sm`}>SECS</div>
                      </div>
                    </div>
                  </motion.div>
                );
              }

              // Draw tomorrow: show text with time
              if (countdownDisplay.type === "draw_tomorrow" && drawTime) {
                // Only show when content is ready, otherwise show placeholder
                if (!isContentReady || isDrawLoading) {
                  return (
                    <div className="flex items-center justify-center">
                      <div className="rounded-lg shadow-lg ring-2 ring-white/20 text-center px-2 sm:px-4 lg:px-6 py-1.5 sm:py-2.5 lg:py-3 opacity-0" style={rightSectionTileStyle}>
                        <div className={`${rightSectionTextClass} font-black font-['Poppins'] drop-shadow-md`}>
                          <div className="flex flex-col items-center gap-0.5 sm:gap-1">
                            <div className="text-xs sm:text-sm lg:text-base whitespace-nowrap">DRAWN TOMORROW</div>
                            <div className="text-xs sm:text-sm lg:text-base whitespace-nowrap">12:00 AM AEDT</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }
                
                return (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, ease: "easeOut", delay: 0.15 }}
                    className="flex items-center justify-center"
                  >
                    <div className="rounded-lg shadow-lg ring-2 ring-white/20 text-center px-2 sm:px-4 lg:px-6 py-1.5 sm:py-2.5 lg:py-3" style={rightSectionTileStyle}>
                      <div className={`${rightSectionTextClass} font-black font-['Poppins'] drop-shadow-md`}>
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
                  </motion.div>
                );
              }

              // Midnight: show countdown to next midnight AEST
              if (!isContentReady || isDrawLoading) {
                return (
                  <div className="flex flex-col items-center justify-center gap-1">
                    <div className="flex items-center justify-center gap-1 sm:gap-2 lg:gap-3">
                      <div className="rounded-lg shadow-lg ring-2 ring-white/20 text-center w-12 sm:w-12 lg:w-20 px-2 sm:px-2 lg:px-4 py-1 sm:py-1 lg:py-3" style={rightSectionTileStyle}>
                        <div className={`${rightSectionTextClass} font-black font-['Poppins'] drop-shadow-md text-sm sm:text-sm lg:text-xl`}>00</div>
                        <div className={`${rightSectionLabelClass} font-medium text-[10px] sm:text-[10px] lg:text-sm`}>HRS</div>
                      </div>
                      <div className="rounded-lg shadow-lg ring-2 ring-white/20 text-center w-12 sm:w-12 lg:w-20 px-2 sm:px-2 lg:px-4 py-1 sm:py-1 lg:py-3" style={rightSectionTileStyle}>
                        <div className={`${rightSectionTextClass} font-black font-['Poppins'] drop-shadow-md text-sm sm:text-sm lg:text-xl`}>00</div>
                        <div className={`${rightSectionLabelClass} font-medium text-[10px] sm:text-[10px] lg:text-sm`}>MINS</div>
                      </div>
                      <div className="rounded-lg shadow-lg ring-2 ring-white/20 text-center w-12 sm:w-12 lg:w-20 px-2 sm:px-2 lg:px-4 py-1 sm:py-1 lg:py-3" style={rightSectionTileStyle}>
                        <div className={`${rightSectionTextClass} font-black font-['Poppins'] drop-shadow-md text-sm sm:text-sm lg:text-xl`}>00</div>
                        <div className={`${rightSectionLabelClass} font-medium text-[10px] sm:text-[10px] lg:text-sm`}>SECS</div>
                      </div>
                    </div>
                  </div>
                );
              }
              
              return (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, ease: "easeOut", delay: 0.15 }}
                  className="flex flex-col items-center justify-center gap-1"
                >
                  <div className="flex items-center justify-center gap-1 sm:gap-2 lg:gap-3">
                    {/* 24-hour countdown only shows hours, minutes, seconds (no days) */}
                    {/* Fixed width classes to prevent size changes on load */}
                    <div className="rounded-lg shadow-lg ring-2 ring-white/20 text-center w-12 sm:w-12 lg:w-20 px-2 sm:px-2 lg:px-4 py-1 sm:py-1 lg:py-3" style={rightSectionTileStyle}>
                      <div className={`${rightSectionTextClass} font-black font-['Poppins'] drop-shadow-md text-sm sm:text-sm lg:text-xl`}>
                        {timeLeft.hours.toString().padStart(2, "0")}
                      </div>
                      <div className={`${rightSectionLabelClass} font-medium text-[10px] sm:text-[10px] lg:text-sm`}>HRS</div>
                    </div>
                    <div className="rounded-lg shadow-lg ring-2 ring-white/20 text-center w-12 sm:w-12 lg:w-20 px-2 sm:px-2 lg:px-4 py-1 sm:py-1 lg:py-3" style={rightSectionTileStyle}>
                      <div className={`${rightSectionTextClass} font-black font-['Poppins'] drop-shadow-md text-sm sm:text-sm lg:text-xl`}>
                        {timeLeft.minutes.toString().padStart(2, "0")}
                      </div>
                      <div className={`${rightSectionLabelClass} font-medium text-[10px] sm:text-[10px] lg:text-sm`}>MINS</div>
                    </div>
                    <div className="rounded-lg shadow-lg ring-2 ring-white/20 text-center w-12 sm:w-12 lg:w-20 px-2 sm:px-2 lg:px-4 py-1 sm:py-1 lg:py-3" style={rightSectionTileStyle}>
                      <div className={`${rightSectionTextClass} font-black font-['Poppins'] drop-shadow-md text-sm sm:text-sm lg:text-xl`}>
                        {timeLeft.seconds.toString().padStart(2, "0")}
                      </div>
                      <div className={`${rightSectionLabelClass} font-medium text-[10px] sm:text-[10px] lg:text-sm`}>SECS</div>
                    </div>
                  </div>
                </motion.div>
              );
            })()}
            </div>
            )}
          </div>

        </motion.div>

        {/* Badge image - outside overflow-hidden so -top-3 when sticky won't be clipped */}
        {!isGapPeriod && countdownDisplay.type !== "hidden" && !isNoPromo && multiplier && [2, 3, 5, 10].includes(multiplier) && (
          <img
            src={`/images/badge/X${multiplier}.png`}
            alt={`${multiplier}X entries`}
            className={`absolute ${isScrolled ? "-top-3 sm:-top-6 -right-2 sm:-right-4" : "top-0 sm:-top-2 right-0 sm:right-2"} ${isScrolled ? "w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20" : "w-9 h-9 sm:w-11 sm:h-11 lg:w-14 lg:h-14"} object-contain z-20 pointer-events-none select-none`}
            style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.5))" }}
          />
        )}
      </motion.div>
    </>
  );
}
