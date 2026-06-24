# Infrastructure domain

Cross-cutting infra: health checks, cron, upload, Cloudinary, environment, Zod helpers, date utilities, validation, webhooks, operational scripts. Also owns repo-wide config files like `package.json`, `vercel.json`, and `.gitignore`.

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

Connectivity probe: `npm run test:igodirect-sso` (see [dev-tooling/testing.md](../dev-tooling/testing.md)).

## AI support chatbot infra (added 2026-06-24)

Foundations for the `support-chat` domain (see [docs/ai-chatbot/](../ai-chatbot/)):

- **Deps:** `ai` (Vercel AI SDK core), `@ai-sdk/anthropic`, `@ai-sdk/react`. Phase 2 adds `@ai-sdk/amazon-bedrock` (onshore member-PII inference); Phase 3 may add an embeddings provider for Atlas Vector Search.
- **`vercel.json`:** `"src/app/api/chat/route.ts": { "maxDuration": 60 }` is listed **before** the `src/app/api/**/route.ts` 10s catch-all so streaming chat responses aren't truncated at 10s.
- **Env** (see [.env.example](../../.env.example)):
  - `ANTHROPIC_API_KEY` (Phase 1, first-party — set a low monthly **spend limit** in the Anthropic Console as the provider hard cap), `CHAT_MODEL_PRIMARY`/`CHAT_MODEL_ESCALATION`, `CHAT_DAILY_TOKEN_BUDGET_USD` (app-level daily cost ceiling, fail-closed), `CHAT_KILL_SWITCH`.
  - `HCAPTCHA_SECRET` — server secret for `POST https://api.hcaptcha.com/siteverify` (guest generative gate, Task 1.8). **Fail-closed if unset**: anonymous guests cannot use the generative bot (FAQ deflection + authenticated members still work). Get from https://dashboard.hcaptcha.com/.
  - `NEXT_PUBLIC_HCAPTCHA_SITEKEY` — public sitekey for the client-side hCaptcha widget (Task 1.9). Non-secret; safe to expose to the browser.
- **Deps (Task 1.9 addition):** `@hcaptcha/react-hcaptcha` — React wrapper for the hCaptcha challenge widget, rendered in `SupportChatWidget` for anonymous guests on the generative path. Dynamic-imported (`ssr: false`) so it never runs server-side.
- **Deps (Task 1.10 addition):** `@anthropic-ai/sdk` (devDependency only — used by `eval-chat-goldenset.ts` for the Batch API grader; never bundled into the app). The Vercel AI SDK (`@ai-sdk/anthropic`) does not expose the Batch API surface, so the raw SDK is used for offline eval only.
- **npm scripts:** `build:chat-knowledge-pack` (regenerates `src/generated/chatKnowledgePack.ts` from canonical data — chained into `prebuild`/`predev`); tests `test:chat-faqs`, `test:chat-models`, `test:chat-cost-guard`, `test:chat-provider`, `test:chat-knowledge`, `test:chat-deflection` (no-LLM deflection layer — offline, no API key required), `test:chat-escalation` (stubbed escalation + system-prompt assertions — no Mongo/SendGrid required), `test:chat-withchatbot` (withChatbot pipeline + redactPII — stubbed, no Mongo/NextAuth required), `test:chat-service` (ChatService orchestration — deflect/budget/LLM via injected stubs, no Mongo/Anthropic required), `test:chat-guest-gate` (hCaptcha gate + verifyHcaptcha unit — all stubbed, no network/Mongo/Anthropic required), `test:chat-storage` (clearSupportChatStorage() — removes chat keys, preserves device-pref keys, idempotent, fault-tolerant; in-memory stub, no jsdom); `smoke:chat-provider` (one live Anthropic call — manual connectivity check, not CI), `smoke:chat-service` (end-to-end ChatService check — one live Anthropic call + a real dev-DB conversation write + budget increment; manual, not CI); `eval:chat` (offline answer-quality eval — 27 golden-set questions graded by `claude-opus-4-8` via Anthropic Batch API; supports `--limit N` / `EVAL_LIMIT=N` for cheap subset runs; exit 0 ≥80% pass rate, exit 1 regression, exit 2 setup error; < $0.01 per full run).
