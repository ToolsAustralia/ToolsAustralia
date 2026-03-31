"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Users, Zap, Check, ChevronLeft, ChevronRight } from "lucide-react";
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
import MembershipModal from "@/components/modals/MembershipModal";
import { useUserContext } from "@/contexts/UserContext";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";
import { useMajorDrawPurchaseGate } from "@/hooks/useMajorDrawPurchaseGate";
import { useCurrentMajorDraw, useUserMajorDrawStats } from "@/hooks/queries/useMajorDrawQueries";
import PrizeSpecificationsModal from "@/components/modals/PrizeSpecificationsModal";
import { usePrizeCatalog } from "@/hooks/usePrizeCatalog";
import { Skeleton } from "@/components/loading/SkeletonLoader";
import {
  getPrizeBrandColors,
  getBrandBorderColor,
  getBrandGlowColor,
} from "@/utils/prize-brand-colors";
import { getMembershipSectionColorScheme } from "@/utils/package-colors/packageColorScheme";
import type { PrizeCatalogEntry, PrizeSlug } from "@/config/prizes";

interface MajorDrawSectionProps {
  className?: string;
}

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

export default function MajorDrawSection({ className = "" }: MajorDrawSectionProps) {
  const searchParams = useSearchParams();
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
  const [toolboxType, setToolboxType] = useState<"sidchrome" | "milwaukee" | "cash">("milwaukee");
  const [mobilePrizeIndex, setMobilePrizeIndex] = useState(0);
  const [nextDrawName, setNextDrawName] = useState<string | null>(null);
  const { userData: user } = useUserContext();
  const { membershipModal, openEntryFlow, getHeavyDutyPack, oneTimePackages } = useMajorDrawEntryCta();
  const { whenGatesOpenElseGateModal } = useMajorDrawPurchaseGate();
  // The shared CTA hook keeps modal behaviour consistent with Promo pages.

  // Use React Query hooks for real-time data
  const { data: currentMajorDraw, isLoading: majorDrawLoading } = useCurrentMajorDraw();
  const { data: currentUserStats, isLoading: userStatsLoading } = useUserMajorDrawStats(user?._id);
  const { prizes, activePrize, activeSlug, defaultSlug } = usePrizeCatalog({
    slug: selectedPrizeSlug ?? undefined,
  });

  useEffect(() => {
    if (!selectedPrizeSlug) {
      const slug = activeSlug ?? defaultSlug;
      setSelectedPrizeSlug(slug);
      setToolboxType(
        slug === "cash-prize"
          ? "cash"
          : (slug.startsWith("milwaukee-") || slug.endsWith("-milwaukee")) && !slug.includes("sidchrome")
            ? "milwaukee"
            : slug.includes("sidchrome")
              ? "sidchrome"
              : "sidchrome"
      );
    }
  }, [activeSlug, defaultSlug, selectedPrizeSlug]);

  // Fetch next draw name when current draw is frozen or completed (gap state)
  useEffect(() => {
    if (currentMajorDraw?.status === "frozen" || currentMajorDraw?.status === "completed") {
      const fetchNextDrawName = async () => {
        try {
          const response = await fetch("/api/major-draw/next");
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.nextDraw?.name) {
              setNextDrawName(data.nextDraw.name);
            }
          }
        } catch (error) {
          console.error("Error fetching next draw name:", error);
        }
      };
      fetchNextDrawName();
    } else {
      setNextDrawName(null);
    }
  }, [currentMajorDraw?.status]);

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

  const handleToolboxTypeChange = (type: "sidchrome" | "milwaukee" | "cash") => {
    if (toolboxType === type) return;
    setToolboxType(type);
    const defaultSlugForType =
      type === "cash" ? "cash-prize" : type === "sidchrome" ? "milwaukee-sidchrome" : "milwaukee-milwaukee";
    setSelectedPrizeSlug(defaultSlugForType);
  };

  const handlePrizeCardSelect = (slug: string) => {
    if (slug === (selectedPrizeSlug ?? activeSlug ?? defaultSlug)) return;
    setSelectedPrizeSlug(slug);
    setToolboxType(
      slug === "cash-prize"
        ? "cash"
        : (slug.startsWith("milwaukee-") || slug.endsWith("-milwaukee")) && !slug.includes("sidchrome")
          ? "milwaukee"
          : slug.includes("sidchrome")
            ? "sidchrome"
            : "sidchrome"
    );
  };

  // Check for optimistic updates (processing state)
  const isProcessing =
    (currentMajorDraw as unknown as Record<string, unknown>)?.isProcessing ||
    (currentUserStats as unknown as Record<string, unknown>)?.isProcessing;
  const pendingEntries = ((currentUserStats as unknown as Record<string, unknown>)?.pendingEntries as number) || 0;
  const userHasEntries = (currentUserStats?.totalEntries ?? 0) + (pendingEntries > 0 ? pendingEntries : 0) > 0;
  const primaryCtaLabel = userHasEntries ? "Get More Entries" : "Enter Now";
  const effectivePlan = membershipModal.selectedPlan || getHeavyDutyPack();
  const ctaColorScheme = getMembershipSectionColorScheme(effectivePlan.id, effectivePlan.period !== "one-time");

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
      const detail = event.detail ?? {};
      const plan = detail.plan;

      whenGatesOpenElseGateModal(() => {
        if (plan) {
          membershipModal.setSelectedPlan(plan);
        }
        membershipModal.openModal();
      });
    };

    window.addEventListener("openMembershipModal", handleOpenMembershipModal as EventListener);

    return () => {
      window.removeEventListener("openMembershipModal", handleOpenMembershipModal as EventListener);
    };
  }, [membershipModal, whenGatesOpenElseGateModal]);

  // Use data if available, otherwise use defaults for static content
  const majorDraw = currentMajorDraw;
  const userStats = enhancedUserStats;
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
  const _prizeDescription = selectedPrize.detailedDescription;

  // Get brand colors for active prize to match View Specs button and other elements
  const activePrizeSlug = activeSlug || defaultSlug;
  const brandColors = getPrizeBrandColors(activePrizeSlug);

  // Preserve affiliate code from URL if present
  const affiliateCode = searchParams.get("aff");
  const _detailsHref = affiliateCode
    ? `/promotions/${activeSlug ?? defaultSlug}?aff=${affiliateCode}`
    : `/promotions/${activeSlug ?? defaultSlug}`;

  // Helper function to get brand logo path based on prize slug (matches PrizeShowcase)
  const getBrandLogoPath = (slug: string): string | null => {
    switch (slug) {
      case "milwaukee-sidchrome":
      case "milwaukee-milwaukee":
        return "/images/brands/milwaukee.png";
      case "dewalt-sidchrome":
      case "dewalt-milwaukee":
        return "/images/brands/dewalt-black.png";
      case "makita-sidchrome":
      case "makita-milwaukee":
        return "/images/brands/Makita-red.png";
      case "ryobi-sidchrome":
      case "ryobi-milwaukee":
        return "/images/brands/name/ryobiText.png";
      case "cash-prize":
        return null;
      default:
        return null;
    }
  };

  // Helper function to get first prize text image path based on prize slug
  const getFirstPrizeImagePath = (slug: string): string => {
    switch (slug) {
      case "dewalt-sidchrome":
      case "dewalt-milwaukee":
        return "/images/promotion/FirstPrizeText/1stprice-dewalt.png";
      case "makita-sidchrome":
      case "makita-milwaukee":
        return "/images/promotion/FirstPrizeText/1stprice-makita.png";
      case "ryobi-sidchrome":
      case "ryobi-milwaukee":
        return "/images/promotion/FirstPrizeText/1stprice-milwaukee.png"; // Fallback until 1stprice-ryobi.png exists
      case "cash-prize":
        return "/images/promotion/FirstPrizeText/1stprice-cash.png";
      case "milwaukee-sidchrome":
      case "milwaukee-milwaukee":
      default:
        return "/images/promotion/FirstPrizeText/1stprice-milwaukee.png";
    }
  };

  // Formatted multi-line label for prize cards; slug-driven so Milwaukee toolbox shows
  // "Milwaukee Toolbox" / "Milwaukee Powertools" etc. (matches PrizeShowcase)
  const getFormattedLabel = (
    label: string,
    slug?: string,
    isMobile?: boolean
  ): { line1: string; line2: string | null; line3: string | null } => {
    if (slug) {
      if (slug === "milwaukee-sidchrome") {
        return {
          line1: isMobile ? "Sidchrome Toolbox" : "Sidchrome",
          line2: isMobile ? "Milwaukee Powertools" : "Milwaukee",
          line3: "$5000 Cash Prize",
        };
      }
      if (slug === "dewalt-sidchrome") {
        return {
          line1: isMobile ? "Sidchrome Toolbox" : "Sidchrome",
          line2: isMobile ? "DeWalt Powertools" : "DeWalt",
          line3: "$5000 Cash Prize",
        };
      }
      if (slug === "makita-sidchrome") {
        return {
          line1: isMobile ? "Sidchrome Toolbox" : "Sidchrome",
          line2: isMobile ? "Makita Powertools" : "Makita",
          line3: "$5000 Cash Prize",
        };
      }
      if (slug === "milwaukee-milwaukee") {
        return {
          line1: isMobile ? "Milwaukee Toolbox" : "Milwaukee",
          line2: isMobile ? "Milwaukee Powertools" : "Milwaukee",
          line3: "$5000 Cash Prize",
        };
      }
      if (slug === "dewalt-milwaukee") {
        return {
          line1: isMobile ? "Milwaukee Toolbox" : "Milwaukee",
          line2: isMobile ? "DeWalt Powertools" : "DeWalt",
          line3: "$5000 Cash Prize",
        };
      }
      if (slug === "makita-milwaukee") {
        return {
          line1: isMobile ? "Milwaukee Toolbox" : "Milwaukee",
          line2: isMobile ? "Makita Powertools" : "Makita",
          line3: "$5000 Cash Prize",
        };
      }
      if (slug === "ryobi-sidchrome") {
        return {
          line1: isMobile ? "Sidchrome Toolbox" : "Sidchrome",
          line2: isMobile ? "Ryobi Powertools" : "Ryobi",
          line3: "$5000 Cash Prize",
        };
      }
      if (slug === "ryobi-milwaukee") {
        return {
          line1: isMobile ? "Milwaukee Toolbox" : "Milwaukee",
          line2: isMobile ? "Ryobi Powertools" : "Ryobi",
          line3: "$5000 Cash Prize",
        };
      }
      if (slug === "cash-prize") {
        return { line1: "$10,000 Tax Free Cash", line2: null, line3: null };
      }
    }
    if (label.includes("$10000") || label.includes("$10,000")) {
      return { line1: "$10,000 Tax Free Cash", line2: null, line3: null };
    }
    return { line1: label, line2: null, line3: null };
  };

  const _getToolboxTypeFromSlug = (slug: string): "sidchrome" | "milwaukee" | "cash" => {
    if (slug === "cash-prize") return "cash";
    if (
      (slug.startsWith("milwaukee-") || slug.endsWith("-milwaukee")) &&
      !slug.includes("sidchrome")
    ) {
      return "milwaukee";
    }
    if (slug.includes("sidchrome")) return "sidchrome";
    return "sidchrome";
  };

  const filterPrizesByToolboxType = (
    prizeList: PrizeCatalogEntry[],
    toolboxType: "sidchrome" | "milwaukee" | "cash"
  ): PrizeCatalogEntry[] => {
    if (toolboxType === "cash") {
      return prizeList.filter((p) => p.slug === "cash-prize");
    }
    if (toolboxType === "sidchrome") {
      return prizeList.filter((p) => p.slug.includes("sidchrome"));
    }
    if (toolboxType === "milwaukee") {
      return prizeList.filter(
        (p) => p.slug.includes("milwaukee") && !p.slug.includes("sidchrome")
      );
    }
    return prizeList;
  };

  const displaySlug = selectedPrizeSlug ?? activeSlug ?? defaultSlug;
  const filteredPrizes = filterPrizesByToolboxType(prizes, toolboxType);
  const activePrizeIndexInFiltered = filteredPrizes.findIndex((p) => p.slug === displaySlug);

  useEffect(() => {
    if (activePrizeIndexInFiltered >= 0) {
      setMobilePrizeIndex(activePrizeIndexInFiltered);
    }
  }, [displaySlug, activePrizeIndexInFiltered]);

  const handlePreviousPrize = () => {
    if (filteredPrizes.length === 0) return;
    const newIndex =
      mobilePrizeIndex > 0 ? mobilePrizeIndex - 1 : filteredPrizes.length - 1;
    setMobilePrizeIndex(newIndex);
    handlePrizeCardSelect(filteredPrizes[newIndex].slug);
  };

  const handleNextPrize = () => {
    if (filteredPrizes.length === 0) return;
    const newIndex =
      mobilePrizeIndex < filteredPrizes.length - 1 ? mobilePrizeIndex + 1 : 0;
    setMobilePrizeIndex(newIndex);
    handlePrizeCardSelect(filteredPrizes[newIndex].slug);
  };

  const renderPickYourToolset = (layout: "mobile" | "desktop" = "mobile") => {
    if (prizes.length <= 1) return null;

    return (
      <div className={layout === "desktop" ? "mt-4 sm:mt-6 max-w-5xl mx-auto" : "mt-4 sm:mt-6"}>
        <p className="text-lg sm:text-xl font-bold text-black dark:text-white font-['Poppins'] mb-2 sm:mb-3 text-center">
          Pick Your Toolset
        </p>
        {/* Toolbox type toggle - clickable, updates content only (no URL nav) */}
        <div className="flex justify-center gap-2 sm:gap-3 mb-4 sm:mb-6">
          {(["sidchrome", "milwaukee", "cash"] as const).map((type) => {
            const isActive = toolboxType === type;
            const label =
              type === "sidchrome" ? "Sidchrome Toolbox" : type === "milwaukee" ? "Milwaukee Toolbox" : "$10,000 Cash";
            return (
              <button
                key={type}
                type="button"
                onClick={() => handleToolboxTypeChange(type)}
                suppressHydrationWarning
                className={`px-4 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl font-semibold text-xs sm:text-sm transition-all duration-200 border-2 ${
                  isActive && type !== "cash"
                    ? "bg-gradient-to-br from-red-600 via-red-500 to-red-700 text-white border-red-500 shadow-lg shadow-red-500/40"
                    : isActive && type === "cash"
                      ? "bg-gradient-to-br from-green-500 via-green-600 to-green-700 text-white border-green-500 shadow-lg shadow-green-500/40"
                      : "bg-white dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 border-gray-300 dark:border-neutral-600 hover:border-gray-400 dark:hover:border-neutral-500"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {/* Prize cards - clickable, updates gallery/content only (no URL nav) */}
        {toolboxType !== "cash" && (
          <>
            {/* Mobile: single card + chevron nav (matches PrizeShowcase) */}
            {layout === "mobile" && (
              <div className="relative max-w-md mx-auto overflow-visible">
                {filteredPrizes.length > 0 && filteredPrizes[mobilePrizeIndex] && (() => {
                  const prizeOption = filteredPrizes[mobilePrizeIndex];
                  const isActive = prizeOption.slug === displaySlug;
                  const pc = getPrizeBrandColors(prizeOption.slug as PrizeSlug);
                  const brandLogoPath = getBrandLogoPath(prizeOption.slug);
                  const formattedLabel = getFormattedLabel(prizeOption.label, prizeOption.slug, true);
                  return (
                    <button
                      type="button"
                      onClick={() => handlePrizeCardSelect(prizeOption.slug)}
                      tabIndex={-1}
                      suppressHydrationWarning
                      style={
                        !isActive
                          ? {
                              outline: "none",
                              boxShadow: `0 0 15px ${getBrandGlowColor(prizeOption.slug as PrizeSlug)}`,
                              borderColor: getBrandBorderColor(prizeOption.slug as PrizeSlug),
                            }
                          : {
                              outline: "none",
                              boxShadow: "none",
                              borderColor: getBrandBorderColor(prizeOption.slug as PrizeSlug),
                            }
                      }
                      className={`relative w-full p-5 rounded-2xl border-2 transition-all duration-300 text-center overflow-visible min-h-[110px] cursor-pointer ${
                        isActive
                          ? `bg-gradient-to-br ${pc.gradient} ${pc.textColor} shadow-xl ${pc.shadowColor} scale-[1.02] ring-2 ring-offset-2 ring-offset-white dark:ring-offset-neutral-950 ring-opacity-50`
                          : "bg-white dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 border-opacity-100 hover:scale-[1.02]"
                      }`}
                    >
                      {isActive && brandLogoPath && (
                        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                          <Image
                            src={brandLogoPath}
                            alt=""
                            fill
                            className="object-contain opacity-20"
                            sizes="(max-width: 640px) 100px, 150px"
                          />
                        </div>
                      )}
                      {isActive && (
                        <div className="absolute -top-2.5 -right-2.5 w-7 h-7 bg-white dark:bg-neutral-800 rounded-full flex items-center justify-center shadow-xl z-10 ring-2 ring-white/50 dark:ring-neutral-600/50">
                          <Check className={`w-4 h-4 ${pc.checkmarkColor}`} />
                        </div>
                      )}
                      <div className="relative z-10 w-full overflow-visible">
                        <div
                          className={`text-base font-bold font-['Poppins'] leading-tight break-words text-center ${
                            isActive ? "text-white" : "text-gray-900 dark:text-neutral-100"
                          }`}
                        >
                          <div className="block">{formattedLabel.line1}</div>
                          {formattedLabel.line2 && <div className="block">{formattedLabel.line2}</div>}
                          {formattedLabel.line3 && <div className="block">{formattedLabel.line3}</div>}
                        </div>
                      </div>
                    </button>
                  );
                })()}
                {filteredPrizes.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={handlePreviousPrize}
                      suppressHydrationWarning
                      className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-white/90 hover:bg-white dark:bg-neutral-800/95 dark:hover:bg-neutral-800 rounded-full shadow-lg flex items-center justify-center border-2 border-gray-300 hover:border-gray-400 dark:border-neutral-600 dark:hover:border-neutral-500 transition-all duration-200"
                      aria-label="Previous prize"
                    >
                      <ChevronLeft className="w-6 h-6 text-gray-700 dark:text-neutral-200" />
                    </button>
                    <button
                      type="button"
                      onClick={handleNextPrize}
                      suppressHydrationWarning
                      className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-white/90 hover:bg-white dark:bg-neutral-800/95 dark:hover:bg-neutral-800 rounded-full shadow-lg flex items-center justify-center border-2 border-gray-300 hover:border-gray-400 dark:border-neutral-600 dark:hover:border-neutral-500 transition-all duration-200"
                      aria-label="Next prize"
                    >
                      <ChevronRight className="w-6 h-6 text-gray-700 dark:text-neutral-200" />
                    </button>
                  </>
                )}
              </div>
            )}
            {/* Desktop: grid */}
            {layout === "desktop" && (
              <div
                className={`grid ${filteredPrizes.length === 3 ? "grid-cols-3" : "grid-cols-2"} gap-4 max-w-5xl mx-auto overflow-visible`}
              >
                {filteredPrizes.map((prizeOption) => {
                  const isActive = prizeOption.slug === displaySlug;
                  const pc = getPrizeBrandColors(prizeOption.slug as PrizeSlug);
                  const brandLogoPath = getBrandLogoPath(prizeOption.slug);
                  const formattedLabel = getFormattedLabel(prizeOption.label, prizeOption.slug, true);

                  return (
                    <button
                      key={prizeOption.slug}
                      type="button"
                      onClick={() => handlePrizeCardSelect(prizeOption.slug)}
                      tabIndex={0}
                      suppressHydrationWarning
                      style={
                        !isActive
                          ? {
                              outline: "none",
                              boxShadow: `0 0 15px ${getBrandGlowColor(prizeOption.slug as PrizeSlug)}`,
                              borderColor: getBrandBorderColor(prizeOption.slug as PrizeSlug),
                            }
                          : {
                              outline: "none",
                              boxShadow: "none",
                              borderColor: getBrandBorderColor(prizeOption.slug as PrizeSlug),
                            }
                      }
                      className={`relative p-5 rounded-2xl border-2 transition-all duration-300 text-center overflow-visible min-h-[110px] cursor-pointer ${
                        isActive
                          ? `bg-gradient-to-br ${pc.gradient} ${pc.textColor} shadow-xl ${pc.shadowColor} scale-[1.02] ring-2 ring-offset-2 ring-offset-white dark:ring-offset-neutral-950 ring-opacity-50`
                          : "bg-white dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 border-opacity-100 hover:scale-[1.02]"
                      }`}
                    >
                      {isActive && brandLogoPath && (
                        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                          <Image
                            src={brandLogoPath}
                            alt=""
                            fill
                            className="object-contain opacity-20"
                            sizes="(max-width: 640px) 100px, 150px"
                          />
                        </div>
                      )}
                      {isActive && (
                        <div className="absolute -top-2.5 -right-2.5 w-7 h-7 bg-white dark:bg-neutral-800 rounded-full flex items-center justify-center shadow-xl z-10 ring-2 ring-white/50 dark:ring-neutral-600/50">
                          <Check className={`w-4 h-4 ${pc.checkmarkColor}`} />
                        </div>
                      )}
                      <div className="relative z-10 w-full overflow-visible">
                        <div
                          className={`text-base font-bold font-['Poppins'] leading-tight break-words text-center ${
                            isActive ? "text-white" : "text-gray-900 dark:text-neutral-100"
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
            )}
          </>
        )}
        {toolboxType === "cash" && filteredPrizes[0] && (() => {
          const prizeOption = filteredPrizes[0];
          const isActive = prizeOption.slug === displaySlug;
          const pc = getPrizeBrandColors(prizeOption.slug as PrizeSlug);
          const formattedLabel = getFormattedLabel(prizeOption.label, prizeOption.slug, true);
          return (
            <button
              type="button"
              onClick={() => handlePrizeCardSelect(prizeOption.slug)}
              tabIndex={0}
              suppressHydrationWarning
              style={{
                outline: "none",
                boxShadow: isActive ? "none" : `0 0 15px ${getBrandGlowColor(prizeOption.slug as PrizeSlug)}`,
                borderColor: getBrandBorderColor(prizeOption.slug as PrizeSlug),
              }}
              className={`relative p-5 rounded-2xl border-2 text-center overflow-visible min-h-[110px] max-w-md mx-auto block w-full cursor-pointer ${
                isActive
                  ? `bg-gradient-to-br ${pc.gradient} ${pc.textColor} shadow-xl ${pc.shadowColor} scale-[1.02] ring-2 ring-offset-2 ring-offset-white dark:ring-offset-neutral-950 ring-opacity-50`
                  : "bg-white dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 hover:scale-[1.02]"
              }`}
            >
              {isActive && (
                <div className="absolute -top-2.5 -right-2.5 w-7 h-7 bg-white dark:bg-neutral-800 rounded-full flex items-center justify-center shadow-xl z-10 ring-2 ring-white/50 dark:ring-neutral-600/50">
                  <Check className={`w-4 h-4 ${pc.checkmarkColor}`} />
                </div>
              )}
              <div className="relative z-10">
                <div className={`text-base font-bold font-['Poppins'] leading-tight break-words text-center ${isActive ? "text-white" : "text-gray-900 dark:text-neutral-100"}`}>
                  <div className="block">{formattedLabel.line1}</div>
                  {formattedLabel.line2 && <div className="block">{formattedLabel.line2}</div>}
                  {formattedLabel.line3 && <div className="block">{formattedLabel.line3}</div>}
                </div>
              </div>
            </button>
          );
        })()}
      </div>
    );
  };

  const renderHighlights = (gridClasses: string) => (
    <div className={`${gridClasses} overflow-hidden`}>
      {resolvedHighlights.map((highlight, index) => {
        const Icon = resolveHighlightIcon(highlight.icon);
        return (
          <div
            key={`${highlight.title}-${index}`}
            className="relative flex items-start gap-2 sm:gap-4 p-2.5 sm:p-4 bg-gradient-to-br from-gray-900 via-gray-800 to-black backdrop-blur-sm rounded-xl sm:rounded-2xl border border-gray-700 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
          >
            <div
              className={`relative w-7 h-7 sm:w-12 sm:h-12 flex-shrink-0 bg-gradient-to-br ${
                brandColors.gradient
              } rounded-lg sm:rounded-xl flex items-center justify-center border-2 ${brandColors.borderColor
                .replace("border-", "border-")
                .replace("-500", "-400/30")} shadow-lg z-10`}
            >
              <Icon className={`w-3.5 h-3.5 sm:w-5 sm:h-5 ${brandColors.textColor}`} />
            </div>
            <div className="flex-1 min-w-0 relative z-10">
              <h3 className="text-xs sm:text-lg font-bold text-white font-['Poppins'] mb-0.5 sm:mb-1 drop-shadow-md leading-tight line-clamp-2 sm:line-clamp-none">
                {highlight.title}
              </h3>
              <p className="text-[10px] sm:text-sm text-gray-300 font-['Inter'] leading-tight sm:leading-relaxed hidden lg:block">
                {highlight.description}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );

  // Check if draw is completed or queued (gap state)
  const isCompleted = majorDraw?.status === "completed";
  const isQueued = majorDraw?.status === "queued";
  const _isGapState = isCompleted || isQueued;
  const drawDateObj = currentMajorDraw?.drawDate ? new Date(currentMajorDraw.drawDate) : null;
  const msUntilDraw = drawDateObj ? drawDateObj.getTime() - Date.now() : null;
  const daysUntilDraw = msUntilDraw !== null ? msUntilDraw / (1000 * 60 * 60 * 24) : null;
  const shouldShowCountdown =
    !isCompleted && msUntilDraw !== null && msUntilDraw > 0 && daysUntilDraw !== null && daysUntilDraw <= 3;
  
  // Format draw date with time in one line: "Tuesday, 27th January 5:30pm"
  const drawDateLabel = drawDateObj
    ? (() => {
        const weekday = drawDateObj.toLocaleDateString("en-AU", { weekday: "long" });
        const day = drawDateObj.getDate();
        const month = drawDateObj.toLocaleDateString("en-AU", { month: "long" });
        const time = formatTimeWithoutPeriod(drawDateObj);
        const ordinal = getOrdinalSuffix(day);
        return `${weekday}, ${day}${ordinal} ${month} ${time}`;
      })()
    : "Draw date TBA";

  return (
    <>
      <section className={`relative py-8 sm:py-12   w-full overflow-visible ${className}`}>
        <div className="relative w-full max-w-7xl mx-auto overflow-visible">
          <div className="text-center mb-0 sm:mb-8">
            <h1 className="text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-bold tracking-[0.35em] text-red-600 uppercase">
              OUR CURRENT GIVEAWAY
            </h1>
          </div>

          {/* Mobile: Stacked Layout */}
          <div className="lg:hidden space-y-6">
            {/* Mobile: Content */}
            <div className="text-center space-y-2 px-4">
              {/* Mobile: Main Title */}
              <div className="flex items-center justify-center gap-2">
                <h2 className="hidden lg:block text-[24px] font-bold text-black dark:text-white font-['Poppins'] leading-tight">
                  {prizeHeroHeading}
                </h2>
              </div>
              {prizeLabel && (
                <p className="hidden sm:block text-xs uppercase tracking-[0.35em] text-red-600 font-semibold">
                  {prizeLabel}
                </p>
              )}
              {prizeSubheading && (
                <p className="hidden sm:block text-xs text-gray-600 dark:text-neutral-400 font-medium">{prizeSubheading}</p>
              )}
            </div>

            {/* Mobile: Prize Gallery */}
            <div className="space-y-4">
              {/* First Prize Image - Conditionally displayed based on selected prize */}
              <div className="flex justify-center">
                <Image
                  src={getFirstPrizeImagePath(selectedPrizeSlug ?? activeSlug ?? defaultSlug)}
                  alt="First Prize"
                  width={800}
                  height={200}
                  className="w-full max-w-4xl h-auto object-contain"
                  priority
                />
              </div>
              {renderPickYourToolset()}
              <div
                className="relative w-full max-w-sm mx-auto rounded-2xl border-2 overflow-hidden bg-white dark:bg-neutral-900"
                style={{
                  borderColor: getBrandBorderColor(activePrizeSlug as PrizeSlug),
                  boxShadow: `0 0 20px ${getBrandGlowColor(activePrizeSlug as PrizeSlug)}, 0 8px 32px rgba(0,0,0,0.4)`,
                }}
              >
                <div className="absolute top-3 right-3 z-20">
                  <button
                    onClick={() => setIsSpecsModalOpen(true)}
                    className="relative overflow-hidden rounded-full transition-all duration-300 hover:scale-105 group"
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${brandColors.gradient}`} />
                    <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent" />
                    <div
                      className={`pointer-events-none absolute inset-0 rounded-full ${brandColors.shadowColor.replace(
                        "/40",
                        "/25"
                      )} blur-xl animate-ping`}
                    />
                    <div
                      className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${brandColors.shadowColor.replace(
                        "/40",
                        "/20"
                      )} blur-xl`}
                    />
                    <div
                      className={`relative z-10 flex items-center justify-center gap-1.5 px-3 py-1.5 border-2 ${brandColors.borderColor
                        .replace("border-", "border-")
                        .replace("-500", "-400/30")} rounded-full`}
                    >
                      <span className={`font-bold text-xs ${brandColors.textColor} drop-shadow-lg`}>VIEW SPECS</span>
                    </div>
                  </button>
                </div>
                {prizeImages.length > 1 ? (
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
                        <div className="relative aspect-square lg:aspect-[4/3] bg-white dark:bg-neutral-900">
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
                ) : (
                  <div className="relative aspect-square lg:aspect-[4/3] bg-white dark:bg-neutral-900">
                    <Image
                      src={prizeImages[0]?.src || "/images/grand-draw.jpg"}
                      alt={prizeImages[0]?.alt || "Prize image"}
                      fill
                      className="object-contain"
                      priority
                      sizes="(max-width: 640px) 100vw, 400px"
                    />
                  </div>
                )}
              </div>

              {prizeImages.length > 1 && (
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
                      <div
                        className="relative w-full h-full rounded-xl overflow-hidden border-2 transition-all duration-300 cursor-pointer bg-white dark:bg-neutral-900"
                        style={{
                          borderColor: getBrandGlowColor(activePrizeSlug as PrizeSlug),
                        }}
                      >
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

              {resolvedHighlights.length > 0 && renderHighlights("grid grid-cols-2 gap-2 sm:gap-4")}

              <div className="px-3 sm:px-4">
                <p className="text-xs sm:text-base text-gray-700 dark:text-neutral-300 leading-tight sm:leading-relaxed font-['Inter'] text-center sm:text-left mb-4">
                  {prizeSummary}
                </p>
              </div>
            </div>

            {/* Mobile: Countdown Timer or Draw Ended */}
            {majorDrawLoading || !currentMajorDraw ? (
              // Skeleton loader for countdown
              <div className="rounded-3xl p-6 shadow-2xl border-2 border-white/20 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-neutral-800 dark:to-neutral-900">
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
            ) : shouldShowCountdown ? (
              <div
                className={`rounded-3xl p-3 sm:p-4 shadow-2xl border-2 border-white/20 ${
                  currentMajorDraw?.status === "frozen"
                    ? "bg-gradient-to-br from-gray-900 via-gray-800 to-black"
                    : "bg-gradient-to-br from-red-600 to-red-700"
                }`}
              >
                {/* Frozen Draw Notice */}
                {currentMajorDraw?.status === "frozen" && (
                  <div className="mb-3 text-center">
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-2 sm:p-3 border border-white/20">
                      <div className="text-white font-semibold text-xs sm:text-sm uppercase tracking-wide">
                        Entry Period Closed
                      </div>
                      <div className="text-white/80 text-[10px] sm:text-xs mt-1">
                        {nextDrawName
                          ? `No new entries accepted for this draw. Entries will go to the next draw: ${nextDrawName}`
                          : "No new entries accepted for this draw. Entries will go to the next draw."}
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

              </div>
            ) : !isCompleted ? (
              <div className="rounded-3xl p-4 shadow-2xl border-2 border-white/20 bg-gradient-to-br from-gray-900 via-gray-800 to-black text-center">
                <p className="text-white text-xs sm:text-sm font-semibold uppercase tracking-[0.2em]">Draw Date</p>
                <p className="text-white text-lg sm:text-2xl font-bold mt-1">{drawDateLabel}</p>
              </div>
            ) : null}

            {/* Mobile: Draw Ended Section */}
            {isCompleted && (
              <div className="w-full bg-gradient-to-br from-gray-900 via-gray-800 to-black rounded-3xl p-6 shadow-2xl border-2 border-white/20">
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 text-center border border-white/20 space-y-4">
                  <div className="text-[24px] font-bold text-white uppercase tracking-wide">Draw Ended</div>
                  <a
                    href="https://www.facebook.com/toolsaust"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold text-[14px] transition-all duration-200 shadow-lg hover:shadow-xl w-full"
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
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 border border-red-200 dark:bg-neutral-900/90 dark:border-red-900/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Skeleton width={16} height={16} className="bg-gray-300" rounded />
                      <Skeleton height={14} width={80} className="bg-gray-300" />
                    </div>
                    <Skeleton height={14} width={40} className="bg-gray-300" />
                  </div>
                </div>
              ) : (
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 border border-red-200 dark:bg-neutral-900/90 dark:border-red-900/50">
                  <button
                    onClick={() => setShowBreakdown(!showBreakdown)}
                    className="w-full text-left hover:bg-gray-50 dark:hover:bg-neutral-800/60 rounded-lg p-2 -m-2 transition-colors"
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
                          className={`w-4 h-4 text-gray-500 dark:text-neutral-400 transition-transform duration-200 ${
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
                        <span className="text-[12px] text-gray-700 dark:text-neutral-300">From Membership:</span>
                        <span className="text-[12px] font-medium text-gray-600 dark:text-neutral-400">
                          {enhancedUserStats.membershipEntries || 0}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[12px] text-gray-700 dark:text-neutral-300">From Packages:</span>
                        <span className="text-[12px] font-medium text-gray-600 dark:text-neutral-400">
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
              <button
                onClick={() => openEntryFlow()}
                className={`promo-hero-cta-button relative w-full overflow-visible rounded-full group ${ctaColorScheme.borderGlow} membership-enter-cta-animation`}
                style={ctaColorScheme.enterNowButtonStyle ?? ctaColorScheme.badgeStyle}
              >
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/20 via-transparent to-transparent" />
                <div className={`relative z-10 flex items-center justify-center gap-2 px-6 py-3 rounded-full ${ctaColorScheme.enterNowButtonTextClass ?? (ctaColorScheme.textGradientStyle ? "" : "text-white")}`}>
                  <Zap className="w-5 h-5" style={ctaColorScheme.textGradientStyle ? undefined : { color: "white" }} />
                  <span className="font-bold text-base drop-shadow-lg" style={ctaColorScheme.textGradientStyle ?? undefined}>
                    {primaryCtaLabel}
                  </span>
                </div>
              </button>

              <div className="w-full">
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

          {/* Desktop: Grid Layout */}
          <div className="hidden lg:grid grid-cols-2 gap-6 items-start min-h-[640px]">
            <div className="col-span-2">
              {/* First Prize Image - Conditionally displayed based on selected prize */}
              <div className="flex justify-center">
                <Image
                  src={getFirstPrizeImagePath(selectedPrizeSlug ?? activeSlug ?? defaultSlug)}
                  alt="First Prize"
                  width={800}
                  height={200}
                  className="w-full max-w-4xl h-auto object-contain"
                  priority
                />
              </div>
              {renderPickYourToolset("desktop")}
            </div>
            {/* Left Column - Gallery & Countdown */}
            <div className="flex flex-col space-y-6">
              <div
                className="relative rounded-2xl border-2 overflow-hidden bg-white dark:bg-neutral-900"
                style={{
                  borderColor: getBrandBorderColor(activePrizeSlug as PrizeSlug),
                  boxShadow: `0 0 20px ${getBrandGlowColor(activePrizeSlug as PrizeSlug)}, 0 8px 32px rgba(0,0,0,0.4)`,
                }}
              >
                <div className="absolute top-4 right-4 z-20">
                  <button
                    onClick={() => setIsSpecsModalOpen(true)}
                    className="relative overflow-hidden rounded-full transition-all duration-300 hover:scale-105 group"
                    suppressHydrationWarning
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${brandColors.gradient}`} />
                    <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent" />
                    <div
                      className={`pointer-events-none absolute inset-0 rounded-full ${brandColors.shadowColor.replace(
                        "/40",
                        "/25"
                      )} blur-xl animate-ping`}
                    />
                    <div
                      className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${brandColors.shadowColor.replace(
                        "/40",
                        "/20"
                      )} blur-xl`}
                    />
                    <div
                      className={`relative z-10 flex items-center justify-center gap-2 px-4 py-2 border-2 ${brandColors.borderColor
                        .replace("border-", "border-")
                        .replace("-500", "-400/30")} rounded-full`}
                    >
                      <span
                        className={`font-bold text-xs sm:text-sm ${brandColors.textColor} drop-shadow-lg whitespace-nowrap`}
                      >
                        VIEW SPECS
                      </span>
                    </div>
                  </button>
                </div>
                {prizeImages.length > 1 ? (
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
                        <div className="relative aspect-square lg:aspect-[4/3] bg-white dark:bg-neutral-900">
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
                ) : (
                  <div className="relative aspect-square lg:aspect-[4/3] bg-white dark:bg-neutral-900">
                    <Image
                      src={prizeImages[0]?.src || "/images/grand-draw.jpg"}
                      alt={prizeImages[0]?.alt || "Prize image"}
                      fill
                      className="object-contain"
                      priority
                      sizes="(min-width: 1024px) 50vw, 100vw"
                    />
                  </div>
                )}
              </div>

              {/* The thumbnail rail now lives inside an overflow-hidden container so long galleries stay tidy. */}
              {prizeImages.length > 1 && (
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
                        <div
                          className="relative w-full h-full rounded-xl overflow-hidden border-2 transition-all duration-300 bg-white dark:bg-neutral-900 cursor-pointer"
                          style={{
                            borderColor: getBrandGlowColor(activePrizeSlug as PrizeSlug),
                          }}
                        >
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
              )}

              {/* Countdown / Draw Ended Notice */}
              {majorDrawLoading || !currentMajorDraw ? (
                // Skeleton loader for countdown (desktop)
                <div className="rounded-3xl p-6 shadow-2xl border border-white/10 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-neutral-800 dark:to-neutral-900">
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
              ) : shouldShowCountdown ? (
                <div
                  className={`rounded-3xl p-3 sm:p-4 shadow-2xl border-2 border-white/20 bg-gradient-to-br ${
                    currentMajorDraw?.status === "frozen"
                      ? "from-gray-900 via-gray-800 to-black"
                      : "from-red-600 to-red-700"
                  }`}
                >
                  {currentMajorDraw?.status === "frozen" && (
                    <div className="mb-3 text-center">
                      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-2 sm:p-3 border border-white/20">
                        <div className="text-white font-semibold text-xs sm:text-sm uppercase tracking-wide">
                          Entry Period Closed
                        </div>
                        <div className="text-white/80 text-[10px] sm:text-xs mt-1">
                          {nextDrawName
                            ? `No new entries accepted for this draw. Entries will go to the next draw: ${nextDrawName}`
                            : "No new entries accepted for this draw. Entries will go to the next draw."}
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

                </div>
              ) : !isCompleted ? (
                <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-black rounded-3xl p-6 shadow-2xl border border-white/10 text-center">
                  <p className="text-white text-sm font-semibold uppercase tracking-[0.35em]">Draw Date</p>
                  <p className="text-white text-3xl font-bold mt-2">{drawDateLabel}</p>
                </div>
              ) : (
                <div className="w-full bg-gradient-to-br from-gray-900 via-gray-800 to-black rounded-3xl p-6 shadow-2xl border border-white/10">
                  <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-center border border-white/20 space-y-4">
                    <div className="text-3xl font-bold text-white uppercase tracking-wide">Draw Ended</div>
                    <a
                      href="https://www.facebook.com/toolsaust"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl font-semibold text-base transition-all duration-200 shadow-lg hover:shadow-xl w-full"
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
                  <div
                    className={`inline-block bg-gradient-to-br ${
                      brandColors.gradient
                    } rounded-xl sm:rounded-2xl px-4 sm:px-6 py-2 sm:py-3 shadow-lg border-2 ${brandColors.borderColor
                      .replace("border-", "border-")
                      .replace("-500", "-400/30")} mb-2`}
                  >
                    <h2
                      className={`text-4xl font-bold ${brandColors.textColor} font-['Poppins'] leading-tight drop-shadow-lg`}
                    >
                      {majorDraw?.name || activePrize?.heroHeading || "Major Draw"}
                    </h2>
                  </div>
                 
                </div>

                {resolvedHighlights.length > 0 && <div>{renderHighlights("grid grid-cols-2 gap-4")}</div>}

                <div className="w-full">
                  <Image
                    src="/images/safe-checkout-stripe.png"
                    alt="Guaranteed safe & secure checkout powered by Stripe"
                    width={600}
                    height={160}
                    className="w-full h-auto"
                  />
                </div>
              </div>

              {user ? (
                userStatsLoading ? (
                  // Skeleton loader for user entries (desktop)
                  <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-5 border border-red-100 shadow-inner dark:bg-neutral-900/90 dark:border-red-900/45">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Skeleton width={16} height={16} className="bg-gray-300" rounded />
                        <Skeleton height={14} width={100} className="bg-gray-300" />
                      </div>
                      <Skeleton height={18} width={50} className="bg-gray-300" />
                    </div>
                  </div>
                ) : (
                  <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-5 border border-red-100 shadow-inner dark:bg-neutral-900/90 dark:border-red-900/45">
                    <button
                      onClick={() => setShowBreakdown(!showBreakdown)}
                      className="w-full text-left hover:bg-red-50/40 dark:hover:bg-red-950/25 rounded-lg px-3 py-2 transition-colors"
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
                            className={`w-4 h-4 text-gray-500 dark:text-neutral-400 transition-transform duration-200 ${
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
                      <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-neutral-300">
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

              <div className="flex flex-col gap-3 border-t border-gray-200 dark:border-neutral-700 pt-4">
                <button
                  onClick={() => openEntryFlow()}
                  className={`promo-hero-cta-button relative w-full overflow-visible rounded-full group ${ctaColorScheme.borderGlow} membership-enter-cta-animation`}
                  style={ctaColorScheme.enterNowButtonStyle ?? ctaColorScheme.badgeStyle}
                >
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/20 via-transparent to-transparent" />
                  <div className={`relative z-10 flex items-center justify-center gap-2 px-6 py-3 rounded-full ${ctaColorScheme.enterNowButtonTextClass ?? (ctaColorScheme.textGradientStyle ? "" : "text-white")}`}>
                    <Zap className="w-5 h-5" style={ctaColorScheme.textGradientStyle ? undefined : { color: "white" }} />
                    <span className="font-bold text-lg drop-shadow-lg" style={ctaColorScheme.textGradientStyle ?? undefined}>
                      {primaryCtaLabel}
                    </span>
                  </div>
                </button>

                <div className="w-full">
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
