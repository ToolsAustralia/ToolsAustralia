# Resubscribe Tier Choice + Carry-Over Surfacing — Design Spec

_Date: 2026-05-20 · Domain: `subscription` (+ touches `dashboard-account`, `cart-shop-products`) · Scope: **UI only, no math or schema changes**_

The backend already supports resubscribing to any tier and correctly preserves `lastMonthAccumulatedEntries` across cancellation gaps. The UI does not: cancelled users only see "Reactivate" (same tier), and the success page never tells the returning user that their prior accumulation carried over. This spec brings the UI up to the backend's capabilities.

## 1. Problem statement

A cancelled user sees ([src/components/modals/SubscriptionManagementModal/EmptyStates.tsx:61](src/components/modals/SubscriptionManagementModal/EmptyStates.tsx#L61)):
> "Your subscription has been cancelled. You can reactivate it anytime."

The UI path is "reactivate the same package." But `POST /api/stripe/create-subscription-existing-user` already accepts any `packageId` ([create-subscription-existing-user/route.ts:37](src/app/api/stripe/create-subscription-existing-user/route.ts#L37)), and `calculateResubscribeEntries` correctly preserves the accumulator with `newLastMonthAccumulated = lastMonthAccumulated + (newBase × promo)` ([subscription-entries-calculator.ts:158](src/utils/payment/subscription-entries-calculator.ts#L158)) regardless of which tier the user picks.

Worked example (verified against existing logic):

| Event | Formula | Grant | lastMonthAccumulated |
|---|---|---|---|
| Mar 15 initial Boss (10x) | 100 × 10 | 1000 | 1000 |
| Apr 15 subscription ends | — | — | 1000 (preserved) |
| May 10 resubscribe Tradie (10x) | 15 × 10 | **150** | 1000 + 150 = 1150 |
| Jun 10 renewal Tradie | 1150 + 15 | 1165 | 1165 |

The 150-entries May draw lands without any indication to the user that the 1000 prior entries carried over. A returning Boss looking at "150 entries" in their account may reasonably conclude that the system lost their history.

## 2. Scope (locked)

| # | Item | Decision |
|---|---|---|
| 1 | Cancelled-user empty state — replace single "Reactivate" with tier picker | Show all active membership tiers. Each card uses the same `create-subscription-existing-user` flow. Same-tier resubscribe is one of N options, not the only one. See §3. |
| 2 | Success page carry-over banner | When the user just resubscribed (not initial subscription, not renewal), show a banner with: previous accumulated, this grant, projected next-renewal entries. See §4. |
| 3 | Activity tab — show carry-over context | In the major draw activity card for the current period, when `entriesBySource.membership` is the result of a resubscribe, surface the breakdown ("Resubscribe grant: 150 · Carry-over from previous membership: 1000"). See §5. |

**Non-goals.**
- No backend changes. `create-subscription-existing-user`, `calculateResubscribeEntries`, the webhook resubscribe-detection metadata flag — all unchanged.
- No change to `MajorDraw.entries[]` schema. The accumulator is already on `User.subscription.lastMonthAccumulatedEntries`.
- No change to the active member's "Upgrade / Downgrade" UX. This spec is the cancelled-user surface only.
- No A/B test scaffolding. Roll it out direct.

## 3. Cancelled-user tier picker

[EmptyStates.tsx](src/components/modals/SubscriptionManagementModal/EmptyStates.tsx) currently renders a single CTA when `status === "canceled"`. Replace with a tier picker:

**Component:** new file `src/components/modals/SubscriptionManagementModal/ResubscribeTierPicker.tsx`. Imported by `EmptyStates.tsx` and rendered in the `status === "canceled"` branch.

**Inputs:**
- `packages: MembershipPackage[]` — fetched the same way as the upgrade/downgrade lists already do.
- `previousPackageId?: string` — surfaced as a "Previously: Boss" badge on the matching card, no special behavior beyond the visual cue.
- `promoMultiplier: number` — the same `useResolvedMultiplier()` the modal already uses.
- `lastMonthAccumulatedEntries: number` — pulled from `user.subscription.lastMonthAccumulatedEntries`.

**Display per tier card:**
- Tier name + price.
- "Sign up grant: {baseEntries × promoMultiplier}" with promo badge when `> 1`.
- "Your carry-over: {lastMonthAccumulatedEntries}" — same text on every card (the carry-over is tier-independent).
- "Next month: {lastMonthAccumulatedEntries + baseEntries × promoMultiplier + baseEntries}" — preview of first renewal.

**Click handler:** call the existing `create-subscription-existing-user` flow with the selected `packageId`. The webhook's resubscribe detection already handles the rest (`isResubscribe: "true"` metadata flag set by the API at [create-subscription-existing-user/route.ts](src/app/api/stripe/create-subscription-existing-user/route.ts), see [docs/SUBSCRIPTION_RESUBSCRIBE_ENTRIES.md](docs/SUBSCRIPTION_RESUBSCRIBE_ENTRIES.md)).

**Removed text:** the "Your subscription has been cancelled" sentence becomes a smaller subtitle above the picker. The "You can reactivate it anytime" copy goes — the picker self-explains.

## 4. Success-page carry-over banner

[src/app/(site)/purchase-success/components/PurchaseSuccessClient.tsx](src/app/(site)/purchase-success/components/PurchaseSuccessClient.tsx) renders the post-payment success view.

**Trigger:** when the just-completed purchase is a resubscribe — detected via the `isResubscribe` flag the backend already stores on the subscription. Surface it through whatever data path PurchaseSuccessClient uses to load the user's current subscription state. (Cheapest: include `wasResubscribe: boolean` in the success page query result, derived from `user.subscription.metadata.isResubscribe === "true"` *at the time of the latest invoice*.)

**Banner content:**
> 👋 Welcome back! Your previous **{lastMonthAccumulated_before_resubscribe}** accumulated entries carried over.
> This month's draw: **{thisGrant}** entries. Next month's renewal will give you **{nextRenewalProjection}**.

Numbers come from `lastMonthAccumulatedEntries` on the user. Post-resubscribe accumulator = `previous + thisGrant`. `thisGrant = baseEntries × promoMultiplier` (known from the picked package + current promo). `previous = currentAccum − thisGrant`. **Derive — no new schema field.**

**Style:** matches the existing success page tone (no separate design system). One card at the top of the success layout, dismissible.

## 5. Activity tab carry-over context

[src/app/(site)/my-account/components/MajorDrawOverview.tsx](src/app/(site)/my-account/components/MajorDrawOverview.tsx) renders the per-draw activity cards (the right-hand screenshot in the brainstorming session).

Today the card shows `Entries by source: Membership: 150`. For resubscribe months only, append a sub-line:

> Membership: 150 · *(Resubscribe + carry-over 1000 → next month 1165)*

**Trigger detection:** add one optional field to `User.subscription`:

```ts
lastResubscribedAt?: Date;
```

Written in `create-subscription-existing-user/route.ts` at the point where the API already detects resubscribe and sets the `isResubscribe: "true"` Stripe metadata. Read by the activity card: a major draw whose `activationDate ≤ lastResubscribedAt ≤ drawDate` is the "resubscribe draw."

This is the only schema change in either spec. It is *not* load-bearing for the entries math — purely a UX surface for the activity card.

## 6. Phase plan

**Phase 1 — Tier picker** (largest user-visible win, fully isolated):
- New `ResubscribeTierPicker` component.
- Wire into `EmptyStates.tsx` cancelled branch.
- Manual test in dev: cancelled user sees picker; clicking any tier completes the resubscribe.

**Phase 2 — Success banner** (touches one route component):
- Add `wasResubscribe` to the success-page data load.
- Render banner conditionally.
- Manual test: complete a resubscribe end-to-end; banner appears with correct numbers.

**Phase 3 — Activity tab context** (smallest, requires the one schema add):
- Add `lastResubscribedAt` to `User` model + write site.
- Update `MajorDrawOverview` to render the sub-line.
- Manual test: backfill the field for one test user, confirm rendering.

Phase 1 alone delivers the headline "you can pick any tier" feature. Phase 2 closes the trust gap on the success page. Phase 3 is a polish pass and can ship on its own cadence.

## 7. Manifest

All edited paths are covered:
- `subscription` — `SubscriptionManagementModal/**`, `User.ts`, `create-subscription-existing-user`.
- `dashboard-account` — `my-account/**`.
- `cart-shop-products` — `purchase-success/**`.

No new domain entries needed.

## 8. Out of scope follow-ups

- Same picker UX for users in `past_due` / `unpaid` recovery states. Their current modal flow is recovery-payment-focused; widening tier choice there is a separate decision.
- Email confirmation of the carry-over after resubscribe. Today's resubscribe email is the standard invoice-receipt path.
- Affiliate / referral commission on resubscribe — already handled by existing webhook paths.
