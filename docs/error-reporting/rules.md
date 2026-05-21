# Error Reporting — Rules

## R1. Don't invent a parallel logger

Per CLAUDE.md, this domain is the canonical error system. Don't add Sentry, Datadog, etc. unless the team agrees. Don't write a parallel `console`-based file logger.

## R2. `console.error` for genuine errors

Per CLAUDE.md, production builds strip `console.{log,info,debug,warn}` (`next.config.ts` `compiler.removeConsole`). Use `console.error` only for things that must survive. Anything else → `ErrorReport`.

## R3. Sanitise before report

When capturing payment / auth-related errors, redact:
- Card data (already not stored, but error messages can leak it)
- Auth tokens / session secrets
- PII (email is OK; password / answer to security question is not)

## R4. Don't break user flow on capture failure

If posting an `ErrorReport` fails, don't error-cascade. Best-effort logging — the original error is more important than the report.

## R5. Use error classes with codes

Domain errors should extend `AppError` and carry a typed `code` field (cf. [subscription P6](../subscription/patterns.md#p6-errors-as-classes-with-codes-not-strings)). Route handlers map codes to HTTP status.
