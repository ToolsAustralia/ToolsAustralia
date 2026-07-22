"use client";

import type { CSSProperties } from "react";

interface BrandMarkProps {
  /** White-on-transparent silhouette SVG — only its ALPHA is read. */
  src: string;
  /** Paint colour per theme, so one asset reads on both card surfaces. */
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
 * Shared by the prize-builder reel cards and the /promotions gallery thumbs —
 * both render the same three toolbox marks, so they must never diverge.
 */
export function BrandMark({ src, color, scale, title }: BrandMarkProps) {
  return (
    <span
      role="img"
      aria-label={title}
      className="pbc-brand-mark block"
      style={
        {
          "--pbc-mark-l": color.light,
          "--pbc-mark-d": color.dark,
          width: `${scale * 100}%`,
          height: `${scale * 100}%`,
          WebkitMaskImage: `url("${src}")`,
          maskImage: `url("${src}")`,
        } as CSSProperties
      }
    />
  );
}
