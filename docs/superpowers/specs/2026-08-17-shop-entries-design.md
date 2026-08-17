# Shop — free entries on merchandise

**2026-08-17** · branch `feature/merchandise` · **2 of 3** · **blocked on a permit variation**

Sibling specs: [shop-catalogue-and-checkout](2026-08-17-shop-catalogue-and-checkout-design.md) ·
[print-provider-fulfilment](2026-08-17-print-provider-fulfilment-design.md)

Provenance: `[V]` verified · `[D]` documented · `[A]` assumed.

---

## 1. Problem and done

Merchandise is a weak proposition on its own. Every other thing we sell **includes free
entries** into the monthly Major Draw, and merch should too — that is what turns a hoodie from
a margin product into part of the membership offer.

**Done means** buying a merch item credits its stated free entries to the buyer's Major Draw
total, exactly once, visible on the dashboard, and reversible on a full refund.
 **Number that says it worked:** entries credited
equals entries owed for the first 50 orders, with no reconciliation cron corrections.

**Failure** is any of: entries credited to the wrong bucket, credited twice, credited to the wrong buyer, or any customer-facing string that prices entries per dollar.

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| How many entries | **Fixed count per SKU**, authored by an admin, independent of price | No dollar-to-entry ratio exists in the system, so none can leak into copy. Rejected: `$1 = 1 entry` — that IS the prohibited construct (§8) |
| Where the grant runs | Through `processPaymentBenefits` as a new `packageType: "shop"` | Inherits the idempotency gate and the reversal ledger. Rejected: a new grant function — four copy-pasted `addToMajorDraw` variants already exist and only one is atomic |
| Source key | `entriesBySource.shop` | Matches repo vocabulary |
| Which pool | Major Draw only, never Mini Draw | Separate pools; Terms states the distinction to customers `[D BUSINESS.md]` |
| Promo multipliers | **Merch inherits the one-time pack multiplier** | Both move together, so the ratio never changes and merch cannot overtake the packs during a promo. `resolveMultiplierForPayment("one-time")` already exists, so this needs **no new promo type, enum value or admin surface** — a merch-specific promo category would have needed all four. Decided by the owner 2026-08-17, reversing an earlier "no multiplier" recommendation whose fairness and margin arguments were both wrong |
| Ineligible customers | **Grant the entries to everyone. Filter at draw time, not at point of sale** | Corrected by the owner 2026-08-17, reversing an invented carve-out. There is no reliable way to know a buyer's state or age at checkout, and the platform already solves this at the other end: the Major Draw export excludes SA/ACT before a winner is picked `[V src/app/api/admin/major-draw/export/route.ts:120-131]`. Adding a point-of-sale skip would be a second, weaker copy of a filter that already works — and would silently withhold entries from anyone whose profile data is merely missing |
| Returns | Entries stay granted; state it in Terms | Matches existing partial-refund behaviour — the system deliberately skips reversal because it "cannot safely undo half an entry" `[D BUSINESS.md]` |
| Freeze window | Sell continuously; entries route to the next draw | Refusing apparel sales for 4 hours a month is the wrong trade |

## 3. Starting state (verified)

| Fact | Provenance |
|---|---|
| Entries are **aggregated counters** on the draw doc, not rows | `[V src/models/MajorDraw.ts:213]` |
| `TicketEntry` is write-dead — nothing creates rows. Do not extend it | `[D BUSINESS.md]` + `[V]` no live writer found |
| Canonical grant chain: `processPaymentBenefits` → `grantBenefits` → private `addToMajorDraw` | `[V src/utils/payment/payment-processing.ts:1083, :2145]` |
| `packageType` is a closed union in **5 sites** plus the `PaymentEvent` Mongoose enum | `[V src/utils/payment/payment-processing.ts:187, 288, 821, 953, 1086; src/models/PaymentEvent.ts:76]` |
| Idempotency is a unique index on `{paymentIntentId, eventType}` | `[V src/models/PaymentEvent.ts:149]` |
| The sourceType switch falls through to `default: "membership"` | `[V src/utils/payment/payment-processing.ts:2204]` |
| `getTargetMajorDraw()` already handles frozen / paid-during-freeze / gap → next queued draw | `[V src/utils/draws/major-draw-helpers.ts:34]` |
| New purchases are gated by `checkMajorDrawActiveForNewPurchases()`, which exempts only mini-draw and subscription renewals | `[V src/utils/payment/payment-processing.ts:344]` |
| `isGiveawayIneligible(state, birthdate)` exists — but is **not used by this feature**. Exclusion is applied by the draw export, not at point of sale | `[V src/utils/giveaway-eligibility.ts:17; src/app/api/admin/major-draw/export/route.ts:120-131]` |
| `/shop` is **not** in the e2e legal-copy scanned page list | `[V e2e/specs/marketing/legal-copy.spec.ts:32-37]` |
| Cobber asserts the shop is "coming soon"; corpus size is pinned | `[V src/data/supportChatFaqs.ts:141; src/data/__tests__/faqs.test.ts:159]` |

## 4. Design

`Product.includedEntries: Number` — authored per product, never derived from price. This is the
**base** count; the number actually granted is `base × qty × multiplier`.

Grant happens in the webhook, at payment, **not** at fulfilment — so a printing delay never
delays a customer's entries.

```
webhook → resolveMultiplierForPayment("one-time")            ← merch inherits, never its own type
        → processPaymentBenefits({ packageType: "shop", entries: base × qty × (multiplier ?? 1) })
        → grantBenefits → addToMajorDraw(sourceTypeOverride: "shop")
        → pushDrawGrant({ kind: "major", drawId, sourceKey: "shop", entries })
```

The ledger row is what makes a refund reversible; without it, reversal falls back to a legacy
walk that has corrupted totals before `[D src/utils/draws/remove-draw-entries.ts]`.

### The multiplier, and the display trap it creates

`resolveMultiplierForPayment` takes `PackageTypeShort` and `convertPackageType` accepts exactly
`membership` / `one-time` / `mini-draw`, throwing on anything else
`[V src/services/admin/PromoMultiplierResolverService.ts:54-65, :303]`. Passing `"one-time"`
therefore works **today with no enum change** — that is the whole reason this option is cheap.

Better still, **do not call the resolver directly.** `getActivePromoMultiplier(packageType)` is a
local helper in the very file the shop branch lives in
`[V src/services/stripe-webhook-handlers/index.ts:311-322]`. It wraps the resolver and already
does both things the edge-case table demands: `resolved ?? 1` `[V :317]` and `catch → return 1`
`[V :318-321]`. The one-time path calls it at `[V :1195-1196]` as
`entriesCount * promoMultiplier`. The shop branch calls the identical helper with `"one-time"`.
**No new multiplier code on either side of this feature.**

Merch also inherits the `derived-from-membership` branch, which only fires for
`one-time-packages` (10→5, 5→3, 3/2→2) `[V :37-49, :175-181]`. So a membership promo lifts merch
automatically, at the reduced one-time rate, without anyone configuring a second thing.

**The trap:** the product page prints a fixed `includedEntries` while the granted number is
multiplied. During a 5× promo the page says 8 and the buyer receives 40. Displayed and granted
counts must come from the **same resolver call**, and the page must therefore be dynamic, not
statically prerendered — a cached "8" outlives the promo in both directions.

**The client side needs no new plumbing at all.** `useResolvedMultiplier("one-time-packages")`
reads `/api/promo/alternating-multiplier/current` `[V src/hooks/queries/usePromoQueries.ts:154-167]`,
which calls `getEffectiveMultipliers()` → `getResolvedMultiplierWithSource()`
`[V src/app/api/promo/alternating-multiplier/current/route.ts:14; PromoMultiplierResolverService.ts:201]`
— **the same chain `resolveMultiplierForPayment` uses** `[V :304]`, derived-from-membership
included. Page and grant therefore agree by construction, and the shop page reuses an existing
hook with **zero file changes**. Rejected: adding a `"shop-packages"` promo type, which the union
closes at three members across **34 files** plus four Mongoose enums and two Norm Zod schemas.

**One real trap, one false one.** `resolveMultiplierForDisplay` is a genuine trap — it stops at
active-promo → alternating and never reaches the derived branch `[V :278-293]`, so calling it
server-side would print 8 while the buyer receives 40. But it is **not** what the hook uses: the
hook's `_context: "display" | "payment"` parameter is **dead**, ignored by the body
`[V usePromoQueries.ts:156, :160-167]`. Do not "fix" the hook to honour it.

Two further landmines found in recon: `applyPromoToPackage`
`[V src/data/membershipPackages.ts:404-423]` reads exactly like the shared helper this needed and
has **zero callers** — do not wire money math to it. And the grant multiplier must be resolved
**server-side at fulfilment**; the client's rendered number is display only and must never be
trusted as input.

### Edge and failure states

| Case | Behaviour |
|---|---|
| Buyer is SA/ACT or under 18 | Garment ships **and entries are granted**. Exclusion happens when a winner is drawn, not when the money is taken — same as every other entry source |
| Purchase lands during the 8pm–midnight freeze | `getTargetMajorDraw()` routes to the next queued draw |
| No queued draw exists during a gap | `getTargetMajorDraw` throws `[V major-draw-helpers.ts:34]` — must be caught so the Order still writes |
| Draw credit fails | `addToMajorDraw` logs an ErrorReport and **does not rethrow** `[V payment-processing.ts]` — money taken, entries missing, healed by the reconcile cron |
| Full refund | Ledger replayed backward, entries removed |
| Partial refund (one item of several) | Entries **stay** — the decided policy, must be in Terms |
| Multi-item cart | Entries summed across lines, one grant call |
| Resolver returns `null` | Read as **1×**, not 0. A `?? 1` — an `\|\| 1` would also swallow a genuine 0 |
| Resolver throws / DB down mid-webhook | Grant the **base** count and log. Never fail the webhook over a promo lookup, and never grant 0 because a promo lookup failed |
| Promo **starts** between add-to-cart and payment | Buyer gets the higher count. Payment time is the resolution time — same rule the packs use |
| Promo **ends** between add-to-cart and payment | Buyer gets the base count, having been shown more. Mitigated by resolving at render *and* showing the promo's end time, not by freezing a stale number |
| Multiplier is fractional or absurd | It is admin-authored and shared with the packs. Not separately validated here; a bad value is already a site-wide problem |

## 5. Threading checklist

A new `entriesBySource` key must be added in every row below. **TypeScript catches none of the
silent ones** — Mongoose strict mode drops unknown keys without error.

| # | Location | Miss it and… | Fails |
|---|---|---|---|
| 1 | `MajorDraw` schema `entriesBySource` `[V src/models/MajorDraw.ts:213]` | Entries dropped on write | **silent** |
| 2 | `freshEntriesBySource` zero-shape `[V payment-processing.ts:2254]` | A user's **first** shop grant is lost | **silent** |
| 3 | `DrawGrantService` fresh-row shape `[V src/services/redeemables/DrawGrantService.ts:46]` | Same, on the non-payment path | **silent** |
| 4 | `MajorDrawSourceType` `[V src/utils/draws/remove-draw-entries.ts:19]` | Refunds no-op | **silent** |
| 5 | Both sums in `major-draw-queries.ts` `[V :144 and :278]` | Entries exist but are invisible on the dashboard | **silent** |
| 6 | Refund-reversal cast list `[V src/utils/payment/refund-ledger-reversal.ts:89]` | Falls back to the legacy walk | **silent** |
| 7 | `packageType` union — 5 sites + `PaymentEvent` enum | Grant throws at runtime | loud |
| 8 | `addToMajorDraw` sourceType switch `[V :2204]` | **Shop entries credited to the membership bucket.** No error, wrong analytics, wrong refunds | **silent** |
| 9 | `GATES_CLOSED` exemption `[V :344]` | Hoodie unbuyable during the freeze | loud |
| 10 | Product page entry count must call `resolveMultiplierForPayment("one-time")` | Page prints 8 during a 5× promo, buyer receives 40. **We advertised less than we gave, or more** | **silent** |
| 11 | Shop routes must stay dynamic. **Already true** — all three carry `export const dynamic = "force-dynamic"` `[V src/app/(site)/shop/page.tsx:10; [slug]/page.tsx:21; brand/[brand]/page.tsx:15]`, for the nonce-CSP route class rather than for us | No edit needed; needs a **guard** so a future perf pass that removes it does not silently freeze the entry count | **silent** |
| 12 | `null` multiplier coerced with `?? 1` | `\|\| 1` looks identical and behaves identically here — but silently rewrites a real 0 if one ever appears | **silent** |

## 6. Tests

Every silent row above needs an assertion, because nothing else will catch it.

| Assertion | Row |
|---|---|
| After a shop grant, `entriesBySource.shop` on the draw doc equals the expected count — read back from Mongo, not from the return value | 1 |
| A user with **no** prior row in this draw gets `shop` entries on the `$push` path | 2 |
| `DrawGrantService` fresh row includes a `shop` key | 3 |
| `MajorDrawSourceType` accepts `"shop"` (type-level + runtime removal test) | 4 |
| `getUserMajorDrawStats` and `getUserCurrentMajorDrawStats` both include shop entries in their totals | 5 |
| Full refund of a shop order returns `entriesBySource.shop` to its prior value | 6 |
| **Shop grant increments `shop`, and leaves `membership` unchanged** — the switch-fallthrough guard | 8 |
| Replayed webhook grants exactly once | idempotency |
| Declined payment grants nothing | money path |
| An SA/ACT buyer IS granted entries, and the Major Draw export still excludes them from winner selection — the two halves of the corrected decision, asserted together | eligibility |
| A purchase during the freeze lands on the **next** draw's id | 9 |
| With a 5× one-time promo active, a 2-entry item × 3 qty grants **30** | 10 |
| **The number the product page renders equals the number granted**, asserted against one shared resolver call — the only assertion that actually catches the display trap | 10 |
| A membership-only 10× promo grants merch **5×**, proving the derived branch is reached and `resolveMultiplierForDisplay` was not used | 10 |
| A `null` multiplier grants the base count, not zero | 12 |
| A resolver **throw** still grants the base count and does not fail the webhook | 12 |

New file `src/utils/payment/__tests__/shop-entry-grant.test.ts` + a `test:shop-entries` script.

## 7. Phases

One phase. It does not split usefully — a half-threaded entry source is worse than none.

| # | Ships | User-visible win |
|---|---|---|
| **1** | `shop` source threaded through all 12 rows, multiplier inherited from one-time on both the grant and the page, Terms + competition terms + Cobber + product copy, `/shop` added to the legal-copy scan | Buying merch credits free entries |

## 8. Legal — the hard constraint

**Prohibited:** "every $1 you spend = entries". It publishes a dollar-to-entry exchange rate,
which is pricing entries per unit, and it inverts the trade-promotion structure — the garment
must be the thing sold and the entries an unpriced inclusion.

It would also **pass every automated guard**: the regex requires a literal `per` or `/` between
the amount and "entry" `[V e2e/specs/marketing/legal-copy.spec.ts:20]`, and `/shop` is not in the
scanned list `[V :32-37]`. Adding `/shop` to `PAGES` is part of this phase.

**Correct:** "The $79.95 Tools Australia hoodie **includes 10 free entries** into this month's
prize draw." Price and entry count as two separate facts, never a rate.

**Terms.** `/terms` §3 and §17 and `/competition-term-majordraw` §4 enumerate **exactly three**
entry sources as closed lists, and §17 asks customers to *acknowledge* it `[V]`. All three need
merchandise as a fourth entry method, plus the returns-and-entries rule.

**A human must decide this, not the spec:** the promotion runs under NSW TP/05113 / NTP/17494,
issued against its stated entry mechanics. A fourth paid entry route may require a permit or
notification variation.

## 9. Rollback

**Kill switch:** set `includedEntries: 0` on every product in admin. No deploy, no code path
change — the grant call computes zero and writes nothing, and the copy that renders the entry
count is driven from the same field, so the promise disappears with the grant. A running promo
cannot resurrect it, because the multiplier is applied to the base: `0 × 5 = 0`.

**This is also how the feature ships while the permit answer is outstanding.** Build and merge
with every product at `includedEntries: 0` — the code is live, the promise is not made, and
nothing customer-facing claims an entry. Flipping the number on is an admin edit on the day the
permit lands, not a deploy. The Terms and Cobber copy is the exception: it must land *with* the
flip, not before, or the site describes an entry route customers cannot get.

**In-flight:** entries already granted stay granted. Reversing them retroactively would
contradict the returns policy we just wrote into Terms.

**Recovery surface:** a failed draw credit writes an ErrorReport and leaves `drawGrants` empty
— deliberately, so the `reconcile-major-draw-entries` cron can heal it without double-crediting
`[V src/utils/payment/payment-processing.ts]`.

## 10. Open dependencies

| Item | Owner | Asked | Expected | Blocks |
|---|---|---|---|---|
| **Permit / notification variation** for a fourth entry method | DJ + promotions lawyer | 2026-08-17 | — | **all of phase 1** |
| Sign-off on entry counts per SKU, and whether a ceiling applies | DJ | 2026-08-17 | — | Copy + seeding |
| Terms + competition-terms wording review | DJ + lawyer | 2026-08-17 | — | Launch, not build |

If the permit answer is no, spec 1 still ships a working shop; this spec is simply not built.

**The permit gates the launch, not the build.** Because the kill switch is a data value rather
than a code path, phase 1 can be written, tested and merged with every product at
`includedEntries: 0` before the answer arrives. What must NOT ship ahead of the permit is the
customer-facing promise: Terms, competition terms, Cobber and any product copy asserting free
entries. Those land in the same branch and stay unpublished until the flip.
