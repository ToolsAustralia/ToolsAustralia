# Rewards & Redeemables domain

Two related systems:
- **Redeemables** — wallet-based system for rewards a user can redeem (campaigns, draws, milestone rewards, prize catalog).
- **Milestone progression** — tier achievements that unlock rewards.

## Index

- [architecture.md](./architecture.md) — wallet model, campaign targeting, milestone issuance
- [frontend.md](./frontend.md) — `usePrizeCatalog`, `useEntryRewardToast`, /rewards page, spotlight storage
- [backend.md](./backend.md) — RedemptionService, CampaignService, DrawGrantService, TargetingService, MilestoneIssuance
- [api.md](./api.md) — `/api/redeemables/**`, `/api/rewards/**`
- [rules.md](./rules.md) — wallet conservation, idempotency, ledger reversal on refund
- [patterns.md](./patterns.md) — campaign targeting, audience filters
- [gotchas.md](./gotchas.md) — pause behaviour, cancellation-upsell eligibility, top-percentile targeting
- [models.md](./models.md) — RedeemableIssuance, MilestoneIssuance, MilestoneReward
- [testing.md](./testing.md) — `npm run test:redeemables`

## Related domains

- **[draws](../draws/)** — `DrawGrantService` integrates redeemable grants into draw entries
- **[promo](../promo/)** — campaign multipliers can reference redeemables
- **[payment](../payment/)** — refund reversal uses reverser modules for redeemable grants
