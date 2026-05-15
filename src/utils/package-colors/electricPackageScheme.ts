/**
 * Electric package color schemes — Phase 1, dev-only.
 *
 * Self-contained: reuses the existing PackageColorScheme shape but does NOT
 * extend COLOR_KEYS or touch packageColorScheme.ts (zero production impact).
 * Applied only to one-time + additional package cards by ElectricPackageCard.
 * Membership-tab subscriptions keep their existing scheme (resolved elsewhere).
 */
import type { PackageColorScheme } from "@/utils/package-colors/packageColorScheme";

type ElectricTier = "apprentice" | "tradie" | "foreman" | "boss" | "power" | "vip";

/** rgba tuple "r,g,b,a" string per the approved spec image. */
interface ElectricSpec {
  primary: string;
  dark: string;
  glowRgba: string;
  blackText: boolean;
}

const ELECTRIC: Record<Exclude<ElectricTier, "vip">, ElectricSpec> = {
  apprentice: { primary: "#1E90FF", dark: "#0066CC", glowRgba: "30,144,255,0.4", blackText: false },
  tradie: { primary: "#CCFF00", dark: "#7FB800", glowRgba: "204,255,0,0.4", blackText: true },
  foreman: { primary: "#00E5FF", dark: "#0099B8", glowRgba: "0,229,255,0.4", blackText: false },
  boss: { primary: "#FFD700", dark: "#B8860B", glowRgba: "255,215,0,0.45", blackText: true },
  power: { primary: "#FF1F1F", dark: "#A30000", glowRgba: "255,31,31,0.45", blackText: false },
};

function makeElectric(s: ElectricSpec): PackageColorScheme {
  const textColor = s.blackText ? "text-black" : "text-white";
  const inset = s.blackText
    ? "inset 0 1px 0 rgba(255,255,255,0.6)"
    : "inset 0 1px 0 rgba(255,255,255,0.25)";
  return {
    bgGradient: `linear-gradient(135deg, ${s.dark} 0%, ${s.primary} 50%, ${s.dark} 100%)`,
    gradient: `from-[${s.dark}] via-[${s.primary}] to-[${s.dark}]`,
    text: textColor,
    textMuted: s.blackText ? "text-black/80" : "text-white/90",
    priceText: textColor,
    priceBadgeBg: "bg-white/20 backdrop-blur-sm",
    buttonBg: `bg-[${s.dark}] active:scale-[0.98] border border-white/15`,
    buttonShadow: "shadow-[0_2px_8px_rgba(0,0,0,0.2)]",
    buttonHoverShadow: `hover:shadow-[0_4px_16px_rgba(${s.glowRgba})]`,
    buttonText: textColor,
    glow: `drop-shadow-[0_0_20px_rgba(${s.glowRgba})]`,
    border: `border-[${s.primary}]/55`,
    shadow: `shadow-[${s.primary}]/40`,
    hoverShadow: `hover:shadow-[${s.primary}]/60`,
    // No looping animation in Phase 1 — hover glow handled by the card.
    borderGlow: "",
    badgeStyle: {
      background: s.primary,
      boxShadow: `0 0 35px rgba(${s.glowRgba}), 0 4px 20px rgba(${s.glowRgba}), ${inset}`,
      border: `1px solid ${s.primary}`,
    },
    accentHex: s.primary,
    entriesText: textColor,
    cardBorderOpacity: "CC",
  };
}

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
  apprentice: makeElectric(ELECTRIC.apprentice),
  tradie: makeElectric(ELECTRIC.tradie),
  foreman: makeElectric(ELECTRIC.foreman),
  boss: makeElectric(ELECTRIC.boss),
  power: makeElectric(ELECTRIC.power),
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
