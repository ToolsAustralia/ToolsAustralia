"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
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
import { useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
import { getPrizeBrandColors, getBrandGlowColor, getBrandBorderColor } from "@/utils/prize-brand-colors";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { useSearchParams, usePathname } from "next/navigation";
import type { PrizeCatalogEntry, PrizeSlug } from "@/config/prizes";
import { SECTION_CONTAINER_CLASSES } from "@/components/ui";
import {
  ToolboxSelector,
  PowerToolsetCarousel,
  StaticToolsetHighlight,
  OtherToolsetsCarousel,
  getToolboxTypeFromSlug,
  filterPrizesByToolboxType,
} from "./prize-selection";
import { getPrizesForToolsetSlug, isToolsetLandingSlug } from "@/config/promo-landing-slugs";
import { isValidPromoSlug } from "@/utils/promo-analytics/validate-promo-slug";
import { usePromoThemeStore } from "@/stores/usePromoThemeStore";
import { getPrizeBySlug, listPrizes } from "@/config/prizes";

import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/thumbs";
import "swiper/css/free-mode";

const FROM_PROMO_SLUG_KEY = "tools-aus:from-promo-slug";

interface PrizeShowcaseProps {
  slug?: string;
  /** Toolset landing page mode - both toolboxes, fixed toolset, no navigation */
  toolsetMode?: boolean;
  /** Toolset slug (ryobi, milwaukee, dewalt, makita) when toolsetMode */
  toolsetSlug?: string;
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

// Helper function to get brand logo path based on prize slug (reserved for future use)
const _getBrandLogoPath = (slug: string): string | null => {
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

// Helper function to get formatted multi-line label for prize cards (reserved for future use)
const _getFormattedLabel = (label: string, slug?: string, isMobile?: boolean) => {
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

export default function PrizeShowcase({
  slug: slugProp,
  toolsetMode = false,
  toolsetSlug,
}: PrizeShowcaseProps = {}) {
  const prizeRef = useScrollAnimation();
  const theme = usePromoTheme();
  const setStoreSlug = usePromoThemeStore((s) => s.setSlug);
  const [thumbsSwiper, setThumbsSwiper] = useState<SwiperType | null>(null);
  const [mobilePrizeIndex, setMobilePrizeIndex] = useState(0);
  const [isSpecsModalOpen, setIsSpecsModalOpen] = useState(false);
  const [isNavigating, _setIsNavigating] = useState(false);
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [drawDateLabel, setDrawDateLabel] = useState("Draw date TBA");
  const [isMounted, setIsMounted] = useState(false);
  const { openEntryFlow } = useMajorDrawEntryCta();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const useParentContainer = pathname === "/" || pathname === "/my-account";
  const isPromotionsPage = pathname?.startsWith("/promotions") ?? false;

  // Slug from URL for evergreen - ensures cross-visit referrer matches tracked page
  const pathnameSlug = (() => {
    if (!pathname?.startsWith("/promotions/")) return null;
    const match = pathname.match(/^\/promotions\/([^/?#]+)/);
    const slug = match?.[1]?.toLowerCase().trim();
    return slug && isValidPromoSlug(slug) ? slug : null;
  })();

  const isEvergreenPromoPage = isPromotionsPage && pathnameSlug && !isToolsetLandingSlug(pathnameSlug);

  // Toolset mode: prize slugs for this toolset (Sidchrome first, Milwaukee second)
  const toolsetPrizeSlugs =
    toolsetMode && toolsetSlug && isToolsetLandingSlug(toolsetSlug)
      ? getPrizesForToolsetSlug(toolsetSlug)
      : null;
  const toolsetPrizesCatalog: PrizeCatalogEntry[] = toolsetPrizeSlugs
    ? (toolsetPrizeSlugs
        .map((s) => getPrizeBySlug(s))
        .filter((p): p is PrizeCatalogEntry => p != null) ?? [])
    : [];

  // Toolset mode: effective slug from toolbox selection (local state, no URL change)
  const [toolsetEffectiveSlug, setToolsetEffectiveSlug] = useState<string | null>(null);
  // When NOT on promotions page (e.g. home, my-account): local slug, no navigation
  const [localEffectiveSlug, setLocalEffectiveSlug] = useState<string | null>(null);
  // Toolbox type toggle state - initialize from activeSlug to prevent navigation issues
  const [toolboxType, setToolboxType] = useState<"sidchrome" | "milwaukee" | "cash">("milwaukee");
  // Remember last non-cash toolbox so we can keep showing the power toolset options even when cash is selected
  const [lastNonCashToolboxType, setLastNonCashToolboxType] = useState<"sidchrome" | "milwaukee">("milwaukee");

  const effectiveSlugForCatalog = (() => {
    if (toolsetMode) return toolsetEffectiveSlug ?? toolsetPrizeSlugs?.[0] ?? slugProp;
    if (isPromotionsPage) return slugProp;
    if (localEffectiveSlug) return localEffectiveSlug;
    const tt: "sidchrome" | "milwaukee" = toolboxType === "cash" ? lastNonCashToolboxType : toolboxType;
    return filterPrizesByToolboxType(listPrizes(), tt)[0]?.slug ?? slugProp;
  })();

  const { prizes, activePrize, activeSlug } = usePrizeCatalog({ slug: effectiveSlugForCatalog ?? undefined });
  const { data: currentMajorDraw } = useCurrentMajorDraw();

  // Toolset mode: init effective slug from default (Sidchrome)
  useEffect(() => {
    if (toolsetMode && toolsetPrizeSlugs) {
      const defaultSlug = toolsetPrizeSlugs[0];
      setToolsetEffectiveSlug(defaultSlug);
      setToolboxType("sidchrome");
      setLastNonCashToolboxType("sidchrome");
    }
  }, [toolsetMode, toolsetSlug, toolsetPrizeSlugs]); // Added toolsetPrizeSlugs per lint - init runs when slug list changes

  // Update toolbox type based on current slug when it changes (evergreen mode only)
  useEffect(() => {
    if (!toolsetMode && activeSlug) {
      const typeFromSlug = getToolboxTypeFromSlug(activeSlug);
      setToolboxType((currentType) => {
        if (currentType !== typeFromSlug) {
          localStorage.setItem("prizeToolboxType", typeFromSlug);
          return typeFromSlug;
        }
        return currentType;
      });
      if (typeFromSlug !== "cash") {
        setLastNonCashToolboxType(typeFromSlug);
      }
    }
  }, [activeSlug, toolsetMode]);

  // Filter prizes based on selected toolbox type
  const filteredPrizes = toolsetMode
    ? toolsetPrizesCatalog
    : filterPrizesByToolboxType(prizes, toolboxType);

  // Step 2 ("Power Toolset") should remain visible even when cash is selected
  const toolsetToolboxType: "sidchrome" | "milwaukee" =
    toolboxType === "cash" ? lastNonCashToolboxType : toolboxType;
  const toolsetPrizes = toolsetMode
    ? toolsetPrizesCatalog
    : filterPrizesByToolboxType(prizes, toolsetToolboxType);

  // Find the index of the active prize in the filtered list for mobile navigation
  const activePrizeIndex = filteredPrizes.findIndex((p) => p.slug === activeSlug);
  
  // Update mobile prize index when activeSlug changes
  useEffect(() => {
    if (activePrizeIndex >= 0) {
      setMobilePrizeIndex(activePrizeIndex);
    }
  }, [activeSlug, activePrizeIndex]);
  
  // On mobile, prevent scroll when slug changes (navigation) — evergreen pages only.
  // Toolset landing pages should always scroll to top so users see the hero.
  useEffect(() => {
    if (toolsetMode || typeof window === 'undefined' || window.innerWidth >= 640) return;
    
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
  }, [activeSlug, toolsetMode]);
  
  // Navigation handlers for mobile prize selector (reserved for future mobile nav UI)
  const _handlePreviousPrize = () => {
    if (filteredPrizes.length > 0) {
      const newIndex = mobilePrizeIndex > 0 ? mobilePrizeIndex - 1 : filteredPrizes.length - 1;
      setMobilePrizeIndex(newIndex);
      handleSelectPrize(filteredPrizes[newIndex].slug);
    }
  };
  
  const _handleNextPrize = () => {
    if (filteredPrizes.length > 0) {
      const newIndex = mobilePrizeIndex < filteredPrizes.length - 1 ? mobilePrizeIndex + 1 : 0;
      setMobilePrizeIndex(newIndex);
      handleSelectPrize(filteredPrizes[newIndex].slug);
    }
  };
  
  // Check if draw is completed or queued (gap state)
  const isCompleted = currentMajorDraw?.status === "completed";
  const isQueued = currentMajorDraw?.status === "queued";
  const _isGapState = isCompleted || isQueued;
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

    // When NOT on promotions page: update prizes in place, no navigation
    if (!isPromotionsPage && !toolsetMode) {
      setLocalEffectiveSlug(nextSlug);
      setStoreSlug(nextSlug);
      return;
    }

    // On promotions page: navigate to keep URL in sync
    const affiliateCode = searchParams.get("aff");
    const newUrl = affiliateCode ? `/promotions/${nextSlug}?aff=${affiliateCode}` : `/promotions/${nextSlug}`;

    // Cross-visit tracking: store current slug as referrer before navigating so destination records it
    const referrer = isEvergreenPromoPage && pathnameSlug
      ? pathnameSlug
      : toolsetMode && toolsetSlug
        ? toolsetSlug
        : null;
    if (referrer && isValidPromoSlug(nextSlug) && referrer !== nextSlug) {
      try {
        sessionStorage.setItem(FROM_PROMO_SLUG_KEY, referrer);
      } catch {
        // Ignore storage errors
      }
    }

    // Toolset landing pages: always scroll to top so user sees the hero
    // Evergreen pages: preserve scroll when switching prizes (PowerToolsetCarousel)
    if (toolsetMode) {
      router.push(newUrl, { scroll: true });
      return;
    }

    // Evergreen only: on mobile, preserve scroll position when switching between prize slugs
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      const scrollY = window.scrollY;
      const originalHtmlScrollBehavior = document.documentElement.style.scrollBehavior;
      const originalBodyScrollBehavior = document.body.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = 'auto';
      document.body.style.scrollBehavior = 'auto';
      router.push(newUrl, { scroll: false });
      const restoreScroll = () => {
        window.scrollTo({ top: scrollY, behavior: 'auto' });
        setTimeout(() => {
          document.documentElement.style.scrollBehavior = originalHtmlScrollBehavior;
          document.body.style.scrollBehavior = originalBodyScrollBehavior;
        }, 300);
      };
      requestAnimationFrame(restoreScroll);
      setTimeout(restoreScroll, 0);
      setTimeout(restoreScroll, 50);
    } else {
      router.push(newUrl, { scroll: false });
    }
  };
  
  const handleToolboxTypeChange = (type: "sidchrome" | "milwaukee" | "cash") => {
    if (toolboxType === type) return;

    setToolboxType(type);
    localStorage.setItem("prizeToolboxType", type);

    if (type === "cash") {
      if (toolsetMode) {
        setToolsetEffectiveSlug("cash-prize");
        setStoreSlug("cash-prize");
      } else {
        handleSelectPrize("cash-prize");
      }
      return;
    }

    setLastNonCashToolboxType(type);

    if (toolsetMode && toolsetPrizeSlugs) {
      const newSlug = type === "sidchrome" ? toolsetPrizeSlugs[0] : toolsetPrizeSlugs[1];
      setToolsetEffectiveSlug(newSlug);
      setStoreSlug(newSlug);
    } else {
      // Evergreen: do not navigate; user must click toolset to select
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
      className="pb-2 sm:pb-12 relative "
      style={{ 
        scrollMarginTop: 0,
        // On mobile, prevent scroll snapping during navigation (gated by isMounted to avoid hydration mismatch)
        ...(isMounted && typeof window !== 'undefined' && window.innerWidth < 640 && isNavigating ? {
          scrollSnapAlign: 'none',
          scrollSnapStop: 'normal',
        } : {}),
      }}
    >
      {/* Crack texture overlay - visible only in dark mode */}
      <div
        className="absolute inset-0 z-0 pointer-events-none opacity-0 dark:opacity-[0.3] transition-opacity duration-300"
        aria-hidden="true"
        style={{
          backgroundImage: "url('/images/background/promo/FX/crack.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className={useParentContainer ? "relative z-10 w-full" : `${SECTION_CONTAINER_CLASSES} relative z-10`}>
        <div className="text-center mb-6 sm:mb-12">
          {/* First Prize Image - Conditionally displayed based on selected prize; smaller on desktop */}
          <div className="flex justify-center">
            <Image
              src={getFirstPrizeImagePath(activeSlug)}
              alt="First Prize"
              width={800}
              height={200}
              className="w-full max-w-4xl lg:max-w-2xl h-auto object-contain"
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
              <p className="hidden sm:block text-sm sm:text-lg text-gray-700 dark:text-neutral-300 font-['Inter'] max-w-2xl mx-auto">
                {activePrize.heroSubheading}
              </p>
            )}
            {activePrize.summary && (
              <p className="text-xs sm:text-base text-gray-500 dark:text-neutral-400 font-['Inter'] max-w-2xl mx-auto mt-3">
                {activePrize.summary}
              </p>
            )}
          </div>

          {(prizes.length > 1 || toolsetMode) && (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="mt-6 sm:mt-8"
            >
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4 }}
                className="mb-3 sm:mb-4 text-center px-2"
              >
                <p className="font-agency font-[950] uppercase text-black dark:text-white text-md sm:text-[32px] lg:text-agency-title leading-[1.08] break-words">
                  Win your choice of <span style={{ color: theme.primary }}>toolbox</span>
                </p>
                <p className="mt-1 text-xs sm:text-sm text-gray-600 dark:text-neutral-400 font-medium break-words whitespace-normal">
                  Sidchrome or Milwaukee — plus power toolset & $5,000 cash
                </p>
              </motion.div>

              <ToolboxSelector
                selectedType={
                  toolboxType === "cash"
                    ? null
                    : toolboxType
                }
                onSelect={handleToolboxTypeChange}
                className="mb-8 sm:mb-10"
              />

              {toolsetMode && toolsetSlug ? (
                <motion.p
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.4 }}
                  className="font-agency font-[950] uppercase text-black dark:text-white mb-3 sm:mb-4 text-center text-md sm:text-[32px] lg:text-agency-title leading-[1.08]"
                >
                  <span style={{ color: theme.primary }}>
                    {toolsetSlug === "ryobi"
                      ? "Ryobi"
                      : toolsetSlug === "milwaukee"
                        ? "Milwaukee"
                        : toolsetSlug === "dewalt"
                          ? "DeWalt"
                          : "Makita"}{" "}
                  </span>
                  Power Toolset
                </motion.p>
              ) : (
                <motion.p
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.4 }}
                  className="font-agency font-[950] uppercase text-black dark:text-white mb-3 sm:mb-4 text-center text-md sm:text-[32px] lg:text-agency-title leading-[1.08]"
                >
                  Pick your <span style={{ color: theme.primary }}>Power Toolset</span>
                </motion.p>
              )}

              {toolsetMode && toolsetSlug ? (
                <StaticToolsetHighlight
                  toolset={toolsetSlug}
                  prizeSlug={
                    ((toolboxType === "cash"
                      ? (lastNonCashToolboxType === "sidchrome"
                          ? toolsetPrizeSlugs?.[0]
                          : toolsetPrizeSlugs?.[1])
                      : activeSlug) ?? toolsetPrizeSlugs?.[0] ?? "milwaukee-milwaukee") as PrizeSlug
                  }
                  className=""
                />
              ) : (
                <PowerToolsetCarousel
                  prizes={toolsetPrizes}
                  activeSlug={
                    toolboxType === "cash"
                      ? null
                      : toolsetPrizes.some((p) => p.slug === activeSlug)
                        ? activeSlug
                        : null
                  }
                  onSelect={handleSelectPrize}
                  className=""
                />
              )}

              {/* Cash option is a separate prize path (no toolbox/toolset) */}
              <div className="mt-4 max-w-5xl mx-auto">
                <div className="relative flex items-center justify-center my-6 sm:my-8">
                  <div className="h-px w-full bg-gray-300 dark:bg-neutral-700" />
                  <div className="absolute px-3 py-1 rounded-full bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-600 text-[10px] sm:text-xs font-bold tracking-[0.22em] text-gray-600 dark:text-neutral-400">
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
                      : "bg-white dark:bg-neutral-800 text-gray-700 dark:text-neutral-300 border-gray-300 dark:border-neutral-600 hover:border-green-400 hover:text-green-600 hover:shadow-lg"
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
            </motion.div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-start">
          <div className="relative order-1 space-y-3 sm:space-y-4">
            <div 
              className="relative rounded-2xl border-2 backdrop-blur-sm overflow-hidden bg-[#EEEEEC] dark:bg-neutral-800"
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
                  {activePrize.gallery.map((image, index) => {
                    const src = image.src.toLowerCase();
                    const isMakitaSetHero = src.includes("makitaset-") && src.endsWith(".webp");
                    const isMilwaukeeSetHero = src.includes("milwaukeeset-") && src.endsWith(".webp");
                    const isMilwaukeeSetMilwaukeeTb = src.includes("milwaukeeset-milwaukeetb");
                    const isDewaltSetSidchrome = src.includes("dewaltset-sidchrome");
                    const isMakitaUpward = isMakitaSetHero || src.includes("makita.webp");
                    const isMilwaukeeUpward = (isMilwaukeeSetHero || src.includes("milwaukee.webp")) && !isMilwaukeeSetMilwaukeeTb;
                    const isRyobiSetTb = src.includes("ryobiset-milwaukeetb") || src.includes("ryobiset-sidchrometb");
                    const scaleClass = src.includes("dewalt.webp") || src.includes("milwaukee.webp") ? "scale-125" : src.includes("makita.webp") ? "scale-150" : isMakitaSetHero || isMilwaukeeSetHero ? "scale-[1.75]" : ((src.includes("dewalt-set") || src.includes("milwaukee-set") || isRyobiSetTb) && src.endsWith(".webp")) ? "scale-150" : "";
                    const translateClass = isMilwaukeeSetMilwaukeeTb ? "-translate-y-[5%]" : (isMakitaUpward || isMilwaukeeUpward || isDewaltSetSidchrome) ? "-translate-y-[8%]" : "";
                    const objectPosition = isMakitaSetHero || isMilwaukeeSetHero ? { objectPosition: "center center" as const } : undefined;
                    return (
                    <SwiperSlide key={`${image.src}-${index}`}>
                      <div className="relative aspect-[3/2] lg:aspect-[3/2] overflow-hidden">
                        <Image
                          src={image.src}
                          alt={image.alt || `Prize view ${index + 1}`}
                          fill
                          className={`object-contain ${scaleClass} ${translateClass}`}
                          style={objectPosition}
                          priority={index === 0}
                          sizes="(max-width: 1024px) 100vw, 50vw"
                        />
                      </div>
                    </SwiperSlide>
                  );})}
                </Swiper>
              ) : (
                (() => {
                  const firstSrc = (activePrize.gallery[0]?.src ?? "").toLowerCase();
                  const isMakitaSetHero = firstSrc.includes("makitaset-") && firstSrc.endsWith(".webp");
                  const isMilwaukeeSetHero = firstSrc.includes("milwaukeeset-") && firstSrc.endsWith(".webp");
                  const isMilwaukeeSetMilwaukeeTb = firstSrc.includes("milwaukeeset-milwaukeetb");
                  const isDewaltSetSidchrome = firstSrc.includes("dewaltset-sidchrome");
                  const isMakitaUpward = isMakitaSetHero || firstSrc.includes("makita.webp");
                  const isMilwaukeeUpward = (isMilwaukeeSetHero || firstSrc.includes("milwaukee.webp")) && !isMilwaukeeSetMilwaukeeTb;
                  const isRyobiSetTbFirst = firstSrc.includes("ryobiset-milwaukeetb") || firstSrc.includes("ryobiset-sidchrometb");
                  const scaleClass = firstSrc.includes("dewalt.webp") || firstSrc.includes("milwaukee.webp") ? "scale-125" : firstSrc.includes("makita.webp") ? "scale-150" : isMakitaSetHero || isMilwaukeeSetHero ? "scale-[1.75]" : ((firstSrc.includes("dewalt-set") || firstSrc.includes("milwaukee-set") || isRyobiSetTbFirst) && firstSrc.endsWith(".webp")) ? "scale-150" : "";
                  const translateClass = isMilwaukeeSetMilwaukeeTb ? "-translate-y-[6%]" : (isMakitaUpward || isMilwaukeeUpward || isDewaltSetSidchrome) ? "-translate-y-[8%]" : "";
                  const objectPosition = isMakitaSetHero || isMilwaukeeSetHero ? { objectPosition: "center center" as const } : undefined;
                  return (
                <div className="relative aspect-[3/2] lg:aspect-[3/2] overflow-hidden">
                  <Image
                    src={activePrize.gallery[0]?.src || "/images/grand-draw.jpg"}
                    alt={activePrize.gallery[0]?.alt || "Prize view"}
                    fill
                    className={`object-contain ${scaleClass} ${translateClass}`}
                    style={objectPosition}
                    priority
                    sizes="(max-width: 1024px) 100vw, 50vw"
                  />
                </div>
              );})()
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
                {activePrize.gallery.map((image, index) => {
                  const src = image.src.toLowerCase();
                  const isMakitaSetHero = src.includes("makitaset-") && src.endsWith(".webp");
                  const isMilwaukeeSetHero = src.includes("milwaukeeset-") && src.endsWith(".webp");
                  const isMilwaukeeSetMilwaukeeTb = src.includes("milwaukeeset-milwaukeetb");
                  const isDewaltSetSidchrome = src.includes("dewaltset-sidchrome");
                  const isMakitaUpward = isMakitaSetHero || src.includes("makita.webp");
                  const isMilwaukeeUpward = (isMilwaukeeSetHero || src.includes("milwaukee.webp")) && !isMilwaukeeSetMilwaukeeTb;
                  const isRyobiSetTbThumb = src.includes("ryobiset-milwaukeetb") || src.includes("ryobiset-sidchrometb");
                  const scaleClass = src.includes("dewalt.webp") || src.includes("milwaukee.webp") ? "scale-125" : src.includes("makita.webp") ? "scale-150" : isMakitaSetHero || isMilwaukeeSetHero ? "scale-[1.75]" : ((src.includes("dewalt-set") || src.includes("milwaukee-set") || isRyobiSetTbThumb) && src.endsWith(".webp")) ? "scale-150" : "";
                  const translateClass = isMilwaukeeSetMilwaukeeTb ? "-translate-y-[6%]" : (isMakitaUpward || isMilwaukeeUpward || isDewaltSetSidchrome) ? "-translate-y-[8%]" : "";
                  const objectPosition = isMakitaSetHero || isMilwaukeeSetHero ? { objectPosition: "center center" as const } : undefined;
                  return (
                  <SwiperSlide key={`thumb-${image.src}-${index}`} className="!w-16 !h-[42px] sm:!w-24 sm:!h-16">
                    <div 
                      className="relative w-full h-full rounded-xl overflow-hidden border-2 transition-all duration-300 cursor-pointer"
                      style={{
                        backgroundColor: "#EEEEEC",
                        borderColor: getBrandGlowColor(activeSlug || "milwaukee-milwaukee"),
                      }}
                    >
                      <Image
                        src={image.src}
                        alt={image.alt || `Prize thumbnail ${index + 1}`}
                        fill
                        className={`object-contain ${scaleClass} ${translateClass}`}
                        style={objectPosition}
                        sizes="64px"
                      />
                    </div>
                  </SwiperSlide>
                );})}
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
              style={{ background: theme.gradientSolid }}
            >
              <div className="flex items-center justify-center gap-3">
                <span className="font-agency font-bold text-base sm:text-lg text-white drop-shadow-lg">ENTER NOW</span>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </button>

            <div className="w-full hidden lg:block bg-white rounded-lg p-2">
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
                    : ""
                }`}
                style={currentMajorDraw?.status !== "frozen" ? { background: theme.gradientSolid } : undefined}
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
              style={{ background: theme.gradientSolid }}
            >
              <div className="flex items-center justify-center gap-3">
                <span className="font-agency font-bold text-base sm:text-lg text-white drop-shadow-lg">ENTER NOW</span>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </button>

            <div className="w-full lg:hidden bg-white rounded-lg p-2">
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

        {toolsetMode && toolsetSlug && isToolsetLandingSlug(toolsetSlug) && (
          <OtherToolsetsCarousel referrerSlug={toolsetSlug} currentToolsetSlug={toolsetSlug} />
        )}
      </div>

      <PrizeSpecificationsModal
        isOpen={isSpecsModalOpen}
        onClose={() => setIsSpecsModalOpen(false)}
        prize={activePrize}
      />
    </section>
  );
}
