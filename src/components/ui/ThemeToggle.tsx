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
 * Authenticated users get this control inside PromotionsAccountButton's column — the two are
 * mutually exclusive, and both live BOTTOM-LEFT so they never stack.
 * Docks at the shared FLOATING_DOCK offsets (`bottom-5 left-5`) and bottom-aligns with the
 * Cobber launcher, which owns bottom-right here as it does site-wide.
 */
export function PromotionsGuestThemeToggle() {
  const pathname = usePathname();
  const { isAuthenticated, loading } = useUserContext();
  const onPromotionsRoute = pathname === "/promotions" || pathname?.startsWith("/promotions/");
  const show = Boolean(onPromotionsRoute) && !loading && !isAuthenticated;
  // Lift above any bottom-LEFT floating obstacle when it scrolls in — the same collision-dodge
  // the Cobber launcher uses. Returns 0 (keep the default bottom-5) when clear.
  // 48 = this button's h-12, the disc that actually occupies the corner.
  const dodgeBottom = useDodgeFloatingObstacles("left", show, 48);

  if (!show) return null;

  return (
    <div
      // `promo-dock-supersedes`: hidden below `lg` while PromoBottomDock is mounted — its
      // drawer carries the Dark mode switch there. See globals.css.
      className="promo-dock-supersedes fixed z-[55] pointer-events-auto bottom-5 left-5 transition-[bottom] duration-300 ease-out"
      style={dodgeBottom > 0 ? { bottom: dodgeBottom } : undefined}
    >
      <ThemeToggleButton />
    </div>
  );
}
