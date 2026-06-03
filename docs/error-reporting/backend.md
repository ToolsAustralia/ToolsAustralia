# Error Reporting — Backend

## Service

[src/services/error-reporting/](../../src/services/error-reporting/):

- `ErrorLoggingService.ts` — capture, classify, write `ErrorReport` rows (called from the client `/api/error-reports/` route and server-side autologgers).
- `ErrorReportQueryService.ts` — read-side queries (`listErrorReports`, `getErrorReportById`) consumed by both `/api/admin/error-reports/*` and the Norm `/v1/error-reports/*` endpoints. Framework-agnostic: takes plain args, returns plain objects, no `Request` / `NextResponse` types — so the admin UI and the Norm projection share one implementation by construction.

## Helpers

[src/lib/errors/](../../src/lib/errors/) — error classes, classification utilities. Likely includes:
- `AppError` base class
- Domain-specific subclasses (e.g. `SubscriptionReferenceError` extends elsewhere)
- Classifier helpers

> _TODO: enumerate exact files._

## Utils

[src/utils/error-reporting/](../../src/utils/error-reporting/) — pure helpers (formatting, sanitisation).

## Routes

- `/api/error-reports/` — client-side error reporting endpoint
- `/api/admin/error-reports/` — admin triage / management

## Logging routing

- **Client errors** → POST to `/api/error-reports/`
- **Server errors** → write `ErrorReport` directly via the service
- **Severe / boot-time** → `console.error` (preserved by Next's `removeConsole` config; log/info/debug/warn are stripped)
