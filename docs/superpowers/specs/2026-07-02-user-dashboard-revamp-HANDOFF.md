# User Dashboard Revamp — Autonomous Session Handoff

**Date:** 2026-07-02 · **Branch:** `feature/user-dashboard-revamp` (16 commits, 48 files, +3700/−985)
**Status:** All 5 sub-projects implemented, verified, and **committed** (not pushed, per instruction).
**Design source:** `claudeDesign/…/design_handoff_rewards_dashboard/` (Claude prototype).

This session ran autonomously. Every gate that would normally need your approval was self-answered
with the best-researched default and logged below. Nothing here is pushed; review then push when ready.

## What shipped (5 sequenced specs on a shared foundation)

| # | Destination | File | Highlights |
|---|---|---|---|
| 1 | **Foundation + Home** | `my-account/{layout,page}.tsx`, `sections/dashboard/*` | Responsive shell (mobile bottom nav + new desktop sidebar `DeskNav`), `useDashboardState` (account-state machine + tier/state theming + promo multiplier + entries), sections: DashboardHero, EntryWallet, DashboardPromoBanner, LoyaltyStreak, QuickActionsGrid, PartnerPreview, DashboardGuestPanel. Coming-soon switches (`src/config/dashboardFeatures.ts`). New primitives `Monogram`, `QuickTile`. |
| 2 | **Rewards** | `my-account/benefits/page.tsx`, `sections/rewards/*` | Partners-first (`RewardsPartnerCard` + SSO), `RewardsClaimables` (paused-safe redeemables), `RewardsMilestones` (coming-soon gated). Shared `DashboardPageHeader`. |
| 3 | **Draws** | `my-account/draws/page.tsx`, `sections/draws/*` | Major/Mini `Seg` toggle, `DrawsMajorHero` (setup vs $10k-cash prize picker + countdown), `DrawHowItWorks`, `DrawWinners`, `DrawsMini`. Reuses `EntryWallet`. |
| 4 | **Membership** | `my-account/membership/page.tsx`, `sections/account-membership/*` | `MembershipCurrentPlan` + reused `MembershipTierChooser`/`useMembershipCardCta` (verified upgrade/downgrade/current/past-due CTA machine). |
| 5 | **Settings + Support** | `my-account/settings/page.tsx`, `support/page.tsx` | Appearance `ThemePicker` (Light/Dark), header swap to `DashboardPageHeader`, Support redesign (Cobber coming-soon + Email + FAQ + kept ContactForm). |

**Organization:** mirrors the approved `/membership` redesign — one section per file under
`src/components/sections/<area>/`, thin page composers, reuse-first, no DB/API in components.

## Autonomous decisions (your review welcome)

1. **Theme = Light/Dark only, no System** (your choice) — `ThemePicker` is 2-way; the earlier removal of System is honored.
2. **Coming-soon = built-but-hidden** (your choice) — full UI behind off-by-default switches in `src/config/dashboardFeatures.ts`: `cobberSupport`, `milestoneProgress`, `personalWins`, `orderHistory`. **To enable one later:** flip it to `true` — the finished UI appears (Cobber chat card, milestone-progress stepper, etc.).
3. **New section components under `src/components/sections/<area>/`** (your choice — "most clean/scalable"), not the handoff's literal `my-account/components/*` mapping.
4. **Dead code: flagged only, not deleted** (your choice) — see below.
5. **DashboardPromoBanner is a NEW file**, not a variant of the marketing `PromoBanner` — that component's scroll-morphing full-bleed layout is irreconcilable with a compact card.
6. **Promo copy sells the real live multiplier**, not "50% off one-time packages" — BUSINESS.md scopes "50% off" to the post-purchase upsell, so asserting a standing price promo would be fabrication.
7. **Support delivered as a route, not a global sheet host** — the prototype shows sheet↔modal overlays; building a global overlay host + rewiring nav was heavier than the value. Content is faithful; the responsive-sheet delivery is a deferred polish.
8. **`page.tsx` modal orchestration kept inline verbatim** — the intricate setup/upsell/subscription-explainer timing was preserved rather than extracted, to protect proven behavior.
9. **"View this promotion"** links to `/promotions` (index), not a per-slug page (no reliable per-draw slug to avoid fabrication).

## 🚩 Flagged for deletion — please review, then delete (I deleted nothing)

Genuinely orphaned after this revamp (0 remaining usages):
- `src/app/(site)/my-account/components/MembershipStatus.tsx` (was already dead)
- `src/app/(site)/my-account/components/ActivePrizeDraws.tsx`, `RecentOrders.tsx` (dead re-exports)
- `src/app/(site)/my-account/components/EntryWallet.tsx` (empty 0-byte stub — superseded by `sections/dashboard/EntryWallet.tsx`)
- `src/app/(site)/my-account/components/DashboardHeader.tsx` (Settings was its last user; all pages now use `DashboardPageHeader`)
- `src/app/(site)/my-account/components/MajorDrawHeaderStrip.tsx` (old draws page only)
- Stale re-exports in `src/app/(site)/my-account/components/index.ts`
- `src/components/sections/MembershipPackagesChart.tsx` (this revamp removed its last user — the `/membership` redesign already flagged it)

Superseded on the home but **KEPT** (still used by nothing now, but low-risk to leave until you confirm): `CoverBanner`, `UserInfoBar`, `QuickActions`, `SocialLinksSection`. `MajorDrawOverview` — its entries logic was extracted into `EntryWallet`; verify no other page needs it before removing.

Each is also flagged in a comment block at the top of the relevant rewritten page.

## Flagged to verify (not modified — money path)

- **Billing history** in the shared `SubscriptionManagementModal` / `PaymentMethodsTab` — the design removes billing history; these shared modals were not touched (they carry the Stripe money path). Verify whether they surface a history/invoices tab and strip it if so.

## Coming-soon (backend not ready — UI built, hidden)

Cobber AI support · milestone-progress stepper · personal "your wins" history · full order history. All render only when their `dashboardFeatures.ts` flag is `true`. Rewards program pause (`rewardsGuard`) is handled gracefully (neutral "temporarily unavailable", never a crash).

## Verification

- **Production build:** ✅ passes (all `/my-account/*` routes compile; no genuine errors — only pre-existing dynamic-server/.webp noise).
- **Type-check:** ✅ 0 errors. **Lint:** ✅ clean on all changed files. **Tests:** ✅ `test:dashboard-state-theme`, `test:dashboard-account-state` pass.
- **Two adversarial diff-reviews** (Spec 1, then whole-branch) — all findings fixed; final verdict had **no blockers**.
- **Not yet done (recommend before merge):** manual visual QA of each destination across the 4 account states (active / one-time / past-due / guest) × light/dark × mobile/desktop against the prototype.

## Commits (feature/user-dashboard-revamp, newest first)

`f6700c4e` review fixes · `f01ad026` Spec 5 · `1eade62e` Spec 4 · `c0b5d1ac` Spec 3 ·
`7296d53d` Spec 2 · `591a8557` Spec-1 review fixes · `631609d6` docs/manifest · `5e5e261b` home recompose ·
`aebb1ac6`+`e812a4ea` home sections · `468c59fe` nav shell · `b1d30048` primitives ·
`b5c4b68c` state hook · `6b408157` flags+theme · `bad68b73`+`869ba4f6` plan+spec.
