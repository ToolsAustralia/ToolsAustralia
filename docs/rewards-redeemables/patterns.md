# Rewards-Redeemables — Patterns

## P1. Service-per-action

Distinct services for distinct actions: `RedemptionService` (redeem), `CampaignService` (issue), `DrawGrantService` (draw-tied issue), `TargetingService` (filter). Don't merge — keeps each file focused and testable.

## P2. Pure-targeting / impure-action split

`TargetingService` and `campaignAudienceFilter.ts` are pure (input → user list). `CampaignService.run()` is impure (writes issuances). The split mirrors the [subscription P1 pure-policy pattern](../subscription/patterns.md#p1-pure-policy-split-for-testability).

## P3. Stable issuance keys

Like Stripe idempotency: every `RedeemableIssuance` has a deterministic key derived from `(campaignId | drawId, userId)` so re-runs and webhook retries don't double-issue.

## P4. Reverser modules for refund symmetry

Refund symmetry is implemented as named reversal steps (`campaignUnredeem`, `milestoneRevoke`, `promoLink.unredeem`, …) registered in `buildLedgerReversalSteps` ([src/utils/payment/refund-ledger-reversal.ts](../../src/utils/payment/refund-ledger-reversal.ts)) and run by the generic orchestrator under [src/utils/payment/reversers/](../../src/utils/payment/reversers/). Steps claw back redeemed grants too (un-redeem, then revoke). Follows the [payment P1 reverser pattern](../payment/patterns.md#p1-reverser-modules-per-grant-type).

## P5. Wallet read uses TanStack Query, not Zustand

Per CLAUDE.md client-state conventions, server-derived state (the wallet) is owned by TanStack Query. Don't mirror it into Zustand.

## P6. Spotlight via localStorage

Per-user UX state (which spotlights / first-seen tutorials this user has dismissed) lives in localStorage via `rewards-widget-spotlight-storage.ts`. Don't store in Mongo — too fine-grained and not security-relevant.

## Cursor agent

`.cursor/agents/growth-integrations.md` covers this domain along with promo and tracking. Read its boundary before non-trivial changes.
