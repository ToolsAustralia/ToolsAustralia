"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import useEmblaCarousel from "embla-carousel-react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import type { WinnerSummary } from "@/types/winner";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { formatWinnerName } from "@/utils/winner-name-formatter";
import { getWinnerDisplayDate } from "@/utils/winners";

interface LatestWinnerHeroProps {
  className?: string;
  contentWrapperClassName?: string;
}

function getContrastText(hex: string) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? "#111827" : "#ffffff";
}

export default function LatestWinnerHero({
  className = "",
  contentWrapperClassName,
}: LatestWinnerHeroProps) {
  const theme = usePromoTheme();
  const themeTextColor = getContrastText(theme.primary);
  const [winners, setWinners] = useState<WinnerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleDesktopCount, setVisibleDesktopCount] = useState(3);

  const emblaOptions = useMemo(
    () => ({
      align: "start" as const,
      loop: winners.length > 1,
      dragFree: false,
    }),
    [winners.length]
  );

  const [emblaRef, emblaApi] = useEmblaCarousel(emblaOptions);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  useEffect(() => {
    const fetchWinners = async () => {
      try {
        const response = await fetch("/api/winners/all?limit=12");
        const data = await response.json();

        if (response.ok && data.success && Array.isArray(data.winners)) {
          setWinners(data.winners);
        }
      } catch (error) {
        console.error("Error fetching winners:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchWinners();
  }, []);

  const updateCarouselState = useCallback(() => {
    if (!emblaApi) return;
    setCanScrollPrev(emblaApi.canScrollPrev());
    setCanScrollNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;

    updateCarouselState();
    emblaApi.on("select", updateCarouselState);
    emblaApi.on("reInit", updateCarouselState);

    return () => {
      emblaApi.off("select", updateCarouselState);
      emblaApi.off("reInit", updateCarouselState);
    };
  }, [emblaApi, updateCarouselState]);

  useEffect(() => {
    if (loading || winners.length === 0 || !emblaApi) return;
    emblaApi.reInit({
      align: "start",
      loop: winners.length > 1,
      dragFree: false,
    });
  }, [loading, emblaApi, winners.length]);

  const visibleDesktopWinners = useMemo(
    () => winners.slice(0, visibleDesktopCount),
    [visibleDesktopCount, winners]
  );
  const hasMoreDesktopWinners = visibleDesktopCount < winners.length;

  if (loading) {
    return (
      <section className={`py-6 sm:py-8 ${className}`}>
        <div className={contentWrapperClassName || "max-w-7xl mx-auto"}>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((index) => (
              <div
                key={index}
                className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)] animate-pulse"
              >
                <div className="bg-slate-950 p-4">
                  <div className="mb-4 h-5 w-36 rounded bg-slate-700" />
                  <div className="aspect-[4/4.1] rounded-[18px] bg-slate-800" />
                  <div className="mt-4 h-4 w-28 rounded bg-slate-700" />
                  <div className="mt-4 h-7 w-40 rounded bg-slate-700" />
                  <div className="mt-2 h-5 w-28 rounded bg-slate-800" />
                </div>
                <div className="space-y-3 p-5">
                  <div className="h-4 w-2/3 rounded bg-slate-200" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!winners.length) {
    return null;
  }

  const renderWinnerCard = (winner: WinnerSummary) => {
    const formattedName = formatWinnerName(winner.winnerFirstName, winner.winnerLastName);
    const displayImage =
      winner.imageUrl || winner.prize.images[0] || "/images/placeholders/prize-placeholder.png";
    const prizeLabel = winner.selectedPrize || winner.prize.name;
    const prizeLine = prizeLabel.length > 34 ? `${prizeLabel.slice(0, 34).trim()}...` : prizeLabel;
    const dateLabel = `${getWinnerDisplayDate(winner).toUpperCase()} WINNER`;

    return (
      <article
        className="overflow-hidden rounded-[24px] border bg-white shadow-[0_18px_42px_rgba(15,23,42,0.10)] dark:border-neutral-700 dark:bg-neutral-900"
        style={{ borderColor: theme.borderRgba }}
      >
        <div className="relative overflow-hidden bg-slate-950 px-4 pb-4 pt-4 text-white">
          <div
            className="absolute inset-0 opacity-90"
            style={{
              background: `radial-gradient(circle at top right, ${theme.shadowRgba.replace(/,\s*[\d.]+\)/, ", 0.22)")}, transparent 28%), radial-gradient(circle at bottom left, rgba(238,0,0,0.16), transparent 30%)`,
            }}
          />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/15 to-transparent" />

          <div className="relative z-10">
            <div className="mb-3">
              <span
                className="inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] shadow-sm backdrop-blur"
                style={{ borderColor: theme.borderRgba, backgroundColor: "rgba(2,6,23,0.62)" }}
              >
                {dateLabel}
              </span>
            </div>

            <div
              className="rounded-[20px] p-[3px] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
              style={{ background: `linear-gradient(135deg, ${theme.primaryDark} 0%, ${theme.primary} 48%, ${theme.primaryLight} 100%)` }}
            >
              <div className="group relative aspect-[4/4.1] overflow-hidden rounded-[16px] bg-slate-900">
                <Image
                  src={displayImage}
                  alt={`${formattedName} - ${winner.drawName}`}
                  fill
                  className="object-cover transition-transform duration-700 ease-out motion-reduce:transition-none group-hover:scale-[1.03] motion-reduce:group-hover:scale-100"
                  sizes="(max-width: 768px) 88vw, (max-width: 1280px) 46vw, 31vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <h3 className="min-w-0 flex-1 text-[1.65rem] font-bold leading-tight tracking-tight font-['Poppins'] text-white sm:text-[1.8rem]">
                {formattedName}
              </h3>
              <span
                className="inline-flex flex-shrink-0 items-center rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] shadow-[0_8px_18px_rgba(15,23,42,0.20)]"
                style={{ background: theme.gradient, color: themeTextColor }}
              >
                <span className="sm:hidden">1st Prize</span>
                <span className="hidden sm:inline">1st Prize Winner</span>
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-200">{prizeLine}</p>
          </div>
        </div>

        <div className="relative bg-white px-5 py-5 text-center dark:bg-neutral-900">
          <div className="absolute inset-x-0 top-0 h-px" style={{ background: theme.gradient }} />
          <p className="text-sm text-slate-500 dark:text-neutral-400">Congratulations to our winner!</p>
        </div>
      </article>
    );
  };

  return (
    <section id="latest-winners" className={`relative overflow-hidden py-8 sm:py-10 ${className}`}>
      <div className={contentWrapperClassName || "max-w-7xl mx-auto"}>
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 h-1 w-24 rounded-full" style={{ background: theme.gradient }} />
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 font-['Poppins'] dark:text-white sm:text-4xl">
            Latest Winners
          </h2>
        </div>

        <div className="relative lg:hidden">
          {winners.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => emblaApi?.scrollPrev()}
                disabled={!canScrollPrev}
                aria-label="Previous latest winner"
                className="absolute left-2 top-[42%] z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border bg-white/95 text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.18)] winner-motion-button disabled:opacity-40 dark:bg-neutral-900 dark:text-white"
                style={{ borderColor: theme.borderRgba }}
              >
                <ChevronLeft className="h-4 w-4" style={{ color: theme.primaryLight }} />
              </button>
              <button
                type="button"
                onClick={() => emblaApi?.scrollNext()}
                disabled={!canScrollNext}
                aria-label="Next latest winner"
                className="absolute right-2 top-[42%] z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border bg-white/95 text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.18)] winner-motion-button disabled:opacity-40 dark:bg-neutral-900 dark:text-white"
                style={{ borderColor: theme.borderRgba }}
              >
                <ChevronRight className="h-4 w-4" style={{ color: theme.primaryLight }} />
              </button>
            </>
          )}

          <div className="overflow-hidden" ref={emblaRef}>
            <div className="flex">
              {winners.map((winner) => (
                <div key={winner.id} className="min-w-0 flex-[0_0_86%] pr-4 sm:flex-[0_0_62%]">
                  {renderWinnerCard(winner)}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="hidden lg:block">
          <div className="grid gap-5 xl:grid-cols-3 lg:grid-cols-2">
            {visibleDesktopWinners.map((winner) => (
              <div key={winner.id}>{renderWinnerCard(winner)}</div>
            ))}
          </div>

          <div className="mt-8 text-center">
            {hasMoreDesktopWinners ? (
              <button
                type="button"
                onClick={() => setVisibleDesktopCount((count) => Math.min(count + 3, winners.length))}
                className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-slate-500 winner-motion-button hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white"
              >
                See More
              </button>
            ) : (
              <Link
                href="/winners"
                className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-slate-500 winner-motion-button hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white"
              >
                View All Winners
              </Link>
            )}
          </div>
        </div>

        <div className="mt-8 text-center sm:mt-10">
          <Link
            href="#membership"
            className="inline-flex items-center gap-2 rounded-full border bg-slate-950 px-6 py-3.5 text-sm font-bold uppercase tracking-[0.14em] text-white shadow-[0_14px_30px_rgba(15,23,42,0.18)] winner-motion-button dark:bg-white dark:text-slate-950"
            style={{ borderColor: theme.borderRgba }}
          >
            Join our next giveaway
            <ArrowRight className="h-4 w-4" style={{ color: theme.primaryLight }} />
          </Link>
        </div>
      </div>
    </section>
  );
}
