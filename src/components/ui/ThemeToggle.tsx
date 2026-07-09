"use client";

import type { CSSProperties } from "react";
import { Sun, Moon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useThemeStore } from "@/stores/useThemeStore";
import { useUserContext } from "@/contexts/UserContext";
import { useDodgeFloatingObstacles } from "@/components/support-chat/useDodgeFloatingObstacles";

/**
 * Round light/dark control (sun/moon). Used on promotions: guest FAB and can be composed elsewhere.
 * Tap to switch between light and dark; the choice is remembered.
 */
export function ThemeToggleButton({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  const { theme, toggleTheme } = useThemeStore();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title="Switch between light and dark mode"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode.`}
      style={style}
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
  const show = Boolean(onPromotionsRoute) && !loading && !isAuthenticated;
  // Lift above the full-width floating "Enter Now" bar (and any other bottom
  // right-corner floating widget) when it scrolls in — the same collision-dodge
  // the Cobber launcher uses. Returns 0 (keep the default bottom-4) when clear.
  const dodgeBottom = useDodgeFloatingObstacles("right", show);

  if (!show) return null;

  return (
    <div
      className="fixed z-[55] pointer-events-auto bottom-4 right-4 transition-[bottom] duration-300 ease-out"
      style={dodgeBottom > 0 ? { bottom: dodgeBottom } : undefined}
    >
      <ThemeToggleButton />
    </div>
  );
}
