"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import useEmblaCarousel from "embla-carousel-react";
import ClassNames from "embla-carousel-class-names";
import type { EmblaCarouselType, EmblaOptionsType } from "embla-carousel";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { FullscreenTriggerButton } from "@/components/ui/FullscreenImageViewer";
import { EmblaCarouselButton } from "@/components/ui/embla/EmblaCarouselButton";
import PrizeImageViewer from "@/components/ui/PrizeImageViewer";

interface MiniDrawImageGalleryProps {
  images: string[];
  prizeName: string;
  /** Title for the fullscreen viewer. Falls back to the prize name. */
  drawName?: string;
}

interface PaginationDotsProps {
  api: EmblaCarouselType | null;
  active: number;
}

function PaginationDots({ api, active }: PaginationDotsProps) {
  const [snapCount, setSnapCount] = useState(0);

  useEffect(() => {
    if (!api) return;
    const update = () => setSnapCount(api.scrollSnapList().length);
    update();
    api.on("reInit", update);
    return () => {
      api.off("reInit", update);
    };
  }, [api]);

  if (snapCount <= 1) return null;

  return (
    <div className="absolute bottom-2.5 left-1/2 z-20 flex -translate-x-1/2 gap-[5px]">
      {Array.from({ length: snapCount }).map((_, i) => {
        const isActive = i === active;
        return (
          <button
            key={i}
            type="button"
            aria-label={`Go to image ${i + 1}`}
            aria-current={isActive}
            onClick={() => api?.scrollTo(i)}
            className={`h-1.5 rounded-full transition-all duration-200 ${
              isActive ? "w-5 bg-white" : "w-1.5 bg-white/[.55] hover:bg-white/80"
            }`}
          />
        );
      })}
    </div>
  );
}

export default function MiniDrawImageGallery({ images, prizeName, drawName }: MiniDrawImageGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const prefersReduced = useReducedMotion();

  // Main carousel
  const mainOptions = useMemo<EmblaOptionsType>(
    () => ({ loop: false, duration: 25 }),
    []
  );
  const mainPlugins = useMemo(() => [ClassNames()], []);
  const [mainRef, mainApi] = useEmblaCarousel(mainOptions, mainPlugins);

  // Thumbs carousel (free-drag strip)
  const thumbsOptions = useMemo<EmblaOptionsType>(
    () => ({ containScroll: "keepSnaps", dragFree: true }),
    []
  );
  const thumbsPlugins = useMemo(() => [ClassNames()], []);
  const [thumbsRef, thumbsApi] = useEmblaCarousel(thumbsOptions, thumbsPlugins);

  const onSelect = useCallback(() => {
    if (!mainApi) return;
    const i = mainApi.selectedScrollSnap();
    setActiveIndex(i);
    setCanScrollPrev(mainApi.canScrollPrev());
    setCanScrollNext(mainApi.canScrollNext());
    thumbsApi?.scrollTo(i);
  }, [mainApi, thumbsApi]);

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

  const onThumbClick = useCallback(
    (i: number) => mainApi?.scrollTo(i),
    [mainApi]
  );

  /**
   * The viewer reads `activeIndex` rather than holding its own copy, and every viewer-side
   * navigation scrolls this carousel — so closing the viewer leaves the inline gallery on
   * whatever image the user was last looking at, in both directions.
   */
  const openFullscreenAtIndex = (index: number) => {
    mainApi?.scrollTo(index);
    setIsFullscreenOpen(true);
  };

  const handleImagePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const handleImagePointerUp = (event: React.PointerEvent<HTMLElement>, index: number) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start) return;

    const deltaX = Math.abs(event.clientX - start.x);
    const deltaY = Math.abs(event.clientY - start.y);
    const isTap = deltaX < 8 && deltaY < 8;
    if (isTap) {
      openFullscreenAtIndex(index);
    }
  };

  if (!images || images.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-[20px] border border-[#EFF0F3] bg-white lg:border-[#EAECEF] dark:border-neutral-800 dark:bg-neutral-900">
        <div className="relative aspect-square bg-white lg:aspect-[4/3]">
          <Image
            src="/images/placeholder-product.jpg"
            alt="No image available"
            fill
            className="object-contain"
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-2.5 sm:space-y-3.5">
      {/* Main Embla Display */}
      <div className="relative overflow-hidden rounded-[20px] border border-[#EFF0F3] bg-white lg:border-[#EAECEF] dark:border-neutral-800 dark:bg-neutral-900">
        <div
          ref={mainRef}
          data-carousel="true"
          style={{ touchAction: "pan-y pinch-zoom" }}
          className="main-embla overflow-hidden"
        >
          <div className="flex">
            {images.map((image, index) => (
              <div key={index} className="embla__slide flex-[0_0_100%] min-w-0">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`slide-${index}`}
                    className="relative aspect-square lg:aspect-[4/3] bg-white cursor-zoom-in"
                    initial={prefersReduced ? {} : { opacity: 0.7 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    onPointerDown={handleImagePointerDown}
                    onPointerUp={(event) => handleImagePointerUp(event, index)}
                  >
                    <Image
                      src={image}
                      alt={`${prizeName} view ${index + 1}`}
                      fill
                      className="object-contain"
                      priority={index === 0}
                      sizes="(max-width: 1024px) 100vw, 50vw"
                    />
                    <div className="absolute right-2.5 top-2.5 z-20 lg:right-3.5 lg:top-3.5">
                      <FullscreenTriggerButton
                        onClick={() => openFullscreenAtIndex(index)}
                        label={`View ${prizeName} image ${index + 1} in fullscreen`}
                        className="h-[34px] w-[34px] backdrop-blur-sm lg:h-[42px] lg:w-[42px]"
                      />
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>

        {/* Navigation buttons (replaces Swiper [Navigation] module) */}
        {images.length > 1 ? (
          <>
            <EmblaCarouselButton
              direction="prev"
              disabled={!canScrollPrev}
              onClick={() => mainApi?.scrollPrev()}
              className="absolute left-2 top-1/2 z-20 h-[34px] w-[34px] -translate-y-1/2 border border-white/50 bg-[rgba(107,114,128,.55)] backdrop-blur-sm hover:bg-[rgba(107,114,128,.75)] lg:left-3.5 lg:h-11 lg:w-11 [&>svg]:h-[15px] [&>svg]:w-[15px] lg:[&>svg]:h-[19px] lg:[&>svg]:w-[19px]"
            />
            <EmblaCarouselButton
              direction="next"
              disabled={!canScrollNext}
              onClick={() => mainApi?.scrollNext()}
              className="absolute right-2 top-1/2 z-20 h-[34px] w-[34px] -translate-y-1/2 border border-white/50 bg-[rgba(107,114,128,.55)] backdrop-blur-sm hover:bg-[rgba(107,114,128,.75)] lg:right-3.5 lg:h-11 lg:w-11 [&>svg]:h-[15px] [&>svg]:w-[15px] lg:[&>svg]:h-[19px] lg:[&>svg]:w-[19px]"
            />
            <PaginationDots api={mainApi ?? null} active={activeIndex} />
            <div className="absolute bottom-2.5 right-2.5 z-20 rounded-full bg-black/60 px-2.5 py-[3px] text-[10.5px] font-semibold text-white backdrop-blur-sm lg:bottom-3.5 lg:right-3.5 lg:px-3 lg:py-[5px] lg:text-[12.5px]">
              {activeIndex + 1} / {images.length}
            </div>
          </>
        ) : null}
      </div>

      {/* Thumbnail Embla strip */}
      {images.length > 1 ? (
        <div
          ref={thumbsRef}
          data-carousel="true"
          style={{ touchAction: "pan-y pinch-zoom" }}
          className="thumbs-embla overflow-hidden"
        >
          <div className="flex gap-2 lg:gap-2.5">
            {images.map((image, index) => {
              const isActive = activeIndex === index;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => onThumbClick(index)}
                  aria-label={`Show image ${index + 1}`}
                  aria-current={isActive}
                  className={`embla__thumb flex-[0_0_auto] !h-[62px] !w-[62px] lg:!h-[92px] lg:!w-[92px]`}
                >
                  <div
                    className={`relative h-full w-full overflow-hidden rounded-[13px] border-2 bg-white transition-all duration-300 lg:rounded-[15px] ${
                      isActive
                        ? "border-red-600 shadow-[0_6px_14px_-8px_rgba(238,0,0,.8)]"
                        : "border-[#E9EAEE] hover:border-[#D8DAE0]"
                    }`}
                  >
                    <Image
                      src={image}
                      alt={`${prizeName} thumbnail ${index + 1}`}
                      fill
                      className="object-contain"
                      sizes="(max-width: 640px) 80px, 100px"
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <PrizeImageViewer
        open={isFullscreenOpen}
        images={images}
        index={activeIndex}
        onIndexChange={(i) => mainApi?.scrollTo(i)}
        onClose={() => setIsFullscreenOpen(false)}
        title={drawName || prizeName}
      />
    </div>
  );
}
