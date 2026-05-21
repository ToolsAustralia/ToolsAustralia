"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useThemeToggleWithHold } from "@/hooks/useThemeToggleWithHold";
import { cn } from "@/utils/cn";

/**
 * Header bar moon/sun control (matches user dashboard pattern).
 * Hold ~0.5s to restore time-based theme (Sydney).
 */
export function HeaderThemeToggle({ className = "" }: { className?: string }) {
  const { theme } = useTheme();
  const hold = useThemeToggleWithHold();

  return (
    <button
      type="button"
      onClick={hold.onClick}
      onPointerDown={hold.onPointerDown}
      onPointerUp={hold.onPointerUp}
      onPointerCancel={hold.onPointerCancel}
      onPointerLeave={hold.onPointerLeave}
      title="Tap: light / dark · Hold: match time of day (Sydney)"
      className={cn("p-2 rounded-lg touch-manipulation hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors", className)}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode. Hold to restore automatic theme by time of day.`}
    >
      {theme === "light" ? (
        <Moon className="w-5 h-5 text-gray-700 dark:text-gray-300" />
      ) : (
        <Sun className="w-5 h-5 text-gray-700 dark:text-gray-300" />
      )}
    </button>
  );
}
