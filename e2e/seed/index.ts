import mongoose from "mongoose";
import { resolveE2eEnv, assertE2eSafety, dbNameOf } from "../lib/env";
import { seedUsers } from "./users";
import { seedMajorDraw } from "./draw";

export async function wipeAndSeed(mongoUri?: string): Promise<void> {
  const uri = mongoUri ?? resolveE2eEnv().mongoUri;
  assertE2eSafety(process.env.MONGODB_URI, uri); // guard again at the point of destruction
  const conn = await mongoose.createConnection(uri).asPromise();
  try {
    console.log(`[e2e-seed] wiping database "${dbNameOf(uri)}"…`);
    await conn.dropDatabase();
    await seedUsers(conn);
    await seedMajorDraw(conn);
    console.log("[e2e-seed] seeded: member, admin, active major draw");
  } finally {
    await conn.close();
  }
}

// CLI entry: tsx e2e/seed/index.ts
if (require.main === module) {
  wipeAndSeed().then(
    () => process.exit(0),
    (e) => { console.error(e); process.exit(1); }
  );
}
