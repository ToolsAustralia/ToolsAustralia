"use client";

import Image from "next/image";
import { useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
import { usePromoByType, useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";
import { convertUTCToAEST } from "@/utils/common/timezone";
import type { ServerPromo } from "@/utils/database/queries/promo-queries";
import type { ServerMajorDraw } from "@/utils/database/queries/major-draw-server-queries";

interface PromoHeroProps {
  initialPromo?: ServerPromo | null;
  initialMajorDraw?: ServerMajorDraw | null;
}

export default function PromoHero({ initialPromo, initialMajorDraw }: PromoHeroProps) {
  // Use initial data if available, but allow refetching for real-time updates
  const { isLoading, data: currentDraw } = useCurrentMajorDraw();
  const { data: activePromo } = usePromoByType("membership-packages");
  const heroRef = useScrollAnimation();
  const { openEntryFlow } = useMajorDrawEntryCta();

  // Use initial data if available, otherwise fall back to fetched data
  const promo = initialPromo || activePromo;
  const majorDraw = initialMajorDraw || currentDraw;

  // Get resolved multiplier (Active Promo > Alternating > Default 10x for display)
  const resolvedMultiplier = useResolvedMultiplier("membership-packages", "display");

  const handleEnterNow = () => {
    // Shared handler ensures the membership modal opens via the global event.
    openEntryFlow({ openLocalModal: false });
  };

  // Helper function to check if draw date is today or tomorrow (in AEST)
  const getDrawDateStatus = (): "today" | "tomorrow" | null => {
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

  // Conditionally render hero image based on draw date proximity or active promo multiplier
  // Priority: Draw date (today/tomorrow) > multiplier-based images
  // 10x → x10 entries.webp, 5x → x5 entries.png, 3x → x3 entries.png, no promo → $20.png
  const getHeroImageSrc = () => {
    const drawStatus = getDrawDateStatus();

    // If draw is today or tomorrow, use date-based images
    if (drawStatus === "tomorrow") {
      return "/images/background/promo/drawn tomorrow.webp";
    }
    if (drawStatus === "today") {
      return "/images/background/promo/drawn tonight.webp";
    }

    // Otherwise, fall back to multiplier-based logic
    // Use resolved multiplier (includes alternating multiplier if no active promo)
    switch (resolvedMultiplier) {
      case 10:
        return "/images/background/promo/x10 entries.webp";
      case 5:
        return "/images/background/promo/x5 entries.webp";
      case 3:
        return "/images/background/promo/x3 entries.webp";
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
          aria-label={`Win Ford F-150 & Luxury Float - ${resolvedMultiplier}x Entries Active`}
        >
        <Image
          src={heroImageSrc}
          alt={`Win Ford F-150 & Luxury Float - ${resolvedMultiplier}x Entries Active`}
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
                      backdrop-blur-lg transition-all duration-300 hover:scale-110 animate-pulse-button"
          style={{ border: "3px solid #ee4927" }}
        >
          <span className="relative z-10">ENTER NOW</span>

          {/* Expanding and fading pulse animation rings with complementary background */}
          {/* First pulse */}
          <span className="absolute inset-0 rounded-full bg-gradient-to-br from-red-400/40 via-red-500/30 to-red-600/20 animate-pulse-expand-fade"></span>
          {/* Second pulse - follows the first with a delay */}
          <span className="absolute inset-0 rounded-full bg-gradient-to-br from-red-400/40 via-red-500/30 to-red-600/20 animate-pulse-expand-fade-delayed"></span>
        </button>
      </div>
    </section>
  );
}
