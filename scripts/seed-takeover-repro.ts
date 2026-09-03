import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * Seeds the ISOLATED repro database used by smoke-session-from-payment-takeover.
 * Writes a synthetic victim member and one active major draw (so the purchase gate
 * is open). Refuses to run against anything but a local MongoDB.
 */
async function main() {
  const uri = process.env.MONGODB_URI || "";
  if (!/(127\.0\.0\.1|localhost)/.test(uri)) {
    console.error("REFUSING: MONGODB_URI is not local. This seeder must never touch a remote cluster.");
    console.error("Run with: MONGODB_URI=mongodb://127.0.0.1:27018/ta_repro npx tsx scripts/seed-takeover-repro.ts <cus_id>");
    process.exit(1);
  }
  const customerId = process.argv[2];
  if (!customerId?.startsWith("cus_")) {
    console.error("Pass the test-mode Stripe customer id as argv[2].");
    process.exit(1);
  }

  const mongoose = (await import("mongoose")).default;
  await mongoose.connect(uri);

  const { default: User } = await import("@/models/User");
  const { default: MajorDraw } = await import("@/models/MajorDraw");

  await User.deleteMany({ email: "victim@example.test" });
  const victim = await User.create({
    email: "victim@example.test",
    firstName: "Victim",
    lastName: "Member",
    isActive: true,
    stripeCustomerId: customerId,
    accumulatedEntries: 250,
  });

  await MajorDraw.deleteMany({ name: "Repro Draw" });
  await MajorDraw.create({
    name: "Repro Draw",
    description: "Isolated repro draw — never customer facing.",
    status: "active",
    activationDate: new Date(Date.now() - 86_400_000),
    drawDate: new Date(Date.now() + 86_400_000 * 7),
    freezeEntriesAt: new Date(Date.now() + 86_400_000 * 6),
    entries: [],
  });

  console.log(`seeded victim  : ${victim.email}  _id=${victim._id}  stripe=${customerId}`);
  console.log(`seeded draw    : Repro Draw (active)`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("seed failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
