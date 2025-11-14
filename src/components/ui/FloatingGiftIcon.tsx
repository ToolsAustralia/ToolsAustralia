"use client";

import React, { useState, useEffect } from "react";
import { Gift, X } from "lucide-react";

interface FloatingGiftIconProps {
  isVisible: boolean;
  onClick: () => void;
  onDismiss: () => void;
  offerTitle?: string;
  discountPercentage?: number;
}

/**
 * Floating Gift Icon Component
 * Shows a floating gift icon when upsell is declined, allowing users to revisit the offer
 */
const FloatingGiftIcon: React.FC<FloatingGiftIconProps> = ({
  isVisible,
  onClick,
  onDismiss,
  offerTitle = "Special Offer",
  discountPercentage = 50,
}) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  // Animation effect when becoming visible
  useEffect(() => {
    if (isVisible) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[40]">
      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-16 right-0 bg-gray-900 text-white text-sm rounded-lg px-3 py-2 shadow-lg max-w-xs">
          <div className="font-semibold text-yellow-400 mb-1">
            🎁 {discountPercentage}% Off {offerTitle}
          </div>
          <div className="text-xs text-gray-300">Click to claim your special offer!</div>
          {/* Arrow pointing down */}
          <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
        </div>
      )}

      {/* Floating Gift Icon */}
      <div
        className={`
          relative bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700
          text-white rounded-full p-4 shadow-2xl cursor-pointer transition-all duration-300
          hover:scale-110 hover:shadow-3xl group
          ${isAnimating ? "animate-bounce" : ""}
        `}
        onClick={onClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {/* Gift Icon */}
        <Gift className="w-6 h-6 group-hover:scale-110 transition-transform duration-200" />

        {/* Discount Badge */}
        <div className="absolute -top-2 -right-2 bg-yellow-400 text-red-600 text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-lg">
          {discountPercentage}%
        </div>

        {/* Pulse Animation */}
        <div className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-20"></div>
      </div>

      {/* Dismiss Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className="absolute -top-2 -left-2 bg-gray-600 hover:bg-gray-700 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-lg transition-colors duration-200"
        title="Dismiss offer"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};

export default FloatingGiftIcon;
