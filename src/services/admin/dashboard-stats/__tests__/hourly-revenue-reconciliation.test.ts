import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import assert from "node:assert/strict";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import PaymentEvent from "@/models/PaymentEvent";
import { PaymentEventRepository } from "@/repositories/PaymentEventRepository";
import {
  aggregateRevenueForDay,
  loadRefundedPaymentIntentIds,
} from "@/services/admin/dashboard-stats/revenueAggregator";
import { createAESTDateAsUTC } from "@/utils/common/timezone";
import { ATTRIBUTED_PLATFORM_KEYS } from "@/models/DashboardStatsDailySnapshot";

// Far-future day to avoid collisions with real dev data.
const PIDS = [
  "pi_h_meta1", "pi_h_meta2", "pi_h_tt", "pi_h_snap",
  "pi_h_kem", "pi_h_ksms", "pi_h_null", "pi_h_renewal", "pi_h_refunded",
];
const u = (hex: string) => new mongoose.Types.ObjectId(hex.padEnd(24, hex.slice(-1)));

function row(pid: string, over: Record<string, unknown>) {
  return {
    _id: `BenefitsGranted-${pid}`,
    eventType: "BenefitsGranted",
    paymentIntentId: pid,
    userId: u("a1"),
    packageType: "one-time",
    packageId: "x",
    processedBy: "webhook",
    ...over,
  };
}

async function seed() {
  const at = (h: number) => createAESTDateAsUTC(2099, 3, 5, h, 0);
  await PaymentEvent.create([
    row("pi_h_meta1", { data: { price: 100 }, convertingPlatform: "meta", attributionConfidence: "click", timestamp: at(9) }),
    row("pi_h_meta2", { data: { price: 50 }, convertingPlatform: "meta", attributionConfidence: "utm_only", timestamp: at(9) }),
    row("pi_h_tt", { packageType: "upsell", data: { price: 30 }, convertingPlatform: "tiktok", attributionConfidence: "click", timestamp: at(14) }),
    row("pi_h_snap", { packageType: "mini-draw", data: { price: 5 }, convertingPlatform: "snapchat", attributionConfidence: "click", timestamp: at(14) }),
    row("pi_h_kem", { data: { price: 40 }, convertingPlatform: "klaviyo_email", attributionConfidence: "utm_only", timestamp: at(20) }),
    row("pi_h_ksms", { data: { price: 25 }, convertingPlatform: "klaviyo_sms", attributionConfidence: "utm_only", timestamp: at(20) }),
    // null platform → coalesced to "direct"
    row("pi_h_null", { data: { price: 10 }, timestamp: at(3) }),
    // membership renewal → excluded from acquisition by BOTH methods
    row("pi_h_renewal", { packageType: "membership", packageId: "apprentice", data: { price: 49, billingReason: "subscription_cycle" }, convertingPlatform: "meta", attributionConfidence: "click", timestamp: at(9) }),
    // refunded row → excluded whole-row by BOTH
    row("pi_h_refunded", { data: { price: 999 }, convertingPlatform: "meta", attributionConfidence: "click", timestamp: at(11) }),
    { _id: "RefundProcessed-pi_h_refunded", eventType: "RefundProcessed", paymentIntentId: "pi_h_refunded", userId: u("a1"), packageType: "one-time", processedBy: "webhook", data: { refundAmount: 99900 }, timestamp: at(12) },
  ]);
}

async function cleanup() {
  await PaymentEvent.deleteMany({ paymentIntentId: { $in: PIDS } });
}

async function run() {
  await connectDB();
  await cleanup();
  await seed();
  try {
    const dayStart = createAESTDateAsUTC(2099, 3, 5, 0, 0);
    const dayEnd = createAESTDateAsUTC(2099, 3, 6, 0, 0); // exclusive next-midnight AEST

    const repo = new PaymentEventRepository();
    const hourly = await repo.aggregateRevenueByHourAndPlatform(dayStart, dayEnd);

    const refunded = await loadRefundedPaymentIntentIds();
    const daily = await aggregateRevenueForDay(dayStart, dayEnd, refunded);

    // RECONCILIATION: per platform, Σ hourly == daily snapshot newRevenue/conversions.
    for (const p of ATTRIBUTED_PLATFORM_KEYS) {
      const sumRev = hourly[p].reduce((s, b) => s + b.revenue, 0);
      const sumConv = hourly[p].reduce((s, b) => s + b.conversions, 0);
      assert.equal(sumRev, daily.byPlatform[p].newRevenue, `revenue reconciles for ${p}`);
      assert.equal(sumConv, daily.byPlatform[p].conversions, `conversions reconcile for ${p}`);
    }

    // Spot checks on bucketing + exclusions.
    assert.equal(hourly.meta[9].revenue, 150, "meta 9am = 100+50");
    assert.equal(hourly.meta[9].conversions, 2, "meta 9am 2 conversions");
    assert.equal(hourly.meta[11].revenue, 0, "refunded row excluded from its hour");
    assert.equal(hourly.direct[3].revenue, 10, "null platform → direct bucket");
    assert.equal(hourly.klaviyo_email[20].revenue, 40, "klaviyo_email 8pm");
    assert.equal(hourly.klaviyo_sms[20].revenue, 25, "klaviyo_sms 8pm");
    assert.equal(hourly.tiktok[14].revenue, 30, "tiktok 2pm");
    assert.equal(hourly.meta.length, 24, "24 buckets");

    console.log("hourly-revenue reconciliation tests passed");
  } finally {
    await cleanup();
    await mongoose.connection.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
