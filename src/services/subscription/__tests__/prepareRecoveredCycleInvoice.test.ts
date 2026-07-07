/**
 * prepareRecoveredCycleInvoice — deterministic unit test with injected fake Stripe/audit deps.
 * No network / no Mongo (all side effects injected). Run: npm run test:prepare-recovered-cycle
 *
 * We load .env.local and DYNAMICALLY import the primitive after dotenv runs, because
 * `@/lib/stripe` throws at module load when STRIPE_SECRET_KEY is unset (and ESM hoists static
 * imports above dotenv.config). Every Stripe/DB call in these tests goes through injected deps.
 */
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import assert from "node:assert/strict";
import type Stripe from "stripe";
import type {
  PrepareRecoveredCycleInvoiceDeps,
  RecoveryStepRow,
} from "../prepareRecoveredCycleInvoice";

type PrepareFn = (typeof import("../prepareRecoveredCycleInvoice"))["prepareRecoveredCycleInvoice"];
let prepare: PrepareFn;

const strandedOpen = {
  id: "in_orig",
  status: "open",
  attempt_count: 1,
  next_payment_attempt: null,
} as Stripe.Invoice;

const heldDraft = { id: "in_draft", status: "draft", amount_due: 4000, created: 100 } as Stripe.Invoice;

function makeDeps(opts: { drafts?: Stripe.Invoice[]; finalizeThrows?: boolean; voidThrows?: boolean }) {
  const calls = { finalized: [] as string[], voided: [] as string[], recorded: [] as RecoveryStepRow[] };
  const deps: PrepareRecoveredCycleInvoiceDeps = {
    listDrafts: async () => opts.drafts ?? [],
    finalizeInvoice: async (id) => {
      calls.finalized.push(id);
      if (opts.finalizeThrows) throw new Error("finalize boom");
      return {
        id,
        status: "open",
        payment_intent: { id: "pi_1", client_secret: "pi_1_secret", status: "requires_payment_method" },
      } as unknown as Stripe.Invoice;
    },
    voidInvoice: async (id) => {
      calls.voided.push(id);
      if (opts.voidThrows) throw new Error("void boom");
    },
    retrievePaymentIntent: async (id) => ({ id }) as Stripe.PaymentIntent,
    recordRecoveryStep: async (row) => {
      calls.recorded.push(row);
    },
  };
  return { deps, calls };
}

const memberAudit = { actor: "member" as const, userId: "u1", customerId: "cus_1", amount: 4000 };

async function testNoDraftReturnsNoHeldDraftWithoutVoiding() {
  const { deps, calls } = makeDeps({ drafts: [] });
  const res = await prepare(
    { subscriptionId: "sub_1", strandedInvoice: strandedOpen, expectedAmountCents: 4000, audit: memberAudit },
    deps
  );
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, "no_held_draft");
  assert.equal(calls.voided.length, 0, "void MUST NOT run when there is no held draft");
  assert.equal(calls.finalized.length, 0, "finalize MUST NOT run when there is no held draft");
}

async function testHappyPathPicksFinalizesThenVoids() {
  const { deps, calls } = makeDeps({ drafts: [heldDraft] });
  const res = await prepare(
    {
      subscriptionId: "sub_1",
      strandedInvoice: strandedOpen,
      expectedAmountCents: 4000,
      audit: { actor: "admin", userId: "u1", customerId: "cus_1", amount: 4000, adminId: "a1" },
    },
    deps
  );
  assert.equal(res.ok, true);
  assert.deepEqual(calls.finalized, ["in_draft"], "finalize the held draft");
  assert.deepEqual(calls.voided, ["in_orig"], "void the stranded original (after finalize)");
  if (res.ok) {
    assert.equal(res.finalizedInvoice.id, "in_draft");
    assert.equal(res.paymentIntent?.id, "pi_1");
  }
}

async function testFinalizeFailureReturnsFinalizeFailedAndDoesNotVoid() {
  const { deps, calls } = makeDeps({ drafts: [heldDraft], finalizeThrows: true });
  const res = await prepare(
    { subscriptionId: "sub_1", strandedInvoice: strandedOpen, expectedAmountCents: 4000 },
    deps
  );
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, "finalize_failed");
  assert.equal(calls.voided.length, 0, "void MUST NOT run if finalize failed");
}

async function testVoidFailureIsNonFatal() {
  const { deps, calls } = makeDeps({ drafts: [heldDraft], voidThrows: true });
  const res = await prepare(
    { subscriptionId: "sub_1", strandedInvoice: strandedOpen, expectedAmountCents: 4000 },
    deps
  );
  assert.equal(res.ok, true, "a void failure MUST NOT fail the recovery (draft is finalized+payable)");
  assert.deepEqual(calls.finalized, ["in_draft"]);
  assert.deepEqual(calls.voided, ["in_orig"], "void was attempted");
}

async function testNoAuditCtxWritesNoRows() {
  const { deps, calls } = makeDeps({ drafts: [heldDraft] });
  await prepare({ subscriptionId: "sub_1", strandedInvoice: strandedOpen, expectedAmountCents: 4000 }, deps);
  assert.equal(calls.recorded.length, 0, "no audit ctx => no InvoiceChargeLog rows");
}

async function testAuditCtxWritesMemberActorRows() {
  const { deps, calls } = makeDeps({ drafts: [heldDraft] });
  await prepare(
    { subscriptionId: "sub_1", strandedInvoice: strandedOpen, expectedAmountCents: 4000, audit: memberAudit },
    deps
  );
  assert.ok(calls.recorded.length >= 1, "audit ctx => rows recorded");
  assert.ok(calls.recorded.every((r) => r.actor === "member"), "rows carry actor=member");
  assert.ok(calls.recorded.every((r) => r.adminId === undefined), "member rows carry no adminId");
  assert.ok(calls.recorded.some((r) => r.result.recovery.step === "finalize"), "a finalize step row exists");
  assert.ok(calls.recorded.some((r) => r.result.recovery.step === "void"), "a void step row exists");
}

async function run() {
  ({ prepareRecoveredCycleInvoice: prepare } = await import("../prepareRecoveredCycleInvoice"));
  await testNoDraftReturnsNoHeldDraftWithoutVoiding();
  await testHappyPathPicksFinalizesThenVoids();
  await testFinalizeFailureReturnsFinalizeFailedAndDoesNotVoid();
  await testVoidFailureIsNonFatal();
  await testNoAuditCtxWritesNoRows();
  await testAuditCtxWritesMemberActorRows();
  console.log("prepareRecoveredCycleInvoice tests passed");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
