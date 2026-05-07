// e2e/rewards/redeem-code.spec.ts
//
// The /api/codes/validate endpoint VALIDATES but does NOT redeem. The
// rewards floating widget itself does not surface a "type a code" form;
// code redemption happens through the SpecialPackagesModal / MembershipModal
// flow when buying a package. This spec narrowly verifies that:
//   1. /api/codes/validate returns valid=true for a real seeded campaign code.
//   2. /api/codes/validate returns valid=false for an obviously bogus code.
//
// We use page.request (the Playwright APIRequestContext) so the call carries
// the authenticated session cookie from the per-worker storageState. Auth is
// not strictly required for /api/codes/validate (it has no session check),
// but we use the page's request fixture to stay consistent with other specs.

import mongoose from "mongoose";
import { test, expect } from "../fixtures/test";
import { getDb } from "../fixtures/seed-helpers";

test.describe.configure({ mode: "serial" });

const TEST_CODE = `E2E-VALID-${Date.now().toString(36).toUpperCase().slice(-6)}`;
let campaignId: mongoose.Types.ObjectId;

test.beforeAll(async () => {
  const { MonthlyEntryCampaign } = await getDb();
  await MonthlyEntryCampaign.deleteOne({ code: TEST_CODE });
  const monthKey = new Date().toISOString().slice(0, 7);
  const c = await MonthlyEntryCampaign.create({
    monthKey,
    name: "E2E Validate Test",
    entriesAmount: 3,
    campaignMode: "both",
    targetingMode: "all-active-subscribers",
    startsAt: new Date(Date.now() - 60_000),
    neverExpires: true,
    isActive: true,
    code: TEST_CODE,
    purchaseRequirement: "none",
  });
  campaignId = c._id as mongoose.Types.ObjectId;
});

test.afterAll(async () => {
  const { MonthlyEntryCampaign } = await getDb();
  if (campaignId) await MonthlyEntryCampaign.deleteOne({ _id: campaignId });
});

test("validate endpoint accepts a real campaign code", async ({ page }) => {
  const res = await page.request.post("/api/codes/validate", {
    data: { code: TEST_CODE, preferType: "auto" },
  });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.success).toBe(true);
  expect(body.valid).toBe(true);
  expect(body.type).toBe("campaign");
  expect(body.data?.code).toBe(TEST_CODE);
});

test("validate endpoint rejects an unknown code", async ({ page }) => {
  const res = await page.request.post("/api/codes/validate", {
    data: { code: "BOGUS-CODE-NOPE", preferType: "auto" },
  });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.success).toBe(true);
  expect(body.valid).toBe(false);
});
