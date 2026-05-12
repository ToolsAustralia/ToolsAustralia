"use client";

/**
 * StepIndicator — guest-only step strip rendered flush below the modal header.
 * Shows two clickable buttons (Step 1: "Your Details", Step 2: "Billing Info")
 * along with an optional promo multiplier badge in the corner.
 *
 * Visual output (className strings, structure, badge positioning) is preserved
 * byte-for-byte from the original MembershipModal.tsx (lines 5167-5241).
 */

import React from "react";
import Image from "next/image";
import { cn } from "@/utils/cn";

interface StepIndicatorProps {
  currentStep: number;
  hasCompletedRegistration: boolean;
  showHeaderPromoBadge: boolean;
  packageBadgeSrc: string | null;
  promoMultiplier: number;
  promoThemePrimary: string;
  onStepClick: (step: 1 | 2) => void;
}

const StepIndicator: React.FC<StepIndicatorProps> = ({
  currentStep,
  hasCompletedRegistration,
  showHeaderPromoBadge,
  packageBadgeSrc,
  promoMultiplier,
  promoThemePrimary,
  onStepClick,
}) => {
  return (
    <div className="relative w-full shrink-0">
      {showHeaderPromoBadge && (
        <div
          className={cn("absolute -top-1.5 sm:-top-2 z-20 pointer-events-none", currentStep === 2 ? "-right-0.5" : "-left-0.5")}
        >
          {packageBadgeSrc ? (
            <Image
              src={packageBadgeSrc}
              alt={`${promoMultiplier}x bonus entries`}
              width={72}
              height={72}
              className="w-10 h-10 sm:w-11 sm:h-11 object-contain drop-shadow-md"
              sizes="(max-width: 640px) 40px, 44px"
            />
          ) : (
            <div
              className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-700 text-sm sm:text-base font-black text-white shadow-md border border-amber-300/70"
              aria-label={`${promoMultiplier}x bonus entries`}
            >
              {promoMultiplier}x
            </div>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-0 w-full rounded-none border-0 border-b border-gray-200 dark:border-neutral-700 divide-x divide-gray-200 dark:divide-neutral-700">
        <button
          type="button"
          onClick={() => onStepClick(1)}
          style={currentStep === 1 ? { backgroundColor: promoThemePrimary } : undefined}
          className={`flex w-full items-center justify-center gap-1.5 py-2 px-2.5 sm:py-2.5 sm:px-3 min-h-0 transition-colors cursor-pointer ${
            currentStep === 1
              ? "text-white font-bold"
              : "bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-neutral-400 font-medium hover:bg-gray-200 dark:hover:bg-neutral-700"
          }`}
          aria-current={currentStep === 1 ? "step" : undefined}
        >
          <span
            className={`flex h-6 w-6 sm:h-6 sm:w-6 items-center justify-center rounded-full text-2xs sm:text-2xs font-black shrink-0 shadow-sm ring-1 ring-black/10 dark:ring-white/30 ${
              currentStep === 1 ? "bg-[#ffffff]" : "bg-gray-400 text-white dark:bg-neutral-600"
            }`}
            style={currentStep === 1 ? { color: promoThemePrimary } : undefined}
          >
            1
          </span>
          <span className="text-xs sm:text-sm whitespace-nowrap leading-tight">Your Details</span>
        </button>
        <button
          type="button"
          onClick={() => hasCompletedRegistration && onStepClick(2)}
          disabled={!hasCompletedRegistration}
          style={hasCompletedRegistration && currentStep === 2 ? { backgroundColor: promoThemePrimary } : undefined}
          className={`flex w-full items-center justify-center gap-1.5 py-2 px-2.5 sm:py-2.5 sm:px-3 min-h-0 transition-colors ${
            !hasCompletedRegistration
              ? "bg-gray-100 dark:bg-neutral-900 text-gray-400 dark:text-neutral-500 cursor-not-allowed opacity-80"
              : currentStep === 2
                ? "text-white font-bold cursor-pointer"
                : "bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-neutral-400 font-medium cursor-pointer hover:bg-gray-200 dark:hover:bg-neutral-700"
          }`}
          aria-current={currentStep === 2 ? "step" : undefined}
          aria-disabled={!hasCompletedRegistration}
          title={!hasCompletedRegistration ? "Complete your details first" : undefined}
        >
          <span
            className={`flex h-6 w-6 sm:h-6 sm:w-6 items-center justify-center rounded-full text-2xs sm:text-2xs font-black shrink-0 shadow-sm ring-1 ring-black/10 dark:ring-white/30 ${
              currentStep === 2 ? "bg-[#ffffff]" : "bg-gray-400 text-white dark:bg-neutral-600"
            }`}
            style={currentStep === 2 ? { color: promoThemePrimary } : undefined}
          >
            2
          </span>
          <span className="text-xs sm:text-sm whitespace-nowrap leading-tight">Billing Info</span>
        </button>
      </div>
    </div>
  );
};

export default StepIndicator;
