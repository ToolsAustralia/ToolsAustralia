"use client";

import type { CSSProperties } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { TOOLBOX_IMAGES, TOOLBOX_LABELS, TOOLBOX_SIZES, TOOLBOX_UNIFIED_FRAME } from "./constants";

/** Toolbox types that have images (excludes cash) — order: Milwaukee, Kincrome (centre), Sidchrome */
const TOOLBOX_OPTIONS = ["milwaukee", "kincrome", "sidchrome"] as const;
type ToolboxOption = (typeof TOOLBOX_OPTIONS)[number];

const TOOLBOX_FOCUS_GLOW =
  "radial-gradient(circle at 50% 50%, rgba(220, 38, 38, 0.5) 0%, rgba(185, 28, 28, 0.26) 42%, rgba(127, 29, 29, 0.1) 62%, transparent 76%)";

const ARIA_LABEL: Record<ToolboxOption, string> = {
  milwaukee: "Milwaukee Toolbox",
  kincrome: "Kincrome CONTOUR toolbox",
  sidchrome: "Sidchrome Toolbox",
};

interface ToolboxSelectorProps {
  /** Currently selected toolbox type. Null when cash-prize so nothing is selected. */
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

/** Entrance only — no scale so label row stays aligned across columns */
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 400,
      damping: 24,
    },
  },
};

const imgSizesAttr = "(max-width: 639px) 280px, 360px";

/**
 * Toolbox selection — Milwaukee, Kincrome (centre), Sidchrome.
 * Unified frame + flex column: image stage, then label row.
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
      className={`flex w-full flex-row flex-wrap items-stretch justify-center gap-2 sm:gap-5 md:gap-7 ${className}`}
      role="group"
      aria-label="Select toolbox"
    >
      {TOOLBOX_OPTIONS.map((type, index) => {
        const isActive = selectedType === type;
        const imgSrc = TOOLBOX_IMAGES[type];
        const imageScale = TOOLBOX_SIZES[type]?.imageScale ?? 1;

        return (
          <motion.button
            key={type}
            type="button"
            onClick={() => onSelect(type)}
            variants={itemVariants}
            className="relative flex min-h-0 min-w-0 max-w-[min(34vw,300px)] flex-1 basis-[calc(33.333%-0.375rem)] cursor-pointer flex-col items-center overflow-visible rounded-2xl focus:outline-none focus-visible:ring-4 focus-visible:ring-red-500/60 focus-visible:ring-offset-4 sm:max-w-[min(32vw,340px)] sm:basis-0"
            aria-pressed={isActive}
            aria-label={ARIA_LABEL[type]}
          >
            <motion.div
              className="relative isolate mx-auto w-full max-w-[var(--tb-max-w)] shrink-0 overflow-visible h-[var(--tb-h)] will-change-transform sm:max-w-[var(--tb-max-w-d)] sm:h-[var(--tb-h-d)]"
              style={
                {
                  "--tb-max-w": `${TOOLBOX_UNIFIED_FRAME.mobile.maxW}px`,
                  "--tb-h": `${TOOLBOX_UNIFIED_FRAME.mobile.h}px`,
                  "--tb-max-w-d": `${TOOLBOX_UNIFIED_FRAME.desktop.maxW}px`,
                  "--tb-h-d": `${TOOLBOX_UNIFIED_FRAME.desktop.h}px`,
                } as CSSProperties
              }
              animate={{
                scale: isActive ? 1.06 : 0.88,
                opacity: isActive ? 1 : 0.52,
                // No CSS `filter` or box-shadow on this layer — avoids blur with scale and removes the “card” rectangle behind art.
              }}
              whileHover={
                isActive
                  ? {
                      scale: 1.09,
                      transition: { type: "spring", stiffness: 400, damping: 20 },
                    }
                  : {
                      scale: 0.92,
                      transition: { type: "spring", stiffness: 400, damping: 22 },
                    }
              }
              whileTap={{
                scale: isActive ? 1.02 : 0.85,
                transition: { duration: 0.15 },
              }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
            >
              {isActive && (
                <div
                  className="pointer-events-none absolute left-1/2 top-1/2 z-0 aspect-square w-[min(220px,70vw)] -translate-x-1/2 -translate-y-1/2 sm:w-[min(300px,36vw)]"
                  style={{
                    background: TOOLBOX_FOCUS_GLOW,
                    filter: "blur(24px)",
                    opacity: 0.95,
                  }}
                  aria-hidden
                />
              )}

              <div
                className="absolute inset-0 z-[1] flex items-center justify-center"
                style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
              >
                <Image
                  src={imgSrc}
                  alt={ARIA_LABEL[type]}
                  width={640}
                  height={640}
                  sizes={imgSizesAttr}
                  priority={index === 0}
                  className="h-auto max-h-full w-auto max-w-full object-contain object-center transition-transform duration-300"
                  style={{
                    transform: `translateZ(0) scale(${imageScale})`,
                    transformOrigin: "center center",
                  }}
                />
              </div>
            </motion.div>

            {/* Equal-height columns: grow pushes the label row to the same baseline across all toolboxes */}
            <div className="min-h-0 w-full flex-1 basis-0" aria-hidden="true" />

            <div className="flex w-full shrink-0 justify-center px-0.5 pt-2 sm:pt-2.5">
              <div
                className={`flex w-full max-w-[min(100%,260px)] items-center justify-center rounded-full border-2 px-2 py-0.5 text-center shadow-lg backdrop-blur-md transition-all duration-300 sm:max-w-[min(100%,320px)] sm:px-2.5 sm:py-1 ${
                  isActive
                    ? "border-red-500/80 bg-red-900/90 shadow-[0_4px_20px_rgba(127,29,29,0.4)]"
                    : "border-white/15 bg-black/55"
                }`}
              >
                <span className="font-sans text-2xs font-extrabold leading-tight text-white sm:text-xs">
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
