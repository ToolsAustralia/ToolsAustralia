# Membership Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the public `/membership` page to match the Claude Design prototype (10 marketing sections, light-first with three dark beats), wired to real data, replacing the page's current composition while keeping every shared component intact for the rest of the site.

**Architecture:** `page.tsx` stays a thin server shell. `MembershipPageClient.tsx` is rewritten to compose 10 new section components (under `src/components/sections/membership/`). The conversion section's cards call a single `onSelect(plan)` into a new `useMembershipCardCta` hook that ports `MembershipSection`'s exact CTA state machine and opens the existing `MembershipModal` — no purchase logic is re-implemented. Visual markup is ported from the prototype files (the approved design source); data/wiring/logic is written in full here.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind + `cva` + `cn`, existing hooks (`useMemberships`, `useMembershipModal`, `useMajorDrawPurchaseGate`, `useResolvedMultiplier`, `usePrizeCatalog`, `useMajorDrawWinners`, `useMajorDrawCountdown`/`CountdownLeaf`), `next/image`, `next/dynamic`.

## Source-of-truth references

- **Design spec:** `docs/superpowers/specs/2026-06-29-membership-page-redesign-design.md`
- **Prototype markup (the approved visual design — port from these):**
  - `…/scratchpad/proto/marketing.js` — `HeroSection`/`DeckCard`, `TrustStrip`, `BrandShowcase`/`BrandMarquee`/`PackCard`, `ScrollStory`/`MiniTierCard`/`StepViz`, `WinnerCard`/`WinnersWall`, `PartnerPortal`
  - `…/scratchpad/proto/MembershipPage.js` — `TierCard`/`TierCards`, `ClimbScene`/`WhyMembersWinMore`, `DrawCycle`, `PrizeChooser`, `FinalCTA`
  - `…/scratchpad/proto/partials.js` — `LivePartnerDeals`
  - `…/scratchpad/proto/data.js` — copy/labels reference only (real data comes from codebase hooks)
  - Prototype path root: `C:\Users\Genesis\AppData\Local\Temp\claude\c--Codes-ToolsAustralia--worktrees-membership-rewards-redesign\1d7f9ffc-a25d-400a-b19c-3585a2be92d0\scratchpad\proto\`

## Global Constraints

Copied verbatim from the spec + verified interface recon — every task implicitly includes these:

- **Recompose only.** Do NOT delete `MembershipSection`, `UnlockDiscounts`, `PartnerBenefitsPromoSection`, `ElectricPackageCard`, or `MembershipPackagesChart` — they are shared by 3–15 other pages. They are only *removed from this page's composition*. Maintain the deletion-flag note (Task 18); delete nothing.
- **The page never purchases directly.** Rebuilt tier/pack cards call exactly one callback `onSelect(plan: LocalMembershipPlan)`. All routing/modal/Stripe logic lives behind `useMembershipCardCta` → `MembershipModal`. Never re-implement purchase, registration, or Stripe logic on a card.
- **Wrap every CTA in `whenGatesOpenElseGateModal`** (from `useMajorDrawPurchaseGate`). Any action that initiates a purchase must go through it or it can fire while the major draw is closed and skip the gate-closed modal.
- **Entry counts** displayed on cards/charts read `plan.metadata.entriesCount` (already multiplied by the resolved promo). Promo multiplier = `useResolvedMultiplier("membership-packages") ?? 1` (coalesce null → 1).
- **Partner brands are catalogue-driven** (7 today → 1,000+ soon). Read brand count + visible slice from `PARTNER_BRAND_OFFERS` + `getPartnerCatalogVisibleSliceLength(total, planId)`. NEVER hardcode `7`. `PARTNER_BRAND_OFFERS` has 8 entries today; `brandLogos` (14, tool brands) is a different dataset — do not conflate.
- **No fabricated data.** Real partner offers (`PARTNER_BRAND_OFFERS`), real winners (`useMajorDrawWinners`), real prize (`usePrizeCatalog`), real countdown (`/api/major-draw`). "1,000+ brands", "27th", "+$5,000 cash" are copy only.
- **Winners:** show **state** (suburb not stored); `imageUrl` photo with **monogram fallback** (initials) when absent; `/api/winners/major-draws` does NOT return `drawResultUrl`/`watchUrl`/`testimony` — show a qualitative "Verified draw" badge (no fabricated per-winner link); link the card/section to `/winners`.
- **Styling:** Tailwind + `cn` (`@/utils/cn`). Light-first `:root` tokens (`.bg-page`/`.bg-surface`/`.text-primary-token`/`.text-muted-token`/`.border-token`), ship `dark:` pairs. Headings `font-['Poppins']`, body Inter (default). Tier accents are **`brand-tier-tradie` #00c2ed / `brand-tier-foreman` #ffd200 / `brand-tier-boss` #ee0000** and **`premium-gold` #D4AF37** (VIP). **Arbitrary `[#hex]` classes are NOT safelisted — use the named tier/brand classes or inline `style` for dynamic hexes.** Reuse `globals.css` animation classes (`stagger-animation`, `marquee-track`, `cta-shimmer-pass`, `border-glow-*`, `glow-pulse-*`). Honor `prefers-reduced-motion`.
- **Primitive gotchas:** `AnimatedNumber` has only `value`/`duration`/`format`/`className` (fold prefix/suffix into `format`; it's a **named** export). `ui/Button` variants are `primary|outline|ghost|link`, tone `red|tier-tradie|tier-foreman|tier-boss|neutral` (no `secondary`). `MetallicButton` is the hero CTA (variant `primary|secondary`; `secondary` is white text — dark backgrounds only). `Badge` tones include `gold|tier-*|success|info`. `SectionContainer`/`SECTION_CONTAINER_CLASSES` are named exports (don't use `cn` internally). `BrandScroller` can only render the fixed `brandLogos` set.
- **No auto-commit (CLAUDE.md §1).** Commit steps below run ONLY if the user has authorized commits this session (keywords: commit/push/merge/PR/ship it). If not authorized, complete the task and skip the commit step.
- **No test runner exists** (no jest/vitest). Per-task verification = `npm run type-check` (no errors) + `npm run lint` (no new errors) + a **visual parity check** (run `npm run dev`, open `/membership`, compare to the named prototype render). Pure-logic utils get a `tsx` test following the repo pattern (`src/**/__tests__/*.test.ts` + a `package.json` `test:*` script).
- **Docs (CLAUDE.md §2/§5):** editing `src/app/(site)/membership/**` and `src/components/sections/**` requires updating `docs/subscription/` and `docs/shared-ui/` (Task 18). No tier price/entry/access % changes, so BUSINESS.md/README should not need content edits; if the doc-sync hook trips on a trigger glob, make a one-line clarifying touch.

---

## File Structure

**Create (new):**
- `src/components/ui/Seg.tsx` — generic segmented toggle (light-first), extracted from `WinnerFilterToggle`.
- `src/components/ui/AccessRing.tsx` — single-arc SVG progress ring (modeled on admin `Donut`).
- `src/hooks/useTilt.ts` — pointer-tilt hook, `prefers-reduced-motion` gated.
- `src/utils/membership/climb-series.ts` — pure entry-accumulation math for the climb chart.
- `src/utils/membership/__tests__/climb-series.test.ts` — tsx test for the above.
- `src/hooks/useMembershipCardCta.ts` — ports `MembershipSection`'s CTA state machine + plan lists; the conversion-section brain.
- `src/components/sections/membership/MembershipHero.tsx`
- `src/components/sections/membership/MembershipTrustStrip.tsx`
- `src/components/sections/membership/MembershipBrandShowcase.tsx`
- `src/components/sections/membership/MembershipHowItWorks.tsx`
- `src/components/sections/membership/MembershipTierChooser.tsx` — §5 conversion (tier + pack cards).
- `src/components/sections/membership/MembershipEntriesStack.tsx` — §6 climb chart + portal phone.
- `src/components/sections/membership/ClimbChart.tsx` — ported SVG climb (used by MembershipEntriesStack).
- `src/components/sections/membership/PartnerPortalPhone.tsx` — phone mockup (access ring + real deals).
- `src/components/sections/membership/MembershipDrawCycle.tsx` — §7 carousel + countdown.
- `src/components/sections/membership/MembershipPrizeChooser.tsx` — §8 prize toggle.
- `src/components/sections/membership/MembershipWinnersWall.tsx` — §9 winners.
- `src/components/sections/membership/MembershipFinalCta.tsx` — §10 close.

**Modify:**
- `src/app/(site)/membership/components/MembershipPageClient.tsx` — full rewrite to new composition.
- `package.json` — add `test:climb-series` script.
- Domain Manifest in `CLAUDE.md` + `docs/subscription/`, `docs/shared-ui/` — Task 18.

**Untouched (shared — do not edit):** `MembershipSection.tsx`, `UnlockDiscounts.tsx`, `PartnerBenefitsPromoSection*.tsx`, `ElectricPackageCard.tsx`, `MembershipPackagesChart.tsx`, all of `MembershipModal/**`.

---

## Phase 1 — Foundations & page spine

### Task 1: `Seg` generic segmented toggle

**Files:**
- Create: `src/components/ui/Seg.tsx`

**Interfaces:**
- Produces: `export interface SegOption<T> { value: T; label: string; shortLabel?: string }` and `export default function Seg<T extends string>(props: { value: T; onChange: (v: T) => void; options: SegOption<T>[]; accentHex?: string; className?: string }): JSX.Element`

- [ ] **Step 1: Implement** — port the `WinnerFilterToggle` tablist markup but strip the `usePromoTheme` coupling and parameterize options + accent. Light-first surface (`bg-page`/`border-token`), selected pill uses `accentHex` (default `#ee0000`) via inline `style={{ background: accentHex }}` with white text; honor `aria-selected`/`role="tab"`.

```tsx
"use client";
import { cn } from "@/utils/cn";

export interface SegOption<T extends string> { value: T; label: string; shortLabel?: string }

export default function Seg<T extends string>({
  value, onChange, options, accentHex = "#ee0000", className,
}: { value: T; onChange: (v: T) => void; options: SegOption<T>[]; accentHex?: string; className?: string }) {
  return (
    <div role="tablist" className={cn(
      "inline-flex items-center gap-1 rounded-2xl border border-token bg-surface p-1.5 shadow-sm",
      "dark:bg-neutral-900/80", className,
    )}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="tab" aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-w-[88px] rounded-xl px-3 py-2 text-xs font-semibold tracking-[0.06em] transition-colors sm:min-w-[120px] sm:px-4",
              on ? "text-white shadow" : "text-muted-token hover:bg-black/5 hover:text-primary-token dark:hover:bg-white/10",
            )}
            style={on ? { background: accentHex } : undefined}>
            <span className="sm:hidden">{o.shortLabel ?? o.label}</span>
            <span className="hidden sm:inline">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify** — `npm run type-check` (no errors) and `npm run lint` (no new errors).
- [ ] **Step 3: Commit** (only if commits authorized): `git add src/components/ui/Seg.tsx && git commit -m "feat(membership): add generic Seg segmented toggle"`

### Task 2: `AccessRing` single-arc SVG ring

**Files:**
- Create: `src/components/ui/AccessRing.tsx`

**Interfaces:**
- Produces: `export default function AccessRing(props: { percent: number; size?: number; stroke?: number; color: string; trackColor?: string; children?: React.ReactNode; className?: string }): JSX.Element` (percent 0–100).

- [ ] **Step 1: Implement** — pure SVG, one track circle + one arc via `strokeDasharray`/`strokeDashoffset` (model on `src/components/admin/ui/Donut.tsx`), `-rotate-90`, centered children.

```tsx
"use client";
import { cn } from "@/utils/cn";

export default function AccessRing({
  percent, size = 104, stroke = 10, color, trackColor = "rgba(0,0,0,0.08)", children, className,
}: { percent: number; size?: number; stroke?: number; color: string; trackColor?: string; children?: React.ReactNode; className?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, percent));
  const offset = c * (1 - pct / 100);
  return (
    <div className={cn("relative inline-grid place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(.16,1,.3,1)" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Verify** — `npm run type-check`; `npm run lint`.
- [ ] **Step 3: Commit** (if authorized): `git commit -m "feat(membership): add AccessRing SVG progress ring"`

### Task 3: `useTilt` hook

**Files:**
- Create: `src/hooks/useTilt.ts`

**Interfaces:**
- Produces: `export function useTilt<T extends HTMLElement = HTMLDivElement>(maxDeg?: number): React.RefObject<T>` — attaches pointer-move tilt; no-op under `prefers-reduced-motion`.

- [ ] **Step 1: Implement**

```tsx
"use client";
import { useEffect, useRef } from "react";

export function useTilt<T extends HTMLElement = HTMLDivElement>(maxDeg = 5) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      el.style.transform = `perspective(900px) rotateY(${px * maxDeg * 2}deg) rotateX(${-py * maxDeg * 2}deg)`;
    };
    const onLeave = () => { el.style.transform = ""; };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => { el.removeEventListener("pointermove", onMove); el.removeEventListener("pointerleave", onLeave); };
  }, [maxDeg]);
  return ref;
}
```

- [ ] **Step 2: Verify** — `npm run type-check`; `npm run lint`.
- [ ] **Step 3: Commit** (if authorized): `git commit -m "feat(membership): add useTilt hook"`

### Task 4: `climb-series` util (TDD)

**Files:**
- Create: `src/utils/membership/climb-series.ts`
- Test: `src/utils/membership/__tests__/climb-series.test.ts`
- Modify: `package.json` (add `test:climb-series`)

**Interfaces:**
- Produces: `export function buildClimbSeries(baseEntries: number, promo: number, months: number): number[]` — cumulative standing entries: month 1 = `base*promo` (signup), each later month adds `base`. Matches the prototype `WhyMembersWinMore` accumulation. Returns length-`months` array.

- [ ] **Step 1: Write the failing test**

```ts
import { buildClimbSeries } from "../climb-series";
function assert(name: string, cond: boolean) { if (!cond) { console.error("FAIL", name); process.exitCode = 1; } else console.log("PASS", name); }

// Boss base 100, no promo, 6 months → 100,200,300,400,500,600
assert("boss no-promo", JSON.stringify(buildClimbSeries(100, 1, 6)) === JSON.stringify([100,200,300,400,500,600]));
// Foreman base 40, 2x promo, 6 months → 80,120,160,200,240,280 (month1=80, +40 each)
assert("foreman 2x", JSON.stringify(buildClimbSeries(40, 2, 6)) === JSON.stringify([80,120,160,200,240,280]));
// guards
assert("zero months", buildClimbSeries(100, 1, 0).length === 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx src/utils/membership/__tests__/climb-series.test.ts`
Expected: FAIL / module not found (function not defined yet).

- [ ] **Step 3: Implement**

```ts
/** Cumulative standing entries: month 1 = base*promo (signup boost), each later month +base. */
export function buildClimbSeries(baseEntries: number, promo: number, months: number): number[] {
  return Array.from({ length: Math.max(0, months) }, (_, i) => baseEntries * promo + baseEntries * i);
}
```

- [ ] **Step 4: Add the npm script** — in `package.json` `scripts`, add: `"test:climb-series": "tsx src/utils/membership/__tests__/climb-series.test.ts"`
- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:climb-series`
Expected: `PASS boss no-promo` / `PASS foreman 2x` / `PASS zero months`, exit 0.

- [ ] **Step 6: Commit** (if authorized): `git add src/utils/membership/climb-series.ts src/utils/membership/__tests__/climb-series.test.ts package.json && git commit -m "feat(membership): climb-series accumulation util + test"`

### Task 5: `useMembershipCardCta` hook (the money-path brain)

**Files:**
- Create: `src/hooks/useMembershipCardCta.ts`

**Interfaces:**
- Consumes: `useMemberships`, `convertToLocalPlan`, `useResolvedMultiplier`, `useMembershipModal`, `useMajorDrawPurchaseGate`, `useUserContext`, `useRouter`, `hasBlockingSubscription`, `hasAdditionalPackageAccess`, Klaviyo `trackKlaviyoStartedCheckout`.
- Produces:
```ts
export type MembershipTab = "membership" | "one-time";
export function useMembershipCardCta(): {
  activeTab: MembershipTab;
  setActiveTab: (t: MembershipTab) => void;
  membershipPlans: LocalMembershipPlan[];   // subscriptions, promo-applied
  oneTimePlans: LocalMembershipPlan[];        // access-filtered, promo-applied
  ctaLabelFor: (plan: LocalMembershipPlan) => string;
  isLocked: (plan: LocalMembershipPlan) => boolean;
  onSelect: (plan: LocalMembershipPlan) => void;
  membershipModal: ReturnType<typeof useMembershipModal>;
}
```

- [ ] **Step 1: Implement** — port `MembershipSection`'s logic verbatim (recon-verified). Build plan lists with promo applied; default tab; label/lock/select per the state machine.

```tsx
"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMemberships } from "@/hooks/useMemberships";
import { useMembershipModal } from "@/hooks/useMembershipModal";
import { useMajorDrawPurchaseGate } from "@/hooks/useMajorDrawPurchaseGate";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { useUserContext } from "@/contexts/UserContext";
import { convertToLocalPlan, type LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { hasBlockingSubscription } from "@/utils/subscription/subscription-helpers";
import { hasAdditionalPackageAccess } from "@/utils/membership/has-additional-package-access";
import { trackKlaviyoStartedCheckout } from "@/lib/klaviyo"; // VERIFY exact import path/name during impl

export type MembershipTab = "membership" | "one-time";

function applyPromo(plan: LocalMembershipPlan, multiplier: number): LocalMembershipPlan {
  if (multiplier <= 1) return plan;
  const base = plan.metadata?.entriesCount ?? 0;
  return { ...plan, metadata: { ...plan.metadata, entriesCount: base * multiplier, originalEntries: base, promoMultiplier: multiplier, isPromoActive: true } };
}

export function useMembershipCardCta() {
  const router = useRouter();
  const { userData, isAuthenticated, loading: userLoading } = useUserContext();
  const { subscriptionPackages, oneTimePackages } = useMemberships();
  const membershipModal = useMembershipModal();
  const { whenGatesOpenElseGateModal } = useMajorDrawPurchaseGate();
  const membershipMultiplier = useResolvedMultiplier("membership-packages") ?? 1;
  const oneTimeMultiplier = useResolvedMultiplier("one-time-packages") ?? 1;

  const hasActiveSubscription = userData?.subscription?.isActive || false;
  const isPastDue = userData?.subscription?.status === "past_due";
  const hasBlockingSub = hasBlockingSubscription(userData as never);
  const hasAccessToAdditional = hasAdditionalPackageAccess(userData as never, undefined);
  const currentPrice = userData?.subscriptionPackageData?.price ?? 0;
  const currentName = (userData?.subscriptionPackageData?.name ?? "").toLowerCase();

  const [activeTab, setActiveTab] = useState<MembershipTab>(
    hasActiveSubscription && hasAccessToAdditional ? "one-time" : "membership",
  );

  const membershipPlans = useMemo(
    () => subscriptionPackages.map(convertToLocalPlan).map((p) => applyPromo(p, membershipMultiplier)),
    [subscriptionPackages, membershipMultiplier],
  );
  const oneTimePlans = useMemo(() => {
    const all = oneTimePackages.map(convertToLocalPlan).map((p) => applyPromo(p, oneTimeMultiplier));
    return hasAccessToAdditional ? all.filter((p) => p.isMemberOnly) : all.filter((p) => !p.isMemberOnly);
  }, [oneTimePackages, oneTimeMultiplier, hasAccessToAdditional]);

  const isSubscriptionPlan = (p: LocalMembershipPlan) => p.period !== "one-time" && !p.name.toLowerCase().includes("one-time");
  const hierarchy = (p: LocalMembershipPlan) => {
    if (!hasActiveSubscription || !isSubscriptionPlan(p)) return { isCurrent: false, isUpgrade: false, isDowngrade: false };
    return { isCurrent: p.name.toLowerCase() === currentName, isUpgrade: p.price > currentPrice, isDowngrade: p.price < currentPrice };
  };

  const ctaLabelFor = (p: LocalMembershipPlan) => {
    if (hasBlockingSub && isPastDue && isSubscriptionPlan(p)) return "Update payment";
    if (hasActiveSubscription && activeTab === "membership") {
      const h = hierarchy(p);
      if (h.isCurrent) return "Current Plan";
      if (h.isDowngrade) return `Downgrade to ${p.name}`;
      if (h.isUpgrade) return `Upgrade to ${p.name}`;
    }
    return p.buttonText || "Enter Now";
  };

  const isLocked = (p: LocalMembershipPlan) => !hasAccessToAdditional && !!p.isMemberOnly;

  const onSelect = (plan: LocalMembershipPlan) =>
    whenGatesOpenElseGateModal(() => {
      const h = hierarchy(plan);
      if (hasBlockingSub && isPastDue) { router.push("/my-account"); return; }
      if (hasActiveSubscription && (h.isDowngrade || h.isUpgrade || h.isCurrent)) { router.push("/my-account"); return; }
      membershipModal.openModal(plan);
      if (isAuthenticated && !userLoading) {
        try { trackKlaviyoStartedCheckout(plan); } catch { /* non-blocking */ }
      }
    });

  return { activeTab, setActiveTab, membershipPlans, oneTimePlans, ctaLabelFor, isLocked, onSelect, membershipModal };
}
```

- [ ] **Step 2: Verify the imports resolve** — before relying on the above, confirm the exact export names/paths by reading: `src/utils/subscription/subscription-helpers.ts` (`hasBlockingSubscription` signature), `src/utils/membership/has-additional-package-access.ts` (`hasAdditionalPackageAccess` signature — second arg may be `userMajorDrawStats`; pass `undefined` if optional, else fetch via the same hook `MembershipSection` uses), and the Klaviyo checkout tracker name in `src/lib/klaviyo*` (the recon noted `trackKlaviyoStartedCheckout`). Fix imports/args to match. **Do not assume — trace it (CLAUDE.md §6).**
- [ ] **Step 3: Verify** — `npm run type-check` (resolve any signature mismatches surfaced); `npm run lint`.
- [ ] **Step 4: Commit** (if authorized): `git commit -m "feat(membership): useMembershipCardCta — ports purchase CTA state machine"`

### Task 6: Rewrite `MembershipPageClient` to the new spine

**Files:**
- Modify: `src/app/(site)/membership/components/MembershipPageClient.tsx` (full rewrite)

**Interfaces:**
- Consumes: all 10 section components (Tasks 7–16). Until they exist, render simple placeholder `<section>`s so the page compiles after each phase.
- Produces: the assembled page; mounts `MembershipModal` once via `useMembershipCardCta().membershipModal`.

- [ ] **Step 1: Implement the shell** — replace the file body. Keep `page.tsx` untouched. Compose sections in order; lazy-load the modal; pass the shared `cta` (so the modal mount and the §5 cards use the SAME `useMembershipModal` instance).

```tsx
"use client";
import dynamic from "next/dynamic";
import { useMembershipCardCta } from "@/hooks/useMembershipCardCta";
import MembershipHero from "@/components/sections/membership/MembershipHero";
import MembershipTrustStrip from "@/components/sections/membership/MembershipTrustStrip";
import MembershipBrandShowcase from "@/components/sections/membership/MembershipBrandShowcase";
import MembershipHowItWorks from "@/components/sections/membership/MembershipHowItWorks";
import MembershipTierChooser from "@/components/sections/membership/MembershipTierChooser";
import MembershipEntriesStack from "@/components/sections/membership/MembershipEntriesStack";
import MembershipDrawCycle from "@/components/sections/membership/MembershipDrawCycle";
import MembershipPrizeChooser from "@/components/sections/membership/MembershipPrizeChooser";
import MembershipWinnersWall from "@/components/sections/membership/MembershipWinnersWall";
import MembershipFinalCta from "@/components/sections/membership/MembershipFinalCta";
const MembershipModal = dynamic(() => import("@/components/modals/MembershipModal"), { ssr: false });

// FLAGGED FOR DELETION (do NOT delete here — user review pending; see docs spec):
//   MembershipPackagesChart — now only used by /my-account/membership after this rebuild.
// Removed from THIS page but KEPT (shared): MembershipSection, UnlockDiscounts, PartnerBenefitsPromoSection.

export default function MembershipPageClient() {
  const cta = useMembershipCardCta();
  return (
    <>
      <MembershipHero cta={cta} />
      <MembershipTrustStrip />
      <MembershipBrandShowcase />
      <MembershipHowItWorks />
      <MembershipTierChooser cta={cta} />
      <MembershipEntriesStack />
      <MembershipDrawCycle />
      <MembershipPrizeChooser />
      <MembershipWinnersWall />
      <MembershipFinalCta cta={cta} />
      <MembershipModal
        isOpen={cta.membershipModal.isModalOpen}
        onClose={cta.membershipModal.closeModal}
        selectedPlan={cta.membershipModal.selectedPlan}
        onPlanChange={cta.membershipModal.selectPlan}
      />
    </>
  );
}
```

- [ ] **Step 2: Add temporary placeholder components** so the page compiles before Tasks 7–16 are built. Create each section file as a minimal stub returning `<section id="…" className="py-16" />` (Hero/TrustStrip/etc.). Each stub that takes `cta` types it as `{ cta: ReturnType<typeof useMembershipCardCta> }`. (Each later task replaces its stub with the real implementation.)
- [ ] **Step 3: Verify** — `npm run type-check`; `npm run lint`; run `npm run dev` and confirm `/membership` renders without runtime error (placeholders visible, modal mounts).
- [ ] **Step 4: Commit** (if authorized): `git commit -m "refactor(membership): new page spine + section stubs, mount modal via shared CTA hook"`

---

## Phase 2 — Top of page

> Each section task: create the file (replacing its stub), port the named prototype component's markup to Tailwind, substitute primitives per the Global Constraints, wire the listed data, then verify (type-check + lint + visual parity vs the named prototype render).

### Task 7: `MembershipHero`

**Files:**
- Create/replace: `src/components/sections/membership/MembershipHero.tsx`

**Interfaces:**
- Consumes: `{ cta }`; `useMemberships`, `useResolvedMultiplier`, `AccessRing`, `BrandScroller`, `MetallicButton`, `getPackageIcon`, brand-tier colors.
- Port from: `proto/marketing.js` → `HeroSection` + `DeckCard`.

- [ ] **Step 1: Implement** — headline "Save big. **Win bigger.**"; sub mentions partner brands + $10,000 draw; primary CTA `MetallicButton` → `cta.onSelect(cta.membershipPlans.find(p=>p.name==='Tradie')!)` (Tradie sub) wrapped already by the hook; secondary CTA scrolls to `#prize`. Tier deck = three `DeckCard`s built from `cta.membershipPlans` (Tradie/Foreman/Boss) each showing `AccessRing` (percent from `getPartnerCatalogAccessPercentForPlanId('<tier>-subscription')` = 50/75/100), `plan.metadata.entriesCount` free entries/mo, `fmtMoney(price)`. Pin `BrandScroller speed={800} speedMobile={400}` near the bottom under a "WIN AUSTRALIA'S TOP TOOL BRANDS" label. Light-first hero surface with a dark photographic option per prototype; ship `dark:` pairs. Tier accent via `brand-tier-{tradie|foreman|boss}` classes / inline hex for the ring color (`#00c2ed`/`#ffd200`/`#ee0000`).
- [ ] **Step 2: Verify** — type-check; lint; visual parity vs prototype `Membership — Hero` (desktop + mobile).
- [ ] **Step 3: Commit** (if authorized): `git commit -m "feat(membership): hero section with tier deck + access rings"`

### Task 8: `MembershipTrustStrip`

**Files:**
- Create/replace: `src/components/sections/membership/MembershipTrustStrip.tsx`

**Interfaces:**
- Port from: `proto/marketing.js` → `TrustStrip`. No data deps (static copy). No numeric claims.

- [ ] **Step 1: Implement** — a horizontal strip of four items: "A winner every month", "Drawn live on Facebook", "Independently certified", "Partner brand discounts", each with a lucide icon in `brand-tier-boss`/red. Light surface, `dark:` pair. Use `SectionContainer`.
- [ ] **Step 2: Verify** — type-check; lint; visual parity.
- [ ] **Step 3: Commit** (if authorized): `git commit -m "feat(membership): trust strip"`

### Task 9: `MembershipBrandShowcase`

**Files:**
- Create/replace: `src/components/sections/membership/MembershipBrandShowcase.tsx`

**Interfaces:**
- Consumes: `BrandScroller`, `MetallicButton`, `{ cta }` optional (CTA opens modal with Tradie). Port from `proto/marketing.js` → `BrandShowcase` **minus the one-time PackHand** (one-time packs live in §5 — no duplication).
- Port from: `BrandShowcase` header + `BrandMarquee`.

- [ ] **Step 1: Implement** — eyebrow "Partner discounts", headline "Become a member, **unlock member-only partner discounts**", lead "Member pricing across the whole catalogue — one secure sign-on.", `MetallicButton` "Become a member" (opens modal via `cta`). Brand row = `BrandScroller`. Do NOT render the one-time pack hand here.
- [ ] **Step 2: Verify** — type-check; lint; visual parity (note: this section intentionally omits the prototype's one-time pack teaser).
- [ ] **Step 3: Commit** (if authorized): `git commit -m "feat(membership): partner brand showcase (no one-time teaser)"`

---

## Phase 3 — Conversion (highest risk)

### Task 10: `MembershipTierChooser` (§5)

**Files:**
- Create/replace: `src/components/sections/membership/MembershipTierChooser.tsx`

**Interfaces:**
- Consumes: `{ cta }` (Task 5), `Seg`, `AccessRing`, `getPackageIcon`, `getPartnerCatalogAccessPercentForPlanId`, brand-tier colors, `fmtMoney`.
- Port from: `proto/MembershipPage.js` → `TierCards`/`TierCard` (subscriptions) and `proto/marketing.js` → `PackCard`/`PackHand` (one-time).

- [ ] **Step 1: Implement the section** — `id="membership"` (preserve the existing scroll anchor). A `Seg` toggles `cta.activeTab` between `{value:"membership",label:"Membership"}` and `{value:"one-time",label:"One-Time"}`. 
  - **Membership tab:** map `cta.membershipPlans` to ported `TierCard`s. Each card: package icon (`getPackageIcon('<tier>-subscription')`), name, `AccessRing` percent = `getPartnerCatalogAccessPercentForPlanId(plan.id)`, hero number = `plan.metadata.entriesCount` ("free entries / month"), 3 trust feats (port copy), price `fmtMoney(plan.price)` "/ month", CTA button label = `cta.ctaLabelFor(plan)`, onClick = `() => cta.onSelect(plan)`. Foreman is the apex/popular card (`plan.isPopular`).
  - **One-Time tab:** map `cta.oneTimePlans` to ported `PackCard`s (one-time payment, `AccessRing` percent for the one-time ladder via `getPartnerCatalogAccessPercentForPlanId(plan.id)`, `metadata.entriesCount` free entries, `<n>-day window` if present in features/metadata, price). CTA label `cta.ctaLabelFor(plan)`, onClick `cta.onSelect(plan)`. Apply `cta.isLocked(plan)` to render the locked state (dimmed + "Subscription or Entries Required").
- [ ] **Step 2: Theming** — tier accent per card: `brand-tier-tradie #00c2ed / foreman #ffd200 / boss #ee0000`; one-time packs use the package color scheme (`getPackageColorScheme(plan.id)` → `scheme.bgGradient`, `scheme.borderGlow`). Use inline `style` for dynamic hexes (not safelisted).
- [ ] **Step 3: Verify the money path end-to-end** (CLAUDE.md §6 — walk every path): run `npm run dev`, then on `/membership`:
  - Guest: "Choose Tradie"/"Enter Now" opens `MembershipModal` with that plan (gate-closed modal if draw inactive).
  - Active subscriber: membership tab shows Current/Upgrade/Downgrade and routes to `/my-account`; one-time tab shows Additional packs.
  - past_due user: "Update payment" → `/my-account`.
  Confirm no double-mounted modal (the page mounts it once in Task 6).
- [ ] **Step 4: Verify** — type-check; lint; visual parity vs prototype `Membership — Tiers` (both tabs).
- [ ] **Step 5: Commit** (if authorized): `git commit -m "feat(membership): tier + one-time pack chooser wired to existing modal"`

---

## Phase 4 — Proof & rhythm

### Task 11: `MembershipHowItWorks`

**Files:**
- Create/replace: `src/components/sections/membership/MembershipHowItWorks.tsx`

**Interfaces:**
- Consumes: `cta.membershipPlans` for `MiniTierCard`s. Port from `proto/marketing.js` → `ScrollStory`/`MiniTierCard`/`StepViz`.

- [ ] **Step 1: Implement** — "How it works / Join once. **It pays all month.**" Three steps (port copy from `proto/data.js` `steps`): step 1 mini tier cards (price), step 2 mini tier cards (access %), step 3 "$10,000 won every 27th" viz. Use `cta.membershipPlans` for the mini cards (price + access). Static step copy.
- [ ] **Step 2: Verify** — type-check; lint; visual parity `Membership — How it works`.
- [ ] **Step 3: Commit** (if authorized): `git commit -m "feat(membership): how-it-works steps"`

### Task 12: `MembershipEntriesStack` (§6) + `ClimbChart` + `PartnerPortalPhone`

**Files:**
- Create: `src/components/sections/membership/ClimbChart.tsx`
- Create: `src/components/sections/membership/PartnerPortalPhone.tsx`
- Create/replace: `src/components/sections/membership/MembershipEntriesStack.tsx`

**Interfaces:**
- `ClimbChart(props: { tierId: "tradie"|"foreman"|"boss"; baseEntries: number; promo: number; accentHex: string; ghosts: { name: string; color: string; cum: number[] }[] })` — ported SVG from `proto/MembershipPage.js` `ClimbScene`, fed by `buildClimbSeries` (Task 4).
- `PartnerPortalPhone(props: { tierId; accentHex; accessPercent: number })` — ported from `proto/marketing.js` `PartnerPortal` + `proto/partials.js` `LivePartnerDeals`, using `AccessRing` and **real `PARTNER_BRAND_OFFERS`** (slice via `getPartnerCatalogVisibleSliceLength`).
- `MembershipEntriesStack` — dark beat section: `Seg` to switch tier, `AnimatedNumber` total, `ClimbChart`, `PartnerPortalPhone`, CTA.

- [ ] **Step 1: Implement `ClimbChart`** — port `ClimbScene` SVG (cubic-bezier `climbSmooth`, area gradient, ghost trails, halo, draw-on animation). Replace the prototype's `cum`/`ghosts` computation with `buildClimbSeries(baseEntries, promo, 6)` and ghosts from lower tiers. Guard the draw animation with `prefers-reduced-motion` (render final state immediately). Use inline `style`/SVG attrs for the dynamic `accentHex`.
- [ ] **Step 2: Implement `PartnerPortalPhone`** — port the phone mockup; access ring via `AccessRing percent={accessPercent}`; deals list from `PARTNER_BRAND_OFFERS.slice(0, getPartnerCatalogVisibleSliceLength(PARTNER_BRAND_OFFERS.length, '<tier>-subscription'))` showing `offer.name` + `offer.discount` (real). "+N more" where N = remaining catalogue. **No fabricated amounts; no hardcoded 7.**
- [ ] **Step 3: Implement `MembershipEntriesStack`** — dark section "Your entries don't reset. **They stack.**"; a `Seg` selects the tier; compute `base = { tradie:15, foreman:40, boss:100 }[tier]` (or read from `cta.membershipPlans`), `promo = useResolvedMultiplier('membership-packages') ?? 1`, `total = buildClimbSeries(base,promo,6).at(-1)`. Render `AnimatedNumber value={total}`, `ClimbChart`, then `PartnerPortalPhone`, then a primary CTA (opens modal via a passed `cta` or `MetallicButton` to `#membership`). (Pass `cta` as a prop if you want the CTA to open the modal directly; otherwise anchor to `#membership`.)
- [ ] **Step 4: Verify** — type-check; lint; visual parity `Membership — Why membership pays` (desktop + mobile; reduced-motion).
- [ ] **Step 5: Commit** (if authorized): `git commit -m "feat(membership): entries-stack climb chart + partner portal phone (real offers)"`

### Task 13: `MembershipDrawCycle` (§7)

**Files:**
- Create/replace: `src/components/sections/membership/MembershipDrawCycle.tsx`

**Interfaces:**
- Consumes: `useMajorDrawCountdown` (or `useCurrentMajorDraw` + `CountdownLeaf`), `Seg`/arrows. Port from `proto/MembershipPage.js` → `DrawCycle`.

- [ ] **Step 1: Implement** — the 3D coverflow carousel of the four stages (Renewal / Freeze / Live draw / Next cycle), auto-advance 3600ms, drag + arrows + dots, `prefers-reduced-motion` guard (no auto-advance). Port the `ringStyle` math. "27th" stage labels are copy; bind any live countdown to the real draw: `const { timeRemaining, targetDateMs } = useMajorDrawCountdown()` and render a true 1s tick with `<CountdownLeaf targetMs={targetDateMs}>{(ms)=>…}</CountdownLeaf>` (target = `freezeEntriesAt || drawDate`). If no active draw, render the static cycle without a live countdown.
- [ ] **Step 2: Verify** — type-check; lint; visual parity `Membership — Draw cycle` (carousel spins; reduced-motion static).
- [ ] **Step 3: Commit** (if authorized): `git commit -m "feat(membership): draw-cycle carousel + live countdown"`

---

## Phase 5 — Prize, winners, close

### Task 14: `MembershipPrizeChooser` (§8)

**Files:**
- Create/replace: `src/components/sections/membership/MembershipPrizeChooser.tsx`

**Interfaces:**
- Consumes: `usePrizeCatalog`, `Seg`, `AnimatedNumber`, `next/image`. Port from `proto/MembershipPage.js` → `PrizeChooser`.

- [ ] **Step 1: Implement** — dark beat "This month's prize / Win the lot. **Or take the cash.**" `Seg` toggles `"setup" | "cash"`. `const { activePrize, resolvePrize } = usePrizeCatalog();` setup = `activePrize` (image `activePrize.gallery[0].src`, label `activePrize.label`/`heroHeading`, value via `activePrize.prizeValueLabel` string); cash = `resolvePrize("cash-prize")` (image `/images/majordraws/cash-prize/cash-prize-10000.webp`, "$10,000 Cash"). `AnimatedNumber` for the dollar amount with `format={(n)=>`$${Math.round(n).toLocaleString()}`}` (5000 for setup "+$5k on top" copy / 10000 for cash). Items list = port the prototype bullet copy. CTA + "Drawn live on Facebook, 27th · certified" footer. Remember `prizeValueLabel` is a STRING, images are `gallery[].src`.
- [ ] **Step 2: Verify** — type-check; lint; visual parity `Membership — Prize` (both toggle states).
- [ ] **Step 3: Commit** (if authorized): `git commit -m "feat(membership): prize chooser (setup vs cash)"`

### Task 15: `MembershipWinnersWall` (§9)

**Files:**
- Create/replace: `src/components/sections/membership/MembershipWinnersWall.tsx`

**Interfaces:**
- Consumes: `useMajorDrawWinners`, `useTilt`, `next/image`, `Badge`. Port from `proto/marketing.js` → `WinnersWall`/`WinnerCard`.

- [ ] **Step 1: Implement** — "Past winners / Real tradies, real gear." Grid of `useMajorDrawWinners()` data: `name = `${w.winnerFirstName} ${w.winnerLastName}``, location = `w.winnerState` (**state, not suburb**), prize = `w.prize.name`, photo = `w.imageUrl` with **monogram fallback** (initials on a tier-coloured tile) when absent, "Won" date = `w.drawDate`. `Badge` "Verified draw" (qualitative — no fabricated per-winner link). Card tilt via `useTilt(5)`. Show a small "Every draw goes out live on the 27th — independent & certified" note; link the section to `/winners`. Handle empty/loading (skeleton or hide).
- [ ] **Step 2: Verify** — type-check; lint; visual parity `Membership — Winners`; confirm a winner with no `imageUrl` shows the monogram fallback, not a broken image.
- [ ] **Step 3: Commit** (if authorized): `git commit -m "feat(membership): winners wall (real winners, state + monogram fallback)"`

### Task 16: `MembershipFinalCta` (§10)

**Files:**
- Create/replace: `src/components/sections/membership/MembershipFinalCta.tsx`

**Interfaces:**
- Consumes: `{ cta }`, `MetallicButton`, `fmtMoney`, referral count constant. Port from `proto/MembershipPage.js` → `FinalCTA`.

- [ ] **Step 1: Implement** — dark beat: eyebrow "Refer a mate — you both get 100 free entries" (referral count copy; logged-out deep-links to join/refer, no personal code), headline "Join today. **Be in this month's draw.**", sub "Discounts at our partner brands, free entries every month, drawn live on the 27th. From $20/mo, cancel anytime." (price from `cta.membershipPlans[0].price`). Primary CTA "Become a member" → `cta.onSelect(Tradie)`; secondary "Compare tiers" → scroll to `#membership`.
- [ ] **Step 2: Verify** — type-check; lint; visual parity `Membership — Final CTA`.
- [ ] **Step 3: Commit** (if authorized): `git commit -m "feat(membership): final CTA / refer-a-mate"`

---

## Phase 6 — Integration, docs, flags

### Task 17: Final integration pass

**Files:**
- Modify: `src/app/(site)/membership/components/MembershipPageClient.tsx` (confirm all real sections wired; no leftover stubs/imports of removed sections)

- [ ] **Step 1:** Confirm `MembershipPageClient` imports the 10 real sections (no stubs remain) and no longer imports `PartnerBenefitsPromoSectionClient`, `MembershipSection`, `MembershipPackagesChart`, or `UnlockDiscounts`. Verify `page.tsx` metadata unchanged.
- [ ] **Step 2: Full verification** — `npm run type-check` (clean), `npm run lint` (clean), `npm run build` (succeeds — catches client/server boundary + image manifest issues). Then `npm run dev` and do a full top-to-bottom visual parity pass of `/membership` at mobile + desktop against the prototype, plus the three user states (guest / active subscriber / past_due) through §5.
- [ ] **Step 3: Commit** (if authorized): `git commit -m "feat(membership): wire all redesigned sections into the page"`

### Task 18: Docs, manifest, deletion flags

**Files:**
- Modify: `CLAUDE.md` Domain Manifest (add `src/components/sections/membership/**`, `src/hooks/useMembershipCardCta.ts`, `src/hooks/useTilt.ts`, `src/utils/membership/climb-series.ts`, `src/components/ui/Seg.tsx`, `src/components/ui/AccessRing.tsx` to the right domains — `subscription` for the membership page/hook, `shared-ui` for the ui primitives)
- Modify: `docs/subscription/` and `docs/shared-ui/` (document the new page composition + primitives)
- Create/modify: a deletion-flag note (e.g. `docs/subscription/REDESIGN-DELETION-FLAGS.md`) listing `MembershipPackagesChart` as the orphan candidate (kept, pending user decision)

- [ ] **Step 1:** Update the Domain Manifest `paths` so the new files map to a domain (else the doc-sync hook blocks). Add the membership section folder + hooks to `subscription`; the `ui/` primitives to `shared-ui`.
- [ ] **Step 2:** Update `docs/subscription/` (new `/membership` composition, the `useMembershipCardCta` flow) and `docs/shared-ui/` (`Seg`, `AccessRing`, `useTilt`). Write the deletion-flag note: `MembershipPackagesChart` is now only used by `/my-account/membership` after this rebuild — flag for deletion once that page is also redesigned; do not delete now.
- [ ] **Step 3:** If the doc-sync Stop hook reports `STALE BUSINESS DOCS` (a `BUSINESS_TRIGGER_GLOB` was touched) and no business fact actually changed, make a one-line clarifying touch to the relevant BUSINESS.md section to clear it. (No tier price/entry/access % changed in this redesign.)
- [ ] **Step 4: Verify** — `npm run type-check`; `npm run lint`; confirm the Stop hook passes.
- [ ] **Step 5: Commit** (if authorized): `git commit -m "docs(membership): manifest + domain docs + deletion-flag note"`

---

## Self-Review

**Spec coverage:** all 10 sections (Tasks 7–16) ✓; conversion model "new cards drive existing modal" (Task 5 + 10) ✓; both card ladders (Task 10) ✓; real partner offers (Task 12) ✓; keep all three tier renders (hero deck T7 / how-it-works T11 / tier cards T10) ✓; catalogue scalability — no hardcoded 7 (T9, T12) ✓; gap handling (state-not-suburb + monogram T15; prizeValueLabel/gallery T14; countdown bound to drawDate T13) ✓; flag-only deletion (T6 comment + T18 note) ✓; recompose-only / shared components untouched (Global Constraints) ✓.

**Placeholder scan:** the only deliberate "verify before relying" item is Task 5 Step 2 (exact `hasBlockingSubscription` / `hasAdditionalPackageAccess` / Klaviyo import signatures) — that's a required code-tracing step (CLAUDE.md §6), not a placeholder; real code is provided to adjust. No TODO/TBD left.

**Type consistency:** `LocalMembershipPlan` is the single card type end-to-end (Task 5 produces, Tasks 7/10/11/16 consume); `useMembershipCardCta` return shape is fixed and consumed identically; `Seg`/`AccessRing`/`useTilt` signatures match their call sites; `buildClimbSeries` signature matches `ClimbChart`.

**Risk note:** Task 10 (money path) is the highest-risk task and has an explicit end-to-end multi-state verification step before commit.
