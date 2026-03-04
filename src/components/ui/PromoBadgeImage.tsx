"use client";

import React from "react";

const VALID_MULTIPLIERS = [2, 3, 5, 10] as const;

interface PromoBadgeImageProps {
  multiplier: (typeof VALID_MULTIPLIERS)[number];
  size?: "small" | "medium" | "large";
  className?: string;
}

const sizeMap = {
  small: "h-8 w-auto sm:h-10 md:h-12",
  medium: "h-10 w-auto sm:h-12 md:h-14",
  large: "h-12 w-auto sm:h-14 md:h-18",
};

/**
 * Displays the promo badge image (e.g. /images/badge/X10.png) instead of the styled PromoBadge component.
 * Used in admin promo management for consistent visual representation.
 */
const PromoBadgeImage: React.FC<PromoBadgeImageProps> = ({
  multiplier,
  size = "medium",
  className = "",
}) => {
  const src = `/images/badge/X${multiplier}.png`;

  return (
    <img
      src={src}
      alt={`${multiplier}x promo`}
      className={`object-contain ${sizeMap[size]} ${className}`}
    />
  );
};

export default PromoBadgeImage;
