import { test, expect } from "../../fixtures/test";
import { CARDS, fillPaymentElement, findBenefitsGrantedRef, purchaseIdentity, waitForOneTimeEntries } from "../../helpers/payment";
import { benefitsGrantedCount, disconnectE2eDb } from "../../helpers/db";

test.afterAll(async () => {
  await disconnectE2eDb();
});

test.describe("one-time pack purchase @purchase", () => {
  test("guest buys Apprentice Pack: payment → webhook → entries exactly once", async ({ page }) => {
    // See purchase-subscription.spec.ts's identical note: generous budget for
    // full 3-project concurrent runs against one `next dev` server.
    test.setTimeout(300_000);
    const { email, mobile } = purchaseIdentity("onetime", test.info());

    // The public one-time pack ladder lives in the "Not subscribing?" drawer
    // (MembershipOneTimePacks.tsx), nested inside MembershipTierChooser, collapsed
    // by default. Its whole card is one clickable <button> (no separate CTA label —
    // ctaLabelFor/"Enter Now" is only used by the subscription tier cards); the
    // cheapest public pack (Apprentice Pack, $25 → 3 free entries) is used here for
    // the fastest real Stripe charge.
    await page.goto("/membership");
    await page.getByRole("button", { name: /show one-time pack catalogue/i }).click();
    await page.getByRole("button", { name: /apprentice pack/i }).click();

    await page.locator('input[name="firstName"]').fill("E2E");
    await page.locator('input[name="lastName"]').fill("OneTime");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="phone"]').fill(mobile);
    await page.getByRole("button", { name: /register/i }).click();

    const purchaseButton = page.getByRole("button", { name: /^purchase$/i });
    await expect(purchaseButton).toBeVisible({ timeout: 45_000 });
    await fillPaymentElement(page, CARDS.ok);
    await expect(purchaseButton).toBeEnabled({ timeout: 30_000 });
    await purchaseButton.click();

    // Outcome asserted at the DATABASE (spec §9) — a one-time pack never sets
    // subscription.status, so this polls entries directly rather than membership state.
    const { userId, entries } = await waitForOneTimeEntries(email, 180_000);
    expect(entries).toBe(3); // Apprentice Pack: 3 free entries (membershipPackages.ts totalEntries: 3)

    // Exactly-once: precisely one BenefitsGranted event exists for this user's payment intent.
    // Doc shape verified live: one-time grants on payment_intent.succeeded with
    // _id "BenefitsGranted-<stripe payment intent id>" (handleOneTimeWebhook →
    // processPaymentBenefits(paymentIntent.id, ...)).
    const ref = await findBenefitsGrantedRef(userId, "one-time");
    expect(ref.kind).toBe("pi");
    expect(await benefitsGrantedCount(ref.kind, ref.id)).toBe(1);
  });
});
