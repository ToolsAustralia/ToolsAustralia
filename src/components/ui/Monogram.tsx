"use client";

import { cn } from "@/utils/cn";
import { getInitials } from "@/utils/display-name";
import { glossGrad, inkOn } from "@/utils/membership/tier-visuals";

interface MonogramProps {
  firstName?: string | null;
  lastName?: string | null;
  /** Tile side length in px. */
  size?: number;
  /** Corner radius in px. */
  radius?: number;
  /** Tier/accent hex driving the tile fill (or ink, when `onBrand`). */
  tierHex?: string | null;
  /**
   * On a colored/brand surface: render a white tile with tier-colored ink
   * (reads on any hero gradient). Off: a glossy tier-colored tile with
   * auto-contrast ink.
   */
  onBrand?: boolean;
  className?: string;
}

/**
 * Monogram identity tile (user initials) — the dashboard's avatar. No photos by
 * design. Ported from the Claude prototype `Mono`.
 */
export function Monogram({
  firstName,
  lastName,
  size = 44,
  radius = 14,
  tierHex = "#ee0000",
  onBrand = false,
  className,
}: MonogramProps) {
  const hex = tierHex ?? "#ee0000";
  const background = onBrand ? "#ffffff" : glossGrad(hex);
  const color = onBrand ? hex : inkOn(hex);
  return (
    <span
      aria-hidden="true"
      className={cn("inline-grid place-items-center font-poppins font-black leading-none", className)}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background,
        color,
        fontSize: Math.round(size * 0.4),
      }}
    >
      {getInitials(firstName, lastName)}
    </span>
  );
}

export default Monogram;
