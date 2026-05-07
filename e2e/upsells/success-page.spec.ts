// e2e/upsells/success-page.spec.ts
//
// Direct nav to /upsell-success — the page renders the static success
// confirmation copy regardless of payment_intent params (those drive the
// PaymentSuccessHandler polling logic, which gracefully shows fallback
// content when no PI is supplied).

import { test, expect } from "../fixtures/test";

test("/upsell-success renders the confirmation page", async ({ page }) => {
  await page.goto("/upsell-success");

  await expect(page.getByRole("heading", { name: /Upsell Purchase Successful/i })).toBeVisible({
    timeout: 10_000,
  });

  // CTA back to my-account is rendered inside PaymentSuccessHandler children.
  await expect(page.getByRole("link", { name: /View My Account/i })).toBeVisible();
});
