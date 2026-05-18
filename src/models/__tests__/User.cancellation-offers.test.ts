import assert from "node:assert/strict";
import User from "../User";

function testDefaults() {
  const u = new User({ email: "t@t.com", name: "T", firstName: "T", lastName: "T" });
  // sub-fields default to false
  assert.strictEqual(u.get("retentionOffersConsumed.pause30d"), false);
  assert.strictEqual(u.get("retentionOffersConsumed.discount50_2mo"), false);
}

function testSettable() {
  const u = new User({ email: "t2@t.com", name: "T", firstName: "T2", lastName: "T" });
  u.set("retentionOffersConsumed.pause30d", true);
  assert.strictEqual(u.get("retentionOffersConsumed.pause30d"), true);
}

function run() {
  testDefaults();
  testSettable();
  console.log("PASS User retentionOffersConsumed");
}
run();
