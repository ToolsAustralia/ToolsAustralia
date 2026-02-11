/**
 * Utility to ensure database indexes are created
 *
 * Mongoose only creates indexes when models are first compiled.
 * This utility manually ensures critical indexes exist in the database.
 * Also drops redundant indexes (prefixes of compound indexes) per MongoDB Atlas recommendations.
 */

import PaymentEvent from "@/models/PaymentEvent";
import User from "@/models/User";
import Order from "@/models/Order";
import ErrorReport from "@/models/ErrorReport";
import Winner from "@/models/Winner";
import ExperimentEvent from "@/models/ab-testing/ExperimentEvent";
import Experiment from "@/models/ab-testing/Experiment";
import VariantAssignment from "@/models/ab-testing/VariantAssignment";
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
  ensureIndexesPromise = ensureCriticalIndexes();
  await ensureIndexesPromise;
  indexesEnsured = true;
  ensureIndexesPromise = null;
}

async function ensureCriticalIndexes(): Promise<void> {
  try {
    await connectDB();

    await dropRedundantIndexes();
    await ensurePaymentEventIndexes();
    await ensureUserIndexes();
    await ensureOrderIndexes();
  } catch (error) {
    console.error("❌ Failed to ensure indexes:", error);
    throw error;
  }
}

/** Drop redundant indexes per MongoDB Atlas recommendations (prefixes of compound indexes) */
async function dropRedundantIndexes(): Promise<void> {
  const toDrop: { collection: typeof User.collection; indexName: string }[] = [
    { collection: PaymentEvent.collection, indexName: "userId_1" },
    { collection: ErrorReport.collection, indexName: "userId_1" },
    { collection: ErrorReport.collection, indexName: "guestEmail_1" },
    { collection: ErrorReport.collection, indexName: "status_1" },
    { collection: ErrorReport.collection, indexName: "category_1" },
    { collection: ErrorReport.collection, indexName: "severity_1" },
    { collection: ErrorReport.collection, indexName: "autoLogged_1" },
    { collection: Winner.collection, indexName: "drawId_1" },
    { collection: Winner.collection, indexName: "drawType_1" },
    { collection: ExperimentEvent.collection, indexName: "experimentId_1" },
    { collection: Experiment.collection, indexName: "status_1" },
    { collection: VariantAssignment.collection, indexName: "experimentId_1" },
  ];

  for (const { collection, indexName } of toDrop) {
    try {
      await collection.dropIndex(indexName);
      // console.log(`✅ Dropped redundant index ${collection.collectionName}.${indexName}`);
    } catch (error: unknown) {
      const err = error as { code?: number };
      if (err.code !== 27) {
        // Code 27 = index doesn't exist, which is fine
        console.warn(`⚠️  Could not drop index ${collection.collectionName}.${indexName}:`, err);
      }
    }
  }
}

async function ensurePaymentEventIndexes(): Promise<void> {
  try {
    // console.log("🔍 Ensuring PaymentEvent indexes are created...");

    // ✅ CRITICAL FIX: Drop old non-unique index if it exists
    try {
      // Drop the old single-field index on paymentIntentId
      await PaymentEvent.collection.dropIndex("paymentIntentId_1");
      // console.log("✅ Dropped old paymentIntentId index");
    } catch (error: unknown) {
      const err = error as { code?: number };
      // Error code 27 means index doesn't exist - that's fine
      if (err.code !== 27) {
        // console.log("ℹ️  Old index doesn't exist or already dropped");
      }
    }

    // ✅ CRITICAL FIX: Drop old compound index if it exists without unique constraint
    try {
      await PaymentEvent.collection.dropIndex("paymentIntentId_1_eventType_1");
      // console.log("✅ Dropped old compound index (non-unique)");
    } catch (error: unknown) {
      const err = error as { code?: number };
      if (err.code !== 27) {
        // console.log("ℹ️  Old compound index doesn't exist");
      }
    }

    // ✅ CRITICAL FIX: Manually create the unique compound index
    // syncIndexes() sometimes fails if there are existing indexes
    try {
      await PaymentEvent.collection.createIndex(
        { paymentIntentId: 1, eventType: 1 },
        { unique: true, name: "paymentIntentId_1_eventType_1_unique" }
      );
      // console.log("✅ Manually created unique compound index");
    } catch (error: unknown) {
      const err = error as { code?: number; message?: string };
      // Code 85 or 86 means index already exists - that's fine if it's unique
      if (err.code === 85 || err.code === 86 || err.message?.includes("already exists")) {
        // console.log("ℹ️  Unique compound index already exists");
      } else {
        console.error("⚠️  Failed to create unique index:", error);
      }
    }

    // console.log("✅ PaymentEvent indexes ensured");

    // List all indexes for verification
    const indexes = await PaymentEvent.collection.indexes();
    // console.log(
    //   "📋 Current PaymentEvent indexes:",
    //   indexes.map((idx) => ({
    //     name: idx.name,
    //     key: idx.key,
    //     unique: idx.unique,
    //   }))
    // );

    // ✅ Verify the unique compound index exists
    const uniqueIndex = indexes.find((idx) => {
      const key = idx.key as Record<string, unknown>;
      return key.paymentIntentId === 1 && key.eventType === 1 && idx.unique === true;
    });

    if (uniqueIndex) {
      // console.log("✅ VERIFIED: Unique compound index is active!");
    } else {
      console.error("⚠️  WARNING: Unique compound index NOT found! Duplicates may still occur.");
    }
  } catch (error) {
    console.error("❌ Failed to ensure PaymentEvent indexes:", error);
    throw error;
  }
}

async function ensureUserIndexes(): Promise<void> {
  // console.log("🔍 Ensuring User indexes are created...");
  await ensureIndex(User.collection, { stripeCustomerId: 1 }, { sparse: true });
  // MongoDB Atlas recommended: compound index for subscription-related queries
  await ensureIndex(User.collection, {
    isActive: 1,
    "subscription.lastUpgradeDate": -1,
    "subscription.lastDowngradeDate": -1,
    "subscription.cancelledAt": -1,
  });
  // MongoDB Atlas recommended: compound index for active users sorted by creation date
  await ensureIndex(User.collection, { isActive: 1, createdAt: -1 });
  // console.log("✅ User indexes ensured");
}

async function ensureOrderIndexes(): Promise<void> {
  // console.log("🔍 Ensuring Order indexes are created...");
  await ensureIndex(Order.collection, { paymentIntentId: 1 }, { sparse: true });
  // console.log("✅ Order indexes ensured");
}

type MongooseCollection = typeof User.collection;

async function ensureIndex(
  collection: MongooseCollection,
  indexSpec: Record<string, 1 | -1>,
  options: { name?: string; sparse?: boolean } = {}
): Promise<void> {
  const indexName =
    options.name ||
    Object.entries(indexSpec)
      .map(([field, direction]) => `${field}_${direction as number}`)
      .join("_");

  const existingIndexes = await collection.indexes();
  const alreadyExists = existingIndexes.some((idx) => idx.name === indexName);

  if (alreadyExists) {
    // console.log(`ℹ️  Index "${indexName}" already exists`);
    return;
  }

  await collection.createIndex(indexSpec, options);
  // console.log(`✅ Created index "${indexName}"`);
}

// ✅ NOTE: Indexes are now ensured via ensureIndexesOnce() called from webhook handler
// This ensures indexes are created before any payment processing happens
