"use client";

/**
 * WinnerStrip — "Recent Winners" marquee. A continuously-drifting horizontal
 * row of winner cards that pauses on hover. Each card is tappable and opens
 * the parent's FullscreenImageViewer at the matching index.
 *
 * Reuses the global `.marquee-track` keyframe (defined in globals.css) which
 * translates from 0 to -50% — so the children list MUST be duplicated exactly
 * twice for a seamless loop.
 */

import React from "react";
import Image from "next/image";
import type { MajorDrawWinner } from "@/hooks/queries/useWinnersQueries";
import { formatWinnerName } from "@/utils/winner-name-formatter";

interface WinnerStripProps {
  majorDrawWinners: MajorDrawWinner[];
  majorDrawWinnersLoading: boolean;
  onTileClick: (index: number) => void;
}

const CARD_CLASS =
  "group/card relative h-[140px] w-[200px] sm:h-[160px] sm:w-[240px] flex-shrink-0 overflow-hidden rounded-xl border border-gray-200 dark:border-neutral-700 bg-neutral-950 shadow-sm dark:shadow-black/30";

function WinnerCard({
  winner,
  onClick,
}: {
  winner: MajorDrawWinner;
  onClick: () => void;
}) {
  const displayImage =
    winner.imageUrl ||
    winner.prize?.images?.[0] ||
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
    <button
      type="button"
      onClick={onClick}
      className={`${CARD_CLASS} transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-red-500 dark:focus-visible:ring-offset-neutral-950`}
      aria-label={`View ${displayName} winner photo full screen`}
      title="View full screen"
    >
      <Image
        src={displayImage}
        alt={displayName}
        fill
        className="object-cover object-center transition-transform duration-500 group-hover/card:scale-105"
        sizes="(max-width: 640px) 200px, 240px"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent"
        aria-hidden
      />
      <div className="absolute bottom-0 left-0 right-0 z-10 space-y-0.5 p-2 text-left">
        <p className="line-clamp-1 text-[10px] font-bold uppercase leading-tight tracking-wider text-white/90 drop-shadow-sm">
          {winner.drawName?.trim() || "Major draw"}
        </p>
        <p className="text-[10px] tabular-nums text-white/70 drop-shadow-sm">{displayDate}</p>
        <p className="truncate font-['Poppins'] text-sm font-bold text-white drop-shadow-sm">
          {displayName}
        </p>
      </div>
    </button>
  );
}

const WinnerStrip: React.FC<WinnerStripProps> = ({
  majorDrawWinners,
  majorDrawWinnersLoading,
  onTileClick,
}) => {
  if (!majorDrawWinnersLoading && majorDrawWinners.length === 0) return null;

  // Each "set" must be wide enough to span the viewport; otherwise short lists
  // visibly hit "the end" of the marquee. Repeat the winners list inside one
  // set until it has at least 4 cards, then duplicate the set exactly twice
  // (required for the .marquee-track 0→-50% keyframe to loop seamlessly).
  const repeatsPerSet = Math.max(1, Math.ceil(4 / majorDrawWinners.length));
  const oneSet = Array.from({ length: repeatsPerSet }, () => majorDrawWinners).flat();
  const trackContent = [...oneSet, ...oneSet];
  const durationSeconds = Math.max(28, oneSet.length * 7);

  return (
    <section className="mt-4 sm:mt-5" aria-label="Recent major-draw winners">
      <header className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" />
          </span>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-700 dark:text-gray-200 sm:text-xs">
            Recent Winners
          </h3>
        </div>
      </header>

      {majorDrawWinnersLoading ? (
        <div className="flex gap-2 overflow-hidden sm:gap-3">
          <div className="h-[140px] w-[200px] sm:h-[160px] sm:w-[240px] flex-shrink-0 animate-pulse rounded-xl bg-gray-100 dark:bg-neutral-900" />
          <div className="h-[140px] w-[200px] sm:h-[160px] sm:w-[240px] flex-shrink-0 animate-pulse rounded-xl bg-gray-100 dark:bg-neutral-900" />
          <div className="h-[140px] w-[200px] sm:h-[160px] sm:w-[240px] flex-shrink-0 animate-pulse rounded-xl bg-gray-100 dark:bg-neutral-900" />
        </div>
      ) : (
        <div className="overflow-hidden">
          <div
            className="marquee-track gap-2 sm:gap-3"
            style={{
              animationDuration: `${durationSeconds}s`,
              width: "max-content",
            }}
          >
            {trackContent.map((winner, i) => (
              <WinnerCard
                key={`${winner.id}-${i}`}
                winner={winner}
                onClick={() => onTileClick(i % majorDrawWinners.length)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default WinnerStrip;
