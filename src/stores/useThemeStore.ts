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
 * Migrate a persisted theme record to v3.
 *
 * zustand calls this ONCE with the stored version and does not chain, so this
 * function must handle a v0 or v2 record directly.
 *
 * v3 (2026-08-05) flipped the default to dark after the "Promo landing — default
 * theme" experiment: dark converted 2.04% vs light 1.74% over ~6.1k users per arm.
 * The version bump is what re-runs this for the existing audience — without it,
 * everyone already carrying a v2 record keeps `theme: "light"` forever and the new
 * default only reaches new visitors.
 *
 * A REAL choice still wins. `userManualOverride === true` means the user worked the
 * toggle themselves, so their theme is preserved verbatim — including light. Everyone
 * else moves to the new dark default, which covers both untouched v2 records and the
 * v0 auto-switcher's `userManualOverride === false` writes.
 */
export function migrateThemeState(persisted: unknown, _version: number): Partial<ThemeStore> {
  const prev = (persisted ?? {}) as { theme?: unknown; userManualOverride?: unknown };
  const chosen = prev.userManualOverride === true;
  const next: Partial<ThemeStore> = {
    theme: chosen && prev.theme === "light" ? "light" : "dark",
  };
  if (chosen) next.userManualOverride = true;
  return next;
}

/**
 * App theme store. DARK is the hard default (2026-08-05). The theme changes when the user
 * toggles it, or when the promo default-theme experiment assigns one — the
 * latter writes via `useThemeStore.setState`, so it never sets
 * `userManualOverride` and never overrides a real choice.
 */
export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: "dark",
      setTheme: (theme) => set({ theme, userManualOverride: true }),
      toggleTheme: () =>
        set((state) => ({
          theme: state.theme === "light" ? "dark" : "light",
          userManualOverride: true,
        })),
    }),
    {
      name: "ta-theme",
      version: 3,
      migrate: migrateThemeState,
    }
  )
);
