"use client";

import { getImageProps } from "next/image";
import { useState, useEffect } from "react";
// import MajorDrawStats from "./MajorDrawStats"; // Commented out for now
import HorizontalCountdown from "./HorizontalCountdown";
import MetallicButton from "@/components/ui/MetallicButton";
import BrandScroller from "@/components/ui/BrandScroller";
import { SectionContainer } from "@/components/ui";

export default function Hero() {
  const [isTopBarVisible, setIsTopBarVisible] = useState(true);

  // Check if top bar is visible by looking for the top bar element
  useEffect(() => {
    const checkTopBarVisibility = () => {
      const topBar = document.querySelector("[data-top-bar]") as HTMLElement;
      if (topBar) {
        const isVisible = topBar.offsetHeight > 0;
        setIsTopBarVisible(isVisible);
      }
    };

    // Check initially
    checkTopBarVisibility();

    // Set up observer to watch for changes
    const observer = new MutationObserver(checkTopBarVisibility);
    const topBar = document.querySelector("[data-top-bar]");

    if (topBar) {
      observer.observe(topBar, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ["style", "class"],
      });
    }

    return () => observer.disconnect();
  }, []);

  // Media-scoped preload pair for the bg <picture> below — mirrors the ToolsetLandingPage
  // pattern (see docs/promo/gotchas.md): a raw-path preload never matches the optimized
  // `/_next/image` URL the browser actually requests, so it silently preloads nothing useful.
  // Also doubles as the `<picture>`'s `<source>`/fallback `<img>` props below — a single
  // `<picture>` with viewport-scoped `<source>`s (not two separate always-mounted `<Image>`s)
  // is what actually guarantees exactly one variant downloads: `display:none` does not stop an
  // `<img>` from fetching, so two CSS-hidden-toggled `<Image>`s both fetch regardless of viewport.
  const mobileBg = getImageProps({ src: "/images/background/mobileBg.webp", alt: "Tools background", fill: true, sizes: "100vw", loading: "eager" }).props;
  const desktopBg = getImageProps({ src: "/images/background/desktopBg.webp", alt: "Tools background", fill: true, sizes: "100vw", loading: "eager" }).props;

  return (
    <>
      <link rel="preload" as="image" media="(max-width: 1023px)" imageSrcSet={mobileBg.srcSet} imageSizes="100vw" />
      <link rel="preload" as="image" media="(min-width: 1024px)" imageSrcSet={desktopBg.srcSet} imageSizes="100vw" />
      <section
        className={`relative hero-bg min-h-screen-svh flex flex-col  pb-10 sm:pb-8 pt-[60px] sm:pt-[100px] lg:pt-[var(--app-header-h-lg)] w-full overflow-visible hero-section ${
          isTopBarVisible ? "top-bar-visible" : ""
        }`}
      >
      {/* Background Image - ONE <picture> with viewport-scoped <source>s selects exactly one
          variant to fetch (not two separate `<Image>`s toggled by CSS `hidden`/`lg:block`,
          which both download regardless of visibility — see docs/shared-ui/gotchas.md
          "Viewport-correct priority/preload"). `loading="eager"` on the fallback `<img>` (it's
          the hero either way) — NOT `priority`, which would emit a competing
          `<link rel=preload fetchpriority=high>` on top of the media-scoped preload pair above. */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0">
          <picture>
            <source media="(min-width: 1024px)" srcSet={desktopBg.srcSet} sizes="100vw" />
            <source media="(max-width: 1023px)" srcSet={mobileBg.srcSet} sizes="100vw" />
            <img {...mobileBg} alt="Tools background" className="object-cover" />
          </picture>
        </div>
        {/* NO readability scrim — removed 2026-08-10 at the owner's call after the stats row
            (the lowest-contrast element, sitting over busy pallet art) was dropped from the hero.
            What remains — an 80px black headline, one short paragraph and a solid red button —
            carries itself on text-shadow alone against this photo, so the photo runs at full
            colour. If copy is ever added back BELOW the button, re-check contrast there first:
            that is where every previous scrim iteration was actually needed.
            Full history of what was tried and why: docs/shared-ui/gotchas.md. */}
      </div>

      {/* Main Hero Content */}
      <div className="flex-1 flex flex-col items-start justify-center w-full relative z-10">
        <div className="relative w-full px-2 sm:px-3 lg:px-[100px] lg:max-w-1440 lg:mx-auto">
          {/* Unified Content Layout - Mobile */}
          <div className="lg:hidden flex flex-col items-center justify-start min-h-[calc(100vh-200px)] pt-2 pb-8">
            <div className="flex flex-1 flex-col max-w-[621px] w-full px-4">
              {/* Main Title */}
              <h1 className="text-[40px] sm:text-[60px] font-black leading-[40px] sm:leading-[60px] text-white font-poppins mb-4 sm:mb-6 text-center [text-shadow:0_2px_4px_rgba(0,0,0,0.85),0_4px_14px_rgba(0,0,0,0.8),0_8px_34px_rgba(0,0,0,0.7)]">
                Tools Australia
              </h1>

              {/* Description */}
              <p className="text-[16px] sm:text-[18px] text-white/95 font-normal leading-[20px] sm:leading-[22px] max-w-[545px] mb-6 sm:mb-8 font-['Inter',_sans-serif] text-center mx-auto [text-shadow:0_1px_2px_rgba(0,0,0,0.98),0_2px_8px_rgba(0,0,0,0.92),0_5px_22px_rgba(0,0,0,0.85)]">
                Become a member to unlock exclusive partner deals and free entries in Australia&apos;s biggest
                tool giveaways — plus exciting mini draws, open to everyone.
              </p>

              {/* CTA Buttons — `mt-auto` pins the button to the BOTTOM of the hero content
                  area (just above the brand marquee) instead of letting it sit mid-photo over
                  the people. The parent's `pb-8` is the only gap below it. Mobile only: the
                  desktop hero is a left-aligned column where the button already reads under
                  the copy. */}
              <div className="mt-auto flex flex-col sm:flex-row gap-4 justify-center">
                <MetallicButton href="/membership" variant="primary" size="md" borderRadius="lg">
                  Become a member
                </MetallicButton>
              </div>

            </div>
          </div>

          {/* Unified Content Layout - Desktop */}
          <div className="hidden lg:flex items-start justify-start py-12">
            <div className="max-w-[621px]">
              {/* Main Title */}
              <h1 className="text-[80px] font-black leading-[80px] text-white font-poppins mb-6 [text-shadow:0_2px_4px_rgba(0,0,0,0.85),0_4px_14px_rgba(0,0,0,0.8),0_8px_34px_rgba(0,0,0,0.7)]">
                Tools Australia
              </h1>

              {/* Description */}
              <p className="text-[20px] text-white/95 font-normal leading-[22px] max-w-[545px] mb-8 font-['Inter',_sans-serif] [text-shadow:0_1px_2px_rgba(0,0,0,0.98),0_2px_8px_rgba(0,0,0,0.92),0_5px_22px_rgba(0,0,0,0.85)]">
                Become a member to unlock exclusive partner deals and free entries in Australia&apos;s biggest
                tool giveaways — plus exciting mini draws, open to everyone.
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 mb-12">
                <MetallicButton href="/membership" variant="primary" size="md" borderRadius="lg">
                  Become a member
                </MetallicButton>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* Brand Logos Section - CSS Marquee */}
      <div className="py-6 sm:py-8 lg:py-10 w-full relative z-10">
        <p className="text-center text-white/90 font-['Inter'] font-extrabold text-sm sm:text-base lg:text-lg tracking-wide mb-4 sm:mb-6 [text-shadow:0_1px_2px_rgba(0,0,0,0.98),0_2px_8px_rgba(0,0,0,0.92),0_5px_22px_rgba(0,0,0,0.85)]">
          WIN AUSTRALIA&apos;S TOP TOOL BRANDS
        </p>
        <BrandScroller speed={800} speedMobile={400} />
      </div>

      {/* Major Draw Stats - Positioned at bottom with absolute positioning
      <MajorDrawStats className="-bottom-12 sm:-bottom-16" /> */}
    </section>
    </>
  );
}

// Horizontal Countdown Section - Compact height
export function HorizontalCountdownSection() {
  return (
    <section className="bg-gradient-to-b from-gray-50 to-white pt-16 sm:pt-20">
      <SectionContainer>
        <HorizontalCountdown />
      </SectionContainer>
    </section>
  );
}
