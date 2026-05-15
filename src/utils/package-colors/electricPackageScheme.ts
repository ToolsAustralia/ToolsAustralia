/**
 * Electric package color schemes — Phase 1, dev-only.
 *
 * Self-contained: reuses the existing PackageColorScheme shape but does NOT
 * extend COLOR_KEYS or touch packageColorScheme.ts (zero production impact).
 * Applied only to one-time + additional package cards by ElectricPackageCard.
 * Membership-tab subscriptions keep their existing scheme (resolved elsewhere).
 *
 * NOTE: every Tailwind arbitrary class below uses LITERAL hex (no template
 * interpolation) so Tailwind's JIT content scanner emits them — same pattern
 * as packageColorScheme.ts. Do not refactor these into interpolated strings.
 */
import type { PackageColorScheme } from "@/utils/package-colors/packageColorScheme";

type ElectricTier = "apprentice" | "tradie" | "foreman" | "boss" | "power" | "vip";

/** Apprentice — deep electric blue (#1E90FF / #0066CC), white text. */
const ELECTRIC_BLUE: PackageColorScheme = {
  bgGradient: "linear-gradient(135deg, #0066CC 0%, #1E90FF 50%, #0066CC 100%)",
  gradient: "from-[#0066CC] via-[#1E90FF] to-[#0066CC]",
  text: "text-white",
  textMuted: "text-white/90",
  priceText: "text-white",
  priceBadgeBg: "bg-white/20 backdrop-blur-sm",
  buttonBg: "bg-[#0066CC] active:scale-[0.98] border border-white/15",
  buttonShadow: "shadow-[0_2px_8px_rgba(0,0,0,0.2)]",
  buttonHoverShadow: "hover:shadow-[0_4px_16px_rgba(30,144,255,0.4)]",
  buttonText: "text-white",
  glow: "drop-shadow-[0_0_20px_rgba(30,144,255,0.4)]",
  border: "border-[#1E90FF]/55",
  shadow: "shadow-[#1E90FF]/40",
  hoverShadow: "hover:shadow-[#1E90FF]/60",
  borderGlow: "",
  badgeStyle: {
    background: "#1E90FF",
    boxShadow:
      "0 0 35px rgba(30,144,255,0.4), 0 4px 20px rgba(30,144,255,0.4), inset 0 1px 0 rgba(255,255,255,0.25)",
    border: "1px solid #1E90FF",
  },
  accentHex: "#1E90FF",
  entriesText: "text-white",
  cardBorderOpacity: "CC",
};

/** Tradie — neon lime (#CCFF00 / #7FB800), black text. */
const ELECTRIC_LIME: PackageColorScheme = {
  bgGradient: "linear-gradient(135deg, #7FB800 0%, #CCFF00 50%, #7FB800 100%)",
  gradient: "from-[#7FB800] via-[#CCFF00] to-[#7FB800]",
  text: "text-black",
  textMuted: "text-black/80",
  priceText: "text-black",
  priceBadgeBg: "bg-white/20 backdrop-blur-sm",
  buttonBg: "bg-[#7FB800] active:scale-[0.98] border border-white/15",
  buttonShadow: "shadow-[0_2px_8px_rgba(0,0,0,0.2)]",
  buttonHoverShadow: "hover:shadow-[0_4px_16px_rgba(204,255,0,0.4)]",
  buttonText: "text-black",
  glow: "drop-shadow-[0_0_20px_rgba(204,255,0,0.4)]",
  border: "border-[#CCFF00]/55",
  shadow: "shadow-[#CCFF00]/40",
  hoverShadow: "hover:shadow-[#CCFF00]/60",
  borderGlow: "",
  badgeStyle: {
    background: "#CCFF00",
    boxShadow:
      "0 0 35px rgba(204,255,0,0.4), 0 4px 20px rgba(204,255,0,0.4), inset 0 1px 0 rgba(255,255,255,0.6)",
    border: "1px solid #CCFF00",
  },
  accentHex: "#CCFF00",
  entriesText: "text-black",
  cardBorderOpacity: "CC",
};

/** Foreman — bright cyan (#00E5FF / #0099B8), white text. */
const ELECTRIC_CYAN: PackageColorScheme = {
  bgGradient: "linear-gradient(135deg, #0099B8 0%, #00E5FF 50%, #0099B8 100%)",
  gradient: "from-[#0099B8] via-[#00E5FF] to-[#0099B8]",
  text: "text-white",
  textMuted: "text-white/90",
  priceText: "text-white",
  priceBadgeBg: "bg-white/20 backdrop-blur-sm",
  buttonBg: "bg-[#0099B8] active:scale-[0.98] border border-white/15",
  buttonShadow: "shadow-[0_2px_8px_rgba(0,0,0,0.2)]",
  buttonHoverShadow: "hover:shadow-[0_4px_16px_rgba(0,229,255,0.4)]",
  buttonText: "text-white",
  glow: "drop-shadow-[0_0_20px_rgba(0,229,255,0.4)]",
  border: "border-[#00E5FF]/55",
  shadow: "shadow-[#00E5FF]/40",
  hoverShadow: "hover:shadow-[#00E5FF]/60",
  borderGlow: "",
  badgeStyle: {
    background: "#00E5FF",
    boxShadow:
      "0 0 35px rgba(0,229,255,0.4), 0 4px 20px rgba(0,229,255,0.4), inset 0 1px 0 rgba(255,255,255,0.25)",
    border: "1px solid #00E5FF",
  },
  accentHex: "#00E5FF",
  entriesText: "text-white",
  cardBorderOpacity: "CC",
};

/** Boss — rich gold (#FFD700 / #B8860B), black text. */
const ELECTRIC_GOLD: PackageColorScheme = {
  bgGradient: "linear-gradient(135deg, #B8860B 0%, #FFD700 50%, #B8860B 100%)",
  gradient: "from-[#B8860B] via-[#FFD700] to-[#B8860B]",
  text: "text-black",
  textMuted: "text-black/80",
  priceText: "text-black",
  priceBadgeBg: "bg-white/20 backdrop-blur-sm",
  buttonBg: "bg-[#B8860B] active:scale-[0.98] border border-white/15",
  buttonShadow: "shadow-[0_2px_8px_rgba(0,0,0,0.2)]",
  buttonHoverShadow: "hover:shadow-[0_4px_16px_rgba(255,215,0,0.45)]",
  buttonText: "text-black",
  glow: "drop-shadow-[0_0_20px_rgba(255,215,0,0.45)]",
  border: "border-[#FFD700]/55",
  shadow: "shadow-[#FFD700]/40",
  hoverShadow: "hover:shadow-[#FFD700]/60",
  borderGlow: "",
  badgeStyle: {
    background: "#FFD700",
    boxShadow:
      "0 0 35px rgba(255,215,0,0.45), 0 4px 20px rgba(255,215,0,0.45), inset 0 1px 0 rgba(255,255,255,0.6)",
    border: "1px solid #FFD700",
  },
  accentHex: "#FFD700",
  entriesText: "text-black",
  cardBorderOpacity: "CC",
};

/** Power — aggressive red (#FF1F1F / #A30000), white text. */
const ELECTRIC_RED: PackageColorScheme = {
  bgGradient: "linear-gradient(135deg, #A30000 0%, #FF1F1F 50%, #A30000 100%)",
  gradient: "from-[#A30000] via-[#FF1F1F] to-[#A30000]",
  text: "text-white",
  textMuted: "text-white/90",
  priceText: "text-white",
  priceBadgeBg: "bg-white/20 backdrop-blur-sm",
  buttonBg: "bg-[#A30000] active:scale-[0.98] border border-white/15",
  buttonShadow: "shadow-[0_2px_8px_rgba(0,0,0,0.2)]",
  buttonHoverShadow: "hover:shadow-[0_4px_16px_rgba(255,31,31,0.45)]",
  buttonText: "text-white",
  glow: "drop-shadow-[0_0_20px_rgba(255,31,31,0.45)]",
  border: "border-[#FF1F1F]/55",
  shadow: "shadow-[#FF1F1F]/40",
  hoverShadow: "hover:shadow-[#FF1F1F]/60",
  borderGlow: "",
  badgeStyle: {
    background: "#FF1F1F",
    boxShadow:
      "0 0 35px rgba(255,31,31,0.45), 0 4px 20px rgba(255,31,31,0.45), inset 0 1px 0 rgba(255,255,255,0.25)",
    border: "1px solid #FF1F1F",
  },
  accentHex: "#FF1F1F",
  entriesText: "text-white",
  cardBorderOpacity: "CC",
};

/** VIP — matte black + polished gold, gradient text (mirrors existing `black`). */
const ELECTRIC_BLACK: PackageColorScheme = {
  bgGradient: "linear-gradient(135deg, #000000 0%, #0A0A0A 50%, #000000 100%)",
  gradient: "from-[#000000] via-[#0d0d0d] to-[#000000]",
  text: "text-premium-gold",
  textMuted: "text-premium-gold/90",
  priceText: "text-premium-gold",
  priceBadgeBg: "bg-white/10 backdrop-blur-sm",
  buttonBg: "bg-[#0a0a0a] active:scale-[0.98] border border-premium-gold/40",
  buttonShadow: "shadow-[0_2px_8px_rgba(0,0,0,0.4)]",
  buttonHoverShadow: "hover:shadow-[0_4px_16px_rgba(255,215,0,0.35)]",
  buttonText: "text-premium-gold",
  glow: "drop-shadow-[0_0_22px_rgba(255,215,0,0.35)]",
  border: "border-premium-gold/40",
  shadow: "shadow-[#FFD700]/20",
  hoverShadow: "hover:shadow-[#FFD700]/35",
  borderGlow: "",
  badgeStyle: {
    background: "#0a0a0a",
    boxShadow:
      "0 0 35px rgba(255,215,0,0.2), 0 4px 20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,215,0,0.25)",
    border: "1px solid rgba(255,215,0,0.45)",
  },
  accentHex: "#FFD700",
  entriesText: "text-premium-gold",
  cardBorderOpacity: "CC",
  textGradientStyle: {
    backgroundImage:
      "linear-gradient(135deg, #FFF8E7 0%, #FFE55C 18%, #FFD700 38%, #E5A000 58%, #B8860B 78%, #6B4423 100%)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
    color: "transparent",
  },
  cardBorderGradient:
    "linear-gradient(135deg, #FFF8E7 0%, #FFE55C 18%, #FFD700 38%, #E5A000 58%, #B8860B 78%, #6B4423 100%)",
};

const SCHEMES: Record<ElectricTier, PackageColorScheme> = {
  apprentice: ELECTRIC_BLUE,
  tradie: ELECTRIC_LIME,
  foreman: ELECTRIC_CYAN,
  boss: ELECTRIC_GOLD,
  power: ELECTRIC_RED,
  vip: ELECTRIC_BLACK,
};

/** Normalize any plan id (incl. `additional-*`, `*-member`) to an electric tier. */
function planIdToElectricTier(planId: string): ElectricTier {
  const id = planId.toLowerCase();
  if (id.includes("vip")) return "vip";
  if (id.includes("apprentice")) return "apprentice";
  if (id.includes("tradie")) return "tradie";
  if (id.includes("foreman")) return "foreman";
  if (id.includes("boss")) return "boss";
  if (id.includes("power")) return "power";
  return "power"; // deterministic fallback (electric-red)
}

/**
 * Electric scheme for a one-time / additional package id.
 * Opt-in: only ElectricPackageCard uses this. Live MembershipSection is unaffected.
 */
export function getElectricPackageColorScheme(planId: string): PackageColorScheme {
  return SCHEMES[planIdToElectricTier(planId)];
}
