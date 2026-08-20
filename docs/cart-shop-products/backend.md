# Cart-Shop-Products — Backend

## Routes

- `/api/cart/` — server-side cart helpers if any (likely just totals/validation)
- `/api/products/` — product list / detail reads
- `/api/orders/` — order list / detail reads

> _TODO: read each route handler and document._

## Order writes

Orders are written by the Stripe webhook (`payment_intent.succeeded`) for shop purchases — NOT by client-side calls. The success path:
1. Webhook receives PI succeeded event
2. Identify it as a shop purchase via metadata
3. Write `Order` row
4. `processPaymentBenefits` writes `BenefitsGranted` ledger row referencing the order

## Member discount calculation

Member-only pricing is computed server-side at checkout time, not client-side. The `MembershipPackage.shopDiscountPercent` field on the user's active package determines the discount.

> _TODO: locate the discount-calculation helper._

## Shop checkout — how an order is actually written (2026-08-17)

> **Correction.** This document and [rules.md](rules.md) R3 previously asserted "Orders are
> written by the Stripe webhook (`payment_intent.succeeded`) for shop purchases". That was
> **design intent, never code** — before this change nothing anywhere created an `Order`. What
> follows is what the code now does.

The write is **split**, deliberately:

| Step | Where | What |
|---|---|---|
| 1 | `POST /api/shop/checkout` | Creates the order **`pending`** from server-read prices, then the PaymentIntent |
| 2 | `payment_intent.succeeded` | `finalizeShopOrder` marks it paid, takes stock, clears the cart |

**Why not build the order in the webhook from Stripe metadata?** Metadata caps at 500 characters
per value, which caps cart size — the unmerged `claude/shop-setup` branch takes that approach and
inherits the ceiling. A pending row also means a payment can always be reconciled to something:
if the webhook is lost, the order still exists and an operator can see it.

**Why is this not a free-goods hole?** The client never supplies a price, a total or an order. It
sends product ids, variant skus and quantities; everything else is read from the database. That is
the same contract `create-one-time-purchase-existing-user` uses.

### The order of operations is load-bearing

```
markPaid  →  decrement stock  →  clear cart
```

- **`markPaid` is the idempotency gate.** It filters on `status: "pending"`, so a redelivered
  Stripe event updates nothing and returns `null` — no double stock decrement, no second cart clear.
- **Stock is taken after payment**, because a print-to-order catalog mostly has none to take and
  reserving before payment would block real buyers. The trade-off is the branch below.
- **The cart is cleared last**, so a failure anywhere above leaves the customer holding their cart
  rather than losing both the cart and the order. Only `type: "product"` lines are pulled — a
  mini-draw ticket in the same cart is a different purchase path this payment did not cover.

### Stock lost after payment

If `decrementStock` cannot fulfil a line (another buyer took the last unit between payment and
webhook), the order is **automatically refunded**, marked `cancelled`, and annotated with which
items failed. Partial decrements are reverted first so a refunded order does not leave phantom
stock reserved.

A **failed refund is logged loudly** — the customer has paid for something we are not sending, and
only a human can resolve it from there.

### It grants no entries

The shop branch deliberately does **not** call `processPaymentBenefits` and does **not** widen
`packageType`. Merchandise entries are a separate, permit-gated feature — see
[the entries spec](../superpowers/specs/2026-08-17-shop-entries-design.md).

> **The failure mode to remember:** the dispatcher's final `else` logs and skips any
> `paymentType` it does not recognise. A missing branch therefore means paid orders silently
> never leave `pending` — no error, no alert.

## Merchandise free entries — the grant (2026-08-17)

A paid shop order credits the free entries included with the garment. Entries are **never
sold**; the customer buys the product and the entries come with it (CLAUDE.md rule 11).

**Base count is snapshotted at checkout.** `Order.products[].includedEntries` is copied from the
catalog in `ShopOrderService.createPendingOrder`, for the same reason `price` and `name` are: an
admin editing the catalog between checkout and webhook must not change what the buyer was
promised. The client never asserts a count — it sends product ids, skus and quantities.

**The multiplier is applied at fulfilment, and merchandise inherits the ONE-TIME pack
multiplier.** Resolved in the webhook shop branch via `getActivePromoMultiplier("one-time")` —
the helper already in that file, with `?? 1` and `catch → 1` — and passed into
`finalizeShopOrder` as a **required** option. It is required rather than optional so a future
caller cannot silently grant at 1×, and resolved by the caller so the shop service does not
become a third copy of that wrapper (the webhook handler and the upsell purchase route already
hold two). Both sides move together, so merch can never become better value per entry than the
packs during a promo.

### Merchandise carries its OWN entry multiplier (2026-08-20)

**Merchandise does NOT inherit the one-time pack multiplier.** It did until 2026-08-20, and a
clamp design briefly sat on top of that; both are gone. A pack promo now has no effect on
garment entries whatsoever — if merch should run at 5×, an admin sets 5×.

Three tiers, most specific first:

```
multiplier = line.entryMultiplier                        // 1. this product
          ?? config.categoryMultipliers[norm(category)]  // 2. its category
          ?? config.multiplier                           // 3. the whole shop
          ?? 1                                           // 4. unmultiplied
```

`1` is the floor and the default, so a shop with nothing configured grants exactly the entries a
product advertises. There is no "off" below that: zero would revoke the entries the product
itself promises, and that decision belongs on `includedEntries`.

**What this gave up.** The previous design applied `min(packRate, ceiling)`, which made it
*structurally impossible* for merchandise to be better value per entry than a pack. That
guarantee no longer exists — the merch rate is whatever an admin types. The ladder test in
`shop-entry-grant.test.ts` was inverted rather than deleted, so it now records the absence of
the protection instead of asserting a property that is no longer true. Treat an undercutting
rate as a pricing decision someone has to make deliberately, not something the code prevents.

**Entries are summed PER LINE.** `Σ(includedEntries × qty) × oneMultiplier` is only correct
while every product shares a rate, and two categories with different multipliers make a mixed
cart reachable. The grant loops, resolves per line via `entriesForLine`, and records
`entryMultiplierApplied` on each line — per line rather than per order, because a cart holding
a 2× garment beside a 5× tool has no single multiplier to record.

**The product tier is snapshotted onto the order line.** The webhook never loads products, so
without it the rate would apply on the page and never reach the grant. The rule that decides
where each tier lives: **product data is snapshotted, config resolves live** — so the category
and shop-wide rates are read at webhook time.

**Category keys are normalised** (`trim().toLowerCase()`) on write *and* read. `Product.category`
is free text with no enum and the vocabulary is already forked — `"Apparel"` from the sync
beside `"power-tools"` from the seeds. Keyed on the raw string, a rate stops matching the moment
somebody retypes the category, with no error anywhere.

**On a failed config read the loader falls back to 1×**, never to a rate nobody set. That can
only ever grant exactly what the product advertises.

**The Stripe webhook no longer resolves a promo rate for shop payments.** It used to call
`getActivePromoMultiplier("one-time")` and pass it in; that plumbing was removed rather than
left dangling, because a dead parameter named "promo multiplier" is how the inheritance quietly
comes back.

### Ordering inside `finalizeShopOrder` — all three constraints are load-bearing

`markPaid` → stock → clear cart → **grant**.

- **The grant runs LAST.** A successful grant writes a `BenefitsGranted-{pi}` `PaymentEvent`, and
  `handlePaymentSuccess` short-circuits on `isPaymentProcessed()` *before* it reaches the shop
  branch. Anything sequenced after the grant would therefore never get a retry.
- **The grant runs only on the fulfilled path.** The stock-loss branch refunds the customer in
  full and returns. Granting before that check would leave a fully refunded order holding its
  entries, and the refund reversal cannot clean it up — it fails closed when the
  `BenefitsGranted` row is not yet committed.
- **`already_processed` no longer returns early.** It retries the grant when `entriesGranted` is
  absent, because that redelivery is the only retry a failed grant will ever get. Safe:
  `processPaymentBenefits` is idempotent on the same `PaymentEvent` id. Skipped when the order is
  `cancelled` (auto-refunded), so a refunded order is never granted against.

### Two fields that carry meaning in their absence

- `Order.entriesGranted` has **no schema default**. `undefined` = the grant has not run (in
  flight, or failed and awaiting the reconcile cron); `0` = it ran and the order was worth no
  entries. A `default: 0` would make a failed grant indistinguishable from a zero-entry order,
  and neither support nor the cron could tell them apart.
- A zero total short-circuits **before** `processPaymentBenefits`, so no `PaymentEvent` is
  written at all. That is what lets the feature ship dark at `includedEntries: 0` with genuinely
  zero behaviour change, and it survives any promo — `0 × 10 = 0`.

### No eligibility check, deliberately

Entries are granted to every buyer. SA/ACT exclusion is applied by the Major Draw export when a
winner is picked (`src/app/api/admin/major-draw/export/route.ts:120-131`), which is where every
other entry source is filtered. A point-of-sale skip would be a second, weaker copy of a working
filter, and would silently withhold entries from anyone whose state or birthdate is merely
missing.

### `userEmail` in the PaymentIntent metadata

Shop was the only payment type not sending it. The webhook resolves the buyer by
`stripeCustomerId` first and falls back to `metadata.userEmail`; with neither available it logs
"will be retried" and returns `undefined` — which `dispatchStripeEvent` treats as **processed**,
not retry, so the paid order and its entries were both lost silently. `resolveStripeCustomer`
persists the customer id best-effort with a swallowed catch, so that mismatch is reachable rather
than theoretical.

**Still open (shared, not shop-specific):** that `return undefined` path marks events permanently
processed across every payment type despite its log claiming a retry. Fixing it changes webhook
retry semantics globally, so it is flagged rather than changed here.

### Test

`npm run test:shop-entries` (`src/utils/payment/__tests__/shop-entry-grant.test.ts`) runs against
`E2E_MONGODB_URI`, never the dev database, and cleans up after itself. It covers the silent
failures: both schema round-trips, the absent-vs-zero distinction, the arithmetic, the kill
switch under a promo, and the ladder property at 1/2/5/10×. It includes a **control** assertion
that writes an undeclared source key and confirms Mongoose drops it — without that, "shop
persisted" would also pass on a schema with strict mode off.

**Not covered, and listed in the phase-3 plan rather than claimed:** the end-to-end grant through
`processPaymentBenefits`, webhook replay idempotency, the `already_processed` retry path, and
refund reversal of a shop grant.

## Manual fulfilment hand-off — CSV export (2026-08-17)

Paid shop orders are handed to the print provider by **exporting a CSV and uploading it to their
bulk screen**, not by an API call.

**Why (as decided 2026-08-17).** The documented GraphQL API appeared unreachable: our key
authenticated (a bogus key 403s, ours got past the gateway) but every path returned
`404 Cannot POST /graphql`, and their portal talks to Firestore rather than using it. Their
portal *does* have a working CSV upload, so the owner chose the manual path rather than keep
waiting on API access.

**Superseded 2026-08-20 — the API route now exists.** The provider confirmed the 404 is
resolved and that order creation lives on GraphQL (`createOrder` / `createOrderFromGtin`)
behind a *second* key, `RIVERR_GRAPHQL_API_KEY`, with `RIVERR_SHOP_ID` now populated
(`qTJGkvBReIRL3NU6DrLA`). Verified end-to-end: `getAllShops` returns our shop.

**CSV remains the shipping path until an adapter is written and tested.** Nothing about
the export changes today — this note exists so the next reader does not re-derive the
"no API available" conclusion from a rationale that has expired.
The service boundary is the same one an API adapter would sit behind, so switching later changes
`fulfilmentExport.ts` and not its callers.

### Column names deliberately do not match their template

Their upload screen has a **Field Mapping** step (`Product ID* → Select Field`, and so on), so the
admin maps our headers to their fields once. That makes explicit, unambiguous headers
(`product_id`, `address_line_1`, `postcode`) the right choice rather than guessing at their
template's exact spelling — a guess would silently mis-map.

### One row per item

Their `Product ID` identifies a single garment, so a three-item order is three rows carrying the
same order number and address. That is their template's shape, not a flattening bug.

### `product_id` is the variant's GTIN

Looked up from `Product.variants[].gtin` by the order line's `sku`. A variant with no GTIN still
exports, with an empty cell, and is listed separately in `missingProductId` — withholding a paid
order silently is worse than surfacing a row the admin must complete before upload.

### Export and "mark submitted" are two steps, on purpose

`GET /api/admin/shop/fulfilment` is **read-only** and never stamps anything.
`POST` with `orderIds` sets `submittedAt`, which is what the export filter excludes on.

Marking on download would hide a paid order from the next export whenever a download failed or was
cancelled — a garment that silently never gets printed. The split trades that for a possible
double upload if the admin forgets to mark, which is visible and recoverable. `submittedAt` is the
guard against printing twice, and `markSubmitted` is idempotent because an admin will click twice.

The POST is audited (`requirePermissionWithAudit`) since it is the record that a customer's order
reached the printer.

### Test

`npm run test:fulfilment-export` — pure, no database. It covers the failure that does not throw:
an unquoted comma in an address shifts every later column by one, so postcode lands in state and
the parcel is misrouted. Also quote-doubling, embedded newlines, an empty GTIN never serialising
as the string `undefined`, and the header surviving an empty export (their mapper needs the header
row to offer field mapping at all).

## Shipping fees — how they are applied (2026-08-17)

All money is **integer cents** through the whole path; dollars appear only at the
API/display boundary. `priceCart` ([src/utils/shop/pricing.ts](../../src/utils/shop/pricing.ts))
is the single place shipping is decided.

### The rule

| Step | What happens |
| --- | --- |
| 1. Subtotal | `Σ (line price × quantity)`, prices read from the database, never from the request |
| 2. Member discount | `round(subtotal × tier%)` — Tradie 5, Foreman 10, Boss 20 |
| 3. Discounted value | `subtotal − discount` |
| 4. **Shipping** | **`discounted >= $100 ? $0 : $10`** |
| 5. Total | `discounted + shipping` |
| 6. GST | `round(total / 11)` — **already inside** the total, never added |

Both figures live in `SHOP_CONFIG` (`freeShippingThresholdCents: 100_00`,
`flatShippingRateCents: 10_00`). Customer-facing copy imports
`FREE_SHIPPING_THRESHOLD_LABEL` / `FLAT_SHIPPING_RATE_LABEL` rather than restating them.

### Three things that are easy to get wrong

**The threshold is tested against the DISCOUNTED value, not the subtotal.** A Boss member
(20%) with a $110 cart pays $88 — which is *under* $100, so they are charged $10 shipping. This
is deliberate: testing the pre-discount subtotal would ship a $90 order free against a $100
threshold and lose the fee on every discounted cart. It does mean a member discount can
*introduce* a shipping charge, and the checkout quote is what the customer is actually charged,
so the two never disagree.

**GST is a component, never an addition.** Australian retail prices are quoted GST-inclusive, so
GST is *reported* as the portion already inside the total — `total / 11`. Shipping is inside it
too: under ATO ruling GSTD 2002/3, a delivery charge supplied with taxable goods is itself a
taxable supply, which is why GST is computed on `total` (goods + shipping) rather than on goods
alone.

**An empty cart costs nothing.** `0 >= 10000` is false, so without an explicit zero-item guard
the threshold comparison charges $10 shipping on a cart with nothing in it. That guard exists and
is covered by `npm run test:shop-pricing`.

### What the customer pays is not what fulfilment costs

The $10 / free-over-$100 is a **customer-facing price**, not a pass-through of the printer's
freight. The provider's CSV upload offers *"Ship through the app — create shipping labels in
Riverr after upload"*, so they buy the label and bill us; nothing reconciles that cost against
what the customer was charged. On a single tee ($45.95, $10 collected) the two are close; on a
multi-item order shipped free over the threshold they are not.

**No margin alert exists for this**, deliberately — it is a pricing decision, not a bug. But it
is worth reviewing once real freight invoices arrive, because the threshold and the flat rate
were set before any of them existed.

### Order records the composition, not just a total

`Order.subtotal`, `.gstAmount`, `.shippingCost`, `.totalAmount` are all persisted. An Australian
tax invoice has to show the GST component, and a support conversation about "why was I charged
$10" needs the breakdown rather than a single figure to re-derive.

## Order listing — one service, two surfaces (2026-08-17)

`src/services/shop/orderQueries.ts` backs **both** the customer's own history
(`GET /api/orders`) and the admin list (`GET /api/admin/shop/orders`).

They differ in exactly one way: the customer's call pins `userId` from the session, the admin's
does not. **That asymmetry is the entire security boundary**, which is why it is stated in the
service rather than implied. `userId` is read from the session and never from a query parameter,
and an invalid id matches nothing rather than being dropped from the filter — dropping it would
widen a customer's own history to every order in the system.

Everything else — filtering, paging, sort, projection, row shape — lives once. Two
implementations drift, and a projection that gains a field on one surface and not the other is how
support ends up seeing something the customer cannot.

The projection is an explicit `.select()` include-list. The customer route previously did an
unprojected `.find().populate("products.product")`, which shipped every full Product document plus
every address on every row — the unprojected-list footgun CLAUDE.md documents.

### Category is snapshotted onto the order line

`Order.products[].category` is frozen at checkout alongside name, price and `includedEntries`.
Filtering through a join to `Product` would mean recategorising (or deleting) a product
retroactively moves old orders between buckets. Indexed as
`{ "products.category": 1, createdAt: -1 }`, matching how the admin list queries and sorts.

### The merch-vs-tools filter is derived

`distinctOrderCategories()` returns what orders actually contain — `["Apparel"]` today, and tools
too if they are ever stocked and sold, with no code change. Same reasoning as the shop's facet
rail: a hard-coded list offers a filter that matches nothing. The admin UI hides the control
entirely while there is only one category, and it appears by itself the day a second is sold.

### Customer-facing status wording

`processing` is what a paid order sits at until dispatch, and "Processing" reads like a stuck
payment. The customer page maps it to **"Being made"**, which is what is actually happening to a
print-to-order garment.

`entriesGranted` renders only above zero — merchandise entries ship switched off pending the
permit, and "0 free entries" would state a promise we are not making.

### Two dead ends fixed on the checkout success page

- **"View Order Details" pointed at `/my-account`**, which has no orders on it. It promised order
  details and delivered a dashboard. Now `/my-account/orders`.
- **"Download Receipt" had no `onClick`** and never did anything. Removed — a button that silently
  does nothing is worse than no button, because the customer clicks it, gets no file, and contacts
  support. The receipt is emailed on payment; a downloadable invoice needs a real endpoint behind
  it.

### Open: no nav entry

`/my-account/orders` is reachable from checkout success and the confirmation email, but is **not**
in `DASHBOARD_NAV`. That nav is a deliberate five-item mobile bottom bar with a centre-emphasised
item, and a sixth entry would break the layout — so which item it replaces, or whether orders live
under an existing section, is a product decision rather than something to guess at.

## Launch-blocker fixes (2026-08-19)

### A re-sync no longer blanks hand-typed GTINs

`printProviderSync` rebuilds `variants` from the provider payload and then
`Object.assign`s them over the existing product. The provider carries no `gtin`
and no notion of a variant being sellable, so both were wiped on every sync —
which empties the `product_id` column of the fulfilment CSV and leaves the
printer unable to match the line.

The ownership line now runs **through** a variant as well as around it: sku, size
and colour are the provider's; `gtin` and `isActive` are authored in admin and
are carried back on by sku. A variant the provider has dropped does not
resurrect; a new one simply has no gtin yet.

### Cancelled orders can no longer be printed

`fulfilmentExport.pendingFilter()` selected `status: "processing"` and relied on
that one equality to exclude everything else. `cancelled` is written by
`finalizeShopOrder` **after** it has already refunded a buyer for stock lost after
payment, so a cancelled order reaching the printer means paying the provider and
the postage for a garment nobody paid for, and posting it to someone who has
their money back. Once the CSV is uploaded none of that is recoverable, so the
printable statuses are now listed explicitly rather than left implicit.

### `paymentIntentId` on the admin order surface only

Staff had no way to find a paid-but-stuck order: the projection omitted Stripe's
handle on the money. It is now returned on the admin path and left out of the
customer projection entirely — not merely hidden — so a field added for support
cannot reach a customer's own history through a later mapping mistake.

**Still missing:** there is no shop refund route. Nothing writes `status` on a
refund except the stock-loss path, so a refund issued in the Stripe dashboard
leaves the order looking live. That is a money path and belongs in its own
reviewed change, not a launch sweep.
