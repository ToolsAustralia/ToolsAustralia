# Multi-Step Cancellation Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-screen `CancellationUpsellModal` with a reason-routed, multi-step cancellation/retention flow (reason capture → tailored offer → universal +100-entries rung → cancel confirm), with funnel analytics and 90-day post-save retention tracking.

**Architecture:** New responsive `CancellationFlowModal` on the shared `ModalContainer` primitive (desktop popup / mobile bottom sheet). One thin grouped route `POST /api/subscription/cancellation-flow` delegating to a new `CancellationFlowService`. Offers reuse existing endpoints where they exist (cancel, +100 redeem, tier downgrade, Klaviyo unsubscribe); Pause-30d and 50%-off coupon are net-new. A `CancellationFlowEvent` model logs every run; a daily cron matures 90-day retention. Pause work edits shared `pause_collection` recovery code under a mandatory test-first protocol.

**Tech Stack:** Next.js 15 App Router, Mongoose, Stripe, NextAuth, TanStack Query, framer-motion, Tailwind, Zod, standalone `tsx` test scripts (no jest/vitest).

**Source of truth:** `docs/superpowers/specs/2026-05-18-multi-step-cancellation-flow-design.md`. Read it before starting; section refs (§3, §5, §6a, §3a) below point into it.

---

## Conventions for every task

> **Codebase facts verified in review — every task inherits these. Do NOT deviate:**
> - **`connectDB` is a DEFAULT export** (`src/lib/mongodb.ts:306`). Always `import connectDB from "@/lib/mongodb"` — never `import { connectDB }`. (Applies to Tasks 5, 12, 13, 18, 20.)
> - **Auth in routes:** `import { getServerSession } from "next-auth"`, `import { authOptions } from "@/lib/auth"`, then `const session = await getServerSession(authOptions)`; the user id is `session.user.id` (string, = token.sub). Admin routes additionally gate on `session.user.role === "admin"`. Pattern reference: `src/app/api/subscription/benefits/route.ts:10-25`.
> - **Cron routes** must declare `export const dynamic = "force-dynamic";` and `export const runtime = "nodejs";` and copy the `isAuthorized` helper from `src/app/api/cron/membership-daily-snapshot/route.ts:13-18` **verbatim** (note: it returns `true` when `CRON_SECRET` is unset — keep that behavior identical). GET handler. (Applies to Tasks 13, 20.)
> - **Zod:** `import { z } from "zod"`. `z.enum` with an imported `as const` array is NOT used anywhere in this repo and Zod v4 may reject it — always spread + cast: `z.enum([...CANCELLATION_REASONS] as [string, ...string[]])`. `z.discriminatedUnion` is also net-new here; it is acceptable but test the parse path manually.
> - **Mongoose enum + null:** never put `null` inside an `enum:` array. For optional fields that mean "not set yet", use `enum: ["retained","churned"]` with `default: null` and **no `required`** — Mongoose skips enum validation for null/undefined. (Applies to Task 1 `offerAccepted`, `retention90`.)

- **Tests** are standalone `tsx` scripts at `src/**/__tests__/*.test.ts`, each wired to a `package.json` `test:<scope>` script and run with `npx tsx <file>` via that script. **Match the existing runner exactly:** `import assert from "node:assert/strict"`, define **named test functions**, and invoke them from a single `run()` called at the bottom — see `src/services/subscription/__tests__/SubscriptionCollectionPauseService.test.ts:1,56-64`. Do NOT paste loose top-level `assert` statements; wrap them in a named function added to `run()`. Note `npm run test:stripe-collection-pause` runs **two** files (`SubscriptionCollectionPauseService.test.ts` **and** `failed-invoice-pause-selection.test.ts`) — both must stay green.
- **No business logic in `app/api/**`** — routes parse/validate (Zod from `src/lib/zod/`), authorize (`src/lib/api-auth.ts` / `getServerSession`), delegate to `src/services/`.
- **Doc-sync Stop hook** will block on stale docs. Per spec §7, the manifest in **both** CLAUDE.md copies (repo root + this worktree) must be edited; touch `docs/subscription/`, `docs/admin/`, `docs/infrastructure/` as the changed paths dictate.
- **Commits:** frequent, one per task minimum. No push. End messages with the Co-Authored-By trailer used in this repo.
- **Verify before claiming done:** every "run" step must show expected output; `npm run type-check` and `npm run lint` must pass before each commit.

---

## File Structure

**Create:**
- `src/models/CancellationFlowEvent.ts` — funnel-log Mongoose model (one collection).
- `src/utils/subscription/cancellation-flow-eligibility.ts` — pure one-time-offer eligibility (server-authoritative; client imports the same module).
- `src/utils/subscription/cancellation-flow-routing.ts` — pure reason→offer-sequence resolver.
- `src/services/subscription/CancellationFlowService.ts` — orchestration: log lifecycle + offer application.
- `src/services/subscription/RetentionPauseService.ts` — retention pause apply + auto-resume (separate from recovery `SubscriptionCollectionPauseService.ts`).
- `src/services/subscription/RetentionDiscountService.ts` — 50%-off ×2mo coupon application.
- `src/app/api/subscription/cancellation-flow/route.ts` — thin grouped endpoint.
- `src/app/api/cron/cancellation-retention-maturity/route.ts` — daily 90-day maturity cron.
- `src/components/modals/CancellationFlowModal/` — `index.tsx`, `Step1Reason.tsx`, `Step2Offer.tsx`, `Step3BonusEntries.tsx`, `Step4Confirm.tsx`, `StepIndicator.tsx`, `useCancellationFlow.ts`, `types.ts`.
- `src/hooks/queries/useCancellationFlow.ts` — TanStack mutation hooks.
- Test files under `src/**/__tests__/`.

**Modify:**
- `src/services/subscription/pauseCollectionPolicy.ts` — extend the pure clear-decision (move the `pause_collection != null` clause in + add retention exclusion).
- `src/services/stripe-webhook-handlers/index.ts:3430-3436` — pass `subscription.metadata?.pauseReason` into the policy fn (no other change).
- `src/components/modals/SubscriptionManagementModal/index.tsx` — swap `CancellationUpsellModal` for `CancellationFlowModal`.
- `src/models/User.ts` — add one-time-offer consumption flags (see Task 2).
- `vercel.json` — add the new cron schedule.
- Both `CLAUDE.md` manifests + `docs/subscription/`, `docs/admin/`, `docs/infrastructure/`.

**Delete (Phase 5, after parity reached):**
- `src/components/modals/CancellationUpsellModal/**` and `src/app/api/cancellation-upsell/redeem/route.ts` only if fully superseded; otherwise keep redeem route and reuse it (see Task 9).

---

## PHASE 1 — Reason capture + modal shell + analytics model + past-due short-circuit

Ships: working multi-step modal that captures reason, logs the funnel, and (for now) routes every reason to the existing cancel/+100 terminal. Past-due members short-circuit per §3a.

### Task 1: `CancellationFlowEvent` model

**Files:**
- Create: `src/models/CancellationFlowEvent.ts`
- Test: `src/models/__tests__/CancellationFlowEvent.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/models/__tests__/CancellationFlowEvent.test.ts
import assert from "node:assert";
import CancellationFlowEvent from "../CancellationFlowEvent";

function run() {
  const doc = new CancellationFlowEvent({
    userId: "000000000000000000000001",
    reason: "too_expensive",
    outcome: "in_progress",
    pastDue: false,
    offersShown: [],
    startedAt: new Date(),
  });
  const err = doc.validateSync();
  assert.strictEqual(err, undefined, "valid doc should pass validation");

  const bad = new CancellationFlowEvent({ userId: "x", reason: "nope", outcome: "in_progress" });
  assert.ok(bad.validateSync(), "invalid reason enum should fail validation");

  console.log("PASS CancellationFlowEvent model");
}
run();
```

- [ ] **Step 2: Run test, verify it fails**

Add to `package.json` scripts: `"test:cancellation-flow-event": "tsx src/models/__tests__/CancellationFlowEvent.test.ts"`.
Run: `npm run test:cancellation-flow-event`
Expected: FAIL — `Cannot find module '../CancellationFlowEvent'`.

- [ ] **Step 3: Implement the model**

```ts
// src/models/CancellationFlowEvent.ts
import mongoose, { Schema, model, models } from "mongoose";

export const CANCELLATION_REASONS = [
  "too_expensive",
  "prefer_cheaper",
  "dont_use_benefits",
  "too_many_messages",
  "joined_for_giveaway",
  "havent_won",
  "other",
] as const;
export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

export const OFFER_TYPES = [
  "pause_30d",
  "discount_50_2mo",
  "tier_downgrade",
  "unsubscribe_marketing",
  "bonus_entries_100",
] as const;
export type OfferType = (typeof OFFER_TYPES)[number];

export interface ICancellationFlowEvent {
  userId: mongoose.Types.ObjectId | string;
  reason: CancellationReason;
  reasonText?: string;
  offersShown: OfferType[];
  offerAccepted?: OfferType | null;
  outcome: "in_progress" | "saved" | "cancelled";
  pastDue: boolean;
  startedAt: Date;
  endedAt?: Date;
  savedAt?: Date;
  retention90?: "retained" | "churned" | null;
}

const schema = new Schema<ICancellationFlowEvent>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    reason: { type: String, enum: CANCELLATION_REASONS, required: true },
    reasonText: { type: String },
    offersShown: [{ type: String, enum: OFFER_TYPES }],
    // no `null` inside enum — optional + default null; Mongoose skips enum check for null
    offerAccepted: { type: String, enum: OFFER_TYPES, default: null },
    outcome: { type: String, enum: ["in_progress", "saved", "cancelled"], required: true, index: true },
    pastDue: { type: Boolean, default: false },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date },
    savedAt: { type: Date },
    retention90: { type: String, enum: ["retained", "churned"], default: null, index: true },
  },
  { timestamps: true }
);
schema.index({ outcome: 1, savedAt: 1, retention90: 1 });

export default (models.CancellationFlowEvent as mongoose.Model<ICancellationFlowEvent>) ||
  model<ICancellationFlowEvent>("CancellationFlowEvent", schema);
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:cancellation-flow-event`
Expected: `PASS CancellationFlowEvent model`.

- [ ] **Step 5: Manifest + docs**

Add `"src/models/CancellationFlowEvent.ts"` to the `subscription` domain `paths` in **both** CLAUDE.md files. Add a short section to `docs/subscription/` (data model doc) describing the funnel event. Run `npm run type-check` (expect clean).

- [ ] **Step 6: Commit**

```bash
git add src/models/CancellationFlowEvent.ts src/models/__tests__/CancellationFlowEvent.test.ts package.json CLAUDE.md docs/
git commit -m "feat(subscription): add CancellationFlowEvent funnel-log model"
```

### Task 2: One-time-offer consumption flags on User

**Files:**
- Modify: `src/models/User.ts` (subscription sub-doc or top-level, mirror existing `cancellationUpsellRedeemed`)
- Test: `src/models/__tests__/User.cancellation-offers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert";
import User from "../User";
function run() {
  const u = new User({ email: "t@t.com" });
  // new flags default to false/undefined and are settable
  u.set("retentionOffersConsumed", { pause30d: true });
  assert.strictEqual(u.get("retentionOffersConsumed").pause30d, true);
  console.log("PASS User retentionOffersConsumed");
}
run();
```

- [ ] **Step 2: Run, verify fail**

Add `"test:user-cancellation-offers": "tsx src/models/__tests__/User.cancellation-offers.test.ts"`.
Run: `npm run test:user-cancellation-offers` → FAIL (path: cast/validation on unknown field).

- [ ] **Step 3: Implement** — add to the User schema (locate the existing `cancellationUpsellRedeemed` definition for placement):

```ts
retentionOffersConsumed: {
  pause30d: { type: Boolean, default: false },
  discount50_2mo: { type: Boolean, default: false },
  // bonusEntries100 reuses the legacy `cancellationUpsellRedeemed` flag (no new field)
},
```

Add the matching TS interface field: `retentionOffersConsumed?: { pause30d?: boolean; discount50_2mo?: boolean }`.

- [ ] **Step 4: Run, verify pass** → `PASS User retentionOffersConsumed`.

- [ ] **Step 5: Commit**

```bash
git add src/models/User.ts src/models/__tests__/User.cancellation-offers.test.ts package.json
git commit -m "feat(subscription): add retentionOffersConsumed one-time flags to User"
```

### Task 3: Pure reason→offer routing resolver

**Files:**
- Create: `src/utils/subscription/cancellation-flow-routing.ts`
- Test: `src/utils/subscription/__tests__/cancellation-flow-routing.test.ts`

Implements §3 routing table. Output is the ordered offer sequence for a reason (the lead, then the universal +100 fallback, with the "other" waterfall).

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert";
import { resolveOfferSequence } from "../cancellation-flow-routing";

function run() {
  assert.deepStrictEqual(resolveOfferSequence("too_expensive"), ["discount_50_2mo", "bonus_entries_100"]);
  assert.deepStrictEqual(resolveOfferSequence("prefer_cheaper"), ["tier_downgrade", "bonus_entries_100"]);
  assert.deepStrictEqual(resolveOfferSequence("dont_use_benefits"), ["pause_30d", "bonus_entries_100"]);
  assert.deepStrictEqual(resolveOfferSequence("too_many_messages"), ["unsubscribe_marketing", "bonus_entries_100"]);
  assert.deepStrictEqual(resolveOfferSequence("joined_for_giveaway"), ["bonus_entries_100"]);
  assert.deepStrictEqual(resolveOfferSequence("havent_won"), ["bonus_entries_100"]);
  assert.deepStrictEqual(resolveOfferSequence("other"), ["pause_30d", "discount_50_2mo", "bonus_entries_100"]);
  console.log("PASS resolveOfferSequence");
}
run();
```

- [ ] **Step 2: Run, verify fail** — add `"test:cancellation-routing": "tsx src/utils/subscription/__tests__/cancellation-flow-routing.test.ts"`; run → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// src/utils/subscription/cancellation-flow-routing.ts
import type { CancellationReason, OfferType } from "@/models/CancellationFlowEvent";

const LEAD: Record<CancellationReason, OfferType[]> = {
  too_expensive: ["discount_50_2mo"],
  prefer_cheaper: ["tier_downgrade"],
  dont_use_benefits: ["pause_30d"],
  too_many_messages: ["unsubscribe_marketing"],
  joined_for_giveaway: ["bonus_entries_100"],
  havent_won: ["bonus_entries_100"],
  other: ["pause_30d", "discount_50_2mo"],
};

/** Ordered offer sequence. +100 entries is the universal final rung unless it
 *  is already the lead (giveaway / havent_won). */
export function resolveOfferSequence(reason: CancellationReason): OfferType[] {
  const lead = LEAD[reason];
  if (lead.length === 1 && lead[0] === "bonus_entries_100") return ["bonus_entries_100"];
  return [...lead, "bonus_entries_100"];
}
```

- [ ] **Step 4: Run, verify pass** → `PASS resolveOfferSequence`.

- [ ] **Step 5: Commit**

```bash
git add src/utils/subscription/cancellation-flow-routing.ts src/utils/subscription/__tests__/cancellation-flow-routing.test.ts package.json
git commit -m "feat(subscription): pure reason->offer routing resolver"
```

### Task 4: One-time eligibility filter (pure)

**Files:**
- Create: `src/utils/subscription/cancellation-flow-eligibility.ts`
- Test: `src/utils/subscription/__tests__/cancellation-flow-eligibility.test.ts`

Filters a resolved sequence by what the customer has already consumed, and applies the §3a past-due rule (past-due ⇒ no retention rungs at all).

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert";
import { eligibleOffers } from "../cancellation-flow-eligibility";

function run() {
  // NOTE: these expectations assume the FINAL IMPLEMENTED_OFFERS set (all five).
  // While iterating phases, Task 14/16/17 each add the corresponding
  // assertion as they flip IMPLEMENTED_OFFERS. The Phase-2 version of this
  // test asserts only bonus_entries_100 + tier_downgrade surface; pause/
  // discount/unsubscribe are filtered out until their phase. Keep ONE test
  // file; gate phase-specific expectations behind the same IMPLEMENTED_OFFERS
  // import so the test evolves with the constant (import it and branch).

  // past-due ⇒ empty (Steps 2-3 skipped per §3a) — always true
  assert.deepStrictEqual(
    eligibleOffers(["discount_50_2mo", "bonus_entries_100"], { pastDue: true, consumed: {} }),
    []
  );
  // Phase-2 reality: discount not yet implemented ⇒ filtered, only +100 surfaces
  assert.deepStrictEqual(
    eligibleOffers(["discount_50_2mo", "bonus_entries_100"], { pastDue: false, consumed: {} }),
    ["bonus_entries_100"]
  );
  // +100 consumed ⇒ empty (caller sends straight to cancel confirm)
  assert.deepStrictEqual(
    eligibleOffers(["bonus_entries_100"], {
      pastDue: false,
      consumed: { bonusEntries100: true },
    }),
    []
  );
  // tier_downgrade is implemented in Phase 2 and is NOT one-time gated
  assert.deepStrictEqual(
    eligibleOffers(["tier_downgrade", "bonus_entries_100"], { pastDue: false, consumed: {} }),
    ["tier_downgrade", "bonus_entries_100"]
  );
  console.log("PASS eligibleOffers");
}
run();
```

- [ ] **Step 2: Run, verify fail** — add `"test:cancellation-eligibility": "tsx src/utils/subscription/__tests__/cancellation-flow-eligibility.test.ts"`; run → FAIL.

- [ ] **Step 3: Implement**

```ts
// src/utils/subscription/cancellation-flow-eligibility.ts
import type { OfferType } from "@/models/CancellationFlowEvent";

export interface ConsumedFlags {
  pause30d?: boolean;
  discount50_2mo?: boolean;
  bonusEntries100?: boolean; // sourced from legacy user.cancellationUpsellRedeemed
}
export interface EligibilityCtx {
  pastDue: boolean;
  consumed: ConsumedFlags;
}

const ONE_TIME: Partial<Record<OfferType, keyof ConsumedFlags>> = {
  pause_30d: "pause30d",
  discount_50_2mo: "discount50_2mo",
  bonus_entries_100: "bonusEntries100",
};

/** Offers whose backend is shipped. Phase 2 ships these two; Tasks 14/16/17
 *  each ADD one entry as their phase lands, so no dead UI is ever reachable. */
export const IMPLEMENTED_OFFERS: ReadonlySet<OfferType> = new Set<OfferType>([
  "bonus_entries_100",
  "tier_downgrade",
  // "pause_30d"        ← added in Task 14
  // "discount_50_2mo"  ← added in Task 16
  // "unsubscribe_marketing" ← added in Task 17
]);

export function eligibleOffers(sequence: OfferType[], ctx: EligibilityCtx): OfferType[] {
  if (ctx.pastDue) return []; // §3a — past-due skips all retention rungs
  return sequence.filter((offer) => {
    if (!IMPLEMENTED_OFFERS.has(offer)) return false; // not-yet-shipped offers never surface
    const flag = ONE_TIME[offer];
    if (!flag) return true; // tier_downgrade / unsubscribe_marketing not gated
    return !ctx.consumed[flag];
  });
}
```

- [ ] **Step 4: Run, verify pass** → `PASS eligibleOffers`.

- [ ] **Step 5: Commit**

```bash
git add src/utils/subscription/cancellation-flow-eligibility.ts src/utils/subscription/__tests__/cancellation-flow-eligibility.test.ts package.json
git commit -m "feat(subscription): pure one-time + past-due offer eligibility filter"
```

### Task 5: `CancellationFlowService` — log lifecycle

**Files:**
- Create: `src/services/subscription/CancellationFlowService.ts`
- Test: `src/services/subscription/__tests__/CancellationFlowService.test.ts` (logic-level: mock the model via a thin repository seam OR test pure helpers; for DB calls assert the doc shape passed)

- [ ] **Step 1: Write the failing test** — test the pure planning method (no DB):

```ts
import assert from "node:assert";
import { planFlow } from "../CancellationFlowService";

function run() {
  const plan = planFlow({ reason: "too_expensive", pastDue: false, consumed: {} });
  assert.deepStrictEqual(plan.offersShown, ["discount_50_2mo", "bonus_entries_100"]);
  const pd = planFlow({ reason: "too_expensive", pastDue: true, consumed: {} });
  assert.deepStrictEqual(pd.offersShown, []);
  assert.strictEqual(pd.pastDue, true);
  console.log("PASS planFlow");
}
run();
```

- [ ] **Step 2: Run, verify fail** — add `"test:cancellation-flow-service": "tsx src/services/subscription/__tests__/CancellationFlowService.test.ts"`; run → FAIL.

- [ ] **Step 3: Implement** the service. `planFlow` is pure (composes Task 3 + Task 4). `startFlow`/`recordOutcome` do the DB writes (use `connectDB` from `src/lib/mongodb.ts`, `CancellationFlowEvent` model). Keep `app/api` free of this logic.

```ts
// src/services/subscription/CancellationFlowService.ts
import connectDB from "@/lib/mongodb";
import CancellationFlowEvent, { CancellationReason, OfferType } from "@/models/CancellationFlowEvent";
import { resolveOfferSequence } from "@/utils/subscription/cancellation-flow-routing";
import { eligibleOffers, ConsumedFlags } from "@/utils/subscription/cancellation-flow-eligibility";

export function planFlow(input: { reason: CancellationReason; pastDue: boolean; consumed: ConsumedFlags }) {
  const offersShown = eligibleOffers(resolveOfferSequence(input.reason), {
    pastDue: input.pastDue,
    consumed: input.consumed,
  });
  return { offersShown, pastDue: input.pastDue };
}

export async function startFlow(args: {
  userId: string;
  reason: CancellationReason;
  reasonText?: string;
  pastDue: boolean;
  offersShown: OfferType[];
}) {
  await connectDB();
  const doc = await CancellationFlowEvent.create({
    userId: args.userId,
    reason: args.reason,
    reasonText: args.reasonText,
    pastDue: args.pastDue,
    offersShown: args.offersShown,
    outcome: "in_progress",
    startedAt: new Date(),
  });
  return doc._id.toString();
}

export async function recordOutcome(args: {
  eventId: string;
  userId: string;
  outcome: "saved" | "cancelled";
  offerAccepted?: OfferType | null;
}) {
  await connectDB();
  const now = new Date();
  await CancellationFlowEvent.updateOne(
    { _id: args.eventId, userId: args.userId },
    {
      $set: {
        outcome: args.outcome,
        offerAccepted: args.offerAccepted ?? null,
        endedAt: now,
        ...(args.outcome === "saved" ? { savedAt: now } : {}),
      },
    }
  );
}
```

- [ ] **Step 4: Run, verify pass** → `PASS planFlow`.

- [ ] **Step 5: Commit**

```bash
git add src/services/subscription/CancellationFlowService.ts src/services/subscription/__tests__/CancellationFlowService.test.ts package.json
git commit -m "feat(subscription): CancellationFlowService plan + log lifecycle"
```

### Task 6: Thin grouped route `POST /api/subscription/cancellation-flow`

**Files:**
- Create: `src/app/api/subscription/cancellation-flow/route.ts`
- Reference patterns: an existing sibling under `src/app/api/subscription/**` for response shape; `src/lib/api-auth.ts` / `getServerSession`; Zod helpers in `src/lib/zod/`.

Actions: `start` (returns `{ eventId, offersShown }`), `outcome` (records saved/cancelled). Offer *application* (pause/discount/etc.) is added in later phases; Phase 1 supports `start` and `outcome` only.

- [ ] **Step 1: Write the route** (no unit test — route handlers are verified by type-check + manual curl; logic is already unit-tested in the service):

```ts
// src/app/api/subscription/cancellation-flow/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { CANCELLATION_REASONS } from "@/models/CancellationFlowEvent";
import { planFlow, startFlow, recordOutcome } from "@/services/subscription/CancellationFlowService";
import { getUserCancellationContext } from "@/services/subscription/CancellationFlowService"; // see note

const StartSchema = z.object({
  action: z.literal("start"),
  reason: z.enum([...CANCELLATION_REASONS] as [string, ...string[]]),
  reasonText: z.string().max(2000).optional(),
});
const OutcomeSchema = z.object({
  action: z.literal("outcome"),
  eventId: z.string(),
  outcome: z.enum(["saved", "cancelled"]),
  offerAccepted: z.string().optional(),
});
const Body = z.discriminatedUnion("action", [StartSchema, OutcomeSchema]);

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const userId = session.user.id;

  if (parsed.data.action === "start") {
    const ctx = await getUserCancellationContext(userId); // { pastDue, consumed }
    const { offersShown, pastDue } = planFlow({ reason: parsed.data.reason, ...ctx });
    const eventId = await startFlow({
      userId,
      reason: parsed.data.reason,
      reasonText: parsed.data.reasonText,
      pastDue,
      offersShown,
    });
    return NextResponse.json({ eventId, offersShown, pastDue });
  }

  await recordOutcome({
    eventId: parsed.data.eventId,
    userId,
    outcome: parsed.data.outcome,
    offerAccepted: (parsed.data.offerAccepted as never) ?? null,
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Add `getUserCancellationContext` to the service** — reads the User doc for `pastDue` (derive from subscription status: past_due/unpaid/failed renewal — reuse the same predicate `SubscriptionManagementModal` uses for `isPastDue`/`hasFailed`; locate it and reuse, do not reinvent) and `consumed` (`{ pause30d, discount50_2mo, bonusEntries100 }` where `bonusEntries100 = user.cancellationUpsellRedeemed`). Show the function in the service file.

- [ ] **Step 3: Type-check + lint** — `npm run type-check` and `npm run lint` clean.

- [ ] **Step 4: Manual verification** — `npm run dev`, then with an authenticated session cookie: `curl -X POST localhost:3000/api/subscription/cancellation-flow -d '{"action":"start","reason":"too_expensive"}' -H 'Content-Type: application/json'`. Expected JSON `{ eventId, offersShown:["discount_50_2mo","bonus_entries_100"], pastDue:false }`. Record the output in the commit message.

- [ ] **Step 5: Manifest/docs** — `src/app/api/subscription/**` already mapped to `subscription`; update `docs/subscription/` API doc. Commit.

```bash
git add src/app/api/subscription/cancellation-flow/route.ts src/services/subscription/CancellationFlowService.ts docs/
git commit -m "feat(subscription): grouped cancellation-flow endpoint (start/outcome)"
```

### Task 7: `CancellationFlowModal` shell — Step 1 (reason) + past-due short-circuit + terminal cancel

**Files:**
- Create: `src/components/modals/CancellationFlowModal/{index.tsx,Step1Reason.tsx,Step4Confirm.tsx,StepIndicator.tsx,useCancellationFlow.ts,types.ts}`
- Create: `src/hooks/queries/useCancellationFlow.ts`
- Reference (copy patterns, do not reinvent): `src/components/modals/PackageSelectionModal/index.tsx:33,495` (`useMediaQuery("(max-width: 639px)")` → `presentation`), `src/components/modals/MembershipModal/index.tsx:581` + `StepIndicator.tsx:85` (step counter + gated forward nav), `src/components/modals/upsell-shell` (visual primitives), `src/components/modals/CancellationUpsellModal/*` (existing infographic styling to preserve).

- [ ] **Step 1: `types.ts`** — shared types so later steps stay consistent:

```ts
// src/components/modals/CancellationFlowModal/types.ts
import type { CancellationReason, OfferType } from "@/models/CancellationFlowEvent";
export interface FlowState {
  step: 1 | 2 | 3 | 4;
  reason: CancellationReason | null;
  reasonText: string;
  eventId: string | null;
  offersShown: OfferType[];
  offerCursor: number; // index into offersShown for Step 2/3
  pastDue: boolean;
}
export interface CancellationFlowModalProps {
  isOpen: boolean;
  onClose: () => void;          // true close (only from "Keep my membership")
  onCancelled: () => void;      // after real cancel — parent runs fetchSubscriptionBenefits + close
  onSaved: () => void;          // after an accepted offer — parent runs fetchSubscriptionBenefits + close
  onResolvePayment: () => void; // §3a past-due: parent opens RenewalFailedModal
}
```

- [ ] **Step 2: `useCancellationFlow.ts`** (state machine hook) — `useState<FlowState>`; `selectReason`, `next`, `decline`, `requestExit` (jumps to step 4), `reset`. Mirror `MembershipModal`'s plain-`useState` pattern; no router state.

- [ ] **Step 3: `src/hooks/queries/useCancellationFlow.ts` (mutation hooks)** — TanStack `useMutation` for `start` and `outcome` POSTs to `/api/subscription/cancellation-flow`. **Do NOT attempt query invalidation here.** Verified: `useStripeSubscription` has no TanStack query keys and `SubscriptionManagementModal` refreshes subscription state via an imperative `fetchSubscriptionBenefits` callback ([SubscriptionManagementModal/index.tsx:250](src/components/modals/SubscriptionManagementModal/index.tsx#L250)), not cache invalidation. Subscription-state refresh after save/cancel is the parent's job: the modal calls the `onSaved` / `onCancelled` props (Step 1 `types.ts`), and Step 8 wires those to the parent's existing `fetchSubscriptionBenefits` + close logic. These mutation hooks only POST and return status; no `queryClient` usage.

- [ ] **Step 4: `Step1Reason.tsx`** — 7 radio options (labels from §1 of the spec; values = `CANCELLATION_REASONS`), `Other` reveals an optional textarea. "Continue" disabled until a reason is selected (the prerequisite gate). On continue → call `start` mutation, store `eventId`/`offersShown`/`pastDue`.

- [ ] **Step 5: `Step4Confirm.tsx`** — "Are you sure? here's what you lose" using `upsell-shell` `InfoGrid`/`UrgencyBanner` (reuse existing CancellationUpsell visual grammar). It has **two variants** driven by `FlowState.pastDue`:
  - **Normal variant** (`pastDue === false`): buttons "Keep my membership" (→ `onClose` true-close) and "Cancel anyway" (→ existing `POST /api/stripe/cancel-subscription {cancelAtPeriodEnd:true}`, then `outcome:cancelled` log via mutation, then `onCancelled()`).
  - **Past-due variant** (`pastDue === true`, §3a): NOT a generic cancel screen. Primary CTA "Resolve payment" → invoke the parent's existing `RenewalFailedModal` handoff (Step 8 passes a `onResolvePayment` prop that calls the parent's `setShowRenewalFailedModal(true)` / equivalent — mirror `SubscriptionManagementModal/index.tsx:966-969`); secondary "Cancel anyway" → same cancel path as normal. Reason was still captured in Step 1; `outcome` is logged `cancelled` only if they pick Cancel anyway, otherwise the flow defers to the renewal-failed modal and the in_progress doc matures to `abandoned` via §6a derivation.

- [ ] **Step 6: `StepIndicator.tsx`** — presentational; mirror `MembershipModal/StepIndicator.tsx`; forward steps disabled until prerequisite met.

- [ ] **Step 7: `index.tsx`** — `ModalContainer` with `presentation={isNarrowViewport ? "sheet" : "dialog"}`, `isNarrowViewport = useMediaQuery("(max-width: 639px)")`. Header ✕ wired to `requestExit` (→ step 4), NOT raw `onClose`. Renders `StepIndicator` + current step. Phase 1: routing for steps 2/3 not built yet — if `offersShown` non-empty, temporarily go straight to Step 4 (so the modal is shippable); past-due (`offersShown:[]`) also → Step 4. Add a `// PHASE-2: render Step2/Step3 here` marker.

- [ ] **Step 8: Wire into `SubscriptionManagementModal`** — replace the `CancellationUpsellModal` import/usage with `CancellationFlowModal`; rename local state `showCancellationUpsell` → `showCancellationFlow`; keep the same trigger point (`handleCancelSubscription`). Remove the lifetime `cancellationUpsellRedeemed` pre-gate that suppressed the old modal (the new flow always captures a reason; +100 gating is now per-offer in eligibility). Wire the four props: `onSaved` and `onCancelled` → call the parent's existing `fetchSubscriptionBenefits()` (index.tsx:250) then the parent's close/cleanup (mirror what the old `onRedeem`/`handleUpsellDecline` did); `onResolvePayment` → the parent's existing renewal-failed opener (mirror `index.tsx:966-969`, e.g. `setShowRenewalFailedModal(true)`); `onClose` → close `showCancellationFlow` only.

- [ ] **Step 9: Manifest/docs** — rename the manifest `CancellationUpsellModal/**` entry to `CancellationFlowModal/**` in **both** CLAUDE.md files; expect the dual-domain (`subscription` + `shared-ui`) doc-sync prompt — document the modal in `docs/subscription/` and note it in `docs/shared-ui/`. Do NOT delete `CancellationUpsellModal/**` yet (Phase 5 cleanup).

- [ ] **Step 10: Verify** — `npm run type-check`, `npm run lint`, `npm run build` (Turbopack; also exercises that the modal tree compiles). Manual: open the subscription modal, click Cancel, pick each reason, confirm the flow reaches Step 4 and a real cancel logs `outcome=cancelled` (check the `cancellationflowevents` collection). Past-due test account → Steps 2/3 skipped.

- [ ] **Step 11: Commit**

```bash
git add src/components/modals/CancellationFlowModal/ src/hooks/queries/useCancellationFlow.ts src/components/modals/SubscriptionManagementModal/index.tsx CLAUDE.md docs/
git commit -m "feat(subscription): multi-step CancellationFlowModal shell (reason capture + past-due short-circuit + terminal cancel)"
```

---

## PHASE 2 — Reason-routed offer step + universal +100 rung + one-time gating UI

Ships: Steps 2 & 3 render the right offer, +100 fallback works, one-time gating visibly skips consumed rungs.

### Task 8: Step 2 (lead offer) + Step 3 (+100) renderers

**Files:**
- Create: `src/components/modals/CancellationFlowModal/Step2Offer.tsx`, `Step3BonusEntries.tsx`
- Modify: `index.tsx` (replace the PHASE-2 marker with real step 2/3 routing), `useCancellationFlow.ts` (advance `offerCursor`)

- [ ] **Step 1:** `Step2Offer.tsx` switches on `offersShown[offerCursor]` and renders the matching offer card (copy per §3; reuse `upsell-shell`). Scope boundary (no stubs, no dead UI): Phase 2 implements the **framework** plus only the two offers whose backends already exist — `bonus_entries_100` (existing `/api/cancellation-upsell/redeem`) and `tier_downgrade` (open existing `DowngradeConfirmModal`). The cards for `pause_30d`, `discount_50_2mo`, `unsubscribe_marketing` are added by Tasks 14 / 16 / 17 respectively (each phase's final "wire into modal" task), not here. `Step2Offer.tsx` renders a typed exhaustive `switch` over `OfferType`; the three not-yet-built cases `throw new Error("offer not yet wired")` and are unreachable because the eligibility filter only includes an offer once its phase has shipped (gate: do not add `pause_30d`/`discount_50_2mo` to `resolveOfferSequence`/eligibility until their phase lands — but they ARE already in routing from Task 3, so Phase 2 must not ship to users until Phase 3/4/5 are done, OR temporarily filter them out in `eligibleOffers` behind a constant `IMPLEMENTED_OFFERS` that each later phase extends). Use the `IMPLEMENTED_OFFERS` constant approach — it is the only no-dead-UI option and each later task flips one entry. For `bonus_entries_100` as a *lead* (giveaway/havent_won) render the same content as `Step3BonusEntries`. Decline → `decline()` advances cursor.
- [ ] **Step 2:** `decline()` semantics: advance `offerCursor`; if next is past end → Step 4 confirm; record nothing yet (outcome logged only at terminal).
- [ ] **Step 3:** `Step3BonusEntries.tsx` — the universal "+100 bonus entries, stay active today" rung. Accept → `/api/cancellation-upsell/redeem`, then `outcome:saved, offerAccepted:bonus_entries_100`, `onSaved()`. Decline → Step 4.
- [ ] **Step 4:** ✕ still routes to Step 4 from any step.
- [ ] **Step 5:** Verify each reason path manually (table in §3). Type-check, lint, build.
- [ ] **Step 6:** Docs (`docs/subscription/`), commit:

```bash
git commit -am "feat(subscription): reason-routed offer step + universal +100 rung"
```

### Task 9: Server-side offer-accept logging + tier-downgrade/unsubscribe outcome wiring

**Files:** Modify `route.ts` + `CancellationFlowService.ts` to accept `action:"accept_offer"` for offers that DON'T have their own endpoint side-channel, and to log `outcome:saved` when the client reports an existing-endpoint action (tier downgrade, +100 redeem) completed. Per spec §5 the client makes the log call separately from invoking the existing action endpoint.

- [ ] **Step 1:** Extend the Zod union with an `accept_offer` action `{ action:"accept_offer", eventId, offer: OfferType }` that (Phase 2 scope) handles `bonus_entries_100` bookkeeping only by delegating to existing redeem; later phases extend it.
- [ ] **Step 2:** Ensure declining everything and cancelling logs exactly one terminal `outcome` per event (idempotent `updateOne` guarded by `outcome:"in_progress"` filter).
- [ ] **Step 3:** type-check/lint; manual: full decline path logs `cancelled`; accepting +100 logs `saved/bonus_entries_100`. Commit.

---

## PHASE 3 — Pause 30d offer (HIGHEST RISK — follow spec §5 protocol verbatim)

> Do NOT start Phase 3 until `npm run test:stripe-collection-pause` is green on the current branch. If not green, STOP and surface it (spec §5).

### Task 10: Lock current pause-clear behavior with NEW tests (before any change)

**Files:**
- Modify: `src/services/subscription/pauseCollectionPolicy.ts` (extend signature only after tests pin current behavior)
- Test: extend `src/services/subscription/__tests__/SubscriptionCollectionPauseService.test.ts`

- [ ] **Step 1: Baseline** — run `npm run test:stripe-collection-pause`, record green output verbatim in the task notes. If red → STOP.
- [ ] **Step 2: Read the real call site** — `src/services/stripe-webhook-handlers/index.ts:3430-3436`. The decision is:
  `shouldClearPauseCollectionAfterPaidInvoice({...}) || recordMembershipRecurringAffiliate || subscription.pause_collection != null`.
- [ ] **Step 3: Write characterization tests FIRST** (pin current behavior, no code change yet) in the existing test file:

```ts
// recovery pause + subscription_cycle paid invoice ⇒ clears (current behavior)
assert.strictEqual(
  decideClearPause({ billingReason: "subscription_cycle", previousSubscriptionDbStatus: "past_due",
    pauseCollectionPresent: true, pauseReason: undefined }),
  true
);
// any non-null pause + unrelated paid invoice ⇒ clears (locks the moved `!= null` clause)
assert.strictEqual(
  decideClearPause({ billingReason: "manual", previousSubscriptionDbStatus: "active",
    pauseCollectionPresent: true, pauseReason: undefined }),
  true
);
```

(`decideClearPause` is the about-to-be-extended pure function — Step 5 defines it.)

- [ ] **Step 4: Run, verify the new tests FAIL** (function not yet extended). Expected: FAIL `decideClearPause is not a function`.
- [ ] **Step 5: Extend the pure policy** — add `decideClearPause` that absorbs the whole decision (including the `!= null` clause) so it is one testable unit. Keep the old `shouldClearPauseCollectionAfterPaidInvoice` export delegating to it for backward compat:

```ts
// src/services/subscription/pauseCollectionPolicy.ts  (additive)
// NOTE: `billingReason`/`previousSubscriptionDbStatus` types MUST match the
// existing `shouldClearPauseCollectionAfterPaidInvoice` signature exactly
// (pauseCollectionPolicy.ts:9 — `string | undefined`, NOT `| null`). Coerce
// any nullable Stripe value with `?? undefined` at the call site (Task 11).
export interface ClearPauseInput {
  billingReason: string | undefined;
  previousSubscriptionDbStatus: string | undefined;
  pauseCollectionPresent: boolean;
  pauseReason: string | undefined; // subscription.metadata.pauseReason
  recordMembershipRecurringAffiliate?: boolean;
}
export function decideClearPause(i: ClearPauseInput): boolean {
  if (i.pauseReason === "retention") return false; // retention pause is never cleared by recovery
  if (shouldClearPauseCollectionAfterPaidInvoice({
        billingReason: i.billingReason, previousSubscriptionDbStatus: i.previousSubscriptionDbStatus,
      })) return true;
  if (i.recordMembershipRecurringAffiliate) return true;
  return i.pauseCollectionPresent; // the moved `!= null` clause
}
```

- [ ] **Step 6: Run, verify characterization tests PASS** (current behavior preserved for non-retention).
- [ ] **Step 7: Add retention test** — `pauseReason:"retention"` + any paid invoice ⇒ `decideClearPause` returns `false`. Run → PASS.
- [ ] **Step 8: Commit**

```bash
git commit -am "feat(subscription): extract decideClearPause (retention-aware) with characterization tests"
```

### Task 11: Wire `decideClearPause` into the webhook (single-line behavioral change)

**Files:** Modify `src/services/stripe-webhook-handlers/index.ts:3430-3436`

- [ ] **Step 1:** Replace the inline `||` expression (assigned to `shouldClearPauseForCollection`) with:
  ```ts
  const shouldClearPauseForCollection = decideClearPause({
    billingReason: expandedInvoice.billing_reason ?? undefined,
    previousSubscriptionDbStatus: previousSubscriptionDbStatus ?? undefined,
    pauseCollectionPresent: subscription.pause_collection != null,
    pauseReason: (subscription.metadata?.pauseReason as string | undefined) ?? undefined,
    recordMembershipRecurringAffiliate,
  });
  ```
  No other line changes. `subscription`, `expandedInvoice`, `previousSubscriptionDbStatus`, `recordMembershipRecurringAffiliate` are all already in scope at index.ts:3430-3436 (verified) — no extra Stripe retrieve.
- [ ] **Step 2:** `npm run test:stripe-collection-pause` → all green (old + new). type-check, lint.
- [ ] **Step 3:** Written reasoning trace in the commit message: walk (i) a recovery pause and (ii) a retention pause through this decision showing they don't cross.
- [ ] **Step 4: Commit**

```bash
git commit -am "fix(subscription): webhook pause-clear ignores retention pauses (decideClearPause)"
```

### Task 12: `RetentionPauseService` — apply pause + entries handling

**Files:**
- Create: `src/services/subscription/RetentionPauseService.ts`
- Test: `src/services/subscription/__tests__/RetentionPauseService.test.ts` (pure parts: resumes_at math, idempotency guard)

- [ ] **Step 1: Failing test** — `computeResumeAt(now)` returns `now + 30d`; `alreadyConsumed` guard returns true when `user.retentionOffersConsumed.pause30d`.
- [ ] **Step 2: Run → FAIL** (add `test:retention-pause` script).
- [ ] **Step 3: Implement** `applyRetentionPause(userId)`:
  - guard: not past-due, not already consumed (else throw a typed error the route maps to 409);
  - `stripe.subscriptions.update(subId, { pause_collection: { behavior: "void", resumes_at: <unix now+30d> }, metadata: { pauseReason: "retention", pauseResumesAt: "<iso>" } })`;
  - set `user.retentionOffersConsumed.pause30d = true`; save.
  - "Keep banked entries, no new entries while paused" needs no extra write — entries accrue only on paid renewals; pausing skips the charge so none accrue. Document this explicitly in the service header.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(subscription): RetentionPauseService.applyRetentionPause`.

### Task 13: Auto-resume cron (no lock; idempotent)

**Files:**
- Create: `src/app/api/cron/cancellation-retention-resume/route.ts`
- Modify: `vercel.json` (add daily schedule); manifest → `infrastructure` domain
- Reference: `src/app/api/cron/membership-daily-snapshot/route.ts` (Bearer `CRON_SECRET`, `connectDB`, idempotent)

- [ ] **Step 1:** Implement GET handler: auth via `CRON_SECRET` bearer (copy the `isAuthorized` helper pattern). Query Stripe/DB for retention pauses whose `resumes_at` passed (or query users with `retentionOffersConsumed.pause30d` + a stored `pauseResumesAt <= now` still paused) → call `resumeAfterSuccessfulRenewalPayment(subId)` (the existing blind clear is correct here — this IS the intended resume). Idempotent: skip if not currently paused.
- [ ] **Step 2:** Add `vercel.json` cron entry (daily). Update `docs/infrastructure/` for the new cron route (doc-sync owns this path under `infrastructure`).
- [ ] **Step 3:** type-check/lint/build. Manual: hit the route with the secret, assert idempotent re-run is a no-op.
- [ ] **Step 4: Commit** `feat(infrastructure): daily cron to auto-resume 30d retention pauses`.

### Task 14: Wire pause offer into the modal + route

**Files:** Modify `Step2Offer.tsx`, `route.ts` (`accept_offer` → `pause_30d`), `CancellationFlowService.ts`

- [ ] **Step 1:** `accept_offer` with `offer:"pause_30d"` → `applyRetentionPause(userId)` then `recordOutcome(saved, pause_30d)`. Map the typed "already consumed / past-due" errors to 409/422.
- [ ] **Step 2:** Modal pause card copy per §3 ("Pause 30 days, keep your entries"). Accept → mutation; on 409 (consumed) the eligibility filter should have hidden it — assert that path can't normally happen, but handle gracefully (skip to next rung).
- [ ] **Step 3: Flip the offer live + update its test.** Add `"pause_30d"` to `IMPLEMENTED_OFFERS` in `cancellation-flow-eligibility.ts`, and add this concrete assertion to `cancellation-flow-eligibility.test.ts` (it was previously filtered out): `assert.deepStrictEqual(eligibleOffers(["pause_30d","bonus_entries_100"], { pastDue:false, consumed:{} }), ["pause_30d","bonus_entries_100"])` and `assert.deepStrictEqual(eligibleOffers(["pause_30d","bonus_entries_100"], { pastDue:false, consumed:{ pause30d:true } }), ["bonus_entries_100"])`. Run `npm run test:cancellation-eligibility` → PASS.
- [ ] **Step 4:** Manual end-to-end: `dont_use_benefits` → pause card → accept → Stripe sub shows `pause_collection` + `metadata.pauseReason=retention`; webhook on a later paid invoice does NOT clear it; cron after `resumes_at` clears it. type-check/lint.
- [ ] **Step 5: Commit** `feat(subscription): pause-30d offer wired end-to-end`.

---

## PHASE 4 — 50% off × 2 months

### Task 15: `RetentionDiscountService` — 2-month 50% coupon

**Files:**
- Create: `src/services/subscription/RetentionDiscountService.ts`
- Test: `src/services/subscription/__tests__/RetentionDiscountService.test.ts` (pure: coupon spec builder, consumed guard)

- [ ] **Step 1: Failing test** — `buildCouponParams()` returns `{ percent_off:50, duration:"repeating", duration_in_months:2 }`; consumed guard.
- [ ] **Step 2: Run → FAIL** (`test:retention-discount`).
- [ ] **Step 3: Implement** `applyRetentionDiscount(userId)`:
  - guard not past-due, not `retentionOffersConsumed.discount50_2mo`;
  - create-or-reuse a stable Stripe coupon (`id: "retention-50off-2mo"`, idempotent: retrieve then create if missing) with `percent_off:50, duration:"repeating", duration_in_months:2`;
  - `stripe.subscriptions.update(subId, { discounts: [{ coupon: "retention-50off-2mo" }] })` (use `discounts`, not deprecated `coupon`);
  - set `retentionOffersConsumed.discount50_2mo = true`; save.
- [ ] **Step 4: Run → PASS.** Commit `feat(subscription): RetentionDiscountService 50%-off-2mo`.

### Task 16: Wire discount offer into modal + route

- [ ] **Step 1:** `accept_offer` `discount_50_2mo` → `applyRetentionDiscount` + `recordOutcome(saved, discount_50_2mo)`.
- [ ] **Step 2:** Modal discount card copy per §3. `too_expensive` lead + `other` waterfall position.
- [ ] **Step 3: Flip the offer live + update its test.** Add `"discount_50_2mo"` to `IMPLEMENTED_OFFERS`; add to `cancellation-flow-eligibility.test.ts`: `assert.deepStrictEqual(eligibleOffers(["discount_50_2mo","bonus_entries_100"], { pastDue:false, consumed:{} }), ["discount_50_2mo","bonus_entries_100"])` and the consumed-drops-to-+100 case. **Also update the Phase-2 assertion** that previously expected `["bonus_entries_100"]` for that input — it now expects both. Run `npm run test:cancellation-eligibility` → PASS.
- [ ] **Step 4:** Manual: `too_expensive` → accept → Stripe sub has the coupon, next 2 invoices 50% off, then full price; `retentionOffersConsumed.discount50_2mo` true; re-entry hides the rung. type-check/lint. Commit.

---

## PHASE 5 — "Too many messages" unsubscribe branch + admin analytics view + cleanup

### Task 17: User-session marketing-unsubscribe path

**Files:** Modify `route.ts`/`CancellationFlowService.ts` to add `accept_offer` `unsubscribe_marketing`.
Reference (verified): `syncKlaviyoEmailMarketingFromAdminPreference(user, false)` at `src/utils/integrations/klaviyo/klaviyo-profile-sync.ts:81` — callable from user session; **also unsubscribes SMS marketing**; service does NOT write the DB flag.

- [ ] **Step 1:** Implement service method in `CancellationFlowService.ts` (NOT mirroring the admin route's transaction/diff plumbing — lines 151-161 there are opt-in *change-detection inside a Mongo transaction*, irrelevant here). Concretely: load the user Mongoose doc by `session.user.id`; set `user.acceptsPromotionalEmail = false`; `await user.save()`; then `await syncKlaviyoEmailMarketingFromAdminPreference(user, false)` (import from `@/utils/integrations/klaviyo/klaviyo-profile-sync`, signature `(user: IUser, wantsPromotionalEmail: boolean)` verified at klaviyo-profile-sync.ts:81 — it ALSO unsubscribes SMS marketing and does NOT write the DB flag, which is why we persist it ourselves). The Klaviyo call never throws; if it returns a warning/`success:false`, the retention action still counts as success — log the warning via `console.error` for monitoring (prod strips `console.log`).
- [ ] **Step 2:** Modal copy must say "marketing messages" (email + SMS), not "emails" (spec §5 caveat). Accept → mutation + `recordOutcome(saved, unsubscribe_marketing)`.
- [ ] **Step 3: Flip the offer live + update its test.** Add `"unsubscribe_marketing"` to `IMPLEMENTED_OFFERS`; add to `cancellation-flow-eligibility.test.ts`: `assert.deepStrictEqual(eligibleOffers(["unsubscribe_marketing","bonus_entries_100"], { pastDue:false, consumed:{} }), ["unsubscribe_marketing","bonus_entries_100"])` (not one-time gated, so consumed flags don't apply). Run `npm run test:cancellation-eligibility` → PASS.
- [ ] **Step 4:** Manual: `too_many_messages` → accept → `acceptsPromotionalEmail=false`, Klaviyo profile shows `consent:UNSUBSCRIBED`; transactional/SendGrid untouched. type-check/lint. Commit.

### Task 18: Admin analytics view

**Files:**
- Create: aggregation service `src/services/admin/cancellationFlowAnalytics.ts` + admin API route under `src/app/api/admin/**` + admin UI under `src/components/admin/**` (reuse existing admin table/query patterns).
- Test: `src/services/admin/__tests__/cancellationFlowAnalytics.test.ts` (pure aggregation shaping on sample docs).

- [ ] **Step 1: Failing test** — given sample events, `summarize()` returns `{ triggered, byReason[], funnel[], saveRate, retention90:{retained,churned,pending} }`; `abandoned` derived = `in_progress` older than 1h; past-due excluded from offer-conversion denominators.
- [ ] **Step 2: Run → FAIL** (`test:cancellation-analytics`).
- [ ] **Step 3: Implement** aggregation (Mongo pipeline + pure shaping function the test targets). Admin route: admin-auth guard per `/api/admin/**` convention. UI: read-only table/funnel reusing existing admin components.
- [ ] **Step 4: Run → PASS.** Manual: admin page renders counts; type-check/lint/build.
- [ ] **Step 5: Manifest/docs** — admin paths → `admin` domain; update `docs/admin/`. Commit.

### Task 19: Cleanup legacy modal

- [ ] **Step 1:** Confirm no remaining imports of `CancellationUpsellModal`. Delete `src/components/modals/CancellationUpsellModal/**`. Keep `/api/cancellation-upsell/redeem` (still used by the +100 rung) OR migrate its logic into the service and delete the route — choose the lower-risk option (keep the route; it is already battle-tested). Update manifest to drop the deleted modal path; ensure `docs/subscription/` reflects removal.
- [ ] **Step 2:** type-check/lint/build green. Commit `chore(subscription): remove superseded CancellationUpsellModal`.

---

## PHASE 6 — 90-day post-save retention maturity

### Task 20: Maturity cron

**Files:**
- Create: `src/app/api/cron/cancellation-retention-maturity/route.ts`
- Modify: `vercel.json`; manifest → `infrastructure`
- Test: `src/app/api/cron/__tests__/cancellation-retention-maturity.test.ts` (pure: the predicate "is this user still an active recurring subscriber" against a sample user; date-window query builder)

- [ ] **Step 1: Failing test** — `isRetained(user)` true iff active recurring subscription; `maturedFilter(now)` = `{ outcome:"saved", savedAt:{$lte:now-90d}, retention90:null }`.
- [ ] **Step 2: Run → FAIL** (`test:retention-maturity`).
- [ ] **Step 3: Implement** GET cron (Bearer `CRON_SECRET`, `connectDB`, idempotent — copy `membership-daily-snapshot` pattern). For each matured doc: read current subscription state, set `retention90` `retained|churned`. Read-only against subscription (never mutates Stripe). Bounded by the date-window filter.
- [ ] **Step 4: Run → PASS.** `vercel.json` daily entry. `docs/infrastructure/` updated.
- [ ] **Step 5:** Manual: seed a `saved` doc with `savedAt = now-91d`, run cron, assert `retention90` set; re-run → no-op. type-check/lint/build.
- [ ] **Step 6: Commit** `feat(infrastructure): 90-day post-save retention maturity cron`.

### Task 21: Surface retention90 in admin view

- [ ] **Step 1:** Extend Task 18 aggregation + UI to show retained/churned/pending split per offer and overall. Update its test with retention sample data. Run → PASS.
- [ ] **Step 2:** type-check/lint/build. Update `docs/admin/`. Commit `feat(admin): show 90-day post-save retention split`.

---

## Final self-review checklist (run before handoff to execution)

- [ ] Every spec section maps to a task: §1 reasons→Task 1/7; §3 routing→Task 3/8; §3a past-due→Task 4/6/7 (Step-4 past-due variant + `onResolvePayment`); §4 responsive shell→Task 7; §5 offers→Tasks 9–17; §5 pause protocol→Tasks 10–14; §6 model/analytics→Task 1/18; §6a 90-day→Task 20/21; §7 manifest/migration→called out per task.
- [ ] **Acknowledged deliberate divergence from spec §5:** the route uses a simplified action set (`start`, `outcome`, `accept_offer`) instead of spec §5's illustrative `accept_pause/accept_discount/accept_unsubscribe` — one generic `accept_offer { offer: OfferType }` is DRYer and keeps the funnel log authoritative in one handler. Behavior is equivalent; this is intentional, not a gap.
- [ ] No placeholders — all code steps show code, all run steps show expected output.
- [ ] Type consistency — `OfferType`/`CancellationReason` from the model are the single source; `FlowState`, `eligibleOffers`, `resolveOfferSequence`, `decideClearPause`, `planFlow` signatures match across tasks.
- [ ] Doc-sync: `subscription`, `admin`, `infrastructure`, `shared-ui` doc folders touched where their paths change; manifest edited in BOTH CLAUDE.md copies.
- [ ] Commits frequent, no push.
