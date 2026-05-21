"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ArrowRight, ChevronLeft, ChevronRight, MessageSquareQuote } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import type { WinnerSummary } from "@/types/winner";
import { SectionContainer } from "@/components/ui";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { hexToRgbaString } from "@/utils/package-colors/packageColorScheme";
import { hasWinnerTestimony } from "@/utils/winners";
import WinnerCinematicCard from "./WinnerCinematicCard";
import WinnerStoryModal from "./WinnerStoryModal";
import { buildSectionBackground, readableBrandOnLight } from "./theme";
import { cn } from "@/utils/cn";

interface WinnerTestimonySectionProps {
  winners: WinnerSummary[];
  className?: string;
}

function getContrastText(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? "#111827" : "#ffffff";
}

export default function WinnerTestimonySection({
  winners,
  className = "",
}: WinnerTestimonySectionProps) {
  const theme = usePromoTheme();
  const { theme: siteTheme } = useTheme();
  const isDark = siteTheme === "dark";
  const ctaTextColor = getContrastText(theme.primary);

  const winnersWithTestimonies = useMemo(
    () => winners.filter((w) => hasWinnerTestimony(w)),
    [winners]
  );

  const [storyModalWinnerId, setStoryModalWinnerId] = useState<string | null>(null);
  const closeStoryModal = useCallback(() => setStoryModalWinnerId(null), []);
  const openStoryModal = useCallback((id: string) => setStoryModalWinnerId(id), []);
  const storyModalWinner = useMemo(
    () => winnersWithTestimonies.find((w) => w.id === storyModalWinnerId) ?? null,
    [storyModalWinnerId, winnersWithTestimonies]
  );

  const sectionBackground = useMemo(
    () => buildSectionBackground(theme.primary, isDark),
    [theme.primary, isDark]
  );

  const titleColor = isDark ? "text-white" : "text-slate-900";
  const subtitleColor = isDark ? "text-white/70" : "text-slate-600";
  const eyebrowColor: CSSProperties = {
    color: isDark ? theme.primary : readableBrandOnLight(theme.primary),
  };

  // ---------- Empty state ----------
  if (winnersWithTestimonies.length === 0) {
    return (
      <section
        className={cn("relative py-12 sm:py-16", className)}
        style={{ background: sectionBackground }}
      >
        <SectionContainer>
          <div className="mx-auto max-w-2xl text-center">
            <div
              className={cn("mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full", isDark ? "bg-white/10 text-white/80" : "bg-slate-900/5 text-slate-700")}
            >
              <MessageSquareQuote className="h-7 w-7" />
            </div>
            <div className="mb-3 text-2xs font-extrabold uppercase tracking-[0.32em]" style={eyebrowColor}>
              — Real Stories —
            </div>
            <h2 className={cn("font-['Poppins'] text-3xl font-bold sm:text-4xl", titleColor)}>
              Hear From Our Winners
            </h2>
            <p className={cn("mt-3 text-sm sm:text-base", subtitleColor)}>
              Check back soon. We&apos;re collecting more winner stories to showcase the real people behind the prizes.
            </p>
            <div className="mt-8">
              <Link
                href="#membership"
                className="winner-motion-button inline-flex items-center gap-2 rounded-full border px-6 py-3.5 text-sm font-bold uppercase tracking-[0.14em] shadow-[0_14px_30px_rgba(15,23,42,0.2)]"
                style={{
                  background: theme.gradient,
                  color: ctaTextColor,
                  borderColor: theme.borderRgba,
                }}
              >
                Join the Winners Circle
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </SectionContainer>
      </section>
    );
  }

  // ---------- Populated state with carousel ----------
  return (
    <PopulatedSection
      winners={winnersWithTestimonies}
      sectionBackground={sectionBackground}
      isDark={isDark}
      titleColor={titleColor}
      eyebrowColor={eyebrowColor}
      ctaTextColor={ctaTextColor}
      onOpenStory={openStoryModal}
      storyModalWinner={storyModalWinner}
      onCloseStoryModal={closeStoryModal}
      className={className}
    />
  );
}

interface PopulatedSectionProps {
  winners: WinnerSummary[];
  sectionBackground: string;
  isDark: boolean;
  titleColor: string;
  eyebrowColor: CSSProperties;
  ctaTextColor: string;
  onOpenStory: (id: string) => void;
  storyModalWinner: WinnerSummary | null;
  onCloseStoryModal: () => void;
  className: string;
}

function PopulatedSection({
  winners,
  sectionBackground,
  isDark,
  titleColor,
  eyebrowColor,
  ctaTextColor,
  onOpenStory,
  storyModalWinner,
  onCloseStoryModal,
  className,
}: PopulatedSectionProps) {
  const theme = usePromoTheme();
  const hasMultiple = winners.length > 1;
  const emblaOptions = useMemo(
    () => ({
      align: "center" as const,
      loop: hasMultiple,
      containScroll: hasMultiple ? undefined : ("trimSnaps" as const),
      dragFree: false,
    }),
    [hasMultiple]
  );
  const emblaPlugins = useMemo(() => [], []);
  const [emblaRef, emblaApi] = useEmblaCarousel(emblaOptions, emblaPlugins);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const updateEmblaState = useCallback(() => {
    if (!emblaApi) return;
    setCanScrollPrev(emblaApi.canScrollPrev());
    setCanScrollNext(emblaApi.canScrollNext());
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    updateEmblaState();
    emblaApi.on("select", updateEmblaState);
    emblaApi.on("reInit", updateEmblaState);
    return () => {
      emblaApi.off("select", updateEmblaState);
      emblaApi.off("reInit", updateEmblaState);
    };
  }, [emblaApi, updateEmblaState]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const arrowBg = isDark ? "bg-black/55" : "bg-white/85";
  const arrowText = isDark ? "text-white" : "text-slate-900";
  const arrowBorderStyle: CSSProperties = { borderColor: theme.borderRgba };
  const chevronColor = isDark ? theme.primary : readableBrandOnLight(theme.primary);

  return (
    <>
      <section
        className={cn("relative overflow-hidden py-12 sm:py-16 lg:py-20", className)}
        style={{ background: sectionBackground }}
      >
        <SectionContainer>
          {/* Header */}
          <div className="mb-8 text-center lg:mb-10">
            <div
              className="mb-3 text-2xs font-extrabold uppercase tracking-[0.32em]"
              style={eyebrowColor}
            >
              — Real Stories —
            </div>
            <h2 className={cn("font-['Poppins'] text-3xl font-bold tracking-tight sm:text-4xl lg:text-[2.65rem]", titleColor)}>
              Hear From Our Winners
            </h2>
            <div className="mx-auto mt-3 h-[2px] w-12 rounded-full" style={{ background: theme.gradient }} />
          </div>

          {/* Carousel */}
          <div className="relative">
            {hasMultiple && (
              <>
                <button
                  type="button"
                  onClick={scrollPrev}
                  disabled={!canScrollPrev}
                  aria-label="Previous winner story"
                  className={cn("absolute left-0 top-1/2 z-20 hidden h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border", arrowBg, arrowText, "backdrop-blur-sm shadow-[0_14px_30px_rgba(0,0,0,0.35)] lg:flex")}
                  style={arrowBorderStyle}
                >
                  <ChevronLeft className="h-5 w-5" style={{ color: chevronColor }} />
                </button>
                <button
                  type="button"
                  onClick={scrollNext}
                  disabled={!canScrollNext}
                  aria-label="Next winner story"
                  className={cn("absolute right-0 top-1/2 z-20 hidden h-12 w-12 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border", arrowBg, arrowText, "backdrop-blur-sm shadow-[0_14px_30px_rgba(0,0,0,0.35)] lg:flex")}
                  style={arrowBorderStyle}
                >
                  <ChevronRight className="h-5 w-5" style={{ color: chevronColor }} />
                </button>
              </>
            )}

            <div className="overflow-hidden" ref={emblaRef}>
              <div className="flex">
                {winners.map((winner) => (
                  <div
                    key={winner.id}
                    className="min-w-0 flex-[0_0_92%] pl-0 pr-4 sm:flex-[0_0_88%] sm:pr-5 lg:flex-[0_0_78%] lg:px-4"
                  >
                    <WinnerCinematicCard winner={winner} onOpenStory={onOpenStory} />
                  </div>
                ))}
              </div>
            </div>

            {/* Mobile arrow + counter row */}
            {hasMultiple && (
              <div className="mt-6 flex items-center justify-center gap-4 lg:hidden">
                <button
                  type="button"
                  onClick={scrollPrev}
                  aria-label="Previous winner story"
                  className={cn("flex h-11 w-11 items-center justify-center rounded-full border", arrowBg, arrowText)}
                  style={arrowBorderStyle}
                >
                  <ChevronLeft className="h-5 w-5" style={{ color: chevronColor }} />
                </button>
                <div className={cn("text-sm font-medium", isDark ? "text-white/80" : "text-slate-700")}>
                  {selectedIndex + 1} / {winners.length}
                </div>
                <button
                  type="button"
                  onClick={scrollNext}
                  aria-label="Next winner story"
                  className={cn("flex h-11 w-11 items-center justify-center rounded-full border", arrowBg, arrowText)}
                  style={arrowBorderStyle}
                >
                  <ChevronRight className="h-5 w-5" style={{ color: chevronColor }} />
                </button>
              </div>
            )}

            {!hasMultiple && (
              <div className={cn("mt-6 text-center text-sm font-medium", isDark ? "text-white/80" : "text-slate-700")}>
                1 / 1
              </div>
            )}
          </div>

          {/* Desktop dot indicators */}
          {hasMultiple && (
            <div className="mt-8 hidden items-center justify-center gap-2 lg:flex">
              {winners.map((winner, idx) => {
                const isActive = idx === selectedIndex;
                return (
                  <button
                    key={winner.id}
                    type="button"
                    onClick={() => emblaApi?.scrollTo(idx)}
                    aria-label={`Go to winner story ${idx + 1}`}
                    className={`winner-motion-button h-2.5 rounded-full ${isActive ? "w-8" : `w-2.5 ${isDark ? "bg-white/25 hover:bg-white/45" : "bg-slate-900/20 hover:bg-slate-900/40"}`}`}
                    style={isActive ? { background: theme.gradient } : undefined}
                  />
                );
              })}
            </div>
          )}

          {/* Bottom CTA */}
          <div className="mt-10 text-center lg:mt-14">
            <Link
              href="#membership"
              className="winner-motion-button inline-flex items-center gap-2 rounded-full border px-6 py-3.5 text-sm font-bold uppercase tracking-[0.14em]"
              style={{
                background: theme.gradient,
                color: ctaTextColor,
                borderColor: theme.borderRgba,
                boxShadow: `0 14px 30px ${hexToRgbaString(theme.primary, 0.4)}`,
              }}
            >
              Join the Winners Circle
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </SectionContainer>
      </section>

      <WinnerStoryModal winner={storyModalWinner} onClose={onCloseStoryModal} />
    </>
  );
}
