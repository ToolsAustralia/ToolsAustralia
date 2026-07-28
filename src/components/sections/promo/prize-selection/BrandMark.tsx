"use client";

import type { CSSProperties } from "react";

interface BrandMarkProps {
  /**
   * Dark-theme asset. In MASK mode (no `lightSrc`) this is a white-on-transparent
   * silhouette and only its ALPHA is read. In DUO mode it is a full-colour SVG.
   */
  src: string;
  /**
   * Light-theme asset. Supplying it switches the component into DUO mode: the two files
   * are rendered as-is and swapped by theme, with no mask and no paint colour.
   *
   * Needed for marks a mask physically cannot express — a mask is single-colour by
   * construction, so GearWrench's two-tone lockup (white/black "GEAR" + orange "WRENCH"
   * + an orange gear badge holding a black "GW") requires one finished file per theme.
   */
  lightSrc?: string;
  /** Paint colour per theme. MASK mode only; ignored in duo mode. */
  color: { light: string; dark: string };
  /** Fraction of the plate the mark fills — see `ToolboxOption.markScale`. */
  scale: number;
  /** Accessible name (the brand). */
  title: string;
}

/**
 * Brand wordmark painted through a CSS mask.
 *
 * The toolbox marks in the repo are WHITE-on-transparent silhouettes; masking
 * lets ONE asset serve both themes at the brand's own colour instead of
 * disappearing on a light surface — a plain `<img>` of a fixed-colour wordmark
 * cannot do that. A mask reads only the source's ALPHA, so the SVG's own `fill`
 * is irrelevant here.
 *
 * `--pbc-mark-l` / `--pbc-mark-d` are consumed by `.pbc-brand-mark` in
 * globals.css so the theme swap is pure CSS (no JS theme read → no hydration
 * flash on these always-visible sections).
 *
 * DUO mode (`lightSrc` supplied) renders both finished files stacked and lets CSS pick one,
 * for marks a single-colour mask cannot express. The swap uses the same `.dark` ancestor
 * class as the mask path, so it stays pure CSS — no JS theme read, no hydration flash.
 *
 * Shared by the prize-builder reel cards and the /promotions gallery thumbs —
 * both render the same toolbox marks, so they must never diverge.
 */
export function BrandMark({ src, lightSrc, color, scale, title }: BrandMarkProps) {
  const size = { width: `${scale * 100}%`, height: `${scale * 100}%` } as const;

  if (lightSrc) {
    return (
      <span role="img" aria-label={title} className="pbc-brand-mark-duo block" style={size}>
        <span
          aria-hidden
          className="pbc-brand-mark-duo-light"
          style={{ backgroundImage: `url("${lightSrc}")` } as CSSProperties}
        />
        <span
          aria-hidden
          className="pbc-brand-mark-duo-dark"
          style={{ backgroundImage: `url("${src}")` } as CSSProperties}
        />
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label={title}
      className="pbc-brand-mark block"
      style={
        {
          "--pbc-mark-l": color.light,
          "--pbc-mark-d": color.dark,
          ...size,
          WebkitMaskImage: `url("${src}")`,
          maskImage: `url("${src}")`,
        } as CSSProperties
      }
    />
  );
}
