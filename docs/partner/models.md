# Partner — Models

| Model | Path | Purpose |
|---|---|---|
| `PartnerApplication` | [src/models/PartnerApplication.ts](../../src/models/PartnerApplication.ts) | Partner brand applications (form submissions) |
| `PartnerDiscount` | [src/models/PartnerDiscount.ts](../../src/models/PartnerDiscount.ts) | Discount offer config |

> _TODO: pull schemas._

## PartnerDiscountSsoIssuance (2026-06-24)

Audit log of MyRewards SSO hand-offs ([src/models/PartnerDiscountSsoIssuance.ts](../../src/models/PartnerDiscountSsoIssuance.ts)) — one row per `POST /api/partner-discount/sso` mint. MyRewards returns us no activity data, so this is our **only** record of who entered the portal and at what tier.

**PII-safe:** opaque `userId` ref only (no email/name), and **never** the signed JWT or the returned portal token. Fields: `memberLevelPercent` (resolved tier at hand-off), `memberLevelSent` (whether `member_level` was in the token — `false` until the vendor confirms encoding), `success`, `providerResponse` / `providerResponseCode` (MyRewards' `response` / status), `errorCode`. TTL 90 days. Written best-effort via `logSsoIssuance` so a log failure never blocks the hand-off (N9).

## PartnerDiscountVisit (2026-08-11)

Page analytics for the two catalogue surfaces ([src/models/PartnerDiscountVisit.ts](../../src/models/PartnerDiscountVisit.ts)) — one row per surface-visit in `partnerdiscountvisits`, with the engagement counters `$set` onto that same row rather than kept as an event stream. Full behaviour: **[analytics.md](./analytics.md)**.

`surface` is `"discount"` (the public `/discount` catalogue) or `"catalogue"` (`/my-account/rewards/catalogue`) — the route names, because signed-in visitors do reach `/discount` and a public/member split would be wrong as well as new.

**PII-safe:** opaque `userId` ref and the `anonymousId` cookie value only — never email, name, or the offer names the visitor looked at. Same boundary as `PartnerDiscountSsoIssuance`, and the same 90-day TTL (`PARTNER_DISCOUNT_VISIT_RETENTION_DAYS`), so the visit leg and the hand-off leg of the funnel age out together rather than leaving one half of a ratio.

Three field-level traps, all documented at the declaration:

- **`accessPct` is optional and absent is NOT zero.** The visit beacon fires on mount so a two-second bounce still counts; a member's tier often has not resolved by then. Defaulting to 0 would have recorded members as having no access.
- **`seamRendered` + `seamReached` are two booleans, deliberately.** The first is the denominator — the access seam is only drawn under the access-level sort, and never on the members' catalogue.
- **`lockedOffersOpened` is a subset of `offersOpened`,** enforced in the functional core so the read side can never render a share above 100%.

The funnel joins `anonymousId` → `User.signupAttribution.anonymousId` → `PaymentEvent`, which needed **no new field on `User`** — only a plain index on that path.

## User.partnerDiscountConsent (2026-07-31)

Not its own collection — an embedded record on [src/models/User.ts](../../src/models/User.ts) (`_id: false`), because it is single-valued state about the member, and the SSO route needs to read it on every hand-off without a second query.

```ts
partnerDiscountConsent?: { scopeVersion: number; acceptedAt: Date; fields: string[] }
```

**No default, deliberately.** ABSENT means "never consented" — the fail-closed state `hasValidPartnerConsent` relies on. A record whose `scopeVersion` is older than `PARTNER_SSO_SCOPE_VERSION` is also treated as invalid, which is the mechanism that re-prompts everyone when the disclosed field set changes.

`fields` stores the keys the member actually **saw** when they agreed — that is the legal artefact, and it is what makes the record auditable after a scope change.

> **Known limit:** re-consent **overwrites** the prior record, so there is no consent *history*, only current state. That answers "what did this member agree to, and when" but not "what did they agree to two versions ago". If retention of superseded grants is ever required, follow the `PartnerDiscountSsoIssuance` pattern and append instead.

Email validation (2026-07-22): the `PartnerDiscountSsoIssuance` email field uses the shared permissive pattern `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/` (plus-addressing and modern TLDs accepted; aligned across User/Affiliate/ContactSubmission/PartnerApplication in the same change).
