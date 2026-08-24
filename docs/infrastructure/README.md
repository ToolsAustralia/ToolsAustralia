# Infrastructure domain

Cross-cutting infra: health checks, cron, upload, Cloudinary, environment, Zod helpers, date utilities, validation, webhooks, operational scripts. Also owns repo-wide config files like `package.json`, `vercel.json`, and `.gitignore`.

> `.gitignore` ignores `/claudeDesign` — the local-only Claude Design handoff reference (design HTML/JS prototypes), which is not part of the codebase. `eslint.config.mjs` also ignores `claudeDesign/**` (the folder is still on disk, so ESLint would otherwise lint the concept JS and fail `npm run lint` with ~100 errors).

> `.env.example` — `NEXT_PUBLIC_PARTNER_DISCOUNT_SSO_ENABLED` is the client twin of the server-only `PARTNER_DISCOUNT_SSO_ENABLED` (which gates the SSO route). Client-rendered portal buttons can only read `NEXT_PUBLIC_*`, so set both to the same value. Read via `partnerDiscountSsoEnabled()` in `src/config/featureFlags.ts`.

> `.env.example` — `NEXT_PUBLIC_DASHBOARD_STREAK_PREVIEW` is **local-dev only**: lights the Membership Streak dashboard surfaces while git ships their flags dark (`src/config/dashboardFeatures.ts` reads it via `STREAK_PREVIEW`). Never set in Vercel — production launches by flipping the committed flags (streak launch runbook step 4).

> `.env.example` — `NEXT_PUBLIC_CONTENTSQUARE_ID` (added 2026-07-22) is the **inverse** of the streak flag above: production-only, blank everywhere else. It replaces a tag id previously hardcoded into `src/app/layout.tsx`'s Contentsquare `<Script>` (no env gate — loaded for every visitor in every environment); blank now renders nothing (mirrors `GoogleTagManager`'s `!gtmId` no-op). See [docs/tracking/rules.md R8](../tracking/rules.md).

> `.env.example` — `STRIPE_RATE_LIMIT_GLOBAL_PER_SECOND` (default `80`) and
> `STRIPE_RATE_LIMIT_ENDPOINT_PER_SECOND` (default `20`), added 2026-08-24, tune the client-side
> token bucket in front of the Stripe singleton (`src/lib/stripe-rate-limiter.ts`). Both are
> **optional tuning knobs whose defaults live in code**, so the declared values in `.env.example`
> only restate them — leaving them unset in Vercel changes nothing. Defaults are 80% of Stripe's
> published caps (100/sec global live, 25/sec sandbox global, 25/sec per endpoint); the sandbox
> global default drops to `20` automatically when `STRIPE_SECRET_KEY` is a `_test_` key. `0`
> disables that bucket. **The limiter is per-lambda-instance, so N concurrent invocations multiply
> the aggregate rate** — see [billing-stripe/architecture.md](../billing-stripe/architecture.md#-per-instance-not-global).

## Index

- [architecture.md](./architecture.md) — what lives here vs other domains
- [frontend.md](./frontend.md) — _Mostly N/A_
- [backend.md](./backend.md) — file-by-file inventory
- [api.md](./api.md) — `/api/health/`, `/api/cron/`, `/api/upload/`, `/api/images/`
- [rules.md](./rules.md) — env handling, Zod at boundary, dry-run scripts
- [patterns.md](./patterns.md) — env config, validation conventions
- [gotchas.md](./gotchas.md) — Cloudinary signing, cron auth
- [models.md](./models.md) — _N/A_
- [testing.md](./testing.md) — _TODO_

## Migrated from

- `src/docs/ENVIRONMENT_SETUP.md`
- Operational script docs scattered across root

## Third-party env — iGoDirect / MyRewards SSO (added 2026-06-22)

See [.env.example](../../.env.example):
- `IGODIRECT_SSO_SECRET` — **secret**; signs the MyRewards SSO JWT. `.env.local` / Vercel only — never commit a real value.
- `IGODIRECT_CLIENT_ID` (`2412`), `IGODIRECT_DOMAIN_CODE` (`ToolsAustralia`), `IGODIRECT_DOMAIN_URL` (`myrewards.toolsaustralia.com.au`) — non-secret tenant identifiers.
- `PARTNER_DISCOUNT_SSO_ENABLED` — **go-live gate**. `POST /api/partner-discount/sso` is inert in prod (404) unless this is exactly `"true"`. Keep UNSET in prod until rewards SSO is cleared to launch (vendor deprovisioning + `member_level` + member-deletion/DPA answers). See [auth/igodirect-sso-implementation-plan.md](../auth/igodirect-sso-implementation-plan.md) "Go-live gate".
- `IGODIRECT_MEMBER_STATUS_KEY` (added 2026-07-16) — **secret**; the bearer key iGoDirect presents on `GET /api/partner-discount/member-status`. We mint it (≥32 random bytes) and hand it to the vendor over a secure channel. `.env.local` / Vercel only. Unset ⇒ the route fails closed (500).
- `IGODIRECT_MEMBER_STATUS_ENABLED` (added 2026-07-16) — **go-live gate** for the member-status read: 503 `{"error":"disabled"}` in prod unless exactly `"true"`; always on in local dev. See [partner/igodirect-member-status-api-plan.md](../partner/igodirect-member-status-api-plan.md) §6.

Connectivity probe: `npm run test:igodirect-sso` (see [dev-tooling/testing.md](../dev-tooling/testing.md)).

Rewards SSO test scripts (in `package.json`): `test:igodirect-sso` (connectivity probe), `test:member-level` (the partner-catalog tier resolver), `test:sso-access` (the SSO access gate) and `test:member-status` (the iGoDirect member-status API helpers + reconcile decision, added 2026-07-16) — see [partner/gotchas.md](../partner/gotchas.md).

## Membership Streak backfill (added 2026-07-07)

`scripts/backfill-membership-streaks.ts` — reconstructs `subscription.streakMonths` + `streakGeneration` for every member from the `MembershipRenewalCycle` ledger (cross-checked against `MembershipStatusHistory` cancels). **Dry-run by default** (`backfill:membership-streaks:dry`); `backfill:membership-streaks` runs `--live` in **repair mode**. The veterans' round-up (history-incomplete + active + no breaks → whole months since join) is gated behind `--roundup-incomplete` and is **launch-only** — repeated repair runs with it would credit pure calendar months (`now` advances each run). Re-runnable — it is also the drift-repair tool for the webhook streak counter. Append-mode CSV audit, adaptive progress lines, 3-tier exit codes (0 clean / 1 anomalies / 2 fatal). Pure walker logic lives in `src/utils/subscription/streak.ts` (`npm run test:streak`). See [subscription/backend.md](../subscription/backend.md).

## Membership Streak reward-ladder seed (added 2026-07-07, P2)

`scripts/seed-streak-milestone-rewards.ts` (`seed:streak-rewards[:dry]`) — three safe-ordered stages: (1) drops the legacy `MilestoneIssuance` unique index, **stamps `streakGeneration: 1` onto every legacy issuance row** (missing fields are invisible to the generation-scoped dedupe query + unique index — without the stamp every pre-launch issuance would re-issue/double-grant), and syncs the generation-scoped index; (2) upserts the 6 streak rungs (`STREAK-2R…12R`, ALL `isRecurring` with `recurrencePeriod: 12`, autoGrant, **`isActive:false`** — dark); (3) inserts `backfilled` marker issuances for every rung a member passed pre-launch (recognition, zero entries — prevents retroactive mass-grants on activation). `--activate` flips the rungs live (**launch runbook only**, after the launch backfill ran `--live --roundup-incomplete`; the final runbook step flips `DASHBOARD_FEATURES.loyaltyStreak`/`milestoneProgress` on). Dry-run default, CSV audit (`seed-*.csv` — gitignored alongside `backfill-*.csv`; audit CSVs are never committed), progress lines. See [rewards-redeemables/gotchas.md](../rewards-redeemables/gotchas.md).

## TikTok ad-insights nightly cron + Meta spend-sync auth fix (added 2026-07-16)

- **New cron** `/api/cron/sync-tiktok-ads` (`45 2 * * *`, `maxDuration: 300s`) — nightly re-sync of a trailing 8-day window of TikTok ad-level insights into `TikTokAdInsightsDaily` (delegates to `TikTokInsightsSyncService`; the TikTok analogue of `sync-meta-ads`). Gated on `Authorization: Bearer ${CRON_SECRET}` like the other crons; no-ops when the TikTok Marketing-API env (`TIKTOK_ADVERTISER_ID` / `TIKTOK_MARKETING_ACCESS_TOKEN`, already registered in `.env.example`) is unset. Since 2026-07-24 every run also upserts the `TikTokSyncRun` status doc (truthful admin sync-health, panel F-002); history beyond the 8-day window is backfilled once via `npm run seed:tiktok-insights` (`scripts/seed-tiktok-insights.ts`, panel F-004). See [architecture.md](./architecture.md#vercel-cron-schedules) and [api.md](./api.md).
- **Security fix** — `/api/cron/sync-meta-spend-by-url` was previously **unauthenticated** (heavy paginated Meta API + Mongo sync, triggerable by anyone); it now enforces the same `CRON_SECRET` Bearer gate as the other crons. See [gotchas.md § Cron auth bypass](./gotchas.md).

## AI support chatbot infra (added 2026-06-24)

Foundations for the `support-chat` domain (see [docs/ai-chatbot/](../ai-chatbot/)). This is a **FAQ-only** bot — member account tools and Bedrock were removed per owner decision (2026-06-24).

- **Deps:** `ai` (Vercel AI SDK core), `@ai-sdk/anthropic`, `@ai-sdk/react`, `react-markdown` (renders markdown links in Cobber assistant messages and /faq answers — see `src/components/support-chat/ChatMarkdown.tsx`).
- **`vercel.json`:** `"src/app/api/chat/route.ts": { "maxDuration": 60 }` is listed **before** the `src/app/api/**/route.ts` 10s catch-all so streaming chat responses aren't truncated at 10s.
- **Env** (see [.env.example](../../.env.example)):
  - `ANTHROPIC_API_KEY` — first-party API key; set a low monthly **spend limit** in the Anthropic Console as the provider hard cap.
  - `CHAT_MODEL_PRIMARY`/`CHAT_MODEL_ESCALATION` — model IDs (defaults: `claude-haiku-4-5` / `claude-sonnet-4-6`).
  - `CHAT_DAILY_TOKEN_BUDGET_USD` — app-level daily cost ceiling (USD), fail-closed.
  - `CHAT_KILL_SWITCH` — set to `"true"` to disable the generative bot instantly (FAQ deflection still works).
  - `HCAPTCHA_SECRET` — server secret for `POST https://api.hcaptcha.com/siteverify` (guest generative gate). **Fail-closed if unset**: anonymous guests cannot use the generative bot. Get from https://dashboard.hcaptcha.com/.
  - `NEXT_PUBLIC_HCAPTCHA_SITEKEY` — public sitekey for the client-side hCaptcha widget. Non-secret; safe to expose to the browser.
  - `CHAT_GENERATIVE_LIMIT_MAX` — integer; per-user cap on LLM-backed answers (default `5`). FAQ deflection answers are **never** counted. Limiter fails open; daily budget is the cost backstop.
  - `CHAT_GENERATIVE_LIMIT_WINDOW_SECONDS` — integer (seconds); sliding window for the per-user LLM cap (default `300` = 5 minutes).
- **Deps (Task 1.9 addition):** `@hcaptcha/react-hcaptcha` — React wrapper for the hCaptcha challenge widget, rendered in `SupportChatWidget` for anonymous guests on the generative path. Dynamic-imported (`ssr: false`) so it never runs server-side.
- **Deps (Task 1.10 addition):** `@anthropic-ai/sdk` (devDependency only — used by `eval-chat-goldenset.ts` for the Batch API grader; never bundled into the app). The Vercel AI SDK (`@ai-sdk/anthropic`) does not expose the Batch API surface, so the raw SDK is used for offline eval only.
- **Deps (Gemini provider addition):** `@ai-sdk/google` (`^3` — pinned to the same generation as `@ai-sdk/anthropic@3` / the `ai@6` core's `@ai-sdk/provider@3`; **NOT v4**, whose `@ai-sdk/provider@4` model spec the core can't drive — see [ai-chatbot/gotchas.md](../ai-chatbot/gotchas.md)). Vercel AI SDK adapter for Google Gemini. Reads `GOOGLE_GENERATIVE_AI_API_KEY` from env automatically. Used in `provider.ts` alongside `@ai-sdk/anthropic`.
- **Env (Gemini — added 2026-06-26):**
  - `GOOGLE_GENERATIVE_AI_API_KEY` — required when activeProvider is `"google"` **OR** when `CHAT_ALLOW_GUEST_GENERATIVE=true` (guests always use Gemini). Read automatically by `@ai-sdk/google`. Set a spend limit in Google AI Studio.
  - `CHAT_ALLOW_GUEST_GENERATIVE` (added 2026-07-07) — `"true"` opens generative access to anonymous guests **without hCaptcha** (routed to Gemini via `resolveActorProvider`, guarded by the per-IP generative rate limit + the daily budget). Default off → guests are FAQ-only (fail-closed). See [ai-chatbot/gotchas.md § Guest generative access](../ai-chatbot/gotchas.md).
  - `CHAT_GOOGLE_MODEL_PRIMARY` — Gemini model for the primary tier (default `gemini-2.5-flash-lite`).
  - `CHAT_GOOGLE_MODEL_ESCALATION` — Gemini model for the escalation tier (default `gemini-2.5-flash`).
  - Active provider is DB-backed (`ChatSettings` collection, singleton doc) and switchable at runtime via `PATCH /api/admin/chatbot-settings`. Defaults to `"anthropic"` if unset or on any read error (fail-safe).
- **npm scripts:** `build:chat-knowledge-pack` (regenerates `src/generated/chatKnowledgePack.ts` from canonical data — chained into `prebuild`/`predev`); tests `test:chat-faqs`, `test:chat-models`, `test:chat-cost-guard`, `test:chat-provider`, `test:chat-settings` (getActiveChatProvider + setActiveChatProvider — 7 assertions; deps-injected, no Mongo), `test:chat-promo` (getCurrentPromoBlurb formatter — no-promo→null, uniform/mixed multiplier blurbs, fail-safe on throw; deps-injected, no Mongo), `test:chat-knowledge`, `test:chat-deflection` (no-LLM deflection layer — offline, no API key required; **incl. `testRegressionRoutes`: 19 routes locking the 2026-06-27 answer-quality fix — account-aware, did-I-win, join, escalation — against the previous 45% mis-route rate), `test:chat-routing` (routing golden-set regression lock — asserts 0 mis-routes and ≥ 45 correct deflections on all 96 cases in `routingGoldenSet.ts`; offline, no API key; **this is the gate that locks the calibrated thresholds**), `test:chat-routing-shape` (dataset guard — validates all 96 golden-set cases have legal `faqId` references and correct field types; run before editing `routingGoldenSet.ts`), `test:chat-escalation` (stubbed escalation + system-prompt assertions — no Mongo/SendGrid required), `test:chat-withchatbot` (withChatbot pipeline + redactPII — stubbed, no Mongo/NextAuth required), `test:chat-service` (ChatService orchestration — deflect/budget/LLM via injected stubs, no Mongo/Anthropic required), `test:chat-guest-gate` (hCaptcha gate + verifyHcaptcha unit — all stubbed, no network/Mongo/Anthropic required), `test:chat-storage` (clearSupportChatStorage() — removes chat keys, preserves device-pref keys, idempotent, fault-tolerant; in-memory stub, no jsdom), `test:chat-delete-history` (deleteMemberChatHistory service — 23 assertions; deps-injected, no Mongo; verifies: no-conversation user does nothing destructive; correct delete order messages-before-conversations; correct counts returned; filter scoped to userId, never wildcard; parallel calls for different users isolated; return shape correct); `test:chat-admin-usage` (pure `summarizeAuditRows` helper — 7 assertions; no Mongo/Anthropic; verifies empty rows → all zeros + no divide-by-zero, deflection rate 1 dp rounding, escalation count, member/anonymous split, avgDurationMs ignoring null/0); `smoke:chat-provider` (one live Anthropic call — manual connectivity check, not CI), `smoke:chat-service` (end-to-end ChatService check — one live Anthropic call + a real dev-DB conversation write + budget increment; manual, not CI); `eval:chat` (offline answer-quality eval — 27 golden-set questions graded by `claude-opus-4-8` via Anthropic Batch API; supports `--limit N` / `EVAL_LIMIT=N` for cheap subset runs; exit 0 ≥80% pass rate, exit 1 regression, exit 2 setup error; < $0.01 per full run); `calibrate:chat-deflection` (offline calibration sweep — grid-searches `minConfidence × minMargin` over `routingGoldenSet.ts` to find the Pareto-optimal thresholds; no API key, no Mongo, ~$0; re-run whenever the FAQ corpus or scorer changes, then update `DEFAULT_MIN_CONFIDENCE`/`DEFAULT_MIN_MARGIN` in `faqSearch.ts` and `MIN_CORRECT_DEFLECT` in `routing.test.ts`).

## 2026-07-31 — `test:partner-consent` script added

`package.json` gained `"test:partner-consent": "tsx src/utils/partner-discounts/__tests__/partner-consent.test.ts"` — the anti-drift guard asserting the partner consent screen discloses exactly the fields the SSO payload carries. No new env vars were introduced by this change. See [docs/partner/testing.md](../partner/testing.md).

## `test:discount-catalogue` (2026-08-05)

New npm script → `src/utils/partner-discounts/__tests__/discount-catalogue.test.ts`, the pure
layer behind the public `/discount` page (bands, the wall, the gate copy, and the two unlock
routes at all 11 access levels). Standalone `tsx`, no runner. Detail:
[docs/partner/testing.md](../partner/testing.md).

## `vercel.json` — admin metrics routes raised to `maxDuration: 60` (2026-08-17)

`src/app/api/admin/metrics/users/route.ts` and `src/app/api/internal/norm/v1/metrics/users/route.ts` now have explicit entries. Previously both inherited the `src/app/api/**/route.ts` catch-all of **10s**, while `src/lib/mongodb.ts` is configured with a 10s server-selection timeout plus a 7s TLS retry ladder — i.e. **the function budget was smaller than its own connection-failure path**, so a connection problem could only ever surface as an opaque 504. See `docs/mongodb/gotchas.md`.

When adding an API route that does real database work, check its effective `maxDuration` against that ladder rather than assuming the catch-all is enough.

## New scripts (2026-08-17)

| Script | Purpose |
|---|---|
| `npm run verify:user-metrics` | **Read-only.** Times each query `UserMetricsService` runs, for the ranges the admin UI actually requests, with collection-size denominators and the live `PaymentEvent` index list. `-- --service` drives the real service through Mongoose (so the measurement includes `connectDB` + model init, which a raw-driver timing misses), asserts `purchaseHistory` parity between the new `$group` path and the legacy document loop, and validates the live output against the Norm `responseSchema` (a mismatch there is a runtime 500 `tsc` cannot catch). |
| `npm run migrate:payment-event-eventtype-index[:prod][:dry]` | Creates `{ eventType: 1, timestamp: -1 }` on `paymentevents`. Idempotent, `background: true`, dry-run by default. |
