# Dashboard-Account — Frontend

## Pages

`src/app/(site)/my-account/`:
- Profile view / edit
- Subscription management (cancel, upgrade, downgrade)
- Payment methods (list, add, set default, remove)
- Draws history / current entries
- Rewards / redeemables wallet
- Metrics / activity

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
