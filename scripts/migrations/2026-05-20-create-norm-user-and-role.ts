import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import connectDB from "../../src/lib/mongodb";
import User from "../../src/models/User";
import Role from "../../src/models/Role";

const NORM_EMAIL = "norm@internal.toolsaustralia.com.au";
const NORM_ROLE_NAME = "Norm";
const NORM_ROLE_COLOR = "#2563eb";
// Initial permissions for Phase 2 + Phase 3 endpoints. Anything beyond this is granted by the
// owner via Settings → Roles → Norm.
const NORM_INITIAL_PERMISSIONS = ["facebookAds.view", "overview.view"];

async function run() {
  await connectDB();

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1) Upsert Norm Role
    let role = await Role.findOne({ name: NORM_ROLE_NAME }).session(session);
    if (!role) {
      const created = await Role.create(
        [
          {
            name: NORM_ROLE_NAME,
            color: NORM_ROLE_COLOR,
            permissions: NORM_INITIAL_PERMISSIONS,
            isSystem: true,
            createdBy: null,
          },
        ],
        { session }
      );
      role = created[0];
      console.log(`✓ Created Norm role (${role._id})`);
    } else {
      // Leave existing permissions alone — owner may have edited them.
      // Just align color + isSystem if they drifted.
      let changed = false;
      if (!role.color) { role.color = NORM_ROLE_COLOR; changed = true; }
      if (!role.isSystem) { role.isSystem = true; changed = true; }
      if (changed) {
        await role.save({ session });
        console.log("✓ Aligned Norm role (color/isSystem)");
      } else {
        console.log("✓ Norm role already present and aligned");
      }
    }

    // 2) Upsert Norm User
    let user = await User.findOne({ email: NORM_EMAIL }).session(session);
    if (!user) {
      const created = await User.create(
        [
          {
            firstName: "Norm",
            lastName: "(AI Assistant)",
            email: NORM_EMAIL,
            userType: "staff",
            roleId: role._id,
            serviceAccount: true,
            isActive: true,
          },
        ],
        { session }
      );
      user = created[0];
      console.log(`✓ Created Norm user (${user._id})`);
    } else {
      let changed = false;
      if (user.userType !== "staff") { user.userType = "staff"; changed = true; }
      if (String(user.roleId) !== String(role._id)) { user.roleId = role._id; changed = true; }
      if (user.serviceAccount !== true) { user.serviceAccount = true; changed = true; }
      if (changed) {
        // Skip validation on align — a pre-existing Norm user may have other fields (e.g. mobile) that
        // would now fail newer validators; we only care about the three RBAC fields we're aligning.
        await user.save({ session, validateBeforeSave: false });
        console.log("✓ Aligned Norm user (userType/roleId/serviceAccount)");
      } else {
        console.log("✓ Norm user already present and aligned");
      }
    }

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    console.error("Migration failed:", error);
    throw error;
  } finally {
    await session.endSession();
    await mongoose.disconnect();
  }
}

void run().catch((error) => {
  // Log the reason. This used to be `catch(() => process.exit(1))`, which exited 1
  // with ZERO output — on 2026-09-04 that turned a CI failure into a guessing game:
  // the log showed "Created Norm role", "Created Norm user", "MongoDB disconnected",
  // then a bare exit 1 and nothing else. A script that fails silently costs more to
  // diagnose than it ever saves.
  //
  // Note the inner catch cannot be relied on to report either: it does
  // `await session.abortTransaction()` BEFORE `console.error`, so if the abort also
  // throws (which it does when the commit itself failed) the original error is never
  // printed. This handler is the backstop.
  console.error("migrate:create-norm failed:", error instanceof Error ? error.stack : error);
  process.exit(1);
});
