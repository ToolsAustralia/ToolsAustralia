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

## R8. Member-facing partner copy states counts, not adjectives (2026-07-31)

A live audit of the iGoDirect portal as a Tradie (50%) member found the copy on **our**
side was writing cheques the vendor's catalogue does not cash:

| Surface | Was | Why it was wrong |
|---|---|---|
| `RewardsPartnerCard` CTA subline | "See every deal · signed in automatically" | The member *sees* every deal — but **68% of the portal home page is locked at 50%**, and the portal marks none of it. "See every deal" read as "use every deal". |
| `RewardsPartnerCard` ring subline | "of Australia's top tool brands, on your account" | The catalogue returns **zero** offers for Milwaukee, DeWalt, Makita and Ryobi. |
| `PartnerPreview`, `DashboardGuestPanel`, `UnlockDiscounts` | "top tool brands" | Same claim, same problem. |

Rules that follow from it:

- **Never claim tool brands we do not carry.** Sell **breadth** ("1,800+ Australian
  brands") or the **count** — both are true and checkable. Re-add a tool-brand claim only
  in the same change that lands tool-brand offers in the catalogue.
- **A percent needs a denominator.** Use `getPartnerCatalogUnlockedCount(pct)`
  (`partner-catalog-visibility.ts`) to render "917 of 1,833 partner offers" rather than a
  bare "50%". It returns `count: null` for any **off-ladder** percent — 0% is the real one
  that reaches production (guest / past-due with no live pack) — and callers **must** fall
  back to the bare percent rather than printing an invented figure. Guarded by
  `npm run test:partner-catalog-drift`.
- **Set the expectation before the hand-off, not after.** The Rewards card carries a line
  stating that the portal shows the whole catalogue and that offers above the member's
  level show an unlock prompt. **Until the vendor badges locked offers on the card
  (vendor ask 1), that sentence is the only thing between the member and the conclusion
  that Tools Australia oversold them.** Do not remove it while the portal renders locked
  and unlocked tiles identically.
- **The two partner programmes are named separately.** The `PARTNER_BRAND_OFFERS` grid is
  **Tools Australia's own** 7 mention-us-at-the-counter partners and is **not** in the
  iGoDirect catalogue. It sits under its own "Tools Australia partners · Deal direct · no
  portal" heading; unlabelled, the ring's percent read as if it described that grid.

Full audit, evidence and the 16 vendor-side asks: `docs/partner/igodirect-portal-ux-audit.md`.

## R9. One upgrade sentence, ours, shared with the vendor (2026-07-31)

The portal's locked-offer banner is copy about **Tools Australia's packs**, rendered by a
third party who has no reason to know CLAUDE.md rule 11. Their current wording is clean;
nothing keeps it clean through their next content edit.

So TA supplies the string. [`tier-upgrade-copy.ts`](../../src/utils/partner-discounts/tier-upgrade-copy.ts)
is the single source for **both** sides:

- `buildTierUpgradeCopy(requiredPct, currentPct)` — our surfaces. Names the cheapest covering
  tier and **what it adds** ("Foreman opens this, plus 458 more offers"). The delta is the
  reason to move; a total the member cannot act on is not.
- `buildVendorLockedOfferCopy({ requiredPct, currentPct })` — the vendor's banner. Stands
  alone inside a third-party UI and is written to be templated.

Rules baked in and guarded by `npm run test:partner-catalog-drift`:

- No `odds` / `chance(s)` / `lottery` / `lotto` / `raffle` / `sweepstake` / `gamble` / `bet`.
- **The module never mentions entries at all.** Its subject is catalogue access — that is the
  cleanest way to stay clear of "entries are never sold".
- Australian English: `catalogue`, never `catalog`.

The hand-over page is [`vendor-copy-contract.md`](vendor-copy-contract.md); the brand side is
[`vendor-brand-spec.md`](vendor-brand-spec.md). **If the vendor edits the wording, it comes
back to us first** — we carry the exposure, not them.

## R10. The catalogue entry point is universal, not membership-gated (2026-08-01)

The "See what your N% opens" row on the Rewards card sits **outside** the guest/past-due/SSO CTA
branches, on purpose. It first shipped inside the SSO branch, which silently excluded two states:

- **Past-due WITH a live one-time pack.** The card above reads *"Active from your pack · 25%"* —
  access they paid for — and yet offered no way to see what that 25% opens. The worst kind of
  gap: the UI asserts the benefit on one line and withholds it on the next.
- **Guest / 0% access.** For them the catalogue is the single best conversion surface we have:
  1,833 offers, each marked with the membership that opens it, **every card linking to
  `/membership` with its own `offer_id`**. Hiding it was the opposite of what it is good at.

**Entitlement belongs in the row's COPY, not in who may see the row.** At 0% it reads
"See what a membership opens" and the page headline becomes *"1,833 partner offers — a
membership or pack opens them"* rather than the technically-true, useless "0 of 1,833 open at
your 0%". The "only show what I can use" filter also defaults **off** at 0%, since on would
render an empty page and read as broken.

The same universality applies to the discovery nudge: the nav dot keys on the signed-in member,
never on their tier. A one-time pack holder is a partner-catalogue user and gets told about it.

When adding another entry point to the catalogue, ask which account states can reach it. If the
answer is "active members", it is wrong.

## R11. A hand-off marker is a TTL, never a boolean (2026-08-03)

Deep-linking an offer (`{portal}/products/view_smart/{id}`) requires a **live portal session**.
Without one the vendor dead-ends the member, measured end to end:

```
302  myrewards/products/view_smart/21190  →  myrewards/users/login
302  myrewards/users/login                →  toolsaustralia.com.au/login
     (already signed in)                  →  toolsaustralia.com.au/my-account
```

No return-to survives, so the offer is lost and the member lands somewhere they did not ask
for. That redirect chain is the **vendor's**, not ours — but the decision to deep-link is ours,
and that is the part we own.

`hasPartnerPortalSession()` originally stored a bare `"1"` for the life of the tab. That
conflated two different facts:

- *"we handed off in this tab"* — true forever afterwards
- *"the portal session is still valid"* — true only for a while

The vendor expires its session server-side on its own schedule, so a member who handed off,
browsed for an hour, then clicked an offer got exactly the dead-end the marker exists to
prevent. It now stores a timestamp and is only trusted for `PORTAL_SESSION_TTL_MS` (20 min).

**The two errors are not symmetrical, so bias short:**

| | consequence |
|---|---|
| TTL too **long** | the dead-end above — offer lost, member dumped on `/my-account` |
| TTL too **short** | one extra hand-off, which works and silently re-arms the marker |

The general rule: any client-side marker standing in for a **third party's** session state must
carry a TTL. We cannot read their cookie cross-origin, so every such marker is a guess with a
half-life, and writing it as a boolean asserts a certainty we do not have. Deep links also open
in a new tab (`target="_blank"`), so a mis-predicted click costs a stray tab rather than the
member's place in the catalogue.

Related: `PORTAL_HANDOFF_KEY` is registered in `total-sign-out.ts` (global rule on auth
boundaries) — a stale marker must not survive into the next account on a shared device.

## R12. Two clicks to an offer, because one is impossible (2026-08-03)

Opening a catalogue offer needs a live portal session, and the hand-off **cannot carry a
destination** — `/verifytoken/{token}` silently drops `?redirect` / `?redirect_url` /
`?return` / `?next` / `?url` and a path-append alike (all six measured; see
[gotchas.md](./gotchas.md)). So "sign in AND land on the offer" is not one action, and no
amount of client work makes it one.

Given that, the only choice is **what the member loses**. Ranked by what it costs them:

| shape | cost |
|---|---|
| deep-link a cold session | offer lost, bounced to `/my-account` — the reported bug |
| hand-off in THIS tab | offer lost, **catalogue lost** (filters, scroll, place in 1,833 rows) |
| **hand-off in a NEW tab, then tap again** | one extra tap |

So the catalogue passes `openInNewTab` to `usePortalHandoff`:

- **cold tap** → hand-off opens in a new tab; our tab keeps the catalogue, flips its cards
  from buttons to real links, and shows *"You're signed in to the partner portal. Tap an offer
  again and it will open straight to that deal."*
- **warm tap** → straight to the offer.

Three things here are load-bearing:

1. **The blank tab is opened SYNCHRONOUSLY in the click handler.** The redirect fires ~2.75s
   later (two deliberate transit holds), by which point the user gesture is gone and every
   browser blocks `window.open`. Opening `about:blank` during the gesture and re-pointing it
   with `location.replace` is the only reliable way. `noopener` cannot be passed — it makes
   `window.open` return null — so `tab.opener = null` is set by hand straight after.
2. **It degrades to same-tab navigation** whenever that tab is missing (popup blocked, member
   closed it, consent detour closed it). Arriving in the wrong tab is a nuisance; not arriving
   is a bug.
3. **The consent branch closes the blank tab and goes same-tab.** A blank tab parked behind a
   read-and-decide sheet looks broken. That costs the catalogue tab exactly once per member,
   on their first ever hand-off, and they are warm from then on.

**The hint is not decoration.** After the first tap the member's attention is in the other tab;
when they come back, our cards look identical to before and the state change is invisible.
Without a line saying what happened and what to do, the second tap is a guess. It is inline
(not a toast) precisely so it survives tab-switching, which is when it is needed.

If the vendor ever ships ask 16, collapse this back to one tap — but keep the new-tab
behaviour, which is worth having on its own.
