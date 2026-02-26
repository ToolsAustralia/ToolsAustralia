/**
 * Brand color mapping utility for prize toggles
 * Maps prize slugs to their corresponding brand gradient classes
 * Used in PrizeShowcase component
 * Derives power-toolset colors from packageColorScheme (single source of truth)
 * Milwaukee uses Tools Australia brand red (#ee0000) for site consistency
 */

import type { PrizeSlug } from "@/config/prizes";
import {
  getLandingPageThemeFromSlug,
  getPackageColorScheme,
  slugToPromoTierPlanId,
  hexToRgbString,
  hexToRgbaString,
} from "@/utils/package-colors/packageColorScheme";

// Tools Australia brand red (matches site nav, login, AdminSidebar) - Milwaukee overrides package theme
const TOOLS_AUSTRALIA_RED: PrizeBrandColors = {
  gradient: "from-[#d40000] via-[#ee0000] to-[#ff4444]",
  borderColor: "border-[#ee0000]",
  shadowColor: "shadow-[0_0_20px_rgba(238,0,0,0.4)]",
  textColor: "text-white",
  subtitleTextColor: "text-white/90",
  checkmarkColor: "text-[#ee0000]",
  hoverBorderColor: "hover:border-[#ff4444]",
  hoverTextColor: "hover:text-[#ee0000]",
} as const;

/** Build PrizeBrandColors from packageColorScheme theme (dewalt, makita, ryobi, etc.) */
function buildBrandColorsFromTheme(slug: PrizeSlug): PrizeBrandColors {
  const theme = getLandingPageThemeFromSlug(slug);
  const scheme = getPackageColorScheme(slugToPromoTierPlanId(slug));
  const { primary, primaryLight, primaryDark } = theme;
  return {
    gradient: `from-[${primary}] via-[${primaryLight}] to-[${primaryDark}]`,
    borderColor: `border-[${primaryDark}]`,
    shadowColor: `shadow-[${primary}]/40`,
    textColor: scheme.text,
    subtitleTextColor: scheme.text === "text-black" ? "text-black/90" : "text-white/90",
    checkmarkColor: `text-[${primaryDark}]`,
    hoverBorderColor: `hover:border-[${primaryLight}]`,
    hoverTextColor: `hover:text-[${primaryDark}]`,
  };
}

export interface PrizeBrandColors {
  gradient: string;
  borderColor: string;
  shadowColor: string;
  textColor: string;
  subtitleTextColor: string; // Text color with opacity for subtitle
  checkmarkColor: string;
  hoverBorderColor: string;
  hoverTextColor: string; // Hover text color for inactive states (e.g. hover:text-amber-600)
}

/**
 * Maps prize slugs to brand-specific color schemes
 * Based on brand colors from BrandScroller/BrandShowcase
 */
export function getPrizeBrandColors(slug: PrizeSlug): PrizeBrandColors {
  switch (slug) {
    case "milwaukee-sidchrome":
    case "milwaukee-milwaukee":
      return { ...TOOLS_AUSTRALIA_RED };
    case "dewalt-sidchrome":
    case "dewalt-milwaukee":
    case "makita-sidchrome":
    case "makita-milwaukee":
    case "ryobi-sidchrome":
    case "ryobi-milwaukee":
      return buildBrandColorsFromTheme(slug);
    case "cash-prize":
      return {
        gradient: "from-green-500 via-green-600 to-green-700",
        borderColor: "border-green-500",
        shadowColor: "shadow-green-500/40",
        textColor: "text-white",
        subtitleTextColor: "text-white/90",
        checkmarkColor: "text-green-600",
        hoverBorderColor: "hover:border-green-400",
        hoverTextColor: "hover:text-green-600",
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
        hoverTextColor: "hover:text-red-600",
      };
  }
}

/**
 * Get brand-specific solid border color for CSS (RGB format)
 * Used for image gallery borders to match prize selector boxes
 * Derives from packageColorScheme (primaryDark) for power toolsets
 */
export function getBrandBorderColor(slug: PrizeSlug): string {
  if (slug === "cash-prize") return "rgb(22, 163, 74)"; // green-600
  const theme = getLandingPageThemeFromSlug(slug);
  return hexToRgbString(theme.primaryDark);
}

/**
 * Get brand-specific glow color for CSS (RGBA format)
 * Used for border glows and shadow effects
 * Derives from packageColorScheme (primaryDark) for power toolsets
 */
export function getBrandGlowColor(slug: PrizeSlug): string {
  if (slug === "cash-prize") return "rgba(34, 197, 94, 0.6)"; // green-500
  const theme = getLandingPageThemeFromSlug(slug);
  return hexToRgbaString(theme.primaryDark, 0.6);
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
    case "ryobi-sidchrome":
    case "ryobi-milwaukee":
      return "glow-ryobi";
    case "cash-prize":
      return "glow-green";
    default:
      return "glow-milwaukee";
  }
}
