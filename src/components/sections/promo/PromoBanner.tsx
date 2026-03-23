"use client";

import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { motion, animate, useMotionValue, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { usePromoByType, useEffectiveForBanner } from "@/hooks/queries/usePromoQueries";
import { useSidebar } from "@/contexts/SidebarContext";
import { useMajorDrawCountdown, useCurrentMajorDraw, useNextDraw } from "@/hooks/queries/useMajorDrawQueries";
import { useActivePromoBannerText } from "@/hooks/queries/usePromoBannerTextQueries";
import { useCurrentAlternatingMultipliers } from "@/hooks/queries/useAlternatingMultiplierQueries";
import { getNextMidnightAEST, convertUTCToAEST } from "@/utils/common/timezone";

// AEST/AEDT timezone identifier (matches timezone.ts)
const AEST_TIMEZONE = "Australia/Sydney";
import type { ServerPromo } from "@/utils/database/queries/promo-queries";
import { resolveCountdownDisplay, formatTimeLeft, MS_24H } from "@/utils/promo-banner/countdown-mode";
import { resolvePromoBannerLeftVisual } from "@/utils/promo-banner/resolve-promo-banner-left-visual";
import { NO_PROMO_RIGHT_LABEL } from "@/constants/promo-banner";
import { useVariantContext } from "@/components/ab-testing/VariantProvider";
import { UrgencyClockIcon } from "@/components/ui";
import { usePromoTheme, usePromoThemeStore } from "@/stores/usePromoThemeStore";
import { useUserContext } from "@/contexts/UserContext";
import { useUserMajorDrawStats } from "@/hooks/queries/useMajorDrawQueries";
import { hasAdditionalPackageAccess } from "@/utils/membership/has-additional-package-access";

/**
 * X2 / X10 multiplier badge — only used here. Anchored to the countdown cluster’s
 * `relative inline-flex flex-col items-end` wrapper (`items-end` = top-right of that box).
 * Tweak size/offset here; Tailwind must see full class strings (no dynamic assembly).
 */
const PROMO_BANNER_MULTIPLIER_BADGE = {
  root: "absolute z-30 pointer-events-none select-none object-contain origin-top-right",
  /** Floating pill after scroll */
  layoutScrolled:
    "-top-3 -right-2.5 h-8 w-8 sm:-top-4 sm:-right-4 sm:h-10 sm:w-10 lg:h-11 lg:w-11",
  /** Full-width bar (not yet sticky) */
  layoutBar: "-right-2 -top-2 h-7 w-7 sm:-top-4 sm:-right-4 sm:h-9 sm:w-9 lg:h-10 lg:w-10",
  dropShadow: "drop-shadow(0 2px 6px rgba(0,0,0,0.5))",
} as const;

/** Easing for bar ↔ floating pill morph (scroll state). */
const SCROLL_STATE_TRANSITION = { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const };

/** FLIP: match Tailwind `top-4` + responsive horizontal insets (`left-2` / `sm:left-8` / `lg:left-16`). */
function getFloatTargetRects() {
  if (typeof window === "undefined") {
    return { top: 16, left: 8, width: 400 };
  }
  const fs = parseFloat(getComputedStyle(document.documentElement).fontSize || "16");
  const rem = (n: number) => n * fs;
  const vw = window.innerWidth;
  let leftInset = rem(0.5);
  if (vw >= 1024) leftInset = rem(4);
  else if (vw >= 640) leftInset = rem(2);
  return {
    top: rem(1),
    left: leftInset,
    width: Math.max(0, vw - leftInset * 2),
  };
}

const BANNER_SHADOW_REST =
  "0 10px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -1px 0 rgba(0, 0, 0, 0.3)";
const BANNER_SHADOW_FLOAT =
  "0 14px 44px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.12), inset 0 -1px 0 rgba(0, 0, 0, 0.32)";

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
  const slug = usePromoThemeStore((s) => s.slug);
  const toolsetSlug = usePromoThemeStore((s) => s.toolsetSlug);
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
  const prefersReducedMotion = useReducedMotion();
  /** Pixel layout for fixed pill (FLIP enter/resize); unused when not scrolled. */
  const floatTop = useMotionValue(0);
  const floatLeft = useMotionValue(0);
  const floatWidth = useMotionValue(0);
  const shouldAnimateFloatEnter = useRef(false);
  /** Active FLIP / resize animations — must stop when leaving fixed mode or Motion can leave stale inline geometry. */
  const floatLayoutAnimRef = useRef<Array<{ stop: () => void }>>([]);
  const bannerRef = useRef<HTMLDivElement>(null);
  const [bannerHeight, setBannerHeight] = useState<number | null>(null);
  const [isContentReady, setIsContentReady] = useState(false);

  // Fetch active scheduled banner text
  const { data: activeBannerTextData } = useActivePromoBannerText();
  const activeBannerSchedule = activeBannerTextData?.data ?? null;

  // Fetch current alternating multipliers
  const { data: currentAlternatingMultipliers } = useCurrentAlternatingMultipliers();

  // Store alternating multiplier in state - only updates once per day (AEST)
  // Initialize to null to avoid hydration mismatch (will be set in useEffect)
  const [alternatingMultiplier, setAlternatingMultiplier] = useState<number | null>(null);

  // Effective-for-banner: multiplier, source, scheduled meta (for countdown mode and badge)
  // When member toggles to one-time tab, they see additional packages which use membership promo
  const { data: effectiveForBanner, isLoading: isEffectiveForBannerLoading } = useEffectiveForBanner();
  const baseType = activeTab === "membership" ? "membership-packages" : "one-time-packages";
  const effectivePromoTypeForBanner =
    activeTab === "one-time" && hasAccessToAdditionalPackages ? "membership-packages" : baseType;
  const effectiveEntry = effectiveForBanner?.[effectivePromoTypeForBanner];
  // Right-side countdown: when one-time tab is selected, use membership's entry so it behaves the same (e.g. 24hr countdown)
  const effectiveEntryForCountdown =
    activeTab === "one-time"
      ? (effectiveForBanner?.["membership-packages"] ?? effectiveEntry)
      : effectiveEntry;

  // Promo "fully resolved" = we know for sure whether there is an active promo or no-promo state
  const isPromoResolved =
    !isEffectiveForBannerLoading && !isDrawLoading && !isVariantLoading;

  // Legacy: use initial data for "active promo" object when provided (e.g. promotions page SSR)
  const { data: membershipPromoClient } = usePromoByType("membership-packages");
  const { data: oneTimePromoClient } = usePromoByType("one-time-packages");
  const membershipPromo = initialMembershipPromo || membershipPromoClient;
  const oneTimePromo = initialOneTimePromo || oneTimePromoClient;

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
  }, [currentAlternatingMultipliers, effectivePromoTypeForBanner, activePromo]); // eslint-disable-line react-hooks/exhaustive-deps -- activeTab only used in dev log; effectivePromoTypeForBanner captures tab

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
          const isMobile = window.innerWidth < 1024;
          const scrollThreshold = isMobile ? 100 : 200;
          const nextScrolled = scrollY > scrollThreshold;

          setIsScrolled((prev) => {
            // FLIP: capture in-flow rect before switching to fixed so we can animate (no teleport to top-4).
            if (nextScrolled && !prev && bannerRef.current) {
              const r = bannerRef.current.getBoundingClientRect();
              floatTop.set(r.top);
              floatLeft.set(r.left);
              floatWidth.set(r.width);
              shouldAnimateFloatEnter.current = true;
            }
            return nextScrolled;
          });

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
  }, [floatTop, floatLeft, floatWidth]);

  // Leaving fixed mode: stop all FLIP/resize animations and reset motion values so nothing stays "inset" on the bar.
  useLayoutEffect(() => {
    if (isScrolled) return;
    floatLayoutAnimRef.current.forEach((a) => a.stop());
    floatLayoutAnimRef.current = [];
    floatTop.set(0);
    floatLeft.set(0);
    floatWidth.set(0);
  }, [isScrolled, floatTop, floatLeft, floatWidth]);

  // After switching to fixed, animate top/left/width from measured rect → floating pill (FLIP).
  // useLayoutEffect avoids one frame at wrong position; handles prefers-reduced-motion + fallback snap.
  useLayoutEffect(() => {
    if (!isScrolled) return;

    const tgt = getFloatTargetRects();

    if (prefersReducedMotion) {
      floatTop.set(tgt.top);
      floatLeft.set(tgt.left);
      floatWidth.set(tgt.width);
      return;
    }

    if (floatWidth.get() < 8) {
      floatTop.set(tgt.top);
      floatLeft.set(tgt.left);
      floatWidth.set(tgt.width);
      return;
    }

    if (!shouldAnimateFloatEnter.current) return;
    shouldAnimateFloatEnter.current = false;

    const transition = { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const };
    const c1 = animate(floatTop, tgt.top, transition);
    const c2 = animate(floatLeft, tgt.left, transition);
    const c3 = animate(floatWidth, tgt.width, transition);
    floatLayoutAnimRef.current = [c1, c2, c3];
    return () => {
      c1.stop();
      c2.stop();
      c3.stop();
      floatLayoutAnimRef.current = [];
    };
  }, [isScrolled, prefersReducedMotion, floatTop, floatLeft, floatWidth]);

  // Keep pill aligned with viewport when resized while floating.
  useEffect(() => {
    if (!isScrolled) return;

    const syncFloatLayout = () => {
      const tgt = getFloatTargetRects();
      floatLayoutAnimRef.current.forEach((a) => a.stop());
      floatLayoutAnimRef.current = [];
      if (prefersReducedMotion) {
        floatTop.set(tgt.top);
        floatLeft.set(tgt.left);
        floatWidth.set(tgt.width);
        return;
      }
      const c1 = animate(floatTop, tgt.top, { duration: 0.2, ease: "easeOut" });
      const c2 = animate(floatLeft, tgt.left, { duration: 0.2, ease: "easeOut" });
      const c3 = animate(floatWidth, tgt.width, { duration: 0.2, ease: "easeOut" });
      floatLayoutAnimRef.current = [c1, c2, c3];
    };

    window.addEventListener("resize", syncFloatLayout);
    return () => window.removeEventListener("resize", syncFloatLayout);
  }, [isScrolled, prefersReducedMotion, floatTop, floatLeft, floatWidth]);

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
  // Uses effectiveEntryForCountdown so one-time tab shows same as membership (e.g. 24hr countdown)
  const scheduledPromoState = useMemo(() => {
    const hasScheduledPromo = effectiveEntryForCountdown?.source === "scheduled" && effectiveEntryForCountdown?.scheduledEndDate;
    if (!hasScheduledPromo) return { hasScheduledPromo: false as const, isUrgent: false };
    const endMs = new Date(effectiveEntryForCountdown!.scheduledEndDate!).getTime();
    const timeLeftMs = endMs - Date.now();
    const isUrgent = timeLeftMs > 0 && timeLeftMs <= MS_24H;
    return { hasScheduledPromo: true, isUrgent };
  }, [effectiveEntryForCountdown?.source, effectiveEntryForCountdown?.scheduledEndDate]); // eslint-disable-line react-hooks/exhaustive-deps -- effectiveEntryForCountdown object identity unstable; source/scheduledEndDate sufficient

  const leftVisual = useMemo(() => {
    const drawStatus = getDrawDateStatus();
    return resolvePromoBannerLeftVisual({
      variantLeftImageUrl: variantConfig?.banner?.leftImageUrl,
      scheduledImageUrl: activeBannerSchedule?.imageUrl,
      scheduledAltText: activeBannerSchedule?.altText,
      slug,
      toolsetSlug,
      drawIsToday: drawStatus === "today",
      scheduledPromoUrgent: scheduledPromoState.hasScheduledPromo && scheduledPromoState.isUrgent,
      hasScheduledPromo: scheduledPromoState.hasScheduledPromo,
      multiplier,
    });
  }, [
    variantConfig?.banner?.leftImageUrl,
    activeBannerSchedule?.imageUrl,
    activeBannerSchedule?.altText,
    slug,
    toolsetSlug,
    scheduledPromoState.hasScheduledPromo,
    scheduledPromoState.isUrgent,
    multiplier,
    currentDraw?.drawDate,
  ]);

  const leftVisualStaticUrls = useMemo(() => {
    if (leftVisual.srcFallbacks?.length) {
      return [leftVisual.src, ...leftVisual.srcFallbacks];
    }
    return [leftVisual.src];
  }, [leftVisual.src, leftVisual.srcFallbacks]);

  const [leftImageUrlIndex, setLeftImageUrlIndex] = useState(0);

  useEffect(() => {
    setLeftImageUrlIndex(0);
  }, [leftVisualStaticUrls.join("\0")]);

  const displayLeftSrc =
    leftVisualStaticUrls[Math.min(leftImageUrlIndex, leftVisualStaticUrls.length - 1)] ?? leftVisual.src;

  const handleLeftImageError = () => {
    setLeftImageUrlIndex((i) => (i < leftVisualStaticUrls.length - 1 ? i + 1 : i));
  };

  // Countdown display: variant config drives behaviour; default is limited_time_only
  // Uses effectiveEntryForCountdown so one-time tab shows same as membership (e.g. 24hr countdown)
  const countdownDisplay = useMemo(() => {
    const drawStatus = getDrawDateStatus();
    return resolveCountdownDisplay({
      countdownMode: variantConfig?.banner?.countdownMode ?? "limited_time_only",
      showCountdown: variantConfig?.banner?.showCountdown !== false,
      source: effectiveEntryForCountdown?.source ?? "none",
      scheduledEndDate: effectiveEntryForCountdown?.scheduledEndDate ?? undefined,
      durationMs: effectiveEntryForCountdown?.durationMs ?? undefined,
      drawStatus,
      countdownLabel: variantConfig?.banner?.countdownLabel ?? undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getDrawDateStatus stable; effectiveEntryForCountdown via source/dates
  }, [
    variantConfig?.banner?.countdownMode,
    variantConfig?.banner?.showCountdown,
    variantConfig?.banner?.countdownLabel,
    effectiveEntryForCountdown?.source,
    effectiveEntryForCountdown?.scheduledEndDate,
    effectiveEntryForCountdown?.durationMs,
    currentDraw?.drawDate,
    activeTab,
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

  useEffect(() => {
    if (isDrawLoading) {
      setIsContentReady(false);
      return;
    }
    const timer = setTimeout(() => setIsContentReady(true), 50);
    return () => clearTimeout(timer);
  }, [isDrawLoading]);

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
  }, [isScrolled, activePromo, multiplier, isGapPeriod, displayLeftSrc]);

  if (pathname === "/not-found" || isAnySidebarOpen) return null;
  if (!isPromoResolved) return null;

  // Keep the banner below the header by default; only float it once scrolled for visibility.
  // Use wrapper to prevent layout shift when banner becomes fixed
  const bgColorClass = "bg-black";
  const showPromoCountdownStrip = countdownDisplay.type !== "hidden" || isGapPeriod;

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
        initial={{ opacity: 0 }}
        // When flow mode, pass explicit geometry (not `undefined`) so Framer never keeps fixed-era inline top/left/width.
        style={
          isScrolled
            ? {
                position: "fixed",
                top: floatTop,
                left: floatLeft,
                width: floatWidth,
                maxWidth: "100vw",
              }
            : {
                position: "relative",
                top: "auto",
                left: "auto",
                right: "auto",
                width: "100%",
                maxWidth: "none",
              }
        }
        animate={{
          opacity: 1,
        }}
        className={`cursor-pointer select-none ${
          isScrolled ? "fixed z-50" : "relative z-30 mt-0 w-full max-w-none shrink-0"
        }`}
        transition={{
          opacity: { duration: 0.35, ease: "easeOut" },
        }}
      >
        {/* Surface: CSS transitions (not layout motion) so the resting bar stays full-bleed; overflow only when pill clips corners. */}
        <div
          className={`${bgColorClass} w-full min-w-0 ${isScrolled ? "overflow-hidden" : "overflow-visible"}`}
          style={
            {
              borderRadius: isScrolled ? 9999 : 0,
              boxShadow: isScrolled ? BANNER_SHADOW_FLOAT : BANNER_SHADOW_REST,
              ...(prefersReducedMotion
                ? {}
                : {
                    transitionProperty: "border-radius, box-shadow",
                    transitionDuration: `${SCROLL_STATE_TRANSITION.duration}s`,
                    transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
                  }),
              ...(isScrolled
                ? { border: `2px solid ${theme.borderRgba}` }
                : { borderBottom: `2px solid ${theme.borderRgba}` }),
            } as React.CSSProperties
          }
        >
          <div
            className={`relative w-full overflow-visible ${
              isScrolled
                ? "min-h-[4rem] sm:min-h-[6.25rem] lg:min-h-[6.25rem] max-[360px]:py-0.5"
                : "min-h-[4.5rem] sm:min-h-[7rem] lg:min-h-[6.75rem]"
            }`}
          >
            {/* Full-bleed flame layer */}
            <div className="fire pointer-events-none absolute inset-0 z-0 min-h-full w-full" aria-hidden />
            <div
              className={`relative z-10 flex w-full flex-row items-center justify-between gap-2.5 sm:gap-4 py-0 sm:py-0.5 pl-1.5 pr-3 sm:pl-4 sm:pr-5 lg:pl-3 lg:pr-7 ${
                isScrolled
                  ? "min-h-[4rem] sm:min-h-[6.25rem] lg:min-h-[6.25rem] max-[360px]:gap-3 max-[360px]:pl-1 max-[360px]:pr-2"
                  : "min-h-[4.5rem] sm:min-h-[7rem] lg:min-h-[6.75rem]"
              } ${!showPromoCountdownStrip ? "justify-start" : ""}`}
            >
              {/* Art sits in flex-1: centered toward countdown when strip shows; left only when no strip. */}
              <div
                className={`relative flex min-h-0 min-w-0 flex-1 items-center max-sm:min-w-[40%] ${
                  isScrolled ? "max-sm:min-h-[4rem]" : "max-sm:min-h-[4.5rem]"
                } ${
                  showPromoCountdownStrip
                    ? "justify-center sm:justify-center lg:justify-start lg:pl-0"
                    : "justify-start"
                }`}
              >
                {isContentReady ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className={`relative flex shrink-0 ${
                      showPromoCountdownStrip
                        ? "justify-center lg:justify-start"
                        : "justify-start"
                    } max-sm:absolute max-sm:top-1/2 max-sm:z-10 max-sm:-translate-y-1/2 sm:static sm:left-auto sm:top-auto sm:z-auto sm:translate-y-0 ${
                      showPromoCountdownStrip
                        ? "max-sm:left-1/2 max-sm:-translate-x-1/2 sm:translate-x-0"
                        : "max-sm:left-0 max-sm:translate-x-0 sm:translate-x-0"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={displayLeftSrc}
                      alt={leftVisual.alt}
                      onError={handleLeftImageError}
                      className={`w-auto object-contain object-center lg:object-left drop-shadow-md ${
                        isScrolled
                          ? showPromoCountdownStrip
                            ? "h-[4rem] sm:h-[6.25rem] lg:h-[6.25rem] max-w-[min(520px,calc(100vw-11rem))] sm:max-w-[min(500px,calc(100vw-13rem))] lg:max-w-[min(92vw,520px)] max-[360px]:h-[3.5rem] max-[360px]:max-w-[min(88vw,360px)]"
                            : "h-[4rem] sm:h-[6.25rem] lg:h-[6.25rem] max-w-[min(92vw,500px)] sm:max-w-[min(94vw,520px)] max-[360px]:h-[3.5rem] max-[360px]:max-w-[min(88vw,340px)]"
                          : showPromoCountdownStrip
                            ? "h-[4.5rem] sm:h-[7rem] lg:h-[6.75rem] max-w-[min(580px,calc(100vw-11rem))] sm:max-w-[min(580px,calc(100vw-13rem))] lg:max-w-[min(95vw,580px)]"
                            : "h-[4.5rem] sm:h-[7rem] lg:h-[6.75rem] max-w-[min(95vw,580px)]"
                      }`}
                    />
                  </motion.div>
                ) : (
                  <div
                    className={`${
                      isScrolled
                        ? "h-[4rem] sm:h-[6.25rem] lg:h-[6.25rem] w-[10rem] sm:w-[14rem]"
                        : "h-[4.5rem] sm:h-[7rem] lg:h-[6.75rem] w-[11rem] sm:w-[15rem]"
                    } shrink-0 rounded bg-white/10 animate-pulse max-sm:absolute max-sm:top-1/2 max-sm:-translate-y-1/2 sm:static sm:translate-x-0 sm:translate-y-0 ${
                      showPromoCountdownStrip
                        ? "max-sm:left-1/2 max-sm:-translate-x-1/2"
                        : "max-sm:left-0 max-sm:-translate-x-0"
                    }`}
                    aria-hidden="true"
                  />
                )}
              </div>

              {showPromoCountdownStrip && (
                <div className="pointer-events-auto relative z-[15] flex shrink-0 flex-col items-end justify-center [filter:drop-shadow(0_4px_14px_rgba(0,0,0,0.45))]">
                  {/* Badge anchor: PROMO_BANNER_MULTIPLIER_BADGE positions against this box */}
                  <div className="relative inline-flex flex-col items-end">
                    {!isGapPeriod &&
                      countdownDisplay.type !== "hidden" &&
                      !isNoPromo &&
                      multiplier &&
                      [2, 3, 5, 10].includes(multiplier) && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={`/images/badge/X${multiplier}.png`}
                          alt={`${multiplier}X entries`}
                          className={`${PROMO_BANNER_MULTIPLIER_BADGE.root} ${
                            isScrolled
                              ? PROMO_BANNER_MULTIPLIER_BADGE.layoutScrolled
                              : PROMO_BANNER_MULTIPLIER_BADGE.layoutBar
                          }`}
                          style={{ filter: PROMO_BANNER_MULTIPLIER_BADGE.dropShadow }}
                        />
                      )}
                    {(() => {
                const rightSectionTileStyle = {
                  background: theme.gradientSolid,
                  boxShadow: `0 0 12px ${theme.shadowRgba}`,
                };

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
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}
