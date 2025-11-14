"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import MetallicButton from "@/components/ui/MetallicButton";
// No icons needed for this component

// Import Swiper styles
import "swiper/css";
import BrandScroller from "@/components/ui/BrandScroller";

interface PartnerHeroProps {
  onBecomePartnerAction: () => void;
}

export default function PartnerHero({ onBecomePartnerAction }: PartnerHeroProps) {
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

  return (
    <section
      className={`relative hero-bg min-h-screen-svh flex flex-col pt-[20px] sm:pt-[40px] lg:pt-[60px] w-full overflow-hidden hero-section ${
        isTopBarVisible ? "top-bar-visible" : ""
      }`}
    >
      {/* Background Images - Responsive for mobile and desktop */}
      <div className="absolute inset-0 z-0">
        {/* Mobile Background */}
        <div className="lg:hidden absolute inset-0">
          <Image
            src="/images/background/partnerBg.png"
            alt="Partnership background"
            fill
            className="object-cover"
            priority
            quality={90}
          />
        </div>
        {/* Desktop Background */}
        <div className="hidden lg:block absolute inset-0">
          <Image
            src="/images/background/partnerBg.png"
            alt="Partnership background"
            fill
            className="object-cover"
            priority
            quality={90}
          />
        </div>
        {/* Dark overlay for better text readability */}
        <div className="absolute inset-0 bg-black/50"></div>
      </div>

      {/* Main Hero Content */}
      <div className="flex-1 flex flex-col lg:flex-row items-center w-full relative z-10">
        <div className="relative w-full px-4 sm:px-6 lg:px-[100px] lg:max-w-1440 lg:mx-auto">
          {/* Mobile/Tablet: Single Column Layout */}
          <div className="lg:hidden flex flex-col h-full min-h-[600px] sm:min-h-[700px]">
            {/* Content */}
            <div className="flex-1 flex items-center justify-center py-4">
              <div className="max-w-[621px] w-full text-center">
                {/* Badge */}
                <div className="inline-flex items-center gap-2 bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white px-2 py-1  text-sm font-medium mb-3">
                  Partnership Program
                </div>

                {/* Main Title */}
                <h1 className="text-[32px] sm:text-[48px] font-black leading-[32px] sm:leading-[48px] text-white font-['Poppins',_sans-serif] mb-4 sm:mb-6 drop-shadow-lg">
                  Partner with the
                  <span className="block text-[#ee0000]">Tool Experts</span>
                </h1>

                {/* Description */}
                <p className="text-[16px] sm:text-[18px] text-gray-200 font-normal leading-[24px] sm:leading-[28px] mb-6 sm:mb-8 font-['Inter',_sans-serif] drop-shadow-md">
                  Join our growing network of trusted tool brands and trades professionals. Be part of a community built
                  to connect Australia&apos;s best tradespeople with premium products, exclusive rewards, and real
                  opportunities to grow brand awareness.
                </p>

                {/* Mobile Feature Cards - Before Button */}
                <div className="mb-8">
                  <h3 className="text-lg font-bold text-white mb-4 font-['Poppins'] text-center drop-shadow-md">
                    Why Partner With Us?
                  </h3>
                  <div className="overflow-x-auto pb-4 scrollbar-hide">
                    <div className="flex gap-4 min-w-max">
                      {/* Feature Card 1 */}
                      <div className="relative group bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-700/80 backdrop-blur-sm rounded-2xl p-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-slate-500/30 flex-shrink-0 w-64">
                        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10"></div>
                        <h4 className="text-base font-bold text-white mb-2 font-['Poppins'] relative z-20">
                          Increased Sales
                        </h4>
                        <p className="text-xs text-slate-200 font-['Inter'] relative z-20">
                          Increase your sales with your community of tradespeople and tool enthusiasts.
                        </p>
                      </div>

                      {/* Feature Card 2 */}
                      <div className="relative group bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-700/80 backdrop-blur-sm rounded-2xl p-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-slate-500/30 flex-shrink-0 w-64">
                        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10"></div>
                        <h4 className="text-base font-bold text-white mb-2 font-['Poppins'] relative z-20">
                          Brand Exposure
                        </h4>
                        <p className="text-xs text-slate-200 font-['Inter'] relative z-20">
                          Connect directly with engaged tradies, builders, and tool enthusiasts across Australia.
                        </p>
                      </div>

                      {/* Feature Card 3 */}
                      <div className="relative group bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-700/80 backdrop-blur-sm rounded-2xl p-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-slate-500/30 flex-shrink-0 w-64">
                        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10"></div>
                        <h4 className="text-base font-bold text-white mb-2 font-['Poppins'] relative z-20">
                          Premium Placement
                        </h4>
                        <p className="text-xs text-slate-200 font-['Inter'] relative z-20">
                          Get priority positioning in our marketplace
                        </p>
                      </div>

                      {/* Feature Card 4 */}
                      <div className="relative group bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-700/80 backdrop-blur-sm rounded-2xl p-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-slate-500/30 flex-shrink-0 w-64">
                        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10"></div>
                        <h4 className="text-base font-bold text-white mb-2 font-['Poppins'] relative z-20">
                          Easy Integration
                        </h4>
                        <p className="text-xs text-slate-200 font-['Inter'] relative z-20">
                          Simple setup process with dedicated support
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* CTA Button */}
                <MetallicButton
                  onClick={onBecomePartnerAction}
                  variant="primary"
                  size="md"
                  borderRadius="lg"
                  className="w-full sm:w-auto"
                >
                  Become a Partner
                </MetallicButton>
              </div>
            </div>
          </div>

          {/* Desktop: Two Column Layout */}
          <div className="hidden lg:grid grid-cols-2 gap-12 items-center min-h-[500px]">
            {/* Left Content */}
            <div className="max-w-[621px]">
              {/* Badge */}
              <div className="inline-flex items-center  bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white px-2 py-1  text-sm font-medium mb-1">
                Partnership Program
              </div>

              {/* Main Title */}
              <h1 className="text-[64px] font-black leading-[64px] text-white font-['Poppins',_sans-serif] mb-6 drop-shadow-lg">
                Partner with the
                <span className="block text-[#ee0000]">Tool Experts</span>
              </h1>

              {/* Description */}
              <p className="text-[20px] text-gray-200 font-normal leading-[28px] mb-8 font-['Inter',_sans-serif] drop-shadow-md">
                Join leading brands like DeWalt, Makita, and Milwaukee in our exclusive rewards club ecosystem. Reach
                thousands of tool professionals and enthusiasts across Australia.
              </p>

              {/* CTA Button */}
              <MetallicButton onClick={onBecomePartnerAction} variant="primary" size="lg" borderRadius="lg">
                Become a Partner
              </MetallicButton>
            </div>

            {/* Right Content - Features Grid */}
            <div className="grid grid-cols-2 gap-6">
              {/* Feature Card 1 */}
              <div className="relative group bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-700/80 backdrop-blur-sm rounded-2xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-slate-500/30">
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10"></div>
                <h3 className="text-lg font-bold text-white mb-2 font-['Poppins'] relative z-20">Increased Sales</h3>
                <p className="text-sm text-slate-200 font-['Inter'] relative z-20">
                  Increase your sales with your community of tradespeople and tool enthusiasts.
                </p>
              </div>

              {/* Feature Card 2 */}
              <div className="relative group bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-700/80 backdrop-blur-sm rounded-2xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-slate-500/30">
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10"></div>
                <h3 className="text-lg font-bold text-white mb-2 font-['Poppins'] relative z-20">Brand Exposure</h3>
                <p className="text-sm text-slate-200 font-['Inter'] relative z-20">
                  Connect directly with engaged tradies, builders, and tool enthusiasts across Australia.
                </p>
              </div>

              {/* Feature Card 3 */}
              <div className="relative group bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-700/80 backdrop-blur-sm rounded-2xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-slate-500/30">
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10"></div>
                <h3 className="text-lg font-bold text-white mb-2 font-['Poppins'] relative z-20">Premium Placement</h3>
                <p className="text-sm text-slate-200 font-['Inter'] relative z-20">
                  Get priority positioning in our marketplace
                </p>
              </div>

              {/* Feature Card 4 */}
              <div className="relative group bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-700/80 backdrop-blur-sm rounded-2xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-slate-500/30">
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10"></div>
                <h3 className="text-lg font-bold text-white mb-2 font-['Poppins'] relative z-20">Easy Integration</h3>
                <p className="text-sm text-slate-200 font-['Inter'] relative z-20">
                  Simple setup process with dedicated support
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="py-6 sm:py-8 lg:py-10 w-full relative z-10">
        <BrandScroller speed={800} speedMobile={400} />
      </div>
    </section>
  );
}
