"use client";

import { Fragment, useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useLeafTimer } from "@/hooks/useLeafTimer";
import { motion, animate, useMotionValue, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { usePromoByType, useEffectiveForBanner } from "@/hooks/queries/usePromoQueries";
import { useSidebar } from "@/contexts/SidebarContext";
import { useMajorDrawCountdown, useCurrentMajorDraw, useNextDraw } from "@/hooks/queries/useMajorDrawQueries";
import { useActivePromoBannerText } from "@/hooks/queries/usePromoBannerTextQueries";
import { useCurrentAlternatingMultipliers } from "@/hooks/queries/useAlternatingMultiplierQueries";
import { getNextMidnightAEST, convertUTCToAEST } from "@/utils/common/timezone";
import type { ServerPromo } from "@/utils/database/queries/promo-queries";
import { resolveCountdownDisplay, formatTimeLeft } from "@/utils/promo-banner/countdown-mode";
import { resolvePromoBannerLeftVisual } from "@/utils/promo-banner/resolve-promo-banner-left-visual";
import type { HolidayPromoSlot } from "@/utils/promo-banner/holiday-promo-banner";
import { readInitialHolidayDevSlotForClient } from "@/utils/promo-banner/holiday-promo-banner";
import { PromoHolidayDevToolbar } from "./PromoHolidayDevToolbar";
import { NO_PROMO_RIGHT_LABEL } from "@/constants/promo-banner";
import { useVariantContext } from "@/components/ab-testing/VariantProvider";
import { UrgencyClockIcon } from "@/components/ui";
import { usePromoTheme, usePromoThemeStore } from "@/stores/usePromoThemeStore";
import { useUserContext } from "@/contexts/UserContext";
import { useUserMajorDrawStats } from "@/hooks/queries/useMajorDrawQueries";
import { hasAdditionalPackageAccess } from "@/utils/membership/has-additional-package-access";
import {
  MEMBERSHIP_PACKAGES_QUERY_PARAM,
  parseMembershipPackagesTab,
} from "@/utils/membership/packagesTabParam";
import Image from "next/image";
import { hasBundledMultiplierAssets, isPromoMultiplier } from "@/types/promo-multiplier";
import { cn } from "@/utils/cn";
import { addThrottledResize } from "@/utils/dom/listenerHelpers";

/**
 * X2 / X10 multiplier badge — only used here. Anchored to the countdown cluster’s
 * `relative inline-flex flex-col items-end` wrapper (`items-end` = top-right of that box).
 * Tweak size/offset here; Tailwind must see full class strings (no dynamic assembly).
 */
const PROMO_BANNER_MULTIPLIER_BADGE = {
  root: "absolute z-30 pointer-events-none select-none object-contain origin-top-right max-w-none",
  /** Floating pill after scroll — max-[360px] mirrors left-art tighten (see img max-[360px]:h-*) */
  layoutScrolled:
    "-top-5 -right-4 h-[calc(3rem+2px)] w-[calc(3rem+2px)] max-[400px]:-top-3 max-[360px]:-right-1.5 max-[360px]:h-[calc(2rem+2px)] max-[360px]:w-[calc(2rem+2px)] min-[361px]:max-[500px]:-top-3.5 min-[361px]:max-[500px]:-right-2 min-[361px]:max-[500px]:h-[calc(2.25rem+2px)] min-[361px]:max-[500px]:w-[calc(2.25rem+2px)] sm:-top-7 sm:-right-7 sm:h-[calc(4rem+2px)] sm:w-[calc(4rem+2px)] lg:-top-8 lg:-right-8 lg:h-[calc(4.5rem+2px)] lg:w-[calc(4.5rem+2px)]",
  /** Full-width bar (not yet sticky) — mobile: keep badge inside safe area */
  layoutBar:
    "-top-3.5 -right-2 h-[calc(3rem+2px)] w-[calc(3rem+2px)] max-[400px]:-top-3 max-[360px]:-right-1.5 max-[360px]:h-[calc(2rem+2px)] max-[360px]:w-[calc(2rem+2px)] min-[361px]:max-[500px]:-top-3.5 min-[361px]:max-[500px]:-right-2 min-[361px]:max-[500px]:h-[calc(2.25rem+2px)] min-[361px]:max-[500px]:w-[calc(2.25rem+2px)] sm:-top-7 sm:-right-7 sm:h-[calc(3.5rem+2px)] sm:w-[calc(3.5rem+2px)] lg:-top-8 lg:-right-8 lg:h-[calc(4rem+2px)] lg:w-[calc(4rem+2px)]",
  dropShadow: "drop-shadow(0 2px 6px rgba(0,0,0,0.5))",
} as const;

type PromoBannerCountdownSegment = { value: string; label: string };

/**
 * Single timer strip: hairline dividers (reliable on all fonts — avoids “=” glyph bugs from Unicode colons).
 */
function PromoBannerUnifiedCountdown({
  segments,
  textClassName,
  labelClassName,
  surfaceStyle,
  size = "default",
}: {
  segments: PromoBannerCountdownSegment[];
  textClassName: string;
  labelClassName: string;
  surfaceStyle: CSSProperties;
  size?: "compact" | "default";
}) {
  const isCompact = size === "compact";
  /* Left promo art uses max-[360px]:h-* ~0.87× the base mobile h-* — mirror that on typography + padding below */
  const numCn = isCompact
    ? `${textClassName} font-black font-sans tracking-tight tabular-nums text-[13px] leading-none max-[360px]:text-2xs sm:text-sm md:text-base lg:text-lg drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)]`
    : `${textClassName} font-black font-sans tracking-tight tabular-nums text-[15px] leading-none max-[360px]:text-[13px] sm:text-xl md:text-2xl lg:text-3xl drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]`;
  const labelCn = isCompact
    ? `${labelClassName} font-semibold uppercase tracking-[0.12em] text-3xs max-[360px]:text-[7px] sm:text-3xs md:text-3xs lg:text-2xs mt-0.5 opacity-95`
    : `${labelClassName} font-semibold uppercase tracking-[0.12em] text-[7.5px] max-[360px]:text-[6.5px] sm:text-3xs md:text-2xs lg:text-xs mt-0.5 sm:mt-1 opacity-95`;

  const segmentCount = segments.length;
  /* Timer: slightly wider cap on mobile than before; ≤360px tighter cap (tracks left column %) */
  const panelWidthClasses = isCompact
    ? "mx-1.5 min-w-0 w-auto max-w-[min(100%,calc(100vw-8.25rem))] max-[360px]:max-w-[min(100%,calc(100vw-9.25rem))] sm:max-w-[min(100%,20rem)] md:min-w-[11.5rem] lg:min-w-[12rem] xl:min-w-[13rem]"
    : segmentCount >= 4
      ? "mx-1.5 min-w-0 w-auto max-w-[min(100%,calc(100vw-8.25rem))] max-[360px]:max-w-[min(100%,calc(100vw-9.25rem))] sm:max-w-[min(100%,24rem)] md:min-w-[15rem] lg:min-w-[19rem] xl:min-w-[22rem]"
      : "mx-1.5 min-w-0 w-auto max-w-[min(100%,calc(100vw-8.25rem))] max-[360px]:max-w-[min(100%,calc(100vw-9.25rem))] sm:max-w-[min(100%,22rem)] md:min-w-[13rem] lg:min-w-[17rem] xl:min-w-[21rem]";

  const segmentShell = isCompact
    ? "flex min-w-0 flex-1 flex-col items-center justify-center px-1.5 py-0 max-[360px]:px-1 sm:px-2.5 md:px-3 lg:px-4"
    : "flex min-w-0 flex-1 flex-col items-center justify-center px-2 py-0 max-[360px]:px-1.5 sm:px-2.5 md:px-3 lg:px-4";

  return (
    <div
      className={[
        "relative isolate overflow-hidden rounded-lg border border-white/25 sm:rounded-xl md:rounded-2xl",
        panelWidthClasses,
        isCompact
          ? "px-3 py-1 max-[360px]:px-2 max-[360px]:py-0.5 sm:px-5 sm:py-1.5 md:px-6 md:py-2 lg:px-8 lg:py-2.5"
          : "px-3.5 py-2 max-[360px]:px-2.5 max-[360px]:py-1.5 sm:px-5 sm:py-1.5 md:px-6 md:py-2 lg:px-8 lg:py-2.5",
        "shadow-[0_1px_0_rgba(255,255,255,0.14)_inset,0_-2px_0_rgba(0,0,0,0.18)_inset,0_8px_24px_rgba(0,0,0,0.4),0_2px_8px_rgba(0,0,0,0.25)]",
        "ring-1 ring-white/10",
      ].join(" ")}
      style={surfaceStyle}
      role="timer"
      aria-live="polite"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.15] via-transparent to-black/15"
        aria-hidden
      />
      <div className="relative flex items-stretch justify-center">
        {segments.map((seg, i) => (
          <Fragment key={`${seg.label}-${i}`}>
            {i > 0 ? (
              <div
                className="w-px flex-shrink-0 bg-gradient-to-b from-transparent via-white/35 to-transparent sm:w-px sm:via-white/30"
                aria-hidden
              />
            ) : null}
            <div className={segmentShell}>
              <span className={numCn}>{seg.value}</span>
              <span className={labelCn}>{seg.label}</span>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/**
 * Leaf component owning the 1s tick for the right-side countdown surfaces.
 * Lives in PromoBanner so the parent does not re-render every second; only this
 * leaf does. The render prop receives `now` (ms) and returns the JSX (typically
 * a <PromoBannerUnifiedCountdown>).
 */
function PromoBannerCountdownTickLeaf({
  render,
}: {
  render: (now: number) => ReactNode;
}) {
  const now = useLeafTimer(1000);
  return <>{render(now)}</>;
}

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
  /** Bright gradient tile (e.g. Ryobi lime): keep labels dark in light + dark site theme — `dark:text-neutral-100` was near-white on lime and unreadable. */
  const rightSectionLabelClass = preferDark ? "text-black" : "text-red-100";
  const pathname = usePathname();
  const { isAnySidebarOpen } = useSidebar();
  const { targetDateMs, currentDraw } = useMajorDrawCountdown();
  const { isLoading: isDrawLoading } = useCurrentMajorDraw();
  const { data: nextDraw } = useNextDraw();

  // Gap period: gates closed (no active draw), next draw ~3.5hrs away
  const isGapPeriod = currentDraw?.status !== "active";
  // Default tab; the mount effect below seeds it from the `?packages=` ad-landing param and keeps it in
  // sync with MembershipSection via the `membershipTabChanged` event.
  const [activeTab, setActiveTab] = useState<"membership" | "one-time">("membership");

  const [holidayDevPreview, setHolidayDevPreview] = useState<HolidayPromoSlot | null>(() =>
    readInitialHolidayDevSlotForClient()
  );

  // User context for member+one-time tab multiplier resolution (align with MembershipSection)
  const { userData } = useUserContext();
  const { data: userMajorDrawStats } = useUserMajorDrawStats(userData?._id);
  const hasAccessToAdditionalPackages = hasAdditionalPackageAccess(userData, userMajorDrawStats);

  // Get variant config from context (wait for variant to resolve so we know countdown mode etc.)
  const { variantConfig, isLoading: isVariantLoading } = useVariantContext();

  /** Kept in sync via a low-frequency tick so static left art can switch at the 48h boundary. */
  const [within48HoursOfFreeze, setWithin48HoursOfFreeze] = useState(false);

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

  // On mount: seed the tab from the `?packages=` ad-landing param (so the multiplier badge matches a forced
  // One-Time landing), then keep it in sync with MembershipSection's toggle via `membershipTabChanged`.
  // We read `window.location.search` rather than `useSearchParams()` on purpose: PromoBanner renders
  // OUTSIDE the promo pages' Suspense boundaries, so `useSearchParams()` here would force these statically
  // generated routes to de-opt (build error / banner pop-in). Reading in an effect is client-only and
  // avoids a hydration mismatch — the server renders the "membership" default; the param applies post-mount.
  useEffect(() => {
    const forced = parseMembershipPackagesTab(
      new URLSearchParams(window.location.search).get(MEMBERSHIP_PACKAGES_QUERY_PARAM),
    );
    if (forced) setActiveTab(forced);

    const handleTabChange = (event: CustomEvent<{ activeTab: "membership" | "one-time" }>) => {
      setActiveTab(event.detail.activeTab);
    };
    window.addEventListener("membershipTabChanged", handleTabChange as EventListener);
    return () => {
      window.removeEventListener("membershipTabChanged", handleTabChange as EventListener);
    };
  }, []);

  const applyScrollThreshold = useCallback(() => {
    if (typeof window === "undefined") return;
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
  }, [floatTop, floatLeft, floatWidth]);

  // Handle scroll detection - show fixed banner when user scrolls past threshold, revert when back to top
  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(() => {
          applyScrollThreshold();
          ticking = false;
        });
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [applyScrollThreshold]);

  // After paint / route change: re-sync scroll state so bar mode geometry isn’t wrong for one frame (full-bleed + sticky FLIP).
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) applyScrollThreshold();
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [pathname, applyScrollThreshold]);

  // Leaving fixed mode: stop all FLIP/resize animations and reset motion values so nothing stays "inset" on the bar.
  useLayoutEffect(() => {
    if (isScrolled) return;
    floatLayoutAnimRef.current.forEach((a) => a.stop());
    floatLayoutAnimRef.current = [];
    floatTop.set(0);
    floatLeft.set(0);
    floatWidth.set(0);
    // Going back to the in-flow bar: Framer can leave the fixed-era inline
    // top/left/width on the node for a frame. With position:relative a stray
    // `top: <px>` shifts the bar DOWN (gap above it) while its flow slot stays at
    // top:0 (so the hero below overlaps under it) — the exact misplacement seen on
    // scroll-to-top. Force the bar geometry directly so it always sits flush; the
    // static style re-applies the same values on the next commit.
    const node = bannerRef.current;
    if (node) {
      node.style.top = "0px";
      node.style.left = "auto";
      node.style.right = "auto";
      node.style.width = "100vw";
    }
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

    return addThrottledResize(syncFloatLayout);
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

  // Helper: draw is today or tomorrow (in AEST)
  const getDrawDateStatus = useCallback((): "today" | "tomorrow" | null => {
    if (!currentDraw?.drawDate) return null;

    const drawDateUTC = new Date(currentDraw.drawDate);
    const drawDateAEST = convertUTCToAEST(drawDateUTC);
    const nowAEST = convertUTCToAEST(new Date());

    const drawDateStr = `${drawDateAEST.getFullYear()}-${String(drawDateAEST.getMonth() + 1).padStart(2, "0")}-${String(drawDateAEST.getDate()).padStart(2, "0")}`;
    const todayStr = `${nowAEST.getFullYear()}-${String(nowAEST.getMonth() + 1).padStart(2, "0")}-${String(nowAEST.getDate()).padStart(2, "0")}`;

    const tomorrowAEST = new Date(nowAEST);
    tomorrowAEST.setDate(tomorrowAEST.getDate() + 1);
    const tomorrowStr = `${tomorrowAEST.getFullYear()}-${String(tomorrowAEST.getMonth() + 1).padStart(2, "0")}-${String(tomorrowAEST.getDate()).padStart(2, "0")}`;

    if (drawDateStr === todayStr) {
      return "today";
    }
    if (drawDateStr === tomorrowStr) {
      return "tomorrow";
    }

    return null;
  }, [currentDraw?.drawDate]);

  const leftVisual = useMemo(() => {
    const drawStatus = getDrawDateStatus();
    return resolvePromoBannerLeftVisual({
      variantLeftImageUrl: variantConfig?.banner?.leftImageUrl,
      scheduledImageUrl: activeBannerSchedule?.imageUrl,
      scheduledAltText: activeBannerSchedule?.altText,
      slug,
      toolsetSlug,
      drawIsToday: drawStatus === "today",
      within48HoursOfFreeze,
      multiplier,
      holidayDevPreview: process.env.NODE_ENV === "development" ? holidayDevPreview : null,
    });
  }, [
    variantConfig?.banner?.leftImageUrl,
    activeBannerSchedule?.imageUrl,
    activeBannerSchedule?.altText,
    slug,
    toolsetSlug,
    within48HoursOfFreeze,
    multiplier,
    getDrawDateStatus,
    holidayDevPreview,
  ]);

  const isDrawnTomorrowLeftArt = leftVisual.staticFamily === "drawn-tomorrow";
  const isHolidayLeftArt = leftVisual.isHolidayVisual === true;

  const leftVisualStaticUrls = useMemo(() => {
    if (leftVisual.srcFallbacks?.length) {
      return [leftVisual.src, ...leftVisual.srcFallbacks];
    }
    return [leftVisual.src];
  }, [leftVisual.src, leftVisual.srcFallbacks]);

  const [leftImageUrlIndex, setLeftImageUrlIndex] = useState(0);

  const leftVisualStaticUrlsKey = leftVisualStaticUrls.join("\0");
  useEffect(() => {
    setLeftImageUrlIndex(0);
  }, [leftVisualStaticUrlsKey]);

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
  }, [
    getDrawDateStatus,
    variantConfig?.banner?.countdownMode,
    variantConfig?.banner?.showCountdown,
    variantConfig?.banner?.countdownLabel,
    effectiveEntryForCountdown?.source,
    effectiveEntryForCountdown?.scheduledEndDate,
    effectiveEntryForCountdown?.durationMs,
  ]);

  // Low-frequency parent tick — only updates the 48h-boundary boolean used by
  // `leftVisual` (the per-second countdown surfaces are rendered by leaf
  // components below so they don't re-render this parent on tick).
  useEffect(() => {
    const fortyEightHoursMs = 48 * 60 * 60 * 1000;
    const recompute = () => {
      const now = Date.now();
      const freezeMs = targetDateMs ? Math.max(0, targetDateMs - now) : 0;
      const next = !!(targetDateMs && freezeMs > 0 && freezeMs <= fortyEightHoursMs);
      setWithin48HoursOfFreeze((prev) => (prev === next ? prev : next));
    };
    recompute();
    const timer = setInterval(recompute, 30 * 1000);
    return () => clearInterval(timer);
  }, [targetDateMs]);

  useEffect(() => {
    if (isDrawLoading) {
      setIsContentReady(false);
      return;
    }
    const timer = setTimeout(() => setIsContentReady(true), 50);
    return () => clearTimeout(timer);
  }, [isDrawLoading]);

  // Reserve document flow height for the spacer using the **in-flow (relative)** banner only.
  // Measuring after `position: fixed` captures the shorter pill and shrinks the spacer → content jumps.
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    const measureInFlowOnly = () => {
      if (!bannerRef.current || isScrolled) return;
      const height = bannerRef.current.getBoundingClientRect().height;
      setBannerHeight((prev) => (Math.abs((prev ?? 0) - height) < 0.5 ? prev : height));
    };

    measureInFlowOnly();
    return addThrottledResize(measureInFlowOnly);
  }, [isScrolled, activePromo, multiplier, isGapPeriod, displayLeftSrc, leftVisual.staticFamily, isHolidayLeftArt]);

  if (pathname === "/not-found" || isAnySidebarOpen) return null;

  // While promo/draw/variant data resolves, reserve the banner's in-flow height
  // with a matching skeleton instead of returning null — otherwise the banner pops
  // in at full height and shoves the whole page down (CLS). Mirrors the bar layout
  // + the banner's own `bg-white/10 animate-pulse` skeleton idiom so it reads as one
  // loading state alongside the hero's pulse loader below it.
  if (!isPromoResolved) {
    return (
      <div
        aria-hidden="true"
        className="relative z-30 shrink-0 select-none bg-black"
        style={{
          width: "100vw",
          maxWidth: "100vw",
          marginLeft: "calc(50% - 50vw)",
          marginRight: "calc(50% - 50vw)",
          boxShadow: BANNER_SHADOW_REST,
          borderBottom: `2px solid ${theme.borderRgba}`,
        }}
      >
        <div className="relative flex w-full items-center justify-center px-4 min-h-[5rem] sm:min-h-[8rem] lg:min-h-[8.25rem]">
          {/* White-text Tools Australia logo, gently breathing — reads as a branded
              loading state on the dark bar. */}
          <motion.img
            src="/images/Tools%20Australia%20Logo/White-Text%20Logo.webp"
            alt=""
            draggable={false}
            className="h-9 w-auto object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)] sm:h-14 lg:h-16"
            initial={{ opacity: 0.6 }}
            animate={prefersReducedMotion ? { opacity: 0.9 } : { opacity: [0.55, 1, 0.55], scale: [1, 1.045, 1] }}
            transition={prefersReducedMotion ? { duration: 0.3 } : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </div>
    );
  }

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
                top: 0,
                left: "auto",
                right: "auto",
                width: "100vw",
                maxWidth: "100vw",
                marginLeft: "calc(50% - 50vw)",
                marginRight: "calc(50% - 50vw)",
              }
        }
        animate={{
          opacity: 1,
        }}
        className={`cursor-pointer select-none ${
          isScrolled ? "fixed z-50" : "relative top-0 z-30 mt-0 w-full max-w-none shrink-0"
        }`}
        transition={{
          opacity: { duration: 0.35, ease: "easeOut" },
        }}
      >
        {/* Outer stays overflow-visible so the multiplier badge (absolute) is not clipped; pill rounding + clip only on the bg/flame layer. */}
        <div className="relative w-full min-w-0 overflow-visible">
          <div
            className={`pointer-events-none absolute inset-0 z-0 min-h-full ${
              isScrolled ? "overflow-hidden rounded-[9999px]" : ""
            } ${bgColorClass}`}
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
            aria-hidden
          >
            <div className="fire pointer-events-none absolute inset-0 min-h-full w-full" />
          </div>
          <div
            className={`relative z-10 w-full overflow-visible ${
              isScrolled
                ? "min-h-[4.25rem] sm:min-h-[7rem] lg:min-h-[7rem] max-[360px]:py-0.5"
                : "min-h-[5rem] sm:min-h-[8rem] lg:min-h-[8.25rem]"
            }`}
          >
            <div
              className={`relative z-10 flex w-full min-w-0 flex-row items-center py-0 sm:py-0.5 pl-1 pr-2.5 max-[500px]:px-2 sm:pl-3 sm:pr-4 lg:pl-3 lg:pr-7 ${
                showPromoCountdownStrip ? "justify-between gap-2 sm:gap-3 md:gap-4" : "justify-start"
              } ${
                isScrolled
                  ? "min-h-[4.25rem] sm:min-h-[7rem] lg:min-h-[7rem]"
                  : "min-h-[5rem] sm:min-h-[8rem] lg:min-h-[8.25rem]"
              }`}
            >
              {/* Left art: intrinsic width, capped — middle stays empty (same logic as desktop space-between) */}
              <div
                className={`relative flex min-h-0 min-w-0 flex-col items-start justify-center ${
                  showPromoCountdownStrip
                    ? "w-auto max-w-[min(58%,19rem)] shrink-0 sm:max-w-[min(52%,22rem)] md:max-w-[min(48%,24rem)] lg:flex-1 lg:max-w-[min(52%,520px)] xl:max-w-[min(50%,560px)]"
                    : "flex-1"
                } ${isScrolled ? "max-sm:min-h-[3.5rem]" : ""}`}
              >
                {isContentReady ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="relative flex w-auto min-w-0 max-w-full shrink justify-start"
                  >
                    <Image
                      src={displayLeftSrc}
                      alt={leftVisual.alt}
                      width={640}
                      height={280}
                      sizes="(max-width: 360px) 90vw, (max-width: 640px) 58vw, 520px"
                      className={`w-auto max-w-full object-contain object-left drop-shadow-md ${
                        isHolidayLeftArt
                          ? isScrolled
                            ? showPromoCountdownStrip
                              ? "h-[4.75rem] sm:h-[7.5rem] lg:h-[7.5rem] max-lg:max-w-full lg:max-w-[min(94vw,640px)] max-[360px]:h-[4rem]"
                              : "h-[4.75rem] sm:h-[7.5rem] lg:h-[7.5rem] max-w-[min(94vw,600px)] sm:max-w-[min(96vw,640px)] max-[360px]:h-[4rem] max-[360px]:max-w-[min(90vw,380px)]"
                            : showPromoCountdownStrip
                              ? "h-[5.25rem] sm:h-[8rem] lg:h-[7.75rem] max-lg:max-w-full lg:max-w-[min(96vw,680px)] max-[360px]:h-[4.25rem]"
                              : "h-[5.25rem] sm:h-[8rem] lg:h-[7.75rem] max-w-[min(96vw,680px)]"
                          : isDrawnTomorrowLeftArt
                            ? isScrolled
                              ? showPromoCountdownStrip
                                ? "h-[4.25rem] sm:h-[7rem] lg:h-[7rem] max-lg:max-w-full lg:max-w-[min(94vw,640px)] max-[360px]:h-[3.75rem]"
                                : "h-[4.25rem] sm:h-[7rem] lg:h-[7rem] max-w-[min(94vw,620px)] sm:max-w-[min(95vw,640px)] max-[360px]:h-[3.75rem] max-[360px]:max-w-[min(90vw,360px)]"
                              : showPromoCountdownStrip
                                ? "h-[5rem] sm:h-[8rem] lg:h-[8.25rem] max-lg:max-w-full lg:max-w-[min(96vw,720px)]"
                                : "h-[5rem] sm:h-[8rem] lg:h-[8.25rem] max-w-[min(96vw,720px)]"
                            : isScrolled
                              ? showPromoCountdownStrip
                                ? "h-[4.25rem] sm:h-[7rem] lg:h-[7rem] max-lg:max-w-full lg:max-w-[min(94vw,640px)] max-[360px]:h-[3.75rem]"
                                : "h-[4.25rem] sm:h-[7rem] lg:h-[7rem] max-w-[min(94vw,620px)] sm:max-w-[min(95vw,640px)] max-[360px]:h-[3.75rem] max-[360px]:max-w-[min(90vw,360px)]"
                              : showPromoCountdownStrip
                                ? "h-[5rem] sm:h-[8rem] lg:h-[8.25rem] max-lg:max-w-full lg:max-w-[min(96vw,720px)]"
                                : "h-[5rem] sm:h-[8rem] lg:h-[8.25rem] max-w-[min(96vw,720px)]"
                      }`}
                      onError={handleLeftImageError}
                      priority
                    />
                  </motion.div>
                ) : (
                  <div
                    className={`${
                      isScrolled
                        ? isHolidayLeftArt
                          ? "h-[4.75rem] sm:h-[7.5rem] lg:h-[7.5rem] w-[11.5rem] sm:w-[16rem]"
                          : isDrawnTomorrowLeftArt
                            ? "h-[4.25rem] sm:h-[7rem] lg:h-[7rem] w-[11rem] sm:w-[15rem]"
                            : "h-[4.25rem] sm:h-[7rem] lg:h-[7rem] w-[11rem] sm:w-[15rem]"
                        : isHolidayLeftArt
                          ? "h-[5.25rem] sm:h-[8rem] lg:h-[7.75rem] w-[12.5rem] sm:w-[17rem]"
                          : isDrawnTomorrowLeftArt
                            ? "h-[5rem] sm:h-[8rem] lg:h-[8.25rem] w-[12rem] sm:w-[16rem]"
                            : "h-[5rem] sm:h-[8rem] lg:h-[8.25rem] w-[12rem] sm:w-[16rem]"
                    } shrink-0 rounded bg-white/10 animate-pulse max-lg:w-full max-lg:max-w-full`}
                    aria-hidden="true"
                  />
                )}
              </div>

              {showPromoCountdownStrip && (
                <div className="pointer-events-auto relative z-[15] flex min-w-0 w-auto shrink flex-col items-end justify-center overflow-visible pt-0.5 [filter:drop-shadow(0_4px_14px_rgba(0,0,0,0.45))]">
                  <div className="relative inline-flex w-auto min-w-0 max-w-full flex-col items-end overflow-visible">
                    {!isGapPeriod &&
                      countdownDisplay.type !== "hidden" &&
                      !isNoPromo &&
                      multiplier &&
                      isPromoMultiplier(multiplier) &&
                      (hasBundledMultiplierAssets(multiplier) ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={`/images/badge/X${multiplier}.webp`}
                          loading="lazy"
                          alt={`${multiplier}X entries`}
                          className={`${PROMO_BANNER_MULTIPLIER_BADGE.root} ${
                            isScrolled
                              ? PROMO_BANNER_MULTIPLIER_BADGE.layoutScrolled
                              : PROMO_BANNER_MULTIPLIER_BADGE.layoutBar
                          }`}
                          style={{ filter: PROMO_BANNER_MULTIPLIER_BADGE.dropShadow }}
                        />
                      ) : (
                        <span
                          className={`${PROMO_BANNER_MULTIPLIER_BADGE.root} flex items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-700 text-xs sm:text-sm font-black text-white border-2 border-amber-300/70 ${
                            isScrolled
                              ? PROMO_BANNER_MULTIPLIER_BADGE.layoutScrolled
                              : PROMO_BANNER_MULTIPLIER_BADGE.layoutBar
                          }`}
                          style={{ filter: PROMO_BANNER_MULTIPLIER_BADGE.dropShadow }}
                        >
                          {multiplier}x
                        </span>
                      ))}
                    {(() => {
                const rightSectionTileStyle = {
                  background: theme.gradientSolid,
                  boxShadow: `0 0 12px ${theme.shadowRgba}`,
                };

              // Gap period: "NEXT DRAW IN" label + countdown timer (compact padding to align with left height)
              if (isGapPeriod) {
                const labelClass = `${rightSectionLabelClass} font-medium text-2xs sm:text-2xs lg:text-sm`;
                const activationMs = nextDraw?.activationDate
                  ? new Date(nextDraw.activationDate).getTime()
                  : null;
                return (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, ease: "easeOut", delay: 0.15 }}
                    className="flex flex-col items-center justify-center"
                  >
                    <div
                      className="font-semibold text-2xs max-[360px]:text-3xs sm:text-2xs uppercase tracking-wider"
                      style={{
                        color: theme.primary,
                        textShadow: "0 1px 3px rgba(0,0,0,0.65)",
                      }}
                    >
                      NEXT DRAW IN
                    </div>
                    <PromoBannerCountdownTickLeaf
                      render={(now) => {
                        const remainingMs = activationMs ? Math.max(0, activationMs - now) : 0;
                        const totalSeconds = Math.floor(remainingMs / 1000);
                        const h = Math.floor(totalSeconds / 3600);
                        const m = Math.floor((totalSeconds % 3600) / 60);
                        const s = totalSeconds % 60;
                        return (
                          <PromoBannerUnifiedCountdown
                            segments={[
                              { value: h.toString().padStart(2, "0"), label: "HRS" },
                              { value: m.toString().padStart(2, "0"), label: "MINS" },
                              { value: s.toString().padStart(2, "0"), label: "SECS" },
                            ]}
                            textClassName={rightSectionTextClass}
                            labelClassName={labelClass}
                            surfaceStyle={rightSectionTileStyle}
                            size="compact"
                          />
                        );
                      }}
                    />
                  </motion.div>
                );
              }

              // No promo: show replacement label
              if (isNoPromo) {
                return (
                  <div className="flex items-center justify-center">
                    <div
                      className={cn("rounded-lg shadow-lg ring-2 text-center px-2 sm:px-4 lg:px-6 py-1.5 sm:py-2.5 lg:py-3", isScrolled ? "max-[360px]:px-2.5 max-[360px]:py-2" : "")}
                    style={rightSectionTileStyle}
                    >
                      <div
                        className={cn(rightSectionTextClass, "font-black font-sans drop-shadow-md text-xs sm:text-sm lg:text-base whitespace-nowrap", isScrolled ? "max-[360px]:text-sm" : "")}
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
                      className={cn("rounded-lg shadow-lg ring-2 text-center px-3 py-2.5 sm:px-4 sm:py-2.5 lg:px-6 lg:py-3", isScrolled ? "max-[360px]:px-2.5 max-[360px]:py-2" : "")}
                    style={rightSectionTileStyle}
                    >
                      <div
                        className={cn("flex items-center justify-center gap-1.5", rightSectionTextClass, "font-black font-sans drop-shadow-md text-sm sm:text-sm lg:text-base whitespace-nowrap", isScrolled ? "max-[360px]:text-sm" : "")}
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
                const labelClass = `${rightSectionLabelClass} font-medium text-2xs sm:text-2xs lg:text-sm`;
                const endMs = countdownDisplay.endMs ?? null;
                return (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, ease: "easeOut", delay: 0.15 }}
                    className="flex flex-col items-center justify-center gap-1"
                  >
                    <PromoBannerCountdownTickLeaf
                      render={(now) => {
                        const remainingMs = endMs != null ? Math.max(0, endMs - now) : 0;
                        const tl = formatTimeLeft(remainingMs, useDays);
                        const scheduledSegments: PromoBannerCountdownSegment[] = [];
                        if (useDays && tl.days != null) {
                          scheduledSegments.push({
                            value: tl.days.toString().padStart(2, "0"),
                            label: "DAYS",
                          });
                        }
                        scheduledSegments.push(
                          { value: tl.hours.toString().padStart(2, "0"), label: "HRS" },
                          { value: tl.minutes.toString().padStart(2, "0"), label: "MINS" }
                        );
                        if (!useDays) {
                          scheduledSegments.push({
                            value: tl.seconds.toString().padStart(2, "0"),
                            label: "SECS",
                          });
                        }
                        return (
                          <PromoBannerUnifiedCountdown
                            segments={scheduledSegments}
                            textClassName={rightSectionTextClass}
                            labelClassName={labelClass}
                            surfaceStyle={rightSectionTileStyle}
                          />
                        );
                      }}
                    />
                  </motion.div>
                );
              }

              // Draw tonight: countdown to freeze time
              if (countdownDisplay.type === "draw_tonight" && currentDraw?.freezeEntriesAt) {
                // Only show actual countdown when content is ready, otherwise show 00 00 00
                if (!isContentReady || isDrawLoading) {
                  return (
                    <div className="flex flex-col items-center justify-center gap-1">
                      <PromoBannerUnifiedCountdown
                        segments={[
                          { value: "00", label: "HRS" },
                          { value: "00", label: "MINS" },
                          { value: "00", label: "SECS" },
                        ]}
                        textClassName={rightSectionTextClass}
                        labelClassName={`${rightSectionLabelClass} font-medium text-2xs sm:text-2xs lg:text-sm`}
                        surfaceStyle={rightSectionTileStyle}
                      />
                    </div>
                  );
                }

                const freezeMs = currentDraw?.freezeEntriesAt
                  ? new Date(currentDraw.freezeEntriesAt).getTime()
                  : null;
                return (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, ease: "easeOut", delay: 0.15 }}
                    className="flex flex-col items-center justify-center gap-1"
                  >
                    <PromoBannerCountdownTickLeaf
                      render={(now) => {
                        const remainingMs = freezeMs ? Math.max(0, freezeMs - now) : 0;
                        const totalSeconds = Math.floor(remainingMs / 1000);
                        const h = Math.floor(totalSeconds / 3600);
                        const m = Math.floor((totalSeconds % 3600) / 60);
                        const s = totalSeconds % 60;
                        return (
                          <PromoBannerUnifiedCountdown
                            segments={[
                              { value: h.toString().padStart(2, "0"), label: "HRS" },
                              { value: m.toString().padStart(2, "0"), label: "MINS" },
                              { value: s.toString().padStart(2, "0"), label: "SECS" },
                            ]}
                            textClassName={rightSectionTextClass}
                            labelClassName={`${rightSectionLabelClass} font-medium text-2xs sm:text-2xs lg:text-sm`}
                            surfaceStyle={rightSectionTileStyle}
                          />
                        );
                      }}
                    />
                  </motion.div>
                );
              }

              // Midnight: show countdown to next midnight AEST
              if (!isContentReady || isDrawLoading) {
                return (
                  <div className="flex flex-col items-center justify-center gap-1">
                    <PromoBannerUnifiedCountdown
                      segments={[
                        { value: "00", label: "HRS" },
                        { value: "00", label: "MINS" },
                        { value: "00", label: "SECS" },
                      ]}
                      textClassName={rightSectionTextClass}
                      labelClassName={`${rightSectionLabelClass} font-medium text-2xs sm:text-2xs lg:text-sm`}
                      surfaceStyle={rightSectionTileStyle}
                    />
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
                  <PromoBannerCountdownTickLeaf
                    render={(now) => {
                      const fortyEightHoursMs = 48 * 60 * 60 * 1000;
                      const freezeMs = targetDateMs ? Math.max(0, targetDateMs - now) : 0;
                      let h = 0;
                      let m = 0;
                      let s = 0;
                      if (!targetDateMs || freezeMs > fortyEightHoursMs) {
                        const nextMidnight = getNextMidnightAEST();
                        const diffMs = Math.max(0, nextMidnight.getTime() - now);
                        const totalSeconds = Math.floor(diffMs / 1000);
                        h = Math.floor(totalSeconds / 3600);
                        m = Math.floor((totalSeconds % 3600) / 60);
                        s = totalSeconds % 60;
                      } else {
                        const totalSeconds = Math.floor(freezeMs / 1000);
                        h = Math.floor(totalSeconds / 3600);
                        m = Math.floor((totalSeconds % 3600) / 60);
                        s = totalSeconds % 60;
                      }
                      return (
                        <PromoBannerUnifiedCountdown
                          segments={[
                            { value: h.toString().padStart(2, "0"), label: "HRS" },
                            { value: m.toString().padStart(2, "0"), label: "MINS" },
                            { value: s.toString().padStart(2, "0"), label: "SECS" },
                          ]}
                          textClassName={rightSectionTextClass}
                          labelClassName={`${rightSectionLabelClass} font-medium text-2xs sm:text-2xs lg:text-sm`}
                          surfaceStyle={rightSectionTileStyle}
                        />
                      );
                    }}
                  />
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
      <PromoHolidayDevToolbar forcedSlot={holidayDevPreview} onForcedSlotChange={setHolidayDevPreview} />
    </>
  );
}
