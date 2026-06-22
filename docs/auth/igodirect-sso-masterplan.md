# iGoDirect SSO Integration + JWT Remediation — Master Plan & Session Handoff

> **Status:** 🟢 READY TO IMPLEMENT · **Branch:** `feature/jwt-auth-remediation` · **Worktree:** `.worktrees/jwt-auth-remediation/` (dev port 3012) · **Owner:** DJ
>
> **What this doc is.** The single entry point for this worktree. It carries the full arc so a *fresh* Claude session opened here is fully oriented without re-deriving anything: **why** we're cleaning up JWT/auth (to integrate the iGoDirect/MyRewards rewards portal via SSO on a clean base), **what** the cleanup is, **what** the SSO integration actually requires (verified against their live docs), and **how** the two connect.
>
> This doc is the *orchestration layer*. The two companion docs already on this branch hold the depth — read them in the order below.

---

## 0. Read order (start here, then these)

1. **This doc** — the mission, the bridge, the phased plan, the verified iGoDirect SSO facts, the open questions.
2. **`docs/auth/jwt-auth-remediation-spec.md`** — the full 14-item JWT/auth remediation spec (the cleanup detail; 4 PR stages).
3. **`docs/partner/igodirect-integration-playbook.md`** — the live integration playbook: the access-engine touch-points (§5), the **reconcile-then-read** trap (§8), and the **confirmed MyRewards SSO spec** (§9).
4. **`docs/partner/igodirect-integration-prep.md`** — background: who iGoDirect/MyRewards are, the negotiation brief.

---

## 1. Mission

We are integrating **iGoDirect / MyRewards** ("Tools Australia Rewards (TAR)") — a third-party rewards/partner-discount portal — so our members reach it via **SSO** from our site, gated by our existing partner-discount access engine.

Their SSO is a **signed JWT (HS256)** handshake. But our codebase currently runs **three coexisting JWT/auth systems** that all sign HS256 with the **same `NEXTAUTH_SECRET`** (see remediation spec §"The three systems"). Bolting a fourth, MyRewards-specific signer onto that tangle would compound the mess and widen the shared-secret blast radius.

**So the order is deliberate:** clean up and consolidate the JWT/auth surface **first** (this branch's primary work), then add a **dedicated MyRewards SSO signer** on the clean base, then **test SSO** against `test.myrewards.com.au`.

**End state:**
- One standing session credential per user (NextAuth), revocation working uniformly.
- A single hand-rolled JWT library (`jose`).
- A **dedicated** `signPartnerDiscountSsoToken()` for MyRewards (their secret, their claims, their 60-min TTL) — never reusing the user-session signer.
- A `POST /api/partner-discount/sso` route that **reconciles-then-reads** access, mints the MyRewards JWT, and logs the member into the portal at the correct tier.
- Verified round-trip into the MyRewards portal.

---

## 2. Context A — the iGoDirect / MyRewards SSO integration (verified)

> Source: their developer docs at `https://atwork.com.au/document/`, read end-to-end and cross-verified 2026-06-17. Fuller detail in playbook §9.

### 2.1 The platform & the five methods their doc documents
Their doc describes **five** integration methods. We use exactly one.

| Method | What it is | Our stance |
|---|---|---|
| **JWT SSO (§9.1–9.4)** | Signed **HS256** JWT → `POST /generatetoken` → `GET /verifytoken/{token}` | ✅ **Our path** |
| SSO POST | `/users/member_auto_login` form-POST (username/email in clear) | ❌ plaintext — forgeable, avoid |
| SSO GET | `/users/member_auto_login_wyndham?r=<base64>` | ❌ base64 ≠ signature — avoid |
| SAML SSO | Entity ID + certs; **has a Single Sign-Out Service** | ⚠️ heavier; note the SLO capability (see §6) |
| Product API | `GET /app/api/v1/products`, BASIC auth, **per-`user_id`** | For the Option-B fallback (render offers on our own page) |

### 2.2 The JWT SSO mechanics (confirmed verbatim)
- **Signing:** HS256 (HMAC-SHA256), RFC 7519. **Secret is generated per-client by MyRewards and shared with us.**
- **Generate:** `POST https://<env>.myrewards.com.au/generatetoken` with body `{"data":"<signed-jwt>"}`. Response: `{ message, token, response, response_code }` where `response` ∈ `"User found"` / `"New user created"` / `"User level upgraded"` (all `200`). **Auto-provisions** the member on first hit.
- **Verify/login:** `GET https://<env>.myrewards.com.au/verifytoken/{token}` → **302 redirect** into the portal, logged in.
- **Token TTL: 60 minutes.**
- **Error codes:** `400` bad request · `401` invalid secret/token/expired · `405` method not allowed · `419` missing args/invalid JSON · `420` invalid args **/ "This member is already registered under a client with one or more level up"** · `422` unprocessable.
- **Onboarding:** "client must be in auto login list." MyRewards issues us: **secret**, `domain_code`, `client_id`, `domain_url`. Demo creds live in §9.3; test env `test.myrewards.com.au`; our test portal is `toolsau.myrewards.com.au`.

### 2.3 The JWT payload — fields & our mapping (§9.1.2)
| Field | Req? | Their type | Our source / mapping |
|---|---|---|---|
| `member_id` | ✅ | AlphaNumeric (ex: `UserId`) | **opaque `User._id`** (stable, non-PII; their doc explicitly accepts a UserId) |
| `member_level` | optional | **Alphabet** (ex: bronze/silver/gold) | **our effective access-% tier** — see §2.4 (encoding caveat below) |
| `domain_url` | ✅ | AlphaNumeric | issued by them → env `IGODIRECT_DOMAIN_URL` |
| `domain_code` | ✅ | AlphaNumeric | issued by them → env `IGODIRECT_DOMAIN_CODE` |
| `client_id` | ✅ | Numeric | issued by them → env `IGODIRECT_CLIENT_ID` |
| `client_displayname` | optional | AlphaNumeric | `"Tools Australia"` |
| `email` / `firstname` / `lastname` | optional | — | `User.email` / `firstName` / `lastName` — send only if needed |

**Two contract caveats (confirm with them):**
- `member_level` is typed **"Alphabet" (letters only)** — so we can't send a raw `"100"` without confirming they accept a numeric string, **or** we agree alphabetic labels. *Open.*
- Their payload has **no expiry/`activeUntil` field** — so the access *window* cannot ride in the token; **we enforce duration our side** (see §2.5).
- Their payload has **no `state` field** — the State/territory dropdown on the portal login page is portal-UI only; **we do not send state** via SSO.

### 2.4 `member_level` — our tier model (the thing they must accommodate)
Access in our system is a **percentage-of-catalogue ladder** that **stacks** (a Tradie member who buys a VIP pack is immediately 100%) and **changes over time**. The two axes are **independent**: `member_level` carries the **% (breadth)**; duration is a **separate** signal (the expiry).

**The 9-tier mapping (1:1 with access %, no banding, no package names):**

| `member_level` (access %) | Duration | Packages at this tier |
|---|---|---|
| 5% | 1 hour | Mini Pack 1 |
| 10% | 6 hours | Mini Pack 2 |
| 15% | 12 hours | Mini Pack 3 |
| 25% | 1 day | Apprentice Pack |
| 40% | 2 days | Tradie Pack · Additional Tradie Pack · Tradie mini |
| 50% | recurring | **Tradie Subscription** |
| 55% | 4 days | Foreman Pack · Additional Foreman Pack · Foreman mini |
| 70% | 10 days | Boss Pack · Additional Boss Pack · Boss mini |
| 75% | recurring | **Foreman Subscription** |
| 85% | 20 days | Power Pack · Additional Power Pack · Power mini |
| 100% | 30 days (pack) | VIP Pack · Additional VIP Pack · VIP mini |
| 100% | recurring | **Boss Subscription** |

- **Effective tier = the highest active access %** across the member's active subscription + all active packs (reconciled — see §2.6). Resolve via `getPartnerDiscountAccessInfo` / `resolvePartnerCatalogPlanId`, **never** from a package name or stale state.
- **Why not band (e.g. 5–25% → bronze):** banding lumps 1h/6h/12h/1d durations into one level and destroys the 1:1 %↔duration correspondence. Keep it 1:1.
- **Why not send package names:** forces MyRewards to maintain a lookup for ~20 package ids, couples their portal to our taxonomy, fails the alphabet-only field, and doesn't escape stacking (you still pick the winner). The percentage is the cleaner key.

### 2.5 The sync model — how a level change reaches MyRewards
MyRewards holds a **copy** of the member's level, set at SSO time. Our system is the source of truth. **Always assert FULL state ("member X is level Y"), never deltas** — so retries/out-of-order calls converge.

| Change | How we detect it | Reflects in portal via |
|---|---|---|
| **Upgrade / new pack / resubscribe** | Stripe webhook (`grantBenefits`) | **next SSO token** — `/generatetoken` returns *"User level upgraded"*. **No webhook needed.** |
| **Cancel / refund** | Stripe webhook (`cancelQueueItem` / sub-end) | **push deactivate** (needs their API — undocumented) |
| **Downgrade at window expiry** | our **reconcile sweep** (no Stripe event) | **push lower level** at sweep time (needs their API), else next SSO |

**Key asymmetry:** *upgrades are free via SSO entry; downgrades/cancels need a server-to-server push* because there's no login event to carry a downward change. Their doc documents **no** revoke/deactivate/logout/webhook for JWT (the SAML method has a Single Sign-Out Service — see §6). This is the central open risk.

**Fallback if they won't expose a push API (Option B):** consume their **Product API** (`?user_id=…`) and render offers on our own `/rewards` page, gated by live effective access on every load — then there is no synced copy and every up/down change is correct instantly. Decided by the open questions in §6.

### 2.6 The reconcile-then-read rule (MUST — playbook §8)
Our queue is **lazily evaluated**: `hasActivePartnerDiscountAccess` / `calculateActivePartnerDiscountPeriod` are pure reads that report already-active rows; they do **not** promote a due item. As of the 2026-06-16 audit, **190 users are "stuck"** (paid access not yet swept active). A bare-read SSO gate would **wrongly deny all 190** and send a stale (low) `member_level`.

> **Every SSO access decision must reconcile-then-read:** load user → `await processPartnerDiscountQueue(user)` → `if (changed) await user.save()` → **then** `getPartnerDiscountAccessInfo(user)` for status + tier + expiry → **then** mint the token. Reuse the existing reconcile path; do not reimplement. Do **not** expire stuck packs — *activate* them.

### 2.7 Live portal recon — the login page (observed 2026-06-17)
Logged-out view of `toolsau.myrewards.com.au` (our TAR demo) shows MyRewards runs a **full native account system alongside SSO** — which raises real questions about how the two coexist:
- **White-labelled** as **"Tools Australia Rewards (TAR)"** — our brand, our logo top + footer. Good signal they brand to us, not "MyRewards."
- **First-time login** uses an **authorisation code** + a **password-creation** step (8+ chars, ≥1 number, ≥1 letter) + a **State/territory** dropdown.
- A **native mobile app** (Apple App Store + Google Play).
- Footer: Contact Us / Privacy Policy / Terms & Conditions (confirm whose).

**Open questions this raises (carry to the meeting):**
- Does SSO auto-login **fully bypass** the auth-code + password setup on first hit, or does the first SSO hit a "create a password / enter code" wall?
- Does the **authorisation code** get emailed by MyRewards — a confusing email for an SSO'd member?
- Does SSO work **into the mobile app**, or web-only?
- Does an SSO'd member also get a **password they could use to log in directly**, bypassing our gate? (another way a cancelled member retains access)
- `registered=0/1` (temporary vs permanent storage) applies to the **plaintext** auto-login methods; the **JWT** method auto-creates a **permanent** user and there is **no documented delete** → account-deletion / privacy-request handling is an open ask.

### 2.8 The architecture decision — hosted portal (A) vs API feed (B)
- **Option A — hosted portal + SSO** (what they demoed): members browse on MyRewards' portal; we gate *entry* via SSO; **they** must enforce the access window inside the portal.
- **Option B — API feed:** we pull their **Product API** (`?user_id=…`) and render offers on our own `/rewards` page, gated by live reconciled access on every load; redeem bounces to them.
- **Three votes for B** surfaced this session: (1) **cancellation/expiry enforcement** — under B it's automatic (no synced copy to keep current); (2) **tier-gating + branding** live entirely on our side; (3) **sync** — every up/down change is instant and free under B.
- **Decision driver:** if the §6 answers are bad (long portal session, no member-update/deactivate API, `member_level` is cosmetic), lean **B**. Otherwise **A on a CNAME subdomain** is the lighter build. Still open — see playbook §0/§1.

---

## 3. Context B — the JWT/auth remediation (this branch's primary work)

> Full detail: `docs/auth/jwt-auth-remediation-spec.md`. Summary only here.

Three token systems coexist, all HS256 over `NEXTAUTH_SECRET`:
1. **NextAuth** (`next-auth.session-token`) — has working revocation (`tokenVersion` + `isActive`).
2. **System 2 — custom** (`ta_session_token` + `Authorization: Bearer`) — signature+expiry only, no revocation. Used by cart/orders/mini-draws/`me`.
3. **System 3 — affiliate** (`affiliate_token`, `jose`) — no DB re-check at all.

**14 items across 4 stages** (do in order, one logical commit boundary each):

| Stage | Items | Effect | Docs to update (lockstep) |
|---|---|---|---|
| **1 — cart-auth-hardening** | A1 (HIGH), A2, C1 | Kill the raw-ObjectId bearer bypass; fix the cart "remove" 404; collapse 8 copy-pasted `getUserFromToken` | `docs/cart-shop-products/` |
| **2 — auth-revocation-and-secrets** | A3, B1, B2, B3, D3 | System-2 revocation; remove affiliate fail-open secret; pin `algorithms:['HS256']`; audience claims | `docs/auth/`, `docs/affiliate/` |
| **3 — retire-system-2** | C2, C3, D1, D2 | Migrate cart/orders/mini-draws to `getServerSession`; delete `ta_session_token` minting & the `me` route; standardize on `jose` | `docs/auth/` |
| **4 — middleware-cleanup** | D4, D5 | Remove dead `/api/admin` branch; hoist `isInternalUser` | `docs/security-csp/` |

**The single most urgent item is A1** (HIGH): cart routes accept a raw user ObjectId as a bearer → horizontal auth bypass / IDOR. Note A1 is a **coordinated client+server change** — `CartContext` must stop sending `session.user.id` as a bearer, not just a server edit.

---

## 4. The bridge — how the remediation enables the SSO signer

> **Naming convention (decided 2026-06-17).** The backend follows the existing **`partner-discount`** engine vocabulary (sibling to `/api/partner-discount/queue`; matches `hasActivePartnerDiscountAccess` / `getPartnerDiscountAccessInfo` / `PartnerDiscount` model): route **`POST /api/partner-discount/sso`**, signer **`src/lib/partner-discount-sso.ts` → `signPartnerDiscountSsoToken`**. Provider creds keep vendor names (`IGODIRECT_SSO_SECRET`, `IGODIRECT_DOMAIN_CODE`, …) — they're literally iGoDirect's, and easy to rename if the provider ever changes. Any **user-facing** label uses **"Partner Benefits"** to match the existing UI (`PartnerBenefits.tsx`, `/partner`, `my-account/benefits`). **"Perks" is dropped** — it appears only as marketing copy, never as a module name.

- **Stage 3 is the keystone.** Retiring System 2 and standardizing on `jose` means the MyRewards signer is **not** a fourth tangled token family sharing `NEXTAUTH_SECRET` — it's a clean, isolated, single-purpose signer with **its own secret**.
- **Do NOT reuse `src/lib/jwt.ts` `signJWT()`** for SSO — it's hardcoded to a 30-day expiry and a fixed `{sub,email,firstName,lastName,role}` payload (wrong secret, wrong claims, wrong TTL). Add a dedicated:
  ```ts
  // src/lib/partner-discount-sso.ts (new)
  signPartnerDiscountSsoToken({ memberId, memberLevel, domainUrl, domainCode, clientId, clientDisplayName })
    // jose, HS256, secret = IGODIRECT_SSO_SECRET, exp = +60m. Server-side only.
  ```
- **Reuse the access engine as-is — do NOT rebuild** (playbook §5): `grantBenefits()` (`src/utils/payment/payment-processing.ts`), `src/utils/partner-discounts/partner-discount-queue.ts` (`calculateActivePartnerDiscountPeriod`, `processPartnerDiscountQueue`, `cancelQueueItem`), `src/utils/membership/benefit-resolution.ts` (`hasActivePartnerDiscountAccess`, `getPartnerDiscountAccessInfo`), `src/utils/partner-discounts/partner-catalog-visibility.ts`, and `GET /api/partner-discount/queue` / `usePartnerDiscountQueue`.

---

## 5. Phased build plan (the whole arc)

> **Phase 1 is this branch's committed scope.** Phases 2–5 follow (here or a follow-on branch — decide at the Phase 1 → 2 boundary).

- **Phase 1 — JWT remediation** (Stages 1–4 above). Clean the base. Verify after each stage: `npm run type-check` + the relevant `test:*` scripts; update matching domain docs (doc-sync hook).
- **Phase 2 — SSO signer + route.** `src/lib/partner-discount-sso.ts` (`signPartnerDiscountSsoToken`) + `POST /api/partner-discount/sso` (reconcile-then-read gate → mint → `POST /generatetoken` → redirect via `/verifytoken`). Env: `IGODIRECT_SSO_SECRET`, `IGODIRECT_DOMAIN_CODE`, `IGODIRECT_CLIENT_ID`, `IGODIRECT_DOMAIN_URL`. Follow the `adding-api-route` skill; flag the new read to Norm per CLAUDE.md rule 10 if relevant.
- **Phase 3 — tier mapping.** Effective access-% → `member_level` resolver (the §2.4 table), sourced from the reconciled active period. Confirm encoding with iGoDirect first (§6).
- **Phase 4 — sync hooks.** Push full-state update on `cancelQueueItem` (deactivate) and on sweep-detected downgrade — **pending their member-update/deactivate API** (§6). Upgrades need no hook (SSO entry covers them).
- **Phase 5 — test SSO.** Against `test.myrewards.com.au` with our issued creds: mint → `/generatetoken` (expect "New user created" first, then "User found"/"User level upgraded") → `/verifytoken` → land in the portal at the right tier. Portal test login: `demo@igodirectgroup.com.au` / `MRPlus2026` (TAR demo).

> **⚠️ TESTING IS GATED ON THEIR SECRET (verified 2026-06-17).** The doc's §9.3 publishes a **pre-signed demo token only** — endpoint `https://test.myrewards.com.au/generatetoken` (POST `{"data":"<jwt>"}`) → `/verifytoken/{token}`, demo `domain_code=reward_code`, `client_id=1960`. It does **not** publish the **secret key** (their words: the secret is "shared with the client" privately). So:
> - **Buildable + unit-testable now (no secret):** `signPartnerDiscountSsoToken` structure (header/claims/HS256 with a dummy secret), the `/api/partner-discount/sso` reconcile-then-read gate, and the tier resolver — all verifiable with mocks.
> - **Connectivity replay (no secret):** we *can* POST the documented demo token to the live test endpoint to confirm reachability + the verify→redirect behavior (may 401 if input freshness is enforced) — proves plumbing, **not** our integration.
> - **Full end-to-end with OUR users: BLOCKED** until iGoDirect issues **our own** `IGODIRECT_SSO_SECRET` + `client_id` + `domain_code` + `domain_url` for a test tenant, and adds us to the auto-login list. The portal UI login (`demo@igodirectgroup.com.au`) does **not** help — it's not an API signing credential.
> - **Action:** request those test creds from iGoDirect **in parallel** with Phase 1. **If they don't arrive, pause after Phase 1 (remediation)** — optionally with the signer/route built-but-untested awaiting creds.

**CSP:** if the browser ever calls their domain or embeds their portal, update **both** `src/utils/security/csp.ts` and `next.config.ts` (`connect-src` for `/generatetoken`, `frame-src` for embeds, `img-src` + `images.remotePatterns` for offer logos). Prefer server-side calls (no CSP change for the fetch).

---

## 6. Open questions to resolve with iGoDirect (meeting agenda)

These are **not** answered by their doc (verified) — safe and correct to ask. The three "power questions" cite their own doc and prove we read it.

**❌ Already documented — do NOT re-ask (we've read §9):** the SSO method / endpoints / 60-min TTL, the secret being **issued per-client**, opaque `member_id` acceptance (their `UserId` example), the existence of a **sandbox/demo** (§9.3 + `test.myrewards.com.au`), that **upgrade** works (§9.1.4), and the Product API basics. Reframe these as *"we've implemented to your §9 spec — confirm,"* never as open questions, or we look like we didn't read the docs.

**Architecture-deciding:**
- **Session lifetime after `/verifytoken`?** Does every visit re-route through our SSO, or can a member reach the portal directly and bypass our gate? (Their doc covers the 60-min *token* TTL, says nothing about the logged-in *session*.)
- **Member-update / deactivate API?** Is there a server-to-server call to set/lower/deactivate a member's level when our access changes? (Undocumented — the downgrade/cancel path depends on it.)

**The three doc-grounded power questions:**
1. **Downgrade** — *"§9.1.4 shows 'User level upgraded' and §9.4's `420` is 'already registered… with one or more level up.' How does a level DECREASE work — when a member's higher tier expires and we send a lower `member_level`, does it take effect, or does the platform only move levels up?"*
2. **Logout** — *"Your SAML method lists a Single Sign-Out Service; the JWT method documents none. Is there any logout / de-provision / session-termination for JWT, or is SLO only via SAML?"*
3. **Per-user catalogue** — *"The Product API takes `user_id` — does the returned catalogue already reflect that member's `member_level`/entitlements, or is it the full catalogue we filter ourselves?"*

**Portal account-model (from §2.7 recon):**
- Does SSO **fully bypass** the auth-code + password-creation flow? Does it work **into the mobile app**? Does an SSO'd member get a **direct-login password** that bypasses our gate?
- **Account deletion / anonymisation:** can we delete a member's MyRewards record on a privacy request? (No delete documented; JWT users are permanent.)

**Contract confirmations:**
- `member_level` encoding: accept numeric `"100"`, or agree 9 ordered alphabetic labels? And **does `member_level` actually gate the catalogue**, or is it a label? (Their doc has zero info on level gating.)
- Please issue **our** secret, `domain_code`, `client_id`, `domain_url` (test + prod) and **add us to the auto-login list**.
- Redemption/activity **data back** to us (webhook / report / CSV keyed to our `member_id`)? (None documented.)

---

## 7. Touch-point map

**Remediation (Phase 1)** — see remediation spec for exact lines: `src/app/api/cart/{route,items,update,summary,clear}/route.ts`, `src/contexts/CartContext.tsx`, `src/hooks/queries/useCartQueries.ts`, `src/app/api/orders/**`, `src/app/api/mini-draws/entries/route.ts`, `src/app/api/auth/{login,me}/route.ts`, `src/lib/jwt.ts`, `src/lib/affiliate-auth.ts`, `src/lib/api-auth.ts`, `src/middleware.ts`.

**SSO build (Phases 2–4, new):** `src/lib/partner-discount-sso.ts`, `src/app/api/partner-discount/sso/route.ts`, env additions, sync hooks in `cancelQueueItem` + the reconcile sweep, CSP files. **Reuse (don't rebuild):** the access-engine files in §4.

---

## 8. Constraints & footguns (read before editing)

- **No auto-commit** (CLAUDE.md rule 1) — do not `git commit/add/push/PR` unless DJ says `commit`/`push`/`ship it`/etc.
- **Shared-worktree discipline** — this `jwt-auth-remediation` worktree is *separate* and safe to work in, but the repo is shared; **stage only this session's files**, never `git add -A`.
- **Doc-sync hook** — editing `src/` requires the matching `docs/<domain>/` update in the same task (table in §3).
- **reconcile-then-read** for any SSO access decision (§2.6) — never bare-read.
- **member_level is Alphabet-typed** and **there is no expiry field** — duration is enforced our side.
- **Use only the signed JWT path** — never the plaintext `member_auto_login` / base64 `?r=` methods.
- **Dedicated SSO signer** — never reuse `signJWT` (wrong secret/claims/TTL).
- **Norm lockstep** (CLAUDE.md rule 10) — if the SSO route or access-engine response shape changes and Norm mirrors it, keep it in sync or flag it.
- Production builds strip `console.log` — use `console.error` for anything that must survive (incl. staging/preview).

---

## 9. Definition of done

**Phase 1 (this branch):**
- A request with `Authorization: Bearer <any ObjectId>` returns 401; cart works only with a valid session for the calling user (A1).
- Single-item cart remove issues `DELETE /api/cart` and persists (A2).
- One shared, fallback-free auth helper; seven private copies gone (C1).
- Deactivating a user / bumping `tokenVersion` invalidates cart/orders/mini-draw/profile access (A3); affiliate missing-secret → loud crash, audience-scoped tokens (B1/D3); `algorithms:['HS256']` pinned (B3).
- `ta_session_token` no longer minted; bearer routes on `getServerSession`; one JWT lib (`jose`) (C2/C3/D1/D2).
- Dead `/api/admin` middleware branch removed; one `isInternalUser` (D4/D5).
- `npm run type-check` clean; relevant `test:*` green; domain docs updated.

**Phases 2–5 (SSO):**
- `signPartnerDiscountSsoToken` mints a valid MyRewards JWT (verified by a successful `/generatetoken` → "New user created").
- `POST /api/partner-discount/sso` reconciles-then-reads, gates on active access, and round-trips a member into `test.myrewards.com.au` at the correct tier.
- Tier resolver maps effective access-% → `member_level` per §2.4 from reconciled state.
- Sync hooks wired (or Option-B chosen) per the §6 answers.

---

**MyRewards / iGoDirect contact:** info@myrewards.com.au · 1300 857 787 · G02, 181 St Kilda Road, St Kilda VIC 3182. **TAR test portal:** `toolsau.myrewards.com.au` (demo login `demo@igodirectgroup.com.au` / `MRPlus2026`). **Their dev docs:** `https://atwork.com.au/document/`.

*Companion docs on this branch: `docs/auth/jwt-auth-remediation-spec.md` · `docs/partner/igodirect-integration-playbook.md` · `docs/partner/igodirect-integration-prep.md`. This master plan was authored 2026-06-17 from a session that read the MyRewards docs (`atwork.com.au/document`) end-to-end and worked out the tier-mapping, sync model, portal recon, and question audit above.*
