# Cart-Shop-Products — Rules

## R1. Member discount computed server-side

Don't apply discount client-side as a display tweak — compute total + discount on the server (or via a server-validated PI metadata read). Otherwise, manipulated clients can bypass pricing.

## R2. Member-only product enforcement

Products with `isAdditional === true` must be gated server-side at checkout — non-member can't complete purchase. Client-side hide is for UX; server-side block is for security.

## R3. Order written by webhook only

Don't write `Order` rows from the client / route-handler. The webhook is authoritative — same pattern as subscription cancellation events.

## R4. Inventory not currently modeled

There's no inventory tracking on `Product`. Products are assumed in-stock unless marked `isActive: false`. _TODO: confirm._

## R5. The server cart is the source of truth

`user.cart` in Mongo is the cart; `CartContext` is an optimistic mirror of it. Reconcile a failed or partial sync by re-reading `GET /api/cart`, never by reconstructing the list client-side — and remember `POST /api/cart` is additive (`quantity += n`), so any retry path must be certain the op has not already landed.

## R7 — Prices are GST-inclusive, and the money math lives in ONE module (2026-08-17)

`priceCart` in [src/utils/shop/pricing.ts](../../src/utils/shop/pricing.ts) is the single source
of cart totals. Never re-derive GST, shipping or a discount anywhere else.

**GST is a component, not an addition.** Every price entered in the admin catalog is
GST-inclusive, so `gst = total / 11` describes tax *already inside* the total. The previous code
computed `subtotal * 0.1` and added it, **overcharging every cart by 10%**.

**It was duplicated in more places than the delivery-fee research recorded.** That doc says three;
there were **seven**:

| Site | Status |
|---|---|
| `/api/cart/summary` | live — fixed |
| `CartContext.calculateSummary` | live — fixed |
| `/api/cart/update` | **live** — fixed. Called from `CartContext:251`; missed by earlier audits |
| `useCartQueries.ts` × 4 | **dead code** — left as-is, see below |

`useCartQueries` still carries four stale copies. It is [documented dead code](gotchas.md) — no
component imports it, only the `CartSummary` *type* is used — so fixing it changes nothing a user
sees. **If that layer is ever revived, it must be switched to `priceCart` first** or it will
reintroduce the 10% overcharge.

Two behaviours worth knowing:

- **The free-shipping threshold is tested AFTER the discount**, against what the customer actually
  pays. Testing the pre-discount subtotal ships a $90 order free against a $100 threshold.
- **An empty cart costs zero.** `0 >= 100` is false, so a naive threshold check charges flat
  shipping on an empty cart — guarded explicitly, and covered by a test.

Shipping sits inside the GST component: under ATO ruling GSTD 2002/3 a delivery charge supplied
with taxable goods is itself a taxable supply.

Tests: `npm run test:shop-pricing`.

### R7a — Money is integer cents (2026-08-17)

`priceCart` works in **integer cents** and returns cents. `0.1 + 0.2 !== 0.3`, Stripe charges in
cents anyway, and a `Math.round(n * 100) / 100` helper is a band-aid over the float rather than a
fix. Convert at display and API-response boundaries only, via `centsToDollars` / `toDollarSummary`.

The cart endpoints still *return* dollars because their clients expect that shape — `toDollarSummary`
is the single conversion point.

Config lives in [src/config/shop.ts](../../src/config/shop.ts) (`SHOP_CONFIG`, `GST_DIVISOR`).
It deliberately holds **only** commerce knobs — legal identity (licence, ABN, notification number)
stays in `src/constants/legal.ts`. The unmerged `claude/shop-setup` branch has a `src/config/business.ts`
carrying `license: "TP/04720"`, which is **stale** — the live value is `NSW_LICENSE = "TP/05113"`.
Do not adopt that file wholesale.

### Prior art: the `claude/shop-setup` branch

An unmerged branch from ~3 months ago (`claude/shop-setup`, 2 commits) contains a fuller shop
implementation worth reading before extending this domain:

| File | Why it matters |
|---|---|
| `src/services/shop/finalizeShopOrder.service.ts` | **Atomic stock decrement** (`findOneAndUpdate({_id, stock:{$gte:qty}}, {$inc:{stock:-qty}})`), revert-on-partial-failure, and an **automatic Stripe refund + apology email** when stock is lost after payment |
| `src/services/shop/cartValidation.service.ts` | Per-item validation returning structured `{reason, message}` errors rather than a bare throw |
| `src/services/shop/createShopPurchasePaymentIntent.service.ts` | Stripe customer resolution incl. guest → returning-customer by email |
| `src/models/Order.ts` | `addressLine1/2`, phone, **AU state enum**, delivery instructions, guest-order fields |
| `src/components/payment/ShopCheckoutPaymentElement.tsx` | Payment Element wiring for the shop |

Two things it does that we deliberately do **not** copy: it writes the Order from Stripe metadata
(a 500-char-per-value cap that limits cart size), and it changes the *subscription* return URL to
`/my-account` — an unrelated behaviour change.

## R? — Only four-star-and-above reviews are displayed

A business decision, recorded so nobody re-derives it or quietly moves the
threshold. Reviews below four stars are **stored exactly as written** and simply
not rendered. `MIN_DISPLAY_RATING` in `src/utils/shop/reviews.ts` is the single
definition; four surfaces depend on it (reviews tab, star row, JSON-LD, card).

Two consequences the code handles, and must keep handling:

**The average shown describes the reviews shown.** `displayAverage(displayableReviews(...))`,
never `Product.rating`. `Product.rating` averages every review including hidden
ones, so printing it above a list of 5-star reviews would contradict the list
directly beneath it. Never mix a displayed list with the stored average.

**A product with only low reviews shows no section**, exactly like one nobody has
reviewed.

`Product.rating` and `Product.reviewCount` stay honest across ALL reviews — they
are what admin and any reporting should read. Nothing in the display path
rewrites them.

**Known limit:** the listing card gates on `reviewCount`, which counts every
review, so a card can show stars for a product whose visible list is empty. The
list query deliberately does not carry review bodies — that would ship every
comment and reviewer id to the browser — so the card cannot know better. The
product page is authoritative.
