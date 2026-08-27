# Klaviyo Profile Accuracy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Klaviyo customer profile both *delivered* (syncs actually land) and *true* (numbers come from the payment ledger, not a catalogue recalculation).

**Architecture:** Two independent fixes. **Delivery** — one cron sweeps users whose `updatedAt` moved since a stored watermark and re-syncs them, so no mutation site needs instrumenting. **Truth** — the four package-entry and two spend properties are re-sourced from `PaymentEvent` (a flat, indexed, refund-nettable grant ledger) instead of `catalogue.entriesPerMonth × elapsed months`.

**Tech Stack:** Next.js 15 App Router, MongoDB/Mongoose 8.18, TypeScript, Vercel Cron, Klaviyo REST API. Tests are standalone `tsx` scripts (no jest/vitest).

**Spec:** [docs/superpowers/specs/2026-08-26-klaviyo-profile-accuracy-design.md](../specs/2026-08-26-klaviyo-profile-accuracy-design.md)

## Global Constraints

- **No commits without explicit user authorization** (CLAUDE.md rule 1). Every task below ends with a commit step — **do not run it** unless the user has said `commit` / `push` / `ship it` this session. Otherwise stop and ask.
- **Never work on `main`.** This plan targets branch `feature/klaviyo-profile-accuracy` in worktree `.worktrees/klaviyo-profile-accuracy`.
- **No business logic in `src/app/api/**` route handlers.** Routes parse, authorize, delegate.
- **No DB access from components. No `any`.**
- **Production strips `console.log`/`info`/`debug`/`warn`** (`next.config.ts` `compiler.removeConsole`). Only `console.error` survives. Ops scripts run under `tsx`, not the Next build, so `console.log` is fine *there*.
- **Layering:** `utils/` must not import from `services/`. Shared logic goes in `utils/`.
- **Every `src/**` or `scripts/**` change needs its matching `docs/<domain>/` update** in the same task (Domain Manifest in CLAUDE.md). Task 10 collects these; the doc-sync Stop hook will block otherwise.
- **CUSTOMER.md must be touched** — `src/models/User.ts` gains a field and third-party data handling changes (CLAUDE.md rule 5b, hook-enforced).
- **Ops scripts require** `--dry-run` default-safe, a CSV audit trail, progress logging with `processed/total (%) · rate/sec · ETA` on ~20 lines, and 3-tier exit codes.
- **Every new test file needs a matching `test:*` entry in `package.json`** or it is undiscoverable.
- **Klaviyo naming rule:** a profile property must never share a name with an event property, or segmentation on that event property silently breaks. Verified clean as of 2026-08-26 — re-check before adding any new property name.
- **Rule 11 (legal):** entries are never sold. `entries_purchased` is an internal segment key only and must never appear in customer-facing copy or a merge tag.

---

## File Structure

| path | responsibility | task |
|---|---|---|
| `src/lib/klaviyo.ts` | **modify** — refuse profile writes in development mode unless explicitly opted in | 1 |
| `.env.example` | **modify** — register `KLAVIYO_ALLOW_DEV_PROFILE_WRITES` | 1 |
| `src/utils/payment/payment-event-net-queries.ts` | **modify** — add per-user grant/spend aggregation (existing owner of refund-netted `PaymentEvent` reads) | 2 |
| `src/utils/payment/__tests__/payment-event-grant-ledger.test.ts` | **create** — ledger folding + refund netting | 2 |
| `src/utils/subscription/pending-upgrade.ts` | **create** — one shared "is this a real pending upgrade?" predicate | 4 |
| `src/utils/subscription/__tests__/pending-upgrade.test.ts` | **create** | 4 |
| `src/utils/integrations/klaviyo/klaviyo-helpers.ts` | **modify** — read the ledger; fix pending-upgrade; retire `upsell_*` | 3, 4 |
| `src/utils/integrations/klaviyo/__tests__/klaviyo-profile-projection.test.ts` | **create** — pins granted-not-catalogue and pending-upgrade-false-for-`{}` | 3, 4 |
| `src/types/klaviyo.ts` | **modify** — allow `null` on retired `upsell_*` | 4 |
| `src/models/User.ts` | **modify** — `klaviyoSyncedAt` field + index on `updatedAt` | 5 |
| `src/models/KlaviyoSyncState.ts` | **create** — single-document sweep watermark | 5 |
| `src/services/klaviyo/KlaviyoProfileReconciliationService.ts` | **create** — the sweep: watermark, batching, ledger prefetch, reporting | 6, 8 |
| `src/services/klaviyo/__tests__/klaviyo-reconciliation.test.ts` | **create** | 6, 8 |
| `src/app/api/cron/reconcile-klaviyo-profiles/route.ts` | **create**, thin — auth, delegate, log | 7 |
| `vercel.json` | **modify** — register the 5-minute and weekly schedules | 7 |
| `scripts/backfill-klaviyo-profile-accuracy.ts` | **create** — one-shot full backfill | 9 |
| `scripts/verify-klaviyo-profile-accuracy.ts` | **create** — post-backfill verification | 9 |
| `package.json` | **modify** — test + script entries, incl. 3 pre-existing missing ones | 2, 4, 6, 9 |
| `docs/tracking/`, `docs/payment/`, `docs/subscription/`, `docs/infrastructure/`, `CUSTOMER.md` | **modify** | 10 |

---

## Task 1: Dev/prod Klaviyo write guard

Ships first because it is ~10 lines and stops the problem getting worse while the rest of
this work runs — **not** because it is an emergency.

**Scope it accurately.** A local dev run reads the **dev** database (933 users), not
production. Klaviyo keys on email, and only **8** dev-DB emails also exist in production —
all test or staff accounts, **zero paying customers** (measured 2026-08-26). So a local run
**cannot corrupt a real customer's profile**. What it does do is push test profiles and
`[DEV]` metrics into the production marketing account, where they can land in broad segments.
The guard's other job is to put a deliberate gate on the `--prod` ops path, which *does*
write real customers.

**Files:**
- Modify: `src/lib/klaviyo.ts` (the `upsertProfile` entry point and `getKlaviyoConfig`)
- Modify: `.env.example`

**Interfaces:**
- Consumes: nothing.
- Produces: env var `KLAVIYO_ALLOW_DEV_PROFILE_WRITES` (string `"true"` opts in). No exported symbols change.

- [ ] **Step 1: Read the current guard surface**

Run: `sed -n '25,50p;660,700p' src/lib/klaviyo.ts` and locate `getKlaviyoConfig()` and the `upsertProfile` method. Confirm `mode` is derived as `(explicitMode || (nodeEnv === "production" ? "production" : "development"))`.

- [ ] **Step 2: Add the guard predicate to `getKlaviyoConfig`**

In `src/lib/klaviyo.ts`, inside `getKlaviyoConfig()`, after the `enabled` line, add:

```ts
  // Dev and production share ONE Klaviyo account (verified 2026-08-26: 24 [DEV]-prefixed
  // metrics exist in the production account, newest 5 days old). `mode` only prefixes EVENT
  // names — profile writes were unprefixed and landed on real customers. Profile mutation is
  // therefore refused outside production unless explicitly opted in.
  //
  // The opt-in exists because the sanctioned backfill IS an intentional write from a
  // developer machine against production (scripts/backfill-klaviyo-profile-accuracy.ts).
  // It must be set deliberately for that run — never defaulted on by a script.
  const allowDevProfileWrites = process.env.KLAVIYO_ALLOW_DEV_PROFILE_WRITES === "true";
```

Add `allowDevProfileWrites` to the returned object.

- [ ] **Step 3: Store it on the client and refuse profile writes**

In the `KlaviyoClient` class, add a private field and set it in the constructor:

```ts
  private allowDevProfileWrites: boolean;
```
```ts
    this.allowDevProfileWrites = config.allowDevProfileWrites;
```

Then add this method to the class:

```ts
  /**
   * True when this process may mutate Klaviyo PROFILES. Events are unaffected — they
   * carry a [DEV] prefix in development and are separable in the account.
   */
  private canWriteProfiles(): boolean {
    if (this.mode === "production") return true;
    if (this.allowDevProfileWrites) return true;
    console.error(
      "[klaviyo] BLOCKED profile write — KLAVIYO_MODE is not 'production' and " +
        "KLAVIYO_ALLOW_DEV_PROFILE_WRITES is not 'true'. Dev and prod share one Klaviyo " +
        "account; this guard stops a local run mutating real customer profiles."
    );
    return false;
  }
```

- [ ] **Step 4: Apply the guard at every profile-mutating entry point**

Run: `grep -n "async upsertProfile\|async updateProfile\|async createProfile\|async bulkImportProfiles" src/lib/klaviyo.ts`

At the top of each matched method body (after any existing `isConfigured()` check), add:

```ts
    if (!this.canWriteProfiles()) {
      return { success: false, error: "Profile writes blocked outside production" };
    }
```

Match each method's declared return type — if a method returns `{ success: boolean; profile_id?: string; error?: string }`, the above already fits. For `bulkImportProfiles`, return its own shape with `success: false` and the same `error` string.

- [ ] **Step 5: Register the env var**

In `.env.example`, next to the other `KLAVIYO_*` entries (around line 75), add:

```
# Allow Klaviyo PROFILE writes when KLAVIYO_MODE is not "production".
# Dev and prod share ONE Klaviyo account, so this is OFF by default and a local
# run cannot mutate real customer profiles. Set to "true" ONLY for a deliberate
# ops backfill run against production. Events are unaffected (they carry [DEV]).
KLAVIYO_ALLOW_DEV_PROFILE_WRITES=false
```

- [ ] **Step 6: Verify the guard blocks, then allows**

Run: `npx tsx -e "process.env.KLAVIYO_MODE='development'; process.env.KLAVIYO_PRIVATE_API_KEY='pk_test'; import('./src/lib/klaviyo').then(async (m) => { const r = await m.klaviyo.upsertProfile({ email: 'guard-test@example.com', properties: {} } as never); console.log('blocked:', JSON.stringify(r)); })"`

Expected: `blocked: {"success":false,"error":"Profile writes blocked outside production"}` and the `[klaviyo] BLOCKED profile write` line.

Then run the same command with `process.env.KLAVIYO_ALLOW_DEV_PROFILE_WRITES='true'` prepended and confirm it no longer short-circuits (it will fail on the fake API key instead — that is the correct different failure).

- [ ] **Step 7: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 8: Commit** *(only if commits are authorized — see Global Constraints)*

```bash
git add src/lib/klaviyo.ts .env.example
git commit -m "fix(klaviyo): refuse profile writes outside production unless explicitly opted in"
```

---

## Task 2: Per-user grant ledger from PaymentEvent

**Files:**
- Modify: `src/utils/payment/payment-event-net-queries.ts`
- Create: `src/utils/payment/__tests__/payment-event-grant-ledger.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing `excludeRefundedBenefitsGrantedStages()` from the same file.
- Produces:
  ```ts
  export interface UserGrantLedger {
    memberEntries: number;
    oneTimeEntries: number;
    upsellEntries: number;
    miniDrawEntries: number;
    netSpend: number;
  }
  export function emptyGrantLedger(): UserGrantLedger;
  export function foldGrantRows(rows: GrantRow[]): Map<string, UserGrantLedger>;
  export async function aggregateNetGrantsByUser(
    userIds: mongoose.Types.ObjectId[]
  ): Promise<Map<string, UserGrantLedger>>;
  ```
  Map keys are `userId.toString()`. Tasks 3, 6 and 9 consume these.

- [ ] **Step 1: Write the failing test**

Create `src/utils/payment/__tests__/payment-event-grant-ledger.test.ts`:

```ts
import assert from "node:assert/strict";
import { foldGrantRows, emptyGrantLedger, type GrantRow } from "../payment-event-net-queries";

function testEmptyLedger() {
  const l = emptyGrantLedger();
  assert.deepEqual(l, {
    memberEntries: 0,
    oneTimeEntries: 0,
    upsellEntries: 0,
    miniDrawEntries: 0,
    netSpend: 0,
  });
}

function testFoldsEachPackageTypeToItsOwnBucket() {
  const rows: GrantRow[] = [
    { userId: "u1", packageType: "membership", entries: 150, price: 20 },
    { userId: "u1", packageType: "one-time", entries: 30, price: 25 },
    { userId: "u1", packageType: "upsell", entries: 60, price: 12 },
    { userId: "u1", packageType: "mini-draw", entries: 5, price: 9 },
  ];
  const out = foldGrantRows(rows);
  assert.deepEqual(out.get("u1"), {
    memberEntries: 150,
    oneTimeEntries: 30,
    upsellEntries: 60,
    miniDrawEntries: 5,
    netSpend: 66,
  });
}

// The whole point of the fix: two membership grants at a promo multiplier sum to what was
// GRANTED (150 + 1000), never to catalogue entriesPerMonth x months (15 + 100).
function testSumsRepeatedMembershipGrants() {
  const rows: GrantRow[] = [
    { userId: "u2", packageType: "membership", entries: 150, price: 20 },
    { userId: "u2", packageType: "membership", entries: 1000, price: 80 },
  ];
  assert.equal(foldGrantRows(rows).get("u2")!.memberEntries, 1150);
  assert.equal(foldGrantRows(rows).get("u2")!.netSpend, 100);
}

function testSeparatesUsers() {
  const rows: GrantRow[] = [
    { userId: "a", packageType: "membership", entries: 10, price: 1 },
    { userId: "b", packageType: "membership", entries: 20, price: 2 },
  ];
  const out = foldGrantRows(rows);
  assert.equal(out.get("a")!.memberEntries, 10);
  assert.equal(out.get("b")!.memberEntries, 20);
  assert.equal(out.size, 2);
}

function testMissingNumbersCountAsZero() {
  const rows: GrantRow[] = [
    { userId: "u3", packageType: "membership", entries: null, price: undefined },
  ];
  assert.equal(foldGrantRows(rows).get("u3")!.memberEntries, 0);
  assert.equal(foldGrantRows(rows).get("u3")!.netSpend, 0);
}

function testUnknownPackageTypeIsIgnoredNotCrashed() {
  const rows = [{ userId: "u4", packageType: "shop", entries: 7, price: 3 }] as unknown as GrantRow[];
  const out = foldGrantRows(rows);
  assert.deepEqual(out.get("u4"), emptyGrantLedger());
}

function run() {
  testEmptyLedger();
  testFoldsEachPackageTypeToItsOwnBucket();
  testSumsRepeatedMembershipGrants();
  testSeparatesUsers();
  testMissingNumbersCountAsZero();
  testUnknownPackageTypeIsIgnoredNotCrashed();
  console.log("payment-event-grant-ledger tests passed");
}

run();
```

- [ ] **Step 2: Add the npm entry and run the test to verify it fails**

In `package.json` `scripts`, add:

```json
    "test:payment-grant-ledger": "tsx src/utils/payment/__tests__/payment-event-grant-ledger.test.ts",
```

Run: `npm run test:payment-grant-ledger`
Expected: FAIL — `foldGrantRows` / `emptyGrantLedger` / `GrantRow` are not exported.

- [ ] **Step 3: Implement**

Append to `src/utils/payment/payment-event-net-queries.ts`:

```ts
/** The four paid grant sources. Mirrors `PaymentEvent.packageType`. */
const PACKAGE_TYPE_TO_BUCKET = {
  membership: "memberEntries",
  "one-time": "oneTimeEntries",
  upsell: "upsellEntries",
  "mini-draw": "miniDrawEntries",
} as const;

export type GrantPackageType = keyof typeof PACKAGE_TYPE_TO_BUCKET;

export interface GrantRow {
  userId: string;
  packageType: GrantPackageType;
  entries: number | null | undefined;
  price: number | null | undefined;
}

/**
 * A user's lifetime PAID grants, refund-netted.
 *
 * Read from `PaymentEvent` — the per-grant ledger of what was ACTUALLY granted — never
 * reconstructed from the package catalogue. The catalogue reconstruction it replaces
 * (`entriesPerMonth x elapsed months`) was verified wrong for 4,904 of 4,904 active
 * members on 2026-08-26, because promo multipliers, upgrades that reset `startDate`, and
 * resubscribes are all invisible to it.
 *
 * EXCLUDES free grants (referral, promo-link, cancellation-upsell, streak, bonus-entry-
 * promo) by construction — those never produce a BenefitsGranted PaymentEvent. The
 * all-sources lifetime total is `user.accumulatedEntries`.
 */
export interface UserGrantLedger {
  memberEntries: number;
  oneTimeEntries: number;
  upsellEntries: number;
  miniDrawEntries: number;
  /** Dollars. `BenefitsGranted.data.price` is in DOLLARS by application convention. */
  netSpend: number;
}

export function emptyGrantLedger(): UserGrantLedger {
  return {
    memberEntries: 0,
    oneTimeEntries: 0,
    upsellEntries: 0,
    miniDrawEntries: 0,
    netSpend: 0,
  };
}

/** Pure fold of aggregation rows into per-user ledgers. Separated so it is testable without Mongo. */
export function foldGrantRows(rows: GrantRow[]): Map<string, UserGrantLedger> {
  const out = new Map<string, UserGrantLedger>();
  for (const row of rows) {
    const key = String(row.userId);
    const ledger = out.get(key) ?? emptyGrantLedger();
    const bucket = PACKAGE_TYPE_TO_BUCKET[row.packageType];
    if (bucket) {
      ledger[bucket] += Number(row.entries) || 0;
      ledger.netSpend += Number(row.price) || 0;
    }
    out.set(key, ledger);
  }
  return out;
}

/**
 * Lifetime paid grants for the given users, excluding any BenefitsGranted row whose
 * paymentIntentId has a matching RefundProcessed (Option B netting, identical to the
 * admin revenue breakdown).
 *
 * Indexed by `userId_1_timestamp_-1`. Users with no grants are simply absent from the
 * returned Map — callers should fall back to `emptyGrantLedger()`.
 */
export async function aggregateNetGrantsByUser(
  userIds: mongoose.Types.ObjectId[]
): Promise<Map<string, UserGrantLedger>> {
  if (userIds.length === 0) return new Map();

  const rows = await PaymentEvent.aggregate<{
    _id: { userId: mongoose.Types.ObjectId; packageType: GrantPackageType };
    entries: number;
    price: number;
  }>([
    { $match: { userId: { $in: userIds }, eventType: "BenefitsGranted" } },
    ...excludeRefundedBenefitsGrantedStages(),
    {
      $group: {
        _id: { userId: "$userId", packageType: "$packageType" },
        entries: { $sum: { $ifNull: ["$data.entries", 0] } },
        price: { $sum: { $ifNull: ["$data.price", 0] } },
      },
    },
  ]);

  return foldGrantRows(
    rows.map((r) => ({
      userId: String(r._id.userId),
      packageType: r._id.packageType,
      entries: r.entries,
      price: r.price,
    }))
  );
}
```

Add `import mongoose from "mongoose";` to the file's imports if not already present (it currently imports only `type { PipelineStage }` — extend to `import mongoose, { type PipelineStage } from "mongoose";`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:payment-grant-ledger`
Expected: PASS — `payment-event-grant-ledger tests passed`

- [ ] **Step 5: Verify against the two real production customers**

Run:
```bash
npx tsx -e "
import('dotenv').then(d=>d.default.config({path:'C:/Codes/ToolsAustralia/.env.local',quiet:true})).then(async()=>{
  process.env.MONGODB_URI=process.env.PROD_MONGODB_URI.replace(/(mongodb\+srv:\/\/[^/]+)\/?(\?|\$)/,'\$1/Production\$2');
  const connectDB=(await import('./src/lib/mongodb')).default; await connectDB();
  const mongoose=(await import('mongoose')).default;
  const {aggregateNetGrantsByUser}=await import('./src/utils/payment/payment-event-net-queries');
  const ids=['6a8e1deb316a961f204a7888','6a8e19902f1ab29826f6c613'].map(i=>new mongoose.Types.ObjectId(i));
  const m=await aggregateNetGrantsByUser(ids);
  for(const id of ids) console.log(String(id), JSON.stringify(m.get(String(id))));
  process.exit(0);
});"
```
Expected: `…7888 {"memberEntries":150,…,"netSpend":20}` and `…c613 {"memberEntries":1000,…,"netSpend":80}` — the granted values, **not** 15 and 100.

- [ ] **Step 6: Commit** *(only if authorized)*

```bash
git add src/utils/payment/payment-event-net-queries.ts src/utils/payment/__tests__/payment-event-grant-ledger.test.ts package.json
git commit -m "feat(payment): add refund-netted per-user grant ledger from PaymentEvent"
```

---

## Task 3: Source the profile's entry and spend properties from the ledger

**Files:**
- Modify: `src/utils/integrations/klaviyo/klaviyo-helpers.ts` (`calculateEntryBreakdown` ~line 31, `calculateLifetimeValue` ~line 400, `userToKlaviyoProfile` ~line 150)
- Create: `src/utils/integrations/klaviyo/__tests__/klaviyo-profile-projection.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `UserGrantLedger`, `emptyGrantLedger`, `aggregateNetGrantsByUser` from Task 2.
- Produces:
  ```ts
  export function calculateEntryBreakdown(user: IUser, ledger: UserGrantLedger): {
    memberEntries: number; oneTimeEntries: number; upsellEntries: number; miniDrawEntries: number;
  };
  export function calculateLifetimeValue(user: IUser, ledger: UserGrantLedger): number;
  export async function userToKlaviyoProfile(
    user: IUser,
    brandInterestFromSignup?: string | null,
    targetDraw?: IMajorDraw,
    cutoffDate?: Date,
    ledger?: UserGrantLedger,
  ): Promise<KlaviyoProfile>;
  ```
  Task 6 passes a prefetched `ledger`; every other caller omits it and the function fetches its own.

- [ ] **Step 1: Write the failing test**

Create `src/utils/integrations/klaviyo/__tests__/klaviyo-profile-projection.test.ts`:

```ts
import assert from "node:assert/strict";
import type { IUser } from "@/models/User";
import { calculateEntryBreakdown, calculateLifetimeValue } from "../klaviyo-helpers";
import { emptyGrantLedger } from "@/utils/payment/payment-event-net-queries";

// A Tradie member who received 150 entries under a 10x promo. The catalogue says 15/month.
// Before this fix the projection returned 15. It must now return what was granted.
function testMemberEntriesComeFromLedgerNotCatalogue() {
  const user = {
    subscription: {
      isActive: true,
      packageId: "tradie-subscription",
      startDate: new Date("2026-08-25T22:58:01.902Z"),
      endDate: new Date("2026-09-23T14:00:00.000Z"),
    },
  } as unknown as IUser;

  const ledger = { ...emptyGrantLedger(), memberEntries: 150, netSpend: 20 };
  assert.equal(calculateEntryBreakdown(user, ledger).memberEntries, 150);
  assert.notEqual(calculateEntryBreakdown(user, ledger).memberEntries, 15);
}

function testOtherBucketsPassThroughFromLedger() {
  const user = {} as unknown as IUser;
  const ledger = {
    memberEntries: 1000,
    oneTimeEntries: 30,
    upsellEntries: 60,
    miniDrawEntries: 5,
    netSpend: 126,
  };
  assert.deepEqual(calculateEntryBreakdown(user, ledger), {
    memberEntries: 1000,
    oneTimeEntries: 30,
    upsellEntries: 60,
    miniDrawEntries: 5,
  });
}

// lifetime_value used to gate the subscription portion on subscription.isActive, so it
// collapsed to (near) zero the moment a membership lapsed despite being named "lifetime".
function testLifetimeValueSurvivesALapsedMembership() {
  const lapsed = {
    subscription: { isActive: false, status: "canceled", packageId: "boss-subscription" },
  } as unknown as IUser;

  const ledger = { ...emptyGrantLedger(), memberEntries: 1000, netSpend: 240 };
  assert.equal(calculateLifetimeValue(lapsed, ledger), 240);
}

function testLifetimeValueIsZeroWithNoGrants() {
  const user = { subscription: { isActive: false } } as unknown as IUser;
  assert.equal(calculateLifetimeValue(user, emptyGrantLedger()), 0);
}

function run() {
  testMemberEntriesComeFromLedgerNotCatalogue();
  testOtherBucketsPassThroughFromLedger();
  testLifetimeValueSurvivesALapsedMembership();
  testLifetimeValueIsZeroWithNoGrants();
  console.log("klaviyo-profile-projection tests passed");
}

run();
```

- [ ] **Step 2: Add the npm entry and run to verify it fails**

In `package.json` `scripts`, add:

```json
    "test:klaviyo-projection": "tsx src/utils/integrations/klaviyo/__tests__/klaviyo-profile-projection.test.ts",
```

Run: `npm run test:klaviyo-projection`
Expected: FAIL — `calculateEntryBreakdown` currently takes one argument and reads the catalogue.

- [ ] **Step 3: Replace `calculateEntryBreakdown`**

In `src/utils/integrations/klaviyo/klaviyo-helpers.ts`, replace the whole `calculateEntryBreakdown` function (starts ~line 31) with:

```ts
/**
 * Entry counts by paid source, read from the payment ledger.
 *
 * This used to reconstruct membership entries as
 * `catalogue.entriesPerMonth x floor(elapsed / 30 days)`. That was verified wrong for
 * 4,904 of 4,904 active members on 2026-08-26 (understated by x5-x14) because the
 * catalogue cannot know about promo multipliers, upgrades that reset `startDate`, or
 * resubscribes. The ledger records what was actually granted, so we read it.
 *
 * `user` is retained in the signature for call-site symmetry and future per-user
 * adjustments; the numbers come entirely from `ledger`.
 */
export function calculateEntryBreakdown(
  user: IUser,
  ledger: UserGrantLedger
): {
  memberEntries: number;
  oneTimeEntries: number;
  upsellEntries: number;
  miniDrawEntries: number;
} {
  void user;
  return {
    memberEntries: ledger.memberEntries,
    oneTimeEntries: ledger.oneTimeEntries,
    upsellEntries: ledger.upsellEntries,
    miniDrawEntries: ledger.miniDrawEntries,
  };
}
```

Add to the file's imports:

```ts
import {
  type UserGrantLedger,
  emptyGrantLedger,
  aggregateNetGrantsByUser,
} from "@/utils/payment/payment-event-net-queries";
```

- [ ] **Step 4: Replace `calculateLifetimeValue`**

Replace the whole `calculateLifetimeValue` function (starts ~line 400) with:

```ts
/**
 * Lifetime spend in dollars, refund-netted, from the payment ledger.
 *
 * The previous implementation summed `catalogue.price x elapsed months` and gated the
 * subscription portion on `subscription.isActive`, so a "lifetime" figure collapsed the
 * moment a membership lapsed, and was wrong across any upgrade or downgrade.
 *
 * NOTE: Klaviyo also computes Historic CLV natively from the `Placed Order` /
 * `Refunded Order` events this app already sends with `$value`, `Currency` and `Order ID`.
 * Where the two disagree, KLAVIYO'S NATIVE FIGURE IS THE TIEBREAKER — it is derived from a
 * source that cannot drift out of sync with what Klaviyo itself sees.
 */
export function calculateLifetimeValue(user: IUser, ledger: UserGrantLedger): number {
  void user;
  return ledger.netSpend;
}
```

- [ ] **Step 5: Thread the ledger through `userToKlaviyoProfile`**

In `userToKlaviyoProfile`, change the signature to add a fifth optional parameter:

```ts
export async function userToKlaviyoProfile(
  user: IUser,
  brandInterestFromSignup?: string | null,
  targetDraw?: IMajorDraw,
  cutoffDate?: Date,
  ledger?: UserGrantLedger
): Promise<KlaviyoProfile> {
```

Immediately before the existing `const lifetimeValue = calculateLifetimeValue(user);` line, insert:

```ts
  // Batch callers (the reconciliation sweep) prefetch one ledger per batch — same caching
  // convention as `targetDraw` / `cutoffDate` above. Single-user callers fetch their own:
  // one indexed query on `userId_1_timestamp_-1`.
  let resolvedLedger = ledger;
  if (!resolvedLedger) {
    try {
      const byUser = await aggregateNetGrantsByUser([user._id]);
      resolvedLedger = byUser.get(user._id.toString()) ?? emptyGrantLedger();
    } catch (ledgerError) {
      // Non-fatal: a Klaviyo profile sync must not break because one aggregation failed.
      // An empty ledger publishes zeros, which the next sweep corrects.
      console.error(`Error loading grant ledger for user ${user._id}:`, ledgerError);
      resolvedLedger = emptyGrantLedger();
    }
  }
```

Then update the three call sites in that function:

```ts
  const lifetimeValue = calculateLifetimeValue(user, resolvedLedger);
```
```ts
  const entryBreakdown = calculateEntryBreakdown(user, resolvedLedger);
```

(`calculateUpsellMetrics(user)` and `calculatePartnerDiscountStatus(user)` are unchanged.)

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test:klaviyo-projection`
Expected: PASS — `klaviyo-profile-projection tests passed`

- [ ] **Step 7: Type-check the whole repo (other callers may break)**

Run: `npm run type-check`
Expected: no errors. If any other file calls `calculateEntryBreakdown` or `calculateLifetimeValue` with one argument, fix it by passing a ledger — find them with `grep -rn "calculateEntryBreakdown\|calculateLifetimeValue" --include=*.ts src/`.

- [ ] **Step 8: Verify end-to-end against the two real customers**

Run the probe from Task 2 Step 5 but calling `userToKlaviyoProfile(u)` and printing `member_entries`, `entries_purchased`, `lifetime_value`, `total_spent`.
Expected: Kellie `150 / 150 / 20 / 20`; Ash `1000 / 1000 / 80 / 80`. Before this task they were `15 / 15` and `100 / 100`.

- [ ] **Step 9: Commit** *(only if authorized)*

```bash
git add src/utils/integrations/klaviyo/klaviyo-helpers.ts src/utils/integrations/klaviyo/__tests__/klaviyo-profile-projection.test.ts package.json
git commit -m "fix(klaviyo): source entry and spend properties from the payment ledger"
```

---

## Task 4: Fix `subscription_has_pending_upgrade` and retire the dead `upsell_*` properties

**Files:**
- Create: `src/utils/subscription/pending-upgrade.ts`
- Create: `src/utils/subscription/__tests__/pending-upgrade.test.ts`
- Modify: `src/services/stripe-webhook-handlers/index.ts:102-108` (replace the private copy with the shared import)
- Modify: `src/utils/integrations/klaviyo/klaviyo-helpers.ts`
- Modify: `src/types/klaviyo.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export function isValidPendingUpgrade(change: unknown): boolean;`

- [ ] **Step 1: Write the failing test**

Create `src/utils/subscription/__tests__/pending-upgrade.test.ts`:

```ts
import assert from "node:assert/strict";
import { isValidPendingUpgrade } from "../pending-upgrade";

// THE REGRESSION THIS FILE EXISTS FOR.
// `subscription.pendingChange` is a Mongoose NESTED OBJECT with all-optional sub-fields, so
// Mongoose materialises it as `{}` on every hydrated document. `!!{}` is `true`, which made
// `subscription_has_pending_upgrade` a hardcoded `true` for all 56,360 production profiles
// while ZERO users had a real pending upgrade. tsc cannot catch this. Keep this test.
function testEmptyObjectIsNotAPendingUpgrade() {
  assert.equal(isValidPendingUpgrade({}), false);
}

function testUndefinedAndNullAreNot() {
  assert.equal(isValidPendingUpgrade(undefined), false);
  assert.equal(isValidPendingUpgrade(null), false);
}

function testRealUpgradeIsRecognised() {
  assert.equal(
    isValidPendingUpgrade({ changeType: "upgrade", newPackageId: "boss-subscription" }),
    true
  );
}

function testEmptyPackageIdIsNot() {
  assert.equal(isValidPendingUpgrade({ changeType: "upgrade", newPackageId: "" }), false);
}

function testWrongChangeTypeIsNot() {
  assert.equal(
    isValidPendingUpgrade({ changeType: "downgrade", newPackageId: "tradie-subscription" }),
    false
  );
}

function testMissingChangeTypeIsNot() {
  assert.equal(isValidPendingUpgrade({ newPackageId: "boss-subscription" }), false);
}

function run() {
  testEmptyObjectIsNotAPendingUpgrade();
  testUndefinedAndNullAreNot();
  testRealUpgradeIsRecognised();
  testEmptyPackageIdIsNot();
  testWrongChangeTypeIsNot();
  testMissingChangeTypeIsNot();
  console.log("pending-upgrade tests passed");
}

run();
```

- [ ] **Step 2: Add the npm entry and run to verify it fails**

In `package.json` `scripts`, add:

```json
    "test:pending-upgrade": "tsx src/utils/subscription/__tests__/pending-upgrade.test.ts",
```

Run: `npm run test:pending-upgrade`
Expected: FAIL — module `../pending-upgrade` not found.

- [ ] **Step 3: Implement the shared predicate**

Create `src/utils/subscription/pending-upgrade.ts`:

```ts
/**
 * Is `change` a REAL pending subscription upgrade?
 *
 * `User.subscription.pendingChange` is a Mongoose nested object whose sub-fields are all
 * optional, so Mongoose materialises it as `{}` on every hydrated document even when
 * nothing is stored. A truthiness check (`!!user.subscription?.pendingChange`) is therefore
 * ALWAYS TRUE — which is exactly what shipped: on 2026-08-26 all 56,360 production profiles
 * carried `subscription_has_pending_upgrade: true` while zero users had a real one.
 *
 * Check the payload, never the object's existence.
 *
 * Lives in `utils/` (not `services/`) so both the Klaviyo profile projection and the Stripe
 * webhook handlers can share ONE definition — `utils/` may not import from `services/`.
 */
export function isValidPendingUpgrade(change: unknown): boolean {
  if (!change || typeof change !== "object") return false;
  const c = change as { changeType?: unknown; newPackageId?: unknown };
  return (
    c.changeType === "upgrade" && typeof c.newPackageId === "string" && c.newPackageId.length > 0
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:pending-upgrade`
Expected: PASS — `pending-upgrade tests passed`

- [ ] **Step 5: Use it in the Klaviyo projection**

In `src/utils/integrations/klaviyo/klaviyo-helpers.ts`, add to imports:

```ts
import { isValidPendingUpgrade } from "@/utils/subscription/pending-upgrade";
```

Replace the property line (~line 285):

```ts
      subscription_has_pending_upgrade: !!user.subscription?.pendingChange,
```

with:

```ts
      // NOT `!!user.subscription?.pendingChange` — Mongoose materialises this nested object
      // as `{}`, making that expression permanently true. See utils/subscription/pending-upgrade.ts.
      subscription_has_pending_upgrade: isValidPendingUpgrade(user.subscription?.pendingChange),
```

- [ ] **Step 6: Collapse the webhook handler's private copy onto the shared one**

In `src/services/stripe-webhook-handlers/index.ts`, delete the private `isValidPendingUpgrade` function at lines 102-108 and add to the file's imports:

```ts
import { isValidPendingUpgrade } from "@/utils/subscription/pending-upgrade";
```

The deleted local version was a **type guard** (`change is PendingUpgradeChange`); the shared
version returns plain `boolean`, so the three ternary call sites need an explicit cast. There
are exactly four call sites (verified 2026-08-26):

| line | current form | action |
|---|---|---|
| 1823 | `const pendingUpgrade = isValidPendingUpgrade(...) ? ... : ...` | add cast |
| 1932 | `const pendingUpgrade = isValidPendingUpgrade(...) ? ... : ...` | add cast |
| 2180 | `const hasPendingChange = isValidPendingUpgrade(...)` | **no change** — already a boolean |
| 2658 | `const pendingChange = isValidPendingUpgrade(...) ? ... : ...` | add cast |

At each of 1823, 1932 and 2658, change the truthy branch to carry the cast the guard used to
provide:

```ts
      ? (user.subscription?.pendingChange as PendingUpgradeChange | undefined)
```

Confirm the line numbers before editing — they shift as the file changes:
`grep -n "isValidPendingUpgrade" src/services/stripe-webhook-handlers/index.ts`

- [ ] **Step 7: Retire the five dead `upsell_*` properties**

Verified 2026-08-26: **0 of 56,360** users have `upsellStats.totalShown > 0`, because the only writer (`src/components/modals/UpsellManager.tsx`) is imported nowhere. Klaviyo's own guidance is to clean out properties that are no longer useful, and `undefined` cannot clear a Klaviyo property — only explicit `null` can.

In `src/types/klaviyo.ts`, change the five declarations to accept `null`:

```ts
  upsell_total_shown?: number | null;
  upsell_total_accepted?: number | null;
  upsell_total_declined?: number | null;
  upsell_conversion_rate?: number | null;
  upsell_last_interaction?: string | null;
```

In `klaviyo-helpers.ts`, replace the five assignments with:

```ts
      // RETIRED 2026-08-26. Their only writer (`/api/upsell/track`, called from
      // UpsellManager.tsx) is mounted nowhere, so these were 0 for all 56,360 users while
      // 2,290 users had real upsell purchases. Explicit `null` CLEARS them in Klaviyo —
      // `undefined` is stripped by cleanProperties and would leave the stale zeros in place.
      // Re-enabling upsell funnel data means mounting the tracker; that is separate work.
      upsell_total_shown: null,
      upsell_total_accepted: null,
      upsell_total_declined: null,
      upsell_conversion_rate: null,
      upsell_last_interaction: null,
```

Then delete the now-unused `const upsellMetrics = calculateUpsellMetrics(user);` line and, if `calculateUpsellMetrics` has no other callers (`grep -rn "calculateUpsellMetrics" --include=*.ts src/`), delete that function too — the repo prefers deletion over `_`-prefixing.

Leave `total_upsells_purchased` alone: it reads `user.upsellPurchases.length`, which is real.

- [ ] **Step 8: Run all affected tests and type-check**

Run: `npm run test:pending-upgrade && npm run test:klaviyo-projection && npm run type-check`
Expected: both tests pass, no type errors.

- [ ] **Step 9: Commit** *(only if authorized)*

```bash
git add src/utils/subscription/pending-upgrade.ts src/utils/subscription/__tests__/pending-upgrade.test.ts src/services/stripe-webhook-handlers/index.ts src/utils/integrations/klaviyo/klaviyo-helpers.ts src/types/klaviyo.ts package.json
git commit -m "fix(klaviyo): correct pending-upgrade flag and retire dead upsell properties"
```

---

## Task 5: Watermark model, `klaviyoSyncedAt`, and the `updatedAt` index

**Files:**
- Create: `src/models/KlaviyoSyncState.ts`
- Modify: `src/models/User.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  // KlaviyoSyncState.ts
  export interface IKlaviyoSyncState extends Document {
    _id: string;                 // always "klaviyo-profile-sweep"
    watermark: Date;             // last successfully-swept updatedAt
    lastRunAt?: Date;
    lastRunProcessed?: number;
    lastRunFailed?: number;
  }
  export default KlaviyoSyncState;                       // mongoose Model
  export const KLAVIYO_SWEEP_STATE_ID = "klaviyo-profile-sweep";
  ```
  `User` gains `klaviyoSyncedAt?: Date`. Task 6 consumes both.

- [ ] **Step 1: Create the watermark model**

Create `src/models/KlaviyoSyncState.ts`, matching the single-document pattern of `ChargeJobLock`:

```ts
import mongoose, { Document, Schema } from "mongoose";

export const KLAVIYO_SWEEP_STATE_ID = "klaviyo-profile-sweep";

/**
 * Single-document state for the Klaviyo profile reconciliation sweep.
 *
 * The sweep selects users by `updatedAt > watermark`, so the watermark must survive across
 * serverless invocations — there is no other singleton-state model in the repo to reuse.
 * It advances ONLY after a clean run, which is what makes a failed run self-healing: the
 * next run simply re-covers the same window.
 *
 * `timestamps: false` — this document's own mtime carries no meaning and we never query it.
 */
export interface IKlaviyoSyncState extends Document {
  _id: string;
  watermark: Date;
  lastRunAt?: Date;
  lastRunProcessed?: number;
  lastRunFailed?: number;
}

const KlaviyoSyncStateSchema = new Schema<IKlaviyoSyncState>(
  {
    _id: { type: String, default: KLAVIYO_SWEEP_STATE_ID },
    watermark: { type: Date, required: true, default: () => new Date(0) },
    lastRunAt: { type: Date, required: false },
    lastRunProcessed: { type: Number, required: false },
    lastRunFailed: { type: Number, required: false },
  },
  { timestamps: false }
);

const KlaviyoSyncState =
  (mongoose.models.KlaviyoSyncState as mongoose.Model<IKlaviyoSyncState>) ||
  mongoose.model<IKlaviyoSyncState>("KlaviyoSyncState", KlaviyoSyncStateSchema);

export default KlaviyoSyncState;
```

- [ ] **Step 2: Add `klaviyoSyncedAt` to the User interface**

In `src/models/User.ts`, next to the other tracking fields on the `IUser` interface (near `accumulatedEntries`, ~line 150), add:

```ts
  /** When WE last wrote this user's profile to Klaviyo. Set by the reconciliation sweep. */
  klaviyoSyncedAt?: Date;
```

- [ ] **Step 3: Add it to the schema**

In the `UserSchema` definition, next to `accumulatedEntries` (~line 820), add:

```ts
    // Set by the Klaviyo reconciliation sweep with `{ timestamps: false }` so writing it does
    // NOT bump `updatedAt` — otherwise stamping it would re-dirty the user and the sweep would
    // never converge. Verified 2026-08-26 on Mongoose 8.18.1.
    //
    // Deliberately NOT read from Klaviyo's own `updated` field: that moves whenever Klaviyo
    // runs predictive analytics (both sampled profiles shared an identical `updated` timestamp
    // with no write from us), so it cannot answer "when did WE last write this profile?".
    klaviyoSyncedAt: {
      type: Date,
      required: false,
    },
```

- [ ] **Step 4: Add the sweep's index**

At the bottom of `src/models/User.ts` where the other indexes are declared (find them with `grep -n "UserSchema.index" src/models/User.ts`), add:

```ts
// The Klaviyo reconciliation sweep's selector (`{ updatedAt: { $gt: watermark } }`) AND its
// backlog gauge both depend on this index. It is LOAD-BEARING, not an optimisation:
// explained against production on 2026-08-26 WITHOUT it, the selector examined 56,441
// documents to return 4. With a 5-minute cadence that would be 288 collection scans a day.
// ~56k documents, ~1,300 mutations/day, so the index itself is small and hot.
UserSchema.index({ updatedAt: 1 });
```

- [ ] **Step 5: Confirm the index actually changes the plan**

Before adding the index, capture the baseline. Run:

```bash
npx tsx -e "
import('dotenv').then(d=>d.default.config({path:'C:/Codes/ToolsAustralia/.env.local',quiet:true})).then(async()=>{
  const connectDB=(await import('./src/lib/mongodb')).default; await connectDB();
  const {default:User}=await import('./src/models/User');
  const e=await User.find({updatedAt:{\$gt:new Date(Date.now()-5*60*1000)}}).sort({updatedAt:1}).limit(500).explain('executionStats');
  console.log('docsExamined',e.executionStats.totalDocsExamined,'keysExamined',e.executionStats.totalKeysExamined,'returned',e.executionStats.nReturned);
  process.exit(0);
});"
```

Run it once before `User.init()` installs the index and once after.
Expected before: `keysExamined 0` and `docsExamined` ≈ the whole collection.
Expected after: `keysExamined` > 0 and `docsExamined` ≈ `nReturned`.

If the "after" run still shows `keysExamined 0`, **stop** — the 5-minute cadence is not safe
without this index and the whole load argument for it collapses.

- [ ] **Step 6: Verify the index installs and does not collide**

Run:
```bash
npx tsx -e "
import('dotenv').then(d=>d.default.config({path:'C:/Codes/ToolsAustralia/.env.local',quiet:true})).then(async()=>{
  const connectDB=(await import('./src/lib/mongodb')).default; await connectDB();
  const {default:User}=await import('./src/models/User');
  await User.init();
  console.log((await User.collection.indexes()).map(i=>i.name).join(', '));
  process.exit(0);
});"
```
Expected: the list includes `updatedAt_1`, and the command exits 0. This runs against the **dev** DB (`MONGODB_URI`), not production.

- [ ] **Step 7: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 8: Commit** *(only if authorized)*

```bash
git add src/models/KlaviyoSyncState.ts src/models/User.ts
git commit -m "feat(klaviyo): add sweep watermark model and per-user klaviyoSyncedAt"
```

---

## Task 6: The reconciliation sweep service

**Files:**
- Create: `src/services/klaviyo/KlaviyoProfileReconciliationService.ts`
- Create: `src/services/klaviyo/__tests__/klaviyo-reconciliation.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `aggregateNetGrantsByUser`, `emptyGrantLedger` (Task 2); `userToKlaviyoProfile` 5th param (Task 3); `KlaviyoSyncState`, `KLAVIYO_SWEEP_STATE_ID`, `User.klaviyoSyncedAt` (Task 5); existing `syncUserProfileToKlaviyo` from `klaviyo-profile-sync.ts`.
- Produces:
  ```ts
  export interface ReconciliationResult {
    mode: "incremental" | "full";
    watermarkBefore: string;
    watermarkAfter: string;
    candidates: number;
    processed: number;
    failed: number;
    backlogCount: number;
    durationMs: number;
  }
  export function nextWatermark(
    current: Date, batchMaxUpdatedAt: Date | null, failed: number
  ): Date;
  export async function runKlaviyoProfileReconciliation(
    options?: { mode?: "incremental" | "full"; limit?: number }
  ): Promise<ReconciliationResult>;
  ```
  Task 7 (cron) and Task 9 (backfill) both call `runKlaviyoProfileReconciliation`.

- [ ] **Step 1: Write the failing test**

Create `src/services/klaviyo/__tests__/klaviyo-reconciliation.test.ts`:

```ts
import assert from "node:assert/strict";
import { nextWatermark } from "../KlaviyoProfileReconciliationService";

const T0 = new Date("2026-08-26T00:00:00.000Z");
const T1 = new Date("2026-08-26T00:05:00.000Z");

// A clean run advances the watermark to the newest updatedAt it actually covered.
function testCleanRunAdvances() {
  assert.equal(nextWatermark(T0, T1, 0).toISOString(), T1.toISOString());
}

// THE SELF-HEALING PROPERTY. If any user in the batch failed to sync, the watermark must
// NOT move, so the next run re-covers the same window. Without this a transient Klaviyo
// outage silently drops every user in the window — the exact class of bug being fixed.
function testFailedRunDoesNotAdvance() {
  assert.equal(nextWatermark(T0, T1, 1).toISOString(), T0.toISOString());
  assert.equal(nextWatermark(T0, T1, 47).toISOString(), T0.toISOString());
}

// Nothing to do: hold position rather than jumping to "now", which would skip any user
// mutated between the query and the write.
function testEmptyBatchHoldsPosition() {
  assert.equal(nextWatermark(T0, null, 0).toISOString(), T0.toISOString());
}

// Never move backwards, whatever the batch reports.
function testNeverGoesBackwards() {
  const earlier = new Date("2026-08-25T00:00:00.000Z");
  assert.equal(nextWatermark(T0, earlier, 0).toISOString(), T0.toISOString());
}

function run() {
  testCleanRunAdvances();
  testFailedRunDoesNotAdvance();
  testEmptyBatchHoldsPosition();
  testNeverGoesBackwards();
  console.log("klaviyo-reconciliation tests passed");
}

run();
```

- [ ] **Step 2: Add the npm entry and run to verify it fails**

In `package.json` `scripts`, add:

```json
    "test:klaviyo-reconciliation": "tsx src/services/klaviyo/__tests__/klaviyo-reconciliation.test.ts",
```

Run: `npm run test:klaviyo-reconciliation`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `src/services/klaviyo/KlaviyoProfileReconciliationService.ts`:

```ts
import connectDB from "@/lib/mongodb";
import User, { type IUser } from "@/models/User";
import KlaviyoSyncState, { KLAVIYO_SWEEP_STATE_ID } from "@/models/KlaviyoSyncState";
import { syncUserProfileToKlaviyo } from "@/utils/integrations/klaviyo/klaviyo-profile-sync";
import {
  aggregateNetGrantsByUser,
  emptyGrantLedger,
} from "@/utils/payment/payment-event-net-queries";

/**
 * Klaviyo profile reconciliation sweep.
 *
 * WHY A SWEEP AND NOT CALL-SITE FIXES. `ensureUserProfileSynced` returns `void` and
 * delegates to a fire-and-forget `.catch()`, so the `await` at ~24 call sites is a no-op and
 * the real HTTP request is left detached — on Vercel the function can freeze once the
 * webhook returns 200. Patching each site is whack-a-mole and cannot cover the sites nobody
 * remembered (`customer.subscription.deleted`, admin PATCHes without `basicInfo`, referral /
 * milestone / redeemable grants) or sites not yet written.
 *
 * Instead we key on `user.updatedAt`, which Mongoose maintains on EVERY mutation including
 * raw `$inc`. Verified 2026-08-26: a customer granted entries at 22:59:17 had
 * `updatedAt = 22:59:18.916`. The database knew 1.9s later; only Klaviyo did not.
 *
 * NEVER call this from a payment path. Klaviyo's client uses a 30s timeout and Stripe
 * retries webhooks that do not return a fast 2xx — a blocking Klaviyo call on a money path
 * risks duplicate payment processing, which is strictly worse than a stale property.
 */

/** Throttle: matches `syncMultipleUserProfilesToKlaviyo` (8 concurrent / 700ms) — Klaviyo's
 *  Get-Profiles bucket is the binding limit at ~700/min steady. */
const CONCURRENT_SYNC_LIMIT = 8;
const BATCH_DELAY_MS = 700;

/** Per-invocation safety cap. Production mutates ~6 users / 5 min, so this is never reached
 *  incrementally; it bounds a `full` run to one serverless function's budget. */
const DEFAULT_LIMIT = 500;

/**
 * Above this many users still waiting AFTER a run, report a problem. Tune after a week.
 *
 * Production mutates ~6 users / 5 min, so a healthy backlog is ~0. A number that grows
 * run-over-run means the sweep is not keeping up.
 */
export const BACKLOG_ALERT_THRESHOLD = 25;

export interface ReconciliationResult {
  mode: "incremental" | "full";
  watermarkBefore: string;
  watermarkAfter: string;
  candidates: number;
  processed: number;
  failed: number;
  backlogCount: number;
  durationMs: number;
}

/**
 * Where the watermark lands after a run.
 *
 * Advances ONLY on a fully clean run. Any failure holds position so the next run re-covers
 * the window — that is what makes a transient Klaviyo outage self-healing instead of a
 * silent permanent gap. Never moves backwards.
 */
export function nextWatermark(
  current: Date,
  batchMaxUpdatedAt: Date | null,
  failed: number
): Date {
  if (failed > 0) return current;
  if (!batchMaxUpdatedAt) return current;
  return batchMaxUpdatedAt.getTime() > current.getTime() ? batchMaxUpdatedAt : current;
}

export async function runKlaviyoProfileReconciliation(
  options: { mode?: "incremental" | "full"; limit?: number } = {}
): Promise<ReconciliationResult> {
  const mode = options.mode ?? "incremental";
  const limit = options.limit ?? DEFAULT_LIMIT;
  const startedAt = Date.now();

  await connectDB();

  const state =
    (await KlaviyoSyncState.findById(KLAVIYO_SWEEP_STATE_ID)) ??
    (await KlaviyoSyncState.create({ _id: KLAVIYO_SWEEP_STATE_ID, watermark: new Date(0) }));

  // `full` ignores the stored watermark: it re-covers everyone, which is how purely
  // time-derived properties (membership_active_duration_months) get refreshed, and how the
  // one-shot backfill runs — same code path, no separate script logic.
  const watermarkBefore = mode === "full" ? new Date(0) : state.watermark;

  const users = (await User.find({ updatedAt: { $gt: watermarkBefore } })
    .sort({ updatedAt: 1 })
    .limit(limit)) as IUser[];

  let processed = 0;
  let failed = 0;
  let batchMaxUpdatedAt: Date | null = null;

  // One aggregation for the whole batch rather than one per user — same caching convention
  // `userToKlaviyoProfile` already uses for targetDraw / cutoffDate.
  const ledgers = await aggregateNetGrantsByUser(users.map((u) => u._id));

  for (let i = 0; i < users.length; i += CONCURRENT_SYNC_LIMIT) {
    const batch = users.slice(i, i + CONCURRENT_SYNC_LIMIT);

    const results = await Promise.allSettled(
      batch.map(async (user) => {
        const ledger = ledgers.get(user._id.toString()) ?? emptyGrantLedger();
        await syncUserProfileToKlaviyo(user, undefined, undefined, undefined, ledger);
        // `timestamps: false` is LOad-BEARING: without it this write bumps `updatedAt`, which
        // re-dirties the user and the sweep never converges. Verified on Mongoose 8.18.1.
        await User.updateOne(
          { _id: user._id },
          { $set: { klaviyoSyncedAt: new Date() } },
          { timestamps: false }
        );
      })
    );

    for (let j = 0; j < results.length; j++) {
      if (results[j].status === "fulfilled") {
        processed++;
        const u = batch[j].updatedAt;
        if (u && (!batchMaxUpdatedAt || u > batchMaxUpdatedAt)) batchMaxUpdatedAt = u;
      } else {
        failed++;
        console.error(
          `[reconcile-klaviyo-profiles] sync failed for user ${batch[j]._id}:`,
          (results[j] as PromiseRejectedResult).reason
        );
      }
    }

    if (i + CONCURRENT_SYNC_LIMIT < users.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  const watermarkAfter = nextWatermark(watermarkBefore, batchMaxUpdatedAt, failed);

  // Only persist the watermark for incremental runs. A `full` run is a repair pass and must
  // never rewind the incremental cursor.
  if (mode === "incremental") {
    state.watermark = watermarkAfter;
  }
  state.lastRunAt = new Date();
  state.lastRunProcessed = processed;
  state.lastRunFailed = failed;
  await state.save();

  // Backlog: how many users are still waiting after this run.
  //
  // DO NOT replace this with a field-to-field comparison such as
  //   { $expr: { $gt: [{ $subtract: ["$updatedAt", "$klaviyoSyncedAt"] }, GRACE] } }
  // MongoDB cannot serve that from any index. Explained against production on 2026-08-26 it
  // examined 56,441 documents / 0 index keys / 95ms — a full collection scan, which at a
  // 5-minute cadence is 288 collection scans a day.
  //
  // This form uses the same `updatedAt` index the sweep's own selector uses, and answers the
  // more useful question: is the sweep falling behind RIGHT NOW?
  const backlogCount = await User.countDocuments({ updatedAt: { $gt: watermarkAfter } });

  return {
    mode,
    watermarkBefore: watermarkBefore.toISOString(),
    watermarkAfter: watermarkAfter.toISOString(),
    candidates: users.length,
    processed,
    failed,
    backlogCount,
    durationMs: Date.now() - startedAt,
  };
}
```

- [ ] **Step 4: Extend `syncUserProfileToKlaviyo` to accept the ledger**

The service passes a 5th argument. In `src/utils/integrations/klaviyo/klaviyo-profile-sync.ts`, change the signature (~line 162) to:

```ts
export async function syncUserProfileToKlaviyo(
  user: IUser,
  brandInterestFromSignup?: string | null,
  targetDraw?: IMajorDraw,
  cutoffDate?: Date,
  ledger?: import("@/utils/payment/payment-event-net-queries").UserGrantLedger
): Promise<void> {
```

and pass it through:

```ts
    const profile = await userToKlaviyoProfile(user, brandInterestFromSignup, targetDraw, cutoffDate, ledger);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:klaviyo-reconciliation`
Expected: PASS — `klaviyo-reconciliation tests passed`

- [ ] **Step 6: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 7: Rehearse against the DEV database, guard ON**

Run: `KLAVIYO_ENABLED=false npx tsx -e "import('./src/services/klaviyo/KlaviyoProfileReconciliationService').then(async m => { console.log(JSON.stringify(await m.runKlaviyoProfileReconciliation({ limit: 5 }), null, 2)); process.exit(0); })"`

Expected: a `ReconciliationResult` with `mode: "incremental"`, `candidates` ≤ 5, `failed: 0`, and `watermarkAfter` later than `watermarkBefore`. `KLAVIYO_ENABLED=false` makes the Klaviyo calls no-ops so this exercises the loop and the watermark without any outbound traffic.

- [ ] **Step 8: Verify the no-re-dirty property on real data**

Run the sweep twice in a row with `limit: 5` against the dev DB. On the second run, `candidates` must be **0** (or only genuinely-new mutations). If the second run returns the same non-zero `candidates`, the `{ timestamps: false }` option is not taking effect — stop and fix before continuing.

- [ ] **Step 9: Commit** *(only if authorized)*

```bash
git add src/services/klaviyo/KlaviyoProfileReconciliationService.ts src/services/klaviyo/__tests__/klaviyo-reconciliation.test.ts src/utils/integrations/klaviyo/klaviyo-profile-sync.ts package.json
git commit -m "feat(klaviyo): add watermark-driven profile reconciliation sweep"
```

---

## Task 7: Cron route and schedule registration

**Files:**
- Create: `src/app/api/cron/reconcile-klaviyo-profiles/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `runKlaviyoProfileReconciliation`, `ReconciliationResult`, `BACKLOG_ALERT_THRESHOLD` (Task 6).
- Produces: `GET /api/cron/reconcile-klaviyo-profiles?mode=full` (mode optional, defaults to incremental).

- [ ] **Step 1: Confirm the cron budget before adding two entries**

Run: `node -e "console.log(require('./vercel.json').crons.length)"`
Expected: `22`. Confirm with the user that the Vercel plan allows 24 cron entries before proceeding — the spec flags this as an unverified external limit.

- [ ] **Step 2: Create the route**

Create `src/app/api/cron/reconcile-klaviyo-profiles/route.ts`, matching `reconcile-renewal-grants`:

```ts
import { NextResponse } from "next/server";
import {
  runKlaviyoProfileReconciliation,
  BACKLOG_ALERT_THRESHOLD,
} from "@/services/klaviyo/KlaviyoProfileReconciliationService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/reconcile-klaviyo-profiles
 *
 * Re-syncs every user whose `updatedAt` moved since the stored watermark. This is the ONLY
 * mechanism that guarantees a Klaviyo profile catches up after a purchase — the ~24
 * `ensureUserProfileSynced` call sites are fire-and-forget and cannot be relied on.
 *
 * `?mode=full` ignores the watermark and re-covers everyone. Used by the weekly schedule to
 * refresh purely time-derived properties (membership_active_duration_months) that change
 * with the calendar and therefore never dirty a document.
 *
 * AUTH — fails CLOSED, matching /api/cron/reconcile-renewal-grants and /api/cron/charge-past-due.
 *
 * SCHEDULE — every 5 minutes. Klaviyo's own integration guidance is "at least every 30
 * minutes (e.g. on a cron)", and the binding rule is that sync frequency must fall inside
 * the shortest flow time delay. Production mutates ~6 users / 5 min, so a run costs ~12
 * Klaviyo API calls against a ~700/min steady budget.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mode = new URL(request.url).searchParams.get("mode") === "full" ? "full" : "incremental";

  try {
    const result = await runKlaviyoProfileReconciliation({ mode });

    // console.error, NOT console.log — production builds strip log/info/debug/warn
    // (next.config.ts compiler.removeConsole), so anything else is invisible in Vercel.
    if (result.failed > 0) {
      console.error(
        `[reconcile-klaviyo-profiles] ${result.failed} sync failure(s) of ${result.candidates} candidate(s); ` +
          `watermark HELD at ${result.watermarkAfter} — next run re-covers this window`
      );
    }

    if (result.backlogCount > BACKLOG_ALERT_THRESHOLD) {
      console.error(
        `[reconcile-klaviyo-profiles] BACKLOG: ${result.backlogCount} user(s) still awaiting sync ` +
          `after this run (threshold ${BACKLOG_ALERT_THRESHOLD}) — the sweep is falling behind`
      );
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[reconcile-klaviyo-profiles] run failed:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Register both schedules**

In `vercel.json`, append to the `crons` array:

```json
    {
      "path": "/api/cron/reconcile-klaviyo-profiles",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/reconcile-klaviyo-profiles?mode=full",
      "schedule": "0 4 * * 0"
    }
```

The weekly full pass is at 04:00 UTC Sunday — clear of the 14:00/15:00 UTC anchor-24 renewal burst and of the 03:15–03:45 UTC reconcile cluster.

- [ ] **Step 4: Verify auth fails closed**

Run: `npm run dev` in one terminal, then in another:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3050/api/cron/reconcile-klaviyo-profiles
```
Expected: `401`.

Then with the secret:
```bash
curl -s -H "authorization: Bearer $(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)" http://localhost:3050/api/cron/reconcile-klaviyo-profiles
```
Expected: `200` with a JSON `ReconciliationResult`.

- [ ] **Step 5: Validate vercel.json is still parseable**

Run: `node -e "const c=require('./vercel.json').crons; console.log(c.length); console.log(JSON.stringify(c.slice(-2)))"`
Expected: `24` and the two new entries.

- [ ] **Step 6: Type-check and lint**

Run: `npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit** *(only if authorized)*

```bash
git add src/app/api/cron/reconcile-klaviyo-profiles/route.ts vercel.json
git commit -m "feat(klaviyo): register profile reconciliation cron (5-min incremental, weekly full)"
```

---

## Task 8: Report the `accumulatedEntries` divergence

The sweep already reports failures and backlog (Task 6/7). This adds the one remaining signal from the spec: the 769 customers whose `accumulatedEntries` disagrees with the draw ledger. The **repair** is explicitly out of scope (§10 of the spec); making it visible is not.

**Files:**
- Modify: `src/services/klaviyo/KlaviyoProfileReconciliationService.ts`
- Modify: `src/app/api/cron/reconcile-klaviyo-profiles/route.ts`

**Interfaces:**
- Produces: `ReconciliationResult` gains `entryLedgerDivergentCount: number`.

- [ ] **Step 1: Add the divergence count to the service**

In `KlaviyoProfileReconciliationService.ts`, add to the `ReconciliationResult` interface:

```ts
  /** Users in this batch whose `accumulatedEntries` disagrees with their paid grant ledger.
   *  Reported, never repaired — see the spec's "Out of scope" section. */
  entryLedgerDivergentCount: number;
```

Before the `return` statement, add:

```ts
  // Verified 2026-08-26: 769 of 11,912 entrants have `accumulatedEntries` disagreeing with
  // the draw ledger, 598 of them OVERSTATED by (typically) exactly 100 — the cancellation-
  // upsell retention grant. Entries counted on the user record that are in no draw.
  //
  // This is an entry-accounting bug, not a Klaviyo bug, and repairing it means deciding
  // whether those customers gain draw entries or lose recorded ones. Counted here so it
  // stops being invisible; fixed on its own ticket.
  //
  // NOTE this compares against PAID grants only, so a user with legitimate free entries
  // (referral / promo-link / retention / streak) will show as divergent. It is a signal to
  // investigate, not a defect count.
  let entryLedgerDivergentCount = 0;
  for (const user of users) {
    const ledger = ledgers.get(user._id.toString()) ?? emptyGrantLedger();
    const paidTotal =
      ledger.memberEntries + ledger.oneTimeEntries + ledger.upsellEntries + ledger.miniDrawEntries;
    if ((user.accumulatedEntries || 0) < paidTotal) entryLedgerDivergentCount++;
  }
```

Add `entryLedgerDivergentCount` to the returned object.

- [ ] **Step 2: Report it from the cron route**

In `src/app/api/cron/reconcile-klaviyo-profiles/route.ts`, after the backlog block, add:

```ts
    if (result.entryLedgerDivergentCount > 0) {
      console.error(
        `[reconcile-klaviyo-profiles] ENTRY LEDGER DIVERGENCE: ${result.entryLedgerDivergentCount} ` +
          `of ${result.candidates} user(s) hold fewer accumulatedEntries than their paid grants ` +
          `total — see the entry-accounting ticket, not this sweep`
      );
    }
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 4: Verify it counts on real data**

Run the Task 6 Step 7 rehearsal command again against the dev DB.
Expected: the result JSON now contains `entryLedgerDivergentCount`.

- [ ] **Step 5: Commit** *(only if authorized)*

```bash
git add src/services/klaviyo/KlaviyoProfileReconciliationService.ts src/app/api/cron/reconcile-klaviyo-profiles/route.ts
git commit -m "feat(klaviyo): report accumulatedEntries-vs-ledger divergence from the sweep"
```

---

## Task 9: Backfill and verification scripts

**Files:**
- Create: `scripts/backfill-klaviyo-profile-accuracy.ts`
- Create: `scripts/verify-klaviyo-profile-accuracy.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `runKlaviyoProfileReconciliation` (Task 6), `connectOpsDb` from `scripts/connect-ops-db.ts`, `aggregateNetGrantsByUser` (Task 2).
- Produces: npm scripts `backfill:klaviyo-accuracy`, `backfill:klaviyo-accuracy:dry`, `verify:klaviyo-accuracy`.

- [ ] **Step 1: Give `full` mode a paging cursor (do this FIRST)**

`full` mode as written in Task 6 always starts from epoch, so paging it would re-select the
same first page forever. Fix the service before writing the script that pages it.

In `src/services/klaviyo/KlaviyoProfileReconciliationService.ts`, widen the options:

```ts
export async function runKlaviyoProfileReconciliation(
  options: { mode?: "incremental" | "full"; limit?: number; afterUpdatedAt?: Date } = {}
): Promise<ReconciliationResult> {
```

and use the cursor in `full` mode:

```ts
  const watermarkBefore =
    mode === "full" ? (options.afterUpdatedAt ?? new Date(0)) : state.watermark;
```

Run: `npm run test:klaviyo-reconciliation && npm run type-check`
Expected: pass, no errors. `nextWatermark` is unchanged, so its tests still hold.

- [ ] **Step 2: Write the backfill script**

Create `scripts/backfill-klaviyo-profile-accuracy.ts`:

```ts
/**
 * One-shot backfill: re-sync every Klaviyo profile with corrected properties.
 *
 * Runs the SAME service the cron runs, in `full` mode, in bounded pages — there is no
 * separate backfill logic to keep true. `full` mode does not touch the incremental
 * watermark, so this can be run at any time without rewinding the live sweep.
 *
 * SAFETY
 *  - `--dry-run` is the DEFAULT. Pass `--live` to actually write.
 *  - Writing to production Klaviyo from a developer machine requires
 *    KLAVIYO_ALLOW_DEV_PROFILE_WRITES=true (the Task 1 guard). That is deliberate: this
 *    script does NOT set it for you.
 *  - `--prod` targets PROD_MONGODB_URI via connectOpsDb.
 *
 * Usage:
 *   npm run backfill:klaviyo-accuracy:dry -- --prod
 *   KLAVIYO_ALLOW_DEV_PROFILE_WRITES=true npm run backfill:klaviyo-accuracy -- --prod --live
 *
 * Exit codes: 0 = clean, 1 = fatal, 2 = completed with per-user failures.
 */
import fs from "node:fs";
import path from "node:path";
import { connectOpsDb } from "./connect-ops-db";

const LIVE = process.argv.includes("--live");
const PAGE_SIZE = 500;
const AUDIT_PATH = path.join(process.cwd(), "backfill-klaviyo-accuracy-audit.csv");

async function main() {
  await connectOpsDb("backfill-klaviyo-accuracy");

  const { default: User } = await import("../src/models/User");
  const { runKlaviyoProfileReconciliation } = await import(
    "../src/services/klaviyo/KlaviyoProfileReconciliationService"
  );

  const total = await User.countDocuments({});
  console.log(`\n=== Klaviyo profile accuracy backfill ===`);
  console.log(`mode      : ${LIVE ? "LIVE (writes to Klaviyo)" : "DRY RUN (no writes)"}`);
  console.log(`profiles  : ${total}`);
  console.log(`page size : ${PAGE_SIZE}\n`);

  if (!LIVE) {
    console.log("DRY RUN — would re-sync all profiles above in `full` mode. Pass --live to write.");
    process.exit(0);
  }

  if (process.env.KLAVIYO_MODE !== "production" && process.env.KLAVIYO_ALLOW_DEV_PROFILE_WRITES !== "true") {
    console.error(
      "REFUSING: KLAVIYO_MODE is not 'production' and KLAVIYO_ALLOW_DEV_PROFILE_WRITES is not 'true'.\n" +
        "Set it explicitly for this run if you intend to write to the real Klaviyo account."
    );
    process.exit(1);
  }

  if (!fs.existsSync(AUDIT_PATH)) {
    fs.appendFileSync(AUDIT_PATH, "timestamp,page,candidates,processed,failed,durationMs\n");
  }

  const startedAt = Date.now();
  // ~20 progress lines regardless of size, so even a small run visibly moves.
  const logEvery = Math.max(1, Math.floor(total / PAGE_SIZE / 20));

  let processedTotal = 0;
  let failedTotal = 0;
  let page = 0;
  // `full` mode ignores the stored watermark, so the cursor lives here. It is threaded
  // through `afterUpdatedAt` so each page starts where the last one ended.
  let cursor: Date | undefined = undefined;

  for (;;) {
    const before = cursor;
    const r = await runKlaviyoProfileReconciliation({
      mode: "full",
      limit: PAGE_SIZE,
      afterUpdatedAt: cursor,
    });
    if (r.candidates === 0) break;

    cursor = new Date(r.watermarkAfter);

    // `nextWatermark` deliberately HOLDS position when any user in the page failed, so the
    // live sweep re-covers the window. In a paging loop that would spin forever — stop
    // instead and let the operator decide.
    if (r.failed > 0 && cursor.getTime() === (before?.getTime() ?? 0)) {
      console.error(
        `Page ${page + 1}: ${r.failed} failure(s) and the cursor did not advance — stopping. ` +
          `Re-run after investigating; completed pages are already synced.`
      );
      failedTotal += r.failed;
      break;
    }

    page++;
    processedTotal += r.processed;
    failedTotal += r.failed;

    fs.appendFileSync(
      AUDIT_PATH,
      `${new Date().toISOString()},${page},${r.candidates},${r.processed},${r.failed},${r.durationMs}\n`
    );

    if (page % logEvery === 0 || r.candidates < PAGE_SIZE) {
      const elapsedSec = (Date.now() - startedAt) / 1000;
      const rate = processedTotal / Math.max(elapsedSec, 1);
      const remaining = Math.max(0, total - processedTotal);
      const etaMin = rate > 0 ? Math.round(remaining / rate / 60) : 0;
      console.log(
        `${processedTotal}/${total} (${((processedTotal / total) * 100).toFixed(1)}%) · ` +
          `${rate.toFixed(1)}/sec · ETA ~${etaMin}m · failed ${failedTotal}`
      );
    }

    if (r.candidates < PAGE_SIZE) break;
  }

  console.log(`\n=== Summary ===`);
  console.log(`processed : ${processedTotal}`);
  console.log(`failed    : ${failedTotal}`);
  console.log(`duration  : ${Math.round((Date.now() - startedAt) / 1000)}s`);
  console.log(`audit log : ${AUDIT_PATH}`);

  process.exit(failedTotal > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
```

- [ ] **Step 3: Write the verification script**

Create `scripts/verify-klaviyo-profile-accuracy.ts`:

```ts
/**
 * Post-backfill verification. Read-only, writes nothing.
 *
 * Checks three things the spec promised:
 *  1. member entries in the profile match the paid grant ledger (catalogue drift gone)
 *  2. no user still reports the always-true pending-upgrade flag
 *  3. the draw ledger's entriesBySource reconciles with each draw's stored totalEntries
 *     (a 165-entry / 0.008% gap was observed on the August draw on 2026-08-26 — this
 *     asserts it has not grown, rather than assuming it is zero)
 *
 * Usage: npm run verify:klaviyo-accuracy -- --prod
 */
import { connectOpsDb } from "./connect-ops-db";
import { isValidPendingUpgrade } from "../src/utils/subscription/pending-upgrade";

const DRAW_TOLERANCE = 0.001; // 0.1% of a draw's total entries

async function main() {
  await connectOpsDb("verify-klaviyo-accuracy");

  const { default: User } = await import("../src/models/User");
  const { default: MajorDraw } = await import("../src/models/MajorDraw");
  const { aggregateNetGrantsByUser } = await import("../src/utils/payment/payment-event-net-queries");

  let failures = 0;

  // 1. Sampled active members: profile member entries === ledger member entries.
  const members = await User.find({ "subscription.isActive": true }).limit(200);
  const ledgers = await aggregateNetGrantsByUser(members.map((m) => m._id));
  const { userToKlaviyoProfile } = await import("../src/utils/integrations/klaviyo/klaviyo-helpers");

  let checked = 0;
  let mismatched = 0;
  for (const m of members) {
    const ledger = ledgers.get(m._id.toString());
    if (!ledger) continue;
    const p = (await userToKlaviyoProfile(m, undefined, undefined, undefined, ledger)) as {
      properties: Record<string, unknown>;
    };
    checked++;
    if (p.properties.member_entries !== ledger.memberEntries) {
      mismatched++;
      console.log(`  MISMATCH ${m._id}: profile=${p.properties.member_entries} ledger=${ledger.memberEntries}`);
    }
    if (p.properties.subscription_has_pending_upgrade !== isValidPendingUpgrade(m.subscription?.pendingChange)) {
      failures++;
      console.log(`  PENDING-UPGRADE WRONG for ${m._id}`);
    }
  }
  console.log(`member_entries: ${checked - mismatched}/${checked} match the ledger`);
  if (mismatched > 0) failures++;

  // 2. Draw ledger self-consistency.
  const draws = await MajorDraw.find({ "entries.0": { $exists: true } });
  for (const d of draws) {
    let sourceSum = 0;
    for (const e of d.entries) {
      for (const v of Object.values(e.entriesBySource || {})) sourceSum += Number(v) || 0;
    }
    const drift = Math.abs(sourceSum - d.totalEntries);
    const ratio = d.totalEntries > 0 ? drift / d.totalEntries : 0;
    const ok = ratio <= DRAW_TOLERANCE;
    console.log(
      `${ok ? "OK  " : "DRIFT"} ${d.name}: entriesBySource=${sourceSum} totalEntries=${d.totalEntries} ` +
        `drift=${drift} (${(ratio * 100).toFixed(4)}%)`
    );
    if (!ok) failures++;
  }

  console.log(failures === 0 ? "\nAll verification checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 2);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
```

- [ ] **Step 4: Add the npm entries, including the three pre-existing missing ones**

In `package.json` `scripts`, add:

```json
    "backfill:klaviyo-accuracy": "tsx scripts/backfill-klaviyo-profile-accuracy.ts",
    "backfill:klaviyo-accuracy:dry": "tsx scripts/backfill-klaviyo-profile-accuracy.ts --dry-run",
    "verify:klaviyo-accuracy": "tsx scripts/verify-klaviyo-profile-accuracy.ts",
    "sync:klaviyo-profiles": "tsx scripts/sync-klaviyo-profiles.ts",
    "sync:klaviyo-profiles-bulk": "tsx scripts/sync-klaviyo-profiles-bulk.ts",
    "migrate:klaviyo-draw-properties": "tsx scripts/migrate-klaviyo-draw-properties.ts",
```

The last three scripts already exist but had no npm entry, so they were undiscoverable.

- [ ] **Step 5: Dry-run against the dev database**

Run: `npm run backfill:klaviyo-accuracy:dry`
Expected: prints the header, the profile count, `DRY RUN — would re-sync…`, exits 0. No Klaviyo traffic.

- [ ] **Step 6: Dry-run against production, then verify**

Run: `npm run backfill:klaviyo-accuracy:dry -- --prod`
Expected: `PROD|local · db="Production"` startup line, `profiles : ~56,4xx`, exits 0.

Run: `npm run verify:klaviyo-accuracy -- --prod`
Expected: `member_entries: N/N match the ledger` and one `OK` line per draw. The August draw's drift line should read ≈`0.0078%`, inside tolerance.

- [ ] **Step 7: Type-check and lint**

Run: `npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 8: Commit** *(only if authorized)*

```bash
git add scripts/backfill-klaviyo-profile-accuracy.ts scripts/verify-klaviyo-profile-accuracy.ts src/services/klaviyo/KlaviyoProfileReconciliationService.ts package.json
git commit -m "feat(klaviyo): add profile accuracy backfill and verification scripts"
```

> **The live backfill run is a deliberate, separately-authorized operational step**, not part of implementation. Run it only after the §6 pre-flight checks and with the user's explicit go-ahead.

---

## Task 10: Documentation

The doc-sync Stop hook blocks on any `src/**` or `scripts/**` change without matching docs, and CUSTOMER.md is trigger-enforced.

**Files:**
- Modify: `docs/tracking/KLAVIYO_INTEGRATION.md` and the relevant `docs/tracking/*.md`
- Modify: `docs/payment/backend.md`
- Modify: `docs/subscription/models.md`
- Modify: `docs/infrastructure/backend.md`
- Modify: `CUSTOMER.md`
- Check: `README.md` / `BUSINESS.md` against `BUSINESS_TRIGGER_GLOBS`

**Interfaces:** none.

- [ ] **Step 1: Determine exactly which docs the hook requires**

Run: `git diff --name-only main...HEAD` and map each path against the Domain Manifest in `CLAUDE.md`. Expected domains: `tracking` (klaviyo lib/utils/types/services), `payment` (`src/utils/payment/**`), `subscription` (`src/models/User.ts`, `src/utils/subscription/**`), `infrastructure` (`src/app/api/cron/**`, `scripts/**`, `package.json`, `vercel.json`, `.env.example`), `admin` (only if an admin route changed — it should not have).

- [ ] **Step 2: Update the tracking docs**

In `docs/tracking/KLAVIYO_INTEGRATION.md`, document:
- The reconciliation sweep as the **primary** delivery mechanism, and that `ensureUserProfileSynced` is best-effort only and must never be relied on for correctness.
- The property source table from §4.2 of the spec.
- That `member_entries` / `entries_purchased` / `lifetime_value` / `total_spent` now come from `PaymentEvent`, refund-netted.
- That **Klaviyo's native Historic CLV is the tiebreaker** for revenue figures.
- That `upsell_*` are retired (explicit `null`), and why.
- The rule that a profile property must never share a name with an event property.
- **Rule 11 note:** `entries_purchased` is an internal segment key and must never appear in customer-facing copy or a merge tag.
- The dev-write guard and `KLAVIYO_ALLOW_DEV_PROFILE_WRITES`.

- [ ] **Step 3: Update payment, subscription and infrastructure docs**

- `docs/payment/backend.md` — `aggregateNetGrantsByUser` / `UserGrantLedger`: what it returns, that it is refund-netted, and that it covers paid grants only.
- `docs/subscription/models.md` — the new `User.klaviyoSyncedAt` field, the `updatedAt` index, and the `pendingChange`-materialises-as-`{}` footgun with a pointer to `utils/subscription/pending-upgrade.ts`.
- `docs/infrastructure/backend.md` — the two new cron entries, the new npm scripts (including the three previously-missing ones), and the new env var.

- [ ] **Step 4: Update CUSTOMER.md (hook-enforced)**

Add to the customer-data section: the `User` model gains `klaviyoSyncedAt`, and what is sent to Klaviyo about a customer changes — entry and spend figures now reflect what was actually granted and paid rather than a catalogue estimate, and five dormant upsell-engagement properties are removed from their profile.

- [ ] **Step 5: Check the business-doc trigger**

Run: `grep -n "BUSINESS_TRIGGER_GLOBS" -A 40 .claude/hooks/doc-sync.mjs`

Compare against the changed paths. No business-level fact should flip (no tier, price, entry rule, draw cadence or access rule changes). If a changed path is in the trigger list, make a one-line clarifying touch to the relevant BUSINESS.md section to clear the block, as CLAUDE.md rule 5 prescribes.

- [ ] **Step 6: Confirm no Cobber (rule 5c) update is needed**

Nothing customer-visible changes — no feature ships or is removed, no price/tier/perk/policy changes, no flow or page moves. Record that conclusion in the PR description rather than editing the FAQ corpus.

- [ ] **Step 7: Run the full definition of done**

Run: `npm run lint && npm run type-check && npm run test:payment-grant-ledger && npm run test:klaviyo-projection && npm run test:pending-upgrade && npm run test:klaviyo-reconciliation && npm run test:klaviyo-canonical && npm run test:chat-faqs`
Expected: all pass.

- [ ] **Step 8: Commit** *(only if authorized)*

```bash
git add docs/ CUSTOMER.md
git commit -m "docs(klaviyo): document profile reconciliation sweep and ledger-sourced properties"
```

---

## Post-implementation: operational sequence

Not implementation work — do these in order, with explicit user authorization at each step.

1. **Pre-flight in Klaviyo** (spec §6): confirm the property inventory with a UI search; archive/pause the four live `[DEV]` flows; note the shortest flow time delay; tell the ads team the entry figures move.
2. **Confirm the Vercel cron limit** allows 24 entries.
3. **Merge via PR** to `main` (never push directly — `main` auto-deploys to production).
4. **Watch one live sweep cycle** — check Vercel logs for `[reconcile-klaviyo-profiles]` lines and confirm `failed: 0`.
5. **Run the backfill**: `npm run backfill:klaviyo-accuracy:dry -- --prod` first, then the live run with `KLAVIYO_ALLOW_DEV_PROFILE_WRITES=true` set explicitly for that command.
6. **Verify**: `npm run verify:klaviyo-accuracy -- --prod`.
7. **Re-check the two reference customers** — Kellie `6a8e1deb316a961f204a7888` should show `accumulated_entries: 150`, `current_draw_entries: 150`, `giveaways_entered: 1`, `member_entries: 150`, `subscription_has_pending_upgrade: false`.
8. **Tune** `BACKLOG_ALERT_THRESHOLD` and `BACKLOG_ALERT_THRESHOLD` after a week of real readings.
9. **File the two deferred tickets**: the 769-customer entry-accounting divergence, and mounting the upsell tracker (or deleting `UpsellManager.tsx`).
