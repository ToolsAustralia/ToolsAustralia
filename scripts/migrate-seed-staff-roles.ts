import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import connectDB from "../src/lib/mongodb";
import Role from "../src/models/Role";
import User from "../src/models/User";
import { PERMISSIONS } from "../src/lib/permissions";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(`Starting seed/backfill (dry-run=${DRY_RUN})...`);
  await connectDB();

  // 1) Seed Admin role
  let adminRole = await Role.findOne({ name: "Admin" });
  if (!adminRole) {
    if (!DRY_RUN) {
      adminRole = await Role.create({
        name: "Admin",
        permissions: PERMISSIONS,
        isSystem: true,
        createdBy: null,
      });
    }
    console.log(`✓ Seeded Admin role (${DRY_RUN ? "dry-run" : adminRole?._id})`);
  } else {
    // Keep permissions in sync if catalog grew
    const missing = PERMISSIONS.filter((p) => !adminRole!.permissions.includes(p));
    if (missing.length > 0) {
      if (!DRY_RUN) {
        adminRole.permissions = PERMISSIONS;
        await adminRole.save();
      }
      console.log(`✓ Synced Admin role permissions (+${missing.length})`);
    } else {
      console.log("✓ Admin role already up to date");
    }
  }

  // 2) Seed Ads Manager role (starter template)
  const ADS_MANAGER_PERMS = [
    "overview.view",
    "facebookAds.view",
    "facebookAds.edit",
    "pageAnalytics.view",
    "promoAnalytics.view",
    "abTesting.view",
  ];
  const existingAds = await Role.findOne({ name: "Ads Manager" });
  if (!existingAds) {
    if (!DRY_RUN) {
      await Role.create({
        name: "Ads Manager",
        permissions: ADS_MANAGER_PERMS,
        isSystem: false,
        createdBy: null,
      });
    }
    console.log("✓ Seeded Ads Manager role");
  } else {
    console.log("✓ Ads Manager already exists — leaving as-is");
  }

  // 3) Backfill existing users
  // In dry-run mode the Admin role may not exist yet — look it up or fall back to null
  const resolvedAdminRole = adminRole ?? (await Role.findOne({ name: "Admin" }));
  const adminId = resolvedAdminRole?._id ?? null;

  const legacyAdmins = await User.find({ role: "admin" });
  const customerCount = await User.countDocuments({ role: { $ne: "admin" } });
  console.log(`Found ${legacyAdmins.length} legacy admin users and ${customerCount} customers`);

  for (const u of legacyAdmins) {
    if (u.roleId && u.userType === "staff") continue;
    if (!DRY_RUN) {
      u.roleId = adminId;
      u.userType = "staff";
      await u.save({ validateBeforeSave: false });
    }
    console.log(`  ↳ Linked ${u.email} → Admin role`);
  }

  if (!DRY_RUN) {
    // Set userType="customer" for everyone else that doesn't have it
    const res = await User.updateMany(
      { role: { $ne: "admin" }, userType: { $exists: false } },
      { $set: { userType: "customer" } }
    );
    console.log(`✓ Backfilled userType=customer on ${res.modifiedCount} users`);
  } else {
    console.log("  (dry-run: skipped customer backfill)");
  }

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
