"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark";

interface ThemeStore {
  theme: Theme;
  /**
   * `true` once the visitor has picked a theme themselves. Set ONLY by
   * setTheme/toggleTheme (the header toggle, the promo toggle, the account
   * ThemePicker). Never written as `false`: a stored `false` makes both readers
   * — the CSP-hashed inline snippet (`o !== false`) and
   * readThemeFromPersistStorage — demote dark to light, which would silently
   * evaporate the dark arm of the promo theme experiment on every hard load.
   * Bootstrapping and the experiment both write through setState, which
   * bypasses these actions and therefore leaves the flag untouched.
   */
  userManualOverride?: true;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

/**
 * Migrate a persisted theme record to v2.
 *
 * zustand calls this ONCE with the stored version and does not chain, so this
 * function must handle a v0 record directly. v0 ran a time-based auto-switcher
 * that wrote `theme: "dark"` for users who never chose it (those carry
 * `userManualOverride === false`); honour dark only when the user actually
 * toggled, otherwise fall back to the light default.
 */
export function migrateThemeState(persisted: unknown, _version: number): Partial<ThemeStore> {
  const prev = (persisted ?? {}) as { theme?: unknown; userManualOverride?: unknown };
  const userChoseDark = prev.theme === "dark" && prev.userManualOverride !== false;
  const next: Partial<ThemeStore> = { theme: userChoseDark ? "dark" : "light" };
  if (prev.userManualOverride === true) next.userManualOverride = true;
  return next;
}

/**
 * App theme store. Light is the hard default. The theme changes when the user
 * toggles it, or when the promo default-theme experiment assigns one — the
 * latter writes via `useThemeStore.setState`, so it never sets
 * `userManualOverride` and never overrides a real choice.
 */
export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: "light",
      setTheme: (theme) => set({ theme, userManualOverride: true }),
      toggleTheme: () =>
        set((state) => ({
          theme: state.theme === "light" ? "dark" : "light",
          userManualOverride: true,
        })),
    }),
    {
      name: "ta-theme",
      version: 2,
      migrate: migrateThemeState,
    }
  )
);
