/**
 * Utility to ensure database indexes are created
 *
 * Mongoose only creates indexes when models are first compiled.
 * This utility manually ensures critical indexes exist in the database.
 */

import PaymentEvent from "@/models/PaymentEvent";
import connectDB from "@/lib/mongodb";

// ✅ CRITICAL: Singleton pattern - only run index creation once per server instance
let indexesEnsured = false;
let ensureIndexesPromise: Promise<void> | null = null;

export async function ensureIndexesOnce(): Promise<void> {
  // If already ensured, skip
  if (indexesEnsured) {
    return;
  }

  // If already in progress, wait for it to complete
  if (ensureIndexesPromise) {
    return ensureIndexesPromise;
  }

  // Start ensuring indexes
  ensureIndexesPromise = ensurePaymentEventIndexes();
  await ensureIndexesPromise;
  indexesEnsured = true;
  ensureIndexesPromise = null;
}

async function ensurePaymentEventIndexes(): Promise<void> {
  try {
    await connectDB();

    console.log("🔍 Ensuring PaymentEvent indexes are created...");

    // ✅ CRITICAL FIX: Drop old non-unique index if it exists
    try {
      // Drop the old single-field index on paymentIntentId
      await PaymentEvent.collection.dropIndex("paymentIntentId_1");
      console.log("✅ Dropped old paymentIntentId index");
    } catch (error: unknown) {
      const err = error as { code?: number };
      // Error code 27 means index doesn't exist - that's fine
      if (err.code !== 27) {
        console.log("ℹ️  Old index doesn't exist or already dropped");
      }
    }

    // ✅ CRITICAL FIX: Drop old compound index if it exists without unique constraint
    try {
      await PaymentEvent.collection.dropIndex("paymentIntentId_1_eventType_1");
      console.log("✅ Dropped old compound index (non-unique)");
    } catch (error: unknown) {
      const err = error as { code?: number };
      if (err.code !== 27) {
        console.log("ℹ️  Old compound index doesn't exist");
      }
    }

    // ✅ CRITICAL FIX: Manually create the unique compound index
    // syncIndexes() sometimes fails if there are existing indexes
    try {
      await PaymentEvent.collection.createIndex(
        { paymentIntentId: 1, eventType: 1 },
        { unique: true, name: "paymentIntentId_1_eventType_1_unique" }
      );
      console.log("✅ Manually created unique compound index");
    } catch (error: unknown) {
      const err = error as { code?: number; message?: string };
      // Code 85 or 86 means index already exists - that's fine if it's unique
      if (err.code === 85 || err.code === 86 || err.message?.includes("already exists")) {
        console.log("ℹ️  Unique compound index already exists");
      } else {
        console.error("⚠️  Failed to create unique index:", error);
      }
    }

    console.log("✅ PaymentEvent indexes ensured");

    // List all indexes for verification
    const indexes = await PaymentEvent.collection.indexes();
    console.log(
      "📋 Current PaymentEvent indexes:",
      indexes.map((idx) => ({
        name: idx.name,
        key: idx.key,
        unique: idx.unique,
      }))
    );

    // ✅ Verify the unique compound index exists
    const uniqueIndex = indexes.find((idx) => {
      const key = idx.key as Record<string, unknown>;
      return key.paymentIntentId === 1 && key.eventType === 1 && idx.unique === true;
    });

    if (uniqueIndex) {
      console.log("✅ VERIFIED: Unique compound index is active!");
    } else {
      console.error("⚠️  WARNING: Unique compound index NOT found! Duplicates may still occur.");
    }
  } catch (error) {
    console.error("❌ Failed to ensure PaymentEvent indexes:", error);
    throw error;
  }
}

// ✅ NOTE: Indexes are now ensured via ensureIndexesOnce() called from webhook handler
// This ensures indexes are created before any payment processing happens
