"use client";

import React from "react";

interface PromoMultiplierBadgeProps {
  multiplier: 2 | 3 | 5 | 10;
  className?: string;
  showPromoText?: boolean; // Controls visibility of "PROMO" text, default true
}

/**
 * PromoMultiplierBadge - A reusable component for displaying promo multiplier badges
 * with fiery metallic red styling. Designed for mobile toggle buttons.
 *
 * @param multiplier - The promo multiplier value (2, 3, 5, or 10)
 * @param className - Additional CSS classes for custom styling
 * @param showPromoText - Whether to show "PROMO" text after the multiplier (default: true)
 */
const PromoMultiplierBadge: React.FC<PromoMultiplierBadgeProps> = ({
  multiplier,
  className = "",
  showPromoText = true,
}) => {
  return (
    <div className={`absolute -top-1.5 -right-1.5 lg:hidden z-10 ${className}`}>
      <div
        className="px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide rounded-full shadow-lg relative overflow-hidden border border-red-400/50"
        style={{
          background: `linear-gradient(135deg, #dc2626 0%, #ea580c 25%, #dc2626 50%, #b91c1c 75%, #dc2626 100%)`,
          boxShadow: `0 0 20px rgba(220, 38, 38, 0.8), 0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.4)`,
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
        {/* Content - Multiplier with optional PROMO text */}
        <span
          className="relative z-10 text-white font-black"
          style={{
            textShadow: "0 1px 2px rgba(0, 0, 0, 0.5)",
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
