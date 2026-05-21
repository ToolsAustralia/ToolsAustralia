# Promo domain

Promo codes, promo banners, alternating-multipliers, scheduled promos, bonus-entry promos, promo-page analytics. The largest "growth" domain by model count.

## Index

- [architecture.md](./architecture.md) — promo types, banner behaviour, multiplier resolution
- [frontend.md](./frontend.md) — banners components, promotion pages, hooks
- [backend.md](./backend.md) — services/promo, services/promo-analytics, utilities
- [api.md](./api.md) — `/api/promo/**`, `/api/codes/**`
- [rules.md](./rules.md) — multiplier stacking, schedule conflicts, banner z-order
- [patterns.md](./patterns.md) — alternating multipliers, scheduled promos
- [gotchas.md](./gotchas.md) — comeback promo flow, banner behaviour edge cases, page analytics quirks
- [models.md](./models.md) — Promo, PromoLink, ScheduledPromo, AlternatingPromoMultiplier, PromoBannerText, PromoAnalyticsVisit, BonusEntryPromo
- [testing.md](./testing.md) — _TODO_

## Related domains

- **[tracking](../tracking/)** — Klaviyo lists, Meta CAPI events tied to promo flows
- **[subscription](../subscription/)** — comeback promo targets cancelled subs
- **[draws](../draws/)** — bonus entries flow into ticket counts
