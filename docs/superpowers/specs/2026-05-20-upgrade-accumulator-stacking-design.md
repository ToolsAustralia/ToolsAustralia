# Upgrade Entry Accumulator Stacking — Design Spec

_Date: 2026-05-20 · Domain: `subscription` (+ touches `billing-stripe`, `draws`) · Scope: **backend math + UI preview parity, no schema changes**_

Fixes a backwards incentive in `calculateUpgradeEntries`: a mid-cycle upgrade currently grants only `newBase × promo` to the current draw, which can be fewer entries than letting the cheaper tier renew. Active members who upgrade should not be penalized for upgrading.

## 1. Problem statement

A user on a multi-month subscription has `lastMonthAccumulatedEntries = 1115` (Boss → Tradie downgrade history). They upgrade mid-cycle to Boss during a 5x promo. Today they receive only `100 × 5 = 500` entries to the current draw — the 1115 they had been accumulating is held back for the *next* renewal.

Net result over two months (upgrade vs. staying on the cheaper tier):

| Path | May draw | Jun draw | Total | Cost |
|---|---|---|---|---|
| Upgrade May 20 to Boss (today) | 500 | 1715 | 2,215 | $80 + $80 |
| Stay on Tradie | 1,130 | 1,145 | 2,275 | $20 + $20 |

The user pays **4× more and gets fewer entries**. The asymmetry is purely structural: renewals use `accumulated + base`, upgrades use `newBase × promo`. They never combine.

## 2. Scope (locked)

| # | Item | Decision |
|---|---|---|
| 1 | `calculateUpgradeEntries` math change | Stack `lastMonthAccumulated` into the upgrade grant — see §3. |
| 2 | Same-period guard | Detect whether the user already received a membership grant in the active major draw; if so, fall back to the legacy `newBase × promo` math — see §4. |
| 3 | Webhook handler wiring | Compute the same-period flag in `handleInvoicePaymentSucceeded` and pass it through `calculateSubscriptionEntries` — see §5. |
| 4 | UI preview parity | Make the 4 modal preview call sites display the new total. Add a server-supplied flag on the user payload so previews don't need to re-query the major draw — see §6. |
| 5 | Tests | New `subscription-entries-calculator.test.ts` with both modes + a `test:` script in `package.json` — see §7. |

**Non-goals.**
- No schema change to `User.subscription` (the same-period flag is computed, not stored).
- No change to `calculateResubscribeEntries`, `calculateRenewalEntries`, or `calculateInitialSubscriptionEntries`. The active-vs-returning asymmetry is intentional.
- No change to Stripe billing setup (`billing_cycle_anchor: "now"` on upgrade is correct and load-bearing for the design).
- No copy redesign on the upgrade modals. If numbers shift visibly, copy revision is a follow-up.

## 3. New `calculateUpgradeEntries` math

Signature gains one parameter: `hasMembershipGrantInCurrentDrawPeriod: boolean` (default `false`).

```ts
export function calculateUpgradeEntries(
  newBaseEntries: number,
  lastMonthAccumulatedEntries: number = 0,
  promoMultiplier: number = 1,
  hasMembershipGrantInCurrentDrawPeriod: boolean = false,
): CalculateSubscriptionEntriesResult
```

Two branches:

**Mode A — no prior membership grant in active draw (the common case):**
```
entriesToGrant            = lastMonthAccumulated + (newBase × promoMultiplier)
newLastMonthAccumulated   = entriesToGrant
```

**Mode B — membership grant already landed in active draw (renewal-then-upgrade-same-period):**
```
entriesToGrant            = newBase × promoMultiplier          // legacy formula
newLastMonthAccumulated   = lastMonthAccumulated + entriesToGrant
```

Worked examples:

| Scenario | lastMonthAccum | newBase | promo | hasGrantThisDraw | entriesToGrant | newLastMonthAccum |
|---|---|---|---|---|---|---|
| Apr Tradie renewal → May Boss upgrade (5x) | 1115 | 100 | 5 | false | **1615** | 1615 |
| Apr Tradie renewal → May Boss upgrade (no promo) | 1115 | 100 | 1 | false | 1215 | 1215 |
| May Tradie renewal → May Boss upgrade same draw (5x) | 1130 | 100 | 5 | true | **500** | 1630 |
| Fresh user initial then upgrade same draw (5x) | 150 | 100 | 5 | true | 500 | 650 |
| `lastAccum = 0` (no history) | 0 | 100 | 5 | false | 500 | 500 |

**Invariant the design enforces:** total membership entries credited to the user in any single major draw period = `lastMonthAccumulated_at_start_of_period + newBase × promo`, regardless of how many entry-granting events fire in that period. Mode B preserves the invariant by only crediting the differential.

`calculateSubscriptionEntries` (the entry-point dispatcher at [subscription-entries-calculator.ts:205](src/utils/payment/subscription-entries-calculator.ts#L205)) gets a corresponding parameter and threads it into the `isUpgrade` branch.

## 4. Computing `hasMembershipGrantInCurrentDrawPeriod`

Truth source: `MajorDraw.entries[]` ([src/models/MajorDraw.ts:43-57](src/models/MajorDraw.ts#L43-L57)). Each row already tracks `entriesBySource.membership` per user.

Procedure:
1. Load the `MajorDraw` with `status === "active"`. If none exists (between draws), `hasMembershipGrantInCurrentDrawPeriod = false`.
2. Find `draw.entries.find(e => e.userId.equals(user._id))`.
3. `hasMembershipGrantInCurrentDrawPeriod = (entry?.entriesBySource?.membership ?? 0) > 0`.

Encapsulate in a helper at `src/utils/draws/has-membership-grant-this-draw.ts` exporting `hasMembershipGrantInCurrentDrawPeriod(userId: Types.ObjectId): Promise<boolean>`.

Returns `false` on any error / missing data. That defaults the upgrade to Mode A (stacking). Trade-off acknowledged: a helper failure during the rare renewal-then-upgrade-same-period edge case could over-credit. We accept that over reversing the fix — the headline bug is under-crediting, and defaulting to the more generous branch is consistent with the spec's intent.

## 5. Webhook wiring

[src/services/stripe-webhook-handlers/index.ts](src/services/stripe-webhook-handlers/index.ts) — `handleInvoicePaymentSucceeded`, the block around line 3529 that already computes `isUpgrade`.

Changes:
- Just before the `calculateSubscriptionEntries({...})` call (~line 3585), if `isUpgrade`, call the helper and pass `hasMembershipGrantInCurrentDrawPeriod` through the params.
- Update the diagnostic logs (existing `console.log` near line 3562 and the structured `webhookLog` at ~3614) to log the flag so we can trace edge-case behavior in staging.

No change to invoice-event creation, Klaviyo sync, or referral processing.

## 6. UI preview parity

Four call sites currently call `calculateUpgradeEntries` for preview:

- [UpgradeList.tsx:46](src/components/modals/SubscriptionManagementModal/UpgradeList.tsx#L46)
- [SubscriptionManagementModal/index.tsx:316](src/components/modals/SubscriptionManagementModal/index.tsx#L316)
- [SubscriptionManagementModal/index.tsx:347](src/components/modals/SubscriptionManagementModal/index.tsx#L347)
- [SubscriptionManagementModal/index.tsx:669](src/components/modals/SubscriptionManagementModal/index.tsx#L669)

Each needs the new flag. Cheapest path: surface the flag on the user payload that the modal already consumes.

**Implementation:**
- Add a derived field `subscription.hasCurrentDrawMembershipGrant?: boolean` to the user serializer used by the my-account page / subscription modal (wherever the `SubMgmtUser` is built — likely the `/api/users/:id/my-account` route or its loader).
- Populate it server-side using the same `hasMembershipGrantInCurrentDrawPeriod` helper from §4.
- The 4 preview sites pass it as the 4th argument to `calculateUpgradeEntries`.

**Why not a TanStack Query hook?** The flag is cheap, derived, and already-correlated with the user load. A separate query is extra round-trip and cache-invalidation surface for no win.

**Why not recompute it client-side?** The client doesn't have the active `MajorDraw` document and shouldn't fetch it just for this.

Stale-payload caveat: if a renewal lands between page load and the user clicking "Upgrade," the preview can be off by one mode. Acceptable — the webhook is the source of truth for the actual grant, and refresh fixes the preview.

## 7. Tests

New file: `src/utils/payment/__tests__/subscription-entries-calculator.test.ts`. The repo's test runner is `tsx` scripts wired in `package.json`. Add:

```
"test:subscription-entries-calculator": "tsx src/utils/payment/__tests__/subscription-entries-calculator.test.ts"
```

Coverage (each a separate assertion block):
1. Mode A primary case: `(1115, 100, 5, false) → grant 1615, accum 1615`.
2. Mode A no promo: `(1115, 100, 1, false) → grant 1215, accum 1215`.
3. Mode B renewal-then-upgrade: `(1130, 100, 5, true) → grant 500, accum 1630`.
4. Mode B initial-then-upgrade: `(150, 100, 5, true) → grant 500, accum 650`.
5. `lastAccum = 0` fresh upgrade: `(0, 100, 5, false) → grant 500, accum 500`.
6. Defensive: negative inputs default to 0 (existing behavior preserved).
7. `calculateSubscriptionEntries` dispatcher: `isUpgrade: true` + flag combinations route to the correct mode.

No new test for the `hasMembershipGrantInCurrentDrawPeriod` helper — it's a thin Mongo query; covering it in the webhook test (if any is added later) is sufficient.

## 8. Phase plan

**Phase 1 — Calculator + helper + webhook wiring** (ships the fix, must land together):
- Update signature and math in `calculateUpgradeEntries` + `calculateSubscriptionEntries`.
- Add `hasMembershipGrantInCurrentDrawPeriod` helper at `src/utils/draws/has-membership-grant-this-draw.ts`.
- Wire helper into the webhook upgrade path in `handleInvoicePaymentSucceeded`.
- Add diagnostic logs for the new flag.
- Write `subscription-entries-calculator.test.ts` covering all cases in §7; wire `test:subscription-entries-calculator` script.

**Phase 2 — UI preview parity** (cosmetic; webhook is already correct after phase 1):
- Add `hasCurrentDrawMembershipGrant` to the my-account user serializer.
- Update all 4 preview call sites to pass the flag.
- Manual check in the dev modals that the displayed totals match what the webhook would grant.

Phase 1 ships the real user-visible behavior change. Phase 2 brings the previews into agreement with the webhook so users see the correct number before clicking "Upgrade."

## 9. Manifest

All edited paths are already covered by the `subscription` and `billing-stripe` domains in the manifest. No new domain or path-glob change required. `docs/subscription/` and `docs/billing-stripe/` get updates in the same task per the doc-sync hook.

## 10. Out of scope follow-ups

- `calculateResubscribeEntries` has the same asymmetry but the active-vs-returning distinction is intentional (see `2026-05-20-resubscribe-tier-choice-ux-design.md`).
- Display copy on the upgrade modals if the new totals warrant clarification ("Includes carried-over entries from your subscription history").
