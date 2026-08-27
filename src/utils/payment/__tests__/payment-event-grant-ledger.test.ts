import assert from "node:assert/strict";
import { foldGrantRows, emptyGrantLedger, type GrantRow } from "../payment-event-net-queries";

function testEmptyLedger() {
  const l = emptyGrantLedger();
  assert.deepEqual(l, {
    memberEntries: 0,
    oneTimeEntries: 0,
    upsellEntries: 0,
    miniDrawEntries: 0,
    netSpend: 0,
  });
}

function testFoldsEachPackageTypeToItsOwnBucket() {
  const rows: GrantRow[] = [
    { userId: "u1", packageType: "membership", entries: 150, price: 20 },
    { userId: "u1", packageType: "one-time", entries: 30, price: 25 },
    { userId: "u1", packageType: "upsell", entries: 60, price: 12 },
    { userId: "u1", packageType: "mini-draw", entries: 5, price: 9 },
  ];
  const out = foldGrantRows(rows);
  assert.deepEqual(out.get("u1"), {
    memberEntries: 150,
    oneTimeEntries: 30,
    upsellEntries: 60,
    miniDrawEntries: 5,
    netSpend: 66,
  });
}

// The whole point of the fix: two membership grants at a promo multiplier sum to what was
// GRANTED (150 + 1000), never to catalogue entriesPerMonth x months (15 + 100).
function testSumsRepeatedMembershipGrants() {
  const rows: GrantRow[] = [
    { userId: "u2", packageType: "membership", entries: 150, price: 20 },
    { userId: "u2", packageType: "membership", entries: 1000, price: 80 },
  ];
  const out = foldGrantRows(rows);
  assert.equal(out.get("u2")!.memberEntries, 1150);
  assert.equal(out.get("u2")!.netSpend, 100);
}

function testSeparatesUsers() {
  const rows: GrantRow[] = [
    { userId: "a", packageType: "membership", entries: 10, price: 1 },
    { userId: "b", packageType: "membership", entries: 20, price: 2 },
  ];
  const out = foldGrantRows(rows);
  assert.equal(out.get("a")!.memberEntries, 10);
  assert.equal(out.get("b")!.memberEntries, 20);
  assert.equal(out.size, 2);
}

function testMissingNumbersCountAsZero() {
  const rows: GrantRow[] = [
    { userId: "u3", packageType: "membership", entries: null, price: undefined },
  ];
  const out = foldGrantRows(rows);
  assert.equal(out.get("u3")!.memberEntries, 0);
  assert.equal(out.get("u3")!.netSpend, 0);
}

// A packageType outside the four paid sources (e.g. a future "shop" type) must not throw
// and must not silently land in the wrong bucket — it is simply not a paid entry grant.
function testUnknownPackageTypeIsIgnoredNotCrashed() {
  const rows = [{ userId: "u4", packageType: "shop", entries: 7, price: 3 }] as unknown as GrantRow[];
  const out = foldGrantRows(rows);
  assert.deepEqual(out.get("u4"), emptyGrantLedger());
}

function testEmptyInputReturnsEmptyMap() {
  assert.equal(foldGrantRows([]).size, 0);
}

function run() {
  testEmptyLedger();
  testFoldsEachPackageTypeToItsOwnBucket();
  testSumsRepeatedMembershipGrants();
  testSeparatesUsers();
  testMissingNumbersCountAsZero();
  testUnknownPackageTypeIsIgnoredNotCrashed();
  testEmptyInputReturnsEmptyMap();
  console.log("payment-event-grant-ledger tests passed");
}

run();
