# Member Dashboard Revamp — Spec 5: Settings + Overlays — Design + Plan

**Date:** 2026-07-02 · **Branch:** `feature/user-dashboard-revamp` · **Status:** proposed (autonomous)
**Builds on:** Specs 1–4 (foundation, `DashboardPageHeader`).

## Goal

Close the Settings gaps and finish the shell consistency: add the **Appearance / ThemePicker**
(Light/Dark), redesign **Support** to the prototype (Ask Cobber [coming-soon] + Email + FAQ), and
swap the last `DashboardHeader` (fixed top bar that overlapped the new desktop sidebar) to
`DashboardPageHeader`. Settings' Profile/Password tabs + primitives were already redesigned.

## Decisions (autonomous)

1. **Theme = Light/Dark only (no System)** — per the locked scope decision. `ThemePicker` is a 2-way
   segmented control wired to the existing `ThemeContext` (`useTheme` → `setTheme`, persists to
   `localStorage["ta-theme"]`). No change to the theme mechanism. Placed as an **Appearance card on
   the Settings index** (no new tab/route).
2. **Support redesign, delivered as a route (not a global sheet host).** The prototype's Support is a
   responsive sheet↔modal; building a global overlay host + rewiring nav to open-vs-route is heavier
   than the remaining value (CLAUDE.md §4). The **content** is ported faithfully (Ask Cobber card
   gated by `cobberSupport`; Email us `support@…` · 1–2 business days; Common-questions FAQ), and the
   working **ContactForm is kept** ("Send us a message") — dropping a real support channel for strict
   visual fidelity would be under-building. The responsive sheet shell is a deferred polish (flagged).
3. **Header consistency:** replace the fixed `DashboardHeader` on Settings with `DashboardPageHeader`
   (state-recolored, in-flow). This removes the last fixed-bar/sidebar overlap. `DashboardPageHeader`
   gains an optional `onBack` so a Settings tab returns to the index (index → `/my-account`).
4. **Billing history:** the design removes it; no billing-history UI exists in the in-scope Settings
   files (index is clean). Any history tab would live inside the shared `SubscriptionManagementModal`
   / `PaymentMethodsTab` (out of scope, money-path) — **flagged for the user to verify/strip** rather
   than modified here.

## Changes

| File | Change |
|---|---|
| `components/settings/ThemePicker.tsx` | NEW — Light/Dark segmented (`useTheme`), `aria-pressed` |
| `settings/page.tsx` | swap `DashboardHeader`→`DashboardPageHeader` (+`useDashboardState`); add Appearance card; simplify loading/error guards (no fixed header) |
| `support/page.tsx` | rewritten: `DashboardPageHeader` + Ask-Cobber (coming-soon) + Email + FAQ accordion + kept `ContactForm`; no WhatsApp/phone (already absent) |
| `components/DashboardPageHeader.tsx` | add optional `onBack` |

## Flagged for deletion — DO NOT delete (user review)

- 🚩 **`DashboardHeader.tsx`** — now **fully orphaned** (Settings was its last user; all destinations
  use `DashboardPageHeader` / the shell). Its old desktop nav is superseded by `DeskNav`.
- 🚩 **`MajorDrawHeaderStrip.tsx`** — was only used by the old draws page; now orphaned.
- (Carried from earlier specs: `MembershipStatus`, `ActivePrizeDraws`, `RecentOrders`, empty
  `EntryWallet` stub, stale `components/index.ts`, `MembershipPackagesChart`, and the superseded
  `CoverBanner`/`UserInfoBar`/`QuickActions`/`SocialLinksSection`.)

## Verification
tsc + lint; toggle Light/Dark (persists, applies live); Support FAQ accordion + email link + Cobber
coming-soon state; Settings header back behavior (tab→index, index→dashboard); light/dark;
mobile/desktop; no fixed-bar/sidebar overlap.
