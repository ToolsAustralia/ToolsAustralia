"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X, Expand } from "lucide-react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Keyboard, Thumbs, FreeMode } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";

import ModalContainer from "@/components/modals/ui/ModalContainer";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/thumbs";
import "swiper/css/free-mode";

export interface FullscreenImageItem {
  src: string;
  alt?: string;
}

interface FullscreenImageViewerProps {
  isOpen: boolean;
  images: FullscreenImageItem[];
  initialIndex: number;
  onClose: () => void;
  title?: string;
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
}: FullscreenImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(clampIndex(initialIndex, images.length));
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
  const swiperRef = useRef<SwiperType | null>(null);
  const [thumbsSwiper, setThumbsSwiper] = useState<SwiperType | null>(null);
  const hasMultipleImages = images.length > 1;

  useEffect(() => {
    if (!isOpen) return;

    lastFocusedElementRef.current = document.activeElement as HTMLElement | null;
    const nextIndex = clampIndex(initialIndex, images.length);
    setCurrentIndex(nextIndex);
    if (swiperRef.current) {
      swiperRef.current.slideTo(nextIndex, 0);
    }
  }, [isOpen, initialIndex, images.length]);

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
        swiperRef.current?.slideNext();
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        swiperRef.current?.slidePrev();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, hasMultipleImages, images.length, onClose]);

  useEffect(() => {
    if (isOpen) return;
    lastFocusedElementRef.current?.focus();
  }, [isOpen]);

  const goNext = () => swiperRef.current?.slideNext();
  const goPrevious = () => swiperRef.current?.slidePrev();

  const showCounter = images.length > 0;

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      height="screen"
      className="!max-w-full !h-screen !rounded-none !bg-neutral-950"
      closeOnBackdrop
    >
      <div className="relative h-full w-full text-white">
        <div className="absolute left-0 top-0 z-20 flex w-full items-center justify-between p-3 sm:p-4">
          {showCounter ? (
            <div className="max-w-[80%] text-xs sm:text-sm font-medium bg-black/45 px-3 py-1.5 rounded-full backdrop-blur truncate">
              {title ? `${title} - ` : ""}
              {currentIndex + 1} / {images.length}
            </div>
          ) : <div />}
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label="Close fullscreen image viewer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {images.length > 0 ? (
          <>
            <Swiper
              modules={[Navigation, Pagination, Keyboard, Thumbs]}
              onSwiper={(swiper) => {
                swiperRef.current = swiper;
              }}
              thumbs={{
                swiper: thumbsSwiper && !thumbsSwiper.destroyed ? thumbsSwiper : null,
              }}
              navigation={hasMultipleImages}
              pagination={hasMultipleImages ? { clickable: true } : false}
              keyboard={{ enabled: true }}
              watchSlidesProgress={true}
              slidesPerView={1}
              initialSlide={clampIndex(initialIndex, images.length)}
              className="h-full w-full fullscreen-image-viewer-swiper"
              onSlideChange={(swiper) => setCurrentIndex(swiper.activeIndex)}
            >
              {images.map((image, index) => (
                <SwiperSlide key={`${image.src}-${index}`}>
                  <div className="relative h-full w-full">
                    <Image
                      src={image.src}
                      alt={image.alt || `Fullscreen image ${index + 1}`}
                      fill
                      sizes="100vw"
                      className={`object-contain p-3 sm:p-6 ${hasMultipleImages ? "pb-24 sm:pb-28" : ""}`}
                      priority={index === currentIndex}
                    />
                  </div>
                </SwiperSlide>
              ))}
            </Swiper>

            {hasMultipleImages && (
              <div className="absolute bottom-3 left-0 z-20 w-full px-2 sm:px-4">
                <div className="rounded-2xl border border-white/20 bg-black/55 p-2 backdrop-blur-md">
                  <Swiper
                    modules={[FreeMode, Thumbs]}
                    onSwiper={setThumbsSwiper}
                    spaceBetween={8}
                    slidesPerView="auto"
                    freeMode={true}
                    watchSlidesProgress={true}
                    slideToClickedSlide={true}
                    className="fullscreen-thumbs-swiper"
                  >
                    {images.map((image, index) => (
                      <SwiperSlide key={`thumb-${image.src}-${index}`} className="!w-14 !h-14 sm:!w-16 sm:!h-16">
                        <button
                          type="button"
                          onClick={() => swiperRef.current?.slideTo(index)}
                          aria-label={`Open image ${index + 1}`}
                          className={`relative h-full w-full overflow-hidden rounded-lg border-2 transition-all duration-200 ${
                            currentIndex === index
                              ? "border-white shadow-[0_0_0_2px_rgba(255,255,255,0.15)]"
                              : "border-white/30 hover:border-white/60"
                          }`}
                        >
                          <Image
                            src={image.src}
                            alt={image.alt || `Thumbnail ${index + 1}`}
                            fill
                            sizes="64px"
                            className="object-cover"
                          />
                        </button>
                      </SwiperSlide>
                    ))}
                  </Swiper>
                </div>
              </div>
            )}
          </>
        ) : null}

        {hasMultipleImages ? (
          <>
            <button
              type="button"
              onClick={goPrevious}
              className="absolute left-2 top-1/2 z-20 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:left-4 sm:h-12 sm:w-12"
              aria-label="View previous image"
            >
              <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="absolute right-2 top-1/2 z-20 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-4 sm:h-12 sm:w-12"
              aria-label="View next image"
            >
              <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          </>
        ) : null}
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
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${className}`}
    >
      <Expand className="h-4 w-4" />
    </button>
  );
}
