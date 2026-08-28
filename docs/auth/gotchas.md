# Auth — Gotchas

## 3DS buyers paid and stayed logged OUT — and `auto-login` never checked the payment succeeded (fixed 2026-08-27)

Two defects in the same seam, found together.

**The stranding.** A 3DS/SCA buyer is sent to the issuer's page by Stripe and returns through a
**redirect**. That redirect destroys all in-page React state — including the `guestUserData`
bridge that carries a guest buyer's details from the payment step into profile setup. Nothing on
the success landing knew who had just paid, so nothing could sign them in. The member finished
**paying** and stayed **logged out**: never reaching profile setup, never setting a password, never
verifying a channel. They are precisely the cohort that turns up later unable to get in — and
before SMS sign-in existed, unable to be recovered.

Non-3DS buyers never hit it, because their purchase completes in the modal with state intact. That
is why it survived: the path that breaks is the one you don't take in testing.

**The weaker check underneath.** The existing
[`/api/auth/auto-login`](../../src/app/api/auth/auto-login/route.ts) could not have been reused
as-is. It takes `{userId, email, paymentIntentId}` — identity from the **client**, merely
cross-checked against the PaymentIntent's customer — and, verified by reading the handler, **it
never asserts the PaymentIntent actually succeeded**. It retrieves the intent and compares the
customer, then stops. Combined with `create-one-time-purchase` returning `autoLogin: true` on a
`requires_action` intent, a session could be minted for a payment that had not landed and might
never land.

**Fix:** [`POST /api/auth/session-from-payment`](../../src/app/api/auth/session-from-payment/route.ts)
takes **only** the client secret out of the redirect URL, derives the user from the PI's customer,
compares `client_secret` against the value Stripe holds (proof of possession — Stripe returns it
only to the payer), and requires `status === "succeeded"`.
[`use3DSRedirectHandler`](../../src/hooks/use3DSRedirectHandler.ts) calls it on `succeeded` and
exchanges the returned token through `signIn("auto-login", { token })`. That call is **best-effort
and silent by design**: the payment already succeeded, so a sign-in hiccup must never surface as a
payment error — the worst case is today's behaviour, a success page seen logged out. It retries the
`202 pending` webhook race on `[0, 1.5s, 3s, 5s]`.

**Still open, deliberately:** the three in-modal `MembershipModal` call sites continue to use
`auto-login`. Migrating them is mechanical, and was left out so a fault in the new route could not
break the purchase path that already works. Once proven in production, delete `auto-login` and
point all four at the new route. See [api.md](./api.md) and [rules.md](./rules.md) R9.

**Transferable lesson:** a redirect is a state boundary as hard as a page reload — anything the
return leg needs must be reconstructible from the URL plus the server, never from React state. And
when a route's job is "trust this because a payment happened", read the handler to confirm it
checks that the payment *happened*; a route named for a payment can still be checking only that a
payment **exists**.

## The React Query cache is part of the auth boundary — and sign-out alone can't clear it (fixed 2026-08-03)

`totalSignOut()` cleared every user-scoped `localStorage`/`sessionStorage` key and then called
NextAuth `signOut()`. That *looked* complete because `signOut()` does a full document navigation,
which throws away the in-memory `QueryClient` in the tab that triggered it — so single-tab testing
showed a clean slate. A **second open tab** never navigates: it learns of the sign-out through
NextAuth's cross-tab broadcast and keeps its React Query cache intact. On a shared device the next
person to sign in in that tab could briefly render the previous member's cached payloads (account
data, redeemables wallet, partner queue) before refetches replaced them.

**Fix:** `QueryCacheAuthBoundary` in [`src/app/providers.tsx`](../../src/app/providers.tsx) watches
the signed-in identity and calls `queryClient.clear()` whenever we **leave** an authenticated
identity. Three things about that shape are deliberate:

- It keys on **identity change, not the sign-out call**. A hook inside `totalSignOut()` would only
  ever fire in the tab that navigates — the one case that was already safe. Watching `session.user.id`
  is the only signal the passive tab receives, and it also covers session expiry and account switch.
- **First settled session and `null → id` are skipped** (`previous === undefined || previous === null`).
  Neither can be holding another user's data, and clearing on the guest→member transition would wipe
  the cache mid-purchase.
- The clear lives in `providers.tsx`, not `total-sign-out.ts`, because that module is a plain
  non-React module with no `QueryClient` in scope. Its header comment cross-references the boundary
  so the two halves stay discoverable together.

**Transferable lesson:** "sign-out navigates, so state dies with the page" is a single-tab
assumption. Any user-scoped state that survives without a navigation — in-memory caches, module
singletons, service-worker state — needs its own clear driven by *observed identity*, not by the
sign-out handler. And when a cache key isn't itself user-scoped, a stale entry doesn't just leak
privately; it renders as the next user's data.

## The SMS-OTP takeover hole is closed by DELETION, not by a guard (resolved 2026-08-25)

**Original (F-001, patched 2026-07-23):** `POST /api/auth/send-otp` resolved the account by
**email**, then delivered the SMS login code to `validatedData.mobile` — the number in the
**request body**, not the account's stored `user.mobile`. Anyone who knew a member's email could
POST `{email: victim, mobile: attackerPhone}` and receive that member's login code on their own
phone. The patch removed `mobile` from `sendOTPSchema` so delivery could only reach `user.mobile`.

**What that patch missed:** `POST /api/auth/passwordless-login` carried the *identical* shape —
account resolved by one identifier, code delivered to a request-body number — and was never
touched, because F-001 was written against `send-otp` alone. Two routes, one bug, one fix.

**Resolution:** all three legacy routes and their two modals are **deleted** — `api/auth/send-otp`,
`api/auth/verify-otp`, `api/auth/passwordless-login`,
`components/auth/PasswordlessLoginModal.tsx`, `components/auth/OTPVerificationModal.tsx`. Nothing
in production reached them; the only references were the dev modal gallery, so
[`src/data/dev/modal-reachability.json`](../../src/data/dev/modal-reachability.json) was
regenerated via `npm run analyze:modals`. Deleted code cannot be revived by someone setting an env
var, which is what "latent, not live" was relying on.

**The replacement is structurally immune, not guarded.** The design in
[2026-08-25-mobile-verification-and-sms-login-design.md](../superpowers/specs/2026-08-25-mobile-verification-and-sms-login-design.md)
resolves the account **BY MOBILE** — the number the caller supplies *is* the lookup key, so the
code always lands on the handset that identified the account. There is no second identifier left
to disagree with it, so the "resolve by A, deliver to B" class of takeover has nowhere to exist.

**Transferable lesson:** when a security finding names a route, grep for the *shape* — "identifier
A resolves the account, identifier B receives the secret" — across every sibling before closing
it. And when the feature is being rewritten anyway, prefer the data flow in which those two
identifiers are the same value over patching the mismatch. Original finding:
`docs/tech-debt/panel-review-feature-winner-testimonies.md` (F-001).

## Public registration must never touch a STAFF/ADMIN account (fixed 2026-07-23)

`POST /api/auth/register` treats an existing account as "plain / safe to overwrite" when it has
`accumulatedEntries === 0` and no saved payment methods ([`isPlainAccount`](../../src/app/api/auth/register/route.ts)),
and on a match it **overwrites `firstName` / `lastName` / `mobile` — and, on a *mobile* match,
the account's `email`** (see the "only mobile matches a plain account" path). Every staff/admin
account is created with 0 entries and no saved cards, so it looked "plain" — meaning an
**unauthenticated** request could rebind a privileged account's contact fields, and by
registering with *their own email + a staff member's mobile* could move that staff account's
login email onto an attacker-controlled address **while keeping the admin `role`/`roleId`** →
account-takeover / privilege escalation (login is email-code based: `send-login-code` looks up
by email). All 3 production staff accounts were exposed.

**Fix:** [`isPrivilegedAccount()`](../../src/utils/auth/privileged-account.ts) + an up-front
reject in the register route — if the matched-by-email OR matched-by-mobile account is
privileged, return `400` ("please log in") and never fall through to an update path.
`isPlainAccount()` also calls it defensively so no future update path can reach a staff account.

**The subtle part (the accurate fix):** the staff marker is the RBAC **`roleId` / `userType`**,
**NOT** the legacy `role` string. Manager and Customer Support staff carry `role: "user"` with a
non-null `roleId` and `userType: "staff"` — only the legacy super-admin has `role: "admin"`. A
naive `role !== "user"` guard would have missed 2 of the 3 real staff accounts. Regression test:
`npm run test:privileged-account`. See [roles.md](./roles.md).

*Residual (accepted, won't-fix):* the mobile-match branch can still rebind the `email` of a
non-staff **plain customer**, but this is the **intended** guest-re-entry behaviour — a returning
guest who registered (passwordless, not logged in) but didn't pay must be able to correct a
typo'd email while keeping their mobile, so the overwrite must NOT be removed. The target is
zero-value (0 entries, no purchase, no card, no membership); staff & converted accounts already
reject; and the one mitigation (reset `isEmailVerified` on change) is only a speed bump
(`send-email-verification`/`verify-email` are unauthenticated). Documented as an accepted residual
— see `docs/tech-debt/panel-review-feature-winner-testimonies.md` (F-004). **Do not "fix" by
blocking the overwrite — that is a conversion bug.**

## `/login` form controls had no accessible name/label (fixed 2026-07-22)

`src/app/login/page-client.tsx`: the password show/hide toggle button had an icon only (no
text/`aria-label`/`title`) — axe `button-name` violation. The floating-label email input and
the `SquareCheckbox` "Keep me logged in" checkbox both used a bare `<label>` with no
`htmlFor`/`id` pairing (the label text sat next to the control but wasn't programmatically
associated) — axe `label` violations ×2. Fixed by adding `aria-label={showPassword ? "Hide
password" : "Show password"}` to the toggle button (state-appropriate), `id="login-email"` +
matching `htmlFor` on the email input/label, and a new optional `id` prop on the local
`SquareCheckbox` component wired to `id="login-remember-me"` + matching `htmlFor` on its
label. See [docs/e2e/a11y-baseline.md](../e2e/a11y-baseline.md) for the axe target detail;
`e2e/specs/quality/a11y.spec.ts`'s `@a11y` baseline entries for these three were removed.

## User routes are include-list projected — new client fields silently vanish (2026-07-19)

`GET /api/users/[id]` and `GET /api/users/[id]/my-account` no longer return the whole User document
minus three fields — they select the **additive include-list** `MY_ACCOUNT_USER_FIELDS` from
[src/utils/dashboard/my-account-projection.ts](../../src/utils/dashboard/my-account-projection.ts)
(both the `findById` and the `findOne`-by-email branches). **If you add a new field to the User model
that any client surface reads off `userData` / `accountData.user`, you MUST add it to
`MY_ACCOUNT_USER_FIELDS` — otherwise the field is silently `undefined` on the client and the UI
degrades without a type error** (`tsc` can't see a Mongo projection). Fields *inside* `subscription`
are safe automatically (the whole subdocument is projected — that's how the streak fields ship).
Deliberately excluded: wire bloat (`processedPayments`, `upsellHistory`, `upsellPurchases`,
`redemptionHistory`, `cart`) and all auth secrets. `miniDrawParticipation` looks like bloat but is
consumed (`/my-account/draws`) — it stays. When auditing consumers before changing the list, sweep
cast patterns (`as unknown as { field }`) across `src/components/features` too, not just the
my-account page tree — `MiniDrawCard.tsx` and `MiniDrawPackages.tsx` read `miniDrawParticipation`
through such casts. Guard: `npm run test:my-account-projection`; details in [api.md](./api.md).

**Related latent bugs fixed 2026-07-20** (in the same `my-account` route): `recentOrders` filtered `Order.find({ userId })` where the model owner field is `user` (phantom `userId` → always `[]` → `totalSpent` always `$0`), and `activeMiniDraws` filtered on a phantom `MiniDraw.endDate` (the model has no such path → always `[]`). Both restored (`Order.find({ user })`, `MiniDraw.find({ isActive: true })`). Also: the Account-settings `hasPassword` read moved off the my-account payload (which never carries the derived `hasPassword`) onto the `/api/users/[id]` payload — see [dashboard-account/gotchas.md](../dashboard-account/gotchas.md) for the full write-up + customer impact.

## Deactivated accounts are rejected AT login, not after (fixed 2026-07-09)

`authorize()` used to check only user-exists + password — never `isActive` — so a deactivated account (`User.isActive: false`) **logged in successfully** and got a session; the jwt callback's subsequent-request guard ([auth.ts](../../src/lib/auth.ts) `!dbUser || dbUser.isActive === false` → `token.deleted`) then killed it on the first session refresh, seconds later. Result: an unexplained, endlessly-recurring login→auto-logout loop. Who hits it: removed staff (`DELETE /api/admin/staff/[id]` leaves `isActive:false` with the password intact), admin-deactivated users (`toggle_status` / `basicInfo.isActive` — neither guards `userType`), and invited staff who never completed `/staff-setup` but obtained a password via the public forgot-password flow (`reset-password` sets ONLY the password, never `isActive`).

Now every login path rejects up-front:
- **Credentials** `authorize()` throws `ACCOUNT_DEACTIVATED` — checked **after** `bcrypt.compare` so account status is only revealed to a valid credential holder. The catch-all in `authorize` **rethrows** this specific error (otherwise it would collapse into the generic `CredentialsSignin`); `/login` and `LoginModal` both branch on `result.error === "ACCOUNT_DEACTIVATED"` and show "This account has been deactivated. Please contact an administrator."
- **Google** `signIn` callback returns `false` (surfaces as `AccessDenied`, same UX as unknown-email rejection).
- **Email sign-in code**: `POST /api/auth/verify-login-code` rejects with 403 + the clear message **after** the OTP is validated (status only revealed to the inbox holder; `send-login-code` still emails a code so an unauthenticated probe learns nothing). Backstop: the **auto-login** provider re-checks `isActive` in the DB before accepting any bridge token (the JWT alone can't prove the account is still active) and throws `ACCOUNT_DEACTIVATED` — its catch-all rethrows it, same pattern as credentials — which `LoginModal`'s code path maps to the clear message (it never renders raw `result.error` codes).
- **jwt callback first branch** refuses to mint a first token for an inactive account (`token.deleted`) — covers any provider path that slips through.

The subsequent-request guard stays — it's what invalidates a *live* session when an admin deactivates mid-session. Related: the client-side half of the old symptom (403 → force sign-out in `apiRequest`) was fixed the same day — see [client-state/gotchas.md](../client-state/gotchas.md).

## JWT/auth remediation — 2026-06-19 (in progress)

Tracked in [jwt-auth-remediation-spec.md](./jwt-auth-remediation-spec.md). Landed so far (no existing NextAuth session is invalidated by any of these):

- **One way to authenticate API routes that need the user doc.** `requireAuthenticatedUserDoc()` in [api-auth.ts](../../src/lib/api-auth.ts) is now the single helper — it reads `getServerSession` and returns the calling user's Mongo document. It replaced eight copy-pasted `getUserFromToken` helpers in cart/orders/mini-draws. **Never** resolve identity from an `Authorization: Bearer` header or from a raw string id again. (The old cart helpers fell back to `User.findById(token)` on verify failure — an auth bypass, since the live client sent the bare `session.user.id` as the bearer.)
- **CSRF on cookie-authenticated mutations.** State-changing routes that authorize via the session cookie call `requireSameOrigin(request)` ([utils/security/requireSameOrigin.ts](../../src/utils/security/requireSameOrigin.ts)) — a same-origin check (`Origin === request.nextUrl.origin`, plus an allowlist) that returns 403 on cross-site origins. Needed because cookie auth (unlike the old bearer) is auto-attached by the browser.
- **`src/lib/jwt.ts` tokens are short-lived BRIDGE tokens, not sessions.** They are minted by `/api/auth/auto-login` and `/api/auth/verify-login-code` and consumed within seconds by the NextAuth `auto-login` provider. Lifetime is now **15m** (was 30d) and the algorithm is pinned `HS256` on both sign and verify.
- **`/api/auth/me` and `/api/auth/login` were deleted** — both were dead System-2 bearer routes with zero callers (`/api/auth/login` only minted the never-read `ta_session_token`). If an external/mobile client ever needs "current user" or a password login, build it behind `getServerSession` / NextAuth, not a bearer.
- **`/api/auth/auto-login` now requires proof of payment (A0 — account-takeover fixed).** It previously minted a session from `{userId,email}` + the user merely having a `stripeCustomerId` (both non-secret → account takeover). It now requires a Stripe `paymentIntentId` that **belongs to the user's Stripe customer** (verified via `stripe.paymentIntents.retrieve`) — an attacker can't obtain a victim's PI id. The **email-verification** login flow no longer calls this route at all: `/api/auth/verify-email` mints the bridge token off the just-verified code (membership-gated) and `LoginModal` signs in with it. Token minting is centralized in `signAutoLoginToken` (`src/lib/jwt.ts`) — only call it after a server-verified action. **Assumption to keep true:** all membership purchases that auto-login carry a PaymentIntent (no $0/free membership signups). If a $0 membership flow is ever added, give it a proof path or it won't auto-login.
- **Auth brute-force endpoints use a shared (Mongo) rate limiter.** `nextauth-credentials`, `auth-register`, `auth-verify-login-code`, and `auth-auto-login` use `createDistributedRateLimiter` (fail-open, backed by the `RateLimit` model) so limits hold across Vercel instances. Other callers (Norm, error-reports, Stripe, promo) keep the in-memory `createRateLimiter`. `verify-login-code` also compares the OTP in constant time (per-user `MAX_ATTEMPTS=5` still applies).

## Registration ≠ authenticated session (this codebase, MembershipModal)

**MembershipModal step-1 success does NOT auto-login the user.** This is non-obvious — most apps log in on register, this one doesn't. Concrete consequences:

- After `/api/auth/register` returns 200 from step-1, `useUserContext().isAuthenticated` is **still `false`**. The user has not been issued a NextAuth session token.
- The modal bridges step-1 → step-2 via `hasCompletedRegistration = isAuthenticated || guestUserData !== null` (in [MembershipModal:594](../../src/components/modals/MembershipModal/index.tsx#L594)) — `guestUserData` is component state populated on step-1 success and used as the credential for the step-2 payment call.
- A guest can complete step-1 → step-2 → submit payment while remaining `isAuthenticated: false` throughout. They become authenticated only later (on payment success / explicit login).
- `guestUserData` **persists across modal close/reopen** because the modal stays mounted (parent controls via `isOpen` prop, not unmount). So a guest who closed the modal after step-1 and reopened it lands directly on step-2 without re-doing registration. This means `handleRegistration` does NOT run for the second open — only `handleSubmit` runs.
- The three "plain account update" branches at [register/route.ts:327](../../src/app/api/auth/register/route.ts#L327), [:456](../../src/app/api/auth/register/route.ts#L456), [:544](../../src/app/api/auth/register/route.ts#L544) fire `User Registered` again when an existing zero-entry account re-submits step-1 with new field values. This is intentional ("plain account" is effectively a fresh-start guest).

**Rule for any new tracking event or auth-conditional logic in the modal**: never assume `isAuthenticated === true` after step-1. Always pass real `useUserContext().isAuthenticated` through, do not derive from funnel-step name.

This was the source of two Phase-4 bugs (2026-05-28): server-side `Started Checkout` only fired in the new-user branch (missed existing-plain-account re-registration), and client-side `handleSubmit` fire was gated on `if (isAuthenticated)` which skipped guests who re-opened the modal with new package selection. Both fixed in commit `ebd33f94...` of Phase 6.

## `/api/auth/register` fires Klaviyo `Started Checkout` server-side (bypasses consent)

When the MembershipModal posts a guest registration with a `packageId`, `/api/auth/register` fires a canonical Klaviyo `Started Checkout` event (`step="registered"`) **server-side** via `klaviyo.trackEventBackground`. Fires from **all four** register paths (new-user creation + the three plain-account update branches) so the event stays 1:1 with `User Registered`. Helper: `fireKlaviyoStartedCheckoutForGuestRegistration` in `/api/auth/register/route.ts`.

**Key behaviour**:
- Fires server-side because the client-side Klaviyo onsite cookie isn't yet set for a never-cookied guest at the moment they complete step-1 — pushing via Events API with explicit `customer_properties.email` attaches reliably to the just-created (or updated) Klaviyo profile.
- **Not gated** on `hasPixelConsent()`. The client-side gate exists for browsing-behaviour events (Viewed Page / Viewed Giveaway / Viewed Product). `Started Checkout` represents a committed action (registration submitted) and is part of transactional analytics.
- Skipped gracefully when the request payload omits `packageId` (Google-OAuth, affiliate, and other non-modal registration paths).
- Always emits `isAuthenticated: false` (this path runs at registration submit — user is by definition a guest).

The complementary client-side fire from `MembershipModal:handleSubmit` covers the second-open case where `guestUserData` persisted and step-1 was skipped. The `initiateCheckoutFiredRef` ref-guard prevents double-firing when both server-side (handleRegistration) and client-side (handleSubmit) ran in the same modal session. See `docs/tracking/KLAVIYO_INTEGRATION.md` "Canonical property names" + spec `docs/superpowers/specs/2026-05-27-klaviyo-events-expansion-design.md` §5.

## Middleware doesn't gate /api

The most common bug: thinking `/api/admin/**` is gated by middleware. It's NOT. Middleware's matcher excludes `/api`. Each handler must check session + role itself.

## Two systems sharing Mongo

Member auth (NextAuth) and affiliate auth (custom `affiliate-auth.ts`) share a Mongo instance but use different models / collections. Don't try to reconcile session shapes.

## `debugAuth` leaking to prod

[src/lib/debugAuth.ts](../../src/lib/debugAuth.ts) is dev-only. If you import it from a production-path file, the bundle leaks debug helpers. Lint config should catch this; if it doesn't, file an issue.

## OAuth callback state

The `oauth-redirect` page handles the OAuth callback. If the state doesn't match (stale tab, race), the redirect should error gracefully and offer a re-login link.

## Password reset token reuse

Tokens are single-use. After successful reset, the token is invalidated server-side. Don't allow re-use even if the user double-clicks.

## CSP and auth flows

NextAuth callbacks include inline scripts in some cases. The CSP config in [security-csp](../security-csp/) must allow these — verify when adding/removing CSP directives.

## `CompleteRegistration` server CAPI prefers body `fbc`/`fbp` over the cookie

The server-side `CompleteRegistration` Conversions API event (fired from [register/route.ts](../../src/app/api/auth/register/route.ts)) prefers the `fbc`/`fbp` values from the request **body** over the `_fbc`/`_fbp` cookies: `const fbc = validatedData.fbc ?? ctx.fbc`. Why: the register POST can fire **before** the Meta pixel writes the `_fbc` cookie, and the API URL has no `fbclid` to reconstruct from — so sourcing `fbc` only from the cookie often sends an empty value while the browser pixel (firing later) has it, which Meta flags. The client (which can read the cookie *or* reconstruct `fbc` from the landing `fbclid`) supplies them in the body. Cookie fallback via `extractRequestContext` is retained for callers that don't send them. Client counterpart: [MembershipModal](../../src/components/modals/MembershipModal/index.tsx) — see [shared-ui/gotchas.md](../shared-ui/gotchas.md).

As of 2026-07-16 the same route also fires a **TikTok Events API `CompleteRegistration`** (helper `sendTikTokCompleteRegistration`) alongside the Meta event on every registration branch, reusing the **same `eventID`** so the browser and both server sends dedup. TikTok match signals are `ttclid` / `_ttp` (from `extractTikTokContext`), not `fbc` / `fbp`. It never throws. See [api.md](./api.md).

## `buildSignupAttribution` now persists attribution without a promo slug (2026-06-01)

`src/app/api/auth/register/route.ts` calls `buildSignupAttribution(data)` (since 2026-07-29 imported from [`src/services/attribution/signup-attribution.ts`](../../src/services/attribution/signup-attribution.ts)) to persist marketing attribution to `User.signupAttribution` at the moment of registration. Before this change the helper silently returned early when `data.promotionSlug` was absent (i.e. non-promo landings). After this change it persists UTM + click-ID attribution even when no promo slug is present, so organic and ad-click registrations that did not arrive via a `/promotions/*` page also get attribution stamped.

Practical consequence: `User.signupAttribution.promotionSlug` and `User.signupAttribution.promotionPageType` are now optional — they are only populated when the registration originated from a promo page. Code that reads `signupAttribution` must not assume those two fields are always set.

The attribution resolver (`src/services/attribution/`) reads `signupAttribution` as a fallback when no session-level click ID is present.

## Login flows: invalidate the full user-scoped cache off the fresh session

After any successful login (password, Google, email-verify auto-login, login-code, and the `/login` page), read the post-login id via `await getSession()` (not the stale `useSession()` closure), invalidate via the canonical [`usePurchaseInvalidation`](../../src/hooks/usePurchaseInvalidation.ts) (covers `users.detail`/`dashboard`/`account`, `majorDraw.*`, orders, rewards — not just the old three keys), then `router.refresh()`. The password-login flow previously guarded this on the closure `session` (null at login time), so invalidation **and** Klaviyo `identify()` were dead code. See [LoginModal](../../src/components/modals/LoginModal/index.tsx) and [/login page](../../src/app/login/page.tsx). Note the real "entries show 0 after login" symptom was an HTTP-caching issue (see [draws/gotchas.md](../draws/gotchas.md)); this invalidation cleanup is defensive.

## Re-registering must MERGE `signupAttribution`, never replace it (2026-07-29, panel F-019)

`signupAttribution` is an **inline nested object** on the User schema, not a sub-`Schema`. Assigning
it wholesale (`existingUser.signupAttribution = signupAttr`) emits a whole-subdocument `$set` —
verified against mongoose 8.18.1, the emitted write is
`{"$set":{"signupAttribution":{"visitedAt":"…","clickPlatform":"meta"}}}`, with nothing merged.

That became destructive once a bare `clickPlatform` was enough to persist on its own. The path:

1. Visitor lands on a promo page, builds a prize, completes step 1, abandons payment — precisely the
   visitor the resume flow exists to bring back.
2. Days later they click an ad, land somewhere with no promo slug and no UTMs, and re-register with
   the same email. `_fbc` is present, so `clickPlatform` alone passes the guard.
3. The whole object is replaced: `promotionSlug`, `promotionPageType`, `builtPrizeSlug` and the
   original UTMs are gone, and the eventual purchase is attributed to no page and no build.

Before the third trigger existed, such a request returned `undefined` from `buildSignupAttribution`
and left the prior attribution untouched — the guard change made the replace reachable.

**Rule:** all three existing-account branches go through `mergeSignupAttribution`, which
**preserves the promo fields when the new signup does not carry them** (`promotionSlug` /
`promotionPageType` / `builtPrizeSlug` identify where the visitor was acquired) and is
last-write-wins for everything else, so a newer click/UTM still refreshes. Read the stored value
through `plainSignupAttribution` first — a hydrated document can hand back a mongoose-wrapped
object, and spreading that drags internal symbols onto the write. New-account branches still
assign directly; there is nothing to preserve.

**Precise wording matters here** (corrected 2026-07-29 while adding the test, panel F-038): the rule
is **preserve-when-absent**, not a flat "first touch wins". The two differ when the NEW signup
carries a promo field of its own — the preserve branches are guarded on `!next.promotionSlug` /
`!next.builtPrizeSlug`, so a re-registration that DOES arrive from a second promo page overwrites
`promotionSlug`, and one carrying its own built prize overwrites `builtPrizeSlug`. Only the absent
case is protected. That is exactly the F-019 scenario (a bare click-id signup), so the fix is
correct — but do not read the shorthand as a guarantee that the first promo page is immutable.

**Two mechanisms, each individually redundant, deliberately kept.** Mutation testing while writing
`npm run test:signup-attribution` showed that deleting *either* half leaves the F-019 scenario
working: `buildSignupAttribution` OMITS absent keys (so `{...previous, ...next}` alone already
preserves), and the explicit preserve branches re-add the promo fields (so `...previous` alone is
not what saves them). They cover different failure modes — `...previous` protects the whole UTM /
campaign snapshot, and the branches protect the promo fields against a future
`buildSignupAttribution` that emits `promotionSlug: undefined` as a present key. Both are pinned by
assertions; do not "simplify" one away on the grounds that the other covers it.

**Where this logic lives:** `src/services/attribution/signup-attribution.ts` (moved out of the route
handler 2026-07-29, panel F-038 — `app/api/**` handlers hold no business logic). All three functions
keep their original names. Covered by `npm run test:signup-attribution`.

## Sign-out clears the Discounts nav badge — including the `guest` bucket (2026-08-05)

`USER_LOCAL_PREFIXES` in [`total-sign-out.ts`](../../src/utils/auth/total-sign-out.ts) gained
`discountNavNudgeSeen_`, the one-time "new" marker on the header's Discounts item.

It is prefix-matched, so signing out clears **both** the per-user key and the shared
`discountNavNudgeSeen_guest` one. That is the intended behaviour, not an oversight: on a shared
device the next anonymous visitor should be treated as new rather than inherit the previous
person's dismissal. It is also the only entry in that list whose key can exist for a signed-out
visitor at all — `/discount` is public, so the marker is written before anyone has a `userId`.

The general rule this follows is the standing one for this file: **a per-user breadcrumb in
localStorage must never survive an auth boundary.** Anything new that records "this person has
already seen X" gets its prefix added here in the same change, or the next member on a shared
device silently inherits it and is never shown the feature.

## Registration no longer initialises `upsellStats` (2026-08-27)

`POST /api/auth/register` used to seed a five-counter `upsellStats` object on every new user.
The field is deleted from the model — see `docs/upsell/gotchas.md`. `upsellPurchases: []` and
`upsellHistory: []` are still initialised and remain live.

## Registration now mints a checkout-identity cookie (2026-08-28)

`/api/auth/register` sets an HttpOnly, `SameSite=Lax`, 2-hour cookie `ta_checkout_identity` on its
**success path only**. It is the proof that this browser controls the email it is about to check out
with, and the purchase routes refuse to bind an existing account without it.

This works precisely because of a property this route already had: **every earlier branch rejects an
email that already has an account** ("This email address is already associated with an existing
account. Please log in instead."). Reaching the success return therefore proves the caller just
created that account. **If that guarantee is ever relaxed — if registration is allowed to return
success for a pre-existing email — the cookie stops being proof and the account-takeover fixed on
2026-08-28 comes straight back.** Treat those rejection branches as load-bearing security, not UX.

Minting is wrapped in try/catch and is non-blocking: registration must not fail because the cookie
could not be signed. The buyer simply falls through to the true-guest path at checkout.

Full rationale, the three-outcome contract, and the JWT-audience separation from the `auto-login`
bridge token: [payment/gotchas.md](../payment/gotchas.md#account-takeover-an-unauthenticated-caller-could-bind-any-members-stripe-customer-fixed-2026-08-28).
