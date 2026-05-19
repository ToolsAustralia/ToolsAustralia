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

#### `SubscriptionTab.tsx` and `PaymentTab.tsx` — chrome alignment only

Both wrappers had `<div className="space-y-4">` changed to `<div className="space-y-6">` to match
the vertical rhythm of the re-skinned shell and sibling tabs. No other changes: `dynamic()` imports,
embedded component props, and `renderAsPanel` flag are untouched.

#### Flagged / deferred design elements (NOT implemented — follow-ups)

1. **Subscription tab deep redesign** (PlanHero, TierLadder, AccumulationChart, BillingCalendar, guest feature-matrix) — the `SubscriptionManagementModal` is a 1000+ LOC component with complex billing logic; chrome-only wrapper for now.
2. **Payment tab deep redesign** (credit-card skins, wallet grid) — `PaymentMethodsTab` wraps Stripe payment-method CRUD; chrome-only wrapper for now.
3. **Password security-score dial + security checklist** — no backing data exists to drive these.
4. **Profile profession emoji-tiles + State button-grid** — would change field semantics; kept as `Dropdown` + free-text `SettingsInput` to preserve existing behavior.
5. **SMS 2FA toggle** — backend not implemented; renders a "Coming soon" placeholder only.
6. **Index "password last changed N days ago" preview** — no backing data; generic label used instead.
7. **Index payment preview brand/last4** (e.g. "Visa •••• 4242") — `user.savedPaymentMethods` carries no brand/last4 fields; card count + "Default set" label used instead.
8. **Profile sign-out section** from the design — omitted; index and sidebar already surface sign-out.
9. **`htmlFor`/`id` a11y wiring on Profile phone/profession `Field`s** — Password tab has full wiring; Profile is a small follow-up for full consistency.

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
