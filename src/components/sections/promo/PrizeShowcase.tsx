"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Thumbs, FreeMode } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";

import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import PrizeSpecificationsModal from "@/components/modals/PrizeSpecificationsModal";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";
import { usePrizeCatalog } from "@/hooks/usePrizeCatalog";
import { useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
import { getPrizeBrandColors } from "@/utils/prize-brand-colors";
import { useSearchParams } from "next/navigation";

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

// Helper function to get brand logo path based on prize slug
const getBrandLogoPath = (slug: string): string | null => {
  switch (slug) {
    case "milwaukee-sidchrome":
      return "/images/brands/milwaukee.png";
    case "dewalt-sidchrome":
      return "/images/brands/dewalt-black.png";
    case "makita-sidchrome":
      return "/images/brands/Makita-red.png";
    case "cash-prize":
      return null; // No watermark for cash prize
    default:
      return null;
  }
};

// Helper function to get first prize text image path based on prize slug
const getFirstPrizeImagePath = (slug: string): string => {
  switch (slug) {
    case "dewalt-sidchrome":
      return "/images/promotion/FirstPrizeText/1stprice-dewalt.png";
    case "makita-sidchrome":
      return "/images/promotion/FirstPrizeText/1stprice-makita.png";
    case "cash-prize":
      return "/images/promotion/FirstPrizeText/1stprice-cash.png";
    case "milwaukee-sidchrome":
    default:
      return "/images/promotion/FirstPrizeText/1stprice-milwaukee.png";
  }
};

// Helper function to get formatted multi-line label for prize cards
const getFormattedLabel = (label: string) => {
  if (label.includes("Milwaukee")) {
    return {
      line1: "Sidchrome",
      line2: "Milwaukee",
      line3: "$5000 Cash Prize",
    };
  }
  if (label.includes("DeWalt")) {
    return {
      line1: "Sidchrome",
      line2: "DeWalt",
      line3: "$5000 Cash Prize",
    };
  }
  if (label.includes("Makita")) {
    return {
      line1: "Sidchrome",
      line2: "Makita",
      line3: "$5000 Cash Prize",
    };
  }
  if (label.includes("$10000") || label.includes("$10,000")) {
    return {
      line1: "$10,000 Tax Free Cash",
      line2: null,
      line3: null,
    };
  }
  // Fallback
  return {
    line1: label,
    line2: null,
    line3: null,
  };
};

// Helper function to get ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
const getOrdinalSuffix = (day: number): string => {
  if (day > 3 && day < 21) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
};

// Helper function to format time without AM/PM suffix (e.g., "5:30pm")
const formatTimeWithoutPeriod = (date: Date): string => {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const hour12 = hours % 12 || 12;
  const period = hours >= 12 ? "pm" : "am";
  const minutesStr = minutes.toString().padStart(2, "0");
  return `${hour12}:${minutesStr}${period}`;
};

export default function PrizeShowcase({ slug }: PrizeShowcaseProps = {}) {
  const prizeRef = useScrollAnimation();
  const [thumbsSwiper, setThumbsSwiper] = useState<SwiperType | null>(null);
  const [isSpecsModalOpen, setIsSpecsModalOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [drawDateLabel, setDrawDateLabel] = useState("Draw date TBA");
  const [isMounted, setIsMounted] = useState(false);
  const { openEntryFlow } = useMajorDrawEntryCta();
  const { prizes, activePrize, activeSlug } = usePrizeCatalog({ slug });
  const { data: currentMajorDraw } = useCurrentMajorDraw();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Check if draw is completed or queued (gap state)
  const isCompleted = currentMajorDraw?.status === "completed";
  const isQueued = currentMajorDraw?.status === "queued";
  const isGapState = isCompleted || isQueued;
  const drawDateObj = currentMajorDraw?.drawDate ? new Date(currentMajorDraw.drawDate) : null;
  const msUntilDraw = isMounted && drawDateObj ? drawDateObj.getTime() - Date.now() : null;
  const daysUntilDraw = msUntilDraw !== null ? msUntilDraw / (1000 * 60 * 60 * 24) : null;
  const shouldShowCountdown =
    !isCompleted && msUntilDraw !== null && msUntilDraw > 0 && daysUntilDraw !== null && daysUntilDraw <= 3;

  // Set mounted state after component mounts to prevent hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Format draw date label after mount to prevent hydration mismatch
  useEffect(() => {
    if (currentMajorDraw?.drawDate) {
      const drawDateObj = new Date(currentMajorDraw.drawDate);
      const weekday = drawDateObj.toLocaleDateString("en-AU", { weekday: "long" });
      const day = drawDateObj.getDate();
      const month = drawDateObj.toLocaleDateString("en-AU", { month: "long" });
      const time = formatTimeWithoutPeriod(drawDateObj);
      const ordinal = getOrdinalSuffix(day);
      const formatted = `${weekday}, ${day}${ordinal} ${month} ${time}`;
      setDrawDateLabel(formatted);
    } else {
      setDrawDateLabel("Draw date TBA");
    }
  }, [currentMajorDraw]);

  // Countdown timer logic - align with MajorDrawSection (countdown to drawDate)
  useEffect(() => {
    const drawDate = currentMajorDraw?.drawDate ? new Date(currentMajorDraw.drawDate).getTime() : null;

    if (!drawDate || Number.isNaN(drawDate)) {
      setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const difference = drawDate - now;

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((difference % (1000 * 60)) / 1000),
        });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [currentMajorDraw?.freezeEntriesAt, currentMajorDraw?.drawDate]);

  const handleEnterNow = () => openEntryFlow({ openLocalModal: false });

  const handleSelectPrize = (nextSlug: string) => {
    if (!nextSlug || nextSlug === activeSlug) return;

    // Preserve affiliate code from URL if present (App Router compatible)
    const affiliateCode = searchParams.get("aff");
    const newUrl = affiliateCode ? `/promotions/${nextSlug}?aff=${affiliateCode}` : `/promotions/${nextSlug}`;

    router.push(newUrl, { scroll: false });
  };

  if (!activePrize) {
    return null;
  }

  // Get brand colors for active prize to match View Specs button and prize header
  const brandColors = getPrizeBrandColors(activeSlug || "milwaukee-sidchrome");
  const highlights = activePrize.highlights ?? [];

  return (
    <section ref={prizeRef} className=" pb-8 sm:pb-12 relative">
      <div className="w-full px-4 sm:px-0 max-w-7xl mx-auto relative z-10">
        <div className="text-center mb-6 sm:mb-12">
          {/* First Prize Image - Conditionally displayed based on selected prize */}
          <div className="flex justify-center">
            <Image
              src={getFirstPrizeImagePath(activeSlug)}
              alt="First Prize"
              width={800}
              height={200}
              className="w-full max-w-4xl h-auto object-contain"
              priority
            />
          </div>
          <div className={`inline-block bg-gradient-to-br ${brandColors.gradient} rounded-xl sm:rounded-2xl px-4 sm:px-6 py-2 sm:py-3 mb-4 shadow-lg border-2 ${brandColors.borderColor.replace('border-', 'border-').replace('-500', '-400/30')}`}>
            <h2 className={`text-2xl sm:text-4xl lg:text-5xl font-bold ${brandColors.textColor} font-['Poppins'] drop-shadow-lg`}>
              {activePrize.heroHeading}
            </h2>
          </div>
          {activePrize.heroSubheading && (
            <p className="hidden sm:block text-sm sm:text-lg text-gray-700 font-['Inter'] max-w-2xl mx-auto">
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
              <p className="text-lg sm:text-xl font-bold text-black font-['Poppins'] mb-2 sm:mb-3 text-center">
                Pick Your Toolset
              </p>
              <div className="grid grid-cols-2 gap-2 sm:gap-4 max-w-3xl mx-auto">
                {prizes.map((prizeOption) => {
                  const isActive = prizeOption.slug === activeSlug;
                  const brandColors = getPrizeBrandColors(prizeOption.slug);
                  const brandLogoPath = getBrandLogoPath(prizeOption.slug);
                  const formattedLabel = getFormattedLabel(prizeOption.label);
                  return (
                    <button
                      key={prizeOption.slug}
                      onClick={() => handleSelectPrize(prizeOption.slug)}
                      tabIndex={-1}
                      style={{ outline: "none", boxShadow: "none" }}
                      className={`relative p-3 sm:p-5 rounded-xl sm:rounded-2xl border-2 transition-all duration-300 text-center cursor-pointer overflow-visible min-h-[85px] sm:min-h-[110px] group ${
                        isActive
                          ? `bg-gradient-to-br ${brandColors.gradient} ${brandColors.textColor} ${brandColors.borderColor} shadow-xl ${brandColors.shadowColor} scale-[1.02] ring-2 ring-offset-2 ring-offset-white ring-opacity-50`
                          : `bg-white text-gray-700 border-gray-700 ${brandColors.hoverBorderColor} hover:bg-gradient-to-br hover:from-gray-50 hover:to-white hover:shadow-lg hover:scale-[1.02] hover:border-opacity-80 active:scale-[0.98]`
                      }`}
                    >
                      {/* Brand logo watermark - only shown when active */}
                      {isActive && brandLogoPath && (
                        <div className="absolute inset-0 rounded-xl sm:rounded-2xl overflow-hidden pointer-events-none">
                          <Image
                            src={brandLogoPath}
                            alt=""
                            fill
                            className="object-contain opacity-20"
                            sizes="(max-width: 640px) 100px, 150px"
                          />
                        </div>
                      )}

                      {/* Hover glow effect for inactive cards */}
                      {!isActive && (
                        <div
                          className={`absolute inset-0 rounded-xl sm:rounded-2xl bg-gradient-to-br ${brandColors.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300 pointer-events-none`}
                        />
                      )}

                      {/* Active shimmer effect */}
                      {isActive && (
                        <div className="absolute inset-0 rounded-xl sm:rounded-2xl bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                      )}

                      {/* Active checkmark badge */}
                      {isActive && (
                        <div className="absolute -top-2 -right-2 sm:-top-2.5 sm:-right-2.5 w-6 h-6 sm:w-7 sm:h-7 bg-white rounded-full flex items-center justify-center shadow-xl z-10 ring-2 ring-white/50 animate-in fade-in zoom-in duration-200">
                          <Check className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${brandColors.checkmarkColor}`} />
                        </div>
                      )}

                      {/* Card content - formatted multi-line text */}
                      <div className="relative z-10 w-full overflow-visible">
                        <div
                          className={`text-xs sm:text-base font-bold font-['Poppins'] leading-tight transition-colors duration-200 break-words text-center ${
                            isActive ? "text-white" : "text-gray-900 group-hover:text-gray-950"
                          }`}
                        >
                          <div className="block">{formattedLabel.line1}</div>
                          {formattedLabel.line2 && <div className="block">{formattedLabel.line2}</div>}
                          {formattedLabel.line3 && <div className="block">{formattedLabel.line3}</div>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-12 items-start">
          <div className="relative order-1 lg:order-1 space-y-3 sm:space-y-4">
            <div className="relative rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-gray-700 bg-gradient-to-br from-gray-900 via-gray-800 to-black backdrop-blur-sm">
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10"></div>

              {activePrize.gallery.length > 1 ? (
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
                      <div className="relative aspect-square lg:aspect-[4/3] bg-gray-900">
                        <Image
                          src={image.src}
                          alt={image.alt || `Prize view ${index + 1}`}
                          fill
                          className="object-contain"
                          priority={index === 0}
                          sizes="(max-width: 1024px) 100vw, 50vw"
                        />
                      </div>
                    </SwiperSlide>
                  ))}
                </Swiper>
              ) : (
                <div className="relative aspect-square lg:aspect-[4/3] bg-slate-800/50">
                  <Image
                    src={activePrize.gallery[0]?.src || "/images/grand-draw.jpg"}
                    alt={activePrize.gallery[0]?.alt || "Prize view"}
                    fill
                    className="object-contain"
                    priority
                    sizes="(max-width: 1024px) 100vw, 50vw"
                  />
                </div>
              )}

              <div className="absolute top-4 right-4 z-20">
                <button
                  onClick={() => setIsSpecsModalOpen(true)}
                  suppressHydrationWarning
                  className="relative overflow-hidden rounded-full transition-all duration-300 hover:scale-105 group"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${brandColors.gradient}`}></div>
                  <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent"></div>
                  <div className={`pointer-events-none absolute inset-0 rounded-full ${brandColors.shadowColor.replace('/40', '/25')} blur-xl animate-ping`}></div>
                  <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${brandColors.shadowColor.replace('/40', '/20')} blur-xl`}></div>
                  <div className={`relative z-10 flex items-center justify-center gap-2 px-3 py-2 sm:px-4 sm:py-2 border-2 ${brandColors.borderColor.replace('border-', 'border-').replace('-500', '-400/30')} rounded-full`}>
                    <span className={`font-bold text-xs sm:text-sm ${brandColors.textColor} drop-shadow-lg whitespace-nowrap`}>
                      VIEW SPECS
                    </span>
                  </div>
                </button>
              </div>
            </div>

            {activePrize.gallery.length > 1 && (
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
                    <div className="relative w-full h-full rounded-xl overflow-hidden border-2 border-gray-700 hover:border-red-500/50 transition-all duration-300 cursor-pointer bg-gradient-to-br from-gray-900 via-gray-800 to-black">
                      <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10"></div>
                      <Image
                        src={image.src}
                        alt={image.alt || `Prize thumbnail ${index + 1}`}
                        fill
                        className="object-contain"
                        sizes="64px"
                      />
                    </div>
                  </SwiperSlide>
                ))}
              </Swiper>
            )}

            {shouldShowCountdown ? (
              <div
                className={`rounded-3xl p-3 sm:p-4 shadow-2xl border-2 border-white/20 ${
                  currentMajorDraw?.status === "frozen"
                    ? "bg-gradient-to-br from-gray-900 via-gray-800 to-black"
                    : "bg-gradient-to-br from-red-600 to-red-700"
                }`}
              >
                {/* Frozen notice for consistency with MajorDrawSection */}
                {currentMajorDraw?.status === "frozen" && (
                  <div className="mb-3 text-center">
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-2 sm:p-3 border border-white/20">
                      <div className="text-white font-semibold text-xs sm:text-sm uppercase tracking-wide">
                        Entry Period Closed
                      </div>
                      <div className="text-white/80 text-[10px] sm:text-xs mt-1">
                        No new entries accepted for this draw. Entries will go to the next draw.
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                  {[
                    { label: "Days", value: timeLeft.days },
                    { label: "Hours", value: timeLeft.hours },
                    { label: "Mins", value: timeLeft.minutes },
                    { label: "Secs", value: timeLeft.seconds },
                  ].map((unit) => (
                    <div
                      key={unit.label}
                      className="bg-white/10 backdrop-blur-sm rounded-2xl p-2 sm:p-3 text-center border border-white/20"
                    >
                      <div className="text-lg sm:text-2xl font-bold text-white">
                        {String(unit.value).padStart(2, "0")}
                      </div>
                      <div className="text-[10px] sm:text-[12px] text-white/80 font-medium">{unit.label}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 text-center">
                  <a
                    href="https://www.facebook.com/toolsaust"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-white/90 hover:text-white text-[12px] sm:text-[14px] font-medium transition-colors underline"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                    {isGapState ? (
                      <>
                        <div className="relative">
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                          <div className="absolute inset-0 w-2 h-2 bg-green-400 rounded-full animate-ping opacity-75"></div>
                        </div>
                        Watch ongoing draw
                      </>
                    ) : (
                      "Follow for live draw updates"
                    )}
                  </a>
                </div>
              </div>
            ) : (
              <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-black rounded-3xl p-4 shadow-2xl border-2 border-white/20 text-center">
                <p className="text-white text-xs sm:text-sm font-semibold uppercase tracking-[0.2em]">Draw Date</p>
                <p className="text-white text-lg sm:text-2xl font-bold mt-1">{drawDateLabel}</p>
                <div className="mt-3 text-center">
                  <a
                    href="https://www.facebook.com/toolsaust"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-white/90 hover:text-white text-[12px] sm:text-[14px] font-medium transition-colors underline"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                    {isGapState ? (
                      <>
                        <div className="relative">
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                          <div className="absolute inset-0 w-2 h-2 bg-green-400 rounded-full animate-ping opacity-75"></div>
                        </div>
                        Watch ongoing draw
                      </>
                    ) : (
                      "Follow for live draw updates"
                    )}
                  </a>
                </div>
              </div>
            )}

            <button
              onClick={handleEnterNow}
              suppressHydrationWarning
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
              />
            </div>
          </div>

          <div className="space-y-3 sm:space-y-4 order-2 lg:order-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
              {highlights.map((highlight, index) => {
                const Icon = resolveHighlightIcon(highlight.icon);
                return (
                  <div
                    key={`${highlight.title}-${index}`}
                    className="relative flex items-start gap-2 sm:gap-4 p-2.5 sm:p-4 bg-gradient-to-br from-gray-900 via-gray-800 to-black backdrop-blur-sm rounded-xl sm:rounded-2xl border border-gray-700 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent rounded-xl sm:rounded-2xl pointer-events-none"></div>
                    <div className={`absolute top-2.5 left-2.5 sm:relative sm:top-auto sm:left-auto w-8 h-8 sm:w-12 sm:h-12 bg-gradient-to-br ${brandColors.gradient.replace('from-', 'from-').replace('via-', 'via-').replace('to-', 'to-')}/80 backdrop-blur-sm rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 border-2 ${brandColors.borderColor.replace('border-', 'border-').replace('-500', '-400/30')} shadow-lg z-10`}>
                      <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent rounded-lg sm:rounded-xl"></div>
                      <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${brandColors.textColor} relative z-10`} />
                    </div>
                    <div className="flex-1 relative z-10 pl-10 sm:pl-0">
                      <h3 className="text-xs sm:text-lg font-bold text-white font-['Poppins'] mb-0.5 sm:mb-1 drop-shadow-md leading-tight">
                        {highlight.title}
                      </h3>
                      <p className="text-[10px] sm:text-base text-gray-300 font-['Inter'] leading-tight sm:leading-relaxed">
                        {highlight.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-black backdrop-blur-sm rounded-xl sm:rounded-2xl p-3 sm:p-6 border border-gray-700 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent rounded-xl sm:rounded-2xl pointer-events-none"></div>
              <h3 className="text-sm sm:text-lg font-bold text-white font-['Poppins'] mb-1.5 sm:mb-2 relative z-10 drop-shadow-md">
                Prize Details
              </h3>
              <p className="text-xs sm:text-base text-gray-300 font-['Inter'] leading-tight sm:leading-relaxed relative z-10">
                {activePrize.detailedDescription}
              </p>
            </div>

            <button
              onClick={handleEnterNow}
              suppressHydrationWarning
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
