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

## Page URL vs API endpoint

`ErrorReport` stores two locator fields that get conflated in the admin UI when only one is present:
- `apiEndpoint` + `httpMethod` — the **API call** that failed (set when the error has a request context).
- `route` / `currentUrl` — the **page** the user was on (always set on client-side reports).

Client-side payment errors rarely set `apiEndpoint` (the error never reached a route), so the page URL is the only locator. The admin table now shows page URL as a secondary line under the error message and provides a dedicated **Page URL** filter. The **API** column shows only `apiEndpoint`; an em-dash indicates no API call was involved.
