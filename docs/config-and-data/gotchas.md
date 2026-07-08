# Config & Data — Gotchas

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
