"use client";

import { motion, useReducedMotion } from "framer-motion";

interface EntryProgressBarProps {
  totalEntries: number;
  minimumEntries: number;
  variant?: "compact" | "full";
  showLabel?: boolean;
  className?: string;
}

function getProgressColor(percentage: number): string {
  if (percentage >= 85) return "from-red-600 to-red-675";
  if (percentage >= 60) return "from-yellow-400 to-yellow-500";
  return "from-green-500 to-green-600";
}

function getUrgencyText(percentage: number, remaining: number): string | null {
  if (remaining <= 0) return "Entries Closed";
  if (percentage >= 90) return "Almost Full!";
  if (percentage >= 75) return "Filling Fast";
  return null;
}

export default function EntryProgressBar({
  totalEntries,
  minimumEntries,
  variant = "compact",
  showLabel = true,
  className = "",
}: EntryProgressBarProps) {
  const prefersReduced = useReducedMotion();
  const percentage = minimumEntries > 0 ? Math.min(100, Math.round((totalEntries / minimumEntries) * 100)) : 0;
  const remaining = Math.max(minimumEntries - totalEntries, 0);
  const colorGradient = getProgressColor(percentage);
  const urgencyText = getUrgencyText(percentage, remaining);
  const isClosed = remaining <= 0;

  const isCompact = variant === "compact";
  const trackHeight = isCompact ? "h-1.5" : "h-2.5";
  const trackRounding = "rounded-full";

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className={`flex items-center justify-between ${isCompact ? "mb-1" : "mb-2"}`}>
          <span
            className={`font-medium ${isCompact ? "text-2xs sm:text-xs" : "text-xs sm:text-sm"} text-gray-700 dark:text-white`}
          >
            {isClosed ? (
              <span className="text-red-600 dark:text-red-400 font-semibold">Entries Closed</span>
            ) : (
              <>
                <span className="font-semibold">{remaining.toLocaleString()}</span> remaining
              </>
            )}
          </span>
          {!isCompact && (
            <span className={`text-xs font-semibold ${percentage >= 85 ? "text-red-600 dark:text-red-500" : "text-gray-500 dark:text-gray-400"}`}>
              {percentage}%
            </span>
          )}
          {isCompact && urgencyText && !isClosed && (
            <span className="text-3xs sm:text-2xs font-bold text-red-600 animate-pulse">{urgencyText}</span>
          )}
        </div>
      )}

      <div className={`w-full bg-gray-200 dark:bg-neutral-700 ${trackRounding} ${trackHeight} overflow-hidden`}>
        <motion.div
          className={`${trackHeight} ${trackRounding} bg-gradient-to-r ${colorGradient}`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={
            prefersReduced
              ? { duration: 0 }
              : { type: "spring", stiffness: 60, damping: 15, delay: 0.2 }
          }
        />
      </div>

      {!isCompact && urgencyText && !isClosed && (
        <div className="mt-1.5 flex items-center gap-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-600 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600" />
          </span>
          <span className="text-xs font-semibold text-red-600">{urgencyText}</span>
        </div>
      )}
    </div>
  );
}
