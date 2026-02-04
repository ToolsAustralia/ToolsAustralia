"use client";

import React from "react";
import { Trophy } from "lucide-react";

interface LatestWinnersBadgeProps {
  /** Major draw name (e.g. "January Draw", "Draw 3") - displayed as "{drawName} Winner" */
  drawName: string;
  size?: "xs" | "small" | "medium" | "large";
  className?: string;
}

/**
 * LatestWinnersBadge Component (Major Draw Winner badge)
 * Displays major draw name + "Winner" (e.g. "January Draw Winner")
 * Red theme with animating gradient/glow, similar to BestChanceBadge
 */
const LatestWinnersBadge: React.FC<LatestWinnersBadgeProps> = ({
  drawName,
  size = "medium",
  className = "",
}) => {
  const badgeText = drawName?.trim() ? `${drawName.trim()} Winner` : "Winner";
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
        background: "linear-gradient(135deg, #ee0000 0%, #cc0000 25%, #b30000 50%, #990000 75%, #7f0000 100%)",
        boxShadow: "0 0 20px rgba(238, 0, 0, 0.6), 0 4px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.4)",
        border: "2px solid rgba(254, 202, 202, 0.5)",
      }}
    >
      {/* Static highlight */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(135deg, transparent 0%, rgba(255, 255, 255, 0.2) 50%, transparent 100%)",
        }}
      />

      {/* Animated glow - red pulse */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background: "linear-gradient(135deg, rgba(238, 0, 0, 0.8) 0%, rgba(204, 0, 0, 0.6) 50%, rgba(238, 0, 0, 0.8) 100%)",
          animation: "latest-winners-glow 2s ease-in-out infinite",
        }}
      />

      {/* Content */}
      <div className={`relative z-10 flex items-center ${size === "xs" ? "gap-0.5" : "gap-1"}`}>
        <Trophy
          className={`${config.icon} text-white fill-white drop-shadow-sm flex-shrink-0 hidden sm:block`}
          style={{
            filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3))",
          }}
        />
        <span
          className="font-black whitespace-nowrap"
          style={{
            textShadow: "0 1px 2px rgba(0, 0, 0, 0.5), 0 0 8px rgba(255, 255, 255, 0.25)",
          }}
        >
          {badgeText}
        </span>
      </div>

      {/* Metallic border highlight */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background: "linear-gradient(135deg, rgba(255, 255, 255, 0.35) 0%, transparent 50%, rgba(255, 255, 255, 0.15) 100%)",
          border: "1px solid rgba(255, 255, 255, 0.4)",
        }}
      />
    </div>
  );
};

export default LatestWinnersBadge;
