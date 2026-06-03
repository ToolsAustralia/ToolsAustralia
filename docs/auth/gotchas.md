# Auth — Gotchas

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

## `buildSignupAttribution` now persists attribution without a promo slug (2026-06-01)

`src/app/api/auth/register/route.ts` calls `buildSignupAttribution(data)` to persist marketing attribution to `User.signupAttribution` at the moment of registration. Before this change the helper silently returned early when `data.promotionSlug` was absent (i.e. non-promo landings). After this change it persists UTM + click-ID attribution even when no promo slug is present, so organic and ad-click registrations that did not arrive via a `/promotions/*` page also get attribution stamped.

Practical consequence: `User.signupAttribution.promotionSlug` and `User.signupAttribution.promotionPageType` are now optional — they are only populated when the registration originated from a promo page. Code that reads `signupAttribution` must not assume those two fields are always set.

The attribution resolver (`src/services/attribution/`) reads `signupAttribution` as a fallback when no session-level click ID is present.

## Login flows: invalidate the full user-scoped cache off the fresh session

After any successful login (password, Google, email-verify auto-login, login-code, and the `/login` page), read the post-login id via `await getSession()` (not the stale `useSession()` closure), invalidate via the canonical [`usePurchaseInvalidation`](../../src/hooks/usePurchaseInvalidation.ts) (covers `users.detail`/`dashboard`/`account`, `majorDraw.*`, orders, rewards — not just the old three keys), then `router.refresh()`. The password-login flow previously guarded this on the closure `session` (null at login time), so invalidation **and** Klaviyo `identify()` were dead code. See [LoginModal](../../src/components/modals/LoginModal/index.tsx) and [/login page](../../src/app/login/page.tsx). Note the real "entries show 0 after login" symptom was an HTTP-caching issue (see [draws/gotchas.md](../draws/gotchas.md)); this invalidation cleanup is defensive.
