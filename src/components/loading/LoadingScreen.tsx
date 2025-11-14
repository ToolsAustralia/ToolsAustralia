"use client";

import React, { useState, useEffect } from "react";

interface LoadingScreenProps {
  title: string;
  subtitle: string;
  steps: string[];
  isVisible?: boolean;
}

/**
 * Reusable LoadingScreen Component
 * Displays a professional loading screen with animated spinner and cycling progress steps
 */
const LoadingScreen: React.FC<LoadingScreenProps> = ({ title, subtitle, steps, isVisible = true }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    if (!isVisible || steps.length === 0) return;

    const interval = setInterval(() => {
      setCurrentStepIndex((prevIndex) => {
        const nextIndex = prevIndex + 1;
        // Stop at the last step instead of cycling back
        if (nextIndex >= steps.length) {
          clearInterval(interval);
          return prevIndex; // Stay on the last step
        }
        return nextIndex;
      });
    }, 1500); // Show each step for 1.5 seconds

    return () => clearInterval(interval);
  }, [isVisible, steps.length]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/60 " />
      <div className="relative bg-transparent  rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-md mx-auto p-8 sm:p-12 text-center">
        <div className="mb-6">
          <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 relative">
            <div className="absolute inset-0 border-4 border-red-200 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-white mb-2">{title}</h3>
          {subtitle && <p className="text-sm sm:text-base text-gray-200">{subtitle}</p>}
        </div>
        <div className="flex items-center justify-center gap-2 text-sm text-white">
          <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></div>
          <span className="animate-bounce text-center font-medium">{steps[currentStepIndex]}</span>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;
