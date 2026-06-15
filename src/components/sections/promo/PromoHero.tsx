"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
import { usePromoByType, useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";
import type { ServerPromo } from "@/utils/database/queries/promo-queries";
import type { ServerMajorDraw } from "@/utils/database/queries/major-draw-server-queries";
import { useVariantContext } from "@/components/ab-testing/VariantProvider";
import { useExperimentTracking } from "@/hooks/ab-testing/useExperimentTracking";
import { getMajorDrawHeroUrgencyFromMajorDraw, getPromoImagePaths } from "@/utils/promo/promo-hero-images";
import { usePromoTheme, usePromoThemeStore } from "@/stores/usePromoThemeStore";
import { getLandingHeroImagePaths } from "@/config/promo-landing-slugs";
import { useThemeStore } from "@/stores/useThemeStore";
import { getImageForMode, getFallbackImagePath } from "@/utils/promo/landing-image-resolver";
import { getLandingHeroVideoPaths } from "@/utils/promo/landing-video-resolver";
import LandingHeroVideo from "./LandingHeroVideo";
import { useDeviceProfile } from "@/hooks/useDeviceProfile";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/utils/cn";

/**
 * Ellipse clip-path on `.main-banner-image` creates the arched / rounded bottom hero look.
 * Set to `true` to restore the arch; `false` shows a flat rectangular banner (clip disabled).
 */
const PROMO_HERO_ELLIPSE_CLIP_ENABLED = false;

interface PromoHeroProps {
  initialPromo?: ServerPromo | null;
  initialMajorDraw?: ServerMajorDraw | null;
  /** URL prize slug — same as store after `PromoThemeInitializer`; used so landing PNGs resolve on first paint (store is null during SSR). */
  prizeSlug?: string | null;
}

export default function PromoHero({
  initialPromo,
  initialMajorDraw,
  prizeSlug = null,
}: PromoHeroProps) {
  const { isLoading, data: currentDraw } = useCurrentMajorDraw();
  const { data: activePromo } = usePromoByType("membership-packages");
  const heroRef = useScrollAnimation();
  const { openEntryFlow } = useMajorDrawEntryCta();

  const { experimentId, variantId, variantConfig, isLoading: _isVariantLoading } = useVariantContext();
  const { trackEvent } = useExperimentTracking();

  const _promo = initialPromo || activePromo;
  const majorDraw = initialMajorDraw || currentDraw;
  const resolvedMultiplier = useResolvedMultiplier("membership-packages", "display");

  const handleEnterNow = () => {
    if (experimentId && variantId) {
      trackEvent(experimentId, variantId, "click", {
        element: "hero_cta",
      }).catch((error) => {
        console.error("Error tracking CTA click:", error);
      });
    }
    openEntryFlow({ openLocalModal: false });
  };

  const themeMode = useThemeStore((s) => s.theme);
  const [imageError, setImageError] = useState(false);

  // Hero video gating (all hooks must run before the isLoading early return).
  const { flags } = useDeviceProfile();
  const isLgUp = useMediaQuery("(min-width: 1024px)");
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  const storeSlug = usePromoThemeStore((s) => s.slug);
  const effectiveSlug = storeSlug ?? prizeSlug ?? null;
  const majorDrawUrgency = getMajorDrawHeroUrgencyFromMajorDraw(majorDraw);

  const landingHeroPaths = effectiveSlug
    ? getLandingHeroImagePaths(effectiveSlug)
    : null;

  /** A/B-test per-slug override: one variant can carry a map of slug → { desktop?, mobile? }
   *  so a single experiment can run across multiple toolset / evergreen landings with
   *  page-specific creatives. Each viewport is independently optional — a mobile-only
   *  A/B test omits `desktop` and the page uses the default theme-aware landing image
   *  for that slot. */
  const perSlugVariantImage = effectiveSlug
    ? variantConfig?.hero?.imageSrcBySlug?.[effectiveSlug] ?? null
    : null;

  const standardHeroPaths = getPromoImagePaths({
    multiplier: resolvedMultiplier,
    majorDrawUrgency,
    variantImageOverride: variantConfig?.hero?.imageSrc,
  });

  const heroImagePaths = (() => {
    if (imageError) {
      return {
        desktop: getFallbackImagePath(),
        mobile: getFallbackImagePath(),
      };
    }

    // Compose desktop and mobile independently:
    //   1. per-slug variant override for that viewport (highest priority)
    //   2. default landing-image-resolver path (theme-aware)
    //   3. fall back to the multiplier/urgency-aware standard promo hero
    const defaultDesktop = landingHeroPaths
      ? getImageForMode(landingHeroPaths, themeMode, "desktop")
      : standardHeroPaths.desktop;
    const defaultMobile = landingHeroPaths
      ? getImageForMode(landingHeroPaths, themeMode, "mobile")
      : standardHeroPaths.mobile;

    return {
      desktop: perSlugVariantImage?.desktop || defaultDesktop,
      mobile: perSlugVariantImage?.mobile || defaultMobile,
    };
  })();

  // Hero video: only for brand slugs (cash / evergreen return null → image hero).
  // The .webp hero stays the LCP element / poster; the clip fades in over it and
  // is suppressed for reduced-motion / Save-Data users. A per-slug A/B image
  // override also wins — when the variant pins a custom still, skip the video.
  const heroVideoPaths =
    effectiveSlug && !perSlugVariantImage && !variantConfig?.hero?.disableVideo
      ? getLandingHeroVideoPaths(effectiveSlug)
      : null;
  const allowVideo =
    isMounted && !imageError && !flags.saveData && !flags.reducedMotion && heroVideoPaths != null;

  const ctaText = variantConfig?.hero?.ctaText || "ENTER NOW";
  const ctaStyle = variantConfig?.hero?.ctaStyle;
  const theme = usePromoTheme();
  const preferDark = theme.preferDarkBackground ?? false;
  const isDewaltTheme = (effectiveSlug ?? "").startsWith("dewalt-");
  const shouldUseBlackText = preferDark || isDewaltTheme;

  if (isLoading) {
    return (
      <section className="relative flex flex-col items-center overflow-visible pt-20 sm:pt-40 aspect-[1080/1164] min-h-[clamp(380px,228px+38vw,520px)] lg:aspect-[2560/1044] lg:min-h-0">
        <div
          className={cn("main-banner-image absolute inset-0 z-0 bg-gradient-to-br from-gray-200 to-gray-300 animate-pulse", !PROMO_HERO_ELLIPSE_CLIP_ENABLED ? "promo-hero-banner--flat" : "")}
        />
        {/* In-flow reserve: same height as loaded CTA band so layout below doesn’t jump */}
        <div className="relative z-0 mt-auto w-full shrink-0 max-sm:h-14 sm:h-16" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center pb-1 sm:pb-2">
          <div className="pointer-events-auto h-12 w-32 rounded-full bg-gray-400 animate-pulse sm:h-16 sm:w-48" />
        </div>
      </section>
    );
  }

  return (
    <section
      ref={heroRef}
      className="relative flex flex-col items-center overflow-visible pt-20 sm:pt-40 aspect-[1080/1164] min-h-[clamp(380px,228px+38vw,520px)] lg:aspect-[2560/1044] lg:min-h-0"
    >
      <div
        className={cn("main-banner-image absolute inset-0 z-0", !PROMO_HERO_ELLIPSE_CLIP_ENABLED ? "promo-hero-banner--flat" : "")}
      >
        <div className="lg:hidden absolute inset-0 bg-white dark:bg-neutral-950">
          <Image
            src={heroImagePaths.mobile}
            alt={`Promo Hero - ${resolvedMultiplier}x Entries Active`}
            fill
            priority
            className="object-contain object-top"
            sizes="100vw"
            onError={() => setImageError(true)}
          />
          {allowVideo && !isLgUp && heroVideoPaths && (
            <LandingHeroVideo sources={heroVideoPaths.mobile} poster={heroImagePaths.mobile} />
          )}
        </div>
        <div className="absolute inset-0 hidden bg-white dark:bg-neutral-950 lg:block">
          <Image
            src={heroImagePaths.desktop}
            alt={`Promo Hero - ${resolvedMultiplier}x Entries Active`}
            fill
            priority
            sizes="100vw"
            className="object-contain object-top"
            onError={() => setImageError(true)}
          />
          {allowVideo && isLgUp && heroVideoPaths && (
            <LandingHeroVideo sources={heroVideoPaths.desktop} poster={heroImagePaths.desktop} />
          )}
        </div>
      </div>

      {variantConfig?.hero?.messaging && (
        <div
          className="absolute left-0 right-0 top-[32%] z-20 px-4 text-center sm:top-[34%]"
          suppressHydrationWarning
        >
          <p className="text-lg font-bold text-white drop-shadow-lg sm:text-xl">
            {variantConfig.hero.messaging}
          </p>
        </div>
      )}

      {/* Reserves vertical space in document flow so the CTA doesn’t overlap the trust bar / cause CLS */}
      <div className="relative z-0 mt-auto w-full shrink-0 max-sm:h-14 sm:h-16" aria-hidden />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center pb-1 sm:pb-2">
        <button
          type="button"
          onClick={handleEnterNow}
          className={cn("promo-hero-cta-button pointer-events-auto inline-flex items-center justify-center rounded-full px-6 py-3 font-sans text-base font-extrabold tracking-wide backdrop-blur-lg sm:px-10 sm:py-4 sm:text-2xl", shouldUseBlackText ? "text-black" : "text-white")}
          style={{
            background: ctaStyle?.backgroundColor ?? theme.gradient,
            ...(isDewaltTheme ? { color: "#000000" } : ctaStyle?.textColor ? { color: ctaStyle.textColor } : {}),
          }}
          suppressHydrationWarning
        >
          <span className="relative z-10" suppressHydrationWarning>
            {ctaText}
          </span>
        </button>
      </div>
    </section>
  );
}
