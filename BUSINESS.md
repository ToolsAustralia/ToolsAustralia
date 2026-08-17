# Tools Australia — Business Context

> **Audience.** AI agents, new engineers, and anyone who needs to understand *what the platform does*, *how money flows*, and *what rules it actually enforces* — without reading the codebase first. Cross-references point to authoritative docs and source files in this repo.

---

## 1. What the business is

Tools Australia is a **membership-driven giveaway and rewards platform** for Australian tradespeople — electricians, plumbers, carpenters, builders, mechanics, and adjacent trades. The user's trade is captured via [src/data/professions.ts](src/data/professions.ts) and state via [src/data/australianStates.ts](src/data/australianStates.ts), so audience segmentation and prize/promo targeting can be trade-specific. Customers buy **memberships and one-time tool packs**, each of which **includes free entries** into monthly tool giveaways — entries are **never sold on their own** (Australian trade-promotion compliance: the product sold is the membership/pack, the entries are a free inclusion). (**Copy rule:** entry framing only. Forbidden: "buy/sell/purchase entries", "$ per entry", "odds", "chance", "boost your chances", "increase your chance", "lottery", "raffle", "gambling"; allowed: "free entries", "the membership/pack **includes** free entries", "{n}× entries", "more entries". This is a game-of-chance trade promotion, not gambling. Applies to Cobber, promo copy, and marketing alike.) Entries are earned by:

1. **Buying a one-time tool pack** (Apprentice → VIP).
2. **Subscribing to a monthly membership** (Tradie / Foreman / Boss).
3. **Taking an upsell** after any purchase (50–60% off, with a category-specific entries multiplier — membership 10×, one-time/additional 2×, mini 1×; see §5).
4. **Referring a friend**, **using an affiliate link**, or **participating in promos**.

On top of the giveaway loop, members unlock **tiered partner discounts** — **two separate programmes**: our own 7 direct partner brands, plus the **1,833-offer iGoDirect/MyRewards catalogue** reached through the partner portal (SSO **live in production as of 2026-07-31**). Once the shop launches, members also get **shop discounts** (5–20%).

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
  The frontend gate is [`useMajorDrawPurchaseGate`](src/hooks/useMajorDrawPurchaseGate.ts) — `gatesClosed = currentMajorDraw?.status !== "active"` — which surfaces [`GateClosedModal`](src/components/modals/GateClosedModal.tsx) ("Gates Are Closed") with the next-draw name and activation date. Wired into `MembershipModal`, `useMiniDrawTrigger`, and the `FloatingCountdownBanner` (which switches to a yellow "GATES CLOSED" theme). Server-side, [`enforceMajorDrawOpenForNewPurchasesOr403`](src/utils/draws/major-draw-gate-http.ts) returns **403 `GATES_CLOSED`** on **eight** purchase route handlers: `/api/upsell/purchase`, `/api/stripe/create-payment-intent`, `/api/stripe/create-subscription[-existing-user]`, `/api/stripe/create-one-time-purchase[-existing-user]`, `/api/stripe/upgrade-subscription-payment`, and `/api/stripe/switch-tier-past-due` (the past-due tier-switch teardown is a resubscribe, so it's gated like `create-subscription-existing-user` — see §10i; the `[-existing-user]` variants are two separate routes each).
- **Subscription renewals processed in this 4-hour window route into the NEXT cycle's pool, not the current one.** [`getTargetMajorDraw`](src/utils/draws/major-draw-helpers.ts) has explicit branches for both freeze (`currentDraw.status === "frozen"`) and gap ("No active draw (gap period) — use next queued draw"), so any webhook-driven renewal that lands at 8:14 PM or 10:47 PM on the 27th is allocated to the next draw, not the one being run that night.
- All package purchases (subscription renewals, one-time, additional, upsell) contribute entries to the target `MajorDraw` document's aggregated `entries[]` pool (per-user `totalEntries` + `entriesBySource` — see [src/models/MajorDraw.ts](src/models/MajorDraw.ts)). New purchases allocate to the current **active** draw only (`getActiveMajorDrawForNewEntryPurchases` — hence the gates-closed rule above); subscription renewals route via [`getTargetMajorDraw`](src/utils/draws/major-draw-helpers.ts) (previous bullet). `MonthlyEntryCampaign` is **not** this pool — it's the admin-run bonus-entry **code** campaign redeemed at checkout (see §7 and §8).
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

- **No fixed schedule.** Each mini draw has its own ID and `minimumEntries` target ([src/models/MiniDraw.ts](src/models/MiniDraw.ts)).
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

Tiers 4–8 of the original 8-tier flat ladder (`mini-pack-4` … `mini-pack-8`, $25 → $500) were deactivated 2026-05-14 (`isActive: false`) but the rows remain so historical orders and receipts still resolve; tiers 1–3 ($1/$5/$10) are the same original rows and remain active as the guest packs above. Upsells on mini-draw purchases use a fixed **1× multiplier** (no admin knob — see §6c).

### 3c. Prize fulfillment & customization — what the winner actually receives

The current monthly Major Draw prize is **fully customizable by the winner**. After being announced on Facebook Live (§3a), the winner picks **one** of:

**Option A — Power tool kit + workshop storage + $5,000 cash bonus** (most common). Two independent picks, plus a bundled cash bonus:

1. **Power tool brand** — Milwaukee, DeWalt, Makita, Ryobi, or HiKOKI.
2. **Workshop storage** — one of:
   - Sidchrome SCMT11402 **356-piece** tool kit & lockable roller cabinet.
   - Milwaukee 56" High-Capacity Combination Tool Storage (steel construction, electronic lock).
   - Kincrome CONTOUR® **470-piece** 17-drawer workshop kit (P1823).
   - GEARWRENCH **288-piece** tool set & mobile workstation (foam-inlaid drawers, full work top, heavy-duty castors).
3. **$5,000 cash bonus** — bundled into every combo on top of the tools (each combo's display label, via `getPrizeLabel`, ends in "+ $5,000 Cash" in [src/config/prizes.ts](src/config/prizes.ts); 13 of the 20 combos also carry an explicit "$5000 Cash Bonus" highlight — the four Sidchrome-storage variants and the three non-GearWrench HiKOKI variants do not).

That's a 5 × 4 grid = **20 power-tool × storage combinations** (each + $5,000 cash), each rendered as its own `PrizeCatalogEntry` with full specs, hero gallery, and highlight copy. (HiKOKI is the 5th toolset, added June 2026 — a 15-piece 36V/18V MultiVolt kit: a 13-piece Mega Combo plus framing + finishing nailers, bundled with its own HiKOKI Multi Cruiser 3-piece storage system. GEARWRENCH is the 4th toolbox, added July 2026 for draw 9 — it pairs with all five toolsets, so it added 5 combos in one go.)

**Option B — Cash instead of tools.** A single **$10,000 AUD tax-free cash** prize (`prizeValueLabel: "$10,000 Cash"`) — no equipment, "no tools, no hassle, just $10,000 straight to your bank account." There is **no $5,000 standalone cash tier** and no standard/upgraded distinction; the $5,000 figure only appears as the cash *bonus* bundled into Option A's tool combos.

The cash option lives as the 21st (last) `PrizeCatalogEntry` (`slug: "cash-prize"`).

**Why this is in the doc.** Each promo landing page (§11) pins a specific prize combination as its hero — so the prize catalog isn't only what the winner picks, it's also what the campaign sells. The 5×4 grid + cash means the same monthly draw can be marketed with very different copy (e.g. a Milwaukee-focused landing for Milwaukee fans vs a Sidchrome-storage-focused landing for cabinet-shop tradies) without changing the underlying draw.

**Winner contact & claim — partially in code, mostly operational.** When the winner is selected:

- The [`/api/major-draw/select-winner`](src/app/api/major-draw/select-winner/route.ts) route fires a Klaviyo `Major Draw Won` event (non-blocking) **and** sends an app-owned SendGrid winner-notification email to the winning member only — `emailService.sendWinnerEmail` → `createWinnerEmailTemplate` (the "YOU WON!" email in [src/lib/email/templates.ts](src/lib/email/templates.ts)). The email is best-effort (try/catch): a send failure is logged and never fails winner selection, and sending it does **not** flip `Winner.notified`. Any further winner comms driven off the Klaviyo event are Klaviyo-side flows outside this codebase.
- The `Winner` model carries a `notified: Boolean` flag (default `false`) but the platform never flips it to `true` automatically.
- **No claim form, no `claimedAt` field, no shipment-tracking integration in code.** Identity verification, prize-customization pick (Option A power-tool/storage combo vs Option B cash), and physical delivery are **operational** — handled outside the codebase.

> _Asset note (2026-06-22, no catalog change):_ the prize product photos in `prizes.ts` were optimized to webp with descriptive, product-accurate filenames. Each of the 15 tool combos also got a new composite "toolset + toolbox" card render (`{toolset}-set/{toolset}-{toolbox}.webp`, e.g. `milwaukee-sidchrome.webp`), wired into its `cardBackgroundImage` + first gallery image; the old `…Set-…Tb.webp` renders were retired and the HiKOKI hero (`hikoki-set/HIKOKI.webp`) was supplied. The combo + hero renders were normalised to uniform framing (so prize cards/carousel display at consistent size), and the HiKOKI per-tool spec photos were matched into `SPEC_ITEM_IMAGE_BY_NAME`. This is a presentational/asset change only — the prize catalog, combos, cash tiers, and copy are unchanged.

> _Asset note (2026-07-22, no catalog change):_ the three toolbox renders already used by the prize picker (`toolbox/{milwaukee,kincrome,sidchrome}TB.webp`) were wired into `SPEC_ITEM_IMAGE_BY_NAME`, and the workshop/toolbox storage arrays were added to `applySpecItemImages` so the mapping actually reaches them. The specs modal Storage tab previously drew a "photo coming soon" placeholder for the toolbox — the single biggest item in the prize — while the same art sat on screen one section above. Presentational only: no combo, cash tier, price or copy changed.

> _Catalog change (2026-07-27, draw 9):_ **GEARWRENCH 288-piece tool set & mobile workstation** was added as the **fourth workshop-storage option**, pairing with all five toolsets — so the grid went 5×3=15 → **5×4=20** tool combos, and `PRIZE_CATALOG` / `PRIZE_SUMMARIES` went 16 → **21** entries (the cash option stays last). Cash bonus is unchanged at **$5,000** per combo, and Option B is unchanged at **$10,000**. The five new entries carry the explicit "$5000 Cash Bonus" highlight. Their composite "toolset + toolbox" combo renders were photographed and shipped on 2026-07-28 for **four of the five** — Milwaukee, DeWalt, Makita and HiKOKI — each carrying `cardBackgroundImage` + a combo gallery hero at `{toolset}-set/{toolset}-gearwrench.webp`.

> _Artwork completed (2026-08-06):_ **Ryobi × GearWrench is now shot and wired**, so **all 20 combinations carry their own composite render** and none is on a fallback. `ryobi-set/ryobi-gearwrench.webp` (1600×1200, matching the other 19) is its `cardBackgroundImage` + `gallery[0]`. Until this edit the entry still pointed at the standalone `toolbox/gearwrenchTB.webp` — a 1000×1000 square of the bare toolbox with no Ryobi tools in shot — which was visible to customers as one odd, under-sized frame in the `/membership` prize carousel. `COMBOS_AWAITING_COMBO_ART` in `prize-builder-model.ts` was already empty, so the per-COMBINATION "combo photo coming" fallback is now unused by any live combo; keep the mechanism, it is what a future toolbox/toolset addition lands behind.

### 3d. Anchor-day-24 alignment

Subscriptions renew on **day 24** so renewals settle 3+ days before the 27th draw. This is intentional — see §6b.

### 3e. Entries — the atomic unit

This section nails down the unit economics, because every other system in the doc hands "entries" around without saying what one is.

- **1 entry = 1 independent chance in the draw — stored as an aggregated per-user count, not a row per ticket.** Both draw documents embed one subdoc per user with `totalEntries` + `entriesBySource` ([src/models/MajorDraw.ts](src/models/MajorDraw.ts), [src/models/MiniDraw.ts](src/models/MiniDraw.ts) — both commented "Aggregated entries per user"); a multi-entry purchase `$inc`s the buyer's count by N ([src/utils/payment/payment-processing.ts](src/utils/payment/payment-processing.ts)), and winner selection expands the counts into a weighted pool so each entry remains one independent chance. The legacy per-ticket [`TicketEntry`](src/models/TicketEntry.ts) collection holds historical mini-draw rows only — no live path creates new rows (it's read for a Klaviyo distinct-draws stat and deleted in the user-deletion cascade).
- **Mini-draw entries and Major-draw entries are SEPARATE POOLS.** Mini-draw entries live on `MiniDraw.entries[]` (mirrored per-user in `User.miniDrawParticipation`), Major Draw entries on `MajorDraw.entries[]` — and the legacy `TicketEntry` rows are hard-keyed to `miniDrawId` only (no `majorDrawId` field). **Buying a $5 Mini Pack only enters that named Mini Draw — it gives you zero Major Draw entries.** Terms §3c states this explicitly to the customer.
- **Carry-forward rule** — *subscription* entries accumulate monthly and carry forward while the subscription stays active (`User.subscription.lastMonthAccumulatedEntries`). **One-Time pack entries and Mini Pack entries do not carry forward** — they're scoped to the cycle they were bought in (Terms §5.3).
- **No expiry on entries.** Entry counts don't tick down or auto-expire — they're consumed when the draw runs.
- **Cancellation mid-cycle keeps existing entries valid.** If a user cancels before the 27th, the entries they've already earned this cycle stay in the pool — confirmed in code (no `TicketEntry` deletion in [`CancelSubscriptionService`](src/services/subscription/) or [`CancellationFlowService`](src/services/subscription/)) and stated explicitly in Terms §6: *"Entries for current competition period remain valid."*
- **Past-due keeps already-earned entries too — only *future accrual* pauses.** Winner selection ([`/api/major-draw/select-winner`](src/app/api/major-draw/select-winner/route.ts)) builds its weighted pool from **all** `MajorDraw.entries[]` with **no** subscription-status filter, and the freeze transition only flips `status` to `frozen` (it doesn't purge entries). So a `past_due` member's already-earned entries — **membership *and* one-time** — stay in the draw and can win. What past-due actually stops is the **next** membership grant: [`reconcile-major-draw-entries`](src/utils/draws/reconcile-major-draw-entries.ts) skips `subscription.isActive !== true` users when crediting *new* grants, and nothing removes existing ones (no deletion / no expiry, as above). Consequences for the member dashboard: (1) the `EntryWallet` shows a past-due member's **full** current entry total and the real membership number — **not** "paused" (the number is honored); (2) what genuinely pauses is next cycle's accrual **and** live **partner-discount access** (a benefit gated on `isActive`, not an earned ticket — so the Rewards partner card correctly reads "Paused" while the entry count does not).
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
- **Members can browse the catalogue on our side (2026-07-31).** `/my-account/rewards/catalogue`
  lists all 1,833 offers marked against the member's own access, with search, category filters
  and an "only what I can use" toggle. It exists because the vendor's portal renders locked and
  unlocked offers identically — we hold the per-offer threshold, so we answer it without them.
  **Commercially this cuts both ways:** it removes the "I paid and can't tell what I get"
  complaint, and it makes visible that at 50% only 917 offers open, 438 of them single-location
  in-store deals, with Kogan the sole recognisable national name. Catalogue fit is now the
  live problem (vendor ask 14 in [docs/partner/igodirect-portal-ux-audit.md](docs/partner/igodirect-portal-ux-audit.md)).
- **The catalogue is now a PUBLIC acquisition surface too — `/discount` (2026-08-05).** Same
  1,833 offers plus the 7 direct brands, in one list, readable **signed out**. The commercial
  bet is the inverse of the usual gate: what a membership sells is the ability to **redeem**,
  not the ability to look — so hiding the offers only hides the product. The list is stacked
  into bands by the access level each offer needs, and a **wall marker** is drawn at the
  viewer's limit ("Your access stops at 50% · 916 you cannot redeem yet"). Each locked offer
  opens the two cheapest routes past it — the cheapest **membership** and the cheapest
  **one-time pack** that reach its level, so a visitor who will not subscribe still has a path.
  Membership is the cheaper of the two at all 11 levels (pinned by `npm run test:discount-catalogue`),
  which is why it always carries "Cheapest way in" against the pack's "No subscription".
  Detail: [docs/partner/frontend.md](docs/partner/frontend.md).
- **There are TWO partner programmes and the same percentage governs both.** The 7 brands above are **Tools Australia's own** — deal direct, mention us at the counter, not in the portal. The **1,833-offer iGoDirect catalogue** is reached through the partner portal. The same tier percentage applies to each, so "50%" means both ~4 of our 7 brands **and** 917 of the 1,833 portal offers (`PARTNER_CATALOG_TIER_COUNTS`). The member-facing UI labels them separately ("Tools Australia partners · Deal direct · no portal") — before 2026-07-31 they were stacked under one heading and the access ring read as if it described only the 7.
- API surface today is intentionally narrow: partner applications (`/api/partner-applications/**`), an eligibility queue (`/api/partner-discount/queue`), and — built 2026-07-16, **default-dark behind `IGODIRECT_MEMBER_STATUS_ENABLED`** — a vendor-facing member-status read (`GET /api/partner-discount/member-status`) that iGoDirect's MyRewards portal calls at SSO sign-in / page load / offer redemption to check a member's live access (`active`, tier %, expiry; Tools Australia is the source of truth, the portal reflects it). **No general partner-discount CRUD.**
- **Rewards-return funnel (built 2026-07-24; launch pending OUR two SSO env flags, not the vendor):** the iGoDirect portal's blocked-offer state redirects to `/membership` (`utm_campaign=rewards-return`) where a personalised unlock banner upsells the covering package, then hands the member back to the portal via SSO. The **catalogue allowlist is maintained on our side** — the curated **1,833-offer** "Offers List Breakdown" CSV committed at [src/data/partner-catalog/](src/data/partner-catalog/) (the raw vendor feed contains 245+ uncurated extras and is never displayed directly). **Vendor side is settled (2026-07-28):** iGoDirect holds the production member-status key and has agreed to append the blocked offer's `offer_id` to the redirect, so the banner names the actual offer rather than falling back to a generic pitch. What remains is ours — set BOTH `PARTNER_DISCOUNT_SSO_ENABLED` and `NEXT_PUBLIC_PARTNER_DISCOUNT_SSO_ENABLED` to `true` in Vercel **and redeploy** (the `NEXT_PUBLIC_` twin is build-time inlined, so flipping one leaves every portal button hidden). Vendor portal goes live ~2026-07-31. Detail: [docs/partner/igodirect-integration-playbook.md §10](docs/partner/igodirect-integration-playbook.md).
- **Partner application flow** — businesses pitch to join the catalog via the public partner page; admins review submissions in the admin UI and reply through the same API. The application is the **inbound** side of the partner system (separate from the outbound member-facing discount catalog). Models: [`PartnerApplication`](src/models/PartnerApplication.ts).
- The `PartnerDiscount` Mongo model exists with `discountPercent` and validity dates but is **not yet used** for the live catalog.

### 4b. Tomorrow (coming soon)

- Scale to **1,000+ partner brands** via a proper database catalog + admin CRUD + public API.
- Tier model stays the same — Tradie/Foreman/Boss see 50/75/100% of the catalog respectively, with one-time packs unlocking a time-limited slice (25–100% × `partnerDiscountDays`).
- Sample data in `samplePartnerDiscounts.ts` (DeWalt, Milwaukee, Makita, Kincrome, Sidchrome) is **demo/sample data, not the live catalog** (the live catalog is `PARTNER_BRAND_OFFERS`). It is not strictly dev-only code — the production `GET /api/rewards` route serves it via `getActivePartnerDiscounts()` — but that endpoint is paused (503 `REWARDS_PAUSED`, see §8) and every sample record's validity window expired in 2024, so nothing from it is user-visible today.

---

## 5. Upsell mechanic

Source of truth: [src/data/upsellPackages.ts](src/data/upsellPackages.ts), [docs/upsell/](docs/upsell/).

After most purchases, the platform offers a single upsell. The pattern across all 22 upsell records:

- **Price**: 50% off the base pack price (60% off for membership upsells).
- **Entries**: a **category-specific multiplier** on the base pack's entries — **one-time 2×** and **Additional 2×** (e.g. one-time Tradie pack 15 entries → upsell grants 30), **membership 10×** (Apprentice base 3 → 30, Tradie 15 → 150, Foreman 30 → 300), and **mini fixed 1×**. The membership/one-time/additional multipliers are admin-configurable (defaults 10/2/2 in `UpsellMultiplierConfig`); mini has no admin knob. See §6c. **A live §6 promo STACKS on top** (promo × category × base — e.g. a 10× membership promo makes the Apprentice membership upsell 3 → 300): confirmed intended behavior (owner, 2026-07-22), and it's why the 50×/100× upsell artwork variants exist. The e2e flagship (`npm run e2e:journey`) asserts the 300-entry grant and the 100× artwork end-to-end.
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

See [`upsell-entries-calculator.ts`](src/utils/payment/upsell-entries-calculator.ts). The `activePromoMultiplier` is **snapshotted from the original trigger purchase**, so a promo that's ended by the time the upsell is taken still applies; if no snapshot was recorded (or it was 1×), the purchase route ([`upsell/purchase/route.ts`](src/app/api/upsell/purchase/route.ts)) falls back to the promo active at upsell time — so a promo that started after the trigger purchase can apply too.

**Default category multipliers** (the second factor above): membership upsells **10×**, one-time **2×**, additional **2×**, mini fixed **1×** (no admin knob).

### 6d. BonusEntryPromo — additive, not multiplicative

[`BonusEntryPromo`](src/models/BonusEntryPromo.ts) is a separate, **additive** mechanism: a date-windowed fixed bonus of *N entries* per package type, on top of base entries. Independent of the multiplier resolver. Used when you want "buy any Tradie pack this week, get +10 entries" without changing the multiplier rate.

All LIVE.

---

## 7. Codes — referral, promo, monthly campaigns

**Codes never touch Stripe Coupons or pricing.** The "Coupon" terminology in the UI (e.g. [`MembershipModal/CouponRow.tsx`](src/components/modals/MembershipModal/CouponRow.tsx)) refers to **user-entered codes that grant entries**, not codes that change pricing — nothing in the codes or promo systems changes pricing (§6 amplifies *entries*, never price; its heading is literally "how entries get amplified"). The one real Stripe coupon in the system lives outside codes entirely: the §13c cancellation-flow retention offer `discount_50_2mo` applies the singleton coupon `retention-50off-2mo` (50% off for 2 months) directly to the subscription via [`RetentionDiscountService`](src/services/subscription/RetentionDiscountService.ts) — never via a typed code.

### 7a. Unified validator

A single endpoint — [`/api/codes/validate`](src/app/api/codes/validate/route.ts) — accepts any code the user types and tries three types in order:

> **referral → promo (PromoLink) → campaign (MonthlyEntryCampaign)**

### 7b. The three code types

- **Referral codes** — derived from the inviter's user record. See [`src/lib/referral.ts`](src/lib/referral.ts). Successful redemption is tracked by `ReferralEvent` and feeds the affiliate / referral lifecycle.
- **`PromoLink`** ([src/models/PromoLink.ts](src/models/PromoLink.ts)) — typed-at-checkout or link-shared (`?promo=` / `?bonus=`) entries code. 6–32 chars `A-Z0-9-`. **One-use-per-user** via `usedBy[]`. Optional `expiresAt`. Gated by `appliesToMembership` / `appliesToOneTime`. `eligibilityAudience` ∈ `all | cancelled-members` — the cancelled-members audience is how comeback campaigns are gated to people who've previously churned.
- **`MonthlyEntryCampaign` codes** — admin-issued bonus-entry codes redeemed via `RedeemableIssuance` (see §8). One-per-user, status flips to `redeemed` on consumption.

### 7c. UX

Codes can be **typed at checkout** or arrive **auto-applied via a shareable URL** — `?ref=CODE` (referral) and `?promo=CODE` / `?bonus=CODE` (PromoLink) are captured by [`useReferralCode`](src/hooks/useReferralCode.ts) / [`usePromoLink`](src/hooks/usePromoLink.ts), persisted in sessionStorage, and auto-validated + applied in the checkout modals (MembershipModal, SpecialPackagesModal) without the user typing anything. Either way, codes only ever grant entries — never a pricing discount. URL **UTM params** feed `PromoAnalyticsVisit` for attribution and don't change pricing or entries.

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
- **Full refunds claw back redeemables tied to the refunded payment — redeemed or not.** Milestone issuances granted by the refunded payment are revoked; already-redeemed ones are first un-redeemed (granted entries and draw entries removed) and then revoked ([`MilestoneService.revokeIssuancesFromPaymentEvent`](src/services/milestones/MilestoneService.ts)). A monthly coupon redeemed *on* the refunded purchase is un-redeemed back to `active` (its entries removed). Only reversal steps that **fail** surface in `RefundProcessed.data.reversalIssues[]` for admin attention; partial refunds are recorded as `RefundPartial` with **no** benefit reversal (§9c). See [`docs/rewards-redeemables/rules.md`](docs/rewards-redeemables/rules.md).
- **Purchase-gated coupons need a real in-window purchase EVENT.** A campaign coupon's `purchaseRequirement` (`none` / `membership` / `one-time` / `any`) is enforced by `hasQualifyingPurchase(...)`, and **every leg is an event check bounded by the campaign window `[startsAt, endsAt|now]`**: `membership` needs a subscription **purchased in-window** (`subscription.startDate` — set on join/resubscribe, both charged), and `one-time` / `any` need a one-time package bought in-window. Merely *being* an active member does **not** qualify (2026-07-07 fix: the previous state check let every recipient of an all-active-subscribers campaign with a `membership`/`any` requirement claim instantly with zero purchase — found via the owner's `testpurchase` coupon). A coupon is also **not** redeemable off a lifetime entry balance or an old subscription — the even older `accumulatedEntries === 0` proxy had the same class of hole. The intended flow for existing members is carrying the code **on** a purchase: the webhook redeems it via this same predicate right after the purchase persists. Enforced in lockstep by both `RedemptionService` (the burn) and `RedeemablesWalletService` (the wallet's `isRedeemableNow`; its projection selects the full `subscription` subdoc). Known caveat (accepted): a downgrade also resets `startDate` without a charge. See [src/utils/redeemables/purchase-eligibility.ts](src/utils/redeemables/purchase-eligibility.ts).
- LIVE end-to-end: admins run campaigns, and users claim coupons from the `/my-account/rewards` claimables surface ([RewardsClaimables](src/components/sections/rewards/RewardsClaimables.tsx) → `POST /api/redeemables/redeem`) — shipped with the 2026-07-02 dashboard-rewards redesign. These §8b surfaces are **not** behind the §8a pause flag (none of the `/api/redeemables/*` routes call `guardRewardsEnabled`); the `rewardsEnabled` flag pauses only the §8a points surfaces — the legacy `/rewards` page and `/api/rewards/*` (503).

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
- After clearing the pause — and, like the resume, **before** the slow benefits-granting step, so it too survives a webhook timeout — the webhook also **reanchors future renewals** to the recovery-payment date (clamped 25/26/27 → 24) — see §9b and `docs/PAST_DUE_REANCHOR.md`.
- **Stranded-invoice recovery (member self-serve).** Once Stripe's Smart Retries exhaust, the renewal invoice becomes "stranded" (still `open`, but the Dashboard labels it "Failed") and `stripe.invoices.pay()` rejects it — which used to dead-end members at a "contact support" screen. Members can now **self-recover**: Pay-Now (`pay-failed-invoice`), the off_session "Pay overdue" (`force-charge-overdue`), and the renew retry (`renew-subscription`) all **void the stranded invoice and finalize the held cycle draft** via the shared `prepareRecoveredCycleInvoice` primitive (serialized by a per-subscription `RecoveryClaim` lock), then collect on that draft — no manual invoice is ever created (so `billing_reason` stays `subscription_cycle` and §9d resume + reanchor still run). Admin Force-Charge on a stranded invoice now recovers too. See `docs/FAILED_RENEWAL_PAY_NOW.md`.

### 9e. Past-due admin charge tool

- Endpoint: `POST /api/admin/invoices/charge-past-due`.
- **Phase 0 allowlist sweep.** Before any invoices are charged, the run automatically allowlists eligible cards (paying members, no fraud/permanent-issue signal) that were previously Stripe-blocked for that run's own customers — best-effort, never blocks the charge run. This replaces the old manual pre-run script for day-to-day use; that script remains for full-history catch-up.
- Strict guardrails: typing `"CHARGE"` to confirm, a **global 30-minute mutex lock** (`ChargeJobLock` — only one charge run executes at a time across all admins, not a daily throttle), a **30-second per-invoice debounce**, and a **6-hour per-user recent-attempt window** (`RECENT_ATTEMPT_WINDOW_HOURS = 6`; tightened from 24h on 2026-05-06 to allow same-day human-driven retries). The separate Force-Charge path adds a budget of 3 attempts per 6 hours. (There is **no** per-admin 5-minute rate limit and **no** global 24-hour limit — those were never implemented.)
- **Stripe idempotency keys are scoped per attempt, not static.** A run-by-run bulk run uses `admin-charge-${invoiceId}-run-${runId}` (the per-click variant is bucketed to a 30s window, Force-Charge is per-attempt). This matters because Stripe **replays** a reused idempotency key for 24h *without re-charging* — a static `admin-charge-${invoiceId}` made every <24h re-run replay the prior decline and collect $0 (incident 2026-06-29, fixed). So day-over-day re-runs of this tool now genuinely re-attempt the card. See `docs/CHARGE_PAST_DUE_CUSTOMERS.md`.
- **The bulk run auto-recovers stranded invoices instead of dead-ending on them (2026-07-19).** Previously every retries-exhausted invoice whose PaymentIntents were all canceled was still `invoices.pay()`ed, so Stripe rejected it with "This invoice can no longer be paid" — 558 of 744 rows in the 2026-07-19 run "failed" without any charge reaching a card. The bulk job now routes each invoice pay-vs-recover (`decideBulkChargeAction`): truly unpayable ones run the same §9d recovery (void stranded original → finalize held cycle draft → pay) as the per-user Charge button; exhausted-but-still-payable ones (a live PaymentIntent remains) stay on the direct pay branch.
- **The bulk run now re-bills the `no_held_draft` cohort instead of skipping it (2026-07-21).** A stranded member who has no held cycle draft yet (their next cycle hasn't minted one) used to be reported as skipped. The run now **mints a fresh current cycle** for them via `mintCurrentCycleInvoice` — unpause + `billing_cycle_anchor:'now'` immediately charges the default card **and** moves the renewal ~1 month out (so it doubles as the reanchor; the dead original is voided last). `billing_cycle_anchor:'now'` renews on the recovery day un-clamped, so when the re-bill lands on the **25th/26th/27th** the entry webhook re-applies the anchor-24 clamp (§9b) — pulling the renewal to the next 24th (member → `trialing`) so it keeps its 3-day draw buffer, parity with the held-draft recovery path (2026-07-22). The mint reuses the bulk's already-held `RecoveryClaim` (`callerHoldsRecoveryClaim`/`skipClaim`) so it can't self-deadlock. Only guard-skips stay "skipped" — member scheduled to cancel (`member_ending`), already collected by a prior re-bill (`not_past_due`), or a concurrent recovery holding the claim. A real card decline is a **failure that still notifies** (see §9i). The design goal is explicit: attempt a charge on **every** stranded member, because a decline drives a re-engagement notification, whereas a silent skip contacts no one. There is deliberately **no** "this invoice can no longer be paid" dead-end.
- **A stranded invoice is now recovered in the same run instead of a day later (2026-07-31).** `decideBulkChargeAction` runs *before* the Stripe call, so it can miss an invoice whose PaymentIntent is stale-but-not-yet-canceled: it routes to the direct pay branch, and `invoices.pay()` then cancels that PaymentIntent itself and rejects with `payment_intent_unexpected_state` — **no charge reaches the card**. That happened **245 times over 28–31 Jul 2026** (1,950 all-time); 238 of the 245 members were still `past_due` afterwards. Because our own call is what makes the invoice recover-eligible, the *next* day's run picked every one of them up for recovery (5→5, 209→209, 14→14 across three days) — so the only cost was a wasted day per member plus a decline chip that wrongly implied a card problem. The bulk run now catches that specific Stripe rejection and routes the member straight into the §9d recovery inside the same run. **This changes only the timing, not who gets recovered or re-anchored** — the same members reached recovery 24h later regardless. Invoices where Stripe still has its own retry scheduled continue to stand down untouched.
- Only charges DB-confirmed `past_due` users who have a finalized open invoice and a default payment method.
- **A failed re-bill now returns the member to `past_due` (2026-07-31).** When a stranded member's freshly minted cycle invoice declines, they were already being emailed the renewal-failed dunning notice — but their account status was left reading `active`, because the status write was gated on a stricter condition than the notification. Two members had been sitting on a stale `active` while genuinely delinquent (one for ~4 months). They are now correctly returned to `past_due`, which means they re-enter the normal recovery ladder instead of silently retaining member state. A repair tool (`npm run reconcile:stale-active`) reconciles any account that already drifted, using Stripe as the source of truth. Note the fix deliberately does **not** re-pause these members — the recovery flow just unpaused them, and re-pausing would undo it.
- **Dead-card declines are no longer pointlessly allowlisted (2026-07-31).** The card-allowlist filter skips decline codes that customer action alone can fix, but it was checking for `invalid_number` — a code this account has never once produced — while missing `incorrect_number`, which has fired 4,202 times (the single largest dead-card decline). Those cards were being added to the Radar allowlist, which cannot make a mistyped or reissued number succeed. Corrected. **No change to who gets charged** — the daily attempt still runs, deliberately: a decline is what triggers the member's re-engagement notification, and only 39 members across all time decline *exclusively* on dead-card codes, so suppressing retries would silence them for a negligible saving.
- **Decline reporting counts each member once (2026-07-31).** The admin decline views previously disagreed: the per-run drawer showed a large `unknown` bucket (206 rows on the 30 Jul run) while the server-side summary card hid those rows entirely. Recovery writes one summary row per recovered member, and whether a separately-coded row exists elsewhere depends on the branch — held-draft recoveries have one, freshly-minted re-bills do not. The old filter dropped both, hiding **237 genuine re-bill declines** ($8,440 of invoices) from the summary. Both views now share one classifier and count a summary row only when no coded counterpart exists; re-bill declines carry an explicit `rebill_not_settled` reason instead of reading as "unknown".

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

### 9i. Past-due failure notifications — every attempt reaches the member

- **A declined past-due charge is a feature, not a dead-end: it notifies.** Whichever channel attempts collection on a past-due/unpaid member — the per-user admin Charge, Force-Charge, the §9e bulk run, the member's own Pay-Now / resolve, or a re-billed fresh cycle (§9e) — a card decline fires the **`Subscription Renewal Failed`** Klaviyo event, which drives the dunning / re-engagement flow. Re-engaging a stranded member matters more than a clean success rate: a run that charges 300 members and collects 3 still notifies the other 297.
- **A re-billed cycle failure is classified as a renewal failure even though Stripe calls it `subscription_update`.** The mint (`billing_cycle_anchor:'now'`) produces a `subscription_update` invoice, so a decline arrives as `invoice.payment_failed` with `billing_reason: subscription_update`. The webhook still routes it to `Subscription Renewal Failed` via `isRebill` (`subscription_update` while the member was `past_due`/`unpaid` — upgrades are blocked while past_due, so this is never a mis-classified upgrade). It deliberately does **not** re-pause the member: a re-billed member whose card declines is left **unpaused / in Stripe dunning** on the fresh cycle, not frozen back into `pause_collection`, so Stripe's smart retries and the Klaviyo flow both keep working on them.

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
| `paused`             | **App**    | Retention `pause_30d` freeze: member keeps their paid period, then freezes ~30d; auto-bills on resume (§13c). |
| `scheduled_cancel`   | **App**    | User has requested cancellation; benefits live until cycle end.                                      |
| `canceled`           | Stripe     | Subscription ended.                                                                                  |
| `none`               | **App**    | Never had a subscription, or fully cleared.                                                          |

`MembershipStatusHistory` records every transition with `actor ∈ {user, admin, stripe, system}` and carries `pastDueAt`, `cancelledAt`, `endDate`, `autoRenew`.

**The `paused` state (retention `pause_30d`).** A member who accepts the 30-day pause save-offer (§13c) keeps the paid period they already bought, then freezes for ~30 days. It is **period-end anchored**: the freeze runs `[subscription.pausedFrom, subscription.pausedUntil)` where `pausedFrom` = the member's period end and `pausedUntil` = `period_end + 1 month` (the member's NEXT billing-cycle boundary, calendar-clamped via date-fns `addMonths` — Feb-safe, skips exactly one cycle; so a just-renewed member gets the full pause, not ~0). While paused there is no charge and no member access/perks/new entries (`isActive=false`), but **already-earned entries are untouched — they were paid for and still count in draws**. Because Stripe keeps the subscription `active` under a `pause_collection`, the **app owns** the `paused` DB state (flipped by the Stripe webhook, backstopped by the `cancellation-retention-resume` cron). At `pausedUntil` Stripe auto-resumes and bills the next cycle — a successful charge returns the member to `active`, a failed one to `past_due` (benefits return only after a successful payment). A member (or admin) can also resume early. See [docs/subscription/backend.md](docs/subscription/backend.md).

**The `autoRenew` toggle is a soft-cancel shortcut.** Turning it off via `PATCH /api/stripe/update-auto-renew` calls `stripe.subscriptions.update(id, { cancel_at_period_end: true })` — the same effect as completing the §13c cancellation flow: the user keeps benefits and entries through the current cycle, and can re-enable it any time to undo (which also clears `cancelledAt` / `endDate`). It's the path for "I want to cancel but don't want the retention modal right now."

### 10b. The two app-specific "ghost" states

Two on-User flags act as state without being in the enum:

- **`previousSubscription` (downgrade benefit-preservation period)** — when a user downgrades, the old package's `entriesPerMonth` and `discountPercentage` are cached on `User.subscription.previousSubscription` until `endDate`. The user keeps the higher tier's benefits until the current cycle ends. See [src/models/User.ts:47](src/models/User.ts).
- **`pendingChange` (upgrade-awaiting-payment)** — when a user initiates an upgrade but payment is still in-flight, the desired new package is parked on `User.subscription.pendingChange` until the charge confirms.

These are not in the status enum but materially affect what entries / partner access the user has *right now*, so any UI showing "what tier am I" has to read them.

### 10c. Upgrades — immediate charge, cycle resets

- `proration_behavior: "none"`, `billing_cycle_anchor: "now"`, `payment_behavior: "error_if_incomplete"`. See [src/app/api/stripe/upgrade-subscription-payment/route.ts](src/app/api/stripe/upgrade-subscription-payment/route.ts).
- User pays the **full new-tier price immediately**; renewal date resets to today.
- **Upgrading OVERWRITES a scheduled cancellation.** A member who is `cancel_at_period_end` (autoRenew off) can upgrade instead — the update explicitly sets `cancel_at_period_end: false`, so the pending cancel is cleared (Stripe > 2018-02-28 does **not** auto-clear it on an item swap; charge-safe since `cancel_at_period_end` triggers no proration). Without this the DB would read "upgraded/active" while Stripe still cancels at period end.
- **Entries are granted immediately on upgrade** — the grant runs **server-side in the Stripe webhook** after the upgrade invoice is paid (the route records `user.subscription.pendingChange` and defers benefit-granting to the webhook). The `upgradeEntriesGrant` figure shown in [UpgradeConfirmModal](src/components/modals/UpgradeConfirmModal/index.tsx) is only the **display amount** (computed client-side via `calculateUpgradeEntries`), not the grant mechanism.

### 10d. Downgrades — no charge now, takes effect at cycle end

- `proration_behavior: "none"`, no immediate charge. User pays current (higher) price until cycle end.
- **Old benefits stay live** via the §10b `previousSubscription` cache until `endDate`.
- `DowngradeConfirmModal` shows `effectiveDateLabel` (e.g. "Fri 26 Dec") so the user sees exactly when the new tier kicks in.
- **Downgrading OVERWRITES a scheduled cancellation.** A member who is `cancel_at_period_end` can downgrade instead of cancelling — the update sets `cancel_at_period_end: false` and the route resets `autoRenew: true` / clears `cancelledAt` in the DB (this path has no dedicated webhook reconciliation). **Critical:** without this, Stripe cancels at period end *before* the downgraded price ever renews, so the member is **dropped entirely** instead of continuing on the lower tier.
- **Resuming instead:** a member who just wants to stop the scheduled cancellation (not change tier) taps **"Resume membership"** in the dashboard Manage sheet → `PATCH /api/stripe/update-auto-renew {autoRenew:true}` (the §10-`autoRenew` soft-cancel undo — no charge, no tier change).

### 10e. Renewal-failed customer UX

When a renewal fails (Stripe emits `invoice.payment_failed`), `subscription.pastDueAt` is set and the customer sees a past-due hero card + the [`RenewalFailedModal`](src/components/modals/RenewalFailedModal/index.tsx) recovery engine. In the **member dashboard** that engine renders **sheet-native inside the Payment sheet** (`PastDueResolvePanel` — no modal chrome; reached from the past-due hero's "Manage membership" → "Update payment to resume", or the "Update payment method" row) rather than as a separate popup — so one bottom sheet both resumes the subscription and manages cards. The resolve state machine is single-sourced in `usePastDueResolve`, shared with the legacy `SubscriptionManagementModal` (which still opens the `RenewalFailedModal` modal). The recovery ladder, in order:

1. **In-app retry on the existing default card** — `payFailedInvoiceMutation`. This is the primary CTA — most failures are transient.
2. **3DS / SCA fallback** — Stripe Payment Element renders inside the modal when the bank requires customer confirmation.
3. **Update card** — `InlineCardSetup` (SetupIntent) renders only when Stripe returns `requiresDifferentPaymentMethod` or there's no default PM. **Not the default path** — we keep the existing card unless Stripe says otherwise.
4. **"Pay overdue amount" force-charge** — last resort, when the invoice is no longer payable through the normal flow. Calls `/api/stripe/force-charge-overdue`.

On success, the flow refetches at 3 s, then refetches again and closes (the sheet/modal) at 8 s — waiting for the §9f webhook queue worker to settle the state — and shows: *"Your subscription has been reactivated and benefits are live again."*

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

**Bottom navigation** (5 tabs, shared model [`DASHBOARD_NAV`](src/app/(site)/my-account/components/BottomNav.tsx) consumed by `BottomNav` (mobile) + `DeskNav` (desktop)):

- **Dashboard** (`/my-account`) — the **landing dashboard** described below.
- **Rewards** (`/my-account/rewards`) — partner-access card, partner-discount queue, claimable rewards, and loyalty milestones (§8; see item 7 below); renamed from `/my-account/benefits` in the 2026-07 revamp.
- **Draws** (`/my-account/draws`) — a Major/Mini toggle over current & past draws (raised center FAB), carrying the `EntryWallet` ROI card, plus an in-place **`MiniDrawEntrySheet`** overlay to buy Mini Packs (which include the draw's free entries) without leaving the dashboard (same money path as `/mini-draws/[id]`).
- **Membership** (`/my-account/membership`) — current package, upgrade/downgrade entry points (§10c/§10d).
- **Support** — opens an overlay **sheet** (contact / help), not a route; the `/my-account/support` page still exists but the nav button opens `openSheet("support")`.

**Account settings** live at `/my-account/settings` — one **consolidated page** (identity, email verification, personal details, appearance, and password change); the old Account/Subscription/Password/Payment `?tab=` sub-pages were removed in the 2026-07 dashboard revamp. **Subscription management and payment methods are overlay sheets** (bottom-sheet on mobile, centered popup on desktop, same mechanics as the Support sheet) opened from the Membership page / dashboard — not separate pages. The **Rewards** tab (`/my-account/rewards`, renamed from `/my-account/benefits`) stacks the partner-access card, the partner-discount queue, claimable rewards, and loyalty milestones.

**Home dashboard, top to bottom** ([src/app/(site)/my-account/page.tsx](src/app/(site)/my-account/page.tsx)) — rebuilt from `src/components/sections/dashboard/*` in the 2026-07 revamp:

1. **`DashboardHero`** — identity + tier badge, the partner-access % ring, and the state-aware primary actions: a complete-profile prompt, **"Become a member"** (→ `/my-account/membership`), the gated **"Partner portal"** SSO button (renamed from "Reward portal" 2026-07-24; §16), Settings, and the past-due **"Update payment"** entry to §10e. Guests get `DashboardGuestPanel` instead of the panels below.
2. **`DashboardAlertRibbon`** — a state seam pill: past-due ("payment failed → entries paused") or one-time ("become a member for lasting partner discounts…"); renders nothing for active / guest.
3. **`EntryWallet` — the primary ROI card.** Entries this cycle split into `membership` + `oneTime`, and the countdown to the draw date. Replaced `MajorDrawOverview` (removed in the 2026-07 revamp); see [src/components/sections/dashboard/EntryWallet.tsx](src/components/sections/dashboard/EntryWallet.tsx).
4. **`DashboardPromoBanner`** — the live promo multiplier / additional-access offer, with the offer specifics rendered as badges on the **"Get a package"** CTA (§6).
5. **`PartnerPreview`** — a compact teaser of the §4 partner catalog filtered by the user's tier visibility %, linking through to the Rewards tab.
6. **Aside column** — the one-time **"Keep your partner discounts"** upsell card (or the gated `LoyaltyStreak` card, §16), then `QuickActionsGrid` ("Get a package" / "Refer a friend" §13b / "Past draws" / a live redeemable count).
7. **Rewards entry point** — the dashboard sidebar / bottom-nav **Rewards** item (→ `/my-account/rewards`, renamed from `/my-account/benefits` 2026-07-03) is the entry point to §8 (the §8b claimables there are live and ungated; only the §8a points surfaces remain behind the rewards pause flag). The old floating `RewardsFloatingWidget` was removed in the 2026-07 dashboard revamp. **Purchase-gated redeemables now require a real qualifying purchase inside the campaign window to redeem** — a "one-time"/"any" coupon is no longer auto-granted from a lifetime entry balance or an old subscription (see `src/utils/redeemables/purchase-eligibility.ts`).

The ROI story this dashboard tells: *"You've earned N entries this cycle (membership + one-time), the draw is M days away — and here are the partner discounts you can use right now."* Every visit reinforces the value of the subscription.

### 10i. Reactivation & resubscribe — winning back lapsed members

`POST /api/stripe/renew-subscription` ([route](src/app/api/stripe/renew-subscription/route.ts)) is the single entry point for a non-active member coming back. It picks one of three `renewalStrategy` branches off the current Stripe status:

1. **`retry_payment`** — for `past_due` / `unpaid` / `incomplete` subscriptions. Overlaps the §10e `RenewalFailedModal` recovery flow.
2. **`reactivate`** — for a `canceled` / `cancel_at_period_end` subscription **still within a 30-day grace window past `cancel_at`**. This only clears `cancel_at_period_end` (no charge, no proration, no new entry grant). It is **same-tier only**: requesting a different `packageId` is rejected with **HTTP 400 `REACTIVATE_TIER_CHANGE_NOT_ALLOWED`** ("Reactivate your current plan first, then upgrade or downgrade"). Tier changes deliberately route through the normal §10c/§10d flows *after* reactivating — bolting a tier swap onto reactivate would trigger an auto-proration charge and an incorrect entry grant off the resulting `subscription_update` invoice (see the §9b $0-trial guard for why that matters).
3. **`create_new`** — the "Welcome back!" resubscribe path for a **fully-expired** member. Builds a brand-new anchored subscription (§9b) and grants entries via the webhook on the paid first invoice.

**Resubscribe tier picker + entry-history carry-over.** When a subscription is `canceled` (or otherwise non-active/non-past-due), the Subscription Management modal replaces the legacy single "Reactivate" CTA with a **tier picker over all packages** (`ResubscribeTierPicker` via `InactiveSubscriptionState` → `ResubscribeEmptyState`) — the member is free to come back on **any** tier, with their previous package highlighted. Entry history survives the cancellation: `User.subscription.lastMonthAccumulatedEntries` persists through the cancel (and the picker surfaces it — "You have N accumulated entries", footer "your entries history is preserved"). On reactivation `lastResubscribedAt` is stamped, which drives a carry-over banner on the success page. This is distinct from the §10 `autoRenew` soft-cancel undo (which re-enables an *unexpired* subscription mid-cycle) — §10i is the win-back surface for a member who **fully churned**, and it's the on-platform half of the §13d comeback funnel.

**Past-due tier switch.** A `past_due` member who wants a *different* tier can't recover in place — §10e `retry_payment` pays the overdue invoice on the **same** tier, and §10i `reactivate` is **same-tier only** — because a proration swap on the live subscription would spawn a granting `subscription_update` invoice (the §9b $0-trial-guard rationale). Instead, tapping a different tier in the dashboard membership tier list runs a **cancel + void → resubscribe** teardown: `POST /api/stripe/switch-tier-past-due` cancels the past-due subscription immediately and **voids (forgives) the unpaid renewal invoice(s)**, leaving a clean `canceled` state; the client then opens the ordinary §9b fresh-subscribe flow for the new tier (entries carry over via `lastMonthAccumulatedEntries`, anchor-24 applies, and the webhook grants once off the new `subscription_create` invoice). Cancel + void emit only `customer.subscription.deleted` + `invoice.voided` — never a granting `invoice.payment_succeeded` — so the teardown carries no spurious-grant risk. Tapping the member's *current* (past-due) tier instead opens the §10e payment-update flow (resolve, don't switch). A member who abandons after the teardown but before completing the new subscribe is left `canceled` (they were already past-due / not accruing) and can resubscribe on any tier anytime. The teardown **reconciles against live Stripe status** before the irreversible cancel: if a dunning retry already recovered the subscription (Stripe `active`, DB not yet synced) it refuses to cancel and tells the member their payment went through; if Stripe already canceled it (dunning exhausted) it syncs the DB and lets the member resubscribe — so the stored-status lag never cancels a just-paid membership. The switch is also **blocked during a major-draw freeze** (like every other new purchase), since it is a resubscribe — a freeze must not strand the member with a torn-down subscription and a gated resubscribe.

---

## 11. Promo landing pages & paid-traffic surface

Tools Australia's paid traffic doesn't land on the homepage — it lands on **promo-specific landing pages** with their own hero, banner copy, FAQs, and trust signals. This is a substantial customer surface that pivots independently of the rest of the product.

### 11a. The landing-page ingredients

- **Hero image manifest** ([scripts/build-landing-image-manifest.ts](scripts/build-landing-image-manifest.ts) → [src/generated/landingImageManifest.ts](src/generated/landingImageManifest.ts)) — pre-built at `predev`/`prebuild` so the landing route knows exactly which hero asset to serve per promo slug without runtime FS scans.
- **`PromoBannerText`** ([src/models/PromoBannerText.ts](src/models/PromoBannerText.ts)) — rotating banner copy controlled from the admin UI.
- **`PromoFAQs`** and `PromoTrustBar` ([src/components/sections/promo/](src/components/sections/promo/)) — conversion-side components that surface objections-handling copy and trust signals.
- **`PromoAnalyticsVisit`** + `usePromoPageTracking` — visit-level analytics tied to the landing slug, separate from the main funnel events.
- **Landing-hero A/B variants** — the hero image set is A/B-testable per slug via the first-party A/B framework (§15): [`PromoHero`](src/components/sections/promo/PromoHero.tsx) applies a per-slug `variantConfig.hero.imageSrcBySlug` override (each viewport independently optional), so one experiment can run across many toolset/evergreen landing slugs. The first such test — "variation 1 vs variation 2", seeded over 16 slugs (+ cash-prize) via [scripts/seed-variation1-vs-variation2-experiment.ts](scripts/seed-variation1-vs-variation2-experiment.ts) — has **concluded: variation 2 won** and its creatives were promoted to the default per-brand × toolbox hero sets in the manifest (commit `1d05e15c`, 2026-06-12). The manifest now ships only the default sets (per brand × toolbox, the all-prizes pair, and backgrounds); the `variation{1,2}-{desktop,mobile}` source folders are kept empty (`.gitkeep`) for the next hero test — drop new creatives in and re-run the seed script (it upserts the same draft) to launch one.

### 11b. How a landing page connects to the rest of the business

- The `AlternatingPromoMultiplier` rotation (§6a) drives the **headline number** on the landing page hero ("3× entries today").
- `ScheduledPromo` windows can flip a landing page's headline copy and multiplier automatically for the date range — no admin click required.
- `PromoLink` codes (§7b) are often the **CTA** on a landing page: the page sells the offer, the typed code at checkout proves the user came through the campaign and applies bonus entries.
- UTMs persist via `useUTMPersistence` + `src/utils/tracking/` and feed both Meta CAPI advanced matching and Klaviyo attribution.

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
- **Commission rates are admin-toggled, not a fixed published rate.** Admins set the percentage per affiliate in the admin UI — there is no global admin-set rate; a code-level default of 0.3 (30%) applies when none is provided (mirrored as the `Affiliate.commissionRate` schema default); `AffiliateCommission` rows are issued at the affiliate's configured rate on each qualifying purchase. This lets the business run different deals for different partners (e.g. a higher rate for high-volume creators) without code changes.
- Commissions are issued on **memberships, one-time packages, upsells, and mini-draw packs** (`AffiliateCommission` type: `one-time-package | upsell | membership-first | membership-recurring | mini-draw-package`). Only membership commissions **recur with each subscription renewal**: the first membership purchase issues a `membership-first` row, then each paid renewal invoice issues a `membership-recurring` row keyed by `stripeInvoiceId` (all other types are one-shot, keyed by payment intent) — there are dedicated backfill scripts (`backfill:affiliate-recurring-commissions`) to catch up any recurring rows missed by the live webhook flow.
- See [docs/affiliate/](docs/affiliate/).

### 13b. Referrals

- Refer-a-friend flow with `ReferralEvent` model, `lib/referral.ts`, and `ReferFriendModal`.
- **Reward structure**: when the referred user **makes their first purchase**, **both parties receive 100 entries into the current Major Draw** — 100 to the inviter *and* 100 to the referred user (`REFERRAL_REWARD_ENTRIES = 100`, awarded as both `referrerEntriesAwarded` and `referreeEntriesAwarded`; both lots are added directly to the active major draw, not to an accumulated-entries balance). The reward is not triggered by signup alone — the qualifying event is the referred user's actual purchase, so the inviter only profits when the platform does.
- See [docs/referrals/](docs/referrals/).

### 13c. Cancellation / retention flow

- `CancellationFlowModal` orchestrates a reason-routed retention waterfall before final cancellation, with **five** offer types (`OFFER_TYPES` in [src/models/CancellationFlowEvent.ts](src/models/CancellationFlowEvent.ts), all implemented): **pause** `pause_30d` (`RetentionPauseService`), **discount** `discount_50_2mo` (`RetentionDiscountService`), **marketing unsubscribe** `unsubscribe_marketing` (`RetentionUnsubscribeService`), **tier downgrade** `tier_downgrade` (hands off to the downgrade modal, which records the save on downgrade success), and **100 bonus entries** `bonus_entries_100` (`Step3BonusEntries` → the cancellation-upsell redeem endpoint). Pause, discount, and unsubscribe are accepted via `CancellationFlowService.acceptOffer`; tier-downgrade and bonus-entries complete through their own flows and record `outcome: "saved"` directly.
- **Retention offers are for members still *deciding* to cancel — a member already scheduled to cancel (`autoRenew` off / `cancel_at_period_end` true) is blocked from accepting either** (`retentionPauseBlockReason` / `retentionDiscountBlockReason` return a `409 "scheduled to cancel: …"`). Otherwise the pause/discount is silently overridden by Stripe cancelling at period end, recording a false "saved". Such a member un-cancels via the explicit **"Resume membership"** button (§10 `autoRenew` undo), not a cancel-flow offer. (The accept route does not re-validate eligibility, so these service-level guards are the backend backstop.)
- All steps emit `CancellationFlowEvent` for analytics.
- **Streak-stakes step (2026-07-15, spec §7b M3 — dark until the streak launch, gated on `DASHBOARD_FEATURES.loyaltyStreak`):** while live, every non-past-due member sees a Membership Streak stakes screen (`StepStakes`) between reason capture and the offer waterfall — ALWAYS shown, content adapting by streak depth (loss framing at streak ≥ 2 with the next milestone at stake; forward framing at 0/1 with the full ladder). The pause card gains a "your streak freezes" row. "Continue cancelling" is always visible. Instrumentation: `streakMonthsAtStart` is server-stamped on the event at start, and the screen exit is recorded via the new `stakes` action (`stakesAction: kept | continued`) — save-rate by streak depth comes from these fields (no A/B holdout: ALWAYS-shown was an owner mandate, so there is no variant to randomise).
- Stripe itself auto-resumes the retention pause at `resumes_at` (the member's next billing-cycle boundary = `period_end + 1 month`, set by `applyRetentionPause`). The `cancellation-retention-resume` cron then clears the stale `metadata.pauseReason: "retention"` marker once the window has elapsed or Stripe has already resumed (and defensively resumes any subscription Stripe hasn't), so a later §9d recovery pause isn't mistaken for a retention pause by `decideClearPause`. A separate maturity cron (`cancellation-retention-maturity`) is analytics-only: 90 days after a `saved` outcome it stamps the `CancellationFlowEvent` `retention90: retained | churned` — it never touches the subscription or Stripe. Early resume IS supported — a member can resume via the dashboard **"Resume now"** button (`POST /api/subscription/resume-pause`) and an admin via a **"Resume pause"** control (`POST /api/admin/users/[id]/resume-pause`, `users.cancelSubscription` permission); the return to active is payment-gated (Stripe bills on resume — a successful charge restores `active`, a failed one → `past_due`).

**Both the §9d recovery pause and the §13c retention pause are real Stripe `pause_collection`s — the difference is the `behavior` and a `metadata.pauseReason` tag, not "app vs Stripe."** This is the most-confused mechanic in the system, so to be clear: `applyRetentionPause` ([`RetentionPauseService`](src/services/subscription/RetentionPauseService.ts)) calls `stripe.subscriptions.update` with `pause_collection: { behavior: "void", resumes_at: period_end + 1 month }` and `metadata.pauseReason: "retention"`. The app-side `User.retentionOffersConsumed.pause30d` is only a **one-time "offer consumed" marker** (it gates whether the pause offer can be shown again and serves as the resume cron's candidate filter) — it is **not** where the pause state lives and it does **not** gate entries accrual or partner access.

|                          | §9d Stripe recovery pause                        | §13c Stripe retention pause                       |
| ------------------------ | ------------------------------------------------ | -------------------------------------------------- |
| **What it is**           | Stripe `pause_collection` (`behavior: keep_as_draft`) | Stripe `pause_collection` (`behavior: void`, `resumes_at: period_end + 1 month`) |
| **Why it exists**        | Recovery from *renewal failure* (involuntary)    | Churn prevention via *opt-in* offer (voluntary)   |
| **Stored where**         | Stripe `Subscription.pause_collection`           | Stripe `Subscription.pause_collection` + `metadata.pauseReason: "retention"` (the `keep_as_draft`/`void` behavior is the discriminator) |
| **Stripe status during** | unchanged                                        | unchanged                                          |
| **Entries during pause** | deferred, not lost — same no-paid-invoice mechanic (no renewal webhook → no new entries while paused), but `keep_as_draft` holds cycle invoices instead of discarding them and the failed invoice stays collectible, so the cycle's entries are granted when the recovery payment succeeds; existing accumulated entries untouched | suspended — `behavior: void` makes Stripe discard renewal invoices, so no paid invoice → no renewal webhook → no entries (existing accumulated entries likewise untouched) |
| **Resumed by**           | successful payment                               | Stripe auto-resume at `resumes_at` (next cycle boundary, `period_end + 1 month`); the `cancellation-retention-resume` cron defensively resumes if Stripe hasn't after the window, then clears the retention metadata. Early resume is also supported — member ("Resume now", `POST /api/subscription/resume-pause`) and admin ("Resume pause", `POST /api/admin/users/[id]/resume-pause`); resume is payment-gated (paid → `active`, failed → `past_due`). |

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
- **TikTok**: Pixel (client) **+ Events API CAPI (server-side, `src/lib/tiktok.ts`, v1.3 `event/track`, gated by `TIKTOK_ACCESS_TOKEN`, shared `event_id` dedup with the pixel — shipped 2026-05-22)**. _2026-07-24 hardening (panel review): the sender now uses the same `resilientFetch` transport as Meta CAPI (keep-alive-bounded dispatcher + bounded retry — TikTok dedups on `event_id`, so retry is safe) and logs undici cause codes instead of an opaque "fetch failed"; its three refusal guards (no creds · non-prod without a `test_event_code` · missing `event_id`) plus body-level failure handling are now covered by `npm run test:tiktok-capi-guards`. Browser page views on SPA navigation now fire TikTok's standard `ttq.page()` instead of a custom `track("PageView")` event._ _2026-07-29 match-quality fix (from TikTok's own Event Match Quality panel): the server payload was sending the **phone** identifier under the v1.2 / pixel-SDK key `phone_number`, which v1.3 silently discards — so every server-side TikTok event had gone out with **no phone at all** since launch (visible only as 0% phone coverage on `CompleteRegistration`, the one Events-API-only event; TikTok estimates +13% event matches from fixing it). Now sends `phone`, and additionally maps the six v1.3 identity fields already collected for Meta but never forwarded: hashed `first_name`/`last_name`/`zip_code` plus plaintext `city`/`state`/`country`. Separately, the webhook-fired **Purchase** now carries TikTok's click id: `capi_ttclid`/`capi_ttp` ride through Stripe metadata from all six payment-creation routes, mirroring Meta's existing `capi_fbc`/`capi_fbp` hand-off (the webhook has no cookies of its own)._ _2026-07-31 Event Match Quality repair (again from TikTok's EMQ panel, which reported **Click ID 0% on every server-side event** and **External ID 0–1% on InitiateCheckout / AddPaymentInfo**): four independent defects, all fixed. **(1)** The `ttclid` cookie was written only by a post-hydration browser script, so any visitor who bounced, blocked JS, or converted before hydration sent server events with no click id — it is now minted by **middleware on the landing request**, plus a URL fallback and a longer 7→90-day life. **(2)** Our cookie was named `ttclid`, colliding with a cookie TikTok's own pixel writes, making the server read non-deterministic — ours is now `ta_ttclid`. **(3)** Guest-fired events carried no user identifier at all; they now reuse the existing anonymous visitor id as `external_id`. **(4)** `RequestContext` carried the click ids at runtime but the TikTok payload builder only ever read them from `userData`, silently discarding them — a whole class of bug invisible to the type-checker, now closed. Four more payment routes (`renew-subscription`, `create-payment-intent`, `upgrade-subscription-payment`, `downgrade-subscription`) also began stamping the `capi_*` signals, closing the **Purchase IP/user-agent 85%** gap. **What the "0% click id" reading actually was — verified against production 2026-07-31, and it is NOT a total failure:** the cookie does reach the server (30-day: 29 TikTok payments resolved by click id vs Meta's 2,020; 6 TikTok-attributed signups vs Meta's 251), which against TikTok's own ~45 reported purchases is roughly 65–70% capture. The 0% is a **denominator effect** — we send these events for *all* traffic, and TikTok is ~0.5% of conversions, so a Meta or direct visitor has no TikTok click id in existence to send. **Click-id coverage therefore cannot be driven to 90% by code**; it rises only with TikTok's share of spend. The fixes raise the count of TikTok-sourced conversions that carry their click id, not the displayed percentage. The levers that do move the score on those four events are **External ID** (0–1% → ~100%, applies to every visitor) and **IP/user-agent** (85% → ~100% on Purchase). **Expected, not yet measured:** the score movement takes ~48h to appear. No customer-facing behaviour, price, or entry mechanic changes._
- **Snapchat**: client-side Pixel only (with `client_dedup_id` dedup); its CAPI sender is still a stub.
- **Unified conversions layer** — a single `CanonicalEvent` is dispatched to every platform's browser pixel **and** server-side CAPI through one registry ([`src/lib/tracking/`](src/lib/tracking/)): Meta and TikTok have server-side CAPI parity (Snapchat pixel-only), with shared advanced-matching enrichment and `event_id` browser↔CAPI dedup. Funnel events POST to `/api/tracking/conversion` → `sendConversion()`; per-provider CAPI is independently env-gated. Legacy per-vendor scripts (below) remain. _(2026-07-19: pixel bootstraps became imperative provider code instead of injected inline scripts — a CSP/perf mechanism change only; no platform gained or lost any capability, event, or timing guarantee.)_
- **Google Tag Manager**: `src/lib/gtm.ts`.
- **Klaviyo**: page tracker, script loader, transactional handoffs (`src/lib/klaviyo.ts`).
- **UTM persistence**: `useUTMPersistence` (`src/hooks/useUTMPersistence.ts`) → `src/utils/tracking/` (`utm-helpers.ts` / `utm-storage.ts` / `attribution-cookie.ts`) — sessionStorage plus first-touch and last-touch attribution cookies. `src/lib/utm/` holds only the Meta Ads Manager UTM template conventions (`META_ADS_UTM_TEMPLATE`), no persistence logic.

### 14b. Ad-platform analytics — server-side revenue live, ad-spend sync partial

> **Channels currently running (as of 2026-07):** the only live **paid** ad channel is **Meta / Facebook Ads**; the live **owned** channels are **Klaviyo email + SMS**. **TikTok Ads is launching soon** — its pixel/CAPI + per-ad spend code is complete and creds-gated (goes live when the TikTok env creds are set). _Status 2026-07-29 — **TikTok Marketing API is LIVE.** The developer app was approved with all four scopes, an advertiser access token was generated and verified against advertiser 7561254031700557840, and the first real sync landed **86 ad×day rows / 31 ads** (30-day window: **$1,305.45 spend · 45 TikTok-reported purchases · $1,024.93 TikTok-reported value · 0.79× platform ROAS**). Verification found two of three hard-coded metric assumptions were WRONG and fixed them: the purchase-value metric `total_complete_payment_value` does not exist (value is derived from `value_per_complete_payment × complete_payment`, cross-checked to 99.95% against TikTok’s own ROAS), and `conversion` is the ad group’s optimization event, not purchases — it read ~300× high, so the purchase count is `complete_payment`. Currency (AUD) and timezone (Australia/Sydney) were confirmed correct. Stored figures match the live API to the cent (`npm run verify:tiktok-readpath`). **Remaining to go live in production:** put the token in Vercel + the main folder’s .env.local, then run `npm run seed:tiktok-insights -- --days=60` against production._ **Google Ads is not in use** (the `google` platform slot is reserved for a future `gclid` capture; no Google spend/clicks flow today), and **Snapchat** is pixel-only. So today, a converting platform of `meta`, `klaviyo_email`, or `klaviyo_sms` covers essentially all *attributable* revenue; TikTok begins contributing once it launches.

- **TikTok / Snapchat tabs show server-side attributed revenue.** `TikTokAdsManagement.tsx` / `SnapchatAdsManagement.tsx` render an hour-of-day **revenue + conversions** breakdown from `convertingPlatform`-tagged `PaymentEvent`s (`/api/admin/analytics/hourly-revenue`). The client-side pixels fire independently, and **TikTok also fires server-side conversions** via the Events API (§14a).
- **Ad-spend sync — Meta + TikTok wired, Snapchat pending.** Meta drives true ROAS on the daily snapshot. **TikTok's Marketing-API hourly ad-spend** is also wired (`fetchTikTokHourlySpend` → the hourly Spend/Profit/ROAS columns), rendering as soon as `TIKTOK_ADVERTISER_ID` + `TIKTOK_MARKETING_ACCESS_TOKEN` are set (code is unverified against the live API and falls back to "—" without creds). **Snapchat has no Marketing-API spend client yet** — Snapchat spend/ROAS show "—" until then. The daily-insights *writer* now covers **Meta AND TikTok**: `TikTokAdInsightsDaily` is populated by `TikTokInsightsSyncService` via the nightly `/api/cron/sync-tiktok-ads` cron (ad-level `data_level=AUCTION_AD`), driving a **per-TikTok-ad breakdown** (ad name · spend · TikTok-reported conversions/revenue · ROAS) in the admin TikTok tab — the analogue of Meta's "Ads"/Spend-by-URL view (creds-gated + unverified against the live API, same stance as the hourly client). Only `SnapchatAdInsightsDaily` remains without a writer.
- **Facebook Ads Health — adset decision engine.** A per-adset rules engine ([`src/services/facebook-ads-health/`](src/services/facebook-ads-health/), admin "Facebook Ads" tab → `FacebookAdsHealthView`) that turns Meta reporting into a daily verdict — **SCALE / HOLD / INVESTIGATE / CUT** — for each adset, applying Meta's documented learning-phase thresholds (≥50 conversions/7d, learning-status buckets, Learning-Limited ≥3 days) against tunable settings (breakeven ROAS, target CPA, ROAS-drop trigger %, post-edit wait hours, zero-conversion spend multiplier). Emits the verdict + reason rows + a concrete action ("raise budget 20%", "pause and reallocate $X", "revert recent edit — do NOT pause"). Backed by routes `/api/admin/facebook-ads/health/{insights,settings,snooze}`, ~9 admin components, an account-level true-ROAS service, per-adset snooze, and 3 regression suites (`test:facebook-ads-health-verdict / -two-window / -missing-data`). The verdict-engine **insights and threshold settings are also mirrored read-only to Norm** (`facebook-ads.health.insights` / `facebook-ads.health.settings` in [`classification.ts`](src/lib/internal-norm/classification.ts)), with settings-update and snooze registered as roadmap `write_safe` entries in the registry (their routes are not wired yet — only the reads are live). (Not to be confused with the unrelated `/v1/health` gateway-liveness route.)
- **Klaviyo analytics tab** — campaign/flow revenue (Klaviyo-attributed, email/SMS split) + scheduled sends + server-side Klaviyo hourly, via the read-only Klaviyo Reporting API.
- **All Platforms tab** + **true-ROAS overview card** — combined ad-effectiveness rollup (true ROAS = server-side attributed revenue ÷ ad spend, contribution, conversions, hourly) across every channel, with a **Direct (unattributed)** row excluded from blended ROAS; the overview card shows server-side ROAS instead of Meta's pixel figure.
- **Packages-focus breakdown (2026-07-17)** — ad analytics now split Meta spend/ROAS by **landing-URL strategy**: membership-focus (default promo URL) vs one-time-focus (`?packages=one-time`, live since early July 2026). Surfaced as the Overview Ad Spend / ROAS KPI drill-down modal (campaign → ad-set → ad tree per bucket), the Prize Performance per-brand drill-down, and Facebook Ads → Spend by URL strip/chips/badges; mirrored to Norm (`analytics.packages-focus`). Revenue basis is Meta-reported (same as the ROAS KPI); the split is baked into the permanent daily aggregate (backfill script `backfill:packages-focus` covers the retained ~60-day window). Since 2026-07-17 these reads are **near-real-time**: the trailing 1–2 days self-refresh from Meta on view (5-min throttle, 12s time budget) instead of waiting for the 3-hourly sync cron, which now serves as the history/restatement backstop. TikTok shows an explicit "awaiting URL mapping" state until a TikTok ad→URL resolver ships. A capture-only seed also stamps the one-time marker onto real payments (`PaymentEvent.data.packagesFocus`) so a future true-ROAS-per-focus split can use actual Stripe revenue.
- **Page Analytics attribution repair (2026-07-31) — Klaviyo and TikTok were reporting zero.** The admin **Page Analytics** tab (promo landing-page funnel: visits → signups → conversions → revenue) grouped its channel table by the raw `utm_source` string. Visits matched case-**in**sensitively while signups and conversions matched case-**sensitively**, so a channel stored raw-cased showed real traffic against nothing else: production's `Klaviyo` (6,437 visits / 868 signups) and `TIKTOK` (1,399 / 194) each rendered **0 signups, 0 conversions, $0 revenue**. Everything now buckets by the same canonical `ConvertingPlatform` the rest of the attribution stack uses, applied identically to all three collections. Verified against production after the fix: **Klaviyo Email 500 signups / 240 conversions, Klaviyo SMS 358 / 236, TikTok 194 / 31**; `facebook.com` / `ig` / `fb` now fold into one "Facebook / Instagram" row (Meta reports one spend figure across both placements, so splitting revenue while spend stays merged would make ROAS uncomputable). Two related corrections to how this tab's numbers should be read: its **date filter was inert** (every requested range silently returned "today"), and its **"Builds" column measured exposure, not engagement** — 1,754 of 1,941 build rows carry zero interactions, so treat any earlier Builds figure as "saw a prize combination", not "changed one". This tab is also now clamped to the 90-day visit-retention window, so **it is a funnel, not a revenue ledger** — the Overview tab remains the full-history revenue source. No customer-facing behaviour, price, entry mechanic or third-party data flow changed. Detail: [docs/promo/backend.md](docs/promo/backend.md).
- **Paid-UTM cookie-gap recovery (2026-07-19).** Attribution is click/recency-based (`convertingPlatform`), but the edge resolver is cookie-only — when the attribution cookie is missing at payment time (in-app-browser signup → external-browser checkout, Safari ITP), a fresh paid touch used to be bucketed **Direct**. The webhook reconcile now recovers a **signup-anchored** paid-platform UTM when the purchase is affirmatively within the platform's click window (7d Meta/TikTok/Snap) of the **captured ad visit** (`signupAttribution.visitedAt`; account-creation date only as legacy fallback — anchoring on account age wrongly buried returning members converting off BOF retargeting ads). Session-carried UTMs are undatable (the 90-day first-touch cookie strips its capture date; renewals re-carry frozen metadata) and always stay Direct — stale paid touches are never resurrected and renewals never flip. Effect: conversions within 7 days of a paid ad visit — new members AND returning members re-engaged by retargeting — now credit the platform (raising attributed revenue/ROAS); the Direct bucket shrinks by exactly that cohort (272 Direct rows in the prior 30d carried a paid utm_source at time of fix).

Models for daily insights (`MetaAdInsightsDaily`, `TikTokAdInsightsDaily`, `SnapchatAdInsightsDaily`) all exist; the daily-insights writer now covers **Meta + TikTok** (`TikTokAdInsightsDaily` written nightly by `/api/cron/sync-tiktok-ads`), with **Snapchat** still writer-less. TikTok ad-spend is available both hour-of-day (live hourly client) and per-ad (daily writer → admin breakdown).

### 14c. Klaviyo lifecycle flows

The platform doesn't only ship transactional email through SendGrid — it also syncs **lifecycle state** to Klaviyo so marketing flows can fire based on the §10 state machine.

- **Past-due profile sync** — `sync:klaviyo-past-due` ([scripts/sync-klaviyo-past-due-profiles.ts](scripts/sync-klaviyo-past-due-profiles.ts), `:dry` variant available) pushes the current `past_due` cohort into a Klaviyo segment so payment-recovery flows target the right people.
- **Renewal-entries preview** — Klaviyo sees how many entries a user's *next* renewal will grant, via `klaviyo-renewal-entries-preview` ([src/utils/integrations/klaviyo/](src/utils/integrations/klaviyo/), test: `npm run test:klaviyo-renewal-preview`).
- **Cancellation-flow signals** — `CancellationFlowEvent` rows (see §13c) feed comeback flows targeted at the `cancelled-members` audience used by `PromoLink` (§7b).
- **Canonical membership-state profile feed** (shipped 2026-05-28) — every server-side profile sync (`ensureUserProfileSynced`, fired by Stripe webhooks, payment/cancellation flows, auth/setup) re-pushes **5 canonical Klaviyo properties**: `membership_status` (active / past_due / canceled / never_subscribed, derived from Stripe state), `entries_purchased`, `giveaways_entered`, `membership_active_duration_months`, `next_renewal_date`. This continuously-updated profile store lets the ads team self-serve segments (e.g. "purchased entries but no membership", "at-risk near renewal") without per-flow engineering. Backfill: `scripts/backfill-klaviyo-membership-properties.ts`.
- **Abandoned-checkout recovery** (shipped 2026-05-28) — a `Started Checkout` event (`createStartedCheckoutEvent`) fires when a user begins a membership/pack purchase (client-side at plan-select — the "Enter Now" click — for authed users via `MembershipSection.handlePlanSelect`; server-side from `/api/auth/register` after guest step-1 registration; plus a guest-only client fallback at payment-submit in the MembershipModal for the persisted-`guestUserData` edge case). The Klaviyo email's CTA carries a one-click resume deep link (`?openMembership=1&packageId=<id>`, built by `buildCheckoutResumeUrl`); on return, `useMembershipModalDeepLink` (mounted in `MembershipSection`) **auto-reopens the MembershipModal with that exact tier preselected**. A revenue-recovery funnel, not just tracking.
- **Viewed-Giveaway retargeting** (shipped 2026-05-28) — a `Viewed Giveaway` event (`createViewedGiveawayEvent`, fired by `PromoViewTracking` on `/promotions/<slug>` pages) carries rich template properties (promo title, prize name, prize image, promo URL) so a Klaviyo-side "viewed promo but didn't enter" flow can retarget paid-traffic visitors who clicked an ad but didn't convert (ties into the §11 surface).
- **Placed Order** events are tagged with `is_renewal` + `billing_reason`, so renewal revenue is distinguishable from first-purchase revenue in Klaviyo flows/segments.
- This is the same Klaviyo property store that the **client-side Klaviyo page tracker** (§14a) writes to, so identification stays consistent across server-side syncs and browser events.

**Failed-payment email cadence is entirely Klaviyo-side, not SendGrid.** On `invoice.payment_failed`, [`handleInvoicePaymentFailed`](src/services/stripe-webhook-handlers/index.ts) fires one of two Klaviyo events per failed invoice: `Subscription Renewal Failed` (renewals, `billing_reason: subscription_cycle`) or `Subscription Payment Failed` (initial payments and other billing reasons). The separate `Payment Failed` event fires from `handlePaymentFailure` on `payment_intent.payment_failed`, and only for non-subscription payments (one-time / mini-draw / upsell). **No SendGrid template** is sent directly from the webhook (`grep` against `src/lib/email/**` for these names returns zero matches; the HTML preview at `email-templates/klaviyo/subscription-payment-failed-email-template.html` is explicitly the **Klaviyo** template, per the preview component comment). Cadence — day 1 vs day 3 vs day 7 follow-ups — is configured **in Klaviyo flows**, not in code. The in-app §10e `RenewalFailedModal` is the user-side prompt that runs in parallel with whatever the Klaviyo flow is sending.

---

## 15. Other major systems

- **A/B testing** — full first-party framework. Services, components, hooks, repositories, models, `/api/ab-testing` routes. See [docs/ab-testing/](docs/ab-testing/).
- **Email** — SendGrid for transactional (code-as-source in `src/lib/email/`), Klaviyo for marketing (paste-ready HTML in `email-templates/klaviyo/`), preview UI at `/email-preview`, SMS via `src/lib/sms.ts` (Twilio).
- **Admin dashboard** — user management, payments, draws, promos, error reports, partner applications, Stripe webhook queue, dashboard stats daily snapshots (+ cycle-anchored Renewal Rate KPI), charge-past-due tool, blocked transactions / allowlist, demographic/age + profession-cleanup metrics, plus the **Analytics tab group** (All Platforms, Facebook Ads incl. **Facebook Ads Health** §14b, TikTok Ads, Snapchat Ads, Klaviyo, Page Analytics, Cancellation Flow, **Repeat Purchases** — one-time-pack reconversion analytics: repeat rate, first→second-purchase gap buckets (same-day → 180d+), became-members count; refund-netted, excludes upsells/mini-draws/renewals; users drill-down with clickable bucket filters + CSV export; summary mirrored read-only to Norm as `analytics.repeat-purchases` — and A/B Testing). See [docs/admin/](docs/admin/).
- **Staff roles & permissions (RBAC)** — admin access is no longer an all-or-nothing flag. Each user carries a `userType` of `customer` / `staff` / `admin` plus an optional `roleId` ([src/models/User.ts](src/models/User.ts)). Permissions are a hardcoded catalog of **50 actions across 17 areas** ([`src/lib/permissions.ts`](src/lib/permissions.ts) `AREA_ACTIONS`) — money-moving and irreversible actions (`users.charge`, `users.refund`, `users.cancelSubscription`, `users.delete`, `majorDraw.selectWinner`, `affiliates.processPayout`) are each their own permission, so a role can grant edit access without granting them. Permissions bundle into named roles ([src/models/Role.ts](src/models/Role.ts)); admin is the implicit super-role, while custom staff roles (e.g. an Ads Manager) get a filtered admin panel and are walled off from customer-purchase flows. Routes are gated via `requirePermission()` rather than ad-hoc `role === "admin"` checks. **Two catalog notes (2026-07-31):** the three Page Analytics routes moved from `promos.view` to `pageAnalytics.view` so the API matches the tab's own gate — latent, not breaking, since production holds only Admin, Manager and Customer Support (there is **no Ads Manager role in production** despite the seed template) and both Admin and Manager held `promos.view`. And the inert `promoAnalytics.view` permission was **retired entirely** — it was checked by zero routes and gated zero tabs, so an owner could have revoked it believing it locked down promo analytics with no effect. Retirement ran in the required order on 2026-07-31: `npm run migrate:promo-analytics-cleanup[:prod]` stripped the string from stored roles in both clusters first (`Role` validation rejects unknown permission strings, so the reverse order would break role saves), then the catalog entry, its `PERMISSION_META` row and the `Ads Manager` seed bundle were removed. **Customer PII is a separate grant from the customer list (2026-08-13):** `users.view` used to gate both the roster *and* the detail modal behind it, so any role that could browse customers could also read every customer's email, mobile, address and payment history. The modal's reads now require a new **`users.viewDetail`** (`GET /api/admin/users/[id]`, plus the modal-only `payment-events`, `deletion-summary` and `charge-past-due` previews, and the matching Norm registry entries); `users.view` is now list-only. This makes a **triage role** possible — browse and search the customer list, resolve nothing personal — which the catalog previously could not express. Because a new catalog action is **not** auto-granted to existing custom roles, `npm run migrate:backfill-users-view-detail` grants `users.viewDetail` to every role that already held `users.view`, so the split ships as a **no-op** and is then narrowed deliberately per role in Settings → Roles. See [docs/auth/roles.md](docs/auth/roles.md) and [docs/auth/permissions-catalog.md](docs/auth/permissions-catalog.md). **Mini-draw entrant PII is likewise its own grant (2026-08-13):** `miniDraws.view` used to gate the draw list *and* `GET /api/admin/mini-draw/[id]/export` — a CSV/Excel dump of every entrant's name, email, mobile and state. A new **`miniDraws.viewParticipants`** now gates that export **and** the new in-app participants roster (`GET /api/admin/mini-draw/[id]/participants`), which lets staff check who entered without downloading a spreadsheet of live customer data; `miniDraws.view` is now lineup-only. The two reads move together permanently — they return identical data and differ only in pagination. Shipped with `npm run migrate:backfill-mini-draws-participants` so, as with `users.viewDetail`, the carve-out lands as a no-op for existing roles and is narrowed deliberately afterwards. The Norm `mini-draw.export` entry deliberately stays on `miniDraws.view`: its projection is aggregate-only (participant counts + per-state breakdown, no per-user PII). **The revenue ledger is its own area too (2026-08-17):** a new admin **Receipts** tab (Billing group) lists every payment the business has received — membership purchases and renewals, one-time and additional packs, mini draws, upsells, and shop orders once the shop launches — each row joined to the customer who paid, its refund state, and a link to the Stripe object behind it. It is an internal reporting view only: it reads existing `PaymentEvent` / `Order` data and changes no pricing, entry, draw or billing rule. Rather than reuse the `settings.view` its Billing-group neighbours share, it adds **`receipts.view`** (the tab + `GET /api/admin/receipts`) and **`receipts.export`** (the CSV, marked dangerous) — because a complete revenue history joined to customer names and emails is exactly the kind of surface this catalog already carves out, and downloading it as a file is a distinct risk from reading it on screen. Shipped with `npm run migrate:backfill-receipts-view` so, as with `users.viewDetail` and `miniDraws.viewParticipants`, the new grant lands as a no-op for roles that could already see the Billing group; `receipts.export` is deliberately NOT backfilled and is handed out per role in Settings → Roles. Its totals are net of refunds and reconcile exactly with the existing dashboard revenue figures (the only difference being that Receipts includes membership renewals, which the dashboard's *acquisition* revenue excludes). It **is** mirrored to Norm (`GET /v1/receipts`, gated on `receipts.view`), and that mirror carries a deliberate exception to the usual PII boundary: it returns the customer's **email** alongside firstName + opaque userId, where every other Norm read stops at firstName. That was an explicit owner decision on 2026-08-17 so a named customer's payment history is answerable in one call; last name and the Stripe customer id are still withheld. It is recorded in the schema, in `docs/internal-norm/norm-context.md` and here so it stays a visible choice rather than quiet drift. See [docs/admin/receipts.md](docs/admin/receipts.md). This is the same role-based system the Internal Norm bullet (below) relies on to secure the external-AI gateway.
- **Staff invite + audit** — owner/admins invite a team member by email + role (`POST /api/admin/staff`, gated by `settings.edit`), which creates an inactive user with a single-use invite token (7-day TTL) and sends a SendGrid invite email; the invitee sets a password at the public `/staff-setup/[token]` page. Removal reverts the user to `customer`, clears `roleId`, and forces sign-out — the row is kept for audit, never deleted — and a **removed staffer can be re-invited under any role** (the invite converts the inactive former-staff row back into a pending staff invite; active accounts and never-staff customers can't be converted; 2026-07-09). Admins can also **edit a staff member's display name** from the Team page. Every meaningful staff mutation (and every blocked 403 attempt by a logged-in staffer) is recorded in the **`StaffActivity`** audit log via `requirePermissionWithAudit` (wired into 60+ admin routes incl. force-charge, refund reversal, cancel-subscription, winner selection), snapshotting actor email/role-name + action/method/path/resource/status, with a 180-day TTL. Surfaced behind the `audit.view` permission (incl. a per-user "Staff actions" tab). Distinct from the Stripe allowlist audit (§12a/§12c).
- **Internal Norm API** — HMAC-signed HTTP namespace at `/api/internal/norm/v1/*` exposing **read-only** admin data to an external AI assistant ("Norm") running on a Mac mini server — ~95 endpoints spanning ROAS + dashboard stats, revenue/metrics analytics, users (search, export, payment events, past-due previews), major & mini draws, winners, promos + promo analytics, Klaviyo, A/B testing, affiliates, error reports, allowlist, Stripe webhook queue, monthly coupons, and the staff activity log. The endpoint registry ([`src/lib/internal-norm/classification.ts`](src/lib/internal-norm/classification.ts)) also defines a four-tier action model (`read` / `write_safe` / `trigger_norm_confirm` / `trigger_human_approve`) that pre-classifies future write actions (A/B-test edits, winner selection, past-due charges), but **no write/trigger endpoint is wired yet** — every live handler is a read. Governed by the role-based permissions system above (Norm runs as its own service user + Role). See [docs/internal-norm/](docs/internal-norm/).
- **Error reporting** — first-party `ErrorReport` Mongo model + admin routes. Do not bolt on a parallel logger. See [docs/error-reporting/](docs/error-reporting/).
- **Security / CSP** — per-request nonce in `src/middleware.ts`, CSP assembled in `src/utils/security/csp.ts`, static fallback in `next.config.ts`. Stripe webhook route has special headers (no COEP). See [docs/security-csp/](docs/security-csp/).
- **DST / timezone** — billing logic uses `date-fns-tz`; there are DST-transition test scripts under `scripts/test-dst-transitions.ts` and `TESTING-TIMEZONE-DST.md` covers the edge cases.

---

## 16. Coming soon — what's on the roadmap

| Item                                    | Status                                       | Notes                                                                          |
| --------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| **Shop**                                | Scaffolded, page renders *Coming Soon*       | Products, Orders, Cart, brand/product pages all built. Shop discount lines per tier already in data, intentionally hidden until launch. |
| **Partner Discount API @ 1,000+ brands** | Partly delivered — 1,833 offers live via the portal | The **breadth** shipped through the iGoDirect portal (1,833 curated offers, tier-gated). What is still outstanding is the *original* plan: our own DB-backed catalog with admin CRUD + a public API, so we are not dependent on a vendor's UI. The audit is the argument for it — we cannot badge entitlement, filter by "available to me", or read a single redemption back today. **Catalogue fit is also unresolved:** Milwaukee, DeWalt, Makita and Ryobi return **zero** offers, so member-facing copy must not claim tool brands (see [docs/partner/rules.md](docs/partner/rules.md) R8). |
| **Partner portal (SSO)**                | ✅ **LIVE in production (2026-07-31)**        | Moved out of "coming soon": both `PARTNER_DISCOUNT_SSO_ENABLED` and its `NEXT_PUBLIC_` twin are set in Vercel and the flow was walked end-to-end on production on 2026-07-31 (the route 404s if the flag is unset, so a successful hand-off is proof it is on). The dashboard-hero "Partner portal" button + the Rewards-page "Open partner portal" button mint a single-use 60-minute token into `myrewards.toolsaustralia.com.au`. **Known live issue — vendor-side:** the portal renders locked and unlocked offers identically, so a Tradie meets a 68%-locked home page with nothing marked; see the audit + the 16 vendor asks in [docs/partner/igodirect-portal-ux-audit.md](docs/partner/igodirect-portal-ux-audit.md). Our side now states the tier, the real unlocked count, and what to expect before the hand-off. |
| **Membership Streak (loyalty streak)**  | Backend + UI built; **dark until the launch runbook** | Consecutive paid renewals earn escalating **free entries** auto-granted into the Major Draw: rungs at renewals 2/4/6/8/10/12 → +100…+600 + permanent Founding-member badge, and the **full ladder repeats every streak year** (month 14 ≡ month 2 → +100 again … month 24 ≡ month 12 → +600) — flat across tiers, join = month 0. **P1 (counter + backfill), P2 (milestone engine: `streak-months` type, autoGrant into a first-class `streak` entry bucket, generation-scoped re-earn), and P3 (the tier-tinted medallion dashboard card, milestones track, wallet Streak segment, guest teaser, celebration toast) built 2026-07-07; adversarial-review hardening 2026-07-15** (resubscribe/renew routes carry the streak across the subdoc replacement with in-route grace/reset decisions; a refunded counted renewal decrements the counter and flips its ledger row to `refunded`; new streak issuances are strictly payment-coupled — the cron/mass evaluator can only re-deliver failed grants, never newly issue; failed auto-grants compensate and re-open for retry). `DASHBOARD_FEATURES.loyaltyStreak`/`milestoneProgress` are **OFF** so the UI never promises grants that aren't active yet (local dev preview via `NEXT_PUBLIC_DASHBOARD_STREAK_PREVIEW=true` in `.env.local`; dev-DB rehearsal of the full runbook completed 2026-07-15). Launch runbook (in order, after this code deploys): 1) `npx tsx scripts/backfill-membership-streaks.ts --live --roundup-incomplete` (round-up flag is LAUNCH-ONLY; standing repair runs omit it) → 2) `npm run seed:streak-rewards` (legacy-issuance generation stamp + index swap + dark rungs + markers) → 3) `npx tsx scripts/seed-streak-milestone-rewards.ts --live --activate` → 4) flip both `DASHBOARD_FEATURES` flags to true and deploy. Cobber FAQ ids 69–71 cover the feature. Design: `claudeDesign/Membership milestone streak design`. Spec: [docs/superpowers/specs/2026-07-07-membership-streak-design.md](docs/superpowers/specs/2026-07-07-membership-streak-design.md). |
| **Loyalty milestones (progress)**       | Built, dark (launches with the streak)       | Distinct from the streak card above: the Rewards-page milestones section + the home dashboard's "Milestones" quick-tile are gated behind `DASHBOARD_FEATURES.milestoneProgress` ([`src/config/dashboardFeatures.ts`](src/config/dashboardFeatures.ts)); the section renders the real streak ladder (per-rung +N amounts from `streakMilestones.ts`) and flips on at streak-launch step 4 alongside `loyaltyStreak`. |
| **TikTok Ads insights sync**            | Pixel + server-side CAPI live; hourly **and per-ad daily** ad-spend built, creds-gated | Events API (CAPI) ships via the conversion registry (§14a). Marketing-API ad-spend is now wired both **hour-of-day** (`fetchTikTokHourlySpend`) and **per-ad daily** (`fetchTikTokAdInsightsDaily` → `TikTokInsightsSyncService` → `TikTokAdInsightsDaily`, nightly `/api/cron/sync-tiktok-ads`) — the latter drives the admin **per-TikTok-ad breakdown** (ad name · spend · TikTok-reported conv/revenue · ROAS). The daily-insights writer (previously outstanding) now ships; only live `TIKTOK_ADVERTISER_ID` + `TIKTOK_MARKETING_ACCESS_TOKEN` + verification against the live API remain. |
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
- **`paused`** — app-owned subscription state for the 30-day `pause_30d` retention offer (§10a, §13c). Period-end-anchored freeze (`pausedFrom`/`pausedUntil` = period end / period end + 1 month, the next billing-cycle boundary): no charge or access while frozen, but already-earned entries are kept; Stripe stays `active` under the `pause_collection`, so the app owns the state and auto-bills the next cycle on resume. Not a Stripe-native status.
- **`previousSubscription`** — on-User cache holding the *old* package's benefits during a downgrade's grace period (until cycle end).
- **`pendingChange`** — on-User cache holding the *new* package on an upgrade that's still awaiting payment confirmation.
- **Past-due** — Stripe status `past_due`. The customer-facing recovery path is the `RenewalFailedModal` (§10e); the admin-side counterpart is the force-charge tool (§9e).
- **Allowlist** — a Stripe Radar value list of card fingerprints we trust enough to bypass auto-block. Audited in Mongo via `AllowlistAction`; Stripe is the source of truth.
- **Blocked transaction** — a Mongo row mirroring a Stripe-blocked charge attempt; admins review and either allowlist or dismiss.
- **Promo landing page** — a paid-traffic landing surface with its own hero, banner copy, FAQs, and trust bar — separate from the homepage and driven by the §6a multiplier system.
- **Mini-draw pack ladder** — the 3-guest + 5-additional pack structure introduced 2026-05-14 (see §3b).
- **TicketEntry** — legacy per-ticket collection (historical mini-draw rows only; no live path creates new rows). Live entry pools are aggregated per-user counts on `MiniDraw.entries[]` / `MajorDraw.entries[]`. See §3e.
- **Carry-forward** — subscription entries accumulate month-to-month while active. One-Time pack and Mini Pack entries do **not** carry forward.
- **`autoRenew` toggle** — soft-cancel shortcut; calls Stripe `cancel_at_period_end: true`. Same effect as the §13c cancel flow; re-enable any time to undo (re-enabling an *unexpired* subscription mid-cycle).
- **Reactivate / Resubscribe** — `POST /api/stripe/renew-subscription` for a lapsed member (§10i). *Reactivate* uncancels a `canceled` sub still within a 30-day grace window — **same-tier only**, no charge (`REACTIVATE_TIER_CHANGE_NOT_ALLOWED` if a different tier is requested). *Resubscribe* (`create_new`) builds a fresh anchored subscription for a fully-expired member, via a tier picker that preserves accumulated-entries history. Distinct from the `autoRenew` mid-cycle undo and from §10e past-due payment recovery.
- **Refund policy** — memberships are non-refundable once purchased (Terms §4); no pro-rate refunds; ACL rights preserved (§9h).
- **`EntryWallet`** — the primary ROI card on the member dashboard: entries this cycle (membership + one-time) and the countdown to the draw date (§10h). Replaced `MajorDrawOverview`, removed in the 2026-07 revamp.
- **Partner access %** — the fraction of the partner-brand catalog a tier can see; today 50/75/100% for subscriptions, 25–100% for one-time packs (time-limited).
- **Freeze period** — the **30 minutes between 8:00 PM and 8:30 PM AEST/AEDT** on the 27th when the current draw is in `frozen` state and entries are locked. Subset of the broader "purchase blackout window."
- **Purchase blackout window** — the **full ~4 hours from 8:00 PM (27th) to 12:00 AM (28th)** during which new-entry purchases return 403 `GATES_CLOSED`: the 30-min freeze followed by the **gap period** (8:30 PM–midnight) when the previous draw is `completed` and the next is still `queued`. Renewals processed in this window route to the next cycle's pool. See §3a.
- **Gap period** — the **~3h 30min between draw end (8:30 PM) and next-draw activation (12:00 AM)** when no draw has `status: "active"`. New-entry purchases are blocked; renewals route to the next draw via `getTargetMajorDraw`'s explicit gap branch.
- **Ledger pattern** — `PaymentEvent` records of benefit grants/reversals, so refunds can replay the ledger backward.
- **Past-due** — subscription state when Stripe has failed to collect; recoverable via the admin tool or auto-recovery on next successful charge.
