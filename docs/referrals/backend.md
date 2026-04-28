# Referrals — Backend

## Lib

[src/lib/referral.ts](../../src/lib/referral.ts) — referral resolution, event writes, bonus issuance.

## Bonus delivery

Bonuses (typically draw entries or promo grants) flow through the existing systems:
- Bonus entries → [draws](../draws/) (write `TicketEntry`)
- Bonus promo → [promo](../promo/) (issue `RedeemableIssuance` via [rewards-redeemables](../rewards-redeemables/))
- Direct grant on `BenefitsGranted.data.grants.referralBonusEntries` if tied to a payment

> _TODO: confirm exact bonus mechanics from `lib/referral.ts` source._
