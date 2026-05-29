"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import useEmblaCarousel from "embla-carousel-react";
import Fade from "embla-carousel-fade";
import ClassNames from "embla-carousel-class-names";
import type { EmblaCarouselType, EmblaOptionsType } from "embla-carousel";
import {
  Zap, Package, Battery, Wrench, DollarSign, Star, Banknote, Shield, Award,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/utils/cn";

const ICON_MAP: Record<string, LucideIcon> = {
  Zap, Package, Battery, Wrench, DollarSign, Star, Banknote, Shield, Award,
};

import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import PrizeSpecificationsModal from "@/components/modals/PrizeSpecificationsModal";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";
import { usePrizeCatalog } from "@/hooks/usePrizeCatalog";
import { getPrizeBrandColors, getBrandGlowColor, getBrandBorderColor } from "@/utils/prize-brand-colors";
import { getLandingPageThemeFromSlug } from "@/utils/package-colors/packageColorScheme";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { useSearchParams, usePathname } from "next/navigation";
import type { PrizeCatalogEntry, PrizeMedia, PrizeSlug } from "@/config/prizes";
import { SECTION_CONTAINER_CLASSES } from "@/components/ui";
import { getLandingHeroImagePaths } from "@/config/promo-landing-slugs";
import { getImageForMode } from "@/utils/promo/landing-image-resolver";
import { useThemeStore } from "@/stores/useThemeStore";
import { usePerSlugHeroOverride } from "@/hooks/ab-testing/usePerSlugHeroOverride";
import {
  ToolboxSelector,
  PowerToolsetCarousel,
  StaticToolsetHighlight,
  OtherToolsetsCarousel,
  TOOLBOX_QUERY_PARAM,
  parseToolboxQueryParam,
  buildToolsetLandingHref,
  getToolboxTypeFromSlug,
  filterPrizesByToolboxType,
} from "./prize-selection";
import { getPrizesForToolsetSlug, isToolsetLandingSlug } from "@/config/promo-landing-slugs";
import { isValidPromoSlug } from "@/utils/promo-analytics/validate-promo-slug";
import { usePromoThemeStore } from "@/stores/usePromoThemeStore";
import { getPrizeBySlug, listPrizes } from "@/config/prizes";
import FullscreenImageViewer, {
  FullscreenTriggerButton,
  type FullscreenImageItem,
} from "@/components/ui/FullscreenImageViewer";
import GiveawayCountdownTimer from "./GiveawayCountdownTimer";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { hasMultiplierBanner } from "@/utils/promo/multiplier-banner";
import MultiplierBannerImage from "@/components/ui/MultiplierBannerImage";

const FROM_PROMO_SLUG_KEY = "tools-aus:from-promo-slug";

type GallerySlideImage = { src: string; alt?: string; mobileSrc?: string };

/** Catalog `PrizeMedia` plus optional landing flag (first slide may be injected). */
type EnhancedGalleryItem = PrizeMedia & { isLandingImage?: boolean };

/** DEWALT / MAKITA / MILWAUKEE / RYOBI collection hero webps — match `config/prizes` gallery paths. */
function isMajorDrawBrandCollectionWebp(srcLower: string): boolean {
  return /\/(dewalt|makita|milwaukee|ryobi)\.webp$/.test(srcLower);
}

/** Pre-composed toolbox + toolset hero art (first gallery slides) — scaled down in frame vs raw product heroes. */
function isMajorDrawToolboxCompositeHero(srcLower: string): boolean {
  return (
    srcLower.includes("makitaset-milwaukeetb.webp") ||
    srcLower.includes("makitaset-sidchrometb.webp") ||
    srcLower.includes("dewaltset-milwaukeetb.webp") ||
    srcLower.includes("dewaltset-sidchrometb.webp") ||
    srcLower.includes("milwaukeeset-milwaukeetb.webp") ||
    srcLower.includes("milwaukeeset-sidchrome.webp")
  );
}

type GalleryLayoutResult = {
  scaleClass: string;
  translateClass: string;
  objectPosition?: CSSProperties;
};

function getPrizeGalleryImageLayout(
  imageSrc: string,
  options?: { isLandingImage?: boolean; thumb?: boolean }
): GalleryLayoutResult {
  const src = imageSrc.toLowerCase();
  const { isLandingImage, thumb } = options ?? {};
  const yMilwaukeeTb = thumb ? "-translate-y-[6%]" : "-translate-y-[5%]";

  if (isMajorDrawBrandCollectionWebp(src)) {
    return {
      scaleClass: "scale-90",
      translateClass: "-translate-y-[4%]",
      objectPosition: { objectPosition: "center center" as const },
    };
  }

  if (isMajorDrawToolboxCompositeHero(src)) {
    return {
      scaleClass: "scale-90",
      translateClass: "-translate-y-[3%]",
      objectPosition: { objectPosition: "center center" as const },
    };
  }

  if (src.includes("kincromeTB.webp")) {
    return {
      scaleClass: thumb ? "scale-75" : "scale-90",
      translateClass: "",
      objectPosition: { objectPosition: "center center" as const },
    };
  }

  const isMakitaSetHero = src.includes("makitaset-") && src.endsWith(".webp");
  const isMilwaukeeSetHero = src.includes("milwaukeeset-") && src.endsWith(".webp");
  const isMilwaukeeSetMilwaukeeTb = src.includes("milwaukeeset-milwaukeetb");
  const isDewaltSetSidchrome = src.includes("dewaltset-sidchrome");
  const isMakitaUpward = isMakitaSetHero || src.includes("makita.webp");
  const isMilwaukeeUpward = (isMilwaukeeSetHero || src.includes("milwaukee.webp")) && !isMilwaukeeSetMilwaukeeTb;

  const scaleClass =
    src.includes("dewalt.webp") || src.includes("milwaukee.webp")
      ? "scale-125"
      : src.includes("makita.webp")
        ? "scale-150"
        : isMakitaSetHero || isMilwaukeeSetHero
          ? "scale-[1.75]"
          : (src.includes("dewalt-set") || src.includes("milwaukee-set")) && src.endsWith(".webp")
            ? "scale-150"
            : "";

  const translateClass = isMilwaukeeSetMilwaukeeTb
    ? yMilwaukeeTb
    : isMakitaUpward || isMilwaukeeUpward || isDewaltSetSidchrome
      ? "-translate-y-[8%]"
      : "";

  const objectPosition =
    isMakitaSetHero || isMilwaukeeSetHero || isLandingImage
      ? { objectPosition: "center center" as const }
      : undefined;

  return { scaleClass, translateClass, objectPosition };
}

/**
 * Responsive prize/gallery slide: uses `<picture>` when `mobileSrc` is set (landing hero),
 * otherwise Next/Image only.
 */
function PrizeShowcaseResponsiveImage({
  image,
  index,
  scaleClass,
  translateClass,
  objectPosition,
  priority,
  sizes,
  alt: altOverride,
}: {
  image: GallerySlideImage;
  index: number;
  scaleClass: string;
  translateClass: string;
  objectPosition?: CSSProperties;
  priority: boolean;
  sizes: string;
  /** When set (e.g. thumbnails), overrides default “Prize view” alt. */
  alt?: string;
}) {
  const resolvedAlt = altOverride ?? image.alt ?? `Prize view ${index + 1}`;
  const mobile = image.mobileSrc;
  if (mobile && mobile !== image.src) {
    return (
      <>
        <div className="absolute inset-0 z-0 lg:hidden">
          <Image
            src={mobile}
            alt={resolvedAlt}
            fill
            className={cn("object-contain", scaleClass, translateClass)}
            style={objectPosition}
            priority={priority}
            sizes={sizes}
          />
        </div>
        <div className="absolute inset-0 z-0 hidden lg:block">
          <Image
            src={image.src}
            alt={resolvedAlt}
            fill
            className={cn("object-contain", scaleClass, translateClass)}
            style={objectPosition}
            priority={priority}
            sizes={sizes}
          />
        </div>
      </>
    );
  }
  return (
    <Image
      src={image.src}
      alt={resolvedAlt}
      fill
      className={cn("object-contain", scaleClass, translateClass)}
      style={objectPosition}
      priority={priority}
      sizes={sizes}
    />
  );
}

interface PrizeShowcaseProps {
  slug?: string;
  /** Toolset landing page mode - both toolboxes, fixed toolset, no navigation */
  toolsetMode?: boolean;
  /** Toolset slug (ryobi, milwaukee, dewalt, makita) when toolsetMode */
  toolsetSlug?: string;
  /**
   * Top hero strip: default branded “1st prize” art; `multiplier` uses `/images/banners/multiplier/*` from active promo (membership, then one-time); `none` hides both (countdown + rest unchanged).
   */
  firstBannerVariant?: "first-prize-text" | "multiplier" | "none";
  /** When false, hides `GiveawayCountdownTimer` (e.g. `/my-account/draws`). */
  showCountdown?: boolean;
}

/** Temporary: hide branded “First prize” text image strip. Set to `false` to show again. */
const TEMP_HIDE_FIRST_PRIZE_TEXT_BANNER = true;

const formatIconKey = (iconName: string) =>
  iconName
    .split(/[\s-_]+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");

const resolveHighlightIcon = (iconName?: string): LucideIcon => {
  if (!iconName) return Star;

  const candidates = [iconName, iconName.charAt(0).toUpperCase() + iconName.slice(1), formatIconKey(iconName)];
  for (const key of candidates) {
    if (ICON_MAP[key]) {
      return ICON_MAP[key];
    }
  }

  return Star;
};

// Helper function to get brand logo path based on prize slug (reserved for future use)
const _getBrandLogoPath = (slug: string): string | null => {
  switch (slug) {
    case "milwaukee-sidchrome":
    case "milwaukee-milwaukee":
      return "/images/brands/milwaukee.webp";
    case "dewalt-sidchrome":
    case "dewalt-milwaukee":
      return "/images/brands/dewalt-black.webp";
    case "makita-sidchrome":
    case "makita-milwaukee":
      return "/images/brands/Makita-red.webp";
    case "ryobi-sidchrome":
    case "ryobi-milwaukee":
      return "/images/brands/name/ryobiText.webp";
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
    case "dewalt-kincrome":
      return "/images/promotion/FirstPrizeText/1stprice-dewalt.webp";
    case "makita-sidchrome":
    case "makita-milwaukee":
    case "makita-kincrome":
      return "/images/promotion/FirstPrizeText/1stprice-makita.webp";
    case "ryobi-sidchrome":
    case "ryobi-milwaukee":
    case "ryobi-kincrome":
      return "/images/promotion/FirstPrizeText/1stprice-milwaukee.webp"; // Fallback until 1stprice-ryobi.webp exists
    case "cash-prize":
      return "/images/promotion/FirstPrizeText/1stprice-cash.webp";
    case "milwaukee-sidchrome":
    case "milwaukee-milwaukee":
    case "milwaukee-kincrome":
    default:
      return "/images/promotion/FirstPrizeText/1stprice-milwaukee.webp";
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


export default function PrizeShowcase({
  slug: slugProp,
  toolsetMode = false,
  toolsetSlug,
  firstBannerVariant = "first-prize-text",
  showCountdown = true,
}: PrizeShowcaseProps = {}) {
  const effectiveFirstBannerVariant =
    TEMP_HIDE_FIRST_PRIZE_TEXT_BANNER && firstBannerVariant === "first-prize-text"
      ? "none"
      : firstBannerVariant;

  const prizeRef = useScrollAnimation();
  const theme = usePromoTheme();
  const themeMode = useThemeStore((s) => s.theme);
  const setStoreSlug = usePromoThemeStore((s) => s.setSlug);
  const [mainCanSlidePrev, setMainCanSlidePrev] = useState(false);
  const [mainCanSlideNext, setMainCanSlideNext] = useState(false);
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);

  // Main image carousel: cross-fade between full-frame slides.
  // Speed analogue: Swiper speed:420ms ≈ Embla duration:25 frames at 60fps (raise/lower if visual feel diverges).
  const mainOptions = useMemo<EmblaOptionsType>(
    () => ({ loop: false, duration: 25 }),
    []
  );
  const mainPlugins = useMemo(() => [Fade(), ClassNames()], []);
  const [mainRef, mainApi] = useEmblaCarousel(mainOptions, mainPlugins);

  // Thumbs carousel: column-grouping. Each Embla slide is one COLUMN that stacks
  // 2 thumbs vertically (replaces Swiper Grid rows:2 / fill:"column").
  // Slide width = 1 / visibleColumns; columns visible per row = 4 / 5 / 6 (mobile / sm / lg).
  // This naturally handles non-divisible totals (no unreachable trailing thumbs) and
  // removes the snap-back caused by Swiper slidesPerGroup + slideToClickedSlide.
  const thumbsOptions = useMemo<EmblaOptionsType>(
    () => ({ containScroll: "keepSnaps" as const, dragFree: true }),
    []
  );
  const thumbsPlugins = useMemo(() => [ClassNames()], []);
  const [thumbsRef, thumbsApi] = useEmblaCarousel(thumbsOptions, thumbsPlugins);
  const [mobilePrizeIndex, setMobilePrizeIndex] = useState(0);
  const [isSpecsModalOpen, setIsSpecsModalOpen] = useState(false);
  const [isNavigating, _setIsNavigating] = useState(false);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [fullscreenStartIndex, setFullscreenStartIndex] = useState(0);
  const [isMounted, setIsMounted] = useState(false);
  const [multiplierBannerLoadFailed, setMultiplierBannerLoadFailed] = useState(false);
  const resolvedMembershipMultiplier = useResolvedMultiplier("membership-packages", "display");
  const resolvedOneTimeMultiplier = useResolvedMultiplier("one-time-packages", "display");
  const multiplierForFirstBanner =
    firstBannerVariant === "multiplier"
      ? resolvedMembershipMultiplier != null && resolvedMembershipMultiplier > 1
        ? resolvedMembershipMultiplier
        : resolvedOneTimeMultiplier != null && resolvedOneTimeMultiplier > 1
          ? resolvedOneTimeMultiplier
          : null
      : null;
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

  // Toolset mode: effective slug from toolbox selection; kept in sync with `?toolbox=` on the landing URL
  const [toolsetEffectiveSlug, setToolsetEffectiveSlug] = useState<string | null>(null);
  // When NOT on promotions page (e.g. home, my-account): local slug, no navigation
  const [localEffectiveSlug, setLocalEffectiveSlug] = useState<string | null>(null);
  // Toolbox type toggle state - initialize from activeSlug to prevent navigation issues
  const [toolboxType, setToolboxType] = useState<"sidchrome" | "milwaukee" | "kincrome" | "cash">("milwaukee");
  // Remember last non-cash toolbox so we can keep showing the power toolset options even when cash is selected
  const [lastNonCashToolboxType, setLastNonCashToolboxType] = useState<"sidchrome" | "milwaukee" | "kincrome">(
    "milwaukee"
  );
  // When true: PowerToolsetCarousel shows all toolsets (deactivated). Set when user clicks a toolbox; cleared on toolset select (navigation).
  const [carouselDeactivated, setCarouselDeactivated] = useState(false);

  const effectiveSlugForCatalog = (() => {
    if (toolsetMode)
      return (
        toolsetEffectiveSlug ??
        slugProp ??
        toolsetPrizeSlugs?.[2] ??
        toolsetPrizeSlugs?.[0]
      );
    if (isPromotionsPage) return slugProp;
    if (localEffectiveSlug) return localEffectiveSlug;
    const tt: "sidchrome" | "milwaukee" | "kincrome" =
      toolboxType === "cash" ? lastNonCashToolboxType : toolboxType;
    return filterPrizesByToolboxType(listPrizes(), tt)[0]?.slug ?? slugProp;
  })();

  const { prizes, activePrize, activeSlug } = usePrizeCatalog({ slug: effectiveSlugForCatalog ?? undefined });
  // Read the A/B variant's per-slug hero override at the top of the component to
  // satisfy the rules-of-hooks ordering — the early returns below would otherwise
  // make the hook call conditional.
  const variantHeroOverride = usePerSlugHeroOverride(activeSlug);

  const toolboxQueryValue = searchParams.get(TOOLBOX_QUERY_PARAM);

  const syncToolboxQuery = useCallback(
    (type: "sidchrome" | "milwaukee" | "kincrome" | "cash") => {
      if (!toolsetMode || !pathname?.startsWith("/promotions/")) return;
      const href = buildToolsetLandingHref(pathname, searchParams, type);
      router.replace(href, { scroll: false });
    },
    [toolsetMode, pathname, router, searchParams]
  );

  useEffect(() => {
    setMultiplierBannerLoadFailed(false);
  }, [multiplierForFirstBanner, firstBannerVariant, activeSlug, toolsetMode, toolsetSlug]);

  // Toolset mode: hydrate from `?toolbox=` (cash | kincrome | milwaukee | sidchrome); invalid/missing → Milwaukee
  useEffect(() => {
    if (!toolsetMode || !toolsetPrizeSlugs) return;

    const fromUrl = parseToolboxQueryParam(toolboxQueryValue);

    if (fromUrl === "cash") {
      setToolsetEffectiveSlug("cash-prize");
      setToolboxType("cash");
      setStoreSlug("cash-prize");
      return;
    }

    const nonCash: "sidchrome" | "milwaukee" | "kincrome" = fromUrl ?? "milwaukee";
    const slug =
      nonCash === "sidchrome"
        ? toolsetPrizeSlugs[0]
        : nonCash === "kincrome"
          ? toolsetPrizeSlugs[1]
          : toolsetPrizeSlugs[2];

    setToolsetEffectiveSlug(slug);
    setToolboxType(nonCash);
    setLastNonCashToolboxType(nonCash);
    setStoreSlug(slug);
  }, [toolsetMode, toolsetPrizeSlugs, toolboxQueryValue, setStoreSlug]);

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
  const toolsetToolboxType: "sidchrome" | "milwaukee" | "kincrome" =
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

  useEffect(() => {
    setActiveGalleryIndex(0);
  }, [activeSlug]);

  // Evergreen (home, my-account, etc.): keep promo theme store in sync with the prize on screen —
  // toolbox changes update `activeSlug` without always calling `setStoreSlug` (e.g. carousel-first slug).
  useEffect(() => {
    if (!activeSlug || toolsetMode || isPromotionsPage) return;
    setStoreSlug(activeSlug);
  }, [activeSlug, toolsetMode, isPromotionsPage, setStoreSlug]);

  // Sync the thumbs Embla to the column containing the active gallery item
  // (each column holds 2 thumbs — see thumbs render below).
  useEffect(() => {
    if (!thumbsApi) return;
    const columnIndex = Math.floor(activeGalleryIndex / 2);
    thumbsApi.scrollTo(columnIndex);
  }, [activeGalleryIndex, thumbsApi]);
  
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
  
  // Set mounted state after component mounts to prevent hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleEnterNow = () => openEntryFlow({ openLocalModal: false });

  const openFullscreenAtIndex = (index: number) => {
    setFullscreenStartIndex(index);
    setIsFullscreenOpen(true);
  };

  const onMainSelect = useCallback((api: EmblaCarouselType) => {
    const i = api.selectedScrollSnap();
    setActiveGalleryIndex(i);
    setMainCanSlidePrev(api.canScrollPrev());
    setMainCanSlideNext(api.canScrollNext());
  }, []);

  useEffect(() => {
    if (!mainApi) return;
    onMainSelect(mainApi);
    mainApi.on("select", onMainSelect);
    mainApi.on("reInit", onMainSelect);
    return () => {
      mainApi.off("select", onMainSelect);
      mainApi.off("reInit", onMainSelect);
    };
  }, [mainApi, onMainSelect]);

  // When the gallery resets to index 0 on prize change, ensure the main carousel scrolls back too.
  useEffect(() => {
    if (!mainApi) return;
    if (mainApi.selectedScrollSnap() !== activeGalleryIndex) {
      mainApi.scrollTo(activeGalleryIndex);
    }
  }, [mainApi, activeGalleryIndex]);

  const handleSelectPrize = (nextSlug: string) => {
    if (!nextSlug || nextSlug === activeSlug) return;

    // Selecting a toolset reactivates the carousel (show focused state)
    if (nextSlug !== "cash-prize") {
      setCarouselDeactivated(false);
    }

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
  
  const handleToolboxTypeChange = (type: "sidchrome" | "milwaukee" | "kincrome" | "cash") => {
    if (toolboxType === type) return;

    setToolboxType(type);
    localStorage.setItem("prizeToolboxType", type);

    if (type === "cash") {
      setCarouselDeactivated(false);
      if (toolsetMode) {
        setToolsetEffectiveSlug("cash-prize");
        setStoreSlug("cash-prize");
        syncToolboxQuery("cash");
      } else {
        handleSelectPrize("cash-prize");
      }
      return;
    }

    setLastNonCashToolboxType(type);
    // Deactivate carousel when user clicks a toolbox so all toolsets are shown
    setCarouselDeactivated(true);

    if (toolsetMode && toolsetPrizeSlugs) {
      const newSlug =
        type === "sidchrome" ? toolsetPrizeSlugs[0] : type === "kincrome" ? toolsetPrizeSlugs[1] : toolsetPrizeSlugs[2];
      setToolsetEffectiveSlug(newSlug);
      setStoreSlug(newSlug);
      syncToolboxQuery(type);
    } else {
      // Evergreen: do not navigate; user must click toolset to select
    }
  };

  if (!activePrize) {
    return null;
  }

  // Get brand colors for active prize to match View Specs button and prize header
  const brandColors = getPrizeBrandColors(activeSlug || "milwaukee-milwaukee");
  const activeBrandBorderColor = getBrandBorderColor(activeSlug || "milwaukee-milwaukee");
  const activeBrandGlowColor = getBrandGlowColor(activeSlug || "milwaukee-milwaukee");
  /** Full CSS gradients (not Tailwind arbitrary classes) so JIT cannot strip Makita/cyan stops. */
  const highlightTheme = getLandingPageThemeFromSlug(activeSlug || "milwaukee-milwaukee");
  const highlightIconClassName = brandColors.textColor.includes("black")
    ? `${brandColors.textColor} drop-shadow-sm`
    : `${brandColors.textColor} drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]`;
  const isRyobiOrDewaltTheme = (activeSlug || "").startsWith("ryobi-") || (activeSlug || "").startsWith("dewalt-");
  const highlights = activePrize.highlights ?? [];

  // Insert landing image as first gallery item if available. When the visitor is
  // bucketed into an A/B variant that overrides the per-slug mobile hero, prefer
  // that path so the carousel slide stays consistent with the PromoHero variant.
  const landingImagePaths = activeSlug ? getLandingHeroImagePaths(activeSlug) : null;
  const enhancedGallery = ((): EnhancedGalleryItem[] => {
    if (!landingImagePaths && !variantHeroOverride?.mobile) return activePrize.gallery;

    // First slide uses the mobile landing art everywhere (desktop + mobile) per
    // product request, so variant override only needs to compose the mobile slot.
    const landingImageMobile =
      variantHeroOverride?.mobile ??
      (landingImagePaths ? getImageForMode(landingImagePaths, themeMode, "mobile") : null);

    if (!landingImageMobile) return activePrize.gallery;

    const landingImage: EnhancedGalleryItem = {
      src: landingImageMobile,
      alt: `${activePrize.heroHeading} Landing Hero`,
      isLandingImage: true,
    };

    return [landingImage, ...activePrize.gallery];
  })();
  
  const fullscreenImages: FullscreenImageItem[] = enhancedGallery.map((image, index) => ({
    src: image.src,
    alt: image.alt || `Prize view ${index + 1}`,
  }));

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
      {/* Crack texture overlay - visible only in dark mode; URL only when dark to avoid loading in light mode */}
      <div
        className="absolute inset-0 z-0 pointer-events-none opacity-0 dark:opacity-[0.3] transition-opacity duration-300"
        aria-hidden="true"
        style={
          themeMode === "dark"
            ? {
                backgroundImage: "url('/images/background/promo/FX/crack.webp')",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      />
      <div className={useParentContainer ? "relative z-10 w-full" : `${SECTION_CONTAINER_CLASSES} relative z-10`}>
        {(effectiveFirstBannerVariant !== "none" || showCountdown) && (
        <div
          className={`text-center ${
            effectiveFirstBannerVariant !== "none" ? "mb-6 sm:mb-12" : "mb-3 sm:mb-6"
          }`}
        >
          {effectiveFirstBannerVariant === "multiplier" ? (
            multiplierForFirstBanner != null &&
            hasMultiplierBanner(multiplierForFirstBanner) && (
              <div className="flex justify-center mb-1 sm:mb-2">
                {!multiplierBannerLoadFailed ? (
                  <MultiplierBannerImage
                    multiplier={multiplierForFirstBanner}
                    slug={activeSlug}
                    toolsetSlug={toolsetMode ? toolsetSlug ?? null : null}
                    alt={`${multiplierForFirstBanner}X promo entries`}
                    className="w-full max-w-4xl lg:max-w-2xl h-auto object-contain"
                    priority
                    onExhausted={() => setMultiplierBannerLoadFailed(true)}
                  />
                ) : (
                  <p className="font-sans font-extrabold font-black uppercase text-xl sm:text-2xl text-gray-900 dark:text-white">
                    <span className="text-red-600 dark:text-red-400">{multiplierForFirstBanner}X</span> promo active
                  </p>
                )}
              </div>
            )
          ) : effectiveFirstBannerVariant === "first-prize-text" ? (
            <div className="flex justify-center">
              <Image
                src={getFirstPrizeImagePath(activeSlug)}
                alt="First Prize"
                width={800}
                height={200}
                className="w-full max-w-4xl lg:max-w-2xl h-auto object-contain"
                priority
                sizes="(max-width: 1024px) 100vw, 800px"
              />
            </div>
          ) : null}

          {showCountdown ? (
          <div className="mt-4 sm:mt-6 max-w-3xl mx-auto px-2 sm:px-3">
            <GiveawayCountdownTimer activeSlug={activeSlug} />
          </div>
          ) : null}
        </div>
        )}

          {/* Prize description section - hidden for now */}
          <div className="hidden">
            <div className={`inline-block bg-gradient-to-br ${brandColors.gradient} rounded-xl sm:rounded-2xl px-4 sm:px-6 py-2 sm:py-3 mb-4 shadow-lg border-2 ${brandColors.borderColor.replace('border-', 'border-').replace('-500', '-400/30')}`}>
              <h2 className={cn("text-2xl sm:text-4xl lg:text-5xl font-bold", brandColors.textColor, "font-sans drop-shadow-lg")}>
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
              className="mt-6 sm:mt-8 mb-10 sm:mb-12 lg:mb-14"
            >
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4 }}
                className="mb-3 sm:mb-4 text-center px-2"
              >
                <p className="font-sans font-extrabold font-[950] uppercase text-black dark:text-white text-md sm:text-[32px] lg:text-agency-title leading-[1.08] break-words">
                  Win your choice of <span style={{ color: theme.primary }}>toolbox</span>
                </p>
                <p className="mt-1 text-xs sm:text-sm text-gray-600 dark:text-neutral-400 font-medium break-words whitespace-normal">
                  Milwaukee, Kincrome, or Sidchrome — plus power toolset & $5,000 cash
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
                  className="font-sans font-extrabold font-[950] uppercase text-black dark:text-white mb-3 sm:mb-4 text-center text-md sm:text-[32px] lg:text-agency-title leading-[1.08]"
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
                  className="font-sans font-extrabold font-[950] uppercase text-black dark:text-white mb-3 sm:mb-4 text-center text-md sm:text-[32px] lg:text-agency-title leading-[1.08]"
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
                          : lastNonCashToolboxType === "kincrome"
                            ? toolsetPrizeSlugs?.[1]
                            : toolsetPrizeSlugs?.[2])
                      : activeSlug) ?? toolsetPrizeSlugs?.[0] ?? "milwaukee-milwaukee") as PrizeSlug
                  }
                  className="mb-8 sm:mb-10 lg:mb-12"
                />
              ) : (
                <PowerToolsetCarousel
                  prizes={toolsetPrizes}
                  activeSlug={
                    carouselDeactivated
                      ? null
                      : toolboxType === "cash"
                        ? null
                        : toolsetPrizes.some((p) => p.slug === activeSlug)
                          ? activeSlug
                          : null
                  }
                  onSelect={handleSelectPrize}
                  className="mb-8 sm:mb-10 lg:mb-12"
                />
              )}

              {/* Cash option is a separate prize path (no toolbox/toolset) */}
              <div className="mt-2 sm:mt-4 max-w-5xl mx-auto flex flex-col gap-6 sm:gap-8">
                <div className="relative flex items-center justify-center py-1 sm:py-2">
                  <div className="h-px w-full bg-gray-300 dark:bg-neutral-700" />
                  <div className="absolute px-3 py-1 rounded-full bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-600 text-2xs sm:text-xs font-bold tracking-[0.22em] text-gray-600 dark:text-neutral-400">
                    OR
                  </div>
                </div>

                <button
                  onClick={() => {
                    handleToolboxTypeChange("cash");
                  }}
                  className={`w-full py-2.5 sm:py-4 rounded-xl sm:rounded-2xl font-acumin font-[950] text-sm sm:text-2xl transition-[colors,transform,box-shadow] duration-[var(--ta-transition-dur)] border-2 relative overflow-hidden flex items-center justify-center ${
                    toolboxType === "cash"
                      ? "border-green-500 shadow-lg shadow-green-500/40 bg-cover bg-center"
                      : "bg-white dark:bg-neutral-800 text-gray-700 dark:text-neutral-300 border-gray-300 dark:border-neutral-600 hover:border-green-400 hover:text-green-600 hover:shadow-lg"
                  }`}
                  style={toolboxType === "cash" ? { backgroundImage: `url('/images/majordraws/cash-prize/cash-prize-10000.webp')` } : undefined}
                  suppressHydrationWarning
                >
                  {toolboxType === "cash" && (
                    <div className="absolute inset-0 z-0 bg-gradient-to-br from-green-600/85 via-green-600/75 to-green-700/85" />
                  )}
                  <span className={cn("relative z-10 text-md sm:text-2xl", toolboxType === "cash" ? "text-white drop-shadow-lg" : "")}>$10,000 cash</span>
                </button>

                
              </div>
            </motion.div>
          )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-start">
          <div className="relative order-1 space-y-3 sm:space-y-4">
            <div 
              className="relative rounded-2xl border-2 backdrop-blur-sm overflow-hidden bg-[#EEEEEC]"
              style={{
                borderColor: getBrandBorderColor(activeSlug || "milwaukee-milwaukee"),
                boxShadow: `0 0 20px ${getBrandGlowColor(activeSlug || "milwaukee-milwaukee")}, 0 8px 32px rgba(0,0,0,0.4)`,
              }}
            >
              {enhancedGallery.length > 1 ? (
                <div
                  ref={mainRef}
                  className="main-swiper overflow-hidden"
                  data-brand-slug={activeSlug}
                  data-carousel="true"
                  style={{ touchAction: "pan-y pinch-zoom" }}
                >
                  <div className="flex">
                    {enhancedGallery.map((image, index) => {
                      const { scaleClass, translateClass, objectPosition } = getPrizeGalleryImageLayout(
                        image.src,
                        { isLandingImage: image.isLandingImage }
                      );
                      return (
                        <div
                          key={`${image.src}-${index}`}
                          className="flex-[0_0_100%] min-w-0"
                        >
                          <div
                            className="relative aspect-[5/6] sm:aspect-[4/3] lg:aspect-[6/5] overflow-hidden cursor-zoom-in"
                          >
                            <PrizeShowcaseResponsiveImage
                              image={image}
                              index={index}
                              scaleClass={scaleClass}
                              translateClass={translateClass}
                              objectPosition={objectPosition}
                              priority={index === 0}
                              sizes="(max-width: 1024px) 100vw, 50vw"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                (() => {
                  const firstSlide = enhancedGallery[0];
                  const { scaleClass, translateClass, objectPosition } = getPrizeGalleryImageLayout(
                    firstSlide?.src ?? "",
                    { isLandingImage: firstSlide?.isLandingImage }
                  );
                  return (
                <div
                  className="relative aspect-[5/6] sm:aspect-[4/3] lg:aspect-[6/5] overflow-hidden cursor-zoom-in"
                >
                  <PrizeShowcaseResponsiveImage
                    image={{
                      src: firstSlide?.src || "/images/grand-draw.jpg",
                      alt: firstSlide?.alt,
                      mobileSrc: firstSlide?.mobileSrc,
                    }}
                    index={0}
                    scaleClass={scaleClass}
                    translateClass={translateClass}
                    objectPosition={objectPosition}
                    priority
                    sizes="(max-width: 1024px) 100vw, 50vw"
                  />
                </div>
              );})()
              )}

              <div className="absolute right-3 top-3 z-30">
                <FullscreenTriggerButton
                  onClick={() => openFullscreenAtIndex(enhancedGallery.length > 1 ? activeGalleryIndex : 0)}
                  label={`View prize image ${activeGalleryIndex + 1} in fullscreen`}
                />
              </div>

              {enhancedGallery.length > 1 && mainCanSlidePrev && (
                <button
                  type="button"
                  onClick={() => mainApi?.scrollPrev()}
                  aria-label="Show previous prize image"
                  className="absolute left-2 sm:left-4 top-1/2 z-20 -translate-y-1/2 inline-flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full border-2 bg-black/70 transition hover:bg-black/85"
                  style={{
                    borderColor: activeBrandBorderColor,
                    color: activeBrandBorderColor,
                    boxShadow: `0 0 14px ${activeBrandGlowColor}, 0 4px 14px rgba(0,0,0,0.45)`,
                  }}
                >
                  <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}

              {enhancedGallery.length > 1 && mainCanSlideNext && (
                <button
                  type="button"
                  onClick={() => mainApi?.scrollNext()}
                  aria-label="Show next prize image"
                  className="absolute right-2 sm:right-4 top-1/2 z-20 -translate-y-1/2 inline-flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full border-2 bg-black/70 transition hover:bg-black/85"
                  style={{
                    borderColor: activeBrandBorderColor,
                    color: activeBrandBorderColor,
                    boxShadow: `0 0 14px ${activeBrandGlowColor}, 0 4px 14px rgba(0,0,0,0.45)`,
                  }}
                >
                  <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}

              {/* <div className="absolute top-4 right-4 z-20">
                <button
                  onClick={() => setIsSpecsModalOpen(true)}
                  suppressHydrationWarning
                  className="relative overflow-hidden rounded-full transition-all duration-300 hover:scale-105 group"
                >
                  <div className={cn("absolute inset-0 bg-gradient-to-br", brandColors.gradient)}></div>
                  <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent"></div>
                  <div className={`pointer-events-none absolute inset-0 rounded-full ${brandColors.shadowColor.replace('/40', '/25')} blur-xl animate-pulse`}></div>
                  <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${brandColors.shadowColor.replace('/40', '/20')} blur-xl`}></div>
                  <div className={`relative z-10 flex items-center justify-center gap-2 px-3 py-2 sm:px-4 sm:py-2 border-2 ${brandColors.borderColor.replace('border-', 'border-').replace('-500', '-400/30')} rounded-full`}>
                    <span className={cn("font-acumin font-[950] text-xs sm:text-sm", brandColors.textColor, "drop-shadow-lg whitespace-nowrap")}>
                      VIEW SPECS
                    </span>
                  </div>
                </button>
              </div> */}
            </div>

            {enhancedGallery.length > 1 && (
              <div className="relative">
                <div
                  ref={thumbsRef}
                  className="thumbs-swiper h-[120px] sm:h-[140px] lg:h-[156px]"
                  data-brand-slug={activeSlug}
                  data-carousel="true"
                  style={{ touchAction: "pan-y pinch-zoom" }}
                >
                  {/* Column grouping: each Embla slide is one column holding 2 thumbs stacked vertically.
                      Visible columns per row: 4 (mobile) / 5 (sm) / 6 (lg) — total visible thumbs = columns × 2.
                      Replaces Swiper Grid rows:2 / slidesPerGroup. Naturally reaches partial-final-column
                      (no unreachable trailing items) and avoids slidesPerGroup snap-back on click. */}
                  <div className="flex gap-2 h-full">
                    {Array.from({ length: Math.ceil(enhancedGallery.length / 2) }, (_, columnIndex) => {
                      const top = enhancedGallery[columnIndex * 2];
                      const bottom = enhancedGallery[columnIndex * 2 + 1];
                      return (
                        <div
                          key={`thumb-col-${columnIndex}`}
                          className="flex-[0_0_25%] sm:flex-[0_0_20%] lg:flex-[0_0_16.66%] flex flex-col gap-2 h-full"
                        >
                          {[top, bottom].map((image, rowIndex) => {
                            if (!image) return <div key={`thumb-empty-${columnIndex}-${rowIndex}`} className="flex-1 min-h-0" />;
                            const flatIndex = columnIndex * 2 + rowIndex;
                            const { scaleClass, translateClass, objectPosition } = getPrizeGalleryImageLayout(
                              image.src,
                              { isLandingImage: image.isLandingImage, thumb: true }
                            );
                            return (
                              <button
                                key={`thumb-${image.src}-${flatIndex}`}
                                type="button"
                                onClick={() => mainApi?.scrollTo(flatIndex)}
                                aria-label={`View prize image ${flatIndex + 1}`}
                                aria-current={activeGalleryIndex === flatIndex ? "true" : "false"}
                                className={`relative w-full flex-1 min-h-0 rounded-xl overflow-hidden border transition-all duration-300 cursor-pointer touch-manipulation ${
                                  activeGalleryIndex === flatIndex
                                    ? "border-gray-500 dark:border-neutral-500 opacity-100"
                                    : "border-gray-200/90 dark:border-neutral-600 opacity-[0.82]"
                                }`}
                                style={{
                                  backgroundColor: "#EEEEEC",
                                }}
                              >
                                <PrizeShowcaseResponsiveImage
                                  image={image}
                                  index={flatIndex}
                                  scaleClass={scaleClass}
                                  translateClass={translateClass}
                                  objectPosition={objectPosition}
                                  priority={false}
                                  sizes="(max-width: 640px) 25vw, (max-width: 1024px) 20vw, 16vw"
                                  alt={image.alt || `Prize thumbnail ${flatIndex + 1}`}
                                />
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            )}

          </div>

          <div className="space-y-3 sm:space-y-4 order-2 lg:row-span-2">
            <div className="grid grid-cols-2 gap-1 sm:gap-4">
              {highlights.map((highlight, index) => {
                const Icon = resolveHighlightIcon(highlight.icon);
                return (
                  <div
                    key={`${highlight.title}-${index}`}
                    className="relative flex items-center gap-2 sm:gap-3 p-2 sm:p-3 min-h-[40px] sm:min-h-[60px] bg-gradient-to-br from-gray-900 via-gray-800 to-black backdrop-blur-[var(--ta-blur)] rounded-xl sm:rounded-2xl border border-gray-700 shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent rounded-xl sm:rounded-2xl pointer-events-none"></div>
                    <div
                      className="relative z-10 flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 shadow-lg backdrop-blur-[var(--ta-blur)] sm:h-12 sm:w-12 sm:rounded-xl"
                      style={{
                        backgroundImage: highlightTheme.gradientSolid,
                        borderColor: activeBrandBorderColor,
                        boxShadow: `0 2px 14px ${activeBrandGlowColor}`,
                      }}
                    >
                      <div
                        className="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-br from-white/35 via-white/10 to-transparent sm:rounded-xl"
                        aria-hidden
                      />
                      <Icon className={cn("relative z-10 w-3.5 h-3.5 sm:w-5 sm:h-5", highlightIconClassName)} strokeWidth={2.25} />
                    </div>
                    <div className="flex-1 relative z-10 min-w-0 flex flex-col justify-center">
                      <h3 className="text-2xs sm:text-lg font-bold text-white font-sans mb-0 sm:mb-1 drop-shadow-md leading-tight line-clamp-2 sm:line-clamp-none">
                        {highlight.title}
                      </h3>
                      <p className="text-2xs sm:text-base text-gray-300 font-['Inter'] leading-tight sm:leading-relaxed hidden lg:block">
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
              className="w-full relative overflow-hidden rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-gray-700 shadow-[0_8px_32px_rgba(0,0,0,0.4)] bg-gradient-to-br from-gray-900 via-gray-800 to-black backdrop-blur-[var(--ta-blur)] transition-[colors,box-shadow] duration-[var(--ta-transition-dur)] hover:border-gray-600 hover:shadow-[0_8px_32px_rgba(0,0,0,0.5)] group text-left"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent rounded-xl sm:rounded-2xl pointer-events-none group-hover:from-white/10"></div>
              <div className="relative z-10 flex items-center justify-between gap-3">
                <span className="text-sm sm:text-lg font-bold text-white font-sans drop-shadow-md">
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
                <span className={cn("font-sans font-extrabold font-bold text-base sm:text-lg", isRyobiOrDewaltTheme ? "text-black" : "text-white", "drop-shadow-lg")}>ENTER NOW</span>
                <svg className={cn("w-4 h-4 sm:w-5 sm:h-5", isRyobiOrDewaltTheme ? "text-black" : "text-white")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </button>

            <div className="w-full hidden lg:block bg-white rounded-lg p-2">
              <Image
                src="/images/safe-checkout-stripe.webp"
                alt="Guaranteed safe & secure checkout powered by Stripe"
                width={600}
                height={160}
                className="w-full h-auto"
                sizes="(max-width: 1024px) 100vw, 600px"
              />
            </div>
          </div>

          <div className="relative order-3 space-y-3 sm:space-y-4">
            <button
              onClick={handleEnterNow}
              suppressHydrationWarning
              className="promo-hero-cta-button w-full rounded-full lg:hidden px-6 py-3 sm:px-8 sm:py-4"
              style={{ background: theme.gradientSolid }}
            >
              <div className="flex items-center justify-center gap-3">
                <span className={cn("font-sans font-extrabold font-bold text-base sm:text-lg", isRyobiOrDewaltTheme ? "text-black" : "text-white", "drop-shadow-lg")}>ENTER NOW</span>
                <svg className={cn("w-4 h-4 sm:w-5 sm:h-5", isRyobiOrDewaltTheme ? "text-black" : "text-white")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </button>

            <div className="w-full lg:hidden bg-white rounded-lg p-2">
              <Image
                src="/images/safe-checkout-stripe.webp"
                alt="Guaranteed safe & secure checkout powered by Stripe"
                width={600}
                height={160}
                className="w-full h-auto"
                sizes="(max-width: 1024px) 100vw, 600px"
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

      <FullscreenImageViewer
        isOpen={isFullscreenOpen}
        images={fullscreenImages}
        initialIndex={fullscreenStartIndex}
        onClose={() => setIsFullscreenOpen(false)}
        title={activePrize.heroHeading}
      />
    </section>
  );
}
