/**
 * Prize selection — the "Build your prize" configurator and its supporting data.
 *
 * `PrizeBuilderCard` is the public surface; the reel, hero, contents strip and
 * CTA are its internal parts and are exported only for tests/storybook-style
 * reuse. Brand data lives in `constants.ts`, all derivations in
 * `prize-builder-model.ts`, and slug/query helpers in `utils.ts`.
 */

export { PrizeBuilderCard, type PrizeBuilderCardProps } from "./PrizeBuilderCard";
export { SelectorReel } from "./SelectorReel";
export { ComboHero } from "./ComboHero";
export { PrizeContentsStrip } from "./PrizeContentsStrip";
export { PrizeBuilderCta } from "./PrizeBuilderCta";
export { ToolboxReelCard, ToolsetReelCard } from "./ReelCards";
export { BrandMark } from "./BrandMark";

export {
  TOOLBOX_QUERY_PARAM,
  TOOLSET_QUERY_PARAM,
  parseToolboxQueryParam,
  parseToolsetQueryParam,
  buildPrizeSelectionHref,
  resolveBuiltPrizeSlug,
} from "./utils";

export {
  TOOLBOXES,
  TOOLSETS,
  CASH_OPTION,
  POWERSET_IMAGES,
  POWERSET_BRAND_TEXT,
  getToolbox,
  getToolset,
  type ToolboxBrand,
  type ToolboxOption,
  type ToolboxType,
  type ToolsetOption,
  type ToolsetType,
} from "./constants";

export {
  REEL_METRICS,
  FOCUS_SCALE,
  REEL_VISIBLE_RADIUS,
  PREVIEW_COLUMNS,
  PREVIEW_MAX_ROWS,
  offsetFromFocus,
  getReelCardGeometry,
  stepReel,
  toPrizeSlug,
  fromPrizeSlug,
  resolveAccent,
  darken,
  getComboPresentation,
  getContentsChips,
  toShortToolLabel,
  buildContentsPreview,
  type ComboPresentation,
  type ContentsPreview,
  type PreviewTile,
  type PrizeSelection,
  type ReelMetrics,
} from "./prize-builder-model";
