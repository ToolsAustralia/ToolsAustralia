// e2e/referrals/refer-modal.spec.ts
//
// /my-account → click the "Refer a Friend" QuickActions button → assert
// the ReferFriendModal opens and renders the user's referral code.
//
// The trigger lives in src/app/(site)/my-account/components/QuickActions.tsx
// and is rendered for any authenticated member on the dashboard.

import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";
import { getDb } from "../fixtures/seed-helpers";
import { emailFor } from "../fixtures/test-users";

test.beforeEach(async () => {
  // Klaviyo blocking is centralised in e2e/fixtures/test.ts.
  // Backfill profile fields so /my-account doesn't auto-open UserSetupModal
  // (see src/app/(site)/my-account/page.tsx line 209). Without this the dialog
  // overlay covers QuickActions.
  const { User } = await getDb();
  await User.updateOne(
    { email: emailFor("fresh", test.info().parallelIndex) },
    {
      $set: {
        birthdate: new Date("1990-01-01"),
        state: "NSW",
        profession: "Carpenter",
        profileSetupCompleted: true,
      },
    },
  );
});

test.afterEach(async () => {
  // Restore fresh fixture to seeded baseline.
  const { User } = await getDb();
  await User.updateOne(
    { email: emailFor("fresh", test.info().parallelIndex) },
    {
      $unset: { birthdate: "", state: "", profession: "" },
      $set: { profileSetupCompleted: true },
    },
  );
});

test("clicking Refer a Friend opens the modal with the user's code", async ({ page }) => {
  await page.goto("/my-account");
  // Strip the Next.js dev overlay which can sit on top of the trigger.
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((el) => el.remove());
    document
      .querySelectorAll('button[title="Major Draw Test Controls"]')
      .forEach((el) => el.closest("div.fixed")?.remove());
  });

  // Wait for the dashboard to hydrate before clicking.
  const trigger = page.locator(byTestId(testid.referFriendTrigger));
  await expect(trigger).toBeVisible({ timeout: 25_000 });

  await trigger.scrollIntoViewIfNeeded();
  await trigger.click({ force: true });

  const modal = page.locator(byTestId(testid.referFriendModal));
  await expect(modal).toBeVisible({ timeout: 10_000 });

  // The modal fetches /api/referrals/code which auto-creates a profile if
  // missing, so the code is guaranteed to render once loading completes.
  await expect(
    modal.getByText(/your referral code/i),
  ).toBeVisible({ timeout: 10_000 });

  // The copy button exists once the profile resolves — its presence
  // confirms `profile.code` was truthy and the code block rendered.
  await expect(modal.locator(byTestId(testid.referCopyCodeButton))).toBeVisible({
    timeout: 10_000,
  });
});
