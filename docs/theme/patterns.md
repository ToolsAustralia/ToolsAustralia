# Theme — Patterns

## P1. Synchronous bootstrap script

Pre-React inline script reads cookie/localStorage and sets `<html>` class. No flash of unstyled / wrong theme.

## P2. Schedule-driven auto-mode

`themeSchedule.ts` computes "should be dark right now?" given the current Sydney time. `useAutoTheme()` watches the time and flips when scheduled.

## P3. Three contexts, one store

ThemeContext for member, AdminThemeContext for admin, PromoThemeStore for promo overrides. Each layer is independent — components consume the right one for their context.
