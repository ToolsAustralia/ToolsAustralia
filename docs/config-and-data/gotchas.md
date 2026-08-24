# Config & Data — Gotchas

## Two upgrade FAQs asserted "your billing cycle resets to today" (2026-08-24)

Cobber ids **22** and **51** both stated flatly that upgrading resets the billing cycle to the
upgrade date. That became wrong for anchored members when the trial-aware upgrade shipped: a member
anchored to the 24th is charged today but **keeps their renewal day**. Both answers now qualify the
reset rather than asserting it unconditionally. Corpus size is unchanged (no ids added or removed),
so the `faqs.test.ts` count assertion did not move.

**id51's closing advice was actively harmful and was reversed.** It ended with *"it's usually best to
upgrade close to your renewal date"* — which, for the anchored cohort, steered members straight into
the double-charge window the 14-day floor now guards (pay a full month, get billed again days later).
It now explains the floor and says the opposite: the later in the cycle you upgrade, the more of the
old tier you leave behind. **A copy edit that survives a code change is not automatically still
true** — re-read the *whole* answer, not just the clause you came to fix.

Re-run `npm run build:chat-knowledge-pack` then `npm run test:chat-faqs` after any corpus edit —
the generated pack in `src/generated/chatKnowledgePack.ts` is what Cobber actually answers from, and
an un-rebuilt pack leaves it reciting the old copy. Background:
[BUSINESS.md §9b/§10c](../../BUSINESS.md), [subscription/gotchas.md](../subscription/gotchas.md).

## Cobber FAQ corpus is now 68 entries — knowledge-gap batch (2026-07-15)

`supportChatFaqs.ts` grew **39 → 68** with the knowledge-gap batch: ids **40-68** cover referrals/affiliate (40-43), account+auth (44-46), promo codes & the after-checkout offer (47-50), upgrade/downgrade/anchor billing (51-53), past-due lifecycle (54-59), advanced partner discounts (60-62), and mini-draws/prizes (63-68). id24 was **extended** (reactivation timing/grace window), not added. `faqs.test.ts` count assertion bumped 39 → **68** (+ an **id54** guard).

**The accuracy fix:** id54 ("I'm past due and want to cancel — do I keep access?") states the correct rule — a **past-due cancel is IMMEDIATE** (no end-of-period access), unlike a normal cancellation. It is routed **ahead of** the broad id13 "past due" decision-tree rule (Layer 1 short-circuits Layer 2, so a specific FAQ that shares a token with a broad rule is unreachable unless its rule is placed first).

Four of the new entries are **account-aware** (40 referral link, 55 catch-up billing, 62 partner-window 'upcoming', 68 mini-draw entries) — they recite no personal data and have a matching note in the systemPrompt ACCOUNT SELF-SERVICE MAP.

After editing the corpus run `npm run build:chat-knowledge-pack`, then `npm run test:chat-faqs` / `test:chat-routing` / `test:chat-routing-shape` / `test:chat-deflection`. Full context + the account-state pattern + the Layer-1-precedence rule: [docs/ai-chatbot/gotchas.md](../ai-chatbot/gotchas.md).

## FAQ corpus: entry framing only — no "odds" / "chance" (compliance, 2026-07-08)

`supportChatFaqs.ts` is customer-facing (Cobber). It must use **entry** framing, never gambling/probability framing, and must never call it a **lottery / lotto / raffle / sweepstake / gambling** — it's a giveaway. Forbidden: "odds", "chance(s)", "boost your chances", "increase your chance", "better odds", "lottery", "raffle", "gambl…", "wager"; allowed: "giveaway", "prize draw", "free entries", "{n}× entries", "more entries", "a purchase **adds** entries". This is a game-of-chance trade promotion (see BUSINESS.md §1). **Entries are also never sold on their own** — the product bought is the membership/pack, and entries are a **free inclusion** ("the $25 pack includes 3 free entries", never "$25 for 3 entries"); the guard also bans "buy/sell/purchase entries" and "per entry". `npm run test:chat-faqs` ([faqs.test.ts](../../src/data/__tests__/faqs.test.ts)) now asserts the corpus contains none of the banned words, and the system prompt has a matching HARD RULE so LLM paraphrases stay compliant. After editing the corpus, run `npm run build:chat-knowledge-pack`. Full context: [docs/ai-chatbot/gotchas.md](../ai-chatbot/gotchas.md).

## FAQ renewal date is NOT a blanket "24th" (anchor-24 nuance)

The chatbot FAQ corpus (`supportChatFaqs.ts`) must NOT say "subscriptions renew on the 24th of each month" — that over-generalises. Per `docs/BILLING_ANCHOR_24.md`, **only members who join on the 25th/26th/27th are anchored to renew on the 24th**; everyone else renews on their own monthly billing date (their signup day-of-month), and past-due recoveries reanchor to the recovery date (clamped to the 24th). The accurate FAQ wording is "renews monthly on your own billing date; 25th–27th joiners are anchored to the 24th" and points members to **My Account → Membership** for their exact date (the old "Settings → Subscription" tab was removed 2026-07). Corrected 2026-06-25 (also propagated to the chat knowledge pack + systemPrompt).

## Sample data leaking to prod

`sampleProducts.ts` etc. are fixtures. If a production code path references them as a fallback (e.g. "if Mongo is down, use sample data"), real users see fake products. Audit fallback paths.

## Package config dual-source drift

`membershipPackages.ts` (code) AND `MembershipPackage` (Mongo) — both must be updated when adding a package. Drift = UI shows different prices than Stripe charges, or unknown package errors.

## Constants vs config confusion

Z-index in `constants/`? Yes (never changes mid-runtime). Feature flag in `config/`? Yes (might change between environments). Mixing them up = confusing imports.

## Tree-shaking on client

Importing one constant from `data/index.ts` may pull in the whole barrel file. Verify your bundle if data files grow large.

## Legal copy review

If you change a constant in `legal.ts`, legal team must review before merge. Treat as a special category.

## Terminology: `isAdditional` (was `isMemberOnly`) — 2026-07-01

The package flag `isMemberOnly` was renamed to **`isAdditional`** across the codebase. It marks packages that require *additional-package access* — an **active subscription OR current major-draw entries** (see `hasAdditionalPackageAccess`), which is broader than subscribers; it was never truly "member-only". The internal `-member` UI id-suffix (a row disambiguator) is intentionally unchanged. Full rationale: [subscription/gotchas.md](../subscription/gotchas.md).

## A combo's `gallery[0]` is the hero everywhere — a fallback left there ships as the product shot (2026-08-06)

`prize-summaries.ts` had `ryobi-gearwrench` pointing `gallery[0]` at
`toolbox/gearwrenchTB.webp` — the **standalone** GearWrench box, no Ryobi tools in shot — as a
placeholder from draw 9, when that one composite had not been photographed. The composite
(`ryobi-set/ryobi-gearwrench.webp`) later shipped to `public/`, but the config was never
repointed, so for weeks the `/membership` prize carousel showed 19 full lifestyle builds and
one bare toolbox, captioned as if it were the same kind of thing.

Two lessons:

- **`gallery[0]` is not "the first picture", it is THE hero** — it is what every carousel,
  card and preview reaches for. A placeholder parked there is customer-facing, not internal.
- **Adding the file is only half the change.** `public/` and the config drift independently:
  nothing type-checks a `src:` string against the filesystem, and the entry looked complete.
  When combo art lands, repoint `gallery[0]` **and** `cardBackgroundImage` in the same commit,
  and check the new asset matches its siblings' geometry — this one was 1000×1000 square
  against the other 19 at 1600×1200, so `object-contain` also shrank it to ~75% width
  mid-carousel.

`COMBOS_AWAITING_COMBO_ART` (`prize-builder-model.ts`) is the *intended* home for this state
and is keyed per COMBINATION, not per toolbox. It is currently empty and every one of the 20
combos has its own composite — keep the mechanism for the next toolbox/toolset addition, but
do not park a placeholder in `gallery[0]` instead of using it.

---

## `miniDrawPackages` ids are two unrelated families — match the catalogue, never a string shape (2026-08-20)

`src/data/miniDrawPackages.ts` holds **13** purchasable ids in two families that share no prefix or suffix:

- `mini-pack-1` … `mini-pack-8` (tiers 4–8 are `isActive: false`, kept so historical receipts resolve)
- `additional-{tradie,foreman,boss,power,vip}-pack-mini` (added 2026-05-14)

Anything deciding "is this a mini-draw package?" must test **membership of the array** — `isMiniDrawPackageId()`. A `startsWith("mini-pack-")` rule misses all five `additional-*` ids; an `endsWith("-mini")` rule misses all eight `mini-pack-N` ids. Both silently stop covering a 14th pack.

This matters because the answer gates money: the Stripe one-time routes reject these ids (they cannot supply `miniDrawId`), so a **false negative re-opens a charge-with-no-grant hole** and a **false positive 400s a real purchase**. See [billing-stripe/gotchas.md](../billing-stripe/gotchas.md).

Two near-misses the predicate deliberately gets right:

- `additional-vip-pack` (membership, **sellable** on the one-time routes) vs `additional-vip-pack-mini` (mini, **rejected**) — one suffix apart. Verified: **zero id collisions** between `miniDrawPackages` and `membershipPackages`.
- The mini **upsell** ids (`mini-pack-N-upgrade`, `mini-upsell-additional-*`) are **not** matched — they belong to `/api/upsell/purchase`, which resolves `miniDrawId` from purchase history.

`normalizeMembershipPlanId` strips only `-member`, so `-mini` survives it and raw/canonical forms agree. The existing-user route checks both anyway, and `npm run test:mini-draw-package-id` fails loudly if that ever changes.
