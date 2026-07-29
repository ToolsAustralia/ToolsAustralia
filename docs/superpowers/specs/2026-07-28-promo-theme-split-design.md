# Promo landing — default theme split test (light vs dark)

**Date:** 2026-07-28
**Status:** design approved (revised after adversarial audit), not yet implemented
**Domain:** `ab-testing` (primary), `theme`, `promo`

## Goal

Find out whether a first-time visitor landing on a promo page converts better when the
page opens in **light** (today's default) or in **dark**. The theme toggle stays live in
both arms — the experiment decides only which theme a visitor is *sent through* with.

Draw 9 shipped a full dark-mode banner set for every brand/toolbox combination, so both
arms now have first-class creative. This test decides which one new traffic should meet.

> **Revision note (2026-07-28).** A 28-agent adversarial audit killed several load-bearing
> claims in the first draft, including two the author had asserted as verified fact. The
> corrections are inline below and marked **[audit]**. The most serious: the test would
> have run as an A/A and produced a clean, confident, wrong result.

## Decisions

| Question | Decision |
|---|---|
| Control | **Light** — status quo, no behaviour change |
| Variant | **Dark** |
| Split | 50 / 50 |
| Scope of the forced default | **Global + sticky** — site-wide, persists across visits |
| Eligibility | **Everyone** who has not manually used the theme toggle |
| Toggle precedence | A manual toggle always wins, permanently |
| Hold shape | **Overlay** over the real page — never replaces the server HTML |
| Slug targeting | Sentinel `__promo-theme__`, resolved by exact match |

### Why global + sticky

The conversion event is a membership purchase, which happens on `/membership` and
checkout — not on the landing page. A promo-only theme would flip the visitor back to
light mid-funnel, so the test would measure a theme they only half-experienced, plus the
flip itself. Global keeps the funnel visually coherent, which is what is being scored.

### Recorded open decision — existing dark-mode users

Users already on dark have no `userManualOverride` flag, so they are eligible and a dark
user bucketed into light is flipped once (they can toggle back, and the toggle then
protects them permanently). This follows the explicit instruction to bucket every user.

Reversing it is a one-line change in the v2 migration. **[audit]** Note the original
justification — "under v1 semantics `theme: "dark"` already means they chose it" — is true
of **v1** records only. A surviving **v0** record can hold `theme: "dark"` set by the
removed auto-switcher, which is exactly what the v1 `migrate` demotes. See §Theme store v2.

## Constraints discovered

Load-bearing. Changing any invalidates part of the design.

1. **`/promotions/[slug]` is ISR-static** (`dynamicParams = false`, `revalidate = 60`) and
   sits in `STATIC_MARKETING_PATHS` — the no-nonce marketing CSP class. HTML is shared
   across all visitors, so there is **no server-side per-visitor theme**. The page must
   stay static; making it dynamic breaks both the CDN cache and the CSP route-class
   invariant in [`middleware.ts`](../../../src/middleware.ts).

2. **zustand `persist` writes on every `setState`.** `api.setState` is wrapped to call
   `setItem()` unconditionally, and [`ThemeContext`](../../../src/contexts/ThemeContext.tsx)
   calls `setState` in a layout effect on every load. So `ta-theme` exists for every
   returning visitor and **"no stored theme" cannot mean "never chose one"** — an explicit
   flag is required.

3. **The theme bootstrap snippet is CSP sha256-allowlisted** (`csp.ts`, drift-checked by
   `npm run test:csp-inline-hashes`). Its test is
   `if (theme === "dark" && userManualOverride !== false)`, so a persisted
   `{ theme: "dark" }` with **no** `userManualOverride` applies dark pre-paint.
   **The snippet needs no change, and neither does the CSP hash.**

4. **[audit — corrected] The sentinel is NOT collision-proof.**
   `findActiveBySlug` matches `slugTargets: { $in: [slug, "*"] }` sorted `createdAt: -1`,
   and the admin form offers a one-click "All Pages" → `["*"]`. The sentinel prevents
   *prize-slug → sentinel* collisions only. Any active **wildcard** experiment created
   after the theme experiment is returned for `getActiveExperimentForSlug("__promo-theme__")`
   — the page would then bake *that* experiment's id, hold all promo traffic on a config
   with no `promoTheme`, reveal everyone in light, and inject `page_view` rows tagged
   `slug: "__promo-theme__"` into an unrelated experiment. Post-filtering cannot fix it
   (`findOne` — the wildcard suppresses the sentinel document).
   **Requires a new exact-match lookup** (§Assignment).

5. **[audit — the original claim was WRONG] The hero DOES emit theme-forked art pre-mount.**
   The first draft asserted "the hero physically cannot paint before JS runs". False.
   [`PromoHero`](../../../src/components/sections/promo/PromoHero.tsx) gates only the
   `<video>` on post-mount `viewport`; pre-mount **both** containers fall through to the
   still-image branch, whose `src` comes from `getImageForMode(landingHeroPaths, themeMode, …)`,
   and the `isLoading` stage background is `resolveLandingHeroBackground(themeMode)`.
   Both are theme-forked and render before the decision on still-mode slugs. The design
   must hold those assets explicitly rather than relying on a gate that does not exist.

6. **[audit] `mergeVariantConfig` is a whitelist, not a merge.** It rebuilds config from a
   hard-coded six-key literal (`hero`, `banner`, `packages`, `membershipModal`,
   `packageColors`, `membershipTheme`) with **no spread**. Any other key is silently
   discarded between Mongo and the client. `Variant.config` is `Schema.Types.Mixed`, so the
   value *saves* fine — it is destroyed on read. `tsc` cannot catch this because
   `promoTheme?:` is optional.

7. **[audit] Unregistered sentinels win purchase attribution.**
   `attributionRank` returns `0` (top tier) unless every slug target is in
   `NON_CONVERSION_SENTINEL_SLUGS`, which today holds only `__membership-theme__`.

## Architecture

### Assignment

`[slug]/page.tsx` already resolves the active experiment in a `Promise.all` at ISR time.
Add a fourth entry using a **new exact-match lookup** (per constraint 4) and bake its id
into the static HTML:

```ts
const [effectivePromos, majorDraw, activeExperiment, themeExperiment] = await Promise.all([
  getEffectivePromosForDisplay().catch(() => []),
  getCurrentMajorDrawServer().catch(() => null),
  ExperimentService.getActiveExperimentForSlug(slug).catch(() => null),
  ExperimentService.getActiveExperimentForSentinelSlug(PROMO_THEME_SLUG).catch(() => null),
]);
```

`findActiveBySentinelSlug` is `findActiveBySlug` with `slugTargets: slug` (exact array
membership, no `"*"`). Mirror it into the dormant
`api/ab-testing/membership-theme-experiment/route.ts`, which has the same latent bug.

Because the id is baked, the client needs **one** request —
`POST /api/ab-testing/assign` with `{ experimentId, slug: "__promo-theme__" }`.

**[audit] `ta_anon_id` must be minted in middleware.** The gate's POST fires in the same
effect flush as `useVariantAssignment`'s POST for the slug-targeted experiment.
`getOrCreateAnonymousId` generates a fresh `anon_<uuid>` per request and cannot persist it,
so each handler `Set-Cookie`s its own and last-write-wins. The unique index is
`(experimentId, anonymousId)`, so **both rows are legal** and the visitor is counted as two
exposures, then re-bucketed later. Mint the cookie in `middleware.ts` (the matcher already
covers `/promotions/**`) using **Web Crypto** — `AnonymousIdService` imports `next/headers`
and node `crypto` and cannot be edge-imported. Verify the `next build` route table still
shows `/promotions/[slug]` as static afterwards.

### Variant config

New field on `VariantConfig`, sibling to `membershipTheme`:

```ts
/** A/B test: the theme a bucketed visitor is defaulted into on promo landings.
 *  Only applied when the visitor has never used the theme toggle. */
promoTheme?: {
  defaultTheme?: "light" | "dark";
};
```

Control carries `"light"` explicitly, variant `"dark"`, so the admin UI reads unambiguously.

**[audit] This field must be wired in FOUR places or the test is an A/A:**

1. `VariantConfigService.mergeVariantConfig` — add
   `promoTheme: { ...baseConfig.promoTheme, ...variantConfig.promoTheme }`.
2. `VariantConfigService.getDefaultConfig` — add `promoTheme: { defaultTheme: "light" }`.
3. `VariantConfigService.validateVariantConfig` — reject a non-object `promoTheme` and a
   `defaultTheme` that is defined but not `"light" | "dark"`.
4. `VariantConfigEditor.tsx` — the form initializer is the **same six-key whitelist** and
   `handleSubmit` PATCHes `config` wholesale, so any admin save wipes the field. Spread
   `...(variant?.config ?? {})` first and add a control beside the `membershipTheme` block.

`Variant.ts` needs the **interface** only — `config` is `Schema.Types.Mixed`; there is no
schema-side change.

### `usePromoThemeExperiment`

Client hook, modelled on `useMembershipThemeExperiment`:

- Runs once per mount (`ranRef`).
- **Short-circuits, synchronously, with `settled: true`** when any of: the baked
  `experimentId` is `null`; `userManualOverride === true`; or a **device marker** for this
  `experimentId` is present in localStorage (see below). No request, no assignment,
  no `page_view`.
- Otherwise POSTs to `/assign` and reads `variantConfig.promoTheme.defaultTheme`.
- Returns `{ settled, theme }`.

**[audit] Device marker.** The first draft claimed "the hold occurs once per device", but
the only cache specified was sessionStorage (per-tab), so the hold would recur every
session. Write a localStorage marker keyed by `experimentId` when the theme is applied, and
derive the hook's **initial** `settled` from it synchronously — so a returning visitor
never sees the overlay at all. `ta-theme` alone cannot serve this role (constraint 2).

### `PromoThemeExperimentGate` — overlay, not replacement

**[audit] Decided: overlay.** A replacement gate would make the shared ISR document a
spinner for every visitor, both arms, and for crawlers — contradicting "control = status
quo" and regressing the eight sections deliberately marked *Keep SSR for SEO*.

- **Always renders `{children}`.** `DashboardLoader` is layered on top; `.ta-loader-root`
  is already `fixed inset-0` and opaque. Content is marked `inert` / `aria-hidden` while
  the overlay is up.
- When `experimentId === null` or the device marker is present, `settled` initialises
  `true`, so **no overlay ever enters the HTML** for the common case.

**[audit] The reveal sequence — the original "same React commit" claim was false.**
Nothing applies `.dark` synchronously on a theme change: `ThemeContext` does it in a
*passive* `useEffect` (after paint) and its `useLayoutEffect` is one-shot behind a ref.
`useThemeStore.setState` lands on SyncLane via `useSyncExternalStore`; `setSettled` on
DefaultLane — different commits. The loader itself inverts under `.dark`. So the dark arm
would snap 100% of the time. Required order, load-bearing:

```ts
const root = document.documentElement;
root.classList.toggle("dark", theme === "dark");
root.style.colorScheme = theme;          // matches what the head snippet does
flushSync(() => setSettled(true));       // content commits before paint
useThemeStore.setState({ theme });       // persistence only — MUST be last
```

The same block runs on the timeout and error branches with `theme = "light"`, so neither
arm gains a timing advantage. Additionally promote `ThemeContext`'s `[theme]` sync from
`useEffect` to `useLayoutEffect` per `docs/theme/rules.md` R1 — defensive, not sufficient
alone.

**[audit] Occluded images still download.** Because children now render underneath, the
theme-forked asset hold must move **into `PromoHero`**: extend its existing pre-mount
tri-state so the still hero and the `isLoading` stage background are not emitted until the
theme is settled. Without this the dark arm eats a wasted light-hero fetch and the preload
fairness fix below is undone.

**Timeout — backstop, not a guillotine. [audit]** The first draft's 1200 ms figure was
arm-neutral in *duration* but not in *consequence*: `assignVariant` persists the assignment
**before** the response is built and the handler never checks `request.signal`, so a
timed-out dark visitor sits in the dark denominator while experiencing light — one-way
attenuation. And the promised "correct arm from their next page onward" is false for the
promo funnel, which is a **same-document** navigation (`MembershipSection` → `MembershipModal`);
nothing re-reads `ta-theme` on a soft navigation.

Decision: **do not ship a *tuned* fixed-ms cut derived from a guess.** `fetch` only
*rejects* on a network error — a server that accepts the connection and stalls never
resolves and never rejects — so shipping with *no* backstop at all is not an option either:
that is a stuck full-screen loader on a paid-traffic page for as long as the connection
stays open. **Implemented:** `ASSIGN_BACKSTOP_MS = 6000` in
`usePromoThemeExperiment.ts`, a `Promise.race` between the `/assign` fetch and a plain
timer (no `AbortController` — see that file's no-abort comment) — a deliberately
**generous, provisional** value, not a measured one: a normal `/assign` call completes in
well under a second, so ~10x that should essentially never fire in healthy operation.
Treat a non-trivial backstop-firing rate as *the run is contaminated* rather than as
normal operation. This avoids adding a `deliveredAt` field plus a per-experiment metrics
filter for a path that should be rare. **Before/while activating, measure the p99 of
`POST /api/ab-testing/assign` in production and re-tune `ASSIGN_BACKSTOP_MS` from that
measurement** — 6000ms is a starting backstop, not a final one. If the backstop fires often
in practice even after re-tuning, escalate to recording `deliveredAt` on
`VariantAssignment` with an opt-in `requireDelivered` filter — which must be per-experiment,
since a global filter would zero every historical denominator.

If a late value is written to `ta-theme` directly it **must** use the exact envelope
`{ state: { theme }, version: 2 }` (both readers require `.state`) and must **never**
include `userManualOverride`.

### Theme store v2

Bump `useThemeStore` to version 2 and reinstate `userManualOverride` — the name the
codebase already uses for this concept in `themeBootstrap.ts` and the inline snippet.

- Set `true` **only** inside `setTheme` / `toggleTheme`, covering all three UI entry
  points (`HeaderThemeToggle`, `ThemeToggle`, `ThemePicker`).
- `ThemeContext`'s direct `setState` bypass stays unmarked, so bootstrapping is never
  mistaken for a choice. The experiment writes through the same unmarked path.

**[audit] Two traps in the migration:**

- **zustand calls `migrate(persisted, version)` once with the stored version — it does not
  chain.** A surviving **v0** record (`{ theme: "dark", userManualOverride: false }`) hits
  the **v2** function directly. "Carry `theme` forward" would resurrect the removed
  time-based auto-dark and pin those users to dark permanently. **Keep the v1 predicate
  verbatim:** `prev.theme === "dark" && prev.userManualOverride !== false`.
- **`userManualOverride` must never be persisted as `false`.** `useThemeStore` has no
  `partialize`, so every key is written. A stored `false` makes *both* readers demote
  dark → light (`inline-snippets.ts` `o !== false`; `themeBootstrap.ts`), so the dark arm
  would silently revert on every hard load. The field must be **absent** until a toggle
  sets it `true`.

### Preload fairness

`[slug]/page.tsx` preloads `landingForPrize.desktop / .mobile` — the **light** paths;
`getImageForMode` is never consulted because the server has no theme. With the test live a
dark-arm visitor downloads the light hero, discards it, then fetches the dark one: wasted
bandwidth and slower LCP **for the dark arm only** — a systematic handicap that would read
as "dark converts worse".

**Fix:** skip the still-hero `<link rel="preload">` when the theme experiment is active
(known server-side at ISR time). Only affects still-mode slugs — brand slugs render video
and already preload nothing.

### Metrics

**[audit] The original "No new tracking, existing model unchanged" was wrong in one
direction and needlessly alarming in another.**

`__promo-theme__` **must** be added to `NON_CONVERSION_SENTINEL_SLUGS`. Unregistered, it
ranks `0` (top tier) and, as the newest active experiment, wins the single purchase stamp —
starving the co-running `static-vs-video-hero` test's legacy event-count surfaces (admin
comparison/winner, `ExperimentStoppingRulesService`, the auto-end cron).
`docs/ab-testing/gotchas.md` states this invariant explicitly.

Registering it does **not** blind this test: `ExperimentMetricsService` finds purchases via
`$or: [{ experimentId }, { userId: { $in: assignedUserObjIds } }]` and attributes by
assignment authority, and anonymous assignments are merged to `userId` at purchase time
before attribution. So:

> **Score this experiment from the Bayesian / `ExperimentMetricsService` card only. Its
> legacy event-count conversion and revenue panels will read zero by design, exactly like
> `__membership-theme__`.**

That sentence must survive into the docs, or a future reader will "fix" the registration
back out.

### Seeding

`scripts/seed-promo-theme-experiment.ts`, modelled on
[`seed-static-vs-video-hero-experiment.ts`](../../../scripts/seed-static-vs-video-hero-experiment.ts):
draft status, `slugTargets: ["__promo-theme__"]`, two variants (`Light (control)` 50%
`isControl: true`, `Dark` 50%), idempotent, refuses non-draft, `--dry-run` default-safe,
`--force` to repopulate. npm scripts `seed:promo-theme` / `seed:promo-theme:dry`.

## Edge cases

| Case | Behaviour |
|---|---|
| No active experiment | Baked id is `null`; `settled` initialises `true`; **no overlay in the HTML**; zero requests |
| Device already bucketed | localStorage marker present; `settled` initialises `true`; no overlay, no request |
| Visitor has used the toggle | Excluded entirely — no request, no assignment, no `page_view` |
| Admin user | Excluded by the existing check in `VariantAssignmentService` |
| Assign request fails | Reveal in light via the same `flushSync` sequence |
| Backstop fires | Reveal in light; the exposure row **is already written server-side** and counts in its assigned arm — contamination is one-directional and must be monitored, not assumed away |
| Wildcard experiment active | Cannot hijack: sentinel lookup is exact-match (`findActiveBySentinelSlug`) |
| Two experiments on one page | Both resolve independently; `ta_anon_id` is minted in middleware so they share one identity |
| Crawler / JS disabled | Full server HTML renders; no overlay in the static document |

## Testing

- `npm run test:csp-inline-hashes` — proves the bootstrap snippet was not disturbed.
- **Merge round-trip (blocking):** extend
  `src/services/ab-testing/__tests__/variantConfigService.membershipTheme.test.ts` (already
  wired at `package.json`) — assert
  `mergeVariantConfig(getDefaultConfig(), { promoTheme: { defaultTheme: "dark" } }).promoTheme?.defaultTheme === "dark"`.
  `tsc` cannot catch this class of bug, so the runtime assertion is mandatory.
- **v2 migrate fixtures:** `(v0, override:false) → light`, `(v0, override:true) → dark`,
  `(v1, dark) → dark`; and that `userManualOverride` is never persisted as `false`.
  Wire a `test:theme-store` entry — an unwired test file is undiscoverable.
- **Build-output assertion:** the prerendered `/promotions/<slug>` HTML still contains the
  packages/FAQ markup with the experiment inactive (guards the overlay decision).
- **Playwright:** with the experiment stubbed to dark, the page never paints a light hero
  or light loader before the dark one; the light arm is byte-identical to today.
- **Pre-activation probe:** POST `/assign` per variant id (via the admin preview cookie,
  which exercises the same merge path) and assert
  `variantConfig.promoTheme.defaultTheme` matches the arm.

## Files

**New**
- `src/hooks/ab-testing/usePromoThemeExperiment.ts`
- `src/components/ab-testing/PromoThemeExperimentGate.tsx`
- `scripts/seed-promo-theme-experiment.ts`
- a small edge-safe anon-id cookie contract module (for middleware)

**Edited**
- `src/services/ab-testing/VariantConfigService.ts` — merge + default + validate **(blocking)**
- `src/components/admin/ab-testing/VariantConfigEditor.tsx` — initializer + control **(blocking)**
- `src/utils/ab-testing/get-user-experiment-assignment.ts` — register the sentinel
- `src/repositories/ab-testing/ExperimentRepository.ts` + `ExperimentService.ts` — exact-match lookup
- `src/app/api/ab-testing/membership-theme-experiment/route.ts` — same latent wildcard bug
- `src/middleware.ts` — mint `ta_anon_id`
- `src/models/ab-testing/Variant.ts` — **interface only**
- `src/app/promotions/[slug]/page.tsx`, `src/app/promotions/_components/ToolsetLandingPage.tsx`
- `src/components/sections/promo/PromoHero.tsx` — hold theme-forked assets until settled
- `src/contexts/ThemeContext.tsx` — `[theme]` sync → `useLayoutEffect`
- `src/stores/useThemeStore.ts` — v2
- `package.json`, `docs/ab-testing/{architecture,gotchas,frontend}.md`, `docs/theme/rules.md`

**Docs corrections owed:** `docs/ab-testing/architecture.md` ("zero collision") and
`docs/ab-testing/gotchas.md` both assert the one-directional guarantee only.
`docs/theme/rules.md` needs amending on two rules, not just one:
- **R3** ("Don't make promo themes sticky") needs a clarifying sentence — this design
  writes the GLOBAL `useThemeStore` (`ta-theme`), not `usePromoThemeStore`, so R3 (which
  is about the promo *brand*-theme store) is not reversed.
- **R2** ("Light is the default; only the user toggle changes it") is now literally false
  as written — this design is a *second*, non-user writer of the default theme. R2 must
  be amended to acknowledge the experiment as a second writer while preserving its real
  invariant: a manual toggle still wins permanently (`userManualOverride: true`, written
  by `setTheme`/`toggleTheme` only, and never persisted as `false`).

**Runbook caveat owed (record wherever the activation runbook lives):** while this
experiment is active, the CONTROL arm is not equivalent to pre-experiment "today" —
both arms lose the hero preload (see "Preload fairness" above) and both wait behind
`PromoThemeExperimentGate`'s loader until settled. The light-vs-dark comparison *between*
the two arms is valid; comparing either arm's absolute conversion rate against a
historical, pre-experiment baseline is not.

## Out of scope

- Edge assignment of the *variant* (middleware mints only the anon id; the edge cannot
  reach Mongo to learn whether the experiment is live).
- Any change to the CSP-hashed inline snippets.
- Making promo pages dynamic.
- Per-brand or per-slug theme targeting.
- `deliveredAt` on `VariantAssignment` — unless the backstop proves to fire often.

## Rollout and teardown

Ordering is load-bearing — each step makes the next observable.

1. **Land the config wiring first** (`VariantConfigService` ×3, `VariantConfigEditor`, the
   merge regression test). Everything downstream is invisible until this exists: the
   failure mode is a healthy-looking 50/50 A/A.
2. **Land theme store v2 before the hook can write a theme.** If the hook ships first,
   dark-arm writes are demoted to light on the next load and the arm evaporates.
3. **Decide/implement the gate overlay + `PromoHero` asset hold** before any reveal-
   sequencing work.
4. **Land `NON_CONVERSION_SENTINEL_SLUGS` + `findActiveBySentinelSlug` before activation**
   (not before seeding — a draft is inert, but an active experiment immediately takes the
   purchase stamp and becomes hijackable).
5. **Land the middleware `ta_anon_id` mint** before this runs concurrently with any
   slug-targeted promo experiment. If it slips, do not activate both at once.
6. Seed as draft; review in admin.
7. **Pre-activation probe:** assert `promoTheme` survives the merge for both arms.
8. Measure `POST /api/ab-testing/assign` p99 in production; the hook already ships a
   provisional `ASSIGN_BACKSTOP_MS = 6000` — re-tune that constant from the measured p99
   rather than leaving the provisional value in place indefinitely.
9. Activate. Watch the backstop-firing rate against a pre-registered threshold, above which
   the arms are not comparable — and note for the record that neither arm is directly
   comparable to pre-experiment baseline conversion while the test runs (see "Docs
   corrections owed" below): both arms lose the hero preload and both wait behind the
   loader, so only the light-vs-dark comparison between arms is valid, not either arm's
   absolute rate against history.
10. On conclusion: ship the winner as the unconditional default, set the experiment to
    `ended`, and record the outcome as a runbook in `docs/ab-testing/`, matching
    `promo-packages-design-runbook.md`.
