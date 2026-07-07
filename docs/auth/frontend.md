# Auth — Frontend

## Pages

- `/login` — login + signup form
- `/reset-password` — token-based reset
- `/oauth-redirect` — OAuth callback handling

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
Storage** (verified), so there's nothing else to drain into the next account. **When you add a new
per-user client-storage key, add it to the clear lists in `total-sign-out.ts`** (or, for a self-contained
feature module, add a `clear*()` of your own and call it from `clearUserScopedClientStorage()`, as
support-chat does).

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
- **Right:** the all-prizes evergreen collage (`/images/background/promo/landing/all-prizes/all-prizes-mobile.webp`, same asset as `/draw-results`) sits behind a `RotatingToolsetCard` that auto-cycles Milwaukee → DeWalt → Makita → Ryobi every ~3.5s. The card surface tints per active brand so Ryobi's lime brand colour never lands on a white surface. Layout is text-left + contained image-right on `lg+`, image-on-top + text-below on smaller widths. Wordmark, hero photo, piece-count pill, and a bottom-right animated badge chip all swap in unison; the headline ("Earn Partner Discounts & Win Tools") and body stay static. Badge content pairs 1:1 with the active brand (Milwaukee→Secure Payment, DeWalt→Premium Partner Discounts, Makita→Exclusive Offers, Ryobi→Drawn Live) and uses the brand's darker accent (`brandTheme.primaryDark`) for label text so it stays readable on the white chip surface in every step.

The "Sign in" h1 and "Please login to continue to your account." sub-copy render inline (baseline-aligned, `flex-wrap`) below `lg` and stack vertically on desktop, so the form header doesn't dominate small viewports.

`RotatingToolsetCard` is defined inline in `src/app/login/page.tsx` because it has a single consumer. It reuses shared brand assets (`POWERSET_IMAGES`, `POWERSET_BRAND_TEXT` from `src/components/sections/promo/prize-selection/constants.ts`) and brand color helpers (`getToolsetBadgeStyle`, `getPackageColorScheme`, `getLandingPageThemeFromSlug`, `hexToRgbaString` from `src/utils/package-colors/packageColorScheme.ts`) — the same module that powers the prize selection carousel, so Ryobi's lime-on-dark-green pill treatment is identical across the site. Auto-rotation respects `prefers-reduced-motion`.
