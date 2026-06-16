# IGodirect Rewards API — Meeting Prep (plain-English guide)

**Date:** 2026-06-16 · **Meeting:** tomorrow · **Goal:** know what they'll pitch, what to decide, and what we build.

> **One-line summary:** We already built the hard part (who's allowed a discount and for how long).
> IGodirect just supplies the *list of discounts*. So this is a "plug in their catalogue" job, not a rebuild —
> as long as we keep control of our own member-access rules.

---

## 1. Who IGodirect actually is

Research strongly points to **iGoDirect Group** — an Australian rewards / payments / loyalty company
(HQ Fitzroy, Victoria; also NZ). Founded 1999, ~51–200 staff, a Visa card issuer (AFSL 551294).

- The product that matches our project is their **"Rewards-as-a-Service" / "My Rewards Plus"** platform —
  it gives a partner's members access to discounts + cashback from a big merchant network.
- They advertise **~3,000+ offers** (group-wide they say 4,500+ suppliers). Our "1,000+ brands" is a subset/tier of that.
- They can deliver it **three ways**: (a) their own **hosted portal**, (b) a **branded app**, (c) **an API + embeddable widgets**.
- **Important:** they're a card issuer, so a lot of their redemptions run through **gift cards / a digital Visa wallet**.
- **No public developer docs exist.** Everything technical (data format, login method, rate limits) must come from them in the meeting.

**What this means for the meeting:** they will likely *default* to pitching their hosted portal/app (it's their easiest sell).
We want to steer toward the **API/feed option** so the discounts live inside *our* site and brand. More on that below.

---

## 2. The big picture: what we have vs what they add

Our rewards/partner-discount system is **two layers**:

| Layer | What it does | Who owns it |
|---|---|---|
| **The catalogue** (list of discounts) | Today: a tiny hand-managed list (~14 offers, tool brands). | 👉 **This is what IGodirect replaces** with 1,000+ real offers. |
| **The access engine** (who can see discounts, which tier, until when) | Already built, sophisticated, and battle-tested. Fed automatically by every purchase. | ✅ **We keep this. Untouched.** |

So the integration is basically: **swap the small hand-made list for IGodirect's big list — and feed it through the access engine we already have.**

That's the key message to hold in your head all meeting. We are not handing them our members or rebuilding rewards.
We're buying a catalogue and bolting it onto machinery we already own.

---

## 3. The three ways they could deliver it (pick the right one)

| Option | How it works | Brand & control | Effort for us | Best when |
|---|---|---|---|---|
| **A. Their hosted portal** | We send the member to a login link; everything (browse + redeem) happens on *their* page. | ❌ Low — it's their look, their domain | 🟢 Lowest | You want it live fast and don't mind it feeling separate |
| **B. Embed their widget** | Their page is dropped inside a box on our site (an iframe). | 🟡 Medium | 🟡 Medium | You want it "inside" our site but don't want to build the UI |
| **C. Their API feeds our page** ⭐ | They send us the **raw list of offers**; we show them in **our own rewards page** (which already exists and looks good). Redemption may still hop to their link. | ✅ High — our brand, our site, our data | 🔴 Highest (but we already have the UI) | You want it to feel 100% like Tools Australia |

**Recommendation: aim for Option C (API feed), accept a hybrid if needed.**

Why:
- You already have a polished rewards page and the whole access engine. Option C reuses all of it.
- It keeps members on your domain and keeps your data (who clicked what).
- **Realistic compromise:** because IGodirect's redemptions often run through their gift-card/Visa wallet, the *final click*
  ("Get this deal") may still bounce to their system via a secure login link. That's normal and fine — the goal is
  **browse on our site, redeem through their link.** Don't expect them to hand over the whole redemption/cashback engine.

If they say "we only do the hosted portal (Option A)," that's where the **domain question** (next section) matters most.

---

## 4. The domain question — what they're really asking

You guessed right: they want to know **whose web address the rewards portal lives on.** There are three answers:

| Choice | Address members see | Who recommends it |
|---|---|---|
| **Their domain** | `rewards.igodirect.com.au/toolsaustralia` (their address) | Easiest for them, weakest for your brand |
| **A subdomain of ours (CNAME)** ⭐ | `rewards.toolsaustralia.com.au` — *looks like us*, but their servers run it behind the scenes | **Industry standard answer** |
| **Fully on our site (API)** | Just part of `toolsaustralia.com.au` — no separate portal at all | Only possible with Option C above |

**The standard, recommended answer is the CNAME subdomain** (e.g. `rewards.toolsaustralia.com.au` or `perks.toolsaustralia.com.au`):

- It keeps **your brand** in the address bar even though they run it.
- They auto-create and renew the **SSL certificate** (usually free via Let's Encrypt) — low effort for you.
- Setup is tiny: you add **one DNS record** pointing the subdomain at their servers.

**Watch-outs to mention:** make sure there's no conflicting DNS record on that subdomain, and that our DNS "CAA" setting
won't block their certificate. Give them a clear subdomain and let them validate it.

> **If we go Option C (API feed), the domain question mostly disappears** — there's no separate portal, it's just our site.
> So your answer in the meeting can be: *"Our preference is to render offers inside our own site via your API.
> If we use your hosted portal, we'll put it on a subdomain of ours (CNAME), not on your domain."*

---

## 5. How it plugs into our access rules (the 5 purchase paths)

You were worried about this part — good news, it's the simplest part.

All **five** ways a member earns partner-discount access...

1. Membership / subscription purchase
2. Upsell purchase
3. One-time purchase
4. Additional one-time purchase
5. Mini-draw purchase

...**already funnel into one place.** When any purchase succeeds, our Stripe webhook records a single entry that says:

> "This member has partner-discount access, from *this* purchase, at *this* tier, until *this* date."

That entry lives in the member's record and our code already answers three questions from it:

- **Are they allowed right now?** (yes/no)
- **What tier are they?** (drives how much of the catalogue they see)
- **When does access end?** (the expiry date)

**So IGodirect never needs to know about your 5 purchase types.** They only need the *answers* (allowed? tier? expiry?),
which your system already produces. That's the whole "matching" job — see the next section.

> ⚠️ **One real product decision to make (raise it internally, not necessarily with them):**
> Today, tiers control **what % of the catalogue** a member sees (e.g. Tradie sees 50%, Boss sees 100%).
> That made sense with ~14 offers. With **1,000+ offers**, "you can see 500 of 1,000" is meaningless to a member.
> You'll want to decide how tier should *really* work at scale — e.g. everyone sees all brands but higher tiers get
> **better deals / premium brands / higher cashback**, rather than a raw percentage slice. Worth thinking about before you wire it up.

---

## 6. What data we'd exchange (the "matching")

If they need to identify our member (for the portal/SSO route), keep it **minimal**. Our system already has all of this:

| What they need | What we send | Notes |
|---|---|---|
| A stable member ID | Our internal user ID (opaque, not guessable) | Prefer this over email — emails change |
| Email | Only **if they require it** | Try to withhold; it's personal data |
| First name | For display | |
| Tier / plan | Our computed tier (or the % access level) | This is what unlocks the right level of perks |
| Status (active / not) | "Does this member have access right now?" | We already compute this |
| Access expiry date | "Access ends on this date" | We already compute this |

**Privacy point to raise:** they are a financial-services company, so any member data we send crosses into their system.
Ask for a **data-processing agreement**, confirm data is **hosted in Australia**, and send the **least data possible**
(ideally just an opaque ID + tier + expiry).

**Login handoff (if portal/SSO route):** the standard, simple method is a **signed login token (JWT, HS256 with a shared secret)** —
and **we already have the exact tool for this in our codebase** (we use it for auto-login and affiliate links). So if they support
JWT SSO, we're ready. Ask them: *"Do you support HMAC-signed JWT SSO, or do you require SAML?"* (JWT = easy for us; SAML = heavier.)

---

## 7. What we build on our end — for each scenario

### If they already built / will give us an **API (Option C)** ✅ our preferred
We follow our existing house pattern for third-party integrations (same as Klaviyo/Stripe/Facebook):

1. A small **client wrapper** to talk to their API (one file, `src/lib/igodirect.ts`).
2. A **stored copy of their catalogue** in our database (so we're fast and don't hammer their API).
3. A **scheduled daily sync** (a cron job + a script) that refreshes the offer list.
4. **Swap our tiny hand-made list** for this synced list in the rewards page — the rest of the page already works.
5. Keep our **access engine as the gate** (tier + expiry decide what each member sees).

*Rough effort: small-to-medium. Most of the UI and all of the access logic already exist.*

### If they offer an **embed/widget (Option B)**
- Mostly a front-end + security-header change: we allow their box to load inside our page (a CSP tweak in **two files**).
- Less code, less control over look-and-feel.

### If they only offer a **hosted portal (Option A)**
- We set up the **CNAME subdomain** (section 4) and a **"Go to Rewards" button** that logs the member in via a signed token.
- We still use our access engine to decide **who even sees the button**.

> **Whichever route:** if anything of theirs loads in our page or we call their domain from the browser, we must update our
> security policy (CSP) in **both** `src/utils/security/csp.ts` **and** `next.config.ts`. (Our dev will know — it's noted in the appendix.)

---

## 8. The questions to ask them (in priority order)

**Must-ask (these decide everything):**
1. **What do we actually get** — a raw **offer API/feed** we render ourselves, an **embeddable widget**, an **SSO login** to your hosted portal, or your **app**? Can we get the offer data to show inside our own site?
2. Is there a **sandbox + test credentials + sample data** so we can build before going live?
3. **How does a member redeem a deal** — discount code, click-through, gift card, or your Visa wallet? Who owns that transaction?
4. What **member data** do you require to identify a member? Can we send an **opaque ID only** (no email/name)? Will you sign a **data-processing agreement**, and is data hosted **in Australia**?
5. **Domain:** if it's a hosted portal, can it run on a **subdomain of ours** (CNAME) and do you auto-handle the SSL cert?

**Commercial (don't leave without these):**
6. Pricing model — setup fee, per-member, per-redemption, or revenue share on cashback? Minimum term? Exclusivity?
7. What happens to **member data and the offers** if we leave?

**Technical (for our dev to confirm):**
8. Login method — **JWT (HS256)**, SAML, or OIDC? Token sent by **POST** (not in the URL)?
9. The **exact number of brands** for our tier, how many are **Australian**, and how often the list updates.
10. API **rate limits**, **pagination**, and whether there's a **webhook** for offer updates or we just sync daily.
11. Do we get **reporting/usage data back** (what members redeemed) for our own analytics?

---

## 9. Red flags / things to watch

- **"API" might be marketing.** Their site says "APIs & widgets," but no public docs exist. Pin down *exactly* what the API returns before agreeing to Option C.
- **Gift-card / Visa wallet = regulated.** If members hold a stored balance (not just click a discount), that drags in compliance, KYC, and settlement. Confirm whether members hold balances or just click through.
- **"Your domain / white-label" is often soft.** It usually means a subdomain pointing at *their* servers — not truly our site. Clarify.
- **Don't over-share PII.** Send the minimum. They're a finance company; treat any data handoff as a privacy obligation.
- **Terminology clash:** they use "affiliate/cashback." We already have an internal **affiliate commission** system. Keep names separate so the two don't get confused in our build.
- **Tier model at scale** (section 5 warning): decide what "tier" should unlock when there are 1,000+ offers, not 14.

---

## Appendix — technical detail (for the developer)

*The main doc above stays simple on purpose; the exact code lives here.*

**Our existing access engine (keep as-is, it's the gate):**
- Catalogue today: `src/models/PartnerDiscount.ts` (Mongo) + dev fallback `src/data/samplePartnerDiscounts.ts` (~14 offers). Manually managed.
- Entitlement state machine: `src/utils/partner-discounts/partner-discount-queue.ts` — `user.partnerDiscountQueue[]` with states `active | queued | expired | cancelled`; `addToPartnerDiscountQueue()`, `processPartnerDiscountQueue()`, `calculateActivePartnerDiscountPeriod()`.
- Tier → % visibility: `src/utils/partner-discounts/partner-catalog-visibility.ts` — `getPartnerCatalogAccessPercentForPlanId()` (subs: Tradie 50 / Foreman 75 / Boss 100; one-time ladder 25–100; mini 5/10/15), `getPartnerCatalogVisibleSliceLength()`.
- "Does this member have access?" helpers: `hasActivePartnerDiscountAccess(user)`, `getPartnerDiscountAccessInfo(user)`, `canAccessPartnerDiscounts(user)` in `src/utils/membership/benefit-resolution.ts`.

**The 5 grant paths (all converge in the Stripe webhook → `grantBenefits`):**
- Single source of truth: `src/utils/payment/payment-processing.ts` `processPaymentBenefits()` → `grantBenefits()`. API routes only create the PaymentIntent; the webhook grants.
- Subscription: `handleSubscriptionQueueUpdate()` (lifecycle-gated; `discountDays = 0`, governed by `subscription.endDate`).
- One-time / additional one-time: `handleOneTimePackage()` → `addToPartnerDiscountQueue()`, duration from `partnerDiscountDays` in `src/data/membershipPackages.ts`.
- Upsell: `handleUpsellPackage()`, duration from `src/data/upsellPackages.ts` (resolve tier via `baseTemplatePackageId`, not the id substring).
- Mini-draw: `handleMiniDrawPackage()`, duration from `partnerDiscountHours/Days` in `src/data/miniDrawPackages.ts`.

**Member identity / SSO (ready to use):**
- Opaque id = MongoDB `_id` as string (`session.user.id`). No separate public id exists.
- JWT signing already present: `signJWT()` / `verifyJWT()` in `src/lib/jwt.ts` (HS256, `NEXTAUTH_SECRET`, issuer `tools-australia`). Also `createAffiliateToken()` in `src/lib/affiliate-auth.ts`. Either can mint a short-lived SSO deep-link token.
- For SSO: set short `exp`, unique `jti` (replay protection), correct `iss`/`aud`; POST the token in the body, not the URL. Sign server-side only.
- HMAC alternative for API-to-API: the internal-norm pattern (`src/lib/internal-norm/auth.ts`, bearer + HMAC-SHA256 + nonce).

**Deployment / CSP:**
- Vercel-hosted; prod domain `toolsaustralia.com.au`, staging `staging.toolsaustralia.com.au`.
- CSP is built in `src/utils/security/csp.ts` (`buildContentSecurityPolicy`) and applied via `next.config.ts`. **Edit both.**
  - Browser calls their API → add their origin to `connect-src`.
  - Embed their widget/iframe → add to `frame-src` (and they must allow framing from us).
  - Offer images from their CDN → add host to `img-src` / `next.config.ts` `images.remotePatterns` + `NEXT_PUBLIC_IMAGE_HOSTS`.
- Cron pattern: `vercel.json` `crons[]` + `src/app/api/cron/<job>/route.ts` (300s max). Existing daily queue cron: `process-partner-discount-queues` (3pm UTC, batches of 200).

**New integration files to add (Option C), following Klaviyo/Stripe house style:**
- `src/lib/igodirect.ts` — singleton client with retry/backoff (mirror `src/lib/klaviyo.ts`).
- `src/models/IGodirectOffer.ts` — Mongo cache of the offer catalogue.
- `src/app/api/cron/sync-igodirect-offers/route.ts` + `scripts/sync-igodirect-offers.ts` — daily sync (dry-run flag, progress logging, CSV audit, per house rules).
- `src/types/igodirect.ts` — offer/response types.
- Env: `IGODIRECT_API_KEY`, `IGODIRECT_ENABLED`, `IGODIRECT_MODE` (+ document in `.env.example`).
- **Doc-sync:** changes here touch the `affiliate`/`partner`/`cart-shop-products`/`infrastructure` domains — update the matching `docs/<domain>/` and the Domain Manifest in the same task.

**Sources for the research (IGodirect identity + integration patterns):**
- iGoDirect Group: `igopayments.com.au/rewards-as-a-service`, `/myrewardsplus`, `/about-us`; `au.linkedin.com/company/igodirect-group`.
- Integration model references: Abenity Perks/SSO API, Tillo Gift Card API/StoreFront, Reward Gateway SAML SSO, Perkbox, Prizeout (LiveLike SDK), impact.com SubId attribution.
- SSO/JWT best practice: Zendesk JWT SSO, WorkOS/Clerk SSO guides; CNAME white-label domain: Memberful / Cloudflare SSL-for-SaaS / Let's Encrypt CNAME.
