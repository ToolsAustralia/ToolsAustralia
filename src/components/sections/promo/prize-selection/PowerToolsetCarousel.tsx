"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PrizeCatalogEntry } from "@/config/prizes";
import { getBrandGlowColor } from "@/utils/prize-brand-colors";
import { getPackageColorScheme, getToolsetBadgeStyle } from "@/utils/package-colors/packageColorScheme";
import { POWERSET_IMAGES, POWERSET_LABELS, POWERSET_BRAND_TEXT } from "./constants";
import { getToolsetFromSlug } from "./utils";
import type { PrizeSlug } from "@/config/prizes";
import { cn } from "@/utils/cn";
import { useDeviceProfile } from "@/hooks/useDeviceProfile";
import { useInViewportAnimation } from "@/hooks/useInViewportAnimation";

interface PowerToolsetCarouselProps {
  /** All toolset options for the current toolbox type */
  prizes: PrizeCatalogEntry[];
  /** Slug of the currently selected/active prize */
  activeSlug: string | null;
  /** Called when user selects a toolset */
  onSelect: (slug: string) => void;
  /** Optional className for the container */
  className?: string;
}

const sideItemVariants = {
  hidden: ({ i: _i, fromLeft }: { i: number; fromLeft: boolean }) => ({
    opacity: 0,
    x: fromLeft ? -24 : 24,
    scale: 0.88,
  }),
  visible: ({ i }: { i: number }) => ({
    opacity: 0.55,
    filter: "brightness(1.2) saturate(0.75)",
    x: 0,
    scale: 1,
    transition: {
      type: "spring" as const,
      stiffness: 350,
      damping: 24,
      delay: i * 0.06,
    },
  }),
  hover: {
    opacity: 0.95,
    filter: "brightness(1) saturate(1)",
    scale: 1.08,
    transition: { type: "spring" as const, stiffness: 400, damping: 20 },
  },
};

/** Hide native scrollbars but keep touch/hover scroll when overflow-x is scroll (desktop rail fallback). */
const SCROLL_NO_BAR =
  "overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";

const centerVariants = {
  enter: {
    opacity: 0,
    scale: 0.92,
  },
  center: {
    opacity: 1,
    scale: 1,
    transition: {
      type: "spring" as const,
      stiffness: 300,
      damping: 28,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.2 },
  },
};

/**
 * Power toolset carousel - focused image centered, non-focused split left & right.
 * No container - images only. Modify constants.ts for image paths and sizes.
 */
export function PowerToolsetCarousel({
  prizes,
  activeSlug,
  onSelect,
  className = "",
}: PowerToolsetCarouselProps) {
  const prefersReducedMotion = useReducedMotion();
  const profile = useDeviceProfile();
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInViewportAnimation(rootRef);
  const allowInfiniteAnim = !prefersReducedMotion && profile.tier === "desktop" && inView;

  // When activeSlug is null (e.g. cash-prize), nothing is selected — no fallback to first prize
  const activePrize =
    activeSlug != null
      ? (prizes.find((p) => p.slug === activeSlug) ?? prizes[0])
      : null;
  const activeIndex = activePrize ? prizes.findIndex((p) => p.slug === activePrize.slug) : 0;
  const n = prizes.length;
  /**
   * One item each side, same 3-up as tablet: prev | active | next in prize order
   * (circular for n >= 3). For n === 2, the “other” sits on the opposite side.
   */
  let leftNeighbor: PrizeCatalogEntry | null = null;
  let rightNeighbor: PrizeCatalogEntry | null = null;
  if (activePrize && n >= 2) {
    if (n === 2) {
      if (activeIndex === 0) {
        rightNeighbor = prizes[1] ?? null;
      } else {
        leftNeighbor = prizes[0] ?? null;
      }
    } else {
      leftNeighbor = prizes[(activeIndex - 1 + n) % n] ?? null;
      rightNeighbor = prizes[(activeIndex + 1) % n] ?? null;
    }
  }
  // Second neighbours each side — only when there are 5+ toolsets (at n<=4 the i±2 indices
  // collide/duplicate). Shown on sm+ so the carousel fills out to a 5-up (2 | active | 2) on
  // desktop now there are 5 brands; mobile stays 3-up to avoid overflow.
  const leftNeighbor2 = activePrize && n >= 5 ? (prizes[(activeIndex - 2 + n) % n] ?? null) : null;
  const rightNeighbor2 = activePrize && n >= 5 ? (prizes[(activeIndex + 2) % n] ?? null) : null;

  const activeToolset = activePrize ? getToolsetFromSlug(activePrize.slug) : null;
  const activeImgSrc = activeToolset ? POWERSET_IMAGES[activeToolset] : null;

  const glowColor = activeSlug != null ? getBrandGlowColor(activeSlug as PrizeSlug) : "transparent";

  const getToolsetColorKey = (toolset: string) => {
    if (toolset === "milwaukee") return "milwaukee-red";
    if (toolset === "dewalt") return "dewalt-yellow";
    if (toolset === "makita") return "makita-teal";
    if (toolset === "ryobi") return "ryobi-green";
    if (toolset === "hikoki") return "hikoki-green";
    return "milwaukee-red";
  };

  const canStepPrize = activePrize && n > 1;
  const prevPrizeSlug = canStepPrize ? prizes[(activeIndex - 1 + n) % n].slug : null;
  const nextPrizeSlug = canStepPrize ? prizes[(activeIndex + 1) % n].slug : null;
  /** 3 toolsets are already visible; step buttons only when a 4+ prize is off-screen. */
  const showStepButtons = n > 3;

  const renderActiveCenter = (outerClass: string, frameClass: string) => (
    <div className={outerClass}>
      <motion.div
        className="absolute inset-0 -m-8 rounded-3xl blur-3xl pointer-events-none"
        animate={
          allowInfiniteAnim
            ? {
                opacity: [0.4, 0.6, 0.4],
                scale: [1, 1.02, 1],
              }
            : { opacity: 0.5, scale: 1 }
        }
        transition={
          allowInfiniteAnim
            ? {
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut",
              }
            : {}
        }
        style={{
          background: `radial-gradient(ellipse 80% 70% at 50% 50%, ${glowColor}, transparent 70%)`,
        }}
      />

      {activeImgSrc && (
        <motion.div
          layout
          layoutDependency={activeSlug ?? ""}
          className={frameClass}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSlug ?? activeImgSrc}
              variants={centerVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="relative w-full h-full"
            >
              <motion.div
                animate={allowInfiniteAnim ? { y: [0, -6, 0] } : { y: 0 }}
                transition={
                  allowInfiniteAnim
                    ? {
                        y: {
                          duration: 4,
                          repeat: Infinity,
                          ease: "easeInOut",
                        },
                      }
                    : {}
                }
                className="relative w-full h-full"
              >
                <div className="absolute inset-0">
                  <Image
                    src={activeImgSrc}
                    alt={activePrize?.label ?? "Selected power toolset"}
                    fill
                    className="object-contain drop-shadow-2xl"
                    sizes="(max-width: 640px) min(68vw, 17rem), (max-width: 1024px) 360px, (max-width: 1280px) 440px, 500px"
                    priority
                  />
                </div>
                {activeToolset && POWERSET_LABELS[activeToolset] && (() => {
                  const scheme = getPackageColorScheme(getToolsetColorKey(activeToolset));
                  const badgeStyle = getToolsetBadgeStyle(activeToolset);
                  return (
                    <div className="absolute bottom-0 left-0 right-0 z-10 flex justify-center pointer-events-none px-1.5 sm:px-2">
                      <div
                        className="w-fit max-w-full rounded-xl px-2.5 py-1.5 shadow-xl backdrop-blur-md sm:px-4 sm:py-2.5"
                        style={{
                          background: badgeStyle.background,
                          boxShadow: badgeStyle.boxShadow,
                          border: badgeStyle.border,
                        }}
                      >
                        <p
                          className={cn("max-w-[min(100%,18rem)] whitespace-normal font-sans text-center text-3xs font-extrabold font-bold leading-snug line-clamp-2 sm:max-w-none sm:text-xs sm:leading-tight lg:text-sm", scheme.buttonText)}
                        >
                          {POWERSET_LABELS[activeToolset]} + $5000 CASH
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );

  const renderSideImage = (
    prizeOption: PrizeCatalogEntry,
    index: number,
    fromLeft: boolean,
    /** Wider "peek" cards when flanking the active toolset; grid uses compact tiles */
    layout: "grid" | "selectedRail" = "grid"
  ) => {
    const toolset = getToolsetFromSlug(prizeOption.slug);
    const imgSrc = toolset ? POWERSET_IMAGES[toolset] : null;
    const label = toolset ? POWERSET_LABELS[toolset] : null;
    const brandLogo = toolset ? POWERSET_BRAND_TEXT[toolset] : null;
    if (!imgSrc) return null;
    const scheme = toolset ? getPackageColorScheme(getToolsetColorKey(toolset)) : null;
    const badgeStyle = toolset ? getToolsetBadgeStyle(toolset) : null;
    const shellClass =
      layout === "selectedRail"
        ? // Match tablet: one tile each side, ~half to two-thirds the hero read
          "relative h-32 w-20 min-w-[4.5rem] shrink-0 overflow-visible min-[400px]:w-24 min-[400px]:min-w-[5.5rem] sm:h-32 sm:min-w-[6rem] sm:w-24 md:h-36 md:w-28 lg:h-40 lg:w-32 xl:h-44 xl:w-36"
        : "relative h-28 w-[5.5rem] shrink-0 overflow-visible sm:h-40 sm:w-32 lg:h-44 lg:w-36 xl:h-48 xl:w-40";
    return (
      <motion.div
        key={prizeOption.slug}
        custom={{ i: index, fromLeft }}
        variants={sideItemVariants}
        initial="hidden"
        animate="visible"
        whileHover="hover"
        className={shellClass}
      >
        {brandLogo && (
            <div
              className="absolute top-1 left-1/2 -translate-x-1/2 z-20 h-5 w-16 sm:h-6 sm:w-20 lg:h-7 lg:w-24 pointer-events-none"
            >
            <Image
              src={brandLogo}
              alt={toolset ?? ""}
              fill
              unoptimized
              className="object-contain"
              sizes="64px"
            />
          </div>
        )}
        <motion.button
          type="button"
          onClick={() => onSelect(prizeOption.slug)}
          className="relative h-full w-full cursor-pointer overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2"
        >
          <div className="absolute inset-0">
            <Image
              src={imgSrc}
              alt={prizeOption.label}
              fill
              className="object-contain"
              sizes="(max-width: 640px) 120px, (max-width: 1024px) 180px, 220px"
            />
          </div>
          {label && scheme && badgeStyle && (
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 z-10 w-[95%] pointer-events-none"
          >
            <div
              className="rounded-xl backdrop-blur-md px-1.5 py-0.5 sm:px-2 sm:py-1 shadow-lg"
              style={{
                background: badgeStyle.background,
                boxShadow: badgeStyle.boxShadow,
                border: badgeStyle.border,
              }}
            >
              <p className={cn("font-sans font-extrabold font-bold text-3xs sm:text-3xs lg:text-2xs leading-tight text-center line-clamp-2 break-words hyphens-auto", scheme.buttonText)}>
                {label} + $5000 CASH
              </p>
            </div>
          </div>
        )}
        </motion.button>
      </motion.div>
    );
  };

  return (
    <div ref={rootRef} className={cn("flex flex-col items-center gap-2 sm:gap-3", className)}>
      {/* Carousel label - brand logo for active toolset */}
      {activeToolset && POWERSET_BRAND_TEXT[activeToolset] && (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeToolset}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.2 }}
            className="relative h-8 w-40 sm:h-10 sm:w-52 lg:h-12 lg:w-60"
          >
            <Image
              src={POWERSET_BRAND_TEXT[activeToolset]}
              alt={activeToolset}
              fill
              unoptimized
              className="object-contain"
              sizes="(max-width: 640px) 160px, (max-width: 1024px) 208px, 240px"
            />
          </motion.div>
        </AnimatePresence>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className={
          activeSlug != null
            ? "w-full max-w-[100rem] mx-auto overflow-visible"
            : "flex items-center w-full max-w-[100rem] mx-auto justify-center overflow-visible px-1 sm:px-2"
        }
        role="group"
        aria-label="Select power toolset"
      >
      {/* When nothing selected (e.g. cash-prize): single row of all toolsets, no center gap */}
      {activeSlug == null ? (
        <div
          className={
            prizes.length === 4
              ? // 2×2 on narrow phones; one row from md when four tiles fit; avoids 3+1 from flex-wrap
                "grid w-full grid-cols-2 place-items-center gap-x-6 gap-y-10 px-2 pt-7 sm:gap-x-10 sm:gap-y-12 sm:pt-9 sm:px-4 md:grid-cols-4 md:gap-x-10 md:gap-y-8 md:pt-8 lg:gap-x-16 xl:gap-x-20"
              : "flex flex-wrap items-start justify-center gap-5 sm:gap-8 pt-6 sm:pt-7"
          }
        >
          {prizes.map((prize, i) => renderSideImage(prize, i, true))}
        </div>
      ) : (
        <>
          {n === 1 && activePrize ? (
            <div className="flex w-full justify-center overflow-x-hidden overflow-y-hidden pt-4 sm:pt-6 md:pt-8">
              {renderActiveCenter(
                "relative z-[1] flex w-full min-w-0 max-w-[min(100%,420px)] items-center justify-center px-2",
                "relative mx-auto w-full max-w-[min(100%,420px)] sm:mx-0 sm:h-[260px] sm:w-[340px] sm:min-h-0 sm:max-w-none md:h-[280px] md:w-[380px] lg:h-[290px] lg:w-[400px] xl:h-[310px] xl:w-[440px]"
              )}
            </div>
          ) : (
            <div className="relative w-full overflow-x-hidden overflow-y-hidden pt-4 sm:pt-6 md:pt-8">
              {/*
                Single 3-up row: left neighbor | active | right neighbor (circular for n &gt;= 3).
                Step chevrons only when a 4+ prize is off the strip (n &gt; 3).
              */}
              {showStepButtons && prevPrizeSlug && (
                <button
                  type="button"
                  onClick={() => onSelect(prevPrizeSlug)}
                  className="absolute left-0 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/15 bg-black/50 p-1.5 text-white shadow-md backdrop-blur-sm transition hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                  aria-label="Previous power toolset"
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden />
                </button>
              )}
              {showStepButtons && nextPrizeSlug && (
                <button
                  type="button"
                  onClick={() => onSelect(nextPrizeSlug)}
                  className="absolute right-0 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/15 bg-black/50 p-1.5 text-white shadow-md backdrop-blur-sm transition hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                  aria-label="Next power toolset"
                >
                  <ChevronRight className="h-5 w-5" aria-hidden />
                </button>
              )}

              <div
                className={cn("mx-auto flex w-full min-w-0 max-w-6xl items-center justify-center gap-1 pt-0 sm:gap-2 md:gap-4 lg:gap-6", showStepButtons ? "sm:px-10" : "px-1 sm:px-2")}
              >
                <div
                  className={`flex min-h-0 min-w-0 flex-1 items-center justify-end gap-1 self-center sm:gap-2 md:gap-4 lg:gap-6 ${
                    leftNeighbor ? "overflow-visible" : "justify-end"
                  } ${SCROLL_NO_BAR}`}
                >
                  {leftNeighbor2 && (
                    <div className="hidden shrink-0 sm:block">{renderSideImage(leftNeighbor2, 1, true, "selectedRail")}</div>
                  )}
                  {leftNeighbor ? (
                    renderSideImage(leftNeighbor, 0, true, "selectedRail")
                  ) : (
                    <div
                      className="h-32 w-20 min-w-[4.5rem] min-[400px]:w-24 min-[400px]:min-w-[5.5rem] shrink-0 sm:min-w-[6rem] sm:w-24"
                      aria-hidden
                    />
                  )}
                </div>

                {renderActiveCenter(
                  "relative z-[1] flex w-full min-w-0 max-w-[min(68vw,17rem)] shrink-0 grow-0 items-center justify-center self-center sm:max-w-[min(100%,400px)]",
                  "relative mx-auto h-[min(32vw,9.5rem)] min-h-[8.5rem] w-full max-w-[min(68vw,17rem)] sm:mx-0 sm:h-[260px] sm:min-h-0 sm:max-w-[400px] sm:w-[320px] md:h-[280px] md:w-[360px] lg:h-[290px] lg:w-[400px] xl:h-[310px] xl:w-[420px]"
                )}

                <div
                  className={`flex min-h-0 min-w-0 flex-1 items-center justify-start gap-1 self-center sm:gap-2 md:gap-4 lg:gap-6 ${
                    rightNeighbor ? "overflow-visible" : "justify-start"
                  } ${SCROLL_NO_BAR}`}
                >
                  {rightNeighbor ? (
                    renderSideImage(rightNeighbor, 0, false, "selectedRail")
                  ) : (
                    <div
                      className="h-32 w-20 min-w-[4.5rem] min-[400px]:w-24 min-[400px]:min-w-[5.5rem] shrink-0 sm:min-w-[6rem] sm:w-24"
                      aria-hidden
                    />
                  )}
                  {rightNeighbor2 && (
                    <div className="hidden shrink-0 sm:block">{renderSideImage(rightNeighbor2, 1, false, "selectedRail")}</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </motion.div>
    </div>
  );
}
