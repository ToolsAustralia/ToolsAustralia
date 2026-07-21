import { test as base, expect } from "../../fixtures/test";
import { CARDS, fillPaymentElement, uniqueMobile } from "../../helpers/payment";
import { disconnectE2eDb, entriesForUser, findUserByEmail } from "../../helpers/db";

/**
 * A genuine decline is EXPECTED to log to the browser console — CardFormSection.tsx
 * (confirmStripeIntent, "payment" branch) does `console.error("Stripe PaymentIntent
 * error:", error)` before returning the formatted error to the caller. That's real,
 * intentional app behavior (Stripe error surfaced for debugging), not a bug — but the
 * base `watchdog` fixture (../../fixtures/test.ts) fails any test on an unallowlisted
 * console.error, so this spec (and only this spec) shadows it with the SAME
 * pageerror/console/5xx checks plus an allowlist for the expected decline noise.
 * This is a documented Playwright pattern (fixture override via `.extend()` re-declaring
 * a fixture name); fixtures/test.ts itself is untouched.
 */
const DECLINE_ALLOWLIST: RegExp[] = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /third-party cookie/i,
  /Stripe PaymentIntent error/i,
  /PaymentElement validation error/i,
  // Stripe's own confirmPayment() call to api.stripe.com returns HTTP 402 for a
  // declined card (Stripe's REST convention) — Chrome auto-logs any >=400 resource
  // load as a console.error regardless of whether app/Stripe.js code handles it.
  // Verified live: this fires on every decline, from stripe.js itself, not our API.
  /Failed to load resource.*402/i,
];

/* eslint-disable react-hooks/rules-of-hooks -- Playwright's fixture continuation
   parameter is conventionally named `use`, which collides with React 19's `use`
   hook name for this lint rule (same false positive already present, unfixed,
   in ../../fixtures/test.ts's own watchdog/freshUser fixtures). Scoped to this
   fixture override only; re-enabled immediately after. */
const test = base.extend({
  // Overriding an existing `auto: true` fixture inherits `auto` from the base
  // declaration (../../fixtures/test.ts) — re-specifying it here is a type error.
  watchdog: async ({ page, context, baseURL }, use) => {
    await context.route(/klaviyo\.com|contentsquare\.net|hotjar\.(com|io)/, (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: "" })
    );
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error" && !DECLINE_ALLOWLIST.some((rx) => rx.test(m.text()))) {
        problems.push(`console.error: ${m.text().slice(0, 300)}`);
      }
    });
    page.on("response", (r) => {
      if (baseURL && r.url().startsWith(baseURL) && r.status() >= 500) {
        problems.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`);
      }
    });
    await use();
    if (problems.length) {
      throw new Error(`QA watchdog caught ${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
    }
  },
});
/* eslint-enable react-hooks/rules-of-hooks */

test.afterAll(async () => {
  await disconnectE2eDb();
});

test.describe("declined card @purchase", () => {
  test("decline shows the error and grants NOTHING", async ({ page }) => {
    // See purchase-subscription.spec.ts's identical note: generous budget for
    // full 3-project concurrent runs against one `next dev` server.
    test.setTimeout(200_000);
    const runId = process.env.E2E_RUN_ID || "dev";
    const email = `e2e-decline-${runId}-${test.info().project.name}@e2e.io`;

    await page.goto("/membership");
    await page
      .getByRole("button", { name: /choose tradie/i })
      .or(page.getByRole("link", { name: /choose tradie/i }))
      .first()
      .click();
    await page.locator('input[name="firstName"]').fill("E2E");
    await page.locator('input[name="lastName"]').fill("Decline");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="phone"]').fill(uniqueMobile(email));
    await page.getByRole("button", { name: /register/i }).click();

    const purchaseButton = page.getByRole("button", { name: /^purchase$/i });
    await expect(purchaseButton).toBeVisible({ timeout: 45_000 });

    await fillPaymentElement(page, CARDS.declined);
    await expect(purchaseButton).toBeEnabled({ timeout: 30_000 });
    await purchaseButton.click();

    // Verified live (screenshot on first probe run): the decline message renders
    // as Stripe PaymentElement's own inline field-level error, INSIDE the iframe
    // (directly under the Card number field) — not our app's toast/cardError
    // paragraph. `page.getByText` only searches the main frame, so this must go
    // through the same frameLocator fillPaymentElement uses. Exact text verified
    // live: "Your card was declined." (matches src/utils/payment/stripe/
    // payment-error-messages.ts:106's message, coincidentally identical to
    // Stripe.js's own canned copy for this decline code).
    const stripeFrame = page.frameLocator('iframe[name^="__privateStripeFrame"], iframe[title*="payment" i]').first();
    await expect(stripeFrame.getByText(/card was declined|card declined/i).first()).toBeVisible({ timeout: 45_000 });

    // Zero phantom grants — registration (step 1) DOES create the user account
    // (that's the guestUserData bridge), but it must never gain an active
    // subscription or entries from a declined charge.
    await page.waitForTimeout(5_000); // grace for any stray async grant — must stay zero
    const user = await findUserByEmail(email);
    // Guard against a vacuous pass: without this, a FAILED registration (user === null,
    // e.g. the phone/email uniqueness broke, or /api/auth/register regressed) would make
    // `user?.subscription?.status ?? "none"` read "none" (not "active") and skip the
    // entries check entirely via `if (user)` — the test would pass having proven nothing.
    expect(user).toBeTruthy();
    expect(user?.subscription?.status ?? "none").not.toBe("active");
    if (user) expect(await entriesForUser(String(user._id))).toBe(0);
  });
});
