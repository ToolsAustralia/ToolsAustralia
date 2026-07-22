/**
 * Pure presentation model for the /promotions "Spotlight" showroom.
 *
 * Every derivation the gallery renders — the combination list, the live
 * preview's copy, its stat tiles and the prize link — lives here as
 * side-effect-free functions, so it is unit-testable without React
 * (`npm run test:prize-gallery`) and the components stay markup-only. Same
 * split the prize builder uses (`prize-selection/prize-builder-model.ts`).
 *
 * SCALABILITY CONTRACT: nothing here enumerates a brand. Combinations are
 * `TOOLSETS × TOOLBOXES` off the shared registry, so adding a brand is one
 * record there (plus its art + catalog entries) — never an edit in this file
 * and never a layout change.
 *
 * COPY RULE (CLAUDE.md §11): the $5,000 / $10,000 cash is a FREE inclusion in
 * the prize, never a priced entry. Nothing here may emit odds/chance/lottery
 * framing.
 */

import {
  CASH_OPTION,
  TOOLBOXES,
  TOOLSETS,
  type ToolboxOption,
  type ToolsetOption,
} from "@/components/sections/promo/prize-selection/constants";
import {
  fromPrizeSlug,
  getComboPresentation,
  resolveAccent,
  toPrizeSlug,
  type PrizeSelection,
} from "@/components/sections/promo/prize-selection/prize-builder-model";
import { DEFAULT_PRIZE_SLUG } from "@/config/prize-summaries";
import { accentInk, contrastRatio } from "@/utils/prize-brand-colors";

/** Cash added to every tool combination — the headline sweetener on each combo. */
export const COMBO_CASH_BONUS = "$5,000";
/** Cash taken INSTEAD of the gear. */
export const CASH_ONLY_AMOUNT = "$10,000";

/** Total combinations on offer — drives the eyebrow, so it can never go stale. */
export const COMBINATION_COUNT = TOOLSETS.length * TOOLBOXES.length;

/**
 * Opening selection. Derived from the site's `DEFAULT_PRIZE_SLUG` rather than a
 * hard-coded pair, so the showroom always opens on the same combination the rest
 * of the site treats as the headline one.
 */
export const DEFAULT_SELECTION: PrizeSelection = {
  ...(fromPrizeSlug(DEFAULT_PRIZE_SLUG) ?? { toolset: TOOLSETS[0].id, toolbox: TOOLBOXES[0].id }),
  isCash: false,
};

/** Resolve a selection's two registry records, falling back to the defaults. */
export function resolveSelection(selection: PrizeSelection): {
  toolset: ToolsetOption;
  toolbox: ToolboxOption;
} {
  return {
    toolset: TOOLSETS.find((s) => s.id === selection.toolset) ?? TOOLSETS[0],
    toolbox: TOOLBOXES.find((b) => b.id === selection.toolbox) ?? TOOLBOXES[0],
  };
}

/** "13pc FUEL™ kit + PACKOUT™ 8pc" — the toolset's own kit + storage line. */
export function toolsetKitLine(toolset: ToolsetOption): string {
  return `${toolset.kitLabel} + ${toolset.storageLabel}`;
}

/** One stat tile under the live preview. */
export interface SpotlightStat {
  label: string;
  value: string;
  /** The cash tile carries the green treatment. */
  isCash?: boolean;
}

/** Everything the live-preview column renders for the current selection. */
export interface SpotlightView {
  /** Cache-busting key for the cross-fade — changes on every selection change. */
  key: string;
  /** Brand accent driving the glow, case ring, CTA and active thumb. */
  accent: string;
  /** Legible ink for text on the accent-filled CTA. */
  accentInk: string;
  image: string;
  imageAlt: string;
  /** Pill over the case: "Live preview" / "Cash option". */
  tag: string;
  /** "Makita × Kincrome" / "$10,000 tax-free cash". */
  title: string;
  /** Kit + storage line, or the cash blurb. */
  description: string;
  /** Green flag on the case: "+ $5,000 cash" / "$10,000 cash". */
  cashFlag: string;
  stats: SpotlightStat[];
  /** The prize page this combination opens. */
  href: string;
}

/**
 * Derive the whole live preview from a selection.
 *
 * The combo render + alt come from `getComboPresentation` (the prize builder's
 * resolver) so the two surfaces can never point at different art for the same
 * combination; the gallery's own copy is layered on top.
 */
export function getSpotlightView(selection: PrizeSelection): SpotlightView {
  const { toolset, toolbox } = resolveSelection(selection);
  const { isCash } = selection;
  const accent = resolveAccent(toolset, isCash);
  const combo = getComboPresentation(toolbox, toolset, isCash);

  return {
    key: toPrizeSlug(selection),
    accent,
    accentInk: accentInk(accent),
    image: combo.image,
    imageAlt: combo.imageAlt,
    tag: isCash ? "Cash option" : "Live preview",
    title: isCash ? CASH_OPTION.title : `${toolset.name} × ${toolbox.brandName}`,
    description: isCash ? CASH_OPTION.sub : `${toolsetKitLine(toolset)} · ${toolbox.name}`,
    cashFlag: isCash ? `${CASH_ONLY_AMOUNT} cash` : `+ ${COMBO_CASH_BONUS} cash`,
    stats: [
      { label: "Power tools", value: isCash ? "—" : `${toolset.toolCount} tools` },
      { label: "Storage", value: isCash ? "—" : toolbox.brandName },
      { label: "Cash bonus", value: isCash ? CASH_ONLY_AMOUNT : COMBO_CASH_BONUS, isCash: true },
    ],
    // Each combination has its own prerendered prize page (`{toolset}-{toolbox}`),
    // so the link lands on art + metadata for exactly what was previewed.
    href: `/promotions/${toPrizeSlug(selection)}`,
  };
}

/**
 * Minimum contrast a brand wordmark must have against the light stage before it
 * reads as decoration rather than a label. WCAG 2.1 §1.4.11's bar for
 * non-text graphics.
 */
const MARK_CONTRAST_FLOOR = 3;

/**
 * True when a brand's own colour is too close to the LIGHT stage for its
 * wordmark to hold its edge — today DeWalt yellow, Ryobi lime and Makita teal
 * (1.6:1, 2.7:1 and 2.4:1 against white). Those get a hairline outline; the rest
 * are left clean.
 *
 * Measured against white, the lightest point of the stage gradient, so the
 * answer holds wherever in the rail the group header lands. Dark mode never
 * needs it — every brand colour is high-contrast on `#08090b`.
 */
export function needsMarkOutline(accent: string): boolean {
  return contrastRatio(accent, "#ffffff") < MARK_CONTRAST_FLOOR;
}

/** True when this thumb is the current selection (never in cash mode). */
export function isComboSelected(
  selection: PrizeSelection,
  toolsetId: string,
  toolboxId: string
): boolean {
  return !selection.isCash && selection.toolset === toolsetId && selection.toolbox === toolboxId;
}
