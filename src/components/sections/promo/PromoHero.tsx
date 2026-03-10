"use client";

import Image from "next/image";
import { useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
import { usePromoByType, useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";
import { convertUTCToAEST } from "@/utils/common/timezone";
import type { ServerPromo } from "@/utils/database/queries/promo-queries";
import type { ServerMajorDraw } from "@/utils/database/queries/major-draw-server-queries";
import { useVariantContext } from "@/components/ab-testing/VariantProvider";
import { useExperimentTracking } from "@/hooks/ab-testing/useExperimentTracking";
import { getPromoImagePaths } from "@/utils/promo/promo-hero-images";
import type { DrawDateStatus } from "@/utils/promo/promo-hero-types";
import { usePromoTheme, usePromoThemeStore } from "@/stores/usePromoThemeStore";
import { getLandingHeroImagePaths } from "@/config/promo-landing-slugs";

interface PromoHeroProps {
  initialPromo?: ServerPromo | null;
  initialMajorDraw?: ServerMajorDraw | null;
  /** Toolset landing page - use landing hero images when available */
  isToolsetLandingPage?: boolean;
}

export default function PromoHero({
  initialPromo,
  initialMajorDraw,
  isToolsetLandingPage = false,
}: PromoHeroProps) {
  // Use initial data if available, but allow refetching for real-time updates
  const { isLoading, data: currentDraw } = useCurrentMajorDraw();
  const { data: activePromo } = usePromoByType("membership-packages");
  const heroRef = useScrollAnimation();
  const { openEntryFlow } = useMajorDrawEntryCta();
  
  // Get variant config from context
  const { experimentId, variantId, variantConfig, isLoading: _isVariantLoading } = useVariantContext();
  const { trackEvent } = useExperimentTracking();

  // Use initial data if available, otherwise fall back to fetched data
  const _promo = initialPromo || activePromo;
  const majorDraw = initialMajorDraw || currentDraw;

  // Get resolved multiplier (Active Promo > Alternating > Default 10x for display)
  const resolvedMultiplier = useResolvedMultiplier("membership-packages", "display");

  const handleEnterNow = () => {
    // Track CTA click event if experiment is active
    if (experimentId && variantId) {
      trackEvent(experimentId, variantId, "click", {
        element: "hero_cta",
      }).catch((error) => {
        // Silently fail - tracking should not break user experience
        console.error("Error tracking CTA click:", error);
      });
    }
    
    // Shared handler ensures the membership modal opens via the global event.
    openEntryFlow({ openLocalModal: false });
  };

  // Helper function to check if draw date is today or tomorrow (in AEST)
  const getDrawDateStatus = (): DrawDateStatus => {
    if (!majorDraw?.drawDate) return null;

    const drawDateUTC = new Date(majorDraw.drawDate);
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

  // Resolve hero image paths
  // Toolset landing: use landing hero if available for current prize slug
  // Otherwise: Variant config > Draw date > multiplier-based images
  const currentSlug = usePromoThemeStore((s) => s.slug);
  const drawDateStatus = getDrawDateStatus();
  const landingHeroPaths = isToolsetLandingPage && currentSlug ? getLandingHeroImagePaths(currentSlug) : null;
  const standardHeroPaths = getPromoImagePaths({
    multiplier: resolvedMultiplier,
    drawDateStatus,
    variantImageOverride: variantConfig?.hero?.imageSrc,
  });
  const heroImagePaths = landingHeroPaths ?? standardHeroPaths;
  
  // Get CTA text from variant config or use default
  const ctaText = variantConfig?.hero?.ctaText || "ENTER NOW";
  
  // Get CTA style from variant config
  const ctaStyle = variantConfig?.hero?.ctaStyle;
  const theme = usePromoTheme();
  const preferDark = theme.preferDarkBackground ?? false;

  // Show loading state only if major draw is loading (not variant - variant loads in background)
  if (isLoading) {
    return (
      <section className="relative flex flex-col justify-between items-center overflow-visible pt-20 sm:pt-40 aspect-[1080/1164] min-h-[clamp(380px,228px+38vw,520px)] lg:aspect-auto lg:h-[83vh] lg:min-h-0">
        {/* Skeleton loader matching final layout */}
        <div className="main-banner-image absolute inset-0 z-0 bg-gradient-to-br from-gray-200 to-gray-300 animate-pulse" />
        <div className="absolute -bottom-2 sm:-bottom-2 left-1/2 transform -translate-x-1/2 z-30">
          <div className="h-12 sm:h-16 w-32 sm:w-48 bg-gray-400 rounded-full animate-pulse" />
        </div>
      </section>
    );
  }

  return (
    <section
      ref={heroRef}
      className="relative flex flex-col justify-between items-center overflow-visible pt-20 sm:pt-40 aspect-[1080/1164] min-h-[clamp(380px,228px+38vw,520px)] lg:aspect-auto lg:h-[83vh] lg:min-h-0"
    >
      {/* Background Banner Image with Ellipse Clip-Path - clickable, same action as Enter Now */}
      {/* Responsive images: separate mobile and desktop paths for optimal performance */}
      <div
        className="main-banner-image absolute inset-0 z-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        role="button"
        tabIndex={0}
        aria-label={`Enter promo - ${resolvedMultiplier}x Entries Active`}
        onClick={handleEnterNow}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleEnterNow();
          }
        }}
      >
        {/* Mobile Background */}
        <div className="lg:hidden absolute inset-0">
          <Image
            src={heroImagePaths.mobile}
            alt={`Promo Hero - ${resolvedMultiplier}x Entries Active`}
            fill
            unoptimized
            className="object-cover"
            style={{
              objectPosition: "50%",
            }}
          />
        </div>
        {/* Desktop Background */}
        <div className="hidden lg:block absolute inset-0">
          <Image
            src={heroImagePaths.desktop}
            alt={`Promo Hero - ${resolvedMultiplier}x Entries Active`}
            fill
            priority
            unoptimized
            className="object-cover"
            style={{
              objectPosition: "50%",
            }}
          />
        </div>
      </div>

      {/* Hero Content - Optional messaging overlay from variant config */}
      {/* Use suppressHydrationWarning to prevent hydration mismatch when variant config loads */}
      {variantConfig?.hero?.messaging && (
        <div className="relative z-20 w-full text-center px-4" suppressHydrationWarning>
          <p className="text-white text-lg sm:text-xl font-bold drop-shadow-lg">
            {variantConfig.hero.messaging}
          </p>
        </div>
      )}

      {/* Elevated ENTER NOW button - Absolutely positioned at bottom */}
      {/* Positioned above the rounded bottom curve with adequate clearance */}
      <div className="absolute -bottom-2 sm:-bottom-2 left-1/2 transform -translate-x-1/2 z-30 overflow-visible">
        <button
          onClick={handleEnterNow}
          className={`promo-hero-cta-button font-agency inline-flex items-center justify-center px-6 py-3 text-base sm:px-10 sm:py-4 sm:text-2xl rounded-full font-extrabold tracking-wide backdrop-blur-lg ${preferDark ? "text-black" : "text-white"}`}
          style={{
            background: ctaStyle?.backgroundColor ?? theme.gradient,
            ...(ctaStyle?.textColor && { color: ctaStyle.textColor }),
          }}
          suppressHydrationWarning
        >
          <span className="relative z-10" suppressHydrationWarning>{ctaText}</span>
        </button>
      </div>
    </section>
  );
}
