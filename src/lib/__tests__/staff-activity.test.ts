import { config } from "dotenv";
import path from "node:path";
import assert from "node:assert/strict";

// Load .env.local before dynamic imports that read env vars at module load.
// audit-log transitively imports @/lib/auth → @/lib/jwt, which throws if
// NEXTAUTH_SECRET / MONGODB_URI / GOOGLE_CLIENT_* are unset.
config({ path: path.resolve(process.cwd(), ".env.local") });

let failures = 0;
const test = (name: string, fn: () => void | Promise<void>) => {
  return Promise.resolve(fn())
    .then(() => console.log(`✓ ${name}`))
    .catch((e: Error) => {
      failures++;
      console.error(`✗ ${name}\n  ${e.message}`);
    });
};

async function main() {
  const { AREA_ACTIONS, PERMISSIONS, isValidPermission } = await import("@/lib/permissions");
  const { AREA_META, PERMISSION_META } = await import("@/lib/permission-descriptions");

  await test("audit area exists in catalog", () => {
    assert.ok(AREA_ACTIONS.audit, "AREA_ACTIONS.audit is missing");
    assert.deepEqual([...AREA_ACTIONS.audit], ["view"]);
  });

  await test("audit.view is a valid permission", () => {
    assert.ok(PERMISSIONS.includes("audit.view"));
    assert.equal(isValidPermission("audit.view"), true);
  });

  await test("audit AREA_META + PERMISSION_META present", () => {
    assert.ok(AREA_META.audit, "AREA_META.audit missing");
    assert.ok(AREA_META.audit.label.length > 0);
    assert.ok(AREA_META.audit.description.length > 0);
    assert.ok(PERMISSION_META["audit.view"], "PERMISSION_META[audit.view] missing");
    assert.ok(PERMISSION_META["audit.view"].label.length > 0);
    assert.ok(PERMISSION_META["audit.view"].description.length > 0);
  });

  const sampleInput = {
    actorId: "507f1f77bcf86cd799439011",
    actorEmail: "test@example.com",
    actorRoleName: "Test",
    action: "users.view",
    method: "GET" as const,
    path: "/api/admin/users",
    status: 200,
    timestamp: new Date(),
  };

  await test("safeLog never throws when StaffActivity.create rejects", async () => {
    // The model write throws (e.g. Mongo write failure). The helper must
    // swallow the error and not propagate it to the route handler.
    const { __safeLogForTest } = await import("@/lib/audit-log");
    await __safeLogForTest(sampleInput, {
      connect: () => Promise.resolve(),
      create: () => Promise.reject(new Error("simulated mongo write failure")),
    });
  });

  await test("safeLog never throws when connectDB rejects", async () => {
    // The DB connection itself throws (e.g. Mongo unreachable). The helper
    // must catch this earlier path too — if it didn't, every route adopting
    // requirePermissionWithAudit would inherit the unhandled rejection.
    const { __safeLogForTest } = await import("@/lib/audit-log");
    let createCalled = false;
    await __safeLogForTest(sampleInput, {
      connect: () => Promise.reject(new Error("simulated mongo unreachable")),
      create: () => {
        createCalled = true;
        return Promise.resolve();
      },
    });
    assert.equal(createCalled, false, "create() must not run when connect() fails");
  });

  await test("rewards area exists with view/edit/delete actions", () => {
    // Sanity check that the new rewards area landed in the catalog. The
    // existing AREA_META + PERMISSION_META iteration tests cover the metadata,
    // but pin the action list here so a future trim of the area doesn't go
    // un-noticed.
    assert.ok(AREA_ACTIONS.rewards, "AREA_ACTIONS.rewards is missing");
    assert.deepEqual([...AREA_ACTIONS.rewards], ["view", "edit", "delete"]);
    assert.equal(isValidPermission("rewards.edit"), true);
    assert.equal(isValidPermission("rewards.delete"), true);
  });

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed`);
    process.exit(1);
  }
  console.log("\nAll tests passed");
}

main();
