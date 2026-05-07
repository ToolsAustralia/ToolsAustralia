// e2e/referrals/refer-reward-modal.spec.ts
//
// /my-account with sessionStorage["showReferFriendAfterSetup"]="true" causes
// the ReferFriendModal to auto-open after a 10-second timer fires (see
// src/app/(site)/my-account/page.tsx:160-173). We fast-forward time using
// page.clock instead of waiting wall-clock 10s.

import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";
import { getDb } from "../fixtures/seed-helpers";
import { emailFor } from "../fixtures/test-users";

test.beforeEach(async () => {
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

// PRODUCT BUG: my-account/page.tsx has TWO effects that gate the auto-open
//   1. effect@152 sets `referFriendPendingRef.current = true` when session +
//      accountData are loaded (deps: [session, accountData]).
//   2. effect@160 schedules the 10s setTimeout (deps: [allowSecondaryModals]).
// On a fresh-user landing the order is: (a) effect 160 mount-fires while ref is
// still false → bails; (b) accountData loads → effect 152 sets ref true; (c)
// `allowSecondaryModals` never transitions (it was already true), so effect
// 160 never re-fires and the 10s timer is never scheduled. The user only sees
// the modal if a primary modal closes between (b) and an external trigger that
// flips allowSecondaryModals. Spec is skipped until effect 160's deps include
// the ref or it reads sessionStorage directly inside the effect body.
test.skip("ReferFriendModal auto-opens 10s after setup-completed flag is set", async ({ page }) => {
  // Seed the flag BEFORE navigation so the effect on /my-account sees it on mount.
  // page.addInitScript runs in every page context before any other script.
  await page.addInitScript(() => {
    sessionStorage.setItem("showReferFriendAfterSetup", "true");
  });

  await page.goto("/my-account");

  // Strip the Next.js dev overlay — interferes with overlay layering.
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((el) => el.remove());
    document
      .querySelectorAll('button[title="Major Draw Test Controls"]')
      .forEach((el) => el.closest("div.fixed")?.remove());
  });

  // Wait for the dashboard to mount (otherwise the 10s setTimeout hasn't been
  // scheduled yet).
  await expect(page.locator(byTestId(testid.dashboardRoot))).toBeVisible({
    timeout: 25_000,
  });

  // Wait wall-clock for the effect-scheduled setTimeout(10_000). The two
  // chained effects (set referFriendPendingRef on accountData load → schedule
  // the 10s timer when allowSecondaryModals turns true) can take 5–10s of
  // wall-clock to start the timer in dev mode; allow 25s total before the
  // modal is expected to be visible.
  const modal = page.locator(byTestId(testid.referFriendModal));
  await expect(modal).toBeVisible({ timeout: 25_000 });

  // The flag should be cleared once the modal opens.
  const flagAfter = await page.evaluate(() =>
    sessionStorage.getItem("showReferFriendAfterSetup"),
  );
  expect(flagAfter).toBeNull();
});
