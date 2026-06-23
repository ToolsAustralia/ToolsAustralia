# Theme — Architecture

## Three contexts

- [src/contexts/ThemeContext.tsx](../../src/contexts/ThemeContext.tsx) — main user theme
- [src/contexts/AdminThemeContext.tsx](../../src/contexts/AdminThemeContext.tsx) — admin override (separate panel theme)
- [src/stores/usePromoThemeStore.ts](../../src/stores/usePromoThemeStore.ts) — promo-driven theme overrides (Zustand)

## Stores

- [src/stores/useThemeStore.ts](../../src/stores/useThemeStore.ts) — Zustand for theme state

## Default & persistence

**Light is the hard default.** The theme changes only when the user taps the toggle; the
choice is persisted in `localStorage` under `ta-theme` (Zustand `persist`). No time-of-day
or `prefers-color-scheme` auto mode — a new visitor always gets light regardless of clock or
OS preference.

[src/stores/useThemeStore.ts](../../src/stores/useThemeStore.ts) holds `{ theme, setTheme, toggleTheme }`
and a `persist` `version: 1` `migrate` that resolves **legacy auto-dark** (v0 wrote `theme: "dark"`
with `userManualOverride === false` for users who never chose dark) back to the light default,
while keeping a genuinely user-chosen dark.

## Bootstrap

[src/utils/themeBootstrap.ts](../../src/utils/themeBootstrap.ts) — `readThemeFromPersistStorage()`
returns the *effective* theme from `localStorage` (legacy auto-dark resolves to light). A small
inline script in [src/app/layout.tsx](../../src/app/layout.tsx) applies `dark` before React hydrates
**only** for a genuinely user-chosen dark, so a dark user never flashes light and everyone else stays light.

## Hooks

| Hook | Purpose |
|---|---|
| `useTheme()` | Read current theme + `setTheme` / `toggleTheme` |
| `useHtmlDarkForUi()` | Apply `dark` class to `<html>` for UI rendering |

The light/dark toggle buttons ([ThemeToggle.tsx](../../src/components/ui/ThemeToggle.tsx),
[HeaderThemeToggle.tsx](../../src/components/ui/HeaderThemeToggle.tsx)) call `toggleTheme` on tap.
