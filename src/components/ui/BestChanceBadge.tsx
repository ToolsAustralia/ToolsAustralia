"use client";

import React from "react";
import { Star } from "lucide-react";

interface BestChanceBadgeProps {
  size?: "small" | "medium" | "large";
  className?: string;
}

/**
 * BestChanceBadge Component
 * Premium badge indicating "BEST CHANCE" for boss and power packages
 * Uses purple/violet gradient for premium feel with star icon
 */
const BestChanceBadge: React.FC<BestChanceBadgeProps> = ({
  size = "medium",
  className = "",
}) => {
  // Size configurations
  const sizeConfig = {
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
        bg-gradient-to-r from-purple-500 via-violet-600 to-purple-700
        text-white font-bold uppercase tracking-wide
        rounded-full shadow-lg
        relative overflow-hidden
        border-2 border-purple-300/50
        ${className}
      `}
      style={{
        background: `linear-gradient(135deg, #a855f7 0%, #9333ea 25%, #7e22ce 50%, #6b21a8 75%, #581c87 100%)`,
        boxShadow: `0 0 25px rgba(168, 85, 247, 0.8), 0 4px 12px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.5)`,
      }}
    >
      {/* Metallic shine effect */}
      <div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent transform -skew-x-12"
        style={{
          background: `linear-gradient(135deg, transparent 0%, rgba(255, 255, 255, 0.4) 25%, rgba(255, 255, 255, 0.6) 50%, rgba(255, 255, 255, 0.4) 75%, transparent 100%)`,
          animation: "shimmer 2s infinite",
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
      <div className="relative z-10 flex items-center gap-1">
        {/* Star icon with metallic effect */}
        <Star
          className={`${config.icon} text-white fill-white drop-shadow-sm`}
          style={{
            filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3))",
          }}
        />

        {/* "BEST CHANCE" text */}
        <span
          className="font-black"
          style={{
            textShadow: "0 1px 2px rgba(0, 0, 0, 0.5), 0 0 8px rgba(255, 255, 255, 0.3)",
          }}
        >
          BEST CHANCE
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

