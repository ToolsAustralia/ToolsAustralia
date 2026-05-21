# Referrals — Gotchas

## Vs affiliate confusion

Members ↔ Members = referrals. Partners ↔ Members = affiliate. Don't conflate. Affiliates have a separate auth surface, a payout system, and a commission rate; referrals are just bonus entries / promo grants between members.

## Double-attribution

If a user lands via referral A, then later lands via referral B before signup, only A wins. The second cookie write must be silently no-op'd, OR the ReferralEvent log records the visit but the user record only stores the first.

## Migrated from `docs/REFERRAL_SYSTEM.md`

> _TODO: read root file and merge full content. Brief: two-sided bonus when referee makes their first paid action._
