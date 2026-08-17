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
total, exactly once, visible on the dashboard, reversible on a full refund, and skipped for
customers who are not eligible to enter. **Number that says it worked:** entries credited
equals entries owed for the first 50 orders, with no reconciliation cron corrections.

**Failure** is any of: entries credited to the wrong bucket, credited twice, credited to an
SA/ACT or under-18 customer, or any customer-facing string that prices entries per dollar.

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| How many entries | **Fixed count per SKU**, authored by an admin, independent of price | No dollar-to-entry ratio exists in the system, so none can leak into copy. Rejected: `$1 = 1 entry` — that IS the prohibited construct (§8) |
| Where the grant runs | Through `processPaymentBenefits` as a new `packageType: "shop"` | Inherits the idempotency gate and the reversal ledger. Rejected: a new grant function — four copy-pasted `addToMajorDraw` variants already exist and only one is atomic |
| Source key | `entriesBySource.shop` | Matches repo vocabulary |
| Which pool | Major Draw only, never Mini Draw | Separate pools; Terms states the distinction to customers `[D BUSINESS.md]` |
| Ineligible customers | Sell the garment, skip the entries, say so at point of sale | Lawful to sell to SA/ACT; not lawful to grant them an entry |
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
| `isGiveawayIneligible(state, birthdate)` exists and is exported — SA/ACT + under 18 | `[V src/utils/giveaway-eligibility.ts]` |
| `/shop` is **not** in the e2e legal-copy scanned page list | `[V e2e/specs/marketing/legal-copy.spec.ts:32-37]` |
| Cobber asserts the shop is "coming soon"; corpus size is pinned | `[V src/data/supportChatFaqs.ts:141; src/data/__tests__/faqs.test.ts:159]` |

## 4. Design

`Product.includedEntries: Number` — authored per product, never derived from price.

Grant happens in the webhook, at payment, **not** at fulfilment — so a printing delay never
delays a customer's entries.

```
webhook → processPaymentBenefits({ packageType: "shop", entries: includedEntries × qty })
        → grantBenefits → addToMajorDraw(sourceTypeOverride: "shop")
        → pushDrawGrant({ kind: "major", drawId, sourceKey: "shop", entries })
```

The ledger row is what makes a refund reversible; without it, reversal falls back to a legacy
walk that has corrupted totals before `[D src/utils/draws/remove-draw-entries.ts]`.

### Edge and failure states

| Case | Behaviour |
|---|---|
| Buyer is SA/ACT or under 18 | Garment ships; entries skipped; `entriesGranted: 0` recorded |
| Purchase lands during the 8pm–midnight freeze | `getTargetMajorDraw()` routes to the next queued draw |
| No queued draw exists during a gap | `getTargetMajorDraw` throws `[V major-draw-helpers.ts:34]` — must be caught so the Order still writes |
| Draw credit fails | `addToMajorDraw` logs an ErrorReport and **does not rethrow** `[V payment-processing.ts]` — money taken, entries missing, healed by the reconcile cron |
| Full refund | Ledger replayed backward, entries removed |
| Partial refund (one item of several) | Entries **stay** — the decided policy, must be in Terms |
| Multi-item cart | Entries summed across lines, one grant call |

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
| Ineligible (SA / ACT / under-18) buyer gets `entriesGranted: 0` | eligibility |
| A purchase during the freeze lands on the **next** draw's id | 9 |

New file `src/utils/payment/__tests__/shop-entry-grant.test.ts` + a `test:shop-entries` script.

## 7. Phases

One phase. It does not split usefully — a half-threaded entry source is worse than none.

| # | Ships | User-visible win |
|---|---|---|
| **1** | `shop` source threaded through all 9 rows, eligibility split, Terms + competition terms + Cobber + product copy, `/shop` added to the legal-copy scan | Buying merch credits free entries |

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
count is driven from the same field, so the promise disappears with the grant.

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
