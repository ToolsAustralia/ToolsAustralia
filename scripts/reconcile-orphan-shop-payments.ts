/**
 * Reconcile orphan shop PaymentIntents.
 *
 * If the Stripe webhook ever misses a `payment_intent.succeeded` for a shop PI
 * (network blip, timeout, deploy gap), the customer is charged but no Order row
 * is written. This script walks succeeded shop PIs older than HOURS_OLD, checks
 * each against the Order collection, and replays `finalizeShopOrder` for any
 * orphan it finds.
 *
 * Idempotent — `Order.paymentIntentId` is sparse + unique, so re-running on a
 * non-orphan PI is a no-op.
 *
 * Usage:
 *   npm run reconcile:shop-orphans:dry
 *   npm run reconcile:shop-orphans
 */
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import Order from "@/models/Order";
import { stripe } from "@/lib/stripe";
import { finalizeShopOrder } from "@/services/shop/finalizeShopOrder.service";

const DRY = process.argv.includes("--dry-run");
const HOURS_OLD = 1;

async function main() {
  await connectDB();
  const cutoff = Math.floor((Date.now() - HOURS_OLD * 3600 * 1000) / 1000);

  let processed = 0;
  for await (const pi of stripe.paymentIntents.list({ limit: 100, created: { lte: cutoff } })) {
    if (pi.metadata?.type !== "shop") continue;
    if (pi.status !== "succeeded") continue;

    const existing = await Order.findOne({ paymentIntentId: pi.id }).lean();
    if (existing) continue;

    console.error(`[reconcile] orphan PI ${pi.id}${DRY ? " (dry)" : ""}`);
    if (!DRY) {
      const result = await finalizeShopOrder({ paymentIntent: pi });
      console.error(`[reconcile] → ${result.status}`);
    }
    processed += 1;
  }
  console.error(`[reconcile] checked ${processed} orphans`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
