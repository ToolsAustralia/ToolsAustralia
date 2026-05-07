# Comprehensive Playwright E2E Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up an end-to-end Playwright suite that covers ~178 user-facing flows across 21 domains, runnable via `npm run test:e2e`, debuggable via `npm run test:e2e:ui` (remoteable on `0.0.0.0:8080`), with idempotent seed/cleanup, real test-mode Stripe, and worker-scoped fixtures.

**Architecture:** Programmatic seed creates 7 Mongo Users + 1 Affiliate (per worker) plus real Stripe test customers/subscriptions tagged `metadata.e2e=true`. Each role gets a Playwright project with a pre-built `storageState`. Specs opt into a project via `testMatch`. `globalTeardown` cascade-deletes seeded data and Stripe customers. Cross-cutting flows (URL params, modal priority queue, global UI, banners, toasts) get their own spec directories.

**Tech Stack:** Playwright `@playwright/test` (already installed in worktree), Stripe `^18.5.0`, MongoDB via Mongoose `^8.18.1`, NextAuth `^4.24.11` (JWT sessions), `bcryptjs` cost 12, `tsx` runner.

**Spec reference:** `docs/superpowers/specs/2026-05-04-e2e-test-suite-design.md`

---

## File Structure

### New files

```
scripts/
  seed-e2e-fixtures.ts                   # Idempotent Mongo+Stripe seed
  cleanup-e2e-fixtures.ts                # Cascade Mongo delete + Stripe customer del
  e2e-stripe-helpers.ts                  # Shared Stripe customer/sub/PM factory

e2e/
  global-setup.ts                        # Calls seed:e2e before any test runs
  global-teardown.ts                     # Calls cleanup:e2e after all tests run
  fixtures/
    affiliate-auth.setup.ts              # Affiliate /affiliate/login → e2e/.auth/affiliate.json
    seed-helpers.ts                      # resetUser(), withFreshMember()
    test-users.ts                        # Roster + worker-scoped email helper
    stripe-webhook-helper.ts             # POST signed events using NODE_ENV=development bypass
  utils/
    selectors.ts                         # data-testid registry (typed)
    intercept.ts                         # waitForApi(), assertJsonResponse()
  auth/                                  # 9 specs
  account/                               # 6 specs
  draws/major/                           # ~10 specs
  draws/mini/                            # ~5 specs
  membership/                            # 12 specs
  upsells/                               # 5 specs
  rewards/                               # 5 specs
  promo/                                 # 6 specs
  referrals/                             # 4 specs
  affiliate/                             # 5 specs
  partner/                               # 4 specs
  contact/                               # 3 specs
  consent/                               # 2 specs
  navigation/                            # 4 specs
  url-params/                            # 5 specs
  modal-queue/                           # 5 specs
  global-ui/                             # 5 specs
  banners-widgets/                       # 4 specs
  toasts/                                # 3 specs

docs/dev-tooling/
  e2e-testing.md                         # How to run, UI mode, codegen, debug
  e2e-fixtures.md                        # Roster, role meanings, reset semantics
  e2e-writing-tests.md                   # Conventions, data-testid usage, helpers
  e2e-troubleshooting.md                 # Common failures + fixes
```

### Modified files

```
package.json                             # Add ~15 npm scripts for e2e + seed/cleanup
playwright.config.ts                     # Add 9 projects, globalSetup/Teardown
.env.local.example                       # Document required vars (if file exists; create if not)
.gitignore                               # Add e2e/.auth/ if not already
e2e/fixtures/auth.setup.ts               # Extend from 1 user → 6 roles
docs/dev-tooling/testing.md              # Add E2E section
docs/dev-tooling/architecture.md         # Add E2E architecture overview
src/components/**/*.tsx                  # Add data-testid attributes (per spec contracts)
src/app/(site)/**/*.tsx                  # Add data-testid attributes (per spec contracts)
docs/<domain>/frontend.md                # Sync wherever component files were touched
```

### Boundary discipline

- `scripts/seed-e2e-fixtures.ts` and `cleanup-e2e-fixtures.ts` are **operations scripts**: import via `@/lib/mongodb`, `@/lib/stripe`, `@/models/*`. They do not depend on anything under `e2e/`.
- `e2e/fixtures/seed-helpers.ts` is the **test-side** counterpart — it imports from the seed scripts when it needs to call `getOrCreateReferralProfile` or apply field patches mid-test. It does not duplicate seed logic.
- `e2e/utils/selectors.ts` is the **only** file that defines `data-testid` strings. All specs and component edits import from this registry.
- Each spec file owns one flow. Multi-variant specs (e.g., `e2e/draws/major/entry.spec.ts` covering guest/member/declined) use `test.describe` blocks; one file = one logical flow.

---

## Phase 1 — Infrastructure (Tasks 1-9)

### Task 1: Install / verify Playwright dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (auto-updated)

- [ ] **Step 1: Verify Playwright is already installed**

Run: `cd C:/Codes/ToolsAustralia/.worktrees/shop-setup && npm ls @playwright/test playwright`
Expected: shows `@playwright/test@1.x.x` and `playwright@1.x.x`. The investigation confirmed both are present in `.worktrees/shop-setup/node_modules/`. If missing, run:

```bash
npm install --save-dev @playwright/test playwright
npx playwright install chromium
```

- [ ] **Step 2: Verify chromium is downloaded**

Run: `npx playwright --version && ls -la $(npx playwright --print-cli)/../chromium 2>/dev/null || echo "need install"`
If "need install": `npx playwright install chromium`

- [ ] **Step 3: Add @types/dotenv if missing**

Check: `npm ls dotenv` — should already show `dotenv@^17.2.2` (in deps).

No commit yet — package state should already match. If anything was installed, defer the commit until Task 2 bundles all package.json changes.

---

### Task 2: Add npm scripts to `package.json`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the e2e and seed scripts**

Read the current `scripts` block in `package.json`. After the existing `test:stripe-collection-pause` line, add:

```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui --ui-host=0.0.0.0 --ui-port=8080",
"test:e2e:headed": "playwright test --headed",
"test:e2e:debug": "playwright test --debug",
"test:e2e:report": "playwright show-report",
"test:e2e:codegen": "playwright codegen http://localhost:3000",
"test:e2e:auth": "playwright test e2e/auth",
"test:e2e:account": "playwright test e2e/account",
"test:e2e:draws": "playwright test e2e/draws",
"test:e2e:membership": "playwright test e2e/membership",
"test:e2e:shop": "playwright test e2e/shop",
"test:e2e:upsells": "playwright test e2e/upsells",
"test:e2e:rewards": "playwright test e2e/rewards",
"test:e2e:promo": "playwright test e2e/promo",
"test:e2e:referrals": "playwright test e2e/referrals",
"test:e2e:affiliate": "playwright test e2e/affiliate",
"test:e2e:partner": "playwright test e2e/partner",
"test:e2e:contact": "playwright test e2e/contact",
"test:e2e:consent": "playwright test e2e/consent",
"test:e2e:navigation": "playwright test e2e/navigation",
"test:e2e:url-params": "playwright test e2e/url-params",
"test:e2e:modal-queue": "playwright test e2e/modal-queue",
"test:e2e:global-ui": "playwright test e2e/global-ui",
"test:e2e:banners-widgets": "playwright test e2e/banners-widgets",
"test:e2e:toasts": "playwright test e2e/toasts",
"seed:e2e": "tsx scripts/seed-e2e-fixtures.ts",
"seed:e2e:clear": "tsx scripts/seed-e2e-fixtures.ts --clear",
"cleanup:e2e": "tsx scripts/cleanup-e2e-fixtures.ts"
```

- [ ] **Step 2: Verify scripts are valid JSON**

Run: `node -e "console.log(Object.keys(require('./package.json').scripts).length)"`
Expected: prints a number ≥ 90 (was ~50 before).

- [ ] **Step 3: Run an existing test as a smoke check**

Run: `npm run test:anchor-billing`
Expected: passes (no behavioral change — we only added new scripts).

- [ ] **Step 4: Stage but DO NOT commit**

```bash
git add package.json package-lock.json
git status
```

Wait for explicit user authorization before any `git commit`. Per project hard rule, all commits require explicit approval.

---

### Task 3: Add E2E env contract to `.env.local.example`

**Files:**
- Modify (or create): `.env.local.example`

- [ ] **Step 1: Read current `.env.local.example`**

Run: `ls -la .env.local.example 2>&1` — if missing, this file may not exist. Check `.gitignore` to see if it should.

- [ ] **Step 2: Append E2E section**

If the file exists, append. If not, create:

```bash
# === E2E test suite (Playwright) ===
# All E2E tests run against the same MongoDB + Stripe test environment as dev.
# Required for `npm run test:e2e` to function. If any are missing, globalSetup
# fails loud with a helpful message.

E2E_BASE_URL=http://localhost:3000
E2E_TEST_USER_PASSWORD=Test_Password_123!

# Stripe test-mode price IDs for Bronze/Silver/Gold membership tiers.
# Find these in your Stripe dashboard under Products > <plan>. They start with `price_`.
STRIPE_PRICE_BRONZE=price_xxx
STRIPE_PRICE_SILVER=price_xxx
STRIPE_PRICE_GOLD=price_xxx

# Reused (must already be set):
# - MONGODB_URI
# - STRIPE_SECRET_KEY (test mode sk_test_...)
# - STRIPE_WEBHOOK_SECRET
# - NEXTAUTH_SECRET
# - NEXTAUTH_URL
```

- [ ] **Step 3: Verify .gitignore includes auth state**

Open `.gitignore` and search for `e2e/.auth`. If absent, append:

```
# Playwright E2E auth states (regenerated each run)
e2e/.auth/
```

- [ ] **Step 4: Stage**

```bash
git add .env.local.example .gitignore
```

No commit yet.

---

### Task 4: Create `e2e/fixtures/test-users.ts` — roster and helpers

**Files:**
- Create: `e2e/fixtures/test-users.ts`

- [ ] **Step 1: Define the role roster type and data**

Create `e2e/fixtures/test-users.ts`:

```ts
// e2e/fixtures/test-users.ts
//
// Single source of truth for the E2E user roster.
// Both the seed script and Playwright specs import from here so emails,
// roles, and worker scoping are defined exactly once.

export type Role =
  | "guest"
  | "fresh"
  | "bronze"
  | "silver"
  | "gold"
  | "cancelling"
  | "pastdue"
  | "affiliate";

export const PACKAGE_ID_BY_ROLE: Record<
  Exclude<Role, "guest" | "fresh" | "affiliate">,
  string
> = {
  bronze: "member-bronze",
  silver: "member-silver",
  gold: "member-gold",
  cancelling: "member-bronze", // cancelling Bronze
  pastdue: "member-bronze",    // past-due Bronze
};

export interface RoleProfile {
  role: Role;
  email: string;
  firstName: string;
  lastName: string;
}

/**
 * Resolve the worker-scoped email for a role. Playwright sets
 * TEST_WORKER_INDEX in env (0, 1, 2, …) when running in parallel.
 * Outside Playwright (seed script CLI) this defaults to "0".
 */
export function emailFor(role: Role, workerIndex?: number): string {
  if (role === "guest") {
    throw new Error("guest has no email — it is unauthenticated");
  }
  const idx = workerIndex ?? Number(process.env.TEST_WORKER_INDEX ?? "0");
  return `test-e2e-${role}-w${idx}@example.com`;
}

/**
 * Workers Playwright will spawn. Read from PLAYWRIGHT_WORKERS env or default to 4.
 * The seed script multiplies the roster by this count.
 */
export function workerCount(): number {
  const fromEnv = Number(process.env.PLAYWRIGHT_WORKERS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 4;
}

/**
 * Materialised roster for a given worker index.
 * Used by seed and cleanup scripts.
 */
export function rosterFor(workerIndex: number): RoleProfile[] {
  const make = (role: Role, firstName: string, lastName: string): RoleProfile => ({
    role,
    email: emailFor(role, workerIndex),
    firstName,
    lastName,
  });
  return [
    make("fresh",      "Fresh",      "Tester"),
    make("bronze",     "Bronze",     "Member"),
    make("silver",     "Silver",     "Member"),
    make("gold",       "Gold",       "Member"),
    make("cancelling", "Cancelling", "Member"),
    make("pastdue",    "PastDue",    "Member"),
    make("affiliate",  "Affiliate",  "Partner"),
  ];
}

export const E2E_USER_PASSWORD = process.env.E2E_TEST_USER_PASSWORD ?? "";
```

- [ ] **Step 2: Verify it type-checks in isolation**

Run: `npx tsc --noEmit e2e/fixtures/test-users.ts`
Expected: clean exit. If errors about missing types, ensure `tsconfig.json` includes the path.

- [ ] **Step 3: Stage**

```bash
git add e2e/fixtures/test-users.ts
```

---

### Task 5: Create `scripts/e2e-stripe-helpers.ts` — Stripe customer/sub factory

**Files:**
- Create: `scripts/e2e-stripe-helpers.ts`

- [ ] **Step 1: Implement the factory**

Create `scripts/e2e-stripe-helpers.ts`:

```ts
// scripts/e2e-stripe-helpers.ts
//
// Idempotent helpers to create the Stripe-side state the E2E seed needs.
// Every customer gets metadata.e2e=true so cleanup can find and delete them.

import { stripe } from "@/lib/stripe";

const PRICE_BY_PACKAGE: Record<string, string | undefined> = {
  "member-bronze": process.env.STRIPE_PRICE_BRONZE,
  "member-silver": process.env.STRIPE_PRICE_SILVER,
  "member-gold":   process.env.STRIPE_PRICE_GOLD,
};

export function priceForPackage(packageId: string): string {
  const price = PRICE_BY_PACKAGE[packageId];
  if (!price) {
    throw new Error(
      `Missing Stripe price ID for package "${packageId}". ` +
      `Set STRIPE_PRICE_BRONZE/SILVER/GOLD in .env.local.`,
    );
  }
  return price;
}

/**
 * Create (or reuse) a Stripe customer for an E2E test user.
 * Idempotent by email — if a customer with this email and metadata.e2e
 * exists, it is returned unchanged.
 */
export async function ensureE2ECustomer(args: {
  email: string;
  name: string;
  role: string;
}): Promise<{ customerId: string }> {
  const existing = await stripe.customers.list({ email: args.email, limit: 1 });
  if (existing.data[0]?.metadata?.e2e === "true") {
    return { customerId: existing.data[0].id };
  }
  const customer = await stripe.customers.create({
    email: args.email,
    name: args.name,
    metadata: { e2e: "true", role: args.role },
  });
  return { customerId: customer.id };
}

/**
 * Attach Stripe's pre-tokenised test card "pm_card_visa" to a customer
 * and set it as the default for invoices and subscriptions. This avoids
 * needing the PaymentElement UI during seeding.
 */
export async function attachTestPaymentMethod(customerId: string): Promise<void> {
  const pm = await stripe.paymentMethods.create({
    type: "card",
    card: { token: "tok_visa" },
  });
  await stripe.paymentMethods.attach(pm.id, { customer: customerId });
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: pm.id },
  });
}

/**
 * Create an active subscription for the customer on the given package's price.
 * The first invoice settles immediately because the default PM is set.
 */
export async function ensureE2ESubscription(args: {
  customerId: string;
  packageId: string;
}): Promise<{ subscriptionId: string; currentPeriodEnd: Date }> {
  const sub = await stripe.subscriptions.create({
    customer: args.customerId,
    items: [{ price: priceForPackage(args.packageId) }],
    metadata: { e2e: "true", packageId: args.packageId },
    expand: ["latest_invoice.payment_intent"],
  });
  return {
    subscriptionId: sub.id,
    currentPeriodEnd: new Date(sub.current_period_end * 1000),
  };
}

/**
 * List all e2e customers (metadata.e2e=true). Paginates Stripe results.
 */
export async function listE2ECustomers(): Promise<string[]> {
  const ids: string[] = [];
  let starting_after: string | undefined;
  while (true) {
    const page = await stripe.customers.list({ limit: 100, starting_after });
    for (const c of page.data) {
      if (c.metadata?.e2e === "true") ids.push(c.id);
    }
    if (!page.has_more) break;
    starting_after = page.data[page.data.length - 1].id;
  }
  return ids;
}

/**
 * Delete a Stripe customer (cascades subscriptions, invoices, PIs Stripe-side).
 * Tolerates already-deleted state.
 */
export async function deleteE2ECustomer(customerId: string): Promise<void> {
  try {
    await stripe.customers.del(customerId);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === "resource_missing") return;
    throw err;
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit scripts/e2e-stripe-helpers.ts`
Expected: clean. If `@/lib/stripe` path errors, the tsconfig path alias should resolve via the existing setup — check `tsconfig.json` has `"paths": { "@/*": ["./src/*"] }`.

- [ ] **Step 3: Stage**

```bash
git add scripts/e2e-stripe-helpers.ts
```

---

### Task 6: Create `scripts/seed-e2e-fixtures.ts` — Mongo + Stripe seed

**Files:**
- Create: `scripts/seed-e2e-fixtures.ts`

- [ ] **Step 1: Implement seed script structure**

Create `scripts/seed-e2e-fixtures.ts`:

```ts
// scripts/seed-e2e-fixtures.ts
//
// Idempotent seed for the E2E test roster. Mirrors the pattern from
// `scripts/seed-shop-products.ts` (dotenv → connectDB → upsert → disconnect).
//
// Runs from globalSetup or CLI. Use `--clear` to delete without re-creating.

import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import Affiliate from "@/models/Affiliate";
import { getOrCreateReferralProfile } from "@/lib/referral";
import { handleSubscriptionQueueUpdate } from "@/utils/partner-discounts/partner-discount-queue";
import { getPackageById } from "@/utils/membership/get-active-package";
import {
  ensureE2ECustomer,
  attachTestPaymentMethod,
  ensureE2ESubscription,
  listE2ECustomers,
  deleteE2ECustomer,
} from "./e2e-stripe-helpers";
import { rosterFor, workerCount, PACKAGE_ID_BY_ROLE, E2E_USER_PASSWORD, type RoleProfile } from "../e2e/fixtures/test-users";

const isDryClear = process.argv.includes("--clear");

async function main() {
  if (!E2E_USER_PASSWORD) {
    throw new Error("E2E_TEST_USER_PASSWORD is not set in .env.local");
  }

  await connectDB();

  console.log(isDryClear ? "🧹 Clearing E2E fixtures..." : "🌱 Seeding E2E fixtures...");

  // 1. Always purge first — seed is fully idempotent.
  await User.deleteMany({ email: /^test-e2e-/ });
  await Affiliate.deleteMany({ email: /^test-e2e-/ });

  // 2. Stripe-side cleanup (only e2e-tagged customers).
  const stripeIds = await listE2ECustomers();
  console.log(`  → deleting ${stripeIds.length} Stripe e2e customer(s)`);
  for (const id of stripeIds) {
    await deleteE2ECustomer(id);
  }

  if (isDryClear) {
    console.log("✅ Cleared. Exiting (--clear).");
    await mongoose.disconnect();
    return;
  }

  // 3. Re-seed: one roster per worker index
  const workers = workerCount();
  const passwordHash = await bcrypt.hash(E2E_USER_PASSWORD, 12);

  for (let w = 0; w < workers; w++) {
    console.log(`  → worker ${w}`);
    const roster = rosterFor(w);
    for (const profile of roster) {
      await seedRole(profile, passwordHash);
    }
  }

  console.log(`✅ Seeded ${workers * 7} users (${workers} workers × 7 roles)`);
  await mongoose.disconnect();
}

async function seedRole(profile: RoleProfile, passwordHash: string): Promise<void> {
  if (profile.role === "affiliate") {
    return seedAffiliate(profile, passwordHash);
  }
  return seedUser(profile, passwordHash);
}

async function seedUser(profile: RoleProfile, passwordHash: string): Promise<void> {
  const baseUserDoc = {
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    password: passwordHash,
    isEmailVerified: true,
    profileSetupCompleted: true,
    isActive: true,
    role: "user",
  };

  // "fresh": no subscription, no Stripe.
  if (profile.role === "fresh") {
    await User.create(baseUserDoc);
    return;
  }

  // Member roles: full Stripe + subscription state.
  const packageId = PACKAGE_ID_BY_ROLE[profile.role];
  const pkg = getPackageById(packageId);
  if (!pkg) throw new Error(`Unknown packageId "${packageId}" for role ${profile.role}`);

  const { customerId } = await ensureE2ECustomer({
    email: profile.email,
    name: `${profile.firstName} ${profile.lastName}`,
    role: profile.role,
  });
  await attachTestPaymentMethod(customerId);
  const { subscriptionId, currentPeriodEnd } = await ensureE2ESubscription({
    customerId,
    packageId,
  });

  const startDate = new Date();
  const user = await User.create({
    ...baseUserDoc,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    subscription: {
      packageId,
      isActive: true,
      status: "active",
      autoRenew: true,
      startDate,
      endDate: currentPeriodEnd,
    },
  });

  // Mirror production side-effects (per investigation §11)
  await getOrCreateReferralProfile(user._id.toString());
  await handleSubscriptionQueueUpdate(user, "start", {
    packageId,
    packageName: pkg.name,
    endDate: currentPeriodEnd,
  });

  // Variant patches AFTER baseline state is set (per investigation §7)
  if (profile.role === "cancelling") {
    await User.updateOne(
      { _id: user._id },
      { $set: { "subscription.autoRenew": false, "subscription.cancelledAt": new Date() } },
    );
  } else if (profile.role === "pastdue") {
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          "subscription.isActive": false,
          "subscription.status": "past_due",
          "subscription.pastDueAt": new Date(),
        },
      },
    );
  }
}

async function seedAffiliate(profile: RoleProfile, passwordHash: string): Promise<void> {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  await Affiliate.create({
    name: `${profile.firstName} ${profile.lastName}`,
    email: profile.email,
    username: `affiliate-e2e-${profile.email.match(/-w(\d+)/)?.[1] ?? "0"}`,
    password: passwordHash,
    affiliateCode: `AFFE2E${profile.email.match(/-w(\d+)/)?.[1] ?? "0"}`.toUpperCase(),
    affiliateLink: `${baseUrl}/membership?ref=AFFE2E${profile.email.match(/-w(\d+)/)?.[1] ?? "0"}`.toUpperCase(),
    isActive: true,
    commissionRate: 0.3,
  });
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Dry-run (clear mode) — should not crash even if nothing is there**

Run: `npm run seed:e2e:clear`
Expected: prints "🧹 Clearing..." and "✅ Cleared", exits 0. If it fails because env vars are missing, set them in `.env.local` and retry.

- [ ] **Step 3: Full seed run**

Run: `npm run seed:e2e`
Expected: prints "🌱 Seeding...", creates 4 × 7 = 28 users (default workers=4), exits 0. Verify in Mongo:

```bash
node -e "
require('dotenv').config({path:'.env.local'});
require('mongoose').connect(process.env.MONGODB_URI).then(async m => {
  const c = await m.connection.collection('users').countDocuments({email:/^test-e2e-/});
  console.log('seeded users:', c);
  m.disconnect();
});
"
```
Expected: `seeded users: 24` (28 minus 4 affiliates that go to a different collection).

Verify Stripe customers in test mode:
```bash
node -e "
require('dotenv').config({path:'.env.local'});
const {stripe} = require('./src/lib/stripe.ts');
stripe.customers.list({limit:50}).then(r => {
  const e2e = r.data.filter(c => c.metadata.e2e==='true');
  console.log('e2e customers:', e2e.length);
});
" 2>&1 | tail -5
```
Expected: `e2e customers: 20` (5 member roles × 4 workers).

- [ ] **Step 4: Re-run seed — must be idempotent**

Run: `npm run seed:e2e`
Expected: same final counts. No errors about duplicate emails (the script purges first).

- [ ] **Step 5: Stage**

```bash
git add scripts/seed-e2e-fixtures.ts
```

---

### Task 7: Create `scripts/cleanup-e2e-fixtures.ts` — cascading cleanup

**Files:**
- Create: `scripts/cleanup-e2e-fixtures.ts`

- [ ] **Step 1: Implement the cleanup script**

Create `scripts/cleanup-e2e-fixtures.ts`:

```ts
// scripts/cleanup-e2e-fixtures.ts
//
// Cascade-deletes all E2E fixtures. Run by globalTeardown or manually.
// Idempotent.

import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import Affiliate from "@/models/Affiliate";
import MembershipRenewalCycle from "@/models/MembershipRenewalCycle";
import MembershipStatusHistory from "@/models/MembershipStatusHistory";
import PaymentEvent from "@/models/PaymentEvent";
import RedeemableIssuance from "@/models/RedeemableIssuance";
import MilestoneIssuance from "@/models/MilestoneIssuance";
import TicketEntry from "@/models/TicketEntry";
import Order from "@/models/Order";
import ReferralEvent from "@/models/ReferralEvent";
import AffiliateCommission from "@/models/AffiliateCommission";
import AffiliatePayout from "@/models/AffiliatePayout";
import InvoiceChargeLog from "@/models/InvoiceChargeLog";
import MajorDraw from "@/models/MajorDraw";
import { listE2ECustomers, deleteE2ECustomer } from "./e2e-stripe-helpers";

async function main() {
  await connectDB();
  console.log("🧹 Cleanup: cascade-deleting E2E fixtures...");

  const users = await User.find({ email: /^test-e2e-/ }, { _id: 1 }).lean();
  const userIds = users.map((u) => u._id);
  console.log(`  → ${userIds.length} test users found`);

  if (userIds.length > 0) {
    const filter = { userId: { $in: userIds } };
    const refFilter = { $or: [{ referrerId: { $in: userIds } }, { inviteeUserId: { $in: userIds } }] };

    await Promise.all([
      MembershipRenewalCycle.deleteMany(filter),
      MembershipStatusHistory.deleteMany(filter),
      PaymentEvent.deleteMany(filter),
      RedeemableIssuance.deleteMany(filter),
      MilestoneIssuance.deleteMany(filter),
      TicketEntry.deleteMany(filter),
      ReferralEvent.deleteMany(refFilter),
      AffiliateCommission.deleteMany(filter),
      AffiliatePayout.deleteMany(filter),
      InvoiceChargeLog.deleteMany(filter),
      Order.deleteMany({ user: { $in: userIds } }),
    ]);

    // Pull from MajorDraw.entries[] arrays
    await MajorDraw.updateMany(
      { "entries.userId": { $in: userIds } },
      { $pull: { entries: { userId: { $in: userIds } } } },
    );
  }

  await User.deleteMany({ email: /^test-e2e-/ });
  await Affiliate.deleteMany({ email: /^test-e2e-/ });

  // Stripe-side
  const stripeIds = await listE2ECustomers();
  console.log(`  → ${stripeIds.length} Stripe e2e customers to delete`);
  for (const id of stripeIds) {
    await deleteE2ECustomer(id);
  }

  console.log("✅ Cleanup complete.");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌ Cleanup failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Run after a previous seed to verify**

Run: `npm run seed:e2e && npm run cleanup:e2e && npm run cleanup:e2e`
Expected: second cleanup run prints `0 test users found` and `0 Stripe e2e customers`.

- [ ] **Step 3: Stage**

```bash
git add scripts/cleanup-e2e-fixtures.ts
```

---

### Task 8: Update `playwright.config.ts` — projects + globalSetup/Teardown

**Files:**
- Modify: `playwright.config.ts`

- [ ] **Step 1: Read existing config and replace**

The existing config has 3 projects (setup, chromium-guest, chromium-member) bound to specific shop spec patterns. Replace with the role-based project structure. New file content:

```ts
import { defineConfig, devices } from "@playwright/test";

const E2E_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: E2E_BASE_URL,
    trace: "on-first-retry",
    headless: true,
  },
  workers: process.env.PLAYWRIGHT_WORKERS ? Number(process.env.PLAYWRIGHT_WORKERS) : 4,
  reporter: [["list"], ["html", { open: "never" }]],
  projects: [
    // Setup projects build storageState files. Run once, all member projects depend on them.
    { name: "setup-shared",    testMatch: /fixtures\/auth\.setup\.ts/ },
    { name: "setup-affiliate", testMatch: /fixtures\/affiliate-auth\.setup\.ts/ },

    // Guest project — anything under e2e/* that does NOT need auth.
    {
      name: "chromium-guest",
      testMatch: /(navigation|consent|auth|contact|url-params|banners-widgets|partner|promo|draws\/(major\/(view|countdown|gate-closed|past)|mini\/list)|shop\/(guest-checkout|cart-persistence|out-of-stock|three-ds|cart-icon-badge|browse-filter|brand-page))\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },

    // Per-role authenticated projects. Each spec opts in via testMatch glob.
    {
      name: "chromium-fresh",
      testMatch: /(account\/.*|membership\/(join|package-detail|special-packages|benefits)|shop\/(member-checkout|my-account-orders|member-discount|order-detail)|referrals\/.*|rewards\/(widget-visibility|catalog|redeem-code)|toasts\/.*|modal-queue\/.*|global-ui\/.*)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/fresh.json" },
      dependencies: ["setup-shared"],
    },
    {
      name: "chromium-bronze",
      testMatch: /membership\/(upgrade|downgrade|cancel|cancel-upsell-redeem|update-payment-method|explainer-modal)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/bronze.json" },
      dependencies: ["setup-shared"],
    },
    {
      name: "chromium-silver",
      testMatch: /membership\/(upgrade|downgrade)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/silver.json" },
      dependencies: ["setup-shared"],
    },
    {
      name: "chromium-gold",
      testMatch: /membership\/(downgrade)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/gold.json" },
      dependencies: ["setup-shared"],
    },
    {
      name: "chromium-cancelling",
      testMatch: /membership\/(resume)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/cancelling.json" },
      dependencies: ["setup-shared"],
    },
    {
      name: "chromium-pastdue",
      testMatch: /membership\/(renewal-failed)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/pastdue.json" },
      dependencies: ["setup-shared"],
    },
    {
      name: "chromium-affiliate",
      testMatch: /affiliate\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/affiliate.json" },
      dependencies: ["setup-affiliate"],
    },
  ],
  webServer: {
    command: "npm run dev",
    url: E2E_BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

- [ ] **Step 2: Verify the existing 8 shop specs still match a project**

Run:
```
npx playwright test --list 2>&1 | grep -E "shop/(guest|member|cart|out-of|three-ds|my-account)"
```
Expected: every existing shop spec is listed under a project. If any is missing from the testMatch globs, fix the regex.

- [ ] **Step 3: Stage**

```bash
git add playwright.config.ts
```

---

### Task 9: Create `e2e/global-setup.ts` and `e2e/global-teardown.ts`

**Files:**
- Create: `e2e/global-setup.ts`
- Create: `e2e/global-teardown.ts`

- [ ] **Step 1: globalSetup**

Create `e2e/global-setup.ts`:

```ts
// e2e/global-setup.ts — runs once before any spec.
// Validates env, then invokes the seed script via tsx as a subprocess so
// we don't double-import models/Mongo connections in this process.

import { execSync } from "node:child_process";
import { FullConfig } from "@playwright/test";

const REQUIRED_VARS = [
  "MONGODB_URI",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "E2E_TEST_USER_PASSWORD",
  "STRIPE_PRICE_BRONZE",
  "STRIPE_PRICE_SILVER",
  "STRIPE_PRICE_GOLD",
] as const;

export default async function globalSetup(_config: FullConfig) {
  // CI mode: skip silently if Stripe price IDs are absent (PR from fork).
  if (process.env.CI === "true" && !process.env.STRIPE_PRICE_BRONZE) {
    console.warn("⚠️  CI=true and STRIPE_PRICE_BRONZE absent — skipping seed (likely a fork PR).");
    return;
  }

  const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(
      `❌ Missing required env vars for E2E:\n  - ${missing.join("\n  - ")}\n` +
        `Add them to .env.local. See .env.local.example.`,
    );
  }

  console.log("🌱 globalSetup: seeding E2E fixtures (this can take ~10-15s)");
  execSync("npm run seed:e2e", { stdio: "inherit" });
}
```

- [ ] **Step 2: globalTeardown**

Create `e2e/global-teardown.ts`:

```ts
// e2e/global-teardown.ts — runs once after all specs.

import { execSync } from "node:child_process";
import { FullConfig } from "@playwright/test";

export default async function globalTeardown(_config: FullConfig) {
  if (process.env.E2E_KEEP_FIXTURES === "true") {
    console.log("⏭  globalTeardown: E2E_KEEP_FIXTURES=true — skipping cleanup");
    return;
  }
  console.log("🧹 globalTeardown: cleaning up E2E fixtures");
  try {
    execSync("npm run cleanup:e2e", { stdio: "inherit" });
  } catch (err) {
    console.error("⚠️  Cleanup failed; data may persist. Run `npm run cleanup:e2e` manually.", err);
  }
}
```

- [ ] **Step 3: Smoke test — start playwright but list tests only**

Run: `npx playwright test --list 2>&1 | head -20`
Expected: lists projects and tests. globalSetup is NOT triggered for `--list` (only for actual runs). If errors about TS imports, ensure tsconfig includes `e2e/**`.

- [ ] **Step 4: Stage**

```bash
git add e2e/global-setup.ts e2e/global-teardown.ts
```

---

## Phase 2 — Helpers (Tasks 10-15)

### Task 10: Extend `e2e/fixtures/auth.setup.ts` for all roles

**Files:**
- Modify: `e2e/fixtures/auth.setup.ts`

- [ ] **Step 1: Replace contents**

Replace the entire file with role-iterating logic:

```ts
// e2e/fixtures/auth.setup.ts
//
// Generates one storageState file per non-guest, non-affiliate role.
// The seed script must have run before this (globalSetup ensures that).
import { test as setup, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import { emailFor, E2E_USER_PASSWORD, type Role } from "./test-users";

const AUTH_DIR = path.join(__dirname, "../.auth");
const ROLES: Exclude<Role, "guest" | "affiliate">[] = [
  "fresh", "bronze", "silver", "gold", "cancelling", "pastdue",
];

if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

for (const role of ROLES) {
  setup(`authenticate ${role}`, async ({ page }) => {
    if (!E2E_USER_PASSWORD) {
      setup.skip(true, "E2E_TEST_USER_PASSWORD not set — skipping authenticated specs");
      return;
    }
    const email = emailFor(role, 0); // setup uses worker 0; tests resolve their own worker.
    await page.goto("/login");
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', E2E_USER_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/my-account");
    await expect(page.locator('[data-testid="dashboard-root"]')).toBeVisible({ timeout: 10_000 });
    await page.context().storageState({ path: path.join(AUTH_DIR, `${role}.json`) });
  });
}
```

> Note: this assumes `[data-testid="dashboard-root"]` will be added to `src/app/(site)/my-account/page.tsx` in Phase 3 Task A1. Until then, replace the `expect(...)` line with `await page.waitForLoadState("networkidle");` and add the testid in A1.

- [ ] **Step 2: Stage**

```bash
git add e2e/fixtures/auth.setup.ts
```

---

### Task 11: Create `e2e/fixtures/affiliate-auth.setup.ts`

**Files:**
- Create: `e2e/fixtures/affiliate-auth.setup.ts`

- [ ] **Step 1: Implement**

```ts
// e2e/fixtures/affiliate-auth.setup.ts
//
// Affiliate uses a separate /affiliate/login form that mints an
// `affiliate_token` cookie (jose JWT, NOT NextAuth). Storage state captures it.
import { test as setup } from "@playwright/test";
import path from "path";
import fs from "fs";
import { emailFor, E2E_USER_PASSWORD } from "./test-users";

const AUTH_FILE = path.join(__dirname, "../.auth/affiliate.json");
if (!fs.existsSync(path.dirname(AUTH_FILE))) fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

setup("authenticate affiliate", async ({ page }) => {
  if (!E2E_USER_PASSWORD) {
    setup.skip(true, "E2E_TEST_USER_PASSWORD not set — skipping affiliate specs");
    return;
  }
  await page.goto("/affiliate/login");
  await page.fill('input[name="email"]', emailFor("affiliate", 0));
  await page.fill('input[name="password"]', E2E_USER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/affiliate");
  await page.context().storageState({ path: AUTH_FILE });
});
```

- [ ] **Step 2: Stage**

```bash
git add e2e/fixtures/affiliate-auth.setup.ts
```

---

### Task 12: Create `e2e/fixtures/seed-helpers.ts` — per-test reset

**Files:**
- Create: `e2e/fixtures/seed-helpers.ts`

- [ ] **Step 1: Implement**

```ts
// e2e/fixtures/seed-helpers.ts
//
// Per-test helpers used in beforeEach to reset a mutated fixture user
// to its baseline state. Cheap (single Mongo update). Imports the
// shared models — must run in the Node side of Playwright fixtures
// (use via `test.beforeEach(async () => { await resetUser('bronze') })`).

import mongoose from "mongoose";
import User from "@/models/User";
import { emailFor, type Role, PACKAGE_ID_BY_ROLE } from "./test-users";
import connectDB from "@/lib/mongodb";

let connected = false;

async function ensureConnection() {
  if (connected) return;
  await connectDB();
  connected = true;
}

/**
 * Reset a member fixture's subscription fields to baseline (active, autoRenew=true,
 * 30-day endDate). Use in beforeEach for specs that mutate state (cancel, upgrade).
 */
export async function resetUser(role: Exclude<Role, "guest" | "fresh" | "affiliate">): Promise<void> {
  await ensureConnection();
  const email = emailFor(role);
  const packageId = PACKAGE_ID_BY_ROLE[role];
  const startDate = new Date();
  const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const baseline: Record<string, unknown> = {
    "subscription.packageId": packageId,
    "subscription.isActive": true,
    "subscription.status": "active",
    "subscription.autoRenew": true,
    "subscription.startDate": startDate,
    "subscription.endDate": endDate,
  };
  const unsetFields: Record<string, ""> = {
    "subscription.cancelledAt": "",
    "subscription.pastDueAt": "",
    "subscription.pendingChange": "",
  };

  if (role === "cancelling") {
    baseline["subscription.autoRenew"] = false;
    baseline["subscription.cancelledAt"] = new Date();
    delete (unsetFields as Record<string, string>)["subscription.cancelledAt"];
  } else if (role === "pastdue") {
    baseline["subscription.isActive"] = false;
    baseline["subscription.status"] = "past_due";
    baseline["subscription.pastDueAt"] = new Date();
    delete (unsetFields as Record<string, string>)["subscription.pastDueAt"];
  }

  await User.updateOne({ email }, { $set: baseline, $unset: unsetFields });
}

/**
 * For specs that need an ephemeral, never-shared user (e.g., the
 * "first-time membership purchase" walk test). Creates the user inside
 * the test, returns email + cleanup callback.
 */
export async function withFreshMember(): Promise<{ email: string; cleanup: () => Promise<void> }> {
  await ensureConnection();
  const email = `test-e2e-fresh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  // Implementation deferred to the spec that needs it; create lazily there.
  return {
    email,
    cleanup: async () => {
      await User.deleteOne({ email });
    },
  };
}
```

- [ ] **Step 2: Stage**

```bash
git add e2e/fixtures/seed-helpers.ts
```

---

### Task 13: Create `e2e/fixtures/stripe-webhook-helper.ts`

**Files:**
- Create: `e2e/fixtures/stripe-webhook-helper.ts`

- [ ] **Step 1: Implement**

```ts
// e2e/fixtures/stripe-webhook-helper.ts
//
// Posts crafted Stripe webhook events to /api/stripe/webhook using the
// dev-only `test_bypass` signature (see route.ts:4857). NODE_ENV must be
// "development" — playwright.config webServer runs `npm run dev` so this
// is satisfied.

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export interface StripeEventPayload {
  type: string;
  data: { object: Record<string, unknown> };
}

/**
 * POST a fake Stripe event to the local webhook endpoint.
 * Generates a unique event ID per call so ProcessedStripeEvent doesn't dedupe.
 */
export async function postWebhook(eventType: string, eventData: Record<string, unknown>): Promise<Response> {
  const event = {
    id: `evt_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    object: "event",
    type: eventType,
    api_version: "2025-08-27.basil",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: { object: eventData },
  };
  return fetch(`${BASE_URL}/api/stripe/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": "test_bypass",
    },
    body: JSON.stringify(event),
  });
}
```

- [ ] **Step 2: Stage**

```bash
git add e2e/fixtures/stripe-webhook-helper.ts
```

---

### Task 14: Create `e2e/utils/selectors.ts` — typed `data-testid` registry

**Files:**
- Create: `e2e/utils/selectors.ts`

- [ ] **Step 1: Implement an initial registry**

Establish the registry. As each Phase 3 domain task adds testids, append to this file:

```ts
// e2e/utils/selectors.ts
//
// Single source of truth for data-testid strings. Specs import from here;
// component edits add the testids referenced. Adding a new testid is:
//   1. Add the string to this file with a comment explaining its location.
//   2. Add the data-testid={...} attribute to the component.
//   3. Update the matching docs/<domain>/frontend.md.

export const testid = {
  // Layout (src/app/(site)/my-account/page.tsx)
  dashboardRoot: "dashboard-root",

  // Header (src/components/layout/Header.tsx)
  headerCartIcon: "header-cart-icon",
  headerCartDrawer: "header-cart-drawer",
  headerSearchOverlay: "header-search-overlay",
  headerTopBar: "header-top-bar",
  headerTopBarDismiss: "header-top-bar-dismiss",
  headerMembershipBadge: "header-membership-badge",
  headerUserMenu: "header-user-menu",
  headerLogoutButton: "header-logout-button",

  // Auth (src/app/login/page.tsx, src/app/reset-password/page.tsx)
  loginEmail: "login-email",
  loginPassword: "login-password",
  loginSubmit: "login-submit",
  loginGoogleButton: "login-google-button",
  loginOtpTab: "login-otp-tab",
  loginPasswordTab: "login-password-tab",
  registerLink: "register-link",
  forgotPasswordLink: "forgot-password-link",
  resetPasswordEmail: "reset-password-email",
  resetPasswordNew: "reset-password-new",
  resetPasswordConfirm: "reset-password-confirm",
  resetPasswordSubmit: "reset-password-submit",

  // Modals (src/components/modals/*)
  modalContainer: "modal-container",
  modalCloseButton: "modal-close-button",
  loginPromptModal: "login-prompt-modal",
  membershipModal: "membership-modal",
  packageCardBronze: "package-card-bronze",
  packageCardSilver: "package-card-silver",
  packageCardGold: "package-card-gold",
  cancellationUpsellModal: "cancellation-upsell-modal",
  cancellationUpsellAccept: "cancellation-upsell-accept",
  cancellationUpsellDecline: "cancellation-upsell-decline",
  upsellModal: "upsell-modal",
  upsellRedeemButton: "upsell-redeem-button",
  renewalFailedModal: "renewal-failed-modal",
  subscriptionExplainerModal: "subscription-explainer-modal",
  referFriendModal: "refer-friend-modal",
  referCopyCodeButton: "refer-copy-code-button",
  referCopyLinkButton: "refer-copy-link-button",
  pixelConsentModal: "pixel-consent-modal",
  pixelConsentAccept: "pixel-consent-accept",
  pixelConsentDecline: "pixel-consent-decline",
  pastDrawsModal: "past-draws-modal",
  packageDetailModal: "package-detail-modal",
  specialPackagesModal: "special-packages-modal",
  gateClosedModal: "gate-closed-modal",
  partnerModal: "partner-modal",
  savedPaymentMethodsModal: "saved-payment-methods-modal",
  stripePaymentModal: "stripe-payment-modal",
  userSetupModal: "user-setup-modal",
  existingAccountModal: "existing-account-modal",
  promoWelcomeModal: "promo-welcome-modal",
  confirmationModal: "confirmation-modal",
  confirmationModalConfirm: "confirmation-modal-confirm",
  confirmationModalCancel: "confirmation-modal-cancel",

  // Subscription Management Modal
  subscriptionUpgradeButton: "subscription-upgrade-button",
  subscriptionDowngradeButton: "subscription-downgrade-button",
  subscriptionCancelButton: "subscription-cancel-button",
  subscriptionResumeButton: "subscription-resume-button",

  // Toasts (src/components/UpgradeSuccessToast.tsx + ui/Toast.tsx)
  toastSuccess: "toast-success",
  toastError: "toast-error",
  upgradeSuccessToast: "upgrade-success-toast",
  downgradeScheduledToast: "downgrade-scheduled-toast",
  entryRewardToast: "entry-reward-toast",

  // Banners (src/components/banners/*)
  freezePeriodBanner: "freeze-period-banner",
  floatingCountdownBanner: "floating-countdown-banner",
  floatingPromoBanner: "floating-promo-banner",
  promoBanner: "promo-banner",
  promoBannerDismiss: "promo-banner-dismiss",

  // Rewards
  rewardsFloatingWidget: "rewards-floating-widget",
  rewardsClaimButton: "rewards-claim-button",
  rewardsTabClaimable: "rewards-tab-claimable",
  rewardsTabPast: "rewards-tab-past",
  rewardsRedeemableNowToggle: "rewards-redeemable-now-toggle",

  // Major draw (src/app/(site)/major-draw/* and components/sections/*)
  majorDrawPage: "major-draw-page",
  majorDrawCountdown: "major-draw-countdown",
  majorDrawEntryCta: "major-draw-entry-cta",
  majorDrawEntriesCount: "major-draw-entries-count",

  // Mini draw
  miniDrawListItem: "mini-draw-list-item",
  miniDrawPurchaseButton: "mini-draw-purchase-button",
  miniDrawStockBadge: "mini-draw-stock-badge",
  miniDrawSoldOut: "mini-draw-sold-out",

  // Shop
  shopProductCard: "shop-product-card",
  shopAddToCart: "shop-add-to-cart",
  shopFilterBrand: "shop-filter-brand",
  cartIconBadge: "cart-icon-badge",
  cartLineItem: "cart-line-item",
  cartLineRemove: "cart-line-remove",
  cartLineQtyPlus: "cart-line-qty-plus",
  cartLineQtyMinus: "cart-line-qty-minus",
  cartCheckoutButton: "cart-checkout-button",
  checkoutShippingForm: "checkout-shipping-form",
  checkoutSubmit: "checkout-submit",
  checkoutMemberDiscountLine: "checkout-member-discount-line",

  // My Account sub-routes
  accountSettingsTabs: "account-settings-tabs",
  accountSettingsTabProfile: "account-settings-tab-profile",
  accountSettingsTabSubscription: "account-settings-tab-subscription",
  accountSettingsTabPassword: "account-settings-tab-password",
  accountSettingsTabPayment: "account-settings-tab-payment",
  accountProfileFirstName: "account-profile-first-name",
  accountProfileLastName: "account-profile-last-name",
  accountProfileSave: "account-profile-save",
  accountChangePasswordCurrent: "account-change-password-current",
  accountChangePasswordNew: "account-change-password-new",
  accountChangePasswordConfirm: "account-change-password-confirm",
  accountChangePasswordSave: "account-change-password-save",
  accountUpdateEmail: "account-update-email",
  accountUpdatePhone: "account-update-phone",
  accountAddPaymentMethodButton: "account-add-payment-method-button",
  accountSavedCardItem: "account-saved-card-item",
  accountSavedCardDelete: "account-saved-card-delete",
  accountSavedCardSetDefault: "account-saved-card-set-default",
  accountResolvePaymentCta: "account-resolve-payment-cta",

  // Affiliate
  affiliateLoginEmail: "affiliate-login-email",
  affiliateLoginPassword: "affiliate-login-password",
  affiliateLoginSubmit: "affiliate-login-submit",
  affiliateDashboardCode: "affiliate-dashboard-code",
  affiliateDashboardLink: "affiliate-dashboard-link",
  affiliateDashboardCopyCode: "affiliate-dashboard-copy-code",
  affiliateDashboardCopyLink: "affiliate-dashboard-copy-link",
  affiliateDashboardSignups: "affiliate-dashboard-signups",
  affiliateDashboardCommissions: "affiliate-dashboard-commissions",

  // Partner
  partnerApplicationForm: "partner-application-form",
  partnerApplicationSubmit: "partner-application-submit",
  partnerDiscountQueueItem: "partner-discount-queue-item",

  // Newsletter / Contact
  newsletterEmail: "newsletter-email",
  newsletterSubscribe: "newsletter-subscribe",
  contactName: "contact-name",
  contactEmail: "contact-email",
  contactSubject: "contact-subject",
  contactMessage: "contact-message",
  contactSubmit: "contact-submit",

  // Theme / consent
  themeToggleButton: "theme-toggle-button",
} as const;

export type TestId = (typeof testid)[keyof typeof testid];

/**
 * Helper for use with Playwright Locators:
 *   page.locator(byTestId(testid.loginSubmit))
 */
export function byTestId(id: TestId): string {
  return `[data-testid="${id}"]`;
}
```

- [ ] **Step 2: Stage**

```bash
git add e2e/utils/selectors.ts
```

---

### Task 15: Create `e2e/utils/intercept.ts`

**Files:**
- Create: `e2e/utils/intercept.ts`

- [ ] **Step 1: Implement**

```ts
// e2e/utils/intercept.ts
//
// Helpers to wait for and assert against backend API calls without
// duplicating page.waitForResponse() boilerplate in every spec.

import { Page, Response, expect } from "@playwright/test";

/**
 * Wait for the next request to a URL matching a substring AND return
 * its parsed JSON body. Throws if the response is not 2xx unless allowError.
 */
export async function waitForApi<T = unknown>(
  page: Page,
  urlSubstring: string,
  options: { method?: string; allowError?: boolean; timeoutMs?: number } = {},
): Promise<{ status: number; body: T; response: Response }> {
  const response = await page.waitForResponse(
    (r) => r.url().includes(urlSubstring) && (!options.method || r.request().method() === options.method),
    { timeout: options.timeoutMs ?? 15_000 },
  );
  const status = response.status();
  if (!options.allowError) expect(status, `${response.url()} returned ${status}`).toBeLessThan(400);
  let body: T = undefined as unknown as T;
  try {
    body = (await response.json()) as T;
  } catch {
    // Non-JSON response — body stays undefined
  }
  return { status, body, response };
}

/**
 * Assert a JSON response shape contains specific keys with expected values.
 * Use for shallow equality on sub-objects.
 */
export function assertJsonShape(actual: unknown, expected: Record<string, unknown>): void {
  expect(actual).toMatchObject(expected);
}
```

- [ ] **Step 2: Stage**

```bash
git add e2e/utils/intercept.ts
```

---

### Task 16: Smoke-test the foundation — run existing shop suite

**Files:** none modified

- [ ] **Step 1: Verify env file is set up**

Confirm `.env.local` contains all REQUIRED_VARS from `e2e/global-setup.ts`. If missing, populate from your existing test Stripe + Mongo setup.

- [ ] **Step 2: Start dev server in one terminal**

```
npm run dev
```

Wait for "Ready in X.Xs" message. The webServer will reuse this.

- [ ] **Step 3: Run only the existing shop guest specs**

```
npx playwright test e2e/shop/guest-checkout.spec.ts --project=chromium-guest
```

Expected: passes (existing spec still works under the new infra).

- [ ] **Step 4: Run the full shop suite under new infra**

```
npm run test:e2e:shop
```

Expected: all 7 existing shop specs pass. Member specs (member-checkout, my-account-orders) will run under `chromium-fresh` — verify they still pass. If they relied on a member sub, switch the testMatch in playwright.config.ts to put them under `chromium-bronze` instead. Investigate the spec contents to know which is correct. **Pause here and report back to the user before proceeding to Phase 3** — Phase 1+2 should be a clean checkpoint.

- [ ] **Step 5: Stage all Phase 1+2 changes ready for commit when authorized**

```bash
git status
git diff --stat
```

Wait for explicit user authorization to commit.

---

## Phase 3 — Specs by domain

Phase 3 follows a uniform pattern. Each spec is one task with the same shape. Below is the **template** showing the exact pattern; subsequent task batches list the contracts (assertions + testids) that fill the template.

### Phase 3 Template Task: `e2e/auth/login.spec.ts` (fully worked example)

**Files:**
- Create: `e2e/auth/login.spec.ts`
- Modify: `src/app/login/page.tsx` (add testids)
- Modify: `docs/auth/frontend.md` (note testids added)

**Fixture:** `chromium-guest` (no auth)
**URL:** `/login`
**Preconditions:** `e2e-fresh` user exists in DB (seed has run).

- [ ] **Step 1: Add `data-testid` to login form**

In `src/app/login/page.tsx`, locate the email input and add `data-testid={testid.loginEmail}` (importing `testid` from `@/e2e/utils/selectors` is not available client-side; use the literal string `"login-email"` and document the source of truth at the top of the file).

```tsx
{/* Email input */}
<input
  type="email"
  name="email"
  data-testid="login-email"
  // …existing props
/>

{/* Password input */}
<input
  type="password"
  name="password"
  data-testid="login-password"
  // …existing props
/>

{/* Submit button */}
<button
  type="submit"
  data-testid="login-submit"
  // …existing props
>
  Sign In
</button>

{/* Forgot password link */}
<Link href="/reset-password" data-testid="forgot-password-link">
  Forgot password?
</Link>
```

- [ ] **Step 2: Write the spec**

Create `e2e/auth/login.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { byTestId, testid } from "../utils/selectors";
import { emailFor, E2E_USER_PASSWORD } from "../fixtures/test-users";

test.describe("login", () => {
  test("logs in via email/password and lands on /my-account", async ({ page }) => {
    await page.goto("/login");
    await page.locator(byTestId(testid.loginEmail)).fill(emailFor("fresh"));
    await page.locator(byTestId(testid.loginPassword)).fill(E2E_USER_PASSWORD);
    await page.locator(byTestId(testid.loginSubmit)).click();
    await page.waitForURL("/my-account");
    await expect(page.locator(byTestId(testid.dashboardRoot))).toBeVisible();
  });

  test("rejects wrong password with visible error", async ({ page }) => {
    await page.goto("/login");
    await page.locator(byTestId(testid.loginEmail)).fill(emailFor("fresh"));
    await page.locator(byTestId(testid.loginPassword)).fill("WRONG_PASSWORD");
    await page.locator(byTestId(testid.loginSubmit)).click();
    await expect(page.getByText(/invalid|incorrect|wrong/i)).toBeVisible();
    expect(page.url()).toContain("/login");
  });

  test("redirects to /my-account if already authenticated", async ({ page, context }) => {
    // Bypass: load fresh storageState via a prior test, or this test runs under chromium-fresh.
    // For this guest project, this case is covered by member projects' tests.
    test.skip(true, "covered under chromium-fresh by membership/dashboard.spec.ts");
  });
});
```

- [ ] **Step 3: Run the spec**

```
npx playwright test e2e/auth/login.spec.ts --project=chromium-guest
```

Expected: 2 tests pass, 1 skipped.

- [ ] **Step 4: Update domain doc**

In `docs/auth/frontend.md`, append:

```md
## E2E test IDs

The login page renders with the following data-testid attributes used by Playwright:
- `login-email`, `login-password`, `login-submit`, `forgot-password-link`

Source of truth: `e2e/utils/selectors.ts`.
```

- [ ] **Step 5: Stage**

```bash
git add e2e/auth/login.spec.ts src/app/login/page.tsx docs/auth/frontend.md
```

---

### Phase 3 — Spec contracts

For each spec below, follow the template task pattern: add data-testids → write spec → run it → update domain doc → stage. Each contract lists the **fixture role**, **URL**, **assertions**, and **required data-testids** (which must already be in `e2e/utils/selectors.ts` or be added there).

> **Pre-Phase-3 amendments (added 2026-05-05 after deep validation pass):**
>
> **De-scoped specs (the underlying feature does not exist in the codebase):**
> - `e2e/affiliate/signup.spec.ts` — there is no public affiliate signup form; affiliates are admin-created. Skip; replace with `affiliate-admin-create.spec.ts` only if needed.
> - `e2e/auth/otp-login.spec.ts` — `/login` has no OTP tab UI; only API endpoints exist (`/api/auth/send-otp`, `/api/auth/verify-otp`). De-scope the UI spec; if OTP coverage is needed, add a tsx unit test against the API endpoints instead.
> - `e2e/contact/newsletter-unsubscribe.spec.ts` — no unsubscribe route exists in the codebase. De-scope.
>
> **Narrowed specs:**
> - `e2e/auth/oauth-redirect.spec.ts` — Google OAuth needs a real round-trip; cap scope to "form is constructed and submitted" (intercept the POST to `/api/auth/signin/google`); do NOT follow the redirect.
> - `e2e/promo/bonus-code.spec.ts` — `/api/codes/validate` validates only, doesn't redeem. Rewrite as: spec posts a code to `/api/codes/validate`, asserts the response shape (`type: "campaign"|"promo"|"referral"`); the actual entry credit happens at purchase, which is a separate spec.
> - `e2e/auth/email-verification.spec.ts` — assert via `/api/auth/me` only; the verification email pipeline is covered by tsx tests.
>
> **Tier names:** all references in this contracts table to `bronze`/`silver`/`gold` should be read as `tradie`/`foreman`/`boss` respectively. Same for testids: `package-card-tradie/foreman/boss`. Phase 1+2 selectors registry already uses the correct names.
>
> **Modal specs:** to assert "modal X is open," query `byTestId(testid.<modalKey>)`. Each modal's call site of `<ModalContainer>` must be updated to pass `testId={testid.<modalKey>}` (the prop was added in the foundation fix). Do NOT query the generic `modal-container` testid — it would match the topmost modal regardless of which one is open.
>
> **Storage state per worker:** the auth setup now generates `<role>-w<N>.json` per (role, worker) pair. Specs must import `test, expect` from `../fixtures/test` (the custom fixture in `e2e/fixtures/test.ts`), NOT from `@playwright/test` directly, so the right per-worker storage is loaded.
>
> **Tier-2 amendments (added 2026-05-06 after the deep audit):**
>
> **De-scoped major-draw entry specs (full Stripe walks, brittle as E2E):**
> - `e2e/draws/major/entry-member.spec.ts` — needs full PaymentElement walk for an authenticated member to land entries. The element-fill helper only handles basic Card; the post-PaymentIntent webhook timing is non-deterministic; the entry count is verified via tsx tests (`test:anchor-billing`, `test:redeemables`).
> - `e2e/draws/major/entry-promo.spec.ts` — same root cause + requires a seeded active `Promo` document. Promo multiplier math is verified via `test:klaviyo-renewal-preview` and `test:upsell-images`.
> - `e2e/draws/major/entry-declined.spec.ts` — `STRIPE_TEST_CARDS.DECLINED` triggers a Stripe-side error that surfaces in the PaymentElement iframe; the helper has no decline-handling branch. Failure-path coverage exists in `test:stripe-collection-pause`.
> - `e2e/draws/major/entry-3ds.spec.ts` — 3DS challenge frame is hand-rolled in `e2e/shop/three-ds.spec.ts`; the same approach for major-draw entry needs the same iframe handling AND post-confirmation polling. Cost-benefit poor when no `test.skip` exists for the basic flow.
> - `e2e/draws/major/cooldown.spec.ts` — depends on completing two real purchases back-to-back, then asserting the cooldown banner. Same Stripe-walk dependency.
>
> **Replacement coverage:** `src/lib/purchaseCooldown.ts` and the entry-counting logic in `src/utils/draws/**` are unit-tested via existing tsx tests. The E2E layer covers the gate (`e2e/draws/major/{view,entry-guest,past-draws,winners,countdown-banner,gate-closed}.spec.ts`) and the membership purchase walk is narrowed at the `MembershipModal` level (`e2e/membership/join.spec.ts`) — these specs prove the user CAN reach the entry CTA; the actual entry math is unit-test territory.
>
> **Re-scoping criteria:** revisit these 5 if (a) we ship a Stripe Element abstraction that handles 3DS / decline branches, OR (b) we move E2E to a production build with deterministic webhook delivery (e.g., Stripe CLI listen).

#### Auth domain — `e2e/auth/`

| Spec | Fixture | URL | Assertions | TestIds (component edits) |
|---|---|---|---|---|
| `login.spec.ts` | (template above) | | | |
| `register.spec.ts` | guest | `/login` → register link | Form submission creates user; redirects to `/my-account`; `UserSetupModal` opens | login form testids; `register-form-*` (firstName, lastName, email, password, dob, terms-checkbox, submit); `existing-account-modal` |
| `logout.spec.ts` | fresh | `/my-account/settings` | Click logout → redirects `/login`; storageState cleared in subsequent navigation | `header-logout-button` OR `account-settings-tab-profile` logout button (verify location) |
| `forgot-password.spec.ts` | guest | `/login` → `/reset-password` (no token) | Email submit returns 200; success message visible; rate-limit at 4th rapid submission | `forgot-password-link`, `reset-password-email`, `reset-password-submit`, success toast |
| `reset-password.spec.ts` | guest | `/reset-password?token=<seeded>` | Two-mode page: with token shows new-password form; expired token shows resend CTA | `reset-password-new`, `reset-password-confirm`, `reset-password-submit` |
| `otp-login.spec.ts` | guest | `/login` → OTP tab | Send code → enter code (intercept SendGrid call to capture) → redirect `/my-account` | `login-otp-tab`, `login-otp-email`, `login-otp-send`, `login-otp-code`, `login-otp-submit` |
| `email-verification.spec.ts` | fresh (unverified variant) | Email verify URL | Token verified → flag set in DB | none — assert via `/api/auth/me` |
| `user-setup-modal.spec.ts` | fresh (with `profileSetupCompleted=false`) | `/my-account` | Modal opens; submitting birthdate updates User; modal closes | `user-setup-modal`, `user-setup-dob`, `user-setup-submit` |
| `existing-account.spec.ts` | guest | `/login` → register with existing email | `existing-account-modal` opens; "Login" button redirects to login form | `existing-account-modal`, `existing-account-login-button` |

#### Account domain — `e2e/account/`

| Spec | Fixture | URL | Assertions | TestIds |
|---|---|---|---|---|
| `profile-update.spec.ts` | fresh | `/my-account/settings` (Profile tab) | Change firstName/lastName → save → DB updated; toast visible | `account-settings-tab-profile`, `account-profile-first-name`, `-last-name`, `-save`, `toast-success` |
| `change-password.spec.ts` | fresh | `/my-account/settings` (Password tab) | Old correct, new set; subsequent login works | `account-change-password-*`, `toast-success` |
| `update-email.spec.ts` | fresh | `/my-account/settings` | Submit new email → verification email sent (intercept); flag set | `account-update-email`, `account-update-email-submit` |
| `update-phone.spec.ts` | fresh | `/my-account/settings` | Submit AU-format phone → DB normalised to `+61…` | `account-update-phone`, `account-update-phone-submit` |
| `payment-methods.spec.ts` | fresh | `/my-account/settings` (Payment tab) | Add card via Stripe Element; delete; set default | `account-add-payment-method-button`, `account-saved-card-*`, `payment-element-frame` |
| `settings-tabs.spec.ts` | fresh | `/my-account/settings` | Click each tab → URL updates to `?tab=…`; deep link opens correct tab | `account-settings-tab-*` |

#### Navigation / static — `e2e/navigation/`

| Spec | Fixture | URL | Assertions | TestIds |
|---|---|---|---|---|
| `homepage.spec.ts` | guest | `/` | Hero, CTAs, sections render; primary CTA navigates to `/membership` | `hero-primary-cta`, `hero-secondary-cta` |
| `static-pages.spec.ts` | guest | `/faq`, `/terms`, `/privacy`, `/competition-term-majordraw` | Each returns 200 + h1 visible | none |
| `header-cart-icon.spec.ts` | guest | `/` | Cart icon present; click opens drawer | `header-cart-icon`, `header-cart-drawer` |
| `footer-links.spec.ts` | guest | `/` | Each footer link returns 200 | `footer-link-*` (auto-discovered via locator query) |

#### Membership domain — `e2e/membership/`

| Spec | Fixture | URL | Assertions | TestIds |
|---|---|---|---|---|
| `join.spec.ts` | fresh | `/my-account` → "Get More Entries" | Walk full purchase: package select → Stripe payment (`STRIPE_TEST_CARDS.SUCCESS`) → success → DB shows `subscription.isActive=true` | `membership-modal`, `package-card-*`, `payment-element-frame`, `checkout-submit`, `dashboard-root` |
| `upgrade.spec.ts` | bronze (resetUser beforeEach) | `/my-account/settings` (Subscription tab) | Click upgrade → select Silver → confirm → DB shows new packageId | `subscription-upgrade-button`, `package-card-silver`, `confirmation-modal-confirm` |
| `downgrade.spec.ts` | silver (resetUser beforeEach) | same | Downgrade → CancellationUpsellModal shows → decline → pendingChange field set | `subscription-downgrade-button`, `cancellation-upsell-modal`, `cancellation-upsell-decline` |
| `cancel.spec.ts` | bronze (resetUser beforeEach) | same | Click cancel → ConfirmationModal → CancellationUpsellModal → decline → DB autoRenew=false | `subscription-cancel-button`, `confirmation-modal`, `cancellation-upsell-decline` |
| `cancel-upsell-redeem.spec.ts` | bronze (resetUser beforeEach) | same | Trigger cancel → CancellationUpsellModal → accept → DB unchanged + 100 entries credited | `cancellation-upsell-accept`, `entry-reward-toast` |
| `resume.spec.ts` | cancelling (resetUser beforeEach) | same | Click resume → DB autoRenew=true, cancelledAt unset | `subscription-resume-button` |
| `renewal-failed.spec.ts` | pastdue | `/my-account` | RenewalFailedModal auto-opens; "Resolve payment" deep-links to `?tab=subscription` | `renewal-failed-modal`, `account-resolve-payment-cta` |
| `update-payment-method.spec.ts` | pastdue | `/my-account/settings?tab=subscription` | Update card via SavedPaymentMethods; subscription reactivates after webhook fires | `saved-payment-methods-modal`, `stripe-payment-modal` |
| `benefits.spec.ts` | bronze | `/my-account/benefits` | Page renders with package details, partner days, redeemable eligibility | `benefits-page-root` |
| `package-detail.spec.ts` | bronze | `/my-account` → click MembershipBadge | `PackageDetailModal` opens with current plan info | `header-membership-badge`, `package-detail-modal` |
| `special-packages.spec.ts` | fresh | trigger via custom event | `SpecialPackagesModal` opens; if draw closed → substitutes to `gate-closed-modal` | `special-packages-modal`, `gate-closed-modal` |
| `explainer-modal.spec.ts` | bronze (clear localStorage in beforeEach) | `/my-account` | After 2.5s `SubscriptionExplainerModal` appears once; localStorage flag set | `subscription-explainer-modal` |

#### Draws — `e2e/draws/major/` and `e2e/draws/mini/`

**Major:**
| Spec | Fixture | URL | Assertions | TestIds |
|---|---|---|---|---|
| `view.spec.ts` | guest | `/major-draw` | Page renders; countdown visible if active; prizes grid present | `major-draw-page`, `major-draw-countdown` |
| `entry-guest.spec.ts` | guest | `/major-draw` → "Get Entries" | Forced to `/login`; after auth redirects back; package modal opens | `major-draw-entry-cta`, `login-prompt-modal` |
| `entry-member.spec.ts` | fresh | `/major-draw` | Click CTA → MembershipModal → purchase → entries reflected on `/my-account` | as join.spec.ts |
| `entry-promo.spec.ts` | fresh | `/promotion/[slug]` then `/major-draw` | Promo multiplier displayed; entries calculated × multiplier | `major-draw-entries-count` |
| `entry-declined.spec.ts` | fresh | `/major-draw` → entry → use STRIPE_TEST_CARDS.DECLINED | Error toast; no entry recorded in DB | `toast-error` |
| `entry-3ds.spec.ts` | fresh | same → STRIPE_TEST_CARDS.REQUIRES_3DS | 3DS challenge iframe handled (auto-confirm in test mode); success | `payment-element-frame` |
| `cooldown.spec.ts` | fresh | rapid double entry | Second blocked with cooldown message | `purchase-cooldown-banner` |
| `gate-closed.spec.ts` | guest | force gate-closed via DB or env | `GateClosedModal` shown with countdown to next activation | `gate-closed-modal` |
| `past-draws.spec.ts` | fresh | `/my-account` → "View Past Draws" | `PastDrawsModal` opens; clicking a row shows that draw's detail | `past-draws-modal`, `past-draw-card` |
| `winners.spec.ts` | guest | `/winners` | Winners list renders; clicking opens detail | `winners-list-item` |
| `countdown-banner.spec.ts` | guest | `/` | `FloatingCountdownBanner` renders with countdown | `floating-countdown-banner` |

**Mini:**
| Spec | Fixture | URL | Assertions | TestIds |
|---|---|---|---|---|
| `list.spec.ts` | guest | `/mini-draws` | Mini draw cards render with stock indicators | `mini-draw-list-item`, `mini-draw-stock-badge` |
| `purchase.spec.ts` | fresh | `/mini-draws/[id]` | MiniDrawPackageModal → purchase → success page | `mini-draw-purchase-button` |
| `success.spec.ts` | fresh | `/mini-draw-success` after purchase | Confirmation visible; entries credited | `mini-draw-success-root` |
| `stock.spec.ts` | guest | `/mini-draws/[id]` with stock=0 | "Sold Out" badge shown; CTA disabled | `mini-draw-sold-out` |
| `promo-applied.spec.ts` | fresh | `/promotion/[slug]` → `/mini-draws/[id]` | Promo multiplier applied at purchase | none |

#### Shop — `e2e/shop/` (4 new specs alongside existing 7)

| Spec | Fixture | URL | Assertions |
|---|---|---|---|
| `browse-filter.spec.ts` | guest | `/shop` | Product grid renders; brand filter narrows list; search filters by name |
| `brand-page.spec.ts` | guest | `/shop/brand/[brand]` | Only matching products shown; breadcrumb correct |
| `member-discount.spec.ts` | bronze | `/shop/[slug]` then `/checkout` | Discount % shown inline; checkout total reflects member discount |
| `order-detail.spec.ts` | fresh (with seeded order) | `/my-account/orders/[orderNumber]` | All 4 status states render correctly across separate test cases (parametrise via DB seed); tracking link visible when number present |

(Existing 7 specs require no changes; verify they still pass after the project rename.)

#### Upsells — `e2e/upsells/`

| Spec | Fixture | URL | Assertions |
|---|---|---|---|
| `post-membership.spec.ts` | fresh | full join walk | After purchase, `UpsellModal` appears; sessionStorage `pendingUpsell` set |
| `redeem.spec.ts` | fresh (after a join) | UpsellModal | Click redeem → second payment → entries credited |
| `decline.spec.ts` | fresh | UpsellModal | Decline → modal closes → no charge |
| `success-page.spec.ts` | fresh | `/upsell-success` | Confirmation visible |
| `attribution.spec.ts` | fresh | upsell purchase | Resulting `PaymentEvent` has correct `original_payment_intent_id` (DB assert via `/api/test-db`) |

#### Rewards — `e2e/rewards/`

| Spec | Fixture | URL | Assertions |
|---|---|---|---|
| `widget-visibility.spec.ts` | fresh | `/my-account` | RewardsFloatingWidget renders; spotlight first-view (clear localStorage) |
| `catalog.spec.ts` | fresh | RewardsFloatingWidget → expand | Prize catalog list visible; pagination works |
| `claim-redeemable.spec.ts` | fresh (with seeded RedeemableIssuance) | RewardsFloatingWidget | Click claim → status updated to `claimed`; entry-reward toast |
| `redeem-code.spec.ts` | fresh | code-redeem CTA | Enter code (seed a valid bonus-entry code) → success → entries credited |
| `milestone-toast.spec.ts` | fresh | trigger entry increment via webhook helper | Toast `entry-reward-toast` shows N entries |

#### Promo — `e2e/promo/`

| Spec | Fixture | URL | Assertions |
|---|---|---|---|
| `banner.spec.ts` | guest | `/` | `promo-banner` shows when active; dismiss persists |
| `welcome-modal.spec.ts` | guest | `/promotion/[slug]` first visit | `PromoWelcomeModal` shown; localStorage gates re-show |
| `page-detail.spec.ts` | guest | `/promotions/[slug]` | Detail renders; expired promo shows disabled CTA |
| `link-tracking.spec.ts` | guest | `/promotions/[slug]?utm_source=test` | UTM persisted in cookie/sessionStorage; resolved at checkout |
| `multiplier.spec.ts` | fresh | major-draw entry during active promo | Multiplier reflected in entries displayed |
| `bonus-code.spec.ts` | fresh | redeem flow | Bonus entry code → entries credited at promo's bonus rate |

#### Referrals — `e2e/referrals/`

| Spec | Fixture | URL | Assertions |
|---|---|---|---|
| `refer-modal.spec.ts` | fresh | `/my-account` → "Refer a Friend" | Modal renders with code; copy buttons work |
| `copy-code-link.spec.ts` | fresh | same | Clipboard verification (Playwright `evaluate(() => navigator.clipboard.readText())`) |
| `signup-with-ref.spec.ts` | guest | `/membership?ref=<seeded code>` | Code stored in session; on register both users credited |
| `refer-reward-modal.spec.ts` | fresh | `/my-account` with sessionStorage `showReferFriendAfterSetup=true` | Modal appears 10s after dashboard mount |

#### Affiliate — `e2e/affiliate/`

All under `chromium-affiliate` project.

| Spec | URL | Assertions |
|---|---|---|
| `signup.spec.ts` | `/affiliate` (guest variant — needs separate setup) | Form submit → affiliate created; redirect dashboard |
| `login.spec.ts` | `/affiliate/login` | Form submit → token cookie set; redirect `/affiliate` |
| `dashboard.spec.ts` | `/affiliate` | Code, link, stats render |
| `link-generation.spec.ts` | `/affiliate` | Copy code/link works |
| `commission-track.spec.ts` | `/affiliate` after a referred purchase | Commissions list shows new row |

#### Partner — `e2e/partner/`

| Spec | Fixture | URL | Assertions |
|---|---|---|---|
| `discounts-view.spec.ts` | bronze | `/my-account` PartnerDiscountsSection or `/partner` | Discount cards render |
| `application-form.spec.ts` | guest | `/partner` → "Become a Partner" | Form submit creates `PartnerApplication` row |
| `discount-applied.spec.ts` | bronze (with active partner queue) | `/checkout` | Discount % auto-applied |
| `eligibility.spec.ts` | fresh (non-member) | `/my-account` | "Unlock partner discounts" CTA shown for non-member |

#### Contact — `e2e/contact/`

| Spec | Fixture | URL | Assertions |
|---|---|---|---|
| `contact-form.spec.ts` | guest | `/contact` | Form submit returns 200; `ContactSubmission` row created |
| `newsletter-subscribe.spec.ts` | guest | footer | Submit email → 200; email visible in subsequent re-render flag |
| `newsletter-unsubscribe.spec.ts` | guest | unsubscribe link with token | Page renders; token marks email unsubscribed |

#### Consent / theme — `e2e/consent/`

| Spec | Fixture | URL | Assertions |
|---|---|---|---|
| `pixel-consent.spec.ts` | guest (clear cookies) | `/` | `pixel-consent-modal` opens; accept persists; decline persists |
| `theme-toggle.spec.ts` | guest | `/` | Click toggle → `<html class="dark">` toggles; persists across navigation |

#### URL params — `e2e/url-params/`

| Spec | Fixture | URL | Assertions |
|---|---|---|---|
| `affiliate-code-capture.spec.ts` | guest | any page with `?aff=XXX` | sessionStorage `affiliate_code` set; outbound CTAs re-append it |
| `referral-code-capture.spec.ts` | guest | `?ref=XXX` | Code persisted; checkout payload includes it |
| `promo-welcome-popup.spec.ts` | guest | `/promotions/[slug]?promo=test` | `PromoWelcomeModal` triggers once |
| `oauth-redirect.spec.ts` | guest | `/oauth-redirect?provider=…` | Auto-submits to NextAuth; redirects |
| `3ds-return-handling.spec.ts` | fresh | `/purchase-success?payment_intent_client_secret=…` | All 4 status branches (`succeeded`, `processing`, `requires_action`, `failed`) render correctly across 3 success pages |

#### Modal queue — `e2e/modal-queue/`

| Spec | Fixture | URL | Assertions |
|---|---|---|---|
| `priority-preemption.spec.ts` | fresh | `/my-account` | Trigger low-priority modal then high; high opens, low queues; closing high re-opens low |
| `pending-upsell-restore.spec.ts` | fresh | `/my-account` → set sessionStorage pendingUpsell → navigate away → back | Modal re-opens after navigation |
| `post-setup-deferred.spec.ts` | fresh | `/my-account` after setup | `ReferFriendModal` opens 10s later when `showReferFriendAfterSetup=true` |
| `special-packages-substitution.spec.ts` | fresh | force gate-closed | `requestModal("special-packages")` opens `gate-closed-modal` instead |
| `renewal-failed-auto-open.spec.ts` | pastdue | `/my-account` | `RenewalFailedModal` opens automatically |

#### Global UI — `e2e/global-ui/`

| Spec | Fixture | URL | Assertions |
|---|---|---|---|
| `top-bar-dismiss.spec.ts` | fresh | `/` | Click X → bar hidden; localStorage `topBarHidden=true`; on signout cleared |
| `cart-drawer.spec.ts` | guest | `/shop/[slug]` add to cart | Drawer opens via cart icon click; +/-/remove works; checkout button navigates |
| `search-overlay.spec.ts` | guest mobile viewport | `/` | Tap search → overlay opens; popular search chip auto-submits |
| `membership-badge.spec.ts` | bronze | `/` | Badge click opens `PackageDetailModal` |
| `affiliate-mode-header.spec.ts` | affiliate | `/affiliate` | Header shows affiliate-only menu (no shop link) |

#### Banners / widgets — `e2e/banners-widgets/`

| Spec | Fixture | URL | Assertions |
|---|---|---|---|
| `freeze-period-banner.spec.ts` | guest | with frozen draw fixture | `FreezePeroidBanner` renders; non-dismissible |
| `floating-countdown-mode.spec.ts` | guest | `/` toggling draw status | Target switches between `drawDate` and `activationDate` |
| `rewards-widget-spotlight.spec.ts` | fresh | `/my-account` first visit | Spotlight highlight visible; localStorage gate works |
| `floating-promo-page-aware.spec.ts` | guest | toggle pages | Banner hidden on shop/admin/affiliate/login/terms/privacy |

#### Toasts — `e2e/toasts/`

| Spec | Fixture | URL | Assertions |
|---|---|---|---|
| `upgrade-success.spec.ts` | bronze | post-upgrade simulation (set localStorage `subscription_upgraded`) | `upgrade-success-toast` shown 25s; "View Benefits" hard-navs |
| `downgrade-scheduled.spec.ts` | silver | post-downgrade simulation | `downgrade-scheduled-toast` shown with effective date |
| `entry-reward.spec.ts` | fresh | trigger via webhook helper | `entry-reward-toast` shows "+N entries · +N points" |

---

## Phase 4 — Documentation (Tasks D1-D6)

### Task D1: Create `docs/dev-tooling/e2e-testing.md`

**Files:**
- Create: `docs/dev-tooling/e2e-testing.md`

- [ ] **Step 1: Write the doc**

```markdown
# E2E testing with Playwright

This project uses [Playwright](https://playwright.dev) for end-to-end browser tests. Specs live under `e2e/` and run against a local dev server backed by the same MongoDB and Stripe test-mode environment as `npm run dev`.

## Quick start

```bash
npm run dev                  # in one terminal
npm run test:e2e             # in another
```

The first run takes ~10-15s longer because `globalSetup` seeds 7 fixture users (×4 workers).

## Running specs

| Command | What it does |
|---|---|
| `npm run test:e2e` | All specs |
| `npm run test:e2e:ui` | Browser-based UI runner on `0.0.0.0:8080` (remoteable via SSH tunnel / Tailscale / ngrok) |
| `npm run test:e2e:headed` | Headed mode (see browser as it runs) |
| `npm run test:e2e:debug` | Step debugger |
| `npm run test:e2e:report` | View the HTML report from the last run |
| `npm run test:e2e:codegen` | Record interactions to generate spec scaffolding |
| `npm run test:e2e:<domain>` | Run only that domain (e.g., `:auth`, `:shop`, `:membership`) |

## Remote click-to-play

`npm run test:e2e:ui --ui-host=0.0.0.0` binds to all network interfaces. Access from another machine:

- **Tailscale:** open `http://<machine-tailnet-name>:8080`
- **SSH tunnel:** `ssh -L 8080:localhost:8080 your-dev-box`
- **VS Code Remote-SSH:** the Playwright extension shows the test tree in the sidebar with run buttons.

## Seeding and cleanup

- `npm run seed:e2e` — seeds the fixture roster idempotently (purges first, then re-creates).
- `npm run seed:e2e:clear` — purges only.
- `npm run cleanup:e2e` — same as `seed:e2e:clear` plus Stripe customer deletion.

`globalSetup` runs `seed:e2e` automatically; `globalTeardown` runs `cleanup:e2e`. Set `E2E_KEEP_FIXTURES=true` to preserve fixtures between runs (useful when iterating on a single spec).

## Required environment variables

See `.env.local.example`. Missing vars cause `globalSetup` to fail loud with a list. In CI on a fork PR (no Stripe price IDs), the suite skips entirely.

## What's NOT covered by E2E (and why)

See `docs/superpowers/specs/2026-05-04-e2e-test-suite-design.md` § "Out of scope".
```

- [ ] **Step 2: Stage**

```bash
git add docs/dev-tooling/e2e-testing.md
```

---

### Task D2: Create `docs/dev-tooling/e2e-fixtures.md`

**Files:**
- Create: `docs/dev-tooling/e2e-fixtures.md`

- [ ] **Step 1: Write**

```markdown
# E2E fixture roster

Defined in `e2e/fixtures/test-users.ts`. The seed creates one copy of each role per Playwright worker.

| Role key | Email pattern | State |
|---|---|---|
| `guest` | (none) | unauthenticated |
| `fresh` | `test-e2e-fresh-w<N>@example.com` | verified user, no subscription |
| `bronze` | `test-e2e-bronze-w<N>@example.com` | active Bronze + Stripe customer/sub |
| `silver` | `test-e2e-silver-w<N>@example.com` | active Silver |
| `gold` | `test-e2e-gold-w<N>@example.com` | active Gold |
| `cancelling` | `test-e2e-cancelling-w<N>@example.com` | Bronze with `autoRenew=false`, `cancelledAt` set |
| `pastdue` | `test-e2e-pastdue-w<N>@example.com` | Bronze with `isActive=false`, `status=past_due`, `pastDueAt` set |
| `affiliate` | `test-e2e-affiliate-w<N>@example.com` | Affiliate model row, `isActive=true` |

## Worker scoping

Playwright sets `TEST_WORKER_INDEX` (0, 1, 2, …). Tests resolve their fixture user via `emailFor(role)` which appends `-w<N>` to the role prefix. The seed creates `PLAYWRIGHT_WORKERS` (default 4) copies of each role.

## Side-effects mirrored

For active member roles, the seed mirrors the production webhook side-effects:
- `getOrCreateReferralProfile(userId)` — mints `TA######` referral code.
- `handleSubscriptionQueueUpdate(user, "start", {...})` — seeds the partner discount queue entry.

The seed does NOT create:
- `PaymentEvent`, `MembershipStatusHistory`, `MajorDraw.entries[]` — observability only, no UI gating.
- Klaviyo profile sync — fire-and-forget.
- `AffiliateCommission` — only relevant for the dedicated affiliate funnel test.

## Resetting between tests

Specs that mutate a fixture call `await resetUser('bronze')` from `e2e/fixtures/seed-helpers.ts` in `beforeEach`. This applies the baseline subscription fields via a single Mongo update.

For ephemeral users (e.g., the "first-time membership purchase" walk test), use `withFreshMember()` which creates a unique user inside the test and provides a cleanup callback.

## Stripe-side

Each member role gets a real test-mode Stripe customer with `metadata.e2e=true`, plus an active subscription on the matching test price (`STRIPE_PRICE_BRONZE/SILVER/GOLD`). Cleanup lists `metadata.e2e=true` customers and calls `stripe.customers.del()` (cascading delete on Stripe's side).
```

- [ ] **Step 2: Stage**

```bash
git add docs/dev-tooling/e2e-fixtures.md
```

---

### Task D3: Create `docs/dev-tooling/e2e-writing-tests.md`

**Files:**
- Create: `docs/dev-tooling/e2e-writing-tests.md`

- [ ] **Step 1: Write**

```markdown
# Writing a new E2E test

## Conventions

- **One spec, one flow.** Variants of the same flow live in `test.describe` blocks within the same file.
- **Selectors come from `e2e/utils/selectors.ts`.** Never inline `data-testid` strings in specs. If you need a new testid: add it to the registry, add the attribute to the component, update `docs/<domain>/frontend.md`.
- **Use fixture roles, not register-then-purchase walks.** The walk pattern is reserved for one happy-path spec per major journey.
- **Reset mutated fixtures.** If your spec changes `subscription.*` or `cart`, call `resetUser(role)` in `beforeEach`.
- **Assert on UI before DB.** If a test asserts on database state, also include a UI assertion that proves the user could see the change. Pure DB assertions are unit-test territory.

## Spec template

```ts
import { test, expect } from "@playwright/test";
import { byTestId, testid } from "../utils/selectors";
import { resetUser } from "../fixtures/seed-helpers";

test.describe("upgrade flow", () => {
  test.beforeEach(async () => {
    await resetUser("bronze");
  });

  test("upgrades from Bronze to Silver", async ({ page }) => {
    await page.goto("/my-account/settings?tab=subscription");
    await page.locator(byTestId(testid.subscriptionUpgradeButton)).click();
    await page.locator(byTestId(testid.packageCardSilver)).click();
    await page.locator(byTestId(testid.confirmationModalConfirm)).click();
    await expect(page.locator(byTestId(testid.toastSuccess))).toBeVisible();
  });
});
```

## Webhook-driven assertions

For flows that depend on a backend webhook (e.g., upsell trigger after `payment_intent.succeeded`), use `e2e/fixtures/stripe-webhook-helper.ts`:

```ts
import { postWebhook } from "../fixtures/stripe-webhook-helper";

await postWebhook("payment_intent.succeeded", {
  id: `pi_e2e_${Date.now()}`,
  status: "succeeded",
  metadata: { userId: "...", packageType: "membership" },
});
```

This relies on the dev-only `test_bypass` signature. NEVER deploy a non-development build of the webhook route with that bypass active.

## When NOT to write E2E

Use a unit test (a `tsx` test under `src/**/__tests__/`) when:
- The behaviour is pure logic (date math, calculations).
- The flow is time-dependent (renewals, anchor billing).
- The behaviour is an internal service called from a webhook handler.

See `docs/superpowers/specs/2026-05-04-e2e-test-suite-design.md` § "Out of scope" for the full list.
```

- [ ] **Step 2: Stage**

```bash
git add docs/dev-tooling/e2e-writing-tests.md
```

---

### Task D4: Create `docs/dev-tooling/e2e-troubleshooting.md`

**Files:**
- Create: `docs/dev-tooling/e2e-troubleshooting.md`

- [ ] **Step 1: Write**

```markdown
# E2E troubleshooting

## "Missing required env vars for E2E"

`globalSetup` validates env at run start. Add the missing vars to `.env.local`. See `.env.local.example`.

## "ENOENT e2e/.auth/<role>.json"

The setup project didn't run. Either:
- Your spec's project doesn't have `dependencies: ["setup-shared"]` — fix `playwright.config.ts`.
- Setup itself failed — check the test output for `setup authenticate <role>` results.

## "Stripe customer count is high"

Cleanup is interrupted (Ctrl-C, CI timeout). Run `npm run cleanup:e2e` manually. Add a nightly cron in CI if accumulation is consistent.

## "Test fails because user doesn't exist"

If a test deletes a fixture user mid-run (rare bug), subsequent tests using that fixture's storageState will fail because NextAuth re-validates `dbUser.isActive` per request (auth.ts:204-212). Reset by re-running `npm run seed:e2e`.

## "Webhook bypass returns 400"

The bypass is gated by `NODE_ENV === "development"`. Playwright's webServer runs `npm run dev`, so this works locally. If you switched it to `npm start` (production build), webhook helpers will fail. Keep `webServer.command: "npm run dev"`.

## "Stripe webhook 'No such customer'"

The test was using a stale customer ID (e.g., from a previous seed run that has been cleaned). Re-run `npm run seed:e2e`.

## "Test passes locally but fails in UI mode"

UI mode runs specs serially by default. If your spec depends on parallel-isolation (worker-scoped fixtures), it may pick up a stale state. Add `test.beforeEach(() => resetUser('bronze'))` to your spec.

## "Apple Pay / Google Pay test failing"

These can't render in headless Chromium. Mark the spec `test.skip(true, "wallet button not testable headless")` and rely on the manual smoke checklist.

## "Login redirects loop"

Storage state file is stale (older than the seeded user's `_id`). Delete `e2e/.auth/*.json` and re-run; the setup projects will regenerate.
```

- [ ] **Step 2: Stage**

```bash
git add docs/dev-tooling/e2e-troubleshooting.md
```

---

### Task D5: Update `docs/dev-tooling/testing.md`

**Files:**
- Modify: `docs/dev-tooling/testing.md`

- [ ] **Step 1: Read current content and append E2E section**

After the existing tsx-test section, append:

```markdown
## End-to-end (Playwright)

Browser-driven tests live under `e2e/` and run against a local dev server.

- **Run all:** `npm run test:e2e`
- **Per-domain:** `npm run test:e2e:auth`, `:shop`, `:membership`, etc.
- **UI mode (click-to-play, remoteable):** `npm run test:e2e:ui` (binds `0.0.0.0:8080`)
- **HTML report:** `npm run test:e2e:report`

Reference docs:
- [E2E testing guide](./e2e-testing.md)
- [Fixture roster](./e2e-fixtures.md)
- [Writing E2E specs](./e2e-writing-tests.md)
- [Troubleshooting](./e2e-troubleshooting.md)
```

- [ ] **Step 2: Stage**

```bash
git add docs/dev-tooling/testing.md
```

---

### Task D6: Update `docs/dev-tooling/architecture.md`

**Files:**
- Modify: `docs/dev-tooling/architecture.md`

- [ ] **Step 1: Append E2E architecture section**

```markdown
## E2E test suite architecture

### Process model

```
Playwright runner
  ├── globalSetup        → seed fixture roster (Mongo + Stripe)
  ├── setup projects     → log in each role, save storageState
  ├── chromium-* projects → run specs filtered by testMatch glob
  ├── webServer          → `npm run dev` (reuseExistingServer)
  └── globalTeardown     → cascade-delete fixtures + Stripe customers
```

### Fixture lifecycle

1. `globalSetup` shells out to `npm run seed:e2e`. The seed:
   - Purges any prior `test-e2e-*` documents and Stripe customers tagged `metadata.e2e=true`.
   - For each Playwright worker (default 4), creates 7 fixture users + 1 affiliate.
   - For member roles, creates real Stripe test-mode customers + subscriptions.
2. Setup projects (`setup-shared`, `setup-affiliate`) log in each role via the actual `/login` (or `/affiliate/login`) form and save the resulting cookie to `e2e/.auth/<role>.json`.
3. Spec projects depend on the setup projects and load the matching storageState before each test.
4. `globalTeardown` shells out to `npm run cleanup:e2e` which cascade-deletes Mongo records and Stripe customers.

### Why direct field patches for cancelling / past-due

Both transitions only mutate `User.subscription.*` fields. The production webhook handler sets the exact same fields, so a direct patch is faithful and avoids the complexity of firing fake webhook events for fixture seeding. The webhook bypass remains available via `e2e/fixtures/stripe-webhook-helper.ts` for tests that need to drive the full event pipeline.

### Why JWT sessions over storageState

NextAuth uses JWT sessions (`session.strategy: "jwt"`). Storage state captures the `next-auth.session-token` cookie. Affiliate uses a separate `affiliate_token` cookie (jose JWT, not NextAuth). Both are persisted via Playwright's `page.context().storageState()` after a real login submission.
```

- [ ] **Step 2: Stage**

```bash
git add docs/dev-tooling/architecture.md
```

---

### Task D7: Update other-domain frontend docs touched by testid additions

**Files:**
- Modify: each `docs/<domain>/frontend.md` corresponding to a component touched in Phase 3.

- [ ] **Step 1: For each Phase 3 task that added a `data-testid` to a component, append an E2E section to the matching domain frontend doc**

Use the format from the login example (template task step 4). Map:

| Component path | Domain doc |
|---|---|
| `src/components/layout/Header.tsx`, `Footer.tsx` | `docs/shared-ui/patterns.md` |
| `src/app/login/page.tsx` | `docs/auth/frontend.md` |
| `src/app/reset-password/page.tsx` | `docs/auth/frontend.md` |
| `src/app/(site)/my-account/**/*.tsx` | `docs/dashboard-account/frontend.md` |
| `src/app/(site)/major-draw/page.tsx` | `docs/draws/frontend.md` |
| `src/app/(site)/mini-draws/**/*.tsx` | `docs/draws/frontend.md` |
| `src/app/(site)/shop/**/*.tsx` | `docs/cart-shop-products/frontend.md` |
| `src/app/(site)/affiliate/**/*.tsx` | `docs/affiliate/frontend.md` |
| `src/components/modals/Membership*.tsx`, `SubscriptionManagement*.tsx`, `Cancellation*.tsx`, `Upsell*.tsx`, `RenewalFailed*.tsx`, `SubscriptionExplainer*.tsx` | `docs/subscription/frontend.md` |
| `src/components/modals/PixelConsent*.tsx` | `docs/tracking/frontend.md` |
| `src/components/modals/ReferFriend*.tsx` | `docs/referrals/frontend.md` |
| `src/components/modals/Partner*.tsx` | `docs/partner/frontend.md` |
| `src/components/banners/Promo*.tsx`, `PromoWelcome*.tsx`, `PromoPageDetail*.tsx` | `docs/promo/frontend.md` |
| `src/components/banners/Floating*.tsx`, `FreezePeriod*.tsx` | `docs/draws/frontend.md` |
| `src/components/UpgradeSuccessToast.tsx`, `EntryReward*` | `docs/subscription/frontend.md` |
| `src/components/features/RewardsFloatingWidget.tsx` | `docs/rewards-redeemables/frontend.md` |
| `src/components/payment/*.tsx`, saved-payment-methods modals | `docs/payment/frontend.md` |

Each doc gets a section like:

```markdown
## E2E test IDs

This component renders `data-testid` attributes for Playwright specs. The full registry lives in [`e2e/utils/selectors.ts`](../../e2e/utils/selectors.ts). IDs in this component:
- `<id-1>` — <one-line description>
- `<id-2>` — …
```

The doc-sync hook will block the commit if any modified component has no matching domain doc update; this task ensures that's satisfied.

- [ ] **Step 2: Run doc-sync check**

Run: `node .claude/hooks/doc-sync.mjs --dry`
Expected: no `Stale docs` errors.

- [ ] **Step 3: Stage**

```bash
git add docs/
```

---

## Self-Review

### Spec coverage

| Spec section | Tasks |
|---|---|
| §0 Goal — runnable, debuggable, remoteable | Task 2 (npm scripts), Task 8 (config), Task D1 (UI mode docs) |
| §2 Fixture roster — 7 roles + affiliate | Task 4, 6 |
| §3 Seeding contract — minimum-viable active member | Task 5, 6 (mirrors investigation §11) |
| §4 Auth & storageState | Task 10, 11 |
| §5 File layout | All Phase 1+2 tasks |
| §6 Webhook test bypass | Task 13 |
| §7 Per-test reset and isolation | Task 12 (resetUser), Task 4 (worker-scoped emails) |
| §8 Cleanup contract | Task 7 |
| §9 Selectors / data-testid | Task 14 + per-spec component edits in Phase 3 |
| §10 npm scripts | Task 2 |
| §11 Environment contract | Task 3, Task 9 (validation) |
| §12 Remote click-to-play | Task D1 |
| §13 Documentation deliverables | Tasks D1-D7 |
| §14 Open questions / risks | Documented in spec; addressed in D4 troubleshooting |
| §15 Phasing | Plan structure mirrors phases |
| In-scope §178 flows | Phase 3 contracts |
| Confirmed gaps | Documented in spec; not in any task (correctly) |

No gaps detected.

### Type / API consistency

- `Role` type defined in `e2e/fixtures/test-users.ts` (Task 4) — used in Task 10, 12.
- `PACKAGE_ID_BY_ROLE` defined in Task 4 — used in Task 6, 12.
- `emailFor()` defined in Task 4 — used in Tasks 10, 11, and all Phase 3 specs.
- `byTestId()` and `testid` registry from Task 14 — used in template Task and all Phase 3 specs.
- `resetUser()` and `withFreshMember()` from Task 12 — used in Phase 3 mutating specs.
- `postWebhook()` from Task 13 — used in webhook-driven Phase 3 specs.
- Stripe helpers from Task 5 — used by seed (Task 6) and cleanup (Task 7).

All cross-task references resolve. No naming drift.

### Placeholder scan

- No "TBD" / "TODO" / "implement later" remaining.
- The spec contracts in Phase 3 are explicit (fixture, URL, assertions, testids). They function as tightly-scoped per-spec instructions for the implementing agent.
- `e2e-fixtures.md` references a `withFreshMember()` whose body is intentionally minimal in Task 12 — the deferred-to-spec pattern is documented inline; specs that need it create their own user via `User.create({...})`.

---

## Execution Handoff

**Plan complete and saved to [`docs/superpowers/plans/2026-05-04-e2e-test-suite.md`](../plans/2026-05-04-e2e-test-suite.md). Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for a plan this size — keeps the main session's context window clean while I orchestrate.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Slower context burn but you see every step.

**Which approach?**
