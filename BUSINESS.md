# Tools Australia — Business Context

> **Audience.** AI agents, new engineers, and anyone who needs to understand *what the platform does*, *how money flows*, and *what rules it actually enforces* — without reading the codebase first. Cross-references point to authoritative docs and source files in this repo.

---

## 1. What the business is

Tools Australia is a **membership-driven giveaway and rewards platform** for Australian tradespeople — electricians, plumbers, carpenters, builders, mechanics, and adjacent trades. The user's trade is captured via [src/data/professions.ts](src/data/professions.ts) and state via [src/data/australianStates.ts](src/data/australianStates.ts), so audience segmentation and prize/promo targeting can be trade-specific. Customers buy **entries** into monthly tool giveaways. More entries = better odds. Entries are earned by:

1. **Buying a one-time tool pack** (Apprentice → VIP).
2. **Subscribing to a monthly membership** (Tradie / Foreman / Boss).
3. **Taking an upsell** after any purchase (50–60% off, with a category-specific entries multiplier — membership 10×, one-time/additional 2×, mini 1×; see §5).
4. **Referring a friend**, **using an affiliate link**, or **participating in promos**.

On top of the giveaway loop, members unlock **tiered partner discounts** (currently 7 partner brands, scaling to 1,000+ once the partner API lands) and — once the shop launches — **shop discounts** (5–20%).

The platform is a Next.js 15 + MongoDB + Stripe + NextAuth stack on Vercel. The hard architectural rules live in [CLAUDE.md](CLAUDE.md).

---

## 2. Packages — the catalog you must understand first

Source of truth: [src/data/membershipPackages.ts](src/data/membershipPackages.ts), [docs/subscription/](docs/subscription/).

There are **three families** of packages:

### 2a. Subscription packages (recurring monthly)

| Tier    | Price   | Entries / month | Partner-discount access | Shop discount* |
| ------- | ------- | --------------- | ----------------------- | -------------- |
| Tradie  | $20/mo  | 15              | 50% of catalog          | 5%             |
| Foreman | $40/mo  | 40              | 75% of catalog          | 10%            |
| Boss    | $80/mo  | 100             | 100% of catalog         | 20%            |

\* Shop discount is built into the data model but **commented out as "Shop coming soon"** until the shop launches.

Partner access for subscriptions is **lifecycle-gated** — active while the subscription is active, not a fixed window (`partnerDiscountDays: 0`). It re-enables the moment a paused or past-due subscription returns to good standing.

### 2b. One-time non-member packs

| Tier       | Price | Entries | Partner access | Partner window |
| ---------- | ----- | ------- | -------------- | -------------- |
| Apprentice | $25   | 3       | 25%            | 1 day          |
| Tradie     | $50   | 15      | 40%            | 2 days         |
| Foreman    | $100  | 30      | 55%            | 4 days         |
| Boss       | $250  | 150     | 70%            | 10 days        |
| Power      | $500  | 600     | 85%            | 20 days        |
| VIP        | $1000 | 1500    | 100%           | 30 days        |

One-time packs grant a **time-limited window** of partner access (`partnerDiscountDays`).

### 2c. Additional packs (discounted variants for engaged users)

Cheaper variants of the one-time packs — same entries, ~half the price (e.g. Additional Tradie $25 for 15 entries; Additional Power $250 for 600 entries). Apprentice variant exists but `isActive: false`.

**Eligibility — not strictly member-only.** A user can buy Additional packs if they have **either**:

1. An **active subscription**, or
2. **Entries in the current major draw** (any pack purchased this cycle counts).

The single source of truth is [`hasAdditionalPackageAccess`](src/utils/membership/has-additional-package-access.ts) — `activeSubscription === true || currentDrawEntries > 0`. The function comment even notes the prior framing ("previously 'member-only' packages") was outgrown. In practice this means a non-subscriber who bought, say, a one-time Tradie pack this month unlocks Additional pricing for the rest of the cycle.

### 2d. Upsell packages

22 records in [src/data/upsellPackages.ts](src/data/upsellPackages.ts): 3 membership upsells + 6 one-time + 5 additional + 8 mini. See §5.

---

## 3. The draw system

Source of truth: [docs/draws/](docs/draws/), models `MajorDraw`, `MiniDraw`, `TicketEntry`, `Winner`.

### 3a. Major Draw — the headline

- **Cadence: monthly, drawn on the 27th** of each month (cycle runs 28th → 27th).
- **Times (Australian Eastern, AEST in winter / AEDT in summer):**
  - **8:00 PM** — entries freeze. The pool for this cycle is locked. Draw transitions `active → frozen`.
  - **8:30 PM** — the draw is run **live on Facebook**. Draw transitions `frozen → completed`.
  - **12:00 AM (28th)** — the next cycle's draw transitions `queued → active` and new-entry purchases reopen.
- **One Grand Winner per cycle today.** Adding **2nd-place and 3rd-place winners** is on the roadmap (see §16). The `Winner` model can already store multiple winner rows per draw (no unique `drawId + cycle` constraint), but it has **no** `place`/`rank` field — so ordered 2nd/3rd placement needs a **small schema add** (see §16).
- The freeze, draw, and activation times are **per-draw fields** on the `MajorDraw` document (`freezeEntriesAt`, `drawDate`, `activationDate`) — they're data-driven, not hardcoded — but the convention above is what every cycle uses.
- **Purchase blackout window — 8:00 PM (27th) → 12:00 AM (28th), ~4 hours total.** New major-draw entry purchases are blocked across the full window, not just the 30-minute freeze:
  - **30-min freeze (8:00–8:30 PM)** — draw is `frozen`.
  - **3h 30min gap (8:30 PM–12:00 AM)** — previous draw is `completed`, next is still `queued` (no `active` draw exists).
  The frontend gate is [`useMajorDrawPurchaseGate`](src/hooks/useMajorDrawPurchaseGate.ts) — `gatesClosed = currentMajorDraw?.status !== "active"` — which surfaces [`GateClosedModal`](src/components/modals/GateClosedModal.tsx) ("Gates Are Closed") with the next-draw name and activation date. Wired into `MembershipModal`, `useMiniDrawTrigger`, and the `FloatingCountdownBanner` (which switches to a yellow "GATES CLOSED" theme). Server-side, [`enforceMajorDrawOpenForNewPurchasesOr403`](src/utils/draws/major-draw-gate-http.ts) returns **403 `GATES_CLOSED`** on **seven** purchase route handlers: `/api/upsell/purchase`, `/api/stripe/create-payment-intent`, `/api/stripe/create-subscription[-existing-user]`, `/api/stripe/create-one-time-purchase[-existing-user]`, `/api/stripe/upgrade-subscription-payment` (the `[-existing-user]` variants are two separate routes each).
- **Subscription renewals processed in this 4-hour window route into the NEXT cycle's pool, not the current one.** [`getTargetMajorDraw`](src/utils/draws/major-draw-helpers.ts) has explicit branches for both freeze (`currentDraw.status === "frozen"`) and gap ("No active draw (gap period) — use next queued draw"), so any webhook-driven renewal that lands at 8:14 PM or 10:47 PM on the 27th is allocated to the next draw, not the one being run that night.
- All package purchases (subscription renewals, one-time, additional, upsell) contribute entries to the current cycle's `MonthlyEntryCampaign`.
- _Implementation note (no business-rule change):_ the major-draw **display/read** path (`getCurrentMajorDrawForDisplay`, `getUserMajorDrawStats`) is read-optimized — it projects only the fields each caller needs and never the full participant array — which leaves every allocation, freeze, gap, and cadence rule above unchanged.
- **Under consideration:** adding a second major draw per month. Not implemented.

#### How the winner is actually picked — randomdraws.com.au

The platform does **not** pick the winner itself. The flow is:

1. At freeze (8:00 PM AEST/AEDT on the 27th), the locked participant entry list is **exported** from the platform.
2. The export is uploaded to **[randomdraws.com.au](https://randomdraws.com.au)**, a third-party Australian random-draw service. The site is referenced in the marketing UI as a **"Govt-certified draws"** trust badge ([src/components/sections/promo/PromoTrustBar.tsx](src/components/sections/promo/PromoTrustBar.tsx)) — the certification is the integrity proof we lean on publicly.
3. randomdraws.com.au runs the random selection over the exported entries.
4. The result is broadcast on Facebook Live at 8:30 PM, and the verification URL from randomdraws.com.au is stored on the `Winner` record as `drawResultUrl` (see [src/models/Winner.ts](src/models/Winner.ts)) so it can be shown on `/draw-results` and `/winners` for public verification.

This is why the platform owns *eligibility, freeze, and entry counts* but does not own *winner selection* — the certified third party is the source of truth for who won.

### 3b. Mini Draws — per-product, threshold-triggered

- **No fixed schedule.** Each mini draw has its own ID and `entries-required` target.
- When the configured entry threshold is reached, the draw is eligible to be drawn.
- See `src/utils/draws/mini-draw-helpers.ts` (`getTargetMiniDraw`, active/accepting validation).

**Mini-draw pack ladder.** Entries come from purchases of specific mini-draw packs in [src/data/miniDrawPackages.ts](src/data/miniDrawPackages.ts). The ladder was restructured **2026-05-14** to mirror the Additional-pack pattern from §2c:

| Pack                                                | Price | Entries | Audience                            |
| --------------------------------------------------- | ----- | ------- | ----------------------------------- |
| Mini Pack 1                                         | $1    | 1       | Guests                              |
| Mini Pack 2                                         | $5    | 5       | Guests                              |
| Mini Pack 3                                         | $10   | 10      | Guests                              |
| Additional Tradie Pack (Mini Draw)                  | $25   | 25      | Active sub OR current draw entries* |
| Additional Foreman Pack (Mini Draw)                 | $50   | 50      | "                                   |
| Additional Boss Pack (Mini Draw)                    | $125  | 125     | "                                   |
| Additional Power Pack (Mini Draw)                   | $250  | 250     | "                                   |
| Additional VIP Pack (Mini Draw)                     | $500  | 500     | "                                   |

\* Same `hasAdditionalPackageAccess` eligibility as §2c — see [src/utils/membership/has-additional-package-access.ts](src/utils/membership/has-additional-package-access.ts).

The original 8-tier flat ladder ($1 → $500, all guest-accessible) is deactivated in code (`isActive: false`) but the rows remain so historical receipts still resolve. Upsells on mini-draw purchases use a fixed **1× multiplier** (no admin knob — see §6c).

### 3c. Prize fulfillment & customization — what the winner actually receives

The current monthly Major Draw prize is **fully customizable by the winner**. After being announced on Facebook Live (§3a), the winner picks **one** of:

**Option A — Power tool kit + workshop storage + $5,000 cash bonus** (most common). Two independent picks, plus a bundled cash bonus:

1. **Power tool brand** — Milwaukee, DeWalt, Makita, Ryobi, or HiKOKI.
2. **Workshop storage** — one of:
   - Sidchrome SCMT11402 **356-piece** tool kit & lockable roller cabinet.
   - Milwaukee 56" High-Capacity Combination Tool Storage (steel construction, electronic lock).
   - Kincrome CONTOUR® **470-piece** 17-drawer workshop kit (P1823).
3. **$5,000 cash bonus** — bundled into every combo on top of the tools (each combo's display label, via `getPrizeLabel`, ends in "+ $5,000 Cash" in [src/config/prizes.ts](src/config/prizes.ts); 8 of the 15 combos also carry an explicit "$5000 Cash Bonus" highlight — the four Sidchrome-storage variants and the three HiKOKI variants do not).

That's a 5 × 3 grid = **15 power-tool × storage combinations** (each + $5,000 cash), each rendered as its own `PrizeCatalogEntry` with full specs, hero gallery, and highlight copy. (HiKOKI is the 5th toolset, added June 2026 — a 15-piece 36V/18V MultiVolt kit: a 13-piece Mega Combo plus framing + finishing nailers, bundled with its own HiKOKI Multi Cruiser 3-piece storage system. Its composite hero render is currently a placeholder pending final art, and its product gallery photos are not yet matched per-tool.)

**Option B — Cash instead of tools.** A single **$10,000 AUD tax-free cash** prize (`prizeValueLabel: "$10,000 Cash"`) — no equipment, "no tools, no hassle, just $10,000 straight to your bank account." There is **no $5,000 standalone cash tier** and no standard/upgraded distinction; the $5,000 figure only appears as the cash *bonus* bundled into Option A's tool combos.

The cash option lives as the 16th `PrizeCatalogEntry` (`slug: "cash-prize"`).

**Why this is in the doc.** Each promo landing page (§11) pins a specific prize combination as its hero — so the prize catalog isn't only what the winner picks, it's also what the campaign sells. The 5×3 grid + cash means the same monthly draw can be marketed with very different copy (e.g. a Milwaukee-focused landing for Milwaukee fans vs a Sidchrome-storage-focused landing for cabinet-shop tradies) without changing the underlying draw.

**Winner contact & claim — partially in code, mostly operational.** When the winner is selected:

- The [`/api/major-draw/select-winner`](src/app/api/major-draw/select-winner/route.ts) route fires a Klaviyo `MajorDrawWon` event (non-blocking) — the actual notification email is a Klaviyo flow, not a SendGrid template owned by this app.
- The `Winner` model carries a `notified: Boolean` flag (default `false`) but the platform never flips it to `true` automatically.
- **No claim form, no `claimedAt` field, no shipment-tracking integration in code.** Identity verification, prize-customization pick (Option A power-tool/storage combo vs Option B cash), and physical delivery are **operational** — handled outside the codebase.

> _Asset note (2026-06-22, no catalog change):_ the prize product photos in `prizes.ts` were optimized to webp with descriptive, product-accurate filenames. Each of the 15 tool combos also got a new composite "toolset + toolbox" card render (`{toolset}-set/{toolset}-{toolbox}.webp`, e.g. `milwaukee-sidchrome.webp`), wired into its `cardBackgroundImage` + first gallery image; the old `…Set-…Tb.webp` renders were retired and the HiKOKI hero (`hikoki-set/HIKOKI.webp`) was supplied. The combo + hero renders were normalised to uniform framing (so prize cards/carousel display at consistent size), and the HiKOKI per-tool spec photos were matched into `SPEC_ITEM_IMAGE_BY_NAME`. This is a presentational/asset change only — the prize catalog, combos, cash tiers, and copy are unchanged.

### 3d. Anchor-day-24 alignment

Subscriptions renew on **day 24** so renewals settle 3+ days before the 27th draw. This is intentional — see §6b.

### 3e. Entries — the atomic unit

This section nails down the unit economics, because every other system in the doc hands "entries" around without saying what one is.

- **1 `TicketEntry` row = 1 ticket = 1 independent chance in the draw.** A multi-entry purchase creates N rows ([src/models/TicketEntry.ts](src/models/TicketEntry.ts)).
- **Mini-draw entries and Major-draw entries are SEPARATE POOLS.** `TicketEntry` is hard-keyed to `miniDrawId` only — there's no `majorDrawId` field on it. Major Draw entries live separately on `MajorDraw.entries[]`. **Buying a $5 Mini Pack only enters that named Mini Draw — it gives you zero Major Draw entries.** Terms §3c states this explicitly to the customer.
- **Carry-forward rule** — *subscription* entries accumulate monthly and carry forward while the subscription stays active (`User.subscription.lastMonthAccumulatedEntries`). **One-Time pack entries and Mini Pack entries do not carry forward** — they're scoped to the cycle they were bought in (Terms §5.3).
- **No expiry on a `TicketEntry` row.** Entries don't tick down or auto-expire — they're consumed when the draw runs.
- **Cancellation mid-cycle keeps existing entries valid.** If a user cancels before the 27th, the entries they've already earned this cycle stay in the pool — confirmed in code (no `TicketEntry` deletion in [`CancelSubscriptionService`](src/services/subscription/) or [`CancellationFlowService`](src/services/subscription/)) and stated explicitly in Terms §6: *"Entries for current competition period remain valid."*
- **Freeze + gap attribution** — `wasPaymentBeforeFreeze` uses a strict `<` comparison against `freezeEntriesAt`, so an entry granted **at or after 8:00 PM AEST/AEDT on the 27th** goes to the **next** queued draw. The same routing also applies in the **8:30 PM → 12:00 AM gap** via [`getTargetMajorDraw`](src/utils/draws/major-draw-helpers.ts)'s "No active draw (gap period)" branch: with the current draw `completed` and the next still `queued`, any renewal that lands in the gap is allocated to the next draw. End-to-end: **any entry granted between 8:00 PM (27th) and 12:00 AM (28th) belongs to the next cycle, not the one being run that night** (§3a).

---

## 4. Partner Discounts — current state and the scale plan

Source of truth: [src/data/partnerBrandOffers.ts](src/data/partnerBrandOffers.ts), [docs/partner/](docs/partner/), model `PartnerDiscount`.

### 4a. Today (live)

- **7 partner brands** in a curated static array:
  1. ZJWRAPS ($250 off)
  2. Super Bad (90% off trial shoot)
  3. Multi Hub (VIP promos)
  4. All Round Trade Constructions (10% off)
  5. Seal Motors (10% off)
  6. Toolman Lane (10% off)
  7. BAL Building Services (free quote)
- **Percentage-access = catalog visibility.** A tier's percentage maps to the first N entries of the ordered `PARTNER_BRAND_OFFERS` array. Tradie sees ~50% of the list, Foreman ~75%, Boss 100%.
- API surface today is intentionally narrow: partner applications (`/api/partner-applications/**`) and an eligibility queue (`/api/partner-discount/queue`). **No general partner-discount CRUD.**
- **Partner application flow** — businesses pitch to join the catalog via the public partner page; admins review submissions in the admin UI and reply through the same API. The application is the **inbound** side of the partner system (separate from the outbound member-facing discount catalog). Models: [`PartnerApplication`](src/models/PartnerApplication.ts).
- The `PartnerDiscount` Mongo model exists with `discountPercent` and validity dates but is **not yet used** for the live catalog.

### 4b. Tomorrow (coming soon)

- Scale to **1,000+ partner brands** via a proper database catalog + admin CRUD + public API.
- Tier model stays the same — Tradie/Foreman/Boss see 50/75/100% of the catalog respectively, with one-time packs unlocking a time-limited slice (25–100% × `partnerDiscountDays`).
- Sample data in `samplePartnerDiscounts.ts` (DeWalt, Milwaukee, Makita, Kincrome, Sidchrome) is **dev-only**, not the live catalog.

---

## 5. Upsell mechanic

Source of truth: [src/data/upsellPackages.ts](src/data/upsellPackages.ts), [docs/upsell/](docs/upsell/).

After most purchases, the platform offers a single upsell. The pattern across all 22 upsell records:

- **Price**: 50% off the base pack price (60% off for membership upsells).
- **Entries**: a **category-specific multiplier** on the base pack's entries — **one-time 2×** and **Additional 2×** (e.g. one-time Tradie pack 15 entries → upsell grants 30), **membership 10×** (Apprentice base 3 → 30, Tradie 15 → 150, Foreman 30 → 300), and **mini fixed 1×**. The membership/one-time/additional multipliers are admin-configurable (defaults 10/2/2 in `UpsellMultiplierConfig`); mini has no admin knob. See §6c.
- **Partner benefits**: same percentage and days as the base pack.
- **Display rules**: `maxShowsPerUser`, `cooldownHours`, `showAfterDelay` (typically 2–3s after the success state).

Membership upsells (60% off) include an `accessAfterExpiry` window so the bonus entries' partner benefits outlive a lapsed sub briefly.

---

## 6. Promotions & multipliers — how entries get amplified

Separate from the §5 upsell category-multiplier mechanic. This is the system that lets the business run "double entries this weekend" style promotions.

### 6a. Two multiplier systems coexist

- **Promo multipliers** — apply at *purchase time* to the package being bought. Three coexisting models drive these:
  - [`Promo`](src/models/Promo.ts) — admin-toggled, manual on/off.
  - [`ScheduledPromo`](src/models/ScheduledPromo.ts) — date-window auto-activate, site-wide. **Not** user-redeemable; no code typed.
  - [`AlternatingPromoMultiplier`](src/models/AlternatingPromoMultiplier.ts) — a rotating background multiplier that ticks between values.
- **Upsell category multipliers** — apply to the *bonus pack handed out after a trigger purchase*. **Three** categories are admin-configurable via [`UpsellMultiplierResolver`](src/services/upsell/UpsellMultiplierResolver.ts): membership / one-time / additional (`UpsellMultiplierConfig` has no `mini` field). **Mini upsells are not resolver-backed** — they use a hard-fixed 1× applied directly in [`upsell-entries-calculator.ts`](src/utils/payment/upsell-entries-calculator.ts) (no admin knob). See §6c.

### 6b. Resolution order

Promo resolution is **prioritized, not stacked**. [`PromoMultiplierResolverService`](src/services/admin/PromoMultiplierResolverService.ts) returns the first match in order:

> **Scheduled > Toggle Promo > Alternating > none**

One-time purchases with no explicit one-time promo derive a value from the active membership multiplier (10→5, 5→3, 3/2→2). This is intentional — so a "10× membership weekend" pulls one-time packs along at half-strength rather than leaving them flat.

### 6c. Promo × upsell DOES stack

At upsell purchase, the calculation is:

```
upsellEntries = activePromoMultiplier × upsellCategoryMultiplier × baseEntries
```

See [`upsell-entries-calculator.ts`](src/utils/payment/upsell-entries-calculator.ts). The `activePromoMultiplier` is **snapshotted from the original trigger purchase**, so a promo that's ended by the time the upsell is taken still applies.

**Default category multipliers** (the second factor above): membership upsells **10×**, one-time **2×**, additional **2×**, mini fixed **1×** (no admin knob).

### 6d. BonusEntryPromo — additive, not multiplicative

[`BonusEntryPromo`](src/models/BonusEntryPromo.ts) is a separate, **additive** mechanism: a date-windowed fixed bonus of *N entries* per package type, on top of base entries. Independent of the multiplier resolver. Used when you want "buy any Tradie pack this week, get +10 entries" without changing the multiplier rate.

All LIVE.

---

## 7. Codes — referral, promo, monthly campaigns

**No Stripe Coupons. No pricing discounts.** The "Coupon" terminology in the UI (e.g. [`MembershipModal/CouponRow.tsx`](src/components/modals/MembershipModal/CouponRow.tsx)) refers to **typed user-entered codes that grant entries**, not codes that change pricing. Pricing changes happen via §6 multipliers, not via codes.

### 7a. Unified validator

A single endpoint — [`/api/codes/validate`](src/app/api/codes/validate/route.ts) — accepts any code the user types and tries three types in order:

> **referral → promo (PromoLink) → campaign (MonthlyEntryCampaign)**

### 7b. The three code types

- **Referral codes** — derived from the inviter's user record. See [`src/lib/referral.ts`](src/lib/referral.ts). Successful redemption is tracked by `ReferralEvent` and feeds the affiliate / referral lifecycle.
- **`PromoLink`** ([src/models/PromoLink.ts](src/models/PromoLink.ts)) — typed-at-checkout entries code. 6–32 chars `A-Z0-9-`. **One-use-per-user** via `usedBy[]`. Optional `expiresAt`. Gated by `appliesToMembership` / `appliesToOneTime`. `eligibilityAudience` ∈ `all | cancelled-members` — the cancelled-members audience is how comeback campaigns are gated to people who've previously churned.
- **`MonthlyEntryCampaign` codes** — admin-issued bonus-entry codes redeemed via `RedeemableIssuance` (see §8). One-per-user, status flips to `redeemed` on consumption.

### 7c. UX

All redeemable codes are **typed at checkout**. There are no "URL slug auto-apply" coupon codes. URL UTMs feed `PromoAnalyticsVisit` for attribution but **don't change pricing or entries**.

All LIVE.

---

## 8. Rewards, points & redeemables — currently paused

**System-wide paused.** The `rewardsEnabled` feature flag defaults off (see [`src/config/featureFlags.ts`](src/config/featureFlags.ts); the pause copy lives in [`src/config/rewardsSettings.ts`](src/config/rewardsSettings.ts)). `/rewards` renders **"Rewards Are Temporarily Paused"**, and all `/api/rewards/*` handlers return **503**. The server **still accrues** `user.rewardsPoints` behind the scenes, ready to be restored when the system reopens. See [`docs/rewards-pause.md`](docs/rewards-pause.md).

Two parallel concepts coexist under this umbrella:

### 8a. Legacy points balance (paused redemption)

- `User.rewardsPoints` — a numeric balance accrued on the user document.
- Redeemed via [`RewardsRedemption`](src/app/(site)/rewards/components/RewardsRedemption.tsx) for **discount / entry / shipping / package** rewards.
- Currently gated by the pause flag — **accrual continues**, redemption does not.

### 8b. Event-based issuance ledger (modern path)

- **`RedeemableIssuance`** — the unit of bonus entries granted to a user. Payload is **entries only** (`entriesAmount`) — not prizes, partner discounts, or shipping. Scoped by `monthKey`, expires via `expiresAt`. Unique on `(campaignId, userId)`. See [src/models/RedeemableIssuance.ts](src/models/RedeemableIssuance.ts).
- **`MilestoneReward` + `MilestoneIssuance`** — tier-based grants. `milestoneType` ∈ `spend-amount | entries-gained | loyalty-days`, each with a `threshold` and an `entriesAmount`. Per-user-per-cycle (unique on `milestoneRewardId × userId × achievementCycle`), supports `isRecurring` for repeatable tiers.
- **Wallet is event-based, not balance-based.** `RedeemablesWalletService` reads `status: "active"` issuances at query time — no aggregate counter on the User.
- **Refunds reverse only un-redeemed grants.** A redeemed issuance survives the refund and surfaces in `RefundProcessed.data.reversalIssues[]` for admin attention. See [`docs/rewards-redeemables/rules.md`](docs/rewards-redeemables/rules.md).
- LIVE for issuance (admin can run campaigns); user-facing redemption gated behind the same pause flag as §8a.

---

## 9. Payments — how money actually moves

Source of truth: [docs/payment/](docs/payment/), [docs/billing-stripe/](docs/billing-stripe/), `docs/BILLING_ANCHOR_24.md`, `docs/PAST_DUE_REANCHOR.md`, `docs/REFUND_REVERSAL.md`, `docs/STRIPE_COLLECTION_PAUSE_RECOVERY.md`, `docs/CHARGE_PAST_DUE_CUSTOMERS.md`, `docs/SUBSCRIPTION_PAYMENT_ELEMENT_MIGRATION.md`.

### 9a. One-time payments

- Uses Stripe **Payment Intents** via `src/utils/payment/payment-processing.ts`.
- On success, benefits (entries, partner access, etc.) are recorded as a `BenefitsGranted` `PaymentEvent` — a **ledger pattern** that lets us replay or reverse.
- 3DS / SCA is handled by `use3DSRedirectHandler`.

### 9b. Subscriptions — anchor day 24

The non-obvious rule that ties everything together:

- Subscriptions are anchored to **day 24** of the month.
- Users joining on the **25th / 26th / 27th AEST** get `trial_end = next 24th`, `proration_behavior: "none"`, and `add_invoice_items` so they pay the full price immediately but their next renewal is on the 24th. The subscription is `trialing` until the 24th.
- This means **renewals settle on the 24th**, giving 3+ days to resolve failed payments before the major draw on the **27th**.
- **Past-due recovery reanchors to the catch-up date.** When a past-due/unpaid subscription recovers (any channel), future renewals are moved to the recovery-payment date (AEST), clamping 25/26/27 → 24. This stops the recovered member from being billed again ~2 weeks later on a stale original anchor. The anchor is therefore **not permanently static** — it reflects the most recent successful payment date (clamped to the draw buffer).
- Source of truth: `docs/BILLING_ANCHOR_24.md` (join-anchor rule), `docs/PAST_DUE_REANCHOR.md` (past-due reanchor).
- **$0 trial-invoice double-grant guard.** Any mutation that sets `trial_end` on an *existing* subscription (the 25/26/27→24 join-anchoring above, anchor-billing migrations, or past-due reanchor) makes Stripe auto-spawn a separate **$0 invoice** with `billing_reason: subscription_update` and mark it paid — firing a second `invoice.payment_succeeded`. The webhook detects it via [`isZeroAmountTrialUpdateInvoice`](src/utils/billing/trial-invoice.ts) (`subscription_update` + `total === 0` + `amount_paid === 0`) and **skips it entirely** ([stripe-webhook-handlers](src/services/stripe-webhook-handlers/index.ts)), so it does **not** grant a second set of renewal entries or log a spurious "Subscribed to X" admin-activity row. The match is deliberately narrow — a 100%-off renewal is `subscription_cycle` and a real upgrade proration has `total > 0`, so both still grant. Idempotency-by-id does **not** protect you here (the spawned invoice has its own id). Shipped 2026-06-02; regression-tested via `npm run test:zero-trial-guard`.

### 9c. Refund handling — ledger reversal

- **Full refunds** replay the ledger backward via `reverseLedgerBenefits` and emit a `RefundProcessed` event.
- **Partial refunds** skip benefit reversal (`RefundPartial` with `partial-skipped` status) — we cannot safely undo "half an entry".
- Idempotency key format: `RefundProcessed-<paymentIntentId>`.

### 9d. Collection-pause recovery

- When a renewal fails (`subscription_cycle`), `pauseAfterRenewalFailure` sets `pause_collection: keep_as_draft` to **stop Stripe from stacking draft invoices**.
- On a successful payment, `resumeAfterSuccessfulRenewalPayment` clears the pause **before** granting benefits — this is deliberate, so the resume survives a webhook timeout.
- After clearing the pause and granting benefits, the webhook also **reanchors future renewals** to the recovery-payment date (clamped 25/26/27 → 24) — see §9b and `docs/PAST_DUE_REANCHOR.md`.

### 9e. Past-due admin charge tool

- Endpoint: `POST /api/admin/invoices/charge-past-due`.
- Strict guardrails: typing `"CHARGE"` to confirm, a **global 30-minute mutex lock** (`ChargeJobLock` — only one charge run executes at a time across all admins, not a daily throttle), a **30-second per-invoice debounce**, and a **6-hour per-user recent-attempt / idempotency window** (`RECENT_ATTEMPT_WINDOW_HOURS = 6`; tightened from 24h on 2026-05-06 to allow same-day human-driven retries). The separate Force-Charge path adds a budget of 3 attempts per 6 hours. (There is **no** per-admin 5-minute rate limit and **no** global 24-hour limit — those were never implemented.)
- Only charges DB-confirmed `past_due` users who have a finalized open invoice and a default payment method.

### 9f. Stripe webhook queue

- Webhooks are **queued, not processed inline** — see `src/services/stripe-webhook-queue/` and the cron at `/api/cron/process-stripe-webhook-queue`.
- Has admin visibility (`StripeWebhookQueueManagement`), backoff, claim/lock, and orphan recovery.

### 9g. GST / Australian tax

- **All prices are AUD.** Stripe Tax / `automatic_tax` / `tax_behavior` is **not enabled** anywhere in the codebase.
- **Subscription and pack prices are treated as GST-inclusive by silence** — the customer-facing invoice template ([src/components/invoice/InvoiceComponent.tsx](src/components/invoice/InvoiceComponent.tsx)) shows a `Tax (GST):` line **hardcoded to $0.00** (no tax is ever computed), there is no `gstInclusive` flag on package data, and no tax code in `src/utils/billing/`.
- **The shop cart is the one exception**: [src/app/api/cart/summary/route.ts](src/app/api/cart/summary/route.ts) adds **10% GST** explicitly on subtotal (`const tax = subtotal * 0.1`). This only fires on the (currently coming-soon) product cart, not on memberships, packs, upsells, or mini-draw packs.
- Practical consequence: when the shop launches, product line totals will show an explicit GST component while everything else stays "all-in" pricing.

### 9h. Refund policy — customer-facing rules

§9c documents the *technical* refund flow (ledger reversal). This is the *policy* the customer agrees to in [Terms §4 and §6](src/app/(site)/terms/page.tsx):

- **Membership fees are non-refundable once purchased** (Terms §4 line 170).
- **No refunds for the unused portion** of a subscription period (Terms §6 line 359) — a mid-cycle cancellation keeps the user's benefits and entries through the cycle (see §3e), it does not pro-rate the fee back.
- **Termination by Tools Australia** — no refunds except as required by law (Terms §6 line 369).
- **Australian Consumer Law carve-out** — Terms §11 (lines 463–466) explicitly preserves any rights under the *Competition and Consumer Act 2010 (Cth)* and ACL that **cannot be lawfully excluded**. Discretionary refunds beyond the policy are handled case-by-case by support.
- **No cooling-off period is stated in code.** AU law doesn't require one for online subscriptions of this type, but support may grant goodwill refunds — those run through §9c's ledger-reversal path.

---

## 10. Subscription lifecycle — the state machine everything reacts to

Subscriptions are the load-bearing primitive of the business. Most other systems (entries, partner access, retention modals, Klaviyo flows) branch off the subscription's state, so any AI reading this doc needs the full state list.

### 10a. The states

`User.subscription.status` is a free-form `String` (defaults to `"incomplete"`) — Stripe values flow through directly. The **canonical enum** is in [src/models/MembershipStatusHistory.ts](src/models/MembershipStatusHistory.ts):

| State                | Source     | Meaning                                                                                              |
| -------------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| `incomplete`         | Stripe     | Initial state; payment not yet collected.                                                            |
| `incomplete_expired` | Stripe     | Initial payment never collected; subscription dead.                                                  |
| `trialing`           | Stripe     | Used by late-month joiners (25th / 26th / 27th) — see §9b anchor-day-24.                             |
| `active`             | Stripe     | Paid and current.                                                                                    |
| `past_due`           | Stripe     | Renewal failed; we still collect via §9d pause-and-recover.                                          |
| `unpaid`             | Stripe     | Stripe gave up after retries.                                                                        |
| `scheduled_cancel`   | **App**    | User has requested cancellation; benefits live until cycle end.                                      |
| `canceled`           | Stripe     | Subscription ended.                                                                                  |
| `none`               | **App**    | Never had a subscription, or fully cleared.                                                          |

`MembershipStatusHistory` records every transition with `actor ∈ {user, admin, stripe, system}` and carries `pastDueAt`, `cancelledAt`, `endDate`, `autoRenew`.

**The `autoRenew` toggle is a soft-cancel shortcut.** Turning it off via `PATCH /api/stripe/update-auto-renew` calls `stripe.subscriptions.update(id, { cancel_at_period_end: true })` — the same effect as completing the §13c cancellation flow: the user keeps benefits and entries through the current cycle, and can re-enable it any time to undo (which also clears `cancelledAt` / `endDate`). It's the path for "I want to cancel but don't want the retention modal right now."

### 10b. The two app-specific "ghost" states

Two on-User flags act as state without being in the enum:

- **`previousSubscription` (downgrade benefit-preservation period)** — when a user downgrades, the old package's `entriesPerMonth` and `discountPercentage` are cached on `User.subscription.previousSubscription` until `endDate`. The user keeps the higher tier's benefits until the current cycle ends. See [src/models/User.ts:47](src/models/User.ts).
- **`pendingChange` (upgrade-awaiting-payment)** — when a user initiates an upgrade but payment is still in-flight, the desired new package is parked on `User.subscription.pendingChange` until the charge confirms.

These are not in the status enum but materially affect what entries / partner access the user has *right now*, so any UI showing "what tier am I" has to read them.

### 10c. Upgrades — immediate charge, cycle resets

- `proration_behavior: "none"`, `billing_cycle_anchor: "now"`, `payment_behavior: "error_if_incomplete"`. See [src/app/api/stripe/upgrade-subscription-payment/route.ts](src/app/api/stripe/upgrade-subscription-payment/route.ts).
- User pays the **full new-tier price immediately**; renewal date resets to today.
- **Entries are granted immediately on upgrade** — the grant runs **server-side in the Stripe webhook** after the upgrade invoice is paid (the route records `user.subscription.pendingChange` and defers benefit-granting to the webhook). The `upgradeEntriesGrant` figure shown in [UpgradeConfirmModal](src/components/modals/UpgradeConfirmModal/index.tsx) is only the **display amount** (computed client-side via `calculateUpgradeEntries`), not the grant mechanism.

### 10d. Downgrades — no charge now, takes effect at cycle end

- `proration_behavior: "none"`, no immediate charge. User pays current (higher) price until cycle end.
- **Old benefits stay live** via the §10b `previousSubscription` cache until `endDate`.
- `DowngradeConfirmModal` shows `effectiveDateLabel` (e.g. "Fri 26 Dec") so the user sees exactly when the new tier kicks in.

### 10e. Renewal-failed customer UX

When a renewal fails (Stripe emits `invoice.payment_failed`), `subscription.pastDueAt` is set and the customer sees a past-due hero card + [`RenewalFailedModal`](src/components/modals/RenewalFailedModal/index.tsx). The recovery ladder, in order:

1. **In-app retry on the existing default card** — `payFailedInvoiceMutation`. This is the primary CTA — most failures are transient.
2. **3DS / SCA fallback** — Stripe Payment Element renders inside the modal when the bank requires customer confirmation.
3. **Update card** — `InlineCardSetup` (SetupIntent) renders only when Stripe returns `requiresDifferentPaymentMethod` or there's no default PM. **Not the default path** — we keep the existing card unless Stripe says otherwise.
4. **"Pay overdue amount" force-charge** — last resort, when the invoice is no longer payable through the normal flow. Calls `/api/stripe/force-charge-overdue`.

On success, the modal refetches at 3 s, then refetches again and closes together at 8 s — waiting for the §9f webhook queue worker to settle the state — and shows: *"Your subscription has been reactivated and benefits are live again."*

This is the **customer-facing** counterpart to §9e's admin past-due tool — the user can self-serve most failed renewals without admin involvement.

> **Note** — this past-due *renewal recovery* (force-charge the existing overdue invoice) is a different code path from the §10i *reactivation* of a `canceled` subscription, even though both surface "reactivated" copy.

### 10f. Email verification — what it actually gates

[src/app/api/auth/send-login-code/route.ts](src/app/api/auth/send-login-code/route.ts) is the **only hard gate**: passwordless email-code sign-in rejects unverified users with "Please verify your email first…".

Everywhere else, email verification is **either a nag** (badge in header / Settings / `UserSetupModal`) or **an audience filter** (campaign and redeemable targeting defaults to `requiresEmailVerified: true` in [`CampaignService`](src/services/redeemables/CampaignService.ts) and [`TargetingService`](src/services/redeemables/TargetingService.ts) — unverified users are silently excluded from campaign sends rather than blocked from purchases).

**Not gated** by verification: cancellation, withdrawing entries, purchases, subscription management. Side effect: changing the email resets the flag; Google OAuth auto-verifies.

### 10g. Welcome / first-purchase activation

After a user's first successful purchase (subscription, one-time pack, or upsell), they're taken through a short activation sequence:

- **[`UserSetupModal`](src/components/modals/UserSetupModal/)** — captures **profession** (from the AU tradies list in [src/data/professions.ts](src/data/professions.ts)), **state** (from [src/data/australianStates.ts](src/data/australianStates.ts)), and an email-verification prompt. This is what populates the segmentation data that §11 promo targeting and §14 ad attribution lean on.
- **[`PromoWelcomeModal`](src/components/modals/PromoWelcomeModal.tsx)** (via `usePromoWelcomeModal`) — fires when the user came in through a §11 promo landing page. Confirms the bonus entries they just earned and points them at the relevant prize from the §3c catalog so the campaign promise visibly closes.

Once cleared, the user's `userData.subscription.isActive` (or current-draw entries, via `hasAdditionalPackageAccess` §2c) becomes the gate for everything else — partner discounts, Additional packs, retention modals.

### 10h. Member dashboard — the ROI surface

After activation, the logged-in user lives at `/my-account/`. This is where membership *value* is demonstrated — and the design choices here matter for retention.

**Bottom navigation** (5 tabs, see [`BottomNav`](src/app/(site)/my-account/components/BottomNav.tsx)):

- **Home** (`/`) — links to the **public site root**, not the dashboard.
- **Profile** (`/my-account`) — the **landing dashboard** described below (this is the dashboard tab, despite the "Profile" label).
- **Draws** (`/my-account/draws`) — current & past draws view.
- **Membership** (`/my-account/membership`) — current package, upgrade/downgrade entry points (§10c/§10d).
- **Support** (`/my-account/support`) — contact / help.

The Profile / Password / Payment-methods / Subscription tabs live separately at `/my-account/settings` (reached via a `?tab=` query param, **not** a BottomNav tab), and `/my-account/benefits` covers the partner-discount catalog.

**Home dashboard, top to bottom** ([src/app/(site)/my-account/page.tsx](src/app/(site)/my-account/page.tsx)):

1. **`DashboardHeader`** — renders the past-due alert when `hasFailedRenewal(user)` is true (entry point to §10e `RenewalFailedModal`).
2. **`CoverBanner`** + **`UserInfoBar`** — identity + tier badge.
3. **`QuickActions`** — "Refer a Friend" (§13b) and "Get More Entries" CTAs.
4. **`MajorDrawOverview` — the primary ROI card.** Shows the current Major Draw, status, countdown to draw date, `displayTotalEntries` broken into `membershipEntries` + `oneTimeEntries`, a **3-month entry-accumulation projection**, and a `PastDrawsModal` trigger. See [src/app/(site)/my-account/components/MajorDrawOverview.tsx](src/app/(site)/my-account/components/MajorDrawOverview.tsx) and `useDashboardEntryDisplay`.
5. **`PartnerDiscountQueue`** + **`PartnerDiscountsSection`** — the §4 catalog filtered by the user's tier visibility %. Locked rows show as "Unlock at higher tier".
6. **`SocialLinksSection`** — Facebook / Instagram entry points (also where the §3a Facebook Live draw stream lives).
7. **`RewardsFloatingWidget`** — entry point to §8 (currently behind the rewards pause flag).

The ROI story this dashboard tells: *"You've earned N entries this cycle, here's your projected accumulation, the draw is M days away — and here are the partner discounts you can use right now."* Every visit reinforces the value of the subscription.

### 10i. Reactivation & resubscribe — winning back lapsed members

`POST /api/stripe/renew-subscription` ([route](src/app/api/stripe/renew-subscription/route.ts)) is the single entry point for a non-active member coming back. It picks one of three `renewalStrategy` branches off the current Stripe status:

1. **`retry_payment`** — for `past_due` / `unpaid` / `incomplete` subscriptions. Overlaps the §10e `RenewalFailedModal` recovery flow.
2. **`reactivate`** — for a `canceled` / `cancel_at_period_end` subscription **still within a 30-day grace window past `cancel_at`**. This only clears `cancel_at_period_end` (no charge, no proration, no new entry grant). It is **same-tier only**: requesting a different `packageId` is rejected with **HTTP 400 `REACTIVATE_TIER_CHANGE_NOT_ALLOWED`** ("Reactivate your current plan first, then upgrade or downgrade"). Tier changes deliberately route through the normal §10c/§10d flows *after* reactivating — bolting a tier swap onto reactivate would trigger an auto-proration charge and an incorrect entry grant off the resulting `subscription_update` invoice (see the §9b $0-trial guard for why that matters).
3. **`create_new`** — the "Welcome back!" resubscribe path for a **fully-expired** member. Builds a brand-new anchored subscription (§9b) and grants entries via the webhook on the paid first invoice.

**Resubscribe tier picker + entry-history carry-over.** When a subscription is `canceled` (or otherwise non-active/non-past-due), the Subscription Management modal replaces the legacy single "Reactivate" CTA with a **tier picker over all packages** (`ResubscribeTierPicker` via `InactiveSubscriptionState` → `ResubscribeEmptyState`) — the member is free to come back on **any** tier, with their previous package highlighted. Entry history survives the cancellation: `User.subscription.lastMonthAccumulatedEntries` persists through the cancel (and the picker surfaces it — "You have N accumulated entries", footer "your entries history is preserved"). On reactivation `lastResubscribedAt` is stamped, which drives a carry-over banner on the success page. This is distinct from the §10 `autoRenew` soft-cancel undo (which re-enables an *unexpired* subscription mid-cycle) — §10i is the win-back surface for a member who **fully churned**, and it's the on-platform half of the §13d comeback funnel.

---

## 11. Promo landing pages & paid-traffic surface

Tools Australia's paid traffic doesn't land on the homepage — it lands on **promo-specific landing pages** with their own hero, banner copy, FAQs, and trust signals. This is a substantial customer surface that pivots independently of the rest of the product.

### 11a. The landing-page ingredients

- **Hero image manifest** ([scripts/build-landing-image-manifest.ts](scripts/build-landing-image-manifest.ts) → [src/generated/landingImageManifest.ts](src/generated/landingImageManifest.ts)) — pre-built at `predev`/`prebuild` so the landing route knows exactly which hero asset to serve per promo slug without runtime FS scans.
- **`PromoBannerText`** ([src/models/PromoBannerText.ts](src/models/PromoBannerText.ts)) — rotating banner copy controlled from the admin UI.
- **`PromoFAQs`** and `PromoTrustBar` ([src/components/sections/promo/](src/components/sections/promo/)) — conversion-side components that surface objections-handling copy and trust signals.
- **`PromoAnalyticsVisit`** + `usePromoPageTracking` — visit-level analytics tied to the landing slug, separate from the main funnel events.
- **Landing-hero A/B variants** — the hero image set is A/B-tested via the first-party A/B framework (§15). The manifest ships `variation1` / `variation2` desktop **and** mobile hero sets (per brand × toolbox, plus the evergreen all-prizes hero), and [`PromoHero`](src/components/sections/promo/PromoHero.tsx) applies a per-slug `variantConfig.hero.imageSrcBySlug` override (each viewport independently optional) so one experiment can run across many toolset/evergreen landing slugs. The "variation 1 vs variation 2" experiment is seeded over 16 slugs (+ cash-prize) via [scripts/seed-variation1-vs-variation2-experiment.ts](scripts/seed-variation1-vs-variation2-experiment.ts) as a draft an admin activates.

### 11b. How a landing page connects to the rest of the business

- The `AlternatingPromoMultiplier` rotation (§6a) drives the **headline number** on the landing page hero ("3× entries today").
- `ScheduledPromo` windows can flip a landing page's headline copy and multiplier automatically for the date range — no admin click required.
- `PromoLink` codes (§7b) are often the **CTA** on a landing page: the page sells the offer, the typed code at checkout proves the user came through the campaign and applies bonus entries.
- UTMs persist via `useUTMPersistence` + `lib/utm/` and feed both Meta CAPI advanced matching and Klaviyo attribution.

### 11c. Trust signals on the landing page

The conversion-side trust stack ([src/components/sections/promo/PromoTrustBar.tsx](src/components/sections/promo/PromoTrustBar.tsx)) renders three items:

- **"Winners drawn live"** — "· on Facebook" (the §3a Facebook Live draw).
- **"Govt-certified draws"** — a cert link out to the [randomdraws.com.au](https://randomdraws.com.au) winner-selection partner (§3a). This is the integrity proof we lean on publicly.
- **"Drawn every 27th"** — the fixed monthly cadence.

All LIVE.

---

## 12. Fraud & risk controls

A real ops concern with admin tooling around it. Authoritative spec: [docs/billing-stripe/architecture.md](docs/billing-stripe/architecture.md).

### 12a. The block → allowlist loop

- **What triggers a block.** Stripe Radar / issuer-directed blocks on charge attempts. The Stripe webhook captures these from both `payment_intent.payment_failed` and `charge.failed` events (when `outcome.type === "blocked"`) and **upserts a `BlockedTransaction` row** via `upsertBlockedTransaction()`.
- **The allowlist.** `AllowlistService.apply()` adds the card fingerprint to Stripe's `card_fingerprint_allowlist` **Radar value list** (it internally runs `evaluate()` first, then on an eligible verdict creates the Radar value-list item; Stripe is the source of truth, the Mongo `AllowlistAction` row is an audit log). Subsequent charges to the same card aren't auto-blocked.
- **Three callers** of the allowlist: the webhook (auto), the admin bulk page (`/api/admin/allowlist/apply`, source `admin_bulk`), and per-row Allowlist / Reverse buttons in `/admin/blocked-transactions`.

### 12b. Auto-allowlist guardrails

The webhook **never auto-allowlists** when the decline code suggests real fraud or permanent customer-action issues:

- **Real fraud:** `lost_card`, `stolen_card`, `pickup_card`, `fraudulent`.
- **Permanent / customer-action:** `expired_card`, `incorrect_cvc`, `invalid_account`, `invalid_number`, `invalid_expiry_*`.
- **No-history filter:** no auto-allowlist if no `User` resolved from the Stripe customer, or if the user has zero successful `PaymentEvent` rows.

These rows are flagged for human review in the admin UI instead.

### 12c. Drift safety net

A daily reconciliation cron (`15 3 * * *`, [src/app/api/cron/reconcile-blocked-transactions/route.ts](src/app/api/cron/reconcile-blocked-transactions/route.ts)) scans the last 48h of Stripe-blocked charges and self-heals any missing Mongo rows. It alerts via `console.error` if drift > 5% — so the system catches webhook gaps without manual review.

### 12d. Optimistic-update guard (despite the filename, NOT a fraud control)

[src/lib/purchaseCooldown.ts](src/lib/purchaseCooldown.ts) is misleadingly named — it exports a single **client-side** TanStack Query helper, `freezeRefetchIntervals(qc, userId, ms)`, not a rate limit. During a purchase flow (called from [useMembershipQueries](src/hooks/queries/useMembershipQueries.ts) and [useUpsellQueries](src/hooks/queries/useUpsellQueries.ts)) it briefly sets `refetchInterval: false` on the hot dashboard queries (`majorDraw.current`, `majorDraw.userStats`, `users.account`) so an in-flight background poll can't clobber the optimistic entry-count update, then restores the prior defaults via `setTimeout`. It does **not** run at the API layer, does **not** block rapid-fire purchases or double-charges, and never touches Stripe Radar.

**There is no application-layer purchase rate-limiter** — `src/lib/rate-limiting/` contains only `error-reports.ts`. Double-charge protection comes from Stripe-side idempotency and per-flow guards (e.g. the upsell post-success-window guard), not from this helper.

---

## 13. Affiliate, Referrals, Cancellation

### 13a. Affiliate program

- Models: `Affiliate`, `AffiliateCommission`, `AffiliatePayout`. Portal at `/affiliate/`.
- **Commission rates are admin-toggled, not a fixed published rate.** Admins set the percentage per affiliate (or globally) in the admin UI; `AffiliateCommission` rows are issued at the configured rate on each qualifying purchase. This lets the business run different deals for different partners (e.g. a higher rate for high-volume creators) without code changes.
- Commissions are tied to memberships and **recur with each subscription renewal** — there are dedicated backfill scripts (`backfill:affiliate-recurring-commissions`) to catch up any recurring rows missed by the live webhook flow.
- See [docs/affiliate/](docs/affiliate/).

### 13b. Referrals

- Refer-a-friend flow with `ReferralEvent` model, `lib/referral.ts`, and `ReferFriendModal`.
- **Reward structure**: when the referred user **makes their first purchase**, **both parties receive 100 entries into the current Major Draw** — 100 to the inviter *and* 100 to the referred user (`REFERRAL_REWARD_ENTRIES = 100`, awarded as both `referrerEntriesAwarded` and `referreeEntriesAwarded`; both lots are added directly to the active major draw, not to an accumulated-entries balance). The reward is not triggered by signup alone — the qualifying event is the referred user's actual purchase, so the inviter only profits when the platform does.
- See [docs/referrals/](docs/referrals/).

### 13c. Cancellation / retention flow

- `CancellationFlowModal` orchestrates a retention sequence: **pause offer** (`RetentionPauseService`) and **discount offer** (`RetentionDiscountService`) before final cancellation.
- All steps emit `CancellationFlowEvent` for analytics.
- A maturity cron (`cancellation-retention-maturity`) flips paused subscriptions back to active when the pause window ends; a resume cron resumes early-returners.

**Both the §9d recovery pause and the §13c retention pause are real Stripe `pause_collection`s — the difference is the `behavior` and a `metadata.pauseReason` tag, not "app vs Stripe."** This is the most-confused mechanic in the system, so to be clear: `applyRetentionPause` ([`RetentionPauseService`](src/services/subscription/RetentionPauseService.ts)) calls `stripe.subscriptions.update` with `pause_collection: { behavior: "void", resumes_at: now + 30d }` and `metadata.pauseReason: "retention"`. The app-side `User.retentionOffersConsumed.pause30d` is only a **one-time "offer consumed" marker** (it gates whether the pause offer can be shown again and serves as the resume cron's candidate filter) — it is **not** where the pause state lives and it does **not** gate entries accrual or partner access.

|                          | §9d Stripe recovery pause                        | §13c Stripe retention pause                       |
| ------------------------ | ------------------------------------------------ | -------------------------------------------------- |
| **What it is**           | Stripe `pause_collection` (`behavior: keep_as_draft`) | Stripe `pause_collection` (`behavior: void`, `resumes_at: now+30d`) |
| **Why it exists**        | Recovery from *renewal failure* (involuntary)    | Churn prevention via *opt-in* offer (voluntary)   |
| **Stored where**         | Stripe `Subscription.pause_collection`           | Stripe `Subscription.pause_collection` + `metadata.pauseReason: "retention"` (the `keep_as_draft`/`void` behavior is the discriminator) |
| **Stripe status during** | unchanged                                        | unchanged                                          |
| **Entries during pause** | continue (it's recovery, not opt-out)            | suspended — `behavior: void` makes Stripe discard renewal invoices, so no paid invoice → no renewal webhook → no entries |
| **Resumed by**           | successful payment                               | maturity cron at 30 days, OR user-triggered early return |

The two can co-exist on the same user. The `metadata.pauseReason: "retention"` tag is what protects a retention pause from being cleared by the §9d recovery-clear path (`decideClearPause` in `pauseCollectionPolicy.ts` skips when `pauseReason === "retention"`). The `pause30d` flag is purely the "already used this offer" marker, not a Stripe state and not an entries/partner gate.

### 13d. Cancelled-member comeback funnel

Tools Australia treats churned subscribers as a re-acquirable cohort with a dedicated multi-system loop. This is the *why* behind several otherwise-disconnected mechanics in the doc:

1. **Cancellation completes** (§13c) — status flips to `canceled`, `CancellationFlowEvent` row recorded with the cancellation reason.
2. **Klaviyo segment sync** (§14c) — the user moves into a "cancelled-members" Klaviyo segment, triggering an automated comeback email sequence.
3. **Landing-page entry point** (§11) — the Klaviyo email routes to a promo landing page with comeback-specific copy and a code in the CTA.
4. **Cancelled-audience `PromoLink`** (§7b) — the code is gated by `eligibilityAudience: "cancelled-members"`, so only previously-churned users can redeem it. Other audiences typing the same code see a rejection.
5. **Re-subscribe with bonus entries** — the user signs up via the code, picks up the PromoLink's bonus entries, and re-enters the §10 state machine as `active`.

This is the reason `PromoLink` carries an `eligibilityAudience` field, why cancellation-flow events feed Klaviyo, and why the landing-page system exists as a separate surface — they're all wired together specifically to make comeback work.

---

## 14. Tracking & ads — current state

Source of truth: [docs/tracking/](docs/tracking/).

### 14a. Live

- **Meta / Facebook**: Pixel (client) + CAPI (server-side, `src/lib/facebook.ts`, test `npm run test:facebook-capi`). Identity enrichment (2026-05-25) threads hashed user data (email/name/phone, fbc/fbp) through the CAPI mirror for AddPaymentInfo / InitiateCheckout / CompleteRegistration to lift Event Match Quality.
- **TikTok**: Pixel (client) **+ Events API CAPI (server-side, `src/lib/tiktok.ts`, v1.3 `event/track`, gated by `TIKTOK_ACCESS_TOKEN`, shared `event_id` dedup with the pixel — shipped 2026-05-22)**.
- **Snapchat**: client-side Pixel only (with `client_dedup_id` dedup); its CAPI sender is still a stub.
- **Unified conversions layer** — a single `CanonicalEvent` is dispatched to every platform's browser pixel **and** server-side CAPI through one registry ([`src/lib/tracking/`](src/lib/tracking/)): Meta and TikTok have server-side CAPI parity (Snapchat pixel-only), with shared advanced-matching enrichment and `event_id` browser↔CAPI dedup. Funnel events POST to `/api/tracking/conversion` → `sendConversion()`; per-provider CAPI is independently env-gated. Legacy per-vendor scripts (below) remain.
- **Google Tag Manager**: `src/lib/gtm.ts`.
- **Klaviyo**: page tracker, script loader, transactional handoffs (`src/lib/klaviyo.ts`).
- **UTM persistence**: `src/lib/utm/`.

### 14b. Ad-platform analytics — server-side revenue live, ad-spend sync partial

- **TikTok / Snapchat tabs show server-side attributed revenue.** `TikTokAdsManagement.tsx` / `SnapchatAdsManagement.tsx` render an hour-of-day **revenue + conversions** breakdown from `convertingPlatform`-tagged `PaymentEvent`s (`/api/admin/analytics/hourly-revenue`). The client-side pixels fire independently, and **TikTok also fires server-side conversions** via the Events API (§14a).
- **Ad-spend sync — Meta + TikTok wired, Snapchat pending.** Meta drives true ROAS on the daily snapshot. **TikTok's Marketing-API hourly ad-spend** is also wired (`fetchTikTokHourlySpend` → the hourly Spend/Profit/ROAS columns), rendering as soon as `TIKTOK_ADVERTISER_ID` + `TIKTOK_MARKETING_ACCESS_TOKEN` are set (code is unverified against the live API and falls back to "—" without creds). **Snapchat has no Marketing-API spend client yet** — Snapchat spend/ROAS show "—" until then. The daily-insights *writer* (populating `TikTokAdInsightsDaily` / `SnapchatAdInsightsDaily`) is still Meta-only.
- **Facebook Ads Health — adset decision engine.** A per-adset rules engine ([`src/services/facebook-ads-health/`](src/services/facebook-ads-health/), admin "Facebook Ads" tab → `FacebookAdsHealthView`) that turns Meta reporting into a daily verdict — **SCALE / HOLD / INVESTIGATE / CUT** — for each adset, applying Meta's documented learning-phase thresholds (≥50 conversions/7d, learning-status buckets, Learning-Limited ≥3 days) against tunable settings (breakeven ROAS, target CPA, ROAS-drop trigger %, post-edit wait hours, zero-conversion spend multiplier). Emits the verdict + reason rows + a concrete action ("raise budget 20%", "pause and reallocate $X", "revert recent edit — do NOT pause"). Backed by routes `/api/admin/facebook-ads/health/{insights,settings,snooze}`, ~9 admin components, an account-level true-ROAS service, per-adset snooze, and 3 regression suites (`test:facebook-ads-health-verdict / -two-window / -missing-data`). The verdict-engine **insights and threshold settings are also mirrored read-only to Norm** (`facebook-ads.health.insights` / `facebook-ads.health.settings` in [`classification.ts`](src/lib/internal-norm/classification.ts)), with settings-update and snooze exposed as `write_safe` Norm tiers. (Not to be confused with the unrelated `/v1/health` gateway-liveness route.)
- **Klaviyo analytics tab** — campaign/flow revenue (Klaviyo-attributed, email/SMS split) + scheduled sends + server-side Klaviyo hourly, via the read-only Klaviyo Reporting API.
- **All Platforms tab** + **true-ROAS overview card** — combined ad-effectiveness rollup (true ROAS = server-side attributed revenue ÷ ad spend, contribution, conversions, hourly) across every channel, with a **Direct (unattributed)** row excluded from blended ROAS; the overview card shows server-side ROAS instead of Meta's pixel figure.

Models for daily insights (`MetaAdInsightsDaily`, `TikTokAdInsightsDaily`, `SnapchatAdInsightsDaily`) all exist, but the daily-insights writer is Meta-only; TikTok ad-spend arrives via the live hourly Marketing-API client rather than a daily-snapshot writer.

### 14c. Klaviyo lifecycle flows

The platform doesn't only ship transactional email through SendGrid — it also syncs **lifecycle state** to Klaviyo so marketing flows can fire based on the §10 state machine.

- **Past-due profile sync** — `sync:klaviyo-past-due` ([scripts/sync-klaviyo-past-due-profiles.ts](scripts/sync-klaviyo-past-due-profiles.ts), `:dry` variant available) pushes the current `past_due` cohort into a Klaviyo segment so payment-recovery flows target the right people.
- **Renewal-entries preview** — Klaviyo sees how many entries a user's *next* renewal will grant, via `klaviyo-renewal-entries-preview` ([src/utils/integrations/klaviyo/](src/utils/integrations/klaviyo/), test: `npm run test:klaviyo-renewal-preview`).
- **Cancellation-flow signals** — `CancellationFlowEvent` rows (see §13c) feed comeback flows targeted at the `cancelled-members` audience used by `PromoLink` (§7b).
- **Canonical membership-state profile feed** (shipped 2026-05-28) — every server-side profile sync (`ensureUserProfileSynced`, fired by Stripe webhooks, payment/cancellation flows, auth/setup) re-pushes **5 canonical Klaviyo properties**: `membership_status` (active / past_due / canceled / never_subscribed, derived from Stripe state), `entries_purchased`, `giveaways_entered`, `membership_active_duration_months`, `next_renewal_date`. This continuously-updated profile store lets the ads team self-serve segments (e.g. "purchased entries but no membership", "at-risk near renewal") without per-flow engineering. Backfill: `scripts/backfill-klaviyo-membership-properties.ts`.
- **Abandoned-checkout recovery** (shipped 2026-05-28) — a `Started Checkout` event (`createStartedCheckoutEvent`) fires when a user begins a membership/pack purchase (client-side on payment-submit, and server-side after guest step-1 registration). The Klaviyo email's CTA carries a one-click resume deep link (`?openMembership=1&packageId=<id>`, built by `buildCheckoutResumeUrl`); on return, `useMembershipModalDeepLink` (mounted in `MembershipSection`) **auto-reopens the MembershipModal with that exact tier preselected**. A revenue-recovery funnel, not just tracking.
- **Viewed-Giveaway retargeting** (shipped 2026-05-28) — a `Viewed Giveaway` event (`createViewedGiveawayEvent`, fired by `PromoViewTracking` on `/promotions/<slug>` pages) carries rich template properties (promo title, prize name, prize image, promo URL) so a Klaviyo-side "viewed promo but didn't enter" flow can retarget paid-traffic visitors who clicked an ad but didn't convert (ties into the §11 surface).
- **Placed Order** events are tagged with `is_renewal` + `billing_reason`, so renewal revenue is distinguishable from first-purchase revenue in Klaviyo flows/segments.
- This is the same Klaviyo property store that the **client-side Klaviyo page tracker** (§14a) writes to, so identification stays consistent across server-side syncs and browser events.

**Failed-payment email cadence is entirely Klaviyo-side, not SendGrid.** On `invoice.payment_failed`, [`handleInvoicePaymentFailed`](src/services/stripe-webhook-handlers/index.ts) fires three Klaviyo events: `SubscriptionRenewalFailed`, `PaymentFailed`, and `SubscriptionPaymentFailed`. **No SendGrid template** is sent directly from the webhook (`grep` against `src/lib/email/**` for these names returns zero matches; the HTML preview at `payment-failed-email-template.html` is explicitly the **Klaviyo** template, per the preview component comment). Cadence — day 1 vs day 3 vs day 7 follow-ups — is configured **in Klaviyo flows**, not in code. The in-app §10e `RenewalFailedModal` is the user-side prompt that runs in parallel with whatever the Klaviyo flow is sending.

---

## 15. Other major systems

- **A/B testing** — full first-party framework. Services, components, hooks, repositories, models, `/api/ab-testing` routes. See [docs/ab-testing/](docs/ab-testing/).
- **Email** — SendGrid for transactional (code-as-source in `src/lib/email/`), Klaviyo for marketing (paste-ready HTML in `email-templates/klaviyo/`), preview UI at `/email-preview`, SMS via `src/lib/sms.ts` (Twilio).
- **Admin dashboard** — user management, payments, draws, promos, error reports, partner applications, Stripe webhook queue, dashboard stats daily snapshots (+ cycle-anchored Renewal Rate KPI), charge-past-due tool, blocked transactions / allowlist, demographic/age + profession-cleanup metrics, plus the **Analytics tab group** (All Platforms, Facebook Ads incl. **Facebook Ads Health** §14b, TikTok Ads, Snapchat Ads, Klaviyo, Page Analytics, Cancellation Flow, A/B Testing). See [docs/admin/](docs/admin/).
- **Staff roles & permissions (RBAC)** — admin access is no longer an all-or-nothing flag. Each user carries a `userType` of `customer` / `staff` / `admin` plus an optional `roleId` ([src/models/User.ts](src/models/User.ts)). Permissions are a hardcoded catalog of **47 actions across 17 areas** ([`src/lib/permissions.ts`](src/lib/permissions.ts) `AREA_ACTIONS`) — money-moving and irreversible actions (`users.charge`, `users.refund`, `users.cancelSubscription`, `users.delete`, `majorDraw.selectWinner`, `affiliates.processPayout`) are each their own permission, so a role can grant edit access without granting them. Permissions bundle into named roles ([src/models/Role.ts](src/models/Role.ts)); admin is the implicit super-role, while custom staff roles (e.g. an Ads Manager) get a filtered admin panel and are walled off from customer-purchase flows. Routes are gated via `requirePermission()` rather than ad-hoc `role === "admin"` checks. This is the same role-based system the Internal Norm bullet (below) relies on to secure the external-AI gateway. See [docs/auth/roles.md](docs/auth/roles.md).
- **Staff invite + audit** — owner/admins invite a team member by email + role (`POST /api/admin/staff`, gated by `settings.edit`), which creates an inactive user with a single-use invite token (7-day TTL) and sends a SendGrid invite email; the invitee sets a password at the public `/staff-setup/[token]` page. Deactivation reverts the user to `customer`, clears `roleId`, and forces sign-out — the row is kept for audit, never deleted. Every meaningful staff mutation (and every blocked 403 attempt by a logged-in staffer) is recorded in the **`StaffActivity`** audit log via `requirePermissionWithAudit` (wired into 60+ admin routes incl. force-charge, refund reversal, cancel-subscription, winner selection), snapshotting actor email/role-name + action/method/path/resource/status, with a 180-day TTL. Surfaced behind the `audit.view` permission (incl. a per-user "Staff actions" tab). Distinct from the Stripe allowlist audit (§12a/§12c).
- **Internal Norm API** — staff-only HTTP namespace at `/api/internal/norm/v1/*` exposing read-only business analytics (ROAS, dashboard stats) to an external AI assistant ("Norm") running on a Mac mini server, governed by the role-based permissions system above.
- **Error reporting** — first-party `ErrorReport` Mongo model + admin routes. Do not bolt on a parallel logger. See [docs/error-reporting/](docs/error-reporting/).
- **Security / CSP** — per-request nonce in `src/middleware.ts`, CSP assembled in `src/utils/security/csp.ts`, static fallback in `next.config.ts`. Stripe webhook route has special headers (no COEP). See [docs/security-csp/](docs/security-csp/).
- **DST / timezone** — billing logic uses `date-fns-tz`; there are DST-transition test scripts under `scripts/test-dst-transitions.ts` and `TESTING-TIMEZONE-DST.md` covers the edge cases.

---

## 16. Coming soon — what's on the roadmap

| Item                                    | Status                                       | Notes                                                                          |
| --------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| **Shop**                                | Scaffolded, page renders *Coming Soon*       | Products, Orders, Cart, brand/product pages all built. Shop discount lines per tier already in data, intentionally hidden until launch. |
| **Partner Discount API @ 1,000+ brands** | Static catalog of 7 today                    | Tier % model already in place; will migrate to DB-backed catalog with admin CRUD + public API. |
| **TikTok Ads insights sync**            | Pixel + server-side CAPI live; hourly ad-spend wired but creds-gated | Events API (CAPI) ships via the conversion registry (§14a). Marketing-API hourly ad-spend (`fetchTikTokHourlySpend`) is wired into the Spend/Profit/ROAS columns, awaiting live `TIKTOK_ADVERTISER_ID` + `TIKTOK_MARKETING_ACCESS_TOKEN` and verification. Outstanding: the daily-insights writer for `TikTokAdInsightsDaily`. |
| **Snapchat Ads insights sync**          | Admin shell + client pixel only              | Conversions API is a stub; no Marketing-API spend client yet — spend/ROAS show "—". Insights pipeline pending. |
| **Mobile app (Google Play Store)**      | Not started                                  | Planned native **Android** app on the Play Store. **iOS / App Store is not on the roadmap** at this stage. |
| **Second monthly Major Draw**           | Under consideration                          | Current cadence is one draw per month on the 27th.                             |
| **2nd- and 3rd-place winners per draw** | Multiple-winner storage works; needs a rank field | `Winner` is keyed by `drawId + cycle` with no unique constraint, so multiple winner rows per draw are storable today — but there is **no** `place`/`rank` field, so an ordered 2nd/3rd placement would need a small schema add to distinguish positions. Today every cycle has a single Grand Winner. |

---

## 17. Glossary

- **Major Draw** — the headline monthly tool giveaway, drawn on the 27th.
- **Mini Draw** — a smaller, product-specific draw triggered when its entry threshold is hit; no fixed schedule.
- **Pack** — a one-time purchase that grants entries (Apprentice → VIP).
- **Member** — strictly, a user with an **active subscription** (`userData.subscription.isActive === true`). The term is sometimes used loosely to mean "engaged user" — for Additional-pack eligibility, that loose sense applies (active sub OR current-draw entries).
- **Additional Pack** — a discounted variant of a one-time pack. Eligible to users with an active subscription **or** entries in the current major draw — see §2c.
- **Upsell** — a post-purchase offer at 50–60% off (50% on one-time/additional/mini, 60% on membership) granting a **category-specific entries multiplier** on the base pack's entries: membership 10×, one-time 2×, additional 2×, mini 1× (the first three admin-configurable; mini fixed). See §5/§6c.
- **Anchor day** — day 24 of the month, the day subscriptions renew. New joiners on the 25th/26th/27th are anchored to the 24th at signup; recovered past-due members are reanchored to their recovery-payment date (clamped 25/26/27 → 24). See `docs/BILLING_ANCHOR_24.md` and `docs/PAST_DUE_REANCHOR.md`.
- **Promo multiplier** — the entries-multiplier applied at *purchase time* (Scheduled / Toggle / Alternating). Prioritized, not stacked, within the promo family.
- **Upsell category multiplier** — the entries-multiplier applied to a *bonus pack* after a trigger purchase. Stacks multiplicatively with the promo multiplier active at the trigger purchase.
- **BonusEntryPromo** — additive entries grant (not a multiplier), date-windowed, per package type.
- **PromoLink** — a typed-at-checkout entries code, one-use-per-user, audience-gated.
- **Campaign code** — admin-issued bonus-entries code redeemed via `RedeemableIssuance`.
- **Redeemable / RedeemableIssuance** — a row in the event-based issuance ledger granting bonus entries. Payload is entries only.
- **Milestone** — a tier achievement (spend / entries / loyalty days) that issues entries when crossed.
- **Rewards Points** — legacy balance on `User.rewardsPoints`. Accrues now, redemption gated by the pause flag.
- **`scheduled_cancel`** — app-specific subscription state: user has requested cancellation, benefits live until cycle end. Not a Stripe-native status.
- **`previousSubscription`** — on-User cache holding the *old* package's benefits during a downgrade's grace period (until cycle end).
- **`pendingChange`** — on-User cache holding the *new* package on an upgrade that's still awaiting payment confirmation.
- **Past-due** — Stripe status `past_due`. The customer-facing recovery path is the `RenewalFailedModal` (§10e); the admin-side counterpart is the force-charge tool (§9e).
- **Allowlist** — a Stripe Radar value list of card fingerprints we trust enough to bypass auto-block. Audited in Mongo via `AllowlistAction`; Stripe is the source of truth.
- **Blocked transaction** — a Mongo row mirroring a Stripe-blocked charge attempt; admins review and either allowlist or dismiss.
- **Promo landing page** — a paid-traffic landing surface with its own hero, banner copy, FAQs, and trust bar — separate from the homepage and driven by the §6a multiplier system.
- **Mini-draw pack ladder** — the 3-guest + 5-additional-member-only pack structure introduced 2026-05-14 (see §3b).
- **TicketEntry** — one row = one ticket = one chance in a draw. Hard-keyed to a Mini Draw; Major Draw entries live separately on `MajorDraw.entries[]`. See §3e.
- **Carry-forward** — subscription entries accumulate month-to-month while active. One-Time pack and Mini Pack entries do **not** carry forward.
- **`autoRenew` toggle** — soft-cancel shortcut; calls Stripe `cancel_at_period_end: true`. Same effect as the §13c cancel flow; re-enable any time to undo (re-enabling an *unexpired* subscription mid-cycle).
- **Reactivate / Resubscribe** — `POST /api/stripe/renew-subscription` for a lapsed member (§10i). *Reactivate* uncancels a `canceled` sub still within a 30-day grace window — **same-tier only**, no charge (`REACTIVATE_TIER_CHANGE_NOT_ALLOWED` if a different tier is requested). *Resubscribe* (`create_new`) builds a fresh anchored subscription for a fully-expired member, via a tier picker that preserves accumulated-entries history. Distinct from the `autoRenew` mid-cycle undo and from §10e past-due payment recovery.
- **Refund policy** — memberships are non-refundable once purchased (Terms §4); no pro-rate refunds; ACL rights preserved (§9h).
- **`MajorDrawOverview`** — the primary ROI card on the member dashboard: entries this cycle, 3-month accumulation projection, countdown to draw date (§10h).
- **Partner access %** — the fraction of the partner-brand catalog a tier can see; today 50/75/100% for subscriptions, 25–100% for one-time packs (time-limited).
- **Freeze period** — the **30 minutes between 8:00 PM and 8:30 PM AEST/AEDT** on the 27th when the current draw is in `frozen` state and entries are locked. Subset of the broader "purchase blackout window."
- **Purchase blackout window** — the **full ~4 hours from 8:00 PM (27th) to 12:00 AM (28th)** during which new-entry purchases return 403 `GATES_CLOSED`: the 30-min freeze followed by the **gap period** (8:30 PM–midnight) when the previous draw is `completed` and the next is still `queued`. Renewals processed in this window route to the next cycle's pool. See §3a.
- **Gap period** — the **~3h 30min between draw end (8:30 PM) and next-draw activation (12:00 AM)** when no draw has `status: "active"`. New-entry purchases are blocked; renewals route to the next draw via `getTargetMajorDraw`'s explicit gap branch.
- **Ledger pattern** — `PaymentEvent` records of benefit grants/reversals, so refunds can replay the ledger backward.
- **Past-due** — subscription state when Stripe has failed to collect; recoverable via the admin tool or auto-recovery on next successful charge.
