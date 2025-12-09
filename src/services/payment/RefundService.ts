/**
 * Refund Service
 *
 * Handles refund processing and benefit reversal.
 * Extracted from API routes for reusability and testability.
 *
 * @module services/payment/RefundService
 */

import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { logger } from '@/utils/logger';
import { PaymentError } from '@/lib/errors';
import { reversePaymentBenefits } from '@/utils/payment/refund-processing';

/**
 * Refund options
 */
export interface RefundOptions {
  paymentIntentId: string;
  amount?: number; // Partial refund amount in cents
  reason?: Stripe.RefundCreateParams.Reason;
}

/**
 * Refund Service class
 */
export class RefundService {
  /**
   * Create a refund
   */
  async createRefund(options: RefundOptions): Promise<Stripe.Refund> {
    try {
      const { paymentIntentId, amount, reason } = options;

      const refundParams: Stripe.RefundCreateParams = {
        payment_intent: paymentIntentId,
        ...(amount && { amount }),
        ...(reason && { reason }),
      };

      const refund = await stripe.refunds.create(refundParams);

      logger.payment('Refund created', {
        refundId: refund.id,
        paymentIntentId,
        amount: refund.amount,
      });

      return refund;
    } catch (error) {
      logger.error('Failed to create refund', error, options);
      throw new PaymentError('Failed to create refund', { originalError: error });
    }
  }

  /**
   * Process refund and reverse benefits
   */
  async processRefund(options: RefundOptions): Promise<{ refund: Stripe.Refund; benefitsReversed: boolean }> {
    try {
      // Create refund in Stripe
      const refund = await this.createRefund(options);

      // Reverse benefits (non-blocking)
      let benefitsReversed = false;
      try {
        await reversePaymentBenefits(options.paymentIntentId);
        benefitsReversed = true;
        logger.info('Benefits reversed for refund', { paymentIntentId: options.paymentIntentId });
      } catch (reverseError) {
        logger.error('Failed to reverse benefits (non-blocking)', reverseError, {
          paymentIntentId: options.paymentIntentId,
        });
        // Continue - refund was successful even if benefit reversal failed
      }

      return { refund, benefitsReversed };
    } catch (error) {
      logger.error('Failed to process refund', error, options);
      throw error;
    }
  }

  /**
   * Retrieve a refund
   */
  async retrieveRefund(refundId: string): Promise<Stripe.Refund> {
    try {
      const refund = await stripe.refunds.retrieve(refundId);
      return refund;
    } catch (error) {
      logger.error('Failed to retrieve refund', error, { refundId });
      throw new PaymentError('Failed to retrieve refund', { originalError: error });
    }
  }

  /**
   * List refunds for a payment intent
   */
  async listRefunds(paymentIntentId: string): Promise<Stripe.Refund[]> {
    try {
      const refunds = await stripe.refunds.list({
        payment_intent: paymentIntentId,
      });

      logger.debug('Retrieved refunds for payment intent', {
        paymentIntentId,
        count: refunds.data.length,
      });

      return refunds.data;
    } catch (error) {
      logger.error('Failed to list refunds', error, { paymentIntentId });
      throw new PaymentError('Failed to retrieve refunds', { originalError: error });
    }
  }
}

// Export singleton instance
export const refundService = new RefundService();

