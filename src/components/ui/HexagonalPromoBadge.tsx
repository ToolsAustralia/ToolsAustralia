"use client";

import React from "react";

interface HexagonalPromoBadgeProps {
  multiplier: 3 | 5 | 10;
  size?: "xs" | "small" | "medium" | "large";
  className?: string;
}

/**
 * Octagonal Promo Badge Component
 * Displays only the multiplier number in an octagonal shape (8 sides)
 * Used on package cards in the upper left corner
 */
const HexagonalPromoBadge: React.FC<HexagonalPromoBadgeProps> = ({ multiplier, size = "medium", className = "" }) => {
  // Size configurations - Octagonal shape (8 sides)
  const sizeConfig = {
    xs: {
      container: "w-7 h-7",
      text: "text-[8px]",
      clipPath: "polygon(29.3% 0%, 70.7% 0%, 100% 29.3%, 100% 70.7%, 70.7% 100%, 29.3% 100%, 0% 70.7%, 0% 29.3%)",
    },
    small: {
      container: "w-12 h-12",
      text: "text-xs",
      clipPath: "polygon(29.3% 0%, 70.7% 0%, 100% 29.3%, 100% 70.7%, 70.7% 100%, 29.3% 100%, 0% 70.7%, 0% 29.3%)",
    },
    medium: {
      container: "w-16 h-16",
      text: "text-base",
      clipPath: "polygon(29.3% 0%, 70.7% 0%, 100% 29.3%, 100% 70.7%, 70.7% 100%, 29.3% 100%, 0% 70.7%, 0% 29.3%)",
    },
    large: {
      container: "w-20 h-20",
      text: "text-lg",
      clipPath: "polygon(29.3% 0%, 70.7% 0%, 100% 29.3%, 100% 70.7%, 70.7% 100%, 29.3% 100%, 0% 70.7%, 0% 29.3%)",
    },
  };

  const config = sizeConfig[size];

  return (
    <div className={`${config.container} ${className} relative`}>
      {/* Outer glowing burst effect - pulsing animation */}
      <div
        className="absolute inset-0 animate-pulse"
        style={{
          clipPath: config.clipPath,
          background: `radial-gradient(circle at center, rgba(239, 68, 68, 0.6) 0%, rgba(220, 38, 38, 0.4) 40%, rgba(185, 28, 28, 0.2) 70%, transparent 100%)`,
          filter: "blur(4px)",
          transform: "scale(1.2)",
          zIndex: 0,
        }}
      />

      {/* Main badge container - Fiery gradient */}
      <div
        className="relative flex items-center justify-center h-full"
        style={{
          clipPath: config.clipPath,
          background: `radial-gradient(circle at 30% 30%, #ff6b35 0%, #f7931e 15%, #ee0000 30%, #dc2626 50%, #b91c1c 70%, #991b1b 100%)`,
          boxShadow: `
            0 0 30px rgba(239, 68, 68, 0.9),
            0 0 60px rgba(220, 38, 38, 0.6),
            0 0 90px rgba(185, 28, 28, 0.3),
            0 4px 20px rgba(0, 0, 0, 0.5),
            inset 0 2px 4px rgba(255, 255, 255, 0.3),
            inset 0 -2px 4px rgba(0, 0, 0, 0.3)
          `,
          zIndex: 1,
        }}
      >
        {/* Fiery metallic shine effect - animated */}
        <div
          className="absolute inset-0"
          style={{
            clipPath: config.clipPath,
            background: `linear-gradient(135deg, 
              rgba(255, 255, 255, 0.5) 0%, 
              rgba(255, 200, 100, 0.4) 20%, 
              transparent 40%, 
              transparent 60%, 
              rgba(255, 200, 100, 0.3) 80%, 
              rgba(255, 255, 255, 0.4) 100%
            )`,
            animation: "shimmer 2s infinite",
            zIndex: 2,
          }}
        />

        {/* Hot edge highlight - top and left edges */}
        <div
          className="absolute inset-0"
          style={{
            clipPath: config.clipPath,
            background: `linear-gradient(135deg, 
              rgba(255, 255, 255, 0.6) 0%, 
              rgba(255, 200, 100, 0.5) 15%, 
              transparent 30%, 
              transparent 100%
            )`,
            zIndex: 2,
          }}
        />

        {/* Outer border - fiery glow */}
        <div
          className="absolute inset-0"
          style={{
            clipPath: config.clipPath,
            border: "2px solid rgba(255, 200, 100, 0.8)",
            boxShadow: `
              inset 0 0 10px rgba(255, 255, 255, 0.3),
              0 0 15px rgba(255, 200, 100, 0.6),
              0 0 25px rgba(239, 68, 68, 0.4)
            `,
            zIndex: 3,
          }}
        />

        {/* Multiplier text - White with strong shadow for contrast */}
        <span
          className={`${config.text} font-black text-white relative z-10`}
          style={{
            textShadow: `
              0 0 10px rgba(255, 255, 255, 0.8),
              0 0 20px rgba(255, 200, 100, 0.6),
              0 2px 4px rgba(0, 0, 0, 0.8),
              0 4px 8px rgba(0, 0, 0, 0.6)
            `,
            filter: "drop-shadow(0 0 8px rgba(255, 255, 255, 0.5))",
          }}
        >
          {multiplier}x
        </span>
      </div>
    </div>
  );
};

export default HexagonalPromoBadge;
