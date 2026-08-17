# Admin — Receipts

The revenue ledger: one row per payment received, newest first, across every source —
memberships, one-time and additional packs, mini draws, upsells, and shop orders — joined to
the customer who paid and to Stripe. Billing-group tab, added 2026-08-17.

| Piece | File |
|---|---|
| Tab | `src/app/admin/component/ReceiptsManagement.tsx` |
| Hook | `src/hooks/queries/admin/useReceipts.ts` |
| Route | `src/app/api/admin/receipts/route.ts` |
| Service (data access) | `src/services/admin/receipts.ts` |
| Pure half (client-safe) | `src/utils/admin/receipts.ts` |
| Stripe links | `src/utils/billing/stripeDashboardUrl.ts` |
| Test | `src/services/admin/__tests__/receipts.test.ts` (`npm run test:receipts`) |
| Reconciliation | `scripts/verify-receipts-reconciliation.ts` (`npm run verify:receipts-reconciliation[:prod]`) |
| Permission backfill | `scripts/migrations/2026-08-17-backfill-receipts-view.ts` |

## Why the name is "Receipts"

**Coined deliberately.** `src/app/api/admin/invoices/` already exists and means something
else: past-due **charging actions** (`charge-past-due`, `recover-past-due`,
`recover-stranded`), not a listing. Adding a list endpoint under `invoices/` would fork the
meaning of that folder, so the ledger got its own noun — used consistently for the tab id,
the label, the route, the service, and the permission area.

## The two-file split

`src/utils/admin/receipts.ts` holds everything pure: the category vocabulary and labels, the
classifier, the refund rule, the row DTOs, and the CSV writer.
`src/services/admin/receipts.ts` holds the Mongo access.

The split exists because the tab is a **client component**. Importing the service from client
code would pull `mongoose` — a `serverExternalPackage` — into the browser bundle. The
`no-models-in-client` lint rule only catches *direct* `@/models/**` imports, so it would not
have caught this; the boundary is maintained by hand. The hook and the component import from
`@/utils/admin/receipts` only.

## How it differs from the dashboard's revenue slices

Two deliberate divergences. Both are the reason this is its own service rather than a reuse
of `getRevenueDetails`.

**1. Refunds are shown, not dropped.** `fetchNetBenefitsGrantedWithMatch`
(`src/utils/payment/payment-event-net-queries.ts`) excludes refunded rows outright, because
the dashboard wants net revenue. A ledger has to show them. So Receipts queries
`PaymentEvent` for `eventType: "BenefitsGranted"` directly and joins refunds back on
`paymentIntentId`. Each row carries gross, refunded, and net; the header total is net of
refunds and is **labelled** "Net of refunds" in the UI so nobody reads it as gross.

**2. Renewals are included.** `classifyAcquisitionCategory`
(`src/services/admin/platformRevenueBreakdown.ts`) returns `null` for renewals because the
dashboard excludes them from *acquisition* revenue. `classifyReceiptCategory` maps that same
case to `"membership-renewal"` instead. Everything else is identical.

That second difference is the **entire expected delta** when reconciling against the
dashboard, and `receipts.test.ts` pins it with a lockstep test that walks every packageType
through both classifiers and asserts they agree except on renewals.

## Categories

`ReceiptCategory = RevenueDetailsCategory | "shop-order"` — an **extension**, not a widening
of `RevenueDetailsCategory` itself. `getRevenueDetails` and `classifyRevenueBucket` switch
exhaustively on that type, so adding `"shop-order"` to it would drag the dashboard's revenue
maths into this feature.

⚠️ Renewals are identified by `data.billingReason === "subscription_cycle"`, **not** by the
`isRenewal` boolean on the model. Same basis as `platformRevenueBreakdown.ts`. Classifying
off `isRenewal` makes these numbers stop agreeing with the dashboard.
`packageId.startsWith("additional-")` is what separates `additional-one-time` from
`one-time-purchase`.

The unfiltered query pins `packageType` to the model enum (`$in: [membership, one-time,
mini-draw, upsell]`) so "rows the query returns" and "rows the classifier can label" are the
same set by construction — the totals can never drift from the listed rows. A future
`packageType` would be excluded from both, visibly, rather than silently mis-bucketed.

## The refund rule

`deriveReceiptRefund(amount, paymentIntentId, refundIndex)` is the **single** definition,
used for the listed rows *and* the filter totals, so the summary card cannot disagree with
the table beneath it.

⚠️ **Units.** `data.price` on a `BenefitsGranted` row is in **dollars**;
`data.refundAmount` on a refund row is in **cents** (straight from Stripe). Never sum them
without the `/100`.

| Case | Result |
|---|---|
| No refund | net = gross |
| `RefundProcessed` (full) | refunded = gross, **net = $0** |
| `RefundPartial` (`status: "partial-skipped"`) | refunded = `refundAmount / 100`, net = gross − that, floored at 0 |

Netting a fully-refunded row to $0 is the *same arithmetic* the dashboard performs when it
drops the row entirely — that equivalence is what makes the reconciliation exact. A full
refund outranks a partial one for the same payment (the whole grant is already reversed).

The refund index is loaded whole rather than date-scoped, because a refund can land long
after the payment. It stays cheap: **198 refunds against 36,795 payments** in production
(2026-08-17), with **0** `RefundPartial` rows. If that ratio changes materially, add an index
on `{ eventType: 1 }` — the read currently filters on a non-prefix field.

## Query shape

One `$facet` pipeline gives rows, totals, and the refunded subset in a single round trip:

```
$match (date + category)  →  $project (normalise)
   [ $unionWith orders — only when no category filter ]
→ $sort { timestamp: -1, _id: -1 }        (_id breaks ties so paging is stable)
→ $facet {
     rows:     [ $skip, $limit ],
     totals:   [ $group gross + count ],
     refunded: [ $match paymentIntentId ∈ refundIndex, $project ],
   }
```

Skip/limit stay in the database, so paging does not scale with table size. The `refunded`
branch returns at most a few hundred documents. Shop-only reads from `orders` directly, since
`$unionWith` needs a base collection.

Customer hydration uses an explicit `.select("firstName lastName email stripeCustomerId")`
include-list — an unprojected `.find()` on `User` once shipped MB-scale `entries[]` arrays to
the client (2026-07 perf audit). Never widen it.

## Shop orders — expect zero rows

`Order` is mapped in, and returns **0 rows** today (verified against production 2026-08-17).
BUSINESS.md records the shop as scaffolded; the page renders "Coming Soon". The mapping is
here so Receipts works on launch day rather than needing a rework — **an empty Shop-order
filter is not a bug to chase**, and the empty state says so in as many words.

Unioning `Order` with `PaymentEvent` carries **no double-counting risk**: `Order.tickets[]`
and `Order.membership` are vestigial, because `createOrderSchema`
(`src/app/api/orders/route.ts`) accepts only `products` / `shippingAddress` /
`paymentIntentId`, and that route is the only writer of `Order` in the codebase. So an Order
is always a shop-product order.

`cancelled` orders are excluded — a voided sale is not money received. Every other status
(pending → completed) reflects a captured payment.

## Stripe links

Built **server-side** and shipped in the payload. Live-vs-test is only inferrable from the
`STRIPE_SECRET_KEY` prefix, which is a server secret the browser cannot read. Do not rebuild
the URL client-side, and do not add a `NEXT_PUBLIC_STRIPE_MODE` var to work around it.

⚠️ `paymentIntentId` is **polymorphic** — a real PaymentIntent (`pi_…`) for one-off payments,
a *prefixed invoice id* (`invoice_in_…`) for subscription renewals. One field, two Stripe
object types. `stripeDashboardUrl` branches on the prefix and strips the `invoice_` storage
prefix before linking. An unrecognised prefix returns `null` rather than a guessed path — a
wrong link in a revenue ledger reads to an operator as a missing record.

See [billing-stripe/patterns.md](../billing-stripe/patterns.md#stripe-dashboard-deep-links).

## Permissions

New area: `receipts: ["view", "export"]`.

- `receipts.view` gates the tab (`adminTabs.ts`) and the list route.
- `receipts.export` additionally gates `?format=csv`.

It does **not** reuse the `settings.view` that the other Billing-group tabs share, because
this surface is the complete revenue picture joined to customer identity — the repo already
carves those out (`users.viewDetail`, `miniDraws.viewParticipants`). `export` is split from
`view` for the same reason `users.export` is: a CSV of revenue + names + emails leaving the
building is a different risk from reading the table on screen.

Adding catalog actions does **not** auto-grant them to existing custom roles, so
`npm run migrate:backfill-receipts-view` grants `receipts.view` to every role that already
holds `settings.view` — without it the deploy reads to staff as a Billing tab that silently
vanished. `receipts.export` is deliberately **not** backfilled; hand it out on purpose in
Settings → Roles.

## CSV export

Server-rendered rather than built from the loaded page, for two reasons: it covers the whole
filter (not just page 1), and only the server can actually enforce `receipts.export`.

Capped at `RECEIPTS_EXPORT_MAX_ROWS` (10,000). The cap is **never silent** — the response
carries `X-Receipts-Row-Count`, `X-Receipts-Total-Count` and `X-Receipts-Truncated`, and the
tab renders a warning naming both numbers when a download was clipped.

## Reconciliation — the real acceptance test

```bash
npm run verify:receipts-reconciliation:prod          # all time
npm run verify:receipts-reconciliation -- --days=30
```

Read-only. Proves two identities, plus a per-category cross-check:

- **A.** Receipts net (ex shop) == `aggregateNetRevenueSum` — the dashboard's all-category
  net figure, which already includes renewals. Must match to the cent.
- **B.** Receipts net − `buildByCategory` total == the renewals total. The acquisition basis
  excludes renewals; Receipts keeps them, so the gap *is* renewals. If it is not, the
  classifier is wrong.

Last run (production, all time, 2026-08-17):

| | |
|---|---|
| Receipts rows | 36,795 |
| Gross | $1,204,492.69 |
| Refunded | $7,414.91 |
| **Net of refunds** | **$1,197,077.78** |
| Dashboard net (`aggregateNetRevenueSum`) | $1,197,077.78 → **delta $0.00 ✓** |
| Dashboard acquisition (`buildByCategory`) | $545,717.78 |
| Delta | $651,360.00 |
| Renewals total | $651,360.00 → **delta − renewals = $0.00 ✓** |

All five shared categories matched to the cent.

## ⚠️ `amount` is the LIST price, not cash collected

`PaymentEvent.data.price` is written from the package catalogue. **No Stripe-side discount is
reflected in it.** Verified against production 2026-08-17: across all 36,798 `BenefitsGranted`
rows, `data.*` contains no `discount` / `couponId` / `amountPaid` key of any kind, and the
renewal price spread is exactly three values with zero variance — `$20` tradie, `$40` foreman,
`$80` boss.

Meanwhile **102 members have accepted the `discount_50_2mo` cancellation-flow retention
offer** (`CancellationFlowEvent.offerAccepted`, outcome `saved`). That offer attaches the
stable Stripe coupon `retention-50off-2mo` (50% off, `duration: repeating`,
`duration_in_months: 2`) to the subscription — so those members are billed half price while
this ledger still reports full price.

**This is not introduced by Receipts.** Every revenue figure derived from `data.price` has the
same property, including the admin dashboard and the Norm endpoints. Receipts just made it
visible by putting the rows next to each other.

### Why there is no "discounted renewal" filter

There is nothing to filter on. The discount exists only in Stripe, and
`CancellationFlowEvent` records *that* a member accepted the offer, not *which* renewals it
covered. Inferring "the next two renewals after `savedAt`" would be a guess that breaks on
tier changes, mid-window cancellation, and coupon replacement — a filter that is silently
wrong is worse than no filter.

### The fix, when you want it

Stamp the truth at grant time. The Stripe webhook that writes `BenefitsGranted` already holds
the invoice, which carries `amount_paid`, `subtotal`, `total`, `discounts[]` and
`total_discount_amounts[]` (confirmed present on API v18.5.0). Persisting
`data.amountPaid` + `data.discountAmount` + `data.couponId` alongside `data.price` would make
the ledger reflect cash collected, and the retention-offer filter becomes exact and trivial.

That is a change to the payment-granting path, which this repo treats as high-risk
(see the `isZeroAmountTrialUpdateInvoice` footgun in CLAUDE.md), and it only fixes rows going
forward. It belongs in its own branch with its own review — deliberately **not** done here.

## When the shop launches — update this feature

Receipts already maps `Order` and returns 0 rows (D3). The shop going live needs **no code
change here**, but it does need these checks. Treat this as the checklist:

1. **Confirm the row shape still holds.** `orderStages()` reads `createdAt`, `status`,
   `totalAmount`, `paymentIntentId`, `orderNumber`, `user`. If the shop's checkout writes
   `Order` differently — or a second writer appears besides
   `src/app/api/orders/route.ts` — re-verify `orderStages()` against it.
2. **Re-check the double-counting guarantee.** Today it holds *because* `createOrderSchema`
   accepts only products, making `Order.tickets[]` / `Order.membership` vestigial. If the shop
   starts writing either field, an Order could represent the same money as a `PaymentEvent`
   and the union would double-count. This is the single most important thing to re-verify.
3. **Revisit the `status` rule.** `cancelled` is excluded as a voided sale. Confirm the live
   fulfilment flow doesn't use `cancelled` for something else (e.g. a post-refund state), and
   decide whether shop refunds should populate `refundStatus` — today no shop refund path
   feeds the `RefundProcessed` ledger, so shop rows always read "Paid".
4. **Re-run the reconciliation.** `npm run verify:receipts-reconciliation:prod`. Identity A
   compares Receipts **excluding** shop orders against the dashboard's net revenue; once shop
   revenue is real, decide whether the dashboard should include it, or keep the exclusion and
   report shop separately.
5. **Update the "expect zero rows" copy** — the code comment in `orderStages()`, the empty
   state in `ReceiptsManagement.tsx` ("The shop hasn't launched yet…"), the Norm interpretation
   note `0d` in `docs/internal-norm/norm-context.md`, and this section.

> Cross-reference: [cart-shop-products](../cart-shop-products/) owns the `Order` model. A
> change there that touches any field in step 1 must come back here.

## Refund accuracy — audited 2026-08-17

Two read-only scripts. The ledger's *internal* consistency is perfect; the gap is against
Stripe, and it is historical.

```bash
npm run audit:receipts-refunds:prod -- --days=400   # is the ledger self-consistent?
npm run backfill:missing-refunds:prod:dry           # what does Stripe know that we don't?
```

**Internal consistency — all clean** (198 refund rows against 36,800 payments):

| Check | Result |
|---|---|
| Refunds with no matching `BenefitsGranted` | 0 |
| Duplicate refund rows for one payment | 0 |
| Full refunds whose amount ≠ the granted price | 0 |
| Full refunds with no `refundAmount` recorded | 0 |
| Payments carrying both a full **and** a partial refund | 0 |

**Against Stripe — 341 refunds all-time vs 198 on the ledger.** Correlating through the
customer (see below) splits the 341 as:

| | Count | Meaning |
|---|---|---|
| Already on the ledger | 83 | correctly recorded |
| **Missing, confidently matched** | **87** | real gap — **$2,930.00** of revenue currently overstated (0.24% of $1.2M) |
| Ambiguous | 0 | — |
| Unmatched | 171 | **every one** belongs to a Stripe customer that maps to no `User` — deleted accounts, whose payments aren't on the ledger either, so nothing is overstated by them |

Coverage by month shows tracking improving rather than switching on at a single point:
2025-11 and 2025-12 recorded **0 of 24**; 2026-01 caught 8 of 74; 2026-04 20 of 48;
2026-07 14 of 27; 2026-08 8 of 9.

### ⚠️ The correlation trap

A Stripe refund carries a **PaymentIntent**. The ledger keys a subscription payment by its
**invoice** (`invoice_in_…`) — a different id. In Stripe API v18.5.0 every field that used to
bridge them (`charge.invoice`, `invoice.payment_intent`, `invoice.charge`, `invoice.payments`)
is **absent**, so the join cannot be made on ids at all.

The first version of this audit matched on the PaymentIntent alone and reported **314 missing
refunds** — a bug in the audit, not the data. Correlation must go through
`charge.customer → User.stripeCustomerId → userId → the matching purchase`, and that logic
lives in exactly one place (`scripts/backfill-missing-refund-events.ts`). The audit script
reports counts and defers to it rather than keeping a second copy that could disagree.

### Why the 171 have no purchase — and what it means for historical revenue

Confirmed in code, not inferred. `deleteUserWithCascade`
([src/utils/admin/delete-user-cascade.ts](../../src/utils/admin/delete-user-cascade.ts)) hard-deletes
the customer's payment history along with the account:

```ts
const paymentEventsResult = await PaymentEvent.deleteMany({ userId: userObjectId }, { session });
const ordersResult       = await Order.deleteMany({ user: userObjectId }, { session });
```

So when an account is deleted, its `BenefitsGranted` rows go with it. The Stripe customer and
its refunds survive in Stripe forever; the ledger side vanishes. That is precisely the 171 —
refunds with no purchase to attach to, and **no revenue overstated**, because the payment was
erased from the books at the same time.

⚠️ **The wider consequence: deleting a user retroactively rewrites historical revenue.** Every
figure computed from `PaymentEvent` — Receipts, the dashboard's net and acquisition revenue,
MER, the daily snapshots — drops for **past** periods when an account is deleted today. A
customer exercising a deletion request removes their money from the books, and a
previously-reported month quietly changes.

If you ever need books that don't move, the fix is to anonymise the payment rows on deletion
(null the PII, keep `userId` as an opaque tombstone) rather than delete them — a change to the
cascade, not to Receipts. Flagged here because Receipts is where the discrepancy becomes
visible.

### Repairing the 87

`npm run backfill:missing-refunds:prod` writes the missing `RefundProcessed` rows so revenue
reporting becomes correct. It **deliberately does not reverse entries, points or benefits** the
way a live refund does: those draws have already been run, and retro-actively deleting entries
would rewrite settled draw history to fix a reporting number. Rows it writes carry
`data.backfilledFromStripe: true` + `data.stripeRefundId` and `processedBy: "admin"`, so they
are distinguishable from webhook-written rows forever.

**Run against production 2026-08-17**: 87 rows written, 0 duplicates. Refunded moved
$7,414.91 → $10,344.91 (+$2,930.00 exactly as predicted) and net revenue restated
$1,197,077.78 → $1,194,415.28. Dashboard net still equals Receipts net to the cent afterwards,
so both surfaces moved together.

⚠️ **Idempotency is keyed on `data.stripeRefundId`, NOT on the amount match.** The first
production run exposed this: re-running the dry afterwards still reported 50 "missing" refunds.
Cause — the correlation is (customer, amount, closest-preceding purchase), so for a member with
**two identical purchases and one refund**, a second run finds the first purchase already
refunded and cheerfully matches the same Stripe refund to the second one. The in-run `claimed`
set only guards within a single execution. A re-run would therefore have written ~50 duplicate
refunds and under-reported revenue a second time.

The script now loads every `stripeRefundId` it has previously filed and skips those refunds
**before** any amount matching. Verified: a re-run reports `0 missing`, `170 already on the
ledger`, `171 unmatched`. Do not remove that check.

## Gotchas

- **`$unionWith` sub-pipelines cannot contain `$merge` / `$out`.** Mongoose enforces it in
  the types, so `orderStages()` returns the narrower `UnionablePipelineStage[]`.
- **The date window comes from `resolveRevenueDetailsRange`** (`dashboardSlices.ts`) — the
  same AEST helper the dashboard's revenue slices use. Reimplementing the window here would
  break the reconciliation the moment a DST boundary landed inside a range.
- **Draw presets resolve to `""` until the draw dates load.** The hook is passed
  `enabled = Boolean(startDate && endDate)`, otherwise the first render fires a custom-range
  request with no bounds and gets a 400 back.
