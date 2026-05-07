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

> _TODO: link the specific user-facing component path once dashboard-account docs are written._

## E2E test IDs

The membership E2E specs live under `e2e/membership/*.spec.ts` and consume the testid registry at [e2e/utils/selectors.ts](../../e2e/utils/selectors.ts). New testids added for these specs:

| testid | Component / call site | Purpose |
|---|---|---|
| `membership-modal` | `MembershipModal` `<ModalContainer>` | Identify the join/upgrade modal panel. |
| `cancellation-upsell-modal` | `CancellationUpsellModal` outer wrapper | Identify the retention modal. |
| `cancellation-upsell-accept` / `-decline` | CTA buttons inside `CancellationUpsellModal` | Click redeem vs decline. |
| `renewal-failed-modal` | `RenewalFailedModal` (3 `<ModalContainer>` branches) | Identify the past-due modal in any state. |
| `subscription-explainer-modal` | `SubscriptionExplainerModal` `<ModalContainer>` | Identify the one-time explainer. |
| `package-detail-modal` | `PackageDetailModal` `<ModalContainer>` | Identify the badge-driven detail modal. |
| `special-packages-modal` | `SpecialPackagesModal` `<ModalContainer>` | Identify the member-only catalog modal. |
| `gate-closed-modal` | `GateClosedModal` `<ModalContainer>` | Identify the substituted modal when no draw is active. |
| `confirmation-modal` | `ConfirmationModal` `<ModalContainer>` | Identify the generic confirmation dialog used by upgrade/downgrade/cancel. |
| `confirmation-modal-confirm` / `-cancel` | `ConfirmationModal` action `<Button>`s | Click confirm/cancel deterministically. |
| `package-card-{id}` | `PackageSelectionModal` plan card wrapper | One per plan, e.g. `package-card-tradie-subscription`, `package-card-foreman-subscription`. |
| `subscription-cancel-button` | `SubscriptionManagementModal` Cancel `<Button>` | Trigger cancellation from settings panel. |
| `subscription-resume-button` | `SubscriptionManagementModal` Reactivate `<Button>` | Trigger reactivation. |
| `subscription-upgrade-button-{packageId}` | `SubscriptionManagementModal` upgrade `<button>` | Per-package upgrade trigger; e.g. `subscription-upgrade-button-foreman-subscription`. |
| `subscription-downgrade-button-{packageId}` | `SubscriptionManagementModal` downgrade `<button>` | Per-package downgrade trigger. |
| `subscription-resolve-payment-button` | `SubscriptionManagementModal` past-due alert `<Button>` | Open `RenewalFailedModal` in panel. |

## E2E spec coverage

Specs live under `e2e/membership/`. Each spec pins to a Playwright project (matched in [playwright.config.ts](../../playwright.config.ts)) that loads the per-worker storageState for that role.

| Spec | Project | Status | Notes |
|---|---|---|---|
| `join.spec.ts` | `chromium-fresh` | NARROWED | Asserts MembershipModal opens via "Get More Entries" CTA on dashboard. Full Stripe purchase path skipped (multi-modal chain too brittle). |
| `upgrade.spec.ts` | `chromium-tradie` | NARROWED | Asserts ConfirmationModal opens for Tradie→Foreman upgrade in settings panel. StripePaymentModal flow not driven. |
| `downgrade.spec.ts` | `chromium-foreman` | NARROWED | Asserts ConfirmationModal opens for Foreman→Tradie downgrade. API confirm not driven (would mutate Stripe state on a non-Stripe fixture). |
| `cancel.spec.ts` | `chromium-tradie` | NARROWED | Walks Cancel → ConfirmationModal → Confirm → CancellationUpsellModal → Decline → POST `/api/stripe/cancel-subscription`. Best-effort DB assertion. |
| `cancel-upsell-redeem.spec.ts` | `chromium-tradie` | NARROWED | Walks Cancel → upsell → Redeem; soft-asserts DB if API succeeds. |
| `resume.spec.ts` | `chromium-cancelling` | NARROWED | Asserts Reactivate button is visible/enabled for cancelled fixture. |
| `renewal-failed.spec.ts` | `chromium-pastdue` | PASS-CANDIDATE | RenewalFailedModal auto-opens on dashboard via UnifiedModalManager. |
| `update-payment-method.spec.ts` | `chromium-pastdue` | NARROWED | Asserts "Resolve Payment Issue" button opens RenewalFailedModal in settings panel. |
| `benefits.spec.ts` | `chromium-fresh` | PASS-CANDIDATE | `/my-account/benefits` page renders hero + grid. |
| `package-detail.spec.ts` | `chromium-fresh` | BLOCKED | Badge requires active membership; fresh fixture has none. Rescope to a member project to unblock. |
| `special-packages.spec.ts` | `chromium-fresh` | BLOCKED | Trigger requires additional-package access AND active major draw seeding (UnifiedModalManager substitutes to `gate-closed` otherwise). |
| `explainer-modal.spec.ts` | `chromium-tradie` | BLOCKED | Auto-trigger path has multiple state gates (orchestration cooldown, accumulator data, modal queue) that the fixture seed does not satisfy. Modal does not render in 25s after clearing localStorage + reloading. |

> Note on `chromium-pastdue` testMatch: the pastdue project regex was extended to include `update-payment-method` alongside `renewal-failed`. Other matchers unchanged.

## Upgrade / Downgrade toast specs (added 2026-05-05)

`e2e/toasts/` (project: `chromium-fresh`) covers the two `UpgradeSuccessToast` branches (`src/components/UpgradeSuccessToast.tsx`):

| Spec | Status | Notes |
|---|---|---|
| `upgrade-success.spec.ts` | PASS | Seeds `localStorage.subscription_upgraded` (fresh `timestamp`, packageName, entriesPerMonth) via `addInitScript`, navigates to `/my-account`, asserts `upgrade-success-toast` mounts within 10s and contains the "View Benefits" action button. The toast renders for 25s (longer than the default 8s) per the upgrade UX. |
| `downgrade-scheduled.spec.ts` | PASS | Seeds `localStorage.subscription_downgraded` with currentPackageName="Boss", newPackageName="Foreman", asserts `downgrade-scheduled-toast` mounts and shows both package names. |

Component edits:
- `src/components/ui/Toast.tsx` — added optional `testId?: string` prop on `ToastProps`; rendered as `data-testid={testId}` on the toast root `<div>`.
- `src/components/UpgradeSuccessToast.tsx` — passes `testId: "upgrade-success-toast"` and `testId: "downgrade-scheduled-toast"` to the respective `showToast` calls.

Both specs are localStorage-driven (not subscription-state driven) — the toast component reads localStorage on mount via `useEffect`, so any authenticated session can exercise the assertion. We use `chromium-fresh` because providers.tsx (which mounts the toast) is rendered for every authenticated layout.
