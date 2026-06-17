# Australia Delivery-Fee Calculation — Research Findings & Integration Plan

**Scope:** How online shops in Australia calculate delivery/shipping fees, how to pull that data, and how to integrate it into our shop. Covers calculation methods, the cubic-weight mechanic, direct carrier APIs, multi-carrier aggregator platforms, freight/LTL for bulky goods, build-vs-buy total cost of ownership, the concrete integration architecture for our Next.js + MongoDB + Stripe stack, plus future growth (multi-warehouse, dropship) and a light touch on international.

**Our context (what this is tuned to):** custom Next.js 15 + MongoDB/Mongoose + Stripe shop, **single warehouse in Victoria (VIC)**, selling tools/hardware that span **small hand tools to mega-large heavy items** (big toolboxes, workshop storage cabinets), **Australia-only delivery for now** (international is a multi-year "later"). The shop is built but not launched; today it uses a hard-coded **flat $10 fee (free over $100)** with no weight/dimension data on products.

**Researched & fact-checked:** June 2026 (multi-agent web research with adversarial verification of pricing/capability claims). **All dollar figures and plan tiers are volatile — re-verify against the live source before you hard-code anything.** See [§11 Recency & verification caveats](#11-recency--verification-caveats).

---

> ## ⚠️ Critical correction — Sendle has shut down
>
> Sendle (a long-standing flat-rate AU small-parcel carrier that many "best AU shipping API" articles still recommend) **ceased all operations in Australia on 11 January 2026 and entered liquidation in February 2026**, after financial problems following its merger into the FAST Group / FirstMile / ACI Logistix. It stopped accepting bookings overnight and stranded thousands of small businesses.
> Sources: [Shippo](https://goshippo.com/blog/sendle-has-ceased-all-operations-as-of-january-2026) · [ACS Information Age](https://ia.acs.org.au/article/2026/sendle-shuts-down-after-12-years---100m-in-funding.html) · [The New Daily](https://www.thenewdaily.com.au/finance/consumer/2026/01/12/sendle-shut-down-australia) · [Shippit](https://www.shippit.com/blog/sendle-shut-down-in-australia-shipping-alternatives)
>
> **Do not integrate Sendle.** Its API docs are still online, which is exactly why one of our research passes initially treated it as live. It is included below only as the textbook argument for **carrier-agnostic design**: never hard-wire a single carrier — put rate fetching behind a swappable provider interface so a carrier failure is a config change, not a rebuild.

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Recommendation at a glance (phased)](#2-recommendation-at-a-glance-phased)
3. [How delivery fees are calculated in Australia](#3-how-delivery-fees-are-calculated-in-australia)
4. [Direct carrier APIs](#4-direct-carrier-apis)
5. [Multi-carrier aggregator platforms](#5-multi-carrier-aggregator-platforms)
6. [Build vs buy — total cost of ownership](#6-build-vs-buy--total-cost-of-ownership)
7. [Integration architecture for our stack](#7-integration-architecture-for-our-stack-nextjs--mongodb--stripe)
8. [Growth: multi-warehouse & dropship](#8-growth-multi-warehouse--dropship-future)
9. [International shipping (future, multi-year)](#9-international-shipping-future-multi-year)
10. [Final recommendation & roadmap](#10-final-recommendation--roadmap)
11. [Recency & verification caveats](#11-recency--verification-caveats)
12. [Key sources](#12-key-sources)

---

## 1. Executive summary

- **There is no single "delivery fee API" — there is a calculation model.** Australian shops combine ~10 methods (flat, free-over-threshold, weight-based table rates, **cubic/volumetric** rating, zone/postcode tiers, live carrier rates, surcharges). The right method depends on what you ship.

- **The mechanic that breaks our flat $10 stub is cubic (volumetric) weight.** AU carriers charge the **greater of actual (dead) weight vs cubic weight**, where cubic weight = `L × W × H (m) × 250` for parcel/express freight (250 kg per m³; equivalently `cm³ ÷ 4000`). A light-but-bulky storage cabinet can have a cubic weight many times its dead weight. A flat $10 fee will **lose money on every large item** and overcharge small ones. This is confirmed across Australia Post, Aramex, CouriersPlease and TNT. ([AusPost cubic weight](https://auspost.com.au/business/business-ideas/ecommerce-jargon-busters/what-is-cubic-weight), [Aramex CoC](https://www.aramex.com.au/terms-and-conditions/conditions-of-carriage/domestic-conditions-of-carriage/), [TNT](https://www.tnt.com/express/en_au/site/how-to/calculate-size-and-weight.html))

- **Our catalogue spans two shipping regimes, so we need two rate paths.** Standard parcels cap at **22 kg / 105 cm longest side / 0.25 m³** (Australia Post). Anything above that is **freight / LTL / pallet**, rated per-consignment with bulky surcharges (tail-lift, hand-unload, oversize, fuel levy). Toolboxes and cabinets will routinely cross that line. ([AusPost size & weight](https://auspost.com.au/business/shipping/guidelines/size-weight-guidelines))

- **The most stable, proven, lowest-friction starting point is the Australia Post PAC API.** It's **free** (just an API key in an `AUTH-KEY` header, no eParcel contract, no per-call fee), returns full retail rates for domestic parcels from `from_postcode + to_postcode + dimensions + weight`, and is the de-facto rate engine for thousands of AU shops. Its limitation is that it returns **retail** rates only (not negotiated discounts) and only covers the **parcel** regime. ([AusPost PAC tutorial](https://developers.auspost.com.au/content/apis/pac/tutorial-domestic-parcel-options.html), [PAC registration](https://developers.auspost.com.au/apis/pacpcs-registration))

- **For multi-carrier + freight + labels/tracking, the AU-native leaders are Shippit and Starshipit;** the zero-commitment options are **Interparcel** and **Transdirect** (free to join, pay-per-shipment, REST APIs, include freight carriers). Global APIs (EasyPost, Shippo, ShipStation) are **USD-billed and US-centric** with thin AU carrier depth — a poor fit for an AU-only shop. ([Shippit](https://www.shippit.com/pricing), [Starshipit](https://support.starshipit.com/articles/4408809144463-multi-origin-shipping-rates-with-the-starshipit-api), [Interparcel](https://au.interparcel.com/content/ecommerce-shipping-platform), [Transdirect](https://www.transdirect.com.au/education/developers-centre/))

- **GST applies to shipping.** Under ATO ruling **GSTD 2002/3**, a delivery charge supplied with taxable goods is itself a taxable supply — so shipping carries **10% GST** in line with the goods. Our cart already applies 10% GST; shipping must sit inside that.

- **Free shipping is the strongest conversion lever, but a single flat fee/threshold is dangerous for heavy goods.** ~56% of AU shoppers rank free delivery as their top preference and shipping cost is the #1 cart-abandonment cause; the proven AU pattern is a **conditional free-shipping threshold** (~20–30% above AOV) **with heavy/bulky items carved out** so a $10 fee doesn't have to absorb $80 of freight. ([Australia Post eCommerce reports](https://auspost.com.au/business/marketing-and-communications/access-data-and-insights/ecommerce-trends))

- **Bottom line for us:** add weight + dimensions to products, build a small server-side rate engine that mirrors the proven "**zone → method**" model, wire **Australia Post PAC** for parcels with a **freight path** (aggregator or contracted carrier) for oversized items, keep a **deterministic flat/table-rate fallback**, and keep it all behind a **swappable provider interface**. Graduate to a contract (eParcel) or an aggregator once volume justifies negotiated rates.

---

## 2. Recommendation at a glance (phased)

| Phase | What | Why |
|---|---|---|
| **0 — Data foundation** | Add numeric **weight (kg)** + packaged **L/W/H (cm)** + **shipping class** (parcel / oversized-freight) + optional **free-shipping flag** to the Product model. Add **shippingFee + carrier + service + quotedAt** to the Order. | Nothing accurate is possible without per-product weight/dimensions. Today weight only exists as free-text inside `specifications` (e.g. `"2.3kg"`), unusable for rate calc. |
| **1 — Launch (most proven, lean)** | **Australia Post PAC API** (free) for the parcel tier, **fed real dimensions** so cubic weight applies. Behind a `ShippingRateProvider` interface. Deterministic **flat/table-rate fallback** when the API errors/times out. **Heavy/oversized items** flagged and either quoted via a freight path or shown "Freight — we'll confirm delivery cost". Keep a **free-over-$X threshold** but exclude oversized items. | Free, battle-tested, no contract, returns true AU retail postage by weight+dims+postcode. Covers the majority of orders accurately on day one. |
| **2 — Volume / margin** | Either: (a) sign an **AusPost eParcel/StarTrack contract** (>2,000 parcels/yr) and switch to the **Shipping & Tracking API** for **contract (discounted) rates**; or (b) adopt an **AU-native aggregator** (Starshipit or Shippit) for multi-carrier rate-shopping + labels + manifests + tracking + freight in one API. | Once you ship real volume, negotiated rates and a fulfilment workflow pay for themselves. The provider interface from Phase 1 makes this a swap, not a rewrite. |
| **3 — Bulky freight, properly** | Add a real **freight/LTL** rate path: a contracted freight carrier (Allied Express, Team Global Express, Direct Freight, Northline) **or** an aggregator that includes freight (**Shippit** markets bulky/pallet; **Interparcel/Transdirect** are free-to-join with pallet carriers; **MachShip/Cario** for TMS-grade freight). | Parcel carriers can't carry the mega-large end. This is the path for big toolboxes/cabinets. |
| **Later — multi-warehouse / dropship / international** | Reserve the data model now (per-product **origin**, per-product **HS code / country-of-origin / declared value**); keep the provider interface swappable. | Avoids architecting into a corner; see [§8](#8-growth-multi-warehouse--dropship-future) and [§9](#9-international-shipping-future-multi-year). |

**Most recommended / most stable / most proven path:** **Australia Post PAC for parcels + a freight path for oversized + flat fallback**, all behind a provider interface, graduating to **eParcel contract rates or an AU-native aggregator** at volume.

---

## 3. How delivery fees are calculated in Australia

### 3.1 The methods

| Method | How it's computed | Best for | AU notes |
|---|---|---|---|
| **Flat rate** | One price per order (or per item) regardless of weight/destination | Uniform, light catalogues | AU norm ≈ **$9.95–$11.30**. Simple but mis-charges bulky/heavy and remote. *(This is our current stub.)* |
| **Free shipping (conditional)** | Free above an order-value threshold; flat fee below | Lifting AOV | Most common AU threshold band **$51–$150** (avg minimum has crept toward ~$135). The dominant AU model. |
| **Free shipping (unconditional)** | Always free; cost absorbed into price | Light, high-margin | Increasingly unsustainable as carrier costs rise (43% of AU retailers *raised* thresholds in 2023). |
| **Weight-based table rates** | Price tiers by **dead weight** | Where weight ≈ cost | Must use **chargeable** weight (greater of dead vs cubic) or you under-charge bulky items. |
| **Dimensional / cubic (volumetric)** | Price by `L×W×H × factor`, charge greater of dead vs cubic | **Bulky/light goods** | **Essential for us.** Factor **250 kg/m³** for parcel/express. See [§3.2](#32-cubicvolumetric-weight--freight-rating-the-core-mechanic). |
| **Price / order-value tiers** | Fee brackets by cart subtotal | Quick proxy when weight data is missing | Crude; ignores real freight cost. |
| **Zone / postcode tiers** | Fee by destination region: **metro / regional / remote** | National shipping | Remote/WA/NT attract surcharges; postcode→zone mapping required. |
| **Flat-per-item** | Fee × quantity | Identical units | Breaks on mixed carts. |
| **Hybrid table rates** | Combine weight × zone (× class) | Most real shops | The "table rate" plugins on Shopify/Woo encode this. |
| **Live carrier-calculated rates** | Real-time quote from a carrier/aggregator API at checkout | **Accuracy** | The gold standard; what PAC/Shippit/Starshipit provide. Needs weight + dims + origin + destination. |
| **Handling / surcharges** | Add-ons: fuel levy, residential, tail-lift, oversize, signature | Freight & bulky | Floating fuel levy (~5–30%); oversize/heavy surcharges can dwarf a flat fee. |

### 3.2 Cubic/volumetric weight — the core mechanic

This is the single most important concept for our catalogue.

- **Chargeable weight = the greater of actual (dead) weight and cubic (volumetric) weight.** Verified verbatim across [Aramex](https://www.aramex.com.au/terms-and-conditions/conditions-of-carriage/domestic-conditions-of-carriage/) ("The Carrier will charge the greater of an item's actual (dead) weight and cubic weight"), [CouriersPlease](https://support.couriersplease.com.au/hc/en-au/articles/31616636000537-What-is-Dead-Weight), [Australia Post](https://auspost.com.au/business/business-ideas/ecommerce-jargon-busters/what-is-cubic-weight) and [TNT](https://www.tnt.com/express/en_au/site/how-to/calculate-size-and-weight.html).

- **Cubic weight (kg) = Length(m) × Width(m) × Height(m) × 250** for domestic **parcel/express**. Equivalent to `L×W×H(cm) ÷ 4000`. Australia Post's own worked example: `0.5 × 0.3 × 0.4 = 0.06 m³ × 250 = 15 kg` cubic weight. ([AusPost Domestic Parcels Guide §P1.2.4 "Cubing"](https://auspost.com.au/content/dam/auspost_corp/media/documents/domestic-parcels-guide.pdf))

**Conversion factors by mode** (charge the greater of dead vs cubic):

| Mode | Factor (kg/m³) | cm divisor |
|---|---|---|
| **Domestic parcel / express** | **250** | ÷ 4000 |
| Domestic general / road freight | **333** | ÷ 3000 |
| International courier | 200 | ÷ 5000 |
| International **air** freight | ~167 (IATA 1:6) | ÷ 6000 |
| **Sea** freight (LCL) | 1000 (1 m³ = 1 tonne) | — |

Sources: [TNT AU](https://www.tnt.com/express/en_au/site/how-to/calculate-size-and-weight.html), [One World Courier](https://oneworldcourier.com.au/the-essential-guide-to-cubic-weight-conversion/), [Couriers & Freight](https://www.couriersandfreight.com.au/help/cubic-weight-calculator).

**Worked example (why our flat $10 fails):** a large but lightweight tool storage cabinet, 1.2 × 0.6 × 0.5 m, actual weight 18 kg → cubic weight = `1.2 × 0.6 × 0.5 × 250 = 90 kg`. The carrier bills on **90 kg**, not 18 kg — and at >0.25 m³ it has already exceeded the parcel cap and must go **freight**. A $10 flat fee against a likely $40–$120+ freight cost is a direct loss on every such order.

> ⚠️ *Note: "greater of dead vs cubic" is the AU **norm**, not a universal law. Australia Post applies the cubic rule to parcels over ~1 kg / over 0.25 m³ in its own packaging; some contract/specialised carriers bill on flat zones or pallet spaces. Treat 250 kg/m³ as the parcel default and let the carrier API return the authoritative number.*

### 3.3 Parcel vs freight regimes & size caps

| Limit | Australia Post (Parcel Post / Express Post) |
|---|---|
| Max weight | **22 kg** |
| Max length | **105 cm** |
| Max volume | **0.25 m³** |
| Over-max fee | **$100 (GST inc)** if an oversized parcel enters the network |

Source: [AusPost size & weight guidelines](https://auspost.com.au/business/shipping/guidelines/size-weight-guidelines).

> ⚠️ *A commonly-quoted "70 × 70 × 105 cm" AusPost cap is **wrong** — that box is 0.51 m³, double the real 0.25 m³ volume limit. The official limit is the **length + volume** rule above, not a fixed three-sided box.* (Refuted during verification.)

**Implication:** any item over ~22 kg or ~0.25 m³ — a meaningful share of toolboxes/cabinets — must route to **freight/LTL/pallet** carriers (StarTrack, Allied Express, Team Global Express, Direct Freight, Northline, TNT Pallet), which rate per-consignment on the 250/333 cubic basis plus surcharges. StarTrack (AusPost's B2B/freight brand): an **Oversize Charge** applies above **32 kg dead weight** (or any side ≥150 cm) on services *excluding* Courier; Road Express manual-handling caps at **20 kg/item**; items **>32 kg should be palletised**. *(Don't model these as clean "Courier=22 kg / Express=32 kg" caps — that's a third-party simplification the primary AusPost docs don't bear out.)* ([AusPost Oversize Charge guide](https://auspost.com.au/content/dam/auspost_corp/media/documents/oversize-charge-help-guide.pdf))

### 3.4 GST on shipping

Under ATO ruling **GSTD 2002/3**, a domestic delivery charge supplied together with taxable goods is part of a **taxable composite supply** — so **10% GST applies to shipping** at the same rate as the goods. Our cart already shows 10% GST; shipping must be inside the GST-inclusive total, not added GST-free.

### 3.5 Surcharges to account for

- **Regional / remote / WA / NT** zone surcharges (e.g. TNT ~10% WA regional surcharge; AusPost remote-area loadings).
- **Fuel levy** — a separately published percentage that floats ~monthly (swung roughly 5%–30%+ across 2026).
- **Bulky/freight add-ons** — tail-lift, hand-unload/heavyweight residential, oversize/over-length bands, redelivery, dangerous goods.

The practical takeaway: a live carrier/aggregator quote folds these in automatically; a hand-built table rate must encode them or it will under-charge.

### 3.6 Delivery-fee economics & strategy (AU)

- **Free/affordable delivery is the #1 purchase driver.** ~**56%** of AU shoppers rate free delivery their top delivery preference; **extra/shipping costs are the #1 cause of cart abandonment** (Baymard global benchmark: 48–60% of abandoners cite high extra costs).
- **Conditional threshold beats both extremes.** Set the free-shipping threshold **~20–30% above current AOV** so it lifts basket size while ~50–70% of orders still qualify. AU market clusters around **$9.95–$10 flat** with **free over $99–$150** (some lower at $45–$50).
- **Absorbing 100% of shipping is increasingly unsustainable** — **43% of AU retailers raised thresholds in 2023** as carrier costs rose; partial subsidy via threshold is dominant.
- **For us specifically:** a single flat fee/threshold is economically dangerous because heavy freight + remote surcharges can dwarf $10. Use **weight/dimension/zone-aware** calculation **plus a heavy-item carve-out** (exclude oversized items from "free over $X", or give them their own higher threshold).
- **Reliability > speed for trust.** ~85% rank reliable delivery the top trust factor; only ~26% expect same/next-day. Showing a **specific delivery date + multiple options** at checkout lifts conversion.

Source: [Australia Post eCommerce Industry Reports](https://auspost.com.au/business/marketing-and-communications/access-data-and-insights/ecommerce-trends) (2024 report = 2023 data; 2026 report = CY2025, AU online spend ~$82.6b, +14%).

---

## 4. Direct carrier APIs

Integrating a carrier directly means *you* call their rate API and (optionally) their label/tracking API. Best when you want control and minimal per-order fees, accepting that you build the orchestration yourself.

### 4.1 Australia Post — Postage Assessment Calculator (PAC) API ✅ recommended starting point

| Attribute | Detail |
|---|---|
| **Purpose** | Live **retail** postage quotes (domestic + international parcels/letters) |
| **Cost** | **Free** — no per-call charge, no eParcel contract required |
| **Auth** | Single API key in HTTP header **`AUTH-KEY`**; missing key → **HTTP 403** |
| **Endpoint** | `GET https://digitalapi.auspost.com.au/postage/parcel/domestic/calculate` |
| **Inputs** | `from_postcode`, `to_postcode`, `length`, `width`, `height` (cm), `weight` (kg), `service_code` |
| **Service codes** | `AUS_PARCEL_REGULAR` (Parcel Post), `AUS_PARCEL_EXPRESS` (Express Post) |
| **Options** | `AUS_SERVICE_OPTION_SIGNATURE_ON_DELIVERY`, `AUS_SERVICE_OPTION_EXTRA_COVER` (with cover value) |
| **Format** | REST GET, returns **JSON or XML** |
| **Rate limits** | Enforced per credentials (per second/minute/hour/day); **HTTP 429** on breach; `X-RateLimit-Remaining-*` headers. Exact numeric quota not published. |
| **Registration** | Self-serve form at [developers.auspost.com.au/apis/pacpcs-registration](https://developers.auspost.com.au/apis/pacpcs-registration) (account + contact details, key emailed, usually ~24h) |
| **Limitation** | **Retail rates only** (no negotiated discounts); parcel regime only (22 kg / 105 cm / 0.25 m³) |

Sources: [PAC tutorial](https://developers.auspost.com.au/content/apis/pac/tutorial-domestic-parcel-options.html), [PAC reference](https://developers.auspost.com.au/apis/pac/reference/postage-parcel-domestic-calculate), [About our APIs / rate limits](https://auspost.com.au/developers/help-support/about-our-apis/), [PHP integration example](https://phppot.com/php/shipping-api-integration-in-php-with-australia-post-example/).

### 4.2 Australia Post — Shipping & Tracking API (eParcel / StarTrack) — for contract rates

| Attribute | Detail |
|---|---|
| **Purpose** | Create shipments, labels, manifests, tracking **and return contract (negotiated) prices** via "Get Item Prices" |
| **Requires** | An active **eParcel or StarTrack parcels contract** (eParcel positioned for **>2,000 parcels/yr**) |
| **Auth** | `Authorization: Basic Base64(api_key_uuid : password)` + **Account-Number** header |
| **When** | Phase 2 — once volume justifies a contract and you want discounts below retail |

Sources: [Shipping & Tracking FAQ](https://developers.auspost.com.au/content/apis/shipping-and-tracking/info/api-resources/faq.html), [Integrate Shipping & Tracking](https://auspost.com.au/integrate-shipping-and-tracking-apis), [eParcel contract](https://auspost.com.au/business/shipping/eparcel-contract).

**The PAC ↔ Shipping&Tracking split is the key AusPost decision:** start free on PAC (retail), upgrade to the contract API (discounted) when you sign eParcel. StarTrack (heavy/B2B freight) is accessed through the same Shipping & Tracking gateway once you hold a StarTrack contract.

### 4.3 Other AU couriers — who has a usable rate API

| Carrier | Focus | Public/self-serve rate API? | Access | Notes |
|---|---|---|---|---|
| **Australia Post (PAC)** | Parcel | ✅ Yes, free | Self-serve key | Retail rates; best starting point |
| **CouriersPlease** | Parcel (500 g–25 kg + satchels + road express) | ✅ Yes | Dev portal [apidev.couriersplease.com.au](https://apidev.couriersplease.com.au/), Developer ID + token — **but need a CP business account first** | Domestic Quote endpoint; rates valid ≥5 min ([EasyPost guide](https://docs.easypost.com/carriers/couriersplease-guide)) |
| **Aramex Australia** (ex-Fastway) | Parcel | ⚠️ Yes via OAuth2 **myFastway** Business API (Get Quote) | Need a myFastway account first | Rebranded from Fastway in 2019 |
| **StarTrack** | Freight/B2B | ❌ Contract-gated (AusPost Shipping & Tracking) | Negotiated contract | See §4.2 |
| **TNT / FedEx** | Parcel + freight | ❌ Contract/account-gated | Onboarded credentials | TNT domestic now under FedEx |
| **DHL Express** | Parcel + intl | ❌ Account-gated (MyDHL API) | Negotiated | Strong international |
| **Allied Express, Direct Freight, Hunter, Northline, Border Express** | Freight/LTL | ❌ Account/contract-gated | Carrier integrations team | Reach these via an aggregator instead (see §5) |

Source: research angle "Major AU couriers and whether each has a rate API" (verified). **Takeaway:** only **AusPost PAC** and **CouriersPlease** are realistically self-serve for a small custom shop; everything freight-grade is gated behind a negotiated account — which is the core argument for using an **aggregator** to reach those carriers without holding each contract.

### 4.4 Sendle — ❌ DEFUNCT (do not use)

Sendle was a carrier-agnostic flat-rate parcel platform with a clean free REST API (HTTP Basic auth, sandbox, `GET /api/products` for quotes). **It ceased operations on 11 January 2026 and is in liquidation** (see the callout at the top). Its docs remain online, which is a trap. Excluded from all recommendations. Lesson: **design carrier-agnostic** so a vendor collapse is survivable.

---

## 5. Multi-carrier aggregator platforms

An aggregator gives you **many carriers behind one API** plus labels, manifests and tracking — you skip building per-carrier integrations and (on the paid tiers) get access to negotiated rates and freight carriers without holding each contract.

### 5.1 AU-native leaders — Shippit & Starshipit

**Shippit** — strongest fit for the bulky/freight end.

| Attribute | Detail |
|---|---|
| Quote endpoint | `POST /quotes`, base `https://app.shippit.com/api/3` (staging `app.staging.shippit.com/api/3`) |
| Auth | `Authorization: Bearer <API_SECRET>` |
| Rate limit | **1000 requests / rolling 60 s** per endpoint per key → HTTP 429 |
| Required fields | `dropoff_suburb`, `dropoff_postcode`, `dropoff_state`, `parcel_attributes` (qty + weight required; dimensions optional) |
| Carriers | **100+**, incl. Allied Express, Team Global Express, Direct Freight Express, Hunter Express |
| **Bulky freight / pallets** | ✅ Explicitly supported (dedicated bulky-freight & pallet solutions) |
| Pricing (ex GST, AUD) | **Lite $0/mo** up to 1,000 bookings/mo with **BYO carrier @ $0.75/booking**; **Plus $499/mo**; **Pro $999/mo** (pricing changed 23 Oct 2024) |

Sources: [Shippit Quotes API](https://developer.shippit.com/api_guide/quotes.html), [auth & rate limits](https://developer.shippit.com/dev_guide/authentication.html), [pricing](https://www.shippit.com/pricing), [bulky freight](https://www.shippit.com/solutions/bulky-freight).

**Starshipit** — clean AUD platform, multi-origin friendly.

| Attribute | Detail |
|---|---|
| Rates endpoint | `POST https://api.starshipit.com/api/rates` |
| Auth | Two headers: `StarShipIT-Api-Key` + `Ocp-Apim-Subscription-Key` (+ `Content-Type: application/json`) |
| Rate limit | ~2 req/s Developer, **20 req/s Production** → 429 |
| Multi-origin | ✅ Multi-location / multi-brand / dropship via child accounts |
| Pricing | AUD monthly tiers + **30-day free trial**; tier prices **not reliably captured — verify at [starshipit.com/pricing](https://www.starshipit.com/pricing)** before relying on a number |

Sources: [Starshipit multi-origin rates API](https://support.starshipit.com/articles/4408809144463-multi-origin-shipping-rates-with-the-starshipit-api), [API docs](https://api-docs.starshipit.com/).

### 5.2 Zero-commitment AU aggregators — Interparcel & Transdirect

Both are **free to join (no subscription/monthly fee), pay-per-shipment**, with REST/JSON APIs and **freight/pallet carriers** — an excellent low-risk fit for an AU-only shop that doesn't yet want a SaaS subscription.

- **Interparcel AU** — no contract/subscription, pay only per shipment ([confirmed](https://au.interparcel.com/help/knowledge-base/shipping-tools/is-there-a-contract-or-subscription-fee-to-use-interparcel)). Aggregates **~14+ couriers** incl. **Allied Express** (pallets/crates nationwide) and **TNT Pallet B2C** (road, AU-wide, max 140 cm height incl. pallet, max 500 kg). Publishes a key-free **Tracking API** (`GET api.interparcel.com/tracking/{n}`); the booking/shipping API is tied to an Interparcel account. An optional "Bring Your Own Courier" automation add-on has a per-order fee after a 60-day trial above ~20 orders/mo. *(Caveat: some "best API" articles describe a "free API key + Shipping API + Webhook" for Interparcel — that's actually **AfterShip's** multi-carrier product, not Interparcel's own API. Verify the exact API surface directly.)* ([Interparcel eCommerce platform](https://au.interparcel.com/content/ecommerce-shipping-platform))
- **Transdirect** — **100% free membership, no setup/subscription fees**; standard **REST API with JSON** for live quoting, booking and tracking over CouriersPlease, Aramex, Allied, TNT, Northline; 10–30% volume discounts. ([Developers Centre](https://www.transdirect.com.au/education/developers-centre/), [Account enquiries](https://www.transdirect.com.au/education/account-enquiries/))

### 5.3 Global aggregators — generally a poor AU-only fit

| Platform | AU domestic coverage | Pricing | Verdict for us |
|---|---|---|---|
| **Shippo** | Australia Post (BYO account) + **Aramex AU** (turnkey) | USD; free Starter 30 labels/mo; own-carrier labels **$0.05**; Pro ~$17/mo | Most AU-friendly global option, but USD-billed and thin AU depth. *(Its old "turnkey Sendle/Fastway/CouriersPlease" claim is **outdated** — Sendle is gone; current docs list only AusPost + Aramex AU.)* |
| **EasyPost** | Australia Post (BYOCA) + CouriersPlease | USD; **$0.08/label** after 3,000 free; **+$20/mo BYOCA**; +3% USPS-spend fee from 1 Jun 2026 | US-centric; FX overhead; weak for AU freight |
| **ShipStation / ShipEngine** | Australia Post | USD/GBP/EUR (no AUD); **ShipEngine Advanced from $75/mo** | Heaviest, most US-oriented; avoid for AU-only |
| **Zoom2u** | Metro same-day only (<30 kg) | — | Not for nationwide heavy freight; optional same-day metro add-on only |

Sources: [Shippo carrier capabilities](https://docs.goshippo.com/docs/carriers/carriercapabilities/), [EasyPost AU](https://www.easypost.com/), research "global aggregators" angle (verified; Shippo AU carrier list **corrected** during verification).

### 5.4 Freight/LTL/pallet rating platforms (for the mega-large end)

For oversized items beyond parcel carriers:

- **MachShip** — mature **REST API**, ~250 AU carriers, token auth, built-in test mode; TMS-grade. Pricing conflicts between its own site ("from $0/mo + $0.75/consignment") and review sites ($549/mo) — **verify directly**.
- **Cario / Transvirtual** — TMS with live API rating + stored rate cards (enterprise end).
- **FreightExchange** — JWT REST API, free for small business, Shopify/Woo plugins, explicitly handles bulky/pallet. *(Their dev site served an expired TLS cert during research — re-verify API specifics.)*
- **Ofload** — digital road-freight forwarder oriented to **full-truck-load/managed freight**, **not** a per-order checkout rate API — **poor fit** for checkout quoting.

> For our scale, you likely **don't** need a standalone freight TMS at launch — **Shippit (bulky/pallet) or Interparcel/Transdirect (free, pallet carriers)** cover the freight tier with far less setup. Reserve MachShip/Cario for when freight volume is high enough to warrant a dedicated TMS.

### 5.5 Comparison matrix

| Platform | Type | AU freight? | Rate API | Pricing model | AUD-native | Fit for us |
|---|---|---|---|---|---|---|
| **AusPost PAC** | Direct carrier | ❌ parcel only | ✅ free | Free | ✅ | **Launch (parcels)** |
| **AusPost eParcel/S&T** | Direct carrier | ✅ via StarTrack | ✅ contract | Contract (>2k/yr) | ✅ | Phase 2 (discounts) |
| **CouriersPlease** | Direct carrier | ❌ parcel | ✅ self-serve* | Per shipment | ✅ | Optional 2nd parcel carrier |
| **Shippit** | Aggregator | ✅ strong | ✅ Bearer | $0 Lite + $0.75/booking → $499/$999 | ✅ | **Best all-in-one** |
| **Starshipit** | Aggregator | ✅ | ✅ | AUD monthly + trial | ✅ | Strong; multi-origin |
| **Interparcel** | Aggregator | ✅ pallets | ✅ | **Free + pay/shipment** | ✅ | **Best zero-commitment** |
| **Transdirect** | Aggregator | ✅ | ✅ REST/JSON | **Free membership** | ✅ | Strong zero-commitment |
| **Shippo** | Global aggregator | ⚠️ thin | ✅ | USD, free 30/mo | ❌ | Only if going global |
| **EasyPost** | Global aggregator | ⚠️ thin | ✅ | USD | ❌ | Avoid for AU-only |
| **ShipStation/Engine** | Global aggregator | ⚠️ | ✅ | USD $75+/mo | ❌ | Avoid for AU-only |
| **MachShip/Cario** | Freight TMS | ✅✅ | ✅ | Contact/account | ✅ | High freight volume only |

\* CouriersPlease portal token generation is self-serve **once you hold a CP business account**.

---

## 6. Build vs buy — total cost of ownership

| Option | Setup cost | Ongoing fees | Per-order cost | Eng effort | Accuracy | Negotiated discounts | Best when |
|---|---|---|---|---|---|---|---|
| **DIY flat / table rates** | Low | $0 | $0 | Low | ❌ Poor (stale, mis-charges bulky) | ❌ | Launch stopgap only |
| **DIY + AusPost PAC (direct)** | Low–med | **$0** | $0 (PAC) + actual postage | Medium | ✅ Good (retail, weight+dims) | ❌ retail only | **Early stage — recommended** |
| **DIY + AusPost eParcel/S&T** | Medium | eParcel contract | Discounted postage | Medium–high | ✅✅ | ✅ | >2,000 parcels/yr |
| **AU aggregator (Shippit/Starshipit)** | Low–med | $0–$999/mo (AUD) | per-booking on some tiers | **Low** (one API) | ✅✅ multi-carrier + freight | ✅ managed rates | Real volume; want labels+tracking+freight |
| **Free AU aggregator (Interparcel/Transdirect)** | Low | **$0** | per shipment | Low | ✅ multi-carrier + freight | partial (volume tiers) | **Zero-commitment freight access** |
| **Global API (EasyPost/Shippo)** | Medium | USD subs/label | USD/label + FX | Low–med | ⚠️ thin AU | limited | Going international |

**Most recommended / stable / proven for an early-stage AU custom shop:** **DIY integration against the free AusPost PAC API** for parcels (plus our own cubic-weight logic) with a **flat/table fallback** and a **freight path** for oversized items — graduating to **eParcel contract rates** or an **AU-native aggregator** as volume and the value of negotiated rates / fulfilment workflow grow. A pure DIY flat/table rate has zero API cost but mis-charges heavy/bulky items, so it's a launch stopgap only.

---

## 7. Integration architecture for our stack (Next.js + MongoDB + Stripe)

### 7.1 Mirror the proven "zone → method" model

Every major platform (Shopify, WooCommerce, BigCommerce, Magento) converges on the same two-layer model — copy it rather than invent one:

- **Shipping zone** = a geographic match on country/state/**postcode** (postcode wildcards like `902*`), evaluated **top-to-bottom, first match wins**, with a **"rest of world" fallback**.
- **Shipping method/rate** inside a zone = flat, weight-table, price-based, **or live carrier-calculated** — plus a near-universal **"free over $X"** option.

WooCommerce is the cleanest reference for a from-scratch build (zones + core flat/free/local-pickup methods + flat-rate formula placeholders `[qty]`, `[fee percent min max]`, per-class costs, Per-Class vs Per-Order). ([WooCommerce shipping zones](https://woocommerce.com/document/setting-up-shipping-zones/), [flat rate](https://woocommerce.com/document/flat-rate-shipping/)). Shopify's **CarrierService** callback is the reference contract for *live* rates: Shopify POSTs `{rate:{origin,destination,items,currency,locale}}`, the app returns a `rates[]` array (`service_name`, `service_code`, `total_price` in subunits, `currency`, `description`); results cache ~15 min and time out at 3–10 s. ([Shopify CarrierService](https://shopify.dev/docs/api/admin-rest/latest/resources/carrierservice))

### 7.2 Product/Order fields to add (mapped to our actual gaps)

Our [Product.ts](../../src/models/Product.ts) currently has **no** weight/dimensions (weight only as free-text inside the `specifications` Map, e.g. `"2.3kg"` — unusable for rate calc). Our [Order.ts](../../src/models/Order.ts) captures `shippingAddress` (incl. `state`, `postalCode`, `country` default "Australia") and `trackingNumber` but has **no shipping-fee/carrier/service field** and a single `totalAmount`.

| Add to **Product** | Type | Why |
|---|---|---|
| `weightKg` | number | Dead weight — required for rating |
| `lengthCm`, `widthCm`, `heightCm` | number | **Packaged** dims — required for cubic weight |
| `shippingClass` | enum (`parcel` \| `oversized-freight`) | Routes to parcel API vs freight path |
| `freeShipping` | boolean (optional) | Per-product free-ship override |
| `originLocation` | string (optional, future) | Multi-warehouse readiness ([§8](#8-growth-multi-warehouse--dropship-future)) |
| `hsCode`, `countryOfOrigin` | string (optional, future) | International readiness ([§9](#9-international-shipping-future-multi-year)) |

| Add to **Order** | Type | Why |
|---|---|---|
| `shippingFee` | number | The charged delivery fee (GST-inc) |
| `shippingCarrier`, `shippingService` | string | Which carrier/service was quoted/chosen |
| `shippingQuotedAt` | date | Quotes are short-lived; record when committed |
| breakdown: `subtotal`, `gst`, `shipping` | number | Persist the composition, not just a single total |

### 7.3 Live-rate request flow

1. **Capture** packaged weight + L/W/H + shipping class per product (Phase 0).
2. **Aggregate the cart** into one or more parcels: sum dead weight; compute **cubic weight @ 250 kg/m³**; chargeable weight = greater of the two. (Box-packing can come later; start with a simple sum + single-parcel assumption, or one parcel per item for oversized.)
3. **Validate destination** (postcode/state) before quoting.
4. **Call the rate provider server-side** with origin (our VIC warehouse postcode) + destination + parcel(s). Parcel tier → **AusPost PAC**; oversized → **freight path**.
5. **Render options** (Parcel Post / Express Post / freight) with price and, ideally, an ETA at checkout.
6. **Commit the chosen rate** (carrier, service, price, timestamp) onto the Order.

### 7.4 Stripe specifics

- Compute `shipping_options` **server-side** in the Checkout Session (e.g. the `onShippingDetailsChange` callback) and **recalculate amounts on the server** — **never trust a client-supplied shipping price**.
- Pass an **idempotency key** (keyed to cart/session) so retries don't create duplicate PaymentIntents.
- Keep shipping inside the GST-inclusive total (10% GST, [§3.4](#34-gst-on-shipping)).

### 7.5 Robustness essentials

- **Deterministic fallback:** if the rate API errors or times out, fall back to a flat/table rate (zone × weight band) so checkout never breaks.
- **Short-TTL cache:** cache quotes keyed on destination + parcel signature for a few minutes (carriers themselves only guarantee quotes for minutes).
- **Address/postcode validation** before quoting.
- **Consolidate the current stub:** the flat `subtotal >= 100 ? 0 : 10` logic is duplicated in **three places** ([CartContext.tsx](../../src/contexts/CartContext.tsx), [api/cart/summary](../../src/app/api/cart/summary/route.ts), and `useCartQueries`). Replace all three with **one shipping service** so the rate logic can't drift.

---

## 8. Growth: multi-warehouse & dropship (future)

We have one VIC warehouse today, so this isn't needed yet — but reserve the data model so it isn't a rework. Every platform resolves multi-origin to the same pattern:

1. Assign each product to an **origin** (warehouse/vendor/dropshipper).
2. **Split the cart by origin** into shipments.
3. **Rate each shipment** independently.
4. **Sum** the per-origin rates (or pick **nearest warehouse**), or show them separately.

References: Shopify shipping **profiles + location groups** (flat rates charge once within a group; summed across profiles), WooCommerce + **Dokan** per-vendor table rates with an "add together vs show separately" toggle, **ShipperHQ** ("Nearest Warehouse" vs "Fewest Warehouse" packing), and AU-native **Starshipit** (multi-location/dropship via child accounts) / **Shippit** (ship-from-closest routing). **Reserve now:** a per-product `originLocation` field — that single addition keeps the door open.

---

## 9. International shipping (future, multi-year)

International is materially harder than domestic because the delivered price becomes **landed cost = freight + import duty + destination VAT/GST + carrier brokerage/disbursement fees**, driven by destination country, the goods' **HS (tariff) code**, and declared value. You also choose an **Incoterm**: **DDP** (you prepay duties/taxes — smoother for the buyer) vs **DDU/DAP** (buyer pays on arrival — cheaper for you but causes surprise-fee abandonment/returns).

- **Delegate it** to a landed-cost provider when the time comes: AusPost International (contract), **DHL Express MyDHL API / Duty & Tax Calculator**, **FedEx**, or dedicated engines **Easyship / Zonos**, and AU-native **Starshipit / Shippit** (wrap DDP across DHL/FedEx/UPS/AusPost).
- **Customs rules are in active flux** — treat duty/tax as a **live external lookup, never a hard-coded table** (US suspended its US$800 de-minimis on 29 Aug 2025; EU is ending its €150 duty exemption ~1 Jul 2026).
- **Don't architect into a corner:** reserve per-product **HS code, country-of-origin, customs description, accurate declared value**, and keep the fee engine a **swappable provider interface** — the same abstraction that lets us replace the $10 stub with a domestic carrier rate also lets us bolt on a landed-cost provider later.

---

## 10. Final recommendation & roadmap

1. **Phase 0 — Data foundation.** Add numeric `weightKg` + `lengthCm/widthCm/heightCm` + `shippingClass` (+ optional `freeShipping`, `originLocation`) to Product; add `shippingFee/carrier/service/quotedAt` + a subtotal/GST/shipping breakdown to Order. *Backfill weight/dims for the existing catalogue (currently only free-text in `specifications`).*
2. **Phase 1 — Launch.** Build a small server-side **`ShippingRateProvider`** abstraction. Implement **AusPost PAC** (free) for parcels, fed real dimensions so **cubic weight @ 250 kg/m³** applies. Add a **deterministic flat/table fallback** (zone × weight band) and **short-TTL caching**. Flag **oversized items** (`shippingClass = oversized-freight`) and either route them to a freight path or display "Freight — delivery cost confirmed after order". Keep a **free-over-$X threshold that excludes oversized items**. Consolidate the 3 duplicated stub locations into the new service.
3. **Phase 2 — Volume/margin.** When you cross ~2,000 parcels/yr (or want a fulfilment workflow), either sign **AusPost eParcel/StarTrack** and switch to the **Shipping & Tracking API** for contract rates, or adopt an **AU-native aggregator** (Shippit or Starshipit) — a swap behind the provider interface.
4. **Phase 3 — Bulky freight.** Add a real freight rate path via **Shippit (bulky/pallet)** or the free **Interparcel/Transdirect** pallet carriers (Allied Express, Team Global Express, TNT Pallet B2C).
5. **Later — multi-warehouse / dropship / international.** Add origin-split rating and a landed-cost provider only when those become real; the reserved fields above make each an extension, not a rebuild.

**Why this is the most stable/proven path:** it starts on the free, ubiquitous AU rate engine (PAC) with correct cubic-weight math, never leaves checkout without a price (fallback), correctly separates the parcel and freight regimes our catalogue actually spans, and keeps every carrier swappable — so a Sendle-style vendor collapse, a pricing change, or a move to contract rates is a configuration change, not a re-architecture.

---

## 11. Recency & verification caveats

Researched and fact-checked **June 2026**. Structural facts are stable; **prices and plan tiers are not.**

**Stable (safe to build on):**
- Cubic conversion factors (250 parcel/express · 333 road · 167 air · 1000 sea) and "greater of dead vs cubic".
- AusPost domestic parcel limits (22 kg / 105 cm / 0.25 m³) and the PAC auth model (`AUTH-KEY` header, 403/429).
- GST on shipping (GSTD 2002/3, 10%).
- The "zone → method" data model and Shopify CarrierService / WooCommerce contracts.

**Re-verify before you hard-code (volatile):**
- **All carrier dollar rates** — AusPost resets retail prices annually (typically 1 July; current table effective 1 Jul 2025, next ~Jul 2026); fuel levies float ~monthly.
- **Aggregator plan pricing** — Shippit (changed 23 Oct 2024), **Starshipit tier prices were not reliably captured — confirm at the source**, EasyPost (changed 23 Feb 2026), ShipStation (carrier-connection fee change 8 Jul 2025).
- **Exact PAC numeric rate limits** — not published; the 429 model is confirmed, the per-tier numbers are not.
- **Interparcel's own API surface** vs AfterShip's (the two were conflated in some sources).
- **De-minimis / customs rules** for any future international work.
- **Sendle is gone** — ignore any guide still recommending it.

---

## 12. Key sources

**Calculation mechanics & limits**
- Australia Post — [What is cubic weight](https://auspost.com.au/business/business-ideas/ecommerce-jargon-busters/what-is-cubic-weight) · [Domestic Parcels Guide (PDF)](https://auspost.com.au/content/dam/auspost_corp/media/documents/domestic-parcels-guide.pdf) · [Size & weight guidelines](https://auspost.com.au/business/shipping/guidelines/size-weight-guidelines) · [Oversize Charge guide (PDF)](https://auspost.com.au/content/dam/auspost_corp/media/documents/oversize-charge-help-guide.pdf)
- [Aramex Conditions of Carriage](https://www.aramex.com.au/terms-and-conditions/conditions-of-carriage/domestic-conditions-of-carriage/) · [CouriersPlease dead weight](https://support.couriersplease.com.au/hc/en-au/articles/31616636000537-What-is-Dead-Weight) · [TNT size & weight](https://www.tnt.com/express/en_au/site/how-to/calculate-size-and-weight.html) · [One World Courier — conversion factors](https://oneworldcourier.com.au/the-essential-guide-to-cubic-weight-conversion/)

**Carrier APIs**
- AusPost PAC — [tutorial](https://developers.auspost.com.au/content/apis/pac/tutorial-domestic-parcel-options.html) · [reference](https://developers.auspost.com.au/apis/pac/reference/postage-parcel-domestic-calculate) · [registration](https://developers.auspost.com.au/apis/pacpcs-registration) · [rate limits](https://auspost.com.au/developers/help-support/about-our-apis/)
- AusPost Shipping & Tracking — [FAQ](https://developers.auspost.com.au/content/apis/shipping-and-tracking/info/api-resources/faq.html) · [eParcel contract](https://auspost.com.au/business/shipping/eparcel-contract)
- [CouriersPlease developer portal](https://apidev.couriersplease.com.au/) · [EasyPost CouriersPlease guide](https://docs.easypost.com/carriers/couriersplease-guide)

**Aggregators**
- Shippit — [Quotes API](https://developer.shippit.com/api_guide/quotes.html) · [auth/rate limits](https://developer.shippit.com/dev_guide/authentication.html) · [pricing](https://www.shippit.com/pricing) · [bulky freight](https://www.shippit.com/solutions/bulky-freight)
- Starshipit — [multi-origin rates API](https://support.starshipit.com/articles/4408809144463-multi-origin-shipping-rates-with-the-starshipit-api) · [API docs](https://api-docs.starshipit.com/)
- [Interparcel eCommerce platform](https://au.interparcel.com/content/ecommerce-shipping-platform) · [Transdirect Developers Centre](https://www.transdirect.com.au/education/developers-centre/) · [Shippo carrier capabilities](https://docs.goshippo.com/docs/carriers/carriercapabilities/)

**Platform patterns**
- [Shopify CarrierService API](https://shopify.dev/docs/api/admin-rest/latest/resources/carrierservice) · [WooCommerce shipping zones](https://woocommerce.com/document/setting-up-shipping-zones/) · [WooCommerce flat rate](https://woocommerce.com/document/flat-rate-shipping/)

**Sendle shutdown**
- [Shippo](https://goshippo.com/blog/sendle-has-ceased-all-operations-as-of-january-2026) · [ACS Information Age](https://ia.acs.org.au/article/2026/sendle-shuts-down-after-12-years---100m-in-funding.html) · [The New Daily](https://www.thenewdaily.com.au/finance/consumer/2026/01/12/sendle-shut-down-australia)

**Economics**
- [Australia Post eCommerce Industry Reports](https://auspost.com.au/business/marketing-and-communications/access-data-and-insights/ecommerce-trends)

---

*Generated from multi-agent web research with adversarial fact-checking (June 2026). Figures marked "verify" are time-sensitive — confirm against the live source before implementation.*
