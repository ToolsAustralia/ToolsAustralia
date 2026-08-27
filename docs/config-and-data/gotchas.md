# Config & Data — Gotchas

## The bonus-code FAQs asserted an 11:59pm deadline — and the TEST required it (2026-08-26)

Cobber ids **86** and **87** were rewritten in place for the bonus-code webhook rework. Corpus size
is unchanged at **90** (no ids added or removed), so the `faqs.test.ts` count assertion did not move.

- **id 86** said the deadline "always runs to 11:59pm Sydney time on that day." True only under the
  deleted calendar-day model. A bonus code now expires an exact **72 hours** after the instant it was
  issued, so it runs out at whatever time of day that lands on. The answer now says so.
  **Second correction, final review (2026-08-26):** the first rewrite replaced the 11:59pm promise
  with "the exact date and time is printed in the email that carries your code… check that email."
  That was a second wrong fact, not a fix. `expires_at_label` is a property of the `Bonus Code
  Issued` metric **our server** emits; a Klaviyo flow email renders against its **own** trigger
  metric, so the three discount templates cannot read it and the merge tag renders empty. They carry
  the hardcoded code string and no date. With no page showing it either, the entry was directing a
  customer with a 72-hour, one-per-lifetime grant to a place the answer does not exist. It now states
  that plainly, gives the safe rule ("use it within 72 hours of the email arriving"), offers
  `[contact us](/contact)`, and keeps the honest fallback below. A matching ACCOUNT SELF-SERVICE MAP
  bullet was added in `systemPrompt.ts` — with no lookup surface, "there is no page for this,
  escalate" is precisely what that map exists to say. **Its closing sentence is scoped
  to signed-in customers on purpose** (fix round 1): the dated refusal
  (`campaignCodeExpiredMessage`) is produced inside the `if (callerId)` branch of
  `CampaignCodeValidationService.validate()`, so a **guest** — which is exactly what the
  `checkout-start` / LOCKIN100 cohort is, since step-1 registration does not authenticate — falls
  through to `{ valid: true }` and never sees it. The copy must not promise an experience that
  cohort does not get; the underlying guest gap is pre-existing and tracked separately in
  [rewards-redeemables/gotchas.md](../rewards-redeemables/gotchas.md).
- **id 87** promised an expired unused code "can be re-issued to you later with a fresh deadline."
  Still true, but only outside the 30-day re-arm cooldown (`REARM_COOLDOWN_DAYS`) — inside it,
  qualifying again produces no code and no email at all. The answer now names the waiting period.

**The trap worth remembering: the guard was pinning the wrong fact.** `faqs.test.ts` did not merely
fail to catch the staleness — it contained
`assert.ok(bonusExpiry!.answer.includes("11:59pm Sydney time"), …)`, so correcting the copy made the
suite go **red**, and the lazy fix would have been to revert the copy. A content assertion that names
a specific business value has an expiry date of its own; when the value changes, the assertion is
part of the change, not an obstacle to it. It is now inverted — id 86 must contain `"72 hours"` and
must **not** contain `"11:59"` — so the old sentence cannot come back quietly.

Cobber answers only from grounded knowledge, so a stale entry here is not a gap, it is a confidently
wrong answer on a legally constrained topic — and a customer told "11:59pm" who redeems at 6pm on the
expiry day is refused by `campaignCodeExpiredMessage` naming a different time. Also note the two
things these entries deliberately do **not** say: "check your rewards wallet" and "check your email
for the date". No customer-reachable surface shows a bonus code or its deadline today, and no email
prints the deadline either — see
[rewards-redeemables/frontend.md](../rewards-redeemables/frontend.md). Re-ran
`npm run build:chat-knowledge-pack` then `npm run test:chat-faqs`.

**The same trap, one turn later.** The inverted guard (`"72 hours"` present, `"11:59"` absent) held —
and the sentence it let through was still false, because the guard pinned the *number* and nothing
pinned *where the customer is sent*. That is the general shape: a content assertion protects the fact
it names and gives no cover to the sentence beside it. `faqs.test.ts` now also asserts id 86 does not
**send the customer to their email for the deadline** (`!/check (that|your|the) email/i`), and that it
offers a support path (`/contact`) — so if a `Bonus Code Issued` flow is ever built and the copy should
change, the suite goes red and forces the decision instead of letting the two drift apart again.

**Know what that guard does and does not cover.** It pins the **directive**, not the claim. Copy saying
"the exact date and time is printed in the email that carries your code", with no "check that email",
would still pass. The wider ban on the substring `"printed in the email"` was tried first and went red
against the corrected copy, which legitimately says the date is **not** printed there — so the guard was
narrowed deliberately (the reason is recorded in the test's own comment beside the assertion). Do not
read it as a general ban on discussing the email.

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

## The $5,000 combo cash bonus was removed catalog-wide (2026-08-28, draw 10)

Draw 10 made every tool combination **tools only**. The **$10,000 cash-ONLY** option is untouched
and is now the only cash in the prize — when grepping, never conflate the two.

**Scale, so you know what a similar change costs:** 113 `$5,000/$5000` hits in
[prize-summaries.ts](../../src/config/prize-summaries.ts) and 86 in
[prizes.ts](../../src/config/prizes.ts). They took **six** distinct shapes, and a single
find/replace would have left most of them live:

| shape | where | count |
|---|---|---|
| `, $5000 cash` | `label` + `heroHeading` tails | 40 + 26 |
| ` plus $5000 cash.` | `heroSubheading` + `summary` tails | 40 + 30 |
| ` + $5,000 Cash` | `SHORT_PRIZE_LABELS` | 20 |
| `{ icon: "DollarSign", title: "$5000 Cash Bonus", … }` | `highlights` | 13 + 8 |
| `Plus $5000 cash.` / `Plus $5000 cold hard cash.` / `Plus, take home $5000 cold hard cash.` | `detailedDescription` tails | 3 + 8 + 7 |
| backtick template literals | 4 Ryobi `label`/`heroHeading` in prizes.ts | 4 |

Two traps worth remembering:

1. **`detailedDescription` is in `DEEP_ONLY_FIELDS`** (`prize-summaries.test.ts`), so
   `npm run test:prize-summaries` does **not** compare it across the two files. Eighteen stale
   sentences would have shipped green. Verify deep-only fields with a raw grep, not the test.
2. **Four entries used backticks, not double quotes.** A regex anchored on `"` silently skipped
   them. Anchor on the shape, then assert the remaining count is zero.

**`prizeValueLabel` still bakes in the old $5,000** (`$25,000+` / `$30,000+` / `$35,000+ Value`).
Left deliberately: every consumer today is **admin-only** (`MajorDrawManagement`, `DrawsTable`,
`DrawInspector`), so it is not a public claim — but it is one prop away from a customer surface
and it is the figure a permit filing derives from. Re-band it before it is ever rendered publicly.

## The FAQ guard test watches Cobber, not the public FAQ page (2026-08-27)

`src/data/__tests__/faqs.test.ts` bans stale phrases — `"paypal"`,
`"international shipping"`, `"3-5 business days"` — but it reads
`getSupportChatFaqEntries()` from `supportChatFaqs.ts`. **The public `/faq`
page renders `getFaqEntries()` from `faqs.ts`, which the test never sees.**

So the corpus the chatbot answers from was guarded while the page a customer
reads was not, and `faqs.ts` kept all three banned claims for as long as the
guard has existed. Entry `id: "3"` promised **express shipping at 1–2 business
days** (there is one flat rate — `SHOP_CONFIG` carries only
`flatShippingRateCents`, no express tier), **international shipping at 7–14
days** (the checkout address form accepts only the eight Australian states),
and an unsubstantiated 3–5 business day standard. It predated the shop.

Entry `id: "3"` is rewritten. **Still unguarded and still suspect:** entry
`id: "2"` claims PayPal and bank transfers, and entry `id: "4"` claims an order
can be modified or cancelled within an hour — neither verified against the
checkout.

**A guard that covers one of two copies of the same content is the dangerous
kind**: it reads as coverage. Pointing the existing ban list at
`getFaqEntries()` as well is the fix, once the remaining entries are corrected —
it will fail on `"paypal"` until then, which is the point.
