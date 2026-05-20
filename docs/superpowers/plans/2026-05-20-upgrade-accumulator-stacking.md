# Upgrade Entry Accumulator Stacking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the backwards incentive in `calculateUpgradeEntries` so that mid-cycle upgrades stack the user's `lastMonthAccumulatedEntries` with the new tier's `(base × promo)` grant — except when a membership grant already landed in the current draw period, where the legacy formula is preserved to prevent double-counting.

**Architecture:** Three-pronged change. (1) The pure calculator gets a `hasMembershipGrantInCurrentDrawPeriod` parameter selecting between Mode A (stack) and Mode B (legacy). (2) A new helper queries the active `MajorDraw` for this user's `entriesBySource.membership` and returns the boolean. (3) The webhook calls the helper before invoking the calculator, and the my-account user serializer exposes the same flag so the 4 modal preview sites display the same number the webhook will grant.

**Tech Stack:** TypeScript, Mongoose, Next.js App Router API routes, Stripe webhooks, `tsx`-based test scripts wired through `package.json`.

**Reference spec:** [docs/superpowers/specs/2026-05-20-upgrade-accumulator-stacking-design.md](docs/superpowers/specs/2026-05-20-upgrade-accumulator-stacking-design.md)

---

## Phase 1 — Calculator + helper + webhook wiring

This phase ships the behavior change end-to-end on the backend. UI previews are intentionally left out of this phase (Phase 2) because the webhook is the source of truth; previews shifting later is cosmetic.

### Task 1: Update `calculateUpgradeEntries` signature and Mode A/B math

**Files:**
- Modify: `src/utils/payment/subscription-entries-calculator.ts:117-148` (the `calculateUpgradeEntries` function body)
- Modify: `src/utils/payment/subscription-entries-calculator.ts:205-247` (the `calculateSubscriptionEntries` dispatcher)
- Modify: `src/utils/payment/subscription-entries-calculator.ts:18-26` (the `CalculateSubscriptionEntriesParams` interface)

- [ ] **Step 1: Add the new parameter to the params interface**

Edit `src/utils/payment/subscription-entries-calculator.ts`. Replace the existing `CalculateSubscriptionEntriesParams` interface (lines 18-26) with:

```ts
export interface CalculateSubscriptionEntriesParams {
  billingReason: "subscription_create" | "subscription_cycle";
  baseEntries: number;
  lastMonthAccumulatedEntries?: number;
  isResubscribe: boolean;
  promoMultiplier?: number;
  isUpgrade: boolean;
  currentAccumulatedEntries?: number;
  /**
   * True when the user already received a membership-source entry grant
   * in the currently active major draw before this upgrade event.
   * When true, the upgrade falls back to the legacy formula (newBase × promo)
   * to avoid double-crediting the draw. When false (default), the upgrade
   * stacks the lastMonthAccumulatedEntries baseline into the grant.
   * Only consulted when isUpgrade === true.
   */
  hasMembershipGrantInCurrentDrawPeriod?: boolean;
}
```

- [ ] **Step 2: Update `calculateUpgradeEntries` to accept and use the flag**

Replace the entire `calculateUpgradeEntries` function (lines 109-148) with:

```ts
/**
 * Calculate upgrade entries.
 *
 * Mode A — no prior membership grant in the active draw (common case):
 *   entriesToGrant          = lastMonthAccumulated + (newBase × promo)
 *   newLastMonthAccumulated = entriesToGrant
 *
 * Mode B — a membership grant already landed in the active draw (rare edge
 * case: renewal-then-upgrade within the same draw period). Falls back to the
 * legacy formula so we do not double-credit the draw:
 *   entriesToGrant          = newBase × promo
 *   newLastMonthAccumulated = lastMonthAccumulated + entriesToGrant
 *
 * @param newBaseEntries - Base entries per month for the new package
 * @param lastMonthAccumulatedEntries - User's last month accumulated entries
 * @param promoMultiplier - Active promo multiplier (defaults to 1)
 * @param hasMembershipGrantInCurrentDrawPeriod - True if a membership grant
 *   already landed in the active major draw before this upgrade fires
 * @returns Calculation result with entries to grant and new accumulated value
 */
export function calculateUpgradeEntries(
  newBaseEntries: number,
  lastMonthAccumulatedEntries: number = 0,
  promoMultiplier: number = 1,
  hasMembershipGrantInCurrentDrawPeriod: boolean = false
): CalculateSubscriptionEntriesResult {
  if (newBaseEntries < 0) {
    newBaseEntries = 0;
  }
  if (lastMonthAccumulatedEntries < 0) {
    lastMonthAccumulatedEntries = 0;
  }
  if (promoMultiplier < 1) {
    promoMultiplier = 1;
  }

  const promoEntries = newBaseEntries * promoMultiplier;

  if (hasMembershipGrantInCurrentDrawPeriod) {
    // Mode B — legacy formula
    const entriesToGrant = promoEntries;
    const newLastMonthAccumulatedEntries = lastMonthAccumulatedEntries + entriesToGrant;
    return {
      entriesToGrant,
      newLastMonthAccumulatedEntries,
      calculationType: "upgrade",
    };
  }

  // Mode A — stack
  const entriesToGrant = lastMonthAccumulatedEntries + promoEntries;
  const newLastMonthAccumulatedEntries = entriesToGrant;
  return {
    entriesToGrant,
    newLastMonthAccumulatedEntries,
    calculationType: "upgrade",
  };
}
```

- [ ] **Step 3: Thread the flag through `calculateSubscriptionEntries`**

In the same file, find the dispatcher body (lines 205-247) and replace the `isUpgrade` branch (lines 218-225) with:

```ts
  // Handle upgrade scenario (takes precedence)
  if (isUpgrade) {
    return calculateUpgradeEntries(
      baseEntries,
      lastMonthAccumulatedEntries ?? 0,
      promoMultiplier,
      params.hasMembershipGrantInCurrentDrawPeriod ?? false
    );
  }
```

- [ ] **Step 4: Update the file-header docblock to document the new mode**

Replace the existing top-of-file docblock (lines 1-16) with:

```ts
/**
 * Subscription Entries Calculator
 *
 * Handles subscription entry calculation for:
 * - Initial subscriptions (with promo multiplier)
 * - Renewals (without promo, accumulating)
 * - Upgrades (Mode A — stacks lastMonthAccumulated; Mode B — legacy, used when
 *   a membership grant already landed in the active major draw)
 * - Resubscriptions (with promo multiplier, continuing from last accumulated)
 *
 * Examples:
 * - Initial: baseEntries × promoMultiplier (e.g. 100 × 10 = 1000)
 * - Renewal: lastMonthAccumulated + baseEntries (e.g. 1000 + 100 = 1100)
 * - Upgrade Mode A: lastMonthAccumulated + (newBase × promo) (e.g. 1115 + 500 = 1615)
 * - Upgrade Mode B: newBase × promo (e.g. 500), accum += grant
 * - Resubscribe: lastMonthAccumulated + (baseEntries × promoMultiplier)
 */
```

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: 0 errors. (The dispatcher's `params` arg already accepts the new optional field via the updated interface.)

### Task 2: Add tests for the calculator

**Files:**
- Create: `src/utils/payment/__tests__/subscription-entries-calculator.test.ts`
- Modify: `package.json` (add `test:subscription-entries-calculator` script)

- [ ] **Step 1: Create the test file**

Create `src/utils/payment/__tests__/subscription-entries-calculator.test.ts` with the following content (full file, no placeholders):

```ts
import assert from "node:assert/strict";
import {
  calculateUpgradeEntries,
  calculateSubscriptionEntries,
} from "../subscription-entries-calculator";

// --------------------------------------------------------------------------
// Mode A — no prior membership grant in active draw (the common case)
// --------------------------------------------------------------------------

function testModeAPrimaryScenario() {
  // Apr Tradie renewal accumulated 1115; May upgrade to Boss (base 100) with 5x promo
  const result = calculateUpgradeEntries(100, 1115, 5, false);
  assert.strictEqual(result.entriesToGrant, 1615, "Mode A primary grant");
  assert.strictEqual(result.newLastMonthAccumulatedEntries, 1615, "Mode A primary accum");
  assert.strictEqual(result.calculationType, "upgrade");
}

function testModeANoPromo() {
  // Mode A with promoMultiplier = 1 → stack still applies, no multiplier bonus
  const result = calculateUpgradeEntries(100, 1115, 1, false);
  assert.strictEqual(result.entriesToGrant, 1215);
  assert.strictEqual(result.newLastMonthAccumulatedEntries, 1215);
}

function testModeAFreshUpgrade() {
  // lastAccum = 0 (e.g., user fresh-subscribed and immediately upgraded with no prior history)
  const result = calculateUpgradeEntries(100, 0, 5, false);
  assert.strictEqual(result.entriesToGrant, 500);
  assert.strictEqual(result.newLastMonthAccumulatedEntries, 500);
}

// --------------------------------------------------------------------------
// Mode B — membership grant already in the active draw
// --------------------------------------------------------------------------

function testModeBRenewalThenUpgrade() {
  // May Tradie renewal granted 1130 → lastAccum = 1130. User then upgrades
  // to Boss (5x promo) in the same draw period.
  const result = calculateUpgradeEntries(100, 1130, 5, true);
  assert.strictEqual(result.entriesToGrant, 500, "Mode B grant is differential only");
  assert.strictEqual(
    result.newLastMonthAccumulatedEntries,
    1630,
    "Mode B accum = lastAccum + grant"
  );
}

function testModeBInitialThenUpgrade() {
  // Same-cycle initial-then-upgrade: initial Tradie granted 150 → lastAccum = 150.
  // User upgrades to Boss (5x) before the draw closes.
  const result = calculateUpgradeEntries(100, 150, 5, true);
  assert.strictEqual(result.entriesToGrant, 500);
  assert.strictEqual(result.newLastMonthAccumulatedEntries, 650);
}

// --------------------------------------------------------------------------
// Defensive input handling
// --------------------------------------------------------------------------

function testNegativeBaseEntriesCoercedToZero() {
  const result = calculateUpgradeEntries(-50, 100, 5, false);
  // newBase clamped to 0 → promoEntries = 0; Mode A: 100 + 0 = 100
  assert.strictEqual(result.entriesToGrant, 100);
  assert.strictEqual(result.newLastMonthAccumulatedEntries, 100);
}

function testNegativeLastMonthCoercedToZero() {
  const result = calculateUpgradeEntries(100, -200, 5, false);
  assert.strictEqual(result.entriesToGrant, 500);
  assert.strictEqual(result.newLastMonthAccumulatedEntries, 500);
}

function testPromoBelowOneCoercedToOne() {
  const result = calculateUpgradeEntries(100, 1115, 0.5, false);
  assert.strictEqual(result.entriesToGrant, 1215);
}

// --------------------------------------------------------------------------
// Dispatcher integration
// --------------------------------------------------------------------------

function testDispatcherRoutesUpgradeWithFlagFalse() {
  const result = calculateSubscriptionEntries({
    billingReason: "subscription_cycle",
    baseEntries: 100,
    lastMonthAccumulatedEntries: 1115,
    isResubscribe: false,
    promoMultiplier: 5,
    isUpgrade: true,
    hasMembershipGrantInCurrentDrawPeriod: false,
  });
  assert.strictEqual(result.entriesToGrant, 1615);
  assert.strictEqual(result.calculationType, "upgrade");
}

function testDispatcherRoutesUpgradeWithFlagTrue() {
  const result = calculateSubscriptionEntries({
    billingReason: "subscription_cycle",
    baseEntries: 100,
    lastMonthAccumulatedEntries: 1130,
    isResubscribe: false,
    promoMultiplier: 5,
    isUpgrade: true,
    hasMembershipGrantInCurrentDrawPeriod: true,
  });
  assert.strictEqual(result.entriesToGrant, 500);
  assert.strictEqual(result.newLastMonthAccumulatedEntries, 1630);
}

function testDispatcherDefaultsFlagToFalse() {
  // Flag omitted → defaults to false → Mode A
  const result = calculateSubscriptionEntries({
    billingReason: "subscription_cycle",
    baseEntries: 100,
    lastMonthAccumulatedEntries: 1115,
    isResubscribe: false,
    promoMultiplier: 5,
    isUpgrade: true,
  });
  assert.strictEqual(result.entriesToGrant, 1615);
}

// --------------------------------------------------------------------------
// Driver
// --------------------------------------------------------------------------

const tests: Array<[string, () => void]> = [
  ["Mode A primary scenario", testModeAPrimaryScenario],
  ["Mode A no promo", testModeANoPromo],
  ["Mode A fresh upgrade (lastAccum=0)", testModeAFreshUpgrade],
  ["Mode B renewal-then-upgrade", testModeBRenewalThenUpgrade],
  ["Mode B initial-then-upgrade", testModeBInitialThenUpgrade],
  ["Negative baseEntries clamped", testNegativeBaseEntriesCoercedToZero],
  ["Negative lastMonth clamped", testNegativeLastMonthCoercedToZero],
  ["Promo < 1 clamped", testPromoBelowOneCoercedToOne],
  ["Dispatcher routes flag=false", testDispatcherRoutesUpgradeWithFlagFalse],
  ["Dispatcher routes flag=true", testDispatcherRoutesUpgradeWithFlagTrue],
  ["Dispatcher defaults flag to false", testDispatcherDefaultsFlagToFalse],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`❌ ${name}`);
    console.error(err);
  }
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${tests.length} tests passed`);
```

- [ ] **Step 2: Wire the test:subscription-entries-calculator script**

Open `package.json`. Find the `scripts` block and add a new entry alongside the other `test:*` entries:

```json
"test:subscription-entries-calculator": "tsx src/utils/payment/__tests__/subscription-entries-calculator.test.ts"
```

(Place it alphabetically near other `test:` scripts.)

- [ ] **Step 3: Run the test**

Run: `npm run test:subscription-entries-calculator`
Expected: 11 lines of `✅ ...` and `All 11 tests passed`.

If the test fails, revisit Task 1 — the assertions encode the spec's worked examples and must match exactly.

### Task 3: Add `hasMembershipGrantInCurrentDrawPeriod` helper

**Files:**
- Create: `src/utils/draws/has-membership-grant-this-draw.ts`

- [ ] **Step 1: Create the helper file**

Create `src/utils/draws/has-membership-grant-this-draw.ts` with:

```ts
/**
 * Returns true when the user already received a membership-source entry grant
 * in the currently active major draw. Used by the upgrade flow to decide
 * between Mode A (stack accumulated) and Mode B (legacy formula) — see
 * docs/superpowers/specs/2026-05-20-upgrade-accumulator-stacking-design.md.
 *
 * Fails open (returns false) on any error. Defaulting to Mode A is the
 * intended behavior; the worst case is a rare over-credit in the
 * renewal-then-upgrade-same-period edge case.
 */

import { Types } from "mongoose";
import MajorDraw from "@/models/MajorDraw";

export async function hasMembershipGrantInCurrentDrawPeriod(
  userId: Types.ObjectId | string
): Promise<boolean> {
  try {
    const draw = await MajorDraw.findOne({ status: "active" })
      .select({ entries: 1 })
      .lean();
    if (!draw) return false;

    const userIdStr = String(userId);
    const entry = (draw.entries ?? []).find((e) => String(e.userId) === userIdStr);
    const membershipCount = entry?.entriesBySource?.membership ?? 0;
    return membershipCount > 0;
  } catch (err) {
    console.error("hasMembershipGrantInCurrentDrawPeriod failed; defaulting to false", err);
    return false;
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: 0 errors.

### Task 4: Wire the helper into the webhook upgrade path

**Files:**
- Modify: `src/services/stripe-webhook-handlers/index.ts` (around lines 3529-3621 — the `isUpgrade` detection + `calculateSubscriptionEntries` call inside `handleInvoicePaymentSucceeded`)

- [ ] **Step 1: Import the helper**

In `src/services/stripe-webhook-handlers/index.ts`, find the existing imports for entries-related utilities (near the top of the file). Add this import next to them:

```ts
import { hasMembershipGrantInCurrentDrawPeriod } from "@/utils/draws/has-membership-grant-this-draw";
```

- [ ] **Step 2: Compute the flag before invoking the calculator**

Find the `calculateSubscriptionEntries({...})` call (around line 3583). Immediately *before* that call, add:

```ts
    const hasGrantThisDraw = isUpgrade
      ? await hasMembershipGrantInCurrentDrawPeriod(user._id)
      : false;
```

Then modify the `calculateSubscriptionEntries` invocation to pass the new field:

```ts
    const entryCalculation = calculateSubscriptionEntries({
      billingReason: billingReasonForEntries,
      baseEntries,
      lastMonthAccumulatedEntries: user.subscription?.lastMonthAccumulatedEntries,
      isResubscribe,
      promoMultiplier,
      isUpgrade,
      currentAccumulatedEntries,
      hasMembershipGrantInCurrentDrawPeriod: hasGrantThisDraw,
    });
```

- [ ] **Step 3: Add the flag to the existing webhook log**

Find the `webhookLog("info", "📊 Entry calculation:", { ... })` block (around line 3611). Extend its payload object with one new field:

```ts
    webhookLog("info", `📊 Entry calculation:`, {
      calculationType: entryCalculation.calculationType,
      baseEntries,
      entriesToGrant,
      newLastMonthAccumulatedEntries,
      isResubscribe,
      isUpgrade,
      hasMembershipGrantInCurrentDrawPeriod: hasGrantThisDraw,
      promoMultiplier:
        expandedInvoice.billing_reason === "subscription_create" || isResubscribe ? promoMultiplier : "N/A (renewal)",
      previousAccumulated: user.subscription?.lastMonthAccumulatedEntries,
    });
```

- [ ] **Step 4: Add a focused upgrade-mode log**

Find the `if (isUpgrade) { webhookLog("info", "🎯 UPGRADE DETECTED: ...") }` block (around line 3623). Add one more log line inside that block, after the existing two:

```ts
      webhookLog(
        "info",
        `🎯 UPGRADE MODE: ${hasGrantThisDraw ? "B (legacy — grant already this draw period)" : "A (stack — no prior membership grant this draw)"}`
      );
```

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: 0 errors.

- [ ] **Step 6: Re-run the calculator tests**

Run: `npm run test:subscription-entries-calculator`
Expected: `All 11 tests passed` (no change — webhook wiring doesn't affect the pure calculator).

### Task 5: Update documentation under `docs/subscription/` and `docs/billing-stripe/`

**Files:**
- Modify: existing docs in `docs/subscription/` that describe the entries calculator / upgrade behavior (the doc-sync hook will name the exact files when you run lint).
- Modify: existing docs in `docs/billing-stripe/` that describe the webhook upgrade path.
- Modify: `docs/draws/` if it references entry granting.

- [ ] **Step 1: Identify the affected docs**

Run: `npm run lint` (the doc-sync Stop hook reports stale docs on src/ edits).

Or directly list candidate files:

```
ls docs/subscription
ls docs/billing-stripe
ls docs/draws
```

The exact files that mention `calculateUpgradeEntries` or "upgrade entries" are the ones to edit.

- [ ] **Step 2: Update the docs**

For each doc that describes upgrade-entries behavior, update the formula text and worked example to reflect Mode A / Mode B. Use the spec's table in §3 as the canonical example. Add a one-paragraph note pointing at the helper for the same-period detection.

- [ ] **Step 3: Bump `lastVerified` in CLAUDE.md if needed**

If the manifest entries for `subscription` or `billing-stripe` need a `lastVerified` bump after this change, the Stop hook will tell you. Apply its diff.

### Task 6: Commit Phase 1

- [ ] **Step 1: Confirm clean tree state**

Run: `git status` and `git diff --stat`. Expected files touched:

- `src/utils/payment/subscription-entries-calculator.ts`
- `src/utils/payment/__tests__/subscription-entries-calculator.test.ts` (new)
- `src/utils/draws/has-membership-grant-this-draw.ts` (new)
- `src/services/stripe-webhook-handlers/index.ts`
- `package.json`
- `docs/subscription/...` and possibly `docs/billing-stripe/...`

No other files.

- [ ] **Step 2: Stage and commit**

⚠️ **Authorization gate:** the repo's `no-auto-commit` hook blocks commits unless the user has authorized commits this session with `commit`, `push`, `merge`, or similar. If unauthorized, stop here and ask:

> "Phase 1 is ready to commit. Authorize commit?"

If authorized:

```bash
git add src/utils/payment/subscription-entries-calculator.ts \
        src/utils/payment/__tests__/subscription-entries-calculator.test.ts \
        src/utils/draws/has-membership-grant-this-draw.ts \
        src/services/stripe-webhook-handlers/index.ts \
        package.json \
        docs/subscription docs/billing-stripe
git commit -m "fix(subscription): stack lastMonthAccumulated into mid-cycle upgrade grant

Mid-cycle upgrades now grant lastMonthAccumulated + newBase × promo to the
current draw (Mode A), removing a backwards incentive where upgrading
mid-cycle produced fewer entries than letting the cheaper tier renew.

When a membership grant already landed in the active major draw (renewal-
then-upgrade in the same period), the legacy newBase × promo formula is
preserved (Mode B) so the draw is not double-credited.

Spec: docs/superpowers/specs/2026-05-20-upgrade-accumulator-stacking-design.md"
```

- [ ] **Step 3: Verify**

Run: `git log --oneline -1`
Expected: the just-created commit at HEAD.

---

## Phase 2 — UI preview parity

After Phase 1 the webhook grants the correct number. The 4 modal previews still show the *old* (pre-stack) total because their inputs are unchanged. This phase routes the same flag through the user payload so previews and webhook agree.

### Task 7: Expose `hasCurrentDrawMembershipGrant` from the my-account user serializer

**Files:**
- Modify: `src/app/api/users/[id]/my-account/route.ts:170-184` (the `Promise.all` block — add the helper call) and `:219-236` (the response payload — surface the flag).

- [ ] **Step 1: Import the helper**

In `src/app/api/users/[id]/my-account/route.ts`, near the top with the other imports, add:

```ts
import { hasMembershipGrantInCurrentDrawPeriod } from "@/utils/draws/has-membership-grant-this-draw";
```

- [ ] **Step 2: Fetch the flag alongside the existing parallel reads**

Find the `Promise.all([...])` around line 171. Replace it with:

```ts
    const [activeMiniDraws, recentOrders, hasCurrentDrawMembershipGrant] = await Promise.all([
      MiniDraw.find({
        isActive: true,
        endDate: { $gt: new Date() },
      })
        .limit(5)
        .lean(),
      Order.find({
        userId: userData._id,
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      hasMembershipGrantInCurrentDrawPeriod(userData._id),
    ]);
```

- [ ] **Step 3: Surface the flag on the response**

Find the `NextResponse.json({ success: true, data: { user: { ... } } })` block around line 219. Update the `user` object spread to include the new flag:

```ts
        user: {
          ...userData,
          subscriptionPackageData,
          enrichedOneTimePackages: oneTimePackageData,
          hasCurrentDrawMembershipGrant,
        },
```

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: 0 errors.

### Task 8: Wire the flag into the 4 preview call sites

**Files:**
- Modify: `src/components/modals/SubscriptionManagementModal/UpgradeList.tsx:42-50`
- Modify: `src/components/modals/SubscriptionManagementModal/index.tsx:314-321`
- Modify: `src/components/modals/SubscriptionManagementModal/index.tsx:341-352`
- Modify: `src/components/modals/SubscriptionManagementModal/index.tsx:664-674`

- [ ] **Step 1: Update `UpgradeList.tsx`**

Open `src/components/modals/SubscriptionManagementModal/UpgradeList.tsx`. Find the existing block:

```tsx
        const subscriptionWithEntries = user.subscription as
          | { lastMonthAccumulatedEntries?: number }
          | undefined;
        const lastMonthAccumulated = subscriptionWithEntries?.lastMonthAccumulatedEntries ?? 0;
        const upgradeCalculation = calculateUpgradeEntries(
          upgrade.entriesPerMonth,
          lastMonthAccumulated,
          membershipPromoMultiplier
        );
```

Replace with:

```tsx
        const subscriptionWithEntries = user.subscription as
          | { lastMonthAccumulatedEntries?: number }
          | undefined;
        const lastMonthAccumulated = subscriptionWithEntries?.lastMonthAccumulatedEntries ?? 0;
        const userWithDrawFlag = user as { hasCurrentDrawMembershipGrant?: boolean };
        const hasGrantThisDraw = userWithDrawFlag.hasCurrentDrawMembershipGrant ?? false;
        const upgradeCalculation = calculateUpgradeEntries(
          upgrade.entriesPerMonth,
          lastMonthAccumulated,
          membershipPromoMultiplier,
          hasGrantThisDraw
        );
```

- [ ] **Step 2: Update `index.tsx:314-321` (upgrade modal data memo)**

Open `src/components/modals/SubscriptionManagementModal/index.tsx`. Find the existing block (search for `upgradeModalData = useMemo`):

```tsx
    const subscriptionWithEntries = user.subscription as { lastMonthAccumulatedEntries?: number } | undefined;
    const currentEntries = subscriptionWithEntries?.lastMonthAccumulatedEntries ?? 0;
    const { entriesToGrant } = calculateUpgradeEntries(
      selectedUpgrade.entriesPerMonth,
      currentEntries,
      membershipPromoMultiplier
    );
```

Replace with:

```tsx
    const subscriptionWithEntries = user.subscription as { lastMonthAccumulatedEntries?: number } | undefined;
    const currentEntries = subscriptionWithEntries?.lastMonthAccumulatedEntries ?? 0;
    const userWithDrawFlag = user as { hasCurrentDrawMembershipGrant?: boolean };
    const hasGrantThisDraw = userWithDrawFlag.hasCurrentDrawMembershipGrant ?? false;
    const { entriesToGrant } = calculateUpgradeEntries(
      selectedUpgrade.entriesPerMonth,
      currentEntries,
      membershipPromoMultiplier,
      hasGrantThisDraw
    );
```

- [ ] **Step 3: Update `index.tsx:341-352` (pending change banner branch)**

In the same file, find the `if (pending.changeType === "downgrade") { ... } else { newAccumulated = calculateUpgradeEntries(...) }` block. Replace the `else` branch with:

```tsx
      } else {
        const userWithDrawFlag = user as { hasCurrentDrawMembershipGrant?: boolean };
        const hasGrantThisDraw = userWithDrawFlag.hasCurrentDrawMembershipGrant ?? false;
        newAccumulated = calculateUpgradeEntries(
          targetPkg.entriesPerMonth,
          lastAccumulated,
          membershipPromoMultiplier,
          hasGrantThisDraw
        ).newLastMonthAccumulatedEntries;
      }
```

- [ ] **Step 4: Update `index.tsx:664-674` (totalEntriesAfterUpgrade branch)**

In the same file, find the existing block (search for `upgradeCalculation = calculateUpgradeEntries`):

```tsx
    const lastMonthAccumulated = subscriptionWithEntries?.lastMonthAccumulatedEntries ?? 0;

    let totalEntriesAfterUpgrade = upgrade?.entriesPerMonth ?? 0;
    let entriesFromUpgrade = 0;
    if (upgrade) {
      const upgradeCalculation = calculateUpgradeEntries(
        upgrade.entriesPerMonth,
        lastMonthAccumulated,
        membershipPromoMultiplier
      );
```

Replace with:

```tsx
    const lastMonthAccumulated = subscriptionWithEntries?.lastMonthAccumulatedEntries ?? 0;
    const userWithDrawFlag = user as { hasCurrentDrawMembershipGrant?: boolean };
    const hasGrantThisDraw = userWithDrawFlag.hasCurrentDrawMembershipGrant ?? false;

    let totalEntriesAfterUpgrade = upgrade?.entriesPerMonth ?? 0;
    let entriesFromUpgrade = 0;
    if (upgrade) {
      const upgradeCalculation = calculateUpgradeEntries(
        upgrade.entriesPerMonth,
        lastMonthAccumulated,
        membershipPromoMultiplier,
        hasGrantThisDraw
      );
```

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: 0 errors.

- [ ] **Step 6: Manual dev verification**

Start the dev server: `npm run dev`

In a browser, log in as a test user whose `lastMonthAccumulatedEntries > 0` and whose active major draw has *no* membership entries for them yet (i.e. expected Mode A).

Open the Subscription Management modal → Upgrade tab.

Expected: the "total after upgrade" number shown for each upgrade option equals `lastMonthAccumulated + (newBase × promoMultiplier)` (e.g. 1615 for the spec's worked example).

Then test a user whose active major draw *does* include their membership grant. Open the same modal — expected: the "total after upgrade" equals `lastMonthAccumulated + (newBase × promoMultiplier)` *as the accumulator*, but the **entries-to-grant** preview equals just `newBase × promoMultiplier`. (See spec §3 worked-examples table.)

If numbers don't match the table in spec §3, stop and revisit Tasks 1–4.

### Task 9: Update documentation

**Files:**
- Modify: `docs/subscription/` doc(s) describing the upgrade modal UX.
- Modify: `docs/dashboard-account/` if it references the my-account user payload shape.

- [ ] **Step 1: Identify the affected docs**

Run: `npm run lint` and watch for doc-sync hook output. Or list:

```
ls docs/subscription
ls docs/dashboard-account
```

- [ ] **Step 2: Apply the changes**

Add a note in the subscription doc that the upgrade modal previews now read `hasCurrentDrawMembershipGrant` from the user payload and route through `calculateUpgradeEntries`'s 4th argument.

### Task 10: Commit Phase 2

- [ ] **Step 1: Confirm clean tree state**

Run: `git status`. Expected files touched:

- `src/app/api/users/[id]/my-account/route.ts`
- `src/components/modals/SubscriptionManagementModal/UpgradeList.tsx`
- `src/components/modals/SubscriptionManagementModal/index.tsx`
- `docs/subscription/...` and possibly `docs/dashboard-account/...`

- [ ] **Step 2: Stage and commit**

⚠️ **Authorization gate:** check the no-auto-commit hook (see Phase 1 Task 6).

If authorized:

```bash
git add src/app/api/users/[id]/my-account/route.ts \
        src/components/modals/SubscriptionManagementModal/UpgradeList.tsx \
        src/components/modals/SubscriptionManagementModal/index.tsx \
        docs/subscription docs/dashboard-account
git commit -m "feat(subscription): show stacked-accumulator total in upgrade preview UI

The 4 upgrade preview sites now read hasCurrentDrawMembershipGrant from
the my-account user payload so previews match the webhook's grant.

Spec: docs/superpowers/specs/2026-05-20-upgrade-accumulator-stacking-design.md"
```
