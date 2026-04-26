import assert from "node:assert/strict";
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  getActiveSubscriptionFilter,
} from "../userFilterBuilder";

function testGetActiveSubscriptionFilterIncludesActiveAndTrialing() {
  const f = getActiveSubscriptionFilter();
  assert.deepEqual(f["subscription.status"], { $in: [...ACTIVE_SUBSCRIPTION_STATUSES] });
  assert.equal(f["subscription.isActive"], true);
  assert.deepEqual(f["subscription.autoRenew"], { $ne: false });
  assert.equal(f.isActive, true);
}

function testGetActiveSubscriptionFilterOmitUserActive() {
  const f = getActiveSubscriptionFilter(false);
  assert.equal("isActive" in f, false);
  assert.deepEqual(f["subscription.status"], { $in: [...ACTIVE_SUBSCRIPTION_STATUSES] });
}

function run() {
  testGetActiveSubscriptionFilterIncludesActiveAndTrialing();
  testGetActiveSubscriptionFilterOmitUserActive();
  console.log("userFilterBuilder tests passed");
}

run();
