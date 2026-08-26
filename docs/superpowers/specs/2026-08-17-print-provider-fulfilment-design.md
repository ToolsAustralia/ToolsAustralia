# Print-provider fulfilment

**2026-08-17** · branch `feature/merchandise` · **3 of 3** · **blocked — supplier endpoint 404s**

Sibling specs: [shop-catalogue-and-checkout](2026-08-17-shop-catalogue-and-checkout-design.md) ·
[shop-entries](2026-08-17-shop-entries-design.md)

Provenance: `[V]` verified · `[D]` documented · `[A]` assumed.

---

## 1. Problem and done

Without this, every paid merch order is keyed into the supplier's portal by hand — linear
labour and a data-entry error surface on someone's delivery address.

**Done means** a paid `Order` reaches the printer automatically, a tracking number comes back
onto the `Order` without anyone watching for it, and any order that fails to submit is visible
to staff with a retry. **Number that says it worked:** zero orders sitting unsubmitted for more
than an hour, and zero duplicate garments printed.

**Failure** is a duplicate print (we get billed twice for one sale) or an order that silently
never reaches the printer.

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| Where the vendor name lives | `src/services/print-provider/` behind a `PrintProvider` interface; "Riverr" only in the adapter and env vars | Repo rule: third-party names stay out of domain logic. Also makes a supplier swap a config change |
| Retry safety | Deterministic reference: our `orderNumber` **is** their `orderNumber`; unique index on `printProviderOrderId`; on ambiguity, look up before retrying | Their API has **no idempotency keys** `[D]`. A blind retry prints a second garment |
| Tracking | Poll `getShipment(orderId)` ~every 20 min for open orders only | They have **no webhooks** `[V]` — polling is what their docs prescribe |
| Artwork hosting | Cloudinary `secure_url`, excluded from orphan-image cleanup | They store the URL and re-fetch it for weeks including reprints `[D]` |
| Failure surface | Admin "paid, not yet submitted" list with retry | Not a fallback for the API — the error surface the API *requires* |
| Manual mode | The same admin list doubles as the manual path if the API never opens | Turns a supplier "no" into a workflow, not a dead project |

## 3. Starting state (verified)

### The blocker — probed 2026-08-17 with our own key in `.env.local`

| Request to `POST https://api.riverr.app/graphql` | Response |
|---|---|
| no `x-uid` header | `403 {"message":"Authentication failed.","status":403}` |
| bogus `x-uid` | `403 {"message":"Authentication failed.","status":403,"meta":{}}` |
| **our real `x-uid`** | **`404 Cannot POST /graphql`** (`x-powered-by: Express`) |

`[V]` — all three run back to back in one command.

**Our key authenticates.** It is the only value that gets past the gateway. What fails is
routing: no GraphQL handler is mounted. Also verified `[V]`:

- Every path 404s on both `api.riverr.app` and `dev.riverr.app`: `/graphql`, `/api/graphql`,
  `/v1/graphql`, `/gql`, `/graphql/`, `/query`, `/`, and `GET /graphql` — which their docs say
  serves an embedded Apollo Sandbox.
- `api.riverr.app` **is** the `riverr-enterprise-user` App Engine service — identical Express
  404 body and `x-powered-by` on both hostnames.
- The supplier portal bundle (`app.teeprintcentre.com.au/static/js/main.5c588d98.js`, 1.57 MB)
  contains **zero** occurrences of `graphql`. Control: the same grep found
  `riverr-enterprise-user.uc.r.appspot.com` and `riverr-enterprise-integrations-dot-…`, so the
  search worked. **The portal does not use the documented API at all** — it talks to Firestore.
- The portal's Settings has no "API Keys" tab (Profile / Share access / Invoices /
  Certificates only), though the docs describe one. The UID is on the Profile page.

### Why: our account is a customer *under* the enterprise, not the enterprise

`[V]` `app.teeprintcentre.com.au` is **not a system that integrates with Riverr — it is Riverr**,
white-labelled by hostname:

- Its Firebase config is `projectId: "riverr-enterprise-user"`, Riverr's own project
  (`authDomain: riverr-enterprise-user.firebaseapp.com`, `messagingSenderId: 1032772938785`).
- `app.riverr.app` serves the **byte-identical bundle** — same filename `main.5c588d98.js`,
  same 1,566,990 bytes. One application, themed per domain.
- Hence our TeePrintCentre login *is* a Riverr account, which is why its Firebase UID
  authenticates at `api.riverr.app`. **There is no second account to create** — registering at
  `accounts.riverr.app` would produce a different UID with no enterprise and no products.

`[V]` The Settings navigation defined in that bundle has five groups:

| Group | Items |
|---|---|
| `account` | Profile · Shipping address · Locations · Team · Share access · Invoices · Certificates |
| **`organization`** | Ecommerce channels · Domains · Email · **API keys** · Integrations |
| `pos` | Stations & registers |
| `catalog` | Blank products · Inserts and tags · PSD bulk import · Mockup marketplace · PSD uploads |
| `inventory` | … |

Our account renders **only part of `account`** (Profile, Share access, Invoices, Certificates).
The entire `organization` group — where **API keys** lives — is absent.

`[A]` The gate is one of the account flags visible in the same bundle (`isEnterpriseAdmin`,
`planLimitLock.active`, `isProUser`). We have not traced the exact predicate through minified
code and should not claim which.

**Conclusion `[A]`:** the API surface is **enterprise-level**. Tools Australia is a seller
account *under* the TeePrintCentre enterprise, so the API-keys surface is not ours to
self-serve, and `/graphql` 404s consistently with the account not being provisioned for it.
This is why the ask below is phrased in their UI's own vocabulary rather than as "your endpoint
is broken".

`[V]` Separately, Google sign-in at `accounts.riverr.app/register` fails with
`Firebase: Error (auth/unauthorized-domain)` — that domain is not in the Firebase project's
authorised-domains list. Riverr's misconfiguration; not actionable by us, and not on our path.

### The contract, as documented (never seen a live response)

| Fact | Provenance |
|---|---|
| Single GraphQL endpoint; no REST paths | `[D]` |
| Auth is one static header `x-uid`, whose value is the account's Firebase UID (28 chars) — **not** the 6-digit "User ID" the portal displays | `[V]` — the 28-char value authenticates, the 6-digit one 403s |
| `createOrderFromGtin` orders by GTIN with artwork passed inline as URLs | `[D]` |
| `createOrder` takes `productId` + `variantId` and has **no `images` field** — implying artwork comes from the product record | `[D]` — if true this removes our permanent-artwork-hosting burden. **Unconfirmed** |
| `shopId` is non-nullable on both order inputs | `[D]` |
| `getShipment` returns `null` until shipped — a success, not an error | `[D]` |
| Errors arrive as HTTP 200 with `errors[].extensions.code` | `[D]` |
| No blank prices, no stock, no pre-order shipping quote in the schema | `[D]` |
| Merchant is invoiced in arrears (`estimated: true` until invoiced) | `[A]` — inferred from one doc phrase; TeePrintCentre must confirm |

## 4. Design

```
Order(paid) ──createOrderFromGtin──▶ provider order ──poll getShipment──▶ trackingCode
     ▲                                     │                                   │
     └──── getOrders → match orderNumber ──┘                    Order.trackingNumber
              (only on an ambiguous failure)
```

**The trap to name:** `getShipment` returning `null` means "not shipped yet". An `errors` array
means a real failure. Treating an error as "not shipped" polls forever on a dead order.

### Edge and failure states

| Case | Behaviour |
|---|---|
| **Submission times out, outcome unknown** | Do **not** retry blind. Query `getOrders(createdAfter)` and match our `orderNumber`. Found → record the id. Not found → safe to retry. `"already exists"` → treat as success |
| Submission rejected (bad GTIN, bad address) | Mark `printProviderStatus: "failed"`, surface in the admin list. No auto-retry — it will fail identically |
| Artwork URL 404s later | Riverr re-fetches for weeks; a reprint fails. Mitigated by excluding print artwork from Cloudinary cleanup |
| Order ships in several parcels | Read `Order.shipments` (all parcels), not `getShipment` (most recent only) `[D]` |
| Shipment exists but `trackingCode` is null | Label not bought yet — keep polling `[D]` |
| Customer refunds before it ships | Cancel with the supplier if possible; otherwise it prints and we eat the cost. Flag in the admin list |
| API never becomes available | The admin list is the manual workflow. No customer-facing difference |

## 5. Threading checklist

| # | Location | Miss it and… | Fails |
|---|---|---|---|
| 1 | Unique sparse index on `Order.printProviderOrderId` | Duplicate submissions can both persist — **two garments printed and billed** | **silent** |
| 2 | Reconciliation lookup before any retry | Same as above, on the timeout path | **silent** |
| 3 | Poller skips orders already `shipped`/`cancelled` | Unbounded polling growth against a rate-limit-free API we are asked to be polite to `[D]` | **silent** |
| 4 | Cloudinary cleanup exclusion for print artwork | Reprints fail months later on a dead URL | **silent** |
| 5 | `RIVERR_REST_API_KEY` / `RIVERR_SHOP_ID` in `.env.example`, main folder `.env.local`, and Vercel | Works locally, 403s in production | loud |

## 6. Tests

The adapter is tested against a **stubbed** `PrintProvider`, not the live API — there is no
sandbox `[D]`, so live tests would print real garments.

| Assertion | Row |
|---|---|
| Submitting the same `Order` twice results in one provider order (unique index rejects the second) | 1 |
| On a simulated timeout, the adapter calls the lookup **before** re-submitting | 2 |
| Lookup finds a matching `orderNumber` → records the id, does not submit again | 2 |
| Poller selects only orders in an open state; a `shipped` order is never re-polled | 3 |
| `getShipment` returning `null` is treated as "not shipped"; an `errors` array marks the order failed | trap |
| A shipment with a null `trackingCode` keeps the order open | edge |
| Print artwork URLs are excluded from the orphan-cleanup candidate set | 4 |

New file `src/services/print-provider/__tests__/riverr-adapter.test.ts` + `test:print-provider`.

## 7. Phases

| # | Ships | User-visible win |
|---|---|---|
| **1** | Admin "paid, not yet submitted" list + manual tracking entry | Staff can fulfil and customers get tracking — **works with no API access** |
| **2** | `PrintProvider` interface + Riverr adapter + reconciliation | Orders submit themselves |
| **3** | Tracking poller cron | Tracking appears without anyone looking |

Phase 1 is deliberately first: it is the failure surface phases 2–3 need anyway, and it is the
whole feature if the supplier never opens the API.

## 8. Rollback

**Kill switch:** an env flag read at adapter construction. Off → the adapter is never called and
every paid order lands in the admin list as "awaiting manual submission". That is phase 1's
normal state, so the off position is a tested code path, not a dead one.

**In-flight:** orders already submitted keep printing; the poller keeps reading their tracking.
Disabling submission does not orphan them.

**Recovery surface:** the admin list itself — the one screen showing paid-but-unsubmitted, plus
retry.

## 9. Open dependencies

| Item | Owner | Asked | Expected | Blocks |
|---|---|---|---|---|
| **Why does `api.riverr.app/graphql` 404 for an authenticated key?** Different hostname, or per-account enabling? Lead with "our key authenticates, the route 404s" so it is not read as a docs question | Riverr / TeePrintCentre | 2026-08-17 | — | **Phases 2–3** |
| Our `shopId` (required on every order) | TeePrintCentre | 2026-08-17 | — | Phase 2 |
| Does `createOrder` pull artwork from the product record? If yes, we can drop permanent artwork hosting | TeePrintCentre | 2026-08-17 | — | Phase 2 design detail |
| Billing model — invoiced in arrears, prepaid, or per-order? | TeePrintCentre | 2026-08-17 | — | Cash-flow planning, not code |
| Are they committed to Riverr? They appear to run DecoNetwork in parallel | TeePrintCentre | 2026-08-17 | — | Whether phase 2 is worth building at all |

**If the answer is no on the endpoint:** phase 1 ships and is the permanent workflow. Phases 2–3
are not built. No customer-facing difference, and specs 1 and 2 are entirely unaffected.

---

## Addendum — 2026-08-19: the API is reachable, and it is REST, not GraphQL

Re-probed with the approved `RIVERR_REST_API_KEY` (28-char Firebase UID). **The earlier conclusion
that the API is unreachable was half wrong**, and the half that was wrong is the important one.

### GraphQL is still not mounted — anywhere

`POST /graphql`, `/api/graphql`, `/v1/graphql`, `/gql`, `/query` all return
`404 Cannot POST …` on **both** `api.riverr.app` and `dev.riverr.app` `[V]`. The published docs
describe an endpoint that does not exist. **Stop treating the docs as the contract.**

The gateway still distinguishes the key correctly, which is how we know auth works:

| Request | Response |
| --- | --- |
| no `x-uid` header | `403 Authentication failed` |
| bogus `x-uid` | `403 Authentication failed` |
| **our real `x-uid`** | **404 — past the gateway, no handler** |

### There IS a live REST API

Found by sweeping resource names rather than trusting the docs `[V]`:

| Endpoint | Status | Body |
| --- | --- | --- |
| `GET /products` | **200** | `{"products":[]}` |
| `GET /shops` | **200** | `{"shops":[]}` |
| `GET /orders` | **200** | `{"orders":[]}` |
| `GET /designs` | **200** | `{"designs":[]}` |
| `GET /catalogs` | 500 | `Cannot read properties of undefined (reading 'replace')` |
| everything else tried | 404 | — |

`/catalogs` throwing a **TypeError rather than a 404** means the route exists and is missing a
required parameter we have not guessed. It is the blank-garment catalogue — the likely source of
GTINs — so it is worth asking them for its parameters specifically.

### The blocker is now precise: our account has no shop

Every collection returns **empty**, including `/shops`. The portal shows three products; the API
says we own zero shops and zero products. So the products live under a Firestore structure the
API does not associate with our UID.

That turns the vague "we need a shopId" question into a sharp one: **`RIVERR_SHOP_ID` is
unset, `/shops` cannot supply it, and until the account is linked to a shop the API returns
empty regardless of what the portal displays.**

Ask TeePrintCentre, in this order:

1. Our **shopId** — and why `GET /shops` returns empty for a key that authenticates.
2. The required parameters for **`GET /catalogs`** (it 500s rather than 404s).
3. Whether products created in the portal are ever visible to the API, or whether the API is
   write-only for orders. If the latter, product/image sync is not possible and the CSV
   fulfilment path stays permanent.

### What this does and does not change

**Does not change:** the CSV fulfilment path still works and is still how orders are handed over.
Nothing built so far is wasted, and the `PrintProvider` service boundary is unaffected.

**Does change:** a REST adapter is a much smaller job than the GraphQL client the spec assumed —
four plain JSON endpoints, no schema, no codegen. The moment a shopId lands, pulling products and
their images becomes viable.

### 2026-08-19, continued — the account is not provisioned, and that is provable

The docs were re-read in full. They describe **only** GraphQL at
`https://api.riverr.app/graphql` authenticated with `x-uid` — exactly what we send, and exactly
what 404s. Documented operations: `getAllShops`, `getShop`, `createShop`, `updateShop`,
`deleteShop`, `getProducts(shopId, limit)`, `getProduct`, `createProduct`, `updateProduct`,
`deleteProduct`. Doc sections: Authentication, Getting Started, **Finding GTINs**, Shops, Orders,
Products, Shipments, Tracking & Fulfillment, Placements, Artwork & Print Files, Errors.

**The docs are stale against the deployment.** The live API is REST.

A Shop in their model is a **connected sales channel**, not the print account —
its fields are `id, name, platformId, platformName, platformShopId, url`. That is what the CSV
upload screen's "Channel → Select Shop" dropdown reads.

**`POST /shops` was attempted** (authorised by the owner) with
`{ name: "Tools Australia", url: "https://toolsaustralia.com.au" }`, and with the payload nested
under `input` to mirror the GraphQL signature. Both returned:

```
500  Value for argument "documentPath" is not a valid resource path.
     Path must be a non-empty string.
```

**Nothing was created** — `GET /shops` still returns `{"shops":[]}` afterwards `[V]`.

That message is a **Firestore SDK error**. Their handler builds a document path from an
identifier that is empty for our key. `GET /catalogs` fails the same way with
`Cannot read properties of undefined (reading 'replace')`, and supplying
`x-enterprise-id` / `x-org-id` / `x-shop-id` / `x-account-id` changes nothing `[V]`.

**Diagnosis: our API key authenticates but is not linked to an enterprise/organisation record.**
Reads return empty because there is no enterprise to scope them to; writes 500 because the
handler cannot build a document path without one. No parameter we can supply fixes this — it is
provisioning on their side.

**This is now a single question, not five.** Ask TeePrintCentre:

> Our API key authenticates — a bogus key returns 403, ours gets through. But `GET /shops`,
> `/products`, `/orders` and `/designs` all return empty, and `POST /shops` fails with a Firestore
> error about an empty `documentPath`. It looks like the key is not associated with an enterprise
> or organisation record. Can you link our account, and confirm our shopId? Also: the published
> docs describe a GraphQL endpoint at `api.riverr.app/graphql` which 404s — the deployed API
> appears to be REST. Which is current?

Until that is answered, **product and image sync is not possible** and the CSV path stays the
fulfilment route. Nothing built depends on the answer.

### 2026-08-19, third pass — the `/docs/reference` schema, and a correction

The `/docs/reference` section is a **generated GraphQL schema reference**, and reading it
overturns part of what was written above. It is rendered client-side, so the page itself lists
only one operation per category; **`/sitemap.xml` carries the full index** `[V]`.

**30 operations, not the ten previously recorded** `[V]`:

| | |
|---|---|
| Shops | `getAllShops` `getShop` `createShop` `updateShop` `deleteShop` |
| Products | `getProducts` `getProduct` `createProduct` `updateProduct` `deleteProduct` |
| **Blanks** | **`getBlankProducts`** `getDecorationMethods` `getPlacements` |
| Orders | `getOrders` `getOrder` `createOrder` `createOrderFromGtin` `updateOrder` |
| Shipping | `getShipments` `getShipment` `getShippingPrices` `getShippingSpeeds` `getAvailableShippingSpeeds` `saveShippingPrice` `saveShippingSpeed` `updateShippingPrice` `deleteShippingPrice` `deleteShippingSpeed` `addShippingUpgradeToOrder` |

Types include `blank-product`, `blank-variant`, `blank-variant-image`, `shipping-price`,
`shipping-price-country`, `placement`, `decoration-method`, `variant-mapping` `[V]`.

**Correction: "product and image sync is not possible" was wrong.** It was written after
`GET /catalogs` 500'd, and `/catalogs` was the only catalogue route tried. The operation list
named the right one.

```
GET /blank-products    200    15 blank products, 178 KB
```

#### What the blank catalogue actually contains `[V]`

| id | supplier | product | variants | images |
|---|---|---|---|---|
| `ASAU5001` | Ascolour Australia | **Staple Tee \| 5001** | **563** | 157 |
| `ASAU5101` | Ascolour Australia | Supply Hood \| 5101 | 115 | 38 |
| `ASAU5146` | Ascolour Australia | Heavy Hood \| 5146 | 63 | 22 |
| `ASAU4001` | Ascolour Australia | Wo's Maple Tee \| 4001 | 332 | 108 |
| `ASAU3005` / `ASAU3006` | Ascolour Australia | Kids / Youth Staple Tee | 60 / 100 | 51 / 51 |
| `ASAU5025` | Ascolour Australia | Barnard Tank \| 5025 | 0 | 30 |
| `SS5000` `SS64000` `SS65000` `SSSF500` | S&S Activewear (US) | Gildan / Softstyle tees + hood | 403–518 | — |
| 2 × Ramo, 2 × Aussie Pacific | | Ringer Tee, Raglan Tee, AP Torquay Hoodie ×2 | | |

**Staple Tee 5001 — 75 colours × 9 sizes (XS–5XL)** `[V]`. Variant ids encode both:
`5001-FOREST-I-L` → `{style}-{COLOUR}-{sizeIndex}-{size}`. Colours run `ARC_B, ARMY, ATLAN,
BLACK, BONE, … WHITE, YELLO`.

Images are `{ type, url }` on BigCommerce CDN URLs. `type` is `primary`, `front` or `back` for
exactly one image each; the other 154 are `type: null` **per-colour thumbnails with the colour in
the filename** — `5001_STAPLE_TEE_FOREST_GREEN_THUMB__66860…jpg` `[V]`. So a colour swatch UI is
buildable today: parse the colour from the variant id, match the thumbnail by filename.

**Use the LIST endpoint, not the detail one.** `GET /blank-products/{id}` returns 200 but *omits*
`blankSettings` — the object holding placements, pricing pointers and `blankVariantIds`. The list
response is strictly richer `[V]`.

`blankSettings.placements` gives **decoration prices**: `{"1":{printingPrice:10},
{"2":{printingPrice:10}, "3":{printingPrice:5}}` — front $10, back $10, left chest $5, matching
our existing PLACEMENTS map `[V]`. `upcharge: 10`, `vatPercent: 0`.

**Blank garment cost is still not exposed.** It sits behind `pricingTableId` and
`decorationMethodPricings` — opaque ids `[V]`. `GET /shipping-prices` returns
`401 {"requiresAdmin":true}` `[V]`, so the freight rate card is a role we do not hold. Both stay
supplier questions; the pricing model already uses the quoted $9–$15 freight and is unaffected.

#### The GraphQL 404, now proven rather than asserted

Auth runs **before** routing, which makes the two responses diagnostic `[V]`:

| request | status | body |
|---|---|---|
| `POST /graphql` **without** `x-uid` | 403 | `{"message":"Authentication failed.","status":403}` |
| `POST /graphql` **with** our `x-uid` | 404 | `<pre>Cannot POST /graphql</pre>` (Express default) |

Our key authenticates. The GraphQL route is simply **not deployed** — the docs describe a surface
this deployment does not serve. `x-powered-by: Express`, `server: Google Frontend`.

The docs also state: *"Until you rotate, the key is your user ID."* So `x-uid` is literally a
Riverr user id, which is consistent with everything above.

#### Revised standing: one blocker, not five

Tenant-scoped reads (`/products`, `/shops`, `/orders`, `/designs`) return empty and `POST /shops`
500s on a Firestore `documentPath` — still consistent with the account not being linked to an
enterprise. But **public data reads fine**, so the key is not broken and the integration is not
dead. The revised ask is unchanged in substance and smaller in scope: link the account, confirm
the shopId, publish the blank cost + freight tables, and say whether GraphQL or REST is current.

**Nothing built depends on this.** CSV remains the fulfilment route. What changed is that
sourcing product imagery and the colour matrix no longer waits on the supplier.

---

## Addendum — 2026-08-20: the docs were right all along

The provider replied. Two of this spec's load-bearing conclusions were wrong, and the way they
were reached matters more than the conclusions themselves.

### What was actually true

| This spec said | Reality |
| --- | --- |
| "The published docs describe an endpoint that does not exist. **Stop treating the docs as the contract.**" | The docs were correct. `api.riverr.app/graphql` with `x-uid` is exactly right. Their deployment was down; they have since fixed it — *"The earlier 404 on that URL is resolved."* |
| "The live API is REST." | There are **two** APIs. The REST paths found by sweeping resource names are their internal **dashboard** API. The partner API is the documented GraphQL one. |
| "Our API key authenticates but is not linked to an enterprise/organisation record." | The account was correctly linked the whole time. `/shops` returned `[]` because it is a dashboard endpoint, not because we owned no shops. `getAllShops` on GraphQL returns `qTJGkvBReIRL3NU6DrLA` · Tools Australia. |
| "`POST /shops` fails with a Firestore error → provisioning bug on their side." | It is their internal store-create path. Not a bug, not ours to call. |

Both documentation hosts (`developers.riverr.app`, `riverr-openapi-docs.web.app`) were re-fetched
2026-08-20 and carry **identical** content: GraphQL only, one endpoint, `x-uid`. There was no
stale mirror and no misreading.

### The actual failure mode — worth more than the corrections

**Not a reading failure. A re-testing failure.**

The docs were read three times, carefully enough to discover that the reference page renders
client-side and that `/sitemap.xml` was needed to enumerate all 30 operations. That part was fine.

What went wrong: a **point-in-time probe became a permanent fact.** `POST /graphql` 404'd on
2026-08-19. That supported exactly one claim — *this endpoint is not answering right now*. What
got written down was *their documentation is unreliable*, which is a claim about a different
thing entirely, and it was propagated into `client.ts`, `fulfilmentExport.ts`, `gotchas.md`,
`architecture.md`, `backend.md` and `docs/admin/frontend.md` as settled truth. Nothing re-probed
it for a day, and every subsequent observation was then interpreted *through* that model rather
than used to test it.

The same shape recurred on 2026-08-20: the rotated `rv_live_` key was tested against REST only,
returned 403, and was declared dead — without ever being tried on the surface it was issued for.
A control was used for *authentication* but not for *surface*. Key × surface is a 2×2; one cell
was tested and the result generalised to all four.

### Rules this produces

1. **A negative result about a third party's infrastructure carries an expiry date.** Record when
   it was observed and re-probe before building on it. "Their endpoint 404s" is not the same
   class of fact as "our function returns Y" — one of them can change without anyone telling us.
2. **"Stop trusting the docs" is a signal to ask the vendor, not to go exploring.** Undocumented
   endpoints found by sweeping resource names are undocumented *for a reason*. Here they were an
   internal dashboard API, and their responses were actively misleading.
3. **Vary every axis before concluding.** If there are two keys and two surfaces, that is four
   probes, not one.
4. **State the claim the evidence supports, not the claim it suggests.** "This route is not
   answering" and "these docs are wrong" are different assertions with different blast radii.
