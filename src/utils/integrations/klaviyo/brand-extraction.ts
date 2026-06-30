/**
 * Brand Extraction Utility
 *
 * Extracts brand name from promotion slug for Klaviyo segmentation.
 * Handles all valid promotion slugs and defaults to "milwaukee" for unknown slugs.
 *
 * @module utils/integrations/klaviyo/brand-extraction
 */

import { getAllBrandKeys } from "@/config/brand-theme";

/**
 * Extract brand name from promotion slug
 *
 * Examples:
 * - "milwaukee-sidchrome" → "milwaukee"
 * - "dewalt-sidchrome" → "dewalt"
 * - "makita-sidchrome" → "makita"
 * - "ryobi-sidchrome" → "ryobi"
 * - "ryobi-milwaukee" → "ryobi"
 * - "hikoki-sidchrome" → "hikoki"
 * - "cash-prize" → "milwaukee" (default)
 * - "unknown-slug" → "milwaukee" (default)
 *
 * @param slug - Promotion slug (e.g., "milwaukee-sidchrome", "dewalt-milwaukee", "ryobi-sidchrome")
 * @returns Lowercase brand name (e.g., "milwaukee", "dewalt", "makita", "ryobi", "hikoki")
 */
export function extractBrandFromSlug(slug: string | null | undefined): string {
  // Default brand is milwaukee
  const defaultBrand = "milwaukee";

  // If no slug provided, default to milwaukee
  if (!slug || typeof slug !== "string") {
    return defaultBrand;
  }

  const normalizedSlug = slug.toLowerCase().trim();

  // Handle cash-prize and empty slugs - default to milwaukee
  if (normalizedSlug === "cash-prize" || normalizedSlug === "") {
    return defaultBrand;
  }

  // Extract brand from slug format: "brand-sidchrome", "brand-milwaukee", or "brand-other"
  // Split by hyphen and take the first part (e.g., "milwaukee-milwaukee" → "milwaukee")
  const parts = normalizedSlug.split("-");
  const brand = parts[0];

  // Validate the extracted brand against the canonical brand set.
  // Source of truth: getAllBrandKeys() (src/config/brand-theme.ts) — deriving here keeps
  // Klaviyo brand attribution in lockstep when a brand is added. This was previously a
  // hardcoded 4-brand list that silently mis-attributed every "hikoki-*" slug to "milwaukee".
  const validBrands: string[] = getAllBrandKeys();
  if (validBrands.includes(brand)) {
    return brand;
  }

  // If brand is not recognized, default to milwaukee
  return defaultBrand;
}
