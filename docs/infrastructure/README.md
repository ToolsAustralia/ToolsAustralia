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
- **Env** (see [.env.example](../../.env.example)): `ANTHROPIC_API_KEY` (Phase 1, first-party — set a low monthly **spend limit** in the Anthropic Console as the provider hard cap), `CHAT_MODEL_PRIMARY`/`CHAT_MODEL_ESCALATION`, `CHAT_DAILY_TOKEN_BUDGET_USD` (app-level daily cost ceiling, fail-closed), `CHAT_KILL_SWITCH`.
- **npm scripts:** `build:chat-knowledge-pack` (regenerates `src/generated/chatKnowledgePack.ts` from canonical data — chained into `prebuild`/`predev`); tests `test:chat-faqs`, `test:chat-models`, `test:chat-cost-guard`, `test:chat-provider`, `test:chat-knowledge`, `test:chat-deflection` (no-LLM deflection layer — offline, no API key required), `test:chat-escalation` (stubbed escalation + system-prompt assertions — no Mongo/SendGrid required), `test:chat-withchatbot` (withChatbot pipeline + redactPII — stubbed, no Mongo/NextAuth required); `smoke:chat-provider` (one live Anthropic call — manual connectivity check, not CI).
