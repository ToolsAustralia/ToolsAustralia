import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";
import PromoLink from "@/models/PromoLink";
import User from "@/models/User";
import connectDB from "@/lib/mongodb";
import mongoose from "mongoose";

// PromoWelcomeModal is rendered by PromoLinkTracker (mounted in providers.tsx) when
// `?promo=CODE` is in the URL and `/api/promo/link/validate` returns valid. Modal opening
// is gated by sessionStorage (`tools-aus:promo-welcome-shown:<CODE>` === "1"); a clean
// guest context starts with that key absent. Route is plural `/promotions/[slug]`.
//
// Seeds an active PromoLink for this spec; cleans up after.

test.describe.configure({ mode: "serial" });

const TEST_CODE = `E2EWELCOME${Date.now().toString(36).toUpperCase().slice(-6)}`;

test.describe("promo welcome modal", () => {
  test.beforeAll(async () => {
    await connectDB();
    // PromoLink requires a createdBy ObjectId — any valid ObjectId is fine for fixture.
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

  test("opens on first visit, sessionStorage gate prevents re-show", async ({ page }) => {
    // Visit a real promotions slug with the seeded promo code in URL.
    await page.goto(`/promotions/cash-prize?promo=${TEST_CODE}`);

    const modal = page.locator(byTestId(testid.promoWelcomeModal));
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(byTestId(testid.promoWelcomeCode))).toContainText(TEST_CODE);

    // Inspect sessionStorage gate written by hook on dismiss. ModalHeader exposes
    // `aria-label="Close modal"` (no dedicated testid in production code).
    await modal.getByRole("button", { name: /close modal/i }).first().click();
    await expect(modal).toHaveCount(0);

    const gateValue = await page.evaluate(
      (code) => window.sessionStorage.getItem(`tools-aus:promo-welcome-shown:${code}`),
      TEST_CODE,
    );
    expect(gateValue).toBe("1");

    // Reload — modal must NOT re-open because of sessionStorage gate.
    await page.reload();
    await expect(modal).toHaveCount(0, { timeout: 5_000 });
  });
});
