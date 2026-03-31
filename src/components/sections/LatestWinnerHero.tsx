"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useEmblaCarousel from "embla-carousel-react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import WinnerCard from "@/components/cards/WinnerCard";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import type { WinnerSummary } from "@/types/winner";

interface LatestWinnerHeroProps {
  className?: string;
  contentWrapperClassName?: string;
}

export default function LatestWinnerHero({
  className = "",
  contentWrapperClassName,
}: LatestWinnerHeroProps) {
  const theme = usePromoTheme();
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
                  <WinnerCard winner={winner} showDrawLink={false} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="hidden lg:block">
          <div className="grid gap-5 xl:grid-cols-3 lg:grid-cols-2">
            {visibleDesktopWinners.map((winner) => (
              <div key={winner.id}>
                <WinnerCard winner={winner} showDrawLink={false} />
              </div>
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
