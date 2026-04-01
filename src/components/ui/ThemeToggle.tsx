"use client";

import { Sun, Moon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useThemeStore } from "@/stores/useThemeStore";
import { useUserContext } from "@/contexts/UserContext";
import { useThemeToggleWithHold } from "@/hooks/useThemeToggleWithHold";

/**
 * Round light/dark control (sun/moon). Used on promotions: guest FAB and can be composed elsewhere.
 * Hold ~0.5s to turn time-based theme (Sydney) back on after a manual toggle.
 */
export function ThemeToggleButton({ className }: { className?: string }) {
  const { theme, autoThemeEnabled, userManualOverride } = useThemeStore();
  const hold = useThemeToggleWithHold();
  const autoPaused = !autoThemeEnabled || userManualOverride;

  return (
    <button
      type="button"
      onClick={hold.onClick}
      onPointerDown={hold.onPointerDown}
      onPointerUp={hold.onPointerUp}
      onPointerCancel={hold.onPointerCancel}
      onPointerLeave={hold.onPointerLeave}
      title="Tap: light / dark · Hold: match time of day (Sydney)"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode. Hold to restore automatic theme by time of day.`}
      className={
        className ??
        "group relative flex h-12 w-12 shrink-0 touch-manipulation items-center justify-center rounded-full bg-white/90 backdrop-blur-sm shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-xl active:scale-95 dark:bg-black/90 border border-gray-200 dark:border-gray-700"
      }
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
      {autoPaused && (
        <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-orange-500 border-2 border-white dark:border-black animate-pulse" />
      )}
    </button>
  );
}

/**
 * Floating theme toggle for guests on `/promotions/*` only.
 * Authenticated users get the control inside PromotionsAccountButton (same corner as the FAB).
 */
export function PromotionsGuestThemeToggle() {
  const pathname = usePathname();
  const { isAuthenticated, loading } = useUserContext();
  const onPromotionsRoute = pathname === "/promotions" || pathname?.startsWith("/promotions/");

  if (!onPromotionsRoute || loading || isAuthenticated) return null;

  return (
    <div className="fixed bottom-32 right-4 z-[55] sm:bottom-36 pointer-events-auto">
      <ThemeToggleButton />
    </div>
  );
}
