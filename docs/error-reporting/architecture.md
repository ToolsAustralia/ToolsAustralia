# Error Reporting — Architecture

## What & where

- **Model:** `ErrorReport` in [src/models/ErrorReport.ts](../../src/models/ErrorReport.ts)
- **Service:** [src/services/error-reporting/](../../src/services/error-reporting/) — capture, classify, write
- **Helpers:** [src/lib/errors/](../../src/lib/errors/) — error classes, classification utilities
- **API:** `/api/error-reports/` (write), `/api/admin/error-reports/` (admin read/manage)
- **Components:** [src/components/error/](../../src/components/error/) — fallbacks, error boundaries, recovery UIs
- **Hooks:** `useErrorHandling`, `useErrorRecovery`

## Capture path

```
Code throws → caught somewhere → ErrorReport service writes to Mongo
                                                  │
Admin dashboard reads → triage / mark as resolved
```

## Migrated from `docs/ERROR_REPORTING_*.md`

> _TODO: read both root files and merge full content. Brief: don't invent a parallel logger; use this system. The model + admin routes are real, not a wrapper._
