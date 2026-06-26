# Config & Data — Gotchas

## FAQ renewal date is NOT a blanket "24th" (anchor-24 nuance)

`faqs.ts` entries 11 + 21 must NOT say "subscriptions renew on the 24th of each month" — that over-generalises. Per `docs/BILLING_ANCHOR_24.md`, **only members who join on the 25th/26th/27th are anchored to renew on the 24th**; everyone else renews on their own monthly billing date (their signup day-of-month), and past-due recoveries reanchor to the recovery date (clamped to the 24th). The accurate FAQ wording is "renews monthly on your own billing date; 25th–27th joiners are anchored to the 24th" and points members to My Account → Settings → Subscription for their exact date. Corrected 2026-06-25 (also propagated to the chat knowledge pack + systemPrompt).

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
