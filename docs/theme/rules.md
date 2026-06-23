# Theme — Rules

## R1. No flash on initial paint

`themeBootstrap.ts` runs synchronously in the root layout to set `<html class>` before React mounts. Don't try to set theme via `useEffect` — that paints wrong theme first.

## R2. Light is the default; only the user toggle changes it

The theme is light unless the user taps the light/dark toggle. Do **not** reintroduce any
time-of-day or `prefers-color-scheme` auto mode — light at all costs unless explicitly toggled.
A user-chosen dark persists; legacy auto-dark is migrated back to light.

## R3. Promo themes are overrides

`usePromoThemeStore` overrides the user theme on specific routes. The override cleans up on navigation away. Don't make promo themes sticky.

## R4. Admin theme is separate

Admin panel uses `AdminThemeContext`. Member-side theme settings don't affect admin appearance.
