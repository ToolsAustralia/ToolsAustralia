// e2e/account/profile-update.spec.ts
//
// Profile tab update flow.
//
// IMPORTANT: ProfileTab renders firstName/lastName/email as locked read-only
// displays (src/app/(site)/my-account/components/settings/ProfileTab.tsx
// lines 122-148). There is NO UI surface for editing name. The plan's
// `account-profile-first-name` / `-last-name` testids are aspirational —
// the actual editable fields on the Profile tab are mobile, profession,
// state, and birthdate, all routed through /api/user/update-profile or
// /api/user/update-phone.
//
// This spec covers the profession field (representative of the "save
// profile" button) and verifies the value is persisted to the DB.

import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";
import { getDb } from "../fixtures/seed-helpers";
import { emailFor } from "../fixtures/test-users";

test.describe.configure({ mode: "serial" });

test.describe("profile update", () => {
  let originalProfession: string | undefined;
  let userEmail: string;

  test.beforeEach(async ({}, testInfo) => {
    // The custom test fixture binds storageState to parallelIndex (matching
    // e2e/.auth/fresh-w<parallelIndex>.json), so we must use the SAME index
    // here — emailFor() defaults to TEST_WORKER_INDEX which can drift after
    // worker respawns.
    userEmail = emailFor("fresh", testInfo.parallelIndex);
    const { User } = await getDb();
    const doc = await User.findOne({ email: userEmail }).lean();
    originalProfession = (doc as { profession?: string } | null)?.profession;
  });

  test.afterEach(async () => {
    const { User } = await getDb();
    if (originalProfession === undefined) {
      await User.updateOne({ email: userEmail }, { $unset: { profession: "" } });
    } else {
      await User.updateOne({ email: userEmail }, { $set: { profession: originalProfession } });
    }
  });

  test("can save profession and DB reflects the new value", async ({ page }) => {
    await page.goto("/my-account/settings");

    // Settings landing renders the tab list. Click Profile.
    await expect(page.locator(byTestId(testid.accountSettingsTabs))).toBeVisible({
      timeout: 25_000,
    });
    await page.locator(byTestId(testid.accountSettingsTabProfile)).click();

    // Profile tab now renders with the profession input visible.
    const newProfession = `E2E Tester ${Date.now()}`;
    const professionInput = page.locator(byTestId(testid.accountProfileProfession));
    await expect(professionInput).toBeVisible({ timeout: 5_000 });
    await professionInput.fill(newProfession);

    // Click Save profile. The button posts to /api/user/update-profile.
    const saveResponse = page.waitForResponse((r) =>
      r.url().includes("/api/user/update-profile") && r.request().method() === "POST"
    );
    await page.locator(byTestId(testid.accountProfileSave)).click();
    const res = await saveResponse;
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    // The API echoes the persisted profession in its response — assert against
    // the response payload to avoid replica-lag flakiness on the follow-up read.
    expect(json.user?.profession).toBe(newProfession);

    // Verify DB state.
    const { User } = await getDb();
    const updated = await User.findOne({ email: userEmail }).lean();
    expect((updated as { profession?: string } | null)?.profession).toBe(newProfession);
  });
});
