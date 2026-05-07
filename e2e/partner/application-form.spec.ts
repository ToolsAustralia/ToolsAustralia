import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";
import { getDb } from "../fixtures/seed-helpers";

test.describe.configure({ mode: "serial" });

// Guest fills the "Become a Partner" form on /partner. POST /api/partner-applications
// persists a PartnerApplication doc and (in dev with SendGrid) sends notification.
// We rely on a unique email per run so the rate limiter (5min per email+IP) doesn't
// block a re-run.
test.describe("Partner application form", () => {
  test("submits successfully and creates a PartnerApplication row", async ({ page }) => {
    const uniqueEmail = `e2e-partner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const businessName = `E2E Test Co ${Date.now()}`;

    const { PartnerApplication } = await getDb();

    try {
      await page.goto("/partner");

      // The form lives below the hero — scroll into view to make life easier.
      const form = page.locator(byTestId(testid.partnerApplicationForm));
      await expect(form).toBeVisible({ timeout: 10_000 });
      await form.scrollIntoViewIfNeeded();

      await page.getByPlaceholder("First name").fill("E2E");
      await page.getByPlaceholder("Last name").fill("Tester");
      await page.getByPlaceholder("Business name").fill(businessName);
      await page.getByPlaceholder("Email address").fill(uniqueEmail);
      await page.getByPlaceholder("Phone number").fill("0400000000");

      // Wait for the POST to /api/partner-applications and assert success.
      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes("/api/partner-applications") && resp.request().method() === "POST"
      );
      await page.locator(byTestId(testid.partnerApplicationSubmit)).click();
      const resp = await responsePromise;
      expect([200, 201]).toContain(resp.status());

      // UI flips to success state
      await expect(page.getByText(/Application Submitted!/i)).toBeVisible({ timeout: 10_000 });

      // Verify DB row was created
      const doc = await PartnerApplication.findOne({ email: uniqueEmail.toLowerCase() }).lean();
      expect(doc).toBeTruthy();
      expect((doc as { businessName?: string } | null)?.businessName).toBe(businessName);
    } finally {
      // Cleanup
      await PartnerApplication.deleteOne({ email: uniqueEmail.toLowerCase() });
    }
  });
});
