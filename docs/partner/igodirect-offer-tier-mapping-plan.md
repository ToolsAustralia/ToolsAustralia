# iGoDirect Offer → Tier Mapping — Analysis Plan & Session Handoff

> **Status:** 🟡 **PHASE 1 COMPLETE** (§4h) · Phase 2 blocked on the LLM recognisability pass · **live commercial risk in §0** · **Owner:** DJ · **Type:** data-curation workstream (no app code changes in this phase)
>
> **What this doc is.** A self-contained brief for a fresh Claude session to take iGoDirect's offers master list and produce our brand→tier mapping: which offers unlock at each of our access percentages (5% → 100%). The output is a reviewed dataset for DJ + Michael to sign off, then a final file for iGoDirect to gate their portal with. This is the sibling workstream to `docs/partner/igodirect-member-status-api-plan.md` (the API returns the %, this mapping decides what the % unlocks). Neither blocks the other.
>
> **Revised 2026-07-21** after a 44-agent audit (every material claim adversarially re-derived from the CSV and the code). The original model in §3 survived intact; three method steps in §4 rested on false readings of the vendor's columns and have been replaced. **Read §0 first — it is the finding that changes the commercial conversation.**

---

## 0. The finding that outranks the method

**The catalogue cannot fill the premium bands, under any curation strategy.**

| Measure | Rows | % of file |
|---|---|---|
| Match a national/household AU brand (word-boundary scan, 115 brands) | 105 | 5.7% |
| Save ≥ $50 absolute | 21 | 1.1% |
| Save ≥ 25% | 77 | 4.2% |
| eGift cards | 41 | 2.2% |
| **Union of all "genuinely strong" material** | **139** | **7.8%** |
| **Rows the top band alone needs** | **266** | — |

So the 85→100 band fills roughly **half** with strong material and half with filler. The value-anchor list is thin and top-heavy: one $3,000 home-loan refinance rebate, seven energy switches at $140, then it falls off a cliff to a $900 decanter and Backcare Seating Carlton North.

**The shape of the file compounds it.** 51.6% of the catalogue is three homogeneous blocks — 675 experience/attraction rows sharing one identical Highlight, 230 retail SKUs from two suppliers, 41 eGift cards. Measured saving has almost no spread: median 7%, p75 10%. So the material available to differentiate a 266-row top band from the band below it is genuinely scarce **within this file**.

**Action.** The top bands are built from the strongest material the file actually contains (§2), and the run reports `headlineRowsRemaining` next to every acceptance failure so a shortfall is visibly attributable to catalogue supply rather than to curation. Whether the vendor can supply additional inventory is a commercial question for the Q15 thread (playbook §6, still 🔴) — this workstream bands what is in the file and does not speculate beyond it.

> **Scope rule (DJ, 2026-07-21):** never name or propose a brand or offer that is not present in the source CSV. Every recommendation in this workstream must be traceable to a row in the file.

---

## 1. Input

- **Source file:** `C:\Users\Genesis\Downloads\Offers List with Tiers - June 2026 1(Offers Master List).csv` — copy to `temp/igodirect/` (verified gitignored at `.gitignore:25`) before processing; treat Downloads as read-only. Do NOT commit this file to the repo (vendor data).
- **Columns:** `ID, Category, Offer, Highlight, Product.terms_and_conditions, Supplier, Tier, Offer Type, Notes`. Fields contain quoted commas — use a real RFC4180 parser (PowerShell `Import-Csv` or a hand-rolled parser), never `split(",")`.
- **Profile (re-verified 2026-07-21, reproduces to the row):** 1,833 offers · 545 unique suppliers · 1,833 unique IDs, zero duplicates. Offer types: CASHBACK (CARD-LINKING OFFER) 877 · DISCOUNTS 622 · CASHBACK 136 · IN-STORE DISCOUNT 106 · FREE OFFER 51 · EGIFT CARDS 41. Categories: In-Store Offer 877 · Home and Lifestyle 224 · Beauty 181 · Eat and Drink 178 · Fashion 167 · Travel 81 · Automotive 62 · Technology 34 · Entertainment 20 · Financial Services 8 · eGift Cards 1.
- **Column integrity notes (new):** `Notes` is 100% empty. `Product.terms_and_conditions` is populated on only 442 rows. There are just **392 distinct `Highlight` strings** across 1,833 rows — build a 392-row lookup, not per-row regex.

### 1a. Three columns do not mean what they appear to

| Column | Appears to be | Actually is |
|---|---|---|
| `Supplier` | the brand | **Mixed.** Pokitpal alone is 877 rows (47.8%); top five aggregators are 67.7%. But 521 suppliers hold exactly one row, where Supplier *is* the merchant. Three different things in one column — see §4a. |
| `Category` | the diversity axis | **Half of it is a mechanic label.** `Category='In-Store Offer'` (877) is byte-identical to `Offer Type='CASHBACK (CARD-LINKING OFFER)'` (877) — set difference 0/0 both ways. ~48% of the file has no usable category. Use a derived `ContentType` instead. |
| `Tier` | iGoDirect's value banding | **A recognisability band, direction Tier 1 = best** — and noise on 37% of the file. See §1b. |

Supplier-name normalisation is a **verified no-op**: 545 distinct raw, 545 after trim, 545 after full normalisation (case-fold, whitespace collapse, punctuation strip, trailing `Pty Ltd`). Delete that step from the method; spend the effort on §4a instead. (Brand-key normalisation *is not* a no-op — 902 raw → 882 merged.)

### 1b. What their `Tier` column encodes — and how we compare against it

Three tests, all run against the real file:

1. **Is it a discount-size band?** No. Mean saving is non-monotone (T1 8.90% · T2 10.25% · T3 8.37%, identical 7% median), and stays non-monotone *within* every offer type (DISCOUNTS: T1 12.9% · T2 15.2% · T3 14.6%).
2. **The natural experiment.** All 41 eGift rows carry an identical `Get 4% Discount`, so mechanic and value are constant and brand is the only variable. **T1** = Coles, Kmart, Target, Myer, Amazon, Ticketmaster, Xbox, Rebel, Amart, Dymocks, OPSM, Oakley, Country Road. **T2** = IKEA, Spotify, BCF, Bonds, Sheridan, Witchery, Catch, Sunglass Hut, Freedom, Dusk. **T3** = Cotton On, Forever New, Kathmandu, Lorna Jane, Nine West, Adrenaline, Global Experience, Airbnb. A clean recognisability gradient, **Tier 1 best** — the opposite of the original guess.
3. **How reliable?** On the 675-row tour cluster (one byte-identical Highlight, one mechanic) the split is **309 T1 / 62 T2 / 304 T3**. A coin flip on 37% of the file.

**Consequences.** Their Tier is a **weight-0.05 prior**, and it is **suppressed entirely for `ContentType='tour-experience'`** — letting coin-flip noise nudge 37% of the catalogue is worse than ignoring it. Their split is also 44%/25%/31%, not a pyramid, so it is not a ladder.

**The comparison artifact** is a **concordance matrix** (our 11 bands × their 3 tiers, counts in cells) plus a **disagreement list** — their T1 rows landing in our bottom bands, their T3 rows in our top. That list is the reconciliation document we send iGoDirect: it asks "what does your Tier column mean?" with evidence attached.

---

## 2. The business goal (why this exists)

Members buy packages that grant an **access percentage**. If we filled the low percentages naively (any N% of the list), a cheap tier could include famous, genuinely useful brands and kill the reason to upgrade. So the mapping must be **value-curated**: every step up the ladder adds something a member can see and want. Audience: Australian tradies — weight relevance accordingly.

**Amended by §0:** the recognisable material in the file is too thin to fill the top bands on fame alone. **Decided (DJ, 2026-07-21): differentiate the top bands on absolute VALUE** — the highest-saving offers the file contains, plus the eGift cards and the commercial/trade-account offers (`06-value-anchors.csv`, 127 rows).

---

## 3. The model (decided; flag to DJ before deviating)

- **Our ladder (11 levels):** 5, 10, 15, 25, 40, 50, 55, 70, 75, 85, 100. Package↔% table: `docs/partner/igodirect-integration-playbook.md` §2 — verified 1:1 against `src/data/membershipPackages.ts`, `miniDrawPackages.ts` and `upsellPackages.ts` on every price, percent and duration.
- **Sole authority for the ladder is `src/utils/partner-discounts/partner-catalog-visibility.ts`.** ⚠️ `src/data/miniDrawPackages.ts:45` carries a **stale comment** asserting packs 1–3 → 25%; the function returns 5/10/15. Do not read the ladder from that comment.
- **Two off-ladder values can still reach the vendor.** `getPartnerCatalogAccessPercentForPlanId` keeps legacy `mini-pack-6/7` → **60** and `mini-pack-8` → **80**, and `resolveMemberLevel` calls it raw with no coercion. Also, a non-subscriber holding only a Mini Pack 1–3 resolves to **`member_level: null`** (`getPackageById` searches only `membershipPackages`, where no mini-pack id lives). Both are handled by the gating rule in §5.4, not by adding bands.
- **Cumulative unlock:** a member at X% sees every offer banded at ≤ X%. Higher tiers add, never swap.
- **Proportional band sizes, curated membership.** This is load-bearing, not stylistic: it keeps "X% of partner offers" literally true across a dozen shipped surfaces (the `${pct}% of partner offers` and `${pct}% access to partner discount offers` generators, `PartnerDiscountQueue`, `PlanSummaryCard`, `BenefitCountdown`, and the literal count in `UnlockDiscounts.tsx:184`) and across the Klaviyo profile properties.
- **The ordered list is the primary artifact; `AccessPercent` is a derived label.** `getPartnerCatalogVisibleSliceLength` is a bare first-k prefix slice with no category or tier field on the record. An ordered list serves *any* percentage including 60 and 80; an 11-value band column has no answer for a legacy holder.

### 3a. The denominator and the real cut points

**Decided (DJ, 2026-07-21):** exclude non-Australian rows; keep the retail SKUs but roll size/colour variants into families so a product family never splits across a paywall.

A guarded scan (foreign-market token **AND NOT** an AU state/locality token, which removes false positives like "Flavours of India *Alice Springs NT*" and "New York Slice Pizzeria *Fortitude Valley QLD*") finds **55 genuinely non-AU rows**: Auckland/Queenstown/Rotorua tours, `New Zealand`-suffixed brands, `Cashback Offers MY/SG/PH/KR`, David Jones NZ.

> **N = 1,833 − 55 = 1,778**

Cut points are `ceil(N × pct/100)` — the code uses `Math.ceil`, **not** round. (The Foreman-subscription `Math.round` exception is a no-op at this N; `pct >= 100` short-circuits to the total.)

| % | Cumulative | Band adds |
|---|---|---|
| 5 | 89 | +89 |
| 10 | 178 | +89 |
| 15 | 267 | +89 |
| 25 | 445 | +178 |
| 40 | 712 | +267 |
| 50 | 889 | +177 |
| 55 | 978 | +89 |
| 70 | 1,245 | +267 |
| 75 | 1,334 | +89 |
| 85 | 1,512 | +178 |
| 100 | 1,778 | +266 |

**Tolerance: none.** The cumulative count at each level must equal the table exactly. The original "±2%" was ambiguous (read as percentage points, the 5% band could be 55–128 rows) and would have masked the ceil/round defect.

---

## 4. Method

### 4a. Brand resolution — three supplier classes

`Supplier` cannot be the banding unit: banding Pokitpal as one brand moves 47.8% of the catalogue in a single step, which no band below 100% can absorb.

| Class | Members | Rule |
|---|---|---|
| **A — aggregator** | Pokitpal (877), Cashback Offers AU (93), True Rewards (41), FlexOffers, Choovie, Compare and Connect, day2dayrewards | Supplier is a middleman; brand lives in **`Offer`** |
| **B — SKU catalogue** | Heysmed (126), Kappel (104) | **Supplier IS the brand**; `Offer` is a product variant. Roll variants into families |
| **C — direct merchant** | ~521 suppliers holding 1 row each | Supplier is the merchant; strip suburb/state/`Instore`/`Online` tokens |

```
contentType(row):
  /EGIFT/i on Offer Type                     -> "egift"             (41)
  Highlight == "Explore New Adventures and get 7% Cashback"
                                             -> "tour-experience"   (675)
  Supplier in {Heysmed, Kappel}              -> "retail-sku"        (230)
  /CARD-LINKING/i on Offer Type              -> "card-linked-brand" (202)
  Offer Type == "CASHBACK"                   -> "online-cashback"   (136)
  else                                       -> "merchant-discount" (549)
                                                          total 1833 ✓
```

The tour block is identified by exact Highlight match — **675/675, zero false positives**. Do not use text heuristics on `Offer` (only 31/675 match a `^N Day` prefix).

The 675 tour rows get a **per-row synthetic brand** — there is no merchant identity in the data to cap (Supplier is the payment rail, Offer is a tour product), and at 36.8% of the file a shared brandKey makes *any* concentration cap below 36.8% mathematically infeasible. Tour concentration is a ContentType risk, handled by the corridor in §4c.

**Measured result (Phase 1 run, 2026-07-21):** 1,556 brandKeys total. Of those, **855 are real merchant brands needing a recognisability score**; 650 in-scope tour rows are mechanically `R=0` and are excluded from the LLM roster entirely. Supplier classes: A-aggregator 1,052 rows · C-direct-merchant 551 · B-sku-catalogue 230.

**Derived `Brand` is used only as a coherence constraint and a per-band concentration cap — never as the banding unit.**

### 4b. Scoring — six signals, weights justified by measured spread

**ADOPTED PROFILE (v3, DJ 2026-07-21):**

```
Composite = 100 × ( 0.35·R/5 + 0.10·T/5 + 0.20·(V×reach)/5 + 0.15·M/5 + 0.15·F/5 + 0.05·P/5 )
reach = 1.0 if R>=3 · 0.6 if R=2 · 0.4 if R<=1
```

> **Why value is reach-weighted — learned by building the alternative and rejecting it.**
> Three profiles were run and compared (archived under `archive-weighting-comparison/`).
> **v1** (`T=0.20`) over-weighted trade relevance: only 106 of 1,833 rows are trade-related and
> most are single-location, so it mostly penalised ordinary consumer spend. **v2** (`T=0.05`,
> `V=0.25`) was rejected — raw value promoted suburban hairdressers and beauty clinics into the
> 85/100% bands, because **in this catalogue the biggest percentage discounts belong to the
> smallest businesses** (a Beecroft hairdresser offers 30% off; Coles offers 4%).
> **v3** encodes the real question — *worth = how good the deal is × how many members can use it*.
> Result: unknown local businesses in the top two bands fell 160 → 136, constraint violations
> 42 → 15, TBM 8/10 → 9/10, and the 100% band now leads with Amazon, Coles, Specsavers (25% off)
> and three energy switches worth up to $140.
>
> **What no weighting fixes:** headline brands total 35 in v1, 33 in v2, 35 in v3. The MHC gate
> fails below 85% in every profile. That is catalogue supply, not curation.

| Signal | Weight | What it is | Why this weight |
|---|---|---|---|
| **R** Recognisability | 0.35 | 0–5, national chain → single location | The only signal with real spread; it is what makes an 89-row band feel different from the one below |
| **T** Tradie relevance | 0.20 | 0–5, tools/fuel/vehicle → out-of-audience | Capped because it derives partly from `Category`, which is absent for 48% of rows |
| **V** Offer value | 0.15 | 0–5, from a normalised saving fraction | **Measured** spread is tiny — median 7%, p75 10% — so it separates almost nothing |
| **M** Mechanic suitability | 0.15 | 0–5, eGift → card-linked | The only signal that interacts with the access window; a discount you cannot redeem in your window is worth zero |
| **F** Use frequency | 0.10 | 0–5, weekly → one-off | Distinguishes a perk that pays back monthly from one that pays back once |
| **P** Vendor Tier | 0.05 | T1→5, T2→3, T3→1 | Near-worthless (§1b). **Suppressed for `tour-experience`.** |

**The `$` trap — mandatory.** 154 rows are `Pay only $X; RRP $Y`. That is a **price, not a saving**. Parse to `s = (RRP − Pay)/RRP` (156 parse; median 23.8%). A naive `$` read ranks a $900 decanter above a 25% discount. Bare `Save $N` with no base price is **unparseable** — do not invent a denominator. `up to N%` takes a ×0.6 haircut. Unparseable/empty (48 + 3) impute the ContentType median and set `V_Imputed=true`.

**Mechanical overrides applied after the LLM pass (these win):**
- `ContentType ∈ {egift, online-cashback}` → `R = max(R, 3)` (catches the false-low mode)
- `auPresence === false` → `R = floor(R/2)`
- AU suburb/town/state token in brandKey **and** rowCount == 1 → `R = min(R, 2)` — the strongest catch for the false-high mode ("Auto One Burnie" is one store, not the chain)
- `tour-experience` → `R = 0`; `retail-sku` → R is the parent brand's, not the SKU's

**Tie-break (total, deterministic), ascending — position 1 is the weakest, because band 1 is the $1 Mini Pack:**
`Composite ↑ · R ↑ · T ↑ · F ↑ · V ↑ · M ↑ · VendorTierRank ↓ · ContentType ↑ · brandKey ↑ · vendor ID ↑`.
Vendor IDs are unique across all rows, so the order is total. No RNG, no seed.

### 4c. Banding — the algorithm

Three constraints must hold simultaneously; pure score-sorting violates the second.

- **(a) Exact counts** at all 11 cut points (§3a). Hard.
- **(b) Diversity + concentration.** A flat "every ContentType ≥ X% of every band" is infeasible (tours 36.8%, eGift 2.2%). Use a **corridor** scaled to natural share: `floor(bandSize × share × 0.65)` to `ceil(bandSize × share × 1.35)`. Feasible by construction — strict proportional allocation sits at 1.0×, inside the corridor, for every type in every band. Plus a **per-brand cap** `max(3, ceil(bandSize × share × 1.35))`, provably feasible since total capacity is 1.35× the brand's row count.
- **(c) Score-respecting order**, subject to (a) and (b).

**Two hard floors on top:** every ContentType appears ≥1 time in every band; and **bands 1–3 must each carry ≥8 rows from `{egift, online-cashback}`** — band 1 is a **1-hour** window, and card-linked cashback (877 rows) requires enrolling a card and waiting for settlement, i.e. literally unusable in an hour. Pool available = 177 ≥ 24.

> **The tension, stated openly.** eGift is simultaneously the scarcest ContentType *and* the most recognisable. The immediacy floor pushes eGift down; anti-cannibalisation pushes it up. Resolution: the floor specifies a **count from a class**, and the score-ranked queues decide **which members** — so band 1 draws the weakest eGift rows (Airbnb, Adrenaline, Cotton On, Lorna Jane — all vendor T3, all low tradie-relevance) while Coles/JB Hi-Fi/Apple stay at the top.

Fill each band by largest-remainder proportional quota over the remaining pool, clipped into the corridor, then round-robin drain visiting ContentTypes in descending natural share so scarce types are never starved. **On failure, never crash** — relax in a fixed, logged order: brand cap +1 → corridor ceiling 1.35→1.60 → take the next row from any queue, each step written to `violations.csv`. Then a repair pass bubbles adjacent pairs *within* a band to restore local score monotonicity (never across a boundary, so (a) and (b) are preserved).

**Determinism:** temperature 0, no RNG, no time input, no hash-set iteration order, string compares by codepoint (`Intl.Collator` banned — locale-dependent). Two runs on identical inputs produce a byte-identical CSV; `outputSha256` in the run manifest is the proof.

### 4d. Recognisability — the LLM pass, and its error modes

**881 distinct brandKeys.** This is the load-bearing signal, and it needs world knowledge, so it is designed to be auditable rather than trusted.

- **40 brands per batch, 23 batches per pass.** Not 100 — one malformed response costs 100 brands, and per-item accuracy degrades past ~50.
- **Two independent passes.** Pass B re-groups by `sha1(brandKey)` instead of alphabetically, so the two passes never see the same neighbourhood — adjacent-item contamination (a famous brand inflating its neighbours) is a real batch failure mode that an identical re-run would reproduce rather than expose.
- **Each row returns** `canonical, auPresence, outletScale, recognisability, tradieRelevance, useFrequency, confidence, evidence, isProductNotMerchant, possibleLocalNamesake`. `evidence` must name a **checkable** fact (outlet count, parent company, ASX listing); if it cannot, confidence is forced ≤0.4.
- **Escalate to Pass C** (single brand, full row context, web search) if `|ΔR| ≥ 2`, `|ΔT| ≥ 2`, `min(conf) < 0.60`, or the passes disagree on `auPresence` / `isProductNotMerchant`. Otherwise final = `round((A+B)/2)`, **ties round down** — an over-scored brand cannibalises the ladder, an under-scored one just sits a band low.
- **Human shortlist: top 120 by `uncertainty × log2(1+rowCount) × cutProximity`.** Uncertainty alone yields ~100–130 names, most of which cannot change any outcome; a brand sitting mid-band cannot move even if R shifts by 2. Everything escalated but not shortlisted keeps its Pass-C value and is marked `NeedsReviewDeferred=true` — visible, not hidden.

| Error mode | Catch | Residual risk |
|---|---|---|
| False high — local namesake ("Auto One Burnie") | Gazetteer override: place token + rowCount==1 → R ≤ 2 | A local business named after a chain with no place token |
| False high — confident hallucination | `evidence` must be checkable, else force-escalate | **Two-pass agreement does not catch this** — both passes share the same prior. Human shortlist is the only backstop |
| False high — global-not-AU | `auPresence=false` → R halved | Ships to AU but no retail presence → Pass C |
| **False low — unknown AU chain** | `egift`/`online-cashback` → R ≥ 3 floor | **Most likely to survive** — low-confidence-*low* answers feel unremarkable and get skipped in review |
| False low — review bias | Shortlist is built from sign-agnostic uncertainty; review UI sorts by priority, not score | Reviewer fatigue past ~60 rows — split into two sittings |

Review brief to DJ/Michael must say explicitly: **"you are looking for brands scored too LOW as much as too HIGH."**

### 4e. Stability across vendor refreshes

Their catalogue churns monthly, and **every cut point moves when N moves**. At ±5% churn, band 1 must shed 4 or absorb 5 rows — bounded, not catastrophic. The job is ensuring *only* those forced rows move.

**Persist a normalised rank, not a position:** `r = (position − 0.5)/N`, with `band(r)` = the smallest cut fraction ≥ r. Band membership is a function of `r` alone, and `r` is dimensionless in N — so an offer whose `r` does not cross a cut fraction does not change band regardless of N.

On refresh: survivors reuse cached brand scores but **re-derive V and M from the current Highlight** (if it changed, drop the anchor — a materially different offer has no claim on its old slot). New offers get a synthetic anchor by score-percentile among survivors, interpolated between bracketing neighbours, so they land where their score says rather than being appended. Then **solve in anchor order with score as tie-break**, so score drift alone cannot reshuffle. **Hysteresis:** when the count constraint forces j rows out, evict the j nearest the boundary, never from the band interior; a survivor whose `r` moved <0.0075 with no score change is pinned.

**Acceptance: >10% of surviving offers changing band rejects the run** — that magnitude means the anchor match failed, not that the catalogue changed. Expected churn is 3–5%, essentially all at boundaries.

> ⚠️ **Unverified, and it matters:** we have one file, so we cannot confirm iGoDirect's numeric IDs are stable across drops. They are unique *within* this file and look like real database keys, but a vendor regenerating IDs per export would orphan every anchor. **Compute and store both** `vid:<ID>` and a content hash `h:sha1(brandKey|Offer|Highlight|OfferType)` from run 1 — the fallback costs nothing now and saves the ladder later. Diff two consecutive exports before the second run.

> ⚠️ **Bands can shrink mid-window.** Access is granted for a fixed window (1 hour → 30 days); a refresh landing mid-window can demote an offer a member saw yesterday. Cumulative unlock means this only bites at boundaries, but it is real. Record `EffectiveFrom` in the output so support can explain it, and publish on a fixed monthly cadence. Per-member snapshotting is a product decision above this workstream — flag it, do not build it.

### 4f. Anti-cannibalisation as a measurable test

Three metrics, all computed from the output, all pass/fail gates.

**MHC — Marginal Headline Count (within-ladder).** For each upgrade step, `MHC_k = |{distinct brandKey newly visible : R ≥ 4 AND T ≥ 3}|`. **Threshold: ≥3 for steps 2–7, ≥5 for steps 8–11** — the $250→$1,000 upgrades must feel bigger than the cheap ones. Budget check: 6×3 + 4×5 = 38 against ~105 headline rows, leaving ~67 to concentrate at the top. Comfortable.

**PCI — Price Coherence Index (cross-family).** The named case is real and confirmed in product data: `additional-foreman-pack` **$50 / 4 days / 55%** vs `tradie-subscription` **$20/mo / recurring / 50%**. A raw offer count says the $50 one-shot wins, which is nonsense. Define **Exposure Value** = `Σ composite × realisable(offer, window)`, where `realisable` discounts by mechanic against the window length (eGift 1.0; online discount /24h; online cashback /72h; in-store /168h; card-linked /336h) and adds a compounding bonus `(1 + 0.15 × F × min(4, W_months))`. Then `PCI` = count of pairs where a dearer package has lower EV. **Threshold: PCI = 0 within each family** (hard fail); cross-family violations are reported and either re-curated or signed off in writing by DJ.

> **Curation genuinely fixes the named case** — the 50→55 delta is only 89 rows. Load them with `M ≤ 2` / high-`F` content (in-store, repeat-use, compounding) and `realisable(o, 96h)` heavily discounts them for the 4-day pack while the recurring subscription banks them at full value. That is **true**, not a trick: recurring access really does extract more from a fuel cashback than 96 hours does.

**TBM — Top-Brand Monotonicity.** Count of steps where the max composite in the cumulative set increases. **Threshold ≥8 of 10.** Catches the degenerate case where the best brand is already visible at 15%.

A run failing any hard threshold **still produces the CSV**, marked `STATUS: FAILED-ACCEPTANCE` — a failing artifact you can inspect beats no artifact.

### 4g. Rule-11 screen (LEGAL — non-negotiable)

Per CLAUDE.md rule 11, run a screen over `Offer` + `Highlight` and produce a **flagged-merchant list** for DJ/Michael. The exposure is in vendor-authored strings we would republish verbatim: `Royal Casino Events Eltham VIC` and four `B. Lucky & Sons` amusement-arcade rows sit inside a game-of-chance promotion's perk catalogue. Any drafted copy must use free-entry framing, never price a band per offer, and never imply entries are bought.

---

### 4h. Phase 1 — RUN AND COMPLETE (2026-07-21)

Output: `C:\Users\Genesis\Downloads\igodirect-phase1\` (9 CSVs + README.md). Generator: `phase1.js`, deterministic — **verified byte-identical across two consecutive runs** (SHA-1 on all 10 artifacts). No LLM used in this phase.

| Measure | Value |
|---|---|
| Rows parsed | 1,833 |
| Excluded as non-Australian | 55 |
| **In-scope N** | **1,778** |
| Brands needing an LLM recognisability score | **855** |
| Tour rows skipped (mechanically R=0) | 650 |
| Rows with unparseable/absent saving | 123 |
| Rows flagged for rule-11 review | 25 |
| Value anchors (saving ≥25%, incl. free offers) | 127 |

**Saving-source breakdown** (proves the `$` trap is real): `pct` 1,388 · `pay-rrp` 156 · `pct-upto` 115 · `dollar-no-base` 70 · `free-offer` 51 · `unparseable` 38 · `bare-price` 13 · `empty` 2.

**Rule-11 finding — keyword screening is insufficient, confirmed empirically.** The first pass caught only 1 row. Four `B. Lucky & Sons` rows (arcade-bar chain, Fortitude Valley / Melbourne Central / Sydney / Wollongong) carry **no gambling keyword in their name** and were missed. The screen is now three-tier: `direct-gambling-term` (1) · `known-gaming-venue-brand` (4) · `licensed-venue-adjacent` (20, pubs/taverns/hotels that typically hold gaming machines). **All 25 are adjacency flags for DJ + Michael, not violations** — the LLM brand pass should also carry a `gamblingAdjacent` field, because a name-based screen will always miss brands it does not know.

**Also learned:** the `tour-experience` block is not purely tours — it includes entertainment venues (B. Lucky & Sons). "Experience/attraction" is the accurate label. The exact-Highlight rule still identifies it 675/675 with zero false positives, so the derivation is unaffected.

**Not done in Phase 1:** no scoring, no banding, no `AccessPercent`. Those need the §4d LLM pass (input: `05-brand-roster-for-llm.csv`) and then §4c.

---

## 5. Deliverables

All CSV — no workbook. Master CSV is what iGoDirect consumes; the rest are the human review surface.

1. **`Offers-Tier-Mapping-DRAFT.csv`** — the 9 vendor columns verbatim, plus `AccessPercent`, `CatalogPosition`, `NormalisedRank`, `BrandKey`, `ContentType`, `Composite`, the six raw signals `R T V M F P`, `SavingFraction`, `V_Imputed`/`M_Imputed`/`T_Imputed`, `RecogSource`, `RecogConfidence`, **`PlacementReason`**, `PinnedBy`, `IsNew`, `PrevAccessPercent`, `OfferKey`, `RunId`, and **`RedeemUrl`** (§5a). → Downloads.
   *`PlacementReason` is the load-bearing column: "why is this at 40%?" is answered by reading one cell, not re-deriving the pipeline.*
2. **`per-band-summary.csv`** — counts, ContentType spread, brand concentration, 5–10 notables per band.
3. **`tier-concordance.csv`** — our 11 bands × their Tier 1/2/3, plus the disagreement list (§1b).
4. **`human-shortlist.csv`** (120 rows) · **`violations.csv`** · **`churn.csv`** · **`acceptance.md`** · **`exclusions.csv`** (the 55 non-AU rows, unparseable Highlights, rule-11 flags). All emitted every run, **including empty ones** — an absent file is indistinguishable from a skipped check.
5. **Override surfaces:** `brand-knowledge.json` (per-brand scores, `lockedBy` freezes a brand) and `overrides.csv` (`OfferKey, PinnedBand, Reason, Author, Date`). Pins are applied **before** the solver and consume band quota, so the solver fills around them rather than fighting them. Precedence: `overrides.csv` > `lockedBy` > LLM consensus > mechanical overrides > raw LLM.
6. **Branded review PDF** for DJ + Michael → Downloads. Technique: `igodirect-member-status-api-plan.md` §9.
7. **After sign-off:** the vendor file (their columns + our `AccessPercent`, keyed on `ID`) + the handoff note in §5.4.

### 5a. `RedeemUrl` — enriching rows from their Product API

iGoDirect confirmed to DJ (2026-07-21) that our integration can also reach their **Product Catalog API**, so each offer row can carry a real redemption link where one exists.

### ✅ Product API — CONNECTED AND VERIFIED (2026-07-21)

**iGoDirect was right: the SSO keys are the Product API keys.** Working call:

```
GET https://api.myrewards.com.au/app/api/v1/products?country=Australia&user_id={id}
Authorization: Basic base64( IGODIRECT_CLIENT_ID : IGODIRECT_SSO_SECRET )
```

> ⚠️ **Correct a wrong entry in our own docs.** `igodirect-sso-implementation-plan.md:122` claimed the API was `/api/v2/products` with `Authorization: Token token={KEY}:{SECRET}`. That is **wrong** and cost a failed probe round. The vendor documentation (https://atwork.com.au/document/) and `igodirect-sso-masterplan.md:50` are correct: **`/app/api/v1/products`, BASIC auth, per-`user_id`**. Trust the masterplan.

**What the probe established:**

| Finding | Detail |
|---|---|
| **Auth works** | No auth → `401`. BASIC `client_id:sso_secret` → `200`. |
| **`country` + `user_id` are MANDATORY** | Omitting either → `400 {"message":"country, user_id fields are missing"}`. There is **no full-catalogue endpoint**. |
| **Not a bulk feed** | Returns ~**10 items** per call. `page` / `per_page` / `offset` are **ignored** — identical payload every time. |
| **✅ JOIN KEY CONFIRMED** | The API's `id` matches our CSV `ID` — **8 of 10** returned ids are present in the CSV. **This resolves §4e's biggest unknown: the refresh anchor is safe on `vid:<ID>`.** |
| **Catalogue has already drifted** | 2 of 10 (`Priceline eGift Card` 1065009, `Woolworths eGift Card` 1064996) are **not** in the June-2026 CSV. Churn is real and live — §4e's re-band machinery is needed, not speculative. |
| **`RedeemUrl` source found** | The `redeem_button_img` field carries the actual deep link (e.g. a JB Hi-Fi corporate-benefits `auth?e=…` URL), despite the misleading name. `web_coupon` was empty on the sample. |
| **Assets available** | `image_url` + `product_images` (S3-hosted). If we ever render these, update **both** `csp.ts` `img-src` and `next.config.ts` `images.remotePatterns`. |
| **`merchant_id` exists** | A vendor-side brand identifier — better than our derived `BrandKey`, but only reachable per-user, so not usable for bulk banding today. |

**Response fields:** `id, merchant_id, name, highlight, offer, image_extension, display_image, logo_extension, strip_image, details, text, redeem_button_img, quantity, web_coupon, used_count, merchant_email, is_favourite, user_used_count, out_of_stock, product_quantity, image_url, product_images`.

**Blocking question for iGoDirect (one, and it is specific):** *how do we obtain the numeric `user_id` for one of our members?* Our SSO `member_id` (`tools_reward_user`) is not accepted, and `/verifytoken` redirects to `…/users/{domain}/new_benefits` without exposing a numeric id. Without it we cannot enrich in bulk — and we should also ask whether a `category_id` sweep can return the full catalogue, since their own sample used `category_id=538`.

**`RedeemUrl` design:** additive and **nullable**. It must never affect scoring or banding — a missing link would otherwise rank offers by *their* data completeness rather than by member value. Env for a future client: register `IGODIRECT_PRODUCT_API_*` in `.env.example` per CLAUDE.md rule 9 (today it reuses the SSO vars).

**Still worth asking:** whether the feed exposes `is_online` / redemption channel — §8 item 5 names it the highest-value missing column, and it would move `M` from mostly-imputed to mostly-measured.

### 5.4 The handoff note must state four things the original plan omitted

1. The gating rule is **"show every offer whose band is ≤ `member_level`"**, not exact match — so legacy **60** and **80** work without a file change.
2. **`member_level: null` while `active: true` is the fail-closed anomaly** — pin it to the 5% band. Never let "unknown → show everything" be the portal-side default.
3. An **`asOf` snapshot stamp** and a default band for offers added after it (inherit the brand's band, else the top band, so a new offer never leaks into cheap tiers).
4. The **re-banding cadence and a named owner.**

---

## 6. Cautions

- Analysis phase only: no app code changes, no repo commits of vendor data. Production wiring is a later phase — flag it, don't do it.
- **Decided (DJ, 2026-07-21): the iGoDirect catalogue is ADDITIVE to our 7 local sponsors, not a replacement.** The 7 redeem by "mention Tools Australia", a mechanic iGoDirect's card-linked portal cannot host, and under the July agreement their catalogue lives on their portal anyway. This keeps the production phase a data change rather than a rendering rewrite. Record it in the playbook decision log.
- **The later production phase must flip twelve documented facts, not one** — README.md:17,:33; BUSINESS.md:16,:179,:187,:194-196,:666 (**move** out of Coming soon per rule 5, don't edit in place),:709 (glossary omits the 5/10/15 mini rungs entirely; the mini-pack table at :110-121 has no partner column at all); CUSTOMER.md §7a; and the stale comment at `PartnerPortalPhone.tsx:19-20`.
- **Rule 5c (Cobber) is already stale and gets worse.** `supportChatFaqs.ts:148-151` tells members "simply mention Tools Australia... there is no code to enter. Browse the full list on the [Partner discounts](/partner) page" — false for the 877 card-linking and 41 eGift rows, and `/partner` is the inbound partner-*application* page, not a catalogue.
- **Two preview surfaces read from the HEAD of the list for every tier** — `PartnerPortalPhone.tsx:39-41` (`.slice(0,3)` under a "Live partner deals" label on the /membership sales page) and `PartnerPreview.tsx:20` (module-level, no tier gate at all). Under ascending order, position 1 is the *weakest* offer. Today's first three are hand-picked flagships, which is why it is invisible. **`ShowcaseRank` exists to solve this** — give each band its own best-in-band highlights. Retrofitting after sign-off forces a second review round.
- Report progress with real numbers, and list anything unclassifiable rather than silently guessing.

---

## 7. Definition of done

Every one of the 1,778 in-scope offers banded · cumulative counts **exactly** equal to the §3a table (no tolerance) · ContentType corridor and per-brand cap met in every band, or logged in `violations.csv` · MHC / PCI / TBM computed and passing, or explicitly signed off · concordance + disagreement list produced · rule-11 flagged list produced · premium shortlist + review PDF delivered · determinism proven by matching `outputSha256` across two runs · open business decisions listed for DJ + Michael, not decided unilaterally.

---

## 8. Still open — for DJ + Michael

| # | Question | Recommendation |
|---|---|---|
| 1 | **Can iGoDirect's portal enforce 11 bands?** Their SSO spec types `member_level` as *optional, alphabetic*, bronze/silver/gold. The July agreement says the portal maps % → visible brands, so the deliverable shape is right — but cardinality is unconfirmed. | Does **not** block scoring: the ordered list survives any number of cut points. Send the written batch (levels supported + encoding; confirm "≤ member_level" gating; what `Tier` encodes; refresh frequency; is `ID` stable; Product API credentials). Build the list first, choose cut points last. |
| 2 | **The 1-hour Mini Pack window.** Designed around (immediacy floor) rather than assumed away. | The honest recommendation is a **24h minimum** (playbook Q9). If that lands, drop the immediacy floor to 4 and the ladder gets cleaner. DJ's call. |
| 3 | **Boss sub ($80/mo) and VIP Pack ($1,000) both resolve to 100%** — indistinguishable to the vendor by construction. | Leave as-is this phase. Capping packs at 95% would add a 12th level, break shipped "100% of Partner Discounts Available" copy, and trigger rules 5/5b/5c. Flag, don't implement. |
| 4 | **Is percentage-of-catalogue the right axis at all?** `igodirect-integration-prep.md:115-119` already warned "'you can see 500 of 1,000' is meaningless to a member" and was overruled without a recorded reason. The claim is live in `supportChatFaqs.ts:150`. | Keep the percentage (it is load-bearing across a dozen surfaces and the `member_level` contract) **and** add per-band value substantiation as a Phase 4 artefact — it is the defence if the claim is challenged, and costs almost nothing once the bands exist. Record why the prep-doc warning was overruled. |
| 5 | **Missing vendor field:** online-vs-in-store is not derivable — only 43 rows carry an `Instore`/`Online` token and 442 have any T&C text, so `M` is imputed for most of the 549 `merchant-discount` rows. | Request an `is_online` / `redemption_channel` flag. **Highest-value missing column in the feed** — it upgrades M from mostly-imputed to mostly-measured. |

---

*Authored 2026-07-16. Revised 2026-07-21 after a 44-agent audit. Companions: `igodirect-member-status-api-plan.md` (the API), `igodirect-integration-playbook.md` §2 (package↔% table).*
