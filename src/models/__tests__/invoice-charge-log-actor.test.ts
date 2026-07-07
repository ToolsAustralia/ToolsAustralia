/**
 * InvoiceChargeLog `actor` + conditional `adminId` — schema validation (offline via validateSync).
 * Run: npm run test:invoice-charge-log-actor
 */
import assert from "node:assert/strict";
import mongoose from "mongoose";
import InvoiceChargeLog from "../InvoiceChargeLog";

function testMemberActorValidatesWithoutAdminId() {
  const doc = new InvoiceChargeLog({
    invoiceId: "in_x",
    customerId: "cus_x",
    userId: new mongoose.Types.ObjectId(),
    actor: "member",
    status: "success",
    amount: 4000,
    attemptedAt: new Date(),
  });
  const err = doc.validateSync();
  assert.equal(err, undefined, `member row without adminId should validate; got: ${err?.message}`);
}

function testAdminActorRequiresAdminId() {
  const doc = new InvoiceChargeLog({
    invoiceId: "in_x",
    customerId: "cus_x",
    userId: new mongoose.Types.ObjectId(),
    actor: "admin",
    status: "success",
    amount: 4000,
    attemptedAt: new Date(),
  });
  const err = doc.validateSync();
  assert.ok(err, "admin row without adminId should FAIL validation");
  assert.ok(err?.errors?.adminId, "the failing path should be adminId");
}

function testDefaultActorIsAdminAndAcceptsAdminId() {
  // Back-compat: existing writers pass adminId and no actor -> actor defaults to "admin".
  const doc = new InvoiceChargeLog({
    invoiceId: "in_x",
    customerId: "cus_x",
    userId: new mongoose.Types.ObjectId(),
    adminId: new mongoose.Types.ObjectId(),
    status: "success",
    amount: 4000,
    attemptedAt: new Date(),
  });
  assert.equal(doc.get("actor"), "admin", "actor should default to 'admin'");
  assert.equal(doc.validateSync(), undefined, "admin row with adminId should validate");
}

testMemberActorValidatesWithoutAdminId();
testAdminActorRequiresAdminId();
testDefaultActorIsAdminAndAcceptsAdminId();
console.log("InvoiceChargeLog actor tests passed");
