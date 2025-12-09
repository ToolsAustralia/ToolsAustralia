/**
 * Payment Method Service
 *
 * Handles payment method management (attach, detach, list, set default).
 * Extracted from API routes for reusability and testability.
 *
 * @module services/payment/PaymentMethodService
 */

import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import User from '@/models/User';
import { logger } from '@/utils/logger';
import { PaymentError, NotFoundError } from '@/lib/errors';

/**
 * Payment Method Service class
 */
export class PaymentMethodService {
  /**
   * Attach payment method to customer
   */
  async attachPaymentMethod(paymentMethodId: string, customerId: string): Promise<Stripe.PaymentMethod> {
    try {
      const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });

      logger.payment('Payment method attached to customer', {
        paymentMethodId,
        customerId,
      });

      return paymentMethod;
    } catch (error) {
      logger.error('Failed to attach payment method', error, { paymentMethodId, customerId });
      throw new PaymentError('Failed to attach payment method', { originalError: error });
    }
  }

  /**
   * Detach payment method from customer
   */
  async detachPaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
    try {
      const paymentMethod = await stripe.paymentMethods.detach(paymentMethodId);

      logger.payment('Payment method detached', { paymentMethodId });

      return paymentMethod;
    } catch (error) {
      logger.error('Failed to detach payment method', error, { paymentMethodId });
      throw new PaymentError('Failed to detach payment method', { originalError: error });
    }
  }

  /**
   * List payment methods for a customer
   */
  async listPaymentMethods(customerId: string): Promise<Stripe.PaymentMethod[]> {
    try {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });

      logger.debug('Retrieved payment methods for customer', {
        customerId,
        count: paymentMethods.data.length,
      });

      return paymentMethods.data;
    } catch (error) {
      logger.error('Failed to list payment methods', error, { customerId });
      throw new PaymentError('Failed to retrieve payment methods', { originalError: error });
    }
  }

  /**
   * Set default payment method for customer
   */
  async setDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<void> {
    try {
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      logger.payment('Default payment method set', { customerId, paymentMethodId });
    } catch (error) {
      logger.error('Failed to set default payment method', error, { customerId, paymentMethodId });
      throw new PaymentError('Failed to set default payment method', { originalError: error });
    }
  }

  /**
   * Retrieve payment method
   */
  async retrievePaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
    try {
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      return paymentMethod;
    } catch (error) {
      logger.error('Failed to retrieve payment method', error, { paymentMethodId });
      throw new PaymentError('Failed to retrieve payment method', { originalError: error });
    }
  }

  /**
   * Get saved payment methods for a user
   */
  async getSavedPaymentMethods(userId: string): Promise<Stripe.PaymentMethod[]> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User');
      }

      if (!user.stripeCustomerId) {
        return [];
      }

      return await this.listPaymentMethods(user.stripeCustomerId);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error('Failed to get saved payment methods', error, { userId });
      throw new PaymentError('Failed to retrieve saved payment methods', { originalError: error });
    }
  }
}

// Export singleton instance
export const paymentMethodService = new PaymentMethodService();

