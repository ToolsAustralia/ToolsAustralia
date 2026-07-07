/**
 * Klaviyo Invoice Helpers
 *
 * Helper functions for building invoice data structures.
 * Separates invoice data building logic from business logic for better maintainability.
 *
 * @module utils/integrations/klaviyo/klaviyo-invoice-helpers
 */

import { getPartnerCatalogAccessPercentForPlanId } from "@/utils/partner-discounts/partner-catalog-visibility";
import { getReceiptLabelByPackageId } from "@/utils/membership/getReceiptLabel";
import { getPackageById } from "@/data/membershipPackages";
import { getMiniDrawPackageById } from "@/data/miniDrawPackages";

export type PackageType = "membership" | "one-time" | "mini-draw" | "upsell";

/**
 * Invoice item structure
 */
export interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

/**
 * Invoice data structure for individual invoices
 */
export interface InvoiceData {
  invoiceId: string;
  invoiceNumber: string;
  packageType: PackageType;
  packageId: string;
  packageName: string;
  packageTier?: string;
  /** Partner catalog access % for the primary line item (Klaviyo transactional templates). */
  partnerDiscountCatalogPercent?: number;
  totalAmount: number;
  paymentIntentId: string;
  billingReason?: string;
  entries_gained: number;
  items: InvoiceItem[];
}

/**
 * Package data structure for building invoices
 */
export interface PackageData {
  packageType: PackageType;
  packageId: string;
  packageName: string;
  price: number;
  entries: number;
  points?: number;
}

/**
 * Generate unique invoice number
 *
 * Format: INV-{timestamp}-{random4chars}
 * Example: INV-1704067200000-A3B2
 *
 * @returns Unique invoice number string
 */
export function generateInvoiceNumber(): string {
  return `INV-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
}

/**
 * Determine package tier for subscriptions
 *
 * Extracts tier information from package ID based on naming conventions.
 * Used for subscription packages to identify tier (Boss, Foreman, Tradie, etc.)
 *
 * @param packageId - Package ID to analyze
 * @param packageType - Type of package (must be "membership" to return tier)
 * @returns Package tier string or undefined if not a membership or tier not found
 */
export function determinePackageTier(packageId: string, packageType: PackageType): string | undefined {
  if (packageType !== "membership") {
    return undefined;
  }

  const packageIdLower = packageId.toLowerCase();

  if (packageIdLower.includes("boss")) {
    return "Boss";
  } else if (packageIdLower.includes("foreman")) {
    return "Foreman";
  } else if (packageIdLower.includes("tradie")) {
    return "Tradie";
  }

  return undefined;
}

/**
 * Build invoice data for a single charge (one line item).
 *
 * @param packageData - Package purchase data
 * @param paymentIntentId - Stripe payment intent ID
 * @returns Complete invoice data structure
 */
export function buildInvoiceData(packageData: PackageData, paymentIntentId: string): InvoiceData {
  const invoiceNumber = generateInvoiceNumber();
  const packageTier = determinePackageTier(packageData.packageId, packageData.packageType);

  // Receipt line-item label. Upsell offer ids (e.g. "membership-upsell-boss") live in
  // upsellPackages.ts, not the membership/mini catalogs, so getReceiptLabelByPackageId would
  // fall back to the raw id — use the clean offer name instead. Membership / one-time / mini
  // resolve to their catalog label (which adds disambiguating "(Member)"/"(Mini Draw)" suffixes).
  const itemDescription =
    packageData.packageType === "upsell"
      ? packageData.packageName
      : getReceiptLabelByPackageId(packageData.packageId, { membership: getPackageById, mini: getMiniDrawPackageById });

  return {
    invoiceId: `inv_${paymentIntentId}`,
    invoiceNumber,
    packageType: packageData.packageType,
    packageId: packageData.packageId,
    packageName: packageData.packageName,
    packageTier,
    partnerDiscountCatalogPercent: getPartnerCatalogAccessPercentForPlanId(packageData.packageId),
    totalAmount: packageData.price,
    paymentIntentId,
    billingReason: packageData.packageType === "membership" ? "subscription_create" : undefined,
    entries_gained: packageData.entries,
    items: [
      {
        description: itemDescription,
        quantity: 1,
        unit_price: packageData.price,
        total_price: packageData.price,
      },
    ],
  };
}
