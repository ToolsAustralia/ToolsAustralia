/**
 * Payment Types
 *
 * Type definitions for payment-related functionality.
 *
 * @module types/payment
 */

/**
 * Payment status
 */
export type PaymentStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled' | 'requires_action';

/**
 * Package type
 */
export type PackageType = 'one-time' | 'subscription' | 'upsell' | 'mini-draw';

/**
 * Payment metadata
 */
export interface PaymentMetadata {
  created?: number;
  type?: string;
  packageType?: PackageType;
  miniDrawId?: string;
  affiliateCode?: string;
  userId?: string;
  userEmail?: string;
  packageId?: string;
  packageName?: string;
  isUpfrontPayment?: string;
}

/**
 * Payment intent creation options
 */
export interface PaymentIntentOptions {
  amount: number; // Amount in cents
  currency?: string;
  packageId?: string;
  packageName?: string;
  userEmail?: string;
  packageType?: PackageType;
}

