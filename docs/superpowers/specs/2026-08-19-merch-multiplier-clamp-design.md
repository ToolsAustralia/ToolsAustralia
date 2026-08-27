# Shop — an admin clamp on the merchandise entries multiplier

Amends `2026-08-17-shop-entries-design.md`. That spec's decision row "merch inherits the
one-time pack multiplier" **stands**; this adds the ability to inherit *less*, never more.

**Revised 2026-08-20** — the clamp is set at **three tiers** (product → category → shop-wide)
rather than shop-wide alone, on the owner's instruction ("per product or per category… the more
flexible, the better"). Tiering is safe here *only* because the control is a ceiling: `min` is
applied once, after resolution, so no tier can raise merch above the packs. The same three tiers
on an unbounded multiplier would be three ways to reverse the 2026-08-17 invariant.

Provenance tags: `[V]` verified (read the code, `file:line` shown) · `[D]` documented, not
confirmed in code · `[A]` assumed, with what would confirm it.

---

## 1. Problem and done

A one-time pack promo silently multiplies merchandise entries with no way to opt out. The shop
grant hard-codes `getActivePromoMultiplier("one-time")`
`[V src/services/stripe-webhook-handlers/index.ts:866]` and the product page hard-codes
`useResolvedMultiplier("one-time-packages")`
`[V src/app/(site)/shop/[slug]/components/ProductInteractions.tsx:235]`. A 10× pack weekend
therefore mints 10× merch entries whether or not that was intended.

**Done when** an admin can set a merch multiplier ceiling — for one product, for a category, or
for the whole shop — from the Products tab, the product page
and the grant both honour it, and the value actually applied is recorded on the order. Observable:
with one-time at 10× and the merch cap at 1×, a tee order grants exactly its base entries.

**Failure** is any path where the cap raises merch above its inherited value, or where the page
promises one number and the grant writes another.

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| Direction of the control | **Downward-only clamp: `min(inherited, cap)`** | Preserves the owner's 2026-08-17 invariant ("merch cannot overtake the packs") *by construction*, so no test, doc or BUSINESS.md line needs retracting. An unbounded merch rate reverses that decision — see §9 D1 |
| Granularity | **Three tiers: product → category → shop-wide, most specific wins** | Asked for by the owner. Costs one product field and one map, because every tier feeds the *same* `min` — flexibility here cannot buy a way to overtake the packs |
| Category key | **Normalised: `category.trim().toLowerCase()`** | `category` is free text `[V Product.ts:137-141]` behind a free-text admin input `[V AdminProductModal.tsx:364-369]`, and the vocabulary is **already forked** — `"Apparel"` from the sync `[V printProviderSync.ts:226]` beside `"power-tools"` and `"measuring"` from the seeds `[V dev DB, 6 products]`. Keyed on the raw string, a cap stops matching the moment someone retypes the category, silently |
| Tier miss | **`undefined`/absent falls through; only an explicit number stops the chain** | `null` at a tier would be ambiguous with "inherit". Absence means "ask the tier above", a number means "cap here" — one meaning each |
| Mechanism | **A field, not a fourth promo type** | A `merch-packages` promo type is ~40 edit sites across four Mongoose enums `[V Promo.ts:21, ScheduledPromo.ts:32, AlternatingPromoMultiplier.ts:18, BonusEntryPromo.ts:32]`, nine admin `z.enum` validators and four Norm schema copies. It buys scheduling and alternation for merch that nobody asked for |
| Storage | **Shop + category caps on a new singleton `ShopEntryMultiplierConfig`; the product cap on `Product` itself** | The product tier belongs beside `includedEntries`, which is already product-level and admin-editable `[V AdminProductModal.tsx:392]`. `UpsellMultiplierConfig` means *upsell category* multipliers; adding a merch key there forks the concept and its PUT route silently strips unknown keys `[V src/app/api/admin/upsell-multipliers/route.ts:11-15]` |
| "No cap" value | **`cap: number \| null`, null = inherit** | `PROMO_MULTIPLIERS` starts at 2 `[V src/types/promo-multiplier.ts:13]`, so it has no "off". A nullable int 1–10 gives both an explicit 1× and an explicit inherit |
| Resolution point | **One helper, called by both sides** | Display and grant are independent reads separated by the whole checkout. Two call sites resolving separately is how the page promises 40 and the grant writes 8 |
| Grant arithmetic | **Per line: `Σ(line.includedEntries × line.qty × resolve(line))`** | Today the grant sums every line then multiplies once `[V finalizeShopOrder.ts:84-87]`. That is only correct while all products share one rate. A capped tee and an uncapped hoodie in one order cannot both be honoured by a single scalar — the tiering makes a mixed cart reachable, so the arithmetic has to move inside the loop |
| Where the product tier lives at grant time | **Snapshotted onto the order line** | The webhook never loads products, and the line already freezes `includedEntries` and `category` for exactly this reason `[V Order.ts:112-140]`. The rule: **product data is snapshotted, config resolves live** — so `entryMultiplierCap` joins the snapshot while the category and shop caps resolve at webhook time alongside the promo |
| Snapshot | **Persist the applied multiplier per line, not on `Order`** | Fixes display-vs-grant drift *and* the redelivery-retry drift in one change — see §4 |
| Permission | **`shop.edit`** | Already exists `[V src/lib/permissions.ts:39]` and matches the domain. Sibling multiplier writes use three different permissions; the domain match is the tiebreaker |
| Panel location | **Products tab** | Where `ProductManagement` and `PrintProviderSync` already sit; matches `shop.view` / `shop.edit` |

**Sections 1–2 require sign-off before 3–9 are treated as settled.**

## 3. Starting state (verified)

| Fact | Evidence |
|---|---|
| Merch entries are **off**; every synced garment ships at 0 | `includedEntries: 0,` `[V src/services/shop/printProviderSync.ts:229]` |
| A zero short-circuit returns before `processPaymentBenefits` | `if (entries <= 0)` `[V src/services/shop/finalizeShopOrder.ts:92-98]` |
| Entries are off **pending a trade-promotion permit variation** | `[V BUSINESS.md:80-82]` |
| One resolution chain, not two | `getActivePromoMultiplier` is a thin wrapper over `PromoMultiplierResolverService` `[V index.ts:311-321]` |
| Canonical chain: Scheduled → Toggle → Alternating → derived-from-membership → none | `[V PromoMultiplierResolverService.ts:139-183]` |
| Resolver returns `null` when nothing is active; `1` is introduced by the caller's `?? 1` | `[V :183, index.ts:317]` |
| Base entries are **already** admin-editable | `[V src/components/modals/AdminProductModal.tsx:392; src/app/api/admin/products/route.ts:30]` |
| `shop` permission already exists | `shop: ["view", "edit", "delete"],` `[V src/lib/permissions.ts:39]` |
| Norm already publishes a merch entry-count field | `shop: z.number(),` `[V src/lib/internal-norm/schemas/major-draw.ts:163]` |

**Latent failures that arm the moment entries go non-zero** (all pre-existing, none introduced here):

| # | Failure | Evidence |
|---|---|---|
| L1 | The ladder guard test is **already dead** — it divides both sides by the same `m`, so all four iterations are identical and it asserts nothing about multipliers | `[V src/utils/payment/__tests__/shop-entry-grant.test.ts:228-241]` |
| L2 | A print-provider re-sync **re-zeroes** `includedEntries`, revoking entries the page was promising | `[V printProviderSync.ts:229]` |
| L3 | A full refund reverses draw entries but never clears `Order.entriesGranted`, so order history still reads "Includes N free entries" | `[V src/utils/payment/refund-ledger-reversal.ts:158-166]`; refund-processing never imports `Order` |
| L4 | Shop routes as `new_purchase`, which resolves **only** an `active` draw — during a freeze the grant throws `GATES_CLOSED`, the throw is swallowed, and `entriesGranted` is still written | `[V src/utils/draws/major-draw-helpers.ts:132-135; payment-processing.ts:2246, :2427]` |
| L5 | `reconcile-major-draw-entries` scopes to one-time/upsell/membership and its zero-init omits the `shop` bucket, so it can neither see nor heal a shop grant | `[V scripts/reconcile-major-draw-entries.ts:87-99, :162-171]` |
| L6 | No ceiling anywhere: `includedEntries` is `int >= 0` with no max, and `baseEntries * entryMultiplier` has no clamp | `[V Product.ts:225-229; finalizeShopOrder.ts:87]` |

L1 and L6 are in scope (§6, §4). L2–L5 are **out of scope and must not be silently inherited** —
they are listed in §9 as pre-existing debt so this spec is not read as having fixed them.

## 4. Design

**Data model.** New singleton, mirroring `UpsellMultiplierConfig`'s `getOrCreate` shape
`[V src/models/UpsellMultiplierConfig.ts:48-53]`:

```
ShopEntryMultiplierConfig  (_id: "shop-entry-multiplier-config")
  cap:           Number | null        // shop-wide. null = inherit one-time unchanged; 1–10 otherwise
  categoryCaps:  Map<string, Number>  // key = category.trim().toLowerCase(); absent = fall through
  updatedBy:     ObjectId → User
  timestamps

Product
  entryMultiplierCap: Number | null   // this product only. null/absent = fall through
```

A Mongoose `Map` rather than an array of `{category, cap}`: a map cannot hold two rows for the
same key, so the "which one wins" question never arises. Keys are normalised on write **and** on
read — the one place a forked vocabulary would otherwise bite.

**Resolution.** One exported helper, the only thing either side calls:

```
resolveShopEntryMultiplier({ category, entryMultiplierCap }):
  inherited = await getActivePromoMultiplier("one-time")   // already ?? 1
  config    = await ShopEntryMultiplierConfig.getOrCreate()

  cap = entryMultiplierCap                                 // 1. this product
     ?? config.categoryCaps.get(norm(category))            // 2. its category
     ?? config.cap                                         // 3. the whole shop
     ?? null                                               // 4. inherit unchanged

  return cap == null ? inherited : Math.min(inherited, cap)
```

`Math.min` is the whole safety argument, and it sits **outside** the tier chain deliberately: the
returned value can never exceed `inherited` no matter which tier supplied the cap, so the
2026-08-17 invariant holds by construction rather than by four separate runtime checks.

The helper takes the *product*, not a product id — both callers already hold the document
`[V ProductInteractions.tsx:235; finalizeShopOrder.ts:87]`, and a second fetch inside the grant
path is a read the webhook does not need.

**API.** `GET`/`PUT /api/admin/shop/entry-multiplier`, gated by `shop.edit`, Zod
`{ cap: z.number().int().min(1).max(10).nullable() }`, writing a `StaffActivity` row recording old
value → new value → actor.

**Snapshot.** `Order.products[].entryMultiplierApplied: Number` written in the same save as `entriesGranted`
`[V finalizeShopOrder.ts:121]`, one per line — an order-level scalar stops describing a mixed
cart, and per-line is what support needs anyway to answer "why did this item give three".
Without it, a Stripe redelivery re-resolves fresh
`[V finalizeShopOrder.ts:193-196]` and two buyers at the same instant can receive different counts
across a promo boundary.

**Edge and failure states.**

| Case | Behaviour |
|---|---|
| Every tier absent (default) | Byte-for-byte today's behaviour. This is the ship-dark state |
| Product cap set, category cap also set | Product wins. Most specific stops the chain |
| **Mixed cart** — capped tee + uncapped hoodie in one order | Each line resolves and multiplies independently, then the order sums. The single-scalar version silently applied one line's rate to the other | 
| Line snapshotted before a cap existed (order placed pre-deploy) | `entryMultiplierCap` absent ⇒ falls through to category, then shop. Old orders keep behaving as they did | 
| Category renamed on a product | That product falls through to the shop tier. **Silent** — normalising the key removes the casing/whitespace half of this; a genuine rename is a real category change and should fall through |
| Category cap set for a category no product uses | Inert. Kept, not pruned — the category may be re-added, and silently dropping an admin's setting is worse |
| Any tier's cap > inherited | `min` returns inherited. Raising is structurally impossible at every tier, not merely validated |
| `cap` set while a checkout is in flight | Grant uses the value at webhook time; the snapshot records which was used, so support can answer "what did they actually get" |
| Config read throws | Helper must fall back to `inherited`, never to 1 — a DB blip must not silently withhold promised entries |
| `includedEntries` still 0 | Zero short-circuit fires first `[V :92]`; the cap is inert. Correct while the permit is pending |
| Stripe webhook times out mid-grant | Unchanged by this spec. `entriesGranted === undefined` remains the "money taken, entries owed" marker `[V :109-118]` |

## 5. Threading checklist

| # | Location | Change | Miss it and… | Mode |
|---|---|---|---|---|
| 1 | `src/models/ShopEntryMultiplierConfig.ts` (new) | Interface **and** schema block, `cap` **and** `categoryCaps` | Mongoose strict mode drops the path on save; `tsc` stays green; the cap is permanently null and the admin's setting vanishes on reload | **silent** |
| 1b | `src/models/Product.ts` | `entryMultiplierCap` in interface **and** schema | Same strict-mode drop. The per-product tier appears to save and never applies | **silent** |
| 1c | `src/app/api/admin/products/route.ts` (POST + PUT allow-lists) | Accept `entryMultiplierCap` | Field is stripped at the boundary before Mongoose ever sees it — the modal writes, the DB never changes | **silent** |
| 2 | `src/services/shop/resolveShopEntryMultiplier.ts` (new) | Tier chain **then** one `min` | Applying `min` per tier, or ordering the chain shop-first, silently returns the wrong tier's cap | **silent** |
| 2b | same | `norm()` used on **both** write and read of a category key | "Apparel" saved, "apparel" looked up: cap never matches, no error | **silent** |
| 3 | `src/services/stripe-webhook-handlers/index.ts:866` | Swap `getActivePromoMultiplier("one-time")` → helper | **The grant ignores the cap entirely.** Page shows 1×, buyer receives 10× | **silent** |
| 4 | `src/app/(site)/shop/[slug]/components/ProductInteractions.tsx:235` | Read the capped value **for this product** | Page advertises 10× while the grant honours 1×. We promised more than we gave | **silent** |
| 4b | `src/app/(site)/shop/[slug]/page.tsx` projection | Include `entryMultiplierCap` | Field absent from the page's product ⇒ product tier silently skipped on the display side only ⇒ page and grant disagree | **silent** |
| 5 | `src/models/Order.ts` | Add `entryMultiplierCap` **and** `entryMultiplierApplied` to the **line** interface **and** schema | Same strict-mode drop as #1. Worse here: the cap silently never reaches the webhook, so the product tier appears to work on the page and does nothing to the grant | **silent** |
| 5b | wherever order lines are built at checkout | Copy `entryMultiplierCap` from the product onto the line | Cap is null on every line ⇒ product tier is dead in the grant while alive on the page | **silent** |
| 5c | `src/services/shop/finalizeShopOrder.ts:84-87` | Move the multiply **inside** the reduce | A mixed cart grants one line's rate to every line. No error, wrong numbers | **silent** |
| 6 | `src/services/shop/finalizeShopOrder.ts:121` | Persist the applied value | Redelivery re-resolves; no record to arbitrate a dispute | **silent** |
| 7 | `src/app/api/admin/shop/entry-multiplier/route.ts` (new) | Zod + `shop.edit` + audit | Unpermissioned write, or "who set this" unanswerable | loud / **silent** |
| 8 | `src/app/admin/component/adminTabs.ts` | Mount the panel on Products | Panel unreachable | loud |
| 8b | `src/components/modals/AdminProductModal.tsx` | Per-product cap input beside `includedEntries` | Product tier exists but is unreachable without a DB write | loud |
| 9 | `src/utils/payment/__tests__/shop-entry-grant.test.ts:228` | Rewrite to take **two** multipliers | The dead test stays green and the invariant is untested forever (L1) | **silent** |
| 10 | `docs/cart-shop-products/` + `docs/admin/` | Both domains match | doc-sync Stop hook blocks | loud |
| 11 | `BUSINESS.md` §merch table row "Promo multiplier" | Record the clamp | Rule 5 hook blocks; business doc asserts a stale mechanic | loud |
| 12 | `src/lib/internal-norm/` | Mirror or record a deliberate non-mirror (rule 10) | Norm's merch entry field drifts from reality | **silent** |

Rows 1, 1b, 1c, 2, 2b, 3, 4, 4b, 5, 6, 9 and 12 are **silent** — the compiler cannot catch any of
them. Each has a matching assertion in §6. The tier chain roughly doubled the silent count: every
new tier is another place a value can be accepted, stored and then quietly not applied.

## 6. Tests

| Assertion | Covers | Level |
|---|---|---|
| `cap: 3` round-trips through save and re-read | Row 1 strict-mode drop | DB |
| `categoryCaps` map round-trips with two keys | Row 1 strict-mode drop | DB |
| `Product.entryMultiplierCap` round-trips **through the admin PUT route**, not just a direct save | Rows 1b + 1c together — a model-only test passes while the route strips the field | DB |
| `min(10, 1) === 1`, `min(2, 5) === 2`, `min(x, null) === x` | Helper algebra | unit |
| Product cap beats category beats shop beats inherit — all four tiers, one product | Tier order | unit |
| `"Apparel"`, `"apparel "`, `"APPAREL"` all hit one `"apparel"` cap | Row 2b — the forked-vocabulary trap | unit |
| A category with no cap falls through to shop-wide rather than to 1 | Fall-through, not fail-closed | unit |
| Helper never returns > inherited — full 1–10 × 1–10 matrix **× every tier combination** | The invariant itself, at every tier | unit |
| Grant writes `base × qty × capped`, asserted **from Mongo** | Row 3 | DB |
| **Mixed cart**: tee capped at 1×, hoodie uncapped, one order, promo at 5× ⇒ tee grants base, hoodie grants base×5, order total is their sum | Row 5c — the defect the single scalar hides | DB |
| Checkout copies `entryMultiplierCap` onto the line, asserted from the saved order | Row 5b | DB |
| Page-resolved value === grant-resolved value for the same config | Row 4 — the display trap | unit |
| `entryMultiplierApplied` persisted and re-read | Rows 5, 6 | DB |
| Replay of the same PaymentIntent grants exactly once | Money path | DB |
| Ladder test rewritten: `per(pack, mPack) < per(tee, mMerch)` across the 1–10 × 1–10 matrix | Row 9 / L1 | unit |

Extends `src/utils/payment/__tests__/shop-entry-grant.test.ts`, which already runs against a real
DB via `E2E_MONGODB_URI` `[V :39]`. New `test:*` entry required in `package.json` if a second file
is added.

## 7. Phases

| # | Ships | User-visible win |
|---|---|---|
| 1 | Both models + tiered helper + rewritten ladder test | The invariant is genuinely tested for the first time, at every tier (closes L1) |
| 2 | Both call sites read the helper; snapshot on `Order` | Page and grant provably agree; every order records what it used |
| 3 | Admin route + Products-tab panel (shop + category) + per-product field on the product modal | An admin can hold one garment, one category, or the whole shop at 1× through a pack promo |
| 4 | Norm mirror or recorded non-mirror; BUSINESS.md + domain docs | Rules 5 and 10 satisfied |

Phase 1 ships alone and is worth shipping alone even if 2–4 never land.

**Status 2026-08-20 — phases 1–3 shipped, phase 4 partial.**

| Phase | State | Evidence |
| --- | --- | --- |
| 1 | done | `models/ShopEntryMultiplierConfig.ts`, `entryMultiplierCap` on `Product` + `Order` line, `services/shop/resolveShopEntryMultiplier.ts`. Ladder test rewritten (closes L1) — 21 assertions green in `npm run test:shop-entries` |
| 2 | done | Grant loops **per line** and records `entryMultiplierApplied` per line; PDP resolves the ceiling server-side and applies the same `min` client-side |
| 3 | done | `GET`/`PUT /api/admin/shop/entry-multiplier` (`shop.view` / `shop.edit` + `StaffActivity`), `ShopEntryMultiplierPanel` on the Products tab, per-product field on the product modal |
| 4 | partial | Domain docs, BUSINESS.md, CUSTOMER.md and `norm-context.md` updated. **No Norm endpoint wired** — see D2, still the owner's call |

**Assertions were mutation-tested, not merely observed green** — the lesson of L1. `Math.min` →
`Math.max` fails 3; dropping `toLowerCase()` from the category key fails 5; removing
`entryMultiplierCap` from the `Order` line schema fails 1.

**Not done, and not claimed:** nobody has clicked through the panel against a real order. The
whole feature multiplies zero until D0 lands, so a UI smoke test is the last step before it can
matter — not the first.

## 8. Rollback

`cap = null` restores today's behaviour exactly, with no deploy — that is the kill switch, and it
is the default. In-flight orders are unaffected: the grant resolves at webhook time and records
what it used, so nothing needs replaying. The recovery surface for a half-completed grant is
unchanged: `entriesGranted === undefined` means money taken and entries owed
`[V finalizeShopOrder.ts:109-118]`.

## 9. Open dependencies

| # | Item | Owner | Asked | Blocks |
|---|---|---|---|---|
| **D0** | **Trade-promotion permit variation for a fourth entry method.** Entries on merch are off until this lands `[V BUSINESS.md:80-82]`. Separately: does the permit allow merch to carry a rate that *differs* from the packs? No code can answer this | DJ → regulator | open (item #34) | **All phases are inert until this lands.** Phases 1–3 are safe to build and ship dark; the cap multiplies zero until it does |
| **D1** | **Is the 2026-08-17 "merch inherits" decision being reversed?** This spec assumes **no**. If merch should be able to exceed one-time, this design is wrong and the fourth-promo-type design (~40 sites) is needed instead | DJ | 2026-08-19 | Sections 3–8 |
| D2 | Mirror to Norm now, or record a deliberate non-mirror? Rule 10 is lockstep, not flag-only, because Norm already wraps `PromoMultiplierResolverService` | DJ | 2026-08-19 | Phase 4 |
| D3 | Pre-existing debt L2–L5 (re-sync zeroing, refund not clearing `entriesGranted`, freeze-window grant, reconciler blindness). Not fixed here | DJ | 2026-08-19 | Nothing in this spec; arms when D0 lands |

**Rule 11 note.** The justification for the clamp is a per-entry *value* comparison. That reasoning
is internal only. No customer-facing string may carry a per-entry figure — see rule 11.
