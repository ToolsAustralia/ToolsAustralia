// e2e/account/change-password.spec.ts
//
// Change the fresh user's password via the Password tab, then restore the
// original password hash directly in the DB so subsequent specs that share
// this fixture user keep working.
//
// We use the fresh fixture user (not withFreshMember) because the change-and-
// restore-via-DB pattern is cheap and avoids needing a fresh login flow.

import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";
import { getDb } from "../fixtures/seed-helpers";
import { emailFor, E2E_USER_PASSWORD } from "../fixtures/test-users";
import bcrypt from "bcryptjs";

test.describe.configure({ mode: "serial" });

test.describe("change password", () => {
  let userEmail: string;

  test.beforeEach(async ({}, testInfo) => {
    // Use parallelIndex to match the storageState the fixture loaded.
    userEmail = emailFor("fresh", testInfo.parallelIndex);
  });

  test.afterEach(async () => {
    // Always restore by HASHING the canonical E2E_USER_PASSWORD, not by
    // re-using whatever the DB had at beforeEach. If a prior run failed
    // mid-flight and left a stale hash, capturing-then-restoring would
    // perpetuate the pollution. Hashing the source-of-truth password
    // guarantees the fixture user can log in afterwards.
    if (!E2E_USER_PASSWORD) return;
    const restoredHash = await bcrypt.hash(E2E_USER_PASSWORD, 12);
    const { User } = await getDb();
    await User.updateOne(
      { email: userEmail },
      { $set: { password: restoredHash } },
    );
  });

  test("can change password and the API confirms success", async ({ page }) => {
    await page.goto("/my-account/settings");

    await expect(page.locator(byTestId(testid.accountSettingsTabs))).toBeVisible({
      timeout: 25_000,
    });
    await page.locator(byTestId(testid.accountSettingsTabPassword)).click();

    const newPassword = `Tmp-${Date.now()}-Pwd!`;
    await page
      .locator(byTestId(testid.accountChangePasswordCurrent))
      .fill(E2E_USER_PASSWORD);
    await page.locator(byTestId(testid.accountChangePasswordNew)).fill(newPassword);
    await page
      .locator(byTestId(testid.accountChangePasswordConfirm))
      .fill(newPassword);

    const apiResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/api/user/change-password") &&
        r.request().method() === "POST",
    );
    await page.locator(byTestId(testid.accountChangePasswordSave)).click();
    const res = await apiResponse;
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    // Sanity: the DB password hash must NOT verify against E2E_USER_PASSWORD
    // (the form set it to a different value).
    const { User } = await getDb();
    const updated = await User.findOne({ email: userEmail })
      .select("+password")
      .lean();
    const newHash = (updated as { password?: string } | null)?.password;
    expect(newHash).toBeDefined();
    if (newHash && E2E_USER_PASSWORD) {
      const stillSeededPwd = await bcrypt.compare(E2E_USER_PASSWORD, newHash);
      expect(stillSeededPwd).toBe(false);
    }
  });
});
