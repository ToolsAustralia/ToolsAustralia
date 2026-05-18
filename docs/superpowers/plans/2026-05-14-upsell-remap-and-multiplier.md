# Upsell Remap & Per-Category Multiplier — Implementation Plan

> **⚠️ POST-EXECUTION REVISION (2026-05-15).** The original plan specified a NO-STACKING formula `upsellEntries = categoryMultiplier × baseEntries`. After execution, the user requested stacking. The current canonical formula is `upsellEntries = activePromoMultiplier × upsellCategoryMultiplier × baseEntries` — see [the spec's D4 entry](../specs/2026-05-14-upsell-remap-and-multiplier-design.md#2-key-decisions) and [docs/upsell/architecture.md](../../upsell/architecture.md) for the live truth. Code blocks below reflect the original implementation; the calculator and tests have since been updated to stack.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "Plus" upsell SKUs with reusable base-pack references, make upsell entries admin-configurable per category, restructure Mini Pack 4–8 into mini-scoped Additional packs, and standardize "free entries" terminology and Stripe descriptions.

**Architecture:** Distinct upsell records reference a base pack for inclusion shape (Option B from spec). A new `UpsellMultiplierConfig` Mongo document holds three category multipliers (`membership`, `one-time`, `additional`) — mini upsells stay multiplier-less. The `upsell-entries-calculator` reads category multiplier × base entries; no promo stacking. Mini Pack 4–8 are marked inactive and replaced by five new `additional-*-pack-mini` records in [src/data/miniDrawPackages.ts](../../../src/data/miniDrawPackages.ts).

**Tech Stack:** Next.js 15 App Router, TypeScript, Mongoose, Zod, NextAuth, TanStack Query, Tailwind. Tests are tsx scripts under `src/**/__tests__/*.test.ts` wired to `npm run test:*`.

**Spec:** [docs/superpowers/specs/2026-05-14-upsell-remap-and-multiplier-design.md](../specs/2026-05-14-upsell-remap-and-multiplier-design.md)

**Commit policy:** CLAUDE.md forbids auto-commits unless the user has authorized commits this session. Each `Commit` step in this plan **asks for authorization first** if it has not been given.

**Branch:** `claude/remapping-packages-upsells`

---

## Phase 1 — Foundation: types & admin-config storage

User-visible win at end of phase: Admin API can read/write the three upsell-category multipliers (no UI yet — Phase 4 builds it).

### Task 1.1: Extend `PromoMultiplier` type to include up-to-100 values

**Files:**
- Modify: [src/types/promo-multiplier.ts](../../../src/types/promo-multiplier.ts)

- [ ] **Step 1: Replace the multiplier list**

Open [src/types/promo-multiplier.ts](../../../src/types/promo-multiplier.ts) and replace the existing arrays. Existing values `12` and `15` are retained for backward compatibility with any promos already configured at those tiers.

```ts
/**
 * Single source of truth for promo multiplier values across admin UI, API validators,
 * Mongoose enums, and client display. Extend PROMO_MULTIPLIERS when adding new tiers.
 *
 * Values 2, 3, 5, 10, 12, 15, 20 predate the 2026-05-14 upsell remap and are kept
 * to avoid invalidating historical promo records.
 */

export type PromoMultiplier =
  | 2 | 3 | 5 | 10 | 12 | 15 | 20
  | 25 | 30 | 40 | 50 | 60 | 70 | 75 | 80 | 90 | 100;

export const PROMO_MULTIPLIERS = [
  2, 3, 5, 10, 12, 15, 20,
  25, 30, 40, 50, 60, 70, 75, 80, 90, 100,
] as const;

/** Multipliers that have bundled image assets (badges, some banners) shipped in-repo */
export const PROMO_MULTIPLIERS_WITH_ASSETS = [2, 3, 5, 10, 12, 15, 20] as const;

export type PromoMultiplierWithAssets = (typeof PROMO_MULTIPLIERS_WITH_ASSETS)[number];

export function hasBundledMultiplierAssets(n: number): n is PromoMultiplierWithAssets {
  return (PROMO_MULTIPLIERS_WITH_ASSETS as readonly number[]).includes(n);
}

export function isPromoMultiplier(n: number): n is PromoMultiplier {
  return (PROMO_MULTIPLIERS as readonly number[]).includes(n);
}
```

- [ ] **Step 2: Verify type-check**

Run: `npm run type-check`
Expected: clean exit (no new errors related to PromoMultiplier).

- [ ] **Step 3: Commit (ask for authorization)**

```bash
git add src/types/promo-multiplier.ts
git commit -m "feat(promo): expand PromoMultiplier list to 100x for upsell remap"
```

---

### Task 1.2: Create `UpsellMultiplierConfig` Mongoose model

**Files:**
- Create: `src/models/UpsellMultiplierConfig.ts`

This collection holds a *single document* — admin reads, edits, and re-saves it. We pin a fixed `_id` (sentinel) so reads and updates target the same row.

- [ ] **Step 1: Write the model**

Create `src/models/UpsellMultiplierConfig.ts`:

```ts
import mongoose, { Document, Schema } from "mongoose";
import type { PromoMultiplier } from "@/types/promo-multiplier";
import { PROMO_MULTIPLIERS } from "@/types/promo-multiplier";

/** Sentinel id for the singleton config row. */
export const UPSELL_MULTIPLIER_CONFIG_ID = "upsell-multiplier-config";

export type UpsellCategory = "membership" | "one-time" | "additional";

export interface IUpsellMultiplierConfig extends Document {
  _id: string;
  membership: PromoMultiplier;
  oneTime: PromoMultiplier;
  additional: PromoMultiplier;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const UpsellMultiplierConfigSchema = new Schema<IUpsellMultiplierConfig>(
  {
    _id: { type: String, default: UPSELL_MULTIPLIER_CONFIG_ID },
    membership: {
      type: Number,
      enum: [...PROMO_MULTIPLIERS],
      required: true,
      default: 10,
    },
    oneTime: {
      type: Number,
      enum: [...PROMO_MULTIPLIERS],
      required: true,
      default: 2,
    },
    additional: {
      type: Number,
      enum: [...PROMO_MULTIPLIERS],
      required: true,
      default: 2,
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
    _id: false, // we set _id manually via default
  }
);

UpsellMultiplierConfigSchema.statics.getOrCreate = async function () {
  const existing = await this.findById(UPSELL_MULTIPLIER_CONFIG_ID);
  if (existing) return existing;
  return this.create({ _id: UPSELL_MULTIPLIER_CONFIG_ID });
};

export interface UpsellMultiplierConfigModel
  extends mongoose.Model<IUpsellMultiplierConfig> {
  getOrCreate(): Promise<IUpsellMultiplierConfig>;
}

const UpsellMultiplierConfig =
  (mongoose.models.UpsellMultiplierConfig as UpsellMultiplierConfigModel) ||
  mongoose.model<IUpsellMultiplierConfig, UpsellMultiplierConfigModel>(
    "UpsellMultiplierConfig",
    UpsellMultiplierConfigSchema
  );

export default UpsellMultiplierConfig;
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: clean.

- [ ] **Step 3: Commit (ask for authorization)**

```bash
git add src/models/UpsellMultiplierConfig.ts
git commit -m "feat(upsell): add UpsellMultiplierConfig singleton model"
```

---

### Task 1.3: Server-side resolver for current upsell multipliers

**Files:**
- Create: `src/services/upsell/UpsellMultiplierResolver.ts`

- [ ] **Step 1: Write the resolver**

Create `src/services/upsell/UpsellMultiplierResolver.ts`:

```ts
import connectDB from "@/lib/mongodb";
import UpsellMultiplierConfig, {
  type UpsellCategory,
  type IUpsellMultiplierConfig,
} from "@/models/UpsellMultiplierConfig";

const FIELD_BY_CATEGORY: Record<UpsellCategory, keyof IUpsellMultiplierConfig> = {
  membership: "membership",
  "one-time": "oneTime",
  additional: "additional",
};

/**
 * Returns the configured upsell multiplier for a category.
 * Mini upsells never call this — they use no multiplier.
 */
export async function getUpsellMultiplier(
  category: UpsellCategory
): Promise<number> {
  await connectDB();
  const config = await UpsellMultiplierConfig.getOrCreate();
  const value = config[FIELD_BY_CATEGORY[category]];
  return typeof value === "number" ? value : 1;
}

/** Snapshot of all three category multipliers. */
export async function getAllUpsellMultipliers(): Promise<{
  membership: number;
  oneTime: number;
  additional: number;
}> {
  await connectDB();
  const config = await UpsellMultiplierConfig.getOrCreate();
  return {
    membership: config.membership,
    oneTime: config.oneTime,
    additional: config.additional,
  };
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: clean.

- [ ] **Step 3: Commit (ask for authorization)**

```bash
git add src/services/upsell/UpsellMultiplierResolver.ts
git commit -m "feat(upsell): add server-side multiplier resolver"
```

---

### Task 1.4: Admin API routes — GET + PUT upsell-multipliers

**Files:**
- Create: `src/app/api/admin/upsell-multipliers/route.ts`

- [ ] **Step 1: Write the routes**

Create `src/app/api/admin/upsell-multipliers/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import UpsellMultiplierConfig from "@/models/UpsellMultiplierConfig";
import { PROMO_MULTIPLIERS } from "@/types/promo-multiplier";
import mongoose from "mongoose";

const updateSchema = z.object({
  membership: z.number().refine((n) => (PROMO_MULTIPLIERS as readonly number[]).includes(n)),
  oneTime: z.number().refine((n) => (PROMO_MULTIPLIERS as readonly number[]).includes(n)),
  additional: z.number().refine((n) => (PROMO_MULTIPLIERS as readonly number[]).includes(n)),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const config = await UpsellMultiplierConfig.getOrCreate();
  return NextResponse.json({
    membership: config.membership,
    oneTime: config.oneTime,
    additional: config.additional,
    updatedAt: config.updatedAt,
  });
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await connectDB();
  const config = await UpsellMultiplierConfig.getOrCreate();
  config.membership = parsed.data.membership;
  config.oneTime = parsed.data.oneTime;
  config.additional = parsed.data.additional;
  if (session.user.id) {
    config.updatedBy = new mongoose.Types.ObjectId(session.user.id);
  }
  await config.save();

  return NextResponse.json({ ok: true });
}
```

> Note: confirm the admin-role check matches the codebase's existing pattern. If [src/lib/api-auth.ts](../../../src/lib/api-auth.ts) exposes a helper (e.g. `requireAdmin(session)`), prefer that over the inline check.

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: clean.

- [ ] **Step 3: Commit (ask for authorization)**

```bash
git add src/app/api/admin/upsell-multipliers/route.ts
git commit -m "feat(admin): add upsell-multipliers GET/PUT API"
```

---

### Task 1.5: Regression test — `UpsellMultiplierResolver`

**Files:**
- Create: `src/services/upsell/__tests__/UpsellMultiplierResolver.test.ts`
- Modify: [package.json](../../../package.json) — add `test:upsell-multiplier-resolver` npm script

- [ ] **Step 1: Write the test**

Create `src/services/upsell/__tests__/UpsellMultiplierResolver.test.ts`. Follow the pattern in [src/utils/payment/__tests__](../../../src/utils/payment/__tests__) (look at one of the existing `.test.ts` files for boilerplate — they connect to a real Mongo via the standard `connectDB` helper, mutate, assert, and exit non-zero on failure).

```ts
import "dotenv/config";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import UpsellMultiplierConfig, {
  UPSELL_MULTIPLIER_CONFIG_ID,
} from "@/models/UpsellMultiplierConfig";
import {
  getUpsellMultiplier,
  getAllUpsellMultipliers,
} from "@/services/upsell/UpsellMultiplierResolver";

async function main() {
  await connectDB();

  // Reset
  await UpsellMultiplierConfig.findByIdAndDelete(UPSELL_MULTIPLIER_CONFIG_ID);

  // 1. Defaults: 10 / 2 / 2
  const defaults = await getAllUpsellMultipliers();
  assert.equal(defaults.membership, 10, "default membership = 10");
  assert.equal(defaults.oneTime, 2, "default oneTime = 2");
  assert.equal(defaults.additional, 2, "default additional = 2");

  // 2. Per-category getter
  assert.equal(await getUpsellMultiplier("membership"), 10);
  assert.equal(await getUpsellMultiplier("one-time"), 2);
  assert.equal(await getUpsellMultiplier("additional"), 2);

  // 3. Persist override
  const config = await UpsellMultiplierConfig.getOrCreate();
  config.membership = 50;
  await config.save();
  assert.equal(await getUpsellMultiplier("membership"), 50);

  // Cleanup
  await UpsellMultiplierConfig.findByIdAndDelete(UPSELL_MULTIPLIER_CONFIG_ID);
  await mongoose.connection.close();
  console.log("✅ UpsellMultiplierResolver tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the npm script**

In [package.json](../../../package.json), under `"scripts"`, add (alphabetical with existing `test:*` entries):

```json
"test:upsell-multiplier-resolver": "tsx src/services/upsell/__tests__/UpsellMultiplierResolver.test.ts"
```

- [ ] **Step 3: Run the test**

Run: `npm run test:upsell-multiplier-resolver`
Expected: `✅ UpsellMultiplierResolver tests passed` and exit code 0.

- [ ] **Step 4: Commit (ask for authorization)**

```bash
git add src/services/upsell/__tests__/UpsellMultiplierResolver.test.ts package.json
git commit -m "test(upsell): regression for UpsellMultiplierResolver"
```

---

## Phase 2 — Mini-scoped Additional packs

User-visible win at end of phase: mini-draw catalog renders five new packs named "Tradie Pack / Foreman Pack / Boss Pack / Power Pack / VIP Pack" with Additional-tier inclusions. Mini Pack 4–8 disappear from the catalog (records retained, marked inactive). No upsell math changes yet.

### Task 2.1: Extend `MiniDrawPackage` shape

**Files:**
- Modify: [src/data/miniDrawPackages.ts](../../../src/data/miniDrawPackages.ts) — extend the interface.

- [ ] **Step 1: Add `isMemberOnly` field**

In [src/data/miniDrawPackages.ts](../../../src/data/miniDrawPackages.ts), inside the `MiniDrawPackage` interface, add `isMemberOnly?: boolean` and `displayName?: string`:

```ts
export interface MiniDrawPackage {
  _id: string;
  name: string;
  /** Optional user-facing label override. If absent, `name` is shown. */
  displayName?: string;
  /** When true, this pack appears only for users with active subscription OR major draw entries. */
  isMemberOnly?: boolean;
  price: number;
  entries: number;
  partnerDiscountHours: number;
  partnerDiscountDays: number;
  description: string;
  isActive: boolean;
  stripeProductId?: string;
  stripePriceId?: string;
  upsell?: MiniDrawUpsell;
  originalEntries?: number;
  promoMultiplier?: number;
  isPromoActive?: boolean;
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: clean.

---

### Task 2.2: Mark Mini Pack 4–8 inactive

**Files:**
- Modify: [src/data/miniDrawPackages.ts:118-237](../../../src/data/miniDrawPackages.ts#L118-L237)

- [ ] **Step 1: Flip `isActive` for packs 4–8**

For each of `mini-pack-4`, `mini-pack-5`, `mini-pack-6`, `mini-pack-7`, `mini-pack-8`, change `isActive: true` to `isActive: false`. Leave all other fields untouched so historical payment/order records can still resolve them via `getMiniDrawPackageById`.

Add a comment block above the first deactivated pack:

```ts
// Mini Pack 4–8 deactivated 2026-05-14 — replaced by additional-*-pack-mini records.
// Records retained so historical orders, Stripe webhooks, and admin views can still
// resolve the package by id. See docs/superpowers/specs/2026-05-14-upsell-remap-and-multiplier-design.md.
```

---

### Task 2.3: Append the five new mini-scoped Additional pack records (and re-align Mini Pack 1–3 upsells)

**Files:**
- Modify: [src/data/miniDrawPackages.ts](../../../src/data/miniDrawPackages.ts)

- [ ] **Step 1a: Update Mini Pack 1–3 upsell sub-field entries to the new "same entries" rule**

The existing `MiniDrawPackage.upsell` sub-fields on `mini-pack-1`, `mini-pack-2`, `mini-pack-3` carry the old `2× base` values (`2 / 10 / 20`). Under the new rule (D2: mini upsells = same entries, 50% off only), these become `1 / 5 / 10`. Update them:

```ts
// mini-pack-1.upsell
entries: 1, // was 2 — same as base entry per 2026-05-14 spec
description: "1 Free Entry with 1 Hour Access to Partner Discounts",

// mini-pack-2.upsell
entries: 5, // was 10
description: "5 Free Entries with 6 Hours Access to Partner Discounts",

// mini-pack-3.upsell
entries: 10, // was 20
description: "10 Free Entries with 12 Hours Access to Partner Discounts",
```

Prices on these sub-fields (`0.5 / 2.5 / 5.0`) are already 50% off the trigger; leave them.

- [ ] **Step 1b: Add the new mini-scoped Additional pack records**

Append after the existing `mini-pack-8` entry (before the closing `]` of `miniDrawPackages`):

```ts
  // === MINI-SCOPED ADDITIONAL PACKS (added 2026-05-14) ===
  {
    _id: "additional-tradie-pack-mini",
    name: "Additional Tradie Pack (Mini Draw)",
    displayName: "Tradie Pack",
    isMemberOnly: true,
    price: 25,
    entries: 25,
    partnerDiscountHours: 48,
    partnerDiscountDays: 2,
    description: "Tradie Pack scoped to this mini draw: 25 free entries with 2 days of 40% partner discount access.",
    isActive: true,
    upsell: {
      _id: "mini-upsell-additional-tradie",
      name: "Tradie Pack — Mini Draw Upsell",
      price: 12.5,
      entries: 25,
      partnerDiscountHours: 48,
      partnerDiscountDays: 2,
      description: "Same Tradie Pack benefits at 50% off.",
      isActive: true,
    },
  },
  {
    _id: "additional-foreman-pack-mini",
    name: "Additional Foreman Pack (Mini Draw)",
    displayName: "Foreman Pack",
    isMemberOnly: true,
    price: 50,
    entries: 50,
    partnerDiscountHours: 96,
    partnerDiscountDays: 4,
    description: "Foreman Pack scoped to this mini draw: 50 free entries with 4 days of 55% partner discount access.",
    isActive: true,
    upsell: {
      _id: "mini-upsell-additional-foreman",
      name: "Foreman Pack — Mini Draw Upsell",
      price: 25,
      entries: 50,
      partnerDiscountHours: 96,
      partnerDiscountDays: 4,
      description: "Same Foreman Pack benefits at 50% off.",
      isActive: true,
    },
  },
  {
    _id: "additional-boss-pack-mini",
    name: "Additional Boss Pack (Mini Draw)",
    displayName: "Boss Pack",
    isMemberOnly: true,
    price: 125,
    entries: 125,
    partnerDiscountHours: 240,
    partnerDiscountDays: 10,
    description: "Boss Pack scoped to this mini draw: 125 free entries with 10 days of 70% partner discount access.",
    isActive: true,
    upsell: {
      _id: "mini-upsell-additional-boss",
      name: "Boss Pack — Mini Draw Upsell",
      price: 62.5,
      entries: 125,
      partnerDiscountHours: 240,
      partnerDiscountDays: 10,
      description: "Same Boss Pack benefits at 50% off.",
      isActive: true,
    },
  },
  {
    _id: "additional-power-pack-mini",
    name: "Additional Power Pack (Mini Draw)",
    displayName: "Power Pack",
    isMemberOnly: true,
    price: 250,
    entries: 250,
    partnerDiscountHours: 480,
    partnerDiscountDays: 20,
    description: "Power Pack scoped to this mini draw: 250 free entries with 20 days of 85% partner discount access.",
    isActive: true,
    upsell: {
      _id: "mini-upsell-additional-power",
      name: "Power Pack — Mini Draw Upsell",
      price: 125,
      entries: 250,
      partnerDiscountHours: 480,
      partnerDiscountDays: 20,
      description: "Same Power Pack benefits at 50% off.",
      isActive: true,
    },
  },
  {
    _id: "additional-vip-pack-mini",
    name: "Additional VIP Pack (Mini Draw)",
    displayName: "VIP Pack",
    isMemberOnly: true,
    price: 500,
    entries: 500,
    partnerDiscountHours: 720,
    partnerDiscountDays: 30,
    description: "VIP Pack scoped to this mini draw: 500 free entries with 30 days of 100% partner discount access.",
    isActive: true,
    upsell: {
      _id: "mini-upsell-additional-vip",
      name: "VIP Pack — Mini Draw Upsell",
      price: 250,
      entries: 500,
      partnerDiscountHours: 720,
      partnerDiscountDays: 30,
      description: "Same VIP Pack benefits at 50% off.",
      isActive: true,
    },
  },
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: clean.

---

### Task 2.4: Wire mini-draw catalog to swap by `isMemberOnly`

**Files:**
- Locate: the mini-draw catalog query / hook (`getMiniDrawPackages` in [src/data/miniDrawPackages.ts:243-245](../../../src/data/miniDrawPackages.ts#L243-L245) is currently a pure `isActive` filter; we need a tier-aware variant). Identify the call site(s) in `src/app/(site)/mini-draws/**` and `src/components/**/MiniDraw*`.

- [ ] **Step 1: Add a tier-aware catalog selector**

In [src/data/miniDrawPackages.ts](../../../src/data/miniDrawPackages.ts), add a new helper alongside `getMiniDrawPackages`:

```ts
/**
 * Returns mini-draw packages appropriate for the viewer.
 * - hasAccess=false → only non-member-only packs (Mini Pack 1–3)
 * - hasAccess=true  → only member-only packs (additional-*-pack-mini), mirroring
 *   the major-draw swap rule.
 */
export const getMiniDrawPackagesForViewer = (hasAccess: boolean): MiniDrawPackage[] => {
  return miniDrawPackages.filter((pkg) => {
    if (!pkg.isActive) return false;
    const isMemberOnly = pkg.isMemberOnly === true;
    return hasAccess ? isMemberOnly : !isMemberOnly;
  });
};
```

- [ ] **Step 2: Find every call site of `getMiniDrawPackages`**

Run: `npm run lint -- --rule '{}' --no-eslintrc src 2>&1 | head -n 0; rg "getMiniDrawPackages\\b" src --files-with-matches`
(or use the Grep tool in the harness)
Expected: small list (likely the mini-draw page and one or two hooks).

- [ ] **Step 3: Replace each call with the tier-aware variant**

For each call site, pass `hasAdditionalPackageAccess(userData, userMajorDrawStats)` from [src/utils/membership/has-additional-package-access.ts](../../../src/utils/membership/has-additional-package-access.ts).

If a call site already uses the unified swap rule (e.g. via `filterPackagesForUser`), prefer the explicit `hasAccess` argument over re-deriving it.

- [ ] **Step 4: Browser smoke test**

Run: `npm run dev`
Open `/mini-draws/<active-mini-draw-slug>` as:
- Guest user → expect Mini Pack 1, 2, 3 cards only.
- User with major draw entries (no subscription) → expect Tradie / Foreman / Boss / Power / VIP cards.
- Subscribed user → same as entrant.
Stop the dev server.

- [ ] **Step 5: Commit (ask for authorization)**

```bash
git add src/data/miniDrawPackages.ts src/app/\(site\)/mini-draws src/components
git commit -m "feat(draws): replace Mini Pack 4–8 with mini-scoped Additional packs"
```

---

### Task 2.5: Regression test — mini pack data integrity

**Files:**
- Create: `src/data/__tests__/miniDrawPackages.test.ts`
- Modify: [package.json](../../../package.json) — add `test:mini-draw-packages` script

- [ ] **Step 1: Write the test**

```ts
import assert from "node:assert/strict";
import {
  getMiniDrawPackages,
  getMiniDrawPackagesForViewer,
  getMiniDrawPackageById,
} from "@/data/miniDrawPackages";

function main() {
  // 1. Mini Pack 4–8 still resolvable (historical orders) but inactive.
  for (const id of ["mini-pack-4", "mini-pack-5", "mini-pack-6", "mini-pack-7", "mini-pack-8"]) {
    const pkg = getMiniDrawPackageById(id);
    assert.ok(pkg, `${id} must remain resolvable`);
    assert.equal(pkg!.isActive, false, `${id} must be inactive`);
  }

  // 2. New mini-scoped Additional packs are active and member-only.
  const newIds = [
    "additional-tradie-pack-mini",
    "additional-foreman-pack-mini",
    "additional-boss-pack-mini",
    "additional-power-pack-mini",
    "additional-vip-pack-mini",
  ];
  for (const id of newIds) {
    const pkg = getMiniDrawPackageById(id);
    assert.ok(pkg, `${id} must exist`);
    assert.equal(pkg!.isActive, true);
    assert.equal(pkg!.isMemberOnly, true);
    assert.ok(pkg!.displayName, `${id} must have a displayName`);
  }

  // 3. Entry counts preserved from Mini Pack 4–8.
  const entryByNew: Record<string, number> = {
    "additional-tradie-pack-mini": 25,
    "additional-foreman-pack-mini": 50,
    "additional-boss-pack-mini": 125,
    "additional-power-pack-mini": 250,
    "additional-vip-pack-mini": 500,
  };
  for (const [id, expected] of Object.entries(entryByNew)) {
    assert.equal(getMiniDrawPackageById(id)!.entries, expected);
  }

  // 4. Mini upsell entries equal trigger pack entries (no 2× rule).
  for (const id of newIds) {
    const pkg = getMiniDrawPackageById(id)!;
    assert.ok(pkg.upsell, `${id} must have an upsell`);
    assert.equal(pkg.upsell!.entries, pkg.entries, `${id} upsell entries must match trigger`);
    assert.equal(pkg.upsell!.price, pkg.price / 2, `${id} upsell must be 50% off`);
  }

  // 5. Viewer split.
  const guestPacks = getMiniDrawPackagesForViewer(false);
  const memberPacks = getMiniDrawPackagesForViewer(true);
  assert.equal(guestPacks.length, 3, "guest sees Mini Pack 1–3");
  assert.equal(memberPacks.length, 5, "member/entrant sees 5 Additional minis");
  assert.ok(guestPacks.every((p) => !p.isMemberOnly));
  assert.ok(memberPacks.every((p) => p.isMemberOnly));

  // 6. All upsells satisfy "same entries, 50% off" invariant across the file.
  for (const pkg of getMiniDrawPackages()) {
    if (!pkg.upsell) continue;
    assert.equal(pkg.upsell.entries, pkg.entries, `${pkg._id} upsell entries`);
    assert.equal(pkg.upsell.price, pkg.price / 2, `${pkg._id} upsell price`);
  }

  console.log("✅ miniDrawPackages tests passed");
}

main();
```

- [ ] **Step 2: Add npm script**

In [package.json](../../../package.json), add:

```json
"test:mini-draw-packages": "tsx src/data/__tests__/miniDrawPackages.test.ts"
```

- [ ] **Step 3: Run**

Run: `npm run test:mini-draw-packages`
Expected: `✅ miniDrawPackages tests passed`.

- [ ] **Step 4: Commit (ask for authorization)**

```bash
git add src/data/__tests__/miniDrawPackages.test.ts package.json
git commit -m "test(draws): regression for mini-scoped Additional packs"
```

---

## Phase 3 — Upsell remap & calculator change

User-visible win at end of phase: after-purchase upsell pop-ups show the new mappings (Tradie sub → Apprentice Pack at $9.99/30 entries, etc.) and the admin multiplier knob actually affects the numbers users see.

### Task 3.1: Define new `upsellPackages.ts` shape

**Files:**
- Modify: [src/data/upsellPackages.ts](../../../src/data/upsellPackages.ts)

- [ ] **Step 1: Add new fields to `StaticUpsellPackage`**

Add the following fields to the interface:

```ts
/** Distinct category for analytics + per-category multiplier resolution. */
upsellCategory: "membership" | "one-time" | "additional" | "mini";
/** Internal id of the base pack whose inclusions this upsell mirrors. */
baseTemplatePackageId: string;
/** Stripe Product description (used at payment-intent creation). */
stripeDescription: string;
```

The existing `category` field (`subscription-plus` / `one-time-plus` / `additional-upgrade`) is replaced by `upsellCategory`. Either rename in place or keep both during the rewrite — the cleaner approach is **rename** because no other producer writes `category` values that conflict; consumers update one by one.

- [ ] **Step 2: Add tracking-id field**

Add: `trackingId: string;` immediately after `id`. Each upsell record below sets it per the §3.3 convention from the spec.

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: errors flag every existing upsell record (missing required fields). That's the intentional shape — Task 3.2 fills them in.

> Do **not** commit between this task and Task 3.2.

---

### Task 3.2: Rewrite all upsell records per the mapping

**Files:**
- Modify: [src/data/upsellPackages.ts](../../../src/data/upsellPackages.ts) — replace `upsellPackages` array contents.

- [ ] **Step 1: Replace the array**

Replace the 23-record `upsellPackages` array with **22 new records** — 3 membership + 6 one-time + 5 additional + 8 mini. Mini upsells stay in this file because the upsell purchase route ([src/app/api/upsell/purchase/route.ts:9](../../../src/app/api/upsell/purchase/route.ts#L9)) resolves all upsells via `getUpsellPackageById`. The same-shape data also exists on `MiniDrawPackage.upsell` sub-fields (Task 2.3) — these stay in sync as a known redundancy; deduping is out of scope for this plan.

Each record includes the spec's tracking id, Stripe description, baseTemplatePackageId, and upsellCategory.

```ts
export const upsellPackages: StaticUpsellPackage[] = [
  // === MEMBERSHIP UPSELLS ===
  {
    id: "membership-upsell-tradie",
    trackingId: "membership-upsell-tradie",
    upsellCategory: "membership",
    baseTemplatePackageId: "apprentice-pack",
    image: { group: "membership-pack", slug: "tradie-package" },
    name: "Apprentice Pack",
    description: "Membership bonus — Apprentice Pack at half price.",
    stripeDescription: "Apprentice Pack — Membership Bonus",
    originalPrice: 20,
    discountedPrice: 9.99,
    discountPercentage: 50,
    entriesCount: 30, // 10× of apprentice base (3); admin multiplier may change at calculation time
    shopDiscountPercent: 5,
    partnerDiscountDays: 1,
    accessAfterExpiry: 1,
    buttonText: "Add Apprentice Pack - $9.99",
    conditions: [
      "25% Access to Partner Discounts",
      "1 Day Access to Partner Discounts",
      "30 free entries",
    ],
    urgencyText: "Limited time offer!",
    priority: 10,
    isActive: true,
    targetAudience: ["membership-purchase"],
    userSegments: ["new-user", "returning-user"],
    maxShowsPerUser: 2,
    cooldownHours: 24,
    triggersOnPackageIds: ["tradie-subscription"],
    triggersOnPackageTypes: ["membership"],
    showAfterPurchase: true,
    showAfterDelay: 2,
  },
  {
    id: "membership-upsell-foreman",
    trackingId: "membership-upsell-foreman",
    upsellCategory: "membership",
    baseTemplatePackageId: "tradie-pack",
    image: { group: "membership-pack", slug: "foreman-package" },
    name: "Tradie Pack",
    description: "Membership bonus — Tradie Pack at half price.",
    stripeDescription: "Tradie Pack — Membership Bonus",
    originalPrice: 40,
    discountedPrice: 19.99,
    discountPercentage: 50,
    entriesCount: 150,
    shopDiscountPercent: 10,
    partnerDiscountDays: 2,
    accessAfterExpiry: 2,
    buttonText: "Add Tradie Pack - $19.99",
    conditions: [
      "40% Access to Partner Discounts",
      "2 Days Access to Partner Discounts",
      "150 free entries",
    ],
    urgencyText: "Exclusive Foreman offer!",
    priority: 10,
    isActive: true,
    targetAudience: ["membership-purchase"],
    userSegments: ["new-user", "returning-user"],
    maxShowsPerUser: 2,
    cooldownHours: 24,
    triggersOnPackageIds: ["foreman-subscription"],
    triggersOnPackageTypes: ["membership"],
    showAfterPurchase: true,
    showAfterDelay: 2,
  },
  {
    id: "membership-upsell-boss",
    trackingId: "membership-upsell-boss",
    upsellCategory: "membership",
    baseTemplatePackageId: "foreman-pack",
    image: { group: "membership-pack", slug: "boss-package" },
    name: "Foreman Pack",
    description: "Membership bonus — Foreman Pack at half price.",
    stripeDescription: "Foreman Pack — Membership Bonus",
    originalPrice: 80,
    discountedPrice: 39.99,
    discountPercentage: 50,
    entriesCount: 300,
    shopDiscountPercent: 20,
    partnerDiscountDays: 4,
    accessAfterExpiry: 3,
    buttonText: "Add Foreman Pack - $39.99",
    conditions: [
      "55% Access to Partner Discounts",
      "4 Days Access to Partner Discounts",
      "300 free entries",
    ],
    urgencyText: "Boss Exclusive!",
    priority: 10,
    isActive: true,
    targetAudience: ["membership-purchase"],
    userSegments: ["new-user", "returning-user"],
    maxShowsPerUser: 2,
    cooldownHours: 24,
    triggersOnPackageIds: ["boss-subscription"],
    triggersOnPackageTypes: ["membership"],
    showAfterPurchase: true,
    showAfterDelay: 2,
  },

  // === ONE-TIME UPSELLS ===
  // (Trigger = regular one-time pack; same pack offered at 50% off with 2× base entries by default)
  ...buildOneTimeUpsellRecords(),

  // === ADDITIONAL UPSELLS ===
  // (Trigger = additional-*-pack; same pack offered at 50% off with 2× base entries by default)
  ...buildAdditionalUpsellRecords(),

  // === MINI UPSELLS ===
  // (Trigger = mini-pack-N or new mini-scoped Additional pack; same entries, 50% off price)
  ...buildMiniUpsellRecords(),
];
```

Then add the two builder helpers below the array — they expand the 6 one-time + 5 additional records from a tiny tier table, keeping the file readable. Concrete tier data:

```ts
type UpsellTier = {
  tierSuffix: "apprentice" | "tradie" | "foreman" | "boss" | "power" | "vip";
  basePackId: string;
  originalPrice: number;
  upsellPrice: number;
  entries2x: number;
  partnerPercent: number;
  partnerDays: number;
  imageSlug: string;
};

const ONE_TIME_TIERS: UpsellTier[] = [
  { tierSuffix: "apprentice", basePackId: "apprentice-pack", originalPrice: 25,   upsellPrice: 12.5,   entries2x: 6,    partnerPercent: 25,  partnerDays: 1,  imageSlug: "apprentice-plus" },
  { tierSuffix: "tradie",     basePackId: "tradie-pack",     originalPrice: 50,   upsellPrice: 24.99,  entries2x: 30,   partnerPercent: 40,  partnerDays: 2,  imageSlug: "tradie-plus" },
  { tierSuffix: "foreman",    basePackId: "foreman-pack",    originalPrice: 100,  upsellPrice: 49.99,  entries2x: 60,   partnerPercent: 55,  partnerDays: 4,  imageSlug: "foreman-plus" },
  { tierSuffix: "boss",       basePackId: "boss-pack",       originalPrice: 250,  upsellPrice: 124.99, entries2x: 300,  partnerPercent: 70,  partnerDays: 10, imageSlug: "boss-plus" },
  { tierSuffix: "power",      basePackId: "power-pack",      originalPrice: 500,  upsellPrice: 249.99, entries2x: 1200, partnerPercent: 85,  partnerDays: 20, imageSlug: "power-plus" },
  { tierSuffix: "vip",        basePackId: "vip-pack",        originalPrice: 1000, upsellPrice: 499.99, entries2x: 3000, partnerPercent: 100, partnerDays: 30, imageSlug: "vip-plus" },
];

const ADDITIONAL_TIERS: UpsellTier[] = [
  { tierSuffix: "tradie",  basePackId: "additional-tradie-pack",  originalPrice: 25,   upsellPrice: 12.5,   entries2x: 30,   partnerPercent: 40,  partnerDays: 2,  imageSlug: "tradie-upgrade" },
  { tierSuffix: "foreman", basePackId: "additional-foreman-pack", originalPrice: 50,   upsellPrice: 24.99,  entries2x: 60,   partnerPercent: 55,  partnerDays: 4,  imageSlug: "foreman-upgrade" },
  { tierSuffix: "boss",    basePackId: "additional-boss-pack",    originalPrice: 125,  upsellPrice: 62.5,   entries2x: 300,  partnerPercent: 70,  partnerDays: 10, imageSlug: "boss-upgrade" },
  { tierSuffix: "power",   basePackId: "additional-power-pack",   originalPrice: 250,  upsellPrice: 124.99, entries2x: 1200, partnerPercent: 85,  partnerDays: 20, imageSlug: "power-upgrade" },
  { tierSuffix: "vip",     basePackId: "additional-vip-pack",     originalPrice: 500,  upsellPrice: 249.99, entries2x: 3000, partnerPercent: 100, partnerDays: 30, imageSlug: "vip-upgrade" },
];

function titleCaseTier(t: UpsellTier["tierSuffix"]): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function buildOneTimeUpsellRecords(): StaticUpsellPackage[] {
  return ONE_TIME_TIERS.map((t) => {
    const display = `${titleCaseTier(t.tierSuffix)} Pack`;
    return {
      id: `onetime-upsell-${t.tierSuffix}`,
      trackingId: `onetime-upsell-${t.tierSuffix}`,
      upsellCategory: "one-time",
      baseTemplatePackageId: t.basePackId,
      image: { group: "one-time-pack", slug: t.imageSlug },
      name: display,
      description: `${display} at 50% off — same benefits, double entries.`,
      stripeDescription: `${display} — Upsell`,
      originalPrice: t.originalPrice,
      discountedPrice: t.upsellPrice,
      discountPercentage: 50,
      entriesCount: t.entries2x,
      shopDiscountPercent: 0,
      partnerDiscountDays: t.partnerDays,
      buttonText: `Add ${display} - $${t.upsellPrice}`,
      conditions: [
        `$${t.upsellPrice} One Time Payment`,
        `${t.partnerPercent}% Access to Partner Discounts`,
        `${t.partnerDays} Day${t.partnerDays === 1 ? "" : "s"} Access to Partner Discounts`,
        `${t.entries2x} free entries`,
      ],
      urgencyText: "Limited time offer!",
      priority: 8,
      isActive: true,
      targetAudience: ["one-time-purchase"],
      userSegments: ["new-user", "returning-user"],
      maxShowsPerUser: 3,
      cooldownHours: 12,
      triggersOnPackageIds: [t.basePackId],
      triggersOnPackageTypes: ["one-time"],
      showAfterPurchase: true,
      showAfterDelay: 2,
    };
  });
}

type MiniTier = {
  triggerId: string;
  upsellId: string;
  imageGroup: "mini-pack";
  imageSlug: string;
  displayName: string;
  stripeDescription: string;
  triggerPrice: number;
  upsellPrice: number;
  entries: number;
  partnerPercent: number;
  partnerHours: number;
  partnerDays: number;
};

const MINI_TIERS: MiniTier[] = [
  { triggerId: "mini-pack-1",                    upsellId: "mini-upsell-1",                      imageGroup: "mini-pack", imageSlug: "mini-pack-1", displayName: "Mini Pack 1",  stripeDescription: "Mini Pack 1 — Upsell",                triggerPrice: 1,    upsellPrice: 0.5,  entries: 1,   partnerPercent: 25,  partnerHours: 1,   partnerDays: 1/24 },
  { triggerId: "mini-pack-2",                    upsellId: "mini-upsell-2",                      imageGroup: "mini-pack", imageSlug: "mini-pack-2", displayName: "Mini Pack 2",  stripeDescription: "Mini Pack 2 — Upsell",                triggerPrice: 5,    upsellPrice: 2.5,  entries: 5,   partnerPercent: 25,  partnerHours: 6,   partnerDays: 0.25 },
  { triggerId: "mini-pack-3",                    upsellId: "mini-upsell-3",                      imageGroup: "mini-pack", imageSlug: "mini-pack-3", displayName: "Mini Pack 3",  stripeDescription: "Mini Pack 3 — Upsell",                triggerPrice: 10,   upsellPrice: 5,    entries: 10,  partnerPercent: 25,  partnerHours: 12,  partnerDays: 0.5 },
  { triggerId: "additional-tradie-pack-mini",    upsellId: "mini-upsell-additional-tradie",      imageGroup: "mini-pack", imageSlug: "mini-pack-4", displayName: "Tradie Pack",  stripeDescription: "Tradie Pack — Mini Draw Upsell",      triggerPrice: 25,   upsellPrice: 12.5, entries: 25,  partnerPercent: 40,  partnerHours: 48,  partnerDays: 2 },
  { triggerId: "additional-foreman-pack-mini",   upsellId: "mini-upsell-additional-foreman",     imageGroup: "mini-pack", imageSlug: "mini-pack-5", displayName: "Foreman Pack", stripeDescription: "Foreman Pack — Mini Draw Upsell",     triggerPrice: 50,   upsellPrice: 25,   entries: 50,  partnerPercent: 55,  partnerHours: 96,  partnerDays: 4 },
  { triggerId: "additional-boss-pack-mini",      upsellId: "mini-upsell-additional-boss",        imageGroup: "mini-pack", imageSlug: "mini-pack-6", displayName: "Boss Pack",    stripeDescription: "Boss Pack — Mini Draw Upsell",        triggerPrice: 125,  upsellPrice: 62.5, entries: 125, partnerPercent: 70,  partnerHours: 240, partnerDays: 10 },
  { triggerId: "additional-power-pack-mini",     upsellId: "mini-upsell-additional-power",       imageGroup: "mini-pack", imageSlug: "mini-pack-7", displayName: "Power Pack",   stripeDescription: "Power Pack — Mini Draw Upsell",       triggerPrice: 250,  upsellPrice: 125,  entries: 250, partnerPercent: 85,  partnerHours: 480, partnerDays: 20 },
  { triggerId: "additional-vip-pack-mini",       upsellId: "mini-upsell-additional-vip",         imageGroup: "mini-pack", imageSlug: "mini-pack-8", displayName: "VIP Pack",     stripeDescription: "VIP Pack — Mini Draw Upsell",         triggerPrice: 500,  upsellPrice: 250,  entries: 500, partnerPercent: 100, partnerHours: 720, partnerDays: 30 },
];

function buildMiniUpsellRecords(): StaticUpsellPackage[] {
  return MINI_TIERS.map((t) => ({
    id: t.upsellId,
    trackingId: t.upsellId,
    upsellCategory: "mini",
    baseTemplatePackageId: t.triggerId,
    image: { group: t.imageGroup, slug: t.imageSlug },
    name: t.displayName,
    description: `${t.displayName} at 50% off — same entries, same partner benefits.`,
    stripeDescription: t.stripeDescription,
    originalPrice: t.triggerPrice,
    discountedPrice: t.upsellPrice,
    discountPercentage: 50,
    entriesCount: t.entries, // mini upsells = base entries (no multiplier)
    shopDiscountPercent: 0,
    partnerDiscountDays: t.partnerDays,
    buttonText: `Upgrade Now - $${t.upsellPrice}`,
    conditions: [
      `$${t.upsellPrice} One Time Payment`,
      `${t.partnerPercent}% Access to Partner Discounts`,
      t.partnerHours < 24
        ? `${t.partnerHours} Hour${t.partnerHours === 1 ? "" : "s"} Access to Partner Discounts`
        : `${t.partnerDays} Day${t.partnerDays === 1 ? "" : "s"} Access to Partner Discounts`,
      `${t.entries} free entries`,
    ],
    urgencyText: "Limited time offer!",
    priority: 10,
    isActive: true,
    targetAudience: ["mini-draw-customers"],
    userSegments: ["mini-draw-buyer"],
    triggersOnPackageIds: [t.triggerId],
    triggersOnPackageTypes: ["one-time"], // mini packs surface as one-time in the route
    showAfterPurchase: true,
    showAfterDelay: 2,
    maxShowsPerUser: 1,
    cooldownHours: 0,
  }));
}

function buildAdditionalUpsellRecords(): StaticUpsellPackage[] {
  return ADDITIONAL_TIERS.map((t) => {
    const display = `${titleCaseTier(t.tierSuffix)} Pack`;
    return {
      id: `additional-upsell-${t.tierSuffix}`,
      trackingId: `additional-upsell-${t.tierSuffix}`,
      upsellCategory: "additional",
      baseTemplatePackageId: t.basePackId,
      image: { group: "additional-one-time-pack", slug: t.imageSlug },
      name: display,
      description: `${display} at 50% off — same benefits, double entries.`,
      stripeDescription: `Additional ${display} — Upsell`,
      originalPrice: t.originalPrice,
      discountedPrice: t.upsellPrice,
      discountPercentage: 50,
      entriesCount: t.entries2x,
      shopDiscountPercent: 0,
      partnerDiscountDays: t.partnerDays,
      buttonText: `Add ${display} - $${t.upsellPrice}`,
      conditions: [
        `$${t.upsellPrice} One Time Payment`,
        `${t.partnerPercent}% Access to Partner Discounts`,
        `${t.partnerDays} Day${t.partnerDays === 1 ? "" : "s"} Access to Partner Discounts`,
        `${t.entries2x} free entries`,
      ],
      urgencyText: "Member upgrade available!",
      priority: 6,
      isActive: true,
      targetAudience: ["one-time-purchase"],
      userSegments: ["new-user", "returning-user", "special-package-buyer"],
      maxShowsPerUser: 2,
      cooldownHours: 24,
      triggersOnPackageIds: [t.basePackId],
      triggersOnPackageTypes: ["one-time"],
      showAfterPurchase: true,
      showAfterDelay: 3,
    };
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: clean. The previously deleted records are gone; helpers expand into a complete typed array.

- [ ] **Step 3: Audit for hardcoded references to old upsell IDs**

The rename changes 23 → 22 IDs:
- `tradie-plus-package` → `membership-upsell-tradie`
- `foreman-plus-package` → `membership-upsell-foreman`
- `boss-plus-package` → `membership-upsell-boss`
- `apprentice-plus-pack` → `onetime-upsell-apprentice` (and tradie/foreman/boss/power/vip equivalents)
- `additional-{tradie|foreman|boss|power|vip}-pack-upgrade` → `additional-upsell-{tier}`
- `additional-apprentice-pack-upgrade` → **removed** (no additional-apprentice tier exists; record dropped)
- `mini-pack-{1..8}-upgrade` → `mini-upsell-{1|2|3|additional-tradie|additional-foreman|additional-boss|additional-power|additional-vip}`

Grep for hardcoded references to any old IDs:

```
rg -n --type ts --type tsx '("tradie-plus-package"|"foreman-plus-package"|"boss-plus-package"|"apprentice-plus-pack"|"tradie-plus-pack"|"foreman-plus-pack"|"boss-plus-pack"|"power-plus-pack"|"vip-plus-pack"|"additional-apprentice-pack-upgrade"|"additional-tradie-pack-upgrade"|"additional-foreman-pack-upgrade"|"additional-boss-pack-upgrade"|"additional-power-pack-upgrade"|"additional-vip-pack-upgrade"|"mini-pack-[1-8]-upgrade")' src
```

Expected: most matches in [src/data/upsellPackages.ts](../../../src/data/upsellPackages.ts) (file we just rewrote, so empty after the edit) and in webhook/order-history code paths that read historical metadata (those stay — they're reading old order records, not driving new flows). For every other hit, replace with the new id. Common hot spots: frontend trigger components, e2e tests, dev gallery, image manifest builder. The dev gallery in [src/components/dev/ModalsGalleryClient.tsx](../../../src/components/dev/ModalsGalleryClient.tsx) almost certainly hardcodes one or two of these.

- [ ] **Step 4: Commit (ask for authorization)**

```bash
git add src/data/upsellPackages.ts src/components src/app
git commit -m "feat(upsell): rewrite upsell records to reference base packs with category & tracking id"
```

---

### Task 3.3: Update `upsell-entries-calculator` to use category multiplier

**Files:**
- Modify: [src/utils/payment/upsell-entries-calculator.ts](../../../src/utils/payment/upsell-entries-calculator.ts)

- [ ] **Step 1: Replace the calculator body**

Replace the contents with the new formula. The function becomes async because it reads from the resolver. Mini upsells return base entries unchanged.

```ts
import { getPackageById } from "@/data/membershipPackages";
import { getMiniDrawPackageById } from "@/data/miniDrawPackages";
import { getUpsellPackageById } from "@/data/upsellPackages";
import { getUpsellMultiplier } from "@/services/upsell/UpsellMultiplierResolver";

export interface PackageBaseEntriesParams {
  packageId: string;
  packageType: "membership" | "one-time" | "mini-draw";
}

export function getPackageBaseEntries(params: PackageBaseEntriesParams): number {
  const { packageId, packageType } = params;
  try {
    if (packageType === "mini-draw") {
      const pkg = getMiniDrawPackageById(packageId);
      return pkg?.originalEntries ?? pkg?.entries ?? 0;
    }
    const pkg = getPackageById(packageId);
    if (!pkg) return 0;
    if (pkg.originalEntries !== undefined) return pkg.originalEntries;
    if (pkg.type === "subscription") return pkg.entriesPerMonth ?? 0;
    return pkg.totalEntries ?? 0;
  } catch (err) {
    console.error(`getPackageBaseEntries failed for ${packageId}:`, err);
    return 0;
  }
}

/**
 * Resolve upsell entries for a specific upsell record.
 * - Membership / one-time / additional upsells: categoryMultiplier × baseEntries(template).
 * - Mini upsells: baseEntries(template) (1:1, never multiplied).
 *
 * Active promo multipliers do NOT stack into the upsell calculation.
 */
export async function calculateUpsellEntriesForOffer(offerId: string): Promise<number> {
  const offer = getUpsellPackageById(offerId);
  if (!offer) return 0;

  // Pick the data source for base entries:
  // - membership upsells reference a membership-pack template ("membership" type for subscriptions
  //   OR a one-time apprentice/tradie/foreman pack — both live in membershipPackages.ts)
  // - one-time + additional upsells reference packs in membershipPackages.ts
  // - mini upsells reference packs in miniDrawPackages.ts (Mini Pack 1–3 or additional-*-pack-mini)
  const lookupType: "membership" | "one-time" | "mini-draw" =
    offer.upsellCategory === "mini" ? "mini-draw" : "one-time";

  const baseEntries = getPackageBaseEntries({
    packageId: offer.baseTemplatePackageId,
    packageType: lookupType,
  });

  if (offer.upsellCategory === "mini") {
    return baseEntries; // fixed: no multiplier
  }

  const multiplier = await getUpsellMultiplier(offer.upsellCategory);
  return multiplier * baseEntries;
}

/**
 * Legacy entry point used by the existing upsell purchase route. Keep async signature
 * so callers can await the same way.
 */
export async function calculateUpsellEntriesFromContext(
  originalPurchaseContext: {
    packageId: string;
    packageType: "membership" | "one-time" | "mini-draw";
    baseEntries?: number;
  },
  // `_promoMultiplier` retained for ABI compatibility with the legacy route; ignored on purpose.
  _promoMultiplier: number
): Promise<number> {
  // The old contract was "find an upsell for this package and compute its entries".
  // Look up by trigger pack id rather than by upsell id, since route callers know
  // the original purchase, not the upsell record.
  const { upsellPackages } = await import("@/data/upsellPackages");
  const offer = upsellPackages.find((u) =>
    u.triggersOnPackageIds?.includes(originalPurchaseContext.packageId)
  );
  if (!offer) return 0;
  return calculateUpsellEntriesForOffer(offer.id);
}
```

- [ ] **Step 2: Update callers**

Search for `calculateUpsellEntriesFromContext` usages (grep `calculateUpsellEntriesFromContext` under `src/`). The function is now `async`; ensure each caller already `await`s or convert the call to `await`.

Known caller from inspection: [src/app/api/upsell/purchase/route.ts:12-15](../../../src/app/api/upsell/purchase/route.ts#L12-L15) imports both `calculateUpsellEntriesFromContext` and `getPackageBaseEntries`. Verify the route awaits it (it's inside an async handler — if not, add `await`).

- [ ] **Step 3: Mini-draw display-only upsell paths**

Mini upsells live in **both** [src/data/upsellPackages.ts](../../../src/data/upsellPackages.ts) (driven by the upsell purchase route via `getUpsellPackageById`) and as `MiniDrawPackage.upsell` sub-fields (used by mini-draw catalog UI for display). After Task 2.3 + Task 3.2, both sources carry identical entries values (base, no multiplier). Audit:

```
rg -n 'MiniDrawUpsell|\.upsell\.entries|\bminiUpsell' src
```

For each hit, confirm there is no `* 2`, `*= 2`, or stale `× 2` math applied to mini upsell entries. The calculator's `if (offer.upsellCategory === "mini") return baseEntries;` branch already enforces this for the API-driven path; this audit catches display paths and the mini-draw success page.

- [ ] **Step 4: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit (ask for authorization)**

```bash
git add src/utils/payment/upsell-entries-calculator.ts src/app/api/upsell src/app/\(site\)/mini-draws src/app/\(site\)/mini-draw-success
git commit -m "feat(upsell): replace hardcoded 2× with category multiplier, drop promo stacking"
```

---

### Task 3.4: Wire `stripeDescription` into payment-intent creation

**Files:**
- Modify: [src/app/api/upsell/purchase/route.ts](../../../src/app/api/upsell/purchase/route.ts)

- [ ] **Step 1: Pass `offer.stripeDescription` as the Stripe description**

Find the call site that builds the payment intent config (`createPaymentIntentConfig`). Pass `offer.stripeDescription` so the Stripe Dashboard, receipts, and webhook payloads show the disambiguated name (e.g. `"Apprentice Pack — Membership Bonus"`). If `createPaymentIntentConfig` doesn't already accept a description, plumb one through.

- [ ] **Step 2: Browser smoke test**

Run dev server, complete a test purchase + upsell in Stripe test mode for each upsell category (membership, one-time, additional, mini). Open the Stripe Dashboard test environment and confirm each charge has the expected description per [§3.4 of the spec](../specs/2026-05-14-upsell-remap-and-multiplier-design.md).

- [ ] **Step 3: Commit (ask for authorization)**

```bash
git add src/app/api/upsell/purchase/route.ts src/utils/payment
git commit -m "feat(upsell): set distinct Stripe descriptions per upsell category"
```

---

### Task 3.5: Regression test — upsell calculator math

**Files:**
- Create: `src/utils/payment/__tests__/upsell-entries-calculator-v2.test.ts`
- Modify: [package.json](../../../package.json) — add `test:upsell-entries-v2` script

- [ ] **Step 1: Write the test**

```ts
import "dotenv/config";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import UpsellMultiplierConfig, {
  UPSELL_MULTIPLIER_CONFIG_ID,
} from "@/models/UpsellMultiplierConfig";
import { calculateUpsellEntriesForOffer } from "@/utils/payment/upsell-entries-calculator";

async function main() {
  await connectDB();
  await UpsellMultiplierConfig.findByIdAndDelete(UPSELL_MULTIPLIER_CONFIG_ID);

  // 1. Defaults (membership 10, one-time 2, additional 2).
  assert.equal(await calculateUpsellEntriesForOffer("membership-upsell-tradie"), 30);   // apprentice base 3 × 10
  assert.equal(await calculateUpsellEntriesForOffer("membership-upsell-foreman"), 150); // tradie base 15 × 10
  assert.equal(await calculateUpsellEntriesForOffer("membership-upsell-boss"), 300);    // foreman base 30 × 10

  assert.equal(await calculateUpsellEntriesForOffer("onetime-upsell-apprentice"), 6);   // 3 × 2
  assert.equal(await calculateUpsellEntriesForOffer("onetime-upsell-tradie"), 30);      // 15 × 2
  assert.equal(await calculateUpsellEntriesForOffer("onetime-upsell-foreman"), 60);
  assert.equal(await calculateUpsellEntriesForOffer("onetime-upsell-boss"), 300);
  assert.equal(await calculateUpsellEntriesForOffer("onetime-upsell-power"), 1200);
  assert.equal(await calculateUpsellEntriesForOffer("onetime-upsell-vip"), 3000);

  assert.equal(await calculateUpsellEntriesForOffer("additional-upsell-tradie"), 30);
  assert.equal(await calculateUpsellEntriesForOffer("additional-upsell-foreman"), 60);
  assert.equal(await calculateUpsellEntriesForOffer("additional-upsell-boss"), 300);
  assert.equal(await calculateUpsellEntriesForOffer("additional-upsell-power"), 1200);
  assert.equal(await calculateUpsellEntriesForOffer("additional-upsell-vip"), 3000);

  // Mini upsells — no multiplier, entries == trigger base.
  assert.equal(await calculateUpsellEntriesForOffer("mini-upsell-1"), 1);
  assert.equal(await calculateUpsellEntriesForOffer("mini-upsell-2"), 5);
  assert.equal(await calculateUpsellEntriesForOffer("mini-upsell-3"), 10);
  assert.equal(await calculateUpsellEntriesForOffer("mini-upsell-additional-tradie"), 25);
  assert.equal(await calculateUpsellEntriesForOffer("mini-upsell-additional-foreman"), 50);
  assert.equal(await calculateUpsellEntriesForOffer("mini-upsell-additional-boss"), 125);
  assert.equal(await calculateUpsellEntriesForOffer("mini-upsell-additional-power"), 250);
  assert.equal(await calculateUpsellEntriesForOffer("mini-upsell-additional-vip"), 500);

  // 2. Change membership multiplier to 100 — Tradie upsell becomes 300 (3 × 100).
  const config = await UpsellMultiplierConfig.getOrCreate();
  config.membership = 100;
  await config.save();
  assert.equal(await calculateUpsellEntriesForOffer("membership-upsell-tradie"), 300);

  // Mini upsell unaffected by membership multiplier change.
  assert.equal(await calculateUpsellEntriesForOffer("mini-upsell-additional-tradie"), 25);

  // 3. Unknown offer → 0.
  assert.equal(await calculateUpsellEntriesForOffer("does-not-exist"), 0);

  await UpsellMultiplierConfig.findByIdAndDelete(UPSELL_MULTIPLIER_CONFIG_ID);
  await mongoose.connection.close();
  console.log("✅ upsell-entries-calculator-v2 tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm script**

```json
"test:upsell-entries-v2": "tsx src/utils/payment/__tests__/upsell-entries-calculator-v2.test.ts"
```

- [ ] **Step 3: Run**

Run: `npm run test:upsell-entries-v2`
Expected: `✅ upsell-entries-calculator-v2 tests passed`.

- [ ] **Step 4: Commit (ask for authorization)**

```bash
git add src/utils/payment/__tests__/upsell-entries-calculator-v2.test.ts package.json
git commit -m "test(upsell): regression for category-multiplier formula"
```

---

## Phase 4 — Admin UI panel

User-visible win at end of phase: admin can adjust the three category multipliers via a UI panel and immediately see the resulting upsell entries per pack, with active-promo context displayed for sanity-check.

### Task 4.1: Build the read query hook

**Files:**
- Create: `src/hooks/queries/admin/useUpsellMultipliers.ts`

- [ ] **Step 1: Add the TanStack Query hooks**

Follow the patterns used in [src/hooks/queries/admin/useBlockedCards.ts](../../../src/hooks/queries/admin/useBlockedCards.ts) for shape — same `queryKey` convention, `useMutation` with invalidation.

```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const upsellMultipliersQueryKey = ["admin", "upsell-multipliers"] as const;

export interface UpsellMultipliers {
  membership: number;
  oneTime: number;
  additional: number;
  updatedAt: string;
}

export function useUpsellMultipliersQuery() {
  return useQuery<UpsellMultipliers>({
    queryKey: upsellMultipliersQueryKey,
    queryFn: async () => {
      const res = await fetch("/api/admin/upsell-multipliers");
      if (!res.ok) throw new Error("Failed to load upsell multipliers");
      return res.json();
    },
  });
}

export function useUpsellMultipliersMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Pick<UpsellMultipliers, "membership" | "oneTime" | "additional">) => {
      const res = await fetch("/api/admin/upsell-multipliers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update upsell multipliers");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: upsellMultipliersQueryKey }),
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: clean.

---

### Task 4.2: Active-promo snapshot hook (read-only)

**Files:**
- Locate: an existing admin hook that already returns active promos (grep `useActivePromo` or `useActivePromos`). Reuse it. If none exists in `src/hooks/queries/admin/`, expose a minimal new one that hits an existing GET endpoint.

- [ ] **Step 1: Identify or add the hook**

Decision point — pick whichever has lower friction. If reusing, capture the queryKey + return shape so Task 4.3 can render the active-promo banner. If adding, mirror the pattern from Task 4.1.

---

### Task 4.3: Build `UpsellMultiplierPanel` component

**Files:**
- Create: `src/components/admin/UpsellMultiplierPanel.tsx`
- Create: `src/components/admin/UpsellMultiplierPanel.preview.tsx` (sub-component for the preview tables)

- [ ] **Step 1: Build the panel shell**

The shell renders an active-promo banner at the top, then four sections (Membership / One-Time / Additional / Mini), each with the spec's preview layout. Multiplier selects use `PROMO_MULTIPLIERS` for option lists.

```tsx
"use client";

import { useState } from "react";
import { PROMO_MULTIPLIERS } from "@/types/promo-multiplier";
import {
  useUpsellMultipliersMutation,
  useUpsellMultipliersQuery,
} from "@/hooks/queries/admin/useUpsellMultipliers";
import { UpsellMultiplierPreviewTables } from "./UpsellMultiplierPanel.preview";

export function UpsellMultiplierPanel() {
  const { data, isLoading, isError } = useUpsellMultipliersQuery();
  const mutation = useUpsellMultipliersMutation();

  const [draft, setDraft] = useState<{ membership: number; oneTime: number; additional: number } | null>(null);
  const current = draft ?? (data ? { membership: data.membership, oneTime: data.oneTime, additional: data.additional } : null);

  if (isLoading) return <div className="p-4 text-sm text-slate-500">Loading upsell multipliers…</div>;
  if (isError || !current) return <div className="p-4 text-sm text-red-600">Failed to load upsell multipliers.</div>;

  return (
    <section className="rounded-lg border bg-white p-6 shadow-sm">
      <header className="mb-4">
        <h2 className="text-lg font-semibold">Upsell Multipliers</h2>
        <p className="mt-1 text-sm text-slate-600">
          Sets how many free entries each upsell offers, as a multiplier of the trigger pack&apos;s base entries.
          Active promo multipliers do not stack into upsell math.
        </p>
      </header>

      <ActivePromoBanner />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {(["membership", "oneTime", "additional"] as const).map((key) => (
          <label key={key} className="block">
            <span className="text-sm font-medium capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
            <select
              className="mt-1 block w-full rounded border-slate-300"
              value={current[key]}
              onChange={(e) =>
                setDraft({ ...current, [key]: Number(e.target.value) })
              }
            >
              {PROMO_MULTIPLIERS.map((m) => (
                <option key={m} value={m}>{m}×</option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <UpsellMultiplierPreviewTables
        membership={current.membership}
        oneTime={current.oneTime}
        additional={current.additional}
      />

      <footer className="mt-6 flex items-center justify-end gap-3">
        {draft && (
          <button
            type="button"
            className="rounded border px-3 py-1.5 text-sm"
            onClick={() => setDraft(null)}
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          disabled={!draft || mutation.isPending}
          onClick={() => draft && mutation.mutate(draft, { onSuccess: () => setDraft(null) })}
        >
          {mutation.isPending ? "Saving…" : "Save"}
        </button>
      </footer>
    </section>
  );
}

function ActivePromoBanner() {
  // Pull active per-category promo multipliers via the hook chosen in Task 4.2 and
  // render a one-line summary. Skeleton:
  return (
    <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm">
      <strong>Active promo:</strong> {/* membership: 10×  one-time: 5×  mini: 1×  (from useActivePromo) */}
    </div>
  );
}
```

- [ ] **Step 2: Build the preview sub-component**

`UpsellMultiplierPanel.preview.tsx` renders four tables (one per category, plus Mini as a static recap). Each row is `[Trigger pack name, Upsell display name, base entries, upsell entries, price]`. Reuse the same constants from Task 3.2 (ONE_TIME_TIERS / ADDITIONAL_TIERS) — either import them or duplicate as a tiny local table. Pulling them in via a shared `src/data/upsell-tier-tables.ts` is acceptable if cleaner.

For Mini, the preview is a static list of `1, 5, 10, 25, 50, 125, 250, 500` since there is no multiplier knob.

- [ ] **Step 3: Mount the panel**

Add `<UpsellMultiplierPanel />` to the existing admin promo/configuration page. Locate via grep: `rg -l "PromoConfig\\|ActivePromo" src/app/admin`. Drop it near where the promo schedule UI lives.

- [ ] **Step 4: Smoke test**

Run `npm run dev`, log in as admin, navigate to the admin page where the panel lives. Confirm:
- Defaults load (10 / 2 / 2).
- Changing a select updates the preview table inline.
- Save persists; refresh shows the new values.

- [ ] **Step 5: Commit (ask for authorization)**

```bash
git add src/components/admin/UpsellMultiplierPanel.tsx src/components/admin/UpsellMultiplierPanel.preview.tsx src/hooks/queries/admin/useUpsellMultipliers.ts src/app/admin
git commit -m "feat(admin): upsell multiplier panel with per-pack entry preview"
```

---

### Task 4.4: Promo configuration screen — add per-package entry preview

**Files:**
- Locate: the existing admin promo configuration page (grep `Promo.*Schema\\|createPromo\\|Promo configuration` under `src/app/admin` and `src/components/admin`).

- [ ] **Step 1: Identify the promo form**

Find the form component admins use to set the membership / one-time / mini promo multipliers.

- [ ] **Step 2: Add a live preview block**

For the chosen multiplier values, render a small read-only table per package family showing `baseEntries × multiplier = purchase entries`. Use the same data source the catalogue uses ([src/data/membershipPackages.ts](../../../src/data/membershipPackages.ts) and [src/data/miniDrawPackages.ts](../../../src/data/miniDrawPackages.ts)).

- [ ] **Step 3: Smoke test**

Open the admin promo form, change a multiplier select, confirm the preview numbers update before saving.

- [ ] **Step 4: Commit (ask for authorization)**

```bash
git add src/components/admin src/app/admin
git commit -m "feat(admin): promo config — live per-package entry preview"
```

---

## Phase 5 — Display polish, terminology, docs

User-visible win at end of phase: cleaner UI naming (no "Additional" prefix), consistent "free entries" copy, disambiguated receipts/cart, and docs in sync per CLAUDE.md.

### Task 5.1: Drop "Additional" from UI display of additional packs

**Files:**
- Modify: catalog renderers under `src/components/modals/PackageSelectionModal/**`, `src/components/sections/MembershipSection.tsx`, and any other place that reads `pkg.name`.

- [ ] **Step 1: Add a display-name helper**

Create `src/utils/membership/getDisplayName.ts`:

```ts
import type { StaticMembershipPackage } from "@/data/membershipPackages";

/**
 * UI display name. Strips the "Additional " prefix used internally for member-only one-time packs.
 * Internal `name` and Stripe descriptions are unchanged.
 */
export function getPackageDisplayName(pkg: Pick<StaticMembershipPackage, "name">): string {
  return pkg.name.replace(/^Additional\s+/, "");
}
```

- [ ] **Step 2: Apply across the major-draw catalog**

Replace direct reads of `pkg.name` in catalog UI with `getPackageDisplayName(pkg)`. Do NOT change reads in admin views, receipts, or order history.

- [ ] **Step 3: Smoke test**

Run dev server, view the catalog as a subscriber/entrant. Confirm cards read "Tradie Pack / Foreman Pack / Boss Pack / Power Pack / VIP Pack" — no "Additional" prefix.

- [ ] **Step 4: Commit (ask for authorization)**

```bash
git add src/utils/membership/getDisplayName.ts src/components
git commit -m "feat(catalog): drop 'Additional' prefix from UI display"
```

---

### Task 5.2: "Free entries" terminology sweep

**Files:**
- Repo-wide grep + manual review.

- [ ] **Step 1: Inventory entry-count strings**

Run:
```
rg -l --type ts --type tsx --type html '\b(Entries|Free Entries|free entries|FREE ENTRIES)\b' src email-templates
```

Capture each match's intent (UI copy vs. internal field name) and decide replacement.

- [ ] **Step 2: Replace user-facing strings**

For each component / template string that *displays* an entry count, normalize to one of the canonical phrases:
- "`N` free entries" (most cases)
- "`N` FREE ENTRIES" (in all-caps card labels — match local styling)
- "free entries" (in static labels separate from the number)

Leave intact:
- Internal field names (`totalEntries`, `entriesPerMonth`)
- Code comments
- Admin-only labels where "entries" is unambiguous

- [ ] **Step 3: Email template pass**

Search the root-level `*-email-template.html` files for entry-count phrasing and apply the same normalization.

- [ ] **Step 4: Smoke test**

Run dev server, click through: catalog cards, package detail modals, purchase success page, upsell pop-up, mini-draw catalog. Spot-check 5+ surfaces for "free entries" wording.

- [ ] **Step 5: Commit (ask for authorization)**

```bash
git add src email-templates
git commit -m "chore(copy): normalize entry-count strings to 'N free entries'"
```

---

### Task 5.3: Receipt / cart context labels for "Tradie Pack" collisions

**Files:**
- Modify: order history page (`src/app/(site)/my-account/**` is the likely home), receipt email template, and any cart summary component.

- [ ] **Step 1: Helper for context-aware display**

```ts
// src/utils/membership/getReceiptLabel.ts
import type { StaticMembershipPackage } from "@/data/membershipPackages";
import type { MiniDrawPackage } from "@/data/miniDrawPackages";

export function getReceiptLabel(pkg: StaticMembershipPackage | MiniDrawPackage): string {
  // Mini-scoped Additional pack
  if ("displayName" in pkg && pkg.displayName) {
    return `${pkg.displayName} (Mini Draw)`;
  }
  // Additional one-time pack (member-only on major draw)
  if ("isMemberOnly" in pkg && pkg.isMemberOnly && pkg.name.startsWith("Additional ")) {
    return `${pkg.name.replace(/^Additional\s+/, "")} (Member)`;
  }
  return "name" in pkg ? pkg.name : "";
}
```

- [ ] **Step 2: Use it in receipts / order history**

Update receipt rendering and order-history rows to call `getReceiptLabel` instead of `pkg.name`.

- [ ] **Step 3: Smoke test**

Run dev server, place a test order on the mini draw page, view order history. Confirm the row reads "Tradie Pack (Mini Draw)" or similar — distinct from a regular `Tradie Pack` row.

- [ ] **Step 4: Commit (ask for authorization)**

```bash
git add src/utils/membership/getReceiptLabel.ts src/app/\(site\)/my-account src/components email-templates
git commit -m "feat(receipts): context-aware labels for member/mini-draw pack collisions"
```

---

### Task 5.4: Update domain docs

**Files:**
- `docs/upsell/` — full update
- `docs/subscription/` — note membership-upsell behavior change
- `docs/admin/` — new Upsell-Multiplier panel
- `docs/billing-stripe/` — Stripe description conventions
- `docs/promo/` — multiplier-list expansion

- [ ] **Step 1: Update `docs/upsell/`**

In each subfile of `docs/upsell/` that exists today (likely `architecture.md`, `rules.md`, `gotchas.md`, `frontend.md`, `backend.md`):
- Replace mentions of the old "Plus" mapping with the new mapping table from §3 of the spec.
- Document the formula `categoryMultiplier × baseEntries` and the no-stacking rule.
- Add a "No migration" note pointing to deactivated `mini-pack-4..8`.

- [ ] **Step 2: Update remaining four domains**

Mirror the spec's §6 (changes per domain) in each domain doc. Keep edits *targeted* — do not rewrite unrelated sections.

- [ ] **Step 3: Run doc-sync**

Invoke the `/doc-sync` skill (available in the local plugin set) to audit `docs/<domain>/` coverage against `src/` and `scripts/`. It reports orphans (unmapped paths) and ghosts (manifest paths pointing to deleted files). Resolve any findings before completing this task. The same check fires automatically as a Stop hook when the implementing agent finishes — this manual run is a faster early signal.

- [ ] **Step 4: Bump `lastVerified` in the manifest**

In [CLAUDE.md's Domain Manifest](../../../CLAUDE.md), bump `lastVerified` to `2026-05-14` for `upsell`, `subscription`, `admin`, `billing-stripe`, `promo`.

- [ ] **Step 5: Commit (ask for authorization)**

```bash
git add docs CLAUDE.md
git commit -m "docs: refresh upsell + adjacent domains for remap & multiplier system"
```

---

## Phase 6 — Final integration check (single-task phase)

### Task 6.1: End-to-end smoke + ship checks

**Files:** none new.

- [ ] **Step 1: Run definition-of-done checks**

```
npm run type-check
npm run lint
npm run test:upsell-multiplier-resolver
npm run test:mini-draw-packages
npm run test:upsell-entries-v2
npm run test:anchor-billing
```
Expected: all pass.

- [ ] **Step 2: Full browser pass**

`npm run dev`, then walk through:
1. Guest → catalog shows Apprentice / Tradie / Foreman / Boss / Power / VIP packs at regular prices.
2. Major-draw entrant (no sub) → catalog shows Tradie/Foreman/Boss/Power/VIP at discounted prices.
3. Subscriber → same catalog as entrant. Mini-draw page shows Mini Pack 1–3 + Tradie/Foreman/Boss/Power/VIP (Mini Draw).
4. Buy `tradie-subscription` (test mode) → confirm upsell pop-up shows Apprentice Pack at $9.99, 30 free entries.
5. Buy `apprentice-pack` (test mode) → confirm upsell pop-up shows Apprentice Pack at $12.50, 6 free entries.
6. Admin → change membership multiplier to 50× → confirm Tradie sub upsell now shows 150 free entries.
7. Stripe Dashboard (test mode) → confirm each new charge description matches §3.4.

- [ ] **Step 3: Final commit (ask for authorization)**

```bash
git add .
git commit -m "chore(upsell): finalize remap, multiplier system, terminology"
```

---

## Risks the implementation must watch

(Mirrors §6 of the spec — re-stated here so engineers reading this plan don't have to context-switch.)

1. **Behavior change for existing in-flight upsell calculations.** The `2× (base × promo)` → `categoryMultiplier × base` change ships in Phase 3 Task 3.3. Before this lands, ensure the admin config row exists (it auto-creates via `getOrCreate` on first read, so this is mostly safe).
2. **Mini upsell entries field rename.** Phase 2 sets `upsell.entries` to base-equal values; any code path that previously *recomputed* mini upsell entries from a multiplier must be removed (Task 3.3 Step 3 catches this).
3. **Stripe Product IDs for new upsells.** We are *not* storing Stripe product IDs per upsell — descriptions pass through at payment-intent creation time. Verify finance is OK with this approach in Stripe Dashboard reports.
4. **`isMemberOnly: true` on mini-scoped Additional packs.** The flag drives catalog visibility, NOT promo-multiplier routing — mini upsells stay multiplier-less. The calculator (Task 3.3) explicitly branches on `upsellCategory === "mini"` to enforce this.
5. **`PromoMultiplier` keeps 12 and 15.** If the user later confirms 12 and 15 should be dropped, that's a separate small task — out of scope for this plan.

---

## Acceptance (mirrors spec §7)

- [ ] All 22 upsell records (3 membership + 6 one-time + 5 additional + 8 mini) in [src/data/upsellPackages.ts](../../../src/data/upsellPackages.ts) match §3.2 of the spec.
- [ ] Mini Pack 1–3 `upsell` sub-fields in [src/data/miniDrawPackages.ts](../../../src/data/miniDrawPackages.ts) updated to `entries = base` (1 / 5 / 10), prices unchanged.
- [ ] 5 mini-scoped Additional packs live in [src/data/miniDrawPackages.ts](../../../src/data/miniDrawPackages.ts), each with `isMemberOnly: true` and a working `upsell` sub-field with same entries / 50% off price.
- [ ] No remaining hardcoded references to old upsell IDs (`*-plus-package`, `*-plus-pack`, `mini-pack-N-upgrade`, etc.) in `src/` outside historical-data read paths.
- [ ] Mini Pack 4–8 records are `isActive: false`; historical orders still resolve them by id.
- [ ] [src/utils/payment/upsell-entries-calculator.ts](../../../src/utils/payment/upsell-entries-calculator.ts) returns `categoryMultiplier × base` for membership / one-time / additional, and bare base for mini.
- [ ] Admin Upsell-Multiplier panel saves + reflects in the calculator.
- [ ] Admin promo config screen renders the per-package entry preview.
- [ ] [src/types/promo-multiplier.ts](../../../src/types/promo-multiplier.ts) includes 25 through 100 (and retains 12, 15).
- [ ] User-facing entry strings read "N free entries".
- [ ] Stripe Dashboard shows distinct descriptions per upsell category.
- [ ] Five domain docs refreshed with the new mapping, formula, and no-migration note.
