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

**Conclusion `[A]`:** the GraphQL API is documented but not deployed at that hostname, or needs
per-account enabling. Only the supplier can resolve it — more probing will not.

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
| 5 | `RIVERR_API_KEY` / `RIVERR_SHOP_ID` in `.env.example`, main folder `.env.local`, and Vercel | Works locally, 403s in production | loud |

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
