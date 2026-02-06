"use client";

import React from "react";
import { Star } from "lucide-react";

interface BestChanceBadgeProps {
  size?: "xs" | "small" | "medium" | "large";
  className?: string;
  /** Optional package-themed styles to match the card (background, boxShadow, border) */
  badgeStyle?: { background: string; boxShadow: string; border: string };
}

/**
 * BestChanceBadge Component
 * Premium badge indicating "LAST CHANCE" for boss and power packages
 * Uses purple/violet gradient for premium feel with star icon
 */
const BestChanceBadge: React.FC<BestChanceBadgeProps> = ({
  size = "medium",
  className = "",
  badgeStyle: customBadgeStyle,
}) => {
  // Size configurations
  const sizeConfig = {
    xs: {
      container: "px-1.5 py-0.5 text-[7px]",
      text: "text-[7px]",
      icon: "w-2 h-2",
    },
    small: {
      container: "px-2 py-1 text-[8px]",
      text: "text-[8px]",
      icon: "w-2.5 h-2.5",
    },
    medium: {
      container: "px-2.5 py-1 text-[10px]",
      text: "text-[10px]",
      icon: "w-3 h-3",
    },
    large: {
      container: "px-3 py-1.5 text-xs",
      text: "text-xs",
      icon: "w-3.5 h-3.5",
    },
  };

  const config = sizeConfig[size];

  const defaultStyle = {
    background: "linear-gradient(135deg, #a855f7 0%, #9333ea 25%, #7e22ce 50%, #6b21a8 75%, #581c87 100%)",
    boxShadow: "0 0 25px rgba(168, 85, 247, 0.8), 0 4px 12px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.5)",
    border: "2px solid rgba(216, 180, 254, 0.5)",
  };
  const style = customBadgeStyle ?? defaultStyle;

  return (
    <div
      className={`
        ${config.container}
        ${config.text}
        text-white font-bold uppercase tracking-wide
        rounded-full shadow-lg
        relative overflow-hidden
        ${className}
      `}
      style={{
        background: style.background,
        boxShadow: style.boxShadow,
        border: style.border,
      }}
    >
      {/* Subtle static highlight - no shimmer */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(135deg, transparent 0%, rgba(255, 255, 255, 0.15) 50%, transparent 100%)`,
        }}
      />

      {/* Animated background effect */}
      <div
        className="absolute inset-0 opacity-0"
        style={{
          background: `linear-gradient(135deg, #a855f7 0%, #9333ea 25%, #7e22ce 50%, #6b21a8 75%, #581c87 100%)`,
          animation: "pulse 2s infinite",
        }}
      />

      {/* Content */}
      <div className={`relative z-10 flex items-center ${size === "xs" ? "gap-0.5" : "gap-1"}`}>
        {/* Star icon with metallic effect - hidden on mobile */}
        <Star
          className={`${config.icon} text-white fill-white drop-shadow-sm flex-shrink-0 hidden sm:block`}
          style={{
            filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3))",
          }}
        />

        {/* "LAST CHANCE" text */}
        <span
          className="font-black whitespace-nowrap"
          style={{
            textShadow: "0 1px 2px rgba(0, 0, 0, 0.5), 0 0 8px rgba(255, 255, 255, 0.3)",
          }}
        >
          LAST CHANCE
        </span>
      </div>

      {/* Additional metallic border highlight */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, transparent 50%, rgba(255, 255, 255, 0.15) 100%)`,
          border: "1px solid rgba(255, 255, 255, 0.4)",
        }}
      />
    </div>
  );
};

export default BestChanceBadge;

