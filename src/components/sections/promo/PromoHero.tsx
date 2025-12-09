"use client";

import Image from "next/image";
import { useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
import { usePromoByType } from "@/hooks/queries/usePromoQueries";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";
import type { ServerPromo } from "@/utils/database/queries/promo-queries";
import type { ServerMajorDraw } from "@/utils/database/queries/major-draw-server-queries";

interface PromoHeroProps {
  initialPromo?: ServerPromo | null;
  initialMajorDraw?: ServerMajorDraw | null;
}

export default function PromoHero({ initialPromo, initialMajorDraw }: PromoHeroProps) {
  // Use initial data if available, but allow refetching for real-time updates
  const { isLoading } = useCurrentMajorDraw();
  const { data: activePromo } = usePromoByType("membership-packages");
  const heroRef = useScrollAnimation();
  const { openEntryFlow } = useMajorDrawEntryCta();

  // Use initial data if available, otherwise fall back to fetched data
  const promo = initialPromo || activePromo;

  const handleEnterNow = () => {
    // Shared handler ensures the membership modal opens via the global event.
    openEntryFlow({ openLocalModal: false });
  };

  // Conditionally render hero image based on active promo multiplier
  // 10x → x10 entries.webp, 5x → x5 entries.png, 3x → x3 entries.png, no promo → $20.png
  const getHeroImageSrc = () => {
    if (!promo) {
      return "/images/background/promo/$20.png";
    }

    switch (promo.multiplier) {
      case 10:
        return "/images/background/promo/x10 entries.webp";
      case 5:
        return "/images/background/promo/x5 entries.png";
      case 3:
        return "/images/background/promo/x3 entries.png";
      case 2:
        return "/images/background/promo/$20.png";
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
          <p className="text-gray-600"> Are you our next winner?...</p>
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
      {/* Using Next.js Image with clip-path for smooth rounded bottom effect and better performance */}
      <div
        className="main-banner-image absolute inset-0 z-0"
        role="img"
        aria-label={`Win Ford F-150 & Luxury Float - ${promo?.multiplier || 1}x Entries Active`}
      >
        <Image
          src={heroImageSrc}
          alt={`Win Ford F-150 & Luxury Float - ${promo?.multiplier || 1}x Entries Active`}
          fill
          priority
          unoptimized
          className="object-cover"
          style={{
            objectPosition: "50%",
          }}
        />
      </div>

      {/* Hero Content (optional title or info can go here) */}
      <div className="relative z-20 w-full text-center"></div>

      {/* Elevated ENTER NOW button - Absolutely positioned at bottom */}
      {/* Positioned above the rounded bottom curve with adequate clearance */}
      <div className="absolute -bottom-2 sm:-bottom-2 left-1/2 transform -translate-x-1/2 z-30">
        <button
          onClick={handleEnterNow}
          className="group relative inline-flex items-center justify-center px-6 py-3 text-base sm:px-10 sm:py-4 sm:text-2xl rounded-full font-extrabold tracking-wide text-white 
                      bg-gradient-to-br from-red-600 via-red-700 to-red-800
                      backdrop-blur-lg transition-all duration-300 hover:scale-110"
          style={{ border: "3px solid #ee4927" }}
        >
          <span className="relative z-10">ENTER NOW</span>

          {/* Ring animation with background - expands and fades out like a ripple */}
          <span className="absolute inset-0 rounded-full border-2 border-red-500/60 bg-red-500/30 animate-ring-pulse"></span>
        </button>
      </div>
    </section>
  );
}
