"use client";

import React, { useState, useEffect } from "react";
import { Z_INDEX } from "@/constants/z-index";

interface LoadingScreenProps {
  title: string;
  subtitle: string;
  steps: string[];
  isVisible?: boolean;
}

/**
 * Loading screen with spinner and cycling steps.
 * Success state is handled by SuccessScreen in LoadingContext - this only shows loading.
 */
const LoadingScreen: React.FC<LoadingScreenProps> = ({
  title,
  subtitle,
  steps,
  isVisible = true,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    if (!isVisible || steps.length === 0) return;

    const interval = setInterval(() => {
      setCurrentStepIndex((prevIndex) => {
        const nextIndex = prevIndex + 1;
        if (nextIndex >= steps.length) {
          clearInterval(interval);
          return prevIndex;
        }
        return nextIndex;
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [isVisible, steps.length]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-2 sm:p-4" style={{ zIndex: Z_INDEX.TOAST_LOADING }}>
      <div className="absolute inset-0 bg-black/85" />
      <div className="relative bg-transparent rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-md mx-auto p-8 sm:p-12 text-center">
        <div className="mb-6">
          <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 relative">
            <div className="absolute inset-0 border-4 border-red-200 rounded-full" />
            <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-white mb-2">{title}</h3>
          {subtitle && <p className="text-sm sm:text-base text-gray-200">{subtitle}</p>}
        </div>
        <div className="flex items-center justify-center gap-2.5 text-sm text-white min-h-[24px]">
          <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
          <span className="text-center font-medium">{steps[currentStepIndex]}</span>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;
