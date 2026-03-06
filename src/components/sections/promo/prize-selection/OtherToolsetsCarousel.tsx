"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import useEmblaCarousel from "embla-carousel-react";
import { GripVertical } from "lucide-react";
import type { ToolsetLandingSlug } from "@/config/promo-landing-slugs";
import { POWERSET_IMAGES, POWERSET_LABELS } from "./constants";
import {
  getPackageColorScheme,
  getToolsetBadgeStyle,
} from "@/utils/package-colors/packageColorScheme";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { SECTION_CONTAINER_CLASSES } from "@/components/ui";

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

function getToolsetColorKey(toolset: string) {
  if (toolset === "milwaukee") return "milwaukee-red";
  if (toolset === "dewalt") return "dewalt-yellow";
  if (toolset === "makita") return "makita-teal";
  if (toolset === "ryobi") return "ryobi-green";
  return "milwaukee-red";
}

function formatToolsetLabel(slug: ToolsetLandingSlug): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

interface OtherToolsetsCarouselProps {
  currentToolsetSlug: ToolsetLandingSlug;
  onNavigate?: (targetSlug: ToolsetLandingSlug) => void;
  className?: string;
}

const SLIDE_WIDTH = 220;
const SLIDE_GAP = 20;

export function OtherToolsetsCarousel({
  currentToolsetSlug,
  onNavigate,
  className = "",
}: OtherToolsetsCarouselProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const theme = usePromoTheme();
  const otherToolsets = (["ryobi", "milwaukee", "dewalt", "makita"] as const).filter(
    (s) => s !== currentToolsetSlug
  );

  const [shuffledToolsets, setShuffledToolsets] = useState<ToolsetLandingSlug[]>(otherToolsets);
  const [isMobile, setIsMobile] = useState(false);
  const [needsCarousel, setNeedsCarousel] = useState(true);
  const shuffleSeedRef = useRef<number | null>(null);

  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      setIsMobile(w < 640);
      if (w >= 1024) {
        const containerWidth = Math.min(w - 48, 896);
        const totalSlidesWidth = otherToolsets.length * SLIDE_WIDTH + (otherToolsets.length - 1) * SLIDE_GAP;
        setNeedsCarousel(totalSlidesWidth > containerWidth);
      } else {
        setNeedsCarousel(true);
      }
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [otherToolsets.length]);

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
  }, [isMobile, currentToolsetSlug]);

  const handleClick = useCallback(
    (targetSlug: ToolsetLandingSlug) => {
      try {
        sessionStorage.setItem(FROM_PROMO_SLUG_KEY, currentToolsetSlug);
      } catch {
        // Ignore storage errors
      }
      onNavigate?.(targetSlug);
      const affiliateCode = searchParams.get("aff");
      const href = affiliateCode
        ? `/promotions/${targetSlug}?aff=${affiliateCode}`
        : `/promotions/${targetSlug}`;
      router.push(href, { scroll: true });
    },
    [currentToolsetSlug, onNavigate, router, searchParams]
  );

  const displayToolsets = isMobile ? shuffledToolsets : otherToolsets;

  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, align: "center", dragFree: true, slidesToScroll: 1 },
    []
  );

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const renderCard = (slug: ToolsetLandingSlug) => {
    const imgSrc = POWERSET_IMAGES[slug];
    const label = POWERSET_LABELS[slug];
    const scheme = getPackageColorScheme(getToolsetColorKey(slug));
    const badgeStyle = getToolsetBadgeStyle(slug);
    if (!imgSrc) return null;
    return (
      <button
        key={slug}
        type="button"
        onClick={() => handleClick(slug)}
        className="relative w-full aspect-[3/4] rounded-xl overflow-hidden border-2 border-gray-200 dark:border-neutral-600 hover:border-gray-300 dark:hover:border-neutral-500 transition-all duration-200 hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-400 bg-white dark:bg-neutral-800 flex-shrink-0 min-w-0"
        style={{ boxShadow: badgeStyle?.boxShadow }}
      >
        <div className="absolute inset-0 flex flex-col">
          <div className="relative flex-1 min-h-0">
            <Image
              src={imgSrc}
              alt={formatToolsetLabel(slug)}
              fill
              className="object-contain p-2"
              sizes="(max-width: 640px) 170px, 220px"
            />
          </div>
          {label && badgeStyle && (
            <div
              className="flex-shrink-0 p-2 rounded-b-lg"
              style={{ background: badgeStyle.background, borderTop: badgeStyle.border }}
            >
              <p className={`font-agency font-[950] text-base sm:text-sm leading-tight text-center line-clamp-2 ${scheme.buttonText}`}>
                {formatToolsetLabel(slug)}
              </p>
            </div>
          )}
        </div>
      </button>
    );
  };

  if (displayToolsets.length === 0) return null;

  return (
    <div className={`pt-4 sm:pt-8 sm:mt-8 mt-4 border-t border-gray-200 dark:border-neutral-700 ${className}`}>
      <div className={`${SECTION_CONTAINER_CLASSES} flex flex-col items-center`}>
        <h3 className="text-center font-agency font-[950] uppercase text-black dark:text-white text-lg sm:text-2xl mb-4 sm:mb-6">
          Explore other toolsets
        </h3>

        {!needsCarousel ? (
          <div className="flex flex-wrap justify-center gap-4 sm:gap-5 w-full max-w-4xl">
            {displayToolsets.map((slug) => (
              <div key={slug} className="w-[170px] sm:w-[200px] lg:w-[220px]">
                {renderCard(slug)}
              </div>
            ))}
          </div>
        ) : (
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
              className="w-full min-h-[230px] sm:min-h-[220px] touch-pan-x"
              ref={emblaRef}
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <div className="flex items-center gap-3 sm:gap-4 lg:gap-5">
                {/* Leading gap for seamless loop wrap */}
                <div className="w-1 sm:w-2 flex-shrink-0" aria-hidden />
                {/* First set */}
                {displayToolsets.map((slug) => (
                  <div key={`first-${slug}`} className="w-[170px] sm:w-[200px] lg:w-[220px] flex-shrink-0 min-w-0">
                    {renderCard(slug)}
                  </div>
                ))}
                {/* Second set for seamless infinite loop (BrandScroller pattern) */}
                {displayToolsets.map((slug) => (
                  <div key={`second-${slug}`} className="w-[170px] sm:w-[200px] lg:w-[220px] flex-shrink-0 min-w-0">
                    {renderCard(slug)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
