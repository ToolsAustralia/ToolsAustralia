import { config } from "dotenv";
config({ path: ".env.local" });

import mongoose from "mongoose";
import User from "../src/models/User";
import RedeemableIssuance from "../src/models/RedeemableIssuance";
import MonthlyEntryCampaign from "../src/models/MonthlyEntryCampaign";
import connectDB from "../src/lib/mongodb";
import { RedeemablesWalletService } from "../src/services/redeemables";

async function main() {
  await connectDB();

  // Simulate beforeEach: create campaign + issuance
  const u0 = await User.findOne({ email: "test-e2e-fresh-w0@example.com" }).lean();
  if (!u0) { console.log("user missing"); return; }

  const TEST_CODE = `E2E-DBG-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  await MonthlyEntryCampaign.deleteOne({ code: TEST_CODE });
  const monthKey = new Date().toISOString().slice(0, 7);
  const campaign = await MonthlyEntryCampaign.create({
    monthKey,
    name: "E2E DBG",
    entriesAmount: 5,
    campaignMode: "both",
    targetingMode: "manual-users",
    startsAt: new Date(Date.now() - 60_000),
    neverExpires: true,
    isActive: true,
    code: TEST_CODE,
    purchaseRequirement: "none",
  });
  await RedeemableIssuance.deleteMany({ campaignId: campaign._id, userId: (u0 as any)._id });
  const iss = await RedeemableIssuance.create({
    campaignId: campaign._id,
    userId: (u0 as any)._id,
    monthKey,
    status: "active",
    source: "monthly-coupon",
    entriesAmount: 5,
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  console.log("created campaign", campaign._id, "iss", iss._id);

  // Now ask the wallet service what it returns
  const wallet = await RedeemablesWalletService.getUserWallet(String((u0 as any)._id), { page: 1, limit: 10, status: "claimable" });
  console.log("wallet (claimable):", JSON.stringify({
    total: wallet.total,
    items: wallet.items.map((it) => ({
      issuanceId: it.issuanceId,
      isRedeemableNow: it.isRedeemableNow,
      status: it.status,
      expiresAt: it.expiresAt,
      purchaseRequirement: it.purchaseRequirement,
    })),
  }, null, 2));

  // Cleanup
  await RedeemableIssuance.deleteOne({ _id: iss._id });
  await MonthlyEntryCampaign.deleteOne({ _id: campaign._id });

  const u = await User.findOne({ email: "test-e2e-fresh-w0@example.com" }).lean();
  console.log("user fresh-w0:", JSON.stringify({
    _id: (u as any)?._id,
    state: (u as any)?.state,
    isActive: (u as any)?.isActive,
    isEmailVerified: (u as any)?.isEmailVerified,
    profileSetupCompleted: (u as any)?.profileSetupCompleted,
  }, null, 2));

  if (u) {
    const issuances = await RedeemableIssuance.find({ userId: (u as any)._id }).lean();
    console.log(`issuances: ${issuances.length}`);
    issuances.forEach((iss) => {
      console.log("  ", JSON.stringify({
        _id: (iss as any)._id,
        status: (iss as any).status,
        expiresAt: (iss as any).expiresAt,
        campaignId: (iss as any).campaignId,
        source: (iss as any).source,
      }));
    });

    const campaigns = await MonthlyEntryCampaign.find({ name: "E2E Claim Test" }).lean();
    console.log(`campaigns: ${campaigns.length}`);
    campaigns.forEach((c) => {
      console.log("  ", JSON.stringify({
        _id: (c as any)._id,
        code: (c as any).code,
        isActive: (c as any).isActive,
        targetingMode: (c as any).targetingMode,
      }));
    });
  }

  await mongoose.disconnect();
}
main().catch((err) => { console.error(err); process.exit(1); });
