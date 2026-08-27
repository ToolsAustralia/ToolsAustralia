# Rewards & Redeemables domain

Two related systems:
- **Redeemables** — wallet-based system for rewards a user can redeem (campaigns, draws, milestone rewards, prize catalog).
- **Milestone progression** — tier achievements that unlock rewards.

## Index

- [architecture.md](./architecture.md) — wallet model, campaign targeting, milestone issuance
- [frontend.md](./frontend.md) — `usePrizeCatalog`, `useEntryRewardToast`, /rewards page, spotlight storage
- [backend.md](./backend.md) — RedemptionService, CampaignService, DrawGrantService, TargetingService, MilestoneIssuance, the bonus-code webhook guards (`src/lib/bonus-code-webhook/`)
- [api.md](./api.md) — **`POST /api/bonus-codes/v1/issue`** (the Klaviyo bonus-code webhook: contract, status map, secret rotation, launch order), `/api/redeemables/**`, `/api/rewards/**`
- [rules.md](./rules.md) — wallet conservation, idempotency, ledger reversal on refund
- [patterns.md](./patterns.md) — campaign targeting, audience filters
- [gotchas.md](./gotchas.md) — pause behaviour, cancellation-upsell eligibility, top-percentile targeting, the three fail-closed webhook guards
- [models.md](./models.md) — RedeemableIssuance, BonusCodeWebhookCall, MilestoneIssuance, MilestoneReward
- [testing.md](./testing.md) — `npm run test:redeemables`

## Related domains

- **[draws](../draws/)** — `DrawGrantService` integrates redeemable grants into draw entries
- **[promo](../promo/)** — campaign multipliers can reference redeemables
- **[payment](../payment/)** — refund reversal uses reverser modules for redeemable grants
