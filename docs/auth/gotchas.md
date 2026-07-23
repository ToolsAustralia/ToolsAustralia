# Auth — Gotchas

## `send-otp` must deliver the code to the STORED mobile, never a request-supplied one (fixed 2026-07-23)

`POST /api/auth/send-otp` resolved the account by **email**, then sent the SMS login code to
`validatedData.mobile` — the number in the **request body**, not the account's stored
`user.mobile`. Anyone who knew a member's email could POST `{email: victim, mobile: attackerPhone}`
and receive that member's login code on their own phone → account takeover (gated only on the
victim having an active membership). **Fix:** removed `mobile` from `sendOTPSchema` entirely and
now deliver only to `user.mobile` (400 if none/invalid on file) — see the delivery block in
[`send-otp/route.ts`](../../src/app/api/auth/send-otp/route.ts). The client
([`PasswordlessLoginModal.tsx`](../../src/components/auth/PasswordlessLoginModal.tsx)) may still
send a `mobile` field; Zod strips it, so there is no break.

**Not live today** (no `TWILIO_*` configured, and `verify-otp` issues no session), so this was a
*latent* takeover — but the fix lands now so enabling SMS-OTP login can't ship the hole. **Pre-launch
UX follow-up:** `PasswordlessLoginModal` still renders a mobile input that is now ignored — drop it
(or show the masked stored number) when SMS-OTP is switched on. See
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

`src/app/api/auth/register/route.ts` calls `buildSignupAttribution(data)` to persist marketing attribution to `User.signupAttribution` at the moment of registration. Before this change the helper silently returned early when `data.promotionSlug` was absent (i.e. non-promo landings). After this change it persists UTM + click-ID attribution even when no promo slug is present, so organic and ad-click registrations that did not arrive via a `/promotions/*` page also get attribution stamped.

Practical consequence: `User.signupAttribution.promotionSlug` and `User.signupAttribution.promotionPageType` are now optional — they are only populated when the registration originated from a promo page. Code that reads `signupAttribution` must not assume those two fields are always set.

The attribution resolver (`src/services/attribution/`) reads `signupAttribution` as a fallback when no session-level click ID is present.

## Login flows: invalidate the full user-scoped cache off the fresh session

After any successful login (password, Google, email-verify auto-login, login-code, and the `/login` page), read the post-login id via `await getSession()` (not the stale `useSession()` closure), invalidate via the canonical [`usePurchaseInvalidation`](../../src/hooks/usePurchaseInvalidation.ts) (covers `users.detail`/`dashboard`/`account`, `majorDraw.*`, orders, rewards — not just the old three keys), then `router.refresh()`. The password-login flow previously guarded this on the closure `session` (null at login time), so invalidation **and** Klaviyo `identify()` were dead code. See [LoginModal](../../src/components/modals/LoginModal/index.tsx) and [/login page](../../src/app/login/page.tsx). Note the real "entries show 0 after login" symptom was an HTTP-caching issue (see [draws/gotchas.md](../draws/gotchas.md)); this invalidation cleanup is defensive.
