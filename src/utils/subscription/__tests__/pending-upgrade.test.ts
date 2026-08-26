import assert from "node:assert/strict";
import { isValidPendingUpgrade } from "../pending-upgrade";

// THE REGRESSION THIS FILE EXISTS FOR.
// `subscription.pendingChange` is a Mongoose NESTED OBJECT with all-optional sub-fields, so
// Mongoose materialises it as `{}` on every hydrated document. `!!{}` is `true`, which made
// `subscription_has_pending_upgrade` a hardcoded `true` for all 56,360 production profiles
// while ZERO users had a real pending upgrade. `tsc` cannot catch this. Keep this test.
function testEmptyObjectIsNotAPendingUpgrade() {
  assert.equal(isValidPendingUpgrade({}), false);
}

function testUndefinedAndNullAreNot() {
  assert.equal(isValidPendingUpgrade(undefined), false);
  assert.equal(isValidPendingUpgrade(null), false);
}

function testRealUpgradeIsRecognised() {
  assert.equal(
    isValidPendingUpgrade({ changeType: "upgrade", newPackageId: "boss-subscription" }),
    true
  );
}

function testEmptyPackageIdIsNot() {
  assert.equal(isValidPendingUpgrade({ changeType: "upgrade", newPackageId: "" }), false);
}

function testWrongChangeTypeIsNot() {
  assert.equal(
    isValidPendingUpgrade({ changeType: "downgrade", newPackageId: "tradie-subscription" }),
    false
  );
}

function testMissingChangeTypeIsNot() {
  assert.equal(isValidPendingUpgrade({ newPackageId: "boss-subscription" }), false);
}

function testNonObjectsAreNot() {
  assert.equal(isValidPendingUpgrade("upgrade"), false);
  assert.equal(isValidPendingUpgrade(1), false);
  assert.equal(isValidPendingUpgrade(true), false);
}

function run() {
  testEmptyObjectIsNotAPendingUpgrade();
  testUndefinedAndNullAreNot();
  testRealUpgradeIsRecognised();
  testEmptyPackageIdIsNot();
  testWrongChangeTypeIsNot();
  testMissingChangeTypeIsNot();
  testNonObjectsAreNot();
  console.log("pending-upgrade tests passed");
}

run();
