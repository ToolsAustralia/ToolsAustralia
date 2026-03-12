"use client";

import { useState } from "react";
import Image from "next/image";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Thumbs, FreeMode } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

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
  const prefersReduced = useReducedMotion();

  if (!images || images.length === 0) {
    return (
      <div className="relative rounded-2xl shadow-lg border border-gray-200 bg-white overflow-hidden">
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
      <div className="relative rounded-2xl shadow-lg border border-gray-200 bg-white overflow-hidden">
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
                  className="relative aspect-square lg:aspect-[4/3] bg-gray-50"
                  initial={prefersReduced ? {} : { opacity: 0.7 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <Image
                    src={image}
                    alt={`${prizeName} view ${index + 1}`}
                    fill
                    className="object-contain"
                    priority={index === 0}
                    sizes="(max-width: 1024px) 100vw, 50vw"
                  />
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
                className={`relative w-full h-full rounded-xl overflow-hidden border-2 transition-all duration-300 cursor-pointer bg-white ${
                  activeIndex === index
                    ? "border-[#ee0000] shadow-md shadow-[#ee0000]/20"
                    : "border-gray-200 hover:border-gray-400"
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
    </div>
  );
}
