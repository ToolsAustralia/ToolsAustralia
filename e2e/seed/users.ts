import bcrypt from "bcryptjs";
import type { Connection } from "mongoose";
import { MEMBER, ADMIN } from "../helpers/db";

/** Field template verified against scripts/seed-active-member.ts:223-261. */
export async function seedUsers(c: Connection): Promise<void> {
  const hash = await bcrypt.hash(MEMBER.password, 12);
  const now = new Date();
  const in30d = new Date(now.getTime() + 30 * 24 * 3600 * 1000);

  await c.collection("users").insertOne({
    email: MEMBER.email,
    password: hash,
    firstName: "E2E",
    lastName: "Member",
    role: "user",
    userType: "customer",
    isActive: true,
    isEmailVerified: true,
    profileSetupCompleted: true,
    birthdate: new Date("1990-01-01"), // 18+ (giveaway-eligibility.ts)
    state: "NSW", // not SA/ACT
    tokenVersion: 0,
    // Read-only display subscription. CAVEAT: fake Stripe ids — read-only specs must
    // NOT open flows that retrieve these ids from Stripe (e.g. subscription-management modal).
    stripeCustomerId: "cus_e2e_seeded_readonly",
    subscription: {
      packageId: "tradie-subscription",
      status: "active",
      isActive: true,
      startDate: now,
      endDate: in30d,
      autoRenew: true,
    },
    createdAt: now,
    updatedAt: now,
  });

  await c.collection("users").insertOne({
    email: ADMIN.email,
    password: hash,
    firstName: "E2E",
    lastName: "Admin",
    role: "admin", // sufficient for middleware /admin gate (middleware.ts:95-105)
    userType: "customer",
    isActive: true,
    isEmailVerified: true,
    profileSetupCompleted: true,
    birthdate: new Date("1990-01-01"),
    state: "NSW",
    tokenVersion: 0,
    createdAt: now,
    updatedAt: now,
  });
}
