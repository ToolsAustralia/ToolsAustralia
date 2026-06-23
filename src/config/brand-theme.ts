/**
 * Centralized Brand Theme Configuration
 * 
 * Single source of truth for brand color palettes with light/dark mode variants.
 * Used by promo components, landing pages, and theme system.
 * 
 * @module brand-theme
 */

export type BrandKey = "dewalt" | "makita" | "milwaukee" | "ryobi" | "hikoki";

/**
 * Brand theme with primary colors and light/dark mode variants
 */
export interface BrandTheme {
  /** Primary brand color */
  primary: string;
  /** Secondary brand color */
  secondary: string;
  /** Accent brand color */
  accent: string;
  /** Light mode color variants */
  light: {
    primary: string;
    secondary: string;
    accent: string;
  };
  /** Dark mode color variants */
  dark: {
    primary: string;
    secondary: string;
    accent: string;
  };
  /** CSS gradient for backgrounds */
  gradient: string;
  /** Text color for use on brand backgrounds (black or white) */
  textColor: "black" | "white";
}

/**
 * Centralized brand color palettes
 * Colors extracted from brand guidelines and landing page imagery
 */
export const BRAND_THEMES: Record<BrandKey, BrandTheme> = {
  dewalt: {
    primary: "#ffd200",
    secondary: "#ffc517",
    accent: "#c1c55b",
    light: {
      primary: "#ffd200",
      secondary: "#ffc517",
      accent: "#ffe066",
    },
    dark: {
      primary: "#e5a000",
      secondary: "#c1c55b",
      accent: "#ffd200",
    },
    gradient: "linear-gradient(135deg, #ffd200 0%, #ffc517 50%, #c1c55b 100%)",
    textColor: "black",
  },
  makita: {
    primary: "#00c2ed",
    secondary: "#5ca9ec",
    accent: "#5ca9ec",
    light: {
      primary: "#00c2ed",
      secondary: "#5ca9ec",
      accent: "#5ca9ec",
    },
    dark: {
      primary: "#0B7E88",
      secondary: "#00A0AA",
      accent: "#00c2ed",
    },
    gradient: "linear-gradient(135deg, #5ca9ec 0%, #00c2ed 50%, #5ca9ec 100%)",
    textColor: "white",
  },
  milwaukee: {
    primary: "#ce2b05",
    secondary: "#f30000",
    accent: "#dd5358",
    light: {
      primary: "#ce2b05",
      secondary: "#f30000",
      accent: "#ff4444",
    },
    dark: {
      primary: "#9a0c24",
      secondary: "#c8102e",
      accent: "#e02d42",
    },
    gradient: "linear-gradient(135deg, #ce2b05 0%, #f30000 50%, #dd5358 100%)",
    textColor: "white",
  },
  ryobi: {
    /** Neon chartreuse — CTAs, PromoBanner, landing hero (no grey-green in the main ramp). */
    primary: "#e0ff00",
    secondary: "#eeff3d",
    accent: "#f7ff8c",
    light: {
      primary: "#e0ff00",
      secondary: "#eeff3d",
      accent: "#faff66",
    },
    dark: {
      primary: "#b8e000",
      secondary: "#9fcc00",
      accent: "#e0ff00",
    },
    gradient: "linear-gradient(135deg, #e0ff00 0%, #f2ff4d 45%, #c8eb00 100%)",
    textColor: "black",
  },
  hikoki: {
    /** Official HiKOKI brand green (#007749, "Fun Green" / Pantone 3415 C) — green replaced
     *  Hitachi's old red identity in the 2018 rebrand. White text on the dark green. */
    primary: "#007749",
    secondary: "#009a63",
    accent: "#3cc88a",
    light: {
      primary: "#007749",
      secondary: "#009a63",
      accent: "#5fd6a3",
    },
    dark: {
      primary: "#00543a",
      secondary: "#007749",
      accent: "#009a63",
    },
    gradient: "linear-gradient(135deg, #007749 0%, #009a63 50%, #007749 100%)",
    textColor: "white",
  },
};

/**
 * Get brand theme by brand key
 * @param brand - Brand identifier
 * @returns Brand theme configuration
 */
export function getBrandTheme(brand: BrandKey): BrandTheme {
  return BRAND_THEMES[brand];
}

/**
 * Get brand colors for a specific mode (light or dark)
 * @param brand - Brand identifier
 * @param mode - Theme mode
 * @returns Color palette for the specified mode
 */
export function getBrandColors(brand: BrandKey, mode: "light" | "dark") {
  const theme = BRAND_THEMES[brand];
  return mode === "dark" ? theme.dark : theme.light;
}

/**
 * Map prize slug to brand key
 * Extracts brand from slug format: "{brand}-{toolbox}" or "toolbox-{brand}"
 * @param slug - Prize slug (e.g., "dewalt-milwaukee", "ryobi-sidchrome")
 * @returns Brand key or null if not found
 */
export function slugToBrandKey(slug: string): BrandKey | null {
  const lower = slug.toLowerCase();
  
  // Check prefix first (toolset brand takes priority)
  if (lower.startsWith("dewalt")) return "dewalt";
  if (lower.startsWith("makita")) return "makita";
  if (lower.startsWith("milwaukee")) return "milwaukee";
  if (lower.startsWith("ryobi")) return "ryobi";
  if (lower.startsWith("hikoki")) return "hikoki";

  // Fallback to checking if brand appears anywhere in slug
  if (lower.includes("dewalt")) return "dewalt";
  if (lower.includes("makita")) return "makita";
  if (lower.includes("milwaukee")) return "milwaukee";
  if (lower.includes("ryobi")) return "ryobi";
  if (lower.includes("hikoki")) return "hikoki";

  return null;
}

/**
 * Check if a slug represents a valid brand
 * @param slug - Prize slug
 * @returns True if slug contains a valid brand
 */
export function isValidBrandSlug(slug: string): boolean {
  return slugToBrandKey(slug) !== null;
}

/**
 * Get all available brand keys
 * @returns Array of brand keys
 */
export function getAllBrandKeys(): BrandKey[] {
  return ["dewalt", "makita", "milwaukee", "ryobi", "hikoki"];
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const n = hex.startsWith("#") ? hex.slice(1) : hex;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

/**
 * Package / collage card backgrounds — use `BRAND_THEMES.gradient` plus primary triple for Tailwind utilities.
 */
export function getBrandPackageGradientRow(key: BrandKey): {
  bg: string;
  primary: string;
  primaryLight: string;
  primaryDark: string;
  accent: string;
} {
  const t = BRAND_THEMES[key];
  return {
    bg: t.gradient,
    primary: t.light.primary,
    primaryLight: t.light.accent,
    primaryDark: t.dark.primary,
    accent: "#000000",
  };
}

/** Landing / hero CTA stripes (matches light pop + dark edge). */
export function getBrandLandingPrimaryTriple(key: BrandKey): {
  primary: string;
  primaryLight: string;
  primaryDark: string;
} {
  const t = BRAND_THEMES[key];
  return {
    primary: t.light.primary,
    primaryLight: t.light.accent,
    primaryDark: t.dark.primary,
  };
}

/** MembershipSection card gradients — edged with dark.primary, highlight with light.accent. */
export function getBrandMembershipSectionRow(key: BrandKey): {
  bgGradient: string;
  gradient: string;
  badgeStyle: { background: string; boxShadow: string; border: string };
} {
  const t = BRAND_THEMES[key];
  const l = t.light;
  const d = t.dark;
  const [dr, dg, db] = hexToRgbTuple(d.primary);
  const [lr, lg, lb] = hexToRgbTuple(l.primary);
  const [ar, ag, ab] = hexToRgbTuple(l.accent);
  return {
    bgGradient: `linear-gradient(135deg, ${d.primary} 0%, ${l.primary} 40%, ${l.accent} 50%, ${l.primary} 60%, ${d.primary} 100%)`,
    gradient: `from-[${d.primary}] via-[${l.accent}] to-[${d.primary}]`,
    badgeStyle: {
      background: l.secondary,
      boxShadow: `0 0 36px rgba(${ar}, ${ag}, ${ab}, 0.72), 0 4px 20px rgba(${dr}, ${dg}, ${db}, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.55)`,
      border: `1px solid rgba(${lr}, ${lg}, ${lb}, 0.92)`,
    },
  };
}
