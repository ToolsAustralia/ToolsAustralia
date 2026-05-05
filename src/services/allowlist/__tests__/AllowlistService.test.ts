import assert from "node:assert/strict";
import { Types } from "mongoose";
import type { IAllowlistAction } from "@/models/AllowlistAction";
import type { AllowlistRepository, EvalInput } from "../types";
import {
  AllowlistService,
  computeEligibility,
  decodeCursor,
  encodeCursor,
  type EligibilityMaps,
} from "../AllowlistService";

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

// ---------- computeEligibility() tests ----------

function makeBlockedDoc(
  overrides: Partial<{
    declineCode: string | null;
    stripeCustomerId: string | null;
    customerEmail: string | null;
  }> = {}
): { declineCode: string | null; stripeCustomerId: string | null; customerEmail: string | null } {
  return {
    declineCode: null,
    stripeCustomerId: null,
    customerEmail: null,
    ...overrides,
  };
}

function makeMaps(
  opts: {
    userByCustomerId?: Array<[string, { _id: string }]>;
    userByEmail?: Array<[string, { _id: string }]>;
    paidUserIds?: string[];
  } = {}
): EligibilityMaps {
  return {
    userByCustomerId: new Map(opts.userByCustomerId ?? []),
    userByEmail: new Map(opts.userByEmail ?? []),
    paidUserIds: new Set(opts.paidUserIds ?? []),
  };
}

function testComputeEligibilityFraudSignals() {
  for (const code of ["lost_card", "stolen_card", "pickup_card", "fraudulent"] as const) {
    // Even with a known paying member, fraud-signal codes win first.
    const result = computeEligibility(
      makeBlockedDoc({
        declineCode: code,
        stripeCustomerId: "cus_1",
        customerEmail: "u@example.com",
      }),
      makeMaps({
        userByCustomerId: [["cus_1", { _id: "user_1" }]],
        paidUserIds: ["user_1"],
      })
    );
    assert.equal(result.eligible, false, `${code} must be ineligible`);
    if (!result.eligible) {
      assert.equal(
        result.reason,
        "filter_fraud_signal",
        `${code} must produce filter_fraud_signal`
      );
    }
  }
}

function testComputeEligibilityPermanentIssues() {
  for (const code of ["expired_card", "incorrect_cvc"] as const) {
    // Even with a known paying member, permanent-issue codes still skip.
    const result = computeEligibility(
      makeBlockedDoc({
        declineCode: code,
        stripeCustomerId: "cus_1",
        customerEmail: "u@example.com",
      }),
      makeMaps({
        userByCustomerId: [["cus_1", { _id: "user_1" }]],
        paidUserIds: ["user_1"],
      })
    );
    assert.equal(result.eligible, false, `${code} must be ineligible`);
    if (!result.eligible) {
      assert.equal(
        result.reason,
        "filter_permanent_issue",
        `${code} must produce filter_permanent_issue`
      );
    }
  }
}

function testComputeEligibilityNoUserFound() {
  const result = computeEligibility(
    makeBlockedDoc({
      declineCode: "do_not_honor",
      stripeCustomerId: "cus_unknown",
      customerEmail: "nobody@example.com",
    }),
    makeMaps()
  );
  assert.equal(result.eligible, false, "no user → ineligible");
  if (!result.eligible) {
    assert.equal(
      result.reason,
      "filter_not_member",
      "no user → filter_not_member"
    );
  }
}

function testComputeEligibilityUserFoundButNotPaid() {
  const result = computeEligibility(
    makeBlockedDoc({
      declineCode: "do_not_honor",
      stripeCustomerId: "cus_1",
      customerEmail: "u@example.com",
    }),
    makeMaps({
      userByCustomerId: [["cus_1", { _id: "user_1" }]],
      // paidUserIds intentionally empty
    })
  );
  assert.equal(result.eligible, false, "user found but never paid → ineligible");
  if (!result.eligible) {
    assert.equal(
      result.reason,
      "filter_not_member",
      "non-paid user must produce filter_not_member"
    );
  }
}

function testComputeEligibilityUserFoundByEmailAndPaid() {
  const result = computeEligibility(
    makeBlockedDoc({
      declineCode: "do_not_honor",
      stripeCustomerId: null, // not in customerId map
      customerEmail: "u@example.com",
    }),
    makeMaps({
      userByEmail: [["u@example.com", { _id: "user_1" }]],
      paidUserIds: ["user_1"],
    })
  );
  assert.equal(
    result.eligible,
    true,
    "email-matched paying user must be eligible"
  );
}

function testComputeEligibilityUserFoundByCustomerIdAndPaid() {
  const result = computeEligibility(
    makeBlockedDoc({
      declineCode: "do_not_honor",
      stripeCustomerId: "cus_1",
      customerEmail: "u@example.com",
    }),
    makeMaps({
      userByCustomerId: [["cus_1", { _id: "user_1" }]],
      paidUserIds: ["user_1"],
    })
  );
  assert.equal(
    result.eligible,
    true,
    "customerId-matched paying user must be eligible"
  );
  // Verify the eligible:true branch carries no reason field.
  assert.equal(
    "reason" in result,
    false,
    "eligible:true result must not carry a reason field"
  );
}

function testComputeEligibilityNullDeclineCodeWithPaidMember() {
  const result = computeEligibility(
    makeBlockedDoc({
      declineCode: null,
      stripeCustomerId: "cus_1",
      customerEmail: "u@example.com",
    }),
    makeMaps({
      userByCustomerId: [["cus_1", { _id: "user_1" }]],
      paidUserIds: ["user_1"],
    })
  );
  assert.equal(
    result.eligible,
    true,
    "null declineCode with paying member must be eligible — fraud/permanent checks only fire on listed codes"
  );
}

function testComputeEligibilityCustomerIdWinsOverEmail() {
  // Both lookups would resolve, but to DIFFERENT users. customerId-first
  // matches AllowlistService.evaluate's sequence: stripeCustomerId, then email.
  const customerIdUser = "user_by_cid";
  const emailUser = "user_by_email";
  const result = computeEligibility(
    makeBlockedDoc({
      declineCode: "do_not_honor",
      stripeCustomerId: "cus_1",
      customerEmail: "u@example.com",
    }),
    makeMaps({
      userByCustomerId: [["cus_1", { _id: customerIdUser }]],
      userByEmail: [["u@example.com", { _id: emailUser }]],
      // Only the email-resolved user has paid. If the email branch wins,
      // we'd return eligible:true. We expect customerId to win → ineligible.
      paidUserIds: [emailUser],
    })
  );
  assert.equal(
    result.eligible,
    false,
    "customerId match must take precedence over email match"
  );
  if (!result.eligible) {
    assert.equal(
      result.reason,
      "filter_not_member",
      "customerId-resolved user (unpaid) must produce filter_not_member, not eligible"
    );
  }
}

// ---------- cursor encode/decode tests ----------

function testCursorRoundTrip() {
  const createdAt = new Date("2026-01-15T10:00:00Z");
  const cursor = encodeCursor({ createdAt, _id: "abc123" });
  const decoded = decodeCursor(cursor);
  assert.notEqual(decoded, null, "round-trip must succeed");
  if (!decoded) return;
  assert.equal(decoded._id, "abc123", "round-trip _id must match");
  assert.equal(
    decoded.createdAt instanceof Date,
    true,
    "round-trip createdAt must be a Date instance"
  );
  assert.equal(
    decoded.createdAt.getTime(),
    createdAt.getTime(),
    "round-trip createdAt must match by time"
  );
}

function testCursorRejectsGarbageBase64() {
  // "garbage-not-base64" technically passes through Buffer.from(s, "base64")
  // which is permissive — but the resulting bytes won't parse as JSON.
  const result = decodeCursor("garbage-not-base64");
  assert.equal(result, null, "non-JSON garbage must decode to null");
}

function testCursorRejectsValidBase64NotJson() {
  const result = decodeCursor(Buffer.from("not json").toString("base64"));
  assert.equal(result, null, "valid base64 of non-JSON must decode to null");
}

function testCursorRejectsValidJsonWrongShape() {
  const result = decodeCursor(
    Buffer.from(JSON.stringify({ wrong: "shape" })).toString("base64")
  );
  assert.equal(
    result,
    null,
    "valid JSON missing required c/i fields must decode to null"
  );
}

function testCursorRejectsInvalidDate() {
  const result = decodeCursor(
    Buffer.from(JSON.stringify({ c: "not-a-date", i: "abc" })).toString("base64")
  );
  assert.equal(
    result,
    null,
    "createdAt failing Date parse must decode to null"
  );
}

function testCursorRejectsEmptyString() {
  const result = decodeCursor("");
  assert.equal(result, null, "empty cursor string must decode to null");
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
  testComputeEligibilityFraudSignals();
  testComputeEligibilityPermanentIssues();
  testComputeEligibilityNoUserFound();
  testComputeEligibilityUserFoundButNotPaid();
  testComputeEligibilityUserFoundByEmailAndPaid();
  testComputeEligibilityUserFoundByCustomerIdAndPaid();
  testComputeEligibilityNullDeclineCodeWithPaidMember();
  testComputeEligibilityCustomerIdWinsOverEmail();
  testCursorRoundTrip();
  testCursorRejectsGarbageBase64();
  testCursorRejectsValidBase64NotJson();
  testCursorRejectsValidJsonWrongShape();
  testCursorRejectsInvalidDate();
  testCursorRejectsEmptyString();
  console.log("AllowlistService tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
