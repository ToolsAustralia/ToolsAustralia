"use client";

import { useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
import { usePromoByType } from "@/hooks/queries/usePromoQueries";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";

export default function PromoHero() {
  const { isLoading } = useCurrentMajorDraw();
  const { data: activePromo } = usePromoByType("one-time-packages");
  const heroRef = useScrollAnimation();
  const { openEntryFlow } = useMajorDrawEntryCta();

  const handleEnterNow = () => {
    // Shared handler ensures the membership modal opens via the global event.
    openEntryFlow({ openLocalModal: false });
  };

  // Conditionally render hero image based on active promo multiplier
  // 10x → x10 entries.png, 5x → x5 entries.png, 3x → x3 entries.png, no promo → $20.png
  const getHeroImageSrc = () => {
    if (!activePromo) {
      return "/images/background/promo/$20.png";
    }

    switch (activePromo.multiplier) {
      case 10:
        return "/images/background/promo/x10 entries.png";
      case 5:
        return "/images/background/promo/x5 entries.png";
      case 3:
        return "/images/background/promo/x3 entries.png";
      default:
        return "/images/background/promo/$20.png";
    }
  };

  const heroImageSrc = getHeroImageSrc();

  if (isLoading) {
    return (
      <section className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-white pt-12 sm:pt-14">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600"> Are you our next winner?...</p>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={heroRef}
      className="relative flex flex-col justify-between items-center overflow-visible pt-20 sm:pt-40 h-[50vh] min-h-[430px] lg:h-[83vh] lg:min-h-0"
    >
      {/* Background Banner Image with Ellipse Clip-Path */}
      {/* Using background-image with clip-path for smooth rounded bottom effect */}
      <div
        className="main-banner-image absolute inset-0 z-0"
        style={{
          backgroundImage: `url("${heroImageSrc}")`,
        }}
        role="img"
        aria-label={`Win Ford F-150 & Luxury Float - ${activePromo?.multiplier || 1}x Entries Active`}
      />

      {/* Hero Content (optional title or info can go here) */}
      <div className="relative z-20 w-full text-center"></div>

      {/* Elevated ENTER NOW button - Absolutely positioned at bottom */}
      {/* Positioned above the rounded bottom curve with adequate clearance */}
      <div className="absolute -bottom-2 sm:-bottom-2 left-1/2 transform -translate-x-1/2 z-30">
        <button
          onClick={handleEnterNow}
          className="group relative inline-flex items-center justify-center px-6 py-3 text-base sm:px-10 sm:py-4 sm:text-2xl rounded-full font-extrabold tracking-wide text-white 
                      bg-gradient-to-br from-red-600 via-red-700 to-red-800 shadow-[0_0_40px_rgba(220,38,38,0.6)]
                      border border-white/20 backdrop-blur-lg transition-all duration-300 hover:scale-110 hover:shadow-[0_0_60px_rgba(239,68,68,0.8)]"
        >
          <span className="relative z-10">ENTER NOW</span>

          {/* glowing ring animation */}
          <span
            className="absolute inset-0 rounded-full border border-red-400/40 opacity-0 group-hover:opacity-100 animate-pulse
                        group-hover:animate-[pulse_2s_infinite]"
          ></span>
        </button>
      </div>
    </section>
  );
}
