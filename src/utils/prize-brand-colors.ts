/**
 * Brand color mapping utility for prize toggles
 * Maps prize slugs to their corresponding brand gradient classes
 * Used in PrizeShowcase component
 * Derives power-toolset colors from packageColorScheme (single source of truth)
 * Milwaukee uses Tools Australia brand red (#ee0000) for site consistency
 */

import type { CSSProperties } from "react";
import type { PrizeSlug } from "@/config/prizes";
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
  gradient: "from-[#d40000] via-[#ee0000] to-[#ff4444]",
  borderColor: "border-[#ee0000]",
  shadowColor: "shadow-[0_0_20px_rgba(238,0,0,0.4)]",
  textColor: "text-white",
  subtitleTextColor: "text-white/90",
  checkmarkColor: "text-[#ee0000]",
  hoverBorderColor: "hover:border-[#ff4444]",
  hoverTextColor: "hover:text-[#ee0000]",
} as const;

/**
 * Modal surface tints: Milwaukee keeps Tools Australia red (same as landing).
 * Makita / DeWalt / Ryobi use BRAND_THEMES light vs dark ramps so app dark mode matches Milwaukee-style mood.
 */
function getPowerToolModalPrimaries(slug: PrizeSlug, isDark: boolean): {
  primary: string;
  primaryLight: string;
  primaryDark: string;
} {
  if (slug === "milwaukee-sidchrome" || slug === "milwaukee-milwaukee" || slug === "milwaukee-kincrome") {
    const t = getLandingPageThemeFromSlug(slug);
    return { primary: t.primary, primaryLight: t.primaryLight, primaryDark: t.primaryDark };
  }
  const brandKey = slugToBrandKey(slug);
  if (!brandKey) {
    const t = getLandingPageThemeFromSlug(slug);
    return { primary: t.primary, primaryLight: t.primaryLight, primaryDark: t.primaryDark };
  }
  const theme = BRAND_THEMES[brandKey];
  if (isDark) {
    const d = getBrandColors(brandKey, "dark");
    return {
      primary: d.primary,
      primaryLight: d.secondary,
      primaryDark: d.accent,
    };
  }
  const l = getBrandColors(brandKey, "light");
  return {
    primary: l.primary,
    primaryLight: l.secondary,
    primaryDark: theme.dark.primary,
  };
}

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
/**
 * Theme tokens for PrizeSpecificationsModal: brand-tinted surfaces + text pairs that keep contrast
 * (no white-on-white / black-on-black) in both light and dark app theme.
 */
export type PrizeSpecificationsModalTheme = {
  /** Base text color for the modal body so inherited text never picks wrong polarity from ancestors */
  contentRootClass: string;
  canvasStyle: CSSProperties;
  titleClass: string;
  bodyClass: string;
  mutedClass: string;
  cardClass: string;
  cardHoverClass: string;
  emptyStateClass: string;
  tabInactiveStyle: CSSProperties;
  tabInactiveTextClass: string;
  tabInactiveHoverClass: string;
  tabBadgeInactiveClass: string;
  summaryTextClass: string;
  specBarStyle: CSSProperties;
  dotClass: string;
  summaryBannerStyle: CSSProperties;
  includesInnerStyle: CSSProperties;
  /** Hex for spec card left accent (valid in CSS) */
  cardAccentBorder: string;
};

function modalThemeFallback(isDark: boolean): PrizeSpecificationsModalTheme {
  if (isDark) {
    return {
      contentRootClass: "text-neutral-100",
      canvasStyle: {
        background: "linear-gradient(180deg, rgb(38 38 38 / 0.95) 0%, rgb(10 10 10) 45%, rgb(23 23 23) 100%)",
      },
      titleClass: "text-neutral-50",
      bodyClass: "text-neutral-200",
      mutedClass: "text-neutral-300",
      cardClass: "border border-neutral-600 bg-neutral-900/95",
      cardHoverClass: "hover:border-neutral-500",
      emptyStateClass: "text-neutral-300",
      tabInactiveStyle: {
        backgroundColor: "rgba(64, 64, 64, 0.55)",
        borderColor: "rgba(115, 115, 115, 0.9)",
      },
      tabInactiveTextClass: "text-neutral-100",
      tabInactiveHoverClass: "hover:brightness-110",
      tabBadgeInactiveClass: "bg-neutral-800 text-neutral-200",
      summaryTextClass: "text-neutral-100",
      specBarStyle: { background: "linear-gradient(to bottom, #737373, #525252)" },
      dotClass: "bg-neutral-500",
      summaryBannerStyle: {
        borderLeftColor: "rgb(115, 115, 115)",
        backgroundColor: "rgba(64, 64, 64, 0.45)",
      },
      includesInnerStyle: { backgroundColor: "rgba(64, 64, 64, 0.4)" },
      cardAccentBorder: "#a3a3a3",
    };
  }
  return {
    contentRootClass: "text-neutral-900",
    canvasStyle: {
      background: "linear-gradient(180deg, #ffffff 0%, #f4f4f5 100%)",
    },
    titleClass: "text-neutral-900",
    bodyClass: "text-neutral-800",
    mutedClass: "text-neutral-600",
    cardClass: "border border-neutral-200 bg-white shadow-sm",
    cardHoverClass: "hover:border-neutral-300",
    emptyStateClass: "text-neutral-600",
    tabInactiveStyle: {
      backgroundColor: "rgba(244, 244, 245, 0.95)",
      borderColor: "rgba(212, 212, 216, 0.95)",
    },
    tabInactiveTextClass: "text-neutral-900",
    tabInactiveHoverClass: "hover:brightness-[0.98]",
    tabBadgeInactiveClass: "bg-neutral-200 text-neutral-800",
    summaryTextClass: "text-neutral-900",
    specBarStyle: { background: "linear-gradient(to bottom, #a3a3a3, #737373)" },
    dotClass: "bg-neutral-400",
    summaryBannerStyle: {
      borderLeftColor: "rgb(82, 82, 91)",
      backgroundColor: "rgba(244, 244, 245, 0.95)",
    },
    includesInnerStyle: { backgroundColor: "rgba(244, 244, 245, 0.98)" },
    cardAccentBorder: "#52525b",
  };
}

/**
 * Per-brand modal “volume” so Makita / DeWalt / Ryobi match Milwaukee’s saturated treatment
 * (tinted shells, rings, tabs, summary — not flat neutral-gray cards).
 */
const POWER_SPEC_CHROME: Record<
  string,
  {
    light: {
      cardClass: string;
      cardHoverClass: string;
      canvasFootHex: string;
      summaryAlpha: number;
      tabFillAlpha: number;
      tabBorderAlpha: number;
      dotClass: string;
      tabBadgeInactiveClass: string;
    };
    dark: {
      cardClass: string;
      cardHoverClass: string;
      canvasTopAlpha: number;
      canvasMidAlpha: number;
      summaryAlpha: number;
      tabFillAlpha: number;
      tabBorderAlpha: number;
      dotClass: string;
      tabBadgeInactiveClass: string;
    };
  }
> = {
  "milwaukee-red": {
    light: {
      cardClass: "border-2 border-red-300/85 bg-white shadow-sm shadow-red-950/15",
      cardHoverClass: "hover:border-red-400 hover:shadow-red-900/20",
      canvasFootHex: "#fff1f2",
      summaryAlpha: 0.14,
      tabFillAlpha: 0.2,
      tabBorderAlpha: 0.42,
      dotClass: "bg-red-600",
      tabBadgeInactiveClass: "bg-red-100 text-red-950 border border-red-300/90",
    },
    dark: {
      cardClass: "border-2 border-red-700/50 bg-neutral-950/96",
      cardHoverClass: "hover:border-red-500/70",
      canvasTopAlpha: 0.24,
      canvasMidAlpha: 0.14,
      summaryAlpha: 0.2,
      tabFillAlpha: 0.2,
      tabBorderAlpha: 0.48,
      dotClass: "bg-red-500",
      tabBadgeInactiveClass: "bg-red-950/65 text-red-100 border border-red-700/55",
    },
  },
  "makita-teal": {
    light: {
      cardClass: "border-2 border-cyan-400/75 bg-white shadow-sm shadow-cyan-950/15",
      cardHoverClass: "hover:border-cyan-500 hover:shadow-cyan-900/20",
      canvasFootHex: "#e0f7fa",
      summaryAlpha: 0.17,
      tabFillAlpha: 0.24,
      tabBorderAlpha: 0.45,
      dotClass: "bg-cyan-600",
      tabBadgeInactiveClass: "bg-cyan-100 text-cyan-950 border border-cyan-400/90",
    },
    dark: {
      cardClass: "border-2 border-cyan-400/42 bg-[rgb(6,26,30)]/97",
      cardHoverClass: "hover:border-cyan-300/65",
      canvasTopAlpha: 0.32,
      canvasMidAlpha: 0.16,
      summaryAlpha: 0.24,
      tabFillAlpha: 0.24,
      tabBorderAlpha: 0.55,
      dotClass: "bg-cyan-400",
      tabBadgeInactiveClass: "bg-cyan-950/55 text-cyan-50 border border-cyan-500/45",
    },
  },
  "dewalt-yellow": {
    light: {
      cardClass: "border-2 border-amber-400/80 bg-white shadow-sm shadow-amber-950/15",
      cardHoverClass: "hover:border-amber-500 hover:shadow-amber-900/18",
      canvasFootHex: "#fffbeb",
      summaryAlpha: 0.18,
      tabFillAlpha: 0.26,
      tabBorderAlpha: 0.48,
      dotClass: "bg-amber-600",
      tabBadgeInactiveClass: "bg-amber-100 text-amber-950 border border-amber-400/90",
    },
    dark: {
      cardClass: "border-2 border-amber-500/38 bg-[rgb(26,22,10)]/97",
      cardHoverClass: "hover:border-amber-400/55",
      canvasTopAlpha: 0.3,
      canvasMidAlpha: 0.15,
      summaryAlpha: 0.25,
      tabFillAlpha: 0.24,
      tabBorderAlpha: 0.52,
      dotClass: "bg-amber-400",
      tabBadgeInactiveClass: "bg-amber-950/50 text-amber-50 border border-amber-500/42",
    },
  },
  "ryobi-green": {
    light: {
      cardClass: "border-2 border-lime-400/75 bg-white shadow-sm shadow-lime-950/12",
      cardHoverClass: "hover:border-lime-500 hover:shadow-lime-900/18",
      canvasFootHex: "#f7fee7",
      summaryAlpha: 0.17,
      tabFillAlpha: 0.24,
      tabBorderAlpha: 0.45,
      dotClass: "bg-lime-600",
      tabBadgeInactiveClass: "bg-lime-100 text-lime-950 border border-lime-400/85",
    },
    dark: {
      cardClass: "border-2 border-lime-400/38 bg-[rgb(16,26,12)]/97",
      cardHoverClass: "hover:border-lime-300/55",
      canvasTopAlpha: 0.32,
      canvasMidAlpha: 0.16,
      summaryAlpha: 0.24,
      tabFillAlpha: 0.24,
      tabBorderAlpha: 0.52,
      dotClass: "bg-lime-400",
      tabBadgeInactiveClass: "bg-lime-950/45 text-lime-50 border border-lime-500/40",
    },
  },
};

function getPowerSpecChrome(colorKey: string) {
  return POWER_SPEC_CHROME[colorKey];
}

/**
 * Solid header fill for PrizeSpecificationsModal — matches Milwaukee’s full-bleed brand bar (not a soft gradient).
 */
export function getPrizeSpecificationsModalHeaderSolidFill(slug: PrizeSlug | undefined): string {
  if (!slug) return "#ee0000";
  if (slug === "cash-prize") return "#16a34a";
  if (slug === "milwaukee-sidchrome" || slug === "milwaukee-milwaukee" || slug === "milwaukee-kincrome")
    return "#ee0000";
  const k = slugToBrandKey(slug);
  if (k === "makita") return "#00c2ed";
  if (k === "dewalt") return "#FDB813";
  if (k === "ryobi") return "#e0ff00";
  return "#ee0000";
}

export function getPrizeSpecificationsModalTheme(
  slug: PrizeSlug | undefined,
  isDark: boolean
): PrizeSpecificationsModalTheme {
  if (!slug) {
    return modalThemeFallback(isDark);
  }

  if (slug === "cash-prize") {
    const primary = "#22c55e";
    const primaryLight = "#4ade80";
    const primaryDark = "#16a34a";
    const scheme = getPackageColorScheme("cash-green");
    if (isDark) {
      return {
        contentRootClass: "text-neutral-100",
        canvasStyle: {
          background: `linear-gradient(180deg, ${hexToRgbaString(primary, 0.14)} 0%, #0a0a0a 42%, #141414 100%)`,
        },
        titleClass: "text-neutral-50",
        bodyClass: "text-neutral-200",
        mutedClass: "text-neutral-300",
        cardClass: "border border-emerald-900/50 bg-neutral-900/95",
        cardHoverClass: "hover:border-emerald-700/60",
        emptyStateClass: "text-neutral-300",
        tabInactiveStyle: {
          backgroundColor: hexToRgbaString(primary, 0.12),
          borderColor: hexToRgbaString(primaryLight, 0.35),
        },
        tabInactiveTextClass: "text-neutral-100",
        tabInactiveHoverClass: "hover:brightness-110",
        tabBadgeInactiveClass: "bg-neutral-800 text-emerald-100/90",
        summaryTextClass: "text-neutral-100",
        specBarStyle: { background: scheme.barGradientCss ?? `linear-gradient(to bottom, ${primary}, ${primaryDark})` },
        dotClass: "bg-emerald-600/70",
        summaryBannerStyle: {
          borderLeftColor: hexToRgbString(primaryDark),
          backgroundColor: hexToRgbaString(primary, 0.14),
        },
        includesInnerStyle: { backgroundColor: hexToRgbaString(primaryLight, 0.12) },
        cardAccentBorder: primaryDark,
      };
    }
    return {
      contentRootClass: "text-neutral-900",
      canvasStyle: {
        background: `linear-gradient(180deg, ${hexToRgbaString(primary, 0.08)} 0%, #ffffff 38%, #f0fdf4 100%)`,
      },
      titleClass: scheme.textOnLight ?? "text-neutral-900",
      bodyClass: scheme.featureOnLight ?? "text-neutral-800",
      mutedClass: "text-neutral-600",
      cardClass: "border border-emerald-200/80 bg-white shadow-sm",
      cardHoverClass: "hover:border-emerald-300",
      emptyStateClass: "text-neutral-600",
      tabInactiveStyle: {
        backgroundColor: hexToRgbaString(primary, 0.14),
        borderColor: hexToRgbaString(primaryDark, 0.35),
      },
      tabInactiveTextClass: "text-neutral-900",
      tabInactiveHoverClass: "hover:brightness-[0.97]",
      tabBadgeInactiveClass: "bg-emerald-100 text-emerald-900",
      summaryTextClass: "text-neutral-900",
      specBarStyle: { background: scheme.barGradientCss ?? `linear-gradient(to bottom, ${primary}, ${primaryDark})` },
      dotClass: "bg-emerald-600/60",
      summaryBannerStyle: {
        borderLeftColor: hexToRgbString(primaryDark),
        backgroundColor: hexToRgbaString(primary, 0.1),
      },
      includesInnerStyle: { backgroundColor: hexToRgbaString(primaryDark, 0.08) },
      cardAccentBorder: primaryDark,
    };
  }

  const colorKey = slugToPromoTierPlanId(slug);
  const scheme = getPackageColorScheme(colorKey);
  const { primary, primaryLight, primaryDark } = getPowerToolModalPrimaries(slug, isDark);
  const barCss = scheme.barGradientCss ?? `linear-gradient(to bottom, ${primary}, ${primaryDark})`;
  const chrome = getPowerSpecChrome(colorKey);

  if (isDark) {
    const c = chrome?.dark;
    return {
      contentRootClass: "text-neutral-100",
      canvasStyle: {
        background: c
          ? `linear-gradient(180deg, ${hexToRgbaString(primary, c.canvasTopAlpha)} 0%, ${hexToRgbaString(
              primaryDark,
              c.canvasMidAlpha
            )} 34%, #020202 56%, #0c0c0c 100%)`
          : `linear-gradient(180deg, ${hexToRgbaString(primary, 0.16)} 0%, #0a0a0a 40%, #141414 100%)`,
      },
      titleClass: "text-neutral-50",
      bodyClass: "text-neutral-200",
      mutedClass: "text-neutral-300",
      cardClass: c?.cardClass ?? "border border-neutral-600 bg-neutral-900/95",
      cardHoverClass: c?.cardHoverClass ?? "hover:border-neutral-500",
      emptyStateClass: "text-neutral-300",
      tabInactiveStyle: {
        backgroundColor: hexToRgbaString(primary, c?.tabFillAlpha ?? 0.14),
        borderColor: hexToRgbaString(primaryLight, c?.tabBorderAlpha ?? 0.32),
      },
      tabInactiveTextClass: "text-neutral-100",
      tabInactiveHoverClass: "hover:brightness-110",
      tabBadgeInactiveClass: c?.tabBadgeInactiveClass ?? "bg-neutral-800 text-neutral-200",
      summaryTextClass: "text-neutral-100",
      specBarStyle: { background: barCss },
      dotClass: c?.dotClass ?? "bg-neutral-500",
      summaryBannerStyle: {
        borderLeftColor: hexToRgbString(primaryDark),
        backgroundColor: hexToRgbaString(primary, c?.summaryAlpha ?? 0.14),
        borderTop: `1px solid ${hexToRgbaString(primaryLight, 0.12)}`,
        borderRight: `1px solid ${hexToRgbaString(primaryLight, 0.08)}`,
        borderBottom: `1px solid ${hexToRgbaString(primaryLight, 0.08)}`,
      },
      includesInnerStyle: { backgroundColor: hexToRgbaString(primaryLight, 0.14) },
      cardAccentBorder: primaryDark,
    };
  }

  const c = chrome?.light;
  return {
    contentRootClass: "text-neutral-900",
    canvasStyle: {
      background: c
        ? `linear-gradient(180deg, ${hexToRgbaString(primary, 0.13)} 0%, #ffffff 28%, ${hexToRgbaString(
            primary,
            0.07
          )} 58%, ${c.canvasFootHex} 100%)`
        : `linear-gradient(180deg, ${hexToRgbaString(primary, 0.1)} 0%, #ffffff 36%, #fafafa 100%)`,
    },
    titleClass: scheme.textOnLight ?? "text-neutral-900",
    bodyClass: scheme.featureOnLight ?? "text-neutral-800",
    mutedClass: "text-neutral-600",
    cardClass: c?.cardClass ?? "border border-neutral-200 bg-white shadow-sm",
    cardHoverClass: c?.cardHoverClass ?? "hover:border-neutral-300",
    emptyStateClass: "text-neutral-600",
    tabInactiveStyle: {
      backgroundColor: hexToRgbaString(primary, c?.tabFillAlpha ?? 0.12),
      borderColor: hexToRgbaString(primaryDark, c?.tabBorderAlpha ?? 0.28),
    },
    tabInactiveTextClass: "text-neutral-900",
    tabInactiveHoverClass: "hover:brightness-[0.97]",
    tabBadgeInactiveClass: c?.tabBadgeInactiveClass ?? "bg-neutral-200/90 text-neutral-800",
    summaryTextClass: "text-neutral-900",
    specBarStyle: { background: barCss },
    dotClass: c?.dotClass ?? "bg-neutral-400",
    summaryBannerStyle: {
      borderLeftColor: hexToRgbString(primaryDark),
      backgroundColor: hexToRgbaString(primary, c?.summaryAlpha ?? 0.08),
      borderTop: `1px solid ${hexToRgbaString(primaryDark, 0.12)}`,
      borderRight: `1px solid ${hexToRgbaString(primaryDark, 0.08)}`,
      borderBottom: `1px solid ${hexToRgbaString(primaryDark, 0.08)}`,
    },
    includesInnerStyle: { backgroundColor: hexToRgbaString(primaryDark, 0.09) },
    cardAccentBorder: primaryDark,
  };
}

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

/**
 * Get brand-specific glow color class name for Tailwind
 * Used for dynamic class application
 */
export function getBrandGlowClass(slug: PrizeSlug): string {
  switch (slug) {
    case "milwaukee-sidchrome":
    case "milwaukee-milwaukee":
    case "milwaukee-kincrome":
      return "glow-milwaukee";
    case "dewalt-sidchrome":
    case "dewalt-milwaukee":
    case "dewalt-kincrome":
      return "glow-dewalt";
    case "makita-sidchrome":
    case "makita-milwaukee":
    case "makita-kincrome":
      return "glow-makita";
    case "ryobi-sidchrome":
    case "ryobi-milwaukee":
    case "ryobi-kincrome":
      return "glow-ryobi";
    case "cash-prize":
      return "glow-green";
    default:
      return "glow-milwaukee";
  }
}
