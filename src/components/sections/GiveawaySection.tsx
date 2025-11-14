"use client";

import Image from "next/image";
import { Gift, Clock, Star } from "lucide-react";

interface GiveawaySectionProps {
  className?: string;
}

export default function GiveawaySection({ className = "" }: GiveawaySectionProps) {
  return (
    <section
      className={`relative  lg:py-16 bg-gradient-to-br from-gray-50 via-white to-gray-50 w-full overflow-visible ${className}`}
    >
      <div className="relative w-full px-2 sm:px-3 lg:px-8 lg:max-w-7xl lg:mx-auto overflow-visible">
        {/* Large Image Container with Absolute Positioning - Positioned relative to section */}
        <div className="absolute lg:top-0 top-14 left-5 sm:left-3 lg:left-20 w-40 h-40 sm:w-60 sm:h-60 lg:w-[500px] lg:h-[500px] z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-gray-100 to-gray-200 rounded-3xl shadow-2xl"></div>
          <Image
            src="/images/giveAway.png"
            alt="Red Cantilever Toolbox - Next Giveaway"
            fill
            className="object-contain drop-shadow-2xl relative z-10"
            priority
          />
        </div>

        {/* Excitement Badge - Positioned Absolutely relative to section */}
        <div className="absolute top-12 lg:top-0 left-[120px] sm:left-[240px] lg:left-[520px] bg-gradient-to-r from-yellow-400 to-orange-500 text-black px-3 py-1 rounded-full text-xs font-bold shadow-xl  z-20">
          FREE!
        </div>

        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:gap-12 items-center min-h-[300px] sm:min-h-[350px] lg:min-h-[500px]">
          {/* Left Column - Empty space for image */}
          <div className="relative overflow-visible">
            {/* Image is now positioned relative to section, not this container */}
          </div>

          {/* Right Column - Giveaway Text */}
          <div className="text-left relative z-10">
            <div className="space-y-4 sm:space-y-5">
              {/* Main Title with Icon */}
              <div className="flex items-center justify-start gap-2">
                <Gift className="w-4 h-4 sm:w-5 sm:h-5 lg:w-8 lg:h-8 text-yellow-500" />
                <h2 className="text-[18px] sm:text-[20px] lg:text-[36px] font-bold text-black font-['Poppins'] leading-tight">
                  Next Giveaway
                </h2>
              </div>

              {/* Exciting Description */}
              <p className="text-[13px] sm:text-[14px] lg:text-[22px] text-gray-700 font-medium leading-relaxed max-w-sm">
                Something amazing is coming! Get ready for our next exciting giveaway with incredible prizes.
              </p>

              {/* Coming Soon Indicator */}
              <div className="flex items-center justify-start gap-2 text-gray-600">
                <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="text-[11px] sm:text-[12px] lg:text-[18px] font-semibold">Details Coming Soon</span>
              </div>

              {/* Star Rating for Excitement */}
              <div className="flex items-center justify-start gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star key={star} className="w-3 h-3 sm:w-3.5 sm:h-3.5 lg:w-6 lg:h-6 text-yellow-400 fill-current" />
                ))}
                <span className="text-[10px] sm:text-[11px] lg:text-[17px] text-gray-600 ml-1 font-medium">
                  Premium Quality
                </span>
              </div>

              {/* Don't Miss Out Button - Desktop only */}
              <div className="hidden lg:block pt-2 sm:pt-3">
                <div className="inline-flex items-center gap-1 bg-gradient-to-r from-black to-gray-800 text-white px-4 py-2 sm:px-6 sm:py-2.5 rounded-full shadow-xl hover:shadow-2xl transition-all duration-300">
                  <span className="text-[11px] sm:text-[12px] lg:text-[18px] font-semibold">Don&apos;t Miss Out!</span>
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Don't Miss Out Button - Mobile and Tablet only */}
        <div className="lg:hidden flex justify-center  sm:pt-6">
          <div className="inline-flex items-center gap-1 bg-gradient-to-r from-black to-gray-800 text-white px-6 py-3 sm:px-8 sm:py-4 rounded-full shadow-xl hover:shadow-2xl transition-all duration-300">
            <span className="text-[14px] sm:text-[16px] font-semibold">Don&apos;t Miss Out!</span>
            <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-yellow-400 rounded-full animate-pulse"></div>
          </div>
        </div>
      </div>
    </section>
  );
}
