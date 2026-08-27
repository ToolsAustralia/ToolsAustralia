# Payment — Frontend

## Remove card is shown on EVERY saved card, including the default

`SettingsRedesignPayment.tsx` used to render the Remove action only when `!isDefault`. A member whose **only** card is the default therefore had no way to remove it — there was no second row to reveal the action. Reported from production 2026-08-03.

Remove is now always rendered. The safety lives where it belongs, in two independent places:

- **The dialog** picks its warning from `getPaymentMethodDeleteFlowKind` ([`payment-method-delete-flow.ts`](../../src/utils/payment/payment-method-delete-flow.ts)): `simple` (not the billing card) → `billing-reassign` (billing card, others remain — the backend auto-promotes a replacement) → `billing-last` (billing card, nothing left → renewals stop; only this kind requires a consent checkbox).
- **The API** independently refuses to drop a last billing card without `?confirmBillingRisk=1`, returning `409 REQUIRES_BILLING_RISK_CONFIRMATION`, which the tab re-prompts on. UI and API do not trust each other.

**Copy rule:** these messages are capped at 130 characters and must carry no vendor/internal jargon — say what changes and what it costs, nothing more. Members dismiss walls of text, and the consequence *is* the point of the dialog. Guarded by `npm run test:payment-method-delete-flow`.

## Components

| Component | Purpose |
|---|---|
| [src/components/payment/PaymentSuccessHandler.tsx](../../src/components/payment/PaymentSuccessHandler.tsx) | Post-confirmation success UI / redirect logic. Consumed by checkout flows that need a success page after the Payment Element confirms. |
| [src/components/payment/StripeInlineCardSetupForm.tsx](../../src/components/payment/StripeInlineCardSetupForm.tsx) | Inline form for adding a saved card via Setup Intent (no charge). Consumed by `my-account` payment methods management. |

> _TODO: enumerate any additional components added under `src/components/payment/` since this doc was written._

The `<Elements>` provider (Stripe.js root) is loaded by the consumers — typically via `useElementsOptions` or a context provider in the parent route group. The browser SDK loader is at [src/lib/stripe-client.ts](../../src/lib/stripe-client.ts) (in the [billing-stripe](../billing-stripe/) domain).

### `LazyMembershipModal` — the ONLY sanctioned way to mount `MembershipModal`

[`LazyMembershipModal.tsx`](../../src/components/modals/MembershipModal/LazyMembershipModal.tsx) wraps `MembershipModal` (`./index`) in a `next/dynamic({ ssr: false })` load PLUS a render-gate: it renders `null` until the first `isOpen === true`, then keeps the real modal mounted for the rest of the session (so close animation / internal step state behave like the always-mounted original). This exists because `dynamic()` alone is not enough — see [shared-ui/gotchas.md](../shared-ui/gotchas.md) "rendering a `dynamic()` component while closed still downloads its chunk." Without the render-gate, every guest who lands on a page with a `<MembershipModal>` mount point downloaded the ~7k-line payment chunk (Stripe/embla/zoom libs included) whether or not they ever opened it — the 2026-07 perf audit finding that motivated this wrapper.

**Every call site imports `LazyMembershipModal`, never `MembershipModal/index` directly** (the one exception is the dev-only `src/components/dev/ModalsGalleryClient.tsx`, which intentionally always renders the modal gallery). Import it as:

```tsx
import MembershipModal from "@/components/modals/MembershipModal/LazyMembershipModal";
```

— keeping the local name `MembershipModal` so JSX at call sites is unchanged. `MembershipModalProps` is exported from `MembershipModal/index.tsx` and re-used via `import type` in the wrapper (erased at build, does not pull the heavy chunk).

## Hooks

| Hook | Returns | Source |
|---|---|---|
| `usePaymentIntent()` | client_secret + state for a charge-now flow | [src/hooks/usePaymentIntent.ts](../../src/hooks/usePaymentIntent.ts) |
| `useSetupIntent()` | client_secret + state for a save-card flow | [src/hooks/useSetupIntent.ts](../../src/hooks/useSetupIntent.ts) |
| `use3DSRedirectHandler()` | Detects PI/SI id in URL and reconciles status after a 3DS redirect | [src/hooks/use3DSRedirectHandler.ts](../../src/hooks/use3DSRedirectHandler.ts) |
| `useSavedPaymentMethods()` | Lists user's saved methods, supports set-default + delete | [src/hooks/useSavedPaymentMethods.ts](../../src/hooks/useSavedPaymentMethods.ts) |
| `usePaymentStatus(paymentIntentId, options)` | Polls `/api/payment-status/[paymentIntentId]` until `processed === true` or 90s timeout. Returns `PaymentStatusResponse` — see [api.md](./api.md#get-apipayment-statuspaymentintentid--completed-branch-fields). | [src/hooks/queries/usePaymentQueries.ts](../../src/hooks/queries/usePaymentQueries.ts) |

The `PaymentStatusResponse.data` shape on `usePaymentStatus` includes three optional resubscribe-banner fields populated by the route's `loadResubscribeContext()` helper:

```ts
// Resubscribe carry-over context for the success-page banner. Only
// populated on completed payments; `wasRecentResubscribe` is true only if
// the user's `subscription.lastResubscribedAt` is within the route's
// 10-minute banner window (RESUBSCRIBE_BANNER_WINDOW_MS).
wasRecentResubscribe?: boolean;
lastMonthAccumulatedEntries?: number;
entriesGranted?: number;
```

> _TODO: verify each hook's exact API (mutation vs query, query keys, return shape) — pull from source when refreshing._

## State conventions

- **Never store payment-method details in component state** beyond Stripe's PM id. Card data lives in Stripe.
- **TanStack Query** for `useSavedPaymentMethods` and similar reads.
- **No client-side derivation of "is paid"** — wait for the server-side webhook to update state, or call `/api/stripe/verify-payment-complete` after a 3DS redirect.

## Where checkout flows live

This domain provides the *plumbing* (intents, hooks, components). The actual checkout pages live in:
- `src/app/(site)/checkout/**` — main checkout flow ([cart-shop-products](../cart-shop-products/))
- `src/app/(site)/upsell-success/**` — post-cancel upsell ([upsell](../upsell/))
- `src/app/(site)/major-draw/**`, `mini-draws/**` — draw-purchase checkout ([draws](../draws/))
- `src/app/(site)/my-account/**` — saved-payment-method management ([dashboard-account](../dashboard-account/))

## Stripe utilities

| Utility | Purpose |
|---|---|
| [src/utils/payment/stripe/payment-error-detection.ts](../../src/utils/payment/stripe/payment-error-detection.ts) | Classify a Stripe error as recoverable / retryable / non-recoverable; pick a recovery strategy. Also exports `isStripeCardError(error)` — duck-typed check for a *thrown* Stripe card error (`type === "StripeCardError"` \|\| `rawType === "card_error"`), used by `/api/stripe/**` route catch blocks to return the 400 "Payment failed" shape instead of a generic 500 — and `extractPaymentErrorCodes(error)` → `{ code, declineCode }` from any client error shape (raw Stripe error, plain 400 body, ApiError `.data`, axios `.response.data`). The internal `extractResponseBody()` makes `extractErrorMessage` / `extractErrorCode` / `categorizeError` probe ApiError `.data` too (previously only axios `.response.data` was probed, so ApiError decline info was invisible to this pipeline); `categorizeError` also probes `.data` for the `requiresDifferentPaymentMethod` / `failureReason` / `failureCode` flags. |
| [src/utils/payment/stripe/payment-error-messages.ts](../../src/utils/payment/stripe/payment-error-messages.ts) | Map raw Stripe errors to user-friendly title + message for toasts. Hosts the `DECLINE_CODE_GUIDANCE` map (decline_code / card error code → short, direct guidance: 1–2 sentences, one next step) + `getCardDeclineGuidance(declineCode, errorCode)`. `formatPaymentError()` returns decline-specific title/message when the error carries a code/decline_code — unless the errorType is `stripe_excessive_retry` / `invoice_collection_blocked` / setup- or payment-intent recovery, which keep priority. Sensitive codes (`lost_card`, `stolen_card`, `pickup_card`, `fraudulent`) are intentionally NOT mapped — they get the generic "Your card was declined. Try a different card, or contact your bank." per Stripe guidance never to reveal those reasons. Test: `npm run test:decline-guidance`. |
| [src/utils/payment/stripe/is-stripe-noise-error.ts](../../src/utils/payment/stripe/is-stripe-noise-error.ts) | Predicate: `true` when the error is Stripe.js client-side noise — incomplete / invalid card fields, validation errors, wallet (Apple Pay / Google Pay) cancellations / payment_exceptions. Handles both Stripe error objects and bare strings. Used to skip auto-logging these to `ErrorReport`. See [error-reporting gotchas](../error-reporting/gotchas.md#stripejs-client-side-validation-noise). |
| [src/utils/payment/stripe/error-handled-marker.ts](../../src/utils/payment/stripe/error-handled-marker.ts) | `markErrorHandled(err)` / `isErrorHandled(err)` — tags an Error as "already processed by an inner handler" so outer try/catch blocks in `MembershipModal.handleSubmit` (and similar long async functions) can skip a second `handlePaymentError` call. Prevents duplicate toasts and duplicate auto-log attempts. |
| [src/utils/payment/stripe/setup-intent-recovery.ts](../../src/utils/payment/stripe/setup-intent-recovery.ts) | Recover from `setup_intent_unexpected_state` (already-succeeded SI). |
| [src/utils/payment/stripe/payment-intent-recovery.ts](../../src/utils/payment/stripe/payment-intent-recovery.ts) | Recover from `payment_intent_unexpected_state`. |

## `typed-code-at-checkout.ts` — resolving a code the customer never applied

`src/utils/payment/typed-code-at-checkout.ts` is a **client-side** module (no mongoose, no models,
no Stripe) shared by `MembershipModal` and `SpecialPackagesModal`. Both call it from inside their
submit handlers so that **pressing Purchase means the same thing as pressing Apply first**.

```ts
const resolution = await resolveTypedCodeAtCheckout({ code, inviteeUserId, inviteeEmail });
// -> { status: "none" }
//  | { status: "resolved", code, type: "referral" | "promo" | "campaign", referrerName?, purchaseRequirement? }
//  | { status: "refused", code, message }
//  | { status: "inconclusive", code, reason: "timeout" | "network" | "http" | "shape" }
```

- It POSTs the same `/api/codes/validate` with `preferType: "auto"`, so the existing three-way
  classification is preserved — this is **not** "attach a campaign code".
- `TYPED_CODE_RESOLVE_TIMEOUT_MS` is **8 000 ms**, hard-capped with an `AbortController`. Sized on
  what that endpoint does (rate-limit check → `connectDB()` → a few reads, **no Stripe round
  trips**), which is why it gets 8s where `attachTypedCode` needs 15s. It is spent behind the
  submit button's existing `Processing…` state, and it is **skipped entirely** when the box is empty
  or already applied — so the added latency exists only for the customer the fix is for.
- `typedCodeRefusalCopy(resolution, ctaLabel)` assembles the customer-facing line: the problem, then
  the escape (*"press Purchase again"* / *"tap Buy Now again"* — the surface's real button label).
  The refusal sentences are the **server's own**, selected by the machine-readable `reason` on the
  response, never by comparing display strings.

- `evaluatePurchaseRequirementGate({ campaignCode, purchaseRequirement, isSubscriptionPurchase,
  ctaLabel, previousStop })` → `{ outcome: "allow" }` | `{ outcome: "allow_without_code" }` |
  `{ outcome: "stop", stop, message }`. A campaign can be configured
  `purchaseRequirement: "membership"` or `"one-time"`; the code is genuine and simply aimed at a
  different kind of purchase. `"none"` / `"any"` / absent never stop a sale, and neither does a
  `campaignCode` of `undefined`.

  **`previousStop` is the load-bearing argument, and it is a PAIRING —
  `{ code, isSubscriptionPurchase }`, not a bare code.** Pass the surface's `requirementStopRef` and
  the helper returns `allow_without_code` for a pairing it already stopped this customer on, so the
  stop obeys the same contract every other stop in this design has: **asked once, at zero cost, and
  the second press always buys.** Keying it on the pairing is equally load-bearing in the other
  direction: the stop's own copy tells the customer the code is *for memberships*, so switching to a
  membership must **re-arm** the gate and honour the code rather than treat it as already refused.
  That escape is deliberately *structural* rather than a consequence of the caller clearing the right
  React state in the right order; see gotchas → *"A stop with no way out"* for the shipped bug this
  shape exists to prevent, and the table there for why a definite refusal (`refusedCodeRef`) is a
  different kind of memory. Both modals call this one helper so the decision and the sentence cannot
  drift apart again.

Rule 11 applies to every string it produces and is asserted in
`npm run test:typed-code-checkout`.

See `docs/payment/gotchas.md` → *"The Apply button was a gate"* for the outcome table, the
429/500 trap, and the closure-capture trap.
