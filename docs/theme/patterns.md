# Theme — Patterns

## P1. Synchronous bootstrap script

Pre-React inline script (in `layout.tsx`) reads `localStorage` (`ta-theme`) and sets the `<html>`
`dark` class. No flash of unstyled / wrong theme. It applies `dark` **only** for a genuinely
user-chosen dark; the default (and every legacy auto-dark) is light.

## P2. Light default, manual toggle only

The theme is light unless the user taps the toggle. There is no time-of-day / system-preference
auto mode. A manual choice persists in `ta-theme`; legacy auto-dark (v0 `userManualOverride === false`)
is migrated back to light via the store's `persist` `migrate`. The inline script, the store `migrate`,
and `readThemeFromPersistStorage()` all apply the same rule — *dark counts only when the user chose it*
(`theme === "dark" && userManualOverride !== false`).

## P3. Three contexts, one store

ThemeContext for member, AdminThemeContext for admin, PromoThemeStore for promo overrides. Each layer is independent — components consume the right one for their context.
