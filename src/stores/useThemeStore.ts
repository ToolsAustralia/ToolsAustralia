"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getScheduledThemeForSydney } from "@/utils/themeSchedule";

type Theme = "light" | "dark";

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  /** Re-enable time-based theme (Sydney 6pm–6am dark) and apply the current slot immediately */
  restoreAutoTheme: () => void;
  /** Enable automatic theme switching based on time of day (6 PM AEST = dark, 6 AM AEST = light) */
  autoThemeEnabled: boolean;
  setAutoThemeEnabled: (enabled: boolean) => void;
  /** Track if user manually overrode the theme (disables auto-theme until re-enabled) */
  userManualOverride: boolean;
  setUserManualOverride: (override: boolean) => void;
  /** When the user last toggled manually; used to detect Sydney schedule boundary crossings */
  overrideTimestamp: number | null;
  setOverrideTimestamp: (ts: number | null) => void;
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
          overrideTimestamp: Date.now(),
        })),
      restoreAutoTheme: () =>
        set({
          userManualOverride: false,
          autoThemeEnabled: true,
          theme: getScheduledThemeForSydney(),
          overrideTimestamp: null,
        }),
      autoThemeEnabled: true,
      setAutoThemeEnabled: (enabled) => set({ autoThemeEnabled: enabled }),
      userManualOverride: false,
      setUserManualOverride: (override) =>
        set((s) => ({
          userManualOverride: override,
          ...(override ? {} : { overrideTimestamp: null as number | null }),
        })),
      overrideTimestamp: null,
      setOverrideTimestamp: (ts) => set({ overrideTimestamp: ts }),
    }),
    {
      name: "ta-theme",
    }
  )
);
