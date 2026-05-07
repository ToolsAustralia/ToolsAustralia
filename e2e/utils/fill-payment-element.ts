// e2e/utils/fill-payment-element.ts
import { Page } from "@playwright/test";

/**
 * Fill the Stripe PaymentElement card form. Stripe renders inside an iframe.
 * Selectors evolve over time — if the test fails, capture the actual iframe
 * structure with `page.pause()` and update.
 */
export async function fillPaymentElementCard(
  page: Page,
  card: { number: string; exp: string; cvc: string; postcode?: string },
) {
  const iframe = page.frameLocator('iframe[name^="__privateStripeFrame"]').first();

  await iframe.locator('input[name="number"]').fill(card.number);
  await iframe.locator('input[name="expiry"]').fill(card.exp);
  await iframe.locator('input[name="cvc"]').fill(card.cvc);
  if (card.postcode) {
    const postal = iframe.locator('input[name="postalCode"]');
    if (await postal.count()) await postal.fill(card.postcode);
  }
}
