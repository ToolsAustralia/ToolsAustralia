"use client";

import React from "react";
import { usePromoTheme } from "@/stores/usePromoThemeStore";

interface PromoMultiplierBadgeProps {
  multiplier: 2 | 3 | 5 | 10;
  className?: string;
  showPromoText?: boolean; // Controls visibility of "PROMO" text, default true
}

/**
 * PromoMultiplierBadge - A reusable component for displaying promo multiplier badges
 * with fiery metallic red styling. Designed for toggle buttons (mobile and desktop).
 *
 * @param multiplier - The promo multiplier value (3, 5, or 10)
 * @param className - Additional CSS classes for custom styling
 * @param showPromoText - Whether to show "PROMO" text after the multiplier (default: true)
 */
const PromoMultiplierBadge: React.FC<PromoMultiplierBadgeProps> = ({
  multiplier,
  className = "",
  showPromoText = true,
}) => {
  const theme = usePromoTheme();
  const preferDark = theme.preferDarkBackground ?? false;
  return (
    <div className={`absolute -top-1.5 -right-1.5 z-10 ${className}`}>
      <div
        className="px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide rounded-full shadow-lg relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${theme.primaryLight} 0%, ${theme.primary} 25%, ${theme.primaryDark} 50%, ${theme.primary} 75%, ${theme.primaryLight} 100%)`,
          boxShadow: `0 0 20px ${theme.shadowRgba}, 0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.4)`,
          border: `1px solid ${theme.borderRgba}`,
        }}
      >
        {/* Subtle static highlight - no shimmer/light shine effect */}
        {/* Content - Multiplier with optional PROMO text */}
        <span
          className={`relative z-10 font-black ${preferDark ? "text-black" : "text-white"}`}
          style={{
            textShadow: preferDark ? "0 1px 2px rgba(255, 255, 255, 0.3)" : "0 1px 2px rgba(0, 0, 0, 0.5)",
          }}
        >
          {multiplier}x{showPromoText ? " PROMO" : ""}
        </span>
        {/* Additional metallic border highlight */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `linear-gradient(135deg, rgba(255, 255, 255, 0.25) 0%, transparent 50%, rgba(255, 255, 255, 0.15) 100%)`,
            border: "1px solid rgba(255, 255, 255, 0.4)",
          }}
        />
      </div>
    </div>
  );
};

export default PromoMultiplierBadge;
