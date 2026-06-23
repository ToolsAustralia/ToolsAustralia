# Theme — Gotchas

## Legacy auto-dark must resolve to light

The removed v0 time-based switcher wrote `theme: "dark"` into `ta-theme` for **any** visitor who
loaded the site at night without manually toggling (those carry `userManualOverride === false`).
After the switch to "light default, manual only," those users must come back as **light**, not dark.
Three places enforce this with the same predicate — keep them in lockstep if you touch one:
the inline script in `layout.tsx`, the store `persist` `migrate`, and `readThemeFromPersistStorage()`.
A genuinely user-chosen dark (`userManualOverride !== false`, or new writes with no override field) stays dark.

## Promo theme stickiness

`usePromoThemeStore` overrides the user's theme. If the override doesn't clean up properly on route change, the promo theme leaks. Lifecycle: set on enter, clear on leave.

## Admin theme drift

Admin theme is independent. If you change member theme tokens, admin won't pick it up unless you explicitly sync — by design, since admin needs different visual hierarchy.

## SSR mismatch

Theme is `localStorage`-only (no cookie), so the server always renders light. The inline bootstrap
script applies `dark` before paint for a user-chosen dark, so there's no visible flash; `<html>` has
`suppressHydrationWarning` to absorb the server-light vs client-dark attribute difference.
