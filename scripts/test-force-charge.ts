#!/usr/bin/env npx tsx

/**
 * Test Force Charge against a single user. Resolves user by email or
 * stripeCustomerId, prints their state and what Force Charge would do,
 * and (with --live) actually executes.
 *
 * Usage:
 *   # Dry-run by email
 *   npx tsx scripts/test-force-charge.ts --email=user@example.com
 *
 *   # Dry-run by Stripe customer id
 *   npx tsx scripts/test-force-charge.ts --customer=cus_xxx
 *
 *   # Live execution (requires --admin-email to log against)
 *   npx tsx scripts/test-force-charge.ts --email=user@example.com --live --admin-email=admin@example.com
 *
 * Always prints the eligibility result first. With --live, then runs the
 * orchestrator and prints the result row.
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const args = process.argv.slice(2);
const get = (key: string): string | undefined => {
  const flag = args.find((a) => a.startsWith(`--${key}=`));
  return flag ? flag.split("=").slice(1).join("=") : undefined;
};
const has = (key: string): boolean => args.includes(`--${key}`);

const email = get("email");
const customerId = get("customer");
const live = has("live");
const adminEmail = get("admin-email");

if (!email && !customerId) {
  console.error("Usage: --email=<addr> or --customer=<cus_id>");
  process.exit(1);
}
if (live && !adminEmail) {
  console.error("--live requires --admin-email=<admin's email>");
  process.exit(1);
}

async function main(): Promise<void> {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set (.env.local).");
    process.exit(1);
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("STRIPE_SECRET_KEY is not set (.env.local).");
    process.exit(1);
  }

  const mongoose = await import("mongoose");
  const User = (await import("../src/models/User")).default;
  const { checkForceChargeEligibility, forceChargeCurrentCycle } = await import(
    "../src/server/admin/forceChargePastDue"
  );

  await mongoose.connect(process.env.MONGODB_URI);

  // Resolve user
  let user: { _id: unknown; email?: string | null } | null = null;
  if (email) {
    user = await User.findOne({ email })
      .select("_id email stripeCustomerId stripeSubscriptionId subscription")
      .lean();
  } else if (customerId) {
    user = await User.findOne({ stripeCustomerId: customerId })
      .select("_id email stripeCustomerId stripeSubscriptionId subscription")
      .lean();
  }

  if (!user) {
    console.error(`No user found for email=${email ?? ""} customer=${customerId ?? ""}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const userId = String(user._id);
  console.log("=== Target user ===");
  console.log(`  email:           ${user.email ?? "(none)"}`);
  console.log(`  userId (Mongo):  ${userId}`);
  console.log("");

  console.log("=== Eligibility ===");
  const eligibility = await checkForceChargeEligibility({ userId });
  console.log(JSON.stringify(eligibility, null, 2));
  console.log("");

  if (!eligibility.eligible) {
    console.log(`Verdict: BLOCKED (${eligibility.reason})`);
    await mongoose.disconnect();
    return;
  }

  if (!live) {
    console.log("=== Plan (dry-run) ===");
    console.log(
      `  Will ${
        eligibility.target.kind === "stranded"
          ? "RECOVER (void stranded + finalize held draft) then PAY"
          : eligibility.target.kind === "draft"
            ? "FINALIZE then PAY"
            : "PAY"
      }`
    );
    console.log(`  invoice id: ${eligibility.target.invoice.id ?? "(none)"}`);
    console.log(`  expected amount (cents): ${eligibility.expectedAmountCents}`);
    console.log("");
    console.log("Pass --live to execute. Requires --admin-email.");
    await mongoose.disconnect();
    return;
  }

  // Live: resolve admin
  const admin = await User.findOne({ email: adminEmail, role: "admin" })
    .select("_id email")
    .lean();
  if (!admin) {
    console.error(`No admin user found for email=${adminEmail}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log("=== LIVE execution ===");
  console.log(`  admin: ${admin.email} (${admin._id})`);
  const result = await forceChargeCurrentCycle({
    userId,
    triggeredBy: "admin",
    adminId: String(admin._id),
  });
  console.log(JSON.stringify(result, null, 2));

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
