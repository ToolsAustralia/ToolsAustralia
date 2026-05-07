// e2e/url-params/promo-welcome-popup.spec.ts
//
// PromoWelcomeModal (src/components/modals/PromoWelcomeModal.tsx) is rendered
// by PromoLinkTracker (src/components/tracking/PromoLinkTracker.tsx, mounted in
// providers.tsx) when ?promo=CODE is in the URL and /api/promo/link/validate
// returns valid. The session-storage gate `tools-aus:promo-welcome-shown:<CODE>`
// suppresses re-show within the same session.
//
// This URL-params-domain spec asserts only that the modal triggers on first
// landing — the gate-suppression case is exercised by e2e/promo/welcome-modal.spec.ts
// (we keep this one narrow per the url-params remit).

import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";
import PromoLink from "@/models/PromoLink";
import User from "@/models/User";
import connectDB from "@/lib/mongodb";
import mongoose from "mongoose";

test.describe.configure({ mode: "serial" });

const TEST_CODE = `E2EURL${Date.now().toString(36).toUpperCase().slice(-6)}`;

test.describe("promo welcome popup via ?promo url param", () => {
  test.beforeAll(async () => {
    await connectDB();
    const adminUser = await User.findOne({}).select("_id").lean();
    const createdBy = adminUser?._id ?? new mongoose.Types.ObjectId();
    await PromoLink.create({
      code: TEST_CODE,
      bonusEntries: 100,
      isActive: true,
      appliesToMembership: true,
      appliesToOneTime: true,
      campaignType: "general",
      eligibilityAudience: "all",
      createdBy,
      usageCount: 0,
      usedBy: [],
    });
  });

  test.afterAll(async () => {
    await PromoLink.deleteOne({ code: TEST_CODE });
  });

  test("modal opens on first visit with ?promo=<valid code>", async ({ page }) => {
    await page.goto(`/promotions/cash-prize?promo=${TEST_CODE}`);

    const modal = page.locator(byTestId(testid.promoWelcomeModal));
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(byTestId(testid.promoWelcomeCode))).toContainText(TEST_CODE);
  });
});
