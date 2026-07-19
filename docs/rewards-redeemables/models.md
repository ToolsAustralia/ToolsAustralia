# Rewards-Redeemables — Models

## `RedeemableIssuance`

[src/models/RedeemableIssuance.ts](../../src/models/RedeemableIssuance.ts) — one row per granted redeemable.

Key fields (typical):
- `userId: ObjectId`
- `campaignId?: ObjectId | drawId?: ObjectId`
- `redeemableType: string`
- `status: "active" | "redeemed" | "revoked" | "expired"`
- `issuedAt`, `redeemedAt?`, `expiresAt?`
- `idempotencyKey` (unique per `(source, userId)`)

> _TODO: pull exact schema._

## `MilestoneIssuance`

[src/models/MilestoneIssuance.ts](../../src/models/MilestoneIssuance.ts) — record of when a user achieved a milestone tier.

- `milestoneType` ∈ `spend-amount | entries-gained | loyalty-days | streak-months` (streak-months added P2, 2026-07-07).
- `status` ∈ `active | redeemed | expired | cancelled | revoked | backfilled`. **`backfilled`** = a Membership Streak rung the member passed *before* the feature launched — visible as completed on the P3 ladder, **blocks re-issuance** via the unique index, granted **zero** entries, excluded from the claim wallet and from `issuedCount`/`totalEntriesGranted` aggregates.
- `streakGeneration` (default 1) — the user's `subscription.streakGeneration` at issue time; **the unique index is `(milestoneRewardId, userId, streakGeneration, achievementCycle)`** so streak rungs are re-earnable after a full lapse → resubscribe reset. The legacy 3-field index is dropped by `scripts/seed-streak-milestone-rewards.ts` step 0.
- `achievementCycle` — recurring rewards issue one cycle per whole multiple of the threshold (`computeCycles`); the streak's 12-renewal rung is the single recurring row (cycle 1 = Founding, cycle 2 = 24 renewals, …).

## `MilestoneReward`

[src/models/MilestoneReward.ts](../../src/models/MilestoneReward.ts) — config: tier definitions and what each tier unlocks.

- `milestoneType` as above; `threshold` (metric units — **renewals** for streak-months); `entriesAmount`; unique `code`; `isRecurring`; `startsAt`/`endsAt`/`neverExpires`.
- **`recurrencePeriod`** (P2): recurrence cadence for recurring rewards. Unset → legacy `floor(metric/threshold)` cycles (spend/entries rewards unchanged). Set to **12** on all six streak rungs → each rung repeats every 12 renewals after its threshold (`computeCycles`), so the **full ladder cycles annually** — month 14 ≡ month 2 (+100 again), month 24 ≡ month 12 (+600). Owner decision 2026-07-07.
- **`autoGrant`** (P2): when true the issuance bypasses the manual claim step — `RedemptionService.autoRedeemMilestoneIssuance` grants the free entries straight into the target Major Draw under the **`streak`** source bucket. All six streak rungs (`STREAK-2R … STREAK-12R`, seeded by `seed:streak-rewards`) are autoGrant + recurring with period 12.
