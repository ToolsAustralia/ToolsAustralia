"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Thumbs, FreeMode } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import FullscreenImageViewer, {
  FullscreenTriggerButton,
  type FullscreenImageItem,
} from "@/components/ui/FullscreenImageViewer";

import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/thumbs";
import "swiper/css/free-mode";

interface MiniDrawImageGalleryProps {
  images: string[];
  prizeName: string;
}

export default function MiniDrawImageGallery({ images, prizeName }: MiniDrawImageGalleryProps) {
  const [thumbsSwiper, setThumbsSwiper] = useState<SwiperType | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [fullscreenStartIndex, setFullscreenStartIndex] = useState(0);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const prefersReduced = useReducedMotion();
  const fullscreenImages: FullscreenImageItem[] = images.map((image, index) => ({
    src: image,
    alt: `${prizeName} view ${index + 1}`,
  }));

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
      {/* Main Swiper Display */}
      <div className="relative rounded-2xl shadow-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
        <Swiper
          modules={[Navigation, Pagination, Thumbs]}
          thumbs={{
            swiper: thumbsSwiper && !thumbsSwiper.destroyed ? thumbsSwiper : null,
          }}
          navigation
          pagination={{ clickable: true }}
          className="main-swiper"
          spaceBetween={0}
          slidesPerView={1}
          onSlideChange={(swiper) => setActiveIndex(swiper.activeIndex)}
        >
          {images.map((image, index) => (
            <SwiperSlide key={index}>
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
            </SwiperSlide>
          ))}
        </Swiper>

        {/* Image Counter */}
        {images.length > 1 && (
          <div className="absolute bottom-3 right-3 z-20 bg-black/60 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded-full">
            {activeIndex + 1} / {images.length}
          </div>
        )}
      </div>

      {/* Thumbnail Swiper */}
      {images.length > 1 && (
        <Swiper
          modules={[FreeMode, Thumbs]}
          onSwiper={setThumbsSwiper}
          spaceBetween={8}
          slidesPerView="auto"
          freeMode={true}
          watchSlidesProgress={true}
          className="thumbs-swiper"
        >
          {images.map((image, index) => (
            <SwiperSlide key={index} className="!w-16 !h-16 sm:!w-20 sm:!h-20">
              <div
                className={`relative w-full h-full rounded-xl overflow-hidden border-2 transition-all duration-300 cursor-pointer bg-white dark:bg-neutral-900 ${
                  activeIndex === index
                    ? "border-[#ee0000] shadow-md shadow-[#ee0000]/20"
                    : "border-gray-200 dark:border-neutral-600 hover:border-gray-400 dark:hover:border-neutral-500"
                }`}
              >
                <Image
                  src={image}
                  alt={`${prizeName} thumbnail ${index + 1}`}
                  fill
                  className="object-contain"
                  sizes="80px"
                />
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      )}

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
