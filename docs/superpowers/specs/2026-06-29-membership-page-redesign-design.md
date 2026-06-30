# Public `/membership` Page Redesign — Design

**Date:** 2026-06-29
**Branch:** `feature/membership-rewards-redesign`
**Status:** Design approved (pending spec review) → next: implementation plan

## Goal

Rebuild the public `/membership` page to match the Claude Design prototype (an 11-section,
partner-first, light-mode-first marketing page). Wire it to **real** data where it exists.
This is a **recomposition**, not a deletion job: nearly every current section component is
shared site-wide and must stay.

## Decisions (locked)

1. **Cleanup = recompose only.** Rebuild this page's composition; keep the shared components
   intact for the 15+ other pages that use them. Delete only genuinely-orphaned code (≈none
   today). **Flag** high-deletion-chance components for the user to remove later — do **not**
   delete them in this work.
2. **Conversion model = new cards drive the existing flow.** The prototype's tier cards (and
   one-time pack cards) become the real "Pick how far you go" purchase section, wired into the
   **existing** `MembershipModal` + entry-flow + gating hooks. `MembershipSection` is dropped
   **from this page only** (it stays untouched for every other page).
3. **Replace both card ladders.** The conversion section uses prototype **tier cards** (subs)
   **and** prototype **pack cards** (one-time), behind a Membership / One-Time toggle — replacing
   the `ElectricPackageCard` grid on this page only.
4. **Live partner deals = real offers.** The portal-phone deals list renders real
   `PARTNER_BRAND_OFFERS` data (real brands + real offer text). No fabricated discount numbers.
5. **Keep all three tier renders** (hero deck / how-it-works mini-cards / tier cards) — faithful
   to the prototype; each plays a distinct role.

## Non-goals

- No site-wide reskin of `ElectricPackageCard` / `MembershipSection`.
- No changes to the Stripe purchase machinery, subscription state machine, A/B framework, or
  tracking — only new callers of existing hooks.
- No new business facts (same tiers, prices, entries, access %, prize). This is a visual rebuild;
  BUSINESS.md / README assertions do not change.

## Page composition (10 content sections)

Light-first, with three dark "beats" (§6 entries-stack, §8 prize, §10 final). Site header/footer
unchanged. `page.tsx` stays a thin server shell with metadata; `MembershipPageClient.tsx` is
rewritten to compose the sections below.

| # | Section | Build | Data / wiring |
|---|---|---|---|
| 1 | **Hero** — "Save big. Win bigger." + 3-tier deck (access rings) | NEW | `useMemberships`, `BrandScroller` (reuse), `useResolvedMultiplier`; primary CTA opens `MembershipModal`, secondary scrolls to prize |
| 2 | **TrustStrip** — winner monthly · live on FB · certified · partner discounts | NEW | static copy only — **no invented counts/stats** (no public aggregate endpoint exists) |
| 3 | **BrandShowcase** — "unlock member-only partner discounts" + brand marquee + CTA | NEW | `BrandScroller` / `brandLogos`. One-time-pack teaser **removed** (now solely in §5 — no duplication) |
| 4 | **How it works** — 3 steps, tier mini-cards | NEW | static step copy; mini tier cards from `useMemberships` |
| 5 | **Pick how far you go** — Membership/One-Time toggle, prototype tier cards + pack cards | NEW — **the conversion section** | see "Conversion section" below |
| 6 | **Your entries stack** — climb chart + partner-portal phone | NEW shell + **reuse `VerticalAccumulationChart`** | tiers × promo mult; phone access-ring = `getPartnerCatalogAccessPercentForPlanId` (50/75/100); deals list = real `PARTNER_BRAND_OFFERS` |
| 7 | **Monthly rhythm** — draw-cycle carousel | NEW | countdown bound to `/api/major-draw` `drawDate` / `freezeEntriesAt`; "27th" is copy, the live countdown binds to `drawDate` |
| 8 | **This month's prize** — setup vs $10k cash toggle | NEW | `usePrizeCatalog`; "Ultimate Tradie Setup + $5k" framing is presentation copy over the static catalog |
| 9 | **Winners** — past winners grid | NEW shell + **reuse `/api/winners/all`** (`useMajorDrawWinners`) | real winners; shows **state** (suburb not stored); **monogram fallback** for missing photos; verified link = `drawResultUrl` |
| 10 | **Final CTA** — refer-a-mate + join | NEW | join → modal; referral is copy / deep-link when logged-out (personal code only if authed) |

### Conversion section (§5) — detail

A Membership / One-Time toggle (the `Seg` primitive), replacing `MembershipSection` on this page.

- **Membership tab:** three prototype tier cards (Tradie / Foreman / Boss). CTA behavior must
  replicate `MembershipSection`'s state machine — verify control flow in the code, do not assume:
  - Guest / non-member → `whenGatesOpenElseGateModal(() => open MembershipModal preset to that sub plan)`.
  - Active subscriber → Current / Upgrade / Downgrade labels, routing to `/my-account` (as
    `MembershipSection` does today).
  - `past_due` / blocking subscription → match existing behavior (RenewalFailed / route). **Verify.**
- **One-Time tab:** prototype pack cards (Apprentice → VIP). CTA → the existing one-time entry
  purchase path (`openEntryFlow` / `useMajorDrawEntryCta`, gated by `whenGatesOpenElseGateModal`).
  - Member-only "Additional" packs that `MembershipSection` surfaces to members: **verify** whether
    the public page should show them or defer to `/my-account`. Default: public ladder only; flag.

> **Footgun (CLAUDE.md §6):** the new cards branch on `hasActiveSubscription` / `past_due` /
> `hasAdditionalPackageAccess`. Trace the real control flow in `MembershipSection.tsx` before
> wiring each state — names and "what most apps do" are not evidence here.

## Data wiring & gap handling

Available live (wire it): tiers/prices/entries/access % (`useMemberships` +
`getPartnerCatalogAccessPercentForPlanId`), promo multiplier (`useResolvedMultiplier`, entries ×
promo), brands (`brandLogos` + `PARTNER_BRAND_OFFERS`), winners (`/api/winners/all`), prize
(`usePrizeCatalog`), draw countdown (`/api/major-draw`).

Gaps and how we handle them (presentation layer, never fabricated):

| Gap | Handling |
|---|---|
| Winner **suburb** (only state stored) | show **state** |
| Winner **photos** optional | **monogram fallback** (initials on tier-coloured tile), like the prototype |
| **Live partner deals** rows | real `PARTNER_BRAND_OFFERS` (decision #4) |
| **"1,000+ brands"** (7 today, 1,000+ soon via partner-products API) | see "Catalogue scalability" below — render the real catalogue (7 now), no hardcoded count; "1,000+" stays forward-looking copy |
| **"+$5,000 cash"** combined prize value | presentation copy over `usePrizeCatalog`; toggle picks setup vs $10k cash |
| **"27th"** cadence not a constant | copy; bind the live countdown to `drawDate` from `/api/major-draw` |
| TrustStrip numeric trust signals | omit numbers; qualitative trust items only |

### Catalogue scalability (7 → 1,000+)

The partner-discount catalogue is **7 brands today** but grows to **1,000+** once the partner-products
API key is wired. Every partner-brand surface on this page (§3 BrandShowcase grid/marquee, §6 portal
phone deals + access ring) must read brand count and the visible slice **from the catalogue source**
(`PARTNER_BRAND_OFFERS` / `getPartnerCatalogVisibleSliceLength(totalPartners, planId)`), never a
hardcoded `7`. This is a named near-term change, not speculation — so the page scales from 7 to 1,000+
with no rework. Render the **real current catalogue**; keep "1,000+" only as forward-looking headline
copy, never as a fabricated live count. When the live API lands, swapping the catalogue source feeds
every surface automatically.

## Architecture

- `src/app/(site)/membership/page.tsx` — unchanged thin server shell (metadata).
- `src/app/(site)/membership/components/MembershipPageClient.tsx` — **rewritten** to compose the
  new sections.
- New section components under **`src/components/sections/membership/`** (existing folder, sibling
  to `ElectricPackageCard`): `MembershipHero`, `MembershipTrustStrip`, `MembershipBrandShowcase`,
  `MembershipHowItWorks`, `MembershipTierChooser` (§5), `MembershipEntriesStack` (§6),
  `MembershipDrawCycle`, `MembershipPrizeChooser`, `MembershipWinnersWall`, `MembershipFinalCta`.
  (Final names matched to existing vocabulary during planning — one concept, one name.)
- New small primitives (only where no equivalent exists):
  - `AccessRing` — single-arc SVG ring, modeled on `src/components/admin/ui/Donut.tsx`, placed in
    `src/components/ui/`.
  - `Seg` — generic segmented toggle, extracted from the `WinnerFilterToggle` tablist pattern, in
    `src/components/ui/`.
  - `useTilt` — local, `prefers-reduced-motion`-gated tilt for cards/phone (or framer-motion).
- **Reuse:** `MetallicButton` / `Button` (cva, `tone=tier-*`) / `Badge` / `AnimatedNumber` (CountUp)
  / `SectionContainer` / `BrandScroller` / `VerticalAccumulationChart` / `MembershipModal` /
  `useMembershipModal` / `useMajorDrawEntryCta` / `useMajorDrawPurchaseGate` / `useMemberships` /
  `useResolvedMultiplier` / `usePrizeCatalog` / `useMajorDrawWinners`.
- **Styling:** Tailwind utility + `cva` + `cn()`; reuse `globals.css` tokens/keyframes; light-mode
  first but ship `dark:` pairs per house convention; honor `prefers-reduced-motion` everywhere.
- **Layering:** no DB/API calls in components; data via hooks; keep `page.tsx` thin. Register new
  files in the **Domain Manifest** (subscription / shared-ui) and update the matching `docs/<domain>/`
  in the same task (doc-sync Stop hook).

## Flagged for deletion — DO NOT delete in this work

- 🚩 **`MembershipPackagesChart`** (`src/components/sections/MembershipPackagesChart.tsx`) — after
  this page drops it, only `my-account/membership` uses it. High orphan chance once that page is
  also redesigned. Hand to user.
- The current **inline hero JSX** in `MembershipPageClient` is replaced by the rewrite (not a
  shared file — goes away naturally).
- **Removed from this page but KEPT (shared — do not delete):** `MembershipSection`,
  `UnlockDiscounts`, `PartnerBenefitsPromoSection` (each still used by 3–15 other pages).

## Risks

- **Money path:** §5 re-implements `MembershipSection`'s CTA state machine against new cards. Highest
  risk. Mitigation: reuse the exact hooks; trace every member/guest/past-due path before wiring;
  verify end-to-end, not just the guest happy path.
- **Page length:** 10 sections is long but matches the agreed prototype; not speculative scope.
- **Doc-sync / BUSINESS triggers:** editing `src/app/(site)/membership/**` triggers the doc-sync
  Stop hook; update the relevant `docs/<domain>/`. No business facts change, so BUSINESS.md/README
  should not need content changes (make a clarifying touch only if the hook trips on a trigger glob).

## Verification

- `npm run type-check`, `npm run lint`.
- Manual: guest, active subscriber, and past-due users through §5 (both tabs); winners with/without
  photos; promo multiplier on/off; countdown binding; reduced-motion.
- Visual parity check against the prototype renders (desktop + mobile) per section.
