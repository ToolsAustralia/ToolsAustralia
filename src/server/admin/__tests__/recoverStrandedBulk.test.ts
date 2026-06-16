/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";

// @/lib/stripe constructs a Stripe client at import — give it a dummy key for mocking.
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy_for_orchestrator_mock";
process.env.KLAVIYO_ENABLED ||= "false";

const ADMIN = "507f1f77bcf86cd799439011";
const U1 = "507f1f77bcf86cd799439012";
const U2 = "507f1f77bcf86cd799439013";

type AnyFn = (...a: any[]) => any;

async function main() {
  const { stripe } = await import("@/lib/stripe");
  const ChargeJobLock = (await import("@/models/ChargeJobLock")).default;
  const ChargeJobRun = (await import("@/models/ChargeJobRun")).default;
  const InvoiceChargeLog = (await import("@/models/InvoiceChargeLog")).default;
  const { runStrandedRecovery } = await import("@/server/admin/recoverStrandedBulk");

  let calls: Array<{ m: string; a: any[] }> = [];
  const argsOf = (m: string) => calls.filter((c) => c.m === m).map((c) => c.a[0]);

  function installMocks(opts: { voidThrows?: Set<string>; finalizeThrows?: Set<string> } = {}) {
    calls = [];
    (ChargeJobLock as any).findOneAndUpdate = (async (...a: any[]) => { calls.push({ m: "lock.acquire", a }); return {}; }) as AnyFn;
    (ChargeJobLock as any).findByIdAndUpdate = (async (...a: any[]) => { calls.push({ m: "lock.release", a }); return {}; }) as AnyFn;
    (ChargeJobRun as any).create = (async (doc: any) => { calls.push({ m: "run.create", a: [doc] }); return { _id: "run_1" }; }) as AnyFn;
    (ChargeJobRun as any).updateOne = (async (...a: any[]) => { calls.push({ m: "run.updateOne", a }); return {}; }) as AnyFn;
    (InvoiceChargeLog as any).create = (async (doc: any) => { calls.push({ m: "log.create", a: [doc] }); return {}; }) as AnyFn;
    (stripe.invoices as any).voidInvoice = (async (id: string) => { calls.push({ m: "void", a: [id] }); if (opts.voidThrows?.has(id)) throw new Error("void boom"); return { id, status: "void" }; }) as AnyFn;
    (stripe.invoices as any).del = (async (id: string) => { calls.push({ m: "del", a: [id] }); return { id, deleted: true }; }) as AnyFn;
    (stripe.invoices as any).finalizeInvoice = (async (id: string) => { calls.push({ m: "finalize", a: [id] }); if (opts.finalizeThrows?.has(id)) throw new Error("finalize boom"); return { id, status: "open", default_payment_method: "pm_1" }; }) as AnyFn;
    (stripe.customers as any).retrieve = (async (id: string) => ({ id, deleted: false, invoice_settings: { default_payment_method: "pm_1" } })) as AnyFn;
  }

  function row(over: Partial<any> = {}) {
    return {
      userId: U1, email: "a@x.com", customerId: "cus_1", subscriptionId: "sub_1",
      classification: "RECOVERABLE", currentDraftId: "in_draft_cur",
      staleOpenIds: ["in_feb", "in_mar"], supersededDraftIds: ["in_draft_old"], amountCents: 4000,
      ...over,
    };
  }
  const okPay = (payCalls: any[]) => async (p: any) => { payCalls.push(p); return { invoiceId: p.invoice.id, customerId: p.customerId, userId: String(p.user?._id ?? ""), userEmail: p.user?.email, status: "success", amount: 4000 }; };

  async function happyPath() {
    installMocks();
    const payCalls: any[] = [];
    const res = await runStrandedRecovery({ adminId: ADMIN, limit: 25 }, { scan: async () => [row()] as any, pay: okPay(payCalls) as any });
    assert.deepEqual(argsOf("void").sort(), ["in_draft_old", "in_feb", "in_mar"], "voided both stale opens + the superseded draft");
    assert.deepEqual(argsOf("del"), [], "never deletes — subscription drafts can't be deleted");
    assert.deepEqual(argsOf("finalize").sort(), ["in_draft_cur", "in_draft_old"], "finalized the superseded draft (to void it) + the current draft");
    assert.equal(payCalls.length, 1, "paid exactly once");
    assert.equal(payCalls[0].invoice.id, "in_draft_cur", "paid the finalized current draft");
    assert.equal(payCalls[0].bypassRecentAttemptLock, true, "pay bypasses recent-attempt lock");
    assert.equal(res.succeeded, 1); assert.equal(res.attempted, 1); assert.equal(res.revenueCents, 4000);
    assert.ok(calls.some((c) => c.m === "lock.acquire"), "lock acquired");
    assert.ok(calls.some((c) => c.m === "lock.release"), "lock released");
    const created = calls.find((c) => c.m === "run.create");
    assert.equal(created?.a[0].kind, "recover", "ChargeJobRun kind=recover");
    // audit rows written for void + finalize steps (no delete — subscription drafts can't be deleted)
    const steps = calls.filter((c) => c.m === "log.create").map((c) => c.a[0].result?.recovery?.step);
    assert.ok(steps.includes("void") && steps.includes("finalize"), "audit rows for void + finalize steps");
    assert.ok(!steps.includes("delete"), "no delete audit step");
    console.log("✓ happyPath");
  }

  async function capEnforced() {
    installMocks();
    const payCalls: any[] = [];
    await runStrandedRecovery(
      { adminId: ADMIN, limit: 2 },
      { scan: async () => [row({ userId: U1, currentDraftId: "d1" }), row({ userId: U2, currentDraftId: "d2" }), row({ userId: "507f1f77bcf86cd799439014", currentDraftId: "d3" })] as any, pay: okPay(payCalls) as any }
    );
    assert.equal(payCalls.length, 2, "cap limits to 2 members");
    console.log("✓ capEnforced");
  }

  async function dedupByUser() {
    installMocks();
    const payCalls: any[] = [];
    await runStrandedRecovery(
      { adminId: ADMIN, limit: 25 },
      { scan: async () => [row({ userId: U1, currentDraftId: "d1" }), row({ userId: U1, currentDraftId: "d1b" })] as any, pay: okPay(payCalls) as any }
    );
    assert.equal(payCalls.length, 1, "duplicate userId collapsed to one charge");
    console.log("✓ dedupByUser");
  }

  async function finalizeThrowsNoPay() {
    installMocks({ finalizeThrows: new Set(["in_draft_cur"]) });
    const payCalls: any[] = [];
    const res = await runStrandedRecovery({ adminId: ADMIN, limit: 25 }, { scan: async () => [row()] as any, pay: okPay(payCalls) as any });
    assert.deepEqual(argsOf("void").sort(), ["in_draft_old", "in_feb", "in_mar"], "voids still happened (stale opens + superseded draft)");
    assert.equal(payCalls.length, 0, "no pay when finalize throws (no charge)");
    assert.equal(res.failed, 1); assert.equal(res.succeeded, 0); assert.equal(res.revenueCents, 0);
    assert.ok(calls.some((c) => c.m === "lock.release"), "lock still released on member failure");
    console.log("✓ finalizeThrowsNoPay");
  }

  await happyPath();
  await capEnforced();
  await dedupByUser();
  await finalizeThrowsNoPay();
  console.log("recoverStrandedBulk orchestrator tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
