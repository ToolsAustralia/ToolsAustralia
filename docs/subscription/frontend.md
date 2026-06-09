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
- `PaymentMethodCard.tsx` — saved-card display ("VISA •••• 4242 / Default Payment Method / Change").
- `PaymentForm.tsx` — exports `PaymentFormWithoutElements` (saved card path) and `PaymentFormWithElements` (new card path). All Stripe logic is preserved byte-identically from the original monolith. Uses Plan 4 `<Button>` for action buttons.
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
