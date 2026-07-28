# A/B Testing — Gotchas

## Late assignment

If assignment runs server-side but a component depends on it client-side BEFORE hydration completes, you get a brief default-state render. Pattern: pass the resolved variant down via props from the server component; don't fetch client-side.

## Dedup edge cases

(Migrated from `docs/AB_TESTING_DEDUPLICATION.md`.)

> _TODO: read full root content and merge. Brief: same user from two browsers can produce two assignment rows under different sessions; dedupe must reconcile._

## Bot traffic

Bots can pollute conversion data — implement a "is this a bot?" filter before counting. _TODO: confirm whether this is in place._

## Variant ratio drift

If you change `threshold` mid-experiment, half the assigned users may flip variants. Don't.

## Membership dark-mode experiment (winner shipped — light)

The "no theme" arm won, so `MembershipSection` now passes `theme="light"`
unconditionally and `ElectricPackageCard`'s default theme is `"light"`. The
hook (`useMembershipThemeExperiment`), API route, and `VariantConfig.membershipTheme`
field are still in the codebase but no production component reads from them —
they're dormant and can be reused for future tests, or cleaned up later.

Historical notes (still apply for anyone reviving this pattern):

- Never reuse the `__membership-theme__` sentinel slug for an unrelated
  experiment, and never give the membership dark-mode experiment `slugTargets`
  of a real prize slug or `*` (`*` collides with promo experiments).
- The sentinel slug only guarantees a real prize slug can never collide with
  it — it is NOT zero collision overall. `ExperimentRepository.findActiveBySlug`
  matches `slugTargets: { $in: [slug, "*"] }` and returns a single `findOne`
  newest-`createdAt` document, so an active **wildcard** ("All Pages")
  experiment created after the sentinel one would still be returned for
  `__membership-theme__` (or `__promo-theme__`) and silently hijack it — no
  amount of post-filtering can recover once `findOne` has already picked the
  wrong document. Site-wide sentinel lookups MUST use
  `ExperimentRepository.findActiveBySentinelSlug` /
  `ExperimentService.getActiveExperimentForSentinelSlug` instead of the
  `*Slug` variants — those build their query with
  `buildActiveExperimentQuery(slug, { allowWildcard: false }, now)`, an exact
  match that never matches `"*"`.
- The membership dark-mode test is diluted, not biased: control differs from
  treatment only during dark hours, so it needs more samples for significance.
  This was an accepted product trade-off.
- Stray `dark:` Tailwind in `MembershipSection` edge UI (e.g. "no packages"
  fallback, promo header) is NOT driven by the `theme` prop and stays
  schedule-driven. Out of scope by design.
- The hook caches its result in sessionStorage for 5 min under a fixed key
  (`ab_membership_theme_v1`, not experiment-scoped); a server-side experiment
  swap is invisible for up to 5 min. Bump the `_v1` suffix to force-bust.

## Attribution priority for purchase tracking

When a user is in multiple active experiments (e.g. a slug-targeted promo
experiment AND the site-wide `__membership-theme__`), `getUserActiveExperimentAssignment`
(and the cookie-fallback loops in `/api/stripe/create-one-time-purchase[-existing-user]`)
prefer **page-targeted experiments over wildcard `*`** and **completely
exclude cosmetic site-wide sentinels** like `__membership-theme__` from
purchase attribution. See `NON_CONVERSION_SENTINEL_SLUGS` in
`src/utils/ab-testing/get-user-experiment-assignment.ts`. If you ever add a
new site-wide cosmetic experiment, add its sentinel slug to that set.

### Promo theme experiment (`__promo-theme__`)

`__promo-theme__` is registered as a non-conversion sentinel, so **score it from the
Bayesian / `ExperimentMetricsService` card only — its legacy event-count conversion and
revenue panels read zero by design.** This does not blind the test because
`ExperimentMetricsService` finds purchases via `$or: [{experimentId}, {userId: {$in: assignedUserObjIds}}]`,
attributes by assignment authority, and anonymous assignments are merged to `userId` at
purchase time before attribution. The sentinel registration only excludes it from the
single-purchase stamp when multiple experiments compete; the Bayesian card still sees all
assigned users' conversions, even anonymous ones converted later.

## Subscription-renewal attribution

The legacy guard (`isInitialSubscriptionInvoice` in
`src/services/stripe-webhook-handlers/index.ts`) tried to keep renewals
(`subscription_cycle`) from crediting the experiment by gating what gets stamped
onto the PaymentEvent. **The 2026-06 measurement redesign no longer relies on
that stamping.** `ExperimentMetricsService` / `experiment-metrics-core` separate
first-purchase from recurring revenue at READ time using the durable
`PaymentEvent.isRenewal` flag **and** the 14-day conversion window — so a renewal
can never be counted as a conversion or as first-purchase revenue regardless of
how (or whether) it was stamped. Renewals surface only as a separate
`recurringRevenue` line. This makes renewal separation robust even if a renewal
inherits the subscription's `experimentId/variantId`.

## Engagement rollup is diagnostics-only + self-healing (v2)

`/api/cron/ab-testing-aggregate-metrics` no longer feeds conversion/revenue
(those come live from durable tables). It rolls **page_view/click volume** into
`ExperimentDailyMetrics` for engagement history only, and now:
(1) is **auth-gated** by `CRON_SECRET`; (2) **self-heals** by re-aggregating the
last 7 days every run with idempotent `$set` upserts (a missed/failed day is
repaired on the next run, well inside the 30-day event TTL); (3) **excludes admin
preview** events (`metadata.isPreview`). Unique visitors are NOT taken from this
rollup — they come from the durable assignment table.

## A client gate on an ISR page bakes its initial state into the shared HTML

`/promotions/[slug]` is ISR-prerendered (`dynamicParams = false`, `revalidate = 60`)
and its HTML is CDN-cached and served to **every** visitor of that snapshot,
including crawlers. So any client component whose *initial* render is derived from
experiment state writes that state into the shared document.

`usePromoThemeExperiment`'s `useState` initializer originally read:

```ts
if (typeof window === "undefined") return { settled: false, theme: null }; // WRONG first
if (!experimentId) return { settled: true, theme: null };
```

During the server pass `window` is always undefined, so the environment guard fired
first and `settled: false` was baked in **even when no experiment was active** — the
`!experimentId` short-circuit never got a chance to run. The gate that derives its
overlay from `settled` would then have shipped a full-screen loader inside the static
HTML to every visitor and every crawler, on a page whose control arm is meant to be
byte-identical to today. It also produced a hydration mismatch, since the client
initializer *does* reach `!experimentId` and yields `true`.

**Rule:** in a client hook consumed by an ISR page, check the values that are
**known at build/ISR time** (a baked experiment id) *before* the
`typeof window === "undefined"` guard. Only checks that genuinely require `window` or
`localStorage` belong after it. The guard test is the plan's build-output assertion:
prerender with the experiment inactive and confirm the HTML still contains the real
page markup and no overlay.

**Accepted residual:** while an experiment *is* active, a returning visitor holding
the device marker still receives the overlay in the shared HTML until hydration
clears it — per-visitor `localStorage` cannot be known at ISR time. That visitor's
theme has already been applied pre-paint by the CSP-hash-allowlisted bootstrap
snippet, so what they may briefly see is a loader in their **correct** theme, not a
light→dark snap. Do not try to fix this with a second inline snippet; the CSP hash
allowlist makes that far more expensive than the symptom warrants.

## A Server Component cannot import a constant from a `"use client"` module

A Server Component cannot import a constant from a `"use client"` module — it receives a
client reference, not the value. Symptom: the value silently reads as non-string/undefined
with NO error, so a lookup keyed on it returns null and the feature goes inert while
everything still compiles and type-checks. Put shared constants in a boundary-neutral module.

**How this bit `PROMO_THEME_SLUG` (found + fixed 2026-07-28, Task 12 verification).**
`/promotions/[slug]/page.tsx` and `ToolsetLandingPage.tsx` (both Server Components) imported
`PROMO_THEME_SLUG` from `src/hooks/ab-testing/usePromoThemeExperiment.ts` — a `"use client"`
file. `ExperimentService.getActiveExperimentForSentinelSlug(PROMO_THEME_SLUG)` was therefore
called with a client reference instead of the string `"__promo-theme__"`, matched no document,
and `themeExperimentId` was always `null`. No thrown error anywhere — `.catch(() => null)` on
the `Promise.all` entry swallowed whatever the mismatch actually produced. Effect: the gate's
`experimentId` prop was always `null`, so `usePromoThemeExperiment` short-circuited to
`settled: true` synchronously and never called `POST /api/ab-testing/assign` at all — the
entire default-theme A/B test (Tasks 1–11) was inert for every visitor, silently.

**Diagnostic signature to recognize this class of bug fast next time:** a *different* sentinel
lookup through a live route, or a standalone script calling the same service method directly
with the literal string, resolves correctly — only the Server-Component call site fails. That
asymmetry (same function, same query builder, different caller) is the tell that the value
crossing into the Server Component isn't what it looks like in the source, not that the query
logic is wrong. Reach for this gotcha before re-auditing the DB query.

**The fix:** moved the constant (and its co-located `promoThemeMarkerKey` derived-key helper —
a pure string function with no client-only dependency, so it belongs alongside the sentinel it
derives from) into `src/lib/ab-testing/promo-theme-slug.ts`, a plain module with no `"use
client"` directive. `usePromoThemeExperiment.ts` now imports from there and re-exports both
names so existing client-side importers of the hook module are unaffected. Both Server
Components import the constant directly from the new `src/lib/ab-testing/` module, never from
the hook. The sibling `__membership-theme__` feature never had this problem because it
hand-duplicates its literal sentinel string on each side of the boundary instead of sharing one
export — either pattern (a boundary-neutral shared module, or duplicated literals) avoids the
bug; sharing an export FROM a `"use client"` file INTO a Server Component is the one shape that
doesn't work.

## `ranRef` + `AbortController` single-shot effects can permanently strand in dev (React Strict Mode)

**Found 2026-07-28, while re-verifying `promo-theme-split.spec.ts` after the fix above.** Fixing
the client-boundary bug made `usePromoThemeExperiment`'s effect actually fire for the first time
— which exposed a SECOND, previously-masked bug that independently keeps
`e2e/specs/marketing/promo-theme-split.spec.ts`'s "dark arm never paints light before dark" test
failing under `npm run dev`.

This app's `next.config.ts` does not set `reactStrictMode`, so Next's App Router default applies
— confirmed by reading `node_modules/next/dist/build/define-env.js`: `__NEXT_STRICT_MODE_APP` is
`true` whenever `reactStrictMode` is `null` (unset) in config. React Strict Mode double-invokes
effects in development ONLY (mount → effect → synthetic cleanup → effect again), specifically to
surface exactly this class of bug.

`usePromoThemeExperiment`'s single-shot effect guards against re-firing with a `ranRef`:

```ts
useEffect(() => {
  if (ranRef.current) return;
  ranRef.current = true;
  // ...fetch, with an AbortController...
  return () => { aborted = true; controller.abort(); };
}, [experimentId]);
```

Strict Mode's FIRST invocation sets `ranRef.current = true` and starts the `/assign` fetch, then
its synthetic cleanup fires immediately and calls `controller.abort()` on that in-flight
request. The SECOND (real) invocation checks `ranRef.current`, sees it's already `true`, and
returns early — so the aborted request is never retried. Verified directly (Playwright MCP
browser session against the running dev server, a real seeded active `__promo-theme__`
experiment, two independent fresh page loads): exactly one `POST /api/ab-testing/assign` per
load, always `net::ERR_ABORTED`, no follow-up request, ever — the hook is permanently stranded
at `{ settled: false, theme: null }` and `<html>` never gains the `dark` class. Corroborating
signal: this app's other client components with debug `console.log`s (e.g.
`MembershipSection Debug`) visibly double-fire on every load, consistent with Strict Mode being
active.

**This is dev-only.** Strict Mode's double-invoke never happens in a production build — a real
visitor hitting a production deploy would see the effect run once, fetch once, and resolve
normally. So the default-theme A/B feature likely DOES work correctly in production even with
this bug present; it's local dev testing (including any e2e run against `npm run dev`, not
`E2E_BUILD=1`) that's blocked. This is unverified against a real `next build` — nobody has run
one against this specific code path yet.

**Not fixed as part of Task 12** — it's a second, independent bug outside that task's prescribed
scope (a single shared-constant move), and the task's own instructions were explicit: stop and
report rather than keep patching `src/` once the prescribed fix doesn't make the spec pass.
Flagged here for whoever picks it up. Candidate fix shapes (not evaluated in depth): don't let
the cleanup abort a request that a persistent ref-guard prevents retrying (e.g., drop the
`ranRef` guard and instead dedupe via the `AbortController` itself finishing before Strict
Mode's second invocation runs), or use a Strict-Mode-safe request pattern (an effect that always
re-runs and lets the *response*, not the ref, decide whether to apply stale results).

## Migrated stubs

Read all five `docs/AB_TESTING_*.md` root files and merge in next refresh:
- `AB_TESTING_FEATURE.md`
- `AB_TESTING_BEST_PRACTICES.md`
- `AB_TESTING_DEDUPLICATION.md`
- `AB_TESTING_DATABASE_OPTIMIZATION.md`
- `AB_TESTING_METRICS_CALCULATION.md`
