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
    <div role="group" aria-label="Appearance" className="flex gap-1 rounded-2xl bg-black/[.05] p-1.5 dark:bg-white/[.06]">
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
              "flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl px-4 py-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600",
              on ? "bg-surface text-primary-token shadow-sm dark:text-white" : "text-muted-token hover:text-primary-token",
            )}
          >
            <Icon className="h-[18px] w-[18px]" /> {o.label}
          </button>
        );
      })}
    </div>
  );
}
