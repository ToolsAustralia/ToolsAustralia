# Error Reporting — Gotchas

## Expected card declines are `medium`, not `critical`

`classifyErrorSeverity` used to map **every** `payment`-category error to `critical`, and `autoLogPaymentError` / `autoLogPaymentErrorServer` hard-coded `severity: "critical"`. Result: routine customer card declines (insufficient funds, expired card, etc.) flooded the store as `critical` — ~63% of all reports — burying the genuine payment-system failures. Now a shared `isExpectedPaymentDecline()` (in `error-severity-classifier.ts`) detects declines (non-empty Stripe `decline_code`, a known card-error `code`, or decline message phrasing) and those are logged at **`medium`**; only genuine payment-system failures (Stripe Elements failed to load, API/network errors, unexpected exceptions) stay `critical`. All three sites use the one helper — keep them in sync. The named-4xx business rejections (e.g. `EXISTING_SUBSCRIPTION` 409) are **deliberately** captured at `medium` by `classifyHttpRejection` (a real signal, not noise) — don't suppress them. Regression test: `npm run test:payment-decline-severity`.

## Severity ≠ urgency in the store totals

The auto-logger captures expected business events too (card declines at `medium`, `EXISTING_SUBSCRIPTION` 409s at `medium`). So a high `medium` count is mostly normal churn, not bugs — read the samples / `route` / `errorName`, not just the severity tallies. CLI: `npm run find:error-reports` (and `-- --contains="<msg>"` to drill into one error's browser/OS/stack).

## Production console-stripping

`next.config.ts` `compiler.removeConsole` strips `console.log/info/debug/warn` in production builds. `console.error` survives. Anything else MUST use `ErrorReport`.

If you debug-log with `console.log`, it works in dev but vanishes in production. Common confusion source.

## Migrated from `docs/ERROR_REPORTING_*.md` and `docs/PAYMENT_ERROR_HANDLING_AND_RECOVERY.md`

> _TODO: read all three root docs and merge._

## Recovery UI vs report

Recovery UI is shown to users; reports go to admins. Same error can drive both — make sure the report doesn't echo PII that the recovery UI also shows.

## Cascade prevention

If the error-reporting endpoint itself errors out, the catch must NOT re-call the reporting endpoint. Otherwise infinite loop. Use a counter / try-catch boundary at the report-call site.

## Stripe.js client-side validation noise

Stripe Elements emits client-side validation errors (`incomplete_number`, `incomplete_cvc`, `incomplete_expiry`, `Please fill in your card details`) and wallet-cancel signals (`google_pay.payment_exception`, `apple_pay.payment_exception`) directly from `confirmPayment` / `confirmSetup` / `elements.submit`. These are user-input issues, not bugs — they never reach a server route, attach no identity (the user often hasn't typed their email yet), and dominated the admin error reports page with "Anonymous" rows.

The predicate at [src/utils/payment/stripe/is-stripe-noise-error.ts](../../src/utils/payment/stripe/is-stripe-noise-error.ts) detects this class. It is applied at the **parent error handler** ([MembershipModal.handlePaymentError](../../src/components/modals/MembershipModal.tsx)) — the single chokepoint that owns auto-logging for the membership purchase flow. The predicate accepts both Stripe error objects (from server-side / direct Stripe.js callers) and bare error strings (as the message bubbles up through `confirmStripeIntent` → parent).

**Do not log at intermediate layers.** `PaymentMethodSelector` previously also called `ErrorLoggingService.logPaymentError` at its `confirmPayment` / `confirmSetup` error branches. That produced **duplicate "Anonymous" rows** because props didn't carry identity down (the parent had `formData.email`, the child didn't). The fix was to delete the child-layer log and centralise logging at the parent that has identity. If you wire a new error catch in a component below `MembershipModal`, return the error up — don't call `logPaymentError` directly.

**Beware double-fired handlers in long async functions.** `MembershipModal.handleSubmit` has many inner branches that do `await handlePaymentError(result.error, ...); throw new Error(result.error);`. The outer `catch` block previously called `handlePaymentError(error, ...)` *again* — yielding two toasts and (for real errors) two dedup-colliding auto-log attempts. Fix: inner blocks throw `markErrorHandled(new Error(...))` (from [src/utils/payment/stripe/error-handled-marker.ts](../../src/utils/payment/stripe/error-handled-marker.ts)) and the outer catch short-circuits via `isErrorHandled(error)`. Apply this pattern whenever a long async function has both inner per-step handlers AND an outer catch-all handler that both call `handlePaymentError` / auto-log.

**Do not strip these errors from the user-facing flow** — the message is still returned for toast display. Only the auto-log to ErrorReport is skipped.

## Invalid `category` silently drops reports

`category` MUST be one of the model-enum values: `payment | network | api | system | recovery`. Any other string (e.g. `"stripe"`) causes the Mongoose save to throw, which is swallowed by the fire-and-forget wrapper — the report is silently lost with no visible error.

This was the root cause of `autoLogStripeError` dropping every report it created: it passed `category: "stripe"`. Fixed by changing it to `category: "payment"` (see `src/utils/error-reporting/auto-log-error.ts`). Historical rows created before this fix show no `category` value.

## `logHttpRejection` must NOT call `detectCategoryAndSeverity`

`ErrorLoggingService.logHttpRejection` derives severity purely from the HTTP status (via `classifyHttpRejection`). It must never call `detectCategoryAndSeverity`, which classifies by error shape and escalates `payment`-context errors to `critical` — that escalation is wrong for HTTP-level rejections. The severity is intentionally capped at `"high"` (5xx) or `"medium"` (4xx).

## `httpStatus` only populated after this change

The `httpStatus` field on `ErrorReport` is only set for reports created via `logHttpRejection` (introduced with the `rejectAndLog` helper). Historical error rows have `httpStatus: null`.

## `useErrorHandling` no longer calls `sessionStorage.clear()` on 401 (2026-06-01)

`src/hooks/useErrorHandling.ts` previously called `sessionStorage.clear()` on HTTP 401 responses to wipe any stale session state before redirecting to login. This was removed because `sessionStorage` now holds the durable marketing-attribution cookie `_ta_attr` (90-day first-party UTM + click-ID cookie written at landing). Clearing all of `sessionStorage` on a 401 silently wiped the attribution data that the single-platform payment resolver needs to credit the correct ad platform for the subsequent purchase.

The fix: handle 401 session cleanup through cookie/NextAuth invalidation only — do not call `sessionStorage.clear()`. The `_ta_attr` attribution data should survive a re-login so the user's eventual purchase is correctly attributed to the original ad click.

If you need to reset attribution deliberately (e.g., a test harness), call `sessionStorage.removeItem("_ta_attr")` directly instead of clearing all of sessionStorage.

## Page URL vs API endpoint

`ErrorReport` stores two locator fields that get conflated in the admin UI when only one is present:
- `apiEndpoint` + `httpMethod` — the **API call** that failed (set when the error has a request context).
- `route` / `currentUrl` — the **page** the user was on (always set on client-side reports).

Client-side payment errors rarely set `apiEndpoint` (the error never reached a route), so the page URL is the only locator. The admin table now shows page URL as a secondary line under the error message and provides a dedicated **Page URL** filter. The **API** column shows only `apiEndpoint`; an em-dash indicates no API call was involved.

## G-LOG-1. Cron heartbeats are a deliberate `console.error` exception (2026-09-01)

[Rules R2/R6](./rules.md) say `console.error` is for faults a human must act on. Cron
"I ran and found nothing" heartbeats are the one sanctioned exception, and they are
deliberate — not oversights to clean up.

The reasoning is spelled out at the clearest example,
`src/app/api/cron/reconcile-renewal-grants/route.ts`:

> Heartbeat, deliberately at `error` level. A clean run logged via console.log is STRIPPED
> in production, which makes "ran and found nothing" indistinguishable from "never fired" —
> and a safety net that cannot prove it ran is not much of a net. One short line a day.

That trade is sound where the log is **one short line per run**. The six crons that do this
(`reconcile-renewal-grants`, `dashboard-stats-daily-snapshot`, `sync-meta-ads`,
`sync-tiktok-ads`, and both `cancellation-retention-*`) together produce roughly 96 entries
a week — legible, and worth the operational certainty.

It stops being sound when the line carries a payload. The `adsetMetadataFetcher` dumps
removed in the same change were four `console.error`s per run, several serialising whole
Meta API objects, for ~128 entries a week that no one could act on. **The test is not
"is this a cron?" but "is this one scannable line, and does its absence leave a real
question unanswered?"**

If you add a heartbeat: one line, structured counts only, no payloads, and no more than one
per invocation.
