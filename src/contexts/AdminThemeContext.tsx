"use client";

import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState } from "react";
import { useThemeStore } from "@/stores/useThemeStore";

const ADMIN_THEME_STORAGE_KEY = "ta-admin-theme";

const THEME_COLOR_LIGHT = "#ffffff";
const THEME_COLOR_DARK = "#0a0a0a";

type AdminTheme = "light" | "dark";

function readAdminThemeFromStorage(): AdminTheme {
  if (typeof window === "undefined") return "light";
  try {
    const raw = localStorage.getItem(ADMIN_THEME_STORAGE_KEY);
    if (raw === "dark" || raw === "light") return raw;
  } catch {
    /* ignore */
  }
  return "light";
}

function persistAdminTheme(theme: AdminTheme) {
  try {
    localStorage.setItem(ADMIN_THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

function applyRootVisual(theme: "light" | "dark") {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", theme === "dark" ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
  document.documentElement.style.colorScheme = theme;
}

interface AdminThemeContextValue {
  adminTheme: AdminTheme;
  toggleAdminTheme: () => void;
}

const AdminThemeContext = createContext<AdminThemeContextValue | null>(null);

export function AdminThemeProvider({ children }: { children: React.ReactNode }) {
  const [adminTheme, setAdminTheme] = useState<AdminTheme>("light");

  // Read persisted admin theme before paint (default first visit: light; no timed auto mode in admin)
  useLayoutEffect(() => {
    setAdminTheme(readAdminThemeFromStorage());
  }, []);

  // On exit from /admin, restore DOM + browser chrome to the main app store (we never mutate useThemeStore in admin)
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    return () => {
      const mainTheme = useThemeStore.getState().theme;
      if (mainTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      applyRootVisual(mainTheme);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    applyRootVisual(adminTheme);
    persistAdminTheme(adminTheme);
  }, [adminTheme]);

  const toggleAdminTheme = useCallback(() => {
    setAdminTheme((t) => (t === "light" ? "dark" : "light"));
  }, []);

  const value: AdminThemeContextValue = {
    adminTheme,
    toggleAdminTheme,
  };

  return <AdminThemeContext.Provider value={value}>{children}</AdminThemeContext.Provider>;
}

export function useAdminTheme(): AdminThemeContextValue {
  const ctx = useContext(AdminThemeContext);
  if (!ctx) {
    throw new Error("useAdminTheme must be used within AdminThemeProvider");
  }
  return ctx;
}
