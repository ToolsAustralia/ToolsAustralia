import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
import { strict as assert } from "node:assert";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";

async function run() {
  await connectDB();
  const created: mongoose.Types.ObjectId[] = [];
  try {
    // Case 1: explicitly setting serviceAccount: true persists round-trip.
    const emailTrue = `norm-test-true-${Date.now()}@internal.dev`;
    const createdTrue = await User.create({
      firstName: "Test",
      lastName: "Service",
      email: emailTrue,
      userType: "staff",
      serviceAccount: true,
    });
    created.push(createdTrue._id as unknown as mongoose.Types.ObjectId);
    const fetchedTrue = await User.findById(createdTrue._id).lean();
    assert.ok(fetchedTrue, "expected to re-fetch user with serviceAccount: true");
    assert.equal(fetchedTrue!.userType, "staff");
    assert.equal(fetchedTrue!.serviceAccount, true);

    // Case 2: omitting serviceAccount defaults to false after round-trip.
    // Guards against someone removing `default: false` from the schema.
    const emailDefault = `norm-test-default-${Date.now()}@internal.dev`;
    const createdDefault = await User.create({
      firstName: "Test",
      lastName: "Default",
      email: emailDefault,
      userType: "staff",
    });
    created.push(createdDefault._id as unknown as mongoose.Types.ObjectId);
    const fetchedDefault = await User.findById(createdDefault._id).lean();
    assert.ok(fetchedDefault, "expected to re-fetch user without serviceAccount");
    assert.equal(fetchedDefault!.serviceAccount, false);

    console.log("✓ User.serviceAccount round-trip ok");
  } finally {
    if (created.length) await User.deleteMany({ _id: { $in: created } });
    await mongoose.disconnect();
  }
}

void run().catch((e) => {
  console.error(e);
  process.exit(1);
});
