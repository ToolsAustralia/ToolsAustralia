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

/**
 * Get subscription status badge configuration
 */
export function getSubscriptionBadgeConfig(subscription?: { isActive?: boolean } | null): {
  label: string;
  className: string;
} {
  if (!subscription) {
    return {
      label: "No Subscription",
      className: "px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 dark:text-neutral-200 border border-gray-200",
    };
  }

  if (subscription.isActive) {
    return {
      label: "Active",
      className:
        "px-2 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200",
    };
  }

  return {
    label: "Inactive",
    className: "px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200",
  };
}

/**
 * Get user status badge configuration
 */
export function getUserStatusBadgeConfig(isActive: boolean): { label: string; className: string } {
  if (isActive) {
    return {
      label: "Active",
      className: "px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200",
    };
  }

  return {
    label: "Inactive",
    className: "px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200",
  };
}
