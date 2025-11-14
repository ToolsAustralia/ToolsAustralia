"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
// import MajorDrawStats from "./MajorDrawStats"; // Commented out for now
import HorizontalCountdown from "./HorizontalCountdown";
import MetallicButton from "@/components/ui/MetallicButton";
import BrandScroller from "@/components/ui/BrandScroller";

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
  return (
    <section
      className={`relative hero-bg min-h-screen-svh flex flex-col  pb-10 sm:pb-8 pt-[60px] sm:pt-[100px] lg:pt-[106px] w-full overflow-visible hero-section ${
        isTopBarVisible ? "top-bar-visible" : ""
      }`}
    >
      {/* Background Images - Responsive for mobile and desktop */}
      <div className="absolute inset-0 z-0">
        {/* Mobile Background */}
        <div className="lg:hidden absolute inset-0">
          <Image
            src="/images/background/mobileBg.jpg"
            alt="Tools background"
            fill
            className="object-cover"
            priority
            quality={90}
          />
        </div>
        {/* Desktop Background */}
        <div className="hidden lg:block absolute inset-0">
          <Image
            src="/images/background/desktopBg.jpg"
            alt="Tools background"
            fill
            className="object-cover"
            priority
            quality={90}
          />
        </div>
        {/* Dark overlay for better text readability */}
        <div className="absolute inset-0 bg-black/20"></div>
      </div>

      {/* Main Hero Content */}
      <div className="flex-1 flex flex-col items-start justify-center w-full relative z-10">
        <div className="relative w-full px-2 sm:px-3 lg:px-[100px] lg:max-w-1440 lg:mx-auto">
          {/* Unified Content Layout - Mobile */}
          <div className="lg:hidden flex flex-col items-center justify-center min-h-[calc(100vh-200px)] py-8">
            <div className="max-w-[621px] w-full px-4">
              {/* Main Title */}
              <h1 className="text-[40px] sm:text-[60px] font-black leading-[40px] sm:leading-[60px] text-white font-['Poppins',_sans-serif] mb-4 sm:mb-6 text-center drop-shadow-lg">
                Tools Australia
              </h1>

              {/* Description */}
              <p className="text-[16px] sm:text-[18px] text-gray-200 font-normal leading-[20px] sm:leading-[22px] max-w-[545px] mb-6 sm:mb-8 font-['Inter',_sans-serif] text-center mx-auto drop-shadow-md">
                Your go-to for tools and Australia&apos;s biggest tool giveaways. Shop the best tools, find exclusive
                partner deals, and win big!
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8 sm:mb-12">
                <MetallicButton href="/shop" variant="primary" size="md" borderRadius="lg">
                  Shop Now
                </MetallicButton>

                <MetallicButton href="/membership" variant="secondary" size="md" borderRadius="lg" borderColor="red">
                  Join Membership
                </MetallicButton>
              </div>

              {/* Stats */}
              <div className="w-full flex flex-row items-center justify-center gap-2 sm:gap-4">
                <div className="flex flex-col flex-1 text-center">
                  {/* <div className="text-[16px] sm:text-[18px] font-bold text-white mb-[-2px] font-['Inter',_sans-serif] leading-[18px] sm:leading-[20px] drop-shadow-md">
                    200+
                  </div> */}
                  <div className="text-[10px] sm:text-[11px] text-gray-300 font-['Inter',_sans-serif] font-normal leading-[12px] sm:leading-[13px] drop-shadow-sm">
                    Australia’s Best Brands
                  </div>
                </div>

                <div className="flex flex-col flex-1 text-center">
                  {/* <div className="text-[16px] sm:text-[18px] font-bold text-white mb-[-2px] font-['Inter',_sans-serif] leading-[18px] sm:leading-[20px] drop-shadow-md">
                    2,000+
                  </div> */}
                  <div className="text-[10px] sm:text-[11px] text-gray-300 font-['Inter',_sans-serif] font-normal leading-[12px] sm:leading-[13px] drop-shadow-sm">
                    High-Quality Products
                  </div>
                </div>

                <div className="flex flex-col flex-1 text-center">
                  {/* <div className="text-[16px] sm:text-[18px] font-bold text-white mb-[-2px] font-['Inter',_sans-serif] leading-[18px] sm:leading-[20px] drop-shadow-md">
                    30,000+
                  </div> */}
                  <div className="text-[10px] sm:text-[11px] text-gray-300 font-['Inter',_sans-serif] font-normal leading-[12px] sm:leading-[13px] drop-shadow-sm">
                    Happy Customers
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Unified Content Layout - Desktop */}
          <div className="hidden lg:flex items-start justify-start py-12">
            <div className="max-w-[621px]">
              {/* Main Title */}
              <h1 className="text-[80px] font-black leading-[80px] text-white font-['Poppins',_sans-serif] mb-6 drop-shadow-lg">
                Tools Australia
              </h1>

              {/* Description */}
              <p className="text-[20px] text-gray-200 font-normal leading-[22px] max-w-[545px] mb-8 font-['Inter',_sans-serif] drop-shadow-md">
                Your go-to for tools and Australia&apos;s biggest tool giveaways. Shop the best tools, find exclusive
                partner deals, and win big!
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 mb-12">
                <MetallicButton href="/shop" variant="primary" size="md" borderRadius="lg">
                  Shop Now
                </MetallicButton>

                <MetallicButton href="/membership" variant="secondary" size="md" borderRadius="lg" borderColor="red">
                  Join Membership
                </MetallicButton>
              </div>

              {/* Stats */}
              <div className="flex flex-row items-center justify-start gap-8">
                <div className="flex flex-col text-left">
                  {/* <div className="text-[40px] font-bold text-white mb-[-2px] font-['Inter',_sans-serif] leading-[48px] drop-shadow-md">
                    200+
                  </div> */}
                  <div className="text-[16px] text-gray-300 font-['Inter',_sans-serif] font-normal leading-[22px] drop-shadow-sm">
                    Australia’s Best Brands
                  </div>
                </div>

                <div className="w-px h-[68px] bg-white/30"></div>

                <div className="flex flex-col text-left">
                  {/* <div className="text-[40px] font-bold text-white mb-[-2px] font-['Inter',_sans-serif] leading-[48px] drop-shadow-md">
                    2,000+
                  </div> */}
                  <div className="text-[16px] text-gray-300 font-['Inter',_sans-serif] font-normal leading-[22px] drop-shadow-sm">
                    High-Quality Products
                  </div>
                </div>

                <div className="w-px h-[68px] bg-white/30"></div>

                <div className="flex flex-col text-left">
                  {/* <div className="text-[40px] font-bold text-white mb-[-2px] font-['Inter',_sans-serif] leading-[48px] drop-shadow-md">
                    30,000+
                  </div> */}
                  <div className="text-[16px] text-gray-300 font-['Inter',_sans-serif] font-normal leading-[22px] drop-shadow-sm">
                    Happy Customers
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Brand Logos Section - CSS Marquee */}
      <div className="py-6 sm:py-8 lg:py-10 w-full relative z-10">
        <BrandScroller speed={800} speedMobile={400} />
      </div>

      {/* Major Draw Stats - Positioned at bottom with absolute positioning
      <MajorDrawStats className="-bottom-12 sm:-bottom-16" /> */}
    </section>
  );
}

// Horizontal Countdown Section - Compact height
export function HorizontalCountdownSection() {
  return (
    <section className="bg-gradient-to-b from-gray-50 to-white pt-16 sm:pt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <HorizontalCountdown />
      </div>
    </section>
  );
}
