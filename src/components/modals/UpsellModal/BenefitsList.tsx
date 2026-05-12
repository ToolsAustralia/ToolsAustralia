"use client";

import React from "react";
import { CheckCircle, ChevronDown } from "lucide-react";
import { cn } from "@/utils/cn";

interface BenefitsListProps {
  packageInclusionLines: string[];
  showFullInclusions: boolean;
  onToggle: () => void;
}

const BenefitsList: React.FC<BenefitsListProps> = ({
  packageInclusionLines,
  showFullInclusions,
  onToggle,
}) => {
  if (packageInclusionLines.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-300 shadow-sm dark:border-neutral-600">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={showFullInclusions}
        className="flex w-full items-center justify-center gap-2 bg-white py-2.5 px-4 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 dark:bg-neutral-800/80 dark:text-neutral-100 dark:hover:bg-neutral-700/80 sm:py-3 sm:text-base"
      >
        <span>{showFullInclusions ? "Hide package inclusions" : "See full package inclusions"}</span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 transition-transform duration-200 sm:h-5 sm:w-5", showFullInclusions ? "rotate-180" : "")}
          aria-hidden
        />
      </button>
      {showFullInclusions && (
        <div
          className="border-t border-gray-200 bg-gray-50/95 px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900/60 sm:px-4"
          role="region"
          aria-label="Package inclusions"
        >
          <ul className="space-y-2 text-left text-sm text-gray-700 dark:text-neutral-300 sm:text-base">
            {packageInclusionLines.map((line, idx) => (
              <li key={`${idx}-${line}`} className="flex gap-2">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-500" aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default BenefitsList;
