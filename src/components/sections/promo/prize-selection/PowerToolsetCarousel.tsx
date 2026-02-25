"use client";

import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import type { PrizeCatalogEntry } from "@/config/prizes";
import { getBrandGlowColor } from "@/utils/prize-brand-colors";
import { getPackageColorScheme } from "@/utils/package-colors/packageColorScheme";
import { POWERSET_IMAGES, POWERSET_LABELS, POWERSET_BRAND_TEXT } from "./constants";
import { getToolsetFromSlug } from "./utils";
import type { PrizeSlug } from "@/config/prizes";

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
  hidden: ({ i, fromLeft }: { i: number; fromLeft: boolean }) => ({
    opacity: 0,
    x: fromLeft ? -24 : 24,
    scale: 0.88,
  }),
  visible: ({ i }: { i: number }) => ({
    opacity: 0.5,
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
    scale: 1.08,
    transition: { type: "spring" as const, stiffness: 400, damping: 20 },
  },
};

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
  // When activeSlug is null (e.g. cash-prize), nothing is selected — no fallback to first prize
  const activePrize =
    activeSlug != null
      ? (prizes.find((p) => p.slug === activeSlug) ?? prizes[0])
      : null;
  const otherPrizes = prizes.filter((p) => p.slug !== activePrize?.slug);
  const mid = Math.ceil(otherPrizes.length / 2);
  const leftPrizes = otherPrizes.slice(0, mid);
  const rightPrizes = otherPrizes.slice(mid);

  const activeToolset = activePrize ? getToolsetFromSlug(activePrize.slug) : null;
  const activeImgSrc = activeToolset ? POWERSET_IMAGES[activeToolset] : null;

  const glowColor = activeSlug != null ? getBrandGlowColor(activeSlug as PrizeSlug) : "transparent";

  const getToolsetColorKey = (toolset: string) => {
    if (toolset === "milwaukee") return "milwaukee-red";
    if (toolset === "dewalt") return "dewalt-yellow";
    if (toolset === "makita") return "makita-teal";
    return "milwaukee-red";
  };

  const renderSideImage = (
    prizeOption: PrizeCatalogEntry,
    index: number,
    fromLeft: boolean
  ) => {
    const toolset = getToolsetFromSlug(prizeOption.slug);
    const imgSrc = toolset ? POWERSET_IMAGES[toolset] : null;
    const label = toolset ? POWERSET_LABELS[toolset] : null;
    if (!imgSrc) return null;
    const scheme = toolset ? getPackageColorScheme(getToolsetColorKey(toolset)) : null;
    return (
      <motion.button
        key={prizeOption.slug}
        type="button"
        onClick={() => onSelect(prizeOption.slug)}
        custom={{ i: index, fromLeft }}
        variants={sideItemVariants}
        initial="hidden"
        animate="visible"
        whileHover="hover"
        className="relative w-20 h-24 sm:w-28 sm:h-36 flex-shrink-0 cursor-pointer rounded-xl overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-400"
      >
        <div className="absolute inset-0">
          <Image
            src={imgSrc}
            alt={prizeOption.label}
            fill
            className="object-contain"
            sizes="112px"
          />
        </div>
        {label && scheme && (
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-10 w-[95%] pointer-events-none">
            <div
              className="rounded-xl backdrop-blur-md px-1.5 py-0.5 sm:px-2 sm:py-1 shadow-lg"
              style={{
                background: scheme.badgeStyle.background,
                boxShadow: scheme.badgeStyle.boxShadow,
                border: scheme.badgeStyle.border,
              }}
            >
              <p className={`font-agency font-bold text-[7px] sm:text-[8px] lg:text-[10px] leading-tight text-center truncate ${scheme.buttonText}`}>
                {label} · $5000 Cash
              </p>
            </div>
          </div>
        )}
      </motion.button>
    );
  };

  return (
    <div className={`flex flex-col items-center gap-2 sm:gap-3 ${className}`}>
      {/* Carousel label - brand logo for active toolset */}
      {activeToolset && POWERSET_BRAND_TEXT[activeToolset] && (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeToolset}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.2 }}
            className={`relative ${
              activeToolset === "makita"
                ? "h-5 w-24 sm:h-6 sm:w-28 lg:h-7 lg:w-32"
                : "h-8 w-40 sm:h-10 sm:w-52 lg:h-12 lg:w-60"
            }`}
          >
            <Image
              src={POWERSET_BRAND_TEXT[activeToolset]}
              alt={activeToolset}
              fill
              className="object-contain"
              sizes={activeToolset === "makita" ? "(max-width: 640px) 96px, (max-width: 1024px) 112px, 128px" : "(max-width: 640px) 160px, (max-width: 1024px) 208px, 240px"}
            />
          </motion.div>
        </AnimatePresence>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className={`flex items-center w-full max-w-6xl mx-auto overflow-visible ${
          activeSlug != null ? "justify-between gap-1 sm:gap-3 md:gap-6" : "justify-center gap-1 sm:gap-2 md:gap-4 flex-wrap"
        }`}
        role="group"
        aria-label="Select power toolset"
      >
      {/* When nothing selected (e.g. cash-prize): single row of all toolsets, no center gap */}
      {activeSlug == null ? (
        <div className="flex items-center justify-center gap-1 sm:gap-2 md:gap-4 flex-wrap">
          {prizes.map((prize, i) => renderSideImage(prize, i, true))}
        </div>
      ) : (
        <>
          {/* Left - non-focused toolsets */}
          <div className="flex items-center justify-end gap-1 sm:gap-2 md:gap-3 flex-1 min-w-0 overflow-x-auto overflow-y-hidden scrollbar-hide flex-nowrap">
            {leftPrizes.map((prize, i) => renderSideImage(prize, i, true))}
          </div>

          {/* Center - focused image with ambient glow and brand text */}
          <div className="relative flex-shrink-0 flex items-center justify-center px-1 sm:px-2">
            <motion.div
              className="absolute inset-0 -m-8 rounded-3xl blur-3xl pointer-events-none"
              animate={{
                opacity: [0.4, 0.6, 0.4],
                scale: [1, 1.02, 1],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              style={{
                background: `radial-gradient(ellipse 80% 70% at 50% 50%, ${glowColor}, transparent 70%)`,
              }}
            />

            {activeImgSrc && (
            <motion.div
              layout
              className="relative w-[220px] h-[155px] sm:w-[360px] sm:h-[250px] lg:w-[440px] lg:h-[305px]"
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
                    animate={{ y: [0, -6, 0] }}
                    transition={{
                      y: {
                        duration: 4,
                        repeat: Infinity,
                        ease: "easeInOut",
                      },
                    }}
                    className="relative w-full h-full"
                  >
                    <div className="absolute inset-0">
                      <Image
                        src={activeImgSrc}
                        alt={activePrize?.label ?? "Selected power toolset"}
                        fill
                        className="object-contain drop-shadow-2xl"
                        sizes="(max-width: 640px) 220px, (max-width: 1024px) 360px, 440px"
                        priority
                      />
                    </div>
                    {activeToolset && POWERSET_LABELS[activeToolset] && (() => {
                      const scheme = getPackageColorScheme(getToolsetColorKey(activeToolset));
                      return (
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-10 w-[95%] sm:w-[90%] pointer-events-none">
                          <div
                            className="rounded-xl backdrop-blur-md px-2 py-1.5 sm:px-5 sm:py-2.5 shadow-xl"
                            style={{
                              background: scheme.badgeStyle.background,
                              boxShadow: scheme.badgeStyle.boxShadow,
                              border: scheme.badgeStyle.border,
                            }}
                          >
                            <p className={`font-agency font-bold text-[10px] sm:text-xs lg:text-sm leading-tight text-center line-clamp-2 ${scheme.buttonText}`}>
                              {POWERSET_LABELS[activeToolset]} · $5000 Cash
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

          {/* Right - non-focused toolsets */}
          <div className="flex items-center justify-start gap-1 sm:gap-2 md:gap-3 flex-1 min-w-0 overflow-x-auto overflow-y-hidden scrollbar-hide flex-nowrap">
            {rightPrizes.map((prize, i) => renderSideImage(prize, i, false))}
          </div>
        </>
      )}
    </motion.div>
    </div>
  );
}
