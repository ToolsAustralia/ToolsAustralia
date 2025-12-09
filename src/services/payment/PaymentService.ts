/**
 * Payment Service
 *
 * Handles PaymentIntent creation and management.
 * Extracted from API routes for reusability and testability.
 *
 * @module services/payment/PaymentService
 */

import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import User from '@/models/User';
import { logger } from '@/utils/logger';
import { PaymentError } from '@/lib/errors';
import { env } from '@/config/env';
import { PAYMENT } from '@/constants';

/**
 * PaymentIntent creation options
 */
export interface CreatePaymentIntentOptions {
  amount: number; // Amount in cents
  currency?: string;
  packageId?: string;
  packageName?: string;
  userEmail?: string;
  packageType?: 'one-time' | 'subscription';
  userId?: string;
  stripeCustomerId?: string;
}

/**
 * PaymentIntent creation result
 */
export interface CreatePaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
}

/**
 * Payment Service class
 */
export class PaymentService {
  /**
   * Get or create Stripe customer for a user
   */
  async getOrCreateCustomer(
    userId: string,
    email: string,
    firstName?: string,
    lastName?: string,
    mobile?: string
  ): Promise<string> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new PaymentError('User not found');
      }

      // Return existing customer ID if available
      if (user.stripeCustomerId) {
        return user.stripeCustomerId;
      }

      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email,
        name: firstName && lastName ? `${firstName} ${lastName}` : undefined,
        phone: mobile || undefined,
        metadata: {
          userId: user._id.toString(),
        },
      });

      // Update user with Stripe customer ID
      user.stripeCustomerId = customer.id;
      await user.save();

      logger.info('Created Stripe customer', {
        customerId: customer.id,
        userId,
      });

      return customer.id;
    } catch (error) {
      logger.error('Failed to get or create Stripe customer', error, { userId });
      throw new PaymentError('Failed to create customer', { originalError: error });
    }
  }

  /**
   * Find customer by email (for registered users)
   */
  async findCustomerByEmail(email: string): Promise<{ customerId?: string; userId?: string } | null> {
    try {
      const user = await User.findOne({ email: email.toLowerCase() });
      if (user?.stripeCustomerId) {
        return {
          customerId: user.stripeCustomerId,
          userId: user._id.toString(),
        };
      }
      return null;
    } catch (error) {
      logger.error('Failed to find customer by email', error, { email });
      return null;
    }
  }

  /**
   * Create a PaymentIntent
   */
  async createPaymentIntent(options: CreatePaymentIntentOptions): Promise<CreatePaymentIntentResult> {
    try {
      const {
        amount,
        currency = PAYMENT.CURRENCY.toLowerCase(),
        packageId,
        packageName,
        userEmail,
        packageType = 'one-time',
        userId,
        stripeCustomerId,
      } = options;

      // Validate amount
      if (amount < PAYMENT.MIN_AMOUNT_CENTS) {
        throw new PaymentError(`Amount must be at least ${PAYMENT.MIN_AMOUNT_CENTS / 100}`);
      }

      if (amount > PAYMENT.MAX_AMOUNT_CENTS) {
        throw new PaymentError(`Amount must not exceed ${PAYMENT.MAX_AMOUNT_CENTS / 100}`);
      }

      // Determine customer ID
      let customerId: string | undefined = stripeCustomerId;

      if (!customerId && userId) {
        // Get or create customer for authenticated user
        const user = await User.findById(userId);
        if (user) {
          customerId = await this.getOrCreateCustomer(
            userId,
            user.email,
            user.firstName,
            user.lastName,
            user.mobile || undefined
          );
        }
      } else if (!customerId && userEmail) {
        // Try to find customer for registered user
        const customerData = await this.findCustomerByEmail(userEmail);
        if (customerData?.customerId) {
          customerId = customerData.customerId;
          if (customerData.userId) {
            userId = customerData.userId;
          }
        }
      }

      // Create PaymentIntent
      const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
        amount,
        currency,
        ...(customerId && { customer: customerId }),
        setup_future_usage: 'off_session',
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never', // PCI-COMPLIANT: Disable redirects for security
        },
        ...(packageType === 'subscription' && { capture_method: 'manual' }), // Manual capture for subscriptions
        ...(packageName && { description: packageName }),
        metadata: {
          userId: userId || 'guest',
          userEmail: userEmail || 'guest',
          type: packageType,
          packageType: packageType,
          ...(packageType === 'subscription' && { isUpfrontPayment: 'true' }),
          ...(packageId && { packageId }),
          ...(packageName && { packageName }),
        },
      };

      const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

      logger.payment('PaymentIntent created', {
        paymentIntentId: paymentIntent.id,
        amount,
        currency,
        packageType,
        customerId,
      });

      return {
        clientSecret: paymentIntent.client_secret!,
        paymentIntentId: paymentIntent.id,
      };
    } catch (error) {
      logger.error('Failed to create PaymentIntent', error, options);
      if (error instanceof PaymentError) {
        throw error;
      }
      throw new PaymentError('Failed to create payment intent', { originalError: error });
    }
  }

  /**
   * Retrieve a PaymentIntent
   */
  async retrievePaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      return paymentIntent;
    } catch (error) {
      logger.error('Failed to retrieve PaymentIntent', error, { paymentIntentId });
      throw new PaymentError('Failed to retrieve payment intent', { originalError: error });
    }
  }

  /**
   * Cancel a PaymentIntent
   */
  async cancelPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    try {
      const paymentIntent = await stripe.paymentIntents.cancel(paymentIntentId);
      logger.payment('PaymentIntent cancelled', { paymentIntentId });
      return paymentIntent;
    } catch (error) {
      logger.error('Failed to cancel PaymentIntent', error, { paymentIntentId });
      throw new PaymentError('Failed to cancel payment intent', { originalError: error });
    }
  }

  /**
   * Confirm a PaymentIntent
   */
  async confirmPaymentIntent(
    paymentIntentId: string,
    paymentMethodId?: string
  ): Promise<Stripe.PaymentIntent> {
    try {
      const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
        ...(paymentMethodId && { payment_method: paymentMethodId }),
      });
      logger.payment('PaymentIntent confirmed', { paymentIntentId });
      return paymentIntent;
    } catch (error) {
      logger.error('Failed to confirm PaymentIntent', error, { paymentIntentId });
      throw new PaymentError('Failed to confirm payment intent', { originalError: error });
    }
  }
}

// Export singleton instance
export const paymentService = new PaymentService();

