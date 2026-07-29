# Theme — Testing

## Automated

- `npm run test:theme-store` — [`src/stores/__tests__/themeStore.test.ts`](../../src/stores/__tests__/themeStore.test.ts).
  Fixtures for `migrateThemeState` (exported from `useThemeStore.ts` — see
  [architecture.md](./architecture.md#migration-migratethemestate-and-no-chaining)): the v0
  auto-dark demotion (`{ theme: "dark", userManualOverride: false }` → light), a v0
  user-chosen dark surviving with the flag preserved, and v1 records carrying forward
  unchanged. Pure — no DB, no React, no env.
- `npm run test:promo-theme-initial-state` — [`src/hooks/ab-testing/__tests__/promoThemeInitialState.test.ts`](../../src/hooks/ab-testing/__tests__/promoThemeInitialState.test.ts).
  Regression guard for `resolveInitialPromoThemeState` (the promo default-theme
  experiment's `useState` initializer, extracted for testability) — asserts the
  `!experimentId`-before-`storage` ordering that keeps a full-screen overlay out of
  CDN-cached ISR HTML when no experiment is active. See
  [ab-testing/frontend.md](../ab-testing/frontend.md#usepromothemeexperimentexperimentid).

## Manual smoke

- Fresh visitor (clear `ta-theme`), at night and/or with OS dark mode on → verify page loads **light** (no `.dark` on `<html>`)
- Toggle to dark → verify `.dark` on `<html>`; refresh → verify it persists with no flash
- Toggle back to light → refresh → verify it stays light
- Legacy auto-dark: set `localStorage["ta-theme"] = '{"state":{"theme":"dark","userManualOverride":false},"version":0}'` → reload → verify it resolves to **light**
- Promo route → verify promo theme override; navigate away → verify clean revert
- Admin panel → verify admin theme is independent
