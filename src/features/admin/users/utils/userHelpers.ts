/**
 * Helper functions for user-related operations
 * Extracted from components to maintain separation of concerns
 */

import type { StaticImageData } from "next/image";
import apprentice from "../../../../public/images/packageIcons/apprentice.png";
import tradie from "../../../../public/images/packageIcons/tradie.png";
import foreman from "../../../../public/images/packageIcons/foreman.png";
import boss from "../../../../public/images/packageIcons/boss.png";
import power from "../../../../public/images/packageIcons/power.png";

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
 */
export function getPackageIconImage(packageName?: string | null): StaticImageData | null {
  if (!packageName) return null;
  const lowerName = packageName.toLowerCase();

  if (lowerName.includes("boss")) return boss;
  if (lowerName.includes("foreman")) return foreman;
  if (lowerName.includes("tradie")) return tradie;
  if (lowerName.includes("apprentice")) return apprentice;
  if (lowerName.includes("power")) return power;

  return null;
}

/**
 * Get package color scheme based on package name
 */
export function getPackageColorScheme(packageName?: string | null): {
  gradient: string;
  text: string;
  border: string;
} | null {
  if (!packageName) return null;
  const lowerName = packageName.toLowerCase();

  if (lowerName.includes("apprentice")) {
    return {
      gradient: "from-gray-300 via-slate-400 to-gray-500",
      text: "text-gray-300",
      border: "border-gray-400/40",
    };
  } else if (lowerName.includes("tradie")) {
    return {
      gradient: "from-blue-500 via-blue-600 to-blue-700",
      text: "text-blue-400",
      border: "border-blue-500/50",
    };
  } else if (lowerName.includes("foreman")) {
    return {
      gradient: "from-green-500 via-green-600 to-green-700",
      text: "text-green-300",
      border: "border-green-500/50",
    };
  } else if (lowerName.includes("boss")) {
    return {
      gradient: "from-yellow-400 via-amber-500 to-yellow-600",
      text: "text-yellow-400",
      border: "border-yellow-400/50",
    };
  } else if (lowerName.includes("power")) {
    return {
      gradient: "from-orange-600 via-red-500 to-orange-700",
      text: "text-orange-400",
      border: "border-orange-500/50",
    };
  }

  // Default fallback
  return {
    gradient: "from-slate-600 via-gray-700 to-slate-800",
    text: "text-gray-400",
    border: "border-gray-500/50",
  };
}

/**
 * Extract gradient color for border styling
 */
export function getGradientColor(gradient: string): string {
  if (gradient.includes("yellow-3") || gradient.includes("yellow-4")) return "#facc15";
  if (gradient.includes("blue")) return "#3b82f6";
  if (gradient.includes("purple")) return "#9333ea";
  if (gradient.includes("orange")) return "#f97316";
  if (gradient.includes("yellow-4") && gradient.includes("amber")) return "#fbbf24";
  if (gradient.includes("gray-300") || gradient.includes("slate-400")) return "#94a3b8"; // Silver
  if (gradient.includes("blue-500") || gradient.includes("blue-600")) return "#3b82f6"; // Blue
  if (gradient.includes("green-500") || gradient.includes("green-600")) return "#22c55e"; // Green
  return "#6b7280";
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
      className: "px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200",
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



