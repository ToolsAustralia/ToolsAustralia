# Payment — Gotchas

## `addToMajorDraw` must never silently swallow a failed draw credit

[`payment-processing.ts`](../../src/utils/payment/payment-processing.ts) `addToMajorDraw` credits the active `MajorDraw` for every package payment. It historically did a **non-atomic 3-step write** (`updateOne` + a full ~1MB `findById` reload of the whole `entries[]` array to recompute `totalEntries` + another `updateOne`) wrapped in a `try/catch` whose logging was **entirely commented out** with a "Don't throw" comment. During synchronized renewal billing spikes (anchor-day billing fires dozens of `invoice.paid` webhooks at once), transient DB failures on those writes were **silently dropped** → `data.grants.drawGrants: []`, the member missing/short on the draw, with **zero `ErrorReport`s and the webhook queue showing `succeeded`** (the failure was below the queue layer). May 2026: 60 active members were left under-credited by 25,235 entries this way; see `docs/draws/gotchas.md`.

Rules for this block:
- **Credit atomically in a single op per branch.** `$inc` the document-level `totalEntries` in the *same* update as the per-user row — never reload the whole `entries[]` array just to recompute it.
- **Use the `matchedCount`-based upsert** (`$inc` existing row → else `$push` guarded by `"entries.userId": { $ne }` → else re-`$inc`). This prevents duplicate per-user rows under concurrency.
- **Do NOT add an application-level retry around the credit.** `$inc`/`$push` are not idempotent; the MongoDB driver's `retryWrites: true` already retries each `updateOne` *exactly once* on safe (write-not-applied) errors. An extra app-level retry would **double-credit** if a write commits but its acknowledgement is lost (timeout-after-commit) — the very failure that happens under load — and the cron can't undo an over-credit (it only adds a missing delta). Attempt the credit once; let the reconciler heal hard failures.
- **On failure, write an `ErrorReport` via `ErrorLoggingService.logError` — never swallow silently.** Leave `drawGrants` empty so the reconciliation cron / `scripts/fix-major-draw-renewal-entries.ts` heals it idempotently (it compares the live draw value, so it won't double-credit).

## Refund reversal — always pass `row.drawId` through to `removeMajorDrawEntries`

[`refund-ledger-reversal.ts`](../../src/utils/payment/refund-ledger-reversal.ts) iterates `data.grants.drawGrants[]` from the original `BenefitsGranted` event and calls `removeMajorDrawEntries` for each row. The current code passes `row.drawId` as the 4th argument so the removal is scoped to the *specific* draw the entries originally landed in. **Do not remove or null out this argument.** Without it, the function falls back to walking every draw the user has entries in, which is what produced the silent prior-draw corruption (see `docs/draws/gotchas.md`).

For the legacy fallback path (originalEvent has no `grants.drawGrants` — pre-ledger event), `removeMajorDrawEntries` is intentionally called without a `drawId` because none is available. The function logs `[refund-reversal] no drawGrants ledger — falling back to legacy walk` so these cases are visible during local `stripe listen` debugging.

## Local debugging with `stripe listen`

When you run `stripe listen --forward-to http://localhost:3000/api/stripe/webhook` and a refund fires, every step of the reversal emits a structured `[refund-reversal] …` log line through `console.log`. Production builds strip those (per `next.config.ts` `compiler.removeConsole`), so they're dev-only. The legacy-walk warning is emitted via `console.error` and survives in production too — treat it as an alert.



## Confirmation method fix

(Migrated stub from `docs/PAYMENT_ELEMENT_CONFIRMATION_METHOD_FIX.md` — _TODO: read full source and merge here._)

Brief: subscription Payment Intent confirmation requires the right `confirmation_method` (typically `automatic` for Payment Element). Setting it explicitly on the PI avoids a class of confirmation-loop bugs.

## Default PM string vs object

`invoice.default_payment_method` can be:
- A **string** (the PM id, when not expanded)
- An **object** (PaymentMethod object, when expanded with `expand: ['default_payment_method']`)

Always handle both:
```ts
const pmId = typeof invoice.default_payment_method === "string"
  ? invoice.default_payment_method
  : invoice.default_payment_method?.id;
```

## Payment attribution

(Migrated stub from `docs/PAYMENT_ATTRIBUTION.md` — _TODO: read full source and merge here._)

Brief: when a payment succeeds, attribution data (UTM, affiliate, referrer) is written into `PaymentEvent.data` so reverse-attribution analytics work even after the user clears cookies. The capture point is the create-payment-intent / create-subscription routes — not the webhook.

## Payment error handling

(Migrated stub from `docs/PAYMENT_ERROR_HANDLING_AND_RECOVERY.md` — _TODO: read full source and merge here._)

Brief: Stripe errors get classified into:
- `card_error` (4xx — surface to user with `error.message`)
- `invalid_request` (4xx — programming bug, log + generic 400)
- `api_error` (5xx — retry once, then 503)
- `authentication_error` / `idempotency_error` — log + 500

The classification helpers live in `subscription-error-handler.ts` and are reusable across payment routes.

## Failed invoice recovery selection

When the user has multiple invoices on a paused subscription, `subscription.latest_invoice` may point to a **draft** (Stripe creates new cycle invoices that stay draft under `pause_collection: keep_as_draft`). Don't pay the latest — use `failed-invoice-selection.ts` to find the actual open invoice that can be paid.

See [billing-stripe gotchas](../billing-stripe/gotchas.md#missing-invoice-while-paused).

## 3DS challenge timing

The 3DS challenge flow involves a redirect away from our domain and back. Edge cases:

- **User abandons mid-challenge**: The PI ends up `requires_action` indefinitely. `payment-cleanup.ts` handles cancellation of stuck PIs older than a threshold.
- **Session cookies dropped on Safari**: Same-origin `return_url` is mandatory — see [rules R6](./rules.md#r6).
- **Browser-back during challenge**: User can return to checkout with the original PI still pending. The hook re-polls and reconciles.

## Saved-PM deletion is a multi-step flow

Deleting a saved card isn't just a Mongo update:
1. Detach from Stripe customer.
2. Remove from `User.savedPaymentMethods[]`.
3. If default, promote next-most-recent.
4. If the PM is referenced by an active subscription, error or migrate first — orphaning a sub's PM mid-cycle leaves it unrechargeable.

`payment-method-delete-flow.ts` orchestrates this. Don't bypass it.

## `processPaymentBenefits` is idempotent — but watch the timing

The benefits-grant path is wrapped in `PaymentEvent.findOne({ paymentIntentId })` dedupe. Webhook retries and the synchronous post-confirmation paths can both call it; the second call is a no-op.

But: between the first call's "find" and "create," a concurrent retry can race. The grant uses `BenefitsGranted-${paymentIntentId}` as a unique-key write — the loser gets `E11000` and bails. That's the safe path. Don't add an artificial delay or transaction; the unique index is enough.

## `billingReason` threads through to Klaviyo as `is_renewal` / `billing_reason`

The Stripe `invoice.billing_reason` parameter on `grantBenefits` / `trackKlaviyoEvent` is wired through to the `Placed Order` event in Klaviyo so attribution reports can filter automated renewals out of "true new revenue" calculations. The Klaviyo-side mechanics, custom-metric setup, and the full property naming contract live in [tracking/KLAVIYO_INTEGRATION.md](../tracking/KLAVIYO_INTEGRATION.md) — change the discriminator there, not in `payment-processing.ts`.
