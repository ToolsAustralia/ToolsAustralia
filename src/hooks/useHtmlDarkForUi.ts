"use client";

import { useThemeStore } from "@/stores/useThemeStore";

/**
 * Dark-mode flag aligned with Tailwind’s `class` strategy: `class="dark"` on
 * <html> is the source of truth, so portaled UIs (e.g. modals) match the visible
 * page, including /admin where AdminThemeContext drives the DOM while the main
 * store can still reflect the public-site preference. On the server, falls back
 * to the persisted store.
 */
export function useHtmlDarkForUi(): boolean {
  const storeIsDark = useThemeStore((s) => s.theme === "dark");
  if (typeof document === "undefined") {
    return storeIsDark;
  }
  return document.documentElement.classList.contains("dark");
}
