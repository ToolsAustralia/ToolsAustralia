# A/B Testing — Frontend

## Components

[src/components/ab-testing/](../../src/components/ab-testing/) — variant rendering wrappers, experiment provider.

## Hooks

[src/hooks/ab-testing/](../../src/hooks/ab-testing/) — read-side variant resolution.

> _TODO: enumerate exact components and hooks._

### useMembershipThemeExperiment()

`src/hooks/ab-testing/useMembershipThemeExperiment.ts`. Returns
`{ forceLight: boolean }` (default false = today's behavior). Discovers the
membership-theme experiment, reuses `POST /api/ab-testing/assign` with the
constant slug `__membership-theme__`, and reports whether the assigned
variant's `membershipTheme.forceLight === true`. SSR-safe; degrades to false
on SSR/loading/error/admin. Consumed only by `MembershipSection`.

### usePromoThemeExperiment(experimentId)

`src/hooks/ab-testing/usePromoThemeExperiment.ts`. Resolves the promo-landing
default-theme A/B arm for the current visitor. Returns
`{ settled: boolean; theme: "light" | "dark" | null }`. Also exports
`PROMO_THEME_SLUG = "__promo-theme__"` (the constant slug target — must match
the experiment's `slugTargets` and the seed script) and
`promoThemeMarkerKey(experimentId)` (the device-scoped localStorage key,
`ta_promo_theme_<experimentId>`).

**Three synchronous short-circuits.** `settled` is computed inside the
`useState` initializer — synchronously, before any effect runs — and is `true`
immediately (no network request, ever) in exactly three cases:

1. **No active experiment** (`experimentId` is `null`).
2. **The visitor has a manual theme choice.** Read directly from the `ta-theme`
   localStorage record (`{ state: { theme, userManualOverride? }, version: 2 }`
   written by `useThemeStore`) — `userManualOverride === true` means the
   visitor toggled the theme themselves via `setTheme`/`toggleTheme`, so they
   are excluded from the test permanently.
3. **This device already resolved this experiment**, indicated by the
   presence of the `promoThemeMarkerKey(experimentId)` localStorage marker
   from a prior visit.

This is deliberately in the initializer and not an effect. A later task mounts
a full-screen gate whose *initial* render state is derived from this hook's
`settled`. If `settled` started `false` and only flipped to `true` after an
effect ran, every visitor who isn't even in the experiment (the overwhelming
majority, once the test is mostly resolved) would briefly mount the gate's
overlay over the page and then unmount it on the next tick — a visible flash
on every promo page load, for everyone, forever. Computing all three checks
synchronously means the overlay never enters the DOM for the common case.

**Ordering constraint: `!experimentId` must be checked BEFORE the
`typeof window === "undefined"` guard.** `/promotions/[slug]` is
ISR-prerendered and the resulting HTML is CDN-cached and shared by every
visitor of that snapshot. `experimentId` is resolved server-side and baked
into the page, so it is identical for every visitor of a given snapshot and
the check needs neither `window` nor `localStorage` — it can and must run
during the server pass. If the environment guard ran first, the server pass
(where `window` is always undefined) would bake `settled: false` into the
shared HTML even when no experiment is active, and the gate would render a
full-screen overlay for every visitor of that cached snapshot, including
search-engine crawlers — exactly the flash this ordering exists to prevent.
The other two short-circuits (manual choice, device marker) genuinely need
`localStorage` and correctly stay after the environment guard, resolving only
on the client.

**Residual limitation while the experiment IS active.** A returning visitor
who already carries the device marker (case 3) cannot be identified as such
during the ISR server pass — that check needs `localStorage`, which doesn't
exist server-side. So for the lifetime of an active experiment, that
visitor's prerendered HTML still carries `settled: false`, and the gate's
overlay will exist in the shared markup until the client effect resolves it
post-hydration. This is not a visible theme snap, though: their theme is
already applied pre-paint by the CSP-hashed bootstrap snippet
(`src/utils/security/inline-snippets.ts`), so what they may briefly see is a
loader in their *already-correct* theme, not a light-to-dark flash. This
limitation disappears once the experiment is deactivated (`experimentId`
becomes `null`, which is checked first and resolves server-side for
everyone).

`theme` is `null` whenever no *new* decision needs applying — that includes
case 3 above (a returning already-bucketed device): the resolved theme is
already persisted in `ta-theme`, and the CSP-hashed inline head script
(`src/utils/security/inline-snippets.ts`) applies it before paint, so having
the hook re-apply it would be redundant. `theme` is only non-null the first
time a device gets freshly assigned into the experiment.

**Resolution path when not short-circuited.** A single-shot effect (guarded
by a `ranRef`, with an `eslint-disable-next-line react-hooks/exhaustive-deps`
on the dependency array — re-running when `state.settled` changes would
re-fire the network request) calls `POST /api/ab-testing/assign` with
`{ experimentId, slug: PROMO_THEME_SLUG }`. On success, the assigned
`variantConfig.promoTheme.defaultTheme` (defaulting to `"light"` if the
variant didn't set one) is written to the device marker and returned as
`theme`. Every localStorage access is wrapped in try/catch — storage can
throw in private browsing, under quota pressure, or with storage disabled —
and a throw there degrades gracefully rather than breaking the page.

**Error/timeout behaviour.** Any network failure, abort, or non-OK response
resolves to `{ settled: true, theme: "light" }` — the visitor reveals in
control rather than the page holding on a loader indefinitely. A stuck
loading state is worse than an unnecessary control impression.

**Cross-tab guard.** After the network resolution, if the visitor toggled the
theme in another tab while the request was in flight, the hook re-checks
`hasManualThemeChoice()` on every render and drops the assignment
(`{ settled: true, theme: null }`) rather than overriding their explicit
choice.

Does not import `readThemeFromPersistStorage` (`src/utils/themeBootstrap.ts`):
that helper deliberately returns only the resolved theme, not the
`userManualOverride` flag this hook needs to detect a manual choice.

## Server-resolved variants

To avoid flicker (showing variant A then snapping to variant B), variants are resolved server-side and the page renders the right variant on first paint. See [rules.md](./rules.md#r1-no-client-side-flicker).
