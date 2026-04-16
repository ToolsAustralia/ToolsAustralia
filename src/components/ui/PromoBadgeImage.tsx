"use client";

import React from "react";
import Image from "next/image";

type ValidMultiplier = 2 | 3 | 5 | 10;

interface PromoBadgeImageProps {
  multiplier: ValidMultiplier;
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
  const src = `/images/badge/X${multiplier}.webp`;
  const dimensions = sizeMap[size];

  return (
    <Image
      src={src}
      alt={`${multiplier}x promo`}
      width={dimensions.width}
      height={dimensions.height}
      className={`object-contain ${sizeClassMap[size]} ${className}`}
    />
  );
};

export default PromoBadgeImage;
