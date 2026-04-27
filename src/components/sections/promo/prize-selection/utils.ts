/**
 * Prize selection utilities - slug parsing and filtering.
 * Shared between ToolboxSelector, PowerToolsetCarousel, and PrizeShowcase.
 */

import type { PrizeCatalogEntry } from "@/config/prizes";
import type { ToolboxType } from "./constants";

/** Query key for toolset promo landing pages (`/promotions/makita` etc.) — persists toolbox/cash selection on refresh. */
export const TOOLBOX_QUERY_PARAM = "toolbox";

const VALID_TOOLBOX_QUERY_VALUES = new Set<string>(["cash", "kincrome", "milwaukee", "sidchrome"]);

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

/**
 * Navigate between `/promotions/{toolset}` pages while preserving the full query string (aff, toolbox, etc.).
 */
export function buildPromotionsToolsetLandingHref(
  toolsetSlug: string,
  currentSearchParams: URLSearchParams
): string {
  const params = new URLSearchParams(currentSearchParams.toString());
  const qs = params.toString();
  const base = `/promotions/${toolsetSlug}`;
  return qs ? `${base}?${qs}` : base;
}

/** Get toolbox type from prize slug */
export function getToolboxTypeFromSlug(slug: string): ToolboxType {
  if (slug === "cash-prize") return "cash";
  const lower = slug.toLowerCase();
  if (lower.endsWith("-sidchrome")) return "sidchrome";
  if (lower.endsWith("-kincrome")) return "kincrome";
  if (lower.endsWith("-milwaukee")) return "milwaukee";
  return "sidchrome";
}

/** Get toolset (power toolset brand) from slug. Format: "{toolset}-{toolbox}" */
export function getToolsetFromSlug(slug: string): string | null {
  if (!slug || slug === "cash-prize") return null;
  const toolset = slug.split("-")[0];
  return toolset || null;
}

/** Filter prizes by toolbox type */
export function filterPrizesByToolboxType(
  prizes: PrizeCatalogEntry[],
  toolboxType: ToolboxType
): PrizeCatalogEntry[] {
  if (toolboxType === "cash") {
    return prizes.filter((p) => p.slug === "cash-prize");
  }
  if (toolboxType === "sidchrome") {
    return prizes.filter((p) => p.slug.endsWith("-sidchrome"));
  }
  if (toolboxType === "kincrome") {
    return prizes.filter((p) => p.slug.endsWith("-kincrome"));
  }
  if (toolboxType === "milwaukee") {
    return prizes.filter((p) => p.slug.endsWith("-milwaukee"));
  }
  return prizes;
}
