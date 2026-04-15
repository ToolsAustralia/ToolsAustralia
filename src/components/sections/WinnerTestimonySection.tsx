"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import {
  ArrowRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Gift,
  MapPin,
  MessageSquareQuote,
  Quote,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { WinnerSummary } from "@/types/winner";
import { ModalContainer, ModalContent, ModalHeader } from "@/components/modals/ui";
import { SectionContainer } from "@/components/ui";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { formatWinnerName } from "@/utils/winner-name-formatter";
import {
  getWinnerDisplayDate,
  getWinnerTestimonyExcerpt,
  hasWinnerTestimony,
  stripRichTextHtml,
} from "@/utils/winners";

interface WinnerTestimonySectionProps {
  winners: WinnerSummary[];
  className?: string;
}

function getContrastText(hex: string) {
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
  const themeTextColor = getContrastText(theme.primary);
  const winnersWithTestimonies = useMemo(
    () => winners.filter((winner) => hasWinnerTestimony(winner)),
    [winners]
  );
  const [storyModalWinnerId, setStoryModalWinnerId] = useState<string | null>(null);
  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      align: "center",
      loop: winnersWithTestimonies.length > 1,
      containScroll: winnersWithTestimonies.length > 1 ? undefined : "trimSnaps",
      dragFree: false,
    },
    []
  );
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
  const closeStoryModal = useCallback(() => setStoryModalWinnerId(null), []);

  const storyModalWinner = useMemo(
    () => winnersWithTestimonies.find((w) => w.id === storyModalWinnerId) ?? null,
    [storyModalWinnerId, winnersWithTestimonies]
  );

  if (winnersWithTestimonies.length === 0) {
    return (
      <section
        className={`relative bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 py-12 sm:py-16 ${className}`}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(circle at top, ${theme.shadowRgba.replace(/,\s*[\d.]+\)/, ", 0.18)")}, transparent 32%)`,
          }}
        />
        <SectionContainer>
          <div className="mx-auto max-w-2xl text-center">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white/80">
              <MessageSquareQuote className="h-7 w-7" />
            </div>
            <h2 className="text-3xl font-bold text-white font-['Poppins'] sm:text-4xl">
              Hear From Our Winners
            </h2>
            <p className="mt-3 text-sm text-slate-300 sm:text-base">
              Check back soon. We&apos;re collecting more winner stories to showcase the real people
              behind the prizes.
            </p>
            <div className="mt-8">
              <Link
                href="#membership"
                className="inline-flex items-center gap-2 rounded-full border px-6 py-3.5 text-sm font-bold uppercase tracking-[0.14em] shadow-[0_14px_30px_rgba(15,23,42,0.2)] winner-motion-button"
                style={{
                  background: theme.gradient,
                  color: themeTextColor,
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

  const renderCard = (winner: WinnerSummary) => {
    const formattedName = formatWinnerName(winner.winnerFirstName, winner.winnerLastName);
    const prizeLabel = winner.selectedPrize || winner.prize.name;
    const fullStory = stripRichTextHtml(winner.testimony);
    const excerpt = getWinnerTestimonyExcerpt(winner.testimony, 340);
    const isTruncated = fullStory.length > 340;
    const displayImage =
      winner.imageUrl || winner.prize.images[0] || "/images/placeholders/prize-placeholder.png";

    return (
      <article
        className="relative overflow-hidden rounded-[24px] border bg-white shadow-[0_20px_55px_rgba(15,23,42,0.18)] dark:bg-neutral-900"
        style={{ borderColor: theme.borderRgba }}
      >
        <div className="grid min-h-0 lg:grid-cols-[minmax(280px,44%)_minmax(0,1fr)] lg:items-stretch">
          <div className="relative flex min-h-[240px] items-center justify-center bg-slate-950 sm:min-h-[280px] lg:min-h-[400px] lg:py-6">
            <div className="relative h-[min(58vw,360px)] w-full sm:h-[min(50vw,400px)] lg:absolute lg:inset-0 lg:h-full lg:max-h-none">
              <Image
                src={displayImage}
                alt={`${formattedName} - ${winner.drawName}`}
                fill
                className="object-contain object-center p-3 sm:p-4"
                sizes="(max-width: 1024px) 100vw, 44vw"
                priority={false}
              />
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/50 to-transparent lg:h-24" />
            <div className="absolute left-4 top-4 z-10">
              <span
                className="inline-flex rounded-md border bg-slate-950/72 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur"
                style={{ borderColor: theme.borderRgba }}
              >
                {winner.drawType === "major" ? "Major Draw Winner" : "Mini Draw Winner"}
              </span>
            </div>
          </div>

          <div className="relative flex flex-col justify-between px-4 py-4 text-slate-900 dark:text-white sm:p-6 lg:p-7">
            <div>
              <div className="mb-3 flex items-start justify-between gap-3 sm:mb-4 sm:gap-4">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold tracking-tight font-['Poppins'] text-slate-950 dark:text-white sm:text-2xl lg:text-[1.8rem]">
                    {formattedName}
                  </h3>
                  <p className="mt-0.5 text-xs font-semibold text-slate-800 dark:text-neutral-200 sm:mt-1 sm:text-sm">
                    {prizeLabel}
                  </p>
                </div>
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ring-1 sm:h-12 sm:w-12"
                  style={{
                    background: `linear-gradient(135deg, ${theme.primary}12 0%, ${theme.primaryLight}18 100%)`,
                    color: theme.primary,
                    borderColor: theme.borderRgba,
                  }}
                >
                  <Quote className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
              </div>

              <blockquote className="text-xs leading-[1.55] text-slate-700 dark:text-neutral-300 sm:text-sm sm:leading-7 lg:text-[15px]">
                <p className="line-clamp-4 sm:line-clamp-6 lg:line-clamp-7">{excerpt}</p>
              </blockquote>

              <button
                type="button"
                onClick={() => setStoryModalWinnerId(winner.id)}
                className="group mt-3 inline-flex items-center gap-1 rounded-sm px-0.5 py-1 text-left text-sm font-semibold underline decoration-2 underline-offset-[0.28em] transition-[color,opacity,transform] duration-200 hover:opacity-90 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none sm:mt-4"
                style={{
                  color: theme.primary,
                  textDecorationColor: theme.primaryLight,
                  outlineColor: theme.primary,
                }}
                aria-haspopup="dialog"
                aria-expanded={storyModalWinnerId === winner.id}
              >
                {isTruncated ? "Read full story" : "View story & photo"}
                <ChevronRight
                  aria-hidden
                  className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                  style={{ color: theme.primary }}
                />
              </button>
            </div>

            <div className="mt-4 border-t border-slate-200 pt-3 dark:border-neutral-700 sm:mt-6 sm:pt-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] font-medium text-slate-500 dark:text-neutral-400 sm:gap-x-4 sm:gap-y-2 sm:text-xs lg:text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" style={{ color: theme.primaryLight }} />
                  {getWinnerDisplayDate(winner)}
                </span>
                {winner.winnerState && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" style={{ color: theme.primaryLight }} />
                    {winner.winnerState}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Gift className="h-4 w-4" style={{ color: theme.primaryLight }} />
                  {winner.drawName}
                </span>
              </div>
            </div>
          </div>
        </div>
      </article>
    );
  };

  return (
    <section
      className={`relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 py-12 sm:py-16 lg:py-20 ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at top, ${theme.shadowRgba.replace(/,\s*[\d.]+\)/, ", 0.24)")}, transparent 30%)`,
        }}
      />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 opacity-80" style={{ background: `radial-gradient(circle at center, ${theme.primaryLight}20, transparent 45%)` }} />
      <SectionContainer>
        <div className="mb-8 text-center lg:mb-10">
          <div className="mx-auto mb-3 h-1 w-24 rounded-full" style={{ background: theme.gradient }} />
          <h2 className="text-3xl font-bold tracking-tight text-white font-['Poppins'] sm:text-4xl lg:text-[2.65rem]">
            Hear From Our Winners
          </h2>
        </div>

        <div className="relative">
          {winnersWithTestimonies.length > 1 && (
            <>
              <button
                type="button"
                onClick={scrollPrev}
                disabled={!canScrollPrev && winnersWithTestimonies.length <= 1}
                aria-label="Previous winner story"
                className="absolute left-0 top-1/2 z-20 hidden h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-slate-950/90 text-white shadow-[0_14px_30px_rgba(0,0,0,0.35)] backdrop-blur lg:flex"
                style={{ borderColor: theme.borderRgba }}
              >
                <ChevronLeft className="h-5 w-5" style={{ color: theme.primaryLight }} />
              </button>
              <button
                type="button"
                onClick={scrollNext}
                disabled={!canScrollNext && winnersWithTestimonies.length <= 1}
                aria-label="Next winner story"
                className="absolute right-0 top-1/2 z-20 hidden h-12 w-12 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-slate-950/90 text-white shadow-[0_14px_30px_rgba(0,0,0,0.35)] backdrop-blur lg:flex"
                style={{ borderColor: theme.borderRgba }}
              >
                <ChevronRight className="h-5 w-5" style={{ color: theme.primaryLight }} />
              </button>
            </>
          )}

          <div className="overflow-hidden" ref={emblaRef}>
            <div className="flex">
              {winnersWithTestimonies.map((winner) => (
                <div
                  key={winner.id}
                  className="min-w-0 flex-[0_0_92%] pl-0 pr-4 sm:flex-[0_0_88%] sm:pr-5 lg:flex-[0_0_78%] lg:px-4"
                >
                  {renderCard(winner)}
                </div>
              ))}
            </div>
          </div>

          {winnersWithTestimonies.length > 1 && (
            <div className="mt-6 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={scrollPrev}
                aria-label="Previous winner story"
                className="flex h-11 w-11 items-center justify-center rounded-full border bg-slate-950/70 text-white lg:hidden"
                style={{ borderColor: theme.borderRgba }}
              >
                <ChevronLeft className="h-5 w-5" style={{ color: theme.primaryLight }} />
              </button>

              <div className="text-sm font-medium text-white/80">
                {selectedIndex + 1} / {winnersWithTestimonies.length}
              </div>

              <button
                type="button"
                onClick={scrollNext}
                aria-label="Next winner story"
                className="flex h-11 w-11 items-center justify-center rounded-full border bg-slate-950/70 text-white lg:hidden"
                style={{ borderColor: theme.borderRgba }}
              >
                <ChevronRight className="h-5 w-5" style={{ color: theme.primaryLight }} />
              </button>
            </div>
          )}

          {winnersWithTestimonies.length === 1 && (
            <div className="mt-6 text-center text-sm font-medium text-white/80">
              1 / 1
            </div>
          )}
        </div>

        {winnersWithTestimonies.length > 1 && (
          <div className="mt-8 hidden items-center justify-center gap-2 lg:flex">
            {winnersWithTestimonies.map((winner) => (
              <button
                key={winner.id}
                type="button"
                onClick={() => emblaApi?.scrollTo(winnersWithTestimonies.findIndex((entry) => entry.id === winner.id))}
                aria-label={`Go to winner story ${winnersWithTestimonies.findIndex((entry) => entry.id === winner.id) + 1}`}
                className={`h-2.5 rounded-full winner-motion-button ${
                  winnersWithTestimonies.findIndex((entry) => entry.id === winner.id) === selectedIndex
                    ? "w-8"
                    : "w-2.5 bg-white/25 hover:bg-white/45"
                }`}
                style={
                  winnersWithTestimonies.findIndex((entry) => entry.id === winner.id) === selectedIndex
                    ? { background: theme.gradient }
                    : undefined
                }
              />
            ))}
          </div>
        )}

        <div className="mt-10 text-center lg:mt-14">
          <Link
            href="#membership"
            className="inline-flex items-center gap-2 rounded-full border px-6 py-3.5 text-sm font-bold uppercase tracking-[0.14em] shadow-[0_14px_30px_rgba(0,0,0,0.25)] winner-motion-button"
            style={{
              background: theme.gradient,
              color: themeTextColor,
              borderColor: theme.borderRgba,
            }}
          >
            Join the Winners Circle
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <ModalContainer
          isOpen={storyModalWinnerId !== null}
          onClose={closeStoryModal}
          size="4xl"
          height="fixed"
          fixedHeight="max-h-[92dvh]"
        >
          {storyModalWinner ? (
            <>
              <ModalHeader
                title={formatWinnerName(
                  storyModalWinner.winnerFirstName,
                  storyModalWinner.winnerLastName
                )}
                subtitle={storyModalWinner.selectedPrize || storyModalWinner.prize.name}
                onClose={closeStoryModal}
                customBackground
                style={{ background: theme.gradient }}
                preferDarkBackground={themeTextColor !== "#ffffff"}
                titleTextClassName={
                  themeTextColor === "#ffffff" ? "!text-white" : "!text-slate-900"
                }
                subtitleTextClassName={
                  themeTextColor === "#ffffff" ? "!text-white/90" : "!text-slate-700"
                }
              />
              <ModalContent padding="md" className="dark:bg-neutral-950">
                <div className="mb-6 flex justify-center rounded-2xl bg-slate-100 p-3 dark:bg-slate-900/80">
                  <Image
                    src={
                     storyModalWinner.imageUrl ||
                     storyModalWinner.prize.images[0] ||
                     "/images/placeholders/prize-placeholder.png"
                    }
                    alt={`${formatWinnerName(storyModalWinner.winnerFirstName, storyModalWinner.winnerLastName)} — winner photo`}
                    width={1400}
                    height={1400}
                    className="max-h-[min(52vh,640px)] w-auto max-w-full object-contain"
                  />
                </div>

                <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  Their story
                </p>
                <div className="text-base leading-relaxed text-slate-800 dark:text-slate-200">
                  {stripRichTextHtml(storyModalWinner.testimony)
                    .split(/\n+/)
                    .filter(Boolean)
                    .map((para, idx) => (
                      <p key={idx} className="mb-4 last:mb-0">
                        {para}
                      </p>
                    ))}
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-200 pt-6 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 shrink-0" style={{ color: theme.primaryLight }} />
                    {getWinnerDisplayDate(storyModalWinner)}
                  </span>
                  {storyModalWinner.winnerState && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 shrink-0" style={{ color: theme.primaryLight }} />
                      {storyModalWinner.winnerState}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    <Gift className="h-4 w-4 shrink-0" style={{ color: theme.primaryLight }} />
                    {storyModalWinner.drawName}
                  </span>
                </div>
              </ModalContent>
            </>
          ) : null}
        </ModalContainer>
      </SectionContainer>
    </section>
  );
}

