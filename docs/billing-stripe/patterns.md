# Billing-Stripe — Patterns

## P0. Lazy-load Stripe-bearing modals at every callsite (2026-05-10)

Stripe-bearing modals (`MembershipModal`, `StripePaymentModal`, `SubscriptionManagementModal`, `RenewalFailedModal`, `SpecialPackagesModal`, `UpsellModal`, `SavedPaymentMethodsModal`, `PaymentMethodSelector`, `PaymentMethodsTab`) bundle `@stripe/react-stripe-js`, `@stripe/stripe-js`, and the project's payment forms. Statically importing them into a route inflates the route's first-load JS by hundreds of kilobytes that the user only needs once they actually open the modal.

The convention from Phase 5A onwards is: **at every non-modal callsite, import these via `next/dynamic` with `{ ssr: false }`**. Example:

```tsx
import dynamic from "next/dynamic";

const MembershipModal = dynamic(() => import("@/components/modals/MembershipModal"), {
  ssr: false,
});
```

Caveats:
- **Modal-in-modal stays static.** When a modal imports another modal (e.g. `SubscriptionManagementModal` imports `RenewalFailedModal`, `MembershipModal` imports `PaymentMethodSelector`), keep the inner one as a static import. The outer modal is already lazy-loaded, so the inner module still ships in a separate chunk that loads only when the outer opens.
- **Type-only imports for prop extraction.** If a route uses `React.ComponentProps<typeof TheModal>` to extract a prop type, add a sibling `import type TheModalType from "..."` next to the lazy import — `dynamic()` returns a `LoadableComponent` whose props are not directly inspectable. See [src/app/(site)/my-account/components/settings/SubscriptionTab.tsx](../../src/app/(site)/my-account/components/settings/SubscriptionTab.tsx) for the pattern.
- **`UnifiedModalManager` itself.** The manager renders one of seven modals based on the priority store. Phase 5A converted all seven internal imports to `dynamic` so a hydrated landing page does not pay the cost of any of them until the store flips `activeModal`.
- **Page config name collision.** A handful of pages export `export const dynamic = "force-dynamic"` (Next.js segment config). When such a page also needs `import dynamic from "next/dynamic"`, alias the import — `import nextDynamic from "next/dynamic"` — to avoid shadowing the export. Pattern in [src/app/(site)/my-account/benefits/page.tsx](../../src/app/(site)/my-account/benefits/page.tsx).

Affected callsites converted in Phase 5A:
- `MembershipModal`: 7 production callsites (`MajorDrawSection`, `MembershipSection`, `MembershipPageClient`, `my-account/page.tsx`, `my-account/settings/page.tsx`, `my-account/membership/page.tsx`, `my-account/draws/page.tsx`, `my-account/benefits/page.tsx`).
- `SubscriptionManagementModal`: `MembershipStatus`, `SubscriptionTab`.
- `PaymentMethodsTab`: `PaymentTab`.
- All seven `UnifiedModalManager` branches.

The dev modal-gallery (`src/components/dev/ModalsGalleryClient.tsx`) intentionally retains static imports — its purpose is to render every modal for visual review.

## P1. Webhook switch-on-type with named handlers

The webhook's top-level `switch (event.type)` dispatches to a named function per event type — never inline logic. Keeps the router readable; lets each handler have its own test surface.

## P2. Single-source-of-truth ledger

Instead of re-computing what a payment granted at refund time, **record it at grant time**. The `data.grants` field on `BenefitsGranted` is the contract — any new grant type extends `IPaymentGrantLedger` and gets a matching reverser.

When adding a new grant:
1. Extend `IPaymentGrantLedger` ([src/types/payment-ledger.ts](../../src/types/payment-ledger.ts)).
2. Record the grant in `payment-processing.ts` when applying.
3. Add a reverser step in `refund-ledger-reversal.ts`'s `buildLedgerReversalSteps` (or a new `PaymentReverser` module).
4. Document the invariant in [rules.md](./rules.md).

## P3. Stable idempotency keys derived from the resource

Pattern: `${operation-name}-${stable-resource-id}`. Examples used in this codebase:
- `admin-charge-${invoiceId}`
- `cancel-subscription-${subscriptionId}`
- `subscription-create-${userId}-${packageId}`

Never include time, retry counter, or random data.

## P4. Stripe error classification at the call site

Wrap every Stripe SDK call with a thin classifier that returns one of:
- `ok` — subscription/invoice/etc. retrieved
- `is404` — `code === "resource_missing"` or `statusCode === 404`
- `isRetryable` — `code === "rate_limit"`, `statusCode === 429`, `statusCode >= 500`
- `is4xx` — anything else 4xx

Then map to HTTP responses uniformly. The pattern is in `retrieveStripeSubscription()` ([subscription/SubscriptionReferenceService.ts:68-93](../../src/services/subscription/SubscriptionReferenceService.ts#L68-L93)) — apply to other Stripe calls.

**Card declines are a fifth class — and they are THROWN on confirm-time calls.** `paymentIntents.create(confirm: true)` / `invoices.pay` / `subscriptions.update(payment_behavior: "error_if_incomplete")` reject with a `StripeCardError` instead of returning a failed intent. Detect in the catch with [`isStripeCardError()`](../../src/utils/payment/stripe/payment-error-detection.ts) and return the 400 `Payment failed` shape (never a generic 500) — see [api.md → Thrown card declines](./api.md#thrown-card-declines--400-payment-failed) and the matching [gotcha](./gotchas.md#confirm-time-card-declines-are-thrown-by-the-sdk-not-returned-2026-07-16).

## P5. Resume-before-benefits on success

The pattern is: the cleanup that *enables future success* runs before the work that *grants this success*. Specifically `resumeAfterSuccessfulRenewalPayment()` runs before `processPaymentBenefits()` so a benefits failure can't leave Stripe in a paused-collection state.

Generalise: side effects that affect future Stripe behaviour run first; side effects that affect our DB run after.

## P6. Sanitise-before-persist for audit logs

`InvoiceChargeLog.result` stores Stripe API responses. Strip:
- PCI-sensitive card data (PAN, full last4 in some contexts)
- Full PM objects

Keep error codes, ids, amounts, timestamps. Prevents PCI scope expansion of the Mongo collection.

## P7. Time-windowed idempotency via DB index

`InvoiceChargeLog`'s compound unique index `{ invoiceId, attemptedAt-day }` means the database itself rejects duplicate charge attempts within 24 hours. Belt-and-braces with the Stripe idempotency key.

## P8. Auto-correct stale references via webhook

When `invoice.paid` references a different (but manageable) subscription than the user's stored canonical, and the stored one is dead, **adopt the paid one**. See `shouldAdoptPaidSubscriptionOverStored()` ([subscription/SubscriptionReferenceService.ts:211-224](../../src/services/subscription/SubscriptionReferenceService.ts#L211-L224)). The webhook is the ideal place for this — Stripe just confirmed the paid sub is real.

## P9. Single shared service for user + admin paths

User-facing and admin-facing routes that perform the same operation must share a service. Examples:
- `cancelSubscription()` — user route + admin route
- `chargePastDueShared.ts` — single past-due retry + bulk job

The service accepts an `analytics` option (`actor: "user" | "admin"`, `adminUserId?`) so audit rows distinguish the path.

## P10. One-shot idempotency-retry on key collisions

Where a Stripe-mutating call uses a per-attempt UUID as the idempotency key (instead of a stable resource-derived key per [P3](#p3-stable-idempotency-keys-derived-from-the-resource)) and the request body includes any non-deterministic field (capi_*, attribution, IP), wrap the call so that on `StripeIdempotencyError` it:

1. Cancels the orphan incomplete resource on Stripe (matched by `customer + metadata.packageId` for subscriptions).
2. Retries once with a fresh `crypto.randomUUID()` idempotency key.

Reference implementation: [`createSubscriptionWithIdempotencyRetry`](../../src/utils/payment/stripe/createSubscriptionWithIdempotencyRetry.ts) — used by both `/api/stripe/create-subscription` and `/api/stripe/create-subscription-existing-user`. The retry is one-shot only — a second collision is rethrown so it surfaces in error reports rather than looping.

## P11. Every route that can produce a Purchase must stamp the `capi_*` match signals

`trackPixelPurchase` runs **only** from the Stripe webhook, with
`actionSource: "system_generated"`. There is no live request there — no cookies, no headers — so
the visitor's IP, user agent, Meta `fbc`/`fbp` and TikTok `ttclid`/`ttp` can reach the ad
platforms **only** by riding through Stripe metadata:

1. The payment-creating route reads them at request time —
   `{ ...extractRequestContext(request), ...extractTikTokContext(request) }` — and writes
   `capi_client_ip`, `capi_user_agent`, `capi_fbc`, `capi_fbp`, `capi_ttclid`, `capi_ttp`
   into the PaymentIntent/Subscription metadata.
2. The webhook's `extractRequestContextFromMetadata` reads them back into `requestContext`.
3. `trackPixelPurchase` puts them on `userData`, where each provider reads only its own.

**A new payment-creating route that omits this block silently degrades match quality** — no type
error, no runtime error, just a Purchase with no IP, no user agent and no click id. That is
exactly what happened: TikTok reported Purchase IP/UA coverage at **85%** while every other server
event was 100%, traced (2026-07-31) to four routes that never stamped the keys —
`renew-subscription` (its create-new branch mints a fresh subscription whose first invoice is
`subscription_create`, so it *does* fire a Purchase), `create-payment-intent`,
`upgrade-subscription-payment` and `downgrade-subscription`. All four now stamp them.

Two constraints when adding it:
- **Length.** Stripe rejects any metadata **value** over 500 characters and fails the whole API
  call. `event_source_url` is already guarded for this; `?ttclid=` is now length-validated at the
  cookie-mint boundary in middleware for the same reason.
- **Idempotency.** On routes using a per-attempt idempotency key (see [P10](#p10-one-shot-idempotency-retry-on-key-collisions)), added metadata
  applies to new objects only — a replayed key returns the original object with its original
  metadata.

Full write-up: [docs/tracking/TIKTOK_EVENTS_API_IMPLEMENTATION.md](../tracking/TIKTOK_EVENTS_API_IMPLEMENTATION.md).

## Stripe dashboard deep-links

`src/utils/billing/stripeDashboardUrl.ts` builds admin-facing links into the Stripe dashboard.
Added 2026-08-17 for the admin [Receipts](../admin/receipts.md) ledger; reusable by any admin
surface that wants to hand an operator a link to the underlying Stripe object.

**It must be called server-side.** Live-vs-test mode is only inferrable from the
`STRIPE_SECRET_KEY` prefix (`sk_live_` / `sk_test_`), which is a server secret the browser
cannot read — so the URL is built in the service and shipped in the response payload. Do not
rebuild it client-side, and do not introduce a `NEXT_PUBLIC_STRIPE_MODE` var to work around
it. `resolveStripeDashboardMode` fails safe toward `test` when the key is unset or is a
restricted (`rk_…`) key.

⚠️ **The id you pass is polymorphic.** `PaymentEvent.paymentIntentId` holds a real
PaymentIntent (`pi_…`) for one-off payments but a **prefixed invoice id** (`invoice_in_…`)
for subscription renewals — one field, two Stripe object types. Every consumer has to branch
on the prefix:

| Stored id | Link |
|---|---|
| `pi_…` | `…/payments/pi_…` |
| `invoice_in_…` (or bare `in_…`) | `…/invoices/in_…` — the `invoice_` storage prefix is stripped |
| `cus_…` | `…/customers/cus_…` |
| anything else | `null` — never a guessed path |

Test mode inserts `/test` before the object segment.

`src/utils/affiliate/affiliate-attribution.ts` documents the same storage convention for
commission **lookups** (`normalizeStripePaymentIntentKeyForCommission`,
`stripeInvoiceIdLookupVariants`). This helper is deliberately a separate, display-side twin
rather than a reuse of those, so a change to commission lookup keys can never silently
repoint admin links. Covered by `npm run test:receipts`.

## Cursor agent boundary

The Cursor `.cursor/agents/stripe-billing.md` subagent owns this domain. Read its boundary description before non-trivial changes — the orchestrator rule (`.cursor/rules/orchestrator.mdc`) requires QA review for changes touching payments. Cursor-only; not invocable from Claude Code.
