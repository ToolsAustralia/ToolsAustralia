"use client";

import { useEffect } from "react";
import { useThemeStore } from "@/stores/useThemeStore";

const THEME_COLOR_LIGHT = "#ffffff";
const THEME_COLOR_DARK = "#0a0a0a";

/**
 * Single owner for `theme-color` meta and `color-scheme` on the root element.
 */
export default function ThemeMetaSync() {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", theme === "dark" ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  return null;
}
