"use client";

import Image from "next/image";
import { useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
import { usePromoByType } from "@/hooks/queries/usePromoQueries";
import SectionDivider from "@/components/ui/SectionDivider";
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

  const getHeroImage = () => {
    if (!activePromo?.multiplier) return "/images/background/promoBg.png";
    const multiplier = activePromo.multiplier;
    switch (multiplier) {
      case 2:
      case 3:
      case 5:
      case 10:
      default:
        return "/images/background/promoBg.png";
    }
  };

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
    <section ref={heroRef} className="relative h-screen flex flex-col justify-between items-center overflow-hidden">
      {/* Backgrounds */}
      <div className="absolute inset-0 z-0">
        {/* Mobile Background */}
        <div className="lg:hidden absolute inset-0">
          <Image
            src="/images/background/promo/promoBgMobile.jpg"
            alt="Ultimate Tool Giveaway - Mobile Background"
            fill
            className="object-cover object-[50%_10%] w-full h-full"
            priority
            quality={100}
            sizes="100vw"
          />
        </div>

        {/* Desktop Background */}
        <div className="hidden lg:block absolute inset-0">
          <Image
            src={getHeroImage()}
            alt={`Ultimate Tool Giveaway - ${activePromo?.multiplier || 1}x Entries Active`}
            fill
            className="object-cover object-[50%_35%] w-full h-full"
            priority
            quality={100}
            sizes="100vw"
          />
        </div>

        {/* Dark overlay */}
        <div className="absolute inset-0  z-10"></div>
      </div>

      {/* Hero Content (optional title or info can go here) */}
      <div className="relative z-20 w-full text-center"></div>

      {/* Elevated ENTER NOW button - Absolutely positioned at bottom */}
      <div className="absolute bottom-12 sm:bottom-14 left-1/2 transform -translate-x-1/2 z-30">
        <button
          onClick={handleEnterNow}
          className="group relative inline-flex items-center justify-center px-8 py-4 sm:px-14 sm:py-6 rounded-full font-extrabold text-lg sm:text-2xl tracking-wide text-white 
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

      {/* Curved Divider */}
      <SectionDivider type="curve" color="#f9fafb" className="absolute bottom-0 left-0 right-0 z-10" />
    </section>
  );
}
