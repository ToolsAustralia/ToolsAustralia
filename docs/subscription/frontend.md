# Subscription — Frontend

## Hooks

All client reads of subscription state go through one of these four hooks. They are the only sanctioned read path — components must not call `/api/memberships` directly.

| Hook | What it returns | Source |
|---|---|---|
| `useStripeSubscription()` | The user's Stripe subscription record (status, `cancel_at_period_end`, `current_period_end`, `pause_collection`). Driven by TanStack Query. | [src/hooks/useStripeSubscription.ts](../../src/hooks/useStripeSubscription.ts) |
| `useMemberships()` | The catalog of available `MembershipPackage` rows (subscription tier choices). | [src/hooks/useMemberships.ts](../../src/hooks/useMemberships.ts) |
| `useActivePackage()` | The user's currently-effective package, accounting for downgrade-preservation (`previousSubscription`). | [src/hooks/useActivePackage.ts](../../src/hooks/useActivePackage.ts) |
| `useMembershipModal()` | Modal controller for the membership upgrade/downgrade/cancel flow. | [src/hooks/useMembershipModal.ts](../../src/hooks/useMembershipModal.ts) |

> _TODO: verify each hook's exact return shape and query-key — pull from source when next refreshing this doc._

## Pages and routes

The user-facing membership UI is split between:

- **`src/app/(site)/my-account/`** — see the [dashboard-account](../dashboard-account/) domain. This is where members see their current plan, renewal date, payment method, cancel button, and downgrade/upgrade entry points.
- **`src/components/payment/`** — see the [payment](../payment/) domain. Hosts the `PaymentElement` integration used during signup and pay-now flows.

There is **no dedicated `(site)/subscription/` route group**. Subscription is exposed *through* `my-account` and the checkout flow.

## State conventions

- **TanStack Query** owns all server-state reads. Don't store subscription data in Zustand.
- **No client-side computation of `isActive`**. Always read `subscription.isActive` from the user object (server-derived). Components computing their own truthy-checks against `subscription.endDate` is a known footgun — see [gotchas.md](./gotchas.md#client-derived-isactive).
- **Optimistic updates are forbidden** for cancellation. The cancel API has multiple side effects (Stripe, Klaviyo, partner queue); the UI must wait for the API result and then invalidate the relevant queries.

## Cancellation UX (admin)

The admin-side cancel flow lives in [src/components/admin/UserDetailModal.tsx](../../src/components/admin/UserDetailModal.tsx) (Subscription tab). The "Cancel Subscription" button is shown when `subscription.isActive === true` **or** `subscription.status === "past_due"`. The modal offers two options (cancel-at-period-end vs immediate); for `past_due` the choice is ignored and immediate is forced.

Mutation hook: `useAdminCancelSubscription` in [src/hooks/queries/useAdminQueries.ts](../../src/hooks/queries/useAdminQueries.ts). It POSTs to `/api/admin/users/[id]/cancel-subscription` and invalidates the user-detail and user-list queries on success.

Full UX details: see [api.md](./api.md#admin-cancel-subscription) and the migrated [ADMIN_CANCEL_SUBSCRIPTION reference](./gotchas.md#admin-cancel-edge-cases).

## Cancellation UX (user)

User-side cancellation runs through `/api/stripe/cancel-subscription` (the same `CancelSubscriptionService` powers it). The UI lives under `my-account` — see [dashboard-account](../dashboard-account/) for the page structure.

The cancel flow is a two-step modal sequence inside `SubscriptionManagementModal`:

1. **`CancelSubscriptionModal`** (`src/components/modals/CancelSubscriptionModal/`) — lightweight "are you sure?" stop-and-confirm. Tier-themed (tradie/foreman/boss) dark hero with a loss grid showing what the user gives up, reversed action buttons (Keep = primary/red on the right, Yes cancel = outline/neutral on the left), and a trust bar footer. Calls `handleCancelSubscription` on confirm.
2. **`CancellationUpsellModal`** — heavy save-modal that opens after cancel succeeds (or when `showCancellationUpsell` is set). Offers downgrade and resubscribe paths.

`CancelSubscriptionModal` accepts `fromPackageName` (drives tier theming + "Keep {name}" label), `accumulatedEntries` (shown in loss grid cell 1), and `billingEndDateLabel` (shown in hero sub-copy). It does **not** display pricing or charge anything — it is purely a confirmation gate.

## StripePaymentModal

`src/components/modals/StripePaymentModal/` (folder/index.tsx pattern) — the "Complete Payment" modal shown during upgrade flows that require a PaymentIntent confirmation. Decomposed in Plan 6 Phase 4 from a 725-LOC monolith.

**Architecture:**
- `index.tsx` — orchestrator; holds all state slices, `useRef` for `activePaymentIntentRef`, and the `handlePaymentSuccess` / `handleProcessingSuccess` callbacks. Delegates to sub-components.
- `Shell.tsx` — modal frame with dark hero, scroll-lock, Escape handler, and entry animation (mirrors RenewalFailedModal/Shell.tsx pattern).
- `OrderSummary.tsx` — gain-framed order summary card using Plan 4 `<Card>` + `<Card.Header>` + `<Card.Body>`. Shows upgrade from/to details and billing cycle info when `upgradeInfo` is provided.
- `PaymentMethodCard.tsx` — saved-card display ("VISA •••• 4242 / Default Payment Method / Change").
- `PaymentForm.tsx` — exports `PaymentFormWithoutElements` (saved card path) and `PaymentFormWithElements` (new card path). All Stripe logic is preserved byte-identically from the original monolith. Uses Plan 4 `<Button>` for action buttons.
- `styles.module.css` — composite hero gradients, scrollbar, pinstripe overlay.

**Stripe preservation invariants:**
1. `stripePromise` is a module-scope singleton in `PaymentForm.tsx` — Stripe prohibits re-instantiation.
2. `<Elements key={clientSecret || "no-secret"}>` re-mount key is required for Stripe correctness.
3. All `useStripe()`, `useElements()`, `stripe.confirmPayment()`, `stripe.confirmCardPayment()` calls are unchanged.
4. Upgrade API call flow (create upgrade payment → get clientSecret → confirm) is preserved.
5. `IMMEDIATE_UPGRADE_NO_PI` sentinel for server-side-only upgrades is preserved.

**Public props interface (unchanged from original):**
```ts
interface StripePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientSecret: string;        // empty string = dynamic creation on submit
  packageName: string;
  packageId: string;
  amount: number;              // in cents
  onPaymentSuccess: (paymentIntentId: string) => void;
  upgradeInfo?: {
    fromPackage: { name: string; price: number };
    toPackage: { name: string; price: number };
    billingInfo?: { currentBillingDate: string; nextBillingDate: string; nextBillingAmount: number; billingDateStays: boolean; };
  };
}
```

Smoke test: `npm run test:stripe-payment`.
