import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { strict as assert } from "node:assert";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import NormCallLog from "@/models/NormCallLog";

async function run() {
  await connectDB();
  const created: mongoose.Types.ObjectId[] = [];
  try {
    const log = await NormCallLog.create({
      requestId: "01TEST000000000000000000",
      registryKey: "health",
      tier: "read",
      method: "GET",
      path: "/api/internal/norm/v1/health",
      queryHash: "abc",
      bodyHash: "def",
      ip: "127.0.0.1",
      userAgent: "test",
      signatureValid: true,
      rateLimitState: { remaining: 119, limit: 120, windowMs: 60000 },
      tierContext: {},
      responseStatus: 200,
      durationMs: 5,
      responseHash: "ghi",
    });
    created.push(log._id);

    const fetched = await NormCallLog.findById(log._id).lean<{
      createdAt: Date;
      tier: string;
      requestId: string;
      signatureValid: boolean;
    } | null>();
    assert.ok(fetched, "doc persisted and fetchable");
    assert.ok(fetched!.createdAt instanceof Date, "createdAt set by default");
    assert.equal(fetched!.tier, "read");
    assert.equal(fetched!.requestId, "01TEST000000000000000000");
    assert.equal(fetched!.signatureValid, true);
    console.log("✓ NormCallLog round-trip ok");
  } finally {
    if (created.length) await NormCallLog.deleteMany({ _id: { $in: created } });
    await mongoose.disconnect();
  }
}

void run().catch((e) => {
  console.error(e);
  process.exit(1);
});
