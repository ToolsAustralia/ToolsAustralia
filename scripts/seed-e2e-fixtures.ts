// scripts/seed-e2e-fixtures.ts
//
// Idempotent seed for the E2E test roster. Mirrors the pattern from
// scripts/seed-shop-products.ts (dotenv → connectDB → upsert → disconnect).
//
// Runs from globalSetup or CLI. Use `--clear` to delete without re-creating.

import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import Affiliate from "@/models/Affiliate";
import { getOrCreateReferralProfile } from "@/lib/referral";
import { handleSubscriptionQueueUpdate } from "@/utils/partner-discounts/partner-discount-queue";
import { getPackageById } from "@/data/membershipPackages";
import {
  ensureE2ECustomer,
  attachTestPaymentMethod,
  ensureE2ESubscription,
  listE2ECustomers,
  deleteE2ECustomer,
} from "./e2e-stripe-helpers";
import {
  rosterFor,
  workerCount,
  PACKAGE_ID_BY_ROLE,
  E2E_USER_PASSWORD,
  type RoleProfile,
} from "../e2e/fixtures/test-users";
import { klaviyo } from "@/lib/klaviyo";

const isClearOnly = process.argv.includes("--clear");

async function purgeKlaviyoForEmails(emails: string[]): Promise<void> {
  if (emails.length === 0) return;
  let queued = 0;
  let skipped = 0;
  for (const email of emails) {
    try {
      const r = await klaviyo.deleteProfile(email);
      if (r.success) queued++;
      else skipped++;
    } catch {
      skipped++;
    }
  }
  console.log(`  → Klaviyo: ${queued} deletion jobs queued, ${skipped} skipped`);
}

async function main() {
  if (!E2E_USER_PASSWORD) {
    throw new Error("E2E_TEST_USER_PASSWORD is not set in .env.local");
  }

  await connectDB();

  console.log(isClearOnly ? "🧹 Clearing E2E fixtures..." : "🌱 Seeding E2E fixtures...");

  // 1. Always purge first — seed is fully idempotent.
  // Collect emails BEFORE delete so we can also queue Klaviyo deletions.
  const existingUsers = await User.find({ email: /^test-e2e-/ }, { email: 1 }).lean();
  const existingAffiliates = await Affiliate.find({ email: /^test-e2e-/ }, { email: 1 }).lean();
  const existingEmails = [
    ...existingUsers.map((u) => u.email),
    ...existingAffiliates.map((a) => a.email),
  ];

  await User.deleteMany({ email: /^test-e2e-/ });
  await Affiliate.deleteMany({ email: /^test-e2e-/ });

  // 2. Stripe-side cleanup (only e2e-tagged customers).
  const stripeIds = await listE2ECustomers();
  console.log(`  → deleting ${stripeIds.length} Stripe e2e customer(s)`);
  for (const id of stripeIds) {
    await deleteE2ECustomer(id);
  }

  // 3. Klaviyo-side cleanup — queue async deletion jobs by email.
  await purgeKlaviyoForEmails(existingEmails);

  if (isClearOnly) {
    console.log("✅ Cleared. Exiting (--clear).");
    await mongoose.disconnect();
    return;
  }

  // 3. Re-seed: one roster per worker index
  const workers = workerCount();
  const passwordHash = await bcrypt.hash(E2E_USER_PASSWORD, 12);

  for (let w = 0; w < workers; w++) {
    console.log(`  → worker ${w}`);
    const roster = rosterFor(w);
    for (const profile of roster) {
      await seedRole(profile, passwordHash);
    }
  }

  console.log(`✅ Seeded ${workers * 7} fixtures (${workers} workers × 7 roles)`);
  await mongoose.disconnect();
}

async function seedRole(profile: RoleProfile, passwordHash: string): Promise<void> {
  if (profile.role === "affiliate") {
    return seedAffiliate(profile, passwordHash);
  }
  return seedUser(profile, passwordHash);
}

async function seedUser(profile: RoleProfile, passwordHash: string): Promise<void> {
  const baseUserDoc = {
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    password: passwordHash,
    isEmailVerified: true,
    profileSetupCompleted: true,
    isActive: true,
  };

  // "fresh": no subscription, no Stripe.
  if (profile.role === "fresh") {
    await User.create(baseUserDoc);
    return;
  }

  // Member roles: full Stripe + subscription state.
  const packageId = PACKAGE_ID_BY_ROLE[profile.role as keyof typeof PACKAGE_ID_BY_ROLE];
  const pkg = getPackageById(packageId);
  if (!pkg) {
    throw new Error(`Unknown packageId "${packageId}" for role ${profile.role}`);
  }

  const { customerId } = await ensureE2ECustomer({
    email: profile.email,
    name: `${profile.firstName} ${profile.lastName}`,
    role: profile.role,
  });
  await attachTestPaymentMethod(customerId);
  const { subscriptionId, currentPeriodEnd } = await ensureE2ESubscription({
    customerId,
    packageId,
  });

  const startDate = new Date();
  const user = await User.create({
    ...baseUserDoc,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    subscription: {
      packageId,
      isActive: true,
      status: "active",
      autoRenew: true,
      startDate,
      endDate: currentPeriodEnd,
    },
  });

  // Mirror production side-effects (per investigation §11)
  await getOrCreateReferralProfile(user._id.toString());
  await handleSubscriptionQueueUpdate(user, "start", {
    packageId,
    packageName: pkg.name,
    endDate: currentPeriodEnd,
  });

  // Variant patches AFTER baseline state is set (per investigation §7)
  if (profile.role === "cancelling") {
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          "subscription.autoRenew": false,
          "subscription.cancelledAt": new Date(),
        },
      },
    );
  } else if (profile.role === "pastdue") {
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          "subscription.isActive": false,
          "subscription.status": "past_due",
          "subscription.pastDueAt": new Date(),
        },
      },
    );
  }
}

async function seedAffiliate(profile: RoleProfile, passwordHash: string): Promise<void> {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const workerSuffix = profile.email.match(/-w(\d+)/)?.[1] ?? "0";
  const username = `affiliate-e2e-w${workerSuffix}`; // lowercase — schema lowercases anyway
  const code = `AFFE2EW${workerSuffix}`.toUpperCase();
  await Affiliate.create({
    name: `${profile.firstName} ${profile.lastName}`,
    email: profile.email,
    username,
    password: passwordHash,
    affiliateCode: code,
    affiliateLink: `${baseUrl}/membership?ref=${code}`,
    isActive: true,
    commissionRate: 0.3,
  });
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
