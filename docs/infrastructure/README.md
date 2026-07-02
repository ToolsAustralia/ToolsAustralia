# Infrastructure domain

Cross-cutting infra: health checks, cron, upload, Cloudinary, environment, Zod helpers, date utilities, validation, webhooks, operational scripts. Also owns repo-wide config files like `package.json`, `vercel.json`, and `.gitignore`.

> `.gitignore` ignores `/claudeDesign` — the local-only Claude Design handoff reference (design HTML/JS prototypes), which is not part of the codebase.

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

Connectivity probe: `npm run test:igodirect-sso` (see [dev-tooling/testing.md](../dev-tooling/testing.md)).

Rewards SSO test scripts (in `package.json`): `test:igodirect-sso` (connectivity probe), `test:member-level` (the partner-catalog tier resolver) and `test:sso-access` (the SSO access gate) — see [partner/gotchas.md](../partner/gotchas.md).
