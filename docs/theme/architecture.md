# Theme — Architecture

## Three contexts

- [src/contexts/ThemeContext.tsx](../../src/contexts/ThemeContext.tsx) — main user theme
- [src/contexts/AdminThemeContext.tsx](../../src/contexts/AdminThemeContext.tsx) — admin override (separate panel theme)
- [src/stores/usePromoThemeStore.ts](../../src/stores/usePromoThemeStore.ts) — promo-driven theme overrides (Zustand)

## Stores

- [src/stores/useThemeStore.ts](../../src/stores/useThemeStore.ts) — Zustand for theme state

## Bootstrap

[src/utils/themeBootstrap.ts](../../src/utils/themeBootstrap.ts) — sets initial theme on first paint to avoid flash. Read from cookie / localStorage before React mounts.

## Schedule-based auto

[src/utils/themeSchedule.ts](../../src/utils/themeSchedule.ts) — auto theme switches at specific times of day.

## Hooks

| Hook | Purpose |
|---|---|
| `useTheme()` | Read/write current theme |
| `useAutoTheme()` | Auto-switch based on schedule |
| `useThemeToggleWithHold()` | UI for toggling with hold-to-confirm |
| `useHtmlDarkForUi()` | Apply `dark` class to `<html>` for UI rendering |
