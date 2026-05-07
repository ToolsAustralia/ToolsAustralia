import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";
import { withFreshMember, getDb } from "../fixtures/seed-helpers";
import bcrypt from "bcryptjs";
import crypto from "crypto";

// Mutating: we seed a passwordResetToken on a per-run user, exercise the form,
// then delete the user.
test.describe.configure({ mode: "serial" });

test.describe("reset-password page", () => {
  test("WITHOUT token shows the request-reset form (no token CTA)", async ({ page }) => {
    await page.goto("/reset-password");

    // The page renders the email-request form when no ?token= is present.
    await expect(page.locator(byTestId(testid.resetPasswordEmail))).toBeVisible();
    await expect(page.locator(byTestId(testid.resetPasswordSubmit))).toBeVisible();
    // The new-password fields should NOT be present in this mode.
    await expect(page.locator(byTestId(testid.resetPasswordNew))).toHaveCount(0);
  });

  test("WITH a valid token, submitting a new password succeeds", async ({ page }) => {
    // Seed a fresh user with a valid passwordResetToken (1-hour TTL).
    const fresh = await withFreshMember();
    const { User } = await getDb();
    const passwordHash = await bcrypt.hash("Test_Password_123!", 12);
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    await User.create({
      firstName: "Reset",
      lastName: "Tester",
      email: fresh.email,
      password: passwordHash,
      isEmailVerified: true,
      profileSetupCompleted: true,
      isActive: true,
      passwordResetToken: token,
      passwordResetExpires: expires,
    });

    try {
      await page.goto(`/reset-password?token=${token}`);

      // The new-password form is visible in token mode.
      await expect(page.locator(byTestId(testid.resetPasswordNew))).toBeVisible();
      await expect(page.locator(byTestId(testid.resetPasswordConfirm))).toBeVisible();

      const newPwd = "NewPassword_123!";
      await page.locator(byTestId(testid.resetPasswordNew)).fill(newPwd);
      await page.locator(byTestId(testid.resetPasswordConfirm)).fill(newPwd);

      // Capture the API response — must be 2xx.
      const responsePromise = page.waitForResponse((r) =>
        r.url().includes("/api/auth/reset-password") && r.request().method() === "POST",
      );
      await page.locator(byTestId(testid.resetPasswordSubmit)).click();
      const response = await responsePromise;
      expect(response.status()).toBeGreaterThanOrEqual(200);
      expect(response.status()).toBeLessThan(300);

      // Page redirects to /login after a 1.5s delay on success.
      await page.waitForURL(/\/login(\?|$)/, { timeout: 20_000 });

      // Verify the user's reset token was cleared (i.e. consumed).
      const updated = await User.findOne({ email: fresh.email }).select(
        "passwordResetToken passwordResetExpires",
      );
      expect(updated?.passwordResetToken).toBeFalsy();
      expect(updated?.passwordResetExpires).toBeFalsy();
    } finally {
      await fresh.cleanup();
    }
  });
});
