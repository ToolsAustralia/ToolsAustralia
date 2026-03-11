"use client";

import React from "react";
import Image from "next/image";
import MetallicButton from "@/components/ui/MetallicButton";
import { useUserContext } from "@/contexts/UserContext";
import { usePromoTheme } from "@/stores/usePromoThemeStore";

/**
 * Partner Benefits promo section — shown to guests and non-members only.
 * Placed before FAQ on promotions pages. JOIN NOW scrolls to #packages.
 */
export default function PartnerBenefitsPromoSection() {
  const { isAuthenticated, hasActiveSubscription, loading } = useUserContext();
  const theme = usePromoTheme();

  // Hide for members; show for guests (unauthenticated) or non-members (authenticated but no subscription)
  const shouldShow = !loading && (!isAuthenticated || !hasActiveSubscription);

  const handleJoinNow = () => {
    const packagesSection = document.getElementById("packages");
    if (packagesSection) {
      packagesSection.scrollIntoView({ behavior: "smooth" });
    }
  };

  if (!shouldShow) return null;

  return (
    <section className="w-full px-3 sm:px-6 lg:px-8 py-4 sm:py-8 lg:py-12">
      <div className="max-w-7xl mx-auto">
        <div className="relative min-h-[200px] sm:min-h-[340px] lg:min-h-[380px] rounded-xl sm:rounded-2xl overflow-hidden">
          {/* Background Image with Dark Overlay */}
          <div className="absolute inset-0 z-0">
            <Image
              src="/images/faqImage.png"
              alt="Tools Australia"
              fill
              className="object-cover"
              unoptimized
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/40" />
          </div>

          {/* Content */}
          <div className="relative z-10 h-full flex items-center min-h-[200px] sm:min-h-[340px] lg:min-h-[380px]">
            <div className="w-full">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-8 items-center">
                {/* Left Content - Glass-morphism Card */}
                <div className="lg:col-span-2 p-3 sm:p-6 lg:p-10">
                  <div className="backdrop-blur-md bg-black/40 rounded-lg sm:rounded-xl p-3 sm:p-6 lg:p-8 border-0 sm:border border-[#ee0000]/30 shadow-2xl shadow-[#ee0000]/20">
                    <h2 className="text-sm sm:text-lg lg:text-xl font-bold mb-1 sm:mb-2 font-['Poppins'] uppercase tracking-wide text-white">
                      BECOME A MEMBER
                    </h2>

                    <h3 className="text-lg sm:text-2xl lg:text-4xl font-bold mb-2 sm:mb-3 font-['Poppins'] leading-tight">
                      <span className="text-white">Accumulating entries </span>
                      <span
                        className="bg-clip-text text-transparent font-bold"
                        style={{ backgroundImage: theme.gradient, WebkitBackgroundClip: "text", backgroundClip: "text" }}
                      >
                        + partner discounts
                      </span>
                    </h3>

                    <p className="text-xs sm:text-sm lg:text-base mb-3 sm:mb-5 text-gray-200 font-['Poppins'] leading-snug">
                      Members get Additional Packs with up to 2× the entries. Best promo multipliers. Pick your pack below.
                    </p>

                    <MetallicButton onClick={handleJoinNow} variant="primary" size="sm" borderRadius="lg">
                      VIEW PACKAGES
                    </MetallicButton>
                  </div>
                </div>

                {/* Right Side - Image (Hidden on mobile/tablet) */}
                <div className="relative h-48 sm:h-64 lg:h-full items-center justify-center hidden lg:flex">
                  <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-[280px] h-[280px] z-20">
                    <Image
                      src="/images/faqImage.png"
                      alt="Tools Australia"
                      fill
                      className="object-cover rounded-xl"
                      unoptimized
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Border Glow */}
          <div className="absolute inset-0 rounded-xl sm:rounded-2xl border border-[#ee0000]/30 pointer-events-none z-10" />
        </div>
      </div>
    </section>
  );
}
