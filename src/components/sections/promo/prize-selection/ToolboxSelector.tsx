"use client";

import type { CSSProperties } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { TOOLBOX_IMAGES, TOOLBOX_LABELS, TOOLBOX_SIZES, TOOLBOX_UNIFIED_FRAME } from "./constants";

/** Toolbox types that have images (excludes cash) */
const TOOLBOX_OPTIONS = ["milwaukee", "sidchrome"] as const;
type ToolboxOption = (typeof TOOLBOX_OPTIONS)[number];

interface ToolboxSelectorProps {
  /** Currently selected toolbox type (milwaukee or sidchrome). Null when cash-prize so nothing is selected. */
  selectedType: ToolboxOption | null;
  /** Called when user selects a toolbox */
  onSelect: (type: ToolboxOption) => void;
  /** Optional className for the container */
  className?: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring" as const,
      stiffness: 400,
      damping: 24,
    },
  },
};

const imgSizesAttr = "(max-width: 639px) 320px, 400px";

/**
 * Toolbox selection - Milwaukee and Sidchrome.
 * Unified frame + flex column: image stage, then label row (no absolute labels on mismatched heights).
 */
export function ToolboxSelector({
  selectedType,
  onSelect,
  className = "",
}: ToolboxSelectorProps) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={`flex w-full flex-row flex-wrap items-stretch justify-center gap-3 sm:gap-8 md:gap-10 ${className}`}
      role="group"
      aria-label="Select toolbox"
    >
      {TOOLBOX_OPTIONS.map((type) => {
        const isActive = selectedType === type;
        const imgSrc = TOOLBOX_IMAGES[type];
        const imageScale = TOOLBOX_SIZES[type].imageScale;

        return (
          <motion.button
            key={type}
            type="button"
            onClick={() => onSelect(type)}
            variants={itemVariants}
            whileHover={{
              scale: 1.04,
              transition: { type: "spring", stiffness: 400, damping: 20 },
            }}
            whileTap={{
              scale: 0.98,
              transition: { duration: 0.15 },
            }}
            animate={{
              opacity: isActive ? 1 : 0.55,
              filter: isActive
                ? "drop-shadow(0 8px 24px rgba(0,0,0,0.2))"
                : "brightness(1.25) saturate(0.7)",
            }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="relative flex min-w-0 max-w-[min(48vw,360px)] flex-1 basis-[calc(50%-0.375rem)] cursor-pointer flex-col items-center gap-2.5 overflow-visible rounded-2xl focus:outline-none focus-visible:ring-4 focus-visible:ring-red-500/60 focus-visible:ring-offset-4 sm:max-w-[min(46vw,420px)] sm:basis-0 sm:gap-3"
            aria-pressed={isActive}
            aria-label={`${type === "milwaukee" ? "Milwaukee" : "Sidchrome"} Toolbox`}
          >
            {/* Image stage — TOOLBOX_UNIFIED_FRAME for both; Milwaukee uses higher imageScale */}
            <div
              className="relative mx-auto w-full shrink-0 overflow-visible max-w-[var(--tb-max-w)] h-[var(--tb-h)] sm:max-w-[var(--tb-max-w-d)] sm:h-[var(--tb-h-d)]"
              style={
                {
                  "--tb-max-w": `${TOOLBOX_UNIFIED_FRAME.mobile.maxW}px`,
                  "--tb-h": `${TOOLBOX_UNIFIED_FRAME.mobile.h}px`,
                  "--tb-max-w-d": `${TOOLBOX_UNIFIED_FRAME.desktop.maxW}px`,
                  "--tb-h-d": `${TOOLBOX_UNIFIED_FRAME.desktop.h}px`,
                } as CSSProperties
              }
            >
              {isActive && (
                <div
                  className="pointer-events-none absolute left-1/2 top-1/2 -z-10 aspect-square w-[min(220px,70vw)] -translate-x-1/2 -translate-y-1/2 sm:w-[min(300px,36vw)]"
                  style={{
                    background:
                      type === "milwaukee"
                        ? "radial-gradient(circle at 50% 50%, rgba(220, 38, 38, 0.5) 0%, rgba(185, 28, 28, 0.26) 42%, rgba(127, 29, 29, 0.1) 62%, transparent 76%)"
                        : "radial-gradient(circle at 50% 50%, rgba(71, 85, 105, 0.4) 0%, rgba(51, 65, 85, 0.22) 42%, rgba(30, 41, 59, 0.1) 62%, transparent 76%)",
                    filter: "blur(20px)",
                  }}
                  aria-hidden
                />
              )}

              {/* Centered img + scale on the img (not fill+scaled wrapper) so DevTools/hover bounds track the picture, not the full slot × scale */}
              <div className="absolute inset-0 flex items-center justify-center">
                <Image
                  src={imgSrc}
                  alt={`${type === "milwaukee" ? "Milwaukee" : "Sidchrome"} Toolbox`}
                  width={640}
                  height={640}
                  sizes={imgSizesAttr}
                  priority={type === "milwaukee"}
                  className="h-auto max-h-full w-auto max-w-full object-contain object-center transition-transform duration-300"
                  style={{
                    transform: `scale(${imageScale})`,
                    transformOrigin: "center center",
                  }}
                />
              </div>
            </div>

            {/* Label row — same vertical position for both columns; text centered in pill */}
            <div className="flex w-full shrink-0 justify-center px-1">
              <div
                className={`flex w-full max-w-[min(100%,280px)] items-center justify-center rounded-full border-2 px-2.5 py-1 text-center shadow-lg backdrop-blur-md transition-all duration-300 sm:max-w-[min(100%,340px)] sm:px-3 sm:py-1 ${
                  isActive
                    ? "border-red-500/80 bg-red-900/90 shadow-[0_4px_20px_rgba(127,29,29,0.4)]"
                    : "border-white/15 bg-black/50 opacity-80"
                }`}
              >
                <span
                  className={`font-sans text-xs font-extrabold leading-tight sm:text-sm ${isActive ? "text-white" : "text-white/90"}`}
                >
                  {TOOLBOX_LABELS[type]}
                </span>
              </div>
            </div>
          </motion.button>
        );
      })}
    </motion.div>
  );
}
