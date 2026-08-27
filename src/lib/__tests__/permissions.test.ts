import assert from "node:assert/strict";
import {
  AREA_ACTIONS,
  AREAS,
  PERMISSIONS,
  ALL_PERMISSIONS,
  isValidPermission,
  actionsFor,
  permissionFor,
} from "@/lib/permissions";
import {
  AREA_META,
  PERMISSION_META,
} from "@/lib/permission-descriptions";

let failures = 0;
const test = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failures++;
    console.error(`✗ ${name}\n  ${(e as Error).message}`);
  }
};

test("AREAS matches AREA_ACTIONS keys exactly", () => {
  assert.deepEqual(AREAS, Object.keys(AREA_ACTIONS));
  // Bump deliberately when an area is added. 18 as of 2026-08-26 - `shop` (gates the
  // previously-unauthenticated /api/products admin + destructive routes) and `receipts`
  // (the revenue ledger) were added on separate branches and both land in this merge.
  assert.equal(AREAS.length, 18);
});

test("every area declares at least a 'view' action", () => {
  for (const a of AREAS) {
    assert.ok(AREA_ACTIONS[a].includes("view"), `area ${a} is missing the 'view' action`);
  }
});

test("PERMISSIONS contains exactly one entry per (area, action) pair", () => {
  const expected = AREAS.reduce((sum, a) => sum + AREA_ACTIONS[a].length, 0);
  assert.equal(PERMISSIONS.length, expected);
  for (const a of AREAS) {
    for (const action of AREA_ACTIONS[a]) {
      assert.ok(PERMISSIONS.includes(`${a}.${action}` as never), `missing ${a}.${action}`);
    }
  }
});

test("Users area has the destructive + financial sub-actions", () => {
  assert.deepEqual(
    [...AREA_ACTIONS.users],
    ["view", "viewDetail", "edit", "export", "charge", "cancelSubscription", "refund", "delete"]
  );
});

test("users.view and users.viewDetail are separate — customer PII is its own grant", () => {
  // Regression guard for the 2026-08-13 split. `users.view` gated BOTH the roster and the
  // detail modal, so every role that could browse customers could read every customer's email,
  // mobile, address and payment history. Collapsing these back into one action silently
  // re-widens PII access across every existing role, with nothing else in CI to catch it.
  assert.ok(AREA_ACTIONS.users.includes("view"), "the customer list grant");
  assert.ok(AREA_ACTIONS.users.includes("viewDetail"), "the customer-record (PII) grant");
  assert.notEqual(
    AREA_ACTIONS.users.indexOf("view"),
    AREA_ACTIONS.users.indexOf("viewDetail"),
    "view and viewDetail must be distinct actions, not aliases"
  );
});

test("miniDraws.view and miniDraws.viewParticipants are separate — entrant PII is its own grant", () => {
  // Same split, same reason (2026-08-13). `miniDraws.view` gated the draw list AND the
  // CSV/Excel export — a full dump of every entrant's name, email, mobile and state. The new
  // action gates the export and the in-app roster together, because they return identical
  // data; collapsing them back into `view` silently re-widens PII access to every role that
  // can merely see the mini-draw lineup.
  assert.ok(AREA_ACTIONS.miniDraws.includes("view"), "the draw-list grant");
  assert.ok(AREA_ACTIONS.miniDraws.includes("viewParticipants"), "the entrant (PII) grant");
  assert.notEqual(
    AREA_ACTIONS.miniDraws.indexOf("view"),
    AREA_ACTIONS.miniDraws.indexOf("viewParticipants"),
    "view and viewParticipants must be distinct actions, not aliases"
  );
});

test("receipts.view and receipts.export are separate — the CSV is its own grant", () => {
  // Same split, same reason as `users.export` (2026-08-17). The Receipts ledger joins every
  // payment to the customer who made it; reading that table in the panel and downloading it
  // as a file are different risks, so the export carries its own action. Collapsing them
  // back into `view` silently hands a bulk revenue+PII dump to every role that can merely
  // open the tab.
  assert.ok(AREA_ACTIONS.receipts.includes("view"), "the ledger grant");
  assert.ok(AREA_ACTIONS.receipts.includes("export"), "the CSV (bulk PII) grant");
  assert.notEqual(
    AREA_ACTIONS.receipts.indexOf("view"),
    AREA_ACTIONS.receipts.indexOf("export"),
    "view and export must be distinct actions, not aliases"
  );
});

test("Promos area has the 'end' sub-action", () => {
  assert.ok(AREA_ACTIONS.promos.includes("end"));
});

test("Major draw, mini draws, and AB testing have 'selectWinner'", () => {
  assert.ok(AREA_ACTIONS.majorDraw.includes("selectWinner"));
  assert.ok(AREA_ACTIONS.miniDraws.includes("selectWinner"));
  assert.ok(AREA_ACTIONS.abTesting.includes("selectWinner"));
});

test("Submissions has reply (edit) and delete sub-actions", () => {
  assert.ok(AREA_ACTIONS.submissions.includes("edit"));
  assert.ok(AREA_ACTIONS.submissions.includes("delete"));
});

test("Mini draws has edit + delete (separate from major-draw permissions)", () => {
  assert.ok(AREA_ACTIONS.miniDraws.includes("edit"));
  assert.ok(AREA_ACTIONS.miniDraws.includes("delete"));
});

test("delete is always its own sub-action where a feature exposes a delete route", () => {
  // Repo rule: a delete must be gated separately from edit so a role can
  // grant write access without granting destructive removal.
  const deleteCapableAreas = [
    "users",
    "promos",
    "miniDraws",
    "submissions",
    "affiliates",
    "errorReports",
    "abTesting",
    "settings",
  ] as const;
  for (const a of deleteCapableAreas) {
    assert.ok(
      AREA_ACTIONS[a].includes("delete"),
      `${a} has DELETE routes but its catalog entry lacks a 'delete' sub-action`
    );
  }
});

test("Affiliates has 'processPayout' and 'delete'", () => {
  assert.ok(AREA_ACTIONS.affiliates.includes("processPayout"));
  assert.ok(AREA_ACTIONS.affiliates.includes("delete"));
});

test("ALL_PERMISSIONS is a Set with same size as PERMISSIONS", () => {
  assert.equal(ALL_PERMISSIONS.size, PERMISSIONS.length);
});

test("isValidPermission accepts known and rejects unknown", () => {
  assert.equal(isValidPermission("users.view"), true);
  assert.equal(isValidPermission("users.delete"), true);
  assert.equal(isValidPermission("users.charge"), true);
  assert.equal(isValidPermission("majorDraw.selectWinner"), true);
  assert.equal(isValidPermission("users.banhammer"), false);
  assert.equal(isValidPermission("overview.delete"), false);
  assert.equal(isValidPermission(""), false);
});

test("actionsFor returns the declared tuple", () => {
  assert.deepEqual([...actionsFor("settings")], ["view", "edit", "delete"]);
  assert.deepEqual([...actionsFor("overview")], ["view", "edit"]);
});

test("AREA_META has an entry for every area", () => {
  for (const a of AREAS) {
    const meta = AREA_META[a];
    assert.ok(meta, `AREA_META is missing ${a}`);
    assert.ok(meta.label.trim().length > 0, `${a} has empty label`);
    assert.ok(meta.description.trim().length > 0, `${a} has empty description`);
  }
});

test("PERMISSION_META has an entry for every permission", () => {
  for (const p of PERMISSIONS) {
    const meta = PERMISSION_META[p];
    assert.ok(meta, `PERMISSION_META is missing ${p}`);
    assert.ok(meta.label.trim().length > 0, `${p} has empty label`);
    assert.ok(meta.description.trim().length > 0, `${p} has empty description`);
  }
});

test("PERMISSION_META has no orphans (every key is a known permission)", () => {
  for (const key of Object.keys(PERMISSION_META)) {
    assert.ok(
      isValidPermission(key),
      `PERMISSION_META contains unknown permission: ${key}`
    );
  }
});

test("dangerous sub-actions are marked danger:true", () => {
  const dangerExpected = [
    "users.charge",
    "users.cancelSubscription",
    "users.refund",
    "users.delete",
    "users.export",
    "promos.end",
    "promos.delete",
    "majorDraw.selectWinner",
    "miniDraws.selectWinner",
    "miniDraws.delete",
    "submissions.delete",
    "affiliates.processPayout",
    "affiliates.delete",
    "errorReports.delete",
    "abTesting.selectWinner",
    "abTesting.delete",
    "receipts.export",
    "settings.delete",
  ] as const;
  for (const p of dangerExpected) {
    assert.equal(PERMISSION_META[p].danger, true, `${p} should be marked danger`);
  }
});

test("permissionFor composes (area, action) into a valid string", () => {
  assert.equal(permissionFor("users", "delete"), "users.delete");
  assert.equal(permissionFor("affiliates", "processPayout"), "affiliates.processPayout");
  // The cast below is exercised at type-check time too — passing an action
  // foreign to the area is a compile error.
  assert.equal(permissionFor("settings", "edit"), "settings.edit");
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll tests passed");
