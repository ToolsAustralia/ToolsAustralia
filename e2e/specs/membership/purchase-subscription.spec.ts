import { test, expect } from "../../fixtures/test";
import { CARDS, fillPaymentElement, findBenefitsGrantedRef, uniqueMobile, waitForActiveMembership } from "../../helpers/payment";
import { benefitsGrantedCount, disconnectE2eDb } from "../../helpers/db";

test.describe.configure({ mode: "serial" }); // one money-path flow at a time per project/worker
test.afterAll(async () => {
  await disconnectE2eDb();
});

test.describe("subscription purchase @purchase @demo", () => {
  test("new user buys Tradie: payment → webhook → 15 entries exactly once", async ({ page }) => {
    // Generous budget: full 3-project runs put ~15 real Stripe money-path flows
    // concurrently against a single `next dev` server (verified live — chromium-only
    // runs finish in ~35s; the full 8-worker run needs much more headroom for the
    // same steps under contention).
    test.setTimeout(300_000);
    const runId = process.env.E2E_RUN_ID || "dev";
    // Email format verified in Task 7 (src/models/User.ts:346 regex requires hyphen
    // separators + a 2-char TLD — "+" and ".local" both fail validation).
    const email = `e2e-buy-${runId}-${test.info().project.name}@e2e.io`;

    // Register (step 1) — no "Continue to Billing" interstitial (verified Task 7):
    // a successful register batches setGuestUserData + setCurrentStep(2), so the modal
    // jumps straight from the registration form to the billing/payment step.
    await page.goto("/membership");
    await page
      .getByRole("button", { name: /choose tradie/i })
      .or(page.getByRole("link", { name: /choose tradie/i }))
      .first()
      .click();
    await page.locator('input[name="firstName"]').fill("E2E");
    await page.locator('input[name="lastName"]').fill("Buyer");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="phone"]').fill(uniqueMobile(email));
    await page.getByRole("button", { name: /register/i }).click();

    // Billing step reached — unauthenticated submit button is exactly "PURCHASE"
    // (PaymentStep.tsx: isAuthenticated ? "PURCHASE & ENTER THE DRAW" : "PURCHASE").
    const purchaseButton = page.getByRole("button", { name: /^purchase$/i });
    await expect(purchaseButton).toBeVisible({ timeout: 45_000 });

    // Pay — Stripe test card via the PaymentElement iframe.
    await fillPaymentElement(page, CARDS.ok);
    await expect(purchaseButton).toBeEnabled({ timeout: 30_000 });
    await purchaseButton.click();

    // Outcome asserted at the DATABASE, not the pixels (spec §9) — webhook grant
    // processing is in-process (`after()`), so this polls rather than expecting a
    // synchronous UI transition.
    const { userId, entries } = await waitForActiveMembership(email, 180_000);
    expect(entries).toBe(15); // Tradie includes 15 free entries (membershipPackages.ts: entriesPerMonth 15)

    // Exactly-once: precisely one BenefitsGranted event exists for this user's invoice.
    // Doc shape verified live (src/services/stripe-webhook-handlers/index.ts:3358-3359):
    // subscriptions grant on invoice.payment_succeeded with
    // _id "BenefitsGranted-invoice_<stripe invoice id>".
    const ref = await findBenefitsGrantedRef(userId, "membership");
    expect(ref.kind).toBe("invoice");
    expect(await benefitsGrantedCount(ref.kind, ref.id)).toBe(1);
  });
});
