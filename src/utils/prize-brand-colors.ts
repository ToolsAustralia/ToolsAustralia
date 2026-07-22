/**
 * Brand color mapping utility for prize toggles
 * Maps prize slugs to their corresponding brand gradient classes
 * Used in PrizeShowcase component
 * Derives power-toolset colors from packageColorScheme (single source of truth)
 * Milwaukee uses Tools Australia brand red (#ee0000) for site consistency
 */

import type { PrizeSlug } from "@/config/prize-summaries";
import { BRAND_THEMES, getBrandColors, slugToBrandKey } from "@/config/brand-theme";
import {
  getLandingPageThemeFromSlug,
  getPackageColorScheme,
  slugToPromoTierPlanId,
  hexToRgbString,
  hexToRgbaString,
} from "@/utils/package-colors/packageColorScheme";

// Tools Australia brand red (matches site nav, login, AdminSidebar) - Milwaukee overrides package theme
const TOOLS_AUSTRALIA_RED: PrizeBrandColors = {
  gradient: "from-[#d40000] via-red-600 to-red-400",
  borderColor: "border-red-600",
  shadowColor: "shadow-[0_0_20px_rgba(238,0,0,0.4)]",
  textColor: "text-white",
  subtitleTextColor: "text-white/90",
  checkmarkColor: "text-red-600",
  hoverBorderColor: "hover:border-red-400",
  hoverTextColor: "hover:text-red-600",
} as const;

/** Build PrizeBrandColors from brand-theme ramps (aligned with Milwaukee: canonical colors per mode). */
function buildBrandColorsFromTheme(slug: PrizeSlug, forDarkMode = false): PrizeBrandColors {
  const scheme = getPackageColorScheme(slugToPromoTierPlanId(slug));
  const brandKey = slugToBrandKey(slug);

  if (brandKey) {
    const ramp = getBrandColors(brandKey, forDarkMode ? "dark" : "light");
    const deep = BRAND_THEMES[brandKey].dark.primary;
    const darkOnLight = scheme.text === "text-black";
    return {
      gradient: `from-[${ramp.primary}] via-[${ramp.secondary}] to-[${ramp.accent}]`,
      borderColor: `border-[${forDarkMode ? ramp.accent : deep}]`,
      shadowColor: `shadow-[${ramp.primary}]/40`,
      // `!` beats metal-header / gradient wrapper text in ModalHeader (Ryobi, DeWalt, etc.)
      textColor: darkOnLight && !forDarkMode ? "!text-black" : scheme.text,
      subtitleTextColor: darkOnLight && !forDarkMode ? "!text-black/90" : scheme.text === "text-black" ? "text-black/90" : "text-white/90",
      checkmarkColor: `text-[${forDarkMode ? ramp.accent : deep}]`,
      hoverBorderColor: `hover:border-[${ramp.secondary}]`,
      hoverTextColor: `hover:text-[${deep}]`,
    };
  }

  const theme = getLandingPageThemeFromSlug(slug);
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
/** @param isDark When true, use each brand’s dark ramp for gradients/chrome (matches modal + Milwaukee-style behavior). */
export function getPrizeBrandColors(slug: PrizeSlug, isDark = false): PrizeBrandColors {
  switch (slug) {
    case "milwaukee-sidchrome":
    case "milwaukee-milwaukee":
    case "milwaukee-kincrome":
      return { ...TOOLS_AUSTRALIA_RED };
    case "dewalt-sidchrome":
    case "dewalt-milwaukee":
    case "dewalt-kincrome":
    case "makita-sidchrome":
    case "makita-milwaukee":
    case "makita-kincrome":
    case "ryobi-sidchrome":
    case "ryobi-milwaukee":
    case "ryobi-kincrome":
    case "hikoki-sidchrome":
    case "hikoki-milwaukee":
    case "hikoki-kincrome":
      return buildBrandColorsFromTheme(slug, isDark);
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

/** Parse `#RGB` / `#RRGGBB` to 0-255 channels. `null` on anything malformed. */
function parseHex(hex: string): [number, number, number] | null {
  if (typeof hex !== "string") return null;
  const raw = hex.trim().replace(/^#/, "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  if (full.length !== 6 || /[^0-9a-fA-F]/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** WCAG 2.1 relative luminance — gamma-corrected, NOT a raw channel average. */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const linear = (channel: number) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * WCAG 2.1 contrast ratio between two hex colours, 1 (identical) to 21
 * (black on white). Normal-size body text needs ≥ 4.5. Returns 1 for
 * unparseable input so a bad colour reads as "no contrast" rather than passing.
 */
export function contrastRatio(a: string, b: string): number {
  const first = parseHex(a);
  const second = parseHex(b);
  if (!first || !second) return 1;
  const [hi, lo] = [relativeLuminance(first), relativeLuminance(second)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Legible ink for text sitting ON a filled brand-accent surface: whichever of
 * white / near-black actually has the better WCAG contrast against the accent.
 *
 * Derived rather than a brand allow-list, so a future brand's accent gets
 * readable ink with no code change — the point of a data-driven brand registry.
 *
 * Note this measures REAL contrast, not the naive `(0.2126R + 0.7152G + …)/255`
 * shortcut some older components in this repo use: that shortcut skips sRGB
 * gamma correction, which puts saturated mid-tones (Makita teal `#00b8c2`,
 * Ryobi lime `#8aa300`, cash green `#18a94d`) on the wrong side of the line and
 * returns white ink at ~2.5–2.9:1 — visibly unreadable, and a WCAG AA failure.
 *
 * Pure; accepts `#RGB` / `#RRGGBB`; falls back to white on any parse failure.
 *
 * @param darkInk - Ink used for pale accents. Defaults to the near-black the
 *   promo surfaces use for body text.
 */
export function accentInk(hex: string, darkInk = "#0c0d10"): string {
  const white = "#ffffff";
  if (!parseHex(hex)) return white;
  return contrastRatio(hex, darkInk) > contrastRatio(hex, white) ? darkInk : white;
}
