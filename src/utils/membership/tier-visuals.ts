/**
 * Shared tier/pack visual helpers — ported verbatim from the Claude Design
 * prototype (system.js) so the glossy card fills + ink contrast match exactly.
 */

export const TIER_HEX = { tradie: "#00c2ed", foreman: "#ffd200", boss: "#ee0000" } as const;
export type TierKey = keyof typeof TIER_HEX;

/** Canonical past-due accent (amber). Single source of truth for the JS `style`/color usages across
 *  the past-due surfaces (dashboard hero theme, PartnerPreview, RewardsPartnerCard, tier list border).
 *  Tailwind arbitrary-value class strings (e.g. `border-[#d97706]`) can't consume a JS const, so those
 *  designed gradient/shade literals stay inline. */
export const PAST_DUE_AMBER = "#d97706";

export function tierKeyFromName(name: string): TierKey {
  const n = name.toLowerCase();
  if (n.includes("foreman")) return "foreman";
  if (n.includes("boss")) return "boss";
  return "tradie";
}

/** Shade a hex toward black (pct<0) or white (pct>0) by pct%. */
export function shade(hex: string, pct: number): string {
  const h = hex.replace("#", "");
  let r = parseInt(h.slice(0, 2), 16);
  let g = parseInt(h.slice(2, 4), 16);
  let b = parseInt(h.slice(4, 6), 16);
  const t = pct < 0 ? 0 : 255;
  const p = Math.abs(pct) / 100;
  r = Math.round((t - r) * p) + r;
  g = Math.round((t - g) * p) + g;
  b = Math.round((t - b) * p) + b;
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Dark ink on light fills, white ink on dark fills (luminance > 0.62 → dark). */
export function inkOn(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#0a0a0a" : "#ffffff";
}

export const inkDark = (hex: string): boolean => inkOn(hex) === "#0a0a0a";

/** The shared glossy tier/pack card fill — one source of truth for every package card. */
export const glossGrad = (c: string): string =>
  `linear-gradient(150deg,${shade(c, -24)} 0%,${c} 40%,${shade(c, 34)} 50%,${c} 60%,${shade(c, -24)} 100%)`;

/** Multipliers that have a matching /images/badge/X{n}.webp asset. */
const BADGE_MULTIPLIERS = new Set([2, 3, 5, 10, 12, 15, 20]);

/**
 * Path to the X{n} promo-multiplier badge art, or null if no asset exists for
 * that multiplier (caller falls back to a text pill). Keeps an arbitrary admin
 * multiplier from 404-ing on a missing image.
 */
export const multiplierBadgeSrc = (multiplier: number): string | null =>
  BADGE_MULTIPLIERS.has(multiplier) ? `/images/badge/X${multiplier}.webp` : null;
