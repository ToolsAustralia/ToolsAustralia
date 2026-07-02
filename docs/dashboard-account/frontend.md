# Dashboard-Account — Frontend

## Pages

`src/app/(site)/my-account/`:
- Profile view / edit
- Subscription management (cancel, upgrade, downgrade)
- Payment methods (list, add, set default, remove)
- Draws history / current entries — the draws tab ([src/app/(site)/my-account/draws/page.tsx](../../src/app/(site)/my-account/draws/page.tsx)) renders the shared, page-portable `WinnersTestimony` "Hear from our winners" section (draws domain — see [docs/draws/frontend.md](../draws/frontend.md#winner-testimony-display--winnerstestimony-the-one-hear-from-our-winners-section-2026-06-11)), replacing the removed `WinnerTestimonySection`.
- Rewards / redeemables wallet
- Metrics / activity

### ProfileTab re-skin (Task 3, 2026-05-19)

`src/app/(site)/my-account/components/settings/ProfileTab.tsx` was re-skinned to the redesigned
look using Task-1 primitives (`Card`, `SectionHeader`, `Field`, `SettingsInput`, `SettingsButton`,
`SettingsBadge` from `./ui/primitives`). Behavior (handlers, fetches, toasts, modal trigger,
`Dropdown`/`BirthdatePicker`/`GiveawayEligibilityNotice`) is unchanged.

Key structural changes:
- **Props**: `ProfileTabProps.user` extended with optional `subscription?: { isActive: boolean }`
  and `enrichedOneTimePackages?: Array<{ isActive: boolean }>` (additive only; no call-site change
  needed — `page.tsx` passes the full `UserData` object).
- **Guest upsell strip**: dark-gradient `Card` shown only when `!subscription.isActive &&
  !enrichedOneTimePackages.some(p => p.isActive)`. "Join a plan" button uses `useRouter` to push
  `?tab=subscription`.
- **Identity cards**: two `Card`-based locked cards (Full name + Email) with `Lock` icon +
  "Contact support to change" microcopy; rendered in `grid sm:grid-cols-2` within a `<section>`.
- **Email verification row**: `ShieldCheck` icon card spanning 2 columns; `SettingsBadge
  tone="success" icon={CheckCircle2}` when verified, `SettingsBadge tone="warning"` + `SettingsButton`
  (calls `requestModal`) when not.
- **Phone field**: static `🇦🇺 +61` prefix adornment via `absolute` div + `SettingsInput` with
  `pl-[5.5rem]`; save/reset via `SettingsButton`.
- **Positive eligibility callout**: emerald card shown when `!isGiveawayIneligible(...)` AND the
  user has already filled in both state and birthdate (`!!state && !!(birthdate || user.birthdate)`),
  preventing premature display on blank profiles.
- **Profession**: stays free-text `SettingsInput` (emoji tiles intentionally deferred).
- No sign-out section (index + sidebar already provide it).

### ProfileTab code-review fixes (2026-05-19)

Three targeted fixes applied to `ProfileTab.tsx` without changing props, handlers, or other files:

1. **Past-due guest-strip bug**: `isGuest` now excludes past-due members by importing
   `hasFailedRenewal` from `@/utils/subscription/subscription-helpers` and computing
   `const hasFailed = hasFailedRenewal(user as unknown as IUser)`. Guard is
   `!hasFailed && !subscription?.isActive && !enrichedOneTimePackages?.some(p => p.isActive)`,
   mirroring the `deriveSettingsUserState` precedence in `settings/page.tsx`.

2. **Premature eligibility banner**: positive "You're eligible to win" callout now only renders
   when `!isIneligible && !!state && !!(birthdate || user.birthdate)`.

3. **Decorative Lock icons labelled**: both `Lock` icon instances in the Full name and Email
   identity cards now carry `aria-hidden` since the surrounding label text already communicates
   the locked state.

### Settings page (`settings/page.tsx`) — redesign 2026-05-19

The settings page was redesigned with a status-aware index and `?tab=` URL sync:

- **`SettingsSection` type** and **`SETTINGS_TABS`** constant are owned by
  `src/app/(site)/my-account/components/settings/SettingsSidebar.tsx` and re-exported from there.
- **`?tab=` URL sync**: `activeSection` is derived from `searchParams.get("tab")` as single
  source of truth. `setActiveTab(id)` pushes `?tab=<id>`; back from tab → index push; back from
  index → `router.back()`.
- **`deriveSettingsUserState`**: pure inline function mapping `user + hasFailed + membershipTier`
  to `{ state: "member"|"past_due"|"guest", tierLabel?, tierPrice? }`.
- **Index view**: identity card (initials, email, `SettingsBadge`), past-due hero (only when
  `hasFailed`), guest CTA (only when `state==="guest"`), 2-col tab preview cards with real
  summaries, sign-out card, member-since footer.
- **Tab view**: desktop `grid grid-cols-[260px_1fr]` with `SettingsSidebar`; mobile sticky
  segmented strip via `lg:hidden` / `hidden lg:block` — CSS-only, no JS viewport detection.
- All hooks, handlers, and tab component props are preserved unchanged.

### Settings Redesign (2026-05-19)

All work is contained in `src/app/(site)/my-account/components/settings/`.

#### New shared primitives — `ui/primitives.tsx`

Presentational-only components (`Card`, `SectionHeader`, `Field`, `SettingsInput`, `LockedField`,
`SettingsButton`, `SettingsBadge`). Built with `cn()` + Tailwind; support light and dark modes.
No business logic, no fetches.

#### New `SettingsSidebar.tsx`

Exports `SettingsSection` (type), `SETTINGS_TABS` (ordered array of tab definitions), and
`VALID_TAB_IDS` (string union for URL-param validation). Renders a desktop vertical nav rail and a
mobile 4-column button strip (`lg:hidden` / `hidden lg:block` — CSS-only, no JS viewport state).

#### Tailwind tokens added to `tailwind.config.ts`

- `shadow-lift` / `shadow-lift-dark` — card elevation shadows keyed to light/dark.
- `animate-pulse-ring` — subtle ring pulse used on status badges.

#### `settings/page.tsx` — status-aware redesigned index

- **`deriveSettingsUserState`**: pure inline function → `{ state: "member"|"past_due"|"guest", tierLabel?, tierPrice? }`.
- **Index view**: identity card (initials, email, `SettingsBadge`), past-due hero (only when `hasFailed`), guest CTA (only when `state==="guest"`), 2-col preview cards with real summaries, sign-out card, member-since footer.
- **`?tab=` URL sync**: `searchParams.get("tab")` is the single source of truth for `activeSection`. Navigation uses `router.push(?tab=<id>, { scroll: false })`. Browser back returns to index correctly. Deep links work.
- **Responsive layout**: `grid grid-cols-[260px_1fr]` on desktop with `SettingsSidebar`; mobile sticky segmented strip via CSS class toggling (`hidden lg:block` / `lg:hidden`).

#### `ProfileTab.tsx` — re-skin (behavior preserved)

Uses all primitives. Props extended additive-only with optional `subscription` + `enrichedOneTimePackages`.
Guest upsell strip excluded for past-due users (`hasFailedRenewal` check). Positive eligibility
callout only shown when state and birthdate are both filled. Decorative `Lock` icons carry `aria-hidden`.
No sign-out section (index + sidebar already provide it). Profession stays free-text (emoji tiles deferred).

#### `PasswordTab.tsx` — re-skin (behavior preserved)

Full `primitives`-based re-skin. Password security-score dial and security checklist omitted (no backing data).
`htmlFor`/`id` a11y wiring applied to all password fields.

> **Set-password mode (2026-05-19) — re-applied after a branch reset wiped it once.**
> `PasswordTab` takes `hasPassword?: boolean` (passed by `settings/page.tsx` as
> `hasPassword={user.hasPassword}`, sourced from `GET /api/users/[id]`). A derived
> `isPasswordless = hasPassword === false` (undefined → treated as has-password, the safe default)
> switches the tab to **set-password mode** for OAuth / passwordless accounts:
> the "Current password" `Field` is hidden, header → "Set a password", button → "Set password",
> and the `POST /api/user/change-password` body omits `currentPassword`. The security-score dial
> and checklist are untouched (they only *read* `hasPassword`). Matching server behaviour:
> [auth/api.md → POST /api/user/change-password](../auth/api.md). If a passwordless user again
> sees `"Password changes not available for this account"`, both this UI branch **and** the
> route's `isFirstTimeSet` branch were reverted.

### Settings Redesign Phase 2 (2026-05-19)

Resolves the bulk of the earlier flag list. **Frontend-only; no backend/hook/service/model/endpoint change.**

**Phase A — polish:**
- Removed the index "Member since …" footer.
- Renamed the tab **Profile → "Account details"** (sidebar `label`, `shortLabel: "Account"`; tab `id` stays `profile` so `?tab=profile` deep links/`VALID_TAB_IDS` are unaffected). Disambiguates from the bottom-nav "Profile" (=/my-account).
- Added top spacing (`pt-6 sm:pt-8 lg:pt-0`) between the mobile sticky tab strip and tab content.
- **Password security score** is now implemented (`PasswordTab.tsx`) as a **pure, deterministic, frontend-only** `computeSecurityScore({hasPassword,isEmailVerified,newPasswordStrength})`: password-set 35 + email-verified 35 + new-password-strength bonus up to 30 (live via the existing `calculatePasswordStrength`), clamped to 100; label Strong/Decent/At risk. Renders a `ScoreDial` SVG gauge + a truthful checklist (password set / email verified / 2FA "Coming soon" / strong new password). `isEmailVerified`/`hasPassword` passed additively from `page.tsx` (real `UserData` fields). No server/fabricated number.

**Phase B — index payment brand:** `settings/page.tsx` now calls the existing `useSavedPaymentMethods()` and shows the default card's real `Brand •••• last4` (+ "Default"), gracefully falling back to count/loading text. No new endpoint.

**Phase C/D — Subscription & Payment tab merge (Claude design):** A new opt-in prop **`settingsRedesign?: boolean`** on `SubscriptionManagementModal` and `PaymentMethodsTab`, set **only** by the settings `SubscriptionTab.tsx` / `PaymentTab.tsx` wrappers (alongside `renderAsPanel`). When set, the panel body renders new presentational components:
- `src/components/modals/SubscriptionManagementModal/SettingsRedesignSubscription.tsx`
- `src/components/modals/PaymentMethodsTab/SettingsRedesignPayment.tsx`

Both are **presentational only** — every value/handler is passed from the unchanged orchestrator. They reuse the verified logic sub-components (`CurrentBenefitsCard`/`UpgradeList`/`DowngradeList`/`CancelResumeRow`/`PastDueAlert`/`PendingChangeBanner`/empty states for subscription; the Stripe `<Elements>`+`AddPaymentForm` add-form and delete `ConfirmationModal` stay in `PaymentMethodsTab/index.tsx`, the `stripePromise` singleton is never re-instantiated) wrapped in the Claude tier-themed plan hero / wallet credit-card design. The 5 subscription child modals and the payment confirm-modal/add-form were hoisted so they render once in **both** branches. **Modal-mode callers (`MembershipStatus`) and the `SettingsModal` panel embed never set `settingsRedesign` → byte-behavior-identical** (verified by dedicated Opus reviews of Phase C & D).

#### Flagged / deferred design elements (still NOT implemented — follow-ups)

1. **Subscription `AccumulationChart`** (6-month entry-history bars) — no real entry-history data; the codebase deliberately never fabricates entry counts. Omitted.
2. **Subscription synthetic future billing cycles** — only the real next-billing date is shown; the design's 3 projected cycles are omitted (would be synthetic).
3. **SMS 2FA** — backend not implemented; renders a "Coming soon" placeholder only.
4. **Pixel-internal re-skin of `CurrentBenefitsCard`/`UpgradeList`/`DowngradeList`** — these are logic-entangled (entry/discount math). The Phase-2 subscription view applies the Claude design at the section/hero level and **reuses these cards unchanged** to guarantee verbatim math; re-skinning their internals is a safe future follow-up, not a defect.
5. **`htmlFor`/`id` a11y wiring on Profile phone/profession `Field`s** — Password tab has full wiring; Profile is a small follow-up for full consistency.

---

## Hooks

See [architecture.md](./architecture.md#hooks) — `useDashboardEntryDisplay`, `useDashboardLandingOrchestration`.

## LandingPageTrigger

[src/app/(site)/components/LandingPageTrigger.tsx](../../src/app/(site)/components/LandingPageTrigger.tsx) — coordinates "first-time" landing page experiences. Hooks into [metrics-analytics](../metrics-analytics/) helpers (`dashboard-landing-session`, `dashboard-entry-hold`).

## State conventions

- All data via TanStack Query from feature-domain API
- No local state for things that should be global

## className conventions (2026-05-08)

Dashboard/account components use `cn()` from `@/utils/cn` for conditional class composition. The `sweep-classname-template-literals` codemod (Plan 5 Phase 2) converted template-literal `className={`...`}` patterns to `className={cn(...)}`. Use `cn()` rather than template literals when adding new conditional classes.

## Interaction smoothness (Phase 1, 2026-05-09)

`MajorDrawHeaderStrip` and `MajorDrawOverview` (in [src/app/(site)/my-account/components/](../../src/app/(site)/my-account/components/)) are now leaf-isolated via [`<CountdownLeaf>`](../../src/components/ui/CountdownLeaf.tsx) / [`useLeafTimer`](../../src/hooks/useLeafTimer.ts) — the surrounding account dashboard does not re-render on every tick of the embedded countdown. See [shared-ui/patterns.md](../shared-ui/patterns.md#site-wide-interaction-smoothness--phase-1-2026-05-09) for the pattern.

## Resubscribe carry-over sub-line on `MajorDrawOverview` (Phase 3, 2026-05-20 — REVERTED 2026-05-21)

> **Deprecated / reverted 2026-05-21 (Phase 5 of the tier-picker polish round).** The activity-tab sub-line ("Includes resubscribe + carry-over from previous membership…") was removed from [`MajorDrawOverview`](../../src/app/(site)/my-account/components/MajorDrawOverview.tsx) along with its `activationDate` prop, the `lastResubscribedAt` entry on the nested `userSubscription` prop type, and the `drawIncludesResubscribe` derivation. `src/app/(site)/my-account/page.tsx` no longer forwards `activationDate` or `lastResubscribedAt` to the component. The success-page "Welcome back!" banner (10-minute `wasRecentResubscribe` window keyed off `User.subscription.lastResubscribedAt`) remains the canonical carry-over surface for returning users — the schema field and the resubscribe write site in `/api/stripe/create-subscription-existing-user` are unchanged. Reference spec: `docs/superpowers/specs/2026-05-21-dashboard-tier-picker-polish-design.md` §3.

## Empty-state nudge animations on `MajorDrawOverview` (Phase 4, 2026-05-21)

The Membership and One-time entry cards on [`MajorDrawOverview`](../../src/app/(site)/my-account/components/MajorDrawOverview.tsx) now animate when empty, inviting the user to click. Once clicked in a given tab, the nudge stops for the rest of that tab session.

### New helper — [`src/utils/dashboard-empty-card-nudge.ts`](../../src/utils/dashboard-empty-card-nudge.ts)

Tiny `sessionStorage`-backed gate. Exports:

- `type NudgeCardType = "membership" | "onetime"`
- `hasClickedNudge(cardType: NudgeCardType): boolean`
- `markNudgeClicked(cardType: NudgeCardType): void`

Storage key shape: `ta:dashboard-card-nudge-clicked:v1:<cardType>` (one key per card). Per-tab semantics fall out of `sessionStorage`: a fresh tab re-shows the nudge, a refresh within the same tab keeps the cleared state. **Fails open**: both functions are wrapped in `try { … } catch {}` and additionally guard `typeof window !== "undefined"`, so SSR and private-browsing edge cases never throw — `hasClickedNudge` returns `false` and `markNudgeClicked` no-ops. Worst case the animation always shows.

### New keyframes + utility classes in [`src/app/globals.css`](../../src/app/globals.css)

Two animations appended:

- `@keyframes ta-nudge-pulse` → `.ta-nudge-pulse` (3s `ease-in-out` infinite `box-shadow` glow tinted to the tier-red Membership card)
- `@keyframes ta-nudge-shimmer` → `.ta-nudge-shimmer` (4s `ease-in-out` infinite background-position sweep applied via `::before` overlay; container gets `position: relative; overflow: hidden;`)

Both utility classes are wrapped in `@media (prefers-reduced-motion: no-preference)`, so users with the OS-level reduced-motion preference see fully static cards — there is no JS capability check; the OS signal is the only guard.

### `MajorDrawOverview` wiring

`MajorDrawOverview.tsx` imports the helper and tracks two local React states (`membershipNudge`, `oneTimeNudge`) seeded from `hasClickedNudge` in an effect that re-runs when the corresponding empty flag flips.

- **Membership card** (previously a non-clickable `<div>` with no `onClick`): when `!hasActiveSubscription && displayMembershipEntries === 0` AND `!hasClickedNudge("membership")`, the card renders as a `<button type="button">` with the `ta-nudge-pulse` class. Clicking it calls `markNudgeClicked("membership")` and then `router.push("/my-account/settings?tab=subscription")`. Otherwise it falls back to the original `<div>` markup — no animation, no click target, byte-identical to pre-Phase-4 behaviour.
- **One-time card** (already an existing `<button>` with `onOneTimeCardClick`): when `oneTimeEntries === 0` AND `!hasClickedNudge("onetime")`, the button gains the `ta-nudge-shimmer` class and its `onClick` is extended to first call `markNudgeClicked("onetime")` and then invoke the existing `onOneTimeCardClick?.()`. The button shape, focus ring, and downstream handler are unchanged.

No new props, no new API, no service or model change — the nudge is purely a client-side presentational layer on top of the existing empty-state detection. Reference spec: `docs/superpowers/specs/2026-05-21-dashboard-tier-picker-polish-design.md` §4.

## Member-badge scoping fixes (2026-05-21)

Two related fixes ensure the "Member" label is **subscription-only** — a user holding only a one-time pack is no longer surfaced as a Member.

### `settings/page.tsx` — `deriveSettingsUserState`

[`settings/page.tsx`](../../src/app/(site)/my-account/settings/page.tsx) `deriveSettingsUserState` no longer returns `state: "member"` for one-time-pack-only holders. The fallthrough branch (when `!hasFailed` and `!user.subscription?.isActive`) now always returns `{ state: "guest" }`, regardless of any active one-time pack. Active subscribers (`user.subscription?.isActive === true`) and `past_due` users are unchanged. User-visible effect: the identity-card badge on the settings index shows "Guest" for one-time-only users instead of "Member", and the guest CTA card appears.

### `my-account/page.tsx` — Membership-badge source gating

[`my-account/page.tsx`](../../src/app/(site)/my-account/page.tsx) now scopes `membershipPackage` and `showMembershipBadge` to `activePackage.source === "subscription"`:

```ts
const membershipPackage =
  activePackage?.source === "subscription" ? activePackage.packageData : null;
const showMembershipBadge = Boolean(
  activePackage?.isActive && activePackage.source === "subscription" && membershipPackage,
);
```

Previously `getActivePackage` returned the one-time pack as the "effective" package (with `packageData` set, `source: "one-time"`) for one-time-only users, which caused the pack to render under the Membership badge slot. Now the Membership badge only shows when a real subscription is active; the separate One-time badge continues to surface owned one-time packs independently. No API or hook change.

## Settings page back-button hard-route (Phase 5, 2026-05-21)

[`settings/page.tsx`](../../src/app/(site)/my-account/settings/page.tsx) passes an explicit `onBackClick={() => router.push("/my-account")}` to `DashboardHeader` (alongside the existing `showBackButton` flag). The chevron now always routes to `/my-account` rather than relying on browser-history previous or stepping through the settings index from a sub-tab. The previously-defined `handleBackClick` callback that routed sub-tabs back to the settings index has been removed — `?tab=` deep links still work via `searchParams`, but the back button itself is a single hard route.

This mirrors the user's intent: "clicking the back button should navigate him to /my-account, not in the previous page." Reference spec: `docs/superpowers/specs/2026-05-21-dashboard-tier-picker-polish-design.md` §6.

## Mobile-UX hardening (2026-06-09)

Small frontend-only batch; no backend/hook/service/model change.

- **BottomNav safe-area**: [`components/BottomNav.tsx`](../../src/app/(site)/my-account/components/BottomNav.tsx) `<nav>` gained `pb-[env(safe-area-inset-bottom)]` so the fixed mobile bottom nav clears the iOS home indicator (the app now sets `viewport-fit=cover` globally).
- **iOS focus-zoom guard**: the `SettingsInput` base (`inputBase` in [`settings/ui/primitives.tsx`](../../src/app/(site)/my-account/components/settings/ui/primitives.tsx)) and the local `PWInput` in [`settings/PasswordTab.tsx`](../../src/app/(site)/my-account/components/settings/PasswordTab.tsx) moved from `text-sm` → `text-base` (16px). iOS Safari auto-zooms on focus of inputs under 16px; 16px disables that. Visual-only on desktop.
- **Lazy-loaded dashboard modals**: [`page.tsx`](../../src/app/(site)/my-account/page.tsx) now wraps `ReferFriendModal`, `PastDrawsModal`, and `PackageDetailModal` in `dynamic(() => import(...), { ssr: false })`, joining the already-lazy `MembershipModal` — they stay out of the initial dashboard bundle and only mount when opened. `PackageDetailModal`'s exported types (`PackageDetailModalPackageData`, `SubscriptionAccumulationData`) are still pulled in via `import type` so the dynamic import does not drag runtime code.

## Dashboard revamp — Spec 1: Foundation shell + Home (2026-07-02)

Ports the Claude member-dashboard prototype onto the home. Spec 1 of a sequenced set
(Rewards / Draws / Membership / Settings+overlays follow). Design + plan:
`docs/superpowers/specs/2026-07-02-user-dashboard-revamp-foundation-home-design.md`,
`docs/superpowers/plans/2026-07-02-user-dashboard-revamp-foundation-home.md`.

### Responsive shell — [`layout.tsx`](../../src/app/(site)/my-account/layout.tsx)
- `lg:` two-pane: desktop left sidebar [`DeskNav`](../../src/app/(site)/my-account/components/DeskNav.tsx) (236px, logo + nav + footer monogram/name/email + gear→Settings) + a `max-w-[1180px]` content frame; mobile keeps the bottom nav. Retains the `data-account-layout` site-chrome opt-out. Sidebar identity is fetched via cached `useMyAccountData`; tier hex derived from the active package for the footer monogram.
- **Nav model** now lives in [`BottomNav.tsx`](../../src/app/(site)/my-account/components/BottomNav.tsx) as the shared `DASHBOARD_NAV` (+ `isNavItemActive`): **Dashboard / Rewards (→`benefits`) / Draws (raised center FAB) / Membership / Support**. Settings is reached via the gear (hero + sidebar footer), not a nav slot. `DeskNav` consumes the same model.

### State hook — [`useDashboardState`](../../src/hooks/useDashboardState.ts)
Single source of home view-state. Resolves the account state via the pure
[`deriveDashboardAccountState`](../../src/utils/dashboard/derive-dashboard-account-state.ts)
(precedence **pastdue > active > onetime > none**, traced against `subscription.isActive`,
`hasFailedRenewal`, `getActivePackage().source`), plus tier + [`getDashboardStateTheme`](../../src/utils/dashboard/dashboard-state-theme.ts)
(hero gradient/ink/accent), promo multiplier, entry buckets (`useDashboardEntryDisplay`),
partner access %/expiry, and streak months — all from existing cached queries. Section
components stay dumb and consume this. Pure logic is `tsx`-tested
(`test:dashboard-state-theme`, `test:dashboard-account-state`).

### Sections — `src/components/sections/dashboard/`
`DashboardHero`, `EntryWallet` (entries hero — total/split-bar/countdown, extracted from the
`MajorDrawOverview` concept), `DashboardPromoBanner` (compact multiplier card — new file, the
marketing `PromoBanner`'s scroll-morphing layout is irreconcilable with a card), `LoyaltyStreak`,
`QuickActionsGrid`, `PartnerPreview`, `DashboardGuestPanel`. Composed by
[`page.tsx`](../../src/app/(site)/my-account/page.tsx), which **keeps all existing modal
orchestration inline verbatim** (setup/upsell/subscription-explainer/refer/past-draws/
package-detail + `openMembershipModal` listener) — visual layer only was recomposed.

### Coming-soon switches — [`src/config/dashboardFeatures.ts`](../../src/config/dashboardFeatures.ts)
`DASHBOARD_FEATURES` off-by-default map (`cobberSupport`, `milestoneProgress`, `personalWins`,
`orderHistory`). Fully-built UI mounts behind these; a future session flips one to surface it.
`LoyaltyStreak`'s milestone-unlock line and `QuickActionsGrid`'s Vouchers/Milestones tiles are gated here.

### Flagged for deletion (NOT deleted — user review pending)
Mirrored in the `page.tsx` header comment: dead `MembershipStatus.tsx`, `ActivePrizeDraws.tsx`,
`RecentOrders.tsx`, empty `EntryWallet.tsx` stub, stale `components/index.ts` re-exports;
superseded-but-kept `DashboardHeader`/`CoverBanner`/`UserInfoBar`/`QuickActions`/`SocialLinksSection`
(still used by sub-pages until their specs); `MajorDrawOverview` (wallet extracted; countdown role → Draws sub-project).

## Dashboard revamp — Spec 2: Rewards (2026-07-02)

Rebuilds the Rewards destination (`/my-account/benefits`, nav-labelled "Rewards") to
**Partners FIRST → Claimables → Milestones**, state-aware. Spec:
`docs/superpowers/specs/2026-07-02-dashboard-rewards-design.md`.

- **[`benefits/page.tsx`](../../src/app/(site)/my-account/benefits/page.tsx)** — rewritten to a thin
  composer fed by `useDashboardState`: `DashboardPageHeader` + `RewardsPartnerCard` + (non-guest)
  `RewardsClaimables` + `RewardsMilestones`. Keeps the login redirect + `MembershipModal`. Drops the
  ad-hoc red hero (now `DashboardPageHeader`). Flagged-for-deletion (kept, shared): `PartnerDiscountQueue`, `UnlockDiscounts`.
- **[`DashboardPageHeader`](../../src/app/(site)/my-account/components/DashboardPageHeader.tsx)** —
  shared state-recolored page-header band (gradient + gold seam + title/sub + action icon + optional
  back chevron), the prototype's `PageHeader`. Reused by Rewards / Membership / Settings sub-pages;
  resolves the old fixed-`DashboardHeader`-vs-sidebar conflict.
- **Sections `src/components/sections/rewards/`**: `RewardsPartnerCard` (leads — `AccessRing` +
  `usePartnerDiscountSso` portal + `PARTNER_BRAND_OFFERS` grid; state CTAs), `RewardsClaimables`
  (`useRedeemablesWallet` claimable/past + `useRedeemableRedemption`; **paused-safe** — the rewards
  program 503 renders a neutral "temporarily unavailable" state, never a crash), `RewardsMilestones`
  (**visual milestone progress track** — real continuous-membership `months` drive the current
  position + milestone nodes at 3mo/6mo and a "N months to your next +50/+250 free entries" line;
  milestone amounts are documented constants, never fabricated. Superseded the earlier
  `milestoneProgress`-gated text teaser now that member-since `months` is a confirmed real read).

### Home + hero refinements (2026-07-02)

- **`DashboardHero`** now takes `tierKey` / `profileComplete` / `onCompleteProfile`. Active members'
  tier chip shows the real **tier package icon** (`getPackageIcon(\`${tierKey}-subscription\`)`), not a
  generic crown. The member "Reward portal" button is a **chip-sized premium gold** pill (matches the
  tier chip) and **triggers the partner-discount SSO** (`usePartnerDiscountSso().mutate()` → MyRewards
  portal via `POST /api/partner-discount/sso`), NOT a route to `/my-account/benefits`. When
  `profileComplete === false` a high-contrast
  **"Complete your profile"** nudge renders in the hero (→ reopens the `user-setup` modal via
  `requestModal`). `profileComplete` is derived in the home page as
  `Boolean(user.profileSetupCompleted && user.birthdate)` (mirrors the setup-modal trigger).
- **`RewardsFloatingWidget` removed from the home** — the sidebar/bottom-nav **Rewards** item
  (`DASHBOARD_NAV` → `/my-account/benefits`) is now the single entry point to claimable rewards;
  the `QuickActionsGrid` "Rewards" tile still shows the claimable-count badge.

### Settings → Account settings + subscription/payment overlays (2026-07-02)

The tabbed Settings destination (`?tab=account|subscription|password|payment` + `SettingsSidebar`)
was collapsed into the Claude-design IA:

- **`settings/page.tsx`** is now ONE consolidated **Account settings** page — identity card,
  `ProfileTab` (email-verify banner + personal details), an Appearance card (`ThemePicker`,
  Light/Dark only), `PasswordTab`, and Sign out. No `?tab=` routing, no sidebar.
  **`SettingsSidebar.tsx` was deleted** (fully orphaned).
- **`ProfileTab` + `PasswordTab` rebuilt to the clean Claude design** (2026-07-02): `ProfileTab` is
  now email-verify banner + Mobile / DOB / Profession (select) / State (select) with a **single
  "Save changes"** (one POST to `/api/user/update-profile`) instead of two per-section saves and the
  emoji/state tile grids; a compact giveaway-eligibility note shows only when ineligible. `PasswordTab`
  is a minimal change/set-password card + strength meter + "Email me a reset link" — the security-score
  dial, 2FA/SMS placeholder and requirements side-panel were dropped. Same endpoints
  (`/api/user/change-password`, `/api/auth/request-password-reset`). Profession/State use the styled
  `SelectMenu` dropdown (not native `<select>`); the Appearance `ThemePicker` is a segmented-pill
  toggle; the identity card shows a **tier badge** (package icon + `tierLabel`) for members instead
  of a generic "Member" chip. (System theme stays omitted — the theme store is light/dark only.)
- **Subscription + payment are overlay sheets**, not pages: `components/sheets/ManageSheet.tsx`
  (`sheet === "manage"`) and `PaymentSheet.tsx` (`sheet === "payment"`), mounted in `layout.tsx`
  next to `SupportSheet`, bottom-sheet on mobile / centered popup on desktop via `SheetShell`.
  - `PaymentSheet` reuses `PaymentTab` (PaymentMethodsTab `settingsRedesign`) — its
    `SettingsRedesignPayment` panel + `AddPaymentForm` were restyled to the clean prototype (see
    shared-ui/frontend.md). Card Stripe wiring unchanged.
  - `ManageSheet` is now a **clean custom body** (plan summary → Update payment method → Change tier
    → Cancel membership; past-due "Update payment to resume") — NOT the heavy `SubscriptionTab`
    panel. It **delegates the money-path flows** rather than re-implementing them (the change-tier
    upgrade/downgrade Stripe wiring can't be safely re-implemented — zero-trial-invoice / entries-grant
    footguns, see docs/subscription): **update-payment** → `openSheet("payment")`; **cancel** →
    self-contained `CancellationFlowModal` (`onResolvePayment` → past-due modal); **past-due resume**
    → self-contained `RenewalFailedModal` (opening the payment sheet alone does NOT retry the
    invoice); **change-tier** → closes the sheet and routes to the **Membership page tier list**
    ("See all tiers below"). All delegated modals portal at z-80/90/10000, above the sheet's z-60.
    `SubscriptionTab.tsx` is now orphaned (kept as the documented type-only-import example).
- **Tier change (2026-07-02):** on the Membership page, a member tapping a **different** tier in
  `MembershipTierList` fires `onChangeTier(plan.name)`, which mounts `SubscriptionManagementModal`
  (modal mode) with **`autoSelectPlanName`** — a new opt-in prop: once benefits load, an effect finds
  that tier in `availableUpgrades`/`availableDowngrades` (matched by name) and calls the SAME
  `setSelectedUpgrade`+`setShowUpgradeConfirm` (or downgrade) setters the in-modal click uses, so it
  jumps straight to the confirm. When `autoSelectPlanName` is set the orchestrator renders in
  **confirm-only mode** — it returns just the confirm modal (`return <>{childModals}</>`), skipping the
  redundant "Manage Subscription" chrome/body (the Membership page already shows the plan + tier list);
  closing the confirm calls `onClose`. Unmatched taps close (no stranded invisible modal). The prop is opt-in,
  so all other `SubscriptionManagementModal` callers are byte-identical. Tapping the **current** tier
  → `onManagePlan` (opens the Manage sheet).
- **Openers** (all via `useDashboardSheetStore.openSheet`): `MembershipCurrentPlan` Manage/Payment
  rows, `MembershipTierList` member tap, the hero/RewardsPartnerCard past-due "Update payment", all
  → `manage`; the payment row → `payment`. The global `Header` "Manage" (`/my-account?open=subscription`)
  is honoured by a new `?open=subscription|payment` handler on the home page that opens the sheet and
  cleans the URL. `ProfileTab`'s guest "Join a plan" now routes to `/my-account/membership`. The
  membership page passes the default-card label (`useSavedPaymentMethods`) to
  `MembershipCurrentPlan` as `paymentLabel` for its "Payment method / Visa •••• 4827 → Edit" row.
- **Sidebar sticky fix:** `overflow-x-hidden` was removed from the `my-account/layout.tsx` flex
  parent (it computed `overflow-y: auto`, becoming the sticky scroll-container and breaking
  `DeskNav`'s `sticky top-0`); the horizontal clip moved to `<main>`.
- **Support sheet form (2026-07-02):** the embedded site `ContactForm` (its own duplicate title +
  underline inputs + `MetallicButton` looked off in the sheet) was replaced by a compact
  `components/sheets/SupportContactForm.tsx` — clean bordered inputs, pill subject selector, red
  submit — same `/api/contact-submissions` POST + pixel `trackLead`. The site `/contact` `ContactForm`
  is untouched.
- **Total sign-out (2026-07-02, resolved):** the Account-settings Sign-out (and the Header /
  AdminSidebar / forced-logout paths) now call `totalSignOut()`
  ([src/utils/auth/total-sign-out.ts](../../src/utils/auth/total-sign-out.ts)), which clears the
  user-scoped portion of client storage before ending the session (keeps device/attribution prefs).
  See [auth/frontend.md](../auth/frontend.md#total-sign-out-2026-07-02).

## Dashboard revamp — Spec 3: Draws (2026-07-02)

Rebuilds `/my-account/draws` to a **Major / Mini `Seg` toggle**. Spec:
`docs/superpowers/specs/2026-07-02-dashboard-draws-design.md`.

- **[`draws/page.tsx`](../../src/app/(site)/my-account/draws/page.tsx)** — thin composer fed by
  `useDashboardState`: `DashboardPageHeader` + `Seg` → **major** (`DrawsMajorHero` → reused
  `EntryWallet` → `DashboardPromoBanner` → "Get more entries" → `DrawHowItWorks` → `DrawWinners`) or
  **mini** (`DrawsMini`). Flagged-for-deletion (kept, shared): `PrizeShowcase`, `MembershipSection`,
  `LatestWinnerHero`, `WinnersTestimony`, `MajorDrawHeaderStrip`.
  > _Update 2026-07-02:_ `DrawsMajorHero` dropped its "Live · {draw} · Drawn 8:30 PM AEST" status row
  > (redundant with the Draws toggle bar) and its `drawName`/`drawStatus` props; the draws page
  > dropped the entries card's `-mt-[34px]` overlap (→ `pt-4`) that had covered "View this promotion"
  > with "Your entries". The draws page also now renders `DashboardPromoBanner` after the entries card
  > (get-more-entries promo energy — multiplier / special-promo / 50%-off badges + countdown), since
  > it has no separate promo banner otherwise; and `DrawsMini` ranks the top 8 mini draws by fill %.

- **Sections `src/components/sections/draws/`**: `DrawsMajorHero` (prize picker setup vs $10k cash
  via `usePrizeCatalog` + `resolvePrize("cash-prize")`, live countdown, "View this promotion" →
  `/promotions`), `DrawHowItWorks` (static 3 steps), `DrawWinners` (`useMajorDrawWinners`, monogram
  fallback, state-not-suburb — replaces the old raw `fetch("/api/winners/all")`), `DrawsMini`
  (`useMiniDraws` + embedded `miniDrawParticipation`, `MiniDrawCard` grid — dead per-mini-draw entry
  hooks intentionally NOT wired).
- Reuses `EntryWallet` for the entries breakdown (DRY with the home).

## Dashboard revamp — Spec 4: Membership (2026-07-02)

Rebuilds `/my-account/membership` to current-plan + tier list + one-time packs + manage. Spec:
`docs/superpowers/specs/2026-07-02-dashboard-membership-design.md`.

- **[`membership/page.tsx`](../../src/app/(site)/my-account/membership/page.tsx)** — thin composer:
  `DashboardPageHeader` + `MembershipCurrentPlan` + **reused `MembershipTierChooser`** (public
  `/membership` conversion section, driven by `useMembershipCardCta` — the verified upgrade/downgrade/
  current/past-due/guest CTA state machine + promo-multiplied entries) + `MembershipModal`. Replaces
  the old marketing composition.
- **[`MembershipCurrentPlan`](../../src/components/sections/account-membership/MembershipCurrentPlan.tsx)**
  — state-aware plan summary (tier gradient, stats, renew/paused/none) + Manage/Payment links to the
  Settings panels. Full cancel/change flow stays in the Settings subscription panel (no duplicate).
- **🚩 `MembershipPackagesChart` is now fully orphaned** (this page was its last user) — flagged for
  deletion in the page header; kept for user review.

## Dashboard revamp — Spec 5: Settings + Support (2026-07-02)

Closes the Settings gaps + finishes shell consistency. Spec:
`docs/superpowers/specs/2026-07-02-dashboard-settings-overlays-design.md`.

- **Appearance / [`ThemePicker`](../../src/app/(site)/my-account/components/settings/ThemePicker.tsx)** —
  Light/Dark segmented control (`useTheme` → `setTheme`, persists to `localStorage["ta-theme"]`),
  added as an Appearance card on the Settings index. **No System mode** (deliberately dropped).
- **[`settings/page.tsx`](../../src/app/(site)/my-account/settings/page.tsx)** — swapped the fixed
  `DashboardHeader` for `DashboardPageHeader` (state-recolored, in-flow; removes the last fixed-bar
  vs desktop-sidebar overlap); loading/error guards no longer render a header. `DashboardPageHeader`
  gained an optional `onBack` so a tab returns to the index (index → dashboard).
- **[`support/page.tsx`](../../src/app/(site)/my-account/support/page.tsx)** — rewritten to
  `DashboardPageHeader` + Ask-Cobber card (coming-soon, gated by `cobberSupport`) + Email us + FAQ
  accordion + kept `ContactForm`. No WhatsApp/phone. Responsive sheet-shell delivery deferred (route).
- **🚩 Newly orphaned → flagged for deletion:** `DashboardHeader.tsx` (Settings was its last user),
  `MajorDrawHeaderStrip.tsx` (old draws only).
- **Flagged to verify (not modified — money path):** billing-history tab inside the shared
  `SubscriptionManagementModal` / `PaymentMethodsTab` — the design removes billing history.

## Dashboard home — pixel-fidelity rework (2026-07-02)

Reworked the home to match the Claude prototype (`ConceptHub` mobile + `ConceptHubDesktop` desktop) 1:1:

- **Flush layout:** `layout.tsx` no longer centers content in a `max-w` wrapper — the content sits flush against the desktop sidebar (prototype behavior).
- **DashboardHero:** responsive — desktop is a single row (monogram + greeting + **inline** tier chip + `AccessRing` + Reward-portal, **no gear**); mobile is two rows (+ gear). Keeps our existing `AccessRing` (preferred over the prototype's).
- **EntryWallet:** desktop 2-column card (number + split bar + legend │ divider │ "Draw closes in" + `CDBox` cells); mobile stacks (countdown below a hairline). Headline total = membership + one-time (never contradicts the legend). Removed the projected/resolve extras (prototype shows the plain total + a separate ribbon).
- **DashboardAlertRibbon (new):** past-due (amber) / one-time (teal) ribbon above the wallet.
- **QuickActionsGrid + `QuickTile`:** glossy `linear-gradient(158deg,…)` chips with the prototype `CT` palette ([tile-colors.ts](../../src/utils/dashboard/tile-colors.ts)); mobile 4-col/8 tiles (adds Partners+Support), desktop 3-col/6 tiles.
- **PartnerPreview:** access ring + prototype `DealRow` (letter badge · name · **category** · offer). Added a canonical `category` to `PARTNER_BRAND_OFFERS`.
- **DashboardPromoBanner:** "50% off one-time packages" restored — it is the **real** member-only **Additional packages** benefit (50% of the one-time price; `hasAdditionalPackageAccess`). Gated on `hasAdditionalAccess`; palette escalates with the live multiplier + "Ends in HH:MM:SS" (next AEST midnight).

### Access-aware multiplier (important logic fix)
`useDashboardState` now resolves the multiplier per the canonical rule (mirrors `PromoBanner`
`effectivePromoTypeForBanner` + `getEffectivePromoType`): **active subscription → membership-packages
multiplier** (members buy Additional packs); **everyone else → one-time-packages multiplier**. It also
exposes `hasAdditionalAccess` (active sub OR current-draw entries) which gates the real "50% off"
copy. Previously it used the one-time multiplier for everyone — wrong for members.

> **Verify before launch:** the loyalty-streak "+250 free entries at 6 months" figure is the design's
> stated milestone — confirm the exact reward against the real `MilestoneReward` config.

### Dead-code removal (2026-07-02)
The pre-revamp scaffold under `my-account/components/` was **deleted** (all confirmed 0-usage after
the revamp): `DashboardHeader`, `CoverBanner`, `UserInfoBar`, `QuickActions`, `SocialLinksSection`,
`MembershipStatus`, `ActivePrizeDraws`, `RecentOrders`, `MajorDrawHeaderStrip`, `MajorDrawOverview`
(its entries logic → `sections/dashboard/EntryWallet`; hero/countdown → `sections/draws/DrawsMajorHero`),
the empty `EntryWallet.tsx` stub, and the stale `components/index.ts` barrel. `my-account/components/`
now holds only `BottomNav`, `DeskNav`, `DashboardPageHeader`, `sheets/`, and `settings/`.

### Overlay sheets (2026-07-02)
Support is now a **responsive overlay sheet** (bottom-sheet mobile / centered modal desktop), matching
the prototype — not a page. The nav "Support" item (`BottomNav` + `DeskNav`) calls
`useDashboardSheetStore.openSheet("support")` instead of routing; the layout mounts the global
`components/sheets/SupportSheet` host over any dashboard page via the shared
[`SheetShell`](../../src/components/ui/SheetShell.tsx). The `/my-account/support` route is kept for
deep links — it opens the sheet and redirects to `/my-account`. Support content lives once in
`SupportSheet` (`SupportSheetBody`). Payment/Manage remain settings panels (the store reserves
`"payment"`/`"manage"` kinds for a future sheet host); the Settings **single-page** layout is still a
follow-up.
