# Membership Section Electric Card Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an isolated, dev-only electric-themed package card preview (`/dev/membershipsection`) with a computed 50%-off badge for additional packs, without touching the live `MembershipSection`.

**Architecture:** Phase-1, additive only. New self-contained electric color schemes file (reuses the existing `PackageColorScheme` type, zero edits to `packageColorScheme.ts`), a pure discount-pairing util, a presentational `ElectricPackageCard`, and a dev-only harness page with config controls. Live `MembershipSection` and existing color maps are untouched; production renders unchanged.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind, `tsx` standalone test scripts (no jest/vitest in this repo).

**Spec:** `docs/superpowers/specs/2026-05-15-membership-section-electric-redesign-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/utils/package-colors/electricPackageScheme.ts` (create) | 6 electric `PackageColorScheme` objects + `getElectricPackageColorScheme(planId)` resolver. Self-contained; reuses existing `PackageColorScheme` type. |
| `src/utils/package-colors/__tests__/electricPackageScheme.test.ts` (create) | tsx test: each tier slot resolves to expected `accentHex`. |
| `src/utils/membership/additional-pack-discount.ts` (create) | `getAdditionalPackDiscount(planId)` pure pairing util. |
| `src/utils/membership/__tests__/additional-pack-discount.test.ts` (create) | tsx test: 5 active additional packs → 50% pair; others → `null`. |
| `src/components/sections/membership/ElectricPackageCard.tsx` (create) | Pure presentational redesigned card. |
| `src/components/dev/MembershipSectionDevClient.tsx` (create) | `"use client"` harness: config panel + preview grid. |
| `src/app/dev/membershipsection/page.tsx` (create) | Server route, 404 in production. |
| `package.json` (modify) | Add `test:electric-scheme` and `test:additional-pack-discount` scripts. |
| `docs/upsell/*`, `docs/subscription/*`, `docs/shared-ui/*` (modify) | Domain doc updates per doc-sync hook. |

TDD applies to the two pure utils (Tasks 1–2). The card and harness (Tasks 3–4) are visual; this repo has **no component test runner**, so their verification is `npm run type-check` + `npm run lint` + manual dev-page review (documented explicitly, not faked as automated tests).

---

### Task 1: Electric color schemes module

**Files:**
- Create: `src/utils/package-colors/electricPackageScheme.ts`
- Test: `src/utils/package-colors/__tests__/electricPackageScheme.test.ts`
- Modify: `package.json` (scripts block, near line 25)

- [ ] **Step 1: Write the failing test**

Create `src/utils/package-colors/__tests__/electricPackageScheme.test.ts`:

```ts
import assert from "node:assert/strict";
import { getElectricPackageColorScheme } from "../electricPackageScheme";

function run() {
  const cases: Array<[string, string]> = [
    ["apprentice-pack", "#1E90FF"],
    ["tradie-pack", "#CCFF00"],
    ["foreman-pack", "#00E5FF"],
    ["boss-pack", "#FFD700"],
    ["power-pack", "#FF1F1F"],
    ["vip-pack", "#FFD700"],
    // additional + -member suffix normalize to the same tier slot
    ["additional-tradie-pack", "#CCFF00"],
    ["additional-vip-pack-member", "#FFD700"],
  ];
  for (const [planId, expectedAccent] of cases) {
    const scheme = getElectricPackageColorScheme(planId);
    assert.equal(scheme.accentHex, expectedAccent, `accentHex for ${planId}`);
    assert.ok(scheme.bgGradient.length > 0, `bgGradient for ${planId}`);
    assert.ok(scheme.badgeStyle.background.length > 0, `badgeStyle for ${planId}`);
  }
  // Unknown id falls back deterministically (electric-red) rather than throwing.
  assert.equal(getElectricPackageColorScheme("totally-unknown").accentHex, "#FF1F1F");
  console.log("electricPackageScheme: all assertions passed");
}

run();
```

- [ ] **Step 2: Add the npm test script**

In `package.json`, in the `"scripts"` block, add next to the other `test:*` entries (e.g. after line 25 `"test:anchor-billing": ...`):

```json
    "test:electric-scheme": "tsx src/utils/package-colors/__tests__/electricPackageScheme.test.ts",
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:electric-scheme`
Expected: FAIL — `Cannot find module '../electricPackageScheme'`.

- [ ] **Step 4: Write the implementation**

Create `src/utils/package-colors/electricPackageScheme.ts`:

```ts
/**
 * Electric package color schemes — Phase 1, dev-only.
 *
 * Self-contained: reuses the existing PackageColorScheme shape but does NOT
 * extend COLOR_KEYS or touch packageColorScheme.ts (zero production impact).
 * Applied only to one-time + additional package cards by ElectricPackageCard.
 * Membership-tab subscriptions keep their existing scheme (resolved elsewhere).
 */
import type { PackageColorScheme } from "@/utils/package-colors/packageColorScheme";

type ElectricTier = "apprentice" | "tradie" | "foreman" | "boss" | "power" | "vip";

/** rgba tuple "r,g,b,a" string per the approved spec image. */
interface ElectricSpec {
  primary: string;
  dark: string;
  glowRgba: string;
  blackText: boolean;
}

const ELECTRIC: Record<Exclude<ElectricTier, "vip">, ElectricSpec> = {
  apprentice: { primary: "#1E90FF", dark: "#0066CC", glowRgba: "30,144,255,0.4", blackText: false },
  tradie: { primary: "#CCFF00", dark: "#7FB800", glowRgba: "204,255,0,0.4", blackText: true },
  foreman: { primary: "#00E5FF", dark: "#0099B8", glowRgba: "0,229,255,0.4", blackText: false },
  boss: { primary: "#FFD700", dark: "#B8860B", glowRgba: "255,215,0,0.45", blackText: true },
  power: { primary: "#FF1F1F", dark: "#A30000", glowRgba: "255,31,31,0.45", blackText: false },
};

function makeElectric(s: ElectricSpec): PackageColorScheme {
  const textColor = s.blackText ? "text-black" : "text-white";
  const inset = s.blackText
    ? "inset 0 1px 0 rgba(255,255,255,0.6)"
    : "inset 0 1px 0 rgba(255,255,255,0.25)";
  return {
    bgGradient: `linear-gradient(135deg, ${s.dark} 0%, ${s.primary} 50%, ${s.dark} 100%)`,
    gradient: `from-[${s.dark}] via-[${s.primary}] to-[${s.dark}]`,
    text: textColor,
    textMuted: s.blackText ? "text-black/80" : "text-white/90",
    priceText: textColor,
    priceBadgeBg: "bg-white/20 backdrop-blur-sm",
    buttonBg: `bg-[${s.dark}] active:scale-[0.98] border border-white/15`,
    buttonShadow: "shadow-[0_2px_8px_rgba(0,0,0,0.2)]",
    buttonHoverShadow: `hover:shadow-[0_4px_16px_rgba(${s.glowRgba})]`,
    buttonText: textColor,
    glow: `drop-shadow-[0_0_20px_rgba(${s.glowRgba})]`,
    border: `border-[${s.primary}]/55`,
    shadow: `shadow-[${s.primary}]/40`,
    hoverShadow: `hover:shadow-[${s.primary}]/60`,
    // No looping animation in Phase 1 — hover glow handled by the card.
    borderGlow: "",
    badgeStyle: {
      background: s.primary,
      boxShadow: `0 0 35px rgba(${s.glowRgba}), 0 4px 20px rgba(${s.glowRgba}), ${inset}`,
      border: `1px solid ${s.primary}`,
    },
    accentHex: s.primary,
    entriesText: textColor,
    cardBorderOpacity: "CC",
  };
}

/** VIP — matte black + polished gold, gradient text (mirrors existing `black`). */
const ELECTRIC_BLACK: PackageColorScheme = {
  bgGradient: "linear-gradient(135deg, #000000 0%, #0A0A0A 50%, #000000 100%)",
  gradient: "from-[#000000] via-[#0d0d0d] to-[#000000]",
  text: "text-premium-gold",
  textMuted: "text-premium-gold/90",
  priceText: "text-premium-gold",
  priceBadgeBg: "bg-white/10 backdrop-blur-sm",
  buttonBg: "bg-[#0a0a0a] active:scale-[0.98] border border-premium-gold/40",
  buttonShadow: "shadow-[0_2px_8px_rgba(0,0,0,0.4)]",
  buttonHoverShadow: "hover:shadow-[0_4px_16px_rgba(255,215,0,0.35)]",
  buttonText: "text-premium-gold",
  glow: "drop-shadow-[0_0_22px_rgba(255,215,0,0.35)]",
  border: "border-premium-gold/40",
  shadow: "shadow-[#FFD700]/20",
  hoverShadow: "hover:shadow-[#FFD700]/35",
  borderGlow: "",
  badgeStyle: {
    background: "#0a0a0a",
    boxShadow:
      "0 0 35px rgba(255,215,0,0.2), 0 4px 20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,215,0,0.25)",
    border: "1px solid rgba(255,215,0,0.45)",
  },
  accentHex: "#FFD700",
  entriesText: "text-premium-gold",
  cardBorderOpacity: "CC",
  textGradientStyle: {
    backgroundImage:
      "linear-gradient(135deg, #FFF8E7 0%, #FFE55C 18%, #FFD700 38%, #E5A000 58%, #B8860B 78%, #6B4423 100%)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
    color: "transparent",
  },
  cardBorderGradient:
    "linear-gradient(135deg, #FFF8E7 0%, #FFE55C 18%, #FFD700 38%, #E5A000 58%, #B8860B 78%, #6B4423 100%)",
};

const SCHEMES: Record<ElectricTier, PackageColorScheme> = {
  apprentice: makeElectric(ELECTRIC.apprentice),
  tradie: makeElectric(ELECTRIC.tradie),
  foreman: makeElectric(ELECTRIC.foreman),
  boss: makeElectric(ELECTRIC.boss),
  power: makeElectric(ELECTRIC.power),
  vip: ELECTRIC_BLACK,
};

/** Normalize any plan id (incl. `additional-*`, `*-member`) to an electric tier. */
function planIdToElectricTier(planId: string): ElectricTier {
  const id = planId.toLowerCase();
  if (id.includes("vip")) return "vip";
  if (id.includes("apprentice")) return "apprentice";
  if (id.includes("tradie")) return "tradie";
  if (id.includes("foreman")) return "foreman";
  if (id.includes("boss")) return "boss";
  if (id.includes("power")) return "power";
  return "power"; // deterministic fallback (electric-red)
}

/**
 * Electric scheme for a one-time / additional package id.
 * Opt-in: only ElectricPackageCard uses this. Live MembershipSection is unaffected.
 */
export function getElectricPackageColorScheme(planId: string): PackageColorScheme {
  return SCHEMES[planIdToElectricTier(planId)];
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:electric-scheme`
Expected: PASS — `electricPackageScheme: all assertions passed`.

- [ ] **Step 6: Type-check**

Run: `npm run type-check`
Expected: no errors referencing the new files.

- [ ] **Step 7: Commit**

```bash
git add src/utils/package-colors/electricPackageScheme.ts src/utils/package-colors/__tests__/electricPackageScheme.test.ts package.json
git commit -m "feat(package-colors): add isolated electric package color schemes (dev phase 1)"
```

---

### Task 2: Additional-pack discount util

**Files:**
- Create: `src/utils/membership/additional-pack-discount.ts`
- Test: `src/utils/membership/__tests__/additional-pack-discount.test.ts`
- Modify: `package.json` (scripts block)

- [ ] **Step 1: Write the failing test**

Create `src/utils/membership/__tests__/additional-pack-discount.test.ts`:

```ts
import assert from "node:assert/strict";
import { getAdditionalPackDiscount } from "../additional-pack-discount";

function run() {
  // All 5 active additional packs are exactly 50% of the matching non-member pack.
  const pairs: Array<[string, number, number]> = [
    ["additional-tradie-pack", 50, 25],
    ["additional-foreman-pack", 100, 50],
    ["additional-boss-pack", 250, 125],
    ["additional-power-pack", 500, 250],
    ["additional-vip-pack", 1000, 500],
  ];
  for (const [id, regular, discounted] of pairs) {
    const d = getAdditionalPackDiscount(id);
    assert.ok(d, `expected discount for ${id}`);
    assert.equal(d!.regularPrice, regular, `regularPrice ${id}`);
    assert.equal(d!.discountedPrice, discounted, `discountedPrice ${id}`);
    assert.equal(d!.percentOff, 50, `percentOff ${id}`);
  }

  // The `-member` suffix (used by useMemberships) still resolves.
  assert.ok(getAdditionalPackDiscount("additional-tradie-pack-member"));

  // No discount for: inactive additional apprentice, regular one-time, subscription.
  assert.equal(getAdditionalPackDiscount("additional-apprentice-pack"), null);
  assert.equal(getAdditionalPackDiscount("tradie-pack"), null);
  assert.equal(getAdditionalPackDiscount("boss-subscription"), null);
  assert.equal(getAdditionalPackDiscount("nonsense"), null);

  console.log("additional-pack-discount: all assertions passed");
}

run();
```

- [ ] **Step 2: Add the npm test script**

In `package.json` `"scripts"`, add:

```json
    "test:additional-pack-discount": "tsx src/utils/membership/__tests__/additional-pack-discount.test.ts",
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:additional-pack-discount`
Expected: FAIL — `Cannot find module '../additional-pack-discount'`.

- [ ] **Step 4: Write the implementation**

Create `src/utils/membership/additional-pack-discount.ts`:

```ts
import { membershipPackages } from "@/data/membershipPackages";

export interface AdditionalPackDiscount {
  regularPrice: number;
  discountedPrice: number;
  percentOff: number;
}

/**
 * Additional (member) packs are priced at a fraction of the matching
 * non-member `{tier}-pack` with the same entries. Returns the comparison
 * anchor + computed percentage, or null when there is no genuine discount
 * (regular one-time packs, subscriptions, inactive packs, unresolved pairs).
 *
 * Accepts ids with the `-member` suffix added by useMemberships.
 */
export function getAdditionalPackDiscount(planId: string): AdditionalPackDiscount | null {
  const id = planId.toLowerCase().replace(/-member$/, "");
  const match = id.match(/^additional-([a-z]+)-pack$/);
  if (!match) return null;

  const tier = match[1];
  const additionalId = `additional-${tier}-pack`;
  const regularId = `${tier}-pack`;

  const additional = membershipPackages.find((p) => p._id === additionalId);
  const regular = membershipPackages.find((p) => p._id === regularId);

  if (!additional || !regular || !additional.isActive) return null;
  if (!(regular.price > additional.price)) return null;

  return {
    regularPrice: regular.price,
    discountedPrice: additional.price,
    percentOff: Math.round((1 - additional.price / regular.price) * 100),
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:additional-pack-discount`
Expected: PASS — `additional-pack-discount: all assertions passed`.

- [ ] **Step 6: Commit**

```bash
git add src/utils/membership/additional-pack-discount.ts src/utils/membership/__tests__/additional-pack-discount.test.ts package.json
git commit -m "feat(membership): add computed additional-pack 50%-off discount util"
```

---

### Task 3: ElectricPackageCard component

**Files:**
- Create: `src/components/sections/membership/ElectricPackageCard.tsx`

No automated test (no component runner in repo). Verified by type-check + lint here and visually in Task 4.

- [ ] **Step 1: Write the component**

Create `src/components/sections/membership/ElectricPackageCard.tsx`:

```tsx
"use client";

import React from "react";
import Image from "next/image";
import { getPackageDisplayName } from "@/utils/membership/getDisplayName";
import { getPackageIcon } from "@/utils/images/package-icons";
import type { PackageColorScheme } from "@/utils/package-colors/packageColorScheme";
import { getCardBorderStyle } from "@/utils/package-colors/packageColorScheme";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { cn } from "@/utils/cn";

export interface ElectricPackageCardState {
  locked: boolean;
  lockReason?: string;
  isCurrent: boolean;
}

export interface ElectricPackageCardProps {
  plan: LocalMembershipPlan;
  colorScheme: PackageColorScheme;
  state: ElectricPackageCardState;
  discount?: { regularPrice: number; percentOff: number } | null;
  onSelect: (plan: LocalMembershipPlan) => void;
}

/** Reads the entries number out of the plan's feature list (mirrors MembershipSection). */
function readEntries(plan: LocalMembershipPlan): { original: number; display: number; multiplied: boolean } {
  const feature = plan.features.find((f) => /entries/i.test(f.text));
  const base = feature ? parseInt(feature.text.match(/(\d+)/)?.[1] ?? "0", 10) : 0;
  const m = typeof plan.metadata?.promoMultiplier === "number" ? plan.metadata.promoMultiplier : 0;
  if (m > 1) {
    const original = plan.metadata?.originalEntries ?? base;
    const display = plan.metadata?.entriesCount ?? base;
    return { original, display, multiplied: true };
  }
  return { original: base, display: base, multiplied: false };
}

export default function ElectricPackageCard({
  plan,
  colorScheme,
  state,
  discount,
  onSelect,
}: ElectricPackageCardProps) {
  const icon = getPackageIcon(plan.id);
  const entries = readEntries(plan);
  const interactive = !state.locked && !state.isCurrent;
  const gradientText = colorScheme.textGradientStyle;

  return (
    <div
      className={cn(
        "relative w-full rounded-3xl overflow-visible",
        "transition-[transform,box-shadow] duration-[var(--ta-transition-dur)]",
        interactive && "hover:scale-[1.02] hover:brightness-110"
      )}
      style={{ boxShadow: `0 0 24px ${colorScheme.accentHex}30, 0 8px 32px ${colorScheme.accentHex}1A` }}
    >
      {/* Brand gradient body + electric edge */}
      <div
        className="relative isolate h-full rounded-3xl p-4 pt-10"
        style={{
          background: colorScheme.bgGradient,
          backgroundOrigin: "border-box",
          ...getCardBorderStyle(colorScheme, colorScheme.bgGradient),
        }}
      >
        {/* Static electric inner sheen */}
        <div
          className="pointer-events-none absolute inset-0.5 rounded-2xl z-0"
          style={{
            background: `radial-gradient(120% 80% at 50% 0%, rgba(255,255,255,0.14) 0%, transparent 55%), linear-gradient(to top, ${colorScheme.accentHex}22 0%, transparent 60%)`,
          }}
          aria-hidden
        />

        {/* Icon */}
        {icon && (
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-20">
            <div className="w-20 h-20 sm:w-24 sm:h-24 relative">
              <Image
                src={icon}
                alt={`${getPackageDisplayName(plan)} icon`}
                fill
                sizes="(max-width: 640px) 80px, 96px"
                className={cn("object-contain opacity-90", colorScheme.glow)}
              />
            </div>
          </div>
        )}

        <div className="relative z-10 flex h-full flex-col uppercase">
          {/* Title */}
          <h3
            className={cn("text-center font-sans font-bold text-[19px] sm:text-[20px] leading-tight", gradientText ? "" : colorScheme.text)}
            style={gradientText}
          >
            {getPackageDisplayName(plan)}
          </h3>

          {/* Entries */}
          <div className={cn("mt-1 text-center", gradientText ? "" : colorScheme.text)}>
            {entries.multiplied ? (
              <div className="flex items-center justify-center gap-1.5">
                <span className={cn("text-[20px] font-bold line-through opacity-40", colorScheme.textMuted)}>
                  {entries.original}
                </span>
                <span className="text-[18px] font-bold" style={gradientText}>→</span>
                <span className={cn("text-[34px] font-bold", gradientText ? "" : colorScheme.entriesText)} style={gradientText}>
                  {entries.display}
                </span>
              </div>
            ) : (
              <span className={cn("text-[34px] font-bold", gradientText ? "" : colorScheme.entriesText)} style={gradientText}>
                {entries.display}
              </span>
            )}
            <div className={cn("text-[16px] font-semibold", gradientText ? "" : colorScheme.textMuted)} style={gradientText}>
              free entries
            </div>
          </div>

          <div className="my-2 h-px w-full rounded-full bg-white/70 dark:bg-neutral-600/50" />

          {/* Price block — strikethrough + now + % OFF badge live HERE (never top-right) */}
          <button
            type="button"
            disabled={!interactive}
            onClick={() => interactive && onSelect(plan)}
            aria-label={`Select ${getPackageDisplayName(plan)} for $${plan.price}`}
            className={cn(
              "mx-auto mb-3 flex w-fit items-center gap-2 rounded-2xl bg-gradient-to-r px-3 py-1.5",
              colorScheme.gradient,
              colorScheme.buttonShadow,
              interactive ? "cursor-pointer hover:opacity-90" : "cursor-not-allowed opacity-90"
            )}
          >
            {discount && (
              <span className={cn("text-sm font-bold line-through opacity-50", colorScheme.buttonText)}>
                ${discount.regularPrice}
              </span>
            )}
            <span className={cn("text-[20px] font-bold", colorScheme.buttonText)}>${plan.price}</span>
            <span className={cn("text-[11px] font-semibold opacity-90", colorScheme.buttonText)}>
              {plan.period === "one-time" ? "one time" : "per giveaway"}
            </span>
            {discount && (
              <span
                className="rounded-md px-1.5 py-0.5 text-[11px] font-black"
                style={{ ...colorScheme.badgeStyle }}
              >
                {discount.percentOff}% OFF
              </span>
            )}
          </button>

          {/* CTA */}
          <div className="mt-auto">
            <button
              type="button"
              disabled={!interactive}
              onClick={() => interactive && onSelect(plan)}
              className={cn(
                "flex h-[48px] w-full items-center justify-center rounded-2xl px-5 font-sans font-black uppercase text-[15px]",
                colorScheme.buttonText,
                interactive ? "hover:brightness-110" : "opacity-60 cursor-not-allowed"
              )}
              style={(colorScheme.enterNowButtonStyle ?? colorScheme.badgeStyle) as React.CSSProperties}
            >
              <span style={gradientText ?? undefined}>
                {state.isCurrent ? "Current Plan" : state.locked ? state.lockReason ?? "Locked" : "Enter Now"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: no errors. (If `getPackageIcon` return type is not directly assignable to `Image src`, wrap with `src={icon as unknown as import("next/image").StaticImageData}` — but it returns `PackageIconData` which is a static import and is assignable; no change expected.)

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors for the new file.

- [ ] **Step 4: Commit**

```bash
git add src/components/sections/membership/ElectricPackageCard.tsx
git commit -m "feat(membership): add isolated ElectricPackageCard (presentational, dev phase 1)"
```

---

### Task 4: Dev harness page + client

**Files:**
- Create: `src/components/dev/MembershipSectionDevClient.tsx`
- Create: `src/app/dev/membershipsection/page.tsx`

- [ ] **Step 1: Write the client harness**

Create `src/components/dev/MembershipSectionDevClient.tsx`:

```tsx
"use client";

import React, { useMemo, useState } from "react";
import { membershipPackages, type StaticMembershipPackage } from "@/data/membershipPackages";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { getElectricPackageColorScheme } from "@/utils/package-colors/electricPackageScheme";
import { getMembershipSectionColorScheme } from "@/utils/package-colors/packageColorScheme";
import { getAdditionalPackDiscount } from "@/utils/membership/additional-pack-discount";
import ElectricPackageCard from "@/components/sections/membership/ElectricPackageCard";

type UserState = "guest" | "subscriber" | "entries";
type Tab = "one-time" | "membership";
type Mult = 1 | 2 | 5 | 10;

function toLocalPlan(pkg: StaticMembershipPackage, mult: Mult): LocalMembershipPlan {
  const baseEntries = pkg.type === "subscription" ? pkg.entriesPerMonth ?? 0 : pkg.totalEntries ?? 0;
  const id = pkg.isMemberOnly ? `${pkg._id}-member` : pkg._id;
  const multiplied = mult > 1;
  return {
    id,
    name: pkg.name,
    price: pkg.price,
    period: pkg.type === "subscription" ? "mo" : "one-time",
    features: pkg.features.map((text) => ({ text })),
    buttonText: "Enter Now",
    buttonStyle: "primary",
    isMemberOnly: pkg.isMemberOnly,
    metadata: {
      entriesCount: multiplied ? baseEntries * mult : baseEntries,
      originalEntries: baseEntries,
      promoMultiplier: mult,
      isPromoActive: multiplied,
    },
  };
}

const BTN = "px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors";

export default function MembershipSectionDevClient() {
  const [userState, setUserState] = useState<UserState>("guest");
  const [tab, setTab] = useState<Tab>("one-time");
  const [mult, setMult] = useState<Mult>(1);
  const [dark, setDark] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const [lastSelected, setLastSelected] = useState<string | null>(null);

  const hasAccess = userState === "subscriber" || userState === "entries";

  const plans = useMemo(() => {
    if (tab === "membership") {
      return membershipPackages
        .filter((p) => p.type === "subscription" && p.isActive)
        .map((p) => toLocalPlan(p, mult));
    }
    const oneTime = membershipPackages.filter((p) => p.type === "one-time" && p.isActive);
    const filtered = hasAccess
      ? oneTime.filter((p) => p.isMemberOnly === true)
      : oneTime.filter((p) => !p.isMemberOnly);
    return filtered.map((p) => toLocalPlan(p, mult));
  }, [tab, hasAccess, mult]);

  return (
    <div className={dark ? "dark" : ""}>
      <div
        className={
          "min-h-screen bg-white p-6 dark:bg-neutral-950 " +
          (reducedMotion ? "[&_*]:!transition-none [&_*]:!animate-none" : "")
        }
      >
        <h1 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">
          /dev/membershipsection — Electric card preview
        </h1>

        {/* Config panel */}
        <div className="mb-6 flex flex-wrap gap-2 text-gray-900 dark:text-white">
          {(["guest", "subscriber", "entries"] as UserState[]).map((s) => (
            <button key={s} onClick={() => setUserState(s)}
              className={BTN + (userState === s ? " bg-blue-600 text-white border-blue-600" : " border-gray-400")}>
              {s}
            </button>
          ))}
          <span className="mx-2 opacity-40">|</span>
          {(["one-time", "membership"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={BTN + (tab === t ? " bg-blue-600 text-white border-blue-600" : " border-gray-400")}>
              {t}
            </button>
          ))}
          <span className="mx-2 opacity-40">|</span>
          {([1, 2, 5, 10] as Mult[]).map((m) => (
            <button key={m} onClick={() => setMult(m)}
              className={BTN + (mult === m ? " bg-blue-600 text-white border-blue-600" : " border-gray-400")}>
              {m}x
            </button>
          ))}
          <span className="mx-2 opacity-40">|</span>
          <button onClick={() => setDark((v) => !v)} className={BTN + " border-gray-400"}>
            {dark ? "dark" : "light"}
          </button>
          <button onClick={() => setReducedMotion((v) => !v)} className={BTN + " border-gray-400"}>
            reduced-motion: {reducedMotion ? "on" : "off"}
          </button>
          <button onClick={() => setShowOld((v) => !v)} className={BTN + " border-gray-400"}>
            old-vs-new: {showOld ? "on" : "off"}
          </button>
        </div>

        {lastSelected && (
          <p className="mb-4 text-sm text-green-600 dark:text-emerald-400">
            Selected: {lastSelected}
          </p>
        )}

        {/* Preview grid */}
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => {
            const colorScheme =
              tab === "membership"
                ? getMembershipSectionColorScheme(plan.id, true)
                : getElectricPackageColorScheme(plan.id);
            const discount =
              tab === "one-time"
                ? getAdditionalPackDiscount(plan.id)
                : null;
            const locked = tab === "one-time" && plan.isMemberOnly === true && !hasAccess;
            return (
              <div key={plan.id} className="pt-8">
                <ElectricPackageCard
                  plan={plan}
                  colorScheme={colorScheme}
                  state={{ locked, lockReason: "Subscription or Entries Required", isCurrent: false }}
                  discount={discount ? { regularPrice: discount.regularPrice, percentOff: discount.percentOff } : null}
                  onSelect={(p) => setLastSelected(`${p.name} ($${p.price})`)}
                />
                {showOld && (
                  <p className="mt-2 text-center text-xs text-gray-500 dark:text-neutral-400">
                    (old card comparison: open the live section in another tab)
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the server route**

Create `src/app/dev/membershipsection/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import MembershipSectionDevClient from "@/components/dev/MembershipSectionDevClient";

/**
 * Development-only: preview the electric package card across user states,
 * tabs, promo multipliers, theme, and reduced motion. Returns 404 in production.
 */

export const metadata: Metadata = {
  title: "Membership section (dev) | Tools Australia",
  description: "Development-only electric package card preview",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function DevMembershipSectionPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }
  return <MembershipSectionDevClient />;
}
```

- [ ] **Step 3: Type-check + lint**

Run: `npm run type-check`
Expected: no errors.
Run: `npm run lint`
Expected: no errors for the two new files.

- [ ] **Step 4: Manual visual verification**

Run: `npm run dev`
Open: `http://localhost:3000/dev/membershipsection`
Verify each combination:
- `guest` + `one-time` → 6 regular packs, electric palette, **no** % OFF badge, no strikethrough.
- `subscriber` + `one-time` → 5 additional packs (Tradie→VIP), each shows struck regular price + bold price + `50% OFF` badge in the price block.
- `entries` + `one-time` → same 5 additional packs (access granted via entries).
- any state + `membership` → 3 subscription cards in retained teal/yellow/red (not electric).
- `2x/5x/10x` → entries show `original → multiplied`; with additional packs the price strikethrough and the entries strikethrough both render without overlapping the (absent here) top-right corner.
- `dark`/`light` and `reduced-motion on` → no console errors; hover scale/brightness suppressed when reduced-motion on.

Confirm no runtime console errors (note: dev build keeps `console.*`).

- [ ] **Step 5: Commit**

```bash
git add src/components/dev/MembershipSectionDevClient.tsx src/app/dev/membershipsection/page.tsx
git commit -m "feat(dev): add /dev/membershipsection electric card harness"
```

---

### Task 5: Docs + final verification

**Files:**
- Modify: `docs/upsell/*.md`, `docs/subscription/*.md`, `docs/shared-ui/*.md` (whichever the doc-sync hook flags for the touched paths)

The new source paths map to existing domains via the Domain Manifest:
`src/components/sections/membership/**` & `src/components/dev/**` → shared-ui/dev-tooling; `src/utils/membership/**` → subscription; `src/app/dev/**` → dev-tooling. Update the matching domain docs to record: the new electric scheme module, the discount util, the dev harness route, and that Phase-1 changes are additive/dev-only (live section unchanged).

- [ ] **Step 1: Identify required doc updates**

Run: `node .claude/hooks/doc-sync.mjs` (or trigger the Stop hook by finishing) to see exactly which `docs/<domain>/` files are flagged for the new/modified source paths.

- [ ] **Step 2: Update the flagged domain docs**

For each flagged domain doc, add a short subsection: what the file does, that it is Phase-1 dev-only and additive, and the `/dev/membershipsection` route. Keep it factual and brief (match surrounding doc style).

- [ ] **Step 3: Full verification pass**

Run: `npm run test:electric-scheme`
Expected: PASS.
Run: `npm run test:additional-pack-discount`
Expected: PASS.
Run: `npm run type-check`
Expected: no errors.
Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs: record electric card phase-1 (dev-only) additions"
```

---

## Self-Review

**Spec coverage:**
- Spec §1 (color tokens + opt-in resolver, no existing map repointed) → Task 1 (isolated module; stronger isolation than editing the shared file, same intent).
- Spec §2 (discount util, null for non-additional, computed, with test) → Task 2.
- Spec §3 (`ElectricPackageCard` props, price-block badge placement, entries strike, electric static + hover, single responsive component) → Task 3.
- Spec §4 (dev route 404 in prod, client config: user state, tab, promo, old-vs-new, theme, reduced motion; mocked data; no Stripe) → Task 4.
- Spec §5 non-goals (live section untouched, no map repoint, no subtitle strip, no A/B, no data model change) → respected; nothing in Tasks 1–5 modifies `MembershipSection.tsx`, `packageColorScheme.ts`, `membershipPackages.ts`.
- Spec §7 testing → Tasks 1, 2 (tsx tests), Task 4 step 4 (manual matrix), Task 5 (lint/type-check).
- Spec §8 docs → Task 5.

**Placeholder scan:** No "TBD/TODO/handle edge cases" — every code step shows complete code; the only intentionally manual item is the visual matrix (Task 4 step 4) and doc-sync-driven doc edits (Task 5), both inherent to UI/doc work and explicitly bounded.

**Type consistency:** `getElectricPackageColorScheme(planId): PackageColorScheme` used identically in Tasks 1 & 4. `getAdditionalPackDiscount → { regularPrice, discountedPrice, percentOff } | null`; the card consumes `{ regularPrice, percentOff }` (subset, passed explicitly in Task 4). `ElectricPackageCardProps` defined in Task 3 matches the call site in Task 4 (`plan`, `colorScheme`, `state`, `discount`, `onSelect`). `LocalMembershipPlan` shape (id, name, price, period, features[{text}], metadata) matches `membership-adapters.ts`.

**Scope:** Single subsystem, additive, 5 tasks each producing a working/testable increment. No decomposition needed.
