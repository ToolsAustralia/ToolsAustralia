/**
 * Prize selection utilities - slug parsing and filtering.
 * Shared between ToolboxSelector, PowerToolsetCarousel, and PrizeShowcase.
 */

import type { PrizeCatalogEntry } from "@/config/prizes";
import type { ToolboxType } from "./constants";

/** Get toolbox type from prize slug */
export function getToolboxTypeFromSlug(slug: string): ToolboxType {
  if (slug === "cash-prize") return "cash";
  if (
    (slug.startsWith("milwaukee-") || slug.endsWith("-milwaukee")) &&
    !slug.includes("sidchrome")
  ) {
    return "milwaukee";
  }
  if (slug.includes("sidchrome")) return "sidchrome";
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
    return prizes.filter((p) => p.slug.includes("sidchrome"));
  }
  if (toolboxType === "milwaukee") {
    return prizes.filter(
      (p) => p.slug.includes("milwaukee") && !p.slug.includes("sidchrome")
    );
  }
  return prizes;
}
