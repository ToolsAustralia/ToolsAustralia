/**
 * Stripe Validation Utilities
 *
 * This module provides validation functions for Stripe integration to ensure
 * proper configuration and prevent common integration errors.
 *
 * Best Practices:
 * - Always validate Product/Price IDs exist before creating subscriptions
 * - Use existing Products/Prices instead of creating duplicates
 * - Fail fast with clear error messages when configuration is missing
 */

import { StaticMembershipPackage } from "@/data/membershipPackages";
import { stripe } from "@/lib/stripe";

/**
 * Validates that a membership package has required Stripe configuration
 *
 * @param membershipPackage - The membership package to validate
 * @returns Object with success status and error message if validation fails
 *
 * @example
 * ```typescript
 * const validation = validateStripeConfiguration(package);
 * if (!validation.success) {
 *   return NextResponse.json({ error: validation.error }, { status: 500 });
 * }
 * ```
 */
export function validateStripeConfiguration(membershipPackage: StaticMembershipPackage): {
  success: boolean;
  error?: string;
} {
  // Only subscription packages need Stripe Product/Price IDs
  // One-time packages use Payment Intents directly
  if (membershipPackage.type !== "subscription") {
    return { success: true };
  }

  if (!membershipPackage.stripePriceId) {
    return {
      success: false,
      error: `Stripe Price ID missing for subscription package: ${membershipPackage.name}`,
    };
  }

  if (!membershipPackage.stripeProductId) {
    return {
      success: false,
      error: `Stripe Product ID missing for subscription package: ${membershipPackage.name}`,
    };
  }

  return { success: true };
}

/**
 * Verifies that a Stripe Price exists in Stripe's system
 *
 * This is useful for additional validation to ensure the configured Price IDs
 * actually exist in your Stripe account.
 *
 * @param priceId - The Stripe Price ID to verify
 * @returns Object with success status and error message if verification fails
 *
 * @example
 * ```typescript
 * const verification = await verifyStripePriceExists(package.stripePriceId);
 * if (!verification.success) {
 *   console.error('Price not found in Stripe:', verification.error);
 * }
 * ```
 */
export async function verifyStripePriceExists(priceId: string): Promise<{
  success: boolean;
  error?: string;
  price?: {
    id: string;
    product: string;
    unit_amount: number | null;
    currency: string;
    recurring: { interval: string } | null;
  };
}> {
  try {
    const price = await stripe.prices.retrieve(priceId);

    // Check if price is active
    if (!price.active) {
      return {
        success: false,
        error: `Stripe Price ${priceId} exists but is not active`,
      };
    }

    return {
      success: true,
      price: {
        id: price.id,
        product: price.product as string,
        unit_amount: price.unit_amount,
        currency: price.currency,
        recurring: price.recurring,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Stripe Price ${priceId} not found: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Verifies that a Stripe Product exists in Stripe's system
 *
 * @param productId - The Stripe Product ID to verify
 * @returns Object with success status and error message if verification fails
 *
 * @example
 * ```typescript
 * const verification = await verifyStripeProductExists(package.stripeProductId);
 * if (!verification.success) {
 *   console.error('Product not found in Stripe:', verification.error);
 * }
 * ```
 */
export async function verifyStripeProductExists(productId: string): Promise<{
  success: boolean;
  error?: string;
  product?: {
    id: string;
    name: string;
    description: string | null;
    active: boolean;
  };
}> {
  try {
    const product = await stripe.products.retrieve(productId);

    // Check if product is active
    if (!product.active) {
      return {
        success: false,
        error: `Stripe Product ${productId} exists but is not active`,
      };
    }

    return {
      success: true,
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        active: product.active,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Stripe Product ${productId} not found: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Validates complete Stripe configuration for a subscription package
 * including verification that Products/Prices exist in Stripe
 *
 * @param membershipPackage - The membership package to validate
 * @returns Object with success status and detailed error message if validation fails
 *
 * @example
 * ```typescript
 * const validation = await validateCompleteStripeSetup(package);
 * if (!validation.success) {
 *   console.error('Stripe setup invalid:', validation.error);
 *   return NextResponse.json({ error: validation.error }, { status: 500 });
 * }
 * ```
 */
export async function validateCompleteStripeSetup(membershipPackage: StaticMembershipPackage): Promise<{
  success: boolean;
  error?: string;
}> {
  // First check if configuration exists
  const configValidation = validateStripeConfiguration(membershipPackage);
  if (!configValidation.success) {
    return configValidation;
  }

  // Skip further validation for non-subscription packages
  if (membershipPackage.type !== "subscription") {
    return { success: true };
  }

  // Verify Product exists in Stripe
  if (membershipPackage.stripeProductId) {
    const productVerification = await verifyStripeProductExists(membershipPackage.stripeProductId);
    if (!productVerification.success) {
      return {
        success: false,
        error: `${membershipPackage.name}: ${productVerification.error}`,
      };
    }
  }

  // Verify Price exists in Stripe
  if (membershipPackage.stripePriceId) {
    const priceVerification = await verifyStripePriceExists(membershipPackage.stripePriceId);
    if (!priceVerification.success) {
      return {
        success: false,
        error: `${membershipPackage.name}: ${priceVerification.error}`,
      };
    }
  }

  return { success: true };
}

/**
 * Helper function to get error response for missing Stripe configuration
 *
 * @param packageName - Name of the package with missing configuration
 * @returns Standardized error message
 */
export function getStripeConfigurationErrorMessage(packageName: string): string {
  return `Stripe configuration missing for ${packageName}. Please contact support.`;
}
