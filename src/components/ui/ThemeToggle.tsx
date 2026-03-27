"use client";

import { Sun, Moon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useThemeStore } from "@/stores/useThemeStore";

/**
 * Floating theme toggle — light / dark switch with optional orange dot when auto-theme is off.
 * Shown only on `/promotions/*` (not admin, dashboard, home, etc.).
 */
export default function ThemeToggle() {
  const pathname = usePathname();
  const onPromotionsRoute = pathname === "/promotions" || pathname?.startsWith("/promotions/");

  const { theme, toggleTheme, autoThemeEnabled } = useThemeStore();

  if (!onPromotionsRoute) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999]">
      <button
        type="button"
        onClick={() => toggleTheme()}
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        className="group relative flex h-12 w-12 items-center justify-center rounded-full bg-white/90 dark:bg-black/90 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 active:scale-95 border border-gray-200 dark:border-gray-700"
      >
        <Sun
          className={`absolute h-5 w-5 text-yellow-500 transition-all duration-500 ${
            theme === "dark" ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
          }`}
        />
        <Moon
          className={`absolute h-5 w-5 text-blue-400 transition-all duration-500 ${
            theme === "dark" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
          }`}
        />
        {!autoThemeEnabled && (
          <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-orange-500 border-2 border-white dark:border-black animate-pulse" />
        )}
      </button>
    </div>
  );
}
