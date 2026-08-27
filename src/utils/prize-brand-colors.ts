/**
 * Colour helpers for prize surfaces.
 *
 * This file used to also map a prize slug to a full brand palette
 * (`getPrizeBrandColors` / `getBrandBorderColor` / `getBrandGlowColor`). Those three had exactly
 * one consumer, `MajorDrawSection`, which was deleted on 2026-08-26 after being confirmed
 * unreachable — so they were removed with it rather than left as exports nothing calls.
 *
 * What remains is genuinely shared: the `PrizeBrandColors` shape (still a prop type on
 * `modals/ui/ModalFooter`), and the WCAG contrast helpers used by the promo gallery spotlight.
 */

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
