# Config & Data domain

Static config (feature flags, brand theme, prizes), constants (z-index, legal, promo banner), seed data (australian states, professions, sample products/users/winners).

> **`partnerBrandOffers.ts` (2026-07-02):** `PartnerBrandOffer` gained a `category` field (short label — Vehicle / Media / Supply / Trade / Auto / Tools) shown in the dashboard partner deal rows. Additive; the Unlock-Discounts grid is unaffected.

> **`dashboardFeatures.ts` (2026-07-02):** `DASHBOARD_FEATURES` — off-by-default visibility switches for member-dashboard features that are **built but hidden** (`cobberSupport`, `milestoneProgress`, `personalWins`, `orderHistory`). The UI is fully implemented and mounted behind these flags; flip one to `true` (once its backing endpoint lands) to surface it. `isDashboardFeatureOn(feature)` reads them. This is a small visibility map, not flag infrastructure — see the dashboard revamp spec (`docs/superpowers/specs/2026-07-02-user-dashboard-revamp-foundation-home-design.md`).

## Index

- [architecture.md](./architecture.md) — config vs constants vs data
- [frontend.md](./frontend.md) — _Read by both client + server_
- [backend.md](./backend.md) — Read by server code
- [api.md](./api.md) — _N/A_
- [rules.md](./rules.md) — when to put in DB vs code, fixture vs prod
- [patterns.md](./patterns.md) — feature flags, package config
- [gotchas.md](./gotchas.md) — fixture-as-prod-fallback risk
- [models.md](./models.md) — _N/A_
- [testing.md](./testing.md) — _TODO_
