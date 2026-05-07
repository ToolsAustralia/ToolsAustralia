import { test, expect } from "../fixtures/test";
import PromoLink from "@/models/PromoLink";
import User from "@/models/User";
import connectDB from "@/lib/mongodb";
import mongoose from "mongoose";

// Plan amendment (executing-plans line ~1672) narrowed this spec to API-only:
// POST /api/codes/validate with a known seeded promo code → assert
// `{ success: true, valid: true, type: "promo", data: { code, ... } }`.
// Then POST a wrong code → assert `{ success: true, valid: false, message: "..." }`.

test.describe.configure({ mode: "serial" });

const TEST_CODE = `E2EBONUS${Date.now().toString(36).toUpperCase().slice(-6)}`;

test.describe("POST /api/codes/validate (bonus code)", () => {
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

  test("valid promo code returns type=promo", async ({ request }) => {
    const res = await request.post("/api/codes/validate", {
      data: { code: TEST_CODE, preferType: "promo" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.valid).toBe(true);
    expect(body.type).toBe("promo");
    expect(body.data?.code).toBe(TEST_CODE);
    expect(typeof body.data?.bonusEntries).toBe("number");
  });

  test("unknown code returns valid=false with a message", async ({ request }) => {
    const res = await request.post("/api/codes/validate", {
      data: { code: "NOPENOPE123", preferType: "auto" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.valid).toBe(false);
    expect(typeof body.message).toBe("string");
  });
});
