"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import useEmblaCarousel from "embla-carousel-react";
import ClassNames from "embla-carousel-class-names";
import type { EmblaCarouselType, EmblaOptionsType } from "embla-carousel";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import FullscreenImageViewer, {
  FullscreenTriggerButton,
  type FullscreenImageItem,
} from "@/components/ui/FullscreenImageViewer";
import { EmblaCarouselButton } from "@/components/ui/embla/EmblaCarouselButton";

interface MiniDrawImageGalleryProps {
  images: string[];
  prizeName: string;
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
    <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-1.5">
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
              isActive ? "w-5 bg-white" : "w-1.5 bg-white/55 hover:bg-white/80"
            }`}
          />
        );
      })}
    </div>
  );
}

export default function MiniDrawImageGallery({ images, prizeName }: MiniDrawImageGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [fullscreenStartIndex, setFullscreenStartIndex] = useState(0);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const prefersReduced = useReducedMotion();

  const fullscreenImages: FullscreenImageItem[] = images.map((image, index) => ({
    src: image,
    alt: `${prizeName} view ${index + 1}`,
  }));

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

  const openFullscreenAtIndex = (index: number) => {
    setFullscreenStartIndex(index);
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
      <div className="relative rounded-2xl shadow-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
        <div className="relative aspect-square lg:aspect-[4/3]">
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
    <div className="relative space-y-3 sm:space-y-4">
      {/* Main Embla Display */}
      <div className="relative rounded-2xl shadow-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
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
                    className="relative aspect-square lg:aspect-[4/3] bg-gray-50 dark:bg-neutral-950 cursor-zoom-in"
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
                    <div className="absolute right-3 top-3 z-20">
                      <FullscreenTriggerButton
                        onClick={() => openFullscreenAtIndex(index)}
                        label={`View ${prizeName} image ${index + 1} in fullscreen`}
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
              className="absolute left-2 top-1/2 z-20 -translate-y-1/2 border-white/40"
            />
            <EmblaCarouselButton
              direction="next"
              disabled={!canScrollNext}
              onClick={() => mainApi?.scrollNext()}
              className="absolute right-2 top-1/2 z-20 -translate-y-1/2 border-white/40"
            />
            <PaginationDots api={mainApi ?? null} active={activeIndex} />
            <div className="absolute bottom-3 right-3 z-20 bg-black/60 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded-full">
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
          <div className="flex gap-2">
            {images.map((image, index) => {
              const isActive = activeIndex === index;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => onThumbClick(index)}
                  aria-label={`Show image ${index + 1}`}
                  aria-current={isActive}
                  className={`embla__thumb flex-[0_0_auto] !w-16 !h-16 sm:!w-20 sm:!h-20`}
                >
                  <div
                    className={`relative w-full h-full rounded-xl overflow-hidden border-2 transition-all duration-300 bg-white dark:bg-neutral-900 ${
                      isActive
                        ? "border-red-600 shadow-md shadow-red-600/20"
                        : "border-gray-200 dark:border-neutral-600 hover:border-gray-400 dark:hover:border-neutral-500"
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

      <FullscreenImageViewer
        isOpen={isFullscreenOpen}
        images={fullscreenImages}
        initialIndex={fullscreenStartIndex}
        onClose={() => setIsFullscreenOpen(false)}
        title={prizeName}
      />
    </div>
  );
}
