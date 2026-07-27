/**
 * Prize selection utilities — slug parsing, `?toolbox=` handling and catalog filtering.
 *
 * These are the URL/slug helpers only; the prize builder's presentation derivations live
 * in `prize-builder-model.ts` and its brand data in `constants.ts`. Consumed by
 * `PrizeShowcase` and `MajorDrawSection`.
 */

import type { ToolboxType } from "./constants";
import { TOOLBOXES } from "./constants";

/** Query key for toolset promo landing pages (`/promotions/makita` etc.) — persists toolbox/cash selection on refresh. */
export const TOOLBOX_QUERY_PARAM = "toolbox";

/**
 * DERIVED from the toolbox registry, never hand-listed.
 *
 * This was a hardcoded set of three ids, which silently forked from `TOOLBOXES` the moment
 * GearWrench was added in draw 9: the box appeared in the reel and wrote `?toolbox=gearwrench`
 * to the URL, but the value failed to parse on the way back in — so a refresh or a shared link
 * dropped the visitor's choice back to the default. Deriving it means the registry stays the
 * single source of truth the prize builder was designed around, and the next toolbox needs no
 * change here at all. `cash` is added explicitly because it is the opt-out, not a toolbox.
 */
const VALID_TOOLBOX_QUERY_VALUES = new Set<string>(["cash", ...TOOLBOXES.map((b) => b.id)]);

/**
 * Parses `?toolbox=` for toolset landing URLs. Invalid or empty values return null (caller should use default Milwaukee).
 */
export function parseToolboxQueryParam(raw: string | null | undefined): ToolboxType | null {
  if (raw == null || raw === "") return null;
  const normalized = raw.toLowerCase().trim();
  if (!VALID_TOOLBOX_QUERY_VALUES.has(normalized)) return null;
  return normalized as ToolboxType;
}

/**
 * Updates only the toolbox query on the current path; preserves other params (e.g. `aff`).
 * Milwaukee (default) omits `toolbox` for a cleaner canonical URL.
 */
export function buildToolsetLandingHref(
  pathname: string,
  currentSearchParams: URLSearchParams,
  toolbox: ToolboxType
): string {
  const params = new URLSearchParams(currentSearchParams.toString());
  if (toolbox === "milwaukee") {
    params.delete(TOOLBOX_QUERY_PARAM);
  } else {
    params.set(TOOLBOX_QUERY_PARAM, toolbox);
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

// `getToolboxTypeFromSlug`, `getToolsetFromSlug` and `filterPrizesByToolboxType` were
// removed with the prize-builder rewrite: `fromPrizeSlug` in prize-builder-model.ts now
// splits a slug into its two lanes, and nothing filters the flat prize list any more.
// (`MajorDrawSection` has always carried its own local copies — it never imported these.)
