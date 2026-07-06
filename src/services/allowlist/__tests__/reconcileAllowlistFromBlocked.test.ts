import assert from "node:assert/strict";
import dotenv from "dotenv";
import path from "node:path";
import type { IAllowlistAction } from "@/models/AllowlistAction";
import type { EvalInput, EvalResult } from "../types";
import type { AllowlistApplier } from "../reconcileAllowlistFromBlocked";

// Load .env.local before importing reconcileAllowlistFromBlocked — it statically imports
// ./index, whose stripe singleton throws at import time if STRIPE_SECRET_KEY is missing.
// tsx hoists static imports ESM-style, so this module must be loaded dynamically, after
// dotenv.config() has run (same pattern as scripts/sync-allowlist-from-blocked-transactions.ts).
// Top-level await isn't supported in this file's cjs output, so the import is deferred
// into run() below and bound to this module-level variable.
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
let reconcileBlockedFingerprints: typeof import("../reconcileAllowlistFromBlocked").reconcileBlockedFingerprints;

const noSleep = async () => {};

function makeInput(overrides: Partial<EvalInput> = {}): EvalInput {
  return {
    cardFingerprint: "fp_1",
    cardLast4: "4242",
    cardBrand: "visa",
    stripeCustomerId: "cus_1",
    customerEmail: "u@example.com",
    declineCode: "do_not_honor",
    failureCode: null,
    triggeringPaymentIntentId: "pi_1",
    triggeringChargeId: "ch_1",
    ...overrides,
  };
}

function addedAction(reason: IAllowlistAction["reason"] = "manual_admin"): IAllowlistAction {
  return { action: "added", reason } as unknown as IAllowlistAction;
}
function skippedAction(reason: IAllowlistAction["reason"]): IAllowlistAction {
  return { action: "skipped", reason } as unknown as IAllowlistAction;
}

function fakeService(overrides: Partial<AllowlistApplier> = {}): {
  service: AllowlistApplier;
  calls: { isAllowlisted: number; evaluate: number; apply: number };
} {
  const calls = { isAllowlisted: 0, evaluate: 0, apply: 0 };
  const service: AllowlistApplier = {
    isAllowlisted: async (fp) => {
      calls.isAllowlisted += 1;
      return overrides.isAllowlisted ? overrides.isAllowlisted(fp) : false;
    },
    evaluate: async (input) => {
      calls.evaluate += 1;
      return overrides.evaluate
        ? overrides.evaluate(input)
        : ({ eligible: true, userId: null } as EvalResult);
    },
    apply: async (input, source, performedBy, allowOverride) => {
      calls.apply += 1;
      return overrides.apply
        ? overrides.apply(input, source, performedBy, allowOverride)
        : addedAction();
    },
  };
  return { service, calls };
}

async function testEligibleLiveAdds() {
  const { service, calls } = fakeService();
  const s = await reconcileBlockedFingerprints([makeInput()], {
    performedByUserId: null,
    sleepFn: noSleep,
    service,
  });
  assert.equal(s.evaluated, 1);
  assert.equal(s.added, 1);
  assert.equal(calls.apply, 1);
}

async function testAlreadyAllowlistedShortCircuits() {
  const { service, calls } = fakeService({ isAllowlisted: async () => true });
  const s = await reconcileBlockedFingerprints([makeInput()], {
    performedByUserId: null,
    sleepFn: noSleep,
    service,
  });
  assert.equal(s.alreadyAllowlisted, 1);
  assert.equal(s.added, 0);
  assert.equal(calls.apply, 0, "must not call apply for already-allowlisted");
}

async function testSkipBucketsByReason() {
  const { service } = fakeService({
    apply: async (input) =>
      input.declineCode === "lost_card"
        ? skippedAction("filter_fraud_signal")
        : skippedAction("filter_not_member"),
  });
  const s = await reconcileBlockedFingerprints(
    [makeInput({ cardFingerprint: "fp_a", declineCode: "lost_card" }), makeInput({ cardFingerprint: "fp_b", declineCode: "do_not_honor" })],
    { performedByUserId: null, sleepFn: noSleep, service }
  );
  assert.equal(s.skipped.fraud, 1);
  assert.equal(s.skipped.notMember, 1);
  assert.equal(s.added, 0);
}

async function testErrorCounts() {
  const { service } = fakeService({
    apply: async () => {
      throw new Error("boom");
    },
  });
  const s = await reconcileBlockedFingerprints([makeInput()], {
    performedByUserId: null,
    sleepFn: noSleep,
    service,
  });
  assert.equal(s.errored, 1);
  assert.equal(s.added, 0);
}

async function testRetriesOn429ThenSucceeds() {
  let n = 0;
  const { service, calls } = fakeService({
    apply: async () => {
      n += 1;
      if (n === 1) {
        const err = new Error("rate limited") as Error & { statusCode?: number };
        err.statusCode = 429;
        throw err;
      }
      return addedAction();
    },
  });
  const s = await reconcileBlockedFingerprints([makeInput()], {
    performedByUserId: null,
    sleepFn: noSleep,
    service,
  });
  assert.equal(s.added, 1, "429 then success → added");
  assert.equal(s.errored, 0);
  assert.equal(calls.apply, 2, "one retry");
}

async function testDryRunUsesEvaluateNotApply() {
  const { service, calls } = fakeService({
    evaluate: async () => ({ eligible: false, reason: "filter_permanent_issue" }),
  });
  const s = await reconcileBlockedFingerprints([makeInput({ declineCode: "expired_card" })], {
    performedByUserId: null,
    dryRun: true,
    sleepFn: noSleep,
    service,
  });
  assert.equal(calls.apply, 0, "dryRun must not apply");
  assert.equal(calls.evaluate, 1);
  assert.equal(s.skipped.permanent, 1);
}

async function testTalliesAreConsistent() {
  const { service } = fakeService({
    isAllowlisted: async (fp) => fp === "fp_already",
    apply: async (input) =>
      input.cardFingerprint === "fp_ok" ? addedAction() : skippedAction("filter_not_member"),
  });
  const inputs = [
    makeInput({ cardFingerprint: "fp_already" }),
    makeInput({ cardFingerprint: "fp_ok" }),
    makeInput({ cardFingerprint: "fp_skip" }),
  ];
  const s = await reconcileBlockedFingerprints(inputs, {
    performedByUserId: null,
    sleepFn: noSleep,
    service,
  });
  const bucketSum = s.skipped.fraud + s.skipped.permanent + s.skipped.notMember;
  assert.equal(s.evaluated, 3);
  assert.equal(s.added + s.alreadyAllowlisted + bucketSum + s.errored, s.evaluated);
}

async function run() {
  ({ reconcileBlockedFingerprints } = await import("../reconcileAllowlistFromBlocked"));
  await testEligibleLiveAdds();
  await testAlreadyAllowlistedShortCircuits();
  await testSkipBucketsByReason();
  await testErrorCounts();
  await testRetriesOn429ThenSucceeds();
  await testDryRunUsesEvaluateNotApply();
  await testTalliesAreConsistent();
  console.log("reconcileAllowlistFromBlocked tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
