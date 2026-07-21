"use client";

import type React from "react";
import { usePromoTheme } from "@/stores/usePromoThemeStore";

/**
 * cobberAccent.ts
 *
 * Shared visual primitives for the Cobber launcher (eager) + panel (lazy).
 *
 * Kept as a LEAF module so the always-loaded launcher (ChatBubbleButton) can theme
 * and brand itself WITHOUT importing the heavy SupportChatWidget panel chunk
 * (react-markdown / AI SDK / hCaptcha). Both the eager launcher and the lazy panel
 * import from here, so the accent logic + avatar asset stay defined once.
 */

// Cobber avatar — the owner ships a real image; keep it everywhere (no mascot SVG).
export const COBBER_AVATAR = "/images/icons/cobber.png";
export const COBBER_ALT = "Cobber — Tools Australia AI support assistant";

// ── Accent ink helper ─────────────────────────────────────────────────────────
// Pick a legible text colour for a filled accent surface by the accent's relative
// luminance. LIGHT accents (DeWalt yellow #FDB813, Ryobi lime #e0ff00) → dark ink;
// everything else (Milwaukee red, blues, greens) → white. Pure; handles #RGB and
// #RRGGBB; falls back to white on any parse failure.
function accentInk(hex: string): string {
  const fallback = "#FFFFFF";
  if (typeof hex !== "string") return fallback;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return fallback;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return fallback;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? "#1A1400" : fallback;
}

/**
 * Adaptive brand accent as CSS custom properties (`--cob-acc` / `--cob-acc-deep` /
 * `--cob-acc-ink`). Reads the current promo theme (defaults to Milwaukee = TA red
 * off a prize page). Applied to the launcher + panel root elements; descendants
 * consume the vars via Tailwind arbitrary values so both surfaces colour themselves
 * from one source.
 */
export function useCobberAccentVars(): React.CSSProperties {
  const theme = usePromoTheme();
  const accent = theme.primary;
  return {
    ["--cob-acc" as string]: accent,
    ["--cob-acc-deep" as string]: theme.primaryDark,
    ["--cob-acc-ink" as string]: accentInk(accent),
  } as React.CSSProperties;
}
