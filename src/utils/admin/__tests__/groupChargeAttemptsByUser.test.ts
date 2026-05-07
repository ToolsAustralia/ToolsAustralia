import assert from "node:assert/strict";
import {
  groupChargeAttemptsByUser,
  type ChargeAttemptInput,
} from "../groupChargeAttemptsByUser";

const baseAttempt: Omit<ChargeAttemptInput, "userId" | "userEmail" | "attemptedAt" | "status" | "amount"> = {
  invoiceId: "in_x",
  adminName: "Admin A",
  errorCode: undefined,
  declineCode: undefined,
  errorMessage: undefined,
};

function attempt(over: Partial<ChargeAttemptInput>): ChargeAttemptInput {
  return {
    ...baseAttempt,
    userId: "u1",
    userEmail: "a@x.com",
    status: "failed",
    amount: 10,
    attemptedAt: "2026-05-01T00:00:00Z",
    ...over,
  };
}

function testGroupsByUserId() {
  const result = groupChargeAttemptsByUser([
    attempt({ userId: "u1", userEmail: "a@x.com" }),
    attempt({ userId: "u2", userEmail: "b@x.com" }),
    attempt({ userId: "u1", userEmail: "a@x.com" }),
  ]);
  assert.equal(result.length, 2);
  const u1 = result.find((g) => g.userId === "u1");
  const u2 = result.find((g) => g.userId === "u2");
  assert.equal(u1?.attempts.length, 2);
  assert.equal(u2?.attempts.length, 1);
}

function testCountsByStatus() {
  const result = groupChargeAttemptsByUser([
    attempt({ status: "success", amount: 50 }),
    attempt({ status: "failed", amount: 30 }),
    attempt({ status: "skipped", amount: 0 }),
    attempt({ status: "failed", amount: 20 }),
  ]);
  const g = result[0];
  assert.equal(g.successCount, 1);
  assert.equal(g.failedCount, 2);
  assert.equal(g.skippedCount, 1);
  assert.equal(g.totalAmount, 100);
}

function testSortsAttemptsLatestFirst() {
  const result = groupChargeAttemptsByUser([
    attempt({ attemptedAt: "2026-05-01T00:00:00Z", status: "failed" }),
    attempt({ attemptedAt: "2026-05-03T00:00:00Z", status: "success" }),
    attempt({ attemptedAt: "2026-05-02T00:00:00Z", status: "skipped" }),
  ]);
  const g = result[0];
  assert.equal(g.attempts[0].attemptedAt, "2026-05-03T00:00:00Z");
  assert.equal(g.lastAttemptedAt, "2026-05-03T00:00:00Z");
  assert.equal(g.latestStatus, "success");
}

function testAdminLabelVarious() {
  const result = groupChargeAttemptsByUser([
    attempt({ attemptedAt: "2026-05-02T00:00:00Z", adminName: "Admin A" }),
    attempt({ attemptedAt: "2026-05-01T00:00:00Z", adminName: "Admin B" }),
  ]);
  assert.equal(result[0].adminLabel, "various");
}

function testAdminLabelSingle() {
  const result = groupChargeAttemptsByUser([
    attempt({ attemptedAt: "2026-05-02T00:00:00Z", adminName: "Admin A" }),
    attempt({ attemptedAt: "2026-05-01T00:00:00Z", adminName: "Admin A" }),
  ]);
  assert.equal(result[0].adminLabel, "Admin A");
}

function testGroupsSortedByLastAttemptDesc() {
  const result = groupChargeAttemptsByUser([
    attempt({ userId: "u1", attemptedAt: "2026-05-01T00:00:00Z" }),
    attempt({ userId: "u2", attemptedAt: "2026-05-03T00:00:00Z" }),
    attempt({ userId: "u3", attemptedAt: "2026-05-02T00:00:00Z" }),
  ]);
  assert.deepEqual(
    result.map((g) => g.userId),
    ["u2", "u3", "u1"]
  );
}

function testHandlesMissingUserIdWithSyntheticKey() {
  const result = groupChargeAttemptsByUser([
    attempt({ userId: null, userEmail: "anon@x.com" }),
    attempt({ userId: null, userEmail: "anon@x.com" }),
    attempt({ userId: "u1", userEmail: "a@x.com" }),
  ]);
  // null userIds with the same email collapse into one group.
  assert.equal(result.length, 2);
  const anon = result.find((g) => g.userId === null);
  assert.ok(anon);
  assert.equal(anon!.attempts.length, 2);
}

function run() {
  testGroupsByUserId();
  testCountsByStatus();
  testSortsAttemptsLatestFirst();
  testAdminLabelVarious();
  testAdminLabelSingle();
  testGroupsSortedByLastAttemptDesc();
  testHandlesMissingUserIdWithSyntheticKey();
  console.log("groupChargeAttemptsByUser tests passed");
}

run();
