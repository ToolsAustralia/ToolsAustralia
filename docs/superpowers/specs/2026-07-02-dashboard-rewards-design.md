# Member Dashboard Revamp — Spec 2: Rewards — Design + Plan

**Date:** 2026-07-02 · **Branch:** `feature/user-dashboard-revamp` · **Status:** proposed (autonomous)
**Builds on:** Spec 1 foundation (shell, `useDashboardState`, `Monogram`/`QuickTile`, tokens).

## Goal

Rebuild the Rewards destination (`/my-account/benefits`, nav-labelled "Rewards") to the Claude
prototype: **Partners FIRST → Claimables → Milestones**, state-aware, wired to real data. Replaces
the current partners-only marketing page. Route path kept (`benefits`); UI label = "Rewards".

## Decisions (autonomous — rationale logged)

1. **Order = partners first, then claimables, then milestones** (design rule — partners are the core benefit).
2. **Reuse the redeemables wallet** (`useRedeemablesWallet` claimable/past + `useRedeemableRedemption`)
   for claimables. When the rewards program is **paused** (`rewardsGuard`, the API 503s), the section
   renders a neutral "temporarily unavailable" state — never an error crash, never fabricated items.
3. **Milestone TRACK (stepper progress) is coming-soon** (`milestoneProgress` switch, off) — no
   customer-facing milestone-progress read exists. Earned milestone rewards still surface in
   claimables (wallet `source: "milestone"`). The dedicated stepper is built-but-hidden.
4. **Partner portal via SSO** — `usePartnerDiscountSso` opens the external MyRewards portal; every
   partner surface carries an external-link affordance. No fabricated discount numbers (real
   `PARTNER_BRAND_OFFERS`).
5. **New shared `DashboardPageHeader`** (colored state-recolored band + gold seam + title/sub +
   action icon) — the prototype's `PageHeader`, reused by Rewards / Membership / Settings sub-pages.
   Replaces each sub-page's ad-hoc hero; resolves the fixed-`DashboardHeader`-vs-sidebar conflict.

## Sections — `src/components/sections/rewards/`

| # | Section (file) | Build | Data / wiring |
|---|---|---|---|
| — | **DashboardPageHeader** (`my-account/components/`) | NEW shared | `useDashboardState.stateTheme` recolor; title "Rewards", sub "Partners · claims · milestones", Gift action icon |
| 1 | **RewardsPartnerCard** | NEW | leads the page. `AccessRing` (pct from `useDashboardState.partnerAccessPct`); state: guest→locked 0% + dual CTA (member/package), pastdue→paused + update-payment, onetime→teal + `expiryLabel`, member→tier %. Unlocked shows **Open partner portal** (`usePartnerDiscountSso`, external glyph) + a `PARTNER_BRAND_OFFERS` brand grid (dimmed when locked) |
| 2 | **RewardsClaimables** | NEW | `useRedeemablesWallet(userId,{status:"claimable"})` → "Ready to claim" rows (label + `entriesAmount` + Claim via `useRedeemableRedemption`, disabled unless `isRedeemableNow`); `{status:"past"}` → "Recently claimed". Paused/past-due → disabled neutral state |
| 3 | **RewardsMilestones** | NEW | milestone stepper (3mo/6mo/9mo/1yr) — **gated behind `milestoneProgress`**; until enabled, renders a compact "Loyalty milestones" teaser with the known reward tiers (static copy, **no progress %**). Hidden for guest/onetime (member perk) |

State-aware unlock: guest shows a "become a member OR buy a package" card and stops (no claimables/milestones); onetime shows the time-gated window + "milestones are a member perk"; pastdue shows paused styling throughout.

## Data / gap handling

Available: partner access %/expiry (`useDashboardState`, `getPartnerDiscountAccessInfo`), SSO
(`usePartnerDiscountSso`), brands (`PARTNER_BRAND_OFFERS`), claimables (`useRedeemablesWallet` +
`useRedeemableRedemption`). Gaps: milestone-progress read (→ coming-soon stepper); rewards-paused
(→ neutral unavailable state, no crash).

## Architecture

- `benefits/page.tsx` — **rewritten** to a thin client composer: `DashboardPageHeader` + guest branch
  OR (`RewardsPartnerCard` → `RewardsClaimables` → `RewardsMilestones`), fed by `useDashboardState`.
  Keeps `MembershipModal` + login redirect. Drops the ad-hoc red hero (uses `DashboardPageHeader`).
- New `src/components/sections/rewards/*` + `my-account/components/DashboardPageHeader.tsx`.
- **Reuse:** `AccessRing`, `MetallicButton`/`Button`, `Badge`, `Monogram`, `useDashboardState`,
  `useRedeemablesWallet`/`useRedeemableRedemption`, `usePartnerDiscountSso`, `PARTNER_BRAND_OFFERS`,
  `MembershipModal`, `useMajorDrawEntryCta`. Semantic tokens; `dark:` pairs; reduced-motion.
- **Manifest:** `src/components/sections/rewards/**` → shared-ui (`src/components/sections/**` covers it);
  `my-account/components/**` → dashboard-account (covered). Update `docs/dashboard-account/frontend.md`.

## Flagged for deletion — DO NOT delete (mirror in `benefits/page.tsx` header)

- **Removed from this page but KEPT** (shared, used elsewhere): `PartnerDiscountQueue`,
  `UnlockDiscounts` (both still used by other surfaces — verify before any later deletion).
- The ad-hoc benefits hero JSX is replaced by `DashboardPageHeader` (goes away naturally).

## Tasks

1. `DashboardPageHeader` (shared state-recolored band).
2. `RewardsPartnerCard` (+ SSO wiring; verify `usePartnerDiscountSso`).
3. `RewardsClaimables` (wallet claimable/past + claim; paused-safe).
4. `RewardsMilestones` (coming-soon-gated stepper).
5. Rewrite `benefits/page.tsx` composer; verify all 4 states; tsc/lint; docs/manifest.

## Verification

tsc + lint; drive guest / member / one-time / past-due; rewards-enabled vs paused; SSO button;
claim a redeemable (optimistic); light/dark; mobile/desktop; visual parity vs prototype `RewardsPage`.
