# Payment — Gotchas

## `user.save()` on `savedPaymentMethods` loses write races — retry, don't swallow

Mongoose applies `__v` optimistic concurrency **automatically** when you modify an array (no `optimisticConcurrency` schema option is set on `User`). So a positional write like `savedPaymentMethods.0.isDefault` throws **`VersionError`** if anything else wrote the user document between the read and the save.

That is not hypothetical: `POST /api/stripe/payment-methods` returned **500 six times to five members in the week to 2026-08-03**, on saves that had *already succeeded* via the competing writer. Members saw a failure toast for a card that was in fact saved — verified in production, both accounts ended up with the correct card, correct default, no duplicates.

The competing writer is usually **our own Stripe calls**: attaching a payment method and setting the customer default fire `payment_method.attached` / `customer.updated`, whose webhook handler writes the same user document while the request still holds a stale copy. (Tell-tale sign: `roleId` appears in `modifiedPaths` for a flow that never touches it.)

**A `VersionError` has no `.code` property** — it is identified by `name`. The old guard was `if ("code" in saveError) { if (saveError.code === 11000) … }` under a comment claiming *"Save with retry on conflict"*, so version conflicts fell straight through to a re-throw. The comment described behaviour that did not exist.

Rules now:

- Detect with `isWriteConflictError` (`name === "VersionError" || code === 11000`), never by `.code` alone.
- Wrap the whole read-modify-save in `withWriteConflictRetry` ([`payment-method-manager.ts`](../../src/utils/payment/payment-method-manager.ts)) — applied to `savePaymentMethodToUser` and `detachAndRemoveSavedPaymentMethod`. The operation **must re-read the user at its start**, or the retry re-applies the same stale version. Any Stripe call inside must be idempotent, because a retry repeats it (`ensurePaymentMethodAttached` and `setDefaultPaymentMethod` both are).
- Conflicts must **escape** an inner `catch` that returns `{ success: false }` — swallowing them is what turned a retryable race into a user-facing 500.
- `removePaymentMethodFromUser` and `deduplicatePaymentMethods` still save directly and are **not** yet wrapped; extend the same pattern if they start erroring.

## `POST /api/stripe/cancel-payment-intent` is unauthenticated **by design** — client_secret is the gate

This route deliberately takes **no session**. `create-payment-intent` gates on `if (session?.user?.id)` — a *conditional, not a requirement* — so guests legitimately hold PaymentIntents (registration does not auto-login here; a step-1 guest bridges to step 2 via `guestUserData`). Requiring a session would break abandoned-payment cleanup for exactly the users most likely to abandon.

It previously accepted a bare `paymentIntentId` from an unauthenticated body and cancelled it. `pi_...` ids are exposed to the browser during checkout, so anyone holding one could cancel **another member's in-flight payment**.

Authorization is now the intent's **`client_secret`** — Stripe's own capability token, only ever handed to the client that created the intent and not derivable from the id — compared with a length-safe constant-time check so the endpoint can't be used as a brute-force oracle. Layered with `requireSameOrigin` (CSRF) and a per-IP distributed rate limiter, mirroring [`POST /api/auth/auto-login`](../../src/app/api/auth/auto-login/route.ts), the repo's existing precedent for a state-changing Stripe route with no session.

**Callers must send `clientSecret` alongside `paymentIntentId`** or they get a 403 — see `handleClose` in `MembershipModal`, which captures it *before* the state reset that nulls it.

## `subscription-period.ts` is the Basil-safe way to read period start/end

[`getSubscriptionPeriodEnd` / `getSubscriptionPeriodStart`](../../src/utils/payment/stripe/subscription-period.ts) are the canonical helpers for "when does this subscription's current period start/end?". Under the Stripe Basil API those fields live on `subscription.items.data[i].current_period_*`, not the subscription root (which returns `undefined`); the helpers read the earliest value across items and fall back to the legacy root field for older shapes. `getSubscriptionPeriodStart` was added June 2026 alongside the existing end helper when the upgrade route needed the start for display. Always use these — reading `subscription.current_period_*` directly silently yields `undefined`/`Invalid Date`. See [billing-stripe/gotchas.md](../billing-stripe/gotchas.md) for the incident that motivated this.

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

## Refund reversal must pass `invoiceId` to the affiliate reversal

`processRefundReversal` resolves both the real `paymentIntentId` and (for
subscription refunds) the `invoiceId`, and now passes **both** to
`reverseAffiliateCommissions`. This is required because affiliate commissions
store their payment link differently per type (`membership-recurring` by
`stripeInvoiceId`, `membership-first` by a normalized `invoice_in_…` PI). Without
the `invoiceId`, refunded renewals never reversed and the affiliate kept the
commission. See [affiliate/gotchas.md](../affiliate/gotchas.md#refund-reversal-must-match-all-commission-storage-forms-fixed-2026-06).

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

The client-side classification pipeline lives in [`payment-error-detection.ts`](../../src/utils/payment/stripe/payment-error-detection.ts) (categorize + recovery strategy) and [`payment-error-messages.ts`](../../src/utils/payment/stripe/payment-error-messages.ts) (user-facing title + message). Subscription-creation error mapping lives in `subscription-error-handler.ts` (`SubscriptionErrorType` enum: creation-failed / network / validation / …), which now also handles the ApiError shape (body on `.data`) — see [backend.md](./backend.md).

## Confirm-time card declines THROW — routes must return the 400 "Payment failed" shape (fixed 2026-07)

With `confirm: true`, `stripe.paymentIntents.create` / `stripe.invoices.pay` **THROW** a `StripeCardError` on an issuer decline instead of returning a failed intent — the decline lands in the route's generic `catch`, not in any `last_payment_error` branch. Production bug: a confirm-time decline ("Invalid account.", `decline_code: invalid_account`) on `POST /api/stripe/create-one-time-purchase-existing-user` came back as a generic 500 and the user saw "Failed to create one-time purchase Please try again." with no actionable guidance.

The pipeline that fixes it:

- **Server**: route catch blocks call [`isStripeCardError(error)`](../../src/utils/payment/stripe/payment-error-detection.ts) — duck-typed (`type === "StripeCardError"` || `rawType === "card_error"`) — and return the 400 `{ success: false, error: "Payment failed", details, code, decline_code, … }` shape instead of a 500. Non-card Stripe errors must stay 500.
- **Client extraction**: [`extractPaymentErrorCodes(error)`](../../src/utils/payment/stripe/payment-error-detection.ts) returns `{ code, declineCode }` from any error shape that reaches the client — raw Stripe error (direct props), plain 400 body, ApiError from `src/lib/queries.ts` (body on `.data`), axios-style (`.response.data`). The internal `extractResponseBody()` makes `extractErrorMessage` / `extractErrorCode` / `categorizeError` probe ApiError `.data` too — previously only axios `.response.data` was probed, so ApiError decline info was invisible to the client pipeline. `categorizeError` also probes `.data` for the `requiresDifferentPaymentMethod` / `failureReason` / `failureCode` flags.
- **Guidance**: [`getCardDeclineGuidance(declineCode, errorCode)`](../../src/utils/payment/stripe/payment-error-messages.ts) looks up the `DECLINE_CODE_GUIDANCE` map (short, direct copy — 1–2 sentences, one next step). `formatPaymentError()` returns the decline-specific title/message when the error carries a code/decline_code, unless the errorType is `stripe_excessive_retry` / `invoice_collection_blocked` / setup- or payment-intent recovery — those keep priority (their next step is more specific than the decline reason).
- **Never leak sensitive codes**: `lost_card`, `stolen_card`, `pickup_card`, `fraudulent` are deliberately NOT in the map — they fall through to the generic "Your card was declined. Try a different card, or contact your bank." per Stripe guidance never to reveal those reasons. The generic `card_declined` + `insufficient_funds` switch cases in `formatPaymentError` reuse the same concise copy.

Fenced by `npm run test:decline-guidance` (incl. the sensitive-code non-leak and the production ApiError bug shape).

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

## Stripe PaymentElement input font must be ≥16px (iOS Safari zoom)

_2026-06-09:_ Every PaymentElement input font size in `STRIPE_PAYMENT_ELEMENT_RULES` (`.Input`, `.Input--empty`, `.Input--focus`, `.Input--invalid`, `.InputElement`, and the `cardNumber` / `cardExpiry` / `cardCvc` field rules) plus `variables.fontSizeBase` were raised 14px → 16px in [`buildMembershipStripeAppearance`](../../src/utils/payment/stripe/membership-stripe-appearance.ts) (`minHeight: '44px'` retained). iOS Safari auto-zooms when a focused input's computed font-size is <16px; the app's own CSS cannot reach Stripe's cross-origin iframe, so the Appearance API is the only lever (Stripe's docs recommend ≥16px input font on mobile). Keep these at 16px — dropping below re-introduces the zoom. This builder is shared by PaymentMethodSelector, StripePaymentModal, PaymentMethodsTab, UpsellModal, SpecialPackagesModal, and RenewalFailedModal, so the single change fixes the card-field zoom across all of them.

## `billingReason` threads through to Klaviyo as `is_renewal` / `billing_reason`

The Stripe `invoice.billing_reason` parameter on `grantBenefits` / `trackKlaviyoEvent` is wired through to the `Placed Order` event in Klaviyo so attribution reports can filter automated renewals out of "true new revenue" calculations. The Klaviyo-side mechanics, custom-metric setup, and the full property naming contract live in [tracking/KLAVIYO_INTEGRATION.md](../tracking/KLAVIYO_INTEGRATION.md) — change the discriminator there, not in `payment-processing.ts`.

## "Invoice Generated" (customer receipt) is emitted server-side — never from the client (fixed 2026-07)

The Klaviyo **"Invoice Generated"** receipt used to be emitted by a fragile **client-side** call to `/api/invoice/finalize` from the upsell modals. Because every membership tier has an upsell configured, the old `shouldDelayInvoice()` was effectively always true, so the reliable server-side `trackInvoice` was skipped and the receipt depended entirely on the browser. If the customer navigated away (common after accepting an upsell) the receipt was silently dropped — verified in production (a real Boss subscriber fired Placed Order / Subscription Started / Upsell Accepted but **no** Invoice Generated).

Now "Invoice Generated" is emitted **server-side** from [`trackKlaviyoEvent`](../../src/utils/payment/payment-processing.ts) inside `processPaymentBenefits` — idempotent and always run server-side for every charge, so it can't be dropped by the client. The call is gated by [`shouldEmitInvoiceGenerated(billingReason)`](../../src/utils/integrations/klaviyo/klaviyo-invoice-service.ts):

- **EMIT** for `subscription_create` (new membership — the reported bug) and for undefined/empty `billing_reason` (one-time packs, mini-draws, and accepted upsells — each is its own charge).
- **SKIP** for `subscription_cycle` and `subscription_threshold` (renewals — owned by the "Subscription Renewed" → "Membership Renewal" Klaviyo flow) and `subscription_update` (upgrade — owned by the `invoice.payment_succeeded` webhook's `isUpgrade` block). Skipping these prevents double-emailing.

Exactly-once emission is guaranteed because `processPaymentBenefits` dedups by `paymentIntentId` / `PaymentEvent` (`BenefitsGranted-${paymentIntentId}`) before reaching `trackKlaviyoEvent`.

**Behavioral consequence:** an accepted upsell is a separate PaymentIntent, so it now gets its **own** receipt — an upsell purchase yields **two** receipts (base charge + upsell charge). The old client-combined single-invoice email is gone (it required the client and was unreliable).

**Removed (dead code deleted):** the `/api/invoice/finalize` route, `trackCombinedInvoice`, `buildCombinedInvoiceData`, `shouldDelayInvoice`, and the `finalizeInvoice` client logic in the upsell modals. The rule is fenced by `npm run test:invoice-generated-gate`.

## Stripe boots on import — use the `/pure` entry, never call `getStripePromise()` at module scope (fixed 2026-07)

The default `"@stripe/stripe-js"` entry's `loadStripe()` injects `https://js.stripe.com` as a side effect of **importing the module** — not of calling the function. [`stripe-client.ts`](../../src/lib/stripe-client.ts) therefore imports from `"@stripe/stripe-js/pure"` instead, which defers the script injection to the **first actual `loadStripe(key)` call**. That guarantee is only as good as its call sites: a `const stripePromise = getStripePromise();` at **module scope** in any component still runs on import — i.e. the instant that component's chunk downloads, whether or not the user ever opens it. `MembershipModal` and `PaymentMethodSelector` both had this pattern, which meant Stripe.js loaded for **100% of guests** who merely rendered a page containing a `<MembershipModal>` mount point (the 2026-07 perf audit that motivated `LazyMembershipModal`, see [frontend.md](./frontend.md)) — no card form ever needed to be visible.

Fix: call `getStripePromise()` **inside** the component (`const stripePromise = useMemo(() => getStripePromise(), []);`), never at module scope. The returned promise is still the same module-level cached singleton in `stripe-client.ts` (Stripe prohibits re-instantiation per render), so identity stays stable across renders — only the *call site* moved.

Enforced by `eslint/rules/no-eager-stripe.js` (registered as `internal-norm/no-eager-stripe` — see `eslint/rules/index.js` / `eslint.config.mjs`), severity `"error"`: bans `loadStripe`/`getStripePromise()` calls outside a function body, and bans importing `loadStripe` from anywhere except `src/lib/stripe-client.ts`. **Gap closed (2026-07):** the rule initially only fixed `MembershipModal`/`PaymentMethodSelector`, which surfaced the same module-scope pattern in six more payment surfaces — `UpsellModal/index.tsx`, `StripePaymentModal/PaymentForm.tsx` (+ its re-export consumer `StripePaymentModal/index.tsx`), `SpecialPackagesModal/index.tsx`, `PaymentMethodsTab/index.tsx`, `RenewalFailedModal/InlineCardSetup.tsx`, and `RenewalFailedModal/usePastDueResolve.ts` (a module-level `export const stripePromise`, consumed by `RenewalFailedModal/index.tsx` and `PastDueResolvePanel.tsx`). All six were converted to the same lazy in-component `useMemo(() => getStripePromise(), [])` pattern in the same follow-up round — `npm run lint` is now clean of `no-eager-stripe` findings repo-wide.

## Terminology: `isAdditional` (was `isMemberOnly`) — 2026-07-01

The package flag `isMemberOnly` was renamed to **`isAdditional`** across the codebase. It marks packages that require *additional-package access* — an **active subscription OR current major-draw entries** (see `hasAdditionalPackageAccess`), which is broader than subscribers; it was never truly "member-only". The internal `-member` UI id-suffix (a row disambiguator) is intentionally unchanged. Full rationale: [subscription/gotchas.md](../subscription/gotchas.md).

## Resolved — 3-D Secure was reported to the buyer as a completed purchase (2026-08-04)

`/api/stripe/create-one-time-purchase-existing-user` answers **`success: true`** with
`paymentIntent.status: "requires_action"` when the cardholder's bank wants authentication. The
route comment said *"frontend will handle 3DS redirect via client_secret"* — **no caller ever
did**. So the mutation resolved, the full success path ran, and the customer saw
*"Purchase Complete! Your payment was successful"* while Stripe held the charge as
**Incomplete**: no money taken, no `payment_intent.succeeded` webhook, no entries granted.

Reproduced with Stripe test card `4000 0025 0000 3155` — two `$125.00` Incomplete intents in the
dashboard against a success screen in the app.

**Two things hid it.**

1. **Nothing logged it.** No `ErrorReport` was written on this path, so the only trace was
   per-customer in the Stripe dashboard. From inside the product it was completely invisible.
2. **The response type lied.** `MembershipResponse` declared `data.paymentIntent` with a
   snake_case `client_secret`, while the route returns `paymentIntent` at the **top level** with
   `clientSecret`. Consumers reaching through the typed shape got `undefined` and type-checked
   cleanly — so the `requires_action` status was not just unread but effectively unreadable.
   Correcting the type surfaced three dead `data.paymentIntent` fallbacks in MembershipModal and
   SpecialPackagesModal that could never have matched at runtime.

**The fix.** `completePendingAuthentication()`
([src/utils/payment/stripe/complete-pending-authentication.ts](../../src/utils/payment/stripe/complete-pending-authentication.ts))
runs inside the purchase `mutationFn`, before it resolves:

- Not `requires_action` → returns immediately (no behaviour change on the normal path).
- `requires_action` → presents the challenge via `stripe.handleNextAction({ clientSecret })`.
  `succeeded` or `processing` resolve normally and the webhook grants benefits exactly as usual.
- Anything else — error, abandoned challenge, still-unauthenticated intent, missing client
  secret, Stripe unavailable — **throws**, so the caller's existing `onError` rolls the optimistic
  state back and the buyer is told the truth instead of congratulated.

Every failing branch also writes an `ErrorReport` via `autoLogPaymentError` with an
`errorCode` of `3ds_*` (`3ds_no_client_secret`, `3ds_stripe_unavailable`, `3ds_not_completed_*`,
or Stripe's own code), so a run of abandoned challenges is visible in admin instead of silent.
Reporting is best-effort and never masks the payment error. The route no longer claims
`paymentVerified: true` or "purchase successful" while authentication is still outstanding.

**If you add another purchase entry point, call this helper.** `success: true` from a purchase
route does not mean the money moved.

## Excessive-retry block: customer copy

When Stripe blocks a card with `outcome.reason === "previously_declined_do_not_retry"`, the member
Pay-Now route (`/api/stripe/pay-failed-invoice`) detects it via
`analyzePaymentIntentForExcessiveRetry` and returns `requiresDifferentPaymentMethod: true`.

The copy is deliberately short and gives a concrete date horizon rather than a vague "try later" —
the block genuinely clears on its own, so telling the member *when* is more useful than telling them
to keep trying:

> This card is temporarily blocked after too many attempts. Use a different card, or try again in 3 days.

Keep the "3 days" aligned with `EXCESSIVE_RETRY_COOLDOWN_DAYS` in
[chargeOrRecoverPolicy.ts](../../src/server/admin/chargeOrRecoverPolicy.ts) — if the cooldown window
changes, this string must change with it.

`STRIPE_EXCESSIVE_RETRY_OUTCOME_REASON` in
[stripe-excessive-retry.ts](../../src/utils/payment/stripe/stripe-excessive-retry.ts) is the single
name for this concept across both the customer path and the admin cooldown. Do not introduce a
second vocabulary for it.

---

## The major-draw credit-failure reporter had never written a single row (2026-08-20)

**The safety net was armed but disconnected.** `addToMajorDraw`'s credit-failure reporter was added after the May 2026 incident where 60 members were under-credited by 25,235 entries — the whole point being that the failure had been *silently swallowed*. Both of its `ErrorLoggingService` calls passed **two** arguments, which on the server is itself a silent no-op. It has therefore never produced an `ErrorReport`.

Three separate traps, all of which had to be fixed together — see `reportDrawCreditFailure` in [`payment-processing.ts`](../../src/utils/payment/payment-processing.ts):

**1. The third argument is load-bearing.** `logError(err, ctx)` with no options takes the CLIENT path, `autoLogError`, which `fetch`es the **relative** url `/api/error-reports`. Node throws `Failed to parse URL`; that util swallows the rejection in its own `.catch(console.warn)`; `removeConsole` strips the warn in production. No report, no error, no warning. Pass `{ isServerSide: true, request }` — `LoggingOptions.request` is only the structural type `{ headers: Headers; url?: string }`, so a job with no request can pass `{ headers: new Headers() }`.

**2. `logPaymentError`, not `logError`.** `logError` *sniffs* a category from strings ([`error-category-detector.ts`](../../src/utils/error-reporting/error-category-detector.ts)): it looks for `/stripe/` or `/payment` in `endpoint`, or `payment` in `component`. `endpoint: "addToMajorDraw"` matches none of them → category `api` → `logAPIError`, which forwards **only** `userId` and `userEmail`. Every money field would have been dropped even after fixing trap 1. Name the payment entry point directly instead of relying on keyword matching.

**3. `drawId` / `sourceType` / `entries` only survive in the MESSAGE.** No forwarder carries them and `ErrorReport` has no freeform bag, so passing them in the context object drops them silently. They are folded into the error text as a `detail` string. Do not "tidy" them back into the context.

**Volume:** deduplicated on (message + errorName + userId + category + severity) within a **30-minute** payment window, so a renewal burst collapses to one row per affected user, not one per attempt. `ErrorReport` has a 90-day TTL. `autoLogErrorServer` wraps its whole body in try/catch and `reportDrawCreditFailure` adds its own, so reporting can never abort a grant mid-flight.

⚠️ **When adding any server-side error report, check the argument count first.** A two-argument call compiles, type-checks, lints, and does nothing.

## Resolved — a 3DS buyer finished paying and stayed logged out (2026-08-27)

3DS/SCA sends the buyer to their bank and Stripe brings them back to `return_url`. That round trip
destroys every bit of in-page React state — **including the `guestUserData` bridge** that carries a
guest from checkout into profile setup. The success landing therefore had nothing to identify the
payer with, and no code path signed them in: they completed the purchase and stayed logged out,
never reaching profile setup, never setting a password, never verifying a contact channel.
Registration is passwordless, so that is terminal — this is the cohort with no self-service route
back into their own account.

The fix, in [`use3DSRedirectHandler.ts`](../../src/hooks/use3DSRedirectHandler.ts), is
`establishSessionFromPayment(clientSecret)` on `succeeded` → `POST`
[`/api/auth/session-from-payment`](../../src/app/api/auth/session-from-payment/route.ts) →
`signIn("auto-login", { token })`. The route takes **only** the redirect's client secret and derives
the user from the PaymentIntent's customer, so the client asserts no identity; it is documented in
[auth/api.md](../auth/api.md) and specified in
[2026-08-25 mobile verification and SMS login](../superpowers/specs/2026-08-25-mobile-verification-and-sms-login-design.md).

**Best-effort and silent, on purpose.** The payment already succeeded. Awaiting the exchange,
surfacing its error, or logging it as a payment failure would turn a sign-in hiccup into "your
payment failed" on the screen that has just taken the customer's money. Failure degrades to exactly
the pre-fix behaviour — success page, logged out — with the email / SMS sign-in paths still open.
Encoded as [R13](./rules.md#r13); the full contract is in
[frontend.md](./frontend.md#3ds-session-establishment).

**The `202` retry is the webhook race, not a flaky network.** A one-time buyer who never registered
has no `User` document until the Stripe webhook creates one, so the route answers
`202 { pending: true }` rather than failing someone who has genuinely paid. The hook re-POSTs on
`[0, 1500, 3000, 5000]` ms. Every other non-`ok` status is terminal and returns immediately —
retrying a 403 (client-secret mismatch) or a 409 (intent not `succeeded`, or no customer on the
intent) cannot change the answer.

**Still on `auto-login`: the three in-modal `MembershipModal` purchase paths.** Not an oversight —
bundling that migration would have put a working purchase path at risk of a fault in a brand-new
route. Once `session-from-payment` has run in production, delete `auto-login` and point all four
call sites here.

## Three payment paths created accounts with an unchecked mobile (guarded 2026-08-27)

`User.mobile` is now a login identifier and carries a `unique` index. Three paths create accounts
with a mobile and **none of them checked uniqueness**:

- [`account-manager.ts`](../../src/utils/payment/account-manager.ts) (Stripe webhook — the buyer who never registered)
- [`user-subscription-utils.ts`](../../src/utils/payment/user-subscription-utils.ts)
- [`/api/stripe/create-subscription`](../../src/app/api/stripe/create-subscription/route.ts)

Under the unique index a collision is an **`E11000` thrown inside account creation for someone who
has already been charged** — the worst possible place to surface a data-integrity error. The
customer's money moves and their account never appears.

All three now route the value through
[`claimMobileForNewUser()`](../../src/utils/auth/claim-mobile.ts): if the number is already on
another account, the new account is created **without** it and the collision is logged with
`console.error` (which survives the production console strip). The customer keeps their purchase,
their entries and their account; they add a mobile later from Settings, where the check is friendly
and interactive.

**Do not "improve" this into a hard failure or a silent steal from the other account.** A phone
number is recoverable. A broken checkout is not.

> **Ordering:** this guard must be deployed **before** `migrate:unique-mobile-index` runs against
> production. Until it is, the index turns a rare data collision into a failed purchase. The
> normalise migration has no such constraint — it is safe to run against the old code, and in fact
> makes `register`'s existing duplicate check work correctly.
