# Playwright E2E Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Playwright e2e foundation from the approved spec (`docs/superpowers/specs/2026-07-21-playwright-e2e-foundation-design.md`): isolated wipe-safe e2e DB, orchestrated server + Stripe webhook listener, three-browser suite with expert-lens fixtures, full purchase→webhook→entries coverage, proof mode with narrated videos, and MCP authoring bridge.

**Architecture:** A `tsx` orchestrator (`e2e/run.ts`) owns environment overlay, safety guards, seeding, child processes (Next server + `stripe listen`), then delegates to `playwright test`. Playwright config has NO `webServer` — the orchestrator is the only boot path. All e2e code lives in `e2e/` (zero `src/` changes), with pure logic unit-tested via the repo's tsx-test convention.

**Tech Stack:** `@playwright/test@^1.61`, `@axe-core/playwright@^4.12`, `ffmpeg-static@^5.3`, `msedge-tts@^2.0`, `tsx`, `bcryptjs` (already a dependency), Stripe CLI (machine prerequisite).

## Global Constraints

- **No commits without authorization.** CLAUDE.md rule 1: every "Commit" step below runs ONLY after DJ has authorized commits this session (keywords: commit/push/etc.). If unauthorized, complete the step's work, skip the commit, and tell DJ what's pending.
- **No `src/**` modifications.** This foundation is additive. The only file outside `e2e/`, docs, root configs touched is `scripts/check-env.mjs` (allowlist) — its task also touches `docs/infrastructure/` (doc-sync hook).
- **Verified environment facts (do not re-derive):** app reads `MONGODB_URI` at runtime ([src/lib/mongodb.ts:5-13](../../src/lib/mongodb.ts)); webhook route reads `STRIPE_WEBHOOK_SECRET` ([src/app/api/stripe/webhook/route.ts:29](../../src/app/api/stripe/webhook/route.ts)) and processes in-process via `after()` (route.ts:47-49); tier catalog is STATIC code ([src/data/membershipPackages.ts:68](../../src/data/membershipPackages.ts) — Tradie=$20/15 entries) with Stripe ids from `STRIPE_{PRICE,PRODUCT}_ID_{TRADIE,FOREMAN,BOSS}` env; entries land in `majordraws.entries[]` (atomic `$inc`/`$push`, [src/utils/payment/payment-processing.ts:2253](../../src/utils/payment/payment-processing.ts)); exactly-once proof = one `paymentevents` doc `_id: "BenefitsGranted-invoice_<id>"` (one-time: `BenefitsGranted-pi_<id>"`, unique index [src/models/PaymentEvent.ts:149](../../src/models/PaymentEvent.ts)); login rejects passwordless users ([src/lib/auth.ts:90-96](../../src/lib/auth.ts)), compares `bcryptjs` hashes (auth.ts:105), does NOT require `isEmailVerified`; `/api/auth/register` creates PASSWORDLESS users and does NOT log in; module-scope env throws: `STRIPE_SECRET_KEY` (src/lib/stripe.ts:3-5), `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID/SECRET` (src/lib/auth.ts:22-39); Klaviyo no-ops when `KLAVIYO_ENABLED=false`, SendGrid/Meta/TikTok no-op with blank keys; there is NO `/api/health` — DB-touching probe is `/api/test-db`; middleware sends non-admin `/admin` visitors to `/`, unauth `/my-account` to `/login`; login form: `input[name="email"]`, `input[name="password"]`, button "Sign in"; registration step-1 inputs: `name="firstName"|"lastName"|"email"|"phone"`, button "REGISTER"; membership card CTA label: `Choose Tradie` (etc.); decline copy: "Card Declined" / "Your card was declined."
- **Machine prerequisites (DJ, one-time, before Task 3 verification):** (1) Stripe CLI installed + `stripe login` on the same test account as `.env.local`'s `sk_test_` key; (2) add to `.env.local`: `E2E_MONGODB_URI` (same cluster is fine, database name MUST contain `e2e`, e.g. `...mongodb.net/toolsaustralia-e2e?...`) and optionally `E2E_PORT` (default 3799).
- **Selector refinement rule:** payment-sheet selectors (Stripe iframe internals, pay-button label, success screen) are best-effort from code reading. If one fails live, do NOT guess in the dark: run `npm run e2e:env` and inspect the live DOM (Playwright MCP or `npx playwright codegen http://localhost:3799`), then fix the selector. Never "fix" by weakening an assertion.
- **Legal copy (CLAUDE.md §11):** any string these tests inject or assert must use free-entry framing; the banned-vocabulary list in Task 6 is the reference.

## File Structure (final state)

```
playwright.config.ts              projects, tags via grep, proof-mode profile
e2e/
  run.ts                          orchestrator CLI (modes: default, --env-only, --ui, --proof)
  lib/
    env.ts                        overlay + safety guard (pure, unit-tested)
    paths.ts                      shared artifact/auth path constants
    processes.ts                  child-process launch/teardown (Windows-safe)
    health.ts                     waitForHttpOk
    __tests__/env.test.ts         tsx unit test (test:e2e-env)
  seed/
    index.ts                      wipeAndSeed() entry
    users.ts                      seedMember/seedAdmin (bcryptjs, template from scripts/seed-active-member.ts:223-261)
    draw.ts                       seedMajorDraw()
  helpers/
    db.ts                         e2e-DB connection + assertion queries + createLoginableUser
    session.ts                    loginViaUi()
    payment.ts                    fillPaymentElement(), waitForBenefits()
  fixtures/
    test.ts                       extended test: watchdog (auto), demo, freshUser
    demo.ts                       caption overlay + narration sidecar + pacing
    ui-audit.ts                   uiAudit(page)
  setup/auth.setup.ts             storage states (member, admin)
  specs/
    auth/login.spec.ts            @smoke
    auth/registration.spec.ts     @smoke (guest bridge, no-auto-login)
    marketing/landing.spec.ts     @smoke @demo
    marketing/mini-draws.spec.ts  @smoke
    marketing/legal-copy.spec.ts  @smoke (compliance lens)
    membership/modal.spec.ts      @smoke @demo
    membership/purchase-subscription.spec.ts   @purchase @demo
    membership/purchase-one-time.spec.ts       @purchase
    membership/purchase-decline.spec.ts        @purchase
    membership/purchase-idempotency.spec.ts    @purchase
    membership/webhook-replay.spec.ts          @purchase
    account/my-account.spec.ts    @smoke @demo
    admin/admin-gate.spec.ts      @smoke @admin
    quality/a11y.spec.ts          @a11y
    quality/visual.spec.ts        @visual
    quality/lenses-selftest.spec.ts  (proves watchdog + axe bite)
  proof/
    srt.ts                        pure srt/timing builders (unit-tested)
    __tests__/srt.test.ts         tsx unit test (test:e2e-srt)
    post.ts                       webm→mp4, burn subtitles, best-effort TTS mux
docs/e2e/                         new domain docs (Task 13)
e2e-artifacts/                    gitignored (reports, videos, auth states, logs, proof)
```

---

### Task 1: Dependencies, Playwright config, scripts, env registry

**Files:**
- Modify: `package.json` (devDependencies + scripts)
- Create: `playwright.config.ts`
- Create: `e2e/lib/paths.ts`
- Modify: `.gitignore`
- Modify: `.env.example`
- Modify: `scripts/check-env.mjs` (allowlist)
- Modify: `docs/infrastructure/gotchas.md` (one-line doc touch for the check-env change)

**Interfaces:**
- Produces: `playwright.config.ts` reading `E2E_PORT` (default 3799) and `E2E_PROOF`; exported constants from `e2e/lib/paths.ts`: `ARTIFACTS_DIR`, `AUTH_DIR`, `MEMBER_STATE`, `ADMIN_STATE`, `PROOF_DIR`, `LOG_DIR` (all absolute paths); npm scripts `e2e`, `e2e:smoke`, `e2e:purchase`, `e2e:proof`, `e2e:env`, `e2e:ui`, `e2e:report`, `test:e2e-env`, `test:e2e-srt`.

- [ ] **Step 1: Install dependencies**

Run: `npm i -D @playwright/test @axe-core/playwright ffmpeg-static msedge-tts`
Then: `npx playwright install chromium webkit`
Expected: both succeed; `package.json` devDependencies gains the four packages.

- [ ] **Step 2: Create `e2e/lib/paths.ts`**

```ts
import path from "node:path";

export const REPO_ROOT = path.resolve(__dirname, "..", "..");
export const ARTIFACTS_DIR = path.join(REPO_ROOT, "e2e-artifacts");
export const AUTH_DIR = path.join(ARTIFACTS_DIR, ".auth");
export const MEMBER_STATE = path.join(AUTH_DIR, "member.json");
export const ADMIN_STATE = path.join(AUTH_DIR, "admin.json");
export const PROOF_DIR = path.join(ARTIFACTS_DIR, "proof");
export const LOG_DIR = path.join(ARTIFACTS_DIR, "logs");
```

- [ ] **Step 3: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT || 3799);
const PROOF = process.env.E2E_PROOF === "1";

export default defineConfig({
  testDir: "./e2e/specs",
  outputDir: "./e2e-artifacts/test-results",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: true,
  retries: PROOF ? 0 : 1,
  workers: PROOF ? 1 : undefined,
  reporter: [
    ["list"],
    ["html", { outputFolder: "./e2e-artifacts/report", open: "never" }],
  ],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: PROOF ? "on" : "retain-on-failure",
    launchOptions: PROOF ? { slowMo: 200 } : {},
  },
  projects: [
    { name: "setup", testDir: "./e2e/setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } },
      dependencies: ["setup"],
    },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] }, dependencies: ["setup"] },
    { name: "mobile-safari", use: { ...devices["iPhone 14"] }, dependencies: ["setup"] },
  ],
});
```

- [ ] **Step 4: Add npm scripts** (in `package.json` `scripts`, near the existing `test:*` block)

```json
"e2e": "tsx e2e/run.ts",
"e2e:smoke": "tsx e2e/run.ts --grep @smoke",
"e2e:purchase": "tsx e2e/run.ts --grep @purchase",
"e2e:proof": "tsx e2e/run.ts --proof",
"e2e:env": "tsx e2e/run.ts --env-only",
"e2e:ui": "tsx e2e/run.ts --ui",
"e2e:report": "playwright show-report e2e-artifacts/report",
"test:e2e-env": "tsx e2e/lib/__tests__/env.test.ts",
"test:e2e-srt": "tsx e2e/proof/__tests__/srt.test.ts"
```

- [ ] **Step 5: Register env vars + gitignore + allowlist**

Append to `.env.example` (after the existing `E2E_TEST_USER_*` comment block near line 19):

```bash
# E2E harness (per-folder; see docs/e2e/). Database name MUST contain "e2e" — the suite WIPES it.
E2E_MONGODB_URI=
# Port the e2e orchestrator boots the app on (default 3799)
E2E_PORT=
```

Append to `.gitignore`:

```
# Playwright e2e artifacts (reports, videos, auth states, proof output)
e2e-artifacts/
```

In `scripts/check-env.mjs`, extend the allowlist (currently lines 38-39) to:

```js
  "E2E_TEST_USER_EMAIL", // branch-local end-to-end test credentials
  "E2E_TEST_USER_PASSWORD",
  "E2E_MONGODB_URI", // per-folder e2e database (name must contain "e2e")
  "E2E_PORT",
```

Add one line to `docs/infrastructure/gotchas.md` under its env-check section: `check-env allowlists E2E_MONGODB_URI + E2E_PORT (per-folder, like the other E2E_* vars).`

- [ ] **Step 6: Verify**

Run: `npx playwright test --list`
Expected: `Error: no tests found` OR an empty listing (both fine — no specs yet; config parsed without error).
Run: `npm run check:env`
Expected: no MISSING/EXTRA regression caused by this change (E2E vars allowlisted).

- [ ] **Step 7: Commit** (only if authorized — see Global Constraints)

```bash
git add package.json package-lock.json playwright.config.ts e2e/lib/paths.ts .gitignore .env.example scripts/check-env.mjs docs/infrastructure/gotchas.md
git commit -m "feat(e2e): add Playwright deps, config, scripts, env registry"
```

---

### Task 2: Env overlay + safety guard (TDD)

**Files:**
- Create: `e2e/lib/env.ts`
- Test: `e2e/lib/__tests__/env.test.ts`

**Interfaces:**
- Produces: `dbNameOf(uri: string): string`; `assertE2eSafety(mainUri: string | undefined, e2eUri: string | undefined): void` (throws Error with actionable message); `resolveE2eEnv(opts?: { webhookSecret?: string }): E2eEnv` where `E2eEnv = { port: number; baseUrl: string; mongoUri: string; overlay: NodeJS.ProcessEnv }`. Consumed by Tasks 3, 4.

- [ ] **Step 1: Write the failing test** — `e2e/lib/__tests__/env.test.ts` (repo tsx-test style: plain assertions, exit non-zero on failure)

```ts
import assert from "node:assert";
import { dbNameOf, assertE2eSafety } from "../env";

let failed = 0;
function t(name: string, fn: () => void) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${(e as Error).message}`); }
}

t("dbNameOf parses standard uri", () =>
  assert.equal(dbNameOf("mongodb://localhost:27017/tools-e2e?retryWrites=true"), "tools-e2e"));
t("dbNameOf parses srv uri", () =>
  assert.equal(dbNameOf("mongodb+srv://u:p@cluster.mongodb.net/toolsaustralia-e2e?w=majority"), "toolsaustralia-e2e"));
t("dbNameOf handles missing db", () =>
  assert.equal(dbNameOf("mongodb://localhost:27017"), ""));

t("guard: rejects unset e2e uri", () =>
  assert.throws(() => assertE2eSafety("mongodb://x/main", undefined), /E2E_MONGODB_URI is not set/));
t("guard: rejects equal uris", () =>
  assert.throws(() => assertE2eSafety("mongodb://x/db-e2e", "mongodb://x/db-e2e"), /equals MONGODB_URI/));
t("guard: rejects db name without e2e", () =>
  assert.throws(() => assertE2eSafety("mongodb://x/main", "mongodb://x/production"), /does not contain 'e2e'/));
t("guard: accepts valid separate e2e db", () =>
  assert.doesNotThrow(() => assertE2eSafety("mongodb://x/main", "mongodb://x/tools-e2e")));
t("guard: accepts E2E uppercase in name", () =>
  assert.doesNotThrow(() => assertE2eSafety("mongodb://x/main", "mongodb://x/Tools-E2E")));

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log("env guard tests passed");
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:e2e-env`
Expected: FAIL — cannot resolve `../env`.

- [ ] **Step 3: Implement `e2e/lib/env.ts`**

```ts
import path from "node:path";
import { config as loadDotenv } from "dotenv";

export interface E2eEnv {
  port: number;
  baseUrl: string;
  mongoUri: string;
  overlay: NodeJS.ProcessEnv;
}

export function dbNameOf(uri: string): string {
  const m = uri.match(/^[a-z+]+:\/\/[^/]+\/([^?]*)/i);
  return m?.[1] ?? "";
}

export function assertE2eSafety(mainUri: string | undefined, e2eUri: string | undefined): void {
  if (!e2eUri) {
    throw new Error(
      "E2E_MONGODB_URI is not set — refusing to run. Add it to .env.local (a dedicated database whose name contains 'e2e')."
    );
  }
  if (mainUri && e2eUri === mainUri) {
    throw new Error("E2E_MONGODB_URI equals MONGODB_URI — refusing to run against the main database.");
  }
  const db = dbNameOf(e2eUri);
  if (!db.toLowerCase().includes("e2e")) {
    throw new Error(
      `E2E database name "${db}" does not contain 'e2e' — refusing. This suite WIPES its database on every run.`
    );
  }
}

export function resolveE2eEnv(opts: { webhookSecret?: string } = {}): E2eEnv {
  loadDotenv({ path: path.resolve(process.cwd(), ".env.local") });
  const mainUri = process.env.MONGODB_URI;
  const e2eUri = process.env.E2E_MONGODB_URI;
  assertE2eSafety(mainUri, e2eUri);

  const sk = process.env.STRIPE_SECRET_KEY || "";
  if (!sk.startsWith("sk_test_")) {
    throw new Error("STRIPE_SECRET_KEY is not a test-mode key (sk_test_...) — refusing to run e2e.");
  }

  const port = Number(process.env.E2E_PORT || 3799);
  const baseUrl = `http://localhost:${port}`;
  const overlay: NodeJS.ProcessEnv = {
    ...process.env,
    MONGODB_URI: e2eUri!,
    PORT: String(port),
    NEXTAUTH_URL: baseUrl,
    // Third parties — all verified to no-op when disabled/blank:
    KLAVIYO_ENABLED: "false",
    SENDGRID_API_KEY: "",
    FACEBOOK_ACCESS_TOKEN: "",
    NEXT_PUBLIC_FACEBOOK_PIXEL_ID: "",
    TIKTOK_ACCESS_TOKEN: "",
    NEXT_PUBLIC_TIKTOK_PIXEL_ID: "",
  };
  if (opts.webhookSecret) overlay.STRIPE_WEBHOOK_SECRET = opts.webhookSecret;
  return { port, baseUrl, mongoUri: e2eUri!, overlay };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:e2e-env`
Expected: all `✓`, exit 0.

- [ ] **Step 5: Commit** (only if authorized)

```bash
git add e2e/lib/env.ts e2e/lib/__tests__/env.test.ts
git commit -m "feat(e2e): env overlay with hard DB-safety guard (TDD)"
```

---

### Task 3: Seed module + DB assertion helper

**Files:**
- Create: `e2e/seed/index.ts`, `e2e/seed/users.ts`, `e2e/seed/draw.ts`
- Create: `e2e/helpers/db.ts`

**Interfaces:**
- Consumes: `resolveE2eEnv`, `assertE2eSafety` (Task 2).
- Produces: `wipeAndSeed(mongoUri: string): Promise<void>`; from `db.ts`: `connectE2eDb(): Promise<typeof mongoose>`, `disconnectE2eDb(): Promise<void>`, `findUserByEmail(email: string)`, `entriesForUser(userId: string): Promise<number>`, `benefitsGrantedCount(kind: "invoice" | "pi", id: string): Promise<number>`, `createLoginableUser(opts: { email: string; password: string; firstName?: string }): Promise<{ id: string; email: string }>`, `MEMBER = { email, password }`, `ADMIN = { email, password }` constants read from env with defaults.
- Seeded identities: member `E2E_TEST_USER_EMAIL` (fallback `e2e.member@e2e.local`) / `E2E_TEST_USER_PASSWORD` (fallback `E2e!Passw0rd`); admin = `e2e.admin@e2e.local` / same password.

- [ ] **Step 1: Write `e2e/helpers/db.ts`**

```ts
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { resolveE2eEnv } from "../lib/env";

let conn: typeof mongoose | null = null;

export const MEMBER = {
  email: (process.env.E2E_TEST_USER_EMAIL || "e2e.member@e2e.local").toLowerCase(),
  password: process.env.E2E_TEST_USER_PASSWORD || "E2e!Passw0rd",
};
export const ADMIN = { email: "e2e.admin@e2e.local", password: MEMBER.password };

export async function connectE2eDb(): Promise<typeof mongoose> {
  if (conn) return conn;
  const { mongoUri } = resolveE2eEnv(); // re-runs the safety guard on every connection
  conn = await mongoose.connect(mongoUri);
  return conn;
}

export async function disconnectE2eDb(): Promise<void> {
  if (conn) { await conn.disconnect(); conn = null; }
}

export async function findUserByEmail(email: string) {
  const db = await connectE2eDb();
  return db.connection.collection("users").findOne({ email: email.toLowerCase() });
}

/** Total entries the active major draw holds for this user (0 when none). */
export async function entriesForUser(userId: string): Promise<number> {
  const db = await connectE2eDb();
  const draw = await db.connection
    .collection("majordraws")
    .findOne({ status: "active" }, { projection: { entries: 1 } });
  const rows = (draw?.entries ?? []).filter((e: { userId?: unknown }) => String(e.userId) === String(userId));
  return rows.reduce((sum: number, e: { totalEntries?: number }) => sum + (e.totalEntries ?? 0), 0);
}

/** Exactly-once proof: count of BenefitsGranted payment events for an invoice/pi id. */
export async function benefitsGrantedCount(kind: "invoice" | "pi", id: string): Promise<number> {
  const db = await connectE2eDb();
  return db.connection
    .collection("paymentevents")
    .countDocuments({ _id: `BenefitsGranted-${kind}_${id}` as unknown as mongoose.Types.ObjectId });
}

/** Creates a credentials-login-capable user directly (register API makes passwordless users). */
export async function createLoginableUser(opts: {
  email: string;
  password: string;
  firstName?: string;
}): Promise<{ id: string; email: string }> {
  const db = await connectE2eDb();
  const email = opts.email.toLowerCase();
  const hash = await bcrypt.hash(opts.password, 12);
  const res = await db.connection.collection("users").insertOne({
    email,
    password: hash,
    firstName: opts.firstName ?? "E2E",
    lastName: "Tester",
    role: "user",
    userType: "customer",
    isActive: true,
    isEmailVerified: true,
    profileSetupCompleted: true,
    birthdate: new Date("1990-01-01"),
    state: "NSW",
    tokenVersion: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { id: String(res.insertedId), email };
}
```

- [ ] **Step 2: Write `e2e/seed/users.ts` and `e2e/seed/draw.ts`**

`e2e/seed/users.ts`:

```ts
import bcrypt from "bcryptjs";
import type { Connection } from "mongoose";
import { MEMBER, ADMIN } from "../helpers/db";

/** Field template verified against scripts/seed-active-member.ts:223-261. */
export async function seedUsers(c: Connection): Promise<void> {
  const hash = await bcrypt.hash(MEMBER.password, 12);
  const now = new Date();
  const in30d = new Date(now.getTime() + 30 * 24 * 3600 * 1000);

  await c.collection("users").insertOne({
    email: MEMBER.email,
    password: hash,
    firstName: "E2E",
    lastName: "Member",
    role: "user",
    userType: "customer",
    isActive: true,
    isEmailVerified: true,
    profileSetupCompleted: true,
    birthdate: new Date("1990-01-01"), // 18+ (giveaway-eligibility.ts)
    state: "NSW", // not SA/ACT
    tokenVersion: 0,
    // Read-only display subscription. CAVEAT: fake Stripe ids — read-only specs must
    // NOT open flows that retrieve these ids from Stripe (e.g. subscription-management modal).
    stripeCustomerId: "cus_e2e_seeded_readonly",
    subscription: {
      packageId: "tradie-subscription",
      status: "active",
      isActive: true,
      startDate: now,
      endDate: in30d,
      autoRenew: true,
    },
    createdAt: now,
    updatedAt: now,
  });

  await c.collection("users").insertOne({
    email: ADMIN.email,
    password: hash,
    firstName: "E2E",
    lastName: "Admin",
    role: "admin", // sufficient for middleware /admin gate (middleware.ts:95-105)
    userType: "customer",
    isActive: true,
    isEmailVerified: true,
    profileSetupCompleted: true,
    birthdate: new Date("1990-01-01"),
    state: "NSW",
    tokenVersion: 0,
    createdAt: now,
    updatedAt: now,
  });
}
```

`e2e/seed/draw.ts`:

```ts
import type { Connection } from "mongoose";

/** Required-when-active fields per src/models/MajorDraw.ts:145-166. */
export async function seedMajorDraw(c: Connection): Promise<void> {
  const now = new Date();
  const days = (n: number) => new Date(now.getTime() + n * 24 * 3600 * 1000);
  await c.collection("majordraws").insertOne({
    name: "E2E Major Draw",
    description: "Seeded draw for automated end-to-end tests.",
    status: "active",
    isActive: true,
    activationDate: days(-1),
    drawDate: days(20),
    freezeEntriesAt: days(19),
    entries: [],
    totalEntries: 0,
    createdAt: now,
    updatedAt: now,
  });
}
```

- [ ] **Step 3: Write `e2e/seed/index.ts`**

```ts
import mongoose from "mongoose";
import { resolveE2eEnv, assertE2eSafety, dbNameOf } from "../lib/env";
import { seedUsers } from "./users";
import { seedMajorDraw } from "./draw";

export async function wipeAndSeed(mongoUri?: string): Promise<void> {
  const uri = mongoUri ?? resolveE2eEnv().mongoUri;
  assertE2eSafety(process.env.MONGODB_URI, uri); // guard again at the point of destruction
  const conn = await mongoose.createConnection(uri).asPromise();
  try {
    console.log(`[e2e-seed] wiping database "${dbNameOf(uri)}"…`);
    await conn.dropDatabase();
    await seedUsers(conn);
    await seedMajorDraw(conn);
    console.log("[e2e-seed] seeded: member, admin, active major draw");
  } finally {
    await conn.close();
  }
}

// CLI entry: tsx e2e/seed/index.ts
if (require.main === module) {
  wipeAndSeed().then(
    () => process.exit(0),
    (e) => { console.error(e); process.exit(1); }
  );
}
```

- [ ] **Step 4: Verify (requires `E2E_MONGODB_URI` set — prerequisite)**

Run: `tsx e2e/seed/index.ts` — Expected: wipe + seed log lines, exit 0.
Run it a SECOND time — Expected: identical success (idempotence via drop).
Then verify guard: `E2E_MONGODB_URI= tsx e2e/seed/index.ts` (PowerShell: `$env:E2E_MONGODB_URI=""; tsx e2e/seed/index.ts`) — Expected: exits non-zero with "E2E_MONGODB_URI is not set".

- [ ] **Step 5: Commit** (only if authorized)

```bash
git add e2e/seed e2e/helpers/db.ts
git commit -m "feat(e2e): wipe-and-seed module + DB assertion helpers"
```

---

### Task 4: Orchestrator (`e2e/run.ts`) with all run modes

**Files:**
- Create: `e2e/lib/processes.ts`, `e2e/lib/health.ts`, `e2e/run.ts`

**Interfaces:**
- Consumes: `resolveE2eEnv` (Task 2), `wipeAndSeed` (Task 3), `LOG_DIR` (Task 1).
- Produces: CLI modes — default (run suite), `--grep <tag>`, `--project <name>`, `--env-only` (hold environment open for MCP/codegen authoring), `--ui` (Playwright UI mode), `--proof` (sets `E2E_PROOF=1`, then post-processes); env switch `E2E_BUILD=1` (prod build). Exports nothing importable; it is the entrypoint.
- Behavior contract for later tasks: sets `E2E_RUN_ID` (base36 timestamp) in the Playwright env; skips Stripe listener with a warning when the grep slice is `@smoke`; hard-fails if Stripe CLI is missing for full/`@purchase` runs.

- [ ] **Step 1: Create `e2e/lib/processes.ts`**

```ts
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const children: ChildProcess[] = [];
let cleanedUp = false;

export function launch(
  name: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  logDir: string
): ChildProcess {
  fs.mkdirSync(logDir, { recursive: true });
  const log = fs.createWriteStream(path.join(logDir, `${name}.log`), { flags: "a" });
  const child = spawn(command, args, {
    env,
    shell: process.platform === "win32", // resolves npm/npx/stripe .cmd shims
    windowsHide: true,
  });
  child.stdout?.pipe(log);
  child.stderr?.pipe(log);
  children.push(child);
  console.log(`[e2e] started ${name} (pid ${child.pid}) — logs: e2e-artifacts/logs/${name}.log`);
  return child;
}

export function killAll(): void {
  if (cleanedUp) return;
  cleanedUp = true;
  for (const c of children) {
    if (c.pid && c.exitCode === null) {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        c.kill("SIGTERM");
      }
    }
  }
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => { killAll(); process.exit(130); });
}
process.on("exit", killAll);
```

- [ ] **Step 2: Create `e2e/lib/health.ts`**

```ts
export async function waitForHttpOk(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastErr = `HTTP ${res.status}`;
    } catch (e) {
      lastErr = (e as Error).message;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Server not ready after ${timeoutMs / 1000}s at ${url} (last: ${lastErr}). Check e2e-artifacts/logs/server.log`);
}
```

- [ ] **Step 3: Create `e2e/run.ts`**

```ts
import { spawnSync } from "node:child_process";
import { resolveE2eEnv } from "./lib/env";
import { launch, killAll } from "./lib/processes";
import { waitForHttpOk } from "./lib/health";
import { wipeAndSeed } from "./seed";
import { LOG_DIR } from "./lib/paths";

function getStripeListenSecret(): string | null {
  const r = spawnSync("stripe", ["listen", "--print-secret"], {
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: 30_000,
  });
  const secret = (r.stdout || "").trim();
  return r.status === 0 && secret.startsWith("whsec_") ? secret : null;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const envOnly = argv.includes("--env-only");
  const proof = argv.includes("--proof");
  const isBuild = process.env.E2E_BUILD === "1";
  const grepIdx = argv.indexOf("--grep");
  const grep = grepIdx >= 0 ? argv[grepIdx + 1] : "";
  const smokeOnly = grep === "@smoke";
  const passthrough = argv.filter((a) => a !== "--env-only" && a !== "--proof");
  const runId = Date.now().toString(36);

  // 1. Env + guards (throws on unsafe DB or live Stripe key)
  let env = resolveE2eEnv();

  // 2. Stripe webhook secret (needed before server boot)
  const secret = getStripeListenSecret();
  if (!secret) {
    const msg =
      "Stripe CLI unavailable or not logged in. Install it and run `stripe login` (test mode). " +
      "Purchase specs cannot run without webhook forwarding.";
    if (envOnly || smokeOnly) console.warn(`[e2e] WARN: ${msg} Continuing without webhooks.`);
    else throw new Error(msg);
  } else {
    env = resolveE2eEnv({ webhookSecret: secret });
  }

  // 3. Fresh data
  await wipeAndSeed(env.mongoUri);

  // 4. App server
  if (isBuild) {
    console.log("[e2e] E2E_BUILD=1 — building production bundle (this takes minutes)…");
    const b = spawnSync("npm", ["run", "build"], { env: env.overlay, stdio: "inherit", shell: process.platform === "win32" });
    if (b.status !== 0) throw new Error("next build failed");
    launch("server", "npm", ["run", "start", "--", "-p", String(env.port)], env.overlay, LOG_DIR);
  } else {
    launch("server", "npm", ["run", "dev", "--", "-p", String(env.port)], env.overlay, LOG_DIR);
  }
  await waitForHttpOk(`${env.baseUrl}/api/test-db`, isBuild ? 120_000 : 240_000);
  console.log(`[e2e] server ready at ${env.baseUrl} (db: e2e)`);

  // 5. Webhook forwarder
  if (secret) {
    launch("stripe-listen", "stripe", ["listen", "--forward-to", `localhost:${env.port}/api/stripe/webhook`], process.env, LOG_DIR);
  }

  // 6. Hold-open mode (Playwright MCP / codegen authoring)
  if (envOnly) {
    console.log(`\n[e2e] Environment held open at ${env.baseUrl}`);
    console.log(`[e2e]   member: ${process.env.E2E_TEST_USER_EMAIL || "e2e.member@e2e.local"}`);
    console.log("[e2e]   Attach Playwright MCP or `npx playwright codegen` here. Ctrl+C to tear down.");
    await new Promise(() => {}); // hold until signal
  }

  // 7. Run the suite
  const pwEnv = { ...process.env, E2E_PORT: String(env.port), E2E_RUN_ID: runId, ...(proof ? { E2E_PROOF: "1" } : {}) };
  const pw = spawnSync("npx", ["playwright", "test", ...passthrough], {
    env: pwEnv, stdio: "inherit", shell: process.platform === "win32",
  });

  // 8. Proof post-processing
  if (proof) {
    const post = spawnSync("npx", ["tsx", "e2e/proof/post.ts"], {
      env: pwEnv, stdio: "inherit", shell: process.platform === "win32",
    });
    if (post.status !== 0) console.warn("[e2e] proof post-processing reported errors (see above)");
  }
  return pw.status ?? 1;
}

main()
  .then((code) => { killAll(); process.exit(code); })
  .catch((e) => { console.error(`[e2e] ${(e as Error).message}`); killAll(); process.exit(1); });
```

Note: `--ui` needs no special handling — it lands in `passthrough` and Playwright opens UI mode against the already-booted server.

- [ ] **Step 4: Verify each mode**

1. `npm run e2e:env` — Expected: seed logs → server ready → hold-open banner. In another terminal `curl http://localhost:3799/api/test-db` returns 200. Ctrl+C tears down (verify with `Get-Process -Name node` — no orphaned Next server; check `stripe` gone too).
2. Guard refusal: `$env:E2E_MONGODB_URI=""; npm run e2e:env` — Expected: immediate exit 1, "E2E_MONGODB_URI is not set". (Restore the var after.)
3. `npm run e2e` — Expected: boots, runs Playwright, reports "no tests found" (specs arrive in Task 5), tears down cleanly.

- [ ] **Step 5: Commit** (only if authorized)

```bash
git add e2e/run.ts e2e/lib/processes.ts e2e/lib/health.ts
git commit -m "feat(e2e): orchestrator — env overlay, seed, server, stripe listen, run modes"
```

---

### Task 5: Fixtures (watchdog + freshUser), auth setup, first smoke spec

**Files:**
- Create: `e2e/fixtures/test.ts`
- Create: `e2e/setup/auth.setup.ts`
- Create: `e2e/helpers/session.ts`
- Create: `e2e/specs/auth/login.spec.ts`

**Interfaces:**
- Consumes: `MEMBER`, `ADMIN`, `createLoginableUser`, `disconnectE2eDb` (Task 3); `MEMBER_STATE`, `ADMIN_STATE`, `AUTH_DIR` (Task 1).
- Produces: `import { test, expect } from "../../fixtures/test"` for ALL specs — extended with auto `watchdog` and `freshUser: () => Promise<{ id: string; email: string; password: string }>`; `loginViaUi(page, email, password): Promise<void>`; storage-state files written by the `setup` project.

- [ ] **Step 1: Create `e2e/helpers/session.ts`**

```ts
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Login page selectors verified: src/app/login/page-client.tsx:735-816. */
export async function loginViaUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/(my-account|admin)/, { timeout: 20_000 });
}
```

- [ ] **Step 2: Create `e2e/fixtures/test.ts`**

```ts
import { test as base, expect } from "@playwright/test";
import { createLoginableUser, disconnectE2eDb, MEMBER } from "../helpers/db";

/** Known-benign console noise (extend deliberately, never wildcard). */
const CONSOLE_ALLOWLIST: RegExp[] = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /third-party cookie/i,
];

type Fixtures = {
  watchdog: void;
  freshUser: () => Promise<{ id: string; email: string; password: string }>;
};

export const test = base.extend<Fixtures>({
  // QA watchdog — the automatic expert eye on console + network (spec §10).
  watchdog: [
    async ({ page, baseURL }, use) => {
      const problems: string[] = [];
      page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error" && !CONSOLE_ALLOWLIST.some((rx) => rx.test(m.text()))) {
          problems.push(`console.error: ${m.text().slice(0, 300)}`);
        }
      });
      page.on("response", (r) => {
        if (baseURL && r.url().startsWith(baseURL) && r.status() >= 500) {
          problems.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`);
        }
      });
      await use();
      if (problems.length) {
        throw new Error(`QA watchdog caught ${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
      }
    },
    { auto: true },
  ],

  // Worker-safe factory for mutating specs (spec §5): unique per worker + run.
  freshUser: async ({}, use, testInfo) => {
    let n = 0;
    const runId = process.env.E2E_RUN_ID || "dev";
    await use(async () => {
      n++;
      const email = `e2e+w${testInfo.workerIndex}-${runId}-${n}@e2e.local`;
      const created = await createLoginableUser({ email, password: MEMBER.password });
      return { ...created, password: MEMBER.password };
    });
    await disconnectE2eDb();
  },
});

export { expect };
```

- [ ] **Step 3: Create `e2e/setup/auth.setup.ts`**

```ts
import fs from "node:fs";
import { test as setup } from "@playwright/test";
import { loginViaUi } from "../helpers/session";
import { MEMBER, ADMIN } from "../helpers/db";
import { AUTH_DIR, MEMBER_STATE, ADMIN_STATE } from "../lib/paths";

setup.beforeAll(() => fs.mkdirSync(AUTH_DIR, { recursive: true }));

setup("authenticate member", async ({ page }) => {
  await loginViaUi(page, MEMBER.email, MEMBER.password);
  await page.context().storageState({ path: MEMBER_STATE });
});

setup("authenticate admin", async ({ page }) => {
  await loginViaUi(page, ADMIN.email, ADMIN.password);
  await page.context().storageState({ path: ADMIN_STATE });
});
```

- [ ] **Step 4: Create `e2e/specs/auth/login.spec.ts`**

```ts
import { test, expect } from "../../fixtures/test";

test.describe("login @smoke", () => {
  test("member signs in and lands on my-account", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(process.env.E2E_TEST_USER_EMAIL || "e2e.member@e2e.local");
    await page.locator('input[name="password"]').fill(process.env.E2E_TEST_USER_PASSWORD || "E2e!Passw0rd");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/my-account/, { timeout: 20_000 });
  });

  test("wrong password shows an error and stays on /login", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(process.env.E2E_TEST_USER_EMAIL || "e2e.member@e2e.local");
    await page.locator('input[name="password"]').fill("definitely-wrong-password");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
```

- [ ] **Step 5: Run and verify**

Run: `npm run e2e:smoke`
Expected: setup project logs in both identities and writes state files; login spec passes on all three browser projects (2 tests × 3 projects = 6 passes; setup = 2).

- [ ] **Step 6: Commit** (only if authorized)

```bash
git add e2e/fixtures/test.ts e2e/setup/auth.setup.ts e2e/helpers/session.ts e2e/specs/auth/login.spec.ts
git commit -m "feat(e2e): watchdog+freshUser fixtures, auth storage states, login smoke"
```

---

### Task 6: Marketing smoke + legal-copy compliance guard

**Files:**
- Create: `e2e/specs/marketing/landing.spec.ts`
- Create: `e2e/specs/marketing/mini-draws.spec.ts`
- Create: `e2e/specs/marketing/legal-copy.spec.ts`
- Create: `e2e/specs/membership/modal.spec.ts`

**Interfaces:**
- Consumes: fixtures (Task 5).
- Produces: `BANNED_COPY: RegExp[]` exported from `legal-copy.spec.ts` is NOT shared — keep the list local to the spec (single consumer; move to a helper only when a second consumer appears).

- [ ] **Step 1: `landing.spec.ts`**

```ts
import { test, expect } from "../../fixtures/test";

test.describe("landing @smoke @demo", () => {
  test("renders hero and membership CTAs", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /choose tradie/i }).or(page.getByRole("link", { name: /choose tradie/i })).first()).toBeVisible({ timeout: 20_000 });
  });
});
```

- [ ] **Step 2: `mini-draws.spec.ts`**

```ts
import { test, expect } from "../../fixtures/test";

test.describe("mini-draws @smoke", () => {
  test("mini-draws page renders", async ({ page }) => {
    const res = await page.goto("/mini-draws");
    expect(res?.ok()).toBeTruthy();
    await expect(page.locator("main")).toBeVisible();
  });
});
```

- [ ] **Step 3: `legal-copy.spec.ts`** — compliance lens (CLAUDE.md §11 vocabulary)

```ts
import { test, expect } from "../../fixtures/test";

const BANNED_COPY: RegExp[] = [
  /\bodds\b/i,
  /chances? of winning/i,
  /boost your chances?/i,
  /increase your chances?/i,
  /better odds/i,
  /\blotter(y|ies)\b/i,
  /\blotto\b/i,
  /\braffles?\b/i,
  /\bsweepstakes?\b/i,
  /\bgambl(e|ing)\b/i,
  /\bper entry\b/i,
  /\$\d+(\.\d+)?\s*(\/|per)\s*entr(y|ies)/i,
];

const PAGES = ["/", "/membership", "/mini-draws"];

test.describe("legal copy guard @smoke", () => {
  for (const path of PAGES) {
    test(`no gambling/sold-entry framing on ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const text = await page.locator("body").innerText();
      const hits = BANNED_COPY.filter((rx) => rx.test(text)).map(String);
      expect(hits, `Banned copy found on ${path}: ${hits.join(", ")}`).toEqual([]);
      expect(text).toMatch(/free entr(y|ies)/i); // positive framing must be present
    });
  }
});
```

- [ ] **Step 4: `modal.spec.ts`** — membership tiers render with legal framing

```ts
import { test, expect } from "../../fixtures/test";

test.describe("membership tiers @smoke @demo", () => {
  test("membership page shows the three subscription tiers", async ({ page }) => {
    await page.goto("/membership");
    for (const tier of ["Tradie", "Foreman", "Boss"]) {
      await expect(page.getByRole("button", { name: new RegExp(`choose ${tier}`, "i") }).or(page.getByRole("link", { name: new RegExp(`choose ${tier}`, "i") })).first()).toBeVisible({ timeout: 20_000 });
    }
    await expect(page.locator("body")).toContainText(/free entr(y|ies)/i);
  });
});
```

- [ ] **Step 5: Run and verify**

Run: `npm run e2e:smoke`
Expected: all pass on 3 projects. If the legal-copy guard FAILS, that is a real §11 violation on the live site — report it to DJ, do not weaken the regex.

- [ ] **Step 6: Commit** (only if authorized)

```bash
git add e2e/specs/marketing e2e/specs/membership/modal.spec.ts
git commit -m "feat(e2e): marketing smoke + legal-copy compliance guard"
```

---

### Task 7: Registration bridge spec (no-auto-login)

**Files:**
- Create: `e2e/specs/auth/registration.spec.ts`

**Interfaces:**
- Consumes: fixtures (Task 5). Registration step-1 selectors verified: `RegistrationStep.tsx:62-115` (`name="firstName"|"lastName"|"email"|"phone"`, button "REGISTER" → "Continue to Billing").

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from "../../fixtures/test";

test.describe("registration bridge @smoke", () => {
  test("step-1 register creates account WITHOUT logging in (guestUserData bridge)", async ({ page }) => {
    const runId = process.env.E2E_RUN_ID || "dev";
    const email = `e2e+reg-${runId}-${test.info().workerIndex}@e2e.local`;

    await page.goto("/membership");
    await page.getByRole("button", { name: /choose tradie/i }).or(page.getByRole("link", { name: /choose tradie/i })).first().click();

    // Step-1 registration form inside MembershipModal
    await page.locator('input[name="firstName"]').fill("E2E");
    await page.locator('input[name="lastName"]').fill("Bridge");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="phone"]').fill("0412345678");
    await page.getByRole("button", { name: /register/i }).click();

    // Bridge reached: billing step becomes available…
    await expect(page.getByRole("button", { name: /continue to billing/i })).toBeVisible({ timeout: 20_000 });

    // …but the session is still unauthenticated (CLAUDE.md rule 6's documented behavior).
    const session = await page.request.get("/api/auth/session");
    const body = await session.json().catch(() => null);
    expect(body?.user ?? null).toBeNull();
  });
});
```

- [ ] **Step 2: Run and verify**

Run: `npx tsx e2e/run.ts --grep "registration bridge"`
Expected: passes on 3 projects. If the modal-opening click doesn't reach the registration step, use `npm run e2e:env` + live DOM inspection to correct the opener per the Selector refinement rule — the form-field and session assertions must stay as written.

- [ ] **Step 3: Commit** (only if authorized)

```bash
git add e2e/specs/auth/registration.spec.ts
git commit -m "feat(e2e): registration guest-bridge spec asserting no-auto-login"
```

---

### Task 8: Account + admin gate specs

**Files:**
- Create: `e2e/specs/account/my-account.spec.ts`
- Create: `e2e/specs/admin/admin-gate.spec.ts`

**Interfaces:**
- Consumes: `MEMBER_STATE`, `ADMIN_STATE` (Task 1), fixtures (Task 5).

- [ ] **Step 1: `my-account.spec.ts`**

```ts
import { test, expect } from "../../fixtures/test";
import { MEMBER_STATE } from "../../lib/paths";

test.use({ storageState: MEMBER_STATE });

test.describe("my-account @smoke @demo", () => {
  test("dashboard loads for the seeded active member", async ({ page }) => {
    await page.goto("/my-account");
    await expect(page).toHaveURL(/\/my-account/); // not bounced to /login
    await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
    // Seeded member firstName is displayed somewhere on the dashboard
    await expect(page.locator("body")).toContainText(/e2e/i, { timeout: 20_000 });
  });

  test("guest hitting /my-account is redirected to /login", async ({ browser }) => {
    const ctx = await browser.newContext(); // no storage state
    const page = await ctx.newPage();
    await page.goto("/my-account");
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
    await ctx.close();
  });
});
```

- [ ] **Step 2: `admin-gate.spec.ts`**

```ts
import { test, expect } from "../../fixtures/test";
import { ADMIN_STATE, MEMBER_STATE } from "../../lib/paths";

test.describe("admin gate @smoke @admin", () => {
  test("admin reaches /admin", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: ADMIN_STATE });
    const page = await ctx.newPage();
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/, { timeout: 20_000 });
    await expect(page.locator("main, [role=main]").first()).toBeVisible();
    await ctx.close();
  });

  test("regular member is bounced from /admin to /", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: MEMBER_STATE });
    const page = await ctx.newPage();
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin/, { timeout: 20_000 }); // middleware.ts:95-105 → redirect "/"
    await ctx.close();
  });
});
```

- [ ] **Step 3: Run and verify** — `npm run e2e:smoke` → all green, 3 projects.

- [ ] **Step 4: Commit** (only if authorized)

```bash
git add e2e/specs/account e2e/specs/admin
git commit -m "feat(e2e): my-account + admin auth-boundary smoke specs"
```

---

### Task 9: Expert lenses — uiAudit, a11y, lens self-tests

**Files:**
- Create: `e2e/fixtures/ui-audit.ts`
- Create: `e2e/specs/quality/a11y.spec.ts`
- Create: `e2e/specs/quality/lenses-selftest.spec.ts`

**Interfaces:**
- Consumes: fixtures (Task 5).
- Produces: `uiAudit(page: Page): Promise<string[]>` (returns problem list; caller asserts empty).

- [ ] **Step 1: `e2e/fixtures/ui-audit.ts`**

```ts
import type { Page } from "@playwright/test";

/** UI-expert battery (spec §10): overflow, broken images. Returns problems (empty = pass). */
export async function uiAudit(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth + 1) {
      problems.push(`horizontal overflow: scrollWidth ${doc.scrollWidth} > viewport ${doc.clientWidth}`);
    }
    for (const img of Array.from(document.querySelectorAll("img"))) {
      if (img.complete && img.naturalWidth === 0 && img.src && !img.src.startsWith("data:")) {
        problems.push(`broken image: ${img.src.slice(0, 120)}`);
      }
    }
    return problems;
  });
}
```

- [ ] **Step 2: `a11y.spec.ts`**

```ts
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "../../fixtures/test";
import { uiAudit } from "../../fixtures/ui-audit";

const PAGES = ["/", "/login", "/membership"];

test.describe("accessibility + ui audit @a11y", () => {
  for (const path of PAGES) {
    test(`axe + uiAudit on ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");

      expect(await uiAudit(page)).toEqual([]);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(
        serious.map((v) => `${v.id}: ${v.nodes.length} node(s) — ${v.help}`),
        `axe violations on ${path}`
      ).toEqual([]);
    });
  }
});
```

- [ ] **Step 3: `lenses-selftest.spec.ts`** — proves the lenses bite (spec success criterion 7)

```ts
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "../../fixtures/test";

test.describe("lens self-tests", () => {
  test("watchdog fails a test that console.errors", async ({ page }) => {
    test.fail(); // this test MUST fail via the watchdog — test.fail inverts it
    await page.goto("/");
    await page.evaluate(() => console.error("e2e watchdog self-test"));
  });

  test("axe detects a seeded violation", async ({ page }) => {
    await page.setContent('<html><body><img src="x.png"></body></html>');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => v.id)).toContain("image-alt");
  });
});
```

- [ ] **Step 4: Run and verify**

Run: `npx tsx e2e/run.ts --grep "lens self-tests" --project chromium-desktop` — Expected: both pass (the first *because* the watchdog threw).
Run: `npx tsx e2e/run.ts --grep @a11y --project chromium-desktop` — Expected: passes, OR surfaces real serious/critical violations. Real violations: report to DJ with the axe rule ids; do NOT downgrade the filter to make it green.

- [ ] **Step 5: Commit** (only if authorized)

```bash
git add e2e/fixtures/ui-audit.ts e2e/specs/quality/a11y.spec.ts e2e/specs/quality/lenses-selftest.spec.ts
git commit -m "feat(e2e): a11y + ui-audit expert lenses with bite-proof self-tests"
```

---

### Task 10: Visual regression (curated set)

**Files:**
- Create: `e2e/specs/quality/visual.spec.ts`
- Create (generated): `e2e/specs/quality/visual.spec.ts-snapshots/**` (committed baselines)

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from "../../fixtures/test";
import { MEMBER_STATE } from "../../lib/paths";

test.use({ reducedMotion: "reduce" });

test.describe("visual baselines @visual", () => {
  test("landing hero", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("landing.png", {
      fullPage: false,
      animations: "disabled",
      maxDiffPixelRatio: 0.02,
    });
  });

  test("membership tiers", async ({ page }) => {
    await page.goto("/membership");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("membership.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.02,
    });
  });

  test("my-account dashboard", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: MEMBER_STATE, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/my-account");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("my-account.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.02,
      mask: [page.locator("time"), page.getByText(/\d{1,2}:\d{2}/)], // clocks/countdowns
    });
    await ctx.close();
  });
});
```

- [ ] **Step 2: Generate baselines**

Run: `npx tsx e2e/run.ts --grep @visual --update-snapshots`
Expected: creates `visual.spec.ts-snapshots/*-{chromium-desktop,mobile-chrome,mobile-safari}.png`. Eyeball each PNG — a blank/half-loaded baseline is worse than none.

- [ ] **Step 3: Verify stability** — run `npx tsx e2e/run.ts --grep @visual` twice; both green (if flaky, mask the offending dynamic region — never raise `maxDiffPixelRatio` above 0.02).

- [ ] **Step 4: Commit** (only if authorized — note baselines ARE committed, they are not artifacts)

```bash
git add e2e/specs/quality/visual.spec.ts e2e/specs/quality/visual.spec.ts-snapshots
git commit -m "feat(e2e): visual regression baselines for landing, membership, my-account"
```

---

### Task 11: Purchase suite (the money path)

**Files:**
- Create: `e2e/helpers/payment.ts`
- Create: `e2e/specs/membership/purchase-subscription.spec.ts`
- Create: `e2e/specs/membership/purchase-one-time.spec.ts`
- Create: `e2e/specs/membership/purchase-decline.spec.ts`
- Create: `e2e/specs/membership/purchase-idempotency.spec.ts`
- Create: `e2e/specs/membership/webhook-replay.spec.ts`

**Interfaces:**
- Consumes: fixtures + db helpers (Tasks 3, 5). Verified flow: registration step-1 → billing → `CardFormSection` PaymentElement iframe → `/api/stripe/create-subscription` → `confirm-subscription-payment` → auto-login → success; grant happens in webhook (in-process `after()`), UI polls `/api/payment-status/:pi`.
- Produces: `fillPaymentElement(page, card: { number: string; expiry: string; cvc: string }): Promise<void>`; `waitForActiveMembership(email: string, timeoutMs?): Promise<{ userId: string; entries: number }>` (polls DB).

- [ ] **Step 1: `e2e/helpers/payment.ts`**

```ts
import type { Page } from "@playwright/test";
import { connectE2eDb, entriesForUser, findUserByEmail } from "./db";

export const CARDS = {
  ok: { number: "4242424242424242", expiry: "12 / 30", cvc: "123" },
  declined: { number: "4000000000000002", expiry: "12 / 30", cvc: "123" },
};

/** Stripe PaymentElement lives in its own iframe(s). Selector refinement rule applies. */
export async function fillPaymentElement(
  page: Page,
  card: { number: string; expiry: string; cvc: string }
): Promise<void> {
  const frame = page
    .frameLocator('iframe[name^="__privateStripeFrame"], iframe[title*="payment" i]')
    .first();
  await frame.getByRole("textbox", { name: /card number/i }).fill(card.number);
  await frame.getByRole("textbox", { name: /expir/i }).fill(card.expiry);
  await frame.getByRole("textbox", { name: /cvc|security code/i }).fill(card.cvc);
}

/** DB-level outcome poll: subscription active + entries present. */
export async function waitForActiveMembership(
  email: string,
  timeoutMs = 60_000
): Promise<{ userId: string; entries: number }> {
  await connectE2eDb();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const user = await findUserByEmail(email);
    if (user?.subscription?.status === "active" && user?.subscription?.isActive) {
      const entries = await entriesForUser(String(user._id));
      if (entries > 0) return { userId: String(user._id), entries };
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`No active membership + entries for ${email} within ${timeoutMs / 1000}s (webhook not processed?)`);
}
```

- [ ] **Step 2: `purchase-subscription.spec.ts`** — the flagship spec

```ts
import { test, expect } from "../../fixtures/test";
import { CARDS, fillPaymentElement, waitForActiveMembership } from "../../helpers/payment";
import { connectE2eDb, disconnectE2eDb } from "../../helpers/db";

test.describe.configure({ mode: "serial" }); // one money-path flow at a time per project
test.afterAll(async () => { await disconnectE2eDb(); });

test.describe("subscription purchase @purchase @demo", () => {
  test("new user buys Tradie: payment → webhook → 15 entries exactly once", async ({ page }) => {
    test.setTimeout(180_000);
    const runId = process.env.E2E_RUN_ID || "dev";
    const email = `e2e+buy-${runId}-${test.info().project.name}@e2e.local`;

    // Register (step 1)
    await page.goto("/membership");
    await page.getByRole("button", { name: /choose tradie/i }).or(page.getByRole("link", { name: /choose tradie/i })).first().click();
    await page.locator('input[name="firstName"]').fill("E2E");
    await page.locator('input[name="lastName"]').fill("Buyer");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="phone"]').fill("0412345678");
    await page.getByRole("button", { name: /register/i }).click();
    await page.getByRole("button", { name: /continue to billing/i }).click();

    // Pay (step 2) — Stripe test card
    await fillPaymentElement(page, CARDS.ok);
    await page.getByRole("button", { name: /pay|subscribe|complete|confirm/i }).last().click();

    // Outcome asserted at the DATABASE, not the pixels (spec §9):
    const { userId, entries } = await waitForActiveMembership(email, 90_000);
    expect(entries).toBe(15); // Tradie includes 15 free entries (membershipPackages.ts:68)

    // Exactly-once: precisely one BenefitsGranted event exists for this user's invoice.
    const db = await connectE2eDb();
    const grantEvents = await db.connection
      .collection("paymentevents")
      .countDocuments({ userId: { $in: [userId, new (require("mongoose").Types.ObjectId)(userId)] }, eventType: /BenefitsGranted|benefits/i });
    // Fallback shape-agnostic check: _id prefix convention
    const grantById = await db.connection
      .collection("paymentevents")
      .countDocuments({ _id: /^BenefitsGranted-invoice_/ as unknown as string });
    expect(Math.max(grantEvents, grantById)).toBe(1);
  });
});
```

> Implementer note (not a placeholder — a live-refinement instruction): the exactly-once
> query above intentionally has two shapes because the `paymentevents` `_id` is a string
> in the verified convention (`BenefitsGranted-invoice_<id>`). On first live run, `console.log`
> the actual granted doc from `e2e:env`, keep the precise query, delete the fallback.

- [ ] **Step 3: `purchase-decline.spec.ts`**

```ts
import { test, expect } from "../../fixtures/test";
import { CARDS, fillPaymentElement } from "../../helpers/payment";
import { findUserByEmail, entriesForUser, disconnectE2eDb } from "../../helpers/db";

test.afterAll(async () => { await disconnectE2eDb(); });

test.describe("declined card @purchase", () => {
  test("decline shows the error and grants NOTHING", async ({ page }) => {
    test.setTimeout(120_000);
    const runId = process.env.E2E_RUN_ID || "dev";
    const email = `e2e+decline-${runId}-${test.info().project.name}@e2e.local`;

    await page.goto("/membership");
    await page.getByRole("button", { name: /choose tradie/i }).or(page.getByRole("link", { name: /choose tradie/i })).first().click();
    await page.locator('input[name="firstName"]').fill("E2E");
    await page.locator('input[name="lastName"]').fill("Decline");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="phone"]').fill("0412345678");
    await page.getByRole("button", { name: /register/i }).click();
    await page.getByRole("button", { name: /continue to billing/i }).click();

    await fillPaymentElement(page, CARDS.declined);
    await page.getByRole("button", { name: /pay|subscribe|complete|confirm/i }).last().click();

    // Verified copy: payment-error-messages.ts:104
    await expect(page.getByText(/card was declined|card declined/i).first()).toBeVisible({ timeout: 30_000 });

    // Zero phantom grants:
    await page.waitForTimeout(5_000); // grace for any stray async grant — must stay zero
    const user = await findUserByEmail(email);
    expect(user?.subscription?.status ?? "none").not.toBe("active");
    if (user) expect(await entriesForUser(String(user._id))).toBe(0);
  });
});
```

- [ ] **Step 4: `purchase-one-time.spec.ts`** — same skeleton as Step 2 with the one-time pack: on `/membership`, choose the one-time pack CTA (label from `ctaLabelFor`: the pack's `buttonText` or "Enter Now" — refine live via `e2e:env`), pay with `CARDS.ok`, then assert via `waitForActiveMembership`-equivalent for one-time (user exists, `entriesForUser > 0`, exactly one `BenefitsGranted-pi_*` event). Write it as a full spec file mirroring Step 2's structure — register, pay, DB-assert — substituting the pack CTA and `benefitsGrantedCount("pi", …)`.

- [ ] **Step 5: `purchase-idempotency.spec.ts`** — double-submit probe

```ts
import { test, expect } from "../../fixtures/test";
import { CARDS, fillPaymentElement, waitForActiveMembership } from "../../helpers/payment";
import { connectE2eDb, disconnectE2eDb } from "../../helpers/db";

test.afterAll(async () => { await disconnectE2eDb(); });

test.describe("double-submit idempotency @purchase", () => {
  test("rapid double-click on pay grants exactly one membership", async ({ page }) => {
    test.setTimeout(180_000);
    const runId = process.env.E2E_RUN_ID || "dev";
    const email = `e2e+dbl-${runId}-${test.info().project.name}@e2e.local`;

    await page.goto("/membership");
    await page.getByRole("button", { name: /choose tradie/i }).or(page.getByRole("link", { name: /choose tradie/i })).first().click();
    await page.locator('input[name="firstName"]').fill("E2E");
    await page.locator('input[name="lastName"]').fill("Double");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="phone"]').fill("0412345678");
    await page.getByRole("button", { name: /register/i }).click();
    await page.getByRole("button", { name: /continue to billing/i }).click();

    await fillPaymentElement(page, CARDS.ok);
    const pay = page.getByRole("button", { name: /pay|subscribe|complete|confirm/i }).last();
    await pay.click();
    await pay.click({ timeout: 2_000 }).catch(() => {}); // second click may be blocked — that's fine

    const { entries } = await waitForActiveMembership(email, 90_000);
    expect(entries).toBe(15); // exactly one grant — not 30

    const db = await connectE2eDb();
    const subs = await db.connection.collection("users").countDocuments({ email, "subscription.status": "active" });
    expect(subs).toBe(1);
  });
});
```

- [ ] **Step 6: `webhook-replay.spec.ts`** — e2e twin of `test:webhook-queue-replay-safe`

```ts
import { spawnSync } from "node:child_process";
import { test, expect } from "../../fixtures/test";
import { CARDS, fillPaymentElement, waitForActiveMembership } from "../../helpers/payment";
import { connectE2eDb, entriesForUser, disconnectE2eDb } from "../../helpers/db";

test.afterAll(async () => { await disconnectE2eDb(); });

test.describe("webhook replay safety @purchase", () => {
  test("resending the payment event does not double-grant", async ({ page }) => {
    test.setTimeout(240_000);
    const runId = process.env.E2E_RUN_ID || "dev";
    const email = `e2e+replay-${runId}-${test.info().project.name}@e2e.local`;

    // Complete a normal purchase first (same steps as purchase-subscription):
    await page.goto("/membership");
    await page.getByRole("button", { name: /choose tradie/i }).or(page.getByRole("link", { name: /choose tradie/i })).first().click();
    await page.locator('input[name="firstName"]').fill("E2E");
    await page.locator('input[name="lastName"]').fill("Replay");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="phone"]').fill("0412345678");
    await page.getByRole("button", { name: /register/i }).click();
    await page.getByRole("button", { name: /continue to billing/i }).click();
    await fillPaymentElement(page, CARDS.ok);
    await page.getByRole("button", { name: /pay|subscribe|complete|confirm/i }).last().click();
    const { userId, entries } = await waitForActiveMembership(email, 90_000);

    // Find the processed invoice.payment_succeeded event id in the queue collection:
    const db = await connectE2eDb();
    const row = await db.connection
      .collection("stripewebhookqueues")
      .findOne({ eventType: "invoice.payment_succeeded", status: "succeeded" }, { sort: { processedAt: -1 } });
    expect(row?.eventId ?? row?._id, "no processed invoice.payment_succeeded in queue").toBeTruthy();
    const eventId = String(row!.eventId ?? row!._id);

    // Replay it through the real webhook path:
    const r = spawnSync("stripe", ["events", "resend", eventId], {
      encoding: "utf8", shell: process.platform === "win32", timeout: 30_000,
    });
    expect(r.status, `stripe events resend failed: ${r.stderr}`).toBe(0);

    // Grant count must not move:
    await page.waitForTimeout(10_000);
    expect(await entriesForUser(userId)).toBe(entries);
  });
});
```

> Implementer note: the queue collection name (`stripewebhookqueues`) and `eventId` field
> come from `src/models/StripeWebhookQueue.ts` — confirm both with one Read of that model
> before first run and adjust the query if the collection/field is named differently.

- [ ] **Step 7: Run and verify**

Run: `npm run e2e:purchase -- --project chromium-desktop` (money path on one project first)
Expected: all five specs green. Then run the full `npm run e2e:purchase` (3 projects).
This is the task where the Selector refinement rule will most likely be exercised (Stripe iframe internals, pay-button label, one-time CTA). Refine selectors against `e2e:env`; never weaken a DB assertion.

- [ ] **Step 8: Commit** (only if authorized)

```bash
git add e2e/helpers/payment.ts e2e/specs/membership
git commit -m "feat(e2e): purchase suite — subscribe, one-time, decline, idempotency, webhook replay"
```

---

### Task 12: Proof mode — narration, subtitles, AI voice

**Files:**
- Create: `e2e/fixtures/demo.ts`
- Modify: `e2e/fixtures/test.ts` (add `demo` fixture)
- Create: `e2e/proof/srt.ts`
- Test: `e2e/proof/__tests__/srt.test.ts`
- Create: `e2e/proof/post.ts`
- Modify: `e2e/specs/marketing/landing.spec.ts`, `e2e/specs/account/my-account.spec.ts`, `e2e/specs/membership/purchase-subscription.spec.ts` (wrap key moments in `demo.step`)

**Interfaces:**
- Consumes: `PROOF_DIR` (Task 1); `E2E_PROOF=1` set by `--proof` (Task 4).
- Produces: `demo` fixture — `demo.step(title: string, fn: () => Promise<void>): Promise<void>` (normal runs: plain `test.step`; proof runs: title card on first call, caption overlay, paced hold, named screenshot, cue in `narration.json` sidecar); `toSrt(cues: Cue[]): string` and `holdFor(title: string): number` from `srt.ts` where `Cue = { title: string; startMs: number; endMs: number }`.

- [ ] **Step 1: Write the failing srt test** — `e2e/proof/__tests__/srt.test.ts`

```ts
import assert from "node:assert";
import { toSrt, holdFor } from "../srt";

let failed = 0;
function t(name: string, fn: () => void) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${(e as Error).message}`); }
}

t("toSrt formats a cue block", () => {
  const srt = toSrt([{ title: "Logging in as a member", startMs: 1500, endMs: 4200 }]);
  assert.equal(srt, "1\n00:00:01,500 --> 00:00:04,200\nLogging in as a member\n");
});
t("toSrt joins multiple cues with blank lines", () => {
  const srt = toSrt([
    { title: "A", startMs: 0, endMs: 1000 },
    { title: "B", startMs: 61_000, endMs: 62_500 },
  ]);
  assert.ok(srt.includes("2\n00:01:01,000 --> 00:01:02,500\nB\n"));
});
t("holdFor floors at 1800ms", () => assert.equal(holdFor("Hi"), 1800));
t("holdFor scales with word count", () => assert.ok(holdFor("one two three four five six seven eight") >= 2400));

if (failed) process.exit(1);
console.log("srt tests passed");
```

- [ ] **Step 2: Run to verify it fails** — `npm run test:e2e-srt` → FAIL (module missing).

- [ ] **Step 3: Implement `e2e/proof/srt.ts`**

```ts
export interface Cue { title: string; startMs: number; endMs: number }

function ts(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const mil = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(mil, 3)}`;
}

export function toSrt(cues: Cue[]): string {
  return cues.map((c, i) => `${i + 1}\n${ts(c.startMs)} --> ${ts(c.endMs)}\n${c.title}\n`).join("\n");
}

/** Watchability pacing: hold the frame long enough to read/hear the caption. */
export function holdFor(title: string): number {
  return Math.max(1800, 300 * title.trim().split(/\s+/).length);
}
```

- [ ] **Step 4: Verify pass** — `npm run test:e2e-srt` → all ✓.

- [ ] **Step 5: Implement `e2e/fixtures/demo.ts`**

```ts
import fs from "node:fs";
import type { Page, TestInfo } from "@playwright/test";
import { test as base } from "@playwright/test";
import { holdFor } from "../proof/srt";

export interface Demo { step: (title: string, fn: () => Promise<void>) => Promise<void> }

const PROOF = process.env.E2E_PROOF === "1";

async function showCaption(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => {
    let el = document.getElementById("__e2eCaption");
    if (!el) {
      el = document.createElement("div");
      el.id = "__e2eCaption";
      el.style.cssText =
        "position:fixed;left:50%;bottom:6%;transform:translateX(-50%);z-index:2147483647;" +
        "background:rgba(0,0,0,.82);color:#fff;padding:10px 22px;border-radius:10px;" +
        "font:600 18px/1.4 system-ui,sans-serif;max-width:80vw;text-align:center;pointer-events:none;";
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text).catch(() => { /* page may be navigating — caption is best-effort */ });
}

async function showTitleCard(page: Page, title: string): Promise<void> {
  await page.evaluate((t) => {
    const el = document.createElement("div");
    el.id = "__e2eTitleCard";
    el.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;background:#0b0b0e;color:#fff;display:flex;" +
      "align-items:center;justify-content:center;font:700 34px/1.3 system-ui,sans-serif;" +
      "text-align:center;padding:8vw;pointer-events:none;";
    el.textContent = t;
    document.body.appendChild(el);
  }, title).catch(() => {});
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.getElementById("__e2eTitleCard")?.remove()).catch(() => {});
}

export function makeDemo(page: Page, testInfo: TestInfo): { demo: Demo; flush: () => void } {
  const cues: { title: string; startMs: number }[] = [];
  const t0 = Date.now();
  let started = false;

  const demo: Demo = {
    async step(title, fn) {
      if (!PROOF) return base.step(title, fn);
      if (!started) { started = true; await showTitleCard(page, testInfo.title); }
      cues.push({ title, startMs: Date.now() - t0 });
      await showCaption(page, title);
      await page.waitForTimeout(holdFor(title));
      await base.step(title, fn);
      await page
        .screenshot({ path: testInfo.outputPath(`step-${cues.length}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}.png`) })
        .catch(() => {});
    },
  };

  const flush = () => {
    if (PROOF && cues.length) {
      fs.writeFileSync(
        testInfo.outputPath("narration.json"),
        JSON.stringify({ testTitle: testInfo.title, cues, endMs: Date.now() - t0 }, null, 2)
      );
    }
  };
  return { demo, flush };
}
```

- [ ] **Step 6: Register the fixture in `e2e/fixtures/test.ts`**

Add to the `Fixtures` type: `demo: Demo;` (import `{ makeDemo, type Demo }` from `./demo`), and to the `extend` object:

```ts
  demo: async ({ page }, use, testInfo) => {
    const { demo, flush } = makeDemo(page, testInfo);
    await use(demo);
    flush();
  },
```

- [ ] **Step 7: Wrap the three `@demo` specs' key moments.** Example for `login`-style steps inside `my-account.spec.ts`:

```ts
  test("dashboard loads for the seeded active member", async ({ page, demo }) => {
    await demo.step("Opening the member dashboard", async () => {
      await page.goto("/my-account");
    });
    await demo.step("The member's account and free entries are visible", async () => {
      await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("body")).toContainText(/e2e/i, { timeout: 20_000 });
    });
  });
```

Apply the same pattern to `landing.spec.ts` (steps: "Opening the Tools Australia home page", "Membership options with free entries are on display") and `purchase-subscription.spec.ts` ("Creating a new account", "Entering payment details with a test card", "Payment confirmed — free entries granted automatically"). Captions are customer-visible-adjacent strings — free-entry framing per CLAUDE.md §11, no "odds/chance" wording.

- [ ] **Step 8: Implement `e2e/proof/post.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { toSrt, type Cue } from "./srt";
import { ARTIFACTS_DIR, PROOF_DIR } from "../lib/paths";

const RESULTS = path.join(ARTIFACTS_DIR, "test-results");
const VOICE = "en-AU-NatashaNeural"; // verify exact id against node_modules/msedge-tts docs on first run

function ff(args: string[]): boolean {
  const r = spawnSync(ffmpegPath as unknown as string, args, { encoding: "utf8" });
  if (r.status !== 0) console.warn(`[proof] ffmpeg failed: ${r.stderr?.slice(-400)}`);
  return r.status === 0;
}

/** ffmpeg subtitles filter needs escaped Windows paths. */
function subPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

async function synthVoice(cues: Cue[], dir: string): Promise<string[] | null> {
  try {
    const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
    const tts = new MsEdgeTTS();
    await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const files: string[] = [];
    for (let i = 0; i < cues.length; i++) {
      const out = path.join(dir, `cue-${i}`);
      const res = await tts.toFile(out, cues[i].title); // API per msedge-tts README — verify shape on first run
      files.push(typeof res === "string" ? res : (res as { audioFilePath: string }).audioFilePath);
    }
    return files;
  } catch (e) {
    console.warn(`[proof] AI voice unavailable (${(e as Error).message}) — emitting subtitled video only.`);
    return null;
  }
}

async function processOne(dir: string, dateBranchDir: string): Promise<void> {
  const webm = path.join(dir, "video.webm");
  const narration = path.join(dir, "narration.json");
  if (!fs.existsSync(webm) || !fs.existsSync(narration)) return;

  const meta = JSON.parse(fs.readFileSync(narration, "utf8")) as { testTitle: string; cues: { title: string; startMs: number }[]; endMs: number };
  const cues: Cue[] = meta.cues.map((c, i) => ({
    title: c.title,
    startMs: c.startMs,
    endMs: (meta.cues[i + 1]?.startMs ?? meta.endMs) - 200,
  }));

  const slug = meta.testTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80);
  const outDir = path.join(dateBranchDir, slug);
  fs.mkdirSync(outDir, { recursive: true });

  const srtFile = path.join(outDir, `${slug}.srt`);
  fs.writeFileSync(srtFile, toSrt(cues));

  const mp4 = path.join(outDir, `${slug}.mp4`);
  if (!ff(["-y", "-i", webm, "-vf", `subtitles='${subPath(srtFile)}'`, "-c:v", "libx264", "-pix_fmt", "yuv420p", mp4])) return;

  const clips = await synthVoice(cues, outDir);
  if (clips && clips.length) {
    const inputs = clips.flatMap((c) => ["-i", c]);
    const delays = clips.map((_, i) => `[${i + 1}:a]adelay=${cues[i].startMs}|${cues[i].startMs}[a${i}]`).join(";");
    const mix = clips.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${clips.length}:normalize=0[aout]`;
    const voiced = path.join(outDir, `${slug}.voiced.mp4`);
    if (ff(["-y", "-i", mp4, ...inputs, "-filter_complex", `${delays};${mix}`, "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-shortest", voiced])) {
      fs.renameSync(voiced, mp4);
    }
  }

  for (const png of fs.readdirSync(dir).filter((f) => f.startsWith("step-") && f.endsWith(".png"))) {
    fs.copyFileSync(path.join(dir, png), path.join(outDir, png));
  }
  console.log(`[proof] ${slug} → ${path.relative(process.cwd(), outDir)}`);
}

async function main(): Promise<void> {
  const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).stdout.trim().replace(/[^a-z0-9-]+/gi, "-");
  const date = new Date().toISOString().slice(0, 10);
  const dateBranchDir = path.join(PROOF_DIR, `${date}-${branch}`);
  fs.mkdirSync(dateBranchDir, { recursive: true });

  const dirs = fs.existsSync(RESULTS)
    ? fs.readdirSync(RESULTS).map((d) => path.join(RESULTS, d)).filter((d) => fs.statSync(d).isDirectory())
    : [];
  for (const d of dirs) await processOne(d, dateBranchDir);

  const report = path.join(ARTIFACTS_DIR, "report");
  if (fs.existsSync(report)) {
    fs.cpSync(report, path.join(dateBranchDir, "report"), { recursive: true });
  }
  console.log(`[proof] bundle ready: ${dateBranchDir} (zip and send — open report/index.html)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 9: Verify proof end-to-end**

Run: `npm run e2e:proof -- --grep @demo --project chromium-desktop`
Expected: suite runs with visible pacing (slowMo + caption holds); `e2e-artifacts/proof/<date>-feature-playwright-e2e/` contains per-flow folders with `.mp4` (subtitles burned in), `.srt`, step screenshots, and the copied HTML report. **Watch one mp4 yourself**: captions readable, actions humanly followable, voice audible if synthesis succeeded. If msedge-tts's API surface differs from the code above, read `node_modules/msedge-tts/README.md` and adjust `synthVoice` — voice failure must never fail the run.

- [ ] **Step 10: Commit** (only if authorized)

```bash
git add e2e/fixtures/demo.ts e2e/fixtures/test.ts e2e/proof e2e/specs/marketing/landing.spec.ts e2e/specs/account/my-account.spec.ts e2e/specs/membership/purchase-subscription.spec.ts
git commit -m "feat(e2e): proof mode — paced narrated demo videos with subtitles + AI voice"
```

---

### Task 13: Prod-build mode check, docs domain, manifest, final gate

**Files:**
- Create: `docs/e2e/` (scaffolded via the repo's doc-domain convention, then filled)
- Modify: `CLAUDE.md` (Domain Manifest — add `e2e` domain)

**Interfaces:**
- Consumes: everything.
- Produces: the spec's §13 success criteria, all demonstrated.

- [ ] **Step 1: Prod-build mode verification** (already implemented in Task 4's orchestrator)

Run: `$env:E2E_BUILD="1"; npm run e2e:smoke; Remove-Item Env:E2E_BUILD`
Expected: `next build` runs (minutes), suite runs green against `next start`. Any failure here that didn't occur in dev mode is a prod-only bug (CSP route class, removeConsole) — report it to DJ as a finding, don't paper over it.

- [ ] **Step 2: Add the `e2e` domain to the Domain Manifest** in `CLAUDE.md` (inside the JSON block, after `"support-chat"`):

```json
"e2e": {
  "docs": "docs/e2e/",
  "paths": [
    "e2e/**",
    "playwright.config.ts"
  ],
  "lastVerified": "2026-07-21"
}
```

- [ ] **Step 3: Create `docs/e2e/`** — invoke the `doc-domain` skill (`/doc-domain e2e`) to scaffold the repo-standard doc files, then fill them with real content: architecture (orchestrator diagram, env overlay, safety guard), how-to-run (all npm scripts + prerequisites incl. Stripe CLI), adding-a-spec (fixtures import, tags, demo.step conventions, selector-refinement rule, legal-copy rule for captions), proof-mode (what it produces, how to share), troubleshooting (guard refusals, Stripe CLI missing, webhook timing, visual baseline updates).

- [ ] **Step 4: Final success-criteria gate** (spec §13 — run every one, record output):

1. `npm run e2e` → green.
2. `npm run e2e` again immediately → green (idempotence).
3. `$env:E2E_MONGODB_URI="$env:MONGODB_URI"; npm run e2e` → aborts with "equals MONGODB_URI" (restore var after).
4. `npm run e2e:purchase` → green incl. decline-zero-grants + replay + double-submit.
5. `npm run e2e:proof -- --grep @demo` → watchable narrated mp4s produced.
6. `E2E_BUILD=1` smoke → green (Step 1).
7. Lens self-tests → green (`--grep "lens self-tests"`).
Also: `npm run lint` and `npm run type-check` → clean.

- [ ] **Step 5: Commit** (only if authorized)

```bash
git add CLAUDE.md docs/e2e
git commit -m "feat(e2e): docs domain, manifest entry, prod-mode + full success-criteria gate"
```

---

## Self-Review (done at authoring time)

- **Spec coverage:** §3 components → Tasks 2-5, 12; §4 guard → Tasks 2, 3, 4 (+gate 13.4); §5 lifecycle → Tasks 3, 5 (freshUser); §6 Stripe orchestration → Task 4; §7 projects/tags/flake → Task 1; §8 modes → Tasks 4, 13; §9 coverage → Tasks 5-8, 11; §10 lenses → Tasks 5 (watchdog), 9, 10, 11 (idempotency/replay), 6 (compliance); §11 proof → Task 12; §12 DX/governance → Tasks 1, 13; §13 criteria → Task 13 gate.
- **Known live-refinement points (flagged inline, not placeholders):** Stripe iframe field names, pay-button label, one-time pack CTA label, `stripewebhookqueues` collection/field names, msedge-tts API surface, exact `paymentevents` grant-doc shape. Each has a written refinement procedure (e2e:env + live DOM / model Read).
- **Type consistency:** `resolveE2eEnv` signature consistent across Tasks 2/3/4; `MEMBER`/`ADMIN` consts single-sourced in `db.ts`; `Cue` type single-sourced in `srt.ts`; state-file paths single-sourced in `paths.ts`.
