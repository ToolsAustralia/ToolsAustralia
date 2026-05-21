# Resubscribe Tier Choice + Carry-Over Surfacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let cancelled users pick any membership tier (not just "Reactivate same tier") at resubscribe time, and surface their carried-over `lastMonthAccumulatedEntries` clearly on the success page and the activity card so returning members don't think their history was lost.

**Architecture:** UI-only. The backend already accepts any `packageId` at resubscribe and the math (`calculateResubscribeEntries`) already preserves the accumulator correctly. We swap the single "Reactivate" CTA for a tier picker, add a `lastResubscribedAt` timestamp on `User.subscription` (the only schema change), write it at the resubscribe API site, and read it in two display surfaces (success banner + activity-card sub-line).

**Tech Stack:** React 19, Next.js App Router, Tailwind, Mongoose. No new backend endpoints; existing `POST /api/stripe/create-subscription-existing-user` handles the resubscribe flow.

**Reference spec:** [docs/superpowers/specs/2026-05-20-resubscribe-tier-choice-ux-design.md](docs/superpowers/specs/2026-05-20-resubscribe-tier-choice-ux-design.md)

**Phase ordering note:** The spec lists schema add under Phase 3; this plan brings it forward into Phase 2 because the success banner depends on it. The actual work is the same — only the ordering changes.

---

## Phase 1 — Cancelled-user tier picker

### Task 1: Create `ResubscribeTierPicker` component

**Files:**
- Create: `src/components/modals/SubscriptionManagementModal/ResubscribeTierPicker.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/modals/SubscriptionManagementModal/ResubscribeTierPicker.tsx`:

```tsx
"use client";

import React from "react";
import { CreditCard } from "lucide-react";
import { Button } from "../../ui";
import { getMembershipSectionColorScheme } from "@/utils/package-colors/packageColorScheme";

export interface ResubscribeTierOption {
  packageId: string;
  name: string;
  price: number;
  entriesPerMonth: number;
}

interface ResubscribeTierPickerProps {
  packages: ResubscribeTierOption[];
  previousPackageId?: string;
  promoMultiplier: number;
  lastMonthAccumulatedEntries: number;
  onPickTier: (packageId: string) => void;
}

export const ResubscribeTierPicker: React.FC<ResubscribeTierPickerProps> = ({
  packages,
  previousPackageId,
  promoMultiplier,
  lastMonthAccumulatedEntries,
  onPickTier,
}) => {
  const promoActive = promoMultiplier > 1;
  return (
    <div className="py-2">
      <div className="text-center mb-6">
        <div className="w-14 h-14 mx-auto mb-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-md">
          <CreditCard className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Welcome back — pick a tier</h2>
        <p className="text-sm text-gray-600 dark:text-neutral-300">
          Your <strong>{lastMonthAccumulatedEntries.toLocaleString()}</strong> accumulated entries carry over.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {packages.map((pkg) => {
          const scheme = getMembershipSectionColorScheme(pkg.packageId);
          const grant = pkg.entriesPerMonth * promoMultiplier;
          const nextRenewal = lastMonthAccumulatedEntries + grant + pkg.entriesPerMonth;
          const isPrevious = previousPackageId === pkg.packageId;
          return (
            <button
              key={pkg.packageId}
              type="button"
              onClick={() => onPickTier(pkg.packageId)}
              className={[
                "text-left rounded-xl border p-4 transition-all hover:shadow-md",
                "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700",
                scheme.ring ?? "",
              ].join(" ")}
            >
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {pkg.name}
                  {isPrevious && (
                    <span className="ml-2 text-xs font-normal text-gray-500 dark:text-neutral-400">
                      (previously)
                    </span>
                  )}
                </h3>
                <span className="text-sm font-medium text-gray-700 dark:text-neutral-300">
                  ${pkg.price}/mo
                </span>
              </div>
              <div className="text-xs text-gray-600 dark:text-neutral-400 space-y-0.5">
                <div>
                  Sign-up grant: <strong>{grant.toLocaleString()}</strong>
                  {promoActive && (
                    <span className="ml-1 inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                      {promoMultiplier}× promo
                    </span>
                  )}
                </div>
                <div>
                  Your carry-over: <strong>{lastMonthAccumulatedEntries.toLocaleString()}</strong>
                </div>
                <div className="pt-1 text-gray-700 dark:text-neutral-300">
                  Next renewal: <strong>{nextRenewal.toLocaleString()}</strong>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

interface ResubscribeEmptyStateProps {
  packages: ResubscribeTierOption[];
  previousPackageId?: string;
  promoMultiplier: number;
  lastMonthAccumulatedEntries: number;
  onPickTier: (packageId: string) => void;
}

/**
 * Empty-state shell shown in place of `InactiveSubscriptionState` when
 * `status === "canceled"` and we want the tier-picker UX.
 */
export const ResubscribeEmptyState: React.FC<ResubscribeEmptyStateProps> = (props) => (
  <div className="py-4">
    <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-neutral-800 dark:to-neutral-900 rounded-xl p-4 sm:p-6 border border-gray-200 dark:border-neutral-700 shadow-sm">
      <ResubscribeTierPicker {...props} />
      <p className="text-xs text-center text-gray-500 dark:text-neutral-400 mt-4">
        Your subscription was cancelled. Pick any tier to come back — your entries history is preserved.
      </p>
    </div>
  </div>
);

/**
 * Fallback: no membership packages loaded (rare). Use the legacy CTA.
 */
export const ResubscribeEmptyStateFallback: React.FC<{ onSubscribeClick: () => void }> = ({ onSubscribeClick }) => (
  <div className="text-center py-8">
    <p className="text-gray-600 dark:text-neutral-300 mb-4">
      Your subscription was cancelled. Reactivate to come back.
    </p>
    <Button onClick={onSubscribeClick} variant="primary">
      Reactivate Subscription
    </Button>
  </div>
);
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: 0 errors.

### Task 2: Wire the picker into `EmptyStates.tsx`

**Files:**
- Modify: `src/components/modals/SubscriptionManagementModal/EmptyStates.tsx`
- Modify: `src/components/modals/SubscriptionManagementModal/index.tsx` (the call site for `InactiveSubscriptionState`)

- [ ] **Step 1: Update `EmptyStates.tsx` to accept the picker props**

Open `src/components/modals/SubscriptionManagementModal/EmptyStates.tsx`. Replace the `InactiveSubscriptionStateProps` interface and the `InactiveSubscriptionState` component (lines 41-73) with:

```tsx
import {
  ResubscribeEmptyState,
  ResubscribeEmptyStateFallback,
  type ResubscribeTierOption,
} from "./ResubscribeTierPicker";

interface InactiveSubscriptionStateProps {
  status: NonNullable<SubMgmtUser["subscription"]>["status"];
  onSubscribeClick: () => void;
  // New optional props for the resubscribe tier picker. If absent (e.g.
  // status !== "canceled" or no packages loaded), fall back to the legacy CTA.
  packages?: ResubscribeTierOption[];
  previousPackageId?: string;
  promoMultiplier?: number;
  lastMonthAccumulatedEntries?: number;
  onPickTier?: (packageId: string) => void;
}

/**
 * Empty-state card shown when the user has a subscription record but it
 * is inactive and not past_due. For cancelled users with packages available,
 * renders a tier picker; otherwise keeps the legacy "Reactivate" CTA.
 */
export const InactiveSubscriptionState: React.FC<InactiveSubscriptionStateProps> = ({
  status,
  onSubscribeClick,
  packages,
  previousPackageId,
  promoMultiplier,
  lastMonthAccumulatedEntries,
  onPickTier,
}) => {
  if (status === "canceled" && packages && packages.length > 0 && onPickTier) {
    return (
      <ResubscribeEmptyState
        packages={packages}
        previousPackageId={previousPackageId}
        promoMultiplier={promoMultiplier ?? 1}
        lastMonthAccumulatedEntries={lastMonthAccumulatedEntries ?? 0}
        onPickTier={onPickTier}
      />
    );
  }

  if (status === "canceled") {
    return <ResubscribeEmptyStateFallback onSubscribeClick={onSubscribeClick} />;
  }

  return (
    <div className="text-center py-8">
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-neutral-800 dark:to-neutral-900 rounded-xl p-6 sm:p-8 border border-gray-200 dark:border-neutral-700 shadow-sm">
        <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-full flex items-center justify-center shadow-lg">
          <AlertTriangle className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Subscription Inactive</h2>
        <p className="text-gray-600 dark:text-neutral-300 mb-6">Your subscription is currently inactive.</p>
        <Button
          onClick={onSubscribeClick}
          variant="primary"
          className="bg-gradient-to-r from-red-600 to-red-400 hover:from-red-675 hover:to-red-650 shadow-md hover:shadow-lg transition-all"
        >
          Subscribe to Membership Packages
        </Button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Wire the picker props in `index.tsx`**

Open `src/components/modals/SubscriptionManagementModal/index.tsx`. Find the `<InactiveSubscriptionState ...>` render site (search for `InactiveSubscriptionState`). Currently it passes only `status` and `onSubscribeClick`. Extend with the picker props.

Locate where the modal already has the list of membership packages (the existing upgrade/downgrade flows use this — search for `membershipPackages` or `useMemberships`). Build a `ResubscribeTierOption[]` from the active packages and pass them in. Example (adapt names to whatever the modal already uses):

```tsx
const resubscribePackages: ResubscribeTierOption[] = (membershipPackages ?? [])
  .filter((p) => p.isActive && typeof p.entriesPerMonth === "number")
  .map((p) => ({
    packageId: p._id,
    name: p.name,
    price: p.price,
    entriesPerMonth: p.entriesPerMonth!,
  }));

const lastMonthAccumulated = (user.subscription as { lastMonthAccumulatedEntries?: number } | undefined)
  ?.lastMonthAccumulatedEntries ?? 0;

const previousPackageId = user.subscription?.packageId;

const handlePickResubscribeTier = (packageId: string) => {
  // Reuse the existing subscribe flow (whatever onSubscribeClick currently
  // routes to). If a direct API call is preferable, replace this with the
  // POST /api/stripe/create-subscription-existing-user invocation already
  // used elsewhere in this modal.
  onSubscribeClick(packageId); // pass the chosen tier through
};
```

Then in the JSX:

```tsx
<InactiveSubscriptionState
  status={user.subscription.status}
  onSubscribeClick={() => onSubscribeClick(undefined)}
  packages={resubscribePackages}
  previousPackageId={previousPackageId}
  promoMultiplier={membershipPromoMultiplier}
  lastMonthAccumulatedEntries={lastMonthAccumulated}
  onPickTier={handlePickResubscribeTier}
/>
```

If `onSubscribeClick` currently has no `packageId` parameter, extend its signature to `(packageId?: string) => void` and have the consumer route the chosen `packageId` into the existing subscribe flow.

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: 0 errors.

### Task 3: Manual dev verification

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Log in as a cancelled user**

In a browser, log in as a test user whose `subscription.status === "canceled"` and whose `lastMonthAccumulatedEntries > 0`. (Seed via admin tools or directly in the dev DB if needed.)

Open the Subscription Management modal.

Expected: instead of the single "Reactivate" CTA, a grid of tier cards appears. Each card shows: name, price, sign-up grant (with promo badge when active), carry-over count, and projected next renewal.

- [ ] **Step 3: Pick a different tier than the previous one**

Click one of the tier cards that is *not* the user's previous tier.

Expected: the subscribe flow proceeds (Stripe payment sheet or saved payment method confirmation). On success, the user lands on `/purchase-success` and the new subscription is created at the chosen tier.

- [ ] **Step 4: Verify carry-over math in the dev DB**

Inspect the updated `User` document. Expected:

- `subscription.packageId` = chosen tier
- `subscription.lastMonthAccumulatedEntries` = previous accumulated + (chosen tier's `entriesPerMonth` × current promo multiplier)

If wrong, the issue is in `calculateResubscribeEntries` (which this plan does not touch) — verify the existing `isResubscribeForMetadata` flag at [create-subscription-existing-user/route.ts:238](src/app/api/stripe/create-subscription-existing-user/route.ts#L238) is correctly true.

### Task 4: Update documentation

**Files:**
- Modify: `docs/subscription/` doc(s) describing the subscription management modal UX.

- [ ] **Step 1: Identify the doc**

Run `npm run lint` and check the doc-sync hook output for the file that covers `SubscriptionManagementModal`. If not auto-flagged, browse `docs/subscription/`.

- [ ] **Step 2: Update the doc**

Note that the cancelled-user flow now renders `ResubscribeTierPicker` and accepts a `packageId` choice. Reference `docs/SUBSCRIPTION_RESUBSCRIBE_ENTRIES.md` for the math (unchanged).

### Task 5: Commit Phase 1

- [ ] **Step 1: Verify clean tree**

Run: `git status`. Expected files:
- `src/components/modals/SubscriptionManagementModal/ResubscribeTierPicker.tsx` (new)
- `src/components/modals/SubscriptionManagementModal/EmptyStates.tsx`
- `src/components/modals/SubscriptionManagementModal/index.tsx`
- `docs/subscription/...`

- [ ] **Step 2: Stage and commit**

⚠️ **Authorization gate:** the no-auto-commit hook blocks unless the user said `commit` / `push` / `merge` / `ship it` etc. this session. Pause and ask if needed.

```bash
git add src/components/modals/SubscriptionManagementModal/ResubscribeTierPicker.tsx \
        src/components/modals/SubscriptionManagementModal/EmptyStates.tsx \
        src/components/modals/SubscriptionManagementModal/index.tsx \
        docs/subscription
git commit -m "feat(subscription): tier-picker UX for cancelled users at resubscribe

Cancelled users can now choose any membership tier instead of being
restricted to reactivating their previous tier. Backend already accepted
any packageId; this exposes that capability in the modal.

Spec: docs/superpowers/specs/2026-05-20-resubscribe-tier-choice-ux-design.md"
```

---

## Phase 2 — `lastResubscribedAt` field + success-page carry-over banner

This phase adds the single schema field used by both the success banner (here) and the activity-tab card (Phase 3). Bringing it forward from spec Phase 3 because Phase 2 depends on it.

### Task 6: Add `lastResubscribedAt` to the User model

**Files:**
- Modify: `src/models/User.ts:60-80` (the `subscription` interface block) and `:480-531` (the schema definition for `subscription`).

- [ ] **Step 1: Update the interface**

Open `src/models/User.ts`. Find the `subscription?:` interface block (around line 40-79). Inside the object, alongside `lastUpgradeDate` (around line 73) and `lastMonthAccumulatedEntries` (around line 78), add:

```ts
    // Timestamp of the most recent resubscribe event (when the user reactivated
    // after a cancellation). Drives the carry-over banner on the success page
    // and the activity-card sub-line. Optional — only set on resubscribe.
    lastResubscribedAt?: Date;
```

- [ ] **Step 2: Update the schema**

In the same file, find the `subscription` schema definition. Alongside `lastDowngradeDate` and `lastUpgradeDate` (around lines 512-521), add:

```ts
      // Timestamp of most recent resubscribe — see interface comment.
      lastResubscribedAt: {
        type: Date,
        required: false,
      },
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: 0 errors.

### Task 7: Set `lastResubscribedAt` at the resubscribe API site

**Files:**
- Modify: `src/app/api/stripe/create-subscription-existing-user/route.ts:237-242` (the `isResubscribeForMetadata` block — extend the user-save logic).

- [ ] **Step 1: Set the field when resubscribe is detected**

Open `src/app/api/stripe/create-subscription-existing-user/route.ts`. Find the existing block (around line 238):

```ts
    const isResubscribeForMetadata =
      existingUser.subscription &&
      !existingUser.subscription.isActive &&
      existingUser.subscription.lastMonthAccumulatedEntries !== undefined;
```

Locate the *later* block in this same file that saves the user with the new subscription data (search for the `existingUser.save()` call that persists the new subscription — there is typically one after the Stripe subscription is created and the user document is updated). Just before that save call, when `isResubscribeForMetadata` was true, set the timestamp:

```ts
    if (isResubscribeForMetadata && existingUser.subscription) {
      existingUser.subscription.lastResubscribedAt = new Date();
      existingUser.markModified("subscription");
    }
```

Place this immediately above the subsequent `await existingUser.save()` that persists the resubscribe state.

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: 0 errors.

### Task 8: Surface `wasRecentResubscribe` to the success page

**Files:**
- Modify: `src/app/api/payment-status/[id]/route.ts` (the response shape — add the boolean).
- Modify: `src/hooks/queries/usePaymentQueries.ts` (the typed response — add the field).

- [ ] **Step 1: Locate the payment-status route**

Open `src/app/api/payment-status/[id]/route.ts`. Identify how it loads the user. The route already has access to either the user or the subscription state.

- [ ] **Step 2: Compute and return `wasRecentResubscribe`**

In the JSON response object, add:

```ts
    wasRecentResubscribe: user?.subscription?.lastResubscribedAt
      ? (Date.now() - new Date(user.subscription.lastResubscribedAt).getTime()) < 10 * 60 * 1000
      : false,
```

(10-minute window so the banner only shows for the *just-completed* resubscribe, not historic ones.)

- [ ] **Step 3: Extend the typed response**

Open `src/hooks/queries/usePaymentQueries.ts` (search for `PaymentStatusResponse`). Add `wasRecentResubscribe?: boolean` to the relevant interface — the same level as `processed` and `data`.

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: 0 errors.

### Task 9: Render the carry-over banner

**Files:**
- Modify: `src/app/(site)/purchase-success/components/PurchaseSuccessClient.tsx`

- [ ] **Step 1: Read the new flag and the relevant numbers**

Open `src/app/(site)/purchase-success/components/PurchaseSuccessClient.tsx`. Near the top of the component (right after the existing `usePaymentStatus` call), add:

```tsx
  const wasResubscribe = status?.wasRecentResubscribe === true;
  // Numbers shown in the banner come from the payment-status response.
  // `status.data.lastMonthAccumulatedEntries` is the *new* accumulator value
  // (post-resubscribe). `status.data.entriesGranted` is what just landed on
  // the current draw. `previousAccumulated = newAccum − entriesGranted`.
  // Add these to PaymentStatusResponse / the route in Step 3 below if not
  // already present.
  const newAccum = status?.data?.lastMonthAccumulatedEntries ?? 0;
  const thisGrant = status?.data?.entriesGranted ?? 0;
  const previousAccum = Math.max(0, newAccum - thisGrant);
```

- [ ] **Step 2: Render the banner**

Inside the existing render block, immediately after the `<div className="text-center mb-8">...</div>` header section, add:

```tsx
        {wasResubscribe && (
          <div className="bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-900/20 dark:to-blue-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-5 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              👋 Welcome back!
            </h2>
            <p className="text-sm text-gray-700 dark:text-neutral-300 mb-3">
              Your previous <strong>{previousAccum.toLocaleString()}</strong> accumulated entries carried over.
            </p>
            <ul className="text-sm text-gray-700 dark:text-neutral-300 space-y-1">
              <li>
                This month&apos;s draw: <strong>{thisGrant.toLocaleString()}</strong> entries.
              </li>
              <li>
                Next month&apos;s renewal: <strong>{newAccum.toLocaleString()} + base</strong> entries.
              </li>
            </ul>
          </div>
        )}
```

- [ ] **Step 3: Ensure `lastMonthAccumulatedEntries` and `entriesGranted` are returned by the payment-status route**

If the existing payment-status response doesn't include `lastMonthAccumulatedEntries` and `entriesGranted` in `data`, extend the route. Open `src/app/api/payment-status/[id]/route.ts` and add to the `data` payload:

```ts
      lastMonthAccumulatedEntries: user?.subscription?.lastMonthAccumulatedEntries ?? 0,
      entriesGranted: /* the just-granted count for this payment, available from the
        invoice metadata or recently-set on the user — derive however the route
        already provides per-payment numbers */,
```

(Inspect the existing route to see what's currently available; if `entriesGranted` is hard to derive, fall back to `baseEntries × promoMultiplier` recomputed from `user.subscription.packageId` and the active promo, since that's the exact resubscribe formula.)

Update `PaymentStatusResponse` in `usePaymentQueries.ts` accordingly.

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: 0 errors.

### Task 10: Manual dev verification

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Complete a resubscribe end-to-end**

Use the Phase 1 tier picker to resubscribe a cancelled test user.

- [ ] **Step 3: Confirm the banner appears**

On `/purchase-success`, verify:
- Welcome-back banner renders at the top.
- "Previous accumulated" matches `lastMonthAccumulatedEntries_before − thisGrant`.
- "This month's draw" matches `baseEntries × promoMultiplier`.
- "Next month's renewal" matches `(previousAccum + thisGrant) + baseEntries`.

- [ ] **Step 4: Confirm the banner does NOT appear for initial subscriptions**

In a fresh browser, complete an *initial* (never-subscribed-before) subscription. Expected: no banner on `/purchase-success`. Verify by checking `wasRecentResubscribe` is false.

### Task 11: Commit Phase 2

- [ ] **Step 1: Verify clean tree**

Run: `git status`. Expected files:
- `src/models/User.ts`
- `src/app/api/stripe/create-subscription-existing-user/route.ts`
- `src/app/api/payment-status/[id]/route.ts`
- `src/hooks/queries/usePaymentQueries.ts`
- `src/app/(site)/purchase-success/components/PurchaseSuccessClient.tsx`
- `docs/subscription/...` and possibly `docs/cart-shop-products/...`

- [ ] **Step 2: Stage and commit**

⚠️ **Authorization gate:** check the no-auto-commit hook.

```bash
git add src/models/User.ts \
        src/app/api/stripe/create-subscription-existing-user/route.ts \
        src/app/api/payment-status/[id]/route.ts \
        src/hooks/queries/usePaymentQueries.ts \
        src/app/(site)/purchase-success/components/PurchaseSuccessClient.tsx \
        docs/subscription docs/cart-shop-products
git commit -m "feat(subscription): surface carry-over on success page after resubscribe

Adds lastResubscribedAt timestamp on User.subscription, set at the
resubscribe API site. The /purchase-success page now shows a welcome-
back banner with previous-accumulated / this-grant / next-renewal
numbers when the most recent resubscribe was within 10 minutes.

Spec: docs/superpowers/specs/2026-05-20-resubscribe-tier-choice-ux-design.md"
```

---

## Phase 3 — Activity-tab carry-over sub-line

### Task 12: Render carry-over context in `MajorDrawOverview`

**Files:**
- Modify: `src/app/(site)/my-account/components/MajorDrawOverview.tsx`

- [ ] **Step 1: Locate the per-draw card render**

Open `src/app/(site)/my-account/components/MajorDrawOverview.tsx`. Find where each major-draw card renders the `entriesBySource` chips (the screenshot's "Membership: 1115" etc.).

- [ ] **Step 2: Add the resubscribe-detection logic**

Pull `user.subscription.lastResubscribedAt` from the my-account user payload (it's already on the user; verify the my-account route includes the full `subscription` object). For each draw card, compute:

```tsx
const drawIncludesResubscribe = Boolean(
  user.subscription?.lastResubscribedAt &&
    draw.activationDate &&
    draw.drawDate &&
    new Date(user.subscription.lastResubscribedAt) >= new Date(draw.activationDate) &&
    new Date(user.subscription.lastResubscribedAt) <= new Date(draw.drawDate)
);
```

- [ ] **Step 3: Append the sub-line**

Below the existing `entriesBySource` chips, conditionally render:

```tsx
{drawIncludesResubscribe && entry?.entriesBySource?.membership !== undefined && (
  <p className="text-xs text-gray-500 dark:text-neutral-400 mt-2">
    Includes resubscribe + carry-over from previous membership. Next month&apos;s renewal will use your new accumulated total.
  </p>
)}
```

(The exact `entry` reference depends on how the component already iterates draws; adapt to match.)

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: 0 errors.

### Task 13: Manual dev verification

- [ ] **Step 1: Backfill a test user**

Use the dev DB to set `subscription.lastResubscribedAt` to a date inside an active major draw's `activationDate..drawDate` window for a test user.

- [ ] **Step 2: View the activity tab**

Log in as that user and open the Activity tab on `/my-account`. Locate the major-draw card whose period contains `lastResubscribedAt`.

Expected: the sub-line appears below the `entriesBySource` chips for that one draw only.

- [ ] **Step 3: Confirm absence on other draws**

Other historic draws — no sub-line. The check is a date-window match against the *current* `lastResubscribedAt`, not a permanent flag.

### Task 14: Update documentation

**Files:**
- Modify: `docs/dashboard-account/` doc covering `MajorDrawOverview`.

- [ ] **Step 1: Identify the doc**

Run `npm run lint`, follow the doc-sync hook output.

- [ ] **Step 2: Note the new sub-line**

One paragraph mentioning the trigger (`subscription.lastResubscribedAt` falling inside the draw's date window).

### Task 15: Commit Phase 3

- [ ] **Step 1: Verify clean tree**

Run: `git status`. Expected files:
- `src/app/(site)/my-account/components/MajorDrawOverview.tsx`
- `docs/dashboard-account/...`

- [ ] **Step 2: Stage and commit**

⚠️ **Authorization gate.**

```bash
git add src/app/(site)/my-account/components/MajorDrawOverview.tsx docs/dashboard-account
git commit -m "feat(dashboard): show resubscribe + carry-over sub-line in activity tab

Major-draw cards whose date window contains lastResubscribedAt now
render a sub-line clarifying that membership entries that period
include a resubscribe + carry-over.

Spec: docs/superpowers/specs/2026-05-20-resubscribe-tier-choice-ux-design.md"
```
