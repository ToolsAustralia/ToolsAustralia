# Auth — Frontend

## Pages

- `/login` — login + signup form
- `/reset-password` — token-based reset
- `/oauth-redirect` — OAuth callback handling

### Cobber on the auth pages (2026-07-07)

`/login` and `/reset-password` live **outside** the `(site)` route group, so they don't
inherit `(site)/layout.tsx`'s Cobber support-chat mount. Each now has its own tiny
`layout.tsx` that renders `<SupportChatWidgetMount />` — a signed-out user stuck on login
or mid-password-reset is exactly who needs "how do I log in / I forgot my password" help
(FAQ id 32). The visitor is anonymous, so Cobber answers from free FAQ deflection (+ guest
LLM when `CHAT_ALLOW_GUEST_GENERATIVE` is on). Keep the two auth layouts in lockstep.

## Components

[src/components/auth/](../../src/components/auth/) — login form, signup form, password reset, OAuth buttons.

## Total sign-out (2026-07-02)

`totalSignOut()` / `clearUserScopedClientStorage()` in
[src/utils/auth/total-sign-out.ts](../../src/utils/auth/total-sign-out.ts) are the single entry point
for signing out. `clearUserScopedClientStorage()` wipes the **user-scoped** portion of `localStorage`
+ `sessionStorage` (auth breadcrumbs `wasAuthenticated`/`topBarHidden`/`auth-token`, per-user "seen"
flags `subscriptionExplainerSeen_*`/`rewardsWidgetSpotlightSeen_*`, in-progress
checkout/upsell/setup/verify state, `subscription_upgraded`/`downgraded`, `modal-priority-store`) and
**keeps** device/attribution keys (`ta-theme`, `ta-admin-theme`, `tools-aus:*`, `affiliate_code`,
`ab_*`, `promoWelcomeShown_*`, admin-UI + dev keys). It also clears **support-chat** history +
`conversationId` by delegating to the chat module's own `clearSupportChatStorage()`
([src/lib/support-chat/chatStorage.ts](../../src/lib/support-chat/chatStorage.ts)) — so the chat key
list stays owned by the chat module and isn't duplicated here. Every step is try/caught so one failure
never blocks sign-out. `totalSignOut()` clears then calls NextAuth `signOut`.

Wired into every sign-out trigger: the Header menu, AdminSidebar, the Account-settings Sign-out, and
the 401/403/USER_NOT_FOUND forced-logout in [`src/lib/queries.ts`](../../src/lib/queries.ts)
(clear-only — keeps its in-place `signOut()`). This app has **no IndexedDB / offline outbox / Cache
Storage** (verified), so no persisted queue can drain into the next account. **When you add a new
per-user client-storage key, add it to the clear lists in `total-sign-out.ts`** (or, for a self-contained
feature module, add a `clear*()` of your own and call it from `clearUserScopedClientStorage()`, as
support-chat does).

Storage is not the whole boundary: the **in-memory React Query cache** is user-scoped too (account
payload, redeemables wallet, partner queue). `total-sign-out.ts` cannot reach it — it's a plain module
with no access to the `QueryClient` — so it is cleared at the same boundary by `QueryCacheAuthBoundary`
in [`src/app/providers.tsx`](../../src/app/providers.tsx), which clears on identity **change**, not on
the sign-out call. See [gotchas.md](./gotchas.md) for why the boundary has to be identity-driven.

> _TODO: enumerate exact components._

## Context

[src/contexts/UserContext.tsx](../../src/contexts/UserContext.tsx) — exposes session user to React tree. Components consume via `useContext(UserContext)`.

## State conventions

- Session via NextAuth's `useSession()` hook + UserContext
- No Zustand for session

## className conventions (2026-05-08)

Auth components use `cn()` from `@/utils/cn` for conditional class composition. The `sweep-classname-template-literals` codemod (Plan 5 Phase 2) converted template-literal `className={`...`}` patterns to `className={cn(...)}`. Use `cn()` rather than template literals when adding new conditional classes.

## Viewport units (2026-05-09)

`/reset-password` switched from `min-h-screen` to `min-h-svh` so the iOS / Android URL bar doesn't push the form off-screen. New auth full-bleed pages should use `min-h-svh` (small viewport height — accounts for the dynamic browser chrome).

## Login page presentation (2026-05-14)

`/login` uses a two-column layout (desktop) / form-then-card stack (mobile):

- **Left:** sign-in form, theme toggle, "Forgot password?", Google OAuth, and the "Create one" link to `/membership`. NextAuth wiring is unchanged.
- **Right:** the all-prizes evergreen collage (`/images/background/promo/landing/all-prizes/all-prizes-mobile.webp`, same asset as `/draw-results`) sits behind a `RotatingToolsetCard` that auto-cycles Milwaukee → DeWalt → Makita → Ryobi → HiKOKI every ~3.5s (HiKOKI added 2026-07-20 — 15pc kit, `hikoki-green` color key, `Ticket`/"Free Entries · Into Every Draw" badge; reuses the existing `POWERSET_IMAGES.hikoki` / `POWERSET_BRAND_TEXT.hikoki` assets). The card surface tints per active brand so Ryobi's lime brand colour never lands on a white surface. Layout is text-left + contained image-right on `lg+`, image-on-top + text-below on smaller widths. Wordmark, hero photo, piece-count pill, and a bottom-right animated badge chip all swap in unison; the headline ("Earn Partner Discounts & Win Tools") and body stay static. Badge content pairs 1:1 with the active brand (Milwaukee→Secure Payment, DeWalt→Premium Partner Discounts, Makita→Exclusive Offers, Ryobi→Drawn Live) and uses the brand's darker accent (`brandTheme.primaryDark`) for label text so it stays readable on the white chip surface in every step.

The "Sign in" h1 and "Please login to continue to your account." sub-copy render inline (baseline-aligned, `flex-wrap`) below `lg` and stack vertically on desktop, so the form header doesn't dominate small viewports.

### SMS sign-in (2026-08-27)

Below the divider, **Google and SMS share one row** (`grid grid-cols-2`) with identical styling —
`[G] Sign in` and `[📱] SMS sign in`. Presented as equals on purpose: SMS is a first-class way in,
not a buried fallback. It is also the *only* recovery route for a member with a typo'd email —
"Forgot password?" mails a link to the address on file, which is exactly the address they cannot
read.

**Cost note for anyone changing this:** every SMS code costs a credit, so the button's prominence
drives spend directly. The ceiling is held by the server, not the UI — `hasEverPaid` refuses
non-customers before the gateway is called, and 3/day + 60s throttles the rest. Keep both gates if
this row is ever made more prominent still.

Clicking it **replaces** the password form rather than expanding beside it — a member who needs
this path cannot use the others, so leaving them on screen is noise. Two steps, driven by
`smsStep: "off" | "mobile" | "code"`:

1. **mobile** — `tel` input → `POST /api/auth/send-mobile-login-code`.
2. **code** — 6-digit input (`inputMode="numeric"`, `autoComplete="one-time-code"` so iOS/Android
   offer the code from the notification) → `POST /api/auth/verify-mobile-login` → the returned
   bridge token goes through `signIn("auto-login", { token })`, the same exchange the emailed-code
   path uses. The existing session `useEffect` handles the redirect.

A `smsCooldown` countdown (seeded to 60s after a send, or to `retryAfterSeconds` from a 429)
disables both "Send me a code" and "Resend code" and renders the remaining seconds, so the
server's 60-second rule is visible rather than a silent rejection.

**Copy is deliberately sparse.** The panel renders only the back link, the input and the button —
no heading, no explainer. The page header already says "Sign in", the placeholder carries the
field's meaning, and a first draft with its own `<h2>` + subtitle stacked *three* headings on one
small screen. The one line that survives is on the code step — "Code sent to 0412 345 678" —
because a member must be able to spot a typo before spending another of their three daily codes.
The non-customer fallback needs no copy either: "Need an account? Create one" already sits at the
bottom of the page.

The server's reply is **uniform** — it never says whether a number has an account (see
[api.md](./api.md)) — so the UI always advances to the code step rather than branching on whether
a code was actually sent. It does **not** render `data.message`; that message exists for API
consumers, and showing it here duplicated the "Code sent to…" line. Do not "improve" this by
inferring account existence from the response; there is nothing there to infer, by design.

## SMS in `LoginModal` — and the mobile-collision dead end it fixes (2026-08-27)

`/login` is not the only sign-in surface. [`LoginModal`](../../src/components/modals/LoginModal/index.tsx)
is the popup, and in production it is reachable from exactly one place:
`MembershipModal` → [`ExistingAccountModal`](../../src/components/modals/ExistingAccountModal/index.tsx)
→ `LoginModal`, fired when `register` replies `isExistingAccount`. That path is *literally the
locked-out member* — someone who could not sign in, so tried to register again.

**The bug this closes.** `ExistingAccountModal` accepts `conflictField: "mobile"` and titles itself
"Mobile already exists", but its Login button was `disabled={!email}` and it rendered `LoginModal`
only under `{email && …}`. On a **mobile** collision `register` deliberately withholds the matched
account's email (enumeration guard — see [gotchas.md](./gotchas.md)), so `MembershipModal` falls
back to `formData.email`: the address the caller just typed, which by definition is not the
account's. Every sign-in from that modal therefore failed by construction — a member holding the
right phone number was shown a door that could not open.

Now: `conflictField === "mobile"` + a `mobile` prop ⇒ the button reads **"Sign in with your mobile"**
and opens `LoginModal` with `initialFlow="sms"`. The mobile is the one identifier that *does*
resolve the right account, and it is the one thing the caller definitely has — they just typed it.

**Channel switch, not a second flow.** `LoginModal` gained `codeChannel: "email" | "sms"` rather
than a parallel SMS panel, so both channels share the existing digit-box entry, paste button and
keyboard navigation; only the endpoints and the copy differ. The password form now offers **"Email
me a code"** and — when a `mobile` is known — **"Text me a code"**. The "Signing in as" header shows
the **mobile** in the SMS flow, because the email on screen may not be the account's. Resend
respects the same 60s countdown as `/login`.

`MembershipModal` passes `mobile={formData.phone}` — that form calls the field `phone`, but it is
the value posted as `mobile` to `register`.

`LoginPromptModal` is unrelated: it is a "please sign in" interstitial used by the mini-draw
surfaces and offers no credentials of its own.

`RotatingToolsetCard` is defined inline in `src/app/login/page-client.tsx` because it has a single consumer. It reuses shared brand assets (`POWERSET_IMAGES`, `POWERSET_BRAND_TEXT` from `src/components/sections/promo/prize-selection/constants.ts`) and brand color helpers (`getToolsetBadgeStyle`, `getPackageColorScheme`, `getLandingPageThemeFromSlug`, `hexToRgbaString` from `src/utils/package-colors/packageColorScheme.ts`), so Ryobi's lime-on-dark-green pill treatment is identical across the site. **Those two maps are now DERIVED from the `TOOLSETS` registry** (2026-07-21) — this page is their only remaining consumer besides the registry itself, since the prize picker reads `TOOLSETS` directly. Do not hand-write entries into them. Auto-rotation respects `prefers-reduced-motion`.

## Sign-out storage clear — streak celebration marker (2026-07-07)

`total-sign-out.ts` `USER_LOCAL_PREFIXES` gains `ta-streak-seen:` — the Membership Streak celebration marker (last-celebrated streak level per user, written by `useStreakCelebration`). Per-user breadcrumb; must not leak the previous member's streak position on a shared device.

## 2026-07-20 — Tier-2 perf: Poppins codemod

Components in this domain were touched by the sitewide `font-'[Poppins]'` → `font-poppins`
codemod (`npm run sweep:font-poppins`). Their Poppins-classed text now renders **real Poppins**
instead of a browser fallback — an intended visual change. Details + rules:
docs/shared-ui/tailwind-conventions.md §10.

## Sign-out storage clear — partner-portal keys (2026-08-01)

Two keys added to `total-sign-out.ts` with the partner-catalogue work. Both are per-user
breadcrumbs, and one of them is a genuine cross-account hazard rather than a privacy nicety.

**`ta.partnerPortal.handedOff`** → `USER_SESSION_KEYS`. Set immediately before the SSO redirect
into the partner portal, and read by `/my-account/rewards/catalogue` to decide whether an offer
may be **deep-linked** (`portal-offer-url.ts`). A cold `view_smart` link does not trigger SSO —
it bounces to a login page and loses the offer — so the marker is what keeps the catalogue from
dead-ending people.

Left uncleared, the next person to sign in **in the same tab** inherits a "this browser holds a
live portal session" flag that describes *someone else's* session, and every offer link sends
them to a login page. `sessionStorage` narrows the window to one tab, it does not close it:
sign-out and sign-in commonly happen in the same tab, which is exactly the shared-device case.

**`partnerCatalogueSpotlightSeen_`** → `USER_LOCAL_PREFIXES`. The "you haven't seen the partner
catalogue yet" nav dot. Left behind, the next member silently inherits "already seen" and is
never shown a feature they have not seen. Deliberately a **separate prefix** from
`rewardsWidgetSpotlightSeen_` so the two retire independently.

The general rule still holds and is worth restating because this branch nearly broke it: **a new
per-user client-storage key is not finished until it is in one of these lists.** The handoff
marker shipped without it and had to be retro-fitted.

## Echoed identifiers in auth modals are masked from session replay (2026-08-07)

`EmailVerificationModal.tsx` echoes the address being verified *and* greets the user by name
(`Hi {userName}!`). Both now carry `data-cs-mask`, so Contentsquare session replay masks them —
the name is wrapped in its own `<span>` so "Hi" and "!" stay legible. Convention:
[docs/shared-ui/frontend.md](../shared-ui/frontend.md). Mechanism: [docs/tracking](../tracking/).

Auth screens are a recurring source of this: the whole point of a verification or reset screen is
to show the user which identifier is in play, so they render PII as text by design. Login and
registration **fields** need nothing — Contentsquare masks `<input>` content by default, and its
always-on redaction replaces any email address found in the DOM or a URL. It is the *confirmation
copy* that leaks. Any new auth surface that prints an email, phone or name back to the user needs
the attribute.

## A fourth sign-in surface: the 3DS redirect landing (2026-08-27)

`/login`, `LoginModal` and the emailed-code bridge are no longer the only ways a session starts.
[`use3DSRedirectHandler`](../../src/hooks/use3DSRedirectHandler.ts) — mounted on all four
payment-return landings (`/checkout/success`, `/purchase-success`, `/mini-draw-success`,
`/upsell-success`) through
[`PaymentSuccessHandler`](../../src/components/payment/PaymentSuccessHandler.tsx) — now signs the
buyer in when the redirect reports `succeeded`, by POSTing the URL's
`payment_intent_client_secret` to `/api/auth/session-from-payment` and exchanging the returned
token via `signIn("auto-login", { token })`.

**It renders nothing, and that is the point.** The payment has already succeeded, so a sign-in
failure must never appear as a payment error: `establishSessionFromPayment` swallows every outcome,
has no loading state and no error surface. The worst case is the pre-fix behaviour — a success page
seen logged out. It retries only the `202 pending` webhook race, on `[0, 1.5s, 3s, 5s]`.

Consequences for anyone touching these pages:

- **The session can appear mid-render**, a second or two after mount, without any user action.
  Anything on a payment-return landing that branches on `useSession()` must tolerate
  `unauthenticated → authenticated` without a navigation.
- **Do not add a spinner or a toast for it.** Making it visible turns a silent recovery into a
  second thing that can look broken on the most sensitive page in the funnel.

Why it exists — and why the older `auto-login` route could not be reused — is in
[gotchas.md](./gotchas.md); the route's security model is in [api.md](./api.md).

## Verified-contact surfaces — setup step 3 and account settings (2026-08-27)

Both of these are owned by other domains; listed here because they are the only places a member can
satisfy the auth-level requirement in [rules.md](./rules.md) R8, and because they call the two
session-authed routes in [api.md](./api.md).

- **Profile setup step 3** — `Step3EmailVerification.tsx` is renamed
  [`Step3VerifyContact.tsx`](../../src/components/modals/UserSetupModal/Step3VerifyContact.tsx) and
  is now a **channel picker**: Email (the default — free to send) or Mobile, with the mobile tab
  rendered only when a number is on file. Either verified channel satisfies the step, and once one
  does it collapses to a single confirmation. Component detail: [shared-ui/](../shared-ui/).
- **Account settings → Profile** —
  [`ProfileTab.tsx`](../../src/app/(site)/my-account/components/settings/ProfileTab.tsx) replaces
  the single "Email verification" banner with a two-row contact card (email **and** mobile), each
  row carrying its own Verified/Unverified chip and its own Verify button; both buttons open setup
  step 3. The outer banner is amber only when **neither** is verified — matching the requirement,
  which is "at least one", not "both". Surface detail: [dashboard-account/](../dashboard-account/).

`UserData` in [`src/hooks/queries/useUserQueries.ts`](../../src/hooks/queries/useUserQueries.ts)
gained `isMobileVerified?: boolean`. The field was **already on the wire** via
`MY_ACCOUNT_USER_FIELDS`, just undeclared — so no client gate could read it. Optional because the
account payload is the only source; treat absent as unverified.
