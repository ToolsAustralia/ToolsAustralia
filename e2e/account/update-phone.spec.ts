// e2e/account/update-phone.spec.ts
//
// Phone number is the only field on the Profile tab that has its own
// dedicated save button (handleSaveMobile -> POST /api/user/update-profile).
// Verify the value is persisted to the User document in DB.

import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";
import { getDb } from "../fixtures/seed-helpers";
import { emailFor } from "../fixtures/test-users";

test.describe.configure({ mode: "serial" });

test.describe("update phone", () => {
  let originalMobile: string | undefined;
  let userEmail: string;

  test.beforeEach(async ({}, testInfo) => {
    // Use parallelIndex to match the storageState the fixture loaded.
    userEmail = emailFor("fresh", testInfo.parallelIndex);
    const { User } = await getDb();
    const doc = await User.findOne({ email: userEmail }).lean();
    originalMobile = (doc as { mobile?: string } | null)?.mobile;
  });

  test.afterEach(async () => {
    const { User } = await getDb();
    if (originalMobile === undefined) {
      await User.updateOne({ email: userEmail }, { $unset: { mobile: "" } });
    } else {
      await User.updateOne({ email: userEmail }, { $set: { mobile: originalMobile } });
    }
  });

  test("submit AU-format phone updates the DB", async ({ page }) => {
    await page.goto("/my-account/settings");
    await expect(page.locator(byTestId(testid.accountSettingsTabs))).toBeVisible({
      timeout: 25_000,
    });
    await page.locator(byTestId(testid.accountSettingsTabProfile)).click();

    // Use a unique random AU-format mobile so we don't collide with another
    // seeded user (the API rejects duplicates).
    const suffix = String(Date.now()).slice(-6);
    const newMobile = `04${suffix}11`; // 10 digits, AU mobile prefix

    const phoneInput = page.locator(byTestId(testid.accountUpdatePhone));
    await expect(phoneInput).toBeVisible({ timeout: 5_000 });
    await phoneInput.fill(newMobile);

    const apiResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/api/user/update-profile") &&
        r.request().method() === "POST",
    );
    await page.locator(byTestId(testid.accountUpdatePhoneSubmit)).click();
    const res = await apiResponse;
    expect(res.status()).toBe(200);

    const { User } = await getDb();
    const updated = await User.findOne({ email: userEmail }).lean();
    // The User model pre-save hook normalises 0xxx... to +61xxx... (see
    // src/models/User.ts line ~1060). Assert against the normalised form.
    const normalised = `+61${newMobile.substring(1)}`;
    expect((updated as { mobile?: string } | null)?.mobile).toBe(normalised);
  });
});
