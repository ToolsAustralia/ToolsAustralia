# Klaviyo shop `is_renewal` + inert conversion-metric labelling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every live Klaviyo `Placed Order` carry `is_renewal`, fence both emitters with tests, and stop the admin dashboard and the Norm brief from presenting renewal-inclusive revenue as acquisition revenue.

**Architecture:** Two additive code changes (one property, one deletion) plus documentation truth-fixes across four domains. No schema change, no migration, no feature flag. The property addition is one line; almost all the work is the fence that stops it silently regressing and the docs that currently assert the opposite.

**Tech Stack:** TypeScript, Next.js 15 App Router, `tsx` standalone test scripts (no jest/vitest), Klaviyo Events API, MongoDB/Mongoose.

**Spec:** [`docs/superpowers/specs/2026-09-02-klaviyo-shop-is-renewal-design.md`](../specs/2026-09-02-klaviyo-shop-is-renewal-design.md)

**Branch:** `fix/klaviyo-shop-is-renewal-and-conversion-metric` (already created, off `main`)

## Global Constraints

- **NO COMMITS.** CLAUDE.md rule 1 — DJ has not authorized commits this session. Every task ends at "verify", never "commit". Ask before any `git add` / `git commit` / `git push`. This deliberately overrides the writing-plans skill's default commit step.
- **Never push to `main`** (rule 1b). Work stays on the branch above.
- **Additive only.** Existing `Placed Order` property names are frozen — live Klaviyo flows reference them by exact name, and renaming one breaks production with no error surfaced (`docs/tracking/gotchas.md:91`). Add `is_renewal`; touch no existing key.
- **`is_renewal` must always be PRESENT**, never omitted for the `false` case. Klaviyo treats a missing property as "not set", which does not match `EQUALS false` / `= 0`. This is the entire bug.
- **Doc-sync Stop hook will block you.** Editing `src/utils/integrations/klaviyo/**` requires a `CUSTOMER.md` touch in the same turn (Task 3). Editing `src/hooks/useKlaviyoTracking.ts` requires a `docs/tracking/` edit in the same turn (Task 4).
- **Customer-facing copy rules (rule 11) do not apply** to anything in this plan — the only UI touched is `/admin`, which is staff-gated. Copy still has to be *true*.
- **No test runner.** Tests are standalone `tsx` scripts run via their own npm script. The only suite this plan touches is `npm run test:klaviyo-canonical`.

---

### Task 1: Fence and fix the shop `Placed Order` emitter

The core defect. TDD: the test must fail for the right reason before the fix goes in.

**Files:**
- Modify: `src/utils/integrations/klaviyo/__tests__/canonical-events-shape.test.ts` (add stub block + test fn + runner line)
- Modify: `src/utils/integrations/klaviyo/klaviyo-revenue-service.ts:196-216`

**Interfaces:**
- Consumes: `trackShopPlacedOrder(params)` from `@/utils/integrations/klaviyo/klaviyo-revenue-service` — `params: { email?, userId?, orderNumber, totalAmount, items[] }`, returns `void`.
- Produces: nothing new. The emitted payload gains one key, `is_renewal: false`.

- [ ] **Step 1: Add the stub scaffolding to the test file**

Insert this **above** the existing `function run()` block (around line 533). It must sit before the `require` in Step 2. `klaviyo-events.ts` does not import `@/lib/klaviyo`, so the existing top-level imports do not load the real singleton and cannot defeat this stub.

```ts
// ---------------------------------------------------------------------------
// Shop Placed Order — recorder + stub, installed in require.cache BEFORE the
// revenue service is loaded. `trackShopPlacedOrder` returns void and calls the
// klaviyo singleton directly, so it cannot be snapshot-tested like the pure
// builders above. Mechanism copied from
// src/services/subscription/__tests__/cancel-subscription-churn-emit.test.ts:145.
// ---------------------------------------------------------------------------

const shopEmits: KlaviyoEvent[] = [];

const stubKlaviyo = {
  trackEventBackground(event: KlaviyoEvent): void {
    shopEmits.push(event);
  },
  async trackEvent(): Promise<never> {
    throw new Error("trackShopPlacedOrder must use trackEventBackground, never a blocking trackEvent");
  },
};

/** Install `exports` into require.cache for a repo-relative .ts path. */
function stubModule(relativeTsPath: string, exports: unknown): void {
  const resolved = require.resolve(path.resolve(process.cwd(), relativeTsPath));
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    children: [],
    paths: [],
    parent: undefined,
    exports,
  } as unknown as NodeJS.Module;
}
```

Add these two imports to the top of the file, beside the existing `import assert from "node:assert/strict";`:

```ts
import path from "node:path";
import type { KlaviyoEvent } from "@/types/klaviyo";
```

- [ ] **Step 2: Write the failing test**

Add this function directly below the stub block:

```ts
function testShopPlacedOrderCarriesIsRenewalFalse() {
  stubModule("src/lib/klaviyo.ts", { klaviyo: stubKlaviyo });

  /* eslint-disable @typescript-eslint/no-require-imports */
  const loadedKlaviyo = require("@/lib/klaviyo") as { klaviyo: unknown };
  const revenueService = require("@/utils/integrations/klaviyo/klaviyo-revenue-service") as {
    trackShopPlacedOrder: (p: {
      email?: string;
      userId?: string;
      orderNumber: string;
      totalAmount: number;
      items: { productId: string; name: string; quantity: number; price: number }[];
    }) => void;
  };
  /* eslint-enable @typescript-eslint/no-require-imports */

  // HARD SAFETY GATE — prove the service reaches the stub, not the real client,
  // before emitting anything. A silently-failed stub install would otherwise turn
  // this test into a live write against the production Klaviyo account.
  assert.equal(
    loadedKlaviyo.klaviyo,
    stubKlaviyo,
    "require.cache stub did not take effect — ABORT, this would hit real Klaviyo"
  );

  shopEmits.length = 0;
  revenueService.trackShopPlacedOrder({
    email: "shopper@example.com",
    userId: "user_123",
    orderNumber: "TA-1001",
    totalAmount: 59,
    items: [{ productId: "prod_1", name: "Hoodie", quantity: 1, price: 59 }],
  });

  assert.equal(shopEmits.length, 1, "exactly one Placed Order must be emitted");
  const props = shopEmits[0].properties;

  assert.equal(shopEmits[0].event, "Placed Order");
  assert.equal(props.is_renewal, false, "merchandise is never a renewal — must emit is_renewal: false");

  // Presence, stated rather than implied. The assertion above already fails if the
  // key is dropped (strict equal: `undefined` is not `false`), but the contract is
  // that the property is ALWAYS on the payload. Klaviyo cannot tell an omitted key
  // from a false one, and an omitted key silently drops the sale from the
  // "Marketing Revenue" custom metric.
  assert.equal("is_renewal" in props, true, "is_renewal must be PRESENT, never omitted");

  // The discriminator and the frozen revenue keys must survive the additive edit.
  assert.equal(props.order_type, "shop");
  assert.equal(props.$value, 59);
  assert.equal(props.Currency, "AUD");
  assert.equal(props["Order ID"], "TA-1001");
  assert.ok(Array.isArray(props.items), "items[] must still be present");
}
```

Register it in `run()` by adding this line after `testOneTimePackagePurchasedCarriesHadActiveSubscription();`:

```ts
  testShopPlacedOrderCarriesIsRenewalFalse();
```

- [ ] **Step 3: Run the test and confirm it fails for the RIGHT reason**

```bash
npm run test:klaviyo-canonical
```

Expected: FAIL on `merchandise is never a renewal — must emit is_renewal: false`, with `undefined !== false`.

**If it instead fails on the safety gate** (`require.cache stub did not take effect`), the stub is not installed — do not proceed and do not "fix" it by weakening the gate. Check that `stubModule` runs before the `require`, and that no top-level `import` pulls `@/lib/klaviyo` in ahead of it.

- [ ] **Step 4: Apply the one-line fix**

In `src/utils/integrations/klaviyo/klaviyo-revenue-service.ts`, inside the `properties` object of `trackShopPlacedOrder`, immediately after the `order_number` line:

```ts
      order_type: "shop",
      order_number: params.orderNumber,
      // Merchandise is never a subscription renewal. ALWAYS emitted (never omitted
      // for the false case) because Klaviyo treats a missing property as "not set",
      // which does not match an `EQUALS false` / `= 0` filter — so an absent flag
      // silently drops every merch sale out of the "Marketing Revenue" custom metric.
      // Same contract as createPlacedOrderEvent (klaviyo-events.ts:731-736).
      // `billing_reason` stays absent: merch is not Stripe-subscription-originated.
      is_renewal: false,
```

- [ ] **Step 5: Run the test and confirm it passes**

```bash
npm run test:klaviyo-canonical
```

Expected: PASS, and the existing snapshots still pass.

- [ ] **Step 6: Type-check**

```bash
npm run type-check
```

Expected: clean. **Do not commit** (Global Constraints).

---

### Task 2: Fence the pre-existing package flag and the call site

Two silent regressions the shop fix does not close. `grep -rn 'is_renewal' src/ --include=*.test.ts` currently returns **zero hits** (control: `package_type` returns 10), so the original flag at `klaviyo-events.ts:736` is as deletable today as the shop one was. And every assertion so far pins the payload *inside* `trackShopPlacedOrder` — deleting the **call** in `finalizeShopOrder` leaves `tsc`, lint and Task 1's test all green.

**Files:**
- Modify: `src/utils/integrations/klaviyo/__tests__/canonical-events-shape.test.ts`

**Interfaces:**
- Consumes: `createPlacedOrderEvent(user, orderData)` from `./klaviyo-events` — already imported at the top of the test file if the other snapshots use it; if not, add it to the existing import list.

- [ ] **Step 1: Write both failing-capable tests**

```ts
function testCreatePlacedOrderEventAlwaysCarriesIsRenewal() {
  const base = {
    orderId: "order_test_1",
    value: 20,
    currency: "AUD",
    packageType: "membership" as const,
    packageId: "tradie",
    packageName: "Tradie",
  };

  const renewal = createPlacedOrderEvent(fakeUser(), { ...base, isRenewal: true });
  assert.equal(renewal.properties.is_renewal, true, "a subscription_cycle order must emit is_renewal: true");

  // Omitted → must default to false, NOT undefined. This is the `?? false` at
  // klaviyo-events.ts:736; without it every non-renewal order falls out of the
  // Marketing Revenue metric exactly the way merch sales did.
  const firstPurchase = createPlacedOrderEvent(fakeUser(), base);
  assert.equal(firstPurchase.properties.is_renewal, false, "an omitted isRenewal must emit false, never undefined");
  assert.equal(
    "is_renewal" in firstPurchase.properties,
    true,
    "is_renewal must be PRESENT on every Placed Order, never omitted"
  );
}

function testFinalizeShopOrderStillCallsTheEmitter() {
  // Deliberately crude: `finalizeShopOrder` reaches Mongo, Stripe and the print
  // provider, so importing it here is not proportionate. Every other assertion in
  // this file pins the payload built INSIDE trackShopPlacedOrder — none of them
  // notices if the CALL disappears, which would stop merch sales reaching Klaviyo
  // entirely while tsc, lint and this suite all stay green.
  const source = readFileSync(
    path.resolve(process.cwd(), "src/services/shop/finalizeShopOrder.ts"),
    "utf8"
  );
  assert.ok(
    source.includes("trackShopPlacedOrder("),
    "finalizeShopOrder must still call trackShopPlacedOrder — the Klaviyo emit for merch orders"
  );
}
```

Add the import for `readFileSync` at the top of the file:

```ts
import { readFileSync } from "node:fs";
```

Register both in `run()`:

```ts
  testCreatePlacedOrderEventAlwaysCarriesIsRenewal();
  testFinalizeShopOrderStillCallsTheEmitter();
```

- [ ] **Step 2: Run and confirm they pass**

```bash
npm run test:klaviyo-canonical
```

Expected: PASS. These fence existing correct behaviour, so green immediately is the correct outcome — they are regression fences, not red-green cycles.

- [ ] **Step 3: Prove each fence actually bites**

Temporarily break each one and confirm the suite goes red, then revert. A fence that cannot fail is worse than no fence — it reads as coverage.

1. In `klaviyo-events.ts:736`, change `?? false` to `?? undefined`. Run — expect FAIL on "an omitted isRenewal must emit false". **Revert.**
2. In `finalizeShopOrder.ts:526`, rename the call to `trackShopPlacedOrderX(`. Run — expect FAIL on "must still call trackShopPlacedOrder". **Revert.**
3. In `klaviyo-revenue-service.ts`, delete the `is_renewal: false` line. Run — expect FAIL from Task 1. **Revert.**

- [ ] **Step 4: Confirm the file is back to its intended state**

```bash
git diff --stat
npm run test:klaviyo-canonical && npm run type-check
```

Expected: only the two test files and `klaviyo-revenue-service.ts` modified; suite green. **Do not commit.**

---

### Task 3: Phase 1 documentation — make the tracking docs true

Clears the `CUSTOMER.md` Stop-hook block for Tasks 1-2 and corrects the four doc claims Phase 1 falsifies.

**Files:**
- Modify: `docs/tracking/KLAVIYO_INTEGRATION.md:122`, `:124-129`, `:131`
- Modify: `docs/tracking/rules.md:163-167`
- Modify: `docs/tracking/testing.md:7`
- Modify: `BUSINESS.md:1064`
- Modify: `CUSTOMER.md` §8c (clarifying touch)

- [ ] **Step 1: Fix the "every Placed Order" claim**

`docs/tracking/KLAVIYO_INTEGRATION.md:122` currently says *"every `Placed Order` event carries an `is_renewal: boolean` property (built by createPlacedOrderEvent …)"*. That was false from 2026-08-27 until Task 1. Rewrite it to name **both** emitters — the package builder and `trackShopPlacedOrder` — and keep the sentence true going forward.

- [ ] **Step 2: Add the merchandise row to the order-type table**

The table at `:124-129` has four rows and no merch row. Add a fifth:

```markdown
| Merchandise (shop) | `false` | (omitted) |
```

- [ ] **Step 3: Correct the custom-metric instruction at `:131`**

It tells the reader to build a metric on `is_renewal EQUALS false` and call it a "new revenue only" report. Add the two verified caveats from the spec: the live metric is defined as `is_renewal = 0` (numeric), and **the Reporting API silently ignores custom conversion metrics** — the split is readable in the Klaviyo UI only. Cite the spec.

- [ ] **Step 4: Update the R9 shop key list**

`docs/tracking/rules.md:163-167` enumerates exactly what `trackShopPlacedOrder` sends. Add `is_renewal` to that list and state *why* it must always be present.

While here, note the **duplicate R9** (`:49` "No consent banner" and `:137` "Shop Purchase") in a one-line parenthetical so the next reader is not misled by an ambiguous cite. Do **not** renumber — that is unrelated churn.

- [ ] **Step 5: Update the test-suite inventory**

`docs/tracking/testing.md:7` enumerates every snapshot in `canonical-events-shape.test.ts` by name. Add the three new ones from Tasks 1-2 and, following the existing entry's style, state why each exists.

- [ ] **Step 6: Make the BUSINESS.md line honest**

`BUSINESS.md:1064` claims `Placed Order` events are tagged with `is_renewal` + `billing_reason`. Task 1 is what makes that true — so it belongs in this task, not Phase 2. Adjust the wording to reflect that merch carries `is_renewal` but no `billing_reason`.

- [ ] **Step 7: Touch CUSTOMER.md §8c**

Rule 5b's hook blocks on any `src/utils/integrations/klaviyo/**` edit. No customer-level fact changed — no new personal data leaves, and `is_renewal` is a property of the *order*, not the customer — so this is the sanctioned "one-line clarifying touch". Add a sentence to the existing "Two event-level data points added 2026-08-26" list in §8c noting that merchandise `Placed Order` events carry `is_renewal: false`, and that this is order metadata, not new personal information.

- [ ] **Step 8: Verify the hooks are satisfied**

```bash
npm run test:klaviyo-canonical && npm run type-check && npm run lint
```

Then end the turn and confirm the Stop hook does **not** report `STALE DOCS`, `STALE CUSTOMER DOC`, or `STALE BUSINESS DOCS`. **Do not commit.**

---

### Task 4: Delete the dead client-side `Placed Order` emitter

A third `Placed Order` builder with zero consumers. Its real defect is not the missing flag — a browser-side emit would **double-count** against the authoritative webhook event. Patching it with `is_renewal: false` would make a landmine look correct.

**Files:**
- Modify: `src/hooks/useKlaviyoTracking.ts` — delete `:113-137` (the `trackPurchase` `useCallback`), `:373` (return-object entry), and the `trackPurchase` lines in the JSDoc at `:52` and `:62`
- Modify: `src/docs/KLAVIYO_INTEGRATION.md:59` — remove `trackPurchase` from the hook's helper list
- Modify: `docs/tracking/KLAVIYO_INTEGRATION.md` — required to clear the Stop hook (see below)

- [ ] **Step 1: Re-confirm it is still dead before deleting**

```bash
grep -rn '= useKlaviyoTracking()' src/ --include=*.ts --include=*.tsx | grep -v 'hooks/useKlaviyoTracking.ts'
grep -rn 'trackPurchase' src/ --include=*.ts --include=*.tsx | grep -v 'usePixelTracking\|PixelTrackingExamples\|legacy-pixel-helpers\|lib/facebook.ts\|lib/gtm.ts'
```

Expected: 13 destructure sites, none taking `trackPurchase`; the second search returns only `useKlaviyoTracking.ts` itself. **If any consumer appears, stop and report** — the spec's decision was premised on it being dead.

- [ ] **Step 2: Delete the four regions**

Remove the `trackPurchase` `useCallback` body, its entry in the returned object, and the two JSDoc example lines. Leave `trackAddToCart`, `trackViewContent`, `trackRemoveFromCart`, `identify` and the rest untouched.

- [ ] **Step 3: Let the compiler prove nothing broke**

```bash
npm run type-check
npm run lint
```

Expected: clean. `tsc` is the real test here — any missed consumer is a compile error, since the property no longer exists on the returned object.

- [ ] **Step 4: Fix `src/docs/KLAVIYO_INTEGRATION.md:59`**

Remove `trackPurchase` from the hook's bullet list of helpers. **This is a different file** from `docs/tracking/KLAVIYO_INTEGRATION.md` — easy to conflate, and it does **not** satisfy the doc-sync hook.

- [ ] **Step 5: Satisfy the tracking-domain Stop hook**

`src/hooks/useKlaviyoTracking.ts` is a literal entry in the `tracking` domain's `paths`, so this turn **must** also edit a file under `docs/tracking/`. Discharge it with the `KLAVIYO_INTEGRATION.md:529` correction that Task 5 needs anyway: that line currently instructs the reader to set `KLAVIYO_CONVERSION_METRIC_ID` to the Marketing Revenue metric id. Add the verified finding that the Reporting API ignores it, so following the instruction achieves nothing.

Also note in the same file that the browser-side `Placed Order` helper was removed, and that Klaviyo `Placed Order` is emitted **server-side only** — so nobody re-adds a client emitter and double-counts.

- [ ] **Step 6: Verify**

```bash
npm run type-check && npm run lint && npm run test:klaviyo-canonical
```

Expected: all clean, Stop hook quiet. **Do not commit.**

---

### Task 5: Register the env var without breaking the env doctor

**Files:**
- Modify: `.env.example` (Klaviyo block, after line 106)
- Modify: `.env.local` (untracked, local values — and the **main folder's** copy per rule 9)
- Modify: `src/services/admin/klaviyo/klaviyoReporting.ts:93-107` (comment only)

- [ ] **Step 1: Record the baseline**

```bash
npm run check:env; echo "exit=$?"
```

Expected: `exit=0`. Note it — Step 3 must restore this exact state.

- [ ] **Step 2: Register in `.env.example`**

Add after the `KLAVIYO_ALLOW_DEV_PROFILE_WRITES` block, matching that entry's multi-line comment style:

```bash
# Klaviyo custom "Marketing Revenue" metric id (= Placed Order WHERE is_renewal = 0).
# CURRENTLY A NO-OP — LEAVE UNSET. Verified 2026-09-02 against the live account: the
# campaign-values-reports / flow-values-reports endpoints ACCEPT a custom metric id,
# return HTTP 200, and then return base "Placed Order" numbers anyway (92 campaigns,
# $188,451.81, identical to the cent). The aggregates endpoint rejects custom metrics
# outright. The renewals-excluded split is readable in the Klaviyo UI only.
# Kept as the seam for a future real event-metric id — see
# docs/superpowers/specs/2026-09-02-klaviyo-shop-is-renewal-design.md
KLAVIYO_CONVERSION_METRIC_ID=
```

- [ ] **Step 3: Add the matching empty line to `.env.local`, then re-check**

`check-env.mjs` reports **MISSING** for anything in `.env.example` that is absent from `.env.local` and exits 1. `varNames()` matches on the **name** only (`/^([A-Za-z_][A-Za-z0-9_]*)=/`), so an empty value counts as set — the same way `KLAVIYO_MODE=` already works.

Add to `.env.local` (this folder **and** the main folder's copy, per rule 9):

```bash
KLAVIYO_CONVERSION_METRIC_ID=
```

```bash
npm run check:env; echo "exit=$?"
```

Expected: `exit=0`, unchanged from Step 1. **If it now exits 1, do not add the var to `LOCAL_ONLY`** — that allowlist means "legitimately per-folder" (`PORT`, `E2E_*`) and reusing it here would fork the term. Re-check the `.env.local` line instead.

Vercel needs nothing: absent and empty are indistinguishable to `process.env.KLAVIYO_CONVERSION_METRIC_ID?.trim()`.

- [ ] **Step 4: Correct the code comment**

Rewrite the JSDoc above `resolveConversionMetricId` in `klaviyoReporting.ts` so it no longer reads as a working switch. State: the env branch is honoured by our code but the value is ignored by Klaviyo's Reporting API; verified 2026-09-02; the fallback to the standard "Placed Order" metric is what actually runs, and it **includes renewals**. Cite the spec. Change no logic.

- [ ] **Step 5: Verify**

```bash
npm run check:env && npm run type-check && npm run lint
```

Expected: exit 0, clean. **Do not commit.**

---

### Task 6: Stop the admin tab and the Norm brief overstating the number

**Files:**
- Modify: `src/components/admin/KlaviyoAnalyticsManagement.tsx:241`, `:246`
- Modify: `docs/internal-norm/norm-context.md:1244`
- Modify: `docs/admin/api.md:551`
- Modify: `docs/infrastructure/architecture.md:233` and `docs/infrastructure/README.md`

- [ ] **Step 1: Amend both card subtitles**

Both `SectionTitle` subtitles read `` `Klaviyo-attributed revenue · ${rangeLabel.toLowerCase()}` ``. That is true but incomplete — roughly two-thirds of the figure is automated renewals. Change both to say so, e.g.:

```tsx
subtitle={`Klaviyo-attributed revenue · incl. renewals · ${rangeLabel.toLowerCase()}`}
```

Keep both cards identical to each other. Admin-only surface, so rule 11 does not apply — but the words still have to be true.

- [ ] **Step 2: Correct the Norm brief**

`docs/internal-norm/norm-context.md:1244` currently states the revenue is *"(acquisition; renewals excluded)"* — the exact opposite of the verified finding, fed to an external AI as ground truth. Rewrite it to say the figure is Klaviyo-attributed `conversion_value` on the base `Placed Order` metric and **includes** automated renewals.

**Do not touch `:2863` or `:2970`.** Those also say "renewals excluded" and are **correct** — they describe the server-side advertising-analytics suite, which genuinely excludes renewals via `billingReason === "subscription_cycle"`. Only the Klaviyo line is wrong.

- [ ] **Step 3: Confirm no Norm lockstep work is needed**

The response *shape* is unchanged — this task edits a comment and prose only. `NormKlaviyoAnalyticsSchema` (`src/lib/internal-norm/schemas/klaviyo.ts:69`) and its un-exported row schemas are untouched, so `npm run build:norm-manifest` and `npm run norm:smoke` are **not** required.

Sanity-check that nothing in Task 5 or 6 changed the returned `metricId` field:

```bash
git diff src/services/admin/klaviyo/klaviyoReporting.ts | grep -E '^[+-]' | grep -v '^[+-][+-]' | grep -v '^\s*[+-]\s*\*'
```

Expected: no non-comment lines. If any appear, stop — the lockstep conclusion no longer holds and all four Norm steps are required.

- [ ] **Step 4: Add the caveat to the admin API doc**

`docs/admin/api.md:551` describes the conversion-metric resolution without saying the env branch is inert. Add one sentence: the custom metric id is ignored by Klaviyo's Reporting API, so this endpoint always returns renewal-inclusive revenue.

- [ ] **Step 5: Fix the stale env-var count**

`docs/infrastructure/architecture.md:233` says `.env.example` *"declares **97** vars today"*. It declared 120 before this branch and 121 after Task 5. Correct the number and add the new var to `docs/infrastructure/README.md` alongside the other per-var notes.

Verify the count you write:

```bash
grep -c '^[A-Z_][A-Z0-9_]*=' .env.example
```

- [ ] **Step 6: Full verification pass**

```bash
npm run type-check && npm run lint && npm run test:klaviyo-canonical && npm run test:klaviyo-fold && npm run check:env
```

Expected: all green, `check:env` exit 0.

- [ ] **Step 7: Review the complete diff, then STOP**

```bash
git status && git diff --stat
```

Confirm every modified file is one this plan names, and nothing under `src/app/api/**` or any Stripe/billing path was touched. Then **report to DJ and ask before committing** — commits are not authorized (Global Constraints).

---

## Self-review

**Spec coverage** — every spec section maps to a task:

| Spec section | Task |
|---|---|
| §4.1 shop emitter | 1 |
| §4.2 dead client emitter | 4 |
| §4.3 env branch + `check:env` trap | 5 |
| §4.4 admin annotation | 6 |
| §5 rows 1-3 (emitter, test, call site) | 1, 2 |
| §5 rows 4-5 (`KLAVIYO_INTEGRATION.md`, `rules.md`) | 3 |
| §5 row 6 (`norm-context.md`) | 6 |
| §5 rows 7-9 (`.env`, `CUSTOMER.md`, tracking doc) | 5, 3, 4 |
| §6 all assertions incl. both gotchas | 1, 2 |
| §7 Phase 1 / Phase 2 | 1-3 / 4-6 |
| §8 rollback (no kill switch), Norm lockstep | 6 step 3 |

**Deliberate omissions**, both spec non-goals: `Placed Non-Recurring Order` (§2) and the merch-refund gap (§4.5, §9) — neither has a task, by design.

**Placeholders:** none. Every code step carries real code; every doc step names the file, line and the specific claim to change.

**Type consistency:** `trackShopPlacedOrder` params match `klaviyo-revenue-service.ts:174-189`. `createPlacedOrderEvent`'s `orderData` matches `klaviyo-events.ts:665-690` (`packageType` is a union, hence `as const`). `KlaviyoEvent` / `KlaviyoEventProperties` come from `@/types/klaviyo`. `fakeUser()` already exists at `:253`.

**Ordering:** Task 3 must land in the same turn as Tasks 1-2 (`CUSTOMER.md` hook); Task 4's `docs/tracking/` edit must land in its own turn (tracking-domain hook). Tasks 5 and 6 are independent of each other.
