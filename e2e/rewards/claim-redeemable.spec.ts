// e2e/rewards/claim-redeemable.spec.ts
//
// Seed a MonthlyEntryCampaign + RedeemableIssuance for the fresh fixture
// user, then redeem it via the floating widget.
//
// We use `purchaseRequirement: "none"` so the displayed action is the
// in-widget "Redeem" button (not a "USE CODE" CTA that opens an unrelated
// modal). After clicking, we expect a success toast and the wallet to
// refetch — the issuance moves to the Past tab as "Claimed".

import mongoose from "mongoose";
import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";
import { getDb } from "../fixtures/seed-helpers";
import { emailFor } from "../fixtures/test-users";

test.describe.configure({ mode: "serial" });

// Klaviyo blocking is centralised in e2e/fixtures/test.ts.

const TEST_CODE = `E2E-CLAIM-${Date.now().toString(36).toUpperCase().slice(-6)}`;
let campaignId: mongoose.Types.ObjectId;
let issuanceId: mongoose.Types.ObjectId;

test.beforeEach(async () => {
  const { User, RedeemableIssuance, MonthlyEntryCampaign } = await getDb();

  // Backfill profile fields so /my-account doesn't auto-open UserSetupModal
  // (see src/app/(site)/my-account/page.tsx line 209). Without this the
  // dialog overlay intercepts the FAB click.
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

  const user = await User.findOne({ email: emailFor("fresh", test.info().parallelIndex) }).lean();
  if (!user) throw new Error("fresh fixture user not found — seed not run?");

  const monthKey = new Date().toISOString().slice(0, 7);

  // Wipe any leftovers from a prior run for this code (re-runs).
  await MonthlyEntryCampaign.deleteOne({ code: TEST_CODE });

  const campaign = await MonthlyEntryCampaign.create({
    monthKey,
    name: "E2E Claim Test",
    entriesAmount: 5,
    campaignMode: "both",
    targetingMode: "manual-users",
    startsAt: new Date(Date.now() - 60_000),
    neverExpires: true,
    isActive: true,
    code: TEST_CODE,
    purchaseRequirement: "none",
  });
  campaignId = campaign._id as mongoose.Types.ObjectId;

  await RedeemableIssuance.deleteMany({
    campaignId,
    userId: user._id,
  });
  const issuance = await RedeemableIssuance.create({
    campaignId,
    userId: user._id,
    monthKey,
    status: "active",
    source: "monthly-coupon",
    entriesAmount: 5,
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  issuanceId = issuance._id as mongoose.Types.ObjectId;
});

test.afterEach(async () => {
  const { RedeemableIssuance, MonthlyEntryCampaign } = await getDb();
  if (issuanceId) await RedeemableIssuance.deleteOne({ _id: issuanceId });
  if (campaignId) await MonthlyEntryCampaign.deleteOne({ _id: campaignId });
});

test("user can claim a seeded redeemable from the widget", async ({ page }) => {
  // Wait for the wallet API response that should contain our seeded issuance.
  // beforeEach has already created it; we just need the page to fetch.
  const walletWaiter = page.waitForResponse(
    (resp) =>
      /\/api\/redeemables\?.*status=claimable/.test(resp.url()) &&
      resp.status() === 200,
    { timeout: 20_000 },
  );

  await page.goto("/my-account");
  await expect(page.locator(byTestId(testid.dashboardRoot))).toBeVisible({
    timeout: 25_000,
  });

  // Confirm the wallet API returned at least one claimable item. If it didn't,
  // the seed didn't propagate (DB race/test ordering issue) — fail loud here
  // rather than the misleading "claim button not visible" downstream.
  const walletResp = await walletWaiter;
  const walletBody = await walletResp.json();
  expect(walletBody?.success).toBe(true);
  expect(walletBody?.data?.total ?? 0).toBeGreaterThan(0);

  // Strip the Next.js dev overlay AND the dev-only MajorDrawTestControls FAB
  // (bottom-left, z-[9998]) — both can intercept clicks on the rewards FAB.
  // Klaviyo is blocked at the network level in beforeEach.
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((el) => el.remove());
    document
      .querySelectorAll('button[title="Major Draw Test Controls"]')
      .forEach((el) => el.closest("div.fixed")?.remove());
  });
  await page.locator(byTestId(testid.rewardsFloatingWidget)).click();
  await expect(
    page.getByRole("heading", { name: /claimable rewards/i }),
  ).toBeVisible({ timeout: 5_000 });

  const claimButton = page.locator(byTestId(testid.rewardsClaimButton)).first();
  await expect(claimButton).toBeVisible({ timeout: 10_000 });
  await claimButton.click();

  // Success toast appears (Toast component renders title text).
  await expect(page.getByText(/reward claimed/i)).toBeVisible({
    timeout: 10_000,
  });

  // Verify in DB the issuance moved to redeemed.
  const { RedeemableIssuance } = await getDb();
  const updated = await RedeemableIssuance.findById(issuanceId).lean();
  expect(updated?.status).toBe("redeemed");
});
