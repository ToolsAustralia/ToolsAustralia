/**
 * packageCardSurface — the single source of truth for package-card CHROME.
 *
 * `packageColorScheme.ts` / `electricPackageScheme.ts` answer "what colour is this tier?".
 * This module answers "how does a package card built from that tier LOOK?" — body
 * background, border, sheen, bloom, ink, title/price treatment, selected state.
 *
 * It exists because that derivation used to live inline inside `ElectricPackageCard`
 * (the MembershipSection card), which meant every other package-card surface
 * (PackageSelectionModal, SpecialPackagesModal, the MembershipModal "Selected Package"
 * card) hand-rolled its own approximation and drifted. In particular the three
 * CROSS-TIER BACKGROUND REMAPS below are invisible to anyone reading only a colour
 * scheme, so a hand-rolled vivid card silently disagrees with the section on exactly
 * those tiers.
 *
 * Consumers: `sections/membership/ElectricPackageCard` and
 * `modals/MembershipModal/PlanSummaryCard`.
 *
 * NOTE: the two package MODALS no longer use this — they moved to `modals/PackageTile`
 * (the 2026-08-04 package-modal redesign), which derives its own chrome from a single tier
 * hex via `glossFill` / `needsDarkInk`. This module still owns the section card and the
 * selected-package summary, and remains the home for the cross-tier light-theme remaps.
 *
 * Test: `npm run test:package-card-surface`.
 */

import type { CSSProperties } from "react";
import {
  getMembershipSectionColorScheme,
  type PackageColorScheme,
} from "./packageColorScheme";
import { getElectricPackageColorScheme } from "./electricPackageScheme";

export type PackageCardTheme = "light" | "dark";

export interface PackageCardSurface {
  /** Card body background — the vivid tier gradient in light, electric-black in dark. */
  body: string;
  /** Border for the card body. */
  border: string;
  /** Inner sheen overlay background (render on an inset, pointer-events-none layer). */
  sheen: string;
  /** Inset shadow applied to the card body. */
  inset: string;
  /** Outer bloom box-shadow at rest. */
  bloom: string;
  /** Outer bloom when this card is the selected one. Includes the contrast `ring`. */
  bloomSelected: string;
  /**
   * Contrast colour for selected-state rings / check badges. On a vivid body an
   * accent-only glow does not read as "selected" (every neighbour is a different vivid
   * colour), so the selected state needs ink contrast, not more accent.
   */
  ring: string;
  /** Primary ink on the body. */
  ink: string;
  /** Muted ink — labels such as FREE ENTRIES / One Time Payment. */
  inkMuted: string;
  /** Faint ink — struck-through original values. */
  inkFaint: string;
  /** Hairline divider colour. */
  divider: string;
  /** Package-name treatment. VIP keeps its champagne-gold gradient. */
  title: CSSProperties;
  /** Large entries-number treatment. */
  bigNumber: CSSProperties;
  /** The dark price panel (identical in both themes). */
  pricePanel: CSSProperties;
  /** The CTA button (identical in both themes); carries `--ta-cta-accent`. */
  cta: CSSProperties;
  /** Dominant tier hex, for callers that need to derive one more thing. */
  accentHex: string;
  /** True for the VIP (electric-black) tier — the only scheme with a gradient title. */
  isPremium: boolean;
  /** True when the tier's vivid body needs black ink (lime / amber). */
  blackText: boolean;
  theme: PackageCardTheme;
}

export interface PackageCardSurfaceOptions {
  /** `plan.period !== "one-time"`. Drives both scheme resolution and the remaps. */
  isMembershipTab: boolean;
  /** Defaults to "light" — the treatment MembershipSection ships. */
  theme?: PackageCardTheme;
  /**
   * Pre-resolved scheme. `ElectricPackageCard` takes `colorScheme` as a public prop
   * resolved by its caller; passing it through keeps that contract intact. Modals omit
   * it and get the standard resolution below.
   */
  colorScheme?: PackageColorScheme;
}

/** The scheme rule every package-card surface shares (mirrors MembershipSection). */
export function resolvePackageCardColorScheme(
  planId: string,
  isMembershipTab: boolean
): PackageColorScheme {
  return isMembershipTab
    ? getMembershipSectionColorScheme(planId, true)
    : getElectricPackageColorScheme(planId);
}

/**
 * Light-theme body background, including the three cross-tier remaps.
 *
 * These are deliberate art-direction swaps, not bugs: three tiers render a DIFFERENT
 * tier's vivid gradient so no two adjacent cards in either tab repeat a colour.
 */
function resolveLightBody(planId: string, isMembershipTab: boolean, scheme: PackageColorScheme): string {
  const lowerId = planId.toLowerCase();
  const isTradie = lowerId.includes("tradie");
  const isBoss = lowerId.includes("boss");

  if (isTradie && isMembershipTab) {
    // Membership Tradie borrows the one-time Foreman body (electric cyan).
    return getElectricPackageColorScheme("foreman-pack").bgGradient;
  }
  if (isBoss && !isMembershipTab) {
    // One-time Boss borrows the membership Foreman body (DeWalt yellow).
    return getMembershipSectionColorScheme("foreman-subscription", true).bgGradient;
  }
  if (isBoss && isMembershipTab) {
    // Membership Boss borrows the one-time Power body (electric red).
    return getElectricPackageColorScheme("power-pack").bgGradient;
  }
  return scheme.bgGradient;
}

export function getPackageCardSurface(
  planId: string,
  { isMembershipTab, theme = "light", colorScheme }: PackageCardSurfaceOptions
): PackageCardSurface {
  const scheme = colorScheme ?? resolvePackageCardColorScheme(planId, isMembershipTab);
  const accent = scheme.accentHex;
  const gradientText = scheme.textGradientStyle as CSSProperties | undefined;
  // VIP (electric-black) is the only scheme carrying a gradient title.
  const isPremium = !!gradientText;
  const isLight = theme === "light";
  // Lime / amber bodies are too bright for white ink.
  const blackText = scheme.text.includes("black");
  const ink = isLight ? (blackText ? "#0A0A0A" : "#FFFFFF") : "#FFFFFF";
  const ring = isLight
    ? blackText
      ? "rgba(0,0,0,0.75)"
      : "rgba(255,255,255,0.92)"
    : "rgba(255,255,255,0.92)";

  const bloom = isLight
    ? `0 0 24px ${accent}33, 0 10px 30px ${accent}26, 0 16px 40px rgba(0,0,0,0.28)`
    : isPremium
      ? `0 0 0 1px #FFFCEB, 0 0 0 3px ${accent}, 0 0 14px ${accent}B3, 0 10px 30px rgba(0,0,0,0.6)`
      : `0 0 0 1px ${accent}40, 0 0 30px ${accent}66, 0 0 70px ${accent}33, 0 14px 44px rgba(0,0,0,0.55)`;

  return {
    body: isLight
      ? resolveLightBody(planId, isMembershipTab, scheme)
      : isPremium
        ? `radial-gradient(120% 80% at 50% 0%, ${accent}30 0%, transparent 55%), linear-gradient(180deg, #0b0a06 0%, #050402 100%)`
        : `radial-gradient(120% 85% at 50% 0%, ${accent}33 0%, ${accent}12 32%, transparent 62%), linear-gradient(180deg, #0b0c0f 0%, #060607 100%)`,

    border: isLight ? `2px solid ${accent}` : isPremium ? `1px solid ${accent}` : `2px solid ${accent}59`,

    sheen: isLight
      ? "radial-gradient(120% 85% at 50% 0%, rgba(255,255,255,0.20) 0%, transparent 55%), linear-gradient(to top, rgba(0,0,0,0.10) 0%, transparent 48%)"
      : isPremium
        ? `linear-gradient(180deg, ${accent}33 0%, transparent 12%), radial-gradient(120% 70% at 50% 0%, ${accent}1A 0%, transparent 52%)`
        : `radial-gradient(135% 90% at 50% 0%, ${accent}26 0%, ${accent}0D 30%, transparent 60%)`,

    inset: isLight
      ? "inset 0 1px 0 rgba(255,255,255,0.22)"
      : isPremium
        ? `inset 0 0 20px ${accent}2B`
        : `inset 0 0 26px ${accent}1F`,

    bloom,
    // Contrast ring first so it sits tight against the border, then a wider accent halo.
    bloomSelected: `0 0 0 3px ${ring}, 0 0 0 6px ${accent}, 0 0 34px ${accent}73, 0 18px 44px rgba(0,0,0,0.34)`,
    ring,

    ink,
    inkMuted: isLight
      ? blackText
        ? "rgba(0,0,0,0.70)"
        : "rgba(255,255,255,0.80)"
      : "rgba(255,255,255,0.65)",
    inkFaint: isLight
      ? blackText
        ? "rgba(0,0,0,0.40)"
        : "rgba(255,255,255,0.55)"
      : "rgba(255,255,255,0.35)",
    divider: isLight ? (blackText ? "rgba(0,0,0,0.20)" : "rgba(255,255,255,0.45)") : `${accent}59`,

    title: gradientText
      ? {
          ...gradientText,
          ...(isPremium && !isLight
            ? { filter: `drop-shadow(0 0 4px ${accent}) drop-shadow(0 0 9px ${accent}80)` }
            : {}),
        }
      : isLight
        ? { color: ink }
        : { color: accent, textShadow: `0 0 14px ${accent}80` },

    bigNumber: isLight
      ? gradientText
        ? { ...gradientText }
        : { color: ink }
      : { color: "#FFFFFF", textShadow: `0 0 18px ${accent}, 0 0 36px ${accent}80` },

    pricePanel: {
      backgroundColor: "#0b0b0d",
      border: `1px solid ${accent}59`,
      boxShadow: `0 0 16px ${accent}26`,
    },

    cta: {
      backgroundColor: "#000000",
      border: `1.5px solid ${accent}`,
      color: accent,
      boxShadow: `0 0 18px ${accent}40, inset 0 0 12px ${accent}1F`,
      "--ta-cta-accent": accent,
    } as CSSProperties,

    accentHex: accent,
    isPremium,
    blackText,
    theme,
  };
}

/**
 * The full colour scheme a package should paint with, INCLUDING the three cross-tier
 * remaps that `resolveLightBody` above already applies to card backgrounds.
 *
 * Returns a whole SCHEME rather than one colour, because a surface usually needs more
 * than the accent. The header badge paints `badgeStyle.background` and falls back to
 * the accent only when that is absent — so remapping the accent alone left it filled
 * from the ORIGINAL tier and outlined from the remapped one.
 *
 * That is the bug this exists for: membership Tradie rendered #5ca9ec on the badge
 * while its own card rendered #00E5FF, and because getMembershipSectionColorScheme
 * returns the SAME value for `tradie-subscription` and `tradie-pack`, the badge read
 * as the ONE-TIME pack's colour to anyone comparing the two.
 *
 * Import this rather than calling a scheme getter directly.
 */
export function getRemappedPackageScheme(
  planId: string,
  isMembershipTab: boolean
): PackageColorScheme {
  const lowerId = planId.toLowerCase();
  const isTradie = lowerId.includes("tradie");
  const isBoss = lowerId.includes("boss");

  // Membership Tradie borrows the one-time Foreman scheme (electric cyan).
  if (isTradie && isMembershipTab) return getElectricPackageColorScheme("foreman-pack");
  // One-time Boss borrows the membership Foreman scheme (DeWalt yellow).
  if (isBoss && !isMembershipTab) {
    return getMembershipSectionColorScheme("foreman-subscription", true);
  }
  // Membership Boss borrows the one-time Power scheme (electric red).
  if (isBoss && isMembershipTab) return getElectricPackageColorScheme("power-pack");

  return isMembershipTab
    ? getMembershipSectionColorScheme(planId, true)
    : getElectricPackageColorScheme(planId);
}

/** The accent alone, for surfaces painting a border, a dot or a piece of text. */
export function getPackageAccentHex(planId: string, isMembershipTab: boolean): string {
  return getRemappedPackageScheme(planId, isMembershipTab).accentHex;
}
