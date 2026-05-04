# Stripe Auto-Allowlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Stripe Radar allowlist automation system that bulk-allowlists existing blocked cards via an admin UI and auto-allowlists newly-blocked cards via the Stripe webhook, with a full Mongo audit trail and per-row reversal support.

**Architecture:** One `AllowlistService` (constructor DI for Stripe SDK + a Mongoose-backed repository) consumed by three surfaces — the existing `payment_intent.payment_failed` webhook branch (auto), an admin bulk-allowlist page (manual), and a per-row "Remove" button (reversal). Filter rules: card belongs to a User with at least one succeeded `PaymentEvent` AND `last_payment_error.decline_code` is not in `{lost_card, stolen_card, pickup_card, fraudulent}`. All decisions logged in a new `AllowlistAction` Mongo collection.

**Tech Stack:** Next.js 15 App Router · TypeScript · Mongoose 8 · Stripe SDK 18 (`stripe.radar.valueListItems`) · TanStack Query 5 · `node:assert/strict` + `tsx` for tests.

**Reference spec:** [docs/superpowers/specs/2026-05-04-stripe-auto-allowlist-design.md](../specs/2026-05-04-stripe-auto-allowlist-design.md)

---

## File Structure

**New files (15):**

| Path | Responsibility |
|---|---|
| `src/models/AllowlistAction.ts` | Mongoose model — audit log of every add/skip/remove decision |
| `src/services/allowlist/types.ts` | Shared types: `EvalInput`, `EvalResult`, `BlockedRow`, `BlockedFilter`, `ApplySource`, `AllowlistRepository` interface |
| `src/services/allowlist/declineCodes.ts` | `FRAUD_SIGNAL_DECLINE_CODES` constant + `isFraudSignalDeclineCode()` pure helper |
| `src/services/allowlist/stripeListResolver.ts` | Process-lifetime cache for the `allow_card_fingerprint` Radar list ID |
| `src/services/allowlist/MongoAllowlistRepository.ts` | Concrete `AllowlistRepository` impl backed by Mongoose models |
| `src/services/allowlist/AllowlistService.ts` | The service class — DI constructor, `evaluate()` / `apply()` / `reverse()` / `listBlockedFromStripe()` |
| `src/services/allowlist/index.ts` | Singleton wiring — `getAllowlistService()` returns a service wired to real Stripe + real Mongo repo |
| `src/services/allowlist/__tests__/AllowlistService.test.ts` | Service unit tests using hand-rolled fakes (no real Mongo, no real Stripe) |
| `src/app/api/admin/allowlist/blocked-cards/route.ts` | `GET` — list currently-blocked cards from Stripe with filter/eligibility preview |
| `src/app/api/admin/allowlist/apply/route.ts` | `POST` — bulk allowlist from admin page |
| `src/app/api/admin/allowlist/reverse/route.ts` | `POST` — remove a card from allowlist |
| `src/app/api/admin/allowlist/actions/route.ts` | `GET` — list recent `AllowlistAction` rows for the "Recently allowlisted" widget |
| `src/hooks/queries/admin/useBlockedCards.ts` | TanStack hook for the GET `/blocked-cards` endpoint |
| `src/hooks/queries/admin/useAllowlistActions.ts` | TanStack hook for actions list + apply mutation + reverse mutation |
| `src/app/admin/billing/blocked-cards/page.tsx` | Server wrapper — admin auth gate, renders client component |
| `src/app/admin/billing/blocked-cards/BlockedCardsClient.tsx` | Client component — filters, table, bulk actions, recently-allowlisted widget |

**Modified files (9):**

| Path | Change |
|---|---|
| `src/app/api/stripe/webhook/route.ts` | Add allowlist branch to `case "payment_intent.payment_failed"` (lines ~4987-4989) |
| `src/lib/queryKeys.ts` | Add `allowlist` namespace under `queryKeys.admin` |
| `src/app/admin/component/AdminSidebar.tsx` | Add "Blocked Cards" entry under a Billing group, navigates to `/admin/billing/blocked-cards` |
| `package.json` | Add `"test:allowlist": "tsx src/services/allowlist/__tests__/AllowlistService.test.ts"` |
| `CLAUDE.md` | Add 6 new path globs under `domains.billing-stripe.paths`, bump `lastModified` to `2026-05-04` |
| `docs/billing-stripe/architecture.md` | Add `AllowlistService` to the service inventory |
| `docs/billing-stripe/models.md` | Add `AllowlistAction` schema documentation |
| `docs/billing-stripe/api.md` | Document the four new admin endpoints |
| `docs/billing-stripe/gotchas.md` | Explain Stripe's issuer-directed auto-block + the `outcome.type === "blocked"` signal |

**Why DI for the service:** existing tests in this repo are bare `tsx` scripts using `node:assert/strict` — no jest, no `mongodb-memory-server`, no module mocks. The service takes `{ repo, stripeRadar }` in its constructor so tests can pass hand-rolled fakes without touching real Mongo or Stripe. The production singleton in `index.ts` wires real implementations.

---

## Working Directory Note

**Tasks 2 onward execute inside the new worktree at `.worktrees/stripe-allowlist`.** Task 1 creates the worktree; from Task 2 onward, all file paths in this plan are relative to that worktree's root, and all Bash commands assume `cwd = c:\Codes\ToolsAustralia\.worktrees\stripe-allowlist`. The original `c:\Codes\ToolsAustralia` checkout (currently on `claude/ShopFeature`) must NOT be modified by this work.

---

### Task 1: Create the dedicated worktree

**Files:**
- Create: `.worktrees/stripe-allowlist/` (whole worktree directory, branched from `origin/main`)

- [ ] **Step 1: Verify the main repo is on a different branch (safety check)**

Run from `c:\Codes\ToolsAustralia`:
```bash
git branch --show-current
```
Expected output: `claude/ShopFeature` (or any branch other than `claude/stripe-allowlist`). If it already says `claude/stripe-allowlist`, stop and ask the user — the branch name is taken.

- [ ] **Step 2: Confirm `origin/main` is fetched and reachable**

```bash
git fetch origin main
git rev-parse origin/main
```
Expected: a 40-char commit SHA. If `git fetch` fails with auth errors, stop and ask the user.

- [ ] **Step 3: Create the worktree on a new branch**

```bash
git worktree add .worktrees/stripe-allowlist -b claude/stripe-allowlist origin/main
```
Expected output:
```
Preparing worktree (new branch 'claude/stripe-allowlist')
HEAD is now at <sha> <commit message>
```

- [ ] **Step 4: Verify worktree creation**

```bash
git worktree list
```
Expected: shows three lines including `.worktrees/stripe-allowlist  <sha> [claude/stripe-allowlist]`.

- [ ] **Step 5: cd into the worktree and verify branch**

```bash
cd .worktrees/stripe-allowlist
git branch --show-current
```
Expected: `claude/stripe-allowlist`.

- [ ] **Step 6: Install dependencies in the worktree**

```bash
npm install
```
Expected: completes without errors. Worktrees share the parent repo's `.git` but have their own `node_modules`.

- [ ] **Step 7: Run baseline lint + type-check to confirm a clean starting state**

```bash
npm run lint
npm run type-check
```
Expected: both succeed. If either fails, the failure exists on `main` and must be flagged to the user before proceeding.

- [ ] **Step 8: Do NOT commit yet** — the worktree creation has no files to add. Subsequent tasks will commit their own work.

---

### Task 2: Create the `AllowlistAction` Mongoose model

**Files:**
- Create: `src/models/AllowlistAction.ts`

- [ ] **Step 1: Create the model file**

```ts
// src/models/AllowlistAction.ts
import mongoose, { Document, Schema, Types } from "mongoose";

export type AllowlistActionKind = "added" | "skipped" | "removed";

export type AllowlistActionReason =
  | "auto_eligible"
  | "manual_admin"
  | "manual_admin_override"
  | "filter_not_member"
  | "filter_fraud_signal"
  | "manual_reversal";

export type AllowlistActionSource = "webhook" | "admin_bulk" | "admin_reversal";

export interface IAllowlistAction extends Document {
  _id: Types.ObjectId;
  cardFingerprint: string;
  cardLast4: string;
  cardBrand: string;
  stripeCustomerId: string | null;
  userId: Types.ObjectId | null;
  customerEmail: string | null;
  action: AllowlistActionKind;
  reason: AllowlistActionReason;
  declineCode: string | null;
  failureCode: string | null;
  triggeringPaymentIntentId: string | null;
  triggeringChargeId: string | null;
  stripeListItemId: string | null;
  source: AllowlistActionSource;
  performedByUserId: Types.ObjectId | null;
  createdAt: Date;
}

const AllowlistActionSchema = new Schema<IAllowlistAction>(
  {
    cardFingerprint: { type: String, required: true },
    cardLast4: { type: String, required: true },
    cardBrand: { type: String, required: true },
    stripeCustomerId: { type: String, default: null },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    customerEmail: { type: String, default: null },
    action: {
      type: String,
      required: true,
      enum: ["added", "skipped", "removed"],
    },
    reason: {
      type: String,
      required: true,
      enum: [
        "auto_eligible",
        "manual_admin",
        "manual_admin_override",
        "filter_not_member",
        "filter_fraud_signal",
        "manual_reversal",
      ],
    },
    declineCode: { type: String, default: null },
    failureCode: { type: String, default: null },
    triggeringPaymentIntentId: { type: String, default: null },
    triggeringChargeId: { type: String, default: null },
    stripeListItemId: { type: String, default: null },
    source: {
      type: String,
      required: true,
      enum: ["webhook", "admin_bulk", "admin_reversal"],
    },
    performedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    createdAt: { type: Date, default: Date.now },
  },
  {
    timestamps: false,
    collection: "allowlistactions",
  }
);

AllowlistActionSchema.index({ cardFingerprint: 1, action: 1, createdAt: -1 });
AllowlistActionSchema.index({ stripeCustomerId: 1, createdAt: -1 });
AllowlistActionSchema.index({ action: 1, createdAt: -1 });

const modelName = "AllowlistAction";
if (mongoose.models[modelName]) {
  delete mongoose.models[modelName];
}

export default mongoose.model<IAllowlistAction>(modelName, AllowlistActionSchema);
```

- [ ] **Step 2: Type-check passes**

```bash
npm run type-check
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/models/AllowlistAction.ts
git commit -m "feat(allowlist): add AllowlistAction Mongo model for audit log"
```

---

### Task 3: Add scaffolding — types, decline codes, Stripe list resolver

**Files:**
- Create: `src/services/allowlist/types.ts`
- Create: `src/services/allowlist/declineCodes.ts`
- Create: `src/services/allowlist/stripeListResolver.ts`

- [ ] **Step 1: Create `types.ts`**

```ts
// src/services/allowlist/types.ts
import type { Types } from "mongoose";
import type { IAllowlistAction } from "@/models/AllowlistAction";

export type EvalInput = {
  cardFingerprint: string;
  cardLast4: string;
  cardBrand: string;
  stripeCustomerId: string | null;
  customerEmail: string | null;
  declineCode: string | null;
  failureCode: string | null;
  triggeringPaymentIntentId: string | null;
  triggeringChargeId: string | null;
};

export type EvalResult =
  | { eligible: true; userId: Types.ObjectId | null }
  | {
      eligible: false;
      reason: "filter_not_member" | "filter_fraud_signal";
    };

export type ApplySource = "webhook" | "admin_bulk";

export type BlockedFilter = {
  dateFrom: Date;
  dateTo: Date;
  memberStatus: "any" | "has_paid" | "never_paid";
  declineReason: "any" | "transient_only" | "fraud_signals_only";
  skippedOnly: boolean;
};

export type EligibilityPreview =
  | { eligible: true }
  | { eligible: false; reason: "filter_not_member" | "filter_fraud_signal" };

export type BlockedRow = {
  paymentIntentId: string;
  chargeId: string;
  createdAt: Date;
  amount: number;
  currency: string;
  cardFingerprint: string;
  cardLast4: string;
  cardBrand: string;
  stripeCustomerId: string | null;
  customerEmail: string | null;
  declineCode: string | null;
  failureCode: string | null;
  preview: EligibilityPreview;
  alreadyAllowlisted: boolean;
};

/** Repository abstraction so the service can be tested with hand-rolled fakes. */
export interface AllowlistRepository {
  /** Returns the userId if either stripeCustomerId or customerEmail matches a User row. */
  findUserId(args: {
    stripeCustomerId: string | null;
    customerEmail: string | null;
  }): Promise<Types.ObjectId | null>;

  /** True if the user has at least one PaymentEvent with eventType in the success set. */
  userHasSucceededPayment(userId: Types.ObjectId): Promise<boolean>;

  /** Finds the most recent "added" AllowlistAction for a given card fingerprint, if any. */
  findActiveAddedActionByFingerprint(cardFingerprint: string): Promise<IAllowlistAction | null>;

  /** Finds an AllowlistAction by its _id. */
  findActionById(actionId: Types.ObjectId): Promise<IAllowlistAction | null>;

  /** Inserts a new AllowlistAction document. */
  insertAction(doc: Omit<IAllowlistAction, "_id" | "createdAt"> & { createdAt?: Date }): Promise<IAllowlistAction>;

  /** Returns the most recent N actions, optionally filtered by action kind. */
  listRecentActions(args: {
    limit: number;
    action: "added" | "skipped" | "removed" | "all";
  }): Promise<IAllowlistAction[]>;
}
```

- [ ] **Step 2: Create `declineCodes.ts`**

```ts
// src/services/allowlist/declineCodes.ts

/**
 * Stripe `last_payment_error.decline_code` values that indicate the issuer has
 * flagged the card as compromised. We never auto-allowlist these — adding them
 * to allowlist won't make charges succeed (issuer keeps declining) and ignores
 * a real fraud signal.
 */
export const FRAUD_SIGNAL_DECLINE_CODES = new Set<string>([
  "lost_card",
  "stolen_card",
  "pickup_card",
  "fraudulent",
]);

export function isFraudSignalDeclineCode(declineCode: string | null | undefined): boolean {
  if (!declineCode) return false;
  return FRAUD_SIGNAL_DECLINE_CODES.has(declineCode);
}
```

- [ ] **Step 3: Create `stripeListResolver.ts`**

```ts
// src/services/allowlist/stripeListResolver.ts
import type Stripe from "stripe";

let cachedListId: string | null = null;
let inflight: Promise<string> | null = null;

/**
 * Resolves the Stripe Radar `allow_card_fingerprint` value list ID.
 * Cached for the process lifetime — the alias is stable per Stripe account.
 */
export async function getAllowCardFingerprintListId(stripeRadar: Stripe.RadarResource): Promise<string> {
  if (cachedListId) return cachedListId;
  if (inflight) return inflight;

  inflight = (async () => {
    const lists = await stripeRadar.valueLists.list({ alias: "allow_card_fingerprint" });
    const list = lists.data[0];
    if (!list) {
      throw new Error(
        "Stripe Radar built-in `allow_card_fingerprint` value list not found. " +
          "Verify Radar is enabled on this Stripe account."
      );
    }
    cachedListId = list.id;
    return list.id;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** Test-only helper to reset the cache between tests. */
export function _resetAllowCardFingerprintListIdCache(): void {
  cachedListId = null;
  inflight = null;
}
```

- [ ] **Step 4: Type-check passes**

```bash
npm run type-check
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/allowlist/types.ts src/services/allowlist/declineCodes.ts src/services/allowlist/stripeListResolver.ts
git commit -m "feat(allowlist): add types, decline-code classifier, Stripe list resolver"
```

---

### Task 4: Implement the Mongo-backed repository

**Files:**
- Create: `src/services/allowlist/MongoAllowlistRepository.ts`

- [ ] **Step 1: Create `MongoAllowlistRepository.ts`**

```ts
// src/services/allowlist/MongoAllowlistRepository.ts
import { Types } from "mongoose";
import AllowlistAction, { IAllowlistAction } from "@/models/AllowlistAction";
import PaymentEvent from "@/models/PaymentEvent";
import User from "@/models/User";
import type { AllowlistRepository } from "./types";

/**
 * PaymentEvent eventTypes we treat as "user has successfully paid at least once."
 * Mirrors the success markers used elsewhere in billing-stripe.
 */
const SUCCEEDED_EVENT_TYPES = [
  "PaymentProcessed",
  "BenefitsGranted",
  "SubscriptionActivated",
];

export class MongoAllowlistRepository implements AllowlistRepository {
  async findUserId(args: {
    stripeCustomerId: string | null;
    customerEmail: string | null;
  }): Promise<Types.ObjectId | null> {
    if (args.stripeCustomerId) {
      const byCustomer = await User.findOne({ stripeCustomerId: args.stripeCustomerId })
        .select("_id")
        .lean();
      if (byCustomer?._id) return new Types.ObjectId(String(byCustomer._id));
    }
    if (args.customerEmail) {
      const byEmail = await User.findOne({ email: args.customerEmail }).select("_id").lean();
      if (byEmail?._id) return new Types.ObjectId(String(byEmail._id));
    }
    return null;
  }

  async userHasSucceededPayment(userId: Types.ObjectId): Promise<boolean> {
    const exists = await PaymentEvent.exists({
      userId,
      eventType: { $in: SUCCEEDED_EVENT_TYPES },
    });
    return Boolean(exists);
  }

  async findActiveAddedActionByFingerprint(cardFingerprint: string): Promise<IAllowlistAction | null> {
    return AllowlistAction.findOne({ cardFingerprint, action: "added" })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findActionById(actionId: Types.ObjectId): Promise<IAllowlistAction | null> {
    return AllowlistAction.findById(actionId).exec();
  }

  async insertAction(
    doc: Omit<IAllowlistAction, "_id" | "createdAt"> & { createdAt?: Date }
  ): Promise<IAllowlistAction> {
    return AllowlistAction.create({ ...doc, createdAt: doc.createdAt ?? new Date() });
  }

  async listRecentActions(args: {
    limit: number;
    action: "added" | "skipped" | "removed" | "all";
  }): Promise<IAllowlistAction[]> {
    const filter = args.action === "all" ? {} : { action: args.action };
    return AllowlistAction.find(filter).sort({ createdAt: -1 }).limit(args.limit).exec();
  }
}
```

- [ ] **Step 2: Type-check passes**

```bash
npm run type-check
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/allowlist/MongoAllowlistRepository.ts
git commit -m "feat(allowlist): add MongoAllowlistRepository implementation"
```

---

### Task 5: AllowlistService — `evaluate()` (TDD)

**Files:**
- Create: `src/services/allowlist/AllowlistService.ts` (initial — `evaluate()` only)
- Create: `src/services/allowlist/__tests__/AllowlistService.test.ts` (initial — `evaluate()` tests)

- [ ] **Step 1: Write the failing tests for `evaluate()`**

```ts
// src/services/allowlist/__tests__/AllowlistService.test.ts
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

async function run() {
  await testEvaluateRejectsFraudSignals();
  await testEvaluateRejectsWhenNoUser();
  await testEvaluateRejectsWhenUserHasNoSucceededPayment();
  await testEvaluateAcceptsKnownPayingMember();
  console.log("AllowlistService.evaluate() tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx tsx src/services/allowlist/__tests__/AllowlistService.test.ts
```
Expected: FAIL with `Cannot find module '../AllowlistService'` or similar.

- [ ] **Step 3: Implement the minimal `AllowlistService` with `evaluate()` only**

```ts
// src/services/allowlist/AllowlistService.ts
import type Stripe from "stripe";
import type { AllowlistRepository, EvalInput, EvalResult } from "./types";
import { isFraudSignalDeclineCode } from "./declineCodes";

export type AllowlistServiceDeps = {
  repo: AllowlistRepository;
  stripeRadar: Stripe.RadarResource;
};

export class AllowlistService {
  private readonly repo: AllowlistRepository;
  private readonly stripeRadar: Stripe.RadarResource;

  constructor(deps: AllowlistServiceDeps) {
    this.repo = deps.repo;
    this.stripeRadar = deps.stripeRadar;
  }

  async evaluate(input: EvalInput): Promise<EvalResult> {
    if (isFraudSignalDeclineCode(input.declineCode)) {
      return { eligible: false, reason: "filter_fraud_signal" };
    }

    const userId = await this.repo.findUserId({
      stripeCustomerId: input.stripeCustomerId,
      customerEmail: input.customerEmail,
    });
    if (!userId) {
      return { eligible: false, reason: "filter_not_member" };
    }

    const hasPaid = await this.repo.userHasSucceededPayment(userId);
    if (!hasPaid) {
      return { eligible: false, reason: "filter_not_member" };
    }

    return { eligible: true, userId };
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx tsx src/services/allowlist/__tests__/AllowlistService.test.ts
```
Expected: `AllowlistService.evaluate() tests passed`.

- [ ] **Step 5: Commit**

```bash
git add src/services/allowlist/AllowlistService.ts src/services/allowlist/__tests__/AllowlistService.test.ts
git commit -m "feat(allowlist): AllowlistService.evaluate() with TDD coverage"
```

---

### Task 6: AllowlistService — `apply()` (TDD)

**Files:**
- Modify: `src/services/allowlist/AllowlistService.ts` (add `apply()`)
- Modify: `src/services/allowlist/__tests__/AllowlistService.test.ts` (add `apply()` tests)

- [ ] **Step 1: Add `apply()` failing tests to the test file**

Append to `AllowlistService.test.ts` (above the `run()` function — and add the new tests to the `run()` body):

```ts
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
```

Update the `run()` function at the bottom of the test file to include the new tests:

```ts
async function run() {
  await testEvaluateRejectsFraudSignals();
  await testEvaluateRejectsWhenNoUser();
  await testEvaluateRejectsWhenUserHasNoSucceededPayment();
  await testEvaluateAcceptsKnownPayingMember();
  await testApplyEligibleWritesAddedRowAndCallsStripe();
  await testApplyNotEligibleWritesSkippedRowAndDoesNotCallStripe();
  await testApplyFraudSignalSkippedAndNotCalled();
  await testApplyIsIdempotent();
  await testApplyAdminBulkOverrideForcesAddedRow();
  await testApplyAdminBulkWithoutOverrideUsesManualAdminReason();
  await testApplyValueAlreadyExistsTreatedAsSuccess();
  console.log("AllowlistService.evaluate() + apply() tests passed");
}
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx tsx src/services/allowlist/__tests__/AllowlistService.test.ts
```
Expected: FAIL with `svc.apply is not a function`.

- [ ] **Step 3: Implement `apply()` in `AllowlistService.ts`**

Add to the `AllowlistService` class:

```ts
async apply(
  input: EvalInput,
  source: ApplySource,
  performedByUserId: Types.ObjectId | null,
  allowOverride: boolean = false
): Promise<IAllowlistAction> {
  // Idempotency: if we've already added this fingerprint, return the existing row.
  const existing = await this.repo.findActiveAddedActionByFingerprint(input.cardFingerprint);
  if (existing) return existing;

  const eval_ = await this.evaluate(input);

  // Skip path
  if (!eval_.eligible && !(allowOverride && source === "admin_bulk")) {
    return this.repo.insertAction({
      cardFingerprint: input.cardFingerprint,
      cardLast4: input.cardLast4,
      cardBrand: input.cardBrand,
      stripeCustomerId: input.stripeCustomerId,
      userId: null,
      customerEmail: input.customerEmail,
      action: "skipped",
      reason: eval_.reason,
      declineCode: input.declineCode,
      failureCode: input.failureCode,
      triggeringPaymentIntentId: input.triggeringPaymentIntentId,
      triggeringChargeId: input.triggeringChargeId,
      stripeListItemId: null,
      source,
      performedByUserId,
    } as never);
  }

  // Add path: call Stripe, write added row.
  const reason: IAllowlistAction["reason"] =
    !eval_.eligible
      ? "manual_admin_override"
      : source === "admin_bulk"
      ? "manual_admin"
      : "auto_eligible";

  const userId = eval_.eligible ? eval_.userId : null;

  let stripeListItemId: string | null = null;
  try {
    const listId = await getAllowCardFingerprintListId(this.stripeRadar);
    const item = await this.stripeRadar.valueListItems.create({
      value_list: listId,
      value: input.cardFingerprint,
    });
    stripeListItemId = item.id;
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code !== "value_already_exists") {
      throw err;
    }
    // value_already_exists: treat as success, leave stripeListItemId null.
  }

  return this.repo.insertAction({
    cardFingerprint: input.cardFingerprint,
    cardLast4: input.cardLast4,
    cardBrand: input.cardBrand,
    stripeCustomerId: input.stripeCustomerId,
    userId,
    customerEmail: input.customerEmail,
    action: "added",
    reason,
    declineCode: input.declineCode,
    failureCode: input.failureCode,
    triggeringPaymentIntentId: input.triggeringPaymentIntentId,
    triggeringChargeId: input.triggeringChargeId,
    stripeListItemId,
    source,
    performedByUserId,
  } as never);
}
```

Add the new imports at the top of `AllowlistService.ts`:

```ts
import type { Types } from "mongoose";
import type { IAllowlistAction } from "@/models/AllowlistAction";
import type { ApplySource } from "./types";
import { getAllowCardFingerprintListId } from "./stripeListResolver";
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx tsx src/services/allowlist/__tests__/AllowlistService.test.ts
```
Expected: `AllowlistService.evaluate() + apply() tests passed`.

- [ ] **Step 5: Commit**

```bash
git add src/services/allowlist/AllowlistService.ts src/services/allowlist/__tests__/AllowlistService.test.ts
git commit -m "feat(allowlist): AllowlistService.apply() with idempotency, override, value_already_exists"
```

---

### Task 7: AllowlistService — `reverse()` (TDD)

**Files:**
- Modify: `src/services/allowlist/AllowlistService.ts` (add `reverse()`)
- Modify: `src/services/allowlist/__tests__/AllowlistService.test.ts` (add `reverse()` tests)

- [ ] **Step 1: Add `reverse()` failing tests**

Append to `AllowlistService.test.ts`:

```ts
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
```

Update the `run()` function:

```ts
async function run() {
  // ... existing tests ...
  await testReverseRemovesFromStripeAndWritesRemovedRow();
  await testReverseTreats404AsSuccess();
  await testReverseThrowsWhenActionNotFound();
  console.log("AllowlistService tests passed");
}
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx tsx src/services/allowlist/__tests__/AllowlistService.test.ts
```
Expected: FAIL with `svc.reverse is not a function`.

- [ ] **Step 3: Implement `reverse()` on the `AllowlistService` class**

```ts
async reverse(
  actionId: Types.ObjectId,
  performedByUserId: Types.ObjectId
): Promise<IAllowlistAction> {
  const original = await this.repo.findActionById(actionId);
  if (!original) {
    throw new Error(`AllowlistAction not found: ${String(actionId)}`);
  }
  if (original.action !== "added") {
    throw new Error(
      `Cannot reverse a ${original.action} action; only 'added' actions are reversible`
    );
  }

  if (original.stripeListItemId) {
    try {
      await this.stripeRadar.valueListItems.del(original.stripeListItemId);
    } catch (err) {
      const status = (err as { statusCode?: number; status?: number } | null)?.statusCode
        ?? (err as { statusCode?: number; status?: number } | null)?.status;
      if (status !== 404) {
        throw err;
      }
      // 404: Stripe is already in desired state; record reversal anyway.
    }
  }

  return this.repo.insertAction({
    cardFingerprint: original.cardFingerprint,
    cardLast4: original.cardLast4,
    cardBrand: original.cardBrand,
    stripeCustomerId: original.stripeCustomerId,
    userId: original.userId,
    customerEmail: original.customerEmail,
    action: "removed",
    reason: "manual_reversal",
    declineCode: original.declineCode,
    failureCode: original.failureCode,
    triggeringPaymentIntentId: original.triggeringPaymentIntentId,
    triggeringChargeId: original.triggeringChargeId,
    stripeListItemId: original.stripeListItemId,
    source: "admin_reversal",
    performedByUserId,
  } as never);
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx tsx src/services/allowlist/__tests__/AllowlistService.test.ts
```
Expected: `AllowlistService tests passed`.

- [ ] **Step 5: Commit**

```bash
git add src/services/allowlist/AllowlistService.ts src/services/allowlist/__tests__/AllowlistService.test.ts
git commit -m "feat(allowlist): AllowlistService.reverse() with 404 tolerance"
```

---

### Task 8: AllowlistService — `listBlockedFromStripe()`

**Files:**
- Modify: `src/services/allowlist/AllowlistService.ts` (add `listBlockedFromStripe()` and the dependency on `stripe.paymentIntents`)

This method touches the live Stripe API; it's verified by manual smoke test through the admin UI (Task 17) rather than unit tests.

- [ ] **Step 1: Extend the constructor deps to include `stripeFull`**

Update `AllowlistServiceDeps` and constructor in `AllowlistService.ts`:

```ts
export type AllowlistServiceDeps = {
  repo: AllowlistRepository;
  stripeRadar: Stripe.RadarResource;
  /** Full Stripe client — needed for paymentIntents.list. Optional in tests that only exercise evaluate/apply/reverse. */
  stripeClient?: Stripe;
};

// in constructor:
private readonly stripeClient: Stripe | null;
constructor(deps: AllowlistServiceDeps) {
  this.repo = deps.repo;
  this.stripeRadar = deps.stripeRadar;
  this.stripeClient = deps.stripeClient ?? null;
}
```

- [ ] **Step 2: Add the method**

```ts
async listBlockedFromStripe(filter: BlockedFilter): Promise<BlockedRow[]> {
  if (!this.stripeClient) {
    throw new Error("listBlockedFromStripe requires a full Stripe client; was not provided in deps");
  }

  // Stripe's paymentIntents.list does not accept an outcome filter directly,
  // so we paginate failed PIs in the date range and filter client-side by
  // outcome.type === "blocked" or outcome.network_status === "declined_by_network".
  const collected: Stripe.PaymentIntent[] = [];
  for await (const pi of this.stripeClient.paymentIntents.list({
    created: {
      gte: Math.floor(filter.dateFrom.getTime() / 1000),
      lte: Math.floor(filter.dateTo.getTime() / 1000),
    },
    limit: 100,
    expand: ["data.latest_charge"],
  })) {
    if (pi.status !== "requires_payment_method" && pi.status !== "canceled") continue;
    const charge =
      pi.latest_charge && typeof pi.latest_charge !== "string" ? pi.latest_charge : null;
    if (!charge) continue;
    const isBlocked =
      charge.outcome?.type === "blocked" ||
      charge.outcome?.network_status === "declined_by_network";
    if (!isBlocked) continue;
    collected.push(pi);
  }

  const rows: BlockedRow[] = [];
  for (const pi of collected) {
    const charge = pi.latest_charge as Stripe.Charge;
    const card = charge.payment_method_details?.card;
    if (!card?.fingerprint) continue;

    const stripeCustomerId =
      typeof pi.customer === "string" ? pi.customer : pi.customer?.id ?? null;
    const customerEmail = pi.receipt_email ?? charge.billing_details?.email ?? null;
    const declineCode = pi.last_payment_error?.decline_code ?? null;
    const failureCode = pi.last_payment_error?.code ?? null;

    const evalResult = await this.evaluate({
      cardFingerprint: card.fingerprint,
      cardLast4: card.last4 ?? "",
      cardBrand: card.brand ?? "unknown",
      stripeCustomerId,
      customerEmail,
      declineCode,
      failureCode,
      triggeringPaymentIntentId: pi.id,
      triggeringChargeId: charge.id,
    });

    const existingAdded = await this.repo.findActiveAddedActionByFingerprint(card.fingerprint);

    // Apply admin-page filters
    if (filter.memberStatus === "has_paid" && !evalResult.eligible && evalResult.reason === "filter_not_member") continue;
    if (filter.memberStatus === "never_paid" && (evalResult.eligible || evalResult.reason !== "filter_not_member")) continue;
    if (filter.declineReason === "transient_only" && declineCode && (FRAUD_SIGNAL_DECLINE_CODES_LOCAL.has(declineCode))) continue;
    if (filter.declineReason === "fraud_signals_only" && (!declineCode || !FRAUD_SIGNAL_DECLINE_CODES_LOCAL.has(declineCode))) continue;
    if (filter.skippedOnly && !(!evalResult.eligible)) continue;

    rows.push({
      paymentIntentId: pi.id,
      chargeId: charge.id,
      createdAt: new Date(pi.created * 1000),
      amount: pi.amount,
      currency: pi.currency,
      cardFingerprint: card.fingerprint,
      cardLast4: card.last4 ?? "",
      cardBrand: card.brand ?? "unknown",
      stripeCustomerId,
      customerEmail,
      declineCode,
      failureCode,
      preview: evalResult.eligible
        ? { eligible: true }
        : { eligible: false, reason: evalResult.reason },
      alreadyAllowlisted: Boolean(existingAdded),
    });
  }
  return rows;
}
```

Add at the top of `AllowlistService.ts` (after existing imports):

```ts
import { FRAUD_SIGNAL_DECLINE_CODES as FRAUD_SIGNAL_DECLINE_CODES_LOCAL } from "./declineCodes";
import type { BlockedFilter, BlockedRow } from "./types";
```

(Note: the existing import of `isFraudSignalDeclineCode` already comes from `./declineCodes`; just extend the import to include the constant too. Choose whichever import style keeps the file clean.)

- [ ] **Step 3: Type-check passes**

```bash
npm run type-check
```
Expected: no errors.

- [ ] **Step 4: Re-run service tests** (they should still pass since `stripeClient` is optional in the constructor)

```bash
npx tsx src/services/allowlist/__tests__/AllowlistService.test.ts
```
Expected: still passes.

- [ ] **Step 5: Commit**

```bash
git add src/services/allowlist/AllowlistService.ts
git commit -m "feat(allowlist): AllowlistService.listBlockedFromStripe() for admin UI"
```

---

### Task 9: Singleton wiring + package.json test script

**Files:**
- Create: `src/services/allowlist/index.ts`
- Modify: `package.json`

- [ ] **Step 1: Create `index.ts` with the singleton**

```ts
// src/services/allowlist/index.ts
import { stripe } from "@/lib/stripe";
import { AllowlistService } from "./AllowlistService";
import { MongoAllowlistRepository } from "./MongoAllowlistRepository";

let instance: AllowlistService | null = null;

/** Returns the process-singleton AllowlistService wired to real Stripe + Mongo. */
export function getAllowlistService(): AllowlistService {
  if (instance) return instance;
  instance = new AllowlistService({
    repo: new MongoAllowlistRepository(),
    stripeRadar: stripe.radar,
    stripeClient: stripe,
  });
  return instance;
}

export type { AllowlistService } from "./AllowlistService";
```

- [ ] **Step 2: Add `test:allowlist` script to `package.json`**

In `package.json`, add this line in the `scripts` block, alphabetically near the other `test:*` entries:

```json
"test:allowlist": "tsx src/services/allowlist/__tests__/AllowlistService.test.ts",
```

- [ ] **Step 3: Run via npm script**

```bash
npm run test:allowlist
```
Expected: `AllowlistService tests passed`.

- [ ] **Step 4: Commit**

```bash
git add src/services/allowlist/index.ts package.json
git commit -m "feat(allowlist): singleton wiring + test:allowlist npm script"
```

---

### Task 10: Webhook integration

**Files:**
- Modify: `src/app/api/stripe/webhook/route.ts` (around lines 4987-4989, the `case "payment_intent.payment_failed":` branch)

- [ ] **Step 1: Read the existing branch to find the exact context**

```bash
npx tsx -e "console.log('Read lines 4980-5000 manually')"
```

Open `src/app/api/stripe/webhook/route.ts` and locate the existing `case "payment_intent.payment_failed":` (around line 4987). Currently it reads:

```ts
case "payment_intent.payment_failed":
  await handlePaymentFailure(event.data.object);
  break;
```

- [ ] **Step 2: Replace with the allowlist-aware version**

Replace those three lines with:

```ts
case "payment_intent.payment_failed": {
  const failedPi = event.data.object as Stripe.PaymentIntent;
  await handlePaymentFailure(failedPi);

  // Auto-allowlist eligibility check. Best-effort — see allowlist gotchas.md.
  try {
    const charge =
      failedPi.latest_charge && typeof failedPi.latest_charge !== "string"
        ? failedPi.latest_charge
        : failedPi.latest_charge
        ? await stripe.charges.retrieve(failedPi.latest_charge)
        : null;

    const isBlocked =
      charge?.outcome?.type === "blocked" ||
      charge?.outcome?.network_status === "declined_by_network";

    if (isBlocked && charge?.payment_method_details?.card?.fingerprint) {
      const card = charge.payment_method_details.card;
      const { getAllowlistService } = await import("@/services/allowlist");
      const allowlist = getAllowlistService();
      await allowlist.apply(
        {
          cardFingerprint: card.fingerprint,
          cardLast4: card.last4 ?? "",
          cardBrand: card.brand ?? "unknown",
          stripeCustomerId:
            typeof failedPi.customer === "string"
              ? failedPi.customer
              : failedPi.customer?.id ?? null,
          customerEmail:
            failedPi.receipt_email ?? charge.billing_details?.email ?? null,
          declineCode: failedPi.last_payment_error?.decline_code ?? null,
          failureCode: failedPi.last_payment_error?.code ?? null,
          triggeringPaymentIntentId: failedPi.id,
          triggeringChargeId: charge.id,
        },
        "webhook",
        null
      );
    }
  } catch (allowlistErr) {
    // Best-effort: do NOT bubble. See docs/billing-stripe/gotchas.md — bubbling
    // would cause Stripe to retry the entire payment_intent.payment_failed
    // webhook, re-running the (already-completed) handlePaymentFailure handler.
    webhookLog(
      "error",
      `AllowlistService.apply failed for PI ${failedPi.id}: ${
        allowlistErr instanceof Error ? allowlistErr.message : String(allowlistErr)
      }`
    );
  }
  break;
}
```

(`webhookLog` and `stripe` are already imported in this file. Verify by grepping the top of the file before adding.)

- [ ] **Step 3: Type-check passes**

```bash
npm run type-check
```
Expected: no errors.

- [ ] **Step 4: Lint passes**

```bash
npm run lint
```
Expected: no new errors in `route.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/stripe/webhook/route.ts
git commit -m "feat(allowlist): wire AllowlistService into payment_intent.payment_failed webhook"
```

---

### Task 11: API endpoint — `GET /api/admin/allowlist/blocked-cards`

**Files:**
- Create: `src/app/api/admin/allowlist/blocked-cards/route.ts`

- [ ] **Step 1: Create the route handler**

```ts
// src/app/api/admin/allowlist/blocked-cards/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/api-auth";
import connectDB from "@/lib/mongodb";
import { getAllowlistService } from "@/services/allowlist";
import type { BlockedFilter } from "@/services/allowlist/types";

function parseDateOrDefault(raw: string | null, fallback: Date): Date {
  if (!raw) return fallback;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser();
  if ("errorResponse" in auth) return auth.errorResponse;

  await connectDB();

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const filter: BlockedFilter = {
    dateFrom: parseDateOrDefault(searchParams.get("dateFrom"), thirtyDaysAgo),
    dateTo: parseDateOrDefault(searchParams.get("dateTo"), now),
    memberStatus:
      (searchParams.get("memberStatus") as BlockedFilter["memberStatus"]) ?? "any",
    declineReason:
      (searchParams.get("declineReason") as BlockedFilter["declineReason"]) ?? "any",
    skippedOnly: searchParams.get("skippedOnly") === "true",
  };

  try {
    const rows = await getAllowlistService().listBlockedFromStripe(filter);
    return NextResponse.json({ success: true, rows });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to list blocked cards",
      },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Type-check + lint**

```bash
npm run type-check
npm run lint
```
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/allowlist/blocked-cards/route.ts
git commit -m "feat(allowlist): add GET /api/admin/allowlist/blocked-cards endpoint"
```

---

### Task 12: API endpoint — `POST /api/admin/allowlist/apply`

**Files:**
- Create: `src/app/api/admin/allowlist/apply/route.ts`

- [ ] **Step 1: Create the route handler**

```ts
// src/app/api/admin/allowlist/apply/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { requireAdminUser } from "@/lib/api-auth";
import connectDB from "@/lib/mongodb";
import { getAllowlistService } from "@/services/allowlist";

const Body = z.object({
  rows: z
    .array(
      z.object({
        cardFingerprint: z.string().min(1),
        cardLast4: z.string().default(""),
        cardBrand: z.string().default("unknown"),
        stripeCustomerId: z.string().nullable().default(null),
        customerEmail: z.string().nullable().default(null),
        declineCode: z.string().nullable().default(null),
        failureCode: z.string().nullable().default(null),
        triggeringPaymentIntentId: z.string().nullable().default(null),
        triggeringChargeId: z.string().nullable().default(null),
      })
    )
    .min(1)
    .max(500),
  allowOverride: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser();
  if ("errorResponse" in auth) return auth.errorResponse;

  await connectDB();

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      { success: false, error: "Invalid request body", detail: String(err) },
      { status: 400 }
    );
  }

  const svc = getAllowlistService();
  const performedBy = new Types.ObjectId(String(auth.adminUser._id));

  let added = 0;
  let skipped = 0;
  const errors: Array<{ cardFingerprint: string; message: string }> = [];

  for (const row of body.rows) {
    try {
      const result = await svc.apply(row, "admin_bulk", performedBy, body.allowOverride);
      if (result.action === "added") added += 1;
      else if (result.action === "skipped") skipped += 1;
    } catch (err) {
      errors.push({
        cardFingerprint: row.cardFingerprint,
        message: err instanceof Error ? err.message : String(err),
      });
    }
    // Polite throttle — Stripe rate-limit headroom for ≤500-row bulks.
    await new Promise((r) => setTimeout(r, 50));
  }

  return NextResponse.json({ success: true, added, skipped, errors });
}
```

- [ ] **Step 2: Type-check + lint**

```bash
npm run type-check
npm run lint
```
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/allowlist/apply/route.ts
git commit -m "feat(allowlist): add POST /api/admin/allowlist/apply endpoint"
```

---

### Task 13: API endpoint — `POST /api/admin/allowlist/reverse`

**Files:**
- Create: `src/app/api/admin/allowlist/reverse/route.ts`

- [ ] **Step 1: Create the route handler**

```ts
// src/app/api/admin/allowlist/reverse/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { requireAdminUser } from "@/lib/api-auth";
import connectDB from "@/lib/mongodb";
import { getAllowlistService } from "@/services/allowlist";

const Body = z.object({
  actionId: z.string().refine((v) => Types.ObjectId.isValid(v), "Invalid actionId"),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser();
  if ("errorResponse" in auth) return auth.errorResponse;

  await connectDB();

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      { success: false, error: "Invalid request body", detail: String(err) },
      { status: 400 }
    );
  }

  try {
    const performedBy = new Types.ObjectId(String(auth.adminUser._id));
    const action = await getAllowlistService().reverse(new Types.ObjectId(body.actionId), performedBy);
    return NextResponse.json({ success: true, action });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Reverse failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Type-check + lint**

```bash
npm run type-check
npm run lint
```
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/allowlist/reverse/route.ts
git commit -m "feat(allowlist): add POST /api/admin/allowlist/reverse endpoint"
```

---

### Task 14: API endpoint — `GET /api/admin/allowlist/actions`

**Files:**
- Create: `src/app/api/admin/allowlist/actions/route.ts`

- [ ] **Step 1: Create the route handler**

```ts
// src/app/api/admin/allowlist/actions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/api-auth";
import connectDB from "@/lib/mongodb";
import AllowlistAction from "@/models/AllowlistAction";

const VALID_ACTION_FILTERS = new Set(["added", "skipped", "removed", "all"]);

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser();
  if ("errorResponse" in auth) return auth.errorResponse;

  await connectDB();

  const { searchParams } = new URL(request.url);
  const limitRaw = parseInt(searchParams.get("limit") ?? "50", 10);
  const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50));
  const action = (searchParams.get("action") ?? "all").toLowerCase();
  if (!VALID_ACTION_FILTERS.has(action)) {
    return NextResponse.json({ success: false, error: "Invalid action filter" }, { status: 400 });
  }

  const filter = action === "all" ? {} : { action };
  const docs = await AllowlistAction.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  return NextResponse.json({
    success: true,
    actions: docs.map((d) => ({ ...d, _id: String(d._id) })),
  });
}
```

- [ ] **Step 2: Type-check + lint**

```bash
npm run type-check
npm run lint
```
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/allowlist/actions/route.ts
git commit -m "feat(allowlist): add GET /api/admin/allowlist/actions endpoint"
```

---

### Task 15: queryKeys additions

**Files:**
- Modify: `src/lib/queryKeys.ts`

- [ ] **Step 1: Add the `allowlist` namespace to the existing `admin` block**

Inside the existing `admin: { ... }` object (around line 128 of the current file), add:

```ts
allowlist: {
  blockedCards: (filterKey: string) =>
    ["admin", "allowlist", "blocked-cards", filterKey] as const,
  actions: (action: string, limit: number) =>
    ["admin", "allowlist", "actions", action, limit] as const,
},
```

The `filterKey` is a stable string serialization of the filter (e.g. JSON stringify) — keeping it as one slot avoids fragile keying on each individual filter field.

- [ ] **Step 2: Type-check passes**

```bash
npm run type-check
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queryKeys.ts
git commit -m "feat(allowlist): add queryKeys for blocked-cards and actions"
```

---

### Task 16: TanStack Query hooks

**Files:**
- Create: `src/hooks/queries/admin/useBlockedCards.ts`
- Create: `src/hooks/queries/admin/useAllowlistActions.ts`

- [ ] **Step 1: Create `useBlockedCards.ts`**

```ts
// src/hooks/queries/admin/useBlockedCards.ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet } from "@/lib/queries";
import type { BlockedRow, BlockedFilter } from "@/services/allowlist/types";

export type BlockedCardsResponse = { success: true; rows: BlockedRow[] };

function buildQueryString(filter: BlockedFilter): string {
  const params = new URLSearchParams({
    dateFrom: filter.dateFrom.toISOString(),
    dateTo: filter.dateTo.toISOString(),
    memberStatus: filter.memberStatus,
    declineReason: filter.declineReason,
    skippedOnly: String(filter.skippedOnly),
  });
  return params.toString();
}

export function useBlockedCards(filter: BlockedFilter) {
  const filterKey = buildQueryString(filter);
  return useQuery({
    queryKey: queryKeys.admin.allowlist.blockedCards(filterKey),
    queryFn: async () => {
      const data = await apiGet<BlockedCardsResponse>(`/api/admin/allowlist/blocked-cards?${filterKey}`);
      return data.rows;
    },
    staleTime: 30_000,
  });
}
```

- [ ] **Step 2: Create `useAllowlistActions.ts`**

```ts
// src/hooks/queries/admin/useAllowlistActions.ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet, apiPost } from "@/lib/queries";
import type { IAllowlistAction } from "@/models/AllowlistAction";

type ActionFilter = "added" | "skipped" | "removed" | "all";

export function useAllowlistActions(action: ActionFilter = "added", limit = 50) {
  return useQuery({
    queryKey: queryKeys.admin.allowlist.actions(action, limit),
    queryFn: async () => {
      const data = await apiGet<{ success: true; actions: IAllowlistAction[] }>(
        `/api/admin/allowlist/actions?action=${action}&limit=${limit}`
      );
      return data.actions;
    },
    staleTime: 15_000,
  });
}

export type ApplyArgs = {
  rows: Array<{
    cardFingerprint: string;
    cardLast4: string;
    cardBrand: string;
    stripeCustomerId: string | null;
    customerEmail: string | null;
    declineCode: string | null;
    failureCode: string | null;
    triggeringPaymentIntentId: string | null;
    triggeringChargeId: string | null;
  }>;
  allowOverride: boolean;
};

export function useApplyAllowlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: ApplyArgs) =>
      apiPost<{ success: true; added: number; skipped: number; errors: Array<{ cardFingerprint: string; message: string }> }>(
        "/api/admin/allowlist/apply",
        args
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "allowlist"] });
    },
  });
}

export function useReverseAllowlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { actionId: string }) =>
      apiPost<{ success: true; action: IAllowlistAction }>("/api/admin/allowlist/reverse", args),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "allowlist"] });
    },
  });
}
```

- [ ] **Step 3: Type-check + lint**

```bash
npm run type-check
npm run lint
```
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/queries/admin/useBlockedCards.ts src/hooks/queries/admin/useAllowlistActions.ts
git commit -m "feat(allowlist): add TanStack Query hooks for admin UI"
```

---

### Task 17: Admin client component — `BlockedCardsClient.tsx`

**Files:**
- Create: `src/app/admin/billing/blocked-cards/BlockedCardsClient.tsx`

- [ ] **Step 1: Create the client component**

```tsx
// src/app/admin/billing/blocked-cards/BlockedCardsClient.tsx
"use client";

import { useMemo, useState } from "react";
import { useBlockedCards } from "@/hooks/queries/admin/useBlockedCards";
import {
  useAllowlistActions,
  useApplyAllowlist,
  useReverseAllowlist,
} from "@/hooks/queries/admin/useAllowlistActions";
import type { BlockedFilter, BlockedRow } from "@/services/allowlist/types";

const DEFAULT_FILTER: BlockedFilter = {
  dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  dateTo: new Date(),
  memberStatus: "has_paid",
  declineReason: "transient_only",
  skippedOnly: false,
};

export default function BlockedCardsClient() {
  const [filter, setFilter] = useState<BlockedFilter>(DEFAULT_FILTER);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: rows = [], isLoading, refetch } = useBlockedCards(filter);
  const { data: recentActions = [] } = useAllowlistActions("added", 50);
  const applyMutation = useApplyAllowlist();
  const reverseMutation = useReverseAllowlist();

  const eligibleRows = useMemo(
    () => rows.filter((r) => !r.alreadyAllowlisted),
    [rows]
  );

  const allSelected = eligibleRows.length > 0 && eligibleRows.every((r) => selected.has(r.cardFingerprint));

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(eligibleRows.map((r) => r.cardFingerprint)));
    }
  }

  function toggleRow(fp: string) {
    const next = new Set(selected);
    if (next.has(fp)) next.delete(fp);
    else next.add(fp);
    setSelected(next);
  }

  async function handleApplySelected(allowOverride: boolean) {
    const payload = eligibleRows
      .filter((r) => selected.has(r.cardFingerprint))
      .map((r) => ({
        cardFingerprint: r.cardFingerprint,
        cardLast4: r.cardLast4,
        cardBrand: r.cardBrand,
        stripeCustomerId: r.stripeCustomerId,
        customerEmail: r.customerEmail,
        declineCode: r.declineCode,
        failureCode: r.failureCode,
        triggeringPaymentIntentId: r.paymentIntentId,
        triggeringChargeId: r.chargeId,
      }));
    if (payload.length === 0) return;
    await applyMutation.mutateAsync({ rows: payload, allowOverride });
    setSelected(new Set());
    refetch();
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Blocked Cards</h1>
        <button
          onClick={() => refetch()}
          className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      <FilterBar filter={filter} onChange={setFilter} />

      <div className="border rounded">
        <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            Select all {eligibleRows.length} matching
          </label>
          <div className="flex gap-2">
            <button
              disabled={selected.size === 0 || applyMutation.isPending}
              onClick={() => handleApplySelected(false)}
              className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
            >
              Allowlist {selected.size} selected
            </button>
            <button
              disabled={selected.size === 0 || applyMutation.isPending}
              onClick={() => handleApplySelected(true)}
              className="px-3 py-1.5 bg-amber-600 text-white rounded text-sm disabled:opacity-50"
              title="Allow even rows the filter would skip"
            >
              Allowlist with override
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-6 text-center text-sm text-gray-500">Loading…</div>
        ) : (
          <BlockedTable
            rows={rows}
            selected={selected}
            onToggleRow={toggleRow}
          />
        )}
      </div>

      <RecentlyAllowlistedSection
        actions={recentActions}
        onReverse={(id) => reverseMutation.mutate({ actionId: id })}
        isReversing={reverseMutation.isPending}
      />
    </div>
  );
}

function FilterBar({
  filter,
  onChange,
}: {
  filter: BlockedFilter;
  onChange: (next: BlockedFilter) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
      <label className="text-sm">
        From
        <input
          type="date"
          value={filter.dateFrom.toISOString().slice(0, 10)}
          onChange={(e) => onChange({ ...filter, dateFrom: new Date(e.target.value) })}
          className="block w-full border rounded px-2 py-1"
        />
      </label>
      <label className="text-sm">
        To
        <input
          type="date"
          value={filter.dateTo.toISOString().slice(0, 10)}
          onChange={(e) => onChange({ ...filter, dateTo: new Date(e.target.value) })}
          className="block w-full border rounded px-2 py-1"
        />
      </label>
      <label className="text-sm">
        Member status
        <select
          value={filter.memberStatus}
          onChange={(e) =>
            onChange({ ...filter, memberStatus: e.target.value as BlockedFilter["memberStatus"] })
          }
          className="block w-full border rounded px-2 py-1"
        >
          <option value="any">Any</option>
          <option value="has_paid">Has paid before</option>
          <option value="never_paid">Never paid</option>
        </select>
      </label>
      <label className="text-sm">
        Decline reason
        <select
          value={filter.declineReason}
          onChange={(e) =>
            onChange({ ...filter, declineReason: e.target.value as BlockedFilter["declineReason"] })
          }
          className="block w-full border rounded px-2 py-1"
        >
          <option value="any">Any</option>
          <option value="transient_only">Transient only</option>
          <option value="fraud_signals_only">Fraud signals only</option>
        </select>
      </label>
    </div>
  );
}

function BlockedTable({
  rows,
  selected,
  onToggleRow,
}: {
  rows: BlockedRow[];
  selected: Set<string>;
  onToggleRow: (fp: string) => void;
}) {
  if (rows.length === 0) {
    return <div className="p-6 text-center text-sm text-gray-500">No blocked cards in this range.</div>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b">
        <tr>
          <th className="px-3 py-2 text-left w-8"></th>
          <th className="px-3 py-2 text-left">Date</th>
          <th className="px-3 py-2 text-left">Email</th>
          <th className="px-3 py-2 text-left">Card</th>
          <th className="px-3 py-2 text-left">Decline</th>
          <th className="px-3 py-2 text-left">Eligibility</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.paymentIntentId}
            className={r.alreadyAllowlisted ? "bg-green-50" : ""}
          >
            <td className="px-3 py-2">
              <input
                type="checkbox"
                checked={selected.has(r.cardFingerprint)}
                onChange={() => onToggleRow(r.cardFingerprint)}
                disabled={r.alreadyAllowlisted}
              />
            </td>
            <td className="px-3 py-2">{r.createdAt.toString().slice(0, 16).replace("T", " ")}</td>
            <td className="px-3 py-2">{r.customerEmail ?? "—"}</td>
            <td className="px-3 py-2">{r.cardBrand} ••{r.cardLast4}</td>
            <td className="px-3 py-2">{r.declineCode ?? "—"}</td>
            <td className="px-3 py-2">
              {r.alreadyAllowlisted
                ? "Already allowlisted"
                : r.preview.eligible
                ? "✓ Auto-eligible"
                : `⚠ ${r.preview.reason.replace("filter_", "")}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RecentlyAllowlistedSection({
  actions,
  onReverse,
  isReversing,
}: {
  actions: Array<{
    _id: string;
    cardBrand: string;
    cardLast4: string;
    customerEmail: string | null;
    source: string;
    createdAt: string;
  }>;
  onReverse: (id: string) => void;
  isReversing: boolean;
}) {
  return (
    <section className="border rounded">
      <header className="px-3 py-2 bg-gray-50 border-b text-sm font-medium">
        Recently allowlisted (last 50)
      </header>
      {actions.length === 0 ? (
        <div className="p-6 text-center text-sm text-gray-500">Nothing yet.</div>
      ) : (
        <ul className="divide-y">
          {actions.map((a) => (
            <li key={a._id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                {new Date(a.createdAt).toString().slice(0, 16).replace("T", " ")} ·{" "}
                {a.customerEmail ?? "—"} · {a.cardBrand} ••{a.cardLast4} · by {a.source}
              </span>
              <button
                disabled={isReversing}
                onClick={() => onReverse(String(a._id))}
                className="px-2 py-1 border rounded text-xs hover:bg-gray-50 disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Type-check + lint**

```bash
npm run type-check
npm run lint
```
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/billing/blocked-cards/BlockedCardsClient.tsx
git commit -m "feat(allowlist): add BlockedCardsClient admin UI component"
```

---

### Task 18: Admin page server wrapper

**Files:**
- Create: `src/app/admin/billing/blocked-cards/page.tsx`

- [ ] **Step 1: Create the server page wrapper with admin auth gating**

```tsx
// src/app/admin/billing/blocked-cards/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import BlockedCardsClient from "./BlockedCardsClient";

export default function BlockedCardsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "loading") return;
    if (!session || session.user?.role !== "admin") {
      router.push("/");
    }
  }, [session, status, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-600"></div>
      </div>
    );
  }
  if (!session || session.user?.role !== "admin") return null;
  return <BlockedCardsClient />;
}
```

(Mirrors the auth pattern in `src/app/admin/[tab]/page.tsx`.)

- [ ] **Step 2: Type-check + lint**

```bash
npm run type-check
npm run lint
```
Expected: both pass.

- [ ] **Step 3: Manual smoke test the page renders**

```bash
npm run dev
```
In a browser, log in as an admin user and navigate to `http://localhost:3000/admin/billing/blocked-cards`. Verify:
- Page renders without console errors.
- Filters and table appear.
- The default filter loads (it may show 0 rows in dev/test Stripe data — that's fine; the goal is "no error, page renders").

Stop the dev server with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/billing/blocked-cards/page.tsx
git commit -m "feat(allowlist): add /admin/billing/blocked-cards page with auth gate"
```

---

### Task 19: AdminSidebar navigation link

**Files:**
- Modify: `src/app/admin/component/AdminSidebar.tsx`

- [ ] **Step 1: Read the existing sidebar groups**

Open `src/app/admin/component/AdminSidebar.tsx`. The `adminTabGroups` array (starts ~line 56) defines tab groups. Each group has tabs that switch the AdminPage selectedTab state.

This new page is at a separate route (`/admin/billing/blocked-cards`), not a tab. We add a new entry that is NOT a tab — it's an external link via `router.push`. Find an existing group close to "billing/payments" semantically (e.g. the one containing affiliates or memberships), or add a new "Billing" group.

- [ ] **Step 2: Add a new "Billing" tab group with a single link**

After the existing `adminTabGroups` array entries (look for closing `]` of the array), insert a new group. Find a good location; pattern after existing groups. Add this entry before the closing `]`:

```ts
{
  id: "billing",
  label: "Billing",
  groupIcon: AlertCircle, // already imported
  tabs: [
    { id: "blocked-cards", label: "Blocked Cards", icon: AlertCircle },
  ],
},
```

(`AlertCircle` is already imported per Task 19 step 1's review of the file.)

- [ ] **Step 3: Make the sidebar route to `/admin/billing/blocked-cards` for this special tab**

Find the click handler that handles tab selection (search for `selectedTab` or `onClick`). Where it calls `setSelectedTab` or routes to `/admin/<tab>`, special-case `blocked-cards` to push to `/admin/billing/blocked-cards` instead.

The exact location depends on the file's structure. The minimal change pattern:

```ts
// where the tab click is handled, e.g.:
onClick={() => {
  if (tab.id === "blocked-cards") {
    router.push("/admin/billing/blocked-cards");
  } else {
    router.push(`/admin/${tab.id}`);
  }
}}
```

If the existing handler always does `router.push(`/admin/${tab.id}`)`, this special-case is the only change needed.

- [ ] **Step 4: Type-check + lint**

```bash
npm run type-check
npm run lint
```
Expected: both pass.

- [ ] **Step 5: Manual smoke test**

```bash
npm run dev
```
Open `http://localhost:3000/admin` as an admin. Verify:
- The sidebar shows a "Billing" group with "Blocked Cards" inside.
- Clicking "Blocked Cards" navigates to `/admin/billing/blocked-cards` and renders the page.

Stop dev server.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/component/AdminSidebar.tsx
git commit -m "feat(allowlist): add Billing > Blocked Cards link to admin sidebar"
```

---

### Task 20: Domain Manifest + docs updates

**Files:**
- Modify: `CLAUDE.md` (Domain Manifest)
- Modify: `docs/billing-stripe/architecture.md`
- Modify: `docs/billing-stripe/models.md`
- Modify: `docs/billing-stripe/api.md`
- Modify: `docs/billing-stripe/gotchas.md`

- [ ] **Step 1: Update `CLAUDE.md` Domain Manifest**

In the `billing-stripe.paths` array, add these new globs (in alphabetical position):

```json
"src/services/allowlist/**",
"src/models/AllowlistAction.ts",
"src/app/api/admin/allowlist/**",
"src/app/admin/billing/blocked-cards/**",
"src/hooks/queries/admin/useBlockedCards.ts",
"src/hooks/queries/admin/useAllowlistActions.ts"
```

Update `lastModified` at the top of the JSON block to `"2026-05-04"`. Do **not** hand-edit `billing-stripe.lastVerified` — the doc-sync Stop hook auto-bumps that field when the matching docs are updated in step 7's commit.

- [ ] **Step 2: Update `docs/billing-stripe/architecture.md`**

Add a section for `AllowlistService` to the service inventory. Pattern after existing service entries; describe:
- Purpose: gates auto-allowlisting + provides bulk admin operations.
- Inputs: `EvalInput` from webhook or admin page.
- Outputs: `AllowlistAction` documents.
- Dependencies: Stripe Radar API + `AllowlistRepository`.

Keep the section short — 100-200 words.

- [ ] **Step 3: Update `docs/billing-stripe/models.md`**

Add the `AllowlistAction` schema. Document each field, the three indexes, and the "Stripe is source of truth, this is audit log" principle. Reference the spec for full design rationale.

- [ ] **Step 4: Update `docs/billing-stripe/api.md`**

Document the four new admin endpoints:
- `GET /api/admin/allowlist/blocked-cards`
- `POST /api/admin/allowlist/apply`
- `POST /api/admin/allowlist/reverse`
- `GET /api/admin/allowlist/actions`

For each: route, method, auth, request shape, response shape, error cases.

- [ ] **Step 5: Update `docs/billing-stripe/gotchas.md`**

Add a section "Stripe issuer-directed auto-block + allowlist override":
- Explain that Stripe auto-blocks a card after the issuer declines with `lost_card`/`stolen_card`/`pickup_card`/etc.
- Activity log shows "directed Stripe to block future attempts".
- Adding to `allow_card_fingerprint` Radar list overrides BOTH Radar fraud rules AND the auto-block.
- Webhook signal: `charge.outcome.type === "blocked"` or `outcome.network_status === "declined_by_network"` distinguishes it from a one-off decline.
- Webhook auto-allowlist branch is best-effort (swallows errors and logs via `webhookLog`) so Stripe doesn't retry the entire `payment_intent.payment_failed` event.

- [ ] **Step 6: Type-check (no code changed but checking didn't break anything)**

```bash
npm run type-check
```
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md docs/billing-stripe/architecture.md docs/billing-stripe/models.md docs/billing-stripe/api.md docs/billing-stripe/gotchas.md
git commit -m "docs(allowlist): update billing-stripe docs and Domain Manifest"
```

---

### Task 21: Final verification pass

**Files:** none modified

- [ ] **Step 1: Lint**

```bash
npm run lint
```
Expected: passes with no new warnings/errors.

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```
Expected: passes.

- [ ] **Step 3: Run the new test suite**

```bash
npm run test:allowlist
```
Expected: `AllowlistService tests passed`.

- [ ] **Step 4: Run an adjacent test suite to confirm nothing broke**

```bash
npm run test:stripe-collection-pause
```
Expected: passes (this is the closest billing-stripe service-level test).

- [ ] **Step 5: Manual smoke test (one final pass)**

```bash
npm run dev
```
- Log in as admin.
- Navigate to `/admin/billing/blocked-cards`.
- Verify filters + table render.
- (If you have any test blocked PIs in your Stripe test mode, verify one row appears with the correct preview status.)

Stop dev server.

- [ ] **Step 6: Confirm git status clean**

```bash
git status
```
Expected: `nothing to commit, working tree clean`.

- [ ] **Step 7: Show commit history of the branch**

```bash
git log --oneline origin/main..HEAD
```
Expected: ~21 commits, one per task. (The exact count will vary if some tasks were combined or split.)

- [ ] **Step 8: Hand off to user**

Tell the user:
> "Implementation plan complete. All tasks committed on `claude/stripe-allowlist` in `.worktrees/stripe-allowlist`. Ready for code review or `/review`."

---

## Out of Scope (per spec section 16)

The following are explicitly NOT in this plan:
- Auto-reversal on `charge.dispute.created` (defer until we have data).
- Slack/email notifications when fraud-signal cards are skipped at high volume.
- Bulk reversal in the admin page.
- "User detail page" widget showing allowlist actions per user.
- Standalone CLI script (the admin page replaces it).
