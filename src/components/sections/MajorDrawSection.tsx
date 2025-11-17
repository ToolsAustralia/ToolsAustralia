"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users, ArrowRight, Zap, Check } from "lucide-react";
import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Thumbs, FreeMode } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/thumbs";
import "swiper/css/free-mode";
import { Button } from "@/components/modals/ui";
import MembershipModal from "@/components/modals/MembershipModal";
import { useUserContext } from "@/contexts/UserContext";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";
import { useCurrentMajorDraw, useUserMajorDrawStats } from "@/hooks/queries/useMajorDrawQueries";
import PrizeSpecificationsModal from "@/components/modals/PrizeSpecificationsModal";
import { usePrizeCatalog } from "@/hooks/usePrizeCatalog";
import { Skeleton } from "@/components/loading/SkeletonLoader";

interface MajorDrawSectionProps {
  className?: string;
}

export default function MajorDrawSection({ className = "" }: MajorDrawSectionProps) {
  const router = useRouter();
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [thumbsSwiper, setThumbsSwiper] = useState<SwiperType | null>(null);
  const [mobileMainSwiper, setMobileMainSwiper] = useState<SwiperType | null>(null);
  const [desktopMainSwiper, setDesktopMainSwiper] = useState<SwiperType | null>(null);
  const [desktopThumbsSwiper, setDesktopThumbsSwiper] = useState<SwiperType | null>(null);
  const [isSpecsModalOpen, setIsSpecsModalOpen] = useState(false);
  const [selectedPrizeSlug, setSelectedPrizeSlug] = useState<string | null>(null);
  const { userData: user } = useUserContext();
  const { membershipModal, openEntryFlow, getHeavyDutyPack, oneTimePackages } = useMajorDrawEntryCta();
  // The shared CTA hook keeps modal behaviour consistent with Promo pages.

  // Use React Query hooks for real-time data
  const { data: currentMajorDraw, isLoading: majorDrawLoading } = useCurrentMajorDraw();
  const { data: currentUserStats, isLoading: userStatsLoading } = useUserMajorDrawStats(user?._id);
  const { prizes, activePrize, activeSlug, defaultSlug } = usePrizeCatalog({
    slug: selectedPrizeSlug ?? undefined,
  });

  useEffect(() => {
    if (!selectedPrizeSlug) {
      setSelectedPrizeSlug(activeSlug ?? defaultSlug);
    }
  }, [activeSlug, defaultSlug, selectedPrizeSlug]);

  // Debug: Track data changes
  // console.log("🔍 MajorDrawSection: currentMajorDraw data:", currentMajorDraw);
  // console.log("🔍 MajorDrawSection: currentMajorDraw totalEntries:", currentMajorDraw?.totalEntries);
  // console.log("🔍 MajorDrawSection: currentUserStats data:", currentUserStats);
  // console.log("🔍 MajorDrawSection: user._id:", user?._id);

  const formatIconKey = (iconName: string) =>
    iconName
      .split(/[\s-_]+/)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join("");

  const resolveHighlightIcon = (iconName?: string): LucideIcon => {
    const iconsMap = LucideIcons as unknown as Record<string, LucideIcon>;
    const fallbackIcon = iconsMap.Sparkles;
    if (!iconName) return fallbackIcon;
    const candidates = [iconName, iconName.charAt(0).toUpperCase() + iconName.slice(1), formatIconKey(iconName)];
    for (const key of candidates) {
      if (iconsMap[key]) {
        return iconsMap[key];
      }
    }
    return fallbackIcon;
  };

  const handlePrizeSelect = (slug: string) => {
    setSelectedPrizeSlug(slug);
  };

  const handleMobileThumbnailClick = (index: number) => {
    if (mobileMainSwiper && !mobileMainSwiper.destroyed) {
      mobileMainSwiper.slideTo(index);
    }
  };

  const handleDesktopThumbnailClick = (index: number) => {
    if (desktopMainSwiper && !desktopMainSwiper.destroyed) {
      desktopMainSwiper.slideTo(index);
    }
  };

  // Check for optimistic updates (processing state)
  const isProcessing =
    (currentMajorDraw as unknown as Record<string, unknown>)?.isProcessing ||
    (currentUserStats as unknown as Record<string, unknown>)?.isProcessing;
  const pendingEntries = ((currentUserStats as unknown as Record<string, unknown>)?.pendingEntries as number) || 0;
  const userHasEntries = (currentUserStats?.totalEntries ?? 0) + (pendingEntries > 0 ? pendingEntries : 0) > 0;
  const primaryCtaLabel = userHasEntries ? "Get More Entries" : "Enter Now";

  // Note: We now use API data directly which already provides current draw specific entries

  // Use API data for current draw entries (which is already filtered to current major draw)
  // Fallback to calculated data only if API data is not available
  const enhancedUserStats = {
    // Use currentDrawEntries from API (already filtered to current major draw)
    totalEntries: currentUserStats?.currentDrawEntries || 0,
    membershipEntries: currentUserStats?.membershipEntries || 0,
    oneTimeEntries: currentUserStats?.oneTimeEntries || 0,
    currentDrawEntries: currentUserStats?.currentDrawEntries || 0,
    totalDrawsEntered: currentUserStats?.totalDrawsEntered || 0,
    entriesByPackage: currentUserStats?.entriesByPackage || [],
  };

  // Debug logging
  // console.log("📊 MajorDrawSection - Entry Display Logic:", {
  //   apiStats: currentUserStats,
  //   displaying: enhancedUserStats,
  //   note: "Now showing only current major draw entries (not accumulated total)",
  // });

  // Update countdown timer
  useEffect(() => {
    // Show countdown for active, frozen, or any draw with a valid date
    if (!currentMajorDraw || !currentMajorDraw?.drawDate) return;

    const updateTimer = () => {
      const now = new Date().getTime();
      // Use drawDate for countdown
      const endTime = new Date(currentMajorDraw.drawDate || "").getTime();
      const difference = endTime - now;

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
  }, [currentMajorDraw]);

  // Set the default plan when component mounts or when user/package data changes
  useEffect(() => {
    if (membershipModal.selectedPlan === null && !majorDrawLoading && !userStatsLoading && oneTimePackages.length > 0) {
      const defaultPlan = getHeavyDutyPack();
      // console.log("🎯 Setting default plan:", defaultPlan);
      membershipModal.setSelectedPlan(defaultPlan);
    }
  }, [membershipModal, getHeavyDutyPack, majorDrawLoading, userStatsLoading, oneTimePackages]);

  // Listen for upsell modal requests
  useEffect(() => {
    const handleOpenMembershipModal = (event: CustomEvent) => {
      // console.log("🎯 Received openMembershipModal event:", event.detail);
      const { plan } = event.detail;
      if (plan) {
        membershipModal.setSelectedPlan(plan);
        membershipModal.openModal();
      }
    };

    window.addEventListener("openMembershipModal", handleOpenMembershipModal as EventListener);

    return () => {
      window.removeEventListener("openMembershipModal", handleOpenMembershipModal as EventListener);
    };
  }, [membershipModal]);

  // Use data if available, otherwise use defaults for static content
  const majorDraw = currentMajorDraw;
  const userStats = enhancedUserStats;
  const daysRemaining = currentMajorDraw?.drawDate
    ? Math.max(
        0,
        Math.ceil((new Date(currentMajorDraw.drawDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
      )
    : 0;
  const selectedPrize = activePrize;

  const prizeImages =
    selectedPrize.gallery && selectedPrize.gallery.length > 0
      ? selectedPrize.gallery
      : [{ src: "/images/grand-draw.jpg", alt: "Major draw prize" }];

  const resolvedHighlights =
    selectedPrize.highlights && selectedPrize.highlights.length > 0
      ? selectedPrize.highlights
      : [
          {
            icon: "Award" as const,
            title: "Monthly Major Draw",
            description: "Each draw unlocks premium prize packs.",
          },
        ];
  const prizeHeroHeading = selectedPrize.heroHeading;
  const prizeSubheading = selectedPrize.heroSubheading;
  const prizeLabel = selectedPrize.label;
  const prizeSummary = selectedPrize.summary;
  const prizeDescription = selectedPrize.detailedDescription;

  const detailsHref = `/promotions/${activeSlug ?? defaultSlug}`;

  // Helper function to get shortened label for prize cards
  const getShortLabel = (label: string): string => {
    if (label.includes("Milwaukee")) return "Milwaukee + $5K";
    if (label.includes("DeWalt")) return "DeWalt + $5K";
    if (label.includes("Makita")) return "Makita + $5K";
    if (label.includes("$10000")) return "$10K Cash";
    return label;
  };

  const renderPrizeToggle = (layout: "mobile" | "desktop" = "mobile") => {
    if (prizes.length <= 1) return null;

    return (
      <div className={layout === "desktop" ? "w-full" : ""}>
        <p className="text-xs sm:text-sm text-gray-500 font-['Inter'] uppercase tracking-wide mb-2 sm:mb-3 text-center">
          Pick Your Toolset
        </p>
        <div className="grid grid-cols-2 gap-2 sm:gap-4">
          {prizes.map((prizeOption) => {
            const isActive = prizeOption.slug === activeSlug;
            const shortLabel = getShortLabel(prizeOption.label);
            return (
              <button
                key={prizeOption.slug}
                onClick={() => {
                  // On mobile, redirect to prize page; on desktop, use state toggle
                  if (layout === "mobile") {
                    router.push(`/promotions/${prizeOption.slug}`);
                  } else {
                    handlePrizeSelect(prizeOption.slug);
                  }
                }}
                className={`relative p-2.5 sm:p-5 rounded-lg sm:rounded-xl border-2 transition-all duration-200 text-left hover:scale-[1.02] ${
                  isActive
                    ? "bg-gradient-to-br from-red-600 via-red-700 to-red-800 text-white border-red-500 shadow-lg shadow-red-500/40"
                    : "bg-white text-gray-700 border-slate-300 hover:border-red-400 hover:text-red-600 hover:shadow-md"
                }`}
              >
                {/* Active checkmark badge */}
                {isActive && (
                  <div className="absolute -top-1.5 -right-1.5 sm:-top-2 sm:-right-2 w-5 h-5 sm:w-6 sm:h-6 bg-white rounded-full flex items-center justify-center shadow-lg z-10">
                    <Check className="w-3 h-3 sm:w-4 sm:h-4 text-red-600" />
                  </div>
                )}

                {/* Card content */}
                <div className="pr-5 sm:pr-6">
                  <div
                    className={`text-xs sm:text-base font-bold font-['Poppins'] mb-0.5 sm:mb-1 leading-tight ${
                      isActive ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {shortLabel}
                  </div>
                  {/* Full label as subtitle on desktop */}
                  <div
                    className={`text-[10px] sm:text-sm font-['Inter'] leading-tight ${
                      isActive ? "text-white/80" : "text-gray-600"
                    }`}
                  >
                    <span className="hidden sm:inline">{prizeOption.label}</span>
                    <span className="sm:hidden line-clamp-1">{prizeOption.label.split(",")[0]}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderHighlights = (gridClasses: string) => (
    <div className={gridClasses}>
      {resolvedHighlights.map((highlight, index) => {
        const Icon = resolveHighlightIcon(highlight.icon);
        return (
          <div
            key={`${highlight.title}-${index}`}
            className="relative flex items-start gap-2 sm:gap-4 p-2.5 sm:p-4 bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-700/80 backdrop-blur-sm rounded-xl sm:rounded-2xl border border-slate-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
          >
            <div className="absolute top-2.5 left-2.5 sm:relative sm:top-auto sm:left-auto w-8 h-8 sm:w-12 sm:h-12 bg-gradient-to-br from-red-600/80 via-red-700/80 to-red-800/80 backdrop-blur-sm rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 border-2 border-red-400/30 shadow-lg z-10">
              <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="flex-1 relative z-10 pl-10 sm:pl-0">
              <h3 className="text-xs sm:text-lg font-bold text-white font-['Poppins'] mb-0.5 sm:mb-1 drop-shadow-md leading-tight">
                {highlight.title}
              </h3>
              <p className="text-[10px] sm:text-sm text-slate-200 font-['Inter'] leading-tight sm:leading-relaxed">
                {highlight.description}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );

  // Check if draw is completed
  const isCompleted = majorDraw?.status === "completed";

  return (
    <>
      <section className={`relative py-8 sm:py-12   w-full overflow-visible ${className}`}>
        <div className="relative w-full px-2 sm:px-0 max-w-7xl mx-auto overflow-visible">
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="text-lg sm:text-xl font-bold tracking-[0.35em] text-red-600 uppercase">
              OUR CURRENT GIVEAWAY
            </h1>
          </div>

          {/* Mobile: Stacked Layout */}
          <div className="lg:hidden space-y-6">
            {/* Mobile: Content */}
            <div className="text-center space-y-2 px-4">
              {/* Mobile: Main Title */}
              <div className="flex items-center justify-center gap-2">
                <h2 className="text-[24px] font-bold text-black font-['Poppins'] leading-tight">{prizeHeroHeading}</h2>
              </div>
              {prizeLabel && (
                <p className="hidden sm:block text-xs uppercase tracking-[0.35em] text-red-600 font-semibold">
                  {prizeLabel}
                </p>
              )}
              {prizeSubheading && (
                <p className="hidden sm:block text-xs text-gray-600 font-medium">{prizeSubheading}</p>
              )}
            </div>

            {/* Mobile: Prize Gallery */}
            <div className="space-y-4">
              {renderPrizeToggle()}
              <div className="relative w-full max-w-sm mx-auto rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-slate-500/30 bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-700/80 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10" />
                <div className="absolute top-3 right-3 z-20">
                  <button
                    onClick={() => setIsSpecsModalOpen(true)}
                    className="relative overflow-hidden rounded-full transition-all duration-300 hover:scale-105 group"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-red-600 via-red-700 to-red-800" />
                    <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent" />
                    <div className="pointer-events-none absolute inset-0 rounded-full bg-red-500/25 blur-xl animate-ping" />
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-red-500/20 blur-xl" />
                    <div className="relative z-10 flex items-center justify-center gap-1.5 px-3 py-1.5 border-2 border-red-400/30 rounded-full">
                      <span className="font-bold text-xs text-white drop-shadow-lg">VIEW SPECS</span>
                    </div>
                  </button>
                </div>
                <Swiper
                  modules={[Navigation, Pagination, Thumbs]}
                  thumbs={{ swiper: thumbsSwiper && !thumbsSwiper.destroyed ? thumbsSwiper : null }}
                  navigation
                  pagination={{ clickable: true }}
                  className="main-swiper"
                  spaceBetween={0}
                  slidesPerView={1}
                  onSwiper={setMobileMainSwiper}
                >
                  {prizeImages.map((image, index) => (
                    <SwiperSlide key={`${image.src}-${index}`}>
                      <div className="relative aspect-square lg:aspect-[4/3] bg-slate-800/50">
                        <Image
                          src={image.src}
                          alt={image.alt || `Prize image ${index + 1}`}
                          fill
                          className="object-contain"
                          priority={index === 0}
                          sizes="(max-width: 640px) 100vw, 400px"
                        />
                      </div>
                    </SwiperSlide>
                  ))}
                </Swiper>
              </div>

              <Swiper
                modules={[FreeMode, Thumbs]}
                onSwiper={setThumbsSwiper}
                spaceBetween={8}
                slidesPerView="auto"
                freeMode
                watchSlidesProgress
                slideToClickedSlide
                className="thumbs-swiper"
              >
                {prizeImages.map((image, index) => (
                  <SwiperSlide
                    key={`mobile-thumb-${image.src}-${index}`}
                    className="!w-16 !h-16 sm:!w-20 sm:!h-20"
                    onClick={() => handleMobileThumbnailClick(index)}
                  >
                    <div className="relative w-full h-full rounded-xl overflow-hidden border-2 border-slate-500/30 hover:border-red-500/50 transition-all duration-300 cursor-pointer bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-700/80">
                      <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10" />
                      <Image
                        src={image.src}
                        alt={image.alt || `Prize thumbnail ${index + 1}`}
                        fill
                        className="object-contain"
                      />
                    </div>
                  </SwiperSlide>
                ))}
              </Swiper>

              {resolvedHighlights.length > 0 && renderHighlights("grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4")}

              <div className="px-3 sm:px-4">
                <p className="text-xs sm:text-base text-gray-700 leading-tight sm:leading-relaxed font-['Inter'] text-center sm:text-left">
                  {prizeSummary}
                </p>
              </div>
            </div>

            {/* Mobile: Countdown Timer or Draw Ended */}
            {majorDrawLoading || !currentMajorDraw ? (
              // Skeleton loader for countdown
              <div className="rounded-3xl p-6 shadow-2xl border-2 border-white/20 bg-gradient-to-br from-gray-200 to-gray-300">
                <div className="grid grid-cols-4 gap-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="bg-white/20 backdrop-blur-sm rounded-2xl p-3 text-center border border-white/30"
                    >
                      <Skeleton height={24} className="w-full mb-2 bg-white/40" />
                      <Skeleton height={12} className="w-12 mx-auto bg-white/40" />
                    </div>
                  ))}
                </div>
                <div className="mt-4 text-center">
                  <Skeleton height={16} className="w-40 mx-auto bg-white/40" />
                </div>
              </div>
            ) : !isCompleted && daysRemaining > 0 ? (
              <div
                className={`rounded-3xl p-3 sm:p-4 shadow-2xl border-2 border-white/20 ${
                  currentMajorDraw?.status === "frozen"
                    ? "bg-gradient-to-br from-gray-600 to-gray-700"
                    : "bg-gradient-to-br from-red-600 to-red-700"
                }`}
              >
                {/* Frozen Draw Notice */}
                {currentMajorDraw?.status === "frozen" && (
                  <div className="mb-3 text-center">
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-2 sm:p-3 border border-white/20">
                      <div className="text-white font-semibold text-xs sm:text-sm">⏰ Entry Period Closed</div>
                      <div className="text-white/80 text-[10px] sm:text-xs mt-1">
                        No new entries accepted for this draw
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                  <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-2 sm:p-3 text-center border border-white/20">
                    <div className="text-lg sm:text-2xl font-bold text-white">
                      {String(timeLeft.days).padStart(2, "0")}
                    </div>
                    <div className="text-[10px] sm:text-[12px] text-white/80 font-medium">Days</div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-2 sm:p-3 text-center border border-white/20">
                    <div className="text-lg sm:text-2xl font-bold text-white">
                      {String(timeLeft.hours).padStart(2, "0")}
                    </div>
                    <div className="text-[10px] sm:text-[12px] text-white/80 font-medium">Hours</div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-2 sm:p-3 text-center border border-white/20">
                    <div className="text-lg sm:text-2xl font-bold text-white">
                      {String(timeLeft.minutes).padStart(2, "0")}
                    </div>
                    <div className="text-[10px] sm:text-[12px] text-white/80 font-medium">Mins</div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-2 sm:p-3 text-center border border-white/20">
                    <div className="text-lg sm:text-2xl font-bold text-white">
                      {String(timeLeft.seconds).padStart(2, "0")}
                    </div>
                    <div className="text-[10px] sm:text-[12px] text-white/80 font-medium">Secs</div>
                  </div>
                </div>

                {/* Facebook Follow Link */}
                <div className="mt-4 text-center">
                  <a
                    href="https://facebook.com/tools-australia"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-white/90 hover:text-white text-[12px] font-medium transition-colors"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                    Follow for live draw updates
                  </a>
                </div>
              </div>
            ) : null}

            {/* Mobile: Draw Ended Section */}
            {isCompleted && (
              <div className="bg-gradient-to-br from-gray-600 to-gray-700 rounded-3xl p-6 shadow-2xl border-2 border-white/20">
                <div className="text-center space-y-4">
                  <div className="flex items-center justify-center">
                    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 text-center border border-white/20">
                      <div className="text-[24px] font-bold text-white">Draw Ended</div>
                      <div className="text-[12px] text-white/80 font-medium">Live Stream Available</div>
                    </div>
                  </div>
                  <a
                    href="https://facebook.com/tools-australia"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold text-[14px] transition-all duration-200 shadow-lg hover:shadow-xl"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                    Watch Live Stream
                  </a>
                </div>
              </div>
            )}

            {/* Mobile: User Stats */}
            {user ? (
              userStatsLoading ? (
                // Skeleton loader for user entries
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 border border-red-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Skeleton width={16} height={16} className="bg-gray-300" rounded />
                      <Skeleton height={14} width={80} className="bg-gray-300" />
                    </div>
                    <Skeleton height={14} width={40} className="bg-gray-300" />
                  </div>
                </div>
              ) : (
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 border border-red-200">
                  <button
                    onClick={() => setShowBreakdown(!showBreakdown)}
                    className="w-full text-left hover:bg-gray-50 rounded-lg p-2 -m-2 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-red-600" />
                        <span className="text-[14px] font-semibold text-red-600">Your Entries</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-bold text-red-600">{userStats.totalEntries}</span>
                        {Boolean(isProcessing) && pendingEntries > 0 && (
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span className="text-[10px] text-green-600 font-medium">+{String(pendingEntries)}</span>
                          </div>
                        )}
                        <svg
                          className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${
                            showBreakdown ? "rotate-180" : ""
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </button>

                  {showBreakdown && (
                    <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                      <div className="flex justify-between items-center">
                        <span className="text-[12px] text-gray-700">From Membership:</span>
                        <span className="text-[12px] font-medium text-gray-600">
                          {enhancedUserStats.membershipEntries || 0}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[12px] text-gray-700">From Packages:</span>
                        <span className="text-[12px] font-medium text-gray-600">
                          {enhancedUserStats.oneTimeEntries || 0}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )
            ) : null}

            {/* Mobile: Action Buttons */}
            <div className="flex flex-col gap-3">
              <Button
                onClick={() => {
                  // Shared handler decides which modal or upsell to show.
                  openEntryFlow();
                }}
                className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white px-6 py-3 rounded-xl font-semibold text-[16px] transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
              >
                <Zap className="w-5 h-5" />
                {primaryCtaLabel}
              </Button>

              <Link href={detailsHref}>
                <Button
                  variant="outline"
                  className="border-2 border-red-600 text-red-600 hover:bg-red-600 hover:text-white px-6 py-3 rounded-xl font-semibold text-[16px] transition-all duration-200 flex items-center justify-center gap-2 w-full"
                >
                  View Details
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Desktop: Grid Layout */}
          <div className="hidden lg:grid grid-cols-2 gap-6 items-start min-h-[640px]">
            <div className="col-span-2">{renderPrizeToggle("desktop")}</div>
            {/* Left Column - Gallery & Countdown */}
            <div className="flex flex-col space-y-6">
              <div className="relative rounded-3xl shadow-[0_12px_48px_rgba(15,23,42,0.25)] border border-slate-500/30 bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-700/80 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10" />
                <div className="absolute top-4 right-4 z-20">
                  <button
                    onClick={() => setIsSpecsModalOpen(true)}
                    className="relative overflow-hidden rounded-full transition-all duration-300 hover:scale-105 group"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-red-600 via-red-700 to-red-800" />
                    <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent" />
                    <div className="pointer-events-none absolute inset-0 rounded-full bg-red-500/25 blur-xl animate-ping" />
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-red-500/20 blur-xl" />
                    <div className="relative z-10 flex items-center justify-center gap-2 px-4 py-2 border-2 border-red-400/30 rounded-full">
                      <span className="font-bold text-xs sm:text-sm text-white drop-shadow-lg whitespace-nowrap">
                        VIEW SPECS
                      </span>
                    </div>
                  </button>
                </div>
                <Swiper
                  modules={[Navigation, Pagination, Thumbs]}
                  navigation
                  pagination={{ clickable: true }}
                  thumbs={{
                    swiper: desktopThumbsSwiper && !desktopThumbsSwiper.destroyed ? desktopThumbsSwiper : null,
                  }}
                  className="main-swiper"
                  spaceBetween={0}
                  slidesPerView={1}
                  onSwiper={setDesktopMainSwiper}
                >
                  {prizeImages.map((image, index) => (
                    <SwiperSlide key={`${image.src}-${index}`}>
                      <div className="relative aspect-[4/3]">
                        <Image
                          src={image.src}
                          alt={image.alt || `Prize image ${index + 1}`}
                          fill
                          className="object-contain"
                          priority={index === 0}
                          sizes="(min-width: 1024px) 50vw, 100vw"
                        />
                      </div>
                    </SwiperSlide>
                  ))}
                </Swiper>
              </div>

              {/* The thumbnail rail now lives inside an overflow-hidden container so long galleries stay tidy. */}
              <div className="overflow-hidden">
                <Swiper
                  modules={[FreeMode, Thumbs]}
                  onSwiper={setDesktopThumbsSwiper}
                  spaceBetween={12}
                  slidesPerView="auto"
                  freeMode
                  watchSlidesProgress
                  slideToClickedSlide
                  className="thumbs-swiper"
                >
                  {prizeImages.map((image, index) => (
                    <SwiperSlide
                      key={`thumb-${image.src}-${index}`}
                      className="!w-20 !h-20 xl:!w-24 xl:!h-24 flex items-center justify-center cursor-pointer"
                      onClick={() => handleDesktopThumbnailClick(index)}
                    >
                      <div className="relative w-full h-full rounded-xl overflow-hidden border-2 border-slate-500/30 hover:border-red-500/40 transition-all duration-300 bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-700/80 cursor-pointer">
                        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10" />
                        <Image
                          src={image.src}
                          alt={image.alt || `Prize thumbnail ${index + 1}`}
                          fill
                          className="object-contain"
                          sizes="96px"
                        />
                      </div>
                    </SwiperSlide>
                  ))}
                </Swiper>
              </div>

              {/* Countdown / Draw Ended Notice */}
              {majorDrawLoading || !currentMajorDraw ? (
                // Skeleton loader for countdown (desktop)
                <div className="rounded-3xl p-6 shadow-2xl border border-white/10 bg-gradient-to-br from-gray-200 to-gray-300">
                  <div className="grid grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="bg-white/20 backdrop-blur-sm rounded-2xl p-4 text-center border border-white/30"
                      >
                        <Skeleton height={36} className="w-full mb-2 bg-white/40" />
                        <Skeleton height={14} className="w-16 mx-auto bg-white/40" />
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 text-center">
                    <Skeleton height={16} className="w-48 mx-auto bg-white/40" />
                  </div>
                </div>
              ) : !isCompleted && daysRemaining > 0 ? (
                <div
                  className={`rounded-3xl p-3 sm:p-4 shadow-2xl border-2 border-white/20 bg-gradient-to-br ${
                    currentMajorDraw?.status === "frozen" ? "from-slate-600 to-slate-700" : "from-red-600 to-red-700"
                  }`}
                >
                  {currentMajorDraw?.status === "frozen" && (
                    <div className="mb-3 text-center">
                      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-2 sm:p-3 border border-white/20">
                        <div className="text-white font-semibold text-xs sm:text-sm uppercase tracking-wide">
                          ⏰ Entry Period Closed
                        </div>
                        <div className="text-white/80 text-[10px] sm:text-xs mt-1">
                          No new entries accepted for this draw
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
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="bg-white/10 backdrop-blur-sm rounded-2xl p-2 sm:p-3 text-center border border-white/20"
                      >
                        <div className="text-lg sm:text-2xl font-bold text-white font-['Poppins']">
                          {String(item.value).padStart(2, "0")}
                        </div>
                        <div className="text-[10px] sm:text-[12px] text-white/80 font-medium">{item.label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 text-center">
                    <a
                      href="https://facebook.com/tools-australia"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-white/90 hover:text-white text-sm font-medium transition-colors"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                      Follow for live draw updates
                    </a>
                  </div>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-slate-600 to-slate-700 rounded-3xl p-6 shadow-2xl border border-white/10">
                  <div className="text-center space-y-4">
                    <div className="flex items-center justify-center">
                      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-center border border-white/20">
                        <div className="text-3xl font-bold text-white uppercase tracking-wide">Draw Ended</div>
                        <div className="text-sm text-white/80 font-medium mt-1">Live Stream Available</div>
                      </div>
                    </div>
                    <a
                      href="https://facebook.com/tools-australia"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl font-semibold text-base transition-all duration-200 shadow-lg hover:shadow-xl"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                      Watch Live Stream
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Details, Highlights, Stats, Actions */}
            <div className="flex flex-col gap-6">
              <div className="space-y-4">
                <div>
                  <h2 className="text-4xl font-bold text-gray-900 font-['Poppins'] leading-tight drop-shadow-sm">
                    {majorDraw?.name || activePrize?.heroHeading || "Major Draw"}
                  </h2>
                  {prizeLabel && (
                    <p className="text-sm uppercase tracking-[0.35em] text-red-600 font-semibold mt-1">{prizeLabel}</p>
                  )}
                  {prizeHeroHeading && <p className="text-base text-gray-600 font-medium mt-2">{prizeHeroHeading}</p>}
                  {prizeSubheading && <p className="text-sm text-gray-500 font-medium mt-1">{prizeSubheading}</p>}
                </div>

                {resolvedHighlights.length > 0 && <div>{renderHighlights("grid grid-cols-2 gap-4")}</div>}

                <p className="text-base text-gray-700 leading-relaxed font-['Inter']">{prizeDescription}</p>
              </div>

              {user ? (
                userStatsLoading ? (
                  // Skeleton loader for user entries (desktop)
                  <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-5 border border-red-100 shadow-inner">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Skeleton width={16} height={16} className="bg-gray-300" rounded />
                        <Skeleton height={14} width={100} className="bg-gray-300" />
                      </div>
                      <Skeleton height={18} width={50} className="bg-gray-300" />
                    </div>
                  </div>
                ) : (
                  <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-5 border border-red-100 shadow-inner">
                    <button
                      onClick={() => setShowBreakdown(!showBreakdown)}
                      className="w-full text-left hover:bg-red-50/40 rounded-lg px-3 py-2 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-red-600" />
                          <span className="text-sm font-semibold text-red-600">Your Entries</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-red-600">{userStats.totalEntries}</span>
                          {Boolean(isProcessing) && pendingEntries > 0 && (
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                              <span className="text-xs text-green-600 font-medium">+{String(pendingEntries)}</span>
                            </div>
                          )}
                          <svg
                            className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${
                              showBreakdown ? "rotate-180" : ""
                            }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </button>

                    {showBreakdown && (
                      <div className="mt-3 space-y-2 text-sm text-gray-600">
                        <div className="flex justify-between">
                          <span>From Membership</span>
                          <span className="font-semibold">{enhancedUserStats.membershipEntries}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>From Packages</span>
                          <span className="font-semibold">{enhancedUserStats.oneTimeEntries}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              ) : null}

              <div className="flex flex-col lg:flex-row gap-3 border-t border-gray-200 pt-4">
                <Button
                  onClick={() => openEntryFlow()}
                  className="bg-gradient-to-r from-red-600 via-red-700 to-red-800 hover:from-red-700 hover:to-red-900 text-white px-6 py-3 rounded-xl font-semibold text-lg transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2 flex-1"
                >
                  <Zap className="w-5 h-5" />
                  {primaryCtaLabel}
                </Button>

                <Link href={detailsHref} className="flex-1">
                  <Button
                    variant="outline"
                    className="border-2 border-red-600 text-red-600 hover:bg-red-600 hover:text-white px-6 py-3 rounded-xl font-semibold text-lg transition-all duration-200 flex items-center justify-center gap-2 w-full"
                  >
                    View Details
                    <ArrowRight className="w-5 h-5" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <PrizeSpecificationsModal
        isOpen={isSpecsModalOpen}
        onClose={() => setIsSpecsModalOpen(false)}
        prize={selectedPrize}
      />

      {/* Membership Modal */}
      <MembershipModal
        isOpen={membershipModal.isModalOpen}
        onClose={membershipModal.closeModal}
        selectedPlan={membershipModal.selectedPlan || getHeavyDutyPack()}
        onPlanChange={membershipModal.selectPlan}
      />
    </>
  );
}
