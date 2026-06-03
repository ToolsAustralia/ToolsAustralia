import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
import { strict as assert } from "node:assert";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import Role from "@/models/Role";
import {
  getNormPermissions,
  hasNormPermission,
  __clearNormPermissionsCacheForTests,
} from "@/lib/internal-norm/permissions";

async function run() {
  await connectDB();
  let normRoleId: mongoose.Types.ObjectId | null = null;
  try {
    __clearNormPermissionsCacheForTests();

    // Resolve Norm — the migration must have been run first
    const role = await Role.findOne({ name: "Norm" });
    assert.ok(role, "Norm role exists (run npm run migrate:create-norm first)");
    normRoleId = role!._id;
    const user = await User.findOne({ email: "norm@internal.toolsaustralia.com.au" });
    assert.ok(user, "Norm user exists (run npm run migrate:create-norm first)");

    const perms = await getNormPermissions();
    assert.ok(perms instanceof Set);
    assert.equal(perms.has("facebookAds.view"), true);
    assert.equal(perms.has("overview.view"), true);
    assert.equal(perms.has("users.delete"), false, "Norm should NOT have destructive permissions by default");

    assert.equal(await hasNormPermission("facebookAds.view"), true);
    assert.equal(await hasNormPermission("users.delete"), false);

    // Caching: temporarily grant a permission directly in Mongo, observe that the cached read still returns old set
    await Role.updateOne({ _id: normRoleId }, { $addToSet: { permissions: "users.view" } });
    const cached = await getNormPermissions();
    assert.equal(cached.has("users.view"), false, "cache holds stale set until cleared");
    __clearNormPermissionsCacheForTests();
    const fresh = await getNormPermissions();
    assert.equal(fresh.has("users.view"), true, "after cache clear, fresh read sees the new permission");

    console.log("✓ Norm permissions loader: read + cache + invalidate");
  } finally {
    // Cleanup: revert the temporary permission so subsequent tests aren't affected
    if (normRoleId) {
      await Role.updateOne({ _id: normRoleId }, { $pull: { permissions: "users.view" } });
    }
    __clearNormPermissionsCacheForTests();
    await mongoose.disconnect();
  }
}

void run().catch((e) => { console.error(e); process.exit(1); });
