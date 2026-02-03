/**
 * Brand color mapping utility for prize toggles
 * Maps prize slugs to their corresponding brand gradient classes
 * Used in PrizeShowcase component
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
        borderColor: "border-red-600",
        shadowColor: "shadow-red-500/40",
        textColor: "text-white",
        subtitleTextColor: "text-white/90",
        checkmarkColor: "text-red-600",
        hoverBorderColor: "hover:border-red-500",
      };
    case "dewalt-sidchrome":
      return {
        gradient: "from-yellow-500 via-yellow-600 to-amber-600",
        borderColor: "border-amber-600",
        shadowColor: "shadow-yellow-500/40",
        textColor: "text-black",
        subtitleTextColor: "text-black/90",
        checkmarkColor: "text-yellow-600",
        hoverBorderColor: "hover:border-amber-500",
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
    case "milwaukee-milwaukee":
      return {
        gradient: "from-red-600 via-red-500 to-red-700",
        borderColor: "border-red-600",
        shadowColor: "shadow-red-500/40",
        textColor: "text-white",
        subtitleTextColor: "text-white/90",
        checkmarkColor: "text-red-600",
        hoverBorderColor: "hover:border-red-500",
      };
    case "dewalt-milwaukee":
      return {
        gradient: "from-yellow-500 via-yellow-600 to-amber-600",
        borderColor: "border-amber-600",
        shadowColor: "shadow-yellow-500/40",
        textColor: "text-black",
        subtitleTextColor: "text-black/90",
        checkmarkColor: "text-yellow-600",
        hoverBorderColor: "hover:border-amber-500",
      };
    case "makita-milwaukee":
      return {
        // Using custom Makita brand colors: #008C95 (light) and #007577 (dark)
        gradient: "from-makita-500 via-makita-600 to-makita-700", // Makita cyan gradient
        borderColor: "border-makita-600", // Darker Makita cyan border
        shadowColor: "shadow-makita-500/40", // Makita cyan shadow
        textColor: "text-white",
        subtitleTextColor: "text-white/90",
        checkmarkColor: "text-makita-500", // Makita cyan checkmark
        hoverBorderColor: "hover:border-makita-500", // Makita teal on hover
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
        borderColor: "border-red-600",
        shadowColor: "shadow-red-500/40",
        textColor: "text-white",
        subtitleTextColor: "text-white/90",
        checkmarkColor: "text-red-600",
        hoverBorderColor: "hover:border-red-500",
      };
  }
}

/**
 * Get brand-specific solid border color for CSS (RGB format)
 * Used for image gallery borders to match prize selector boxes
 * Using darker shades for better visibility
 */
export function getBrandBorderColor(slug: PrizeSlug): string {
  switch (slug) {
    case "milwaukee-sidchrome":
    case "milwaukee-milwaukee":
      return "rgb(185, 28, 28)"; // red-700 - darker red
    case "dewalt-sidchrome":
    case "dewalt-milwaukee":
      return "rgb(217, 119, 6)"; // amber-600 - darker yellow/amber
    case "makita-sidchrome":
    case "makita-milwaukee":
      return "rgb(0, 117, 119)"; // Makita teal darker (#007577) - darker teal
    case "cash-prize":
      return "rgb(22, 163, 74)"; // green-600 - darker green
    default:
      return "rgb(185, 28, 28)"; // red-700 fallback
  }
}

/**
 * Get brand-specific glow color for CSS (RGBA format)
 * Used for border glows and shadow effects
 */
export function getBrandGlowColor(slug: PrizeSlug): string {
  switch (slug) {
    case "milwaukee-sidchrome":
    case "milwaukee-milwaukee":
      return "rgba(239, 68, 68, 0.6)"; // red-500
    case "dewalt-sidchrome":
    case "dewalt-milwaukee":
      return "rgba(234, 179, 8, 0.6)"; // yellow-500/amber
    case "makita-sidchrome":
    case "makita-milwaukee":
      return "rgba(0, 140, 149, 0.6)"; // Makita teal (#008C95)
    case "cash-prize":
      return "rgba(34, 197, 94, 0.6)"; // green-500
    default:
      return "rgba(239, 68, 68, 0.6)"; // red-500 fallback
  }
}

/**
 * Get brand-specific glow color class name for Tailwind
 * Used for dynamic class application
 */
export function getBrandGlowClass(slug: PrizeSlug): string {
  switch (slug) {
    case "milwaukee-sidchrome":
    case "milwaukee-milwaukee":
      return "glow-milwaukee";
    case "dewalt-sidchrome":
    case "dewalt-milwaukee":
      return "glow-dewalt";
    case "makita-sidchrome":
    case "makita-milwaukee":
      return "glow-makita";
    case "cash-prize":
      return "glow-green";
    default:
      return "glow-milwaukee";
  }
}
