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
