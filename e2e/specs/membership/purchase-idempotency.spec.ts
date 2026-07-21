import mongoose from "mongoose";
import { test, expect } from "../../fixtures/test";
import { CARDS, fillPaymentElement, findBenefitsGrantedRef, uniqueMobile, waitForActiveMembership } from "../../helpers/payment";
import { benefitsGrantedCount, connectE2eDb, disconnectE2eDb } from "../../helpers/db";

test.afterAll(async () => {
  await disconnectE2eDb();
});

test.describe("double-submit idempotency @purchase", () => {
  test("rapid double-click on pay grants exactly one membership", async ({ page }) => {
    // See purchase-subscription.spec.ts's identical note: generous budget for
    // full 3-project concurrent runs against one `next dev` server.
    test.setTimeout(300_000);
    const runId = process.env.E2E_RUN_ID || "dev";
    const email = `e2e-dbl-${runId}-${test.info().project.name}@e2e.io`;

    await page.goto("/membership");
    await page
      .getByRole("button", { name: /choose tradie/i })
      .or(page.getByRole("link", { name: /choose tradie/i }))
      .first()
      .click();
    await page.locator('input[name="firstName"]').fill("E2E");
    await page.locator('input[name="lastName"]').fill("Double");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="phone"]').fill(uniqueMobile(email));
    await page.getByRole("button", { name: /register/i }).click();

    const purchaseButton = page.getByRole("button", { name: /^purchase$/i });
    await expect(purchaseButton).toBeVisible({ timeout: 45_000 });
    await fillPaymentElement(page, CARDS.ok);
    await expect(purchaseButton).toBeEnabled({ timeout: 30_000 });

    await purchaseButton.click();
    // Second click races the first submit's synchronous isSubmitting/disabled state.
    // If the button is still enabled it's a real double-fire attempt; if React has
    // already disabled it, Playwright times out waiting for actionability — both
    // outcomes are valid inputs to this test, hence the swallow.
    await purchaseButton.click({ timeout: 2_000 }).catch(() => {});

    const { userId, entries } = await waitForActiveMembership(email, 180_000);
    expect(entries).toBe(15); // exactly one grant — not 30

    const db = await connectE2eDb();
    const subs = await db.connection
      .collection("users")
      .countDocuments({ email: email.toLowerCase(), "subscription.status": "active" });
    expect(subs).toBe(1);

    // Belt-and-suspenders: only one active Stripe subscription id was persisted
    // (a real double-fire bug would show as two distinct subscription ids across
    // retries, not just doubled entries).
    const userDoc = await db.connection.collection("users").findOne({ _id: new mongoose.Types.ObjectId(userId) });
    expect(userDoc?.stripeSubscriptionId).toBeTruthy();

    // Same exactly-once event-log check the flagship spec makes: precisely one
    // BenefitsGranted doc for this invoice, even though the button was clicked twice.
    const ref = await findBenefitsGrantedRef(userId, "membership");
    expect(ref.kind).toBe("invoice");
    expect(await benefitsGrantedCount(ref.kind, ref.id)).toBe(1);
  });
});
