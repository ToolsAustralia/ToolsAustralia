# Partner — Models

| Model | Path | Purpose |
|---|---|---|
| `PartnerApplication` | [src/models/PartnerApplication.ts](../../src/models/PartnerApplication.ts) | Partner brand applications (form submissions) |
| `PartnerDiscount` | [src/models/PartnerDiscount.ts](../../src/models/PartnerDiscount.ts) | Discount offer config |

> _TODO: pull schemas._

## PartnerDiscountSsoIssuance (2026-06-24)

Audit log of MyRewards SSO hand-offs ([src/models/PartnerDiscountSsoIssuance.ts](../../src/models/PartnerDiscountSsoIssuance.ts)) — one row per `POST /api/partner-discount/sso` mint. MyRewards returns us no activity data, so this is our **only** record of who entered the portal and at what tier.

**PII-safe:** opaque `userId` ref only (no email/name), and **never** the signed JWT or the returned portal token. Fields: `memberLevelPercent` (resolved tier at hand-off), `memberLevelSent` (whether `member_level` was in the token — `false` until the vendor confirms encoding), `success`, `providerResponse` / `providerResponseCode` (MyRewards' `response` / status), `errorCode`. TTL 90 days. Written best-effort via `logSsoIssuance` so a log failure never blocks the hand-off (N9).
