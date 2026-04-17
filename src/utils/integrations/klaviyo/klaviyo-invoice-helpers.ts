/**
 * Klaviyo Invoice Helpers
 *
 * Helper functions for building invoice data structures.
 * Separates invoice data building logic from business logic for better maintainability.
 *
 * @module utils/integrations/klaviyo/klaviyo-invoice-helpers
 */

import { getPartnerCatalogAccessPercentForPlanId } from "@/utils/partner-discounts/partner-catalog-visibility";

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
 * Purchase data structure for combined invoices
 */
export interface PurchaseData {
  paymentIntentId: string;
  packageId: string;
  packageName: string;
  packageType: "membership" | "one-time" | "mini-draw";
  price: number;
  entries: number;
}

/**
 * Upsell purchase data structure
 */
export interface UpsellPurchaseData {
  paymentIntentId: string;
  offerId: string;
  offerName: string;
  price: number;
  entries: number;
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
 * Build invoice data from package purchase
 *
 * Creates invoice data structure for individual purchases.
 * Used when invoice should be sent immediately (no upsells).
 *
 * @param packageData - Package purchase data
 * @param paymentIntentId - Stripe payment intent ID
 * @returns Complete invoice data structure
 */
export function buildInvoiceData(packageData: PackageData, paymentIntentId: string): InvoiceData {
  const invoiceNumber = generateInvoiceNumber();
  const packageTier = determinePackageTier(packageData.packageId, packageData.packageType);

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
        description: packageData.packageName,
        quantity: 1,
        unit_price: packageData.price,
        total_price: packageData.price,
      },
    ],
  };
}

/**
 * Build combined invoice data (original purchase + optional upsell)
 *
 * Creates invoice data structure for combined invoices.
 * Used when invoice should be sent after upsell decision (combined original + upsell).
 *
 * @param originalPurchase - Original purchase data
 * @param upsellPurchase - Optional upsell purchase data
 * @returns Complete combined invoice data structure
 */
export function buildCombinedInvoiceData(
  originalPurchase: PurchaseData,
  upsellPurchase?: UpsellPurchaseData
): InvoiceData {
  const invoiceNumber = generateInvoiceNumber();
  const packageTier = determinePackageTier(originalPurchase.packageId, originalPurchase.packageType);

  // Build items array starting with original purchase
  const items: InvoiceItem[] = [
    {
      description: originalPurchase.packageName,
      quantity: 1,
      unit_price: originalPurchase.price,
      total_price: originalPurchase.price,
    },
  ];

  // Add upsell item if present
  if (upsellPurchase) {
    items.push({
      description: upsellPurchase.offerName,
      quantity: 1,
      unit_price: upsellPurchase.price,
      total_price: upsellPurchase.price,
    });
  }

  // Calculate totals
  const totalAmount = items.reduce((sum, item) => sum + item.total_price, 0);
  const totalEntries = originalPurchase.entries + (upsellPurchase?.entries || 0);

  return {
    invoiceId: `inv_${originalPurchase.paymentIntentId}`,
    invoiceNumber,
    packageType: originalPurchase.packageType,
    packageId: originalPurchase.packageId,
    packageName: originalPurchase.packageName,
    packageTier,
    partnerDiscountCatalogPercent: getPartnerCatalogAccessPercentForPlanId(originalPurchase.packageId),
    totalAmount,
    paymentIntentId: originalPurchase.paymentIntentId,
    billingReason: originalPurchase.packageType === "membership" ? "subscription_create" : undefined,
    entries_gained: totalEntries,
    items,
  };
}
