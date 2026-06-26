# iGoDirect / MyRewards SSO — Corrected Implementation Plan (audited)

> **Status:** 🟢 READY TO IMPLEMENT (SSO half) · 🔴 BLOCKED on vendor confirmations (offer-feed half) · **Target:** a NEW branch off `main` (e.g. `feature/rewards-sso-integration`).
>
> **What this doc is.** The single, authoritative, *audited* build plan for the rewards SSO integration. It supersedes the build sections of [igodirect-sso-masterplan.md](./igodirect-sso-masterplan.md) (which remains the strategy/handoff doc) and folds in a deep multi-agent accuracy audit (codebase + vendor docs + best practice) + an adversarial verification pass run 2026-06-22. Where this doc and the masterplan disagree on *how to build*, **this doc wins** — it carries corrections the masterplan's design did not have.
>
> **Companion docs:** [igodirect-sso-masterplan.md](./igodirect-sso-masterplan.md) (strategy), [../partner/igodirect-integration-playbook.md](../partner/igodirect-integration-playbook.md) (vendor facts + open-questions tracker), [jwt-auth-remediation-spec.md](./jwt-auth-remediation-spec.md) (the clean base this builds on).

---

## 🚦 GO-LIVE GATE — read before merging / releasing

The route `POST /api/partner-discount/sso` is **inert in production by default**: it returns **404** unless the env flag **`PARTNER_DISCOUNT_SSO_ENABLED=true`** is set (it's always enabled in local `development` so the `/dev/rewards-sso` harness works). **So merging this branch to main is safe — the endpoint stays dark in prod until you flip the flag.** This is enforced in code ([route.ts](../../src/app/api/partner-discount/sso/route.ts)), not just documented, so it survives being forgotten.

**To actually go live**, set `PARTNER_DISCOUNT_SSO_ENABLED=true` in Vercel — but ONLY after all of:
1. The vendor **deprovisioning / re-sync** answer (§5 #6, §5a) — so a cancelled/expired/downgraded member's portal access can actually be cut off.
2. The **`member_level` encoding** answer (§5 #3, §5a) if/when we send tiers.
3. The **member-deletion / anonymisation + DPA** confirmation (§5 #7) — we now send name + email.

Do **not** flip the flag before these. Also remove the `/dev/rewards-sso` test harness before merge.

---

## 0. Audit verdict — SOUND, with corrections

The architecture is the **best fit for this codebase and is scalable** — the audit found **no better-fitting option**. It is **not** destined to become messy **if** the corrections below are applied. The audit caught one real correctness landmine (§3 N1) and one vendor-contract risk (§5) that would have made the feature messy if built blind.

**Why it's scalable (verified):** one access engine reused (not rebuilt); the vendor sealed behind an adapter (`partner-discount-sso.ts` + a future product-feed client + env vars only); **Option B carries no sync state machine** (the single biggest maintainability win); placements snap onto existing modules instead of forking new ones.

---

## 1. Architecture decision — **Option B (committed)**

| | Option A — redirect into their portal | **Option B — offers on our page (CHOSEN)** |
|---|---|---|
| Member browses offers | on MyRewards' site | on **our** `/rewards` page, gated every load |
| Revoke a cancelled member | ❌ impossible — see below | ✅ gate re-checked on every load |
| Sync burden | a push-on-cancel/downgrade **state machine** to maintain forever | **none** — no synced copy |

**Why A is disqualified for "no access leak to cancelled members":** the first SSO auto-creates a **permanent native account on MyRewards (with its own password)**, and their docs document **no** deactivate/logout/revoke for the JWT method. Our gate only controls *minting a token*; it cannot revoke an account it already created. So A structurally cannot meet the requirement.

**The shape we build:**
- **Browse** = pull MyRewards offers via their Product API → render on our existing `/rewards` page, **gated by reconciled access on every load**.
- **Entry / hand-off** = the SSO signer we already built, used **only at click-time** to drop the member into the portal (e.g. to redeem an offer) — a fresh, short-lived token per click, never a standing portal session.

Both halves consume the **same** reconcile-then-read gate. Nothing built so far is wasted.

---

## 2. Already built & proven (verify, do not rebuild)

- ✅ [`src/lib/partner-discount-sso.ts`](../../src/lib/partner-discount-sso.ts) — `signPartnerDiscountSsoToken()`: dedicated secret (`IGODIRECT_SSO_SECRET`), fail-loud, **HS256 pinned**, PII-optional, claim order matching MyRewards' sample. Manifest already covers it.
- ✅ [`scripts/test-igodirect-sso.ts`](../../scripts/test-igodirect-sso.ts) (`npm run test:igodirect-sso`) — connectivity probe; **passes against production** (their server accepts our standard jose token; `/verifytoken` 302s into the portal). Uses iGoDirect's own sample identity, so it creates no new record.
- ✅ Env documented in [`.env.example`](../../.env.example): `IGODIRECT_SSO_SECRET` (secret), `IGODIRECT_CLIENT_ID=2412`, `IGODIRECT_DOMAIN_CODE=ToolsAustralia`, `IGODIRECT_DOMAIN_URL=myrewards.toolsaustralia.com.au`.

---

## 3. Corrections to apply (folded in from the audit)

### 🔴 N1 — the keystone correctness fix (the landmine)

`resolvePartnerCatalogPlanId` ([partner-catalog-visibility.ts](../../src/utils/partner-discounts/partner-catalog-visibility.ts)) reads `user.subscriptionPackageData` and `user.enrichedOneTimePackages` — **neither field is stored on the Mongoose `IUser` schema** ([User.ts](../../src/models/User.ts) has only `partnerDiscountQueue`). They are **computed in route handlers** via `getEffectiveBenefits()` (see [`src/app/api/users/[id]/route.ts`](../../src/app/api/users/[id]/route.ts) ~L67–147). Consequences for a server-side SSO/offers path:

- Feeding a plain (or queue-reconciled) user doc → both fields `undefined` → **a paying subscriber is mis-tiered** (denied, or granted 100% via the "unknown → 100%" fallback at `partner-catalog-visibility.ts:81`/`:108`).
- The masterplan's §2.6 remedy ("feed one reconciled `IUser` doc to gate + tier") is **insufficient** — `processPartnerDiscountQueue` + `user.save()` reconciles the **queue only**; it never hydrates those two fields. The existing `getReconciledPartnerDiscountSummary` helper builds its clone from only `subscription` + `partnerDiscountQueue`, so **it strips exactly the fields the resolver needs.**

**Correct fix (do this — verified against the route code):**
1. Derive tier through **`getEffectiveBenefits(user)`** (the same function the route uses) — **not** raw `user.subscription.packageId`. Reading the raw `packageId` reintroduces the **downgrade-preservation bug** the route exists to avoid (the effective plan id ≠ stored `packageId` during a downgrade window).
2. Put this in a **reusable server-side enricher in `src/utils/partner-discounts/`** (port the enrichment from the route), so the SSO/offers path and the route share one source of truth.
3. **Do NOT** route SSO tier through `getReconciledPartnerDiscountSummary`'s clone shape — it omits `subscriptionPackageData`/`enrichedOneTimePackages`.
4. `resolveMemberLevel(user)` must be **fail-closed**: an unresolved planId → **deny**, never inherit the `100`-default footgun.
5. Coerce legacy `mini-pack-4..8` to the **current** Additional ladder (40/55/70/85/100), not the stale `30/50/60/60/80` at `partner-catalog-visibility.ts:73-77`.

### Naming forks to fix (match existing vocabulary)

| Plan term | Use instead | Why |
|---|---|---|
| `PartnerDiscountSsoMint` model | **`PartnerDiscountSsoIssuance`** | `Issuance` is the established model suffix ([RedeemableIssuance.ts](../../src/models/RedeemableIssuance.ts), [MilestoneIssuance.ts](../../src/models/MilestoneIssuance.ts)); `Mint` has zero precedent. ("mint" is fine as the code *verb*.) |
| SSO route called "redeem" | **"SSO hand-off" / "portal entry"** | "redeem"/"redemption" already means points→package ([RewardsRedemption.tsx](../../src/app/(site)/rewards/components/RewardsRedemption.tsx), `/api/rewards/redeem`). Route path `/sso` is fine. |
| (new `/rewards` page) | **extend the existing** [rewards/components/PartnerDiscounts.tsx](../../src/app/(site)/rewards/components/PartnerDiscounts.tsx) | `/rewards` already exists (rewards-redeemables) and already renders partner-discount access. Do not fork it. |
| (new `src/services/partner-discount/`) | **`src/utils/partner-discounts/`** | The engine lives there; a parallel service dir would fork the engine and violate layering. |
| `GET /api/partner-discount/offers` | ✅ **keep `offers`** | `offers` is the existing term ([`src/data/partnerBrandOffers.ts`](../../src/data/partnerBrandOffers.ts)); "brands"/"catalog" would be the fork. |

### Security hardening

- **N7** — add a `jti` claim + **mint at click-time** (short TTL). The token rides in the redirect URL → browser history/`Referer`/logs; treat it as replayable until single-use is vendor-confirmed (§5).
- **N6** — rename the signer's doc comment `member_id` "opaque `User._id`" → **"stable, non-PII"** (ObjectIds are timestamp-prefixed, enumerable). Consider a per-vendor surrogate id if the auto-created account is keyed on it.
- **N8** — the rate limiter ([rateLimiter.ts](../../src/utils/security/rateLimiter.ts)) **fails open** and `requireSameOrigin` ([requireSameOrigin.ts](../../src/utils/security/requireSameOrigin.ts)) passes when no `Origin` header. Keep both as a **courtesy cap**, but the **gate** (denies non-members) + short single-use token are the real authorization boundary — never treat the rate limiter as the gate.
- **N9** — the mint endpoint **must not depend on a successful `user.save()`** to issue the token (read-modify-write has no optimistic lock; a `__v` conflict must not block entry).

### PII / privacy

**Now SENT (owner-approved 2026-06-24):** `firstname` / `lastname` / `email` are included so the member's portal profile pre-fills (mobile is NOT in MyRewards' SSO payload, so it cannot be sent). `member_id` remains the opaque stable key. Because MyRewards auto-creates a permanent account with **no documented delete**, sending this PII makes a **member-deletion / anonymisation ask + DPA a FIRM requirement** (now a live query to iGoDirect — see §5 #7), not optional.

---

## 4. Build checklist (layered, ordered)

| # | Layer | File | What |
|---|---|---|---|
| 1 | util (enricher) | `src/utils/partner-discounts/` | Reusable server-side benefit enricher via `getEffectiveBenefits` (the N1 fix) so the SSO/offers path tiers correctly. |
| 2 | util (tier) | `src/utils/partner-discounts/` → `resolveMemberLevel(user)` | Enriched effective access-% → `member_level`; **fail-closed**; legacy ladder coercion. |
| 3 | util (flow) | `src/utils/partner-discounts/` → portal SSO hand-off | Sign → `resilientFetch` POST `/generatetoken` → build `/verifytoken/{token}` URL. Add `jti`; never log the raw JWT. |
| 4 | model | `src/models/PartnerDiscountSsoIssuance.ts` | PII-safe (`userId` ref, **no email**), `memberLevelSent`, `success`, `providerResponse`/`Code`, hashed token correlation (not raw JWT), `createdAt` + TTL `expires`. `models.X || model(...)` guard. Best-effort write (never blocks entry). |
| 5 | route (entry) | `src/app/api/partner-discount/sso/route.ts` (POST) | Thin: `requireSameOrigin` → rate-limit → `requireAuthenticatedUserDoc` → reconcile-then-read gate → tier → flow util → `{ success, data:{ redirectUrl, memberLevel } }`. |
| 6 | route (browse) | `src/app/api/partner-discount/offers/route.ts` (GET) | Auth → gate → Product API client → offers JSON. **(blocked — §5)** |
| 7 | product client | `src/utils/partner-discounts/` | Server-side Product API call. **(blocked on real shape + creds — §5)** |
| 8 | UI | extend [rewards/components/PartnerDiscounts.tsx](../../src/app/(site)/rewards/components/PartnerDiscounts.tsx) (+ sibling `PartnerOffers` if needed) + TanStack hook | Render offers + "Open Partner Portal" CTA → POST entry route → top-level navigate. Gate behind existing `rewardsEnabled()` flag (no new flag). |
| 9 | manifest/docs | CLAUDE.md manifest + `docs/partner/`, `docs/auth/` | Add to `partner` domain `paths`: `"src/models/PartnerDiscountSsoIssuance.ts"` and `"src/hooks/queries/usePartnerDiscount*.ts"`. **Update docs in the SAME phase the file is created** (doc-sync Stop hook blocks otherwise). Use the `adding-api-route` skill for the routes. |
| 10 | CSP | `csp.ts` + `next.config.ts` | **Only** if rendering their offer images: add `img-src` + `images.remotePatterns`. Server fetch + redirect need no CSP change. |

**Reconcile-then-read (mandatory for every access decision):** load user → `await processPartnerDiscountQueue(user)` → `if (changed) await user.save()` → enrich + read (`getPartnerDiscountAccessInfo` gate; `resolveMemberLevel` tier) → mint. The ~190 "stuck" (paid-but-unswept) users make this non-optional.

---

## 5. Vendor confirmations — **BLOCK before building the dependent layers**

The public docs **contradict or do not confirm** several load-bearing facts. Treat these as unconfirmed assumptions, not settled, until iGoDirect answers:

| # | Item | Status vs public docs | Blocks |
|---|---|---|---|
| 1 | **Product API real shape** | ❌ docs show **`/api/v2/products`, `Authorization: Token token={KEY}:{SECRET}`, params `status/SKU/brand_id` — no `user_id`** (plan assumed `/app/api/v1/products`, BASIC auth, `?user_id`) | **the entire offer-feed half (tasks 6–8)** |
| 2 | Product API **BASIC/Token creds** | not issued (email gave SSO creds only) | offer-feed |
| 3 | Does `member_level` **gate the catalogue** + its encoding (numeric `"100"` vs alphabetic) | ❓ undocumented | tier correctness |
| 4 | **HS256** specifically | ⚠️ docs say "HMAC" only — HS256 not stated (signer pins HS256) | confirm pin won't break |
| 5 | `/verifytoken` **single-use**? + post-verify **session lifetime** | ❓ not findable | replay defense (N7), access-leak severity |
| 6 | **Deprovisioning / deactivate API** (Q8) | ❓ none documented | the access-leak gap — resolve or **explicitly accept** "cancelled member retains portal access up to TTL" before launch |
| 7 | **Member deletion / anonymisation API + DPA** — *now FIRM: we send `firstname`/`lastname`/`email`.* Is there an API or process to **delete or anonymise a member** on a privacy / right-to-erasure request? (Their JWT method auto-creates a permanent account with no documented delete.) | ❓ none documented | privacy compliance for the PII we now send |

> The SSO **entry** half (tasks 1–5, 8-CTA) is buildable + unit-testable **now** with mocks. The **offer-feed** half is blocked on #1/#2. Build SSO first; gate the offer-feed behind the answers.

---

## 5a. "SSO-only + session-refresh" idea — evaluated 2026-06-23 (vendor-gated; do NOT re-architect on it)

**Idea:** remove the portal's native email/password login so the only entry is our gated SSO, and rely on a short portal session forcing periodic re-authentication through our gate — so each re-entry re-runs reconcile-then-read and catches expiry/upgrade, closing the access-leak without a vendor deactivate API.

**Verdict: coherent mechanism, but it is NOT a solution we can commit to — it is a set of questions for the vendor.** Reasons (verified against our notes + their docs + best practice):

- **Token refresh is NOT documented.** The only token-lifecycle fact is the 60-min TTL on the *one-time entry token*. A JWT one-time login has no "refresh" — each entry mints a fresh token. The portal *session* lifetime after `/verifytoken` is the undocumented unknown the idea depends on.
- **The linchpin contradicts their documented default.** The JWT method auto-creates a **permanent native account with its own password, no documented delete** (§1, masterplan §2.7). The idea needs the vendor to *suppress a credential their platform mints by default* — the likeliest "no," and without it the member logs in directly forever.
- **We control none of the session cookie** — it lives on their tenant. A long / "remember me" cookie defeats a short token re-mint entirely.
- **The mobile TAR app is a parallel bypass** — "disable native login" + "short session" are web controls a native app typically ignores; the disable would have to apply to the app too.
- **Best case is a *bounded* leak, not zero.** The gate runs at entry, not continuously; a cancelled member keeps access until the current session ends (length **unknown** — could be hours). **Option B already gives a *zero*-window browse gate**, so this idea's ceiling is *no better than the committed plan, with more vendor dependencies.*
- **SAML:** only its **Single Logout (SLO)** is attested in their docs — a real revoke lever JWT lacks, worth asking about. `SessionNotOnOrAfter` / `ForceAuthn` are general SAML-standard features that appear **nowhere** in their docs — do **not** assume MyRewards honors them.

**Questions to put to iGoDirect (in writing) — these supplement §5:**
1. Can native email/password login be fully disabled (SSO-only), and the auto-created password credential **suppressed — including in the mobile app**?
2. Portal session/cookie TTL after `/verifytoken` — short, non-persistent, tenant-configurable to ~15 min? Any "remember me"?
3. On session expiry, does it redirect back to **our** SSO, or to their TAR-branded native login (a bypass)?
4. SAML method: is **Single Logout (SLO)** supported + configurable so we can terminate a session on cancellation?
5. (already §5) Any real deprovisioning API (deactivate / revoke / SCIM / back-channel logout)? — beats this whole pattern if yes.
6. (already §5) Is `/verifytoken` single-use within its 60-min window?

**Decision:** keep building the SSO-entry half + **Option B's per-load gate as the authoritative no-leak boundary**; send the questions. Promote the hosted-portal model (and lean less on the blocked offer feed) **only if** Q1 + Q2 + Q3 — ideally via SAML + SLO — come back "yes." **Operational guardrail:** do **not** expose the member-facing entry button live until deprovisioning (§5 #6 / Q5 above) is answered, or the bounded-leak window is **consciously accepted** in writing. Nothing built so far is wasted under any answer.

---

## 6. Test strategy

- **(a) Probe — already have it:** `npm run test:igodirect-sso` replicates their emailed sample flow (offline secret proof → `/generatetoken` → `/verifytoken`). Run first.
- **(b) Unit tests to add** (`tsx` + `node:assert/strict`, one `test:*` each): signer claims/order/no-exp/fail-loud; `resolveMemberLevel` across all package types **incl. fail-closed + the N1 enriched-doc path** (assert a subscriber tiers correctly from an enriched doc, and a stripped/clone doc is rejected, not silently 100%); gate (active→ok, expired/cancelled→403, **stuck→reconcile→200**).
- **(c) E2E on staging:** set the four `IGODIRECT_*` vars; stage active / "stuck" / cancelled members; verify each hop (unauth→401, cancelled→403 no token, stuck→200, active→302 at correct tier). Use `console.error` for staging diagnostics (prod build strips `console.log`). **Full E2E with our own users is BLOCKED** until iGoDirect issues our own test secret + auto-login allowlisting.

---

## 7. Phased plan (new branch)

| Phase | Ships | Gate |
|---|---|---|
| **0 — Confirm + commit** | run probe; send §5 + §5a questions; record **Option B** decision | probe green |
| **1 — Enricher + tier resolver** | N1 enricher + `resolveMemberLevel` (fail-closed) | unit tests green |
| **2 — Entry route + gate + Issuance log + manifest/docs** | `ssoGate`, flow util, `/api/partner-discount/sso`, `PartnerDiscountSsoIssuance` (+ manifest + docs **same phase**) | 401/403/200 correct; issuance row written |
| **3 — Entry CTA + staging E2E** | "Open Partner Portal" CTA on the rewards page | E2E hop matrix passes |
| **4 — Offer feed** *(blocked on §5 #1/#2)* | Product API client + offers route + UI + CSP image rules | offers render, gated per load |
| **5 — Go-live** | move TAR from roadmap to "Live" in README.md + BUSINESS.md; Norm flag if a mirrored shape changes | lint + type-check + doc-sync clean |

---

## 8. Risk register

| Risk | Mitigation |
|---|---|
| Access leak to cancelled members | Option B (gate every load); resolve/accept Q8 (§5 #6) before launch; SSO entry is per-click + short-lived |
| Subscriber mis-tier (N1) | enricher via `getEffectiveBenefits`; fail-closed resolver; unit test the enriched-doc path |
| Replay (token in URL) | `jti` + mint-at-click + confirm single-use (§5 #5) |
| PII to a no-delete vendor | PII off by default; DPA before sending |
| Built on a wrong API contract | §5 block-list — confirm before building the offer-feed half |
| Vocabulary fork | Issuance model, no "redeem", extend existing `/rewards` + `utils/partner-discounts/` |

---

*Authored 2026-06-22 from a multi-agent accuracy audit (codebase + vendor docs + best practice) with an adversarial verification pass. Key files cited above are clickable. The strategy/handoff narrative remains in [igodirect-sso-masterplan.md](./igodirect-sso-masterplan.md).*
