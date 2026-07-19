"use client";

import { useCallback, useEffect, useMemo, useState, useRef, Suspense } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import useEmblaCarousel from "embla-carousel-react";
import { GripVertical } from "lucide-react";
import type { ToolsetLandingSlug } from "@/config/promo-landing-slugs";
import { POWERSET_BRAND_TEXT, POWERSET_IMAGES, POWERSET_LABELS } from "./constants";
import { buildPromotionsToolsetLandingHref } from "./utils";
import { getToolsetBadgeStyle } from "@/utils/package-colors/packageColorScheme";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { SECTION_CONTAINER_CLASSES } from "@/components/ui";
import { addThrottledResize } from "@/utils/dom/listenerHelpers";
import { cn } from "@/utils/cn";

const FROM_PROMO_SLUG_KEY = "tools-aus:from-promo-slug";

/** Fisher-Yates shuffle with seed for deterministic randomness per session */
function shuffleWithSeed<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let m = result.length;
  const seededRandom = (s: number) => {
    const x = Math.sin(s) * 10000;
    return x - Math.floor(x);
  };
  while (m) {
    const i = Math.floor(seededRandom(seed + m) * m);
    m--;
    [result[m], result[i]] = [result[i], result[m]];
  }
  return result;
}

function formatToolsetLabel(slug: ToolsetLandingSlug): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

interface OtherToolsetsCarouselProps {
  /** Slug to store as referrer when user navigates (toolset or evergreen prize slug) */
  referrerSlug: string;
  /** When on a toolset page, exclude this from the list; when undefined (evergreen), show all. */
  currentToolsetSlug?: ToolsetLandingSlug;
  onNavigate?: (targetSlug: ToolsetLandingSlug) => void;
  className?: string;
}

const ALL_TOOLSETS = ["ryobi", "milwaukee", "dewalt", "makita", "hikoki"] as const;

function OtherToolsetsCarouselInner({
  referrerSlug,
  currentToolsetSlug,
  onNavigate,
  className = "",
}: OtherToolsetsCarouselProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const theme = usePromoTheme();
  const otherToolsets = useMemo(
    () =>
      currentToolsetSlug
        ? (ALL_TOOLSETS.filter((s) => s !== currentToolsetSlug) as ToolsetLandingSlug[])
        : ([...ALL_TOOLSETS] as ToolsetLandingSlug[]),
    [currentToolsetSlug]
  );

  const [shuffledToolsets, setShuffledToolsets] = useState<ToolsetLandingSlug[]>(otherToolsets);
  const [isMobile, setIsMobile] = useState(false);
  const shuffleSeedRef = useRef<number | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    return addThrottledResize(check);
  }, []);

  useEffect(() => {
    if (otherToolsets.length === 0) return;
    if (!isMobile) {
      setShuffledToolsets(otherToolsets);
      return;
    }
    if (shuffleSeedRef.current === null) {
      shuffleSeedRef.current =
        typeof crypto !== "undefined" && crypto.getRandomValues
          ? crypto.getRandomValues(new Uint32Array(1))[0]
          : Date.now();
    }
    setShuffledToolsets(shuffleWithSeed([...otherToolsets], shuffleSeedRef.current));
  }, [isMobile, currentToolsetSlug, otherToolsets]);

  const handleClick = useCallback(
    (targetSlug: ToolsetLandingSlug) => {
      try {
        sessionStorage.setItem(FROM_PROMO_SLUG_KEY, referrerSlug);
      } catch {
        // Ignore storage errors
      }
      onNavigate?.(targetSlug);
      const href = buildPromotionsToolsetLandingHref(targetSlug, searchParams);
      router.push(href, { scroll: true });
    },
    [referrerSlug, onNavigate, router, searchParams]
  );

  const displayToolsets = isMobile ? shuffledToolsets : otherToolsets;

  // Endless loop via embla's own cloning — no manual list duplication (clones live at the wrap
  // boundary, so the visible row never shows adjacent repeats). `align: start` keeps the desktop
  // 4-up row left-aligned; on viewports where the slides overflow it scrolls/loops freely.
  const emblaOptions = useMemo(
    () => ({ loop: true, align: "start" as const, dragFree: true, slidesToScroll: 1 }),
    []
  );
  const emblaPlugins = useMemo(() => [], []);
  const [emblaRef, emblaApi] = useEmblaCarousel(emblaOptions, emblaPlugins);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const renderCard = (slug: ToolsetLandingSlug) => {
    const imgSrc = POWERSET_IMAGES[slug];
    const wordmarkSrc = POWERSET_BRAND_TEXT[slug];
    const ariaLabel = POWERSET_LABELS[slug] ?? formatToolsetLabel(slug);
    const badgeStyle = getToolsetBadgeStyle(slug);
    if (!imgSrc) return null;
    return (
      <button
        key={slug}
        type="button"
        onClick={() => handleClick(slug)}
        aria-label={ariaLabel}
        className="relative w-full aspect-[3/4] rounded-xl overflow-hidden border-2 border-gray-200 dark:border-neutral-600 hover:border-gray-300 dark:hover:border-neutral-500 transition-all duration-200 hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-400 bg-white dark:bg-neutral-800 flex-shrink-0 min-w-0"
        style={{ boxShadow: badgeStyle?.boxShadow }}
      >
        <div className="absolute inset-0 flex flex-col">
          {wordmarkSrc && (
            <div className="relative flex-shrink-0 h-8 sm:h-9 lg:h-10 mt-3 mb-1">
              <Image
                src={wordmarkSrc}
                alt={formatToolsetLabel(slug)}
                fill
                unoptimized
                className="object-contain"
                sizes="(max-width: 640px) 140px, 180px"
              />
            </div>
          )}
          <div className="relative flex-1 min-h-0">
            <Image
              src={imgSrc}
              alt=""
              fill
              className="object-contain p-2"
              sizes="(max-width: 640px) 170px, 220px"
            />
          </div>
        </div>
      </button>
    );
  };

  if (displayToolsets.length === 0) return null;

  return (
    <div className={cn("pt-4 sm:pt-8 sm:mt-8 mt-4 border-t border-gray-200 dark:border-neutral-700", className)}>
      <div className={cn(SECTION_CONTAINER_CLASSES, "flex flex-col items-center")}>
        <h3 className="text-center font-sans font-extrabold font-[950] uppercase text-black dark:text-white text-lg sm:text-2xl mb-4 sm:mb-6">
          Explore other toolsets
        </h3>

        <div className="relative w-full max-w-4xl">
          <button
            type="button"
            onClick={scrollPrev}
            aria-label="Previous toolsets"
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 sm:translate-x-0 z-10 w-12 h-12 sm:w-14 sm:h-14 rounded-full hidden sm:flex items-center justify-center bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm border-2 border-gray-200 dark:border-neutral-600 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 group"
          >
            <GripVertical className="w-5 h-5 sm:w-6 sm:h-6 -rotate-90 transition-colors group-hover:opacity-100" style={{ color: theme.primary }} />
          </button>
          <button
            type="button"
            onClick={scrollNext}
            aria-label="Next toolsets"
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 sm:translate-x-0 z-10 w-12 h-12 sm:w-14 sm:h-14 rounded-full hidden sm:flex items-center justify-center bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm border-2 border-gray-200 dark:border-neutral-600 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 group"
          >
            <GripVertical className="w-5 h-5 sm:w-6 sm:h-6 rotate-90 transition-colors group-hover:opacity-100" style={{ color: theme.primary }} />
          </button>

          <div
            className="w-full overflow-hidden touch-pan-x"
            ref={emblaRef}
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <div className="flex items-stretch gap-4 py-1">
              {displayToolsets.map((slug) => (
                <div
                  key={slug}
                  className="shrink-0 min-w-0 basis-[62%] sm:basis-[42%] md:basis-[30%] lg:basis-[23%]"
                >
                  {renderCard(slug)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Suspense self-wrap: useSearchParams requires a boundary for prerendered (marketing-class) pages — docs/security-csp/rules.md R8.
export function OtherToolsetsCarousel(props: OtherToolsetsCarouselProps) {
  return (
    <Suspense fallback={null}>
      <OtherToolsetsCarouselInner {...props} />
    </Suspense>
  );
}
