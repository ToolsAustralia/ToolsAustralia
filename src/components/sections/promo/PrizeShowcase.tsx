"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Thumbs, FreeMode } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";

import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import PrizeSpecificationsModal from "@/components/modals/PrizeSpecificationsModal";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";
import { usePrizeCatalog } from "@/hooks/usePrizeCatalog";
import { useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
import { getPrizeBrandColors, getBrandGlowColor, getBrandBorderColor } from "@/utils/prize-brand-colors";
import { useSearchParams, usePathname } from "next/navigation";
import type { PrizeCatalogEntry } from "@/config/prizes";
import { SECTION_CONTAINER_CLASSES } from "@/components/ui";

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
    case "milwaukee-milwaukee":
      return "/images/brands/milwaukee.png";
    case "dewalt-sidchrome":
    case "dewalt-milwaukee":
      return "/images/brands/dewalt-black.png";
    case "makita-sidchrome":
    case "makita-milwaukee":
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
    case "dewalt-milwaukee":
      return "/images/promotion/FirstPrizeText/1stprice-dewalt.png";
    case "makita-sidchrome":
    case "makita-milwaukee":
      return "/images/promotion/FirstPrizeText/1stprice-makita.png";
    case "cash-prize":
      return "/images/promotion/FirstPrizeText/1stprice-cash.png";
    case "milwaukee-sidchrome":
    case "milwaukee-milwaukee":
    default:
      return "/images/promotion/FirstPrizeText/1stprice-milwaukee.png";
  }
};

// Helper function to get formatted multi-line label for prize cards
const getFormattedLabel = (label: string, slug?: string, isMobile?: boolean) => {
  // Check slug first for more accurate detection
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
    if (slug === "cash-prize") {
      return {
        line1: "$10,000 Tax Free Cash",
        line2: null,
        line3: null,
      };
    }
  }
  
  // Fallback to label parsing
  if (label.includes("Milwaukee Toolbox") && label.includes("Milwaukee")) {
    return {
      line1: isMobile ? "Milwaukee Toolbox" : "Milwaukee",
      line2: isMobile ? "Milwaukee Powertools" : "Milwaukee",
      line3: "$5000 Cash Prize",
    };
  }
  if (label.includes("Milwaukee Toolbox") && label.includes("DeWalt")) {
    return {
      line1: isMobile ? "Milwaukee Toolbox" : "Milwaukee",
      line2: isMobile ? "DeWalt Powertools" : "DeWalt",
      line3: "$5000 Cash Prize",
    };
  }
  if (label.includes("Milwaukee Toolbox") && label.includes("Makita")) {
    return {
      line1: isMobile ? "Milwaukee Toolbox" : "Milwaukee",
      line2: isMobile ? "Makita Powertools" : "Makita",
      line3: "$5000 Cash Prize",
    };
  }
  if (label.includes("Sidchrome") && label.includes("Milwaukee")) {
    return {
      line1: isMobile ? "Sidchrome Toolbox" : "Sidchrome",
      line2: isMobile ? "Milwaukee Powertools" : "Milwaukee",
      line3: "$5000 Cash Prize",
    };
  }
  if (label.includes("Sidchrome") && label.includes("DeWalt")) {
    return {
      line1: isMobile ? "Sidchrome Toolbox" : "Sidchrome",
      line2: isMobile ? "DeWalt Powertools" : "DeWalt",
      line3: "$5000 Cash Prize",
    };
  }
  if (label.includes("Sidchrome") && label.includes("Makita")) {
    return {
      line1: isMobile ? "Sidchrome Toolbox" : "Sidchrome",
      line2: isMobile ? "Makita Powertools" : "Makita",
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

// Helper function to get toolbox type from slug
const getToolboxTypeFromSlug = (slug: string): "sidchrome" | "milwaukee" | "cash" => {
  if (slug === "cash-prize") return "cash";
  // Check if slug is a Milwaukee toolbox combo (starts with "milwaukee-" or ends with "-milwaukee")
  // but exclude sidchrome combos (e.g., "milwaukee-sidchrome")
  if ((slug.startsWith("milwaukee-") || slug.endsWith("-milwaukee")) && !slug.includes("sidchrome")) {
    return "milwaukee";
  }
  // Check if slug includes "sidchrome" (for sidchrome toolbox combos)
  if (slug.includes("sidchrome")) return "sidchrome";
  // Default fallback (shouldn't happen with valid slugs)
  return "sidchrome";
};

// Helper to get toolset (power toolset brand) from slug. Slug format: "{toolset}-{toolbox}"
const getToolsetFromSlug = (slug: string): "milwaukee" | "dewalt" | "makita" | null => {
  if (!slug || slug === "cash-prize") return null;
  const toolset = slug.split("-")[0];
  if (toolset === "milwaukee" || toolset === "dewalt" || toolset === "makita") return toolset;
  return null;
};

// Helper function to filter prizes by toolbox type
const filterPrizesByToolboxType = (prizes: PrizeCatalogEntry[], toolboxType: "sidchrome" | "milwaukee" | "cash") => {
  if (toolboxType === "cash") {
    return prizes.filter((p) => p.slug === "cash-prize");
  }
  if (toolboxType === "sidchrome") {
    return prizes.filter((p) => p.slug.includes("sidchrome"));
  }
  if (toolboxType === "milwaukee") {
    return prizes.filter((p) => p.slug.includes("milwaukee") && !p.slug.includes("sidchrome"));
  }
  return prizes;
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
  const [mobilePrizeIndex, setMobilePrizeIndex] = useState(0);
  const [isSpecsModalOpen, setIsSpecsModalOpen] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [drawDateLabel, setDrawDateLabel] = useState("Draw date TBA");
  const [isMounted, setIsMounted] = useState(false);
  const { openEntryFlow } = useMajorDrawEntryCta();
  const { prizes, activePrize, activeSlug } = usePrizeCatalog({ slug });
  const { data: currentMajorDraw } = useCurrentMajorDraw();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const useParentContainer = pathname === "/" || pathname === "/my-account";
  
  // Toolbox type toggle state - initialize from activeSlug to prevent navigation issues
  const [toolboxType, setToolboxType] = useState<"sidchrome" | "milwaukee" | "cash">("milwaukee");
  // Remember last non-cash toolbox so we can keep showing the power toolset options even when cash is selected
  const [lastNonCashToolboxType, setLastNonCashToolboxType] = useState<"sidchrome" | "milwaukee">("milwaukee");
  
  // Update toolbox type based on current slug when it changes
  // This ensures the toggle reflects the current page's toolbox type
  // Initialize on mount and update when slug changes
  useEffect(() => {
    if (activeSlug) {
      const typeFromSlug = getToolboxTypeFromSlug(activeSlug);
      setToolboxType((currentType) => {
        // Only update if the type actually changed to prevent unnecessary re-renders
        if (currentType !== typeFromSlug) {
          localStorage.setItem("prizeToolboxType", typeFromSlug);
          return typeFromSlug;
        }
        return currentType;
      });

      // Keep a sticky "last non-cash" value so the Step 2 toolset UI stays visible even on cash
      if (typeFromSlug !== "cash") {
        setLastNonCashToolboxType(typeFromSlug);
      }
    }
  }, [activeSlug]);
  
  // Filter prizes based on selected toolbox type
  const filteredPrizes = filterPrizesByToolboxType(prizes, toolboxType);

  // Step 2 ("Power Toolset") should remain visible even when cash is selected
  const toolsetToolboxType: "sidchrome" | "milwaukee" =
    toolboxType === "cash" ? lastNonCashToolboxType : toolboxType;
  const toolsetPrizes = filterPrizesByToolboxType(prizes, toolsetToolboxType);

  // Keep one toolset card visually selected when switching toolbox (URL may lag). Same toolset, current toolbox.
  const effectiveSlugForToolsetGrid =
    toolboxType === "cash" || !activeSlug
      ? activeSlug
      : toolsetPrizes.some((p) => p.slug === activeSlug)
        ? activeSlug
        : (() => {
            const toolset = getToolsetFromSlug(activeSlug);
            if (!toolset) return activeSlug;
            const derived = `${toolset}-${toolsetToolboxType}`;
            return toolsetPrizes.some((p) => p.slug === derived) ? derived : activeSlug;
          })();

  // Find the index of the active prize in the filtered list for mobile navigation
  const activePrizeIndex = filteredPrizes.findIndex((p) => p.slug === activeSlug);
  
  // Update mobile prize index when activeSlug changes
  useEffect(() => {
    if (activePrizeIndex >= 0) {
      setMobilePrizeIndex(activePrizeIndex);
    }
  }, [activeSlug, activePrizeIndex]);
  
  // On mobile, prevent scroll when slug changes (navigation)
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth >= 640) return;
    
    // Save scroll position when slug changes
    const scrollY = window.scrollY;
    
    // Prevent scroll immediately
    const preventScroll = () => {
      if (Math.abs(window.scrollY - scrollY) > 5) {
        window.scrollTo({ top: scrollY, behavior: 'auto' });
      }
    };
    
    // Check and restore scroll position multiple times
    const timeouts = [
      setTimeout(preventScroll, 0),
      setTimeout(preventScroll, 10),
      setTimeout(preventScroll, 50),
      setTimeout(preventScroll, 100),
    ];
    
    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [activeSlug]);
  
  // Navigation handlers for mobile prize selector
  const handlePreviousPrize = () => {
    if (filteredPrizes.length > 0) {
      const newIndex = mobilePrizeIndex > 0 ? mobilePrizeIndex - 1 : filteredPrizes.length - 1;
      setMobilePrizeIndex(newIndex);
      handleSelectPrize(filteredPrizes[newIndex].slug);
    }
  };
  
  const handleNextPrize = () => {
    if (filteredPrizes.length > 0) {
      const newIndex = mobilePrizeIndex < filteredPrizes.length - 1 ? mobilePrizeIndex + 1 : 0;
      setMobilePrizeIndex(newIndex);
      handleSelectPrize(filteredPrizes[newIndex].slug);
    }
  };
  
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

    // On mobile, aggressively prevent scroll behavior
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      // Save current scroll position
      const scrollY = window.scrollY;
      
      // Disable smooth scrolling globally
      const originalHtmlScrollBehavior = document.documentElement.style.scrollBehavior;
      const originalBodyScrollBehavior = document.body.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = 'auto';
      document.body.style.scrollBehavior = 'auto';
      
      // Navigate without scroll
      router.push(newUrl, { scroll: false });
      
      // Restore scroll position immediately and prevent any scroll changes
      const restoreScroll = () => {
        window.scrollTo({ top: scrollY, behavior: 'auto' });
        // Prevent scroll for a longer period to ensure navigation completes
        setTimeout(() => {
          document.documentElement.style.scrollBehavior = originalHtmlScrollBehavior;
          document.body.style.scrollBehavior = originalBodyScrollBehavior;
        }, 300);
      };
      
      // Use multiple methods to ensure scroll position is maintained
      requestAnimationFrame(restoreScroll);
      setTimeout(restoreScroll, 0);
      setTimeout(restoreScroll, 50);
    } else {
      // Desktop: normal navigation
      router.push(newUrl, { scroll: false });
    }
  };
  
  const handleToolboxTypeChange = (type: "sidchrome" | "milwaukee" | "cash") => {
    // Only navigate if the type is actually changing
    if (toolboxType === type) return;

    setToolboxType(type);
    localStorage.setItem("prizeToolboxType", type);

    if (type === "cash") {
      handleSelectPrize("cash-prize");
      return;
    }

    // Remember last non-cash toolbox type so Step 2 stays visible if cash is selected later
    setLastNonCashToolboxType(type);

    // Retain toolset selection when switching toolbox: e.g. Milwaukee + DeWalt -> Sidchrome toolbox -> Sidchrome + DeWalt
    const currentToolset = getToolsetFromSlug(activeSlug ?? "");
    if (currentToolset) {
      const newSlug = `${currentToolset}-${type}` as const;
      handleSelectPrize(newSlug);
    }
  };

  if (!activePrize) {
    return null;
  }

  // Get brand colors for active prize to match View Specs button and prize header
  const brandColors = getPrizeBrandColors(activeSlug || "milwaukee-milwaukee");
  const highlights = activePrize.highlights ?? [];

  return (
    <section 
      ref={prizeRef} 
      className=" pb-2 sm:pb-12 relative"
      style={{ 
        scrollMarginTop: 0,
        // On mobile, prevent scroll snapping during navigation (gated by isMounted to avoid hydration mismatch)
        ...(isMounted && typeof window !== 'undefined' && window.innerWidth < 640 && isNavigating ? {
          scrollSnapAlign: 'none',
          scrollSnapStop: 'normal',
        } : {}),
      }}
    >
      <div className={useParentContainer ? "relative z-0 w-full" : `${SECTION_CONTAINER_CLASSES} relative z-0`}>
        <div className="text-center mb-6 sm:mb-12">
          {/* First Prize Image - Conditionally displayed based on selected prize */}
          <div className="flex justify-center">
            <Image
              src={getFirstPrizeImagePath(activeSlug)}
              alt="First Prize"
              width={800}
              height={200}
              // add scale-150 h-[375px] if new 1stprize image is added
              className="w-full max-w-4xl h-auto object-contain h-auto "
              priority
            />
          </div>
          {/* Prize description section - hidden for now */}
          <div className="hidden">
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
          </div>

          {prizes.length > 1 && (
            <div className="mt-4 sm:mt-6">
              <p className="font-agency font-[950] uppercase text-black mb-2 sm:mb-3 text-center text-md sm:text-[32px] lg:text-agency-title leading-[1.08]">
               Pick your <span style={{ color: "#EE0000" }}>toolbox</span>
              </p>
              
              {/* Toolbox Type Toggle - Sidchrome and Milwaukee only */}
              <div className="flex justify-center gap-3 sm:gap-4 mb-4">
                <button
                  onClick={() => handleToolboxTypeChange("sidchrome")}
                  className={`font-acumin font-[950] px-4 sm:px-10 py-2 sm:py-4 rounded-xl sm:rounded-2xl text-[14px] sm:text-xl transition-all duration-200 border-2 ${
                    toolboxType === "sidchrome"
                      ? "bg-gradient-to-br from-red-600 via-red-500 to-red-700 text-white border-red-500 shadow-lg shadow-red-500/40"
                      : "bg-white text-gray-700 border-gray-300 hover:border-red-400 hover:text-red-600"
                  }`}
                  suppressHydrationWarning
                >
                  Sidchrome Toolbox
                </button>
                <button
                  onClick={() => handleToolboxTypeChange("milwaukee")}
                  className={`font-acumin font-[950] px-4 sm:px-10 py-2 sm:py-4 rounded-xl sm:rounded-2xl text-[14px] sm:text-xl transition-all duration-200 border-2 ${
                    toolboxType === "milwaukee"
                      ? "bg-gradient-to-br from-red-600 via-red-500 to-red-700 text-white border-red-500 shadow-lg shadow-red-500/40"
                      : "bg-white text-gray-700 border-gray-300 hover:border-red-400 hover:text-red-600"
                  }`}
                  suppressHydrationWarning
                >
                  Milwaukee Toolbox
                </button>
              </div>
              
              <p className="font-agency font-[950] uppercase text-black mb-2 sm:mb-3 text-center text-md sm:text-[32px] lg:text-agency-title leading-[1.08]">
               Pick your <span style={{ color: "#EE0000" }}>Power Toolset</span>
              </p>

              {/* Prize selection - 3-card grid for the selected toolbox type (stay visible even when cash is selected) */}
              <div className={`grid ${toolsetPrizes.length === 3 ? "grid-cols-3" : "grid-cols-2"} gap-2 sm:gap-4 max-w-5xl mx-auto overflow-visible`}>
                    {toolsetPrizes.map((prizeOption) => {
                      const isActive = prizeOption.slug === effectiveSlugForToolsetGrid;
                      const brandColors = getPrizeBrandColors(prizeOption.slug);
                      const brandLogoPath = getBrandLogoPath(prizeOption.slug);
                      const formattedLabel = getFormattedLabel(prizeOption.label, prizeOption.slug, true);
                      return (
                        <button
                          key={prizeOption.slug}
                          onClick={() => handleSelectPrize(prizeOption.slug)}
                          tabIndex={-1}
                          style={!isActive ? {
                            outline: "none",
                            boxShadow: `0 0 15px ${getBrandGlowColor(prizeOption.slug)}`,
                            borderColor: getBrandBorderColor(prizeOption.slug),
                          } : { 
                            outline: "none", 
                            boxShadow: "none",
                            borderColor: getBrandBorderColor(prizeOption.slug),
                          }}
                          className={`relative p-3 sm:p-5 rounded-2xl border-2 transition-all duration-300 text-center cursor-pointer overflow-visible min-h-[90px] sm:min-h-[110px] group ${
                            isActive
                              ? `bg-gradient-to-br ${brandColors.gradient} ${brandColors.textColor} shadow-xl ${brandColors.shadowColor} scale-[1.02] ring-2 ring-offset-2 ring-offset-white ring-opacity-50`
                              : `bg-white text-gray-700 border-opacity-100 ${brandColors.hoverBorderColor} hover:bg-gradient-to-br hover:from-gray-50 hover:to-white hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]`
                          }`}
                        >
                          {/* Brand logo watermark - only shown when active */}
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

                          {/* Hover glow effect for inactive cards */}
                          {!isActive && (
                            <div
                              className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${brandColors.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300 pointer-events-none`}
                            />
                          )}

                          {/* Active shimmer effect */}
                          {isActive && (
                            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                          )}

                          {/* Active checkmark badge */}
                          {isActive && (
                            <div className="absolute -top-2.5 -right-2.5 w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-xl z-10 ring-2 ring-white/50 animate-in fade-in zoom-in duration-200">
                              <Check className={`w-4 h-4 ${brandColors.checkmarkColor}`} />
                            </div>
                          )}

                          {/* Card content - line2 & line3 only (line1/toolbox removed - already in Pick Your Toolset) */}
                          <div className="relative z-10 w-full overflow-visible">
                            <div
                              className={`font-acumin font-[950] text-[14px] sm:text-lg leading-[1.08] transition-colors duration-200 break-words text-center ${
                                isActive ? "text-white" : "text-gray-900 group-hover:text-gray-950"
                              }`}
                            >
                              {formattedLabel.line2 && <div className="block">{formattedLabel.line2}</div>}
                              {formattedLabel.line3 && <div className="block">{formattedLabel.line3}</div>}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

              {/* Cash option is a separate prize path (no toolbox/toolset) */}
              <div className="mt-4 max-w-5xl mx-auto">
                <div className="relative flex items-center justify-center my-6 sm:my-8">
                  <div className="h-px w-full bg-gray-300" />
                  <div className="absolute px-3 py-1 rounded-full bg-white border border-gray-200 text-[10px] sm:text-xs font-bold tracking-[0.22em] text-gray-600">
                    OR
                  </div>
                </div>

                <button
                  onClick={() => {
                    handleToolboxTypeChange("cash");
                  }}
                  className={`w-full py-2.5 sm:py-4 rounded-xl sm:rounded-2xl font-acumin font-[950] text-sm sm:text-2xl transition-all duration-200 border-2 relative overflow-hidden flex items-center justify-center ${
                    toolboxType === "cash"
                      ? "border-green-500 shadow-lg shadow-green-500/40 bg-cover bg-center"
                      : "bg-white text-gray-700 border-gray-300 hover:border-green-400 hover:text-green-600 hover:shadow-lg"
                  }`}
                  style={toolboxType === "cash" ? { backgroundImage: `url('/images/majordraws/cash-prize/cash-prize-10000.png')` } : undefined}
                  suppressHydrationWarning
                >
                  {toolboxType === "cash" && (
                    <div className="absolute inset-0 z-0 bg-gradient-to-br from-green-600/85 via-green-600/75 to-green-700/85" />
                  )}
                  <span className={`relative z-10 text-md sm:text-2xl ${toolboxType === "cash" ? "text-white drop-shadow-lg" : ""}`}>$10,000 cash</span>
                </button>

                
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-start">
          <div className="relative order-1 space-y-3 sm:space-y-4">
            <div 
              className="relative rounded-2xl border-2 backdrop-blur-sm overflow-hidden"
              style={{
                borderColor: getBrandBorderColor(activeSlug || "milwaukee-milwaukee"),
                boxShadow: `0 0 20px ${getBrandGlowColor(activeSlug || "milwaukee-milwaukee")}, 0 8px 32px rgba(0,0,0,0.4)`,
              }}
            >
              {activePrize.gallery.length > 1 ? (
                <Swiper
                  modules={[Navigation, Pagination, Thumbs]}
                  thumbs={{ swiper: thumbsSwiper && !thumbsSwiper.destroyed ? thumbsSwiper : null }}
                  navigation
                  pagination={{ clickable: true }}
                  className="main-swiper"
                  data-brand-slug={activeSlug}
                  spaceBetween={0}
                  slidesPerView={1}
                >
                  {activePrize.gallery.map((image, index) => (
                    <SwiperSlide key={`${image.src}-${index}`}>
                      <div className="relative aspect-square lg:aspect-[4/3]">
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
                <div className="relative aspect-square lg:aspect-[4/3]">
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

              {/* <div className="absolute top-4 right-4 z-20">
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
                    <span className={`font-acumin font-[950] text-xs sm:text-sm ${brandColors.textColor} drop-shadow-lg whitespace-nowrap`}>
                      VIEW SPECS
                    </span>
                  </div>
                </button>
              </div> */}
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
                data-brand-slug={activeSlug}
              >
                {activePrize.gallery.map((image, index) => (
                  <SwiperSlide key={`thumb-${image.src}-${index}`} className="!w-16 !h-16 sm:!w-24 sm:!h-24">
                    <div 
                      className="relative w-full h-full rounded-xl overflow-hidden border-2 transition-all duration-300 cursor-pointer"
                      style={{
                        borderColor: getBrandGlowColor(activeSlug || "milwaukee-milwaukee"),
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

          </div>

          <div className="space-y-3 sm:space-y-4 order-2 lg:row-span-2">
            <div className="grid grid-cols-2 gap-1 sm:gap-4">
              {highlights.map((highlight, index) => {
                const Icon = resolveHighlightIcon(highlight.icon);
                return (
                  <div
                    key={`${highlight.title}-${index}`}
                    className="relative flex items-center gap-2 sm:gap-3 p-2 sm:p-3 min-h-[40px] sm:min-h-[60px] bg-gradient-to-br from-gray-900 via-gray-800 to-black backdrop-blur-sm rounded-xl sm:rounded-2xl border border-gray-700 shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent rounded-xl sm:rounded-2xl pointer-events-none"></div>
                    <div className={`relative w-7 h-7 sm:w-12 sm:h-12 flex-shrink-0 bg-gradient-to-br ${brandColors.gradient.replace('from-', 'from-').replace('via-', 'via-').replace('to-', 'to-')}/80 backdrop-blur-sm rounded-lg sm:rounded-xl flex items-center justify-center border-2 ${brandColors.borderColor.replace('border-', 'border-').replace('-500', '-400/30')} shadow-lg z-10`}>
                      <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent rounded-lg sm:rounded-xl pointer-events-none"></div>
                      <Icon className={`w-3.5 h-3.5 sm:w-5 sm:h-5 ${brandColors.textColor} relative z-10`} />
                    </div>
                    <div className="flex-1 relative z-10 min-w-0 flex flex-col justify-center">
                      <h3 className="text-[11px] sm:text-lg font-bold text-white font-['Poppins'] mb-0 sm:mb-1 drop-shadow-md leading-tight line-clamp-2 sm:line-clamp-none">
                        {highlight.title}
                      </h3>
                      <p className="text-[10px] sm:text-base text-gray-300 font-['Inter'] leading-tight sm:leading-relaxed hidden lg:block">
                        {highlight.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setIsSpecsModalOpen(true)}
              suppressHydrationWarning
              className="w-full relative overflow-hidden rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-gray-700 shadow-[0_8px_32px_rgba(0,0,0,0.4)] bg-gradient-to-br from-gray-900 via-gray-800 to-black backdrop-blur-sm transition-all duration-300 hover:border-gray-600 hover:shadow-[0_8px_32px_rgba(0,0,0,0.5)] group text-left"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent rounded-xl sm:rounded-2xl pointer-events-none group-hover:from-white/10"></div>
              <div className="relative z-10 flex items-center justify-between gap-3">
                <span className="text-sm sm:text-lg font-bold text-white font-['Poppins'] drop-shadow-md">
                  Prize Details
                </span>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white/80 group-hover:text-white flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>

            <button
              onClick={handleEnterNow}
              suppressHydrationWarning
              className="promo-hero-cta-button w-full rounded-full hidden lg:block px-6 py-3 sm:px-8 sm:py-4"
              style={{ background: "linear-gradient(90deg, #dc2626 0%, #b91c1c 100%)" }}
            >
              <div className="flex items-center justify-center gap-3">
                <span className="font-agency font-bold text-base sm:text-lg text-white drop-shadow-lg">ENTER NOW</span>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </button>

            <div className="w-full hidden lg:block">
              <Image
                src="/images/safe-checkout-stripe.png"
                alt="Guaranteed safe & secure checkout powered by Stripe"
                width={600}
                height={160}
                className="w-full h-auto"
              />
            </div>
          </div>

          <div className="relative order-3 space-y-3 sm:space-y-4">
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

               
              </div>
            ) : (
              <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-black rounded-3xl p-4 shadow-2xl border-2 border-white/20 text-center">
                <p className="font-agency text-white text-xs sm:text-sm font-semibold uppercase tracking-[0.2em]">Draw Date</p>
                <p className="font-agency text-white text-lg sm:text-2xl font-bold mt-1">{drawDateLabel}</p>
                
              </div>
            )}

            <button
              onClick={handleEnterNow}
              suppressHydrationWarning
              className="promo-hero-cta-button w-full rounded-full lg:hidden px-6 py-3 sm:px-8 sm:py-4"
              style={{ background: "linear-gradient(90deg, #dc2626 0%, #b91c1c 100%)" }}
            >
              <div className="flex items-center justify-center gap-3">
                <span className="font-agency font-bold text-base sm:text-lg text-white drop-shadow-lg">ENTER NOW</span>
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
