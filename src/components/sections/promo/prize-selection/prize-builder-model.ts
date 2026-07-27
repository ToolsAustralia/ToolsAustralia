/**
 * Pure presentation model for the prize builder ("Build your prize").
 *
 * Every derivation the card needs — reel geometry, accent resolution, hero
 * imagery, caption copy, the "what's in this prize" preview grid — lives here as
 * side-effect-free functions so it can be unit-tested without React
 * (`npm run test:prize-builder`) and so the components stay markup-only.
 *
 * COPY RULE (CLAUDE.md §11): entries are a FREE inclusion with the pack/
 * membership and are never sold or priced per unit. Nothing in this module may
 * emit odds/chance/lottery framing or an "$X per entry" style string.
 */

import type { PrizeMedia } from "@/config/prize-summaries";
import {
  CASH_OPTION,
  TOOLBOXES,
  TOOLSETS,
  type ToolboxBrand,
  type ToolboxOption,
  type ToolsetOption,
  type ToolsetType,
} from "./constants";

/* -------------------------------------------------------------------------- */
/* Reel geometry                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Layout-dependent coverflow tuning — exactly the values in the design handoff.
 *
 * These numbers are NOT read at render time: the reel's placement maths lives in CSS
 * (`.prize-builder` / `.pbc-reel-card` in globals.css) so the correct breakpoint paints
 * on the first frame with no media-query hook. This table is the *specification* of
 * those CSS variables, and `npm run test:prize-builder` parses globals.css and asserts
 * the two agree — so the duplication is guarded rather than a drift hazard.
 */
export interface ReelMetrics {
  /** Card width in px. */
  cardWidth: number;
  /** Card height in px. */
  cardHeight: number;
  /** Stage height in px. */
  stageHeight: number;
  /** Horizontal px between neighbouring cards. */
  step: number;
  /** Z-depth px pushed back per position away from focus. */
  depth: number;
  /** Y-rotation degrees per position away from focus. */
  rotate: number;
  /** Scale applied to unfocused cards (focused cards use `FOCUS_SCALE`). */
  sideScale: number;
  /** Opacity of unfocused cards still inside the visible window. */
  sideOpacity: number;
  /** Filter applied to unfocused cards so focus reads instantly. */
  sideFilter: string;
}

export const REEL_METRICS: Record<"desktop" | "mobile", ReelMetrics> = {
  desktop: {
    cardWidth: 172,
    cardHeight: 172,
    stageHeight: 194,
    step: 142,
    depth: 150,
    rotate: 26,
    sideScale: 0.82,
    sideOpacity: 0.5,
    sideFilter: "brightness(.72) saturate(.85)",
  },
  // Deliberately tighter than the handoff (138×168, stage 192): both reels plus the combo
  // hero must clear one phone viewport on a promotions page. Keep in step with globals.css —
  // `npm run test:prize-builder` parses the CSS and asserts these match.
  mobile: {
    cardWidth: 124,
    cardHeight: 140,
    stageHeight: 156,
    step: 112,
    depth: 84,
    rotate: 17,
    sideScale: 0.84,
    sideOpacity: 0.68,
    sideFilter: "brightness(.82) saturate(.9)",
  },
};

/** Focused cards sit slightly proud of the reel. */
export const FOCUS_SCALE = 1.04;

/** Cards this many positions or further from focus are hidden and inert. */
export const REEL_VISIBLE_RADIUS = 3;

/**
 * Signed distance from the focused card, wrapping the SHORTER way around the
 * reel so the last item sits immediately left of the first (an endless belt)
 * rather than {n-1} positions to the right.
 *
 * @example offsetFromFocus(0, 4, 5) === 1   // index 0 is one step right of 4
 */
export function offsetFromFocus(index: number, activeIndex: number, total: number): number {
  if (total <= 0) return 0;
  let offset = index - activeIndex;
  if (offset > total / 2) offset -= total;
  if (offset < -total / 2) offset += total;
  return offset;
}

/**
 * Per-card slot state. Only what the component actually needs: the signed offset it
 * hands to CSS, and the two booleans that drive focus chrome and inertness. The px
 * placement (transform, z-index, opacity, filter) is CSS's job — computing it here too
 * would be a second source of truth for the same numbers.
 */
export interface ReelCardGeometry {
  offset: number;
  /** The focused card — the current selection (never true in cash mode). */
  isFocused: boolean;
  /** Beyond the visible window: fully transparent and pointer-inert. */
  isHidden: boolean;
}

/**
 * Resolve one reel card's slot.
 *
 * @param dimmed - cash mode: the whole reel fades back but stays interactive so
 *   picking a toolbox/toolset is what brings the winner out of cash mode.
 */
export function getReelCardGeometry(
  index: number,
  activeIndex: number,
  total: number,
  dimmed: boolean
): ReelCardGeometry {
  const offset = offsetFromFocus(index, activeIndex, total);
  return {
    offset,
    isFocused: offset === 0 && !dimmed,
    isHidden: Math.abs(offset) >= REEL_VISIBLE_RADIUS,
  };
}

/** Next id when stepping a reel by `direction`, wrapping at both ends. */
export function stepReel<T extends { id: string }>(
  items: readonly T[],
  currentId: string,
  direction: 1 | -1
): string {
  if (items.length === 0) return currentId;
  const current = items.findIndex((item) => item.id === currentId);
  const from = current < 0 ? 0 : current;
  return items[(from + direction + items.length) % items.length].id;
}

/* -------------------------------------------------------------------------- */
/* Selection → prize                                                          */
/* -------------------------------------------------------------------------- */

/** The winner's current configuration. */
export interface PrizeSelection {
  toolbox: ToolboxBrand;
  toolset: ToolsetType;
  /** True when the winner has taken the $10,000 cash instead of the gear. */
  isCash: boolean;
}

/**
 * Catalog slug for a combination. The catalog keys combinations as
 * `{toolset}-{toolbox}`; cash is its own single entry.
 */
export function toPrizeSlug(selection: PrizeSelection): string {
  return selection.isCash ? CASH_OPTION.slug : `${selection.toolset}-${selection.toolbox}`;
}

/** Split a `{toolset}-{toolbox}` slug back into its two lanes. `null` for cash/unknown. */
export function fromPrizeSlug(
  slug: string | null | undefined
): { toolbox: ToolboxBrand; toolset: ToolsetType } | null {
  if (!slug) return null;
  const [toolsetId, toolboxId] = slug.split("-");
  const toolset = TOOLSETS.find((s) => s.id === toolsetId);
  const toolbox = TOOLBOXES.find((b) => b.id === toolboxId);
  if (!toolset || !toolbox) return null;
  return { toolbox: toolbox.id, toolset: toolset.id };
}

/**
 * The card's accent colour: the SELECTED POWER TOOLSET's brand colour, or cash
 * green when the winner has taken the money. Deliberately not the toolbox's —
 * the toolset is the visual hero of the combination.
 */
export function resolveAccent(toolset: ToolsetOption, isCash: boolean): string {
  return isCash ? CASH_OPTION.accent : toolset.accent;
}

/**
 * Multiply a hex colour toward black — builds the bottom stop of the CTA's
 * vertical gradient from a single brand accent.
 *
 * @param factor - 0 = black, 1 = unchanged. Defaults to the design's 0.72.
 */
export function darken(hex: string, factor = 0.72): string {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const value = Number.parseInt(full, 16);
  if (!Number.isFinite(value)) return hex;
  const clamp = (n: number) => Math.min(255, Math.max(0, Math.round(n * factor)));
  return `rgb(${clamp((value >> 16) & 255)},${clamp((value >> 8) & 255)},${clamp(value & 255)})`;
}

/* -------------------------------------------------------------------------- */
/* Hero + caption                                                             */
/* -------------------------------------------------------------------------- */

export interface ComboPresentation {
  /** Composite render of the chosen combination (or the cash art). */
  image: string;
  /** Alt text for the hero image. */
  imageAlt: string;
  /** Small caps line above the title. */
  eyebrow: string;
  /** "Makita + 470 Piece Kincrome Toolbox" or the cash headline. */
  title: string;
  /** Kit · storage · cash bonus line. */
  sub: string;
  /** The "+ $5,000 CASH INCLUDED" flag is hidden when the winner took the cash. */
  showCashFlag: boolean;
}

/**
 * Toolboxes with no `{toolset}-{toolbox}.webp` composite photographed yet.
 *
 * GearWrench joined in draw 9 with its landing art but without the five combo shots. The
 * Prize Showcase handoff designs for exactly this rather than leaving a broken image: show
 * the standalone toolbox render and let the caller badge it "combo photo coming". Delete the
 * entry the day the shoot lands — nothing else needs to change.
 */
const TOOLBOXES_AWAITING_COMBO_ART = new Set<string>(["gearwrench"]);

/** True when this combination has no composite shot and is showing the standalone box. */
export function isComboArtPending(toolbox: ToolboxOption): boolean {
  return TOOLBOXES_AWAITING_COMBO_ART.has(toolbox.id);
}

/**
 * Everything the combo hero renders for the current selection.
 *
 * The composite render lives beside the toolset's own art
 * (`{toolset}-set/{toolset}-{toolbox}.webp`) — one per combination, so a new
 * brand ships art without a code change. A toolbox still awaiting those shots falls back to
 * its own standalone render rather than pointing at a file that does not exist.
 */
export function getComboPresentation(
  toolbox: ToolboxOption,
  toolset: ToolsetOption,
  isCash: boolean
): ComboPresentation {
  if (isCash) {
    return {
      image: CASH_OPTION.image,
      imageAlt: CASH_OPTION.title,
      eyebrow: "CASH OPTION",
      title: CASH_OPTION.title,
      sub: CASH_OPTION.sub,
      showCashFlag: false,
    };
  }

  const comboArtPending = isComboArtPending(toolbox);

  return {
    image: comboArtPending
      ? toolbox.image
      : `/images/majordraws/${toolset.id}-set/${toolset.id}-${toolbox.id}.webp`,
    imageAlt: comboArtPending
      ? `${toolbox.name} — combination photo with the ${toolset.name} toolset coming soon`
      : `${toolset.name} power toolset with the ${toolbox.name}`,
    eyebrow: "YOUR COMBINATION",
    title: `${toolset.name} + ${toolbox.name}`,
    sub: `${toolset.kitLabel} · ${toolset.storageLabel} storage · plus $5,000 cash`,
    showCashFlag: true,
  };
}

/** Chip copy for the contents strip and the details-modal stat rows. */
export function getContentsChips(toolbox: ToolboxOption, toolset: ToolsetOption) {
  return {
    tools: `${toolset.toolCount} power tools`,
    storage: `${toolset.storageLabel} + ${toolbox.shortName}`,
  };
}

/* -------------------------------------------------------------------------- */
/* "What's in this prize" preview grid                                        */
/* -------------------------------------------------------------------------- */

/** Tiles per row in the preview grid. */
export const PREVIEW_COLUMNS = 6;
/** The grid is capped at two rows so it never pushes the CTA below the fold. */
export const PREVIEW_MAX_ROWS = 2;

const PREVIEW_MAX_CELLS = PREVIEW_COLUMNS * PREVIEW_MAX_ROWS;

/**
 * Marketing/platform tokens that carry no product meaning in a 2-word caption.
 * Anything containing a digit (models, voltages, sizes) is dropped separately.
 */
const CAPTION_NOISE = new Set([
  "the",
  "and",
  "with",
  "xr",
  "fuel",
  "fuel™",
  "lxt",
  "one+",
  "multivolt",
  "flexvolt",
  "redlithium",
  "redlithium™",
  "packout",
  "packout™",
  "maktrak",
  "maktrak™",
  "brushless",
  "cordless",
  "mobile",
  "compact",
  "premium",
  "heavy",
  "duty",
  "class",
  "hand",
  "held",
  "prize",
]);

/**
 * Squeeze a long gallery `alt` down to a 2-word product caption for the preview
 * tiles ("Makita DTW700Z impact wrench" → "Impact wrench").
 *
 * Derived rather than authored so a new brand's tiles read correctly the moment
 * its gallery lands — there is no per-image caption to keep in sync.
 */
export function toShortToolLabel(alt: string, brandName: string): string {
  const brandTokens = new Set(brandName.toLowerCase().split(/\s+/));
  const words = alt
    .split(/[\s/]+/)
    .map((word) => word.replace(/[(),]/g, ""))
    .filter(Boolean)
    .filter((word) => {
      const lower = word.toLowerCase();
      if (brandTokens.has(lower)) return false;
      if (CAPTION_NOISE.has(lower)) return false;
      return !/\d/.test(word); // model numbers, voltages, millimetre sizes
    });

  const tail = words.slice(-2);
  if (tail.length === 0) return alt;
  const caption = tail.join(" ").toLowerCase();
  return caption.charAt(0).toUpperCase() + caption.slice(1);
}

export interface PreviewTile {
  src: string;
  /** Short caption under the thumbnail. */
  label: string;
  /** Full description, used as the tile's accessible name. */
  alt: string;
}

export interface ContentsPreview {
  tiles: PreviewTile[];
  /** Number of items the capped grid could not show; 0 hides the "+N more" tile. */
  overflowCount: number;
}

/**
 * Build the capped preview grid from a prize's gallery.
 *
 * The combination composite and the toolset's collection shot are skipped —
 * both already headline the card, and the grid is meant to preview the
 * individual gear. When the remainder exceeds two rows, the last cell is
 * surrendered to the "+N more" tile so the count is always truthful.
 */
export function buildContentsPreview(
  gallery: readonly PrizeMedia[],
  toolset: ToolsetOption,
  comboImage: string
): ContentsPreview {
  const items = gallery.filter((media) => media.src !== comboImage && media.src !== toolset.image);

  if (items.length <= PREVIEW_MAX_CELLS) {
    return {
      tiles: items.map((media) => ({
        src: media.src,
        label: toShortToolLabel(media.alt, toolset.name),
        alt: media.alt,
      })),
      overflowCount: 0,
    };
  }

  const shown = PREVIEW_MAX_CELLS - 1; // last cell becomes the "+N more" tile
  return {
    tiles: items.slice(0, shown).map((media) => ({
      src: media.src,
      label: toShortToolLabel(media.alt, toolset.name),
      alt: media.alt,
    })),
    overflowCount: items.length - shown,
  };
}
