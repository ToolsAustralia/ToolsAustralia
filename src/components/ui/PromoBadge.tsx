"use client";

import React from "react";

interface PromoBadgeProps {
  multiplier: 2 | 3 | 5 | 10;
  size?: "small" | "medium" | "large";
  className?: string;
  showPromoText?: boolean; // Controls visibility of "PROMO" text, default true
}

const PromoBadge: React.FC<PromoBadgeProps> = ({
  multiplier,
  size = "medium",
  className = "",
  showPromoText = true,
}) => {
  // Size configurations
  const sizeConfig = {
    small: {
      container: "px-2 py-1 text-xs",
      text: "text-xs",
      icon: "w-3 h-3",
    },
    medium: {
      container: "px-3 py-1.5 text-sm",
      text: "text-sm",
      icon: "w-4 h-4",
    },
    large: {
      container: "px-4 py-2 text-base",
      text: "text-base",
      icon: "w-5 h-5",
    },
  };

  const config = sizeConfig[size];

  return (
    <div
      className={`
        ${config.container}
        ${config.text}
        bg-gradient-to-r from-yellow-400 via-yellow-500 to-amber-600
        text-black font-bold uppercase tracking-wide
        rounded-full shadow-lg
        relative overflow-hidden
        border-2 border-yellow-300/50
        ${className}
      `}
      style={{
        background: `linear-gradient(135deg, #fde047 0%, #facc15 25%, #eab308 50%, #ca8a04 75%, #a16207 100%)`,
        boxShadow: `0 0 25px rgba(253, 224, 71, 0.8), 0 4px 12px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.5)`,
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
          background: `linear-gradient(135deg, #fde047 0%, #facc15 25%, #eab308 50%, #ca8a04 75%, #a16207 100%)`,
          animation: "pulse 2s infinite",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex items-center gap-1">
        {/* Lightning bolt icon with metallic effect */}
        <svg
          className={`${config.icon} text-yellow-900 drop-shadow-sm`}
          fill="currentColor"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
          style={{
            filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2))",
          }}
        >
          <path
            fillRule="evenodd"
            d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
            clipRule="evenodd"
          />
        </svg>

        {/* Multiplier text with metallic gradient */}
        <span
          className="font-black"
          style={{
            background: `linear-gradient(135deg, #1f2937 0%, #374151 50%, #1f2937 100%)`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textShadow: "0 1px 2px rgba(0, 0, 0, 0.2)",
          }}
        >
          {multiplier}x
        </span>

        {/* "PROMO" text with metallic effect - conditionally rendered */}
        {showPromoText && (
          <span
            className="font-semibold"
            style={{
              background: `linear-gradient(135deg, #1f2937 0%, #374151 50%, #1f2937 100%)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              textShadow: "0 1px 2px rgba(0, 0, 0, 0.2)",
            }}
          >
            PROMO
          </span>
        )}
      </div>

      {/* Additional metallic border highlight */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, transparent 50%, rgba(255, 255, 255, 0.1) 100%)`,
          border: "1px solid rgba(255, 255, 255, 0.3)",
        }}
      />
    </div>
  );
};

export default PromoBadge;
