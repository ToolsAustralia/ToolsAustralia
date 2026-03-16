"use client";

import React, { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { Z_INDEX } from "@/constants/z-index";

interface LoadingScreenProps {
  title: string;
  subtitle: string;
  steps: string[];
  isVisible?: boolean;
  isCompleting?: boolean;
}

/**
 * Reusable LoadingScreen Component
 * Displays a professional loading screen with animated spinner and cycling progress steps
 * Supports spinner-to-check transition when completing
 */
const LoadingScreen: React.FC<LoadingScreenProps> = ({ 
  title, 
  subtitle, 
  steps, 
  isVisible = true,
  isCompleting = false,
}) => {
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
    <div className="fixed inset-0 flex items-center justify-center p-2 sm:p-4" style={{ zIndex: Z_INDEX.TOAST_LOADING }}>
      <div className="absolute inset-0 bg-black/85" />
      <div className="relative bg-transparent rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-md mx-auto p-8 sm:p-12 text-center">
        <div className="mb-6">
          <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 relative">
            {isCompleting ? (
              <>
                {/* Completing state: spinner morphs to check */}
                <div className="absolute inset-0 border-4 border-emerald-200 rounded-full transition-all duration-300"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 to-green-600 rounded-full flex items-center justify-center transition-all duration-300 animate-in zoom-in-50">
                  <Check className="w-8 h-8 sm:w-10 sm:h-10 text-white stroke-[3] animate-in fade-in zoom-in-75 duration-400" />
                </div>
              </>
            ) : (
              <>
                {/* Loading state: spinning circle */}
                <div className="absolute inset-0 border-4 border-red-200 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
              </>
            )}
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-white mb-2">{title}</h3>
          {subtitle && <p className="text-sm sm:text-base text-gray-200">{subtitle}</p>}
        </div>
        <div className="flex items-center justify-center gap-2.5 text-sm text-white min-h-[24px]">
          {!isCompleting && <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></div>}
          <span className="text-center font-medium">
            {isCompleting ? "Complete!" : steps[currentStepIndex]}
          </span>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;
