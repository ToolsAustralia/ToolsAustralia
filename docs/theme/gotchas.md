# Theme — Gotchas

## Legacy auto-dark must resolve to light

The removed v0 time-based switcher wrote `theme: "dark"` into `ta-theme` for **any** visitor who
loaded the site at night without manually toggling (those carry `userManualOverride === false`).
**FOUR** places resolve the stored record, and they must agree or the page paints one theme and
swaps after hydration. Keep them in lockstep if you touch one:

1. `THEME_BOOTSTRAP_SNIPPET` in [`inline-snippets.ts`](../../src/utils/security/inline-snippets.ts)
   — the inline script the root layout renders.
2. `readThemeFromPersistStorage()` in [`themeBootstrap.ts`](../../src/utils/themeBootstrap.ts).
3. `migrateThemeState` in [`useThemeStore.ts`](../../src/stores/useThemeStore.ts).
4. The store's own initial `theme` value.

> ⚠️ **The inline snippet is CSP-hash-allowlisted.** Its sha256 is pinned in
> [`csp.ts`](../../src/utils/security/csp.ts) (in the comment AND the `script-src` list — two
> occurrences). Edit the snippet without recomputing both and the browser **blocks the
> script**: no class on `<html>` before hydration, so every page flashes the wrong theme.
> `npm run test:csp-inline-hashes` is the guard — run it after any snippet edit.

**Since 2026-08-05 the default is DARK**, so the predicate inverted: dark is applied unless the
visitor explicitly chose light (`theme === "light" && userManualOverride === true`). The v0
auto-dark records (`userManualOverride === false`) now land on dark too — as the *default*, not
by inheriting the old bug, so they stay unmarked. The flag must never be persisted as `false`;
absent is what keeps "never chose" distinguishable from "chose".

## Promo theme stickiness

`usePromoThemeStore` overrides the user's theme. If the override doesn't clean up properly on route change, the promo theme leaks. Lifecycle: set on enter, clear on leave.

## Admin theme drift

Admin theme is independent. If you change member theme tokens, admin won't pick it up unless you explicitly sync — by design, since admin needs different visual hierarchy.

## SSR mismatch

Theme is `localStorage`-only (no cookie), so the server always renders light. The inline bootstrap
script applies `dark` before paint for a user-chosen dark, so there's no visible flash; `<html>` has
`suppressHydrationWarning` to absorb the server-light vs client-dark attribute difference.
