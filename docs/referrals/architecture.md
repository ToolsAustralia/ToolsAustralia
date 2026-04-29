# Referrals — Architecture

## Flow

```
Member visits ?ref=<code> → cookie + session capture → useReferralCode hook reads
                                              │
Referee signs up or pays → /api/referrals/... resolves → ReferralEvent row written
                                              │
Bonus issued to referrer (entries, promo, etc.)
```

## Code paths

| File | Purpose |
|---|---|
| [src/lib/referral.ts](../../src/lib/referral.ts) | Resolve referral code, write event, issue bonus |
| [src/models/ReferralEvent.ts](../../src/models/ReferralEvent.ts) | Append-only event log |
| [src/app/api/referrals/](../../src/app/api/referrals/) | Routes for referral attribution / lookup |
| [src/hooks/useReferralCode.ts](../../src/hooks/useReferralCode.ts) | Frontend code-resolution hook |

## Migration from `docs/REFERRAL_SYSTEM.md`

> _TODO: read root file and merge full content here. Brief: members earn bonus draw entries when they refer new paying members._
