# Theme — Architecture

## Three contexts

- [src/contexts/ThemeContext.tsx](../../src/contexts/ThemeContext.tsx) — main user theme
- [src/contexts/AdminThemeContext.tsx](../../src/contexts/AdminThemeContext.tsx) — admin override (separate panel theme)
- [src/stores/usePromoThemeStore.ts](../../src/stores/usePromoThemeStore.ts) — promo-driven theme overrides (Zustand)

## Stores

- [src/stores/useThemeStore.ts](../../src/stores/useThemeStore.ts) — Zustand for theme state

## Default & persistence

**DARK is the hard default (2026-08-05).** The theme changes only when the user taps the
toggle, or when the promo default-theme experiment assigns one (see below); the resulting
state is persisted in `localStorage` under `ta-theme` (Zustand `persist`). No time-of-day or
`prefers-color-scheme` auto mode — a new, un-experimented visitor always gets dark regardless
of clock or OS preference.

### Flipping the default takes THREE coordinated changes

Light was the default until the "Promo landing — default theme (light vs dark)" experiment
concluded in favour of dark (2.04% vs 1.74% conversion, ~6.1k users per arm). Changing it
required all three of these together — any one alone half-ships the flip:

1. **`useThemeStore`'s initial state** (`theme: "dark"`). On its own this reaches only
   visitors with no `ta-theme` record — i.e. new ones.
2. **`migrateThemeState` + a `version` bump** (2 → 3). Everyone already carrying a v2 record
   has `theme: "light"` stored; zustand only re-runs the migration when the version changes,
   so without the bump the existing audience is pinned to the old default **permanently**.
3. **`src/utils/themeBootstrap.ts`** — the pre-hydration reader that sets the class on
   `<html>`. It resolves the theme independently, so if it disagrees the page paints one
   theme and swaps after hydration.

The migration rule itself is unchanged and should stay that way: **only a real choice
survives.** `userManualOverride === true` means the user worked the toggle, so their theme is
preserved verbatim (including light); everything else follows the current default. The flag
must never be persisted as `false` — absent is what keeps "never chose" distinguishable from
"chose". Pinned by `npm run test:theme-store`.

> The experiment assigns via `useThemeStore.setState`, which does **not** set
> `userManualOverride`. So while that experiment is still **Active** it keeps handing ~50% of
> visitors the light arm regardless of this default — concluding the experiment in the admin
> is what actually lands the flip.

[src/stores/useThemeStore.ts](../../src/stores/useThemeStore.ts) holds
`{ theme, userManualOverride?: true, setTheme, toggleTheme }` at **persist `version: 2`**.
`userManualOverride` is typed as the literal `true` (not `boolean`) — this makes "persisted as
`false`" unrepresentable at the type level, on purpose (see the never-`false` rule below).

### `userManualOverride`: never persist `false`

`userManualOverride` becomes `true` once — and only once — the visitor has picked a theme
themselves. `setTheme` and `toggleTheme` are the **only** writers of the flag, and both set it
to `true`; nothing in the codebase sets it to `false`. Two non-React readers of `ta-theme` key
their behaviour off this flag being present and not `false`:

- the CSP-hashed inline bootstrap script (`THEME_BOOTSTRAP_SNIPPET` in
  `src/utils/security/inline-snippets.ts`), which applies `.dark` to `<html>` before paint, and
- `readThemeFromPersistStorage()` in `src/utils/themeBootstrap.ts`.

Both test `userManualOverride !== false`. Because `useThemeStore` has **no `partialize`**, every
key in the store is written to `localStorage` — so if `userManualOverride: false` were ever set,
it would persist and **both** readers would demote a stored `theme: "dark"` back to light. For
the promo default-theme experiment this would silently evaporate the dark arm on every hard page
load, with no error anywhere. The fix is structural, not just conventional: the flag is either
`true` or absent, never `false`.

### The unmarked write path: `useThemeStore.setState`

`ThemeContext`'s bootstrap effect and the promo default-theme experiment both assign a theme via
`useThemeStore.setState({ theme: ... })` directly, **bypassing** `setTheme`/`toggleTheme`. This is
deliberate: it lets bootstrap resolve the effective theme from storage, and lets the experiment
assign a default arm, without marking the visitor as having made a manual choice. If either of
these called `setTheme`/`toggleTheme` instead, it would wrongly flag the visitor as having chosen
their theme and permanently exclude them from future experiment assignment.

### Migration: `migrateThemeState`, and no chaining

`migrateThemeState` (exported from `useThemeStore.ts` for direct testing — see
[testing.md](./testing.md)) resolves **legacy auto-dark** (v0 wrote `theme: "dark"` with
`userManualOverride === false` for users who never chose dark) to the CURRENT default, while
keeping a genuinely user-chosen dark and dropping the flag entirely when it isn't `true`.

zustand's `persist` middleware calls `migrate(persistedState, version)` **once**, with whatever
version number is found in storage — it does **not** chain intermediate migrations. There are
still live v0 records in the wild (`{ theme: "dark", userManualOverride: false }`), so the v2
`migrateThemeState` must keep handling that shape directly; it cannot assume a v1 migration ran
first. The v0 predicate is load-bearing and must stay verbatim:
`prev.theme === "dark" && prev.userManualOverride !== false`. Dropping it would resurrect the
removed auto-dark bug and pin those users to dark permanently.

## Bootstrap

[src/utils/themeBootstrap.ts](../../src/utils/themeBootstrap.ts) — `readThemeFromPersistStorage()`
returns the *effective* theme from `localStorage` (legacy auto-dark resolves to light). A small
inline script in [src/app/layout.tsx](../../src/app/layout.tsx) applies `dark` before React hydrates
**only** for a genuinely user-chosen dark, so a dark user never flashes light and everyone else stays light.

## Hooks

| Hook | Purpose |
|---|---|
| `useTheme()` | Read current theme + `setTheme` / `toggleTheme` |
| `useHtmlDarkForUi()` | Apply `dark` class to `<html>` for UI rendering |

The light/dark toggle buttons ([ThemeToggle.tsx](../../src/components/ui/ThemeToggle.tsx),
[HeaderThemeToggle.tsx](../../src/components/ui/HeaderThemeToggle.tsx)) call `toggleTheme` on tap.
