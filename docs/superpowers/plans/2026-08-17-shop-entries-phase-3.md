# Shop entries — Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A merchandise purchase credits its stated free entries to the buyer's Major Draw total — exactly once, at the same promo multiplier one-time packs get, reversible on a full refund.

**Architecture:** Reuse the canonical grant chain (`processPaymentBenefits` → `grantBenefits` → `addToMajorDraw`) with a new `packageType: "shop"` and a new draw source bucket `entriesBySource.shop`. Nothing new is built for the multiplier: the grant calls the webhook file's existing `getActivePromoMultiplier("one-time")`, the page calls the existing `useResolvedMultiplier("one-time-packages")`, and both resolve through the same server chain.

**Tech Stack:** Next.js 15 App Router · Mongoose 8 · Stripe webhooks · `tsx` test scripts (no jest/vitest)

**Spec:** [2026-08-17-shop-entries-design.md](../specs/2026-08-17-shop-entries-design.md)

## Global Constraints

- **LEGAL (CLAUDE.md rule 11).** Entries are never sold. Product copy says "includes N free entries", never "$X per entry", "N entries · $X", or any dollar-to-entry rate. Banned words: odds, chance(s) of winning, lottery, lotto, raffle, sweepstake, gamble, bet.
- **Ships dark.** Every product stays at `includedEntries: 0` until the permit answer lands. The code is live; the promise is not made.
- **Mongoose strict mode silently drops unknown schema keys.** Every new source key must reach the schema *and* the TS interface, or entries vanish with no error.
- **`tsc` protects declarations, not consumers.** Widening a union produces no error at an `if/else if` chain that lacks the new case — a shop payment silently falls through. Every consumer is a deliberate decision, listed per task.
- **Grant multiplier is resolved server-side at fulfilment.** The client's rendered number is display only and is never an input to a grant.
- No new promo type. `"shop-packages"` is explicitly rejected — that union is closed at three members across 34 files, four Mongoose enums and two Norm Zod schemas.

## Verified starting state

Every line number below was re-verified against the working tree on 2026-08-17, after the spec was written. **Four spec claims were wrong** and are corrected here:

| Spec said | Actually |
|---|---|
| `src/utils/draws/major-draw-queries.ts` | **Path does not exist.** Real file `src/utils/database/queries/major-draw-queries.ts`. Lines 144/278 correct. |
| `packageType` closed in 6 sites | **9 sites** in the two named files. 3 were missed, incl. a Mongoose enum's TS twin. |
| A source key missing from the refund cast list falls back to the legacy walk | **False.** The casts are compile-time `as` on a `string` field, erased at runtime. The `else` fires on an absent ledger, nothing else. |
| A hook returns a multiplied entry count for reuse | **No such hook.** `useResolvedMultiplier` returns a bare multiplier; every surface multiplies locally. |

Two facts that make this cheaper than the spec assumed:

- `getActivePromoMultiplier(type)` at `src/services/stripe-webhook-handlers/index.ts:311-322` already wraps the resolver with `?? 1` and `catch → 1`. The shop branch calls it. No new multiplier code.
- All three shop routes already carry `export const dynamic = "force-dynamic"`, so a promo-sensitive count cannot be frozen into static HTML.

One fact that makes it more honest work than the spec assumed:

- `src/services/stripe-webhook-handlers/index.ts:853-862` currently reads *"Shop orders grant NO entries and deliberately do not touch processPaymentBenefits — merchandise entries are a separate, permit-gated feature."* **This plan reverses that decision.** That comment is replaced, not deleted silently.

---

### Task 1: Add the `shop` bucket to the draw document

Nothing can be granted until the schema accepts the key. Doing this first means every later task fails loudly rather than silently dropping writes.

**Files:**
- Modify: `src/models/MajorDraw.ts` (TS interface ~L50-61, Mongoose sub-schema ~L213-271)
- Test: `src/utils/payment/__tests__/shop-entry-grant.test.ts` (new)

**Interfaces:**
- Produces: `entriesBySource.shop: number` on every `MajorDraw.entries[]` row.

- [ ] **Step 1: Write the failing test**

New file `src/utils/payment/__tests__/shop-entry-grant.test.ts`. Follow the existing tsx-test shape in `src/services/subscription/__tests__/`. First assertion — the schema accepts and *persists* the key, read back from Mongo rather than from the in-memory doc, because strict mode drops on write, not on assignment:

```ts
const draw = await MajorDraw.create({ /* minimal valid draw */ });
draw.entries.push({
  userId: new mongoose.Types.ObjectId(),
  totalEntries: 5,
  entriesBySource: { ...zeroed, shop: 5 },
  firstAddedDate: new Date(),
  lastUpdatedDate: new Date(),
});
await draw.save();

const reread = await MajorDraw.findById(draw._id).lean();
assert.equal(reread!.entries[0].entriesBySource.shop, 5, "shop key was dropped by strict mode");
```

- [ ] **Step 2: Run it and watch it fail**

Add `"test:shop-entries": "tsx src/utils/payment/__tests__/shop-entry-grant.test.ts"` to `package.json`.
Run: `npm run test:shop-entries`
Expected: FAIL — `shop` reads back `undefined`.

- [ ] **Step 3: Add the key in both places**

`src/models/MajorDraw.ts` TS interface (~L50-61) gains `shop: number;`. The Mongoose sub-schema (~L213-271) gains, after the `streak` block:

```ts
          // Merchandise purchases. Entries are a free inclusion with the garment,
          // never sold — see CLAUDE.md rule 11.
          shop: {
            type: Number,
            default: 0,
            min: 0,
          },
```

The file's own comments at L244-248 and L254-257 document this exact bug hitting twice before. Read them before editing.

- [ ] **Step 4: Run it and watch it pass**

Run: `npm run test:shop-entries` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/models/MajorDraw.ts src/utils/payment/__tests__/shop-entry-grant.test.ts package.json
git commit -m "feat(shop): add the shop entry bucket to the draw document"
```

---

### Task 2: Thread `shop` through every draw-source site

The schema now accepts the key; these are the places that must produce, sum, and reverse it. Every row here is a **silent** failure — none of it is caught by `tsc`.

**Files:**
- Modify: `src/utils/payment/payment-processing.ts` (source union L2192-2198; zero-init L2254-2264; second pair L2459-2466)
- Modify: `src/utils/draws/remove-draw-entries.ts` (`MajorDrawSourceType` L19-27)
- Modify: `src/utils/database/queries/major-draw-queries.ts` (**both** hardcoded sums, L144 and L278)
- Modify: `src/services/redeemables/DrawGrantService.ts` (fresh-row literal L52-62 — the zero shape, *not* the union at L5)
- Modify: `src/services/admin/MajorDrawService.ts` (typed record L554-556, zero-init L595-597)
- Modify: `src/utils/draws/reconcile-major-draw-entries.ts` (zero-init L171)
- Modify: `src/lib/internal-norm/schemas/major-draw.ts` (Zod per-key L157-159)
- Test: `src/utils/payment/__tests__/shop-entry-grant.test.ts`

**Interfaces:**
- Consumes: `entriesBySource.shop` from Task 1.
- Produces: `"shop"` as a legal `MajorDrawSourceType`; `shop` summed into the dashboard total.

- [ ] **Step 1: Write the failing tests — one per silent row**

```ts
// Row 5 — the total must agree with its own breakdown.
// Without this, the user sees a total larger than membership+oneTime+streak.
const stats = await getUserMajorDrawStats(userId);
assert.equal(stats.oneTimeEntries, 5, "shop entries missing from the dashboard sum");

// Row 2 — a user with NO prior row in this draw. The $push path has its own
// zero-shape; the first shop buyer is the one who breaks.
assert.equal(freshRow.entriesBySource.shop, 5);

// Row 4 — the removal path must recognise the source or a refund no-ops.
await removeMajorDrawEntries(userId, 5, "shop", drawId);
assert.equal((await reread()).entriesBySource.shop, 0);
```

- [ ] **Step 2: Run and watch them fail**

Run: `npm run test:shop-entries` → three new failures.

- [ ] **Step 3: Make the edits**

Two mechanical traps, both verified:

1. **`major-draw-queries.ts` L141-154 and L275-288 are byte-identical** (confirmed by `diff`, no output). A single exact-match edit **fails as non-unique**. Use `replace_all: true` — correct here, both sites need the identical change. Add `(userEntry.entriesBySource["shop"] || 0) +` to the `oneTimeEntries` chain at both.
2. **`MajorDrawSourceType` at `remove-draw-entries.ts:19` is not exported** — zero importers, module-local. There is a **duplicated inline copy** of the union in `payment-processing.ts:2192-2198`. Both must move together; nothing links them.

`DrawGrantService.ts`: add `shop: 0,` to the **fresh-row literal only** (L52-62). Leave `DrawGrantSourceKey` (L5) at two members — this service does not grant shop entries, and widening it would advertise a path that does not exist.

`src/lib/internal-norm/schemas/major-draw.ts`: per CLAUDE.md rule 10 a schema↔output mismatch is a **runtime 500 that `tsc` cannot catch**.

- [ ] **Step 4: Run everything**

```bash
npm run test:shop-entries    # PASS
npm run type-check
npm run norm:smoke           # proves the Norm Zod projection still matches
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(shop): thread the shop entry source through grant, sum and removal"
```

---

### Task 3: Make `shop` a legal `packageType`, and decide every consumer

The union is genuinely closed, so `tsc` finds each **declaration**. It finds **none** of the consumers. The consumer decisions are the substance of this task; the declarations are typing.

**Files:**
- Modify: `src/utils/payment/payment-processing.ts` — declarations L138, L187, L288, L821, L953, L1086, L1695
- Modify: `src/models/PaymentEvent.ts` — TS interface L16 **and** Mongoose enum L76
- Test: `src/utils/payment/__tests__/shop-entry-grant.test.ts`

**Interfaces:**
- Produces: `packageType: "shop"` accepted by `processPaymentBenefits` and persistable on a `PaymentEvent`.

- [ ] **Step 1: Write the failing test**

The enum is the one that fails at runtime, invisibly to `type-check`:

```ts
// Editing the TS interface without the Mongoose enum is the WORSE half-edit:
// tsc goes green and the write throws a ValidationError in production.
await PaymentEvent.create({ ...valid, packageType: "shop" });
// then assert it reads back
```

- [ ] **Step 2: Run and watch it fail**

Expected: Mongoose `ValidationError: packageType: 'shop' is not a valid enum value`.

- [ ] **Step 3: Widen the declarations**

**Uniqueness trap, verified:** the 6-line `packageData: { packageType … price: number; }` block at L186-193, L287-294, L1085-1092 and L1694-1701 is **byte-identical across all four**. An exact-match edit on the block alone fails as non-unique. Anchor each on its enclosing signature line: `export async function processPaymentBenefits(`, `async function processPaymentBenefitsInternal(`, `async function grantBenefits(`, `function trackKlaviyoEvent(`.

- [ ] **Step 4: Decide each consumer — the real work**

`tsc` will flag none of these. Walk all six and write the branch explicitly:

| Consumer | Decision |
|---|---|
| `checkAndApplyBonusEntryPromo` L821 | **Early-out `return 0`.** Widening L821 makes the existing `packageType as "membership" \| "one-time" \| "mini-draw"` cast at L835 unsound. Mirror the existing upsell early-out at L850. Do **not** widen the narrower unions at L828/L835 — that is the promo-lookup vocabulary, a deliberately different domain. |
| `checkAndApplyPromoLink` L953 | Early-out. A promo link's package multiplier does not describe a t-shirt. |
| `trackKlaviyoEvent` L1695 → switch L1719 | Add an explicit `case "shop"`. Falling through the switch means a merch purchase is invisible to marketing — wrong, but silently so. |
| `partnerDiscountQueue` L138 | **Do not grant.** A t-shirt confers no partner-discount access. Widening L138 is typing only; assert no queue row is written. |
| `AffiliateCommission` | Out of scope, flagged in §9. `purchaseType` is a *different* union — leave it. |
| The ~6 unguarded `if/else if` chains (L1146-1152, L1163-1167, L1234-1237, L1351-1354, L1613-1645) | Read each. Falling through is correct where the branch grants a *package* benefit; a t-shirt has none. Assert the fall-through rather than assuming it. |

Do **not** widen the ~36 same-shaped unions elsewhere in `src/` (Klaviyo helpers, partner-discount queue UI, admin types). They are separate vocabularies a shop payment never reaches. Widening them would advertise paths that do not exist.

- [ ] **Step 5: Run and commit**

```bash
npm run test:shop-entries && npm run type-check && npm run lint
git add -A
git commit -m "feat(shop): accept shop as a packageType, with every consumer decided explicitly"
```

---

### Task 3b: The eleven landmines routing shop through `processPaymentBenefits` arms

**This task did not exist when the plan was written.** An adversarial sweep of the grant path found
fifteen ways this change breaks that a threading checklist cannot see. Four were already fixed in
Task 3 (the `PaymentEvent` enum, the refund ternary, Klaviyo, CAPI). These eleven remain, and
**every one of them is a pre-existing landmine that only detonates once a shop payment flows
through this function.** None is caught by `tsc`.

They are the honest price of reusing the canonical grant chain. Re-implementing atomic credit +
ledger + idempotency instead would create a fifth copy of `addToMajorDraw` — the spec rejected
that for good reason, and these guards are individually small. But the price is real and it is
higher than the spec assumed.

| # | Site | What breaks | Fix |
|---|---|---|---|
| 1 | `stripe-webhook-handlers/index.ts:404` | `isPaymentProcessed` short-circuits **before** the shop branch at :853. Today shop writes no `PaymentEvent`, so a redelivery still re-runs `finalizeShopOrder` (idempotent). Once we write a `BenefitsGranted` row, a retry returns "already processed" and **`finalizeShopOrder` never runs again** — if the first delivery granted entries then died before stock or cart-clear, the retry reports success | Order the shop branch so the order is finalised before the grant is recorded, and keep `finalizeShopOrder` reachable on retry |
| 2 | `finalizeShopOrder.ts:77` | Granting after `markPaid` but before the stock check means the auto-refund path **refunds in full while entries stay granted**. Reversal cannot save it: `processRefundReversal` fails closed if the `BenefitsGranted` row is not yet committed, and that error is only `console.error`'d while the queue marks the event succeeded | **Gate the grant on `status === "fulfilled"`**, not on `markPaid` |
| 3 | `payment-processing.ts:731` | `checkAndIssueMilestones(allowStreakIssuance: true)` runs for every packageType. Streak rungs are payment-coupled to a **paid membership invoice** precisely to stop issuance from a stale `streakMonths`. A t-shirt opens that gate: an ex-member with `streakMonths: 6` buys merch and is issued free entries for months they paid nothing | Pass `allowStreakIssuance: false` for shop |
| 4 | `lib/referral.ts:160` | `validateReferralCode` treats `processedPayments.length > 0` as "already purchased". `payment-processing.ts:666` `$addToSet`s every PI, so **buying a t-shirt permanently locks the customer out of redeeming a referral code** on their later first membership | Exclude shop PIs, or filter the check by packageType |
| 5 | `stripe-webhook-handlers/index.ts:1311` | Same root cause: the first-purchase referral reward is gated on `processedPaymentsCount === 1`. A merch-first customer reaches their real membership at count 2, so **the referrer is never rewarded** | Same fix as #4 — one decision closes both |
| 6 | `payment-processing.ts:342` | `checkMajorDrawActiveForNewPurchases` runs first and returns `GATES_CLOSED` during a freeze/gap. Membership and pack checkout are gated up-front; **shop checkout deliberately is not, and must not be**. So merch sold during a freeze takes the money, fulfils, and grants nothing — no rollback, no retry | Exempt shop from the gate; `getTargetMajorDraw()` already routes to the next queued draw |
| 7 | `admin/dashboard-stats/revenueAggregator.ts:95` | `newRevenue += price` and `conversions += 1` run for every non-renewal grant "regardless of bucket", while `classifyRevenueBucket` returns `null` for an unknown packageType and drops the row from `total`. Merch money — **including shipping and GST, which no other packageType carries** — inflates per-platform revenue and TRUE ROAS while being absent from the headline. The breakdown silently stops reconciling | Classify shop explicitly, or exclude it from both |
| 8 | `payment-event-net-queries.ts:60` | `aggregateNetRevenueSum` / `aggregateNetSalesCount` sum `data.price` across all `BenefitsGranted` rows with no packageType filter. Every net-revenue consumer starts counting t-shirt revenue gross of shipping and GST, unseparable after the fact | Filter by packageType |
| 9 | `refund-processing.ts:162` | Partial refunds record `RefundPartial` and reverse **nothing**. Every existing packageType is one indivisible price so this is rare; **a shop order is multi-line and partial refunds are routine** (one item returned, damaged, shipping refunded). A buyer who returns 1 of 3 shirts keeps 100% of the entries permanently, and the row is invisible to `excludeRefundedBenefitsGrantedStages` so the revenue still counts | Revisit the spec's "entries stay on partial refund" decision — it was made assuming rarity |
| 10 | `stripe-webhook-handlers/index.ts:675` | When the user cannot be resolved the handler returns `undefined`, and `dispatchStripeEvent` computes `shouldMarkAsProcessed = (result !== false)` — so **`undefined` marks the event permanently processed and it is never retried**. Shop is the only payment type whose metadata carries no `userEmail`, so both fallbacks are unavailable. If `stripeCustomerId` does not match at webhook time, order and entries are both lost silently | Add `userEmail` to shop PI metadata; return `false` rather than `undefined` |
| 11 | `payment-processing.ts:754` | The failure path has **every `console.error` commented out**; the only write is `fs.appendFileSync` to a path that is read-only on Vercel, so the surviving log line is "Failed to write to log file". **Every failure above is undiagnosable in production** | Restore real logging on this path before any of the above ships |

**Do #11 first.** Without it, none of the other ten can be confirmed fixed in production.

### Status — fixed 2026-08-17

| # | Status | What was done |
|---|---|---|
| 11 | **Fixed** | Real `console.error` restored with the full failure context. The `fs.appendFileSync` was **deleted rather than repaired** — it never worked in the environment that matters and was actively masking the real error. `fs`/`path` imports dropped with it |
| 3 | **Fixed** | `allowStreakIssuance: packageData.packageType !== "shop"`. The invariant is coupled to a paid **membership** month, not to any payment |
| 4 + 5 | **Fixed, one change** | Shop PIs are no longer appended to `processedPayments`. Verified this costs no idempotency: `isPaymentProcessed()` reads `PaymentEvent` `BenefitsGranted-{pi}` (`payment-processing.ts:2722`), not this array, and shop has its own gate in `markPaid` |
| 6 | **Fixed** | Merch exempted from `checkMajorDrawActiveForNewPurchases`, alongside renewals. Every other gated path is also blocked up-front at checkout; shop is not and must not be |
| 7 | **Fixed** | Shop rows `continue` out of `revenueAggregator` before any accumulation. This one was a **defect regardless of the business answer** — platform revenue accrued "regardless of bucket classification" while the row was dropped from `total`, so the breakdown stopped reconciling with the headline above it |
| 1, 2, 10 | **Open — belong to Task 4** | All three are about the *ordering* of the grant relative to `markPaid` / stock / the webhook short-circuit. They cannot be fixed before the grant exists |
| 8, 9 | **Open — your decision, not mine** | See below |

### Two questions that are business calls, deliberately not decided in code

**#8 — should merchandise count as "net revenue"?** `aggregateNetRevenueSum` / `aggregateNetSalesCount`
feed A/B experiment revenue and daily user metrics. Unlike #7 there is no internal inconsistency
here — nothing stops reconciling either way. It is genuinely "is a t-shirt part of the number we
optimise the funnel on?". Left untouched. Note merch price carries shipping and GST, which no
package price does. Recoverable either way: `packageType` is stored on the row, so history can be
re-split after the fact.

**#9 — partial refunds.** The spec decided "entries stay", correctly, for indivisible packages.
A shop order is multi-line, so a customer returning one shirt of three keeps all the entries from
all three — and the `RefundPartial` row is invisible to `excludeRefundedBenefitsGrantedStages`, so
the refunded money keeps counting as revenue too. This is on the client-facing docket, not just
here.

---

### Task 4: Grant the entries from the shop webhook

**Files:**
- Modify: `src/services/stripe-webhook-handlers/index.ts` (the shop branch, L853-862)
- Modify: `src/services/shop/finalizeShopOrder.ts` (insert the grant before the cart clear, ~L100)
- Modify: `src/models/Order.ts` (record `entriesGranted`)
- Test: `src/utils/payment/__tests__/shop-entry-grant.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: `Order.entriesGranted: number` — what was actually credited, for support and reconciliation.

- [ ] **Step 1: Write the failing tests**

The money assertions, all at the database level:

```ts
// Multiplier inherited, not invented: 2 base × 3 qty × 5 promo = 30
// Replay grants exactly once — markPaid's status:"pending" filter is the gate
// A declined payment grants nothing
// An SA/ACT buyer IS granted entries — exclusion happens at winner selection
// A resolver throw still grants the BASE count and does not fail the webhook
// includedEntries: 0 grants nothing even at 5x  (the kill switch)
```

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement**

Replace the comment at `index.ts:854-858` — it asserts the opposite of what now happens.

Order of operations inside `finalizeShopOrder`, verified against the current file (117 lines): `markPaid` (L50, the idempotency gate — a redelivery returns before anything below) → `decrementStock` (L66) → **grant here** → clear cart (L103). Grant *after* stock so a customer who cannot be supplied and is auto-refunded never receives entries in the first place.

```ts
const multiplier = await getActivePromoMultiplier("one-time");
const base = order.products.reduce((n, p) => n + (p.includedEntries ?? 0) * p.quantity, 0);
const entries = base * multiplier;
```

**No eligibility check here — deliberately.** Do not call `isGiveawayIneligible`. Entries are granted to every buyer; SA/ACT exclusion is applied by the Major Draw export before a winner is picked (`src/app/api/admin/major-draw/export/route.ts:120-131`), which is where every other entry source is filtered too. A point-of-sale skip would be a second, weaker copy of a working filter, and would silently withhold entries from anyone whose state or birthdate is merely missing.

Wrap the grant so it cannot fail the webhook: money is already taken, and `addToMajorDraw` already logs an `ErrorReport` without rethrowing so the reconcile cron can heal it.

- [ ] **Step 4: Run**

```bash
npm run test:shop-entries && npm run type-check
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(shop): grant free entries on a paid merch order, at the one-time multiplier"
```

---

### Task 5: Show the entry count on the product page

**Files:**
- Modify: `src/app/(site)/shop/[slug]/page.tsx` and/or `components/ProductInteractions.tsx`
- Modify: `e2e/specs/marketing/legal-copy.spec.ts` (add `/shop` to `PAGES`, L32-37)
- Test: `e2e/specs/shop/` — extend the existing checkout spec

- [ ] **Step 1: Write the failing e2e assertion**

The only assertion that catches the display trap is the one comparing the two numbers:

```ts
// With a promo active, the number the page renders must equal the number granted.
// Assert against ONE resolver result, not two independently-computed values.
```

- [ ] **Step 2: Run and watch it fail**

- [ ] **Step 3: Implement**

`useResolvedMultiplier("one-time-packages")` — the existing hook, no new plumbing. Do **not** "fix" its dead `_context` parameter; the body ignores it and already reads the payment chain.

Two landmines: `applyPromoToPackage` (`src/data/membershipPackages.ts:404-423`) reads exactly like the shared helper this wants and has **zero callers** — do not wire money math to it. And `resolveMultiplierForDisplay` is a genuine trap if called server-side: it stops at active-promo → alternating and never reaches the derived-from-membership branch.

Copy, per rule 11: **"Includes 5 free entries into this month's prize draw"**. Never a rate. Render nothing at all when `includedEntries` is 0, so the dark-ship state makes no promise.

- [ ] **Step 4: Run**

```bash
npx playwright test e2e/specs/shop --project=chromium-desktop
npx playwright test e2e/specs/marketing/legal-copy.spec.ts
```

- [ ] **Step 5: Commit**

---

### Task 6: Terms, competition terms, Cobber, docs

**Files:**
- Modify: `src/app/(site)/terms/page.tsx` (§3 entry methods, §5.2 L215, §17 acknowledgement)
- Modify: `src/app/(site)/competition-term-majordraw/page.tsx` (§4)
- Modify: `src/data/supportChatFaqs.ts` + `src/data/__tests__/faqs.test.ts` (count assertion)
- Modify: `BUSINESS.md`, `CUSTOMER.md`, `docs/draws/`, `docs/cart-shop-products/`

- [ ] **Step 1: Fix the pre-existing rule-11 violation**

`terms/page.tsx:215` reads *"a capped entry threshold based solely on Mini Pack **entries sold**"*. Entries are never sold. The threshold genuinely *is* an entry count, so preserve the meaning: *"based solely on the free entries included with Mini Pack purchases"*. **This predates the shop work** — flag it to DJ for his lawyer rather than burying it in this commit.

- [ ] **Step 2: Add merchandise as a fourth entry method**

`/terms` §3 and §17 and `/competition-term-majordraw` §4 enumerate exactly three entry sources as closed lists, and §17 asks customers to *acknowledge* it. All three need merchandise, plus the returns-and-entries rule (a partial refund leaves entries granted).

- [ ] **Step 3: Cobber**

Per rule 5c, Cobber must describe what is **live**. The corpus currently asserts the shop is "coming soon". Land the FAQ entries in this branch; they go live with the permit flip, not before.

Run `npm run build:chat-knowledge-pack` and `npm run test:chat-faqs` (bump the pinned corpus count deliberately).

- [ ] **Step 4: Commit**

---

## Open dependencies

| Item | Owner | Asked | Blocks |
|---|---|---|---|
| **Permit / notification variation** for a fourth entry method | DJ + promotions lawyer | 2026-08-17 | The **launch**, not the build. Tasks 1-6 ship dark at `includedEntries: 0`. |
| Entry counts per SKU (spec proposes Tee 5, Jacket 8) | DJ | 2026-08-17 | Seeding + copy, not code |
| Terms wording review, incl. the §5.2 fix | DJ + lawyer | 2026-08-17 | Launch |
| Should a merch sale pay affiliate commission? | DJ | 2026-08-17 | Nothing — deliberately out of scope, flagged not skipped |
