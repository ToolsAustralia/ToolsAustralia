/**
 * Brand Extraction Utility
 *
 * Extracts brand name from promotion slug for Klaviyo segmentation.
 * Handles all valid promotion slugs and defaults to "milwaukee" for unknown slugs.
 *
 * @module utils/integrations/klaviyo/brand-extraction
 */

import { DEFAULT_PRIZE_SLUG } from "@/config/prizes";

/**
 * Extract brand name from promotion slug
 *
 * Examples:
 * - "milwaukee-sidchrome" → "milwaukee"
 * - "dewalt-sidchrome" → "dewalt"
 * - "makita-sidchrome" → "makita"
 * - "milwaukee-milwaukee" → "milwaukee"
 * - "dewalt-milwaukee" → "dewalt"
 * - "makita-milwaukee" → "makita"
 * - "cash-prize" → "milwaukee" (default)
 * - "unknown-slug" → "milwaukee" (default)
 *
 * @param slug - Promotion slug (e.g., "milwaukee-sidchrome", "dewalt-milwaukee")
 * @returns Lowercase brand name (e.g., "milwaukee", "dewalt", "makita")
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

  // Validate that we extracted a valid brand
  // Known brands: milwaukee, dewalt, makita
  const validBrands = ["milwaukee", "dewalt", "makita"];
  if (validBrands.includes(brand)) {
    return brand;
  }

  // If brand is not recognized, default to milwaukee
  return defaultBrand;
}
