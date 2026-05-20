# Subscription — Frontend

## MembershipSection card rendering

`src/components/sections/MembershipSection.tsx` now renders `ElectricPackageCard` (from `src/components/sections/membership/`) for every plan card in both the mobile (`lg:hidden`) and desktop (`hidden lg:block`) branches. The old inline card markup is fully removed.

**Color source:** membership tab → `getMembershipSectionColorScheme(plan.id, true)`; one-time tab → `getElectricPackageColorScheme(plan.id)`. The previous A/B `getPackageColorSchemeForPromo` per-card color override is dropped; variant hide/reorder/highlight logic in the `membershipPlans` build is intact.

**Theme:** `theme={isDark ? "dark" : "light"}` driven by `useHtmlDarkForUi()`. Dark = electric dark background; light = branded vivid card background.

**CTA text:** computed in the section map callback and passed as `ctaLabel` to the card. The mapping is:
- `"Update payment"` — blocking subscription (`hasBlockingSub`) + `past_due` + subscription-type plan
- `"Current Plan"` / `"Upgrade to …"` / `"Downgrade to …"` — active subscription on membership tab, based on `getPlanHierarchy`
- `"Enter Now"` — default (new subscription, one-time tab, non-blocking states)

**Promo multiplier badge:** rendered internally by `ElectricPackageCard`; the section no longer renders its own badge overlay. No double-badge.

**Locked state:** `locked = !hasAccessToAdditionalPackages && !!plan.isMemberOnly` — same gate as before, now expressed as a prop rather than conditional button markup.

---

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
2. **`CancellationFlowModal`** (`src/components/modals/CancellationFlowModal/`) — the multi-step save flow that opens after cancel succeeds (or when `showCancellationUpsell` is set). Reason-routed offers plus a universal +100-entries rung; replaced the removed single-screen `CancellationUpsellModal` (Phase 5 Task 19). See [cancellation-flow](./cancellation-flow.md).

`CancelSubscriptionModal` accepts `fromPackageName` (drives tier theming + "Keep {name}" label), `accumulatedEntries` (shown in loss grid cell 1), and `billingEndDateLabel` (shown in hero sub-copy). It does **not** display pricing or charge anything — it is purely a confirmation gate.

## Upgrade preview parity with the webhook (Phase 2, 2026-05-20)

The upgrade-modal preview numbers must match what the webhook will eventually grant — the calculator behind both is `calculateUpgradeEntries` ([src/utils/payment/subscription-entries-calculator.ts](../../src/utils/payment/subscription-entries-calculator.ts)), which has two modes (see [rules.md → R3a](./rules.md#r3a-upgrade-entries-stack-lastmonthaccumulated-unless-a-membership-grant-already-landed-this-draw) and [backend.md → calculateUpgradeEntries — two modes](./backend.md#calculateupgradeentries--two-modes)).

The flag that selects Mode A vs Mode B is `hasMembershipGrantInCurrentDrawPeriod`. It's served to the client as `user.hasCurrentDrawMembershipGrant` by `GET /api/users/[id]/my-account` (see [dashboard-account/api.md](../dashboard-account/api.md#get-apiusersidmy-account)). All four upgrade-preview call sites read it and pass it as the 4th argument to `calculateUpgradeEntries`:

| Call site | File |
|---|---|
| Per-row preview in the upgrade list | [`UpgradeList.tsx`](../../src/components/modals/SubscriptionManagementModal/UpgradeList.tsx) |
| `upgradeModalData` memo | [`SubscriptionManagementModal/index.tsx`](../../src/components/modals/SubscriptionManagementModal/index.tsx) |
| Pending-change banner — upgrade branch | [`SubscriptionManagementModal/index.tsx`](../../src/components/modals/SubscriptionManagementModal/index.tsx) |
| `totalEntriesAfterUpgrade` block | [`SubscriptionManagementModal/index.tsx`](../../src/components/modals/SubscriptionManagementModal/index.tsx) |

**Stale-payload caveat.** The flag is captured on the my-account fetch; if a renewal lands between page load and the user clicking "Upgrade," the preview can drift by one mode (Mode A shown when the webhook will pick Mode B, or vice versa). The webhook is always the source of truth — refreshing the dashboard re-fetches the flag and brings the preview back in line.

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

## SpecialPackagesModal — PackagesGrid

[`src/components/modals/SpecialPackagesModal/PackagesGrid.tsx`](../../src/components/modals/SpecialPackagesModal/PackagesGrid.tsx) renders the list of one-time packages inside the special packages modal. Each row is a 3-column grid: package name left, entries center, price+select right.

- **Price display:** regular (struck) price stacks on top of the discounted price in a vertical `flex-col items-end` span — struck regular price shown first (small, `text-white/40 line-through`), discounted price below (bold, accent-coloured).
- **Entries display:** when `pkg.isPromoActive && pkg.originalEntries !== pkg.totalEntries`, a struck `originalEntries` line is shown on top of the boosted `totalEntries` count (mirrors the price stacking pattern).
- **Best Value badge:** the `BestValueBadge` for one-time best-value plans is rendered at `scale-[0.6] origin-top-left` via the `className` prop, shrinking the corner ribbon ~40% and anchoring it tightly to the top-left corner of the card.
