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
| Env overlay + safety guard | `e2e/lib/env.ts` (test: `npm run test:e2e-env`) | `resolveE2eEnv()` builds the env the app is booted with: `MONGODB_URI` → `E2E_MONGODB_URI`, dedicated `PORT`/`NEXTAUTH_URL`, third-party keys neutered — server-side (`KLAVIYO_ENABLED`, `SENDGRID_API_KEY`, `FACEBOOK_ACCESS_TOKEN`, `TIKTOK_ACCESS_TOKEN`) and client-side/`NEXT_PUBLIC_*` (`NEXT_PUBLIC_FACEBOOK_PIXEL_ID`, `NEXT_PUBLIC_TIKTOK_PIXEL_ID`, `NEXT_PUBLIC_KLAVIYO_COMPANY_ID`, `NEXT_PUBLIC_ENABLE_PIXEL_TESTING`). The last one matters even though `.env.local` sets it `true` for manual local pixel testing: `src/app/layout.tsx` reads it to force-enable Klaviyo/ConversionPixels in dev, and without blanking it every spec's browser fires real third-party network calls. `assertE2eSafety()` refuses to run when the e2e URI is unset, equals the main URI, or its db name lacks `e2e` — the suite WIPES that database. Also refuses non-`sk_test_` Stripe keys. |
| Wipe-and-seed | `e2e/seed/` (`index.ts`, `users.ts`, `draw.ts`) | `wipeAndSeed()` re-runs the safety guard, drops the e2e DB, seeds: member (`e2e.member@e2e.local`, bcrypt cost-12, active display-only Tradie subscription with FAKE Stripe ids), admin, one active MajorDraw. CLI: `npx tsx e2e/seed/index.ts`. **Gotcha:** the seeded admin needs `userType: "admin"`, not just `role: "admin"` — the middleware and server layout accept the legacy role-only bridge, but the client-side `usePermissions.isStaff` gate on the `/admin` root page (`src/hooks/usePermissions.ts:26`) checks `userType` only and bounces legacy-only admins back to `/`. |
| DB assertion helpers | `e2e/helpers/db.ts` | Direct Mongo reads for spec assertions: `entriesForUser`, `benefitsGrantedCount` (`BenefitsGranted-invoice_<id>` / `BenefitsGranted-<paymentIntentId>` — the `pi_` prefix comes from Stripe's own id), `createLoginableUser` (register API creates passwordless users, so login-capable users are created directly). |
| Marketing/membership `@smoke` specs | `e2e/specs/marketing/landing.spec.ts`, `mini-draws.spec.ts`, `legal-copy.spec.ts`; `e2e/specs/membership/modal.spec.ts` | Landing hero + membership CTA render, `/mini-draws` renders, `/membership` shows the three tier CTAs + free-entry copy, and a CLAUDE.md §11 legal-copy guard (bans gambling/sold-entry vocabulary, asserts free-entry framing) across `/`, `/membership`, `/mini-draws`. |

**Known gotcha — `NEXT_PUBLIC_API_URL` is not neutered by the env overlay.** `.env.local` sets `NEXT_PUBLIC_API_URL=http://localhost:3000` for normal local dev; `resolveE2eEnv()`'s overlay overrides `NEXTAUTH_URL` to the dynamic e2e port but does **not** currently override `NEXT_PUBLIC_API_URL` the same way. `src/lib/queries.ts`'s `apiGet`/`apiRequest` (used by `useWinnersQueries.ts`, `useMajorDrawQueries.ts`, and other client hooks) builds absolute URLs as `${NEXT_PUBLIC_API_URL}${endpoint}`, so any page rendering a winners/major-draw widget (present on `/`, `/membership`, `/mini-draws` via `MembershipSection`/`LatestWinnerHero`/`WinnerTestimoniesClient`) fires client XHRs at `http://localhost:3000/...` during an e2e run — unreachable, since the e2e server listens on `E2E_PORT` (3799 by default). This surfaced as the QA watchdog catching real `net::ERR_CONNECTION_REFUSED` console errors (WebKit: `Could not connect to server` / `pageerror: /localhost:3000/api/major-draw due to access control checks`) on every run of `legal-copy.spec.ts` — confirmed via trace network logs, **not** a legal-copy violation (zero `BANNED_COPY` hits in any run). Fix (not yet applied — out of scope for the task that found it): add `NEXT_PUBLIC_API_URL: baseUrl,` to the overlay object in `e2e/lib/env.ts`, mirroring the existing `NEXTAUTH_URL: baseUrl` line.

## Env vars (per-folder, allowlisted in check-env — NOT declared in .env.example)

- `E2E_MONGODB_URI` — dedicated e2e database; name must contain `e2e`; wiped every run.
- `E2E_PORT` — port the orchestrator boots the app on (default 3799).
- `E2E_TEST_USER_EMAIL` / `E2E_TEST_USER_PASSWORD` — seeded member credentials (fallbacks exist).

## Coming in later plan tasks

Orchestrator, fixtures, and an initial `@smoke`/`@demo` spec set (auth, marketing, membership)
now exist (Tasks 4-6). Still to come: `@purchase` / `@a11y` / `@visual` spec suites, proof
mode (narrated mp4s), and the full doc set (architecture, adding-a-spec, proof-mode,
troubleshooting) promised in Task 13.
