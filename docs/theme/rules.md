# Theme — Rules

## R1. No flash on initial paint

`themeBootstrap.ts` runs synchronously in the root layout to set `<html class>` before React mounts. Don't try to set theme via `useEffect` — that paints wrong theme first.

## R2. Schedule uses Sydney time

Auto-theme schedule is computed in `Australia/Sydney` via `date-fns-tz`. Don't use UTC or browser local time.

## R3. Promo themes are overrides

`usePromoThemeStore` overrides the user theme on specific routes. The override cleans up on navigation away. Don't make promo themes sticky.

## R4. Admin theme is separate

Admin panel uses `AdminThemeContext`. Member-side theme settings don't affect admin appearance.
