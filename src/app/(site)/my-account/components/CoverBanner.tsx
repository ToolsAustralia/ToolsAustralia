"use client";

import React from "react";
import Image from "next/image";

interface CoverBannerProps {
  className?: string;
}

const COVER_BANNER_SRC = "/images/coverBanner.png";

export default function CoverBanner({ className = "" }: CoverBannerProps) {
  return (
    <div className={`relative w-full ${className}`}>
      <div className="relative w-full h-40 xs:h-48 sm:h-56 md:h-64 lg:h-72 overflow-hidden">
        <Image
          src={COVER_BANNER_SRC}
          alt="Tools Australia - Power tools and equipment"
          fill
          className="object-cover"
          priority
          sizes="100%"
        />
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent"></div>
      </div>

      <div className="absolute -bottom-10 sm:-bottom-12 left-4 sm:left-6">
        <div className="relative w-20 h-20 xs:w-24 xs:h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-full border-4 border-white dark:border-neutral-900 bg-white dark:bg-neutral-800 shadow-xl overflow-hidden">
          <Image
            src="/Social Media Profile_Primary.png"
            alt="Tools Australia"
            fill
            className="object-cover"
          />
        </div>
      </div>
    </div>
  );
}
