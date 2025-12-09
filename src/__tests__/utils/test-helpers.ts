/**
 * Test Helpers
 *
 * Utility functions for testing.
 *
 * @module __tests__/utils/test-helpers
 */

/**
 * Create a mock user object
 */
export function createMockUser(overrides?: Partial<unknown>) {
  return {
    _id: "507f1f77bcf86cd799439011",
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    mobile: "0412345678",
    role: "user",
    entryWallet: 0,
    rewardsPoints: 0,
    ...overrides,
  };
}

/**
 * Create a mock payment intent
 */
export function createMockPaymentIntent(overrides?: Partial<unknown>) {
  return {
    id: "pi_test_123",
    client_secret: "pi_test_123_secret",
    amount: 10000,
    currency: "aud",
    status: "requires_payment_method",
    ...overrides,
  };
}
