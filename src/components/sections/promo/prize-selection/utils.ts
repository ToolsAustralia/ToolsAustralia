/**
 * Prize selection utilities — slug parsing, `?toolbox=` handling and catalog filtering.
 *
 * These are the URL/slug helpers only; the prize builder's presentation derivations live
 * in `prize-builder-model.ts` and its brand data in `constants.ts`. Consumed by
 * `PrizeShowcase` and `MajorDrawSection`.
 */

import { CASH_OPTION, TOOLBOXES, TOOLSETS, type ToolboxType, type ToolsetType } from "./constants";
import { fromPrizeSlug, type PrizeSelection } from "./prize-builder-model";

/** Query key for the toolbox lane, e.g. `?toolbox=kincrome`. `cash` is the opt-out. */
export const TOOLBOX_QUERY_PARAM = "toolbox";

/** Query key for the power-toolset lane, e.g. `?toolset=makita`. */
export const TOOLSET_QUERY_PARAM = "toolset";

// Derived from the registries, NOT hand-written: a hard-coded set silently rejects a newly
// added brand until someone remembers to edit it here too.
const VALID_TOOLBOX_QUERY_VALUES = new Set<string>([...TOOLBOXES.map((b) => b.id), "cash"]);
const VALID_TOOLSET_QUERY_VALUES = new Set<string>(TOOLSETS.map((s) => s.id));

/** Parses `?toolbox=`. Invalid or empty values return null (caller falls back to its default). */
export function parseToolboxQueryParam(raw: string | null | undefined): ToolboxType | null {
  if (raw == null || raw === "") return null;
  const normalized = raw.toLowerCase().trim();
  if (!VALID_TOOLBOX_QUERY_VALUES.has(normalized)) return null;
  return normalized as ToolboxType;
}

/** Parses `?toolset=`. Invalid or empty values return null (caller falls back to its default). */
export function parseToolsetQueryParam(raw: string | null | undefined): ToolsetType | null {
  if (raw == null || raw === "") return null;
  const normalized = raw.toLowerCase().trim();
  if (!VALID_TOOLSET_QUERY_VALUES.has(normalized)) return null;
  return normalized as ToolsetType;
}

/**
 * Writes BOTH lanes onto the current path, preserving every other param (`aff`, `packages`,
 * UTMs).
 *
 * Both lanes are written explicitly, including when a value equals the page's own default.
 * That is deliberate: the presence of these params is what distinguishes "engaged with the
 * reels" from "never touched them". The URL only stays clean while the visitor has not
 * interacted, because nothing calls this until the first selection.
 */
export function buildPrizeSelectionHref(
  pathname: string,
  currentSearchParams: URLSearchParams,
  selection: PrizeSelection
): string {
  const params = new URLSearchParams(currentSearchParams.toString());
  params.set(TOOLSET_QUERY_PARAM, selection.toolset);
  params.set(TOOLBOX_QUERY_PARAM, selection.isCash ? "cash" : selection.toolbox);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * The prize a visitor actually has on screen, from the URL params plus the page's own prize.
 *
 * Shared deliberately: `PrizeShowcase` and the signup modal must derive the built prize the
 * SAME way, or the visit row and the signup row would disagree and the funnel numbers would
 * silently drift.
 *
 * No params at all means the visitor never touched the reels, so the page's own prize IS the
 * build. Composition is pure string work over already-validated lane values; the catalog check
 * lives with the caller (`PrizeShowcase` sends the resolved `activeSlug`; the signup path is
 * gated server-side by `isValidPromoSlug`), which keeps the client prize catalog out of this
 * module's import graph.
 */
export function resolveBuiltPrizeSlug(params: URLSearchParams, fallbackSlug: string): string {
  const toolset = parseToolsetQueryParam(params.get(TOOLSET_QUERY_PARAM));
  const toolbox = parseToolboxQueryParam(params.get(TOOLBOX_QUERY_PARAM));
  if (!toolset && !toolbox) return fallbackSlug;
  if (toolbox === "cash") return CASH_OPTION.slug;

  const fromFallback = fromPrizeSlug(fallbackSlug);
  const resolvedToolset = toolset ?? fromFallback?.toolset;
  const resolvedToolbox = (toolbox as Exclude<ToolboxType, "cash"> | null) ?? fromFallback?.toolbox;
  if (!resolvedToolset || !resolvedToolbox) return fallbackSlug;
  return `${resolvedToolset}-${resolvedToolbox}`;
}
