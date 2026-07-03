# Package terminology — "Additional" is backend-only; the frontend says "one-time packs"

**Rule (do not violate in user-facing copy):**

> The discounted member packs are a **backend/data concept only**. In any **user-facing** frontend
> text they are always called **"one-time packages" / "one-time packs"** — **never** "Additional
> packages", "Additional Packs", "member packs", or "member-exclusive packs".

## What the two names mean

- **Public one-time packs** — the standard ladder anyone can buy: `apprentice-pack`, `tradie-pack`,
  `foreman-pack`, `boss-pack`, `power-pack`, `vip-pack`.
- **Additional packs** (`additional-*-pack`, flagged `isAdditional: true`) — the **discounted**
  version of the same packs, shown to a user who has **additional-package access**
  (`hasAdditionalPackageAccess` = active subscription **OR** current-major-draw entries).

Both are **one-time purchases**. "Additional" is just how the data/code distinguishes the discounted
member variant (the `isAdditional` flag, the `additional-*` ids, `selectOneTimeDrawerPackages`,
`getAdditionalPackDiscount`). To the **user**, both are simply "one-time packages" — a member just
sees better prices (and the per-card "% off" coupon badge conveys the discount).

## Where the term is allowed vs. banned

| Context | "Additional" allowed? |
|---|---|
| Data ids (`additional-vip-pack`), the `isAdditional` flag, variable names, `console.log`, code comments, **these docs** | ✅ yes — it's the backend concept |
| Any **rendered UI string** the member reads (headings, eyebrows, card labels, modal titles, marketing benefit copy) | ❌ no — say "one-time packs" |

## Backing implementation

- Selection: [`selectOneTimeDrawerPackages`](../../src/utils/membership/additional-package-mapping.ts) —
  members-with-access get `isAdditional` packs; everyone else gets the public ladder. The control is
  [`MembershipSection`](../../src/components/sections/MembershipSection.tsx) (~L347-357).
- Dashboard opt-in: the account membership page passes
  `useMembershipCardCta({ includeAdditionalForMembers: true })` so members see their discounted packs;
  the section header still reads **"One-time packages"**
  ([`MembershipTierList`](../../src/components/sections/account-membership/MembershipTierList.tsx)).
- Discount badge: [`getAdditionalPackDiscount`](../../src/utils/membership/additional-pack-discount.ts)
  (only matches `additional-*` ids) drives the per-card "% off" coupon.

## History (so it isn't re-litigated)

- 2026-07-03: the tier-list one-time header briefly rendered "Additional packages / Member pricing"
  for members — reverted to always "One-time packages" per this rule. `PartnerBenefitsPromoSection`'s
  "Exclusive Additional Packs" benefit was likewise reworded to "Boosted One-Time Packs".
