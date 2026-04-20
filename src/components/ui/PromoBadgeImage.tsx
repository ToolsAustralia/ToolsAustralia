"use client";

import React from "react";
import Image from "next/image";
import { hasBundledMultiplierAssets, type PromoMultiplier } from "@/types/promo-multiplier";

interface PromoBadgeImageProps {
  multiplier: PromoMultiplier;
  size?: "small" | "medium" | "large";
  className?: string;
}

const sizeMap = {
  small: { width: 48, height: 48 },
  medium: { width: 56, height: 56 },
  large: { width: 72, height: 72 },
};

const sizeClassMap = {
  small: "h-8 w-auto sm:h-10 md:h-12",
  medium: "h-10 w-auto sm:h-12 md:h-14",
  large: "h-12 w-auto sm:h-14 md:h-18",
};

/**
 * Displays the promo badge image (e.g. /images/badge/X10.webp) instead of the styled PromoBadge component.
 * Used in admin promo management for consistent visual representation.
 */
const PromoBadgeImage: React.FC<PromoBadgeImageProps> = ({
  multiplier,
  size = "medium",
  className = "",
}) => {
  const dimensions = sizeMap[size];

  if (hasBundledMultiplierAssets(multiplier)) {
    const src = `/images/badge/X${multiplier}.webp`;
    return (
      <Image
        src={src}
        alt={`${multiplier}x promo`}
        width={dimensions.width}
        height={dimensions.height}
        className={`object-contain ${sizeClassMap[size]} ${className}`}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={`${multiplier}x promo`}
      className={`flex items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-700 font-black text-white shadow-lg border-2 border-amber-300/60 ${sizeClassMap[size]} ${className}`}
      style={{ minWidth: dimensions.width, minHeight: dimensions.height }}
    >
      <span className="text-sm sm:text-base">{multiplier}x</span>
    </div>
  );
};

export default PromoBadgeImage;
