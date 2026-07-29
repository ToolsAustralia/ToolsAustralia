# Theme — Rules

## R1. No flash on initial paint

`themeBootstrap.ts` runs synchronously in the root layout to set `<html class>` before React mounts. Don't try to set theme via `useEffect` — that paints wrong theme first.

## R2. Light is the default; only the user toggle — or the promo default-theme experiment — changes it

Light is the hard default for a fresh, un-experimented visitor. Do **not** reintroduce any
time-of-day or `prefers-color-scheme` auto mode — no clock- or OS-based auto mode, ever.

**Updated (2026-07-28):** this is no longer strictly "only the user toggle." The promo
landing default-theme A/B experiment (`usePromoThemeExperiment`,
`src/hooks/ab-testing/usePromoThemeExperiment.ts`) is a **second, non-user writer** of the
default theme — for a visitor bucketed into its dark arm, the *default* they land on is
dark, not light, before they have touched any toggle. What R2's real invariant protects is
unchanged: **a manual toggle still wins, permanently.** `setTheme` / `toggleTheme` are the
only writers that set `userManualOverride: true`, that flag is never persisted as `false`
(see [architecture.md](./architecture.md#usermanualoverride-never-persist-false)), and both
the experiment and `ThemeContext`'s own bootstrap write through the unmarked
`useThemeStore.setState` path specifically so neither is ever mistaken for a user choice.
A visitor who has toggled is excluded from the experiment entirely (see
[ab-testing/frontend.md](../ab-testing/frontend.md#usepromothemeexperimentexperimentid)).
A user-chosen dark persists; legacy auto-dark is migrated back to light.

## R3. Promo themes are overrides

`usePromoThemeStore` overrides the user theme on specific routes. The override cleans up on
navigation away. Don't make promo themes sticky.

**Not reversed by the default-theme experiment (2026-07-28):** this rule is about the promo
**brand/accent** theme store (`usePromoThemeStore`, `src/stores/usePromoThemeStore.ts`) —
the per-route colour override that cleans up when the visitor navigates away. The promo
default-theme A/B experiment is a different mechanism entirely: it writes the **global**
light/dark store (`useThemeStore`, persisted key `ta-theme`), which is deliberately
**sticky across the whole site and across visits** by design — see "Why global + sticky" in
`docs/superpowers/specs/2026-07-28-promo-theme-split-design.md` (the conversion event
happens off the landing page, on `/membership` and checkout, so a promo-only, non-sticky
theme would flip the visitor back mid-funnel and undermine what the test is measuring).
`usePromoThemeStore` itself was not touched by that work and R3's "don't make promo themes
sticky" still applies to it unchanged.

## R4. Admin theme is separate

Admin panel uses `AdminThemeContext`. Member-side theme settings don't affect admin appearance.
