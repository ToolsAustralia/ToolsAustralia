/**
 * Freeze Period Banner Component
 *
 * Displays a warning banner when the major draw is in freeze period.
 * Shows countdown timer until draw date.
 * Informs users that entries will go to next month's draw.
 *
 * Banner is always visible and cannot be dismissed for critical user communication.
 */

"use client";

import { useEffect, useState } from "react";
import { formatCountdown } from "@/utils/common/timezone";

interface FreezePeriodBannerProps {
  /** Name of the next draw entries will go to */
  nextDrawName: string;
  /** Milliseconds until draw date */
  timeUntilDraw: number;
  /** Current major draw status */
  status: "frozen" | "active";
  /** Optional custom className */
  className?: string;
}

/**
 * Freeze Period Banner Component
 * Shows critical information during freeze period
 */
export default function FreezePeriodBanner({
  nextDrawName,
  timeUntilDraw: initialTimeUntilDraw,
  status,
  className = "",
}: FreezePeriodBannerProps) {
  const [timeRemaining, setTimeRemaining] = useState(initialTimeUntilDraw);

  // Update countdown every second
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining((prev) => Math.max(0, prev - 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Sync with server-provided time when it changes
  useEffect(() => {
    setTimeRemaining(initialTimeUntilDraw);
  }, [initialTimeUntilDraw]);

  const countdown = formatCountdown(timeRemaining);

  return (
    <div
      className={`w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-4 py-3 sm:px-6 sm:py-4 shadow-lg ${className}`}
      role="alert"
      aria-live="polite"
    >
      <div className="max-w-7xl mx-auto">
        {/* Mobile: Compact Layout */}
        <div className="flex items-center justify-between gap-3 sm:hidden">
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm">Draw Closing Soon!</div>
            <div className="text-xs font-medium truncate">Entries → {nextDrawName}</div>
          </div>
          <div className="flex-shrink-0 bg-white/20 backdrop-blur-sm rounded-lg px-3 py-1.5">
            <div className="text-xs font-bold tabular-nums">{countdown}</div>
          </div>
        </div>

        {/* Desktop: Full Layout */}
        <div className="hidden sm:flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <div className="font-bold text-lg">Current Draw Closing Soon!</div>
            <div className="text-sm font-medium">
              New entries will count toward <span className="font-bold">{nextDrawName}</span>
            </div>
          </div>

          {/* Countdown Timer */}
          <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2">
            <div className="flex flex-col items-center">
              <div className="text-xs font-medium opacity-90">Draw in</div>
              <div className="text-lg font-bold tabular-nums">{countdown}</div>
            </div>
          </div>
        </div>

        {/* Progress bar (desktop only) */}
        {timeRemaining > 0 && (
          <div className="mt-2 sm:mt-3 w-full bg-white/20 rounded-full h-1 overflow-hidden hidden sm:block">
            <div
              className="bg-white h-full transition-all duration-1000 ease-linear"
              style={{
                width: `${Math.max(0, Math.min(100, (timeRemaining / (30 * 60 * 1000)) * 100))}%`,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
