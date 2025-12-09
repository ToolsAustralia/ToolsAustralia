/**
 * Subscription Service
 *
 * Handles subscription creation, management, and cancellation.
 * Extracted from API routes for reusability and testability.
 *
 * @module services/payment/SubscriptionService
 */

import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import User from '@/models/User';
import { logger } from '@/utils/logger';
import { PaymentError, NotFoundError, ValidationError } from '@/lib/errors';
import { getPackageById } from '@/data/membershipPackages';

/**
 * Create subscription options
 */
export interface CreateSubscriptionOptions {
  userEmail: string;
  firstName: string;
  lastName: string;
  mobile?: string;
  packageId: string;
  paymentMethodId: string;
  paymentIntentId?: string; // Optional upfront PaymentIntent ID for wallet display
  idempotencyKey?: string; // Idempotency key to prevent duplicate creation
  referralCode?: string;
  userId?: string;
}

/**
 * Create subscription result
 */
export interface CreateSubscriptionResult {
  subscriptionId: string;
  clientSecret: string | null;
  customerId: string;
  userId: string;
  invoiceId?: string;
}

/**
 * Subscription Service class
 */
export class SubscriptionService {
  /**
   * Create or get Stripe customer
   */
  private async getOrCreateCustomer(
    userEmail: string,
    firstName: string,
    lastName: string,
    mobile?: string,
    userId?: string,
    packageId?: string,
    packageName?: string
  ): Promise<Stripe.Customer> {
    try {
      // Check if user exists and has customer
      if (userId) {
        const user = await User.findById(userId);
        if (user?.stripeCustomerId) {
          const customer = await stripe.customers.retrieve(user.stripeCustomerId);
          if (customer && !customer.deleted) {
            return customer as Stripe.Customer;
          }
        }
      }

      // Try to find customer from payment method
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      if (paymentMethod.customer) {
        const customer = await stripe.customers.retrieve(paymentMethod.customer as string);
        if (customer && !customer.deleted) {
          // Update customer details if needed
          const customerWithMetadata = customer as Stripe.Customer;
          if (
            customerWithMetadata.metadata?.type === 'guest' ||
            customerWithMetadata.metadata?.temporary === 'true'
          ) {
            const updatedCustomer = await stripe.customers.update(customer.id, {
              email: userEmail,
              name: `${firstName} ${lastName}`,
              phone: mobile,
              metadata: {
                ...(packageId && { packageId }),
                ...(packageName && { packageName }),
                ...(userId && { userId }),
              },
            });
            return updatedCustomer;
          }
          return customer as Stripe.Customer;
        }
      }

      // Create new customer
      const customer = await stripe.customers.create({
        email: userEmail,
        name: `${firstName} ${lastName}`,
        phone: mobile,
        metadata: {
          ...(packageId && { packageId }),
          ...(packageName && { packageName }),
          ...(userId && { userId }),
        },
      });

      // Update user with customer ID if userId provided
      if (userId) {
        const user = await User.findById(userId);
        if (user) {
          user.stripeCustomerId = customer.id;
          await user.save();
        }
      }

      logger.info('Created Stripe customer for subscription', {
        customerId: customer.id,
        userEmail,
      });

      return customer;
    } catch (error) {
      logger.error('Failed to get or create customer', error, { userEmail });
      throw new PaymentError('Failed to create customer', { originalError: error });
    }
  }

  /**
   * Create a subscription
   */
  async createSubscription(options: CreateSubscriptionOptions): Promise<CreateSubscriptionResult> {
    try {
      const {
        userEmail,
        firstName,
        lastName,
        mobile,
        packageId,
        paymentMethodId,
        paymentIntentId,
        idempotencyKey,
        userId,
      } = options;

      // Validate package
      const membershipPackage = getPackageById(packageId);
      if (!membershipPackage) {
        throw new NotFoundError('Membership package');
      }

      if (membershipPackage.type !== 'subscription') {
        throw new ValidationError('Package must be a subscription type');
      }

      // Get Stripe price ID
      const stripePriceId = membershipPackage.stripePriceId;
      if (!stripePriceId) {
        throw new ValidationError('Package does not have a Stripe price ID');
      }

      // Get or create customer
      const customer = await this.getOrCreateCustomer(
        userEmail,
        firstName,
        lastName,
        mobile,
        userId,
        packageId,
        membershipPackage.name,
        paymentMethodId
      );

      // Attach payment method if not already attached
      try {
        const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
        if (!paymentMethod.customer || paymentMethod.customer !== customer.id) {
          await stripe.paymentMethods.attach(paymentMethodId, {
            customer: customer.id,
          });
          logger.debug('Attached payment method to customer', { paymentMethodId, customerId: customer.id });
        }
      } catch (attachError) {
        logger.warn('Failed to attach payment method (may already be attached)', { error: attachError });
      }

      // Set default payment method
      await stripe.customers.update(customer.id, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      // Create subscription
      const subscriptionParams: Stripe.SubscriptionCreateParams = {
        customer: customer.id,
        items: [
          {
            price: stripePriceId,
          },
        ],
        default_payment_method: paymentMethodId,
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
        description: membershipPackage.name,
        metadata: {
          packageId,
          packageName: membershipPackage.name,
          userEmail,
          ...(userId && { userId }),
        },
      };

      const createOptions: Stripe.RequestOptions = {};
      if (idempotencyKey) {
        createOptions.idempotencyKey = idempotencyKey;
      }

      const subscription = await stripe.subscriptions.create(subscriptionParams, createOptions);

      logger.payment('Subscription created', {
        subscriptionId: subscription.id,
        customerId: customer.id,
        packageId,
      });

      // Extract PaymentIntent from invoice
      let clientSecret: string | null = null;
      const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null;
      if (latestInvoice) {
        const paymentIntent = latestInvoice.payment_intent;
        if (paymentIntent) {
          if (typeof paymentIntent === 'string') {
            const pi = await stripe.paymentIntents.retrieve(paymentIntent);
            clientSecret = pi.client_secret;
          } else {
            clientSecret = paymentIntent.client_secret;
          }
        }
      }

      return {
        subscriptionId: subscription.id,
        clientSecret,
        customerId: customer.id,
        userId: userId || 'guest',
        invoiceId: latestInvoice?.id,
      };
    } catch (error) {
      logger.error('Failed to create subscription', error, options);
      if (error instanceof PaymentError || error instanceof NotFoundError || error instanceof ValidationError) {
        throw error;
      }
      throw new PaymentError('Failed to create subscription', { originalError: error });
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(subscriptionId: string, immediately: boolean = false): Promise<Stripe.Subscription> {
    try {
      if (immediately) {
        const subscription = await stripe.subscriptions.cancel(subscriptionId);
        logger.payment('Subscription cancelled immediately', { subscriptionId });
        return subscription;
      } else {
        const subscription = await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
        });
        logger.payment('Subscription scheduled for cancellation', { subscriptionId });
        return subscription;
      }
    } catch (error) {
      logger.error('Failed to cancel subscription', error, { subscriptionId });
      throw new PaymentError('Failed to cancel subscription', { originalError: error });
    }
  }

  /**
   * Retrieve a subscription
   */
  async retrieveSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      return subscription;
    } catch (error) {
      logger.error('Failed to retrieve subscription', error, { subscriptionId });
      throw new PaymentError('Failed to retrieve subscription', { originalError: error });
    }
  }
}

// Export singleton instance
export const subscriptionService = new SubscriptionService();

