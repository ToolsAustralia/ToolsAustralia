/**
 * Migration Script: Add shop Order fields (gstAmount, shippingCost, addressLine1)
 *
 * Backfills new fields introduced for the shop checkout flow:
 *  - gstAmount: derived from totalAmount * (1/11) (AU GST inclusive).
 *  - shippingCost: 0 (existing rows pre-date shop shipping).
 *  - shippingAddress.addressLine1: copied from legacy shippingAddress.address.
 *
 * Usage:
 *   npx tsx scripts/migrations/add-shop-order-fields.ts [--dry-run]
 *
 * Env: .env.local must have MONGODB_URI.
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import Order from "@/models/Order";

const DRY = process.argv.includes("--dry-run");

async function main() {
  console.error(`[migrate-shop-order-fields] starting${DRY ? " (DRY RUN)" : ""}`);
  await connectDB();

  // Backfill gstAmount and shippingCost where missing
  const filter = { $or: [{ gstAmount: { $exists: false } }, { shippingCost: { $exists: false } }] };
  const candidates = await Order.find(filter, { _id: 1, totalAmount: 1 }).lean();
  console.error(`[migrate-shop-order-fields] found ${candidates.length} rows to backfill`);

  let updated = 0;
  for (const row of candidates) {
    const total = (row as { totalAmount?: number }).totalAmount ?? 0;
    const gstAmount = Math.round(total * (1 / 11) * 100) / 100;
    const shippingCost = 0;
    if (DRY) {
      console.error(`[dry] _id=${row._id} → gstAmount=${gstAmount} shippingCost=${shippingCost}`);
    } else {
      await Order.updateOne({ _id: row._id }, { $set: { gstAmount, shippingCost } });
      updated += 1;
    }
  }

  // Address rename: address → addressLine1
  const renameFilter = {
    "shippingAddress.address": { $exists: true, $ne: null },
    "shippingAddress.addressLine1": { $in: [null, undefined, ""] },
  };
  const toRename = await Order.find(renameFilter, { _id: 1, "shippingAddress.address": 1 }).lean();
  console.error(`[migrate-shop-order-fields] found ${toRename.length} rows to copy address → addressLine1`);

  for (const row of toRename) {
    const addr = (row as { shippingAddress?: { address?: string } }).shippingAddress?.address;
    if (!addr) continue;
    if (DRY) {
      console.error(`[dry] _id=${row._id} → addressLine1="${addr}"`);
    } else {
      await Order.updateOne({ _id: row._id }, { $set: { "shippingAddress.addressLine1": addr } });
      updated += 1;
    }
  }

  console.error(`[migrate-shop-order-fields] done. ${DRY ? "would update" : "updated"} ${updated} rows`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[migrate-shop-order-fields] failed", err);
  process.exit(1);
});
