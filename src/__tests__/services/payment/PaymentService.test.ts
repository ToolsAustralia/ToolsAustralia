/**
 * PaymentService Tests
 *
 * Example test file demonstrating testing patterns.
 *
 * @module __tests__/services/payment/PaymentService.test
 */

import { PaymentService } from '@/services/payment/PaymentService';
import { createMockPaymentIntent } from '../../utils/test-helpers';

// Mock Stripe
jest.mock('@/lib/stripe', () => ({
  stripe: {
    paymentIntents: {
      create: jest.fn(),
      retrieve: jest.fn(),
      cancel: jest.fn(),
    },
    customers: {
      create: jest.fn(),
    },
  },
}));

describe('PaymentService', () => {
  let paymentService: PaymentService;

  beforeEach(() => {
    paymentService = new PaymentService();
    jest.clearAllMocks();
  });

  describe('createPaymentIntent', () => {
    it('should create a payment intent successfully', async () => {
      const mockPaymentIntent = createMockPaymentIntent();
      const { stripe } = require('@/lib/stripe');
      stripe.paymentIntents.create.mockResolvedValue(mockPaymentIntent);

      const result = await paymentService.createPaymentIntent({
        amount: 10000,
        currency: 'aud',
        packageType: 'one-time',
      });

      expect(result.clientSecret).toBe(mockPaymentIntent.client_secret);
      expect(result.paymentIntentId).toBe(mockPaymentIntent.id);
    });
  });
});

