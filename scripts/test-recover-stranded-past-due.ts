#!/usr/bin/env npx tsx

/**
 * Test stranded past-due recovery against a single user. Resolves user by
 * email or stripeCustomerId, finds an eligible stranded invoice, prints
 * eligibility, and (with --live) actually executes the recovery flow.
 *
 * Usage:
 *   # Dry-run by email — finds the user's stranded invoice and prints eligibility
 *   npx tsx scripts/test-recover-stranded-past-due.ts --email=user@example.com
 *
 *   # Dry-run with explicit invoice
 *   npx tsx scripts/test-recover-stranded-past-due.ts --email=user@example.com --invoice=in_xxx
 *
 *   # Live execution (requires --admin-email to log against; bypasses 6h lock)
 *   npx tsx scripts/test-recover-stranded-past-due.ts --email=user@example.com --live --admin-email=admin@example.com
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
const invoiceArg = get("invoice");
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
  const { stripe } = await import("../src/lib/stripe");
  const { checkRecoveryEligibility, recoverStrandedPastDueInvoice } = await import(
    "../src/server/admin/recoverStrandedPastDue"
  );
  const { isOriginalInvoiceEligibleForRecovery } = await import(
    "../src/server/admin/recoverStrandedPastDuePolicy"
  );

  await mongoose.connect(process.env.MONGODB_URI);

  // Resolve target user
  type LeanUser = {
    _id: unknown;
    email?: string | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    subscription?: { status?: string | null } | null;
  };

  let user: LeanUser | null = null;
  if (email) {
    user = await User.findOne({ email })
      .select("_id email stripeCustomerId stripeSubscriptionId subscription")
      .lean<LeanUser | null>();
  } else if (customerId) {
    user = await User.findOne({ stripeCustomerId: customerId })
      .select("_id email stripeCustomerId stripeSubscriptionId subscription")
      .lean<LeanUser | null>();
  }

  if (!user) {
    console.error(`No user found for email=${email ?? ""} customer=${customerId ?? ""}`);
    await mongoose.disconnect();
    process.exit(2);
  }

  const userId = String(user._id);
  console.log(`User: ${user.email ?? userId}`);
  console.log(`  status:        ${user.subscription?.status ?? "(missing)"}`);
  console.log(`  customer:      ${user.stripeCustomerId ?? "(none)"}`);
  console.log(`  subscription:  ${user.stripeSubscriptionId ?? "(none)"}`);

  // Resolve target invoice
  let originalInvoiceId = invoiceArg;
  if (!originalInvoiceId) {
    if (!user.stripeCustomerId) {
      console.error("No customer id on user; pass --invoice=in_... explicitly.");
      await mongoose.disconnect();
      process.exit(3);
    }
    console.log("\nScanning open invoices for stranded candidates…");
    const list = await stripe.invoices.list({
      customer: user.stripeCustomerId,
      status: "open",
      limit: 100,
    });
    const stranded = list.data.find((inv) =>
      isOriginalInvoiceEligibleForRecovery(inv).eligible
    );
    if (!stranded?.id) {
      console.error(
        "No stranded open invoice found. User may not be in the 'Stripe gave up' state. Pass --invoice= to test against a specific invoice."
      );
      await mongoose.disconnect();
      process.exit(4);
    }
    originalInvoiceId = stranded.id;
    console.log(`  picked: ${originalInvoiceId} (attempt_count=${stranded.attempt_count}, next_payment_attempt=${stranded.next_payment_attempt ?? "null"})`);
  }

  // Eligibility check
  console.log("\nChecking eligibility…");
  const eligibility = await checkRecoveryEligibility({
    userId,
    originalInvoiceId,
    bypassRecentRecoveryLock: true,
  });
  console.log(JSON.stringify(eligibility, null, 2));

  if (!live) {
    console.log("\nDry run complete. Pass --live to actually execute.");
    await mongoose.disconnect();
    return;
  }

  if (!eligibility.eligible) {
    console.log("\nNot eligible — refusing to run live.");
    await mongoose.disconnect();
    process.exit(5);
  }

  // Resolve admin id
  const admin = await User.findOne({ email: adminEmail, role: "admin" })
    .select("_id email")
    .lean<{ _id: unknown; email?: string | null } | null>();
  if (!admin) {
    console.error(`No admin user found with email=${adminEmail ?? ""}`);
    await mongoose.disconnect();
    process.exit(6);
  }

  console.log("\nExecuting recovery…");
  const result = await recoverStrandedPastDueInvoice({
    userId,
    originalInvoiceId,
    adminId: String(admin._id),
    bypassRecentRecoveryLock: true,
  });
  console.log(JSON.stringify(result, null, 2));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(99);
});
