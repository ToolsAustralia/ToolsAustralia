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

**Locked state:** `locked = !hasAccessToAdditionalPackages && !!plan.isAdditional` — same gate as before, now expressed as a prop rather than conditional button markup.

---

## Hooks

All client reads of subscription state go through one of these four hooks. They are the only sanctioned read path — components must not call `/api/memberships` directly.

| Hook | What it returns | Source |
|---|---|---|
| `useStripeSubscription()` | The user's Stripe subscription record (status, `cancel_at_period_end`, `current_period_end`, `pause_collection`). Driven by TanStack Query. Its create-flow helpers (`createSubscription`, `createOneTimePurchase`, `createSubscriptionExistingUser`) attach the full non-success API body to the thrown error's `.data` (ApiError shape) so `formatPaymentError` can show per-decline-code guidance (`decline_code`, `requiresDifferentPaymentMethod`); `createOneTimePurchase` re-throws on failure (previously swallowed the error and returned `null`, which made MembershipModal show a generic "Failed to create account" for guest one-time card declines). | [src/hooks/useStripeSubscription.ts](../../src/hooks/useStripeSubscription.ts) |
| `useMemberships()` | The catalog of available `MembershipPackage` rows (subscription tier choices). | [src/hooks/useMemberships.ts](../../src/hooks/useMemberships.ts) |
| `useActivePackage()` | The user's currently-effective package, accounting for downgrade-preservation (`previousSubscription`). | [src/hooks/useActivePackage.ts](../../src/hooks/useActivePackage.ts) |
| `useMembershipModal()` | Modal controller for the membership upgrade/downgrade/cancel flow. | [src/hooks/useMembershipModal.ts](../../src/hooks/useMembershipModal.ts) |

> _TODO: verify each hook's exact return shape and query-key — pull from source when next refreshing this doc._

### `useMembershipCardCta` — `includeAdditionalForMembers`

[`src/hooks/useMembershipCardCta.ts`](../../src/hooks/useMembershipCardCta.ts) accepts an optional options object:

```ts
useMembershipCardCta({ includeAdditionalForMembers?: boolean })
```

`includeAdditionalForMembers` defaults to `false`. All other callers (the `/membership` page, `MembershipSection`, and the 15+ remaining consumers) pass no argument and are **unchanged** in behaviour.

When `true` AND the user has additional-package access (`hasAdditionalAccess`), the one-time drawer surfaces `isAdditional` packs — the same "Additional" packs `MembershipSection` shows to eligible members. The sole caller passing `true` is the my-account membership page ([`src/app/(site)/my-account/membership/page.tsx`](../../src/app/(site)/my-account/membership/page.tsx)). (The flag was originally added for the promo packages-design A/B treatment; that experiment concluded in 2026-07 — control won, the treatment was removed — but the flag was kept for the my-account page.)

The source-selection logic is factored into a pure helper:

```ts
selectOneTimeDrawerPackages(packages, { hasAdditionalAccess, includeAdditional })
// src/utils/membership/additional-package-mapping.ts
```

This helper is **only** called when `includeAdditionalForMembers` is `true`; the default path is unaffected. Test: `npm run test:one-time-drawer-packages`.

### `?packages=` URL param — pre-select the packages tab (2026-07-03)

Ad landings can open the membership section on a chosen tab via a URL query param, e.g.
`/promotions/makita?packages=one-time`. Used so a one-time-focused ad creative opens the section on the
One-Time tab. The param is parsed by a single shared helper,
[`src/utils/membership/packagesTabParam.ts`](../../src/utils/membership/packagesTabParam.ts):

- `MEMBERSHIP_PACKAGES_QUERY_PARAM = "packages"` — the query key.
- `parseMembershipPackagesTab(raw)` → `"membership" | "one-time" | null`. Invalid/absent → `null`, so the
  caller falls back to its normal (user-state) default. The default (`membership`) is expressed by
  **omitting** the param, keeping organic URLs clean (mirrors the `?toolbox=` convention).

On promotions pages the `activeTab` owner is **`MembershipSection`**, which reads the param and guards
its override effect — documented in [shared-ui/frontend.md](../shared-ui/frontend.md). (During the 2026-07
packages-design A/B test, `useMembershipCardCta` also took a `forcedTab` option so the promo treatment
could honour the param; the experiment concluded — control won — and the option was removed with the
treatment. `/membership` (`MembershipPageClient`) never passed it, so it still seeds `activeTab` purely
from user state.)

The param only sets the **initial** tab — the visitor can still toggle manually afterwards.

**Rewards-return arrival (2026-07-24):** `/membership` is the permanent redirect target for iGoDirect's
MyRewards portal blocked-offer state (`?utm_source=partner_portal&utm_medium=referral&utm_campaign=rewards-return`,
optionally `&offer_id=` / `&offer_name=` / `&level=` when the vendor templates them). `page.tsx` parses
these **server-side** (Next 15 async `searchParams`) via `resolvePortalReturn` in
`src/utils/partner-discounts/portal-return.ts` (panel-fix F-003 — the offers map is dependency-injected
so the client-shared util never imports the server-only 1,833-row module; tested via
`npm run test:portal-return`), resolves `offer_id` against the committed partner
catalogue (`src/generated/partnerCatalogOffers.ts` — server-only import stays in page.tsx; URL params
are untrusted display strings), and passes a compact `portalReturn` prop into `MembershipPageClient`, which renders
`MembershipPortalReturnBanner` above the hero (states + copy: see shared-ui/frontend.md). Normal visitors
(no params) see an unchanged page. `MembershipPageClient` also now wires `useMembershipModalDeepLink`
(`?openMembership=1&packageId=`) — **gated via `useMajorDrawPurchaseGate`, Klaviyo-free** per the hook's
contract (the link arrives from the abandoned-checkout email; re-firing Started Checkout would pollute
the flow). This closes the long-standing gap where those emails targeted `/membership` but only
`MembershipSection` pages had the listener.

## Pages and routes

The user-facing membership UI is split between:

- **`src/app/(site)/my-account/`** — see the [dashboard-account](../dashboard-account/) domain. This is where members see their current plan, renewal date, payment method, cancel button, and downgrade/upgrade entry points.
- **`src/components/payment/`** — see the [payment](../payment/) domain. Hosts the `PaymentElement` integration used during signup and pay-now flows.

There is **no dedicated `(site)/subscription/` route group**. Subscription is exposed *through* `my-account` and the checkout flow.

## State conventions

- **TanStack Query** owns all server-state reads. Don't store subscription data in Zustand.
- **No client-side computation of `isActive`**. Always read `subscription.isActive` from the user object (server-derived). Components computing their own truthy-checks against `subscription.endDate` is a known footgun — see [gotchas.md](./gotchas.md#client-derived-isactive).
- **Optimistic updates are forbidden** for cancellation. The cancel API has multiple side effects (Stripe, Klaviyo, partner queue); the UI must wait for the API result and then invalidate the relevant queries.

## `UpgradeSuccessToast` — the post-reload upgrade/downgrade confirmation

[src/components/UpgradeSuccessToast.tsx](../../src/components/UpgradeSuccessToast.tsx) is mounted
globally in `providers.tsx`. Upgrade and downgrade flows write a `subscription_upgraded` /
`subscription_downgraded` breadcrumb to `localStorage` and then reload; on the next mount this
component reads the breadcrumb, shows the benefit-detail toast, clears the key, and refreshes the
caches the new tier affects.

**Cache refresh contract.** It invalidates `queryKeys.users.all` (the bare `["users"]` prefix,
which therefore covers `detail` + `account` + `dashboard`) and `queryKeys.majorDraw.all`, then
force-refetches major-draw stats on a delay because the webhook needs time to finish the
`majorDraw.entries` aggregation.

**There is deliberately no benefits invalidation.** Until 2026-08-03 this component also
invalidated a hand-typed `["subscription-benefits"]` key. That key matched **no registered
query** — nothing in the app ever registers it — so the call was a silent no-op that read as
coverage. It was removed rather than repointed: `SubscriptionManagementModal` fetches
`/api/subscription/benefits` directly into component state, so there is no query key to
invalidate. If benefits ever move into TanStack Query, add the real key here.

The general trap is in [client-state](../client-state/) — a hand-typed key that drifts from the
factory does not error, it just silently stops invalidating. Import from `queryKeys`; never
re-type a key literal.

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

## Resubscribe tier picker (Phase 1, 2026-05-20)

Cancelled users (`subscription.status === "canceled"`) no longer see a single "Reactivate" CTA in `SubscriptionManagementModal`. They see a **tier-picker grid** rendered by [`ResubscribeTierPicker.tsx`](../../src/components/modals/SubscriptionManagementModal/ResubscribeTierPicker.tsx), letting them pick *any* tier on the way back (not just their previous one).

**Three exports from `ResubscribeTierPicker.tsx`:**

| Export | Purpose |
|---|---|
| `ResubscribeTierOption` (interface) | `{ packageId, name, price, entriesPerMonth }` — minimal shape consumed by the picker. |
| `ResubscribeTierPicker` | The grid itself: carry-over header + one card per tier. Each card shows tier name (with a `(previously)` badge when `packageId === previousPackageId`), monthly price, **sign-up grant** computed as `entriesPerMonth × promoMultiplier` (with a `{N}× promo` badge when `promoMultiplier > 1`), the **carry-over** count, and the **projected next-renewal total** (`lastMonthAccumulatedEntries + grant + entriesPerMonth`). |
| `ResubscribeEmptyState` | Wraps the picker in the styled empty-state card (gradient bg, border). Rendered as the cancelled-state body when packages are available. |
| `ResubscribeEmptyStateFallback` | Legacy single-CTA fallback ("Reactivate Subscription" button) shown when no packages are loaded. |

**Branching in `InactiveSubscriptionState`** ([`EmptyStates.tsx`](../../src/components/modals/SubscriptionManagementModal/EmptyStates.tsx)) — _superseded by Phase 2 (2026-05-21); see "Inactive-state simplification" below for the current branching rules._

- ~~`status === "canceled"` + `packages.length > 0` + `onPickTier` → `ResubscribeEmptyState` (tier picker).~~
- ~~`status === "canceled"` without packages → `ResubscribeEmptyStateFallback` (legacy CTA).~~
- ~~Other inactive statuses → unchanged legacy "Subscription Inactive" card.~~ (Legacy card removed in Phase 2.)

**Parent wiring** ([`SubscriptionManagementModal/index.tsx`](../../src/components/modals/SubscriptionManagementModal/index.tsx)):

- `resubscribePackages` — built from `subscriptionPackages` (same source `UpgradeList` / `DowngradeList` use), filtered to entries with a numeric `entriesPerMonth`.
- `previousPackageId` — resolved from `user.subscription?.packageId` (string or `{ _id }` shape).
- `lastMonthAccumulated` — `user.subscription.lastMonthAccumulatedEntries ?? 0`.
- `handlePickResubscribeTier(packageId)` → `handleSubscribeClick(packageId)`.
- `handleSubscribeClick(packageId?)` was extended to optionally pre-select a plan: when a `packageId` is passed it finds the matching `subscriptionPackages` entry and calls `membershipModal.openModal(convertToLocalPlan(apiPlan))` instead of `openModalWithPackageSelectionFirst()`. Confirmation in `MembershipModal` is one extra click — matches existing modal flow patterns.

These five props (`packages`, `previousPackageId`, `promoMultiplier`, `lastMonthAccumulatedEntries`, `onPickTier`) are passed to **both** render sites of `InactiveSubscriptionState`: the direct render inside `legacyStateBody`, and through [`SettingsRedesignSubscription`](../../src/components/modals/SubscriptionManagementModal/SettingsRedesignSubscription.tsx) (which threads them down to its embedded `<InactiveSubscriptionState>`). The settings-redesign body therefore renders the same tier picker for cancelled users.

**Math is unchanged.** The picker UI only *displays* a preview of `entriesPerMonth × promoMultiplier`. The actual sign-up grant + carry-over preservation is still handled server-side by `calculateResubscribeEntries` (`src/utils/payment/subscription-entries-calculator.ts`) on `invoice.payment_succeeded` — see [docs/SUBSCRIPTION_RESUBSCRIBE_ENTRIES.md](../SUBSCRIPTION_RESUBSCRIBE_ENTRIES.md) for the resubscribe detection (metadata `isResubscribe: "true"`) and entry math.

The reference spec is [`docs/superpowers/specs/2026-05-20-resubscribe-tier-choice-ux-design.md`](../superpowers/specs/2026-05-20-resubscribe-tier-choice-ux-design.md).

### Visual refresh — `ResubscribeTierCard` (Phase 1, 2026-05-21)

The picker's inline soft-pastel `<button>` mapping was replaced with a dedicated card component, [`ResubscribeTierCard.tsx`](../../src/components/modals/SubscriptionManagementModal/ResubscribeTierCard.tsx), that visually mirrors `ElectricPackageCard` (tier-gradient background via `getMembershipSectionColorScheme`, package icon via `getPackageIcon`, bundled multiplier badge via `PromoBadgeImage`, and a glowing big sign-up-grant number with `textShadow` driven by `scheme.accentHex`).

**Card prop surface:**

```ts
interface ResubscribeTierCardProps {
  plan: ResubscribeTierOption;            // packageId, name, price, entriesPerMonth
  promoMultiplier: number;                // active promo multiplier; >1 → bundled badge
  lastMonthAccumulatedEntries: number;    // carry-over count, shown in body
  isPrevious: boolean;                    // appends "(previously)" label next to tier name
  theme?: "light" | "dark";               // defaults to "dark"
  onSelect: (packageId: string) => void;
}
```

**Picker rendering** ([`ResubscribeTierPicker.tsx`](../../src/components/modals/SubscriptionManagementModal/ResubscribeTierPicker.tsx)) now maps each entry in `packages` to one `<ResubscribeTierCard>` inside a `grid-cols-1 sm:grid-cols-2 gap-3` grid — no inline tier markup remains.

**Two-state subheader copy** (driven by `lastMonthAccumulatedEntries > 0`):

- Has accumulated → `"You have N accumulated entries."`
- No accumulated → `"Pick a tier to come back."`

**Per-card copy refresh.** The previous per-row "Your carry-over: N" wording is replaced with **"Accumulated entries: N"**. The "Sign-up grant: N" and "Next renewal: N" lines are retained. Underlying entry math (display-only `entriesPerMonth × promoMultiplier`, `lastMonthAccumulatedEntries + grant + entriesPerMonth`) is unchanged.

Reference spec: [`docs/superpowers/specs/2026-05-21-dashboard-tier-picker-polish-design.md`](../superpowers/specs/2026-05-21-dashboard-tier-picker-polish-design.md) — Phase 1.

### Inactive-state simplification — universal picker (Phase 2, 2026-05-21)

The legacy yellow "Subscription Inactive" CTA card (with the `AlertTriangle` icon and "Reactivate Subscription" button) has been deleted from [`EmptyStates.tsx`](../../src/components/modals/SubscriptionManagementModal/EmptyStates.tsx). `InactiveSubscriptionState` no longer branches on `subscription.status` — every non-active state (`canceled`, `unpaid`, `incomplete`, `incomplete_expired`, never-subscribed) now renders the tier picker via `ResubscribeEmptyState` whenever `packages.length > 0` and `onPickTier` is provided. The only remaining branch is the defensive `ResubscribeEmptyStateFallback` (legacy single CTA) used when no packages are loaded.

**Past-due is intentionally excluded.** Past-due users must continue to route through the failed-renewal recovery flow upstream — `InactiveSubscriptionState` is never reached for them. This guard is **caller responsibility**: the direct render inside `legacyStateBody` in [`SubscriptionManagementModal/index.tsx`](../../src/components/modals/SubscriptionManagementModal/index.tsx) and the [`SettingsRedesignSubscription`](../../src/components/modals/SubscriptionManagementModal/SettingsRedesignSubscription.tsx) wrapper both filter past-due before mounting this component.

**One-time-only users also route through the picker.** The legacy `OneTimeOnlyState` empty state (green-gradient "You have an active one-time package: …" card with a "Subscribe to Membership Packages" CTA) has been deleted from `EmptyStates.tsx`. Both call sites now collapse the `activeOneTimePackage` branch into the same `InactiveSubscriptionState` render as the cancelled/inactive branch — the `status` prop falls back to `"none"` when `user.subscription` is undefined (never-subscribed one-time buyers). The picker's `showCancelledFooter={Boolean(previousPackageId)}` gate keeps the cancelled-framing copy off for these users.

**Cancelled-footer gating.** `ResubscribeEmptyState` now accepts an optional `showCancelledFooter?: boolean` (default `true`) which hides the "Your subscription was cancelled. Pick any tier to come back — your entries history is preserved." footer when `false`. `InactiveSubscriptionState` passes `showCancelledFooter={Boolean(previousPackageId)}` so the cancelled framing only renders for users with subscription history — never-subscribed users picking a tier for the first time don't see that copy.

**Picker subheader.** Still context-aware (driven by `lastMonthAccumulatedEntries > 0`):
- Has accumulated → `"You have N accumulated entries."`
- No accumulated → `"Pick a tier to come back."`

Reference spec: [`docs/superpowers/specs/2026-05-21-dashboard-tier-picker-polish-design.md`](../superpowers/specs/2026-05-21-dashboard-tier-picker-polish-design.md) — Phase 2 (§7 Inactive-state simplification).

#### Never-subscribed copy fix (2026-05-21)

[`ResubscribeTierPicker.tsx`](../../src/components/modals/SubscriptionManagementModal/ResubscribeTierPicker.tsx) now discriminates a never-subscribed user from a returning one via `hasPreviousMembership = Boolean(previousPackageId)`. The picker header/subheader collapses to three states:

- Has accumulated entries → header `"Welcome back — pick a tier"`, subheader `"You have N accumulated entries."`.
- Past member, 0 accumulated → header `"Welcome back — pick a tier"`, subheader `"Pick a tier to come back."`.
- Never subscribed (no `previousPackageId`) → header `"Pick a tier to get started"`, **no subheader**.

This pairs with the Phase 2 universal-picker change: one-time-only and never-subscribed users now reach the same picker but no longer see returning-user framing. The `ResubscribeEmptyState` cancelled-footer gate (`showCancelledFooter={Boolean(previousPackageId)}`) remains the other half of this guard.

### Active-member hero — "Next renewal entries" tile (Phase 3, 2026-05-21)

The active-member "Current plan" hero in [`SettingsRedesignSubscription.tsx`](../../src/components/modals/SubscriptionManagementModal/SettingsRedesignSubscription.tsx) now renders a third fact tile in the `grid-cols-2` block alongside `Started` and `Next billing` (or `Subscription ends` / `Failed on`): **`Next renewal entries: N`**. The value mirrors `calculateRenewalEntries` ([`src/utils/payment/subscription-entries-calculator.ts`](../../src/utils/payment/subscription-entries-calculator.ts)) — computed inline as `(user.subscription.lastMonthAccumulatedEntries ?? baseEntries) + baseEntries`, where `baseEntries` is the package's `entriesPerMonth` (with the same `metadata.entriesCount` / `metadata.originalEntries` / `15` fallback chain used by the plan-benefits text).

The tile is **hidden** when `baseEntries` is missing or `0` (the inline computation evaluates `nextRenewalEntries` to `null` and the JSX skips the tile).

`past_due` users still see the tile — the past-due gate (`hasFailed`) only swaps the second tile's label to `"Failed on"` and adds the `PastDueAlert`; it does not affect the projection. The projection is useful while payment is failing because it reflects what they would receive once recovered.

Math is unchanged — no new endpoint, no schema change. Display-only.

Reference spec: [`docs/superpowers/specs/2026-05-21-dashboard-tier-picker-polish-design.md`](../superpowers/specs/2026-05-21-dashboard-tier-picker-polish-design.md) — Phase 3 (§5).

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

> **Past-due resolve — shared state machine, two presentations (2026-07-03):** the past-due renewal-recovery
> logic (retry / 3DS / add-card-then-retry / force-charge-overdue) lives in **`usePastDueResolve`**
> ([src/components/modals/RenewalFailedModal/usePastDueResolve.ts](../../src/components/modals/RenewalFailedModal/usePastDueResolve.ts)),
> so the money path is single-sourced. Two consumers render it: **`RenewalFailedModal`** (the legacy modal,
> via `Shell`, used by `SubscriptionManagementModal`) and **`PastDueResolvePanel`** (sheet-native — no
> `Shell` hero / backdrop / "Close" button / "close this modal" copy) which the dashboard **Payment sheet**
> renders for past-due members. `ActionButtons` gained `hideDismiss` (the sheet drops the Close button +
> footer since the sheet owns dismiss). This replaced an earlier, wrong approach that *embedded the whole
> modal* (dark hero + Close) inside the sheet. Verify the modal path with `npm run test:renewal-failed`.

> **Upgrade flow — consistent benefit cells across both steps (2026-07-06):** `StripePaymentModal`'s
> `UpgradeBenefitsPreview` used to render a **hardcoded** per-tier cell set (`tierBenefitCells`: entries 100/40/15
> baked in, a stale unused partner %) that disagreed with the confirm step (`UpgradeConfirmModal`). Both now
> render the shared **`UpgradeBenefitStatGrid`** (see [shared-ui/frontend.md](../shared-ui/frontend.md)) fed from
> **canonical** data — `StripePaymentModal` derives the destination-tier partner % via
> `getPartnerCatalogAccessPercentForPlanId(\`${tier}-subscription\`)` and entries via
> `getPackageById(...).entriesPerMonth`, so the payment step's cells match the confirm step's exactly (Boss
> 100%/100, Foreman 75%/40, Tradie 50%/15). The recurring price stays in the `OrderSummary`, not a stat cell.
> Verified: `npm run test:upgrade-confirm` + `npm run test:stripe-payment`.

> **RenewalFailedModal hero redesign — benefit-led, amber, less text (2026-07-06):** the `Shell` hero was
> rebuilt from the dark red-glow + uppercase-acumin banner to a **light, tone-tinted header** (amber past-due /
> emerald success) with a sentence-case Poppins headline. `Shell` gained an optional **`heroAside`** slot; the
> clean past-due resolve state passes a **`PartnerHoldRing`** — the member's subscription-tier partner-catalog %
> (50 / 75 / 100, from `usePastDueResolve.restorablePartnerPct`) drawn with `AccessRing`, a lock, and "Paused" —
> so the modal leads with the **paused member benefit**, not just "renewal failed". Copy trimmed to eyebrow +
> one headline ("Reactivate to restore your benefits") + one line. The redundant **"Close" text button + footer
> were removed** (the ✕ dismisses — the modal now passes `hideDismiss` to `ActionButtons`). `data-rf-accent` /
> the CSS-module dark-hero classes (`heroBg`, `heroStripeOverlay`, tone-glow) are no longer used. The sheet
> (`PastDueResolvePanel`) keeps its amber `PanelHead`.

> **Resolve flow is amber, note uses the dashboard stat chip (2026-07-06):** the past-due resolve flow is
> **amber**, not red — `ActionButtons`' `primary`/`outline` variants + the loading spinner were recolored to
> amber (`from-[#f59e0b] to-[#d97706]`) so "Resolve payment issue" matches the amber past-due language (PanelHead,
> hero "Manage membership", the ribbon); red stays reserved for draw urgency / "get entries". And
> `RenewalPreviewNote` now renders the **same amber "free entries" stat chip** as the dashboard `EntryWallet`
> past-due note (the countdown-CDBox recipe — see [shared-ui/frontend.md](../shared-ui/frontend.md)) instead of the
> old Sparkles-tile inline note, so the resolve sheet/popup and the dashboard read as one design. _Note: the
> `RenewalFailedModal` Shell hero still uses the red `tone="danger"` glow — the sheet (PastDueResolvePanel) uses
> the amber PanelHead, so it's fully amber; the modal hero is the one remaining red past-due surface._

> **Renewal preview note — "Settle $X → +N free entries" (2026-07-06):** both resolve surfaces render
> **`RenewalPreviewNote`** ([RenewalFailedModal/RenewalPreviewNote.tsx](../../src/components/modals/RenewalFailedModal/RenewalPreviewNote.tsx))
> in the **initial** resolve state only (gated `!terminalCollectionFailure && !showInlineCardSetup`), so a
> past-due member sees what they pay and the entries that land when it clears. `usePastDueResolve` exposes
> `renewalPreview` computed via **`getPastDueRenewalPreview(user)`**
> ([src/utils/subscription/past-due-renewal-preview.ts](../../src/utils/subscription/past-due-renewal-preview.ts)),
> which reuses the CANONICAL `getRenewalEntriesPreviewForProfile` (same source as the Klaviyo
> `past_due_renewal_entries` property + the renewal-failure email) for entries, and the **same** package's
> `.price` for cost — so the popup, the sheet, the dashboard `EntryWallet` note, the email, and Klaviyo all
> show one consistent number. The dashboard mirror is driven by `dash.pastDueRenewalEntries` /
> `dash.pastDueRenewalCost` from `useDashboardState` (see docs/dashboard-account).
- `PaymentMethodCard.tsx` — saved-card display ("VISA •••• 4242 / Default Payment Method / Change").
- `PaymentForm.tsx` — exports `PaymentFormWithoutElements` (saved card path) and `PaymentFormWithElements` (new card path). Stripe confirm logic is preserved from the original monolith. Uses Plan 4 `<Button>` for action buttons. **Error handling (2026-07-16):** in both submit paths, a non-OK response from `POST /api/stripe/upgrade-subscription-payment` throws an `Error` carrying the parsed response body on `.data` (ApiError shape), and both `catch` blocks toast via `formatPaymentError(err)` ([src/utils/payment/stripe/payment-error-messages.ts](../../src/utils/payment/stripe/payment-error-messages.ts)) instead of the old hard-coded "Payment Failed" title + raw `err.message`. Since the route returns `400 { error: "Payment failed", details, code, decline_code }` for confirm-time card declines (instead of a generic 500), the member sees concise decline-specific guidance (e.g. "Not enough funds on this card. Try another card.").
- `styles.module.css` — composite hero gradients, scrollbar, pinstripe overlay.

**Stripe preservation invariants:**
1. `stripePromise` is a module-scope singleton in `PaymentForm.tsx` — Stripe prohibits re-instantiation.
2. The `<Elements>` re-mount key is `` `${clientSecret || "no-secret"}-${isDarkMode ? "dark" : "light"}` ``. The clientSecret-based remount (required for Stripe correctness) is preserved; the theme suffix is what forces a fresh mount when the user toggles dark/light so the appearance rebuilds (see the 2026-06-09 note below).
3. All `useStripe()`, `useElements()`, `stripe.confirmPayment()`, `stripe.confirmCardPayment()` calls are unchanged.
4. Upgrade API call flow (create upgrade payment → get clientSecret → confirm) is preserved.
5. `IMMEDIATE_UPGRADE_NO_PI` sentinel for server-side-only upgrades is preserved.

**Stripe Elements appearance (2026-06-09).** The `<Elements options.appearance>` was switched from a hardcoded light, green-accent, 14px object to the shared `buildMembershipStripeAppearance(isDarkMode)` builder (`src/utils/payment/stripe/membership-stripe-appearance.ts`), matching `PaymentMethodSelector`. Effect: card inputs are now **16px** (prevents iOS focus auto-zoom), **dark-mode aware** (no more white card box in dark mode), and use the **brand-red** accent. `isDarkMode` is read from `useThemeStore((s) => s.theme === "dark")` and the appearance is memoised on it. The `<Elements>` key now carries the theme suffix (invariant #2) so a toggle remounts and rebuilds.

> **Caveat — theme source.** This modal sources `isDarkMode` from `useThemeStore`, but the [gotchas.md RenewalFailedModal note](./gotchas.md#renewalfailedmodal-dark-mode-was-half-done-dark-bg-dark-text) warns that `useThemeStore.theme` can disagree with the actual `.dark` class on `<html>` (which `useHtmlDarkForUi()` reads) — the store defaults to `"light"` while the `<html>` class can be dark via the `layout.tsx` bootstrap / Sydney-night fallback / AdminThemeContext. If this modal can mount while those disagree, the Stripe iframe could render light inside a dark-classed shell. _TODO: verify with the team whether `StripePaymentModal` should switch to `useHtmlDarkForUi()` for parity with `RenewalFailedModal`._

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

## Public `/membership` page (2026-06 redesign)

The public page ([`src/app/(site)/membership/components/MembershipPageClient.tsx`](../../src/app/(site)/membership/components/MembershipPageClient.tsx)) is a 10-section marketing layout (light-first, three dark "beats") composed from [`src/components/sections/membership/`](../../src/components/sections/membership/): Hero → TrustStrip → BrandShowcase → HowItWorks → **TierChooser** → EntriesStack → DrawCycle → PrizeChooser → WinnersWall → FinalCta. `page.tsx` stays a thin server shell. (BrandShowcase is now **just** the partner-brand marquee + "become a member" CTA; the one-time packs it used to host moved into TierChooser — see below.)

- **It never purchases directly.** The conversion section (`MembershipTierChooser`) renders prototype tier cards (subscriptions) and, beneath them, a collapsible "Not subscribing?" block of one-time pack cards ([`MembershipOneTimePacks.tsx`](../../src/components/sections/membership/MembershipOneTimePacks.tsx)). Both call a single `onSelect(plan)` into [`useMembershipCardCta`](../../src/hooks/useMembershipCardCta.ts). That hook ports `MembershipSection`'s exact CTA state machine — label (`Enter Now` / `Current Plan` / `Upgrade/Downgrade to …` / `Update payment`), lock (`!hasAdditionalAccess && isAdditional`), routing (past_due / existing-subscriber → `/my-account`; guest / new sub / one-time → `MembershipModal.openModal(plan)`), all wrapped in `whenGatesOpenElseGateModal` — plus the authed-only Klaviyo "Started Checkout" event. `MembershipSection` is **untouched** and still used by 15+ other pages; the new page just doesn't render it. (The two intentionally mirror logic; could be unified into the hook later.)
- **Partner access % footgun:** a subscription `LocalMembershipPlan.id` is the bare tier name (`"tradie"`), so `getPartnerCatalogAccessPercentForPlanId(plan.id)` falls through to the one-time ladder (40/55/70). Pass `` `${tier}-subscription` `` to get the subscription % (50/75/100). One-time pack ids (`"apprentice-pack"`) resolve correctly as-is.
- **Catalogue-driven:** brand surfaces (BrandShowcase, the portal-phone deals) read counts/slices from `PARTNER_BRAND_OFFERS` + `getPartnerCatalogVisibleSliceLength`, never a hardcoded count, so 7 → 1,000+ brands needs no rework.
- **Real data, gaps handled:** tiers/entries/price via `useMemberships` (+ promo via `useResolvedMultiplier`); winners via `useMajorDrawWinners` (shows **state** not suburb, monogram fallback when `imageUrl` absent, qualitative "Verified draw" badge); prize via `usePrizeCatalog` (`prizeValueLabel` is a string, images are `gallery[].src`; "+$5k"/"27th"/"1,000+" are copy). Climb math lives in [`src/utils/membership/climb-series.ts`](../../src/utils/membership/climb-series.ts) (test: `npm run test:climb-series`).
- **Flagged for deletion (not deleted):** see [`REDESIGN-DELETION-FLAGS.md`](./REDESIGN-DELETION-FLAGS.md).
- **Visual fidelity (2026-06-29):** cards use the prototype's exact glossy fills via [`src/utils/membership/tier-visuals.ts`](../../src/utils/membership/tier-visuals.ts) (`glossGrad`/`inkOn`/`shade`). Hero is the dark `bhero` with a fanned glossy deck. Tier cards bounce the entries number on scroll-in (`entries-bounce` keyframe in globals.css).
- **One-time packs — collapsible cross-sell (2026-06-30):** the **public** one-time ladder (Apprentice→VIP, `!isAdditional` — `oneTimePlans` is always the public set; the "Additional" packs are a my-account concept) lives in [`MembershipOneTimePacks.tsx`](../../src/components/sections/membership/MembershipOneTimePacks.tsx), rendered **collapsed by default** beneath the three subscription tiers inside `MembershipTierChooser`. The reveal uses a `grid-rows-[0fr→1fr]` + opacity transition; the inner wrapper is `overflow-hidden` only while collapsed (an `onTransitionEnd` frees it to `overflow-visible` once open so the pack cards' hover-lift and glow shadows aren't clipped). The VIP pack keeps its premium black-and-gold crown + metallic-gold name + `vip-sheen` shimmer. The **collapsed toggle is a premium drawer-handle** that previews the catalogue with mini glossy pack-chips (same recipe as the real cards) + live boost badge + glossy chevron disc — see the `MembershipOneTimePacks` entry in [docs/shared-ui/ui-primitives.md](../shared-ui/ui-primitives.md) for the full anatomy.
- **Promo-multiplier badge (2026-06-30):** the boost art is the `/images/badge/X{n}.webp` set, resolved via `multiplierBadgeSrc(promo)` in `tier-visuals.ts` (known set 2/3/5/10/12/15/20 → text-pill `{n}×` fallback for any other admin multiplier, so an arbitrary value never 404s). On **tier cards** it is **absolutely positioned** in the top-right of the entries column over a fixed-height header zone (anchored to grow upward, paired with the `was {base}` strikethrough), so its size is **independent of the card height** — bumping the badge never reflows the big — sometimes 4-digit — entries number. On **one-time pack cards** it is likewise absolutely positioned top-right. Both render only when `promoMultiplier > 1` — membership boost is the `membership-packages` multiplier (currently ×10), one-time is the separate `one-time-packages` multiplier (currently ×5); when a type's promo is off, no badge shows.
- **`useOpenMembershipModalListener` (2026-07-01):** shared hook ([`src/hooks/useOpenMembershipModalListener.ts`](../../src/hooks/useOpenMembershipModalListener.ts)) that subscribes a package section's `MembershipModal` to the global `openMembershipModal` event dispatched by the hero / entry CTAs, with the major-draw purchase gate applied **inside** the hook. Any section that owns a MembershipModal — `MembershipSection` today, plus any future section — opts in with one line (`useOpenMembershipModalListener((plan) => openModal(plan))`), so the hero "Enter Now" contract can't be forgotten by a new section. See [promo/gotchas.md](../promo/gotchas.md) for the incident this fixed.

## 2026-07-20 — Tier-2 perf: Poppins codemod

`RenewalFailedModal` (index / Shell / PastDueResolvePanel) was touched by the sitewide
`font-['[Poppins]']` → `font-poppins` codemod (`npm run sweep:font-poppins`): its
Poppins-classed text now renders **real Poppins** instead of a browser fallback — an intended
presentation-only change (no billing/subscription logic changed). Details:
docs/shared-ui/tailwind-conventions.md §10.

## `useMembershipCardCta` — where an existing subscriber is sent (2026-07-31)

`onSelect(plan)` does not always open the purchase modal. Two branches bounce instead, and
**both used to land on the bare `/my-account` dashboard** — a page with no plan controls on it
since the 2026-07 revamp moved management to `/my-account/membership`. So an existing
subscriber tapping **Foreman** on `/membership` was silently dropped somewhere they could not
upgrade from, while the rewards-return banner's "Unlock with Foreman" — the *same intent* —
opened the manage sheet correctly. Reported by the owner 2026-07-31.

Both branches now carry their destination sheet:

| Member state | Tap | Goes to |
|---|---|---|
| Active subscriber, tier is an upgrade / downgrade / current | subscription tier | `/my-account/membership?open=subscription` → **Manage** sheet |
| Past due, blocking sub | subscription tier | `/my-account/membership?open=payment` → **Payment** sheet |
| Past due | one-time / Additional pack | purchase modal (unchanged — a standalone purchase, not a second subscription) |
| Everyone else | any | purchase modal (unchanged) |

The `?open=subscription\|payment` deep link is handled by
[`my-account/membership/page-client.tsx`](../../src/app/(site)/my-account/membership/page-client.tsx),
which mirrors the dashboard's existing handler and reuses its **exact** param vocabulary —
there is no second spelling for this. It cleans the URL after opening.

**Every "manage my plan" hand-off now shares that one destination**: this hook, the
rewards-return banner, the header package-detail modal, and the payment-failure toast in
MembershipModal. If you add a fifth, point it at `/my-account/membership`, not the dashboard.
Full before/after table: [dashboard-account/frontend.md](../dashboard-account/frontend.md).

## `convertToLocalPlan` carries the catalog id (2026-08-21)

[`membership-adapters.ts`](../../src/utils/membership/membership-adapters.ts) now writes
`metadata.packageId = apiPlan._id` alongside `metadata.entriesCount`.

`LocalMembershipPlan.id` is **not a lookup key** — it is derived from the package *name*
(`"Tradie"` → `"tradie"`, `"Additional Tradie Pack"` → `"additional-tradie-pack-member"`). Two
consequences bit at once:

- `getPackageById("tradie")` is `undefined` — it matches on `_id` exactly.
- `getPartnerCatalogAccessPercentForPlanId("tradie")` returns **40** (the one-time Tradie pack), not
  50 (the Tradie subscription), because its tier rules are id-substring matches and a bare
  `"tradie"` misses the `l.includes("subscription")` branch.

So a surface that resolves package data from `plan.id` silently shows one tier's numbers under
another tier's name. Anything needing real catalog data must go through `metadata.packageId`; fall
back to `plan.id` only for plans built outside this adapter (upsells), where the id *is* the record
id. First consumer: the package-inclusions comparison table —
[shared-ui/frontend.md](../shared-ui/frontend.md).
