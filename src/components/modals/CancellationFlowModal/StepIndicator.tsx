"use client";

import React from "react";
import { cn } from "@/utils/cn";
import type { FlowState } from "./types";

interface StepConfig {
  label: string;
  /** The modal step value(s) that map to this indicator position. */
  steps: FlowState["step"][];
}

/**
 * Shows 2 indicator dots: "Reason" (step 1) and "Confirm" (step 4).
 * Steps 2/3 (Phase-2 offers) are collapsed into the Confirm dot until they ship.
 * Forward steps are disabled until the prerequisite step is reached.
 */
const STEP_CONFIGS: StepConfig[] = [
  { label: "Reason", steps: [1] },
  { label: "Confirm", steps: [2, 3, 4] },
];

interface StepIndicatorProps {
  state: FlowState;
}

const StepIndicator: React.FC<StepIndicatorProps> = ({ state }) => {
  const { step } = state;

  const getIndicatorIndex = (): number => {
    if (step === 1) return 0;
    return 1; // steps 2, 3, 4 all map to the second indicator
  };

  const currentIndicator = getIndicatorIndex();
  const hasReachedStep4 = step >= 2; // second indicator is "accessible" once step 1 is done

  return (
    <div className="grid grid-cols-2 gap-0 w-full rounded-none border-0 border-b border-gray-200 dark:border-neutral-700 divide-x divide-gray-200 dark:divide-neutral-700 shrink-0">
      {STEP_CONFIGS.map((config, idx) => {
        const isActive = currentIndicator === idx;
        const isAccessible = idx === 0 || hasReachedStep4;
        const isDisabled = !isAccessible;

        return (
          <div
            key={config.label}
            aria-current={isActive ? "step" : undefined}
            aria-disabled={isDisabled}
            className={cn(
              "flex w-full items-center justify-center gap-1.5 py-2 px-2.5 sm:py-2.5 sm:px-3 min-h-0 transition-colors",
              isActive
                ? "bg-gradient-to-r from-red-600 via-[#ff3333] to-red-400 text-white font-bold"
                : isDisabled
                  ? "bg-gray-100 dark:bg-neutral-900 text-gray-400 dark:text-neutral-500 opacity-80"
                  : "bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-neutral-400 font-medium"
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-2xs font-black shrink-0 shadow-sm ring-1 ring-black/10 dark:ring-white/30",
                isActive ? "bg-white text-red-600" : "bg-gray-400 dark:bg-neutral-600 text-white"
              )}
            >
              {idx + 1}
            </span>
            <span className="text-xs sm:text-sm whitespace-nowrap leading-tight">{config.label}</span>
          </div>
        );
      })}
    </div>
  );
};

export default StepIndicator;
