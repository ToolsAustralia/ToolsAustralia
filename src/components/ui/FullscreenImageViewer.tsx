"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X, Expand } from "lucide-react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Keyboard, Thumbs, FreeMode } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";

import ModalContainer from "@/components/modals/ui/ModalContainer";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import "swiper/css";
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
  const theme = usePromoTheme();
  const [currentIndex, setCurrentIndex] = useState(clampIndex(initialIndex, images.length));
  const [canSlidePrev, setCanSlidePrev] = useState(false);
  const [canSlideNext, setCanSlideNext] = useState(false);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
  const swiperRef = useRef<SwiperType | null>(null);
  const [thumbsSwiper, setThumbsSwiper] = useState<SwiperType | null>(null);
  const hasMultipleImages = images.length > 1;
  const chevronColor = theme.primaryDark;
  const chevronGlow = theme.shadowRgba;
  const themedPanelBorder = `1px solid ${theme.borderRgba}`;
  const themedPanelGlow = `0 0 14px ${theme.shadowRgba}, 0 4px 14px rgba(0,0,0,0.45)`;
  const themedPanelBg = `linear-gradient(135deg, ${theme.primaryDark}66 0%, ${theme.primary}4d 55%, ${theme.primaryDark}66 100%)`;

  const updateNavigationState = (swiper: SwiperType) => {
    setCanSlidePrev(!swiper.isBeginning);
    setCanSlideNext(!swiper.isEnd);
  };

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
      className="!max-w-full !h-screen !rounded-none !bg-black"
      closeOnBackdrop
    >
      <div
        className="relative h-full w-full text-white"
        style={{
          background: `radial-gradient(circle at top, ${theme.primaryDark}33 0%, rgba(0,0,0,0.96) 52%)`,
        }}
      >
        <div className="absolute left-0 top-0 z-20 flex w-full items-center justify-between p-3 sm:p-4">
          {showCounter ? (
            <div
              className="max-w-[80%] text-xs sm:text-sm font-medium px-3 py-1.5 rounded-full backdrop-blur truncate border"
              style={{
                background: themedPanelBg,
                border: themedPanelBorder,
                boxShadow: themedPanelGlow,
              }}
            >
              {title ? `${title} - ` : ""}
              {currentIndex + 1} / {images.length}
            </div>
          ) : <div />}
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            style={{
              background: themedPanelBg,
              border: themedPanelBorder,
              boxShadow: themedPanelGlow,
            }}
            aria-label="Close fullscreen image viewer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {images.length > 0 ? (
          <>
            <Swiper
              modules={[Keyboard, Thumbs]}
              onSwiper={(swiper) => {
                swiperRef.current = swiper;
                updateNavigationState(swiper);
              }}
              thumbs={{
                swiper: thumbsSwiper && !thumbsSwiper.destroyed ? thumbsSwiper : null,
              }}
              navigation={false}
              keyboard={{ enabled: true }}
              watchSlidesProgress={true}
              slidesPerView={1}
              initialSlide={clampIndex(initialIndex, images.length)}
              className="h-full w-full fullscreen-image-viewer-swiper"
              onSlideChange={(swiper) => {
                setCurrentIndex(swiper.activeIndex);
                updateNavigationState(swiper);
              }}
              onResize={updateNavigationState}
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
                <div
                  className="rounded-2xl p-2 backdrop-blur-md"
                  style={{
                    background: themedPanelBg,
                    border: themedPanelBorder,
                    boxShadow: themedPanelGlow,
                  }}
                >
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
                              ? ""
                              : "hover:brightness-110"
                          }`}
                          style={
                            currentIndex === index
                              ? {
                                  borderColor: chevronColor,
                                  boxShadow: `0 0 0 2px ${theme.borderRgba}, 0 0 14px ${chevronGlow}`,
                                }
                              : {
                                  borderColor: theme.borderRgba,
                                }
                          }
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
            {canSlidePrev && (
              <button
                type="button"
                onClick={goPrevious}
                className="absolute left-2 sm:left-4 top-1/2 z-20 -translate-y-1/2 inline-flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full border-2 bg-black/70 transition hover:bg-black/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                style={{
                  borderColor: chevronColor,
                  color: chevronColor,
                  boxShadow: `0 0 14px ${chevronGlow}, 0 4px 14px rgba(0,0,0,0.45)`,
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
                className="absolute right-2 sm:right-4 top-1/2 z-20 -translate-y-1/2 inline-flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full border-2 bg-black/70 transition hover:bg-black/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                style={{
                  borderColor: chevronColor,
                  color: chevronColor,
                  boxShadow: `0 0 14px ${chevronGlow}, 0 4px 14px rgba(0,0,0,0.45)`,
                }}
                aria-label="View next image"
              >
                <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
            )}
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
