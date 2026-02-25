"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { TOOLBOX_IMAGES, TOOLBOX_LABELS } from "./constants";

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

/**
 * Toolbox selection - Milwaukee and Sidchrome.
 * No container/card styling - images only, like the power toolset.
 * Modify constants.ts for image paths and sizes.
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
      className={`flex justify-center gap-2 sm:gap-6 md:gap-10 ${className}`}
      role="group"
      aria-label="Select toolbox"
    >
      {TOOLBOX_OPTIONS.map((type) => {
        const isActive = selectedType === type;
        const imgSrc = TOOLBOX_IMAGES[type];

        return (
          <motion.button
            key={type}
            type="button"
            onClick={() => onSelect(type)}
            variants={itemVariants}
            whileHover={{
              scale: 1.08,
              transition: { type: "spring", stiffness: 400, damping: 20 },
            }}
            whileTap={{
              scale: 0.96,
              transition: { duration: 0.15 },
            }}
            animate={{
              opacity: isActive ? 1 : 0.7,
              filter: isActive ? "drop-shadow(0 8px 24px rgba(0,0,0,0.2))" : "none",
            }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="relative cursor-pointer focus:outline-none focus-visible:ring-4 focus-visible:ring-red-500/60 focus-visible:ring-offset-4 rounded-2xl"
            aria-pressed={isActive}
            aria-label={`${type === "milwaukee" ? "Milwaukee" : "Sidchrome"} Toolbox`}
          >
            {/* Highlight behind image - darker red glow only when selected */}
            {isActive && (
              <div
                className="absolute inset-0 -inset-4 pointer-events-none -z-10"
                style={{
                  background: "radial-gradient(ellipse 80% 80% at 50% 50%, rgba(180, 0, 0, 0.5), rgba(140, 0, 0, 0.25) 50%, transparent 70%)",
                  filter: "blur(14px)",
                }}
              />
            )}

            <div className="relative w-[200px] sm:w-[320px] h-[140px] sm:h-[220px]">
              <Image
                src={imgSrc}
                alt={`${type === "milwaukee" ? "Milwaukee" : "Sidchrome"} Toolbox`}
                fill
                className="object-contain transition-transform duration-300"
                sizes="(max-width: 640px) 200px, 320px"
              />
              {/* Label - focus/unfocus: brighter when selected, muted when not */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 max-w-[90%] pointer-events-none">
                <div
                  className={`rounded-full backdrop-blur-md px-3 py-1.5 sm:px-4 sm:py-2 shadow-lg transition-all duration-300 ${
                    isActive
                      ? "bg-red-900/90 border-2 border-red-500/80 shadow-lg shadow-[0_4px_20px_rgba(127,29,29,0.4)]"
                      : "bg-black/50 border border-white/5 opacity-80"
                  }`}
                >
                  <p className={`font-agency font-bold text-[10px] sm:text-xs text-center leading-tight truncate transition-colors duration-300 ${isActive ? "text-white" : "text-white/80"}`}>
                    {TOOLBOX_LABELS[type]}
                  </p>
                </div>
              </div>
            </div>
          </motion.button>
        );
      })}
    </motion.div>
  );
}
