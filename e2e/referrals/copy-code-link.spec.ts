// e2e/referrals/copy-code-link.spec.ts
//
// Open the ReferFriendModal, click the copy-code button, assert the user's
// referral code is on the clipboard. Requires `clipboard-read` permission
// because the spec inspects clipboard contents from a page-side eval.

import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";
import { getDb } from "../fixtures/seed-helpers";
import { emailFor } from "../fixtures/test-users";

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  // Klaviyo blocking is centralised in e2e/fixtures/test.ts.
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

test("copy code button writes the referral code to the clipboard", async ({
  page,
}) => {
  await page.goto("/my-account");
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((el) => el.remove());
    document
      .querySelectorAll('button[title="Major Draw Test Controls"]')
      .forEach((el) => el.closest("div.fixed")?.remove());
  });

  const trigger = page.locator(byTestId(testid.referFriendTrigger));
  await expect(trigger).toBeVisible({ timeout: 25_000 });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click({ force: true });

  const modal = page.locator(byTestId(testid.referFriendModal));
  await expect(modal).toBeVisible({ timeout: 10_000 });

  const copyBtn = modal.locator(byTestId(testid.referCopyCodeButton));
  await expect(copyBtn).toBeVisible({ timeout: 10_000 });

  await copyBtn.click();

  // The modal flips to "Copied!" after a successful clipboard write — wait
  // on that state before reading the clipboard so we don't race the await.
  await expect(modal.getByText(/copied!/i).first()).toBeVisible({
    timeout: 5_000,
  });

  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toBeTruthy();
  // Codes are uppercased; the modal stores the same value the API returns.
  expect(clipboardText).toMatch(/^[A-Z0-9]+$/);
});
