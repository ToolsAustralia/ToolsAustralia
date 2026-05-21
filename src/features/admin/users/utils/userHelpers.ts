/**
 * Helper functions for user-related operations
 * Extracted from components to maintain separation of concerns
 */

import type { StaticImageData } from "next/image";
import { getPackageIconByName } from "@/utils/images/package-icons";

/**
 * Format currency amount to AUD format
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(amount);
}

/**
 * Format date to readable format
 */
export function formatDate(dateString: string | Date): string {
  return new Date(dateString).toLocaleDateString("en-AU", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Get package icon image based on package name
 * Uses centralized utility for consistency
 */
export function getPackageIconImage(packageName?: string | null): StaticImageData | null {
  if (!packageName) return null;
  // Try subscription first, then one-time as fallback
  return getPackageIconByName(packageName, "subscription") || getPackageIconByName(packageName, "one-time");
}

import { getPackageColorScheme as getSharedPackageColorScheme, getGradientColor as getSharedGradientColor } from "@/utils/package-colors/packageColorScheme";

/**
 * Get package color scheme based on package name (admin/partner context - returns gradient, text, border)
 */
export function getPackageColorScheme(packageName?: string | null): {
  gradient: string;
  text: string;
  border: string;
} | null {
  if (!packageName) return null;
  const scheme = getSharedPackageColorScheme(packageName);
  return {
    gradient: scheme.gradient,
    text: scheme.text,
    border: scheme.border,
  };
}

/**
 * Extract gradient color for border styling (re-exports shared util)
 */
export function getGradientColor(gradient: string): string {
  return getSharedGradientColor(gradient);
}
