# Winner Testimony Section + Modal Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `WinnerTestimonySection` and its "Read full story" modal into a cinematic editorial layout that adapts to site light/dark mode and the active brand promo theme.

**Architecture:** Split the current 458-line `src/components/sections/WinnerTestimonySection.tsx` into a focused `winner-testimony/` folder with five files: section frame, cinematic card, shared cinematic hero block, story modal, and a small theme helper. The existing entry path becomes a one-line re-export so callers don't change. Brand color drives accents; site theme drives section background. Card and modal hero stay dark-cinematic in both modes by design.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, Embla Carousel (existing), `next/image`, Lucide React icons, Zustand (`usePromoTheme`), React Context (`useTheme` from `ThemeContext`), existing `ModalContainer` from `@/components/modals/ui`.

**Spec:** `docs/superpowers/specs/2026-05-04-winner-testimony-refactor-design.md`

**Important repo rules (CLAUDE.md):**
- **Never run `git commit` / `git add` / `git push` without explicit user authorization** in their most recent message (keywords: `commit`, `push`, `merge`, etc.). The Bash hook `.claude/hooks/no-auto-commit.mjs` enforces this. Commit steps below are **proposed checkpoints** — pause and ask before running them.
- **Doc updates required**: editing files under `src/` triggers the doc-sync Stop hook. The matching docs (`docs/shared-ui/frontend.md`, `docs/draws/frontend.md`) must be updated in the same session — handled in Task 8.
- **No component test framework**: this codebase has no jest/vitest for UI. Verification is type-check + lint + manual dev server inspection. The plan reflects this — there are no `*.test.tsx` files to write.

---

## File Structure

After this refactor:

```
src/components/sections/
  WinnerTestimonySection.tsx                  # one-line re-export (preserves caller imports)
  winner-testimony/
    index.ts                                  # re-exports
    WinnerTestimonySection.tsx                # section frame, theming, carousel orchestration
    WinnerCinematicCard.tsx                   # carousel slide wrapper + Read Full Story button
    WinnerCinematicHero.tsx                   # shared photo/vignette/glow/overlay (used by card + modal)
    WinnerStoryModal.tsx                      # modal: hero + editorial body + meta footer
    theme.ts                                  # buildSectionBackground() helper
```

**Callers untouched** (verify after refactor — they import the default export from `@/components/sections/WinnerTestimonySection`):
- `src/app/(site)/components/WinnerTestimoniesClient.tsx`
- `src/app/promotions/_components/ToolsetLandingPage.tsx`
- `src/app/promotions/[slug]/page.tsx`
- `src/app/(site)/winners/components/WinnersPageClient.tsx`
- `src/app/(site)/my-account/draws/page.tsx`
- `src/components/sections/promo/GiveawayDetails.tsx`
- `src/components/sections/WinnerTestimoniesClientLazy.tsx`

---

## Task 1: Scaffold the folder + theme helper

**Files:**
- Create: `src/components/sections/winner-testimony/theme.ts`
- Create: `src/components/sections/winner-testimony/index.ts`

The `theme.ts` file builds the layered radial-gradient + linear-gradient background string for the section, parameterised by brand color (from `usePromoTheme()`) and dark/light site mode. It uses the existing `hexToRgbaString` helper from `src/utils/package-colors/packageColorScheme.ts` — do **not** introduce a parallel hex-to-rgb helper.

- [ ] **Step 1: Create the theme helper**

Create `src/components/sections/winner-testimony/theme.ts` with this exact content:

```ts
import { hexToRgbaString } from "@/utils/package-colors/packageColorScheme";

/**
 * Build the layered background CSS for the Winner Testimony section frame.
 * - Two brand-tinted radial glows (top, bottom-right)
 * - Base linear gradient that swaps with site light/dark mode
 *
 * Returns a value suitable for the inline `style.background` prop.
 */
export function buildSectionBackground(primaryHex: string, isDark: boolean): string {
  const baseGradient = isDark
    ? "linear-gradient(135deg, #050811 0%, #0b1326 50%, #050811 100%)"
    : "linear-gradient(135deg, #f5f3ee 0%, #ebe7dd 50%, #f5f3ee 100%)";
  const topAlpha = isDark ? 0.16 : 0.10;
  const bottomAlpha = isDark ? 0.10 : 0.08;
  return [
    `radial-gradient(ellipse at top, ${hexToRgbaString(primaryHex, topAlpha)} 0%, transparent 35%)`,
    `radial-gradient(ellipse at bottom right, ${hexToRgbaString(primaryHex, bottomAlpha)} 0%, transparent 45%)`,
    baseGradient,
  ].join(", ");
}

/**
 * Build the brand edge-glow background used by the cinematic hero (card + modal).
 * Two radial gradients pinned to top-left and bottom-right corners.
 */
export function buildHeroEdgeGlow(primaryHex: string, isDark: boolean): string {
  const topLeftAlpha = isDark ? 0.28 : 0.22;
  const bottomRightAlpha = isDark ? 0.22 : 0.18;
  return [
    `radial-gradient(ellipse at 0% 0%, ${hexToRgbaString(primaryHex, topLeftAlpha)} 0%, transparent 35%)`,
    `radial-gradient(ellipse at 100% 100%, ${hexToRgbaString(primaryHex, bottomRightAlpha)} 0%, transparent 40%)`,
  ].join(", ");
}
```

- [ ] **Step 2: Create the index re-export stub**

Create `src/components/sections/winner-testimony/index.ts` with this exact content (we'll add the actual default export in Task 5):

```ts
// Re-exports for the winner-testimony module.
// Default export is added in Task 5 once the section component exists.
export {};
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS (no errors). If anything fails, the import path `@/utils/package-colors/packageColorScheme` is the most likely suspect — verify the named export exists in that file.

- [ ] **Step 4: Proposed commit checkpoint** (ASK USER FIRST)

Don't commit unless the user authorizes in their most recent message. If authorized:

```bash
git add src/components/sections/winner-testimony/theme.ts src/components/sections/winner-testimony/index.ts
git commit -m "refactor(winners): scaffold winner-testimony folder + theme helper"
```

---

## Task 2: Build `WinnerCinematicHero` (shared photo/overlay block)

**Files:**
- Create: `src/components/sections/winner-testimony/WinnerCinematicHero.tsx`

Reusable photo-as-cinematic-background block. Two variants: `card` (used inside the carousel slide) and `modal` (used as the modal hero band). Same visual language, different sizing and overlay text scale.

- [ ] **Step 1: Create the file with full implementation**

Create `src/components/sections/winner-testimony/WinnerCinematicHero.tsx` with this exact content:

```tsx
"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import type { WinnerSummary } from "@/types/winner";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { hexToRgbaString } from "@/utils/package-colors/packageColorScheme";
import { formatWinnerName } from "@/utils/winner-name-formatter";
import { getWinnerDisplayDate, getWinnerTestimonyExcerpt } from "@/utils/winners";
import { buildHeroEdgeGlow } from "./theme";

interface WinnerCinematicHeroProps {
  winner: WinnerSummary;
  variant: "card" | "modal";
  className?: string;
}

const FALLBACK_IMAGE = "/images/promotion/PrizeHeader/PrizeHeader.webp";

export default function WinnerCinematicHero({
  winner,
  variant,
  className = "",
}: WinnerCinematicHeroProps) {
  const theme = usePromoTheme();
  const formattedName = formatWinnerName(winner.winnerFirstName, winner.winnerLastName);
  const prizeLabel = winner.selectedPrize || winner.prize.name;
  const displayImage = winner.imageUrl || winner.prize.images[0] || FALLBACK_IMAGE;
  const drawTypeLabel = winner.drawType === "major" ? "Major Draw Winner" : "Mini Draw Winner";

  const isCard = variant === "card";

  // Card uses the testimony excerpt overlaid on the hero; modal does not (body shows full story).
  const cardExcerpt = isCard ? getWinnerTestimonyExcerpt(winner.testimony, 220) : "";

  const heightClass = isCard
    ? "h-[320px] sm:h-[360px] lg:h-[380px]"
    : "h-[280px] sm:h-[320px] lg:h-[380px]";

  const nameClass = isCard
    ? "text-lg sm:text-xl lg:text-[20px] font-bold tracking-[-0.3px]"
    : "text-[22px] sm:text-[28px] lg:text-[32px] font-extrabold tracking-[-0.6px]";

  const quoteSizeClass = "text-[17px] sm:text-[19px] lg:text-[21px]";

  const labelBorderStyle: CSSProperties = {
    borderColor: hexToRgbaString(theme.primary, 0.55),
  };

  return (
    <div
      className={`relative w-full overflow-hidden ${heightClass} ${className}`}
    >
      {/* Layer 1: photo (object-cover, focal point biased to upper third) */}
      <Image
        src={displayImage}
        alt={`${formattedName} - ${winner.drawName}`}
        fill
        sizes={isCard ? "(max-width: 640px) 100vw, (max-width: 1024px) 88vw, 78vw" : "(max-width: 1024px) 100vw, 880px"}
        className="object-cover"
        style={{ objectPosition: "center 30%" }}
        priority={false}
      />

      {/* Layer 2: brand edge glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: buildHeroEdgeGlow(theme.primary, true) }}
      />

      {/* Layer 3: vignette (heavier at bottom for text legibility) */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.95) 100%)",
        }}
      />

      {/* Top row: draw-type pill + (desktop) date/state pill */}
      <div className="absolute left-5 right-5 top-5 z-10 flex flex-wrap items-center gap-2 sm:left-6 sm:right-6">
        <span
          className="inline-flex rounded-full border bg-black/40 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.28em] text-white backdrop-blur-sm"
          style={labelBorderStyle}
        >
          {drawTypeLabel}
        </span>
        <span
          className="hidden rounded-full border border-white/20 bg-black/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/80 backdrop-blur-sm sm:inline-flex"
        >
          {getWinnerDisplayDate(winner)}
          {winner.winnerState ? ` · ${winner.winnerState}` : ""}
        </span>
      </div>

      {/* Bottom block: opening quote (card only) + name + prize */}
      <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-6 pt-8 text-white sm:px-8 sm:pb-7">
        {isCard && cardExcerpt && (
          <>
            <div
              className="font-serif leading-[0.4]"
              style={{ color: theme.primary, fontSize: "44px", opacity: 0.85, marginBottom: "6px" }}
              aria-hidden
            >
              &ldquo;
            </div>
            <p
              className={`mb-4 max-w-[620px] font-serif italic leading-[1.45] tracking-[-0.2px] ${quoteSizeClass}`}
            >
              {cardExcerpt}
            </p>
          </>
        )}
        <h3 className={`font-['Inter'] ${nameClass}`}>{formattedName}</h3>
        <p className="mt-1 max-w-[420px] font-['Inter'] text-[11px] font-semibold uppercase leading-relaxed tracking-[0.18em] text-white/60 sm:text-[12px]">
          {prizeLabel}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS. If `getWinnerTestimonyExcerpt` import fails, verify it exists in `src/utils/winners.ts` (it does — used by current `WinnerTestimonySection`).

- [ ] **Step 3: Lint**

Run: `npm run lint -- src/components/sections/winner-testimony/`
Expected: PASS.

- [ ] **Step 4: Proposed commit checkpoint** (ASK USER FIRST)

```bash
git add src/components/sections/winner-testimony/WinnerCinematicHero.tsx
git commit -m "feat(winners): add WinnerCinematicHero shared block"
```

---

## Task 3: Build `WinnerCinematicCard` (carousel slide)

**Files:**
- Create: `src/components/sections/winner-testimony/WinnerCinematicCard.tsx`

Wraps the hero, adds the brand-gradient `Read full story →` CTA pill in the bottom-right corner of the card. The CTA's `onClick` is passed in from the section.

- [ ] **Step 1: Create the file with full implementation**

Create `src/components/sections/winner-testimony/WinnerCinematicCard.tsx` with this exact content:

```tsx
"use client";

import { ChevronRight } from "lucide-react";
import type { CSSProperties } from "react";
import type { WinnerSummary } from "@/types/winner";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { hexToRgbaString } from "@/utils/package-colors/packageColorScheme";
import WinnerCinematicHero from "./WinnerCinematicHero";

interface WinnerCinematicCardProps {
  winner: WinnerSummary;
  onOpenStory: (winnerId: string) => void;
  /** When true (default), the testimony quote overlays the hero. The CTA always renders. */
  className?: string;
}

function getContrastText(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? "#111827" : "#ffffff";
}

export default function WinnerCinematicCard({
  winner,
  onOpenStory,
  className = "",
}: WinnerCinematicCardProps) {
  const theme = usePromoTheme();
  const ctaTextColor = getContrastText(theme.primary);
  const ctaStyle: CSSProperties = {
    background: theme.gradient,
    color: ctaTextColor,
    boxShadow: `0 8px 24px ${hexToRgbaString(theme.primary, 0.45)}`,
  };

  return (
    <article
      className={`relative overflow-hidden rounded-[24px] shadow-[0_20px_55px_rgba(15,23,42,0.30)] ${className}`}
    >
      <WinnerCinematicHero winner={winner} variant="card" />

      {/* CTA pill anchored bottom-right of the card, sitting over the hero */}
      <button
        type="button"
        onClick={() => onOpenStory(winner.id)}
        aria-haspopup="dialog"
        aria-label={`Read ${winner.winnerFirstName ?? "winner"}'s full story`}
        className="absolute bottom-6 right-6 z-20 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[11px] font-extrabold uppercase tracking-[0.22em] transition-transform duration-200 hover:scale-[1.02] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none sm:bottom-7 sm:right-8"
        style={ctaStyle}
      >
        Read full story
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </article>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `npm run lint -- src/components/sections/winner-testimony/`
Expected: PASS.

- [ ] **Step 4: Proposed commit checkpoint** (ASK USER FIRST)

```bash
git add src/components/sections/winner-testimony/WinnerCinematicCard.tsx
git commit -m "feat(winners): add WinnerCinematicCard carousel slide"
```

---

## Task 4: Build `WinnerStoryModal`

**Files:**
- Create: `src/components/sections/winner-testimony/WinnerStoryModal.tsx`

The "Read full story" modal. Uses existing `ModalContainer` (size `4xl`, fixed height) but **not** `ModalHeader` — the cinematic hero replaces the stacked title block.

- [ ] **Step 1: Create the file with full implementation**

Create `src/components/sections/winner-testimony/WinnerStoryModal.tsx` with this exact content:

```tsx
"use client";

import { Calendar, Gift, MapPin, X } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import type { WinnerSummary } from "@/types/winner";
import { ModalContainer } from "@/components/modals/ui";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { hexToRgbaString } from "@/utils/package-colors/packageColorScheme";
import { getWinnerDisplayDate, stripRichTextHtml } from "@/utils/winners";
import WinnerCinematicHero from "./WinnerCinematicHero";

interface WinnerStoryModalProps {
  winner: WinnerSummary | null;
  onClose: () => void;
}

export default function WinnerStoryModal({ winner, onClose }: WinnerStoryModalProps) {
  const theme = usePromoTheme();
  const { theme: siteTheme } = useTheme();
  const isDark = siteTheme === "dark";

  const isOpen = winner !== null;

  const shellBg = isDark ? "bg-[#0a0d18]" : "bg-[#fafaf7]";
  const proseColor = isDark ? "text-[#cfd5e0]" : "text-[#1f2937]";
  const metaColor = isDark ? "text-white/70" : "text-slate-600";
  const eyebrowLineGradient = `linear-gradient(90deg, transparent, ${hexToRgbaString(theme.primary, 0.5)})`;
  const eyebrowLineGradientReverse = `linear-gradient(90deg, ${hexToRgbaString(theme.primary, 0.5)}, transparent)`;
  const dividerGradient = `linear-gradient(90deg, transparent, ${hexToRgbaString(theme.primary, 0.4)}, transparent)`;
  const metaBorderColor = hexToRgbaString(theme.primary, 0.25);

  const paragraphs = winner
    ? stripRichTextHtml(winner.testimony).split(/\n+/).filter(Boolean)
    : [];

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      size="4xl"
      height="fixed"
      fixedHeight="max-h-[92dvh]"
    >
      {winner ? (
        <div className={`relative flex h-full flex-col overflow-hidden ${shellBg}`}>
          {/* Close button overlaid on hero */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 z-30 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white backdrop-blur-sm transition hover:bg-black/70 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>

          {/* Hero band */}
          <WinnerCinematicHero winner={winner} variant="modal" />

          {/* Editorial body — scrolls if it overflows */}
          <div className="flex-1 overflow-y-auto px-6 py-8 sm:px-10 sm:py-9 lg:px-11 lg:py-10">
            {/* Eyebrow with flanking gradient lines */}
            <div
              className="mb-6 flex items-center gap-3 text-[10px] font-extrabold uppercase tracking-[0.32em]"
              style={{ color: theme.primary }}
            >
              <span
                aria-hidden
                className="h-px flex-1"
                style={{ background: eyebrowLineGradient }}
              />
              The Story
              <span
                aria-hidden
                className="h-px flex-1"
                style={{ background: eyebrowLineGradientReverse }}
              />
            </div>

            {/* Story prose with brand-colored drop cap on first paragraph */}
            <div className={`font-serif text-[16px] leading-[1.7] tracking-[-0.1px] sm:text-[18px] sm:leading-[1.75] ${proseColor}`}>
              {paragraphs.length === 0 ? (
                <p className="italic opacity-70">No story shared yet.</p>
              ) : (
                paragraphs.map((para, idx) => {
                  if (idx === 0 && para.length > 0) {
                    return (
                      <p key={idx} className="mb-5">
                        <span
                          className="float-left mr-3 mt-1 font-serif text-[46px] font-bold leading-[0.85] sm:text-[60px]"
                          style={{ color: theme.primary }}
                        >
                          {para.charAt(0)}
                        </span>
                        {para.slice(1)}
                      </p>
                    );
                  }
                  return (
                    <p key={idx} className="mb-5 last:mb-0">
                      {para}
                    </p>
                  );
                })
              )}
            </div>

            {/* Meta divider */}
            <div
              aria-hidden
              className="my-8 h-px"
              style={{ background: dividerGradient }}
            />

            {/* Meta footer (Option A — clean inline icons) */}
            <div
              className={`flex flex-wrap items-center gap-x-7 gap-y-3 border-t pt-5 text-[12px] font-semibold sm:text-[13px] ${metaColor}`}
              style={{ borderColor: metaBorderColor }}
            >
              <span className="inline-flex items-center gap-2">
                <Calendar className="h-4 w-4 shrink-0" style={{ color: theme.primary }} aria-hidden />
                {getWinnerDisplayDate(winner)}
              </span>
              {winner.winnerState && (
                <span className="inline-flex items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0" style={{ color: theme.primary }} aria-hidden />
                  {winner.winnerState}
                </span>
              )}
              <span className="inline-flex items-center gap-2">
                <Gift className="h-4 w-4 shrink-0" style={{ color: theme.primary }} aria-hidden />
                {winner.drawName}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </ModalContainer>
  );
}
```

**Note on the drop cap implementation:** The first paragraph's first letter is rendered as an explicit floated `<span>` rather than relying on the CSS `::first-letter` pseudo-element. Reason: `::first-letter` cannot reliably accept a dynamic color from `style={{ color }}` across browsers (especially when the color comes from a Zustand store at render time). The float + `mr-3 mt-1` mimics the typographic effect cleanly. Reading order is preserved for screen readers — the span renders before the rest of the paragraph text.

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS. If `useTheme` import fails, the alias resolves to `@/contexts/ThemeContext` (the named export `useTheme` is re-exported from `@/hooks/useTheme.ts`).

- [ ] **Step 3: Lint**

Run: `npm run lint -- src/components/sections/winner-testimony/`
Expected: PASS.

- [ ] **Step 4: Proposed commit checkpoint** (ASK USER FIRST)

```bash
git add src/components/sections/winner-testimony/WinnerStoryModal.tsx
git commit -m "feat(winners): add WinnerStoryModal editorial layout"
```

---

## Task 5: Build the new `WinnerTestimonySection`

**Files:**
- Create: `src/components/sections/winner-testimony/WinnerTestimonySection.tsx`
- Modify: `src/components/sections/winner-testimony/index.ts`

The section orchestrates: themed background, header, Embla carousel, modal state. Empty-state branch (no winners with testimonies) is preserved with refreshed styling.

- [ ] **Step 1: Create the new section file**

Create `src/components/sections/winner-testimony/WinnerTestimonySection.tsx` with this exact content:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ArrowRight, ChevronLeft, ChevronRight, MessageSquareQuote } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import type { WinnerSummary } from "@/types/winner";
import { SectionContainer } from "@/components/ui";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { hexToRgbaString } from "@/utils/package-colors/packageColorScheme";
import { hasWinnerTestimony } from "@/utils/winners";
import WinnerCinematicCard from "./WinnerCinematicCard";
import WinnerStoryModal from "./WinnerStoryModal";
import { buildSectionBackground } from "./theme";

interface WinnerTestimonySectionProps {
  winners: WinnerSummary[];
  className?: string;
}

function getContrastText(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? "#111827" : "#ffffff";
}

export default function WinnerTestimonySection({
  winners,
  className = "",
}: WinnerTestimonySectionProps) {
  const theme = usePromoTheme();
  const { theme: siteTheme } = useTheme();
  const isDark = siteTheme === "dark";
  const ctaTextColor = getContrastText(theme.primary);

  const winnersWithTestimonies = useMemo(
    () => winners.filter((w) => hasWinnerTestimony(w)),
    [winners]
  );

  const [storyModalWinnerId, setStoryModalWinnerId] = useState<string | null>(null);
  const closeStoryModal = useCallback(() => setStoryModalWinnerId(null), []);
  const openStoryModal = useCallback((id: string) => setStoryModalWinnerId(id), []);
  const storyModalWinner = useMemo(
    () => winnersWithTestimonies.find((w) => w.id === storyModalWinnerId) ?? null,
    [storyModalWinnerId, winnersWithTestimonies]
  );

  const sectionBackground = useMemo(
    () => buildSectionBackground(theme.primary, isDark),
    [theme.primary, isDark]
  );

  const titleColor = isDark ? "text-white" : "text-slate-900";
  const subtitleColor = isDark ? "text-white/70" : "text-slate-600";
  const eyebrowColor = { color: theme.primary };

  // ---------- Empty state ----------
  if (winnersWithTestimonies.length === 0) {
    return (
      <section
        className={`relative py-12 sm:py-16 ${className}`}
        style={{ background: sectionBackground }}
      >
        <SectionContainer>
          <div className="mx-auto max-w-2xl text-center">
            <div
              className={`mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full ${isDark ? "bg-white/10 text-white/80" : "bg-slate-900/5 text-slate-700"}`}
            >
              <MessageSquareQuote className="h-7 w-7" />
            </div>
            <div className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.32em]" style={eyebrowColor}>
              — Real Stories —
            </div>
            <h2 className={`font-['Poppins'] text-3xl font-bold sm:text-4xl ${titleColor}`}>
              Hear From Our Winners
            </h2>
            <p className={`mt-3 text-sm sm:text-base ${subtitleColor}`}>
              Check back soon. We&apos;re collecting more winner stories to showcase the real people behind the prizes.
            </p>
            <div className="mt-8">
              <Link
                href="#membership"
                className="winner-motion-button inline-flex items-center gap-2 rounded-full border px-6 py-3.5 text-sm font-bold uppercase tracking-[0.14em] shadow-[0_14px_30px_rgba(15,23,42,0.2)]"
                style={{
                  background: theme.gradient,
                  color: ctaTextColor,
                  borderColor: theme.borderRgba,
                }}
              >
                Join the Winners Circle
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </SectionContainer>
      </section>
    );
  }

  // ---------- Populated state with carousel ----------
  return (
    <PopulatedSection
      winners={winnersWithTestimonies}
      sectionBackground={sectionBackground}
      isDark={isDark}
      titleColor={titleColor}
      subtitleColor={subtitleColor}
      eyebrowColor={eyebrowColor}
      ctaTextColor={ctaTextColor}
      onOpenStory={openStoryModal}
      storyModalWinner={storyModalWinner}
      onCloseStoryModal={closeStoryModal}
      className={className}
    />
  );
}

interface PopulatedSectionProps {
  winners: WinnerSummary[];
  sectionBackground: string;
  isDark: boolean;
  titleColor: string;
  subtitleColor: string;
  eyebrowColor: CSSProperties;
  ctaTextColor: string;
  onOpenStory: (id: string) => void;
  storyModalWinner: WinnerSummary | null;
  onCloseStoryModal: () => void;
  className: string;
}

function PopulatedSection({
  winners,
  sectionBackground,
  isDark,
  titleColor,
  subtitleColor,
  eyebrowColor,
  ctaTextColor,
  onOpenStory,
  storyModalWinner,
  onCloseStoryModal,
  className,
}: PopulatedSectionProps) {
  const theme = usePromoTheme();
  const hasMultiple = winners.length > 1;
  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      align: "center",
      loop: hasMultiple,
      containScroll: hasMultiple ? undefined : "trimSnaps",
      dragFree: false,
    },
    []
  );
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const updateEmblaState = useCallback(() => {
    if (!emblaApi) return;
    setCanScrollPrev(emblaApi.canScrollPrev());
    setCanScrollNext(emblaApi.canScrollNext());
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    updateEmblaState();
    emblaApi.on("select", updateEmblaState);
    emblaApi.on("reInit", updateEmblaState);
    return () => {
      emblaApi.off("select", updateEmblaState);
      emblaApi.off("reInit", updateEmblaState);
    };
  }, [emblaApi, updateEmblaState]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const arrowBg = isDark ? "bg-black/55" : "bg-white/85";
  const arrowText = isDark ? "text-white" : "text-slate-900";
  const arrowBorderStyle: CSSProperties = { borderColor: theme.borderRgba };

  return (
    <>
      <section
        className={`relative overflow-hidden py-12 sm:py-16 lg:py-20 ${className}`}
        style={{ background: sectionBackground }}
      >
        <SectionContainer>
          {/* Header */}
          <div className="mb-8 text-center lg:mb-10">
            <div
              className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.32em]"
              style={eyebrowColor}
            >
              — Real Stories —
            </div>
            <h2 className={`font-['Poppins'] text-3xl font-bold tracking-tight sm:text-4xl lg:text-[2.65rem] ${titleColor}`}>
              Hear From Our Winners
            </h2>
            <div className="mx-auto mt-3 h-[2px] w-12 rounded-full" style={{ background: theme.gradient }} />
            <p className={`mx-auto mt-4 max-w-xl font-serif text-sm italic sm:text-base ${subtitleColor}`}>
              Tradies, weekend warriors, first-home builders — the people behind the prizes.
            </p>
          </div>

          {/* Carousel */}
          <div className="relative">
            {hasMultiple && (
              <>
                <button
                  type="button"
                  onClick={scrollPrev}
                  disabled={!canScrollPrev}
                  aria-label="Previous winner story"
                  className={`absolute left-0 top-1/2 z-20 hidden h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border ${arrowBg} ${arrowText} backdrop-blur-sm shadow-[0_14px_30px_rgba(0,0,0,0.35)] lg:flex`}
                  style={arrowBorderStyle}
                >
                  <ChevronLeft className="h-5 w-5" style={{ color: theme.primary }} />
                </button>
                <button
                  type="button"
                  onClick={scrollNext}
                  disabled={!canScrollNext}
                  aria-label="Next winner story"
                  className={`absolute right-0 top-1/2 z-20 hidden h-12 w-12 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border ${arrowBg} ${arrowText} backdrop-blur-sm shadow-[0_14px_30px_rgba(0,0,0,0.35)] lg:flex`}
                  style={arrowBorderStyle}
                >
                  <ChevronRight className="h-5 w-5" style={{ color: theme.primary }} />
                </button>
              </>
            )}

            <div className="overflow-hidden" ref={emblaRef}>
              <div className="flex">
                {winners.map((winner) => (
                  <div
                    key={winner.id}
                    className="min-w-0 flex-[0_0_92%] pl-0 pr-4 sm:flex-[0_0_88%] sm:pr-5 lg:flex-[0_0_78%] lg:px-4"
                  >
                    <WinnerCinematicCard winner={winner} onOpenStory={onOpenStory} />
                  </div>
                ))}
              </div>
            </div>

            {/* Mobile arrow + counter row */}
            {hasMultiple && (
              <div className="mt-6 flex items-center justify-center gap-4 lg:hidden">
                <button
                  type="button"
                  onClick={scrollPrev}
                  aria-label="Previous winner story"
                  className={`flex h-11 w-11 items-center justify-center rounded-full border ${arrowBg} ${arrowText}`}
                  style={arrowBorderStyle}
                >
                  <ChevronLeft className="h-5 w-5" style={{ color: theme.primary }} />
                </button>
                <div className={`text-sm font-medium ${isDark ? "text-white/80" : "text-slate-700"}`}>
                  {selectedIndex + 1} / {winners.length}
                </div>
                <button
                  type="button"
                  onClick={scrollNext}
                  aria-label="Next winner story"
                  className={`flex h-11 w-11 items-center justify-center rounded-full border ${arrowBg} ${arrowText}`}
                  style={arrowBorderStyle}
                >
                  <ChevronRight className="h-5 w-5" style={{ color: theme.primary }} />
                </button>
              </div>
            )}

            {!hasMultiple && (
              <div className={`mt-6 text-center text-sm font-medium ${isDark ? "text-white/80" : "text-slate-700"}`}>
                1 / 1
              </div>
            )}
          </div>

          {/* Desktop dot indicators */}
          {hasMultiple && (
            <div className="mt-8 hidden items-center justify-center gap-2 lg:flex">
              {winners.map((winner, idx) => {
                const isActive = idx === selectedIndex;
                return (
                  <button
                    key={winner.id}
                    type="button"
                    onClick={() => emblaApi?.scrollTo(idx)}
                    aria-label={`Go to winner story ${idx + 1}`}
                    className={`winner-motion-button h-2.5 rounded-full ${isActive ? "w-8" : `w-2.5 ${isDark ? "bg-white/25 hover:bg-white/45" : "bg-slate-900/20 hover:bg-slate-900/40"}`}`}
                    style={isActive ? { background: theme.gradient } : undefined}
                  />
                );
              })}
            </div>
          )}

          {/* Bottom CTA */}
          <div className="mt-10 text-center lg:mt-14">
            <Link
              href="#membership"
              className="winner-motion-button inline-flex items-center gap-2 rounded-full border px-6 py-3.5 text-sm font-bold uppercase tracking-[0.14em]"
              style={{
                background: theme.gradient,
                color: ctaTextColor,
                borderColor: theme.borderRgba,
                boxShadow: `0 14px 30px ${hexToRgbaString(theme.primary, 0.4)}`,
              }}
            >
              Join the Winners Circle
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </SectionContainer>
      </section>

      <WinnerStoryModal winner={storyModalWinner} onClose={onCloseStoryModal} />
    </>
  );
}
```

- [ ] **Step 2: Update `index.ts` to re-export the section as default**

Replace the contents of `src/components/sections/winner-testimony/index.ts` with:

```ts
export { default } from "./WinnerTestimonySection";
export { default as WinnerCinematicCard } from "./WinnerCinematicCard";
export { default as WinnerCinematicHero } from "./WinnerCinematicHero";
export { default as WinnerStoryModal } from "./WinnerStoryModal";
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 4: Lint**

Run: `npm run lint -- src/components/sections/winner-testimony/`
Expected: PASS.

- [ ] **Step 5: Proposed commit checkpoint** (ASK USER FIRST)

```bash
git add src/components/sections/winner-testimony/
git commit -m "feat(winners): wire WinnerTestimonySection + index re-exports"
```

---

## Task 6: Replace the existing `WinnerTestimonySection.tsx` with a re-export

**Files:**
- Modify: `src/components/sections/WinnerTestimonySection.tsx` (replace entire file)

This preserves all existing import paths in callers.

- [ ] **Step 1: Replace the existing file contents**

Open `src/components/sections/WinnerTestimonySection.tsx` and replace its entire contents with:

```tsx
export { default } from "./winner-testimony";
```

- [ ] **Step 2: Type-check (validates all callers still resolve)**

Run: `npm run type-check`
Expected: PASS. This verifies that every caller — `WinnerTestimoniesClient`, `ToolsetLandingPage`, `[slug]/page.tsx`, `WinnersPageClient`, `my-account/draws/page.tsx`, `GiveawayDetails`, `WinnerTestimoniesClientLazy` — still resolves the default export correctly.

- [ ] **Step 3: Verify no caller imports a named export from the old file**

Run: `grep -rn "from \"@/components/sections/WinnerTestimonySection\"" src/ scripts/ || true`
Expected: All matches use the default import (no `import { something } from`). The original file only had a default export, so this should be clean.

If any named import exists, it was added to the old file outside this refactor — read the line and decide: either re-export the symbol from `winner-testimony/index.ts`, or update the caller to import from a more specific path.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 5: Proposed commit checkpoint** (ASK USER FIRST)

```bash
git add src/components/sections/WinnerTestimonySection.tsx
git commit -m "refactor(winners): redirect WinnerTestimonySection to new module"
```

---

## Task 7: Manual dev-server smoke test

**Files:** none (verification only)

There is no automated component test framework in this codebase. UI correctness is validated by running the dev server and visiting each surface that consumes the section.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: Turbopack boots, app reachable at `http://localhost:3000` (or whichever port is printed).

- [ ] **Step 2: Visit the homepage and find the section**

Open `http://localhost:3000/`. Scroll until the "Hear From Our Winners" section renders (it's lazy via `WinnerTestimoniesClient`).

Verify:
- ✅ Section background is dark navy with red glow (default Milwaukee theme)
- ✅ Eyebrow `— REAL STORIES —` shows in red
- ✅ Title `Hear From Our Winners` is large, white, with a red gradient divider
- ✅ Italic subtitle line below the divider
- ✅ Card shows photo as full-bleed cinematic background (not centered/contained)
- ✅ Top-left red-bordered pill `Major Draw Winner` or `Mini Draw Winner`
- ✅ Top-right pill with month/state on desktop only (≥640px)
- ✅ Bottom shows red opening quote-mark, then quote (Georgia italic), then name + prize line
- ✅ `Read full story →` CTA pill bottom-right of the card
- ✅ Carousel arrows (desktop) and dots (active dot is brand-gradient)

- [ ] **Step 3: Open the modal**

Click `Read full story` on a card.

Verify:
- ✅ Modal opens with cinematic hero band at the top (NOT a separate stacked title bar)
- ✅ Hero shows photo + vignette + brand glow + draw-type pill + (desktop) date pill
- ✅ Name + prize line overlaid on the bottom of the hero
- ✅ Body shows `— THE STORY —` eyebrow in brand color, flanked by gradient lines
- ✅ Story prose is large serif, ~1.75 leading
- ✅ First paragraph has a brand-colored drop cap (~60px desktop, ~46px mobile)
- ✅ Gradient brand divider above the meta footer
- ✅ Meta footer shows Calendar / MapPin (if state) / Gift icons in brand color, with labels
- ✅ Close X in top-right works and modal dismisses

- [ ] **Step 4: Toggle site theme**

Use the site's existing theme toggle to flip from dark to light mode.

Verify:
- ✅ Section background switches to warm cream gradient with red glow
- ✅ Title/subtitle colors flip to dark text on light background
- ✅ Card itself stays cinematic-dark (intentional)
- ✅ Open the modal — modal shell flips to light (`#fafaf7` background, dark prose text), hero stays dark

- [ ] **Step 5: Visit a brand promo page**

Visit `http://localhost:3000/promotions/dewalt-milwaukee` (or any other promo slug from `src/config/prizes.ts`).

Verify:
- ✅ Section background glow swaps to that brand's color (DeWalt yellow / Makita blue / Milwaukee red / Ryobi green)
- ✅ Eyebrow, divider, label borders, opening quote-mark, CTA pill all use brand color
- ✅ Open the modal — drop cap and meta icons also use brand color

- [ ] **Step 6: Test responsive breakpoints**

Use browser devtools responsive mode. Resize through:
- 375px (iPhone SE width)
- 768px (tablet)
- 1280px (laptop)

At each breakpoint verify:
- ✅ Section header sizes scale (no overflow)
- ✅ Card photo + overlay text legible, no clipping
- ✅ Carousel arrows visible at desktop (≥1024px) and hidden + replaced by mobile arrow row below
- ✅ Modal hero scales (380px → 320px → 280px)
- ✅ Modal drop cap shrinks at mobile (60px → 46px)
- ✅ Meta footer wraps to multiple rows when needed

- [ ] **Step 7: Visit `/winners` page**

Open `http://localhost:3000/winners`.

Verify:
- ✅ Section renders with the same new visual treatment (this page also uses `WinnerTestimonySection` via `WinnersPageClient`)
- ✅ The separate `WinnerCard` grid below it is **unchanged** — those cards keep their existing styling (we did not touch `src/components/cards/WinnerCard.tsx`)

- [ ] **Step 8: Visit `/my-account/draws` (signed in) and a promo with `GiveawayDetails`**

Verify these surfaces also render the new section correctly without errors. If you cannot sign in locally, at minimum confirm no console errors in the relevant route's network response.

- [ ] **Step 9: Check the browser console**

Verify no errors or warnings related to:
- Missing `useTheme` provider
- Image optimization (`object-position` warning)
- Embla re-init loops
- React hydration mismatch

If hydration mismatch appears: the section reads from `useTheme()` which may differ between SSR and client. The current component already handles this via `"use client"`. If a mismatch still occurs, consider rendering a placeholder until `theme` is defined.

---

## Task 8: Update the documentation domains

**Files:**
- Modify: `docs/shared-ui/frontend.md`
- Modify: `docs/draws/frontend.md`

The doc-sync hook will block the Stop event if these aren't updated.

- [ ] **Step 1: Read both doc files first**

Read: `docs/shared-ui/frontend.md`
Read: `docs/draws/frontend.md`

These are the authoritative existing docs for these domains. Match the existing tone, headings, and style.

- [ ] **Step 2: Update `docs/shared-ui/frontend.md`**

Find the section that lists section components (likely under a `sections/` heading or inventory list). Add or update the entry for `winner-testimony/` to read approximately:

```markdown
### `sections/winner-testimony/` — Hear From Our Winners

Cinematic editorial section for showcasing winner testimonies. Composed of:

- `WinnerTestimonySection` — section frame, theming, and Embla carousel orchestration
- `WinnerCinematicCard` — carousel slide; wraps the hero and adds the `Read full story` CTA
- `WinnerCinematicHero` — shared cinematic photo block (full-bleed image + vignette + brand edge glow + overlaid name/prize); used by both the card and the modal hero band
- `WinnerStoryModal` — magazine-article modal: cinematic hero + Georgia-serif body with brand-colored drop cap + meta footer
- `theme.ts` — `buildSectionBackground()` and `buildHeroEdgeGlow()` helpers; uses `hexToRgbaString` from package-colors

Section background adapts to site light/dark mode (`useTheme()`); accents (eyebrow, divider, glows, CTA, drop cap, meta icons) follow the active brand promo theme via `usePromoTheme()`. The card and modal hero band intentionally stay dark-cinematic in both modes — the surrounding section is what flips.

Re-exported via `src/components/sections/WinnerTestimonySection.tsx` so existing import paths keep working.
```

If the doc has no obvious place for this, add it under a new `### Winner testimony` heading near where other section components are documented.

- [ ] **Step 3: Update `docs/draws/frontend.md`**

Find the section that mentions winner-related components (the draws domain owns `winner.imageUrl`, the testimony field on the model, and the `useWinners*` hooks). Add a brief note:

```markdown
### Winner testimony display

The cinematic Hear From Our Winners section + Read Full Story modal live under `src/components/sections/winner-testimony/` (shared-ui domain). Draws-domain code (the `Winner` model, `WinnerSummary` type, `winners.ts` utilities) feeds it; the visual layout is owned by shared-ui.

Refactored 2026-05-04: photo is now used as a full-bleed cinematic background (not a centered display image) and the modal uses a magazine-article layout. No data-shape changes.
```

If the doc has no obvious place, add a new `## Cross-domain notes` section.

- [ ] **Step 4: Update `lastVerified` if appropriate**

The doc-sync hook auto-bumps `lastVerified` in the manifest when the doc changes are detected. You don't need to hand-edit, but verify after the next type-check that no warning is printed about a stale `lastVerified` date.

- [ ] **Step 5: Proposed commit checkpoint** (ASK USER FIRST)

```bash
git add docs/shared-ui/frontend.md docs/draws/frontend.md
git commit -m "docs(winners): document new winner-testimony module"
```

---

## Task 9: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Type-check the whole project**

Run: `npm run type-check`
Expected: PASS, no errors anywhere.

- [ ] **Step 2: Lint the whole project**

Run: `npm run lint`
Expected: PASS, no new warnings introduced.

- [ ] **Step 3: Build the project**

Run: `npm run build`
Expected: build succeeds. The build runs `prebuild` first (regenerates the upsell image manifest); both should pass.

- [ ] **Step 4: Confirm the doc-sync hook is satisfied**

Trigger the Stop hook by ending a tool call cleanly (e.g., end-of-turn). If the hook blocks with `BLOCKED: Stale docs`, return to Task 8 and update the listed file.

- [ ] **Step 5: Open the visible PR diff for self-review**

Run: `git diff main -- src/components/sections/`
Then: `git diff main -- docs/`

Review: Are there any leftover artifacts from earlier iterations? Any commented-out code? Any `console.log`s? Clean them up if found.

- [ ] **Step 6: Final proposed commit if any cleanup happened** (ASK USER FIRST)

```bash
git add -p   # interactively confirm each change
git commit -m "chore(winners): final cleanup post-refactor"
```

---

## Self-review checklist (for the implementer)

Before reporting done, walk this list:

1. ✅ All five new files created in `src/components/sections/winner-testimony/`
2. ✅ Old `src/components/sections/WinnerTestimonySection.tsx` is now a one-line re-export
3. ✅ No caller files were edited (verified by grep / git diff)
4. ✅ `WinnerCard.tsx` (the separate component used on `/winners` grid) is **untouched**
5. ✅ No avatar / portrait icon anywhere in the new code
6. ✅ Photos use `object-cover` with `objectPosition: "center 30%"`, NOT `object-contain`
7. ✅ Section background, eyebrow, divider, label borders, opening quote, CTA pill, drop cap, meta icons all use `theme.primary` / `theme.gradient`
8. ✅ `useTheme()` from `@/contexts/ThemeContext` drives light/dark site mode for the section background and modal shell
9. ✅ `hexToRgbaString` reused (NOT a new helper)
10. ✅ Both docs files updated
11. ✅ Type-check, lint, and build all pass
12. ✅ Manual smoke test passed all surfaces (homepage, /winners, /promotions/[slug], /my-account/draws if accessible)
