"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Users, Zap, Check, ChevronLeft, ChevronRight } from "lucide-react";
import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLeafTimer } from "@/hooks/useLeafTimer";
import useEmblaCarousel from "embla-carousel-react";
import ClassNames from "embla-carousel-class-names";
import type { EmblaCarouselType, EmblaOptionsType } from "embla-carousel";
import { EmblaCarouselButton } from "@/components/ui/embla/EmblaCarouselButton";
import MembershipModal from "@/components/modals/MembershipModal/LazyMembershipModal";
import { useUserContext } from "@/contexts/UserContext";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";
import { useMajorDrawPurchaseGate } from "@/hooks/useMajorDrawPurchaseGate";
import { useCurrentMajorDraw, useUserMajorDrawStats } from "@/hooks/queries/useMajorDrawQueries";
import { usePrizeCatalog } from "@/hooks/usePrizeCatalog";
import { Skeleton } from "@/components/loading/SkeletonLoader";
import {
  getPrizeBrandColors,
  getBrandBorderColor,
  getBrandGlowColor,
} from "@/utils/prize-brand-colors";
import { getMembershipSectionColorScheme } from "@/utils/package-colors/packageColorScheme";
import type { PrizeSlug, PrizeSummary } from "@/config/prize-summaries";
// Type-only (erased at compile): the deep-catalog VALUES only ever arrive through the
// click-gated `import("@/config/prizes")` in the specs-modal effect below.
import type { PrizeCatalogEntry } from "@/config/prizes";
import { cn } from "@/utils/cn";
import dynamic from "next/dynamic";

// Click-gated heavy chunk (LazyMembershipModal latch pattern — see
// src/components/modals/MembershipModal/LazyMembershipModal.tsx and PrizeShowcase):
// rendered only after the first open via the specsEverOpened latch below.
const PrizeSpecificationsModal = dynamic(() => import("@/components/modals/PrizeSpecificationsModal"), { ssr: false });

interface MajorDrawSectionProps {
  className?: string;
}

interface MajorDrawCountdownValues {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

// Leaf component owning the 1s tick so the parent (MajorDrawSection) does not
// re-render every second. Computes Days/Hours/Mins/Secs from `targetMs` and
// passes them to the render prop.
function MajorDrawCountdownLeaf({
  targetMs,
  render,
}: {
  targetMs: number;
  render: (values: MajorDrawCountdownValues) => React.ReactNode;
}) {
  const now = useLeafTimer(1000);
  const difference = targetMs - now;
  const values: MajorDrawCountdownValues =
    difference > 0
      ? {
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((difference % (1000 * 60)) / 1000),
        }
      : { days: 0, hours: 0, minutes: 0, seconds: 0 };
  return <>{render(values)}</>;
}

// Pagination dots component for Embla main carousel — replaces Swiper [Pagination]
function EmblaPaginationDots({
  api,
  active,
  className,
}: {
  api: EmblaCarouselType | null;
  active: number;
  className?: string;
}) {
  const [snapCount, setSnapCount] = useState(0);

  useEffect(() => {
    if (!api) return;
    const update = () => setSnapCount(api.scrollSnapList().length);
    update();
    api.on("reInit", update);
    return () => {
      api.off("reInit", update);
    };
  }, [api]);

  if (snapCount <= 1) return null;

  return (
    <div
      className={cn(
        "absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-1.5",
        className
      )}
    >
      {Array.from({ length: snapCount }).map((_, i) => {
        const isActive = i === active;
        return (
          <button
            key={i}
            type="button"
            aria-label={`Go to image ${i + 1}`}
            aria-current={isActive}
            onClick={() => api?.scrollTo(i)}
            className={`h-1.5 rounded-full transition-[width,background-color] duration-[var(--ta-transition-dur)] ${
              isActive ? "w-5 bg-white" : "w-1.5 bg-white/55 hover:bg-white/80"
            }`}
          />
        );
      })}
    </div>
  );
}

// Inline two-Embla prize gallery used by both mobile and desktop layouts.
// See docs/shared-ui/patterns.md "Inline two-Embla pattern" — siblings (e.g. the
// VIEW SPECS button overlay) live next to the main viewport, so the
// EmblaThumbsGallery wrapper (which renders thumbs as a fixed sibling under one
// root) isn't a fit. Renders the bordered main card and the (sibling) thumbs
// strip together so a single Embla pair drives both.
function PrizeImageGallery({
  images,
  cardBorderColor,
  cardGlowColor,
  cardClassName,
  cardStyle,
  specsButton,
  thumbsRowClassName,
  thumbSizeClassName,
  thumbContainerGap,
  thumbsSizesAttr,
  mainSizesAttr,
  mainAspectClassName,
  fallbackImage,
}: {
  images: { src: string; alt?: string }[];
  cardBorderColor: string;
  cardGlowColor: string;
  cardClassName: string;
  cardStyle?: React.CSSProperties;
  specsButton?: React.ReactNode;
  thumbsRowClassName?: string;
  thumbSizeClassName: string;
  thumbContainerGap: string;
  thumbsSizesAttr: string;
  mainSizesAttr: string;
  mainAspectClassName: string;
  fallbackImage: { src: string; alt: string };
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const mainOptions = useMemo<EmblaOptionsType>(
    () => ({ loop: false, duration: 25 }),
    []
  );
  const mainPlugins = useMemo(() => [ClassNames()], []);
  const [mainRef, mainApi] = useEmblaCarousel(mainOptions, mainPlugins);

  const thumbsOptions = useMemo<EmblaOptionsType>(
    () => ({ containScroll: "keepSnaps", dragFree: true }),
    []
  );
  const thumbsPlugins = useMemo(() => [ClassNames()], []);
  const [thumbsRef, thumbsApi] = useEmblaCarousel(thumbsOptions, thumbsPlugins);

  const onSelect = useCallback(() => {
    if (!mainApi) return;
    const i = mainApi.selectedScrollSnap();
    setActiveIndex(i);
    setCanScrollPrev(mainApi.canScrollPrev());
    setCanScrollNext(mainApi.canScrollNext());
    thumbsApi?.scrollTo(i);
  }, [mainApi, thumbsApi]);

  useEffect(() => {
    if (!mainApi) return;
    onSelect();
    mainApi.on("select", onSelect);
    mainApi.on("reInit", onSelect);
    return () => {
      mainApi.off("select", onSelect);
      mainApi.off("reInit", onSelect);
    };
  }, [mainApi, onSelect]);

  const onThumbClick = useCallback(
    (i: number) => mainApi?.scrollTo(i),
    [mainApi]
  );

  const hasMultiple = images.length > 1;

  return (
    <>
      {/* Bordered main card containing main image + VIEW SPECS overlay */}
      <div className={cardClassName} style={cardStyle}>
        {specsButton}
        {hasMultiple ? (
          <>
            <div
              ref={mainRef}
              data-carousel="true"
              style={{ touchAction: "pan-y pinch-zoom" }}
              className="overflow-hidden"
            >
              <div className="flex">
                {images.map((image, index) => (
                  <div
                    key={`${image.src}-${index}`}
                    className="embla__slide flex-[0_0_100%] min-w-0"
                  >
                    <div className={mainAspectClassName}>
                      <Image
                        src={image.src}
                        alt={image.alt || `Prize image ${index + 1}`}
                        fill
                        className="object-contain"
                        priority={index === 0}
                        sizes={mainSizesAttr}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <EmblaCarouselButton
              direction="prev"
              disabled={!canScrollPrev}
              onClick={() => mainApi?.scrollPrev()}
              className="absolute left-2 top-1/2 z-20 -translate-y-1/2 border-white/40"
            />
            <EmblaCarouselButton
              direction="next"
              disabled={!canScrollNext}
              onClick={() => mainApi?.scrollNext()}
              className="absolute right-2 top-1/2 z-20 -translate-y-1/2 border-white/40"
            />
            <EmblaPaginationDots api={mainApi ?? null} active={activeIndex} />
          </>
        ) : (
          <div className={mainAspectClassName}>
            <Image
              src={images[0]?.src || fallbackImage.src}
              alt={images[0]?.alt || fallbackImage.alt}
              fill
              className="object-contain"
              priority
              sizes={mainSizesAttr}
            />
          </div>
        )}
      </div>

      {/* Thumbs strip — sibling of the bordered card */}
      {hasMultiple ? (
        <div className={thumbsRowClassName}>
          <div
            ref={thumbsRef}
            data-carousel="true"
            style={{ touchAction: "pan-y pinch-zoom" }}
            className="overflow-hidden"
          >
            <div className={cn("flex", thumbContainerGap)}>
              {images.map((image, index) => {
                const isActive = activeIndex === index;
                return (
                  <button
                    key={`thumb-${image.src}-${index}`}
                    type="button"
                    onClick={() => onThumbClick(index)}
                    aria-label={`Show image ${index + 1}`}
                    aria-current={isActive}
                    className={cn(
                      "embla__thumb flex-[0_0_auto]",
                      thumbSizeClassName
                    )}
                  >
                    <div
                      className="relative w-full h-full rounded-xl overflow-hidden border-2 transition-[transform,box-shadow,colors] duration-[var(--ta-transition-dur)] cursor-pointer bg-white dark:bg-neutral-900"
                      style={{
                        borderColor: isActive ? cardBorderColor : cardGlowColor,
                      }}
                    >
                      <Image
                        src={image.src}
                        alt={image.alt || `Prize thumbnail ${index + 1}`}
                        fill
                        className="object-contain"
                        sizes={thumbsSizesAttr}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
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

function MajorDrawSectionInner({ className = "" }: MajorDrawSectionProps) {
  const searchParams = useSearchParams();
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [isSpecsModalOpen, setIsSpecsModalOpen] = useState(false);
  // First-open latch for the click-gated specs-modal chunk (LazyMembershipModal pattern).
  const [specsEverOpened, setSpecsEverOpened] = useState(false);
  if (isSpecsModalOpen && !specsEverOpened) setSpecsEverOpened(true); // render-phase latch (same-component setState is safe)
  // Deep catalog entry for the specs modal — resolved lazily, see the effect below.
  const [specsPrize, setSpecsPrize] = useState<PrizeCatalogEntry | null>(null);
  const [selectedPrizeSlug, setSelectedPrizeSlug] = useState<string | null>(null);
  const [toolboxType, setToolboxType] = useState<"sidchrome" | "milwaukee" | "kincrome" | "cash">("milwaukee");
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
          : slug.endsWith("-sidchrome")
            ? "sidchrome"
            : slug.endsWith("-kincrome")
              ? "kincrome"
              : slug.endsWith("-milwaukee")
                ? "milwaukee"
                : "milwaukee"
      );
    }
  }, [activeSlug, defaultSlug, selectedPrizeSlug]);

  // Deep spec-sheet data is deliberately NOT in the client prize summaries — resolve the
  // full catalog entry from `@/config/prizes` (its own click-gated chunk, cached after the
  // first open) whenever the specs modal is open for the active prize. Until it lands the
  // modal shows its built-in "Prize information is loading" state.
  const specsSlug = activePrize?.slug;
  useEffect(() => {
    if (!isSpecsModalOpen || !specsSlug) return;
    let cancelled = false;
    // Stale-specs guard: switching prizes then reopening must not flash the previous sheet.
    setSpecsPrize((prev) => (prev && prev.slug !== specsSlug ? null : prev));
    import("@/config/prizes")
      .then(({ getPrizeBySlug }) => {
        if (!cancelled) setSpecsPrize(getPrizeBySlug(specsSlug) ?? null);
      })
      .catch((error) => {
        // Keep the null/loading state — the modal's "Prize information is loading. Please try
        // again in a moment." copy covers it, and reopening re-runs this effect (chunk retry).
        console.error("MajorDrawSection: failed to load deep prize catalog for specs modal", error);
      });
    return () => {
      cancelled = true;
    };
  }, [isSpecsModalOpen, specsSlug]);

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

  const handleToolboxTypeChange = (type: "sidchrome" | "milwaukee" | "kincrome" | "cash") => {
    if (toolboxType === type) return;
    setToolboxType(type);
    const defaultSlugForType =
      type === "cash"
        ? "cash-prize"
        : type === "sidchrome"
          ? "milwaukee-sidchrome"
          : type === "kincrome"
            ? "milwaukee-kincrome"
            : "milwaukee-milwaukee";
    setSelectedPrizeSlug(defaultSlugForType);
  };

  const handlePrizeCardSelect = (slug: string) => {
    if (slug === (selectedPrizeSlug ?? activeSlug ?? defaultSlug)) return;
    setSelectedPrizeSlug(slug);
    setToolboxType(
      slug === "cash-prize"
        ? "cash"
        : slug.endsWith("-sidchrome")
          ? "sidchrome"
          : slug.endsWith("-kincrome")
            ? "kincrome"
            : slug.endsWith("-milwaukee")
              ? "milwaukee"
              : "milwaukee"
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

  // Countdown target — the actual ticking happens inside <MajorDrawCountdownLeaf>
  // below so this parent component does not re-render every second.
  const drawTargetMs = currentMajorDraw?.drawDate
    ? new Date(currentMajorDraw.drawDate).getTime()
    : null;

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
      case "milwaukee-kincrome":
        return "/images/brands/milwaukee.webp";
      case "dewalt-sidchrome":
      case "dewalt-milwaukee":
      case "dewalt-kincrome":
        return "/images/brands/dewalt-black.webp";
      case "makita-sidchrome":
      case "makita-milwaukee":
      case "makita-kincrome":
        return "/images/brands/Makita-red.webp";
      case "ryobi-sidchrome":
      case "ryobi-milwaukee":
      case "ryobi-kincrome":
        return "/images/brands/name/ryobiText.svg";
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
      if (slug === "milwaukee-kincrome") {
        return {
          line1: isMobile ? "Kincrome Toolbox" : "Kincrome",
          line2: isMobile ? "Milwaukee Powertools" : "Milwaukee",
          line3: "$5000 Cash Prize",
        };
      }
      if (slug === "dewalt-kincrome") {
        return {
          line1: isMobile ? "Kincrome Toolbox" : "Kincrome",
          line2: isMobile ? "DeWalt Powertools" : "DeWalt",
          line3: "$5000 Cash Prize",
        };
      }
      if (slug === "makita-kincrome") {
        return {
          line1: isMobile ? "Kincrome Toolbox" : "Kincrome",
          line2: isMobile ? "Makita Powertools" : "Makita",
          line3: "$5000 Cash Prize",
        };
      }
      if (slug === "ryobi-kincrome") {
        return {
          line1: isMobile ? "Kincrome Toolbox" : "Kincrome",
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

  const _getToolboxTypeFromSlug = (slug: string): "sidchrome" | "milwaukee" | "kincrome" | "cash" => {
    if (slug === "cash-prize") return "cash";
    const lower = slug.toLowerCase();
    if (lower.endsWith("-sidchrome")) return "sidchrome";
    if (lower.endsWith("-kincrome")) return "kincrome";
    if (lower.endsWith("-milwaukee")) return "milwaukee";
    return "sidchrome";
  };

  const filterPrizesByToolboxType = (
    prizeList: PrizeSummary[],
    toolboxType: "sidchrome" | "milwaukee" | "kincrome" | "cash"
  ): PrizeSummary[] => {
    if (toolboxType === "cash") {
      return prizeList.filter((p) => p.slug === "cash-prize");
    }
    if (toolboxType === "sidchrome") {
      return prizeList.filter((p) => p.slug.endsWith("-sidchrome"));
    }
    if (toolboxType === "kincrome") {
      return prizeList.filter((p) => p.slug.endsWith("-kincrome"));
    }
    if (toolboxType === "milwaukee") {
      return prizeList.filter((p) => p.slug.endsWith("-milwaukee"));
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
          Pick Your Power Toolset / Storage System
        </p>
        {/* Toolbox type toggle - clickable, updates content only (no URL nav) */}
        <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-4 sm:mb-6">
          {(["milwaukee", "kincrome", "sidchrome", "cash"] as const).map((type) => {
            const isActive = toolboxType === type;
            const label =
              type === "sidchrome"
                ? "356 PIECE SIDCHROME TOOLBOX"
                : type === "milwaukee"
                  ? "MONSTER MILWAUKEE TOOLBOX"
                  : type === "kincrome"
                    ? "470 PIECE KINCROME TOOLBOX"
                    : "$10,000 Cash";
            return (
              <button
                key={type}
                type="button"
                onClick={() => handleToolboxTypeChange(type)}
                suppressHydrationWarning
                className={`px-4 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl font-semibold text-xs sm:text-sm transition-[colors,transform,box-shadow] duration-[var(--ta-transition-dur)] border-2 ${
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
                      className={`relative w-full p-5 rounded-2xl border-2 transition-[transform,box-shadow,colors] duration-[var(--ta-transition-dur)] text-center overflow-visible min-h-[110px] cursor-pointer ${
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
                            unoptimized
                            className="object-contain opacity-20"
                            sizes="(max-width: 640px) 100px, 150px"
                          />
                        </div>
                      )}
                      {isActive && (
                        <div className="absolute -top-2.5 -right-2.5 w-7 h-7 bg-white dark:bg-neutral-800 rounded-full flex items-center justify-center shadow-xl z-10 ring-2 ring-white/50 dark:ring-neutral-600/50">
                          <Check className={cn("w-4 h-4", pc.checkmarkColor)} />
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
                      className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-white/90 hover:bg-white dark:bg-neutral-800/95 dark:hover:bg-neutral-800 rounded-full shadow-lg flex items-center justify-center border-2 border-gray-300 hover:border-gray-400 dark:border-neutral-600 dark:hover:border-neutral-500 transition-[colors,transform] duration-[var(--ta-transition-dur)]"
                      aria-label="Previous prize"
                    >
                      <ChevronLeft className="w-6 h-6 text-gray-700 dark:text-neutral-200" />
                    </button>
                    <button
                      type="button"
                      onClick={handleNextPrize}
                      suppressHydrationWarning
                      className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-white/90 hover:bg-white dark:bg-neutral-800/95 dark:hover:bg-neutral-800 rounded-full shadow-lg flex items-center justify-center border-2 border-gray-300 hover:border-gray-400 dark:border-neutral-600 dark:hover:border-neutral-500 transition-[colors,transform] duration-[var(--ta-transition-dur)]"
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
                className={cn("grid", filteredPrizes.length === 3 ? "grid-cols-3" : "grid-cols-2", "gap-4 max-w-5xl mx-auto overflow-visible")}
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
                      className={`relative p-5 rounded-2xl border-2 transition-[transform,box-shadow,colors] duration-[var(--ta-transition-dur)] text-center overflow-visible min-h-[110px] cursor-pointer ${
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
                            unoptimized
                            className="object-contain opacity-20"
                            sizes="(max-width: 640px) 100px, 150px"
                          />
                        </div>
                      )}
                      {isActive && (
                        <div className="absolute -top-2.5 -right-2.5 w-7 h-7 bg-white dark:bg-neutral-800 rounded-full flex items-center justify-center shadow-xl z-10 ring-2 ring-white/50 dark:ring-neutral-600/50">
                          <Check className={cn("w-4 h-4", pc.checkmarkColor)} />
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
                  <Check className={cn("w-4 h-4", pc.checkmarkColor)} />
                </div>
              )}
              <div className="relative z-10">
                <div className={cn("text-base font-bold font-['Poppins'] leading-tight break-words text-center", isActive ? "text-white" : "text-gray-900 dark:text-neutral-100")}>
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
    <div className={cn(gridClasses, "overflow-hidden")}>
      {resolvedHighlights.map((highlight, index) => {
        const Icon = resolveHighlightIcon(highlight.icon);
        return (
          <div
            key={`${highlight.title}-${index}`}
            className="relative flex items-start gap-2 sm:gap-4 p-2.5 sm:p-4 bg-gradient-to-br from-gray-900 via-gray-800 to-black backdrop-blur-[var(--ta-blur)] rounded-xl sm:rounded-2xl border border-gray-700 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
          >
            <div
              className={`relative w-7 h-7 sm:w-12 sm:h-12 flex-shrink-0 bg-gradient-to-br ${
                brandColors.gradient
              } rounded-lg sm:rounded-xl flex items-center justify-center border-2 ${brandColors.borderColor
                .replace("border-", "border-")
                .replace("-500", "-400/30")} shadow-lg z-10`}
            >
              <Icon className={cn("w-3.5 h-3.5 sm:w-5 sm:h-5", brandColors.textColor)} />
            </div>
            <div className="flex-1 min-w-0 relative z-10">
              <h3 className="text-xs sm:text-lg font-bold text-white font-['Poppins'] mb-0.5 sm:mb-1 drop-shadow-md leading-tight line-clamp-2 sm:line-clamp-none">
                {highlight.title}
              </h3>
              <p className="text-2xs sm:text-sm text-gray-300 font-['Inter'] leading-tight sm:leading-relaxed hidden lg:block">
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
      <section className={cn("relative py-8 sm:py-12 w-full overflow-visible", className)}>
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
                  sizes="(max-width: 768px) 100vw, 1024px"
                />
              </div>
              {renderPickYourToolset()}
              <PrizeImageGallery
                images={prizeImages}
                cardBorderColor={getBrandBorderColor(activePrizeSlug as PrizeSlug)}
                cardGlowColor={getBrandGlowColor(activePrizeSlug as PrizeSlug)}
                cardClassName="relative w-full max-w-sm mx-auto rounded-2xl border-2 overflow-hidden bg-white dark:bg-neutral-900"
                cardStyle={{
                  borderColor: getBrandBorderColor(activePrizeSlug as PrizeSlug),
                  boxShadow: `0 0 20px ${getBrandGlowColor(activePrizeSlug as PrizeSlug)}, 0 8px 32px rgba(0,0,0,0.4)`,
                }}
                specsButton={
                  <div className="absolute top-3 right-3 z-20">
                    <button
                      onClick={() => setIsSpecsModalOpen(true)}
                      className="relative overflow-hidden rounded-full transition-[transform,box-shadow] duration-[var(--ta-transition-dur)] hover:scale-105 group"
                    >
                      <div className={cn("absolute inset-0 bg-gradient-to-br", brandColors.gradient)} />
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
                        <span className={cn("font-bold text-xs", brandColors.textColor, "drop-shadow-lg")}>
                          VIEW SPECS
                        </span>
                      </div>
                    </button>
                  </div>
                }
                mainAspectClassName="relative aspect-square lg:aspect-[4/3] bg-white dark:bg-neutral-900"
                mainSizesAttr="(max-width: 640px) 100vw, 400px"
                thumbSizeClassName="!w-16 !h-16 sm:!w-20 sm:!h-20"
                thumbContainerGap="gap-2"
                thumbsSizesAttr="(max-width: 640px) 64px, 80px"
                fallbackImage={{ src: "/images/grand-draw.jpg", alt: "Prize image" }}
              />

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
                      className="bg-white/20 backdrop-blur-[var(--ta-blur)] rounded-2xl p-3 text-center border border-white/30"
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
                    <div className="bg-white/10 backdrop-blur-[var(--ta-blur)] rounded-xl p-2 sm:p-3 border border-white/20">
                      <div className="text-white font-semibold text-xs sm:text-sm uppercase tracking-wide">
                        Entry Period Closed
                      </div>
                      <div className="text-white/80 text-2xs sm:text-xs mt-1">
                        {nextDrawName
                          ? `No new entries accepted for this draw. Entries will go to the next draw: ${nextDrawName}`
                          : "No new entries accepted for this draw. Entries will go to the next draw."}
                      </div>
                    </div>
                  </div>
                )}

                {drawTargetMs !== null && (
                  <MajorDrawCountdownLeaf
                    targetMs={drawTargetMs}
                    render={(timeLeft) => (
                      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                        <div className="bg-white/10 backdrop-blur-[var(--ta-blur)] rounded-2xl p-2 sm:p-3 text-center border border-white/20">
                          <div className="text-lg sm:text-2xl font-bold text-white">
                            {String(timeLeft.days).padStart(2, "0")}
                          </div>
                          <div className="text-2xs sm:text-[12px] text-white/80 font-medium">Days</div>
                        </div>
                        <div className="bg-white/10 backdrop-blur-[var(--ta-blur)] rounded-2xl p-2 sm:p-3 text-center border border-white/20">
                          <div className="text-lg sm:text-2xl font-bold text-white">
                            {String(timeLeft.hours).padStart(2, "0")}
                          </div>
                          <div className="text-2xs sm:text-[12px] text-white/80 font-medium">Hours</div>
                        </div>
                        <div className="bg-white/10 backdrop-blur-[var(--ta-blur)] rounded-2xl p-2 sm:p-3 text-center border border-white/20">
                          <div className="text-lg sm:text-2xl font-bold text-white">
                            {String(timeLeft.minutes).padStart(2, "0")}
                          </div>
                          <div className="text-2xs sm:text-[12px] text-white/80 font-medium">Mins</div>
                        </div>
                        <div className="bg-white/10 backdrop-blur-[var(--ta-blur)] rounded-2xl p-2 sm:p-3 text-center border border-white/20">
                          <div className="text-lg sm:text-2xl font-bold text-white">
                            {String(timeLeft.seconds).padStart(2, "0")}
                          </div>
                          <div className="text-2xs sm:text-[12px] text-white/80 font-medium">Secs</div>
                        </div>
                      </div>
                    )}
                  />
                )}

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
                <div className="bg-white/10 backdrop-blur-[var(--ta-blur)] rounded-2xl p-4 text-center border border-white/20 space-y-4">
                  <div className="text-[24px] font-bold text-white uppercase tracking-wide">Draw Ended</div>
                  <a
                    href="https://www.facebook.com/toolsaust"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold text-[14px] transition-[colors,box-shadow] duration-[var(--ta-transition-dur)] shadow-lg hover:shadow-xl w-full"
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
                <div className="bg-white/80 backdrop-blur-[var(--ta-blur)] rounded-2xl p-4 border border-red-200 dark:bg-neutral-900/90 dark:border-red-900/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Skeleton width={16} height={16} className="bg-gray-300" rounded />
                      <Skeleton height={14} width={80} className="bg-gray-300" />
                    </div>
                    <Skeleton height={14} width={40} className="bg-gray-300" />
                  </div>
                </div>
              ) : (
                <div className="bg-white/80 backdrop-blur-[var(--ta-blur)] rounded-2xl p-4 border border-red-200 dark:bg-neutral-900/90 dark:border-red-900/50">
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
                            <span className="text-2xs text-green-600 font-medium">+{String(pendingEntries)}</span>
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
                className={cn("promo-hero-cta-button relative w-full overflow-visible rounded-full group", ctaColorScheme.borderGlow, "membership-enter-cta-animation")}
                style={ctaColorScheme.enterNowButtonStyle ?? ctaColorScheme.badgeStyle}
              >
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/20 via-transparent to-transparent" />
                <div className={cn("relative z-10 flex items-center justify-center gap-2 px-6 py-3 rounded-full", ctaColorScheme.enterNowButtonTextClass ?? (ctaColorScheme.textGradientStyle ? "" : "text-white"))}>
                  <Zap className="w-5 h-5" style={ctaColorScheme.textGradientStyle ? undefined : { color: "white" }} />
                  <span className="font-bold text-base drop-shadow-lg" style={ctaColorScheme.textGradientStyle ?? undefined}>
                    {primaryCtaLabel}
                  </span>
                </div>
              </button>

              <div className="w-full">
                <Image
                  src="/images/safe-checkout-stripe.webp"
                  alt="Guaranteed safe & secure checkout powered by Stripe"
                  width={600}
                  height={160}
                  className="w-full h-auto"
                  sizes="(max-width: 1024px) 100vw, 50vw"
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
                  sizes="(max-width: 768px) 100vw, 1024px"
                />
              </div>
              {renderPickYourToolset("desktop")}
            </div>
            {/* Left Column - Gallery & Countdown */}
            <div className="flex flex-col space-y-6">
              <PrizeImageGallery
                images={prizeImages}
                cardBorderColor={getBrandBorderColor(activePrizeSlug as PrizeSlug)}
                cardGlowColor={getBrandGlowColor(activePrizeSlug as PrizeSlug)}
                cardClassName="relative rounded-2xl border-2 overflow-hidden bg-white dark:bg-neutral-900"
                cardStyle={{
                  borderColor: getBrandBorderColor(activePrizeSlug as PrizeSlug),
                  boxShadow: `0 0 20px ${getBrandGlowColor(activePrizeSlug as PrizeSlug)}, 0 8px 32px rgba(0,0,0,0.4)`,
                }}
                specsButton={
                  <div className="absolute top-4 right-4 z-20">
                    <button
                      onClick={() => setIsSpecsModalOpen(true)}
                      className="relative overflow-hidden rounded-full transition-[transform,box-shadow] duration-[var(--ta-transition-dur)] hover:scale-105 group"
                      suppressHydrationWarning
                    >
                      <div className={cn("absolute inset-0 bg-gradient-to-br", brandColors.gradient)} />
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
                          className={cn(
                            "font-bold text-xs sm:text-sm",
                            brandColors.textColor,
                            "drop-shadow-lg whitespace-nowrap"
                          )}
                        >
                          VIEW SPECS
                        </span>
                      </div>
                    </button>
                  </div>
                }
                mainAspectClassName="relative aspect-square lg:aspect-[4/3] bg-white dark:bg-neutral-900"
                mainSizesAttr="(min-width: 1024px) 50vw, 100vw"
                thumbsRowClassName="overflow-hidden"
                thumbSizeClassName="!w-20 !h-20 xl:!w-24 xl:!h-24"
                thumbContainerGap="gap-3"
                thumbsSizesAttr="(min-width: 1280px) 96px, 80px"
                fallbackImage={{ src: "/images/grand-draw.jpg", alt: "Prize image" }}
              />

              {/* Countdown / Draw Ended Notice */}
              {majorDrawLoading || !currentMajorDraw ? (
                // Skeleton loader for countdown (desktop)
                <div className="rounded-3xl p-6 shadow-2xl border border-white/10 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-neutral-800 dark:to-neutral-900">
                  <div className="grid grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="bg-white/20 backdrop-blur-[var(--ta-blur)] rounded-2xl p-4 text-center border border-white/30"
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
                      <div className="bg-white/10 backdrop-blur-[var(--ta-blur)] rounded-xl p-2 sm:p-3 border border-white/20">
                        <div className="text-white font-semibold text-xs sm:text-sm uppercase tracking-wide">
                          Entry Period Closed
                        </div>
                        <div className="text-white/80 text-2xs sm:text-xs mt-1">
                          {nextDrawName
                            ? `No new entries accepted for this draw. Entries will go to the next draw: ${nextDrawName}`
                            : "No new entries accepted for this draw. Entries will go to the next draw."}
                        </div>
                      </div>
                    </div>
                  )}

                  {drawTargetMs !== null && (
                    <MajorDrawCountdownLeaf
                      targetMs={drawTargetMs}
                      render={(timeLeft) => (
                        <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                          {[
                            { label: "Days", value: timeLeft.days },
                            { label: "Hours", value: timeLeft.hours },
                            { label: "Mins", value: timeLeft.minutes },
                            { label: "Secs", value: timeLeft.seconds },
                          ].map((item) => (
                            <div
                              key={item.label}
                              className="bg-white/10 backdrop-blur-[var(--ta-blur)] rounded-2xl p-2 sm:p-3 text-center border border-white/20"
                            >
                              <div className="text-lg sm:text-2xl font-bold text-white font-['Poppins']">
                                {String(item.value).padStart(2, "0")}
                              </div>
                              <div className="text-2xs sm:text-[12px] text-white/80 font-medium">{item.label}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    />
                  )}

                </div>
              ) : !isCompleted ? (
                <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-black rounded-3xl p-6 shadow-2xl border border-white/10 text-center">
                  <p className="text-white text-sm font-semibold uppercase tracking-[0.35em]">Draw Date</p>
                  <p className="text-white text-3xl font-bold mt-2">{drawDateLabel}</p>
                </div>
              ) : (
                <div className="w-full bg-gradient-to-br from-gray-900 via-gray-800 to-black rounded-3xl p-6 shadow-2xl border border-white/10">
                  <div className="bg-white/10 backdrop-blur-[var(--ta-blur)] rounded-2xl p-6 text-center border border-white/20 space-y-4">
                    <div className="text-3xl font-bold text-white uppercase tracking-wide">Draw Ended</div>
                    <a
                      href="https://www.facebook.com/toolsaust"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl font-semibold text-base transition-[colors,box-shadow] duration-[var(--ta-transition-dur)] shadow-lg hover:shadow-xl w-full"
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
                      className={cn("text-4xl font-bold", brandColors.textColor, "font-['Poppins'] leading-tight drop-shadow-lg")}
                    >
                      {majorDraw?.name || activePrize?.heroHeading || "Major Draw"}
                    </h2>
                  </div>
                 
                </div>

                {resolvedHighlights.length > 0 && <div>{renderHighlights("grid grid-cols-2 gap-4")}</div>}

                <div className="w-full">
                  <Image
                    src="/images/safe-checkout-stripe.webp"
                    alt="Guaranteed safe & secure checkout powered by Stripe"
                    width={600}
                    height={160}
                    className="w-full h-auto"
                    sizes="(max-width: 1024px) 100vw, 50vw"
                  />
                </div>
              </div>

              {user ? (
                userStatsLoading ? (
                  // Skeleton loader for user entries (desktop)
                  <div className="bg-white/90 backdrop-blur-[var(--ta-blur)] rounded-2xl p-5 border border-red-100 shadow-inner dark:bg-neutral-900/90 dark:border-red-900/45">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Skeleton width={16} height={16} className="bg-gray-300" rounded />
                        <Skeleton height={14} width={100} className="bg-gray-300" />
                      </div>
                      <Skeleton height={18} width={50} className="bg-gray-300" />
                    </div>
                  </div>
                ) : (
                  <div className="bg-white/90 backdrop-blur-[var(--ta-blur)] rounded-2xl p-5 border border-red-100 shadow-inner dark:bg-neutral-900/90 dark:border-red-900/45">
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
                  className={cn("promo-hero-cta-button relative w-full overflow-visible rounded-full group", ctaColorScheme.borderGlow, "membership-enter-cta-animation")}
                  style={ctaColorScheme.enterNowButtonStyle ?? ctaColorScheme.badgeStyle}
                >
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/20 via-transparent to-transparent" />
                  <div className={cn("relative z-10 flex items-center justify-center gap-2 px-6 py-3 rounded-full", ctaColorScheme.enterNowButtonTextClass ?? (ctaColorScheme.textGradientStyle ? "" : "text-white"))}>
                    <Zap className="w-5 h-5" style={ctaColorScheme.textGradientStyle ? undefined : { color: "white" }} />
                    <span className="font-bold text-lg drop-shadow-lg" style={ctaColorScheme.textGradientStyle ?? undefined}>
                      {primaryCtaLabel}
                    </span>
                  </div>
                </button>

                <div className="w-full">
                  <Image
                    src="/images/safe-checkout-stripe.webp"
                    alt="Guaranteed safe & secure checkout powered by Stripe"
                    width={600}
                    height={160}
                    className="w-full h-auto"
                    sizes="(max-width: 1024px) 100vw, 50vw"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {specsEverOpened && (
        <PrizeSpecificationsModal
          isOpen={isSpecsModalOpen}
          onClose={() => setIsSpecsModalOpen(false)}
          prize={specsPrize}
        />
      )}

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

// Suspense self-wrap: useSearchParams requires a boundary for prerendered (marketing-class) pages — docs/security-csp/rules.md R8.
export default function MajorDrawSection(props: MajorDrawSectionProps) {
  return (
    <Suspense fallback={null}>
      <MajorDrawSectionInner {...props} />
    </Suspense>
  );
}
