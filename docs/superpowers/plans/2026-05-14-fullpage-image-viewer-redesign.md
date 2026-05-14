# Fullpage Image Viewer Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the fullpage image viewer with an editorial photo+info-card layout, light/dark theme support, and pinch/double-tap zoom.

**Architecture:** Single-file rewrite of [src/components/ui/FullscreenImageViewer.tsx](../../../src/components/ui/FullscreenImageViewer.tsx). The exported props interface (`FullscreenImageViewerProps`, `FullscreenImageItem`, `FullscreenImageCaption`, `FullscreenTriggerButton`) stays identical, so the five callsites (MembershipModal, WinnerStrip, MiniDrawImageGallery, PrizeShowcase, ModalsGalleryClient) do not change. The viewer uses `useTheme()` for light/dark surfaces and `usePromoTheme()` for brand accents (badge + active thumb only — no glow on chrome). Pinch/double-tap/pan zoom comes from `react-zoom-pan-pinch`; the existing `embla-carousel` swipe is disabled when zoomed and re-enabled at 1×.

**Tech Stack:** Next.js 15 App Router · React 19 · TypeScript · Tailwind · embla-carousel-react · react-zoom-pan-pinch (new) · lucide-react

**Reference design spec:** [docs/superpowers/specs/2026-05-14-fullpage-image-viewer-redesign-design.md](../specs/2026-05-14-fullpage-image-viewer-redesign-design.md)

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `src/components/ui/FullscreenImageViewer.tsx` | rewrite in place | The viewer itself. Top bar, photo area with zoom, chevrons, info card (desktop right column / mobile bottom sheet with grab handle), thumb strip. Exports unchanged. |
| `package.json` / `package-lock.json` | modify | Add `react-zoom-pan-pinch` dependency. |
| `docs/shared-ui/components.md` (or whichever shared-ui doc fits — see Task 7) | modify | Update or add the FullscreenImageViewer entry to describe the new layout, props, and theme rules. |

No new files. No new components extracted. No callsite changes.

---

### Task 1: Install `react-zoom-pan-pinch`

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install the dependency**

Run:
```bash
npm install react-zoom-pan-pinch@^3.7.0
```

Expected: `package.json` gets a new entry under `dependencies` and `package-lock.json` is updated. No type errors.

- [ ] **Step 2: Verify install with type-check**

Run:
```bash
npm run type-check
```

Expected: exits 0 (no errors). The package ships its own `.d.ts` types.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(shared-ui): add react-zoom-pan-pinch for image viewer zoom"
```

---

### Task 2: Rewrite layout shell (theme-aware backdrop, top bar, photo area, chevrons)

Replace the existing 397-line component file with a new structure that produces the **layout skeleton only** — no zoom, no grab handle yet. The output should already pass type-check and render correctly in light + dark mode.

**Files:**
- Rewrite: `src/components/ui/FullscreenImageViewer.tsx`

- [ ] **Step 1: Read the existing file**

Run:
```bash
cat src/components/ui/FullscreenImageViewer.tsx
```

This is to confirm the existing exports and prop shapes before rewriting. Preserve: `FullscreenImageViewer` (default export), `FullscreenTriggerButton` (named export), `FullscreenImageItem`, `FullscreenImageCaption`, `FullscreenImageViewerProps` types.

- [ ] **Step 2: Write the new file**

Replace the entire contents with:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X, Expand } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import ClassNames from "embla-carousel-class-names";
import type { EmblaOptionsType } from "embla-carousel";

import ModalContainer from "@/components/modals/ui/ModalContainer";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/utils/cn";

export interface FullscreenImageCaption {
  drawName: string;
  winnerName: string;
  wonDate: string;
  /** Defaults to major (membership / major-draw winners). */
  drawKind?: "major" | "mini";
}

export interface FullscreenImageItem {
  src: string;
  alt?: string;
  /** Bottom info bar (draw / winner / date). */
  captionDetail?: FullscreenImageCaption;
}

interface FullscreenImageViewerProps {
  isOpen: boolean;
  images: FullscreenImageItem[];
  initialIndex: number;
  onClose: () => void;
  title?: string;
  /** When opened from another modal, stack above it. */
  nested?: boolean;
}

const clampIndex = (index: number, length: number): number => {
  if (length <= 0) return 0;
  if (index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
};

export default function FullscreenImageViewer({
  isOpen,
  images,
  initialIndex,
  onClose,
  title,
  nested = false,
}: FullscreenImageViewerProps) {
  const promoTheme = usePromoTheme();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [currentIndex, setCurrentIndex] = useState(clampIndex(initialIndex, images.length));
  const [canSlidePrev, setCanSlidePrev] = useState(false);
  const [canSlideNext, setCanSlideNext] = useState(false);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
  const hasMultipleImages = images.length > 1;

  const computedInitialIndex = useMemo(
    () => clampIndex(initialIndex, images.length),
    [initialIndex, images.length]
  );

  const mainOptions = useMemo<EmblaOptionsType>(
    () => ({ loop: false, startIndex: computedInitialIndex, duration: 25 }),
    [computedInitialIndex]
  );
  const mainPlugins = useMemo(() => [ClassNames()], []);
  const [mainRef, mainApi] = useEmblaCarousel(mainOptions, mainPlugins);

  const onSelect = useCallback(() => {
    if (!mainApi) return;
    const i = mainApi.selectedScrollSnap();
    setCurrentIndex(i);
    setCanSlidePrev(mainApi.canScrollPrev());
    setCanSlideNext(mainApi.canScrollNext());
  }, [mainApi]);

  useEffect(() => {
    if (!mainApi) return;
    onSelect();
    mainApi.on("select", onSelect);
    mainApi.on("reInit", onSelect);
    return () => {
      mainApi.off("select", onSelect);
      mainApi.off("reInit", onSelect);
    };
  }, [mainApi, onSelect]);

  useEffect(() => {
    if (!isOpen) return;
    lastFocusedElementRef.current = document.activeElement as HTMLElement | null;
    const nextIndex = clampIndex(initialIndex, images.length);
    setCurrentIndex(nextIndex);
    if (mainApi) mainApi.scrollTo(nextIndex, true);
  }, [isOpen, initialIndex, images.length, mainApi]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (!hasMultipleImages) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        mainApi?.scrollNext();
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        mainApi?.scrollPrev();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, hasMultipleImages, onClose, mainApi]);

  useEffect(() => {
    if (isOpen) return;
    lastFocusedElementRef.current?.focus();
  }, [isOpen]);

  const goNext = () => mainApi?.scrollNext();
  const goPrevious = () => mainApi?.scrollPrev();
  const onThumbClick = useCallback((i: number) => mainApi?.scrollTo(i), [mainApi]);

  const showCounter = images.length > 0;
  const activeCaption = images[currentIndex]?.captionDetail;

  // Surfaces — light/dark adaptive
  const backdropBg = isDark ? "#000" : "#f5f5f4";
  const photoBg = isDark ? "#0a0a0a" : "#fafaf9";
  const cardTextColor = isDark ? "rgb(255 255 255)" : "rgb(10 10 10)";
  const pillBg = isDark ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.7)";
  const pillBorder = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)";
  const pillText = isDark ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.85)";
  const cardGradient = isDark
    ? `linear-gradient(180deg, ${promoTheme.primary}2e 0%, #0a0a0a 60%)`
    : `linear-gradient(180deg, ${promoTheme.primary}10 0%, #ffffff 60%)`;
  const cardBorder = isDark
    ? `rgba(255,255,255,0.08)`
    : `rgba(0,0,0,0.06)`;
  const thumbBorder = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      height="screen"
      className="!max-w-full !h-screen !max-h-[100dvh] !rounded-none !overflow-hidden"
      closeOnBackdrop
      nested={nested}
    >
      <div
        className="flex h-full max-h-[100dvh] min-h-0 w-full max-w-[100vw] flex-col overflow-x-hidden overflow-y-hidden overscroll-none touch-pan-x lg:flex-row"
        style={{ background: backdropBg, color: cardTextColor }}
      >
        {/* PHOTO COLUMN (mobile: top ~50vh; desktop: left ~62%) */}
        <div
          className="relative flex min-h-0 w-full flex-col overflow-hidden lg:h-full lg:flex-[0_0_62%]"
          style={{ background: photoBg }}
        >
          {/* Top bar — unthemed, theme-aware */}
          <div className="pointer-events-none absolute left-0 top-0 z-30 flex w-full items-center justify-between p-3 sm:p-4 [&_button]:pointer-events-auto [&_a]:pointer-events-auto">
            {showCounter ? (
              <div
                className="max-w-[80%] truncate rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur sm:text-sm"
                style={{
                  background: pillBg,
                  border: `1px solid ${pillBorder}`,
                  color: pillText,
                }}
              >
                {title ? `${title} · ` : ""}
                {currentIndex + 1} / {images.length}
              </div>
            ) : (
              <div />
            )}
            <button
              type="button"
              onClick={onClose}
              autoFocus
              className="inline-flex h-10 w-10 items-center justify-center rounded-full backdrop-blur focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{
                background: pillBg,
                border: `1px solid ${pillBorder}`,
                color: pillText,
              }}
              aria-label="Close fullscreen image viewer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Image stage (zoom integrated in Task 4) */}
          <div className="relative h-[50vh] min-h-0 w-full overflow-hidden pt-14 sm:pt-16 lg:h-full lg:flex-1">
            <div
              ref={mainRef}
              data-carousel="true"
              style={{ touchAction: "pan-y pinch-zoom" }}
              className="h-full w-full max-w-full overflow-hidden"
            >
              <div className="flex h-full">
                {images.map((image, index) => (
                  <div
                    key={`${image.src}-${index}`}
                    className="embla__slide flex-[0_0_100%] min-w-0 box-border max-w-full overflow-hidden"
                  >
                    <div className="relative h-full w-full max-w-full overflow-hidden">
                      <Image
                        src={image.src}
                        alt={image.alt || `Fullscreen image ${index + 1}`}
                        fill
                        sizes="(min-width: 1024px) 62vw, 100vw"
                        className="box-border object-contain p-3 sm:p-4"
                        priority={index === currentIndex}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {hasMultipleImages ? (
              <>
                {canSlidePrev && (
                  <button
                    type="button"
                    onClick={goPrevious}
                    className="absolute left-2 top-1/2 z-20 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full backdrop-blur transition focus:outline-none focus-visible:ring-2 sm:left-4 sm:h-12 sm:w-12"
                    style={{
                      background: pillBg,
                      border: `1px solid ${pillBorder}`,
                      color: pillText,
                    }}
                    aria-label="View previous image"
                  >
                    <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
                  </button>
                )}
                {canSlideNext && (
                  <button
                    type="button"
                    onClick={goNext}
                    className="absolute right-2 top-1/2 z-20 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full backdrop-blur transition focus:outline-none focus-visible:ring-2 sm:right-4 sm:h-12 sm:w-12"
                    style={{
                      background: pillBg,
                      border: `1px solid ${pillBorder}`,
                      color: pillText,
                    }}
                    aria-label="View next image"
                  >
                    <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
                  </button>
                )}
              </>
            ) : null}
          </div>
        </div>

        {/* INFO CARD COLUMN (mobile: bottom ~41vh; desktop: right ~38%) */}
        <div
          className="relative w-full overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 lg:h-full lg:flex-[0_0_38%] lg:px-6 lg:pt-12"
          style={{
            background: cardGradient,
            borderTop: `1px solid ${cardBorder}`,
            color: cardTextColor,
          }}
        >
          {/* Info card body — populated in Task 3 */}
          {activeCaption ? (
            <div className="space-y-3" data-testid="info-card-body">
              <div className="text-xs opacity-60">(info card content — Task 3)</div>
              <div className="text-sm font-bold">{activeCaption.drawName}</div>
              <div className="text-sm">{activeCaption.winnerName} · {activeCaption.wonDate}</div>
            </div>
          ) : null}

          {/* Thumb strip — populated in Task 3 */}
          {hasMultipleImages ? (
            <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
              {images.map((image, index) => {
                const isActive = currentIndex === index;
                return (
                  <button
                    key={`thumb-${image.src}-${index}`}
                    type="button"
                    onClick={() => onThumbClick(index)}
                    aria-label={`Open image ${index + 1}`}
                    aria-current={isActive}
                    className="relative h-12 w-12 flex-[0_0_auto] overflow-hidden rounded-md border-2 transition-all"
                    style={{
                      borderColor: isActive ? promoTheme.primary : thumbBorder,
                      boxShadow: isActive ? `0 0 0 1px ${promoTheme.primary}66` : undefined,
                    }}
                  >
                    <Image
                      src={image.src}
                      alt={image.alt || `Thumbnail ${index + 1}`}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </ModalContainer>
  );
}

interface FullscreenTriggerButtonProps {
  onClick: () => void;
  className?: string;
  label?: string;
}

export function FullscreenTriggerButton({
  onClick,
  className = "",
  label = "View image in fullscreen",
}: FullscreenTriggerButtonProps) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={label}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white",
        className
      )}
    >
      <Expand className="h-4 w-4" />
    </button>
  );
}
```

- [ ] **Step 3: Type-check**

Run:
```bash
npm run type-check
```

Expected: exits 0. If errors mention `useTheme` not found, confirm the import path is `@/contexts/ThemeContext`.

- [ ] **Step 4: Lint**

Run:
```bash
npm run lint -- src/components/ui/FullscreenImageViewer.tsx
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 5: Manual smoke at /dev/modals**

Start dev: `npm run dev`. Open `http://localhost:3000/dev/modals` → "FullscreenImageViewer". Verify:
- Modal opens, photo shows on left (≥1024px) or top (<1024px)
- Counter pill + close button visible, no themed glow
- Chevrons appear when multi-image, no themed glow
- Toggle theme via site theme toggle → backdrop + card surface flip between dark and light
- Photo backdrop is `#0a0a0a` (dark) or `#fafaf9` (light), not pure black
- Thumb strip shows below caption (placeholder), active thumb has brand-color border

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/FullscreenImageViewer.tsx
git commit -m "feat(shared-ui): rewrite FullscreenImageViewer layout shell with light/dark"
```

---

### Task 3: Build the info card content (badge, prize, meta row, thumb layouts)

Replace the placeholder info card body with the full editorial layout. Add the desktop thumb grid (3-col auto-fit) alongside the mobile horizontal strip.

**Files:**
- Modify: `src/components/ui/FullscreenImageViewer.tsx` (info card section only)

- [ ] **Step 1: Replace the info card body placeholder**

Find the block beginning with `{/* Info card body — populated in Task 3 */}` and ending with the close of the thumb-strip `</div>` block. Replace from `{activeCaption ? (` through the end of the placeholder thumb-strip `)} : null}` with:

```tsx
{activeCaption ? (
  <div className="mx-auto flex max-w-md flex-col gap-3 lg:max-w-none">
    <span
      className="inline-flex w-fit items-center rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white"
      style={{ background: promoTheme.primary }}
    >
      {activeCaption.drawKind === "mini" ? "Mini draw" : "Major draw"}
    </span>

    <h2
      className="text-xl font-extrabold leading-tight sm:text-2xl lg:text-3xl"
      style={{ color: cardTextColor }}
    >
      {activeCaption.drawName}
    </h2>

    <div className="grid grid-cols-2 gap-3 pt-1">
      <div>
        <p
          className="text-[10px] font-bold uppercase tracking-wider opacity-60"
          style={{ color: cardTextColor }}
        >
          Winner
        </p>
        <p
          className="mt-0.5 text-sm font-bold leading-tight sm:text-base"
          style={{ color: cardTextColor }}
        >
          {activeCaption.winnerName}
        </p>
      </div>
      <div>
        <p
          className="text-[10px] font-bold uppercase tracking-wider opacity-60"
          style={{ color: cardTextColor }}
        >
          Won date
        </p>
        <p
          className="mt-0.5 text-sm font-bold leading-tight tabular-nums sm:text-base"
          style={{ color: cardTextColor }}
        >
          {activeCaption.wonDate}
        </p>
      </div>
    </div>
  </div>
) : null}

{hasMultipleImages ? (
  <div
    className="mt-4 border-t pt-3"
    style={{ borderColor: cardBorder }}
  >
    {/* Mobile: horizontal scroll strip */}
    <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
      {images.map((image, index) => {
        const isActive = currentIndex === index;
        return (
          <button
            key={`thumb-m-${image.src}-${index}`}
            type="button"
            onClick={() => onThumbClick(index)}
            aria-label={`Open image ${index + 1}`}
            aria-current={isActive}
            className="relative h-12 w-12 flex-[0_0_auto] overflow-hidden rounded-md border-2 transition-all"
            style={{
              borderColor: isActive ? promoTheme.primary : thumbBorder,
              boxShadow: isActive ? `0 0 0 1px ${promoTheme.primary}66` : undefined,
            }}
          >
            <Image
              src={image.src}
              alt={image.alt || `Thumbnail ${index + 1}`}
              fill
              sizes="64px"
              className="object-cover"
            />
          </button>
        );
      })}
    </div>

    {/* Desktop: 3-col auto-fit grid, scrollable vertically when many */}
    <div className="hidden grid-cols-[repeat(auto-fit,minmax(72px,1fr))] gap-2 lg:grid">
      {images.map((image, index) => {
        const isActive = currentIndex === index;
        return (
          <button
            key={`thumb-d-${image.src}-${index}`}
            type="button"
            onClick={() => onThumbClick(index)}
            aria-label={`Open image ${index + 1}`}
            aria-current={isActive}
            className="relative aspect-square overflow-hidden rounded-md border-2 transition-all"
            style={{
              borderColor: isActive ? promoTheme.primary : thumbBorder,
              boxShadow: isActive ? `0 0 0 1px ${promoTheme.primary}66` : undefined,
            }}
          >
            <Image
              src={image.src}
              alt={image.alt || `Thumbnail ${index + 1}`}
              fill
              sizes="96px"
              className="object-cover"
            />
          </button>
        );
      })}
    </div>
  </div>
) : null}
```

- [ ] **Step 2: Type-check + lint**

Run:
```bash
npm run type-check && npm run lint -- src/components/ui/FullscreenImageViewer.tsx
```

Expected: both exit 0.

- [ ] **Step 3: Manual smoke at /dev/modals**

In the dev modal:
- Badge shows "Major draw" or "Mini draw" in the brand color
- Prize title is large and bold
- Winner / Won-date two-column row reads cleanly
- Mobile (<1024px): thumbs are a single horizontal scroll strip below a divider
- Desktop (≥1024px): thumbs are a multi-row grid (3+ columns), active one has brand-colored border
- Light mode: text is near-black, gradient soft pink wash at top of info card. Dark mode: text is white, gradient is dark red wash at top.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/FullscreenImageViewer.tsx
git commit -m "feat(shared-ui): build info card body (badge, prize, meta, thumbs)"
```

---

### Task 4: Add pinch/double-tap zoom with carousel coordination

Wrap each slide's `<Image>` in a `react-zoom-pan-pinch` `TransformWrapper`. When zoom > 1 on the active slide, disable embla's drag.

**Files:**
- Modify: `src/components/ui/FullscreenImageViewer.tsx`

- [ ] **Step 1: Add the zoom import**

In the import block near the top, after the `embla` imports, add:

```tsx
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
```

- [ ] **Step 2: Add zoom-state tracking**

After the existing state declarations (after `setCanSlideNext`), add:

```tsx
const [isZoomed, setIsZoomed] = useState(false);
const zoomRefs = useRef<Array<ReactZoomPanPinchRef | null>>([]);
```

- [ ] **Step 3: Reset zoom + enable/disable embla swipe on slide change or open**

Add this effect just before the `goNext`/`goPrevious` declarations:

```tsx
useEffect(() => {
  if (!mainApi) return;
  // re-init embla swipe based on zoom state
  mainApi.reInit({ watchDrag: !isZoomed });
}, [mainApi, isZoomed]);

useEffect(() => {
  // reset zoom on the new active slide and clear isZoomed
  zoomRefs.current.forEach((ref, i) => {
    if (i === currentIndex) return;
    ref?.resetTransform(0);
  });
  setIsZoomed(false);
}, [currentIndex]);

useEffect(() => {
  if (!isOpen) {
    setIsZoomed(false);
    zoomRefs.current.forEach((ref) => ref?.resetTransform(0));
  }
}, [isOpen]);
```

- [ ] **Step 4: Wrap each slide's Image in TransformWrapper**

Inside the `{images.map((image, index) => ( ... ))}` block in the photo carousel, replace the inner `<div className="relative h-full w-full ...">` (containing the `<Image ... />`) with:

```tsx
<TransformWrapper
  ref={(el) => { zoomRefs.current[index] = el; }}
  initialScale={1}
  minScale={1}
  maxScale={4}
  doubleClick={{ mode: "toggle", step: 1.5 }}
  pinch={{ step: 5 }}
  wheel={{ step: 0.2 }}
  panning={{ disabled: false }}
  onZoomStop={(ref) => {
    if (index !== currentIndex) return;
    setIsZoomed(ref.state.scale > 1.01);
  }}
  onTransformed={(ref) => {
    if (index !== currentIndex) return;
    setIsZoomed(ref.state.scale > 1.01);
  }}
>
  <TransformComponent
    wrapperClass="!h-full !w-full"
    contentClass="!h-full !w-full"
  >
    <div className="relative h-full w-full max-w-full overflow-hidden">
      <Image
        src={image.src}
        alt={image.alt || `Fullscreen image ${index + 1}`}
        fill
        sizes="(min-width: 1024px) 62vw, 100vw"
        className="box-border object-contain p-3 sm:p-4"
        priority={index === currentIndex}
      />
    </div>
  </TransformComponent>
</TransformWrapper>
```

- [ ] **Step 5: Add keyboard zoom shortcuts**

In the keyboard handler effect (the one with `Escape`, `ArrowRight`, `ArrowLeft`), add these branches before the closing `}`:

```tsx
if (event.key === "+" || event.key === "=") {
  event.preventDefault();
  zoomRefs.current[currentIndex]?.zoomIn(0.5);
}
if (event.key === "-" || event.key === "_") {
  event.preventDefault();
  zoomRefs.current[currentIndex]?.zoomOut(0.5);
}
if (event.key === "0") {
  event.preventDefault();
  zoomRefs.current[currentIndex]?.resetTransform(150);
}
```

Also update the effect's dependency array to include `currentIndex` (it already includes `mainApi`, add `currentIndex`).

- [ ] **Step 6: Type-check + lint**

Run:
```bash
npm run type-check && npm run lint -- src/components/ui/FullscreenImageViewer.tsx
```

Expected: both exit 0.

- [ ] **Step 7: Manual smoke**

At `/dev/modals` → FullscreenImageViewer:
- Pinch on touch device (or DevTools touch emulation) zooms the photo
- Double-click/double-tap toggles 2× zoom
- Mousewheel zooms on desktop
- When zoomed, drag pans the photo and the carousel does NOT swipe to next image
- Pressing `0` resets zoom; `+`/`-` zoom in/out
- Switching slide (arrow key, chevron, or thumb click) resets zoom on the previous slide
- Closing the viewer and reopening resets zoom

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/FullscreenImageViewer.tsx
git commit -m "feat(shared-ui): add pinch/double-tap/pan zoom with carousel coordination"
```

---

### Task 5: Add the zoom hint pill (sessionStorage-flagged)

A small pill in the bottom-right of the photo area says "Pinch / double-tap to zoom" on first open per session, auto-hides after 2s or first user interaction.

**Files:**
- Modify: `src/components/ui/FullscreenImageViewer.tsx`

- [ ] **Step 1: Add hint state + sessionStorage check**

After the `isZoomed` state declaration, add:

```tsx
const [showZoomHint, setShowZoomHint] = useState(false);

useEffect(() => {
  if (!isOpen) {
    setShowZoomHint(false);
    return;
  }
  try {
    const seen = window.sessionStorage.getItem("fullscreen-viewer-zoom-hint-seen");
    if (seen === "1") return;
    setShowZoomHint(true);
    window.sessionStorage.setItem("fullscreen-viewer-zoom-hint-seen", "1");
    const timer = window.setTimeout(() => setShowZoomHint(false), 2000);
    return () => window.clearTimeout(timer);
  } catch {
    /* sessionStorage unavailable — skip hint */
  }
}, [isOpen]);

useEffect(() => {
  // first zoom action dismisses the hint
  if (isZoomed) setShowZoomHint(false);
}, [isZoomed]);
```

- [ ] **Step 2: Render the hint pill**

Inside the photo-stage `<div className="relative h-[50vh] ...">` block, just before the `{hasMultipleImages ? ( <> ... </>) : null}` closing, add:

```tsx
{showZoomHint ? (
  <div
    className="pointer-events-none absolute bottom-3 right-3 z-20 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold backdrop-blur transition-opacity duration-300 sm:text-xs"
    style={{
      background: "rgba(0,0,0,0.55)",
      border: "1px solid rgba(255,255,255,0.15)",
      color: "rgba(255,255,255,0.95)",
    }}
    aria-hidden
  >
    <span
      className="inline-block h-2 w-2 rounded-full border border-white"
      aria-hidden
    />
    Pinch / double-tap to zoom
  </div>
) : null}
```

- [ ] **Step 3: Type-check + lint**

Run:
```bash
npm run type-check && npm run lint -- src/components/ui/FullscreenImageViewer.tsx
```

Expected: both exit 0.

- [ ] **Step 4: Manual smoke**

- Open the viewer for the first time in a fresh session (or clear sessionStorage). Hint pill appears, fades after 2s.
- Close and reopen → no hint pill (sessionStorage remembers).
- Clear sessionStorage `fullscreen-viewer-zoom-hint-seen` and reopen → pill appears again; pinch immediately to confirm it dismisses on first interaction.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/FullscreenImageViewer.tsx
git commit -m "feat(shared-ui): add first-open zoom hint pill"
```

---

### Task 6: Add the mobile grab handle (resting → peek snap)

Mobile-only behavior. The info card has a grab handle at the top; dragging the handle vertically translates the card downward and grows the photo area. Two snap zones: resting (default) and peek (card pulled down so only the badge + prize name remain visible).

**Files:**
- Modify: `src/components/ui/FullscreenImageViewer.tsx`

- [ ] **Step 1: Add drag state**

After the `showZoomHint` state declaration, add:

```tsx
const [cardPeekOffsetPx, setCardPeekOffsetPx] = useState(0);
const dragStartYRef = useRef<number | null>(null);
const dragStartOffsetRef = useRef(0);
const cardElRef = useRef<HTMLDivElement | null>(null);

const SNAP_THRESHOLD_RATIO = 0.5;

useEffect(() => {
  if (!isOpen) setCardPeekOffsetPx(0);
}, [isOpen]);

const onGrabPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
  if (window.innerWidth >= 1024) return; // desktop: handle is hidden, no-op
  dragStartYRef.current = e.clientY;
  dragStartOffsetRef.current = cardPeekOffsetPx;
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
}, [cardPeekOffsetPx]);

const onGrabPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
  if (dragStartYRef.current === null) return;
  const delta = e.clientY - dragStartYRef.current;
  if (delta <= 0) {
    setCardPeekOffsetPx(0);
    return;
  }
  // cap drag to 0.45 * cardHeight (≈ peek max)
  const cardHeight = cardElRef.current?.getBoundingClientRect().height ?? 0;
  const maxOffset = Math.max(0, cardHeight * 0.45);
  setCardPeekOffsetPx(Math.min(delta + dragStartOffsetRef.current, maxOffset));
}, []);

const onGrabPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
  if (dragStartYRef.current === null) return;
  dragStartYRef.current = null;
  (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  // snap to nearest
  const cardHeight = cardElRef.current?.getBoundingClientRect().height ?? 0;
  const maxOffset = Math.max(0, cardHeight * 0.45);
  setCardPeekOffsetPx((current) =>
    current > maxOffset * SNAP_THRESHOLD_RATIO ? maxOffset : 0
  );
}, []);
```

The cap is computed dynamically from the card's actual height (45% of card height) inside `onGrabPointerMove` / `onGrabPointerUp` — no need for a `PEEK_MAX_PX` constant.

- [ ] **Step 2: Wire the handle to the info card column**

Find the info-card outer `<div>` (the one with `className="relative w-full overflow-y-auto px-4 ..."`). Add `ref={cardElRef}` and add a `style` transform for translateY:

```tsx
<div
  ref={cardElRef}
  className="relative w-full overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 transition-transform duration-200 ease-out lg:h-full lg:flex-[0_0_38%] lg:px-6 lg:pt-12"
  style={{
    background: cardGradient,
    borderTop: `1px solid ${cardBorder}`,
    color: cardTextColor,
    transform: `translateY(${cardPeekOffsetPx}px)`,
    transition: dragStartYRef.current === null ? "transform 200ms ease-out" : "none",
  }}
>
```

(Replace the existing outer `<div>` opening tag of the info card.)

- [ ] **Step 3: Add the grab handle element**

As the first child inside the info card column (before the `{activeCaption ? (` block), add:

```tsx
{/* Grab handle — mobile only */}
<div
  className="mx-auto mb-3 flex h-6 w-full max-w-[72px] cursor-grab items-center justify-center touch-none lg:hidden"
  onPointerDown={onGrabPointerDown}
  onPointerMove={onGrabPointerMove}
  onPointerUp={onGrabPointerUp}
  onPointerCancel={onGrabPointerUp}
  role="separator"
  aria-label="Drag down to expand the photo"
>
  <div
    className="h-1 w-12 rounded-full"
    style={{ background: isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.18)" }}
  />
</div>
```

- [ ] **Step 4: Type-check + lint**

Run:
```bash
npm run type-check && npm run lint -- src/components/ui/FullscreenImageViewer.tsx
```

Expected: both exit 0.

- [ ] **Step 5: Manual smoke (mobile / DevTools touch emulation)**

Open `/dev/modals` → FullscreenImageViewer with DevTools narrowed to mobile width (<1024px):
- Grab handle visible above the badge
- Drag the handle downward → info card translates down, photo area grows above
- Release past halfway → card snaps to peek position; release near top → snaps back to resting
- Drag upward from peek → snaps back to resting
- Desktop width (≥1024px): grab handle is hidden, drag is a no-op
- Horizontal photo swipe still works (drag handle doesn't steal it)

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/FullscreenImageViewer.tsx
git commit -m "feat(shared-ui): add mobile info-card grab handle with peek snap"
```

---

### Task 7: Update shared-ui documentation

The `shared-ui` domain doc folder covers this component. Update or add an entry describing the new viewer.

**Files:**
- Modify: `docs/shared-ui/frontend.md` (this is the doc that lists components by section — confirmed contains `WinnerCard`, `PromoTrustBar`, etc.)

- [ ] **Step 1: Read the existing frontend.md to find an insertion point**

Run:
```bash
cat docs/shared-ui/frontend.md | head -60
```

The file is organized by component category (`## Cards`, `## Sections`, etc.). Add the new entry under a new `## Overlays` section if one doesn't already exist, or under an existing section that contains modal/overlay components.

- [ ] **Step 2: Add the FullscreenImageViewer entry**

Write a section using this content:

```markdown
## FullscreenImageViewer

[src/components/ui/FullscreenImageViewer.tsx](../../src/components/ui/FullscreenImageViewer.tsx)

Fullpage modal for browsing a gallery of winner / prize / draw photos. Used by `MembershipModal`, `WinnerStrip`, `MiniDrawImageGallery`, `PrizeShowcase`, and the dev modals gallery.

### Layout

- **Desktop (≥1024px):** photo column (~62%) + info card column (~38%). Thumbs render as a 3-column auto-fit grid in the info card.
- **Mobile (<1024px):** photo on top (~50vh), info card slides up below with a grab handle. Pull the handle down to reveal more of the photo (peek snap). Thumbs render as a horizontal scroll strip.

### Theme integration

- **Light/dark:** reads `useTheme()`. Backdrop is `#000`/`#f5f5f4`; photo area is `#0a0a0a`/`#fafaf9`; info card gradient flips accordingly.
- **Brand color:** reads `usePromoTheme()`. Applied only to the draw-kind badge, the active thumbnail's border/ring, and the faint tint at the top of the info card gradient. No glow on the close button, chevrons, or thumb wrapper.

### Behavior

- Pinch + double-tap + mousewheel zoom via `react-zoom-pan-pinch` (max 4×). Carousel swipe is disabled when zoomed > 1× and re-enables at 1×.
- Keyboard: `Esc` closes, `←/→` navigate, `+`/`-` zoom, `0` resets zoom.
- First-open zoom hint pill appears for 2s (or until first zoom interaction), gated by `sessionStorage["fullscreen-viewer-zoom-hint-seen"]`.

### Props

`FullscreenImageViewerProps`: `isOpen`, `images` (`FullscreenImageItem[]`), `initialIndex`, `onClose`, `title?`, `nested?`. Per-image `captionDetail` is optional (`{ drawName, winnerName, wonDate, drawKind? }`).

### Companion

`FullscreenTriggerButton` — small expand-icon button used by callsites to open the viewer.
```

- [ ] **Step 3: Bump manifest `lastVerified` for shared-ui**

In [CLAUDE.md](../../../CLAUDE.md), find the `shared-ui` domain entry in the Domain Manifest JSON block and update its `lastVerified` to today's date (`2026-05-14`). The doc-sync hook will fail your Stop if you skip this.

- [ ] **Step 4: Commit**

```bash
git add docs/shared-ui CLAUDE.md
git commit -m "docs(shared-ui): document redesigned FullscreenImageViewer"
```

---

### Task 8: Full verification pass

A final pre-merge pass — run the full type-check, lint, and exercise both themes + viewports + zoom + grab handle. No code changes here; verify all earlier tasks integrated cleanly.

- [ ] **Step 1: Type-check (whole project)**

Run:
```bash
npm run type-check
```

Expected: exits 0.

- [ ] **Step 2: Lint (whole project)**

Run:
```bash
npm run lint
```

Expected: exits 0. Fix any errors in [src/components/ui/FullscreenImageViewer.tsx](../../../src/components/ui/FullscreenImageViewer.tsx) inline before continuing.

- [ ] **Step 3: Run the MembershipModal smoke test (verifies the stub still resolves)**

Run:
```bash
npm run test:anchor-billing
```

This isn't directly testing the viewer but it does import MembershipModal, which imports our file. Expected: exits 0.

Inspect [src/components/modals/MembershipModal/__tests__/fullscreen-image-viewer-stub.cjs](../../../src/components/modals/MembershipModal/__tests__/fullscreen-image-viewer-stub.cjs) — it's a no-op stub, no changes needed.

- [ ] **Step 4: Manual verification checklist**

Open `npm run dev`. At `http://localhost:3000/dev/modals` → "FullscreenImageViewer":

**Desktop (≥1024px):**
- [ ] Two-column layout (photo left, info card right)
- [ ] Info card shows badge / prize / Winner / Won date / thumb grid
- [ ] Active thumb has brand-colored border
- [ ] Chevrons appear on multi-image, no themed glow
- [ ] Close button (top-right of photo column) is unthemed pill
- [ ] Counter pill (top-left of photo column) is unthemed
- [ ] Pinch (touchpad gesture or DevTools touch emulation) zooms
- [ ] Double-click toggles 2× zoom
- [ ] Mousewheel zooms
- [ ] When zoomed > 1×, dragging pans (does not swipe to next image)
- [ ] `0` resets zoom
- [ ] Arrow keys still navigate slides; zoom resets on slide change

**Mobile (<1024px — DevTools mobile emulation, e.g. iPhone 14):**
- [ ] Photo on top (~50vh)
- [ ] Info card below with grab handle visible
- [ ] Dragging the handle downward translates the card; release snaps to resting or peek
- [ ] Horizontal swipe on the photo still navigates slides
- [ ] Pinch on the photo zooms; carousel swipe disabled when zoomed
- [ ] Mobile thumb strip is a single horizontal scroll row (no grid)
- [ ] Safe-area inset honored at the bottom of the info card

**Theme switching:**
- [ ] Toggle the site theme (theme toggle in the dev modals page chrome or wherever exposed) → backdrop flips between `#000` and `#f5f5f4`; info card gradient flips; counter/close pills swap; text color flips; brand color (badge, active thumb) stays the same in both themes
- [ ] Active thumb retains brand-colored border in both themes

**Promo theme:**
- [ ] On a promo page (e.g. `/promotion/<any-promo-slug>`), the badge background uses that promo's `primary` color, not the default red
- [ ] If no promo page (default), badge is the Milwaukee red default

- [ ] **Step 5: Commit final**

```bash
git status
# If there are any forgotten changes (formatter ran, manifest update):
git add -A
git commit -m "chore(shared-ui): final viewer redesign tweaks"
# Otherwise, no commit needed; the verification is complete
```

---

## Notes for the implementer

- Do **not** auto-commit. Per [CLAUDE.md](../../../CLAUDE.md), commits require explicit user authorization in the session via one of the documented keywords. Each task's commit step is a *request* — confirm with the user before running it.
- The `predev` step in `npm run dev` regenerates `src/generated/upsellImageManifest.ts` and `src/generated/landingImageManifest.ts`. Those modifications will show up in `git status` but **are not yours** — do not include them in your commits unless they are content changes you intentionally made.
- If `npm install react-zoom-pan-pinch` flags React-19 peer warnings, that's expected — the package's peer range may not yet declare React 19. The library functions correctly under React 19; proceed.
- The `MembershipModal` test suite stubs out this viewer entirely via [asset-stubs.cjs](../../src/components/modals/MembershipModal/__tests__/asset-stubs.cjs). Don't try to "fix" the stub — it intentionally bypasses the viewer because Swiper-era imports broke esbuild's classic JSX transform. The new viewer doesn't use Swiper, so the stub is just defensive; leave it.
