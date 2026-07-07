"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { PrizeCatalogEntry, PrizeSlug } from "@/config/prizes";
import { getBrandGlowColor } from "@/utils/prize-brand-colors";
import { getPackageColorScheme, getToolsetBadgeStyle } from "@/utils/package-colors/packageColorScheme";
import { Carousel3D, type Carousel3DItemState } from "@/components/ui/Carousel3D";
import { POWERSET_IMAGES, POWERSET_LABELS, POWERSET_BRAND_TEXT } from "./constants";
import { getToolsetFromSlug } from "./utils";
import { cn } from "@/utils/cn";
import { useDeviceProfile } from "@/hooks/useDeviceProfile";
import { useInViewportAnimation } from "@/hooks/useInViewportAnimation";

interface PowerToolsetCarouselProps {
  /** All toolset options for the current toolbox type */
  prizes: PrizeCatalogEntry[];
  /** Slug of the currently selected/active prize */
  activeSlug: string | null;
  /** Called when user selects a toolset */
  onSelect: (slug: string) => void;
  /**
   * How a selection commits, since selecting can be cheap or expensive per surface:
   * - `"live"` (home, my-account — `onSelect` swaps in place): a drag-release AND a
   *   tap both select, so the ring drives the choice like the membership turntable.
   * - `"deferred"` (evergreen `/promotions/*` — `onSelect` navigates): drag only
   *   browses; selection commits on an explicit tap, so a spin never fires a route
   *   change. Default `"deferred"` (the safe choice when committing navigates).
   */
  selectionMode?: "live" | "deferred";
  /** Optional className for the container */
  className?: string;
}

const sideItemVariants = {
  hidden: ({ i: _i, fromLeft }: { i: number; fromLeft: boolean }) => ({
    opacity: 0,
    x: fromLeft ? -24 : 24,
    scale: 0.88,
  }),
  visible: ({ i }: { i: number }) => ({
    opacity: 0.55,
    filter: "brightness(1.2) saturate(0.75)",
    x: 0,
    scale: 1,
    transition: {
      type: "spring" as const,
      stiffness: 350,
      damping: 24,
      delay: i * 0.06,
    },
  }),
  hover: {
    opacity: 0.95,
    filter: "brightness(1) saturate(1)",
    scale: 1.08,
    transition: { type: "spring" as const, stiffness: 400, damping: 20 },
  },
};

const centerVariants = {
  enter: {
    opacity: 0,
    scale: 0.92,
  },
  center: {
    opacity: 1,
    scale: 1,
    transition: {
      type: "spring" as const,
      stiffness: 300,
      damping: 28,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.2 },
  },
};

/** Toolset brand → package colour-scheme key (drives badge text colour). */
function getToolsetColorKey(toolset: string): string {
  if (toolset === "milwaukee") return "milwaukee-red";
  if (toolset === "dewalt") return "dewalt-yellow";
  if (toolset === "makita") return "makita-teal";
  if (toolset === "ryobi") return "ryobi-green";
  if (toolset === "hikoki") return "hikoki-green";
  return "milwaukee-red";
}

/**
 * Bright per-brand glow hex for the card halo. Derived from each brand's signature
 * colour but kept VIVID so every brand reads as a glow on the dark card — the shared
 * `getBrandGlowColor` uses each brand's `primaryDark`, which is too dim for Makita's
 * and (especially) HiKOKI's dark brand greens. Scoped here so gallery/border glows
 * elsewhere are untouched. Add a brand here when adding a toolset.
 */
const TOOLSET_GLOW_HEX: Record<string, string> = {
  milwaukee: "#ff2630",
  dewalt: "#ffc21a",
  makita: "#13c8f0",
  ryobi: "#c8ff1a",
  hikoki: "#16d894",
};

/**
 * Split a label into two visually-balanced lines at the word boundary nearest the
 * middle. We force this break ourselves (with a <br/>) and let the pill hug the WIDER
 * line via `w-max` — the only reliable way to get "exactly two rows, full text, no
 * truncation, container = text width". Pure CSS can't hug a *wrapped* block: `w-fit`
 * measures the one-line width, and `w-fit` + `text-balance` collapse to 3 short rows.
 */
function splitTwoLines(text: string): [string, string] {
  const words = text.trim().split(/\s+/);
  if (words.length < 2) return [text, ""];
  const total = text.length;
  let acc = 0;
  let bestIdx = 1;
  let bestDiff = Infinity;
  for (let i = 0; i < words.length - 1; i++) {
    acc += words[i].length + 1; // running length of line 1 (incl. the trailing space)
    const diff = Math.abs(acc - (total - acc));
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i + 1;
    }
  }
  return [words.slice(0, bestIdx).join(" "), words.slice(bestIdx).join(" ")];
}

/**
 * Power toolset carousel — the focused toolset rides front-and-centre on the
 * reusable <Carousel3D> coverflow ring, the rest fanning out to the sides. The
 * carousel engine owns motion / physics / drag / a11y; this file owns the card
 * material + the two special non-carousel states (all-toolsets grid when nothing
 * is selected, single hero when there's only one toolset). Every focused brand
 * image renders with one uniform frame (object-contain, dead-centre) so they all
 * sit centred like the Makita shot — no per-brand nudges.
 */
export function PowerToolsetCarousel({
  prizes,
  activeSlug,
  onSelect,
  selectionMode = "deferred",
  className = "",
}: PowerToolsetCarouselProps) {
  const prefersReducedMotion = useReducedMotion();
  const profile = useDeviceProfile();
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInViewportAnimation(rootRef);
  const allowInfiniteAnim = !prefersReducedMotion && profile.tier === "desktop" && inView;

  // When activeSlug is null (e.g. cash-prize), nothing is selected — no fallback to first prize
  const activePrize =
    activeSlug != null
      ? (prizes.find((p) => p.slug === activeSlug) ?? prizes[0])
      : null;
  const activeIndex = activePrize ? prizes.findIndex((p) => p.slug === activePrize.slug) : 0;
  const n = prizes.length;

  const activeToolset = activePrize ? getToolsetFromSlug(activePrize.slug) : null;
  const activeImgSrc = activeToolset ? POWERSET_IMAGES[activeToolset] : null;
  const glowColor = activeSlug != null ? getBrandGlowColor(activeSlug as PrizeSlug) : "transparent";

  // The 3D ring carries the selection only when something is focused and there are
  // at least two toolsets to turn between. The null (deactivated/cash) and single
  // toolset cases keep their bespoke layouts below.
  const useCarousel = activeSlug != null && n >= 2;

  /** One toolset card for the Carousel3D ring — presentational; the ring applies the transform. */
  const renderToolsetCard = ({ item, isActive }: Carousel3DItemState<PrizeCatalogEntry>) => {
    const toolset = getToolsetFromSlug(item.slug);
    const imgSrc = toolset ? POWERSET_IMAGES[toolset] : null;
    if (!imgSrc) return null;
    const label = toolset ? POWERSET_LABELS[toolset] : null;
    const brandLogo = toolset ? POWERSET_BRAND_TEXT[toolset] : null;
    const scheme = toolset ? getPackageColorScheme(getToolsetColorKey(toolset)) : null;
    const badgeStyle = toolset ? getToolsetBadgeStyle(toolset) : null;
    const glowHex = (toolset && TOOLSET_GLOW_HEX[toolset]) || "#ff2630";
    // Gentle idle bob on the focused card only (the rest hold still); reduced-motion off.
    const float = isActive && !prefersReducedMotion;
    return (
      <div className="relative flex w-full flex-col items-center">
        {brandLogo && (
          <div className="relative z-10 h-8 w-36 sm:h-10 sm:w-44">
            <Image
              src={brandLogo}
              alt={toolset ?? ""}
              fill
              unoptimized
              draggable={false}
              className="select-none object-contain object-center"
              sizes="176px"
            />
          </div>
        )}
        {/* Uniform frame: every brand composite is object-contain + dead-centre, so each
            focused toolset sits centred regardless of the source artwork. The focused
            card bobs gently for a bit of life (matches the membership turntable feel). */}
        <motion.div
          className="relative mt-2 aspect-[5/4] w-full"
          animate={float ? { y: [0, -10, 0] } : { y: 0 }}
          transition={
            float ? { duration: 3.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }
          }
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-6 rounded-[2.75rem] blur-2xl transition-opacity duration-300"
            style={{
              background: `radial-gradient(ellipse 82% 76% at 50% 50%, ${glowHex}, transparent 72%)`,
              opacity: isActive ? 0.9 : 0,
            }}
          />
          <Image
            src={imgSrc}
            alt={item.label}
            fill
            draggable={false}
            className="select-none object-contain object-center drop-shadow-2xl"
            sizes="(max-width: 640px) 64vw, 320px"
          />
        </motion.div>
        {label && scheme && badgeStyle && isActive && (() => {
          // Two balanced lines, break forced by us; the pill hugs the WIDER line
          // (w-max = max-content) so it's exactly two rows, full text, no truncation,
          // and the container is only as wide as the text. max-w-[92vw] just guards
          // against viewport overflow on the narrowest phones.
          const [line1, line2] = splitTwoLines(`${label} + $5000 CASH`);
          return (
            <div className="relative z-10 mt-2 flex w-full justify-center">
              <div
                className="w-max max-w-[92vw] shrink-0 rounded-xl px-3 py-1.5 shadow-lg backdrop-blur-md"
                style={{
                  background: badgeStyle.background,
                  boxShadow: badgeStyle.boxShadow,
                  border: badgeStyle.border,
                }}
              >
                <p
                  className={cn(
                    "text-center font-sans text-[11px] font-extrabold leading-tight sm:text-sm",
                    scheme.buttonText,
                  )}
                >
                  {line1}
                  <br />
                  {line2}
                </p>
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  const renderActiveCenter = (outerClass: string, frameClass: string) => (
    <div className={outerClass}>
      <motion.div
        className="absolute inset-0 -m-8 rounded-3xl blur-3xl pointer-events-none"
        animate={
          allowInfiniteAnim
            ? {
                opacity: [0.4, 0.6, 0.4],
                scale: [1, 1.02, 1],
              }
            : { opacity: 0.5, scale: 1 }
        }
        transition={
          allowInfiniteAnim
            ? {
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut",
              }
            : {}
        }
        style={{
          background: `radial-gradient(ellipse 80% 70% at 50% 50%, ${glowColor}, transparent 70%)`,
        }}
      />

      {activeImgSrc && (
        <motion.div
          layout
          layoutDependency={activeSlug ?? ""}
          className={frameClass}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSlug ?? activeImgSrc}
              variants={centerVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="relative w-full h-full"
            >
              <motion.div
                animate={allowInfiniteAnim ? { y: [0, -6, 0] } : { y: 0 }}
                transition={
                  allowInfiniteAnim
                    ? {
                        y: {
                          duration: 4,
                          repeat: Infinity,
                          ease: "easeInOut",
                        },
                      }
                    : {}
                }
                className="relative w-full h-full"
              >
                <div className="absolute inset-0">
                  <Image
                    src={activeImgSrc}
                    alt={activePrize?.label ?? "Selected power toolset"}
                    fill
                    className="object-contain object-center drop-shadow-2xl"
                    sizes="(max-width: 640px) min(68vw, 17rem), (max-width: 1024px) 360px, (max-width: 1280px) 440px, 500px"
                    priority
                  />
                </div>
                {activeToolset && POWERSET_LABELS[activeToolset] && (() => {
                  const scheme = getPackageColorScheme(getToolsetColorKey(activeToolset));
                  const badgeStyle = getToolsetBadgeStyle(activeToolset);
                  return (
                    <div className="absolute bottom-0 left-0 right-0 z-10 flex justify-center pointer-events-none px-1.5 sm:px-2">
                      <div
                        className="w-fit max-w-full rounded-xl px-2.5 py-1.5 shadow-xl backdrop-blur-md sm:px-4 sm:py-2.5"
                        style={{
                          background: badgeStyle.background,
                          boxShadow: badgeStyle.boxShadow,
                          border: badgeStyle.border,
                        }}
                      >
                        <p
                          className={cn("max-w-[min(100%,18rem)] whitespace-normal font-sans text-center text-3xs font-extrabold font-bold leading-snug line-clamp-2 sm:max-w-none sm:text-xs sm:leading-tight lg:text-sm", scheme.buttonText)}
                        >
                          {POWERSET_LABELS[activeToolset]} + $5000 CASH
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );

  const renderSideImage = (
    prizeOption: PrizeCatalogEntry,
    index: number,
    fromLeft: boolean
  ) => {
    const toolset = getToolsetFromSlug(prizeOption.slug);
    const imgSrc = toolset ? POWERSET_IMAGES[toolset] : null;
    const label = toolset ? POWERSET_LABELS[toolset] : null;
    const brandLogo = toolset ? POWERSET_BRAND_TEXT[toolset] : null;
    if (!imgSrc) return null;
    const scheme = toolset ? getPackageColorScheme(getToolsetColorKey(toolset)) : null;
    const badgeStyle = toolset ? getToolsetBadgeStyle(toolset) : null;
    return (
      <motion.div
        key={prizeOption.slug}
        custom={{ i: index, fromLeft }}
        variants={sideItemVariants}
        initial="hidden"
        animate="visible"
        whileHover="hover"
        className="relative h-28 w-[5.5rem] shrink-0 overflow-visible sm:h-40 sm:w-32 lg:h-44 lg:w-36 xl:h-48 xl:w-40"
      >
        {brandLogo && (
            <div
              className="absolute top-1 left-1/2 -translate-x-1/2 z-20 h-5 w-16 sm:h-6 sm:w-20 lg:h-7 lg:w-24 pointer-events-none"
            >
            <Image
              src={brandLogo}
              alt={toolset ?? ""}
              fill
              unoptimized
              className="object-contain"
              sizes="64px"
            />
          </div>
        )}
        <motion.button
          type="button"
          onClick={() => onSelect(prizeOption.slug)}
          className="relative h-full w-full cursor-pointer overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2"
        >
          <div className="absolute inset-0">
            <Image
              src={imgSrc}
              alt={prizeOption.label}
              fill
              className="object-contain object-center"
              sizes="(max-width: 640px) 120px, (max-width: 1024px) 180px, 220px"
            />
          </div>
          {label && scheme && badgeStyle && (
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 z-10 w-[95%] pointer-events-none"
          >
            <div
              className="rounded-xl backdrop-blur-md px-1.5 py-0.5 sm:px-2 sm:py-1 shadow-lg"
              style={{
                background: badgeStyle.background,
                boxShadow: badgeStyle.boxShadow,
                border: badgeStyle.border,
              }}
            >
              <p className={cn("font-sans font-extrabold font-bold text-3xs sm:text-3xs lg:text-2xs leading-tight text-center line-clamp-2 break-words hyphens-auto", scheme.buttonText)}>
                {label} + $5000 CASH
              </p>
            </div>
          </div>
        )}
        </motion.button>
      </motion.div>
    );
  };

  return (
    <div ref={rootRef} className={cn("flex flex-col items-center gap-2 sm:gap-3", className)}>
      {/* Carousel label — brand logo for the active toolset. The 3D ring carries its
          own per-card wordmark, so only the non-carousel (single-toolset) state shows it. */}
      {!useCarousel && activeToolset && POWERSET_BRAND_TEXT[activeToolset] && (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeToolset}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.2 }}
            className="relative h-8 w-40 sm:h-10 sm:w-52 lg:h-12 lg:w-60"
          >
            <Image
              src={POWERSET_BRAND_TEXT[activeToolset]}
              alt={activeToolset}
              fill
              unoptimized
              className="object-contain"
              sizes="(max-width: 640px) 160px, (max-width: 1024px) 208px, 240px"
            />
          </motion.div>
        </AnimatePresence>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className={
          activeSlug != null
            ? "w-full max-w-[100rem] mx-auto overflow-visible"
            : "flex items-center w-full max-w-[100rem] mx-auto justify-center overflow-visible px-1 sm:px-2"
        }
        role="group"
        aria-label="Select power toolset"
      >
        {activeSlug == null ? (
          // Nothing selected (e.g. cash-prize): a single grid of all toolsets, no focus.
          <div
            className={
              prizes.length === 4
                ? "grid w-full grid-cols-2 place-items-center gap-x-6 gap-y-10 px-2 pt-7 sm:gap-x-10 sm:gap-y-12 sm:pt-9 sm:px-4 md:grid-cols-4 md:gap-x-10 md:gap-y-8 md:pt-8 lg:gap-x-16 xl:gap-x-20"
                : "flex flex-wrap items-start justify-center gap-5 sm:gap-8 pt-6 sm:pt-7"
            }
          >
            {prizes.map((prize, i) => renderSideImage(prize, i, true))}
          </div>
        ) : useCarousel ? (
          // overflow-x-clip: the fanned far cards spread wide — clip horizontally so
          // they never push the page into a horizontal scroll on narrow phones (y
          // stays visible so the card badge/glow aren't cropped). pb reserves room for
          // the focused card's description pill (which sits low in the wheel) so it never
          // overlaps the "OR / $10,000 cash" block below.
          <div className="overflow-x-clip pb-6 sm:pb-10">
            <Carousel3D<PrizeCatalogEntry>
              key={prizes.map((p) => p.slug).join("|")}
              items={prizes}
              getKey={(p) => p.slug}
              getLabel={(p) => p.label}
              label="Select power toolset"
              renderItem={renderToolsetCard}
              defaultActiveIndex={activeIndex < 0 ? 0 : activeIndex}
              onCommit={(idx) => {
                const slug = prizes[idx]?.slug;
                if (slug) onSelect(slug);
              }}
              commitOnDrag={selectionMode === "live"}
              layout="wheel"
              autoRotate={false}
              hideControls
              radiusX={232}
              radiusXMobile={144}
              radiusY={84}
              radiusYMobile={54}
              depthZ={140}
              rotate={20}
              minScale={0.5}
              minOpacity={0.32}
              maxBlur={2.4}
              perspective={1000}
              stageHeight="clamp(288px, 72vw, 430px)"
              cardWidth={300}
              cardWidthMobileMax={230}
            />
          </div>
        ) : (
          // Single toolset: one centred hero, no ring to turn.
          <div className="flex w-full justify-center overflow-x-hidden overflow-y-hidden pt-4 sm:pt-6 md:pt-8">
            {renderActiveCenter(
              "relative z-[1] flex w-full min-w-0 max-w-[min(100%,420px)] items-center justify-center px-2",
              "relative mx-auto w-full max-w-[min(100%,420px)] sm:mx-0 sm:h-[260px] sm:w-[340px] sm:min-h-0 sm:max-w-none md:h-[280px] md:w-[380px] lg:h-[290px] lg:w-[400px] xl:h-[310px] xl:w-[440px]"
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
