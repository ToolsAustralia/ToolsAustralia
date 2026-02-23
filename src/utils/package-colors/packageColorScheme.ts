/**
 * Shared package color scheme utility
 * Brand gradients: Apprentice (gray), Tradie (RYOBI green), Foreman (MAKITA blue), Boss (DEWALT yellow), Power (Milwaukee red)
 */

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
  /** Badge style for Popular/Current/Best Chance */
  badgeStyle: {
    background: string;
    boxShadow: string;
    border: string;
  };
  /** Dominant hex for borders/glows */
  accentHex: string;
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
}

// Brand gradient definitions - world-class, vibrant, high-energy
const BRAND_GRADIENTS = {
  apprentice: {
    bg: "linear-gradient(145deg, #a8b8d4 0%, #6b7b9a 35%, #3d4f6f 100%)",
    accent: "#1e293b",
  },
  tradie: {
    bg: "linear-gradient(145deg, #E3E61B 0%, #9a9d0a 40%, #4E5005 100%)",
    accent: "#4E5005",
  },
  foreman: {
    bg: "linear-gradient(145deg, #5eead4 0%, #14b8a6 35%, #0d5c55 100%)",
    accent: "#042f2e",
  },
  boss: {
    bg: "linear-gradient(145deg, #fde047 0%, #eab308 40%, #854d0e 100%)",
    accent: "#3d2800",
  },
  power: {
    bg: "linear-gradient(145deg, #ff6b6b 0%, #dc2626 35%, #991b1b 100%)",
    accent: "#4a0000",
  },
} as const;

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
 * Get package glow colors for inside-card overlay
 */
export function getPackageGlowColor(planId: string): string {
  if (planId.includes("apprentice")) return "from-slate-200/20 via-slate-400/8 to-transparent";
  if (planId.includes("tradie")) return "from-[#E3E61B]/18 via-[#4E5005]/8 to-transparent";
  if (planId.includes("foreman")) return "from-[#5eead4]/20 via-[#0d5c55]/8 to-transparent";
  if (planId.includes("boss")) return "from-[#fde047]/20 via-[#854d0e]/8 to-transparent";
  if (planId.includes("power")) return "from-[#ff6b6b]/20 via-[#991b1b]/8 to-transparent";
  return "from-gray-500/10 via-gray-500/2.5 to-transparent";
}

/**
 * Get full package color scheme
 */
export function getPackageColorScheme(planId: string): PackageColorScheme {
  if (planId.includes("apprentice")) {
    return {
      bgGradient: BRAND_GRADIENTS.apprentice.bg,
      gradient: "from-slate-300 via-slate-500 to-slate-700",
      text: "text-white",
      textMuted: "text-white/90",
      textOnLight: "text-slate-700",
      featureOnLight: "text-gray-700",
      priceText: "text-white",
      priceBadgeBg: "bg-white/25 backdrop-blur-sm",
      buttonBg: "bg-[#334155] hover:bg-[#475569] active:scale-[0.98] border border-white/10",
      buttonShadow: "shadow-[0_2px_8px_rgba(0,0,0,0.15)]",
      buttonHoverShadow: "hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]",
      buttonText: "text-white",
      glow: "drop-shadow-[0_0_16px_rgba(203,213,225,0.7)]",
      border: "border-slate-300/50",
      shadow: "shadow-[#3d4f6f]/50",
      hoverShadow: "hover:shadow-[#3d4f6f]/70",
      borderGlow: "animate-border-glow-silver",
      badgeStyle: {
        background: "linear-gradient(135deg, #a8b8d4 0%, #6b7b9a 25%, #3d4f6f 50%, #1e293b 75%, #a8b8d4 100%)",
        boxShadow: "0 0 35px rgba(168, 184, 212, 0.75), 0 4px 20px rgba(148, 163, 184, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.7)",
        border: "1px solid rgba(226, 232, 240, 0.95)",
      },
      accentHex: BRAND_GRADIENTS.apprentice.accent,
      entriesText: "text-white",
      cardBorderOpacity: "CC",
      barColor: "bg-gradient-to-r from-slate-200 via-slate-400 to-slate-600",
      barColorLight: "bg-gradient-to-r from-slate-100 via-slate-300 to-slate-500",
      barColorVertical: "bg-gradient-to-t from-slate-200 via-slate-400 to-slate-600",
      barColorLightVertical: "bg-gradient-to-t from-slate-100 via-slate-300 to-slate-500",
    };
  }

  if (planId.includes("tradie")) {
    return {
      bgGradient: BRAND_GRADIENTS.tradie.bg,
      gradient: "from-[#E3E61B] via-[#9a9d0a] to-[#4E5005]",
      text: "text-white",
      textMuted: "text-white/90",
      textOnLight: "text-[#4E5005]",
      featureOnLight: "text-gray-700",
      priceText: "text-white",
      priceBadgeBg: "bg-white/25 backdrop-blur-sm",
      buttonBg: "bg-[#4E5005] hover:bg-[#5e6006] active:scale-[0.98] border border-white/10",
      buttonShadow: "shadow-[0_2px_8px_rgba(0,0,0,0.2)]",
      buttonHoverShadow: "hover:shadow-[0_4px_12px_rgba(0,0,0,0.25)]",
      buttonText: "text-white",
      glow: "drop-shadow-[0_0_16px_rgba(227,230,27,0.6)]",
      border: "border-[#E3E61B]/50",
      shadow: "shadow-[#4E5005]/40",
      hoverShadow: "hover:shadow-[#4E5005]/55",
      borderGlow: "animate-border-glow-ryobi",
      badgeStyle: {
        background: "linear-gradient(135deg, #E3E61B 0%, #9a9d0a 25%, #4E5005 50%, #3d3f04 75%, #E3E61B 100%)",
        boxShadow: "0 0 28px rgba(227, 230, 27, 0.6), 0 4px 16px rgba(78, 80, 5, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.6)",
        border: "1px solid rgba(227, 230, 27, 0.8)",
      },
      accentHex: BRAND_GRADIENTS.tradie.accent,
      entriesText: "text-white",
      cardBorderOpacity: "CC",
      barColor: "bg-gradient-to-r from-[#E3E61B] via-[#9a9d0a] to-[#4E5005]",
      barColorLight: "bg-gradient-to-r from-[#E8E94A] via-[#a8ab0d] to-[#5e6006]",
      barColorVertical: "bg-gradient-to-t from-[#E3E61B] via-[#9a9d0a] to-[#4E5005]",
      barColorLightVertical: "bg-gradient-to-t from-[#E8E94A] via-[#a8ab0d] to-[#5e6006]",
    };
  }

  if (planId.includes("foreman")) {
    return {
      bgGradient: BRAND_GRADIENTS.foreman.bg,
      gradient: "from-[#5eead4] via-[#14b8a6] to-[#0d5c55]",
      text: "text-white",
      textMuted: "text-white/90",
      textOnLight: "text-[#042f2e]",
      featureOnLight: "text-gray-700",
      priceText: "text-white",
      priceBadgeBg: "bg-white/25 backdrop-blur-sm",
      buttonBg: "bg-[#0d5c55] hover:bg-[#0f766e] active:scale-[0.98] border border-white/10",
      buttonShadow: "shadow-[0_2px_8px_rgba(0,0,0,0.2)]",
      buttonHoverShadow: "hover:shadow-[0_4px_12px_rgba(0,0,0,0.25)]",
      buttonText: "text-white",
      glow: "drop-shadow-[0_0_18px_rgba(45,212,191,0.75)]",
      border: "border-[#5eead4]/55",
      shadow: "shadow-[#0d5c55]/45",
      hoverShadow: "hover:shadow-[#0d5c55]/65",
      borderGlow: "animate-border-glow-makita",
      badgeStyle: {
        background: "linear-gradient(135deg, #5eead4 0%, #14b8a6 25%, #0d5c55 50%, #053432 75%, #5eead4 100%)",
        boxShadow: "0 0 35px rgba(94, 234, 212, 0.8), 0 4px 20px rgba(20, 184, 166, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.7)",
        border: "1px solid rgba(94, 234, 212, 0.95)",
      },
      accentHex: BRAND_GRADIENTS.foreman.accent,
      entriesText: "text-white",
      cardBorderOpacity: "CC",
      barColor: "bg-gradient-to-r from-[#5eead4] via-[#14b8a6] to-[#0d5c55]",
      barColorLight: "bg-gradient-to-r from-[#67f0db] via-[#2dd4bf] to-[#0f7a72]",
      barColorVertical: "bg-gradient-to-t from-[#5eead4] via-[#14b8a6] to-[#0d5c55]",
      barColorLightVertical: "bg-gradient-to-t from-[#67f0db] via-[#2dd4bf] to-[#0f7a72]",
    };
  }

  if (planId.includes("boss")) {
    return {
      bgGradient: BRAND_GRADIENTS.boss.bg,
      gradient: "from-[#fde047] via-[#eab308] to-[#854d0e]",
      text: "text-white",
      textMuted: "text-white/90",
      textOnLight: "text-[#3d2800]",
      featureOnLight: "text-gray-700",
      priceText: "text-white",
      priceBadgeBg: "bg-white/25 backdrop-blur-sm",
      buttonBg: "bg-[#854d0e] hover:bg-[#a16207] active:scale-[0.98] border border-white/10",
      buttonShadow: "shadow-[0_2px_8px_rgba(0,0,0,0.2)]",
      buttonHoverShadow: "hover:shadow-[0_4px_12px_rgba(0,0,0,0.25)]",
      buttonText: "text-white",
      glow: "drop-shadow-[0_0_18px_rgba(253,224,71,0.8)]",
      border: "border-[#fde047]/55",
      shadow: "shadow-[#854d0e]/45",
      hoverShadow: "hover:shadow-[#854d0e]/65",
      borderGlow: "animate-border-glow-dewalt",
      badgeStyle: {
        background: "linear-gradient(135deg, #fde047 0%, #eab308 25%, #854d0e 50%, #713f12 75%, #fde047 100%)",
        boxShadow: "0 0 35px rgba(253, 224, 71, 0.8), 0 4px 20px rgba(234, 179, 8, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.7)",
        border: "1px solid rgba(253, 224, 71, 0.95)",
      },
      accentHex: BRAND_GRADIENTS.boss.accent,
      entriesText: "text-white",
      cardBorderOpacity: "CC",
      barColor: "bg-gradient-to-r from-[#fde047] via-[#eab308] to-[#854d0e]",
      barColorLight: "bg-gradient-to-r from-[#fef08a] via-[#facc15] to-[#a16207]",
      barColorVertical: "bg-gradient-to-t from-[#fde047] via-[#eab308] to-[#854d0e]",
      barColorLightVertical: "bg-gradient-to-t from-[#fef08a] via-[#facc15] to-[#a16207]",
    };
  }

  if (planId.includes("power")) {
    return {
      bgGradient: BRAND_GRADIENTS.power.bg,
      gradient: "from-[#ff6b6b] via-[#dc2626] to-[#991b1b]",
      text: "text-white",
      textMuted: "text-white/90",
      textOnLight: "text-[#4a0000]",
      featureOnLight: "text-gray-700",
      priceText: "text-white",
      priceBadgeBg: "bg-white/25 backdrop-blur-sm",
      buttonBg: "bg-[#991b1b] hover:bg-[#b91c1c] active:scale-[0.98] border border-white/10",
      buttonShadow: "shadow-[0_2px_8px_rgba(0,0,0,0.2)]",
      buttonHoverShadow: "hover:shadow-[0_4px_12px_rgba(0,0,0,0.25)]",
      buttonText: "text-white",
      glow: "drop-shadow-[0_0_20px_rgba(255,107,107,0.85)]",
      border: "border-[#ff6b6b]/55",
      shadow: "shadow-[#991b1b]/50",
      hoverShadow: "hover:shadow-[#991b1b]/70",
      borderGlow: "animate-border-glow-milwaukee",
      badgeStyle: {
        background: "linear-gradient(135deg, #ff6b6b 0%, #dc2626 25%, #991b1b 50%, #7f1d1d 75%, #ff6b6b 100%)",
        boxShadow: "0 0 40px rgba(255, 107, 107, 0.85), 0 4px 20px rgba(220, 38, 38, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.7)",
        border: "1px solid rgba(255, 150, 150, 0.95)",
      },
      accentHex: BRAND_GRADIENTS.power.accent,
      entriesText: "text-white",
      cardBorderOpacity: "CC",
      barColor: "bg-gradient-to-r from-[#ff6b6b] via-[#dc2626] to-[#991b1b]",
      barColorLight: "bg-gradient-to-r from-[#f87171] via-[#ef4444] to-[#b91c1c]",
      barColorVertical: "bg-gradient-to-t from-[#ff6b6b] via-[#dc2626] to-[#991b1b]",
      barColorLightVertical: "bg-gradient-to-t from-[#f87171] via-[#ef4444] to-[#b91c1c]",
    };
  }

  // Default fallback
  return {
    bgGradient: "linear-gradient(135deg, #1e293b 0%, #334155 50%, #1e293b 100%)",
    gradient: "from-slate-600 via-gray-700 to-slate-800",
    text: "text-gray-400",
    textMuted: "text-slate-300/80",
    textOnLight: "text-gray-600",
    featureOnLight: "text-gray-700",
    priceText: "text-yellow-400",
    priceBadgeBg: "bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800",
    buttonBg: "bg-gradient-to-r from-slate-600 via-gray-700 to-slate-800",
    buttonShadow: "shadow-[0_4px_20px_rgba(100,116,139,0.35)]",
    buttonHoverShadow: "hover:shadow-[0_8px_32px_rgba(100,116,139,0.5)]",
    buttonText: "text-white",
    glow: "drop-shadow-[0_0_10px_rgba(100,116,139,0.5)]",
    border: "border-gray-500/50",
    shadow: "shadow-gray-500/30",
    hoverShadow: "hover:shadow-gray-500/50",
    borderGlow: "animate-border-glow-silver",
    badgeStyle: {
      background: "linear-gradient(135deg, #64748b 0%, #475569 25%, #334155 50%, #1e293b 75%, #64748b 100%)",
      boxShadow: "0 0 25px rgba(100, 116, 139, 0.6), 0 4px 12px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.5)",
      border: "1px solid rgba(148, 163, 184, 0.8)",
    },
    accentHex: "#64748b",
    entriesText: "text-white",
    cardBorderOpacity: "CC",
    barColor: "bg-gradient-to-r from-slate-500 via-gray-600 to-slate-700",
    barColorLight: "bg-gradient-to-r from-slate-400 via-gray-500 to-slate-600",
    barColorVertical: "bg-gradient-to-t from-slate-500 via-gray-600 to-slate-700",
    barColorLightVertical: "bg-gradient-to-t from-slate-400 via-gray-500 to-slate-600",
  };
}
