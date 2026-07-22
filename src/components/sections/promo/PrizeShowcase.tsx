"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { m } from "framer-motion";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

// Click-gated heavy chunk (LazyMembershipModal latch pattern —
// src/components/modals/MembershipModal/LazyMembershipModal.tsx): rendering a dynamic()
// component fetches and evaluates its chunk even with isOpen=false, so the specs modal is
// not rendered until its FIRST open (see the `specsEverOpened` latch below); after that it
// stays mounted so close animations and internal state behave like the always-mounted version.
const PrizeSpecificationsModal = dynamic(() => import("@/components/modals/PrizeSpecificationsModal"), { ssr: false });

import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";
import { usePrizeCatalog } from "@/hooks/usePrizeCatalog";
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
  buildToolsetLandingHref,
  fromPrizeSlug,
  getComboPresentation,
  getContentsChips,
  getToolbox,
  getToolset,
  parseToolboxQueryParam,
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

function PrizeShowcaseInner({
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const useParentContainer = pathname === "/" || pathname === "/my-account";

  const [initial] = useState(() => resolveStateForSlug(slugProp));
  const [selection, setSelection] = useState(initial.selection);
  const [isCash, setIsCash] = useState(initial.isCash);

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
  const toolboxQueryValue = searchParams.get(TOOLBOX_QUERY_PARAM);

  /** Toolset landing pages persist the toolbox (and the cash opt-out) in `?toolbox=`. */
  const syncToolboxQuery = useCallback(
    (value: ToolboxBrand | "cash") => {
      if (!toolsetMode || !pathname?.startsWith("/promotions/")) return;
      router.replace(buildToolsetLandingHref(pathname, searchParams, value), { scroll: false });
    },
    [toolsetMode, pathname, router, searchParams]
  );

  // Toolset landing pages: hydrate the toolbox lane (and cash mode) from `?toolbox=`.
  // Invalid or missing values fall back to the first toolbox.
  useEffect(() => {
    if (!toolsetMode) return;
    const fromUrl = parseToolboxQueryParam(toolboxQueryValue);
    setIsCash(fromUrl === "cash");
    if (fromUrl && fromUrl !== "cash") {
      // Only the TOOLBOX lane is persisted in the query — the toolset comes from the
      // page's own slug and is then the visitor's to change in the reel.
      setSelection((prev) => ({ ...prev, toolbox: fromUrl }));
    }
  }, [toolsetMode, toolboxQueryValue]);

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
  }, [slugProp]);

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
    syncToolboxQuery(id);
  };

  const handleSelectToolset = (id: ToolsetType) => {
    setSelection((prev) => ({ ...prev, toolset: id }));
    setIsCash(false);
    // Picking from EITHER reel leaves cash mode, so this path must clear `?toolbox=cash`
    // too — otherwise a reload on a toolset landing page drops the visitor back into it.
    syncToolboxQuery(selection.toolbox);
  };

  const handleSelectCash = (next: boolean) => {
    setIsCash(next);
    syncToolboxQuery(next ? "cash" : selection.toolbox);
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

// Suspense self-wrap: useSearchParams requires a boundary for prerendered (marketing-class) pages — docs/security-csp/rules.md R8.
export default function PrizeShowcase(props: PrizeShowcaseProps = {}) {
  return (
    <Suspense fallback={null}>
      <PrizeShowcaseInner {...props} />
    </Suspense>
  );
}
