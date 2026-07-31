# Partner — Rules

## R1. Queue lifecycle on subscription events

| Subscription event | Queue action |
|---|---|
| Subscribe / first payment | `start` (enter queue) |
| Renewal payment | `renew` (extend eligibility) |
| Cancel immediately | `end` (remove now) |
| Cancel at period end | `end` triggered when period ends, not at cancel time |

Owned by `handleSubscriptionQueueUpdate()` in `partner-discount-queue.ts`.

## R2. Catalog visibility honours member status

Members see only the discounts they're eligible for at request time. Cancelled / inactive members see nothing (or a "subscribe to access" CTA, depending on the page).

## R3. Cancel-immediately ends queue NOW

Per the [subscription cancel service](../subscription/backend.md), step 2 of side effects: when cancelling immediately, `handleSubscriptionQueueUpdate(user, "end")` runs immediately — not when an end-date is reached. Don't change this without coordinating with the partner team.

## R4. The consent sheet is derived, never hard-coded (2026-07-31)

The disclosure list rendered by `PortalConsent` MUST come from
`buildPartnerSsoSharedFields` in
[utils/partner-discounts/partner-consent.ts](../../src/utils/partner-discounts/partner-consent.ts),
delivered to the client in the SSO route's 409 body. **Never hard-code the rows in the
component.** The list and the signed payload are built in different files, so a claim added
to `signPartnerDiscountSsoToken` would otherwise silently become a field we transmit without
telling the member.

Both directions are defects:

- **Under-disclosure** — a field crosses the boundary that the sheet never mentioned.
- **Over-disclosure** — the sheet claims we share something the route omits, which makes a
  privacy screen a false statement. This is why the **tier row is hidden today**:
  `member_level` is not sent (`PARTNER_SSO_SENDS_MEMBER_LEVEL === false`), so it is not
  disclosed. Flipping that constant to `true` reveals the row *and* must come with a
  `PARTNER_SSO_SCOPE_VERSION` bump so every member re-consents.

`npm run test:partner-consent` pins this: it signs a token with every optional claim
populated, reads the claim set back off the JWT, and asserts the disclosed key set matches
exactly. `tsc` cannot catch this class of bug.

## R5. No consent, no token (2026-07-31)

The consent gate lives in the **route**, before `generatePortalSso`. Client-side gating is
presentation only — the "Agree & continue" button being inert is a courtesy, not the
boundary. Any new path that mints an SSO token must call `hasValidPartnerConsent` first.

Consent is recorded **server-derived and body-less** (`POST /api/partner-discount/consent`):
the client never states which fields it consented to, because a tampered client could then
record a narrower set than we actually send.

## R6. Scope omissions are deliberate (2026-07-31)

The shipped consent sheet has **one** required tick and nothing else. No marketing opt-in,
no "don't ask again on this device", no "withdraw in Account → Connected services" line —
all cut on the owner's call. Two of those are worth not re-adding casually:

- **Nothing optional means nothing bundled.** Bundled consent is not valid consent under the
  Australian Privacy Act / APPs. If a marketing opt-in is ever re-added it must stay
  unticked by default and must never gate the primary action.
- **Don't promise a withdrawal surface that doesn't exist.** There is no
  Account → Connected services page. Re-add that sentence only in the same change that
  ships the page.

## R7. The partner's policy links are verified, never guessed (2026-07-31)

`PortalConsent` links the member to **the partner's own** Privacy Policy and Terms — the
documents they are being asked to accept. The canonical pair, taken from the footer of
`myrewards.com.au` and verified 2026-07-31:

```
https://www.myrewardsinternational.com/privacy-policy/
https://www.myrewardsinternational.com/terms-and-conditions/
```

**A 200 is not verification on these hosts.** `www.myrewards.com.au` serves its marketing
homepage for *any* unknown path — an earlier draft pointed Terms at
`myrewards.com.au/terms-conditions`, which returns 200 with the homepage, so the member
would have ticked "I accept the partner's Terms" against a page that is not the terms.
The tenant portal (`myrewards.toolsaustralia.com.au`) serves no usable policy page either.

To re-verify after a vendor change: fetch the URL **and a deliberately bogus path on the
same host**, then compare `<title>` and body size. If they match, you are looking at a
catch-all, not the document.
