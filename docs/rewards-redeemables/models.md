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

> _TODO: schema, relationship to MilestoneReward._

## `MilestoneReward`

[src/models/MilestoneReward.ts](../../src/models/MilestoneReward.ts) — config: tier definitions and what each tier unlocks.

> _TODO: schema._
