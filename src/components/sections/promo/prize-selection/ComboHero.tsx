"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { cn } from "@/utils/cn";
import type { ComboPresentation, PreviewTile } from "./prize-builder-model";

interface ComboHeroProps {
  combo: ComboPresentation;
  /** Accent of the current selection — tints the stage glow and drop shadow. */
  accent: string;
  /** "27 JUL · 8PM AEST" — resolved from the live major draw; hidden when unknown. */
  drawLabel: string | null;
  /** Whether the first paint should eagerly fetch the hero art (above-the-fold instances). */
  priority?: boolean;
  /**
   * A single item from "What's in this prize", shown INSTEAD of the assembled combination.
   * Null shows the combination. See {@link PrizeContentsStrip}.
   */
  previewTile?: PreviewTile | null;
  /** Return the stage to the assembled prize. */
  onClearPreview?: () => void;
  /** Open the fullscreen inspection viewer on whatever the stage is showing. */
  onOpenViewer?: () => void;
  className?: string;
}

/**
 * The assembled prize: one white product stage showing the composite render of
 * the chosen toolbox + toolset (or the cash art), captioned with what it is and
 * when it is drawn.
 *
 * The image key changes with the selection so the cross-fade replays — the
 * animation is CSS (`.pbc-fade`) and is disabled under reduced motion.
 *
 * The stage doubles as the viewer for a single item: tapping a thumbnail in the
 * contents strip passes `previewTile` here and the corner chip becomes "back to full
 * prize" (design handoff, 2026-08-13). Everything below the stage — caption, draw chip,
 * cash flag — keeps describing the WHOLE prize while an item is previewed, because that
 * is still what the visitor wins; only the stage and its chip change.
 */
export function ComboHero({
  combo,
  accent,
  drawLabel,
  priority = false,
  previewTile = null,
  onClearPreview,
  onOpenViewer,
  className,
}: ComboHeroProps) {
  return (
    <div className={cn("relative flex min-w-0 flex-col", className)}>
      {/* Accent bloom behind the stage (alpha swaps by theme — see .pbc-glow in globals.css) */}
      <div
        aria-hidden
        className="pbc-glow pointer-events-none absolute -left-1.5 -right-1.5 -top-1.5 bottom-[55%] rounded-[20px] blur-[6px]"
        style={
          {
            "--pbc-glow-shape": "60% 70% at 50% 40%",
            "--pbc-glow-light": `${accent}22`,
            "--pbc-glow-dark": `${accent}3a`,
          } as CSSProperties
        }
      />

      {/* Dark shell matches the reel cards' panel rather than staying white: the
          combo renders are transparent, so a white slab was only ever a light-theme
          studio plate and read as a hole punched in the dark page. */}
      <div
        className="relative overflow-hidden rounded-2xl border border-black/10 bg-white p-[11px] dark:border-white/[0.14] dark:bg-[var(--pbc-panel2)]"
        style={{
          boxShadow: `0 0 0 1px ${accent}44, 0 22px 54px -30px ${accent}, 0 8px 26px -18px rgba(0,0,0,.5)`,
        }}
      >
        {/* Fixed --pbc-cash-dark ink, NOT the theme-flipping --pbc-cash-ink: this chip's
            bg is white/90 in BOTH themes, and the previous #0f8a3f was 4.45:1 — a hair
            under the 4.5:1 small-text bar. */}
        {previewTile ? (
          <button
            type="button"
            onClick={onClearPreview}
            className="absolute left-[11px] top-[11px] z-[2] inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--pbc-text)] bg-[var(--pbc-text)] px-2.5 py-[5px] font-poppins text-[8px] font-bold leading-none tracking-[0.14em] text-[var(--pbc-panel)] shadow-[0_4px_12px_-4px_rgba(0,0,0,.3)] transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pbc-accent)]"
          >
            ‹ BACK TO FULL PRIZE
          </button>
        ) : (
          <span className="absolute left-[11px] top-[11px] z-[2] inline-block whitespace-nowrap rounded-full border border-[#18a94d]/50 bg-white/90 px-2.5 py-[5px] font-poppins text-[8px] font-bold leading-none tracking-[0.14em] text-[var(--pbc-cash-dark)] shadow-[0_4px_12px_-4px_rgba(0,0,0,.3)]">
            ✓ THIS IS WHAT YOU WIN
          </span>
        )}

        {/* The stage is a button so the whole image opens the fullscreen viewer — the
            affordance a visitor reaches for first is the picture itself, not a corner icon. */}
        <button
          type="button"
          onClick={onOpenViewer}
          aria-label={`View ${previewTile?.alt ?? combo.imageAlt} full screen`}
          className="ta-product-stage relative flex aspect-[4/3] w-full cursor-zoom-in items-center justify-center rounded-[10px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pbc-accent)] lg:aspect-[16/10]"
          style={{ ["--ta-stage-bloom" as string]: `${accent}30` } as CSSProperties}
        >
          <Image
            key={previewTile?.src ?? combo.image}
            src={previewTile?.src ?? combo.image}
            alt={previewTile?.alt ?? combo.imageAlt}
            fill
            // A previewed item is never the LCP candidate — the combination is what paints first.
            priority={previewTile ? false : priority}
            sizes="(max-width: 767px) 92vw, (max-width: 1279px) 46vw, 560px"
            className="pbc-fade object-contain object-center"
          />
          <span
            aria-hidden
            className="absolute right-[11px] top-[11px] z-[2] flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[rgba(18,16,15,.6)] text-white"
          >
            <ZoomIcon />
          </span>
        </button>

        {/* Single-item captions sit ON the stage so the block below keeps describing the
            whole prize — two competing titles read as "the prize changed". */}
        {previewTile && (
          <span className="absolute bottom-[11px] left-[11px] z-[2] inline-block max-w-[70%] truncate rounded-full border border-[var(--pbc-border)] bg-[var(--pbc-panel2)] px-2.5 py-[5px] font-poppins text-[8.5px] font-bold leading-none text-[var(--pbc-text)]">
            {previewTile.alt}
          </span>
        )}

        {/* A "+ $5,000 CASH INCLUDED" pill sat here until draw 10 removed the combo cash
            bonus. Nothing replaces it: a tool combination now carries no cash component, and
            the cash-only option is its own selection rather than a flag on the gear. */}
      </div>

      <div className="px-0.5 pt-3">
        {/* `min-h-[20px]` = the drawn-date chip's own height (8px text + 2×5px padding + 2×1px
            border). The chip only appears once the live major draw resolves CLIENT-side, and
            without the reserve this row is just the 8px eyebrow until then — so the chip landing
            pushed the title, contents strip and CTA (and everything below the card) down 12px. */}
        <div className="flex min-h-[20px] items-center justify-between gap-2.5">
          <span className="font-poppins text-[8px] font-bold leading-none tracking-[0.18em] text-[var(--pbc-sub)]">
            {combo.eyebrow}
          </span>
          {drawLabel && (
            <span className="inline-flex items-center gap-[5px] whitespace-nowrap rounded-full border border-[var(--pbc-border)] bg-[var(--pbc-chip-bg)] px-[9px] py-[5px] font-poppins text-[8px] font-bold leading-none tracking-[0.1em] text-[var(--pbc-sub)]">
              <ClockIcon />
              DRAWN {drawLabel}
            </span>
          )}
        </div>
        <p className="mt-[3px] font-poppins text-[17px] font-extrabold tracking-[-0.01em] text-[var(--pbc-text)]">
          {combo.title}
        </p>
        <p className="mt-0.5 text-[11px] leading-[1.5] text-[var(--pbc-sub)]">{combo.sub}</p>
      </div>
    </div>
  );
}

function ZoomIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5M11 8v6M8 11h6" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
