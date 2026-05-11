# Site-wide Interaction Smoothness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the site so every interaction (scroll, swipe, hover, tap, modal open) feels smooth on phone, tablet, and desktop. Five separate commits, each shipping a user-visible win.

**Architecture:** A 3-tier device system (mobile/tablet/desktop) exposed via CSS custom properties keyed off `data-tier` on `<html>`. Components consume tokens declaratively (`backdrop-blur-[var(--ta-blur)]`). `<MotionConfig reducedMotion="user">` at root respects OS reduced-motion. iOS Safari companion fixes (`-webkit-backdrop-filter`, `touch-action`, `min-h-svh`, `visualViewport`). Embla v8 replaces all 9 Swiper instances. Stripe-bearing modals lazy-load via `next/dynamic`. Setinterval countdowns moved into leaf components so they don't re-render carousel-bearing parents.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind v3, framer-motion 12, Embla v8 (+ `embla-carousel-fade`, `embla-carousel-class-names`, existing `embla-carousel-auto-scroll`), TanStack Query.

**Spec:** [docs/superpowers/specs/2026-05-09-site-smoothness-design.md](docs/superpowers/specs/2026-05-09-site-smoothness-design.md).

**Branch:** `claude/ShopFeature`. Each phase = one commit. **Never commit without user authorization** (CLAUDE.md hard rule #1).

---

## Pre-flight

- [ ] **Step 1: Confirm working directory and branch**

```bash
pwd
git status
git rev-parse --abbrev-ref HEAD
```

Expected: working directory `c:/Codes/ToolsAustralia`, branch `claude/ShopFeature`, working tree clean.

- [ ] **Step 2: Confirm baseline build is green before starting**

```bash
npm run lint && npm run type-check && npm run build
```

Expected: all green. If anything fails, fix or abort before starting Phase 1.

---

## Phase 1 — Foundation (no visual change in production)

Goal: install tier system, iOS fixes, print stylesheet, Embla wrappers, and stop the silent reinit storms. End state: production looks identical, but the device-tier infrastructure is in place and all carousel/timer plumbing fixes are landed.

### Task 1.1: Update Domain Manifest in CLAUDE.md

The new `src/lib/device/**` path needs a domain. It fits `shared-ui`.

**Files:**
- Modify: `CLAUDE.md` (Domain Manifest JSON block, `shared-ui` entry)

- [ ] **Step 1: Add `src/lib/device/**` to shared-ui paths**

In the `shared-ui` `paths` array (currently the block starting at the top of the manifest with `"src/components/ui/**"`), add the line `"src/lib/device/**"`. Bump `lastModified` and the `shared-ui` `lastVerified` to `"2026-05-09"`.

- [ ] **Step 2: Verify the JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('CLAUDE.md','utf8').match(/`{3}json([\\s\\S]*?)`{3}/)[1])" && echo OK`
Expected: `OK`.

### Task 1.2: Install new Embla plugins

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install plugins**

```bash
npm install embla-carousel-fade@^8.6.0 embla-carousel-class-names@^8.6.0
```

Expected: deps appear in `package.json`. Existing `embla-carousel-react`, `embla-carousel-auto-scroll` unchanged.

- [ ] **Step 2: Verify installation**

```bash
npm ls embla-carousel-fade embla-carousel-class-names
```

Expected: both resolved at `^8.6.0` and matching version. (The `embla-carousel-autoplay` dep stays for now; removed in Phase 4.)

### Task 1.3: Create `src/lib/device/deviceTier.ts` — pure tier resolver

**Files:**
- Create: `src/lib/device/deviceTier.ts`

- [ ] **Step 1: Write the file**

```ts
export type ViewportTier = "mobile" | "tablet" | "desktop";

export interface CapabilityFlags {
  saveData: boolean;
  reducedMotion: boolean;
  reducedTransparency: boolean;
}

export function resolveViewportTier(width: number): ViewportTier {
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

export function effectiveTier(
  viewport: ViewportTier,
  flags: Pick<CapabilityFlags, "saveData">
): ViewportTier {
  if (flags.saveData) return "mobile";
  return viewport;
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: clean.

### Task 1.4: Create `src/hooks/useDeviceProfile.ts`

**Files:**
- Create: `src/hooks/useDeviceProfile.ts`

- [ ] **Step 1: Write the hook**

```ts
"use client";
import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  resolveViewportTier,
  effectiveTier,
  type ViewportTier,
  type CapabilityFlags,
} from "@/lib/device/deviceTier";

export interface DeviceProfile {
  tier: ViewportTier;
  viewportTier: ViewportTier;
  flags: CapabilityFlags;
}

const initial: DeviceProfile = {
  tier: "desktop",
  viewportTier: "desktop",
  flags: { saveData: false, reducedMotion: false, reducedTransparency: false },
};

export function useDeviceProfile(): DeviceProfile {
  const reducedMotionFM = useReducedMotion();
  const [profile, setProfile] = useState<DeviceProfile>(initial);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mqlReducedTransparency = window.matchMedia(
      "(prefers-reduced-transparency: reduce)"
    );

    const compute = (): DeviceProfile => {
      const w = window.innerWidth;
      const conn = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;
      const flags: CapabilityFlags = {
        saveData: !!conn?.saveData,
        reducedMotion: !!reducedMotionFM,
        reducedTransparency: mqlReducedTransparency.matches,
      };
      const vt = resolveViewportTier(w);
      return { viewportTier: vt, tier: effectiveTier(vt, flags), flags };
    };

    setProfile(compute());

    let raf = 0;
    const onChange = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setProfile(compute());
      });
    };

    window.addEventListener("resize", onChange, { passive: true });
    mqlReducedTransparency.addEventListener("change", onChange);
    const conn = (navigator as unknown as { connection?: { addEventListener?: (e: string, h: () => void) => void; removeEventListener?: (e: string, h: () => void) => void } }).connection;
    conn?.addEventListener?.("change", onChange);

    return () => {
      window.removeEventListener("resize", onChange);
      mqlReducedTransparency.removeEventListener("change", onChange);
      conn?.removeEventListener?.("change", onChange);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reducedMotionFM]);

  return profile;
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: clean.

### Task 1.5: Create `src/hooks/useInViewportAnimation.ts`

**Files:**
- Create: `src/hooks/useInViewportAnimation.ts`

- [ ] **Step 1: Write the hook**

```ts
"use client";
import { useEffect, useState, type RefObject } from "react";

export function useInViewportAnimation(ref: RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: "200px" }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [ref]);
  return inView;
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: clean.

### Task 1.6: Create `src/hooks/useLeafTimer.ts`

**Files:**
- Create: `src/hooks/useLeafTimer.ts`

- [ ] **Step 1: Write the hook**

```ts
"use client";
import { useEffect, useState } from "react";

export function useLeafTimer(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: clean.

### Task 1.7: Create `src/utils/dom/listenerHelpers.ts`

**Files:**
- Create: `src/utils/dom/listenerHelpers.ts`

- [ ] **Step 1: Write the helpers**

```ts
export function addPassiveScroll(
  target: Window | HTMLElement,
  fn: () => void
): () => void {
  const handler = () => fn();
  target.addEventListener("scroll", handler, { passive: true });
  return () => target.removeEventListener("scroll", handler);
}

export function addThrottledResize(fn: () => void): () => void {
  let raf = 0;
  const handler = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      fn();
    });
  };
  window.addEventListener("resize", handler, { passive: true });
  return () => {
    window.removeEventListener("resize", handler);
    if (raf) cancelAnimationFrame(raf);
  };
}

export function addRAFScrollListener(
  target: Window | HTMLElement,
  fn: (scrollY: number) => void
): () => void {
  let raf = 0;
  const isWindow = target === window;
  const handler = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      fn(isWindow ? window.scrollY : (target as HTMLElement).scrollTop);
    });
  };
  target.addEventListener("scroll", handler, { passive: true });
  return () => {
    target.removeEventListener("scroll", handler);
    if (raf) cancelAnimationFrame(raf);
  };
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: clean.

### Task 1.8: Create `src/components/system/DeviceTierProvider.tsx`

**Files:**
- Create: `src/components/system/DeviceTierProvider.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";
import { useEffect } from "react";
import { useDeviceProfile } from "@/hooks/useDeviceProfile";

export default function DeviceTierProvider() {
  const profile = useDeviceProfile();
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.tier = profile.tier;
    root.dataset.viewportTier = profile.viewportTier;
    root.dataset.saveData = profile.flags.saveData ? "true" : "false";
    root.dataset.reducedTransparency = profile.flags.reducedTransparency
      ? "true"
      : "false";
  }, [profile]);
  return null;
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: clean.

### Task 1.9: Create `src/components/banners/FloatingPromoBannerHost.tsx`

**Files:**
- Create: `src/components/banners/FloatingPromoBannerHost.tsx`

- [ ] **Step 1: Write the host**

```tsx
"use client";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const ALLOW: RegExp[] = [
  /^\/$/,
  /^\/promotions/,
  /^\/winners/,
  /^\/draw-results/,
  /^\/mini-draws/,
];

const FloatingPromoBanner = dynamic(
  () => import("@/components/banners/FloatingPromoBanner"),
  { ssr: false }
);

export default function FloatingPromoBannerHost() {
  const pathname = usePathname();
  const show = ALLOW.some((re) => re.test(pathname ?? ""));
  return show ? <FloatingPromoBanner /> : null;
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: clean.

### Task 1.10: Create `src/components/ui/embla/EmblaCarousel.tsx`

**Files:**
- Create: `src/components/ui/embla/EmblaCarousel.tsx`

- [ ] **Step 1: Write the wrapper**

```tsx
"use client";
import { useEffect, useMemo, type ReactNode } from "react";
import useEmblaCarousel from "embla-carousel-react";
import type { EmblaOptionsType, EmblaCarouselType, EmblaPluginType } from "embla-carousel";

interface EmblaCarouselProps {
  options?: EmblaOptionsType;
  plugins?: EmblaPluginType[];
  className?: string;
  containerClassName?: string;
  children: ReactNode;
  onApi?: (api: EmblaCarouselType) => void;
}

export function EmblaCarousel({
  options,
  plugins,
  className,
  containerClassName,
  children,
  onApi,
}: EmblaCarouselProps) {
  const stableOptions = useMemo(() => options ?? {}, [options]);
  const stablePlugins = useMemo(() => plugins ?? [], [plugins]);
  const [emblaRef, emblaApi] = useEmblaCarousel(stableOptions, stablePlugins);

  useEffect(() => {
    if (emblaApi && onApi) onApi(emblaApi);
  }, [emblaApi, onApi]);

  return (
    <div
      className={className}
      ref={emblaRef}
      data-carousel="true"
      style={{ touchAction: "pan-y pinch-zoom" }}
    >
      <div className={containerClassName}>{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: clean. (If Embla types complain about `EmblaPluginType` import path, use `embla-carousel/components/Plugins` instead — adjust to the actual exported path in the installed version.)

### Task 1.11: Create `src/components/ui/embla/EmblaCarouselButton.tsx`

**Files:**
- Create: `src/components/ui/embla/EmblaCarouselButton.tsx`

- [ ] **Step 1: Write the button**

```tsx
"use client";
import { type ButtonHTMLAttributes } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/utils/cn";

interface EmblaCarouselButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  direction: "prev" | "next";
}

export function EmblaCarouselButton({
  direction,
  className,
  disabled,
  ...props
}: EmblaCarouselButtonProps) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={direction === "prev" ? "Previous" : "Next"}
      disabled={disabled}
      className={cn(
        "inline-flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center",
        "rounded-full border-2 bg-black/70 text-white transition hover:bg-black/85",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    >
      <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
    </button>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: clean.

### Task 1.12: Create `src/components/ui/embla/EmblaThumbsGallery.tsx`

**Files:**
- Create: `src/components/ui/embla/EmblaThumbsGallery.tsx`

- [ ] **Step 1: Write the gallery**

```tsx
"use client";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Fade from "embla-carousel-fade";
import ClassNames from "embla-carousel-class-names";
import type { EmblaOptionsType } from "embla-carousel";

export interface EmblaThumbsGalleryProps<T> {
  items: T[];
  renderMain: (item: T, index: number, isActive: boolean) => ReactNode;
  renderThumb: (item: T, index: number, isActive: boolean) => ReactNode;
  fade?: boolean;
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
  rootClassName?: string;
  mainClassName?: string;
  mainContainerClassName?: string;
  thumbsClassName?: string;
  thumbsContainerClassName?: string;
  slideClassName?: string;
  thumbSlideClassName?: string;
}

export function EmblaThumbsGallery<T>({
  items,
  renderMain,
  renderThumb,
  fade = false,
  initialIndex = 0,
  onIndexChange,
  rootClassName,
  mainClassName,
  mainContainerClassName = "flex",
  thumbsClassName,
  thumbsContainerClassName = "flex gap-2",
  slideClassName = "embla__slide flex-[0_0_100%] min-w-0",
  thumbSlideClassName = "embla__thumb flex-[0_0_auto]",
}: EmblaThumbsGalleryProps<T>) {
  const mainOptions = useMemo<EmblaOptionsType>(
    () => ({ loop: false, startIndex: initialIndex, duration: 25 }),
    [initialIndex]
  );
  const mainPlugins = useMemo(
    () => (fade ? [Fade(), ClassNames()] : [ClassNames()]),
    [fade]
  );
  const thumbsOptions = useMemo<EmblaOptionsType>(
    () => ({ containScroll: "keepSnaps", dragFree: true }),
    []
  );
  const thumbsPlugins = useMemo(() => [ClassNames()], []);

  const [mainRef, mainApi] = useEmblaCarousel(mainOptions, mainPlugins);
  const [thumbsRef, thumbsApi] = useEmblaCarousel(thumbsOptions, thumbsPlugins);
  const [selected, setSelected] = useState(initialIndex);

  const onSelect = useCallback(() => {
    if (!mainApi || !thumbsApi) return;
    const i = mainApi.selectedScrollSnap();
    setSelected(i);
    thumbsApi.scrollTo(i);
    onIndexChange?.(i);
  }, [mainApi, thumbsApi, onIndexChange]);

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

  const onThumbClick = useCallback(
    (i: number) => mainApi?.scrollTo(i),
    [mainApi]
  );

  return (
    <div className={rootClassName}>
      <div
        className={mainClassName}
        ref={mainRef}
        data-carousel="true"
        style={{ touchAction: "pan-y pinch-zoom" }}
      >
        <div className={mainContainerClassName}>
          {items.map((it, i) => (
            <div key={i} className={slideClassName}>
              {renderMain(it, i, i === selected)}
            </div>
          ))}
        </div>
      </div>
      <div
        className={thumbsClassName}
        ref={thumbsRef}
        style={{ touchAction: "pan-y pinch-zoom" }}
      >
        <div className={thumbsContainerClassName}>
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onThumbClick(i)}
              className={thumbSlideClassName}
              aria-current={i === selected}
            >
              {renderThumb(it, i, i === selected)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: clean.

### Task 1.13: Append CSS tokens to globals.css

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Append the token + media-query layer at end of file**

Append (do not replace) the following block at the end of `src/app/globals.css`:

```css
/* ===== Device-tier tokens (added 2026-05-09) ===== */
:root {
  --ta-blur:               12px;
  --ta-shadow-card:        0 16px 48px rgb(0 0 0 / 0.40);
  --ta-shadow-card-hover:  0 24px 60px rgb(0 0 0 / 0.55);
  --ta-card-hover-y:       -4px;
  --ta-transition-dur:     200ms;
  --ta-marquee-state:      running;
}
html[data-tier="mobile"] {
  --ta-blur:               0px;
  --ta-shadow-card:        0 4px 12px rgb(0 0 0 / 0.30);
  --ta-shadow-card-hover:  0 4px 12px rgb(0 0 0 / 0.30);
  --ta-card-hover-y:       0px;
  --ta-transition-dur:     150ms;
}
html[data-tier="tablet"] {
  --ta-blur:               4px;
  --ta-shadow-card:        0 8px 24px rgb(0 0 0 / 0.35);
  --ta-shadow-card-hover:  0 12px 32px rgb(0 0 0 / 0.45);
  --ta-card-hover-y:       -2px;
}
html[data-save-data="true"] {
  --ta-marquee-state: paused;
}

@media (prefers-reduced-motion: reduce) {
  :root { --ta-transition-dur: 1ms; --ta-marquee-state: paused; }
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }
}
@media (prefers-reduced-transparency: reduce) {
  :root { --ta-blur: 0px; }
}

/* iOS Safari requires -webkit-backdrop-filter alongside backdrop-filter.
   Tailwind v3 emits only the unprefixed form. Mirror it here. */
[class*="backdrop-blur"] {
  -webkit-backdrop-filter: var(--tw-backdrop-blur, ) var(--tw-backdrop-brightness, ) var(--tw-backdrop-contrast, ) var(--tw-backdrop-grayscale, ) var(--tw-backdrop-hue-rotate, ) var(--tw-backdrop-invert, ) var(--tw-backdrop-opacity, ) var(--tw-backdrop-saturate, ) var(--tw-backdrop-sepia, );
}

@media print {
  [data-print="hide"],
  header[data-sticky="true"],
  [data-floating-widget],
  [data-tracking-pixel] {
    display: none !important;
  }
  html, body { background: #fff !important; color: #000 !important; }
}
```

- [ ] **Step 2: Build to confirm no CSS parse errors**

```bash
npm run build
```

Expected: build completes. (Note: build is heavier than type-check; first run from cold can take minutes. Use type-check between most steps; reserve build for milestone tasks like this one.)

### Task 1.14: Wire `<MotionConfig>` and `<DeviceTierProvider>` in providers.tsx

**Files:**
- Modify: `src/app/providers.tsx`

- [ ] **Step 1: Add imports**

At the top of imports (after existing framer-motion-adjacent imports), add:

```ts
import { MotionConfig } from "framer-motion";
import DeviceTierProvider from "@/components/system/DeviceTierProvider";
import FloatingPromoBannerHost from "@/components/banners/FloatingPromoBannerHost";
```

- [ ] **Step 2: Remove the old static FloatingPromoBanner import**

Delete the line:

```ts
import FloatingPromoBanner from "@/components/banners/FloatingPromoBanner";
```

- [ ] **Step 3: Wrap children in `<MotionConfig>` and replace banner**

Inside the `Providers` JSX, locate the `<ToastProvider>...</ToastProvider>` block. The current contents are:

```tsx
<ToastProvider>
  <AffiliateTracker />
  <ReferralTracker />
  <PromoLinkTracker />
  <KlaviyoUserIdentifier />
  <UpgradeSuccessToast />
  {children}
  <FloatingPromoBanner />
  {process.env.NODE_ENV === "development" ? <MajorDrawTestControls /> : null}
</ToastProvider>
```

Replace with:

```tsx
<ToastProvider>
  <MotionConfig reducedMotion="user">
    <DeviceTierProvider />
    <AffiliateTracker />
    <ReferralTracker />
    <PromoLinkTracker />
    <KlaviyoUserIdentifier />
    <UpgradeSuccessToast />
    {children}
    <FloatingPromoBannerHost />
    {process.env.NODE_ENV === "development" ? <MajorDrawTestControls /> : null}
  </MotionConfig>
</ToastProvider>
```

- [ ] **Step 4: Type-check**

```bash
npm run type-check
```

Expected: clean.

### Task 1.15: Drop body `transition-colors` from layout.tsx

**Files:**
- Modify: `src/app/layout.tsx:120`

- [ ] **Step 1: Edit the body className**

The current line:

```tsx
<body
  className={cn(inter.className, "antialiased bg-white dark:bg-neutral-950 text-gray-900 dark:text-neutral-100 transition-colors duration-200 ease-out")}
>
```

Replace with:

```tsx
<body
  className={cn(inter.className, "antialiased bg-white dark:bg-neutral-950 text-gray-900 dark:text-neutral-100")}
>
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: clean.

### Task 1.16: Memoize BrandScroller and pause-when-offscreen

**Files:**
- Modify: `src/components/ui/BrandScroller.tsx`

- [ ] **Step 1: Replace inline plugins/options with memoized versions**

Locate lines 85–95. The current code constructs a new `plugins` array and passes literal options to `useEmblaCarousel` every render. Replace with:

```tsx
"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import AutoScroll from "embla-carousel-auto-scroll";
import { brandLogos, BrandLogo } from "@/data/brandLogos";
import BrandLogoCard from "@/components/ui/BrandLogoCard";
import { useInViewportAnimation } from "@/hooks/useInViewportAnimation";
import { addThrottledResize } from "@/utils/dom/listenerHelpers";
import { cn } from "@/utils/cn";

interface BrandScrollerProps {
  speed?: number;
  speedPxPerSec?: number;
  speedMobile?: number;
  speedSm?: number;
  speedLg?: number;
  pauseOnHover?: boolean;
  className?: string;
}

function useViewportWidth() {
  const [w, setW] = useState<number>(() => {
    if (typeof window === "undefined") return 1024;
    return window.innerWidth;
  });
  useLayoutEffect(() => {
    setW((prev) => {
      const actual = window.innerWidth;
      return actual !== prev ? actual : prev;
    });
  }, []);
  useEffect(() => addThrottledResize(() => setW(window.innerWidth)), []);
  return w;
}

export default function BrandScroller({
  speed = 30,
  speedPxPerSec,
  speedMobile,
  speedSm,
  speedLg,
  pauseOnHover = true,
  className = "",
}: BrandScrollerProps) {
  const width = useViewportWidth();
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInViewportAnimation(rootRef);

  const currentSpeedSec =
    width < 640 && speedMobile !== undefined
      ? speedMobile
      : width < 1024 && speedSm !== undefined
      ? speedSm
      : width >= 1024 && speedLg !== undefined
      ? speedLg
      : speed;

  const derivedPxPerSecRaw = Math.round(width / Math.max(1, currentSpeedSec));
  const derivedPxPerSec = Math.max(2, Math.min(80, derivedPxPerSecRaw));
  const pxPerSec = speedPxPerSec !== undefined ? speedPxPerSec : derivedPxPerSec;

  const options = useMemo(
    () => ({ loop: true, align: "start" as const, dragFree: true, skipSnaps: true }),
    []
  );
  const plugins = useMemo(
    () => [
      AutoScroll({
        speed: 30,
        startDelay: 50,
        stopOnInteraction: false,
        stopOnMouseEnter: pauseOnHover,
        stopOnFocusIn: pauseOnHover,
      }),
    ],
    [pauseOnHover]
  );

  const [emblaRef, emblaApi] = useEmblaCarousel(options, plugins);

  // Update plugin speed live without recreating the plugin (avoids reinit storm).
  useEffect(() => {
    if (!emblaApi) return;
    const auto = emblaApi.plugins().autoScroll;
    if (!auto) return;
    const opts = (auto as unknown as { options?: { speed: number } }).options;
    if (opts) opts.speed = pxPerSec;
    (auto as unknown as { reset?: () => void }).reset?.();
  }, [emblaApi, pxPerSec]);

  // Pause/play when off/on screen.
  useEffect(() => {
    if (!emblaApi) return;
    const auto = emblaApi.plugins().autoScroll;
    if (!auto) return;
    if (inView) (auto as unknown as { play?: () => void }).play?.();
    else (auto as unknown as { stop?: () => void }).stop?.();
  }, [emblaApi, inView]);

  return (
    <div ref={rootRef} className={cn("w-full overflow-hidden", className)} data-carousel="true">
      <div ref={emblaRef} style={{ touchAction: "pan-y pinch-zoom" }}>
        <div className="flex items-center gap-4 sm:gap-6 lg:gap-8">
          <div className="w-1 sm:w-2 flex-shrink-0" />
          {brandLogos.map((brand) => (
            <BrandItem key={`first-${brand.id}`} brand={brand} />
          ))}
          {brandLogos.map((brand) => (
            <BrandItem key={`second-${brand.id}`} brand={brand} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface BrandItemProps {
  brand: BrandLogo;
}

function BrandItem({ brand }: BrandItemProps) {
  return (
    <BrandLogoCard
      brand={brand}
      widthClass="w-[140px] sm:w-[160px] lg:w-[200px]"
      heightClass="h-[60px] sm:h-[70px] lg:h-[90px]"
    />
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: clean.

- [ ] **Step 3: Smoke test**

Run `npm run dev`. Open `/`. Brand scroller continues to scroll smoothly. Resize the window — scroller doesn't reinit on every pixel change.

### Task 1.17: Memoize WinnerTestimonySection options

**Files:**
- Modify: `src/components/sections/winner-testimony/WinnerTestimonySection.tsx:153-161`

- [ ] **Step 1: Wrap options + plugins in `useMemo`**

The current code at L153-161 creates a fresh options object literal each render. Locate the `useEmblaCarousel(...)` call. Replace the options literal with a `useMemo` call:

```tsx
const emblaOptions = useMemo(
  () => ({ loop: true, align: "center" as const, /* preserve all existing keys verbatim */ }),
  []
);
const emblaPlugins = useMemo(() => [], []);
const [emblaRef, emblaApi] = useEmblaCarousel(emblaOptions, emblaPlugins);
```

(Read the current options object first; copy every existing key into the `useMemo` body unchanged.)

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: clean.

### Task 1.18: Memoize OtherToolsetsCarousel options + listener fix

**Files:**
- Modify: `src/components/sections/promo/prize-selection/OtherToolsetsCarousel.tsx`

- [ ] **Step 1: Memoize Embla options + plugins**

Locate the `useEmblaCarousel(...)` call (L133-136). The current options object is a literal. Replace with:

```tsx
const emblaOptions = useMemo(
  () => ({ loop: true, align: "center" as const, dragFree: true, slidesToScroll: 1 }),
  []
);
const emblaPlugins = useMemo(() => [], []);
const [emblaRef, emblaApi] = useEmblaCarousel(emblaOptions, emblaPlugins);
```

Make sure `useMemo` is imported.

- [ ] **Step 2: Replace resize listener with `addThrottledResize`**

At L98 the current code uses an unthrottled `window.addEventListener("resize", check)`. Replace with:

```tsx
import { addThrottledResize } from "@/utils/dom/listenerHelpers";
// ...
useEffect(() => {
  check();
  return addThrottledResize(check);
}, [otherToolsets.length]);
```

(Inline `check` as before; the existing function does not change.)

- [ ] **Step 3: Type-check**

```bash
npm run type-check
```

Expected: clean.

### Task 1.19: Create `src/components/ui/CountdownLeaf.tsx` — shared leaf timer component

**Files:**
- Create: `src/components/ui/CountdownLeaf.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";
import { type ReactNode } from "react";
import { useLeafTimer } from "@/hooks/useLeafTimer";

export interface CountdownLeafProps {
  targetMs: number;
  intervalMs?: number;
  children: (msRemaining: number) => ReactNode;
}

export function CountdownLeaf({
  targetMs,
  intervalMs = 1000,
  children,
}: CountdownLeafProps) {
  const now = useLeafTimer(intervalMs);
  return <>{children(targetMs - now)}</>;
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: clean.

### Task 1.20: Leaf-ify MajorDrawSection countdown

**Files:**
- Modify: `src/components/sections/MajorDrawSection.tsx:255` (and surrounding state)

- [ ] **Step 1: Identify the timer state in MajorDrawSection**

The component currently runs `setInterval(updateTimer, 1000)` at L255 and stores time-left in component state. Locate the `useState` that stores the time-remaining value, the `setInterval` block at L255, and the JSX that renders the countdown.

- [ ] **Step 2: Extract a leaf component**

Create a new local component near the top of the file (or as a separate file `src/components/sections/major-draw/MajorDrawCountdownLeaf.tsx` — choice depends on file size; spec recommends shared base, see Task 1.19):

```tsx
function MajorDrawCountdownLeaf({ targetMs, render }: {
  targetMs: number;
  render: (remaining: number) => ReactNode;
}) {
  const now = useLeafTimer(1000);
  return <>{render(targetMs - now)}</>;
}
```

In the parent MajorDrawSection, remove the `useState` for timeLeft and the `setInterval` at L255. Replace the JSX that consumed the timer state with:

```tsx
<MajorDrawCountdownLeaf
  targetMs={drawDate.getTime()}
  render={(remaining) => (
    /* paste the original timer-display JSX here, replacing references to the old state with values derived from `remaining` */
  )}
/>
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check
```

Expected: clean.

- [ ] **Step 4: Smoke test**

Run `npm run dev`. Open `/`. Major-draw countdown still ticks. Open React DevTools Profiler — confirm `MajorDrawSection` no longer re-renders every second; only `MajorDrawCountdownLeaf` does.

### Task 1.21: Leaf-ify GiveawayCountdownTimer

**Files:**
- Modify: `src/components/sections/promo/GiveawayCountdownTimer.tsx:73`

- [ ] **Step 1: Replace internal `setInterval` + `useState` with `useLeafTimer`**

The component currently has a `setInterval(updateTimer, 1000)` at L73 with `useState` for `timeLeft`. If the entire component is small (just renders a countdown), simply replace its body to use `useLeafTimer` directly:

```tsx
const now = useLeafTimer(1000);
const remaining = targetMs - now;
const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
const hours = Math.floor((remaining / (1000 * 60 * 60)) % 24);
const minutes = Math.floor((remaining / (1000 * 60)) % 60);
const seconds = Math.floor((remaining / 1000) % 60);
```

If the component is large and parents pass time-left down, leave it as-is. The parent re-rendering pattern is what matters; if this component IS the leaf, it's fine.

- [ ] **Step 2: Type-check + smoke test**

```bash
npm run type-check
```

Open `/promotions/[slug]`, confirm countdown still ticks.

### Task 1.22: Leaf-ify FloatingCountdownBanner

**Files:**
- Modify: `src/components/banners/FloatingCountdownBanner.tsx:75`

- [ ] **Step 1: Move the timer state into a leaf**

The component has `setInterval(updateTimer, 1000)` at L75 plus visibility logic that depends on scroll. The scroll logic should stay in the host; the timer state should be in a leaf so the host doesn't re-render every second.

Extract the visual countdown into a `<FloatingCountdownLeaf targetMs={...}>` local component using `useLeafTimer`. The host computes `targetMs` once (memoized), passes it down, and the leaf owns the tick.

- [ ] **Step 2: Type-check + smoke test**

```bash
npm run type-check
```

Open `/`, scroll to trigger the banner, confirm countdown ticks.

### Task 1.23: Leaf-ify MajorDrawOverview countdown

**Files:**
- Modify: `src/app/(site)/my-account/components/MajorDrawOverview.tsx:72`

- [ ] **Step 1: Same pattern as Task 1.20**

`setInterval(calculateTimeLeft, 1000)` at L72 → extract leaf component owning `useLeafTimer`. Parent passes `targetMs` (memoized) and the leaf computes display.

- [ ] **Step 2: Type-check + smoke test**

```bash
npm run type-check
```

Open `/my-account`, confirm overview countdown ticks without re-rendering the whole page.

### Task 1.24: Leaf-ify MiniDrawCountdown

**Files:**
- Modify: `src/app/(site)/mini-draws/[id]/components/MiniDrawCountdown.tsx:45`

- [ ] **Step 1: Replace timer with `useLeafTimer`**

If the file is dedicated to the countdown, just swap the `useEffect`/`setInterval`/`useState` block at L45 for `useLeafTimer` and derive the display.

- [ ] **Step 2: Type-check + smoke test**

```bash
npm run type-check
```

Open `/mini-draws/[id]`, confirm countdown ticks.

### Task 1.25: Leaf-ify FreezePeroidBanner countdown

**Files:**
- Modify: `src/components/banners/FreezePeroidBanner.tsx:42`

- [ ] **Step 1: Use `useLeafTimer`**

`setInterval(..., 1000)` at L42 → `useLeafTimer(1000)`.

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

### Task 1.26: Leaf-ify PromoBanner countdown

**Files:**
- Modify: `src/components/sections/promo/PromoBanner.tsx:657`

- [ ] **Step 1: Extract timer into a leaf component**

`setInterval(tick, 1000)` at L657. The PromoBanner is large; extract a `<PromoBannerCountdownLeaf>` so the rest of PromoBanner doesn't re-render every second.

- [ ] **Step 2: Type-check + smoke test**

```bash
npm run type-check
```

Open `/promotions/[slug]`, confirm banner countdown ticks.

### Task 1.27: Verify HorizontalCountdown and BenefitCountdown are leaf-isolated

**Files:**
- Inspect: `src/components/sections/HorizontalCountdown.tsx:55`
- Inspect: `src/components/ui/BenefitCountdown.tsx:67`

- [ ] **Step 1: Inspect each**

Read both files. If they are dedicated countdown components (their entire body is the countdown), the `setInterval` is already a leaf — no change needed. If they have additional UI logic that re-renders on tick, follow Task 1.20 pattern.

- [ ] **Step 2: Type-check after any change**

```bash
npm run type-check
```

### Task 1.28: Leaf-ify Header top-bar promo toggle

**Files:**
- Modify: `src/components/layout/Header.tsx:247`

- [ ] **Step 1: Extract `<TopBarPromoLeaf>`**

`setInterval(..., 3000)` at L247 toggles a boolean that drives a slide animation in the top bar. Extract a small component `<TopBarPromoLeaf>` that owns the toggle state and renders just the affected slide. The rest of Header stops re-rendering every 3 seconds.

- [ ] **Step 2: Type-check + smoke test**

```bash
npm run type-check
```

Open `/`, confirm top-bar promo still alternates.

### Task 1.29: Leaf-ify MajorDrawHeaderStrip toggle

**Files:**
- Modify: `src/app/(site)/my-account/components/MajorDrawHeaderStrip.tsx:55`

- [ ] **Step 1: Extract toggle**

Same pattern as Task 1.28. The `setInterval` toggles `showSchedule`. Extract a leaf that owns the toggle and renders the affected sub-tree.

- [ ] **Step 2: Type-check + smoke test**

```bash
npm run type-check
```

Open `/my-account/draws`, confirm strip still alternates.

### Task 1.30: Convert FloatingCountdownBanner scroll listener to RAF

**Files:**
- Modify: `src/components/banners/FloatingCountdownBanner.tsx:128`

- [ ] **Step 1: Replace `addEventListener("scroll", h)` with `addRAFScrollListener`**

Locate L128 — it's a `window.addEventListener("scroll", handleScroll)` without passive flag. Replace with:

```tsx
import { addRAFScrollListener } from "@/utils/dom/listenerHelpers";

useEffect(() => {
  return addRAFScrollListener(window, (scrollY) => {
    /* paste the body of the original handleScroll, using `scrollY` parameter */
  });
}, [/* original deps */]);
```

- [ ] **Step 2: Type-check + smoke test**

```bash
npm run type-check
```

Smoke test: scroll on `/`, banner appears/disappears as before; scroll FPS feels native.

### Task 1.31: Convert FloatingGetEntriesButton scroll listener to RAF

**Files:**
- Modify: `src/components/sections/promo/FloatingGetEntriesButton.tsx:49`

- [ ] **Step 1: Replace with `addRAFScrollListener`**

Same pattern as Task 1.30.

- [ ] **Step 2: Type-check + smoke test**

```bash
npm run type-check
```

Smoke on `/promotions/[slug]`.

### Task 1.32: Convert remaining unthrottled resize listeners

**Files:**
- Modify: `src/components/ui/BrandLogoCard.tsx:51`
- Modify: `src/components/features/RewardsFloatingWidget.tsx:175`
- Modify: `src/components/sections/promo/PromoBanner.tsx:459`
- Modify: `src/components/sections/promo/PromoBanner.tsx:689`

- [ ] **Step 1: For each file, replace `window.addEventListener("resize", h)` with `addThrottledResize(h)`**

Pattern (apply to each file):

```tsx
import { addThrottledResize } from "@/utils/dom/listenerHelpers";

useEffect(() => {
  /* preserve any initial call, e.g. handleResize() */
  return addThrottledResize(handleResize);
}, [/* original deps */]);
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: clean.

### Task 1.33: AnimatedNumber pause-when-offscreen

**Files:**
- Modify: `src/components/ui/AnimatedNumber.tsx:37-40`

- [ ] **Step 1: Add `useInViewportAnimation`**

The component runs a recursive `requestAnimationFrame` loop that animates a number. Wrap the host element with a `ref`, call `useInViewportAnimation(ref)`, and skip the RAF tick when not in view (show the final value):

```tsx
import { useInViewportAnimation } from "@/hooks/useInViewportAnimation";
// inside the component:
const ref = useRef<HTMLSpanElement>(null);
const inView = useInViewportAnimation(ref);

useEffect(() => {
  if (!inView) {
    setDisplayValue(value); // show final value when offscreen
    return;
  }
  // existing RAF loop here
}, [value, inView /* + original deps */]);

return <span ref={ref}>{displayValue}</span>;
```

- [ ] **Step 2: Type-check + smoke test**

```bash
npm run type-check
```

Open a page with AnimatedNumber visible — animation runs. Scroll past — verify via React DevTools Profiler that no further RAF updates fire from the offscreen instance.

### Task 1.34: `min-h-screen` → `min-h-svh` audit and conversion

**Files:**
- Identify with grep, modify each match

- [ ] **Step 1: Find all callsites**

```bash
grep -rn "min-h-screen" src/ --include="*.tsx" --include="*.ts"
```

- [ ] **Step 2: For each match, decide**

Hero / full-viewport sections → convert `min-h-screen` to `min-h-svh`. Loading screens / fallback shells → keep `min-h-screen` (it's fine; svh just trims the toolbar overlap, which is desirable on hero but doesn't matter on a centered spinner).

- [ ] **Step 3: Type-check**

```bash
npm run type-check
```

Expected: clean.

### Task 1.35: Tag floating widgets and tracking pixels for print

**Files:**
- Modify: `src/components/banners/FloatingPromoBanner.tsx`
- Modify: `src/components/banners/FloatingCountdownBanner.tsx`
- Modify: `src/components/sections/promo/FloatingGetEntriesButton.tsx`
- Modify: `src/components/features/RewardsFloatingWidget.tsx`
- Modify: `src/app/layout.tsx` (tracking-pixel `<Script>` tags)
- Modify: `src/components/layout/Header.tsx` (sticky header)

- [ ] **Step 1: Add `data-floating-widget="true"`**

On each floating-widget root element (the `motion.div` or `div` that's `position: fixed`), add `data-floating-widget="true"`.

- [ ] **Step 2: Add `data-tracking-pixel="true"`**

On each `<Script>` in `layout.tsx` that loads a tracking pixel (Contentsquare, GTM, Klaviyo, FB pixel), add `data-tracking-pixel="true"`.

- [ ] **Step 3: Add `data-sticky="true"`**

In `Header.tsx`, on the outer `header` element where it's `fixed top-0`, add `data-sticky="true"`.

- [ ] **Step 4: Type-check + print preview smoke test**

```bash
npm run type-check
```

In `npm run dev`, open `/`, hit Ctrl+P (or Cmd+P) → print preview. Floating widgets, tracking pixels, sticky header are hidden. Body content remains.

### Task 1.36: Update domain docs for shared-ui

**Files:**
- Modify: `docs/shared-ui/` files affected

- [ ] **Step 1: Identify which docs are stale**

```bash
ls docs/shared-ui/
```

The doc-sync hook will tell us exactly which docs need updating. Run a no-op edit to trigger a Stop hook check, OR proactively edit the most-relevant docs:

- Update / append a "Device Tier System" note to whichever doc is most relevant for theming (likely `docs/shared-ui/theming.md` if it exists, else create or append to a general overview doc).
- Update / append an "Embla Wrapper Components" note describing the new `EmblaCarousel`, `EmblaThumbsGallery`, `EmblaCarouselButton`.
- Update / append a "Listener Helpers" note describing `addPassiveScroll`, `addThrottledResize`, `addRAFScrollListener`.

- [ ] **Step 2: If doc-sync hook still blocks, address remaining warnings**

The Stop hook lists which paths are stale. Update or create the listed docs minimally — one paragraph each is fine.

### Task 1.37: Phase 1 verification

- [ ] **Step 1: Run the gate trifecta**

```bash
npm run lint
npm run type-check
npm run build
```

Expected: all green.

- [ ] **Step 2: Manual smoke on the verification pages**

Run `npm run dev`. Open each of `/`, `/promotions/[active-slug]`, `/my-account`, `/my-account/draws`, `/winners`, `/mini-draws/[id]`. For each: confirm no visual regression vs. baseline; confirm countdowns tick; confirm carousels still work.

- [ ] **Step 3: Confirm `data-tier` is set**

In DevTools console on any page: `document.documentElement.dataset.tier` returns one of `mobile|tablet|desktop`. Resize the window across the breakpoints to confirm it updates.

- [ ] **Step 4: Confirm FloatingPromoBanner is path-gated**

Open Network tab. Visit `/login`. Filter by `FloatingPromoBanner`. No chunk should load. Then visit `/`. The chunk loads.

### Task 1.38: Ask user to commit Phase 1

- [ ] **Step 1: Show the diff summary**

```bash
git status
git diff --stat
```

- [ ] **Step 2: Ask the user**

Wait for the user to authorize a commit using one of: `commit`, `push`, `merge`, `make a PR`, `create a PR`, `open a PR`, `ship it`. Do not commit otherwise.

- [ ] **Step 3: On authorization, commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
perf(phase-1): foundation — device tier system, leaf timers, listener hygiene

- Add 3-tier device system (mobile/tablet/desktop) via CSS custom properties
- Add useDeviceProfile, useInViewportAnimation, useLeafTimer hooks
- Add Embla wrapper components (EmblaCarousel, EmblaThumbsGallery, button)
- Memoize Embla options/plugins in BrandScroller, WinnerTestimonySection, OtherToolsetsCarousel
- Extract setInterval countdowns into leaf components (no more parent re-renders)
- Throttle resize listeners; convert scroll listeners to RAF
- AnimatedNumber pauses when offscreen
- iOS Safari: -webkit-backdrop-filter mirrored, min-h-screen -> min-h-svh on heroes
- Print stylesheet hides floating widgets and tracking pixels
- FloatingPromoBanner now path-gated, dynamic-imported

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Tier-aware effect strip

Goal: lower tiers (mobile, tablet) get lighter effects via CSS tokens. Desktop unchanged. Massive perceived-smoothness win on phones and tablets.

### Task 2.1: Strip RecentWinnersCarousel cosmetic loops + token swap

**Files:**
- Modify: `src/components/sections/RecentWinnersCarousel.tsx`

- [ ] **Step 1: Remove the ghost name overlay (L218-227)**

Locate the block that wraps the winner name in a `bg-clip-text + blur-md + animate-pulse` "ghost" duplicate. Delete the duplicate; keep the single solid name.

- [ ] **Step 2: Remove the persistent shimmer (L213)**

Delete the always-on `animate-shimmer-horizontal` overlay. Keep the static shine layer (the `bg-gradient-to-br from-white/10 ...`) — that's a paint, not an animation.

- [ ] **Step 3: Token swap on cards**

Find each `backdrop-blur-md`, `shadow-[0_8px_32px_rgba(0,0,0,0.5)]`, `hover:[box-shadow:...]`, `hover:-translate-y-1`. Replace with token versions:

- `backdrop-blur-md` → `backdrop-blur-[var(--ta-blur)]`
- `shadow-[0_8px_32px_rgba(0,0,0,0.5)]` → `shadow-[var(--ta-shadow-card)]`
- `hover:[box-shadow:var(--winner-card-hover-shadow)]` → `hover:shadow-[var(--ta-shadow-card-hover)]` (and remove the inline `--winner-card-hover-shadow` style)
- `hover:-translate-y-1` → `hover:translate-y-[var(--ta-card-hover-y)]`

- [ ] **Step 4: Type-check + smoke test**

```bash
npm run type-check
```

Open `/my-account/draws`. Cards still look premium on desktop; on mobile they look clean and flat. No persistent shimmer.

### Task 2.2: Token swap on MajorDrawSection

**Files:**
- Modify: `src/components/sections/MajorDrawSection.tsx`

- [ ] **Step 1: Find every `backdrop-blur-*`, `transition-all`, and stacked drop-shadow**

```bash
grep -n "backdrop-blur" src/components/sections/MajorDrawSection.tsx
grep -n "transition-all" src/components/sections/MajorDrawSection.tsx
grep -n "drop-shadow-\[" src/components/sections/MajorDrawSection.tsx
```

- [ ] **Step 2: Apply token swaps**

For each match:
- `backdrop-blur-md` / `backdrop-blur-sm` / `backdrop-blur-lg` → `backdrop-blur-[var(--ta-blur)]`
- `transition-all duration-300` → `transition-[transform,opacity,box-shadow] duration-[var(--ta-transition-dur)]`
- `transition-all` (no duration) → `transition-[transform,opacity,box-shadow]`

- [ ] **Step 3: Gate stacked drop-shadow chains to desktop tier**

For arbitrary `drop-shadow-[0_0_22px_...]` chains, leave the desktop value but add a tier-mobile override via Tailwind's arbitrary-variant (Tailwind v3.4+ supports arbitrary parent selectors):

```tsx
className="drop-shadow-[0_0_22px_rgba(...)] [html[data-tier=mobile]_&]:drop-shadow-none"
```

If the parent-attr arbitrary variant doesn't compile in this Tailwind version, fall back to a JS branch:

```tsx
const profile = useDeviceProfile();
const dropClass = profile.tier === "desktop" || profile.tier === "tablet"
  ? "drop-shadow-[0_0_22px_rgba(...)]"
  : "";
```

- [ ] **Step 4: Type-check + smoke test**

```bash
npm run type-check
```

Open `/`, `/promotions/[slug]`. Desktop unchanged. Mobile: lighter shadows, no stacked drop-shadow halos.

### Task 2.3: Token swap on PrizeShowcase

**Files:**
- Modify: `src/components/sections/promo/PrizeShowcase.tsx`

- [ ] **Step 1: Same token swap pattern as Task 2.2**

Apply to all 4 backdrop-blur and 15 filter callsites in this file. Stacked drop-shadow → tier-gated.

- [ ] **Step 2: Type-check + smoke test**

```bash
npm run type-check
```

### Task 2.4: Gate PowerToolsetCarousel infinite loops by tier

**Files:**
- Modify: `src/components/sections/promo/prize-selection/PowerToolsetCarousel.tsx`

- [ ] **Step 1: Extend existing `useReducedMotion` gate**

The component already uses `useReducedMotion()` at L86. Extend the gate to also check `useDeviceProfile().tier`:

```tsx
import { useDeviceProfile } from "@/hooks/useDeviceProfile";
// inside the component:
const profile = useDeviceProfile();
const allowInfiniteAnim = !prefersReducedMotion && profile.tier === "desktop";
```

Replace each `prefersReducedMotion ? staticVariant : animatedVariant` with `allowInfiniteAnim ? animatedVariant : staticVariant`.

- [ ] **Step 2: Type-check + smoke test**

```bash
npm run type-check
```

On mobile/tablet viewports, the radial pulse + Y bob become static. Desktop unchanged.

### Task 2.5: Token swap on WinnersShowcase

**Files:**
- Modify: `src/components/sections/promo/WinnersShowcase.tsx`

- [ ] **Step 1: Apply token swaps**

3 backdrop-blur, 9 gradients, hover transforms. Apply Task 2.1 patterns.

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

### Task 2.6: Token swap on RewardsFloatingWidget + offscreen pause

**Files:**
- Modify: `src/components/features/RewardsFloatingWidget.tsx`

- [ ] **Step 1: Token swap on 7 backdrop-blur callsites**

`backdrop-blur-md` → `backdrop-blur-[var(--ta-blur)]`.

- [ ] **Step 2: Pause `repeat: Infinity` glow when offscreen**

For each `motion.div animate={{...}} transition={{ repeat: Infinity }}` block: wrap the host with a ref, call `useInViewportAnimation(ref)`, and gate the `animate` prop:

```tsx
const ref = useRef<HTMLDivElement>(null);
const inView = useInViewportAnimation(ref);
// ...
<motion.div
  ref={ref}
  animate={inView ? { /* original animated values */ } : { /* static fallback */ }}
  transition={inView ? { duration: 4, repeat: Infinity, ease: "easeInOut" } : {}}
/>
```

- [ ] **Step 3: Type-check + smoke test**

```bash
npm run type-check
```

Open `/my-account`, scroll past the widget — confirm no further frame updates from offscreen via Profiler.

### Task 2.7: Token swap on GiveawayCountdownTimer + AnimatePresence mode change

**Files:**
- Modify: `src/components/sections/promo/GiveawayCountdownTimer.tsx`

- [ ] **Step 1: Token swap on 4 backdrop-blur**

`backdrop-blur-sm` → `backdrop-blur-[var(--ta-blur)]`.

- [ ] **Step 2: Replace `mode="wait"` with `mode="popLayout"`**

Locate the `<AnimatePresence mode="wait">` block (L296). Change to `mode="popLayout"`. This allows entering and exiting elements to overlap, removing the blocking exit-animation cost.

- [ ] **Step 3: Type-check**

```bash
npm run type-check
```

### Task 2.8: Token swap on FloatingCountdownBanner

**Files:**
- Modify: `src/components/banners/FloatingCountdownBanner.tsx`

- [ ] **Step 1: Token swap on 4 backdrop-blur callsites**

Same pattern.

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

### Task 2.9: Gate PromoWelcomeModal infinite glow + confetti on reduced motion

**Files:**
- Modify: `src/components/modals/PromoWelcomeModal.tsx`

- [ ] **Step 1: Gate `repeat: Infinity` glow**

Use `useReducedMotion()` (framer-motion hook). For each `repeat: Infinity` block, replace with the gated pattern from Task 2.6.

- [ ] **Step 2: Gate confetti**

Locate the `useConfetti` hook call. Wrap with:

```tsx
const prefersReducedMotion = useReducedMotion();
useEffect(() => {
  if (prefersReducedMotion) return;
  // existing confetti trigger
}, [/* deps */, prefersReducedMotion]);
```

- [ ] **Step 3: Type-check + smoke test**

```bash
npm run type-check
```

Toggle OS reduced-motion. Confirm modal still appears and dismisses; no infinite glow; no confetti.

### Task 2.10: Gate PaymentMethodSelector + MembershipModal + UpsellModal infinite animations

**Files:**
- Modify: `src/components/modals/PaymentMethodSelector.tsx`
- Modify: `src/components/modals/MembershipModal.tsx`
- Modify: `src/components/modals/UpsellModal.tsx`

- [ ] **Step 1: For each file, gate every `repeat: Infinity`**

Use `useReducedMotion()`. Each `motion.div` with `repeat: Infinity` becomes gated. (Some animations might be hover-triggered already; leave those alone — only touch always-on ones.)

- [ ] **Step 2: Token swap on backdrop-blur in MembershipModal (5 callsites)**

Same `backdrop-blur-[var(--ta-blur)]` pattern.

- [ ] **Step 3: Type-check + smoke test**

```bash
npm run type-check
```

Toggle reduced-motion. Open each modal. Static visuals; everything still works.

### Task 2.11: Token swap on Hero, PartnerHero, PromoBanner, PartnerBenefitsPromoSection

**Files:**
- Modify: `src/components/sections/Hero.tsx`
- Modify: `src/app/(site)/partner/components/PartnerHero.tsx`
- Modify: `src/components/sections/promo/PromoBanner.tsx`
- Modify: `src/components/sections/promo/PartnerBenefitsPromoSection.tsx`

- [ ] **Step 1: Token swap on backdrop-blur, transition-all, stacked drop-shadow**

Apply Task 2.2 patterns.

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

### Task 2.12: Token swap on Header

**Files:**
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 1: Replace 21 `transition-all` callsites**

Replace each `transition-all duration-X` with `transition-[colors,transform,opacity] duration-[var(--ta-transition-dur)]`.

- [ ] **Step 2: Token swap on 3 `backdrop-blur` callsites**

Replace with `backdrop-blur-[var(--ta-blur)]`.

- [ ] **Step 3: Type-check + smoke test**

```bash
npm run type-check
```

Hover header elements — transitions feel native. Mobile: no header blur.

### Task 2.13: Token swap on MembershipSection

**Files:**
- Modify: `src/components/sections/MembershipSection.tsx`

- [ ] **Step 1: Replace 12 `transition-all`**

Replace each with `transition-[transform,opacity,box-shadow] duration-[var(--ta-transition-dur)]`.

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

### Task 2.14: Append mobile/save-data CSS overrides to globals.css

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Append the override block at the end of the file**

```css
@media (max-width: 767.98px), (prefers-reduced-motion: reduce) {
  .animate-shimmer, .animate-shimmer-horizontal {
    animation: none !important;
  }
}
html[data-tier="mobile"] [class*="border-glow-"]:not(:focus-visible),
html[data-save-data="true"] [class*="border-glow-"]:not(:focus-visible) {
  animation: none !important;
}
```

- [ ] **Step 2: Build to confirm**

```bash
npm run build
```

Expected: build completes.

### Task 2.15: Phase 2 verification

- [ ] **Step 1: Lint + type-check + build**

```bash
npm run lint && npm run type-check && npm run build
```

Expected: all green.

- [ ] **Step 2: Visual smoke matrix**

Run `npm run dev`. For each verification page (`/`, `/promotions/[slug]`, `/my-account`, `/my-account/draws`, `/winners`, `/mini-draws/[id]`): test at viewports 360×800 (mobile), 820×1180 (tablet), 1440×900 (desktop). Confirm desktop unchanged; tablet softer; mobile flat/clean.

- [ ] **Step 3: Reduced-motion + Save-Data toggle**

In DevTools, emulate `prefers-reduced-motion: reduce` and confirm infinite loops stop. Emulate Save-Data: in `Network` panel, throttle to "Slow 3G" + check `Save-Data`. Confirm `data-save-data="true"` on `<html>` and marquee paused.

- [ ] **Step 4: Pixel 4a profile**

Mobile profile (Pixel 4a, 4× CPU, Slow 4G). 5-second scroll on `/`. Frame-rate sustained at 60fps.

### Task 2.16: Update domain docs

- [ ] **Step 1: Update `docs/shared-ui/` and `docs/promo/` docs**

Add a brief "Effect tokens" note describing how components consume `--ta-blur`, `--ta-shadow-card`, etc., and that changing tier behavior is a CSS-only edit in `globals.css`.

### Task 2.17: Ask user to commit Phase 2

- [ ] **Step 1: Show diff**

```bash
git status && git diff --stat
```

- [ ] **Step 2: Ask the user to authorize the commit**

Wait for user to authorize with one of the keywords from CLAUDE.md rule #1. Do not commit otherwise.

- [ ] **Step 3: On authorization, commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
perf(phase-2): tier-aware effect strip — mobile/tablet lighter, desktop unchanged

- Token swap: backdrop-blur, transitions, shadows, hover translates -> CSS vars
- Strip persistent ghost-text + shimmer in RecentWinnersCarousel
- Pause repeat:Infinity loops offscreen (RewardsFloatingWidget, etc.)
- Gate infinite animations behind useReducedMotion in modals
- Replace AnimatePresence mode="wait" with "popLayout" in countdown timer
- Mobile/save-data CSS overrides for border-glow + shimmer

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — Migrate gallery Swipers to Embla

Goal: retire 3 of 4 Swiper-using files. `swiper` package stays (MajorDrawSection still uses it; removed in Phase 4).

### Task 3.1: Migrate FullscreenImageViewer

**Files:**
- Modify: `src/components/ui/FullscreenImageViewer.tsx`

- [ ] **Step 1: Read the current implementation**

Read the full file. Note the prop interface, the gallery items shape, the keyboard listener at L109, and the Swiper main + thumbs at L176, L295.

- [ ] **Step 2: Replace Swiper main+thumbs with `<EmblaThumbsGallery>`**

Replace the Swiper main and Swiper thumbs blocks with a single `<EmblaThumbsGallery>` instance. The `renderMain` prop renders the existing slide content (image + zoom buttons). The `renderThumb` renders the existing thumb tile. The `initialIndex` and `onIndexChange` map to the existing `currentIndex` state.

- [ ] **Step 3: Drop Swiper imports**

Remove `import { Swiper, SwiperSlide } from "swiper/react"` and any `import "swiper/css"` etc. Keep `swiper` in `package.json` (other files still use it).

- [ ] **Step 4: Verify keyboard nav still works**

The existing `keydown` listener at L109 should drive `currentIndex`. `EmblaThumbsGallery` reflects `initialIndex` only on mount; for runtime keyboard updates we need a controlled mode. Since the gallery is uncontrolled by default, the simplest path: pass the `currentIndex` to `<EmblaThumbsGallery initialIndex={currentIndex}>` and use the `onApi` callback to call `mainApi.scrollTo(currentIndex)` on key change. (Note: this will require extending `EmblaThumbsGallery` to expose the main API. If that proves invasive, replace `EmblaThumbsGallery` here with a direct `useEmblaCarousel` call and wire the keyboard handler to `mainApi.scrollTo(...)`.)

- [ ] **Step 5: Type-check + smoke test**

```bash
npm run type-check
```

Open a prize image → fullscreen viewer. Click thumbs, use ←/→ keys, verify navigation works. iOS Safari: horizontal swipe doesn't lock vertical scroll on body.

### Task 3.2: Migrate MiniDrawImageGallery

**Files:**
- Modify: `src/app/(site)/mini-draws/[id]/components/MiniDrawImageGallery.tsx`

- [ ] **Step 1: Replace Swiper main+thumbs with `<EmblaThumbsGallery>`**

Same pattern as Task 3.1. Map the existing `images` array to the `items` prop. Translate `Navigation` + `Pagination` props to using `<EmblaCarouselButton>` for prev/next and a custom dot pagination derived from `mainApi.scrollSnapList()`.

- [ ] **Step 2: Add `sizes=` to all 3 `<Image>` callsites**

Use `sizes="(max-width: 1024px) 100vw, 50vw"` (gallery occupies up to half-width on desktop).

- [ ] **Step 3: Drop Swiper imports**

- [ ] **Step 4: Type-check + smoke test**

```bash
npm run type-check
```

Open `/mini-draws/[id]`. Thumbnail click syncs main; arrows + swipe work; iOS Safari doesn't lock vertical scroll.

### Task 3.3: Migrate PrizeShowcase main+thumbs Swiper to Embla

**Files:**
- Modify: `src/components/sections/promo/PrizeShowcase.tsx`

- [ ] **Step 1: Read the current implementation**

Read L1061 (main Swiper EffectFade) and L1196 (thumbs Swiper Grid). Understand the `enhancedGallery` data shape, `activeGalleryIndex` state, `mainSwiperRef.current?.slideTo`, `slidesPerGroup`, and the responsive `breakpoints` config.

- [ ] **Step 2: Replace main Swiper EffectFade with `<EmblaThumbsGallery fade>`**

The thumbs Swiper used `Grid: rows: 2` to render 2 rows of thumbs. We replace this with a flex layout in `EmblaThumbsGallery` plus responsive Tailwind slide widths. The "rows: 2" effect is achieved by setting the thumbs container to `flex flex-wrap` and slide widths that allow 2 rows at the configured `slidesPerView`.

Pseudocode:

```tsx
<EmblaThumbsGallery
  items={enhancedGallery}
  initialIndex={activeGalleryIndex}
  onIndexChange={setActiveGalleryIndex}
  fade
  rootClassName="relative"
  mainClassName="overflow-hidden"
  mainContainerClassName="flex"
  slideClassName="embla__slide flex-[0_0_100%] min-w-0"
  thumbsClassName="thumbs-swiper h-[120px] sm:h-[140px] lg:h-[156px] mt-2"
  thumbsContainerClassName="flex flex-wrap gap-2"
  thumbSlideClassName="embla__thumb flex-[0_0_25%] sm:flex-[0_0_20%] lg:flex-[0_0_16.66%]"
  renderMain={(image, index, isActive) => (
    /* preserve existing slide JSX from L1086-1101 */
  )}
  renderThumb={(image, index, isActive) => (
    /* preserve existing thumb JSX from L1232-1259 */
  )}
/>
```

- [ ] **Step 3: Wire prev/next buttons**

The existing nav buttons (L1139-1173) call `mainSwiperRef.current?.slidePrev()` / `slideNext()`. Replace with `mainApi?.scrollPrev()` / `scrollNext()` — exposed via the `onApi` callback we'll need to add to `EmblaThumbsGallery` (extend its props).

- [ ] **Step 4: Add `sizes=` to the 6 missing-sizes images**

For each `<Image>` in slide / thumb render: gallery slides → `sizes="(max-width: 1024px) 100vw, 50vw"`; thumbs → `sizes="(max-width: 640px) 25vw, (max-width: 1024px) 20vw, 16vw"`.

- [ ] **Step 5: Drop Swiper imports**

- [ ] **Step 6: Type-check + smoke test**

```bash
npm run type-check
```

Open `/promotions/[slug]`. Click every thumb — main image fades to that slide. Use prev/next buttons. iOS Safari swipe doesn't lock vertical scroll. The fade transition feels equivalent to the prior Swiper EffectFade (tune `mainOptions.duration` if needed).

### Task 3.4: Phase 3 verification

- [ ] **Step 1: Lint + type-check + build**

```bash
npm run lint && npm run type-check && npm run build
```

Expected: all green. Bundle still includes Swiper (held by MajorDrawSection).

- [ ] **Step 2: Manual smoke**

Click thumbs on `/promotions/[slug]` and `/mini-draws/[id]`. Open `FullscreenImageViewer`, navigate with arrows + keyboard. iOS Safari swipe.

### Task 3.5: Update domain docs

- [ ] **Step 1: Update `docs/promo/`, `docs/draws/`, `docs/shared-ui/`**

Note that `PrizeShowcase`, `MiniDrawImageGallery`, `FullscreenImageViewer` use `EmblaThumbsGallery`. Reference the new wrapper docs.

### Task 3.6: Ask user to commit Phase 3

- [ ] **Step 1: Show diff**

```bash
git status && git diff --stat
```

- [ ] **Step 2: Ask the user to authorize**

- [ ] **Step 3: On authorization, commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
perf(phase-3): migrate gallery Swipers to Embla — retire 3 of 4 Swiper files

- FullscreenImageViewer: Swiper main+thumbs+Keyboard -> Embla + custom keydown
- MiniDrawImageGallery: Swiper -> EmblaThumbsGallery
- PrizeShowcase: Swiper EffectFade+Grid -> Embla + embla-carousel-fade
- iOS Safari: touch-action pan-y pinch-zoom on every Embla viewport
- Add missing sizes= to 9 <Image> callsites in touched files

Swiper still in deps (MajorDrawSection migration in Phase 4).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Migrate MajorDrawSection, remove Swiper

Goal: retire Swiper entirely. Drop `swiper` and `embla-carousel-autoplay` from `package.json`. Largest single migration; highest-traffic file.

### Task 4.1: Read MajorDrawSection layout fully

**Files:**
- Inspect: `src/components/sections/MajorDrawSection.tsx`

- [ ] **Step 1: Read the full file**

Read `src/components/sections/MajorDrawSection.tsx` end-to-end. Note: 4 Swiper instances (mobile main + thumbs at L909, L949; desktop main + thumbs at L1244 + sibling). Understand the `mobileSwiper`, `desktopSwiper`, `mobileThumbsSwiper`, `desktopThumbsSwiper` state. Understand the active-index synchronization between desktop and mobile views.

- [ ] **Step 2: Identify shared data**

The same `images` (or equivalent) array drives both layouts. Identify the prop that holds it.

### Task 4.2: Replace mobile main+thumbs with Embla

**Files:**
- Modify: `src/components/sections/MajorDrawSection.tsx` (mobile JSX block)

- [ ] **Step 1: Replace Swiper at L909 + L949 with `<EmblaThumbsGallery>`**

Mobile layout `[Navigation, Pagination, Thumbs]` + `[FreeMode, Thumbs]` → single `<EmblaThumbsGallery>` with `<EmblaCarouselButton>` for nav + custom dot pagination via `mainApi.scrollSnapList()`. `dragFree: true` on thumbs (replaces `FreeMode`). Replicate the existing pagination dot styling.

- [ ] **Step 2: Add `sizes=` to all images in this block**

Use `sizes="(max-width: 1024px) 100vw, 50vw"` for main; `sizes="100px"` for thumbs.

- [ ] **Step 3: Type-check**

```bash
npm run type-check
```

### Task 4.3: Replace desktop main+thumbs with Embla

**Files:**
- Modify: `src/components/sections/MajorDrawSection.tsx` (desktop JSX block)

- [ ] **Step 1: Replace Swiper at L1244 + sibling with second `<EmblaThumbsGallery>`**

Same pattern as Task 4.2.

- [ ] **Step 2: Sync mobile and desktop active indices**

If the existing code synchronizes the two Swiper instances via shared state (active index lifted to component level), preserve that pattern: pass the same `initialIndex` and `onIndexChange` to both `EmblaThumbsGallery` instances. (Only one is mounted at a time per CSS responsive layout, so they're effectively two views over the same shared state.)

- [ ] **Step 3: Drop all Swiper imports from this file**

Remove every `import { Swiper, SwiperSlide } from "swiper/react"`, `import { ... } from "swiper/modules"`, `import "swiper/css"` etc.

- [ ] **Step 4: Type-check**

```bash
npm run type-check
```

### Task 4.4: Remove Swiper and unused autoplay from package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Verify no remaining Swiper imports**

```bash
grep -rn "from \"swiper" src/
grep -rn "import \"swiper" src/
```

Expected: zero hits.

- [ ] **Step 2: Verify `embla-carousel-autoplay` is unused**

```bash
grep -rn "embla-carousel-autoplay" src/
```

Expected: zero hits.

- [ ] **Step 3: Uninstall**

```bash
npm uninstall swiper embla-carousel-autoplay
```

- [ ] **Step 4: Verify `package.json` no longer lists them**

```bash
grep -E "(swiper|embla-carousel-autoplay)" package.json
```

Expected: zero hits.

### Task 4.5: Add `sizes=` to all 13 missing-sizes Images in MajorDrawSection

**Files:**
- Modify: `src/components/sections/MajorDrawSection.tsx`

- [ ] **Step 1: Find missing sizes**

```bash
grep -n "Image" src/components/sections/MajorDrawSection.tsx | head -50
```

- [ ] **Step 2: Add `sizes=` to each `<Image>` based on context**

Use the standard patterns from the spec:
- Hero / full-width: `sizes="(max-width: 768px) 100vw, 1280px"`
- 1/2/3 grid: `sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"`
- Logo / icon: `sizes="(max-width: 640px) 80px, 120px"`

- [ ] **Step 3: Type-check**

```bash
npm run type-check
```

### Task 4.6: Phase 4 verification

- [ ] **Step 1: Lint + type-check + build**

```bash
npm run lint && npm run type-check && npm run build
```

Expected: all green. Bundle no longer contains Swiper.

- [ ] **Step 2: Confirm bundle size delta**

Compare the bundle output (most recent `npm run build` log) to the Phase 0 baseline. Expected: net `−45KB gz`.

- [ ] **Step 3: Manual smoke**

Open `/`, `/promotions/[slug]`, `/my-account/draws`. MajorDrawSection visual unchanged within tolerance (indicator dot styling may shift). Click thumbs, prev/next, swipe on mobile.

- [ ] **Step 4: Performance profile**

Pixel 4a profile, scroll the home page top→bottom. The MajorDrawSection visible window has the same frame-rate as the rest of the page.

### Task 4.7: Update domain docs

- [ ] **Step 1: Update `docs/draws/` and `docs/promo/`**

Note that `MajorDrawSection` uses `EmblaThumbsGallery`. Remove any references to Swiper.

### Task 4.8: Ask user to commit Phase 4

- [ ] **Step 1: Show diff**

- [ ] **Step 2: Ask user to authorize**

- [ ] **Step 3: On authorization, commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
perf(phase-4): migrate MajorDrawSection to Embla, remove Swiper

- MajorDrawSection: 4 Swiper instances (mobile + desktop main+thumbs) -> 2 EmblaThumbsGallery
- Drop swiper from package.json
- Drop embla-carousel-autoplay (audited, unused)
- Add sizes= to 13 <Image> callsites in MajorDrawSection
- Net bundle delta: -45KB gz

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5 — Last-mile: rebuild RecentWinners + lazy modals + image cleanup + content-visibility

Goal: capture remaining cumulative wins. Rebuild hand-rolled carousel as Embla. Lazy-load Stripe-bearing modals (saves ~140KB gz on dashboard first paint). Audit `<Image sizes>`. Apply `content-visibility: auto` and `LazyMount` to below-fold sections.

### Task 5.1: Create `src/hooks/queries/useRecentWinners.ts`

**Files:**
- Create: `src/hooks/queries/useRecentWinners.ts`

- [ ] **Step 1: Read existing query hook patterns**

```bash
ls src/hooks/queries/
```

Open one existing query hook (e.g. `useWinnersQueries.ts`) to copy the project's TanStack Query patterns (cache key shape, queryFn, error handling).

- [ ] **Step 2: Write the new hook**

```ts
"use client";
import { useQuery } from "@tanstack/react-query";

interface RecentWinner { /* match the existing API response shape — see /api/winners/all */ }

interface ApiResponse { success: boolean; winners?: RecentWinner[]; }

async function fetchRecentWinners(limit: number): Promise<RecentWinner[]> {
  const res = await fetch(`/api/winners/all?limit=${limit}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as ApiResponse;
  if (!data.success || !data.winners) return [];
  return data.winners;
}

export function useRecentWinners(limit = 12) {
  return useQuery({
    queryKey: ["recent-winners", { limit }],
    queryFn: () => fetchRecentWinners(limit),
    staleTime: 5 * 60 * 1000,
  });
}
```

(Adjust the `RecentWinner` type to match the actual API response — read the existing fetch in [RecentWinnersCarousel.tsx](src/components/sections/RecentWinnersCarousel.tsx) and `/api/winners/all/route.ts` to match.)

- [ ] **Step 3: Type-check**

```bash
npm run type-check
```

### Task 5.2: Create `src/components/cards/WinnerCard.tsx`

**Files:**
- Create: `src/components/cards/WinnerCard.tsx`

- [ ] **Step 1: Extract the per-card JSX from RecentWinnersCarousel**

Read the current per-card JSX in `src/components/sections/RecentWinnersCarousel.tsx` (the block inside `visibleWinners.map(...)`). Extract into a memo-able component.

```tsx
"use client";
import Image from "next/image";
import { memo } from "react";
import { Trophy, Calendar, Award, MapPin, Gift } from "lucide-react";
import { formatWinnerName } from "@/utils/winner-name-formatter";
import { cn } from "@/utils/cn";

export interface WinnerCardData {
  id: string;
  drawId: string;
  drawName: string;
  drawType: "major" | "mini";
  prize: { name: string; description: string; value: number; images: string[] };
  winnerFirstName: string;
  winnerLastName: string;
  winnerState?: string;
  imageUrl?: string;
  selectedDate: string;
  wonOnDate?: string;
  selectedPrize?: string;
}

interface WinnerCardProps {
  winner: WinnerCardData;
  className?: string;
}

export const WinnerCard = memo(function WinnerCard({ winner, className }: WinnerCardProps) {
  const displayImage =
    winner.imageUrl || winner.prize.images[0] || "/images/promotion/PrizeHeader/PrizeHeader.webp";
  const formattedName = formatWinnerName(winner.winnerFirstName, winner.winnerLastName);
  const wonOnDate = new Date(winner.wonOnDate ?? winner.selectedDate);

  /* paste the existing per-card JSX, swapping fixed effects for tokens (Phase 2 patterns):
     - backdrop-blur-md  -> backdrop-blur-[var(--ta-blur)]
     - shadow-[...]      -> shadow-[var(--ta-shadow-card)]
     - hover:shadow-[...]-> hover:shadow-[var(--ta-shadow-card-hover)]
     - hover:-translate-y-1 -> hover:translate-y-[var(--ta-card-hover-y)]
     Add sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" to <Image>.
   */
});
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

### Task 5.3: Rewrite RecentWinnersCarousel as Embla

**Files:**
- Modify: `src/components/sections/RecentWinnersCarousel.tsx`

- [ ] **Step 1: Replace the entire component body**

Drop the raw `fetch`, the `currentIndex`/`itemsPerView` state, the resize listener, the `slice` rendering, the prev/next buttons that paginate `currentIndex`. Replace with:

```tsx
"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import ClassNames from "embla-carousel-class-names";
import { Trophy } from "lucide-react";
import { useRecentWinners } from "@/hooks/queries/useRecentWinners";
import { WinnerCard } from "@/components/cards/WinnerCard";
import { EmblaCarouselButton } from "@/components/ui/embla/EmblaCarouselButton";
import { cn } from "@/utils/cn";

interface WinnersSectionProps {
  className?: string;
  title?: string;
  subtitle?: string;
}

export default function RecentWinnersCarousel({
  className = "",
  title = "Recent Winners",
  subtitle = "Congratulations to our recent winners! Your dreams can come true too.",
}: WinnersSectionProps) {
  const { data: winners = [], isLoading } = useRecentWinners(12);

  const options = useMemo(
    () => ({ loop: false, align: "start" as const, slidesToScroll: 1, containScroll: "trimSnaps" as const }),
    []
  );
  const plugins = useMemo(() => [ClassNames()], []);
  const [emblaRef, emblaApi] = useEmblaCarousel(options, plugins);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
    setCanPrev(emblaApi.canScrollPrev());
    setCanNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    setScrollSnaps(emblaApi.scrollSnapList());
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", () => {
      setScrollSnaps(emblaApi.scrollSnapList());
      onSelect();
    });
    return () => { emblaApi.off("select", onSelect); };
  }, [emblaApi, onSelect]);

  return (
    <section className={cn("relative py-16 lg:py-20 bg-gradient-to-br from-gray-50 via-white to-gray-50 w-full overflow-hidden", className)}>
      <div className="relative w-full px-4 sm:px-6 lg:px-8 lg:max-w-7xl lg:mx-auto">
        <div className="text-center mb-12 sm:mb-16">
          {/* preserve existing header markup */}
        </div>

        {isLoading && (
          /* preserve existing loading skeleton */
        )}

        {!isLoading && winners.length > 0 && (
          <div className="relative">
            <EmblaCarouselButton
              direction="prev"
              onClick={() => emblaApi?.scrollPrev()}
              disabled={!canPrev}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-20 hidden lg:flex"
            />
            <EmblaCarouselButton
              direction="next"
              onClick={() => emblaApi?.scrollNext()}
              disabled={!canNext}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-20 hidden lg:flex"
            />

            <div className="overflow-hidden" ref={emblaRef} data-carousel="true" style={{ touchAction: "pan-y pinch-zoom" }}>
              <div className="flex gap-6 lg:gap-8">
                {winners.map((w) => (
                  <article
                    key={w.id}
                    className="flex-[0_0_100%] sm:flex-[0_0_calc(50%-12px)] lg:flex-[0_0_calc(33.333%-16px)] min-w-0"
                  >
                    <WinnerCard winner={w} />
                  </article>
                ))}
              </div>
            </div>

            {scrollSnaps.length > 1 && (
              <div className="flex justify-center gap-2 mt-8">
                {scrollSnaps.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => emblaApi?.scrollTo(i)}
                    className={cn(
                      "h-2 rounded-full transition-all duration-200",
                      selectedIndex === i ? "w-8 bg-red-600" : "w-2 bg-gray-300 hover:bg-gray-400"
                    )}
                    aria-label={`Go to slide ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {!isLoading && winners.length === 0 && (
          /* preserve existing empty state */
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Type-check + smoke test**

```bash
npm run type-check
```

Open `/my-account/draws`. Cards swipe natively on mobile. Prev/next buttons work on desktop. Pagination dots reflect current slide.

### Task 5.4: Update WinnersPageClient to share the cache (optional optimization)

**Files:**
- Inspect: `src/app/(site)/winners/components/WinnersPageClient.tsx`

- [ ] **Step 1: Check if WinnersPageClient already fetches recent winners**

```bash
grep -n "winners/all" src/app/(site)/winners/components/WinnersPageClient.tsx
```

- [ ] **Step 2: If yes, switch its fetch to `useRecentWinners`**

If WinnersPageClient calls the same `/api/winners/all?limit=12` endpoint, replace its raw fetch / its existing `useWinnersQueries` call with `useRecentWinners(12)` so both pages share the cache. Otherwise, leave it.

- [ ] **Step 3: Type-check**

```bash
npm run type-check
```

### Task 5.5: Lazy-load `UnifiedModalManager` modals

**Files:**
- Modify: `src/components/modals/UnifiedModalManager.tsx`

- [ ] **Step 1: Replace static imports with `next/dynamic`**

Lines 10–16 currently statically import 6 modals. Replace with:

```tsx
import dynamic from "next/dynamic";

const UserSetupModal           = dynamic(() => import("./UserSetupModal"), { ssr: false });
const UpsellModal              = dynamic(() => import("./UpsellModal"), { ssr: false });
const SpecialPackagesModal     = dynamic(() => import("./SpecialPackagesModal"), { ssr: false });
const PixelConsentModal        = dynamic(() => import("./PixelConsentModal"), { ssr: false });
const GateClosedModal          = dynamic(() => import("./GateClosedModal"), { ssr: false });
const SubscriptionExplainerModal = dynamic(() => import("./SubscriptionExplainerModal"), { ssr: false });
const RenewalFailedModal       = dynamic(() => import("./RenewalFailedModal"), { ssr: false });
```

(Adjust the import paths to match the file's existing relative paths.)

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

### Task 5.6: Lazy-load MembershipModal at every callsite

**Files:**
- Modify: `src/app/(site)/my-account/page.tsx`
- Modify: `src/app/(site)/my-account/membership/components/MembershipPageClient.tsx`
- Modify: `src/app/(site)/my-account/settings/page.tsx`
- Modify: `src/app/(site)/my-account/draws/page.tsx`
- Modify: `src/app/(site)/my-account/benefits/page.tsx`

- [ ] **Step 1: Find all callsites**

```bash
grep -rn "from \"@/components/modals/MembershipModal\"" src/
grep -rn "import MembershipModal" src/
```

- [ ] **Step 2: For each callsite, replace static import with `next/dynamic`**

```tsx
import dynamic from "next/dynamic";
const MembershipModal = dynamic(() => import("@/components/modals/MembershipModal"), { ssr: false });
```

- [ ] **Step 3: Type-check + smoke test**

```bash
npm run type-check
```

Open `/my-account`. Click the Membership CTA → modal opens within ~200ms (Stripe.js loads on click instead of on page mount).

### Task 5.7: Lazy-load remaining Stripe-bearing modals

**Files:**
- Modify: every callsite that imports `StripePaymentModal`, `SubscriptionManagementModal`, `RenewalFailedModal`, `SpecialPackagesModal`, `UpsellModal`, `SavedPaymentMethodsModal`, `PaymentMethodSelector`, `PaymentMethodsTab`

- [ ] **Step 1: Find all callsites**

```bash
for name in StripePaymentModal SubscriptionManagementModal RenewalFailedModal SpecialPackagesModal UpsellModal SavedPaymentMethodsModal PaymentMethodSelector PaymentMethodsTab; do
  echo "=== $name ==="
  grep -rn "import $name" src/
  grep -rn "from \".*$name\"" src/
done
```

- [ ] **Step 2: Convert each callsite to `next/dynamic`**

```tsx
import dynamic from "next/dynamic";
const StripePaymentModal = dynamic(() => import("@/components/modals/StripePaymentModal"), { ssr: false });
```

(Apply the same pattern to each modal at each callsite.)

- [ ] **Step 3: Type-check + smoke test**

```bash
npm run type-check
```

End-to-end: load `/my-account/settings`, click each payment-related CTA, confirm modals open and Stripe Elements render correctly.

### Task 5.8: `<Image sizes=>` cleanup pass

**Files:** all files identified by audit not already touched in Phases 3–4

- [ ] **Step 1: Find missing `sizes=`**

```bash
grep -rn "<Image" src/ --include="*.tsx" | grep -v "sizes="
```

- [ ] **Step 2: Add `sizes=` to each callsite based on context**

Use the standard patterns:
- Hero / full-width: `sizes="(max-width: 768px) 100vw, 1280px"`
- 1/2/3 grid: `sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"`
- 2/4 grid: `sizes="(max-width: 1024px) 50vw, 25vw"`
- Logo / icon: `sizes="(max-width: 640px) 80px, 120px"`

Top files to focus on (per audit): `Footer.tsx`, `PowerToolsetCarousel.tsx`, `PartnerBenefitsPromoSection.tsx`, `MembershipSection.tsx`, `MembershipModal.tsx`, `Header.tsx`, `ProductCategories.tsx`, `ExistingPartners.tsx`.

- [ ] **Step 3: Type-check**

```bash
npm run type-check
```

### Task 5.9: Create `src/components/ui/LazyMount.tsx`

**Files:**
- Create: `src/components/ui/LazyMount.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

interface LazyMountProps {
  children: ReactNode;
  fallback?: ReactNode;
  rootMargin?: string;
}

export function LazyMount({ children, fallback = null, rootMargin = "300px" }: LazyMountProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!ref.current || shown) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          obs.disconnect();
        }
      },
      { rootMargin }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [shown, rootMargin]);
  return <div ref={ref}>{shown ? children : fallback}</div>;
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

### Task 5.10: Apply `LazyMount` and `content-visibility: auto` to below-fold sections

**Files:**
- Modify: `src/app/(site)/page.tsx` (home)

- [ ] **Step 1: Wrap below-fold home sections with `LazyMount`**

In `src/app/(site)/page.tsx`, the existing `<Suspense>` wrappers around `<WinnerTestimoniesClient>`, `<HomeMiniDraws>`, `<HomeProducts>` ×2 are kept. Wrap each suspense with `<LazyMount fallback={<existing skeleton>}>`. The existing skeleton stays as the fallback.

- [ ] **Step 2: Apply `content-visibility: auto` to long below-fold sections**

For each of the four below-fold sections, add `style={{ contentVisibility: "auto", containIntrinsicSize: "1px 800px" }}` on the outer `<section>` element. This is a one-line CSS hint per section. Newsletter section + Footer can also get the treatment.

- [ ] **Step 3: Verify scroll-into-view still works**

If the page has anchor links (e.g. `#mini-draws`), test that clicking them still scrolls correctly. If a section breaks anchor scroll, remove `content-visibility` from that one section (Chromium issue 395078320).

- [ ] **Step 4: Type-check**

```bash
npm run type-check
```

### Task 5.11: Pause infinite framer-motion offscreen — final pass

**Files:**
- Modify: `src/components/sections/promo/GiveawayCountdownTimer.tsx` (if not already done)
- Modify: `src/components/modals/PromoWelcomeModal.tsx` (if not already done)
- Modify: `src/components/sections/promo/prize-selection/PowerToolsetCarousel.tsx` (if not already done)
- Modify: `src/components/UrgencyClockIcon.tsx`

- [ ] **Step 1: Apply `useInViewportAnimation` pattern from Task 2.6 to remaining `repeat: Infinity` hosts**

Wrap each host element with a ref, gate the `animate` and `transition` props by `inView`.

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

### Task 5.12: Listener-hygiene final pass: Select, Dropdown, ModalContainer

**Files:**
- Modify: `src/components/modals/ui/Select.tsx`
- Modify: `src/components/modals/ui/Dropdown.tsx`
- Modify: `src/components/modals/ui/ModalContainer.tsx`

- [ ] **Step 1: Convert capture-phase scroll listeners to throttled passive bubble-phase**

In `Select.tsx:203` and `Dropdown.tsx:165`, the current pattern is `document.addEventListener("scroll", h, true)` (capture phase). The intent is to detect any scroll under the open dropdown and close it. Replace with:

```tsx
import { addRAFScrollListener } from "@/utils/dom/listenerHelpers";
// ...
useEffect(() => {
  if (!isOpen) return;
  return addRAFScrollListener(window, () => {
    onClose(); // or whatever the original handler did
  });
}, [isOpen, onClose]);
```

(Note: the capture-phase listener catches scrolls on inner scrollable containers too; the bubble-phase + RAF approach catches window scroll only. If the dropdown sits inside a scrollable container, also listen on that container — the implementer should verify.)

- [ ] **Step 2: Document non-passive wheel listeners**

`Select.tsx:212`, `Dropdown.tsx:174`, and `ModalContainer.tsx:238-240` use `{ passive: false }` to call `preventDefault`. Add an inline comment above each:

```tsx
// NOTE: non-passive intentionally — we call preventDefault to prevent body scroll behind the modal/popover.
```

- [ ] **Step 3: ModalContainer adds visualViewport keyboard avoidance**

In `ModalContainer.tsx`, after the existing wheel/touchmove handlers, add:

```tsx
useEffect(() => {
  if (!isOpen) return;
  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => {
    // Set a CSS var the modal content can read to size itself under the keyboard.
    document.documentElement.style.setProperty("--ta-vv-height", `${vv.height}px`);
  };
  update();
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  return () => {
    vv.removeEventListener("resize", update);
    vv.removeEventListener("scroll", update);
    document.documentElement.style.removeProperty("--ta-vv-height");
  };
}, [isOpen]);
```

The modal content can opt-in via `style={{ maxHeight: "var(--ta-vv-height, 100vh)" }}`.

- [ ] **Step 4: Type-check + smoke test**

```bash
npm run type-check
```

Open a modal on iOS Safari (or simulator), focus a text input — keyboard appears, modal content fits within visible viewport.

### Task 5.13: Phase 5 verification

- [ ] **Step 1: Lint + type-check + build**

```bash
npm run lint && npm run type-check && npm run build
```

Expected: all green.

- [ ] **Step 2: Confirm bundle size delta on `/my-account/*`**

Compare the route-chunk size for `/my-account` to baseline. Expected: ~−140KB gz (Stripe.js out of dashboard bundle).

- [ ] **Step 3: TTI gate**

Lighthouse mobile on `/my-account` → TTI improvement ≥ 1.5s vs Phase 0 baseline.

- [ ] **Step 4: Modal-open latency**

Cold page load `/my-account`, click Membership CTA. Modal visible within ~200ms.

- [ ] **Step 5: iOS Safari keyboard avoidance**

iOS Safari (or simulator). Open a modal, focus a text input. Modal content fits above the keyboard.

- [ ] **Step 6: Image bytes on mobile**

DevTools Network panel, mobile profile, visit `/mini-draws/[id]`. Image bytes are at least 50% smaller than baseline for the gallery thumbs.

### Task 5.14: Update domain docs

- [ ] **Step 1: Update relevant `docs/<domain>/` files**

Cover: `docs/dashboard-account/`, `docs/payment/`, `docs/billing-stripe/`, `docs/shared-ui/`, `docs/draws/`. Note lazy-loading pattern for modals, the new `useRecentWinners` hook, the new `WinnerCard`, the new `LazyMount`.

### Task 5.15: Ask user to commit Phase 5

- [ ] **Step 1: Show diff**

- [ ] **Step 2: Ask user to authorize**

- [ ] **Step 3: On authorization, commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
perf(phase-5): lazy modals, Embla RecentWinners, image sizes audit, content-visibility

- Rebuild RecentWinnersCarousel as Embla (real swipe, native momentum)
- Extract WinnerCard component, share with WinnersPageClient via cache key
- Lazy-load MembershipModal + Stripe-bearing modals via next/dynamic({ ssr: false })
- Lazy-load all 6 UnifiedModalManager modals
- Add sizes= to remaining ~50 <Image> callsites
- LazyMount + content-visibility: auto on below-fold home sections
- Pause infinite framer-motion offscreen on remaining hosts
- Listener-hygiene final pass (Select, Dropdown scroll listeners)
- ModalContainer visualViewport keyboard avoidance for iOS

Net: ~140KB gz off dashboard first-paint, mobile image bytes ~50% smaller.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Post-flight

- [ ] **Step 1: Final full-stack verification**

```bash
npm run lint && npm run type-check && npm run build
```

Expected: all green.

- [ ] **Step 2: Confirm zero Swiper hits**

```bash
grep -rn "from \"swiper" src/
grep -rn "import \"swiper" src/
```

Expected: zero hits.

- [ ] **Step 3: Confirm `embla-carousel-autoplay` not in deps**

```bash
grep "embla-carousel-autoplay" package.json
```

Expected: zero hits.

- [ ] **Step 4: Final mobile profile**

Pixel 4a profile, 4× CPU, Slow 4G. Scroll each verification page top→bottom. Sustained 60fps. Lighthouse mobile run on `/`, `/promotions/[slug]`, `/my-account` — TBT ≥ 30% reduction vs Phase 0 baseline.

- [ ] **Step 5: Print preview each verification page**

Floating widgets, tracking pixels, sticky header hidden. Body content remains.

- [ ] **Step 6: Reduced-motion verification**

OS reduced-motion ON. Reload each verification page. No `repeat: Infinity` loops; entrance animations still play once.

- [ ] **Step 7: Save-Data verification**

DevTools Network → "Slow 3G" + Save-Data on. Confirm `data-save-data="true"` on `<html>` and BrandScroller marquee paused.

---

## Self-review notes (kept for the implementer)

- Every phase = one commit. **Never commit without user authorization** (CLAUDE.md hard rule #1).
- Every domain doc must be updated in the same commit as the code that touched its source files (CLAUDE.md hard rule #2).
- The Domain Manifest is the source of truth (CLAUDE.md hard rule #3); only the v1.1 spec change in Task 1.1 touches it.
- Don't overengineer (CLAUDE.md hard rule #4). If you're tempted to add infrastructure not specified above, ask the user instead.
- The codebase has no test runner. Verification per task is type-check + manual smoke. Reserve `npm run build` for milestone tasks (it's slow).
- If a task references a line number that's drifted (because earlier tasks edited the same file), use the surrounding context to locate the correct edit point.
