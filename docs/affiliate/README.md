# Affiliate domain

Affiliate program — partners earn commissions on referred members. Tracks attribution, processes commissions per payment, handles recurring billing, manages payouts.

## Index

- [architecture.md](./architecture.md) — attribution flow, commission processing, payout cycle
- [frontend.md](./frontend.md) — `/affiliate/` portal pages, hooks
- [backend.md](./backend.md) — utils/affiliate helpers, commission/payout processing
- [api.md](./api.md) — `/api/affiliate/**`
- [rules.md](./rules.md) — attribution windows, commission idempotency, payout thresholds
- [patterns.md](./patterns.md) — reverser pattern, recurring-invoice processing
- [gotchas.md](./gotchas.md) — first-touch vs last-touch, recurring chains
- [models.md](./models.md) — Affiliate, AffiliateCommission, AffiliatePayout
- [testing.md](./testing.md) — `__tests__/` under utils/affiliate
