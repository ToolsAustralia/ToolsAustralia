# Referrals — Backend

## Lib

[src/lib/referral.ts](../../src/lib/referral.ts) — referral resolution, event writes, bonus issuance.

## Bonus delivery

Bonuses (typically draw entries or promo grants) flow through the existing systems:
- Bonus entries → [draws](../draws/) (write `TicketEntry`)
- Bonus promo → [promo](../promo/) (issue `RedeemableIssuance` via [rewards-redeemables](../rewards-redeemables/))
- Direct grant on `BenefitsGranted.data.grants.referralBonusEntries` if tied to a payment

> _TODO: confirm exact bonus mechanics from `lib/referral.ts` source._

## Reward notification emails

When `completeReferralConversion` (in [src/lib/referral.ts](../../src/lib/referral.ts)) marks a referral `converted` and grants the `REFERRAL_REWARD_ENTRIES` (100) to both parties, it then sends a **SendGrid referral-reward email to BOTH** the referrer and the referred friend — once per party, each with their own `recipientName`/`friendName`. Sends run after the DB transaction commits, are best-effort (try/catch per recipient, never block the conversion), and use `emailService.sendReferralRewardEmail(...)` with `ctaUrl → /my-account`. Template + sender live in [email](../email/architecture.md).
