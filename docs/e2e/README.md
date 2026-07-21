# E2E domain — Playwright end-to-end testing harness

> Build status: foundation under construction on `feature/playwright-e2e`.
> Design spec: `docs/superpowers/specs/2026-07-21-playwright-e2e-foundation-design.md`
> Implementation plan: `docs/superpowers/plans/2026-07-21-playwright-e2e-foundation.md`
> This doc set is completed in the plan's Task 13; until then this README is the single
> source for what already exists.

## What exists today

| Piece | File(s) | Purpose |
|---|---|---|
| Playwright config | `playwright.config.ts` | Projects `setup` / `chromium-desktop` / `mobile-chrome` / `mobile-safari`; NO `webServer` (the orchestrator owns server boot); proof-mode profile via `E2E_PROOF=1`. |
| Path constants | `e2e/lib/paths.ts` | Absolute paths for artifacts, auth storage states, proof output, logs (all under gitignored `e2e-artifacts/`). |
| Env overlay + safety guard | `e2e/lib/env.ts` (test: `npm run test:e2e-env`) | `resolveE2eEnv()` builds the env the app is booted with: `MONGODB_URI` → `E2E_MONGODB_URI`, dedicated `PORT`, and origin vars remapped to the e2e origin (`NEXTAUTH_URL`, `NEXT_PUBLIC_API_URL` — the latter is `src/lib/queries.ts`'s client-side `apiGet` base; `.env.local` points it at the normal dev port, so it must be repointed here too or client hooks like `useWinnersQueries`/`useMajorDrawQueries` fetch an unreachable port during e2e runs). Third-party keys neutered — server-side (`KLAVIYO_ENABLED`, `SENDGRID_API_KEY`, `FACEBOOK_ACCESS_TOKEN`, `TIKTOK_ACCESS_TOKEN`) and client-side/`NEXT_PUBLIC_*` (`NEXT_PUBLIC_FACEBOOK_PIXEL_ID`, `NEXT_PUBLIC_TIKTOK_PIXEL_ID`, `NEXT_PUBLIC_KLAVIYO_COMPANY_ID`, `NEXT_PUBLIC_ENABLE_PIXEL_TESTING`, `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_ENABLE_GTM_TESTING`, `NEXT_PUBLIC_HOTJAR_ID`). The two `_ENABLE_*_TESTING` flags matter even though `.env.local` sets them `true` for manual local pixel/GTM testing: `src/app/layout.tsx` reads them to force-enable Klaviyo/ConversionPixels and GoogleTagManager in dev, and without blanking them every spec's browser fires real third-party network calls (Klaviyo XHRs, real GA hits via a real GTM container). `assertE2eSafety()` refuses to run when the e2e URI is unset, equals the main URI, or its db name lacks `e2e` — the suite WIPES that database. Also refuses non-`sk_test_` Stripe keys. |
| Wipe-and-seed | `e2e/seed/` (`index.ts`, `users.ts`, `draw.ts`) | `wipeAndSeed()` re-runs the safety guard, drops the e2e DB, seeds: member (`e2e.member@e2e.local`, bcrypt cost-12, active display-only Tradie subscription with FAKE Stripe ids), admin, one active MajorDraw. CLI: `npx tsx e2e/seed/index.ts`. **Gotcha:** the seeded admin needs `userType: "admin"`, not just `role: "admin"` — the middleware and server layout accept the legacy role-only bridge, but the client-side `usePermissions.isStaff` gate on the `/admin` root page (`src/hooks/usePermissions.ts:26`) checks `userType` only and bounces legacy-only admins back to `/`. |
| DB assertion helpers | `e2e/helpers/db.ts` | Direct Mongo reads for spec assertions: `entriesForUser`, `benefitsGrantedCount` (`BenefitsGranted-invoice_<id>` / `BenefitsGranted-<paymentIntentId>` — the `pi_` prefix comes from Stripe's own id), `createLoginableUser` (register API creates passwordless users, so login-capable users are created directly). |
| Marketing/membership `@smoke` specs | `e2e/specs/marketing/landing.spec.ts`, `mini-draws.spec.ts`, `legal-copy.spec.ts`; `e2e/specs/membership/modal.spec.ts` | Landing hero + membership CTA render, `/mini-draws` renders, `/membership` shows the three tier CTAs + free-entry copy, and a CLAUDE.md §11 legal-copy guard (bans gambling/sold-entry vocabulary, asserts free-entry framing) across `/`, `/membership`, `/mini-draws`. |
| Purchase (money-path) helper + specs | `e2e/helpers/payment.ts`; `e2e/specs/membership/{purchase-subscription,purchase-one-time,purchase-decline,purchase-idempotency,webhook-replay}.spec.ts` | Real Stripe TEST-MODE payments through the real UI + real webhook delivery, DB-level exactly-once assertions. See the `@purchase` section below. |

**Resolved gotcha — `NEXT_PUBLIC_API_URL` now follows the e2e origin.** `.env.local` sets `NEXT_PUBLIC_API_URL=http://localhost:3000` for normal local dev. Until this fix, `resolveE2eEnv()`'s overlay remapped `NEXTAUTH_URL` to the dynamic e2e port but left `NEXT_PUBLIC_API_URL` unmapped, so `src/lib/queries.ts`'s `apiGet`/`apiRequest` (used by `useWinnersQueries.ts`, `useMajorDrawQueries.ts`, and other client hooks) built absolute URLs against the wrong port — every page rendering a winners/major-draw widget (`/`, `/membership`, `/mini-draws` via `MembershipSection`/`LatestWinnerHero`/`WinnerTestimoniesClient`) fired client XHRs at an unreachable `http://localhost:3000/...`. This surfaced as the QA watchdog catching real `net::ERR_CONNECTION_REFUSED` console errors on every run of `legal-copy.spec.ts` — confirmed via trace network logs to be **not** a legal-copy violation (zero `BANNED_COPY` hits in any run). Fixed by remapping `NEXT_PUBLIC_API_URL` alongside `NEXTAUTH_URL` in the overlay (see row above); regression-covered by `resolveE2eEnv builds the overlay` in `e2e/lib/__tests__/env.test.ts`.

**Resolved gotcha — real GTM/GA fired during e2e runs.** `.env.local` sets `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_GA_ID`, and `NEXT_PUBLIC_ENABLE_GTM_TESTING=true` for manual local GTM testing; the overlay didn't blank any of them, so `src/app/layout.tsx:141-144` mounted `GoogleTagManager` with a real container id in every e2e run — real GA hits (analytics pollution, same class of leak as the pre-existing Klaviyo one) plus sandboxed GTM tag iframes producing `console.error: Blocked script execution in 'about:blank' because the document's frame is sandboxed...`, which the QA watchdog correctly caught on `legal-copy.spec.ts`'s `/membership` case. `GoogleTagManager` itself no-ops without a `gtmId` (`src/components/GoogleTagManager.tsx:38`: `if (disabled || !gtmId) return null`), so blanking `NEXT_PUBLIC_GTM_ID` is the load-bearing fix; `NEXT_PUBLIC_ENABLE_GTM_TESTING` and `NEXT_PUBLIC_GA_ID` are blanked too as belt-and-suspenders (mirrors the Klaviyo pair). Also blanked `NEXT_PUBLIC_HOTJAR_ID` as registry hygiene — no component in `src/` currently reads it directly; the only Hotjar surface found is a dead GTM custom-HTML tag already neutralized via the `'gtm.blocklist':['html']` push in `src/utils/security/inline-snippets.ts:48-56`, moot once GTM itself is blanked. Deliberately **not** blanked: `NEXT_PUBLIC_HCAPTCHA_SITEKEY` (functional dependency for registration flows) and `NEXT_PUBLIC_PIXEL_ALLOWED_HOSTNAMES` (the hostname gate itself, already non-prod-restrictive) — see the note below.

**Resolved gotcha — Contentsquare has no env gate; blocked at the browser edge instead.** Unlike Klaviyo/GTM/GA/Hotjar, Contentsquare's `<Script>` in `src/app/layout.tsx:132-136` is hardcoded — a fixed `src="https://t.contentsquare.net/uxa/80b94ffdd640f.js"` with `strategy="lazyOnload"` and no `disabled`/env-conditional prop — so the env overlay has no variable to blank and cannot neuter it. `strategy="lazyOnload"` means it fires after the page's `load` event on every route, independent of which page a spec visits, and its session-recording iframe intermittently produced `console.error: Blocked script execution in 'about:blank' because the document's frame is sandboxed...`, which the QA watchdog caught unpredictably across different specs (not just `/membership`). Fixed at the only layer available at e2e scope: `e2e/fixtures/test.ts`'s `watchdog` fixture generalized its Klaviyo `context.route()` interception into a shared third-party blocklist, `/klaviyo\.com|contentsquare\.net|hotjar\.(com|io)/`, fulfilled empty-but-successful. **Residual, accepted:** `e2e:env` manual/MCP sessions and the `setup` project (`e2e/setup/auth.setup.ts`) both bypass `fixtures/test.ts` entirely, so Contentsquare still loads unblocked there. Accepted because Contentsquare receives session-replay/heatmap noise, not identity-keyed conversion data — unlike the Klaviyo leak (a real profile/company id) or the GTM leak (real GA hits), a stray Contentsquare session recording of a local e2e browser carries no PII or business-metric pollution risk severe enough to block on. The complete fix (an env-conditional `disabled` gate on this `<Script>`, matching the pattern `GoogleTagManager`/`KlaviyoScriptLoader` already use) requires a `src/**` change and has been escalated to the user separately rather than applied here.

## Env vars (per-folder, allowlisted in check-env — NOT declared in .env.example)

- `E2E_MONGODB_URI` — dedicated e2e database; name must contain `e2e`; wiped every run.
- `E2E_PORT` — port the orchestrator boots the app on (default 3799).
- `E2E_TEST_USER_EMAIL` / `E2E_TEST_USER_PASSWORD` — seeded member credentials (fallbacks exist).

Note: the overlay also remaps origin-bearing vars from `.env.local` to the e2e origin —
`NEXTAUTH_URL` and `NEXT_PUBLIC_API_URL` (client-side `apiGet` base; left unmapped it points
at the dev port and every winners/major-draw fetch dies with `ERR_CONNECTION_REFUSED`).

Deliberately NOT neutered by the overlay: `NEXT_PUBLIC_HCAPTCHA_SITEKEY` (functional
dependency — registration flows may mount hCaptcha; blanking it would break them) and
`NEXT_PUBLIC_PIXEL_ALLOWED_HOSTNAMES` (the hostname gate itself, already restrictive for
non-production origins). Every other client-side tracking id in `.env.local` is blanked —
see the env-overlay row above for the current list.

## Coming in later plan tasks

Orchestrator, fixtures, `@smoke`/`@demo`, `@a11y`, `@visual`, and `@purchase` spec suites
now exist (Tasks 4-11). Still to come: proof mode (narrated mp4s) and the full doc set
(architecture, adding-a-spec, proof-mode, troubleshooting) promised in Task 13.

## Orchestrator note — win32 arg quoting

`e2e/run.ts` spawns playwright/tsx with `shell: true` on Windows; passthrough args
containing whitespace (e.g. `--grep "lens self-tests"`) are quoted via a win32 helper
before the spawn, otherwise the shell splits them mid-phrase. Multi-word greps must go
through that path — do not hand-join args into a single string.

## `@a11y` baseline — `e2e/specs/quality/a11y.spec.ts`

`a11y.spec.ts` runs `AxeBuilder` (`wcag2a`/`wcag2aa`) + the `uiAudit` lens
(`e2e/fixtures/ui-audit.ts`) against `/`, `/login`, `/membership`, filtered to
serious/critical violations. Rather than asserting zero violations outright (which would
be red today — see `.superpowers/sdd/task-9-report.md` for the full first-capture detail:
rule ids, node targets, html, contrast ratios, helpUrls), the spec pins a
`KNOWN_VIOLATIONS` baseline keyed by page path (`ruleId` + `targetPattern` regex + a
one-line `bug` description). Every serious/critical violation node is checked against the
baseline for its page; matched nodes are surfaced as `known-a11y-bug` test annotations
(visible in the HTML/JSON report) instead of failing, so the real defect stays tracked and
visible without blocking the suite. Any node that does NOT match an existing baseline
entry fails the test as a genuine regression.

**Burn-down rule:** this baseline is a list of real, currently-unfixed product bugs, not a
suppression list. Remove an entry once the underlying `src/` fix lands (the suite goes
stricter automatically). Never add a new entry to silence a fresh failure the suite
surfaces — a new violation must be triaged and either fixed or explicitly signed off by
the controller/user before it's added to `KNOWN_VIOLATIONS`.

Baseline `targetPattern` discipline: stable-DOM entries match the full axe target selector
(regex-escaped); only the rotating promo-banner entries may use a broader anchored pattern,
each carrying a `DOCUMENTED EXCEPTION` comment. Loose utility-class fragments are not
acceptable patterns — they can silently absorb future distinct violations.

## `@purchase` suite — the money path

`e2e/helpers/payment.ts` + `e2e/specs/membership/{purchase-subscription,purchase-one-time,
purchase-decline,purchase-idempotency,webhook-replay}.spec.ts`. Real Stripe TEST-MODE
payments through the real UI (`4242…` / `4000…0002` cards), webhook delivery via the
orchestrator's `stripe listen` forwarder, DATABASE-level exactly-once assertions — never UI
toasts — for the grant. Full task narrative: `.superpowers/sdd/task-11-report.md`.

**Flow (all 5 specs mirror this):** `/membership` → "Choose Tradie" (or the "Not
subscribing?" drawer's "Apprentice Pack" card for the one-time spec) → guest registration
(step 1) → the modal jumps straight to billing (no "Continue to Billing" interstitial,
per Task 7) → the unauthenticated submit button is exactly `"PURCHASE"` → fill the Stripe
`PaymentElement` iframe (`fillPaymentElement`) → click → poll the DB (`waitForActiveMembership`
/ `waitForOneTimeEntries`) rather than the UI, since webhook grant processing is in-process
`after()`, not synchronous.

**`paymentevents` `_id` shape (verified live, both branches):**
- Membership (subscription), granted on `invoice.payment_succeeded`:
  `BenefitsGranted-invoice_<stripe invoice id>` — e.g. `BenefitsGranted-invoice_in_1AbC…`.
- One-time, granted on `payment_intent.succeeded`:
  `BenefitsGranted-<stripe payment intent id>` — e.g. `BenefitsGranted-pi_1AbC…`.

`payment.ts`'s `findBenefitsGrantedRef(userId, packageType)` locates the caller's own doc
(scans `{eventType:"BenefitsGranted", packageType}` and filters by `String(userId)` client-side
— mirrors `entriesForUser`'s pattern rather than relying on ObjectId-cast query filters) and
returns `{kind, id}` ready for `benefitsGrantedCount` (`e2e/helpers/db.ts`).

**Gotchas found only by running against the live app:**
- **Shared hardcoded phone number collides across specs.** All 5 specs register a new guest
  user; a single hardcoded `"0412345678"` (matching the brief's literal example) 400s the
  moment two specs run against the same database — the `User` model unique-indexes `mobile`.
  Fixed with `uniqueMobile(email)` (`payment.ts`) — a deterministic hash of the same per-test
  `email` string every spec already builds, seeded through `/^(\+61|61|0)?[4-5]\d{8}$/`.
- **Decline copy renders INSIDE the Stripe iframe, not as our app's toast.** Verified via
  screenshot: "Your card was declined." is Stripe PaymentElement's own inline field-level
  error, directly under the Card number field — `page.getByText()` (main frame only) never
  finds it; `purchase-decline.spec.ts` asserts through the same `frameLocator`
  `fillPaymentElement` uses. That decline also legitimately triggers browser-level noise
  (`console.error("Stripe PaymentIntent error:", …)` from `CardFormSection.tsx`, and Chrome
  auto-logging Stripe's own HTTP 402 for the decline) — `purchase-decline.spec.ts` shadows
  the base `watchdog` fixture (Playwright's documented fixture-override pattern; base
  `fixtures/test.ts` untouched) with the same pageerror/response checks plus a narrow,
  evidenced allowlist for that specific noise.
- **`stripewebhookqueue` is singular, and its type field is `type` not `eventType`.**
  `src/models/StripeWebhookQueue.ts`: collection `"stripewebhookqueue"`, fields `eventId`
  (Stripe `evt_…` id) + `type` (Stripe event type) + `payload` (the full Stripe event, so
  `payload.data.object.id` is the invoice id). An earlier draft assumed
  `"stripewebhookqueues"` / `eventType` and would have silently matched nothing.
- **A Stripe resend carries a FRESH `event.id`.**
  `src/services/stripe-webhook-queue/processQueuedEvent.ts`'s own comment: "Stripe dashboard
  *resends* carry a fresh event.id and bypass enqueue idempotency." So neither the queue's
  `eventId`-unique index nor `ProcessedStripeEvent` (both keyed by the wrapping Stripe event
  id) block a resend from re-entering `handleInvoicePaymentSucceeded` — the guard actually
  exercised by `webhook-replay.spec.ts` is Layer 4: the `paymentevents` unique `_id`, keyed
  by the INVOICE (not the event), created FIRST via the unique-constraint race-guard
  in `handleInvoicePaymentSucceeded`.
- **Queue-row status races the DB-visible grant.** `markSucceeded` (in
  `processQueuedEvent.ts`) writes AFTER the benefit-granting dispatch returns, so a
  `status:"succeeded"` filter immediately after `waitForActiveMembership` resolves can
  intermittently find nothing — `webhook-replay.spec.ts` polls the queue row (any status)
  for a short budget instead of a single strict-status `findOne`.
- **A full 3-project concurrent run exceeds this dev environment's capacity.** Each project
  alone (chromium-desktop / mobile-chrome / mobile-safari) is 100% reliable — verified
  green individually, repeatedly. Running all 3 simultaneously (`npm run e2e:purchase` with
  no `--project` filter) drives 8 Playwright workers × real Stripe money-path flows against
  ONE `next dev` process; server logs show `MongoDB connected ... maxPoolSize=10`, and under
  full load some runs saw `page.goto` itself fail with `net::ERR_ABORTED` (the dev server
  refusing connections) even with generous (180-400s) per-test timeouts. This is an
  infra-capacity limitation — not a spec defect — and is out of this domain's file scope to
  fix (would mean raising `maxPoolSize` in `src/lib/mongodb.ts`, or capping worker
  concurrency for `@purchase` runs in `playwright.config.ts` / `e2e/run.ts`). Full evidence
  in `.superpowers/sdd/task-11-report.md`.
