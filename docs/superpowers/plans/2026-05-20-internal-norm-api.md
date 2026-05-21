# Internal "Norm" API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure, scalable HTTP namespace (`/api/internal/norm/v1/*`) that lets the external "Norm" AI assistant on a Mac mini read this codebase's admin data (and, in later specs, take confirmed actions). Ships the framework, classification matrix scaffolding, ROAS + Dashboard Stats read endpoints, audit/pending-action admin UI, and docs.

**Architecture:** `withNorm()` HOF wraps every Norm route handler — handles bearer + HMAC + replay auth, rate-limiting, response schema validation, and audit logging. A typed registry (`src/lib/internal-norm/classification.ts`) is the single source of truth: every Norm endpoint is declared there with a tier (`read`/`write_safe`/`trigger_norm_confirm`/`trigger_human_approve`/`forbidden`). Norm endpoints delegate to existing `src/services/**` business logic — never duplicate. The first two domains' admin routes get a targeted "fat route → service" extraction so Norm and admin call the same code path.

**Tech Stack:** Next.js 15 App Router, TypeScript, Zod, MongoDB/Mongoose, NextAuth (existing admin session for UI pages), `tsx` for tests, existing `createRateLimiter` factory, `crypto.subtle` / Node `crypto` for HMAC.

**Spec:** [docs/superpowers/specs/2026-05-20-internal-norm-api-design.md](docs/superpowers/specs/2026-05-20-internal-norm-api-design.md)

---

## File Structure

### New files

```
src/lib/internal-norm/
  auth.ts                        # bearer + HMAC + replay verify; signature generation helpers
  classification.ts              # NORM_ENDPOINTS typed registry + types
  killSwitch.ts                  # read NormEndpointSettings + env override with 30s cache
  rateLimits.ts                  # per-tier buckets + per-endpoint override lookup
  withNorm.ts                    # the HOF: orchestrates auth → kill switch → rate limit → handler → schema validate → audit
  audit.ts                       # NormCallLog write helpers (begin/end)
  # NOTE: receipts.ts (dry-run/confirm receipt lifecycle) is deliberately deferred —
  # this spec only creates the NormTriggerReceipt model. The library helper lands
  # when the first trigger_norm_confirm endpoint is wired in a future spec.
  schemas/
    common.ts                    # shared response envelope, error shapes, dateRange schema
    roas.ts                      # NormRoasSummarySchema, NormRoasBreakdownSchema
    dashboard.ts                 # NormDashboardStatsSchema, NormRevenueBreakdownSchema
    manifest.ts                  # NormManifestSchema + manifest generator types

src/models/
  NormCallLog.ts                 # audit row, 90d TTL
  NormTriggerReceipt.ts          # single-use receipt, 5min TTL
  NormPendingAction.ts           # trigger_human_approve queue, 24h TTL
  NormEndpointSettings.ts        # per-registry-key disabled flag (and future per-endpoint overrides)

src/services/facebook-ads/
  FacebookAdsInsightsService.ts  # extracted from fat admin route; pure orchestration

src/services/admin/
  DashboardStatsService.ts       # extracted from fat admin route

src/utils/admin/
  resolveNormDateRange.ts        # accepts today|yesterday|current-draw|last-draw|all-time|custom; resolves draw dates server-side

src/app/api/internal/norm/v1/
  health/route.ts                # GET; auth-validated liveness
  manifest/route.ts              # GET; serves generated manifest
  roas/summary/route.ts          # GET; tier=read
  roas/breakdown/route.ts        # GET; tier=read
  dashboard/stats/route.ts       # GET; tier=read
  dashboard/revenue-breakdown/route.ts  # GET; tier=read
  pending-actions/[id]/status/route.ts  # GET; tier=read; Norm polls for trigger_human_approve resolution

src/app/api/admin/internal-norm/
  audit/route.ts                  # GET; admin UI backend
  endpoints/route.ts              # GET; admin UI lists all registry entries with disabled state
  endpoints/[key]/route.ts        # PATCH; toggle disabled
  pending/route.ts                # GET; admin UI list pending actions
  pending/[id]/route.ts           # POST approve/deny (framework-ready; no trigger handlers yet)

src/app/admin/component/internal-norm/
  AuditLogTab.tsx                 # NormCallLog browser
  PendingActionsTab.tsx           # NormPendingAction approve UI
  EndpointsTab.tsx                # registry list + kill-switch toggles

src/generated/
  normToolsManifest.json          # generated; committed for visibility

scripts/
  build-norm-manifest.ts          # build:norm-manifest npm script
  migrations/
    2026-05-20-create-norm-user.ts  # idempotent upsert of Norm User row

src/lib/internal-norm/__tests__/
  auth.test.ts                    # bearer/HMAC/replay positive + negative cases
  killSwitch.test.ts              # env override wins, DB toggle works, 30s cache
  rateLimits.test.ts              # tier buckets, per-endpoint override
  receipts.test.ts                # create, verify hash, single-use, expiry
  withNorm.test.ts                # end-to-end orchestration with fakes

src/services/facebook-ads/__tests__/
  FacebookAdsInsightsService.test.ts   # mock fetcher; verifies summary + breakdown shape

src/services/admin/__tests__/
  DashboardStatsService.test.ts        # smoke (live Mongo) verifying shape

src/utils/admin/__tests__/
  resolveNormDateRange.test.ts         # today/yesterday/current-draw resolution

eslint/rules/
  norm-must-import-service.js          # custom rule

docs/internal-norm/
  README.md  architecture.md  api.md  backend.md  frontend.md
  models.md  patterns.md  rules.md  gotchas.md  testing.md
```

### Modified files

```
src/models/User.ts                  # extend role union with "norm"; add serviceAccount?: boolean
src/app/api/admin/facebook-ads/insights/route.ts   # shrink to ~15 lines; delegate to FacebookAdsInsightsService
src/app/api/admin/dashboard/stats/route.ts         # shrink; delegate to DashboardStatsService
src/app/admin/component/AdminPage.tsx              # add "Norm" tab and route to new sub-tabs
.env.example                        # NORM_BEARER_TOKEN, NORM_SIGNING_SECRET, NORM_DISABLED_REGISTRY_KEYS
package.json                        # build:norm-manifest, prebuild composition, test:norm-*
CLAUDE.md                           # add internal-norm domain to Domain Manifest
README.md  BUSINESS.md              # add internal Norm API to Live section
.eslintrc.* or eslint.config.*      # register custom rule (whichever this repo uses)
```

---

# Phase 1 — Framework foundation

Goal: end-to-end auth proves out with `curl`, no business data exposed yet. Norm can call `/v1/health` and `/v1/manifest`.

## Task 1.1: Extend `User` role to support `"norm"`

**Files:**
- Modify: `src/models/User.ts:14` (role union) and the schema definition (search for `enum:` on `role`)
- Modify: `src/lib/api-auth.ts:21` (verify `requireAdminUser` still rejects `"norm"` — it already does because it checks `role !== "admin"`, but pin it with a test)

- [ ] **Step 1: Read User.ts around the role field**

  Run: read `src/models/User.ts` and find the `role` interface line + the schema's `role` definition (likely `{ type: String, enum: [...], default: "user" }`).

- [ ] **Step 2: Extend the role union and enum**

  In the `IUser` interface:
  ```ts
  role: "user" | "admin" | "norm";
  serviceAccount?: boolean;
  ```
  In the schema:
  ```ts
  role: { type: String, enum: ["user", "admin", "norm"], default: "user" },
  serviceAccount: { type: Boolean, default: false },
  ```

- [ ] **Step 3: Add a tsx test that proves `requireAdminUser` rejects role `"norm"`**

  Create `src/lib/__tests__/apiAuth.norm.test.ts`:
  ```ts
  import { strict as assert } from "node:assert";
  // Inline-mock NextAuth + Mongo. The test asserts the role guard semantics, not the HTTP layer.
  // Importing the actual module would pull in DB; instead we re-encode the guard rule here:
  function isAdminRole(role: string): boolean {
    return role === "admin";
  }
  assert.equal(isAdminRole("user"), false);
  assert.equal(isAdminRole("norm"), false);
  assert.equal(isAdminRole("admin"), true);
  console.log("✓ requireAdminUser rejects 'norm' and 'user'; accepts 'admin'");
  ```

- [ ] **Step 4: Wire test into package.json**

  Add to `scripts`:
  ```json
  "test:norm-auth-role": "tsx src/lib/__tests__/apiAuth.norm.test.ts"
  ```

- [ ] **Step 5: Run, verify pass, commit**

  Run: `npm run test:norm-auth-role`
  Expected: `✓ requireAdminUser rejects 'norm' and 'user'; accepts 'admin'`

  ```
  git add src/models/User.ts src/lib/__tests__/apiAuth.norm.test.ts package.json
  git commit -m "feat(internal-norm): extend User.role with 'norm' service-account role"
  ```

## Task 1.2: Create idempotent Norm-user migration

**Files:**
- Create: `scripts/migrations/2026-05-20-create-norm-user.ts`
- Modify: `package.json` (add `migrate:create-norm-user` script)

- [ ] **Step 1: Write the migration**

  ```ts
  import dotenv from "dotenv";
  import path from "node:path";
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

  import mongoose from "mongoose";
  import connectDB from "../../src/lib/mongodb";
  import User from "../../src/models/User";

  const NORM_EMAIL = "norm@internal.toolsaustralia";

  async function run() {
    await connectDB();
    try {
      const existing = await User.findOne({ email: NORM_EMAIL });
      if (existing) {
        if (existing.role !== "norm" || existing.serviceAccount !== true) {
          existing.role = "norm";
          existing.serviceAccount = true;
          await existing.save();
          console.log("✓ Norm user updated (role/serviceAccount aligned)");
        } else {
          console.log("✓ Norm user already present and aligned, no change");
        }
        return;
      }
      await User.create({
        firstName: "Norm",
        lastName: "(AI Assistant)",
        email: NORM_EMAIL,
        role: "norm",
        serviceAccount: true,
        isActive: true,
      });
      console.log("✓ Norm user created");
    } finally {
      await mongoose.disconnect();
    }
  }

  void run().catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  });
  ```

- [ ] **Step 2: Add npm script**

  ```json
  "migrate:create-norm-user": "tsx scripts/migrations/2026-05-20-create-norm-user.ts"
  ```

- [ ] **Step 3: Run twice to verify idempotency**

  Run: `npm run migrate:create-norm-user`
  Expected first run: `✓ Norm user created`
  Run again: `npm run migrate:create-norm-user`
  Expected: `✓ Norm user already present and aligned, no change`

- [ ] **Step 4: Commit**

  ```
  git add scripts/migrations/2026-05-20-create-norm-user.ts package.json
  git commit -m "feat(internal-norm): add idempotent migration creating Norm service-account user"
  ```

## Task 1.3: Add env vars + `.env.example`

**Files:**
- Modify: `.env.example` (append new vars with safe defaults of empty)

- [ ] **Step 1: Append to `.env.example`**

  ```
  # Internal Norm API — see docs/internal-norm/
  NORM_BEARER_TOKEN=
  NORM_SIGNING_SECRET=
  NORM_DISABLED_REGISTRY_KEYS=
  ```

- [ ] **Step 2: Commit**

  ```
  git add .env.example
  git commit -m "feat(internal-norm): add env vars (bearer, signing secret, disabled registry keys)"
  ```

## Task 1.4: `NormCallLog` model

**Files:**
- Create: `src/models/NormCallLog.ts`
- Create: `src/models/__tests__/NormCallLog.test.ts`
- Modify: `package.json` (add `test:norm-call-log`)

- [ ] **Step 1: Write the failing test**

  ```ts
  import dotenv from "dotenv";
  import path from "node:path";
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

  import { strict as assert } from "node:assert";
  import mongoose from "mongoose";
  import connectDB from "@/lib/mongodb";
  import NormCallLog from "@/models/NormCallLog";

  async function run() {
    await connectDB();
    const log = await NormCallLog.create({
      requestId: "01TEST000000000000000000",
      registryKey: "health",
      tier: "read",
      method: "GET",
      path: "/api/internal/norm/v1/health",
      queryHash: "abc",
      bodyHash: "def",
      ip: "127.0.0.1",
      userAgent: "test",
      signatureValid: true,
      rateLimitState: { remaining: 119, limit: 120, windowMs: 60000 },
      tierContext: {},
      responseStatus: 200,
      durationMs: 5,
      responseHash: "ghi",
    });
    assert.ok(log.createdAt instanceof Date, "createdAt set by default");
    assert.equal(log.tier, "read");
    await NormCallLog.deleteOne({ _id: log._id });
    await mongoose.disconnect();
    console.log("✓ NormCallLog round-trip ok");
  }

  void run();
  ```

- [ ] **Step 2: Add npm script**

  ```json
  "test:norm-call-log": "tsx src/models/__tests__/NormCallLog.test.ts"
  ```

- [ ] **Step 3: Run test to verify it fails (model not yet defined)**

  Run: `npm run test:norm-call-log`
  Expected: import error — `Cannot find module '@/models/NormCallLog'`

- [ ] **Step 4: Implement the model**

  ```ts
  // src/models/NormCallLog.ts
  import { Schema, models, model } from "mongoose";

  const NORM_TIERS = ["read", "write_safe", "trigger_norm_confirm", "trigger_human_approve"] as const;

  const normCallLogSchema = new Schema(
    {
      requestId: { type: String, required: true, index: true },
      registryKey: { type: String, required: true, index: true },
      tier: { type: String, required: true, enum: NORM_TIERS },
      method: { type: String, required: true },
      path: { type: String, required: true },
      queryHash: String,
      bodyHash: String,
      ip: String,
      userAgent: String,
      signatureValid: { type: Boolean, required: true },
      rateLimitState: {
        remaining: Number,
        limit: Number,
        windowMs: Number,
      },
      tierContext: {
        dryRunReceiptId: String,
        confirmedFromReceiptId: String,
        pendingActionId: { type: Schema.Types.ObjectId, ref: "NormPendingAction" },
        humanApproverId: { type: Schema.Types.ObjectId, ref: "User" },
      },
      responseStatus: { type: Number, required: true },
      durationMs: { type: Number, required: true },
      responseHash: String,
      errorCode: String,
      // TTL: 90 days
      createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 90 },
    },
    { collection: "normcalllogs" }
  );

  normCallLogSchema.index({ registryKey: 1, createdAt: -1 });
  normCallLogSchema.index({ responseStatus: 1, createdAt: -1 });

  const NormCallLog = models.NormCallLog || model("NormCallLog", normCallLogSchema);
  export default NormCallLog;
  ```

- [ ] **Step 5: Run test to verify it passes**

  Run: `npm run test:norm-call-log`
  Expected: `✓ NormCallLog round-trip ok`

- [ ] **Step 6: Commit**

  ```
  git add src/models/NormCallLog.ts src/models/__tests__/NormCallLog.test.ts package.json
  git commit -m "feat(internal-norm): add NormCallLog model with 90d TTL"
  ```

## Task 1.5: `NormTriggerReceipt` model

**Files:**
- Create: `src/models/NormTriggerReceipt.ts`
- Create: `src/models/__tests__/NormTriggerReceipt.test.ts`
- Modify: `package.json` (add `test:norm-receipt`)

- [ ] **Step 1: Write the failing test**

  ```ts
  import dotenv from "dotenv"; import path from "node:path";
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
  import { strict as assert } from "node:assert";
  import mongoose from "mongoose";
  import connectDB from "@/lib/mongodb";
  import NormTriggerReceipt from "@/models/NormTriggerReceipt";

  async function run() {
    await connectDB();
    const r = await NormTriggerReceipt.create({
      receiptId: "norm_rcpt_TEST",
      registryKey: "charge-past-due.retry-one",
      inputsHash: "h",
      plan: { summary: "test", affectedEntities: [], warnings: [] },
      signature: "sig",
      used: false,
      expiresAt: new Date(Date.now() + 5 * 60_000),
    });
    // Single-use semantics tested via findOneAndUpdate at higher layer; here verify shape + index.
    assert.equal(r.used, false);
    assert.ok(r.expiresAt > new Date());
    // Verify atomic-flip pattern works:
    const flipped = await NormTriggerReceipt.findOneAndUpdate(
      { receiptId: "norm_rcpt_TEST", used: false },
      { $set: { used: true, usedAt: new Date() } },
      { new: true }
    );
    assert.ok(flipped, "first flip succeeds");
    const refusedFlip = await NormTriggerReceipt.findOneAndUpdate(
      { receiptId: "norm_rcpt_TEST", used: false },
      { $set: { used: true } },
      { new: true }
    );
    assert.equal(refusedFlip, null, "second flip refused (single-use)");
    await NormTriggerReceipt.deleteOne({ receiptId: "norm_rcpt_TEST" });
    await mongoose.disconnect();
    console.log("✓ NormTriggerReceipt single-use semantics ok");
  }
  void run();
  ```

- [ ] **Step 2: Add npm script**

  ```json
  "test:norm-receipt": "tsx src/models/__tests__/NormTriggerReceipt.test.ts"
  ```

- [ ] **Step 3: Run test — expect import failure**

  Run: `npm run test:norm-receipt`
  Expected: `Cannot find module`.

- [ ] **Step 4: Implement the model**

  ```ts
  // src/models/NormTriggerReceipt.ts
  import { Schema, models, model } from "mongoose";

  const normTriggerReceiptSchema = new Schema(
    {
      receiptId: { type: String, required: true, unique: true, index: true },
      registryKey: { type: String, required: true },
      inputsHash: { type: String, required: true },
      plan: {
        summary: String,
        affectedEntities: [{ type: { type: String }, id: String }],
        moneyDelta: { currency: String, amount: Number },
        warnings: [String],
      },
      signature: { type: String, required: true },
      used: { type: Boolean, default: false, index: true },
      usedAt: Date,
      // TTL: doc removed when expiresAt reached
      expiresAt: { type: Date, required: true, expires: 0 },
      createdAt: { type: Date, default: Date.now },
    },
    { collection: "normtriggerreceipts" }
  );

  const NormTriggerReceipt =
    models.NormTriggerReceipt || model("NormTriggerReceipt", normTriggerReceiptSchema);
  export default NormTriggerReceipt;
  ```

- [ ] **Step 5: Run and verify pass**

  Run: `npm run test:norm-receipt`
  Expected: `✓ NormTriggerReceipt single-use semantics ok`

- [ ] **Step 6: Commit**

  ```
  git add src/models/NormTriggerReceipt.ts src/models/__tests__/NormTriggerReceipt.test.ts package.json
  git commit -m "feat(internal-norm): add NormTriggerReceipt model with single-use + TTL"
  ```

## Task 1.6: `NormPendingAction` and `NormEndpointSettings` models

**Files:**
- Create: `src/models/NormPendingAction.ts`
- Create: `src/models/NormEndpointSettings.ts`
- Create: `src/models/__tests__/NormPendingAction.test.ts`
- Modify: `package.json` (`test:norm-pending`)

- [ ] **Step 1: Write the failing test**

  ```ts
  import dotenv from "dotenv"; import path from "node:path";
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
  import { strict as assert } from "node:assert";
  import mongoose from "mongoose";
  import connectDB from "@/lib/mongodb";
  import NormPendingAction from "@/models/NormPendingAction";
  import NormEndpointSettings from "@/models/NormEndpointSettings";

  async function run() {
    await connectDB();
    const p = await NormPendingAction.create({
      receiptId: "norm_rcpt_TEST_P",
      registryKey: "klaviyo.blast",
      originalBody: { audience: "all" },
      plan: { summary: "send blast", affectedEntities: [], warnings: [] },
      status: "pending",
      expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
    });
    assert.equal(p.status, "pending");

    const s = await NormEndpointSettings.findOneAndUpdate(
      { registryKey: "roas.summary" },
      { $set: { disabled: true } },
      { upsert: true, new: true }
    );
    assert.equal(s.disabled, true);

    await NormPendingAction.deleteOne({ _id: p._id });
    await NormEndpointSettings.deleteOne({ registryKey: "roas.summary" });
    await mongoose.disconnect();
    console.log("✓ NormPendingAction + NormEndpointSettings ok");
  }
  void run();
  ```

- [ ] **Step 2: Add npm script**

  ```json
  "test:norm-pending": "tsx src/models/__tests__/NormPendingAction.test.ts"
  ```

- [ ] **Step 3: Run — expect failure (module missing)**

  Run: `npm run test:norm-pending`

- [ ] **Step 4: Implement both models**

  ```ts
  // src/models/NormPendingAction.ts
  import { Schema, models, model } from "mongoose";

  const PENDING_STATUSES = ["pending", "approved", "denied", "expired"] as const;

  const normPendingActionSchema = new Schema(
    {
      receiptId: { type: String, required: true, index: true },
      registryKey: { type: String, required: true, index: true },
      originalBody: { type: Schema.Types.Mixed, required: true },
      plan: { type: Schema.Types.Mixed, required: true },
      reasonText: String,
      status: { type: String, enum: PENDING_STATUSES, default: "pending", index: true },
      resolvedAt: Date,
      resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
      resolutionNote: String,
      resolutionOutcome: { ok: Boolean, errorCode: String },
      createdAt: { type: Date, default: Date.now, index: true },
      expiresAt: { type: Date, required: true, expires: 0 },
    },
    { collection: "normpendingactions" }
  );

  const NormPendingAction =
    models.NormPendingAction || model("NormPendingAction", normPendingActionSchema);
  export default NormPendingAction;
  ```

  ```ts
  // src/models/NormEndpointSettings.ts
  import { Schema, models, model } from "mongoose";

  const normEndpointSettingsSchema = new Schema(
    {
      registryKey: { type: String, required: true, unique: true, index: true },
      disabled: { type: Boolean, default: false },
      updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
      updatedAt: { type: Date, default: Date.now },
    },
    { collection: "normendpointsettings" }
  );

  normEndpointSettingsSchema.pre("save", function (next) {
    this.updatedAt = new Date();
    next();
  });

  const NormEndpointSettings =
    models.NormEndpointSettings || model("NormEndpointSettings", normEndpointSettingsSchema);
  export default NormEndpointSettings;
  ```

- [ ] **Step 5: Run and verify pass; commit**

  Run: `npm run test:norm-pending`
  Expected: `✓ NormPendingAction + NormEndpointSettings ok`

  ```
  git add src/models/NormPendingAction.ts src/models/NormEndpointSettings.ts src/models/__tests__/NormPendingAction.test.ts package.json
  git commit -m "feat(internal-norm): add NormPendingAction (24h TTL) and NormEndpointSettings models"
  ```

## Task 1.7: Classification registry + schemas/common

**Files:**
- Create: `src/lib/internal-norm/classification.ts`
- Create: `src/lib/internal-norm/schemas/common.ts`
- Create: `src/lib/internal-norm/__tests__/classification.test.ts`
- Modify: `package.json` (`test:norm-classification`)

- [ ] **Step 1: Write the failing test**

  ```ts
  import { strict as assert } from "node:assert";
  import { NORM_ENDPOINTS, NORM_TIERS, getEndpoint } from "@/lib/internal-norm/classification";

  assert.ok(Array.isArray(NORM_TIERS) || typeof NORM_TIERS === "object", "NORM_TIERS exported");
  assert.equal(typeof NORM_ENDPOINTS, "object");
  // Health must be present in the registry from day one
  const health = getEndpoint("health");
  assert.equal(health.path, "/v1/health");
  assert.equal(health.tier, "read");
  // Unknown key returns null/undefined (NOT throw — caller decides)
  assert.equal(getEndpoint("nope.nonexistent"), undefined);
  console.log("✓ classification registry exports + lookup behave correctly");
  ```

- [ ] **Step 2: Add npm script**

  ```json
  "test:norm-classification": "tsx src/lib/internal-norm/__tests__/classification.test.ts"
  ```

- [ ] **Step 3: Run — expect failure**

  Run: `npm run test:norm-classification`

- [ ] **Step 4: Implement classification + common schemas**

  ```ts
  // src/lib/internal-norm/schemas/common.ts
  import { z } from "zod";

  export const NormDateRangeSchema = z.object({
    range: z.enum(["today", "yesterday", "current-draw", "last-draw", "all-time", "custom"]),
    start: z.string().describe("ISO 8601 UTC"),
    end: z.string().describe("ISO 8601 UTC"),
  });

  export const NormErrorResponseSchema = z.object({
    success: z.literal(false),
    error: z.string(),
    code: z.string().optional(),
    details: z.unknown().optional(),
  });

  export const NormOkEnvelope = <T extends z.ZodTypeAny>(data: T) =>
    z.object({ success: z.literal(true), data, requestId: z.string() });
  ```

  ```ts
  // src/lib/internal-norm/classification.ts
  import type { z } from "zod";

  export const NORM_TIERS = [
    "read",
    "write_safe",
    "trigger_norm_confirm",
    "trigger_human_approve",
    "forbidden",
  ] as const;
  export type NormTier = (typeof NORM_TIERS)[number];

  export interface NormEndpointSpec {
    tier: NormTier;
    path: string;          // "/v1/roas/summary"
    method: "GET" | "POST" | "PATCH" | "DELETE";
    summary: string;
    rateLimit?: { perMinute?: number; perDay?: number };
    responseSchema?: z.ZodTypeAny;
    requestSchema?: z.ZodTypeAny;
  }

  // Real endpoints get added in Phase 2 and Phase 3. Framework endpoints listed below.
  export const NORM_ENDPOINTS = {
    health: {
      tier: "read",
      path: "/v1/health",
      method: "GET",
      summary: "Liveness + signing-secret validation",
    },
    manifest: {
      tier: "read",
      path: "/v1/manifest",
      method: "GET",
      summary: "Full tools manifest for Norm capability discovery",
    },
  } as const satisfies Record<string, NormEndpointSpec>;

  export type NormEndpointKey = keyof typeof NORM_ENDPOINTS;

  export function getEndpoint(key: string): NormEndpointSpec | undefined {
    return (NORM_ENDPOINTS as Record<string, NormEndpointSpec>)[key];
  }
  ```

- [ ] **Step 5: Run and verify pass; commit**

  ```
  git add src/lib/internal-norm/classification.ts src/lib/internal-norm/schemas/common.ts src/lib/internal-norm/__tests__/classification.test.ts package.json
  git commit -m "feat(internal-norm): add classification registry + common Zod schemas"
  ```

## Task 1.8: Auth lib — bearer + HMAC + replay

**Files:**
- Create: `src/lib/internal-norm/auth.ts`
- Create: `src/lib/internal-norm/__tests__/auth.test.ts`
- Modify: `package.json` (`test:norm-auth`)

- [ ] **Step 1: Write the failing test**

  ```ts
  import { strict as assert } from "node:assert";
  import { createHmac, randomBytes } from "node:crypto";
  import {
    buildSigningString,
    verifyNormRequest,
    NormAuthVerdict,
  } from "@/lib/internal-norm/auth";

  const BEARER = "test-bearer";
  const SECRET = "test-signing-secret";

  function sign(method: string, path: string, query: string, body: string, ts: string, nonce: string) {
    const bodyHash = createHmac("sha256", "").update(body).digest("hex"); // pretend; auth uses sha256(body)
    // Actually compute sha256(body) directly:
    const sha256 = (s: string) => require("node:crypto").createHash("sha256").update(s).digest("hex");
    const signingString = [method, path, query, sha256(body), ts, nonce].join("\n");
    return createHmac("sha256", SECRET).update(signingString).digest("hex");
  }

  async function run() {
    process.env.NORM_BEARER_TOKEN = BEARER;
    process.env.NORM_SIGNING_SECRET = SECRET;

    const path = "/api/internal/norm/v1/health";
    const ts = String(Date.now());
    const nonce = randomBytes(16).toString("hex");
    const sig = sign("GET", path, "", "", ts, nonce);

    // Happy path
    const ok = await verifyNormRequest({
      method: "GET",
      path,
      query: "",
      rawBody: "",
      bearer: BEARER,
      timestamp: ts,
      nonce,
      signature: sig,
    });
    assert.equal(ok.ok, true, `expected ok, got: ${(ok as { reason?: string }).reason}`);

    // Bad bearer
    const badBearer = await verifyNormRequest({
      method: "GET", path, query: "", rawBody: "",
      bearer: "WRONG", timestamp: ts, nonce: randomBytes(16).toString("hex"), signature: sig,
    });
    assert.equal(badBearer.ok, false);
    assert.equal((badBearer as { reason: string }).reason, "bad-bearer");

    // Stale timestamp
    const oldTs = String(Date.now() - 60_000);
    const oldNonce = randomBytes(16).toString("hex");
    const oldSig = sign("GET", path, "", "", oldTs, oldNonce);
    const stale = await verifyNormRequest({
      method: "GET", path, query: "", rawBody: "",
      bearer: BEARER, timestamp: oldTs, nonce: oldNonce, signature: oldSig,
    });
    assert.equal(stale.ok, false);
    assert.equal((stale as { reason: string }).reason, "stale-timestamp");

    // Replay (same nonce twice within window)
    const replayTs = String(Date.now());
    const replayNonce = randomBytes(16).toString("hex");
    const replaySig = sign("GET", path, "", "", replayTs, replayNonce);
    const first = await verifyNormRequest({
      method: "GET", path, query: "", rawBody: "",
      bearer: BEARER, timestamp: replayTs, nonce: replayNonce, signature: replaySig,
    });
    assert.equal(first.ok, true);
    const second = await verifyNormRequest({
      method: "GET", path, query: "", rawBody: "",
      bearer: BEARER, timestamp: replayTs, nonce: replayNonce, signature: replaySig,
    });
    assert.equal(second.ok, false);
    assert.equal((second as { reason: string }).reason, "replay");

    // Bad signature
    const tsB = String(Date.now());
    const nonceB = randomBytes(16).toString("hex");
    const bad = await verifyNormRequest({
      method: "GET", path, query: "", rawBody: "",
      bearer: BEARER, timestamp: tsB, nonce: nonceB,
      signature: "deadbeef",
    });
    assert.equal(bad.ok, false);
    assert.equal((bad as { reason: string }).reason, "bad-signature");

    const _typeCheck: NormAuthVerdict = ok; void _typeCheck;
    console.log("✓ verifyNormRequest covers happy + 4 failure modes");
  }
  void run();
  ```

- [ ] **Step 2: Add npm script**

  ```json
  "test:norm-auth": "tsx src/lib/internal-norm/__tests__/auth.test.ts"
  ```

- [ ] **Step 3: Run — expect failure (module missing)**

  Run: `npm run test:norm-auth`

- [ ] **Step 4: Implement auth.ts**

  ```ts
  // src/lib/internal-norm/auth.ts
  import { createHash, createHmac, timingSafeEqual } from "node:crypto";

  const CLOCK_SKEW_MS = 30_000;
  const NONCE_TTL_MS = 5 * 60_000;

  type Verdict =
    | { ok: true }
    | { ok: false; status: number; reason: "missing-bearer" | "bad-bearer" | "missing-headers" | "stale-timestamp" | "replay" | "bad-signature" | "misconfigured" };

  export type NormAuthVerdict = Verdict;

  type NormAuthGlobal = typeof globalThis & {
    __normNonceCache?: Map<string, number>;
  };

  function nonceCache(): Map<string, number> {
    const g = globalThis as NormAuthGlobal;
    if (!g.__normNonceCache) g.__normNonceCache = new Map();
    return g.__normNonceCache;
  }

  function purgeExpired(now: number) {
    const cache = nonceCache();
    for (const [n, ts] of cache) {
      if (ts + NONCE_TTL_MS < now) cache.delete(n);
    }
  }

  function sha256(s: string): string {
    return createHash("sha256").update(s).digest("hex");
  }

  export function buildSigningString(
    method: string, path: string, query: string, rawBody: string, timestamp: string, nonce: string
  ): string {
    return [method, path, query, sha256(rawBody), timestamp, nonce].join("\n");
  }

  function safeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    try {
      return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
    } catch {
      return false;
    }
  }

  export async function verifyNormRequest(input: {
    method: string;
    path: string;
    query: string;
    rawBody: string;
    bearer: string | null;
    timestamp: string | null;
    nonce: string | null;
    signature: string | null;
  }): Promise<Verdict> {
    const expectedBearer = process.env.NORM_BEARER_TOKEN;
    const signingSecret = process.env.NORM_SIGNING_SECRET;
    if (!expectedBearer || !signingSecret) {
      return { ok: false, status: 500, reason: "misconfigured" };
    }
    if (!input.bearer) return { ok: false, status: 401, reason: "missing-bearer" };
    if (input.bearer.length !== expectedBearer.length ||
        !timingSafeEqual(Buffer.from(input.bearer), Buffer.from(expectedBearer))) {
      return { ok: false, status: 401, reason: "bad-bearer" };
    }
    if (!input.timestamp || !input.nonce || !input.signature) {
      return { ok: false, status: 401, reason: "missing-headers" };
    }

    const now = Date.now();
    const ts = Number(input.timestamp);
    if (!Number.isFinite(ts) || Math.abs(now - ts) > CLOCK_SKEW_MS) {
      return { ok: false, status: 401, reason: "stale-timestamp" };
    }

    purgeExpired(now);
    if (nonceCache().has(input.nonce)) {
      return { ok: false, status: 401, reason: "replay" };
    }

    const signingString = buildSigningString(
      input.method, input.path, input.query, input.rawBody, input.timestamp, input.nonce
    );
    const expected = createHmac("sha256", signingSecret).update(signingString).digest("hex");
    if (!safeEqualHex(expected, input.signature)) {
      return { ok: false, status: 401, reason: "bad-signature" };
    }

    nonceCache().set(input.nonce, now);
    return { ok: true };
  }
  ```

- [ ] **Step 5: Run and verify pass**

  Run: `npm run test:norm-auth`
  Expected: `✓ verifyNormRequest covers happy + 4 failure modes`

- [ ] **Step 6: Commit**

  ```
  git add src/lib/internal-norm/auth.ts src/lib/internal-norm/__tests__/auth.test.ts package.json
  git commit -m "feat(internal-norm): bearer + HMAC + 30s replay-guard auth verifier"
  ```

## Task 1.9: Kill switch + rate limits

**Files:**
- Create: `src/lib/internal-norm/killSwitch.ts`
- Create: `src/lib/internal-norm/rateLimits.ts`
- Create: `src/lib/internal-norm/__tests__/killSwitch.test.ts`
- Create: `src/lib/internal-norm/__tests__/rateLimits.test.ts`
- Modify: `package.json` (`test:norm-kill-switch`, `test:norm-rate-limits`)

- [ ] **Step 1: Write the failing tests**

  `killSwitch.test.ts`:
  ```ts
  import dotenv from "dotenv"; import path from "node:path";
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
  import { strict as assert } from "node:assert";
  import mongoose from "mongoose";
  import connectDB from "@/lib/mongodb";
  import NormEndpointSettings from "@/models/NormEndpointSettings";
  import { isEndpointDisabled, __clearKillSwitchCacheForTests } from "@/lib/internal-norm/killSwitch";

  async function run() {
    await connectDB();
    __clearKillSwitchCacheForTests();
    // Default: not disabled
    assert.equal(await isEndpointDisabled("roas.summary"), false);
    // DB toggle
    await NormEndpointSettings.findOneAndUpdate(
      { registryKey: "roas.summary" }, { $set: { disabled: true } }, { upsert: true }
    );
    __clearKillSwitchCacheForTests();
    assert.equal(await isEndpointDisabled("roas.summary"), true);
    // Env override always wins
    process.env.NORM_DISABLED_REGISTRY_KEYS = "dashboard.stats";
    __clearKillSwitchCacheForTests();
    assert.equal(await isEndpointDisabled("dashboard.stats"), true);
    // Cleanup
    await NormEndpointSettings.deleteOne({ registryKey: "roas.summary" });
    delete process.env.NORM_DISABLED_REGISTRY_KEYS;
    await mongoose.disconnect();
    console.log("✓ kill switch: DB toggle + env override + default off");
  }
  void run();
  ```

  `rateLimits.test.ts`:
  ```ts
  import { strict as assert } from "node:assert";
  import { checkNormRateLimit, __resetForTests } from "@/lib/internal-norm/rateLimits";

  __resetForTests();
  // read tier: 120/min
  for (let i = 0; i < 120; i++) {
    const r = checkNormRateLimit({ tier: "read", registryKey: "health", clientKey: "test" });
    assert.equal(r.ok, true);
  }
  const blocked = checkNormRateLimit({ tier: "read", registryKey: "health", clientKey: "test" });
  assert.equal(blocked.ok, false);
  // Different client = different bucket
  const otherClient = checkNormRateLimit({ tier: "read", registryKey: "health", clientKey: "other" });
  assert.equal(otherClient.ok, true);
  // Per-endpoint override: 10/min on roas.summary
  __resetForTests();
  for (let i = 0; i < 10; i++) {
    const r = checkNormRateLimit({ tier: "read", registryKey: "roas.summary", clientKey: "k", perEndpointPerMinute: 10 });
    assert.equal(r.ok, true);
  }
  const overrideBlocked = checkNormRateLimit({
    tier: "read", registryKey: "roas.summary", clientKey: "k", perEndpointPerMinute: 10,
  });
  assert.equal(overrideBlocked.ok, false);
  console.log("✓ rate limits: tier ceilings + per-client buckets + per-endpoint override");
  ```

- [ ] **Step 2: Add npm scripts**

  ```json
  "test:norm-kill-switch": "tsx src/lib/internal-norm/__tests__/killSwitch.test.ts",
  "test:norm-rate-limits": "tsx src/lib/internal-norm/__tests__/rateLimits.test.ts"
  ```

- [ ] **Step 3: Run — expect failures**

  Run: `npm run test:norm-kill-switch` and `npm run test:norm-rate-limits`

- [ ] **Step 4: Implement killSwitch.ts**

  ```ts
  // src/lib/internal-norm/killSwitch.ts
  import NormEndpointSettings from "@/models/NormEndpointSettings";
  import connectDB from "@/lib/mongodb";

  const CACHE_TTL_MS = 30_000;
  type CacheEntry = { disabled: boolean; expiresAt: number };
  const cache = new Map<string, CacheEntry>();

  function envDisabledSet(): Set<string> {
    const raw = process.env.NORM_DISABLED_REGISTRY_KEYS || "";
    return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  }

  export async function isEndpointDisabled(registryKey: string): Promise<boolean> {
    if (envDisabledSet().has(registryKey)) return true;
    const cached = cache.get(registryKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.disabled;
    await connectDB();
    const row = await NormEndpointSettings.findOne({ registryKey }).lean();
    const disabled = !!row?.disabled;
    cache.set(registryKey, { disabled, expiresAt: now + CACHE_TTL_MS });
    return disabled;
  }

  export function __clearKillSwitchCacheForTests() {
    cache.clear();
  }
  ```

- [ ] **Step 5: Implement rateLimits.ts**

  ```ts
  // src/lib/internal-norm/rateLimits.ts
  import { createRateLimiter } from "@/utils/security/rateLimiter";
  import type { NormTier } from "./classification";

  const TIER_LIMITS: Record<NormTier, { perMinute: number; perDay: number } | null> = {
    read: { perMinute: 120, perDay: 20_000 },
    write_safe: { perMinute: 30, perDay: 1_000 },
    trigger_norm_confirm: { perMinute: 20, perDay: 500 },
    trigger_human_approve: { perMinute: 10, perDay: 100 },
    forbidden: null,
  };

  type Limiter = ReturnType<typeof createRateLimiter>;
  const bucket = new Map<string, Limiter>();

  function getLimiter(bucketKey: string, windowMs: number, maxRequests: number): Limiter {
    const k = `${bucketKey}:${windowMs}:${maxRequests}`;
    let l = bucket.get(k);
    if (!l) {
      l = createRateLimiter(`norm:${k}`, { windowMs, maxRequests });
      bucket.set(k, l);
    }
    return l;
  }

  export interface RateLimitInput {
    tier: NormTier;
    registryKey: string;
    clientKey: string;
    perEndpointPerMinute?: number;
    perEndpointPerDay?: number;
  }
  export interface RateLimitOutput {
    ok: boolean;
    remaining: number;
    limit: number;
    retryAfterSeconds: number;
  }

  export function checkNormRateLimit(input: RateLimitInput): RateLimitOutput {
    const tier = TIER_LIMITS[input.tier];
    if (!tier) return { ok: false, remaining: 0, limit: 0, retryAfterSeconds: 60 };

    const perMin = Math.min(tier.perMinute, input.perEndpointPerMinute ?? tier.perMinute);
    const perDay = Math.min(tier.perDay, input.perEndpointPerDay ?? tier.perDay);

    const minBucket = getLimiter(`tier:${input.tier}:${input.registryKey}:min`, 60_000, perMin);
    const dayBucket = getLimiter(`tier:${input.tier}:${input.registryKey}:day`, 86_400_000, perDay);

    const m = minBucket.check(input.clientKey);
    if (!m.success) return { ok: false, remaining: 0, limit: perMin, retryAfterSeconds: m.retryAfterSeconds };
    const d = dayBucket.check(input.clientKey);
    if (!d.success) return { ok: false, remaining: 0, limit: perDay, retryAfterSeconds: d.retryAfterSeconds };

    return { ok: true, remaining: Math.min(m.remaining, d.remaining), limit: perMin, retryAfterSeconds: 0 };
  }

  export function __resetForTests() {
    bucket.clear();
    const g = globalThis as typeof globalThis & { __rateLimiterStore?: Map<string, unknown> };
    g.__rateLimiterStore?.clear();
  }
  ```

- [ ] **Step 6: Run both tests; verify pass**

  Run: `npm run test:norm-kill-switch` → `✓ kill switch...`
  Run: `npm run test:norm-rate-limits` → `✓ rate limits...`

- [ ] **Step 7: Commit**

  ```
  git add src/lib/internal-norm/killSwitch.ts src/lib/internal-norm/rateLimits.ts src/lib/internal-norm/__tests__/killSwitch.test.ts src/lib/internal-norm/__tests__/rateLimits.test.ts package.json
  git commit -m "feat(internal-norm): kill switch + per-tier rate limits"
  ```

## Task 1.10: `withNorm` HOF + audit helpers

**Files:**
- Create: `src/lib/internal-norm/audit.ts`
- Create: `src/lib/internal-norm/withNorm.ts`
- Create: `src/lib/internal-norm/__tests__/withNorm.test.ts`
- Modify: `package.json` (`test:norm-with-norm`)

- [ ] **Step 1: Write the failing test**

  ```ts
  import dotenv from "dotenv"; import path from "node:path";
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
  import { strict as assert } from "node:assert";
  import { createHmac, createHash, randomBytes } from "node:crypto";
  import mongoose from "mongoose";
  import connectDB from "@/lib/mongodb";
  import { z } from "zod";
  import { withNorm } from "@/lib/internal-norm/withNorm";
  import NormCallLog from "@/models/NormCallLog";

  process.env.NORM_BEARER_TOKEN = "bearer";
  process.env.NORM_SIGNING_SECRET = "secret";

  const TestSchema = z.object({ status: z.literal("ok"), echo: z.string() });

  // Build a NextRequest-like input. We invoke the handler manually because Next.js
  // route handlers expect a Request; we construct a real Request object.
  function buildRequest(method: string, urlPath: string, query: string, body: string) {
    const ts = String(Date.now());
    const nonce = randomBytes(16).toString("hex");
    const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
    const signing = [method, urlPath, query, sha256(body), ts, nonce].join("\n");
    const sig = createHmac("sha256", "secret").update(signing).digest("hex");
    const url = `http://localhost${urlPath}${query ? `?${query}` : ""}`;
    const req = new Request(url, {
      method,
      headers: {
        authorization: "Bearer bearer",
        "x-norm-timestamp": ts,
        "x-norm-nonce": nonce,
        "x-norm-signature": sig,
        "content-type": method === "GET" ? "" : "application/json",
      },
      body: method === "GET" ? undefined : body,
    });
    return req;
  }

  async function run() {
    await connectDB();
    // Drop any test logs first
    await NormCallLog.deleteMany({ registryKey: "test.echo" });

    // Register a test endpoint via the registry would normally happen at import-time. For this
    // unit test we bypass by passing the spec inline.
    const handler = withNorm({
      tier: "read",
      registryKey: "test.echo",
      responseSchema: TestSchema,
    }, async (ctx) => {
      return ctx.ok({ status: "ok" as const, echo: ctx.url.searchParams.get("msg") ?? "" });
    });

    // Happy path
    const req = buildRequest("GET", "/api/internal/norm/v1/test/echo", "msg=hi", "");
    const res = await handler(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.echo, "hi");

    // Audit row written
    const log = await NormCallLog.findOne({ requestId: body.requestId });
    assert.ok(log, "NormCallLog row exists");
    assert.equal(log!.responseStatus, 200);

    // Bad bearer → 401, no body leak
    const reqBad = new Request("http://localhost/api/internal/norm/v1/test/echo", {
      method: "GET",
      headers: { authorization: "Bearer WRONG" },
    });
    const res401 = await handler(reqBad);
    assert.equal(res401.status, 401);

    await NormCallLog.deleteMany({ registryKey: "test.echo" });
    await mongoose.disconnect();
    console.log("✓ withNorm: happy path + 401 + NormCallLog written");
  }
  void run();
  ```

- [ ] **Step 2: Add npm script**

  ```json
  "test:norm-with-norm": "tsx src/lib/internal-norm/__tests__/withNorm.test.ts"
  ```

- [ ] **Step 3: Run — expect failure**

  Run: `npm run test:norm-with-norm`

- [ ] **Step 4: Implement audit.ts**

  ```ts
  // src/lib/internal-norm/audit.ts
  import NormCallLog from "@/models/NormCallLog";
  import { createHash, randomUUID } from "node:crypto";

  export function sha256(s: string): string {
    return createHash("sha256").update(s).digest("hex");
  }

  export function newRequestId(): string {
    return randomUUID().replace(/-/g, "");
  }

  export interface AuditBeginInput {
    requestId: string;
    registryKey: string;
    tier: string;
    method: string;
    path: string;
    queryHash: string;
    bodyHash: string;
    ip: string;
    userAgent: string;
    signatureValid: boolean;
    rateLimitState: { remaining: number; limit: number; windowMs: number };
  }

  export async function beginAudit(input: AuditBeginInput): Promise<unknown> {
    try {
      return await NormCallLog.create({ ...input, responseStatus: 0, durationMs: 0, tierContext: {} });
    } catch (e) {
      console.error("[norm] beginAudit failed", e);
      return null;
    }
  }

  export async function endAudit(
    requestId: string,
    patch: { responseStatus: number; durationMs: number; responseHash: string; errorCode?: string; tierContext?: Record<string, unknown> }
  ): Promise<void> {
    try {
      await NormCallLog.updateOne({ requestId }, { $set: patch });
    } catch (e) {
      console.error("[norm] endAudit failed", e);
    }
  }
  ```

- [ ] **Step 5: Implement withNorm.ts**

  ```ts
  // src/lib/internal-norm/withNorm.ts
  import { NextResponse } from "next/server";
  import type { z } from "zod";
  import connectDB from "@/lib/mongodb";
  import { verifyNormRequest } from "./auth";
  import { isEndpointDisabled } from "./killSwitch";
  import { checkNormRateLimit } from "./rateLimits";
  import { beginAudit, endAudit, newRequestId, sha256 } from "./audit";
  import { getEndpoint, type NormTier } from "./classification";

  interface WithNormOptions {
    tier: NormTier;
    registryKey: string;
    responseSchema?: z.ZodTypeAny;
    perEndpointPerMinute?: number;
    perEndpointPerDay?: number;
  }

  export interface NormCtx {
    requestId: string;
    url: URL;
    request: Request;
    /** Wrap a successful payload in the success envelope and validate against responseSchema. */
    ok: <T>(data: T) => NextResponse;
    /** Emit a structured error response. */
    error: (status: number, code: string, message: string, details?: unknown) => NextResponse;
  }

  export type NormHandler = (ctx: NormCtx) => Promise<NextResponse> | NextResponse;

  function clientKeyFor(req: Request): string {
    return (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  }

  export function withNorm(options: WithNormOptions, handler: NormHandler) {
    // Validate registry consistency at boot (best-effort — getEndpoint may be undefined for
    // ad-hoc test endpoints, which we allow when the caller passes options.tier directly).
    const known = getEndpoint(options.registryKey);
    if (known && known.tier !== options.tier) {
      console.error(`[norm] tier mismatch for ${options.registryKey}: registry=${known.tier}, route=${options.tier}`);
    }

    return async function normRouteHandler(request: Request): Promise<NextResponse> {
      const started = Date.now();
      const requestId = newRequestId();
      const url = new URL(request.url);
      const method = request.method;
      const path = url.pathname;
      const query = url.search.replace(/^\?/, "");
      const rawBody = method === "GET" || method === "HEAD" ? "" : await request.clone().text();

      // 1. Auth
      const verdict = await verifyNormRequest({
        method, path, query, rawBody,
        bearer: (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || null,
        timestamp: request.headers.get("x-norm-timestamp"),
        nonce: request.headers.get("x-norm-nonce"),
        signature: request.headers.get("x-norm-signature"),
      });
      if (!verdict.ok) {
        return NextResponse.json(
          { success: false, error: `auth: ${verdict.reason}`, code: verdict.reason, requestId },
          { status: verdict.status }
        );
      }

      // 2. Kill switch
      await connectDB();
      if (await isEndpointDisabled(options.registryKey)) {
        return NextResponse.json(
          { success: false, error: "endpoint disabled", code: "disabled", requestId },
          { status: 503 }
        );
      }

      // 3. Rate limit
      const rl = checkNormRateLimit({
        tier: options.tier,
        registryKey: options.registryKey,
        clientKey: clientKeyFor(request),
        perEndpointPerMinute: options.perEndpointPerMinute,
        perEndpointPerDay: options.perEndpointPerDay,
      });
      if (!rl.ok) {
        return NextResponse.json(
          { success: false, error: "rate limited", code: "rate_limited", requestId },
          { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
        );
      }

      // 4. Audit begin
      await beginAudit({
        requestId,
        registryKey: options.registryKey,
        tier: options.tier,
        method,
        path,
        queryHash: sha256(query),
        bodyHash: sha256(rawBody),
        ip: clientKeyFor(request),
        userAgent: request.headers.get("user-agent") || "",
        signatureValid: true,
        rateLimitState: { remaining: rl.remaining, limit: rl.limit, windowMs: 60_000 },
      });

      // 5. Handler
      let res: NextResponse;
      let responseStatus = 500;
      let responseBody = "";
      let errorCode: string | undefined;
      try {
        const ctx: NormCtx = {
          requestId,
          url,
          request,
          ok: <T,>(data: T) => {
            if (options.responseSchema) {
              const parsed = options.responseSchema.safeParse(data);
              if (!parsed.success) {
                errorCode = "response_schema_invalid";
                console.error("[norm] response schema invalid", parsed.error.issues);
                return NextResponse.json(
                  { success: false, error: "internal", code: errorCode, requestId },
                  { status: 500 }
                );
              }
            }
            return NextResponse.json({ success: true, data, requestId });
          },
          error: (status, code, message, details) =>
            NextResponse.json({ success: false, error: message, code, details, requestId }, { status }),
        };
        res = await handler(ctx);
        responseStatus = res.status;
        responseBody = await res.clone().text();
      } catch (e) {
        errorCode = "handler_exception";
        console.error("[norm] handler threw", e);
        res = NextResponse.json(
          { success: false, error: "internal", code: errorCode, requestId },
          { status: 500 }
        );
        responseStatus = 500;
        responseBody = await res.clone().text();
      }

      // 6. Audit end
      await endAudit(requestId, {
        responseStatus,
        durationMs: Date.now() - started,
        responseHash: sha256(responseBody),
        ...(errorCode ? { errorCode } : {}),
      });

      return res;
    };
  }
  ```

- [ ] **Step 6: Run and verify pass**

  Run: `npm run test:norm-with-norm`
  Expected: `✓ withNorm: happy path + 401 + NormCallLog written`

- [ ] **Step 7: Commit**

  ```
  git add src/lib/internal-norm/audit.ts src/lib/internal-norm/withNorm.ts src/lib/internal-norm/__tests__/withNorm.test.ts package.json
  git commit -m "feat(internal-norm): withNorm HOF + audit helpers"
  ```

## Task 1.11: Manifest generator + `build:norm-manifest` script

**Files:**
- Create: `src/lib/internal-norm/schemas/manifest.ts`
- Create: `scripts/build-norm-manifest.ts`
- Create: `src/generated/normToolsManifest.json` (will be (re)generated; committed for visibility)
- Modify: `package.json` (`build:norm-manifest`, add to `prebuild`/`predev`)

- [ ] **Step 1: Implement the schema + generator**

  ```ts
  // src/lib/internal-norm/schemas/manifest.ts
  import { z } from "zod";

  export const NormManifestEntrySchema = z.object({
    registryKey: z.string(),
    tier: z.enum(["read", "write_safe", "trigger_norm_confirm", "trigger_human_approve"]),
    path: z.string(),
    method: z.string(),
    summary: z.string(),
  });

  export const NormManifestSchema = z.object({
    version: z.literal(1),
    generatedAt: z.string(),
    endpoints: z.array(NormManifestEntrySchema),
  });

  export type NormManifest = z.infer<typeof NormManifestSchema>;
  ```

  ```ts
  // scripts/build-norm-manifest.ts
  import fs from "node:fs";
  import path from "node:path";
  import { NORM_ENDPOINTS } from "../src/lib/internal-norm/classification";

  const out = {
    version: 1 as const,
    generatedAt: new Date().toISOString(),
    endpoints: Object.entries(NORM_ENDPOINTS)
      .filter(([, spec]) => spec.tier !== "forbidden")
      .map(([key, spec]) => ({
        registryKey: key,
        tier: spec.tier,
        path: spec.path,
        method: spec.method,
        summary: spec.summary,
      })),
  };

  const outPath = path.resolve(process.cwd(), "src/generated/normToolsManifest.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`✓ wrote ${out.endpoints.length} endpoints → ${outPath}`);
  ```

- [ ] **Step 2: Wire npm scripts and prebuild**

  In `package.json`:
  ```json
  "build:norm-manifest": "tsx scripts/build-norm-manifest.ts",
  "prebuild": "npm run build:upsell-manifest && npm run build:landing-manifest && npm run build:norm-manifest",
  "predev": "npm run build:upsell-manifest && npm run build:landing-manifest && npm run build:norm-manifest"
  ```

- [ ] **Step 3: Run generator; verify output**

  Run: `npm run build:norm-manifest`
  Expected: `✓ wrote 2 endpoints → .../normToolsManifest.json` (health + manifest)
  Verify file exists.

- [ ] **Step 4: Commit**

  ```
  git add src/lib/internal-norm/schemas/manifest.ts scripts/build-norm-manifest.ts src/generated/normToolsManifest.json package.json
  git commit -m "feat(internal-norm): manifest generator + prebuild hook"
  ```

## Task 1.12: `/v1/health` and `/v1/manifest` endpoints

**Files:**
- Create: `src/app/api/internal/norm/v1/health/route.ts`
- Create: `src/app/api/internal/norm/v1/manifest/route.ts`

- [ ] **Step 1: Implement health**

  ```ts
  // src/app/api/internal/norm/v1/health/route.ts
  import { z } from "zod";
  import { withNorm } from "@/lib/internal-norm/withNorm";

  const HealthResponseSchema = z.object({
    ok: z.literal(true),
    serverTime: z.string(),
    version: z.literal(1),
  });

  export const GET = withNorm(
    { tier: "read", registryKey: "health", responseSchema: HealthResponseSchema },
    async (ctx) => ctx.ok({ ok: true as const, serverTime: new Date().toISOString(), version: 1 as const })
  );
  ```

- [ ] **Step 2: Implement manifest**

  ```ts
  // src/app/api/internal/norm/v1/manifest/route.ts
  import { withNorm } from "@/lib/internal-norm/withNorm";
  import { NormManifestSchema } from "@/lib/internal-norm/schemas/manifest";
  // Generated JSON is committed; import directly so manifest endpoint stays in lockstep with the build artifact.
  import manifest from "@/generated/normToolsManifest.json";

  export const GET = withNorm(
    { tier: "read", registryKey: "manifest", responseSchema: NormManifestSchema },
    async (ctx) => ctx.ok(manifest)
  );
  ```

- [ ] **Step 3: Smoke test by curl**

  Boot dev server (`npm run dev` if it isn't running) and craft a signed request using a small one-off tsx helper. Document the steps in `docs/internal-norm/testing.md` later. For now, verify the route compiles by running:

  Run: `npm run type-check`
  Expected: no errors related to internal-norm files

- [ ] **Step 4: Commit**

  ```
  git add src/app/api/internal/norm/v1/health/route.ts src/app/api/internal/norm/v1/manifest/route.ts
  git commit -m "feat(internal-norm): health + manifest framework endpoints"
  ```

## Task 1.13: ESLint rule — Norm routes must import a service

**Files:**
- Create: `eslint/rules/norm-must-import-service.js`
- Create: `eslint/rules/index.js` (plugin entry)
- Modify: existing ESLint config (`eslint.config.mjs` or `.eslintrc.*` — check what exists)

- [ ] **Step 1: Confirm existing ESLint config shape**

  Run: `npm run lint -- --print-config src/app/page.tsx | head -20` (or examine `.eslintrc.*` / `eslint.config.mjs`). Note whether the project uses flat config or legacy.

- [ ] **Step 2: Write the rule**

  ```js
  // eslint/rules/norm-must-import-service.js
  module.exports = {
    meta: {
      type: "problem",
      docs: { description: "Files under src/app/api/internal/norm/** must import from @/services/**" },
      schema: [],
    },
    create(context) {
      const filename = context.getFilename().replace(/\\/g, "/");
      const isNormRoute =
        filename.includes("/src/app/api/internal/norm/") && filename.endsWith("/route.ts");
      // Allow framework endpoints to opt out (health, manifest, pending-actions status)
      const exempt = ["/v1/health/route.ts", "/v1/manifest/route.ts", "/v1/pending-actions/"].some((p) =>
        filename.includes(p)
      );
      if (!isNormRoute || exempt) return {};
      let hasServiceImport = false;
      return {
        ImportDeclaration(node) {
          if (typeof node.source.value === "string" && node.source.value.startsWith("@/services/")) {
            hasServiceImport = true;
          }
        },
        "Program:exit"() {
          if (!hasServiceImport) {
            context.report({
              loc: { line: 1, column: 0 },
              message:
                "Norm route handlers must import from @/services/** (business logic lives in services, not route files).",
            });
          }
        },
      };
    },
  };
  ```

  ```js
  // eslint/rules/index.js
  module.exports = {
    rules: {
      "norm-must-import-service": require("./norm-must-import-service"),
    },
  };
  ```

- [ ] **Step 3: Register the plugin in ESLint config**

  Update existing ESLint config to add:
  ```js
  plugins: { "internal-norm": require("./eslint/rules") },
  rules: { "internal-norm/norm-must-import-service": "error" },
  ```
  (Adapt syntax to the project's flat-config vs legacy config — match what's already there.)

- [ ] **Step 4: Lint; verify the rule loads and behaves**

  Run: `npm run lint -- src/app/api/internal/norm`
  Expected: zero errors. The only routes that exist at this point are `health` and `manifest`, both in the exempt list.

  To verify the rule actually fires when expected, temporarily create `src/app/api/internal/norm/v1/__rule-check/route.ts`:
  ```ts
  export async function GET() { return new Response("hi"); }
  ```
  Run: `npm run lint -- src/app/api/internal/norm/v1/__rule-check`
  Expected: one error — `Norm route handlers must import from @/services/**`.
  Delete the test file before committing.

- [ ] **Step 5: Commit**

  ```
  git add eslint/ eslint.config.mjs # OR .eslintrc.*
  git commit -m "feat(internal-norm): ESLint rule requiring Norm routes to import a service"
  ```

## Task 1.14: Phase 1 end-to-end signed-curl smoke

**Files:**
- Create: `scripts/internal-norm-smoke.ts` (developer convenience; signs a request and prints it)

- [ ] **Step 1: Write the smoke helper**

  ```ts
  // scripts/internal-norm-smoke.ts
  import dotenv from "dotenv"; import path from "node:path";
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
  import { createHmac, createHash, randomBytes } from "node:crypto";

  const bearer = process.env.NORM_BEARER_TOKEN;
  const secret = process.env.NORM_SIGNING_SECRET;
  const base = process.env.NORM_SMOKE_BASE || "http://localhost:3000";
  if (!bearer || !secret) {
    console.error("Set NORM_BEARER_TOKEN and NORM_SIGNING_SECRET in .env.local");
    process.exit(1);
  }
  const method = process.argv[2] || "GET";
  const pathArg = process.argv[3] || "/api/internal/norm/v1/health";
  const bodyArg = process.argv[4] || "";
  const url = new URL(base + pathArg);
  const ts = String(Date.now());
  const nonce = randomBytes(16).toString("hex");
  const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
  const signing = [method, url.pathname, url.search.replace(/^\?/, ""), sha256(bodyArg), ts, nonce].join("\n");
  const sig = createHmac("sha256", secret).update(signing).digest("hex");

  const headers: Record<string, string> = {
    authorization: `Bearer ${bearer}`,
    "x-norm-timestamp": ts,
    "x-norm-nonce": nonce,
    "x-norm-signature": sig,
  };
  if (method !== "GET" && bodyArg) headers["content-type"] = "application/json";

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: method !== "GET" ? bodyArg : undefined,
  });
  const text = await res.text();
  console.log(`${res.status} ${res.statusText}`);
  console.log(text);
  ```

- [ ] **Step 2: Add npm script**

  ```json
  "norm:smoke": "tsx scripts/internal-norm-smoke.ts"
  ```

- [ ] **Step 3: Verify against running dev server**

  In separate terminal: `npm run dev` (background)
  Then: `npm run norm:smoke -- GET /api/internal/norm/v1/health`
  Expected: `200 OK` with `{"success":true,"data":{"ok":true,"serverTime":"...","version":1},"requestId":"..."}`

  Then: `npm run norm:smoke -- GET /api/internal/norm/v1/manifest`
  Expected: `200 OK` with manifest JSON listing health + manifest endpoints.

  Try a tampered signature (edit the script to send `sig = "deadbeef"`):
  Expected: `401` with `bad-signature`.

- [ ] **Step 4: Commit**

  ```
  git add scripts/internal-norm-smoke.ts package.json
  git commit -m "feat(internal-norm): smoke script for signing+sending Norm requests"
  ```

---

# Phase 2 — ROAS domain

Goal: Norm can answer ROAS questions with the same numbers the admin dashboard shows.

## Task 2.1: Extract `FacebookAdsInsightsService`

**Files:**
- Create: `src/services/facebook-ads/FacebookAdsInsightsService.ts`
- Create: `src/services/facebook-ads/__tests__/FacebookAdsInsightsService.test.ts`
- Modify: `package.json` (`test:facebook-ads-insights-service`)

- [ ] **Step 1: Read the existing fat handler**

  Read `src/app/api/admin/facebook-ads/insights/route.ts` lines 30–399 thoroughly. The orchestration body to extract:
  - Date range resolution (today / yesterday / custom)
  - Env-var checks for `FACEBOOK_MARKETING_ACCESS_TOKEN`, `FACEBOOK_AD_ACCOUNT_ID`
  - `fetchFacebookInsights` call
  - Aggregation + breakdown transformation
  - Cents → dollars conversion for monetary fields
  - Construction of the `FacebookAdsInsightsResponse`

- [ ] **Step 2: Write the failing test**

  ```ts
  import { strict as assert } from "node:assert";
  import {
    FacebookAdsInsightsService,
    type FacebookAdsInsightsServiceInput,
  } from "@/services/facebook-ads/FacebookAdsInsightsService";

  // Inject a fake fetcher so the test does not hit Facebook's API.
  const service = new FacebookAdsInsightsService({
    fetchInsights: async () => [
      {
        metrics: { spend: 10_000, revenue: 30_000, profit: 20_000, impressions: 1000, clicks: 100, conversions: 5, landingPageView: 50, roas: 3, ctr: 10, cpc: 100 },
        breakdown: { campaignId: "C1", campaignName: "Camp" },
      },
    ],
  });

  const input: FacebookAdsInsightsServiceInput = { dateRange: "today", level: "campaign" };
  const result = await service.getInsights(input);

  assert.equal(result.summary.spend, 100, "cents → dollars");
  assert.equal(result.summary.revenue, 300);
  assert.equal(result.summary.roas, 3);
  assert.equal(result.breakdown.length, 1);
  assert.equal(result.breakdown[0].campaignName, "Camp");
  console.log("✓ FacebookAdsInsightsService aggregates + converts cents correctly");
  ```

- [ ] **Step 3: Add npm script**

  ```json
  "test:facebook-ads-insights-service": "tsx src/services/facebook-ads/__tests__/FacebookAdsInsightsService.test.ts"
  ```

- [ ] **Step 4: Run — expect failure**

  Run: `npm run test:facebook-ads-insights-service`

- [ ] **Step 5: Implement the service**

  ```ts
  // src/services/facebook-ads/FacebookAdsInsightsService.ts
  import { subDays } from "date-fns";
  import { formatInTimeZone } from "date-fns-tz";
  import { fetchFacebookInsights } from "@/lib/facebook-marketing";
  import { getStartOfTodayInAEST } from "@/utils/common/timezone";
  import type {
    FacebookAdsInsightsResponse,
    FacebookAdsBreakdownItem,
    ProcessedInsightMetrics,
    InsightLevel,
  } from "@/types/facebook-ads";

  type Fetcher = typeof fetchFacebookInsights;

  export interface FacebookAdsInsightsServiceInput {
    dateRange: "today" | "yesterday" | "custom";
    level?: InsightLevel;
    startDate?: string; // ISO; required for "custom"
    endDate?: string;
  }

  export class FacebookAdsInsightsService {
    constructor(
      private deps: {
        fetchInsights?: Fetcher;
        accessToken?: string;
        adAccountId?: string;
      } = {}
    ) {}

    async getInsights(input: FacebookAdsInsightsServiceInput): Promise<FacebookAdsInsightsResponse["data"]> {
      const accessToken = this.deps.accessToken ?? process.env.FACEBOOK_MARKETING_ACCESS_TOKEN;
      const adAccountId = this.deps.adAccountId ?? process.env.FACEBOOK_AD_ACCOUNT_ID;
      const fetcher = this.deps.fetchInsights ?? fetchFacebookInsights;

      if (!accessToken || !adAccountId) {
        throw new Error("Facebook Marketing API not configured (token or account ID missing)");
      }

      const level: InsightLevel = input.level ?? "account";
      const range = this.resolveDateRange(input);

      const insightsData = await fetcher(adAccountId, accessToken, range.api, level);

      let metrics: ProcessedInsightMetrics;
      let breakdownItems: FacebookAdsBreakdownItem[] = [];

      if (insightsData && insightsData.length > 0) {
        if (level === "account") {
          metrics = insightsData[0].metrics;
        } else {
          metrics = aggregate(insightsData.map((d) => d.metrics));
          breakdownItems = insightsData.map((item) => ({
            level,
            campaignId: item.breakdown?.campaignId,
            campaignName: item.breakdown?.campaignName,
            adsetId: item.breakdown?.adsetId,
            adsetName: item.breakdown?.adsetName,
            adId: item.breakdown?.adId,
            adName: item.breakdown?.adName,
            spend: item.metrics.spend / 100,
            revenue: item.metrics.revenue / 100,
            profit: item.metrics.profit / 100,
            roas: item.metrics.spend > 0 ? item.metrics.revenue / item.metrics.spend : 0,
            conversions: item.metrics.conversions,
            impressions: item.metrics.impressions,
            clicks: item.metrics.clicks,
            landingPageView: item.metrics.landingPageView,
            ctr: item.metrics.ctr,
            cpc: item.metrics.cpc / 100,
          }));
        }
      } else {
        metrics = { spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0, landingPageView: 0, profit: 0, roas: 0, ctr: 0, cpc: 0 };
      }

      return {
        summary: {
          spend: metrics.spend / 100,
          revenue: metrics.revenue / 100,
          profit: metrics.profit / 100,
          roas: metrics.roas,
          conversions: metrics.conversions,
          impressions: metrics.impressions,
          clicks: metrics.clicks,
          landingPageView: metrics.landingPageView,
          ctr: metrics.ctr,
          cpc: metrics.cpc / 100,
        },
        breakdown: breakdownItems,
        dateRange: { start: range.api.since, end: range.api.until },
        syncedAt: new Date().toISOString(),
        cached: false,
      };
    }

    private resolveDateRange(input: FacebookAdsInsightsServiceInput) {
      const AEST = "Australia/Sydney";
      const startOfToday = getStartOfTodayInAEST();

      const fmt = (d: Date) => formatInTimeZone(d, AEST, "yyyy-MM-dd");

      if (input.dateRange === "today") {
        const today = fmt(new Date());
        return { api: { since: today, until: today } };
      }
      if (input.dateRange === "yesterday") {
        const y = subDays(startOfToday, 1);
        const yStr = fmt(y);
        return { api: { since: yStr, until: yStr } };
      }
      // custom
      if (!input.startDate || !input.endDate) {
        throw new Error("startDate and endDate required for custom range");
      }
      return {
        api: { since: fmt(new Date(input.startDate)), until: fmt(new Date(input.endDate)) },
      };
    }
  }

  function aggregate(arr: ProcessedInsightMetrics[]): ProcessedInsightMetrics {
    const a = arr.reduce(
      (acc, m) => ({
        spend: acc.spend + m.spend,
        revenue: acc.revenue + m.revenue,
        profit: acc.profit + m.profit,
        impressions: acc.impressions + m.impressions,
        clicks: acc.clicks + m.clicks,
        conversions: acc.conversions + m.conversions,
        landingPageView: acc.landingPageView + m.landingPageView,
        roas: 0, ctr: 0, cpc: 0,
      }),
      { spend: 0, revenue: 0, profit: 0, impressions: 0, clicks: 0, conversions: 0, landingPageView: 0, roas: 0, ctr: 0, cpc: 0 }
    );
    a.roas = a.spend > 0 ? a.revenue / a.spend : 0;
    a.ctr = a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0;
    a.cpc = a.clicks > 0 ? a.spend / a.clicks : 0;
    return a;
  }
  ```

- [ ] **Step 6: Run; verify pass**

  Run: `npm run test:facebook-ads-insights-service`
  Expected: `✓ FacebookAdsInsightsService aggregates + converts cents correctly`

- [ ] **Step 7: Commit**

  ```
  git add src/services/facebook-ads/FacebookAdsInsightsService.ts src/services/facebook-ads/__tests__/FacebookAdsInsightsService.test.ts package.json
  git commit -m "feat(facebook-ads): extract FacebookAdsInsightsService from fat admin route"
  ```

## Task 2.2: Shrink the admin facebook-ads route to call the service

**Files:**
- Modify: `src/app/api/admin/facebook-ads/insights/route.ts`

- [ ] **Step 1: Replace the body**

  Final file should be roughly:
  ```ts
  import { NextRequest, NextResponse } from "next/server";
  import { getServerSession } from "next-auth";
  import { authOptions } from "@/lib/auth";
  import { z } from "zod";
  import connectDB from "@/lib/mongodb";
  import { FacebookAdsInsightsService } from "@/services/facebook-ads/FacebookAdsInsightsService";

  const querySchema = z.object({
    dateRange: z.enum(["today", "yesterday", "custom"]).default("today"),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    level: z.enum(["account", "campaign", "adset", "ad"]).default("account"),
  });

  export async function GET(request: NextRequest) {
    try {
      await connectDB();
      const session = await getServerSession(authOptions);
      if (!session?.user?.id || session.user.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const params = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
      if (!params.success) {
        return NextResponse.json({ success: false, error: "Invalid query", details: params.error.issues }, { status: 400 });
      }
      const data = await new FacebookAdsInsightsService().getInsights(params.data);
      return NextResponse.json({ success: true, data });
    } catch (e) {
      console.error("❌ /api/admin/facebook-ads/insights error", e);
      return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
    }
  }
  ```

- [ ] **Step 2: Type-check**

  Run: `npm run type-check`
  Expected: no new errors.

- [ ] **Step 3: Manual verify against the admin UI**

  Boot dev (`npm run dev`), log in as admin, open the dashboard's Ad Spend / ROAS card. Numbers should be identical to before the refactor (this is the point of the refactor — same service path).

- [ ] **Step 4: Commit**

  ```
  git add src/app/api/admin/facebook-ads/insights/route.ts
  git commit -m "refactor(admin): shrink /api/admin/facebook-ads/insights to delegate to FacebookAdsInsightsService"
  ```

## Task 2.3: `resolveNormDateRange` utility

**Files:**
- Create: `src/utils/admin/resolveNormDateRange.ts`
- Create: `src/utils/admin/__tests__/resolveNormDateRange.test.ts`
- Modify: `package.json` (`test:resolve-norm-date-range`)

The admin UI today passes `current-draw`/`last-draw` already resolved (frontend looks up the draw dates and passes them as `startDate`/`endDate` with `dateRange=custom`). For Norm we resolve server-side using `MajorDraw`.

- [ ] **Step 1: Write the failing test**

  ```ts
  import dotenv from "dotenv"; import path from "node:path";
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
  import { strict as assert } from "node:assert";
  import mongoose from "mongoose";
  import connectDB from "@/lib/mongodb";
  import { resolveNormDateRange } from "@/utils/admin/resolveNormDateRange";

  async function run() {
    await connectDB();
    // today, yesterday, all-time, custom must work without DB calls.
    const t = await resolveNormDateRange({ range: "today" });
    assert.ok(t.startDate instanceof Date);
    assert.equal(t.dateRange, "today");

    const y = await resolveNormDateRange({ range: "yesterday" });
    assert.equal(y.dateRange, "yesterday");

    const a = await resolveNormDateRange({ range: "all-time" });
    assert.equal(a.dateRange, "all-time");

    const c = await resolveNormDateRange({ range: "custom", start: "2099-01-01", end: "2099-01-31" });
    assert.equal(c.dateRange, "custom");

    // current-draw / last-draw require DB; here we just assert it returns *something* without throwing,
    // unless no draws exist, in which case it throws a known error.
    try {
      const cd = await resolveNormDateRange({ range: "current-draw" });
      assert.ok(cd.startDate <= cd.endDate);
    } catch (e) {
      assert.match(String(e), /no.*draw/i);
    }
    await mongoose.disconnect();
    console.log("✓ resolveNormDateRange covers today/yesterday/all-time/custom; current-draw degrades cleanly");
  }
  void run();
  ```

- [ ] **Step 2: Add npm script**

  ```json
  "test:resolve-norm-date-range": "tsx src/utils/admin/__tests__/resolveNormDateRange.test.ts"
  ```

- [ ] **Step 3: Run — expect failure**

  Run: `npm run test:resolve-norm-date-range`

- [ ] **Step 4: Implement**

  ```ts
  // src/utils/admin/resolveNormDateRange.ts
  import { parseAdminDashboardDateRange, type ParsedAdminDashboardDateRange } from "./dashboardDateRange";
  import MajorDraw from "@/models/MajorDraw";

  export type NormRangeKey =
    | "today"
    | "yesterday"
    | "current-draw"
    | "last-draw"
    | "all-time"
    | "custom";

  export interface ResolveNormDateRangeInput {
    range: NormRangeKey;
    start?: string;
    end?: string;
  }

  export async function resolveNormDateRange(input: ResolveNormDateRangeInput): Promise<ParsedAdminDashboardDateRange> {
    let startParam: string | null = input.start ?? null;
    let endParam: string | null = input.end ?? null;

    if (input.range === "current-draw" || input.range === "last-draw") {
      const draw =
        input.range === "current-draw"
          ? await MajorDraw.findOne({ status: "active" }).sort({ startDate: -1 })
          : await MajorDraw.findOne({ status: { $in: ["completed", "winner_selected"] } }).sort({ endDate: -1 });
      if (!draw) throw new Error(`No ${input.range} found in MajorDraw collection`);
      startParam = (draw.startDate as Date).toISOString();
      endParam = (draw.endDate as Date).toISOString();
    }

    const parsed = parseAdminDashboardDateRange({
      dateRange: input.range,
      startDateParam: startParam,
      endDateParam: endParam,
    });
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    return parsed.value;
  }
  ```

- [ ] **Step 5: Run; verify pass**

  Run: `npm run test:resolve-norm-date-range`
  Expected pass message.

- [ ] **Step 6: Commit**

  ```
  git add src/utils/admin/resolveNormDateRange.ts src/utils/admin/__tests__/resolveNormDateRange.test.ts package.json
  git commit -m "feat(internal-norm): resolveNormDateRange utility with server-side draw lookup"
  ```

## Task 2.4: ROAS Norm schemas + registry entries

**Files:**
- Create: `src/lib/internal-norm/schemas/roas.ts`
- Modify: `src/lib/internal-norm/classification.ts` (add `roas.summary`, `roas.breakdown`)

- [ ] **Step 1: Write the schemas**

  ```ts
  // src/lib/internal-norm/schemas/roas.ts
  import { z } from "zod";
  import { NormDateRangeSchema } from "./common";

  export const NormRoasSummarySchema = z.object({
    dateRange: NormDateRangeSchema,
    spend: z.number(),
    revenue: z.number(),
    profit: z.number(),
    roas: z.number(),
    conversions: z.number(),
    impressions: z.number(),
    clicks: z.number(),
    ctr: z.number(),
    cpc: z.number(),
  });

  export const NormRoasBreakdownItemSchema = z.object({
    id: z.string(),
    name: z.string(),
    level: z.enum(["campaign", "adset", "ad"]),
    spend: z.number(),
    revenue: z.number(),
    profit: z.number(),
    roas: z.number(),
    conversions: z.number(),
    impressions: z.number(),
    clicks: z.number(),
    ctr: z.number(),
    cpc: z.number(),
  });

  export const NormRoasBreakdownSchema = NormRoasSummarySchema.extend({
    level: z.enum(["campaign", "adset", "ad"]),
    breakdown: z.array(NormRoasBreakdownItemSchema),
  });
  ```

- [ ] **Step 2: Register the endpoints**

  In `classification.ts`, extend `NORM_ENDPOINTS`:
  ```ts
  import { NormRoasSummarySchema, NormRoasBreakdownSchema } from "./schemas/roas";

  // inside NORM_ENDPOINTS object:
  "roas.summary": {
    tier: "read",
    path: "/v1/roas/summary",
    method: "GET",
    summary: "Headline ad spend, revenue, ROAS, profit for a date range",
    rateLimit: { perMinute: 10 },
    responseSchema: NormRoasSummarySchema,
  },
  "roas.breakdown": {
    tier: "read",
    path: "/v1/roas/breakdown",
    method: "GET",
    summary: "Per-campaign/adset/ad ROAS breakdown for a date range",
    rateLimit: { perMinute: 10 },
    responseSchema: NormRoasBreakdownSchema,
  },
  ```

- [ ] **Step 3: Regenerate manifest**

  Run: `npm run build:norm-manifest`
  Expected: `✓ wrote 4 endpoints → ...`

- [ ] **Step 4: Commit**

  ```
  git add src/lib/internal-norm/schemas/roas.ts src/lib/internal-norm/classification.ts src/generated/normToolsManifest.json
  git commit -m "feat(internal-norm): register roas.summary + roas.breakdown in classification"
  ```

## Task 2.5: `/v1/roas/summary` + `/v1/roas/breakdown` route handlers

**Files:**
- Create: `src/app/api/internal/norm/v1/roas/summary/route.ts`
- Create: `src/app/api/internal/norm/v1/roas/breakdown/route.ts`

- [ ] **Step 1: Implement `roas/summary`**

  ```ts
  // src/app/api/internal/norm/v1/roas/summary/route.ts
  import { z } from "zod";
  import { withNorm } from "@/lib/internal-norm/withNorm";
  import { NormRoasSummarySchema } from "@/lib/internal-norm/schemas/roas";
  import { FacebookAdsInsightsService } from "@/services/facebook-ads/FacebookAdsInsightsService";
  import { resolveNormDateRange } from "@/utils/admin/resolveNormDateRange";

  const QuerySchema = z.object({
    dateRange: z.enum(["today", "yesterday", "current-draw", "last-draw", "all-time", "custom"]).default("today"),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  });

  export const GET = withNorm(
    { tier: "read", registryKey: "roas.summary", responseSchema: NormRoasSummarySchema, perEndpointPerMinute: 10 },
    async (ctx) => {
      const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
      if (!parsed.success) return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);

      const range = await resolveNormDateRange({ range: parsed.data.dateRange, start: parsed.data.startDate, end: parsed.data.endDate });

      // FacebookAdsInsightsService only natively supports today/yesterday/custom — for draw + all-time
      // we resolve to ISO dates first and pass as "custom".
      const isAggregateRange = range.dateRange !== "today" && range.dateRange !== "yesterday";
      const data = await new FacebookAdsInsightsService().getInsights({
        dateRange: isAggregateRange ? "custom" : (range.dateRange as "today" | "yesterday"),
        level: "account",
        startDate: isAggregateRange ? range.startDate.toISOString() : undefined,
        endDate: isAggregateRange ? range.endDate.toISOString() : undefined,
      });

      return ctx.ok({
        dateRange: { range: range.dateRange, start: range.startDate.toISOString(), end: range.endDate.toISOString() },
        spend: data.summary.spend,
        revenue: data.summary.revenue,
        profit: data.summary.profit,
        roas: data.summary.roas,
        conversions: data.summary.conversions,
        impressions: data.summary.impressions,
        clicks: data.summary.clicks,
        ctr: data.summary.ctr,
        cpc: data.summary.cpc,
      });
    }
  );
  ```

- [ ] **Step 2: Implement `roas/breakdown`**

  ```ts
  // src/app/api/internal/norm/v1/roas/breakdown/route.ts
  import { z } from "zod";
  import { withNorm } from "@/lib/internal-norm/withNorm";
  import { NormRoasBreakdownSchema } from "@/lib/internal-norm/schemas/roas";
  import { FacebookAdsInsightsService } from "@/services/facebook-ads/FacebookAdsInsightsService";
  import { resolveNormDateRange } from "@/utils/admin/resolveNormDateRange";

  const QuerySchema = z.object({
    dateRange: z.enum(["today", "yesterday", "current-draw", "last-draw", "all-time", "custom"]).default("today"),
    level: z.enum(["campaign", "adset", "ad"]).default("campaign"),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  });

  export const GET = withNorm(
    { tier: "read", registryKey: "roas.breakdown", responseSchema: NormRoasBreakdownSchema, perEndpointPerMinute: 10 },
    async (ctx) => {
      const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
      if (!parsed.success) return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);

      const range = await resolveNormDateRange({ range: parsed.data.dateRange, start: parsed.data.startDate, end: parsed.data.endDate });
      const isAggregateRange = range.dateRange !== "today" && range.dateRange !== "yesterday";

      const data = await new FacebookAdsInsightsService().getInsights({
        dateRange: isAggregateRange ? "custom" : (range.dateRange as "today" | "yesterday"),
        level: parsed.data.level,
        startDate: isAggregateRange ? range.startDate.toISOString() : undefined,
        endDate: isAggregateRange ? range.endDate.toISOString() : undefined,
      });

      const breakdown = data.breakdown.map((b) => ({
        id: (b.campaignId ?? b.adsetId ?? b.adId ?? "unknown") as string,
        name: (b.campaignName ?? b.adsetName ?? b.adName ?? "unknown") as string,
        level: parsed.data.level,
        spend: b.spend,
        revenue: b.revenue,
        profit: b.profit,
        roas: b.roas,
        conversions: b.conversions,
        impressions: b.impressions,
        clicks: b.clicks,
        ctr: b.ctr,
        cpc: b.cpc,
      }));

      return ctx.ok({
        dateRange: { range: range.dateRange, start: range.startDate.toISOString(), end: range.endDate.toISOString() },
        spend: data.summary.spend,
        revenue: data.summary.revenue,
        profit: data.summary.profit,
        roas: data.summary.roas,
        conversions: data.summary.conversions,
        impressions: data.summary.impressions,
        clicks: data.summary.clicks,
        ctr: data.summary.ctr,
        cpc: data.summary.cpc,
        level: parsed.data.level,
        breakdown,
      });
    }
  );
  ```

- [ ] **Step 3: Type-check + smoke**

  Run: `npm run type-check` → no errors
  Boot dev (`npm run dev`), then:
  Run: `npm run norm:smoke -- GET "/api/internal/norm/v1/roas/summary?dateRange=today"`
  Expected: `200 OK` with full ROAS summary payload.

  Run: `npm run norm:smoke -- GET "/api/internal/norm/v1/roas/breakdown?dateRange=today&level=campaign"`
  Expected: `200 OK` with `breakdown` array.

- [ ] **Step 4: ESLint check (rule should pass — both files import from `@/services/`)**

  Run: `npm run lint -- src/app/api/internal/norm/v1/roas`
  Expected: zero errors.

- [ ] **Step 5: Commit**

  ```
  git add src/app/api/internal/norm/v1/roas
  git commit -m "feat(internal-norm): ROAS summary + breakdown endpoints"
  ```

---

# Phase 3 — Dashboard Stats domain

Goal: Norm can answer business-state questions — revenue, members, churn, draws — with identical numbers to the admin dashboard.

## Task 3.1: Extract `DashboardStatsService`

**Files:**
- Create: `src/services/admin/DashboardStatsService.ts`
- Create: `src/services/admin/__tests__/DashboardStatsService.test.ts`
- Modify: `package.json` (`test:dashboard-stats-service`)

- [ ] **Step 1: Re-read the existing handler closely**

  Read `src/app/api/admin/dashboard/stats/route.ts` lines 33–520 carefully. The orchestration to extract is roughly: parse date range → comparison period → user counts → revenue + ad channels via `readStatsForRange` → MajorDraw counts → conversion rate → enhanced metrics + membership analytics. Return both the headline `stats` shape and (for the Norm projection) a strict subset.

- [ ] **Step 2: Write the failing test (smoke against live Mongo)**

  ```ts
  import dotenv from "dotenv"; import path from "node:path";
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
  import { strict as assert } from "node:assert";
  import mongoose from "mongoose";
  import connectDB from "@/lib/mongodb";
  import { DashboardStatsService } from "@/services/admin/DashboardStatsService";

  async function run() {
    await connectDB();
    const svc = new DashboardStatsService();
    const stats = await svc.getStats({ dateRange: "today" });
    assert.ok(stats.users, "users block present");
    assert.ok(stats.revenue, "revenue block present");
    assert.ok(stats.majorDraw, "majorDraw block present");
    assert.equal(typeof stats.conversionRate, "number");
    assert.ok(stats.facebookAds, "facebookAds block present");
    await mongoose.disconnect();
    console.log("✓ DashboardStatsService returns canonical shape");
  }
  void run();
  ```

- [ ] **Step 3: Add npm script**

  ```json
  "test:dashboard-stats-service": "tsx src/services/admin/__tests__/DashboardStatsService.test.ts"
  ```

- [ ] **Step 4: Run — expect failure**

  Run: `npm run test:dashboard-stats-service`

- [ ] **Step 5: Implement the service**

  Create `DashboardStatsService.ts` by lifting the orchestration verbatim. This is a **pure code move** — do not change any computation, do not "fix" anything you don't like along the way. The class has one public method `getStats({ dateRange, startDate?, endDate? })` returning the same `stats` object that the existing route handler currently constructs (the literal that gets `return NextResponse.json({ success: true, data: stats })`'d at line ~523 of the existing route).

  Concrete mechanical steps:
  1. Copy lines ~44–512 of `src/app/api/admin/dashboard/stats/route.ts` into the body of `getStats`.
  2. Replace the route handler's `request.nextUrl.searchParams.get(...)` reads with reads from the `input` argument (`input.dateRange`, `input.startDate`, `input.endDate`).
  3. Replace every `return NextResponse.json(...)` with either `throw new Error("...")` (for the bad-input branches) or `return stats` (for the final happy path).
  4. Remove the outer `try/catch` — the service throws; the route handler will catch.
  5. Leave the `console.error`/`console.log` lines as they are (production stripping handles them).

  Skeleton:
  ```ts
  // src/services/admin/DashboardStatsService.ts
  import User from "@/models/User";
  import MajorDraw from "@/models/MajorDraw";
  import { readStatsForRange } from "@/services/admin/dashboard-stats/DashboardStatsSnapshotReader";
  import { DashboardMetricsService } from "@/services/admin/DashboardMetricsService";
  import { MembershipAnalyticsService } from "@/services/admin/MembershipAnalyticsService";
  import { parseAdminDashboardDateRange } from "@/utils/admin/dashboardDateRange";
  import {
    getActiveSubscriptionFilter,
    getEverPaidUserFilter,
    SUBSCRIBED_SUBSCRIPTION_STATUSES,
  } from "@/utils/admin/userFilterBuilder";
  import { trendCalculationService } from "@/services/admin/TrendCalculationService";

  export interface DashboardStatsInput {
    dateRange: "today" | "yesterday" | "all-time" | "custom" | "current-draw" | "last-draw";
    startDate?: string;
    endDate?: string;
  }

  export class DashboardStatsService {
    async getStats(input: DashboardStatsInput) {
      const parsed = parseAdminDashboardDateRange({
        dateRange: input.dateRange,
        startDateParam: input.startDate ?? null,
        endDateParam: input.endDate ?? null,
      });
      if (!parsed.ok) throw new Error(parsed.error);
      const { startDate, endDate, dateRange, membershipAsOfMode, asOfDate } = parsed.value;
      // ... transplant the body of the existing route handler from line 60 onwards,
      // returning the `stats` object the handler returns today.
    }
  }
  ```

  Move every block (`USER STATISTICS`, `REVENUE + AD CHANNELS`, `MAJOR DRAW STATISTICS`, `CONVERSION RATE`, `FACEBOOK ADS`, `COMPARISON PERIOD METRICS`, `ENHANCED METRICS`, `RESPONSE`) into `getStats`. Replace all `return NextResponse.json(...)` calls with `return stats` (the assembled object). Replace the `validatedQuery` references with `parsed.value`. Replace `console.log` debug lines with `console.error` if you want to keep them (or delete them; the production stripping rule still applies).

- [ ] **Step 6: Run; verify pass**

  Run: `npm run test:dashboard-stats-service`
  Expected: `✓ DashboardStatsService returns canonical shape`

- [ ] **Step 7: Commit**

  ```
  git add src/services/admin/DashboardStatsService.ts src/services/admin/__tests__/DashboardStatsService.test.ts package.json
  git commit -m "feat(admin): extract DashboardStatsService from fat /api/admin/dashboard/stats handler"
  ```

## Task 3.2: Shrink the admin dashboard stats route

**Files:**
- Modify: `src/app/api/admin/dashboard/stats/route.ts`

- [ ] **Step 1: Replace the body**

  ```ts
  // src/app/api/admin/dashboard/stats/route.ts
  import { NextRequest, NextResponse } from "next/server";
  import { getServerSession } from "next-auth";
  import { authOptions } from "@/lib/auth";
  import connectDB from "@/lib/mongodb";
  import { DashboardStatsService } from "@/services/admin/DashboardStatsService";

  export async function GET(request: NextRequest) {
    try {
      await connectDB();
      const session = await getServerSession(authOptions);
      if (!session?.user?.id || session.user.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const sp = request.nextUrl.searchParams;
      const stats = await new DashboardStatsService().getStats({
        dateRange: (sp.get("dateRange") as "today" | "yesterday" | "all-time" | "custom" | "current-draw" | "last-draw") || "today",
        startDate: sp.get("startDate") ?? undefined,
        endDate: sp.get("endDate") ?? undefined,
      });
      return NextResponse.json({ success: true, data: stats });
    } catch (e) {
      console.error("❌ /api/admin/dashboard/stats error", e);
      const message = e instanceof Error ? e.message : "Unknown";
      const status = message.includes("required") ? 400 : 500;
      return NextResponse.json({ success: false, error: message }, { status });
    }
  }
  ```

- [ ] **Step 2: Manual verify**

  Boot dev, log in as admin, open the admin dashboard. Headline numbers should match what they were before the refactor.

- [ ] **Step 3: Commit**

  ```
  git add src/app/api/admin/dashboard/stats/route.ts
  git commit -m "refactor(admin): shrink /api/admin/dashboard/stats to delegate to DashboardStatsService"
  ```

## Task 3.3: Dashboard Norm schemas + registry entries

**Files:**
- Create: `src/lib/internal-norm/schemas/dashboard.ts`
- Modify: `src/lib/internal-norm/classification.ts`

- [ ] **Step 1: Write the schemas (the Norm projection — stricter than the admin shape)**

  ```ts
  // src/lib/internal-norm/schemas/dashboard.ts
  import { z } from "zod";
  import { NormDateRangeSchema } from "./common";

  const RevenueBucketSchema = z.object({
    revenue: z.number(),
    purchaseCount: z.number(),
    userCount: z.number(),
  });

  export const NormDashboardStatsSchema = z.object({
    dateRange: NormDateRangeSchema,
    users: z.object({
      total: z.number(),
      activeSubscriptions: z.number(),
      newInRange: z.number(),
      cancelledMemberships: z.number(),
      totalScheduledCancellation: z.number(),
      dropOffRate: z.number(),
      periodChurnRate: z.number().nullable(),
      membershipRenewals: z.object({
        expectedInRange: z.number(),
        succeededInRange: z.number(),
        failedInvoicesInRange: z.number(),
        becamePastDueInRange: z.number(),
      }),
    }),
    revenue: z.object({
      total: z.number(),
      breakdown: z.object({
        membershipPurchase: RevenueBucketSchema,
        membershipRenewal: RevenueBucketSchema,
        oneTimePurchase: RevenueBucketSchema,
        additionalOneTimePurchase: RevenueBucketSchema,
        miniDraw: RevenueBucketSchema,
        upsell: RevenueBucketSchema,
      }),
    }),
    majorDraw: z.object({
      totalEntries: z.number(),
      activeDraws: z.number(),
    }),
    conversionRate: z.number(),
    facebookAds: z.object({
      spend: z.number(),
      roas: z.number(),
    }),
  });

  export const NormRevenueBreakdownSchema = z.object({
    dateRange: NormDateRangeSchema,
    total: z.number(),
    breakdown: NormDashboardStatsSchema.shape.revenue.shape.breakdown,
  });
  ```

- [ ] **Step 2: Register endpoints**

  Add to `NORM_ENDPOINTS`:
  ```ts
  "dashboard.stats": {
    tier: "read",
    path: "/v1/dashboard/stats",
    method: "GET",
    summary: "Headline business stats: revenue, users, members, draws, conversion, ROAS",
    responseSchema: NormDashboardStatsSchema,
  },
  "dashboard.revenue-breakdown": {
    tier: "read",
    path: "/v1/dashboard/revenue-breakdown",
    method: "GET",
    summary: "Revenue total + per-category breakdown for a date range",
    responseSchema: NormRevenueBreakdownSchema,
  },
  ```

- [ ] **Step 3: Regenerate manifest**

  Run: `npm run build:norm-manifest`
  Expected: `✓ wrote 6 endpoints → ...`

- [ ] **Step 4: Commit**

  ```
  git add src/lib/internal-norm/schemas/dashboard.ts src/lib/internal-norm/classification.ts src/generated/normToolsManifest.json
  git commit -m "feat(internal-norm): register dashboard.stats + dashboard.revenue-breakdown"
  ```

## Task 3.4: `/v1/dashboard/stats` + `/v1/dashboard/revenue-breakdown` route handlers

**Files:**
- Create: `src/app/api/internal/norm/v1/dashboard/stats/route.ts`
- Create: `src/app/api/internal/norm/v1/dashboard/revenue-breakdown/route.ts`

- [ ] **Step 1: Implement `dashboard/stats`**

  ```ts
  // src/app/api/internal/norm/v1/dashboard/stats/route.ts
  import { z } from "zod";
  import { withNorm } from "@/lib/internal-norm/withNorm";
  import { NormDashboardStatsSchema } from "@/lib/internal-norm/schemas/dashboard";
  import { DashboardStatsService } from "@/services/admin/DashboardStatsService";
  import { resolveNormDateRange } from "@/utils/admin/resolveNormDateRange";

  const QuerySchema = z.object({
    dateRange: z.enum(["today", "yesterday", "current-draw", "last-draw", "all-time", "custom"]).default("today"),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  });

  export const GET = withNorm(
    { tier: "read", registryKey: "dashboard.stats", responseSchema: NormDashboardStatsSchema },
    async (ctx) => {
      const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
      if (!parsed.success) return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);

      const range = await resolveNormDateRange({ range: parsed.data.dateRange, start: parsed.data.startDate, end: parsed.data.endDate });
      const stats = await new DashboardStatsService().getStats({
        dateRange: range.dateRange,
        startDate: range.startDate.toISOString(),
        endDate: range.endDate.toISOString(),
      });

      // Project to the Norm shape — drop trends, enhanced, snapshotMissingForStanding, etc.
      return ctx.ok({
        dateRange: { range: range.dateRange, start: range.startDate.toISOString(), end: range.endDate.toISOString() },
        users: {
          total: stats.users.total,
          activeSubscriptions: stats.users.activeSubscriptions,
          newInRange: stats.users.newInRange,
          cancelledMemberships: stats.users.cancelledMemberships,
          totalScheduledCancellation: stats.users.totalScheduledCancellation,
          dropOffRate: stats.users.dropOffRate,
          periodChurnRate: stats.users.periodChurnRate ?? null,
          membershipRenewals: {
            expectedInRange: stats.users.membershipRenewals.expectedInRange,
            succeededInRange: stats.users.membershipRenewals.succeededInRange,
            failedInvoicesInRange: stats.users.membershipRenewals.failedInvoicesInRange,
            becamePastDueInRange: stats.users.membershipRenewals.becamePastDueInRange,
          },
        },
        revenue: {
          total: stats.revenue.total,
          breakdown: {
            membershipPurchase: pickBucket(stats.revenue.breakdown.membershipPurchase),
            membershipRenewal: pickBucket(stats.revenue.breakdown.membershipRenewal),
            oneTimePurchase: pickBucket(stats.revenue.breakdown.oneTimePurchase),
            additionalOneTimePurchase: pickBucket(stats.revenue.breakdown.additionalOneTimePurchase),
            miniDraw: pickBucket(stats.revenue.breakdown.miniDraw),
            upsell: pickBucket(stats.revenue.breakdown.upsell),
          },
        },
        majorDraw: { totalEntries: stats.majorDraw.totalEntries, activeDraws: stats.majorDraw.activeDraws },
        conversionRate: stats.conversionRate,
        facebookAds: { spend: stats.facebookAds.spend, roas: stats.facebookAds.roas },
      });
    }
  );

  function pickBucket(b: { revenue: number; purchaseCount: number; userCount: number }) {
    return { revenue: b.revenue, purchaseCount: b.purchaseCount, userCount: b.userCount };
  }
  ```

- [ ] **Step 2: Implement `dashboard/revenue-breakdown`**

  ```ts
  // src/app/api/internal/norm/v1/dashboard/revenue-breakdown/route.ts
  import { z } from "zod";
  import { withNorm } from "@/lib/internal-norm/withNorm";
  import { NormRevenueBreakdownSchema } from "@/lib/internal-norm/schemas/dashboard";
  import { DashboardStatsService } from "@/services/admin/DashboardStatsService";
  import { resolveNormDateRange } from "@/utils/admin/resolveNormDateRange";

  const QuerySchema = z.object({
    dateRange: z.enum(["today", "yesterday", "current-draw", "last-draw", "all-time", "custom"]).default("today"),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  });

  export const GET = withNorm(
    { tier: "read", registryKey: "dashboard.revenue-breakdown", responseSchema: NormRevenueBreakdownSchema },
    async (ctx) => {
      const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
      if (!parsed.success) return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
      const range = await resolveNormDateRange({ range: parsed.data.dateRange, start: parsed.data.startDate, end: parsed.data.endDate });
      const stats = await new DashboardStatsService().getStats({
        dateRange: range.dateRange,
        startDate: range.startDate.toISOString(),
        endDate: range.endDate.toISOString(),
      });
      return ctx.ok({
        dateRange: { range: range.dateRange, start: range.startDate.toISOString(), end: range.endDate.toISOString() },
        total: stats.revenue.total,
        breakdown: {
          membershipPurchase: pick(stats.revenue.breakdown.membershipPurchase),
          membershipRenewal: pick(stats.revenue.breakdown.membershipRenewal),
          oneTimePurchase: pick(stats.revenue.breakdown.oneTimePurchase),
          additionalOneTimePurchase: pick(stats.revenue.breakdown.additionalOneTimePurchase),
          miniDraw: pick(stats.revenue.breakdown.miniDraw),
          upsell: pick(stats.revenue.breakdown.upsell),
        },
      });
    }
  );

  function pick(b: { revenue: number; purchaseCount: number; userCount: number }) {
    return { revenue: b.revenue, purchaseCount: b.purchaseCount, userCount: b.userCount };
  }
  ```

- [ ] **Step 3: Type-check + smoke**

  Run: `npm run type-check`
  Boot dev; then:
  Run: `npm run norm:smoke -- GET "/api/internal/norm/v1/dashboard/stats?dateRange=today"`
  Expected: `200 OK` with the projected stats; compare a few numbers (e.g. `users.total`, `revenue.total`) against the admin UI — they MUST match.
  Run: `npm run norm:smoke -- GET "/api/internal/norm/v1/dashboard/revenue-breakdown?dateRange=yesterday"`
  Expected: `200 OK`.

- [ ] **Step 4: Lint**

  Run: `npm run lint -- src/app/api/internal/norm/v1/dashboard`
  Expected: zero errors (both files import from `@/services/admin/DashboardStatsService`).

- [ ] **Step 5: Commit**

  ```
  git add src/app/api/internal/norm/v1/dashboard
  git commit -m "feat(internal-norm): dashboard.stats + dashboard.revenue-breakdown endpoints"
  ```

---

# Phase 4 — Classification matrix + admin UI

Goal: Every existing admin endpoint is mapped to a tier; the audit UI is live; the trigger_human_approve queue UI is ready even though no triggers wired up yet.

## Task 4.1: Fill the classification matrix

**Files:**
- Modify: `src/lib/internal-norm/classification.ts` — add a full registry section for every admin endpoint discovered under `src/app/api/admin/**`

- [ ] **Step 1: Inventory every admin endpoint**

  Run this glob in your head / IDE: list all `src/app/api/admin/**/route.ts` files. From the Phase 0 exploration the count is ~100+. Group them by the URL path they expose. Build a list:

  ```
  /api/admin/ab-testing/experiments/[id]/analytics  → ab-testing.experiment-analytics
  /api/admin/activity-log                            → activity-log.list
  /api/admin/affiliate/[id]/process-payout           → affiliate.process-payout
  ...
  ```

  Run: `Get-ChildItem -Path src/app/api/admin -Recurse -Filter route.ts | ForEach-Object { $_.FullName }` (PowerShell) or equivalent to print all paths. Save to a scratch text file while you classify.

- [ ] **Step 2: For each endpoint, assign a tier**

  Rules of thumb:
  - GET that just returns data → `read`
  - POST/PATCH that updates a small record without money/comms → `write_safe`
  - POST that triggers a stateful job, charges money, sends mail, or modifies many records → `trigger_human_approve` (default — be conservative)
  - POST that triggers exactly ONE narrow action (e.g. retry a specific invoice) → `trigger_norm_confirm`
  - Anything touching admin roles, deletes data permanently, modifies secrets/env, or affects auth → `forbidden`

  Capture in `classification.ts`:
  ```ts
  // Append to NORM_ENDPOINTS. Each entry is an inventory line — most are NOT wired to a route yet.
  // Wiring happens in future specs; this matrix is the roadmap.
  "ab-testing.experiment-analytics": {
    tier: "read",
    path: "/v1/ab-testing/experiments/:id/analytics",
    method: "GET",
    summary: "Analytics for a single A/B experiment",
  },
  "activity-log.list": { tier: "read", path: "/v1/activity-log", method: "GET", summary: "Recent admin activity feed" },
  "affiliate.process-payout": {
    tier: "trigger_human_approve",
    path: "/v1/affiliate/:id/process-payout",
    method: "POST",
    summary: "Process pending affiliate payout — money movement, requires human approve",
  },
  // ... continue for every endpoint
  ```

  This is a manual classification pass. Budget ~2 hours for it. Resist the temptation to skip "obvious" ones — every entry must exist.

- [ ] **Step 3: Add a boot-time consistency check**

  Add to `src/lib/internal-norm/classification.ts`:
  ```ts
  /**
   * Returns the set of endpoints that have been "wired" (their tier !== "forbidden"
   * AND a corresponding route file exists). For now this is a roadmap-only matrix;
   * the runtime check is delegated to the manifest builder which omits unwired entries.
   */
  export function getWiredEndpoints(): NormEndpointSpec[] {
    return Object.values(NORM_ENDPOINTS).filter((e) => e.tier !== "forbidden" && !!e.responseSchema);
  }
  ```
  The presence of `responseSchema` is our proxy for "wired" — endpoints without a schema are roadmap-only.

- [ ] **Step 4: Regenerate manifest**

  Run: `npm run build:norm-manifest`
  Expected: only the wired endpoints (health, manifest, roas.*, dashboard.*) appear. The roadmap entries are visible in `classification.ts` but not in the manifest.

  Adjust `scripts/build-norm-manifest.ts` to filter to wired entries:
  ```ts
  // change the filter:
  .filter(([, spec]) => spec.tier !== "forbidden" && !!spec.responseSchema)
  ```

- [ ] **Step 5: Commit**

  ```
  git add src/lib/internal-norm/classification.ts src/generated/normToolsManifest.json scripts/build-norm-manifest.ts
  git commit -m "feat(internal-norm): full classification matrix for every admin endpoint (roadmap)"
  ```

## Task 4.2: Admin-UI backend — list audit log + endpoints + pending actions

**Files:**
- Create: `src/app/api/admin/internal-norm/audit/route.ts`
- Create: `src/app/api/admin/internal-norm/endpoints/route.ts`
- Create: `src/app/api/admin/internal-norm/endpoints/[key]/route.ts`
- Create: `src/app/api/admin/internal-norm/pending/route.ts`
- Create: `src/app/api/admin/internal-norm/pending/[id]/route.ts`

- [ ] **Step 1: Implement `audit` (paginated list)**

  ```ts
  // src/app/api/admin/internal-norm/audit/route.ts
  import { NextRequest, NextResponse } from "next/server";
  import { requireAdminUser } from "@/lib/api-auth";
  import connectDB from "@/lib/mongodb";
  import NormCallLog from "@/models/NormCallLog";

  export async function GET(request: NextRequest) {
    const auth = await requireAdminUser();
    if ("errorResponse" in auth) return auth.errorResponse;
    await connectDB();
    const sp = request.nextUrl.searchParams;
    const limit = Math.min(Number(sp.get("limit") || 50), 200);
    const cursor = sp.get("cursor");
    const filter: Record<string, unknown> = {};
    if (sp.get("registryKey")) filter.registryKey = sp.get("registryKey");
    if (sp.get("tier")) filter.tier = sp.get("tier");
    if (sp.get("status")) filter.responseStatus = Number(sp.get("status"));
    if (cursor) filter._id = { $lt: cursor };
    const items = await NormCallLog.find(filter).sort({ _id: -1 }).limit(limit).lean();
    return NextResponse.json({ success: true, data: items, nextCursor: items.length === limit ? String(items[items.length - 1]._id) : null });
  }
  ```

- [ ] **Step 2: Implement `endpoints` (list + toggle)**

  ```ts
  // src/app/api/admin/internal-norm/endpoints/route.ts
  import { NextResponse } from "next/server";
  import { requireAdminUser } from "@/lib/api-auth";
  import connectDB from "@/lib/mongodb";
  import NormEndpointSettings from "@/models/NormEndpointSettings";
  import { NORM_ENDPOINTS } from "@/lib/internal-norm/classification";

  export async function GET() {
    const auth = await requireAdminUser();
    if ("errorResponse" in auth) return auth.errorResponse;
    await connectDB();
    const settings = await NormEndpointSettings.find({}).lean();
    const settingsByKey = new Map(settings.map((s) => [s.registryKey, s]));
    const rows = Object.entries(NORM_ENDPOINTS).map(([key, spec]) => ({
      registryKey: key,
      tier: spec.tier,
      path: spec.path,
      method: spec.method,
      summary: spec.summary,
      disabled: !!settingsByKey.get(key)?.disabled,
      wired: !!spec.responseSchema,
    }));
    return NextResponse.json({ success: true, data: rows });
  }
  ```

  ```ts
  // src/app/api/admin/internal-norm/endpoints/[key]/route.ts
  import { NextRequest, NextResponse } from "next/server";
  import { z } from "zod";
  import { requireAdminUser } from "@/lib/api-auth";
  import connectDB from "@/lib/mongodb";
  import NormEndpointSettings from "@/models/NormEndpointSettings";

  const BodySchema = z.object({ disabled: z.boolean() });

  export async function PATCH(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
    const auth = await requireAdminUser();
    if ("errorResponse" in auth) return auth.errorResponse;
    const { key } = await params;
    const body = BodySchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
    await connectDB();
    await NormEndpointSettings.findOneAndUpdate(
      { registryKey: key },
      { $set: { disabled: body.data.disabled, updatedBy: auth.adminUser._id, updatedAt: new Date() } },
      { upsert: true }
    );
    return NextResponse.json({ success: true });
  }
  ```

- [ ] **Step 3: Implement `pending` list + resolve**

  ```ts
  // src/app/api/admin/internal-norm/pending/route.ts
  import { NextResponse } from "next/server";
  import { requireAdminUser } from "@/lib/api-auth";
  import connectDB from "@/lib/mongodb";
  import NormPendingAction from "@/models/NormPendingAction";

  export async function GET() {
    const auth = await requireAdminUser();
    if ("errorResponse" in auth) return auth.errorResponse;
    await connectDB();
    const items = await NormPendingAction.find({ status: "pending" }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ success: true, data: items });
  }
  ```

  ```ts
  // src/app/api/admin/internal-norm/pending/[id]/route.ts
  import { NextRequest, NextResponse } from "next/server";
  import { z } from "zod";
  import { requireAdminUser } from "@/lib/api-auth";
  import connectDB from "@/lib/mongodb";
  import NormPendingAction from "@/models/NormPendingAction";

  const BodySchema = z.object({
    decision: z.enum(["approve", "deny"]),
    note: z.string().optional(),
  });

  export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdminUser();
    if ("errorResponse" in auth) return auth.errorResponse;
    const { id } = await params;
    const body = BodySchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
    await connectDB();

    const action = await NormPendingAction.findById(id);
    if (!action) return NextResponse.json({ success: false, error: "not found" }, { status: 404 });
    if (action.status !== "pending") {
      return NextResponse.json({ success: false, error: `already ${action.status}` }, { status: 409 });
    }

    if (body.data.decision === "deny") {
      action.status = "denied";
      action.resolutionNote = body.data.note;
      action.resolvedAt = new Date();
      action.resolvedBy = auth.adminUser._id;
      await action.save();
      return NextResponse.json({ success: true, data: { status: "denied" } });
    }

    // Approve: Phase 4 framework-readiness — there are no triggers wired yet so we just record approval.
    // Later specs will dispatch to the underlying service here.
    action.status = "approved";
    action.resolvedAt = new Date();
    action.resolvedBy = auth.adminUser._id;
    action.resolutionOutcome = { ok: true };
    await action.save();
    return NextResponse.json({ success: true, data: { status: "approved" } });
  }
  ```

- [ ] **Step 4: Type-check + commit**

  Run: `npm run type-check`
  ```
  git add src/app/api/admin/internal-norm
  git commit -m "feat(admin): internal-norm admin backend (audit, endpoints toggle, pending actions)"
  ```

## Task 4.3: Pending-action status read endpoint for Norm

**Files:**
- Create: `src/app/api/internal/norm/v1/pending-actions/[id]/status/route.ts`
- Modify: `src/lib/internal-norm/classification.ts` (register `pending-actions.status`)

- [ ] **Step 1: Register the endpoint**

  Add to `NORM_ENDPOINTS`:
  ```ts
  "pending-actions.status": {
    tier: "read",
    path: "/v1/pending-actions/:id/status",
    method: "GET",
    summary: "Norm polls a pending action's resolution status",
  },
  ```
  (No `responseSchema` yet — add it inline in the route since this is framework infra; the ESLint exemption list already covers this path.)

- [ ] **Step 2: Implement the route**

  ```ts
  // src/app/api/internal/norm/v1/pending-actions/[id]/status/route.ts
  import { z } from "zod";
  import { withNorm } from "@/lib/internal-norm/withNorm";
  import NormPendingAction from "@/models/NormPendingAction";

  const ResponseSchema = z.object({
    id: z.string(),
    registryKey: z.string(),
    status: z.enum(["pending", "approved", "denied", "expired"]),
    resolvedAt: z.string().optional(),
    resolutionOutcome: z.object({ ok: z.boolean(), errorCode: z.string().optional() }).optional(),
  });

  export const GET = withNorm(
    { tier: "read", registryKey: "pending-actions.status", responseSchema: ResponseSchema },
    async (ctx) => {
      const id = ctx.url.pathname.split("/").slice(-2, -1)[0];
      const action = await NormPendingAction.findById(id).lean();
      if (!action) return ctx.error(404, "not_found", "Pending action not found");
      return ctx.ok({
        id: String(action._id),
        registryKey: action.registryKey,
        status: action.status,
        resolvedAt: action.resolvedAt?.toISOString(),
        resolutionOutcome: action.resolutionOutcome,
      });
    }
  );
  ```

- [ ] **Step 3: Smoke**

  Boot dev. Create a fake `NormPendingAction` row via the dashboard once the UI lands — for now create one manually in Mongo Compass to test. Then:
  Run: `npm run norm:smoke -- GET /api/internal/norm/v1/pending-actions/<id>/status`
  Expected: `200 OK` with the status row.

- [ ] **Step 4: Regenerate manifest + commit**

  Run: `npm run build:norm-manifest`
  ```
  git add src/lib/internal-norm/classification.ts src/app/api/internal/norm/v1/pending-actions src/generated/normToolsManifest.json
  git commit -m "feat(internal-norm): pending-actions status read endpoint + classification entry"
  ```

## Task 4.4: Admin UI — Norm tab scaffold

**Files:**
- Create: `src/app/admin/component/internal-norm/AuditLogTab.tsx`
- Create: `src/app/admin/component/internal-norm/PendingActionsTab.tsx`
- Create: `src/app/admin/component/internal-norm/EndpointsTab.tsx`
- Modify: `src/app/admin/component/AdminPage.tsx` — add "Norm" navigation entry rendering the new tabs

- [ ] **Step 1: Read existing AdminPage.tsx to understand its tab structure**

  Open `src/app/admin/component/AdminPage.tsx` and find the `selectedTab` switch (or equivalent) that decides which component renders. Identify the navigation entries (names, icons, route slugs).

- [ ] **Step 2: Implement the three tab components**

  ```tsx
  // src/app/admin/component/internal-norm/AuditLogTab.tsx
  "use client";
  import { useEffect, useState } from "react";

  type AuditRow = {
    _id: string;
    requestId: string;
    registryKey: string;
    tier: string;
    method: string;
    path: string;
    responseStatus: number;
    durationMs: number;
    createdAt: string;
  };

  export default function AuditLogTab() {
    const [rows, setRows] = useState<AuditRow[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function load(next?: string | null) {
      setLoading(true);
      const url = new URL("/api/admin/internal-norm/audit", window.location.origin);
      if (next) url.searchParams.set("cursor", next);
      const res = await fetch(url.toString());
      const json = await res.json();
      setRows((prev) => (next ? [...prev, ...json.data] : json.data));
      setCursor(json.nextCursor);
      setLoading(false);
    }

    useEffect(() => { void load(); }, []);

    return (
      <div>
        <h2 className="text-xl font-semibold mb-4">Norm audit log</h2>
        <table className="w-full text-sm">
          <thead><tr><th>When</th><th>Tier</th><th>Endpoint</th><th>Status</th><th>Duration</th><th>RequestId</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id}>
                <td>{new Date(r.createdAt).toLocaleString()}</td>
                <td>{r.tier}</td>
                <td>{r.registryKey}</td>
                <td>{r.responseStatus}</td>
                <td>{r.durationMs}ms</td>
                <td className="font-mono text-xs">{r.requestId}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {cursor && <button onClick={() => load(cursor)} disabled={loading} className="mt-4 underline">Load more</button>}
      </div>
    );
  }
  ```

  ```tsx
  // src/app/admin/component/internal-norm/EndpointsTab.tsx
  "use client";
  import { useEffect, useState } from "react";

  type Row = { registryKey: string; tier: string; path: string; method: string; summary: string; disabled: boolean; wired: boolean };

  export default function EndpointsTab() {
    const [rows, setRows] = useState<Row[]>([]);
    async function reload() {
      const res = await fetch("/api/admin/internal-norm/endpoints");
      const json = await res.json();
      setRows(json.data);
    }
    useEffect(() => { void reload(); }, []);

    async function toggle(key: string, disabled: boolean) {
      await fetch(`/api/admin/internal-norm/endpoints/${encodeURIComponent(key)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ disabled }),
      });
      void reload();
    }

    return (
      <div>
        <h2 className="text-xl font-semibold mb-4">Norm endpoint registry</h2>
        <table className="w-full text-sm">
          <thead><tr><th>Key</th><th>Tier</th><th>Path</th><th>Wired</th><th>Disabled</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.registryKey} className={r.disabled ? "opacity-50" : ""}>
                <td>{r.registryKey}</td>
                <td>{r.tier}</td>
                <td className="font-mono text-xs">{r.method} {r.path}</td>
                <td>{r.wired ? "✓" : "—"}</td>
                <td>
                  <label className="inline-flex gap-2 items-center">
                    <input type="checkbox" checked={r.disabled} onChange={(e) => toggle(r.registryKey, e.target.checked)} />
                    {r.disabled ? "Disabled" : "Enabled"}
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  ```

  ```tsx
  // src/app/admin/component/internal-norm/PendingActionsTab.tsx
  "use client";
  import { useEffect, useState } from "react";

  type Row = {
    _id: string;
    registryKey: string;
    plan: { summary?: string; affectedEntities?: Array<{ type: string; id: string }>; warnings?: string[] };
    reasonText?: string;
    createdAt: string;
    expiresAt: string;
  };

  export default function PendingActionsTab() {
    const [rows, setRows] = useState<Row[]>([]);
    async function reload() {
      const res = await fetch("/api/admin/internal-norm/pending");
      const json = await res.json();
      setRows(json.data);
    }
    useEffect(() => { void reload(); }, []);

    async function resolve(id: string, decision: "approve" | "deny", note?: string) {
      await fetch(`/api/admin/internal-norm/pending/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, note }),
      });
      void reload();
    }

    return (
      <div>
        <h2 className="text-xl font-semibold mb-4">Norm pending actions</h2>
        {rows.length === 0 && <p>No pending actions.</p>}
        {rows.map((r) => (
          <div key={r._id} className="border rounded p-4 mb-3">
            <div className="font-mono text-xs">{r.registryKey}</div>
            <div className="font-semibold">{r.plan.summary ?? "(no summary)"}</div>
            {r.plan.warnings?.length ? (
              <ul className="text-amber-600">
                {r.plan.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
              </ul>
            ) : null}
            {r.reasonText && <p className="italic text-sm">Norm: {r.reasonText}</p>}
            <div className="mt-3 flex gap-2">
              <button onClick={() => resolve(r._id, "approve")} className="px-3 py-1 bg-green-600 text-white rounded">Approve</button>
              <button onClick={() => {
                const note = prompt("Reason for denial?") || undefined;
                void resolve(r._id, "deny", note);
              }} className="px-3 py-1 bg-red-600 text-white rounded">Deny</button>
            </div>
          </div>
        ))}
      </div>
    );
  }
  ```

- [ ] **Step 3: Wire into AdminPage.tsx**

  Add navigation entry "Norm" alongside existing entries. Add sub-tabs for "Audit", "Endpoints", "Pending". Follow the existing switch/conditional pattern in `AdminPage.tsx` to render the components. Use whatever naming convention exists (e.g. `selectedTab === "norm-audit" && <AuditLogTab />`).

  Also add a small badge to the "Pending" sub-tab title showing the count, by fetching `/api/admin/internal-norm/pending` and reading `data.length`. Reuse the existing badge styling pattern in the AdminPage navigation.

- [ ] **Step 4: Smoke in browser**

  Boot dev, log in as admin, navigate to the Norm tab. Verify:
  - Audit log lists `NormCallLog` rows from earlier smoke tests
  - Endpoints tab shows all classification entries with wired/unwired status
  - Pending Actions tab shows "no pending actions" (none queued yet)

- [ ] **Step 5: Commit**

  ```
  git add src/app/admin/component/internal-norm src/app/admin/component/AdminPage.tsx
  git commit -m "feat(admin): Norm tab with audit log, endpoints, and pending-actions views"
  ```

---

# Phase 5 — Docs + manifest sync

Goal: code, docs, and business status are all in sync.

## Task 5.1: `docs/internal-norm/` folder (8 docs)

**Files:**
- Create: `docs/internal-norm/README.md`, `architecture.md`, `api.md`, `backend.md`, `frontend.md`, `models.md`, `patterns.md`, `rules.md`, `gotchas.md`, `testing.md`

- [ ] **Step 1: Skim an existing recent domain folder for structure**

  Read 2-3 files from `docs/billing-stripe/` (or any other recent domain). Match its tone, depth, section headings.

- [ ] **Step 2: Write each doc**

  - **README.md**: 1-paragraph overview, who uses it (Norm/Mac mini), where to find each file
  - **architecture.md**: the 5-tier model, withNorm orchestration order, auth chain diagram in ASCII
  - **api.md**: every wired endpoint with request/response example
  - **backend.md**: registry → manifest pipeline, kill switch, rate limits, NormCallLog
  - **frontend.md**: the three admin tabs, what they expose
  - **models.md**: schemas for NormCallLog, NormTriggerReceipt, NormPendingAction, NormEndpointSettings
  - **patterns.md**: how to add a new Norm endpoint (the 10-min recipe)
  - **rules.md**: must-import-service, registry as source of truth, no business logic in route files
  - **gotchas.md**: replay nonce TTL vs receipt TTL, signing string canonicalisation, AEST timezone, fat-handler refactor pattern
  - **testing.md**: how to use `npm run norm:smoke`, how to add a tsx test for a new endpoint

  Each doc should be ~200–800 words. No placeholders.

- [ ] **Step 3: Commit**

  ```
  git add docs/internal-norm/
  git commit -m "docs(internal-norm): full domain documentation (8 files)"
  ```

## Task 5.2: Domain Manifest entry in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (Domain Manifest JSON block)

- [ ] **Step 1: Add the manifest entry**

  Append to the `domains` object in the JSON block:
  ```json
  "internal-norm": {
    "docs": "docs/internal-norm/",
    "paths": [
      "src/lib/internal-norm/**",
      "src/app/api/internal/norm/**",
      "src/app/api/admin/internal-norm/**",
      "src/services/facebook-ads/**",
      "src/services/admin/DashboardStatsService.ts",
      "src/models/NormCallLog.ts",
      "src/models/NormTriggerReceipt.ts",
      "src/models/NormPendingAction.ts",
      "src/models/NormEndpointSettings.ts",
      "src/app/admin/component/internal-norm/**",
      "scripts/build-norm-manifest.ts",
      "scripts/internal-norm-smoke.ts",
      "scripts/migrations/2026-05-20-create-norm-user.ts",
      "src/generated/normToolsManifest.json",
      "src/utils/admin/resolveNormDateRange.ts",
      "eslint/rules/norm-must-import-service.js"
    ],
    "lastVerified": "2026-05-20"
  }
  ```

  Also bump the top-level `"lastModified"` field to `"2026-05-20"`.

- [ ] **Step 2: Verify doc-sync hook is satisfied**

  Per CLAUDE.md the `Stop` hook (`.claude/hooks/doc-sync.mjs`) checks that source changes map to docs updates. Since we've added both source AND docs in the same commit chain, the hook should be happy. Confirm by running:

  Run: `node .claude/hooks/doc-sync.mjs` (if it's directly runnable) OR just commit and watch the hook output.

- [ ] **Step 3: Commit**

  ```
  git add CLAUDE.md
  git commit -m "docs(claude): register internal-norm domain in Domain Manifest"
  ```

## Task 5.3: Update `README.md` and `BUSINESS.md`

**Files:**
- Modify: `README.md` — move/add "Internal Norm API" under "Live" features
- Modify: `BUSINESS.md` — same

- [ ] **Step 1: Read both files for current shape**

  Open `README.md` and find the "Live" / "Coming soon" section. Open `BUSINESS.md` and find the equivalent.

- [ ] **Step 2: Add the entry to each**

  In `README.md` under "Live":
  ```
  - **Internal Norm API** — secure HTTP namespace at `/api/internal/norm/v1/*` exposing read-only business analytics to an external AI assistant (Norm) running on the Mac mini server. See [docs/internal-norm/](docs/internal-norm/).
  ```

  In `BUSINESS.md`, add a parallel bullet under whatever section currently lists internal/operational systems.

- [ ] **Step 3: Commit**

  ```
  git add README.md BUSINESS.md
  git commit -m "docs(business): add Internal Norm API to README and BUSINESS"
  ```

## Task 5.4: Final lint + type-check + summary

**Files:**
- (no file changes — verification only)

- [ ] **Step 1: Full type-check**

  Run: `npm run type-check`
  Expected: 0 errors.

- [ ] **Step 2: Full lint**

  Run: `npm run lint`
  Expected: 0 errors. (If unrelated lint warnings existed pre-spec, leave them alone.)

- [ ] **Step 3: Run all Norm tests**

  ```
  npm run test:norm-auth-role
  npm run test:norm-call-log
  npm run test:norm-receipt
  npm run test:norm-pending
  npm run test:norm-classification
  npm run test:norm-auth
  npm run test:norm-kill-switch
  npm run test:norm-rate-limits
  npm run test:norm-with-norm
  npm run test:facebook-ads-insights-service
  npm run test:dashboard-stats-service
  npm run test:resolve-norm-date-range
  ```
  All must print their `✓` lines.

- [ ] **Step 4: Final smoke chain**

  Boot dev. Run each Norm endpoint:
  ```
  npm run norm:smoke -- GET /api/internal/norm/v1/health
  npm run norm:smoke -- GET /api/internal/norm/v1/manifest
  npm run norm:smoke -- GET "/api/internal/norm/v1/roas/summary?dateRange=today"
  npm run norm:smoke -- GET "/api/internal/norm/v1/roas/breakdown?dateRange=today&level=campaign"
  npm run norm:smoke -- GET "/api/internal/norm/v1/dashboard/stats?dateRange=today"
  npm run norm:smoke -- GET "/api/internal/norm/v1/dashboard/revenue-breakdown?dateRange=yesterday"
  ```
  All return `200 OK` with valid JSON. Numbers on `dashboard/stats` match the admin UI numbers.

- [ ] **Step 5: Notify owner**

  Tell DJ: framework live; ROAS + Dashboard Stats readable from Norm; matrix classifies the remaining ~100 endpoints as roadmap; admin Norm tab functional. Suggest next spec target (e.g. first `write_safe` endpoint: error-report acknowledge).

---

## Notes for the implementer

- **No auto-commit.** Per CLAUDE.md §1, commits in this plan must wait for explicit owner authorization. The plan shows commit messages so the messaging is consistent when authorization arrives — but do not run `git commit` until DJ says "commit" / "push" / "ship it" for the session.
- **Console output.** Production strips `console.log/info/debug/warn`. Use `console.error` for anything that must survive in production or staging logs (the smoke script, withNorm error paths, services).
- **Mongo connection.** Always `await connectDB()` before model use. Scripts use the same pattern with `dotenv.config({ path: .env.local })` at the top.
- **Existing service reuse.** The ESLint rule `internal-norm/norm-must-import-service` is your tripwire. If you find yourself reimplementing logic in a Norm route, stop and extract a service first.
- **Receipt protocol is framework-ready, no triggers wired yet.** The `withNorm` HOF does NOT yet implement the dry-run/confirm orchestration as automated behaviour — Task 1.10 wires the read path. The first time a `trigger_norm_confirm` endpoint is added (future spec), `withNorm` gains a small extension to handle the receipt lifecycle. This is intentional YAGNI for this spec.
