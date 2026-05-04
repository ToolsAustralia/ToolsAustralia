import assert from "node:assert/strict";
import { Types } from "mongoose";
import type { IAllowlistAction } from "@/models/AllowlistAction";
import type { AllowlistRepository, EvalInput } from "../types";
import { AllowlistService } from "../AllowlistService";

// ---------- Fakes ----------

type FakeRepoState = {
  users: Array<{ _id: Types.ObjectId; email: string | null; stripeCustomerId: string | null }>;
  paidUserIds: Set<string>; // string form of ObjectId
  actions: IAllowlistAction[];
};

function createFakeRepo(initial: Partial<FakeRepoState> = {}): {
  repo: AllowlistRepository;
  state: FakeRepoState;
} {
  const state: FakeRepoState = {
    users: initial.users ?? [],
    paidUserIds: initial.paidUserIds ?? new Set(),
    actions: initial.actions ?? [],
  };
  const repo: AllowlistRepository = {
    async findUserId({ stripeCustomerId, customerEmail }) {
      if (stripeCustomerId) {
        const u = state.users.find((u) => u.stripeCustomerId === stripeCustomerId);
        if (u) return u._id;
      }
      if (customerEmail) {
        const u = state.users.find((u) => u.email === customerEmail);
        if (u) return u._id;
      }
      return null;
    },
    async userHasSucceededPayment(userId) {
      return state.paidUserIds.has(String(userId));
    },
    async findActiveAddedActionByFingerprint(fp) {
      const matches = state.actions.filter((a) => a.cardFingerprint === fp && a.action === "added");
      matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return matches[0] ?? null;
    },
    async findActionById(id) {
      return state.actions.find((a) => String(a._id) === String(id)) ?? null;
    },
    async insertAction(doc) {
      const inserted = {
        ...doc,
        _id: new Types.ObjectId(),
        createdAt: doc.createdAt ?? new Date(),
      } as IAllowlistAction;
      state.actions.push(inserted);
      return inserted;
    },
    async listRecentActions({ limit, action }) {
      const filtered = action === "all" ? state.actions : state.actions.filter((a) => a.action === action);
      const sorted = [...filtered].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return sorted.slice(0, limit);
    },
  };
  return { repo, state };
}

type FakeStripeRadar = {
  valueLists: { list: (args: { alias: string }) => Promise<{ data: Array<{ id: string }> }> };
  valueListItems: {
    create: (args: { value_list: string; value: string }) => Promise<{ id: string }>;
    del: (id: string) => Promise<{ id: string; deleted: true }>;
  };
};

function createFakeStripeRadar(opts: {
  createBehavior?: "ok" | "already_exists" | "throw";
  delBehavior?: "ok" | "not_found" | "throw";
} = {}): {
  radar: FakeStripeRadar;
  calls: { create: number; del: number };
} {
  const calls = { create: 0, del: 0 };
  const radar: FakeStripeRadar = {
    valueLists: {
      list: async () => ({ data: [{ id: "rsl_default_allow" }] }),
    },
    valueListItems: {
      create: async () => {
        calls.create += 1;
        if (opts.createBehavior === "already_exists") {
          const err = new Error("Item already exists") as Error & { code?: string };
          err.code = "value_already_exists";
          throw err;
        }
        if (opts.createBehavior === "throw") {
          throw new Error("Stripe boom");
        }
        return { id: `rsli_${calls.create}` };
      },
      del: async (id) => {
        calls.del += 1;
        if (opts.delBehavior === "not_found") {
          const err = new Error("No such value_list_item") as Error & { statusCode?: number };
          err.statusCode = 404;
          throw err;
        }
        if (opts.delBehavior === "throw") {
          throw new Error("Stripe boom");
        }
        return { id, deleted: true };
      },
    },
  };
  return { radar, calls };
}

function makeInput(overrides: Partial<EvalInput> = {}): EvalInput {
  return {
    cardFingerprint: "fp_test_xxxxx",
    cardLast4: "4242",
    cardBrand: "visa",
    stripeCustomerId: "cus_test_1",
    customerEmail: "test@example.com",
    declineCode: null,
    failureCode: null,
    triggeringPaymentIntentId: "pi_test_1",
    triggeringChargeId: "ch_test_1",
    ...overrides,
  };
}

// ---------- evaluate() tests ----------

async function testEvaluateRejectsFraudSignals() {
  for (const code of ["lost_card", "stolen_card", "pickup_card", "fraudulent"] as const) {
    const { repo } = createFakeRepo();
    const { radar } = createFakeStripeRadar();
    const svc = new AllowlistService({ repo, stripeRadar: radar as never });
    const result = await svc.evaluate(makeInput({ declineCode: code }));
    assert.equal(result.eligible, false, `${code} should be ineligible`);
    if (!result.eligible) {
      assert.equal(result.reason, "filter_fraud_signal", `${code} should be filter_fraud_signal`);
    }
  }
}

async function testEvaluateRejectsPermanentIssues() {
  for (const code of [
    "expired_card",
    "incorrect_cvc",
    "invalid_account",
    "invalid_number",
    "invalid_expiry_year",
    "invalid_expiry_month",
  ] as const) {
    const userId = new Types.ObjectId();
    // Even a known paying member gets skipped — the issue is the card itself.
    const { repo } = createFakeRepo({
      users: [{ _id: userId, email: "test@example.com", stripeCustomerId: "cus_test_1" }],
      paidUserIds: new Set([String(userId)]),
    });
    const { radar } = createFakeStripeRadar();
    const svc = new AllowlistService({ repo, stripeRadar: radar as never });
    const result = await svc.evaluate(makeInput({ declineCode: code }));
    assert.equal(result.eligible, false, `${code} should be ineligible`);
    if (!result.eligible) {
      assert.equal(
        result.reason,
        "filter_permanent_issue",
        `${code} should be filter_permanent_issue`
      );
    }
  }
}

async function testEvaluateRejectsWhenNoUser() {
  const { repo } = createFakeRepo({ users: [] });
  const { radar } = createFakeStripeRadar();
  const svc = new AllowlistService({ repo, stripeRadar: radar as never });
  const result = await svc.evaluate(makeInput({ declineCode: "do_not_honor" }));
  assert.equal(result.eligible, false);
  if (!result.eligible) assert.equal(result.reason, "filter_not_member");
}

async function testEvaluateRejectsWhenUserHasNoSucceededPayment() {
  const userId = new Types.ObjectId();
  const { repo } = createFakeRepo({
    users: [{ _id: userId, email: "test@example.com", stripeCustomerId: "cus_test_1" }],
    paidUserIds: new Set(), // no payments
  });
  const { radar } = createFakeStripeRadar();
  const svc = new AllowlistService({ repo, stripeRadar: radar as never });
  const result = await svc.evaluate(makeInput({ declineCode: "insufficient_funds" }));
  assert.equal(result.eligible, false);
  if (!result.eligible) assert.equal(result.reason, "filter_not_member");
}

async function testEvaluateAcceptsKnownPayingMember() {
  const userId = new Types.ObjectId();
  const { repo } = createFakeRepo({
    users: [{ _id: userId, email: "test@example.com", stripeCustomerId: "cus_test_1" }],
    paidUserIds: new Set([String(userId)]),
  });
  const { radar } = createFakeStripeRadar();
  const svc = new AllowlistService({ repo, stripeRadar: radar as never });
  const result = await svc.evaluate(makeInput({ declineCode: "do_not_honor" }));
  assert.equal(result.eligible, true);
  if (result.eligible) {
    assert.equal(String(result.userId), String(userId));
  }
}

// ---------- apply() tests ----------

async function testApplyEligibleWritesAddedRowAndCallsStripe() {
  const userId = new Types.ObjectId();
  const { repo, state } = createFakeRepo({
    users: [{ _id: userId, email: "test@example.com", stripeCustomerId: "cus_test_1" }],
    paidUserIds: new Set([String(userId)]),
  });
  const { radar, calls } = createFakeStripeRadar();
  const svc = new AllowlistService({ repo, stripeRadar: radar as never });
  const action = await svc.apply(makeInput({ declineCode: "do_not_honor" }), "webhook", null);
  assert.equal(action.action, "added");
  assert.equal(action.reason, "auto_eligible");
  assert.equal(action.source, "webhook");
  assert.equal(action.stripeListItemId, "rsli_1");
  assert.equal(calls.create, 1);
  assert.equal(state.actions.length, 1);
}

async function testApplyNotEligibleWritesSkippedRowAndDoesNotCallStripe() {
  const { repo, state } = createFakeRepo({ users: [] }); // no user → not_member
  const { radar, calls } = createFakeStripeRadar();
  const svc = new AllowlistService({ repo, stripeRadar: radar as never });
  const action = await svc.apply(makeInput({ declineCode: "do_not_honor" }), "webhook", null);
  assert.equal(action.action, "skipped");
  assert.equal(action.reason, "filter_not_member");
  assert.equal(action.stripeListItemId, null);
  assert.equal(calls.create, 0);
  assert.equal(state.actions.length, 1);
}

async function testApplyFraudSignalSkippedAndNotCalled() {
  const userId = new Types.ObjectId();
  const { repo, state } = createFakeRepo({
    users: [{ _id: userId, email: "test@example.com", stripeCustomerId: "cus_test_1" }],
    paidUserIds: new Set([String(userId)]),
  });
  const { radar, calls } = createFakeStripeRadar();
  const svc = new AllowlistService({ repo, stripeRadar: radar as never });
  const action = await svc.apply(makeInput({ declineCode: "lost_card" }), "webhook", null);
  assert.equal(action.action, "skipped");
  assert.equal(action.reason, "filter_fraud_signal");
  assert.equal(calls.create, 0);
  assert.equal(state.actions.length, 1);
}

async function testApplyIsIdempotent() {
  const userId = new Types.ObjectId();
  const { repo, state } = createFakeRepo({
    users: [{ _id: userId, email: "test@example.com", stripeCustomerId: "cus_test_1" }],
    paidUserIds: new Set([String(userId)]),
  });
  const { radar, calls } = createFakeStripeRadar();
  const svc = new AllowlistService({ repo, stripeRadar: radar as never });
  const first = await svc.apply(makeInput({ declineCode: "do_not_honor" }), "webhook", null);
  const second = await svc.apply(makeInput({ declineCode: "do_not_honor" }), "webhook", null);
  assert.equal(String(first._id), String(second._id), "second call should return existing row");
  assert.equal(calls.create, 1, "Stripe must only be called once");
  assert.equal(state.actions.length, 1, "no second insert");
}

async function testApplyAdminBulkOverrideForcesAddedRow() {
  // No user at all → would normally be skipped as filter_not_member
  const { repo, state } = createFakeRepo({ users: [] });
  const { radar, calls } = createFakeStripeRadar();
  const performedBy = new Types.ObjectId();
  const svc = new AllowlistService({ repo, stripeRadar: radar as never });
  const action = await svc.apply(
    makeInput({ declineCode: "lost_card" }),
    "admin_bulk",
    performedBy,
    true // allowOverride
  );
  assert.equal(action.action, "added");
  assert.equal(action.reason, "manual_admin_override");
  assert.equal(action.source, "admin_bulk");
  assert.equal(String(action.performedByUserId), String(performedBy));
  assert.equal(calls.create, 1);
  assert.equal(state.actions.length, 1);
}

async function testApplyPermanentIssueSkippedAndNotCalled() {
  const userId = new Types.ObjectId();
  const { repo, state } = createFakeRepo({
    users: [{ _id: userId, email: "test@example.com", stripeCustomerId: "cus_test_1" }],
    paidUserIds: new Set([String(userId)]),
  });
  const { radar, calls } = createFakeStripeRadar();
  const svc = new AllowlistService({ repo, stripeRadar: radar as never });
  const action = await svc.apply(makeInput({ declineCode: "expired_card" }), "webhook", null);
  assert.equal(action.action, "skipped");
  assert.equal(action.reason, "filter_permanent_issue");
  assert.equal(calls.create, 0);
  assert.equal(state.actions.length, 1);
}

async function testApplyAdminBulkOverridePermanentIssue() {
  const userId = new Types.ObjectId();
  const { repo, state } = createFakeRepo({
    users: [{ _id: userId, email: "test@example.com", stripeCustomerId: "cus_test_1" }],
    paidUserIds: new Set([String(userId)]),
  });
  const { radar, calls } = createFakeStripeRadar();
  const performedBy = new Types.ObjectId();
  const svc = new AllowlistService({ repo, stripeRadar: radar as never });
  // expired_card with override → should still be added
  const action = await svc.apply(
    makeInput({ declineCode: "expired_card" }),
    "admin_bulk",
    performedBy,
    true
  );
  assert.equal(action.action, "added");
  assert.equal(action.reason, "manual_admin_override");
  assert.equal(calls.create, 1);
  assert.equal(state.actions.length, 1);
}

async function testApplyAdminBulkWithoutOverrideUsesManualAdminReason() {
  const userId = new Types.ObjectId();
  const { repo } = createFakeRepo({
    users: [{ _id: userId, email: "test@example.com", stripeCustomerId: "cus_test_1" }],
    paidUserIds: new Set([String(userId)]),
  });
  const { radar } = createFakeStripeRadar();
  const performedBy = new Types.ObjectId();
  const svc = new AllowlistService({ repo, stripeRadar: radar as never });
  const action = await svc.apply(
    makeInput({ declineCode: "do_not_honor" }),
    "admin_bulk",
    performedBy,
    false
  );
  assert.equal(action.action, "added");
  assert.equal(action.reason, "manual_admin");
  assert.equal(action.source, "admin_bulk");
}

async function testApplyValueAlreadyExistsTreatedAsSuccess() {
  const userId = new Types.ObjectId();
  const { repo, state } = createFakeRepo({
    users: [{ _id: userId, email: "test@example.com", stripeCustomerId: "cus_test_1" }],
    paidUserIds: new Set([String(userId)]),
  });
  const { radar } = createFakeStripeRadar({ createBehavior: "already_exists" });
  const svc = new AllowlistService({ repo, stripeRadar: radar as never });
  const action = await svc.apply(makeInput({ declineCode: "do_not_honor" }), "webhook", null);
  assert.equal(action.action, "added", "even though Stripe rejected as duplicate, we record added");
  assert.equal(action.reason, "auto_eligible");
  // stripeListItemId may be null because we couldn't get a fresh ID; that's acceptable
  assert.equal(state.actions.length, 1);
}

// ---------- reverse() tests ----------

async function testReverseRemovesFromStripeAndWritesRemovedRow() {
  const addedAction = {
    _id: new Types.ObjectId(),
    cardFingerprint: "fp_xyz",
    cardLast4: "4242",
    cardBrand: "visa",
    stripeCustomerId: "cus_1",
    userId: null,
    customerEmail: "x@y.z",
    action: "added" as const,
    reason: "auto_eligible" as const,
    declineCode: "do_not_honor",
    failureCode: "card_declined",
    triggeringPaymentIntentId: "pi_1",
    triggeringChargeId: "ch_1",
    stripeListItemId: "rsli_to_remove",
    source: "webhook" as const,
    performedByUserId: null,
    createdAt: new Date(),
  } as unknown as IAllowlistAction;
  const { repo, state } = createFakeRepo({ actions: [addedAction] });
  const { radar, calls } = createFakeStripeRadar();
  const performedBy = new Types.ObjectId();
  const svc = new AllowlistService({ repo, stripeRadar: radar as never });

  const removed = await svc.reverse(addedAction._id, performedBy);
  assert.equal(removed.action, "removed");
  assert.equal(removed.reason, "manual_reversal");
  assert.equal(removed.source, "admin_reversal");
  assert.equal(removed.cardFingerprint, "fp_xyz");
  assert.equal(String(removed.performedByUserId), String(performedBy));
  assert.equal(calls.del, 1);
  assert.equal(state.actions.length, 2, "original added + new removed row");
}

async function testReverseTreats404AsSuccess() {
  const addedAction = {
    _id: new Types.ObjectId(),
    cardFingerprint: "fp_xyz2",
    cardLast4: "1111",
    cardBrand: "visa",
    stripeCustomerId: null,
    userId: null,
    customerEmail: null,
    action: "added" as const,
    reason: "auto_eligible" as const,
    declineCode: null,
    failureCode: null,
    triggeringPaymentIntentId: null,
    triggeringChargeId: null,
    stripeListItemId: "rsli_already_gone",
    source: "webhook" as const,
    performedByUserId: null,
    createdAt: new Date(),
  } as unknown as IAllowlistAction;
  const { repo, state } = createFakeRepo({ actions: [addedAction] });
  const { radar } = createFakeStripeRadar({ delBehavior: "not_found" });
  const performedBy = new Types.ObjectId();
  const svc = new AllowlistService({ repo, stripeRadar: radar as never });

  const removed = await svc.reverse(addedAction._id, performedBy);
  assert.equal(removed.action, "removed", "404 should be treated as success");
  assert.equal(state.actions.length, 2);
}

async function testReverseThrowsWhenActionNotFound() {
  const { repo } = createFakeRepo({});
  const { radar } = createFakeStripeRadar();
  const svc = new AllowlistService({ repo, stripeRadar: radar as never });
  await assert.rejects(
    () => svc.reverse(new Types.ObjectId(), new Types.ObjectId()),
    /AllowlistAction not found/
  );
}

async function run() {
  await testEvaluateRejectsFraudSignals();
  await testEvaluateRejectsPermanentIssues();
  await testEvaluateRejectsWhenNoUser();
  await testEvaluateRejectsWhenUserHasNoSucceededPayment();
  await testEvaluateAcceptsKnownPayingMember();
  await testApplyEligibleWritesAddedRowAndCallsStripe();
  await testApplyNotEligibleWritesSkippedRowAndDoesNotCallStripe();
  await testApplyFraudSignalSkippedAndNotCalled();
  await testApplyPermanentIssueSkippedAndNotCalled();
  await testApplyIsIdempotent();
  await testApplyAdminBulkOverrideForcesAddedRow();
  await testApplyAdminBulkOverridePermanentIssue();
  await testApplyAdminBulkWithoutOverrideUsesManualAdminReason();
  await testApplyValueAlreadyExistsTreatedAsSuccess();
  await testReverseRemovesFromStripeAndWritesRemovedRow();
  await testReverseTreats404AsSuccess();
  await testReverseThrowsWhenActionNotFound();
  console.log("AllowlistService tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
