# Referrals domain

Member-to-member referrals. Lighter system than [affiliate](../affiliate/) — referrers get bonus entries / promo benefits when their referee signs up or pays.

## Index

- [architecture.md](./architecture.md) — referral capture flow, ReferralEvent log
- [frontend.md](./frontend.md) — `useReferralCode`
- [backend.md](./backend.md) — `lib/referral.ts`
- [api.md](./api.md) — `/api/referrals/**`
- [rules.md](./rules.md) — single-attribution, idempotency
- [patterns.md](./patterns.md) — event-sourced log
- [gotchas.md](./gotchas.md) — vs affiliate distinction, double-attribution prevention
- [models.md](./models.md) — `ReferralEvent`
- [testing.md](./testing.md) — _TODO_

## Related domains

- **[affiliate](../affiliate/)** — separate higher-tier system; referrals is for members referring members.
- **[promo](../promo/)** — referral bonuses can be implemented as promo issuances.
- **[draws](../draws/)** — referral bonuses often = bonus entries.

## Migrated from `docs/REFERRAL_SYSTEM.md`

> _TODO: read root file and merge into architecture.md / gotchas.md._
