"use client";

import Image from "next/image";
import { cn } from "@/utils/cn";
import { PREVIEW_COLUMNS, type ContentsPreview } from "./prize-builder-model";

interface PrizeContentsStripProps {
  preview: ContentsPreview;
  /** "15 power tools" and "MAKTRAK™ 7pc + Kincrome box". */
  chips: { tools: string; storage: string };
  /** Accent-filled "View full details" button colour. */
  accent: string;
  onOpenDetails: () => void;
  className?: string;
}

/**
 * "What's in this prize" — a two-row thumbnail preview of the gear, with the
 * "view full details" escape hatch into the specifications modal.
 *
 * On mobile the grid and chips collapse to just the header + button: the
 * thumbnails would be sub-40px and unreadable, and the modal shows the same
 * items at a usable size one tap away. The collapse is CSS-only (`md:` and
 * `max-sm:hidden`) so there is no breakpoint hook and no hydration shift.
 */
export function PrizeContentsStrip({
  preview,
  chips,
  accent,
  onOpenDetails,
  className,
}: PrizeContentsStripProps) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-[14px] border border-[var(--pbc-border)] bg-[var(--pbc-panel2)] px-3.5 py-[13px]",
        className
      )}
      aria-labelledby="pbc-contents-heading"
    >
      <div className="flex items-center justify-between gap-2.5 sm:mb-2.5">
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

      <div className="max-sm:hidden">
        <ul
          className="grid list-none gap-1.5 p-0"
          style={{ gridTemplateColumns: `repeat(${PREVIEW_COLUMNS}, minmax(0,1fr))` }}
        >
          {preview.tiles.map((tile) => (
            <li key={tile.src}>
              <button
                type="button"
                onClick={onOpenDetails}
                title={tile.alt}
                className="flex w-full cursor-pointer flex-col items-center gap-[3px] rounded-[9px] border border-[var(--pbc-border)] bg-[var(--pbc-tile-bg)] px-1 py-[5px] transition-colors hover:border-[var(--pbc-tile-border)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pbc-accent)]"
              >
                <span className="relative block h-[34px] w-full overflow-hidden rounded-md bg-white">
                  <Image
                    src={tile.src}
                    alt={tile.alt}
                    fill
                    sizes="80px"
                    className="object-contain object-center"
                  />
                </span>
                <span className="w-full truncate text-center font-poppins text-[7.5px] font-semibold leading-[1.1] text-[var(--pbc-sub)]">
                  {tile.label}
                </span>
              </button>
            </li>
          ))}

          {preview.overflowCount > 0 && (
            <li>
              <button
                type="button"
                onClick={onOpenDetails}
                className="flex min-h-14 w-full cursor-pointer flex-col items-center justify-center rounded-[9px] border border-dashed border-[var(--pbc-border)] bg-[var(--pbc-control-bg)] text-[var(--pbc-sub)] transition-colors hover:text-[var(--pbc-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pbc-accent)]"
                aria-label={`View the other ${preview.overflowCount} items in this prize`}
              >
                <span className="font-poppins text-sm font-extrabold leading-none">
                  +{preview.overflowCount}
                </span>
                <span className="mt-[3px] font-poppins text-[7px] font-semibold leading-none tracking-[0.1em]">
                  MORE
                </span>
              </button>
            </li>
          )}
        </ul>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Chip>{chips.tools}</Chip>
          <Chip>{chips.storage}</Chip>
          <span className="rounded-full border border-[#18a94d]/35 bg-[#18a94d]/[0.12] px-[9px] py-[5px] font-poppins text-[9.5px] font-bold leading-none text-[var(--pbc-cash-ink)]">
            $5,000 cash
          </span>
        </div>
      </div>
    </section>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-[var(--pbc-border)] bg-[var(--pbc-chip-bg)] px-[9px] py-[5px] font-poppins text-[9.5px] font-semibold leading-none text-[var(--pbc-sub)]">
      {children}
    </span>
  );
}
