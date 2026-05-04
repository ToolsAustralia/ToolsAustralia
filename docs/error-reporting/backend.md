# Error Reporting — Backend

## Service

[src/services/error-reporting/](../../src/services/error-reporting/) — capture, classify, write `ErrorReport` rows.

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
