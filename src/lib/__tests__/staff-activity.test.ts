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

  await test("safeLog never throws when StaffActivity.create rejects", async () => {
    // Stub the model so create() rejects. The helper must swallow the error
    // and not propagate it to the route handler.
    const { __safeLogForTest } = await import("@/lib/audit-log");
    const stubModel = {
      create: () => Promise.reject(new Error("simulated mongo down")),
    };
    // Should resolve without throwing
    await __safeLogForTest(
      {
        actorId: "507f1f77bcf86cd799439011",
        actorEmail: "test@example.com",
        actorRoleName: "Test",
        action: "users.view",
        method: "GET",
        path: "/api/admin/users",
        status: 200,
        timestamp: new Date(),
      },
      stubModel as never
    );
  });

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed`);
    process.exit(1);
  }
  console.log("\nAll tests passed");
}

main();
