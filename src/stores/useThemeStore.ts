"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark";

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

/**
 * App theme store. Light is the hard default — the theme only ever changes when the
 * user taps the light/dark toggle. There is no time-of-day / system-preference auto mode.
 */
export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: "light",
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((state) => ({ theme: state.theme === "light" ? "dark" : "light" })),
    }),
    {
      name: "ta-theme",
      version: 1,
      // v0 ran a time-based auto-switcher that wrote `theme: "dark"` for users who never
      // chose it (those have `userManualOverride === false`). Honour dark only when the
      // user actually toggled it; otherwise fall back to the light default.
      migrate: (persisted) => {
        const prev = (persisted ?? {}) as {
          theme?: unknown;
          userManualOverride?: unknown;
        };
        const userChoseDark =
          prev.theme === "dark" && prev.userManualOverride !== false;
        return { theme: userChoseDark ? "dark" : "light" } as Partial<ThemeStore>;
      },
    }
  )
);
