"use client";

import { useState } from "react";
import Image from "next/image";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Thumbs, FreeMode } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";

// Import Swiper styles
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

  if (!images || images.length === 0) {
    return (
      <div className="relative rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-slate-500/30 bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-700/80 backdrop-blur-sm">
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10"></div>
        <div className="relative aspect-square lg:aspect-[4/3] bg-slate-800/50">
          <Image
            src="/images/placeholder-product.jpg"
            alt="No image available"
            fill
            className="object-contain"
            priority
            quality={90}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-3 sm:space-y-4">
      {/* Main Swiper Display */}
      <div className="relative rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-slate-500/30 bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-700/80 backdrop-blur-sm">
        {/* Metallic shine effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10"></div>

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
        >
          {images.map((image, index) => (
            <SwiperSlide key={index}>
              <div className="relative aspect-square lg:aspect-[4/3] bg-slate-800/50">
                <Image
                  src={image}
                  alt={`${prizeName} view ${index + 1}`}
                  fill
                  className="object-contain"
                  priority={index === 0}
                  quality={90}
                />
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
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
            <SwiperSlide key={index} className="!w-16 !h-16 sm:!w-24 sm:!h-24">
              <div className="relative w-full h-full rounded-xl overflow-hidden border-2 border-slate-500/30 hover:border-red-500/50 transition-all duration-300 cursor-pointer bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-700/80">
                {/* Metallic shine on thumbnail */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10"></div>
                <Image
                  src={image}
                  alt={`${prizeName} thumbnail ${index + 1}`}
                  fill
                  className="object-contain"
                  quality={60}
                />
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      )}
    </div>
  );
}
