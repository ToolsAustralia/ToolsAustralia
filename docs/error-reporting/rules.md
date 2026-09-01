# Error Reporting — Rules

## R1. Don't invent a parallel logger

Per CLAUDE.md, this domain is the canonical error system. Don't add Sentry, Datadog, etc. unless the team agrees. Don't write a parallel `console`-based file logger.

## R2. `console.error` for genuine errors

Per CLAUDE.md, production builds strip `console.{log,info,debug,warn}` (`next.config.ts` `compiler.removeConsole`). Use `console.error` only for things that must survive. Anything else → `ErrorReport`.

**`console.error` means "a human should act", not "something happened".** Because it is the
only level that survives the production build, it is tempting to reach for it whenever you
want a line to be visible on Vercel. Don't. Vercel groups every `console.error` into the
project's runtime-errors list, so each non-error you put there is one more thing between a
reader and a real fault — and a list nobody trusts is a list nobody reads.

Before writing `console.error`, ask: *if this fires at 3am, is there something to do about
it?* If the answer is no, it is not an error:

| It is… | Use | Why |
| --- | --- | --- |
| A fault a human must act on | `console.error` | Survives the build; belongs in the error list |
| A success / "job done" line | `console.log` | Stripped in production. Vercel already logs the invocation |
| An expected outcome (see R6) | `console.warn` | Kept for local debugging, stripped in production |
| A user-facing error worth analysing | `ErrorReport` | Structured, deduped, queryable, carries user context |

A one-line-per-run cron heartbeat is a legitimate exception — see
[gotchas G-LOG-1](./gotchas.md).

## R6. Expected outcomes are not errors

An outcome the code already handles is not a fault, and must not be logged at `error`
level. Three recurring shapes:

- **The caller recovers.** A failed Klaviyo idempotency pre-check
  (`src/lib/klaviyo.ts`, `critical: false`) falls through to create/update; nothing is
  lost. The outage signal lives in the *critical* Klaviyo calls, which still log at `error`.
- **There is nothing to act on.** A tracking beacon from a visitor with no `ta_anon_id`
  cookie (blocked cookies, a bot) has no row to attach to. Both promo beacons exclude
  `no_anonymous_id` and `no_visit_row` from their failure log.
- **It is a business outcome, not a system fault.** A card decline means the customer needs
  a different card, not that engineering broke something. Detect these with
  `isExpectedPaymentDeclineError(error)` from `error-severity-classifier.ts` rather than
  matching on message text at the call site.

  **Downgrading the log level is only safe where an `ErrorReport` is still written. It is
  not everywhere.** Check before you quieten one:

  | Path | After the decline branch | Our record of the decline |
  |---|---|---|
  | [`/api/stripe/create-one-time-purchase-existing-user`](../../src/app/api/stripe/create-one-time-purchase-existing-user/route.ts) (~L601-610) | falls through to an **unconditional** `ErrorLoggingService.logError` | `ErrorReport`, graded `medium` — queryable in admin |
  | [`/api/mini-draw/purchase`](../../src/app/api/mini-draw/purchase/route.ts) (~L496-511) | `return NextResponse.json(…, { status: 400 })` **immediately** | **none** — Stripe's dashboard only |
  | [`/api/upsell/purchase`](../../src/app/api/upsell/purchase/route.ts) (~L663-678) | `return NextResponse.json(…, { status: 400 })` **immediately** | **none** — Stripe's dashboard only |

  The two payment-intent-creation catches sit *above* their route's `ErrorLoggingService`
  call and return before reaching it, so on those two paths a decline leaves no row in our
  own systems at all — the `console.warn` is stripped in production and there is nothing
  else. That is a deliberate accepted trade (Stripe is the system of record for a decline,
  and declines are high-volume), but it means **this rule does not license quietening a
  decline on a path with no `ErrorReport` behind it**. If you add a decline branch, either
  land it above an unconditional `logError` or say in the code comment that Stripe is the
  only record.

The same applies to a validation rejection: a Zod failure on a signup form is the form
working, and it answers with a 400. Log the message at `warn`, never the stack at `error`.

## R3. Sanitise before report

When capturing payment / auth-related errors, redact:
- Card data (already not stored, but error messages can leak it)
- Auth tokens / session secrets
- PII (email is OK; password / answer to security question is not)

## R4. Don't break user flow on capture failure

If posting an `ErrorReport` fails, don't error-cascade. Best-effort logging — the original error is more important than the report.

## R5. Use error classes with codes

Domain errors should extend `AppError` and carry a typed `code` field (cf. [subscription P6](../subscription/patterns.md#p6-errors-as-classes-with-codes-not-strings)). Route handlers map codes to HTTP status.
