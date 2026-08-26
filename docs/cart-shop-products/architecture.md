# Cart-Shop-Products — Architecture

## Flow

```
Browse /shop → Product list (TanStack Query)
   │
   ▼
Add to cart → CartContext (optimistic in-memory list + op queue → debounced drain to /api/cart)
   │
   ▼
/checkout → Calculate total (member discount applied) → Stripe Payment Intent ([payment](../payment/))
   │
   ▼
3DS if needed → Payment success
   │
   ▼
Webhook payment_intent.succeeded → write Order, processPaymentBenefits
   │
   ▼
/purchase-success → Show order confirmation
```

## Cart state

[src/contexts/CartContext.tsx](../../src/contexts/CartContext.tsx) holds cart state:
- Items + quantities, as an **optimistic mirror** — the durable cart is `user.cart` in Mongo, loaded on mount via `GET /api/cart` for the session user. No browser storage is involved.
- Every action applies to the list immediately and appends a `PendingOperation`; a single debounced timer (`SYNC_DEBOUNCE_MS`, 1s) drains the queue to the API in order, one op at a time.
- After a drain the provider re-reads `GET /api/cart` and adopts that snapshot **if the queue came out empty** — the server is what reconciles a rejected or clamped operation, not client-side rollback. See [gotchas.md](./gotchas.md).
- Read by checkout / mini-cart / shop pages

## Routes & pages

- `/shop` — product list
- `/checkout` — cart + payment
- `/purchase-success` — post-purchase confirmation

## Hooks

| Hook | Purpose |
|---|---|
| `usePurchaseInvalidation()` | Invalidates relevant TanStack queries after a purchase succeeds |

## Models

- **Product** — catalog
- **Order** — completed purchases

## Cross-domain integration

- [payment](../payment/) — Payment Intent flow
- [billing-stripe](../billing-stripe/) — `PaymentEvent.data.grants` ledger records what the order granted
- [tracking](../tracking/) — purchase events to Klaviyo / Meta CAPI

## Print-provider product sync (2026-08-19)

Garments are authored in the print provider's portal and pulled in, rather than
retyped. Three constraints shape the whole design, and all three were discovered
the hard way.

**The provider's product ids are not safe to store.** An id is
`"00" + uid + platformProductId`, and until the account key is rotated the uid IS
the API key. Generated mockup URLs sit under `/users/{uid}/` for the same reason.
So provider ids are held in memory for the length of one sync and never
persisted; the stable identifier is `platformProductId`, which the payload states
outright. `Product.printProvider` deliberately has no field for the full id.

This matters more than it looks: `src/app/(site)/shop/[slug]/page.tsx` reads the
product with an unprojected `.lean()`, so anything on the document reaches the
page HTML.

**Every image is mirrored to Cloudinary.** Hotlinking the provider would publish
a live credential in page source. `printProviderSync` downloads each mockup and
re-uploads it under `shop/print-provider/<product>/<colour>-<n>`, so a re-sync
overwrites in place rather than growing a copy per run. `res.cloudinary.com` was
already an allowed image host, so no `next.config.ts` change was needed.

**Only the provider's own facts are overwritten.** A re-sync refreshes name,
variants, colourways and images. It never touches price, `includedEntries`,
category, or `isActive` — those are commercial decisions made in admin, and a
sync that reverted a price change would be a silent revenue bug. First sync only
seeds `price: 0, isActive: false` so a half-configured garment cannot appear in
the shop by accident.

### Files

| File | Role |
| --- | --- |
| `src/lib/print-provider/client.ts` | The only module that knows the vendor. Wraps the **REST** surface (product reads) with `RIVERR_REST_API_KEY`. The **GraphQL** surface — order creation, `RIVERR_GRAPHQL_API_KEY` — is a separate key and is not wired yet. |
| `src/services/shop/printProviderSync.ts` | Maps provider payload to `Product`, mirrors images, upserts. |
| `src/app/api/admin/shop/print-provider/route.ts` | `GET` lists what is available, `POST` syncs one or all. |
| `src/stores/useProductColourStore.ts` | Joins the gallery and the picker across a server component. |
| `src/app/(site)/shop/[slug]/components/ProductGallery.tsx` | Image follows the selected colour. |

### Enumeration is via the design library, not `/products`

`GET /products` returns `{"products":[]}` for our key while `GET /products/{id}`
returns the record. Our shop record comes back `{"platformId":"0","synthetic":true}`
— their Shop is a connected sales channel (Shopify, Etsy, eBay, WooCommerce,
Squarespace) and we are a custom storefront with none. So `GET /design-library`
is the only enumeration path, and **a portal product with no design attached is
invisible to us**. That is a provider-side limitation, confirmed with them.

### Colourways, and why they are not on the variant

A printed tee is 51 colours x 9 sizes. Repeating a swatch hex and an image URL on
all 383 variant rows would bloat every query that reads the product, so colour is
normalised into `Product.colourways` and joined to `variants[].colour` by name.

The UI is colour-then-size for the same reason — one chip per variant is
unusable at 383. Sizes are derived per colour by `sizesForColour`, because not
every colour is made in every size: 51 x 9 is 459 pairs but only 383 exist, and
offering one of the missing 76 would be an order the printer cannot fulfil.
