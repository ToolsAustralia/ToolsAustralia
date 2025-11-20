/**
 * Brand color mapping utility for prize toggles
 * Maps prize slugs to their corresponding brand gradient classes
 * Used in MajorDrawSection and PrizeShowcase components
 */

import type { PrizeSlug } from "@/config/prizes";

export interface PrizeBrandColors {
  gradient: string;
  borderColor: string;
  shadowColor: string;
  textColor: string;
  subtitleTextColor: string; // Text color with opacity for subtitle
  checkmarkColor: string;
  hoverBorderColor: string;
}

/**
 * Maps prize slugs to brand-specific color schemes
 * Based on brand colors from BrandScroller/BrandShowcase
 */
export function getPrizeBrandColors(slug: PrizeSlug): PrizeBrandColors {
  switch (slug) {
    case "milwaukee-sidchrome":
      return {
        gradient: "from-red-600 via-red-500 to-red-700",
        borderColor: "border-red-500",
        shadowColor: "shadow-red-500/40",
        textColor: "text-white",
        subtitleTextColor: "text-white/90",
        checkmarkColor: "text-red-600",
        hoverBorderColor: "hover:border-red-400",
      };
    case "dewalt-sidchrome":
      return {
        gradient: "from-yellow-500 via-yellow-600 to-amber-600",
        borderColor: "border-yellow-500",
        shadowColor: "shadow-yellow-500/40",
        textColor: "text-black",
        subtitleTextColor: "text-black/90",
        checkmarkColor: "text-yellow-600",
        hoverBorderColor: "hover:border-yellow-400",
      };
    case "makita-sidchrome":
      return {
        // Using custom Makita brand colors: #008C95 (light) and #007577 (dark)
        gradient: "from-makita-500 via-makita-600 to-makita-700", // Makita cyan gradient
        borderColor: "border-makita-500", // Primary Makita cyan border
        shadowColor: "shadow-makita-500/40", // Makita cyan shadow
        textColor: "text-white",
        subtitleTextColor: "text-white/90",
        checkmarkColor: "text-makita-500", // Makita cyan checkmark
        hoverBorderColor: "hover:border-makita-400", // Darker Makita teal on hover
      };
    case "cash-prize":
      return {
        gradient: "from-green-500 via-green-600 to-green-700",
        borderColor: "border-green-500",
        shadowColor: "shadow-green-500/40",
        textColor: "text-white",
        subtitleTextColor: "text-white/90",
        checkmarkColor: "text-green-600",
        hoverBorderColor: "hover:border-green-400",
      };
    default:
      // Fallback to red for unknown prizes
      return {
        gradient: "from-red-600 via-red-500 to-red-700",
        borderColor: "border-red-500",
        shadowColor: "shadow-red-500/40",
        textColor: "text-white",
        subtitleTextColor: "text-white/90",
        checkmarkColor: "text-red-600",
        hoverBorderColor: "hover:border-red-400",
      };
  }
}
