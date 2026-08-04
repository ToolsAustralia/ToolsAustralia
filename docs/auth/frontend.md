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
