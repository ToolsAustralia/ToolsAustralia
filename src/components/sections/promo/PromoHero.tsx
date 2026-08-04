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
import { usePromoThemeSettled } from "@/components/ab-testing/PromoThemeExperimentGate";
import { useExperimentTracking } from "@/hooks/ab-testing/useExperimentTracking";
import {
  getLandingHeroUrgencyFromDrawDay,
  getMajorDrawHeroUrgencyFromMajorDraw,
  getPromoImagePaths,
} from "@/utils/promo/promo-hero-images";
import { usePromoTheme, usePromoThemeStore } from "@/stores/usePromoThemeStore";
import { getLandingHeroImagePaths } from "@/config/promo-landing-slugs";
import { useThemeStore } from "@/stores/useThemeStore";
import { getImageForMode, getFallbackImagePath, resolveLandingHeroBackground } from "@/utils/promo/landing-image-resolver";
import { getLandingHeroVideoPaths } from "@/utils/promo/landing-video-resolver";
import LandingHeroVideo from "./LandingHeroVideo";
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
  const { isLoading, data: currentDraw, isSuccess: currentDrawResolved } = useCurrentMajorDraw();
  const { data: activePromo, isSuccess: activePromoResolved } = usePromoByType("membership-packages");
  const heroRef = useScrollAnimation();
  const { openEntryFlow } = useMajorDrawEntryCta();

  const { experimentId, variantId, variantConfig, isLoading: _isVariantLoading } = useVariantContext();
  const { trackEvent } = useExperimentTracking();

  // Client query wins once resolved; server-baked props are first-paint seeds only
  // (ISR + stale-while-revalidate can serve old baked values — 2026-07 final-review fix).
  const _promo = activePromoResolved ? activePromo : initialPromo;
  const majorDraw = currentDrawResolved ? currentDraw : initialMajorDraw;
  const resolvedMultiplier = useResolvedMultiplier("membership-packages", "display");

  const handleEnterNow = () => {
    if (experimentId && variantId) {
      trackEvent(experimentId, variantId, "click", {
        element: "hero_cta",
      }).catch((error) => {
        console.error("Error tracking CTA click:", error);
      });
    }
    // Opens "Select Your Package" with the recommended tier (Foreman) already behind it —
    // selection-first is openEntryFlow's default for every entry CTA.
    openEntryFlow({ openLocalModal: false });
  };

  const themeMode = useThemeStore((s) => s.theme);
  const themeSettled = usePromoThemeSettled();
  const [imageError, setImageError] = useState(false);
  /** Set if the hero clip's sources all fail — fall back to the still hero. */
  const [videoFailed, setVideoFailed] = useState(false);

  // null until mounted: SSR renders NO <video>, so a phone never downloads the desktop
  // clip (display:none does not stop <video preload="auto"> fetching). Visual parity:
  // the clips open on a white frame, so pre-mount is the same white container as today.
  // (Not `useIsLgUp`: that hook's SSR/first-paint snapshot is `false`, which would mount
  // the MOBILE video during SSR on every request — including desktop — instead of neither;
  // local tri-state is required to render zero videos before mount.)
  const [viewport, setViewport] = useState<"mobile" | "desktop" | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setViewport(mq.matches ? "desktop" : "mobile");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const storeSlug = usePromoThemeStore((s) => s.slug);
  const effectiveSlug = storeSlug ?? prizeSlug ?? null;
  const majorDrawUrgency = getMajorDrawHeroUrgencyFromMajorDraw(majorDraw);
  /** Calendar-day (AEST) tier — swaps the brand hero to its drawn-tomorrow / drawn-tonight art. */
  const landingDrawDayUrgency = getLandingHeroUrgencyFromDrawDay(majorDraw);

  const landingHeroPaths = effectiveSlug
    ? getLandingHeroImagePaths(effectiveSlug, landingDrawDayUrgency)
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

  // Hero video: only for brand slugs (cash / evergreen return null → still hero). A per-slug
  // A/B image override or `disableVideo` also opts out. On the drawn-tomorrow / drawn-tonight
  // tier the resolver returns the animated badge clip.
  const heroVideoPaths =
    effectiveSlug && !perSlugVariantImage && !variantConfig?.hero?.disableVideo
      ? getLandingHeroVideoPaths(effectiveSlug, landingDrawDayUrgency, themeMode)
      : null;

  // Video-first: once mounted, the clip is the PRIMARY hero for its viewport (the still never
  // flashes in front of it there). Pre-mount (`viewport === null`) BOTH containers briefly fall
  // to the still-image branch below — the mobile/desktop `viewport ===` check in the JSX gates
  // the actual `<video>` mount, not this flag — which is the same still-fallback path already
  // used when there's no clip, just momentary. The still also renders when there is no clip, the
  // clip failed to load (`videoFailed`), or the user prefers reduced motion (handled purely in
  // CSS via `motion-reduce:` — no JS gate, so no SSR→client swap). See useDeviceProfile:
  // reduced-motion is CSS-driven by convention.
  const showVideo = heroVideoPaths != null && !videoFailed;

  // A failed clip only disqualifies THAT clip — give a fresh attempt when the slug/tier
  // (and thus the clip URL) changes. Keyed on the primitives that determine the clip, not the
  // recomputed `heroVideoPaths` object (new ref every render → would reset-loop).
  useEffect(() => setVideoFailed(false), [effectiveSlug, landingDrawDayUrgency]);

  const ctaText = variantConfig?.hero?.ctaText || "ENTER NOW";
  const ctaStyle = variantConfig?.hero?.ctaStyle;
  const theme = usePromoTheme();
  const preferDark = theme.preferDarkBackground ?? false;
  const isDewaltTheme = (effectiveSlug ?? "").startsWith("dewalt-");
  const shouldUseBlackText = preferDark || isDewaltTheme;

  // Hold theme-forked art until the default-theme experiment has decided. The
  // gate overlays rather than replaces the page (SEO), so a mounted <Image>
  // here would still be fetched — a dark-arm visitor would download the light
  // hero and discard it, exactly the handicap the preload skip removes. This
  // returns the same reserved box as the isLoading stage, minus the two
  // theme-forked <Image>s, so there is no layout shift when it resolves.
  if (!themeSettled) {
    return (
      <section className="relative flex flex-col items-center overflow-visible pt-20 sm:pt-40 aspect-[1080/1164] min-h-[clamp(380px,228px+38vw,520px)] lg:aspect-[2560/1044] lg:min-h-0">
        <div className="absolute inset-0 z-0 bg-white dark:bg-neutral-950" />
      </section>
    );
  }

  if (isLoading) {
    // Theme-aware stage background standing in for the skeleton. Keyed on THEME rather than
    // brand since draw 9: the backdrop is the same wall behind every brand's shoot, but a
    // dark-mode visitor used to get the light backdrop and then a dark hero painted over it.
    // `themeMode` is available on first paint, so the right backdrop shows immediately even
    // while the draw query is still loading.
    const loaderBackground = resolveLandingHeroBackground(themeMode);
    return (
      <section className="relative flex flex-col items-center overflow-visible pt-20 sm:pt-40 aspect-[1080/1164] min-h-[clamp(380px,228px+38vw,520px)] lg:aspect-[2560/1044] lg:min-h-0">
        {/* Hero "stage" background stands in for the skeleton so the load-in is seamless. */}
        <div
          className={cn("main-banner-image absolute inset-0 z-0", !PROMO_HERO_ELLIPSE_CLIP_ENABLED ? "promo-hero-banner--flat" : "")}
        >
          <div className="lg:hidden absolute inset-0 bg-white dark:bg-neutral-950">
            <Image
              src={loaderBackground.mobile}
              alt=""
              aria-hidden
              fill
              loading="eager"
              sizes="100vw"
              className="object-contain object-top"
            />
          </div>
          <div className="absolute inset-0 hidden bg-white dark:bg-neutral-950 lg:block">
            <Image
              src={loaderBackground.desktop}
              alt=""
              aria-hidden
              fill
              loading="eager"
              sizes="100vw"
              className="object-contain object-top"
            />
          </div>
        </div>
        {/* In-flow reserve: same height as loaded CTA band so layout below doesn’t jump */}
        <div className="relative z-0 mt-auto w-full shrink-0 max-sm:h-14 sm:h-16" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center pb-1 sm:pb-2">
          <div className="pointer-events-auto h-12 w-32 rounded-full bg-gray-400/70 animate-pulse sm:h-16 sm:w-48" />
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
        {/* Video-first: the clip is the primary hero and plays from its first frame, so the
            still never flashes in front of it. The still shows only when there is no clip / the
            clip failed (`!showVideo`), or — purely in CSS — for reduced-motion users. */}
        <div className="lg:hidden absolute inset-0 bg-white dark:bg-neutral-950">
          {showVideo && heroVideoPaths && viewport === "mobile" ? (
            <>
              <LandingHeroVideo
                sources={heroVideoPaths.mobile}
                className="motion-reduce:hidden"
                onUnavailable={() => setVideoFailed(true)}
              />
              <Image
                src={heroImagePaths.mobile}
                alt={`Promo Hero - ${resolvedMultiplier}x Entries Active`}
                fill
                sizes="100vw"
                className="hidden object-contain object-top motion-reduce:block"
              />
            </>
          ) : (
            <Image
              src={heroImagePaths.mobile}
              alt={`Promo Hero - ${resolvedMultiplier}x Entries Active`}
              fill
              loading="eager"
              className="object-contain object-top"
              sizes="100vw"
              onError={() => setImageError(true)}
            />
          )}
        </div>
        <div className="absolute inset-0 hidden bg-white dark:bg-neutral-950 lg:block">
          {showVideo && heroVideoPaths && viewport === "desktop" ? (
            <>
              <LandingHeroVideo
                sources={heroVideoPaths.desktop}
                className="motion-reduce:hidden"
                onUnavailable={() => setVideoFailed(true)}
              />
              <Image
                src={heroImagePaths.desktop}
                alt={`Promo Hero - ${resolvedMultiplier}x Entries Active`}
                fill
                sizes="100vw"
                className="hidden object-contain object-top motion-reduce:block"
              />
            </>
          ) : (
            <Image
              src={heroImagePaths.desktop}
              alt={`Promo Hero - ${resolvedMultiplier}x Entries Active`}
              fill
              loading="eager"
              sizes="100vw"
              className="object-contain object-top"
              onError={() => setImageError(true)}
            />
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
          className={cn("promo-hero-cta-button pointer-events-auto inline-flex items-center justify-center rounded-full px-6 py-3 font-sans text-base font-extrabold tracking-wide backdrop-blur-[var(--ta-blur)] sm:px-10 sm:py-4 sm:text-2xl", shouldUseBlackText ? "text-black" : "text-white")}
          style={{
            background: ctaStyle?.backgroundColor ?? theme.gradient,
            // Force black on light-bg themes (Ryobi neon-lime, DeWalt yellow) — the
            // `.promo-hero-cta-button` CSS otherwise wins over the `text-black` class.
            ...(shouldUseBlackText ? { color: "#000000" } : ctaStyle?.textColor ? { color: ctaStyle.textColor } : {}),
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
