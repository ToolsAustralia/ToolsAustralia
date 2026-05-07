# Theme — Frontend

## Components

[src/components/theme/](../../src/components/theme/) — theme switcher UI components.

## Hooks

See [architecture.md](./architecture.md#hooks).

## Bootstrap

`themeBootstrap.ts` runs in the root layout pre-React to set the initial theme class on `<html>`. Prevents flash of wrong theme.

## E2E test IDs

| Component | Testid | Notes |
|---|---|---|
| `ThemeToggleButton` (`src/components/ui/ThemeToggle.tsx`) | `theme-toggle-button` | Mounted in `Header.tsx` (top right cluster); also rendered as `PromotionsGuestThemeToggle` FAB on `/promotions/*` for guests. The button drives `useThemeToggleWithHold()` — tap toggles light/dark, ~550ms hold restores Sydney time-based auto theme. State is persisted to `localStorage["ta-theme"]` via Zustand persist; the inline boot script in `src/app/layout.tsx` reapplies the persisted theme before React hydrates so the `dark` class on `<html>` survives navigation. Covered by `e2e/consent/theme-toggle.spec.ts`. |
