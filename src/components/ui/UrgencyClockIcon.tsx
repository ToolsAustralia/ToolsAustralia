"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/utils/cn";

const SIZE_MAP = {
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-6 h-6",
} as const;

export interface UrgencyClockIconProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  animated?: boolean;
  ariaLabel?: string;
}

export default function UrgencyClockIcon({
  className = "",
  size = "md",
  animated = true,
  ariaLabel = "Limited time offer",
}: UrgencyClockIconProps) {
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = animated && !prefersReducedMotion;

  const sizeClass = SIZE_MAP[size];

  return (
    <motion.span
      role="img"
      aria-label={ariaLabel}
      className={cn("relative inline-flex items-center justify-center text-red-500", sizeClass, className)}
      animate={
        shouldAnimate
          ? {
              scale: [1, 1.08, 1],
              x: [0, -1, 1, -2, 2, -1, 1, 0],
              y: [0, 1, -1, 2, -2, 1, -1, 0],
              rotate: [0, -3, 3, -2, 2, 0],
            }
          : undefined
      }
      transition={
        shouldAnimate
          ? {
              scale: {
                duration: 1.2,
                repeat: Infinity,
                ease: "easeInOut",
              },
              x: {
                duration: 0.4,
                repeat: Infinity,
                repeatDelay: 2.5,
                ease: "easeInOut",
              },
              y: {
                duration: 0.4,
                repeat: Infinity,
                repeatDelay: 2.5,
                ease: "easeInOut",
              },
              rotate: {
                duration: 0.4,
                repeat: Infinity,
                repeatDelay: 2.5,
                ease: "easeInOut",
              },
            }
          : undefined
      }
    >
      {/* Glow pulse */}
      {shouldAnimate && (
        <motion.span
          className="absolute inset-0 rounded-full bg-red-500/30 blur-lg"
          animate={{ scale: [1, 1.6], opacity: [0.6, 0] }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      )}

      <svg
        viewBox="0 0 24 24"
        className="relative z-10 h-full w-full"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Outer ring */}
        <circle cx="12" cy="12" r="10" />

        {/* Inner subtle ring */}
        <circle cx="12" cy="12" r="8.5" opacity="0.3" />

        {/* Hour ticks */}
        {[...Array(12)].map((_, i) => {
          const angle = (i * 360) / 12;
          return (
            <line
              key={i}
              x1="12"
              y1="2.2"
              x2="12"
              y2="3.2"
              transform={`rotate(${angle} 12 12)`}
              strokeWidth="1.2"
              opacity="0.9"
            />
          );
        })}

        {/* Minute ticks (thin) */}
        {[...Array(60)].map((_, i) => {
          if (i % 5 === 0) return null;
          const angle = (i * 360) / 60;
          return (
            <line
              key={`m-${i}`}
              x1="12"
              y1="2.4"
              x2="12"
              y2="2.9"
              transform={`rotate(${angle} 12 12)`}
              strokeWidth="0.5"
              opacity="0.35"
            />
          );
        })}

        {/* Hour hand */}
        <line x1="12" y1="12" x2="12" y2="8" />

        {/* Minute hand */}
        <line x1="12" y1="12" x2="12" y2="5" />

        {/* Second hand */}
        {shouldAnimate ? (
          <motion.g
            style={{ transformOrigin: "50% 50%", transformBox: "fill-box" }}
            animate={{ rotate: 360 }}
            transition={{
              repeat: Infinity,
              duration: 2,
              ease: "linear",
            }}
          >
            <circle cx="12" cy="12" r="9" fill="none" stroke="none" />
            <line x1="12" y1="12" x2="12" y2="3" />
            <circle cx="12" cy="12" r="1" fill="currentColor" />
          </motion.g>
        ) : (
          <line x1="12" y1="12" x2="12" y2="3" />
        )}
      </svg>
    </motion.span>
  );
}
