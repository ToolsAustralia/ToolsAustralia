# Auth — API

## Routes

| Method | Path | Purpose |
|---|---|---|
| _NextAuth_ | `/api/auth/[...nextauth]/` | NextAuth handler (signin, callback, signout, session) |
| `POST` | `/api/auth/send-mobile-login-code` | SMS sign-in code — resolves the account **by mobile**, texts that number |
| `POST` | `/api/auth/verify-mobile-login` | Verifies the SMS code → bridge token for `signIn("auto-login")` |
| `POST` | `/api/auth/send-mobile-verification` | Session-authed — texts a code to the mobile **on file**. Empty body |
| `POST` | `/api/auth/verify-mobile` | Session-authed — confirms the code, sets `isMobileVerified`. Issues **no** session |
| `POST` | `/api/auth/session-from-payment` | Bridge token derived from a Stripe **client secret** alone (3DS/SCA redirect landing) |
| _TODO_ | `/api/auth/**` | Domain-specific auth helpers (signup, password reset, etc.) |
| `POST` | `/api/user/change-password` | Change **or** first-time set the session user's password |
| _TODO_ | `/api/user/**` | Other current-user reads/writes |
| `GET` | `/api/users/[id]` | Session user (or staff w/ `users.view`) — enriched user record, **include-list projected** |
| `GET` | `/api/users/[id]/my-account` | Session user (or staff w/ `users.view`) — my-account payload (user + activeMiniDraws + recentOrders + insights), **include-list projected** |
| _TODO_ | `/api/users/**` | Multi-user reads (admin-only typically) |

> _TODO: read each handler under [src/app/api/auth/](../../src/app/api/auth/), [src/app/api/user/](../../src/app/api/user/), [src/app/api/users/](../../src/app/api/users/) and document._

**Deleted 2026-08-25** — `POST /api/auth/send-otp`, `POST /api/auth/verify-otp`,
`POST /api/auth/passwordless-login` (plus `PasswordlessLoginModal` / `OTPVerificationModal`).
The legacy Twilio SMS-OTP surface was dead in production and carried the F-001 takeover shape;
the replacement resolves the account by mobile. See [gotchas.md](./gotchas.md) and the design at
[2026-08-25-mobile-verification-and-sms-login-design.md](../superpowers/specs/2026-08-25-mobile-verification-and-sms-login-design.md).
The emailed sign-in code (`send-login-code` / `verify-login-code`) is unaffected.

### SMS sign-in — `send-mobile-login-code` + `verify-mobile-login` (2026-08-27)

The replacement for the deleted surface, and the recovery path for a member whose email is wrong
or unverified: `/reset-password`, the emailed sign-in code, and the verify-email bridge **all**
require an inbox they cannot read, so before this they had no self-service route back in.
Surfaced on [`/login`](../../src/app/login/page-client.tsx) as *"Can't access your email? Sign in
with your mobile"* — framed as recovery, not a co-equal button, because every code costs a credit.

**`POST /api/auth/send-mobile-login-code`** — body is `{ mobile }` and **nothing else**. Adding an
email or userId would recreate the {resolve by A, deliver to B} shape that made the old route a
takeover; there is deliberately no way to name an account and choose a delivery number.

Order of operations, and why:

| Step | Why it is where it is |
|---|---|
| `requireSameOrigin` | Standard CSRF guard. Missing `Origin` is allowed by design — see the helper's own note. |
| Normalise → 400 if not AU | A format error is the caller's own mistake, so saying so reveals nothing. |
| **Rate limit, keyed on the number** | Before the DB lookup, so someone walking `04xxxxxxxx` is throttled without ever reaching Mongo. |
| Find user, check `isActive` + [`hasEverPaid`](../../src/utils/auth/has-ever-paid.ts) | 44,445 never-paid accounts hold a mobile; ungated this would hand them all a working login at ~$0.03 a send, all landing on `/membership` anyway. |
| Send, else `release()` the allowance | A gateway failure must not burn one of the member's 3 daily codes, and the stored code is cleared so it cannot eat their verify attempts either. |

**Uniform response — a deliberate divergence from `send-login-code`.** That route 404s on an
unknown email. This one returns the *same* body for found / not-found / never-paid / deactivated,
because **mobile numbers are enumerable in a way email addresses are not** — an attacker can walk
the number space, and a distinguishable reply would make this a customer-list oracle. The copy
names the join fallback so a genuine non-customer is not left waiting for a code that will never
arrive.

**`POST /api/auth/verify-mobile-login`** — `{ mobile, code }`, per-IP limiter (10 / 5 min, matching
`verify-login-code`), constant-time compare against the keyed hash, 5 attempts, 10-minute expiry.
The `isActive` check runs **after** the code validates, so account status is revealed only to
whoever holds the number. On success it mints the same `signJWT` bridge token the emailed path
uses — this route does not create a session itself.

**It also sets `isMobileVerified`.** For SMS, logging in *is* verifying: the code went to the
number already on the account, so returning it proves control of that number — the same proof a
separate verification step would collect. That is why ~46k members with an unverified mobile need
no backfill campaign; they verify by using it.

### Mobile verification — `send-mobile-verification` + `verify-mobile` (2026-08-27)

The SMS siblings of `send-email-verification` / `verify-email`, and the second way to satisfy the
"at least one verified contact channel" requirement (see [rules.md](./rules.md) R8). Phases 0–3 of
[2026-08-25-mobile-verification-and-sms-login-design.md](../superpowers/specs/2026-08-25-mobile-verification-and-sms-login-design.md).
Consumed by setup step 3 and by the account-settings contact card — see
[frontend.md](./frontend.md).

**`POST /api/auth/send-mobile-verification`** — [route](../../src/app/api/auth/send-mobile-verification/route.ts).
**The body is empty by design**: the destination is `user.mobile` read off the session's user
document, never a value from the request. That is the same structural immunity the SMS sign-in
route gets from resolving the account by mobile — there is no second identifier that could
disagree with the delivery number, so the "resolve by A, deliver to B" takeover shape (F-001,
[gotchas.md](./gotchas.md)) cannot exist here either.

Security model — how it differs from the logged-out SMS routes:

| Concern | How it is handled |
|---|---|
| CSRF | `requireSameOrigin`, as on every other OTP route. |
| Identity | `requireAuthenticatedUserDoc()` ([`src/lib/api-auth.ts`](../../src/lib/api-auth.ts)) — session only. |
| Enumeration | **No surface.** The caller cannot name an account, so there is nothing to probe and the uniform-response rule that `send-mobile-login-code` needs does not apply. |
| Spend gate | **No [`hasEverPaid`](../../src/utils/auth/has-ever-paid.ts) check** — deliberately. That gate exists to stop 44k never-paid accounts minting free logins; here the caller is already a signed-in member and only their own number is reachable. |
| Rate limit | `claimOtpSendAllowance("user:<id>")` — keyed on the **user id**, not the number, because the account is the thing worth budgeting once a session exists. |
| Gateway failure | `release()`s the allowance **and** clears `smsOtpHash` / `smsOtpExpires`, so a failed send costs neither one of the member's 3 daily codes nor a verify attempt. |

Already-verified ⇒ `400`. No normalisable AU mobile on file ⇒ `400 { code: "NO_VALID_MOBILE" }`,
worded so settings can send the member to correct the number rather than dead-ending them.

**`POST /api/auth/verify-mobile`** — [route](../../src/app/api/auth/verify-mobile/route.ts). Body is
`{ code }`. Same expiry / attempt-cap / constant-time-compare policy as every other OTP path
(`OTP_MAX_VERIFY_ATTEMPTS`, `isOtpExpired`, `verifyOtpCode` — see [backend.md](./backend.md)). On
success it clears the code state, sets `isMobileVerified`, and syncs the Klaviyo profile property.

**It issues NO session — that is the whole difference from `verify-mobile-login`.** The caller
already has one. `verify-mobile-login` proves identity to a logged-out visitor and therefore mints
a bridge token; this route only records a fact about an already-authenticated account. Keep them
separate: giving this one a token would turn a verification endpoint into a second sign-in path.

### `POST /api/auth/session-from-payment` — a session from proof of payment (2026-08-27)

[Route](../../src/app/api/auth/session-from-payment/route.ts). Body is
`{ paymentIntentClientSecret }` and **nothing else** — the caller asserts no identity at all. The
user is derived from the PaymentIntent's `customer`. Returns a `signAutoLoginToken(user)` bridge
token (the same `signJWT` wrapper `auto-login` uses); the client exchanges it via
`signIn("auto-login", { token })`.

**Why it exists:** a 3DS/SCA buyer leaves the page for Stripe's redirect and comes back having lost
all in-page React state — including the `guestUserData` bridge — so no success landing could sign
them in. They finished paying and stayed logged out. See [gotchas.md](./gotchas.md).

**Security model — strictly stronger than [`/api/auth/auto-login`](../../src/app/api/auth/auto-login/route.ts):**

| Property | `auto-login` | `session-from-payment` |
|---|---|---|
| Identity input | `{ userId, email }` from the **client**, cross-checked against the PI's customer | none — derived **from** the PI's customer |
| Credential | `paymentIntentId` (an id, not a secret) | `client_secret`, compared against the value Stripe holds — Stripe returns it only to the payer, and it is unguessable |
| Payment actually succeeded | **never asserted** (verified — the status is not read at all) | `status === "succeeded"`; `processing` / `requires_action` ⇒ `409` |
| Rate limit | per-IP 10 / 5 min (`auth-auto-login`) | per-IP 30 / 5 min (`auth-session-from-payment`) — looser on purpose, the retry loop below needs the headroom |

`202 { pending: true }` is returned when no `User` carries that `stripeCustomerId` yet. That is the
**webhook race**, not a failure: a one-time buyer who never registered has no account until the
Stripe webhook creates one, and they *have* paid — so the client retries rather than being refused.
Deactivated account ⇒ `403`.

**Scope note:** the three in-modal `MembershipModal` call sites still use `auto-login`. Migrating
them is a mechanical follow-up, deliberately **not** bundled, so a fault in the new route cannot
break the purchase path that already works. Once this has run in production, delete `auto-login`
and point all four at this route.

### `GET /api/users/[id]` + `GET /api/users/[id]/my-account` — explicit wire projections (2026-07-19)

Both routes select the User document with the **additive include-list** `MY_ACCOUNT_USER_FIELDS` from
[src/utils/dashboard/my-account-projection.ts](../../src/utils/dashboard/my-account-projection.ts) — on **both** the
`findById` branch and the `findOne`-by-email (Google OAuth id) branch. This replaced the old 3-field exclude-list
(`-password -emailVerificationToken -passwordResetToken`), which still shipped every other auth secret
(`smsOtpCode`, `loginCode`, `emailVerificationCode`, `inviteToken`, reset expiries…) plus wire bloat
(`processedPayments`, `upsellHistory`, `upsellPurchases`, `redemptionHistory`, `cart`) to the client.

The my-account route additionally projects its sibling queries: `MiniDraw.find().select(MY_ACCOUNT_MINI_DRAW_FIELDS)`
(kills the MB-scale per-user `entries[]` arrays that used to ship with every poll) and
`Order.find().select(MY_ACCOUNT_ORDER_FIELDS)`.

`hasPassword` on `/api/users/[id]` is unaffected — it comes from a separate password-only query.
`subscription` is projected as the whole subdocument, so the streak fields (`streakMonths`, `streakGeneration`),
`lastMonthAccumulatedEntries`, and `previousSubscription` all still ship. **Footgun:** a new client-consumed User
field must be added to `MY_ACCOUNT_USER_FIELDS` or it silently vanishes — see [gotchas.md](./gotchas.md).
Guarded by `npm run test:my-account-projection`.

### `POST /api/user/change-password` (set-password support — 2026-05-19)

Body: `{ currentPassword?: string; newPassword: string }` (`newPassword` ≥ 6 chars). `currentPassword` is **optional** in the Zod schema.

The `password` field on `User` is **not** `select:false`, so `User.findOne` loads it directly. Behaviour branches on `isFirstTimeSet = !user.password`:

- **Account has a password** → `currentPassword` is required and verified via `bcrypt.compare`. Missing → `400 "Current password is required"`; wrong → `400 "Current password is incorrect"`.
- **Account has no password** (Google OAuth / SMS-OTP / email-code "passwordless" accounts — same `!user.password` condition the credentials provider in [auth.ts](../../src/lib/auth.ts) uses to reject login) → **first-time set**. `currentPassword` is ignored; the active session is the sole proof of identity. Success message is `"Password set successfully"` vs `"Password updated successfully"`.

The pre-2026-05-19 `400 "Password changes not available for this account"` guard was **removed** in favour of this set-password path. If you see that string reappear, the fix was reverted (it has been reverted by a branch reset once before). Client counterpart: `PasswordTab.tsx` set-password mode — see [dashboard-account/frontend.md](../dashboard-account/frontend.md).

## Internal Norm endpoints (`/api/internal/norm/v1/**`)

These are HMAC-signed read/write/trigger endpoints for the Norm service account. All go through `withNorm()` ([src/lib/internal-norm/withNorm.ts](../../src/lib/internal-norm/withNorm.ts)) which validates the signature, checks Norm's Role permission, applies the rate limit, audits the call, and enforces the registry's `responseSchema` on outbound payloads.

| Method | Path | Required permission | Tier | Notes |
|---|---|---|---|---|
| `GET` | `/api/internal/norm/v1/health` | `overview.view` | read | Liveness + signing-secret validation |
| `GET` | `/api/internal/norm/v1/manifest` | `overview.view` | read | Full tools manifest for Norm capability discovery |
| `GET` | `/api/internal/norm/v1/roas/summary` | `facebookAds.view` | read | Headline ad spend / revenue / ROAS / profit for a date range |
| `GET` | `/api/internal/norm/v1/roas/breakdown` | `facebookAds.view` | read | Per-campaign/adset/ad ROAS breakdown |
| `GET` | `/api/internal/norm/v1/dashboard/stats` | `overview.view` | read | Strict projection of admin dashboard stats — drops trends/enhanced/snapshotMissingForStanding |
| `GET` | `/api/internal/norm/v1/dashboard/revenue-breakdown` | `overview.view` | read | Revenue total + per-category bucket breakdown |

Dashboard routes (`dashboard/stats`, `dashboard/revenue-breakdown`) delegate to `DashboardStatsService.getStats()` and emit a **strict projection** of the admin shape: trends, enhanced metrics, snapshot-missing-for-standing, and other internal-only fields are dropped before `ctx.ok()` validates against `NormDashboardStatsSchema` / `NormRevenueBreakdownSchema`. Date ranges are resolved through `resolveNormDateRange()` so `current-draw` / `last-draw` keys resolve to real MajorDraw dates before being forwarded to the service.

### `POST /api/auth/register` — optional `fbc` / `fbp` (Meta CAPI enrichment — 2026-05-25)

`registerSchema` accepts two optional fields beyond the registration/attribution data:

- `fbc` — Meta Click ID (`_fbc` cookie value, or reconstructed from a landing `fbclid`).
- `fbp` — Meta browser ID (`_fbp` cookie value).

When present, these are used to enrich the server-side `CompleteRegistration` Conversions API event. In every `CompleteRegistration` block the route now prefers the body value over the cookie: `const fbc = validatedData.fbc ?? ctx.fbc` (and likewise for `fbp`), where `ctx` comes from `extractRequestContext(request)`. Both are optional — omitting them falls back to the `_fbc` / `_fbp` cookies on the request. See [gotchas.md](./gotchas.md) for why the client supplies them.

### `POST /api/auth/register` — TikTok Events API `CompleteRegistration` parity (2026-07-16)

The route now fires a **server-side TikTok Events API `CompleteRegistration`** in parity with the Meta CAPI `CompleteRegistration` it already sent — on **all four** registration branches (new-user, plain-account email+mobile match, plain-account email-only match, plain-account mobile-only match). Previously the TikTok call here was commented out ("client-side only"), so the legacy browser helper never ran server-side (`window` is undefined) and **TikTok received zero registration signal**.

A route-local helper `sendTikTokCompleteRegistration(request, user, eventId)` builds a `CanonicalEvent` (hashed email / phone / `external_id` = user id, plus `ttclid` / `_ttp` from `extractTikTokContext(request)` and client IP / user-agent from `extractRequestContext(request)`) and dispatches it via [`tiktokProvider.capiSend`](../../src/lib/tracking/providers/tiktok.ts). It passes the **same `pixelEventId` (`eventID`)** used for the Meta event so the browser and both server events dedup. It is `await`ed after the Meta send in each branch but is wrapped in its own try/catch and **never throws** — tracking must not break registration. Step-1 registration still does **not** auto-login (unchanged — see [gotchas.md](./gotchas.md)).

### `POST /api/auth/register` — `builtPrizeSlug` attribution (2026-07-28)

`registerSchema` accepts an optional `builtPrizeSlug` beside `promotionSlug` — the prize the
visitor had assembled in "Build your prize" (e.g. `ryobi-kincrome`, `cash-prize`) at the moment
they registered, sourced from the same `?toolset=`/`?toolbox=` URL params the promo-visit beacon
already records against the VISIT row. It is validated with the **same** `isValidPromoSlug` guard
as `promotionSlug` before being persisted — a hand-edited body or a crawler cannot write an
arbitrary string into `User.signupAttribution`.

`buildSignupAttribution(promotionSlug, attribution, builtPrizeSlug, clickPlatform)` takes it as a
third argument and only includes `builtPrizeSlug` in the returned object when it passes validation
(`hasBuiltPrize`). It deliberately does **not** join the `!hasPromo && !hasAttribution` "nothing to
persist" guard — a built prize only ever exists alongside a promo slug, so widening that guard
could start persisting attribution for visitors who previously had none. All **four** registration
branches (new-user create, plain-account email+mobile match, email-only match, mobile-only match)
call `buildSignupAttribution` and must all pass the third argument — see
[subscription/models.md § `signupAttribution.builtPrizeSlug`](../subscription/models.md#signupattributionbuiltprizeslug-2026-07-28).

When the slug is invalid the key is **omitted entirely**, never set to `undefined` — a literal
`undefined` in a Mongo `$set` still writes the key, which would clear a previously captured build.

**Location (2026-07-29, panel F-038):** `buildSignupAttribution`, `mergeSignupAttribution` and
`plainSignupAttribution` now live in
[`src/services/attribution/signup-attribution.ts`](../../src/services/attribution/signup-attribution.ts)
and are imported by the route — `app/api/**` handlers hold no business logic. Names are unchanged.
`resolveSignupClickPlatform` stays in the route: it reads `NextRequest` cookies, which is request
parsing, not business logic.

⚠️ **Argument order is load-bearing.** All four parameters are optional and stringy/objecty, so
transposing two of them type-checks cleanly and silently writes a promo slug into the built-prize
field. `main` and this branch each added a *different* third parameter (`clickPlatform` vs
`builtPrizeSlug`), which is precisely the merge hazard. `npm run test:signup-attribution` carries an
explicit argument-position guard — four distinct values in one call, each asserted onto its own key.

### `POST /api/auth/register` — per-IP abuse guard (2026-06-10)

Registration awaits a Stripe customer create + a Facebook CAPI call + several Mongo writes on the request path, so an unthrottled scripted loop can burn the small per-instance Mongo pool and spawn junk accounts/Stripe customers. The route applies a per-IP limiter ([`createRateLimiter`](../../src/utils/security/rateLimiter.ts), bucket `auth-register`) **before `connectDB()`**: **20 requests / minute / IP** → `429` with a `Retry-After` header and a body carrying **both `error` and `message`** ("Too many registration attempts…") — `message` is required because MembershipModal renders `result.message` in its general-error branch; without it the user sees the generic "Registration failed" fallback and just retries. The limit is intentionally more lenient than login's `5/min` (bucket `auth-login`) because registration is funnel-rate and ad spikes can route many legitimate signups through one carrier-NAT / shared egress IP. **Caveat:** the limiter store is in-memory **per serverless instance** (no Redis), so the effective ceiling is `20 × warm-instance-count` — it stops a naive single-IP flood but is not a WAF substitute for a distributed attack.

## Authorization

All protected handlers must call `getServerSession()` and verify. Middleware excludes `/api` so it does NOT gate these routes.

For admin routes elsewhere (`/api/admin/**`), use `requireAdmin(session)` consistently.

## `gender` on the profile write paths (2026-08-17)

Both profile writers accept the optional `User.gender` field (`"male"` / `"female"`; see [src/data/genders.ts](../../src/data/genders.ts)).

**`POST /api/user/update-profile`** — `gender` is validated by a Zod transform that lowercases/trims and maps `""` → `undefined`, then a refine restricting it to the two values. The handler assigns it when the **property is present on the request body** (`hasOwnProperty`), not when it is truthy: the UI always sends the key, so a member can **clear** a previously-set gender, which a `!== undefined` check would silently ignore. Returned in the response alongside `state` / `profession`.

**`POST /api/user/setup`** (step 2, `saveStateProfessionOnly`) — `gender` is **optional here while `state`, `profession` and `birthdate` are required**. It is deliberately excluded from the `completeSetupOnly` readiness check, so a missing gender can never block setup completion. The handler writes it **only when supplied**, so a re-prompted member who skips the field keeps whatever they already had.
