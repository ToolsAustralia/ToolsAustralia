"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X, Expand } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import ClassNames from "embla-carousel-class-names";
import type { EmblaOptionsType } from "embla-carousel";
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchContentRef } from "react-zoom-pan-pinch";

import ModalContainer from "@/components/modals/ui/ModalContainer";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/utils/cn";

export interface FullscreenImageCaption {
  drawName: string;
  winnerName: string;
  wonDate: string;
  /** Defaults to major (membership / major-draw winners). */
  drawKind?: "major" | "mini";
}

export interface FullscreenImageItem {
  src: string;
  alt?: string;
  /** Bottom info bar (draw / winner / date). */
  captionDetail?: FullscreenImageCaption;
}

interface FullscreenImageViewerProps {
  isOpen: boolean;
  images: FullscreenImageItem[];
  initialIndex: number;
  onClose: () => void;
  title?: string;
  /** When opened from another modal, stack above it. */
  nested?: boolean;
}

const clampIndex = (index: number, length: number): number => {
  if (length <= 0) return 0;
  if (index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
};

export default function FullscreenImageViewer({
  isOpen,
  images,
  initialIndex,
  onClose,
  title,
  nested = false,
}: FullscreenImageViewerProps) {
  const promoTheme = usePromoTheme();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [currentIndex, setCurrentIndex] = useState(clampIndex(initialIndex, images.length));
  const [canSlidePrev, setCanSlidePrev] = useState(false);
  const [canSlideNext, setCanSlideNext] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const zoomRefs = useRef<Array<ReactZoomPanPinchContentRef | null>>([]);
  const currentIndexRef = useRef(0);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
  const hasMultipleImages = images.length > 1;

  const computedInitialIndex = useMemo(
    () => clampIndex(initialIndex, images.length),
    [initialIndex, images.length]
  );

  const mainOptions = useMemo<EmblaOptionsType>(
    () => ({ loop: false, startIndex: computedInitialIndex, duration: 25 }),
    [computedInitialIndex]
  );
  const mainPlugins = useMemo(() => [ClassNames()], []);
  const [mainRef, mainApi] = useEmblaCarousel(mainOptions, mainPlugins);

  const onSelect = useCallback(() => {
    if (!mainApi) return;
    const i = mainApi.selectedScrollSnap();
    setCurrentIndex(i);
    setCanSlidePrev(mainApi.canScrollPrev());
    setCanSlideNext(mainApi.canScrollNext());
  }, [mainApi]);

  useEffect(() => {
    if (!mainApi) return;
    onSelect();
    mainApi.on("select", onSelect);
    mainApi.on("reInit", onSelect);
    return () => {
      mainApi.off("select", onSelect);
      mainApi.off("reInit", onSelect);
    };
  }, [mainApi, onSelect]);

  useEffect(() => {
    if (!isOpen) return;
    lastFocusedElementRef.current = document.activeElement as HTMLElement | null;
    const nextIndex = clampIndex(initialIndex, images.length);
    setCurrentIndex(nextIndex);
    if (mainApi) mainApi.scrollTo(nextIndex, true);
  }, [isOpen, initialIndex, images.length, mainApi]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (!hasMultipleImages) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        mainApi?.scrollNext();
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        mainApi?.scrollPrev();
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomRefs.current[currentIndex]?.zoomIn(0.5);
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        zoomRefs.current[currentIndex]?.zoomOut(0.5);
      }
      if (event.key === "0") {
        event.preventDefault();
        zoomRefs.current[currentIndex]?.resetTransform(150);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, hasMultipleImages, onClose, mainApi, currentIndex]);

  useEffect(() => {
    if (isOpen) return;
    lastFocusedElementRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!mainApi) return;
    // re-init embla swipe based on zoom state
    mainApi.reInit({ watchDrag: !isZoomed } as EmblaOptionsType);
  }, [mainApi, isZoomed]);

  useEffect(() => {
    // when active slide changes, clear zoom on the slides the user navigated away from
    zoomRefs.current.forEach((ref, i) => {
      if (i === currentIndex) return;
      ref?.resetTransform(0);
    });
    setIsZoomed(false);
  }, [currentIndex]);

  useEffect(() => {
    if (!isOpen) {
      setIsZoomed(false);
      zoomRefs.current.forEach((ref) => ref?.resetTransform(0));
    }
  }, [isOpen]);

  const goNext = () => mainApi?.scrollNext();
  const goPrevious = () => mainApi?.scrollPrev();
  const onThumbClick = useCallback((i: number) => mainApi?.scrollTo(i), [mainApi]);

  const showCounter = images.length > 0;
  const activeCaption = images[currentIndex]?.captionDetail;

  // Surfaces — light/dark adaptive
  const backdropBg = isDark ? "#000" : "#f5f5f4";
  const photoBg = isDark ? "#0a0a0a" : "#fafaf9";
  const cardTextColor = isDark ? "rgb(255 255 255)" : "rgb(10 10 10)";
  const pillBg = isDark ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.7)";
  const pillBorder = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)";
  const pillText = isDark ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.85)";
  const cardGradient = isDark
    ? `linear-gradient(180deg, ${promoTheme.primary}2e 0%, #0a0a0a 60%)`
    : `linear-gradient(180deg, ${promoTheme.primary}10 0%, #ffffff 60%)`;
  const cardBorder = isDark
    ? `rgba(255,255,255,0.08)`
    : `rgba(0,0,0,0.06)`;
  const thumbBorder = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      height="screen"
      className="!max-w-full !h-screen !max-h-[100dvh] !rounded-none !overflow-hidden"
      closeOnBackdrop
      nested={nested}
    >
      <div
        className="flex h-full max-h-[100dvh] min-h-0 w-full max-w-[100vw] flex-col overflow-x-hidden overflow-y-hidden overscroll-none touch-pan-x lg:flex-row"
        style={{ background: backdropBg, color: cardTextColor }}
      >
        {/* PHOTO COLUMN (mobile: top ~50vh; desktop: left ~62%) */}
        <div
          className="relative flex min-h-0 w-full flex-col overflow-hidden lg:h-full lg:flex-[0_0_62%]"
          style={{ background: photoBg }}
        >
          {/* Top bar — unthemed, theme-aware */}
          <div className="pointer-events-none absolute left-0 top-0 z-30 flex w-full items-center justify-between p-3 sm:p-4 [&_button]:pointer-events-auto [&_a]:pointer-events-auto">
            {showCounter ? (
              <div
                className="max-w-[80%] truncate rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur sm:text-sm"
                style={{
                  background: pillBg,
                  border: `1px solid ${pillBorder}`,
                  color: pillText,
                }}
              >
                {title ? `${title} · ` : ""}
                {currentIndex + 1} / {images.length}
              </div>
            ) : (
              <div />
            )}
            <button
              type="button"
              onClick={onClose}
              autoFocus
              className="inline-flex h-10 w-10 items-center justify-center rounded-full backdrop-blur focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2"
              style={{
                background: pillBg,
                border: `1px solid ${pillBorder}`,
                color: pillText,
              }}
              aria-label="Close fullscreen image viewer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Image stage (zoom integrated in Task 4) */}
          <div className="relative h-[50vh] min-h-0 w-full overflow-hidden pt-14 sm:pt-16 lg:h-full lg:flex-1">
            <div
              ref={mainRef}
              data-carousel="true"
              style={{ touchAction: "pan-y pinch-zoom" }}
              className="h-full w-full max-w-full overflow-hidden"
            >
              <div className="flex h-full">
                {images.map((image, index) => (
                  <div
                    key={`${image.src}-${index}`}
                    className="embla__slide flex-[0_0_100%] min-w-0 box-border max-w-full overflow-hidden"
                  >
                    <TransformWrapper
                      ref={(el) => { zoomRefs.current[index] = el; }}
                      initialScale={1}
                      minScale={1}
                      maxScale={4}
                      doubleClick={{ mode: "toggle", step: 1.5 }}
                      pinch={{ step: 5 }}
                      wheel={{ step: 0.2 }}
                      onZoomStop={(ref) => {
                        if (index !== currentIndexRef.current) return;
                        setIsZoomed(ref.state.scale > 1.01);
                      }}
                      onTransformed={(ref) => {
                        if (index !== currentIndexRef.current) return;
                        setIsZoomed(ref.state.scale > 1.01);
                      }}
                    >
                      <TransformComponent
                        wrapperClass="!h-full !w-full"
                        contentClass="!h-full !w-full"
                      >
                        <div className="relative h-full w-full max-w-full overflow-hidden">
                          <Image
                            src={image.src}
                            alt={image.alt || `Fullscreen image ${index + 1}`}
                            fill
                            sizes="(min-width: 1024px) 62vw, 100vw"
                            className="box-border object-contain p-3 sm:p-4"
                            priority={index === currentIndex}
                          />
                        </div>
                      </TransformComponent>
                    </TransformWrapper>
                  </div>
                ))}
              </div>
            </div>

            {hasMultipleImages ? (
              <>
                {canSlidePrev && (
                  <button
                    type="button"
                    onClick={goPrevious}
                    className="absolute left-2 top-1/2 z-20 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full backdrop-blur transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:left-4 sm:h-12 sm:w-12"
                    style={{
                      background: pillBg,
                      border: `1px solid ${pillBorder}`,
                      color: pillText,
                    }}
                    aria-label="View previous image"
                  >
                    <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
                  </button>
                )}
                {canSlideNext && (
                  <button
                    type="button"
                    onClick={goNext}
                    className="absolute right-2 top-1/2 z-20 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full backdrop-blur transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:right-4 sm:h-12 sm:w-12"
                    style={{
                      background: pillBg,
                      border: `1px solid ${pillBorder}`,
                      color: pillText,
                    }}
                    aria-label="View next image"
                  >
                    <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
                  </button>
                )}
              </>
            ) : null}
          </div>
        </div>

        {/* INFO CARD COLUMN (mobile: bottom ~41vh; desktop: right ~38%) */}
        <div
          className="relative w-full overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 lg:h-full lg:flex-[0_0_38%] lg:px-6 lg:pt-12"
          style={{
            background: cardGradient,
            borderTop: `1px solid ${cardBorder}`,
            color: cardTextColor,
          }}
        >
          {activeCaption ? (
            <div className="mx-auto flex max-w-md flex-col gap-3 lg:max-w-none">
              <span
                className="inline-flex w-fit items-center rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white"
                style={{ background: promoTheme.primary }}
              >
                {activeCaption.drawKind === "mini" ? "Mini draw" : "Major draw"}
              </span>

              <h2
                className="text-xl font-extrabold leading-tight sm:text-2xl lg:text-3xl"
              >
                {activeCaption.drawName}
              </h2>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <p
                    className="text-[10px] font-bold uppercase tracking-wider opacity-60"
                  >
                    Winner
                  </p>
                  <p
                    className="mt-0.5 text-sm font-bold leading-tight sm:text-base"
                  >
                    {activeCaption.winnerName}
                  </p>
                </div>
                <div>
                  <p
                    className="text-[10px] font-bold uppercase tracking-wider opacity-60"
                  >
                    Won date
                  </p>
                  <p
                    className="mt-0.5 text-sm font-bold leading-tight tabular-nums sm:text-base"
                  >
                    {activeCaption.wonDate}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {hasMultipleImages ? (
            <div
              className="mt-4 border-t pt-3"
              style={{ borderColor: cardBorder }}
            >
              {/* Mobile: horizontal scroll strip */}
              <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
                {images.map((image, index) => {
                  const isActive = currentIndex === index;
                  return (
                    <button
                      key={`thumb-m-${image.src}-${index}`}
                      type="button"
                      onClick={() => onThumbClick(index)}
                      aria-label={`Open image ${index + 1}`}
                      aria-current={isActive ? "true" : undefined}
                      className="relative h-12 w-12 flex-[0_0_auto] overflow-hidden rounded-md border-2 transition-all"
                      style={{
                        borderColor: isActive ? promoTheme.primary : thumbBorder,
                        boxShadow: isActive ? `0 0 0 1px ${promoTheme.primary}66` : undefined,
                      }}
                    >
                      <Image
                        src={image.src}
                        alt={image.alt || `Thumbnail ${index + 1}`}
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    </button>
                  );
                })}
              </div>

              {/* Desktop: 3-col auto-fit grid, scrollable vertically when many */}
              <div className="hidden grid-cols-[repeat(auto-fit,minmax(72px,1fr))] gap-2 lg:grid">
                {images.map((image, index) => {
                  const isActive = currentIndex === index;
                  return (
                    <button
                      key={`thumb-d-${image.src}-${index}`}
                      type="button"
                      onClick={() => onThumbClick(index)}
                      aria-label={`Open image ${index + 1}`}
                      aria-current={isActive ? "true" : undefined}
                      className="relative aspect-square overflow-hidden rounded-md border-2 transition-all"
                      style={{
                        borderColor: isActive ? promoTheme.primary : thumbBorder,
                        boxShadow: isActive ? `0 0 0 1px ${promoTheme.primary}66` : undefined,
                      }}
                    >
                      <Image
                        src={image.src}
                        alt={image.alt || `Thumbnail ${index + 1}`}
                        fill
                        sizes="96px"
                        className="object-cover"
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </ModalContainer>
  );
}

interface FullscreenTriggerButtonProps {
  onClick: () => void;
  className?: string;
  label?: string;
}

export function FullscreenTriggerButton({
  onClick,
  className = "",
  label = "View image in fullscreen",
}: FullscreenTriggerButtonProps) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={label}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white",
        className
      )}
    >
      <Expand className="h-4 w-4" />
    </button>
  );
}
