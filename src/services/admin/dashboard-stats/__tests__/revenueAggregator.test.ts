import dotenv from "dotenv";
import path from "node:path";

// Load .env.local so the test can talk to Mongo when run via tsx
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import PaymentEvent from "@/models/PaymentEvent";
import { aggregateRevenueForDay, loadRefundedPaymentIntentIds } from "../revenueAggregator";
import { createAESTDateAsUTC } from "@/utils/common/timezone";

const TEST_PI_IDS = [
  "pi_A",
  "pi_B",
  "pi_C",
  "pi_D",
  "pi_E",
  "pi_F",
  "pi_REF",
  "pi_BEFORE",
  "pi_AFTER",
  "pi_META_CLICK",
  "pi_META_UTM",
  "pi_TIKTOK",
  "pi_NULL_PLAT",
];

// Synthetic ObjectIds for test users — 24-char hex strings
const u1 = new mongoose.Types.ObjectId("aaaaaaaaaaaaaaaaaaaaaaaa");
const u2 = new mongoose.Types.ObjectId("bbbbbbbbbbbbbbbbbbbbbbbb");
const u3 = new mongoose.Types.ObjectId("cccccccccccccccccccccccc");
const u4 = new mongoose.Types.ObjectId("dddddddddddddddddddddddd");
const u5 = new mongoose.Types.ObjectId("eeeeeeeeeeeeeeeeeeeeeeee");
const u6 = new mongoose.Types.ObjectId("ffffffffffffffffffffffff");
const u7 = new mongoose.Types.ObjectId("111111111111111111111111");
const u8 = new mongoose.Types.ObjectId("222222222222222222222222");
const u9 = new mongoose.Types.ObjectId("333333333333333333333333");
const u10 = new mongoose.Types.ObjectId("444444444444444444444444");
const u11 = new mongoose.Types.ObjectId("555555555555555555555555");
const u12 = new mongoose.Types.ObjectId("666666666666666666666666");
const u13 = new mongoose.Types.ObjectId("777777777777777777777777");

async function seed() {
  // Day under test: March 5 2099 in AEST (far-future date to avoid collisions with real dev-DB data).
  const dayStart = createAESTDateAsUTC(2099, 3, 5, 0, 0);
  const dayEnd = createAESTDateAsUTC(2099, 3, 6, 0, 0);

  await PaymentEvent.create([
    // Inside day, kept — convertingPlatform "other" so only pi_NULL_PLAT lands in "direct"
    { _id: "BenefitsGranted-pi_A", eventType: "BenefitsGranted", paymentIntentId: "pi_A", packageType: "membership", packageId: "apprentice", data: { price: 49, billingReason: "subscription_create" }, convertingPlatform: "other", attributionConfidence: "click", timestamp: createAESTDateAsUTC(2099, 3, 5, 9, 0), userId: u1, processedBy: "webhook" },
    { _id: "BenefitsGranted-pi_B", eventType: "BenefitsGranted", paymentIntentId: "pi_B", packageType: "membership", packageId: "apprentice", data: { price: 49, billingReason: "subscription_cycle" }, convertingPlatform: "other", attributionConfidence: "click", timestamp: createAESTDateAsUTC(2099, 3, 5, 10, 0), userId: u2, processedBy: "webhook" },
    { _id: "BenefitsGranted-pi_C", eventType: "BenefitsGranted", paymentIntentId: "pi_C", packageType: "one-time", packageId: "apprentice-pack", data: { price: 25 }, convertingPlatform: "other", attributionConfidence: "click", timestamp: createAESTDateAsUTC(2099, 3, 5, 11, 0), userId: u3, processedBy: "webhook" },
    { _id: "BenefitsGranted-pi_D", eventType: "BenefitsGranted", paymentIntentId: "pi_D", packageType: "one-time", packageId: "additional-tradie-pack", data: { price: 15 }, convertingPlatform: "other", attributionConfidence: "click", timestamp: createAESTDateAsUTC(2099, 3, 5, 12, 0), userId: u4, processedBy: "webhook" },
    { _id: "BenefitsGranted-pi_E", eventType: "BenefitsGranted", paymentIntentId: "pi_E", packageType: "mini-draw", packageId: "anything", data: { price: 5 }, convertingPlatform: "other", attributionConfidence: "click", timestamp: createAESTDateAsUTC(2099, 3, 5, 13, 0), userId: u5, processedBy: "webhook" },
    { _id: "BenefitsGranted-pi_F", eventType: "BenefitsGranted", paymentIntentId: "pi_F", packageType: "upsell", packageId: "anything", data: { price: 10 }, convertingPlatform: "other", attributionConfidence: "click", timestamp: createAESTDateAsUTC(2099, 3, 5, 14, 0), userId: u6, processedBy: "webhook" },
    // Refunded — must be excluded; convertingPlatform "meta" to verify refunds don't leak into byPlatform
    { _id: "BenefitsGranted-pi_REF", eventType: "BenefitsGranted", paymentIntentId: "pi_REF", packageType: "membership", packageId: "apprentice", data: { price: 99, billingReason: "subscription_create" }, convertingPlatform: "meta", attributionConfidence: "click", timestamp: createAESTDateAsUTC(2099, 3, 5, 15, 0), userId: u7, processedBy: "webhook" },
    { _id: "RefundProcessed-pi_REF", eventType: "RefundProcessed", paymentIntentId: "pi_REF", packageType: "membership", data: { refundAmount: 9900 }, timestamp: createAESTDateAsUTC(2099, 3, 7, 9, 0), userId: u7, processedBy: "webhook" },
    // Boundary: 23:59 March 4 AEST — previous day, excluded
    { _id: "BenefitsGranted-pi_BEFORE", eventType: "BenefitsGranted", paymentIntentId: "pi_BEFORE", packageType: "membership", data: { price: 1, billingReason: "subscription_create" }, timestamp: createAESTDateAsUTC(2099, 3, 4, 23, 59), userId: u8, processedBy: "webhook" },
    // Boundary: 00:00 March 6 AEST — next day, excluded
    { _id: "BenefitsGranted-pi_AFTER", eventType: "BenefitsGranted", paymentIntentId: "pi_AFTER", packageType: "membership", data: { price: 1, billingReason: "subscription_create" }, timestamp: createAESTDateAsUTC(2099, 3, 6, 0, 0), userId: u9, processedBy: "webhook" },
    // Platform attribution rows
    { _id: "BenefitsGranted-pi_META_CLICK", eventType: "BenefitsGranted", paymentIntentId: "pi_META_CLICK", packageType: "membership", packageId: "apprentice", data: { price: 10, billingReason: "subscription_create" }, convertingPlatform: "meta", attributionConfidence: "click", timestamp: createAESTDateAsUTC(2099, 3, 5, 16, 0), userId: u10, processedBy: "webhook" },
    { _id: "BenefitsGranted-pi_META_UTM", eventType: "BenefitsGranted", paymentIntentId: "pi_META_UTM", packageType: "membership", packageId: "apprentice", data: { price: 5, billingReason: "subscription_create" }, convertingPlatform: "meta", attributionConfidence: "utm_only", timestamp: createAESTDateAsUTC(2099, 3, 5, 17, 0), userId: u11, processedBy: "webhook" },
    { _id: "BenefitsGranted-pi_TIKTOK", eventType: "BenefitsGranted", paymentIntentId: "pi_TIKTOK", packageType: "membership", packageId: "apprentice", data: { price: 20, billingReason: "subscription_create" }, convertingPlatform: "tiktok", attributionConfidence: "click", timestamp: createAESTDateAsUTC(2099, 3, 5, 18, 0), userId: u12, processedBy: "webhook" },
    { _id: "BenefitsGranted-pi_NULL_PLAT", eventType: "BenefitsGranted", paymentIntentId: "pi_NULL_PLAT", packageType: "membership", packageId: "apprentice", data: { price: 7, billingReason: "subscription_create" }, convertingPlatform: null, attributionConfidence: null, timestamp: createAESTDateAsUTC(2099, 3, 5, 19, 0), userId: u13, processedBy: "webhook" },
  ]);

  return { dayStart, dayEnd };
}

async function run() {
  await connectDB();
  // Targeted delete — avoids nuking unrelated PaymentEvents in the shared dev DB
  await PaymentEvent.deleteMany({ paymentIntentId: { $in: TEST_PI_IDS } });
  const { dayStart, dayEnd } = await seed();

  const refunded = await loadRefundedPaymentIntentIds();
  const result = await aggregateRevenueForDay(dayStart, dayEnd, refunded);

  let passed = 0, failed = 0;
  function expect(name: string, actual: unknown, expected: unknown) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) {
      passed += 1;
      console.log(`✓ ${name}`);
    } else {
      failed += 1;
      console.error(`✗ ${name}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
    }
  }

  // Existing bucket assertions — total now includes 4 new platform rows (+10+5+20+7=42)
  expect("total revenue excludes refunded + boundary rows", result.total, 49 + 49 + 25 + 15 + 5 + 10 + 10 + 5 + 20 + 7);
  expect("membershipPurchase bucket", result.buckets.membershipPurchase, { revenue: 49 + 10 + 5 + 20 + 7, purchaseCount: 5 });
  expect("membershipRenewal bucket", result.buckets.membershipRenewal, { revenue: 49, purchaseCount: 1 });
  expect("oneTimePurchase bucket", result.buckets.oneTimePurchase, { revenue: 25, purchaseCount: 1 });
  expect("additionalOneTimePurchase bucket", result.buckets.additionalOneTimePurchase, { revenue: 15, purchaseCount: 1 });
  expect("miniDraw bucket", result.buckets.miniDraw, { revenue: 5, purchaseCount: 1 });
  expect("upsell bucket", result.buckets.upsell, { revenue: 10, purchaseCount: 1 });

  // Platform attribution assertions
  expect("byPlatform.meta.revenue", result.byPlatform.meta.revenue, 15);
  expect("byPlatform.meta.conversions", result.byPlatform.meta.conversions, 2);
  expect("byPlatform.meta.byConfidence.click", result.byPlatform.meta.byConfidence.click, 10);
  expect(
    "byPlatform.meta confidence sums to meta revenue",
    result.byPlatform.meta.byConfidence.click + result.byPlatform.meta.byConfidence.utm_only + result.byPlatform.meta.byConfidence.inferred_backfill,
    result.byPlatform.meta.revenue
  );
  expect("byPlatform.tiktok.revenue", result.byPlatform.tiktok.revenue, 20);
  expect("byPlatform.direct.revenue", result.byPlatform.direct.revenue, 7);
  expect("byPlatform.direct.byConfidence.inferred_backfill", result.byPlatform.direct.byConfidence.inferred_backfill, 7);
  const sumByPlatform = Object.values(result.byPlatform).reduce((s: number, p) => s + (p as { revenue: number }).revenue, 0);
  expect("sum of byPlatform revenues equals total", sumByPlatform, result.total);

  // Cleanup
  await PaymentEvent.deleteMany({ paymentIntentId: { $in: TEST_PI_IDS } });

  console.log(`\n${passed} passed, ${failed} failed`);
  await mongoose.disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => { console.error(err); process.exit(1); });
