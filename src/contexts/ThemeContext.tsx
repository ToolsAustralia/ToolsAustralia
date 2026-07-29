"use client";

import React, { createContext, useContext, useLayoutEffect, useRef, ReactNode } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { readThemeFromPersistStorage } from "@/utils/themeBootstrap";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const { theme, setTheme, toggleTheme } = useThemeStore();
  const bootstrapped = useRef(false);

  // Light is the default; the theme only changes when the user toggles it. No time-based auto mode.

  // Align Zustand with inline head script + localStorage before paint (avoids stripping `dark` on first client render)
  useLayoutEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    if (typeof window === "undefined") return;
    try {
      const root = document.documentElement;
      const stored = readThemeFromPersistStorage();
      const resolved: Theme =
        stored ?? (root.classList.contains("dark") ? "dark" : "light");
      useThemeStore.setState({ theme: resolved });
      if (resolved === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    } catch {
      /* ignore */
    }
  }, []);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    const root = document.documentElement;

    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
