"use client";

import Image from "next/image";
import { cn } from "@/utils/cn";
import {
  PREVIEW_COLUMNS,
  PREVIEW_COLUMNS_MOBILE,
  type ContentsPreview,
  type PreviewTile,
} from "./prize-builder-model";

interface PrizeContentsStripProps {
  /** Phone grid — 4 × 2 cells. */
  previewMobile: ContentsPreview;
  /** `sm`-and-up grid — 6 × 2 cells. */
  preview: ContentsPreview;
  /** "15 power tools" and "MAKTRAK™ 7pc + Kincrome box". */
  chips: { tools: string; storage: string };
  /** Accent-filled "View full details" button colour. */
  accent: string;
  onOpenDetails: () => void;
  /** Show this item on the combo stage instead of the assembled prize. */
  onSelectTile: (tile: PreviewTile) => void;
  /** "+N more" — opens the fullscreen viewer on the first item. */
  onOpenViewer: () => void;
  /** `src` of the tile currently on the stage, so it can be ringed. */
  selectedSrc: string | null;
  className?: string;
}

/**
 * "What's in this prize" — a thumbnail preview of the gear, with the
 * "view full details" escape hatch into the specifications modal.
 *
 * Tapping a thumbnail SWAPS THE COMBO STAGE to that item (design handoff,
 * 2026-08-13). Before that every tile just opened the specs modal, which meant the
 * grid was a row of decorations: you could see twelve things you'd win but not
 * actually look at any one of them without leaving the card.
 *
 * The grid used to be `max-sm:hidden` — on the 6-column layout a phone tile was ~48px
 * and unreadable. It now renders on phones too, at **4 columns**, which is what makes
 * the swap reachable at the size most visitors are on.
 *
 * TWO GRIDS, NOT ONE RESPONSIVE GRID. The cap is per-viewport (8 cells on a phone, 12
 * from `sm`) because the "+N more" count has to be TRUTHFUL about what is hidden — a
 * single grid re-flowing from 6 to 4 columns would keep 12 cells and silently grow a
 * third row on the narrowest screens, which is exactly what the two-row cap exists to
 * prevent. Both are computed by the same `buildContentsPreview`; only the budget differs.
 */
export function PrizeContentsStrip({
  previewMobile,
  preview,
  chips,
  accent,
  onOpenDetails,
  onSelectTile,
  onOpenViewer,
  selectedSrc,
  className,
}: PrizeContentsStripProps) {
  const renderGrid = (source: ContentsPreview, columns: number, gridClassName: string) => (
    <ul
      className={cn("grid list-none gap-1.5 p-0", gridClassName)}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}
    >
      {source.tiles.map((tile) => {
        const isShowing = selectedSrc === tile.src;
        return (
          <li key={tile.src}>
            <button
              type="button"
              onClick={() => onSelectTile(tile)}
              title={tile.alt}
              aria-pressed={isShowing}
              aria-label={`Show ${tile.alt} on the prize stage`}
              className={cn(
                "flex w-full cursor-pointer flex-col items-center gap-[3px] rounded-[9px] border bg-[var(--pbc-tile-bg)] px-1 py-[5px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pbc-accent)]",
                isShowing
                  ? "border-[var(--pbc-accent)]"
                  : "border-[var(--pbc-border)] hover:border-[var(--pbc-tile-border)]"
              )}
              style={isShowing ? { boxShadow: `0 0 0 3px ${accent}24` } : undefined}
            >
              <span className="relative block h-[34px] w-full overflow-hidden rounded-md bg-white">
                <Image src={tile.src} alt="" fill sizes="80px" className="object-contain object-center" />
              </span>
              <span className="w-full truncate text-center font-poppins text-[7.5px] font-semibold leading-[1.1] text-[var(--pbc-sub)]">
                {tile.label}
              </span>
            </button>
          </li>
        );
      })}

      {source.overflowCount > 0 && (
        <li>
          <button
            type="button"
            onClick={onOpenViewer}
            className="flex h-full min-h-14 w-full cursor-pointer flex-col items-center justify-center rounded-[9px] border border-dashed border-[var(--pbc-border)] bg-[var(--pbc-control-bg)] text-[var(--pbc-sub)] transition-colors hover:text-[var(--pbc-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pbc-accent)]"
            aria-label={`View the other ${source.overflowCount} items in this prize full screen`}
          >
            <span className="font-poppins text-sm font-extrabold leading-none">
              +{source.overflowCount}
            </span>
            <span className="mt-[3px] font-poppins text-[7px] font-semibold leading-none tracking-[0.1em]">
              MORE
            </span>
          </button>
        </li>
      )}
    </ul>
  );

  return (
    <section
      className={cn(
        "min-w-0 rounded-[14px] border border-[var(--pbc-border)] bg-[var(--pbc-panel2)] px-3.5 py-[13px]",
        className
      )}
      aria-labelledby="pbc-contents-heading"
    >
      <div className="mb-2.5 flex items-center justify-between gap-2.5">
        <h3
          id="pbc-contents-heading"
          className="font-poppins text-[10.5px] font-bold uppercase leading-none tracking-[0.14em] text-[var(--pbc-text)]"
        >
          What&apos;s in this prize
        </h3>
        <button
          type="button"
          onClick={onOpenDetails}
          className="shrink-0 cursor-pointer rounded-lg px-2.5 py-1.5 font-poppins text-[9px] font-bold uppercase leading-none tracking-[0.08em] text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pbc-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pbc-panel2)]"
          style={{ background: accent }}
        >
          View full details →
        </button>
      </div>

      {renderGrid(previewMobile, PREVIEW_COLUMNS_MOBILE, "sm:hidden")}
      {renderGrid(preview, PREVIEW_COLUMNS, "hidden sm:grid")}

      {/* ONE row, scrolled rather than wrapped. The three chips land within ~6px of a 402px
          viewport's inner width, so they wrapped to a second row that was 90% empty — and a
          longer storage name (GearWrench, Sidchrome) makes it worse, not better. Nothing is
          truncated; the row just scrolls on the narrowest screens. */}
      <div className="mt-2.5 flex flex-nowrap gap-1.5 overflow-x-auto scrollbar-hide">
        <Chip>{chips.tools}</Chip>
        <Chip>{chips.storage}</Chip>
        <span className="shrink-0 whitespace-nowrap rounded-full border border-[#18a94d]/35 bg-[#18a94d]/[0.12] px-[9px] py-[5px] font-poppins text-[9.5px] font-bold leading-none text-[var(--pbc-cash-ink)]">
          $5,000 cash
        </span>
      </div>
    </section>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 whitespace-nowrap rounded-full border border-[var(--pbc-border)] bg-[var(--pbc-chip-bg)] px-[9px] py-[5px] font-poppins text-[9.5px] font-semibold leading-none text-[var(--pbc-sub)]">
      {children}
    </span>
  );
}
