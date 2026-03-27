"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark";

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  /** Enable automatic theme switching based on time of day (6 PM AEST = dark, 6 AM AEST = light) */
  autoThemeEnabled: boolean;
  setAutoThemeEnabled: (enabled: boolean) => void;
  /** Track if user manually overrode the theme (disables auto-theme until re-enabled) */
  userManualOverride: boolean;
  setUserManualOverride: (override: boolean) => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: "light",
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((state) => ({
          theme: state.theme === "light" ? "dark" : "light",
          // When user manually toggles, disable auto-theme
          userManualOverride: true,
        })),
      autoThemeEnabled: true,
      setAutoThemeEnabled: (enabled) => set({ autoThemeEnabled: enabled }),
      userManualOverride: false,
      setUserManualOverride: (override) => set({ userManualOverride: override }),
    }),
    {
      name: "ta-theme",
    }
  )
);
