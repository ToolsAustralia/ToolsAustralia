# Error Reporting — Gotchas

## Production console-stripping

`next.config.ts` `compiler.removeConsole` strips `console.log/info/debug/warn` in production builds. `console.error` survives. Anything else MUST use `ErrorReport`.

If you debug-log with `console.log`, it works in dev but vanishes in production. Common confusion source.

## Migrated from `docs/ERROR_REPORTING_*.md` and `docs/PAYMENT_ERROR_HANDLING_AND_RECOVERY.md`

> _TODO: read all three root docs and merge._

## Recovery UI vs report

Recovery UI is shown to users; reports go to admins. Same error can drive both — make sure the report doesn't echo PII that the recovery UI also shows.

## Cascade prevention

If the error-reporting endpoint itself errors out, the catch must NOT re-call the reporting endpoint. Otherwise infinite loop. Use a counter / try-catch boundary at the report-call site.
