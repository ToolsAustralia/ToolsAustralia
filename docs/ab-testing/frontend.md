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

### PromoThemeExperimentGate

`src/components/ab-testing/PromoThemeExperimentGate.tsx`. Wraps the promo
landing's rendered content in
`<PromoThemeExperimentGate experimentId={string | null}>{children}</...>`,
holding it behind a full-screen `DashboardLoader` until
`usePromoThemeExperiment` reports `settled`, then reveals it with the final
theme already applied to `<html>`. This is the piece that turns the hook's
synchronous short-circuits and network resolution into a visible (or
invisible) hold on the page.

**Overlay, not replacement — and why.** `/promotions/[slug]` is
ISR-prerendered and deliberately server-renders eight sections for SEO and
for the shared CDN document every visitor and every crawler receives. If the
gate returned the loader *instead of* `children` while unsettled, that shared
document would be a spinner for everyone, not just the bucketed minority
still resolving. So `children` always render, unconditionally, and the loader
is layered on top as a sibling — never an early return. `.ta-loader-root`
(the loader's own wrapper, `src/components/loading/DashboardLoader.tsx`) is
already `fixed inset-0 z-[100]` with an opaque `background: var(--lo-bg)`
(`src/app/globals.css`), confirmed before writing this component — so no
extra wrapper container was needed.

**`revealed` initializes from `settled`, not `false`.** `useState(() =>
settled)` means that when the hook resolves synchronously (no experiment,
manual theme choice, already-resolved device — see the three short-circuits
above), the overlay never enters the DOM at all: it mounts already revealed.
Only a visitor who is genuinely mid-resolution (a fresh bucketing, requiring
the network round-trip) ever sees the loader mount.

**The apply-once effect's three-step order is load-bearing — do not
reorder.** Nothing in this app applies the `.dark` class to `<html>`
synchronously in response to a theme change: `ThemeContext` does it inside a
`useLayoutEffect` keyed on `[theme]`, and a `useThemeStore.setState` call
lands on a different React lane than a sibling `setState` in this component.
Left to normal React scheduling, the dark arm would show a visible
loader-teardown-then-snap-to-dark on every load — exactly the defect this
feature exists to prevent. The effect (guarded by an `appliedRef` so it can
only ever run once) instead does, in this exact order:

1. **Write the DOM class by hand, synchronously.** `resolved` is `theme` when
   the hook produced a fresh assignment, or — when `theme` is `null` (already
   correct; see below) — read back off the current `<html>` class so the
   effect doesn't need to trust an implicit invariant. Then
   `document.documentElement.classList.toggle("dark", resolved === "dark")`
   and `style.colorScheme = resolved` are set directly, bypassing React and
   `ThemeContext` entirely.
2. **`flushSync(() => setRevealed(true))`.** Forces React to commit the
   reveal synchronously, in the same tick as step 1's DOM write, so the
   content becomes visible and the loader unmounts in one paint that already
   has the correct theme on `<html>` — no intermediate frame.
3. **`useThemeStore.setState({ theme })` last, and only when `theme !==
   null`.** This is persistence bookkeeping for future visits, not the
   mechanism that makes the reveal flicker-free — the DOM was already correct
   after step 1. `setState` (not `setTheme`/`toggleTheme`) is used
   deliberately: it does not set `userManualOverride`, so an experiment
   assignment is never mistaken for a real user choice on a later visit. When
   `theme === null` (the hook's "nothing new to apply" case — a returning
   already-bucketed device, a non-experiment visitor, or a manual override),
   this write is skipped entirely: there is nothing to persist, and calling
   `setState` here would risk overwriting `userManualOverride` bookkeeping
   for no reason.

**`inert` for the occluded page.** While `!revealed`, the wrapper `div`
around `children` gets `inert={!revealed}` so the server-rendered content
behind the loader cannot receive keyboard focus or be reached by
assistive tech while it is visually covered — an opaque overlay alone is not
enough for accessibility. This repo's installed `@types/react` (19.x) types
`inert` as `boolean | undefined` (not the string-attribute form some docs
show), so the boolean expression type-checks directly with no extra casts
needed. `aria-hidden={!revealed ? true : undefined}` on the same node
backs this up for AT that doesn't yet honour `inert`.

**`usePromoThemeSettled()` context, default `true`.** The gate provides
`revealed` through `PromoThemeSettledContext`. Consumers — starting with
`PromoHero` in a later task — call `usePromoThemeSettled()` to know whether
it's safe to run theme-sensitive entrance work. The context's default value
(used by anything rendered *outside* a gate, e.g. in a codepath that doesn't
wrap children in the experiment) is `true`, so an un-gated consumer behaves
exactly as it does today — the gate is additive, never a required wrapper.

## Server-resolved variants

To avoid flicker (showing variant A then snapping to variant B), variants are resolved server-side and the page renders the right variant on first paint. See [rules.md](./rules.md#r1-no-client-side-flicker).
