# Membership Section — Phase 2: Live Integration Plan

> **For agentic workers:** Execute task-by-task with review. Steps use `- [ ]`.

**Goal:** Replace the per-package card markup in the live `src/components/sections/MembershipSection.tsx` with the polished `ElectricPackageCard`, 1:1 with the approved `/dev/membershipsection` design, while keeping ALL section logic. Theme follows the site (dark electric / branded light). The dev electric color scheme becomes the live color source.

**Architecture:** `MembershipSection` keeps every behavior (tabs, promo-multiplier build, A/B variant hide/reorder, current/upgrade/downgrade/past-due CTA text, locked state, package-inclusions slide-up, modal). Only the two per-plan card `<div>` blocks (mobile `lg:hidden` and desktop `hidden lg:block`) are swapped for `<ElectricPackageCard>`. `ElectricPackageCard` gains one additive prop (`ctaLabel`) so the section's computed button text flows through; everything else maps from existing section values. Production/payments path → spec + code review mandatory.

**Decisions (user-confirmed):**
- Theme = follow site via `useHtmlDarkForUi()` → `theme={isDark ? "dark" : "light"}`.
- Color source = dev scheme: `activeTab === "membership" ? getMembershipSectionColorScheme(plan.id, true) : getElectricPackageColorScheme(plan.id)` (replaces `getPackageColorSchemeForPromo`). This intentionally drops A/B `packageColors` *color* overrides (variant hide/reorder/highlight still work — they live in the `membershipPlans` build, untouched). Accepted by user ("dev section package color will be now our new overrides").
- The approved dev look wins where it differs from the old live card: Best Value/ribbon `size="small"` (not medium), VIP uses the card's `isPremium` gradient treatment (old `vip-premium-*` aura dropped), `plan.subtitle` not rendered, per-plan icon-scale + variant `scale-105` highlight emphasis dropped. These are intentional, not regressions to fix.

**Tech:** Next.js client component, React, Tailwind, tsx tests for the utils (already green).

**Files:**
- Modify: `src/components/sections/membership/ElectricPackageCard.tsx` (add `ctaLabel?` prop)
- Modify: `src/components/sections/MembershipSection.tsx` (swap both card blocks, add imports/theme, remove now-internal multiplier badge markup, prune unused helpers)
- Modify: docs under `subscription` / `shared-ui` per doc-sync

---

### Task A — Extend ElectricPackageCard with `ctaLabel`

**Files:** `src/components/sections/membership/ElectricPackageCard.tsx`

- [ ] **A1.** In `ElectricPackageCardProps` add:
```ts
  /** Overrides the interactive CTA text (e.g. "Upgrade to Boss", "Update payment"). Default "Enter Now". */
  ctaLabel?: string;
```
Destructure `ctaLabel` in the component params (no default needed; `undefined` → existing behavior).

- [ ] **A2.** In the CTA `<button>`'s label span, change:
```tsx
{state.isCurrent ? "Current Plan" : state.locked ? state.lockReason ?? "Locked" : "Enter Now"}
```
to:
```tsx
{state.isCurrent ? "Current Plan" : state.locked ? state.lockReason ?? "Locked" : ctaLabel ?? "Enter Now"}
```
(Only the interactive branch changes; `isCurrent`/`locked` text and `interactive = !locked && !isCurrent` gating unchanged. Dark mode and the dev harness — which passes no `ctaLabel` — are byte-for-byte unchanged.)

- [ ] **A3.** Verify: `npm run test:electric-scheme`, `npm run test:additional-pack-discount` PASS; `npx tsc --noEmit` clean; `npx eslint` on the file clean.

- [ ] **A4.** Commit: `feat(membership): add optional ctaLabel prop to ElectricPackageCard (default Enter Now)`

---

### Task B — Wire ElectricPackageCard into MembershipSection

**File:** `src/components/sections/MembershipSection.tsx`. Two replace sites: mobile card block lines ~582–840, desktop card block lines ~866–1133 (re-locate exactly before editing — line numbers may shift).

- [ ] **B1.** Imports: add
```ts
import ElectricPackageCard from "@/components/sections/membership/ElectricPackageCard";
import { getElectricPackageColorScheme } from "@/utils/package-colors/electricPackageScheme";
import { getMembershipSectionColorScheme } from "@/utils/package-colors/packageColorScheme";
import { getAdditionalPackDiscount } from "@/utils/membership/additional-pack-discount";
import { useHtmlDarkForUi } from "@/hooks/useHtmlDarkForUi";
```
Keep existing imports that are still used (`BestValueBadge`/`CornerRibbonBadge` are now rendered *inside* ElectricPackageCard — they become unused in MembershipSection; remove their imports if eslint flags them, same for `getPackageColorSchemeForPromo`, `getCardBorderStyle`, `getPackageIcon`, `getPackageIconWrapperScaleClass`, `getMembershipSectionInnerSheenClassNames`, the local `packageEnterNow*`/`vipCardOuterShadow`/`membershipEnterGlowWrap` helpers, `isVipPackPlan` — ONLY remove a symbol after confirming zero remaining references; otherwise leave it).

- [ ] **B2.** Near the other hooks in the component body add:
```ts
const isDark = useHtmlDarkForUi();
```

- [ ] **B3.** Replace the mobile per-plan card block (the `<div key={plan.id} ...> ... </div>` inside `lg:hidden`) — keep the `.map`, the grid container, and the per-plan setup vars (`colorScheme` recomputed below, `highlighted`, `isAdditionalPackage`, `showBestValueRibbon`, `isVip`). New body of the map return:
```tsx
const colorScheme =
  activeTab === "membership"
    ? getMembershipSectionColorScheme(plan.id, true)
    : getElectricPackageColorScheme(plan.id);
const discount = activeTab === "one-time" ? getAdditionalPackDiscount(plan.id) : null;
const locked = !hasAccessToAdditionalPackages && !!plan.isMemberOnly;
const current = isCurrentSubscription(plan);
const hierarchy = getPlanHierarchy(plan);
const isSubscriptionPlan = plan.period !== "one-time" && !plan.name.toLowerCase().includes("one-time");
let ctaLabel = "Enter Now";
if (hasBlockingSub && isPastDue && isSubscriptionPlan) ctaLabel = "Update payment";
else if (hasActiveSubscription && activeTab === "membership") {
  if (hierarchy.isCurrent) ctaLabel = "Current Plan";
  else if (hierarchy.isDowngrade) ctaLabel = `Downgrade to ${getPackageDisplayName(plan)}`;
  else if (hierarchy.isUpgrade) ctaLabel = `Upgrade to ${getPackageDisplayName(plan)}`;
}
const showBestValueRibbon =
  (activeTab === "membership" && plan.id === "boss-subscription") ||
  (activeTab === "one-time" && isOneTimeBestValuePlanId(plan.id));
const ribbon = current ? "CURRENT" : plan.isPopular ? "MOST POPULAR" : null;
return (
  <div key={plan.id} className="overflow-visible px-1 pt-8 sm:pt-12">
    <ElectricPackageCard
      plan={plan}
      colorScheme={colorScheme}
      state={{ locked, lockReason: "Subscription or Entries Required", isCurrent: current }}
      discount={discount ? { regularPrice: discount.regularPrice, percentOff: discount.percentOff } : null}
      onSelect={handlePlanSelect}
      showBestValue={showBestValueRibbon}
      ribbon={showBestValueRibbon ? null : ribbon}
      ctaLabel={ctaLabel}
      theme={isDark ? "dark" : "light"}
    />
  </div>
);
```
Drop the old setup vars that are no longer referenced (`highlighted`, `isAdditionalPackage`, `isVip`) IF unused after the rewrite (they were only used by the removed markup) — verify and remove to avoid eslint unused. Keep the grid container exactly as-is: `<div className="grid grid-cols-1 gap-4 sm:gap-6 max-w-md mx-auto overflow-visible">`.

- [ ] **B4.** Replace the desktop per-plan card block (inside `hidden lg:block`) with the **same** map-return body as B3 (the logic is identical in both branches per the integration spec). Keep the desktop grid container as-is:
`` <div className={`grid gap-3 sm:gap-4 overflow-visible pt-8 max-w-7xl mx-auto grid-cols-1 w-full ${membershipPlans.length === 5 ? "lg:grid-cols-5" : "md:grid-cols-3"}`}> `` and its `membershipPlans.length > 0 ? (...) : (<empty state>)` guard + the empty-state `<div className="col-span-full ...">No membership packages available</div>`.

- [ ] **B5.** Remove the section's own promo-multiplier badge markup in BOTH branches (the `{plan.metadata?.isPromoActive && plan.metadata?.promoMultiplier && (<div className="absolute ... X{n}.webp ...>)}` blocks) — ElectricPackageCard renders this internally; leaving them would double the badge.

- [ ] **B6.** Leave untouched (outside the card blocks): the section header / multiplier banner, the One-Time/Membership toggle + `PromoMultiplierBadge`, the `PackageInclusionsExpanded` slide-up toggle, and `<MembershipModal>`. Keep `getPlanHierarchy`, `handlePlanSelect`, `isCurrentSubscription`, `hasAccessToAdditionalPackages`, `hasBlockingSub`, `isPastDue`, `hasActiveSubscription`, the `membershipPlans` build + variant hide/reorder — all still used.

- [ ] **B7.** `npx tsc --noEmit` clean (resolve any unused-symbol errors by removing genuinely-unused imports/helpers from B1; do NOT remove anything still referenced). `npx eslint src/components/sections/MembershipSection.tsx src/components/sections/membership/ElectricPackageCard.tsx` clean.

- [ ] **B8.** Commit: `feat(membership): use ElectricPackageCard in live MembershipSection (theme-aware, dev design 1:1)`

---

### Task C — Docs + verification

- [ ] **C1.** doc-sync: update the matching `docs/subscription/*` and/or `docs/shared-ui/*` notes — MembershipSection now renders `ElectricPackageCard`; color source = electric scheme (one-time) / membership-section scheme (membership tab); theme follows `useHtmlDarkForUi`; A/B color overrides dropped (hide/reorder/highlight retained); promo multiplier badge now internal to the card. Brief, factual.
- [ ] **C2.** Full pass: `npm run test:electric-scheme`, `npm run test:additional-pack-discount`, `npm run type-check`, `npm run lint` (note only pre-existing unrelated noise). Manual: `npm run dev` → real membership section on a page that renders it; verify both tabs, guest/subscriber/entries, promo on/off, light vs dark site theme, upgrade/downgrade/current/past-due CTA text, locked additional packs, modal opens, package-inclusions slide-up still works.
- [ ] **C3.** Commit docs.

---

### Task D — Review

- [ ] Spec-compliance review then code-quality review (production/payments path): confirm no section behavior changed except the card visual; CTA routing (handlePlanSelect) intact for upgrade/downgrade/past-due/current/locked; no double multiplier badge; theme wired; dark electric == approved dev dark; light == approved dev light; no `any`; no unused; lint/tsc green.

## Self-Review
- Spec coverage: theme (B2), color source (B3/B4), CTA text (A + B3), locked/current/discount/best-value/ribbon (B3), badge de-dupe (B5), preserved logic (B6) — all mapped to tasks. Card extension is purely additive (A) so dev harness + dark unchanged. Risk: unused-symbol churn in the 1185-line file → B7 explicitly gates on tsc/eslint and "only remove if zero refs". No placeholders; B3 body is complete and reused verbatim in B4.
