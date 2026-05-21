# Dashboard + Tier-Picker Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the resubscribe tier picker to match the existing membership-section visual scheme, rename "carry-over" → "accumulated entries" everywhere it surfaces, hard-route the settings back button to `/my-account`, animate empty-state dashboard cards with `sessionStorage`-backed persistence, add a next-renewal entries line to the active-member hero, and remove the noisy activity-tab resubscribe sub-line.

**Architecture:** UI polish only — no schema changes, no new endpoints, no math changes. One new compact React component (`ResubscribeTierCard`) mirrors `ElectricPackageCard`'s visual primitives without inheriting its full props surface. One new pure-function helper (`dashboard-empty-card-nudge.ts`) gates per-tab animations. All other work is in-place edits to existing components, the my-account dashboard, the settings page, and the success page.

**Tech Stack:** React 19, Next.js 15 App Router, Tailwind, `next/image`, `sessionStorage`, existing `getMembershipSectionColorScheme` / `getPackageIcon` / `PromoBadgeImage` primitives.

**Reference spec:** [docs/superpowers/specs/2026-05-21-dashboard-tier-picker-polish-design.md](docs/superpowers/specs/2026-05-21-dashboard-tier-picker-polish-design.md)

---

## Phase 1 — Tier card visual refresh + wording

### Task 1: Create `ResubscribeTierCard` component

**Files:**
- Create: `src/components/modals/SubscriptionManagementModal/ResubscribeTierCard.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/modals/SubscriptionManagementModal/ResubscribeTierCard.tsx` with the following content (complete file, no placeholders):

```tsx
"use client";

import React from "react";
import Image from "next/image";
import { getMembershipSectionColorScheme } from "@/utils/package-colors/packageColorScheme";
import { getPackageIcon } from "@/utils/images/package-icons";
import PromoBadgeImage from "@/components/ui/PromoBadgeImage";
import { hasBundledMultiplierAssets, type PromoMultiplier } from "@/types/promo-multiplier";
import { cn } from "@/utils/cn";
import type { ResubscribeTierOption } from "./ResubscribeTierPicker";

export interface ResubscribeTierCardProps {
  plan: ResubscribeTierOption;
  promoMultiplier: number;
  lastMonthAccumulatedEntries: number;
  isPrevious: boolean;
  theme?: "light" | "dark";
  onSelect: (packageId: string) => void;
}

const ResubscribeTierCard: React.FC<ResubscribeTierCardProps> = ({
  plan,
  promoMultiplier,
  lastMonthAccumulatedEntries,
  isPrevious,
  theme = "dark",
  onSelect,
}) => {
  const scheme = getMembershipSectionColorScheme(plan.packageId, true);
  const icon = getPackageIcon(plan.packageId);
  const grant = plan.entriesPerMonth * promoMultiplier;
  const nextRenewal = lastMonthAccumulatedEntries + grant + plan.entriesPerMonth;
  const isLight = theme === "light";
  const promoActive = promoMultiplier > 1;
  const showBundledBadge = promoActive && hasBundledMultiplierAssets(promoMultiplier as PromoMultiplier);

  const accent = scheme.accentHex;
  const bigNumberStyle: React.CSSProperties = isLight
    ? { color: "#0A0A0A" }
    : {
        color: "#FFFFFF",
        textShadow: `0 0 18px ${accent}, 0 0 36px ${accent}80`,
      };

  return (
    <button
      type="button"
      onClick={() => onSelect(plan.packageId)}
      className={cn(
        "relative w-full text-left rounded-3xl overflow-visible p-5",
        "transition-[transform,box-shadow] duration-200 hover:scale-[1.02]",
        scheme.bgGradient ?? "",
      )}
      style={{
        boxShadow: isLight
          ? "0 4px 12px rgba(0,0,0,0.08)"
          : `0 0 24px ${accent}40, 0 4px 12px rgba(0,0,0,0.3)`,
      }}
    >
      {/* Top row: icon + multiplier badge */}
      <div className="flex items-start justify-between mb-3">
        {icon ? (
          <Image
            src={icon}
            alt={`${plan.name} icon`}
            width={48}
            height={48}
            className="object-contain"
            sizes="48px"
          />
        ) : (
          <div className="w-12 h-12" aria-hidden="true" />
        )}
        {showBundledBadge ? (
          <PromoBadgeImage multiplier={promoMultiplier as PromoMultiplier} size="small" />
        ) : null}
      </div>

      {/* Tier name + price */}
      <div className="flex items-baseline justify-between mb-3">
        <h3 className={cn("font-bold text-lg", isLight ? "text-gray-900" : "text-white")}>
          {plan.name}
          {isPrevious && (
            <span
              className={cn(
                "ml-2 text-xs font-normal",
                isLight ? "text-gray-500" : "text-white/70",
              )}
            >
              (previously)
            </span>
          )}
        </h3>
        <span
          className={cn(
            "text-sm font-semibold",
            isLight ? "text-gray-700" : "text-white/90",
          )}
        >
          ${plan.price}/mo
        </span>
      </div>

      {/* Big sign-up grant number */}
      <div className="mb-3">
        <p
          className={cn(
            "text-xs uppercase tracking-wide font-semibold mb-1",
            isLight ? "text-gray-600" : "text-white/80",
          )}
        >
          Sign-up grant
        </p>
        <p className="text-3xl font-black leading-none" style={bigNumberStyle}>
          {grant.toLocaleString()}
        </p>
      </div>

      {/* Per-tier breakdown */}
      <div
        className={cn(
          "text-xs space-y-1",
          isLight ? "text-gray-700" : "text-white/85",
        )}
      >
        <p>
          Accumulated entries: <strong>{lastMonthAccumulatedEntries.toLocaleString()}</strong>
        </p>
        <p>
          Next renewal: <strong>{nextRenewal.toLocaleString()}</strong>
        </p>
      </div>
    </button>
  );
};

export default ResubscribeTierCard;
```

- [ ] **Step 2: Verify**

Run: `npm run type-check`
Expected: 0 errors.

### Task 2: Replace inline card markup in `ResubscribeTierPicker` + apply wording

**Files:**
- Modify: `src/components/modals/SubscriptionManagementModal/ResubscribeTierPicker.tsx`

- [ ] **Step 1: Swap to the new card and rewrite the subheader**

Open `src/components/modals/SubscriptionManagementModal/ResubscribeTierPicker.tsx`. Replace the entire `ResubscribeTierPicker` component (lines 23-94) with:

```tsx
export const ResubscribeTierPicker: React.FC<ResubscribeTierPickerProps> = ({
  packages,
  previousPackageId,
  promoMultiplier,
  lastMonthAccumulatedEntries,
  onPickTier,
}) => {
  const hasAccumulated = lastMonthAccumulatedEntries > 0;
  return (
    <div className="py-2">
      <div className="text-center mb-6">
        <div className="w-14 h-14 mx-auto mb-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-md">
          <CreditCard className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Welcome back — pick a tier</h2>
        {hasAccumulated ? (
          <p className="text-sm text-gray-600 dark:text-neutral-300">
            You have <strong>{lastMonthAccumulatedEntries.toLocaleString()}</strong> accumulated entries.
          </p>
        ) : (
          <p className="text-sm text-gray-600 dark:text-neutral-300">Pick a tier to come back.</p>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {packages.map((pkg) => (
          <ResubscribeTierCard
            key={pkg.packageId}
            plan={pkg}
            promoMultiplier={promoMultiplier}
            lastMonthAccumulatedEntries={lastMonthAccumulatedEntries}
            isPrevious={previousPackageId === pkg.packageId}
            onSelect={onPickTier}
          />
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Remove the now-unused import**

In the same file, remove the `getMembershipSectionColorScheme` import (no longer used directly by the picker — moved into the new card). Update the imports block to:

```tsx
"use client";

import React from "react";
import { CreditCard } from "lucide-react";
import { Button } from "../ui";
import ResubscribeTierCard from "./ResubscribeTierCard";
```

- [ ] **Step 3: Verify**

Run: `npm run type-check`
Expected: 0 errors.

### Task 3: Update banner wording in `PurchaseSuccessClient`

**Files:**
- Modify: `src/app/(site)/purchase-success/components/PurchaseSuccessClient.tsx`

- [ ] **Step 1: Rewrite the banner copy**

Open `src/app/(site)/purchase-success/components/PurchaseSuccessClient.tsx`. Find the banner block (the `{wasResubscribe && (...)}` block, lines ~72-89).

Replace this line:
```tsx
              Your previous <strong>{previousAccum.toLocaleString()}</strong> accumulated entries carried over.
```

With:
```tsx
              Your <strong>{previousAccum.toLocaleString()}</strong> accumulated entries carried over.
```

(Remove the word "previous"; the rest of the line is unchanged.)

- [ ] **Step 2: Verify**

Run: `npm run type-check`
Expected: 0 errors.

### Task 4: Update Phase 1 documentation

**Files:**
- Modify: `docs/subscription/frontend.md`
- Modify: `docs/cart-shop-products/frontend.md`

- [ ] **Step 1: Update `docs/subscription/frontend.md`**

Find the existing "Resubscribe tier picker (Phase 1, 2026-05-20)" section that was added in commit `6bebdcd9`. Append a new sub-section:

```markdown
### Visual refresh (2026-05-21)

The tier-picker grid now renders `ResubscribeTierCard` (one card per tier) instead of inline `<button>` markup. The card mirrors `ElectricPackageCard`'s visual primitives — gradient background from `getMembershipSectionColorScheme(packageId, true)`, package icon from `getPackageIcon(packageId)`, multiplier badge image via `PromoBadgeImage`, and the same glow on the big sign-up-grant number. Layout, click handler, and `isPrevious` badge unchanged.

Per-card copy:
- "Sign-up grant: N" — the entries you'll receive on this resubscribe.
- "Accumulated entries: N" — the carry-over (was "Your carry-over: N").
- "Next renewal: N" — the projected first-renewal total.

Picker subheader now reads "You have **N** accumulated entries." when `lastMonthAccumulatedEntries > 0`, or "Pick a tier to come back." when it's 0.
```

- [ ] **Step 2: Update `docs/cart-shop-products/frontend.md`**

Find the success-page section. Update the banner copy reference from:

> "Your previous **N** accumulated entries carried over."

To:

> "Your **N** accumulated entries carried over."

(Remove "previous" — picker and banner now use parallel wording.)

### Task 5: Commit Phase 1

- [ ] **Step 1: Verify clean tree**

Run: `git status`. Expected files:
- `src/components/modals/SubscriptionManagementModal/ResubscribeTierCard.tsx` (new)
- `src/components/modals/SubscriptionManagementModal/ResubscribeTierPicker.tsx`
- `src/app/(site)/purchase-success/components/PurchaseSuccessClient.tsx`
- `docs/subscription/frontend.md`
- `docs/cart-shop-products/frontend.md`

- [ ] **Step 2: Stage and commit**

⚠️ **Authorization gate:** the repo's `no-auto-commit` hook blocks commits unless the user has authorized commits this session with `commit`, `push`, `merge`, or similar. If unauthorized, stop here and ask.

```bash
git add src/components/modals/SubscriptionManagementModal/ResubscribeTierCard.tsx \
        src/components/modals/SubscriptionManagementModal/ResubscribeTierPicker.tsx \
        src/app/\(site\)/purchase-success/components/PurchaseSuccessClient.tsx \
        docs/subscription/frontend.md \
        docs/cart-shop-products/frontend.md
git commit -m "feat(subscription): tier picker visual refresh + accumulated-entries copy

Replaces the soft pastel tier cards with ResubscribeTierCard — mirrors
ElectricPackageCard's visual scheme (tier-gradient background, package
icon, multiplier badge image, glowing sign-up grant) so the cancelled-
user flow feels native to the rest of the membership UI.

Copy update: 'carry-over' wording replaced with 'accumulated entries'
across the picker subheader, per-card line, and the success-page
banner. Internal field name (lastMonthAccumulatedEntries) unchanged.

Spec: docs/superpowers/specs/2026-05-21-dashboard-tier-picker-polish-design.md (Phase 1)"
```

---

## Phase 2 — Universal picker + delete legacy "Subscription Inactive"

### Task 6: Widen the picker branch in `EmptyStates.tsx`

**Files:**
- Modify: `src/components/modals/SubscriptionManagementModal/EmptyStates.tsx`

- [ ] **Step 1: Rewrite `InactiveSubscriptionState`**

Open `src/components/modals/SubscriptionManagementModal/EmptyStates.tsx`. Replace the existing `InactiveSubscriptionState` (lines 63-106) with:

```tsx
export const InactiveSubscriptionState: React.FC<InactiveSubscriptionStateProps> = ({
  status: _status,
  onSubscribeClick,
  packages,
  previousPackageId,
  promoMultiplier,
  lastMonthAccumulatedEntries,
  onPickTier,
}) => {
  // Universal picker for any non-active, non-past_due state (canceled,
  // unpaid, incomplete, incomplete_expired). Status no longer gates
  // rendering — caller is responsible for routing past_due through the
  // recovery flow before this component renders.
  if (packages && packages.length > 0 && onPickTier) {
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

  // No packages loaded (rare): defensive fallback to the legacy single CTA.
  return <ResubscribeEmptyStateFallback onSubscribeClick={onSubscribeClick} />;
};
```

- [ ] **Step 2: Remove the now-unused `AlertTriangle` import**

In the same file, the `AlertTriangle` icon is no longer used (it was only inside the deleted "Subscription Inactive" branch). Update the imports block (line 4) from:

```tsx
import { CreditCard, AlertTriangle } from "lucide-react";
```

to:

```tsx
import { CreditCard } from "lucide-react";
```

`CreditCard` is still used by `OneTimeOnlyState` and `NoSubscriptionState`, so keep it.

- [ ] **Step 3: Verify**

Run: `npm run type-check`
Expected: 0 errors.

### Task 7: Update `ResubscribeEmptyState` footer to adapt to context

**Files:**
- Modify: `src/components/modals/SubscriptionManagementModal/ResubscribeTierPicker.tsx`

- [ ] **Step 1: Add an optional `showCancelledFooter` prop**

Open `src/components/modals/SubscriptionManagementModal/ResubscribeTierPicker.tsx`. Find the `ResubscribeEmptyStateProps` interface and add an optional flag:

```tsx
interface ResubscribeEmptyStateProps {
  packages: ResubscribeTierOption[];
  previousPackageId?: string;
  promoMultiplier: number;
  lastMonthAccumulatedEntries: number;
  onPickTier: (packageId: string) => void;
  /**
   * When true, render the "Your subscription was cancelled" footer note.
   * Default true (cancelled callers); pass false for never-subscribed callers
   * where the cancelled framing does not apply.
   */
  showCancelledFooter?: boolean;
}
```

- [ ] **Step 2: Make the footer conditional**

In the same file, update `ResubscribeEmptyState` (the wrapper component) to gate the footer note:

```tsx
export const ResubscribeEmptyState: React.FC<ResubscribeEmptyStateProps> = ({
  showCancelledFooter = true,
  ...pickerProps
}) => (
  <div className="py-4">
    <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-neutral-800 dark:to-neutral-900 rounded-xl p-4 sm:p-6 border border-gray-200 dark:border-neutral-700 shadow-sm">
      <ResubscribeTierPicker {...pickerProps} />
      {showCancelledFooter ? (
        <p className="text-xs text-center text-gray-500 dark:text-neutral-400 mt-4">
          Your subscription was cancelled. Pick any tier to come back — your entries history is preserved.
        </p>
      ) : null}
    </div>
  </div>
);
```

- [ ] **Step 3: Verify**

Run: `npm run type-check`
Expected: 0 errors.

### Task 8: Update the parent modal to pass `showCancelledFooter` correctly

**Files:**
- Modify: `src/components/modals/SubscriptionManagementModal/EmptyStates.tsx`

- [ ] **Step 1: Pass status-derived footer flag to ResubscribeEmptyState**

In `EmptyStates.tsx`, find the `InactiveSubscriptionState` we just rewrote. We need to know whether to show the cancelled footer. Since the rewrite removed the `status` check, the easiest signal is "the caller passed a `previousPackageId`" — never-subscribed users won't have one. Update the `ResubscribeEmptyState` invocation to:

```tsx
    return (
      <ResubscribeEmptyState
        packages={packages}
        previousPackageId={previousPackageId}
        promoMultiplier={promoMultiplier ?? 1}
        lastMonthAccumulatedEntries={lastMonthAccumulatedEntries ?? 0}
        onPickTier={onPickTier}
        showCancelledFooter={Boolean(previousPackageId)}
      />
    );
```

This renders the cancelled footer when the user has a `previousPackageId` (any past subscription), and hides it for never-subscribed users.

- [ ] **Step 2: Verify**

Run: `npm run type-check`
Expected: 0 errors.

### Task 9: Audit other usages of `InactiveSubscriptionState`

**Files:**
- Read: `src/components/modals/SubscriptionManagementModal/index.tsx`
- Read: `src/components/modals/SubscriptionManagementModal/SettingsRedesignSubscription.tsx`

- [ ] **Step 1: Confirm callers still pass the needed props**

Run: `npm run lint` (or grep for `InactiveSubscriptionState` usages):

```bash
grep -rn "InactiveSubscriptionState" src/
```

Each call site must pass `packages`, `previousPackageId`, `promoMultiplier`, `lastMonthAccumulatedEntries`, and `onPickTier` (or accept the fallback CTA). The `status` prop is still required (the type didn't change) but is no longer used by the component — that's fine, it's a type-only no-op until a follow-up cleanup.

If a call site is missing the picker props, the fallback `<ResubscribeEmptyStateFallback>` renders — which is the safe default.

- [ ] **Step 2: Run the dev server briefly to sanity-check**

Run: `npm run dev`
Open the Subscription Management modal as a user with `subscription.status === "incomplete_expired"` (or any non-canceled, non-active state). Expected: the tier picker renders, not the legacy "Subscription Inactive" card.

If you can't easily reach that state in dev, skip the manual check — type-check is enough for this task.

### Task 10: Update Phase 2 documentation

**Files:**
- Modify: `docs/subscription/frontend.md`
- Modify: `docs/subscription/rules.md` (if it discusses the empty-state branching)

- [ ] **Step 1: Document the universal picker**

Append to `docs/subscription/frontend.md`:

```markdown
### Universal picker for non-active subscriptions (2026-05-21)

`InactiveSubscriptionState` no longer branches on `subscription.status`. The legacy "Subscription Inactive" CTA card (yellow AlertTriangle, "Subscribe to Membership Packages" button) was deleted. Any user reaching this component without an active subscription sees the tier picker, regardless of whether their state is `canceled`, `unpaid`, `incomplete`, `incomplete_expired`, or never-subscribed.

The picker subheader adapts to context:
- `lastMonthAccumulatedEntries > 0` → "You have **N** accumulated entries."
- `lastMonthAccumulatedEntries === 0` → "Pick a tier to come back."

The footer note "Your subscription was cancelled..." renders only when `previousPackageId` is set (i.e., the user has a subscription history). Never-subscribed users see the picker without the cancelled framing.

Callers are responsible for routing `past_due` users through the failed-renewal recovery flow before this component renders.
```

### Task 11: Commit Phase 2

- [ ] **Step 1: Verify**

Run: `git status`. Expected:
- `src/components/modals/SubscriptionManagementModal/EmptyStates.tsx`
- `src/components/modals/SubscriptionManagementModal/ResubscribeTierPicker.tsx`
- `docs/subscription/frontend.md` (and optionally `docs/subscription/rules.md`)

- [ ] **Step 2: Commit**

⚠️ **Authorization gate:** see Phase 1 Task 5.

```bash
git add src/components/modals/SubscriptionManagementModal/EmptyStates.tsx \
        src/components/modals/SubscriptionManagementModal/ResubscribeTierPicker.tsx \
        docs/subscription
git commit -m "feat(subscription): universal tier picker for non-active subscriptions

InactiveSubscriptionState no longer branches on subscription.status.
The legacy 'Subscription Inactive' CTA card is deleted; any non-active
state (canceled, unpaid, incomplete, never-subscribed) now renders the
tier picker.

Picker subheader and footer adapt to context: 'You have N accumulated
entries' vs 'Pick a tier to come back', and the cancelled-footer note
renders only when previousPackageId is set.

past_due users continue to route through the failed-renewal recovery
flow before reaching this component.

Spec: docs/superpowers/specs/2026-05-21-dashboard-tier-picker-polish-design.md (Phase 2)"
```

---

## Phase 3 — Active-member hero: next-renewal entries

### Task 12: Add next-renewal entries line in `SettingsRedesignSubscription`

**Files:**
- Modify: `src/components/modals/SubscriptionManagementModal/SettingsRedesignSubscription.tsx`

- [ ] **Step 1: Read the file**

Open `src/components/modals/SubscriptionManagementModal/SettingsRedesignSubscription.tsx`. Find the active-member "current plan hero" block — search for the existing "Next billing" line. It will be inside a section that shows "Started" / "Next billing" rows for the active subscription.

- [ ] **Step 2: Compute the projected entries and render the line**

Just above the JSX block that renders the existing rows (or wherever the data is being prepared for the hero), add:

```tsx
const subscriptionWithEntries = user.subscription as
  | { lastMonthAccumulatedEntries?: number }
  | undefined;
const lastMonthAccumulated = subscriptionWithEntries?.lastMonthAccumulatedEntries;
const baseEntries = membershipPackage?.entriesPerMonth;
const nextRenewalEntries =
  typeof baseEntries === "number" && baseEntries > 0
    ? (lastMonthAccumulated ?? baseEntries) + baseEntries
    : null;
```

Then, immediately after the existing "Next billing" row in the JSX, add:

```tsx
{nextRenewalEntries !== null && (
  <div className="flex items-center justify-between">
    <span className="text-sm text-gray-600 dark:text-neutral-400">Next renewal entries</span>
    <span className="text-sm font-semibold text-gray-900 dark:text-white">
      {nextRenewalEntries.toLocaleString()}
    </span>
  </div>
)}
```

The exact wrapping class names should match the surrounding "Next billing" row in the file (this snippet uses generic Tailwind; mirror the actual classes used by the neighboring row so the spacing and typography match).

If `membershipPackage` is not in scope at that location, look earlier in the component — there's almost certainly an existing reference to it (it's how the tier name is displayed). Use the same reference.

- [ ] **Step 3: Verify**

Run: `npm run type-check`
Expected: 0 errors.

### Task 13: Update Phase 3 documentation

**Files:**
- Modify: `docs/subscription/frontend.md`

- [ ] **Step 1: Document the new hero row**

Append to `docs/subscription/frontend.md`:

```markdown
### Active-member hero — next-renewal entries (2026-05-21)

The "current plan" hero inside the active-member branch of the settings subscription tab now includes a "Next renewal entries: **N**" row below the existing "Next billing" line. The number is computed locally as `(lastMonthAccumulatedEntries ?? baseEntries) + baseEntries` — the exact `calculateRenewalEntries` formula. The row is hidden when `entriesPerMonth` is missing on the package data; past_due users still see the projection.
```

### Task 14: Commit Phase 3

- [ ] **Step 1: Verify**

Run: `git status`. Expected:
- `src/components/modals/SubscriptionManagementModal/SettingsRedesignSubscription.tsx`
- `docs/subscription/frontend.md`

- [ ] **Step 2: Commit**

⚠️ **Authorization gate:** see Phase 1 Task 5.

```bash
git add src/components/modals/SubscriptionManagementModal/SettingsRedesignSubscription.tsx \
        docs/subscription/frontend.md
git commit -m "feat(subscription): show projected next-renewal entries in active-member hero

The 'current plan' hero now includes 'Next renewal entries: N' below
the existing 'Next billing' line. Mirrors calculateRenewalEntries
formula (lastMonthAccumulated + baseEntries); hides cleanly when
entriesPerMonth is unavailable.

Spec: docs/superpowers/specs/2026-05-21-dashboard-tier-picker-polish-design.md (Phase 3)"
```

---

## Phase 4 — Dashboard empty-card animations

### Task 15: Create the `dashboard-empty-card-nudge` helper

**Files:**
- Create: `src/utils/dashboard-empty-card-nudge.ts`

- [ ] **Step 1: Write the helper**

Create `src/utils/dashboard-empty-card-nudge.ts`:

```ts
/**
 * Per-tab session storage for the dashboard empty-state nudge animations.
 *
 * When a user lands on /my-account and the Membership or One-time entry card
 * is empty, the card animates to invite a click. After the user clicks the
 * card once in this tab, the nudge stops for the rest of the tab session.
 * Closing the tab or starting a fresh tab resets the flag and the nudge
 * re-appears, since each tab carries its own sessionStorage.
 *
 * Fails open (returns false / no-ops) when sessionStorage is unavailable
 * (private browsing edge cases). Worst case: animation always shows.
 */

const KEY_BASE = "ta:dashboard-card-nudge-clicked:v1";

export type NudgeCardType = "membership" | "onetime";

function key(cardType: NudgeCardType): string {
  return `${KEY_BASE}:${cardType}`;
}

export function hasClickedNudge(cardType: NudgeCardType): boolean {
  try {
    return typeof window !== "undefined" && sessionStorage.getItem(key(cardType)) === "1";
  } catch {
    return false;
  }
}

export function markNudgeClicked(cardType: NudgeCardType): void {
  try {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(key(cardType), "1");
    }
  } catch {
    /* sessionStorage unavailable — silently ignore */
  }
}
```

- [ ] **Step 2: Verify**

Run: `npm run type-check`
Expected: 0 errors.

### Task 16: Add animation keyframes to globals

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add the two animations**

Open `src/app/globals.css`. Find a section near the bottom for project-specific keyframes (or add one if absent). Append:

```css
/* Dashboard empty-card nudges (membership + one-time). Respect reduced motion. */
@keyframes ta-nudge-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 currentColor;
    transform: scale(1);
  }
  50% {
    box-shadow: 0 0 0 8px transparent;
    transform: scale(1.005);
  }
}

@keyframes ta-nudge-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@media (prefers-reduced-motion: no-preference) {
  .ta-nudge-pulse {
    animation: ta-nudge-pulse 3s ease-in-out infinite;
    color: rgb(239 68 68 / 0.4); /* tier-red glow tone used by Membership card */
  }
  .ta-nudge-shimmer {
    position: relative;
    overflow: hidden;
  }
  .ta-nudge-shimmer::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      110deg,
      transparent 30%,
      rgba(255, 255, 255, 0.12) 50%,
      transparent 70%
    );
    background-size: 200% 100%;
    animation: ta-nudge-shimmer 4s ease-in-out infinite;
    pointer-events: none;
  }
}
```

The `currentColor` reference in `ta-nudge-pulse` lets the card pick its own glow tone by setting `color` on the host element; the rule above sets a sensible default for the Membership card (red). If you want a different tone, override via inline style or another utility class.

- [ ] **Step 2: Verify**

Start the dev server briefly to sanity-check that `globals.css` parses (since this is hard to type-check). Run `npm run dev` and confirm there are no CSS compile warnings in the terminal output, then stop the server.

If `npm run dev` is slow, skip — `npm run type-check` is sufficient since CSS errors don't affect the TypeScript pass.

### Task 17: Wire the animation into the Membership card

**Files:**
- Modify: `src/app/(site)/my-account/components/MajorDrawOverview.tsx`

- [ ] **Step 1: Import the helper and add state**

Open `src/app/(site)/my-account/components/MajorDrawOverview.tsx`. Near the top with the other imports, add:

```ts
import { hasClickedNudge, markNudgeClicked } from "@/utils/dashboard-empty-card-nudge";
```

Find the Membership card JSX (search for "MEMBERSHIP" or the section that renders `displayMembershipEntries`). Just above the card's JSX, derive the animation state:

```tsx
const membershipEmpty = !hasActiveSubscription && displayMembershipEntries === 0;
const [membershipNudge, setMembershipNudge] = React.useState(false);

React.useEffect(() => {
  if (membershipEmpty && !hasClickedNudge("membership")) {
    setMembershipNudge(true);
  }
}, [membershipEmpty]);

const handleMembershipNudgeClick = React.useCallback(() => {
  markNudgeClicked("membership");
  setMembershipNudge(false);
}, []);
```

- [ ] **Step 2: Apply the nudge class and click handler**

Find the Membership card's outer element (the one with the existing `bg-` / border styling for the red Membership tile). Add the `ta-nudge-pulse` class conditionally:

```tsx
className={cn(
  "...existing classes...",
  membershipNudge && "ta-nudge-pulse",
)}
onClick={(e) => {
  // existing handler logic, if any
  if (membershipNudge) {
    handleMembershipNudgeClick();
  }
  // existing nav: route to settings subscription tab
}}
```

If the card currently doesn't have an `onClick`, add one that does both: calls `handleMembershipNudgeClick` (to clear the nudge) and navigates via `router.push("/my-account/settings?tab=subscription")`. Import `useRouter` from `next/navigation` if not already in scope.

- [ ] **Step 3: Verify**

Run: `npm run type-check`
Expected: 0 errors.

### Task 18: Wire the animation into the One-time card

**Files:**
- Modify: `src/app/(site)/my-account/components/MajorDrawOverview.tsx`

- [ ] **Step 1: Derive empty state for one-time and add the nudge wiring**

In the same file as Task 17, add:

```tsx
const oneTimeEmpty = oneTimeEntries === 0;
const [oneTimeNudge, setOneTimeNudge] = React.useState(false);

React.useEffect(() => {
  if (oneTimeEmpty && !hasClickedNudge("onetime")) {
    setOneTimeNudge(true);
  }
}, [oneTimeEmpty]);

const handleOneTimeNudgeClick = React.useCallback(() => {
  markNudgeClicked("onetime");
  setOneTimeNudge(false);
}, []);
```

- [ ] **Step 2: Apply the shimmer class to the One-time card**

Find the One-time card JSX (existing `onOneTimeCardClick` button at line ~404). Update its className to include `ta-nudge-shimmer` when `oneTimeNudge` is true, and wrap the existing `onOneTimeCardClick` handler so the nudge gets cleared:

```tsx
<button
  type="button"
  onClick={() => {
    if (oneTimeNudge) {
      handleOneTimeNudgeClick();
    }
    onOneTimeCardClick?.();
  }}
  className={cn(
    "...existing classes...",
    oneTimeNudge && "ta-nudge-shimmer",
  )}
>
  {/* existing card contents */}
</button>
```

- [ ] **Step 3: Verify**

Run: `npm run type-check`
Expected: 0 errors.

### Task 19: Manual dev check (recommended, optional)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Log in as a user with no subscription and no one-time entries**

Open `/my-account` in a fresh browser tab.

Expected:
- Membership card pulses softly with a faint glow ring.
- One-time card shows a diagonal shimmer sweep every ~4 seconds.

Click the Membership card → routes to `/my-account/settings?tab=subscription`.
Click the One-time card → opens the MembershipModal.

Go back to `/my-account` in the same tab → neither card animates anymore (sessionStorage flag set).

Open a fresh tab → both animations re-appear.

If `prefers-reduced-motion` is set in OS settings, neither animates.

### Task 20: Update Phase 4 documentation

**Files:**
- Modify: `docs/dashboard-account/frontend.md`

- [ ] **Step 1: Document the nudge pattern**

Append to `docs/dashboard-account/frontend.md`:

```markdown
### Empty-card nudge animations (2026-05-21)

When `/my-account` renders with no active subscription, the Membership tile in MajorDrawOverview pulses softly with a tier-red glow ring (`ta-nudge-pulse` class — 3s ease infinite). Clicking the card routes to `/my-account/settings?tab=subscription`.

When the user has no one-time entries (`oneTimeEntries === 0`), the One-time tile shows a diagonal shimmer sweep (`ta-nudge-shimmer` — 4s ease infinite). Clicking opens the MembershipModal via the existing `onOneTimeCardClick` handler.

Persistence: `src/utils/dashboard-empty-card-nudge.ts` exposes `hasClickedNudge` / `markNudgeClicked` keyed by `cardType: "membership" | "onetime"` and stored in sessionStorage. Fresh tab → fresh nudge. After the user clicks once in a tab, the animation stops for that tab only.

Both animations are gated by `@media (prefers-reduced-motion: no-preference)` and degrade gracefully when sessionStorage throws.
```

### Task 21: Commit Phase 4

- [ ] **Step 1: Verify**

Run: `git status`. Expected:
- `src/utils/dashboard-empty-card-nudge.ts` (new)
- `src/app/globals.css`
- `src/app/(site)/my-account/components/MajorDrawOverview.tsx`
- `docs/dashboard-account/frontend.md`

- [ ] **Step 2: Commit**

⚠️ **Authorization gate:** see Phase 1 Task 5.

```bash
git add src/utils/dashboard-empty-card-nudge.ts \
        src/app/globals.css \
        src/app/\(site\)/my-account/components/MajorDrawOverview.tsx \
        docs/dashboard-account/frontend.md
git commit -m "feat(dashboard): nudge animations on empty Membership and One-time cards

Membership tile pulses softly when the user has no active subscription;
clicks route to /my-account/settings?tab=subscription. One-time tile
sweeps a diagonal shimmer when oneTimeEntries === 0; clicks open the
existing MembershipModal.

Persistence via src/utils/dashboard-empty-card-nudge.ts — sessionStorage
flag per cardType, fresh tab gets fresh nudge. Both animations gated on
prefers-reduced-motion: no-preference.

Spec: docs/superpowers/specs/2026-05-21-dashboard-tier-picker-polish-design.md (Phase 4)"
```

---

## Phase 5 — Settings back button + activity-tab cleanup

### Task 22: Hard-route settings back button to `/my-account`

**Files:**
- Modify: `src/app/(site)/my-account/settings/page.tsx`

- [ ] **Step 1: Pass onBackClick override to DashboardHeader**

Open `src/app/(site)/my-account/settings/page.tsx`. Find the `<DashboardHeader ... />` JSX. Add the `onBackClick` prop:

```tsx
<DashboardHeader
  // ...existing props
  onBackClick={() => router.push("/my-account")}
/>
```

`router` is already in scope from the existing `useRouter()` call near the top of the component.

- [ ] **Step 2: Verify**

Run: `npm run type-check`
Expected: 0 errors.

### Task 23: Remove activity-tab resubscribe sub-line

**Files:**
- Modify: `src/app/(site)/my-account/components/MajorDrawOverview.tsx`
- Modify: `src/app/(site)/my-account/page.tsx`

- [ ] **Step 1: Remove props and derivation from MajorDrawOverview**

In `src/app/(site)/my-account/components/MajorDrawOverview.tsx`:

a) Remove the `activationDate?: string` prop from `MajorDrawOverviewProps` (lines ~17-22, including the JSDoc).

b) Remove the `lastResubscribedAt?: string | Date` extension from the `userSubscription` prop type (lines ~54-60, including the JSDoc).

c) Remove the `activationDate` from the function-signature destructure.

d) Remove the `drawIncludesResubscribe` boolean derivation (the block of `const drawIncludesResubscribe = Boolean(...)`).

e) Remove the conditional `<p>...</p>` sub-line that renders "Includes resubscribe + carry-over from previous membership..."

- [ ] **Step 2: Update call site in page.tsx**

In `src/app/(site)/my-account/page.tsx`:

a) Remove the `activationDate={currentMajorDraw?.activationDate}` prop from the `<MajorDrawOverview ... />` invocation.

b) Update the inline `userSubscription` cast at line ~342 to remove `lastResubscribedAt?: string | Date`. The cast should revert to:

```ts
const userSubscription = user.subscription as { lastMonthAccumulatedEntries?: number } | undefined;
```

- [ ] **Step 3: Verify**

Run: `npm run type-check`
Expected: 0 errors.

### Task 24: Update Phase 5 documentation

**Files:**
- Modify: `docs/dashboard-account/frontend.md`

- [ ] **Step 1: Remove the Phase 3 section and add a deprecation note**

Open `docs/dashboard-account/frontend.md`. Find the "Resubscribe carry-over sub-line on MajorDrawOverview (Phase 3, 2026-05-20)" section. Replace its body with a one-line deprecation note:

```markdown
### Resubscribe carry-over sub-line (reverted 2026-05-21)

The activity-tab sub-line that surfaced "Includes resubscribe + carry-over from previous membership..." was removed. The success-page banner remains the canonical surface for communicating the carry-over to a returning user. `User.subscription.lastResubscribedAt` is still set at the resubscribe API site because the success-page banner's 10-minute `wasRecentResubscribe` window depends on it.
```

- [ ] **Step 2: Add a note about the back-button override**

Append to `docs/dashboard-account/frontend.md`:

```markdown
### Settings back button (2026-05-21)

`src/app/(site)/my-account/settings/page.tsx` passes `onBackClick={() => router.push("/my-account")}` to `DashboardHeader`. The chevron always routes to `/my-account` rather than browser-history previous. Other surfaces that don't pass the override continue to use the default `router.back()`.
```

### Task 25: Commit Phase 5

- [ ] **Step 1: Verify**

Run: `git status`. Expected:
- `src/app/(site)/my-account/settings/page.tsx`
- `src/app/(site)/my-account/components/MajorDrawOverview.tsx`
- `src/app/(site)/my-account/page.tsx`
- `docs/dashboard-account/frontend.md`

- [ ] **Step 2: Commit**

⚠️ **Authorization gate:** see Phase 1 Task 5.

```bash
git add src/app/\(site\)/my-account/settings/page.tsx \
        src/app/\(site\)/my-account/components/MajorDrawOverview.tsx \
        src/app/\(site\)/my-account/page.tsx \
        docs/dashboard-account/frontend.md
git commit -m "chore(dashboard): hard-route settings back button + drop noisy activity sub-line

Settings page now passes onBackClick to DashboardHeader so the chevron
goes to /my-account unconditionally, not browser-history previous.

Reverts the activity-tab 'Includes resubscribe + carry-over from
previous membership...' sub-line that was adding visual noise to the
TOTAL ENTRIES section. The schema field (lastResubscribedAt) and the
success-page banner stay — the banner is the canonical carry-over
surface for returning users.

Spec: docs/superpowers/specs/2026-05-21-dashboard-tier-picker-polish-design.md (Phase 5)"
```
