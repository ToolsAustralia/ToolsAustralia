# Member Dashboard Revamp — Spec 4: Membership — Design + Plan

**Date:** 2026-07-02 · **Branch:** `feature/user-dashboard-revamp` · **Status:** proposed (autonomous)
**Builds on:** Spec 1 foundation + Spec 2 `DashboardPageHeader`.

## Goal

Rebuild the account Membership destination (`/my-account/membership`) to the prototype: a **current
plan** card + a **tier list** (current flagged, upgrade badges + promo-multiplied entries) + **one-time
packages** + **Manage** actions. Replaces the marketing "join" page (`PartnerBenefitsPromoSectionClient`
+ `MembershipPackagesChart` + `MembershipSection`).

## Decisions (autonomous)

1. **Reuse the verified conversion section.** The public `/membership` page's `MembershipTierChooser`
   (tier cards + `MembershipOneTimePacks`) is driven by `useMembershipCardCta` — the ported
   `MembershipSection` CTA state machine (current/upgrade/downgrade, past-due → `/my-account`,
   guest → modal, promo-multiplied entries, locked additional packs). Reused here verbatim so the
   money-path logic is identical (CLAUDE.md §6 — no re-implementation). Drives the page's single
   `MembershipModal` via `cta.membershipModal`.
2. **New `MembershipCurrentPlan`** (account-focused, `src/components/sections/account-membership/`) —
   state-aware current-plan summary (tier gradient, name, status pill, stats: free entries/mo,
   partner access %, $/mo; renew date / paused / none) + **Manage** actions (Manage plan →
   `settings?tab=subscription`; Payment method → `settings?tab=payment`). Guest → become-member /
   buy-package. Full Manage overlay (cancel/change) lives in the Settings subscription panel
   (Spec 5 makes it a responsive sheet); this page links to it — no duplicate cancel flow.
3. **`account-membership` folder name** matches the design's nav id (one concept, one name).

## Sections

| Section | Build | Data |
|---|---|---|
| **DashboardPageHeader** | reuse (Spec 2) | title "Membership", sub "Your plan & billing", Card icon |
| **MembershipCurrentPlan** | NEW | `useDashboardState` (acct/tier) + `getActivePackage` (entries/mo) + `getPartnerCatalogAccessPercentForPlanId` + renew date |
| **MembershipTierChooser** | reuse (`sections/membership/`) | `useMembershipCardCta` — tier cards + one-time packs + CTA machine |

## Architecture

- `membership/page.tsx` — rewritten thin composer: `DashboardPageHeader` + `MembershipCurrentPlan` +
  `MembershipTierChooser` + `MembershipModal`, driven by `useDashboardState` + `useMembershipCardCta`.
- New `src/components/sections/account-membership/MembershipCurrentPlan.tsx` (shared-ui covers `sections/**`).
- **Flagged for deletion — DO NOT delete:** 🚩 `MembershipPackagesChart` (now fully orphaned — this
  was its last user; the /membership redesign already flagged it). Kept, shared:
  `PartnerBenefitsPromoSection(Client)`, `MembershipSection`.
- No business-fact change (same tiers/prices/entries/access). Docs: dashboard-account/frontend.md.

## Verification
tsc + lint; drive member (current/upgrade/downgrade), past-due (update-payment routing), one-time,
guest; promo multiplier badges on upgrade-eligible tiers; Manage/Payment links; light/dark;
mobile/desktop; visual parity vs prototype `MembershipPage`.
