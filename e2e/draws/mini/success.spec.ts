import { test, expect } from "../../fixtures/test";

// /mini-draw-success is the post-purchase landing page. It accepts
// payment_intent + payment_intent_client_secret in the query string. Without
// those, PaymentSuccessHandler renders its idle copy but the page still
// renders. This spec validates the static success markup renders for an
// authenticated fresh user without driving a real Stripe walk (out of scope).
test("/mini-draw-success renders success markup", async ({ page }) => {
  await page.goto("/mini-draw-success");

  await expect(
    page.getByRole("heading", { name: /Mini Draw Entry Successful/i }),
  ).toBeVisible({ timeout: 10_000 });

  await expect(page.getByText(/Thank you for your purchase/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /View My Account/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Continue Shopping/i })).toBeVisible();
});
