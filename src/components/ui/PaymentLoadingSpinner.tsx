"use client";

import React from "react";
import { cn } from "@/utils/cn";

interface PaymentLoadingSpinnerProps {
  message?: string;
  size?: "sm" | "md" | "lg";
}

/**
 * Beautiful, classy loading spinner with metallic black and red theme
 * Matches the design theme for payment processing
 */
export const PaymentLoadingSpinner: React.FC<PaymentLoadingSpinnerProps> = ({
  message = "Loading payment form...",
  size = "md",
}) => {
  const sizeClasses = {
    sm: "w-6 h-6",
    md: "w-12 h-12",
    lg: "w-16 h-16",
  };

  const borderWidth = {
    sm: "border-2",
    md: "border-[3px]",
    lg: "border-4",
  };

  const innerSizeClasses = {
    sm: "w-5 h-5 top-0.5 left-0.5",
    md: "w-10 h-10 top-1 left-1",
    lg: "w-14 h-14 top-1 left-1",
  };

  const dotSizeClasses = {
    sm: "w-1 h-1",
    md: "w-2 h-2",
    lg: "w-3 h-3",
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-4 py-8 relative">
      {/* Metallic black and red spinner */}
      <div className="relative">
        {/* Outer ring - metallic black with shadow */}
        <div
          className={cn(sizeClasses[size], borderWidth[size], "border-gray-900 rounded-full animate-spin")}
          style={{
            borderTopColor: "transparent",
            borderRightColor: "transparent",
            borderBottomColor: "#1a1a1a",
            borderLeftColor: "#1a1a1a",
            boxShadow: "0 0 20px rgba(0, 0, 0, 0.3), inset 0 0 20px rgba(0, 0, 0, 0.1)",
          }}
        />
        {/* Inner ring - red accent with reverse spin */}
        <div
          className={cn("absolute", innerSizeClasses[size], borderWidth[size], "border-red-600 rounded-full animate-spin-reverse")}
          style={{
            borderTopColor: "#ee0000",
            borderRightColor: "transparent",
            borderBottomColor: "transparent",
            borderLeftColor: "transparent",
            boxShadow: "0 0 15px rgba(238, 0, 0, 0.4), inset 0 0 10px rgba(238, 0, 0, 0.2)",
          }}
        />
        {/* Center dot - red glow */}
        <div
          className={cn("absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-600", dotSizeClasses[size])}
          style={{
            boxShadow: "0 0 10px rgba(238, 0, 0, 0.6), 0 0 20px rgba(238, 0, 0, 0.3)",
          }}
        />
      </div>

      {/* Loading message */}
      <div className="text-center">
        <p className="text-sm font-medium text-gray-800 dark:text-neutral-100 drop-shadow-sm">{message}</p>
        <p className="text-xs text-gray-500 mt-1">Please wait...</p>
      </div>

    </div>
  );
};
