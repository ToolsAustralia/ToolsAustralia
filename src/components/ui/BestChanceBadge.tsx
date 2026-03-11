"use client";

import React from "react";
import type { PackageColorScheme } from "@/utils/package-colors/packageColorScheme";
import CornerRibbonBadge, { type CornerRibbonPosition } from "@/components/ui/CornerRibbonBadge";

interface BestChanceBadgeProps {
  size?: "xs" | "small" | "medium" | "large";
  className?: string;
  /** Corner position: top-left, top-right, bottom-left, bottom-right */
  position?: CornerRibbonPosition;
  /** Optional package-themed styles to match the card (background, boxShadow, border) */
  badgeStyle?: { background: string; boxShadow: string; border: string };
  /** Optional color scheme for gradient border (e.g. black theme golden gradient) */
  colorScheme?: PackageColorScheme;
}

const SIZE_MAP = { xs: "small" as const, small: "small" as const, medium: "medium" as const, large: "large" as const };

/**
 * BestChanceBadge Component
 * Premium corner ribbon badge for "BEST CHANCE" on boss/power packages.
 * Uses configurable corner position and package-themed or default brand red style.
 */
const BestChanceBadge: React.FC<BestChanceBadgeProps> = ({
  size = "medium",
  className = "",
  position = "top-left",
  badgeStyle,
  colorScheme,
}) => (
  <CornerRibbonBadge
    position={position}
    size={SIZE_MAP[size]}
    badgeStyle={badgeStyle}
    colorScheme={colorScheme}
    className={className}
  >
    BEST CHANCE
  </CornerRibbonBadge>
);
export default BestChanceBadge;

