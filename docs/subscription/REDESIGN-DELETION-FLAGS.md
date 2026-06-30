# `/membership` Redesign — Deletion Flags

Date: 2026-06-29 · Branch: `feature/membership-rewards-redesign`

The 2026-06 `/membership` rebuild **removed several sections from this page's composition but deleted nothing** — almost every old section is shared across the site. This note records what became a deletion candidate so it can be removed deliberately later (with the user's sign-off), not silently.

## 🚩 Deletion candidate (NOT deleted)

- **`src/components/sections/MembershipPackagesChart.tsx`** — before the rebuild it was used by `/membership` **and** `/my-account/membership`. After the rebuild it is used by **only `/my-account/membership`**. Once that page is also redesigned (or migrated off the chart), `MembershipPackagesChart` is fully orphaned and safe to delete. Verify usages before deleting:
  ```bash
  grep -rn "MembershipPackagesChart" src/
  ```

## Removed from `/membership` but KEPT (shared — do NOT delete)

Each is still imported by other pages; they were simply dropped from the new page's composition:

- **`MembershipSection`** — homepage, shop, rewards, mini-draws, FAQ, my-account, `SubscriptionProtected`, … (15+ files). Core purchase grid.
- **`UnlockDiscounts`** — `/my-account`, `/my-account/benefits`, `/promotions/[slug]`, `ToolsetLandingPage`.
- **`PartnerBenefitsPromoSection(Client)`** — FAQ, `/my-account/membership`, `/promotions/[slug]`.
- **`ElectricPackageCard`** — mini-draw packages, 3 modals, resubscribe (used by `MembershipSection` and others).

## Naturally replaced (no shared component)

- The old **inline hero JSX** inside `MembershipPageClient` was replaced by `MembershipHero` as part of the rewrite (not a shared file).
