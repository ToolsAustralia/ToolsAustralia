# Error Reporting domain

In-app error reporting and logging system. Centralised `ErrorReport` Mongo collection, admin dashboard, recovery flows.

## Index

- [architecture.md](./architecture.md) — capture, persist, surface
- [frontend.md](./frontend.md) — error components, hooks (`useErrorHandling`, `useErrorRecovery`)
- [backend.md](./backend.md) — `services/error-reporting`, `lib/errors`
- [api.md](./api.md) — `/api/error-reports/`, `/api/admin/error-reports/`
- [rules.md](./rules.md) — don't invent parallel logger, console.error vs ErrorReport
- [patterns.md](./patterns.md) — capture-classify-report, recovery flows
- [gotchas.md](./gotchas.md) — production console-stripping, log routing
- [models.md](./models.md) — ErrorReport
- [testing.md](./testing.md) — _TODO_

## Migrated from

- `docs/ERROR_REPORTING_AND_LOGGING.md` → architecture.md
- `docs/ERROR_REPORTING_SYSTEM.md` → architecture.md / backend.md

> _TODO: read both root files and merge._
