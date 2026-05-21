# Dashboard-Account — Frontend

## Pages

`src/app/(site)/my-account/`:
- Profile view / edit
- Subscription management (cancel, upgrade, downgrade)
- Payment methods (list, add, set default, remove)
- Draws history / current entries
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

## Settings page back-button hard-route (Phase 5, 2026-05-21)

[`settings/page.tsx`](../../src/app/(site)/my-account/settings/page.tsx) passes an explicit `onBackClick={() => router.push("/my-account")}` to `DashboardHeader` (alongside the existing `showBackButton` flag). The chevron now always routes to `/my-account` rather than relying on browser-history previous or stepping through the settings index from a sub-tab. The previously-defined `handleBackClick` callback that routed sub-tabs back to the settings index has been removed — `?tab=` deep links still work via `searchParams`, but the back button itself is a single hard route.

This mirrors the user's intent: "clicking the back button should navigate him to /my-account, not in the previous page." Reference spec: `docs/superpowers/specs/2026-05-21-dashboard-tier-picker-polish-design.md` §6.
