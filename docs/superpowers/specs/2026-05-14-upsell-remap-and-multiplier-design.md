# Upsell Remap & Per-Category Multiplier — Design

**Date:** 2026-05-14
**Status:** Draft, awaiting user review
**Scope:** Replace "Plus" upsells with existing pack identities; make upsell multipliers admin-configurable per category; restructure Mini Pack 4–8 into mini-scoped Additional packs; standardize "free entries" terminology; introduce distinct Stripe descriptions and tracking IDs per upsell category.

---

## 1. Motivation

The current upsell layer maintains a parallel SKU family ("Tradie Plus", "Foreman Plus", "Apprentice Plus", etc.) that mirrors the membership/one-time packs but with bespoke pricing, inclusions, and a hardcoded `2×` entries coefficient ([src/utils/payment/upsell-entries-calculator.ts:101](../../../src/utils/payment/upsell-entries-calculator.ts#L101)).

Three problems with the current model:

1. **Duplicate inclusions** drift over time — e.g., the recently fixed Foreman Plus and Boss Plus had identical $39.99 / 50% pricing because of copy-paste, and the VIP Plus upsell still shows "90%" partner discount when the VIP base pack is 100%.
2. **Upsell entries are hardcoded** at `2× (base × promo)` in the calculator. Marketing has no admin control over how generous a given category's upsell is.
3. **Mini Pack 4–8 are weakly tied to the rest of the catalog** — they have unique tiers but their inclusions, prices, and partner-discount durations match the Additional one-time packs exactly. Maintaining two parallel ladders is overhead.

Going forward we want the upsell layer to compose *known packs* with *configurable multipliers*, and we want Stripe + analytics to clearly distinguish where each charge came from.

---

## 2. Key Decisions

| # | Decision | Status |
|---|---|---|
| D1 | Upsell entities remain distinct records that **reference** a base pack for inclusion shape (Option B). Upsells get their own Stripe products. | ✅ Confirmed |
| D2 | One admin-configurable multiplier knob **per upsell category** (membership / one-time / additional), three knobs total. Mini upsells use no multiplier — upsell entries equal the trigger pack's base entries (price is 50% off, entries identical). | ✅ Confirmed |
| D3 | Tier-based purchase multiplier (subscriber vs. entrant vs. guest) is **already coded** in [src/utils/promo/get-effective-promo-type.ts](../../../src/utils/promo/get-effective-promo-type.ts) and is unchanged by this refactor. | ✅ Verified |
| D4 | Upsell-entries formula becomes: `upsellEntries = upsellCategoryMultiplier × baseEntries`. **No stacking** with active promo multiplier. | ✅ Confirmed |
| D5 | Promo multiplier range expanded to include `2, 3, 5, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 100`. Same list reused for upsell category multipliers. | ✅ Confirmed |
| D6 | Admin promo / upsell configuration screens show per-package entry preview, including a sanity-check "purchase comparison" line that reflects the active promo. | ✅ Confirmed |
| D7 | **No data migration** for existing Mini Pack 4–8 orders or Stripe products. Old SKUs retained for historical records; new mapping applies to future purchases only. Documented in [docs/upsell/](../../upsell/). | ✅ Confirmed |
| D8 | UI display drops the "Additional " prefix from member-only catalog packs. Mini Pack 4–8 are renamed in the UI to "Tradie Pack / Foreman Pack / Boss Pack / Power Pack / VIP Pack". Internal IDs and Stripe descriptions keep the disambiguator. | ✅ Confirmed |
| D9 | All entry counts shown to users — in catalog cards, modals, receipts, emails — use the phrase **"free entries"** regardless of source. | ✅ Confirmed |
| D10 | Distinct Stripe descriptions + tracking IDs per upsell category for analytics and finance attribution. | ✅ Confirmed |

---

## 3. The Full Mapping

This is the source-of-truth artifact for the refactor. Everything below assumes a base catalog of:

### 3.1 Base packs (most unchanged; Mini Pack 4–8 restructured)

The membership subscriptions, regular one-time packs, additional one-time packs, and Mini Pack 1–3 keep their current inclusions; only their *UI display* may change (e.g., "Additional" prefix dropped). Mini Pack 4–8 are replaced with new mini-scoped Additional packs whose partner % and partner duration change to match the Additional ladder (see the Mini Pack 4–8 subsection below).

#### Membership subscriptions

| Internal ID | UI display | Stripe description | Price | Base entries / mo | Partner % | Partner duration |
|---|---|---|---|---|---|---|
| `tradie-subscription` | Tradie | "Tradie Membership" | $20/mo | 15 free | 50% | 30 days |
| `foreman-subscription` | Foreman | "Foreman Membership" | $40/mo | 40 free | 75% | 30 days |
| `boss-subscription` | Boss | "Boss Membership" | $80/mo | 100 free | 100% | 30 days |

#### One-time packs (shown to guests / no-access users)

| Internal ID | UI display | Stripe description | Price | Base entries | Partner % | Partner duration |
|---|---|---|---|---|---|---|
| `apprentice-pack` | Apprentice Pack | "Apprentice Pack" | $25 | 3 free | 25% | 1 day |
| `tradie-pack` | Tradie Pack | "Tradie Pack" | $50 | 15 free | 40% | 2 days |
| `foreman-pack` | Foreman Pack | "Foreman Pack" | $100 | 30 free | 55% | 4 days |
| `boss-pack` | Boss Pack | "Boss Pack" | $250 | 150 free | 70% | 10 days |
| `power-pack` | Power Pack | "Power Pack" | $500 | 600 free | 85% | 20 days |
| `vip-pack` | VIP Pack | "VIP Pack" | $1,000 | 1500 free | 100% | 30 days |

#### Additional one-time packs (shown to subscribers + entrants; "Additional" dropped in UI)

| Internal ID | UI display | Stripe description | Price | Base entries | Partner % | Partner duration |
|---|---|---|---|---|---|---|
| `additional-tradie-pack` | Tradie Pack | "Additional Tradie Pack" | $25 | 15 free | 40% | 2 days |
| `additional-foreman-pack` | Foreman Pack | "Additional Foreman Pack" | $50 | 30 free | 55% | 4 days |
| `additional-boss-pack` | Boss Pack | "Additional Boss Pack" | $125 | 150 free | 70% | 10 days |
| `additional-power-pack` | Power Pack | "Additional Power Pack" | $250 | 600 free | 85% | 20 days |
| `additional-vip-pack` | VIP Pack | "Additional VIP Pack" | $500 | 1500 free | 100% | 30 days |

#### Mini Pack 1–3 (unchanged)

| Internal ID | UI display | Stripe description | Price | Base entries | Partner % | Partner duration |
|---|---|---|---|---|---|---|
| `mini-pack-1` | Mini Pack 1 | "Mini Pack 1" | $1 | 1 free | 25% | 1 hour |
| `mini-pack-2` | Mini Pack 2 | "Mini Pack 2" | $5 | 5 free | 25% | 6 hours |
| `mini-pack-3` | Mini Pack 3 | "Mini Pack 3" | $10 | 10 free | 25% | 12 hours |

#### Mini Pack 4–8 (renamed and restructured to mini-scoped Additional packs)

> Existing orders + Stripe products for `mini-pack-4` … `mini-pack-8` are **left as historical records**. New purchases use the new IDs below.

| New internal ID | Replaces | UI display | Stripe description | Price | Base entries (mini draw) | Partner % | Partner duration |
|---|---|---|---|---|---|---|---|
| `additional-tradie-pack-mini` | `mini-pack-4` | Tradie Pack | "Tradie Pack — Mini Draw" | $25 | 25 free | 40% | 2 days |
| `additional-foreman-pack-mini` | `mini-pack-5` | Foreman Pack | "Foreman Pack — Mini Draw" | $50 | 50 free | 55% | 4 days |
| `additional-boss-pack-mini` | `mini-pack-6` | Boss Pack | "Boss Pack — Mini Draw" | $125 | 125 free | 70% | 10 days |
| `additional-power-pack-mini` | `mini-pack-7` | Power Pack | "Power Pack — Mini Draw" | $250 | 250 free | 85% | 20 days |
| `additional-vip-pack-mini` | `mini-pack-8` | VIP Pack | "VIP Pack — Mini Draw" | $500 | 500 free | 100% | 30 days |

### 3.2 Upsell mappings

All upsells use the formula `upsellEntries = categoryMultiplier × triggerPack.baseEntries`. Active promo multipliers do **not** stack into the upsell calculation.

#### Membership upsells (default category multiplier `10×`)

| Trigger | Upsell internal ID | UI display | Stripe description | Price | Base entries (template) | Default upsell entries (10×) | Partner % | Partner duration |
|---|---|---|---|---|---|---|---|---|
| `tradie-subscription` | `membership-upsell-tradie` | Apprentice Pack | "Apprentice Pack — Membership Bonus" | $9.99 | 3 (apprentice) | **30 free** | 25% | 1 day |
| `foreman-subscription` | `membership-upsell-foreman` | Tradie Pack | "Tradie Pack — Membership Bonus" | $19.99 | 15 (tradie) | **150 free** | 40% | 2 days |
| `boss-subscription` | `membership-upsell-boss` | Foreman Pack | "Foreman Pack — Membership Bonus" | $39.99 | 30 (foreman) | **300 free** | 55% | 4 days |

#### One-time upsells (default category multiplier `2×`)

Same pack as the trigger, 50% off, with `2× base` free entries.

| Trigger | Upsell internal ID | UI display | Stripe description | Price | Base | Default upsell entries (2×) | Partner % | Partner duration |
|---|---|---|---|---|---|---|---|---|
| `apprentice-pack` | `onetime-upsell-apprentice` | Apprentice Pack | "Apprentice Pack — Upsell" | $12.50 | 3 | **6 free** | 25% | 1 day |
| `tradie-pack` | `onetime-upsell-tradie` | Tradie Pack | "Tradie Pack — Upsell" | $24.99 | 15 | **30 free** | 40% | 2 days |
| `foreman-pack` | `onetime-upsell-foreman` | Foreman Pack | "Foreman Pack — Upsell" | $49.99 | 30 | **60 free** | 55% | 4 days |
| `boss-pack` | `onetime-upsell-boss` | Boss Pack | "Boss Pack — Upsell" | $124.99 | 150 | **300 free** | 70% | 10 days |
| `power-pack` | `onetime-upsell-power` | Power Pack | "Power Pack — Upsell" | $249.99 | 600 | **1200 free** | 85% | 20 days |
| `vip-pack` | `onetime-upsell-vip` | VIP Pack | "VIP Pack — Upsell" | $499.99 | 1500 | **3000 free** | 100% | 30 days |

> ⚠️ Awaiting confirmation: the current Apprentice Plus upsell shows 18 entries (`entriesCount: 18` in [src/data/upsellPackages.ts:180](../../../src/data/upsellPackages.ts#L180)). Under the uniform `2×` rule this drops to **6 free entries**. All other one-time upsells already follow `2× base` (Tradie 30, Foreman 60, Boss 300, Power 1200, VIP 3000), so the Apprentice value appears to be an outlier. Treat as 6 unless user requests otherwise.

#### Additional one-time upsells (default category multiplier `2×`)

| Trigger | Upsell internal ID | UI display | Stripe description | Price | Base | Default upsell entries (2×) | Partner % | Partner duration |
|---|---|---|---|---|---|---|---|---|
| `additional-tradie-pack` | `additional-upsell-tradie` | Tradie Pack | "Additional Tradie Pack — Upsell" | $12.50 | 15 | **30 free** | 40% | 2 days |
| `additional-foreman-pack` | `additional-upsell-foreman` | Foreman Pack | "Additional Foreman Pack — Upsell" | $24.99 | 30 | **60 free** | 55% | 4 days |
| `additional-boss-pack` | `additional-upsell-boss` | Boss Pack | "Additional Boss Pack — Upsell" | $62.50 | 150 | **300 free** | 70% | 10 days |
| `additional-power-pack` | `additional-upsell-power` | Power Pack | "Additional Power Pack — Upsell" | $124.99 | 600 | **1200 free** | 85% | 20 days |
| `additional-vip-pack` | `additional-upsell-vip` | VIP Pack | "VIP Pack — Upsell" | $249.99 | 1500 | **3000 free** | 100% | 30 days |

#### Mini upsells (no multiplier — same entries as trigger, 50% off price)

Mini draw upsells deliver **identical free entries** to the triggering mini pack; the only difference is a 50% price discount. Same partner % and partner-discount duration carry over from the trigger pack.

| Trigger | Upsell internal ID | UI display | Stripe description | Trigger price | Upsell price (50% off) | Base entries | Upsell entries |
|---|---|---|---|---|---|---|---|
| `mini-pack-1` | `mini-upsell-1` | Mini Pack 1 | "Mini Pack 1 — Upsell" | $1 | $0.50 | 1 | 1 free |
| `mini-pack-2` | `mini-upsell-2` | Mini Pack 2 | "Mini Pack 2 — Upsell" | $5 | $2.50 | 5 | 5 free |
| `mini-pack-3` | `mini-upsell-3` | Mini Pack 3 | "Mini Pack 3 — Upsell" | $10 | $5.00 | 10 | 10 free |
| `additional-tradie-pack-mini` | `mini-upsell-additional-tradie` | Tradie Pack | "Tradie Pack — Mini Draw Upsell" | $25 | $12.50 | 25 | 25 free |
| `additional-foreman-pack-mini` | `mini-upsell-additional-foreman` | Foreman Pack | "Foreman Pack — Mini Draw Upsell" | $50 | $25 | 50 | 50 free |
| `additional-boss-pack-mini` | `mini-upsell-additional-boss` | Boss Pack | "Boss Pack — Mini Draw Upsell" | $125 | $62.50 | 125 | 125 free |
| `additional-power-pack-mini` | `mini-upsell-additional-power` | Power Pack | "Power Pack — Mini Draw Upsell" | $250 | $125 | 250 | 250 free |
| `additional-vip-pack-mini` | `mini-upsell-additional-vip` | VIP Pack | "VIP Pack — Mini Draw Upsell" | $500 | $250 | 500 | 500 free |

### 3.3 Tracking ID convention

```
{category}-upsell-{tier}
  category  ∈ { membership, onetime, additional, mini }
  tier      = base-pack identity (apprentice | tradie | foreman | boss | power | vip
                                  | additional-tradie | … | 1 | 2 | 3)
```

### 3.4 Stripe-description disambiguators

| Suffix | Source |
|---|---|
| *(none — base name only)* | Regular pack purchase |
| ` — Membership Bonus` | Membership upsell |
| ` — Upsell` | One-time / Additional upsell |
| ` — Mini Draw` | Mini-scoped Additional pack purchase |
| ` — Mini Draw Upsell` | Mini-scoped Additional pack upsell |

These appear in Stripe Dashboard, payment-success emails, and webhook payloads, giving finance + analytics a clean partition of revenue without touching internal IDs.

---

## 4. Implementation surface

### 4.1 New code surface

- **New admin-configurable settings:** category multipliers for `membership-upsell`, `onetime-upsell`, `additional-upsell`. Stored alongside existing promo configuration (single document or new `UpsellMultiplierConfig` model — implementation plan to decide).
- **Admin UI section:** new "Upsell Multipliers" panel under the existing admin promo/configuration area, with the per-pack entry preview from §5.
- **New mini-scoped Additional packs:** five new `StaticMembershipPackage` records added to [src/data/membershipPackages.ts](../../../src/data/membershipPackages.ts) — or, more likely, a new sibling file (e.g. `src/data/miniAdditionalPackages.ts`) keeping mini-scoped packs grouped. Implementation plan decides.

### 4.2 Files certain to change

- [src/data/upsellPackages.ts](../../../src/data/upsellPackages.ts) — full rewrite: new entity per the §3.2 mapping; each entity references a base-pack id rather than carrying inclusions directly.
- [src/utils/payment/upsell-entries-calculator.ts](../../../src/utils/payment/upsell-entries-calculator.ts) — replace hardcoded `2 ×` with category-aware lookup; remove `promoMultiplier` factor.
- [src/data/miniDrawPackages.ts](../../../src/data/miniDrawPackages.ts) — entries 4–8 marked `isActive: false` (records retained for historical reads); the new mini-scoped Additional packs live elsewhere and are surfaced by the mini-draw catalog query.
- [src/types/promo-multiplier.ts](../../../src/types/promo-multiplier.ts) — extend `PromoMultiplier` to the full `2…100` set.
- Mini draw catalog component + major draw catalog component — load mini-scoped Additional packs from the new source and render with the new display names.
- Receipt / order-history / cart components — apply Stripe-description-style suffixes when the same display name applies to multiple SKUs (e.g., three "Tradie Pack" rows distinguished by `(Member)` / `(Mini Draw)` context labels). Exact label wording finalized at implementation.
- Repo-wide find-and-replace pass for entry-count strings, replacing patterns like `"X Entries"` / `"Free Entries"` / `"Entries"` with the canonical phrase `"X free entries"` (§4.3).

### 4.3 Terminology pass

A bounded sweep across:
- All copy in `src/components/**`
- Email templates (`*-email-template.html`)
- Toast / modal / banner strings
- Receipt and order-history rendering

Goal: every entry count visible to a user reads "**N free entries**" (e.g., "30 free entries", "1500 free entries"). Internal field names (`totalEntries`, `entriesPerMonth`) stay as-is.

### 4.4 Out of scope

- **No backfill or migration** of historical Mini Pack 4–8 purchase records.
- **No retroactive entry recomputation** for users who bought under the old upsell rules.
- **No changes to the catalog swap rule** (`hasAdditionalPackageAccess`) — that logic stays.
- **No changes to `getEffectivePromoType`** — the subscriber-vs-entrant differentiation continues to work via existing promo multipliers.

---

## 5. Admin preview UI (entry calculation preview)

The admin Upsell-Multiplier panel renders, for each category, a live preview of the entries every upsell will deliver given the chosen multiplier and the currently active promo. The preview is read-only context — it does not change behavior, it just helps the admin verify before saving.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ACTIVE PROMO (read-only)                                                 │
│   membership-packages: 10×    one-time-packages: 5×    mini-packages: 1× │
└──────────────────────────────────────────────────────────────────────────┘

┌─ Membership Upsells ────────────────────────────  multiplier [ 10× ▾ ] ──┐
│                                                                          │
│ Trigger                Upsell shown    Base  →  Upsell entries    Price  │
│ Tradie subscription    Apprentice      3     →  30                $9.99  │
│ Foreman subscription   Tradie Pack     15    →  150               $19.99 │
│ Boss subscription      Foreman Pack    30    →  300               $39.99 │
│                                                                          │
│ ℹ Purchase comparison (Tradie sub during 10× promo): 15 × 10 = 150       │
│   purchase entries. Upsell adds 30 free entries on top.                  │
└──────────────────────────────────────────────────────────────────────────┘

┌─ One-Time Upsells ──────────────────────────────  multiplier [ 2× ▾ ] ───┐
│ (same shape, per-row preview, one comparison line)                       │
└──────────────────────────────────────────────────────────────────────────┘

┌─ Additional Upsells ────────────────────────────  multiplier [ 2× ▾ ] ───┐
│ (same shape)                                                             │
└──────────────────────────────────────────────────────────────────────────┘

┌─ Mini Upsells ──────────────────  no multiplier, 50% off price only ─────┐
│ Same free entries as trigger pack; price is 50% off.                     │
│ Mini Pack 1 → 1,  Mini Pack 2 → 5,   Mini Pack 3 → 10,                   │
│ Tradie Mini → 25, Foreman Mini → 50, Boss Mini → 125,                    │
│ Power Mini → 250, VIP Mini → 500                                         │
└──────────────────────────────────────────────────────────────────────────┘
```

The same "entries-per-package preview" treatment is added to the existing **promo configuration screen** so admins setting a new promo can see purchase entries per package update live as they tweak the per-category multipliers.

---

## 6. Risks & open items

1. **"Tradie Pack" display label collides across SKUs.** In a subscriber/entrant's *active cart or catalog*, two distinct SKUs render as "Tradie Pack": `additional-tradie-pack` (major draw, $25) and `additional-tradie-pack-mini` (mini draw, $25). In *order history* a third row can appear if the same user previously bought `tradie-pack` ($50) before gaining access. Mitigation: receipts and order history append a context suffix (e.g., `(Major Draw)` / `(Mini Draw)`); active cart relies on page context plus a small subtitle. Final wording at implementation.
2. **The hardcoded `2 ×` change** in `upsell-entries-calculator.ts` is a behavior change for existing in-flight upsell calculations. Coordination needed so the admin multiplier config is in place before the calculator change ships.
3. **Stripe products / prices for new upsell SKUs** need to be created in Stripe before the new upsell records can transact. Implementation plan will list each SKU and the Stripe-side action required.
4. **Apprentice tier in the additional/mini ladder** does not exist (intentional — current design starts member tiers at Tradie). Confirm no future plan adds Apprentice to the mini-scoped Additional set.
5. **`isMemberOnly` flag on new mini-scoped Additional packs** — the five new `additional-*-pack-mini` records need `isMemberOnly` set. For consistency with their major-draw siblings and to plug into `getEffectivePromoType`'s subscriber-bonus path, default is `isMemberOnly: true`. Confirm at implementation.
6. **Stripe Product ID assignment strategy** — only memberships currently source Stripe IDs from env vars ([membershipPackages.ts:17-23](../../../src/data/membershipPackages.ts#L17-L23)). For 22 new upsell SKUs we either (a) extend the env-var pattern, (b) hardcode IDs into the upsell data file, or (c) introduce a config doc. Decision deferred to implementation plan.
7. **Behavior change for high-promo periods** — current upsell formula stacks promo (`2 × base × promo`); new formula replaces promo (`category × base`). During a 10× promo, the same `2×` upsell becomes half as generous. Admin controls the `categoryMultiplier` knob to compensate during promos if desired.

---

## 7. Acceptance checklist (for implementation phase)

- [ ] `src/data/upsellPackages.ts` rewritten per §3.2; all 22 upsell records (3 membership + 6 one-time + 5 additional + 8 mini) have correct trigger, display name, Stripe description, price, base-pack reference, and tracking ID.
- [ ] Mini-scoped Additional packs (5 records) created with new IDs and rendered on the mini-draw catalog.
- [ ] `Mini Pack 4–8` source records flagged inactive; historical orders unaffected.
- [ ] `upsell-entries-calculator.ts` reads category multiplier from admin config; formula is `categoryMultiplier × base`.
- [ ] Admin Upsell-Multiplier panel renders preview tables per §5.
- [ ] Admin promo screen shows per-package entry preview using the same UX.
- [ ] `PromoMultiplier` type updated to allow `2, 3, 5, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 100`.
- [ ] All user-facing entry strings read "*N* free entries".
- [ ] Stripe products created for each new upsell SKU with the descriptions in §3.4.
- [ ] Domain documentation refreshed (per the Domain Manifest in CLAUDE.md):
  - [ ] `docs/upsell/` — new mapping, no-migration note, multiplier formula.
  - [ ] `docs/subscription/` — note membership-upsell behavior change.
  - [ ] `docs/admin/` — new Upsell-Multiplier admin panel.
  - [ ] `docs/billing-stripe/` — new Stripe products and description conventions.
  - [ ] `docs/promo/` — multiplier list expansion.

---

## 8. Reference: untouched code

For reviewer convenience, the following pieces are *unchanged* by this design and remain authoritative:

- [src/utils/membership/has-additional-package-access.ts](../../../src/utils/membership/has-additional-package-access.ts) — catalog swap rule.
- [src/utils/promo/get-effective-promo-type.ts](../../../src/utils/promo/get-effective-promo-type.ts) — tier-based purchase multiplier resolution.
- [src/utils/payment/subscription-entries-calculator.ts](../../../src/utils/payment/subscription-entries-calculator.ts) — initial / renewal / upgrade / resubscribe math.
- The promo system itself (active-promo selection, multiplier application to purchase entries) — only the *value range* widens.
