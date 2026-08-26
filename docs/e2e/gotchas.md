# E2E — Gotchas & troubleshooting

## Quick troubleshooting reference

| Symptom | Cause | Fix |
|---|---|---|
| `E2E_MONGODB_URI is not set — refusing to run.` | Not declared in `.env.local`. | Add a dedicated MongoDB URI whose db name contains `"e2e"`. See how-to-run.md prerequisites. |
| `E2E_MONGODB_URI equals MONGODB_URI — refusing to run against the main database.` | The guard is working as designed. | Point `E2E_MONGODB_URI` at a genuinely separate database. Never bypass this — the suite wipes it every run. |
| `E2E database name "..." does not contain 'e2e' — refusing.` | Db name doesn't include `e2e`. | Rename/repoint the URI's database segment. |
| `STRIPE_SECRET_KEY is not a test-mode key (sk_test_...) — refusing to run e2e.` | A live key is set locally. | Use a `sk_test_...` key for local/e2e work. |
| `Stripe CLI unavailable or not logged in.` | `stripe listen --print-secret` failed. | Install the Stripe CLI and run `stripe login` (interactive — an agent cannot do this). `@smoke`-only and `--env-only` runs continue anyway (with a warning, no webhook forwarding); any other run mode throws. |
| `Port <N> is already in use — a stale server may be running.` | A previous run's server didn't tear down, or something else is on the port. | Kill the stale process, or set a different `E2E_PORT`. The orchestrator checks this before ever spawning a server — see the port pre-flight gotcha below. |
| `Server process exited (code N) before becoming ready...` | The `next dev`/`next start` child crashed during boot. | Check `e2e-artifacts/logs/server.log` — this is a real app-boot failure, not a timeout. |
| A `--grep` value with a space finds "No tests found". | Windows `child_process` mis-quotes whitespace-containing args through a `shell:true` `.cmd` shim. | The orchestrator already quotes for you — this only bites if you're invoking `e2e/run.ts` some other way. See the win32 quoting gotcha below. |
| A webhook-dependent assertion times out (`No active membership + entries for ... within Ns`). | Webhook forwarding never reached the app, or processing lagged. | Check `e2e-artifacts/logs/stripe-listen.log` for the POST; check `server.log` for the handler. See "webhook timing" below. |
| A visual baseline (`@visual`) fails after a real, intentional UI change. | Expected — baselines are point-in-time. | Update via Playwright's standard `--update-snapshots` flag, review the diff, commit the new PNGs deliberately (never blanket-regenerate without reviewing what changed). |
| A prod-only (`E2E_BUILD=1`) failure that doesn't reproduce in dev mode. | A real prod-mode difference — CSP route class, `next.config.ts`'s `removeConsole`, etc. | This is a genuine finding, not an e2e infra bug — do not paper over it; see CLAUDE.md's Performance footguns §(7) and Security headers/CSP section. |
| `E2E_BUILD=1` mode: `next build` itself fails before any test runs. | A plain `npm run build` is fixed (2026-07-21, `serverExternalPackages`) — but `E2E_BUILD=1` specifically still fails, a **different, related** finding. See "Open finding — `E2E_BUILD=1`'s `next build` still fails" below. | Not an e2e-harness bug; escalate, don't retry. |

## Resolved gotcha — seeded admin needs `userType: "admin"`, not just `role: "admin"`

`src/middleware.ts`'s `isInternalUser()` and `admin/layout.tsx`'s server guard both accept the
legacy role-only bridge (`role === "admin"`), but the **client-side** `usePermissions.isStaff`
gate that guards the `/admin` root page (`src/hooks/usePermissions.ts:26`,
`src/app/admin/page.tsx:36-41`) checks `userType === "admin" || userType === "staff"` only — a
legacy-only admin (`role: "admin"`, `userType: "customer"`) passes the route-level guards and
then gets client-side `router.push("/")`'d straight back out. Root-caused via a Playwright trace
network log showing two successful `/admin` RSC fetches followed by a soft-navigation back to
`/` — not a compile-timing race, as first assumed. `scripts/migrate-seed-staff-roles.ts` confirms
real admin provisioning backfills `userType: "admin"` for every `role: "admin"` user, so the seed
(`e2e/seed/users.ts`) was diverging from how real admins actually look; fixed there.

## Resolved gotcha — `NEXT_PUBLIC_API_URL` must follow the e2e origin

`.env.local` sets `NEXT_PUBLIC_API_URL=http://localhost:3000` for normal local dev. Until fixed,
the env overlay remapped `NEXTAUTH_URL` to the dynamic e2e port but left `NEXT_PUBLIC_API_URL`
unmapped, so `src/lib/queries.ts`'s `apiGet`/`apiRequest` (used by `useWinnersQueries`,
`useMajorDrawQueries`, and other client hooks) built absolute URLs against the wrong port — every
page rendering a winners/major-draw widget (`/`, `/membership`, `/mini-draws`) fired client XHRs
at an unreachable `http://localhost:3000/...`. Surfaced as the QA watchdog catching real
`net::ERR_CONNECTION_REFUSED` console errors on every run of `legal-copy.spec.ts` — confirmed via
trace network logs to be **not** a legal-copy violation (zero `BANNED_COPY` hits in any run).
Fixed by remapping `NEXT_PUBLIC_API_URL` alongside `NEXTAUTH_URL` in `e2e/lib/env.ts`'s overlay;
regression-covered by `resolveE2eEnv builds the overlay` in `e2e/lib/__tests__/env.test.ts`.

## Resolved gotcha — real GTM/GA fired during e2e runs

`.env.local` sets `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_GA_ID`, and
`NEXT_PUBLIC_ENABLE_GTM_TESTING=true` for manual local GTM testing; the overlay didn't blank any
of them, so `src/app/layout.tsx` mounted `GoogleTagManager` with a real container id in every
e2e run — real GA hits plus sandboxed GTM tag iframes producing `console.error: Blocked script
execution in 'about:blank' because the document's frame is sandboxed...`, correctly caught by the
QA watchdog. `GoogleTagManager` itself no-ops without a `gtmId`
(`src/components/GoogleTagManager.tsx:38`), so blanking `NEXT_PUBLIC_GTM_ID` is the load-bearing
fix; `NEXT_PUBLIC_ENABLE_GTM_TESTING` and `NEXT_PUBLIC_GA_ID` are blanked too as belt-and-
suspenders. `NEXT_PUBLIC_HOTJAR_ID` is also blanked as registry hygiene, though no component in
`src/` currently reads it directly (the only Hotjar surface found is a dead GTM custom-HTML tag
already neutralized via `'gtm.blocklist':['html']` in `src/utils/security/inline-snippets.ts`).
Deliberately **not** blanked: `NEXT_PUBLIC_HCAPTCHA_SITEKEY` (functional dependency for
registration) and `NEXT_PUBLIC_PIXEL_ALLOWED_HOSTNAMES` (the hostname gate itself).

## Resolved gotcha — Klaviyo leak (same class as GTM, found first)

`.env.local` sets `NEXT_PUBLIC_ENABLE_PIXEL_TESTING=true` and a real
`NEXT_PUBLIC_KLAVIYO_COMPANY_ID` for manual local pixel testing;
`src/app/layout.tsx` only disables `KlaviyoScriptLoader` in dev when
`NEXT_PUBLIC_ENABLE_PIXEL_TESTING` is falsy. Real Klaviyo client script loaded and fired real
XHRs to `a.klaviyo.com`, which failed inside the sandboxed e2e browser context
(`console.error: Access to XMLHttpRequest at 'http://a.klaviyo.com/...' ... blocked by CORS
policy`, `pageerror: ProgressEvent`). Fixed by blanking `NEXT_PUBLIC_ENABLE_PIXEL_TESTING` and
`NEXT_PUBLIC_KLAVIYO_COMPANY_ID` in the overlay (both no-op the loader independently — belt and
suspenders).

## Resolved gotcha — Contentsquare has no env gate; blocked at the browser edge instead

**Update (2026-07-22): fixed at the source.** Contentsquare's `<Script>` in `src/app/layout.tsx`
is no longer hardcoded — the tag id was extracted to `NEXT_PUBLIC_CONTENTSQUARE_ID` and the
`<Script>` only renders when it's non-empty (mirrors `GoogleTagManager`'s `!gtmId` no-op). `e2e/lib/env.ts`
blanks it in the overlay (belt-and-suspenders, same as every other tracker var), so the script
no longer renders — and therefore never requests — for any e2e session, including `e2e:env`
manual/MCP sessions that previously bypassed the workaround below. The browser-edge blocklist
(`context.route()` in `e2e/fixtures/test.ts` and `e2e/setup/auth.setup.ts`) is **kept as
defense-in-depth** (it also still covers Klaviyo/GTM/GA/Hotjar, and a stray manual `.env.local`
with a real id set would otherwise leak) but is no longer load-bearing for Contentsquare — the
original incident this section describes is closed at the root cause. History follows.

Unlike Klaviyo/GTM/GA/Hotjar, Contentsquare's `<Script>` in `src/app/layout.tsx` was
**hardcoded** — a fixed `src` with `strategy="lazyOnload"` and no `disabled`/env-conditional
prop — so the env overlay had no variable to blank. `strategy="lazyOnload"` fires it after every
page's `load` event regardless of route, and its session-recording iframe intermittently produced
the same sandboxed-iframe `console.error` as the GTM leak, caught unpredictably across different
specs. Fixed (at the time) at the only layer available at e2e scope: the `watchdog` fixture
(`e2e/fixtures/test.ts`) generalized its Klaviyo `context.route()` interception into a shared
third-party blocklist — `/klaviyo\.com|contentsquare\.net|hotjar\.(com|io)/`, fulfilled
empty-but-successful, context-scoped (covers popups too). The `setup` project (`auth.setup.ts`)
imports plain `@playwright/test`, not `../fixtures/test`, so this blocklist did not run there
either — its 2 logins + `/admin` warm-up fetched live Contentsquare. Fixed by copying the same
`context.route()` pattern into a `setup.beforeEach` in `auth.setup.ts` (comment there points back
to `fixtures/test.ts` as the source of truth — keep the two in sync if the blocklist regex ever
changes). **Previously residual, now closed**: `e2e:env` manual/MCP sessions used to bypass both
blocklists (accepted at the time because a stray session recording of a local e2e browser carries
no PII or business-metric pollution risk severe enough to justify extending the browser-edge
workaround to a human-driven, non-automated session) — the source-level env gate above closes this
gap for free, since a blank id means there is nothing to bypass.

## Resolved gotcha — Facebook/TikTok Marketing API creds leak through server-side admin reads

`e2e/lib/env.ts`'s overlay blanked the client-facing CAPI/pixel tokens (`FACEBOOK_ACCESS_TOKEN`,
`TIKTOK_ACCESS_TOKEN`, pixel ids) but missed the separate **Marketing API** creds
(`FACEBOOK_MARKETING_ACCESS_TOKEN` + `FACEBOOK_AD_ACCOUNT_ID`, `TIKTOK_MARKETING_ACCESS_TOKEN` +
`TIKTOK_ADVERTISER_ID`) that the admin dashboard's live "today" stats path reads **server-side**:
`DashboardStatsSnapshotReader` → `AD_CHANNEL_PROVIDERS` →
`adChannelProviders.ts`'s `facebookAdChannelProvider` → `fetchFacebookInsights`, and separately
`hourlyRevenueByPlatform.ts` / `tiktokAdInsights.ts` for TikTok. Because these are
server-to-server fetches to `graph.facebook.com` / `business-api.tiktok.com` that never touch the
Playwright browser context, the browser-edge blocklist above (Contentsquare fix) **cannot** reach
them — a `.env.local` populated with real creds (as this repo's is, for manual admin-dashboard
testing) would fire live Meta/TikTok Marketing API calls every time an e2e run visits `/admin`
with a date range including today (the `setup` project's own `/admin` warm-up does this). Fixed by
blanking all four vars in the overlay; each provider's own guard then short-circuits before any
network call — verified via `server.log`: `[adChannel:facebook] FACEBOOK_AD_ACCOUNT_ID or
FACEBOOK_MARKETING_ACCESS_TOKEN not set — preserving any prior snapshot value` fires on every
admin-page hit, and no `graph.facebook.com`/`business-api.tiktok.com` line ever appears in the
log. Audited for further siblings (`SNAPCHAT_ACCESS_TOKEN`): its only reader
(`src/lib/tracking/providers/snapchat.ts`) is a checkout-flow CAPI token whose `capiSend` is a
literal stub (`return false`, no fetch call implemented yet) — nothing to block, and not an admin
path, so deliberately left unblanked.

## Resolved gotcha — rate-limit buckets collide across parallel workers

The credentials sign-in rate limiter (5/min per IP, `src/app/api/auth/[...nextauth]/route.ts` via
`src/utils/security/rateLimiter.ts`'s `getClientIdentifier`, which reads `x-real-ip`/
`x-forwarded-for`) buckets by client IP. Every Playwright worker in a local run shares the same
loopback IP by default, so multiple workers logging in concurrently collide on one shared bucket
and start 429-ing each other — not a real rate-limit bug, an e2e-only artifact of running many
browser contexts from one machine. Fixed with an **auto** `extraHTTPHeaders` fixture
(`e2e/fixtures/test.ts`) that gives each worker its own synthetic
`x-forwarded-for: 10.77.<workerIndex % 250>.<parallelIndex % 250 + 1>` — the limiter itself is
untouched (still fully active, still catches a real excessive-attempts bug), this only fans it
out across workers so the suite's own parallelism doesn't trip it. The `setup` project uses a
single dedicated IP (`10.77.250.1`) since it only ever does 2 logins (member + admin) — well
under the cap.

## Resolved gotcha — `/membership`/`/` hydration mismatch under emulated `reducedMotion`

Setting `reducedMotion: "reduce"` site-wide (as an earlier brief wanted, to freeze
`BrandScroller`'s marquee for visual baselines) reproduced a 100%-repro hydration mismatch on `/`
and `/membership` across all 3 projects (`A tree hydrated but some attributes of the server
rendered HTML didn't match the client properties`). Root cause traces into `framer-motion`, not
this repo: `useReducedMotion()` lazily reads `window.matchMedia("(prefers-reduced-motion)")`
**synchronously on the first client render** (module-level singleton, no effect gate — returns
`null` server-side per framer-motion's own source). With the emulated media feature active from
context creation, the client's first hydration pass sees `true` while SSR always saw `null` — a
genuine (if narrow) SSR/CSR mismatch that would affect any real user with OS-level
reduced-motion on, surfaced here only because e2e was the first caller to set this emulation.
Out of scope to fix inside `e2e/` (it's a `framer-motion` + every `useDeviceProfile`/
`useReducedMotion` consumer issue, not a test-file issue) — worked around instead by leaving
page-load media emulation at Playwright's default ("no preference", matching SSR) and masking the
one motion source it was protecting against (`BrandScroller`) directly in `visual.spec.ts`. The
`my-account` describe block **does** set `reducedMotion: "reduce"` (that page's tree doesn't hit
this hook on first render — verified clean across all 3 projects).

**Update (2026-07-22) — the concrete `/membership` source of this class fixed.** The specific
consumer that was 100%-repro under `reducedMotion: "reduce"` was root-caused to
[`Carousel3D`](../../src/components/ui/Carousel3D.tsx) (`/membership`'s `DrawCycle` section, and
`/`'s `PowerToolsetCarousel`): it read `useReducedMotion()` straight into a render-path value
(`geometry.maxBlur`) instead of gating it behind an effect like `useDeviceProfile` does. Fixed with
the same two-pass pattern — see [docs/shared-ui/gotchas.md](../shared-ui/gotchas.md) for the
mechanism and fix. This does not change the `e2e/`-side decision above (page-load media emulation
still defaults to "no preference" — reduced-motion is now safe to enable per-page/per-spec since
the source consumer no longer mismatches, but nothing in the suite currently needs it re-enabled).

## Resolved gotcha — `stripewebhookqueue` is singular, and its type field is `type` not `eventType`

`src/models/StripeWebhookQueue.ts`: collection `"stripewebhookqueue"` (singular), fields
`eventId` (Stripe `evt_...` id), `type` (Stripe event type — not `eventType`), `payload` (the
full Stripe event, so `payload.data.object.id` is the invoice id). An earlier draft assumed
`"stripewebhookqueues"`/`eventType` and would have silently matched nothing.

## Resolved gotcha — a Stripe CLI `events resend` carries the SAME `event.id`, unlike a Dashboard resend

`src/services/stripe-webhook-queue/processQueuedEvent.ts`'s own comment ("Stripe dashboard
*resends* carry a fresh `event.id` and bypass enqueue idempotency") describes a genuine
**Dashboard**-triggered resend, but the Stripe **CLI**'s `stripe events resend <id>` behaves
differently — verified live via a side-by-side diagnostic session (`stripe-listen.log` showed the
**identical** `evt_...` id POSTed to `/api/stripe/webhook` twice, 5s apart, both 200). Because
`enqueueStripeEvent`'s upsert is keyed on `eventId`, a same-id redelivery is a Layer-1
(queue-level) no-op — it never reaches `processQueuedEvent`/the handler again, so there is **no**
Mongo-observable side effect from the redelivery itself (no new queue row, no changed field, the
`paymentevents` unique `_id` layer never even re-exercised). This means a webhook-replay spec
asserting "entries didn't change" after a CLI resend is, by itself, **not distinguishing** "the
idempotency guard worked" from "the replay never arrived at all" — it needs a **positive-delivery
check** first (poll `stripe-listen.log` for a second `POST .../api/stripe/webhook [<same
eventId>]` line) before trusting the no-double-grant assertion. See `webhook-replay.spec.ts`.

## Resolved gotcha — queue-row status races the DB-visible grant

`markSucceeded` (in `processQueuedEvent.ts`) writes **after** the benefit-granting dispatch
returns, so a `status: "succeeded"` filter on `stripewebhookqueue` immediately after
`waitForActiveMembership` resolves can intermittently find nothing. Poll the queue row by
identifying fields (event type + invoice id) with **any** status, not a single strict-status
`findOne`.

## Resolved gotcha — win32 `--grep` arg quoting

`e2e/run.ts` spawns `playwright`/`tsx` with `shell: true` on Windows; passing an **args array**
with `shell: true` mis-quotes any arg containing whitespace when invoking a `.cmd` shim like
`npx` (a documented Node `child_process` limitation) — e.g. `--grep "lens self-tests"` arrives at
Playwright as two bare tokens instead of one grep value, and it silently finds zero tests. Fixed
with a `winq()` helper that wraps any whitespace-containing arg in escaped quotes before the
`shell:true` spawn (no-op on non-Windows). Applies automatically inside the orchestrator; only
relevant if you're invoking `e2e/run.ts`'s underlying spawn some other way.

## Resolved gotcha — stale/zombie server on the target port

Before this was added, a prior run that didn't tear down cleanly (or an unrelated process) could
leave something listening on `E2E_PORT`, and the orchestrator would boot right past it, producing
confusing failures against the wrong server. `assertPortFree(port)` attempts a 2s-timeout `fetch`
against `http://localhost:<port>/`; anything that resolves (a response) or times out (connection
accepted but unresponsive) is treated as "busy" and throws `Port <N> is already in use — a stale
server may be running. Kill it or set E2E_PORT to a free port.` A connection-refused-style
rejection is the only "free" outcome. This check now runs **before** `wipeAndSeed`, not after —
originally it ran right before server launch (after the wipe), which meant a busy-port abort still
cost one wasted database wipe. Worse than "wasted": if the busy port belongs to a **different**,
still-running e2e session (e.g. a held-open `e2e:env` manual/MCP session sharing the same default
port), that session's database got wiped out from under it by a run that then immediately refused
to start — a stale-port collision destroying a live session's data instead of just failing fast.
Reordered so the abort happens before any destructive action.

## Open finding (not yet resolved) — intermittent `/membership` hydration mismatch, general and page-level

First observed during Task 13's success-criteria gate, across three independent full-suite runs
(`npm run e2e`, all after the full-run split — see architecture.md — was in place) — i.e. **not**
a symptom of the mixed-purchase-load problem that split fixed, since it recurred under
Playwright's normal (non-`@purchase`) parallelism in phase A, and inside isolated single-project
`@purchase` legs in phase B with no other load at all. Symptom, every time:

```
console.error: A tree hydrated but some attributes of the server rendered HTML didn't match the
client properties. This won't be patched up. This can happen if a SSR-ed Client Component used:
- A server/client branch `if (typeof window !== 'undefined')`.
- Variable input such as `Date.now()` or `Math.random()` wh[ich changes between the...]
```

Observed hitting **any** spec that visits `/membership`, not one particular file:
`legal-copy.spec.ts`, `a11y.spec.ts`, `visual.spec.ts`'s membership-tiers case (manifesting as a
screenshot diff rather than a console error), `purchase-idempotency.spec.ts`, and
`webhook-replay.spec.ts` have all hit it at least once. Across all three full-suite runs, it fired
**11 times total**; **9 self-healed on Playwright's built-in retry**, but **2 did not** — both
attempt and retry failed within the same run (once in `a11y.spec.ts`, once in `visual.spec.ts`'s
membership-tiers case, both on `chromium-desktop`, both in runs from before the a11y-scoping
decision and the `isFullRun` hardening existed). The most recent full run (after both of those
landed) saw the race fire 5 times and self-heal all 5 — encouraging, but a small sample, and not
proof the race's underlying cause changed; it may simply not have gotten unlucky twice in the same
run again yet. Per the acceptance criterion this task was given ("recovering on retry is
acceptable; deterministic failures are not"): this is neither fully acceptable (not every
occurrence self-heals) nor deterministic (most `/membership` visits, including plenty in the same
runs where it did fire elsewhere, are clean) — it's a genuine, low-frequency intermittent race
that hasn't been root-caused. No prior task in this branch's history ran the full unscoped suite
at all before Task 13 (confirmed by grep across `.superpowers/sdd/task-*-report.md` — every
earlier `@a11y`/`@demo`/`@purchase` run was project- or grep-scoped), so this wasn't previously
visible. Root cause not yet investigated (would require reading React's hydration-mismatch context
in an actual failing render — the `Date.now()`/`Math.random()` hint in React's own boilerplate
warning is generic, not diagnostic — and is out of scope for a docs-only task); flagged here and
in the Task 13 report rather than silently retried away or absorbed into a watchdog allowlist.

**Update (2026-07-22) — instrumented, not fixed; this is a separate, still-open occurrence.**
Confirmed this is genuinely a different manifestation from the `Carousel3D` finding fixed above
(see [docs/shared-ui/gotchas.md](../shared-ui/gotchas.md)) — that fix is real but was 100%-repro
only under explicit `reducedMotion: "reduce"` emulation, whereas this finding fires intermittently
under Playwright's default ("no preference") emulation, so it isn't the same bug recurring. The
actual blocker to root-causing it turned out to be **this file's own watchdog**: the
`console.error` capture in the `watchdog` fixture below truncated every message to 300 characters,
which cuts off before React 19's per-element diff (the part that actually names the mismatching
element/prop) ever appears — the generic boilerplate paragraph quoted above alone is close to that
limit. Fixed by widening the cap to 2000 characters for any message matching `/hydrat/i` (everything
else keeps the 300-char cap, so failure output stays readable) — see the `watchdog` fixture comment
in `e2e/fixtures/test.ts`. This is instrumentation, not a fix: the underlying intermittent mismatch
is still open. Root-cause it from the full captured diff the next time it fires, do not re-truncate
or allowlist it away.

**The instrumentation immediately paid off** — the raised cap caught the mismatch **3 more times**
in this same task's verification (`npm run e2e:smoke` × 4: 1 occurrence in run 1, 1 in run 2, 0 in
run 3, 1 in run 4; see the fix-B task report for full logs), and every single occurrence, across
different specs (`registration.spec.ts`, `legal-copy.spec.ts` on `/membership`) and different
projects (`chromium-desktop`, `mobile-chrome`), diffs the **exact same element and attribute**:
`Carousel3D`'s stage `<div id={stageId}>` (`stageId = ${baseId}-stage`, from `const baseId =
useId()` — [src](../../src/components/ui/Carousel3D.tsx)), always the identical id string
(`_R_2jlesndabn1cqlb_-stage` — expected, since `useId()` is deterministic per tree position, not
random, so the same server request always derives the same id for the same tree slot). The captured
diff still doesn't reach the actual `-` (server) value even at 2000 chars — it cuts off right after
the `+` (client) line — so the two values being compared are still unconfirmed; only the **site** is
now pinned down. This is **not** the `maxBlur`/`filter` bug fixed above (no `reducedMotion` emulation
is active in these specs, and the diffed attribute is `id`, not `style`) — a distinct bug at the same
component. A `useId()` SSR/CSR mismatch normally means the server and client disagree about the
component's position in the tree, which is usually a symptom of a **dev-server-only** race (Turbopack
recompiling the module graph while a request is in flight, so the SSR pass and the hydration pass
run against slightly different compiled versions) rather than a `src/` logic bug — consistent with
this firing only under concurrent multi-worker load and never in a targeted single-test run, and with
the sibling Turbopack module-graph fragility already documented in the `E2E_BUILD=1` finding below.
Unconfirmed, but the next person chasing this should start there rather than assuming a fresh cause.
**Ruled out as a cause:** the fix-B task's own git-stash/pop cycling of `Carousel3D.tsx` against a
*live* `e2e:env` dev server (to capture before/after evidence) left a stale `.next/cache` that
produced a *worse* flake rate for two runs; clearing `.next` and re-running showed this same
mismatch recur identically on a clean cache too, so it predates and is independent of that
methodology artifact — just confirming it's real, not ruling out *what* causes it.

## Resolved gotcha — `next build` failed (prod-only, blocked `E2E_BUILD=1` entirely)

Found running Task 13's prod-build success-criteria gate (`E2E_BUILD=1 npm run e2e:smoke`). The
orchestrator's own `next build` step (`e2e/run.ts` step 4) failed outright, before the app server
ever booted and before any Playwright test could run:

```
Generating static pages (0/359) ...
Error: <Html> should not be imported outside of pages/_document.
Read more: https://nextjs.org/docs/messages/no-document-import-in-page
    at x (.next\server\chunks\ssr\[root-of-the-server]__79c22641._.js:6:1351)
Error occurred prerendering page "/500". Read more: https://nextjs.org/docs/messages/prerender-error
Export encountered an error on /_error: /500, exiting the build.
 ⨯ Next.js build worker exited with code: 1 and signal: null
```

`grep -rl "next/document" src/` returns nothing — there is no direct `<Html>`/`next/document`
import anywhere in application code, so this was a **transitive** failure. Root-caused: Next's own
tracer (`next/dist/server/lib/trace/tracer.js`) prefers a user-installed `@opentelemetry/api` over
its bundled compiled shim when one is resolvable; the `ai` package (`^6.0.209`) depends on the
real `@opentelemetry/api`, and Turbopack was bundling it into server chunks, which altered the
module graph enough that the auto-generated `/500` fallback resolved a mismatched `HtmlContext`.
This was **not an e2e-harness artifact** — `next dev` never statically prerenders `/500` at all,
so the bug was invisible outside `E2E_BUILD=1` or a real `npm run build`, but reproduced with a
plain `npm run build` too. **Fixed (2026-07-21)** by adding `"@opentelemetry/api"` to
`serverExternalPackages` in `next.config.ts`, forcing Next's tracer back onto its own compiled
shim instead of the bundled real package — see `docs/security-csp/gotchas.md` for the mirrored
entry (the file itself is in that domain's manifest paths). Verified repeatedly: a plain
`npm run build` now completes 359/359 pages cleanly on a fully clean `.next`, no `<Html>` error.
See the Task 13 report for the original verbatim capture.

## Open finding (not yet resolved) — `E2E_BUILD=1`'s `next build` still fails, a related but distinct manifestation

Found immediately after verifying the fix above: `E2E_BUILD=1 npm run e2e:smoke` still fails at
`e2e/run.ts`'s own `next build` step (`spawnSync("npm", ["run", "build"], { env: env.overlay, ... })`),
before the server ever boots — so `E2E_BUILD=1` mode is **still fully blocked**, just by a
narrower trigger than before. The `@opentelemetry/api` fix is real and does not regress; this is
new information the fix's own verification surfaced, not evidence the fix is wrong.

**Isolated by direct bisection** (setting each env var individually and re-running `npm run build`
outside the orchestrator, each on a fully clean `.next`):

- Plain `.env.local` env (`NEXTAUTH_URL=http://localhost:3000`) → succeeds, 4/4 clean-build runs.
- `e2e/lib/env.ts`'s full overlay (Mongo URI swap + port + URL remap + tracking-var blanking) →
  fails, 3/3 runs, always the same signature.
- Overlay minus the tracking-var blanking (Mongo/port/URL only) → still fails.
- Overlay minus the Mongo URI swap (just `PORT`/`NEXTAUTH_URL`/`NEXT_PUBLIC_API_URL`) → still fails.
- **`NEXTAUTH_URL=http://localhost:3799` alone, nothing else changed** → fails, 2/2 clean-build
  runs. This is the minimal reproducer.

The failure signature is the **same error class** as the resolved finding above, just on a
different route:

```
Error: <Html> should not be imported outside of pages/_document.
Read more: https://nextjs.org/docs/messages/no-document-import-in-page
Export encountered an error on /_error: /404, exiting the build.
 ⨯ Next.js build worker exited with code: 1 and signal: null
```

(A separate, one-off `TypeError: Cannot read properties of null (reading 'useContext')` prerendering
`/competition-term-majordraw` was also observed once, in the very first `E2E_BUILD=1` attempt, but
did **not** reproduce in any of the 4 subsequent bisection runs — treated as an unrelated,
non-reproducing flake, not part of this finding.)

**Interpretation**: the `@opentelemetry/api` fix eliminates the specific chunk-splitting order
that broke `/500` under the *default* env, but doesn't eliminate the underlying Turbopack
module-graph fragility — a different env (specifically a non-default `NEXTAUTH_URL`) produces a
different chunk-splitting order that can still trip the same latent bug, just on a different
auto-generated error route (`/404` this time). **Ruled out**: Next's own "multiple lockfiles ...
selected `C:\Codes\ToolsAustralia\package-lock.json` as the root directory" warning (this worktree
nests under the main repo, so Turbopack's root inference sees the parent's lockfile too) looked
like a plausible unifying cause — pinning `turbopack.root` to this folder silences the warning
cleanly but does **not** fix the `NEXTAUTH_URL`-triggered failure (tested directly), so that
theory is disproven and the config change was not kept.

**Why this doesn't block the target fix**: real production builds/deploys never remap
`NEXTAUTH_URL` mid-build — Vercel sets it once to the canonical prod URL and it never changes
between builds — so this specific trigger is unique to `E2E_BUILD=1`'s port-remapping overlay, not
a production risk. **Empirically verified** (2026-07-22): `NEXTAUTH_URL=https://toolsaustralia.com.au
npm run build` on a clean tree exits 0 with the full page manifest — a production-style URL does
NOT reproduce the failure; only the localhost port-variant does. Gate 1 (a plain `npm run build`/production build) is genuinely fixed. But
`E2E_BUILD=1` mode itself remains not runnable until this deeper Turbopack/`@opentelemetry`
fragility is understood further — flagged here for a follow-up task rather than guessed at with a
second speculative `next.config.ts` change.

## Webhook timing — what "slow" looks like and how to tell it apart from "broken"

Benefit-granting from a webhook is **not** synchronous with the UI's own success state — the
grant happens in-process via Next's `after()` once the webhook POST is received and processed.
Every purchase-outcome helper (`waitForActiveMembership`, `waitForOneTimeEntries`) polls the
database rather than the UI for this reason, with generous budgets (120-180s). If a wait times
out:
1. Check `e2e-artifacts/logs/stripe-listen.log` — did the event even arrive? (Look for
   `POST .../api/stripe/webhook [evt_...]`.)
2. If it arrived, check `server.log` around that timestamp for the handler's own logging/errors.
3. If neither shows anything, the forwarder itself may not be connected — confirm
   `stripe listen --print-secret` still succeeds (CLI session can expire).

## Visual baseline updates

`@visual` baselines (`e2e/specs/quality/visual.spec.ts-snapshots/`) are point-in-time PNGs, one
per project × page (win32-suffixed filenames — these baselines are platform-specific). When a
real, intentional UI change legitimately moves pixels: run the affected test with Playwright's
`--update-snapshots` flag, review the actual diff (not just accept blindly), and commit the
regenerated PNGs. Never raise `maxDiffPixelRatio` above the existing `0.02` to paper over a page
that isn't stabilizing — mask the specific dynamic region more precisely instead (see
`visual.spec.ts`'s `topBar`/`floatingCountdown`/`brandScroller`/`drawCountdown`/`renewalNote`/
`cycleFuse` masks and their comments for the pattern: wait for the dynamic element to settle,
then mask its bounding box, rather than fighting it with a looser pixel tolerance).

## Resolved gotcha — an auto-opening modal intercepts clicks in PROOF MODE ONLY

Symptom: `streak-journey.spec.ts` passed every normal run and hung to its own test timeout on
every `--proof` render — twice, costing a 5-minute and then a 20-minute cycle. No useful error:
just `Test timeout of Nms exceeded`.

Root cause: `/my-account` auto-opens the subscription-explainer modal (`#sem-headline`,
"Entry Accumulation Over Time") ~2.5s after mount. Its `fixed inset-0` overlay intercepts
pointer events for the whole viewport. Playwright's call log names the culprit exactly once you
bound the click and let it fail:

```
- element is visible, enabled and stable
- <h3 ...>Entry Accumulation Over Time</h3> from <div class="fixed inset-0 ...">…</div>
  subtree intercepts pointer events
- retrying click action   (× until timeout)
```

**Why proof mode and only proof mode:** `demo.step` paints its caption and holds for
`holdFor(title)` (~1.8-4s) BEFORE running the beat body. A beat that navigates to `/my-account`
and then clicks lands its clicks *after* that hold — i.e. after the 2.5s timer has fired and the
modal is up. Outside proof mode there is no hold, the clicks land within the 2.5s window, and
the spec passes. Any `@demo` beat that navigates to a route with a delayed auto-modal and then
clicks has this exposure; dismissing the modal once earlier in the journey does NOT inoculate a
later fresh navigation, which remounts the page and restarts the timer.

Fix: dismiss the modal after every navigation that can re-arm it, at the shared choke point both
beats route through — and per the round-4 caption rule, do it BEFORE the `demo.step` opens, never
inside it.

**The transferable lesson is the debugging method, not the modal.** Two things made this cost
three render cycles instead of one:

1. **`playwright.config.ts` sets no `actionTimeout`**, so an unactionable `click()` waits forever
   and surfaces as a bare test-level timeout with no indication of *which* line or *why*. Bound
   the clicks in a demo beat (`click({ timeout: 10_000 })`) — that alone converted a silent
   20-minute hang into a pointed error in 2 minutes, with Playwright naming the intercepting
   element. Same reasoning as `demo.ts` bounding its own `scrollIntoViewIfNeeded`/`boundingBox`
   at 5s.
2. **Read `narration.json` before touching a timeout.** Its cues are the per-beat clock: beats
   1-9 recorded at 65s, then `endMs: 1200479`. That gap is a *hang*, not slowness — a raised
   timeout only buys a longer hang. The first response here was to raise the budget 5m → 20m,
   which diagnosed nothing and wasted a full cycle. If the last cue is an early beat and `endMs`
   is the timeout, look for a blocked action, not a slow one.

Related: proof mode's own "never hand `demo.highlight` a locator that might be hidden" rule
(above) is the same failure class — an unbounded actionability wait with no `actionTimeout` net.

## Beacon payload assertions use `toEqual`, so adding a field breaks them (2026-07-29)

`e2e/specs/marketing/prize-build-url-params.spec.ts` asserts the prize-build beacon body with
`toEqual`, which is an **exact** match — an added field fails the assertion even though the payload
is correct. When the beacon contract changes, update all three places together: the `BuildBeacon`
interface and both `toEqual` payloads.

That is deliberate, not a nuisance: this spec exists to guard the beacon's write volume and
attribution, so a silently-widened payload should fail loudly rather than pass. It is what caught
F-018 doubling the write count.

**Reading a failure here, do not assume a stale expectation.** The first `interacted: true` diff
genuinely was one; the `Expected: 1, Received: 2` right behind it was a real regression. Read the
assertion diff before concluding which you have.

## Never read a Playwright summary through `tail`

Playwright prints the failure list and the `N failed` line **above** `N flaky` and `N passed`, so
`npm run e2e:smoke | tail -25` can show a clean-looking `73 passed / 10 flaky` while hiding
`18 failed` just off the top. This produced a false "0 failed" report during the round-2 panel review.

Two habits that prevent it:

- **Redirect to a file** (`> smoke.log 2>&1`) and grep the whole thing; never pipe a suite through
  `tail`.
- **Reconcile the count.** `npx playwright test --grep @smoke --list` prints the true total
  (107 at time of writing). If `passed + flaky + failed + skipped` does not equal it, the log is
  truncated or tests did not run — the numbers you have are not the numbers that happened.

## Resolved — a 3-D Secure payment redirected to the DEV port, not the e2e port (2026-08-04)

Symptom: completing a 3-D Secure challenge against the e2e server (`E2E_PORT`, e.g. 3805) landed
the buyer on `http://localhost:3000/purchase-success` — the normal dev port — so the success page
never loaded and the flow looked broken.

Cause: `NEXT_PUBLIC_APP_URL` was not in the env overlay. `.env.local` sets it to
`http://localhost:3000`, and `getBaseUrl()` (`src/utils/url/get-base-url.ts`) reads it to build
the redirect return URL in `getReturnUrlForPaymentType`. That URL is **baked into the
PaymentIntent when it is created server-side**, so no amount of client-side correctness fixes it
after the fact — and `getReturnUrlForPaymentTypeClient` (which uses `window.location.origin`, and
is therefore always right) is not what a redirect flow uses.

Fix: the overlay now sets `NEXT_PUBLIC_APP_URL: baseUrl`, exactly as it already did for
`NEXTAUTH_URL` and `NEXT_PUBLIC_API_URL`.

**Why it hid for so long:** a stale base URL is invisible until a payment actually *redirects*.
Every purchase spec until now used cards that complete inline, so nothing exercised a return URL.
The same is true of any future flow that leaves the app and comes back — bank redirects, wallet
payments, external SSO.

**Production is unaffected.** `getBaseUrl()` throws when `NEXT_PUBLIC_APP_URL` is unset in
production, and it is set there to the real domain. This was purely a local-harness gap.

## The shop `@purchase` specs cannot share a suite (2026-08-19)

`checkout.spec`, `entries.spec` and `full-story.spec` each pass **alone** and all
fail when run together. They share the seeded member, and therefore that member's
cart, and each drives a real purchase — so a still-settling webhook from the
previous spec rejects the next spec's add-to-cart with a 400 and the assertion
reads `variant never reached the server cart`.

This is stated in `full-story.spec.ts`'s own header and was still treated as a
signal once, costing three ~11-minute cycles chasing a regression that did not
exist. **Read a spec's header before interpreting its failure in a suite run.**

The real fix is to give each shop spec its own seeded member rather than sharing
one. Until then, run them one at a time:

```bash
npx tsx e2e/run.ts --grep "the complete story" --project chromium-desktop
```

### Two things that made both investigations cost more than they should have

1. **`playwright.config.ts` still sets no `actionTimeout`.** Both the showcase
   hang and this one surfaced as bare 300-second timeouts naming no line. The
   existing entry above ("an auto-opening modal intercepts clicks") already says
   bounding the click converts a silent 20-minute hang into a pointed error in
   two minutes. It is still worth doing globally.
2. **`purchase-via-showcase.spec.ts` fails independently of the merchandise
   branch** — reproduced with `LoginModal`, `CartContext`, `Header` and
   `ProductCard` all reverted to their pre-change state. Its click target is
   `page.getByRole("button", { name: /^purchase$/i })`, unscoped, so it can
   resolve to a Purchase button behind the membership modal rather than inside
   it. Not diagnosed further here; it is not a shop regression.

## The e2e harness used to poison the dev server's build cache (fixed 2026-08-21)

**Symptom:** `npm run dev` serves on :3000, the browser loads the page fine, and then
every client fetch dies:

```
Access to fetch at 'http://localhost:3799/api/winners/all' from origin
'http://localhost:3000' has been blocked by CORS policy
```

Nothing in `.env.local` is wrong — `NEXT_PUBLIC_API_URL` correctly reads
`http://localhost:3000`. That is what makes this expensive to diagnose.

**Cause:** `NEXT_PUBLIC_*` values are **inlined into client chunks at compile time**,
not read at runtime. `e2e/lib/env.ts` boots the app with `NEXT_PUBLIC_API_URL` and
`NEXT_PUBLIC_APP_URL` pointed at the e2e port, and the harness shared one `.next/`
directory with the dev server. Chunks compiled by an e2e run therefore carried
`localhost:3799`, and the dev server on :3000 happily served them.

Measured before the fix: **13 files under `.next/static` contained `localhost:3799`
while 38 contained `localhost:3000`** — one cache, two origins, and which one you got
depended on which process compiled that chunk last.

**Fix:** `next.config.ts` takes `distDir` from `NEXT_DIST_DIR`, and `e2e/lib/env.ts`
sets it to `.next-e2e`. The two builds can no longer see each other. `.next-e2e/` is
gitignored.

**If you hit this on an older checkout,** or after any run that predates the split:
kill the servers, `rm -rf .next`, restart — **and hard-refresh the browser**
(Ctrl+Shift+R). The browser caches the poisoned chunks independently of the server,
so a server-side clean alone still shows the old behaviour.

## `PORT` in `.env.local` does not change the dev port (verified 2026-08-21)

`.env.local` carries `PORT=3043`, and `next dev` still binds **3000**. The Next CLI
reads `process.env.PORT` before it loads `.env` files, so the value there is inert.

This matters because `NEXT_PUBLIC_API_URL` must match the port the app actually serves
on. If a future Next version starts honouring it, the app would move to 3043 while the
baked API base still said 3000 — the same CORS failure as above, from the other
direction. Set the port with `PORT=3043 npm run dev` on the command line if you want a
different one, and change `NEXT_PUBLIC_API_URL` to match in the same breath.

## Shop checkout comment (2026-08-25)

The checkout spec deliberately does not hardcode a total, since the seeded member holds
a tier. Its explanatory comment named the old Tradie 5% figure and now names 10%. The
assertions were untouched — they check relationships, which is why the ladder change did
not break them.
