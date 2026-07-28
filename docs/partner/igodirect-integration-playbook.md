# IGodirect Integration — Living Playbook & Open-Questions Tracker

**Purpose:** the working doc to update *during and after* the IGodirect meetings. It holds the two possible
flows, what's on our end vs theirs, how it affects each purchase type, and a tracker of everything still unclarified.

**Companion doc:** background / who-they-are / negotiation brief → [igodirect-integration-prep.md](./igodirect-integration-prep.md).

> **Status:** 🟡 DISCOVERY. IGodirect showed a **hosted white-label portal** (test site `toolsau.myrewards.com.au`) and want **SSO auto-login**.
> Whether they also expose a **headless offer API** (so we render offers in our own site) is **NOT yet confirmed** — that single answer decides the whole architecture.

---

## 0. The decision that drives everything

| | **Option A — Hosted portal + SSO** *(what they demoed)* | **Option B — API feed** *(render on our site)* |
|---|---|---|
| Where members browse offers | On IGodirect's portal (a separate site) | On our own rewards page |
| Brand / domain | Their portal, ideally on a subdomain of ours (CNAME) | 100% our site |
| Who enforces the access **duration** | **Them** (we can only gate entry) | **Us** (offers only render while access is active) |
| Build effort for us | Low (SSO + a button) | Medium (API client + cache + sync + render) |
| Data we keep | Less (they own redemption + behaviour) | More (we see browsing on our side) |
| Confirmed available? | ✅ Yes (they built it) | ❓ **Unconfirmed — must ask** |

**Our preference:** Option B (or a hybrid: browse via feed on our site, final redeem via their link), because it keeps the brand
*and* puts duration enforcement back on our end. **Fallback:** Option A on a CNAME subdomain. → see Q1.

---

## 1. The two flows, step by step

### Flow A — Hosted portal + SSO
```
Member buys (any of 5 ways)
   → Stripe webhook grants partner-discount access with its duration   [OUR END — already built]
   → Member visits our site; we check hasActivePartnerDiscountAccess()  [OUR END — already built]
        • active   → show "Go to Member Perks" button
        • inactive → show "unlock with a purchase" CTA
   → Click button → /api/perks/sso  [OUR END — to build]
        • re-check access is active
        • mint a short-lived signed token (memberId + tier + expiry + jti)
        • redirect/POST to IGodirect's SSO endpoint
   → IGodirect logs the member in and shows the catalogue            [THEIR END]
   → Member redeems (gift card / cashback / code)                    [THEIR END]
```
**The gap:** once inside, *their* session controls how long the member stays. We can only stop **re-entry**, not an
already-open session — unless they honour the expiry we send and/or accept a revoke call. → see Q7, Q8.

### Flow B — API feed (render on our site)
```
Daily: our cron calls IGodirect API → store/refresh offers in our DB   [OUR END — to build]
Member visits our rewards page
   → we check hasActivePartnerDiscountAccess()                         [OUR END — already built]
        • active   → render offers from our cached catalogue (gated by tier if we choose)
        • inactive → hide offers / show unlock CTA
   → Member clicks "Redeem" on an offer
        • redeem link likely points to IGodirect to complete           [THEIR END — confirm]
```
**Why it's cleaner for durations:** the offers live in *our* page, gated by *our* access check on every load. An expired
member simply doesn't see them. No dependence on IGodirect ending a session.

---

## 2. How it affects each purchase type (durations)

**Nothing about granting changes.** Every purchase still grants access with the same duration via `grantBenefits()` →
`addToPartnerDiscountQueue()`. What changes is only *where* that access is "spent."

**The rule, uniform across all packages below:**

| | Effect under Portal (A) | Effect under API feed (B) |
|---|---|---|
| **Recurring (subscriptions)** | "Go to Perks" button shows while subscribed; on cancel → needs revoke (Q8) | Offers render while subscribed; auto-hide on cancel |
| **Fixed window (everything else)** | Button active for the window; **portal must expire it** (Q7) | Offers render for the window, then auto-hide — *we* enforce it |

Now the concrete packages and their durations (verified from `src/data/`). "Partner %" = how much of the catalogue the
tier sees today (`getPartnerCatalogAccessPercentForPlanId`).

### A. Subscriptions — RECURRING (access lasts while subscribed; `discountDays = 0`, governed by `subscription.endDate`)
| Package | id | Price | Partner % | Duration |
|---|---|---|---|---|
| Tradie | `tradie-subscription` | $20/mo | 50% | Recurring (while active) |
| Foreman | `foreman-subscription` | $40/mo | 75% | Recurring (while active) |
| Boss | `boss-subscription` | $80/mo | 100% | Recurring (while active) |

### B. One-time packs (non-members) — FIXED window
| Package | id | Price | Partner % | Duration |
|---|---|---|---|---|
| Apprentice Pack | `apprentice-pack` | $25 | 25% | **1 day** |
| Tradie Pack | `tradie-pack` | $50 | 40% | 2 days |
| Foreman Pack | `foreman-pack` | $100 | 55% | 4 days |
| Boss Pack | `boss-pack` | $250 | 70% | 10 days |
| Power Pack | `power-pack` | $500 | 85% | 20 days |
| VIP Pack | `vip-pack` | $1,000 | 100% | **30 days** |

### C. Additional packs (members only) — FIXED window
| Package | id | Price | Partner % | Duration |
|---|---|---|---|---|
| Additional Tradie Pack | `additional-tradie-pack` | $25 | 40% | 2 days |
| Additional Foreman Pack | `additional-foreman-pack` | $50 | 55% | 4 days |
| Additional Boss Pack | `additional-boss-pack` | $125 | 70% | 10 days |
| Additional Power Pack | `additional-power-pack` | $250 | 85% | 20 days |
| Additional VIP Pack | `additional-vip-pack` | $500 | 100% | 30 days |
| ~~Additional Apprentice Pack~~ | `additional-apprentice-pack` | $25 | 25% | 1 day — *currently inactive* |

### D. Mini-draw packs — FIXED window (note the very short ones)
**Non-member (active):**
| Package | id | Price | Partner % | Duration |
|---|---|---|---|---|
| Mini Pack 1 | `mini-pack-1` | $1 | 5% | **1 hour** ⚠️ |
| Mini Pack 2 | `mini-pack-2` | $5 | 10% | 6 hours |
| Mini Pack 3 | `mini-pack-3` | $10 | 15% | 12 hours |

**Member-only, mini-scoped (active):**
| Package | id | Price | Partner % | Duration |
|---|---|---|---|---|
| Tradie Pack (mini) | `additional-tradie-pack-mini` | $25 | 40% | 2 days |
| Foreman Pack (mini) | `additional-foreman-pack-mini` | $50 | 55% | 4 days |
| Boss Pack (mini) | `additional-boss-pack-mini` | $125 | 70% | 10 days |
| Power Pack (mini) | `additional-power-pack-mini` | $250 | 85% | 20 days |
| VIP Pack (mini) | `additional-vip-pack-mini` | $500 | 100% | 30 days |

*(Legacy `mini-pack-4`…`mini-pack-8` are deactivated — replaced by the Additional mini packs above. Kept only so old orders resolve.)*

### E. Upsells — FIXED window, mirror the base pack's tier (shown after a purchase, ~50–60% off)
Upsells don't introduce new durations — each mirrors the tier/duration of the pack it's based on, and **stacks** onto existing access. Notable ones:
| Upsell | Shown after | Mirrors | Partner % | Duration |
|---|---|---|---|---|
| `membership-upsell-tradie` (Apprentice Pack) | Tradie sub purchase | apprentice-pack | 25% | 1 day |
| `membership-upsell-foreman` (Tradie Pack) | Foreman sub purchase | tradie-pack | 40% | 2 days |
| `membership-upsell-boss` (Foreman Pack) | Boss sub purchase | foreman-pack | 55% | 4 days |
| `onetime-upsell-*` (6) | One-time pack purchase | matching one-time pack | 25–100% | 1–30 days |
| `additional-upsell-*` (5) | Additional pack purchase | matching additional pack | 40–100% | 2–30 days |
| `mini-upsell-*` (8) | Mini-draw purchase | matching mini pack | 5–100% | 1 hour – 30 days |

> 💡 **Key insight for IGodirect:** access durations span **1 hour → 30 days → recurring/lifetime-of-subscription**.
> That whole range needs handling. The **1-hour Mini Pack** is the stress case: under their hosted portal it's only
> enforceable if they honour the expiry we send (→ Q7). The 1-hour window made sense for "see codes on our page for an
> hour"; for a hosted cashback/gift-card portal it's awkward — decide whether to set a **minimum window** (e.g. 24h)
> for the IGodirect era (→ Q9), or lean toward the **API-feed model** where we enforce the window ourselves.

---

## 3. What's on OUR end vs THEIR end

| Responsibility | Our end | Their end |
|---|---|---|
| Grant access on purchase (5 paths) | ✅ Built | — |
| Decide "does this member have access right now?" | ✅ Built (`hasActivePartnerDiscountAccess`) | — |
| Show/hide the button or offers | ✅ (small build) | — |
| Mint the SSO token / append member id | ✅ (to build) | — |
| Call "revoke" when member cancels/refunds | ✅ trigger (to build) | Must expose the API |
| **End the session when the window passes** | ❌ can't (Portal) / ✅ (API feed) | ✅ (Portal) — *if they honour expiry* |
| Host the offer catalogue + redemption | — | ✅ |
| Cashback/gift-card settlement | — | ✅ (they're the card issuer) |

**One-line takeaway:** *We own the door; they own the room.* Under Option A, enforcing the duration **inside the room**
depends on them. Under Option B, the offers are in our room, so we enforce it ourselves.

---

## 4. Data we'd send to match a member (keep minimal)

All of this already exists in our system — we don't need to compute anything new:

| Field they may want | Our source | Send it? |
|---|---|---|
| Stable member id (opaque) | `User._id` (string) | ✅ Preferred key |
| Email | `User.email` | Only if required (it's PII) |
| First name | `User.firstName` | For display |
| Tier / plan | `getPartnerCatalogAccessPercentForPlanId()` or the package tier | If they support tiered offers (Q6) |
| Status (active?) | `hasActivePartnerDiscountAccess(user)` | ✅ |
| Access expiry | `calculateActivePartnerDiscountPeriod(user).endsAt` | ✅ (drives token expiry) |

**Privacy:** they're a regulated finance company. Push to send **opaque id + tier + expiry only**, get a **data-processing
agreement**, and confirm **AU data hosting**. → Q11.

---

## 5. Codebase touch-points (verified)

**Reuse as-is (the access engine — do NOT rebuild):**
- Grant on purchase → `grantBenefits()` at `src/utils/payment/payment-processing.ts:1029`, which calls
  `handleOneTimePackage` (→ `addToPartnerDiscountQueue`, :1812), `handleSubscriptionQueueUpdate` (:1893),
  `handleUpsellPackage` (→ :1962), `handleMiniDrawPackage` (→ :2044). All 5 paths converge here, in the Stripe webhook.
- Access state → `src/utils/partner-discounts/partner-discount-queue.ts` (`calculateActivePartnerDiscountPeriod`,
  `processPartnerDiscountQueue`, `cancelQueueItem` for refunds).
- Access checks → `src/utils/membership/benefit-resolution.ts` (`hasActivePartnerDiscountAccess`, `getPartnerDiscountAccessInfo`).
- Tier % → `src/utils/partner-discounts/partner-catalog-visibility.ts`.
- Frontend already knows access state → `GET /api/partner-discount/queue` returns
  `data.activePeriod {isActive, source, endsAt, daysRemaining, hoursRemaining}` + `summary.hasActiveAccess`.
  Hook: `usePartnerDiscountQueue`.

**SSO token — accurate constraint:** `src/lib/jwt.ts` `signJWT()` exists but is **hardcoded to 30-day expiry** and a
**fixed payload** (`sub, email, firstName, lastName, role`). It does **not** accept custom claims, a short TTL, or a `jti`.
→ For SSO, add a small dedicated signer (e.g. `signPerksSsoToken({ memberId, tier, expiry, jti }, ttl)`) using the same
`jsonwebtoken` + `NEXTAUTH_SECRET`, **or** a shared secret IGodirect provides. Mint **server-side only**.

**To build (depending on option):**
- **Option A:** `POST /api/perks/sso` (gate → mint token → redirect); a "Go to Perks" button gated by `hasActiveAccess`;
  a revoke call wired into membership-cancel (`handleSubscriptionQueueUpdate(..,"end")`) and refund (`cancelQueueItem`).
- **Option B:** `src/lib/igodirect.ts` (API client), `src/models/IGodirectOffer.ts` (cached catalogue),
  `src/app/api/cron/sync-igodirect-offers/route.ts` + `scripts/sync-igodirect-offers.ts` (daily sync), render in the rewards page.

**Security/CSP:** if anything of theirs loads in our page or the browser calls their domain, update **both**
`src/utils/security/csp.ts` and `next.config.ts` (`connect-src` for API, `frame-src` for embeds, `img-src` +
`images.remotePatterns` for offer logos). Prefer **server-side** API calls (no CSP change for the fetch).

---

## 6. OPEN QUESTIONS & CLARIFICATIONS TRACKER

Update the **Answer / Status** column as IGodirect responds. 🔴 Open · 🟡 Partial · 🟢 Answered.

> **2026-06-16 — IGodirect SSO docs received** (`atwork.com.au/document`): **Q4/Q5/Q6 answered** (JWT HS256, `/generatetoken`, `member_level` tiers), **Q1/Q2 partially answered** (a BASIC-auth Product API + `test.myrewards.com.au` sandbox exist), and **Q7/Q8 sharpened** (60-min token TTL, but **no revoke/logout/webhook is documented** — the duration-enforcement gap is now confirmed). Full detail in **§9** below.

### Delivery model
| # | Question | Why it matters | Answer / Status |
|---|---|---|---|
| Q1 | Can we get a **headless offer/brand API** to render in our own app, or is the **hosted portal** the only path? | Decides Option A vs B (and who enforces durations) | 🔴 |
| Q2 | Is there a **sandbox + test credentials + sample feed**? | Can't build/verify without it | 🔴 |
| Q3 | For each offer, what fields are returned (title, brand, image, % off, **redeem link**, expiry, category)? | Shapes our DB model + UI | 🔴 |

### SSO & auth
| # | Question | Why it matters | Answer / Status |
|---|---|---|---|
| Q4 | SSO method — **HMAC JWT (HS256)**, SAML, or OIDC? | JWT = easiest for us; SAML = heavier | 🟡 they want SSO; method TBC |
| Q5 | Exact **SSO endpoint URL**, and is the token sent via **POST body** (not URL)? | Avoid PII in logs/URLs | 🔴 |
| Q6 | Can the token carry a **tier** so higher members see better deals, or is it all-or-nothing access? | Decides if our tier model maps over | 🔴 |

### Durations & enforcement *(the critical set)*
| # | Question | Why it matters | Answer / Status |
|---|---|---|---|
| Q7 | Will you **enforce an expiry timestamp** we send, so the member's portal access ends when their window does? | Without it, fixed durations aren't enforced in the portal | 🔴 |
| Q8 | Do you provide a **revoke / de-provision webhook or API** for cancellations & refunds? | How access gets pulled early | 🔴 |
| Q9 | How long does a **portal session/cookie** last after SSO? Can you support **sub-day** windows? | 1-hour mini-pack vs long session | 🔴 |

### Domain & hosting
| # | Question | Why it matters | Answer / Status |
|---|---|---|---|
| Q10 | If portal: can it run on **our subdomain** (e.g. `perks.toolsaustralia.com.au`) via CNAME, and do you **auto-provision + renew SSL**? | Brand + no cert warnings | 🔴 (subdomain proposed: `perks.` — avoid `rewards.`, clashes with our `/rewards` page) |

### Data, privacy & commercial
| # | Question | Why it matters | Answer / Status |
|---|---|---|---|
| Q11 | What **member fields** do you require? Can we send **opaque id + tier + expiry only**? **DPA** + **AU data hosting**? | Minimise PII exposure to a finance co. | 🔴 |
| Q12 | How is **redemption** completed (code / click-through / gift card / Visa wallet) and who owns that transaction/liability? | Esp. if members hold stored balances (KYC/AML) | 🟡 catalogue shows cashback + eGift; details TBC |
| Q13 | Commercial model — setup, per-member, per-redemption, rev-share? Min term? Exclusivity? What happens to data on exit? | Contract basics | 🔴 |
| Q14 | Do we get **usage/redemption data back** (webhook / reporting API / CSV)? | Feeds our own analytics; without it we're blind | 🔴 |
| Q15 | Exact **brand count for our tier**, how many **AU-local**, and **offer-feed refresh frequency**? | "1000+" floor vs marketing | 🔴 |

---

## 7. Decision log
*(record what gets settled, with date)*

| Date | Decision | Notes |
|---|---|---|
| 2026-06-16 | Confirmed IGodirect = iGoDirect Group "My Rewards Plus"; they demoed hosted portal + want SSO | Test site `toolsau.myrewards.com.au` |
| | Delivery model chosen (A / B / hybrid) | depends on Q1 |
| | Subdomain name | proposed `perks.toolsaustralia.com.au` |
| | Duration enforcement approach | depends on Q7/Q8/Q9 |
| 2026-07-24 | **Blocked-offer redirect URL = `/membership` — PERMANENT.** Handed to iGoDirect: `https://toolsaustralia.com.au/membership?utm_source=partner_portal&utm_medium=referral&utm_campaign=rewards-return` | The portal sends a member who can't redeem an offer back to our membership page. Treat the URL as a published contract — don't move the page. |
| 2026-07-24 | **Targeted-display strategy: resolve the blocked offer on OUR side.** `offer_id` in the redirect is looked up against the committed curated catalogue; URL params are untrusted display strings and never rendered raw | See §10. `offer_name`/`level` fallback only survives sanitisation + a real ladder percent. |
| 2026-07-24 | **Product API empirics** (probed live): BASIC auth = `client_id:SSO-secret`; pagination broken (`limit`-only, ~300-row ceiling, `offset`/`page` ignored); undocumented `keyword=` substring search over name+details DOES reach the full catalogue; `user_id` is required-but-inert (any value accepted, response unchanged) | `keyword=` is the only workable full-catalogue read path until they fix pagination. |
| 2026-07-24 | **The curated CSV is the DISPLAY ALLOWLIST.** The raw Product API feed contains **245+ offers outside** the curated 1,833-offer "Offers List Breakdown" — including brand-unsafe merchants | Never render vendor-feed offers directly; filter through `src/generated/partnerCatalogOffers.ts`. Vendor ask #3 in §10. |

---

## 8. Access gating & queue staleness — the SSO trap (verified, must-read)

**The system is lazily evaluated.** A queue row's `status` is only correct *as of the last sweep* (`processPartnerDiscountQueue`). `hasActivePartnerDiscountAccess()` / `calculateActivePartnerDiscountPeriod()` are **pure reads** — they report already-active rows; they do **not** promote a due queued item. The rewards page gets away with this because `GET /api/partner-discount/queue` sweeps on every visit.

**The trap:** SSO is a NEW read path. If the gate bare-reads access, it inherits all the staleness.

**Verified data (read-only audit, 2026-06-16 — `temp/readonly/partner-queue-access-audit.ts`):** of 8,291 users with a queue, **190 are "stuck"** — no active access right now, but a sweep would activate a pack they already paid for. A **bare-read** SSO gate would **wrongly deny all 190** (and the count grows until the cron fix is deployed). Subscribers (4,645) are unaffected (the sub short-circuits the check).

### The rule
> **Every access decision must reconcile-then-read, never bare-read.**
> Load user → `await processPartnerDiscountQueue(user)` → `if (changed) await user.save()` → THEN `hasActivePartnerDiscountAccess(user)` / `getPartnerDiscountAccessInfo(user)` for status + tier + expiry → THEN mint the SSO token.

This applies to: the SSO endpoint (`/api/perks/sso`), the "Go to Perks" button visibility, and the tier we pass to IGodirect. Reuse the existing reconcile path — do not reimplement the check.

**Important:** do **NOT** expire stuck queued packs. They are access the member *paid for* and is owed (the bug only ever *defers* access, never over-grants). Expiring them would deny paid access. The fix is to *activate* them (sweep), not remove them.

### Pre-launch checklist (do before SSO goes live)
1. **Deploy the cron fix** (Bug B) so the daily sweep actually runs — keeps the stuck population near zero going forward.
2. **One-off sweep backfill** across all users (idempotent — same as the cron, runnable today without waiting for deploy since the sweep logic itself was always correct) so the 190 are activated before launch. Dry-run first.
3. **Build the SSO gate as reconcile-then-read** (the rule above).
4. The daily cron still leaves an **intra-day window** (a pack becomes due at noon, cron runs 15:00 UTC) — which is exactly why the gate must sweep at point-of-use, not rely on the cron alone.

### Edge cases to handle (so we don't get bitten)
- **Past-due subscriptions:** `hasActivePartnerDiscountAccess` returns true while `subscription.isActive`. Past-due subscribers stay "active" in grace (intentional — see [gotchas.md](./gotchas.md)). Decide: should a member whose payment is failing still get IGodirect portal access during grace? And when they finally lapse, access must be revoked in IGodirect's portal (ties to Q8 de-provision).
- **Tier passed to IGodirect:** resolve it from the *reconciled* active period (`resolvePartnerCatalogPlanId` / `getPartnerDiscountAccessInfo`), never stale state.
- **Expiry inside the portal:** the gate only controls *entry*; once inside, the window is enforced by IGodirect (Q7) or a revoke call (Q8). A reconcile-then-read entry gate does not solve the "session outlives the window" problem — that's still §1's open question.
- **Brand-new / no-purchase users:** empty queue, no sub → correctly denied → show an "unlock with a purchase" CTA, not an error.

---

## 9. Confirmed SSO spec — from IGodirect / MyRewards docs (`atwork.com.au/document`, fetched 2026-06-16)

This confirms the predicted model and resolves several open questions. It also confirms the integration is **MyRewards** (`*.myrewards.com.au`) — the platform behind the `toolsau.myrewards.com.au` demo.

### Mechanics — use the **signed JWT** path (NOT the plaintext form/GET methods)
- **Method:** JWT signed with **HS256 (HMAC-SHA256)** using a **per-client shared secret** they issue. ✅ exactly the tooling we already have (`jsonwebtoken` + a secret).
- **Token TTL: 60 minutes.**
- **Two-step flow:**
  1. We sign a JWT of the member payload (below) and **POST** `{ "data": "<jwt>" }` to `https://<env>.myrewards.com.au/generatetoken`. Response: `{ message, token, response, response_code }` with `"User found"` / `"New user created"` / `"User level upgraded"` — it **auto-provisions** on first hit.
  2. Log the member in via the returned token (`GET /verifytoken/{token}` → **302** redirect into the portal).
- **Env / sandbox:** `test.myrewards.com.au` (tenant subdomains like `testwyndham.myrewards.com.au`). We register a `domain_url` and they issue a `domain_code` + `client_id`.
- **SAML** is offered as an alternative (heavier) — JWT HS256 is the right choice for us.

### JWT payload — required vs optional, and our mapping
| Field | Req? | Maps to (our side) |
|---|---|---|
| `member_id` (alphanumeric) | ✅ | **our opaque `User._id`** (NOT name-based — see security note) |
| `domain_url` | ✅ | the registered portal domain |
| `domain_code` | ✅ | the code they issue us |
| `client_id` (numeric) | ✅ | the id they issue us |
| `member_level` (e.g. bronze/silver/gold) | optional | **our tier mapped** to their level enum |
| `email` | optional | `User.email` (send only if required) |
| `firstname` / `lastname` | optional | `User.firstName` / `lastName` |
| `client_displayname` | optional | display label |

### What this ANSWERS
- **Q4 (SSO method):** ✅ JWT HS256 + shared secret. Add a **dedicated signer** (their `IGODIRECT_SSO_SECRET` + their claims + their 60-min TTL) — do **not** reuse `signJWT` (wrong secret/claims/TTL).
- **Q5 (endpoint/method):** ✅ POST `/generatetoken` with `{data: jwt}`; verify via `/verifytoken/{token}`.
- **Q6 (tier):** ✅ `member_level` carries a tier and their system can auto-upgrade level from the JWT. We must **agree a mapping**: our Tradie/Foreman/Boss + one-time ladder → their level enum.
- **Q1/Q2 (API + sandbox):** ✅ partial — a **Product API** exists (BASIC auth, `https://api.myrewards.com.au/app/api/v1/products`); that's the headless **offer feed** for the API-feed / hybrid option. Sandbox = `test.myrewards.com.au`.

### What's STILL OPEN / RISKS (raise with them)
- **🔴 No revoke / logout / de-provision / webhook is documented.** The 60-min token only gates *entry*; once auto-logged-in, nothing documented ends the portal session when our fixed window (a 2-day pack) or a cancelled membership expires. **Confirm whether an undocumented revoke/expiry exists.** If not, we enforce by *only minting a token while access is active* + short re-auth, and accept a session can outlive the exact window. (Confirms the §1/§3 "door vs room" gap.)
- **🔴 SECURITY — do not use the plaintext login paths.** The docs also show a `member_auto_login` form-POST and a `?r=<base64>` GET carrying `username/email/...` **unsigned** (base64 ≠ signature) — forgeable. **Use only the signed `/generatetoken` JWT path.**
- **🟡 member_id:** their example uses a human id ("firstNameLastName"). Use our **opaque `User._id`** (stable, non-PII) — confirm they accept an opaque id as the stable key.
- **🟡 Domain (Q10):** docs show tenant subdomains on **their** domain (`*.myrewards.com.au`). A CNAME to our domain (`perks.toolsaustralia.com.au`) isn't addressed — still ask.
- **🟡 No documented clock-skew, nonce/CSRF, rate limits, or IP allowlist.** With a 60-min TTL and no nonce, a leaked token is replayable for an hour — mint at click-time, HTTPS only, never log it.

### Build implication (when we wire it)
A thin server route (e.g. `POST /api/perks/sso`) that: reconcile-then-read access (§8) → if active, sign the MyRewards JWT (their secret + `member_id`=opaque `User._id` + mapped `member_level` + `domain_*`/`client_id`) → POST to `/generatetoken` → redirect the member to the returned login token. Env: `IGODIRECT_SSO_SECRET`, `IGODIRECT_DOMAIN_CODE`, `IGODIRECT_CLIENT_ID`, `IGODIRECT_DOMAIN_URL` (+ `IGODIRECT_PRODUCT_API_*` if we also pull the offer feed).

---

## ✅ Connectivity VERIFIED (2026-06-22) — production tenant, signed-JWT path

First live round-trip succeeded against the **production** tenant (`client_id 2412`, CNAME `myrewards.toolsaustralia.com.au` — so the **Q10 CNAME question is answered: they host us on our own subdomain**, not `*.myrewards.com.au`). Proven by `npm run test:igodirect-sso` ([scripts/test-igodirect-sso.ts](../../scripts/test-igodirect-sso.ts)), which uses iGoDirect's **own emailed sample identity** (`member_id: tools_reward_user`) so **no new permanent record was created** (`/generatetoken` returned "User found").

- **Secret correct** — HMAC over their emailed sample token reproduces their signature byte-for-byte. Their signing input *keeps* the payload base64 padding, BUT…
- **Our standard token is accepted** — the production signer [`signPartnerDiscountSsoToken`](../../src/lib/partner-discount-sso.ts) mints a plain `jose` HS256 JWT (base64url, **no padding**) and `/generatetoken` returned `200 {"response":"User found"}`. **No padded-encoding workaround is needed.**
- **Round-trip reachable** — `/verifytoken/{token}` returned `302` → `…/users/…/new_benefits` (logs the member into the portal).

**Naming (per masterplan §4):** the route/signer use the **`partner-discount`** vocabulary — `src/lib/partner-discount-sso.ts` / `signPartnerDiscountSsoToken`, eventual route `POST /api/partner-discount/sso`. The older "perks" name used earlier in this doc is **dropped**.

**Scope so far:** signer + connectivity probe ONLY. `member_level` is intentionally omitted (optional; tier-mapping deferred — slots in as a one-liner once iGoDirect confirms encoding). **Nothing is wired to a live user-facing route.** Still open (unchanged): the 🔴 revoke/deactivate + portal-session-lifetime risk — must be resolved before this gates real members.

---

## 10. Rewards-return funnel — Phase 1 (built 2026-07-24)

The loop: **portal blocked-offer → `/membership` upsell banner → purchase → back to the portal.** A member (or lapsed visitor) who hits an offer above their access level in the MyRewards portal is redirected to our membership page with a personalised unlock pitch; a purchase grants access immediately via the existing webhook path, and the portal re-checks live entitlement (member-status API / SSO) on return. Our side is built; go-live waits on the vendor asks below.

### Data layer — the committed catalogue

- **`src/data/partner-catalog/offers-list-breakdown.csv`** — the curated **1,833-offer** "Offers List Breakdown" (columns `ID,Category,Offer,Highlight,Product.terms_and_conditions,Supplier,AccessPercent`). This is the **display allowlist** (decision log 2026-07-24): the raw vendor feed has 245+ offers outside it, so anything shown to a member must resolve through this list.
- **`src/utils/partner-discounts/portal-return.ts`** (panel-fix F-003, hardened by F-006/F-008/F-009) — the pure rewards-return core: `resolvePortalReturn` (untrusted-URL parser; offers map dependency-injected so the client-shared module never imports the server-only map; prototype-key + all-digits guards on `offer_id`; **`offer_name` fallback allowlisted against the catalogue** — only exact-name matches resolve, catalogue values always win, URL `level` ignored, so name-only vendor templating works but content spoofing is impossible; note the 7 known vendor-name punctuation drifts, e.g. "JB HiFi" vs "JB Hi-Fi", fall back to the generic banner — `offer_id` templating remains the primary vendor ask) and `resolvePortalBannerView` (the banner's copy/CTA matrix incl. the paused branch and the SSO-dark covered-state fallback). Tested via `npm run test:portal-return`.
- **`scripts/build-partner-catalog-preview.ts`** (`npm run build:partner-catalog`) parses the CSV (RFC-4180, fail-loud validation, pinned aggregates: total 1,833; cumulative 25%→459, 50%→917, 100%→1,833) and emits two committed generated files — wired into `prebuild`/`predev` like the sibling generators (panel F-002), so a CSV edit without regeneration fails the next build; a legitimate new CSV means consciously re-pinning `EXPECTED_TOTAL`/`EXPECTED_CUMULATIVE` in the script:
  - **`src/generated/partnerCatalogOffers.ts`** — SERVER-ONLY full map `id → {name, category, pct}`. Never import from a client component (1,833 rows = bundle bloat, and the full list is not client data).
  - **`src/generated/partnerCatalogPreview.ts`** — CLIENT-SAFE aggregates only: `PARTNER_CATALOG_TOTAL` + `PARTNER_CATALOG_TIER_COUNTS` (cumulative offers unlocked per ladder percent).
- **`src/utils/partner-discounts/unlock-packages.ts`** — pure helper `resolveUnlockPackagesForLevel(requiredPct)` → cheapest active subscription + cheapest active PUBLIC one-time pack covering the percent (fail-closed on non-ladder input; percents resolved via the membership-package-id resolver — see the trap note in the file header). Test: `npm run test:unlock-packages`.

### Banner flow (frontend)

`/membership`'s `page.tsx` resolves the redirect params **server-side**: `utm_campaign=rewards-return` (or a bare `offer_id`/`offer_name`) triggers the return context; `offer_id` is resolved against `PARTNER_CATALOG_OFFERS` so name + required percent come from OUR data; the sanitised `offer_name`+`level` fallback only survives a real ladder percent; anything else degrades to a generic banner. `MembershipPortalReturnBanner` renders the state matrix (offer/generic × guest/authed-short/authed-covered/past-due) with SSO CTAs behind `NEXT_PUBLIC_PARTNER_DISCOUNT_SSO_ENABLED`; `/purchase-success` gained a "Back to the partner portal" SSO CTA gated on webhook-processed + the same flag. Component detail: [docs/shared-ui/frontend.md](../shared-ui/frontend.md); page wiring: [docs/subscription/frontend.md](../subscription/frontend.md).

### Vendor asks — pending (blockers for full go-live)

1. **Offer templating on the redirect.** Today only the campaign-level URL is confirmed. We need the portal to append the blocked offer's `offer_id` (or `offer_name` + `level`) per redirect so the banner personalises; without it every return shows the generic state.
2. **Gating model.** Confirm exactly how the portal decides an offer is blocked for a member (which `member_level` values gate which offers), so their gating and our AccessPercent ladder can't disagree.
3. **Curated-list guarantee.** The portal must display ONLY the curated 1,833-offer breakdown — the raw feed's 245+ extras (incl. brand-unsafe merchants) must never surface to members. We enforce the allowlist on our surfaces; they must enforce it on theirs.
