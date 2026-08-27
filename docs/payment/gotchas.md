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

**The legacy walk's `source` ternary needs an arm per `packageType` (2026-08-17).** In that fallback the source key is picked by a ternary chain whose final `: "mini-draw"` is a **fallback, not a match** — any `packageType` not explicitly named above it lands there. So when `packageType: "shop"` was introduced, a merchandise refund would have removed entries from the user's **`mini-draw`** bucket, via the drawId-less multi-draw walk: the over-removal pattern above, aimed at the wrong source. `shop` now has an explicit arm; add one for every new `packageType`, because the default is silently wrong rather than merely imprecise. (Nothing produces `packageType: "shop"` yet — see [backend.md](./backend.md) — so this is a trap disarmed ahead of the grant, not a fixed production bug.)

The inline `row.sourceKey as …` union in the ledger path was completed in the same change (6 keys → 10: `referral`, `cancellation-upsell`, `streak`, `shop`). It is an unchecked `as` on a `string` field, so it gates nothing at runtime — it is documentation, and it had drifted three keys behind the schema. Don't read it as a guarantee.

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

## `processPaymentBenefits`' failure path was invisible in production (fixed 2026-08-17)

Every `console.error` in the `catch` of `processPaymentBenefitsInternal` had been commented out.
The only surviving write was `fs.appendFileSync(process.cwd() + "/webhook-debug.log", …)` — and
**that filesystem is read-only on Vercel**, so the append threw, its own catch swallowed it, and
the single line that reached production logs was `"Failed to write to log file"`. The actual
reason a grant failed was unobtainable in production, for every payment type, for as long as this
was in place.

The file write was **deleted rather than repaired**: it never worked in the environment that
matters and was actively masking the real error. `fs` and `path` imports went with it — they had
no other use in the file. Failures now emit a real `console.error` with message, stack,
`paymentIntentId`, `userId`, `packageType`, `packageId`, `entries`, `processedBy` and attempt
number.

`console.error` is deliberate: `next.config.ts` `removeConsole` strips `log`/`info`/`debug`/`warn`
from production builds but keeps `error`. A `console.warn` here would have been just as invisible.

## Merchandise is exempt from three things that look like they should apply to it

All three are `packageType === "shop"` guards in `payment-processing.ts`, and all three are
decisions rather than oversights:

- **`checkMajorDrawActiveForNewPurchases`** — exempt, alongside subscription renewals. That gate
  exists to stop someone *buying into* a draw that is closing, and every gated path is **also**
  blocked up-front at checkout so the customer never pays. Shop checkout has no pre-gate and must
  not gain one; a hoodie has to stay buyable during the freeze. Without the exemption the shop
  takes the money, ships the garment, and returns `GATES_CLOSED` — granting nothing, with no
  rollback and no retry. `getTargetMajorDraw()` already routes freeze-window entries to the next
  queued draw, which is the wanted behaviour, and this gate would stop it being reached.
- **`MilestoneService.checkAndIssueMilestones({ allowStreakIssuance })`** — `false` for shop. The
  invariant that flag protects is *"a member must never gain draw entries in a month they paid
  nothing"*, and it is coupled to a paid **membership** invoice, not to any payment. A t-shirt is a
  payment; it is not a month of membership. Leaving it `true` would let an ex-member with a stale
  `streakMonths` counter buy merch and be issued streak entries for months they never paid for.
- **`$addToSet: { processedPayments }`** — skipped for shop. This array is **not** the idempotency
  gate (`isPaymentProcessed()` reads `PaymentEvent` `BenefitsGranted-{pi}`, and shop has its own
  gate in `ShopOrderService.markPaid`). Its only functional readers treat a non-empty array as
  *"this customer has already bought something"*: `lib/referral.ts:160` refuses a referral code to
  anyone with `length > 0`, and the first-purchase referral reward fires only at `count === 1`.
  Appending a t-shirt would permanently bar that customer from ever redeeming a referral code, and
  rob their referrer of the reward on the membership they buy later.
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
## `account-manager` no longer initialises `upsellStats` (2026-08-27)

`createUserAccount` in `src/utils/payment/account-manager.ts` seeded a five-counter
`upsellStats` object on guest-checkout account creation. The field is deleted from the User
model — see `docs/upsell/gotchas.md`. `upsellPurchases` / `upsellHistory` are untouched.
## The applied discount code was thrown away at checkout (fixed 2026-08-27)

### In plain English — and why a discount-code bug touches the payment records at all

**What a PaymentIntent is.** Before a customer's card is charged, Stripe creates a record of the
attempt — who is paying, how much, and a small bag of notes we can attach to it. The card is charged
against that record. It exists, unpaid, for the whole time the customer is filling in their details.

**The discount code has always ridden in that bag of notes.** That is not new and it is not a choice
this fix made. It is the only thing that travels from the customer's browser to the moment Stripe
tells our server "this payment succeeded" — and that moment is when we work out what to give them.
If the code is not in the notes at that instant, nothing gives them their entries, because nothing
else knows a code was ever involved.

**So the bug was never about the code being wrong. It was about the code being written at the wrong
TIME.** We built the payment record the moment the customer reached the payment step — before they
could possibly have typed a code, because the code box is on that same step. For memberships we then
charged that same record and never went back. For one-off packs we did go back and add the code, but
only *after* the card had already been charged, which is a race against Stripe telling us about it.

**What the fix changes.** One field, on a record that has not been paid yet, at the last moment
before the charge. We do not create a payment record, cancel one, change an amount, or move a billing
date — the things that can cause Stripe to raise a second invoice. That was checked line by line
against the pre-flight list in `docs/PAST_DUE_REANCHOR.md` and cleared: metadata-only writes cannot
spawn an invoice.

**Why the duplicate-payment-record problem showed up now.** It was already there. The app has always
sometimes created two payment records a fraction of a second apart — one from the registration step
and one from the payment step — and charged whichever finished last. Nobody noticed, because nothing
depended on *which* one won. Now the customer's discount code rides on one of them, so the coin flip
became visible. **This fix did not introduce that race; it made an existing one matter.** Both halves
are closed here (the mutex now covers the registration handler and both card-decline retry paths), so
exactly one record is created per checkout and it always carries a real customer identity.

**Symptom:** a customer typed a bonus-entry code into the checkout box, saw **APPLIED**, paid, and received nothing. No entries, no error, nothing in the logs. Live in production until 2026-08-27.

**Cause — two different ones, one shape.** `MembershipModal` pre-warms the checkout object the instant step 2 mounts (`create-subscription(-existing-user)` for a membership, `create-payment-intent` for a pack). The coupon box is rendered on **that same step**, so at pre-warm time the customer has had no opportunity to type. Then:

- **Membership.** The PURCHASE handler takes the `subscriptionCreatedRef` reuse branch and sends no `campaignCode` at all. The subscription that gets charged carries none, the webhook's `metadata.campaignCode` read finds nothing, `checkAndRedeemCampaign` early-returns on an absent code. **Deterministic.**
- **One-time pack (guest).** `create-one-time-purchase` *does* resolve the code — but patches the PaymentIntent metadata **after** the browser already confirmed it. That races `handlePaymentSuccess`'s fresh `paymentIntents.retrieve`, which usually wins. **A race, which is worse than a deterministic bug: it looks green in some test runs.** Under `redirect: "if_required"`, a confirm that navigates away means the patch never runs at all.

**Fix:** one awaited call to `attachTypedCodeToCheckout` (via `POST /api/stripe/attach-typed-code`) in `handleSubmit`, placed **above every** `confirmStripeIntent()` branch, immediately after `lastChargedStaticPackageIdRef.current = packageId`. See [backend.md](./backend.md#attach-typed-codets--the-authoritative-typed-code-write).

**The three ways to reintroduce it:**

1. **Move the attach below a confirm, or into one branch.** Putting it inside the subscription branch turns `npm run e2e:bonus-code`'s membership leg green while the pack leg stays broken — and the pack leg, being a race, will *sometimes pass anyway*. Mechanical check: `grep -n "attachTypedCode({" src/components/modals/MembershipModal/index.tsx` must return exactly one line, and its number must be lower than every line from `grep -n "confirmStripeIntent()"` in the same file.
2. **Make the webhook read the frozen event payload** instead of its fresh `invoices.retrieve` / `paymentIntents.retrieve`. That freshness is now load-bearing — see [billing-stripe/gotchas.md](../billing-stripe/gotchas.md).
3. **Narrow the state guard back to `incomplete` only.** On the anchor days (AEST 25/26/27) these subscriptions are created `trialing`, so an `incomplete`-only guard makes the whole fix a silent no-op on three days of every month.

**Deliberately NOT done:** the code is never written by tearing down and recreating the pre-warmed subscription. The coupon box and the card form are on the same step, so "type card, then apply code" is a normal order — recreating invalidates the invoice PaymentIntent, remounts Elements and **wipes a card the customer already typed**, and leaves one `incomplete_expired` husk per application.

**Two holes found by review AFTER the first fix landed, both now closed — and both worth knowing about, because each one silently un-fixes the thing above.**

**1. The guest pack PaymentIntent had no identity, and there were two of them.** `handleRegistration` in `MembershipModal` creates the one-time PaymentIntent itself and used to pass **no `userEmail`** — every other call site passes one. Without it, `create-payment-intent` takes its "true guest" branch and stamps the literal placeholders `userId: "guest"`, `userEmail: "guest"`. `resolveOwnerUserId` skips both (they are in `NON_IDENTITY_USER_IDS` / the explicit `"guest"` email exclusion), `resolveCodeForCheckout` refuses with *"no resolved account for this purchase"*, and the attach writes `campaignCode: ""` — it **clears** the customer's code. Worse, that call did not set `isCreatingPaymentIntentRef`, the only mutex the step-2 pre-warm honours, so a **second** PaymentIntent (this one carrying the email) was created a tick later and whichever resolved last was the one charged. A real object: `pi_3U8uJYQxMEki11tJ0clg0b2W`, Apprentice Pack, `userId: "guest"`, `userEmail: "guest"`. **This was EXTRA100's entire audience.** Fixed by passing `userEmail: result.data.email` and holding the mutex across the whole round trip. Pinned by section 5b of `npm run test:attach-typed-code`.

**2. The client cap fired on requests the server had completed.** The helper aborted at 8s; the server was observed answering `200 in 8089ms` **having written the code**, while the browser logged the "charged without it" line. Three costs: the one production alarm for this defect cried wolf; the e2e console watchdog failed unrelated specs; and if an abort lands *before* the Stripe update the code really is lost. The cap is now 15s and the helper returns `outcome: "attached" | "refused" | "unknown"` so a definite refusal and a give-up are logged as different things. **Never collapse those two back into one log line** — that is exactly the "we cannot tell" state that hid the original bug.

**Still open (not this fix):** the resubscribe/renew flow (`SubscriptionManagementModal` → `/api/stripe/renew-subscription`) has no coupon input and no `campaignCode` field at all, so a win-back code cannot be redeemed there. Not a silent loss (the customer is never shown APPLIED), but it defeats that campaign.

## The rule this belongs to: a pre-warmed payment object + a code box = this bug, every time (2026-08-27)

The incident above is one instance of a shape. Written down so the next surface does not rediscover it.

**THE RULE.** A discount code reaches the grant **only** through the metadata on the Stripe object as
it stands at the instant Stripe reports the payment succeeded. So:

> **If a checkout surface creates its Stripe object BEFORE the customer can type a code, that code
> will be lost unless something writes it onto the object again before the charge.**

No amount of validating, applying, or showing APPLIED changes that. The customer sees success on
every screen and receives nothing.

**Every surface that takes a code, and why only one broke.** Audited 2026-08-27 — re-audit when
adding a fifth.

| Surface | Code input | Creates its Stripe object | Verdict |
|---|---|---|---|
| `MembershipModal` (`CouponRow`, rendered inside `PaymentStep`) | yes — **and a typed-but-not-applied code is resolved at the Purchase click** (`resolveTypedCodeAtCheckout`) | **on step-2 mount — before the code box is reachable** | the bug; fixed by `attachTypedCode` |
| `SpecialPackagesModal` (`PackagesGrid`) | yes — same purchase-click resolve, applied to all three code types | inside the purchase handler, **after** the code is collected (`create-one-time-purchase-existing-user` always mints a fresh PaymentIntent with the code already in metadata, `confirm: true`) | structurally safe |
| `RedeemablesWallet` | yes | **never — no Stripe object at all**; the code goes straight to the redeem API, which grants entries server-side | not a payment path, cannot have this bug |
| `my-account/rewards` | hosts the wallet, no input of its own | — | n/a |

**`SpecialPackagesModal` is safe for a reason, not by luck, and the reason is fragile.** It is a
saved-card one-click purchase, so it never mounts the Payment Element that `MembershipModal`
pre-warms for. **Give it a Payment Element — for new cards, say — and it inherits this bug the same
day**, because `attachTypedCode` is wired only into `MembershipModal` via `useStripeSubscription`.

**So, before you add either half of the pair, check the other:**

- **Adding a code box to a surface?** Find where that surface creates its Stripe object. If it is
  created before the box can be reached, wire `attachTypedCode` in above every confirm branch.
- **Adding a pre-warm / Payment Element to a surface that already takes a code?** Same wire, same
  place. The pre-warm is what breaks it, not the code box.
- **Adding a new payment route?** It must accept `campaignCode`, and it must resolve it through
  `CampaignCodeValidationService.resolveCodeForCheckout` — never trust the client's string.

**The wallet is why this hid for months.** A code has TWO independent redemption routes: checkout
entry, and a direct claim from the rewards wallet. `ANZACDAY25` redeemed 437 of 749 issuances through
the wallet while checkout entry was broken, so the aggregate looked healthy. **A campaign's redemption
count does not tell you whether checkout works** — if a campaign's codes are only ever delivered by
email (as the three bonus codes are, with no wallet surface live), checkout entry is the only route
and there is no second number to hide behind.

## The 15-second attach cap loses the code, and it was observed live (fixed 2026-08-27)

**Symptom.** A customer applies a discount code, sees APPLIED, clicks PURCHASE, is charged — and the
webhook grants no bonus entries. In the acceptance run that caught it the attach answered
`200 in 14903ms` against the client's 15000ms cap: the server had done the work, the browser had
already aborted, `attachTypedCode` reported `"unknown"`, `confirmPayment` charged anyway, and the
`invoice.payment_succeeded` handler logged `Original metadata` with no `campaignCode`. The margin
between the cap and the observed server latency under load was about 100ms.

**Why raising the cap is not the fix.** It moves the boundary; it does not remove it. A dropped
connection, a backgrounded tab or a closed browser reproduces the same loss at any cap, and a longer
cap makes a genuinely hung request stall a customer who is watching a spinner. The "never block the
sale" contract is correct and stays.

**What actually fixes it.** The server knows whether the customer asked for the code; the browser
does not. `attachTypedCodeToCheckout` now writes `checkoutIntentAt` / `checkoutIntentTargetId`
onto the customer's own `RedeemableIssuance` **before** the Stripe round trip — the slow half the
browser abandons during — and `checkAndRedeemCampaign` reads it back when the paid object carries no
`campaignCode`. The grant is recovered after the fact from a record that survives the client hanging
up. The issuance was never marked redeemed in the old failure either, so the customer already kept a
working code; what they lost was the entries on the purchase they had just made, and that is what
this recovers.

**What to watch.** A recovery emits
`⚠️ [CAMPAIGN] No campaignCode on the paid object — recovering from the recorded checkout intent`
(`console.error`, so it survives the production build). The grant lands — but a rising rate means the
attach path is slow and wants attention. See
[architecture.md](./architecture.md#the-recovery-leg-a-recorded-checkout-intent-2026-08-27) and
[docs/rewards-redeemables/rules.md R11](../rewards-redeemables/rules.md).

**What is NOT covered.** The intent is only recorded for a customer the server can resolve to a real
account from the checkout object's own metadata. A code applied by someone with no account row could
never redeem anyway (`resolveCodeForCheckout` refuses it first), so there is nothing to recover.
## `account-manager` no longer initialises `upsellStats` (2026-08-27)

`createUserAccount` in `src/utils/payment/account-manager.ts` seeded a five-counter
`upsellStats` object on guest-checkout account creation. The field is deleted from the User
model — see `docs/upsell/gotchas.md`. `upsellPurchases` / `upsellHistory` are untouched.

---

## The Apply button was a gate, and an un-pressed gate is a silent money loss

_Added 2026-08-27, after the owner hit it on the first real run of the flow: **"it seems like i need
to click the apply"**._

The checkout code box has an **Apply** button beside it. Until this change that button was the only
thing that made a typed code real — `appliedCouponPayload` gates all three code fields on
`couponApplied`, which only `handleCouponApply` sets. So:

> **A customer who typed `BACKIN200` and pressed PURCHASE without pressing Apply was charged, got
> nothing, and was told nothing.** The code was still sitting in the box, which made it look like it
> had worked.

That is not a cosmetic loss. Entries are money-equivalent and a campaign grant is
**one-per-customer-for-life, attached to a purchase**, so the purchase the grant was meant to ride
on is burned, and (per `CUSTOMER.md`) a customer who loses the email cannot look their code up
anywhere.

**The rule now:** pressing Purchase means the same thing as pressing Apply first. `handleSubmit` /
`handlePurchase` resolve an un-applied typed code through
`src/utils/payment/typed-code-at-checkout.ts` and charge on the answer. The Apply button stays — it
is an accelerator (instant confirmation), no longer a gate.

### The three outcomes, and why they differ

| Server said | We do |
|---|---|
| `200` + `success:true` + `valid:true` | Carry the classified code, charge, no prompt |
| `200` + `success:true` + `valid:false` | **Stop the sale once.** Show why in the code row, name the second press as the way through. Nothing is charged |
| `429` / `4xx` / `5xx` / abort / network / `success:false` / unknown `type` | **Charge anyway.** Pass the raw typed string as `campaignCode` only |

**Do not collapse rows 2 and 3.** `/api/codes/validate` returns `{ success: false, valid: false }`
for **both** a 429 (its own rate limiter) and a 500 (its own outage). A `!body.valid` read would
turn our rate limiter and our downtime into **refused sales** — strictly worse than the bug being
fixed, and invisible to `tsc`. The only shape that means "we know this code is bad" is:

```
response.ok && body.success === true && body.valid === false
```

Both directions are pinned by `npm run test:typed-code-checkout`.

**Why a definite refusal is allowed to stop the sale at all**, when `attachTypedCode` famously
never does: that contract is about **failing to obtain an answer** — its own comment says
*"Blocking a membership sale because a bonus lookup **timed out** is the worse trade."* It was never
a promise to ignore a definite answer that the code is wrong. Nothing is charged at the stop, the
customer is asked once, and the second press buys regardless. A `refusedCodeRef` holds the exact
refused string so the second press skips the resolve; any keystroke clears it, so a corrected typo
is re-checked rather than silently dropped.

**Why the raw string is safe to send when we could not check.** Campaign is the only leg every door
re-validates server-side, fail-closed, against a **server-resolved** user id
(`resolveCodeForCheckout`, called from all four create routes and the attach seam). Referral and
promo have no such gate, so an unclassified string is never sent as either.

### The trap when changing this

`handleSubmit` is an async closure that captured `appliedCouponPayload` **at render time**. Calling
`setCouponApplied(true)` mid-invocation does **not** update that memo, so every read inside the
submit must come from the settled local (`settledCoupon`), never the memo. Building the local and
forgetting to thread it produces a fix that **tests green and changes nothing**, because the path
that looks right (Apply, then Purchase) is the path that was never broken. There is no DOM runner
here; the e2e leg *"minted code TYPED BUT NEVER APPLIED"* in
`e2e/specs/membership/bonus-code-journey.spec.ts` is the only executable proof of that half.

### A stop with no way out — the purchase-requirement gate

**Every stop on this surface must be escapable by pressing the button again.** A code that is
dropped costs a perk; a sale that cannot complete costs the sale, and that is the worse failure.

Moving the resolve to the Purchase click brought *live* codes to the campaign purchase-requirement
gate for the first time. In its first shipped form that gate toasted and returned without recording
anything, so the next press re-read the same state, took the same branch and stopped again —
**forever**, with no second press that worked and no sentence telling the customer to clear the box.
The only escape was guessing. Before the resolve existed, that same customer's code was dropped and
the sale simply completed.

The fix is `evaluatePurchaseRequirementGate` in `typed-code-at-checkout.ts`, shared by both modals.
It takes `previousStop` and returns `allow_without_code` for a pairing it already stopped on,
**before** it looks at the requirement — so no re-arming of state anywhere can resurrect the wall.
The callers also clear `couponApplied` / `couponType` / `campaignPurchaseRequirement` (so
`appliedCouponPayload` cannot re-supply the code from state and the row stops saying APPLIED beside
a code the charge is not carrying), but the escape does not *depend* on those setters landing.

#### The stop is keyed on (code + purchase kind), NOT on the code alone

The gate's own sentence is *"This code is for membership packs only."* The sensible customer does
exactly what that implies — **they switch to a membership tier**, where the code is perfectly valid.
While the stop was remembered in `refusedCodeRef` (by code alone), nothing reset it on a package
change: the next press skipped the resolve, `couponApplied` was false, and the customer was charged
for the membership with their **one-per-lifetime grant silently dropped** and the code still sitting
in the box looking applied. The stop's own copy was what routed them into the loss, which makes it
worse than an inherited bug.

So the two memories are now **separate, because they are different kinds of fact**:

| Memory | Holds | Survives a package switch? |
|---|---|---|
| `refusedCodeRef` | a **definite refusal** — "we don't recognise this", "already redeemed" | **yes.** A fact about the code alone; re-asking would repeat a question already answered |
| `requirementStopRef` | a **requirement stop**, as `{ code, isSubscriptionPurchase }` | **no.** A fact about a *pairing*; the switch is a new question |

Only `refusedCodeRef` suppresses the resolve on the next press. A requirement stop deliberately lets
the resolve re-run, which costs one 8s-capped round trip behind the button's existing `Processing…`
state and is what makes the switch work. The second press **on the same package kind** returns
`allow_without_code`: it buys, and it **drops the code**, because `RedemptionService` enforces
`purchaseRequirement` via `hasQualifyingPurchase` and would refuse it as `ineligible` after the
charge anyway — stamping it would be a promise the sale cannot keep.

Do **not** "simplify" this back to one ref, and do **not** reset it on `activePlan?.id` instead:
that resets definite refusals too, so every package click re-asks a question the customer already
answered.

`MembershipModal` shows both stops through `showToast` **when the code row cannot render them**:
`CouponRow` returns `null` on an upsell offer and swaps its input+error slot out under a valid
promo-link panel, so a message written only to `referralError` is a dead button press.
`showCodeStop(message)` sets `referralError` (it is what `onCouponCodeChange` clears) **and** toasts
when `couponErrorIsVisible` is false. On an upsell the resolve is skipped entirely instead — an
upsell purchase carries no code fields at all, so resolving there could only ever produce a stop
nobody can see or correct. `SpecialPackagesModal` uses its always-rendered `couponError` row. Both
sentences come from the shared helper and both end with what pressing the button again will do.
Pinned by `npm run test:typed-code-checkout` §6/§6b — the assertions that matter are *"press 2 with
the same inputs buys"* and *"the same code, after switching to a membership, is honoured"*.

### Never claim a code applied unless it reached the server

`referralCode` and `promoLinkCode` ride in a **subscription create body and nowhere else**. On a
membership checkout where step-2's mount already pre-warmed the subscription and the customer is not
paying with a saved method, that create call is skipped (`canReuseSubscription`, and the guest
`subscriptionCreatedRef` branch) — so those two codes never leave the browser. That gap is older
than this change and is **not** closed here.

**That gap is now closed** — see *All three code types ride the attach seam* below. What remains is
the rule that outlived it: the success screen's `appendCodeBenefits` prints
`"Referral code MATE-CODE applied"` off `settledCoupon.appliedLabel`, and that label may only exist
for a code that **actually reached the server**. It is therefore settled **last**, by
`settleAppliedLabel()`, from two facts and nothing else:

```
reachedServer = attachedCodeSlot === typedCodeType   // the server said which slot it wrote
             || codeRidesInCreateBody               // the create call in THIS submit carries all three
```

An attach outcome of `unknown` (we stopped listening; the server may well have written it)
deliberately does **not** license the claim. A missing claim costs a line of reassurance; a false one
is a statement about a money-equivalent perk at the moment of purchase.

### All three code types ride the attach seam

`referralCode` and `promoLinkCode` used to ride in a **subscription create body and nowhere else**,
so on the two doors where the pre-warm means that create call is skipped they never left the browser
— *pressing Apply did not rescue them either*. The webhook, however, already reads all three off
Stripe metadata (`stripe-webhook-handlers/index.ts`: `promoLinkCode` from subscription + PaymentIntent
+ invoice, `referralCode` from subscription + invoice + PaymentIntent, `campaignCode` from
subscription + PaymentIntent). So the fix is to widen the **existing, reviewed, metadata-only** attach
seam rather than build a new one:

- The browser sends `code` — the **raw typed string**, with no claim about its kind.
- `attach-typed-code.ts` classifies it server-side in the same order `/api/codes/validate` uses
  (referral → promo → campaign), each leg validated against an identity resolved from the Stripe
  object's **own server-written metadata** (`userId` / `userEmail`), never from the request body.
- It writes the matching key and returns `{ code, slot }`.

That is what keeps the widening safe: **the client gains no new trust, because it never says which
kind of code it typed.** The promo leg is in fact *stricter* than the create routes, which stamp
`promoLinkCode` from the request body with no check at all.

⚠️ **`metadata.typedCodeSlot` is why clearing is still safe.** Three keys are now in play and the
write is desired-state, so without a marker recording which key this seam owns, stamping a campaign
code would wipe the `?promo=` **attribution** `promoLinkCode` that a *different* writer put there at
create time. The seam only ever clears the slot the marker names. An object stamped **before** the
marker existed carries `campaignCode` and no marker, so an absent marker falls back to `"campaign"` —
that fallback is what keeps *"apply A → decline → remove A → retry"* working, and `promoLinkCode` gets
no equivalent fallback on purpose. Pinned by `npm run test:attach-typed-code` §8.

**Still not delivered, and deliberately not claimed:** a pre-warmed object that exists but yields no
possession proof (a sessionStorage blob restored without `subscriptionRequestId`). The code is lost
there, it is logged as such, and `settleAppliedLabel` withholds the claim rather than printing one.

### `refusedCodeRef` must not outlive the code in the box

Both modals' `refusedCodeRef` was cleared *only* from the coupon input's `onChange`. But the box is
also filled programmatically — MembershipModal's prefill listener, the stored-referral autofill and
`handleCouponApply`; SpecialPackagesModal's `initialCouponCode` open effect and its apply handler —
and neither modal's open reset cleared it. So: refuse `EXTRA100` (not held yet), close the modal,
claim the reward, reopen — the same code is re-prefilled *without a keystroke*, the resolve is
skipped as "already refused", and the customer is charged with nothing attached and nothing said.
A refusal is a fact about **one press in one session**, not about the code: clear the ref in each
modal's open reset, in every programmatic `setCouponCode`, and at the top of `handleCouponApply`
(an explicit Apply is a fresh intent that supersedes an earlier purchase-time refusal).

**Where the resolve sits, and why exactly there:** after the re-entry lock
(`checkoutSubmitLockRef` / `specialPackagePurchaseLockRef`) is taken — awaiting a network call with
the button still enabled is a double-charge window — after the tracking block, so InitiateCheckout
and Klaviyo `Started Checkout` still fire on the real click, and before `showLoading`, so a stop for
a bad code does not flash "Processing Purchase" at someone who is not being charged. **Every early
return from that region must release the lock by hand**: the `finally` that clears it belongs to the
try that starts *after* `showLoading`.
