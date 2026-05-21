import { hexToRgbaString } from "@/utils/package-colors/packageColorScheme";

/**
 * Build the layered background CSS for the Winner Testimony section frame.
 * - Two brand-tinted radial glows (top, bottom-right)
 * - Base linear gradient that swaps with site light/dark mode
 *
 * Returns a value suitable for the inline `style.background` prop.
 */
export function buildSectionBackground(primaryHex: string, isDark: boolean): string {
  const baseGradient = isDark
    ? "linear-gradient(135deg, #050811 0%, #0b1326 50%, #050811 100%)"
    : "linear-gradient(135deg, #f5f3ee 0%, #ebe7dd 50%, #f5f3ee 100%)";
  const topAlpha = isDark ? 0.16 : 0.10;
  const bottomAlpha = isDark ? 0.10 : 0.08;
  return [
    `radial-gradient(ellipse at top, ${hexToRgbaString(primaryHex, topAlpha)} 0%, transparent 35%)`,
    `radial-gradient(ellipse at bottom right, ${hexToRgbaString(primaryHex, bottomAlpha)} 0%, transparent 45%)`,
    baseGradient,
  ].join(", ");
}

/**
 * Build the brand edge-glow background used by the cinematic hero (card + modal).
 * Two radial gradients pinned to top-left and bottom-right corners.
 */
export function buildHeroEdgeGlow(primaryHex: string, isDark: boolean): string {
  const topLeftAlpha = isDark ? 0.28 : 0.22;
  const bottomRightAlpha = isDark ? 0.22 : 0.18;
  return [
    `radial-gradient(ellipse at 0% 0%, ${hexToRgbaString(primaryHex, topLeftAlpha)} 0%, transparent 35%)`,
    `radial-gradient(ellipse at 100% 100%, ${hexToRgbaString(primaryHex, bottomRightAlpha)} 0%, transparent 40%)`,
  ].join(", ");
}

/**
 * Return the brand color if it has enough luminance contrast against a light cream
 * background, otherwise a dark slate fallback. Use for text/icon accents that sit on
 * the light-mode shell (eyebrow, drop cap, etc).
 *
 * Threshold 0.6 keeps Milwaukee red and Makita cyan as brand color, swaps Ryobi neon
 * and DeWalt yellow for slate-900.
 */
export function readableBrandOnLight(primaryHex: string): string {
  const clean = primaryHex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.6 ? "#0f172a" : primaryHex;
}
