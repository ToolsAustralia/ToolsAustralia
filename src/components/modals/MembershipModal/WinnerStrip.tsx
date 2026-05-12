"use client";

/**
 * WinnerStrip — major-draw winner carousel (two winners per slide). Tappable
 * to open FullscreenImageViewer. The carousel ref + auto-advance interval are
 * owned by the parent orchestrator; this component only handles render +
 * pointer event callbacks.
 *
 * Visual output (className strings, structure, gradient overlay) is preserved
 * byte-for-byte from the original MembershipModal.tsx
 * (lines 309-346 for tile, 5786-5835 for carousel container).
 */

import React from "react";
import Image from "next/image";
import type { MajorDrawWinner } from "@/hooks/queries/useWinnersQueries";
import { formatWinnerName } from "@/utils/winner-name-formatter";

interface WinnerStripProps {
  majorDrawWinners: MajorDrawWinner[];
  majorDrawWinnersLoading: boolean;
  majorDrawWinnerPairs: [MajorDrawWinner, MajorDrawWinner | null][];
  carouselRef: React.RefObject<HTMLDivElement | null>;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerEnd: () => void;
  onClick: () => void;
}

function renderTile(winner: MajorDrawWinner) {
  const displayImage =
    winner.imageUrl ||
    (winner.prize?.images?.[0]) ||
    "/images/promotion/PrizeHeader/PrizeHeader.webp";
  const displayName = formatWinnerName(winner.winnerFirstName, winner.winnerLastName);
  const displayDate = (
    winner.drawDate ? new Date(winner.drawDate) : new Date(winner.selectedDate)
  ).toLocaleDateString("en-AU", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-neutral-950">
      <Image
        src={displayImage}
        alt={displayName}
        fill
        className="object-contain object-center"
        sizes="(max-width: 640px) 45vw, 260px"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent"
        aria-hidden
      />
      <div className="absolute bottom-0 left-0 right-0 z-10 space-y-0.5 p-1.5 sm:space-y-1 sm:p-2">
        <p className="line-clamp-2 text-[7px] font-bold uppercase leading-tight tracking-wide text-white drop-shadow-sm sm:text-3xs">
          {winner.drawName?.trim() || "Major draw"}
        </p>
        <p className="text-[7px] tabular-nums text-white/90 drop-shadow-sm sm:text-3xs">{displayDate}</p>
        <p className="truncate font-['Poppins'] text-3xs font-bold text-white drop-shadow-sm sm:text-3xs">
          {displayName}
        </p>
      </div>
    </div>
  );
}

const WinnerStrip: React.FC<WinnerStripProps> = ({
  majorDrawWinners,
  majorDrawWinnersLoading,
  majorDrawWinnerPairs,
  carouselRef,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
  onClick,
}) => {
  if (!majorDrawWinnersLoading && majorDrawWinners.length === 0) return null;

  return (
    <div className="mt-3 sm:mt-4">
      {majorDrawWinnersLoading ? (
        <div className="grid h-[92px] sm:h-[104px] w-full grid-cols-2 gap-px overflow-hidden rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-200 dark:bg-neutral-800">
          <div className="animate-pulse bg-gray-100 dark:bg-neutral-900" />
          <div className="animate-pulse bg-gray-100 dark:bg-neutral-900" />
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onClick();
            }
          }}
          className="group block cursor-pointer rounded-xl outline-none transition-opacity hover:opacity-[0.98] focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-red-500 dark:focus-visible:ring-offset-neutral-950"
          aria-label="View winner photos full screen"
          title="View full screen"
        >
          <div
            ref={carouselRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onClick={onClick}
            className="flex w-full overflow-x-auto snap-x snap-mandatory rounded-xl border border-gray-200 dark:border-neutral-700 shadow-sm dark:shadow-black/20 [scrollbar-width:thin] scroll-smooth group-hover:border-gray-300 dark:group-hover:border-neutral-600"
          >
            {majorDrawWinnerPairs.map(([left, right]) => (
              <div
                key={`${left.id}-${right?.id ?? "single"}`}
                className="grid h-[92px] sm:h-[104px] w-full min-w-full flex-shrink-0 snap-center grid-cols-2 gap-px overflow-hidden bg-neutral-800 dark:bg-neutral-900"
              >
                {renderTile(left)}
                {right ? (
                  renderTile(right)
                ) : (
                  <div className="h-full min-h-0 bg-neutral-900/80 dark:bg-neutral-950" aria-hidden />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default WinnerStrip;
