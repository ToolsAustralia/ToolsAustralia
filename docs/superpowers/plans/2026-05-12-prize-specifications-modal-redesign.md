# PrizeSpecifications Modal Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current solid-coloured-header PrizeSpecifications modal with a CancellationUpsell-grade redesign: dark gradient hero with landscape prize photo, cleaner tabs and spec cards, and a 3-cell trust bar.

**Architecture:** Promote the single `PrizeSpecificationsModal.tsx` to a folder mirroring `CancellationUpsellModal/`. The new folder ships an orchestrator (`index.tsx`) and four sub-components (`Hero`, `TabBar`, `SpecCard`, `TrustBar`). The hero reuses `upsell-shell/UpsellHero`. The trust bar reuses `upsell-shell/TrustBar`. Per-prize brand colours (`getPrizeBrandColors`) still drive tab/icon/bullet tinting; only the constant dark hero is non-tinted.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind CSS, Lucide React icons, existing `upsell-shell/*` primitives, existing `prize-brand-colors` helpers.

**Spec:** [docs/superpowers/specs/2026-05-12-prize-specifications-modal-redesign-design.md](../specs/2026-05-12-prize-specifications-modal-redesign-design.md)

**No tests required.** This is a presentational change with no business logic; the modal has no existing test, and CLAUDE.md does not mandate adding one for UI-only work. Verification is manual via the dev modal gallery.

**Commit policy:** Per project CLAUDE.md, never run `git commit` / `git add` / `git push` unless the user has explicitly authorised the action in their most recent message. Each task ends with a commit step — pause and ask the user before running it.

---

## Task 1: Promote single file to folder, add Hero, remove ModalHeader

**Files:**
- Create: `src/components/modals/PrizeSpecificationsModal/index.tsx`
- Create: `src/components/modals/PrizeSpecificationsModal/Hero.tsx`
- Delete: `src/components/modals/PrizeSpecificationsModal.tsx`

- [ ] **Step 1: Create the folder and copy the existing file as `index.tsx`**

PowerShell:
```powershell
New-Item -ItemType Directory -Force "src/components/modals/PrizeSpecificationsModal"
Copy-Item "src/components/modals/PrizeSpecificationsModal.tsx" "src/components/modals/PrizeSpecificationsModal/index.tsx"
```

At this point both files exist. Type-check should still pass because Next.js/TS resolves `@/components/modals/PrizeSpecificationsModal` to the bare file first, not the folder. We'll delete the bare file at the end of this task.

- [ ] **Step 2: Verify nothing is broken yet**

Run: `npm run type-check`
Expected: PASS — no errors. The bare file is still in place.

- [ ] **Step 3: Create `Hero.tsx`**

Path: `src/components/modals/PrizeSpecificationsModal/Hero.tsx`

```tsx
"use client";

import React, { type ReactNode } from "react";
import Image from "next/image";
import { Trophy } from "lucide-react";
import type { PrizeCatalogEntry } from "@/config/prizes";
import UpsellHero from "../upsell-shell/UpsellHero";

interface HeroProps {
  prize: PrizeCatalogEntry;
}

/** Split `"Milwaukee Combo + $5k Cash"` into ["Milwaukee Combo", "$5k Cash"].
 *  Falls back to a single-line render when no `+` is present. */
const splitTitle = (label: string): { primary: string; secondary?: string } => {
  const parts = label.split(" + ");
  if (parts.length < 2) return { primary: label };
  return { primary: parts[0], secondary: parts.slice(1).join(" + ") };
};

const Hero: React.FC<HeroProps> = ({ prize }) => {
  const { primary, secondary } = splitTitle(prize.label);
  const photo = prize.gallery[0];

  return (
    <UpsellHero
      tone="neutral"
      titleId="prize-specs-headline"
      eyebrow={
        <>
          <span className="basis-7 grow-0 shrink-0 h-px bg-[linear-gradient(90deg,transparent,rgba(212,175,55,0.6))] max-xs:basis-[18px]" />
          <span className="text-premium-gold inline-flex">
            <Trophy size={14} strokeWidth={2.2} />
          </span>
          <span className="font-extrabold text-[11px] tracking-[0.22em] uppercase text-premium-gold max-xs:text-2xs max-xs:tracking-[0.18em]">
            Featured prize
          </span>
          <span className="text-premium-gold inline-flex">
            <Trophy size={14} strokeWidth={2.2} />
          </span>
          <span className="basis-7 grow-0 shrink-0 h-px bg-[linear-gradient(90deg,rgba(212,175,55,0.6),transparent)] max-xs:basis-[18px]" />
        </>
      }
      title={
        secondary ? (
          <>
            {primary}
            <br />
            <span className="text-[var(--upsell-accent)]">+ {secondary}</span>
          </>
        ) : (
          primary
        )
      }
      sub={prize.summary}
      infographic={
        <div
          className="rounded-xl overflow-hidden border border-white/10 leading-none max-xs:rounded-[10px] relative"
          style={{
            background:
              "radial-gradient(600px 200px at 50% 50%, rgba(238, 0, 0, 0.10), transparent 70%), linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(0, 0, 0, 0.15))",
            aspectRatio: "16 / 6",
          }}
        >
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            sizes="(max-width: 640px) 92vw, 540px"
            style={{ objectFit: "cover" }}
            priority={false}
          />
        </div>
      }
    />
  );
};

export default Hero;
```

- [ ] **Step 4: Update `index.tsx` to render `Hero` instead of `ModalHeader`**

Open `src/components/modals/PrizeSpecificationsModal/index.tsx` and replace the imports + ModalHeader usage.

Replace these imports near the top:
```tsx
import ModalContainer from "./ui/ModalContainer";
import ModalHeader from "./ui/ModalHeader";
import ModalContent from "./ui/ModalContent";
import ModalFooter from "./ui/ModalFooter";
```
with:
```tsx
import { X } from "lucide-react";
import ModalContainer from "../ui/ModalContainer";
import ModalContent from "../ui/ModalContent";
import ModalFooter from "../ui/ModalFooter";
import Hero from "./Hero";
```

(Note the `./ui/...` → `../ui/...` path change — the file moved down one level into the folder.)

Remove the line:
```tsx
const headerSolidFill = useMemo(() => getPrizeSpecificationsModalHeaderSolidFill(prize?.slug), [prize?.slug]);
```

…and its import:
```tsx
import {
  getPrizeBrandColors,
  getPrizeSpecificationsModalHeaderSolidFill,  // ← remove this
  getPrizeSpecificationsModalTheme,
} from "@/utils/prize-brand-colors";
```
becomes:
```tsx
import {
  getPrizeBrandColors,
  getPrizeSpecificationsModalTheme,
} from "@/utils/prize-brand-colors";
```

Replace the `<ModalHeader …/>` block (the JSX that renders the brand-coloured title bar) with:

```tsx
{prize && <Hero prize={prize} />}

{/* Absolute close button — sits above the hero so it's reachable while scrolling */}
<button
  type="button"
  aria-label="Close"
  onClick={onClose}
  className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/55 text-white/95 inline-flex items-center justify-center border border-white/20 transition-all duration-150 backdrop-blur-md hover:bg-black/75 hover:text-white max-xs:top-2 max-xs:right-2 max-xs:w-[26px] max-xs:h-[26px]"
>
  <X size={14} strokeWidth={2} />
</button>
```

`ModalContainer` needs a `relative` wrapper for the absolute close button. Confirm `ModalContainer` already has `position: relative` on its inner frame — if not, wrap the children in a `<div className="relative">…</div>`. (Check `src/components/modals/ui/ModalContainer.tsx`. The CancellationUpsell pattern places the close button inside the `relative` frame.)

If `ModalContainer` accepts an `aria-labelledby` prop, also pass `aria-labelledby="prize-specs-headline"` so screen readers link the dialog to the new Hero `<h2>`. If it doesn't accept that prop, leave the change for a follow-up — don't grow this PR.

- [ ] **Step 5: Update prize-brand-colors helper exports (no behaviour change)**

The `getPrizeSpecificationsModalHeaderSolidFill` helper in `src/utils/prize-brand-colors.ts` is no longer called anywhere. Leave it in place (the helper is part of the file's public API; removing it is out of scope and a separate cleanup).

- [ ] **Step 6: Delete the bare single file so the folder takes over**

PowerShell:
```powershell
Remove-Item "src/components/modals/PrizeSpecificationsModal.tsx"
```

- [ ] **Step 7: Verify type-check and lint**

Run: `npm run type-check && npm run lint`
Expected: PASS. If lint complains about the unused `getPrizeSpecificationsModalHeaderSolidFill` export, that's expected — it stays in case other consumers want it (none currently do, but it's not in scope to delete).

- [ ] **Step 8: Visual verification**

Start dev server (if not already running): `npm run dev`
Open: `http://localhost:3000/dev/modals`
Find the **Prize Specifications** modal in the gallery. Open it. Confirm:
- Dark gradient hero appears in place of the red title bar
- Gold "Featured prize" eyebrow with two trophy icons + flanking gold hairlines
- Anton title "Milwaukee Combo / + $5k Cash" (second line in gold)
- Sub-copy reads the prize's `summary`
- Landscape photo from `prize.gallery[0]` sits below at 16:6
- Close button (top-right) works
- Tabs, summary banner, spec cards, and ModalFooter still render as before (we haven't touched them yet)

Switch theme (light ↔ dark) and confirm hero remains readable.

Also try a few other slugs (DeWalt, Makita, Ryobi) via the gallery's prize selector. Photo and label update; hero gradient stays the same dark gold/red.

- [ ] **Step 9: Commit (ask user first per CLAUDE.md)**

Ask the user: "Want me to commit Task 1 (folder + Hero)?" — wait for explicit authorisation, then:

```bash
git add src/components/modals/PrizeSpecificationsModal/ \
        "src/components/modals/PrizeSpecificationsModal.tsx"
git commit -m "feat(modals): promote PrizeSpecificationsModal to folder + add dark hero

Replaces the solid brand-coloured title bar with a CancellationUpsell-style
dark gradient hero: gold eyebrow, Anton title with split label, landscape
gallery[0] photo at 16:6.

Spec: docs/superpowers/specs/2026-05-12-prize-specifications-modal-redesign-design.md"
```

---

## Task 2: Trust bar replaces ModalFooter

**Files:**
- Create: `src/components/modals/PrizeSpecificationsModal/TrustBar.tsx`
- Modify: `src/components/modals/PrizeSpecificationsModal/index.tsx`

- [ ] **Step 1: Create `TrustBar.tsx`**

Path: `src/components/modals/PrizeSpecificationsModal/TrustBar.tsx`

```tsx
"use client";

import React from "react";
import { ShieldCheck, Award, Truck } from "lucide-react";
import UpsellShellTrustBar from "../upsell-shell/TrustBar";

interface TrustBarProps {
  /** Optional brand-tinted Tailwind class (e.g. "text-red-600 dark:text-red-400")
   *  applied to each icon. Falls back to red when absent. */
  iconColorClass?: string;
}

const TrustBar: React.FC<TrustBarProps> = ({ iconColorClass }) => {
  const iconCls = iconColorClass ?? "text-red-600 dark:text-red-400";
  return (
    <UpsellShellTrustBar
      cells={[
        {
          icon: <ShieldCheck size={12} className={`max-xs:size-2.5 ${iconCls}`} />,
          strong: "Secure payment",
          secondary: "Powered by Stripe",
        },
        {
          icon: <Award size={12} className={`max-xs:size-2.5 ${iconCls}`} />,
          strong: "NTP/16264",
          secondary: "Govt-certified draw",
        },
        {
          icon: <Truck size={12} className={`max-xs:size-2.5 ${iconCls}`} />,
          strong: "Real prizes shipped",
          secondary: "To every winner",
        },
      ]}
    />
  );
};

export default TrustBar;
```

Note: `UpsellShellTrustBar`'s `cells` prop accepts `{ icon, strong, secondary }` — check `src/components/modals/upsell-shell/TrustBar.tsx` to confirm the exact `TrustBarCell` shape. If `secondary` is named differently (e.g. `sub`), adjust accordingly.

- [ ] **Step 2: Wire TrustBar into `index.tsx`, remove ModalFooter**

In `src/components/modals/PrizeSpecificationsModal/index.tsx`:

Replace the import line:
```tsx
import ModalFooter from "../ui/ModalFooter";
```
with:
```tsx
import TrustBar from "./TrustBar";
```

Replace the JSX line:
```tsx
<ModalFooter onClose={onClose} brandColors={brandColors} />
```
with:
```tsx
<TrustBar iconColorClass={brandColors?.checkmarkColor} />
```

- [ ] **Step 3: Verify type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: PASS.

- [ ] **Step 4: Visual verification**

In `/dev/modals`, open the Prize Specifications modal again. Confirm:
- Three-cell trust bar replaces the footer at the bottom
- Cells read "Secure payment / Powered by Stripe", "NTP/16264 / Govt-certified draw", "Real prizes shipped / To every winner"
- Icons inherit the per-prize brand colour (red for Milwaukee, yellow for DeWalt, teal for Makita, green for Ryobi)
- Trust bar is the bottom-most element — no Close button below it (the hero's absolute close button covers that)

Test at mobile width (320–400px) — trust cells stay in a 3-column grid with shrunken icons via `max-xs:size-2.5`.

- [ ] **Step 5: Commit (ask first)**

Ask: "Commit Task 2 (TrustBar)?" — then:

```bash
git add src/components/modals/PrizeSpecificationsModal/
git commit -m "feat(modals): add TrustBar to PrizeSpecificationsModal

Replaces ModalFooter with a 3-cell trust strip: ShieldCheck Secure payment,
Award NTP/16264, Truck Real prizes shipped. Icon colour inherits the
per-prize brand tint."
```

---

## Task 3: Extract and polish TabBar

**Files:**
- Create: `src/components/modals/PrizeSpecificationsModal/TabBar.tsx`
- Modify: `src/components/modals/PrizeSpecificationsModal/index.tsx`

- [ ] **Step 1: Create `TabBar.tsx`**

Path: `src/components/modals/PrizeSpecificationsModal/TabBar.tsx`

```tsx
"use client";

import React from "react";
import type { PrizeSpecSection } from "@/config/prizes";
import { cn } from "@/utils/cn";

interface BrandColorBundle {
  gradient: string;
  textColor: string;
  borderColor: string;
  shadowColor: string;
}

interface TabBarSurface {
  tabInactiveTextClass: string;
  tabInactiveHoverClass: string;
  tabInactiveStyle?: React.CSSProperties;
  tabBadgeInactiveClass: string;
}

interface TabBarProps {
  sections: PrizeSpecSection[];
  activeId: string | null;
  onSelect: (id: string) => void;
  brandColors: BrandColorBundle | null;
  surface: TabBarSurface;
}

const TabBar: React.FC<TabBarProps> = ({ sections, activeId, onSelect, brandColors, surface }) => {
  return (
    <div className="mb-3 sm:mb-7 -mx-0.5 sm:-mx-2 px-0.5 sm:px-2 overflow-x-auto brand-scrollbar">
      <div className="flex gap-1.5 sm:gap-3 min-w-max pb-1.5 sm:pb-2">
        {sections.map((section) => {
          const isActive = section.id === activeId;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelect(section.id)}
              className={cn(
                "relative px-3 sm:px-5 py-1.5 sm:py-2.5 rounded-full font-semibold text-2xs sm:text-sm",
                "transition-all duration-300 border-2 whitespace-nowrap",
                isActive
                  ? brandColors
                    ? `bg-gradient-to-br ${brandColors.gradient} ${brandColors.textColor} ${brandColors.borderColor} shadow-md sm:shadow-lg ${brandColors.shadowColor} sm:scale-105`
                    : "bg-gradient-to-br from-red-600 via-red-700 to-red-800 text-white border-red-500 shadow-md sm:shadow-lg shadow-red-500/40 sm:scale-105"
                  : cn(surface.tabInactiveTextClass, surface.tabInactiveHoverClass)
              )}
              style={isActive ? undefined : surface.tabInactiveStyle}
            >
              <span className="flex items-center gap-1.5 sm:gap-2">
                {section.label}
                {section.items.length > 0 && (
                  <span
                    className={cn(
                      "inline-flex items-center justify-center min-w-[18px] sm:min-w-[20px] h-4 sm:h-5 px-1 sm:px-1.5 rounded-full text-3xs sm:text-2xs font-bold",
                      isActive ? "bg-white/20 text-white" : surface.tabBadgeInactiveClass
                    )}
                  >
                    {section.items.length}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TabBar;
```

- [ ] **Step 2: Wire TabBar into `index.tsx`**

In `src/components/modals/PrizeSpecificationsModal/index.tsx`:

Add import:
```tsx
import TabBar from "./TabBar";
```

Replace the inline tab-rendering JSX (the `<div className="mb-3 sm:mb-7 …"> … </div>` block containing the tab buttons) with:

```tsx
<TabBar
  sections={sections}
  activeId={activeSection?.id ?? null}
  onSelect={setActiveSectionId}
  brandColors={brandColors}
  surface={{
    tabInactiveTextClass: surface.tabInactiveTextClass,
    tabInactiveHoverClass: surface.tabInactiveHoverClass,
    tabInactiveStyle: surface.tabInactiveStyle,
    tabBadgeInactiveClass: surface.tabBadgeInactiveClass,
  }}
/>
```

- [ ] **Step 3: Verify type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: PASS.

- [ ] **Step 4: Visual verification**

Reload `/dev/modals` → Prize Specifications. Confirm:
- Tabs render identically to before the extraction
- Active-tab gradient applies per prize (Milwaukee red, DeWalt yellow, etc.)
- Inactive tabs honour theme (light vs dark surface)
- Counter badge inside each tab still shows item count
- Horizontal scroll still works at mobile width when content overflows
- Clicking a tab switches the active section as before

- [ ] **Step 5: Commit (ask first)**

```bash
git add src/components/modals/PrizeSpecificationsModal/
git commit -m "refactor(modals): extract PrizeSpecifications TabBar into its own file

Pulls the tab-pill rendering out of the orchestrator. No visual change yet
— styling polish lands with SpecCard in the next task."
```

---

## Task 4: Extract SpecCard with polished card styling

**Files:**
- Create: `src/components/modals/PrizeSpecificationsModal/SpecCard.tsx`
- Modify: `src/components/modals/PrizeSpecificationsModal/index.tsx`

- [ ] **Step 1: Create `SpecCard.tsx`**

Path: `src/components/modals/PrizeSpecificationsModal/SpecCard.tsx`

```tsx
"use client";

import React from "react";
import { Package } from "lucide-react";
import type { PrizeSpecItem } from "@/config/prizes";
import { cn } from "@/utils/cn";

interface SpecCardSurface {
  cardClass: string;
  cardHoverClass: string;
  cardAccentBorder: string;
  titleClass: string;
  mutedClass: string;
  bodyClass: string;
  dotClass: string;
  specBarStyle?: React.CSSProperties;
  includesInnerStyle?: React.CSSProperties;
}

interface SpecCardProps {
  item: PrizeSpecItem;
  surface: SpecCardSurface;
  brandIconClass: string;
  isDark: boolean;
}

/** Renders the bullet list with brand-coloured dot markers (replaces the
 *  previous Check-icon markers used in the legacy modal). */
const renderList = (items: string[] | undefined, surface: SpecCardSurface, brandIconClass: string) => {
  if (!items || items.length === 0) return null;
  return (
    <ul className="space-y-1.5 sm:space-y-2.5">
      {items.map((item, index) => (
        <li key={index} className="flex items-start gap-2 sm:gap-3">
          <span
            aria-hidden
            className={cn(
              "mt-1.5 sm:mt-2 inline-block w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0",
              brandIconClass.replace("text-", "bg-")
            )}
          />
          <span className={cn("text-2xs sm:text-sm", surface.bodyClass, "leading-snug sm:leading-relaxed font-['Inter']")}>
            {item}
          </span>
        </li>
      ))}
    </ul>
  );
};

const SpecCard: React.FC<SpecCardProps> = ({ item, surface, brandIconClass, isDark }) => {
  return (
    <div
      className={cn(
        "group relative rounded-lg sm:rounded-xl",
        surface.cardClass,
        "p-3 sm:p-6 transition-all duration-300 hover:shadow-lg",
        surface.cardHoverClass
      )}
      style={{
        boxShadow: isDark ? "0 1px 0 rgba(255,255,255,0.04) inset" : undefined,
      }}
    >
      <div className="mb-2 sm:mb-4">
        <div className="flex items-start gap-2.5 sm:gap-3">
          <div
            className={cn(
              "w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl inline-flex items-center justify-center shrink-0",
              "border bg-white dark:bg-neutral-900"
            )}
            style={{ borderColor: surface.cardAccentBorder }}
          >
            <Package className={cn("h-4 w-4 sm:h-5 sm:w-5", brandIconClass)} />
          </div>
          <div className="flex-1 min-w-0">
            <h4
              className={cn(
                "text-sm sm:text-xl font-bold",
                surface.titleClass,
                "font-['Poppins'] leading-tight tracking-tight"
              )}
            >
              {item.name}
            </h4>
            {item.model && (
              <p
                className={cn(
                  "text-2xs sm:text-sm",
                  surface.mutedClass,
                  "font-medium mt-1 sm:mt-1.5 flex items-center gap-1.5"
                )}
              >
                <span className={cn("inline-block w-1.5 h-1.5 rounded-full", surface.dotClass)} />
                Model: {item.model}
              </p>
            )}
          </div>
        </div>
      </div>

      {item.description && (
        <p
          className={cn(
            "text-2xs sm:text-sm",
            surface.bodyClass,
            "mb-3 sm:mb-5 leading-snug sm:leading-relaxed font-['Inter']"
          )}
        >
          {item.description}
        </p>
      )}

      {item.specifications && item.specifications.length > 0 && (
        <div className="mb-3 sm:mb-5">
          <h5
            className={cn(
              "text-xs sm:text-base font-semibold",
              surface.titleClass,
              "mb-1.5 sm:mb-3 font-['Poppins'] flex items-center gap-1.5 sm:gap-2"
            )}
          >
            <span className="inline-block w-0.5 sm:w-1 h-4 sm:h-5 shrink-0 rounded-full" style={surface.specBarStyle} />
            Specifications
          </h5>
          {renderList(item.specifications, surface, brandIconClass)}
        </div>
      )}

      {item.includes && item.includes.length > 0 && (
        <div
          className="rounded-md sm:rounded-lg border-2 border-dashed p-2 sm:p-4 transition-colors duration-300"
          style={{ borderColor: surface.cardAccentBorder }}
        >
          <div className="rounded-md p-2 sm:p-4" style={surface.includesInnerStyle}>
            <h5
              className={cn(
                "text-xs sm:text-base font-semibold",
                surface.titleClass,
                "mb-1.5 sm:mb-3 font-['Poppins'] flex items-center gap-1.5 sm:gap-2"
              )}
            >
              <Package className={cn("h-3.5 w-3.5 sm:h-5 sm:w-5 shrink-0", brandIconClass)} />
              What&apos;s Included
            </h5>
            {renderList(item.includes, surface, brandIconClass)}
          </div>
        </div>
      )}
    </div>
  );
};

export default SpecCard;
```

Key changes vs the legacy `renderSpecItem`:
- Bullet markers are now brand-coloured dots (`w-1.5 h-1.5 bg-…`) instead of `Check` icons — quieter visual weight.
- The icon at the card top is wrapped in a soft-bordered badge (`w-8 h-8 rounded-lg`), not floating naked above the title.
- Description and lists no longer indent under the icon (`pl-6 sm:pl-9` removed) — full-width body text reads more comfortably on mobile.
- The left-border accent strip on the card is dropped; the brand colour now lives in the icon badge and dot markers.

- [ ] **Step 2: Wire SpecCard into `index.tsx`**

In `src/components/modals/PrizeSpecificationsModal/index.tsx`:

Add import:
```tsx
import SpecCard from "./SpecCard";
```

Remove the `Check` import (no longer used):
```tsx
import { Check, Package } from "lucide-react";  // ← remove this line entirely
```

Also remove the `Package` import if it's only used in `renderSpecItem`/`renderList`. Both are now inside `SpecCard`.

Delete the inline `renderList` and `renderSpecItem` helpers from `index.tsx`.

Soften the summary banner that sits between TabBar and the first card. Find this block:

```tsx
{activeSection?.summary && (
  <div
    className="rounded-lg sm:rounded-xl p-3 sm:p-5 mb-3 sm:mb-7 border-l-4 transition-all duration-300"
    style={surface.summaryBannerStyle}
  >
    <p
      className={cn("text-xs sm:text-base", surface.summaryTextClass, "leading-snug sm:leading-relaxed font-['Inter'] font-medium")}
    >
      {activeSection.summary}
    </p>
  </div>
)}
```

Replace it with the softer treatment (left rule keeps the brand colour, but the fill becomes a neutral surface and the body copy goes muted):

```tsx
{activeSection?.summary && (
  <div
    className="rounded-lg sm:rounded-xl p-3 sm:p-5 mb-3 sm:mb-7 border-l-2 bg-neutral-50 dark:bg-neutral-900/60 transition-all duration-300"
    style={{ borderLeftColor: surface.cardAccentBorder }}
  >
    <p className="text-xs sm:text-base text-neutral-600 dark:text-neutral-400 leading-snug sm:leading-relaxed font-['Inter'] font-medium">
      {activeSection.summary}
    </p>
  </div>
)}
```

Then replace the JSX `{activeSection?.items.map((item, index) => renderSpecItem(item, index))}` with:

```tsx
{activeSection?.items.map((item, index) => (
  <SpecCard
    key={`${item.name}-${index}`}
    item={item}
    surface={{
      cardClass: surface.cardClass,
      cardHoverClass: surface.cardHoverClass,
      cardAccentBorder: surface.cardAccentBorder,
      titleClass: surface.titleClass,
      mutedClass: surface.mutedClass,
      bodyClass: surface.bodyClass,
      dotClass: surface.dotClass,
      specBarStyle: surface.specBarStyle,
      includesInnerStyle: surface.includesInnerStyle,
    }}
    brandIconClass={brandColors?.checkmarkColor ?? "text-red-600"}
    isDark={isDark}
  />
))}
```

- [ ] **Step 3: Verify type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: PASS.

- [ ] **Step 4: Visual verification — full sweep**

Open `/dev/modals`. For each of these prize slugs (cycle the selector in the gallery):
- `milwaukee-sidchrome`
- `dewalt-sidchrome`
- `makita-sidchrome`
- `ryobi-sidchrome`
- `cash-prize`

…confirm:
- Hero gold eyebrow + Anton title + landscape photo render correctly
- Tabs honour the brand colour
- Spec card icon badge tints to the brand colour
- Description sits full-width below the title row (no awkward indent)
- Bullets are brand-coloured dots, not red checkmarks
- "What's Included" sub-box keeps its dashed brand-coloured border
- Trust bar at the bottom shows Secure payment / NTP / Real prizes shipped, with brand-tinted icons

Also confirm theme switching (light ↔ dark) does not break any card surface contrast — the dark mode previously relied on `getPrizeSpecificationsModalTheme` outputs which we still pass through.

Mobile-width check: shrink the browser to <540px width and confirm the hero compresses, tabs scroll horizontally, cards use the tighter `p-3` padding, and the trust bar fits in 3 columns.

- [ ] **Step 5: Commit (ask first)**

```bash
git add src/components/modals/PrizeSpecificationsModal/
git commit -m "feat(modals): extract and polish PrizeSpecifications SpecCard

Replaces the legacy renderSpecItem with a dedicated SpecCard component:
- Lucide Package icon in a soft brand-tinted badge (no naked icon)
- Description sits full-width below the title row (no indent)
- Bullet markers are brand-coloured dots (no Check icons)
- Left-border accent strip removed (brand colour lives in the icon badge)

Completes the redesign per
docs/superpowers/specs/2026-05-12-prize-specifications-modal-redesign-design.md"
```

---

## Self-review checklist

Before declaring the plan done, walk through these on your own:

- [ ] Each spec section (Visual design / Tab bar / Summary / Spec card / Trust bar / File layout / Responsive / A11y) maps to a task.
- [ ] No placeholders ("TBD", "implement later") remain in the plan.
- [ ] Type names used in later tasks (e.g. `BrandColorBundle`, `SpecCardSurface`) are defined where they're used.
- [ ] Every commit message references the spec doc.
- [ ] No new test files were promised that don't exist in the plan (we deliberately skipped tests per the spec).
