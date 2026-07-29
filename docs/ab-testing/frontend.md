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
`{ settled: boolean; theme: "light" | "dark" | null }`. `PROMO_THEME_SLUG =
"__promo-theme__"` (the constant slug target — must match the experiment's
`slugTargets` and the seed script) and `promoThemeMarkerKey(experimentId)`
(the device-scoped localStorage key, `ta_promo_theme_<experimentId>`) are
**defined** in `src/lib/ab-testing/promo-theme-slug.ts`, not here — and
**must be imported from there**, never re-exported from this hook. That
module has no `"use client"` directive, so it's the correct import source
for the two Server Components (`/promotions/[slug]/page.tsx`,
`ToolsetLandingPage.tsx`) that need the sentinel slug to resolve
`themeExperimentId` server-side — a Server Component that imported it from
this hook's `"use client"` module instead would get a client reference, not
the string value. See
[gotchas.md](./gotchas.md#a-server-component-cannot-import-a-constant-from-a-use-client-module)
for the incident this fixed. This hook previously re-exported both names
"for existing client importers"; that re-export was removed (nothing
imported it — grep-verified) because keeping two valid import paths for the
same constant is exactly the ambiguity that caused the incident in the
first place.

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
variant didn't set one) is returned as `theme`. Every localStorage access in
this file is wrapped in try/catch — storage can throw in private browsing,
under quota pressure, or with storage disabled — and a throw there degrades
gracefully rather than breaking the page. That guarantee covers the
**property access itself** (reading `window.localStorage`), not only the
`.getItem`/`.setItem` calls made on the result: per the WHATWG spec,
`window.localStorage` can throw `SecurityError` on mere access (sandboxed or
cross-origin iframes, storage disabled by browser configuration), before any
method is ever called. Every call site that needs the real browser storage
goes through the module-local `safeLocalStorage()` helper, which does the
`window.localStorage` read inside its own try/catch and returns `Storage |
null` — never a bare `localStorage` reference evaluated outside a try block.
This includes the `useState` initializer that calls
`resolveInitialPromoThemeState(experimentId, safeLocalStorage())` and
`hasManualThemeChoice()`'s cross-tab check; the effect's device-marker
`setItem` call sits inside its own local try/catch for the same reason. (A
prior version of this hook evaluated `localStorage` as a bare argument
expression at these two call sites — outside any try/catch — which meant an
access-time throw would surface as an uncaught error during render instead of
degrading gracefully; `safeLocalStorage()` is the fix, and
`src/hooks/ab-testing/__tests__/promoThemeInitialState.test.ts` covers it
directly.)

**The device marker is only written when the response carries a usable
assignment (`variantConfig` is non-null).** A `null` `variantConfig` happens
for an admin-excluded visitor, or for an experiment activated with zero
variants (a bad-state activation) — `VariantAssignmentService.assignVariant`
returns `null` rather than throwing in that case, and the route still
answers `200` with `variantConfig: null`. The hook still resolves and
reveals in light either way (there is nothing to apply without a real
assignment), but it does **not** persist the device marker for a `null`
response — doing so would permanently pin that device to "light, no
exposure" for the rest of the experiment's life, even after the bad state
(e.g. missing variants) is fixed. Leaving the marker unwritten lets a later,
healthy visit retry.

**Error behaviour.** Any network failure or non-OK response resolves to
`{ settled: true, theme: "light" }` — the visitor reveals in control rather
than the page holding on a loader indefinitely. A stuck loading state is
worse than an unnecessary control impression.

**Timeout backstop — `ASSIGN_BACKSTOP_MS = 6000`.** `fetch` only *rejects* on
a network error; a server that accepts the connection and then stalls never
resolves and never rejects, so the error handling above is not sufficient by
itself — without a timer, that stall holds the page behind the full-screen
loader indefinitely. The single-shot effect races
`POST /api/ab-testing/assign` against a plain `setTimeout` via `Promise.race`;
if the timer wins, the hook resolves `{ settled: true, theme: "light" }`
through the same `abortedRef` guard as the other paths, and does **not**
write the device marker (nothing new was learned about this device, so a
later visit is free to retry). The timer is cleared as soon as the fetch
wins so it can never fire late.

This is a **safety net, not a measurement device**, and deliberately does
**not** use an `AbortController` — the hook never cancels the in-flight
request (see the no-abort comment in the source: Strict Mode's `ranRef`
guard would strand a cancelled request, and the server has already persisted
the `VariantAssignment` row before it builds the response, so a client-side
abort can't undo the assignment anyway). `6000`ms is a **generous
provisional value**, not a tuned one: a normal `/assign` call completes in
well under a second, so at ~10x that this should essentially never fire in
healthy operation. Per the rollout runbook
(`docs/superpowers/plans/2026-07-28-promo-theme-split.md`), measure the p99
of `POST /api/ab-testing/assign` in production before/while activating and
re-tune this constant from that measurement. **If the backstop fires with
any regularity, treat the run as contaminated, not as normal operation** —
the exposure row is already written server-side and counts in its assigned
arm (see the spec's edge-case table), so a non-trivial firing rate means a
real fraction of one arm's visitors are being scored as the other ("dark"
assigned server-side, "light" experienced and reported) — a one-directional
skew that biases the comparison, not random noise that averages out.

**Caveat: while this experiment runs, the "control" arm is not identical to
pre-experiment behaviour.** Both arms pay the cost of this feature:
`heroImagePreload` is skipped for both arms while `themeExperimentId` is
non-null (see the preload-fairness rule in
[docs/promo/frontend.md](../promo/frontend.md)), and both arms wait behind
`PromoThemeExperimentGate`'s loader until `settled`. So a relative
light-vs-dark comparison between the two arms is valid, but comparing either
arm's absolute conversion rate against a historical, pre-experiment baseline
is not — some of any observed movement is the preload/loader cost applied
uniformly to both arms, not the theme itself.

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

**`revealed` initializes from `experimentId`, NOT from `settled`.** It is
tempting to write `useState(() => settled)` — that would work for a fresh
visitor, since `settled` is `true` synchronously in the three short-circuit
cases. But `settled` is not identical between the server and client passes
for a RETURNING visitor of an ACTIVE experiment: the hook's device-marker
short circuit reads `localStorage`, which resolves `settled: false` on the
server (`typeof window === "undefined"`) and `settled: true` on the client
(the marker is present). That is an element-presence difference between the
SSR HTML and the client's first hydration render — the loader `<div>` exists
in one pass and not the other — which React treats as a hydration mismatch
and recovers from by discarding and re-rendering the affected subtree. On a
page that deliberately server-renders eight sections for SEO
(`/promotions/[slug]`), throwing that subtree away on hydration is a real
cost, and it lands on exactly the visitor segment the device-marker fast
path exists to help.

`experimentId` does not have this problem: it is resolved server-side and
baked into the ISR-prerendered, CDN-shared HTML, so it is identical in the
server and client passes. `useState(() => experimentId === null)` is
therefore what the initializer uses — `revealed` starts `true` only when
there is provably no experiment for anyone viewing that snapshot, which
server and client always agree on.

**Accepted consequence: one extra client frame for a specific segment.**
Because the client can no longer short-circuit to a revealed initial render
just from the device marker, a *returning* visitor of an *active* experiment
now mounts with the overlay showing and reveals it on the very next tick via
the effect below (`settled` becomes `true` immediately for them, no network
request). That is a loader flash for one frame, not a light-to-dark snap:
their theme was already applied pre-paint by the CSP-hashed bootstrap
snippet (`src/utils/security/inline-snippets.ts`), so the loader they
briefly see is already in their correct theme. Do not "optimise" this back
to initializing from `settled` — that reintroduces the hydration mismatch
above. This cost disappears entirely once the experiment is deactivated
(`experimentId` becomes `null`, which every visitor — server and client —
agrees on immediately).

Non-returning visitors and visitors with no active experiment are
unaffected: for them `settled` is `true` on both passes anyway (no
experiment) or the effect resolves it within one client tick, same as
before.

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
2. **`queueMicrotask(() => { flushSync(() => setRevealed(true)); ... })`.**
   `flushSync` cannot be called directly from inside a passive effect —
   React wraps every effect callback in `CommitContext`, and calling
   `flushSync` from within it triggers React's "flushSync was called from
   inside a lifecycle method" `console.error`. That fires on *every* settle,
   including the synchronous no-op path, so calling it un-deferred would
   spam the console on every promo page load in dev. Switching to
   `useLayoutEffect` does **not** fix this — layout effects are wrapped in
   `CommitContext` too — and it would add an SSR "`useLayoutEffect` does
   nothing on the server" warning, since this component genuinely renders
   during ISR. The fix is to defer only the `flushSync` call itself to a
   microtask via `queueMicrotask`: microtasks still run before the next
   paint, so the reveal still commits in the same frame as step 1's
   synchronous DOM write — the one-frame guarantee is preserved — while the
   call is no longer inside the effect's own call stack. The manual
   `classList`/`colorScheme` writes in step 1 stay synchronous and stay
   first; only `flushSync` (and the `setState` in step 3, which now lives in
   the same microtask callback) move.
3. **`useThemeStore.setState({ theme })` last, inside the same microtask,
   and only when `theme !== null`.** This is persistence bookkeeping for
   future visits, not the mechanism that makes the reveal flicker-free — the
   DOM was already correct after step 1. `setState` (not
   `setTheme`/`toggleTheme`) is used deliberately: it does not set
   `userManualOverride`, so an experiment assignment is never mistaken for a
   real user choice on a later visit. When `theme === null` (the hook's
   "nothing new to apply" case — a returning already-bucketed device, a
   non-experiment visitor, or a manual override), this write is skipped
   entirely: there is nothing to persist, and calling `setState` here would
   risk overwriting `userManualOverride` bookkeeping for no reason.

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

**Naming note: the context carries `revealed`, not the hook's `settled`.**
The two differ for one frame — `usePromoThemeExperiment` reports
`settled: true` as soon as it has a decision, but `PromoThemeSettledContext`
only flips once the apply-once effect above has actually written the DOM
class and committed the reveal via `flushSync`. The public hook name
(`usePromoThemeSettled`) is kept as-is rather than renamed to something like
`usePromoThemeRevealed` — it's consumed by `PromoHero` and a rename would
ripple — but the context definition in the source carries an explicit
comment stating which value it holds and why the two aren't collapsed into
one flag.

## Server-resolved variants

To avoid flicker (showing variant A then snapping to variant B), variants are resolved server-side and the page renders the right variant on first paint. See [rules.md](./rules.md#r1-no-client-side-flicker).
