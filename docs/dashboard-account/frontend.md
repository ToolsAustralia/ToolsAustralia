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
