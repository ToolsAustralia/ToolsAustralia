"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import ClassNames from "embla-carousel-class-names";
import { Trophy } from "lucide-react";
import { useRecentWinners } from "@/hooks/queries/useRecentWinners";
import { RecentWinnerCard } from "@/components/cards/RecentWinnerCard";
import { EmblaCarouselButton } from "@/components/ui/embla/EmblaCarouselButton";
import { cn } from "@/utils/cn";

interface WinnersSectionProps {
  className?: string;
  title?: string;
  subtitle?: string;
}

export default function RecentWinnersCarousel({
  className = "",
  title = "Recent Winners",
  subtitle = "Congratulations to our recent winners! Your dreams can come true too.",
}: WinnersSectionProps) {
  const { data: winners = [], isLoading } = useRecentWinners(12);

  const options = useMemo(
    () => ({
      loop: false,
      align: "start" as const,
      slidesToScroll: 1,
      containScroll: "trimSnaps" as const,
    }),
    [],
  );
  const plugins = useMemo(() => [ClassNames()], []);
  const [emblaRef, emblaApi] = useEmblaCarousel(options, plugins);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
    setCanPrev(emblaApi.canScrollPrev());
    setCanNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    setScrollSnaps(emblaApi.scrollSnapList());
    const onReInit = () => {
      setScrollSnaps(emblaApi.scrollSnapList());
      onSelect();
    };
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onReInit);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onReInit);
    };
  }, [emblaApi, onSelect]);

  return (
    <section
      className={cn(
        "relative py-16 lg:py-20 bg-gradient-to-br from-gray-50 via-white to-gray-50 w-full overflow-hidden",
        className,
      )}
    >
      <div className="relative w-full px-4 sm:px-6 lg:px-8 lg:max-w-7xl lg:mx-auto">
        {/* Section Header */}
        <div className="text-center mb-12 sm:mb-16">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="p-3 bg-gradient-to-br from-red-600 to-red-700 rounded-xl shadow-lg">
              <Trophy className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 font-poppins">
              {title}
            </h2>
          </div>
          <p className="text-base sm:text-lg text-gray-600 dark:text-neutral-400 max-w-3xl mx-auto leading-relaxed font-['Inter']">
            {subtitle}
          </p>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden animate-pulse"
              >
                <div className="h-48 bg-gray-200"></div>
                <div className="p-6 space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Winners Carousel */}
        {!isLoading && winners.length > 0 && (
          <div className="relative">
            <EmblaCarouselButton
              direction="prev"
              onClick={() => emblaApi?.scrollPrev()}
              disabled={!canPrev}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-20 hidden lg:flex"
            />
            <EmblaCarouselButton
              direction="next"
              onClick={() => emblaApi?.scrollNext()}
              disabled={!canNext}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-20 hidden lg:flex"
            />

            <div
              className="overflow-hidden"
              ref={emblaRef}
              data-carousel="true"
              style={{ touchAction: "pan-y pinch-zoom" }}
            >
              <div className="flex gap-6 lg:gap-8">
                {winners.map((w) => (
                  <article
                    key={w.id}
                    className="flex-[0_0_100%] sm:flex-[0_0_calc(50%-12px)] lg:flex-[0_0_calc(33.333%-16px)] min-w-0"
                  >
                    <RecentWinnerCard winner={w} />
                  </article>
                ))}
              </div>
            </div>

            {scrollSnaps.length > 1 && (
              <div className="flex justify-center gap-2 mt-8">
                {scrollSnaps.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => emblaApi?.scrollTo(i)}
                    className={cn(
                      "h-2 rounded-full transition-[transform,opacity,background-color] duration-[var(--ta-transition-dur)]",
                      selectedIndex === i ? "w-8 bg-red-600" : "w-2 bg-gray-300 hover:bg-gray-400",
                    )}
                    aria-label={`Go to slide ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && winners.length === 0 && (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full mb-4">
              <Trophy className="w-10 h-10 text-gray-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 font-poppins mb-2">
              No Winners Yet
            </h3>
            <p className="text-gray-600 dark:text-neutral-400 font-['Inter']">
              Check back soon to see our amazing winners!
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
