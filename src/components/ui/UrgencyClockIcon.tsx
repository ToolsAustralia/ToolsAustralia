"use client";

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

/**
 * Urgency clock for the promo banner's static-urgency label.
 *
 * Perf rewrite (2026-07-20, Tier-2 Task 1): the previous version ran FOUR
 * infinite framer-motion tracks (scale pulse + x/y/rotate shake), a blurred
 * glow span, and a smooth 2s SVG second-hand sweep — an always-on rAF/repaint
 * stack. It is now pure CSS: one subtle scale pulse on the wrapper
 * (`.ta-clock-pulse`, transform-only → compositor) and a `steps(60)` 60s
 * second-hand tick (`.ta-clock-second-hand`, one style update per second).
 * Both classes are tier-gated in globals.css (mobile/tablet/save-data get a
 * static icon; prefers-reduced-motion is covered by the global 1ms rule), so
 * no JS motion/viewport hooks are needed here.
 */
export default function UrgencyClockIcon({
  className = "",
  size = "md",
  animated = true,
  ariaLabel = "Limited time offer",
}: UrgencyClockIconProps) {
  const sizeClass = SIZE_MAP[size];

  return (
    <span
      role="img"
      aria-label={ariaLabel}
      className={cn(
        "relative inline-flex items-center justify-center text-red-500",
        sizeClass,
        animated && "ta-clock-pulse",
        className,
      )}
    >
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

        {/* Second hand — the invisible r=9 circle makes the group's fill-box
            symmetric around (12,12) so the CSS rotation pivots on the dial center. */}
        <g className={animated ? "ta-clock-second-hand" : undefined}>
          <circle cx="12" cy="12" r="9" fill="none" stroke="none" />
          <line x1="12" y1="12" x2="12" y2="3" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
        </g>
      </svg>
    </span>
  );
}
