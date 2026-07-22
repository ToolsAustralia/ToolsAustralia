"use client";

import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { useCallback, useId, useRef } from "react";
import { cn } from "@/utils/cn";
import { FOCUS_SCALE, getReelCardGeometry, stepReel } from "./prize-builder-model";

/** Minimum shape a reel item must have. Both lanes satisfy it. */
export interface ReelItem {
  id: string;
  accent: string;
  isNew?: boolean;
}

interface SelectorReelProps<T extends ReelItem> {
  /** Step number shown in the head chip ("1" for toolbox, "2" for power toolset). */
  step: number;
  /** Head label, e.g. "Toolbox". Also names the group for assistive tech. */
  label: string;
  items: readonly T[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** Cash mode — the reel fades back but stays interactive. */
  dimmed?: boolean;
  /** Card body. `isFocused` is false in cash mode even for the selected card. */
  renderCard: (item: T, state: { isFocused: boolean }) => ReactNode;
  /** Padding etc. that differs between the two lanes. */
  cardClassName?: string;
  /** Vertical centre of the focused card's accent bloom (26% toolbox, 30% toolset). */
  glowCenterY?: string;
  className?: string;
}

/**
 * One coverflow lane of the prize builder.
 *
 * Scales to any number of brands with no layout change: cards are absolutely
 * centred and placed purely by their signed distance from the focused card, so
 * a fourth toolbox or a sixth toolset is a data entry, never a grid rewrite.
 * The geometry itself is CSS-variable driven (see `.pbc-reel-card` in
 * globals.css) so the correct breakpoint tuning paints on the first frame.
 *
 * Semantics follow the ARIA radiogroup pattern, which is what a reel actually
 * is — exactly one option is chosen: a ROVING TABINDEX (only the selected card
 * is in the tab order), Left/Right/Home/End move the selection, and focus
 * follows it so a keyboard user always has the ring on the card they just
 * selected. Clicking a side card selects it; the arrows step with wrap-around.
 */
export function SelectorReel<T extends ReelItem>({
  step,
  label,
  items,
  selectedId,
  onSelect,
  dimmed = false,
  renderCard,
  cardClassName,
  glowCenterY = "28%",
  className,
}: SelectorReelProps<T>) {
  const groupId = useId();
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.id === selectedId)
  );
  const canStep = items.length > 1;

  /** Select `id` and, when the change came from the keyboard, move focus with it. */
  const selectAndFocus = useCallback(
    (id: string) => {
      onSelect(id);
      // The card is already mounted (the whole lane renders), so focusing on the next
      // frame lands on the element that is about to become the selected one.
      requestAnimationFrame(() => cardRefs.current.get(id)?.focus());
    },
    [onSelect]
  );

  const move = useCallback(
    (direction: 1 | -1) => selectAndFocus(stepReel(items, selectedId, direction)),
    [items, selectedId, selectAndFocus]
  );

  const onStageKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!canStep) return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectAndFocus(items[0].id);
    } else if (event.key === "End") {
      event.preventDefault();
      selectAndFocus(items[items.length - 1].id);
    }
  };

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--pbc-chip-strong-bg)] font-poppins text-[10px] font-extrabold text-[var(--pbc-chip-strong-text)]"
        >
          {step}
        </span>
        <span
          id={`${groupId}-label`}
          className="font-poppins text-[11px] font-bold uppercase leading-none tracking-[0.14em] text-[var(--pbc-text)]"
        >
          {label}
        </span>
        {canStep && (
          // Honest count. The handoff mocked "4 + more", but a lane that offers exactly
          // what it shows must not imply hidden options.
          <span className="rounded-full border border-[var(--pbc-border)] bg-[var(--pbc-chip-bg)] px-[7px] py-[3px] font-poppins text-[8.5px] font-semibold leading-none tracking-[0.08em] text-[var(--pbc-sub)]">
            {items.length} options
          </span>
        )}
        <span className="flex-1" />
        {canStep && (
          <>
            <ReelArrow direction="prev" label={`Previous ${label.toLowerCase()}`} onClick={() => move(-1)} />
            <ReelArrow direction="next" label={`Next ${label.toLowerCase()}`} onClick={() => move(1)} />
          </>
        )}
      </div>

      <div
        className="pbc-reel relative my-[2px] mb-1 h-[var(--pbc-reel-stage-h)] overflow-hidden [perspective:1200px] [transform-style:preserve-3d]"
        data-dimmed={dimmed ? "true" : "false"}
        role="radiogroup"
        aria-labelledby={`${groupId}-label`}
        onKeyDown={onStageKeyDown}
      >
        {items.map((item, index) => {
          const geometry = getReelCardGeometry(index, activeIndex, items.length, dimmed);
          const isSelected = item.id === selectedId;

          return (
            <button
              key={item.id}
              ref={(node) => {
                if (node) cardRefs.current.set(item.id, node);
                else cardRefs.current.delete(item.id);
              }}
              type="button"
              role="radio"
              onClick={() => onSelect(item.id)}
              aria-checked={isSelected}
              aria-hidden={geometry.isHidden}
              // Roving tabindex: Tab reaches the lane once, then the arrows drive it.
              tabIndex={isSelected && !geometry.isHidden ? 0 : -1}
              data-focused={geometry.isFocused ? "true" : "false"}
              data-offstage={geometry.isHidden ? "true" : "false"}
              className={cn(
                "pbc-reel-card flex cursor-pointer flex-col rounded-[14px] border-[1.5px] text-center",
                // `ring-inset`, not an offset ring: the stage clips at its own bounds, so an
                // outset ring on a side card would be cut in half.
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--pbc-accent)]",
                cardClassName ?? "p-[11px]"
              )}
              style={
                {
                  "--pbc-off": geometry.offset,
                  "--pbc-off-abs": Math.abs(geometry.offset),
                  "--pbc-scale": geometry.offset === 0 ? FOCUS_SCALE : "var(--pbc-reel-side-scale)",
                  background: "var(--pbc-box-bg)",
                  borderColor: geometry.isFocused ? item.accent : "var(--pbc-border)",
                  boxShadow: geometry.isFocused
                    ? `0 0 0 1px ${item.accent}, 0 26px 60px -26px ${item.accent}`
                    : "0 16px 40px -26px rgba(0,0,0,.7)",
                } as CSSProperties
              }
            >
              {/* Accent bloom behind the focused card's artwork (alpha swaps by theme — see .pbc-glow) */}
              <span
                aria-hidden
                className="pbc-glow pointer-events-none absolute -inset-px rounded-[14px] transition-opacity duration-300"
                style={
                  {
                    "--pbc-glow-shape": `70% 55% at 50% ${glowCenterY}`,
                    "--pbc-glow-light": `${item.accent}22`,
                    "--pbc-glow-dark": `${item.accent}40`,
                    opacity: geometry.isFocused ? 1 : 0,
                  } as CSSProperties
                }
              />
              {item.isNew && <NewBadge />}
              <span className="relative flex min-h-4 items-center justify-end">
                {geometry.isFocused && <SelectedCheck accent={item.accent} />}
              </span>
              {renderCard(item, { isFocused: geometry.isFocused })}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReelArrow({
  direction,
  label,
  onClick,
}: {
  direction: "prev" | "next";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-[26px] w-[26px] shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--pbc-border)] bg-[var(--pbc-control-bg)] text-[var(--pbc-text)] transition-colors hover:bg-[var(--pbc-chip-strong-bg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pbc-accent)]"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={direction === "prev" ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} />
      </svg>
    </button>
  );
}

/** Filled brand-accent tick on the currently selected card. */
function SelectedCheck({ accent }: { accent: string }) {
  return (
    <span
      aria-hidden
      className="flex h-4 w-4 items-center justify-center rounded-full"
      style={{ background: accent }}
    >
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </span>
  );
}

/** "New" pill for a brand appearing in the draw for the first time. */
function NewBadge() {
  return (
    <span
      className="absolute left-[9px] top-[9px] z-[5] inline-flex items-center gap-[5px] rounded-full bg-[#ee0000] px-[10px] py-1 font-poppins text-[8px] font-bold uppercase leading-none tracking-[0.18em] text-white"
      style={{ boxShadow: "0 3px 10px -3px rgba(238,0,0,.7)" }}
    >
      <span aria-hidden className="h-1 w-1 rounded-full bg-white" />
      New
    </span>
  );
}
