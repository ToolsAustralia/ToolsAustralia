// e2e/utils/stripe-test-cards.ts
export const STRIPE_TEST_CARDS = {
  SUCCESS: { number: "4242 4242 4242 4242", exp: "12/34", cvc: "123", postcode: "3000" },
  REQUIRES_3DS: { number: "4000 0027 6000 3184", exp: "12/34", cvc: "123", postcode: "3000" },
  DECLINED: { number: "4000 0000 0000 0002", exp: "12/34", cvc: "123", postcode: "3000" },
  INSUFFICIENT_FUNDS: { number: "4000 0000 0000 9995", exp: "12/34", cvc: "123", postcode: "3000" },
} as const;
