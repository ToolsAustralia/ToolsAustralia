/**
 * Shared package color scheme utility
 * Color keys use readable names: kincrome-blue, ryobi-green, makita-teal, dewalt-yellow, milwaukee-red, black, mint-green
 */

import type { CSSProperties } from "react";

/** Elevated panel style (price badge + Enter Now). Reusable across components. */
export type PanelStyle = CSSProperties;

/** Color theme keys - readable names for easier codebase navigation */
export type COLOR_KEYS =
  | "kincrome-blue"
  | "ryobi-green"
  | "makita-teal"
  | "dewalt-yellow"
  | "milwaukee-red"
  | "boss-red"
  | "black"
  | "mint-green"
  | "cash-green";

/** @deprecated Use COLOR_KEYS - kept for backward compatibility */
export type PROMO_TIER_KEYS = COLOR_KEYS;

export interface PackageColorScheme {
  /** CSS linear-gradient for card background */
  bgGradient: string;
  /** Tailwind gradient classes for buttons/text (backward compat) */
  gradient: string;
  /** Primary text color class */
  text: string;
  /** Muted text for "One Time Payment", "Free Entries" */
  textMuted: string;
  /** Text color for use on light backgrounds (e.g. PackageInclusionsSlideUp) */
  textOnLight?: string;
  /** Feature/bullet color for use on light backgrounds */
  featureOnLight?: string;
  /** Price display color */
  priceText: string;
  /** Price badge background - for the price container */
  priceBadgeBg: string;
  /** Price badge border - optional, e.g. border-2 border-[#E0FF00] for Ryobi pop */
  priceBadgeBorder?: string;
  /** Enter Now button background (Tailwind classes) */
  buttonBg: string;
  /** Enter Now button shadow - package-colored, no black */
  buttonShadow: string;
  /** Enter Now button hover shadow - package-colored glow */
  buttonHoverShadow: string;
  /** Enter Now button text color */
  buttonText: string;
  /** Icon glow animation */
  glow: string;
  /** Border color class */
  border: string;
  /** Shadow class */
  shadow: string;
  /** Hover shadow class */
  hoverShadow: string;
  /** Border glow animation class */
  borderGlow: string;
  /** Badge style for Popular/Current/Best Chance, price badge, and Enter Now button */
  badgeStyle: {
    background: string;
    boxShadow: string;
    border: string;
  };
  /** Optional elevated panel style (price badge + Enter Now) - use when button would blend with card */
  enterNowButtonStyle?: PanelStyle;
  /** Optional border class for the Enter Now gradient CTA - e.g. light border (white/30) or dark (border-black) */
  ctaGradientButtonBorder?: string;
  /** Optional Enter Now button text class - e.g. "text-black" for light buttons */
  enterNowButtonTextClass?: string;
  /** Dominant hex for borders/glows */
  accentHex: string;
  /** Lighter accent for use on dark backgrounds (e.g. PackageSelectionModal) - when set, modal uses this for text */
  accentHexLight?: string;
  /** Solid text color for large entry numbers (high contrast, no gradient) */
  entriesText: string;
  /** Hex opacity for card border (e.g. "CC" for 80%) - used as accentHex + this */
  cardBorderOpacity: string;
  /** Bar fill for charts (MembershipPackagesChart) - horizontal */
  barColor?: string;
  /** Lighter bar fill for charts */
  barColorLight?: string;
  /** Bar fill for vertical charts (VerticalAccumulationChart) - gradient to top */
  barColorVertical?: string;
  barColorLightVertical?: string;
  /** CSS linear-gradient for chart bars - use with style={{ background }} when Tailwind arbitrary classes aren't in content */
  barGradientCss?: string;
  /** Gradient text style for premium metallic look - use style={{ ...textGradientStyle }} when present */
  textGradientStyle?: Record<string, string | number>;
  /** Text style for Package Inclusion cards (white bg) - darker tones for contrast */
  packageInclusionTextStyle?: Record<string, string | number>;
  /** Optional gradient for card/icon borders - matches text gradient theme (e.g. black theme golden gradient) */
  cardBorderGradient?: string;
  /** Use white text for Change button in Selected Package (dewalt, ryobi, kincrome) */
  changeButtonTextWhite?: boolean;
}

/** Map plan ID (from API) to color key - one-time tab default mapping */
const PLAN_ID_TO_COLOR_KEY: Record<string, COLOR_KEYS> = {
  "apprentice-pack": "kincrome-blue",
  "tradie-pack": "ryobi-green",
  "foreman-pack": "makita-teal",
  "boss-pack": "dewalt-yellow",
  "power-pack": "milwaukee-red",
  "boss-red": "boss-red",
  "black-pack": "black",
  "mint-pack": "mint-green",
  "cash-prize": "cash-green",
  // Color keys as identity (when getPackageColorScheme receives a color key directly)
  "kincrome-blue": "kincrome-blue",
  "ryobi-green": "ryobi-green",
  "makita-teal": "makita-teal",
  "dewalt-yellow": "dewalt-yellow",
  "milwaukee-red": "milwaukee-red",
  black: "black",
  "mint-green": "mint-green",
  "cash-green": "cash-green",
};

/** Normalize planId or color key to COLOR_KEYS */
function toColorKey(planId: string): COLOR_KEYS {
  if (planId in PLAN_ID_TO_COLOR_KEY) return PLAN_ID_TO_COLOR_KEY[planId as keyof typeof PLAN_ID_TO_COLOR_KEY];
  if (planId.includes("apprentice")) return "kincrome-blue";
  if (planId.includes("tradie")) return "ryobi-green";
  if (planId.includes("foreman")) return "makita-teal";
  if (planId.includes("boss")) return "dewalt-yellow";
  if (planId.includes("power")) return "milwaukee-red";
  if (planId.includes("black")) return "black";
  if (planId.includes("mint")) return "mint-green";
  if (planId.includes("cash")) return "cash-green";
  return "milwaukee-red";
}

// Brand gradients - extracted from reference imagery (tool collages)
// kincrome-blue | ryobi-green | makita-teal | dewalt-yellow | milwaukee-red | black | mint-green
const BRAND_GRADIENTS: Record<COLOR_KEYS, { bg: string; primary: string; primaryLight: string; primaryDark: string; accent: string }> = {
  "kincrome-blue": {
    bg: "linear-gradient(135deg, #2A62B6 0%, #4A7ED4 50%, #2A62B6 100%)",
    primary: "#2A62B6",
    primaryLight: "#4A7ED4",
    primaryDark: "#0047BB",
    accent: "#000000",
  },
  "ryobi-green": {
    bg: "linear-gradient(135deg, #E0FF00 0%, #EBFF33 50%, #E0FF00 100%)",
    primary: "#E0FF00",
    primaryLight: "#EBFF33",
    primaryDark: "#B8E000",
    accent: "#000000",
  },
  "makita-teal": {
    bg: "linear-gradient(135deg, #0B7E88 0%, #00A0AA 40%, #00C5CF 50%, #00A0AA 60%, #0B7E88 100%)",
    primary: "#00A0AA",
    primaryLight: "#00C5CF",
    primaryDark: "#0B7E88",
    accent: "#000000",
  },
  "dewalt-yellow": {
    bg: "linear-gradient(135deg, #FDB813 0%, #FFC933 50%, #FDB813 100%)",
    primary: "#FDB813",
    primaryLight: "#FFC933",
    primaryDark: "#E5A000",
    accent: "#000000",
  },
  "milwaukee-red": {
    bg: "linear-gradient(135deg, #C8102E 0%, #E02D42 50%, #C8102E 100%)",
    primary: "#C8102E",
    primaryLight: "#E02D42",
    primaryDark: "#9a0c24",
    accent: "#000000",
  },
  "boss-red": {
    bg: "linear-gradient(135deg, #ee0000 0%, #ff4444 50%, #ee0000 100%)",
    primary: "#ee0000",
    primaryLight: "#ff4444",
    primaryDark: "#d40000",
    accent: "#000000",
  },
  black: {
    bg: "linear-gradient(135deg, #000000 0%, #050505 40%, #0a0a0a 50%, #050505 60%, #000000 100%)",
    primary: "#D4AF37",
    primaryLight: "#E8C547",
    primaryDark: "#B8860B",
    accent: "#D4AF37",
  },
  "mint-green": {
    bg: "linear-gradient(135deg, #22AA55 0%, #66DD99 50%, #88E8B3 100%)",
    primary: "#66DD99",
    primaryLight: "#88E8B3",
    primaryDark: "#22AA55",
    accent: "#000000",
  },
  "cash-green": {
    bg: "linear-gradient(135deg, #16a34a 0%, #22c55e 50%, #15803d 100%)",
    primary: "#22c55e",
    primaryLight: "#4ade80",
    primaryDark: "#16a34a",
    accent: "#000000",
  },
};

// MembershipSection-only: darker edges, thin light center
const MEMBERSHIP_SECTION_GRADIENTS: Record<COLOR_KEYS, { bgGradient: string; gradient: string; badgeStyle: PackageColorScheme["badgeStyle"] }> = {
  "kincrome-blue": {
    bgGradient: "linear-gradient(135deg, #0047BB 0%, #2A62B6 40%, #4A7ED4 50%, #2A62B6 60%, #0047BB 100%)",
    gradient: "from-[#0047BB] via-[#4A7ED4] to-[#0047BB]",
    badgeStyle: {
      background: "#3A6EC5",
      boxShadow: "0 0 35px rgba(58, 110, 197, 0.75), 0 4px 20px rgba(42, 98, 182, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.75)",
      border: "1px solid rgba(58, 110, 197, 0.95)",
    },
  },
  "ryobi-green": {
    bgGradient: "linear-gradient(135deg, #B8E000 0%, #E0FF00 40%, #EBFF33 50%, #E0FF00 60%, #B8E000 100%)",
    gradient: "from-[#B8E000] via-[#EBFF33] to-[#B8E000]",
    badgeStyle: {
      background: "#D4F000",
      boxShadow: "0 0 28px rgba(212, 240, 0, 0.6), 0 4px 16px rgba(212, 240, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.6)",
      border: "1px solid rgba(212, 240, 0, 0.9)",
    },
  },
  "makita-teal": {
    bgGradient: "linear-gradient(135deg, #0A6B72 0%, #0B7E88 25%, #00A0AA 45%, #00C5CF 50%, #00A0AA 55%, #0B7E88 75%, #0A6B72 100%)",
    gradient: "from-[#0A6B72] via-[#00C5CF] to-[#0A6B72]",
    badgeStyle: {
      background: "#00A0AA",
      boxShadow: "0 0 40px rgba(0, 197, 207, 0.85), 0 4px 24px rgba(10, 126, 136, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.35)",
      border: "1px solid rgba(0, 197, 207, 0.7)",
    },
  },
  "dewalt-yellow": {
    bgGradient: "linear-gradient(135deg, #E5A000 0%, #FDB813 40%, #FFC933 50%, #FDB813 60%, #E5A000 100%)",
    gradient: "from-[#E5A000] via-[#FFC933] to-[#E5A000]",
    badgeStyle: {
      background: "#FFC933",
      boxShadow: "0 0 35px rgba(255, 201, 51, 0.8), 0 4px 20px rgba(229, 160, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.8)",
      border: "1px solid rgba(255, 201, 51, 0.95)",
    },
  },
  "milwaukee-red": {
    bgGradient: "linear-gradient(135deg, #9a0c24 0%, #C8102E 40%, #E02D42 50%, #C8102E 60%, #9a0c24 100%)",
    gradient: "from-[#9a0c24] via-[#E02D42] to-[#9a0c24]",
    badgeStyle: {
      background: "#C8102E",
      boxShadow: "0 0 40px rgba(200, 16, 46, 0.85), 0 4px 20px rgba(200, 16, 46, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.7)",
      border: "1px solid rgba(200, 16, 46, 0.95)",
    },
  },
  "boss-red": {
    bgGradient: "linear-gradient(135deg, #d40000 0%, #ee0000 40%, #ff4444 50%, #ee0000 60%, #d40000 100%)",
    gradient: "from-[#d40000] via-[#ff4444] to-[#d40000]",
    badgeStyle: {
      background: "#ee0000",
      boxShadow: "0 0 40px rgba(238, 0, 0, 0.85), 0 4px 20px rgba(238, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.7)",
      border: "1px solid rgba(238, 0, 0, 0.95)",
    },
  },
  black: {
    bgGradient: "linear-gradient(135deg, #000000 0%, #050505 40%, #0d0d0d 50%, #050505 60%, #000000 100%)",
    gradient: "from-[#000000] via-[#0d0d0d] to-[#000000]",
    badgeStyle: {
      background: "#0a0a0a",
      boxShadow: "0 0 35px rgba(212, 175, 55, 0.15), 0 4px 20px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(212, 175, 55, 0.2)",
      border: "1px solid rgba(212, 175, 55, 0.4)",
    },
  },
  "mint-green": {
    bgGradient: "linear-gradient(135deg, #22AA55 0%, #66DD99 40%, #88E8B3 50%, #66DD99 60%, #22AA55 100%)",
    gradient: "from-[#22AA55] via-[#88E8B3] to-[#22AA55]",
    badgeStyle: {
      background: "#66DD99",
      boxShadow: "0 0 35px rgba(102, 221, 153, 0.7), 0 4px 20px rgba(34, 170, 85, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.5)",
      border: "1px solid rgba(102, 221, 153, 0.9)",
    },
  },
  "cash-green": {
    bgGradient: "linear-gradient(135deg, #15803d 0%, #16a34a 40%, #22c55e 50%, #16a34a 60%, #15803d 100%)",
    gradient: "from-[#16a34a] via-[#22c55e] to-[#15803d]",
    badgeStyle: {
      background: "#22c55e",
      boxShadow: "0 0 35px rgba(34, 197, 94, 0.6), 0 4px 20px rgba(22, 163, 74, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.5)",
      border: "1px solid rgba(34, 197, 94, 0.9)",
    },
  },
};

/**
 * Extract dominant hex from gradient string (Tailwind or CSS)
 */
export function getGradientColor(gradient: string): string {
  // Hex-based gradients (new format)
  const hexMatch = gradient.match(/#[0-9A-Fa-f]{6}/);
  if (hexMatch) return hexMatch[0];

  // Tailwind gradient fallbacks
  if (gradient.includes("yellow-3") || gradient.includes("yellow-4")) return "#facc15";
  if (gradient.includes("blue")) return "#3b82f6";
  if (gradient.includes("purple")) return "#9333ea";
  if (gradient.includes("orange")) return "#f97316";
  if (gradient.includes("yellow-4") && gradient.includes("amber")) return "#fbbf24";
  if (gradient.includes("gray-300") || gradient.includes("slate-400")) return "#94a3b8";
  if (gradient.includes("blue-500") || gradient.includes("blue-600")) return "#3b82f6";
  if (gradient.includes("green-500") || gradient.includes("green-600")) return "#22c55e";
  if (gradient.includes("emerald")) return "#10b981";
  return "#6b7280";
}

/**
 * Map prize slug to color key for theme lookup.
 * Used to derive landing page theme from the selected promotion prize.
 */
export function slugToPromoTierPlanId(slug: string): COLOR_KEYS {
  const s = slug.toLowerCase();
  // Slug format is "toolset-toolbox" — check toolset (prefix) first so e.g. ryobi-milwaukee uses Ryobi theme
  if (s.startsWith("ryobi")) return "ryobi-green";
  if (s.startsWith("dewalt")) return "dewalt-yellow";
  if (s.startsWith("makita")) return "makita-teal";
  if (s.startsWith("milwaukee")) return "milwaukee-red";
  if (s.includes("tradie")) return "ryobi-green";
  if (s.includes("kincrome") || s.includes("apprentice")) return "kincrome-blue";
  if (s.includes("cash")) return "cash-green";
  if (s.includes("black")) return "black";
  if (s.includes("mint") || s.includes("green")) return "mint-green";
  return "milwaukee-red"; // Default for unknown
}

// Extracted from reference images - primary = main brand color from imagery
const LANDING_PAGE_BRAND: Record<COLOR_KEYS, { primary: string; primaryLight: string; primaryDark: string }> = {
  "kincrome-blue": { primary: "#2A62B6", primaryLight: "#4A7ED4", primaryDark: "#0047BB" },
  "ryobi-green": { primary: "#E0FF00", primaryLight: "#EBFF33", primaryDark: "#B8E000" },
  "makita-teal": { primary: "#00A0AA", primaryLight: "#00C5CF", primaryDark: "#0B7E88" },
  "dewalt-yellow": { primary: "#FDB813", primaryLight: "#FFC933", primaryDark: "#E5A000" },
  "milwaukee-red": { primary: "#C8102E", primaryLight: "#E02D42", primaryDark: "#9a0c24" },
  "boss-red": { primary: "#ee0000", primaryLight: "#ff4444", primaryDark: "#d40000" },
  black: { primary: "#D4AF37", primaryLight: "#E8C547", primaryDark: "#B8860B" },
  "mint-green": { primary: "#66DD99", primaryLight: "#88E8B3", primaryDark: "#22AA55" },
  "cash-green": { primary: "#22c55e", primaryLight: "#4ade80", primaryDark: "#16a34a" },
};

// Tools Australia brand red (matches site nav, login, AdminSidebar: #ee0000)
const TOOLS_AUSTRALIA_RED = {
  primary: "#ee0000",
  primaryLight: "#ff4444",
  primaryDark: "#d40000",
  shadowRgba: "rgba(238, 0, 0, 0.6)",
  hoverShadowRgba: "rgba(238, 0, 0, 0.8)",
  borderRgba: "rgba(238, 0, 0, 0.6)",
  gradient: "linear-gradient(90deg, #ee0000 0%, #ff4444 50%, #ee0000 100%)",
  gradientSolid: "linear-gradient(135deg, #d40000 0%, #ee0000 40%, #ff4444 50%, #ee0000 60%, #d40000 100%)",
  gradientRich: "linear-gradient(135deg, #ee0000 0%, #ff4444 25%, #ee0000 50%, #ff4444 75%, #ee0000 100%)",
  badgeStyle: {
    background: "#ee0000",
    boxShadow: "0 0 40px rgba(238, 0, 0, 0.6), 0 4px 20px rgba(238, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.7)",
    border: "1px solid rgba(238, 0, 0, 0.8)",
  },
} as const;

/**
 * Get landing page theme derived from prize slug.
 * Use when the whole promotions landing page should match the prize brand (e.g. dewalt-milwaukee → DeWalt colors).
 * Milwaukee uses Tools Australia brand red for site consistency.
 * Includes primaryLight/primaryDark for richer, more creative gradients and accents.
 */
export function getLandingPageThemeFromSlug(slug: string): {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  gradient: string;
  gradientSolid: string;
  gradientRich: string;
  shadowRgba: string;
  hoverShadowRgba: string;
  borderRgba: string;
  badgeStyle: PackageColorScheme["badgeStyle"];
  accentHex: string;
  preferDarkBackground: boolean;
} {
  // Milwaukee pages use Tools Australia brand red
  if (slug === "milwaukee-milwaukee" || slug === "milwaukee-sidchrome") {
    return {
      ...TOOLS_AUSTRALIA_RED,
      accentHex: TOOLS_AUSTRALIA_RED.primary,
      preferDarkBackground: false,
    };
  }
  const colorKey = slugToPromoTierPlanId(slug);
  const scheme = getPackageColorScheme(colorKey);
  const brand = LANDING_PAGE_BRAND[colorKey] ?? LANDING_PAGE_BRAND["milwaukee-red"];
  const { primary, primaryLight, primaryDark } = brand;
  const preferDarkBackground = slug === "ryobi-sidchrome" || slug === "ryobi-milwaukee";
  return {
    primary,
    primaryLight,
    primaryDark,
    gradient: `linear-gradient(90deg, ${primary} 0%, ${primaryLight} 50%, ${primary} 100%)`,
    gradientSolid: `linear-gradient(90deg, ${primaryDark} 0%, ${primary} 50%, ${primaryDark} 100%)`,
    gradientRich: `linear-gradient(135deg, ${primary} 0%, ${primaryLight} 25%, ${primary} 50%, ${primaryLight} 75%, ${primary} 100%)`,
    shadowRgba: `rgba(${hexToRgbaValues(primary).join(",")}, 0.6)`,
    hoverShadowRgba: `rgba(${hexToRgbaValues(primary).join(",")}, 0.8)`,
    borderRgba: `rgba(${hexToRgbaValues(primary).join(",")}, 0.4)`,
    badgeStyle: scheme.badgeStyle,
    accentHex: primary,
    preferDarkBackground,
  };
}

/**
 * Get badge style for a toolset slug (ryobi, milwaukee, dewalt, makita).
 * Milwaukee uses Tools Australia red (#ee0000) to match Enter Now buttons and promo theme.
 */
export function getToolsetBadgeStyle(toolsetSlug: string): PackageColorScheme["badgeStyle"] {
  if (toolsetSlug === "milwaukee") {
    return getLandingPageThemeFromSlug("milwaukee-milwaukee").badgeStyle;
  }
  const colorKey = slugToPromoTierPlanId(`${toolsetSlug}-milwaukee`);
  return getPackageColorScheme(colorKey).badgeStyle;
}

/** Parse hex (#RRGGBB) to [r, g, b]. Used for RGB/RGBA string generation. */
export function hexToRgbaValues(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

/** Convert hex to rgb(r, g, b) string for CSS. */
export function hexToRgbString(hex: string): string {
  const [r, g, b] = hexToRgbaValues(hex);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Convert hex to rgba(r, g, b, alpha) string for CSS. */
export function hexToRgbaString(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgbaValues(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Get promo primary theme for generic CTAs when no slug context exists.
 * Uses Tools Australia brand red for urgency/action.
 */
export function getPromoPrimaryTheme() {
  return {
    ...TOOLS_AUSTRALIA_RED,
    accentHex: TOOLS_AUSTRALIA_RED.primary,
    preferDarkBackground: false,
  };
}

/** Membership tab: apprentice=tradie=makita, foreman=dewalt, boss=Tools Australia red, power=milwaukee (split-test winner) */
const MEMBERSHIP_TAB_COLOR_MAP: Record<string, COLOR_KEYS> = {
  "apprentice-pack": "makita-teal",
  "tradie-pack": "makita-teal",
  "foreman-pack": "dewalt-yellow",
  "boss-pack": "boss-red",
  "power-pack": "milwaukee-red",
};

/** One-time tab: kincrome, ryobi, makita, dewalt, milwaukee (split-test winner) */
const ONE_TIME_TAB_COLOR_MAP: Record<string, COLOR_KEYS> = {
  "apprentice-pack": "kincrome-blue",
  "tradie-pack": "ryobi-green",
  "foreman-pack": "makita-teal",
  "boss-pack": "dewalt-yellow",
  "power-pack": "milwaukee-red",
};

/**
 * Minimal shape for variant config used by package color resolver.
 * Avoids circular dependency with Variant model.
 */
export type PackageColorsVariantConfig = {
  packageColors?: {
    oneTime?: Partial<Record<string, COLOR_KEYS>>;
    membership?: Partial<Record<string, COLOR_KEYS>>;
  };
} | null | undefined;

/** Normalize planId to slot key for package color lookup */
function planIdToSlotKey(planId: string, isMembershipTab: boolean): string {
  const lower = planId.toLowerCase();
  if (lower.includes("apprentice")) return "apprentice-pack";
  if (lower.includes("tradie")) return "tradie-pack";
  if (lower.includes("foreman")) return "foreman-pack";
  if (lower.includes("boss")) return "boss-pack";
  if (lower.includes("power")) return "power-pack";
  if (!isMembershipTab) {
    if (lower.includes("black")) return "black-pack";
    if (lower.includes("mint")) return "mint-pack";
    if (lower.includes("cash")) return "cash-prize";
  }
  return "power-pack";
}

/**
 * Get package color scheme for promotions page, respecting A/B test variant overrides.
 * When variantConfig.packageColors has an override for the slot, uses that COLOR_KEY.
 * Otherwise falls back to getMembershipSectionColorScheme (default behavior).
 */
export function getPackageColorSchemeForPromo(
  planId: string,
  isMembershipTab: boolean,
  variantConfig?: PackageColorsVariantConfig
): PackageColorScheme {
  const slot = planIdToSlotKey(planId, isMembershipTab);
  const override = variantConfig?.packageColors
    ? (isMembershipTab
        ? variantConfig.packageColors.membership?.[slot]
        : variantConfig.packageColors.oneTime?.[slot])
    : undefined;

  if (override) {
    const base = getPackageColorScheme(override);
    const overrides = MEMBERSHIP_SECTION_GRADIENTS[override as COLOR_KEYS];
    return overrides ? { ...base, ...overrides } : base;
  }

  return getMembershipSectionColorScheme(planId, isMembershipTab);
}

/**
 * Get MembershipSection-specific color scheme.
 * - Membership tab: uses MEMBERSHIP_TAB_COLOR_MAP
 * - One-time tab: uses ONE_TIME_TAB_COLOR_MAP (kincrome, ryobi, makita, dewalt, milwaukee)
 */
export function getMembershipSectionColorScheme(planId: string, isMembershipTab: boolean): PackageColorScheme {
  const packKey =
    planId.includes("apprentice") ? "apprentice-pack" :
    planId.includes("tradie") ? "tradie-pack" :
    planId.includes("foreman") ? "foreman-pack" :
    planId.includes("boss") ? "boss-pack" :
    planId.includes("power") ? "power-pack" : "power-pack";
  const colorKey = isMembershipTab
    ? (MEMBERSHIP_TAB_COLOR_MAP[packKey] ?? toColorKey(packKey))
    : (ONE_TIME_TAB_COLOR_MAP[packKey] ?? toColorKey(packKey));
  const base = getPackageColorScheme(colorKey);
  const overrides = MEMBERSHIP_SECTION_GRADIENTS[colorKey];
  if (!overrides) return base;
  return { ...base, ...overrides };
}

/**
 * Get border style for package-themed cards/icons. Uses golden gradient for black theme when available.
 * @param colorScheme - The package color scheme
 * @param innerBackground - Background for the inner (padding) area, e.g. colorScheme.bgGradient or "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)"
 * @returns CSS properties for border (gradient or solid accent)
 */
export function getCardBorderStyle(
  colorScheme: PackageColorScheme,
  innerBackground: string
): Record<string, string | number> {
  if (colorScheme.cardBorderGradient) {
    return {
      background: `${innerBackground}, ${colorScheme.cardBorderGradient}`,
      backgroundOrigin: "padding-box, border-box",
      backgroundClip: "padding-box, border-box",
      WebkitBackgroundClip: "padding-box, border-box",
      backgroundRepeat: "no-repeat",
      border: "2px solid transparent",
    };
  }
  return {
    border: `2px solid ${colorScheme.accentHex}${colorScheme.cardBorderOpacity || "CC"}`,
  };
}

/**
 * Derive planId from package data for use with getMembershipSectionColorScheme / getLandingPageThemeFromPlanId.
 * - If packageData has _id, uses it when it looks like a plan id (contains known keywords).
 * - Otherwise derives from name + membershipType (e.g. "Tradie" + subscription → tradie-subscription).
 */
export function derivePlanIdFromPackage(
  packageData: { _id?: string; name: string; type?: "subscription" | "one-time" },
  membershipType?: "subscription" | "one-time"
): string {
  const id = packageData._id;
  if (id && typeof id === "string") {
    const lower = id.toLowerCase();
    if (
      lower.includes("tradie") ||
      lower.includes("boss") ||
      lower.includes("foreman") ||
      lower.includes("power") ||
      lower.includes("apprentice")
    ) {
      return lower;
    }
  }
  const type = membershipType ?? packageData.type;
  const name = (packageData.name || "").toLowerCase();
  const suffix = type === "subscription" ? "-subscription" : "-pack";
  if (name.includes("apprentice")) return `apprentice${suffix}`;
  if (name.includes("tradie")) return `tradie${suffix}`;
  if (name.includes("foreman")) return `foreman${suffix}`;
  if (name.includes("boss")) return `boss${suffix}`;
  if (name.includes("power")) return `power-pack`;
  return "power-pack";
}

/**
 * Get landing page theme from plan ID and membership type.
 * Use when theming based on user's active package (e.g. Partner Discounts section, UnlockDiscounts).
 */
export function getLandingPageThemeFromPlanId(planId: string, isMembershipTab: boolean): {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  gradient: string;
  gradientSolid: string;
  gradientRich: string;
  shadowRgba: string;
  hoverShadowRgba: string;
  borderRgba: string;
  badgeStyle: PackageColorScheme["badgeStyle"];
  accentHex: string;
  preferDarkBackground: boolean;
} {
  const scheme = getMembershipSectionColorScheme(planId, isMembershipTab);
  const packKey =
    planId.includes("apprentice") ? "apprentice-pack" :
    planId.includes("tradie") ? "tradie-pack" :
    planId.includes("foreman") ? "foreman-pack" :
    planId.includes("boss") ? "boss-pack" :
    planId.includes("power") ? "power-pack" : "power-pack";
  const colorKey = isMembershipTab
    ? (MEMBERSHIP_TAB_COLOR_MAP[packKey] ?? toColorKey(packKey))
    : (ONE_TIME_TAB_COLOR_MAP[packKey] ?? toColorKey(packKey));
  const brand = LANDING_PAGE_BRAND[colorKey] ?? LANDING_PAGE_BRAND["milwaukee-red"];
  const { primary, primaryLight, primaryDark } = brand;
  const preferDarkBackground = colorKey === "ryobi-green";
  return {
    primary,
    primaryLight,
    primaryDark,
    gradient: `linear-gradient(90deg, ${primary} 0%, ${primaryLight} 50%, ${primary} 100%)`,
    gradientSolid: `linear-gradient(90deg, ${primaryDark} 0%, ${primary} 50%, ${primaryDark} 100%)`,
    gradientRich: `linear-gradient(135deg, ${primary} 0%, ${primaryLight} 25%, ${primary} 50%, ${primaryLight} 75%, ${primary} 100%)`,
    shadowRgba: `rgba(${hexToRgbaValues(primary).join(",")}, 0.6)`,
    hoverShadowRgba: `rgba(${hexToRgbaValues(primary).join(",")}, 0.8)`,
    borderRgba: `rgba(${hexToRgbaValues(primary).join(",")}, 0.4)`,
    badgeStyle: scheme.badgeStyle,
    accentHex: primary,
    preferDarkBackground,
  };
}

/**
 * Get glow color for MembershipSection cards.
 * - Membership tab: use MEMBERSHIP_TAB_COLOR_MAP
 * - One-time tab: use ONE_TIME_TAB_COLOR_MAP
 */
export function getMembershipSectionGlowColor(planId: string, isMembershipTab: boolean): string {
  const packKey =
    planId.includes("apprentice") ? "apprentice-pack" :
    planId.includes("tradie") ? "tradie-pack" :
    planId.includes("foreman") ? "foreman-pack" :
    planId.includes("boss") ? "boss-pack" :
    planId.includes("power") ? "power-pack" : "power-pack";
  const colorKey = isMembershipTab
    ? (MEMBERSHIP_TAB_COLOR_MAP[packKey] ?? toColorKey(packKey))
    : (ONE_TIME_TAB_COLOR_MAP[packKey] ?? toColorKey(packKey));
  return getPackageGlowColor(colorKey);
}

/**
 * Get package glow colors for inside-card overlay
 */
export function getPackageGlowColor(planIdOrColorKey: string): string {
  const key = toColorKey(planIdOrColorKey);
  switch (key) {
    case "kincrome-blue": return "from-[#2A62B6]/20 via-[#000000]/8 to-transparent";
    case "ryobi-green": return "from-[#E0FF00]/18 via-[#000000]/8 to-transparent";
    case "makita-teal": return "from-[#00A0AA]/22 via-[#000000]/8 to-transparent";
    case "dewalt-yellow": return "from-[#FDB813]/20 via-[#000000]/8 to-transparent";
    case "milwaukee-red": return "from-[#C8102E]/20 via-[#000000]/8 to-transparent";
    case "boss-red": return "from-[#ee0000]/20 via-[#000000]/8 to-transparent";
    case "black": return "from-[#D4AF37]/15 via-[#000000]/8 to-transparent";
    case "mint-green": return "from-[#66DD99]/20 via-[#000000]/8 to-transparent";
    case "cash-green": return "from-[#22c55e]/20 via-[#000000]/8 to-transparent";
    default: return "from-gray-500/10 via-gray-500/2.5 to-transparent";
  }
}

/** RGB channel tuple for brand glow/border */
type BrandRgb = { r: number; g: number; b: number };

/**
 * Glass panel style for price badge (neutral dark layer, not brand-tinted).
 * Background is neutral dark glass so the panel reads as a distinct layer;
 * brand color appears only on border + glow. Avoids "muddy overlay" on bright cards.
 */
function createPanelStyle(brandRgb: BrandRgb, borderOpacity = 0.5): PanelStyle {
  const { r, g, b } = brandRgb;
  return {
    background: "rgba(0,0,0,0.55)",
    border: `1px solid rgba(${r},${g},${b},${borderOpacity})`,
    color: "#fff",
    boxShadow: `0 0 16px rgba(${r},${g},${b},0.15), inset 0 1px 0 rgba(255,255,255,0.08)`,
    backdropFilter: "blur(8px)",
  };
}

/** Full color schemes keyed by COLOR_KEYS */
const SCHEMES: Record<COLOR_KEYS, PackageColorScheme> = {
  "kincrome-blue": {
    bgGradient: BRAND_GRADIENTS["kincrome-blue"].bg,
    gradient: "from-[#2A62B6] via-[#4A7ED4] to-[#2A62B6]",
    text: "text-white",
    textMuted: "text-white/90",
    textOnLight: "text-slate-700",
    featureOnLight: "text-gray-700",
    priceText: "text-white",
    priceBadgeBg: "bg-white/25 backdrop-blur-sm",
    buttonBg: "bg-[#0047BB] hover:bg-[#2A62B6] active:scale-[0.98] border border-white/10",
    buttonShadow: "shadow-[0_2px_8px_rgba(0,0,0,0.15)]",
    buttonHoverShadow: "hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]",
    buttonText: "text-white",
    glow: "drop-shadow-[0_0_16px_rgba(42,98,182,0.7)]",
    border: "border-[#2A62B6]/50",
    shadow: "shadow-[#2A62B6]/50",
    hoverShadow: "hover:shadow-[#2A62B6]/70",
    borderGlow: "animate-border-glow-silver",
    badgeStyle: {
      background: "#3A6EC5",
      boxShadow: "0 0 35px rgba(58, 110, 197, 0.75), 0 4px 20px rgba(42, 98, 182, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.75)",
      border: "1px solid rgba(58, 110, 197, 0.95)",
    },
    enterNowButtonStyle: createPanelStyle({ r: 42, g: 98, b: 182 }),
    ctaGradientButtonBorder: "border border-white/30",
    accentHex: BRAND_GRADIENTS["kincrome-blue"].primary,
    accentHexLight: "#60A5FA",
    changeButtonTextWhite: true,
    entriesText: "text-white",
    cardBorderOpacity: "CC",
    barColor: "bg-gradient-to-r from-[#2A62B6] via-[#4A7ED4] to-[#2A62B6]",
    barColorLight: "bg-gradient-to-r from-[#4A7ED4] via-[#2A62B6] to-[#4A7ED4]",
    barColorVertical: "bg-gradient-to-t from-[#2A62B6] via-[#4A7ED4] to-[#2A62B6]",
    barColorLightVertical: "bg-gradient-to-t from-[#4A7ED4] via-[#2A62B6] to-[#4A7ED4]",
    barGradientCss: "linear-gradient(to top, #2A62B6 0%, #4A7ED4 50%, #2A62B6 100%)",
  },
  "ryobi-green": {
    bgGradient: BRAND_GRADIENTS["ryobi-green"].bg,
    gradient: "from-[#E0FF00] via-[#EBFF33] to-[#E0FF00]",
    text: "text-black",
    textMuted: "text-black/80",
    textOnLight: "text-[#3d4d1a]",
    featureOnLight: "text-gray-700",
    priceText: "text-black",
    priceBadgeBg: "bg-white/30 backdrop-blur-sm",
    priceBadgeBorder: "border-2 border-[#E0FF00]",
    buttonBg: "bg-[#E0FF00] hover:bg-[#B8E000] active:scale-[0.98] border-2 border-[#000000]",
    buttonShadow: "shadow-[0_2px_8px_rgba(0,0,0,0.2),0_0_12px_rgba(224,255,0,0.35)]",
    buttonHoverShadow: "hover:shadow-[0_4px_12px_rgba(0,0,0,0.25),0_0_18px_rgba(224,255,0,0.5)]",
    buttonText: "text-black",
    glow: "drop-shadow-[0_0_16px_rgba(224,255,0,0.6)]",
    border: "border-[#E0FF00]/50",
    shadow: "shadow-[#E0FF00]/40",
    hoverShadow: "hover:shadow-[#E0FF00]/55",
    borderGlow: "animate-border-glow-ryobi",
    badgeStyle: {
      background: "#D4F000",
      boxShadow: "0 0 28px rgba(212, 240, 0, 0.6), 0 4px 16px rgba(212, 240, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.6)",
      border: "1px solid rgba(212, 240, 0, 0.9)",
    },
    enterNowButtonStyle: createPanelStyle({ r: 224, g: 255, b: 0 }, 0.45),
    ctaGradientButtonBorder: "border border-gray-300",
    enterNowButtonTextClass: "text-black",
    accentHex: BRAND_GRADIENTS["ryobi-green"].primary,
    changeButtonTextWhite: true,
    entriesText: "text-black",
    cardBorderOpacity: "CC",
    barColor: "bg-gradient-to-r from-[#E0FF00] via-[#EBFF33] to-[#E0FF00]",
    barColorLight: "bg-gradient-to-r from-[#EBFF33] via-[#E0FF00] to-[#EBFF33]",
    barColorVertical: "bg-gradient-to-t from-[#E0FF00] via-[#EBFF33] to-[#E0FF00]",
    barColorLightVertical: "bg-gradient-to-t from-[#EBFF33] via-[#E0FF00] to-[#EBFF33]",
    barGradientCss: "linear-gradient(to top, #E0FF00 0%, #EBFF33 50%, #E0FF00 100%)",
  },
  "makita-teal": {
    bgGradient: BRAND_GRADIENTS["makita-teal"].bg,
    gradient: "from-[#0B7E88] via-[#00C5CF] to-[#0B7E88]",
    text: "text-white",
    textMuted: "text-white/90",
    textOnLight: "text-[#006068]",
    featureOnLight: "text-gray-700",
    priceText: "text-white",
    priceBadgeBg: "bg-white/15 backdrop-blur-sm",
    buttonBg: "bg-[#0B7E88] hover:bg-[#00A0AA] active:scale-[0.98] border border-white/20",
    buttonShadow: "shadow-[0_2px_8px_rgba(0,0,0,0.2)]",
    buttonHoverShadow: "hover:shadow-[0_4px_12px_rgba(0,197,207,0.35)]",
    buttonText: "text-white",
    glow: "drop-shadow-[0_0_18px_rgba(0,197,207,0.65)]",
    border: "border-[#00C5CF]/50",
    shadow: "shadow-[#00C5CF]/35",
    hoverShadow: "hover:shadow-[#00C5CF]/55",
    borderGlow: "animate-border-glow-makita",
    badgeStyle: {
      background: "#00A0AA",
      boxShadow: "0 0 40px rgba(0, 197, 207, 0.75), 0 0 60px rgba(0, 197, 207, 0.4), 0 4px 20px rgba(11, 126, 136, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.4)",
      border: "1px solid rgba(255, 255, 255, 0.5)",
    },
    enterNowButtonStyle: createPanelStyle({ r: 0, g: 197, b: 207 }),
    ctaGradientButtonBorder: "border border-white/30",
    accentHex: BRAND_GRADIENTS["makita-teal"].primaryLight,
    entriesText: "text-white",
    cardBorderOpacity: "CC",
    textGradientStyle: {
      backgroundImage: "linear-gradient(135deg, #FFFFFF 0%, #E8FFFF 20%, #C8F8FA 40%, #9EE8F0 60%, #7DDFE8 80%, #5DD4E0 100%)",
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      WebkitTextFillColor: "transparent",
      color: "transparent",
    },
    packageInclusionTextStyle: {
      backgroundImage: "linear-gradient(135deg, #5DD4E0 0%, #7DDFE8 25%, #9EE8F0 50%, #C8F8FA 75%, #E8FFFF 100%)",
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      WebkitTextFillColor: "transparent",
      color: "transparent",
    },
    barColor: "bg-gradient-to-r from-[#0B7E88] via-[#00C5CF] to-[#0B7E88]",
    barColorLight: "bg-gradient-to-r from-[#00A0AA] via-[#00C5CF] to-[#00A0AA]",
    barColorVertical: "bg-gradient-to-t from-[#0B7E88] via-[#00C5CF] to-[#0B7E88]",
    barColorLightVertical: "bg-gradient-to-t from-[#00A0AA] via-[#00C5CF] to-[#0B7E88]",
    barGradientCss: "linear-gradient(to top, #0B7E88 0%, #00C5CF 50%, #00A0AA 100%)",
  },
  "dewalt-yellow": {
    bgGradient: BRAND_GRADIENTS["dewalt-yellow"].bg,
    gradient: "from-[#FDB813] via-[#FFC933] to-[#FDB813]",
    text: "text-black",
    textMuted: "text-black/80",
    textOnLight: "text-[#5c4000]",
    featureOnLight: "text-gray-700",
    priceText: "text-black",
    priceBadgeBg: "bg-white/25 backdrop-blur-sm",
    priceBadgeBorder: "border-2 border-[#FFC933]",
    buttonBg: "bg-[#FDB813] hover:bg-[#E5A000] active:scale-[0.98] border-2 border-[#000000]",
    buttonShadow: "shadow-[0_2px_8px_rgba(0,0,0,0.2)]",
    buttonHoverShadow: "hover:shadow-[0_4px_12px_rgba(0,0,0,0.25)]",
    buttonText: "text-black",
    glow: "drop-shadow-[0_0_18px_rgba(253,184,19,0.8)]",
    border: "border-[#FDB813]/55",
    shadow: "shadow-[#FDB813]/45",
    hoverShadow: "hover:shadow-[#FDB813]/65",
    borderGlow: "animate-border-glow-dewalt",
    badgeStyle: {
      background: "#FFC933",
      boxShadow: "0 0 35px rgba(255, 201, 51, 0.8), 0 4px 20px rgba(229, 160, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.8)",
      border: "1px solid rgba(255, 201, 51, 0.95)",
    },
    enterNowButtonStyle: createPanelStyle({ r: 253, g: 184, b: 19 }),
    ctaGradientButtonBorder: "border border-gray-300",
    accentHex: BRAND_GRADIENTS["dewalt-yellow"].primary,
    changeButtonTextWhite: true,
    enterNowButtonTextClass: "text-black",
    entriesText: "text-black",
    cardBorderOpacity: "CC",
    barColor: "bg-gradient-to-r from-[#FDB813] via-[#FFC933] to-[#FDB813]",
    barColorLight: "bg-gradient-to-r from-[#FFC933] via-[#FDB813] to-[#FFC933]",
    barColorVertical: "bg-gradient-to-t from-[#FDB813] via-[#FFC933] to-[#FDB813]",
    barColorLightVertical: "bg-gradient-to-t from-[#FFC933] via-[#FDB813] to-[#FFC933]",
    barGradientCss: "linear-gradient(to top, #FDB813 0%, #FFC933 50%, #FDB813 100%)",
  },
  "milwaukee-red": {
    bgGradient: BRAND_GRADIENTS["milwaukee-red"].bg,
    gradient: "from-[#C8102E] via-[#E02D42] to-[#C8102E]",
    text: "text-white",
    textMuted: "text-white/90",
    textOnLight: "text-[#6a0a1a]",
    featureOnLight: "text-gray-700",
    priceText: "text-white",
    priceBadgeBg: "bg-white/25 backdrop-blur-sm",
    buttonBg: "bg-[#000000] hover:bg-[#C8102E] active:scale-[0.98] border border-white/10",
    buttonShadow: "shadow-[0_2px_8px_rgba(0,0,0,0.2)]",
    buttonHoverShadow: "hover:shadow-[0_4px_12px_rgba(0,0,0,0.25)]",
    buttonText: "text-white",
    glow: "drop-shadow-[0_0_20px_rgba(200,16,46,0.85)]",
    border: "border-[#C8102E]/55",
    shadow: "shadow-[#C8102E]/50",
    hoverShadow: "hover:shadow-[#C8102E]/70",
    borderGlow: "animate-border-glow-milwaukee",
    badgeStyle: {
      background: "#C8102E",
      boxShadow: "0 0 40px rgba(200, 16, 46, 0.85), 0 4px 20px rgba(200, 16, 46, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.7)",
      border: "1px solid rgba(200, 16, 46, 0.95)",
    },
    enterNowButtonStyle: createPanelStyle({ r: 200, g: 16, b: 46 }),
    ctaGradientButtonBorder: "border border-white/30",
    accentHex: BRAND_GRADIENTS["milwaukee-red"].primary,
    accentHexLight: "#FF4757",
    entriesText: "text-white",
    cardBorderOpacity: "CC",
    barColor: "bg-gradient-to-r from-[#C8102E] via-[#E02D42] to-[#C8102E]",
    barColorLight: "bg-gradient-to-r from-[#E02D42] via-[#C8102E] to-[#E02D42]",
    barColorVertical: "bg-gradient-to-t from-[#C8102E] via-[#E02D42] to-[#C8102E]",
    barColorLightVertical: "bg-gradient-to-t from-[#E02D42] via-[#C8102E] to-[#E02D42]",
    barGradientCss: "linear-gradient(to top, #C8102E 0%, #E02D42 50%, #C8102E 100%)",
  },
  "boss-red": {
    bgGradient: BRAND_GRADIENTS["boss-red"].bg,
    gradient: "from-[#ee0000] via-[#ff4444] to-[#ee0000]",
    text: "text-white",
    textMuted: "text-white/90",
    textOnLight: "text-[#6a0a0a]",
    featureOnLight: "text-gray-700",
    priceText: "text-white",
    priceBadgeBg: "bg-white/25 backdrop-blur-sm",
    buttonBg: "bg-[#000000] hover:bg-[#ee0000] active:scale-[0.98] border border-white/10",
    buttonShadow: "shadow-[0_2px_8px_rgba(0,0,0,0.2)]",
    buttonHoverShadow: "hover:shadow-[0_4px_12px_rgba(0,0,0,0.25)]",
    buttonText: "text-white",
    glow: "drop-shadow-[0_0_20px_rgba(238,0,0,0.85)]",
    border: "border-[#ee0000]/55",
    shadow: "shadow-[#ee0000]/50",
    hoverShadow: "hover:shadow-[#ee0000]/70",
    borderGlow: "animate-border-glow-boss-red",
    badgeStyle: {
      background: "#ee0000",
      boxShadow: "0 0 40px rgba(238, 0, 0, 0.85), 0 4px 20px rgba(238, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.7)",
      border: "1px solid rgba(238, 0, 0, 0.95)",
    },
    enterNowButtonStyle: createPanelStyle({ r: 238, g: 0, b: 0 }),
    ctaGradientButtonBorder: "border border-white/30",
    accentHex: BRAND_GRADIENTS["boss-red"].primary,
    accentHexLight: "#ff4444",
    entriesText: "text-white",
    cardBorderOpacity: "CC",
    barColor: "bg-gradient-to-r from-[#ee0000] via-[#ff4444] to-[#ee0000]",
    barColorLight: "bg-gradient-to-r from-[#ff4444] via-[#ee0000] to-[#ff4444]",
    barColorVertical: "bg-gradient-to-t from-[#ee0000] via-[#ff4444] to-[#ee0000]",
    barColorLightVertical: "bg-gradient-to-t from-[#ff4444] via-[#ee0000] to-[#ff4444]",
    barGradientCss: "linear-gradient(to top, #ee0000 0%, #ff4444 50%, #ee0000 100%)",
  },
  black: {
    bgGradient: BRAND_GRADIENTS.black.bg,
    gradient: "from-[#000000] via-[#0d0d0d] to-[#000000]",
    text: "text-premium-gold",
    textMuted: "text-premium-gold/90",
    textOnLight: "text-gray-700",
    featureOnLight: "text-gray-700",
    priceText: "text-premium-gold",
    priceBadgeBg: "bg-white/15 backdrop-blur-sm",
    buttonBg: "bg-[#0a0a0a] hover:bg-[#141414] active:scale-[0.98] border border-premium-gold/40",
    buttonShadow: "shadow-[0_2px_8px_rgba(0,0,0,0.4)]",
    buttonHoverShadow: "hover:shadow-[0_4px_16px_rgba(212,175,55,0.25)]",
    buttonText: "text-premium-gold",
    glow: "drop-shadow-[0_0_16px_rgba(212,175,55,0.3)]",
    border: "border-premium-gold/40",
    shadow: "shadow-[#D4AF37]/20",
    hoverShadow: "hover:shadow-[#D4AF37]/30",
    borderGlow: "animate-border-glow-silver",
    badgeStyle: {
      background: "#0a0a0a",
      boxShadow: "0 0 35px rgba(212, 175, 55, 0.15), 0 4px 20px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(212, 175, 55, 0.2)",
      border: "1px solid rgba(212, 175, 55, 0.4)",
    },
    accentHex: "#D4AF37",
    entriesText: "text-premium-gold",
    cardBorderOpacity: "CC",
    textGradientStyle: {
      backgroundImage: "linear-gradient(135deg, #FFF8E7 0%, #FFE55C 18%, #D4AF37 38%, #E5A000 58%, #B8860B 78%, #6B4423 100%)",
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      WebkitTextFillColor: "transparent",
      color: "transparent",
    },
    cardBorderGradient: "linear-gradient(135deg, #FFF8E7 0%, #FFE55C 18%, #D4AF37 38%, #E5A000 58%, #B8860B 78%, #6B4423 100%)",
    packageInclusionTextStyle: {
      backgroundImage: "linear-gradient(135deg, #6B4423 0%, #B8860B 25%, #D4AF37 50%, #E5A000 75%, #FFE55C 100%)",
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      WebkitTextFillColor: "transparent",
      color: "transparent",
    },
    barColor: "bg-gradient-to-r from-[#000000] via-[#1a1a1a] to-[#000000]",
    barColorLight: "bg-gradient-to-r from-[#1a1a1a] via-[#2d2d2d] to-[#1a1a1a]",
    barColorVertical: "bg-gradient-to-t from-[#000000] via-[#1a1a1a] to-[#000000]",
    barColorLightVertical: "bg-gradient-to-t from-[#1a1a1a] via-[#2d2d2d] to-[#1a1a1a]",
    barGradientCss: "linear-gradient(to top, #000000 0%, #1a1a1a 50%, #2d2d2d 100%)",
  },
  "mint-green": {
    bgGradient: BRAND_GRADIENTS["mint-green"].bg,
    gradient: "from-[#22AA55] via-[#66DD99] to-[#88E8B3]",
    text: "text-black",
    textMuted: "text-black/80",
    textOnLight: "text-[#1a5c2e]",
    featureOnLight: "text-gray-700",
    priceText: "text-black",
    priceBadgeBg: "bg-white/25 backdrop-blur-sm",
    buttonBg: "bg-[#000000] hover:bg-[#22AA55] active:scale-[0.98] border border-white/20",
    buttonShadow: "shadow-[0_2px_8px_rgba(0,0,0,0.2)]",
    buttonHoverShadow: "hover:shadow-[0_4px_16px_rgba(102,221,153,0.4)]",
    buttonText: "text-white",
    glow: "drop-shadow-[0_0_16px_rgba(102,221,153,0.6)]",
    border: "border-[#66DD99]/50",
    shadow: "shadow-[#66DD99]/40",
    hoverShadow: "hover:shadow-[#66DD99]/55",
    borderGlow: "animate-border-glow-green",
    badgeStyle: {
      background: "#66DD99",
      boxShadow: "0 0 35px rgba(102, 221, 153, 0.7), 0 4px 20px rgba(34, 170, 85, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.5)",
      border: "1px solid rgba(102, 221, 153, 0.9)",
    },
    accentHex: BRAND_GRADIENTS["mint-green"].primary,
    entriesText: "text-black",
    cardBorderOpacity: "CC",
    barColor: "bg-gradient-to-r from-[#22AA55] via-[#66DD99] to-[#88E8B3]",
    barColorLight: "bg-gradient-to-r from-[#66DD99] via-[#88E8B3] to-[#66DD99]",
    barColorVertical: "bg-gradient-to-t from-[#22AA55] via-[#66DD99] to-[#88E8B3]",
    barColorLightVertical: "bg-gradient-to-t from-[#66DD99] via-[#88E8B3] to-[#66DD99]",
    barGradientCss: "linear-gradient(to top, #22AA55 0%, #66DD99 50%, #88E8B3 100%)",
  },
  "cash-green": {
    bgGradient: BRAND_GRADIENTS["cash-green"].bg,
    gradient: "from-[#22c55e] via-[#4ade80] to-[#16a34a]",
    text: "text-white",
    textMuted: "text-white/90",
    textOnLight: "text-[#14532d]",
    featureOnLight: "text-gray-700",
    priceText: "text-white",
    priceBadgeBg: "bg-white/25 backdrop-blur-sm",
    buttonBg: "bg-[#16a34a] hover:bg-[#22c55e] active:scale-[0.98] border border-white/20",
    buttonShadow: "shadow-[0_2px_8px_rgba(0,0,0,0.2),0_0_12px_rgba(34,197,94,0.35)]",
    buttonHoverShadow: "hover:shadow-[0_4px_16px_rgba(34,197,94,0.5)]",
    buttonText: "text-white",
    glow: "drop-shadow-[0_0_16px_rgba(34,197,94,0.6)]",
    border: "border-[#22c55e]/50",
    shadow: "shadow-[#22c55e]/40",
    hoverShadow: "hover:shadow-[#22c55e]/55",
    borderGlow: "animate-border-glow-green",
    badgeStyle: {
      background: "#22c55e",
      boxShadow: "0 0 35px rgba(34, 197, 94, 0.6), 0 4px 20px rgba(22, 163, 74, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.5)",
      border: "1px solid rgba(34, 197, 94, 0.9)",
    },
    accentHex: BRAND_GRADIENTS["cash-green"].primary,
    entriesText: "text-white",
    cardBorderOpacity: "CC",
    barColor: "bg-gradient-to-r from-[#16a34a] via-[#22c55e] to-[#15803d]",
    barColorLight: "bg-gradient-to-r from-[#22c55e] via-[#4ade80] to-[#22c55e]",
    barColorVertical: "bg-gradient-to-t from-[#16a34a] via-[#22c55e] to-[#15803d]",
    barColorLightVertical: "bg-gradient-to-t from-[#22c55e] via-[#4ade80] to-[#16a34a]",
    barGradientCss: "linear-gradient(to top, #16a34a 0%, #22c55e 50%, #15803d 100%)",
  },
};

/**
 * Get full package color scheme. Accepts plan ID (apprentice-pack, tradie-pack, etc.) or color key (kincrome-blue, ryobi-green, etc.)
 */
export function getPackageColorScheme(planIdOrColorKey: string): PackageColorScheme {
  const key = toColorKey(planIdOrColorKey);
  const base = SCHEMES[key];
  const overrides = MEMBERSHIP_SECTION_GRADIENTS[key];
  if (!overrides) return base;
  return { ...base, ...overrides };
}
