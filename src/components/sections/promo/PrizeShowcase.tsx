"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Thumbs, FreeMode } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import PrizeSpecificationsModal from "@/components/modals/PrizeSpecificationsModal";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";
import { usePrizeCatalog } from "@/hooks/usePrizeCatalog";

import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/thumbs";
import "swiper/css/free-mode";

interface PrizeShowcaseProps {
  slug?: string;
}

const formatIconKey = (iconName: string) =>
  iconName
    .split(/[\s-_]+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");

const resolveHighlightIcon = (iconName?: string): LucideIcon => {
  const iconsMap = LucideIcons as unknown as Record<string, LucideIcon>;
  const fallbackIcon = iconsMap.Star;
  if (!iconName) return fallbackIcon;

  const candidates = [iconName, iconName.charAt(0).toUpperCase() + iconName.slice(1), formatIconKey(iconName)];
  for (const key of candidates) {
    if (iconsMap[key]) {
      return iconsMap[key];
    }
  }

  return fallbackIcon;
};

export default function PrizeShowcase({ slug }: PrizeShowcaseProps = {}) {
  const prizeRef = useScrollAnimation();
  const [thumbsSwiper, setThumbsSwiper] = useState<SwiperType | null>(null);
  const [isSpecsModalOpen, setIsSpecsModalOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const { openEntryFlow } = useMajorDrawEntryCta();
  const { prizes, activePrize, activeSlug } = usePrizeCatalog({ slug });
  const router = useRouter();

  useEffect(() => {
    if (!activePrize) return;

    const updateTimer = () => {
      const now = Date.now();
      const midnightTonight = new Date().setHours(23, 59, 59, 999);
      const difference = midnightTonight - now;

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / (1000 * 60)) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [activePrize]);

  const handleEnterNow = () => openEntryFlow({ openLocalModal: false });

  const handleSelectPrize = (nextSlug: string) => {
    if (!nextSlug || nextSlug === activeSlug) return;
    router.push(`/promotions/${nextSlug}`, { scroll: false });
  };

  if (!activePrize) {
    return null;
  }

  const highlights = activePrize.highlights ?? [];

  return (
    <section ref={prizeRef} className="py-8 sm:py-16 lg:py-20 relative">
      <div className="w-full px-4 sm:px-0 max-w-7xl mx-auto relative z-10">
        <div className="text-center mb-6 sm:mb-12">
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold text-gray-900 font-['Poppins'] mb-4 drop-shadow-lg">
            {activePrize.heroHeading}
          </h2>
          {activePrize.heroSubheading && (
            <p className="text-sm sm:text-lg text-gray-700 font-['Inter'] max-w-2xl mx-auto">
              {activePrize.heroSubheading}
            </p>
          )}
          {activePrize.summary && (
            <p className="text-xs sm:text-base text-gray-500 font-['Inter'] max-w-2xl mx-auto mt-3">
              {activePrize.summary}
            </p>
          )}

          {prizes.length > 1 && (
            <div className="mt-4 sm:mt-6">
              <p className="text-xs sm:text-sm text-gray-500 font-['Inter'] uppercase tracking-wide mb-2">
                Pick Your Toolset
              </p>
              <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-2 sm:pb-0 sm:flex-wrap sm:justify-center [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {prizes.map((prizeOption) => {
                  const isActive = prizeOption.slug === activeSlug;
                  return (
                    <button
                      key={prizeOption.slug}
                      onClick={() => handleSelectPrize(prizeOption.slug)}
                      className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 border whitespace-nowrap ${
                        isActive
                          ? "bg-gradient-to-r from-red-600 via-red-700 to-red-800 text-white border-red-500 shadow-lg shadow-red-500/40"
                          : "bg-white/90 text-gray-700 border-slate-300 hover:border-red-400 hover:text-red-600"
                      }`}
                    >
                      {prizeOption.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-12 items-start">
          <div className="relative order-1 lg:order-1 space-y-3 sm:space-y-4">
            <div className="relative rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-slate-500/30 bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-700/80 backdrop-blur-sm">
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10"></div>

              <Swiper
                modules={[Navigation, Pagination, Thumbs]}
                thumbs={{ swiper: thumbsSwiper && !thumbsSwiper.destroyed ? thumbsSwiper : null }}
                navigation
                pagination={{ clickable: true }}
                className="main-swiper"
                spaceBetween={0}
                slidesPerView={1}
              >
                {activePrize.gallery.map((image, index) => (
                  <SwiperSlide key={`${image.src}-${index}`}>
                    <div className="relative aspect-square lg:aspect-[4/3] bg-slate-800/50">
                      <Image
                        src={image.src}
                        alt={image.alt || `Prize view ${index + 1}`}
                        fill
                        className="object-contain"
                        priority={index === 0}
                        quality={90}
                      />
                    </div>
                  </SwiperSlide>
                ))}
              </Swiper>

              <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-20">
                <div className="flex items-center gap-2 bg-gradient-to-r from-yellow-500/90 to-orange-500/90 backdrop-blur-sm rounded-full px-3 py-1.5 sm:px-4 sm:py-2 shadow-lg border border-white/20 text-white">
                  <span className="text-[9px] sm:text-[11px] font-semibold uppercase tracking-wide">Prize Value</span>
                  <span className="text-[11px] sm:text-sm font-bold">
                    {activePrize.prizeValueLabel ?? "See Prize Options"}
                  </span>
                </div>
              </div>

              <div className="absolute top-4 right-4 z-20">
                <button
                  onClick={() => setIsSpecsModalOpen(true)}
                  className="relative overflow-hidden rounded-full transition-all duration-300 hover:scale-105 group"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-red-600 via-red-700 to-red-800"></div>
                  <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent"></div>
                  <div className="pointer-events-none absolute inset-0 rounded-full bg-red-500/25 blur-xl animate-ping"></div>
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-red-500/20 blur-xl"></div>
                  <div className="relative z-10 flex items-center justify-center gap-2 px-3 py-2 sm:px-4 sm:py-2 border-2 border-red-400/30 rounded-full">
                    <span className="font-bold text-xs sm:text-sm text-white drop-shadow-lg whitespace-nowrap">
                      VIEW SPECS
                    </span>
                  </div>
                </button>
              </div>
            </div>

            <Swiper
              modules={[FreeMode, Thumbs]}
              onSwiper={setThumbsSwiper}
              spaceBetween={8}
              slidesPerView="auto"
              freeMode
              watchSlidesProgress
              className="thumbs-swiper"
            >
              {activePrize.gallery.map((image, index) => (
                <SwiperSlide key={`thumb-${image.src}-${index}`} className="!w-16 !h-16 sm:!w-24 sm:!h-24">
                  <div className="relative w-full h-full rounded-xl overflow-hidden border-2 border-slate-500/30 hover:border-red-500/50 transition-all duration-300 cursor-pointer bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-700/80">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10"></div>
                    <Image
                      src={image.src}
                      alt={image.alt || `Prize thumbnail ${index + 1}`}
                      fill
                      className="object-contain"
                      quality={60}
                    />
                  </div>
                </SwiperSlide>
              ))}
            </Swiper>

            <div className="bg-gradient-to-br from-red-600 to-red-700 rounded-3xl p-4 sm:p-6 shadow-2xl border-2 border-white/20">
              <div className="grid grid-cols-4 gap-2 sm:gap-3">
                {[
                  { label: "Days", value: timeLeft.days },
                  { label: "Hours", value: timeLeft.hours },
                  { label: "Mins", value: timeLeft.minutes },
                  { label: "Secs", value: timeLeft.seconds },
                ].map((unit) => (
                  <div
                    key={unit.label}
                    className="bg-white/10 backdrop-blur-sm rounded-2xl p-2 sm:p-4 text-center border border-white/20"
                  >
                    <div className="text-xl sm:text-[28px] font-bold text-white">
                      {String(unit.value).padStart(2, "0")}
                    </div>
                    <div className="text-[10px] sm:text-[12px] text-white/80 font-medium">{unit.label}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 text-center">
                <a
                  href="https://facebook.com/tools-australia"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-white/90 hover:text-white text-[12px] sm:text-[14px] font-medium transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                  Follow for live draw updates
                </a>
              </div>
            </div>

            <button
              onClick={handleEnterNow}
              className="relative w-full overflow-hidden rounded-full transition-all duration-300 hover:scale-105 group lg:hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-red-600 via-red-700 to-red-800"></div>
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent"></div>
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-red-500/20 blur-xl"></div>
              <div className="relative z-10 flex items-center justify-center gap-3 px-6 py-3 sm:px-8 sm:py-4 border-2 border-red-400/30 rounded-full">
                <span className="font-bold text-base sm:text-lg text-white drop-shadow-lg">ENTER NOW</span>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </button>

            <div className="w-full lg:hidden">
              <Image
                src="/images/safe-checkout-stripe.png"
                alt="Guaranteed safe & secure checkout powered by Stripe"
                width={600}
                height={160}
                className="w-full h-auto"
                quality={90}
              />
            </div>
          </div>

          <div className="space-y-3 sm:space-y-4 order-2 lg:order-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {highlights.map((highlight, index) => {
                const Icon = resolveHighlightIcon(highlight.icon);
                return (
                  <div
                    key={`${highlight.title}-${index}`}
                    className="relative flex items-start gap-3 sm:gap-4 p-3 sm:p-4 bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-700/80 backdrop-blur-sm rounded-2xl border border-slate-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent rounded-2xl pointer-events-none"></div>
                    <div className="relative w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-red-600/80 via-red-700/80 to-red-800/80 backdrop-blur-sm rounded-xl flex items-center justify-center flex-shrink-0 border-2 border-red-400/30 shadow-lg">
                      <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent rounded-xl"></div>
                      <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white relative z-10" />
                    </div>
                    <div className="flex-1 relative z-10">
                      <h3 className="text-base sm:text-lg font-bold text-white font-['Poppins'] mb-1 drop-shadow-md">
                        {highlight.title}
                      </h3>
                      <p className="text-sm sm:text-base text-slate-200 font-['Inter']">{highlight.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="relative bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-700/80 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-slate-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent rounded-2xl pointer-events-none"></div>
              <h3 className="text-base sm:text-lg font-bold text-white font-['Poppins'] mb-2 relative z-10 drop-shadow-md">
                Prize Details
              </h3>
              <p className="text-sm sm:text-base text-slate-200 font-['Inter'] leading-relaxed relative z-10">
                {activePrize.detailedDescription}
              </p>
            </div>

            <button
              onClick={handleEnterNow}
              className="relative w-full overflow-hidden rounded-full transition-all duration-300 hover:scale-105 group hidden lg:block"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-red-600 via-red-700 to-red-800"></div>
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent"></div>
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-red-500/20 blur-xl"></div>
              <div className="relative z-10 flex items-center justify-center gap-3 px-6 py-3 sm:px-8 sm:py-4 border-2 border-red-400/30 rounded-full">
                <span className="font-bold text-base sm:text-lg text-white drop-shadow-lg">ENTER NOW</span>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </button>

            <div className="w-full mt-4 hidden lg:block">
              <Image
                src="/images/safe-checkout-stripe.png"
                alt="Guaranteed safe & secure checkout powered by Stripe"
                width={600}
                height={160}
                className="w-full h-auto"
                quality={90}
              />
            </div>
          </div>
        </div>
      </div>

      <PrizeSpecificationsModal
        isOpen={isSpecsModalOpen}
        onClose={() => setIsSpecsModalOpen(false)}
        prize={activePrize}
      />
    </section>
  );
}
