import assert from "node:assert/strict";
import { classifyIsRenewal } from "../classifyIsRenewal";

assert.equal(classifyIsRenewal({ billingReason: "subscription_create" }), false);
assert.equal(classifyIsRenewal({ billingReason: "subscription_cycle" }), true);
assert.equal(classifyIsRenewal({ billingReason: "subscription_update", isUpgrade: true }), false);
assert.equal(classifyIsRenewal({ billingReason: "subscription_cycle", isResubscribe: true }), false);
assert.equal(classifyIsRenewal({ billingReason: undefined }), false);

console.log("classifyIsRenewal: all assertions passed");
