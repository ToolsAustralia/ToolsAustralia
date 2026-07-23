"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { cn } from "@/utils/cn";
import type { ComboPresentation } from "./prize-builder-model";

interface ComboHeroProps {
  combo: ComboPresentation;
  /** Accent of the current selection — tints the stage glow and drop shadow. */
  accent: string;
  /** "27 JUL · 8PM AEST" — resolved from the live major draw; hidden when unknown. */
  drawLabel: string | null;
  /** Whether the first paint should eagerly fetch the hero art (above-the-fold instances). */
  priority?: boolean;
  className?: string;
}

/**
 * The assembled prize: one white product stage showing the composite render of
 * the chosen toolbox + toolset (or the cash art), captioned with what it is and
 * when it is drawn.
 *
 * The image key changes with the selection so the cross-fade replays — the
 * animation is CSS (`.pbc-fade`) and is disabled under reduced motion.
 */
export function ComboHero({ combo, accent, drawLabel, priority = false, className }: ComboHeroProps) {
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
        <span className="absolute left-[11px] top-[11px] z-[2] inline-block whitespace-nowrap rounded-full border border-[#18a94d]/50 bg-white/90 px-2.5 py-[5px] font-poppins text-[8px] font-bold leading-none tracking-[0.14em] text-[var(--pbc-cash-dark)] shadow-[0_4px_12px_-4px_rgba(0,0,0,.3)]">
          ✓ THIS IS WHAT YOU WIN
        </span>

        <div
          className="ta-product-stage relative flex aspect-[4/3] w-full items-center justify-center rounded-[10px] lg:aspect-[16/10]"
          style={{ ["--ta-stage-bloom" as string]: `${accent}30` } as CSSProperties}
        >
          <Image
            key={combo.image}
            src={combo.image}
            alt={combo.imageAlt}
            fill
            priority={priority}
            sizes="(max-width: 767px) 92vw, (max-width: 1279px) 46vw, 560px"
            className="pbc-fade object-contain object-center"
          />
        </div>

        {/* Pill bg is --pbc-cash-dark, not --pbc-cash: white 8.5px text on #18a94d is
            3.08:1 (axe violation); on the dark cash green it's 5.4:1. The shadow keeps
            the vivid brand green — it's decorative. */}
        {combo.showCashFlag && (
          <span className="absolute bottom-[11px] right-[11px] z-[2] inline-block rounded-full bg-[var(--pbc-cash-dark)] px-[11px] py-1.5 font-poppins text-[8.5px] font-extrabold leading-none tracking-[0.1em] text-white shadow-[0_8px_20px_-8px_#18a94d]">
            + $5,000 CASH INCLUDED
          </span>
        )}
      </div>

      <div className="px-0.5 pt-3">
        <div className="flex items-center justify-between gap-2.5">
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

function ClockIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
