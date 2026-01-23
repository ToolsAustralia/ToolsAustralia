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
import { useSearchParams } from "next/navigation";
import type { PrizeCatalogEntry } from "@/config/prizes";

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
  
  // Toolbox type toggle state - initialize from activeSlug to prevent navigation issues
  const [toolboxType, setToolboxType] = useState<"sidchrome" | "milwaukee" | "cash">("milwaukee");
  
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
    }
  }, [activeSlug]);
  
  // Filter prizes based on selected toolbox type
  const filteredPrizes = filterPrizesByToolboxType(prizes, toolboxType);
  
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
    
    // Get default slug for the selected toolbox type
    const defaultSlug = type === "sidchrome" ? "milwaukee-sidchrome" : "milwaukee-milwaukee";
    // Always navigate to default when toolbox type changes (user clicked the toggle button)
    handleSelectPrize(defaultSlug);
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
      className=" pb-8 sm:pb-12 relative"
      style={{ 
        scrollMarginTop: 0,
        // On mobile, prevent scroll snapping during navigation
        ...(typeof window !== 'undefined' && window.innerWidth < 640 && isNavigating ? {
          scrollSnapAlign: 'none',
          scrollSnapStop: 'normal',
        } : {}),
      }}
    >
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
              <p className="text-lg sm:text-xl font-bold text-black font-['Poppins'] mb-2 sm:mb-3 text-center">
                Pick Your Toolset
              </p>
              
              {/* Toolbox Type Toggle */}
              <div className="flex justify-center gap-2 sm:gap-3 mb-4 sm:mb-6">
                <button
                  onClick={() => handleToolboxTypeChange("sidchrome")}
                  className={`px-4 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl font-semibold text-xs sm:text-sm transition-all duration-200 border-2 ${
                    toolboxType === "sidchrome"
                      ? "bg-gradient-to-br from-red-600 via-red-500 to-red-700 text-white border-red-500 shadow-lg shadow-red-500/40"
                      : "bg-white text-gray-700 border-gray-300 hover:border-red-400 hover:text-red-600"
                  }`}
                >
                  Sidchrome Toolbox
                </button>
                <button
                  onClick={() => handleToolboxTypeChange("milwaukee")}
                  className={`px-4 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl font-semibold text-xs sm:text-sm transition-all duration-200 border-2 ${
                    toolboxType === "milwaukee"
                      ? "bg-gradient-to-br from-red-600 via-red-500 to-red-700 text-white border-red-500 shadow-lg shadow-red-500/40"
                      : "bg-white text-gray-700 border-gray-300 hover:border-red-400 hover:text-red-600"
                  }`}
                >
                  Milwaukee Toolbox
                </button>
                <button
                  onClick={() => handleToolboxTypeChange("cash")}
                  className={`px-4 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl font-semibold text-xs sm:text-sm transition-all duration-200 border-2 ${
                    toolboxType === "cash"
                      ? "bg-gradient-to-br from-green-500 via-green-600 to-green-700 text-white border-green-500 shadow-lg shadow-green-500/40"
                      : "bg-white text-gray-700 border-gray-300 hover:border-green-400 hover:text-green-600"
                  }`}
                >
                  $10,000 Cash
                </button>
              </div>
              
              {/* Only show prize selector when not on cash option (cash has only one option) */}
              {toolboxType !== "cash" && (
                <>
                  {/* Mobile: Single horizontal box with navigation arrows */}
                  <div className="sm:hidden relative max-w-md mx-auto overflow-visible">
                    {filteredPrizes.length > 0 && filteredPrizes[mobilePrizeIndex] && (() => {
                      const prizeOption = filteredPrizes[mobilePrizeIndex];
                      const isActive = prizeOption.slug === activeSlug;
                      const brandColors = getPrizeBrandColors(prizeOption.slug);
                      const brandLogoPath = getBrandLogoPath(prizeOption.slug);
                      const formattedLabel = getFormattedLabel(prizeOption.label, prizeOption.slug, true);
                      return (
                        <button
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
                          className={`relative w-full p-5 rounded-2xl border-2 transition-all duration-300 text-center cursor-pointer overflow-visible min-h-[110px] group ${
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

                          {/* Card content - formatted multi-line text */}
                          <div className="relative z-10 w-full overflow-visible">
                            <div
                              className={`text-base font-bold font-['Poppins'] leading-tight transition-colors duration-200 break-words text-center ${
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
                    })()}
                    
                    {/* Navigation arrows for mobile - simple buttons, not swiper navigation */}
                    {filteredPrizes.length > 1 && (
                      <>
                        <button
                          onClick={handlePreviousPrize}
                          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-white/90 hover:bg-white rounded-full shadow-lg flex items-center justify-center border-2 border-gray-300 hover:border-gray-400 transition-all duration-200"
                          aria-label="Previous prize"
                        >
                          <ChevronLeft className="w-6 h-6 text-gray-700" />
                        </button>
                        <button
                          onClick={handleNextPrize}
                          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-white/90 hover:bg-white rounded-full shadow-lg flex items-center justify-center border-2 border-gray-300 hover:border-gray-400 transition-all duration-200"
                          aria-label="Next prize"
                        >
                          <ChevronRight className="w-6 h-6 text-gray-700" />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Desktop: Grid layout */}
                  <div className={`hidden sm:grid ${filteredPrizes.length === 3 ? "grid-cols-3" : "grid-cols-2"} gap-4 max-w-5xl mx-auto overflow-visible`}>
                    {filteredPrizes.map((prizeOption) => {
                      const isActive = prizeOption.slug === activeSlug;
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
                          className={`relative p-5 rounded-2xl border-2 transition-all duration-300 text-center cursor-pointer overflow-visible min-h-[110px] group ${
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

                          {/* Card content - formatted multi-line text */}
                          <div className="relative z-10 w-full overflow-visible">
                            <div
                              className={`text-base font-bold font-['Poppins'] leading-tight transition-colors duration-200 break-words text-center ${
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
                </>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-12 items-start">
          <div className="relative order-1 lg:order-1 space-y-3 sm:space-y-4">
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
