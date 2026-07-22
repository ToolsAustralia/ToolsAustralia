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
| `E2E_BUILD=1` mode: `next build` itself fails before any test runs. | Currently reproducing — see "Open finding — `next build` fails" below. | Not an e2e-harness bug; escalate, don't retry. |

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

Unlike Klaviyo/GTM/GA/Hotjar, Contentsquare's `<Script>` in `src/app/layout.tsx` is
**hardcoded** — a fixed `src` with `strategy="lazyOnload"` and no `disabled`/env-conditional
prop — so the env overlay has no variable to blank. `strategy="lazyOnload"` fires it after every
page's `load` event regardless of route, and its session-recording iframe intermittently produced
the same sandboxed-iframe `console.error` as the GTM leak, caught unpredictably across different
specs. Fixed at the only layer available at e2e scope: the `watchdog` fixture
(`e2e/fixtures/test.ts`) generalized its Klaviyo `context.route()` interception into a shared
third-party blocklist — `/klaviyo\.com|contentsquare\.net|hotjar\.(com|io)/`, fulfilled
empty-but-successful, context-scoped (covers popups too). The `setup` project (`auth.setup.ts`)
imports plain `@playwright/test`, not `../fixtures/test`, so this blocklist did not run there
either — its 2 logins + `/admin` warm-up fetched live Contentsquare. Fixed by copying the same
`context.route()` pattern into a `setup.beforeEach` in `auth.setup.ts` (comment there points back
to `fixtures/test.ts` as the source of truth — keep the two in sync if the blocklist regex ever
changes). **Residual, accepted**: `e2e:env` manual/MCP sessions still bypass both blocklists —
accepted because a stray session recording of a local e2e browser carries no PII or
business-metric pollution risk severe enough to justify extending the workaround to a
human-driven, non-automated session. The complete fix (an env-conditional `disabled` gate on this
`<Script>`, matching `GoogleTagManager`/`KlaviyoScriptLoader`'s pattern) requires a `src/**` change
and has been flagged to the user separately, not applied inside `e2e/`.

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

## Open finding — `next build` currently fails (prod-only, blocks `E2E_BUILD=1` entirely)

Found running Task 13's prod-build success-criteria gate (`E2E_BUILD=1 npm run e2e:smoke`). The
orchestrator's own `next build` step (`e2e/run.ts` step 4) fails outright, before the app server
ever boots and before any Playwright test can run:

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
import anywhere in application code, so this is a **transitive** failure: either a dependency
pulls in `next/document`, or something in the App Router tree (a page, layout, or the custom
`not-found.tsx`) is getting bundled into Next's auto-generated Pages-Router-style `/500` fallback
in a way that breaks it. `next.config.ts` has no unusual `output`/export setting that would
explain it. This is **not an e2e-harness artifact** — `next dev` never statically prerenders
`/500` at all, so the bug is invisible outside `E2E_BUILD=1` or a real `npm run build`, but it
would reproduce with a plain `npm run build` too (not separately re-verified outside the e2e
overlay, for time). Per this task's explicit instruction, this is reported as a genuine prod-only
finding, not papered over or retried away — **`E2E_BUILD=1` mode is currently fully blocked** by
this until it's fixed in `src/` (out of scope for a docs-only task). See the Task 13 report for
the verbatim capture.

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
