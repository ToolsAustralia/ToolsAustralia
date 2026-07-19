# iGoDirect Member-Status API — Implementation Plan & Session Handoff

> **Status:** 🟢 READY TO IMPLEMENT · **Owner:** DJ · **Target:** a NEW branch off `main` (suggested: `feature/partner-discount-member-status`, worktree via `scripts/wt-new.sh` → `.worktrees/partner-discount-member-status/`)
>
> **What this doc is.** The single, self-contained brief for building the live member-status endpoint that iGoDirect's MyRewards portal will call. A fresh Claude session reading ONLY this doc (plus the files it points at) has everything needed: the business agreement, the API contract, the reuse map into the existing partner-discount engine, the quality bars, and the vendor-handoff deliverable. If this file is missing from your worktree, it lives in the main folder at `docs/partner/igodirect-member-status-api-plan.md`; copy it in and commit it with Phase 1.
>
> **Read next (in order):** `docs/partner/igodirect-integration-playbook.md` (vendor facts, §8 reconcile trap), `docs/partner/gotchas.md`, `docs/auth/igodirect-sso-implementation-plan.md` (§3 N1 tier-resolution landmine — already fixed, reuse the fix).

---

## 1. Business context (agreed with iGoDirect, July 2026 meeting)

Tools Australia members get partner-discount access through the white-label MyRewards portal (`myrewards.toolsaustralia.com.au`, run by iGoDirect). The tier model: our packages grant an **access percentage** (5 / 10 / 15 / 25 / 40 / 50 / 55 / 70 / 75 / 85 / 100), computed live on our side as the member's **highest active** entitlement (subscription and/or time-boxed one-time packs). See `docs/partner/igodirect-integration-playbook.md` §2 for the full package table.

**What was agreed:**
- **No per-tier domains.** One tenant, the existing `myrewards.toolsaustralia.com.au`. The tier travels as data.
- **Tools Australia is the source of truth** for who has access, at what level, until when. The portal reflects it.
- **iGoDirect's portal will call an API on our side** to check (and thereby refresh) a member's discount access at three moments: **SSO sign-in**, **page load**, and **offer redemption**. The redeem-time call is the real enforcement gate; page-load calls keep their UI honest. No timed polling.
- The endpoint is a **read**. There are no write parameters: our reconcile-on-read promotes any due access as a side effect, which is what makes the answer always current (a one-time pack expiring on a timer produces no event anywhere; whoever evaluates next discovers it).

The brand→tier catalogue mapping (which brands unlock at which %) is a **separate workstream** (an offers CSV being curated with Michael). It does not block this API: we return the %, the portal maps % → visible brands per the agreed mapping.

## 2. The API contract (we own it; changes are additive-only)

```
GET /api/partner-discount/member-status?member_id=<id>[&event=sign_in|page_load|redeem]
Host: toolsaustralia.com.au          (staging: staging.toolsaustralia.com.au)
Authorization: Bearer <IGODIRECT_MEMBER_STATUS_KEY>
```

- `member_id` (required): the same identifier we send as `member_id` in the SSO JWT — today the member's opaque `User._id` string (see `signPartnerDiscountSsoToken` in `src/lib/partner-discount-sso.ts`). Validate as a Mongo ObjectId before querying.
- `event` (optional): `sign_in` | `page_load` | `redeem`. Observability only; never changes the answer.

**200 — the only success shape** (exactly the fields agreed with the vendor; extend additively only):

```json
{ "active": true, "member_level": 70, "expires_at": "2026-07-19T13:59:59.000Z" }
```

- `active`: does the member have partner-discount access right now.
- `member_level`: the access % (number 5–100), or `null`. `null` while `active:true` is a fail-closed anomaly — log it via `console.error` and tell the vendor to treat it as minimal access.
- `expires_at`: ISO-8601 UTC. For a pack: the window end. For a subscriber: the **next renewal date** (rolls forward while subscribed — document this in the vendor PDF so they don't treat it as a hard stop). `null` when inactive.
- A member with no access is **`200 { "active": false, "member_level": null, "expires_at": null }`** — not 403. Reserve 4xx for caller errors.

**Errors:** `400 {"error":"invalid_member_id"}` · `401 {"error":"unauthorized"}` · `404 {"error":"unknown_member"}` · `429` with `Retry-After` · `503 {"error":"disabled"}` when the go-live flag is off (see §6). Always `Cache-Control: no-store`.

## 3. Auth — decision and rationale

**V1: single static bearer secret over HTTPS**, compared in constant time (`crypto.timingSafeEqual`, mirror the length-check-then-compare in `src/lib/internal-norm/auth.ts:91-95`). Fail **loud** if the env var is unset (500 misconfigured — never fail open). Rationale: the response is non-PII (a boolean, a number, a date); iGoDirect's own Product API uses static token auth, so this is a scheme their side implements without friction; and the stronger alternative's replay protection is per-instance-only on Vercel anyway (see the LIMITATION note in `src/lib/internal-norm/auth.ts:31-37`).

**Documented upgrade path (do not build now):** the full HMAC scheme in `src/lib/internal-norm/auth.ts` (bearer + timestamp + nonce + HMAC-SHA256 over method/path/query/bodyhash/timestamp/nonce). Offer it to iGoDirect's security folks in the PDF as available on request.

The rate limiter (`createDistributedRateLimiter` from `src/utils/security/rateLimiter.ts`) is a **courtesy cap, not the boundary** — it fails open by design (see the SSO route's comment, `src/app/api/partner-discount/sso/route.ts:17-19`). Size it for their aggregate server-side volume (every portal page load funnels through a few egress IPs): start at ~600 req/min per identifier and revisit with real traffic.

## 4. Implementation map — REUSE the engine, do not rebuild

**New files (all inside globs the `partner` domain manifest already covers — no manifest edit needed):**

| File | What |
|---|---|
| `src/app/api/partner-discount/member-status/route.ts` | Thin GET handler: flag gate → bearer auth → validate `member_id` → `User.findById` → `reconcilePartnerDiscountAccess(user)` → map to response. No business logic in the handler. |
| `src/utils/partner-discounts/member-status.ts` | `buildMemberStatusResponse(decision)` — maps an `SsoAccessDecision` to the wire shape, and the bearer-check helper (env read + timingSafeEqual). Pure and unit-testable. |
| `src/utils/partner-discounts/__tests__/member-status.test.ts` | tsx test (see §7) + a matching `test:member-status` script in `package.json` (repo rule: a test without a `test:*` entry is undiscoverable). |

**Reuse as-is (this is where the correctness lives — verified working in production paths):**
- `reconcilePartnerDiscountAccess(user)` in `src/utils/partner-discounts/sso-access.ts` — the canonical **reconcile-then-read**: promotes due-but-unswept queue items (real stuck-user population exists; see playbook §8), best-effort saves (a `user.save()` version conflict must NOT fail the read — N9), then returns `{ hasAccess, accessInfo, memberLevel }`.
- `resolveMemberLevel` / `buildPartnerCatalogContext` in `src/utils/partner-discounts/member-level.ts` — already called inside the decision; **fail-closed** (never inherits the "unknown plan → 100%" fallback). Do NOT call `resolvePartnerCatalogPlanId` on a raw user doc (the N1 landmine — `docs/auth/igodirect-sso-implementation-plan.md` §3).
- `getPartnerDiscountAccessInfo` in `src/utils/membership/benefit-resolution.ts` — supplies `hasAccess` / `expiresAt` / `isRecurring`; "highest active tier wins" (an active pack above the subscription % leads; when it lapses the member falls back to the subscription level — this exact scenario is the vendor's headline example).
- Route conventions: follow `src/app/api/partner-discount/sso/route.ts` as the style template (same folder, same response envelope discipline, same rate-limiter usage). **Use the `adding-api-route` skill** when building.

**Explicitly out of scope (lean rule):** no new Mongo models, no call-audit collection (console + Vercel logs suffice for v1), no webhook/push direction, no HMAC, no response caching (accuracy is the whole point), no surrogate member-id migration (tracked separately as privacy hardening; today `member_id` = `User._id` because that is what the SSO already gave them).

## 5. Correctness rules (the bug-free bar)

1. **Every access answer is reconcile-then-read.** A bare read wrongly denies members whose paid access hasn't been swept active. Never reimplement the sweep; call `reconcilePartnerDiscountAccess`.
2. **Fail closed on tier**, fail loud on config: unresolved plan → `member_level: null` (+ `console.error`); missing env secret → 500, never allow.
3. **`active:false` is a valid 200**, `404` strictly for unknown ids, `400` for malformed ids (don't let Mongoose cast-throw decide your status codes).
4. **The save inside reconcile is best-effort** — wrap so a write failure still returns the in-memory-correct answer (pattern already inside `reconcilePartnerDiscountAccess`).
5. **Subscriber semantics:** `expires_at` = next renewal, `active` stays true while `subscription.isActive` (grace/past-due members remain active by design — see `docs/partner/gotchas.md` "Past-due interaction").
6. **No caching anywhere** (`no-store`; no ISR/edge caching on the route — export `dynamic = "force-dynamic"` if needed).
7. `console.log` is stripped in production builds; use `console.error` for anything that must survive (repo rule).

## 6. Config & rollout (default-dark, same pattern as the SSO route)

- `IGODIRECT_MEMBER_STATUS_KEY` — the bearer secret. Mint ≥32 random bytes; we generate it and hand it to iGoDirect over a secure channel (never email plaintext alongside the URL).
- `IGODIRECT_MEMBER_STATUS_ENABLED` — go-live gate. Route returns 503 in production unless `true`; always on in local dev. Copy the enforced-in-code pattern from `src/app/api/partner-discount/sso/route.ts:27-35`.
- **Env rule (CLAUDE.md §9):** register BOTH vars in `.env.example` (placeholder, comment) in the same commit; set real values in the worktree's `.env.local`, the main folder's `.env.local`, AND Vercel immediately; verify with `npm run check:env:all`.
- Rollout order: build + tests → staging with the flag on → iGoDirect points their test portal at staging and we jointly verify the three call moments → exchange prod secret → flip prod flag.

## 7. Tests (tsx, `node:assert/strict`, wired as `test:member-status`)

Follow the `writing-tsx-test` skill. Cover at minimum: bearer missing/wrong/right (constant-time helper); malformed member_id → 400 semantics; unknown member → 404 semantics; active one-time pack → correct `member_level` + `expires_at`; subscriber-only member; **pack-above-subscription then post-expiry fallback to the subscription %** (the meeting's example: Tradie 50 + Boss pack 70 → 70, then back to 50); everything lapsed → `active:false`; **stuck queued item → reconcile promotes it → `active:true`** ; unresolved plan → `active:true, member_level:null` fail-closed. Service-level tests hit the pure helpers + decision; verify the route end-to-end on staging with `curl` (401 without bearer, 200 with).

## 8. Process obligations (hooks will enforce some of these)

- **Docs (doc-sync Stop hook):** update `docs/partner/api.md` (the new endpoint) and `docs/partner/patterns.md` or `gotchas.md` (the when-they-call model + redeem-is-the-gate rule) in the same task as the code.
- **BUSINESS.md / CUSTOMER.md trigger hooks:** partner-discount surfaces are trigger-listed; if the Stop hook blocks, make the honest one-line update (the TAR portal now checks live member access via our status API) rather than a no-op touch.
- **Norm (CLAUDE.md rule 10):** this is NOT an `/api/admin/**` route, so Norm lockstep does not apply — mirror the note at the top of the SSO route. Flag to DJ if a Norm-visible surface ends up touched anyway.
- **No auto-commit:** never commit/push without DJ's explicit keyword in-session.
- Finish with `/ship` (lint, type-check, scoped tests, doc-sync) and run `npm run test:member-status` plus `npm run test:member-level` (guards the tier resolver you depend on).

## 9. Deliverable 2 — the iGoDirect integration PDF (vendor handoff)

Produce a branded PDF ("Tools-Australia-Member-Status-API.pdf") for iGoDirect's dev (Tousif). Contents:

1. Overview + the one rule (our side is the source of truth; call us, don't cache us).
2. **When to call:** sign-in, page load, and **mandatory at redeem** (the enforcement moment). Recommended client behaviour: 3s timeout; on our 5xx/timeout, browsing may fall back to the last SSO-known level, but **redemption must require a fresh successful check** (fail closed) — flag this recommendation for their confirmation.
3. Base URLs (staging + prod), auth header, secret-exchange + rotation note.
4. Request params table; the three response examples (active pack / subscriber with rolling `expires_at` / inactive); error table with retry guidance (429 honours `Retry-After`).
5. Contact + change policy (additive-only; we version any breaking change).

**Branding technique (proven this month):** self-contained HTML → headless Chrome. Logo: `public/images/Tools Australia Logo/Primary Logo.webp` embedded as a base64 `data:image/webp` URI; brand red `#ee0000` (dark variant `#c20000`); headings Poppins, body Inter (Google Fonts `<link>` is fine for the print render); ink `#15181d`, hairlines `#e5e8ec`; A4 via `@page { size: A4; margin: 14mm; }` + `print-color-adjust: exact`. Render: `"C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=12000 --print-to-pdf="<ABSOLUTE out.pdf>" "file:///<ABSOLUTE page.html>"` (output path MUST be absolute), then copy to `C:\Users\Genesis\Downloads\`. Build the HTML with a small node script that injects the logo base64 (write script → run → render), not by hand-pasting the base64.

## 10. Open items (track; none block the build)

- Secret exchange channel with iGoDirect + whether they want the HMAC upgrade.
- Optional: their egress IPs for an allowlist layer.
- Confirm with iGoDirect that the `member_id` they store is exactly the SSO `member_id` (it is what we send; get it in writing).
- The brand→tier CSV mapping workstream (separate; feeds their portal-side gating, not this API).
- Future privacy hardening: per-vendor surrogate member ids (N6 in the SSO plan) — do not couple to v1.

## 11. Definition of done

- Route live behind the flag; 401/400/404/200-inactive/200-active all correct; `no-store` on every response.
- `npm run test:member-status` green; `npm run test:member-level` still green; `npm run type-check` + lint clean.
- Envs registered in `.env.example`, set in both `.env.local`s and Vercel; `npm run check:env:all` clean.
- `docs/partner/` updated in the same task; BUSINESS/CUSTOMER touches if the hook demands.
- Staging round-trip verified with iGoDirect across sign-in / page-load / redeem calls.
- Integration PDF generated, branded, saved to Downloads, and sent to Tousif.

---

*Authored 2026-07-16 from the session that ran the iGoDirect meeting prep and vendor alignment. Companion docs: `docs/partner/igodirect-integration-playbook.md`, `docs/auth/igodirect-sso-implementation-plan.md`, `docs/partner/gotchas.md`.*
