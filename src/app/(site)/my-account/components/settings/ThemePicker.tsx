"use client";

import { Sun, Moon } from "lucide-react";
import { cn } from "@/utils/cn";
import { useTheme } from "@/hooks/useTheme";

const OPTIONS = [
  { value: "light" as const, label: "Light", icon: Sun },
  { value: "dark" as const, label: "Dark", icon: Moon },
];

/**
 * Appearance theme picker — Light / Dark segmented control. The app supports
 * only light/dark (System was deliberately removed), so this is a 2-way toggle
 * wired to the existing ThemeContext (persists to localStorage["ta-theme"]).
 */
export default function ThemePicker() {
  const { theme, setTheme } = useTheme();
  return (
    <div role="group" aria-label="Appearance" className="grid grid-cols-2 gap-2">
      {OPTIONS.map((o) => {
        const Icon = o.icon;
        const on = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => setTheme(o.value)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600",
              on
                ? "border-red-600 bg-red-50 text-red-700 dark:border-red-500 dark:bg-red-500/15 dark:text-red-300"
                : "border-token bg-surface text-muted-token hover:text-primary-token",
            )}
          >
            <Icon className="h-4 w-4" /> {o.label}
          </button>
        );
      })}
    </div>
  );
}
