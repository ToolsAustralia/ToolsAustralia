"use client";

import React, { createContext, useContext, useEffect, ReactNode } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { useAutoTheme } from "@/hooks/useAutoTheme";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
  scoped?: boolean;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children, scoped = false }) => {
  const { theme, setTheme, toggleTheme } = useThemeStore();
  
  // Enable auto-theme switching based on time of day (6 PM AEST = dark, 6 AM AEST = light)
  useAutoTheme();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const root = document.documentElement;

    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    if (scoped) {
      return () => {
        root.classList.remove("dark");
      };
    }
  }, [theme, scoped]);

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
