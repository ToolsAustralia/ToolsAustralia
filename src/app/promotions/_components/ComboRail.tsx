"use client";

import Image from "next/image";
import type { CSSProperties, KeyboardEvent } from "react";
import { useCallback, useId, useRef } from "react";
import { Banknote, Check } from "lucide-react";
import { cn } from "@/utils/cn";
import { BrandMark } from "@/components/sections/promo/prize-selection/BrandMark";
import {
  CASH_OPTION,
  TOOLBOXES,
  TOOLSETS,
} from "@/components/sections/promo/prize-selection/constants";
import {
  getComboPresentation,
  type PrizeSelection,
} from "@/components/sections/promo/prize-selection/prize-builder-model";
import {
  CASH_ONLY_AMOUNT,
  COMBINATION_COUNT,
  isComboSelected,
  needsMarkOutline,
  toolsetKitLine,
} from "./gallery-spotlight-model";

/** A third of the rail column: ~130px on desktop, a third of the viewport below `lg`. */
const THUMB_SIZES = "(min-width: 1024px) 160px, 33vw";

interface ComboRailProps {
  selection: PrizeSelection;
  onSelectCombo: (toolsetId: string, toolboxId: string) => void;
  onSelectCash: () => void;
}

/**
 * The browse rail — every combination, grouped by power toolset, plus the cash
 * opt-out at the foot.
 *
 * Scales by DATA: groups are `TOOLSETS` and each group's thumbs are `TOOLBOXES`,
 * so a sixth toolset or a fourth toolbox is one registry record — the grid
 * (`repeat(3,1fr)`) is driven off `TOOLBOXES.length`, never a hand-written
 * column count.
 *
 * Semantics follow the ARIA radiogroup pattern — the rail is one single-select
 * control whose 16th option is "take the cash". A ROVING TABINDEX keeps the rail
 * to ONE tab stop (16 stops would bury the fine print for keyboard users);
 * Left/Right walk the flat option order, Up/Down jump a whole toolbox row so a
 * keyboard user moves between brands the way the visual grouping implies, and
 * focus follows selection so the preview always matches the focused thumb.
 */
export default function ComboRail({ selection, onSelectCombo, onSelectCash }: ComboRailProps) {
  const headingId = useId();
  const optionRefs = useRef(new Map<string, HTMLButtonElement>());

  /** Flat option order: every combination in rail order, then the cash tile. */
  const options = TOOLSETS.flatMap((toolset) =>
    TOOLBOXES.map((toolbox) => ({ key: `${toolset.id}-${toolbox.id}`, toolset, toolbox }))
  );
  const cashKey = CASH_OPTION.slug;
  const activeKey = selection.isCash ? cashKey : `${selection.toolset}-${selection.toolbox}`;

  const selectAndFocus = useCallback(
    (key: string) => {
      if (key === cashKey) {
        onSelectCash();
      } else {
        const option = options.find((o) => o.key === key);
        if (!option) return;
        onSelectCombo(option.toolset.id, option.toolbox.id);
      }
      // Every option is mounted, so focusing on the next frame lands on the
      // element that is about to become the checked radio.
      requestAnimationFrame(() => optionRefs.current.get(key)?.focus());
    },
    [cashKey, onSelectCash, onSelectCombo, options]
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // The cash tile is the last option; `keys` is the full walkable order.
    const keys = [...options.map((o) => o.key), cashKey];
    const current = Math.max(0, keys.indexOf(activeKey));
    const step = TOOLBOXES.length;

    const moveTo = (index: number) => {
      event.preventDefault();
      selectAndFocus(keys[(index + keys.length) % keys.length]);
    };

    switch (event.key) {
      case "ArrowRight":
        return moveTo(current + 1);
      case "ArrowLeft":
        return moveTo(current - 1);
      case "ArrowDown":
        return moveTo(Math.min(current + step, keys.length - 1));
      case "ArrowUp":
        return moveTo(Math.max(current - step, 0));
      case "Home":
        return moveTo(0);
      case "End":
        return moveTo(keys.length - 1);
      default:
    }
  };

  return (
    // `lg:h-0 lg:min-h-full`: as a grid item the rail would otherwise size the row to
    // its own ~1100px of content. Contributing ZERO intrinsic height lets the preview
    // column set the row, then `min-height:100%` stretches the rail back to exactly
    // that — so the scroll area ends flush with the preview instead of stopping short
    // at a fixed cap and leaving dead space under it.
    <div className="flex min-w-0 flex-col lg:h-0 lg:min-h-full">
      {/* Stacked under `sm`: side by side, the title and hint each wrap to two lines
          inside a 375px viewport and the head reads as four ragged lines. */}
      <div className="mb-3 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2.5">
        <div className="flex items-center gap-2">
          <h2
            id={headingId}
            className="font-poppins text-[15px] font-black uppercase tracking-[-0.01em] text-[var(--pgs-text)] lg:text-[17px]"
          >
            Every combination
          </h2>
          {/* Honest count, derived — same chip vocabulary as the prize builder's
              "{n} options" lane header. */}
          <span className="whitespace-nowrap rounded-full border border-[var(--pgs-border)] bg-[var(--pgs-card)] px-2 py-[3px] font-poppins text-[9px] font-bold leading-none tracking-[0.08em] text-[var(--pgs-sub)]">
            {COMBINATION_COUNT} combos
          </span>
        </div>
        {/* No cash claim here since draw 10 — the $5,000 that used to ride on every
            combination is gone, and the cash-only option is its own tile in the rail. */}
        <span className="font-poppins text-[10.5px] font-semibold text-[var(--pgs-sub)]">
          Tap to preview any combination
        </span>
      </div>

      {/* Desktop scrolls the rail inside the stage; mobile is a plain stack so the
          page keeps ONE vertical scroll. `min-h-0` is required for a flex child to
          be allowed to shrink below its content and actually scroll. */}
      <div
        role="radiogroup"
        aria-labelledby={headingId}
        onKeyDown={onKeyDown}
        className="pgs-rail flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2"
      >
        {TOOLSETS.map((toolset) => (
          <div key={toolset.id} className="flex flex-col gap-2.5">
            <div className="relative flex min-h-[36px] items-center gap-3 pl-3.5">
              <span
                aria-hidden
                className="absolute inset-y-px left-0 w-[3px] rounded-sm"
                style={{ background: toolset.accent }}
              />
              {/* `wordmarkScale` levels the marks to a common LETTER height: each is sized
                  by HEIGHT (a % of the plate), its width follows, and it is pinned
                  left-centre — a centred fit would let the wider brands creep out both
                  sides of the plate.

                  The width/height props declare a 10:1 box, which is DELIBERATELY WIDER than
                  the widest wordmark (HiKOKI, 6.58:1). They no longer describe the files:
                  draw 10 cropped every `brands/name/*.svg` viewBox to its real glyph bounds,
                  so the old 700×200 (3.5:1) would now letterbox or offset most marks. Because
                  the declared box is wider than any mark, `object-contain` is always
                  HEIGHT-bound, so every mark lands at exactly `wordmarkScale × plate` tall and
                  `object-left` keeps it pinned. Keep this ratio above the widest aspect that
                  `npm run check:brand-wordmarks` reports. */}
              <span className="relative block h-9 w-[156px] shrink-0 overflow-hidden">
                <Image
                  src={toolset.wordmark}
                  alt={toolset.name}
                  width={2000}
                  height={200}
                  unoptimized
                  className={cn(
                    "absolute left-0 top-1/2 w-auto max-w-none -translate-y-1/2 object-contain object-left",
                    // Low-contrast brand colours all but vanish on the near-white light
                    // stage. A hairline keeps them legible without putting a plate around
                    // some brands and not others — derived from the accent, so a future
                    // brand is covered with no code change. Dark mode needs none.
                    needsMarkOutline(toolset.accent) && "pgs-mark-outline"
                  )}
                  style={{ height: `${toolset.wordmarkScale * 100}%` }}
                />
              </span>
              <span className="font-poppins text-[9.5px] font-bold leading-tight text-[var(--pgs-sub)]">
                {toolsetKitLine(toolset)}
              </span>
            </div>

            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${TOOLBOXES.length}, minmax(0, 1fr))` }}
            >
              {TOOLBOXES.map((toolbox) => {
                const key = `${toolset.id}-${toolbox.id}`;
                const active = isComboSelected(selection, toolset.id, toolbox.id);
                const combo = getComboPresentation(toolbox, toolset, false);

                return (
                  <button
                    key={key}
                    ref={(node) => {
                      if (node) optionRefs.current.set(key, node);
                      else optionRefs.current.delete(key);
                    }}
                    type="button"
                    role="radio"
                    // Explicit name: the art and the wordmark are decoration here, so
                    // the radio announces the combination once, not "Makita Kincrome
                    // Kincrome" assembled from its children.
                    aria-label={`${toolset.name} × ${toolbox.brandName}`}
                    aria-checked={active}
                    tabIndex={activeKey === key ? 0 : -1}
                    onClick={() => onSelectCombo(toolset.id, toolbox.id)}
                    className={cn(
                      "group relative block overflow-hidden rounded-[11px] border-[1.5px] bg-[var(--pgs-card)] text-left",
                      "transition-[transform,border-color,box-shadow] duration-[250ms] hover:-translate-y-[3px] motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                    )}
                    style={
                      {
                        borderColor: active ? toolset.accent : "var(--pgs-border)",
                        boxShadow: active
                          ? `0 0 0 1px ${toolset.accent}, 0 12px 26px -14px ${toolset.accent}`
                          : undefined,
                        // Focus ring tracks the brand of the thumb, not the current accent.
                        ["--tw-ring-color" as string]: toolset.accent,
                      } as CSSProperties
                    }
                  >
                    {/* The combo renders are composited on white, so the plate stays
                        white in both themes — a lit display case in dark mode. */}
                    {/* Desktop keeps the handoff's flat 106px. Below `lg` the rail is
                        full-width instead of a third of the stage, so a fixed height
                        letterboxed the render into a 245×106 strip at 768px — there the
                        thumb takes a ratio and scales with its column instead. */}
                    <span
                      aria-hidden
                      className="ta-product-stage relative block aspect-[128/106] w-full lg:aspect-auto lg:h-[106px]"
                      style={{ ["--ta-stage-bloom" as string]: `${toolset.accent}26` } as CSSProperties}
                    >
                      <Image
                        src={combo.image}
                        alt=""
                        fill
                        sizes={THUMB_SIZES}
                        className="object-cover object-[center_40%]"
                      />
                    </span>

                    <span
                      aria-hidden
                      className="flex h-[34px] items-center justify-center border-t border-[var(--pgs-border)] px-2.5"
                    >
                      {/* Fixed 22px plate: `BrandMark` sizes itself as a PERCENTAGE of its
                          plate, so the registry's `markScale` levels the wordmarks
                          to a common letter height exactly as it does on the reel cards.
                          `markImageLight` is passed through so GearWrench's two-tone mark
                          renders here identically to the reel card — this rail and the reel
                          show the same brands and must never diverge. */}
                      <span className="flex h-[22px] w-full items-center justify-center">
                        <BrandMark
                          src={toolbox.markImage}
                          lightSrc={toolbox.markImageLight}
                          color={toolbox.markColor}
                          scale={toolbox.markScale}
                          title={toolbox.brandName}
                        />
                      </span>
                    </span>

                    {active && (
                      <span
                        aria-hidden
                        className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full"
                        style={{ background: toolset.accent }}
                      >
                        <Check className="h-2.5 w-2.5 text-white" strokeWidth={4} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Cash opt-out — the 16th option, styled as the gold alternative. */}
        <button
          ref={(node) => {
            if (node) optionRefs.current.set(cashKey, node);
            else optionRefs.current.delete(cashKey);
          }}
          type="button"
          role="radio"
          aria-checked={selection.isCash}
          tabIndex={activeKey === cashKey ? 0 : -1}
          onClick={onSelectCash}
          className={cn(
            "relative flex items-center gap-3 rounded-[14px] border border-[#e4c86a]/70 bg-gradient-to-br from-[#f9e9ad] to-[#e4c05a] px-3.5 py-3 text-left text-[#241a02]",
            "shadow-[0_16px_36px_-20px_rgba(212,175,55,0.6)] transition-transform duration-[250ms] hover:-translate-y-[3px] motion-reduce:transition-none motion-reduce:hover:translate-y-0",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#241a02]",
            // The tile is the 16th radio, so its checked state needs the same visible
            // counterpart the thumbs get — in the gold tile's own ink, not the accent.
            selection.isCash && "ring-2 ring-[#241a02]"
          )}
        >
          {selection.isCash && (
            <span
              aria-hidden
              className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#241a02]"
            >
              <Check className="h-2.5 w-2.5 text-[#f6dd8c]" strokeWidth={4} />
            </span>
          )}
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-[#241a02]/90">
            <Banknote className="h-5 w-5 text-[#f6dd8c]" />
          </span>
          <span className="min-w-0">
            <span className="block font-poppins text-sm font-black uppercase leading-tight">
              Rather have cash?
            </span>
            <span className="block font-poppins text-[10.5px] font-medium leading-tight text-[#241a02]/75">
              Take {CASH_ONLY_AMOUNT} tax-free instead
            </span>
          </span>
          <span className="ml-auto inline-flex shrink-0 items-center rounded-full bg-[#241a02] px-3 py-2 font-poppins text-xs font-black uppercase text-[#f6dd8c]">
            {CASH_ONLY_AMOUNT} →
          </span>
        </button>
      </div>
    </div>
  );
}
