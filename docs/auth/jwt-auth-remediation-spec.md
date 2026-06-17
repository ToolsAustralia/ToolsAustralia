# JWT / Auth Remediation Spec

> **Status:** proposed · **Branch:** `feature/ui-audit` · **Owner:** DJ
> **Scope:** the three coexisting auth-token systems and everything that consumes them.
> **Source:** multi-agent audit (4 review lenses → dedup → 2 independent adversarial verifiers per finding → synthesis), with the HIGH and all MEDIUM findings re-verified by hand against the working tree.

---

## How to read this spec

Every finding below uses the same seven-part structure:

1. **What it is** — the bug/defect explained.
2. **How it affects the website** — observable impact today.
3. **Future problems if not handled** — what gets worse over time.
4. **Disadvantages** — the cost of leaving it (and any trade-off in fixing it).
5. **How it was identified** — the exact method/evidence.
6. **Proposed fix** — concrete change.
7. **Expected result** — the verifiable end state.

**Severity legend** — `HIGH` exploitable/broken on the live path · `MEDIUM` real defect, bounded blast radius · `LOW` hygiene / latent footgun / dead code.

**Consolidation note.** The audit produced 20 raw findings; several were the same issue surfaced by different lenses. This spec consolidates them into **14 distinct items** with no loss — the 20→14 map is in the [Appendix](#appendix-20-raw-findings--14-items). "Everything" is covered; duplicates are merged rather than repeated.

---

## The three systems (context for every finding)

All three sign **HS256 with the same `NEXTAUTH_SECRET`**:

| System | Library | Token / cookie | Revocation? | Consumers |
|---|---|---|---|---|
| **1 — NextAuth** | next-auth | `next-auth.session-token` (jwt strategy) | ✅ `tokenVersion` + `isActive`/`deleted` (`src/lib/auth.ts:243-267`) | `getServerSession` — ~50 routes, middleware page gating |
| **2 — custom** | `jsonwebtoken` | `ta_session_token` cookie + `Authorization: Bearer` | ❌ signature+expiry only | cart/orders/mini-draws/`me` |
| **3 — affiliate** | `jose` | `affiliate_token` cookie | ❌ no DB re-check at all | affiliate portal |

The **root cause** behind most findings: Systems 2 and 3 were bolted on beside the capable NextAuth session instead of reusing it, and the shared secret makes their tokens structurally cross-acceptable.

---

## Priority summary

| # | Finding | Sev | Domain | Effort |
|---|---|---|---|---|
| A1 | Cart accepts raw ObjectId as bearer (auth bypass / IDOR) | **HIGH** | cart-shop-products | S |
| A2 | Cart "remove" hits a non-existent endpoint | MED | cart-shop-products | S |
| A3 | System-2 token never revoked on deactivate/delete | MED | auth | M |
| B1 | Affiliate auth fails open to hard-coded secret | MED | affiliate | S |
| C1 | `getUserFromToken` copy-pasted across 8 files | MED | cart-shop-products / auth | M |
| B2 | 30-day lifetime, no revocation (Systems 2 & 3) | LOW | auth / affiliate | M |
| B3 | System-2 `verify()` omits `algorithms` allowlist | LOW | auth | S |
| C2 | System 2 is a redundant third login stack | LOW | auth | M |
| C3 | Two JWT libraries doing the same job | LOW | auth | M |
| D1 | `ta_session_token` cookie is set but never read | LOW | auth | S |
| D2 | issuer/audience unenforced + split payload shape | LOW | auth | M |
| D3 | Affiliate token domain separated by payload shape | LOW | affiliate | S |
| D4 | `/api/admin` branch in middleware is dead | LOW | security-csp | S |
| D5 | `isInternalUser` predicate duplicated verbatim | LOW | security-csp | S |

**Recommended sequencing:** A1 → A2 → C1 (one cart-auth PR) ; A3 + B1 + B2 (one revocation/secret-hardening PR) ; C2/C3/D1/D2 (one System-2 consolidation PR that retires most of the surface) ; D3/D4/D5 (cleanup PR).

---

# Part A — Bugs / Correctness

## A1 · [HIGH] Cart routes accept a raw user ObjectId as a bearer "token"

**What it is.** `getUserFromToken` in the cart routes tries `jwt.verify(token, NEXTAUTH_SECRET)`, and on **any** failure the `catch` block runs `User.findById(token)` — treating the raw bearer string as a Mongo `_id` and returning that user with no signature, expiry, or ownership proof (`src/app/api/cart/route.ts:110-134`, identical in `cart/items`, `cart/update`, `cart/summary`). This is not a rare fallback: the real client sends `Authorization: Bearer ${session.user.id}` — the bare ObjectId (`src/contexts/CartContext.tsx:166,214,225,236,246`; `session.user.id` is set to `dbUser._id.toString()` at `src/lib/auth.ts:198,312`). A plain 24-hex ObjectId is never a valid JWT, so `jwt.verify` always throws and **the unsigned-id path is the production auth mechanism**.

**How it affects the website.** Anyone sending `Authorization: Bearer <victim ObjectId>` is authenticated as that user for cart read/add/update/remove. `/api/cart/**` has no middleware gate (the matcher excludes `/api`), so this helper is the only check. ObjectIds are low-entropy and leak in URLs, API responses, and order records.

**Future problems if not handled.** The pattern is copied across the cart family (see C1) and the same helper shape exists in orders/mini-draws; a future dev copying cart as a template propagates the bypass. If cart ever starts returning richer data (addresses, saved items, PII) the blast radius widens silently. It also blocks any "log out everywhere" / revocation feature, since there is no token to revoke.

**Disadvantages of leaving it.** A standing horizontal-privilege-escalation hole on a write-capable authenticated endpoint; fails any security review/pen-test; undermines the revocation work in A3 (nothing to revoke). Trade-off of fixing: the client must stop sending the raw id — a coordinated client+server change, not server-only.

**How it was identified.** Security + redundancy lenses flagged the `catch { User.findById(token) }` fallback; cross-referenced the live client (`CartContext`) to confirm it sends `session.user.id`, traced `session.user.id` → `token.sub` → `dbUser._id.toString()`. **Re-verified by hand this session** at `src/app/api/cart/route.ts:123-134` and `src/contexts/CartContext.tsx:166`.

**Proposed fix.** Delete the `User.findById(token)` fallback in all four cart helpers; return 401 on verify failure (match the strict pattern already in `src/app/api/orders/route.ts:37` and `src/app/api/cart/clear/route.ts:15`). **Preferred:** migrate cart routes to `getServerSession(authOptions)` / `requireAuthenticatedUser` (`src/lib/api-auth.ts`) like the rest of the app, and change `CartContext` to stop sending a bearer entirely (cookie-based session is sent automatically). Fold this into C1 (one shared helper). **Research refinement (OWASP CSRF):** moving these *mutating* routes to cookie-based session auth introduces a CSRF exposure the bearer scheme didn't have (browsers auto-attach cookies). Rely on the session cookie's `sameSite=lax` **plus** a same-origin `Origin` check — the login route already demonstrates this pattern at `src/app/api/auth/login/route.ts:39-52` — on cart/orders `POST`/`PUT`/`DELETE`. See Appendix B, topic 6.

**Runtime-verified.** The bypass mechanism was reproduced with the project's real `jsonwebtoken@9.0.2` + `mongoose` (no DB touched): a bare 24-hex ObjectId makes `jwt.verify` throw `jwt malformed` (signed path skipped), and `mongoose.isValidObjectId(<that id>)` is `true` (so `User.findById` runs the query and returns that user). Forging a *signed* token fails without the secret — confirming the attack needs no token at all, just a known ObjectId.

**Expected result.** A request with `Authorization: Bearer <any ObjectId>` returns 401. Cart operations succeed only with a valid NextAuth session for the *calling* user. No code path resolves identity from an unsigned string. Manual check: `curl -H "Authorization: Bearer <someUserId>" /api/cart` → 401.

---

## A2 · [MEDIUM] Cart "remove" calls a non-existent endpoint and always fails

**What it is.** The `remove` branch of the pending-operations queue fetches `DELETE /api/cart/remove` (`src/contexts/CartContext.tsx:231-240`), but no `cart/remove/route.ts` exists — the real handler is the `DELETE` export on `/api/cart` (`src/app/api/cart/route.ts:349`). Note the sibling `clear` case correctly targets `/api/cart` (`CartContext.tsx:242-249`), which is why clear works and single-item remove doesn't. A second consumer has the same bug: `src/hooks/queries/useCartQueries.ts:398` targets `/api/cart/remove/${productId}`.

**How it affects the website.** Every single-item cart removal 404s. `processPendingOperations` does `if (!response.ok) throw` (`CartContext.tsx:255-257`), so the op lands in `failedOperations` and never persists. The optimistic UI removes the item locally, so it *looks* removed, then it reappears on the next `loadCartFromServer`. Because the quantity stepper guards `if (newQuantity < 1) return`, there is no working alternative path to remove an item.

**Future problems if not handled.** Users accumulate "stuck" items they can't delete; carts drift from intent; at checkout a thought-removed item can be purchased. Support tickets and abandoned carts. The failed-op retry/backoff machinery burns cycles retrying a permanent 404.

**Disadvantages of leaving it.** A core shop flow is silently broken for every user; the optimistic UI *masks* it, making it hard to notice in QA but visible to real users on reload.

**How it was identified.** Correctness lens traced the cart op queue; `Glob src/app/api/cart/**` returned only `route/items/update/summary/clear` — no `remove`. **Re-verified by hand** at `CartContext.tsx:231-240` (remove) vs `:242-249` (clear).

**Proposed fix.** Point both consumers at `DELETE /api/cart` (the existing handler accepts the same `{type, productId|miniDrawId}` body). Update `CartContext.tsx:232` and `useCartQueries.ts:398`. (Do **not** create a new `/api/cart/remove` route — that adds surface for no reason.)

**Expected result.** Removing a single item issues `DELETE /api/cart`, returns 200, the item is gone server-side, and it does not reappear after reload. `failedOperations` stays empty for removes.

---

## A3 · [MEDIUM] `ta_session_token` (System 2) is never revoked on deactivation/deletion

**What it is.** System 1 revokes sessions — the jwt callback flips `token.deleted` when `!dbUser || isActive === false` or `tokenVersion` mismatches, and the session callback returns `null` (`src/lib/auth.ts:243-267,306-309`); staff removal bumps `tokenVersion` (`src/app/api/admin/staff/[id]/route.ts:141,146`). System-2 consumers do **none** of this: they `verify()` then `User.findById()` and proceed if the user merely *exists* — no `isActive`, no `tokenVersion` check (`src/app/api/auth/me/route.ts:19-26`, `orders/route.ts:37-44`, `orders/[id]/route.ts:26-28`, `cart/clear/route.ts:15-22`, `mini-draws/entries/route.ts:29-36`). The token is a 30-day JWT with no version/jti (`login/route.ts:91-99`) and no route clears the cookie.

**How it affects the website.** A user who is deactivated, demoted from staff, or whose access is pulled keeps a fully working System-2 credential for up to 30 days for cart/orders/mini-draw/profile operations, even after System 1 has correctly cut them off. `tokenVersion` — the codebase's chosen kill switch — has zero effect here. (Impact is self-scoped: every route binds to `decoded.userId`, so it's the deactivated user accessing their *own* data/spending their *own* entries; no cross-user or admin reach, hence MEDIUM not HIGH.)

**Future problems if not handled.** As more functionality moves behind System-2 bearer routes, the un-revocable window grows in importance. Any incident response ("disable this account now") silently fails for these surfaces. Combined with A1, a "logged-out" user is not actually logged out.

**Disadvantages of leaving it.** Two contradictory revocation models in one app; security posture is only as strong as its weakest path. Defeats the purpose of the `tokenVersion` machinery already built and maintained in System 1.

**How it was identified.** Bug + security lenses compared System-1 revocation against the System-2 consumers; grep showed `ta_session_token` is only ever *set*, never read/cleared. **Re-verified by hand** at `auth/me/route.ts:19-28` and `orders/route.ts:30-45` (existence-only check; reads `decoded.userId`).

**Proposed fix.** Easiest correct fix is C2 (migrate these routes to `getServerSession`, inheriting System-1 revocation for free). If System 2 is retained short-term: add a shared verifier that, after `verify()`, loads the user and rejects when `!user || isActive === false`, and embed+check `tokenVersion` in the payload (mint with it in `login/route.ts`, compare on read). Add a logout route that clears the cookie.

**Expected result.** Deactivating a user (or bumping `tokenVersion`) immediately invalidates their cart/orders/mini-draw/profile access — verifiable by deactivating a test user and confirming a previously-working token now returns 401. One revocation path across all systems.

---

# Part B — Security

## B1 · [MEDIUM] Affiliate auth fails *open* to a hard-coded secret

**What it is.** `src/lib/affiliate-auth.ts:7`: `const JWT_SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET || "fallback-secret-key")`. This key both signs and verifies the `affiliate_token` (`createAffiliateToken:13-22`, `verifyAffiliateToken:30-42`), and verify enforces no issuer/audience and no algorithm allowlist. By contrast `src/lib/jwt.ts:5-9` and `src/app/api/auth/login/route.ts:9-12` **throw** at module load if the secret is missing.

**How it affects the website.** If `NEXTAUTH_SECRET` is ever absent on the affiliate code path, affiliate tokens are signed/verified with the publicly-known string `"fallback-secret-key"`. Anyone could forge an `affiliate_token` with an arbitrary `affiliateId` and impersonate any affiliate; the payload is trusted without a DB re-check of the signed claims (`src/utils/affiliate/get-affiliate-session.ts:17`), reaching financial surfaces (`bank-details`, `dashboard`).

**Future problems if not handled.** A new deploy target (edge runtime, a worker, a standalone script, a future split bundle) that loads the affiliate path without first importing `src/lib/auth.ts` would boot quietly on the weak key. The hard-coded literal also tends to get copied into new modules.

**Disadvantages of leaving it.** A secret in source control; an inconsistent fail-open posture that a security review will flag; the affiliate system shares the user secret, so one leak compromises all three systems.

**Exploitability caveat (why MEDIUM not HIGH).** In the normal single-process deploy, `src/lib/auth.ts:22-39` throws at module load if `NEXTAUTH_SECRET` is unset, and `authOptions` is imported app-wide — so the app crashes before the fallback can be reached. But `affiliate-auth.ts` does not import that guard, so the protection is incidental, not designed.

**How it was identified.** Security lens diffed the three secret-handling sites; confirmed the fail-open default and the missing iss/aud + algorithm allowlist in `verifyAffiliateToken`. **Re-verified by hand** at `src/lib/affiliate-auth.ts:7,30-42`.

**Proposed fix.** Remove `|| "fallback-secret-key"`; throw at module load on a missing secret, mirroring `jwt.ts`. Add `.setAudience("tools-australia-affiliates")` on sign and `{ audience }` on `jwtVerify` (or introduce a dedicated `AFFILIATE_JWT_SECRET`) so affiliate tokens are crypto-distinct (also resolves D3).

**Expected result.** Missing secret → loud module-load crash, never a weak key. A user/System-2 token presented as an `affiliate_token` is rejected by audience mismatch. No secret literal in source.

---

## B2 · [LOW] 30-day token lifetime with no revocation (Systems 2 & 3)

**What it is.** All custom tokens are 30-day: `src/lib/jwt.ts:47`, `login/route.ts:17,98`, `src/lib/affiliate-auth.ts:21`, `affiliate/login/route.ts:47`. System 1 can force-logout via `tokenVersion`/`isActive` (`auth.ts:243-267`); System 2 verifies signature+expiry only (though `findById` does catch a fully *deleted* user — see A3), and System 3 does **no DB lookup at all** (`verifyAffiliateToken:30-42` → `get-affiliate-session.ts:17`), so deactivating an affiliate does not log them out.

**How it affects the website.** A leaked custom token is valid for the full 30 days. The only blunt kill switch is rotating `NEXTAUTH_SECRET`, which would invalidate *every* System-1 session simultaneously.

**Future problems if not handled.** No graceful incident response for a leaked affiliate/user token; an affiliate whose access is revoked keeps hitting `bank-details`/`dashboard` for up to a month.

**Disadvantages of leaving it.** No per-token revocation; an all-or-nothing secret-rotation hammer; long-lived bearer credentials.

**How it was identified.** Security lens catalogued all expiry constants and compared revocation paths; confirmed System 3 performs no DB re-check on verify. (Standalone severity LOW: presupposes a leak and adds no forgery/escalation on its own.)

**Proposed fix.** Shorten custom-token lifetime (or add refresh). Add a revocation signal: embed a version in the System-2 and affiliate payloads and compare against the loaded `User`/`Affiliate` doc on verify (the doc is already loaded for System 2). Re-check `isActive` on affiliate verify. Largely subsumed by A3 + C2 for System 2.

**Expected result.** Revoking access (deactivate / bump version / password change) invalidates the relevant tokens without a global secret rotation; affiliate deactivation forces logout.

---

## B3 · [LOW] System-2 `verify()` calls omit an `algorithms` allowlist

**What it is.** No System-2 verify pins `algorithms: ["HS256"]` (`auth/me:19`, `orders:37`, `orders/[id]:26`, `cart/route.ts:114`, `cart/items:60`, `cart/update:79`, `cart/summary:22`, `cart/clear:15`, `mini-draws/entries:29`), and the signers don't pin `algorithm` either (`login/route.ts:91-99`, `jwt.ts:43-50`).

**How it affects the website.** Defense-in-depth gap only. The classic RS256→HS256 confusion is structurally impossible here (no asymmetric keys exist anywhere in the repo), and `jsonwebtoken@9` rejects `alg:none` when a secret is supplied. The only residual effect is HS256/384/512 being accepted interchangeably, which grants no capability without the secret.

**Future problems if not handled.** If an asymmetric key is ever introduced (e.g. migrating to RS256, or adding a third-party JWKS), the missing allowlist becomes a real algorithm-confusion vector. Best fixed now while it's cheap.

**Disadvantages of leaving it.** Falls short of the standard hardening checklist; a latent foot-gun if the crypto setup changes.

**How it was identified.** Security lens inspected every `verify`/`sign` call site for an `algorithms` option; a verifier ran `jsonwebtoken@9` to confirm `alg:none` is rejected.

**Proposed fix.** Add `{ algorithms: ["HS256"] }` to every System-2 `verify`/`jwt.verify` and `algorithm: "HS256"` to the `sign` calls. Best done while centralizing the helper (C1).

**Expected result.** All System-2 tokens are verified against a pinned single algorithm; a token signed with any other alg is rejected.

---

# Part C — Overlaps & Redundancy

## C1 · [MEDIUM] `getUserFromToken` is copy-pasted across 8 route files in divergent variants

**What it is.** Eight files each define a private `getUserFromToken`: `cart/route.ts:102-135`, `cart/items:48-81`, `cart/update:67-100`, `cart/summary:10-43`, `cart/clear:8-23`, `orders/route.ts:30-45`, `orders/[id]:19-28`, `mini-draws/entries:22-37`. They've diverged into variants: **(A)** the four cart copies do `decoded.userId || decoded.sub` plus the raw-id `catch { User.findById(token) }` fallback (the A1 bypass); **(B)** orders/cart-clear/mini-draws do a strict verify, no fallback; a third sub-variant (`orders/[id]`) returns `decoded.userId` instead of the user doc.

**How it affects the website.** The same auth concern is maintained eight times with already-divergent behavior — one variant is an auth bypass, the others aren't. The duplication is the structural cause of A1.

**Future problems if not handled.** A fix applied to one copy (e.g. removing the fallback, or adding the `isActive` check from A3, or the allowlist from B3) silently misses the other seven. New cart-style routes copy whichever variant is nearest.

**Disadvantages of leaving it.** Eight maintenance points; guaranteed drift; security rules can't be enforced in one place.

**How it was identified.** Redundancy lens enumerated the copies and classified the two behaviors; cross-referenced with A1/A3/B3. **Re-verified by hand** at `orders/route.ts:30-45` and `cart/clear/route.ts:8-23` (strict, variant B) vs `cart/route.ts:102-135` (variant A).

**Proposed fix.** Extract one shared, fallback-free verifier — ideally fold these routes onto `getServerSession` / `requireAuthenticatedUser` (`src/lib/api-auth.ts`) like the ~50 other authenticated routes. If a bearer helper must remain, put exactly one in `src/lib/api-auth.ts` with the allowlist (B3) and `isActive`/version check (A3) baked in, and import it everywhere.

**Expected result.** One auth helper for these routes; the raw-id fallback exists nowhere; a single edit changes verification policy for all eight call sites. Seven files lose their private copy.

---

## C2 · [LOW] System 2 is a redundant third login stack duplicating NextAuth

**What it is.** `login/route.ts:91-118` mints a 30-day `jsonwebtoken` from the same bcrypt credentials path NextAuth's `CredentialsProvider` already handles, signed with the same secret — a parallel auth surface that exists only because cart/orders/mini-draws read a bearer header instead of the session. Much of it is effectively dead: `/api/auth/login` has **no client callers** (real login uses `signIn("credentials")` / `signIn("auto-login")`), and the cart bearer is actually `session.user.id`, not a System-2 JWT. The one legitimate use of `src/lib/jwt.ts` is the ephemeral auto-login / verify-login-code bridge tokens that NextAuth's `auto-login` provider consumes (`auth.ts:153`).

**How it affects the website.** Widens the secret's blast radius (one secret, multiple token families) and means more than one credential model to reason about, while delivering nothing NextAuth doesn't already provide for a logged-in user.

**Future problems if not handled.** Every new feature must pick a system; the wrong pick re-introduces the A1/A3 class of bug. Two logout/revocation stories to keep in sync forever.

**Disadvantages of leaving it.** Conceptual overhead, larger attack surface, dead code masquerading as live auth.

**How it was identified.** Redundancy lens compared the login route to NextAuth's CredentialsProvider; grep found `/api/auth/login` has no client callers and the bearer is `session.user.id`.

**Proposed fix.** Migrate cart/orders/mini-draws to `getServerSession` / `requireAuthenticatedUser` (this also closes A1, A3, B2, B3 for these routes), then delete the `ta_session_token` minting in `login/route.ts` and the standalone `me` route. **Keep** only the auto-login / verify-login-code bridge tokens (the legitimate use of `src/lib/jwt.ts`).

**Expected result.** Cart/orders/mini-draws/`me` authenticate via the NextAuth session; `ta_session_token` no longer minted; `src/lib/jwt.ts` retained solely for the auto-login bridge. One standing session credential per user.

---

## C3 · [LOW] Two JWT libraries doing the same HS256 job

**What it is.** `src/lib/jwt.ts` and `login/route.ts` use `jsonwebtoken`; `src/lib/affiliate-auth.ts` uses `jose`; NextAuth is a fourth signer — all HS256 over `NEXTAUTH_SECRET`. They never cross-verify (each token is verified by its minting lib), so there's no functional fault. Note: `jose` is only a *transitive* dependency via next-auth, not declared in `package.json`.

**How it affects the website.** No runtime impact; doubles the crypto-dependency surface to patch/audit, and `jsonwebtoken` forces the Node-runtime dynamic-import dance (`jwt.ts:38-40`, the cart routes) whereas `jose` is edge-safe.

**Future problems if not handled.** Option/format drift between libraries (already visible: the login route omits the iss/aud that `jwt.ts` sets — see D2); two libraries to keep current on CVEs.

**Disadvantages of leaving it.** Maintenance and dependency-hygiene cost; relying on an undeclared transitive package.

**How it was identified.** Redundancy lens inventoried the signers/libraries; a verifier confirmed `jose` is absent from `package.json` and present only via next-auth.

**Proposed fix.** Standardize on `jose` (edge-safe, already in the tree — promote it to a direct dependency), collapsing `jwt.ts` + the inline `login/route.ts` signer into one module. Largely moot if C2 retires System 2; then `jose` is the only hand-rolled signer.

**Expected result.** One JWT library for hand-rolled tokens, declared explicitly in `package.json`; no dynamic-import dance.

---

# Part D — Dead Code / Inconsistency

## D1 · [LOW] `ta_session_token` httpOnly cookie is set but never read

**What it is.** `login/route.ts:104-118` sets the token as an httpOnly cookie **and** returns it in the JSON body, but a repo-wide grep shows `ta_session_token` is only ever *written* (here + a docs checklist) — no route reads `cookies().get("ta_session_token")`. Every consumer reads the `Authorization: Bearer` header, and the real client sends `session.user.id` there, not this JWT.

**How it affects the website.** Dead output: a validly-signed 30-day credential is sent to browsers and shipped on every request to the origin, authorizing nothing, with no logout path clearing it. (The earlier "the real token is XSS-exfiltratable" concern does **not** hold — no auth token is persisted in JS storage, and `/api/auth/login` has no client callers.)

**Future problems if not handled.** A reader assumes the cookie is the session and builds on it; the stale 30-day cookie lingers in browsers; `docs/security-regression-checklist.md` asserts behavior that no longer matters.

**Disadvantages of leaving it.** Misleading "secure cookie" signal in review; dead surface to reason about.

**How it was identified.** Dead-code lens grepped all reads/writes of the cookie and the client bearer; confirmed `/api/auth/login` has no callers.

**Proposed fix.** Delete the `response.cookies.set({ name: "ta_session_token", ... })` block and the cookie definition in `login/route.ts`; if the body `token` has no consumer either, drop it (subsumed by C2). Update `docs/security-regression-checklist.md`.

**Expected result.** No `ta_session_token` cookie is minted; the regression checklist matches reality.

---

## D2 · [LOW] issuer/audience set but not enforced + split System-2 payload shape

**What it is (merges 3 raw findings).** Two incompatible System-2 token contracts glued together ad hoc:
- **Shape drift** — `login/route.ts:91-99` mints `{userId,email,role}` with **no** iss/aud; `signJWT` (`jwt.ts:43-50`) mints `{sub,...}` **with** issuer `tools-australia` / audience `tools-australia-users`. Cart reconciles both via `decoded.userId || decoded.sub` (`cart/route.ts:115`), but `me`/`orders`/`mini-draws` read `decoded.userId` only — so a `signJWT` (sub-only) token hitting those endpoints yields `User.findById(undefined)` → 401.
- **Policy drift** — `verifyJWT` (`jwt.ts:80-87`) requires iss/aud and has exactly **one** caller (the `auto-login` provider, `auth.ts:153`, fed only by `signJWT` tokens), while the bearer consumers verify with bare `verify(token, NEXTAUTH_SECRET)` and no iss/aud constraint. So the iss/aud claims are **decorative** at the consumption points.

**How it affects the website.** No live break today (the two minters feed disjoint consumer sets), but the iss/aud claims provide a false sense of domain separation, and the payload-shape mismatch is a latent 401 trap.

**Future problems if not handled.** Routing a `signJWT`/`sub`-only token to orders or mini-draws (a plausible future refactor) silently 401s; the decorative iss/aud lulls a reviewer into thinking tokens are scoped when they aren't.

**Disadvantages of leaving it.** Two contracts and two verify styles reconciled by per-route field fallbacks; security claims that do nothing.

**How it was identified.** Inconsistency lens compared mint vs verify options and payload keys across the System-2 sites; a verifier confirmed `verifyJWT` has a single caller.

**Proposed fix.** Pick one mint helper and one verify helper for System 2: have `login/route.ts` call `signJWT`, have all bearer consumers call `verifyJWT` (enforcing iss/aud and pinning algorithms — B3 — in one place), and give each token family a distinct `typ`/audience claim. Or retire System 2 (C2), which dissolves the contract question entirely. **Preferred: C2.**

**Expected result.** One System-2 payload shape and one verify policy with enforced iss/aud (or System 2 gone). No `findById(undefined)` trap; iss/aud claims are load-bearing.

---

## D3 · [LOW] Affiliate token domains separated by payload shape, not a crypto claim

**What it is.** `verifyAffiliateToken` (`affiliate-auth.ts:30-42`) sets no issuer/audience and no algorithm allowlist, so any HS256 token signed with the shared secret passes its signature check; only the presence of `affiliateId` distinguishes an affiliate token.

**How it affects the website.** Not exploitable today — `get-affiliate-session` reads only the `affiliate_token` cookie (a user token is never routed here), and every gated consumer resolves identity via `Affiliate.findById(session.affiliateId)`, which fails closed (`findById(undefined)` → null → 404). But the separation is by accident of payload shape, not cryptography.

**Future problems if not handled.** A future endpoint that trusts the decoded payload before the `findById` (e.g. a `check-auth` that echoes claims) could be confused by a cross-system token; the fragility compounds with B1.

**Disadvantages of leaving it.** Domain separation that depends on downstream lookups rather than the token itself.

**How it was identified.** Security lens noted the missing iss/aud on the affiliate verifier; verifiers confirmed cookie isolation and the fail-closed `findById`.

**Proposed fix.** Add `.setAudience("tools-australia-affiliates")` on sign and `{ audience }` on `jwtVerify` (or a dedicated `AFFILIATE_JWT_SECRET`), and require `affiliateId` before returning a session. Bundle with B1.

**Expected result.** A non-affiliate token presented as an `affiliate_token` is rejected at the crypto layer (audience mismatch), independent of any downstream lookup.

---

## D4 · [LOW] `/api/admin` branch in middleware is dead code

**What it is.** Both `middleware()` (`src/middleware.ts:64-83`) and `authorized()` (`:135-146`) special-case `adminRoutes = ["/admin", "/api/admin"]`, but the matcher's leading negative lookahead `(?!api|...)` (`:161-163`) means middleware **never runs** for any `/api/**` path. The `"/api/admin"` element is permanently unreachable.

**How it affects the website.** No security gap — admin APIs are gated by per-handler `requireAdminUser`/`requirePermission` (97 references across 40+ files). But it's misleading: a reader could believe middleware gates `/api/admin/**`, exactly the false-coverage trap CLAUDE.md warns against ("Don't rely on middleware alone for API authorization").

**Future problems if not handled.** Someone "relies" on the dead branch and removes a per-handler check; or edits the dead branch expecting an effect.

**Disadvantages of leaving it.** Misleading authorization code in a security-critical file.

**How it was identified.** Dead-code lens parsed the matcher regex against the `/api/admin` branch; a verifier confirmed 97 per-handler auth references under `src/app/api/admin`. **Re-verified by hand** at `src/middleware.ts:161-163`.

**Proposed fix.** Remove `"/api/admin"` from both `adminRoutes` arrays (`:21`, `:135`), leaving `"/admin"`; add a one-line comment that `/api/admin` authz lives in the route handlers.

**Expected result.** Middleware only references the page routes it actually gates; the comment makes the per-handler authz boundary explicit.

---

## D5 · [LOW] `isInternalUser` admin predicate duplicated verbatim in `middleware.ts`

**What it is.** The identical three-clause predicate `token?.userType === "staff" || token?.userType === "admin" || token?.role === "admin"` appears at `src/middleware.ts:68-71` (in `middleware()`) and `:141-144` (in `authorized()`), both gating the same `adminRoutes`. (`api-auth-permissions.ts:31-43` encodes the same concept a third time, though as sequential early-returns, not a verbatim copy.)

**How it affects the website.** None today — both copies are identical.

**Future problems if not handled.** The comments at `:64-67`/`:139-140` foreshadow a Phase-5 removal of the legacy `role === "admin"` clause; that edit must touch both sites or they drift — and a drift between `authorized()` (entry gate) and `middleware()` (redirect) is an authz inconsistency.

**Disadvantages of leaving it.** A drift foot-gun in a security file at exactly the point a planned migration will edit it.

**How it was identified.** Redundancy lens found the verbatim duplication; **re-verified by hand** at `src/middleware.ts:68-71` and `:141-144`.

**Proposed fix.** Hoist a single `isInternalUser(token)` at the top of `middleware.ts` and call it from both spots; longer term converge with the `api-auth-permissions.ts` predicate.

**Expected result.** One definition of "internal user"; the Phase-5 legacy-role removal is a one-line change.

---

## Implementation sequencing (suggested PRs)

1. **PR-1 `cart-auth-hardening`** (cart-shop-products) — A1 + A2 + C1. The urgent one: kill the raw-id bypass, fix remove, collapse the 8 helpers. Update `docs/cart-shop-products/`.
2. **PR-2 `auth-revocation-and-secrets`** (auth + affiliate) — A3 + B1 + B2 + B3 + D3. One revocation/secret-hardening pass. Update `docs/auth/`, `docs/affiliate/`.
3. **PR-3 `retire-system-2`** (auth) — C2 + C3 + D1 + D2. Migrate bearer routes to `getServerSession`, delete `ta_session_token` minting and the `me` route, standardize on `jose`. Largest blast radius — do after PR-1/PR-2 prove the `getServerSession` path. Update `docs/auth/`.
4. **PR-4 `middleware-cleanup`** (security-csp) — D4 + D5. Update `docs/security-csp/`.

> **Note on shared worktree:** the audit that produced this spec was read-only. Implementing any item touches `src/` and will require the matching `docs/<domain>/` update (doc-sync hook). Stage only the files for the PR in flight — this worktree is shared with a concurrent `charge-past-due` session.

---

## Appendix: 20 raw findings → 14 items

| Raw finding(s) from the audit | Consolidated item |
|---|---|
| "Cart routes accept a raw user ID as bearer" (×3: security/medium, security/medium, security/high) | **A1** |
| "Cart remove calls non-existent endpoint" | **A2** |
| "ta_session_token never revoked on deactivation/deletion" | **A3** |
| "affiliate-auth falls back to insecure secret" (×2: none, medium) | **B1** |
| "30-day lifetime with no revocation" | **B2** |
| "System-2 verify omits algorithms allowlist" | **B3** |
| "getUserFromToken copy-pasted across 8 files" | **C1** |
| "System 2 is a redundant third login stack" | **C2** |
| "Two JWT libraries do the same job" | **C3** |
| "ta_session_token cookie set but never read" (×3 dead-code) | **D1** |
| "verify omits iss/aud" + "signed tokens carry iss/aud but verify doesn't check" + "login mints without iss/aud" (3 inconsistency findings) | **D2** |
| "Affiliate verify separates domains by payload shape" | **D3** |
| "/api/admin branch in middleware is dead" | **D4** |
| "isInternalUser duplicated verbatim" | **D5** |

---

## Appendix B — Best-practice validation (cited)

> **Method & honesty note.** A deep-research pass decomposed the 7 questions into 5 search angles and gathered **11 sources (10 primary)** — the OWASP Cheat Sheet Series, the OWASP IDOR community page, and the official NextAuth.js docs — extracting 52 candidate claims. The harness's automated 3-vote adversarial verification was **rate-limited and did not run** (every claim returned `0-0 / 3-abstain`), so the claims below are **sourced to primary references and assessed by hand**, not machine-verified. All are well-established security facts; the URLs are the canonical references. Topics 4 and 7 had their source fetches rate-limited, so those verdicts rest on my own assessment (RFC 8725 / library docs) and are marked as such.

| # | Topic | Verdict vs our fix | Basis |
|---|---|---|---|
| 1 | getServerSession vs client bearer (the A1 IDOR) | ✅ **Aligns** — this is the textbook fix | OWASP IDOR + NextAuth (primary) |
| 2 | JWT revocation via tokenVersion-in-DB (A3) | ✅ **Aligns** | OWASP Session Mgmt (primary) |
| 3 | 30-day token lifetime (B2) | ⚠️ **Aligns with a caveat** | NextAuth options (primary) |
| 4 | `algorithms:['HS256']` pinning (B3) | ✅ **Aligns** (my assessment) | RFC 8725 / not fetched this run |
| 5 | Fail-closed secret, no fallback (B1) | ✅ **Aligns** | NextAuth options (primary) |
| 6 | httpOnly cookie vs bearer + CSRF (D1, A1) | ✅ **Aligns** + refinement | OWASP Session/CSRF + NextAuth (primary) |
| 7 | Standardize on `jose` (C3) | ✅ **Reasonable** (my assessment) | library docs / not fetched this run |

**Topic 1 — session pattern / IDOR.** Accepting a client-supplied object reference and fetching the record without an ownership check is the canonical IDOR anti-pattern, classified under **OWASP A01 Broken Access Control**; the prescribed remedy is to **derive identity from the server-side session and scope queries to that user**, never trust a client-supplied id. NextAuth officially recommends `getServerSession` for Route Handlers / API routes. → Our A1/C2 fix *is* the recommended remedy.
Sources: `cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html` · `owasp.org/www-community/attacks/insecure_direct_object_reference` · `cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html` · `next-auth.js.org/configuration/nextjs` · `next-auth.js.org/tutorials/securing-pages-and-api-routes`

**Topic 2 — revocation.** OWASP requires session expiration/invalidation to be **enforced server-side**, and warns that relying on a token's own embedded expiry is insufficient. A `tokenVersion` claim compared against the DB on verify satisfies this (and is exactly what NextAuth's own session already does). → A3 sound.
Source: `cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html`

**Topic 3 — lifetime.** NextAuth's JWT session **defaults to a 30-day `maxAge`** — *but* paired with sliding re-issuance (`updateAge`, default 24h) and server-side revocation. So 30 days is not wrong per se; the defect is our custom tokens being **fixed 30-day AND non-revocable AND non-refreshed**. → confirms B2: either shorten, or (preferred) add revocation/refresh, or ride the NextAuth session which already does both.
Source: `next-auth.js.org/configuration/options`

**Topic 4 — algorithm pinning.** *(My assessment — the source fetch for this angle was rate-limited.)* RFC 8725 (JSON Web Token Best Current Practices) recommends the recipient pin the expected algorithm(s); `alg:none` and RS256→HS256 confusion are the historical motivations. `jsonwebtoken@9` rejects `alg:none` when a secret is supplied (we verified this at runtime), but explicit `algorithms:['HS256']` is still the recommended belt-and-suspenders. → B3 aligns; it's hardening, not a live hole here.

**Topic 5 — secret handling.** NextAuth itself **requires a secret in production and throws (fails closed) when none is provided**. → directly validates B1's removal of the `|| "fallback-secret-key"` default in favour of a fail-closed throw.
Source: `next-auth.js.org/configuration/options`

**Topic 6 — cookie vs bearer + CSRF.** OWASP: session tokens belong in **HttpOnly cookies, never `localStorage`** (Web Storage is readable by any script → one XSS leaks every token). The trade-off is CSRF, because browsers auto-attach cookies — mitigated by the **Synchronizer Token** or **Signed Double-Submit Cookie** pattern. NextAuth's session cookie is `httpOnly + sameSite=lax + secure` by default and it applies double-submit CSRF protection to its auth routes. → validates moving off client-held bearers (A1/D1); **refinement:** our own mutating cart/orders routes must add CSRF protection (sameSite=lax + Origin check) once they're cookie-authenticated — folded into A1's fix.
Sources: `cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html` · `cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html` · `next-auth.js.org/configuration/options` · `next-auth.js.org/getting-started/rest-api`

**Topic 7 — jose vs jsonwebtoken.** *(My assessment — the source fetch for this angle was rate-limited.)* `jose` is dependency-free, Web-Crypto-based, and runs in the Edge runtime; `jsonwebtoken` is Node-only (the reason for the dynamic-`import()` dance in `src/lib/jwt.ts` and the cart routes). NextAuth v4 already uses `jose` internally. → C3's "standardize on jose" is reasonable; lower priority than A1–C1.

**Net:** all 14 fixes are consistent with authoritative guidance; topics 1, 5, and 6 are backed by primary OWASP/NextAuth sources, topic 3 gains a useful caveat, and topic 6 surfaced one concrete addition (CSRF protection on the migrated mutating routes).

---

*Generated from the multi-agent JWT/auth audit; HIGH + all MEDIUM findings re-verified by hand against the working tree; fixes validated against OWASP/NextAuth primary sources (auto-verification rate-limited — see Appendix B note).*
