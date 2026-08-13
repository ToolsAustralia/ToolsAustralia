"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { m } from "framer-motion";
import { usePathname } from "next/navigation";

// Click-gated heavy chunk (LazyMembershipModal latch pattern —
// src/components/modals/MembershipModal/LazyMembershipModal.tsx): rendering a dynamic()
// component fetches and evaluates its chunk even with isOpen=false, so the specs modal is
// not rendered until its FIRST open (see the `specsEverOpened` latch below); after that it
// stays mounted so close animations and internal state behave like the always-mounted version.
const PrizeSpecificationsModal = dynamic(() => import("@/components/modals/PrizeSpecificationsModal"), { ssr: false });

import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";
import { usePrizeCatalog } from "@/hooks/usePrizeCatalog";
import { usePrizeBuildTracking } from "@/hooks/usePrizeBuildTracking";
import { useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
import { formatMajorDrawChipUtc } from "@/utils/common/timezone";
import { usePromoThemeStore } from "@/stores/usePromoThemeStore";
import { useThemeStore } from "@/stores/useThemeStore";
// Type-only (erased at compile): the deep-catalog VALUES only ever arrive through the
// click-gated `import("@/config/prizes")` in the specs-modal effect below.
import type { PrizeCatalogEntry } from "@/config/prizes";
import { SECTION_CONTAINER_CLASSES } from "@/components/ui";
import { getLandingHeroImagePaths } from "@/config/promo-landing-slugs";
import { getImageForMode } from "@/utils/promo/landing-image-resolver";
import {
  PrizeBuilderCard,
  CASH_OPTION,
  TOOLBOXES,
  TOOLSETS,
  TOOLBOX_QUERY_PARAM,
  TOOLSET_QUERY_PARAM,
  buildPrizeSelectionHref,
  fromPrizeSlug,
  getComboPresentation,
  getContentsChips,
  getToolbox,
  getToolset,
  parseToolboxQueryParam,
  parseToolsetQueryParam,
  publishPrizeSelection,
  resolveAccent,
  toPrizeSlug,
  type ToolboxBrand,
  type ToolsetType,
} from "./prize-selection";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { hasMultiplierBanner } from "@/utils/promo/multiplier-banner";
import MultiplierBannerImage from "@/components/ui/MultiplierBannerImage";

/** Remembers the last toolbox a visitor picked, so the card opens on their choice next visit. */
const TOOLBOX_PREFERENCE_KEY = "prizeToolboxType";

/**
 * This component never calls `useSearchParams()` — every query read below goes straight to
 * `window.location.search`. This section renders on PRERENDERED marketing-class pages (`/`,
 * `/promotions/*` — see docs/security-csp/rules.md R8), and `useSearchParams()` there de-opts
 * the whole client subtree up to the nearest Suspense boundary to CLIENT-ONLY rendering. The
 * entire 1,115px "Build your prize" card then ships as NOTHING in the static HTML — no
 * fallback, no reserved space — and appears only after hydration, shoving every section below
 * it down the page (with MembershipSection, a measured CLS 0.4352 → 0.0566 on /promotions/*,
 * 2026-07-27). It also kept the card out of the crawled HTML entirely.
 *
 * `?toolbox=`/`?toolset=` only ever matter on the client (they are written by this component's
 * own handlers via `window.history.replaceState`), so reading the live URL loses nothing.
 */

interface PrizeShowcaseProps {
  /** Prize slug this instance opens on (e.g. the `/promotions/{slug}` page's prize). */
  slug?: string;
  /** Toolset landing page mode — the power-toolset lane is locked to one brand. */
  toolsetMode?: boolean;
  /** Toolset slug (ryobi, milwaukee, dewalt, makita, hikoki) when `toolsetMode`. */
  toolsetSlug?: string;
  /**
   * Top hero strip above the card: default branded “1st prize” art; `multiplier` uses
   * `/images/banners/multiplier/*` from the active promo (membership, then one-time);
   * `none` hides the strip entirely.
   */
  firstBannerVariant?: "first-prize-text" | "multiplier" | "none";
  /** Whether the combo hero gets `priority` (eager + preload). Default `true`. Set
   *  `false` when this instance renders below another `priority` hero on the same page (e.g. the
   *  homepage, where `Hero` + `MembershipSection` already sit above it) — two competing
   *  `priority` images fight for the browser's single preload slot. */
  priorityHero?: boolean;
}

/** Temporary: hide branded “First prize” text image strip. Set to `false` to show again. */
const TEMP_HIDE_FIRST_PRIZE_TEXT_BANNER = true;

/** Branded “first prize” strip art, keyed by the toolset half of the slug. */
const getFirstPrizeImagePath = (slug: string): string => {
  const toolset = slug.split("-")[0];
  switch (toolset) {
    case "dewalt":
      return "/images/promotion/FirstPrizeText/1stprice-dewalt.webp";
    case "makita":
      return "/images/promotion/FirstPrizeText/1stprice-makita.webp";
    case "cash":
      return "/images/promotion/FirstPrizeText/1stprice-cash.webp";
    // Ryobi/HiKOKI have no dedicated art yet — fall through to the Milwaukee strip.
    default:
      return "/images/promotion/FirstPrizeText/1stprice-milwaukee.webp";
  }
};

/**
 * Resolve the state the card should open on for a given prize slug.
 *
 * Order of authority: the page's own prize slug (`/promotions/{slug}`) → the catalog
 * default. The visitor's remembered toolbox is applied afterwards, and only on evergreen
 * surfaces (see the localStorage effect) — a page that names its prize must win.
 *
 * A toolset landing page (`/promotions/milwaukee`) opens on ITS brand but does NOT lock
 * the lane: the reel offers all five, which is what replaced the old “explore other
 * toolsets” strip.
 */
function resolveStateForSlug(slug: string | undefined): {
  selection: { toolbox: ToolboxBrand; toolset: ToolsetType };
  isCash: boolean;
} {
  const fromSlug = fromPrizeSlug(slug);
  if (fromSlug) {
    return { selection: fromSlug, isCash: false };
  }
  return {
    selection: { toolbox: TOOLBOXES[0].id, toolset: TOOLSETS[0].id },
    // A cash-prize page opens on the cash option with the default gear behind it, so
    // switching back to "Toolbox bundle" lands on a real combination.
    isCash: slug === CASH_OPTION.slug,
  };
}

function PrizeShowcase({
  slug: slugProp,
  toolsetMode = false,
  toolsetSlug,
  firstBannerVariant = "first-prize-text",
  priorityHero = true,
}: PrizeShowcaseProps = {}) {
  const effectiveFirstBannerVariant =
    TEMP_HIDE_FIRST_PRIZE_TEXT_BANNER && firstBannerVariant === "first-prize-text"
      ? "none"
      : firstBannerVariant;

  const prizeRef = useScrollAnimation();
  const themeMode = useThemeStore((s) => s.theme);
  const setStoreSlug = usePromoThemeStore((s) => s.setSlug);
  const { openEntryFlow } = useMajorDrawEntryCta();
  const pathname = usePathname();
  const useParentContainer = pathname === "/" || pathname === "/my-account";

  const [initial] = useState(() => resolveStateForSlug(slugProp));
  const [selection, setSelection] = useState(initial.selection);
  const [isCash, setIsCash] = useState(initial.isCash);

  // Engagement counters — how much the visitor played with EACH REEL on this page (a reel
  // touch, not a lane-state change). Cash is a toggle button, not a reel card, so it does not
  // bump either counter (F-010). Absent/zero on the visit row means "never touched that reel".
  const [toolboxSwitches, setToolboxSwitches] = useState(0);
  const [toolsetSwitches, setToolsetSwitches] = useState(0);
  // "Did they touch the builder at all", set by all three handlers including cash. Reported
  // alongside the build rather than gating whether the build is reported (F-018): cash is not a
  // reel card, so a cash-only visitor sits at 0/0 forever and the counters alone cannot express
  // engagement (F-010). Do not fold this back into a counter check.
  const [hasInteracted, setHasInteracted] = useState(false);

  // `requestedSlug` is what the two lanes add up to; `activeSlug` is what the catalog
  // actually has (it falls back to the default prize if a combination has no entry yet),
  // so every downstream consumer gets a slug that is guaranteed to resolve.
  const requestedSlug = toPrizeSlug({ ...selection, isCash });
  const { activePrize, activeSlug } = usePrizeCatalog({ slug: requestedSlug });

  const activeToolbox = getToolbox(selection.toolbox) ?? TOOLBOXES[0];
  const activeToolset = getToolset(selection.toolset) ?? TOOLSETS[0];
  const accent = resolveAccent(activeToolset, isCash);

  /**
   * Feature image for the details sheet: the prize's LANDING-PAGE DESKTOP art, which is
   * the composed, marketing-framed shot (model + full setup) rather than the card's
   * cut-out combo render. Falls back to the combo render for prizes with no landing art.
   */
  const detailsImage = useMemo(() => {
    const combo = getComboPresentation(activeToolbox, activeToolset, isCash).image;
    const landing = getLandingHeroImagePaths(activeSlug);
    return landing ? getImageForMode(landing, themeMode, "desktop") : combo;
  }, [activeToolbox, activeToolset, isCash, activeSlug, themeMode]);

  /* ------------------------------------------------------------------ */
  /* Draw stamp                                                          */
  /* ------------------------------------------------------------------ */
  const { data: currentMajorDraw } = useCurrentMajorDraw();
  const drawLabel = useMemo(() => {
    if (!currentMajorDraw?.drawDate) return null;
    const date = new Date(currentMajorDraw.drawDate);
    return Number.isNaN(date.getTime()) ? null : formatMajorDrawChipUtc(date);
  }, [currentMajorDraw?.drawDate]);

  /* ------------------------------------------------------------------ */
  /* Promo banner                                                        */
  /* ------------------------------------------------------------------ */
  const [multiplierBannerLoadFailed, setMultiplierBannerLoadFailed] = useState(false);
  const resolvedMembershipMultiplier = useResolvedMultiplier("membership-packages", "display");
  const resolvedOneTimeMultiplier = useResolvedMultiplier("one-time-packages", "display");
  const multiplierForFirstBanner =
    firstBannerVariant === "multiplier"
      ? resolvedMembershipMultiplier != null && resolvedMembershipMultiplier > 1
        ? resolvedMembershipMultiplier
        : resolvedOneTimeMultiplier != null && resolvedOneTimeMultiplier > 1
          ? resolvedOneTimeMultiplier
          : null
      : null;

  useEffect(() => {
    setMultiplierBannerLoadFailed(false);
  }, [multiplierForFirstBanner, firstBannerVariant, activeSlug, toolsetMode, toolsetSlug]);

  /* ------------------------------------------------------------------ */
  /* Selection ⇄ URL / storage                                           */
  /* ------------------------------------------------------------------ */
  const isPromoPage = pathname?.startsWith("/promotions/") ?? false;

  // `activeSlug` is the CATALOG-RESOLVED prize, so we never report a combination that has no
  // entry (`usePrizeCatalog` falls back). `slugProp` is the page's own prize; the landing slug
  // for attribution is the pathname segment, which is what the visit row was keyed on.
  const landingSlug = isPromoPage ? pathname?.split("/")[2] : undefined;
  usePrizeBuildTracking({
    enabled: isPromoPage,
    landingSlug,
    builtPrizeSlug: activeSlug,
    toolboxSwitches,
    toolsetSwitches,
    hasInteracted,
  });

  /**
   * Mirror the current build into the URL.
   *
   * `window.history.replaceState`, NOT `router.replace`: the router resets scroll to the top
   * even with `{ scroll: false }` — measured on production 2026-07-27, scrollY 2769 -> 0 about
   * 100ms after a reel click, with the page height unchanged and no route loader. The same
   * finding (an RSC refetch on every `router.replace`) is documented at
   * `useMembershipModalDeepLink.ts:97-107`. `replaceState` cannot scroll and adds no history
   * entry, so Back still leaves the page instead of undoing one reel spin at a time.
   *
   * Reads `window.location.search` rather than the `searchParams` snapshot: successive writes
   * must build on the URL as it actually is now, and `replaceState` does not refresh that hook.
   */
  const syncSelectionQuery = useCallback(
    (next: { toolbox: ToolboxBrand; toolset: ToolsetType; isCash: boolean }) => {
      if (!isPromoPage || !pathname) return;
      window.history.replaceState(
        null,
        "",
        buildPrizeSelectionHref(pathname, new URLSearchParams(window.location.search), next)
      );
    },
    [isPromoPage, pathname]
  );

  /**
   * Mount-only URL hydration. Params WIN over the page's own prize, so a refresh, a Back, or a
   * shared link reopens the exact build.
   *
   * Deliberately one-shot. The previous version re-read `?toolbox=` on every change, creating a
   * URL -> state -> URL round trip; React state is the single owner and the URL is a
   * write-mostly mirror. On statically prerendered promo pages the first paint uses the page
   * default and this applies on hydration — the same accepted flip as `?packages=`.
   */
  const hydratedFromUrl = useRef(false);
  useEffect(() => {
    if (hydratedFromUrl.current || !isPromoPage) return;
    hydratedFromUrl.current = true;
    const params = new URLSearchParams(window.location.search);
    const toolboxFromUrl = parseToolboxQueryParam(params.get(TOOLBOX_QUERY_PARAM));
    const toolsetFromUrl = parseToolsetQueryParam(params.get(TOOLSET_QUERY_PARAM));
    if (!toolboxFromUrl && !toolsetFromUrl) return;
    setIsCash(toolboxFromUrl === "cash");
    setSelection((prev) => ({
      toolbox: toolboxFromUrl && toolboxFromUrl !== "cash" ? toolboxFromUrl : prev.toolbox,
      toolset: toolsetFromUrl ?? prev.toolset,
    }));
  }, [isPromoPage]);

  // `/promotions/{prize-slug}` → `/promotions/{other-prize-slug}` is a client transition
  // WITHIN the same `[slug]` route segment, so this component is reused rather than
  // remounted and the `useState` initialiser above never re-runs. Re-derive the state when
  // the page's own prize actually changes; the ref keeps a visitor's in-page reconfiguring
  // from being reset on every unrelated re-render.
  const appliedSlugProp = useRef(slugProp);
  useEffect(() => {
    if (!slugProp || slugProp === appliedSlugProp.current) return;
    appliedSlugProp.current = slugProp;
    const next = resolveStateForSlug(slugProp);
    setSelection(next.selection);
    setIsCash(next.isCash);
    // Engagement is per page, and this component survives the page change, so the counters must
    // be zeroed with the selection (F-026). Leaving them would carry page A's switch counts onto
    // page B's visit row — crediting page B with reel activity that happened somewhere else, and
    // (because the beacon re-fires on the new slug) recording a build nobody made there.
    setToolboxSwitches(0);
    setToolsetSwitches(0);
    setHasInteracted(false);
    // The page's own prize changed under us (a client transition inside `[slug]` reuses this
    // component). Any build params still in the URL describe the PREVIOUS page, so drop them —
    // otherwise page A's build leaks onto page B and is attributed there.
    if (isPromoPage && pathname) {
      const params = new URLSearchParams(window.location.search);
      if (params.has(TOOLBOX_QUERY_PARAM) || params.has(TOOLSET_QUERY_PARAM)) {
        params.delete(TOOLBOX_QUERY_PARAM);
        params.delete(TOOLSET_QUERY_PARAM);
        const qs = params.toString();
        window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
      }
    }
  }, [slugProp, isPromoPage, pathname]);

  // Evergreen surfaces (home, /my-account): reopen on the toolbox the visitor last chose.
  // Skipped where the page itself names the prize (`/promotions/*`) or locks the toolset.
  useEffect(() => {
    if (slugProp || toolsetMode) return;
    try {
      const remembered = localStorage.getItem(TOOLBOX_PREFERENCE_KEY);
      if (remembered && getToolbox(remembered)) {
        setSelection((prev) => ({ ...prev, toolbox: remembered as ToolboxBrand }));
      }
    } catch {
      // Private-mode / blocked storage — the default toolbox is a fine fallback.
    }
  }, [slugProp, toolsetMode]);

  // Keep the promo theme (page accent art) on whatever combination is on screen.
  useEffect(() => {
    setStoreSlug(activeSlug);
  }, [activeSlug, setStoreSlug]);

  // Publish the build to page chrome outside this subtree — today the mobile bottom dock,
  // which shows the visitor what they're about to enter for. Runs on mount too, so a dock
  // that never sees a reel click still opens on the right combination.
  useEffect(() => {
    publishPrizeSelection({ toolbox: selection.toolbox, toolset: selection.toolset, isCash });
  }, [selection.toolbox, selection.toolset, isCash]);

  const rememberToolbox = (id: ToolboxBrand) => {
    try {
      localStorage.setItem(TOOLBOX_PREFERENCE_KEY, id);
    } catch {
      // Non-fatal: the preference is a convenience, not state the card depends on.
    }
  };

  const handleSelectToolbox = (id: ToolboxBrand) => {
    setSelection((prev) => ({ ...prev, toolbox: id }));
    setIsCash(false);
    rememberToolbox(id);
    syncSelectionQuery({ toolbox: id, toolset: selection.toolset, isCash: false });
    setToolboxSwitches((n) => n + 1);
    setHasInteracted(true);
  };

  const handleSelectToolset = (id: ToolsetType) => {
    setSelection((prev) => ({ ...prev, toolset: id }));
    setIsCash(false);
    // Picking from EITHER reel leaves cash mode, so this path must clear `?toolbox=cash` too.
    syncSelectionQuery({ toolbox: selection.toolbox, toolset: id, isCash: false });
    setToolsetSwitches((n) => n + 1);
    setHasInteracted(true);
  };

  const handleSelectCash = (next: boolean) => {
    setIsCash(next);
    syncSelectionQuery({ ...selection, isCash: next });
    // Not a reel touch, so neither counter bumps here (F-010) — but it IS engagement, and the
    // counters cannot express that, so the flag is what carries it to the visit row.
    setHasInteracted(true);
  };

  /* ------------------------------------------------------------------ */
  /* Specifications modal                                                */
  /* ------------------------------------------------------------------ */
  const [isSpecsModalOpen, setIsSpecsModalOpen] = useState(false);
  const [specsEverOpened, setSpecsEverOpened] = useState(false);
  if (isSpecsModalOpen && !specsEverOpened) setSpecsEverOpened(true); // render-phase latch (same-component setState is safe)
  const [specsPrize, setSpecsPrize] = useState<PrizeCatalogEntry | null>(null);

  // Deep spec-sheet data is deliberately NOT in the client prize summaries — resolve the
  // full catalog entry from `@/config/prizes` (its own click-gated chunk, cached after the
  // first open) whenever the specs modal is open for the active prize. Until it lands the
  // modal shows its built-in "Prize information is loading" state.
  useEffect(() => {
    if (!isSpecsModalOpen || !activeSlug) return;
    let cancelled = false;
    // Stale-specs guard: switching prizes then reopening must not flash the previous sheet.
    setSpecsPrize((prev) => (prev && prev.slug !== activeSlug ? null : prev));
    import("@/config/prizes")
      .then(({ getPrizeBySlug }) => {
        if (!cancelled) setSpecsPrize(getPrizeBySlug(activeSlug) ?? null);
      })
      .catch((error) => {
        // Keep the null/loading state — the modal's "Prize information is loading. Please try
        // again in a moment." copy covers it, and reopening re-runs this effect (chunk retry).
        console.error("PrizeShowcase: failed to load deep prize catalog for specs modal", error);
      });
    return () => {
      cancelled = true;
    };
  }, [isSpecsModalOpen, activeSlug]);

  return (
    /* `prize-builder` on the SECTION (not just the card) so the `--pbc-*` tokens resolve
       here too and the section can paint the card's own panel colour. Below `sm` the card
       runs edge-to-edge inside the container's 16px gutter, so without this the gutter
       showed the page background — reading as black strips down both sides of the card in
       dark mode. Painting the section makes card + gutter one continuous surface. At `sm`+
       the card becomes a bordered panel and is meant to sit on the page background, so the
       fill stops there.

       The dark-mode `crack.webp` texture overlay that used to sit here was removed with it:
       it was the thing making those strips read as a different material, and it also cost a
       full-bleed image download on every dark-mode visit. */
    <section
      ref={prizeRef}
      className="prize-builder relative pb-2 max-sm:bg-[var(--pbc-panel)] sm:pb-12"
      style={{ scrollMarginTop: 0 }}
    >
      <div className={useParentContainer ? "relative z-10 w-full" : `${SECTION_CONTAINER_CLASSES} relative z-10`}>
        {effectiveFirstBannerVariant !== "none" && (
          <div className="mb-6 text-center sm:mb-12">
            {effectiveFirstBannerVariant === "multiplier" ? (
              multiplierForFirstBanner != null &&
              hasMultiplierBanner(multiplierForFirstBanner) && (
                <div className="mb-1 flex justify-center sm:mb-2">
                  {!multiplierBannerLoadFailed ? (
                    <MultiplierBannerImage
                      multiplier={multiplierForFirstBanner}
                      slug={activeSlug}
                      toolsetSlug={toolsetMode ? toolsetSlug ?? null : null}
                      alt={`${multiplierForFirstBanner}X promo entries`}
                      className="h-auto w-full max-w-4xl object-contain lg:max-w-2xl"
                      priority
                      onExhausted={() => setMultiplierBannerLoadFailed(true)}
                    />
                  ) : (
                    <p className="font-sans text-xl font-black uppercase text-gray-900 dark:text-white sm:text-2xl">
                      <span className="text-red-600 dark:text-red-400">{multiplierForFirstBanner}X</span> promo active
                    </p>
                  )}
                </div>
              )
            ) : effectiveFirstBannerVariant === "first-prize-text" ? (
              <div className="flex justify-center">
                <Image
                  src={getFirstPrizeImagePath(activeSlug)}
                  alt="First Prize"
                  width={800}
                  height={200}
                  className="h-auto w-full max-w-4xl object-contain lg:max-w-2xl"
                  priority
                  sizes="(max-width: 1024px) 100vw, 800px"
                />
              </div>
            ) : null}
          </div>
        )}

        <m.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <PrizeBuilderCard
            toolbox={selection.toolbox}
            toolset={selection.toolset}
            isCash={isCash}
            onSelectToolbox={handleSelectToolbox}
            onSelectToolset={handleSelectToolset}
            onSelectCash={handleSelectCash}
            onEnterNow={() => openEntryFlow({ openLocalModal: false })}
            onOpenDetails={() => setIsSpecsModalOpen(true)}
            gallery={activePrize.gallery}
            drawLabel={drawLabel}
            priorityHero={priorityHero}
          />
        </m.div>
      </div>

      {specsEverOpened && (
        <PrizeSpecificationsModal
          isOpen={isSpecsModalOpen}
          onClose={() => setIsSpecsModalOpen(false)}
          prize={specsPrize}
          accent={accent}
          comboImage={detailsImage}
          feature={{
            title: isCash ? CASH_OPTION.title : `${activeToolset.name} + ${activeToolbox.name}`,
            stats: getContentsChips(activeToolbox, activeToolset),
            showCashBonus: !isCash,
          }}
          drawLabel={drawLabel}
        />
      )}
    </section>
  );
}

// No Suspense self-wrap: the old `<Suspense fallback={null}>` existed only to satisfy
// `useSearchParams()` on prerendered pages (docs/security-csp/rules.md R8) — and a null fallback
// is exactly what made the CSR de-opt silent, collapsing this whole card to zero height in the
// static HTML. With every query read going straight to `window.location.search`, nothing here
// suspends, so re-introducing `useSearchParams()` (directly or via a hook) now FAILS THE BUILD
// on `/` — a loud error instead of a silent CLS regression. Keep it that way.
export default PrizeShowcase;
