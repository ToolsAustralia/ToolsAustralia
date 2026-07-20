"use client";

/**
 * WinnerStrip — "Recent Winners" auto-scroll carousel that the user can also
 * drag/swipe through. Mirrors the pattern in `components/ui/BrandScroller.tsx`:
 * Embla + AutoScroll plugin with `stopOnInteraction: false` so motion resumes
 * after the user lets go. Each card opens the parent's FullscreenImageViewer.
 */

import React, { useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import useEmblaCarousel from "embla-carousel-react";
import AutoScroll from "embla-carousel-auto-scroll";
import type { MajorDrawWinner } from "@/hooks/queries/useWinnersQueries";
import { formatWinnerName } from "@/utils/winner-name-formatter";
import { useInViewportAnimation } from "@/hooks/useInViewportAnimation";

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
        className="object-cover object-center transition-transform duration-500 group-hover/card:scale-105 pointer-events-none"
        sizes="(max-width: 640px) 200px, 240px"
        draggable={false}
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
        <p className="truncate font-poppins text-sm font-bold text-white drop-shadow-sm">
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
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInViewportAnimation(rootRef);

  const options = useMemo(
    () => ({ loop: true, align: "start" as const, dragFree: true, skipSnaps: true }),
    []
  );
  const plugins = useMemo(
    () => [
      AutoScroll({
        speed: 0.9,
        startDelay: 50,
        stopOnInteraction: false,
        stopOnMouseEnter: false,
        stopOnFocusIn: false,
      }),
    ],
    []
  );
  const [emblaRef, emblaApi] = useEmblaCarousel(options, plugins);

  // Pause auto-scroll when off-screen / when modal is hidden behind another viewport.
  useEffect(() => {
    if (!emblaApi) return;
    const auto = emblaApi.plugins().autoScroll;
    if (!auto) return;
    if (inView) (auto as unknown as { play?: () => void }).play?.();
    else (auto as unknown as { stop?: () => void }).stop?.();
  }, [emblaApi, inView]);

  if (!majorDrawWinnersLoading && majorDrawWinners.length === 0) return null;

  // Render the list twice so Embla's loop has enough content to wrap seamlessly
  // even with very short winner lists (mirrors BrandScroller).
  const slides = [...majorDrawWinners, ...majorDrawWinners];

  return (
    <section ref={rootRef} className="mt-4 sm:mt-5" aria-label="Recent major-draw winners">
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
        <div className="overflow-hidden" data-carousel="true">
          <div ref={emblaRef} style={{ touchAction: "pan-y pinch-zoom" }}>
            <div className="flex gap-2 sm:gap-3">
              {slides.map((winner, i) => (
                <WinnerCard
                  key={`${winner.id}-${i}`}
                  winner={winner}
                  onClick={() => onTileClick(i % majorDrawWinners.length)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default WinnerStrip;
